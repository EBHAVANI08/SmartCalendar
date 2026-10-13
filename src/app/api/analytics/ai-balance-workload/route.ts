import { NextResponse } from 'next/server';
import { requireCapability } from '@/lib/authz';

/**
 * Switched off. The old handler loaded and reassigned the lessons of every
 * school (no school filter), wrote with a read permission, and used fixed
 * limits (5 periods a day, Monday–Friday) instead of the school's own. Nothing
 * in the app called it. Teacher workload limits plus timetable generation
 * replace it; the previous code is in git history (877c01b).
 */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'analytics.read');
  if (denied) return denied;
  return NextResponse.json(
    { error: 'Automatic workload balancing is no longer available. Set teacher workload limits and regenerate the timetable.', code: 'GONE' },
    { status: 410 },
  );
}
