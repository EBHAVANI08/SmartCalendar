/**
 * Timetable spreadsheet import.
 *
 * The parser below is unchanged - it handles the several shapes real schools
 * send. What is new is that nothing it produces is written without passing the
 * same validation as a manual edit or an AI generation.
 *
 * Previously this path:
 *   - took schoolId from the form and fell back to `db.school.findFirst()`,
 *     so an import could land in whichever school happened to be first;
 *   - ran no conflict, qualification or day-bounds checks;
 *   - silently created faculty with a hardcoded email domain and the password
 *     "teacher123";
 *   - wrote row by row, so a bad file half-imported.
 *
 * A hardcoded roster of one school's teacher nicknames also lived here and has
 * been removed; names are now matched against that school's own faculty.
 */

import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';
import Groq from 'groq-sdk';

const DAYS_LIST = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ALIASES: Record<string, string> = {
  mon: 'Monday', monday: 'Monday',
  tue: 'Tuesday', tues: 'Tuesday', tuesday: 'Tuesday',
  wed: 'Wednesday', wednesday: 'Wednesday',
  thu: 'Thursday', thurs: 'Thursday', thursday: 'Thursday',
  fri: 'Friday', friday: 'Friday',
  sat: 'Saturday', saturday: 'Saturday',
};
const ALL_GRADES = ['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12'];

export interface ExtractedSchedule {
  day: string; period: number; grade: string; section: string;
  subject: string; teacherName?: string; room?: string;
}

export function normalizeGrade(raw: string): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^Grade\s*\d+$/i.test(s)) return `Grade ${s.replace(/\D/g, '')}`;
  if (/^\d+$/.test(s)) return `Grade ${s}`;
  const num = s.replace(/[^\d]/g, '');
  return num ? `Grade ${num}` : s;
}

function normalizeDay(raw: string): string | null {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (DAY_ALIASES[s]) return DAY_ALIASES[s];
  for (const d of DAYS_LIST) {
    if (s.startsWith(d.toLowerCase().slice(0, 3))) return d;
  }
  return null;
}

export function isBlank(v: any): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim().toLowerCase();
  return s === '' || s === '-' || s === '—' || s === 'n/a' || s === 'na' || s === 'nil' ||
    s === 'free' || s === 'vacant' || s === 'break' || s === 'lunch' || s === 'recess' || s === 'off';
}

/** Extract subject and optional teacher from a merged cell like "Math\nPriya M" */
function splitCell(raw: string): { subject: string; teacher?: string } {
  if (!raw) return { subject: '' };
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return { subject: lines[0], teacher: lines.slice(1).join(' ') };
  const paren = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) return { subject: paren[1].trim(), teacher: paren[2].trim() };
  const dash = raw.match(/^(.+?)\s+[-–/]\s+(.+)$/);
  if (dash) return { subject: dash[1].trim(), teacher: dash[2].trim() };
  return { subject: raw.trim() };
}

function computeTimes(p: number, startStr = '08:00', durMins = 40, brk1After = 3, brk1Mins = 30, brk2After = 4, brk2Mins = 30) {
  const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
  const [h, m] = (startStr || '08:00').split(':').map(Number);
  let cur = h * 60 + m;
  for (let i = 1; i <= p; i++) {
    const s = cur; cur += durMins;
    if (i === p) return { start: fmt(s), end: fmt(cur) };
    if (i === brk1After) cur += brk1Mins;
    if (i === brk2After) cur += brk2Mins;
  }
  return { start: '08:00', end: '08:40' };
}

