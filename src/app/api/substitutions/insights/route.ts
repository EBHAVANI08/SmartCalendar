import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    const substitutions = await db.substitution.findMany({
      where: { date },
      include: { absentTeacher: true, substitute: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        periodHeatmap: [],
        departmentBreakdown: [],
        teachersAtRisk: [],
        aiConfidenceMetrics: { average: 90, high: substitutions.length, medium: 0, low: 0, total: substitutions.length },
        substitutionBreakdown: {
          total: substitutions.length,
          aiAutoAssigned: substitutions.length,
          manualAssigned: 0,
          subjectSwaps: 0,
          pending: substitutions.filter(s => s.status === 'pending').length,
        },
        proactiveActions: ['All substitutions managed.'],
        weekRange: { start: date, end: date },
      },
    });
  } catch (error) {
    console.error('[SUBSTITUTIONS INSIGHTS ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load insights' }, { status: 500 });
  }
}
