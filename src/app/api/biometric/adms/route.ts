export const dynamic = 'force-dynamic';

import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Standard ADMS / Push Protocol for ZKTeco / eSSL / BioMax Biometric Devices
 * 
 * Flow:
 * 1. Device Handshake / Heartbeat: GET /api/biometric/adms?SN=...&options=all
 * 2. Attendance Log Push: POST /api/biometric/adms?SN=...&table=ATTLOG
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sn = searchParams.get('SN') || searchParams.get('sn') || 'UNKNOWN_DEVICE';

  const configResponse = [
    `GET OPTION FROM: ${sn}`,
    'ATTLOGStamp=None',
    'OPERLOGStamp=None',
    'ATTPHOTOStamp=None',
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;14:05',
    'TransInterval=1',
    'TransFlag=1111000000',
    'TimeZone=330',
    'Realtime=1',
    'ServerVer=3.4.1',
    'OK',
  ].join('\n');

  return new NextResponse(configResponse, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sn = searchParams.get('SN') || searchParams.get('sn') || 'ADMS_DEVICE';
    const rawBody = await request.text();

    if (!rawBody || !rawBody.trim()) {
      return new NextResponse('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // Lines are tab or space delimited:
    // <PIN/EmployeeID>\t<YYYY-MM-DD HH:mm:ss>\t<Status>\t<VerifyType>...
    const lines = rawBody.split('\n').map((l) => l.trim()).filter(Boolean);
    let processedCount = 0;

    for (const line of lines) {
      const parts = line.split(/[\t\s]+/);
      if (parts.length < 2) continue;

      const employeePin = parts[0];
      const punchDateTime = parts[1] && parts[2] ? `${parts[1]} ${parts[2]}` : parts[1];

      // Parse date & time
      const dateMatch = punchDateTime.match(/^(\d{4}-\d{2}-\d{2})/);
      const timeMatch = punchDateTime.match(/(\d{2}:\d{2})/);

      if (!dateMatch || !timeMatch) continue;

      const dateStr = dateMatch[1];
      const timeStr = timeMatch[1];

      // Match teacher by employeeId or name/pin
      const teacher = await db.teacher.findFirst({
        where: {
          OR: [
            { employeeId: employeePin },
            { email: { contains: employeePin } },
          ],
        },
      });

      if (!teacher) continue;

      // Determine late status (e.g. past 08:15 AM)
      const [hour, min] = timeStr.split(':').map(Number);
      const isLate = hour > 8 || (hour === 8 && min > 15);
      const attendanceStatus = isLate ? 'late' : 'present';

      // Upsert biometric record
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
            deviceId: sn,
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
            deviceId: sn,
            syncSource: 'biometric_adms',
            syncedAt: new Date(),
          },
        });
      }
      processedCount++;
    }

    return new NextResponse(`OK: ${processedCount}`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error: any) {
    console.error('ADMS ingestion error:', error);
    return new NextResponse('ERROR', { status: 500, headers: { 'Content-Type': 'text/plain' } });
  }
}
