export const OWNER_MODULES = [
  { id: 'overview', label: 'Overview' },
  { id: 'tenants', label: 'Tenants' },
  { id: 'payments', label: 'Payments & invoices' },
  { id: 'coupons', label: 'Coupons' },
  { id: 'team', label: 'Owner team' },
  { id: 'tickets', label: 'Support tickets' },
  { id: 'messages', label: 'Messages & alerts' },
  { id: 'website', label: 'Website & SEO' },
  { id: 'health', label: 'System health' },
  { id: 'audit', label: 'Audit log' },
] as const;

export const TENANT_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'timetable', label: 'Timetable' },
  { id: 'substitutions', label: 'Substitutions' },
  { id: 'leaves', label: 'Leave management' },
  { id: 'teachers', label: 'Faculty' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'settings', label: 'School settings' },
  { id: 'schoolsetup', label: 'School setup' },
  { id: 'support', label: 'Support & tickets' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'lessonplans', label: 'Lesson plans' },
] as const;

export const OWNER_ROLE_MODULES: Record<string, string[]> = {
  owner: OWNER_MODULES.map((m) => m.id),
  sales: ['overview', 'tenants', 'coupons', 'messages', 'tickets', 'website'],
  support: ['overview', 'tenants', 'tickets', 'messages', 'health'],
  demo: ['overview', 'tenants', 'health'],
  finance: ['overview', 'tenants', 'payments', 'coupons'],
  engineer: ['overview', 'tenants', 'health', 'audit', 'tickets'],
};

export const TENANT_ROLE_MODULES: Record<string, string[]> = {
  admin: TENANT_MODULES.map((m) => m.id),
  school: TENANT_MODULES.map((m) => m.id),
  principal: TENANT_MODULES.map((m) => m.id),
  coordinator: ['dashboard', 'timetable', 'substitutions', 'leaves', 'teachers', 'calendar', 'support'],
  teacher: ['dashboard', 'timetable', 'substitutions', 'leaves', 'calendar', 'support'],
  staff: ['dashboard', 'attendance', 'rooms', 'calendar', 'support'],
  demo: ['dashboard', 'timetable', 'teachers', 'support'],
};

export function parseModules(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

/**
 * Modules a role may see when the session carries no explicit grant.
 *
 * The normal login issues no `modules` claim, so this is the case that actually
 * runs in production. It must never mean "everything".
 */
export const ROLE_DEFAULT_MODULES: Record<string, string[]> = {
  superadmin: TENANT_MODULES.map((m) => m.id),
  admin: TENANT_MODULES.map((m) => m.id),
  school: TENANT_MODULES.map((m) => m.id),
  teacher: ['dashboard', 'timetable', 'substitutions', 'leaves', 'calendar', 'lessonplans'],
};

/**
 * Resolve which modules a session may see.
 *
 * An explicit grant narrows the role's defaults - it can never widen them, so a
 * WorkspaceMember record cannot hand a teacher the admin sidebar.
 */
export function resolveModules(role: string | null | undefined, modules?: string | string[] | null): string[] {
  const roleDefaults = (role && ROLE_DEFAULT_MODULES[role]) || [];
  const explicit = parseModules(modules);
  if (explicit.length === 0) return roleDefaults;
  if (explicit.includes('all')) return roleDefaults;
  return explicit.filter((m) => roleDefaults.includes(m));
}

/**
 * Fails CLOSED.
 *
 * This previously returned `true` whenever the modules list was empty, and the
 * normal login issues no modules claim - so every role saw every menu item.
 * Callers must now pass the result of `resolveModules`.
 */
/** Owner-console equivalent of resolveModules. */
export function resolveOwnerModules(modules?: string | string[] | null): string[] {
  const explicit = parseModules(modules);
  const all: string[] = OWNER_MODULES.map((m) => m.id);
  if (explicit.length === 0 || explicit.includes('all')) return all;
  return explicit.filter((m) => all.includes(m));
}

export function hasModule(modules: string[] | undefined, id: string) {
  if (!modules || modules.length === 0) return false;
  return modules.includes(id);
}
