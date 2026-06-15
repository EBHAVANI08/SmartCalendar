import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '100');
    const date = req.nextUrl.searchParams.get('date');

    const where: any = {};
    if (date) where.date = date;

    const substitutions = await db.substitutionRequest.findMany({
      where,
      include: {
        schedule: { include: { subject: true, grade: true, section: true, timeSlot: true } },
        originalTeacher: { select: { id: true, name: true, department: true, designation: true } },
        subject: true,
        assignments: {
          include: {
            substituteTeacher: { select: { id: true, name: true, department: true, designation: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Ensure aiRecommendation and assignedBy/reason are always returned
    const enriched = substitutions.map(sub => ({
      ...sub,
      aiRecommendation: sub.aiRecommendation,
      reason: sub.reason,
      assignments: sub.assignments.map(a => ({
        ...a,
        assignedBy: a.assignedBy,
      })),
    }));

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    console.error('[SUBSTITUTIONS LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 });
  }
}
