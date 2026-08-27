'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Search, Wifi, Menu, User, Settings, LogOut, CheckCheck, RefreshCw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Link from 'next/link';
import { getClientAuthHeaders } from '@/lib/client-session';

interface TopHeaderProps {
  schoolName?: string;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  pendingSubstitutions?: number;
  onToggleMobile?: () => void;
  onLogout?: () => void;
}

type InboxItem = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  href: string;
  isRead: boolean;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function TopHeader({
  schoolName,
  userName,
  userRole,
  userEmail,
  pendingSubstitutions = 0,
  onToggleMobile,
  onLogout,
}: TopHeaderProps) {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const dismissedRef = useRef<string[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_dismissed_notifs');
      if (raw) {
        const parsed = JSON.parse(raw);
        setDismissed(parsed);
        dismissedRef.current = parsed;
      }
    } catch {}
  }, []);

  const rememberDismissed = (ids: string[]) => {
    const next = Array.from(new Set([...dismissedRef.current, ...ids]));
    dismissedRef.current = next;
    setDismissed(next);
    try { sessionStorage.setItem('sc_dismissed_notifs', JSON.stringify(next)); } catch {}
  };

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

  const loadInbox = async () => {
    setLoadingInbox(true);
    try {
      const r = await fetch('/api/notifications/inbox', {
        headers: getClientAuthHeaders(),
        credentials: 'include',
      });
      const d = await r.json();
      const list = (d.items || []).map((item: InboxItem) =>
        dismissedRef.current.includes(item.id) ? { ...item, isRead: true } : item
      );
      setItems(list);
      setUnread(list.filter((i: InboxItem) => !i.isRead).length);
    } catch {
      setItems([]);
      setUnread(pendingSubstitutions);
    } finally {
      setLoadingInbox(false);
    }
  };

  useEffect(() => {
    loadInbox();
    const id = setInterval(loadInbox, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = unread;

  const openItem = async (item: InboxItem) => {
    await fetch('/api/notifications/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ id: item.id }),
    });
    rememberDismissed([item.id]);
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, isRead: true } : x)));
    setUnread((n) => Math.max(0, n - (item.isRead ? 0 : 1)));
    setNotifOpen(false);
    router.push(item.href);
  };

  const markAll = async () => {
    await fetch('/api/notifications/inbox', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
      credentials: 'include',
      body: JSON.stringify({ markAllRead: true }),
    });
    rememberDismissed(items.map((i) => i.id));
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-sm z-30">
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

      <div className="hidden lg:flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2 w-72">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none w-full"
          placeholder="Search teachers, schedules..."
        />
        <kbd className="text-[10px] bg-slate-200 text-slate-400 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
          <Wifi className="w-3 h-3 text-blue-600 animate-pulse" />
          <span className="font-semibold font-mono">{currentTime}</span>
        </div>

        <Popover open={notifOpen} onOpenChange={(open) => { setNotifOpen(open); if (open) loadInbox(); }}>
          <PopoverTrigger asChild>
            <button className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors" aria-label="Notifications">
              <Bell className="w-5 h-5" />
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[360px] p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <p className="font-bold text-sm">Notifications</p>
                <p className="text-[10px] text-slate-400">{unread} unread</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={loadInbox} className="text-slate-400 hover:text-slate-700" title="Refresh">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingInbox ? 'animate-spin' : ''}`} />
                </button>
                {unread > 0 && (
                  <button onClick={markAll} className="text-[11px] font-semibold text-blue-700 flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {items.length === 0 && (
                <p className="text-sm text-slate-500 p-6 text-center">You are all caught up. New substitutions, leaves, and owner alerts will appear here.</p>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openItem(item)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 ${item.isRead ? '' : 'bg-blue-50/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">{item.title}</p>
                    {!item.isRead && <span className="mt-1 w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                  </div>
                  {item.body && <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-2">{item.body}</p>}
                  <p className="text-[10px] text-slate-400 mt-1 capitalize">{item.type} · {timeAgo(item.createdAt)}</p>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

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
