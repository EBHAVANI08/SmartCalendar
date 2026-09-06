import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveSchoolId } from '@/lib/school-helper';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify an HMAC-SHA256 signature over the raw body.
 *
 * This endpoint is unauthenticated by design - devices cannot hold a session -
 * so the signature IS the authentication. Previously there was none, and the
 * tenant was taken from `x-api-key`, which was matched against the school's
 * public CODE rather than any secret. Knowing a school code was therefore enough
 * to mark that school's teachers absent and drive substitution.
 *
 * Until per-school device secrets exist, a single deployment-wide secret gates
 * the endpoint. With no secret configured the route is disabled rather than open.
 */
function verifySignature(rawBody: string, provided: string | null): boolean {
  const secret = process.env.BIOMETRIC_WEBHOOK_SECRET;
  if (!secret || secret.length < 32 || !provided) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.trim().replace(/^sha256=/, ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/webhooks/biometric
 * Universal Webhook Gateway for ZKTeco, eSSL, Matrix, BioMax, Hikvision attendance hardware & IoT bridges.
 * Headers: x-api-key or x-school-code / query: ?schoolCode=DPS2025
 * Body: { punches: [{ teacherId?, employeeCode?, email?, phone?, timestamp: '2026-08-24 08:25:00', type: 'check_in'|'check_out' }] }
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);

    if (!process.env.BIOMETRIC_WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Biometric webhook is not configured. Set BIOMETRIC_WEBHOOK_SECRET to enable it.' },
        { status: 503 }
      );
    }

    // Read the body once, as text, so the signature covers exactly what was sent.
    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers.get('x-signature'))) {
      return NextResponse.json({ error: 'Invalid or missing signature.' }, { status: 401 });
    }

    // No silent default tenant: an unrecognised code must fail, not fall through
    // to whichever school happens to be called DPS2025.
    const schoolCodeOrId =
      request.headers.get('x-school-code') ||
      url.searchParams.get('schoolCode') ||
      url.searchParams.get('schoolId');
    const schoolId = schoolCodeOrId ? await resolveSchoolId(schoolCodeOrId) : null;

    if (!schoolId) {
      return NextResponse.json({ error: 'Valid school tenant code required' }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try { body = JSON.parse(rawBody); } catch { body = {}; }
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
