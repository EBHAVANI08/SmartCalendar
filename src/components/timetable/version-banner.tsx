'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Lock, GitBranch, History, Loader2, PencilLine, Send, CheckCircle2, ArrowUpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-300',
  review: 'bg-amber-50 text-amber-700 border-amber-300',
  approved: 'bg-indigo-50 text-indigo-700 border-indigo-300',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  superseded: 'bg-slate-50 text-slate-500 border-slate-200',
  archived: 'bg-slate-50 text-slate-400 border-slate-200',
};

interface Version {
  id: string;
  version: number;
  name: string;
  status: string;
  rowCount: number;
  isCurrent: boolean;
  editable: boolean;
}

/**
 * Shows which timetable version the studio is looking at and whether it can be
 * edited. A published timetable is the official one and is never edited in
 * place - the only route to a permanent change is a revision.
 */
export function VersionBanner({ onChanged }: { onChanged?: () => void }) {
  // Adoption is a platform-owner action; school admins never see the control.
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_user');
      if (raw) setIsOwner(JSON.parse(raw)?.role === 'superadmin');
    } catch {
      setIsOwner(false);
    }
  }, []);

  const [versions, setVersions] = useState<Version[]>([]);
  const [unversioned, setUnversioned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/timetable/lifecycle');
      const data = await res.json();
      if (res.ok && data.success) {
        setVersions(data.versions);
        setUnversioned(data.unversionedRows);
      }
    } catch {
      /* the studio still works without version context */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Move the active version through the lifecycle from inside the Studio. */
  const transition = async (id: string, action: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/timetable/versions/${id}/workflow`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || `Cannot ${action}.`); return; }
      setError(null);
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const act = async (body: unknown) => {
    setBusy(true);
    try {
      await fetch('/api/timetable/lifecycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  const active = versions.find((v) => v.isCurrent) ?? versions.find((v) => v.editable) ?? versions[0];

  // Nothing under version control yet - offer to adopt.
  if (!active) {
    if (unversioned === 0 || !isOwner) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 mb-5 rounded-xl bg-slate-50 border border-slate-200">
        <p className="text-sm text-slate-700">
          <strong>{unversioned}</strong> timetable rows are not under version control yet.
        </p>
        <Button size="sm" variant="outline" disabled={busy}
          onClick={() => act({ action: 'adopt', changeNotes: 'Adopted existing timetable rows.' })}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
          Adopt into v1 (draft)
        </Button>
      </div>
    );
  }

  const locked = !active.editable;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 mb-5 rounded-xl border ${
        locked ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <span className="text-sm font-semibold text-slate-900">
          {active.name} <span className="text-slate-400">v{active.version}</span>
        </span>
        <Badge variant="outline" className={STATUS_STYLE[active.status] ?? ''}>
          {active.status}
        </Badge>
        <span className="text-xs text-slate-500">{active.rowCount} slots</span>
        {locked ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-800">
            <Lock className="w-3.5 h-3.5" /> Published — direct editing is disabled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600">
            <PencilLine className="w-3.5 h-3.5" /> Draft — edits allowed
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {active.status === 'draft' && (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => transition(active.id, 'submit')}>
              <Send className="w-3.5 h-3.5 mr-2" /> Submit for Review
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => transition(active.id, 'approve')}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Approve
            </Button>
          </>
        )}
        {active.status === 'review' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => transition(active.id, 'approve')}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Approve
          </Button>
        )}
        {active.status === 'approved' && (
          <Button size="sm" disabled={busy} data-testid="publish-timetable" onClick={() => transition(active.id, 'publish')}>
            <ArrowUpCircle className="w-3.5 h-3.5 mr-2" /> Publish
          </Button>
        )}
        {locked && (
          <Button size="sm" variant="outline" disabled={busy}
            data-testid="create-revision" onClick={() => act({ action: 'revise', changeNotes: `Revision of v${active.version}` })}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <GitBranch className="w-3.5 h-3.5 mr-2" />}
            Create Revision
          </Button>
        )}
        <Link href="/timetable-versions">
          <Button size="sm" variant="ghost" className="text-slate-600">
            <History className="w-3.5 h-3.5 mr-2" /> Version History
          </Button>
        </Link>
      </div>

      {error && (
        <p className="w-full text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
