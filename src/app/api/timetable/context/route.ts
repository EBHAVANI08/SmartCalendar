import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const schoolId = new URL(request.url).searchParams.get('schoolId');
  if (!schoolId) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });
  const [school, campuses, years, terms, versions] = await Promise.all([
    db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, code: true } }),
    db.campus.findMany({ where: { schoolId, active: true }, orderBy: { name: 'asc' } }),
    db.academicYear.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } }),
    db.academicTerm.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } }),
    db.timetableVersion.findMany({ where: { schoolId }, orderBy: [{ academicYearId: 'desc' }, { version: 'desc' }] }),
  ]);
  const active = versions.find((item) => item.status === 'published') || versions.find((item) => item.status === 'draft') || versions[0] || null;
  return NextResponse.json({ school, campuses, academicYears: years, terms, versions, active });
}
