import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Plus, ArrowUpRight, Sparkles, GraduationCap, LogOut, MapPin, BookOpen, Globe2, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function Schools() {
  const { user, logout } = useAuth();
  const [schools, setSchools] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', board: 'CBSE' });
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const res = await api.get('/schools');
      setSchools(res.data);
    } catch {
      toast.error('Failed to load schools');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createSchool = async () => {
    if (!form.name) return toast.error('School name required');
    try {
      const res = await api.post('/schools', form);
      setSchools([res.data, ...schools]);
      setOpen(false);
      setForm({ name: '', location: '', board: 'CBSE' });
      toast.success('School created');
    } catch {
      toast.error('Failed to create');
    }
  };

  const seedSriMa = async () => {
    setSeeding(true);
    try {
      const res = await api.post('/seed/sri-ma-vidyalaya');
      toast.success(`Seeded ${res.data.teachers_inserted} new teachers`);
      await load();
    } catch {
      toast.error('Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const seedSriMaFull = async () => {
    setSeeding(true);
    try {
      const res = await api.post('/seed/sri-ma-vidyalaya/full');
      toast.success(`Deep seed: ${res.data.classes_created} classes, ${res.data.subjects_created} subjects, ${res.data.allotments_created} allotments, ${res.data.rules_created} rules`);
      await load();
    } catch {
      toast.error('Deep seed failed');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      {/* Top bar */}
      <div className="bg-white border-b border-[#D4D4D8]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#002FA7] flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-heading font-black text-lg tracking-tighter leading-none">SRI MA ONE</div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-[#71717A] mt-1">Timetable OS</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold" data-testid="user-name">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold" data-testid="user-role">{user?.role}</div>
            </div>
            {user?.picture && <img src={user.picture} alt="" className="w-9 h-9 rounded-full" />}
            <Link to="/help" data-testid="schools-help-link">
              <Button variant="outline" className="rounded-none border-[#D4D4D8] h-9" data-testid="help-btn">
                <HelpCircle className="w-3.5 h-3.5 mr-2" /> Help
              </Button>
            </Link>
            <Button onClick={logout} variant="outline" className="rounded-none border-[#D4D4D8] h-9" data-testid="logout-btn-top">
              <LogOut className="w-3.5 h-3.5 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
        {/* Header section */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12 pb-8 border-b border-[#D4D4D8]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">
              STEP 02 — SELECT WORKSPACE
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95] text-[#09090B]">
              Your schools.<br />Your scheduling rules.
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user?.role === 'Super Admin' && (
              <Button
                onClick={() => navigate('/super')}
                variant="outline"
                className="rounded-none border-[#002FA7] text-[#002FA7] hover:bg-[#002FA7] hover:text-white h-11 px-5 transition-all"
                data-testid="super-admin-btn"
              >
                <Globe2 className="w-4 h-4 mr-2" /> Super Admin Dashboard
              </Button>
            )}
            <Button
              variant="outline"
              onClick={seedSriMa}
              disabled={seeding}
              className="rounded-none border-[#D4D4D8] hover:bg-[#FFCC00] hover:border-[#FFCC00] hover:text-[#09090B] h-11 px-5 transition-all"
              data-testid="seed-sri-ma-btn"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {seeding ? 'Seeding...' : 'Seed Teachers'}
            </Button>
            <Button
              variant="outline"
              onClick={seedSriMaFull}
              disabled={seeding}
              className="rounded-none border-[#002FA7] text-[#002FA7] hover:bg-[#002FA7] hover:text-white h-11 px-5 transition-all"
              data-testid="seed-sri-ma-full-btn"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {seeding ? 'Seeding...' : 'Seed Full Dataset (43 classes + 40 rules)'}
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none h-11 px-5" data-testid="new-school-btn">
                  <Plus className="w-4 h-4 mr-2" /> New School
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-none border-[#D4D4D8]">
                <DialogHeader>
                  <DialogTitle className="font-heading text-2xl tracking-tighter">New School</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label className="text-xs uppercase tracking-[0.15em] font-bold">Name</Label>
                    <Input data-testid="school-name-input" className="rounded-none mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sri Ma Vidyalaya" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-[0.15em] font-bold">Location</Label>
                    <Input data-testid="school-location-input" className="rounded-none mt-1.5" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Thane West" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-[0.15em] font-bold">Board</Label>
                    <Input data-testid="school-board-input" className="rounded-none mt-1.5" value={form.board} onChange={(e) => setForm({ ...form, board: e.target.value })} placeholder="CBSE / ICSE / State" />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createSchool} className="bg-[#002FA7] hover:bg-[#0055FF] text-white rounded-none" data-testid="confirm-new-school-btn">Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Schools grid */}
        {loading ? (
          <div className="text-sm text-[#71717A]">Loading…</div>
        ) : schools.length === 0 ? (
          <Card className="rounded-none border-[#D4D4D8] p-12 text-center shadow-none" data-testid="empty-schools">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">NO SCHOOLS YET</div>
            <h3 className="font-heading text-2xl font-black tracking-tighter mb-3">Start by adding your first school</h3>
            <p className="text-sm text-[#71717A] mb-6 max-w-md mx-auto">Or seed with a demo school: <strong>Sri Ma Vidyalaya CBSE</strong>, Thane West (44 teachers, subjects, periods).</p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={seedSriMa} disabled={seeding} variant="outline" className="rounded-none border-[#D4D4D8]" data-testid="seed-empty-btn">
                <Sparkles className="w-4 h-4 mr-2" /> Seed Demo School
              </Button>
              <Button onClick={() => setOpen(true)} className="bg-[#002FA7] text-white rounded-none">
                <Plus className="w-4 h-4 mr-2" /> New School
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8]" data-testid="schools-grid">
            {schools.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/school/${s.id}`)}
                data-testid={`school-card-${s.id}`}
                className="bg-white p-6 text-left hover:bg-[#FAFAFA] transition-all group"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 bg-[#002FA7] flex items-center justify-center group-hover:bg-[#0055FF] transition-colors">
                    <GraduationCap className="w-6 h-6 text-white" />
                  </div>
                  <ArrowUpRight className="w-5 h-5 text-[#71717A] group-hover:text-[#002FA7] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-2">{s.board}</div>
                <h3 className="font-heading text-2xl font-black tracking-tighter leading-tight mb-3">{s.name}</h3>
                <div className="flex items-center gap-1.5 text-xs text-[#52525B]">
                  <MapPin className="w-3 h-3" /> {s.location || '—'}
                </div>
                <div className="mt-6 pt-4 border-t border-[#D4D4D8] flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
                  <BookOpen className="w-3 h-3" /> Open workspace
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
