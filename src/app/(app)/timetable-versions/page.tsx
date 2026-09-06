'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  History, GitBranch, Loader2, CheckCircle2, Lock, FileText, ArrowUpCircle, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ValidationIssues } from '@/components/timetable/validation-issues';
import { UpgradePreview } from '@/components/timetable/upgrade-preview';

export const STATUS_STYLE: Record<string, string> = {
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
  academicTermId: string | null;
  createdAt: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  changeNotes: string | null;
  basedOnId: string | null;
  supersededById: string | null;
  rowCount: number;
  isCurrent: boolean;
  editable: boolean;
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');

export default function TimetableVersionsPage() {
  const { toast } = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [unversioned, setUnversioned] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);
  const [notes, setNotes] = useState('');
  // Adoption is restricted to platform owners (see lifecycle route).
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sc_user');
      if (raw) setIsOwner(JSON.parse(raw)?.role === 'superadmin');
    } catch {
      setIsOwner(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/timetable/lifecycle');
      const data = await res.json();
      if (res.ok && data.success) {
        setVersions(data.versions);
        setUnversioned(data.unversionedRows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (body: unknown, okMsg: string) => {
    setBusy('lifecycle');
    try {
      const res = await fetch('/api/timetable/lifecycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Not completed', description: data.error, variant: 'destructive' });
        return false;
      }
      toast({ title: okMsg, description: data.message });
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const transition = async (id: string, action: string) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/timetable/versions/${id}/workflow`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: `Cannot ${action}`, description: data.error, variant: 'destructive' });
        return;
      }
      toast({
        title: `Timetable ${data.version.status}`,
        description: data.superseded
          ? `v${data.version.version} is now published. v${data.superseded.version} was superseded.`
          : `Version moved to ${data.version.status}.`,
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const current = versions.find((v) => v.isCurrent);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" /> Timetable Version History
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            A published timetable is never edited in place. Create a revision, change it there, then approve and publish.
          </p>
        </div>
        {current && (
          <Button onClick={() => setReviseOpen(true)} disabled={busy !== null}>
            <GitBranch className="w-4 h-4 mr-2" /> Create Revision
          </Button>
        )}
      </div>

      {/* Publication is gated on errors, so they have to be visible here. */}
      <ValidationIssues versionId={current?.id ?? null} />

      {/* Preview only. Creating the clean revision is a separate, approved step. */}
      <UpgradePreview unversionedRows={unversioned} />

      {unversioned > 0 && isOwner && (
        <div className="flex items-start justify-between gap-4 p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-blue-900">
                {unversioned} timetable row(s) are not yet under version control
              </p>
              <p className="text-blue-800 mt-0.5">
                Adopt them into a first draft version to use approval and publishing.
              </p>
            </div>
          </div>
          <Button
            size="sm" variant="outline" disabled={busy !== null}
            onClick={() => post({ action: 'adopt', changeNotes: 'Adopted existing timetable rows.' }, 'Version created')}
          >
            Adopt into v1
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading version history…
        </div>
      ) : versions.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <History className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">No timetable versions yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Generate a timetable, then adopt it into a version to begin the approval workflow.
          </p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <Card key={v.id} className={v.isCurrent ? 'border-emerald-300 shadow-sm' : ''}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">
                      {v.name} <span className="text-slate-400">v{v.version}</span>
                    </CardTitle>
                    <Badge variant="outline" className={STATUS_STYLE[v.status] ?? ''}>
                      {v.status}
                    </Badge>
                    {v.isCurrent && (
                      <Badge className="bg-emerald-600 text-white">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Current active version
                      </Badge>
                    )}
                    {!v.editable && v.status !== 'published' && (
                      <Badge variant="outline" className="text-slate-500">
                        <Lock className="w-3 h-3 mr-1" /> locked
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{v.rowCount} rows</span>
                    {v.status === 'draft' && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy !== null}
                          onClick={() => transition(v.id, 'submit')}>Submit for review</Button>
                        <Button size="sm" variant="outline" disabled={busy !== null}
                          onClick={() => transition(v.id, 'approve')}>Approve</Button>
                      </>
                    )}
                    {v.status === 'review' && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy !== null}
                          onClick={() => transition(v.id, 'reject')}>Send back to draft</Button>
                        <Button size="sm" disabled={busy !== null}
                          onClick={() => transition(v.id, 'approve')}>Approve</Button>
                      </>
                    )}
                    {v.status === 'approved' && (
                      <Button size="sm" disabled={busy !== null} onClick={() => transition(v.id, 'publish')}>
                        <ArrowUpCircle className="w-4 h-4 mr-1" /> Publish
                      </Button>
                    )}
                    {busy === v.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                  <div><span className="text-slate-500">Created</span><br />
                    <span className="text-slate-800">{fmt(v.createdAt)}</span></div>
                  <div><span className="text-slate-500">Created by</span><br />
                    <span className="text-slate-800">{v.createdBy || '—'}</span></div>
                  <div><span className="text-slate-500">Approved by</span><br />
                    <span className="text-slate-800">{v.approvedBy || '—'}</span></div>
                  <div><span className="text-slate-500">Published</span><br />
                    <span className="text-slate-800">{fmt(v.publishedAt)}</span></div>
                </div>
                {(v.changeNotes || v.basedOnId || v.supersededById) && (
                  <div className="mt-3 pt-3 border-t space-y-1 text-xs">
                    {v.changeNotes && (
                      <p className="flex items-start gap-2 text-slate-600">
                        <FileText className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                        {v.changeNotes}
                      </p>
                    )}
                    {v.basedOnId && (
                      <p className="text-slate-500">
                        Revision of v{versions.find((x) => x.id === v.basedOnId)?.version ?? '?'}
                      </p>
                    )}
                    {v.supersededById && (
                      <p className="text-slate-500">
                        Superseded by v{versions.find((x) => x.id === v.supersededById)?.version ?? '?'}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={reviseOpen} onOpenChange={setReviseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a revision</DialogTitle>
            <DialogDescription>
              Copies the published timetable {current ? `(v${current.version})` : ''} into a new draft.
              The published version keeps serving unchanged until you publish the revision.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Change notes</Label>
            <Input
              autoFocus placeholder="e.g. Term 2 staffing changes"
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviseOpen(false)}>Cancel</Button>
            <Button
              disabled={busy !== null}
              onClick={async () => {
                const ok = await post({ action: 'revise', changeNotes: notes }, 'Revision created');
                if (ok) { setReviseOpen(false); setNotes(''); }
              }}
            >
              <GitBranch className="w-4 h-4 mr-2" /> Create revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
