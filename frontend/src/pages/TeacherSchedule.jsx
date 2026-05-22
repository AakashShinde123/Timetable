import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { ArrowLeft, Printer, FileDown } from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TeacherSchedule() {
  const { schoolId, teacherId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [periods, setPeriods] = useState([]);

  useEffect(() => {
    (async () => {
      const [sched, s, c, p] = await Promise.all([
        api.get(`/schools/${schoolId}/teachers/${teacherId}/schedule`),
        api.get(`/schools/${schoolId}/subjects`),
        api.get(`/schools/${schoolId}/classes`),
        api.get(`/schools/${schoolId}/periods`),
      ]);
      setData(sched.data);
      setSubjects(s.data);
      setClasses(c.data);
      setPeriods(p.data.sort((a, b) => a.order - b.order));
    })();
  }, [schoolId, teacherId]);

  const cellMap = useMemo(() => {
    if (!data) return {};
    const m = {};
    data.cells.forEach((c) => { m[`${c.day}__${c.period_id}`] = c; });
    return m;
  }, [data]);

  if (!data) return <div className="p-12 text-sm text-[#71717A]">Loading…</div>;
  const t = data.teacher;

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-8 pb-6 border-b border-[#D4D4D8]">
        <div className="flex items-center gap-5">
          <Link to={`/school/${schoolId}/teachers`} className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] hover:text-[#002FA7] font-bold flex items-center gap-1" data-testid="back-teachers">
            <ArrowLeft className="w-3 h-3" /> TEACHERS
          </Link>
          {t.photo ? (
            <img src={t.photo} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 bg-[#002FA7] text-white text-lg font-bold flex items-center justify-center rounded-full">{t.abbreviation}</div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold">TEACHER PORTAL · {t.abbreviation}</div>
            <h1 className="font-heading text-4xl font-black tracking-tighter">{t.name}</h1>
            <div className="text-sm text-[#71717A] mt-1">{data.total_periods_per_week} periods / week {t.is_class_teacher ? '· Class Teacher' : ''}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.open(`${process.env.REACT_APP_BACKEND_URL}/api/schools/${schoolId}/teachers/${teacherId}/schedule/pdf`, '_blank')} className="rounded-none h-10 bg-[#002FA7] text-white" data-testid="pdf-teacher-btn">
            <FileDown className="w-4 h-4 mr-2" /> Download PDF
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="rounded-none border-[#D4D4D8]" data-testid="print-schedule-btn">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto" data-testid="teacher-schedule-grid">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="bg-[#09090B] text-white text-[10px] uppercase tracking-[0.2em] font-bold p-2 w-28">PERIOD</th>
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
                {DAYS.map((d) => {
                  if (p.is_break) {
                    return <td key={d} className="bg-[#FAFAFA] border border-[#E4E4E7] p-2 text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold text-center">BREAK</td>;
                  }
                  const cell = cellMap[`${d}__${p.id}`];
                  const sub = cell && subjects.find((s) => s.id === cell.subject_id);
                  const cls = cell && classes.find((c) => c.id === cell.class_id);
                  if (!cell) return <td key={d} className="bg-white border border-[#E4E4E7] p-2 min-h-[56px]">&nbsp;</td>;
                  return (
                    <td key={d} className="bg-white border border-[#E4E4E7] p-2 min-h-[56px]">
                      {sub && <div className="text-[10px] font-bold font-mono px-1.5 py-0.5 inline-block text-white" style={{ background: sub.color }}>{sub.code}</div>}
                      <div className="text-xs font-semibold mt-1">{cls?.name || '—'}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
