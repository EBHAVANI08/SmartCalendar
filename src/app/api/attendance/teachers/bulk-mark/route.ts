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
    const date = String(body.date || '').trim();
    const action = body.action ? String(body.action).trim() : null;
    const records: Array<{
      teacherId: string;
      status: string;
      checkInTime?: string;
      checkOutTime?: string;
      reason?: string;
    }> = Array.isArray(body.records) ? body.records : [];

    if (!date) {
      return NextResponse.json({ error: 'Date is required.' }, { status: 400 });
    }

    // 1. Fetch all teachers for this school
    const teachers = await db.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true },
    });
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const teacherIds = teachers.map((t) => t.id);

    // 2. Fetch approved leaves for this date
    const approvedLeaves = await db.leaveApplication.findMany({
      where: {
        teacherId: { in: teacherIds },
        startDate: { lte: date },
        endDate: { gte: date },
        status: 'approved',
      },
      select: { teacherId: true, leaveType: true, reason: true },
    });
    const onLeaveTeacherIds = new Set(approvedLeaves.map((l) => l.teacherId));

    let updatedCount = 0;
    let totalSubsCreated = 0;
    let totalSubsDeleted = 0;

    if (action === 'mark_all_present') {
      // Mark all teachers as present EXCEPT those with approved leaves
      for (const teacher of teachers) {
        if (onLeaveTeacherIds.has(teacher.id)) {
          // Keep as on_leave or ensure on_leave record exists
          await db.biometricAttendance.upsert({
            where: { date_teacherId: { date, teacherId: teacher.id } },
            create: {
              date,
              teacherId: teacher.id,
              status: 'on_leave',
              syncSource: 'manual',
              syncedAt: new Date(),
            },
            update: {
              status: 'on_leave',
              syncSource: 'manual',
              syncedAt: new Date(),
            },
          });
          continue;
        }

        await db.biometricAttendance.upsert({
          where: { date_teacherId: { date, teacherId: teacher.id } },
          create: {
            date,
            teacherId: teacher.id,
            status: 'present',
            checkInTime: '08:00',
            syncSource: 'manual',
            syncedAt: new Date(),
          },
          update: {
            status: 'present',
            checkInTime: '08:00',
            syncSource: 'manual',
            syncedAt: new Date(),
          },
        });
        updatedCount++;

        // Clean up any unassigned pending attendance substitutions if previously absent
        const rem = await removeSubstitutionsForAttendancePresence({
          teacherId: teacher.id,
          date,
        });
        totalSubsDeleted += rem.deletedCount;
      }

      return NextResponse.json({
        success: true,
        message: `Marked ${updatedCount} teachers as Present. (${onLeaveTeacherIds.size} on approved leave preserved).`,
        updatedCount,
        preservedLeaves: onLeaveTeacherIds.size,
        totalSubsDeleted,
      });
    }

    // Custom records bulk submission
    if (records.length === 0) {
      return NextResponse.json({ error: 'No attendance records provided.' }, { status: 400 });
    }

    for (const rec of records) {
      if (!teacherMap.has(rec.teacherId)) continue;
      const status = String(rec.status || 'present').toLowerCase().trim();

      await db.biometricAttendance.upsert({
        where: { date_teacherId: { date, teacherId: rec.teacherId } },
        create: {
          date,
          teacherId: rec.teacherId,
          status,
          checkInTime: status === 'present' ? rec.checkInTime || '08:00' : rec.checkInTime || null,
          checkOutTime: rec.checkOutTime || null,
          syncSource: 'manual',
          syncedAt: new Date(),
        },
        update: {
          status,
          checkInTime: status === 'present' ? rec.checkInTime || '08:00' : rec.checkInTime || null,
          checkOutTime: rec.checkOutTime || null,
          syncSource: 'manual',
          syncedAt: new Date(),
        },
      });
      updatedCount++;

      if (status === 'absent' || status === 'on_leave') {
        const sync = await syncSubstitutionsForAttendanceAbsence({
          teacherId: rec.teacherId,
          date,
          reason: rec.reason || (status === 'on_leave' ? 'On Approved Leave' : 'Marked absent in Attendance'),
          source: 'attendance',
        });
        totalSubsCreated += sync.created;
      } else if (status === 'present') {
        const rem = await removeSubstitutionsForAttendancePresence({
          teacherId: rec.teacherId,
          date,
        });
        totalSubsDeleted += rem.deletedCount;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Bulk updated ${updatedCount} attendance records. ${totalSubsCreated} substitution slots generated.`,
      updatedCount,
      substitutionsCreated: totalSubsCreated,
      substitutionsDeleted: totalSubsDeleted,
    });
  } catch (error: any) {
    console.error('Failed to bulk mark attendance:', error);
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}
