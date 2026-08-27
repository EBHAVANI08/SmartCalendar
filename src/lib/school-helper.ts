import { db } from '@/lib/db';
import { NextRequest } from 'next/server';

export function isObjectId(id?: string | null): boolean {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id.trim());
}

export async function resolveSchoolId(input?: string | null, fallbackToFirst = true): Promise<string | null> {
  try {
    if (!input || typeof input !== 'string') {
      if (!fallbackToFirst) return null;
      const first = await db.school.findFirst({ select: { id: true } });
      return first?.id || null;
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
    if (!fallbackToFirst) return null;
    const first = await db.school.findFirst({ select: { id: true } });
    return first?.id || null;
  } catch (error) {
    console.error('Error in resolveSchoolId:', error);
    if (!fallbackToFirst) return null;
    try {
      const first = await db.school.findFirst({ select: { id: true } });
      return first?.id || null;
    } catch {
      return null;
    }
  }
}

export async function getTenantSchoolId(request: Request | NextRequest, fallbackToFirst = true): Promise<string | null> {
  try {
    const url = new URL(request.url);
    const paramId = url.searchParams.get('schoolId') || url.searchParams.get('tenantId');
    if (paramId) {
      return await resolveSchoolId(paramId, fallbackToFirst);
    }
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
  } catch {}
  if (!fallbackToFirst) return null;
  try {
    const first = await db.school.findFirst({ select: { id: true } });
    return first?.id || null;
  } catch {
    return null;
  }
}
