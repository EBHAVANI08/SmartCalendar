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
  const [exiting, setExiting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const loadUser = () => {
      try {
        const raw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
        if (raw) {
          const parsed = JSON.parse(raw);
          const u = parsed.user || parsed;
          setUser(u);
          if (!sessionStorage.getItem('sc_user')) {
            sessionStorage.setItem('sc_user', JSON.stringify(u));
          }
        }
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
    // Fetch pending substitution count for notification badge (admin/school manager only)
    const fetchPending = async () => {
      try {
        const raw = sessionStorage.getItem('sc_user') || localStorage.getItem('smart_calendar_auth_session');
        let currentRole = 'admin';
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            currentRole = parsed.role || parsed.user?.role || 'admin';
          } catch {}
        }
        if (currentRole === 'teacher') return;

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
      const imp = sessionStorage.getItem('sc_impersonating') || localStorage.getItem('sc_impersonating');
      setImpersonating(imp);
    } catch {}
  }, []);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    sessionStorage.removeItem('sc_user');
    sessionStorage.removeItem('sc_token');
    sessionStorage.removeItem('sc_owner_session');
    sessionStorage.removeItem('sc_impersonating');
    sessionStorage.removeItem('sc_dismissed_notifs');
    localStorage.removeItem('sc_owner_session');
    localStorage.removeItem('sc_impersonating');
    localStorage.removeItem('smart_calendar_auth_session');
    window.location.href = '/';
  };

  const exitImpersonation = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      const raw = sessionStorage.getItem('sc_owner_session') || localStorage.getItem('sc_owner_session');
      let owner: any = null;
      try {
        owner = raw ? JSON.parse(raw) : null;
      } catch {}
      const token = owner?.token;

      const res = await fetch('/api/auth/restore-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const d = await res.json();
      if (res.ok && d.user) {
        sessionStorage.setItem('sc_user', JSON.stringify(d.user));
        if (d.token) sessionStorage.setItem('sc_token', d.token);
        localStorage.setItem(
          'smart_calendar_auth_session',
          JSON.stringify({
            isLoggedIn: true,
            user: d.user,
            role: 'superadmin',
            token: d.token,
          })
        );
      } else if (owner?.user) {
        sessionStorage.setItem('sc_user', JSON.stringify(owner.user));
        if (owner.token) sessionStorage.setItem('sc_token', owner.token);
        localStorage.setItem(
          'smart_calendar_auth_session',
          JSON.stringify({
            isLoggedIn: true,
            user: owner.user,
            role: 'superadmin',
            token: owner.token,
          })
        );
      }
    } catch (e) {
      console.error('Error exiting impersonation:', e);
    } finally {
      sessionStorage.removeItem('sc_owner_session');
      sessionStorage.removeItem('sc_impersonating');
      localStorage.removeItem('sc_owner_session');
      localStorage.removeItem('sc_impersonating');
      window.location.href = '/superadmin/tenants';
    }
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
          impersonating={impersonating}
          onExitImpersonation={exitImpersonation}
          onToggleMobile={() => setMobileMenuOpen(!mobileMenuOpen)}
          onLogout={handleLogout}
        />
        {impersonating && (
          <div className="bg-gradient-to-r from-violet-900 via-indigo-900 to-purple-950 text-white px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-semibold shadow-md z-30 shrink-0 border-b border-violet-700/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/30 text-amber-300 shrink-0 border border-violet-400/30">
                ⚡
              </span>
              <div className="min-w-0 flex items-center gap-2">
                <span className="truncate">
                  Logged in as School: <strong className="text-amber-300 underline underline-offset-2">{impersonating}</strong>
                </span>
                <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-violet-800 text-violet-200 border border-violet-600/60">
                  SuperAdmin Impersonation
                </span>
              </div>
            </div>
            <button
              onClick={exitImpersonation}
              disabled={exiting}
              className="shrink-0 ml-3 rounded-lg bg-white text-violet-950 hover:bg-violet-50 px-3.5 py-1.5 text-xs font-black shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>{exiting ? 'Returning...' : 'Return to SuperAdmin'}</span>
              <span className="text-violet-700">→</span>
            </button>
          </div>
        )}
        <main className="flex-1 overflow-y-auto bg-slate-50/80 mesh-bg">
          <div className="w-full p-3 sm:p-5 md:p-6 min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
