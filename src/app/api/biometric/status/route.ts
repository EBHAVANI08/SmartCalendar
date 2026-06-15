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
            department: true,
            designation: true,
            employeeId: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
      },
      orderBy: { teacher: { name: 'asc' } },
    });

    const mapped = records.map(r => ({
      id: r.id,
      teacherId: r.teacherId,
      teacherName: r.teacher.name,
      employeeId: r.teacher.employeeId,
      department: r.teacher.department,
      designation: r.teacher.designation,
      date: r.date,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      source: r.source,
      confidence: r.confidence,
    }));

    const summary = {
      total: records.length,
      present: records.filter(r => r.status === 'PRESENT').length,
      absent: records.filter(r => r.status === 'ABSENT').length,
      late: records.filter(r => r.status === 'LATE').length,
      halfDay: records.filter(r => r.status === 'HALF_DAY').length,
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
