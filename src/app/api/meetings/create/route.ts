import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Meeting creation - simplified
    return NextResponse.json({ success: true, data: { message: 'Meeting feature is simplified' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
