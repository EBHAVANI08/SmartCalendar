import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { requestId } = await request.json();
    if (!requestId) {
      return NextResponse.json({ success: false, error: 'Missing requestId' }, { status: 400 });
    }

    const substitution = await db.substitution.update({
      where: { id: requestId },
      data: { status: 'assigned' },
    });

    return NextResponse.json({
      success: true,
      data: substitution,
    });
  } catch (error: any) {
    console.error('Confirm draft error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
