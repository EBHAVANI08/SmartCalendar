import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';

export async function GET(req: NextRequest) {
  try {
    const schoolId = await getTenantSchoolId(req);
    const where = schoolId ? { schoolId } : {};

    const [rooms, totalRooms] = await Promise.all([
      db.room.findMany({
        where: { ...where, active: true },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      db.room.count({ where }),
    ]);

    const typeBreakdown = rooms.reduce((acc: Record<string, number>, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      rooms,
      stats: { totalRooms, typeBreakdown },
    });
  } catch (error) {
    console.error('[ROOMS LIST ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to load rooms' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const schoolId = await getTenantSchoolId(req);
    const body = await req.json();
    const { code, name, type, capacity } = body;

    if (!code || !name || !type) {
      return NextResponse.json({ success: false, error: 'code, name, and type are required' }, { status: 400 });
    }

    const room = await db.room.create({
      data: {
        schoolId: schoolId || 'default',
        code,
        name,
        type,
        capacity: capacity || 30,
        active: true,
      },
    });

    return NextResponse.json({ success: true, room }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'A room with this code already exists.' }, { status: 409 });
    }
    console.error('[ROOMS CREATE ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed to create room' }, { status: 500 });
  }
}
