import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

/**
 * POST /api/schools/update-credentials
 * Set a school's login email / password / name during provisioning.
 * Body: { schoolId | code, email?, password?, name? }
 *
 * Platform Owner only. This previously took `schoolId` or `code` from the body
 * with no session and no role check, so any signed-in user could change any
 * other school's login email and password - a complete tenant takeover. It also
 * wrote the password in plain text; it is now hashed like every other login path.
 *
 * The former GET handler was removed: it returned a hardcoded school id and
 * disclosed a default teacher password.
 */
export async function POST(request: Request) {
  try {
    if (request.headers.get('x-user-role') !== 'superadmin') {
      return NextResponse.json(
        { error: 'Updating school credentials is restricted to the platform owner.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { schoolId, code, email, password, name } = body as {
      schoolId?: string;
      code?: string;
      email?: string;
      password?: string;
      name?: string;
    };

    if (!schoolId && !code) {
      return NextResponse.json({ error: 'schoolId or code is required' }, { status: 400 });
    }
    if (!email && !password && !name) {
      return NextResponse.json({ error: 'Provide email, password, and/or name to update' }, { status: 400 });
    }
    if (password && password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const targetId = schoolId ? await resolveSchoolId(schoolId) : null;
    const school = targetId
      ? await db.school.findUnique({ where: { id: targetId } })
      : code
      ? await db.school.findUnique({ where: { code } })
      : null;

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const updated = await db.school.update({
      where: { id: school.id },
      data: {
        ...(email ? { email } : {}),
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
        ...(name ? { name } : {}),
      },
      select: { id: true, name: true, code: true, email: true },
    });

    await db.auditLog.create({
      data: {
        schoolId: school.id,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: 'superadmin',
        action: 'school.credentials.update',
        entityType: 'School',
        entityId: school.id,
        after: { ...updated, passwordUpdated: Boolean(password) },
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: 'School credentials updated',
      school: updated,
      passwordUpdated: Boolean(password),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Update failed';
    if (message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'Email already in use by another school' }, { status: 409 });
    }
    console.error('[update-credentials]', error);
    return NextResponse.json({ error: 'Failed to update credentials' }, { status: 500 });
  }
}
