import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Sparkles, UserMinus, ArrowRight, ClipboardCheck, BellRing } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';

export default function Substitutions() {
  const { schoolId } = useParams();
  const [teachers, setTeachers] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [classes, setClasses] = useState([]);
  const [absent, setAbsent] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoResult, setAutoResult] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      const [t, p, c] = await Promise.all([
        api.get(`/schools/${schoolId}/teachers`),
        api.get(`/schools/${schoolId}/periods`),
        api.get(`/schools/${schoolId}/classes`),
      ]);
      setTeachers(t.data);
      setPeriods(p.data.sort((a, b) => a.order - b.order));
      setClasses(c.data);
    })();
  }, [schoolId]);

  const suggest = async () => {
    if (!absent) return toast.error('Pick an absent teacher');
    setLoading(true); setResult(null);
    try {
      const res = await api.post(`/schools/${schoolId}/substitutions/suggest`, {
        absent_teacher_id: absent, date,
      });
      setResult(res.data);
      if (res.data.affected_periods === 0) toast.info('No periods affected on this day');
      else toast.success(`${res.data.affected_periods} period(s) need cover`);
    } catch (e) { console.warn('suggest failed', e); toast.error('AI suggest failed'); }
    finally { setLoading(false); }
  };

  const confirm = async (cell_id, candidate, period_id, class_id) => {
    try {
      await api.post(`/schools/${schoolId}/substitutions`, {
        absent_teacher_id: absent,
        substitute_teacher_id: candidate.teacher_id,
        date, period_id, class_id, status: 'confirmed',
      });
      toast.success(`Assigned ${candidate.abbreviation}`);
    } catch { toast.error('Save failed'); }
  };

  const autoFromAttendance = async () => {
    setAutoLoading(true); setAutoResult(null);
    try {
      const res = await api.post(`/schools/${schoolId}/substitutions/auto-from-attendance`, { date });
      setAutoResult(res.data);
      toast.success(`Created ${res.data.substitutions_created} substitution(s) for ${res.data.absent_teachers.length} absent teacher(s)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Auto-suggest failed');
    } finally { setAutoLoading(false); }
  };

  const confirmAllAndNotify = async () => {
    try {
      const res = await api.post(`/schools/${schoolId}/substitutions/confirm-all-and-notify`, { date });
      const d = res.data || {};
      let msg;
      if (d.background) {
        msg = `Queued ${d.queued ?? 0} substitution(s) · job ${d.job_id}`;
      } else {
        msg = `Confirmed ${d.confirmed ?? 0} substitution(s)`;
      }
      if (d.twilio_configured === false) msg += ' · Twilio not configured — notifications skipped';
      toast.success(msg);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Confirm failed');
    }
  };

  const periodName = (id) => periods.find((p) => p.id === id)?.name || id;
  const className = (id) => classes.find((c) => c.id === id)?.name || id;

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">AI ASSIST / SUBSTITUTIONS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Stop-Gap Suggester</h1>
          <div className="text-sm text-[#71717A] mt-2">Mark a teacher absent — get ranked substitutes powered by Claude Sonnet 4.5.</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <Button onClick={autoFromAttendance} disabled={autoLoading} variant="outline" className="rounded-none border-[#10B981] text-[#10B981] hover:bg-[#10B981] hover:text-white h-11 px-5" data-testid="auto-from-attendance-btn">
          <ClipboardCheck className={`w-4 h-4 mr-2 ${autoLoading ? 'animate-spin' : ''}`} />
          {autoLoading ? 'Scanning…' : 'Auto-Suggest from Attendance'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="rounded-none border-[#002FA7] text-[#002FA7] hover:bg-[#002FA7] hover:text-white h-11 px-5" data-testid="confirm-all-notify-btn">
              <BellRing className="w-4 h-4 mr-2" />
              Confirm All & Notify
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent data-testid="confirm-all-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm All Substitutions?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark every <strong>suggested</strong> substitution for {date} as <strong>confirmed</strong> and queue WhatsApp/SMS notifications to each substitute teacher. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="confirm-all-cancel">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmAllAndNotify} data-testid="confirm-all-confirm" className="bg-[#002FA7] hover:bg-[#0055FF]">
                Confirm &amp; Notify
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      {autoResult && (
        <div className="border-l-2 border-[#10B981] bg-[#F0FDF4] p-4 mb-6" data-testid="auto-result">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="w-4 h-4 text-[#10B981]" />
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#10B981]">ATTENDANCE-BASED SUBSTITUTIONS</div>
          </div>
          <div className="text-xs font-mono mb-2">
            {autoResult.date} · {autoResult.day} · {autoResult.absent_teachers.length} absent · {autoResult.substitutions_created} substitutions created
          </div>
          {autoResult.absent_teachers.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {autoResult.absent_teachers.map((t) => (
                <span key={t.id} className="text-[10px] font-mono px-1.5 py-0.5 bg-[#FF3B30] text-white">{t.abbreviation || t.name}</span>
              ))}
            </div>
          )}
          {autoResult.items.length === 0 && <div className="text-xs text-[#71717A]">No scheduled cells affected.</div>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-px bg-[#D4D4D8] border border-[#D4D4D8]">
        {/* Form */}
        <div className="bg-white p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2"><UserMinus className="w-4 h-4 text-[#FF3B30]" /><div className="text-[10px] uppercase tracking-[0.2em] font-bold">ABSENCE</div></div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] font-bold">Teacher</Label>
            <Select value={absent} onValueChange={setAbsent}>
              <SelectTrigger className="rounded-none mt-1.5" data-testid="absent-teacher-select"><SelectValue placeholder="Pick teacher" /></SelectTrigger>
              <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.abbreviation} · {t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] font-bold">Date</Label>
            <Input type="date" className="rounded-none mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} data-testid="absent-date-input" />
          </div>
          <Button onClick={suggest} disabled={loading} className="w-full bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-11" data-testid="suggest-btn">
            <Sparkles className="w-4 h-4 mr-2" /> {loading ? 'Analyzing…' : 'Suggest Substitutes'}
          </Button>
          {result?.ai_commentary && (
            <div className="border-l-2 border-[#002FA7] bg-[#F0F4FF] p-3 text-xs leading-relaxed whitespace-pre-wrap font-mono" data-testid="ai-commentary">{result.ai_commentary}</div>
          )}
        </div>

        {/* Results */}
        <div className="bg-white p-6">
          {!result && <div className="text-sm text-[#71717A] text-center py-12">Pick a teacher and click "Suggest" to see AI-ranked candidates.</div>}
          {result && result.suggestions?.length === 0 && <div className="text-sm text-[#71717A] text-center py-12">No periods affected on this day.</div>}
          {result && result.suggestions?.length > 0 && (
            <div className="space-y-5" data-testid="suggestions-list">
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#71717A]">
                {result.affected_periods} period(s) · {result.day}
              </div>
              {result.suggestions.map((s) => (
                <div key={`${s.period_id}-${s.class_id}`} className="border border-[#D4D4D8] p-4">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#002FA7] text-white font-bold uppercase font-mono">{periodName(s.period_id)}</span>
                    <span className="text-xs font-mono text-[#71717A]">{className(s.class_id)}</span>
                    {s.subject_name && <span className="text-xs font-mono">· {s.subject_name}</span>}
                  </div>
                  <div className="space-y-1">
                    {s.top_candidates.map((c, j) => (
                      <div key={c.teacher_id || `${s.period_id}-${j}`} className="flex items-center gap-3 p-2 border border-[#E4E4E7] hover:bg-[#FAFAFA] group">
                        <div className="text-[10px] font-mono w-6 text-center text-[#71717A]">{j + 1}</div>
                        <div className="w-8 h-8 bg-[#002FA7] text-white text-[11px] font-bold flex items-center justify-center rounded-full">{c.abbreviation}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate">{c.name}</div>
                          <div className="text-[10px] text-[#71717A] font-mono truncate">{c.reasons.join(' · ')}</div>
                        </div>
                        <div className="text-xs font-mono font-bold">{c.score}</div>
                        <Button onClick={() => confirm(s.cell_id, c, s.period_id, s.class_id)} className="rounded-none h-8 bg-[#09090B] text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`assign-${i}-${j}`}>
                          Assign <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
