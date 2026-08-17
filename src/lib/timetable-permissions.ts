export type TimetableAction = 'view' | 'configure' | 'generate' | 'edit' | 'review' | 'approve' | 'publish';

const permissions: Record<string, TimetableAction[]> = {
  teacher: ['view', 'review'],
  department_head: ['view', 'edit', 'review', 'approve'],
  timetable_admin: ['view', 'configure', 'generate', 'edit', 'review'],
  academic_coordinator: ['view', 'configure', 'generate', 'edit', 'review', 'approve'],
  principal: ['view', 'configure', 'generate', 'edit', 'review', 'approve', 'publish'],
  school: ['view', 'configure', 'generate', 'edit', 'review', 'approve', 'publish'],
  admin: ['view', 'configure', 'generate', 'edit', 'review', 'approve', 'publish'],
};

export function can(role: string | null | undefined, action: TimetableAction) {
  return permissions[(role || '').toLowerCase()]?.includes(action) || false;
}

export function requireAction(role: string | null | undefined, action: TimetableAction) {
  if (!can(role, action)) throw new Error(`FORBIDDEN:${action}`);
}
