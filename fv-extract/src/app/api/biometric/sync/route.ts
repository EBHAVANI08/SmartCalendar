import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// Simulate biometric device sync — pulls attendance data from "biometric system"
// Also simulates teachers who applied for leave through the school portal
// In production, this would connect to actual biometric API/device and leave management system
export async function POST(request: Request) {
  try {
    const { date, forceResync } = await request.json();
    const syncDate = date || new Date().toISOString().split('T')[0];

    // Get all teachers
    const teachers = await db.teacher.findMany();

    // Pre-generate leave applications for some teachers (simulating the school portal)
    // This runs before biometric sync so leave data is available for reason detection
    const leaveTypes = [
      'sick', 'personal', 'casual', 'maternity', 'official_duty', 'training',
      'family_emergency', 'medical_appointment',
    ];
    const leaveReasons: Record<string, string[]> = {
      sick: ['Fever and cold', 'Stomach infection', 'Migraine', 'Flu symptoms', 'Viral infection'],
      personal: ['Family function', 'Personal errand', 'Home maintenance', 'Religious observance'],
      casual: ['Personal work', 'Family commitment', 'Child school event'],
      maternity: ['Maternity leave — prenatal checkup', 'Maternity leave — doctor advised rest'],
      official_duty: ['Exam paper evaluation at board center', 'Teacher training workshop at DIET', 'CBSE coordination meeting', 'Sports day preparation at ground'],
      training: ['CBSE capacity building workshop', 'Subject-specific training program', 'ICT integration training', 'National Education Policy seminar'],
      family_emergency: ['Medical emergency in family', 'Urgent family matter', 'Accident in family'],
      medical_appointment: ['Doctor appointment — follow-up', 'Dental surgery scheduled', 'Eye checkup appointment', 'Physiotherapy session'],
    };

    for (const teacher of teachers) {
      // ~15% chance of having an approved leave for today
      const shouldHaveLeave = Math.random() < 0.15;
      if (shouldHaveLeave) {
        const leaveType = leaveTypes[Math.floor(Math.random() * leaveTypes.length)];
        const reasons = leaveReasons[leaveType] || ['Personal reason'];
        const reason = reasons[Math.floor(Math.random() * reasons.length)];

        // Check if leave already exists
        const existingLeave = await db.leaveApplication.findFirst({
          where: {
            teacherId: teacher.id,
            startDate: { lte: syncDate },
            endDate: { gte: syncDate },
            status: 'approved',
          },
        });

        if (!existingLeave) {
          await db.leaveApplication.create({
            data: {
              teacherId: teacher.id,
              leaveType,
              reason,
              startDate: syncDate,
              endDate: syncDate,
              status: 'approved',
              appliedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Applied 0-7 days ago
              approvedBy: 'admin',
              teacherNotes: `Applied through school portal — ${leaveType.replace('_', ' ')} leave`,
              isEmergency: Math.random() < 0.2,
            },
          });
        }
      }
    }

    // Now simulate biometric device data
    const biometricResults = [];

    for (const teacher of teachers) {
      // Check if already synced for this date
      const existing = await db.biometricAttendance.findUnique({
        where: { date_teacherId: { date: syncDate, teacherId: teacher.id } },
      });

      if (existing && !forceResync) {
        biometricResults.push(existing);
        continue;
      }

      // Check if teacher has approved leave for today
      const approvedLeave = await db.leaveApplication.findFirst({
        where: {
          teacherId: teacher.id,
          startDate: { lte: syncDate },
          endDate: { gte: syncDate },
          status: 'approved',
        },
      });

      let status: string;
      let checkInTime: string | null = null;
      let checkOutTime: string | null = null;
      let deviceId: string | null = null;

      if (approvedLeave) {
        // Teacher has approved leave — mark as absent
        status = 'absent';
      } else {
        // No leave — simulate biometric detection
        const rand = Math.random();
        if (rand < 0.78) {
          status = 'present';
          const min = 45 + Math.floor(Math.random() * 45);
          checkInTime = `07:${String(min % 60).padStart(2, '0')}`;
          const outHour = 14 + Math.floor(Math.random() * 3);
          const outMin = Math.floor(Math.random() * 60);
          checkOutTime = `${String(outHour).padStart(2, '0')}:${String(outMin).padStart(2, '0')}`;
          deviceId = `BIO-${String(Math.floor(Math.random() * 5) + 1).padStart(3, '0')}`;
        } else if (rand < 0.88) {
          status = 'absent';
          // No biometric data — truly absent, no leave
        } else if (rand < 0.96) {
          status = 'late';
          const lateHour = 9 + Math.floor(Math.random() * 2);
          const lateMin = Math.floor(Math.random() * 60);
          checkInTime = `${String(lateHour).padStart(2, '0')}:${String(lateMin).padStart(2, '0')}`;
          deviceId = `BIO-${String(Math.floor(Math.random() * 5) + 1).padStart(3, '0')}`;
        } else {
          status = 'half-day';
          const halfMin = Math.floor(Math.random() * 60);
          checkInTime = `08:${String(halfMin).padStart(2, '0')}`;
          checkOutTime = `12:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
          deviceId = `BIO-${String(Math.floor(Math.random() * 5) + 1).padStart(3, '0')}`;
        }
      }

      const record = await db.biometricAttendance.upsert({
        where: { date_teacherId: { date: syncDate, teacherId: teacher.id } },
        update: {
          status,
          checkInTime,
          checkOutTime,
          deviceId,
          syncSource: 'biometric',
          syncedAt: new Date(),
        },
        create: {
          date: syncDate,
          teacherId: teacher.id,
          status,
          checkInTime,
          checkOutTime,
          deviceId,
          syncSource: 'biometric',
        },
      });

      biometricResults.push(record);
    }

    const absentCount = biometricResults.filter(r => r.status === 'absent').length;
    const lateCount = biometricResults.filter(r => r.status === 'late').length;
    const presentCount = biometricResults.filter(r => r.status === 'present').length;
    const halfDayCount = biometricResults.filter(r => r.status === 'half-day').length;

    return NextResponse.json({
      success: true,
      date: syncDate,
      syncedAt: new Date().toISOString(),
      summary: {
        total: biometricResults.length,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        halfDay: halfDayCount,
      },
      records: biometricResults,
    });
  } catch (error) {
    console.error('Error syncing biometric data:', error);
    return NextResponse.json({ error: 'Failed to sync biometric data' }, { status: 500 });
  }
}

// GET: Fetch biometric attendance for a date
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const records = await db.biometricAttendance.findMany({
      where: { date },
      include: { teacher: true },
      orderBy: { status: 'asc' },
    });

    const summary = {
      total: records.length,
      present: records.filter(r => r.status === 'present').length,
      absent: records.filter(r => r.status === 'absent').length,
      late: records.filter(r => r.status === 'late').length,
      halfDay: records.filter(r => r.status === 'half-day').length,
    };

    return NextResponse.json({ date, summary, records });
  } catch (error) {
    console.error('Error fetching biometric data:', error);
    return NextResponse.json({ error: 'Failed to fetch biometric data' }, { status: 500 });
  }
}
