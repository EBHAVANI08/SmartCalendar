export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { getDayConfig } from '@/lib/timetable-config';
import { periodsForDay, workingDayNames } from '@/lib/timetable-constraints';
import { ensureAcademicYear } from '@/lib/timetable-lifecycle';
import { readList } from '@/lib/faculty';
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

  const [rows, configs, config, classSections] = await Promise.all([
    db.schedule.findMany({
      where: { schoolId },
      select: { grade: true, section: true, subject: true, day: true, period: true },
    }),
    db.gradeSubjectConfig
      .findMany({ where: { schoolId }, select: { grade: true, subjectName: true, active: true } })
      .catch(() => []),
    getDayConfig(schoolId),
    db.classSection
      .findMany({ where: { schoolId, active: true } })
      .catch(() => []),
  ]);

  // ── Grades and their sections, from configured class sections + actual schedule rows ──
  const sectionsByGrade = new Map<string, Map<string, number>>();

  // 1. Add from ClassSection table
  for (const cs of classSections) {
    const secName = cs.section.trim().toUpperCase();
    const sections = sectionsByGrade.get(cs.grade) ?? new Map<string, number>();
    if (!sections.has(secName)) {
      sections.set(secName, 0);
    }
    sectionsByGrade.set(cs.grade, sections);
  }

  // 2. Add and count from schedule rows
  for (const r of rows) {
    const secName = r.section.trim().toUpperCase();
    const sections = sectionsByGrade.get(r.grade) ?? new Map<string, number>();
    sections.set(secName, (sections.get(secName) ?? 0) + 1);
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

/**
 * Add a new section (or grade with section) to the school's academic structure.
 */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'school.settings.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    let grade = (body.grade || '').trim();
    let section = (body.section || '').trim().toUpperCase();

    if (!grade) {
      return NextResponse.json({ error: 'Grade name is required.' }, { status: 400 });
    }

    // Default to 'A' if section not provided
    if (!section) {
      section = 'A';
    }

    // Strip any "Section " prefix
    section = section.replace(/^SECTION\s*/i, '').trim().toUpperCase();

    if (!section) {
      return NextResponse.json({ error: 'Section name cannot be empty.' }, { status: 400 });
    }

    const academicYearId = await ensureAcademicYear(schoolId);
    const code = `${grade.replace(/\s+/g, '')}-${section}`;

    // Check if section already exists
    const existing = await db.classSection.findFirst({
      where: { schoolId, grade, section },
    });

    if (existing) {
      if (!existing.active) {
        await db.classSection.update({
          where: { id: existing.id },
          data: { active: true },
        });
      }
    } else {
      await db.classSection.create({
        data: {
          schoolId,
          academicYearId,
          code,
          grade,
          section,
          active: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Section ${section} added to ${grade} successfully.`,
      grade,
      section,
    });
  } catch (error) {
    console.error('Error adding section:', error);
    return NextResponse.json({ error: 'Failed to add section: ' + String(error) }, { status: 500 });
  }
}

/**
 * Rename a grade across all related collections (ClassSection, Schedule, GradeSubjectConfig, Substitution, Teacher.grades).
 */
export async function PATCH(request: Request) {
  const denied = requireCapability(request, 'school.settings.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const oldGrade = (body.oldGrade || '').trim();
    const newGrade = (body.newGrade || '').trim();

    if (!oldGrade || !newGrade) {
      return NextResponse.json({ error: 'Both oldGrade and newGrade are required.' }, { status: 400 });
    }

    if (oldGrade === newGrade) {
      return NextResponse.json({ success: true, message: 'Grade name unchanged.' });
    }

    // Check if newGrade already exists in classSection or schedule under this school
    if (oldGrade.toLowerCase() !== newGrade.toLowerCase()) {
      const existingGrade = await db.classSection.findFirst({
        where: { schoolId, grade: newGrade },
      });
      const existingSchedule = await db.schedule.findFirst({
        where: { schoolId, grade: newGrade },
      });
      if (existingGrade || existingSchedule) {
        return NextResponse.json(
          { error: `Grade "${newGrade}" already exists. Please choose a different name.` },
          { status: 409 }
        );
      }
    }

    // 1. Update ClassSection rows
    const sections = await db.classSection.findMany({
      where: { schoolId, grade: oldGrade },
    });
    for (const s of sections) {
      const newCode = `${newGrade.replace(/\s+/g, '')}-${s.section}`;
      await db.classSection.update({
        where: { id: s.id },
        data: { grade: newGrade, code: newCode },
      });
    }

    // 2. Update Schedule rows
    const scheduleUpdate = await db.schedule.updateMany({
      where: { schoolId, grade: oldGrade },
      data: { grade: newGrade },
    });

    // 3. Update GradeSubjectConfig rows
    const subjectConfigUpdate = await db.gradeSubjectConfig.updateMany({
      where: { schoolId, grade: oldGrade },
      data: { grade: newGrade },
    });

    // 4. Update Substitution rows
    const substitutionUpdate = await db.substitution.updateMany({
      where: { schoolId, grade: oldGrade },
      data: { grade: newGrade },
    });

    // 5. Update Teacher grades JSON
    const teachers = await db.teacher.findMany({
      where: { schoolId },
      select: { id: true, grades: true },
    });
    let teacherUpdatedCount = 0;
    for (const t of teachers) {
      const gList = readList(t.grades);
      if (gList.includes(oldGrade)) {
        const updatedList = Array.from(new Set(gList.map((g) => (g === oldGrade ? newGrade : g))));
        await db.teacher.update({
          where: { id: t.id },
          data: { grades: JSON.stringify(updatedList) },
        });
        teacherUpdatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Grade renamed from "${oldGrade}" to "${newGrade}" successfully.`,
      oldGrade,
      newGrade,
      updatedSections: sections.length,
      updatedSchedules: scheduleUpdate.count,
      updatedSubjectConfigs: subjectConfigUpdate.count,
      updatedSubstitutions: substitutionUpdate.count,
      updatedTeachers: teacherUpdatedCount,
    });
  } catch (error) {
    console.error('Error renaming grade:', error);
    return NextResponse.json({ error: 'Failed to rename grade: ' + String(error) }, { status: 500 });
  }
}

/**
 * Delete an entire grade (with all its sections & schedules) or a single section.
 */
export async function DELETE(request: Request) {
  const denied = requireCapability(request, 'school.settings.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    let grade = searchParams.get('grade') || '';
    let section = searchParams.get('section') || '';
    let deleteEntireGrade =
      searchParams.get('deleteEntireGrade') === 'true' || searchParams.get('entireGrade') === 'true';

    if (!grade) {
      const body = await request.json().catch(() => ({}));
      grade = grade || (body.grade || '');
      section = section || (body.section || '');
      if (body.deleteEntireGrade || body.entireGrade) {
        deleteEntireGrade = true;
      }
    }

    grade = grade.trim();
    if (!grade) {
      return NextResponse.json({ error: 'Grade name is required to delete.' }, { status: 400 });
    }

    // If deleting the entire grade
    if (deleteEntireGrade || section === '*' || !section) {
      // 1. Delete ClassSection records
      const csDeleted = await db.classSection.deleteMany({
        where: { schoolId, grade },
      });

      // 2. Delete Schedule records
      const schedulesDeleted = await db.schedule.deleteMany({
        where: { schoolId, grade },
      });

      // 3. Delete GradeSubjectConfig records
      const configsDeleted = await db.gradeSubjectConfig.deleteMany({
        where: { schoolId, grade },
      });

      // 4. Delete Substitution records
      const substitutionsDeleted = await db.substitution.deleteMany({
        where: { schoolId, grade },
      });

      // 5. Remove grade from Teacher.grades
      const teachers = await db.teacher.findMany({
        where: { schoolId },
        select: { id: true, grades: true },
      });
      for (const t of teachers) {
        const gList = readList(t.grades);
        if (gList.includes(grade)) {
          const updatedList = gList.filter((g) => g !== grade);
          await db.teacher.update({
            where: { id: t.id },
            data: { grades: JSON.stringify(updatedList) },
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: `Grade "${grade}" and all associated sections and schedules were deleted successfully.`,
        grade,
        deletedSections: csDeleted.count,
        deletedSchedules: schedulesDeleted.count,
        deletedConfigs: configsDeleted.count,
        deletedSubstitutions: substitutionsDeleted.count,
      });
    }

    // Otherwise, single section deletion
    section = section.replace(/^SECTION\s*/i, '').trim().toUpperCase();
    if (!section) {
      return NextResponse.json({ error: 'Section name is required to delete single section.' }, { status: 400 });
    }

    // 1. Delete matching classSection records
    const csDeleted = await db.classSection.deleteMany({
      where: { schoolId, grade, section },
    });

    // 2. Delete schedule rows for this class
    const schedulesDeleted = await db.schedule.deleteMany({
      where: { schoolId, grade, section },
    });

    return NextResponse.json({
      success: true,
      message: `Section ${section} removed from ${grade}.`,
      grade,
      section,
      deletedSchedules: schedulesDeleted.count,
      deletedSections: csDeleted.count,
    });
  } catch (error) {
    console.error('Error deleting section/grade:', error);
    return NextResponse.json({ error: 'Failed to delete: ' + String(error) }, { status: 500 });
  }
}

