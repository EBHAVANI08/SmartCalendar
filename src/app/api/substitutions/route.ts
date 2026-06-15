import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const substitutions = await db.substitution.findMany({
      include: {
        absentTeacher: true,
        substitute: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(substitutions);
  } catch (error) {
    console.error('Error fetching substitutions:', error);
    return NextResponse.json({ error: 'Failed to fetch substitutions' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { substitutionId, substituteId } = await request.json();

    if (!substitutionId || !substituteId) {
      return NextResponse.json({ error: 'substitutionId and substituteId are required' }, { status: 400 });
    }

    // Check the substitution exists and is pending
    const substitution = await db.substitution.findUnique({
      where: { id: substitutionId },
      include: { absentTeacher: true, substitute: true },
    });

    if (!substitution) {
      return NextResponse.json({ error: 'Substitution not found' }, { status: 404 });
    }

    if (substitution.status === 'assigned' && substitution.substituteId) {
      return NextResponse.json({ error: 'Substitution already has a substitute assigned' }, { status: 400 });
    }

    // Verify the substitute teacher is not the absent teacher
    if (substituteId === substitution.absentTeacherId) {
      return NextResponse.json({ error: 'Cannot assign the absent teacher as substitute' }, { status: 400 });
    }

    // Verify the substitute teacher is free at that period
    const dateObj = new Date(substitution.date + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[dateObj.getDay()];

    const teacherSchedules = await db.schedule.findMany({
      where: { teacherId: substituteId, day },
    });

    const isBusy = teacherSchedules.some((s) => s.period === substitution.period);
    if (isBusy) {
      return NextResponse.json({ error: 'This teacher is busy at the required period' }, { status: 400 });
    }

    const dayWorkload = teacherSchedules.length;
    if (dayWorkload >= 8) {
      return NextResponse.json({ error: 'This teacher has reached the maximum workload for the day' }, { status: 400 });
    }

    // Assign the substitute
    const updated = await db.substitution.update({
      where: { id: substitutionId },
      data: {
        substituteId,
        status: 'assigned',
      },
      include: {
        absentTeacher: true,
        substitute: true,
      },
    });

    return NextResponse.json({
      success: true,
      substitution: updated,
      message: `Assigned ${updated.substitute?.name} as substitute`,
    });
  } catch (error) {
    console.error('Error updating substitution:', error);
    return NextResponse.json({ error: 'Failed to update substitution' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { absentTeacherId, date, reason } = await request.json();

    if (!absentTeacherId || !date) {
      return NextResponse.json({ error: 'absentTeacherId and date are required' }, { status: 400 });
    }

    // Get the day of the week from the date
    const dateObj = new Date(date + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[dateObj.getDay()];

    if (day === 'Sunday' || day === 'Saturday') {
      return NextResponse.json({ error: 'Cannot create substitutions for weekends' }, { status: 400 });
    }

    // Find all schedules for the absent teacher on that day
    const teacherSchedules = await db.schedule.findMany({
      where: {
        teacherId: absentTeacherId,
        day,
      },
    });

    if (teacherSchedules.length === 0) {
      return NextResponse.json({ error: 'No schedules found for this teacher on the given day' }, { status: 404 });
    }

    // Create a Substitution entry for each schedule period
    const substitutions = [];
    for (const sched of teacherSchedules) {
      const sub = await db.substitution.create({
        data: {
          date,
          period: sched.period,
          absentTeacherId,
          grade: sched.grade,
          section: sched.section,
          subject: sched.subject,
          reason: reason || 'Not specified',
          status: 'pending',
        },
        include: {
          absentTeacher: true,
          substitute: true,
        },
      });
      substitutions.push(sub);
    }

    return NextResponse.json({
      success: true,
      message: `Created ${substitutions.length} substitution entries for ${day}`,
      substitutions,
    });
  } catch (error) {
    console.error('Error creating substitutions:', error);
    return NextResponse.json({ error: 'Failed to create substitutions' }, { status: 500 });
  }
}
