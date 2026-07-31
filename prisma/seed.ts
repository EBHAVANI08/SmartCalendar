import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// IMAGE 1: CLASS TEACHERS MAP
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

// SHORT NAME TO FULL NAME MAP (Combining Image 1 & Image 2)
const NAME_MAP: Record<string, string> = {
  'Palak M': 'Palak Sharma',
  'Pratiksha S': 'Pratiksha Sumrao',
  'Manisha R': 'Manisha Rajput',
  'Shubhangi K': 'Shubhangi Kakani',
  'Sonali J': 'Sonali Jagtap',
  'Jishya K': 'Jishya Kackoth',
  'Neeta M': 'Neeta Mehta',
  'Fauziya M': 'Fauziya Ahmed',
  'Afreen M': 'Afreen Deshmukh',
  'Kranti M': 'Kranti Chavan',
  'Sayeed Sir': 'Sayeed Ahmed',
  'Komal M': 'Komal More',
  'Priya M': 'Priya Mohite',
  'Sarika M': 'Sarika Pahade',
  'Jakiya M': 'Jakiya Pathan',
  'Archana K': 'Archana Kadam',
  'Dipali B': 'Dipali Bhonsle',
  'Vaibhavi M': 'Vaibhavi Mane',
  'Poonam K': 'Poonam Kulkarni',
  'Anita M': 'Anita Kulkarni',
  'Jayshri J': 'Jayshri Joshi',
  'Archana S': 'Archana Shinde',
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
  'Hemlata P': 'Hemlata Pawar',
  'Kaviraj sir': 'Kaviraj Jadhav',
  'Reena L': 'Reena Lokhande',
  'Mateen sir': 'Mateen Shaikh',
  'Sagar sir': 'Sagar Patil',
  'Qamar sir': 'Qamar Khan',
  'Roshan Sir': 'Roshan Salunkhe',
};

