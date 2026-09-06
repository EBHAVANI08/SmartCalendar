export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCapability } from '@/lib/authz';

/**
 * School profile, for the Settings page.
 *
 * Settings previously saved nothing at all: it waited 600ms and then told the
 * Admin their values "have been updated in the database". This route is the
 * real persistence behind the fields that map onto columns `School` already has.
 *
 * `code` is deliberately not writable - it is the tenant identity the Platform
 * Owner issues, and other records key off it.
 */

export const BOARDS = ['CBSE', 'ICSE', 'IB', 'Cambridge', 'State Board'] as const;

/**
 * Writable school profile.
 *
 * `email` is deliberately absent: it is the Admin's LOGIN IDENTITY, not an
 * ordinary profile field, and must not change as a side effect of pressing Save
 * on a school-details form. Changing it belongs in a dedicated credential
 * workflow with re-authentication, confirmation and session handling.
 *
 * `code` is absent for the same class of reason - it is platform-issued tenant
 * identity that other records key off.
 */
const profileSchema = z.object({
  name: z.string().trim().min(2, 'School name must be at least 2 characters').max(150),
  board: z.enum(BOARDS).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  contactName: z.string().trim().max(120).optional().nullable(),
});

const shape = (school: {
  id: string; name: string; code: string; email: string; board: string | null;
  phone: string | null; address: string | null; contactName: string | null; status: string;
}) => ({
  id: school.id,
  name: school.name,
  code: school.code,
  // Returned so the page can display it, never accepted back on write.
  email: school.email,
  board: school.board ?? '',
  phone: school.phone ?? '',
  address: school.address ?? '',
  contactName: school.contactName ?? '',
  status: school.status,
});

export async function GET(request: Request) {
  const denied = requireCapability(request, 'school.settings.read');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, code: true, email: true, board: true, phone: true, address: true, contactName: true, status: true },
  });
  if (!school) {
    return NextResponse.json({ error: 'School not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true, profile: shape(school) });
}

export async function PUT(request: Request) {
  const denied = requireCapability(request, 'school.settings.write');
  if (denied) return denied;

  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const parsed = profileSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'Invalid school profile.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  try {
    const updated = await db.school.update({
      where: { id: schoolId },
      // Only fields actually supplied are written. A PUT that omits `address`
      // must not silently erase the address that is already stored.
      data: {
        name: input.name,
        ...(input.board !== undefined ? { board: input.board || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.address !== undefined ? { address: input.address || null } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName || null } : {}),
      },
      select: { id: true, name: true, code: true, email: true, board: true, phone: true, address: true, contactName: true, status: true },
    });

    await db.auditLog.create({
      data: {
        schoolId,
        actorId: request.headers.get('x-user-id') || 'unknown',
        actorRole: request.headers.get('x-user-role') || 'unknown',
        action: 'school.profile.update',
        entityType: 'School',
        entityId: schoolId,
        after: updated,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, profile: shape(updated) });
  } catch {
    return NextResponse.json({ error: 'Could not save the school profile.' }, { status: 500 });
  }
}
