import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Pencil, Trash2, Wand2, Building, Trees, FlaskConical, Clock, Layers, GraduationCap, Users } from 'lucide-react';
import { toast } from 'sonner';

const empty = {
  standard: '', division: '', room_no: '', strength: 30,
  class_teacher_id: '', section_id: '', facility_id: '', shift_id: '',
};

const facilityIcon = (type) => {
  if (type === 'Outdoor') return Trees;
  if (type === 'Lab') return FlaskConical;
  return Building;
};
const facilityAccent = (type) => {
  if (type === 'Outdoor') return '#10B981';
  if (type === 'Lab') return '#8B5CF6';
  return '#002FA7';
};

// Build the canonical class display label: "Standard 6 · A"
const classLabel = (c) => {
  const std = (c.standard || c.grade || '').trim();
  const div = (c.division || c.section || '').trim();
  return std && div ? `${std} · ${div}` : std || div || c.name || '';
};

export default function Classes() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [sections, setSections] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [filterShift, setFilterShift] = useState('all');
  const [filterSection, setFilterSection] = useState('all');

  const load = async () => {
    const [c, t, sec, fac, sh] = await Promise.all([
      api.get(`/schools/${schoolId}/classes`),
      api.get(`/schools/${schoolId}/teachers`),
      api.get(`/schools/${schoolId}/sections`),
      api.get(`/schools/${schoolId}/facilities`),
      api.get(`/schools/${schoolId}/shifts`),
    ]);
    setItems(c.data);
    setTeachers(t.data);
    setSections(sec.data);
    setFacilities(fac.data);
    setShifts(sh.data);
  };
  useEffect(() => { load(); }, [schoolId]);

  const save = async () => {
    if (!form.standard || !form.division) return toast.error('Standard and Division required');
    try {
      const payload = {
        ...form,
        name: `${form.standard} · ${form.division}`,
        class_teacher_id: form.class_teacher_id || null,
        section_id: form.section_id || null,
        facility_id: form.facility_id || null,
        shift_id: form.shift_id || null,
        strength: parseInt(form.strength) || 0,
      };
      if (editingId) await api.put(`/schools/${schoolId}/classes/${editingId}`, payload);
      else await api.post(`/schools/${schoolId}/classes`, payload);
      toast.success('Saved');
      setOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this class?')) return;
    await api.delete(`/schools/${schoolId}/classes/${id}`);
    load();
  };

  const autoMatchFacilities = async () => {
    try {
      const preview = await api.post(`/schools/${schoolId}/classes/auto-match-facilities`, {});
      const n = preview.data.matches?.length || 0;
      if (n === 0) return toast.info('No room_no → facility matches found');
      if (!window.confirm(`Apply ${n} facility mapping(s) based on room_no?`)) return;
      const apply = await api.post(`/schools/${schoolId}/classes/auto-match-facilities`, { apply: true });
      toast.success(`Mapped ${apply.data.applied} class(es) to facilities`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Auto-match failed'); }
  };

  // Apply filters
  const filtered = items.filter((c) => {
    if (filterShift !== 'all' && (c.shift_id || '') !== filterShift) return false;
    if (filterSection !== 'all' && (c.section_id || '') !== filterSection) return false;
    return true;
  });

  // Group by section for the grouped view
  const grouped = {};
  filtered.forEach((c) => {
    const key = c.section_id || 'unassigned';
    (grouped[key] = grouped[key] || []).push(c);
  });

  const sectionName = (id) => id === 'unassigned' ? 'Unassigned' : (sections.find((s) => s.id === id)?.name || '—');

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / CLASSES</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Classes</h1>
          <div className="text-sm text-[#71717A] mt-2 max-w-2xl">
            A <span className="font-bold text-[#09090B]">Class</span> = Standard (e.g. <code className="font-mono">Standard 6</code>) + Division (e.g. <code className="font-mono">A</code>). Each class belongs to a <span className="font-bold text-[#09090B]">Section</span> (Primary / Secondary / …), runs in a <span className="font-bold text-[#09090B]">Shift</span>, and is mapped to a home <span className="font-bold text-[#09090B]">Facility</span> (indoor classroom or outdoor area).
          </div>
        </div>
        <div className="flex gap-3">
          <Button onClick={autoMatchFacilities} variant="outline" className="rounded-none border-[#D4D4D8] h-10" data-testid="auto-match-facilities-btn">
            <Wand2 className="w-4 h-4 mr-2" /> Auto-match Facilities
          </Button>
          <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-class-btn">
            <Plus className="w-4 h-4 mr-2" /> New Class
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#D4D4D8] border border-[#D4D4D8] mb-8">
        <KPI label="TOTAL CLASSES" value={items.length} Icon={GraduationCap} accent="#002FA7" />
        <KPI label="SECTIONS" value={sections.length} Icon={Layers} accent="#06B6D4" />
        <KPI label="SHIFTS" value={shifts.length} Icon={Clock} accent="#FFCC00" />
        <KPI label="STUDENTS" value={items.reduce((a, c) => a + (parseInt(c.strength) || 0), 0)} Icon={Users} accent="#10B981" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#71717A]">FILTER · SHIFT</Label>
          <Select value={filterShift} onValueChange={setFilterShift}>
            <SelectTrigger className="rounded-none h-9 mt-1" data-testid="filter-shift"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shifts</SelectItem>
              {shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#71717A]">FILTER · SECTION</Label>
          <Select value={filterSection} onValueChange={setFilterSection}>
            <SelectTrigger className="rounded-none h-9 mt-1" data-testid="filter-section"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              <SelectItem value="unassigned">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-[#71717A] font-mono ml-auto pb-2">SHOWING {filtered.length} OF {items.length}</div>
      </div>

      {/* Grouped table */}
      <div className="space-y-6" data-testid="classes-grouped">
        {Object.entries(grouped).map(([secId, list]) => {
          const sec = sections.find((s) => s.id === secId);
          return (
            <div key={secId} className="bg-white border border-[#D4D4D8]" data-testid={`section-group-${secId}`}>
              <div className="px-4 py-3 border-b border-[#D4D4D8] bg-[#FAFAFA] flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-[#06B6D4]" />
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold">{sectionName(secId)}</div>
                <span className="font-mono text-xs text-[#71717A]">{list.length}</span>
                {sec?.shift_ids?.length > 0 && <span className="text-[10px] font-mono text-[#71717A] ml-2">shift: {sec.shift_ids.map((sid) => shifts.find((sh) => sh.id === sid)?.name).filter(Boolean).join(', ')}</span>}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#FAFAFA] border-b border-[#D4D4D8]">
                  <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
                    <th className="px-4 py-2">CLASS</th>
                    <th className="px-4 py-2">FACILITY · ROOM</th>
                    <th className="px-4 py-2">SHIFT</th>
                    <th className="px-4 py-2">STRENGTH</th>
                    <th className="px-4 py-2">CLASS TEACHER</th>
                    <th className="px-4 py-2 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((c) => {
                    const ct = teachers.find((t) => t.id === c.class_teacher_id);
                    const fac = facilities.find((f) => f.id === c.facility_id);
                    const sh = shifts.find((x) => x.id === c.shift_id);
                    const Icon = facilityIcon(fac?.type);
                    return (
                      <tr key={c.id} className="border-b border-[#E4E4E7] last:border-0 hover:bg-[#FAFAFA]" data-testid={`class-row-${c.id}`}>
                        <td className="px-4 py-3 font-semibold">{classLabel(c)}</td>
                        <td className="px-4 py-3 text-xs">
                          {(() => {
                            if (fac) {
                              return (
                                <span className="inline-flex items-center gap-1.5">
                                  <Icon className="w-3.5 h-3.5" style={{ color: facilityAccent(fac.type) }} />
                                  <span className="font-mono font-bold" style={{ color: facilityAccent(fac.type) }}>{fac.type[0]}</span>
                                  <span>{fac.name}</span>
                                  {c.room_no && <span className="text-[#71717A] ml-1">· {c.room_no}</span>}
                                </span>
                              );
                            }
                            if (c.room_no) return <span className="font-mono">{c.room_no}</span>;
                            return <span className="text-[#FF3B30] text-[10px] font-mono uppercase">UNMAPPED</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {sh ? <span><span className="font-mono font-bold">{sh.name}</span> · <span className="text-[#71717A]">{sh.start_time}</span></span> : <span className="text-[#71717A]">—</span>}
                        </td>
                        <td className="px-4 py-3 font-mono">{c.strength}</td>
                        <td className="px-4 py-3 text-xs">
                          {ct ? <span><span className="font-mono text-[#002FA7] font-bold">{ct.abbreviation}</span> · {ct.name}</span> : <span className="text-[#71717A]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => { setForm({ ...empty, ...c, standard: c.standard || c.grade || '', division: c.division || c.section || '', class_teacher_id: c.class_teacher_id || '', section_id: c.section_id || '', facility_id: c.facility_id || '', shift_id: c.shift_id || '' }); setEditingId(c.id); setOpen(true); }} className="p-1.5 hover:bg-[#E4E4E7]" data-testid={`edit-class-${c.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => del(c.id)} className="p-1.5 hover:bg-[#FEE2E2] ml-1">
                            <Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="bg-white border border-[#D4D4D8] p-12 text-center text-sm text-[#71717A]">No classes match the filter. Clear filters or add a class.</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Class</DialogTitle>
            <DialogDescription className="text-xs text-[#71717A]">
              Identity = Standard + Division. Location = Facility + optional Room No. Operations = Shift + Strength + Class Teacher.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2 max-h-[72vh] overflow-y-auto pr-2">
            {/* Identity section */}
            <div className="border-l-2 border-[#002FA7] pl-4">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#002FA7] mb-3">IDENTITY</div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Standard *</Label>
                  <Input className="rounded-none mt-1.5" value={form.standard} onChange={(e) => setForm({ ...form, standard: e.target.value })} placeholder="Standard 5" data-testid="class-standard-input" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Division *</Label>
                  <Input className="rounded-none mt-1.5" value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} placeholder="A" data-testid="class-division-input" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Section</Label>
                  <Select value={form.section_id || 'none'} onValueChange={(v) => setForm({ ...form, section_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="rounded-none mt-1.5" data-testid="class-section-select"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.standard && form.division && (
                <div className="mt-3 text-xs text-[#52525B]">
                  Will save as: <span className="font-mono font-bold text-[#09090B]">{form.standard} · {form.division}</span>
                </div>
              )}
            </div>

            {/* Location section */}
            <div className="border-l-2 border-[#0EA5E9] pl-4">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#0EA5E9] mb-3">LOCATION</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Home Facility</Label>
                  <Select value={form.facility_id || 'none'} onValueChange={(v) => setForm({ ...form, facility_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="rounded-none mt-1.5" data-testid="class-facility-select"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.type[0]} · {f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="text-[10px] text-[#71717A] mt-1">Pick a Facility (indoor classroom / outdoor / lab) the class normally occupies.</div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Room No. (legacy)</Label>
                  <Input className="rounded-none mt-1.5" value={form.room_no} onChange={(e) => setForm({ ...form, room_no: e.target.value })} placeholder="201, Lab-A" />
                  <div className="text-[10px] text-[#71717A] mt-1">Optional. Use "Auto-match Facilities" to upgrade this to a Facility mapping.</div>
                </div>
              </div>
            </div>

            {/* Operations section */}
            <div className="border-l-2 border-[#10B981] pl-4">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#10B981] mb-3">OPERATIONS</div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Shift</Label>
                  <Select value={form.shift_id || 'none'} onValueChange={(v) => setForm({ ...form, shift_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="rounded-none mt-1.5" data-testid="class-shift-select"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {shifts.map((sh) => <SelectItem key={sh.id} value={sh.id}>{sh.name} · {sh.start_time}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Strength</Label>
                  <Input type="number" className="rounded-none mt-1.5" value={form.strength} onChange={(e) => setForm({ ...form, strength: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-[0.15em] font-bold">Class Teacher</Label>
                  <Select value={form.class_teacher_id || 'none'} onValueChange={(v) => setForm({ ...form, class_teacher_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="rounded-none mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.abbreviation} · {t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none" data-testid="save-class-btn">{editingId ? 'Update' : 'Create'} Class</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KPI({ label, value, Icon, accent }) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-start justify-between mb-3">
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">{label}</div>
      <div className="font-mono text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}
