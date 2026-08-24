import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';

/**
 * POST /api/webhooks/biometric
 * Universal Webhook Gateway for ZKTeco, eSSL, Matrix, BioMax, Hikvision attendance hardware & IoT bridges.
 * Headers: x-api-key or x-school-code / query: ?schoolCode=DPS2025
 * Body: { punches: [{ teacherId?, employeeCode?, email?, phone?, timestamp: '2026-08-24 08:25:00', type: 'check_in'|'check_out' }] }
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const schoolCodeOrId = request.headers.get('x-school-code') || request.headers.get('x-api-key') || url.searchParams.get('schoolCode') || url.searchParams.get('schoolId') || 'DPS2025';
    const schoolId = await resolveSchoolId(schoolCodeOrId);

    if (!schoolId) {
      return NextResponse.json({ error: 'Valid school tenant code or API key required' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rawPunches = Array.isArray(body.punches) ? body.punches : Array.isArray(body) ? body : [body];

    if (rawPunches.length === 0 || !rawPunches[0] || Object.keys(rawPunches[0]).length === 0) {
      return NextResponse.json({ error: 'No punch entries provided in payload' }, { status: 400 });
    }

    // Load school faculty for matching
    const faculty = await db.teacher.findMany({
      where: { schoolId },
      select: { id: true, name: true, email: true, phone: true },
    });

    const facultyMap = new Map<string, typeof faculty[0]>();
    for (const f of faculty) {
      facultyMap.set(f.id, f);
      facultyMap.set(f.email.toLowerCase(), f);
      if (f.phone) facultyMap.set(f.phone.replace(/[^0-9]/g, ''), f);
    }

    const processed: any[] = [];
    const errors: any[] = [];

    for (const punch of rawPunches) {
      try {
        const identifier = (punch.teacherId || punch.employeeCode || punch.email || punch.phone || '').trim();
        const cleanPhone = identifier.replace(/[^0-9]/g, '');

        let teacher = facultyMap.get(identifier) || facultyMap.get(identifier.toLowerCase()) || (cleanPhone.length >= 10 ? facultyMap.get(cleanPhone) : undefined);

        // Fallback: match by partial name
        if (!teacher && punch.name) {
          teacher = faculty.find(f => f.name.toLowerCase().includes(String(punch.name).toLowerCase()));
        }

        if (!teacher) {
          errors.push({ punch, reason: `Teacher identifier "${identifier}" not found in school roster` });
          continue;
        }

        const punchTimestamp = punch.timestamp || punch.punchTime || new Date().toISOString();
        const dateObj = new Date(punchTimestamp);
        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toTimeString().split(' ')[0].substring(0, 5) : '08:30';

        // Calculate arrival status based on standard school arrival (08:45 AM threshold)
        const [hours, minutes] = timeStr.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;

        let status = 'present';
        if (totalMinutes > 9 * 60 + 15) {
          status = 'half-day'; // After 09:15 AM
        } else if (totalMinutes > 8 * 60 + 45) {
          status = 'late'; // 08:45 - 09:15 AM
        }

        const isCheckIn = (punch.type || 'check_in').toLowerCase().includes('in');

        // Upsert attendance record
        const record = await db.biometricAttendance.upsert({
          where: {
            date_teacherId: {
              date: dateStr,
              teacherId: teacher.id,
            },
          },
          update: {
            ...(isCheckIn ? { checkInTime: timeStr, status } : { checkOutTime: timeStr }),
            syncSource: punch.deviceId ? `Hardware (${punch.deviceId})` : 'Biometric Webhook',
            syncedAt: new Date(),
          },
          create: {
            teacherId: teacher.id,
            date: dateStr,
            checkInTime: isCheckIn ? timeStr : null,
            checkOutTime: !isCheckIn ? timeStr : null,
            status,
            syncSource: punch.deviceId ? `Hardware (${punch.deviceId})` : 'Biometric Webhook',
            syncedAt: new Date(),
          },
        });

        processed.push({
          teacherId: teacher.id,
          teacherName: teacher.name,
          date: dateStr,
          time: timeStr,
          type: isCheckIn ? 'check_in' : 'check_out',
          status,
          attendanceRecordId: record.id,
        });
      } catch (err: any) {
        errors.push({ punch, reason: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processed.length} biometric hardware punches`,
      processedCount: processed.length,
      errorCount: errors.length,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[BIOMETRIC_WEBHOOK_ERROR]', error);
    return NextResponse.json({ error: `Biometric webhook failed: ${error.message}` }, { status: 500 });
  }
}
