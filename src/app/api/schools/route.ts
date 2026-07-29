import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const schools = await db.school.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        _count: {
          select: {
            teachers: true,
            schedules: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(schools);
  } catch (error) {
    console.error('Error fetching schools:', error);
    return NextResponse.json({ error: 'Failed to fetch schools' }, { status: 500 });
  }
}
