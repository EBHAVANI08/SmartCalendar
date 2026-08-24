'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, CalendarDays, Users, RefreshCw, BarChart3,
  BookOpen, Building2, GraduationCap, FileText, Settings,
  Fingerprint, ClipboardList, Brain, ChevronLeft, ChevronRight,
  LogOut, Sparkles, Bell, Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const navSections = [
  {
    title: 'Main',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: null, glow: 'emerald' },
      { href: '/timetable', label: 'Timetable Studio', icon: CalendarDays, badge: 'AI', glow: 'teal' },
      { href: '/substitutions', label: 'Substitutions', icon: RefreshCw, badge: null, glow: 'amber' },
    ]
  },
  {
    title: 'People',
    items: [
      { href: '/teachers', label: 'Faculty', icon: Users, badge: null, glow: 'blue' },
      { href: '/leaves', label: 'Leave Management', icon: ClipboardList, badge: null, glow: 'rose' },
    ]
  },
  {
    title: 'Insights',
    items: [
      { href: '/analytics', label: 'Analytics & BI', icon: BarChart3, badge: null, glow: 'cyan' },
      { href: '/attendance', label: 'Biometric Attendance', icon: Fingerprint, badge: null, glow: 'emerald' },
      { href: '/lesson-plans', label: 'AI Lesson Plans', icon: Brain, badge: 'AI', glow: 'purple' },
    ]
  },
  {
    title: 'Operations',
    items: [
      { href: '/rooms', label: 'Rooms & Facilities', icon: Building2, badge: null, glow: 'slate' },
      { href: '/calendar', label: 'Academic Calendar', icon: CalendarDays, badge: null, glow: 'indigo' },
      { href: '/settings', label: 'School Settings', icon: Settings, badge: null, glow: 'slate' },
    ]
  }
];

interface SidebarNavProps {
  schoolName?: string;
  schoolCode?: string;
  userRole?: string;
  onLogout?: () => void;
}

export function SidebarNav({ schoolName, schoolCode, userRole, onLogout }: SidebarNavProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-slate-950 border-r border-slate-800/60 transition-all duration-300 ease-in-out select-none overflow-hidden',
        collapsed ? 'w-[72px]' : 'w-[240px]'
      )}
    >
      {/* Logo & School Brand */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-800/60 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
          <Brain className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none truncate">
              {schoolName || 'Smart Calendar'}
            </p>
            <p className="text-emerald-400 text-[10px] font-mono mt-0.5 tracking-wider">
              {schoolCode || 'AI PLATFORM'}
            </p>
          </div>
        )}
      </div>

      {/* Nav Sections */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll py-4 space-y-5 px-2">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group overflow-hidden',
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                    )}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-r-full" />
                    )}

                    <Icon className={cn(
                      'w-[18px] h-[18px] shrink-0',
                      isActive ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-300'
                    )} />

                    {!collapsed && (
                      <>
                        <span className="truncate flex-1">{item.label}</span>
                        {item.badge && (
                          <Badge className="ml-auto text-[9px] py-0 px-1.5 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-bold">
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
        ))}
      </nav>

      {/* Footer: Role, Logout, Collapse */}
      <div className="shrink-0 border-t border-slate-800/60 p-3 space-y-2">
        {!collapsed && userRole && (
          <div className="px-2 mb-2">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] text-slate-400 capitalize">{userRole}</span>
            </div>
          </div>
        )}
        {onLogout && (
          <button
            onClick={onLogout}
            title="Sign Out"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all text-sm"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
