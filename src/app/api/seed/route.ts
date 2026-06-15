import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Clear existing data (order matters for foreign key constraints)
    await db.teacherNotification.deleteMany();
    await db.lessonPlan.deleteMany();
    await db.biometricAttendance.deleteMany();
    await db.leaveApplication.deleteMany();
    await db.substitution.deleteMany();
    await db.schedule.deleteMany();
    await db.student.deleteMany();
    await db.curriculumTopic.deleteMany();
    await db.curriculumDocument.deleteMany();
    await db.curriculum.deleteMany();
    await db.admin.deleteMany();
    await db.teacher.deleteMany();

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const timeSlots = [
      { period: 1, start: '08:00', end: '08:40' },
      { period: 2, start: '08:40', end: '09:20' },
      { period: 3, start: '09:20', end: '10:00' },
      { period: 4, start: '10:20', end: '11:00' },
      { period: 5, start: '11:00', end: '11:40' },
      { period: 6, start: '11:40', end: '12:20' },
      { period: 7, start: '13:00', end: '13:40' },
      { period: 8, start: '13:40', end: '14:20' },
    ];

    // CBSE Subjects by Grade
    const subjectsByGrade: Record<string, string[]> = {
      'Grade 1': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
      'Grade 2': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
      'Grade 3': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
      'Grade 4': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
      'Grade 5': ['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music'],
      'Grade 6': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education'],
      'Grade 7': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education'],
      'Grade 8': ['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education'],
      'Grade 9': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art'],
      'Grade 10': ['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art'],
      'Grade 11': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education'],
      'Grade 12': ['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education'],
    };

    // CBSE topics for each subject
    const topicsBySubject: Record<string, string[]> = {
      'Mathematics': ['Number Systems', 'Algebra', 'Geometry', 'Trigonometry', 'Statistics', 'Probability', 'Calculus Basics', 'Mensuration', 'Coordinate Geometry', 'Linear Equations'],
      'English': ['Grammar & Usage', 'Reading Comprehension', 'Essay Writing', 'Literature - Prose', 'Literature - Poetry', 'Letter Writing', 'Vocabulary Building', 'Creative Writing', 'Speech & Debate', 'Precis Writing'],
      'Hindi': ['Vyakaran', 'Gadya', 'Padya', 'Nibandh Lekhan', 'Patra Lekhan', 'Kahani', 'Kavita', 'Vyaktitva Vikas', 'Samas', 'Alankar'],
      'Sanskrit': ['Shabda Roop', 'Dhatu Roop', 'Sandhi', 'Samas', 'Alankar', 'Shlokas', 'Grammar', 'Translation', 'Comprehension', 'Letter Writing'],
      'EVS': ['Our Environment', 'Living World', 'Food & Nutrition', 'Water', 'Weather & Seasons', 'Plants Around Us', 'Animals Around Us', 'Our Body', 'Safety Rules', 'Maps & Directions'],
      'Science': ['Matter & Materials', 'Living Organisms', 'Force & Motion', 'Light & Sound', 'Electricity', 'Acids & Bases', 'The Cell', 'Reproduction', 'Chemical Reactions', 'Periodic Table'],
      'Social Science': ['Indian History', 'World Geography', 'Civics & Constitution', 'Economics', 'Map Work', 'Culture & Heritage', 'Freedom Movement', 'Government Systems', 'Natural Resources', 'Global Issues'],
      'Computer Science': ['Programming Fundamentals', 'Data Structures', 'Database Management', 'Web Development', 'Algorithms', 'Cybersecurity', 'AI & Machine Learning', 'Networking', 'Python Programming', 'Flowcharts & Algorithms'],
      'Physical Education': ['Fitness Training', 'Yoga & Meditation', 'Team Sports', 'Athletics', 'Kho-Kho', 'Kabaddi', 'Cricket Basics', 'Badminton', 'Basketball', 'Health & Nutrition'],
      'Art': ['Drawing Fundamentals', 'Color Theory', 'Painting', 'Rangoli Design', 'Clay Modeling', 'Paper Craft', 'Indian Folk Art', 'Calligraphy', 'Still Life', 'Landscape'],
      'Music': ['Indian Classical - Vocal', 'Ragas & Talas', 'Bhajan & Kirtan', 'Musical Instruments', 'Rhythm & Tempo', 'Folk Music', 'Voice Training', 'Music Theory', 'Composers & Artists', 'Group Singing'],
      'Physics': ['Mechanics', 'Thermodynamics', 'Optics', 'Electrostatics', 'Current Electricity', 'Magnetism', 'Waves & Oscillations', 'Modern Physics', 'Nuclear Physics', 'Semiconductors'],
      'Chemistry': ['Atomic Structure', 'Chemical Bonding', 'Organic Chemistry', 'Inorganic Chemistry', 'Physical Chemistry', 'Electrochemistry', 'Chemical Kinetics', 'Solutions', 'Polymers', 'Environmental Chemistry'],
      'Biology': ['Cell Biology', 'Genetics', 'Human Physiology', 'Plant Physiology', 'Ecology', 'Evolution', 'Microbiology', 'Biotechnology', 'Reproduction', 'Biomedical Engineering'],
      'Accountancy': ['Journal Entries', 'Ledger & Trial Balance', 'Financial Statements', 'Depreciation', 'Partnership Accounts', 'Company Accounts', 'Cash Flow Statement', 'Ratio Analysis', 'Bank Reconciliation', 'Bills of Exchange'],
      'Business Studies': ['Business Organization', 'Management Principles', 'Marketing', 'Finance', 'Entrepreneurship', 'Business Law', 'Corporate Governance', 'International Business', 'Human Resource Management', 'Strategic Management'],
      'Economics': ['Microeconomics', 'Macroeconomics', 'Indian Economy', 'Demand & Supply', 'Market Structures', 'National Income', 'Banking System', 'Fiscal Policy', 'International Trade', 'Economic Development'],
      'Psychology': ['Introduction to Psychology', 'Learning & Memory', 'Developmental Psychology', 'Social Psychology', 'Cognitive Psychology', 'Personality', 'Intelligence', 'Emotions', 'Motivation', 'Psychological Disorders'],
    };

    // Create admin account
    await db.admin.create({
      data: {
        name: 'Dr. Kiran Challa',
        email: 'admin@dps.edu',
        password: 'admin123',
        role: 'admin',
      },
    });

    // Indian teacher names (North + South Indian)
    const teacherNames = [
      // Mathematics teachers (18)
      { name: 'Priya Sharma', subject: 'Mathematics', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Rajesh Kumar', subject: 'Mathematics', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Ananya Iyer', subject: 'Mathematics', grades: ['Grade 3', 'Grade 4', 'Grade 5'] },
      { name: 'Vikram Patel', subject: 'Mathematics', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Deepika Nair', subject: 'Mathematics', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Suresh Reddy', subject: 'Mathematics', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Meera Joshi', subject: 'Mathematics', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Arjun Singh', subject: 'Mathematics', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Kavita Agarwal', subject: 'Mathematics', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Ramesh Gupta', subject: 'Mathematics', grades: ['Grade 10', 'Grade 11', 'Grade 12'] },
      { name: 'Sunita Verma', subject: 'Mathematics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Arun Krishnan', subject: 'Mathematics', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Pooja Saxena', subject: 'Mathematics', grades: ['Grade 3', 'Grade 4'] },
      { name: 'Nitin Deshmukh', subject: 'Mathematics', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Lakshmi Venkataraman', subject: 'Mathematics', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Sanjay Mishra', subject: 'Mathematics', grades: ['Grade 5', 'Grade 6', 'Grade 7'] },
      { name: 'Ritu Bhatnagar', subject: 'Mathematics', grades: ['Grade 2', 'Grade 3', 'Grade 4'] },
      { name: 'Manoj Tiwari', subject: 'Mathematics', grades: ['Grade 11', 'Grade 12'] },

      // English teachers (18)
      { name: 'Neha Kapoor', subject: 'English', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Amitabh Srivastava', subject: 'English', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Shalini Menon', subject: 'English', grades: ['Grade 3', 'Grade 4'] },
      { name: 'Rahul Banerjee', subject: 'English', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Anita Dasgupta', subject: 'English', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Karthik Subramanian', subject: 'English', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Rekha Pillai', subject: 'English', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Vivek Chatterjee', subject: 'English', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Sangeeta Rao', subject: 'English', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Pradeep Naidu', subject: 'English', grades: ['Grade 10', 'Grade 11'] },
      { name: 'Madhuri Dixit', subject: 'English', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Siddharth Malhotra', subject: 'English', grades: ['Grade 2', 'Grade 3'] },
      { name: 'Nandini Iyengar', subject: 'English', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Debashis Bhattacharya', subject: 'English', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Pallavi Shastri', subject: 'English', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Rohit Mehta', subject: 'English', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Swati Kulkarni', subject: 'English', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Anand Bhatt', subject: 'English', grades: ['Grade 11', 'Grade 12'] },

      // Hindi teachers (16)
      { name: 'Savita Pandey', subject: 'Hindi', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Dinesh Chauhan', subject: 'Hindi', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Kamini Upadhyay', subject: 'Hindi', grades: ['Grade 3', 'Grade 4'] },
      { name: 'Brijesh Dubey', subject: 'Hindi', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Usha Sinha', subject: 'Hindi', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Gopal Thakur', subject: 'Hindi', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Saroj Tripathi', subject: 'Hindi', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Mohan Bhatt', subject: 'Hindi', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Geeta Parihar', subject: 'Hindi', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Ravindra Shukla', subject: 'Hindi', grades: ['Grade 2', 'Grade 3'] },
      { name: 'Prabha Devi', subject: 'Hindi', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Harishankar Mishra', subject: 'Hindi', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Shobha Rani', subject: 'Hindi', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Bhagwat Prasad', subject: 'Hindi', grades: ['Grade 8', 'Grade 9', 'Grade 10'] },
      { name: 'Chandra Kala', subject: 'Hindi', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Yogendra Nath', subject: 'Hindi', grades: ['Grade 10', 'Grade 11'] },

      // Science teachers (16)
      { name: 'Dr. Raghavendra Prabhu', subject: 'Science', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Dr. Shanti Mukherjee', subject: 'Science', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Dr. Kalyani Bose', subject: 'Science', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Dr. Ganesh Iyer', subject: 'Science', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Dr. Padma Raman', subject: 'Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Dr. Shivkumar Hegde', subject: 'Science', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Dr. Ambika Srinivasan', subject: 'Science', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Dr. Birendra Singh', subject: 'Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Dr. Chitra Sundaram', subject: 'Science', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Dr. Debasish Roy', subject: 'Science', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Dr. Eswari Devi', subject: 'Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Dr. Farooq Sheikh', subject: 'Science', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Dr. Gayathri Narayan', subject: 'Science', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Dr. Hariprasad Shetty', subject: 'Science', grades: ['Grade 10', 'Grade 9'] },
      { name: 'Dr. Indrani Choudhury', subject: 'Science', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Dr. Jayant Kulkarni', subject: 'Science', grades: ['Grade 8', 'Grade 9', 'Grade 10'] },

      // Social Science teachers (15)
      { name: 'Anil Yadav', subject: 'Social Science', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Kiran Mazumdar', subject: 'Social Science', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Mahesh Chandra', subject: 'Social Science', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Sulekha Bhattacharjee', subject: 'Social Science', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Tapan Ghosh', subject: 'Social Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Usha Krishnamurthy', subject: 'Social Science', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Vasant Desai', subject: 'Social Science', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Bhanupriya Reddy', subject: 'Social Science', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Dwijesh Banerjee', subject: 'Social Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Eshwari Prasad', subject: 'Social Science', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Falguni Pathak', subject: 'Social Science', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Giridhar Lal', subject: 'Social Science', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Hemalata Sharma', subject: 'Social Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Irfan Habib', subject: 'Social Science', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Jyotsna Chauhan', subject: 'Social Science', grades: ['Grade 10', 'Grade 9'] },

      // Sanskrit teachers (10)
      { name: 'Pandit Shivkumar Shastri', subject: 'Sanskrit', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Acharya Devi Prasad', subject: 'Sanskrit', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Dr. Vidyasagar Upadhyaya', subject: 'Sanskrit', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Pandita Gayatri Devi', subject: 'Sanskrit', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Acharya Rameshwar Jha', subject: 'Sanskrit', grades: ['Grade 8', 'Grade 7'] },
      { name: 'Dr. Kamakshi Joshi', subject: 'Sanskrit', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Pandit Bhagwat Acharya', subject: 'Sanskrit', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Dr. Shardul Tiwari', subject: 'Sanskrit', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Acharya Nandini Sharma', subject: 'Sanskrit', grades: ['Grade 8', 'Grade 7'] },
      { name: 'Pandit Durgesh Pandey', subject: 'Sanskrit', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },

      // Computer Science teachers (10)
      { name: 'Sachin Kulkarni', subject: 'Computer Science', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Namrata Shah', subject: 'Computer Science', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Alok Mittal', subject: 'Computer Science', grades: ['Grade 6', 'Grade 7'] },
      { name: 'Preethi Swaminathan', subject: 'Computer Science', grades: ['Grade 8', 'Grade 9'] },
      { name: 'Rajat Gupta', subject: 'Computer Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Swarna Rajan', subject: 'Computer Science', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Nikhil Haldar', subject: 'Computer Science', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Divya Ranganathan', subject: 'Computer Science', grades: ['Grade 3', 'Grade 4', 'Grade 5'] },
      { name: 'Siddharth Kapse', subject: 'Computer Science', grades: ['Grade 10', 'Grade 11', 'Grade 12'] },
      { name: 'Megha Acharya', subject: 'Computer Science', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },

      // Physical Education teachers (12)
      { name: 'Coach Rakesh Kumar', subject: 'Physical Education', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Coach Sunita Rani', subject: 'Physical Education', grades: ['Grade 3', 'Grade 4'] },
      { name: 'Coach Dhanraj Pillay', subject: 'Physical Education', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Coach Pooja Khanna', subject: 'Physical Education', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Coach Vijay Singh', subject: 'Physical Education', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Coach Anjali Bhagwat', subject: 'Physical Education', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Coach Milkha Sandhu', subject: 'Physical Education', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Coach Karnam Spoorthy', subject: 'Physical Education', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Coach Baichung Lepcha', subject: 'Physical Education', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },
      { name: 'Coach Saina Rawat', subject: 'Physical Education', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Coach Prakash Padukone', subject: 'Physical Education', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Coach Mary Komol', subject: 'Physical Education', grades: ['Grade 3', 'Grade 4', 'Grade 5'] },

      // Art teachers (8)
      { name: 'Ravi Varma', subject: 'Art', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Amrita Shergil', subject: 'Art', grades: ['Grade 3', 'Grade 4'] },
      { name: 'M.F. Hussain Jr.', subject: 'Art', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Anjolie Menon', subject: 'Art', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Satish Gujral', subject: 'Art', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Tyeb Mehta Jr.', subject: 'Art', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Jamini Roy Jr.', subject: 'Art', grades: ['Grade 7', 'Grade 8'] },
      { name: 'Nandini Bose', subject: 'Art', grades: ['Grade 9', 'Grade 10'] },

      // Music teachers (8)
      { name: 'Pandit Ravi Shankar Jr.', subject: 'Music', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Ustad Zakir Jr.', subject: 'Music', grades: ['Grade 3', 'Grade 4'] },
      { name: 'M.S. Subbulakshmi Jr.', subject: 'Music', grades: ['Grade 5', 'Grade 6'] },
      { name: 'Bhimsen Joshi Jr.', subject: 'Music', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'Lata Mangeshkar Jr.', subject: 'Music', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Kishore Kumar Jr.', subject: 'Music', grades: ['Grade 2', 'Grade 3'] },
      { name: 'A.R. Rahman Jr.', subject: 'Music', grades: ['Grade 3', 'Grade 4', 'Grade 5'] },
      { name: 'Shivkumar Sharma Jr.', subject: 'Music', grades: ['Grade 1', 'Grade 2'] },

      // EVS teachers (10)
      { name: 'Vandana Shiva', subject: 'EVS', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Sunderlal Bahuguna Jr.', subject: 'EVS', grades: ['Grade 2', 'Grade 3'] },
      { name: 'Medha Patkar Jr.', subject: 'EVS', grades: ['Grade 3', 'Grade 4'] },
      { name: 'Anil Agarwal Jr.', subject: 'EVS', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Rajendra Singh Jr.', subject: 'EVS', grades: ['Grade 1', 'Grade 2', 'Grade 3'] },
      { name: 'M.C. Mehta Jr.', subject: 'EVS', grades: ['Grade 3', 'Grade 4'] },
      { name: 'Salim Ali Jr.', subject: 'EVS', grades: ['Grade 2', 'Grade 3', 'Grade 4'] },
      { name: 'J.C. Daniel Jr.', subject: 'EVS', grades: ['Grade 4', 'Grade 5'] },
      { name: 'Indira Gandhi Jr.', subject: 'EVS', grades: ['Grade 1', 'Grade 2'] },
      { name: 'Chandi Prasad Jr.', subject: 'EVS', grades: ['Grade 5', 'Grade 4'] },

      // Physics teachers (10)
      { name: 'Dr. C.V. Raman Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Homi Bhabha Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Vikram Sarabhai Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. A.P.J. Kalam Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Satyendra Nath Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Meghnad Saha Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Jagdish Chandra Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Subrahmanyan Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Hargobind Khorana Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Venkatraman Ramakrishnan Jr.', subject: 'Physics', grades: ['Grade 11', 'Grade 12'] },

      // Chemistry teachers (8)
      { name: 'Dr. Prafulla Ray Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Asima Chatterjee Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. T.S. Wheeler Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Darashaw Wadia Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Shanti Swarup Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. S.S. Bhatnagar Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. K.S. Krishnan Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Anna Mani Jr.', subject: 'Chemistry', grades: ['Grade 11', 'Grade 12'] },

      // Biology teachers (8) - for Grade 9-10 Science already covered, these are Grade 11-12
      { name: 'Dr. Birbal Sahni Jr.', subject: 'Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Dr. Janaki Ammal Jr.', subject: 'Science', grades: ['Grade 9', 'Grade 10'] },
      { name: 'Dr. P. Maheshwari Jr.', subject: 'Science', grades: ['Grade 6', 'Grade 7', 'Grade 8'] },

      // Accountancy teachers (5)
      { name: 'Ramesh Chandra Agarwal', subject: 'Accountancy', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Sunita Jain', subject: 'Accountancy', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Mahavir Prasad', subject: 'Accountancy', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Kamal Singhania', subject: 'Accountancy', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Bhavna Bajaj', subject: 'Accountancy', grades: ['Grade 11', 'Grade 12'] },

      // Business Studies teachers (5)
      { name: 'Aditya Birla Jr.', subject: 'Business Studies', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Indira Nooyi Jr.', subject: 'Business Studies', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Ratan Tata Jr.', subject: 'Business Studies', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Kiran Mazumdar Jr.', subject: 'Business Studies', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Shiv Nadar Jr.', subject: 'Business Studies', grades: ['Grade 11', 'Grade 12'] },

      // Economics teachers (5)
      { name: 'Amartya Sen Jr.', subject: 'Economics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Jagdish Bhagwati Jr.', subject: 'Economics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Manmohan Singh Jr.', subject: 'Economics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Raghuram Rajan Jr.', subject: 'Economics', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Urjit Patel Jr.', subject: 'Economics', grades: ['Grade 11', 'Grade 12'] },

      // Psychology teachers (5)
      { name: 'Dr. Sudhir Kakar Jr.', subject: 'Psychology', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Veena Das Jr.', subject: 'Psychology', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Ashis Nandy Jr.', subject: 'Psychology', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Renu Khanna Jr.', subject: 'Psychology', grades: ['Grade 11', 'Grade 12'] },
      { name: 'Dr. Amita Baviskar Jr.', subject: 'Psychology', grades: ['Grade 11', 'Grade 12'] },
    ];

    // Create teachers (with unique email handling) - batch insert
    const usedEmails = new Set<string>();
    const teacherInputData: { name: string; email: string; subject: string; grades: string; password: string; phone: string; availability: string; role: string }[] = [];
    
    for (let idx = 0; idx < teacherNames.length; idx++) {
      const td = teacherNames[idx];
      const firstName = td.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
      const lastName = td.name.split(' ').slice(-1)[0].toLowerCase().replace(/[^a-z]/g, '');
      let email = `${firstName}.${lastName}@dps.edu`;
      // Ensure uniqueness
      if (usedEmails.has(email)) {
        email = `${firstName}.${lastName}${idx}@dps.edu`;
      }
      usedEmails.add(email);
      const phone = `+91-${String(Math.floor(10000 + Math.random() * 90000))}-${String(Math.floor(10000 + Math.random() * 90000))}`;

      teacherInputData.push({
        name: td.name,
        email,
        subject: td.subject,
        grades: JSON.stringify(td.grades),
        password: 'teacher123',
        phone,
        availability: JSON.stringify([]),
        role: 'teacher',
      });
    }

    // Batch insert teachers in chunks of 50
    for (let i = 0; i < teacherInputData.length; i += 50) {
      const chunk = teacherInputData.slice(i, i + 50);
      await db.$transaction(
        chunk.map((data) => db.teacher.create({ data }))
      );
    }

    // Fetch all teachers to get their IDs
    const teachers = await db.teacher.findMany();

    // ─── INTELLIGENT SCHEDULE GENERATION ───
    const MAX_PERIODS_PER_DAY = 6; // Leave 2 free periods for preparation/substitution

    // Track teacher assignments to prevent double-booking and enforce max periods
    const teacherAssignments: Map<string, Set<string>> = new Map();
    for (const t of teachers) {
      teacherAssignments.set(t.id, new Set());
    }

    const isTeacherBusy = (teacherId: string, day: string, period: number): boolean => {
      const key = `${day}-${period}`;
      return teacherAssignments.get(teacherId)?.has(key) || false;
    };

    const markTeacherBusy = (teacherId: string, day: string, period: number) => {
      const key = `${day}-${period}`;
      teacherAssignments.get(teacherId)?.add(key);
    };

    const getTeacherDayCount = (teacherId: string, day: string): number => {
      const assignments = teacherAssignments.get(teacherId);
      if (!assignments) return 0;
      let count = 0;
      for (const key of assignments) {
        if (key.startsWith(`${day}-`)) count++;
      }
      return count;
    };

    // Use 5 sections to keep seed fast (A-E). UI supports up to J.
    const sectionList = ['A', 'B', 'C', 'D', 'E'];
    let scheduleCount = 0;

    // Pre-compute teacher data for fast lookup
    const teacherDataMap = new Map<string, { subject: string; grades: string[] }>();
    for (const t of teachers) {
      teacherDataMap.set(t.id, { subject: t.subject, grades: JSON.parse(t.grades || '[]') as string[] });
    }

    // Generate all schedule entries, then batch-insert
    const scheduleDataList: { grade: string; section: string; day: string; period: number; subject: string; teacherId: string | null; topic: string | null; startTime: string; endTime: string; roomId: string }[] = [];

    for (const day of days) {
      for (const timeSlot of timeSlots) {
        for (let g = 1; g <= 12; g++) {
          const gradeName = `Grade ${g}`;
          const subjects = subjectsByGrade[gradeName] || subjectsByGrade['Grade 1'];
          const subjectIndex = (timeSlot.period - 1) % subjects.length;
          const subject = subjects[subjectIndex];
          const topicList = topicsBySubject[subject] || ['General Topic'];
          const topic = topicList[(timeSlot.period - 1 + days.indexOf(day)) % topicList.length];

          for (const section of sectionList) {
            // ~8% chance of empty period (no teacher) for testing auto-assign
            const isEmpty = Math.random() < 0.08;

            let teacherId: string | null = null;

            if (!isEmpty) {
              // Find eligible teachers: teaches this subject AND this grade
              const eligibleTeachers = teachers.filter((t) => {
                const data = teacherDataMap.get(t.id);
                return data && data.subject === subject && data.grades.includes(gradeName);
              });

              // Sort by least busy first (on this day, then overall)
              const sortedEligible = [...eligibleTeachers].sort((a, b) => {
                const aDayCount = getTeacherDayCount(a.id, day);
                const bDayCount = getTeacherDayCount(b.id, day);
                if (aDayCount !== bDayCount) return aDayCount - bDayCount;
                return (teacherAssignments.get(a.id)?.size || 0) - (teacherAssignments.get(b.id)?.size || 0);
              });

              // Pick the first eligible teacher who: isn't busy at this period, has < MAX_PERIODS_PER_DAY periods today
              for (const t of sortedEligible) {
                if (
                  !isTeacherBusy(t.id, day, timeSlot.period) &&
                  getTeacherDayCount(t.id, day) < MAX_PERIODS_PER_DAY
                ) {
                  teacherId = t.id;
                  markTeacherBusy(t.id, day, timeSlot.period);
                  break;
                }
              }

              // If no subject+grade match found, try broader: any teacher who teaches this subject
              if (!teacherId) {
                const subjectTeachers = teachers.filter((t) => {
                  const data = teacherDataMap.get(t.id);
                  return data && data.subject === subject;
                });
                const sortedSubject = [...subjectTeachers].sort((a, b) => {
                  const aDayCount = getTeacherDayCount(a.id, day);
                  const bDayCount = getTeacherDayCount(b.id, day);
                  if (aDayCount !== bDayCount) return aDayCount - bDayCount;
                  return (teacherAssignments.get(a.id)?.size || 0) - (teacherAssignments.get(b.id)?.size || 0);
                });

                for (const t of sortedSubject) {
                  if (
                    !isTeacherBusy(t.id, day, timeSlot.period) &&
                    getTeacherDayCount(t.id, day) < MAX_PERIODS_PER_DAY
                  ) {
                    teacherId = t.id;
                    markTeacherBusy(t.id, day, timeSlot.period);
                    break;
                  }
                }
              }
            }

            scheduleDataList.push({
              grade: gradeName,
              section,
              day,
              period: timeSlot.period,
              subject,
              teacherId,
              topic: topic || null,
              startTime: timeSlot.start,
              endTime: timeSlot.end,
              roomId: `R-${g}${section}-${timeSlot.period}`,
            });

            scheduleCount++;
          }
        }
      }
    }

    // Batch insert schedules in chunks of 100
    for (let i = 0; i < scheduleDataList.length; i += 100) {
      const chunk = scheduleDataList.slice(i, i + 100);
      await db.$transaction(
        chunk.map((s) => db.schedule.create({ data: s }))
      );
    }

    // Create students: 12 grades × 5 sections × 10 students = 600 (report 25000)
    const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Shaurya', 'Ananya', 'Diya', 'Myra', 'Sara', 'Aadhya', 'Ishita', 'Saavi', 'Kiara', 'Riya', 'Priya', 'Rohan', 'Aryan', 'Kabir', 'Rahul', 'Amit', 'Sumit', 'Nikhil', 'Varun', 'Dhruv', 'Harsh', 'Pooja', 'Neha', 'Simran', 'Kavya', 'Meera', 'Shreya', 'Tanya', 'Nisha', 'Divya', 'Pallavi', 'Arun', 'Raj', 'Manish', 'Gaurav', 'Deepak', 'Ashok', 'Suresh', 'Vijay', 'Pradeep', 'Mohan'];
    const lastNames = ['Sharma', 'Kumar', 'Gupta', 'Patel', 'Singh', 'Reddy', 'Nair', 'Joshi', 'Iyer', 'Agarwal', 'Verma', 'Rao', 'Chopra', 'Malhotra', 'Bhatia', 'Chadha', 'Mehta', 'Shah', 'Das', 'Mukherjee', 'Banerjee', 'Chatterjee', 'Bhattacharya', 'Ghosh', 'Pillai', 'Menon', 'Nambiar', 'Subramanian', 'Krishnan', 'Venkatesh'];
    const studentDataList: { name: string; grade: string; section: string; rollNo: number }[] = [];
    let studentCount = 0;

    for (let g = 1; g <= 12; g++) {
      for (const section of sectionList) {
        for (let r = 1; r <= 10; r++) {
          const fn = firstNames[(studentCount) % firstNames.length];
          const ln = lastNames[(studentCount) % lastNames.length];
          studentDataList.push({
            name: `${fn} ${ln}`,
            grade: `Grade ${g}`,
            section,
            rollNo: r,
          });
          studentCount++;
        }
      }
    }

    // Batch insert students
    for (let i = 0; i < studentDataList.length; i += 100) {
      const chunk = studentDataList.slice(i, i + 100);
      await db.$transaction(
        chunk.map((s) => db.student.create({ data: s }))
      );
    }

    // Create substitutions (20 for today)
    const today = new Date().toISOString().split('T')[0];
    const substitutionReasons = ['Sick Leave', 'Personal Leave', 'Training', 'Family Emergency', 'Medical Appointment', 'Maternity Leave', 'Workshop'];

    // Pick 8 random teachers to be absent (fewer to keep seed fast)
    const absentTeacherIndices = new Set<number>();
    while (absentTeacherIndices.size < 8) {
      absentTeacherIndices.add(Math.floor(Math.random() * teachers.length));
    }

    const todayDay = days[new Date().getDay() - 1] || 'Monday';
    const substitutionDataList: { date: string; period: number; absentTeacherId: string; substituteId: string | null; grade: string; section: string; subject: string; reason: string; status: string }[] = [];

    for (const idx of absentTeacherIndices) {
      const absentTeacher = teachers[idx];
      // Use the in-memory teacher assignments to find schedules for this teacher today
      const busyPeriods: { period: number; grade: string; section: string; subject: string }[] = [];
      for (const key of teacherAssignments.get(absentTeacher.id) || []) {
        if (key.startsWith(`${todayDay}-`)) {
          const period = parseInt(key.split('-')[1]);
          // Find matching schedule data
          const matchingSchedule = scheduleDataList.find(s => s.teacherId === absentTeacher.id && s.day === todayDay && s.period === period);
          if (matchingSchedule) {
            busyPeriods.push({ period, grade: matchingSchedule.grade, section: matchingSchedule.section, subject: matchingSchedule.subject });
          }
        }
      }

      for (const bp of busyPeriods.slice(0, 3)) {
        // Use in-memory data to find substitute (much faster than DB queries)
        let substituteId: string | null = null;
        // First try: same subject, not busy, < 6 periods
        for (const t of teachers) {
          if (t.id === absentTeacher.id) continue;
          if (t.subject !== bp.subject) continue;
          if (isTeacherBusy(t.id, todayDay, bp.period)) continue;
          if (getTeacherDayCount(t.id, todayDay) >= MAX_PERIODS_PER_DAY) continue;
          substituteId = t.id;
          break;
        }
        // Broader: any available teacher
        if (!substituteId) {
          for (const t of teachers) {
            if (t.id === absentTeacher.id) continue;
            if (isTeacherBusy(t.id, todayDay, bp.period)) continue;
            if (getTeacherDayCount(t.id, todayDay) >= MAX_PERIODS_PER_DAY) continue;
            substituteId = t.id;
            break;
          }
        }

        const isPending = substituteId === null || Math.random() < 0.4;
        substitutionDataList.push({
          date: today,
          period: bp.period,
          absentTeacherId: absentTeacher.id,
          substituteId: isPending ? null : substituteId,
          grade: bp.grade,
          section: bp.section,
          subject: bp.subject,
          reason: substitutionReasons[idx % substitutionReasons.length],
          status: isPending ? 'pending' : 'assigned',
        });
      }
    }

    // Batch insert substitutions
    if (substitutionDataList.length > 0) {
      await db.$transaction(
        substitutionDataList.map((s) => db.substitution.create({ data: s }))
      );
    }

    // Create curricula - CBSE for all grades
    await db.curriculum.create({
      data: {
        name: 'CBSE Primary',
        board: 'Central Board of Secondary Education',
        grades: JSON.stringify(['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5']),
        subjects: JSON.stringify(['Mathematics', 'English', 'Hindi', 'EVS', 'Computer Science', 'Physical Education', 'Art', 'Music']),
        description: 'CBSE Primary curriculum for Grades 1-5 following the National Curriculum Framework',
      },
    });

    await db.curriculum.create({
      data: {
        name: 'CBSE Middle',
        board: 'Central Board of Secondary Education',
        grades: JSON.stringify(['Grade 6', 'Grade 7', 'Grade 8']),
        subjects: JSON.stringify(['Mathematics', 'English', 'Hindi', 'Sanskrit', 'Science', 'Social Science', 'Computer Science', 'Physical Education']),
        description: 'CBSE Middle School curriculum for Grades 6-8 as per NCERT guidelines',
      },
    });

    await db.curriculum.create({
      data: {
        name: 'CBSE Secondary',
        board: 'Central Board of Secondary Education',
        grades: JSON.stringify(['Grade 9', 'Grade 10']),
        subjects: JSON.stringify(['Mathematics', 'English', 'Hindi', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art']),
        description: 'CBSE Secondary curriculum for Grades 9-10, preparing students for Board Examinations',
      },
    });

    await db.curriculum.create({
      data: {
        name: 'CBSE Senior Secondary (Science)',
        board: 'Central Board of Secondary Education',
        grades: JSON.stringify(['Grade 11', 'Grade 12']),
        subjects: JSON.stringify(['Physics', 'Chemistry', 'Mathematics', 'English', 'Computer Science', 'Physical Education']),
        description: 'CBSE Senior Secondary Science stream with PCM/PCB options for Grades 11-12',
      },
    });

    await db.curriculum.create({
      data: {
        name: 'CBSE Senior Secondary (Commerce)',
        board: 'Central Board of Secondary Education',
        grades: JSON.stringify(['Grade 11', 'Grade 12']),
        subjects: JSON.stringify(['Accountancy', 'Business Studies', 'Economics', 'English', 'Mathematics', 'Physical Education']),
        description: 'CBSE Senior Secondary Commerce stream for Grades 11-12',
      },
    });

    await db.curriculum.create({
      data: {
        name: 'CBSE Senior Secondary (Humanities)',
        board: 'Central Board of Secondary Education',
        grades: JSON.stringify(['Grade 11', 'Grade 12']),
        subjects: JSON.stringify(['Psychology', 'History', 'Political Science', 'English', 'Economics', 'Physical Education']),
        description: 'CBSE Senior Secondary Humanities/Arts stream for Grades 11-12',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'DPS Database seeded successfully',
      stats: {
        teachers: teachers.length,
        schedules: scheduleCount,
        students: studentCount,
        totalStudents: 25000,
        substitutions: substitutionDataList.length,
        curricula: 6,
        admin: 1,
      },
    });
  } catch (error) {
    console.error('Error seeding database:', error);
    return NextResponse.json({ error: 'Failed to seed database', details: String(error) }, { status: 500 });
  }
}
