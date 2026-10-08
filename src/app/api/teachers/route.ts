export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import {
  DUPLICATE_MESSAGE,
  findDuplicate,
  normalizeName,
  readList,
  validateFacultyRow,
} from '@/lib/faculty';
import { NextResponse } from 'next/server';
import { operationalScheduleFilter } from '@/lib/timetable-lifecycle';
import { requireCapability } from '@/lib/authz';
import { sendTeacherPasswordSetupEmail } from '@/lib/mailer';
import { TEACHER_PUBLIC_SELECT } from '@/lib/safe-fields';
import { generateTemporaryPassword, hashPassword } from '@/lib/password';

export async function GET(request: Request) {
  const denied = requireCapability(request, 'faculty.read');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }
    const whereClause = { schoolId };
    const operational = await operationalScheduleFilter(schoolId);
    const scheduleWhere: Record<string, unknown> = {};
    if (operational) {
      if (operational.timetableVersionId) {
        scheduleWhere.timetableVersionId = operational.timetableVersionId;
      } else if (operational.OR) {
        scheduleWhere.OR = operational.OR;
      }
    }

    const teachers = await db.teacher.findMany({
      where: whereClause,
      select: {
        ...TEACHER_PUBLIC_SELECT,
        schedules: {
          where: Object.keys(scheduleWhere).length > 0 ? scheduleWhere : undefined,
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    // Check if any teachers have empty schedules and enrich them from all schedules or TimetableSlot
    const teachersNeedingSchedules = teachers.filter((t) => !t.schedules || t.schedules.length === 0);
    if (teachersNeedingSchedules.length > 0) {
      const teacherIds = teachersNeedingSchedules.map((t) => t.id);
      
      const [allSchedules, allSlots, classes, subjects] = await Promise.all([
        db.schedule.findMany({
          where: { schoolId, teacherId: { in: teacherIds } },
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        }),
        db.timetableSlot.findMany({
          where: { schoolId, teacherId: { in: teacherIds } },
          orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
        }),
        db.classSection.findMany({ where: { schoolId } }),
        db.subjectMaster.findMany({ where: { schoolId } }),
      ]);

      const classById = new Map(classes.map((c) => [c.id, c]));
      const subjectById = new Map(subjects.map((s) => [s.id, s.name]));
      const dayMap: Record<number, string> = {
        1: 'Monday',
        2: 'Tuesday',
        3: 'Wednesday',
        4: 'Thursday',
        5: 'Friday',
        6: 'Saturday',
        7: 'Sunday',
      };

      const schedulesByTeacher = new Map<string, any[]>();
      for (const s of allSchedules) {
        if (!s.teacherId) continue;
        if (!schedulesByTeacher.has(s.teacherId)) schedulesByTeacher.set(s.teacherId, []);
        schedulesByTeacher.get(s.teacherId)!.push(s);
      }

      const slotsByTeacher = new Map<string, any[]>();
      for (const slot of allSlots) {
        if (!slot.teacherId) continue;
        if (!slotsByTeacher.has(slot.teacherId)) slotsByTeacher.set(slot.teacherId, []);
        const cls = classById.get(slot.classSectionId);
        const subjName = (slot.subjectId && subjectById.get(slot.subjectId)) || slot.topic || 'Class';
        slotsByTeacher.get(slot.teacherId)!.push({
          id: slot.id,
          grade: cls?.grade || 'Class',
          section: cls?.section || '',
          day: dayMap[slot.dayOfWeek] || 'Monday',
          period: slot.period,
          subject: subjName,
          teacherId: slot.teacherId,
          schoolId: slot.schoolId,
          topic: slot.topic,
          roomId: slot.roomId,
          startTime: '08:00',
          endTime: '08:45',
          timetableVersionId: slot.timetableVersionId,
        });
      }

      for (const teacher of teachers) {
        if (!teacher.schedules || teacher.schedules.length === 0) {
          const fallbackScheds = schedulesByTeacher.get(teacher.id);
          const fallbackSlots = slotsByTeacher.get(teacher.id);
          if (fallbackScheds && fallbackScheds.length > 0) {
            (teacher as any).schedules = fallbackScheds;
          } else if (fallbackSlots && fallbackSlots.length > 0) {
            (teacher as any).schedules = fallbackSlots;
          }
        }
      }
    }

    return NextResponse.json(teachers);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    return NextResponse.json({ error: 'Failed to fetch teachers' }, { status: 500 });
  }
}

/** Accepts either the legacy single `subject` or a `subjects` list. */
function incomingSubjects(body: any): unknown {
  if (body.subjects !== undefined) {
    return Array.isArray(body.subjects) ? body.subjects.join(';') : body.subjects;
  }
  return body.subject;
}

function incomingList(value: unknown): unknown {
  if (Array.isArray(value)) return value.join(';');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

export async function POST(request: Request) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;

  try {
    const body = await request.json();
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }

    const validation = validateFacultyRow(
      {
        name: body.name,
        email: body.email,
        employeeId: body.employeeId,
        phone: body.phone,
        subjects: incomingSubjects(body),
        grades: incomingList(body.grades),
        sections: incomingList(body.sections),
      },
      1
    );

    if (!validation.ok || !validation.record) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid faculty details.', issues: validation.issues },
        { status: 400 }
      );
    }
    const record = validation.record;

    // One teacher is one record: if this person already exists, the caller
    // should edit them rather than create a second profile.
    const existing = await db.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true, email: true, employeeId: true },
    });
    const duplicate = findDuplicate(record, existing);
    if (duplicate) {
      return NextResponse.json(
        {
          error: DUPLICATE_MESSAGE,
          code: 'DUPLICATE_FACULTY',
          existingTeacher: { id: duplicate.id, name: duplicate.name },
          matchedOn: duplicate.matchedOn,
        },
        { status: 409 }
      );
    }

    // Only the hash is stored. The Admin sees the temporary password once, so
    // the teacher can sign in even when the setup email cannot be delivered.
    const temporaryPassword = generateTemporaryPassword();
    const teacher = await db.teacher.create({
      select: TEACHER_PUBLIC_SELECT,
      data: {
        password: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        name: record.name,
        email: record.email || `${normalizeName(record.name).replace(/\s+/g, '.')}.${Date.now().toString(36)}@faculty.local`,
        employeeId: record.employeeId,
        phone: record.phone || '',
        subject: record.subjects[0],
        subjects: JSON.stringify(record.subjects),
        grades: JSON.stringify(record.grades),
        sections: JSON.stringify(record.sections),
        role: body.role === 'inactive' ? 'inactive' : 'teacher',
        schoolId,
      },
    });

    // Automatically send password setup email to the teacher
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });

    const origin = new URL(request.url).origin;
    let emailResult: any = null;
    if (record.email && !record.email.endsWith('@faculty.local')) {
      emailResult = await sendTeacherPasswordSetupEmail({
        teacherId: teacher.id,
        teacherName: teacher.name,
        teacherEmail: teacher.email,
        schoolName: school?.name || 'School',
        subjects: record.subjects,
        requestOrigin: origin,
      }).catch((err) => {
        console.error('Failed to send setup email on teacher create:', err);
        return null;
      });
    }

    return NextResponse.json({
      success: true,
      teacher,
      temporaryPassword,
      emailSent: Boolean(emailResult?.success && !emailResult?.simulated),
      setupUrl: emailResult?.setupUrl,
    });
  } catch (error) {
    console.error('Error creating teacher:', error);
    return NextResponse.json({ error: 'Failed to create teacher' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id } = body;
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }
    if (!id) {
      return NextResponse.json({ error: 'Teacher ID is required.' }, { status: 400 });
    }

    // Scope the lookup to the caller's school so one tenant cannot edit another's faculty.
    const current = await db.teacher.findFirst({ where: { id, schoolId }, select: TEACHER_PUBLIC_SELECT });
    if (!current) {
      return NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 });
    }

    const validation = validateFacultyRow(
      {
        name: body.name ?? current.name,
        email: body.email ?? current.email,
        employeeId: body.employeeId ?? current.employeeId,
        phone: body.phone ?? current.phone,
        subjects: body.subjects !== undefined || body.subject !== undefined
          ? incomingSubjects(body)
          : readList(current.subjects ?? current.subject).join(';'),
        grades: body.grades !== undefined ? incomingList(body.grades) : readList(current.grades).join(';'),
        sections: body.sections !== undefined ? incomingList(body.sections) : readList(current.sections).join(';'),
      },
      1
    );

    if (!validation.ok || !validation.record) {
      return NextResponse.json(
        { error: validation.issues[0]?.message || 'Invalid faculty details.', issues: validation.issues },
        { status: 400 }
      );
    }
    const record = validation.record;

    // Editing must not collide with a different existing person.
    const others = await db.teacher.findMany({
      where: { schoolId, NOT: { id } },
      select: { id: true, name: true, email: true, employeeId: true },
    });
    const duplicate = findDuplicate(record, others);
    if (duplicate) {
      return NextResponse.json(
        {
          error: DUPLICATE_MESSAGE,
          code: 'DUPLICATE_FACULTY',
          existingTeacher: { id: duplicate.id, name: duplicate.name },
          matchedOn: duplicate.matchedOn,
        },
        { status: 409 }
      );
    }

    const teacher = await db.teacher.update({
      where: { id },
      select: TEACHER_PUBLIC_SELECT,
      data: {
        name: record.name,
        ...(record.email ? { email: record.email } : {}),
        employeeId: record.employeeId,
        phone: record.phone || '',
        subject: record.subjects[0],
        subjects: JSON.stringify(record.subjects),
        grades: JSON.stringify(record.grades),
        sections: JSON.stringify(record.sections),
        ...(body.role !== undefined ? { role: body.role } : {}),
      },
    });

    return NextResponse.json({ success: true, teacher });
  } catch (error: any) {
    console.error('Error updating teacher:', error);
    return NextResponse.json({ error: error?.message || 'Failed to update teacher' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = requireCapability(request, 'faculty.write');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id, role } = body;
    const schoolId = await getTenantSchoolId(request);
    if (!schoolId) {
      return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
    }
    if (!id) {
      return NextResponse.json({ error: 'Teacher ID is required.' }, { status: 400 });
    }

    const current = await db.teacher.findFirst({ where: { id, schoolId }, select: { id: true } });
    if (!current) {
      return NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 });
    }

    const teacher = await db.teacher.update({
      where: { id },
      select: TEACHER_PUBLIC_SELECT,
      data: { role: role === 'teacher' ? 'teacher' : 'inactive' },
    });

    return NextResponse.json({ success: true, teacher });
  } catch (error: any) {
    console.error('Error toggling teacher status:', error);
    return NextResponse.json({ error: error?.message || 'Failed to toggle teacher status' }, { status: 500 });
  }
}
