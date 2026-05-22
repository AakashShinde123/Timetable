import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, Clock, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Shifts() {
  const { schoolId } = useParams();
  const [shifts, setShifts] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [activeShift, setActiveShift] = useState(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ name: '', start_time: '07:30', end_time: '13:30' });
  const [periodForm, setPeriodForm] = useState({ name: '', start_time: '', end_time: '', is_break: false, order: 0, shift_id: '' });
  const [editingPeriod, setEditingPeriod] = useState(null);
  const [editingShift, setEditingShift] = useState(null);

  const load = async () => {
    const [sh, pr] = await Promise.all([
      api.get(`/schools/${schoolId}/shifts`),
      api.get(`/schools/${schoolId}/periods`),
    ]);
    setShifts(sh.data);
    setPeriods(pr.data);
    if (!activeShift && sh.data[0]) setActiveShift(sh.data[0].id);
  };
  useEffect(() => { load(); }, [schoolId]);

  const cleanupOrphans = async () => {
    if (!window.confirm('Remove orphaned periods (whose parent shift was deleted) and dedupe periods with same name+order in the same shift?')) return;
    try {
      const res = await api.post(`/schools/${schoolId}/shifts/cleanup-orphans`);
      toast.success(`Removed ${res.data.orphans_deleted} orphan(s) · ${res.data.duplicates_deleted} duplicate(s)`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Cleanup failed'); }
  };

  const saveShift = async () => {
    if (!shiftForm.name) return toast.error('Name required');
    try {
      if (editingShift) await api.put(`/schools/${schoolId}/shifts/${editingShift}`, shiftForm);
      else await api.post(`/schools/${schoolId}/shifts`, shiftForm);
      setShiftOpen(false); toast.success('Saved'); load();
    } catch { toast.error('Failed'); }
  };

  const savePeriod = async () => {
    if (!periodForm.name) return toast.error('Name required');
    const payload = { ...periodForm, shift_id: activeShift };
    try {
      if (editingPeriod) await api.put(`/schools/${schoolId}/periods/${editingPeriod}`, payload);
      else await api.post(`/schools/${schoolId}/periods`, payload);
      setPeriodOpen(false); toast.success('Saved'); load();
    } catch { toast.error('Failed'); }
  };

  const delShift = async (id) => {
    if (!window.confirm('Delete shift and its periods?')) return;
    await api.delete(`/schools/${schoolId}/shifts/${id}`);
    load();
  };
  const delPeriod = async (id) => {
    if (!window.confirm('Delete period?')) return;
    await api.delete(`/schools/${schoolId}/periods/${id}`);
    load();
  };

  const activePeriods = periods.filter((p) => p.shift_id === activeShift).sort((a, b) => a.order - b.order);

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">MASTERS / SHIFTS & PERIODS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Shifts & Periods</h1>
        </div>
        <div className="flex gap-3">
          <Button onClick={cleanupOrphans} variant="outline" className="rounded-none border-[#D4D4D8] h-10" data-testid="cleanup-orphans-btn">
            <Wand2 className="w-4 h-4 mr-2" /> Clean Orphans
          </Button>
          <Button onClick={() => { setShiftForm({ name: '', start_time: '07:30', end_time: '13:30' }); setEditingShift(null); setShiftOpen(true); }} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-shift-btn">
            <Plus className="w-4 h-4 mr-2" /> New Shift
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-px bg-[#D4D4D8] border border-[#D4D4D8] mb-8">
        {shifts.map((s) => (
          <div
            key={s.id}
            onClick={() => setActiveShift(s.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveShift(s.id); } }}
            role="button"
            tabIndex={0}
            data-testid={`shift-${s.id}`}
            className={`bg-white p-5 text-left transition-all cursor-pointer ${activeShift === s.id ? 'bg-[#F4F4F5]' : 'hover:bg-[#FAFAFA]'}`}
          >
            <div className="flex items-start justify-between mb-3">
              <Clock className="w-5 h-5 text-[#F97316]" />
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); setShiftForm(s); setEditingShift(s.id); setShiftOpen(true); }} className="p-1 hover:bg-[#E4E4E7]"><Pencil className="w-3 h-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); delShift(s.id); }} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3 h-3 text-[#FF3B30]" /></button>
              </div>
            </div>
            <h3 className="font-heading text-xl font-black tracking-tighter">{s.name}</h3>
            <div className="text-xs font-mono text-[#52525B] mt-1">{s.start_time} → {s.end_time}</div>
          </div>
        ))}
        {shifts.length === 0 && <div className="col-span-full bg-white p-8 text-center text-sm text-[#71717A]">No shifts yet</div>}
      </div>

      {activeShift && (
        <>
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-heading text-2xl font-black tracking-tighter">Periods</h2>
            <Button onClick={() => { setPeriodForm({ name: '', start_time: '08:00', end_time: '08:45', is_break: false, order: activePeriods.length, shift_id: activeShift }); setEditingPeriod(null); setPeriodOpen(true); }} className="rounded-none bg-[#09090B] text-white h-9" data-testid="new-period-btn">
              <Plus className="w-3.5 h-3.5 mr-2" /> Add Period
            </Button>
          </div>
          <div className="border border-[#D4D4D8] bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-[#D4D4D8] bg-[#FAFAFA]">
                <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
                  <th className="px-4 py-3">#</th><th className="px-4 py-3">NAME</th><th className="px-4 py-3">START</th><th className="px-4 py-3">END</th><th className="px-4 py-3">TYPE</th><th className="px-4 py-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {activePeriods.map((p, i) => (
                  <tr key={p.id} className="border-b border-[#E4E4E7] last:border-0 hover:bg-[#FAFAFA]" data-testid={`period-row-${p.id}`}>
                    <td className="px-4 py-3 font-mono text-[#71717A]">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold">{p.name}</td>
                    <td className="px-4 py-3 font-mono">{p.start_time}</td>
                    <td className="px-4 py-3 font-mono">{p.end_time}</td>
                    <td className="px-4 py-3">{p.is_break ? <span className="text-[10px] px-1.5 py-0.5 bg-[#FFCC00] font-bold">BREAK</span> : <span className="text-[10px] px-1.5 py-0.5 bg-[#E5E7EB] font-bold">CLASS</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setPeriodForm(p); setEditingPeriod(p.id); setPeriodOpen(true); }} className="p-1.5 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => delPeriod(p.id)} className="p-1.5 hover:bg-[#FEE2E2] ml-1"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
                    </td>
                  </tr>
                ))}
                {activePeriods.length === 0 && <tr><td colSpan="6" className="px-4 py-8 text-center text-sm text-[#71717A]">No periods</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingShift ? 'Edit' : 'New'} Shift</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
              <Input className="rounded-none mt-1.5" value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} data-testid="shift-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Start</Label>
                <Input type="time" className="rounded-none mt-1.5" value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">End</Label>
                <Input type="time" className="rounded-none mt-1.5" value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveShift} className="bg-[#002FA7] text-white rounded-none" data-testid="save-shift-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingPeriod ? 'Edit' : 'New'} Period</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
              <Input className="rounded-none mt-1.5" value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} data-testid="period-name-input" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Start</Label>
                <Input type="time" className="rounded-none mt-1.5" value={periodForm.start_time} onChange={(e) => setPeriodForm({ ...periodForm, start_time: e.target.value })} /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">End</Label>
                <Input type="time" className="rounded-none mt-1.5" value={periodForm.end_time} onChange={(e) => setPeriodForm({ ...periodForm, end_time: e.target.value })} /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Order</Label>
                <Input type="number" className="rounded-none mt-1.5" value={periodForm.order} onChange={(e) => setPeriodForm({ ...periodForm, order: parseInt(e.target.value) || 0 })} /></div>
              <div className="flex items-end gap-2"><Checkbox id="brk" checked={periodForm.is_break} onCheckedChange={(c) => setPeriodForm({ ...periodForm, is_break: !!c })} /><Label htmlFor="brk" className="text-sm">Is Break</Label></div>
            </div>
          </div>
          <DialogFooter><Button onClick={savePeriod} className="bg-[#002FA7] text-white rounded-none" data-testid="save-period-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
