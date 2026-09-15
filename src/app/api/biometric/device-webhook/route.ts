export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

/**
 * Modern JSON Webhook for Cloud Biometric Gateways (Matrix, eSSL Cloud, BioStar, Custom Hardware bridges)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { schoolId, deviceId = 'CLOUD_GATEWAY', punches = [] } = body;

    if (!Array.isArray(punches) || punches.length === 0) {
      return NextResponse.json({ error: 'Payload must contain a non-empty "punches" array' }, { status: 400 });
    }

    const results = [];
    let synced = 0;

    for (const punch of punches) {
      const { employeeId, email, timestamp, time } = punch;
      const punchTime = timestamp ? new Date(timestamp) : new Date();
      const dateStr = punch.date || punchTime.toISOString().split('T')[0];
      const timeStr = time || punchTime.toTimeString().slice(0, 5);

      // Match teacher
      const teacher = await db.teacher.findFirst({
        where: {
          OR: [
            ...(employeeId ? [{ employeeId }] : []),
            ...(email ? [{ email }] : []),
          ],
          ...(schoolId ? { schoolId } : {}),
        },
      });

      if (!teacher) {
        results.push({ employeeId, status: 'unmatched' });
        continue;
      }

      const [hour, min] = timeStr.split(':').map(Number);
      const isLate = hour > 8 || (hour === 8 && min > 15);
      const attendanceStatus = isLate ? 'late' : 'present';

      const existing = await db.biometricAttendance.findUnique({
        where: {
          date_teacherId: {
            date: dateStr,
            teacherId: teacher.id,
          },
        },
      });

      if (existing) {
        await db.biometricAttendance.update({
          where: { id: existing.id },
          data: {
            checkOutTime: timeStr,
            deviceId,
            syncedAt: new Date(),
          },
        });
      } else {
        await db.biometricAttendance.create({
          data: {
            date: dateStr,
            teacherId: teacher.id,
            checkInTime: timeStr,
            status: attendanceStatus,
            deviceId,
            syncSource: 'cloud_webhook',
            syncedAt: new Date(),
          },
        });
      }

      synced++;
      results.push({ teacherId: teacher.id, teacherName: teacher.name, date: dateStr, time: timeStr, status: attendanceStatus });
    }

    return NextResponse.json({
      success: true,
      syncedCount: synced,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Biometric webhook processing failed' },
      { status: 500 }
    );
  }
}
