'use client';

import { useState, useEffect } from 'react';
import { Bell, Search, RefreshCw, Wifi, Menu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface TopHeaderProps {
  schoolName?: string;
  userName?: string;
  userRole?: string;
  pendingSubstitutions?: number;
  onToggleMobile?: () => void;
}

export function TopHeader({
  schoolName,
  userName,
  userRole,
  pendingSubstitutions = 0,
  onToggleMobile,
}: TopHeaderProps) {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

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

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-sm z-30">
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

        {/* Notifications bell */}
        <button className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
          <Bell className="w-5 h-5" />
          {pendingSubstitutions > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {pendingSubstitutions > 9 ? '9+' : pendingSubstitutions}
            </span>
          )}
        </button>

        {/* Profile badge */}
        <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-sm shadow-md">
            {(userName || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold text-slate-800 leading-none">{userName || 'User'}</p>
            <p className="text-[10px] text-slate-400 capitalize mt-0.5">{userRole || 'admin'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
