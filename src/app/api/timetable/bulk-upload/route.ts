import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ALL_GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const ALL_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

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

interface ExtractedSchedule {
  day: string;
  period: number;
  grade: string;
  section: string;
  subject: string;
  teacherName?: string;
  room?: string;
  startTime?: string;
  endTime?: string;
}

function normalizeDay(input: string): string {
  const clean = input.trim();
  for (const d of DAYS) {
    if (d.toLowerCase() === clean.toLowerCase() || clean.toLowerCase().startsWith(d.toLowerCase().slice(0, 3))) {
      return d;
    }
  }
  return 'Monday';
}

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
    if (p === shortBreakAfter) {
      currentMinutes += shortBreakMins;
    }
    if (p === lunchBreakAfter) {
      currentMinutes += lunchBreakMins;
    }
  }

  return { start: '08:00', end: '08:40' };
}

function parseExcelBuffer(buffer: Buffer, defaultGrade: string, defaultSection: string): ExtractedSchedule[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const results: ExtractedSchedule[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

    for (const row of rows) {
      const dayVal = row['Day'] || row['day'] || row['DAY'] || row['Day Name'];
      const periodVal = row['Period'] || row['period'] || row['PERIOD'] || row['Slot'] || row['Period No'];
      const subjectVal = row['Subject'] || row['subject'] || row['SUBJECT'] || row['Course'] || row['Subject Name'];
      const teacherVal = row['Teacher Name'] || row['Teacher'] || row['teacher'] || row['Faculty'] || row['Teacher Code'] || row['Class Teacher'] || row['Employee ID'];
      const gradeVal = row['Grade'] || row['grade'] || row['Class'] || row['Class Code'] || defaultGrade;
      const sectionVal = row['Section'] || row['section'] || row['SEC'] || defaultSection;
      const roomVal = row['Room'] || row['room'] || row['Room Code'] || 'Room 10A';

      if (dayVal && subjectVal) {
        const periodNum = parseInt(String(periodVal).replace(/\D/g, ''), 10) || 1;
        results.push({
          day: normalizeDay(String(dayVal)),
          period: Math.min(Math.max(periodNum, 1), 10),
          grade: String(gradeVal).trim() || defaultGrade,
          section: String(sectionVal).trim().toUpperCase() || defaultSection,
          subject: String(subjectVal).trim(),
          teacherName: teacherVal ? String(teacherVal).trim() : undefined,
          room: String(roomVal).trim(),
        });
      }
    }
  }
  return results;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const schoolId = String(formData.get('schoolId') || '60d5ecb8b5c9c22340000001');

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

    const defaultGrade = String(formData.get('grade') || startGrade);
    const defaultSection = String(formData.get('section') || 'A').toUpperCase();

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded. Please select an Excel (.xlsx/.csv) or PDF (.pdf) file.' }, { status: 400 });
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

    // Fetch all existing teachers for school to perform smart matching
    const existingTeachers = await db.teacher.findMany({
      where: { schoolId },
    });

    const resolveTeacher = (nameInput?: string): { id: string; name: string } | null => {
      if (!nameInput || nameInput === 'Assigned Faculty' || nameInput === '—' || nameInput.toUpperCase() === 'NO') return null;

      const cleanInput = nameInput.trim();
      const mappedFullName = SHORT_NAME_MAP[cleanInput] || cleanInput;

      // 1. Exact match by full name or short code
      let matched = existingTeachers.find(
        (t) => t.name.toLowerCase() === mappedFullName.toLowerCase() || t.name.toLowerCase() === cleanInput.toLowerCase()
      );

      // 2. Substring match
      if (!matched) {
        matched = existingTeachers.find(
          (t) => t.name.toLowerCase().includes(mappedFullName.toLowerCase()) || mappedFullName.toLowerCase().includes(t.name.toLowerCase())
        );
      }

      if (matched) {
        return { id: matched.id, name: matched.name };
      }
      return null;
    };

    let savedCount = 0;
    const teachersAssignedSet = new Set<string>();

    for (const item of extractedSchedules) {
      // Apply Saturday constraints
      if (item.day === 'Saturday') {
        if (saturdayType === 'off') continue;
        if (item.period > saturdayPeriods) continue;
      }
      if (item.period > totalPeriodsPerDay) continue;

      let teacherObj = resolveTeacher(item.teacherName);
      let teacherId: string | null = teacherObj ? teacherObj.id : null;

      // If teacher name is present in Excel but not in DB, create new teacher record
      if (!teacherObj && item.teacherName && !['Assigned Faculty', '—', 'NO'].includes(item.teacherName)) {
        const rawName = item.teacherName.trim();
        const resolvedFullName = SHORT_NAME_MAP[rawName] || rawName;
        const teacherEmail = `${resolvedFullName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@takshilaschool.edu`;

        const newTeacher = await db.teacher.create({
          data: {
            name: resolvedFullName,
            email: teacherEmail,
            subject: item.subject,
            password: 'teacher123',
            grades: JSON.stringify([item.grade]),
            schoolId,
          },
        }).catch(() => null);

        if (newTeacher) {
          teacherId = newTeacher.id;
          teachersAssignedSet.add(newTeacher.name);
          existingTeachers.push(newTeacher);
        }
      } else if (teacherObj) {
        teachersAssignedSet.add(teacherObj.name);
      }

      // Compute dynamic start & end times based on school bell schedule settings
      const times = computePeriodTiming(
        item.period,
        startTimeStr,
        durationMins,
        shortBreakAfter,
        shortBreakMins,
        lunchBreakAfter,
        lunchBreakMins
      );

      const existing = await db.schedule.findFirst({
        where: {
          grade: item.grade,
          section: item.section,
          day: item.day,
          period: item.period,
          schoolId,
        },
      }).catch(() => null);

      if (existing) {
        await db.schedule.update({
          where: { id: existing.id },
          data: {
            subject: item.subject,
            teacherId: teacherId || existing.teacherId,
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
            roomId: item.room || 'Room 10A',
          },
        }).catch(() => null);
      }
      savedCount++;
    }

    return NextResponse.json({
      success: true,
      fileName,
      schedulesCreated: savedCount,
      teachersProcessed: teachersAssignedSet.size,
      message: `Successfully processed ${fileName}. Extracted ${savedCount} timetable slots and assigned ${teachersAssignedSet.size} teachers!`,
    });
  } catch (error: any) {
    console.error('Bulk upload error:', error);
    return NextResponse.json({ error: `Failed to process bulk upload: ${error?.message || 'Unknown error'}` }, { status: 500 });
  }
}
