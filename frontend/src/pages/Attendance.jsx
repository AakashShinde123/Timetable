import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Upload, RefreshCw, Plus, Server, ClipboardCheck, AlertTriangle, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';

const emptyDev = { name: '', ip: '', port: 4370, password: 0, timeout: 8, force_udp: false, ommit_ping: true };

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function Attendance() {
  const { schoolId } = useParams();
  const [devices, setDevices] = useState([]);
  const [punches, setPunches] = useState([]);
  const [summary, setSummary] = useState(null);
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [devForm, setDevForm] = useState(emptyDev);
  const [editingDevId, setEditingDevId] = useState(null);

  const load = async () => {
    try {
      const [d, p, s] = await Promise.all([
        api.get(`/schools/${schoolId}/essl-devices`),
        api.get(`/schools/${schoolId}/attendance?date_from=${date}&date_to=${date}&limit=2000`),
        api.get(`/schools/${schoolId}/attendance/summary?date=${date}`),
      ]);
      setDevices(d.data);
      setPunches(p.data.items || p.data);
      setSummary(s.data);
    } catch (e) { console.warn('attendance load failed', e); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [schoolId, date]);

  const saveDevice = async () => {
    if (!devForm.name || !devForm.ip) return toast.error('Name + IP required');
    try {
      const payload = {
        ...devForm, port: parseInt(devForm.port) || 4370,
        password: parseInt(devForm.password) || 0, timeout: parseInt(devForm.timeout) || 8,
      };
      if (editingDevId) await api.put(`/schools/${schoolId}/essl-devices/${editingDevId}`, payload);
      else await api.post(`/schools/${schoolId}/essl-devices`, payload);
      toast.success('Saved'); setDevOpen(false); load();
    } catch { toast.error('Save failed'); }
  };
  const delDevice = async (id) => {
    if (!window.confirm('Remove device config?')) return;
    await api.delete(`/schools/${schoolId}/essl-devices/${id}`);
    load();
  };

  const sync = async (device_id) => {
    setBusy(true);
    try {
      const res = await api.post(`/schools/${schoolId}/attendance/sync-essl`, { device_id, days_back: 7 });
      toast.success(`Pulled ${res.data.inserted} new punches (skipped ${res.data.skipped})`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Device unreachable — use file upload below');
    }
    setBusy(false);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/schools/${schoolId}/attendance/import-file`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Imported ${res.data.inserted} punches (${res.data.unmapped} unmapped)`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Import failed');
    }
    setBusy(false);
    e.target.value = '';
  };

  const delPunch = async (id) => {
    await api.delete(`/schools/${schoolId}/attendance/${id}`);
    load();
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">OPERATIONS / ATTENDANCE</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Attendance</h1>
          <div className="text-sm text-[#71717A] mt-2 max-w-2xl">
            Pull punches live from your eSSL face-reader (over network IP) or upload a CSV / XLSX export when the device is offline.
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-none h-10 w-40" data-testid="attendance-date" />
          <Button onClick={load} variant="outline" className="rounded-none border-[#D4D4D8] h-10" data-testid="reload-attendance-btn">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${busy ? 'animate-spin' : ''}`} /> Reload
          </Button>
        </div>
      </div>

      {/* eSSL devices */}
      <div className="bg-white border border-[#D4D4D8] mb-8" data-testid="essl-devices-panel">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[#D4D4D8] bg-[#FAFAFA]">
          <Server className="w-4 h-4 text-[#002FA7]" />
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold">eSSL DEVICES</div>
          <span className="font-mono text-xs text-[#71717A]">{devices.length}</span>
          <div className="ml-auto flex items-center gap-2">
            <label className="rounded-none border border-[#D4D4D8] h-8 px-3 inline-flex items-center text-xs cursor-pointer hover:bg-[#F4F4F5]" data-testid="upload-attendance-label">
              <Upload className="w-3.5 h-3.5 mr-2" /> Upload CSV / XLSX
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFile} data-testid="upload-attendance-input" />
            </label>
            <Button onClick={() => { setDevForm(emptyDev); setEditingDevId(null); setDevOpen(true); }} className="rounded-none bg-[#002FA7] hover:bg-[#0055FF] text-white h-8 text-xs" data-testid="new-essl-device-btn">
              <Plus className="w-3.5 h-3.5 mr-2" /> Device
            </Button>
          </div>
        </div>
        <div className="p-5">
          {devices.length === 0 ? (
            <div className="text-xs text-[#71717A]" data-testid="no-devices">
              No eSSL device configured. Add one to enable live sync, or upload an export file above.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {devices.map((d) => (
                <div key={d.id} className="border border-[#E4E4E7] p-3 group" data-testid={`device-${d.id}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-xs font-bold">{d.name}</div>
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                      <button onClick={() => { setDevForm(d); setEditingDevId(d.id); setDevOpen(true); }} className="p-1 hover:bg-[#E4E4E7]"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => delDevice(d.id)} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3 h-3 text-[#FF3B30]" /></button>
                    </div>
                  </div>
                  <div className="font-mono text-[10px] text-[#71717A]">{d.ip}:{d.port}</div>
                  <Button onClick={() => sync(d.id)} disabled={busy} className="w-full mt-3 rounded-none bg-[#09090B] hover:bg-[#002FA7] text-white h-8 text-xs" data-testid={`sync-device-${d.id}`}>
                    <RefreshCw className={`w-3 h-3 mr-2 ${busy ? 'animate-spin' : ''}`} /> Sync now
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#D4D4D8] border border-[#D4D4D8] mb-8" data-testid="attendance-summary">
          <Stat label="DATE" value={summary.date} accent="#09090B" mono />
          <Stat label="PRESENT" value={summary.present} accent="#10B981" />
          <Stat label="ABSENT" value={summary.absent} accent="#FF3B30" />
          <Stat label="UNMAPPED" value={summary.unmapped_punches} accent="#FFCC00" />
        </div>
      )}

      {/* Per-teacher summary */}
      {summary && (
        <div className="bg-white border border-[#D4D4D8] mb-8" data-testid="per-teacher-summary">
          <div className="px-5 py-3 border-b border-[#D4D4D8] bg-[#FAFAFA] text-[10px] uppercase tracking-[0.2em] font-bold">
            PER-TEACHER · {summary.date}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFA] border-b border-[#D4D4D8]">
              <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-[#71717A] font-bold">
                <th className="px-4 py-2">TEACHER</th>
                <th className="px-4 py-2">STATUS</th>
                <th className="px-4 py-2">FIRST IN</th>
                <th className="px-4 py-2">LAST OUT</th>
                <th className="px-4 py-2">PUNCHES</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.teacher_id} className="border-b border-[#E4E4E7] last:border-0" data-testid={`tsum-${r.teacher_id}`}>
                  <td className="px-4 py-2"><span className="font-mono text-[#002FA7] font-bold">{r.abbreviation}</span> · {r.teacher_name}</td>
                  <td className="px-4 py-2"><span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 ${r.present ? 'bg-[#10B981] text-white' : 'bg-[#FF3B30] text-white'}`}>{r.present ? 'PRESENT' : 'ABSENT'}</span></td>
                  <td className="px-4 py-2 font-mono">{r.first_in || '—'}</td>
                  <td className="px-4 py-2 font-mono">{r.last_out || '—'}</td>
                  <td className="px-4 py-2 font-mono">{r.punches}</td>
                </tr>
              ))}
              {summary.rows.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-xs text-[#71717A]">No teachers</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw punches */}
      <div className="bg-white border border-[#D4D4D8]" data-testid="raw-punches">
        <div className="px-5 py-3 border-b border-[#D4D4D8] bg-[#FAFAFA] flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[#002FA7]" />
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold">RAW PUNCHES · {punches.length}</div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAFA] sticky top-0">
              <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-[#71717A] font-bold">
                <th className="px-4 py-2">TIME</th>
                <th className="px-4 py-2">USER ID</th>
                <th className="px-4 py-2">NAME</th>
                <th className="px-4 py-2">TYPE</th>
                <th className="px-4 py-2">SOURCE</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {punches.map((p) => (
                <tr key={p.id} className="border-b border-[#E4E4E7] last:border-0" data-testid={`punch-${p.id}`}>
                  <td className="px-4 py-2 font-mono">{p.time}</td>
                  <td className="px-4 py-2 font-mono">{p.raw_user_id || '—'}</td>
                  <td className="px-4 py-2">{p.raw_user_name || (p.teacher_id ? <span className="font-mono text-[#002FA7]">{p.teacher_id.slice(-6)}</span> : <span className="text-[#FF3B30] inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />unmapped</span>)}</td>
                  <td className="px-4 py-2"><span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 ${p.punch_type === 'in' ? 'bg-[#10B981] text-white' : 'bg-[#FFCC00] text-[#09090B]'}`}>{p.punch_type}</span></td>
                  <td className="px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-[#71717A]">{p.source}</td>
                  <td className="px-4 py-2 text-right"><button onClick={() => delPunch(p.id)} className="p-1 hover:bg-[#FEE2E2]"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button></td>
                </tr>
              ))}
              {punches.length === 0 && <tr><td colSpan="6" className="px-4 py-8 text-center text-xs text-[#71717A]">No punches for this date</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={devOpen} onOpenChange={setDevOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8]">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl tracking-tighter">{editingDevId ? 'Edit' : 'New'} eSSL Device</DialogTitle>
            <DialogDescription className="text-xs text-[#71717A]">Configure the IP of the face-reader. Default port 4370 (ZK protocol).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
                <Input className="rounded-none mt-1.5" value={devForm.name} onChange={(e) => setDevForm({ ...devForm, name: e.target.value })} placeholder="Main gate" data-testid="dev-name-input" /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">IP Address *</Label>
                <Input className="rounded-none mt-1.5" value={devForm.ip} onChange={(e) => setDevForm({ ...devForm, ip: e.target.value })} placeholder="192.168.1.201" data-testid="dev-ip-input" /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Port</Label>
                <Input type="number" className="rounded-none mt-1.5" value={devForm.port} onChange={(e) => setDevForm({ ...devForm, port: e.target.value })} /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Comm Password</Label>
                <Input type="number" className="rounded-none mt-1.5" value={devForm.password} onChange={(e) => setDevForm({ ...devForm, password: e.target.value })} /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Timeout (s)</Label>
                <Input type="number" className="rounded-none mt-1.5" value={devForm.timeout} onChange={(e) => setDevForm({ ...devForm, timeout: e.target.value })} /></div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Transport</Label>
                <Select value={devForm.force_udp ? 'udp' : 'tcp'} onValueChange={(v) => setDevForm({ ...devForm, force_udp: v === 'udp' })}>
                  <SelectTrigger className="rounded-none mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP (default)</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveDevice} className="bg-[#002FA7] text-white rounded-none" data-testid="save-device-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent, mono }) {
  return (
    <div className="bg-white p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">{label}</div>
      <div className={`${mono ? 'font-mono text-lg' : 'font-mono text-3xl font-bold'} mt-1`} style={{ color: accent }}>{value}</div>
    </div>
  );
}
