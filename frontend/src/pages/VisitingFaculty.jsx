import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Globe2, Calendar, ArrowUpRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function VisitingFaculty() {
  const { schoolId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  const load = async () => {
    try {
      const res = await api.get(`/schools/${schoolId}/teachers-cross-school`);
      setData(res.data);
    } catch { toast.error('Load failed'); }
  };
  useEffect(() => { load(); }, [schoolId]);

  if (!data) return <div className="p-12 text-sm text-[#71717A]">Loading…</div>;

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">SPECIAL / VISITING FACULTY</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Cross-School Teachers</h1>
          <div className="text-sm text-[#71717A] mt-2">Visiting faculty and virtual teachers usable across schools. Mark a teacher as cross-school inside the Teachers master to opt-in.</div>
        </div>
        <Button onClick={load} variant="outline" className="rounded-none border-[#D4D4D8] h-10" data-testid="vf-reload-btn">
          <RefreshCw className="w-3.5 h-3.5 mr-2" /> Reload
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[#D4D4D8] border border-[#D4D4D8]">
        <div className="bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe2 className="w-4 h-4 text-[#002FA7]" />
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold">OWN · CROSS-SCHOOL ENABLED</div>
            <span className="font-mono text-xs ml-auto text-[#71717A]">{data.own_cross_school.length}</span>
          </div>
          <TeacherList list={data.own_cross_school} onView={(t) => navigate(`/school/${schoolId}/teacher/${t.id}`)} />
        </div>

        <div className="bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-[#FF3B30]" />
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold">VISITING · FROM OTHER SCHOOLS</div>
            <span className="font-mono text-xs ml-auto text-[#71717A]">{data.visiting.length}</span>
          </div>
          <TeacherList list={data.visiting} hideAction />
        </div>
      </div>
    </div>
  );
}

function TeacherList({ list, onView, hideAction }) {
  if (!list.length) return <div className="text-xs text-[#71717A] py-8 text-center">None</div>;
  return (
    <div className="space-y-2">
      {list.map((t) => (
        <div key={t.id} className="flex items-center gap-3 p-2 border border-[#E4E4E7] hover:bg-[#FAFAFA]">
          {t.photo ? <img src={t.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
            : <div className="w-9 h-9 bg-[#002FA7] text-white text-[11px] font-bold flex items-center justify-center rounded-full">{t.abbreviation}</div>}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{t.name}</div>
            <div className="text-[10px] text-[#71717A] font-mono">{t.abbreviation} · {(t.cross_school_ids||[]).length} schools</div>
          </div>
          {!hideAction && (
            <Button onClick={() => onView(t)} variant="outline" className="rounded-none h-8 border-[#D4D4D8]" data-testid={`view-vf-${t.id}`}>
              <ArrowUpRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
