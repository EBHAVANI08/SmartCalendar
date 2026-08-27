import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ALL_GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];

// ─── Takshila teacher short-name → full name map ───────────────────────────
const SHORT_NAME_MAP: Record<string, string> = {
  'Palak M': 'Palak Sharma',
  'Pratiksha S': 'Pratiksha Sumrao',
  'Manisha R': 'Manisha Rajput',
  'Shubhangi K': 'Shubhangi Kakani',
  'Sonali J': 'Sonali Jagtap',
  'Jishya K': 'Jishya Kackoth',
  'Neeta M': 'Neeta Mohite',
  'Fauziya M': 'Fauziya Ahmed',
  'Afreen M': 'Afreen Deshmukh',
  'Kranti M': 'Kranti Chavan',
  'Sayeed Sir': 'Sayeed Sir',
  'Komal M': 'Komal Mahajan',
  'Priya M': 'Priya Mishra',
  'Sarika M': 'Sarika Pahade',
  'Jakiya M': 'Jakiya Pathan',
  'Archana K': 'Archana Kadam',
  'Dipali B': 'Dipali Bhalke',
  'Vaibhavi M': 'Vaibhavi More',
  'Poonam K': 'Poonam Kulkarni',
  'Anita M': 'Anita Kulkarni',
  'Jayshri J': 'Jayshri Joshi',
  'Archana S': 'Archana Sharma',
  'Megha M': 'Megha Lohade',
  'Kaushalya M': 'Kaushalya Bharadwaj',
  'Daval Sir': 'Daval Bachhav',
  'Ankita M': 'Ankeeta Baviskar',
  'Pradnya M': 'Pradnya Patil',
  'Huma M': 'Huma Kausar Pathan',
  'Divyani M': 'Devyani Desai',
  'Atiya M': 'Atiya Ansari',
  'Pratiksha A': 'Pratiksha Agrawal',
  'Dipali W': 'Dipali Wagh',
  'Priyanka M': 'Priyanka Desai',
  'Shikha M': 'Shikha Mishra',
  'Snehal M': 'Snehal Maru',
  'Amit Sir': 'Amit More',
  'Hemlata P': 'Hemlata Patil',
  'Kaviraj sir': 'Kaviraj Sir',
  'Reena L': 'Reena L',
  'Mateen sir': 'Mateen Sir',
  'Sagar sir': 'Sagar Sir',
  'Qamar sir': 'Qamar Sir',
  'Roshan Sir': 'Roshan Sir',
  'Coach Rakesh': 'Coach Rakesh Kumar',
};

// ─── Normalize grade: "3" → "Grade 3", "Grade3" → "Grade 3", etc. ──────────
function normalizeGrade(raw: string): string {
  if (!raw) return '';
  const clean = String(raw).trim();
  // Already in correct format
  if (/^Grade\s+\d+$/i.test(clean)) {
    return `Grade ${clean.replace(/\D/g, '')}`;
  }
  // Numeric only: "3", "10"
  if (/^\d+$/.test(clean)) return `Grade ${clean}`;
  // "Grade3", "Gr3", "Std 5", "Class 3" etc.
  const num = clean.replace(/[^\d]/g, '');
  if (num) return `Grade ${num}`;
  return clean;
}

// ─── Normalize section: "a" → "A", " A " → "A" ──────────────────────────────
function normalizeSection(raw: string): string {
  return String(raw || 'A').trim().toUpperCase() || 'A';
}

// ─── Normalize day ────────────────────────────────────────────────────────────
function normalizeDay(input: string): string {
  const clean = String(input || '').trim();
  for (const d of DAYS) {
    if (d.toLowerCase() === clean.toLowerCase() || clean.toLowerCase().startsWith(d.toLowerCase().slice(0, 3))) {
      return d;
    }
  }
  return 'Monday';
}

