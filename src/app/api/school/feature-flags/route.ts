import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';
import { NextResponse } from 'next/server';

// GET /api/school/feature-flags?schoolId=xxx
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawSchoolId = searchParams.get('schoolId');
    const schoolId = await resolveSchoolId(rawSchoolId);
    
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
