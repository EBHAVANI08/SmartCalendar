import { db } from '@/lib/db';

type CandidateSlot = { classSectionId: string; subjectId: string | null; teacherId: string | null; roomId: string | null; dayOfWeek: number; period: number; lessonType: string; locked: boolean };

export async function generateCandidates(jobId: string) {
  const job = await db.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');
  await db.generationJob.update({ where: { id: jobId }, data: { status: 'running', stage: 'loading_configuration', progress: 10, startedAt: new Date() } });
  const [version, requirements, qualifications, availability, workload, rooms, bell, fixed] = await Promise.all([
    db.timetableVersion.findUnique({ where: { id: job.timetableVersionId } }),
    db.subjectRequirement.findMany({ where: { timetableVersionId: job.timetableVersionId } }),
    db.teacherQualification.findMany({ where: { schoolId: job.schoolId } }),
    db.teacherAvailabilitySlot.findMany({ where: { timetableVersionId: job.timetableVersionId } }),
    db.teacherWorkloadRule.findMany({ where: { timetableVersionId: job.timetableVersionId } }),
    db.room.findMany({ where: { schoolId: job.schoolId, active: true } }),
    db.bellScheduleSlot.findMany({ where: { timetableVersionId: job.timetableVersionId, slotType: 'teaching' } }),
    db.timetableSlot.findMany({ where: { timetableVersionId: job.timetableVersionId, locked: true } }),
  ]);
  if (!version) throw new Error('Version not found');
  await db.generationJob.update({ where: { id: jobId }, data: { stage: 'building_constraints', progress: 30 } });
  const teachingSlots = bell.length ? [...new Set(bell.map((item) => `${item.dayOfWeek}|${item.period}`))].map((key) => { const [dayOfWeek, period] = key.split('|').map(Number); return { dayOfWeek, period }; }) : Array.from({ length: 5 }, (_, day) => Array.from({ length: 8 }, (_, period) => ({ dayOfWeek: day + 1, period: period + 1 }))).flat();
  const maxByTeacher = new Map(workload.map((item) => [item.teacherId, item.maxWeekly]));
  const unavailable = new Set(availability.filter((item) => item.status.toLowerCase() === 'unavailable').map((item) => `${item.teacherId}|${item.dayOfWeek}|${item.period}`));
  const candidates: { id: string; unallocatedPeriods: number; preferenceScore: number }[] = [];
  for (let alternative = 0; alternative < job.alternatives; alternative++) {
    const slots: CandidateSlot[] = fixed.map((item) => ({ classSectionId: item.classSectionId, subjectId: item.subjectId, teacherId: item.teacherId, roomId: item.roomId, dayOfWeek: item.dayOfWeek, period: item.period, lessonType: item.lessonType, locked: true }));
    const teacherBusy = new Set(slots.filter((item) => item.teacherId).map((item) => `${item.teacherId}|${item.dayOfWeek}|${item.period}`));
    const roomBusy = new Set(slots.filter((item) => item.roomId).map((item) => `${item.roomId}|${item.dayOfWeek}|${item.period}`));
    const classBusy = new Set(slots.map((item) => `${item.classSectionId}|${item.dayOfWeek}|${item.period}`));
    const teacherLoad = new Map<string, number>(); let unallocated = 0;
    const ordered = [...requirements].sort((a, b) => b.weeklyPeriods - a.weeklyPeriods || a.subjectId.localeCompare(b.subjectId));
    for (const requirement of ordered) for (let occurrence = 0; occurrence < requirement.weeklyPeriods; occurrence++) {
      let placed = false; const qualified = qualifications.filter((item) => item.subjectId === requirement.subjectId).sort((a, b) => (a.priority - b.priority) || (((teacherLoad.get(a.teacherId) || 0) + alternative) % 3 - ((teacherLoad.get(b.teacherId) || 0) + alternative) % 3));
      const rotated = teachingSlots.slice(alternative).concat(teachingSlots.slice(0, alternative));
      for (const time of rotated) {
        if (classBusy.has(`${requirement.classSectionId}|${time.dayOfWeek}|${time.period}`)) continue;
        const teacher = qualified.find((item) => !teacherBusy.has(`${item.teacherId}|${time.dayOfWeek}|${time.period}`) && !unavailable.has(`${item.teacherId}|${time.dayOfWeek}|${time.period}`) && (teacherLoad.get(item.teacherId) || 0) < (maxByTeacher.get(item.teacherId) || 30));
        if (!teacher) continue;
        const room = requirement.requiredRoomType ? rooms.find((item) => item.type.toLowerCase() === requirement.requiredRoomType!.toLowerCase() && !roomBusy.has(`${item.id}|${time.dayOfWeek}|${time.period}`)) : rooms.find((item) => !roomBusy.has(`${item.id}|${time.dayOfWeek}|${time.period}`));
        if (requirement.requiredRoomType && !room) continue;
        slots.push({ classSectionId: requirement.classSectionId, subjectId: requirement.subjectId, teacherId: teacher.teacherId, roomId: room?.id || null, dayOfWeek: time.dayOfWeek, period: time.period, lessonType: 'teaching', locked: false });
        classBusy.add(`${requirement.classSectionId}|${time.dayOfWeek}|${time.period}`); teacherBusy.add(`${teacher.teacherId}|${time.dayOfWeek}|${time.period}`); if (room) roomBusy.add(`${room.id}|${time.dayOfWeek}|${time.period}`); teacherLoad.set(teacher.teacherId, (teacherLoad.get(teacher.teacherId) || 0) + 1); placed = true; break;
      }
      if (!placed) unallocated++;
    }
    const gaps = [...teacherLoad.values()].reduce((sum, count) => sum + Math.max(0, 10 - count), 0); const score = Math.max(0, 100 - unallocated * 3 - gaps * .1);
    candidates.push(await db.timetableCandidate.create({ data: { schoolId: job.schoolId, timetableVersionId: job.timetableVersionId, generationJobId: job.id, name: `Candidate ${String.fromCharCode(65 + alternative)}`, hardConflicts: 0, preferenceScore: score, teacherGaps: gaps, unallocatedPeriods: unallocated, recommended: alternative === 0, result: slots } }));
  }
  const best = [...candidates].sort((a, b) => a.unallocatedPeriods - b.unallocatedPeriods || b.preferenceScore - a.preferenceScore)[0];
  await db.timetableCandidate.updateMany({ where: { generationJobId: job.id }, data: { recommended: false } });
  await db.timetableCandidate.update({ where: { id: best.id }, data: { recommended: true } });
  await db.generationJob.update({ where: { id: job.id }, data: { status: 'completed', stage: 'candidates_ready', progress: 100, bestScore: best.preferenceScore, remainingViolations: best.unallocatedPeriods, completedAt: new Date() } });
  return { jobId, candidates };
}
