import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { getTenantSchoolId } from '@/lib/school-helper';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const userId = request.headers.get('x-user-id');
  const email = request.headers.get('x-user-email') || '';
  const role = request.headers.get('x-user-role') || 'admin';
  const displayName = request.headers.get('x-user-name') || '';
  const schoolId = await getTenantSchoolId(request, false);

  const school = schoolId
    ? await db.school.findUnique({
        where: { id: schoolId },
        select: { id: true, name: true, code: true, email: true, phone: true, contactName: true, status: true },
      })
    : null;

  let person: { name?: string; email?: string; phone?: string; subject?: string; memberRole?: string } | null = null;
  if (role === 'teacher' && userId) {
    const t = await db.teacher.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true, subject: true },
    }).catch(() => null);
    if (t) person = { name: t.name, email: t.email, phone: t.phone ?? undefined, subject: t.subject };
  }
  if (!person && email) {
    const teacherByEmail = await db.teacher.findFirst({
      where: { email: email.toLowerCase() },
      select: { name: true, email: true, phone: true, subject: true },
    }).catch(() => null);
    if (teacherByEmail) {
      person = {
        name: teacherByEmail.name,
        email: teacherByEmail.email,
        phone: teacherByEmail.phone ?? undefined,
        subject: teacherByEmail.subject,
      };
    }
  }
  if (!person && email) {
    const member = await db.workspaceMember.findFirst({
      where: { email: email.toLowerCase() },
      select: { name: true, email: true, role: true },
    }).catch(() => null);
    if (member) person = { name: member.name, email: member.email, memberRole: member.role };
  }

  return NextResponse.json({
    success: true,
    profile: {
      id: userId,
      email: email || person?.email || school?.email || '',
      role,
      name: person?.name || displayName || school?.contactName || school?.name || email,
      phone: person?.phone || school?.phone || '',
      subject: person?.subject || '',
      school,
    },
  });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const userId = request.headers.get('x-user-id') || '';
  const email = (request.headers.get('x-user-email') || '').toLowerCase();
  const role = request.headers.get('x-user-role') || '';
  const schoolId = await getTenantSchoolId(request, false);

  if (body.currentPassword && body.newPassword) {
    if (body.newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
    }
    const matches = async (stored: string) => {
      if (!stored) return false;
      if (stored.startsWith('$2')) return bcrypt.compare(body.currentPassword, stored);
      return stored === body.currentPassword;
    };

    if (role === 'teacher' && userId) {
      const t = await db.teacher.findUnique({ where: { id: userId } }).catch(() => null)
        || (email ? await db.teacher.findFirst({ where: { email } }).catch(() => null) : null);
      if (!t || !(await matches(t.password))) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      }
      const hashed = await bcrypt.hash(body.newPassword, 10);
      await db.teacher.update({ where: { id: t.id }, data: { password: hashed } });
    } else if (schoolId && (role === 'school' || role === 'admin')) {
      const school = await db.school.findUnique({ where: { id: schoolId } });
      if (school && (await matches(school.password))) {
        const hashed = await bcrypt.hash(body.newPassword, 10);
        await db.school.update({ where: { id: schoolId }, data: { password: hashed } });
      } else {
        const member = email ? await db.workspaceMember.findFirst({ where: { email } }) : null;
        if (!member || !(await matches(member.password))) {
          return NextResponse.json({ error: 'Current password is incorrect. Demo accounts cannot change password.' }, { status: 400 });
        }
        const hashed = await bcrypt.hash(body.newPassword, 10);
        await db.workspaceMember.update({ where: { id: member.id }, data: { password: hashed } });
      }
    } else {
      return NextResponse.json({ error: 'Password change is not available for this account type' }, { status: 400 });
    }
  }

  if (body.name || body.phone) {
    if (role === 'teacher') {
      const teacher = userId
        ? await db.teacher.findUnique({ where: { id: userId } }).catch(() => null)
        : null;
      const target = teacher || (email ? await db.teacher.findFirst({ where: { email } }).catch(() => null) : null);
      if (target) {
        await db.teacher.update({
          where: { id: target.id },
          data: { name: body.name || undefined, phone: body.phone || undefined },
        }).catch(() => null);
      }
    } else if (schoolId && (role === 'school' || role === 'admin')) {
      await db.school.update({
        where: { id: schoolId },
        data: { contactName: body.name || undefined, phone: body.phone || undefined },
      }).catch(() => null);
      if (email) {
        await db.workspaceMember.updateMany({
          where: { email },
          data: { name: body.name || undefined },
        }).catch(() => null);
      }
    }
  }

  return NextResponse.json({ success: true });
}
