import { db } from '@/lib/db';

type CandidateSlot = { classSectionId: string; subjectId: string | null; teacherId: string | null; roomId: string | null; dayOfWeek: number; period: number; lessonType: string; locked: boolean };
type TeachingTime = { dayOfWeek: number; period: number };
const key = (...parts: (string | number | null)[]) => parts.join('|');
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();

function eligibleForGrade(value: unknown, grade: string) {
  if (!Array.isArray(value) || value.length === 0) return true;
  const target = normalized(grade).replace(/^grade\s*/, '');
  return value.some((item) => {
    const candidate = normalized(item).replace(/^grade\s*/, '');
    return candidate === target || candidate === 'all' || candidate === '*';
  });
}

function preferenceScore(preference: string, time: TeachingTime, maxPeriod: number) {
  const value = normalized(preference);
  if (value === 'morning' || value === 'early') return maxPeriod - time.period;
  if (value === 'afternoon' || value === 'late') return time.period;
  return 0;
}

/** Deterministic constraint-based greedy search. Hard constraints reject a
 * placement; soft constraints rank the remaining placements. */
export async function generateCandidates(jobId: string) {
  const job = await db.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');
  await db.generationJob.update({ where: { id: jobId }, data: { status: 'running', stage: 'loading_configuration', progress: 10, startedAt: new Date(), error: null } });
  try {
    const [version, requirements, qualifications, availability, workload, rooms, roomAvailability, bell, fixed, classes] = await Promise.all([
      db.timetableVersion.findUnique({ where: { id: job.timetableVersionId } }),
      db.subjectRequirement.findMany({ where: { timetableVersionId: job.timetableVersionId } }),
      db.teacherQualification.findMany({ where: { schoolId: job.schoolId } }),
      db.teacherAvailabilitySlot.findMany({ where: { timetableVersionId: job.timetableVersionId } }),
      db.teacherWorkloadRule.findMany({ where: { timetableVersionId: job.timetableVersionId } }),
      db.room.findMany({ where: { schoolId: job.schoolId, active: true } }),
      db.roomAvailabilitySlot.findMany({ where: { schoolId: job.schoolId } }),
      db.bellScheduleSlot.findMany({ where: { timetableVersionId: job.timetableVersionId, slotType: 'teaching' } }),
      db.timetableSlot.findMany({ where: { timetableVersionId: job.timetableVersionId, locked: true } }),
      db.classSection.findMany({ where: { schoolId: job.schoolId, active: true }, select: { id: true, grade: true, campusId: true, homeRoomId: true } }),
    ]);
    if (!version) throw new Error('Version not found');
    if (!requirements.length) throw new Error('No subject-period requirements are configured for this timetable.');
    await db.generationJob.update({ where: { id: jobId }, data: { stage: 'building_constraints', progress: 30 } });
    const teachingSlots: TeachingTime[] = bell.length
      ? [...new Set(bell.map((item) => key(item.dayOfWeek, item.period)))].map((item) => { const [dayOfWeek, period] = item.split('|').map(Number); return { dayOfWeek, period }; })
      : Array.from({ length: 6 }, (_, day) => Array.from({ length: day === 5 ? 4 : 8 }, (_, period) => ({ dayOfWeek: day + 1, period: period + 1 }))).flat();
    const maxPeriod = Math.max(...teachingSlots.map((item) => item.period));
    const classById = new Map(classes.map((item) => [item.id, item]));
    const workloadByTeacher = new Map(workload.map((item) => [item.teacherId, item]));
    const unavailable = new Set(availability.filter((item) => ['unavailable', 'restricted'].includes(normalized(item.status))).map((item) => key(item.teacherId, item.dayOfWeek, item.period)));
    const preferred = new Set(availability.filter((item) => normalized(item.status) === 'preferred').map((item) => key(item.teacherId, item.dayOfWeek, item.period)));
    const roomUnavailable = new Set(roomAvailability.filter((item) => normalized(item.status) !== 'available').map((item) => key(item.roomId, item.dayOfWeek, item.period)));
    const candidates: { id: string; unallocatedPeriods: number; preferenceScore: number }[] = [];
    await db.timetableCandidate.deleteMany({ where: { generationJobId: job.id } });

    for (let alternative = 0; alternative < job.alternatives; alternative++) {
      const slots: CandidateSlot[] = fixed.map((item) => ({ classSectionId: item.classSectionId, subjectId: item.subjectId, teacherId: item.teacherId, roomId: item.roomId, dayOfWeek: item.dayOfWeek, period: item.period, lessonType: item.lessonType, locked: true }));
      const teacherBusy = new Set(slots.filter((item) => item.teacherId).map((item) => key(item.teacherId, item.dayOfWeek, item.period)));
      const roomBusy = new Set(slots.filter((item) => item.roomId).map((item) => key(item.roomId, item.dayOfWeek, item.period)));
      const classBusy = new Set(slots.map((item) => key(item.classSectionId, item.dayOfWeek, item.period)));
      const teacherLoad = new Map<string, number>();
      const teacherDaily = new Map<string, number>();
      const subjectDaily = new Map<string, number>();
      let unallocated = 0;
      let earnedPreference = 0;
      for (const slot of slots) {
        if (slot.teacherId) {
          teacherLoad.set(slot.teacherId, (teacherLoad.get(slot.teacherId) || 0) + 1);
          teacherDaily.set(key(slot.teacherId, slot.dayOfWeek), (teacherDaily.get(key(slot.teacherId, slot.dayOfWeek)) || 0) + 1);
        }
        if (slot.subjectId) subjectDaily.set(key(slot.classSectionId, slot.subjectId, slot.dayOfWeek), (subjectDaily.get(key(slot.classSectionId, slot.subjectId, slot.dayOfWeek)) || 0) + 1);
      }

      const ordered = [...requirements].sort((a, b) => Number(Boolean(b.requiredRoomType)) - Number(Boolean(a.requiredRoomType)) || b.weeklyPeriods - a.weeklyPeriods);
      for (const requirement of ordered) for (let occurrence = 0; occurrence < requirement.weeklyPeriods; occurrence++) {
        const classInfo = classById.get(requirement.classSectionId);
        const qualified = qualifications.filter((item) => item.subjectId === requirement.subjectId && eligibleForGrade(item.eligibleGrades, classInfo?.grade || '')).sort((a, b) => a.priority - b.priority || Number(b.primary) - Number(a.primary));
        let best: { time: TeachingTime; teacherId: string; roomId: string | null; score: number } | null = null;
        for (const time of teachingSlots) {
          if (classBusy.has(key(requirement.classSectionId, time.dayOfWeek, time.period))) continue;
          const dailySubjectCount = subjectDaily.get(key(requirement.classSectionId, requirement.subjectId, time.dayOfWeek)) || 0;
          if (dailySubjectCount >= requirement.maxPerDay) continue;
          for (const teacher of qualified) {
            const rule = workloadByTeacher.get(teacher.teacherId);
            const weekly = teacherLoad.get(teacher.teacherId) || 0;
            const daily = teacherDaily.get(key(teacher.teacherId, time.dayOfWeek)) || 0;
            if (teacherBusy.has(key(teacher.teacherId, time.dayOfWeek, time.period)) || unavailable.has(key(teacher.teacherId, time.dayOfWeek, time.period))) continue;
            if (weekly >= (rule?.maxWeekly ?? 30) || daily >= (rule?.maxDaily ?? 6)) continue;
            const periods = slots.filter((slot) => slot.teacherId === teacher.teacherId && slot.dayOfWeek === time.dayOfWeek).map((slot) => slot.period).concat(time.period).sort((a, b) => a - b);
            let run = 1; let longest = 1;
            for (let index = 1; index < periods.length; index++) { run = periods[index] === periods[index - 1] + 1 ? run + 1 : 1; longest = Math.max(longest, run); }
            if (longest > (rule?.maxConsecutive ?? 3)) continue;
            const roomPool = requirement.requiredRoomType ? rooms.filter((room) => normalized(room.type) === normalized(requirement.requiredRoomType)) : rooms.filter((room) => !classInfo?.campusId || !room.campusId || room.campusId === classInfo.campusId);
            const room = roomPool.find((item) => !roomBusy.has(key(item.id, time.dayOfWeek, time.period)) && !roomUnavailable.has(key(item.id, time.dayOfWeek, time.period)));
            if (requirement.requiredRoomType && !room) continue;
            const score = (dailySubjectCount === 0 ? 30 : -40) + preferenceScore(requirement.preferredTime, time, maxPeriod) + (preferred.has(key(teacher.teacherId, time.dayOfWeek, time.period)) ? 12 : 0) - daily * 2 - weekly * .2 + ((time.dayOfWeek + alternative) % 6);
            if (!best || score > best.score) best = { time, teacherId: teacher.teacherId, roomId: room?.id || classInfo?.homeRoomId || null, score };
          }
        }
        if (!best) { unallocated++; continue; }
        slots.push({ classSectionId: requirement.classSectionId, subjectId: requirement.subjectId, teacherId: best.teacherId, roomId: best.roomId, dayOfWeek: best.time.dayOfWeek, period: best.time.period, lessonType: requirement.requiredRoomType ? 'practical' : 'teaching', locked: false });
        classBusy.add(key(requirement.classSectionId, best.time.dayOfWeek, best.time.period));
        teacherBusy.add(key(best.teacherId, best.time.dayOfWeek, best.time.period));
        if (best.roomId) roomBusy.add(key(best.roomId, best.time.dayOfWeek, best.time.period));
        teacherLoad.set(best.teacherId, (teacherLoad.get(best.teacherId) || 0) + 1);
        teacherDaily.set(key(best.teacherId, best.time.dayOfWeek), (teacherDaily.get(key(best.teacherId, best.time.dayOfWeek)) || 0) + 1);
        subjectDaily.set(key(requirement.classSectionId, requirement.subjectId, best.time.dayOfWeek), (subjectDaily.get(key(requirement.classSectionId, requirement.subjectId, best.time.dayOfWeek)) || 0) + 1);
        earnedPreference += best.score;
      }
      const teacherGaps = [...teacherLoad.keys()].reduce((total, teacherId) => total + Array.from({ length: 6 }, (_, day) => day + 1).reduce((sum, day) => {
        const periods = slots.filter((slot) => slot.teacherId === teacherId && slot.dayOfWeek === day).map((slot) => slot.period);
        return periods.length < 2 ? sum : sum + Math.max(0, Math.max(...periods) - Math.min(...periods) + 1 - periods.length);
      }, 0), 0);
      const score = Math.max(0, Math.min(100, 100 - unallocated * 5 - teacherGaps * .5 + earnedPreference / Math.max(1, slots.length) * .1));
      candidates.push(await db.timetableCandidate.create({ data: { schoolId: job.schoolId, timetableVersionId: job.timetableVersionId, generationJobId: job.id, name: `Candidate ${String.fromCharCode(65 + alternative)}`, hardConflicts: 0, preferenceScore: score, teacherGaps, unallocatedPeriods: unallocated, recommended: false, result: slots } }));
    }
    const best = [...candidates].sort((a, b) => a.unallocatedPeriods - b.unallocatedPeriods || b.preferenceScore - a.preferenceScore)[0];
    if (!best) throw new Error('The scheduler could not produce a candidate.');
    await db.timetableCandidate.update({ where: { id: best.id }, data: { recommended: true } });
    const impossible = best.unallocatedPeriods > 0 && !job.allowPartial;
    await db.generationJob.update({ where: { id: job.id }, data: { status: impossible ? 'failed' : 'completed', stage: impossible ? 'constraints_unsatisfied' : 'candidates_ready', progress: 100, bestScore: best.preferenceScore, remainingViolations: best.unallocatedPeriods, error: impossible ? `Unable to generate a valid timetable: ${best.unallocatedPeriods} required period(s) could not be placed. Review teacher qualifications, availability, workload, rooms and bell slots.` : null, completedAt: new Date() } });
    return { jobId, candidates, valid: !impossible };
  } catch (error) {
    await db.generationJob.update({ where: { id: job.id }, data: { status: 'failed', stage: 'failed', error: error instanceof Error ? error.message : 'Generation failed', completedAt: new Date() } });
    throw error;
  }
}
