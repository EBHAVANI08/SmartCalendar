export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import {
  findDuplicate,
  mergeLists,
  normalizeEmail,
  normalizeEmployeeId,
  normalizeName,
  readList,
  validateFacultyRow,
  type FacultyRecord,
  type RowIssue,
} from '@/lib/faculty';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireCapability } from '@/lib/authz';

/**
 * Faculty bulk import.
 *
 * .xlsx/.xls are parsed with a real spreadsheet reader and .csv with a quoted
 * CSV parser — never by reading the bytes as text and splitting on commas,
 * which previously turned ZIP-compressed workbooks into faculty records whose
 * names were raw binary.
 *
 * Nothing is written unless every row validates. A partially-valid file is
 * rejected with a per-row report so the column mapping can be corrected.
 */

const COLUMN_ALIASES: Record<keyof ColumnMap, string[]> = {
  name: ['name', 'teacher name', 'faculty name', 'full name', 'teacher', 'employee name'],
  email: ['email', 'email address', 'e-mail', 'mail', 'official email'],
  employeeId: ['employee id', 'employeeid', 'emp id', 'empid', 'staff id', 'code', 'employee code'],
  phone: ['phone', 'mobile', 'contact', 'phone number', 'mobile number', 'contact number'],
  subjects: ['subject', 'subjects', 'subject(s)', 'subject taught', 'subjects taught', 'specialisation', 'specialization'],
  grades: ['grade', 'grades', 'grade(s)', 'class', 'classes', 'standard', 'std'],
  sections: ['section', 'sections', 'section(s)', 'division', 'divisions'],
};

interface ColumnMap {
  name: number;
  email: number;
  employeeId: number;
  phone: number;
  subjects: number;
  grades: number;
  sections: number;
}

const REQUIRED_COLUMNS: (keyof ColumnMap)[] = ['name', 'subjects'];

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function mapColumns(headerRow: unknown[]): { map: ColumnMap; unmapped: string[] } {
  const headers = headerRow.map(normalizeHeader);
  const map = {
    name: -1, email: -1, employeeId: -1, phone: -1, subjects: -1, grades: -1, sections: -1,
  } as ColumnMap;

  (Object.keys(COLUMN_ALIASES) as (keyof ColumnMap)[]).forEach((field) => {
    const index = headers.findIndex((h) => h && COLUMN_ALIASES[field].includes(h));
    if (index >= 0) map[field] = index;
  });

  const mapped = new Set(Object.values(map).filter((i) => i >= 0));
  const unmapped = headers.filter((h, i) => h && !mapped.has(i));
  return { map, unmapped };
}