// ─── Detect "empty" cell values ──────────────────────────────────────────────
const EMPTY_VALUES = new Set(['', '-', '—', 'free', 'null', 'none', 'n/a', 'na', 'assigned faculty', 'no', 'vacant', 'off', 'break', 'lunch', 'recess', 'pt', 'assembly']);
function isEmpty(val: any): boolean {
  return !val || EMPTY_VALUES.has(String(val).trim().toLowerCase());
}

interface ExtractedSchedule {
  day: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  teacherName?: string;
  room?: string;
}

// ─── SMART PARSER: Handles both vertical (row-per-period) and horizontal (period columns) layouts ────
function parseExcelBuffer(buffer: Buffer, defaultGrade: string, defaultSection: string): ExtractedSchedule[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results: ExtractedSchedule[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    if (rows.length === 0) continue;

    // Detect layout type by checking column headers
    const sampleRow = rows[0];
    const keys = Object.keys(sampleRow).map((k) => k.trim());

    // Check for HORIZONTAL layout: columns are "P1", "P2", ... "P8" or "Period 1", etc.
    const periodColMap: Record<number, string> = {}; // period → column key
    for (const key of keys) {
      // "P1", "P 1", "Period1", "Period 1", "1", "Slot1" etc.
      const m = key.match(/^(?:P(?:eriod)?\s*)?(\d+)$/i) || key.match(/^(?:slot|pd)\s*(\d+)$/i);
      if (m) {
        periodColMap[parseInt(m[1], 10)] = key;
      }
    }

    const isHorizontal = Object.keys(periodColMap).length >= 4;

    if (isHorizontal) {
      // ── HORIZONTAL LAYOUT: each row = one day (+ grade/section); cols = P1..P8 ──
      // Also supports: each row = one class (Grade/Section), day in a column
      // Example headers: Grade | Section | Day | P1 | P2 | ... | P8
      // Or: Class | Sec | Mon-P1 | Mon-P2 | ... | Sat-P5

      for (const row of rows) {
        const gradeRaw = row['Grade'] || row['grade'] || row['Class'] || row['class'] || row['STD'] || row['Std'] || defaultGrade;
        const sectionRaw = row['Section'] || row['section'] || row['Sec'] || row['SEC'] || defaultSection;
        const dayRaw = row['Day'] || row['day'] || row['DAY'] || row['Day Name'];

        const grade = normalizeGrade(String(gradeRaw));
        const section = normalizeSection(String(sectionRaw));

        if (!ALL_GRADES.includes(grade) && grade !== defaultGrade) continue;

        if (dayRaw) {
          // One row = one day, horizontal periods
          const day = normalizeDay(String(dayRaw));
          for (const [periodNum, colKey] of Object.entries(periodColMap)) {
            const cellVal = String(row[colKey] || '').trim();
            if (isEmpty(cellVal)) continue;

            // Cell format: "Subject\nTeacher" or "Subject (Teacher)" or just "Subject"
            const { subject, teacher } = parseSubjectTeacherCell(cellVal);
            if (!subject) continue;

            results.push({
              day,
              period: parseInt(String(periodNum), 10),
              grade,
              section,
              subject,
              teacherName: teacher,
            });
          }
        } else {
          // No day column — assume Mon-Fri mapping (each period col has day-embedded or iterate days)
          const daysInRow = DAYS.slice(0, 6);
          // Try to find day-tagged keys like "Mon-P1", "Tue-P2"
          for (const key of keys) {
            const dayPeriodMatch = key.match(/^(mon|tue|wed|thu|fri|sat)\w*[-_\s]?p?(\d+)$/i);
            if (dayPeriodMatch) {
              const day = normalizeDay(dayPeriodMatch[1]);
              const period = parseInt(dayPeriodMatch[2], 10);
              const cellVal = String(row[key] || '').trim();
              if (isEmpty(cellVal)) continue;
              const { subject, teacher } = parseSubjectTeacherCell(cellVal);
              if (!subject) continue;
              results.push({ day, period, grade, section, subject, teacherName: teacher });
            }
          }
          // If no day-period found above, skip (can't infer day)
        }
      }
    } else {
      // ── VERTICAL LAYOUT: each row = one period slot ──
      // Headers: Day | Period | Grade | Section | Subject | Teacher Name | Room
      for (const row of rows) {
        const dayVal = row['Day'] || row['day'] || row['DAY'] || row['Day Name'];
        const periodVal = row['Period'] || row['period'] || row['PERIOD'] || row['Slot'] || row['Period No'] || row['Per'];
        const subjectVal = row['Subject'] || row['subject'] || row['SUBJECT'] || row['Course'] || row['Subject Name'] || row['Sub'];
        const teacherVal =
          row['Teacher Name'] || row['Teacher'] || row['teacher'] ||
          row['Faculty'] || row['Teacher Code'] || row['Class Teacher'] ||
          row['Employee ID'] || row['Incharge'] || row['Staff'];
        const gradeRaw = row['Grade'] || row['grade'] || row['Class'] || row['Class Code'] || row['STD'] || defaultGrade;
        const sectionRaw = row['Section'] || row['section'] || row['SEC'] || row['Sec'] || defaultSection;
        const roomVal = row['Room'] || row['room'] || row['Room Code'] || row['Room No'] || '';

        if (!dayVal || isEmpty(String(subjectVal))) continue;

        const grade = normalizeGrade(String(gradeRaw));
        const section = normalizeSection(String(sectionRaw));
        const periodNum = parseInt(String(periodVal).replace(/\D/g, ''), 10) || 1;

        results.push({
          day: normalizeDay(String(dayVal)),
          period: Math.min(Math.max(periodNum, 1), 10),
          grade,
          section,
          subject: String(subjectVal).trim(),
          teacherName: teacherVal ? String(teacherVal).trim() : undefined,
          room: roomVal ? String(roomVal).trim() : undefined,
        });
      }
    }
  }

  return results;
}

