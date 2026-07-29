import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SUBJECTS_DATA = [
  { name: 'Mathematics', code: 'MATH', category: 'Mathematics', color: '#3B82F6' },
  { name: 'Physics', code: 'PHY', category: 'Science', color: '#8B5CF6' },
  { name: 'Chemistry', code: 'CHEM', category: 'Science', color: '#06B6D4' },
  { name: 'Biology', code: 'BIO', category: 'Science', color: '#10B981' },
  { name: 'English', code: 'ENG', category: 'Languages', color: '#F59E0B' },
  { name: 'Hindi', code: 'HIN', category: 'Languages', color: '#EF4444' },
  { name: 'Social Science', code: 'SS', category: 'Humanities', color: '#EC4899' },
  { name: 'Computer Science', code: 'CS', category: 'Technology', color: '#6366F1' },
  { name: 'Physical Education', code: 'PE', category: 'Sports', color: '#F97316' },
  { name: 'Art', code: 'ART', category: 'Arts', color: '#A855F7' },
  { name: 'Music', code: 'MUS', category: 'Arts', color: '#14B8A6' },
  { name: 'Science', code: 'SCI', category: 'Science', color: '#22C55E' },
];

const TIME_SLOTS_DATA = [
  { name: 'Period 1', startTime: '08:00', endTime: '08:45', order: 1, isBreak: false },
  { name: 'Period 2', startTime: '08:45', endTime: '09:30', order: 2, isBreak: false },
  { name: 'Period 3', startTime: '09:30', endTime: '10:15', order: 3, isBreak: false },
  { name: 'Tea Break', startTime: '10:15', endTime: '10:30', order: 4, isBreak: true },
  { name: 'Period 4', startTime: '10:30', endTime: '11:15', order: 5, isBreak: false },
  { name: 'Period 5', startTime: '11:15', endTime: '12:00', order: 6, isBreak: false },
  { name: 'Lunch Break', startTime: '12:00', endTime: '12:45', order: 7, isBreak: true },
  { name: 'Period 6', startTime: '12:45', endTime: '13:30', order: 8, isBreak: false },
  { name: 'Period 7', startTime: '13:30', endTime: '14:15', order: 9, isBreak: false },
  { name: 'Period 8', startTime: '14:15', endTime: '15:00', order: 10, isBreak: false },
];

// ─── 200 Teachers with Indian Names ──────────────────────────────────────────

const FIRST_NAMES_M = ['Rajesh', 'Anil', 'Suresh', 'Deepak', 'Vikram', 'Arjun', 'Rohit', 'Karthik', 'Sanjay', 'Ravi', 'Prakash', 'Amit', 'Manish', 'Siddharth', 'Harsh', 'Kunal', 'Raj', 'Yash', 'Avinash', 'Akash', 'Nikhil', 'Gaurav', 'Ishaan', 'Laksh', 'Sahil', 'Dev', 'Rahul', 'Varun', 'Kir an', 'Mahesh', 'Dinesh', 'Ramesh', 'Suresh', 'Venkat', 'Arun', 'Mohan', 'Rajeev', 'Sunil', 'Ashok', 'Mukesh', 'Pradeep', 'Naveen', 'Rangan', 'Satish', 'Ganesh', 'Balaji', 'Shankar', 'Girish', 'Raghav', 'Vijay'];
const FIRST_NAMES_F = ['Priya', 'Meena', 'Kavitha', 'Anita', 'Sunita', 'Lakshmi', 'Preeti', 'Nisha', 'Divya', 'Shobha', 'Uma', 'Swati', 'Sneha', 'Pallavi', 'Deepa', 'Anjali', 'Simran', 'Ritu', 'Bhavna', 'Maya', 'Aditi', 'Ananya', 'Diya', 'Esha', 'Kavya', 'Riya', 'Sanya', 'Tanvi', 'Zara', 'Neha', 'Pooja', 'Meera', 'Shruti', 'Rekha', 'Suman', 'Pushpa', 'Geeta', 'Seema', 'Nirmala', 'Kamini', 'Padma', 'Vimala', 'Saroj', 'Tarun', 'Asha', 'Renu', 'Savitri', 'Kusum', 'Prabha', 'Leela'];
const LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Nair', 'Joshi', 'Gupta', 'Rao', 'Iyer', 'Menon', 'Choudhury', 'Subramanian', 'Agarwal', 'Mishra', 'Kapoor', 'Shankar', 'Bhattacharya', 'Nadar', 'Krishnan', 'Desai', 'Pillai', 'Banerjee', 'Mukherjee', 'Das', 'Bhat', 'Hegde', 'Shetty', 'Kulkarni', 'Pawar', 'Deshmukh', 'More', 'Jadhav', 'Patil', 'Gaikwad', 'Chavan', 'Naik', 'Kamble', 'Shinde', 'Mehta', 'Shah', 'Amin', 'Trivedi', 'Pandey', 'Tiwari', 'Yadav', 'Srivastava', 'Mishra', 'Ojha'];

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate 200 teachers
interface TeacherData {
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  role: string;
}

