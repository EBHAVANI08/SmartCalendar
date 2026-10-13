'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, RotateCcw, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { undoAutoFix, type AutoFixEntry } from '@/components/school-setup/autofix-panel';

/**
 * Tier 2 automatic fixes the admin has not reviewed yet (e.g. "Grade X reduced
 * from A → B periods"), with Undo, Review and Dismiss. Renders nothing when
 * there are none or the viewer cannot read school settings.
 */
export function AutoFixNotices({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [notices, setNotices] = useState<AutoFixEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

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

  const dismiss = async (id: string) => {
    setBusy(id);
    await fetch('/api/school/autofix/acknowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null);
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
    <div className="space-y-2" role="status">
      {notices.map((notice) => (
        <div key={notice.id} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3">
          <Wand2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="flex-1 min-w-0 text-xs text-amber-950 break-words">{notice.summary}</p>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => undo(notice.id)}>
              {busy === notice.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RotateCcw className="w-3.5 h-3.5 mr-1" /> Undo</>}
            </Button>
            <Button asChild variant="outline" size="sm" className="h-7 text-xs">
              <Link href="/settings?tab=timetable&sub=subjects">Review</Link>
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Dismiss" disabled={busy !== null} onClick={() => dismiss(notice.id)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
