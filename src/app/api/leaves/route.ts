import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';

export async function GET(req: NextRequest) {
  try {
    const schoolId = await getTenantSchoolId(req);
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

    const where: any = {};
    if (schoolId) where.teacher = { schoolId };
    if (status) where.status = status;

    const leaves = await db.leaveApplication.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true, email: true, subject: true, phone: true } },
      },
      orderBy: { appliedAt: 'desc' },
      take: limit,
    });

    // Compute stats
    const todayStr = new Date().toISOString().split('T')[0];
    const [totalPending, totalApproved, totalActive] = await Promise.all([
      db.leaveApplication.count({ where: { ...(schoolId ? { teacher: { schoolId } } : {}), status: 'pending' } }),
      db.leaveApplication.count({ where: { ...(schoolId ? { teacher: { schoolId } } : {}), status: 'approved' } }),
      db.leaveApplication.count({ where: { ...(schoolId ? { teacher: { schoolId } } : {}), status: 'approved', startDate: { lte: todayStr }, endDate: { gte: todayStr } } }),
    ]);

    return NextResponse.json({
      success: true,
      leaves,
      stats: { totalPending, totalApproved, totalActive },
    });
  } catch (error) {
    console.error('[LEAVES LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load leaves' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, approvedBy } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id and status required' }, { status: 400 });
    }

    const updated = await db.leaveApplication.update({
      where: { id },
      data: { status, approvedBy: approvedBy || 'Admin' },
    });

    return NextResponse.json({ success: true, leave: updated });
  } catch (error) {
    console.error('[LEAVES PATCH ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to update leave' }, { status: 500 });
  }
}
