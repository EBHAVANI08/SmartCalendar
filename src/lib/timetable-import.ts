import * as XLSX from 'xlsx';

export const TIMETABLE_SHEETS = [
  'Teachers', 'Classes', 'SubjectRequirements', 'TeacherAssignments',
  'Availability', 'Rooms', 'SubjectRoomRequirements', 'FixedPeriods', 'BellSchedule',
] as const;

export type ImportIssue = {
  severity: 'error' | 'warning'; code: string; dataset: string;
  rowNumber?: number; field?: string; message: string; suggestedValue?: string;
};

export type ImportPreview = {
  sheets: Record<string, Record<string, unknown>[]>;
  summary: Record<string, { total: number; valid: number; warnings: number; errors: number }>;
  issues: ImportIssue[];
  blocking: boolean;
};

const headers: Record<(typeof TIMETABLE_SHEETS)[number], string[]> = {
  Teachers: ['Employee ID', 'Teacher Name', 'Email', 'Primary Subject', 'Secondary Subjects', 'Eligible Grades', 'Max Weekly', 'Max Daily', 'Max Consecutive'],
  Classes: ['Class Code', 'Grade', 'Section', 'Student Strength', 'Class Teacher ID', 'Room Code'],
  SubjectRequirements: ['Class Code', 'Subject', 'Weekly Periods', 'Min Per Day', 'Max Per Day', 'Double Periods', 'Preferred Time'],
  TeacherAssignments: ['Employee ID', 'Class Code', 'Subject', 'Priority', 'Periods Assigned'],
  Availability: ['Employee ID', 'Day', 'Period', 'Status', 'Reason'],
  Rooms: ['Room Code', 'Room Name', 'Room Type', 'Capacity', 'Available Days', 'Campus'],
  SubjectRoomRequirements: ['Subject', 'Required Room Type', 'Mandatory'],
  FixedPeriods: ['Class Code', 'Day', 'Period', 'Subject', 'Employee ID', 'Room Code', 'Locked'],
  BellSchedule: ['Day', 'Period', 'Start Time', 'End Time', 'Slot Type'],
};

const samples: Record<string, unknown[][]> = {
  Teachers: [
    ['T001', 'Rajesh Sharma', 'rajesh.sharma@example.edu', 'Mathematics', 'Physics', '1,2,3,4,5', 30, 6, 3],
    ['T002', 'Priya Verma', 'priya.verma@example.edu', 'English', 'Social Studies', '1,2,3,4,5', 30, 6, 3],
    ['T003', 'Dr. Ananya Sen', 'ananya.sen@example.edu', 'Science', 'Biology', '6,7,8', 30, 6, 3],
    ['T004', 'Vikram Rao', 'vikram.rao@example.edu', 'Social Science', 'History', '6,7,8', 30, 6, 3],
    ['T005', 'Neha Gupta', 'neha.gupta@example.edu', 'Hindi', 'Sanskrit', '9,10,11,12', 30, 6, 3],
    ['T006', 'Amit Patel', 'amit.patel@example.edu', 'Physical Education', 'Sports', '1,2,3,4,5,6,7,8,9,10,11,12', 30, 6, 3],
  ],
  Classes: [
    ['G01-A', 'Grade 1', 'A', 30, 'T001', 'R-101'],
    ['G06-A', 'Grade 6', 'A', 38, 'T003', 'R-601'],
    ['G10-A', 'Grade 10', 'A', 40, 'T005', 'R-1001'],
  ],
  SubjectRequirements: [
    ['G01-A', 'Mathematics', 6, 1, 2, 0, 'Morning'],
    ['G01-A', 'English', 6, 1, 2, 0, 'Morning'],
    ['G06-A', 'Science', 6, 1, 2, 0, 'Morning'],
    ['G06-A', 'Social Science', 5, 1, 1, 0, 'Afternoon'],
    ['G10-A', 'Hindi', 5, 1, 1, 0, 'Morning'],
  ],
  TeacherAssignments: [
    ['T001', 'G01-A', 'Mathematics', 1, 6],
    ['T002', 'G01-A', 'English', 1, 6],
    ['T003', 'G06-A', 'Science', 1, 6],
    ['T004', 'G06-A', 'Social Science', 1, 5],
    ['T005', 'G10-A', 'Hindi', 1, 5],
  ],
  Availability: [
    ['T001', 'Wednesday', 1, 'Unavailable', 'Part-time restriction'],
  ],
  Rooms: [
    ['R-101', 'Primary 1-A', 'Classroom', 35, 'Monday-Saturday', 'Primary Wing'],
    ['R-601', 'Middle 6-A', 'Classroom', 45, 'Monday-Saturday', 'Middle Wing'],
    ['R-1001', 'High 10-A', 'Classroom', 45, 'Monday-Saturday', 'High Wing'],
    ['LAB-1', 'Science Lab', 'Laboratory', 40, 'Monday-Saturday', 'Main Wing'],
  ],
  SubjectRoomRequirements: [
    ['Science', 'Laboratory', 'No'],
    ['Computer Science', 'Computer Lab', 'Yes'],
  ],
  FixedPeriods: [
    ['G01-A', 'Monday', 1, 'Morning Assembly', '', 'AUD-1', 'Yes'],
    ['G06-A', 'Monday', 1, 'Morning Assembly', '', 'AUD-1', 'Yes'],
    ['G10-A', 'Monday', 1, 'Morning Assembly', '', 'AUD-1', 'Yes'],
  ],
  BellSchedule: [
    ['Monday', 1, '08:00', '08:45', 'Teaching'],
    ['Monday', 2, '08:45', '09:30', 'Teaching'],
    ['Monday', 3, '09:45', '10:30', 'Teaching'],
    ['Monday', 4, '10:30', '11:15', 'Teaching'],
  ],
};

