import { renameListColumn } from '@/lib/autofix/rename';
import { inUse, isLive } from '@/lib/autofix/snapshot-ops';
import type { Change, SubjectConfigRow, Snapshot } from '@/lib/autofix/types';

/**
 * Change lists for moving everything from one grade or subject name to
 * another. Used by the duplicate and display-name rules. Never touches
 * published/superseded timetables: the snapshot only holds editable ones.
 */

const SETTINGS: (keyof SubjectConfigRow)[] = ['weeklyPeriods', 'maxPeriodsPerDay', 'priority', 'allowConsecutive', 'active'];

function pick(row: SubjectConfigRow, fields: (keyof SubjectConfigRow)[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function archive(model: 'gradeSubjectConfig' | 'subjectMaster' | 'classSection', row: { id: string; active: boolean; archivedAt: string | null }, now: string): Change {
  return { model, id: row.id, before: { active: row.active, archivedAt: row.archivedAt }, after: { active: false, archivedAt: now } };
}

/**
 * Two config rows for the same grade and subject: the row in use wins. When
 * the duplicate is the one in use, its settings move onto the canonical row
 * (which keeps its id and name) and the duplicate is archived.
 */
function mergeConfigPair(duplicate: SubjectConfigRow, canonical: SubjectConfigRow, now: string): Change[] {
  if (inUse(duplicate) && !inUse(canonical)) {
    return [
      { model: 'gradeSubjectConfig', id: canonical.id, before: pick(canonical, SETTINGS), after: pick(duplicate, SETTINGS) },
      archive('gradeSubjectConfig', duplicate, now),
    ];
  }
  return [archive('gradeSubjectConfig', duplicate, now)];
}

export interface MovePlan {
  changes: Change[];
  /** Things left as they are, for the report. */
  notes: string[];
}

export function planGradeMove(s: Snapshot, from: string, to: string, now: string): MovePlan {
  const changes: Change[] = [];
  const notes: string[] = [];

  for (const config of s.subjectConfigs.filter((c) => isLive(c) && c.grade === from)) {
    const twin = s.subjectConfigs.find((c) => isLive(c) && c.grade === to && c.subjectName === config.subjectName);
    if (twin) changes.push(...mergeConfigPair(config, twin, now));
    else changes.push({ model: 'gradeSubjectConfig', id: config.id, before: { grade: from }, after: { grade: to } });
  }

  for (const section of s.classSections.filter((c) => isLive(c) && c.grade === from)) {
    const twin = s.classSections.find((c) => isLive(c) && c.grade === to && c.section === section.section && c.academicYearId === section.academicYearId);
    if (twin) {
      changes.push(archive('classSection', section, now));
      continue;
    }
    const code = `${to.replace(/\s+/g, '')}-${section.section}`;
    const codeTaken = s.classSections.some((c) => c.id !== section.id && c.academicYearId === section.academicYearId && c.code === code);
    changes.push({
      model: 'classSection',
      id: section.id,
      before: { grade: from, ...(codeTaken ? {} : { code: section.code }) },
      after: { grade: to, ...(codeTaken ? {} : { code }) },
    });
  }

  for (const teacher of s.teachers) {
    const grades = renameListColumn(teacher.grades, 'grade', from, to);
    const sections = renameListColumn(teacher.sections, 'grade', from, to);
    if (grades === null && sections === null) continue;
    changes.push({
      model: 'teacher',
      id: teacher.id,
      before: { ...(grades !== null ? { grades: teacher.grades } : {}), ...(sections !== null ? { sections: teacher.sections } : {}) },
      after: { ...(grades !== null ? { grades } : {}), ...(sections !== null ? { sections } : {}) },
    });
  }

  const slot = (r: { timetableVersionId: string; section: string; day: string; period: number }) => `${r.timetableVersionId}|${r.section}|${r.day}|${r.period}`;
  const taken = new Set(s.editableSchedules.filter((r) => r.grade === to).map(slot));
  let kept = 0;
  for (const row of s.editableSchedules.filter((r) => r.grade === from)) {
    if (taken.has(slot(row))) { kept++; continue; }
    changes.push({ model: 'schedule', id: row.id, before: { grade: from }, after: { grade: to } });
  }
  if (kept) notes.push(`${kept} draft timetable slot(s) exist under both "${from}" and "${to}" and were left unchanged`);

  if (s.dayConfig?.gradeConfigs) {
    try {
      const overrides = JSON.parse(s.dayConfig.gradeConfigs) as Record<string, unknown>;
      if (from in overrides) {
        const next = { ...overrides };
        if (!(to in next)) next[to] = next[from];
        delete next[from];
        changes.push({ model: 'schoolDayPeriodConfig', id: s.dayConfig.id, before: { gradeConfigs: s.dayConfig.gradeConfigs }, after: { gradeConfigs: JSON.stringify(next) } });
      }
    } catch {
      notes.push('Per-grade day settings could not be read and were left unchanged');
    }
  }
  return { changes, notes };
}

export function planSubjectMove(s: Snapshot, from: string, to: string, now: string): MovePlan {
  const changes: Change[] = [];
  const notes: string[] = [];

  for (const config of s.subjectConfigs.filter((c) => isLive(c) && c.subjectName === from)) {
    const twin = s.subjectConfigs.find((c) => isLive(c) && c.grade === config.grade && c.subjectName === to);
    if (twin) changes.push(...mergeConfigPair(config, twin, now));
    else changes.push({ model: 'gradeSubjectConfig', id: config.id, before: { subjectName: from }, after: { subjectName: to } });
  }

  const fromMaster = s.subjectMasters.find((m) => isLive(m) && m.name === from);
  const toMaster = s.subjectMasters.find((m) => isLive(m) && m.name === to);
  const nameTaken = s.subjectMasters.some((m) => m.name === to);
  if (fromMaster) {
    if (toMaster || nameTaken) {
      changes.push(archive('subjectMaster', fromMaster, now));
      if (toMaster) {
        for (const qualification of s.teacherQualifications.filter((q) => q.subjectId === fromMaster.id)) {
          const twin = s.teacherQualifications.some((q) => q.teacherId === qualification.teacherId && q.subjectId === toMaster.id);
          if (twin) continue; // already qualified for the canonical subject; the old link stays on the archived subject
          changes.push({ model: 'teacherQualification', id: qualification.id, before: { subjectId: fromMaster.id }, after: { subjectId: toMaster.id } });
        }
      }
    } else {
      changes.push({ model: 'subjectMaster', id: fromMaster.id, before: { name: from }, after: { name: to } });
    }
  }

  for (const teacher of s.teachers) {
    const subjects = renameListColumn(teacher.subjects, 'subject', from, to);
    const sections = renameListColumn(teacher.sections, 'subject', from, to);
    const primary = teacher.subject.trim() === from ? to : null;
    if (subjects === null && sections === null && primary === null) continue;
    changes.push({
      model: 'teacher',
      id: teacher.id,
      before: {
        ...(primary !== null ? { subject: teacher.subject } : {}),
        ...(subjects !== null ? { subjects: teacher.subjects } : {}),
        ...(sections !== null ? { sections: teacher.sections } : {}),
      },
      after: {
        ...(primary !== null ? { subject: primary } : {}),
        ...(subjects !== null ? { subjects } : {}),
        ...(sections !== null ? { sections } : {}),
      },
    });
  }

  for (const row of s.editableSchedules.filter((r) => r.subject === from)) {
    changes.push({ model: 'schedule', id: row.id, before: { subject: from }, after: { subject: to } });
  }
  return { changes, notes };
}
