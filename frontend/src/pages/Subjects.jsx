import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const empty = { name: '', code: '', color: '#0055FF', is_lab: false, periods_per_week: 5 };

export default function Subjects() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    const res = await api.get(`/schools/${schoolId}/subjects`);
    setItems(res.data);
  };
  useEffect(() => { load(); }, [schoolId]);

  const save = async () => {
    if (!form.name || !form.code) return toast.error('Name & code required');
    try {
      if (editingId) await api.put(`/schools/${schoolId}/subjects/${editingId}`, form);
      else await api.post(`/schools/${schoolId}/subjects`, form);
      toast.success('Saved');
      setOpen(false);
      load();
    } catch { toast.error('Save failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete?')) return;
    await api.delete(`/schools/${schoolId}/subjects/${id}`);
    load();
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / SUBJECTS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Subjects</h1>
        </div>
        <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-subject-btn">
          <Plus className="w-4 h-4 mr-2" /> New Subject
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8]" data-testid="subjects-grid">
        {items.map((s) => (
          <div key={s.id} className="bg-white p-5 hover:bg-[#FAFAFA] transition-all group" data-testid={`subject-${s.id}`}>
            <div className="flex items-start justify-between mb-4">
              <span className="font-mono text-xs font-bold px-2 py-1 text-white" style={{ background: s.color }}>{s.code}</span>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button onClick={() => { setForm(s); setEditingId(s.id); setOpen(true); }} className="p-1 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(s.id)} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
              </div>
            </div>
            <h3 className="font-heading text-xl font-black tracking-tighter mb-2">{s.name}</h3>
            <div className="flex items-center gap-3 text-xs text-[#71717A]">
              <span>{s.periods_per_week} periods/week</span>
              {s.is_lab && <span className="px-1.5 py-0.5 bg-[#FFCC00] text-[#09090B] font-bold">LAB</span>}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="bg-white p-12 text-center col-span-full"><span className="text-sm text-[#71717A]">No subjects yet</span></div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Subject</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
              <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="subject-name-input" /></div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Code *</Label>
              <Input className="rounded-none mt-1.5 uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} data-testid="subject-code-input" /></div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Color</Label>
              <Input type="color" className="rounded-none mt-1.5 h-10 p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Periods / Week</Label>
              <Input type="number" className="rounded-none mt-1.5" value={form.periods_per_week} onChange={(e) => setForm({ ...form, periods_per_week: parseInt(e.target.value) || 0 })} /></div>
            <div className="flex items-center gap-2"><Checkbox id="lab" checked={form.is_lab} onCheckedChange={(c) => setForm({ ...form, is_lab: !!c })} /><Label htmlFor="lab" className="text-sm">Requires Lab</Label></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none" data-testid="save-subject-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