export function createTimetableTemplate(): Buffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ['Smart Calendar Timetable Master Import Workbook'],
    ['Instructions:'],
    ['1. Complete the required sheets: Teachers, Classes, SubjectRequirements, TeacherAssignments.'],
    ['2. Optional sheets: Availability, Rooms, SubjectRoomRequirements, FixedPeriods, BellSchedule.'],
    ['3. Use matching Employee ID, Class Code, and Room Code values across linked sheets.'],
    ['4. Save and upload this workbook (.xlsx) directly into the Timetable Bulk Import Studio.'],
  ]);
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  for (const name of TIMETABLE_SHEETS) {
    const sheet = XLSX.utils.aoa_to_sheet([headers[name], ...(samples[name] || [])]);
    sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    sheet['!cols'] = headers[name].map((h) => ({ wch: Math.max(14, h.length + 2) }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function createTeacherAllotmentTemplate(format: 'xlsx' | 'csv' = 'xlsx'): Buffer | string {
  const teacherHeaders = ['Employee ID', 'Teacher Name', 'Email', 'Primary Subject', 'Eligible Grades', 'Phone', 'Max Daily Periods'];
  const teacherSampleData = [
    ['EMP001', 'Mr. Rajesh Sharma', 'rajesh.sharma@school.edu', 'Mathematics', 'Grade 1, Grade 2, Grade 3, Grade 4, Grade 5', '+91 98765 43210', 6],
    ['EMP002', 'Ms. Priya Verma', 'priya.verma@school.edu', 'English', 'Grade 1, Grade 2, Grade 3, Grade 4, Grade 5', '+91 98765 43211', 6],
    ['EMP003', 'Dr. Ananya Sen', 'ananya.sen@school.edu', 'Science', 'Grade 6, Grade 7, Grade 8', '+91 98765 43212', 6],
    ['EMP004', 'Mr. Vikram Rao', 'vikram.rao@school.edu', 'Social Science', 'Grade 6, Grade 7, Grade 8', '+91 98765 43213', 6],
    ['EMP005', 'Ms. Neha Gupta', 'neha.gupta@school.edu', 'Hindi', 'Grade 9, Grade 10, Grade 11, Grade 12', '+91 98765 43214', 6],
    ['EMP006', 'Mr. Amit Patel', 'amit.patel@school.edu', 'Physical Education', 'Grade 1 to Grade 12', '+91 98765 43215', 6],
    ['EMP007', 'Mr. Suresh Kumar', 'suresh.kumar@school.edu', 'Computer Science', 'Grade 6 to Grade 12', '+91 98765 43216', 6],
    ['EMP008', 'Ms. Meenakshi Iyer', 'meenakshi.iyer@school.edu', 'Art & Music', 'Grade 1 to Grade 8', '+91 98765 43217', 6],
  ];

  if (format === 'csv') {
    const csvRows = [
      teacherHeaders.join(','),
      ...teacherSampleData.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ];
    return csvRows.join('\r\n');
  }

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([teacherHeaders, ...teacherSampleData]);
  sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  sheet['!cols'] = [
    { wch: 15 },
    { wch: 24 },
    { wch: 30 },
    { wch: 22 },
    { wch: 48 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Teacher Allotments');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function rows(workbook: XLSX.WorkBook, name: string) {
  const sheet = workbook.Sheets[name];
  return sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
}

function text(value: unknown) { return String(value ?? '').trim(); }
function day(value: unknown) { return text(value).toLowerCase(); }

export function validateTimetableWorkbook(data: ArrayBuffer): ImportPreview {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  const sheets = Object.fromEntries(TIMETABLE_SHEETS.map((name) => [name, rows(workbook, name)]));
  const issues: ImportIssue[] = [];
  const required = ['Teachers', 'Classes', 'SubjectRequirements', 'TeacherAssignments'];
  for (const name of required) {
    if (!workbook.SheetNames.includes(name)) issues.push({ severity: 'error', code: 'MISSING_SHEET', dataset: name, message: `Required sheet ${name} is missing.` });
  }

  const teachers = new Set<string>();
  sheets.Teachers.forEach((r, i) => {
    const id = text(r['Employee ID']);
    if (!id) issues.push({ severity: 'error', code: 'REQUIRED', dataset: 'Teachers', rowNumber: i + 2, field: 'Employee ID', message: 'Employee ID is required.' });
    else if (teachers.has(id)) issues.push({ severity: 'error', code: 'DUPLICATE_TEACHER', dataset: 'Teachers', rowNumber: i + 2, field: 'Employee ID', message: `Employee ID ${id} is duplicated.` });
    teachers.add(id);
    if (!text(r['Teacher Name'])) issues.push({ severity: 'error', code: 'REQUIRED', dataset: 'Teachers', rowNumber: i + 2, field: 'Teacher Name', message: 'Teacher Name is required.' });
  });

  const classes = new Set<string>();
  sheets.Classes.forEach((r, i) => {
    const code = text(r['Class Code']);
    if (!code) issues.push({ severity: 'error', code: 'REQUIRED', dataset: 'Classes', rowNumber: i + 2, field: 'Class Code', message: 'Class Code is required.' });
    else if (classes.has(code)) issues.push({ severity: 'error', code: 'DUPLICATE_CLASS', dataset: 'Classes', rowNumber: i + 2, field: 'Class Code', message: `Class Code ${code} is duplicated.` });
    classes.add(code);
    const classTeacher = text(r['Class Teacher ID']);
    if (classTeacher && !teachers.has(classTeacher)) issues.push({ severity: 'error', code: 'UNKNOWN_TEACHER', dataset: 'Classes', rowNumber: i + 2, field: 'Class Teacher ID', message: `Teacher ${classTeacher} does not exist.` });
  });

  const rooms = new Map<string, string>();
  sheets.Rooms.forEach((r, i) => {
    const code = text(r['Room Code']);
    if (!code) issues.push({ severity: 'error', code: 'REQUIRED', dataset: 'Rooms', rowNumber: i + 2, field: 'Room Code', message: 'Room Code is required.' });
    else if (rooms.has(code)) issues.push({ severity: 'error', code: 'DUPLICATE_ROOM', dataset: 'Rooms', rowNumber: i + 2, field: 'Room Code', message: `Room Code ${code} is duplicated.` });
    rooms.set(code, text(r['Room Type']));
  });

  const requirements = new Map<string, number>();
  sheets.SubjectRequirements.forEach((r, i) => {
    const classCode = text(r['Class Code']);
    const subject = text(r.Subject);
    if (!classes.has(classCode)) issues.push({ severity: 'error', code: 'UNKNOWN_CLASS', dataset: 'SubjectRequirements', rowNumber: i + 2, field: 'Class Code', message: `Class ${classCode} does not exist.` });
    if (!subject) issues.push({ severity: 'error', code: 'REQUIRED', dataset: 'SubjectRequirements', rowNumber: i + 2, field: 'Subject', message: 'Subject is required.' });
    const weekly = Number(r['Weekly Periods']);
    if (!Number.isInteger(weekly) || weekly < 1) issues.push({ severity: 'error', code: 'INVALID_PERIODS', dataset: 'SubjectRequirements', rowNumber: i + 2, field: 'Weekly Periods', message: 'Weekly Periods must be a positive whole number.' });
    requirements.set(`${classCode}|${subject.toLowerCase()}`, weekly);
  });

  sheets.TeacherAssignments.forEach((r, i) => {
    const teacher = text(r['Employee ID']); const classCode = text(r['Class Code']); const subject = text(r.Subject);
    if (!teachers.has(teacher)) issues.push({ severity: 'error', code: 'UNKNOWN_TEACHER', dataset: 'TeacherAssignments', rowNumber: i + 2, field: 'Employee ID', message: `Teacher ${teacher} does not exist.` });
    if (!classes.has(classCode)) issues.push({ severity: 'error', code: 'UNKNOWN_CLASS', dataset: 'TeacherAssignments', rowNumber: i + 2, field: 'Class Code', message: `Class ${classCode} does not exist.` });
    if (!requirements.has(`${classCode}|${subject.toLowerCase()}`)) issues.push({ severity: 'warning', code: 'NO_REQUIREMENT', dataset: 'TeacherAssignments', rowNumber: i + 2, field: 'Subject', message: `${subject} has no requirement for ${classCode}.` });
  });

  const validDays = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
  sheets.Availability.forEach((r, i) => {
    if (!teachers.has(text(r['Employee ID']))) issues.push({ severity: 'error', code: 'UNKNOWN_TEACHER', dataset: 'Availability', rowNumber: i + 2, field: 'Employee ID', message: `Teacher ${text(r['Employee ID'])} does not exist.` });
    if (!validDays.has(day(r.Day))) issues.push({ severity: 'error', code: 'INVALID_DAY', dataset: 'Availability', rowNumber: i + 2, field: 'Day', message: `Invalid day ${text(r.Day)}.` });
  });

  const fixedKeys = new Set<string>();
  const fixedTeachers = new Set<string>();
  sheets.FixedPeriods.forEach((r, i) => {
    const classCode = text(r['Class Code']); const employeeId = text(r['Employee ID']); const slot = `${day(r.Day)}|${Number(r.Period)}`;
    if (!classes.has(classCode)) issues.push({ severity: 'error', code: 'UNKNOWN_CLASS', dataset: 'FixedPeriods', rowNumber: i + 2, field: 'Class Code', message: `Class ${classCode} does not exist.` });
    const classKey = `${classCode}|${slot}`;
    if (fixedKeys.has(classKey)) issues.push({ severity: 'error', code: 'CLASS_FIXED_CONFLICT', dataset: 'FixedPeriods', rowNumber: i + 2, message: `${classCode} has two fixed allocations at ${slot}.` });
    fixedKeys.add(classKey);
    if (employeeId) {
      const teacherKey = `${employeeId}|${slot}`;
      if (!teachers.has(employeeId)) issues.push({ severity: 'error', code: 'UNKNOWN_TEACHER', dataset: 'FixedPeriods', rowNumber: i + 2, field: 'Employee ID', message: `Teacher ${employeeId} does not exist.` });
      if (fixedTeachers.has(teacherKey)) issues.push({ severity: 'error', code: 'TEACHER_FIXED_CONFLICT', dataset: 'FixedPeriods', rowNumber: i + 2, message: `Teacher ${employeeId} is fixed twice at ${slot}.` });
      fixedTeachers.add(teacherKey);
    }
    const room = text(r['Room Code']);
    if (room && !rooms.has(room)) issues.push({ severity: 'error', code: 'UNKNOWN_ROOM', dataset: 'FixedPeriods', rowNumber: i + 2, field: 'Room Code', message: `Room ${room} does not exist.` });
  });

  const summary: ImportPreview['summary'] = {};
  for (const name of TIMETABLE_SHEETS) {
    const related = issues.filter((x) => x.dataset === name);
    const errorRows = new Set(related.filter((x) => x.severity === 'error' && x.rowNumber).map((x) => x.rowNumber));
    summary[name] = { total: sheets[name].length, valid: Math.max(0, sheets[name].length - errorRows.size), warnings: related.filter((x) => x.severity === 'warning').length, errors: related.filter((x) => x.severity === 'error').length };
  }
  return { sheets, summary, issues, blocking: issues.some((x) => x.severity === 'error') };
}
