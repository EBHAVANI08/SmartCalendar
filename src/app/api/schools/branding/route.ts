import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';

/**
 * GET /api/schools/branding
 * Returns dynamic school branding, logo, colors, and metadata for multi-tenant white-labeling.
 * Query: ?subdomain=dps or ?schoolCode=DPS2025 or ?schoolId=...
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subdomain = searchParams.get('subdomain') || request.headers.get('x-tenant-subdomain');
    const schoolCode = searchParams.get('schoolCode') || request.headers.get('x-school-code');
    const rawSchoolId = searchParams.get('schoolId') || request.headers.get('x-school-id');

    let school: any = null;

    if (rawSchoolId) {
      const resolved = await resolveSchoolId(rawSchoolId);
      if (resolved) school = await db.school.findUnique({ where: { id: resolved } });
    }

    if (!school && schoolCode) {
      school = await db.school.findFirst({
        where: { code: { equals: schoolCode.toUpperCase() } },
      });
    }

    if (!school && subdomain) {
      school = await db.school.findFirst({
        where: {
          OR: [
            { code: { equals: subdomain.toUpperCase() } },
            { name: { contains: subdomain, mode: 'insensitive' } },
            { email: { contains: subdomain.toLowerCase() } },
          ],
        },
      });
    }

    if (!school) {
      school = await db.school.findFirst();
    }

    if (!school) {
      return NextResponse.json({
        success: false,
        error: 'No school tenant found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: school.id,
        name: school.name,
        code: school.code,
        email: school.email,
        logo: school.logo || null,
        theme: {
          primaryColor: '#0f766e', // Teal
          accentColor: '#10b981', // Emerald
          fontFamily: 'Inter, sans-serif',
        },
        academicYear: '2025–2026',
        affiliation: 'CBSE / NEP 2020 Compliant',
      },
    });
  } catch (error: any) {
    console.error('[BRANDING_GET_ERROR]', error);
    return NextResponse.json({ error: 'Failed to load school branding' }, { status: 500 });
  }
}
