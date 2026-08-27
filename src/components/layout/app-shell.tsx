'use client';

import { useState, useEffect } from 'react';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { TopHeader } from '@/components/layout/top-header';
import { useRouter } from 'next/navigation';
import { getClientAuthHeaders } from '@/lib/client-session';

interface AppShellProps {
  children: React.ReactNode;
}

interface StoredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId?: string;
  schoolCode?: string;
  schoolName?: string;
  modules?: string[] | string;
}

export function AppShell({ children }: AppShellProps) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');
  const [pendingSubs, setPendingSubs] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const loadUser = () => {
      try {
        const raw = sessionStorage.getItem('sc_user');
        if (raw) setUser(JSON.parse(raw));
      } catch {}
    };
    loadUser();
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) setUser((prev) => ({ ...(prev || { id: '', name: '', email: '', role: 'admin' }), ...detail }));
      else loadUser();
    };
    window.addEventListener('sc-user-updated', onUpdated as EventListener);
    return () => window.removeEventListener('sc-user-updated', onUpdated as EventListener);
  }, []);

  useEffect(() => {
    // Fetch pending substitution count for notification badge
    const fetchPending = async () => {
      try {
        const r = await fetch('/api/dashboard/stats', {
          headers: getClientAuthHeaders(),
          credentials: 'include',
        });
        if (r.ok) {
          const d = await r.json();
          setPendingSubs(d.data?.pendingSubstitutions || 0);
          setSchoolName(d.data?.schoolName || '');
        }
      } catch {}
    };
    fetchPending();
  }, []);

  useEffect(() => {
    try {
      setImpersonating(sessionStorage.getItem('sc_impersonating'));
    } catch {}
  }, []);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    sessionStorage.removeItem('sc_user');
    sessionStorage.removeItem('sc_token');
    sessionStorage.removeItem('sc_owner_session');
    sessionStorage.removeItem('sc_impersonating');
    sessionStorage.removeItem('sc_dismissed_notifs');
    localStorage.removeItem('smart_calendar_auth_session');
    router.push('/');
  };

  const exitImpersonation = async () => {
    try {
      const raw = sessionStorage.getItem('sc_owner_session');
      const owner = raw ? JSON.parse(raw) : null;
      const token = owner?.token;
      if (token) {
        const res = await fetch('/api/auth/restore-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const d = await res.json();
        if (res.ok && d.user) {
          sessionStorage.setItem('sc_user', JSON.stringify(d.user));
          if (d.token) sessionStorage.setItem('sc_token', d.token);
        }
      }
    } catch {}
    sessionStorage.removeItem('sc_owner_session');
    sessionStorage.removeItem('sc_impersonating');
    router.push('/superadmin');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <SidebarNav
        schoolName={user?.schoolName || schoolName || 'Smart Calendar'}
        schoolCode={user?.schoolCode}
        userRole={user?.role}
        modules={user?.modules}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopHeader
          schoolName={user?.schoolName || schoolName || 'Smart Calendar'}
          userName={user?.name}
          userRole={user?.role}
          userEmail={user?.email}
          pendingSubstitutions={pendingSubs}
          onToggleMobile={() => setMobileMenuOpen(!mobileMenuOpen)}
          onLogout={handleLogout}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50/80 mesh-bg">
          {impersonating && (
            <div className="bg-violet-700 text-white px-4 py-2 flex items-center justify-between text-sm font-semibold">
              <span>Viewing customer workspace: {impersonating}</span>
              <button onClick={exitImpersonation} className="rounded-lg bg-white/15 hover:bg-white/25 px-3 py-1 text-xs font-bold">
                Return to Owner Console
              </button>
            </div>
          )}
          <div className="max-w-[1600px] mx-auto p-3 sm:p-6 min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
