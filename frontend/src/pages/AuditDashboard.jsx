import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { RefreshCw, AlertTriangle, TrendingUp, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AuditDashboard() {
  const { schoolId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/schools/${schoolId}/timetable/audit-all`);
      setData(res.data);
      toast.success(`Audit done · ${res.data.totals.total} violations`);
    } catch { toast.error('Audit failed'); }
    setLoading(false);
  };
  useEffect(() => { run(); /* eslint-disable-next-line */ }, [schoolId]);

  if (!data) return <div className="p-12 text-sm text-[#71717A]">Running audit…</div>;

  const maxCount = Math.max(1, ...data.classes.map((c) => c.total));
  const heatColor = (n) => {
    if (n === 0) return '#FAFAFA';
    const t = Math.min(1, n / maxCount);
    // Light → dark red
    const r = 255, g = Math.floor(255 - 220 * t), b = Math.floor(255 - 220 * t);
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div className="p-8 lg:p-12 max-w-7xl">
      <div className="flex items-end justify-between gap-6 mb-10 pb-6 border-b border-[#D4D4D8]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">AUDIT / MULTI-CLASS</div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tighter">Violation Heat-Map</h1>
          <div className="text-sm text-[#71717A] mt-2">Constraint compliance across every class in the school.</div>
        </div>
        <Button onClick={run} disabled={loading} className="rounded-none h-10 bg-[#002FA7] text-white" data-testid="rerun-audit-btn">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Re-run Audit
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-px bg-[#D4D4D8] border border-[#D4D4D8] mb-10" data-testid="audit-totals">
        <Stat label="TOTAL VIOLATIONS" value={data.totals.total} accent="#09090B" />
        <Stat label="HARD" value={data.totals.hard} accent="#FF3B30" />
        <Stat label="SOFT" value={data.totals.soft} accent="#FFCC00" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">PER-CLASS HEAT-MAP</div>
          <div className="bg-white border border-[#D4D4D8]" data-testid="heatmap-table">
            <table className="w-full text-sm">
              <thead className="border-b border-[#D4D4D8] bg-[#FAFAFA]">
                <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold">
                  <th className="px-3 py-3">CLASS</th>
                  {data.categories.map((c) => <th key={c} className="px-2 py-3 text-center">{c}</th>)}
                  <th className="px-3 py-3 text-right">TOTAL</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.class_id} className="border-b border-[#E4E4E7] last:border-0">
                    <td className="px-3 py-2 font-semibold">{c.class_name}</td>
                    {data.categories.map((cat) => {
                      const n = c.by_category[cat] || 0;
                      return (
                        <td key={cat} className="px-2 py-2 text-center" style={{ background: heatColor(n) }}>
                          <span className={`font-mono text-xs ${n > 0 ? 'font-bold' : 'text-[#71717A]'}`}>{n || '·'}</span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-mono font-bold">{c.total}</td>
                    <td className="px-3 py-2">
                      <Link to={`/school/${schoolId}/timetable`} className="text-[#002FA7] hover:underline text-xs flex items-center gap-1 justify-end">
                        Open <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.classes.length === 0 && <tr><td colSpan="9" className="p-12 text-center text-sm text-[#71717A]">No classes audited.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#71717A] font-bold mb-3">TOP VIOLATED RULES</div>
          <div className="bg-white border border-[#D4D4D8]">
            {data.top_rules.length === 0 ? (
              <div className="p-6 text-sm text-[#71717A] text-center">No rules triggered — clean run!</div>
            ) : (
              data.top_rules.map((r, i) => (
                <div key={i} className="px-4 py-3 border-b border-[#E4E4E7] last:border-0 flex items-start gap-3">
                  <div className="w-6 h-6 bg-[#FF3B30] text-white text-[10px] font-bold flex items-center justify-center font-mono">{r.count}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-white p-6">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#71717A] font-bold mb-1">{label}</div>
      <div className="font-mono text-4xl font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}
