import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { getDayConfig } from '@/lib/timetable-config';
import {
  ClashTracker,
  buildPeriodTimings,
  isPeriodWithinDay,
  periodsForDay,
  workingDayNames,
} from '@/lib/timetable-constraints';
import { operationalScheduleFilter, EDITABLE_STATUSES, isEditable } from '@/lib/timetable-lifecycle';
import { parseAnyExcel, parseAnyPdf, normalizeGrade, isBlank, type ExtractedSchedule } from '@/lib/timetable-sheet-parser';
import { requireCapability } from '@/lib/authz';
import { readList, teacherTeachesSection } from '@/lib/faculty';

export const dynamic = 'force-dynamic';

/**
 * Import a timetable spreadsheet.
 *
 *   mode=validate (default)  parse + validate the WHOLE file, change nothing
 *   mode=commit              re-validate, then write all rows in one transaction
 *
 * Commit refuses outright if any row is an error, so a bad file can never be
 * half-imported. Every row goes through the same rules as manual editing and AI
 * generation: tenant scope, version lock, teacher belongs to the school and is
 * active, configured subject, day/period bounds, teacher clash, class clash.
 */

type Severity = 'error' | 'warning';

interface RowIssue {
  row: number;
  severity: Severity;
  code: string;
  message: string;
  slot: string;
}

interface PreparedRow extends ExtractedSchedule {
  index: number;
  teacherId: string | null;
  startTime: string;
  endTime: string;
  existingId: string | null;
}

const slotLabel = (r: ExtractedSchedule) =>
  `${r.grade} ${r.section} · ${r.day} P${r.period}`;

const normName = (s: string) =>
  s.toLowerCase().replace(/\b(mr|mrs|ms|miss|dr|sir|madam|maam)\b\.?/g, '').replace(/[^a-z0-9]/g, '').trim();

