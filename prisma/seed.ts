import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ─── CLASS TEACHER ALLOTMENTS (User Image 2) ───
const CLASS_TEACHERS_MAP: Record<string, string> = {
  'Grade 1 Sunflower': 'Palak Sharma',
  'Grade 1 Jasmine': 'Manisha Rajput',
  'Grade 1 Lotus': 'Pratiksha Sumrao',
  'Grade 2 Lotus': 'Shubhangi Kakani',
  'Grade 2 Sunflower': 'Jishya Kackoth',
  'Grade 2 Jasmine': 'Sonali Jagtap',
  'Grade 3 Jasmine': 'Megha Lohade',
  'Grade 3 Sunflower': 'Kaushalya Bharadwaj',
  'Grade 3 Lotus': 'Sarika Pahade',
  'Grade 3 Rose': 'Jakiya Pathan',
  'Grade 4 Sunflower': 'Pradnya Patil',
  'Grade 4 Lotus': 'Priyanka Desai',
  'Grade 4 Jasmine': 'Huma Kausar Pathan',
  'Grade 5 Lotus': 'Fauziya Ahmed',
  'Grade 5 Jasmine': 'Anita Kulkarni',
  'Grade 5 Sunflower': 'Dipali Wagh',
  'Grade 6 A': 'Ankeeta Baviskar',
  'Grade 6 B': 'Devyani Desai',
  'Grade 6 C': 'Atiya Ansari',
  'Grade 7 A': 'Snehal Maru',
  'Grade 7 B': 'Archana Kadam',
  'Grade 8 A': 'Daval Bachhav',
  'Grade 8 B': 'Afreen Deshmukh',
  'Grade 9 A': 'Jayshri Joshi',
  'Grade 9 B': 'Pratiksha Agrawal',
  'Grade 10 A': 'Amit More',
  'Grade 10 B': 'Kranti Chavan',
};

