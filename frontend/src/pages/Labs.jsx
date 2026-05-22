import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

const empty = { name: '', type: 'General', capacity: 30, location: '' };

export default function Labs() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    const res = await api.get(`/schools/${schoolId}/labs`);
    setItems(res.data);
  };
  useEffect(() => { load(); }, [schoolId]);

  const save = async () => {
    if (!form.name) return toast.error('Name required');
    try {
      if (editingId) await api.put(`/schools/${schoolId}/labs/${editingId}`, form);
      else await api.post(`/schools/${schoolId}/labs`, form);
      toast.success('Saved');
      setOpen(false);
      load();
    } catch { toast.error('Save failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete?')) return;
    await api.delete(`/schools/${schoolId}/labs/${id}`);
    load();
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / LABS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Labs & Rooms</h1>
        </div>
        <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-lab-btn">
          <Plus className="w-4 h-4 mr-2" /> New Lab
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8]">
        {items.map((l) => (
          <div key={l.id} className="bg-white p-5 group" data-testid={`lab-${l.id}`}>
            <div className="flex items-start justify-between mb-4">
              <FlaskConical className="w-5 h-5 text-[#8B5CF6]" />
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <button onClick={() => { setForm(l); setEditingId(l.id); setOpen(true); }} className="p-1 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(l.id)} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold mb-1">{l.type}</div>
            <h3 className="font-heading text-xl font-black tracking-tighter">{l.name}</h3>
            <div className="text-xs text-[#71717A] mt-2">Capacity: <span className="font-mono">{l.capacity}</span> · {l.location || '—'}</div>
          </div>
        ))}
        {items.length === 0 && <div className="bg-white p-12 col-span-full text-center text-sm text-[#71717A]">No labs yet.</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Lab</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
              <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="lab-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Type</Label>
                <Input className="rounded-none mt-1.5" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Science / Computer / Art" /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Capacity</Label>
                <Input type="number" className="rounded-none mt-1.5" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Location</Label>
              <Input className="rounded-none mt-1.5" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none" data-testid="save-lab-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
