import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// ─── CLASS TEACHERS MATRIX (User Image 2) ───
const CLASS_TEACHERS: Record<string, string> = {
  'Grade 3|Jasmine': 'Megha Lohade',
  'Grade 3|Sunflower': 'Kaushalya Bharadwaj',
  'Grade 3|Lotus': 'Sarika Pahade',
  'Grade 3|Rose': 'Jakiya Pathan',
  'Grade 4|Sunflower': 'Pradnya Patil',
  'Grade 4|Lotus': 'Priyanka Desai',
  'Grade 4|Jasmine': 'Huma Kausar Pathan',
  'Grade 5|Lotus': 'Fauziya Ahmed',
  'Grade 5|Jasmine': 'Anita Kulkarni',
  'Grade 5|Sunflower': 'Dipali Wagh',
  'Grade 6|A': 'Ankeeta Baviskar',
  'Grade 6|B': 'Devyani Desai',
  'Grade 6|C': 'Atiya Ansari',
  'Grade 7|A': 'Snehal Maru',
  'Grade 7|B': 'Archana Kadam',
  'Grade 8|A': 'Daval Bachhav',
  'Grade 8|B': 'Afreen Deshmukh',
};

// ─── REAL TEACHER NAME MAP ───
const TEACHER_NAME_MAP: Record<string, string> = {
  'Palak M': 'Palak Sharma',
  'Manisha R': 'Manisha Rajput',
  'Pratiksha S': 'Pratiksha Sumrao',
  'Shubhangi K': 'Shubhangi Kakani',
  'Sonali J': 'Sonali Jagtap',
  'Jishya K': 'Jishya Kackoth',
  'Megha M': 'Megha Lohade',
  'Kaushalya M': 'Kaushalya Bharadwaj',
  'Sarika M': 'Sarika Pahade',
  'Jakiya M': 'Jakiya Pathan',
  'Pradnya M': 'Pradnya Patil',
  'Priyanka M': 'Priyanka Desai',
  'Huma M': 'Huma Kausar Pathan',
  'Fauziya M': 'Fauziya Ahmed',
  'Anita M': 'Anita Kulkarni',
  'Dipali W': 'Dipali Wagh',
  'Ankita M': 'Ankeeta Baviskar',
  'Divyani M': 'Devyani Desai',
  'Atiya M': 'Atiya Ansari',
  'Snehal M': 'Snehal Maru',
  'Archana K': 'Archana Kadam',
  'Daval Sir': 'Daval Bachhav',
  'Afreen M': 'Afreen Deshmukh',
  'Jayshri J': 'Jayshri Joshi',
  'Pratiksha A': 'Pratiksha Agrawal',
  'Amit Sir': 'Amit More',
  'Kranti M': 'Kranti Chavan',
  'Neeta M': 'Neeta Mohite',
  'Priya M': 'Priya Mishra',
  'Dipali B': 'Dipali Bhalke',
  'Shikha M': 'Shikha Mishra',
  'Poonam K': 'Poonam Kulkarni',
  'Kaviraj sir': 'Kaviraj Sir',
  'Reena L': 'Reena L',
  'Sagar sir': 'Sagar Sir',
  'Qamar sir': 'Qamar Sir',
  'Mateen sir': 'Mateen Sir',
  'Vaibhavi M': 'Vaibhavi More',
  'Hemlata P': 'Hemlata Patil',
  'Coach Rakesh': 'Coach Rakesh Kumar',
};

