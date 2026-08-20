import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const records = await db.biometricAttendance.findMany({
      where: { date },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            subject: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { teacher: { name: 'asc' } },
    });

    const mapped = records.map(r => ({
      id: r.id,
      teacherId: r.teacherId,
      teacherName: r.teacher.name,
      department: r.teacher.subject,
      date: r.date,
      checkIn: r.checkInTime,
      checkOut: r.checkOutTime,
      status: r.status,
      source: r.syncSource,
    }));

    const summary = {
      total: records.length,
      present: records.filter(r => r.status.toLowerCase() === 'present').length,
      absent: records.filter(r => r.status.toLowerCase() === 'absent').length,
      late: records.filter(r => r.status.toLowerCase() === 'late').length,
      halfDay: records.filter(r => r.status.toLowerCase() === 'half-day' || r.status.toLowerCase() === 'half_day').length,
    };

    // Group by department for easy scanning
    const byDepartment: Record<string, typeof mapped> = {};
    for (const r of mapped) {
      const dept = r.department || 'Unassigned';
      if (!byDepartment[dept]) byDepartment[dept] = [];
      byDepartment[dept].push(r);
    }

    return NextResponse.json({
      success: true,
      data: {
        date,
        summary,
        byDepartment,
        records: mapped,
      },
    });
  } catch (error) {
    console.error('[BIOMETRIC_STATUS_ERROR]', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch biometric status' },
      { status: 500 },
    );
  }
}
