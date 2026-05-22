import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Upload, Search, Pencil, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function Allotments() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [q, setQ] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('Standard 6 - A, MAT, 7\nStandard 6 - A, ENG, 6');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ class_id: '', subject_id: '', periods_per_week: 1 });
  const [editingId, setEditingId] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);

  const load = async () => {
    const [a, c, s] = await Promise.all([
      api.get(`/schools/${schoolId}/allotments`),
      api.get(`/schools/${schoolId}/classes`),
      api.get(`/schools/${schoolId}/subjects`),
    ]);
    setItems(a.data);
    setClasses(c.data);
    setSubjects(s.data);
  };
  useEffect(() => { load(); }, [schoolId]);

  const clsName = (id) => classes.find((c) => c.id === id)?.name || '—';
  const subOf = (id) => subjects.find((s) => s.id === id);

  const filtered = items.filter((it) => {
    if (!q) return true;
    const cn = clsName(it.class_id).toLowerCase();
    const sn = (subOf(it.subject_id)?.name || '').toLowerCase();
    const sc = (subOf(it.subject_id)?.code || '').toLowerCase();
    const t = q.toLowerCase();
    return cn.includes(t) || sn.includes(t) || sc.includes(t);
  });

  const save = async () => {
    if (!form.class_id || !form.subject_id) return toast.error('Class & subject required');
    try {
      if (editingId) await api.put(`/schools/${schoolId}/allotments/${editingId}`, form);
      else await api.post(`/schools/${schoolId}/allotments`, form);
      toast.success('Saved'); setEditOpen(false); load();
    } catch { toast.error('Failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this allotment?')) return;
    await api.delete(`/schools/${schoolId}/allotments/${id}`);
    load();
  };

  const runBulk = async () => {
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((l) => {
      const parts = l.split(',').map((p) => p.trim());
      return { class_name: parts[0], subject_code: parts[1], periods_per_week: parts[2] };
    });
    try {
      const res = await api.post(`/schools/${schoolId}/allotments/bulk`, { rows });
      setBulkResult(res.data);
      toast.success(`${res.data.created} created, ${res.data.updated} updated, ${res.data.errors.length} errors`);
      load();
    } catch { toast.error('Bulk failed'); }
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / ALLOTMENTS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Subject Allotments</h1>
          <div className="text-sm text-[#71717A] mt-2">Periods-per-week assigned to each class × subject pair.</div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search class or subject…" className="pl-9 rounded-none h-10 w-64" data-testid="allot-search" />
          </div>
          <Button onClick={() => setBulkOpen(true)} variant="outline" className="rounded-none border-[#D4D4D8] h-10" data-testid="bulk-import-btn">
            <Upload className="w-4 h-4 mr-2" /> Bulk Import
          </Button>
          <Button onClick={() => { setForm({ class_id: '', subject_id: '', periods_per_week: 1 }); setEditingId(null); setEditOpen(true); }} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-allotment-btn">
            New Allotment
          </Button>
        </div>
      </div>

      <div className="border border-[#D4D4D8] bg-white" data-testid="allotments-table">
        <table className="w-full text-sm">
          <thead className="border-b border-[#D4D4D8] bg-[#FAFAFA]">
            <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
              <th className="px-4 py-3">CLASS</th>
              <th className="px-4 py-3">SUBJECT</th>
              <th className="px-4 py-3">PERIODS / WEEK</th>
              <th className="px-4 py-3 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((it) => {
              const s = subOf(it.subject_id);
              return (
                <tr key={it.id} className="border-b border-[#E4E4E7] last:border-0 hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3 font-semibold">{clsName(it.class_id)}</td>
                  <td className="px-4 py-3">
                    {s && <span className="font-mono text-xs px-1.5 py-0.5 text-white mr-2" style={{ background: s.color }}>{s.code}</span>}
                    {s?.name}
                  </td>
                  <td className="px-4 py-3 font-mono">{it.periods_per_week}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setForm(it); setEditingId(it.id); setEditOpen(true); }} className="p-1.5 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(it.id)} className="p-1.5 hover:bg-[#FEE2E2] ml-1"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan="4" className="px-4 py-12 text-center text-sm text-[#71717A]">No allotments yet.</td></tr>}
          </tbody>
        </table>
        {filtered.length > 500 && <div className="px-4 py-2 text-xs text-[#71717A] bg-[#FAFAFA] border-t border-[#D4D4D8]">Showing first 500 of {filtered.length}.</div>}
      </div>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8] max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">Bulk Import Allotments</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Paste CSV (one row per line)</Label>
              <div className="text-xs text-[#71717A] mt-1.5 mb-2 font-mono">Format: class_name, subject_code, periods_per_week</div>
              <Textarea
                value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                rows={10} className="rounded-none font-mono text-xs" data-testid="bulk-csv-textarea"
              />
            </div>
            {bulkResult && (
              <div className="border border-[#D4D4D8] p-3 text-xs space-y-1">
                <div>Created: <strong className="text-[#10B981]">{bulkResult.created}</strong></div>
                <div>Updated: <strong className="text-[#0055FF]">{bulkResult.updated}</strong></div>
                <div>Errors: <strong className="text-[#FF3B30]">{bulkResult.errors.length}</strong></div>
                {bulkResult.errors.slice(0, 5).map((e) => (
                  <div key={`bulk-err-${e.row}`} className="font-mono text-[10px] text-[#FF3B30]">Row {e.row}: {e.error}</div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={runBulk} className="bg-[#002FA7] text-white rounded-none" data-testid="run-bulk-btn">
              <FileText className="w-4 h-4 mr-2" /> Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Allotment</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Class</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger className="rounded-none mt-1.5"><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Subject</Label>
              <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                <SelectTrigger className="rounded-none mt-1.5"><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Periods / Week</Label>
              <Input type="number" className="rounded-none mt-1.5" value={form.periods_per_week} onChange={(e) => setForm({ ...form, periods_per_week: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] text-white rounded-none" data-testid="save-allotment-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