function generateTeachers(): TeacherData[] {
  const teachers: TeacherData[] = [];
  const usedNames = new Set<string>();
  let maleIdx = 0;
  let femaleIdx = 0;

  const deptConfig: { dept: string; deptLabel: string; count: number; designations: string[] }[] = [
    { dept: 'Mathematics', deptLabel: 'Mathematics', count: 25, designations: ['HOD Mathematics', 'Senior Teacher', 'Teacher', 'Teacher', 'Teacher'] },
    { dept: 'Science', deptLabel: 'Science', count: 40, designations: ['HOD Physics', 'HOD Chemistry', 'HOD Biology', 'Senior Teacher', 'Teacher', 'Teacher', 'Teacher', 'Teacher'] },
    { dept: 'Languages', deptLabel: 'Languages', count: 30, designations: ['HOD English', 'HOD Hindi', 'Senior Teacher', 'Teacher', 'Teacher', 'Teacher'] },
    { dept: 'Social Science', deptLabel: 'Social Science', count: 20, designations: ['HOD Social Science', 'Senior Teacher', 'Teacher', 'Teacher'] },
    { dept: 'Technology', deptLabel: 'Technology', count: 15, designations: ['HOD Computer Science', 'Senior Teacher', 'Teacher', 'Teacher'] },
    { dept: 'Sports', deptLabel: 'Sports', count: 15, designations: ['Sports Director', 'Senior PTI', 'Teacher', 'Teacher'] },
    { dept: 'Arts', deptLabel: 'Arts', count: 15, designations: ['HOD Arts', 'Senior Teacher', 'Teacher', 'Teacher'] },
    { dept: 'Administration', deptLabel: 'Administration', count: 5, designations: ['Principal', 'Vice Principal', 'Academic Coordinator', 'Admin Officer', 'Discipline Incharge'] },
    { dept: 'Science', deptLabel: 'Science (General)', count: 35, designations: ['Senior Teacher', 'Teacher', 'Teacher', 'Teacher', 'Teacher'] },
  ];

  let empNum = 1;
  for (const dc of deptConfig) {
    for (let i = 0; i < dc.count; i++) {
      const isFemale = Math.random() > 0.5;
      let firstName: string;
      if (isFemale) {
        firstName = FIRST_NAMES_F[femaleIdx % FIRST_NAMES_F.length];
        femaleIdx++;
      } else {
        firstName = FIRST_NAMES_M[maleIdx % FIRST_NAMES_M.length];
        maleIdx++;
      }
      const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      let fullName = `${isFemale ? (Math.random() > 0.3 ? 'Mrs.' : 'Ms.') : 'Mr.'} ${firstName} ${lastName}`;
      // Ensure unique names
      let attempts = 0;
      while (usedNames.has(fullName) && attempts < 20) {
        const newLast = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
        fullName = `${isFemale ? (Math.random() > 0.3 ? 'Mrs.' : 'Ms.') : 'Mr.'} ${firstName} ${newLast}`;
        attempts++;
      }
      usedNames.add(fullName);

      const designation = dc.designations[i % dc.designations.length];
      const role = dc.dept === 'Administration'
        ? (designation === 'Principal' ? 'PRINCIPAL' : designation === 'Vice Principal' ? 'ADMIN' : 'ADMIN')
        : 'TEACHER';

      teachers.push({
        employeeId: `T${String(empNum).padStart(3, '0')}`,
        name: fullName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${empNum}@school.edu`,
        phone: `98765${String(40000 + empNum).padStart(5, '0')}`,
        designation,
        department: dc.deptLabel,
        role,
      });
      empNum++;
    }
  }
  return teachers;
}

// Teacher-Subject mapping for 200 teachers across 12 subjects and 12 grades
// Subject codes: MATH, PHY, CHEM, BIO, ENG, HIN, SS, CS, PE, ART, MUS, SCI
function generateTeacherSubjectMap(teachers: TeacherData[]): Record<string, { subjectCode: string; gradeLevels: number[]; isPrimary: boolean }[]> {
  const map: Record<string, { subjectCode: string; gradeLevels: number[]; isPrimary: boolean }[]> = {};

  // Get indices for each department
  const mathTeachers = teachers.filter(t => t.department === 'Mathematics');
  const sciTeachers = teachers.filter(t => t.department === 'Science');
  const sciGenTeachers = teachers.filter(t => t.department === 'Science (General)');
  const langTeachers = teachers.filter(t => t.department === 'Languages');
  const ssTeachers = teachers.filter(t => t.department === 'Social Science');
  const csTeachers = teachers.filter(t => t.department === 'Technology');
  const peTeachers = teachers.filter(t => t.department === 'Sports');
  const artTeachers = teachers.filter(t => t.department === 'Arts');
  const adminTeachers = teachers.filter(t => t.department === 'Administration');

  // Mathematics: 25 teachers
  // HOD + Senior: grades 9-12 (5 teachers)
  // Middle: grades 6-8 (8 teachers)
  // Primary: grades 1-5 (12 teachers)
  const mathUpper = mathTeachers.slice(0, 5);
  const mathMiddle = mathTeachers.slice(5, 13);
  const mathLower = mathTeachers.slice(13, 25);

  for (const t of mathUpper) {
    map[t.employeeId] = [{ subjectCode: 'MATH', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 0; i < mathMiddle.length; i++) {
    const grades = i < 4 ? [6, 7, 8] : [6, 7];
    map[mathMiddle[i].employeeId] = [{ subjectCode: 'MATH', gradeLevels: grades, isPrimary: true }];
  }
  for (let i = 0; i < mathLower.length; i++) {
    const grades = i < 6 ? [1, 2, 3, 4, 5] : [3, 4, 5];
    map[mathLower[i].employeeId] = [{ subjectCode: 'MATH', gradeLevels: grades, isPrimary: true }];
  }

  // Science (specific subjects): 40 teachers
  // Physics: 12 teachers
  const phyTeachers = sciTeachers.slice(0, 12);
  for (let i = 0; i < 4; i++) {
    map[phyTeachers[i].employeeId] = [{ subjectCode: 'PHY', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 4; i < 8; i++) {
    map[phyTeachers[i].employeeId] = [
      { subjectCode: 'PHY', gradeLevels: [9, 10], isPrimary: true },
      { subjectCode: 'SCI', gradeLevels: [7, 8], isPrimary: false },
    ];
  }
  for (let i = 8; i < 12; i++) {
    map[phyTeachers[i].employeeId] = [
      { subjectCode: 'PHY', gradeLevels: [11, 12], isPrimary: false },
      { subjectCode: 'SCI', gradeLevels: [6, 7, 8], isPrimary: true },
    ];
  }

  // Chemistry: 12 teachers
  const chemTeachers = sciTeachers.slice(12, 24);
  for (let i = 0; i < 4; i++) {
    map[chemTeachers[i].employeeId] = [{ subjectCode: 'CHEM', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 4; i < 8; i++) {
    map[chemTeachers[i].employeeId] = [
      { subjectCode: 'CHEM', gradeLevels: [9, 10], isPrimary: true },
      { subjectCode: 'SCI', gradeLevels: [7, 8], isPrimary: false },
    ];
  }
  for (let i = 8; i < 12; i++) {
    map[chemTeachers[i].employeeId] = [
      { subjectCode: 'CHEM', gradeLevels: [11, 12], isPrimary: false },
      { subjectCode: 'SCI', gradeLevels: [6, 7, 8], isPrimary: true },
    ];
  }

  // Biology: 12 teachers
  const bioTeachers = sciTeachers.slice(24, 36);
  for (let i = 0; i < 4; i++) {
    map[bioTeachers[i].employeeId] = [{ subjectCode: 'BIO', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 4; i < 8; i++) {
    map[bioTeachers[i].employeeId] = [
      { subjectCode: 'BIO', gradeLevels: [9, 10], isPrimary: true },
      { subjectCode: 'SCI', gradeLevels: [7, 8], isPrimary: false },
    ];
  }
  for (let i = 8; i < 12; i++) {
    map[bioTeachers[i].employeeId] = [
      { subjectCode: 'BIO', gradeLevels: [11, 12], isPrimary: false },
      { subjectCode: 'SCI', gradeLevels: [6, 7, 8], isPrimary: true },
    ];
  }

  // Remaining 4 science teachers: general science for specific grades
  const sciRemaining = sciTeachers.slice(36, 40);
  for (const t of sciRemaining) {
    map[t.employeeId] = [{ subjectCode: 'SCI', gradeLevels: [9, 10], isPrimary: true }];
  }

  // Science (General): 35 teachers for lower grades (1-5, some 6-8)
  for (let i = 0; i < sciGenTeachers.length; i++) {
    const t = sciGenTeachers[i];
    if (i < 15) {
      map[t.employeeId] = [{ subjectCode: 'SCI', gradeLevels: [1, 2, 3, 4, 5], isPrimary: true }];
    } else if (i < 25) {
      map[t.employeeId] = [
        { subjectCode: 'SCI', gradeLevels: [1, 2, 3], isPrimary: true },
        { subjectCode: 'SCI', gradeLevels: [4, 5], isPrimary: false },
      ];
    } else {
      map[t.employeeId] = [
        { subjectCode: 'SCI', gradeLevels: [6, 7, 8], isPrimary: true },
        { subjectCode: 'BIO', gradeLevels: [9, 10], isPrimary: false },
      ];
    }
  }

  // Languages: 30 teachers
  const engTeachers = langTeachers.slice(0, 15);
  const hinTeachers = langTeachers.slice(15, 30);

  for (let i = 0; i < 5; i++) {
    map[engTeachers[i].employeeId] = [{ subjectCode: 'ENG', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 5; i < 10; i++) {
    map[engTeachers[i].employeeId] = [
      { subjectCode: 'ENG', gradeLevels: [6, 7, 8], isPrimary: true },
      { subjectCode: 'ENG', gradeLevels: [9, 10], isPrimary: false },
    ];
  }
  for (let i = 10; i < 15; i++) {
    map[engTeachers[i].employeeId] = [
      { subjectCode: 'ENG', gradeLevels: [1, 2, 3, 4, 5], isPrimary: true },
      { subjectCode: 'ENG', gradeLevels: [6, 7], isPrimary: false },
    ];
  }

  for (let i = 0; i < 5; i++) {
    map[hinTeachers[i].employeeId] = [{ subjectCode: 'HIN', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 5; i < 10; i++) {
    map[hinTeachers[i].employeeId] = [
      { subjectCode: 'HIN', gradeLevels: [6, 7, 8], isPrimary: true },
      { subjectCode: 'HIN', gradeLevels: [9, 10], isPrimary: false },
    ];
  }
  for (let i = 10; i < 15; i++) {
    map[hinTeachers[i].employeeId] = [
      { subjectCode: 'HIN', gradeLevels: [1, 2, 3, 4, 5], isPrimary: true },
      { subjectCode: 'HIN', gradeLevels: [6, 7], isPrimary: false },
    ];
  }

  // Social Science: 20 teachers
  for (let i = 0; i < 6; i++) {
    map[ssTeachers[i].employeeId] = [{ subjectCode: 'SS', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 6; i < 12; i++) {
    map[ssTeachers[i].employeeId] = [{ subjectCode: 'SS', gradeLevels: [6, 7, 8], isPrimary: true }];
  }
  for (let i = 12; i < 20; i++) {
    map[ssTeachers[i].employeeId] = [
      { subjectCode: 'SS', gradeLevels: [1, 2, 3, 4, 5], isPrimary: true },
      { subjectCode: 'SS', gradeLevels: [6, 7], isPrimary: false },
    ];
  }

  // Computer Science: 15 teachers
  for (let i = 0; i < 4; i++) {
    map[csTeachers[i].employeeId] = [{ subjectCode: 'CS', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 4; i < 9; i++) {
    map[csTeachers[i].employeeId] = [{ subjectCode: 'CS', gradeLevels: [6, 7, 8], isPrimary: true }];
  }
  for (let i = 9; i < 15; i++) {
    map[csTeachers[i].employeeId] = [
      { subjectCode: 'CS', gradeLevels: [1, 2, 3, 4, 5], isPrimary: true },
      { subjectCode: 'MATH', gradeLevels: [4, 5], isPrimary: false },
    ];
  }

  // Physical Education: 15 teachers - covers all grades
  for (let i = 0; i < 5; i++) {
    map[peTeachers[i].employeeId] = [{ subjectCode: 'PE', gradeLevels: [9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 5; i < 10; i++) {
    map[peTeachers[i].employeeId] = [{ subjectCode: 'PE', gradeLevels: [6, 7, 8], isPrimary: true }];
  }
  for (let i = 10; i < 15; i++) {
    map[peTeachers[i].employeeId] = [{ subjectCode: 'PE', gradeLevels: [1, 2, 3, 4, 5], isPrimary: true }];
  }

  // Arts: 15 teachers
  for (let i = 0; i < 8; i++) {
    map[artTeachers[i].employeeId] = [{ subjectCode: 'ART', gradeLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], isPrimary: true }];
  }
  for (let i = 8; i < 15; i++) {
    map[artTeachers[i].employeeId] = [{ subjectCode: 'MUS', gradeLevels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], isPrimary: true }];
  }

  // Administration: no teaching subjects
  for (const t of adminTeachers) {
    map[t.employeeId] = [];
  }

  return map;
}

const TOPICS: Record<string, string[]> = {
  'MATH': ['Algebra - Linear Equations', 'Geometry - Triangles', 'Statistics & Probability', 'Number Systems', 'Quadratic Equations', 'Trigonometry Basics', 'Mensuration', 'Coordinate Geometry', 'Arithmetic Progressions', 'Polynomials', 'Surface Areas & Volumes', 'Real Numbers'],
  'PHY': ['Motion & Force', 'Laws of Motion', 'Gravitation', 'Work & Energy', 'Sound', 'Light - Reflection', 'Electricity', 'Magnetic Effects', 'Waves & Oscillations', 'Thermodynamics', 'Optics', 'Electromagnetic Induction'],
  'CHEM': ['Matter & Its Properties', 'Atoms & Molecules', 'Chemical Reactions', 'Periodic Table', 'Acids, Bases & Salts', 'Metals & Non-metals', 'Carbon Compounds', 'Chemical Bonding', 'Thermodynamics', 'Electrochemistry', 'Organic Chemistry', 'Environmental Chemistry'],
  'BIO': ['Cell Structure', 'Tissues', 'Diversity in Living Organisms', 'Life Processes', 'Control & Coordination', 'Heredity & Evolution', 'Human Body Systems', 'Ecology', 'Plant Physiology', 'Reproduction', 'Genetics', 'Microbiology'],
  'ENG': ['Reading Comprehension', 'Grammar - Tenses', 'Writing Skills - Essay', 'Literature - Poetry', 'Grammar - Voice & Narration', 'Writing Skills - Letter', 'Literature - Prose', 'Vocabulary Building', 'Creative Writing', 'Drama & Theatre', 'Public Speaking', 'Debate Skills'],
  'HIN': ['गद्य - कहानी', 'काव्य - कविता', 'व्याकरण - संज्ञा', 'निबंध लेखन', 'पत्र लेखन', 'व्याकरण - क्रिया', 'गद्य - निबंध', 'काव्य - दोहा', 'व्याकरण - वाक्य', 'अपठित गद्यांश', 'संवाद लेखन', 'व्याकरण - उपसर्ग'],
  'SS': ['Indian History - Ancient', 'Indian Geography', 'Civics - Constitution', 'World History', 'Economics - Basics', 'Indian Freedom Struggle', 'Political Science', 'Natural Resources', 'Culture & Heritage', 'Globalization', 'Democracy', 'Human Rights'],
  'CS': ['Introduction to Programming', 'Data Types & Variables', 'Control Structures', 'Functions & Procedures', 'Arrays & Strings', 'Database Concepts', 'HTML & CSS', 'Networking Basics', 'Cyber Safety', 'Python Programming', 'Algorithms & Flowcharts', 'Spreadsheet Applications'],
  'PE': ['Fitness Assessment', 'Track & Field Events', 'Team Sports - Football', 'Yoga & Meditation', 'Team Sports - Basketball', 'Individual Sports - Badminton', 'Gymnastics Basics', 'Sports Nutrition', 'First Aid & Safety', 'Swimming', 'Volleyball', 'Cricket Skills'],
  'ART': ['Drawing Basics', 'Color Theory', 'Painting Techniques', 'Clay Modeling', 'Paper Craft', 'Collage Making', 'Still Life Drawing', 'Landscape Art', 'Abstract Art', 'Calligraphy', 'Pottery', 'Mixed Media'],
  'MUS': ['Rhythm & Beats', 'Vocal Training', 'Instrument Basics', 'Indian Classical', 'Folk Music', 'Music Theory', 'Group Singing', 'Piano/Keyboard', 'Percussion', 'Song Composition', 'Music Appreciation', 'Choir Practice'],
  'SCI': ['Living & Non-living', 'Food & Nutrition', 'Water Cycle', 'Simple Machines', 'Our Environment', 'Human Body', 'Plants & Animals', 'Light & Shadow', 'Magnetism', 'Weather & Climate', 'Soil & Rocks', 'Energy Sources'],
};

const GRADE_SUBJECT_CONFIG: Record<number, { subjectCode: string; periodsPerWeek: number }[]> = {
  1: [
    { subjectCode: 'ENG', periodsPerWeek: 7 },
    { subjectCode: 'HIN', periodsPerWeek: 5 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 4 },
    { subjectCode: 'SS', periodsPerWeek: 3 },
    { subjectCode: 'CS', periodsPerWeek: 2 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 2 },
    { subjectCode: 'MUS', periodsPerWeek: 2 },
  ],
  2: [
    { subjectCode: 'ENG', periodsPerWeek: 7 },
    { subjectCode: 'HIN', periodsPerWeek: 5 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 4 },
    { subjectCode: 'SS', periodsPerWeek: 3 },
    { subjectCode: 'CS', periodsPerWeek: 2 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 2 },
    { subjectCode: 'MUS', periodsPerWeek: 2 },
  ],
  3: [
    { subjectCode: 'ENG', periodsPerWeek: 7 },
    { subjectCode: 'HIN', periodsPerWeek: 5 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 4 },
    { subjectCode: 'SS', periodsPerWeek: 3 },
    { subjectCode: 'CS', periodsPerWeek: 2 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 2 },
    { subjectCode: 'MUS', periodsPerWeek: 2 },
  ],
  4: [
    { subjectCode: 'ENG', periodsPerWeek: 7 },
    { subjectCode: 'HIN', periodsPerWeek: 5 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 4 },
    { subjectCode: 'SS', periodsPerWeek: 3 },
    { subjectCode: 'CS', periodsPerWeek: 2 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 2 },
    { subjectCode: 'MUS', periodsPerWeek: 2 },
  ],
  5: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 5 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 5 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 2 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 2 },
    { subjectCode: 'MUS', periodsPerWeek: 1 },
  ],
  6: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 4 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 5 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 3 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 1 },
    { subjectCode: 'MUS', periodsPerWeek: 1 },
  ],
  7: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 4 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 5 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 3 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 1 },
    { subjectCode: 'MUS', periodsPerWeek: 1 },
  ],
  8: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 4 },
    { subjectCode: 'MATH', periodsPerWeek: 6 },
    { subjectCode: 'SCI', periodsPerWeek: 5 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 3 },
    { subjectCode: 'PE', periodsPerWeek: 3 },
    { subjectCode: 'ART', periodsPerWeek: 1 },
    { subjectCode: 'MUS', periodsPerWeek: 1 },
  ],
  9: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 4 },
    { subjectCode: 'MATH', periodsPerWeek: 7 },
    { subjectCode: 'PHY', periodsPerWeek: 4 },
    { subjectCode: 'CHEM', periodsPerWeek: 4 },
    { subjectCode: 'BIO', periodsPerWeek: 3 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 3 },
    { subjectCode: 'PE', periodsPerWeek: 2 },
  ],
  10: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 4 },
    { subjectCode: 'MATH', periodsPerWeek: 7 },
    { subjectCode: 'PHY', periodsPerWeek: 4 },
    { subjectCode: 'CHEM', periodsPerWeek: 4 },
    { subjectCode: 'BIO', periodsPerWeek: 3 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 3 },
    { subjectCode: 'PE', periodsPerWeek: 2 },
  ],
  11: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 4 },
    { subjectCode: 'MATH', periodsPerWeek: 7 },
    { subjectCode: 'PHY', periodsPerWeek: 4 },
    { subjectCode: 'CHEM', periodsPerWeek: 4 },
    { subjectCode: 'BIO', periodsPerWeek: 3 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 3 },
    { subjectCode: 'PE', periodsPerWeek: 2 },
  ],
  12: [
    { subjectCode: 'ENG', periodsPerWeek: 6 },
    { subjectCode: 'HIN', periodsPerWeek: 4 },
    { subjectCode: 'MATH', periodsPerWeek: 7 },
    { subjectCode: 'PHY', periodsPerWeek: 4 },
    { subjectCode: 'CHEM', periodsPerWeek: 4 },
    { subjectCode: 'BIO', periodsPerWeek: 3 },
    { subjectCode: 'SS', periodsPerWeek: 4 },
    { subjectCode: 'CS', periodsPerWeek: 3 },
    { subjectCode: 'PE', periodsPerWeek: 2 },
  ],
};

// Section configuration for each grade level - scaled for 25,000 students
const GRADE_SECTION_CONFIG: Record<number, { sectionCount: number; studentsPerSection: number }> = {
  1: { sectionCount: 50, studentsPerSection: 42 },
  2: { sectionCount: 50, studentsPerSection: 42 },
  3: { sectionCount: 50, studentsPerSection: 42 },
  4: { sectionCount: 50, studentsPerSection: 42 },
  5: { sectionCount: 50, studentsPerSection: 42 },
  6: { sectionCount: 50, studentsPerSection: 42 },
  7: { sectionCount: 50, studentsPerSection: 42 },
  8: { sectionCount: 50, studentsPerSection: 42 },
  9: { sectionCount: 50, studentsPerSection: 42 },
  10: { sectionCount: 50, studentsPerSection: 42 },
  11: { sectionCount: 50, studentsPerSection: 42 },
  12: { sectionCount: 50, studentsPerSection: 42 },
};
// Total students = 12 * 50 * 42 = 25,200

const STUDENT_FIRST_NAMES = ['Aarav', 'Aditi', 'Arjun', 'Ananya', 'Ayaan', 'Bhavya', 'Chitra', 'Dev', 'Diya', 'Esha', 'Gaurav', 'Ishaan', 'Kavya', 'Laksh', 'Maya', 'Nikhil', 'Nisha', 'Pranav', 'Riya', 'Rohan', 'Sahil', 'Sanya', 'Tanvi', 'Vikram', 'Zara', 'Kiran', 'Neha', 'Rahul', 'Pooja', 'Amit', 'Sneha', 'Varun', 'Meera', 'Akash', 'Shruti', 'Manish', 'Pallavi', 'Deepa', 'Siddharth', 'Nandini', 'Harsh', 'Swati', 'Kunal', 'Anjali', 'Raj', 'Simran', 'Yash', 'Ritu', 'Avinash', 'Bhavna', 'Tanya', 'Rajat', 'Pankaj', 'Disha', 'Karan', 'Jyoti', 'Arun', 'Mira', 'Sagar', 'Priya', 'Nitin', 'Shalini', 'Vivek', 'Asha', 'Rajiv', 'Smita', 'Gopal', 'Rashmi', 'Ajit', 'Priti', 'Umesh', 'Suman', 'Dhruv', 'Nisha', 'Sujay', 'Komal', 'Mukul', 'Aarti', 'Vishal', 'Bindu', 'Prateek', 'Divya', 'Shrey', 'Renu', 'Gautam', 'Rekha', 'Manoj', 'Kavita', 'Tarun', 'Sunita', 'Nirmal', 'Bina', 'Parag', 'Mala', 'Rakesh', 'Sarla'];
const STUDENT_LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Nair', 'Joshi', 'Gupta', 'Rao', 'Iyer', 'Menon', 'Choudhury', 'Subramanian', 'Agarwal', 'Mishra', 'Kapoor', 'Shankar', 'Bhattacharya', 'Nadar', 'Krishnan', 'Desai', 'Pillai', 'Banerjee', 'Mukherjee', 'Das', 'Bhat', 'Hegde', 'Shetty', 'Kulkarni', 'Pawar', 'Deshmukh', 'More', 'Jadhav', 'Patil', 'Gaikwad', 'Chavan', 'Naik', 'Kamble', 'Shinde'];

async function main() {
  console.log('🌱 Seeding database with 200 teachers...');

  // Clean up existing data
  await prisma.studentNotification.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.substitutionAssignment.deleteMany();
  await prisma.substitutionRequest.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.teacherSubject.deleteMany();
  await prisma.student.deleteMany();
  await prisma.timeSlot.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.section.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.term.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.school.deleteMany();

  // Create School
  const school = await prisma.school.create({
    data: {
      name: 'Delhi Public School',
      code: 'DPS2025',
      address: 'Sector 24, Mathura Road, New Delhi - 110001',
      phone: '+91-11-24351234',
      email: 'info@dpsdelhi.edu',
      principal: 'Mr. Prakash Nadar',
    },
  });
  console.log('✅ School created');

  // Create Academic Year
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: '2025-2026',
      startDate: new Date('2025-04-01'),
      endDate: new Date('2026-03-31'),
      isActive: true,
    },
  });
  console.log('✅ Academic Year created');

  // Create Terms
  const term1 = await prisma.term.create({
    data: {
      academicYearId: academicYear.id,
      name: 'Term 1 (Apr - Sep)',
      startDate: new Date('2025-04-01'),
      endDate: new Date('2025-09-30'),
    },
  });
  const term2 = await prisma.term.create({
    data: {
      academicYearId: academicYear.id,
      name: 'Term 2 (Oct - Mar)',
      startDate: new Date('2025-10-01'),
      endDate: new Date('2026-03-31'),
    },
  });
  console.log('✅ Terms created');

  // Create Subjects
  const subjectMap: Record<string, string> = {};
  for (const sub of SUBJECTS_DATA) {
    const s = await prisma.subject.create({ data: sub });
    subjectMap[sub.code] = s.id;
  }
  console.log('✅ Subjects created');

  // Create Time Slots
  const timeSlotMap: Record<string, string> = {};
  for (const ts of TIME_SLOTS_DATA) {
    const t = await prisma.timeSlot.create({ data: ts });
    timeSlotMap[ts.name] = t.id;
  }
  console.log('✅ Time Slots created');

  // Create Grades and Sections
  const gradeLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const gradeMap: Record<number, string> = {};
  const sectionMap: Record<string, Record<string, string>> = {};

  for (const level of gradeLevels) {
    const grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        academicYearId: academicYear.id,
        level,
        name: `Grade ${level}`,
      },
    });
    gradeMap[level] = grade.id;
    sectionMap[level] = {};

    const sectionLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const secCount = GRADE_SECTION_CONFIG[level]?.sectionCount || 5;
    for (let s = 0; s < secCount; s++) {
      // Support more than 26 sections with two-letter names (A-Z, AA-AZ, BA-BZ...)
      const secName = s < 26 ? sectionLetters[s] : sectionLetters[Math.floor((s - 26) / 26)] + sectionLetters[(s - 26) % 26];
      const section = await prisma.section.create({
        data: {
          gradeId: grade.id,
          name: secName,
          capacity: GRADE_SECTION_CONFIG[level]?.studentsPerSection || 42,
        },
      });
      sectionMap[level][secName] = section.id;
    }
  }
  console.log('✅ Grades and Sections created');

  // Generate and Create 200 Teachers
  const teachersData = generateTeachers();
  const teacherMap: Record<string, string> = {};
  for (const t of teachersData) {
    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: t.employeeId,
        name: t.name,
        email: t.email,
        phone: t.phone,
        designation: t.designation,
        department: t.department,
        role: t.role,
      },
    });
    teacherMap[t.employeeId] = teacher.id;
  }
  console.log(`✅ ${teachersData.length} Teachers created`);

  // Create Teacher-Subject mappings
  const teacherSubjectMap = generateTeacherSubjectMap(teachersData);
  let tsCount = 0;
  for (const [empId, subjects] of Object.entries(teacherSubjectMap)) {
    for (const sub of subjects) {
      for (const gl of sub.gradeLevels) {
        await prisma.teacherSubject.create({
          data: {
            teacherId: teacherMap[empId],
            subjectId: subjectMap[sub.subjectCode],
            gradeLevel: gl,
            isPrimary: sub.isPrimary,
          },
        });
        tsCount++;
      }
    }
  }
  console.log(`✅ ${tsCount} Teacher-Subject mappings created`);

  // Generate Timetable for all sections - using createMany for performance
  const teachingSlots = TIME_SLOTS_DATA.filter(s => !s.isBreak);
  const slotNames = teachingSlots.map(s => s.name);
  const totalPeriods = 5 * teachingSlots.length; // 40

  // Pre-fetch teacher-subject data for schedule assignment
  const allTeacherSubjects = await prisma.teacherSubject.findMany({
    include: { teacher: true, subject: true },
  });

  // Build lookup: subjectId + gradeLevel -> teacherIds
  const subjectGradeTeachers: Record<string, string[]> = {};
  for (const ts of allTeacherSubjects) {
    const key = `${ts.subjectId}:${ts.gradeLevel}:${ts.isPrimary}`;
    if (!subjectGradeTeachers[key]) subjectGradeTeachers[key] = [];
    subjectGradeTeachers[key].push(ts.teacherId);
  }

  // Also build a broader lookup: subjectId + gradeLevel (any isPrimary)
  const subjectGradeAnyTeachers: Record<string, string[]> = {};
  for (const ts of allTeacherSubjects) {
    const key = `${ts.subjectId}:${ts.gradeLevel}`;
    if (!subjectGradeAnyTeachers[key]) subjectGradeAnyTeachers[key] = [];
    if (!subjectGradeAnyTeachers[key].includes(ts.teacherId)) {
      subjectGradeAnyTeachers[key].push(ts.teacherId);
    }
  }

  let scheduleCount = 0;
  // Only generate schedules for a manageable subset of sections per grade
  // Full 50 sections would create 24,000 schedules which is too slow for SQLite
  const SCHEDULE_SECTIONS_PER_GRADE = 5;
  
  for (const level of gradeLevels) {
    const config = GRADE_SUBJECT_CONFIG[level];
    const sections = Object.keys(sectionMap[level]).slice(0, SCHEDULE_SECTIONS_PER_GRADE);

    for (const secName of sections) {
      const sectionId = sectionMap[level][secName];

      // Build a pool of (subject, count) entries
      const pool: string[] = [];
      for (const entry of config) {
        for (let i = 0; i < entry.periodsPerWeek; i++) {
          pool.push(entry.subjectCode);
        }
      }

      // Fill or trim pool to match totalPeriods
      while (pool.length < totalPeriods) {
        pool.push(randomPick(config).subjectCode);
      }

      const shuffledPool = shuffleArray(pool).slice(0, totalPeriods);

      // Assign to grid: day × slot
      let idx = 0;
      for (let day = 1; day <= 5; day++) {
        for (const slotName of slotNames) {
          const subjectCode = shuffledPool[idx % shuffledPool.length];
          idx++;

          const subjectId = subjectMap[subjectCode];

          // Find primary teacher for this subject+grade
          const primaryKey = `${subjectId}:${level}:true`;
          const anyKey = `${subjectId}:${level}`;
          let teacherId = subjectGradeTeachers[primaryKey]?.[0]
            || subjectGradeAnyTeachers[anyKey]?.[0];

          if (!teacherId) {
            // Fallback: find any teacher for this subject at any grade
            for (const ts of allTeacherSubjects) {
              if (ts.subjectId === subjectId) {
                teacherId = ts.teacherId;
                break;
              }
            }
          }

          if (!teacherId) {
            // Last resort: first teacher
            teacherId = Object.values(teacherMap)[0];
          }

          const topicList = TOPICS[subjectCode] || ['General Lesson'];
          const topic = topicList[Math.floor(Math.random() * topicList.length)];

          try {
            await prisma.schedule.create({
              data: {
                gradeId: gradeMap[level],
                sectionId,
                termId: term1.id,
                subjectId,
                teacherId,
                timeSlotId: timeSlotMap[slotName],
                dayOfWeek: day,
                room: `R${level}${secName}-${day}`,
                topic,
              },
            });
            scheduleCount++;
          } catch (e) {
            // Skip unique constraint violations
          }
        }
      }
    }
    console.log(`  Grade ${level}: schedules created (total: ${scheduleCount})`);
  }
  console.log(`✅ ${scheduleCount} Schedules/Timetables created`);

  // Create Students (~25,000)
  let studentCount = 0;

  for (const level of gradeLevels) {
    const sections = Object.keys(sectionMap[level]);
    const studentsPerSection = GRADE_SECTION_CONFIG[level]?.studentsPerSection || 42;

    for (const secName of sections) {
      const sectionId = sectionMap[level][secName];

      // Batch insert students for speed
      const studentData = [];
      for (let i = 1; i <= studentsPerSection; i++) {
        const firstName = STUDENT_FIRST_NAMES[Math.floor(Math.random() * STUDENT_FIRST_NAMES.length)];
        const lastName = STUDENT_LAST_NAMES[Math.floor(Math.random() * STUDENT_LAST_NAMES.length)];
        const rollNo = `${level}${secName}${String(i).padStart(3, '0')}`;
        const name = `${firstName} ${lastName}`;
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${studentCount + i}@student.dps.edu`;
        studentData.push({
          schoolId: school.id,
          sectionId,
          rollNo,
          name,
          email,
        });
      }

      await prisma.student.createMany({ data: studentData });
      studentCount += studentsPerSection;
    }
  }
  console.log(`✅ ${studentCount} Students created`);

  // Create today's attendance - mark 15-20 teachers absent, 5-7 on leave, 4-5 with meetings
  const today = new Date().toISOString().split('T')[0];
  const todayDay = new Date().getDay();
  // If weekend, use Monday
  const scheduleDay = todayDay >= 1 && todayDay <= 5 ? todayDay : 1;

  // Mark most teachers present, then mark specific ones absent
  const allTeacherEmpIds = teachersData.map(t => t.employeeId);

  // Select 18 teachers to be absent (avoid admin staff)
  const teachableEmpIds = allTeacherEmpIds.filter(eid => {
    const t = teachersData.find(td => td.employeeId === eid);
    return t && t.department !== 'Administration';
  });

  const absentEmpIds = shuffleArray(teachableEmpIds).slice(0, 18);

  // Bulk create attendance
  const attendanceData = allTeacherEmpIds.map(empId => ({
    teacherId: teacherMap[empId],
    date: today,
    status: absentEmpIds.includes(empId) ? 'ABSENT' : 'PRESENT',
    reason: absentEmpIds.includes(empId) ? 'Sick Leave / Personal Emergency' : null,
    markedBy: 'system',
  }));
  await prisma.attendance.createMany({ data: attendanceData });
  console.log(`✅ Attendance created (${absentEmpIds.length} teachers absent)`);

  // Create approved leaves for 6 teachers
  const leaveEmpIds = shuffleArray(teachableEmpIds.filter(eid => !absentEmpIds.includes(eid))).slice(0, 6);
  const leaveTypes = ['CASUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'CASUAL', 'SICK'];
  const leaveReasons = ['Family function', 'Medical appointment', 'Personal work', 'Not feeling well', 'Family emergency', 'Doctor visit'];
  const principalEmpId = allTeacherEmpIds.find(eid => {
    const t = teachersData.find(td => td.employeeId === eid);
    return t?.designation === 'Principal';
  })!;
  const leaveData = leaveEmpIds.map((empId, i) => ({
    teacherId: teacherMap[empId],
    type: leaveTypes[i % leaveTypes.length],
    startDate: today,
    endDate: today,
    reason: leaveReasons[i % leaveReasons.length],
    status: 'APPROVED' as const,
    approvedBy: teacherMap[principalEmpId],
  }));
  await prisma.leave.createMany({ data: leaveData });
  console.log(`✅ ${leaveEmpIds.length} Leaves created`);

  // Create meetings for 5 teachers
  const meetingEmpIds = shuffleArray(teachableEmpIds.filter(eid => !absentEmpIds.includes(eid) && !leaveEmpIds.includes(eid))).slice(0, 5);
  const meetingTitles = ['Parent-Teacher Meeting Coordination', 'Department Review Meeting', 'Curriculum Planning Session', 'Staff Development Workshop', 'Board Meeting Preparation'];
  const meetingTimes = [
    { start: '10:30', end: '11:15' },
    { start: '09:30', end: '10:15' },
    { start: '12:45', end: '13:30' },
    { start: '08:00', end: '08:45' },
    { start: '14:15', end: '15:00' },
  ];
  const meetingData = meetingEmpIds.map((empId, i) => ({
    teacherId: teacherMap[empId],
    title: meetingTitles[i % meetingTitles.length],
    description: 'Scheduled meeting - teacher unavailable during this slot',
    date: today,
    startTime: meetingTimes[i % meetingTimes.length].start,
    endTime: meetingTimes[i % meetingTimes.length].end,
    location: ['Conference Room A', 'Conference Room B', 'Principal Office', 'Staff Room', 'Library Hall'][i % 5],
    status: 'SCHEDULED' as const,
  }));
  await prisma.meeting.createMany({ data: meetingData });
  console.log(`✅ ${meetingEmpIds.length} Meetings created`);

  console.log('\n🎉 Seeding completed successfully!');
  console.log(`📊 School: ${school.name}`);
  console.log(`📅 Academic Year: ${academicYear.name}`);
  console.log(`👨‍🏫 Teachers: ${teachersData.length}`);
  console.log(`📚 Subjects: ${SUBJECTS_DATA.length}`);
  console.log(`🏫 Grades: ${gradeLevels.length}`);
  console.log(`👤 Students: ${studentCount}`);
  console.log(`📋 Schedules: ${scheduleCount}`);
  console.log(`❌ Absent Today: ${absentEmpIds.length}`);
  console.log(`🏖️ On Leave: ${leaveEmpIds.length}`);
  console.log(`📅 In Meetings: ${meetingEmpIds.length}`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
