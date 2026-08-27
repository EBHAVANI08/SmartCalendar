import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

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

const SHORT_NAME_MAP: Record<string, string> = {
  'Palak M': 'Palak Sharma', 'Pratiksha S': 'Pratiksha Sumrao', 'Manisha R': 'Manisha Rajput',
  'Shubhangi K': 'Shubhangi Kakani', 'Sonali J': 'Sonali Jagtap', 'Jishya K': 'Jishya Kackoth',
  'Neeta M': 'Neeta Mohite', 'Fauziya M': 'Fauziya Ahmed', 'Afreen M': 'Afreen Deshmukh',
  'Kranti M': 'Kranti Chavan', 'Komal M': 'Komal Mahajan', 'Priya M': 'Priya Mishra',
  'Sarika M': 'Sarika Pahade', 'Jakiya M': 'Jakiya Pathan', 'Archana K': 'Archana Kadam',
  'Dipali B': 'Dipali Bhalke', 'Vaibhavi M': 'Vaibhavi More', 'Poonam K': 'Poonam Kulkarni',
  'Anita M': 'Anita Kulkarni', 'Jayshri J': 'Jayshri Joshi', 'Archana S': 'Archana Sharma',
  'Megha M': 'Megha Lohade', 'Kaushalya M': 'Kaushalya Bharadwaj', 'Daval Sir': 'Daval Bachhav',
  'Ankita M': 'Ankeeta Baviskar', 'Pradnya M': 'Pradnya Patil', 'Huma M': 'Huma Kausar Pathan',
  'Divyani M': 'Devyani Desai', 'Atiya M': 'Atiya Ansari', 'Pratiksha A': 'Pratiksha Agrawal',
  'Dipali W': 'Dipali Wagh', 'Priyanka M': 'Priyanka Desai', 'Shikha M': 'Shikha Mishra',
  'Snehal M': 'Snehal Maru', 'Amit Sir': 'Amit More', 'Hemlata P': 'Hemlata Patil',
  'Kaviraj sir': 'Kaviraj Sir', 'Reena L': 'Reena L', 'Mateen sir': 'Mateen Sir',
  'Sagar sir': 'Sagar Sir', 'Qamar sir': 'Qamar Sir', 'Roshan Sir': 'Roshan Sir',
  'Coach Rakesh': 'Coach Rakesh Kumar', 'Sayeed Sir': 'Sayeed Sir',
};

interface ExtractedSchedule {
  day: string; period: number; grade: string; section: string;
  subject: string; teacherName?: string; room?: string;
}

