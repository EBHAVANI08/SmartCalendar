export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const [
    school,
    dayConfig,
    dayRows,
    classSections,
    subjectConfigs,
    teachers,
    rooms,
    scheduleCount,
    publishedVersion,
  ] = await Promise.all([
    db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true, email: true, board: true, phone: true, address: true, contactName: true },
    }),
    db.schoolDayPeriodConfig.findUnique({ where: { schoolId } }).catch(() => null),
    db.schoolDayRow.findMany({ where: { schoolId } }).catch(() => []),
    db.classSection.findMany({ where: { schoolId }, select: { grade: true, section: true } }).catch(() => []),
    db.gradeSubjectConfig.findMany({
      where: { schoolId },
      select: { grade: true, subjectName: true, weeklyPeriods: true, active: true },
    }).catch(() => []),
    db.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true, role: true, subjects: true, subject: true, grades: true },
    }).catch(() => []),
    db.room.findMany({ where: { schoolId }, select: { id: true, name: true, type: true, capacity: true, active: true } }).catch(() => []),
    db.schedule.count({ where: { schoolId } }),
    db.timetableVersion.findFirst({ where: { schoolId, status: 'published' }, select: { id: true, versionNumber: true } }).catch(() => null),
  ]);

  if (!school) {
    return NextResponse.json({ error: 'School not found.' }, { status: 404 });
  }

  // Active faculty
  const activeTeachers = teachers.filter((t) => t.role !== 'inactive');

  const parseTeacherSubjects = (t: (typeof teachers)[number]) => {
    const raw = t.subjects || t.subject || '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).toLowerCase().trim());
    } catch {}
    return raw ? [String(raw).toLowerCase().trim()] : [];
  };

  const facultySubjects = new Set(activeTeachers.flatMap(parseTeacherSubjects));

  // Distinct grades from classSection & subjectConfig
  const gradesSet = new Set<string>();
  classSections.forEach((c) => gradesSet.add(c.grade));
  subjectConfigs.forEach((s) => gradesSet.add(s.grade));
  const distinctGrades = Array.from(gradesSet);

  // Active subjects
  const activeSubjects = subjectConfigs.filter((s) => s.active !== false && (s.weeklyPeriods ?? 0) > 0);
  const unmappedSubjects = activeSubjects.filter((s) => !facultySubjects.has(s.subjectName.toLowerCase().trim()));

  // Active rooms
  const activeRooms = rooms.filter((r) => r.active !== false);

  // Issues & Recommendations
  const issues: { type: 'error' | 'warning' | 'info'; title: string; message: string; actionTab: string; actionSub?: string }[] = [];

  // Profile checks
  if (!school.board || !school.phone || !school.address) {
    issues.push({
      type: 'warning',
      title: 'Incomplete Institutional Profile',
      message: 'Board affiliation, contact phone, or address is missing.',
      actionTab: 'profile',
    });
  }

  // Days & periods checks
  if (!dayConfig) {
    issues.push({
      type: 'error',
      title: 'Day & Period Schedule Not Configured',
      message: 'Working days and school hours must be configured to generate timetables.',
      actionTab: 'timetable',
      actionSub: 'days',
    });
  }

  // Academic structure checks
  if (distinctGrades.length === 0 || classSections.length === 0) {
    issues.push({
      type: 'error',
      title: 'No Grades or Sections Registered',
      message: 'Add grades and class sections in Academic Structure.',
      actionTab: 'timetable',
      actionSub: 'structure',
    });
  }

  // Subject checks
  if (activeSubjects.length === 0) {
    issues.push({
      type: 'warning',
      title: 'No Active Subject Rules',
      message: 'Configure weekly period requirements for each grade.',
      actionTab: 'timetable',
      actionSub: 'subjects',
    });
  } else if (unmappedSubjects.length > 0) {
    issues.push({
      type: 'warning',
      title: `${unmappedSubjects.length} Subject(s) Missing Assigned Faculty`,
      message: `Subjects like "${unmappedSubjects.slice(0, 3).map((s) => s.subjectName).join(', ')}" have no qualified teachers in Faculty Directory.`,
      actionTab: 'timetable',
      actionSub: 'subjects',
    });
  }

  // Faculty checks
  if (activeTeachers.length === 0) {
    issues.push({
      type: 'error',
      title: 'No Active Faculty Members',
      message: 'Add teachers and assign their subjects in the Faculty Directory.',
      actionTab: 'timetable',
      actionSub: 'subjects',
    });
  }

  // Score calculation
  let score = 0;
  if (school.name && school.board && school.phone && school.address) score += 20;
  else if (school.name) score += 10;

  if (dayConfig) score += 20;
  if (distinctGrades.length > 0 && classSections.length > 0) score += 20;
  if (activeSubjects.length > 0) score += 15;
  if (activeTeachers.length > 0 && unmappedSubjects.length === 0) score += 15;
  else if (activeTeachers.length > 0) score += 10;
  if (activeRooms.length > 0) score += 5;
  if (scheduleCount > 0) score += 5;

  score = Math.min(100, score);

  return NextResponse.json({
    success: true,
    score,
    stats: {
      gradesCount: distinctGrades.length,
      sectionsCount: classSections.length,
      subjectsCount: activeSubjects.length,
      facultyCount: activeTeachers.length,
      roomsCount: activeRooms.length,
      workingDays: dayConfig?.workingDays ?? (dayRows.length > 0 ? dayRows.length : 0),
      totalWeeklyPeriods: dayConfig ? (dayRows.reduce((a, b) => a + (b.periods || 0), 0) || (dayConfig.workingDays * 8)) : 0,
      unmappedSubjectsCount: unmappedSubjects.length,
      hasTimetable: scheduleCount > 0,
      hasPublishedTimetable: Boolean(publishedVersion),
    },
    issues,
    tenantSecurity: {
      tenantId: school.id,
      tenantCode: school.code,
      dataIsolation: 'STRICT_TENANT_SCOPED',
      sessionAuth: 'HMAC_SHA256_JWT',
      biometricWebhook: 'ACTIVE_LISTENER',
    },
  });
}
