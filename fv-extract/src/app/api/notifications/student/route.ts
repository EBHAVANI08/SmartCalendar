import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({ success: true, data: { notifications: [], total: 0, unreadCount: 0 } });
}
