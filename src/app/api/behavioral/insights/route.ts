import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      data: [
        {
          id: 'insight-1',
          insightType: 'ENGAGEMENT',
          description: 'Class dynamics are positive. Students engage well in interactive exercises.',
          severity: 'LOW',
          strategies: ['Use pair activities', 'Encourage group discussion'],
          dataPoints: { studentCount: 30 },
        },
      ],
    });
  } catch (error) {
    console.error('[BEHAVIORAL_INSIGHTS_GET_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      data: {
        totalInsights: 1,
        insights: [
          {
            insightType: 'ENGAGEMENT',
            description: 'Class dynamics generated.',
            severity: 'LOW',
            strategies: ['Maintain structured activities'],
          },
        ],
      },
    });
  } catch (error) {
    console.error('[BEHAVIORAL_INSIGHTS_POST_ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
