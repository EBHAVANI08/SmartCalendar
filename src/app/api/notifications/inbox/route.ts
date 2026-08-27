import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTenantSchoolId } from '@/lib/school-helper';

export const dynamic = 'force-dynamic';

function hrefForType(type: string) {
  const t = (type || '').toLowerCase();
  if (t.includes('sub')) return '/substitutions';
  if (t.includes('leave')) return '/leaves';
  if (t.includes('lesson')) return '/lesson-plans';
  if (t.includes('ticket') || t.includes('message') || t.includes('support')) return '/support';
  if (t.includes('curriculum') || t.includes('timetable') || t.includes('schedule')) return '/timetable';
  return '/dashboard';
}

export async function GET(request: Request) {
  try {
    const schoolId = await getTenantSchoolId(request, false);
    const role = request.headers.get('x-user-role') || '';
    const userId = request.headers.get('x-user-id') || '';
    const today = new Date().toISOString().slice(0, 10);
    const items: {
      id: string;
      source: string;
      type: string;
      title: string;
      body: string | null;
      href: string;
      isRead: boolean;
      createdAt: string;
    }[] = [];

    if (schoolId) {
      const teacherWhere = { schoolId };
      const subWhere = { absentTeacher: { schoolId } };
      const [pendingSubs, onLeave, pendingLeaves, messages, tickets] = await Promise.all([
        db.substitution.count({ where: { ...subWhere, status: 'pending' } }),
        db.leaveApplication.count({
          where: { teacher: teacherWhere, status: 'approved', startDate: { lte: today }, endDate: { gte: today } },
        }),
        db.leaveApplication.count({ where: { teacher: teacherWhere, status: 'pending' } }),
        db.tenantMessage.findMany({
          where: { schoolId, direction: 'outbound' },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }).catch(() => []),
        db.supportTicket.findMany({
          where: { schoolId, status: { in: ['open', 'pending'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }).catch(() => []),
      ]);

      if (pendingSubs > 0) {
        items.push({
          id: `ops:subs:${today}`,
          source: 'ops',
          type: 'substitution',
          title: `${pendingSubs} substitution period${pendingSubs === 1 ? '' : 's'} need assignment`,
          body: 'Open Substitutions to assign cover teachers.',
          href: '/substitutions',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
      if (onLeave > 0) {
        items.push({
          id: `ops:leave-today:${today}`,
          source: 'ops',
          type: 'leave',
          title: `${onLeave} teacher${onLeave === 1 ? '' : 's'} on leave today`,
          body: 'Check coverage in Leave Management.',
          href: '/leaves',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
      if (pendingLeaves > 0) {
        items.push({
          id: `ops:leave-pending:${today}`,
          source: 'ops',
          type: 'leave',
          title: `${pendingLeaves} leave request${pendingLeaves === 1 ? '' : 's'} awaiting review`,
          body: 'Approve or reject from AI Leave Management.',
          href: '/leaves',
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }
      for (const m of messages) {
        items.push({
          id: `msg:${m.id}`,
          source: 'message',
          type: m.channel || 'message',
          title: m.subject,
          body: m.body,
          href: '/support',
          isRead: Boolean(m.readAt),
          createdAt: m.createdAt.toISOString(),
        });
      }
      for (const t of tickets) {
        items.push({
          id: `tkt:${t.id}`,
          source: 'ticket',
          type: 'ticket',
          title: t.subject,
          body: `${t.category} · ${t.status}`,
          href: '/support',
          isRead: t.status === 'resolved' || t.status === 'closed',
          createdAt: t.createdAt.toISOString(),
        });
      }
    }

    try {
      const teacherWhere = role === 'teacher' && userId
        ? { teacherId: userId }
        : schoolId
          ? { teacher: { schoolId } }
          : null;
      if (teacherWhere) {
        const notes = await db.teacherNotification.findMany({
          where: teacherWhere,
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: { id: true, title: true, description: true, isRead: true, createdAt: true, type: true },
        });
        for (const n of notes) {
          items.push({
            id: `tn:${n.id}`,
            source: 'teacher',
            type: n.type || 'notice',
            title: n.title,
            body: n.description,
            href: hrefForType(n.type || ''),
            isRead: n.isRead,
            createdAt: n.createdAt.toISOString(),
          });
        }
      }
    } catch {}

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const unreadCount = items.filter((i) => !i.isRead).length;
    return NextResponse.json({ success: true, items: items.slice(0, 40), unreadCount });
  } catch (error) {
    console.error('[inbox]', error);
    return NextResponse.json({ success: false, items: [], unreadCount: 0 }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const userId = request.headers.get('x-user-id') || '';
    const schoolId = await getTenantSchoolId(request, false);

    if (body.markAllRead) {
      if (userId) {
        await db.teacherNotification.updateMany({ where: { teacherId: userId, isRead: false }, data: { isRead: true } }).catch(() => null);
      }
      if (schoolId) {
        await db.tenantMessage.updateMany({ where: { schoolId, readAt: null }, data: { readAt: new Date() } }).catch(() => null);
        await db.teacherNotification.updateMany({ where: { teacher: { schoolId }, isRead: false }, data: { isRead: true } }).catch(() => null);
      }
      return NextResponse.json({ success: true });
    }

    const id = String(body.id || '');
    if (id.startsWith('tn:')) {
      await db.teacherNotification.update({ where: { id: id.slice(3) }, data: { isRead: true } }).catch(() => null);
    } else if (id.startsWith('msg:')) {
      await db.tenantMessage.update({ where: { id: id.slice(4) }, data: { readAt: new Date() } }).catch(() => null);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[inbox patch]', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
