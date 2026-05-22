import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  Users, BookOpen, School2, FlaskConical, Clock, SlidersHorizontal,
  CalendarRange, UserMinus, ArrowUpRight, Activity, Building, Layers, ShieldAlert, AlertTriangle, RefreshCw, ClipboardCheck, Zap, Save,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';

const TILES = [
  { key: 'teachers', icon: Users, label: 'Teachers', accent: '#002FA7' },
  { key: 'subjects', icon: BookOpen, label: 'Subjects', accent: '#0055FF' },
  { key: 'sections', icon: Layers, label: 'Sections', accent: '#06B6D4' },
  { key: 'classes', icon: School2, label: 'Classes', accent: '#10B981' },
  { key: 'facilities', icon: Building, label: 'Facilities', accent: '#0EA5E9', to: 'facilities' },
  { key: 'activities', icon: Activity, label: 'Activities', accent: '#FFCC00', to: 'activities' },
  { key: 'attendance', icon: ClipboardCheck, label: 'Attendance', accent: '#8B5CF6', to: 'attendance', skipStat: true },
  { key: 'constraints', icon: SlidersHorizontal, label: 'Constraints', accent: '#FF3B30' },
];

function todayName() {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function SchoolDashboard() {
  const { schoolId } = useParams();
  const [school, setSchool] = useState(null);
  const [stats, setStats] = useState({});
  const [stopgaps, setStopgaps] = useState({ items: [], loading: true });
  const [devices, setDevices] = useState([]);
  const [autoSync, setAutoSync] = useState({ enabled: false, times: '', device_id: '', auto_confirm: false, notify_late: true });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const loadAutoSync = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get(`/schools/${schoolId}`),
        api.get(`/schools/${schoolId}/essl-devices`),
      ]);
      setSchool(s.data);
      setDevices(d.data);
      setAutoSync({
        enabled: !!s.data.auto_sync_enabled,
        times: (s.data.auto_sync_times && s.data.auto_sync_times.length
                  ? s.data.auto_sync_times
                  : [s.data.auto_sync_time || '07:30']).join(', '),
        device_id: s.data.auto_sync_essl_device_id || '',
        auto_confirm: !!s.data.auto_confirm_substitutions,
        notify_late: s.data.notify_latecomers !== false,
      });
    } catch (e) { console.warn('loadAutoSync failed', e); }
  }, [schoolId]);

  const saveAutoSync = async () => {
    setSaving(true);
    try {
      // Parse "07:10, 07:15, 07:25" → ["07:10","07:15","07:25"]
      const parsed = autoSync.times
        .split(/[,\s]+/).filter(Boolean)
        .map((t) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
          if (!m) return null;
          const hh = Math.min(23, Math.max(0, parseInt(m[1])));
          const mm = Math.min(59, Math.max(0, parseInt(m[2])));
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        })
        .filter(Boolean);
      if (autoSync.enabled && parsed.length === 0) {
        toast.error('Add at least one time in HH:MM format');
        setSaving(false); return;
      }
      await api.put(`/schools/${schoolId}`, {
        auto_sync_enabled: autoSync.enabled,
        auto_sync_times: parsed,
        auto_sync_time: parsed[0] || '07:30',
        auto_sync_essl_device_id: autoSync.device_id || null,
        auto_confirm_substitutions: autoSync.auto_confirm,
        notify_latecomers: autoSync.notify_late,
      });
      toast.success(`Auto-Sync saved · ${parsed.length} fire time(s)`);
      loadAutoSync();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    setSaving(false);
  };

  const runAutoSyncNow = async () => {
    setRunning(true);
    try {
      await api.post(`/schools/${schoolId}/autosync/run-now`);
      toast.success('Auto-Sync triggered — check Substitutions for new suggestions');
      loadStopgaps();
    } catch (e) { toast.error(e.response?.data?.detail || 'Run failed'); }
    setRunning(false);
  };

  const loadStopgaps = useCallback(async () => {
    setStopgaps((s) => ({ ...s, loading: true }));
    try {
      const today = todayISO();
      const [subs, teachers] = await Promise.all([
        api.get(`/schools/${schoolId}/substitutions`),
        api.get(`/schools/${schoolId}/teachers`),
      ]);
      const tMap = Object.fromEntries(teachers.data.map((t) => [t.id, t]));
      const items = (subs.data || [])
        .filter((s) => s.date === today)
        .map((s) => ({
          ...s,
          absent: tMap[s.absent_teacher_id],
          substitute: s.substitute_teacher_id ? tMap[s.substitute_teacher_id] : null,
        }));
      setStopgaps({ items, loading: false });
    } catch (e) {
      console.warn('loadStopgaps failed', e);
      setStopgaps({ items: [], loading: false });
    }
  }, [schoolId]);

  useEffect(() => {
    (async () => {
      try {
        const [s, st] = await Promise.all([
          api.get(`/schools/${schoolId}`),
          api.get(`/schools/${schoolId}/stats`),
        ]);
        setSchool(s.data);
        setStats(st.data);
      } catch (e) { console.warn('dashboard load failed', e); }
    })();
    loadStopgaps();
    loadAutoSync();
  }, [schoolId, loadStopgaps, loadAutoSync]);

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="mb-12 pb-8 border-b border-[#D4D4D8]">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3" data-testid="school-dashboard-label">
          WORKSPACE / DASHBOARD
        </div>
        <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95] text-[#09090B] mb-3">
          {school?.name || '—'}
        </h1>
        <div className="text-sm text-[#52525B]">{school?.location} · {school?.board}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#D4D4D8] border border-[#D4D4D8] mb-12" data-testid="stats-grid">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.key} to={t.to || t.key} className="bg-white p-6 hover:bg-[#FAFAFA] transition-all group block" data-testid={`stat-${t.key}`}>
              <div className="flex items-start justify-between mb-4">
                <Icon className="w-5 h-5" style={{ color: t.accent }} />
                <ArrowUpRight className="w-4 h-4 text-[#71717A] group-hover:text-[#002FA7] transition-colors" />
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold mb-1">{t.label}</div>
              <div className="font-mono text-3xl font-bold">{stats[t.key] ?? '—'}</div>
            </Link>
          );
        })}
      </div>

      {/* Auto-Sync settings */}
      <div className="bg-white border border-[#D4D4D8] mb-12" data-testid="autosync-widget">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[#D4D4D8] bg-[#FAFAFA]">
          <Zap className="w-4 h-4 text-[#FFCC00]" />
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold">DAILY AUTO-SYNC</div>
          {school?.last_autosync_at && <span className="font-mono text-[10px] text-[#71717A] ml-2">last run: {String(school.last_autosync_at).slice(0, 16).replace('T', ' ')}</span>}
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={runAutoSyncNow} disabled={running} variant="outline" className="rounded-none h-8 text-xs border-[#FFCC00]" data-testid="autosync-run-now-btn">
              <RefreshCw className={`w-3 h-3 mr-2 ${running ? 'animate-spin' : ''}`} /> Run now
            </Button>
            <Button onClick={saveAutoSync} disabled={saving} className="rounded-none h-8 text-xs bg-[#002FA7] text-white" data-testid="autosync-save-btn">
              <Save className="w-3 h-3 mr-2" /> Save
            </Button>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div className="flex items-center justify-between p-3 border border-[#E4E4E7]">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Enabled</Label>
              <div className="text-[10px] text-[#71717A] mt-0.5">Run every day at the chosen time</div>
            </div>
            <Switch checked={autoSync.enabled} onCheckedChange={(v) => setAutoSync((s) => ({ ...s, enabled: v }))} data-testid="autosync-enabled-switch" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] font-bold">Fire Times (24h, comma-separated)</Label>
            <Input value={autoSync.times} onChange={(e) => setAutoSync((s) => ({ ...s, times: e.target.value }))} placeholder="07:10, 07:15, 07:25" className="rounded-none mt-1.5" data-testid="autosync-times-input" />
            <div className="text-[10px] text-[#71717A] mt-1">Each fire runs eSSL pull → substitute suggestions → latecomer alerts. The last fire optionally auto-confirms.</div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.15em] font-bold">eSSL Device</Label>
            <Select value={autoSync.device_id || 'none'} onValueChange={(v) => setAutoSync((s) => ({ ...s, device_id: v === 'none' ? '' : v }))}>
              <SelectTrigger className="rounded-none mt-1.5" data-testid="autosync-device-select"><SelectValue placeholder="Skip eSSL" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Skip eSSL pull</SelectItem>
                {devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.ip}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between p-3 border border-[#E4E4E7]">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Auto-Confirm + Notify</Label>
              <div className="text-[10px] text-[#71717A] mt-0.5">Send WhatsApp/SMS automatically</div>
            </div>
            <Switch checked={autoSync.auto_confirm} onCheckedChange={(v) => setAutoSync((s) => ({ ...s, auto_confirm: v }))} data-testid="autosync-autoconfirm-switch" />
          </div>
        </div>
        <div className="px-5 pb-5">
          <div className="flex items-center justify-between p-3 border border-[#E4E4E7]">
            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">Latecomer Alerts</Label>
              <div className="text-[10px] text-[#71717A] mt-0.5">Ping teachers who have classes today but haven't punched yet</div>
            </div>
            <Switch checked={autoSync.notify_late} onCheckedChange={(v) => setAutoSync((s) => ({ ...s, notify_late: v }))} data-testid="autosync-notify-late-switch" />
          </div>
        </div>
      </div>

      {/* Stop-gap / Today's Substitutions widget */}
      <div className="bg-white border border-[#D4D4D8] mb-12" data-testid="stopgap-widget">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[#D4D4D8] bg-[#FAFAFA]">
          <AlertTriangle className="w-4 h-4 text-[#FF3B30]" />
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold">STOP-GAP · TODAY ({todayName()} · {todayISO()})</div>
          <button onClick={loadStopgaps} className="ml-auto p-1 hover:bg-white" data-testid="reload-stopgaps">
            <RefreshCw className={`w-3.5 h-3.5 text-[#71717A] ${stopgaps.loading ? 'animate-spin' : ''}`} />
          </button>
          <Link to="substitutions" data-testid="manage-substitutions-link">
            <Button variant="outline" className="rounded-none h-8 border-[#002FA7] text-[#002FA7] text-xs">
              Manage
            </Button>
          </Link>
        </div>
        <div className="p-5">
          {stopgaps.loading ? (
            <div className="text-xs text-[#71717A]">Loading…</div>
          ) : stopgaps.items.length === 0 ? (
            <div className="text-sm text-[#71717A]" data-testid="no-stopgaps">No absent teachers today. The day is fully staffed.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stopgaps.items.map((s) => (
                <div key={s.id} className="border border-[#E4E4E7] p-3 flex items-center gap-3" data-testid={`stopgap-${s.id}`}>
                  {s.absent?.photo
                    ? <img src={s.absent.photo} className="w-9 h-9 rounded-full object-cover" alt="" />
                    : <div className="w-9 h-9 bg-[#FF3B30] text-white text-[11px] font-bold flex items-center justify-center rounded-full">{s.absent?.abbreviation || '?'}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{s.absent?.name || s.absent_teacher_id}</div>
                    <div className="text-[10px] text-[#71717A] font-mono">
                      ABSENT · {s.substitute ? <>SUB: <span className="text-[#10B981] font-bold">{s.substitute.abbreviation}</span></> : <span className="text-[#FF3B30]">NO SUB</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 ${s.status === 'confirmed' ? 'bg-[#10B981] text-white' : s.status === 'pending' ? 'bg-[#FFCC00]' : 'bg-[#E4E4E7]'}`}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8]">
        <Link to="timetable" className="bg-white p-8 hover:bg-[#FAFAFA] transition-all group lg:col-span-2" data-testid="quick-timetable">
          <CalendarRange className="w-8 h-8 text-[#002FA7] mb-6" />
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-2">PRIMARY ACTION</div>
          <h3 className="font-heading text-3xl font-black tracking-tighter mb-2 group-hover:text-[#002FA7] transition-colors">Build the Timetable</h3>
          <p className="text-sm text-[#71717A] max-w-md">Drag teachers, subjects, and labs onto the day × period grid. Real-time clash detection — including facility double-bookings.</p>
        </Link>
        <Link to="audit" className="bg-white p-8 hover:bg-[#FAFAFA] transition-all group" data-testid="quick-audit">
          <ShieldAlert className="w-8 h-8 text-[#FF3B30] mb-6" />
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-2">AI ASSIST</div>
          <h3 className="font-heading text-2xl font-black tracking-tighter mb-2 group-hover:text-[#002FA7] transition-colors">Audit & Optimize</h3>
          <p className="text-sm text-[#71717A]">Heat-map of violations across every class. AI rewrites the worst slots with one-click apply.</p>
        </Link>
      </div>
    </div>
  );
}