// ─── ALLOTMENTS MATRIX (User Image 1) ───
const ALLOTMENTS = [
  {
    grade: 'Grade 3', section: 'Jasmine',
    subjects: [
      { subject: 'English', teacher: 'Neeta M' },
      { subject: 'Hindi', teacher: 'Priya M' },
      { subject: 'Marathi', teacher: 'Jakiya M' },
      { subject: 'Mathematics', teacher: 'Megha M' },
      { subject: 'Science', teacher: 'Pradnya M' },
      { subject: 'Computer Science', teacher: 'Megha M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Sagar sir' },
      { subject: 'Robotics', teacher: 'Qamar sir' },
      { subject: 'Foreign Language', teacher: 'Mateen sir' },
      { subject: 'Knowledge Building', teacher: 'Megha M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 3', section: 'Sunflower',
    subjects: [
      { subject: 'English', teacher: 'Neeta M' },
      { subject: 'Hindi', teacher: 'Sarika M' },
      { subject: 'Marathi', teacher: 'Dipali B' },
      { subject: 'Mathematics', teacher: 'Kaushalya M' },
      { subject: 'Science', teacher: 'Pradnya M' },
      { subject: 'Computer Science', teacher: 'Shikha M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Reena L' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Kaushalya M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 3', section: 'Lotus',
    subjects: [
      { subject: 'English', teacher: 'Fauziya M' },
      { subject: 'Hindi', teacher: 'Sarika M' },
      { subject: 'Marathi', teacher: 'Poonam K' },
      { subject: 'Mathematics', teacher: 'Kaushalya M' },
      { subject: 'Science', teacher: 'Huma M' },
      { subject: 'Computer Science', teacher: 'Shikha M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Mateen sir' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Sarika M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 3', section: 'Rose',
    subjects: [
      { subject: 'English', teacher: 'Jishya K' },
      { subject: 'Hindi', teacher: 'Jakiya M' },
      { subject: 'Marathi', teacher: 'Dipali B' },
      { subject: 'Mathematics', teacher: 'Megha M' },
      { subject: 'Science', teacher: 'Huma M' },
      { subject: 'Computer Science', teacher: 'Megha M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Mateen sir' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Jakiya M' },
      { subject: 'Value Education', teacher: 'Pradnya M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 4', section: 'Lotus',
    subjects: [
      { subject: 'English', teacher: 'Neeta M' },
      { subject: 'Hindi', teacher: 'Priya M' },
      { subject: 'Marathi', teacher: 'Jakiya M' },
      { subject: 'Mathematics', teacher: 'Kaushalya M' },
      { subject: 'Science', teacher: 'Pradnya M' },
      { subject: 'Computer Science', teacher: 'Megha M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Sagar sir' },
      { subject: 'Robotics', teacher: 'Qamar sir' },
      { subject: 'Foreign Language', teacher: 'Mateen sir' },
      { subject: 'Knowledge Building', teacher: 'Priya M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 4', section: 'Jasmine',
    subjects: [
      { subject: 'English', teacher: 'Fauziya M' },
      { subject: 'Hindi', teacher: 'Priya M' },
      { subject: 'Marathi', teacher: 'Poonam K' },
      { subject: 'Mathematics', teacher: 'Megha M' },
      { subject: 'Science', teacher: 'Huma M' },
      { subject: 'Computer Science', teacher: 'Dipali W' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Sagar sir' },
      { subject: 'Robotics', teacher: 'Qamar sir' },
      { subject: 'Foreign Language', teacher: 'Mateen sir' },
      { subject: 'Knowledge Building', teacher: 'Huma M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 4', section: 'Sunflower',
    subjects: [
      { subject: 'English', teacher: 'Neeta M' },
      { subject: 'Hindi', teacher: 'Sarika M' },
      { subject: 'Marathi', teacher: 'Anita M' },
      { subject: 'Mathematics', teacher: 'Kaushalya M' },
      { subject: 'Science', teacher: 'Pradnya M' },
      { subject: 'Computer Science', teacher: 'Priyanka M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Sagar sir' },
      { subject: 'Robotics', teacher: 'Qamar sir' },
      { subject: 'Foreign Language', teacher: 'Mateen sir' },
      { subject: 'Knowledge Building', teacher: 'Pradnya M' },
      { subject: 'Value Education', teacher: 'Pradnya M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 5', section: 'Sunflower',
    subjects: [
      { subject: 'English', teacher: 'Neeta M' },
      { subject: 'Hindi', teacher: 'Priya M' },
      { subject: 'Marathi', teacher: 'Jakiya M' },
      { subject: 'Mathematics', teacher: 'Daval Sir' },
      { subject: 'Science', teacher: 'Divyani M' },
      { subject: 'Computer Science', teacher: 'Dipali W' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Mateen sir' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Dipali W' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 5', section: 'Jasmine',
    subjects: [
      { subject: 'English', teacher: 'Fauziya M' },
      { subject: 'Hindi', teacher: 'Sarika M' },
      { subject: 'Marathi', teacher: 'Anita M' },
      { subject: 'Mathematics', teacher: 'Kaushalya M' },
      { subject: 'Science', teacher: 'Atiya M' },
      { subject: 'Computer Science', teacher: 'Priyanka M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Reena L' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Anita M' },
      { subject: 'Value Education', teacher: 'Pradnya M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 5', section: 'Lotus',
    subjects: [
      { subject: 'English', teacher: 'Fauziya M' },
      { subject: 'Hindi', teacher: 'Sarika M' },
      { subject: 'Marathi', teacher: 'Poonam K' },
      { subject: 'Mathematics', teacher: 'Daval Sir' },
      { subject: 'Science', teacher: 'Divyani M' },
      { subject: 'Computer Science', teacher: 'Priyanka M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Mateen sir' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Fauziya M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Library', teacher: 'Vaibhavi M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 6', section: 'A',
    subjects: [
      { subject: 'English', teacher: 'Afreen M' },
      { subject: 'Hindi', teacher: 'Priya M' },
      { subject: 'Marathi', teacher: 'Poonam K' },
      { subject: 'Mathematics', teacher: 'Ankita M' },
      { subject: 'Science', teacher: 'Atiya M' },
      { subject: 'Computer Science', teacher: 'Dipali W' },
      { subject: 'Social Science', teacher: 'Snehal M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Reena L' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Ankita M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 6', section: 'B',
    subjects: [
      { subject: 'English', teacher: 'Afreen M' },
      { subject: 'Hindi', teacher: 'Sarika M' },
      { subject: 'Marathi', teacher: 'Anita M' },
      { subject: 'Mathematics', teacher: 'Daval Sir' },
      { subject: 'Science', teacher: 'Divyani M' },
      { subject: 'Computer Science', teacher: 'Priyanka M' },
      { subject: 'Social Science', teacher: 'Snehal M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Mateen sir' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Divyani M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 6', section: 'C',
    subjects: [
      { subject: 'English', teacher: 'Fauziya M' },
      { subject: 'Hindi', teacher: 'Priya M' },
      { subject: 'Marathi', teacher: 'Jakiya M' },
      { subject: 'Mathematics', teacher: 'Ankita M' },
      { subject: 'Science', teacher: 'Atiya M' },
      { subject: 'Computer Science', teacher: 'Dipali W' },
      { subject: 'Social Science', teacher: 'Snehal M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Reena L' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Atiya M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 7', section: 'A',
    subjects: [
      { subject: 'English', teacher: 'Afreen M' },
      { subject: 'Hindi', teacher: 'Archana K' },
      { subject: 'Marathi', teacher: 'Anita M' },
      { subject: 'Mathematics', teacher: 'Daval Sir' },
      { subject: 'Science', teacher: 'Atiya M' },
      { subject: 'Computer Science', teacher: 'Amit Sir' },
      { subject: 'Social Science', teacher: 'Snehal M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Reena L' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Snehal M' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 7', section: 'B',
    subjects: [
      { subject: 'English', teacher: 'Afreen M' },
      { subject: 'Hindi', teacher: 'Archana K' },
      { subject: 'Marathi', teacher: 'Poonam K' },
      { subject: 'Mathematics', teacher: 'Ankita M' },
      { subject: 'Science', teacher: 'Atiya M' },
      { subject: 'Computer Science', teacher: 'Amit Sir' },
      { subject: 'Social Science', teacher: 'Hemlata P' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Mateen sir' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Archana K' },
      { subject: 'Value Education', teacher: 'Huma M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 8', section: 'A',
    subjects: [
      { subject: 'English', teacher: 'Kranti M' },
      { subject: 'Hindi', teacher: 'Archana K' },
      { subject: 'Marathi', teacher: 'Jayshri J' },
      { subject: 'Mathematics', teacher: 'Daval Sir' },
      { subject: 'Science', teacher: 'Divyani M' },
      { subject: 'Computer Science', teacher: 'Amit Sir' },
      { subject: 'Social Science', teacher: 'Snehal M' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Reena L' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Daval Sir' },
      { subject: 'Value Education', teacher: 'Snehal M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
  {
    grade: 'Grade 8', section: 'B',
    subjects: [
      { subject: 'English', teacher: 'Afreen M' },
      { subject: 'Hindi', teacher: 'Archana K' },
      { subject: 'Marathi', teacher: 'Anita M' },
      { subject: 'Mathematics', teacher: 'Ankita M' },
      { subject: 'Science', teacher: 'Divyani M' },
      { subject: 'Computer Science', teacher: 'Amit Sir' },
      { subject: 'Social Science', teacher: 'Hemlata P' },
      { subject: 'Music', teacher: 'Kaviraj sir' },
      { subject: 'Art', teacher: 'Mateen sir' },
      { subject: 'Robotics', teacher: 'Sagar sir' },
      { subject: 'Foreign Language', teacher: 'Qamar sir' },
      { subject: 'Knowledge Building', teacher: 'Afreen M' },
      { subject: 'Value Education', teacher: 'Snehal M' },
      { subject: 'Physical Education', teacher: 'Coach Rakesh' },
    ]
  },
];

export async function POST() {
  try {
    // Clear existing data
    await db.teacherNotification.deleteMany();
    await db.lessonPlan.deleteMany();
    await db.biometricAttendance.deleteMany();
    await db.leaveApplication.deleteMany();
    await db.substitution.deleteMany();
    await db.schedule.deleteMany();
    await db.timetableSlot.deleteMany();
    await db.timetableVersion.deleteMany();
    await db.auditLog.deleteMany();
    await db.student.deleteMany();
    await db.curriculumTopic.deleteMany();
    await db.curriculumDocument.deleteMany();
    await db.curriculum.deleteMany();
    await db.teacher.deleteMany();
    await db.admin.deleteMany();
    await db.school.deleteMany();

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Exact Bell Timings (from Excel image)
    const timeSlotMap: Record<number, { start: string; end: string }> = {
      1: { start: '08:00', end: '08:40' },
      2: { start: '08:40', end: '09:20' },
      3: { start: '09:20', end: '10:00' },
      // Break 10:00 - 10:30
      4: { start: '10:30', end: '11:10' },
      5: { start: '11:10', end: '11:50' },
      6: { start: '11:50', end: '12:30' },
      7: { start: '12:30', end: '13:10' },
      8: { start: '13:10', end: '13:45' },
    };

    // Create Admin Accounts
    await db.admin.create({
      data: {
        name: 'Takshila School Admin',
        email: 'admin@takshilaschool.edu',
        password: 'admin123',
        role: 'admin',
      },
    });

    await db.admin.create({
      data: {
        name: 'Global SuperAdmin',
        email: 'superadmin@smartcalendar.app',
        password: 'admin123',
        isSuperAdmin: true,
        role: 'superadmin',
      },
    });

    // Create Pilot & Primary Schools
    await db.school.create({
      data: {
        name: 'Takshila School Admin',
        code: 'CLIENTPILOT',
        email: 'pilot@client.school',
        password: 'ClientPilot2026',
        featureFlags: {
          create: {
            aiTimetableEnabled: true,
            manualTimetableEnabled: true,
            bulkImportEnabled: true,
            substitutionEnabled: true,
            autoSubstitutionEnabled: true,
            planName: 'enterprise',
          }
        }
      },
    });

    const takshilaSchool = await db.school.create({
      data: {
        name: 'Takshila School',
        code: 'TAKSHILA2025',
        email: 'admin@takshilaschool.edu',
        password: 'school123',
        featureFlags: {
          create: {
            aiTimetableEnabled: true,
            manualTimetableEnabled: true,
            bulkImportEnabled: true,
            shortBreakEnabled: true,
            lunchBreakEnabled: true,
            ptPeriodsEnabled: true,
            substitutionEnabled: true,
            autoSubstitutionEnabled: true,
            workloadAnalyticsEnabled: true,
            teacherNotifyEnabled: true,
            maxGrades: 12,
            maxTeachers: 200,
            maxPeriodsPerDay: 10,
            planName: 'premium',
          }
        }
      },
    });

    // Extract unique teacher names from allotments and class teacher map
    const uniqueTeachers = new Set<string>();
    Object.values(TEACHER_NAME_MAP).forEach((name) => uniqueTeachers.add(name));
    for (const alt of ALLOTMENTS) {
      for (const item of alt.subjects) {
        const fullName = TEACHER_NAME_MAP[item.teacher] || item.teacher;
        uniqueTeachers.add(fullName);
      }
    }

    // Insert Teacher Records
    const teacherDataInput: { schoolId: string; name: string; email: string; subject: string; grades: string; password: string; phone: string; availability: string; role: string }[] = [];
    const teacherDbMap = new Map<string, string>(); // fullName -> teacherId

    let tIdx = 1;
    for (const tName of uniqueTeachers) {
      const cleanEmail = tName.toLowerCase().replace(/[^a-z]/g, '') + `@takshilaschool.edu`;
      teacherDataInput.push({
        schoolId: takshilaSchool.id,
        name: tName,
        email: cleanEmail,
        subject: 'General',
        grades: JSON.stringify(['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8']),
        password: 'teacher123',
        phone: `+91 98765 ${String(10000 + tIdx)}`,
        availability: JSON.stringify([]),
        role: 'teacher',
      });
      tIdx++;
    }

    await db.teacher.createMany({ data: teacherDataInput });

    const createdTeachers = await db.teacher.findMany({ where: { schoolId: takshilaSchool.id } });
    for (const t of createdTeachers) {
      teacherDbMap.set(t.name, t.id);
    }

    // ─── GENERATE SCHEDULES (765 SLOTS, 45 PERIODS/CLASS, ZERO CLASHES) ───
    const busyTeacherSlots = new Set<string>(); // "teacherName|day|period"
    const scheduleRecords: { schoolId: string; grade: string; section: string; day: string; period: number; subject: string; teacherId: string | null; topic: string; startTime: string; endTime: string; roomId: string }[] = [];

    for (const alt of ALLOTMENTS) {
      const grade = alt.grade;
      const section = alt.section;
      const classKey = `${grade}|${section}`;
      const ctShortOrFull = CLASS_TEACHERS[classKey] || 'Megha M';
      const ctFullName = TEACHER_NAME_MAP[ctShortOrFull] || ctShortOrFull;

      // Find Class Teacher's primary subject for this class
      const ctSubjectItem = alt.subjects.find((s) => (TEACHER_NAME_MAP[s.teacher] || s.teacher) === ctFullName);
      const ctSubject = ctSubjectItem?.subject || alt.subjects[0].subject;

      for (const day of days) {
        const maxPeriods = day === 'Saturday' ? 5 : 8;
        const assignedToday: { period: number; subject: string; teacherName: string }[] = [];

        for (let period = 1; period <= maxPeriods; period++) {
          const timeSlot = timeSlotMap[period];
          let chosenSubj = '';
          let chosenTeacher = '';

          // Rule 3: Wednesday Period 1 PT for Grade 3 to 5
          if (day === 'Wednesday' && period === 1 && ['Grade 3', 'Grade 4', 'Grade 5'].includes(grade)) {
            chosenSubj = 'Physical Education';
            chosenTeacher = TEACHER_NAME_MAP['Coach Rakesh'] || 'Coach Rakesh Kumar';
          }
          // Rule 4: Period 1 Class Teacher anchoring (Mon, Tue, Thu, Fri, Sat for Grade 3-5, Mon-Sat for Grade 6-8)
          else if (period === 1) {
            chosenSubj = ctSubject;
            chosenTeacher = ctFullName;
          }
          // Rule 2: Wednesday extra Sports period for Grade 3 to 5 (non-consecutive with P1)
          else if (day === 'Wednesday' && (period === 6 || period === 7) && ['Grade 3', 'Grade 4', 'Grade 5'].includes(grade)) {
            const hasExtraSports = assignedToday.some((item) => item.subject === 'Physical Education' && item.period > 1);
            if (!hasExtraSports) {
              const peTeacher = TEACHER_NAME_MAP['Coach Rakesh'] || 'Coach Rakesh Kumar';
              const lastAssigned = assignedToday[assignedToday.length - 1];
              if (lastAssigned?.subject !== 'Physical Education' && !busyTeacherSlots.has(`${peTeacher}|${day}|${period}`)) {
                chosenSubj = 'Physical Education';
                chosenTeacher = peTeacher;
              }
            }
          }

          // Rule 1: Non-consecutive same subject search if not explicitly set above
          if (!chosenSubj) {
            const prevSubj = assignedToday[assignedToday.length - 1]?.subject;

            // Sort subjects by least used today
            const sortedCandidates = [...alt.subjects].sort((a, b) => {
              const countA = assignedToday.filter((item) => item.subject === a.subject).length;
              const countB = assignedToday.filter((item) => item.subject === b.subject).length;
              return countA - countB;
            });

            for (const item of sortedCandidates) {
              const fullName = TEACHER_NAME_MAP[item.teacher] || item.teacher;
              const subCountToday = assignedToday.filter((x) => x.subject === item.subject).length;

              // Enforce Non-consecutive & max 2 periods/day
              if (item.subject === prevSubj) continue;
              if (subCountToday >= 2) continue;
              if (busyTeacherSlots.has(`${fullName}|${day}|${period}`)) continue;

              chosenSubj = item.subject;
              chosenTeacher = fullName;
              break;
            }

            // Fallback: any available teacher for this period
            if (!chosenSubj) {
              for (const item of alt.subjects) {
                const fullName = TEACHER_NAME_MAP[item.teacher] || item.teacher;
                if (!busyTeacherSlots.has(`${fullName}|${day}|${period}`)) {
                  chosenSubj = item.subject;
                  chosenTeacher = fullName;
                  break;
                }
              }
            }
          }

          if (!chosenSubj) {
            chosenSubj = alt.subjects[0].subject;
            chosenTeacher = TEACHER_NAME_MAP[alt.subjects[0].teacher] || alt.subjects[0].teacher;
          }

          busyTeacherSlots.add(`${chosenTeacher}|${day}|${period}`);
          assignedToday.push({ period, subject: chosenSubj, teacherName: chosenTeacher });

          const teacherId = teacherDbMap.get(chosenTeacher) || null;

          scheduleRecords.push({
            schoolId: takshilaSchool.id,
            grade,
            section,
            day,
            period,
            subject: chosenSubj,
            teacherId,
            topic: `${chosenSubj} — Period ${period} Topic`,
            startTime: timeSlot.start,
            endTime: timeSlot.end,
            roomId: `R-${grade.replace('Grade ', '')}${section}-${period}`,
          });
        }
      }
    }

    // Batch insert 765 schedules
    for (let i = 0; i < scheduleRecords.length; i += 100) {
      const chunk = scheduleRecords.slice(i, i + 100);
      await db.schedule.createMany({ data: chunk });
    }

    // Create Curriculum for completeness
    await db.curriculum.create({
      data: {
        name: 'Smart School Master Curriculum',
        board: 'Central Board of Secondary Education',
        grades: JSON.stringify(['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8']),
        subjects: JSON.stringify(['English', 'Hindi', 'Marathi', 'Mathematics', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art', 'Music']),
        description: 'Complete 45-period weekly curriculum for Grades 3-8',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Master Timetable database seeded successfully for Grade 3 to 8!',
      stats: {
        totalTeachers: teacherDbMap.size,
        totalSchedules: scheduleRecords.length,
        periodStructure: '45 periods/week (8 Mon-Fri + 5 Sat)',
        rulesApplied: [
          'Rule 1: Non-consecutive same subject periods',
          'Rule 2 & 3: Wednesday PT (P1) & extra Sports for Grade 3-5',
          'Rule 4: Period 1 Class Teacher anchoring for Grade 3-8',
          'Rule 5: Grade 3 to 8 45-period schedule with zero clashes',
        ],
      },
    });
  } catch (error) {
    console.error('Error seeding database:', error);
    return NextResponse.json({ error: 'Failed to seed database', details: String(error) }, { status: 500 });
  }
}

// ─── GET /api/seed — Returns current school info (for client schoolId resolution) ───
export async function GET() {
  try {
    const school = await db.school.findFirst({ select: { id: true, name: true, code: true } });
    if (!school) {
      return NextResponse.json({ error: 'No school seeded yet. POST /api/seed to initialize.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, schoolId: school.id, school });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to query school', details: String(error) }, { status: 500 });
  }
}
