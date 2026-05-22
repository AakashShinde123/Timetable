import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Plus, Pencil, Trash2, ShieldCheck, UserPlus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { toast } from 'sonner';

const emptyMember = { email: '', name: '', role: 'Viewer', permissions: [] };

// Map permission key → (resource, action). Unknown actions go in 'extra'.
function splitPerm(p) {
  const [resource, action] = p.split('.');
  return { resource, action };
}

// Build the matrix from the live vocabulary
// Returns: {resources: ['teachers',...], actions: ['view','manage','edit','generate','run','snapshot','settings'], cellMap: {[res]: {[act]: 'teachers.manage' | null}}}
function buildMatrix(perms) {
  const resources = [];
  const actions = [];
  const cellMap = {};
  perms.forEach((p) => {
    const [resource, action] = p.split('.');
    if (!resources.includes(resource)) resources.push(resource);
    if (!actions.includes(action)) actions.push(action);
    cellMap[resource] = cellMap[resource] || {};
    cellMap[resource][action] = p;
  });
  // Stable column order — common actions first, custom ones after
  const COLUMN_ORDER = ['view', 'manage', 'edit', 'generate', 'run', 'snapshot', 'settings'];
  actions.sort((a, b) => {
    const ai = COLUMN_ORDER.indexOf(a); const bi = COLUMN_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return { resources, actions, cellMap };
}

const RESOURCE_LABELS = {
  teachers: 'Teachers', subjects: 'Subjects', classes: 'Classes', sections: 'Sections',
  facilities: 'Facilities', activities: 'Activities', shifts: 'Shifts & Periods',
  labs: 'Labs', allotments: 'Allotments', constraints: 'Constraints',
  timetable: 'Timetable', ai: 'AI Assist', substitutions: 'Substitutions',
  audit: 'Audit', attendance: 'Attendance', users: 'Users & Roles', school: 'School Settings',
};

export default function Members() {
  const { schoolId } = useParams();
  const [members, setMembers] = useState([]);
  const [vocab, setVocab] = useState({ permissions: [], role_presets: {} });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyMember);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const [m, v] = await Promise.all([
        api.get(`/schools/${schoolId}/members`),
        api.get('/permissions/vocabulary'),
      ]);
      setMembers(m.data);
      setVocab(v.data);
    } catch (e) {
      if (e.response?.status === 403) toast.error('You need users.manage permission');
    }
  };
  useEffect(() => { load(); }, [schoolId]);

  const { resources, actions, cellMap } = buildMatrix(vocab.permissions);

  const openNew = () => { setForm(emptyMember); setEditingId(null); setOpen(true); };
  const openEdit = (m) => {
    setForm({ email: m.email, name: m.name || '', role: m.role, permissions: m.permissions || [] });
    setEditingId(m.id); setOpen(true);
  };

  const pickRolePreset = (role) => {
    const preset = vocab.role_presets?.[role] || [];
    setForm((f) => ({ ...f, role, permissions: preset }));
  };

  const togglePerm = (p) => {
    if (!p) return;
    setForm((f) => ({
      ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));
  };

  const save = async () => {
    if (!form.email) return toast.error('Email required');
    try {
      if (editingId) {
        await api.put(`/schools/${schoolId}/members/${editingId}`, {
          role: form.role, permissions: form.permissions, name: form.name,
        });
      } else {
        await api.post(`/schools/${schoolId}/members`, form);
      }
      toast.success('Saved'); setOpen(false); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed');
    }
  };

  const del = async (id) => {
    if (!window.confirm('Remove user from school?')) return;
    await api.delete(`/schools/${schoolId}/members/${id}`);
    load();
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">SCHOOL / USERS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">User Management</h1>
          <div className="text-sm text-[#71717A] mt-2 max-w-2xl">
            Add users by email and tick the exact permissions they need. Super Admins always have full access.
          </div>
        </div>
        <Button onClick={openNew} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-10" data-testid="new-member-btn">
          <UserPlus className="w-4 h-4 mr-2" /> Add User
        </Button>
      </div>

      <div className="bg-white border border-[#D4D4D8]" data-testid="members-table">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAFA] border-b border-[#D4D4D8]">
            <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
              <th className="px-4 py-3">EMAIL</th>
              <th className="px-4 py-3">NAME</th>
              <th className="px-4 py-3">ROLE</th>
              <th className="px-4 py-3">PERMS</th>
              <th className="px-4 py-3">STATUS</th>
              <th className="px-4 py-3 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-[#E4E4E7] last:border-0 hover:bg-[#FAFAFA]" data-testid={`member-${m.id}`}>
                <td className="px-4 py-3 font-mono text-xs">{m.email}</td>
                <td className="px-4 py-3">{m.name || '—'}</td>
                <td className="px-4 py-3 text-xs font-bold">{m.role}</td>
                <td className="px-4 py-3 text-xs text-[#52525B]"><span className="font-mono">{(m.permissions || []).length}</span></td>
                <td className="px-4 py-3"><span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 ${m.status === 'active' ? 'bg-[#10B981] text-white' : m.status === 'invited' ? 'bg-[#FFCC00]' : 'bg-[#E4E4E7]'}`}>{m.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(m.id)} className="p-1.5 hover:bg-[#FEE2E2] ml-1"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
                </td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan="6" className="px-4 py-12 text-center text-sm text-[#71717A]">No users yet. Add your first teammate above.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8] max-w-4xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit User' : 'Add User'}</DialogTitle>
            <DialogDescription className="text-xs text-[#71717A]">Pick a role preset, then fine-tune the permission matrix below.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[75vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-3 gap-4">
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Email *</Label>
                <Input className="rounded-none mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@school.edu" data-testid="member-email-input" disabled={!!editingId} /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name</Label>
                <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Optional" /></div>
              <div>
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">Role Preset</Label>
                <Select value={form.role} onValueChange={pickRolePreset}>
                  <SelectTrigger className="rounded-none mt-1.5" data-testid="member-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(vocab.role_presets || {}).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-[0.15em] font-bold flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5" /> Permission Matrix · {form.permissions.length}
                </Label>
                <div className="text-[10px] uppercase tracking-wider text-[#71717A]">Tick the boxes</div>
              </div>
              <div className="border border-[#D4D4D8] bg-white overflow-x-auto">
                <table className="w-full text-sm" data-testid="permissions-matrix">
                  <thead className="bg-[#FAFAFA] border-b border-[#D4D4D8] sticky top-0">
                    <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
                      <th className="px-3 py-2 sticky left-0 bg-[#FAFAFA]">RESOURCE</th>
                      {actions.map((a) => (
                        <th key={a} className="px-3 py-2 text-center w-20">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((res) => (
                      <tr key={res} className="border-b border-[#E4E4E7] last:border-0 hover:bg-[#FAFAFA]" data-testid={`matrix-row-${res}`}>
                        <td className="px-3 py-2 font-mono text-xs font-bold sticky left-0 bg-white whitespace-nowrap">
                          {RESOURCE_LABELS[res] || res}
                        </td>
                        {actions.map((a) => {
                          const key = cellMap[res]?.[a];
                          const isActive = !!key;
                          const isChecked = isActive && form.permissions.includes(key);
                          if (isActive) {
                            return (
                              <td key={a} className="px-3 py-2 text-center">
                                <Checkbox
                                  checked={isChecked}
                                  onCheckedChange={() => togglePerm(key)}
                                  data-testid={`perm-${key}`}
                                />
                              </td>
                            );
                          }
                          return (
                            <td key={a} className="px-3 py-2 text-center bg-[#FAFAFA]">
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex" data-testid={`perm-disabled-${res}-${a}`}>
                                      <Checkbox checked={false} disabled aria-label="not applicable" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-[#09090B] text-white text-xs rounded-none border-0">
                                    "{a}" is not available for {RESOURCE_LABELS[res] || res}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] text-white rounded-none" data-testid="save-member-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
