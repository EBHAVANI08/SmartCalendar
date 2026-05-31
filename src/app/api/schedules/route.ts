import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const grade = searchParams.get('grade');
    const section = searchParams.get('section');
    const day = searchParams.get('day');

    const where: Record<string, string> = {};
    if (grade) where.grade = grade;
    if (section) where.section = section;
    if (day) where.day = day;

    const schedules = await db.schedule.findMany({
      where,
      include: { teacher: true },
      orderBy: [{ day: 'asc' }, { period: 'asc' }],
    });

    return NextResponse.json(schedules);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}