/** RFC-4180-ish CSV: honours quoted fields containing commas and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim().length));
}

function extension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : '';
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    // `preview` validates and reports without writing anything.
    const previewOnly = String(formData.get('preview') ?? '').toLowerCase() === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    // ── Parse by actual format ──
    const ext = extension(file.name);
    let grid: unknown[][];

    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return NextResponse.json({ error: 'That workbook has no sheets.' }, { status: 400 });
      }
      grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        blankrows: false,
        defval: '',
        raw: false,
      }) as unknown[][];
    } else if (ext === 'csv' || ext === 'txt') {
      grid = parseCsv(await file.text());
    } else {
      return NextResponse.json(
        {
          error: `Unsupported file type ".${ext || 'unknown'}". Upload an Excel workbook (.xlsx, .xls) or a CSV file (.csv).`,
          code: 'UNSUPPORTED_FORMAT',
        },
        { status: 400 }
      );
    }

    if (grid.length < 2) {
      return NextResponse.json(
        { error: 'The file needs a header row and at least one faculty row.', code: 'EMPTY_FILE' },
        { status: 400 }
      );
    }

    // ── Validate the header before touching any data row ──
    const { map, unmapped } = mapColumns(grid[0]);
    const missing = REQUIRED_COLUMNS.filter((field) => map[field] < 0);
    if (missing.length) {
      return NextResponse.json(
        {
          error: `The file is missing required column(s): ${missing.join(', ')}.`,
          code: 'HEADER_INVALID',
          expectedColumns: Object.fromEntries(
            (Object.keys(COLUMN_ALIASES) as (keyof ColumnMap)[]).map((f) => [f, COLUMN_ALIASES[f][0]])
          ),
          foundColumns: grid[0].map((h) => String(h ?? '')),
          unmappedColumns: unmapped,
        },
        { status: 400 }
      );
    }

    // ── Validate every row ──
    const cell = (row: unknown[], index: number) => (index >= 0 ? row[index] : '');
    const issues: RowIssue[] = [];
    const valid: { record: FacultyRecord; row: number }[] = [];

    const seenEmail = new Map<string, number>();
    const seenEmployeeId = new Map<string, number>();
    const seenName = new Map<string, number>();

    for (let i = 1; i < grid.length; i++) {
      const raw = grid[i];
      const rowNumber = i + 1; // 1-based, matching the spreadsheet

      const result = validateFacultyRow(
        {
          name: cell(raw, map.name),
          email: cell(raw, map.email),
          employeeId: cell(raw, map.employeeId),
          phone: cell(raw, map.phone),
          subjects: cell(raw, map.subjects),
          grades: cell(raw, map.grades),
          sections: cell(raw, map.sections),
        },
        rowNumber
      );

      if (!result.ok || !result.record) {
        issues.push(...result.issues);
        continue;
      }

      // Duplicates within the file itself.
      const record = result.record;
      const dupeOf = (map2: Map<string, number>, key: string | null) =>
        key ? map2.get(key) : undefined;

      const emailDupe = dupeOf(seenEmail, record.email);
      const idDupe = dupeOf(seenEmployeeId, record.employeeId);
      const nameDupe = dupeOf(seenName, normalizeName(record.name));

      if (idDupe) {
        issues.push({ row: rowNumber, field: 'employeeId', code: 'DUPLICATE_IN_FILE', message: `Employee ID "${record.employeeId}" also appears on row ${idDupe}.`, value: record.employeeId ?? undefined });
        continue;
      }
      if (emailDupe) {
        issues.push({ row: rowNumber, field: 'email', code: 'DUPLICATE_IN_FILE', message: `Email "${record.email}" also appears on row ${emailDupe}.`, value: record.email ?? undefined });
        continue;
      }
      if (nameDupe) {
        issues.push({ row: rowNumber, field: 'name', code: 'DUPLICATE_IN_FILE', message: `"${record.name}" also appears on row ${nameDupe}. One teacher should be a single row listing all their subjects and grades.`, value: record.name });
        continue;
      }

      if (record.email) seenEmail.set(record.email, rowNumber);
      if (record.employeeId) seenEmployeeId.set(record.employeeId, rowNumber);
      seenName.set(normalizeName(record.name), rowNumber);
      valid.push({ record, row: rowNumber });
    }

    // ── Match against faculty already in this school ──
    const existing = await db.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true, email: true, employeeId: true, subject: true, subjects: true, grades: true, sections: true },
    });

    const toCreate: { record: FacultyRecord; row: number }[] = [];
    const toUpdate: { record: FacultyRecord; row: number; existingId: string; existingName: string; matchedOn: string }[] = [];

    for (const item of valid) {
      const match = findDuplicate(item.record, existing);
      if (match) {
        toUpdate.push({ ...item, existingId: match.id, existingName: match.name, matchedOn: match.matchedOn });
      } else {
        toCreate.push(item);
      }
    }

    // A file with any invalid row is rejected outright — no partial writes.
    if (issues.length) {
      return NextResponse.json(
        {
          error: `Import stopped: ${issues.length} problem(s) found in ${new Set(issues.map((i) => i.row)).size} row(s). Nothing was saved.`,
          code: 'VALIDATION_FAILED',
          issues: issues.slice(0, 100),
          totalIssues: issues.length,
          validRows: valid.length,
          wouldCreate: toCreate.length,
          wouldUpdate: toUpdate.length,
        },
        { status: 422 }
      );
    }

    const summary = {
      totalRows: grid.length - 1,
      willCreate: toCreate.length,
      willUpdate: toUpdate.length,
      updates: toUpdate.map((u) => ({
        row: u.row,
        name: u.record.name,
        matchesExisting: u.existingName,
        matchedOn: u.matchedOn,
      })),
      creates: toCreate.map((c) => ({
        row: c.row,
        name: c.record.name,
        email: c.record.email,
        subjects: c.record.subjects,
        grades: c.record.grades,
      })),
    };

    if (previewOnly) {
      return NextResponse.json({ success: true, preview: true, ...summary });
    }

    // ── Write ──
    let created = 0;
    let updated = 0;

    for (const item of toCreate) {
      const { record } = item;
      // A login email is required by the schema; derive a stable one only when
      // the file genuinely has no email, and never from a misread column.
      const email =
        record.email ||
        `${normalizeName(record.name).replace(/\s+/g, '.')}.${Date.now().toString(36)}@faculty.local`;

      await db.teacher.create({
        data: {
          schoolId,
          name: record.name,
          email,
          employeeId: record.employeeId,
          phone: record.phone || '',
          subject: record.subjects[0],
          subjects: JSON.stringify(record.subjects),
          grades: JSON.stringify(record.grades),
          sections: JSON.stringify(record.sections),
          role: 'teacher',
        },
      });
      created++;
    }

    for (const item of toUpdate) {
      const current = existing.find((e) => e.id === item.existingId);
      if (!current) continue;
      // One teacher, one record: merge the new subjects/grades in rather than
      // creating a second row for the same person.
      const subjects = mergeLists(
        readList(current.subjects ?? current.subject),
        item.record.subjects
      );
      const grades = mergeLists(readList(current.grades), item.record.grades);
      const sections = mergeLists(readList(current.sections), item.record.sections);

      await db.teacher.update({
        where: { id: item.existingId },
        data: {
          name: item.record.name || current.name,
          employeeId: item.record.employeeId ?? current.employeeId,
          ...(item.record.phone ? { phone: item.record.phone } : {}),
          subject: subjects[0] ?? current.subject,
          subjects: JSON.stringify(subjects),
          grades: JSON.stringify(grades),
          sections: JSON.stringify(sections),
        },
      });
      updated++;
    }

    return NextResponse.json({
      success: true,
      message: `Imported ${created} new faculty member(s) and updated ${updated} existing profile(s) with additional subjects/grades.`,
      teachersCreated: created,
      teachersUpdated: updated,
      ...summary,
    });
  } catch (error) {
    console.error('Error bulk uploading teachers:', error);
    return NextResponse.json(
      { error: `Failed to process bulk upload: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
