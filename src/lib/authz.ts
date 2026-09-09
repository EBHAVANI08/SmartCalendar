import { NextResponse } from 'next/server';

/**
 * Central authorization.
 *
 * Before this existed, role was checked in 16 of 134 tenant routes and almost
 * always only to stamp an audit log. A measured probe with a teacher account
 * returned 200 for `POST /api/teachers` and `PUT /api/school/day-config` - a
 * teacher could create faculty and redefine the school week.
 *
 * Two rules:
 *
 *   1. Capabilities, not scattered role string comparisons. A route asks "may
 *      this caller write faculty", never "is role === 'admin'".
 *   2. Fail closed. An unknown role gets nothing.
 *
 * This composes with `getTenantSchoolId` rather than replacing it: authz answers
 * "may you do this at all", tenancy answers "to whose data".
 */

/** The roles the login endpoints actually issue. Nothing else is real. */
export type Role = 'superadmin' | 'admin' | 'school' | 'teacher';

const KNOWN_ROLES: Role[] = ['superadmin', 'admin', 'school', 'teacher'];

export type Capability =
  // Platform owner only
  | 'owner.console'
  | 'owner.tenant.manage'
  | 'owner.entitlements.write'
  | 'tenant.override'          // acting on a school other than your own
  | 'timetable.legacy.adopt'
  // School configuration
  | 'school.settings.read'
  | 'school.settings.write'
  | 'school.dayconfig.read'
  | 'school.dayconfig.write'
  // Faculty
  | 'faculty.read'
  | 'faculty.write'
  | 'faculty.dedup'
  // Subjects
  | 'subject.read'
  | 'subject.write'
  // Timetable
  | 'timetable.read'
  | 'timetable.read.own'
  | 'timetable.write'
  | 'timetable.generate'
  | 'timetable.import'
  | 'timetable.version.read'
  | 'timetable.version.transition'
  // Leave
  | 'leave.read'
  | 'leave.apply.own'
  | 'leave.approve'
  // Substitutions
  | 'substitution.read'
  | 'substitution.read.own'
  | 'substitution.assign'
  | 'substitution.lessoncontext'
  // Operations
  | 'attendance.read'
  | 'attendance.write'
  | 'rooms.read'
  | 'rooms.write'
  | 'calendar.read'
  | 'calendar.write'
  | 'analytics.read'
  | 'lessonplan.read'
  | 'lessonplan.write'
  | 'support.read'
  | 'support.write'
  | 'profile.own';

/**
 * What a School Admin can do. `admin` and `school` are the same person in this
 * product - two login paths issue two different strings for one role.
 */
const SCHOOL_ADMIN: Capability[] = [
  'school.settings.read', 'school.settings.write',
  'school.dayconfig.read', 'school.dayconfig.write',
  'faculty.read', 'faculty.write', 'faculty.dedup',
  'subject.read', 'subject.write',
  'timetable.read', 'timetable.write', 'timetable.generate', 'timetable.import',
  'timetable.version.read', 'timetable.version.transition',
  'leave.read', 'leave.apply.own', 'leave.approve',
  'substitution.read', 'substitution.assign', 'substitution.lessoncontext',
  // An admin is a superset of a teacher for reading, so they hold the `.own`
  // capabilities too. Without these the page guard turned admins away from
  // /timetable and /substitutions, because PAGE_CAPABILITY asks for the
  // narrowest capability that should open the page. The route still decides
  // WHAT they see: ownTeacherId() returns null for an admin, so they get the
  // school-wide view while a teacher gets only their own.
  'timetable.read.own', 'substitution.read.own',
  'attendance.read', 'attendance.write',
  'rooms.read', 'rooms.write',
  'calendar.read', 'calendar.write',
  'analytics.read',
  'lessonplan.read', 'lessonplan.write',
  'support.read', 'support.write',
  'profile.own',
];

/**
 * A teacher sees their own working life and nothing administrative.
 *
 * The `.own` capabilities carry no filtering of their own - the route still has
 * to narrow the query to that teacher. They exist so the route can tell the two
 * cases apart instead of guessing.
 */
