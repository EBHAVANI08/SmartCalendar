import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { schoolId, reason, clearTeachers = false } = body;

    const where: { schoolId?: string } = {};
    if (schoolId && schoolId !== 'all') {
      where.schoolId = schoolId;
    }

    // Delete schedule entries for the target school
    const deletedSchedules = await db.schedule.deleteMany({ where });

    // Delete pending/assigned substitutions for target school
    if (schoolId && schoolId !== 'all') {
      const schoolTeachers = await db.teacher.findMany({ where: { schoolId }, select: { id: true } });
      const teacherIds = schoolTeachers.map((t) => t.id);
      if (teacherIds.length > 0) {
        await db.substitution.deleteMany({
          where: { OR: [{ absentTeacherId: { in: teacherIds } }, { substituteId: { in: teacherIds } }] },
        });
      }
    } else {
      await db.substitution.deleteMany({});
    }

    // Deactivate/reset active TimetableVersions and TimetableSlots
    if (schoolId && schoolId !== 'all') {
      const versions = await db.timetableVersion.findMany({ where: { schoolId }, select: { id: true } });
      const versionIds = versions.map((v) => v.id);
      if (versionIds.length > 0) {
        await db.timetableSlot.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
      }
      await db.timetableVersion.updateMany({
        where: { schoolId },
        data: { status: 'deactivated' },
      });
    } else {
      await db.timetableSlot.deleteMany({});
      await db.timetableVersion.updateMany({ data: { status: 'deactivated' } });
    }

    let deletedTeachersCount = 0;
    if (clearTeachers) {
      const deletedTeachers = schoolId && schoolId !== 'all'
        ? await db.teacher.deleteMany({ where: { schoolId } })
        : await db.teacher.deleteMany({});
      deletedTeachersCount = deletedTeachers.count;
    }

    // Add AuditLog record
    if (schoolId && schoolId !== 'all') {
      await db.auditLog.create({
        data: {
          schoolId,
          actorId: 'admin',
          actorRole: 'school',
          action: 'DEACTIVATE_TIMETABLE',
          entityType: 'Timetable',
          entityId: schoolId,
          reason: reason || 'School timetable deactivated and data reset by user request',
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Timetable data successfully deactivated and reset. ${deletedSchedules.count} period schedules removed.${clearTeachers ? ` ${deletedTeachersCount} teachers removed.` : ''}`,
      count: deletedSchedules.count,
      teachersRemoved: deletedTeachersCount,
    });
  } catch (error) {
    console.error('Error resetting timetable:', error);
    return NextResponse.json({ error: `Failed to reset timetable: ${String(error)}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  return POST(request);
}

