export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getTenantSchoolId } from '@/lib/school-helper';
import { dispatchMessage } from '@/lib/notifications/messaging-service';

export async function POST(request: Request) {
  try {
    const schoolId = await getTenantSchoolId(request);
    const body = await request.json().catch(() => ({}));
    const { channel = 'all', phone, email, recipientName = 'Test Teacher' } = body;

    const results = await dispatchMessage({
      recipientName,
      recipientPhone: phone || '+919876543210',
      recipientEmail: email || 'test@school.edu',
      schoolId: schoolId || 'demo-school',
      channel: channel as any,
      template: 'substitution_assigned',
      parameters: {
        recipientName,
        absentTeacherName: 'Demo Faculty',
        date: new Date().toISOString().split('T')[0],
        period: 3,
        grade: 'Grade 9',
        section: 'A',
        subject: 'Mathematics',
        topic: 'Algebra Review',
      },
    });

    return NextResponse.json({
      success: true,
      results,
      config: {
        whatsappConfigured: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
        twilioConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
        emailConfigured: Boolean(process.env.RESEND_API_KEY),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to dispatch test notification' },
      { status: 500 }
    );
  }
}
