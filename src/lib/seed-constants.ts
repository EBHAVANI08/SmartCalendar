export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const TIME_SLOTS = [
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
export const SUBJECTS_BY_GRADE: Record<string, string[]> = {
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
export const TOPICS_BY_SUBJECT: Record<string, string[]> = {
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
