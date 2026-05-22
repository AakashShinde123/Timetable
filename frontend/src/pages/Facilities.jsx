import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Building, Trees, FlaskConical, AlertTriangle, RefreshCw, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

const empty = { name: '', type: 'Indoor', capacity: 40, location: '', is_shared: false, description: '', subject_codes: [] };

export default function Facilities() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [conflicts, setConflicts] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    const res = await api.get(`/schools/${schoolId}/facilities`);
    setItems(res.data);
  };
  const loadConflicts = async () => {
    try {
      const res = await api.get(`/schools/${schoolId}/facility-conflicts`);
      setConflicts(res.data);
    } catch (e) { console.warn('loadConflicts failed', e); }
  };
  useEffect(() => { load(); loadConflicts(); }, [schoolId]);

  const save = async () => {
    if (!form.name) return toast.error('Name required');
    try {
      const payload = { ...form, capacity: parseInt(form.capacity) || 0 };
      if (editingId) await api.put(`/schools/${schoolId}/facilities/${editingId}`, payload);
      else await api.post(`/schools/${schoolId}/facilities`, payload);
      toast.success('Saved'); setOpen(false); load(); loadConflicts();
    } catch { toast.error('Save failed'); }
  };
  const del = async (id) => {
    if (!window.confirm('Delete facility?')) return;
    await api.delete(`/schools/${schoolId}/facilities/${id}`);
    load(); loadConflicts();
  };

  const indoor = items.filter((i) => i.type === 'Indoor');
  const outdoor = items.filter((i) => i.type === 'Outdoor');
  const labs = items.filter((i) => i.type === 'Lab');

  const migrateLabs = async () => {
    try {
      const res = await api.post('/migrate/labs-to-facilities');
      toast.success(`Migrated ${res.data.migrated} of ${res.data.total_labs} labs`);
      load();
    } catch { toast.error('Migration failed'); }
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / FACILITIES</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Facility Management</h1>
          <div className="text-sm text-[#71717A] mt-2 max-w-2xl">
            Every class maps to a home space — indoor classroom or outdoor area (sports ground, courtyard, auditorium).
            Two classes can't share the same non-shared facility in the same period.
          </div>
        </div>
        <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-facility-btn">
          <Plus className="w-4 h-4 mr-2" /> New Facility
        </Button>
      </div>

      <div className="flex justify-end mb-4">
        <Button onClick={migrateLabs} variant="outline" className="rounded-none border-[#D4D4D8] h-9 text-xs" data-testid="migrate-labs-btn">
          <Wand2 className="w-3.5 h-3.5 mr-2" /> Import legacy Labs as Facilities
        </Button>
      </div>

      {conflicts && conflicts.total > 0 && (
        <div className="bg-[#FFF5F5] border-l-2 border-[#FF3B30] p-4 mb-8" data-testid="facility-conflicts">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#FF3B30]" />
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#FF3B30]">FACILITY CONFLICTS · {conflicts.total}</div>
            <button onClick={loadConflicts} className="ml-auto p-1 hover:bg-white" data-testid="reload-conflicts-btn">
              <RefreshCw className="w-3.5 h-3.5 text-[#71717A]" />
            </button>
          </div>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {conflicts.conflicts.slice(0, 12).map((c) => (
              <div key={`${c.facility_id}-${c.day}-${c.period_id}`} className="text-xs font-mono bg-white p-2 border border-[#FECACA]">
                <span className="text-[#FF3B30] font-bold">{c.facility_name}</span> · {c.day} · {c.period_id.slice(-6)} · {c.count} classes ({c.class_names.filter(Boolean).join(', ')})
              </div>
            ))}
          </div>
        </div>
      )}

      <FacilityBlock title="Indoor Spaces" Icon={Building} list={indoor} onEdit={(f) => { setForm({ ...empty, ...f }); setEditingId(f.id); setOpen(true); }} onDel={del} accent="#002FA7" testid="indoor-grid" />
      <div className="h-6" />
      <FacilityBlock title="Outdoor Spaces" Icon={Trees} list={outdoor} onEdit={(f) => { setForm({ ...empty, ...f }); setEditingId(f.id); setOpen(true); }} onDel={del} accent="#10B981" testid="outdoor-grid" />
      <div className="h-6" />
      <FacilityBlock title="Labs" Icon={FlaskConical} list={labs} onEdit={(f) => { setForm({ ...empty, ...f }); setEditingId(f.id); setOpen(true); }} onDel={del} accent="#8B5CF6" testid="labs-grid" />

      {items.length === 0 && (
        <div className="bg-white border border-[#D4D4D8] p-12 text-center text-sm text-[#71717A]" data-testid="facilities-empty">
          No facilities yet. Add an indoor classroom, an outdoor playground, or any shared space.
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Facility</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
              <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Room 201 / Playground" data-testid="facility-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="rounded-none mt-1.5" data-testid="facility-type-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Indoor">Indoor</SelectItem>
                    <SelectItem value="Outdoor">Outdoor</SelectItem>
                    <SelectItem value="Lab">Lab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Capacity</Label>
                <Input type="number" className="rounded-none mt-1.5" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
              </div>
            </div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Location</Label>
              <Input className="rounded-none mt-1.5" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="2nd Floor / North Wing" /></div>
            <div className="flex items-center justify-between p-3 border border-[#E4E4E7] bg-[#FAFAFA]">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Shared Space</Label>
                <div className="text-xs text-[#71717A] mt-0.5">Multiple classes can use this facility simultaneously (skip clash checks)</div>
              </div>
              <Switch checked={form.is_shared} onCheckedChange={(v) => setForm({ ...form, is_shared: v })} data-testid="facility-shared-switch" />
            </div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Description</Label>
              <Textarea className="rounded-none mt-1.5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={save} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none" data-testid="save-facility-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FacilityBlock({ title, Icon, list, onEdit, onDel, accent, testid }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: accent }} />
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#52525B]">{title}</div>
        <div className="font-mono text-xs text-[#71717A]">{list.length}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#D4D4D8] border border-[#D4D4D8]" data-testid={testid}>
        {list.map((f) => (
          <div key={f.id} className="bg-white p-5 group relative" data-testid={`facility-${f.id}`}>
            <div className="flex items-start justify-between mb-3">
              <Icon className="w-5 h-5" style={{ color: accent }} />
              <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                <button onClick={() => onEdit(f)} className="p-1 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => onDel(f.id)} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
              </div>
            </div>
            <h3 className="font-heading text-lg font-black tracking-tighter mb-1">{f.name}</h3>
            <div className="text-xs text-[#71717A] mb-2">{f.location || '—'}</div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider pt-2 border-t border-[#E4E4E7]">
              <span className="font-bold">CAP {f.capacity}</span>
              {f.is_shared && <span className="px-1.5 py-0.5 bg-[#10B981] text-white">SHARED</span>}
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="bg-white p-8 col-span-full text-center text-xs text-[#71717A]">No {title.toLowerCase()} yet</div>}
      </div>
    </div>
  );
}
