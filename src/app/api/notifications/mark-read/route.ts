import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCapability } from '@/lib/authz';

export async function POST(req: NextRequest) {
  const denied = requireCapability(req, 'support.write');
  if (denied) return denied;

  try {
    const { notificationId, teacherId } = await req.json();

    if (notificationId) {
      await db.teacherNotification.update({ where: { id: notificationId }, data: { isRead: true } });
    } else if (teacherId) {
      await db.teacherNotification.updateMany({ where: { teacherId, isRead: false }, data: { isRead: true } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MARK READ ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = requireCapability(req, 'support.write');
  if (denied) return denied;

  try {
    const { teacherId } = await req.json();

    if (teacherId) {
      await db.teacherNotification.updateMany({ where: { teacherId, isRead: false }, data: { isRead: true } });
    } else {
      await db.teacherNotification.updateMany({ where: { isRead: false }, data: { isRead: true } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[MARK ALL READ ERROR]', error);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }
}
