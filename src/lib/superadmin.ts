import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextResponse } from 'next/server';

/**
 * Platform-owner gate. The session token is verified here rather than trusting
 * the `x-user-role` header, so this holds even if middleware is bypassed.
 * The only other accepted credential is SUPERADMIN_TOKEN, which is
 * environment-configured — there are deliberately no token literals in source.
 */
export async function isSuperAdminRequest(request: Request): Promise<boolean> {
  const session = await getSession(request);
  if (session?.role === 'superadmin') return true;

  const configuredToken = process.env.SUPERADMIN_TOKEN;
  if (!configuredToken || configuredToken.length < 32) return false;

  const authHeader = request.headers.get('authorization');
  const serviceHeader = request.headers.get('x-superadmin-token');
  if (serviceHeader && serviceHeader === configuredToken) return true;
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.substring(7).trim() === configuredToken) {
    return true;
  }
  return false;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized. SuperAdmin privileges required.' }, { status: 401 });
}

export function actorFrom(request: Request) {
  return {
    email: request.headers.get('x-user-email') || 'superadmin',
    role: request.headers.get('x-user-role') || 'superadmin',
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
  };
}

export async function writeAudit(
  request: Request,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>
) {
  const actor = actorFrom(request);
  try {
    await db.platformAuditLog.create({
      data: {
        actorEmail: actor.email,
        actorRole: actor.role,
        action,
        entityType,
        entityId: entityId ?? undefined,
        details: details ? JSON.stringify(details) : undefined,
        ipAddress: actor.ip,
      },
    });
  } catch (error) {
    console.error('Platform audit write failed:', error);
  }
}

const DEFAULT_PLANS = [
  {
    name: 'trial',
    displayName: 'Trial',
    description: '14-day evaluation for new schools. Core timetable and substitutions.',
    priceMonthly: 0,
    priceYearly: 0,
    maxTeachers: 25,
    maxGrades: 8,
    maxPeriodsPerDay: 8,
    features: JSON.stringify(['timetable', 'substitutions', 'faculty']),
    sortOrder: 0,
  },
  {
    name: 'standard',
    displayName: 'Standard',
    description: 'Full operations suite for growing schools.',
    priceMonthly: 4999,
    priceYearly: 49990,
    maxTeachers: 80,
    maxGrades: 12,
    maxPeriodsPerDay: 8,
    features: JSON.stringify(['timetable', 'substitutions', 'faculty', 'attendance', 'leave', 'notifications']),
    sortOrder: 1,
  },
  {
    name: 'premium',
    displayName: 'Premium',
    description: 'AI timetable, lesson packs, workload analytics, and priority support.',
    priceMonthly: 9999,
    priceYearly: 99990,
    maxTeachers: 200,
    maxGrades: 12,
    maxPeriodsPerDay: 10,
    features: JSON.stringify(['timetable', 'ai-timetable', 'substitutions', 'auto-sub', 'faculty', 'attendance', 'leave', 'analytics', 'notifications', 'bulk-import']),
    sortOrder: 2,
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    description: 'Multi-campus, custom limits, white-label, and dedicated success manager.',
    priceMonthly: 24999,
    priceYearly: 249990,
    maxTeachers: 500,
    maxGrades: 16,
    maxPeriodsPerDay: 12,
    features: JSON.stringify(['all', 'white-label', 'multi-campus', 'priority-support', 'custom-sso']),
    sortOrder: 3,
  },
];

export async function seatUsage(schoolId: string) {
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) return null;
  const [teachers, members] = await Promise.all([
    db.teacher.count({ where: { schoolId } }),
    db.workspaceMember.count({ where: { schoolId, status: 'active' } }),
  ]);
  const used = 1 + teachers + members;
  const included = school.includedSeats ?? 5;
  const extra = school.extraSeats ?? 0;
  const allowed = included + extra;
  return { included, extra, allowed, used, remaining: Math.max(0, allowed - used), overLimit: used > allowed };
}

export async function ensureDefaultPlans() {
  const count = await db.plan.count();
  if (count > 0) return;
  await db.plan.createMany({ data: DEFAULT_PLANS });
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const latest = await db.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const seq = latest ? Number(latest.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export function applyCouponDiscount(amount: number, coupon: { discountType: string; discountValue: number; minAmount: number }) {
  if (amount < (coupon.minAmount || 0)) return 0;
  if (coupon.discountType === 'percent') {
    return Math.round((amount * coupon.discountValue) / 100);
  }
  return Math.min(coupon.discountValue, amount);
}

export async function validateCoupon(code: string, amount: number, planName?: string) {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.isActive) return { error: 'Coupon is invalid or inactive' };
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return { error: 'Coupon is not active yet' };
  if (coupon.expiresAt && coupon.expiresAt < now) return { error: 'Coupon has expired' };
  if (coupon.maxRedemptions != null && coupon.usedCount >= coupon.maxRedemptions) {
    return { error: 'Coupon redemption limit reached' };
  }
  if (coupon.appliesToPlan && planName && coupon.appliesToPlan !== planName) {
    return { error: `Coupon applies only to the ${coupon.appliesToPlan} plan` };
  }
  const discount = applyCouponDiscount(amount, coupon);
  return { coupon, discount };
}