export async function POST(request: Request) {
  const denied = requireCapability(request, 'timetable.import');
  if (denied) return denied;

  try {
    // 1. Tenant. Never inferred from the form, never "first school in the database".
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = String(formData.get('mode') || 'validate').toLowerCase() === 'commit' ? 'commit' : 'validate';
    const defaultGrade = normalizeGrade(String(formData.get('grade') || 'Grade 1'));
    const defaultSection = String(formData.get('section') || 'A').trim().toUpperCase() || 'A';

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }
    const fileName = file.name;
    const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls', '.csv', '.pdf'].includes(fileExt)) {
      return NextResponse.json({ error: `Unsupported format '${fileExt}'. Use .xlsx, .xls, .csv, or .pdf.` }, { status: 400 });
    }

    // 2. Where the import lands.
    //
    // An editable draft always wins - that is the whole point of creating a
    // revision before importing. Only when there is no draft do we look at the
    // operational version, and a published one is refused rather than rewritten.
    const draft = await db.timetableVersion.findFirst({
      where: { schoolId, status: { in: [...EDITABLE_STATUSES] } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, status: true },
    });

    let targetVersionId: string | null = null;
    let targetVersionName: string | null = null;

    if (draft) {
      targetVersionId = draft.id;
      targetVersionName = draft.name;
    } else {
      const scope = await operationalScheduleFilter(schoolId);
      const operationalId: string | null = scope.timetableVersionId ?? null;
      if (operationalId) {
        const version = await db.timetableVersion.findFirst({
          where: { id: operationalId, schoolId },
          select: { id: true, name: true, status: true },
        });
        if (version && !isEditable(version.status)) {
          return NextResponse.json({
            error: `The active timetable "${version.name}" is ${version.status} and cannot be overwritten by an import. Create a revision from Version History, then import into that draft.`,
            code: 'VERSION_LOCKED',
          }, { status: 409 });
        }
        targetVersionId = operationalId;
        targetVersionName = version?.name ?? null;
      }
    }

    // 3. Parse.
    const buffer = Buffer.from(await file.arrayBuffer());
    let parsed: { schedules: ExtractedSchedule[]; detectedFormat: string; columnsSeen: string[]; sheetNames: string[] };

    if (fileExt === '.pdf') {
      parsed = await parseAnyPdf(buffer, defaultGrade, defaultSection);
    } else {
      parsed = parseAnyExcel(buffer, defaultGrade, defaultSection);
    }
    const { schedules, detectedFormat, columnsSeen, sheetNames } = parsed;

    if (schedules.length === 0) {
      return NextResponse.json({
        error: 'No timetable data could be extracted. Please check your file format.',
        debug: { sheetsFound: sheetNames, columnsDetected: columnsSeen, detectedFormat },
      }, { status: 400 });
    }

    // 4. Everything the validation needs, loaded once.
    const [config, teachers, subjectConfigs] = await Promise.all([
      getDayConfig(schoolId),
      db.teacher.findMany({
        where: { schoolId },
        select: { id: true, name: true, role: true, subjects: true, subject: true, grades: true, sections: true },
      }),
      db.gradeSubjectConfig.findMany({ where: { schoolId }, select: { grade: true, subjectName: true, active: true } }).catch(() => []),
    ]);

    const activeDays = new Set(workingDayNames(config) as string[]);
    // Timings are per-day, because each day can have a different period count.
    const timingsByDay = new Map<string, ReturnType<typeof buildPeriodTimings>>();
    const timingsFor = (day: string) => {
      const cached = timingsByDay.get(day);
      if (cached) return cached;
      const built = buildPeriodTimings({
        periods: periodsForDay(day, config),
        startTime: config.startTime,
        endTime: config.endTime,
        breakAfter: config.breakAfter,
        breakMinutes: config.breakMinutes,
        lunchAfter: config.lunchAfter,
        lunchMinutes: config.lunchMinutes,
      });
      timingsByDay.set(day, built);
      return built;
    };

    const byNorm = new Map<string, typeof teachers[number]>();
    for (const t of teachers) byNorm.set(normName(t.name), t);

    const cleanTeacherName = (n: string) =>
      normName(n)
        .replace(/\b(mr|mrs|ms|dr|sir|madam|prof|teacher|faculty|head|coordinator)\b/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .trim();

    const resolveTeacher = (name?: string, subject?: string) => {
      if (!name || isBlank(name)) return { teacher: null as typeof teachers[number] | null, ambiguous: false };
      const key = normName(name);
      const exact = byNorm.get(key);
      if (exact) return { teacher: exact, ambiguous: false };

      const cKey = cleanTeacherName(name);
      if (!cKey) return { teacher: null, ambiguous: false };

      // 1. Partial / Substring / Honorific Match
      const candidates = teachers.filter((t) => {
        const tk = normName(t.name);
        const ctk = cleanTeacherName(t.name);
        if (tk === key || ctk === cKey) return true;
        if (ctk && cKey && (ctk.includes(cKey) || cKey.includes(ctk))) return true;

        // Phonetic / prefix / word overlap matching (e.g. Hemalata vs Hemlata, Sayyad vs Sayyed)
        const tTokens = ctk.split(/\s+/).filter(Boolean);
        const qTokens = cKey.split(/\s+/).filter(Boolean);
        const hasOverlap = qTokens.some((q) =>
          tTokens.some((tok) => tok.startsWith(q.slice(0, 3)) || q.startsWith(tok.slice(0, 3)))
        );
        return hasOverlap;
      });

      if (candidates.length === 1) return { teacher: candidates[0], ambiguous: false };

      // If multiple candidates, filter by subject match if provided
      if (candidates.length > 1 && subject) {
        const subFiltered = candidates.filter((t) => {
          const subs = teacherSubjects(t);
          return subs.includes(subject.toLowerCase());
        });
        if (subFiltered.length === 1) return { teacher: subFiltered[0], ambiguous: false };
      }

      if (candidates.length > 1) return { teacher: candidates[0], ambiguous: false };
      return { teacher: null, ambiguous: false };
    };

    const configuredSubjects = new Map<string, Set<string>>();
    for (const c of subjectConfigs) {
      if (c.active === false) continue;
      const set = configuredSubjects.get(c.grade) ?? new Set<string>();
      set.add(c.subjectName.toLowerCase());
      configuredSubjects.set(c.grade, set);
    }

    const teacherSubjects = (t: typeof teachers[number]) => {
      const raw = t.subjects || t.subject || '';
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x).toLowerCase());
      } catch { /* legacy single value */ }
      return raw ? [String(raw).toLowerCase()] : [];
    };

    // 5. Validate every row. Clash detection runs against existing rows AND
    //    earlier rows of this same file, so a file that clashes with itself fails.
    // Scoped to the version being imported into, so importing a revision does
    // not clash against the published version it was copied from.
    const tracker = new ClashTracker();
    await tracker.loadExisting(schoolId, undefined, targetVersionId);

    const issues: RowIssue[] = [];
    const prepared: PreparedRow[] = [];
    const seenSlots = new Set<string>();

    for (let i = 0; i < schedules.length; i++) {
      const item = schedules[i];
      const rowNo = i + 1;
      const label = slotLabel(item);
      const add = (severity: Severity, code: string, message: string) =>
        issues.push({ row: rowNo, severity, code, message, slot: label });

      if (!item.grade || !item.section || !item.day || !item.subject) {
        add('error', 'MALFORMED_ROW', 'Missing grade, section, day or subject.');
        continue;
      }
      if (!Number.isInteger(item.period) || item.period < 1) {
        add('error', 'MALFORMED_ROW', `Period "${item.period}" is not a valid period number.`);
        continue;
      }

      // Day + period must exist in this school's configuration.
      if (!activeDays.has(item.day)) {
        add('error', 'NON_TEACHING_DAY', `${item.day} is not a working day in Day & Period Setup.`);
        continue;
      }
      if (!isPeriodWithinDay(item.day, item.period, config)) {
        add('error', 'PERIOD_OUT_OF_RANGE',
          `${item.day} has ${periodsForDay(item.day, config)} period(s); period ${item.period} is outside that range.`);
        continue;
      }

      // The same slot twice in one file.
      const slotKey = `${item.grade}|${item.section}|${item.day}|${item.period}`;
      if (seenSlots.has(slotKey)) {
        add('warning', 'DUPLICATE_IN_FILE', 'Duplicate slot in file; later entry replaces earlier entry.');
      }
      seenSlots.add(slotKey);

      // Subject qualification check (warning only)
      const gradeSubjects = configuredSubjects.get(item.grade);
      if (gradeSubjects && gradeSubjects.size > 0 && !gradeSubjects.has(item.subject.toLowerCase())) {
        add('warning', 'SUBJECT_NOT_CONFIGURED',
          `"${item.subject}" is not in standard subject list for ${item.grade}. Recorded as custom subject.`);
      }

      // Teacher: resolve against THIS school's faculty
      let teacherId: string | null = null;
      if (item.teacherName && !isBlank(item.teacherName)) {
        const { teacher, ambiguous } = resolveTeacher(item.teacherName, item.subject);
        if (ambiguous) {
          add('warning', 'TEACHER_AMBIGUOUS', `"${item.teacherName}" matches multiple faculty members. Auto-assigned to ${teacher?.name || 'faculty'}.`);
        }
        if (!teacher) {
          add('warning', 'TEACHER_NOT_FOUND',
            `"${item.teacherName}" was not found in faculty directory. Slot imported as unassigned.`);
        } else if (teacher.role === 'inactive') {
          add('warning', 'TEACHER_INACTIVE', `${teacher.name} is deactivated. Slot imported as unassigned.`);
        } else {
          const subs = teacherSubjects(teacher);
          const grades = readList(teacher.grades);
          const sections = readList(teacher.sections);
          const teachesSub = subs.length === 0 || subs.includes(item.subject.toLowerCase());
          const teachesGrd = grades.length === 0 || grades.some((g) => {
            const clean = g.trim().toLowerCase();
            const target = item.grade.trim().toLowerCase();
            if (clean === target) return true;
            const gNum = clean.replace(/[^0-9]/g, '');
            const tNum = target.replace(/[^0-9]/g, '');
            return gNum && tNum && gNum === tNum;
          });
          const teachesSec = teacherTeachesSection(teacher.sections, item.grade, item.section);

          if (!teachesSub || !teachesGrd || !teachesSec) {
            const mismatches: string[] = [];
            if (!teachesSub) mismatches.push(`subject ${item.subject}`);
            if (!teachesGrd) mismatches.push(`grade ${item.grade}`);
            if (!teachesSec) mismatches.push(`section ${item.section}`);
            add('warning', 'NOT_FACULTY_QUALIFIED',
              `${teacher.name} is not mapped in Faculty Directory for ${mismatches.join(', ')}. Recorded as an override.`);
          }
          if (tracker.isTeacherBusy(teacher.id, item.day, item.period)) {
            add('warning', 'TEACHER_DOUBLE_BOOKED',
              `${teacher.name} has multiple periods at ${item.day} period ${item.period}; recorded as unassigned override.`);
          } else {
            teacherId = teacher.id;
          }
        }
      } else {
        add('warning', 'NO_TEACHER', 'No teacher named for this period; it will import unallocated.');
      }

      // The class must be free - unless we are replacing that exact row.
      const existing = await db.schedule.findFirst({
        where: {
          schoolId, grade: item.grade, section: item.section, day: item.day, period: item.period,
          ...(targetVersionId
            ? { timetableVersionId: targetVersionId }
            : { OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }] }),
        },
        select: { id: true, subject: true },
      });
      if (!existing && tracker.isClassBusy(item.grade, item.section, item.day, item.period)) {
        add('error', 'CLASS_DOUBLE_BOOKED', 'This class already has a lesson in that period.');
        continue;
      }
      if (existing) {
        add('warning', 'REPLACES_EXISTING', `Replaces the current "${existing.subject}" lesson.`);
      }

      const t = timingsFor(item.day).find((x) => x.period === item.period);
      tracker.reserve({ teacherId, grade: item.grade, section: item.section, day: item.day, period: item.period });
      prepared.push({
        ...item,
        index: rowNo,
        teacherId,
        startTime: t?.startTime ?? '08:00',
        endTime: t?.endTime ?? '08:40',
        existingId: existing?.id ?? null,
      });
    }

    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    const summary = {
      fileName,
      detectedFormat,
      rowsParsed: schedules.length,
      rowsValid: prepared.length,
      rowsRejected: errors.length,
      willCreate: prepared.filter((p) => !p.existingId).length,
      willReplace: prepared.filter((p) => p.existingId).length,
      unallocated: prepared.filter((p) => !p.teacherId).length,
      targetVersionId,
      targetVersionName,
    };

    // 6. Preview. Nothing has been written.
    if (mode === 'validate') {
      return NextResponse.json({
        success: true,
        mode: 'validate',
        canImport: errors.length === 0 && prepared.length > 0,
        summary,
        errors: errors.slice(0, 100),
        warnings: warnings.slice(0, 100),
        errorCount: errors.length,
        warningCount: warnings.length,
        preview: prepared.slice(0, 25).map((p) => ({
          slot: slotLabel(p), subject: p.subject,
          teacher: p.teacherId ? teachers.find((t) => t.id === p.teacherId)?.name : null,
          action: p.existingId ? 'replace' : 'create',
        })),
        message: errors.length
          ? `${errors.length} row(s) cannot be imported. Fix them and upload again — nothing has been saved.`
          : `${prepared.length} row(s) ready to import. Nothing has been saved yet.`,
      });
    }

    // 7. Commit. All or nothing.
    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        code: 'VALIDATION_FAILED',
        error: `Import refused: ${errors.length} row(s) are invalid. A timetable is never partially imported.`,
        summary, errors: errors.slice(0, 100), errorCount: errors.length,
      }, { status: 422 });
    }
    if (prepared.length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to import.' }, { status: 400 });
    }

    await db.$transaction([
      ...prepared.filter((p) => p.existingId).map((p) =>
        db.schedule.update({
          where: { id: p.existingId! },
          data: { subject: p.subject, teacherId: p.teacherId, startTime: p.startTime, endTime: p.endTime },
        })
      ),
      ...prepared.filter((p) => !p.existingId).map((p) =>
        db.schedule.create({
          data: {
            schoolId,
            timetableVersionId: targetVersionId,
            grade: p.grade, section: p.section, day: p.day, period: p.period,
            subject: p.subject, startTime: p.startTime, endTime: p.endTime,
            teacherId: p.teacherId, roomId: p.room || null,
          },
        })
      ),
    ]);

    await db.auditLog.create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: 'timetable.bulk_import',
        entityType: 'Schedule',
        entityId: targetVersionId ?? 'unversioned',
        after: summary,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      mode: 'commit',
      summary,
      warnings: warnings.slice(0, 100),
      warningCount: warnings.length,
      message: `Imported ${summary.willCreate} new and replaced ${summary.willReplace} existing period(s) from "${fileName}".`,
    });
  } catch (err) {
    console.error('[BULK-UPLOAD ERROR]', err);
    return NextResponse.json(
      { error: `Failed to process upload: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
