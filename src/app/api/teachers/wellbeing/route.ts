import { NextRequest, NextResponse } from 'next/server';
import { computeAllWellbeingMetrics, computeFairnessReport } from '@/lib/services/wellbeing-engine';

/**
 * GET /api/teachers/wellbeing
 * Returns wellbeing metrics for all teachers + fairness report.
 */
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') || undefined;
    const [wellbeing, fairness] = await Promise.all([
      computeAllWellbeingMetrics(date),
      computeFairnessReport(),
    ]);

    return NextResponse.json({
      success: true,
      data: { wellbeing, fairness },
    });
  } catch (error: any) {
    console.error('Wellbeing fetch error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
