'use client';

import { useState, useEffect } from 'react';
import { Bell, Search, RefreshCw, Wifi } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface TopHeaderProps {
  schoolName?: string;
  userName?: string;
  userRole?: string;
  pendingSubstitutions?: number;
}

export function TopHeader({ schoolName, userName, userRole, pendingSubstitutions = 0 }: TopHeaderProps) {
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 shadow-sm">
      {/* Left: Page breadcrumb / greeting */}
      <div className="flex items-center gap-4">
        <div>
          <div className="text-xs text-slate-400 font-medium">{currentDate}</div>
          <div className="text-base font-bold text-slate-900 leading-tight">
            {schoolName || 'Smart Calendar'}
          </div>
        </div>
      </div>

      {/* Center: Search */}
      <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2 w-72">
        <Search className="w-4 h-4 text-slate-400" />
        <input
          className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none w-full"
          placeholder="Search teachers, schedules..."
        />
        <kbd className="text-[10px] bg-slate-200 text-slate-400 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </div>

      {/* Right: Clock, Alerts, Profile */}
      <div className="flex items-center gap-3">
        {/* Live connection status */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
          <Wifi className="w-3 h-3 animate-pulse" />
          <span className="font-semibold font-mono">{currentTime}</span>
        </div>

        {/* Notifications bell */}
        <button className="relative p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
          <Bell className="w-5 h-5" />
          {pendingSubstitutions > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {pendingSubstitutions > 9 ? '9+' : pendingSubstitutions}
            </span>
          )}
        </button>

        {/* Profile badge */}
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
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
