import { db } from '@/lib/db';
import { getTenantSchoolId, resolveSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
  // Pinned to the caller's school. schoolId used to be resolved from client
  // input, so any signed-in user could act on another school's data.
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({
        school: null,
        campuses: [],
        academicYears: [],
        terms: [],
        versions: [],
        active: null,
      });
    }

    const [school, campuses, years, terms, versions] = await Promise.all([
      db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, code: true } }).catch(() => null),
      db.campus.findMany({ where: { schoolId, active: true }, orderBy: { name: 'asc' } }).catch(() => []),
      db.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } }).catch(() => []),
      db.academicTerm.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } }).catch(() => []),
      db.timetableVersion.findMany({ where: { schoolId }, orderBy: [{ academicYearId: 'desc' }, { version: 'desc' }] }).catch(() => []),
    ]);

    const active = versions.find((item) => item.status === 'published') || versions.find((item) => item.status === 'draft') || versions[0] || null;
    return NextResponse.json({ school, campuses, academicYears: years, terms, versions, active });
  } catch (error) {
    console.error('Error fetching timetable context:', error);
    return NextResponse.json({
      school: null,
      campuses: [],
      academicYears: [],
      terms: [],
      versions: [],
      active: null,
    });
  }
}
