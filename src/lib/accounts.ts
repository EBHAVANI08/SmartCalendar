import { db } from '@/lib/db';
import type { AccountType } from '@/lib/jwt-auth';

/**
 * Password storage for every account table, addressed by (type, id), so a
 * password change touches exactly one row.
 */

export async function getStoredPassword(type: AccountType, id: string): Promise<string | null> {
  const select = { password: true } as const;
  const row =
    type === 'teacher' ? await db.teacher.findUnique({ where: { id }, select })
    : type === 'school' ? await db.school.findUnique({ where: { id }, select })
    : type === 'member' ? await db.workspaceMember.findUnique({ where: { id }, select })
    : type === 'admin' ? await db.admin.findUnique({ where: { id }, select })
    : await db.ownerEmployee.findUnique({ where: { id }, select });
  return row?.password ?? null;
}

/**
 * Stores a new bcrypt hash. `mustChangePassword` is true when someone other
 * than the account holder chose it (temporary or reset password) and false when
 * the holder set it themselves.
 */
export async function setStoredPassword(
  type: AccountType,
  id: string,
  passwordHash: string,
  mustChangePassword: boolean
): Promise<boolean> {
  const where = { id };
  const data = { password: passwordHash, mustChangePassword };
  const result =
    type === 'teacher' ? await db.teacher.updateMany({ where, data })
    : type === 'school' ? await db.school.updateMany({ where, data })
    : type === 'member' ? await db.workspaceMember.updateMany({ where, data })
    : type === 'admin' ? await db.admin.updateMany({ where, data })
    : await db.ownerEmployee.updateMany({ where, data });
  return result.count === 1;
}
