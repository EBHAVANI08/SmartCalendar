export function getClientAuthHeaders(): Record<string, string> {
  try {
    const token = sessionStorage.getItem('sc_token');
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {}
  return {};
}

export function readStoredUser(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem('sc_user');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function patchStoredUser(patch: Record<string, unknown>) {
  try {
    const current = readStoredUser() || {};
    const next = { ...current, ...patch };
    sessionStorage.setItem('sc_user', JSON.stringify(next));
    const authRaw = localStorage.getItem('smart_calendar_auth_session');
    if (authRaw) {
      const auth = JSON.parse(authRaw);
      localStorage.setItem(
        'smart_calendar_auth_session',
        JSON.stringify({ ...auth, user: { ...(auth.user || {}), ...patch } })
      );
    }
    window.dispatchEvent(new CustomEvent('sc-user-updated', { detail: next }));
  } catch {}
}
