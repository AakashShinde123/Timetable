import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Sparkles, Trash2, Pencil, X, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

const FIELDS = ['teacher', 'subject', 'class', 'lab', 'day', 'period', 'room', 'workload'];
const OPS = ['=', '≠', '>', '<', '∈', '∉'];
const CATEGORIES = ['clash', 'workload', 'room', 'sequence', 'preference', 'general'];
const ACTIONS = ['forbid', 'require', 'prefer', 'avoid', 'limit'];

const emptyForm = {
  name: '', description: '', severity: 'hard', category: 'general',
  conditions: [], action: { type: 'forbid', value: '' }, enabled: true,
};

export default function Constraints() {
  const { schoolId } = useParams();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [nlText, setNlText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [similar, setSimilar] = useState([]);

  const fetchSimilar = async (newForm) => {
    const conds = (newForm || form).conditions || [];
    if (conds.length === 0) { setSimilar([]); return; }
    const first = conds[0];
    try {
      const res = await api.get(`/schools/${schoolId}/constraints/similar`, {
        params: { field: first.field, value: first.value, category: (newForm || form).category },
      });
      // Filter out the rule being edited
      setSimilar((res.data.matches || []).filter((m) => m.id !== editingId));
    } catch { setSimilar([]); }
  };

  const load = async () => {
    const res = await api.get(`/schools/${schoolId}/constraints`);
    setItems(res.data);
  };
  useEffect(() => { load(); }, [schoolId]);

  const save = async () => {
    if (!form.name) return toast.error('Name required');
    try {
      if (editingId) await api.put(`/schools/${schoolId}/constraints/${editingId}`, form);
      else await api.post(`/schools/${schoolId}/constraints`, form);
      toast.success('Saved');
      setOpen(false); load();
    } catch { toast.error('Failed'); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete?')) return;
    await api.delete(`/schools/${schoolId}/constraints/${id}`);
    load();
  };

  const addCondition = () => {
    const next = { ...form, conditions: [...form.conditions, { field: 'teacher', op: '=', value: '' }] };
    setForm(next); fetchSimilar(next);
  };
  const updateCondition = (i, k, v) => {
    const arr = [...form.conditions];
    arr[i] = { ...arr[i], [k]: v };
    const next = { ...form, conditions: arr };
    setForm(next); fetchSimilar(next);
  };
  const removeCondition = (i) => {
    const next = { ...form, conditions: form.conditions.filter((_, idx) => idx !== i) };
    setForm(next); fetchSimilar(next);
  };

  const parseNL = async () => {
    if (!nlText) return;
    setParsing(true);
    try {
      const res = await api.post(`/schools/${schoolId}/constraints/parse`, { text: nlText });
      setAiResult(res.data.raw);
      try {
        const j = JSON.parse(res.data.raw.replace(/```json|```/g, '').trim());
        setForm({ ...emptyForm, ...j });
        toast.success('Parsed! Review and save.');
      } catch {
        toast.info('AI returned text. Review below.');
      }
    } catch { toast.error('AI parse failed'); }
    finally { setParsing(false); }
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">BUILDER / CONSTRAINTS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Constraint Builder</h1>
          <div className="text-sm text-[#71717A] mt-2">Compose IF-THEN rules with chips. Or describe a rule in plain English — AI will translate it.</div>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditingId(null); setSimilar([]); setOpen(true); }} className="bg-[#002FA7] text-white rounded-none h-10" data-testid="new-constraint-btn">
          <Plus className="w-4 h-4 mr-2" /> New Rule
        </Button>
      </div>

      <div className="border border-[#D4D4D8] bg-white" data-testid="constraints-table">
        <table className="w-full text-sm">
          <thead className="border-b border-[#D4D4D8] bg-[#FAFAFA]">
            <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
              <th className="px-4 py-3">STATUS</th><th className="px-4 py-3">NAME</th><th className="px-4 py-3">CATEGORY</th><th className="px-4 py-3">SEVERITY</th><th className="px-4 py-3">CONDITIONS</th><th className="px-4 py-3 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-[#E4E4E7] last:border-0 hover:bg-[#FAFAFA]" data-testid={`constraint-row-${c.id}`}>
                <td className="px-4 py-3"><span className={`text-[10px] px-1.5 py-0.5 font-bold uppercase ${c.enabled ? 'bg-[#10B981] text-white' : 'bg-[#E5E7EB] text-[#71717A]'}`}>{c.enabled ? 'ON' : 'OFF'}</span></td>
                <td className="px-4 py-3 font-semibold">{c.name}</td>
                <td className="px-4 py-3 font-mono text-xs uppercase">{c.category}</td>
                <td className="px-4 py-3"><span className={`text-[10px] px-1.5 py-0.5 font-bold uppercase ${c.severity === 'hard' ? 'bg-[#FF3B30] text-white' : 'bg-[#FFCC00] text-[#09090B]'}`}>{c.severity}</span></td>
                <td className="px-4 py-3 text-xs font-mono">{c.conditions?.length || 0} chip(s)</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { setForm(c); setEditingId(c.id); setSimilar([]); setOpen(true); }} className="p-1.5 hover:bg-[#E4E4E7]"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => del(c.id)} className="p-1.5 hover:bg-[#FEE2E2] ml-1"><Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="6" className="px-4 py-12 text-center text-sm text-[#71717A]">No constraints yet. Click "New Rule".</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-none border-[#D4D4D8] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading text-2xl tracking-tighter">{editingId ? 'Edit' : 'New'} Constraint</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            {/* AI parser */}
            <div className="border border-dashed border-[#002FA7] bg-[#F0F4FF] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[#002FA7]" />
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#002FA7]">AI ASSIST</div>
              </div>
              <Textarea
                placeholder='Describe the rule in plain English. e.g. "Avoid scheduling Mathematics after lunch on Mondays."'
                className="rounded-none mb-2 bg-white"
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                data-testid="ai-constraint-text"
              />
              <Button onClick={parseNL} disabled={parsing} className="rounded-none bg-[#002FA7] text-white h-9" data-testid="ai-parse-btn">
                {parsing ? 'Parsing…' : 'Translate to Rule'}
              </Button>
              {aiResult && <pre className="mt-3 text-[10px] bg-white p-2 border border-[#D4D4D8] overflow-auto max-h-32 font-mono">{aiResult}</pre>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Name *</Label>
                <Input className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="constraint-name-input" /></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="rounded-none mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger className="rounded-none mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="hard">Hard (must)</SelectItem><SelectItem value="soft">Soft (prefer)</SelectItem></SelectContent>
                </Select></div>
              <div className="flex items-end gap-3"><Switch checked={form.enabled} onCheckedChange={(c) => setForm({ ...form, enabled: c })} /><Label className="text-sm">Enabled</Label></div>
            </div>
            <div><Label className="text-xs uppercase tracking-[0.15em] font-bold">Description</Label>
              <Textarea className="rounded-none mt-1.5" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-[0.15em] font-bold">IF — Conditions (chips)</Label>
                <Button type="button" onClick={addCondition} className="h-7 rounded-none bg-[#09090B] text-white text-xs"><Plus className="w-3 h-3 mr-1" /> Add Chip</Button>
              </div>
              <div className="space-y-2 p-3 border border-[#D4D4D8] bg-[#FAFAFA] min-h-[64px]">
                {form.conditions.map((cond, i) => (
                  <div key={`chip-${i}-${cond.field}-${cond.op}`} className="flex items-center gap-2 constraint-chip" data-testid={`condition-${i}`}>
                    <GripVertical className="w-3 h-3 text-[#71717A]" />
                    <Select value={cond.field} onValueChange={(v) => updateCondition(i, 'field', v)}>
                      <SelectTrigger className="rounded-none h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{FIELDS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={cond.op} onValueChange={(v) => updateCondition(i, 'op', v)}>
                      <SelectTrigger className="rounded-none h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input className="rounded-none h-7 flex-1" value={cond.value} onChange={(e) => updateCondition(i, 'value', e.target.value)} placeholder="value" />
                    <button onClick={() => removeCondition(i)} className="p-1 hover:bg-[#FEE2E2]"><X className="w-3 h-3 text-[#FF3B30]" /></button>
                  </div>
                ))}
                {form.conditions.length === 0 && <div className="text-xs text-[#71717A] text-center py-3">No conditions. Add chips above.</div>}
              </div>
              {similar.length > 0 && (
                <div className="mt-3 border-l-2 border-[#002FA7] bg-[#F0F4FF] p-3" data-testid="similar-rules">
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#002FA7] mb-2">SIMILAR RULES IN CATALOG · {similar.length}</div>
                  <div className="space-y-1">
                    {similar.map((s) => (
                      <div key={s.id} className="text-xs flex items-start gap-2">
                        <span className={`text-[9px] px-1 py-0.5 font-bold ${s.severity === 'hard' ? 'bg-[#FF3B30] text-white' : 'bg-[#FFCC00]'}`}>{s.severity?.toUpperCase()}</span>
                        <span className="font-mono text-[10px] text-[#71717A] uppercase">{s.category}</span>
                        <span className="flex-1">{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs uppercase tracking-[0.15em] font-bold">THEN — Action</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <Select value={form.action.type} onValueChange={(v) => setForm({ ...form, action: { ...form.action, type: v } })}>
                  <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="rounded-none" value={form.action.value || ''} onChange={(e) => setForm({ ...form, action: { ...form.action, value: e.target.value } })} placeholder="action value (optional)" />
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#002FA7] text-white rounded-none" data-testid="save-constraint-btn">Save Rule</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