const TEACHER: Capability[] = [
  'timetable.read.own',
  'leave.apply.own',
  'substitution.read.own', 'substitution.lessoncontext',
  'calendar.read',
  'lessonplan.read', 'lessonplan.write',
  'support.read', 'support.write',
  'profile.own',
];

const OWNER: Capability[] = [
  'owner.console', 'owner.tenant.manage', 'owner.entitlements.write',
  'tenant.override', 'timetable.legacy.adopt',
  ...SCHOOL_ADMIN,
];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  superadmin: OWNER,
  admin: SCHOOL_ADMIN,
  school: SCHOOL_ADMIN,
  teacher: TEACHER,
};

export function isKnownRole(role: string | null | undefined): role is Role {
  return !!role && (KNOWN_ROLES as string[]).includes(role);
}

/** Fails closed: an unknown or missing role has no capabilities. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!isKnownRole(role)) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function capabilitiesFor(role: string | null | undefined): Capability[] {
  return isKnownRole(role) ? [...ROLE_CAPABILITIES[role]] : [];
}

/** The verified role for a request. Middleware strips inbound identity headers
 *  and re-sets these only from a valid token, so the header is trustworthy. */
export function roleOf(request: Request): Role | null {
  const raw = request.headers.get('x-user-role');
  return isKnownRole(raw) ? raw : null;
}

export function userIdOf(request: Request): string | null {
  return request.headers.get('x-user-id');
}

export function isOwner(request: Request): boolean {
  return roleOf(request) === 'superadmin';
}

export function isTeacher(request: Request): boolean {
  return roleOf(request) === 'teacher';
}

/**
 * Guard for a route handler.
 *
 * Returns a NextResponse to return immediately when the caller is not allowed,
 * or null when they are:
 *
 *   const denied = requireCapability(request, 'faculty.write');
 *   if (denied) return denied;
 */
export function requireCapability(request: Request, capability: Capability): NextResponse | null {
  const role = roleOf(request);

  if (!role) {
    return NextResponse.json(
      { error: 'Authentication required.', code: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  if (!can(role, capability)) {
    return NextResponse.json(
      {
        error: 'You do not have permission to perform this action.',
        code: 'FORBIDDEN',
        required: capability,
      },
      { status: 403 }
    );
  }

  return null;
}

/** Guard accepting any one of several capabilities. */
export function requireAnyCapability(request: Request, capabilities: Capability[]): NextResponse | null {
  const role = roleOf(request);
  if (!role) {
    return NextResponse.json({ error: 'Authentication required.', code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  if (!capabilities.some((c) => can(role, c))) {
    return NextResponse.json(
      { error: 'You do not have permission to perform this action.', code: 'FORBIDDEN', required: capabilities },
      { status: 403 }
    );
  }
  return null;
}

/** Guard for explicitly owner-only endpoints. */
export function requireOwner(request: Request): NextResponse | null {
  return requireCapability(request, 'owner.console');
}

/**
 * Which application pages a role may open.
 *
 * The API is the real boundary; this drives a coarse middleware redirect so a
 * teacher who types /teachers lands somewhere sensible instead of on an admin
 * screen that then 403s on every call.
 */
export const PAGE_CAPABILITY: Record<string, Capability> = {
  '/dashboard': 'profile.own',
  '/timetable': 'timetable.read.own',
  '/timetable-versions': 'timetable.version.read',
  '/substitutions': 'substitution.read.own',
  '/leaves': 'leave.apply.own',
  '/teachers': 'faculty.read',
  '/attendance': 'attendance.read',
  '/subjects': 'subject.read',
  '/day-config': 'school.dayconfig.read',
  '/rooms': 'rooms.read',
  '/calendar': 'calendar.read',
  '/support': 'support.read',
  '/settings': 'school.settings.read',
  '/school-setup': 'school.settings.read',
  '/analytics': 'analytics.read',
  '/lesson-plans': 'lessonplan.read',
  '/profile': 'profile.own',
};

/** The capability a page needs, matching the longest registered prefix. */
export function capabilityForPath(pathname: string): Capability | null {
  const exact = PAGE_CAPABILITY[pathname];
  if (exact) return exact;
  const match = Object.keys(PAGE_CAPABILITY)
    .filter((p) => pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_CAPABILITY[match] : null;
}