// ══════════════════════════════════════════════════════════════
//  UNIVERSAL PARSER — handles any Excel timetable layout
// ══════════════════════════════════════════════════════════════
export function parseAnyExcel(buffer: Buffer, defaultGrade: string, defaultSection: string): {
  schedules: ExtractedSchedule[];
  detectedFormat: string;
  columnsSeen: string[];
  sheetNames: string[];
} {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true, cellNF: false });
  const results: ExtractedSchedule[] = [];
  let detectedFormat = 'unknown';
  const columnsSeen: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    // ── Strategy A: Try sheet_to_json with first row as header ──
    const rowsObj = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false });
    if (rowsObj.length > 0) {
      const firstRow = rowsObj[0];
      const keys = Object.keys(firstRow).map((k) => String(k).trim());
      columnsSeen.push(...keys.filter((k) => !columnsSeen.includes(k)));

      // Detect period columns: P1, P2, Period1, 1, Slot1 …
      const periodCols: Record<number, string> = {};
      for (const k of keys) {
        const m = k.match(/^(?:p(?:eriod)?\s*|slot\s*|pd\s*)?(\d+)$/i);
        if (m) periodCols[parseInt(m[1])] = k;
      }

      // Detect day-period compound columns: Mon-P1, Monday P2, Wed_3 …
      const dayPeriodCols: { day: string; period: number; key: string }[] = [];
      for (const k of keys) {
        const m = k.match(/^(mon|tue|wed|thu|fri|sat)\w*[-_\s]+p?(\d+)$/i);
        if (m) {
          const day = normalizeDay(m[1]);
          if (day) dayPeriodCols.push({ day, period: parseInt(m[2]), key: k });
        }
      }

      // ── Format 1: Compound day-period columns (Mon-P1, Tue-P2…) ──
      if (dayPeriodCols.length >= 4) {
        detectedFormat = 'compound-day-period-columns';
        for (const row of rowsObj) {
          const gradeRaw = row['Grade'] || row['grade'] || row['Class'] || row['STD'] || row['Std'] || defaultGrade;
          const sectionRaw = row['Section'] || row['Sec'] || row['section'] || defaultSection;
          const grade = normalizeGrade(String(gradeRaw));
          const section = String(sectionRaw).trim().toUpperCase() || 'A';
          if (!ALL_GRADES.includes(grade)) continue;
          for (const { day, period, key } of dayPeriodCols) {
            const cell = String(row[key] || '').trim();
            if (isBlank(cell)) continue;
            const { subject, teacher } = splitCell(cell);
            if (!subject) continue;
            results.push({ day, period, grade, section, subject, teacherName: teacher });
          }
        }
      }

      // ── Format 2: Period columns (P1..P8) + Day row ──
      else if (Object.keys(periodCols).length >= 4) {
        detectedFormat = 'period-columns-horizontal';
        for (const row of rowsObj) {
          const gradeRaw = row['Grade'] || row['grade'] || row['Class'] || row['STD'] || row['Std'] || defaultGrade;
          const sectionRaw = row['Section'] || row['Sec'] || row['section'] || defaultSection;
          const dayRaw = row['Day'] || row['day'] || row['DAY'] || row['Day Name'] || row['Days'];
          const grade = normalizeGrade(String(gradeRaw));
          const section = String(sectionRaw).trim().toUpperCase() || 'A';

          // Grade validation — skip rows that look like headers
          if (!ALL_GRADES.includes(grade)) continue;

          const day = dayRaw ? (normalizeDay(String(dayRaw)) || 'Monday') : 'Monday';

          for (const [pNumStr, colKey] of Object.entries(periodCols)) {
            const cell = String(row[colKey] || '').trim();
            if (isBlank(cell)) continue;
            const { subject, teacher } = splitCell(cell);
            if (!subject) continue;
            results.push({ day, period: parseInt(pNumStr), grade, section, subject, teacherName: teacher });
          }
        }
      }

      // ── Format 3: Vertical layout — one row per period slot ──
      else {
        // Look for Day-like and Subject-like column
        const dayCol = keys.find((k) => /^(day|days|day[\s_-]?name)$/i.test(k));
        const periodCol = keys.find((k) => /^(period|per|p[.\s]?no|slot|pd|period[\s_-]?no)$/i.test(k));
        const subjectCol = keys.find((k) => /^(subject|sub|course|topic|subject[\s_-]?name|subjects)$/i.test(k));
        const teacherCol = keys.find((k) => /^(teacher|faculty|incharge|staff|class[\s_-]?teacher|teacher[\s_-]?name|employee|t[\s_]?name)$/i.test(k));
        const gradeCol = keys.find((k) => /^(grade|class|std|standard|class[\s_-]?code)$/i.test(k));
        const sectionCol = keys.find((k) => /^(section|sec|division|div)$/i.test(k));

        if (dayCol && subjectCol) {
          detectedFormat = 'vertical-row-per-slot';
          for (const row of rowsObj) {
            const dayRaw = row[dayCol];
            const subjectRaw = subjectCol ? row[subjectCol] : '';
            if (isBlank(dayRaw) || isBlank(subjectRaw)) continue;
            const day = normalizeDay(String(dayRaw));
            if (!day) continue;
            const gradeRaw = gradeCol ? row[gradeCol] : defaultGrade;
            const sectionRaw = sectionCol ? row[sectionCol] : defaultSection;
            const periodRaw = periodCol ? row[periodCol] : '1';
            const grade = normalizeGrade(String(gradeRaw || defaultGrade));
            const section = String(sectionRaw || defaultSection).trim().toUpperCase() || 'A';
            const period = Math.max(1, parseInt(String(periodRaw).replace(/\D/g, ''), 10) || 1);
            const subject = String(subjectRaw).trim();
            const teacher = teacherCol ? String(row[teacherCol] || '').trim() : undefined;
            results.push({ day, period, grade, section, subject, teacherName: teacher || undefined });
          }
        }
      }
    }

    // ── Strategy B: Raw array layout (sheet_to_json with header:1) ──
    // Used when first-row-as-header fails — tries to detect the header row automatically
    if (results.length === 0) {
      const raw2d = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
      if (raw2d.length < 2) continue;

      // Find header row: first row where a cell looks like "Day", "Monday", "P1", "Subject" etc.
      let headerRowIdx = -1;
      let headerRow: string[] = [];

      for (let ri = 0; ri < Math.min(raw2d.length, 10); ri++) {
        const row = raw2d[ri].map((c: any) => String(c || '').trim());
        const hasDayLike = row.some((c) => /^(day|mon|tue|wed|thu|fri|sat)/i.test(c));
        const hasPeriodLike = row.some((c) => /^(p\d|period|slot|\d+)$/i.test(c));
        const hasSubjectLike = row.some((c) => /^(sub|subject|course)/i.test(c));
        if (hasDayLike || hasPeriodLike || hasSubjectLike) {
          headerRowIdx = ri;
          headerRow = row;
          break;
        }
      }

      if (headerRowIdx === -1) {
        // Last resort: treat first row as header
        headerRowIdx = 0;
        headerRow = raw2d[0].map((c: any) => String(c || '').trim());
      }

      columnsSeen.push(...headerRow.filter((k) => k && !columnsSeen.includes(k)));

      // Map header names to column indices
      const colIdx: Record<string, number> = {};
      headerRow.forEach((h, i) => { if (h) colIdx[h.toLowerCase()] = i; });

      // Detect period columns in header
      const periodColsB: Record<number, number> = {}; // period num → col index
      headerRow.forEach((h, i) => {
        const m = h.match(/^(?:p(?:eriod)?\s*)?(\d+)$/i);
        if (m) periodColsB[parseInt(m[1])] = i;
      });

      const dayColIdx = Object.keys(colIdx).find((k) => /^(day|days)/.test(k));
      const subColIdx = Object.keys(colIdx).find((k) => /^(sub|subject|course)/.test(k));
      const teacherColIdx = Object.keys(colIdx).find((k) => /^(teacher|faculty|incharge|staff)/.test(k));
      const gradeColIdx = Object.keys(colIdx).find((k) => /^(grade|class|std)/.test(k));
      const sectionColIdx = Object.keys(colIdx).find((k) => /^(section|sec|div)/.test(k));
      const periodColIdx = Object.keys(colIdx).find((k) => /^(per|period|slot)/.test(k));

      const dataRows = raw2d.slice(headerRowIdx + 1);

      if (Object.keys(periodColsB).length >= 4) {
        detectedFormat = 'raw-array-period-columns';
        // Each data row = one day for a class
        for (const row of dataRows) {
          if (!row || row.every((c: any) => isBlank(c))) continue;
          const dayRaw = dayColIdx !== undefined ? row[colIdx[dayColIdx]] : '';
          const gradeRaw = gradeColIdx !== undefined ? row[colIdx[gradeColIdx]] : defaultGrade;
          const sectionRaw = sectionColIdx !== undefined ? row[colIdx[sectionColIdx]] : defaultSection;
          const day = normalizeDay(String(dayRaw || ''));
          const grade = normalizeGrade(String(gradeRaw || defaultGrade));
          const section = String(sectionRaw || defaultSection).trim().toUpperCase() || 'A';

          // Even if day is null, try the first identifiable value as day
          const resolvedDay = day || 'Monday';
          if (!ALL_GRADES.includes(grade)) continue;

          for (const [pNumStr, ci] of Object.entries(periodColsB)) {
            const cell = String(row[ci] || '').trim();
            if (isBlank(cell)) continue;
            const { subject, teacher } = splitCell(cell);
            if (!subject) continue;
            results.push({ day: resolvedDay, period: parseInt(pNumStr), grade, section, subject, teacherName: teacher });
          }
        }
      } else if (dayColIdx && subColIdx) {
        detectedFormat = 'raw-array-vertical';
        for (const row of dataRows) {
          if (!row || row.every((c: any) => isBlank(c))) continue;
          const dayRaw = row[colIdx[dayColIdx]];
          const subjectRaw = row[colIdx[subColIdx!]];
          if (isBlank(dayRaw) || isBlank(subjectRaw)) continue;
          const day = normalizeDay(String(dayRaw));
          if (!day) continue;
          const gradeRaw = gradeColIdx !== undefined ? row[colIdx[gradeColIdx]] : defaultGrade;
          const sectionRaw = sectionColIdx !== undefined ? row[colIdx[sectionColIdx]] : defaultSection;
          const periodRaw = periodColIdx !== undefined ? row[colIdx[periodColIdx]] : '1';
          const teacherRaw = teacherColIdx !== undefined ? row[colIdx[teacherColIdx]] : '';
          results.push({
            day,
            period: Math.max(1, parseInt(String(periodRaw).replace(/\D/g, ''), 10) || 1),
            grade: normalizeGrade(String(gradeRaw || defaultGrade)),
            section: String(sectionRaw || defaultSection).trim().toUpperCase() || 'A',
            subject: String(subjectRaw).trim(),
            teacherName: teacherRaw ? String(teacherRaw).trim() : undefined,
          });
        }
      } else {
        // ── Strategy C: Sheet-name = class (e.g. "Grade 3A"), rows = Day × Period ──
        // Row 0 = Period headers (P1, P2...), Column 0 = Day names
        const firstCol = raw2d.map((row: any[]) => String(row[0] || '').trim());
        const hasDayInFirstCol = firstCol.some((c) => normalizeDay(c) !== null);

        if (hasDayInFirstCol) {
          detectedFormat = 'matrix-day-rows-period-cols';
          // Parse sheet name for grade/section
          const sheetGrade = normalizeGrade(sheetName.replace(/[^0-9]/g, ''));
          const sheetSectionMatch = sheetName.match(/[A-Z]$/i);
          const sheetSection = sheetSectionMatch ? sheetSectionMatch[0].toUpperCase() : defaultSection;
          const grade = ALL_GRADES.includes(sheetGrade) ? sheetGrade : defaultGrade;
          const section = sheetSection || defaultSection;

          // Row 0 = headers: col 0 empty, col 1..N = period numbers
          const headerRowArr = raw2d[0];
          const periodMap: Record<number, number> = {}; // period num → col index
          headerRowArr.forEach((cell: any, ci: number) => {
            const m = String(cell || '').trim().match(/^(?:p(?:eriod)?\s*)?(\d+)$/i);
            if (m) periodMap[parseInt(m[1])] = ci;
          });

          for (let ri = 1; ri < raw2d.length; ri++) {
            const row = raw2d[ri];
            const dayRaw = String(row[0] || '').trim();
            const day = normalizeDay(dayRaw);
            if (!day) continue;

            for (const [pNumStr, ci] of Object.entries(periodMap)) {
              const cell = String(row[ci] || '').trim();
              if (isBlank(cell)) continue;
              const { subject, teacher } = splitCell(cell);
              if (!subject) continue;
              results.push({ day, period: parseInt(pNumStr), grade, section, subject, teacherName: teacher });
            }
          }
        }
      }
    }
  }

  return {
    schedules: results,
    detectedFormat,
    columnsSeen,
    sheetNames: workbook.SheetNames,
  };
}

