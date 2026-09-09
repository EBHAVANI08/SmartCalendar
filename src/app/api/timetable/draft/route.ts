export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { getTenantSchoolId } from '@/lib/school-helper';
import { createInitialVersion } from '@/lib/timetable-lifecycle';
import { NextResponse } from 'next/server';

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
  const notes = body.notes || `Draft saved via Studio on ${new Date().toLocaleDateString('en-IN')}`;

  // Check if draft version already exists
  let draftVersion = await db.timetableVersion.findFirst({
    where: { schoolId, status: 'draft' },
    orderBy: { version: 'desc' },
  });

  if (!draftVersion) {
    const { version } = await createInitialVersion({
      schoolId,
      createdBy: actor,
      name: body.name || 'Master Timetable Draft',
      changeNotes: notes,
    });
    draftVersion = version;
  } else {
    draftVersion = await db.timetableVersion.update({
      where: { id: draftVersion.id },
      data: {
        changeNotes: notes,
        updatedAt: new Date(),
      },
    });
  }

  // Ensure unversioned schedule rows are assigned to this draft
  await db.schedule.updateMany({
    where: {
      schoolId,
      OR: [{ timetableVersionId: null }, { timetableVersionId: { isSet: false } }],
    },
    data: { timetableVersionId: draftVersion.id },
  });

  const totalSlots = await db.schedule.count({
    where: { schoolId, timetableVersionId: draftVersion.id },
  });

  return NextResponse.json({
    success: true,
    message: `Draft v${draftVersion.version} saved successfully!`,
    version: draftVersion,
    totalSlots,
    savedAt: new Date().toISOString(),
  });
}
