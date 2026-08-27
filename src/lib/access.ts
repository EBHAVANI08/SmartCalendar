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
  { id: 'support', label: 'Support & tickets' },
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

export function hasModule(modules: string[] | undefined, id: string) {
  if (!modules || modules.length === 0) return true;
  return modules.includes(id) || modules.includes('all');
}
