'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2, RotateCcw, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RULE_LABELS, undoAutoFix, type AutoFixEntry } from '@/components/school-setup/autofix-panel';

/**
 * Tier 2 automatic fixes the admin has not reviewed yet, shown as ONE short
 * card grouped by kind ("Room type not available · 20"). Details, Undo and
 * Dismiss open on request, so a school with many fixes does not get a wall of
 * banners. Renders nothing when there are none or the viewer cannot read
 * school settings.
 */

/** Per kind: one explanation for the whole group, where to fix it, and a short line per item. */
const GROUP_INFO: Record<string, { help?: string; href: string; short?: (summary: string) => string | null }> = {
  room_type_missing: {
    help: 'These subjects need a room your school has not added, so they now use an ordinary classroom. Add the room in Rooms, then Undo the item to bring the requirement back.',
    href: '/settings?tab=timetable&sub=rooms',
    short: (summary) => {
      const match = /^(.+?) requires room type "(.+?)"/.exec(summary);
      return match ? `${match[1]} — needs “${match[2]}”` : null;
    },
  },
};
const DEFAULT_HREF = '/settings?tab=timetable&sub=subjects';

export function AutoFixNotices({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [notices, setNotices] = useState<AutoFixEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/school/autofix?notices=1');
      if (!res.ok) return setNotices([]);
      const data = await res.json();
      setNotices(Array.isArray(data.fixes) ? data.fixes : []);
    } catch {
      setNotices([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const byRule = new Map<string, AutoFixEntry[]>();
    for (const notice of notices) byRule.set(notice.rule, [...(byRule.get(notice.rule) ?? []), notice]);
    return [...byRule.entries()].map(([rule, items]) => ({ rule, label: RULE_LABELS[rule] ?? rule, items, ...(GROUP_INFO[rule] ?? { href: DEFAULT_HREF }) }));
  }, [notices]);

  const dismiss = async (ids: string[], key: string) => {
    setBusy(key);
    await fetch('/api/school/autofix/acknowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => null);
    setBusy(null);
    load();
  };

  const undo = async (id: string) => {
    setBusy(id);
    const result = await undoAutoFix(id);
    setBusy(null);
    toast(result.ok
      ? { title: 'Fix undone', description: 'The previous values are back.' }
      : { title: 'Not undone', description: result.error, variant: 'destructive' });
    load();
    onChanged?.();
  };

  if (!notices.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/80" role="status">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Wand2 className="w-4 h-4 text-amber-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-950">
            {notices.length} automatic setup {notices.length === 1 ? 'change needs' : 'changes need'} your review
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {groups.map((group) => (
              <span key={group.rule} className="rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 text-[11px] text-amber-900">
                {group.label} · {group.items.length}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? 'Hide details' : 'Show details'}
            <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => dismiss(notices.map((notice) => notice.id), 'all')}>
            {busy === 'all' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Mark all as seen'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="max-h-96 overflow-y-auto border-t border-amber-200 px-3 pb-3">
          {groups.map((group) => (
            <section key={group.rule} className="pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex-1 text-xs font-semibold text-amber-950">{group.label} ({group.items.length})</h3>
                <Button asChild variant="outline" size="sm" className="h-6 text-[11px]">
                  <Link href={group.href}>Fix in School Setup</Link>
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-[11px]" disabled={busy !== null} onClick={() => dismiss(group.items.map((item) => item.id), group.rule)}>
                  {busy === group.rule ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Mark these as seen'}
                </Button>
              </div>
              {group.help && <p className="mt-1 text-[11px] text-amber-900/80">{group.help}</p>}
              <ul className="mt-2 divide-y divide-amber-200/70 rounded-xl border border-amber-200 bg-white/60">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="flex-1 min-w-0 text-xs text-amber-950 break-words" title={item.summary}>
                      {group.short?.(item.summary) ?? item.summary}
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" disabled={busy !== null} onClick={() => undo(item.id)}>
                      {busy === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RotateCcw className="w-3 h-3 mr-1" /> Undo</>}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label="Mark as seen" disabled={busy !== null} onClick={() => dismiss([item.id], item.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
