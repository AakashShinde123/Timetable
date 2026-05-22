import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Search, Upload, X, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const empty = {
  name: '', abbreviation: '', email: '', phone: '', photo: null,
  qualifications: '', max_periods_per_day: 6, max_periods_per_week: 30,
  notes: '', is_class_teacher: false, subjects: [],
};

export default function Teachers() {
  const { schoolId } = useParams();
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [q, setQ] = useState('');
  const fileRef = useRef(null);

  const load = async () => {
    try {
      const [tRes, sRes] = await Promise.all([
        api.get(`/schools/${schoolId}/teachers`),
        api.get(`/schools/${schoolId}/subjects`),
      ]);
      setTeachers(tRes.data);
      setSubjects(sRes.data);
    } catch { toast.error('Load failed'); }
  };

  useEffect(() => { load(); }, [schoolId]);

  const openNew = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (t) => {
    setForm({ ...empty, ...t });
    setEditingId(t.id);
    setOpen(true);
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) return toast.error('Max 1.5 MB');
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, photo: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name || !form.abbreviation) return toast.error('Name & abbreviation required');
    try {
      if (editingId) {
        await api.put(`/schools/${schoolId}/teachers/${editingId}`, form);
        toast.success('Updated');
      } else {
        await api.post(`/schools/${schoolId}/teachers`, form);
        toast.success('Teacher added');
      }
      setOpen(false);
      load();
    } catch { toast.error('Save failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this teacher?')) return;
    await api.delete(`/schools/${schoolId}/teachers/${id}`);
    load();
  };

  const filtered = teachers.filter((t) =>
    !q || t.name?.toLowerCase().includes(q.toLowerCase()) || t.abbreviation?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / TEACHERS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Teachers</h1>
          <div className="text-sm text-[#71717A] mt-2">Abbreviations are stored in UPPERCASE automatically.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9 rounded-none h-10 w-64" data-testid="teacher-search" />
          </div>
          <Button onClick={openNew} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-teacher-btn">
            <Plus className="w-4 h-4 mr-2" /> New Teacher
          </Button>
        </div>
      </div>

      <div className="border border-[#D4D4D8] bg-white" data-testid="teachers-table">
        <table className="w-full text-sm">
          <thead className="border-b border-[#D4D4D8] bg-[#FAFAFA]">
            <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
              <th className="px-4 py-3 w-12"></th>
              <th className="px-4 py-3">ABBR.</th>
              <th className="px-4 py-3">NAME</th>
              <th className="px-4 py-3">SUBJECTS</th>
              <th className="px-4 py-3">CLASS TEACHER</th>
              <th className="px-4 py-3">MAX/DAY</th>
              <th className="px-4 py-3 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-[#E4E4E7] last:border-0 hover:bg-[#FAFAFA]" data-testid={`teacher-row-${t.id}`}>
                <td className="px-4 py-3">
                  {t.photo ? (
                    <img src={t.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 bg-[#002FA7] text-white text-[11px] font-bold flex items-center justify-center rounded-full">{t.abbreviation}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono font-bold text-[#002FA7]">{t.abbreviation}</td>
                <td className="px-4 py-3 font-semibold">{t.name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(t.subjects || []).slice(0, 3).map((sid) => {
                      const s = subjects.find((x) => x.id === sid);
                      return s ? (
                        <span key={sid} className="text-[10px] px-1.5 py-0.5 border" style={{ borderColor: s.color, color: s.color }}>{s.code}</span>
                      ) : null;
                    })}
                  </div>
                </td>
                <td className="px-4 py-3">{t.is_class_teacher ? <span className="text-[#10B981] text-xs font-bold uppercase">YES</span> : <span className="text-[#71717A] text-xs">—</span>}</td>
                <td className="px-4 py-3 font-mono">{t.max_periods_per_day}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => navigate(`/school/${schoolId}/teacher/${t.id}`)} className="p-1.5 hover:bg-[#E4E4E7]" title="View Schedule" data-testid={`view-schedule-${t.id}`}><Calendar className="w-3.5 h-3.5 text-[#002FA7]" /></button>
                  <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-[#E4E4E7] ml-1" data-testid={`edit-teacher-${t.id}`}><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(t.id)} className="p-1.5 hover:bg-[#FEE2E2] ml-1" data-testid={`delete-teacher-${t.id}`}><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-12 text-center text-sm text-[#71717A]">No teachers yet. Click "New Teacher" or seed Sri Ma Vidyalaya.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit Teacher' : 'New Teacher'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-4">
              <div className="w-24 h-24 border border-[#D4D4D8] flex items-center justify-center bg-[#FAFAFA] flex-shrink-0">
                {form.photo ? (
                  <img src={form.photo} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] uppercase text-[#71717A]">No photo</span>
                )}
              </div>
              <div className="flex-1">
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Photo (max 1.5 MB)</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Button variant="outline" type="button" onClick={() => fileRef.current?.click()} className="rounded-none border-[#D4D4D8]" data-testid="upload-photo-btn">
                    <Upload className="w-3.5 h-3.5 mr-2" /> Upload
                  </Button>
                  <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                  {form.photo && (
                    <Button variant="outline" type="button" onClick={() => setForm({ ...form, photo: null })} className="rounded-none border-[#D4D4D8]">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Full Name *</Label>
                <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="teacher-name-input" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Abbreviation *</Label>
                <Input className="rounded-none mt-1.5 uppercase font-mono" value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value.toUpperCase() })} maxLength={4} data-testid="teacher-abbr-input" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Email</Label>
                <Input className="rounded-none mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Phone</Label>
                <Input className="rounded-none mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Max Periods / Day</Label>
                <Input type="number" className="rounded-none mt-1.5" value={form.max_periods_per_day} onChange={(e) => setForm({ ...form, max_periods_per_day: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Max Periods / Week</Label>
                <Input type="number" className="rounded-none mt-1.5" value={form.max_periods_per_week} onChange={(e) => setForm({ ...form, max_periods_per_week: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Qualifications</Label>
              <Input className="rounded-none mt-1.5" value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold mb-2 block">Subjects Taught</Label>
              <div className="flex flex-wrap gap-2 p-3 border border-[#D4D4D8] max-h-32 overflow-y-auto">
                {subjects.length === 0 && <span className="text-xs text-[#71717A]">Add subjects first under Subjects master.</span>}
                {subjects.map((s) => {
                  const active = (form.subjects || []).includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setForm({ ...form, subjects: active ? form.subjects.filter((x) => x !== s.id) : [...(form.subjects || []), s.id] })}
                      className={`text-xs px-2 py-1 border transition-all ${active ? 'text-white' : 'bg-white'}`}
                      style={{ backgroundColor: active ? s.color : 'white', borderColor: s.color, color: active ? 'white' : s.color }}
                    >
                      {s.code} · {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox id="ct" checked={form.is_class_teacher} onCheckedChange={(c) => setForm({ ...form, is_class_teacher: !!c })} data-testid="class-teacher-checkbox" />
              <Label htmlFor="ct" className="text-sm">Class Teacher</Label>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Notes</Label>
              <Textarea className="rounded-none mt-1.5" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none" data-testid="save-teacher-btn">{editingId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
