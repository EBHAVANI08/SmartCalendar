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
import { ROOM_TYPES, roomTypeLabel } from '@/lib/room-types';

interface Room {
  id: string;
  code: string;
  name: string;
  type: string;
  capacity: number;
  active: boolean;
  /** False when the stored type is free text from before types were normalised. */
  typeIsNormalised?: boolean;
  /** A suggestion for the Admin to confirm. Never applied automatically. */
  suggestedType?: { type: string; confidence: 'high' | 'review' } | null;
  supportedSubjects?: string[];
  unavailablePeriods?: Record<string, number[]>;
}

const roomTypeIcon: Record<string, React.ElementType> = {
  classroom: Building2, physics_lab: Beaker, chemistry_lab: Beaker, biology_lab: Beaker,
  computer_lab: Monitor, library: Building2, auditorium: Maximize2,
  sports_ground: Maximize2, music_room: Building2, art_room: Building2, multipurpose: Maximize2,
};
const roomTypeColor: Record<string, string> = {
  classroom:     'bg-blue-100 text-blue-700 border-blue-200',
  physics_lab:   'bg-orange-100 text-orange-700 border-orange-200',
  chemistry_lab: 'bg-orange-100 text-orange-700 border-orange-200',
  biology_lab:   'bg-lime-100 text-lime-700 border-lime-200',
  computer_lab:  'bg-teal-100 text-teal-700 border-teal-200',
  library:       'bg-violet-100 text-violet-700 border-violet-200',
  auditorium:    'bg-slate-100 text-slate-600 border-slate-200',
  sports_ground: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  music_room:    'bg-pink-100 text-pink-700 border-pink-200',
  art_room:      'bg-rose-100 text-rose-700 border-rose-200',
  multipurpose:  'bg-slate-100 text-slate-600 border-slate-200',
};

export default function RoomsPage() {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stats, setStats] = useState<{ totalRooms: number; typeBreakdown: Record<string, number>; needsTypeReview?: number }>({ totalRooms: 0, typeBreakdown: {} });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingType, setPendingType] = useState<Record<string, string>>({});
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

  // Rooms whose stored type is not one of the normalised values.
  const needsReview = rooms.filter((r) => r.typeIsNormalised === false);

  const confirmType = async (room: Room) => {
    const type = pendingType[room.id] ?? room.suggestedType?.type;
    if (!type) return;
    const res = await fetch('/api/rooms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: room.id, type }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: 'Not saved', description: data?.error || `HTTP ${res.status}`, variant: 'destructive' });
      return;
    }
    toast({ title: 'Room type set', description: `${room.name} is now a ${roomTypeLabel(type)}.` });
    fetchRooms();
  };

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
                Takshila School
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
            <span>{roomTypeLabel(type)}</span>
            <span className="font-bold">{count}</span>
          </div>
        ))}
      </div>

      {/* Rooms whose stored type predates the normalised list. A suggestion is
          offered; nothing is rewritten until an Admin confirms it. */}
      {needsReview.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60" data-testid="room-type-review">
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-bold text-amber-900">
                {needsReview.length} room{needsReview.length === 1 ? '' : 's'} need a room type
              </p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                These carry a free-text type from before types were standardised. Confirm each one — nothing
                is changed automatically.
              </p>
            </div>
            <div className="space-y-2">
              {needsReview.map((room) => (
                <div key={room.id} className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-white border border-amber-200">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 truncate">{room.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {room.code} · stored as &ldquo;{room.type}&rdquo;
                    </p>
                  </div>
                  <Select
                    value={pendingType[room.id] ?? room.suggestedType?.type ?? ''}
                    onValueChange={(v) => setPendingType((prev) => ({ ...prev, [room.id]: v }))}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Choose a type…" /></SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {room.suggestedType && (
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      suggested: {roomTypeLabel(room.suggestedType.type)}
                      {room.suggestedType.confidence === 'review' ? ' (uncertain)' : ''}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    className="h-8 text-[11px] shrink-0"
                    disabled={!(pendingType[room.id] ?? room.suggestedType?.type)}
                    onClick={() => confirmType(room)}
                  >
                    Confirm
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                    <Badge className={`text-[10px] ${colorCls}`}>{roomTypeLabel(room.type)}</Badge>
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
                  {ROOM_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
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
