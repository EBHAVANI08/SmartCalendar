'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell, Search, Wifi, Menu, CheckCircle2, AlertTriangle,
  UserX, Calendar, Clock, Sparkles, Check, ExternalLink,
  Filter, Layers, ArrowRight, ShieldCheck, X, User, Settings, LogOut
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TopHeaderProps {
  schoolName?: string;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  pendingSubstitutions?: number;
  onToggleMobile?: () => void;
  onLogout?: () => void;
}

interface NotificationItem {
  id: string;
  category: 'substitution' | 'leave' | 'attendance' | 'system';
  title: string;
  description: string;
  time: string;
  isUnread: boolean;
  priority: 'high' | 'medium' | 'info';
  actionUrl?: string;
  actionLabel?: string;
}

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    category: 'substitution',
    title: 'Absentee Coverage Required Today',
    description: '3 faculty members marked absent in biometric scan. 6 class periods need substitution.',
    time: '10 mins ago',
    isUnread: true,
    priority: 'high',
    actionUrl: '/substitutions',
    actionLabel: 'Assign Substitutes',
  },
  {
    id: 'notif-2',
    category: 'attendance',
    title: 'Biometric Attendance Sync Complete',
    description: 'Morning faculty biometric punch synced: 42 present, 8 absent / on leave.',
    time: '25 mins ago',
    isUnread: true,
    priority: 'medium',
    actionUrl: '/attendance',
    actionLabel: 'View Attendance',
  },
  {
    id: 'notif-3',
    category: 'leave',
    title: 'Pending Faculty Leave Request',
    description: 'Priya Verma (Science) applied for Casual Leave for tomorrow (Period 3–5).',
    time: '1 hour ago',
    isUnread: true,
    priority: 'medium',
    actionUrl: '/leaves',
    actionLabel: 'Review Request',
  },
  {
    id: 'notif-4',
    category: 'system',
    title: 'Weekly Master Timetable Active',
    description: '45 periods standard timetable configured for Takshila School (8 Mon–Fri + 5 Sat).',
    time: '2 hours ago',
    isUnread: false,
    priority: 'info',
    actionUrl: '/timetable',
    actionLabel: 'View Timetable',
  },
  {
    id: 'notif-5',
    category: 'substitution',
    title: 'AI Auto-Substitution Ready',
    description: 'AI engine generated optimal conflict-free substitution plan for today’s absentees.',
    time: '3 hours ago',
    isUnread: false,
    priority: 'info',
    actionUrl: '/substitutions',
    actionLabel: 'Review AI Plan',
  },
];

