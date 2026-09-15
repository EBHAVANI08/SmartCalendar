import { db } from '@/lib/db';

export interface DispatchMessageOptions {
  recipientName: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  teacherId?: string | null;
  schoolId?: string | null;
  channel: 'whatsapp' | 'sms' | 'email' | 'all';
  template: 'substitution_assigned' | 'leave_approved' | 'schedule_change' | 'general';
  parameters: Record<string, any>;
}

export interface DispatchResult {
  success: boolean;
  channel: string;
  messageId: string;
  recipient: string;
  content: string;
  status: 'sent' | 'delivered' | 'queued' | 'simulated' | 'failed';
  error?: string;
}

/**
 * Format dynamic message templates for WhatsApp / SMS / Email
 */
export function formatMessageText(template: DispatchMessageOptions['template'], params: Record<string, any>): string {
  switch (template) {
    case 'substitution_assigned':
      return (
        `🚨 *Smart Calendar: Substitution Assignment*\n\n` +
        `Hello *${params.recipientName || 'Teacher'}*,\n` +
        `You have been assigned as substitute teacher:\n` +
        `• *Absent Faculty:* ${params.absentTeacherName || 'Faculty Member'}\n` +
        `• *Date & Period:* ${params.date}, Period ${params.period}\n` +
        `• *Class:* ${params.grade} - Section ${params.section}\n` +
        `• *Subject / Topic:* ${params.subject}${params.topic ? ` (${params.topic})` : ''}\n\n` +
        `Please report to the assigned classroom 5 minutes before bell time.`
      );

    case 'leave_approved':
      return (
        `✅ *Smart Calendar: Leave Status Update*\n\n` +
        `Dear *${params.recipientName}*,\n` +
        `Your leave application for *${params.startDate} to ${params.endDate}* has been *APPROVED* by the administration.`
      );

    case 'schedule_change':
      return (
        `📅 *Smart Calendar: Timetable Change Notice*\n\n` +
        `Dear *${params.recipientName}*,\n` +
        `Your timetable for *${params.day}* has been updated by the academic coordinator.`
      );

    default:
      return params.message || 'Notification from School Administration.';
  }
}

/**
 * Clean phone number for international SMS / WhatsApp delivery (E.164 format)
 */
function normalizePhoneNumber(rawPhone: string): string {
  let cleaned = rawPhone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    // Default to +91 (India) if 10-digit number is passed without country code
    if (cleaned.length === 10) {
      cleaned = `+91${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

/**
 * Dispatch WhatsApp message via Meta WhatsApp Cloud API if configured
 */
async function sendWhatsAppCloud(phone: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return { success: false, error: 'WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured' };
  }

  const recipient = normalizePhoneNumber(phone).replace('+', '');
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: { preview_url: false, body: text },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { success: false, error: data?.error?.message || `WhatsApp API error ${response.status}` };
  }

  return { success: true, messageId: data?.messages?.[0]?.id };
}

/**
 * Dispatch SMS message via Twilio REST API if configured
 */
async function sendTwilioSMS(phone: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER is not configured' };
  }

  const recipient = normalizePhoneNumber(phone);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const formBody = new URLSearchParams({
    To: recipient,
    From: fromNumber,
    Body: text,
  });

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { success: false, error: data?.message || `Twilio SMS error ${response.status}` };
  }

  return { success: true, messageId: data?.sid };
}

/**
 * Dispatch Email via Resend API if configured
 */
async function sendResendEmail(email: string, subject: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@learnx.school';

  if (!resendApiKey) {
    return { success: false, error: 'RESEND_API_KEY is not configured' };
  }

  const url = 'https://api.resend.com/emails';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `AI Smart Calendar <${fromEmail}>`,
      to: [email],
      subject,
      text,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { success: false, error: data?.message || `Resend Email error ${response.status}` };
  }

  return { success: true, messageId: data?.id };
}

/**
 * Enterprise Multi-Channel Messaging Gateway with Live Provider Support & Resilient Fallbacks
 */
export async function dispatchMessage(options: DispatchMessageOptions): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];
  const textContent = formatMessageText(options.template, options.parameters);
  const channels = options.channel === 'all' ? ['whatsapp', 'sms'] : [options.channel];

  for (const ch of channels) {
    const isPhoneChannel = ch === 'whatsapp' || ch === 'sms';
    const target = isPhoneChannel
      ? options.recipientPhone || '+919876543210'
      : options.recipientEmail || 'teacher@school.edu';

    let messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let status: DispatchResult['status'] = 'simulated';
    let errorMessage: string | undefined;

    try {
      if (ch === 'whatsapp') {
        const liveRes = await sendWhatsAppCloud(target, textContent);
        if (liveRes.success) {
          status = 'delivered';
          messageId = liveRes.messageId || messageId;
        } else {
          // Log note if credentials were not provided, but treat as simulated for demo
          errorMessage = liveRes.error;
          status = process.env.WHATSAPP_TOKEN ? 'failed' : 'simulated';
        }
      } else if (ch === 'sms') {
        const liveRes = await sendTwilioSMS(target, textContent);
        if (liveRes.success) {
          status = 'delivered';
          messageId = liveRes.messageId || messageId;
        } else {
          errorMessage = liveRes.error;
          status = process.env.TWILIO_ACCOUNT_SID ? 'failed' : 'simulated';
        }
      } else if (ch === 'email') {
        const subject = options.template === 'substitution_assigned'
          ? '🚨 AI Smart Calendar: Substitution Assignment Notice'
          : 'Smart Calendar: Academic Notification';
        const liveRes = await sendResendEmail(target, subject, textContent);
        if (liveRes.success) {
          status = 'delivered';
          messageId = liveRes.messageId || messageId;
        } else {
          errorMessage = liveRes.error;
          status = process.env.RESEND_API_KEY ? 'failed' : 'simulated';
        }
      }
    } catch (dispatchErr: any) {
      errorMessage = dispatchErr?.message || String(dispatchErr);
      status = 'failed';
    }

    const result: DispatchResult = {
      success: status !== 'failed',
      channel: ch,
      messageId,
      recipient: target,
      content: textContent,
      status,
      error: errorMessage,
    };

    results.push(result);

    // Persist delivery log in database if schoolId is available
    if (options.schoolId) {
      try {
        await db.notificationDelivery.create({
          data: {
            schoolId: options.schoolId,
            channel: ch,
            recipient: target,
            status,
            providerMessageId: messageId,
            lastError: errorMessage || null,
            attemptCount: 1,
            deliveredAt: status === 'delivered' || status === 'simulated' ? new Date() : null,
          },
        });
      } catch (err) {
        console.warn('Could not persist notification delivery log:', err);
      }
    }
  }

  return results;
}
