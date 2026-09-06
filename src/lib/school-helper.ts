import { db } from '@/lib/db';
import { NextRequest } from 'next/server';

export function isObjectId(id?: string | null): boolean {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id.trim());
}

/**
 * Resolve a school identifier (id, code, email or name) to a school id.
 *
 * `fallbackToFirst` defaults to false: an unidentified caller must get null
 * rather than silently being handed the first school in the database, which
 * leaked one tenant's data to another.
 */
export async function resolveSchoolId(input?: string | null, fallbackToFirst = false): Promise<string | null> {
  const firstSchoolId = async () => {
    if (!fallbackToFirst) return null;
    try {
      const first = await db.school.findFirst({ select: { id: true } });
      return first?.id || null;
    } catch {
      return null;
    }
  };

  try {
    if (!input || typeof input !== 'string') {
      return await firstSchoolId();
    }
    const clean = input.trim();
    if (isObjectId(clean)) {
      const existing = await db.school.findUnique({
        where: { id: clean },
        select: { id: true },
      });
      if (existing) {
        return existing.id;
      }
    }
    // Lookup by code or email
    const school = await db.school.findFirst({
      where: {
        OR: [
          { code: clean.toUpperCase() },
          { email: clean.toLowerCase() },
          { name: { contains: clean, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (school) {
      return school.id;
    }
    return await firstSchoolId();
  } catch (error) {
    console.error('Error in resolveSchoolId:', error);
    return await firstSchoolId();
  }
}

/**
 * Resolve the tenant for a request.
 *
 * Priority is the verified session first. Middleware strips inbound identity
 * headers and re-sets `x-school-id` / `x-school-code` only from a valid token,
 * so those headers are trustworthy; `?schoolId=` is client-controlled and is
 * therefore honoured only for platform owners, who have no tenant of their own
 * and legitimately need to act across schools.
 */
export async function getTenantSchoolId(
  request: Request | NextRequest,
  fallbackToFirst = false
): Promise<string | null> {
  try {
    const headerId = request.headers.get('x-school-id') || request.headers.get('x-tenant-id');
    if (headerId) {
      const fromId = await resolveSchoolId(headerId, false);
      if (fromId) return fromId;
    }

    const headerCode = request.headers.get('x-school-code');
    if (headerCode) {
      const fromCode = await resolveSchoolId(headerCode, false);
      if (fromCode) return fromCode;
    }

    if (request.headers.get('x-user-role') === 'superadmin') {
      const url = new URL(request.url);
      const paramId = url.searchParams.get('schoolId') || url.searchParams.get('tenantId');
      if (paramId) {
        return await resolveSchoolId(paramId, false);
      }
    }
  } catch {}

  if (!fallbackToFirst) return null;
  try {
    const first = await db.school.findFirst({ select: { id: true } });
    return first?.id || null;
  } catch {
    return null;
  }
}
