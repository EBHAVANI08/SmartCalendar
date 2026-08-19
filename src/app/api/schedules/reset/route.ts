import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { schoolId, reason } = body;

    const where: { schoolId?: string } = {};
    if (schoolId && schoolId !== 'all') {
      where.schoolId = schoolId;
    }

    // Delete schedule entries for the target school
    const deletedSchedules = await db.schedule.deleteMany({ where });

    // Also deactivate/reset active TimetableVersions if any exist
    if (schoolId && schoolId !== 'all') {
      await db.timetableVersion.updateMany({
        where: { schoolId, status: 'published' },
        data: { status: 'deactivated' },
      });
      
      // Delete timetable slots for draft/published versions
      const versions = await db.timetableVersion.findMany({ where: { schoolId }, select: { id: true } });
      const versionIds = versions.map((v) => v.id);
      if (versionIds.length > 0) {
        await db.timetableSlot.deleteMany({ where: { timetableVersionId: { in: versionIds } } });
      }

      // Add AuditLog record
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
      message: `Timetable data successfully deactivated and reset. ${deletedSchedules.count} period schedules removed.`,
      count: deletedSchedules.count,
    });
  } catch (error) {
    console.error('Error resetting timetable:', error);
    return NextResponse.json({ error: `Failed to reset timetable: ${String(error)}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  return POST(request);
}
