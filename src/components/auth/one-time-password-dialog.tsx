'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface IssuedPassword {
  label: string;
  password: string;
}

/**
 * Shows a password chosen on someone's behalf exactly once. It is not stored
 * anywhere readable; the account holder must replace it at first sign-in.
 */
export function OneTimePasswordDialog({ issued, onClose }: { issued: IssuedPassword | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(issued)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>
            Shown only once. Share it privately; the account must set a new password at first sign-in.
          </DialogDescription>
        </DialogHeader>
        {issued && (
          <div className="rounded-md border px-3 py-2 text-sm">
            <p className="text-xs text-slate-500">{issued.label}</p>
            <code className="font-mono text-base select-all">{issued.password}</code>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { if (issued) navigator.clipboard?.writeText(issued.password).catch(() => undefined); }}
          >
            Copy
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
