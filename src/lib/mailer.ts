import nodemailer from 'nodemailer';
import { db } from '@/lib/db';
import { signJwt, verifyJwt } from '@/lib/jwt-auth';

export interface SetupPasswordTokenPayload {
  teacherId: string;
  email: string;
  schoolId?: string | null;
  purpose: 'teacher_password_setup';
}

const SETUP_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate a cryptographically signed password setup token valid for 7 days.
 */
export async function generatePasswordSetupToken(
  teacherId: string,
  email: string,
  schoolId?: string | null
): Promise<string> {
  const payload: any = {
    userId: teacherId,
    email: email.trim().toLowerCase(),
    role: 'teacher',
    schoolId: schoolId || null,
    purpose: 'teacher_password_setup',
  };
  return await signJwt(payload, SETUP_TOKEN_EXPIRY);
}

/**
 * Verify and decode a password setup token.
 */
export async function verifyPasswordSetupToken(token: string): Promise<{
  teacherId: string;
  email: string;
  schoolId?: string | null;
} | null> {
  try {
    const verified: any = await verifyJwt(token);
    if (!verified || verified.purpose !== 'teacher_password_setup' || !verified.userId || !verified.email) {
      return null;
    }
    return {
      teacherId: verified.userId,
      email: verified.email,
      schoolId: verified.schoolId,
    };
  } catch {
    return null;
  }
}

/**
 * Get configured nodemailer transporter or null if not configured.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD;

  const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !user || !pass || !String(user).trim() || !String(pass).trim()) {
    return null;
  }

  return nodemailer.createTransport({
    host: String(host).trim(),
    port,
    secure: isSecure,
    auth: {
      user: String(user).trim(),
      pass: String(pass).trim(),
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false,
    },
  });
}

export interface SendSetupEmailOptions {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  schoolName?: string;
  subjects?: string[];
  requestOrigin?: string;
}

/**
 * Build HTML email template for password setup.
 */
function buildPasswordSetupHtml(params: {
  teacherName: string;
  schoolName: string;
  setupUrl: string;
  subjects?: string[];
}): string {
  const { teacherName, schoolName, setupUrl, subjects } = params;
  const subjectsStr = subjects && subjects.length > 0 ? subjects.join(', ') : 'Faculty Curriculum';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Set Up Your Faculty Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%); padding: 32px 36px; text-align: center;">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.12); border-radius: 12px; padding: 8px 16px; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.2);">
                <span style="color: #93c5fd; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">Smart Calendar &bull; Faculty Portal</span>
              </div>
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; line-height: 1.3;">
                Welcome to ${schoolName}
              </h1>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 36px 28px;">
              <p style="font-size: 16px; font-weight: 700; color: #1e293b; margin: 0 0 12px;">
                Hello ${teacherName},
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
                You have been registered as a faculty member at <strong>${schoolName}</strong> for <strong>${subjectsStr}</strong>.
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 28px;">
                To access your faculty timetable, daily teaching schedules, and attendance portal, please create your password by clicking the button below:
              </p>

              <!-- Action Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="${setupUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35); letter-spacing: 0.2px;">
                  Set Up My Password &rarr;
                </a>
              </div>

              <!-- Fallback Link -->
              <div style="background-color: #f8fafc; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0; margin-top: 24px;">
                <p style="font-size: 11px; color: #64748b; margin: 0 0 6px; font-weight: 600;">If the button above does not work, copy and paste this link into your browser:</p>
                <a href="${setupUrl}" target="_blank" style="font-size: 11px; color: #2563eb; word-break: break-all; text-decoration: underline;">
                  ${setupUrl}
                </a>
              </div>

              <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0; line-height: 1.5;">
                &bull; This link is secure and valid for <strong>7 days</strong>.<br/>
                &bull; If you did not expect this invitation, please disregard this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 36px; text-align: center;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                &copy; ${new Date().getFullYear()} ${schoolName} &bull; Powered by Smart Calendar Faculty System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send a password setup email to a newly added teacher.
 */
