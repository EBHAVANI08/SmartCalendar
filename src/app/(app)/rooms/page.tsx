'use client';

import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Search, RefreshCw, Users, Maximize2, Monitor, Beaker } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Room {
  id: string;
  code: string;
  name: string;
  type: string;
  capacity: number;
  active: boolean;
}

const ROOM_TYPES = ['classroom', 'lab', 'computer_lab', 'library', 'hall', 'gym', 'art_room', 'music_room'];
const roomTypeIcon: Record<string, React.ElementType> = {
  classroom: Building2, lab: Beaker, computer_lab: Monitor,
  library: Building2, hall: Maximize2, gym: Maximize2,
};
const roomTypeColor: Record<string, string> = {
  classroom:    'bg-blue-100 text-blue-700 border-blue-200',
  lab:          'bg-orange-100 text-orange-700 border-orange-200',
  computer_lab: 'bg-teal-100 text-teal-700 border-teal-200',
  library:      'bg-violet-100 text-violet-700 border-violet-200',
  hall:         'bg-slate-100 text-slate-600 border-slate-200',
  gym:          'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function RoomsPage() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stats, setStats] = useState<{ totalRooms: number; typeBreakdown: Record<string, number> }>({ totalRooms: 0, typeBreakdown: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', type: 'classroom', capacity: '30' });
  const [saving, setSaving] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/rooms');
      if (r.ok) {
        const d = await r.json();
        setRooms(d.rooms || []);
        setStats(d.stats || { totalRooms: 0, typeBreakdown: {} });
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);

  const filtered = rooms.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
  });

  const handleSave = async () => {
    if (!form.code || !form.name) {
      toast({ title: 'Validation', description: 'Code and name are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, capacity: parseInt(form.capacity) }),
      });
      const d = await r.json();
      if (r.ok) {
        toast({ title: 'Room Added', description: `${form.name} has been added.` });
        setAddOpen(false);
        setForm({ code: '', name: '', type: 'classroom', capacity: '30' });
        fetchRooms();
      } else {
        toast({ title: 'Error', description: d.error, variant: 'destructive' });
      }
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* ── Enterprise SaaS Rooms & Labs Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-800 to-slate-900 flex items-center justify-center text-white shadow-md shadow-blue-900/30 shrink-0 border border-blue-500/20">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#081A33]">
                Rooms, Laboratories & Facilities
              </h1>
              <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 font-bold text-[10px] uppercase tracking-wider">
                Delhi Public School (DPS)
              </Badge>
            </div>
            <p className="text-xs text-[#64748B] font-medium mt-1">
              Classrooms, science laboratories, computer labs, AV halls & sports facilities &middot; {rooms.length} Total Registered Facilities
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" variant="outline" onClick={fetchRooms} className="gap-2 text-xs border-[#E2E8F0] text-[#0F2747] bg-white hover:bg-slate-50 font-bold h-9 shadow-xs px-3.5">
            <RefreshCw className={`w-3.5 h-3.5 text-[#2563EB] ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2 bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 hover:from-blue-800 hover:to-slate-950 text-white font-bold h-9 shadow-md text-xs px-3.5 border-none">
            <Plus className="w-4 h-4 text-amber-300" /> Add Room / Facility
          </Button>
        </div>
      </div>

      {/* Type breakdown */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(stats.typeBreakdown).map(([type, count]) => (
          <div key={type} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium ${roomTypeColor[type] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            <span className="capitalize">{type.replace('_', ' ')}</span>
            <span className="font-bold">{count}</span>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input placeholder="Search by code, name, or type…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => <Card key={i} className="border-slate-200"><CardContent className="p-5 h-32 bg-slate-100 rounded-xl" /></Card>)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center">
            <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">No rooms found</p>
            <Button size="sm" variant="outline" className="mt-3 gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" /> Add First Room
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(room => {
            const Icon = roomTypeIcon[room.type] || Building2;
            const colorCls = roomTypeColor[room.type] || 'bg-slate-100 text-slate-600 border-slate-200';
            return (
              <Card key={room.id} className="border-slate-200 hover:shadow-md hover:scale-[1.01] transition-all duration-200">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl ${colorCls.split(' ').slice(0, 2).join(' ')} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${colorCls.split(' ')[1]}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{room.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{room.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className={`text-[10px] ${colorCls} capitalize`}>{room.type.replace('_', ' ')}</Badge>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Users className="w-3.5 h-3.5" />
                      <span>{room.capacity}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Room Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-emerald-600" /> Add Room
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Room Code</Label>
                <Input placeholder="e.g., CR-101" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input type="number" placeholder="30" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Room Name</Label>
              <Input placeholder="e.g., Classroom 101" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Room Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOM_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving…' : 'Add Room'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
