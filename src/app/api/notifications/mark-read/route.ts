import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { notificationId, targetRole, teacherId } = await req.json();

    if (notificationId) {
      await db.notification.update({ where: { id: notificationId }, data: { isRead: true } });
    } else if (targetRole) {
      await db.notification.updateMany({ where: { targetRole, isRead: false }, data: { isRead: true } });
    } else if (teacherId) {
      await db.notification.updateMany({ where: { teacherId, isRead: false }, data: { isRead: true } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MARK READ ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { targetRole, teacherId } = await req.json();

    if (targetRole) {
      await db.notification.updateMany({ where: { targetRole, isRead: false }, data: { isRead: true } });
    } else if (teacherId) {
      await db.notification.updateMany({ where: { teacherId, isRead: false }, data: { isRead: true } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MARK ALL READ ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
