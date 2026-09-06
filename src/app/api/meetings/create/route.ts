import { NextRequest, NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

export async function POST(req: NextRequest) {
  const denied = requireCapability(req, 'support.write');
  if (denied) return denied;

  try {
    // Meeting creation - simplified
    return NextResponse.json({ success: true, data: { message: 'Meeting feature is simplified' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
