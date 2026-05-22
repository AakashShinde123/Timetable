import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { GraduationCap, LogOut, Users, BookOpen, School2, CalendarRange, Globe2, ArrowUpRight, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SuperAdminDashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/super-admin/dashboard');
        setData(res.data);
      } catch (e) {
        if (e.response?.status === 403) navigate('/');
        else toast.error('Load failed');
      }
    })();
  }, [navigate]);

  if (!data) return <div className="p-12 text-sm text-[#71717A]">Loading…</div>;

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      <div className="bg-white border-b border-[#D4D4D8]">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#002FA7] flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-heading font-black text-lg tracking-tighter">SUPER ADMIN</div>
              <div className="text-[9px] uppercase tracking-[0.25em] text-[#71717A] mt-1">Cross-School Control Room</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate('/')} variant="outline" className="rounded-none border-[#D4D4D8] h-9" data-testid="back-schools-btn">
              ALL SCHOOLS
            </Button>
            <Button onClick={logout} variant="outline" className="rounded-none border-[#D4D4D8] h-9" data-testid="super-logout-btn">
              <LogOut className="w-3.5 h-3.5 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10">
        <div className="mb-12 pb-8 border-b border-[#D4D4D8]">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">FLEET / OVERVIEW</div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[0.95] text-[#09090B]">
            {data.totals.total_schools} school{data.totals.total_schools !== 1 ? 's' : ''}.<br />One operations layer.
          </h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-[#D4D4D8] border border-[#D4D4D8] mb-12" data-testid="super-totals">
          <Stat icon={Building2} label="SCHOOLS" value={data.totals.total_schools} accent="#002FA7" />
          <Stat icon={Users} label="TEACHERS" value={data.totals.teachers} accent="#0055FF" />
          <Stat icon={School2} label="CLASSES" value={data.totals.classes} accent="#10B981" />
          <Stat icon={BookOpen} label="SUBJECTS" value={data.totals.subjects} accent="#8B5CF6" />
          <Stat icon={CalendarRange} label="CELLS" value={data.totals.cells} accent="#F97316" />
          <Stat icon={Globe2} label="VISITING" value={data.totals.visiting_faculty} accent="#FF3B30" />
        </div>

        <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">SCHOOLS</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8]" data-testid="schools-list">
          {data.schools.map((s) => (
            <button
              key={s.school_id}
              onClick={() => navigate(`/school/${s.school_id}`)}
              data-testid={`super-school-${s.school_id}`}
              className="bg-white p-6 text-left hover:bg-[#FAFAFA] transition-all group"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="w-10 h-10 bg-[#002FA7] flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-[#71717A] group-hover:text-[#002FA7] transition-colors" />
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-1">{s.board}</div>
              <h3 className="font-heading text-xl font-black tracking-tighter leading-tight mb-1">{s.name}</h3>
              <div className="text-xs text-[#52525B] mb-4">{s.location || '—'}</div>
              <div className="grid grid-cols-3 gap-1 text-[10px] pt-3 border-t border-[#D4D4D8]">
                <div><div className="text-[#71717A] uppercase tracking-wider">Teachers</div><div className="font-mono font-bold">{s.teachers}</div></div>
                <div><div className="text-[#71717A] uppercase tracking-wider">Classes</div><div className="font-mono font-bold">{s.classes}</div></div>
                <div><div className="text-[#71717A] uppercase tracking-wider">Cells</div><div className="font-mono font-bold">{s.cells}</div></div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white p-5">
      <Icon className="w-4 h-4 mb-3" style={{ color: accent }} />
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">{label}</div>
      <div className="font-mono text-2xl font-bold mt-1" style={{ color: accent }}>{value}</div>
    </div>
  );
}