// ─── Parse "Math\nPriya M" or "Math (Priya M)" or "Math - Priya M" ──────────
function parseSubjectTeacherCell(raw: string): { subject: string; teacher?: string } {
  if (!raw) return { subject: '' };
  // Split on newline
  const parts = raw.split(/\n|\\n/);
  if (parts.length >= 2) {
    return { subject: parts[0].trim(), teacher: parts.slice(1).join(' ').trim() };
  }
  // Split on parentheses: "Math (Priya)"
  const parenMatch = raw.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenMatch) {
    return { subject: parenMatch[1].trim(), teacher: parenMatch[2].trim() };
  }
  // Split on " - ": "Math - Priya M"
  const dashMatch = raw.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (dashMatch) {
    return { subject: dashMatch[1].trim(), teacher: dashMatch[2].trim() };
  }
  // Split on " / "
  const slashMatch = raw.match(/^(.+?)\s*\/\s*(.+)$/);
  if (slashMatch) {
    return { subject: slashMatch[1].trim(), teacher: slashMatch[2].trim() };
  }
  return { subject: raw.trim() };
}

// ─── Compute period start/end times based on Takshila bell schedule ───────────
function computePeriodTiming(
  periodNum: number,
  startTimeStr: string = '08:00',
  durationMins: number = 40,
  shortBreakAfter: number = 3,
  shortBreakMins: number = 30,
  lunchBreakAfter: number = 4,
  lunchBreakMins: number = 30
): { start: string; end: string } {
  let [h, m] = (startTimeStr || '08:00').split(':').map((x) => parseInt(x, 10) || 0);
  let currentMinutes = h * 60 + m;

  for (let p = 1; p <= periodNum; p++) {
    const periodStartMins = currentMinutes;
    const periodEndMins = currentMinutes + durationMins;

    if (p === periodNum) {
      const formatTime = (mins: number) => {
        const hrs = Math.floor(mins / 60) % 24;
        const mns = mins % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mns).padStart(2, '0')}`;
      };
      return { start: formatTime(periodStartMins), end: formatTime(periodEndMins) };
    }

    currentMinutes = periodEndMins;
    if (p === shortBreakAfter) currentMinutes += shortBreakMins;
    if (p === lunchBreakAfter) currentMinutes += lunchBreakMins;
  }

  return { start: '08:00', end: '08:40' };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // ── Auto-resolve schoolId from DB (no tenant ID required from client) ──
    // If client sends a schoolId in formData, try to use it; otherwise always fall back to DB first school
    let schoolId = String(formData.get('schoolId') || '').trim();
    if (!schoolId || schoolId === 'null' || schoolId === 'undefined' || schoolId.length < 24) {
      const firstSchool = await db.school.findFirst({ select: { id: true, name: true } });
      if (!firstSchool) {
        return NextResponse.json({ error: 'No school found in database. Please run the seed first at POST /api/seed.' }, { status: 400 });
      }
      schoolId = firstSchool.id;
      console.log(`[BULK-UPLOAD] Auto-resolved schoolId from DB: ${schoolId} (${firstSchool.name})`);
    }

    // School Schedule Settings passed from Wizard Form
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
    const defaultSection = normalizeSection(String(formData.get('section') || 'A'));

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded. Please select an Excel (.xlsx/.csv) file.' }, { status: 400 });
    }

    const fileName = file.name;
    const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedSchedules: ExtractedSchedule[] = [];

    if (['.xlsx', '.xls', '.csv'].includes(fileExt)) {
      extractedSchedules = parseExcelBuffer(buffer, defaultGrade, defaultSection);
    } else {
      return NextResponse.json({ error: `Unsupported file format '${fileExt}'. Only .xlsx, .xls, and .csv files are supported.` }, { status: 400 });
    }

    if (extractedSchedules.length === 0) {
      return NextResponse.json({
        error: 'No timetable data could be extracted from the file. Please check column headers (Day, Period, Grade, Section, Subject, Teacher Name) or horizontal layout (P1–P8 columns).',
        hint: 'Supported formats: Vertical (Day|Period|Grade|Section|Subject|Teacher) or Horizontal (Grade|Section|Day|P1|P2...P8)',
      }, { status: 400 });
    }

    // Fetch all existing teachers for this school
    const existingTeachers = await db.teacher.findMany({ where: { schoolId } });

    // ── Fuzzy teacher name resolver ─────────────────────────────────────────
    const resolveTeacher = (nameInput?: string): { id: string; name: string } | null => {
      if (!nameInput || isEmpty(nameInput)) return null;

      const cleanInput = nameInput.trim();
      const mappedFullName = SHORT_NAME_MAP[cleanInput] || SHORT_NAME_MAP[cleanInput.toLowerCase()] || cleanInput;
      const mappedLower = mappedFullName.toLowerCase();
      const cleanLower = cleanInput.toLowerCase();

      // 1. Exact full name match
      let matched = existingTeachers.find(
        (t) => t.name.toLowerCase() === mappedLower || t.name.toLowerCase() === cleanLower
      );

      // 2. Partial / substring match
      if (!matched) {
        matched = existingTeachers.find(
          (t) =>
            t.name.toLowerCase().includes(mappedLower) ||
            mappedLower.includes(t.name.toLowerCase()) ||
            t.name.toLowerCase().includes(cleanLower) ||
            cleanLower.includes(t.name.toLowerCase())
        );
      }

      // 3. First-word match (first name only)
      if (!matched) {
        const firstWord = mappedLower.split(/\s+/)[0];
        if (firstWord.length >= 3) {
          matched = existingTeachers.find((t) => t.name.toLowerCase().startsWith(firstWord));
        }
      }

      return matched ? { id: matched.id, name: matched.name } : null;
    };

    // ── Process and save each extracted slot ────────────────────────────────
    let savedCount = 0;
    let skippedCount = 0;
    const teachersAssignedSet = new Set<string>();
    const newTeachersCreated: string[] = [];
    const warnings: string[] = [];

    for (const item of extractedSchedules) {
      // Validate grade range
      if (!ALL_GRADES.includes(item.grade)) {
        warnings.push(`Skipped unknown grade: "${item.grade}" for ${item.subject}`);
        skippedCount++;
        continue;
      }

      // Apply Saturday constraints
      if (item.day === 'Saturday') {
        if (saturdayType === 'off') continue;
        if (item.period > saturdayPeriods) continue;
      }
      if (item.period > totalPeriodsPerDay) continue;

      // Resolve teacher
      let teacherObj = resolveTeacher(item.teacherName);
      let teacherId: string | null = teacherObj ? teacherObj.id : null;

      // If unresolved but name provided → create new teacher record
      if (!teacherObj && item.teacherName && !isEmpty(item.teacherName)) {
        const rawName = item.teacherName.trim();
        const resolvedFullName = SHORT_NAME_MAP[rawName] || SHORT_NAME_MAP[rawName.toLowerCase()] || rawName;
        const teacherEmail = `${resolvedFullName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@takshilaschool.edu`;

        // Build grades array from grade range
        const startIdx = ALL_GRADES.indexOf(startGrade);
        const endIdx = ALL_GRADES.indexOf(endGrade);
        const gradesArray = startIdx >= 0 && endIdx >= startIdx
          ? ALL_GRADES.slice(startIdx, endIdx + 1)
          : [item.grade];

        const newTeacher = await db.teacher.create({
          data: {
            name: resolvedFullName,
            email: teacherEmail,
            subject: item.subject,
            password: 'teacher123',
            grades: JSON.stringify(gradesArray),
            schoolId,
          },
        }).catch((err: any) => {
          // Might be duplicate email — try to find existing
          warnings.push(`Could not create teacher "${resolvedFullName}": ${err?.message}`);
          return null;
        });

        if (newTeacher) {
          teacherId = newTeacher.id;
          teachersAssignedSet.add(newTeacher.name);
          newTeachersCreated.push(newTeacher.name);
          existingTeachers.push(newTeacher);
        }
      } else if (teacherObj) {
        teachersAssignedSet.add(teacherObj.name);
      } else if (item.teacherName && !isEmpty(item.teacherName)) {
        warnings.push(`Teacher not found in DB: "${item.teacherName}" for ${item.grade} ${item.section} ${item.day} P${item.period}`);
      }

      // Compute bell-schedule times
      const times = computePeriodTiming(item.period, startTimeStr, durationMins, shortBreakAfter, shortBreakMins, lunchBreakAfter, lunchBreakMins);

      // Upsert schedule
      const existing = await db.schedule.findFirst({
        where: { grade: item.grade, section: item.section, day: item.day, period: item.period, schoolId },
      }).catch(() => null);

      if (existing) {
        await db.schedule.update({
          where: { id: existing.id },
          data: {
            subject: item.subject,
            teacherId: teacherId ?? existing.teacherId,
            roomId: item.room || existing.roomId,
            startTime: times.start,
            endTime: times.end,
          },
        }).catch(() => null);
      } else {
        await db.schedule.create({
          data: {
            schoolId,
            grade: item.grade,
            section: item.section,
            day: item.day,
            period: item.period,
            subject: item.subject,
            startTime: times.start,
            endTime: times.end,
            teacherId,
            roomId: item.room || null,
          },
        }).catch(() => null);
      }
      savedCount++;
    }

    return NextResponse.json({
      success: true,
      fileName,
      schedulesCreated: savedCount,
      schedulesSkipped: skippedCount,
      teachersAssigned: teachersAssignedSet.size,
      newTeachersCreated: newTeachersCreated.length,
      newTeacherNames: newTeachersCreated,
      warnings: warnings.slice(0, 20),
      message: `Processed ${fileName}: ${savedCount} slots saved, ${teachersAssignedSet.size} teachers assigned, ${newTeachersCreated.length} new teachers created.`,
    });
  } catch (error: any) {
    console.error('Bulk upload error:', error);
    return NextResponse.json({ error: `Failed to process bulk upload: ${error?.message || 'Unknown error'}` }, { status: 500 });
  }
}
