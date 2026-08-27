'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Building2, CreditCard, TicketPercent, HeartPulse,
  ScrollText, Shield, LogOut, ChevronLeft, ChevronRight, Sparkles, X,
  UsersRound, LifeBuoy, MessageSquare, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasModule, parseModules } from '@/lib/access';

const nav = [
  { href: '/superadmin', label: 'Overview', icon: LayoutDashboard, exact: true, id: 'overview' },
  { href: '/superadmin/tenants', label: 'Tenants', icon: Building2, id: 'tenants' },
  { href: '/superadmin/payments', label: 'Payments', icon: CreditCard, id: 'payments' },
  { href: '/superadmin/coupons', label: 'Coupons', icon: TicketPercent, id: 'coupons' },
  { href: '/superadmin/team', label: 'Owner team', icon: UsersRound, id: 'team' },
  { href: '/superadmin/tickets', label: 'Tickets', icon: LifeBuoy, id: 'tickets' },
  { href: '/superadmin/messages', label: 'Messages', icon: MessageSquare, id: 'messages' },
  { href: '/superadmin/website', label: 'Website & SEO', icon: Globe, id: 'website' },
  { href: '/superadmin/health', label: 'System Health', icon: HeartPulse, id: 'health' },
  { href: '/superadmin/audit', label: 'Audit Log', icon: ScrollText, id: 'audit' },
];

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name?: string; email?: string; modules?: any; ownerRole?: string } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_user');
      if (!raw) {
        router.replace('/login');
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed.role !== 'superadmin') {
        router.replace('/dashboard');
        return;
      }
      setUser(parsed);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    sessionStorage.removeItem('sc_user');
    sessionStorage.removeItem('sc_token');
    sessionStorage.removeItem('sc_owner_session');
    sessionStorage.removeItem('sc_dismissed_notifs');
    localStorage.removeItem('smart_calendar_auth_session');
    router.push('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {mobileOpen && (
        <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden" />
      )}
      <aside
        className={cn(
          'flex flex-col h-screen bg-slate-950 text-white border-r border-slate-800 shadow-sm transition-all duration-300 z-50',
          'fixed inset-y-0 left-0 md:static',
          mobileOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full md:translate-x-0',
          collapsed ? 'md:w-[72px]' : 'md:w-[240px]'
        )}
      >
        <div className={cn('flex items-center h-16 border-b border-slate-800 shrink-0', collapsed ? 'justify-center px-2' : 'justify-between px-3.5')}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center shadow-md shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="font-bold text-sm leading-none truncate">Owner Console</p>
                <p className="text-violet-300 text-[10px] font-mono font-bold mt-0.5 tracking-wider">SUPERADMIN</p>
              </div>
            )}
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <button onClick={() => setMobileOpen(false)} className="md:hidden p-1 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.filter((item) => hasModule(parseModules(user?.modules), item.id)).map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  active ? 'bg-violet-600 text-white shadow-md shadow-violet-900/40' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon className={cn('w-[18px] h-[18px] shrink-0', active ? 'text-amber-300' : 'text-slate-400')} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-800 p-3 space-y-2">
          {!collapsed && user && (
            <div className="px-2 py-2 rounded-lg bg-slate-900 border border-slate-800">
              <p className="text-[11px] font-bold text-white truncate">{user.name || 'Owner'}</p>
              <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
            </div>
          )}
          <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-300 hover:text-rose-400 hover:bg-rose-950/40 text-sm font-medium">
            <LogOut className="w-4 h-4" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-slate-100">
              <Shield className="w-5 h-5 text-violet-700" />
            </button>
            <div>
              <p className="text-sm font-bold text-slate-900">Application Owner</p>
              <p className="text-[11px] text-slate-500">Tenants, billing, coupons & platform health</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-3 py-1">
            <Sparkles className="w-3.5 h-3.5" />
            Trust Command Center
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50/80">
          <div className="max-w-[1600px] mx-auto p-3 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
