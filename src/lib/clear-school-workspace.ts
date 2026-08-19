import { db } from '@/lib/db';

export async function clearSchoolWorkspace(schoolId: string, options?: { clearUnassigned?: boolean }) {
  const teachers = await db.teacher.findMany({ where: { schoolId }, select: { id: true } });
  const teacherIds = teachers.map((teacher) => teacher.id);
  const versions = await db.timetableVersion.findMany({ where: { schoolId }, select: { id: true } });
  const versionIds = versions.map((version) => version.id);
  const events = await db.calendarEvent.findMany({ where: { schoolId }, select: { id: true } });
  const eventIds = events.map((event) => event.id);
  const rooms = await db.room.findMany({ where: { schoolId }, select: { id: true } });
  const roomIds = rooms.map((room) => room.id);

  const counts = {
    schedules: 0,
    teachers: 0,
    substitutions: 0,
    timetableVersions: 0,
    timetableSlots: 0,
    calendarEvents: 0,
    importBatches: 0,
    validationIssues: 0,
    auditLogs: 0,
  };

  await db.substituteReservation.deleteMany({ where: { schoolId } });
  await db.notificationDelivery.deleteMany({ where: { schoolId } });
  if (eventIds.length) await db.eventAttendee.deleteMany({ where: { eventId: { in: eventIds } } });
  counts.validationIssues = (await db.validationIssue.deleteMany({ where: { schoolId } })).count;
  counts.importBatches = (await db.importBatch.deleteMany({ where: { schoolId } })).count;
  await db.approvalRequest.deleteMany({ where: { schoolId } });

  if (versionIds.length) {
    await db.timetableCandidate.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
    await db.generationJob.deleteMany({ where: { OR: [{ schoolId }, { timetableVersionId: { in: versionIds } }] } });
    counts.timetableSlots = (await db.timetableSlot.deleteMany({ where: { timetableVersionId: { in: versionIds } } })).count;
    await db.subjectRequirement.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
    await db.teacherWorkloadRule.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
    await db.teacherAvailabilitySlot.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
    await db.bellScheduleSlot.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
    await db.schedulingRule.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
  }

  counts.timetableVersions = (await db.timetableVersion.deleteMany({ where: { schoolId } })).count;
  counts.calendarEvents = (await db.calendarEvent.deleteMany({ where: { schoolId } })).count;
  await db.calendarSubscription.deleteMany({ where: { schoolId } });
  await db.classSection.deleteMany({ where: { schoolId } });
  await db.subjectMaster.deleteMany({ where: { schoolId } });
  await db.teacherQualification.deleteMany({ where: { schoolId } });
  if (roomIds.length) await db.roomAvailabilitySlot.deleteMany({ where: { roomId: { in: roomIds } } });
  await db.room.deleteMany({ where: { schoolId } });
  await db.academicTerm.deleteMany({ where: { schoolId } });
  await db.academicYear.deleteMany({ where: { schoolId } });
  await db.campus.deleteMany({ where: { schoolId } });
  counts.schedules = (await db.schedule.deleteMany({ where: { schoolId } })).count;

  if (teacherIds.length) {
    counts.substitutions = (await db.substitution.deleteMany({
      where: { OR: [{ absentTeacherId: { in: teacherIds } }, { substituteId: { in: teacherIds } }] },
    })).count;
    await db.teacherNotification.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await db.biometricAttendance.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await db.leaveApplication.deleteMany({ where: { teacherId: { in: teacherIds } } });
    await db.lessonPlan.deleteMany({ where: { teacherId: { in: teacherIds } } });
    counts.teachers = (await db.teacher.deleteMany({ where: { schoolId } })).count;
  }

  counts.auditLogs = (await db.auditLog.deleteMany({ where: { schoolId } })).count;

  if (options?.clearUnassigned) {
    const orphanTeachers = await db.teacher.findMany({ where: { schoolId: null }, select: { id: true } });
    const orphanTeacherIds = orphanTeachers.map((teacher) => teacher.id);
    if (orphanTeacherIds.length) {
      await db.substitution.deleteMany({
        where: { OR: [{ absentTeacherId: { in: orphanTeacherIds } }, { substituteId: { in: orphanTeacherIds } }] },
      });
      await db.teacherNotification.deleteMany({ where: { teacherId: { in: orphanTeacherIds } } });
      await db.biometricAttendance.deleteMany({ where: { teacherId: { in: orphanTeacherIds } } });
      await db.leaveApplication.deleteMany({ where: { teacherId: { in: orphanTeacherIds } } });
      await db.lessonPlan.deleteMany({ where: { teacherId: { in: orphanTeacherIds } } });
      counts.teachers += (await db.teacher.deleteMany({ where: { schoolId: null } })).count;
    }
    counts.schedules += (await db.schedule.deleteMany({ where: { schoolId: null } })).count;
  }

  return counts;
}
