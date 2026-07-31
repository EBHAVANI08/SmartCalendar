export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');

    const whereClause = schoolId ? { schoolId } : {};

    const teachers = await db.teacher.findMany({
      where: whereClause,
      include: {
        schedules: true,
        school: true,
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(teachers);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 });
  }
}
