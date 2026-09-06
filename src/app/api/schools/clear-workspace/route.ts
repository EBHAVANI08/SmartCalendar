import { db } from '@/lib/db';
import { clearSchoolWorkspace } from '@/lib/clear-school-workspace';
import { resolveSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

/**
 * Permanently deletes a school's timetable, faculty and calendar data.
 *
 * This is a Platform Owner provisioning action. It previously took `schoolId`
 * straight from the request body with no session and no role check, so any
 * signed-in user could destroy any other school's entire workspace.
 */
export async function POST(request: Request) {
  try {
    if (request.headers.get('x-user-role') !== 'superadmin') {
      return NextResponse.json(
        { error: 'Clearing a school workspace is restricted to the platform owner.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const schoolId = await resolveSchoolId(body.schoolId);

    if (body.confirm !== true) {
      return NextResponse.json(
        { error: 'This permanently deletes all timetable, teacher, and calendar data for the school. Send confirm: true to proceed.' },
        { status: 400 },
      );
    }

    if (!schoolId) {
      return NextResponse.json({ error: 'School workspace not found.' }, { status: 404 });
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, code: true, email: true },
    });

    if (!school) {
      return NextResponse.json({ error: `School workspace not found for id ${schoolId}.` }, { status: 404 });
    }

    const cleared = await clearSchoolWorkspace(schoolId, {
      clearUnassigned: body.clearUnassigned === true,
    });

    return NextResponse.json({
      success: true,
      message: `Cleared all workspace data for ${school.name}. Login account kept; you can upload fresh data now.`,
      school,
      cleared,
    });
  } catch (error) {
    console.error('Error clearing school workspace:', error);
    return NextResponse.json({ error: `Failed to clear school workspace: ${String(error)}` }, { status: 500 });
  }
}
