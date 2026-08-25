'use client';

import { useState, useEffect } from 'react';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { TopHeader } from '@/components/layout/top-header';
import { useRouter } from 'next/navigation';

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
}

export function AppShell({ children }: AppShellProps) {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');
  const [pendingSubs, setPendingSubs] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Load user from sessionStorage
    try {
      const raw = sessionStorage.getItem('sc_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Fetch pending substitution count for notification badge
    const fetchPending = async () => {
      try {
        const r = await fetch('/api/dashboard/stats');
        if (r.ok) {
          const d = await r.json();
          setPendingSubs(d.data?.pendingSubstitutions || 0);
          setSchoolName(d.data?.schoolName || '');
        }
      } catch {}
    };
    fetchPending();
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('sc_user');
    sessionStorage.removeItem('sc_token');
    router.push('/');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <SidebarNav
        schoolName={user?.schoolName || schoolName || 'Smart Calendar'}
        schoolCode={user?.schoolCode}
        userRole={user?.role}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopHeader
          schoolName={user?.schoolName || schoolName || 'Smart Calendar'}
          userName={user?.name}
          userRole={user?.role}
          pendingSubstitutions={pendingSubs}
          onToggleMobile={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <main className="flex-1 overflow-y-auto bg-slate-50/80 mesh-bg">
          <div className="max-w-[1600px] mx-auto p-3 sm:p-6 min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
