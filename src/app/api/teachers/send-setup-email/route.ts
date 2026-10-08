export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { requireCapability } from '@/lib/authz';
import { sendTeacherPasswordSetupEmail } from '@/lib/mailer';
import { readList } from '@/lib/faculty';
import { SCHOOL_PUBLIC_SELECT } from '@/lib/safe-fields';

export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }

    const body = await request.json();
    const { teacherId } = body;

    if (!teacherId) {
      return NextResponse.json({ error: 'teacherId is required.' }, { status: 400 });
    }

    const teacher = await db.teacher.findFirst({
      where: { id: teacherId, schoolId },
      include: { school: { select: SCHOOL_PUBLIC_SELECT } },
    });

    if (!teacher) {
      return NextResponse.json({ error: 'Faculty member not found in this school.' }, { status: 404 });
    }

    const origin = new URL(request.url).origin;
    const result = await sendTeacherPasswordSetupEmail({
      teacherId: teacher.id,
      teacherName: teacher.name,
      teacherEmail: teacher.email,
      schoolName: teacher.school?.name || 'School',
      subjects: readList(teacher.subjects || teacher.subject),
      requestOrigin: origin,
    });

    // When no email actually went out (no SMTP configured, or delivery failed)
    // the Admin gets the single-use link to share privately instead.
    const emailSent = Boolean(result.success && !result.simulated);
    return NextResponse.json({
      success: Boolean(result.setupUrl),
      emailSent,
      message: emailSent
        ? `Password setup email sent to ${teacher.email}.`
        : `No email was sent to ${teacher.email}. Share the setup link with the teacher privately.`,
      simulated: result.simulated,
      setupUrl: result.setupUrl,
    });
  } catch (error: any) {
    console.error('Error sending setup email:', error);
    return NextResponse.json(
      { error: 'Failed to send setup email: ' + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}
