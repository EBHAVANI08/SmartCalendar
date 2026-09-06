import { db } from '@/lib/db';
import { getTenantSchoolId, resolveSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

// GET /api/school/feature-flags?schoolId=xxx
export async function GET(request: Request) {
  try {
  // Pinned to the caller's school. schoolId used to be resolved from client
  // input, so any signed-in user could act on another school's data.
    const schoolId = await getTenantSchoolId(request);
    
    if (!schoolId) {
      return NextResponse.json({
        flags: {
          aiTimetableEnabled: true,
          manualTimetableEnabled: true,
          bulkImportEnabled: true,
          shortBreakEnabled: true,
          lunchBreakEnabled: true,
          ptPeriodsEnabled: true,
          substitutionEnabled: true,
          autoSubstitutionEnabled: true,
          workloadAnalyticsEnabled: true,
          teacherNotifyEnabled: true,
          maxGrades: 12,
          maxTeachers: 200,
          maxPeriodsPerDay: 10,
          planName: 'standard',
        },
      });
    }

    let flags = await db.schoolFeatureFlags.findUnique({ where: { schoolId } });
    if (!flags) {
      try {
        flags = await db.schoolFeatureFlags.create({ data: { schoolId } });
      } catch {
        flags = await db.schoolFeatureFlags.findUnique({ where: { schoolId } });
      }
    }
    return NextResponse.json({ flags });
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    return NextResponse.json({
      flags: {
        aiTimetableEnabled: true,
        manualTimetableEnabled: true,
        bulkImportEnabled: true,
        shortBreakEnabled: true,
        lunchBreakEnabled: true,
        ptPeriodsEnabled: true,
        substitutionEnabled: true,
        autoSubstitutionEnabled: true,
        workloadAnalyticsEnabled: true,
        teacherNotifyEnabled: true,
        maxGrades: 12,
        maxTeachers: 200,
        maxPeriodsPerDay: 10,
        planName: 'standard',
      },
    });
  }
}