// ─── SHORT NAME TO FULL NAME MAP ───
const NAME_MAP: Record<string, string> = {
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

// ─── USER ALLOTMENT MATRIX (User Image 1) ───
const REAL_TEACHER_ALLOTMENTS = [
  { grade: "Grade 3", section: "Jasmine", English: "Neeta M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Megha M", Science: "Pradnya M", IT: "Megha M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Megha M", VE: "Huma M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 3", section: "Sunflower", English: "Neeta M", Hindi: "Sarika M", Marathi: "Dipali B", Maths: "Kaushalya M", Science: "Pradnya M", IT: "Shikha M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Kaushalya M", VE: "Huma M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 3", section: "Lotus", English: "Fauziya M", Hindi: "Sarika M", Marathi: "Poonam K", Maths: "Kaushalya M", Science: "Huma M", IT: "Shikha M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Sarika M", VE: "Huma M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 3", section: "Rose", English: "Jishya K", Hindi: "Jakiya M", Marathi: "Dipali B", Maths: "Megha M", Science: "Huma M", IT: "Megha M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Jakiya M", VE: "Pradnya M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 4", section: "Lotus", English: "Neeta M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Kaushalya M", Science: "Pradnya M", IT: "Megha M", Music: "Kaviraj sir", Art: "Sagar sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Priya M", VE: "Huma M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 4", section: "Jasmine", English: "Fauziya M", Hindi: "Priya M", Marathi: "Poonam K", Maths: "Megha M", Science: "Huma M", IT: "Dipali W", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Huma M", VE: "Huma M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 4", section: "Sunflower", English: "Neeta M", Hindi: "Sarika M", Marathi: "Anita M", Maths: "Kaushalya M", Science: "Pradnya M", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Pradnya M", VE: "Pradnya M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 5", section: "Sunflower", English: "Neeta M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Daval Sir", Science: "Divyani M", IT: "Dipali W", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Dipali W", VE: "Huma M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 5", section: "Jasmine", English: "Fauziya M", Hindi: "Sarika M", Marathi: "Anita M", Maths: "Kaushalya M", Science: "Atiya M", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Anita M", VE: "Pradnya M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 5", section: "Lotus", English: "Fauziya M", Hindi: "Sarika M", Marathi: "Poonam K", Maths: "Daval Sir", Science: "Divyani M", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Fauziya M", VE: "Huma M", Library: "Vaibhavi M", PE: "Coach Rakesh" },
  { grade: "Grade 6", section: "A", English: "Afreen M", Hindi: "Priya M", Marathi: "Poonam K", Maths: "Ankita M", Science: "Atiya M", IT: "Dipali W", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Ankita M", VE: "Huma M", PE: "Coach Rakesh" },
  { grade: "Grade 6", section: "B", English: "Afreen M", Hindi: "Sarika M", Marathi: "Anita M", Maths: "Daval Sir", Science: "Divyani M", IT: "Priyanka M", SST: "Snehal M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Divyani M", VE: "Huma M", PE: "Coach Rakesh" },
  { grade: "Grade 6", section: "C", English: "Fauziya M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Ankita M", Science: "Atiya M", IT: "Dipali W", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Atiya M", VE: "Huma M", PE: "Coach Rakesh" },
  { grade: "Grade 7", section: "A", English: "Afreen M", Hindi: "Archana K", Marathi: "Anita M", Maths: "Daval Sir", Science: "Atiya M", IT: "Amit Sir", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Snehal M", VE: "Huma M", PE: "Coach Rakesh" },
  { grade: "Grade 7", section: "B", English: "Afreen M", Hindi: "Archana K", Marathi: "Poonam K", Maths: "Ankita M", Science: "Atiya M", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Archana K", VE: "Huma M", PE: "Coach Rakesh" },
  { grade: "Grade 8", section: "A", English: "Kranti M", Hindi: "Archana K", Marathi: "Jayshri J", Maths: "Daval Sir", Science: "Divyani M", IT: "Amit Sir", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Daval Sir", VE: "Snehal M", PE: "Coach Rakesh" },
  { grade: "Grade 8", section: "B", English: "Afreen M", Hindi: "Archana K", Marathi: "Anita M", Maths: "Ankita M", Science: "Divyani M", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Afreen M", VE: "Snehal M", PE: "Coach Rakesh" },
];

async function main() {
  console.log('🌱 Seeding database for TAKSHILA SCHOOL with 45-Period Timetable for Grade 3 to 8...');

  // Clean DB
  await prisma.teacherNotification.deleteMany();
  await prisma.lessonPlan.deleteMany();
  await prisma.biometricAttendance.deleteMany();
  await prisma.leaveApplication.deleteMany();
  await prisma.substitution.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.student.deleteMany();
  await prisma.curriculumTopic.deleteMany();
  await prisma.curriculumDocument.deleteMany();
  await prisma.curriculum.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.school.deleteMany();

  // Create Takshila School & Pilot School
  const takshilaSchool = await prisma.school.create({
    data: {
      id: '60d5ecb8b5c9c22340000001',
      name: 'Takshila School',
      code: 'TAKSHILA2025',
      email: 'admin@takshilaschool.edu',
      password: 'school123',
    },
  });

  await prisma.school.create({
    data: {
      id: '60d5ecb8b5c9c22340000002',
      name: 'Takshila School Admin',
      code: 'CLIENTPILOT',
      email: 'pilot@client.school',
      password: 'ClientPilot2026',
    },
  });

  // Admins
  await prisma.admin.create({
    data: {
      name: 'Takshila School Admin',
      email: 'admin@takshilaschool.edu',
      password: 'admin123',
      role: 'admin',
    },
  });

  // Extract unique teachers
  const teacherMapByName: Map<string, { id: string; fullName: string; shortName: string; email: string }> = new Map();
  let teacherCounter = 1;

  for (const entry of REAL_TEACHER_ALLOTMENTS) {
    const keys = Object.keys(entry).filter(k => !['grade', 'section'].includes(k));
    for (const subKey of keys) {
      const shortName = (entry as Record<string, any>)[subKey];
      if (shortName && shortName.toUpperCase() !== 'NO') {
        const fullName = NAME_MAP[shortName] || shortName;
        if (!teacherMapByName.has(fullName)) {
          const cleanEmail = fullName.toLowerCase().replace(/[^a-z0-9]/g, '.');
          const hexId = `60d5ecb8b5c9c22340${String(teacherCounter).padStart(6, '0')}`;
          teacherMapByName.set(fullName, {
            id: hexId,
            fullName,
            shortName,
            email: `${cleanEmail}@takshilaschool.edu`,
          });
          teacherCounter++;
        }
      }
    }
  }

  const teacherInputs: Prisma.TeacherCreateManyInput[] = Array.from(teacherMapByName.values()).map(t => ({
    id: t.id,
    name: t.fullName,
    email: t.email,
    password: 'teacher123',
    phone: `+91 98765 ${Math.floor(10000 + Math.random() * 90000)}`,
    subject: 'General',
    grades: JSON.stringify(['Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8']),
    availability: JSON.stringify([]),
    role: 'teacher',
    schoolId: takshilaSchool.id,
  }));

  await prisma.teacher.createMany({ data: teacherInputs });
  console.log(`✅ Inserted ${teacherInputs.length} Teachers into Takshila School DB`);

  // Bell timings table from Excel
  const timeSlots: Record<number, { start: string; end: string }> = {
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

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const busyTeacher = new Set<string>(); // "teacherId|day|period"
  const schedulesToInsert: Prisma.ScheduleCreateManyInput[] = [];

  for (const entry of REAL_TEACHER_ALLOTMENTS) {
    const { grade, section } = entry;
    const classKey = `${grade} ${section}`;
    const classTeacherFullName = CLASS_TEACHERS_MAP[classKey] || 'Megha Lohade';

    const subjectPairs: { subject: string; teacherId: string; teacherName: string }[] = [];
    const keys = Object.keys(entry).filter(k => !['grade', 'section'].includes(k));
    for (const subKey of keys) {
      const shortName = (entry as Record<string, any>)[subKey];
      if (shortName && shortName.toUpperCase() !== 'NO') {
        const fullName = NAME_MAP[shortName] || shortName;
        const teacherObj = teacherMapByName.get(fullName);
        if (teacherObj) {
          const subName = subKey === 'IT' ? 'Computer Science' : subKey === 'PE' ? 'Physical Education' : subKey;
          subjectPairs.push({ subject: subName, teacherId: teacherObj.id, teacherName: fullName });
        }
      }
    }

    if (subjectPairs.length === 0) continue;

    // Find Class Teacher's subject for this class
    const ctPair = subjectPairs.find(p => p.teacherName === classTeacherFullName) || subjectPairs[0];

    for (const day of days) {
      const maxP = day === 'Saturday' ? 5 : 8;
      const assignedToday: { period: number; subject: string; teacherName: string }[] = [];

      for (let p = 1; p <= maxP; p++) {
        const slot = timeSlots[p];
        let chosenSubj = '';
        let chosenTeacherId = '';
        let chosenTeacherName = '';

        // Rule 3: Wednesday Period 1 PT for Grade 3 to 5
        if (day === 'Wednesday' && p === 1 && ['Grade 3', 'Grade 4', 'Grade 5'].includes(grade)) {
          const peObj = teacherMapByName.get('Coach Rakesh Kumar');
          chosenSubj = 'Physical Education';
          chosenTeacherId = peObj?.id || subjectPairs[0].teacherId;
          chosenTeacherName = 'Coach Rakesh Kumar';
        }
        // Rule 4: Period 1 Class Teacher anchoring
        else if (p === 1) {
          chosenSubj = ctPair.subject;
          chosenTeacherId = ctPair.teacherId;
          chosenTeacherName = ctPair.teacherName;
        }
        // Rule 2: Wednesday extra Sports period for Grade 3 to 5 (non-consecutive with P1)
        else if (day === 'Wednesday' && (p === 6 || p === 7) && ['Grade 3', 'Grade 4', 'Grade 5'].includes(grade)) {
          const hasExtraSports = assignedToday.some(x => x.subject === 'Physical Education' && x.period > 1);
          if (!hasExtraSports) {
            const peObj = teacherMapByName.get('Coach Rakesh Kumar');
            const peTeacherId = peObj?.id || subjectPairs[0].teacherId;
            const lastAssigned = assignedToday[assignedToday.length - 1];

            if (lastAssigned?.subject !== 'Physical Education' && !busyTeacher.has(`${peTeacherId}|${day}|${p}`)) {
              chosenSubj = 'Physical Education';
              chosenTeacherId = peTeacherId;
              chosenTeacherName = 'Coach Rakesh Kumar';
            }
          }
        }

        // Rule 1: Non-consecutive same subject search if not explicitly set above
        if (!chosenSubj) {
          const prevSubj = assignedToday[assignedToday.length - 1]?.subject;

          // Sort subjects by least used today
          const sortedCandidates = [...subjectPairs].sort((a, b) => {
            const cA = assignedToday.filter(x => x.subject === a.subject).length;
            const cB = assignedToday.filter(x => x.subject === b.subject).length;
            return cA - cB;
          });

          for (const item of sortedCandidates) {
            const countToday = assignedToday.filter(x => x.subject === item.subject).length;
            if (item.subject === prevSubj) continue;
            if (countToday >= 2) continue;
            if (busyTeacher.has(`${item.teacherId}|${day}|${p}`)) continue;

            chosenSubj = item.subject;
            chosenTeacherId = item.teacherId;
            chosenTeacherName = item.teacherName;
            break;
          }

          // Fallback: any available teacher for this period
          if (!chosenSubj) {
            for (const item of subjectPairs) {
              if (!busyTeacher.has(`${item.teacherId}|${day}|${p}`)) {
                chosenSubj = item.subject;
                chosenTeacherId = item.teacherId;
                chosenTeacherName = item.teacherName;
                break;
              }
            }
          }
        }

        if (!chosenSubj) {
          chosenSubj = subjectPairs[0].subject;
          chosenTeacherId = subjectPairs[0].teacherId;
          chosenTeacherName = subjectPairs[0].teacherName;
        }

        busyTeacher.add(`${chosenTeacherId}|${day}|${p}`);
        assignedToday.push({ period: p, subject: chosenSubj, teacherName: chosenTeacherName });

        schedulesToInsert.push({
          grade,
          section,
          day,
          period: p,
          subject: chosenSubj,
          teacherId: chosenTeacherId,
          schoolId: takshilaSchool.id,
          topic: `${chosenSubj} - Period ${p}`,
          roomId: `Room ${grade.replace('Grade ', '')}${section}`,
          startTime: slot.start,
          endTime: slot.end,
        });
      }
    }
  }

  await prisma.schedule.createMany({ data: schedulesToInsert });
  console.log(`🎉 Successfully Seeded ${schedulesToInsert.length} Clash-Free Schedule Slots for Takshila School!`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
