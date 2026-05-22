import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';

const empty = { name: '', shift_id: '', description: '', order: 0 };

export default function Sections() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    const [s, sh] = await Promise.all([
      api.get(`/schools/${schoolId}/sections`),
      api.get(`/schools/${schoolId}/shifts`),
    ]);
    setItems(s.data.sort((a, b) => a.order - b.order));
    setShifts(sh.data);
  };
  useEffect(() => { load(); }, [schoolId]);

  const save = async () => {
    if (!form.name) return toast.error('Name required');
    try {
      const payload = { ...form, shift_id: form.shift_id || null };
      if (editingId) await api.put(`/schools/${schoolId}/sections/${editingId}`, payload);
      else await api.post(`/schools/${schoolId}/sections`, payload);
      toast.success('Saved'); setOpen(false); load();
    } catch { toast.error('Failed'); }
  };
  const del = async (id) => {
    if (!window.confirm('Delete section?')) return;
    await api.delete(`/schools/${schoolId}/sections/${id}`);
    load();
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / SECTIONS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">School Sections</h1>
          <div className="text-sm text-[#71717A] mt-2">Top-level groupings (Primary, Secondary…) each mapped to a shift. Classes belong to sections.</div>
        </div>
        <Button onClick={() => { setForm({ ...empty, order: items.length }); setEditingId(null); setOpen(true); }} className="bg-[#002FA7] text-white rounded-none h-10" data-testid="new-section-btn">
          <Plus className="w-4 h-4 mr-2" /> New Section
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#D4D4D8] border border-[#D4D4D8]" data-testid="sections-grid">
        {items.map((s) => {
          const shift = shifts.find((sh) => sh.id === s.shift_id);
          return (
            <div key={s.id} className="bg-white p-5 group" data-testid={`section-${s.id}`}>
              <div className="flex items-start justify-between mb-4">
                <Layers className="w-5 h-5 text-[#002FA7]" />
                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                  <button onClick={() => { setForm(s); setEditingId(s.id); setOpen(true); }} className="p-1 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(s.id)} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold mb-1">ORDER {s.order}</div>
              <h3 className="font-heading text-xl font-black tracking-tighter mb-2">{s.name}</h3>
              {s.description && <p className="text-xs text-[#52525B] mb-3">{s.description}</p>}
              <div className="text-xs text-[#71717A] pt-3 border-t border-[#D4D4D8]">
                Shift: <span className="font-mono font-bold text-[#09090B]">{shift?.name || '—'}</span>
              </div>
            </div>
          );
        })}
        {items.length === 0 && <div className="bg-white p-12 col-span-full text-center text-sm text-[#71717A]">No sections yet</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Section</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
              <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Primary / Secondary / Kindergarten" data-testid="section-name-input" /></div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Mapped Shift</Label>
              <Select value={form.shift_id || 'none'} onValueChange={(v) => setForm({ ...form, shift_id: v === 'none' ? '' : v })}>
                <SelectTrigger className="rounded-none mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {shifts.map((sh) => <SelectItem key={sh.id} value={sh.id}>{sh.name} ({sh.start_time}-{sh.end_time})</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Order</Label>
              <Input type="number" className="rounded-none mt-1.5" value={form.order} onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })} /></div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Description</Label>
              <Textarea className="rounded-none mt-1.5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] text-white rounded-none" data-testid="save-section-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
