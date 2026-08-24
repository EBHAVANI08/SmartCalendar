import { db } from '@/lib/db';

export function isObjectId(id?: string | null): boolean {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id.trim());
}

export async function resolveSchoolId(input?: string | null): Promise<string | null> {
  if (!input || typeof input !== 'string') {
    const first = await db.school.findFirst({ select: { id: true } });
    return first?.id || null;
  }
  const clean = input.trim();
  if (isObjectId(clean)) {
    return clean;
  }
  // Lookup by code or email
  const school = await db.school.findFirst({
    where: {
      OR: [
        { code: clean.toUpperCase() },
        { email: clean.toLowerCase() },
      ],
    },
    select: { id: true },
  });
  if (school) {
    return school.id;
  }
  // Fallback to the first available school
  const first = await db.school.findFirst({ select: { id: true } });
  return first?.id || null;
}
