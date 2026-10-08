import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';

// Simulate biometric device sync — pulls attendance data from "biometric system"
// Also simulates teachers who applied for leave through the school portal
// In production, this would connect to actual biometric API/device and leave management system
export async function POST(request: Request) {
  const denied = requireCapability(request, 'attendance.write');
  if (denied) return denied;

  try {
    const { date, forceResync } = await request.json();
    const syncDate = date || new Date().toISOString().split('T')[0];
    const schoolId = await getTenantSchoolId(request);

    // Get all teachers for this tenant school
    const teachers = await db.teacher.findMany({
      where: schoolId ? { schoolId } : undefined
    });

    // Check teachers against real approved leaves and attendance records
    const biometricResults: any[] = [];

    for (const teacher of teachers) {
      // Check if already synced for this date
      const existing = await db.biometricAttendance.findUnique({
        where: { date_teacherId: { date: syncDate, teacherId: teacher.id } },
      });

      if (existing && !forceResync) {
        biometricResults.push(existing);
        continue;
      }

      // Check if teacher has an approved leave for this date
      const approvedLeave = await db.leaveApplication.findFirst({
        where: {
          teacherId: teacher.id,
          startDate: { lte: syncDate },
          endDate: { gte: syncDate },
          status: 'approved',
        },
      });

      let status: string = 'present';
      let checkInTime: string | null = '08:00';
      let checkOutTime: string | null = '16:00';
      let deviceId: string | null = 'BIO-001';

      if (approvedLeave) {
        // Teacher has approved leave — mark as on_leave / absent
        status = 'absent';
        checkInTime = null;
        checkOutTime = null;
        deviceId = null;
      } else if (existing) {
        // Retain existing marked status (e.g. if marked late or absent manually)
        status = existing.status;
        checkInTime = existing.checkInTime || '08:00';
        checkOutTime = existing.checkOutTime;
        deviceId = existing.deviceId || 'BIO-001';
      }

      const record = await db.biometricAttendance.upsert({
        where: { date_teacherId: { date: syncDate, teacherId: teacher.id } },
        update: {
          status,
          checkInTime,
          checkOutTime,
          deviceId,
          syncSource: 'biometric',
          syncedAt: new Date(),
        },
        create: {
          date: syncDate,
          teacherId: teacher.id,
          status,
          checkInTime,
          checkOutTime,
          deviceId,
          syncSource: 'biometric',
        },
      });

      biometricResults.push(record);
    }

    const absentCount = biometricResults.filter(r => r.status === 'absent').length;
    const lateCount = biometricResults.filter(r => r.status === 'late').length;
    const presentCount = biometricResults.filter(r => r.status === 'present').length;
    const halfDayCount = biometricResults.filter(r => r.status === 'half-day').length;

    return NextResponse.json({
      success: true,
      date: syncDate,
      syncedAt: new Date().toISOString(),
      summary: {
        total: biometricResults.length,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        halfDay: halfDayCount,
      },
      records: biometricResults,
    });
  } catch (error) {
    console.error('Error syncing biometric data:', error);
    return NextResponse.json({ error: 'Failed to sync biometric data' }, { status: 500 });
  }
}

// GET: Fetch biometric attendance for a date
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const schoolId = await getTenantSchoolId(request);

    const records = await db.biometricAttendance.findMany({
      where: {
        date,
        ...(schoolId ? { teacher: { schoolId } } : {}),
      },
      include: { teacher: { select: TEACHER_PUBLIC_SELECT } },
      orderBy: { status: 'asc' },
    });

    const summary = {
      total: records.length,
      present: records.filter(r => r.status === 'present').length,
      absent: records.filter(r => r.status === 'absent').length,
      late: records.filter(r => r.status === 'late').length,
      halfDay: records.filter(r => r.status === 'half-day').length,
    };

    return NextResponse.json({ date, summary, records: records || [] });
  } catch (error) {
    console.error('Error fetching biometric data:', error);
    const date = new URL(request.url).searchParams.get('date') || new Date().toISOString().split('T')[0];
    return NextResponse.json({
      date,
      summary: { total: 0, present: 0, absent: 0, late: 0, halfDay: 0 },
      records: [],
    });
  }
}