export function TopHeader({
  schoolName,
  userName,
  userRole,
  userEmail,
  pendingSubstitutions = 0,
  onToggleMobile,
  onLogout,
}: TopHeaderProps) {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(DEFAULT_NOTIFICATIONS);
  const [activeFilter, setActiveFilter] = useState<'all' | 'substitution' | 'leave' | 'system'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Fetch real notifications if available
  useEffect(() => {
    const fetchLiveNotifications = async () => {
      try {
        const res = await fetch('/api/notifications/admin');
        if (res.ok) {
          const json = await res.json();
          if (json.data && Array.isArray(json.data) && json.data.length > 0) {
            const mapped: NotificationItem[] = json.data.map((n: any, idx: number) => ({
              id: n.id || `live-${idx}`,
              category: n.type === 'leave' ? 'leave' : n.type === 'substitution' ? 'substitution' : 'system',
              title: n.title || 'School Update',
              description: n.description || n.message || 'Notification details',
              time: 'Just now',
              isUnread: !n.isRead,
              priority: n.type === 'substitution' ? 'high' : 'medium',
              actionUrl: n.type === 'leave' ? '/leaves' : n.type === 'substitution' ? '/substitutions' : '/dashboard',
              actionLabel: 'View Details',
            }));
            // Combine with default alerts
            setNotifications([...mapped, ...DEFAULT_NOTIFICATIONS]);
          }
        }
      } catch {
        // Fallback to initial defaults
      }
    };
    fetchLiveNotifications();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    if (notificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [notificationsOpen]);

  const unreadCount = notifications.filter((n) => n.isUnread).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
  };

  const markAsRead = (id: string, actionUrl?: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isUnread: false } : n)));
    if (actionUrl) {
      setNotificationsOpen(false);
      router.push(actionUrl);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'substitution') return n.category === 'substitution' || n.category === 'attendance';
    return n.category === activeFilter;
  });

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-xs z-30 relative">
      {/* Left: Mobile Hamburger & Page breadcrumb / greeting */}
      <div className="flex items-center gap-3">
        {onToggleMobile && (
          <button
            onClick={onToggleMobile}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            title="Toggle Mobile Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div>
          <div className="text-[11px] text-slate-400 font-medium hidden sm:block">{currentDate}</div>
          <div className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate max-w-[180px] sm:max-w-none">
            {schoolName || 'Smart Calendar'}
          </div>
        </div>
      </div>

      {/* Center: Search */}
      <div className="hidden lg:flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2 w-72">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none w-full"
          placeholder="Search teachers, schedules..."
        />
        <kbd className="text-[10px] bg-slate-200 text-slate-400 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </div>

      {/* Right: Clock, Alerts, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live connection status */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
          <Wifi className="w-3 h-3 text-blue-600 animate-pulse" />
          <span className="font-semibold font-mono">{currentTime}</span>
        </div>

        {/* Interactive Notifications bell with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            id="notification-bell-btn"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={`relative p-2 rounded-xl transition-all border ${
              notificationsOpen
                ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-600 border-transparent hover:text-slate-900'
            }`}
            title="School Notifications & Alerts"
            aria-label="Open Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs border-2 border-white animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* ── Notification Dropdown Center ── */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2.5 w-[380px] sm:w-[440px] max-w-[95vw] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header */}
              <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
                    <Bell className="w-4 h-4 text-blue-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Notifications & Alerts</h4>
                    <p className="text-[10px] text-blue-200">{unreadCount} unread actionable item{unreadCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      className="text-[10px] font-semibold text-blue-200 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-md transition-colors flex items-center gap-1 border border-white/15"
                    >
                      <Check className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setNotificationsOpen(false)}
                    className="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Category Filter Tabs */}
              <div className="px-3 pt-2.5 pb-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-[11px] font-semibold">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeFilter === 'all'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setActiveFilter('substitution')}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                    activeFilter === 'substitution'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <span>Substitutions</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </button>
                <button
                  onClick={() => setActiveFilter('leave')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeFilter === 'leave'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  Leaves
                </button>
                <button
                  onClick={() => setActiveFilter('system')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    activeFilter === 'system'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  System
                </button>
              </div>

              {/* Notifications List Body */}
              <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 p-1">
                {filteredNotifications.length === 0 ? (
                  <div className="py-10 text-center text-slate-400">
                    <ShieldCheck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-xs font-semibold">No notifications in this category</p>
                  </div>
                ) : (
                  filteredNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => markAsRead(notif.id)}
                      className={`p-3 rounded-xl transition-all cursor-pointer flex gap-3 ${
                        notif.isUnread ? 'bg-blue-50/60 hover:bg-blue-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      {/* Icon */}
                      <div className="shrink-0 mt-0.5">
                        {notif.category === 'substitution' && (
                          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200 shadow-xs">
                            <UserX className="w-4 h-4" />
                          </div>
                        )}
                        {notif.category === 'attendance' && (
                          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200 shadow-xs">
                            <Clock className="w-4 h-4" />
                          </div>
                        )}
                        {notif.category === 'leave' && (
                          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center border border-indigo-200 shadow-xs">
                            <Calendar className="w-4 h-4" />
                          </div>
                        )}
                        {notif.category === 'system' && (
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200 shadow-xs">
                            <Layers className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <h5 className={`text-xs font-bold leading-snug truncate ${notif.isUnread ? 'text-slate-900' : 'text-slate-700'}`}>
                            {notif.title}
                          </h5>
                          {notif.isUnread && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2 leading-relaxed">
                          {notif.description}
                        </p>
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100/80">
                          <span className="text-[10px] text-slate-400 font-medium">{notif.time}</span>
                          {notif.actionUrl && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notif.id, notif.actionUrl);
                              }}
                              className="text-[10px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 hover:underline"
                            >
                              <span>{notif.actionLabel || 'View'}</span>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer Quick Links */}
              <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNotificationsOpen(false);
                    router.push('/substitutions');
                  }}
                  className="h-8 text-[11px] font-bold flex-1 gap-1 border-slate-200 hover:bg-amber-50 hover:text-amber-900"
                >
                  <UserX className="w-3.5 h-3.5 text-amber-600" /> Substitution Engine
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNotificationsOpen(false);
                    router.push('/attendance');
                  }}
                  className="h-8 text-[11px] font-bold flex-1 gap-1 border-slate-200 hover:bg-blue-50 hover:text-blue-900"
                >
                  <Clock className="w-3.5 h-3.5 text-blue-600" /> Biometric Attendance
                </Button>
              </div>
            </div>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200 hover:opacity-90">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm shadow-md">
                {(userName || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-slate-800 leading-none">{userName || 'User'}</p>
                <p className="text-[10px] text-slate-400 capitalize mt-0.5">{userRole || 'admin'}</p>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="px-2 py-2 border-b border-slate-100 mb-1">
              <p className="text-sm font-bold truncate">{userName}</p>
              <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>
            </div>
            <Link href="/profile" className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-slate-100">
              <User className="w-4 h-4 text-slate-500" /> My profile
            </Link>
            <Link href="/settings" className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-slate-100">
              <Settings className="w-4 h-4 text-slate-500" /> School settings
            </Link>
            {onLogout && (
              <button onClick={onLogout} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-rose-600 hover:bg-rose-50">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