// IMAGE 2: SUBJECT ALLOTMENT MATRIX
const REAL_TEACHER_ALLOTMENTS = [
  { grade: "Grade 1", section: "Sunflower", English: "Palak M", Hindi: "Komal M", Marathi: "Dipali B", Maths: "Palak M", Science: "Palak M", IT: "Dipali W", Music: "Kaviraj sir", Art: "Reena L", KB: "Palak M", VE: "Palak M", Phonic: "Palak M", Library: "Vaibhavi M" },
  { grade: "Grade 1", section: "Lotus", English: "Pratiksha S", Hindi: "Komal M", Marathi: "Dipali B", Maths: "Pratiksha S", Science: "Pratiksha S", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Reena L", KB: "Pratiksha S", VE: "Pratiksha S", Phonic: "Pratiksha S", Library: "Vaibhavi M" },
  { grade: "Grade 1", section: "Jasmine", English: "Manisha R", Hindi: "Komal M", Marathi: "Vaibhavi M", Maths: "Manisha R", Science: "Manisha R", IT: "Dipali W", Music: "Kaviraj sir", Art: "Reena L", KB: "Manisha R", VE: "Manisha R", Library: "Vaibhavi M" },
  { grade: "Grade 2", section: "Lotus", English: "Shubhangi K", Hindi: "Komal M", Marathi: "Dipali B", Maths: "Shubhangi K", Science: "Shubhangi K", IT: "Shikha M", Music: "Kaviraj sir", Art: "Reena L", KB: "Shubhangi K", VE: "Shubhangi K", Phonic: "Palak M", Library: "Vaibhavi M" },
  { grade: "Grade 2", section: "Jasmine", English: "Sonali J", Hindi: "Komal M", Marathi: "Vaibhavi M", Maths: "Sonali J", Science: "Sonali J", IT: "Megha M", Music: "Kaviraj sir", Art: "Reena L", KB: "Sonali J", VE: "Sonali J", Library: "Vaibhavi M" },
  { grade: "Grade 2", section: "Sunflower", English: "Jishya K", Hindi: "Komal M", Marathi: "Dipali B", Maths: "Jishya K", Science: "Jishya K", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Reena L", KB: "Jishya K", VE: "Jishya K", Phonic: "Jishya K", Library: "Vaibhavi M" },
  { grade: "Grade 3", section: "Jasmine", English: "Neeta M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Megha M", Science: "Pradnya M", IT: "Megha M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Megha M", VE: "Huma M", Library: "Vaibhavi M" },
  { grade: "Grade 3", section: "Sunflower", English: "Neeta M", Hindi: "Sarika M", Marathi: "Dipali B", Maths: "Kaushalya M", Science: "Pradnya M", IT: "Shikha M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Kaushalya M", VE: "Huma M", Library: "Vaibhavi M" },
  { grade: "Grade 3", section: "Lotus", English: "Fauziya M", Hindi: "Sarika M", Marathi: "Poonam K", Maths: "Kaushalya M", Science: "Huma M", IT: "Shikha M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Sarika M", VE: "Huma M", Library: "Vaibhavi M" },
  { grade: "Grade 3", section: "Rose", English: "Jishya K", Hindi: "Jakiya M", Marathi: "Dipali B", Maths: "Megha M", Science: "Huma M", IT: "Megha M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Jakiya M", VE: "Pradnya M", Library: "Vaibhavi M" },
  { grade: "Grade 4", section: "Lotus", English: "Neeta M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Kaushalya M", Science: "Pradnya M", IT: "Megha M", Music: "Kaviraj sir", Art: "Sagar sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Priya M", VE: "Huma M", Library: "Vaibhavi M" },
  { grade: "Grade 4", section: "Jasmine", English: "Fauziya M", Hindi: "Priya M", Marathi: "Poonam K", Maths: "Megha M", Science: "Huma M", IT: "Dipali W", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Huma M", VE: "Huma M", Library: "Vaibhavi M" },
  { grade: "Grade 4", section: "Sunflower", English: "Neeta M", Hindi: "Sarika M", Marathi: "Anita M", Maths: "Kaushalya M", Science: "Pradnya M", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Pradnya M", VE: "Pradnya M", Library: "Vaibhavi M" },
  { grade: "Grade 5", section: "Sunflower", English: "Neeta M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Daval Sir", Science: "Divyani M", IT: "Dipali W", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Dipali W", VE: "Huma M", Library: "Vaibhavi M" },
  { grade: "Grade 5", section: "Jasmine", English: "Fauziya M", Hindi: "Sarika M", Marathi: "Anita M", Maths: "Kaushalya M", Science: "Atiya M", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Anita M", VE: "Pradnya M", Library: "Vaibhavi M" },
  { grade: "Grade 5", section: "Lotus", English: "Fauziya M", Hindi: "Sarika M", Marathi: "Poonam K", Maths: "Daval Sir", Science: "Divyani M", IT: "Priyanka M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Fauziya M", VE: "Huma M", Library: "Vaibhavi M" },
  { grade: "Grade 6", section: "A", English: "Afreen M", Hindi: "Priya M", Marathi: "Poonam K", Maths: "Ankita M", Science: "Atiya M", IT: "Dipali W", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Ankita M", VE: "Huma M" },
  { grade: "Grade 6", section: "B", English: "Afreen M", Hindi: "Sarika M", Marathi: "Anita M", Maths: "Daval Sir", Science: "Divyani M", IT: "Priyanka M", SST: "Snehal M", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Divyani M", VE: "Huma M" },
  { grade: "Grade 6", section: "C", English: "Fauziya M", Hindi: "Priya M", Marathi: "Jakiya M", Maths: "Ankita M", Science: "Atiya M", IT: "Dipali W", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Atiya M", VE: "Huma M" },
  { grade: "Grade 7", section: "A", English: "Afreen M", Hindi: "Archana K", Marathi: "Anita M", Maths: "Daval Sir", Science: "Atiya M", IT: "Amit Sir", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Snehal M", VE: "Huma M" },
  { grade: "Grade 7", section: "B", English: "Afreen M", Hindi: "Archana K", Marathi: "Poonam K", Maths: "Ankita M", Science: "Atiya M", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Archana K", VE: "Huma M" },
  { grade: "Grade 8", section: "A", English: "Kranti M", Hindi: "Archana K", Marathi: "Jayshri J", Maths: "Daval Sir", Science: "Divyani M", IT: "Amit Sir", SST: "Snehal M", Music: "Kaviraj sir", Art: "Reena L", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Daval Sir", VE: "Snehal M" },
  { grade: "Grade 8", section: "B", English: "Afreen M", Hindi: "Archana K", Marathi: "Anita M", Maths: "Ankita M", Science: "Divyani M", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Mateen sir", Robotics: "Sagar sir", FL: "Qamar sir", KB: "Afreen M", VE: "Snehal M" },
  { grade: "Grade 9", section: "A", English: "Kranti M", Hindi: "Archana K", Marathi: "Jayshri J", Maths: "Archana S", Science: "Pratiksha A", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Reena L", Banking: "Roshan Sir" },
  { grade: "Grade 9", section: "B", English: "Kranti M", Hindi: "Archana K", Marathi: "Jayshri J", Maths: "Archana S", Science: "Pratiksha A", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Mateen sir", Banking: "Roshan Sir" },
  { grade: "Grade 10", section: "A", English: "Sayeed Sir", Hindi: "Archana K", Marathi: "Jayshri J", Maths: "Archana S", Science: "Pratiksha A", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Mateen sir", Banking: "Roshan Sir" },
  { grade: "Grade 10", section: "B", English: "Sayeed Sir", Hindi: "Archana K", Marathi: "Jayshri J", Maths: "Archana S", Science: "Pratiksha A", IT: "Amit Sir", SST: "Hemlata P", Music: "Kaviraj sir", Art: "Reena L", Banking: "Roshan Sir" },
];

async function main() {
  console.log('🌱 Seeding database for Demo 1 School & Delhi Public School with CLASS TEACHERS & SUBJECT ALLOTMENTS...');

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

  // Create Demo 1 School & Delhi Public School
  const demo1School = await prisma.school.create({
    data: {
      id: 'sch_demo1_001',
      name: 'Demo 1 School',
      code: 'DEMO1',
      email: 'admin@demo1.edu',
      password: 'school123',
    },
  });

  const dpsSchool = await prisma.school.create({
    data: {
      id: 'sch_dps_001',
      name: 'Delhi Public School',
      code: 'DPS2025',
      email: 'info@dpsdelhi.edu',
      password: 'school123',
    },
  });

  console.log('✅ Created Demo 1 School & Delhi Public School (DPS)');

  // Admins
  await prisma.admin.create({
    data: {
      name: 'Demo 1 School Admin',
      email: 'admin@demo1.edu',
      password: 'school123',
      role: 'admin',
    },
  });

  await prisma.admin.create({
    data: {
      name: 'Dr. Kiran Challa',
      email: 'admin@dps.edu',
      password: 'admin123',
      role: 'admin',
    },
  });
  console.log('✅ Admins created');

  // --- SEED DEMO 1 SCHOOL (Using Image 1 Class Teachers & Image 2 Subject Matrix) ---
  const teacherMapByName: Map<string, { id: string; fullName: string; shortName: string; email: string; subject: string; classTeacherFor: string | null }> = new Map();
  let teacherCounter = 1;

  for (const entry of REAL_TEACHER_ALLOTMENTS) {
    const classKey = `${entry.grade} ${entry.section}`;
    const classTeacherFullName = CLASS_TEACHERS_MAP[classKey] || null;

    const subjects = ['English', 'Hindi', 'Marathi', 'Maths', 'Science', 'IT', 'SST', 'Music', 'Art', 'Robotics', 'FL', 'KB', 'VE', 'Phonic', 'Library', 'Banking'] as const;
    for (const subKey of subjects) {
      const shortName = (entry as Record<string, any>)[subKey];
      if (shortName && shortName.toUpperCase() !== 'NO') {
        const fullName = NAME_MAP[shortName] || shortName;
        if (!teacherMapByName.has(fullName)) {
          const cleanEmail = fullName.toLowerCase().replace(/[^a-z0-9]/g, '.');
          const isClassTeacher = classTeacherFullName === fullName ? classKey : null;

          teacherMapByName.set(fullName, {
            id: `tch_demo1_${String(teacherCounter).padStart(3, '0')}`,
            fullName,
            shortName,
            email: `${cleanEmail}@demo1.edu`,
            subject: subKey === 'Science' ? 'Science' : subKey,
            classTeacherFor: isClassTeacher,
          });
          teacherCounter++;
        } else if (classTeacherFullName === fullName && !teacherMapByName.get(fullName)?.classTeacherFor) {
          const existing = teacherMapByName.get(fullName)!;
          existing.classTeacherFor = classKey;
        }
      }
    }
  }

  const demo1Teachers: Prisma.TeacherCreateManyInput[] = Array.from(teacherMapByName.values()).map(t => ({
    id: t.id,
    name: t.fullName,
    email: t.email,
    password: 'teacher123',
    phone: `+91 98765 ${Math.floor(10000 + Math.random() * 90000)}`,
    subject: t.subject,
    grades: JSON.stringify(t.classTeacherFor ? [t.classTeacherFor] : ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']),
    availability: JSON.stringify([]),
    role: 'teacher',
    schoolId: demo1School.id,
  }));

  await prisma.teacher.createMany({ data: demo1Teachers });
  console.log(`✅ Demo 1 School: Inserted ${demo1Teachers.length} Real Teachers (with Class Teacher designations from Image 1)`);

  const timeSlots = [
    { period: 1, start: '08:00', end: '08:45' },
    { period: 2, start: '08:45', end: '09:30' },
    { period: 3, start: '09:30', end: '10:15' },
    { period: 4, start: '10:30', end: '11:15' },
    { period: 5, start: '11:15', end: '12:00' },
    { period: 6, start: '12:45', end: '13:30' },
    { period: 7, start: '13:30', end: '14:15' },
    { period: 8, start: '14:15', end: '15:00' },
  ];

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const demo1Schedules: Prisma.ScheduleCreateManyInput[] = [];

  for (const entry of REAL_TEACHER_ALLOTMENTS) {
    const { grade, section } = entry;
    const activePairs: { subject: string; teacherId: string }[] = [];

    const subjectKeys = ['English', 'Hindi', 'Marathi', 'Maths', 'Science', 'IT', 'SST', 'Music', 'Art', 'Robotics', 'FL', 'KB', 'VE', 'Phonic', 'Library', 'Banking'];
    for (const subKey of subjectKeys) {
      const shortName = (entry as Record<string, any>)[subKey];
      if (shortName && shortName.toUpperCase() !== 'NO') {
        const fullName = NAME_MAP[shortName] || shortName;
        const teacherObj = teacherMapByName.get(fullName);
        if (teacherObj) {
          activePairs.push({ subject: subKey, teacherId: teacherObj.id });
        }
      }
    }

    if (activePairs.length === 0) continue;

    for (const day of days) {
      for (let pIdx = 1; pIdx <= 8; pIdx++) {
        const pair = activePairs[(pIdx - 1 + days.indexOf(day)) % activePairs.length];
        const slot = timeSlots[pIdx - 1];

        demo1Schedules.push({
          grade,
          section,
          day,
          period: pIdx,
          subject: pair.subject,
          teacherId: pair.teacherId,
          schoolId: demo1School.id,
          topic: `${pair.subject} - Period ${pIdx}`,
          roomId: `Room ${grade.replace('Grade ', '')}${section}`,
          startTime: slot.start,
          endTime: slot.end,
        });
      }
    }
  }

  await prisma.schedule.createMany({ data: demo1Schedules, skipDuplicates: true });
  console.log(`✅ Demo 1 School: Created ${demo1Schedules.length} Schedules based on Image 2 matrix`);

  // --- SEED DELHI PUBLIC SCHOOL (DPS) ---
  const dpsTeachers: Prisma.TeacherCreateManyInput[] = [
    { name: 'Dr. Kiran Challa', email: 'kiran.challa@dps.edu', password: 'teacher123', phone: '+91-9876543210', subject: 'Mathematics', grades: JSON.stringify(['Grade 11', 'Grade 12']), schoolId: dpsSchool.id },
    { name: 'Rajesh Sharma', email: 'rajesh.sharma@dps.edu', password: 'teacher123', phone: '+91-9876543211', subject: 'Physics', grades: JSON.stringify(['Grade 9', 'Grade 10']), schoolId: dpsSchool.id },
  ];
  await prisma.teacher.createMany({ data: dpsTeachers });

  console.log('🎉 Seeding finished for Demo 1 School with Class Teachers and Subject Allotments!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
