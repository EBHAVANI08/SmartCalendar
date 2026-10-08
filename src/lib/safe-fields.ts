/**
 * Field lists for records that hold credentials.
 *
 * Teacher, School, WorkspaceMember, Admin and OwnerEmployee all store a
 * `password`. Any query whose result reaches an API response must use one of
 * these selects (or build its response field by field) instead of
 * `include: { teacher: true }` or returning the full row.
 * `tests/no-credentials.test.mjs` fails the build on the unsafe patterns.
 */

export const TEACHER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  employeeId: true,
  subject: true,
  subjects: true,
  sections: true,
  grades: true,
  availability: true,
  role: true,
  schoolId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const SCHOOL_PUBLIC_SELECT = {
  id: true,
  name: true,
  code: true,
  email: true,
  status: true,
  contactName: true,
  phone: true,
} as const;

const CREDENTIAL_KEYS = new Set(['password']);

/**
 * Removes credential keys at any depth. Defence in depth for responses built
 * from full rows; it does not replace selecting only the fields you need.
 */
export function stripCredentials<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripCredentials(item)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (CREDENTIAL_KEYS.has(key)) continue;
      result[key] = stripCredentials(entry);
    }
    return result as T;
  }
  return value;
}
