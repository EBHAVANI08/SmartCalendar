'use client';

import { useEffect, useState } from 'react';
import { Layers, Plus, Pencil, Users, GraduationCap, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}

interface PlanItem {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  maxTeachers: number;
  maxGrades: number;
  maxPeriodsPerDay: number;
  features: string;
  isActive: boolean;
  sortOrder: number;
}

export default function PlansPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Plan Modal State
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    displayName: '',
    description: '',
    priceMonthly: 4999,
    priceYearly: 49990,
    maxTeachers: 60,
    maxGrades: 12,
    maxPeriodsPerDay: 8,
    features: ['timetable', 'substitutions', 'faculty'],
  });

  // Edit Plan Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanItem | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    description: '',
    priceMonthly: 0,
    priceYearly: 0,
    maxTeachers: 0,
    maxGrades: 0,
    maxPeriodsPerDay: 8,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/superadmin/plans');
      const data = await res.json();
      setPlans(data.plans || []);
    } catch {
      toast({ title: 'Could not load plans', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleOpenEdit = (plan: PlanItem) => {
    setEditingPlan(plan);
    setEditForm({
      displayName: plan.displayName || '',
      description: plan.description || '',
      priceMonthly: plan.priceMonthly || 0,
      priceYearly: plan.priceYearly || 0,
      maxTeachers: plan.maxTeachers || 0,
      maxGrades: plan.maxGrades || 0,
      maxPeriodsPerDay: plan.maxPeriodsPerDay || 8,
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/superadmin/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPlan.id,
          ...editForm,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to update');
      toast({ title: `${editForm.displayName} Plan Updated`, description: 'Pricing and quotas saved successfully.' });
      setEditOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Update Failed', description: e.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const createPlan = async () => {
    if (!form.name || !form.displayName) return;
    setCreating(true);
    try {
      const res = await fetch('/api/superadmin/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sortOrder: plans.length + 1,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to create');
      toast({ title: 'New Plan Created', description: `${form.displayName} tier is now active.` });
      setOpen(false);
      setForm({
        name: '',
        displayName: '',
        description: '',
        priceMonthly: 4999,
        priceYearly: 49990,
        maxTeachers: 60,
        maxGrades: 12,
        maxPeriodsPerDay: 8,
        features: ['timetable', 'substitutions', 'faculty'],
      });
      load();
    } catch (e: any) {
      toast({ title: 'Creation Failed', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const parseFeatures = (feat: any): string[] => {
    if (Array.isArray(feat)) return feat;
    try {
      const parsed = JSON.parse(feat);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900">Subscription Plans & Pricing</h1>
            <Badge className="bg-violet-50 text-violet-700 border border-violet-200 font-bold text-[10px] uppercase">
              SaaS Monetization
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Configure school subscription tiers, monthly & annual pricing, quotas, and feature entitlements.
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-violet-700 hover:bg-violet-800 text-white font-bold shadow-sm shadow-violet-900/20"
        >
          <Plus className="w-4 h-4 mr-1.5" /> Add New Tier
        </Button>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Tiers</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{plans.length}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Configured pricing tiers</p>
        </Card>

        <Card className="border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Standard Monthly</p>
          <h3 className="text-2xl font-black text-violet-700 mt-1">
            {inr(plans.find((p) => p.name === 'standard')?.priceMonthly || 4999)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Most common school plan</p>
        </Card>

        <Card className="border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Premium Monthly</p>
          <h3 className="text-2xl font-black text-indigo-700 mt-1">
            {inr(plans.find((p) => p.name === 'premium')?.priceMonthly || 9999)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Full AI & multi-grade suite</p>
        </Card>

        <Card className="border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Annual Discount</p>
          <h3 className="text-2xl font-black text-emerald-600 mt-1">~17% Off</h3>
          <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">2 months free on yearly billing</p>
        </Card>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {plans.map((p) => {
          const featuresList = parseFeatures(p.features);
          const isTrial = p.name.includes('trial');
          const isPopular = p.name === 'standard';
          const isPremium = p.name === 'premium';
          const isEnterprise = p.name === 'enterprise';

          return (
            <Card
              key={p.id}
              className={`flex flex-col justify-between border transition-all rounded-2xl overflow-hidden ${
                isPopular
                  ? 'border-violet-400 bg-gradient-to-b from-violet-50/40 via-white to-white shadow-md ring-1 ring-violet-400/30'
                  : 'border-slate-200 bg-white shadow-xs hover:border-slate-300'
              }`}
            >
              <CardContent className="p-5 space-y-4 flex-1">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 leading-snug">{p.displayName}</h3>
                    <p className="text-[10px] font-mono uppercase text-slate-400 font-bold mt-0.5">
                      CODE: {p.name}
                    </p>
                  </div>
                  {isPopular && (
                    <Badge className="bg-violet-700 text-white font-bold text-[10px] uppercase tracking-wider">
                      Popular
                    </Badge>
                  )}
                  {isTrial && (
                    <Badge variant="outline" className="text-slate-600 border-slate-300 font-bold text-[10px]">
                      Free Trial
                    </Badge>
                  )}
                  {isPremium && (
                    <Badge className="bg-indigo-600 text-white font-bold text-[10px]">
                      AI Included
                    </Badge>
                  )}
                  {isEnterprise && (
                    <Badge className="bg-slate-900 text-white font-bold text-[10px]">
                      Enterprise
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed min-h-[36px]">
                  {p.description || 'Turnkey scheduling suite for modern educational institutions.'}
                </p>

                {/* Price Display */}
                <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black text-slate-900 tracking-tight">
                        {inr(p.priceMonthly)}
                      </span>
                      <span className="text-xs font-semibold text-slate-400 ml-1">/ mo</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-bold text-slate-500 bg-white border-slate-200">
                      Monthly
                    </Badge>
                  </div>
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Yearly plan:</span>
                    <span className="font-bold text-slate-800">
                      {inr(p.priceYearly)} <span className="text-[10px] font-normal text-slate-400">/ yr</span>
                    </span>
                  </div>
                </div>

                {/* Quota Limits */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-slate-50/60 border border-slate-100/80">
                    <span className="text-slate-600 font-medium flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      Max Teachers:
                    </span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200/60 text-xs">
                      {p.maxTeachers}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-slate-50/60 border border-slate-100/80">
                    <span className="text-slate-600 font-medium flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                      Max Grades:
                    </span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200/60 text-xs">
                      {p.maxGrades}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-slate-50/60 border border-slate-100/80">
                    <span className="text-slate-600 font-medium flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Periods / Day:
                    </span>
                    <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200/60 text-xs">
                      {p.maxPeriodsPerDay || 8}
                    </span>
                  </div>
                </div>

                {/* Features Badges */}
                {featuresList.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Included Modules
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {featuresList.map((f, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>

              {/* Action Button: Edit Plan */}
              <div className="p-4 pt-0 border-t border-slate-100 mt-2">
                <Button
                  size="sm"
                  onClick={() => handleOpenEdit(p)}
                  className={`w-full font-bold h-9 shadow-xs transition-all ${
                    isPopular
                      ? 'bg-violet-700 hover:bg-violet-800 text-white'
                      : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit Plan
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit Plan Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Pencil className="w-5 h-5 text-violet-700" /> Edit {editingPlan?.displayName} Plan
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Modify pricing rates, quotas, and limits for this subscription tier.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-bold text-slate-700">Display Title</Label>
              <Input
                placeholder="e.g. Standard Suite"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">Description</Label>
              <Input
                placeholder="Short summary for school administrators"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700">Monthly Price (INR)</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    value={editForm.priceMonthly}
                    onChange={(e) => setEditForm({ ...editForm, priceMonthly: Number(e.target.value) })}
                    className="pl-7 text-xs font-bold"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
                    ₹
                  </span>
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700">Yearly Price (INR)</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    value={editForm.priceYearly}
                    onChange={(e) => setEditForm({ ...editForm, priceYearly: Number(e.target.value) })}
                    className="pl-7 text-xs font-bold"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">
                    ₹
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs font-bold text-slate-700">Max Teachers</Label>
                <Input
                  type="number"
                  value={editForm.maxTeachers}
                  onChange={(e) => setEditForm({ ...editForm, maxTeachers: Number(e.target.value) })}
                  className="mt-1 text-xs font-bold text-right"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700">Max Grades</Label>
                <Input
                  type="number"
                  value={editForm.maxGrades}
                  onChange={(e) => setEditForm({ ...editForm, maxGrades: Number(e.target.value) })}
                  className="mt-1 text-xs font-bold text-right"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700">Periods/Day</Label>
                <Input
                  type="number"
                  value={editForm.maxPeriodsPerDay}
                  onChange={(e) => setEditForm({ ...editForm, maxPeriodsPerDay: Number(e.target.value) })}
                  className="mt-1 text-xs font-bold text-right"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={savingEdit || !editForm.displayName}
              onClick={handleSaveEdit}
              className="bg-violet-700 hover:bg-violet-800 text-white font-bold"
            >
              {savingEdit ? 'Saving...' : 'Save Plan Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Plan Modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-violet-700" /> Create Custom Pricing Plan
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add a new subscription tier with custom teacher quotas and pricing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <Label className="text-xs font-bold">Plan Key / Slug (Unique)</Label>
              <Input
                placeholder="e.g. starter-lite"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">Display Title</Label>
              <Input
                placeholder="e.g. Starter Lite Suite"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-bold">Description</Label>
              <Input
                placeholder="Short summary for school administrators"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">Monthly Price (INR)</Label>
                <Input
                  type="number"
                  value={form.priceMonthly}
                  onChange={(e) => setForm({ ...form, priceMonthly: Number(e.target.value) })}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Yearly Price (INR)</Label>
                <Input
                  type="number"
                  value={form.priceYearly}
                  onChange={(e) => setForm({ ...form, priceYearly: Number(e.target.value) })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs font-bold">Max Teachers</Label>
                <Input
                  type="number"
                  value={form.maxTeachers}
                  onChange={(e) => setForm({ ...form, maxTeachers: Number(e.target.value) })}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Max Grades</Label>
                <Input
                  type="number"
                  value={form.maxGrades}
                  onChange={(e) => setForm({ ...form, maxGrades: Number(e.target.value) })}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold">Periods/Day</Label>
                <Input
                  type="number"
                  value={form.maxPeriodsPerDay}
                  onChange={(e) => setForm({ ...form, maxPeriodsPerDay: Number(e.target.value) })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={creating || !form.name || !form.displayName}
              onClick={createPlan}
              className="bg-violet-700 hover:bg-violet-800 text-white font-bold"
            >
              {creating ? 'Creating...' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
