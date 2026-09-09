import { db } from '@/lib/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireCapability } from '@/lib/authz';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(30),
  email: z.string().trim().email(),
  password: z.string().min(6).max(72),
});

/**
 * Create a school tenant.
 *
 * Platform owner only. Schools are onboarded by KAM Global, not by public
 * self-service: the login page previously offered a "register" mode that this
 * endpoint could not actually serve (middleware requires a session), so signup
 * was advertised and then refused.
 *
 * Public self-registration stays closed until rate limiting, email verification,
 * anti-abuse, tenant approval, billing and safe default entitlements exist.
 */
export async function POST(request: Request) {
  const denied = requireCapability(request, 'owner.tenant.manage');
  if (denied) return denied;

  try {
    const rawBody = await request.json();
    const parsed = schema.safeParse(rawBody);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message || 'Enter a valid school name, tenant code, email, and password.';
      return NextResponse.json(
        { success: false, error: `Registration error: ${firstIssue}` },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const email = input.email.toLowerCase();
    const code = input.code.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    // 1. Check for duplicates & persist in MongoDB
    try {
      const duplicate = await db.school.findFirst({
        where: { OR: [{ email }, { code }] },
        select: { email: true, code: true },
      });

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            error:
              duplicate.email === email
                ? 'A school account already exists with this administrator email address.'
                : 'This tenant code is already registered by another school.',
          },
          { status: 409 }
        );
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);
      const school = await db.school.create({
        data: {
          name: input.name,
          code: code,
          email: email,
          password: hashedPassword,
        },
      });

      return NextResponse.json(
        {
          success: true,
          message: 'School workspace registered successfully.',
          user: {
            id: school.id,
            name: school.name,
            email: school.email,
            role: 'admin',
            schoolId: school.id,
            schoolCode: school.code,
            schoolName: school.name,
          },
        },
        { status: 201 }
      );
    } catch (dbError: any) {
      console.error('[DB REGISTER SCHOOL ERROR]', dbError?.message || dbError);
      return NextResponse.json(
        { success: false, error: 'Database service unavailable. School workspace could not be created.' },
        { status: 503 }
      );
    }
  } catch (error: any) {
    console.error('School registration failed:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'School workspace could not be created. Please try again.' },
      { status: 500 }
    );
  }
}
