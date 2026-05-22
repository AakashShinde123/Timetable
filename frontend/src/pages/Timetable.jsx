import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Eraser, AlertTriangle, GripVertical, Wand2, Loader2, Sparkles, FileDown, Check, Activity as ActivityIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Timetable() {
  const { schoolId } = useParams();
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [labs, setLabs] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [allPeriods, setAllPeriods] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [cells, setCells] = useState([]);
  const [activeClass, setActiveClass] = useState('');
  const [activeShiftId, setActiveShiftId] = useState('');
  const [drag, setDrag] = useState(null);  // {type:'teacher'|'subject'|'lab', id}
  const [violations, setViolations] = useState({});
  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [activities, setActivities] = useState([]);
  const [actOpen, setActOpen] = useState(false);
  const [actForm, setActForm] = useState({ activity_id: '', day: 'Mon', period_id: '', facility_id: '', target_class_ids: [] });

  const load = useCallback(async () => {
    const [c, t, s, l, p, f, a, sh] = await Promise.all([
      api.get(`/schools/${schoolId}/classes`),
      api.get(`/schools/${schoolId}/teachers`),
      api.get(`/schools/${schoolId}/subjects`),
      api.get(`/schools/${schoolId}/labs`),
      api.get(`/schools/${schoolId}/periods`),
      api.get(`/schools/${schoolId}/facilities`),
      api.get(`/schools/${schoolId}/activities`),
      api.get(`/schools/${schoolId}/shifts`),
    ]);
    setClasses(c.data);
    setTeachers(t.data);
    setSubjects(s.data);
    setLabs(l.data);
    setAllPeriods(p.data.sort((a, b) => a.order - b.order));
    setShifts(sh.data);
    setFacilities(f.data);
    setActivities(a.data);
    setActiveClass((prev) => prev || c.data[0]?.id || '');
  }, [schoolId]);

  // Recompute the visible periods whenever the active class/shift or master data changes.
  useEffect(() => {
    if (!allPeriods.length) { setPeriods([]); return; }
    const validShiftIds = new Set(shifts.map((s) => s.id));
    const cls = classes.find((x) => x.id === activeClass);
    // Resolve effective shift: explicit selection > active class's shift > first shift
    const effectiveShift = activeShiftId
      || (cls?.shift_id && validShiftIds.has(cls.shift_id) ? cls.shift_id : '')
      || shifts[0]?.id || '';
    const visible = allPeriods.filter((p) => p.shift_id === effectiveShift);
    setPeriods(visible);
  }, [activeClass, activeShiftId, allPeriods, shifts, classes]);

  // When the user picks a class, auto-snap the shift selector to that class's shift
  useEffect(() => {
    const cls = classes.find((x) => x.id === activeClass);
    if (cls?.shift_id) setActiveShiftId(cls.shift_id);
  }, [activeClass, classes]);

  const classesInActiveShift = activeShiftId
    ? classes.filter((c) => c.shift_id === activeShiftId)
    : classes;

  const openActivityScheduler = () => {
    const firstPeriod = (periods.find((p) => !p.is_break) || periods[0])?.id || '';
    setActForm({ activity_id: '', day: 'Mon', period_id: firstPeriod, facility_id: '', target_class_ids: [] });
    setActOpen(true);
  };

  const onActivityPick = (id) => {
    const act = activities.find((x) => x.id === id);
    setActForm((f) => ({
      ...f, activity_id: id,
      facility_id: act?.facility_id || '',
      target_class_ids: act?.target_class_ids?.length ? act.target_class_ids : f.target_class_ids,
    }));
  };

  const scheduleActivity = async () => {
    if (!actForm.activity_id || !actForm.period_id) return toast.error('Pick activity + period');
    if (!actForm.target_class_ids.length) return toast.error('Pick at least one class');
    try {
      const payload = {
        activity_id: actForm.activity_id, day: actForm.day, period_id: actForm.period_id,
        class_ids: actForm.target_class_ids,
        facility_id: actForm.facility_id || null,
        replace: true,
      };
      const res = await api.post(`/schools/${schoolId}/timetable/place-activity`, payload);
      toast.success(`Scheduled across ${res.data.classes} class(es)`);
      setActOpen(false);
      if (activeClass) {
        const r = await api.get(`/schools/${schoolId}/timetable?class_id=${activeClass}`);
        setCells(r.data);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Place failed');
    }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeClass) return;
    (async () => {
      const res = await api.get(`/schools/${schoolId}/timetable?class_id=${activeClass}`);
      setCells(res.data);
    })();
  }, [activeClass, schoolId]);

  const cellMap = useMemo(() => {
    const m = {};
    cells.forEach((c) => { m[`${c.day}__${c.period_id}`] = c; });
    return m;
  }, [cells]);

  const onDrop = async (day, period_id) => {
    if (!drag || !activeClass) return;
    const existing = cellMap[`${day}__${period_id}`] || {};
    const payload = {
      class_id: activeClass, day, period_id,
      teacher_id: existing.teacher_id || null,
      subject_id: existing.subject_id || null,
      lab_id: existing.lab_id || null,
      facility_id: existing.facility_id || null,
    };
    if (drag.type === 'teacher') payload.teacher_id = drag.id;
    if (drag.type === 'subject') payload.subject_id = drag.id;
    if (drag.type === 'lab') payload.lab_id = drag.id;
    if (drag.type === 'facility') payload.facility_id = drag.id;
    try {
      const res = await api.put(`/schools/${schoolId}/timetable/cell`, payload);
      const clashes = res.data.clashes || [];
      const viols = res.data.violations || [];
      const hard = viols.filter((v) => v.severity === 'hard');
      if (clashes.length) {
        toast.warning(`Clash: ${clashes.map((c) => c.type).join(', ')}`);
      } else if (hard.length) {
        toast.error(`${hard.length} rule violation(s): ${hard[0].rule_name}`);
      } else if (viols.length) {
        toast.info(`${viols.length} soft warning(s)`);
      } else {
        toast.success('Cell updated');
      }
      setViolations({ ...violations, [`${day}__${period_id}`]: { clashes, viols } });
      const r = await api.get(`/schools/${schoolId}/timetable?class_id=${activeClass}`);
      setCells(r.data);
    } catch { toast.error('Failed'); }
    setDrag(null);
  };

  const clearCell = async (day, period_id) => {
    await api.delete(`/schools/${schoolId}/timetable/cell?class_id=${activeClass}&day=${day}&period_id=${period_id}`);
    const r = await api.get(`/schools/${schoolId}/timetable?class_id=${activeClass}`);
    setCells(r.data);
    const v = { ...violations };
    delete v[`${day}__${period_id}`];
    setViolations(v);
  };

  const autoGenerate = async () => {
    if (!activeClass) return;
    if (!window.confirm('Auto-generate timetable for this class? Existing cells will be replaced.')) return;
    setGenerating(true);
    try {
      const res = await api.post(`/schools/${schoolId}/timetable/auto-generate`, { class_id: activeClass, replace: true });
      const left = Object.entries(res.data.leftover_periods || {});
      toast.success(`Placed ${res.data.placed} cells${left.length ? '. Leftover: ' + left.map(([k, v]) => `${k}×${v}`).join(', ') : ''}`);
      const r = await api.get(`/schools/${schoolId}/timetable?class_id=${activeClass}`);
      setCells(r.data);
      setViolations({});
    } catch { toast.error('Auto-generate failed'); }
    setGenerating(false);
  };

  const optimizeWithAI = async () => {
    if (!activeClass) return;
    setOptimizing(true);
    setAiSuggestions(null);
    try {
      const res = await api.post(`/schools/${schoolId}/timetable/optimize`, { class_id: activeClass });
      setAiSuggestions(res.data);
      toast.success(`AI analyzed ${res.data.violations_before} violation(s) · ${res.data.structured?.length || 0} actionable move(s)`);
    } catch { toast.error('Optimize failed'); }
    setOptimizing(false);
  };

  const applySuggestion = async (move) => {
    try {
      await api.post(`/schools/${schoolId}/timetable/apply-suggestion`, { ...move, force: true });
      toast.success(`Applied: ${move.from_day}/${move.from_period} → ${move.to_day}/${move.to_period}`);
      const r = await api.get(`/schools/${schoolId}/timetable?class_id=${activeClass}`);
      setCells(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Apply failed'); }
  };

  const downloadPdf = () => {
    if (!activeClass) return;
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/schools/${schoolId}/timetable/pdf?class_id=${activeClass}`;
    window.open(url, '_blank');
  };


  const renderCell = (day, p) => {
    const cell = cellMap[`${day}__${p.id}`];
    if (p.is_break) {
      return <div className="bg-[#FAFAFA] border border-[#E4E4E7] py-3 text-center text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">BREAK</div>;
    }
    const teacher = teachers.find((t) => t.id === cell?.teacher_id);
    const subject = subjects.find((s) => s.id === cell?.subject_id);
    const lab = labs.find((l) => l.id === cell?.lab_id);
    const facility = facilities.find((f) => f.id === cell?.facility_id);
    const v = violations[`${day}__${p.id}`];
    const hasClash = v?.clashes?.length > 0;
    const hardV = (v?.viols || []).filter((x) => x.severity === 'hard');
    const softV = (v?.viols || []).filter((x) => x.severity === 'soft');
    let borderCls = 'border border-[#E4E4E7]';
    if (hasClash) borderCls = 'border-2 border-[#FF3B30]';
    else if (hardV.length) borderCls = 'border-2 border-[#FFCC00]';
    const violationTip = [
      ...(v?.clashes || []).map((c) => `Clash: ${c.type}`),
      ...hardV.map((x) => `HARD: ${x.rule_name}`),
      ...softV.map((x) => `SOFT: ${x.rule_name}`),
    ].join(' · ');
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
        onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
        onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); onDrop(day, p.id); }}
        className={`tt-cell bg-white ${borderCls} p-2 min-h-[64px] hover:border-[#002FA7] cursor-pointer transition-colors group relative`}
        title={violationTip}
        data-testid={`tt-cell-${day}-${p.id}`}
      >
        {subject && (
          <div className="text-[10px] font-bold font-mono px-1.5 py-0.5 inline-block text-white" style={{ background: subject.color }}>{subject.code}</div>
        )}
        {teacher && (
          <div className="text-xs font-mono font-bold mt-1 text-[#002FA7]">{teacher.abbreviation}</div>
        )}
        {lab && <div className="text-[10px] text-[#8B5CF6] mt-0.5">{lab.name}</div>}
        {facility && <div className="text-[10px] text-[#0EA5E9] mt-0.5">@ {facility.name}</div>}
        {(hasClash || hardV.length > 0) && (
          <AlertTriangle className="w-3 h-3 text-[#FF3B30] absolute top-1 left-1" />
        )}
        {(cell?.teacher_id || cell?.subject_id || cell?.lab_id) && (
          <button onClick={(e) => { e.stopPropagation(); clearCell(day, p.id); }} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#FEE2E2]" data-testid={`clear-${day}-${p.id}`}>
            <Eraser className="w-3 h-3 text-[#FF3B30]" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-8 lg:p-12">
      <div className="flex items-end justify-between gap-6 mb-8 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">BUILDER / TIMETABLE</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Drag & Drop Timetable</h1>
          <div className="text-sm text-[#71717A] mt-2">Drag teachers, subjects, or labs from the right panel into the grid.</div>
        </div>
        <div className="min-w-[280px] flex items-end gap-3 flex-wrap">
          {shifts.length > 1 && (
            <div className="min-w-[180px]">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold mb-1.5">SHIFT</div>
              <Select value={activeShiftId || shifts[0]?.id} onValueChange={(v) => { setActiveShiftId(v); setActiveClass(''); }}>
                <SelectTrigger className="rounded-none h-10" data-testid="shift-select"><SelectValue placeholder="Pick a shift" /></SelectTrigger>
                <SelectContent>{shifts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.start_time}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex-1 min-w-[200px]">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold mb-1.5">SELECT CLASS{shifts.length > 1 ? ` · ${classesInActiveShift.length} in shift` : ''}</div>
            <Select value={activeClass} onValueChange={setActiveClass}>
              <SelectTrigger className="rounded-none h-10" data-testid="class-select"><SelectValue placeholder="Pick a class" /></SelectTrigger>
              <SelectContent>{classesInActiveShift.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={autoGenerate} disabled={!activeClass || generating} className="rounded-none h-10 bg-[#002FA7] hover:bg-[#0055FF] text-white" data-testid="auto-gen-btn">
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
            Auto-Generate
          </Button>
          <Button onClick={optimizeWithAI} disabled={!activeClass || optimizing} variant="outline" className="rounded-none h-10 border-[#002FA7] text-[#002FA7] hover:bg-[#002FA7] hover:text-white" data-testid="ai-optimize-btn">
            {optimizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            AI Optimize
          </Button>
          <Button onClick={openActivityScheduler} disabled={!periods.length} variant="outline" className="rounded-none h-10 border-[#FFCC00] text-[#09090B] hover:bg-[#FFCC00]" data-testid="schedule-activity-btn">
            <ActivityIcon className="w-4 h-4 mr-2" /> Activity
          </Button>
          <Button onClick={downloadPdf} disabled={!activeClass} variant="outline" className="rounded-none h-10 border-[#D4D4D8]" data-testid="pdf-class-btn">
            <FileDown className="w-4 h-4 mr-2" /> PDF
          </Button>
        </div>
      </div>

      <Dialog open={actOpen} onOpenChange={setActOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl tracking-tighter">Schedule Activity</DialogTitle>
            <DialogDescription className="text-xs text-[#71717A]">Broadcast an activity across multiple classes at the same period.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Activity *</Label>
              <Select value={actForm.activity_id} onValueChange={onActivityPick}>
                <SelectTrigger className="rounded-none mt-1.5" data-testid="activity-pick"><SelectValue placeholder="Pick activity" /></SelectTrigger>
                <SelectContent>{activities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {(a.type || 'Indoor')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Day</Label>
                <Select value={actForm.day} onValueChange={(v) => setActForm({ ...actForm, day: v })}>
                  <SelectTrigger className="rounded-none mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Period *</Label>
                <Select value={actForm.period_id} onValueChange={(v) => setActForm({ ...actForm, period_id: v })}>
                  <SelectTrigger className="rounded-none mt-1.5" data-testid="activity-period"><SelectValue placeholder="Period" /></SelectTrigger>
                  <SelectContent>{periods.filter((p) => !p.is_break).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.start_time}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Facility (overrides activity default)</Label>
              <Select value={actForm.facility_id || 'none'} onValueChange={(v) => setActForm({ ...actForm, facility_id: v === 'none' ? '' : v })}>
                <SelectTrigger className="rounded-none mt-1.5"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {facilities.map((f) => <SelectItem key={f.id} value={f.id}>{f.type[0]} · {f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Target Classes ({actForm.target_class_ids.length})</Label>
                <button type="button" onClick={() => setActForm((f) => ({ ...f, target_class_ids: f.target_class_ids.length === classes.length ? [] : classes.map((c) => c.id) }))} className="text-[10px] uppercase tracking-wider font-bold text-[#002FA7]">
                  {actForm.target_class_ids.length === classes.length ? 'Clear' : 'All'}
                </button>
              </div>
              <div className="max-h-44 overflow-y-auto border border-[#E4E4E7] p-2 grid grid-cols-2 md:grid-cols-3 gap-1">
                {classes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs px-2 py-1 hover:bg-[#FAFAFA] cursor-pointer">
                    <input type="checkbox" checked={actForm.target_class_ids.includes(c.id)} onChange={() => setActForm((f) => ({ ...f, target_class_ids: f.target_class_ids.includes(c.id) ? f.target_class_ids.filter((x) => x !== c.id) : [...f.target_class_ids, c.id] }))} />
                    <span>{c.standard || c.grade} · {c.division || c.section}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={scheduleActivity} className="bg-[#002FA7] text-white rounded-none" data-testid="confirm-schedule-activity">Schedule</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {!activeClass ? (
        <div className="bg-white border border-[#D4D4D8] p-12 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto text-[#FFCC00] mb-3" />
          <h3 className="font-heading text-xl font-black tracking-tighter">No classes</h3>
          <p className="text-sm text-[#71717A] mt-2">Create classes and periods first.</p>
        </div>
      ) : (
        <>
        {aiSuggestions && (
          <div className="border-l-2 border-[#002FA7] bg-[#F0F4FF] p-4 mb-6" data-testid="ai-suggestions">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#002FA7]" />
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#002FA7]">AI OPTIMIZATION REPORT</div>
              </div>
              <div className="flex gap-3 text-[10px] font-mono uppercase tracking-wider">
                <span>Total: <strong>{aiSuggestions.violations_before}</strong></span>
                <span className="text-[#FF3B30]">Hard: <strong>{aiSuggestions.hard ?? '—'}</strong></span>
                <span className="text-[#FFCC00]">Soft: <strong>{aiSuggestions.soft ?? '—'}</strong></span>
              </div>
            </div>
            {(aiSuggestions.structured || []).length > 0 && (
              <div className="mb-3 space-y-2">
                {aiSuggestions.structured.map((mv, i) => (
                  <div key={`${mv.type}-${mv.from_day}-${mv.from_period}-${mv.to_day}-${mv.to_period}-${i}`} className="bg-white border border-[#D4D4D8] p-3 flex items-start gap-3" data-testid={`suggestion-${i}`}>
                    <div className="text-[10px] font-mono w-6 text-center text-[#71717A] pt-0.5">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono uppercase mb-1">
                        <span className="px-1.5 py-0.5 bg-[#09090B] text-white">{mv.type?.toUpperCase()}</span>
                        <span className="ml-2 text-[#52525B]">{mv.class_name}</span>
                      </div>
                      <div className="text-sm font-mono">
                        <span className="text-[#FF3B30]">{mv.from_day} · {mv.from_period}</span>
                        <span className="mx-2 text-[#71717A]">→</span>
                        <span className="text-[#10B981]">{mv.to_day} · {mv.to_period}</span>
                      </div>
                      {mv.reason && <div className="text-xs text-[#71717A] mt-1">{mv.reason}</div>}
                    </div>
                    <Button onClick={() => applySuggestion(mv)} className="rounded-none bg-[#002FA7] text-white h-8 text-xs" data-testid={`apply-suggestion-${i}`}>
                      <Check className="w-3 h-3 mr-1" /> Apply
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <details className="bg-white p-3 border border-[#D4D4D8]">
              <summary className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#71717A] cursor-pointer">RAW AI COMMENTARY</summary>
              <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed text-[#09090B] max-h-72 overflow-y-auto mt-2">{aiSuggestions.suggestions}</pre>
            </details>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div className="overflow-x-auto" data-testid="timetable-grid">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="bg-[#09090B] text-white text-[10px] uppercase tracking-[0.2em] font-bold p-2 w-24">PERIOD</th>
                  {DAYS.map((d) => <th key={d} className="bg-[#09090B] text-white text-[10px] uppercase tracking-[0.2em] font-bold p-2">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td className="bg-[#FAFAFA] border border-[#E4E4E7] p-2 text-xs">
                      <div className="font-bold">{p.name}</div>
                      <div className="font-mono text-[#71717A] text-[10px]">{p.start_time}-{p.end_time}</div>
                    </td>
                    {DAYS.map((d) => <td key={d} className="p-0">{renderCell(d, p)}</td>)}
                  </tr>
                ))}
                {periods.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-sm text-[#71717A] border border-[#E4E4E7] bg-white">No periods. Add them under Shifts & Periods.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Palette */}
          <div className="space-y-6">
            <Palette title="Teachers" items={teachers.map((t) => ({ id: t.id, label: `${t.abbreviation} · ${t.name}`, abbr: t.abbreviation }))} onDragStart={(id) => setDrag({ type: 'teacher', id })} color="#002FA7" />
            <Palette title="Subjects" items={subjects.map((s) => ({ id: s.id, label: `${s.code} · ${s.name}`, abbr: s.code, color: s.color }))} onDragStart={(id) => setDrag({ type: 'subject', id })} color="#0055FF" />
            <Palette title="Labs" items={labs.map((l) => ({ id: l.id, label: l.name }))} onDragStart={(id) => setDrag({ type: 'lab', id })} color="#8B5CF6" />
            <Palette title="Facilities" items={facilities.map((f) => ({ id: f.id, label: `${f.type[0]} · ${f.name}`, abbr: f.type[0] }))} onDragStart={(id) => setDrag({ type: 'facility', id })} color="#0EA5E9" />
          </div>
        </div>
        </>
      )}
    </div>
  );
}

function Palette({ title, items, onDragStart, color }) {
  return (
    <div className="bg-white border border-[#D4D4D8]">
      <div className="px-3 py-2 border-b border-[#D4D4D8] flex items-center justify-between" style={{ background: color }}>
        <div className="text-[10px] uppercase tracking-[0.2em] text-white font-bold">{title}</div>
        <div className="text-[10px] text-white/70 font-mono">{items.length}</div>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2 space-y-1">
        {items.map((it) => (
          <div
            key={it.id}
            draggable
            onDragStart={() => onDragStart(it.id)}
            data-testid={`palette-${title.toLowerCase()}-${it.id}`}
            className="flex items-center gap-2 px-2 py-1.5 border border-[#E4E4E7] hover:border-[#002FA7] cursor-grab active:cursor-grabbing bg-white text-xs"
          >
            <GripVertical className="w-3 h-3 text-[#71717A]" />
            {it.abbr && <span className="font-mono font-bold text-[10px] px-1.5 py-0.5" style={{ background: it.color || color, color: 'white' }}>{it.abbr}</span>}
            <span className="truncate">{it.label}</span>
          </div>
        ))}
        {items.length === 0 && <div className="text-xs text-[#71717A] py-4 text-center">None</div>}
      </div>
    </div>
  );
}
