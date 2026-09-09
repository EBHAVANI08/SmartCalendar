import { NextRequest, NextResponse } from 'next/server';
import { computeAllWellbeingMetrics, computeFairnessReport } from '@/lib/services/wellbeing-engine';
import { getTenantSchoolId } from '@/lib/school-helper';

/**
 * GET /api/teachers/wellbeing
 * Returns wellbeing metrics for all teachers + fairness report.
 */
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') || undefined;
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'No school in session' }, { status: 401 });
    }
    const [wellbeing, fairness] = await Promise.all([
      computeAllWellbeingMetrics(date, schoolId),
      computeFairnessReport(schoolId),
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
