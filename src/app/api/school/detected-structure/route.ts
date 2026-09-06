export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { getDayConfig } from '@/lib/timetable-config';
import { periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import { NextResponse } from 'next/server';

/**
 * Academic structure inferred from a school's existing timetable.
 *
 * A school that has been running for a year already has grades, sections and
 * subjects - they were just never written into the configuration tables.
 * Showing School Setup as empty would be a lie, and silently writing what we
 * infer would be worse.
 *
 * So this READS and REPORTS. Every item comes back marked as either already
 * configured or only detected, and the Admin confirms what to adopt.
 *
 * STRICTLY READ-ONLY. Adoption goes through the normal /api/subjects endpoints.
 */
export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const [rows, configs, config] = await Promise.all([
    db.schedule.findMany({
      where: { schoolId },
      select: { grade: true, section: true, subject: true, day: true, period: true },
    }),
    db.gradeSubjectConfig
      .findMany({ where: { schoolId }, select: { grade: true, subjectName: true, active: true } })
      .catch(() => []),
    getDayConfig(schoolId),
  ]);

  // ── Grades and their sections, from what is actually scheduled ────────────
  const sectionsByGrade = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const sections = sectionsByGrade.get(r.grade) ?? new Map<string, number>();
    sections.set(r.section, (sections.get(r.section) ?? 0) + 1);
    sectionsByGrade.set(r.grade, sections);
  }

  const configuredGrades = new Set(configs.map((c) => c.grade));

  const grades = [...sectionsByGrade.entries()]
    .map(([grade, sections]) => ({
      grade,
      configured: configuredGrades.has(grade),
      sections: [...sections.entries()]
        .map(([section, periods]) => ({ section, periods }))
        .sort((a, b) => a.section.localeCompare(b.section)),
      totalPeriods: [...sections.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => {
      const na = Number(a.grade.replace(/\D/g, '')) || 0;
      const nb = Number(b.grade.replace(/\D/g, '')) || 0;
      return na - nb || a.grade.localeCompare(b.grade);
    });

  // ── Subjects scheduled but never configured ──────────────────────────────
  const configuredByGrade = new Map<string, Set<string>>();
  for (const c of configs) {
    if (c.active === false) continue;
    const set = configuredByGrade.get(c.grade) ?? new Set<string>();
    set.add(c.subjectName.toLowerCase());
    configuredByGrade.set(c.grade, set);
  }

  const detected = new Map<string, { grade: string; subject: string; periods: number }>();
  for (const r of rows) {
    if (configuredByGrade.get(r.grade)?.has(r.subject.toLowerCase())) continue;
    const key = `${r.grade}|${r.subject}`;
    const existing = detected.get(key);
    if (existing) existing.periods++;
    else detected.set(key, { grade: r.grade, subject: r.subject, periods: 1 });
  }

  const detectedSubjects = [...detected.values()].sort(
    (a, b) => b.periods - a.periods || a.grade.localeCompare(b.grade)
  );

  // ── Days and periods actually in use, versus what is configured ──────────
  const usageByDay = new Map<string, number>();
  for (const r of rows) {
    usageByDay.set(r.day, Math.max(usageByDay.get(r.day) ?? 0, r.period));
  }
  const workingDays = workingDayNames(config) as string[];
  const days = [...new Set([...workingDays, ...usageByDay.keys()])].map((day) => {
    const configured = workingDays.includes(day) ? periodsForDay(day, config) : 0;
    const highestInUse = usageByDay.get(day) ?? 0;
    return {
      day,
      configured,
      highestInUse,
      isWorkingDay: workingDays.includes(day),
      // Rows that would fall outside the day if it were saved as configured.
      outOfRange: highestInUse > configured ? highestInUse - configured : 0,
    };
  });

  return NextResponse.json({
    success: true,
    readOnly: true,
    hasExistingTimetable: rows.length > 0,
    totalPeriods: rows.length,
    dayConfigExplicit: config.configured,
    grades,
    detectedSubjects,
    days,
    summary: {
      gradesDetected: grades.length,
      gradesConfigured: grades.filter((g) => g.configured).length,
      sectionsDetected: grades.reduce((n, g) => n + g.sections.length, 0),
      subjectsConfigured: configs.filter((c) => c.active !== false).length,
      subjectsDetectedOnly: detectedSubjects.length,
    },
  });
}
