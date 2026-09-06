'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ImportIssueRow {
  row: number;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  slot: string;
}

export interface ImportReport {
  canImport: boolean;
  summary: {
    fileName: string;
    detectedFormat: string;
    rowsParsed: number;
    rowsValid: number;
    rowsRejected: number;
    willCreate: number;
    willReplace: number;
    unallocated: number;
    targetVersionName?: string | null;
  };
  errors: ImportIssueRow[];
  warnings: ImportIssueRow[];
  errorCount: number;
  warningCount: number;
  preview: { slot: string; subject: string; teacher: string | null; action: 'create' | 'replace' }[];
  message: string;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'bad' | 'warn' }) {
  const colour =
    tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 p-2.5 text-center">
      <p className={`text-lg font-black ${colour}`}>{value}</p>
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssueRow[]; tone: 'error' | 'warning' }) {
  if (!issues.length) return null;
  const isError = tone === 'error';
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${isError ? 'text-red-700' : 'text-amber-700'}`}>
        {title}
      </p>
      <div className={`rounded-xl border divide-y max-h-52 overflow-y-auto ${isError ? 'border-red-200 divide-red-100' : 'border-amber-200 divide-amber-100'}`}>
        {issues.map((issue, i) => (
          <div key={`${issue.row}-${issue.code}-${i}`} className={`p-2.5 ${isError ? 'bg-red-50/60' : 'bg-amber-50/60'}`}>
            <div className="flex items-start gap-2">
              {isError
                ? <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className={`text-[11px] font-semibold ${isError ? 'text-red-900' : 'text-amber-900'}`}>
                  Row {issue.row} · {issue.slot}
                </p>
                <p className={`text-[11px] ${isError ? 'text-red-800' : 'text-amber-800'}`}>{issue.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The confirm step of a timetable import.
 *
 * The whole file is parsed and validated before anything is written, and a file
 * with even one error cannot be committed - a timetable is never half-imported.
 */
export function ImportPreviewDialog({
  report,
  open,
  onOpenChange,
  onConfirm,
}: {
  report: ImportReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [importing, setImporting] = useState(false);

  const confirm = async () => {
    setImporting(true);
    try { await onConfirm(); } finally { setImporting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="import-preview-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            Review Import
          </DialogTitle>
        </DialogHeader>

        {report && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold text-slate-700 truncate">{report.summary.fileName}</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{report.summary.detectedFormat}</Badge>
                {report.summary.targetVersionName && (
                  <Badge variant="outline" className="text-[10px]">into: {report.summary.targetVersionName}</Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Rows read" value={report.summary.rowsParsed} />
              <Stat label="Valid" value={report.summary.rowsValid} tone="good" />
              <Stat label="Rejected" value={report.summary.rowsRejected} tone={report.summary.rowsRejected ? 'bad' : undefined} />
              <Stat label="Warnings" value={report.warningCount} tone={report.warningCount ? 'warn' : undefined} />
            </div>

            <div className={`flex items-start gap-2.5 p-3 rounded-xl border ${
              report.canImport ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
            }`}>
              {report.canImport
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
              <p className={`text-[11px] ${report.canImport ? 'text-emerald-900' : 'text-red-900'}`}>
                {report.message}
              </p>
            </div>

            <IssueList title={`${report.errorCount} error${report.errorCount === 1 ? '' : 's'} — these block the import`} issues={report.errors} tone="error" />
            <IssueList title={`${report.warningCount} warning${report.warningCount === 1 ? '' : 's'} — these still import`} issues={report.warnings} tone="warning" />

            {report.canImport && report.preview.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Preview — first {report.preview.length} of {report.summary.rowsValid}
                </p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {report.preview.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2.5">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-900 truncate">{p.slot}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {p.subject} · {p.teacher ?? 'unallocated'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${p.action === 'replace' ? 'border-amber-300 text-amber-800' : 'border-emerald-300 text-emerald-800'}`}
                      >
                        {p.action}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={confirm}
            disabled={!report?.canImport || importing}
            data-testid="confirm-import"
          >
            <Upload className="w-3.5 h-3.5" />
            {importing
              ? 'Importing…'
              : report?.canImport
                ? `Confirm Import (${report.summary.rowsValid})`
                : 'Fix errors to import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
