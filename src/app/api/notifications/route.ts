import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/notifications?teacherId=xxx - Get notifications for a teacher
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId');
    const type = searchParams.get('type'); // "curriculum" or "lesson_plan"

    if (!teacherId) {
      return NextResponse.json({ error: 'teacherId is required' }, { status: 400 });
    }

    const where: Record<string, unknown> = { teacherId };
    if (type) where.type = type;

    const notifications = await db.teacherNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { teacher: { select: { id: true, name: true, subject: true } } },
    });

    return NextResponse.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

// POST /api/notifications - Send notification(s) to teacher(s)
export async function POST(request: Request) {
  try {
    const { type, referenceId, teacherIds, sentBy, title, description } = await request.json();

    if (!type || !referenceId || !teacherIds || !Array.isArray(teacherIds) || teacherIds.length === 0) {
      return NextResponse.json({ error: 'type, referenceId, and teacherIds[] are required' }, { status: 400 });
    }

    // Check for already-sent notifications to avoid duplicates
    const existing = await db.teacherNotification.findMany({
      where: {
        type,
        referenceId,
        teacherId: { in: teacherIds },
      },
    });
    const existingTeacherIds = new Set(existing.map((n) => n.teacherId));
    const newTeacherIds = teacherIds.filter((id: string) => !existingTeacherIds.has(id));

    if (newTeacherIds.length === 0) {
      return NextResponse.json({
        message: 'All selected teachers have already received this item',
        count: 0,
        skipped: teacherIds.length,
      });
    }

    // Create notifications for each teacher
    const notifications = await Promise.all(
      newTeacherIds.map((teacherId: string) =>
        db.teacherNotification.create({
          data: {
            type,
            referenceId,
            teacherId,
            sentBy: sentBy || 'manual',
            title: title || `${type} shared with you`,
            description: description || null,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      count: notifications.length,
      skipped: existingTeacherIds.size,
      message: `Sent to ${notifications.length} teacher(s)${existingTeacherIds.size > 0 ? ` (${existingTeacherIds.size} already had it)` : ''}`,
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 });
  }
}

// PATCH /api/notifications - Mark notification as read
export async function PATCH(request: Request) {
  try {
    const { notificationId, teacherId, markAllRead } = await request.json();

    if (markAllRead && teacherId) {
      await db.teacherNotification.updateMany({
        where: { teacherId, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
    }

    const notification = await db.teacherNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true, notification });
  } catch (error) {
    console.error('Error updating notification:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
