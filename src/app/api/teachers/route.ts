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

export async function GET(request: Request) {
  const denied = requireCapability(request, 'faculty.read');
  if (denied) return denied;

  try {
    const schoolId = await getTenantSchoolId(request);
    const whereClause = schoolId ? { schoolId } : {};
    const operational = schoolId ? await operationalScheduleFilter(schoolId) : null;
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
      include: {
        schedules: {
          where: Object.keys(scheduleWhere).length > 0 ? scheduleWhere : undefined,
          orderBy: [{ day: 'asc' }, { period: 'asc' }],
        },
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

/** Accepts either the legacy single `subject` or a `subjects` list. */
function incomingSubjects(body: any): unknown {
  if (body.subjects !== undefined) {
    return Array.isArray(body.subjects) ? body.subjects.join(';') : body.subjects;
  }
  return body.subject;
}

function incomingList(value: unknown): unknown {
  return Array.isArray(value) ? value.join(';') : value;
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

    const teacher = await db.teacher.create({
      data: {
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

    return NextResponse.json({ success: true, teacher });
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
    const current = await db.teacher.findFirst({ where: { id, schoolId } });
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
      data: { role: role === 'teacher' ? 'teacher' : 'inactive' },
    });

    return NextResponse.json({ success: true, teacher });
  } catch (error: any) {
    console.error('Error toggling teacher status:', error);
    return NextResponse.json({ error: error?.message || 'Failed to toggle teacher status' }, { status: 500 });
  }
}
