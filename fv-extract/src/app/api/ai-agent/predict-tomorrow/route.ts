import { NextRequest, NextResponse } from 'next/server';
import { runPredictionEngine, getPredictionsForDate } from '@/lib/services/prediction-engine';

/**
 * POST /api/ai-agent/predict-tomorrow
 * Run the prediction engine for tomorrow and day-after.
 * Body: { date?: string } — base date (defaults to today)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const baseDate = body.date || new Date().toISOString().split('T')[0];

    const predictions = await runPredictionEngine(baseDate);

    return NextResponse.json({
      success: true,
      data: {
        baseDate,
        predictionsCount: predictions.length,
        predictions,
      },
    });
  } catch (error: any) {
    console.error('Prediction engine error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/ai-agent/predict-tomorrow?date=YYYY-MM-DD
 * Get stored predictions for a specific date.
 */
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
    const predictions = await getPredictionsForDate(date);

    return NextResponse.json({
      success: true,
      data: predictions,
    });
  } catch (error: any) {
    console.error('Get predictions error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