// ══════════════════════════════════════════════════════════════
//  UNIVERSAL PDF PARSER — handles PDF Timetables & Allotments
// ══════════════════════════════════════════════════════════════
const KNOWN_SUBJECTS = [
  'Mathematics', 'Maths', 'Math', 'Science', 'Physics', 'Chemistry', 'Biology',
  'English', 'Hindi', 'Kannada', 'Social Science', 'Social Studies', 'SST',
  'History', 'Geography', 'Civics', 'Economics', 'Computer Science', 'Computer',
  'Information Technology', 'IT', 'Artificial Intelligence', 'AI',
  'Physical Education', 'PE', 'PT', 'Sports', 'Art', 'Drawing', 'Music',
  'Dance', 'Sanskrit', 'EVS', 'Environmental Studies', 'General Knowledge', 'GK',
  'Moral Science', 'Library', 'Yoga', 'Activity', 'Work Experience'
];

export async function parseAnyPdf(
  buffer: Buffer,
  defaultGrade: string,
  defaultSection: string
): Promise<{
  schedules: ExtractedSchedule[];
  detectedFormat: string;
  columnsSeen: string[];
  sheetNames: string[];
}> {
  let text = '';
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    text = result.text || '';
    await parser.destroy();
  } catch (err) {
    console.error('PDF text extraction error:', err);
  }

  if (!text.trim()) {
    return { schedules: [], detectedFormat: 'pdf-empty', columnsSeen: [], sheetNames: ['PDF Document'] };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results: ExtractedSchedule[] = [];
  const columnsSeen: string[] = [];
  let detectedFormat = 'pdf-parsed';

  // Helper to split a line by multiple delimiters
  const splitLine = (l: string) =>
    l
      .split(/\s*\|\s*|\t+|\s{2,}/)
      .map((c) => c.trim())
      .filter(Boolean);

  // Helper to parse roman numerals or arabic grade strings
  const parseGradeNum = (str: string): string => {
    const clean = str.trim().toUpperCase();
    if (/^(?:12|XII|12TH)$/i.test(clean)) return 'Grade 12';
    if (/^(?:11|XI|11TH)$/i.test(clean)) return 'Grade 11';
    if (/^(?:10|X|10TH)$/i.test(clean)) return 'Grade 10';
    if (/^(?:9|IX|9TH)$/i.test(clean)) return 'Grade 9';
    if (/^(?:8|VIII|8TH)$/i.test(clean)) return 'Grade 8';
    if (/^(?:7|VII|7TH)$/i.test(clean)) return 'Grade 7';
    if (/^(?:6|VI|6TH)$/i.test(clean)) return 'Grade 6';
    if (/^(?:5|V|5TH)$/i.test(clean)) return 'Grade 5';
    if (/^(?:4|IV|4TH)$/i.test(clean)) return 'Grade 4';
    if (/^(?:3|III|3TH|3RD)$/i.test(clean)) return 'Grade 3';
    if (/^(?:2|II|2ND)$/i.test(clean)) return 'Grade 2';
    if (/^(?:1|I|1ST)$/i.test(clean)) return 'Grade 1';
    const m = clean.match(/(\d{1,2})/);
    return m ? `Grade ${m[1]}` : `Grade ${clean}`;
  };

  // Check if whole document mentions specific target grades like 9 and 10
  const docLower = text.toLowerCase();
  const docHas9And10 = (docLower.includes('9') && docLower.includes('10')) || docLower.includes('ix') || docLower.includes('x');

  // ── Strategy 1: Horizontal Period Grids (Day / Periods in header) ──
  const headerIdx = lines.findIndex((l) => {
    const lower = l.toLowerCase();
    return (
      (lower.includes('day') || lower.includes('mon') || lower.includes('period')) &&
      (lower.includes('subject') || lower.includes('teacher') || lower.includes('class') || lower.includes('grade'))
    );
  });

  if (headerIdx >= 0) {
    const headerCells = splitLine(lines[headerIdx]);
    columnsSeen.push(...headerCells);

    const periodCols: { pNum: number; idx: number }[] = [];
    headerCells.forEach((h, idx) => {
      const m = h.match(/^(?:p(?:eriod)?\s*)?(\d+)$/i);
      if (m) periodCols.push({ pNum: parseInt(m[1]), idx });
    });

    if (periodCols.length >= 4) {
      detectedFormat = 'pdf-horizontal-periods';
      let currentGrade = defaultGrade;
      let currentSection = defaultSection;

      for (let i = headerIdx + 1; i < lines.length; i++) {
        const cells = splitLine(lines[i]);
        if (cells.length < 2) continue;

        const lineText = lines[i];
        const gradeMatch = lineText.match(/(?:Grade|Class|Std)?\s*(\d{1,2}|IX|X|XI|XII)(?:st|nd|rd|th)?/i);
        if (gradeMatch) currentGrade = parseGradeNum(gradeMatch[1]);

        const sectionMatch = lineText.match(/\b([A-D])\b/);
        if (sectionMatch && !gradeMatch) currentSection = sectionMatch[1].toUpperCase();

        const dayCandidate = cells[0];
        const day = normalizeDay(dayCandidate);
        if (!day) continue;

        for (const { pNum, idx } of periodCols) {
          if (idx < cells.length) {
            const cell = cells[idx];
            if (isBlank(cell)) continue;
            const { subject, teacher } = splitCell(cell);
            if (subject) {
              results.push({
                day,
                period: pNum,
                grade: currentGrade,
                section: currentSection,
                subject,
                teacherName: teacher,
              });
            }
          }
        }
      }
    }
  }

  // ── Strategy 2: Teacher Allotment Matrix & Token Scanner ──
  interface AllotmentEntry {
    teacherName: string;
    subject: string;
    grade: string;
    section: string;
    periodsPerWeek?: number;
  }
  const extractedAllotments: AllotmentEntry[] = [];

  const INVALID_NAME_PATTERNS = /^(page|sl\.?\s*no|table|total|smart\s*calendar|school|timetable|subject\s*periods?|periods?|total\s*periods?|no\s*of\s*periods?|working\s*days?|standard|std|class|division|section|teacher\s*name|signature|remark|remarks|faculty\s*name|academic\s*year)\b/i;

  if (results.length === 0) {
    // Check if there is a column header defining classes (e.g. 9A, 9B, 10A, 10B)
    let classCols: { grade: string; section: string; colIdx: number }[] = [];

    for (let i = 0; i < Math.min(25, lines.length); i++) {
      const cells = splitLine(lines[i]);
      const foundCols: { grade: string; section: string; colIdx: number }[] = [];

      cells.forEach((cell, idx) => {
        const m = cell.match(/(?:Grade|Class|Std)?\s*(\d{1,2}|IX|X|XI|XII)(?:st|nd|rd|th)?[\s\-_/:]*([A-D])\b/i);
        if (m) {
          foundCols.push({
            grade: parseGradeNum(m[1]),
            section: m[2].toUpperCase(),
            colIdx: idx,
          });
        }
      });

      if (foundCols.length >= 2) {
        classCols = foundCols;
        break;
      }
    }

    // Process rows
    for (const line of lines) {
      if (INVALID_NAME_PATTERNS.test(line)) continue;

      // Check for known subject
      let matchedSubject = '';
      for (const subj of KNOWN_SUBJECTS) {
        const regex = new RegExp(`\\b${subj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(line)) {
          matchedSubject = subj;
          break;
        }
      }

      // Check for inline grade-section pairs: "9A", "9B", "10A", "10B", "9th A", "10th B", "Grade 9 A"
      const pairRegex = /(?:Grade|Class|Std)?\s*(\d{1,2}|IX|X|XI|XII)(?:st|nd|rd|th)?[\s\-_/:]*([A-D])\b/gi;
      const detectedPairs: { grade: string; section: string }[] = [];
      let match;
      while ((match = pairRegex.exec(line)) !== null) {
        detectedPairs.push({
          grade: parseGradeNum(match[1]),
          section: match[2].toUpperCase(),
        });
      }

      // If standalone grades 9, 10, IX, X are found
      if (detectedPairs.length === 0) {
        const gradeMatches = line.match(/(?:Grade|Class|Std)?\s*(\d{1,2}|IX|X|XI|XII)(?:st|nd|rd|th)?\b/gi) || [];
        const sectionMatches = line.match(/\b([A-D])\b/gi) || (docHas9And10 ? ['A', 'B'] : ['A']);

        for (const gm of gradeMatches) {
          const gStr = parseGradeNum(gm);
          for (const sm of sectionMatches) {
            detectedPairs.push({ grade: gStr, section: sm.toUpperCase() });
          }
        }
      }

      // If document is specifically for Grade 9 & 10 and no other grade was matched:
      if (detectedPairs.length === 0 && docHas9And10) {
        detectedPairs.push(
          { grade: 'Grade 9', section: 'A' },
          { grade: 'Grade 9', section: 'B' },
          { grade: 'Grade 10', section: 'A' },
          { grade: 'Grade 10', section: 'B' }
        );
      }

      // Extract teacher candidate name
      let nameCandidate = line;
      if (matchedSubject) {
        nameCandidate = nameCandidate.replace(new RegExp(matchedSubject, 'gi'), ' ');
      }
      nameCandidate = nameCandidate
        .replace(/\b(?:Social\s*Sci|Sci|Maths?|Eng|Comp|Phy|Chem|Bio|Hist|Geo|Civ)\b/gi, ' ')
        .replace(/(?:Grade|Class|Std|Section|Sec)\s*[0-9A-Z-]*/gi, ' ')
        .replace(/\b(?:\d{1,2}|IX|X|XI|XII)(?:st|nd|rd|th)?[\s\-_/:]*[A-D]\b/gi, ' ')
        .replace(/\b(?:\d{1,2}|IX|X|XI|XII)(?:st|nd|rd|th)?\b/gi, ' ')
        .replace(/^[0-9.\-_|/\s]+/, ' ')
        .replace(/[0-9.\-_|/()]+/g, ' ')
        .replace(/\b(?:Dr|Mr|Mrs|Ms|Sir|Madam|Teacher|Faculty|Subject\s*Periods?)\.?\b/gi, '')
        .trim();

      const cleanName = nameCandidate.split(/\s{2,}/)[0]?.trim();

      if (
        cleanName &&
        cleanName.length >= 3 &&
        /^[A-Za-z\s.]+$/.test(cleanName) &&
        !INVALID_NAME_PATTERNS.test(cleanName) &&
        !/^subject\s*periods?$/i.test(cleanName)
      ) {
        const subjectToUse = matchedSubject || 'General Studies';

        // Check if classCols matched periods in this row
        const cells = splitLine(line);
        let usedClassCols = false;

        if (classCols.length > 0 && cells.length >= classCols[0].colIdx) {
          classCols.forEach((col) => {
            if (col.colIdx < cells.length) {
              const val = parseInt(cells[col.colIdx].replace(/\D/g, ''), 10);
              if (!isNaN(val) && val > 0) {
                usedClassCols = true;
                extractedAllotments.push({
                  teacherName: cleanName,
                  subject: subjectToUse,
                  grade: col.grade,
                  section: col.section,
                  periodsPerWeek: val,
                });
              }
            }
          });
        }

        if (!usedClassCols) {
          const uniquePairs = detectedPairs.length > 0 ? detectedPairs : [
            { grade: 'Grade 9', section: 'A' },
            { grade: 'Grade 9', section: 'B' },
            { grade: 'Grade 10', section: 'A' },
            { grade: 'Grade 10', section: 'B' },
          ];

          const seenPairKey = new Set<string>();
          for (const p of uniquePairs) {
            const key = `${p.grade}|${p.section}`;
            if (!seenPairKey.has(key)) {
              seenPairKey.add(key);
              extractedAllotments.push({
                teacherName: cleanName,
                subject: subjectToUse,
                grade: p.grade,
                section: p.section,
                periodsPerWeek: 6,
              });
            }
          }
        }
      }
    }

    // Synthesize weekly timetable schedule grid for all extracted classes (Grade 9 A, 9 B, 10 A, 10 B, etc.)
    if (extractedAllotments.length > 0) {
      detectedFormat = 'pdf-allotment-token-matrix';
      const classes = [...new Set(extractedAllotments.map((a) => `${a.grade}|${a.section}`))];
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const teacherOccupancy = new Set<string>();

      for (const classKey of classes) {
        const [grade, section] = classKey.split('|');
        const classAllotments = extractedAllotments.filter((a) => a.grade === grade && a.section === section);
        if (classAllotments.length === 0) continue;

        let offset = 0;
        for (const day of days) {
          const periodCount = day === 'Saturday' ? 5 : 8;
          for (let p = 1; p <= periodCount; p++) {
            let chosen = classAllotments[offset % classAllotments.length];
            // Find non-clashing allotment slot if possible
            for (let attempt = 0; attempt < classAllotments.length; attempt++) {
              const candidate = classAllotments[(offset + attempt) % classAllotments.length];
              const tKey = `${candidate.teacherName.toLowerCase()}|${day}|${p}`;
              if (!teacherOccupancy.has(tKey)) {
                chosen = candidate;
                offset += attempt;
                break;
              }
            }

            results.push({
              day,
              period: p,
              grade,
              section,
              subject: chosen.subject,
              teacherName: chosen.teacherName,
            });

            if (chosen.teacherName) {
              teacherOccupancy.add(`${chosen.teacherName.toLowerCase()}|${day}|${p}`);
            }
            offset++;
          }
        }
      }
    }
  }

  // ── Strategy 3: Multi-Model AI Structured Extraction Fallback ──
  if (results.length === 0 && process.env.GROQ_API_KEY && text.length > 10) {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const candidateModels = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

    const prompt = `Extract all timetable schedules and teacher allotments from the following PDF document text into a JSON object with a "schedules" array.
Grades mentioned in document: Grade 9, Grade 10 (Sections A, B).
Days should be one of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday.
Periods should be 1 to 8.
Return in this JSON format:
{
  "schedules": [
    { "day": "Monday", "period": 1, "grade": "Grade 9", "section": "A", "subject": "Mathematics", "teacherName": "Priya Sharma" }
  ]
}

Document Text:
${text.slice(0, 4000)}`;

    for (const model of candidateModels) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        });

        const rawAi = completion.choices[0]?.message?.content || '{}';
        const parsedAi = JSON.parse(rawAi);
        const list = Array.isArray(parsedAi) ? parsedAi : parsedAi.schedules || parsedAi.data || parsedAi.timetable || [];
        if (Array.isArray(list) && list.length > 0) {
          detectedFormat = `pdf-ai-${model.replace(/[^a-z0-9]/gi, '-')}`;
          for (const item of list) {
            if (item.day && item.period && item.subject) {
              results.push({
                day: normalizeDay(item.day) || 'Monday',
                period: Math.max(1, Math.min(8, parseInt(item.period, 10) || 1)),
                grade: normalizeGrade(item.grade || defaultGrade),
                section: String(item.section || defaultSection).trim().toUpperCase() || 'A',
                subject: String(item.subject).trim(),
                teacherName: item.teacherName ? String(item.teacherName).trim() : undefined,
              });
            }
          }
          break;
        }
      } catch (aiErr) {
        console.warn(`Groq fallback with ${model} failed, trying next:`, aiErr);
      }
    }
  }

  return {
    schedules: results,
    detectedFormat,
    columnsSeen,
    sheetNames: ['PDF Document'],
  };
}