function normalizeGrade(raw: string): string {
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

function isBlank(v: any): boolean {
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
function parseAnyExcel(buffer: Buffer, defaultGrade: string, defaultSection: string): {
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Auto-resolve schoolId from DB — no tenant ID required from client
    let schoolId = String(formData.get('schoolId') || '').trim();
    if (!schoolId || schoolId === 'null' || schoolId === 'undefined' || schoolId.length < 20) {
      const firstSchool = await db.school.findFirst({ select: { id: true, name: true } });
      if (!firstSchool) {
        return NextResponse.json({ error: 'No school found in database. Please run POST /api/seed first.' }, { status: 400 });
      }
      schoolId = firstSchool.id;
    }

    const startTimeStr = String(formData.get('startTime') || '08:00');
    const durationMins = parseInt(String(formData.get('periodDuration') || '40'), 10);
    const totalPeriodsPerDay = parseInt(String(formData.get('totalPeriods') || '8'), 10);
    const saturdayType = String(formData.get('saturdayType') || 'half');
    const saturdayPeriods = parseInt(String(formData.get('saturdayPeriods') || '5'), 10);
    const shortBreakAfter = parseInt(String(formData.get('shortBreakAfter') || '3'), 10);
    const shortBreakMins = parseInt(String(formData.get('shortBreakMins') || '30'), 10);
    const lunchBreakAfter = parseInt(String(formData.get('lunchBreakAfter') || '4'), 10);
    const lunchBreakMins = parseInt(String(formData.get('lunchBreakMins') || '30'), 10);
    const startGrade = String(formData.get('startGrade') || 'Grade 3');
    const endGrade = String(formData.get('endGrade') || 'Grade 8');
    const defaultGrade = normalizeGrade(String(formData.get('grade') || startGrade));
    const defaultSection = String(formData.get('section') || 'A').trim().toUpperCase() || 'A';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const fileName = file.name;
    const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(fileExt)) {
      return NextResponse.json({ error: `Unsupported format '${fileExt}'. Use .xlsx, .xls, or .csv.` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { schedules: extractedSchedules, detectedFormat, columnsSeen, sheetNames } = parseAnyExcel(buffer, defaultGrade, defaultSection);

    if (extractedSchedules.length === 0) {
      return NextResponse.json({
        error: 'No timetable data could be extracted. Please check your Excel format.',
        debug: {
          sheetsFound: sheetNames,
          columnsDetected: columnsSeen,
          detectedFormat,
          hint: 'Supported layouts:\n1. Vertical: columns Day | Period | Grade | Section | Subject | Teacher Name\n2. Horizontal: columns Grade | Section | Day | P1 | P2 | P3 ... P8\n3. Matrix: Row 0 = P1..P8 headers, Column 0 = Day names (Mon/Tue...), sheet name = class (e.g. "Grade 3A")',
        },
      }, { status: 400 });
    }

    // Load existing teachers for school
    const existingTeachers = await db.teacher.findMany({ where: { schoolId } });

    const resolveTeacher = (name?: string) => {
      if (!name || isBlank(name)) return null;
      const clean = name.trim();
      const mapped = SHORT_NAME_MAP[clean] || SHORT_NAME_MAP[clean.toLowerCase()] || clean;
      const mLow = mapped.toLowerCase();
      const cLow = clean.toLowerCase();
      return (
        existingTeachers.find((t) => t.name.toLowerCase() === mLow || t.name.toLowerCase() === cLow) ||
        existingTeachers.find((t) => t.name.toLowerCase().includes(mLow) || mLow.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(cLow) || cLow.includes(t.name.toLowerCase())) ||
        existingTeachers.find((t) => { const fw = mLow.split(/\s+/)[0]; return fw.length >= 3 && t.name.toLowerCase().startsWith(fw); }) ||
        null
      );
    };

    let savedCount = 0;
    let skippedCount = 0;
    const assignedTeachers = new Set<string>();
    const createdTeachers: string[] = [];
    const warnings: string[] = [];

    const startIdx = ALL_GRADES.indexOf(startGrade);
    const endIdx = ALL_GRADES.indexOf(endGrade);
    const gradeRange = startIdx >= 0 && endIdx >= startIdx ? ALL_GRADES.slice(startIdx, endIdx + 1) : ALL_GRADES;

    for (const item of extractedSchedules) {
      if (!ALL_GRADES.includes(item.grade)) { skippedCount++; warnings.push(`Unknown grade: "${item.grade}"`); continue; }
      if (item.day === 'Saturday') { if (saturdayType === 'off' || item.period > saturdayPeriods) continue; }
      if (item.period > totalPeriodsPerDay) continue;

      let teacher = resolveTeacher(item.teacherName);
      let teacherId: string | null = teacher ? teacher.id : null;

      if (!teacher && item.teacherName && !isBlank(item.teacherName)) {
        const rawName = item.teacherName.trim();
        const fullName = SHORT_NAME_MAP[rawName] || SHORT_NAME_MAP[rawName.toLowerCase()] || rawName;
        const email = `${fullName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@takshilaschool.edu`;
        const newT = await db.teacher.create({
          data: { name: fullName, email, subject: item.subject, password: 'teacher123', grades: JSON.stringify(gradeRange), schoolId },
        }).catch((e: any) => { warnings.push(`Could not create teacher "${fullName}": ${e?.message}`); return null; });
        if (newT) { teacherId = newT.id; createdTeachers.push(newT.name); existingTeachers.push(newT); assignedTeachers.add(newT.name); }
      } else if (teacher) {
        assignedTeachers.add(teacher.name);
      }

      const times = computeTimes(item.period, startTimeStr, durationMins, shortBreakAfter, shortBreakMins, lunchBreakAfter, lunchBreakMins);
      const existing = await db.schedule.findFirst({ where: { grade: item.grade, section: item.section, day: item.day, period: item.period, schoolId } }).catch(() => null);

      if (existing) {
        await db.schedule.update({ where: { id: existing.id }, data: { subject: item.subject, teacherId: teacherId ?? existing.teacherId, startTime: times.start, endTime: times.end } }).catch(() => null);
      } else {
        await db.schedule.create({ data: { schoolId, grade: item.grade, section: item.section, day: item.day, period: item.period, subject: item.subject, startTime: times.start, endTime: times.end, teacherId, roomId: item.room || null } }).catch(() => null);
      }
      savedCount++;
    }

    return NextResponse.json({
      success: true, fileName, detectedFormat,
      schedulesCreated: savedCount, schedulesSkipped: skippedCount,
      teachersAssigned: assignedTeachers.size, newTeachersCreated: createdTeachers.length,
      warnings: warnings.slice(0, 10),
      message: `✅ Processed "${fileName}" (${detectedFormat}): ${savedCount} slots saved, ${assignedTeachers.size} teachers assigned, ${createdTeachers.length} new teachers created.`,
    });
  } catch (err: any) {
    console.error('[BULK-UPLOAD ERROR]', err);
    return NextResponse.json({ error: `Failed to process upload: ${err?.message || 'Unknown error'}` }, { status: 500 });
  }
}
