import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AllotmentRow = { employeeId: string; name: string; email: string; subject: string; grades: string[] };
type MatrixAllotment = { grade: string; section: string; subject: string; teacherName: string };
const keyText = (input: unknown) => String(input ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = {
  name: ['teacher name', 'teacher', 'faculty name', 'faculty', 'staff name', 'employee name', 'educator name', 'instructor', 'lecturer', 'name of teacher', 'teachername'],
  employeeId: ['employee id', 'employee code', 'emp id', 'emp code', 'staff no', 'staff number', 'staff id', 'teacher id', 'faculty id', 'faculty code', 'code'],
  subject: ['primary subject', 'subject', 'handles subject', 'subject handled', 'teaching subject', 'specialization', 'department', 'subject name', 'subjects'],
  grades: ['eligible grades', 'grades', 'grade', 'classes', 'class', 'class assigned', 'teaching classes', 'standard', 'standards', 'year group', 'grade levels'],
  email: ['email', 'email address', 'mail id', 'e mail', 'official email', 'teacher email'],
};
const matches = (candidate: string, names: string[]) => names.some((name) => candidate === name || candidate.includes(name) || name.includes(candidate));
const kannadaDigits: Record<string, string> = { '೦': '0', '೧': '1', '೨': '2', '೩': '3', '೪': '4', '೫': '5', '೬': '6', '೭': '7', '೮': '8', '೯': '9' };
const numberWords: Record<string, number> = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9, ten: 10, tenth: 10, eleven: 11, eleventh: 11, twelve: 12, twelfth: 12 };
const kannadaNumberWords: Record<string, number> = { 'ಒಂದು': 1, 'ಮೊದಲ': 1, 'ಎರಡು': 2, 'ಎರಡನೇ': 2, 'ಮೂರು': 3, 'ಮೂರನೇ': 3, 'ನಾಲ್ಕು': 4, 'ನಾಲ್ಕನೇ': 4, 'ಐದು': 5, 'ಐದನೇ': 5, 'ಆರು': 6, 'ಆರನೇ': 6, 'ಏಳು': 7, 'ಏಳನೇ': 7, 'ಎಂಟು': 8, 'ಎಂಟನೇ': 8, 'ಒಂಬತ್ತು': 9, 'ಒಂಬತ್ತನೇ': 9, 'ಹತ್ತು': 10, 'ಹತ್ತನೇ': 10, 'ಹನ್ನೊಂದು': 11, 'ಹನ್ನೊಂದನೇ': 11, 'ಹನ್ನೆರಡು': 12, 'ಹನ್ನೆರಡನೇ': 12 };
const romanValue = (token: string) => {
  if (!/^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/i.test(token)) return null;
  const values: Record<string, number> = { I: 1, V: 5, X: 10 }; let total = 0; const upper = token.toUpperCase();
  for (let index = 0; index < upper.length; index++) total += (values[upper[index]] || 0) < (values[upper[index + 1]] || 0) ? -(values[upper[index]] || 0) : values[upper[index]] || 0;
  return total;
};
const gradeNumbers = (input: string) => {
  const converted = input.replace(/[೦-೯]/g, (digit) => kannadaDigits[digit]).replace(/[–—]/g, '-').toLowerCase();
  const tokens = converted.match(/\d{1,2}|\p{L}+/gu) || []; const found: number[] = [];
  for (const token of tokens) {
    const numeric = /^\d+$/.test(token) ? Number(token) : numberWords[token] ?? kannadaNumberWords[token] ?? romanValue(token);
    if (numeric && numeric >= 1 && numeric <= 12 && !found.includes(numeric)) found.push(numeric);
  }
  const isRange = /\s(?:to|through)\s|[-]/.test(converted);
  if (isRange && found.length === 2 && found[0] < found[1]) return Array.from({ length: found[1] - found[0] + 1 }, (_, index) => found[0] + index);
  return found;
};
const value = (row: Record<string, unknown>, names: string[]) => {
  const key = Object.keys(row).find((candidate) => matches(keyText(candidate), names));
  return String(key ? row[key] ?? '' : '').trim();
};
const normalize = (row: Record<string, unknown>, index: number): AllotmentRow => {
  const values = Object.values(row).map((cell) => String(cell ?? '').trim()).filter(Boolean);
  const suppliedEmail = value(row, aliases.email) || values.find((cell) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell)) || '';
  const employeeId = value(row, aliases.employeeId) || `IMPORT-${index + 1}`;
  let name = value(row, aliases.name);
  let subject = value(row, aliases.subject);
  let gradeText = value(row, aliases.grades);
  if (!name) name = values.find((cell) => /^[a-z][a-z .'-]{2,}$/i.test(cell) && !/grade|class|subject|department/i.test(cell) && cell !== suppliedEmail) || '';
  if (!gradeText) gradeText = values.find((cell) => /(?:grade|class|std|standard)|[೦-೯]|(?:ಒಂದು|ಎರಡು|ಮೂರು|ನಾಲ್ಕು|ಐದು|ಆರು|ಏಳು|ಎಂಟು|ಒಂಬತ್ತು|ಹತ್ತು|ಹನ್ನೊಂದು|ಹನ್ನೆರಡು)|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\b/i.test(cell)) || '';
  if (!subject) subject = values.find((cell) => cell !== name && cell !== suppliedEmail && cell !== gradeText && !/^\d+$/.test(cell) && !/^(mr|mrs|ms|dr)\.?$/i.test(cell)) || '';
  const grades = gradeNumbers(gradeText).map((grade) => `Grade ${grade}`);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || employeeId.toLowerCase();
  return { employeeId, name, subject, grades, email: suppliedEmail || `${slug}.${employeeId.toLowerCase()}@imported.smartcalendar` };
};

async function extract(file: File) {
  if (file.name.toLowerCase().endsWith('.pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(await file.arrayBuffer()) });
    try {
      const result = await parser.getText();
      const lines = result.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const headerIndex = lines.findIndex((line) => /teacher|faculty/i.test(line) && /subject/i.test(line));
      if (headerIndex < 0) throw new Error('PDF_HEADER');
      const split = (line: string) => line.split(/\s*\|\s*|\t+|\s{2,}/).map((cell) => cell.trim());
      const headers = split(lines[headerIndex]);
      return lines.slice(headerIndex + 1).map(split).filter((cells) => cells.length >= 2).map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[i] || ''])));
    } finally { await parser.destroy(); }
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const preferredName = workbook.SheetNames.find((name) => /teacher|faculty|staff|allot/i.test(name)) || workbook.SheetNames[0];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[preferredName], { header: 1, defval: '', raw: false });
  const allAliases = Object.values(aliases).flat();
  let headerIndex = matrix.findIndex((row) => row.filter((cell) => matches(keyText(cell), allAliases)).length >= 2);
  if (headerIndex < 0) headerIndex = matrix.findIndex((row) => row.filter((cell) => String(cell).trim()).length >= 2);
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map((cell, index) => String(cell).trim() || `Column ${index + 1}`);
  return matrix.slice(headerIndex + 1)
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData(); const file = form.get('file'); const schoolId = String(form.get('schoolId') || ''); const commit = form.get('commit') === 'true';
    if (!(file instanceof File) || !schoolId) return NextResponse.json({ error: 'File and schoolId are required.' }, { status: 400 });
    if (!/\.(xlsx|xls|pdf)$/i.test(file.name)) return NextResponse.json({ error: 'Upload an Excel (.xlsx/.xls) or text-based PDF file.' }, { status: 415 });
    const raw = await extract(file);
    const matrixLayout = raw.some((row) => value(row, aliases.grades) && value(row, ['section', 'sec', 'division']));
    const matrixAllotments: MatrixAllotment[] = [];
    let rows: AllotmentRow[];
    if (matrixLayout) {
      const teacherRows = new Map<string, AllotmentRow>();
      raw.forEach((row, rowIndex) => {
        const gradeNumber = gradeNumbers(value(row, aliases.grades))[0]; const section = value(row, ['section', 'sec', 'division']);
        if (!gradeNumber || !section) return;
        for (const [column, cell] of Object.entries(row)) {
          if (matches(keyText(column), [...aliases.grades, 'section', 'sec', 'division', ...aliases.employeeId])) continue;
          const teacherName = String(cell ?? '').trim(); if (!teacherName || /^(no|n\/a|-|none)$/i.test(teacherName)) continue;
          const subject = column.trim(); const key = teacherName.toLowerCase(); const existing = teacherRows.get(key);
          if (existing) { if (!existing.grades.includes(`Grade ${gradeNumber}`)) existing.grades.push(`Grade ${gradeNumber}`); }
          else { const slug = teacherName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''); teacherRows.set(key, { employeeId: `MATRIX-${teacherRows.size + 1}`, name: teacherName, email: `${slug || `teacher.${rowIndex + 1}`}@imported.smartcalendar`, subject, grades: [`Grade ${gradeNumber}`] }); }
          matrixAllotments.push({ grade: `Grade ${gradeNumber}`, section, subject, teacherName });
        }
      });
      rows = [...teacherRows.values()];
    } else rows = raw.map(normalize);
    const issues = rows.flatMap((row, index) => [
      ...(!row.name ? [{ row: index + 2, field: 'Teacher Name', message: 'Teacher name is required.' }] : []),
      ...(!row.subject ? [{ row: index + 2, field: 'Subject', message: 'Primary subject is required.' }] : []),
      ...(!row.grades.length ? [{ row: index + 2, field: 'Grades', message: 'At least one eligible grade is required.' }] : []),
    ]);
    if (!commit || issues.length) return NextResponse.json({ success: true, layout: matrixLayout ? 'grade-section-matrix' : 'teacher-roster', rows, issues, blocking: issues.length > 0, classesDetected: new Set(matrixAllotments.map((x) => `${x.grade}|${x.section}`)).size, allotmentsDetected: matrixAllotments.length, summary: { detected: rows.length, valid: rows.length - new Set(issues.map((x) => x.row)).size, errors: issues.length } });
    const result = await db.$transaction(async (tx) => {
      const teachers: { id: string; name: string; subject: string; grades: string }[] = [];
      for (const row of rows) teachers.push(await tx.teacher.upsert({ where: { email: row.email.toLowerCase() }, update: { name: row.name, subject: row.subject, grades: JSON.stringify(row.grades), schoolId }, create: { name: row.name, email: row.email.toLowerCase(), subject: row.subject, grades: JSON.stringify(row.grades), schoolId, availability: '[]' } }));
      if (matrixLayout && matrixAllotments.length) {
        const classes = [...new Set(matrixAllotments.map((item) => `${item.grade}|${item.section}`))];
        await tx.schedule.deleteMany({ where: { schoolId, OR: classes.map((item) => { const [grade, section] = item.split('|'); return { grade, section }; }) } });
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; const times = [['09:30','10:19'],['10:19','11:08'],['11:23','12:12'],['12:12','13:01'],['13:46','14:35'],['14:35','15:24'],['15:24','16:12'],['16:12','17:00']];
        const occupied = new Set<string>(); let generated = 0; let unallocated = 0;
        const usedClassSubjectDay = new Set<string>();
        const teacherDayLoad = new Map<string, number>();
        const fullDayFor = (teacherId: string) => days[Math.abs([...teacherId].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 5];
        const dailyLimit = (teacherId: string, day: string) => day === 'Saturday' ? 4 : day === fullDayFor(teacherId) ? 8 : 5;
        const scheduleData: { schoolId: string; grade: string; section: string; day: string; period: number; subject: string; teacherId: string | null; roomId: string; startTime: string; endTime: string; topic: string }[] = [];
        for (const classKey of classes) {
          const [grade, section] = classKey.split('|'); const choices = matrixAllotments.filter((item) => item.grade === grade && item.section === section);
          for (const day of days) for (let period = 1; period <= (day === 'Saturday' ? 4 : 8); period++) {
            let selected: MatrixAllotment | undefined;
            for (let offset = 0; offset < choices.length; offset++) { const candidate = choices[(period - 1 + days.indexOf(day) + offset) % choices.length]; const teacher = teachers.find((item) => item.name.toLowerCase() === candidate.teacherName.toLowerCase()); const subjectDayKey = `${grade}|${section}|${day}|${candidate.subject.toLowerCase()}`; if (teacher && !usedClassSubjectDay.has(subjectDayKey) && !occupied.has(`${teacher.id}|${day}|${period}`) && (teacherDayLoad.get(`${teacher.id}|${day}`) || 0) < dailyLimit(teacher.id, day)) { selected = candidate; break; } }
            const teacher = selected ? teachers.find((item) => item.name.toLowerCase() === selected!.teacherName.toLowerCase()) : undefined;
            if (!teacher || !selected) { unallocated++; continue; }
            scheduleData.push({ schoolId, grade, section, day, period, subject: selected.subject, teacherId: teacher.id, roomId: `Room-${grade.replace(/\D/g, '')}-${section}`, startTime: times[period - 1][0], endTime: times[period - 1][1], topic: `${selected.subject} - Scheduled` });
            occupied.add(`${teacher.id}|${day}|${period}`); usedClassSubjectDay.add(`${grade}|${section}|${day}|${selected.subject.toLowerCase()}`); const loadKey = `${teacher.id}|${day}`; teacherDayLoad.set(loadKey, (teacherDayLoad.get(loadKey) || 0) + 1); generated++;
          }
        }
        const inserted = await tx.schedule.createMany({ data: scheduleData });
        const skipped = scheduleData.length - inserted.count;
        return { imported: teachers.length, allotted: Math.max(0, generated - skipped), unallotted: unallocated + skipped, classesCreated: classes.length, layout: 'grade-section-matrix' };
      }
      const schedules = await tx.schedule.findMany({ where: { schoolId, teacherId: null }, orderBy: [{ day: 'asc' }, { period: 'asc' }] });
      const occupied = new Set((await tx.schedule.findMany({ where: { schoolId, teacherId: { not: null } }, select: { teacherId: true, day: true, period: true } })).map((s) => `${s.teacherId}|${s.day}|${s.period}`));
      let allotted = 0;
      for (const schedule of schedules) {
        const teacher = teachers.find((candidate) => candidate.subject.toLowerCase() === schedule.subject.toLowerCase() && (JSON.parse(candidate.grades) as string[]).includes(schedule.grade) && !occupied.has(`${candidate.id}|${schedule.day}|${schedule.period}`));
        if (teacher) { await tx.schedule.update({ where: { id: schedule.id }, data: { teacherId: teacher.id } }); occupied.add(`${teacher.id}|${schedule.day}|${schedule.period}`); allotted++; }
      }
      return { imported: teachers.length, allotted, unallotted: schedules.length - allotted };
    }, { maxWait: 20_000, timeout: 180_000 });
    return NextResponse.json({ success: true, committed: true, ...result });
  } catch (error) {
    console.error('Teacher allotment import failed:', error);
    const message = String(error);
    const databaseUnavailable = /Can't reach database server|PrismaClientInitializationError|ECONNREFUSED|ENOTFOUND/i.test(message);
    const errorMessage = message.includes('PDF_HEADER') ? 'Could not find a Teacher and Subject table in this PDF.' : databaseUnavailable ? 'The file is valid, but the database is currently unavailable. Nothing was imported. Restore the Neon DATABASE_URL connection, then click Import Teachers & Auto-Allot Timetable again.' : message.includes('P2028') || message.includes('Transaction') ? 'The database timed out while processing this large allotment. Please retry; the extended import transaction is enabled.' : message.includes('Unique constraint') ? 'A timetable slot already exists for another school with the same grade, section, day and period. The timetable tenant constraint needs migration.' : `Could not process the uploaded allotment file: ${error instanceof Error ? error.message : 'unknown server error'}`;
    return NextResponse.json({ error: errorMessage, code: databaseUnavailable ? 'DATABASE_UNAVAILABLE' : 'IMPORT_FAILED', previewWasValid: true }, { status: databaseUnavailable ? 503 : 400 });
  }
}
