export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import {
  syncSubstitutionsForAttendanceAbsence,
  removeSubstitutionsForAttendancePresence,
} from '@/lib/substitution-service';

export async function POST(request: Request) {
  const denied = requireCapability(request, 'attendance.write');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'School context required.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const teacherId = String(body.teacherId || '').trim();
    const date = String(body.date || '').trim();
    const status = String(body.status || '').toLowerCase().trim();
    const checkInTime = body.checkInTime ? String(body.checkInTime).trim() : null;
    const checkOutTime = body.checkOutTime ? String(body.checkOutTime).trim() : null;
    const reason = body.reason ? String(body.reason).trim() : undefined;

    if (!teacherId || !date || !status) {
      return NextResponse.json(
        { error: 'Missing required parameters: teacherId, date, status.' },
        { status: 400 }
      );
    }

    const validStatuses = ['present', 'absent', 'on_leave', 'late', 'half-day'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: "${status}". Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify teacher belongs to this school
    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, schoolId },
      select: { id: true, name: true },
    });
    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 });
    }

    // 1. Upsert attendance record
    const attendanceRecord = await db.biometricAttendance.upsert({
      where: { date_teacherId: { date, teacherId } },
      create: {
        date,
        teacherId,
        status,
        checkInTime: status === 'present' ? checkInTime || '08:00' : checkInTime,
        checkOutTime,
        syncSource: 'manual',
        syncedAt: new Date(),
      },
      update: {
        status,
        checkInTime: status === 'present' ? checkInTime || '08:00' : checkInTime,
        checkOutTime,
        syncSource: 'manual',
        syncedAt: new Date(),
      },
    });

    let substitutionsCreated = 0;
    let substitutionsDeleted = 0;

    // 2. Synchronize with substitutions system
    if (status === 'absent' || status === 'on_leave') {
      const syncResult = await syncSubstitutionsForAttendanceAbsence({
        teacherId,
        date,
        reason: reason || (status === 'on_leave' ? 'On Approved Leave' : 'Marked absent in Attendance'),
        source: 'attendance',
      });
      substitutionsCreated = syncResult.created;
    } else if (status === 'present') {
      const removeResult = await removeSubstitutionsForAttendancePresence({
        teacherId,
        date,
      });
      substitutionsDeleted = removeResult.deletedCount;
    }

    return NextResponse.json({
      success: true,
      teacher: { id: teacher.id, name: teacher.name },
      date,
      status,
      attendance: attendanceRecord,
      substitutionsCreated,
      substitutionsDeleted,
      message:
        status === 'absent' && substitutionsCreated > 0
          ? `Attendance marked as Absent. ${substitutionsCreated} substitution slots generated.`
          : `Attendance marked as ${status}.`,
    });
  } catch (error: any) {
    console.error('Failed to mark teacher attendance:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
