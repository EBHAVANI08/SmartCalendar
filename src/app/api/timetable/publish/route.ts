export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { ensureAcademicYear, getPublishedVersion } from '@/lib/timetable-lifecycle';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const published = await getPublishedVersion(schoolId);
  const activeDraft = await db.timetableVersion.findFirst({
    where: { schoolId, status: { in: ['draft', 'review', 'approved'] } },
    orderBy: { version: 'desc' },
  });

  const latest = activeDraft || published || (await db.timetableVersion.findFirst({
    where: { schoolId },
    orderBy: { version: 'desc' },
  }));

  const totalSchedules = await db.schedule.count({
    where: { schoolId },
  });

  return NextResponse.json({
    success: true,
    isPublished: Boolean(published),
    hasDraft: Boolean(activeDraft),
    currentStatus: activeDraft ? 'draft' : (published ? 'published' : 'draft'),
    version: activeDraft || published || latest || null,
    publishedVersion: published || null,
    totalSchedules,
  });
}

export async function POST(request: Request) {
  const schoolId = await getTenantSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'No school context. Please sign in again.' }, { status: 401 });
  }

  const actor =
    request.headers.get('x-user-email') ||
    request.headers.get('x-user-name') ||
    request.headers.get('x-user-id') ||
    'School Admin';

  const body = await request.json().catch(() => ({}));
  const notes = body.notes || 'Finalized and published via Timetable Studio';

  // 1. Fetch current published version
  const currentPublished = await getPublishedVersion(schoolId);

  // 2. Fetch any pending draft / review version
  const activeDraft = await db.timetableVersion.findFirst({
    where: { schoolId, status: { in: ['draft', 'review', 'approved'] } },
    orderBy: { version: 'desc' },
  });

  // 3. Count unversioned rows
  const unversioned = await db.schedule.count({
    where: {
      schoolId,
      OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
    },
  });

  let newPublishedVersion: any = null;

  if (activeDraft && (!currentPublished || activeDraft.id !== currentPublished.id)) {
    // A separate draft exists that is ready to be published as the new active version!
    // Assign any unversioned rows to this draft
    if (unversioned > 0) {
      await db.schedule.updateMany({
        where: {
          schoolId,
          OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
        },
        data: { timetableVersionId: activeDraft.id },
      });
    }

    // Ensure activeDraft has all classes from previous version so no class is lost
    if (currentPublished) {
      const draftClasses = await db.schedule.findMany({
        where: { schoolId, timetableVersionId: activeDraft.id },
        select: { grade: true, section: true },
        distinct: ['grade', 'section'],
      });
      const draftClassKeys = new Set(draftClasses.map((c) => `${c.grade}|${c.section}`));

      const oldRows = await db.schedule.findMany({
        where: { schoolId, timetableVersionId: currentPublished.id },
      });
      const missingRows = oldRows.filter((r) => !draftClassKeys.has(`${r.grade}|${r.section}`));
      if (missingRows.length > 0) {
        for (let i = 0; i < missingRows.length; i += 100) {
          const chunk = missingRows.slice(i, i + 100);
          await db.schedule.createMany({
            data: chunk.map((r) => ({
              schoolId,
              timetableVersionId: activeDraft.id,
              grade: r.grade,
              section: r.section,
              day: r.day,
              period: r.period,
              subject: r.subject,
              teacherId: r.teacherId,
              topic: r.topic,
              roomId: r.roomId,
              startTime: r.startTime,
              endTime: r.endTime,
            })),
          });
        }
      }
    }

    // Determine correct sequential version number
    const highest = await db.timetableVersion.findFirst({
      where: { schoolId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const targetVersionNumber = Math.max(
      activeDraft.version,
      (highest?.version ?? 0) + (activeDraft.version <= (currentPublished?.version ?? 0) ? 1 : 0)
    );

    newPublishedVersion = await db.timetableVersion.update({
      where: { id: activeDraft.id },
      data: {
        version: targetVersionNumber,
        status: 'published',
        publishedBy: actor,
        publishedAt: new Date(),
        changeNotes: notes,
      },
    });

    // Archive old published version into Version History as superseded
    if (currentPublished) {
      await db.timetableVersion.update({
        where: { id: currentPublished.id },
        data: {
          status: 'superseded',
          supersededById: newPublishedVersion.id,
          supersededAt: new Date(),
        },
      });
    }
  } else if (currentPublished) {
    // Current version was already published, and user is publishing a new roster or updates:
    // We create a NEW version so currentPublished is preserved in Version History!
    const highest = await db.timetableVersion.findFirst({
      where: { schoolId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersionNumber = (highest?.version ?? currentPublished.version) + 1;
    const academicYearId = currentPublished.academicYearId || (await ensureAcademicYear(schoolId));

    newPublishedVersion = await db.timetableVersion.create({
      data: {
        schoolId,
        academicYearId,
        name: body.name || `Master Timetable v${nextVersionNumber}`,
        version: nextVersionNumber,
        status: 'published',
        createdBy: actor,
        publishedBy: actor,
        publishedAt: new Date(),
        changeNotes: notes,
        basedOnId: currentPublished.id,
      },
    });

    if (unversioned > 0) {
      // Assign unversioned schedules to the new published version
      await db.schedule.updateMany({
        where: {
          schoolId,
          OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
        },
        data: { timetableVersionId: newPublishedVersion.id },
      });
    } else {
      // Clone schedules from currentPublished into newPublishedVersion so currentPublished
      // keeps its historical roster completely intact in Version History
      const oldSchedules = await db.schedule.findMany({
        where: { schoolId, timetableVersionId: currentPublished.id },
      });
      if (oldSchedules.length > 0) {
        const clonedSchedules = oldSchedules.map((s) => ({
          grade: s.grade,
          section: s.section,
          day: s.day,
          period: s.period,
          subject: s.subject,
          teacherId: s.teacherId,
          schoolId: s.schoolId,
          topic: s.topic,
          roomId: s.roomId,
          startTime: s.startTime,
          endTime: s.endTime,
          timetableVersionId: newPublishedVersion.id,
        }));
        await db.schedule.createMany({ data: clonedSchedules });
      }
    }

    // Archive currentPublished into Version History as superseded
    await db.timetableVersion.update({
      where: { id: currentPublished.id },
      data: {
        status: 'superseded',
        supersededById: newPublishedVersion.id,
        supersededAt: new Date(),
      },
    });
  } else {
    // Initial publication for a school with no versions yet
    const academicYearId = await ensureAcademicYear(schoolId);
    newPublishedVersion = await db.timetableVersion.create({
      data: {
        schoolId,
        academicYearId,
        name: body.name || 'Master Timetable v1',
        version: 1,
        status: 'published',
        createdBy: actor,
        publishedBy: actor,
        publishedAt: new Date(),
        changeNotes: notes,
      },
    });

    await db.schedule.updateMany({
      where: {
        schoolId,
        OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
      },
      data: { timetableVersionId: newPublishedVersion.id },
    });
  }

  // 5. Create audit entry for tracking
  await db.auditLog
    .create({
      data: {
        schoolId,
        actorId: actor,
        actorRole: request.headers.get('x-user-role') || 'school',
        action: 'timetable.publish',
        entityType: 'TimetableVersion',
        entityId: newPublishedVersion.id,
        before: currentPublished ? { version: currentPublished.version, id: currentPublished.id } : null,
        after: { status: 'published', version: newPublishedVersion.version, id: newPublishedVersion.id },
        reason: notes,
      },
    })
    .catch(() => null);

  const rowCount = await db.schedule.count({
    where: { schoolId, timetableVersionId: newPublishedVersion.id },
  });

  return NextResponse.json({
    success: true,
    message: `Master Timetable v${newPublishedVersion.version} published! Previous roster preserved in Version History.`,
    version: newPublishedVersion,
    previousVersion: currentPublished,
    rowCount,
  });
}
