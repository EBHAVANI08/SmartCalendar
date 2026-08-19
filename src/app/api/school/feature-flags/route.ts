import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/school/feature-flags?schoolId=xxx
// Called by the frontend on login to get the active feature flags for this school.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 });

  let flags = await db.schoolFeatureFlags.findUnique({ where: { schoolId } });
  if (!flags) {
    // Auto-provision default flags for schools that don't have them yet
    flags = await db.schoolFeatureFlags.create({ data: { schoolId } });
  }
  return NextResponse.json({ flags });
}
