import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { detectAndCreateSubstitutionRequests } from '@/lib/services/ai-agent';

export async function POST(req: NextRequest) {
  try {
    const { date } = await req.json();
    if (!date) return NextResponse.json({ success: false, error: 'Date required' }, { status: 400 });

    const results = await detectAndCreateSubstitutionRequests(date);

    return NextResponse.json({
      success: true,
      data: {
        date,
        substitutionsDetected: results.length,
        results,
      },
    });
  } catch (error) {
    console.error('[AI DETECT ERROR]', error);
    const message = error instanceof Error ? error.message : 'AI detection failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
