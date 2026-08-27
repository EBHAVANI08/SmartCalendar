'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { OWNER_MODULES, OWNER_ROLE_MODULES } from '@/lib/access';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export default function OwnerTeamPage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: 'Demo@2026', role: 'demo', isDemo: true,
    modules: OWNER_ROLE_MODULES.demo as string[], notes: '',
  });

  const load = () => fetch('/api/superadmin/employees').then((r) => r.json()).then((d) => setEmployees(d.employees || []));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/superadmin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, isDemo: form.role === 'demo' || form.isDemo }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      toast({ title: 'Employee created', description: `${form.email} can now sign in at /login` });
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Could not create employee', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (e: any) => {
    await fetch('/api/superadmin/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id, status: e.status === 'active' ? 'disabled' : 'active' }),
    });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Owner team</h1>
          <p className="text-sm text-slate-500 mt-1">Add sales, support, finance, or demo employees. They log in from the same login page with only the modules you grant.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-violet-700 hover:bg-violet-800"><Plus className="w-4 h-4 mr-1" /> Add employee</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {employees.map((e) => {
          let modules: string[] = [];
          try { modules = JSON.parse(e.modules || '[]'); } catch {}
          return (
            <Card key={e.id} className="py-0">
              <CardContent className="p-5 space-y-2">
                <div className="flex justify-between">
                  <div>
                    <p className="font-bold">{e.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{e.email}</p>
                  </div>
                  <Badge variant="outline">{e.role}</Badge>
                </div>
                <p className="text-[11px] text-slate-500">{modules.join(', ') || 'all modules'}</p>
                {e.isDemo && <Badge className="bg-amber-50 text-amber-800 border-amber-200">Demo showcase</Badge>}
                <Button size="sm" variant="outline" onClick={() => toggle(e)}>{e.status === 'active' ? 'Disable' : 'Enable'}</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {employees.length === 0 && <p className="text-sm text-slate-500">No team members yet. Create a demo login for product walkthroughs.</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add owner employee</DialogTitle>
            <DialogDescription>They sign in at the public login page. Module checkboxes control what they see in this console.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Password</Label><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <select className="h-9 w-full rounded-md border px-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, modules: OWNER_ROLE_MODULES[e.target.value] || OWNER_ROLE_MODULES.support, isDemo: e.target.value === 'demo' })}>
                {Object.keys(OWNER_ROLE_MODULES).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Modules they can open</Label>
              {OWNER_MODULES.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.modules.includes(m.id)} onChange={(e) => {
                    const next = e.target.checked ? [...form.modules, m.id] : form.modules.filter((x) => x !== m.id);
                    setForm({ ...form, modules: next });
                  }} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving || !form.name || !form.email} onClick={create} className="bg-violet-700 hover:bg-violet-800">Create login</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
