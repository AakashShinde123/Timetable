import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Activity as ActivityIcon, Building, Trees } from 'lucide-react';
import { toast } from 'sonner';

const empty = {
  name: '', color: '#FFCC00', is_out_of_classroom: true, type: 'Indoor',
  facility_id: '', target_class_ids: [], periods_per_week: 0, description: '',
};

export default function Activities() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    const [a, c, f] = await Promise.all([
      api.get(`/schools/${schoolId}/activities`),
      api.get(`/schools/${schoolId}/classes`),
      api.get(`/schools/${schoolId}/facilities`),
    ]);
    setItems(a.data);
    setClasses(c.data);
    setFacilities(f.data);
  };
  useEffect(() => { load(); }, [schoolId]);

  const save = async () => {
    if (!form.name) return toast.error('Name required');
    try {
      const payload = {
        ...form, facility_id: form.facility_id || null,
        periods_per_week: parseInt(form.periods_per_week) || 0,
      };
      if (editingId) await api.put(`/schools/${schoolId}/activities/${editingId}`, payload);
      else await api.post(`/schools/${schoolId}/activities`, payload);
      toast.success('Saved'); setOpen(false); load();
    } catch { toast.error('Save failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete activity?')) return;
    await api.delete(`/schools/${schoolId}/activities/${id}`);
    load();
  };

  const toggleClass = (cid) => {
    setForm((f) => ({
      ...f,
      target_class_ids: f.target_class_ids.includes(cid)
        ? f.target_class_ids.filter((x) => x !== cid)
        : [...f.target_class_ids, cid],
    }));
  };

  const allClassIds = classes.map((c) => c.id);
  const toggleAllClasses = () => {
    setForm((f) => ({
      ...f,
      target_class_ids: f.target_class_ids.length === allClassIds.length ? [] : allClassIds,
    }));
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / ACTIVITIES</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Activities</h1>
          <div className="text-sm text-[#71717A] mt-2 max-w-2xl">
            Assembly, Sports, PT, Library… activities behave like subjects but can span multiple Standards / Divisions and be either Indoor or Outdoor.
          </div>
        </div>
        <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-activity-btn">
          <Plus className="w-4 h-4 mr-2" /> New Activity
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8]" data-testid="activities-grid">
        {items.map((a) => {
          const fac = facilities.find((f) => f.id === a.facility_id);
          const targets = (a.target_class_ids || []).length;
          const TypeIcon = a.type === 'Outdoor' ? Trees : Building;
          return (
            <div key={a.id} className="bg-white p-5 hover:bg-[#FAFAFA] transition-all group" data-testid={`activity-${a.id}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-8 h-8 flex items-center justify-center" style={{ background: a.color }}>
                  <ActivityIcon className="w-4 h-4 text-white" />
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                  <button onClick={() => { setForm({ ...empty, ...a, target_class_ids: a.target_class_ids || [], facility_id: a.facility_id || '' }); setEditingId(a.id); setOpen(true); }} className="p-1 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(a.id)} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
                </div>
              </div>
              <h3 className="font-heading text-xl font-black tracking-tighter mb-2">{a.name}</h3>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider mb-3">
                <TypeIcon className={`w-3 h-3 ${a.type === 'Outdoor' ? 'text-[#10B981]' : 'text-[#002FA7]'}`} />
                <span className="font-bold">{(a.type || 'Indoor').toUpperCase()}</span>
                {a.is_out_of_classroom && <span className="px-1.5 py-0.5 bg-[#FFCC00] text-[#09090B] font-bold">OUT-OF-CLASS</span>}
              </div>
              <div className="text-xs text-[#52525B] space-y-0.5">
                {fac && <div>Facility: <span className="font-mono font-bold">{fac.name}</span></div>}
                {targets > 0 && <div>Targets: <span className="font-mono font-bold">{targets} class{targets > 1 ? 'es' : ''}</span></div>}
                {a.periods_per_week > 0 && <div>Per week: <span className="font-mono font-bold">{a.periods_per_week}</span></div>}
              </div>
              {a.description && <p className="text-xs text-[#71717A] mt-2 leading-relaxed border-t border-[#E4E4E7] pt-2">{a.description}</p>}
            </div>
          );
        })}
        {items.length === 0 && <div className="bg-white p-12 col-span-full text-center text-sm text-[#71717A]">No activities yet. Click "New Activity".</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8] max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Activity</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
              <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Assembly, Sports, PT" data-testid="activity-name-input" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="rounded-none mt-1.5" data-testid="activity-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Indoor">Indoor</SelectItem>
                    <SelectItem value="Outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Color</Label>
                <Input type="color" className="rounded-none mt-1.5 h-10 p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Periods / Week</Label>
                <Input type="number" className="rounded-none mt-1.5" value={form.periods_per_week} onChange={(e) => setForm({ ...form, periods_per_week: e.target.value })} /></div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Default Facility</Label>
              <Select value={form.facility_id || 'none'} onValueChange={(v) => setForm({ ...form, facility_id: v === 'none' ? '' : v })}>
                <SelectTrigger className="rounded-none mt-1.5" data-testid="activity-facility-select"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {facilities.filter((f) => !form.type || f.type === form.type || f.is_shared).map((f) => <SelectItem key={f.id} value={f.id}>{f.type[0]} · {f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Target Classes (Standard · Division)</Label>
                <button onClick={toggleAllClasses} type="button" className="text-[10px] uppercase tracking-wider font-bold text-[#002FA7] hover:underline" data-testid="toggle-all-classes">
                  {form.target_class_ids.length === allClassIds.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <div className="text-xs text-[#71717A] mb-2">Activity can be scheduled across multiple classes at once (e.g. Assembly across all Standard 1-10).</div>
              <div className="max-h-44 overflow-y-auto border border-[#E4E4E7] p-2 grid grid-cols-2 md:grid-cols-3 gap-1" data-testid="activity-target-classes">
                {classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs px-2 py-1 hover:bg-[#FAFAFA] cursor-pointer">
                    <Checkbox checked={form.target_class_ids.includes(c.id)} onCheckedChange={() => toggleClass(c.id)} data-testid={`class-target-${c.id}`} />
                    <span>{c.standard || c.grade} · <span className="font-mono">{c.division || c.section}</span></span>
                  </label>
                ))}
                {classes.length === 0 && <div className="col-span-full text-xs text-[#71717A] text-center py-3">No classes yet</div>}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#71717A] mt-1">{form.target_class_ids.length} selected</div>
            </div>
            <div className="flex items-center gap-2"><Checkbox id="ooc" checked={form.is_out_of_classroom} onCheckedChange={(c) => setForm({ ...form, is_out_of_classroom: !!c })} /><Label htmlFor="ooc" className="text-sm">Out of Classroom</Label></div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Description</Label>
              <Textarea className="rounded-none mt-1.5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none" data-testid="save-activity-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
