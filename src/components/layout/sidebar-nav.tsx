'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, CalendarDays, Users, RefreshCw, BarChart3,
  BookOpen, Building2, GraduationCap, FileText, Settings,
  Fingerprint, ClipboardList, Brain, ChevronLeft, ChevronRight,
  LogOut, Sparkles, Zap, X, User
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { hasModule, parseModules } from '@/lib/access';

const navSections = [
  {
    title: 'Core Engine',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null, module: 'dashboard' },
      { href: '/timetable', label: 'Timetable Studio', icon: CalendarDays, badge: 'AI', module: 'timetable' },
      { href: '/substitutions', label: 'Substitutions', icon: RefreshCw, badge: null, module: 'substitutions' },
      { href: '/leaves', label: 'AI Leave Management', icon: ClipboardList, badge: 'AI', module: 'leaves' },
    ]
  },
  {
    title: 'Directory & Ops',
    items: [
      { href: '/teachers', label: 'Faculty Directory', icon: Users, badge: null, module: 'teachers' },
      { href: '/attendance', label: 'Biometric Attendance', icon: Fingerprint, badge: null, module: 'attendance' },
      { href: '/rooms', label: 'Rooms & Facilities', icon: Building2, badge: null, module: 'rooms' },
      { href: '/calendar', label: 'Academic Calendar', icon: CalendarDays, badge: null, module: 'calendar' },
      { href: '/support', label: 'Support & Tickets', icon: FileText, badge: null, module: 'support' },
      { href: '/settings', label: 'School Settings', icon: Settings, badge: null, module: 'settings' },
    ]
  }
];

const ownerNav = { href: '/superadmin', label: 'Owner Console', icon: Sparkles, badge: 'SA' };

interface SidebarNavProps {
  schoolName?: string;
  schoolCode?: string;
  userRole?: string;
  modules?: string[] | string;
  onLogout?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function SidebarNav({
  schoolName,
  schoolCode,
  userRole,
  modules,
  onLogout,
  mobileOpen = false,
  onCloseMobile,
}: SidebarNavProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const allowed = parseModules(modules);

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
        />
      )}

      <aside
        className={cn(
          'flex flex-col h-screen bg-white border-r border-slate-200 shadow-sm transition-all duration-300 ease-in-out select-none overflow-hidden z-50',
          'fixed inset-y-0 left-0 md:static md:z-auto',
          mobileOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full md:translate-x-0',
          collapsed ? 'md:w-[72px]' : 'md:w-[240px]'
        )}
      >
        {/* Logo & School Brand + Top Collapse Icon */}
        <div className={cn(
          "flex items-center h-16 border-b border-slate-100 shrink-0 bg-slate-50/50 transition-all",
          collapsed && !mobileOpen ? "justify-center px-2 gap-1" : "justify-between px-3.5"
        )}>
          <div
            onClick={() => collapsed && setCollapsed(false)}
            className={cn("flex items-center gap-2.5 min-w-0", collapsed && !mobileOpen && "cursor-pointer")}
            title={collapsed ? "Click to expand sidebar" : undefined}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <Brain className="w-5 h-5 text-white" />
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0">
                <p className="text-slate-900 font-bold text-sm leading-none truncate">
                  {schoolName || 'Smart Calendar'}
                </p>
                <p className="text-blue-600 text-[10px] font-mono font-bold mt-0.5 tracking-wider">
                  {schoolCode || 'AI PLATFORM'}
                </p>
              </div>
            )}
          </div>

          {/* Top Collapse Symbol (Icon only, no text label) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-all shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4 text-blue-600 font-bold" /> : <ChevronLeft className="w-4 h-4 text-slate-600" />}
          </button>

          {/* Close button for mobile */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav Sections */}
        <nav className="flex-1 overflow-y-auto sidebar-scroll py-4 space-y-5 px-3">
          {navSections.map((section) => {
            const items = section.items.filter((item) => hasModule(allowed, item.module));
            if (items.length === 0) return null;
            return (
            <div key={section.title}>
              {(!collapsed || mobileOpen) && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      title={collapsed && !mobileOpen ? item.label : undefined}
                      className={cn(
                        'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group overflow-hidden',
                        isActive
                          ? 'bg-gradient-to-r from-blue-600 via-indigo-700 to-slate-900 text-white font-bold shadow-md shadow-blue-500/20'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      )}
                    >
                      <Icon className={cn(
                        'w-[18px] h-[18px] shrink-0',
                        isActive ? 'text-amber-300' : 'text-slate-500 group-hover:text-blue-600'
                      )} />

                      {(!collapsed || mobileOpen) && (
                        <>
                          <span className="truncate flex-1">{item.label}</span>
                          {item.badge && (
                            <Badge className={cn(
                              'ml-auto text-[9px] py-0 px-1.5 font-bold',
                              isActive ? 'bg-amber-400 text-slate-950 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-200'
                            )}>
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
            );
          })}
        </nav>

        {/* Footer: Role & Logout */}
        <div className="shrink-0 border-t border-slate-100 p-3 space-y-2 bg-slate-50/50">
          {userRole === 'superadmin' && (
            <Link
              href={ownerNav.href}
              onClick={onCloseMobile}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-violet-800 bg-violet-50 hover:bg-violet-100 text-sm font-bold"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              {(!collapsed || mobileOpen) && <span>{ownerNav.label}</span>}
            </Link>
          )}
          <Link
            href="/profile"
            onClick={onCloseMobile}
            title="My profile"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-all text-sm font-medium"
          >
            <User className="w-4 h-4 shrink-0" />
            {(!collapsed || mobileOpen) && <span>My profile</span>}
          </Link>
          {(!collapsed || mobileOpen) && userRole && (
            <div className="px-2 mb-1">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 font-bold">
                <Zap className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span className="text-[11px] capitalize">{userRole}</span>
              </div>
            </div>
          )}
          {onLogout && (
            <button
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                onLogout();
              }}
              title="Sign Out"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-all text-sm font-medium"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {(!collapsed || mobileOpen) && <span>Sign Out</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