export async function sendTeacherPasswordSetupEmail(options: SendSetupEmailOptions): Promise<{
  success: boolean;
  setupUrl: string;
  simulated?: boolean;
  error?: string;
}> {
  const { teacherId, teacherName, teacherEmail, schoolName = 'School', subjects, requestOrigin } = options;

  // Don't attempt to send to synthetic fallback emails (e.g. *.local)
  if (!teacherEmail || teacherEmail.endsWith('@faculty.local') || !teacherEmail.includes('@')) {
    return {
      success: false,
      setupUrl: '',
      error: 'Invalid or synthetic email address.',
    };
  }

  // Derive origin — APP_URL always wins so emails never contain localhost
  const baseUrl =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    requestOrigin ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3005' : 'https://smartcalender.learnx.school');

  const token = await generatePasswordSetupToken(teacherId, teacherEmail);
  const setupUrl = `${baseUrl.replace(/\/+$/, '')}/setup-password?token=${encodeURIComponent(token)}`;

  const transporter = getTransporter();
  const from =
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    `"${schoolName}" <${process.env.SMTP_USER || 'noreply@smartcalender.learnx.school'}>`;

  const subject = `Welcome to ${schoolName} - Set Up Your Teacher Account Password`;
  const html = buildPasswordSetupHtml({
    teacherName,
    schoolName,
    setupUrl,
    subjects,
  });

  if (!transporter) {
    // Graceful simulated mode when SMTP credentials are not yet defined in .env
    console.log(`\n=============================================================`);
    console.log(`📧 [MAILER: SIMULATED] Password Setup Email for ${teacherName} (${teacherEmail})`);
    console.log(`🏫 School: ${schoolName}`);
    console.log(`🔗 Password Setup Link: ${setupUrl}`);
    console.log(`💡 Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env to send live emails.`);
    console.log(`=============================================================\n`);

    return {
      success: true,
      setupUrl,
      simulated: true,
    };
  }

  try {
    await transporter.sendMail({
      from,
      to: `"${teacherName}" <${teacherEmail}>`,
      subject,
      html,
    });

    console.log(`📧 [MAILER: SENT] Password Setup Email successfully dispatched to ${teacherEmail}`);
    return {
      success: true,
      setupUrl,
      simulated: false,
    };
  } catch (err: any) {
    console.error(`❌ [MAILER: ERROR] Failed to send email to ${teacherEmail}:`, err);
    // Still return setupUrl so admin can share it manually if SMTP server has an issue
    return {
      success: false,
      setupUrl,
      error: err?.message || 'SMTP delivery failed.',
    };
  }
}

/**
 * Send a 6-digit password reset OTP email.
 */
export async function sendPasswordResetOtpEmail(options: {
  email: string;
  name: string;
  otp: string;
  schoolName?: string;
}): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const { email, name, otp, schoolName = 'Smart Calendar' } = options;

  const transporter = getTransporter();
  const from =
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    `"${schoolName}" <${process.env.SMTP_USER || 'noreply@smartcalender.learnx.school'}>`;
  const subject = `Your Password Reset OTP: ${otp} - ${schoolName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Password Reset Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0; line-height: 1.3;">
                Password Reset Verification
              </h1>
              <p style="color: #93c5fd; font-size: 13px; margin: 6px 0 0; font-weight: 500;">
                ${schoolName} &bull; Security Verification
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <p style="font-size: 15px; font-weight: 700; color: #1e293b; margin: 0 0 12px;">
                Hello ${name},
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px;">
                We received a request to reset the password for your account (<strong>${email}</strong>). Use the one-time passcode (OTP) below to proceed with resetting your password:
              </p>

              <!-- OTP Code Display -->
              <div style="text-align: center; margin: 28px 0; background-color: #eff6ff; border: 2px dashed #93c5fd; border-radius: 14px; padding: 20px;">
                <p style="font-size: 11px; font-weight: 700; color: #1e40af; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Your 6-Digit One-Time Passcode</p>
                <div style="font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8; font-family: 'Courier New', Courier, monospace;">
                  ${otp}
                </div>
                <p style="font-size: 11px; color: #64748b; margin: 8px 0 0;">Valid for 15 minutes &bull; Single-use only</p>
              </div>

              <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 24px 0 0;">
                &bull; If you did not make this request, please ignore this email. Your password will remain unchanged.<br/>
                &bull; Never share this passcode with anyone. School administrators will never ask for your OTP.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 32px; text-align: center;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                &copy; ${new Date().getFullYear()} ${schoolName} &bull; Smart Calendar Security Service
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  if (!transporter) {
    console.log(`\n=============================================================`);
    console.log(`🔑 [OTP: SIMULATED] Password Reset Code for ${name} (${email})`);
    console.log(`🔢 OTP Code: ${otp}`);
    console.log(`🏫 School: ${schoolName}`);
    console.log(`⏳ Valid for 15 minutes`);
    console.log(`=============================================================\n`);

    return {
      success: true,
      simulated: true,
    };
  }

  try {
    await transporter.sendMail({
      from,
      to: `"${name}" <${email}>`,
      subject,
      html,
    });
    console.log(`📧 [MAILER: SENT] Password reset OTP sent to ${email}`);
    return {
      success: true,
      simulated: false,
    };
  } catch (err: any) {
    console.error(`❌ [MAILER: ERROR] Failed to send OTP to ${email}:`, err);
    return {
      success: false,
      error: err?.message || 'Failed to dispatch email.',
    };
  }
}
