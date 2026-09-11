import React, { useEffect, useState } from 'react';
import { fetchDuplicateClusters, fetchFilters } from '../services/api';
import { DuplicateCluster, FilterOptions } from '../types';
import { AlertTriangle, ArrowLeft, ArrowRight, Calendar, Copy, DollarSign, Eye, MapPin, RotateCcw } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

interface DuplicateInspectorPageProps {
  onSelectWork: (workId: string) => void;
}

const amount = (value?: number) => value === undefined || value === null ? 'Not available' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const DuplicateInspectorPage: React.FC<DuplicateInspectorPageProps> = ({ onSelectWork }) => {
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = usePersistentState('mplads.duplicate-inspector.page', 1);
  const [totalPages, setTotalPages] = useState(1);
  const [state, setState] = usePersistentState('mplads.duplicate-inspector.state', '');
  const [riskLevel, setRiskLevel] = usePersistentState('mplads.duplicate-inspector.risk-level', '');
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchFilters().then(setFilterOpts).catch(console.error); }, []);

  useEffect(() => {
    setLoading(true);
    fetchDuplicateClusters({ state: state || undefined, risk_level: riskLevel || undefined, page, limit: 12 })
      .then((result) => {
        setClusters(result.records || []);
        setTotal(result.total || 0);
        setTotalPages(result.total_pages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [state, riskLevel, page]);

  const reset = () => { setState(''); setRiskLevel(''); setPage(1); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><Copy className="w-6 h-6 text-violet-600" /> Duplicate & Split-Work Review</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">Ranked clusters of works that may describe one physical project, overlapping scope, or a larger work divided into smaller records. Common wording alone is not treated as duplicate evidence.</p>
        </div>
        <div className="text-xs font-mono text-slate-700 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm font-semibold">{total.toLocaleString()} clusters</div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3 shadow-sm">
        <select value={state} onChange={(event) => { setState(event.target.value); setPage(1); }} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold">
          <option value="">All States / UTs</option>{filterOpts?.states.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={riskLevel} onChange={(event) => { setRiskLevel(event.target.value); setPage(1); }} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold">
          <option value="">All Audit Priorities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
        </select>
        {(state || riskLevel) && <button onClick={reset} className="px-3 py-2 text-xs font-bold text-slate-600 inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Clear filters</button>}
      </div>

      {loading ? <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">Loading duplicate-work clusters...</div> : clusters.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">No suspicious clusters found for the selected filters.</div> : (
        <div className="space-y-5">
          {clusters.map((cluster) => {
            const high = cluster.duplicate_risk_level === 'HIGH';
            const split = cluster.possible_split_work;
            return <article key={cluster.cluster_id} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`rounded-xl p-2.5 ${high ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}><AlertTriangle className="w-5 h-5" /></div>
                  <div><div className="text-[10px] font-mono text-slate-500">{cluster.cluster_id}</div><h3 className="text-lg font-black text-slate-900">{split ? 'Possible Split Work' : 'Possible Duplicate Work'}</h3><div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {cluster.state} · {cluster.constituency} · {cluster.sector || 'Sector unavailable'}</div></div>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${high ? 'bg-rose-100 text-rose-800' : cluster.duplicate_risk_level === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{cluster.duplicate_risk_level} AUDIT PRIORITY</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2"><div className="text-[10px] uppercase tracking-wider font-black text-slate-500">Common project / asset</div><div className="mt-1 text-base font-bold text-slate-900">{cluster.common_asset}</div><p className="mt-3 text-sm text-slate-700 leading-relaxed">{cluster.risk_reason}</p></div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs"><div className="font-bold text-slate-900">Cluster evidence</div><div>{cluster.related_record_count} related records</div><div>{cluster.id_range !== undefined && cluster.id_range !== null ? `Work-ID range: ${cluster.id_range}` : 'Work-ID range unavailable'}</div><div className="font-mono font-bold text-emerald-700">Combined cost: {amount(cluster.total_sanctioned_amount)}</div>{cluster.total_recommended_amount && <div className="font-mono text-slate-600">Recommended total: {amount(cluster.total_recommended_amount)}</div>}</div>
              </div>

              <div className="flex flex-wrap gap-2">{cluster.key_indicators.map((indicator) => <span key={indicator} className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[10px] font-bold text-indigo-800">{indicator}</span>)}</div>

              <div className="rounded-xl border border-slate-200 overflow-hidden"><div className="bg-slate-50 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">Supporting records — concise view</div><div className="divide-y divide-slate-100">{cluster.record_summaries.map((record) => <div key={record.work_id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"><div><div className="font-bold text-slate-900">{record.work_name}</div><div className="font-mono text-[10px] text-slate-500 mt-1">{record.work_id}</div></div><div className="flex flex-wrap items-center gap-4 text-slate-600"><span className="font-mono font-bold text-emerald-700"><DollarSign className="inline w-3.5 h-3.5" /> {amount(record.sanction_amount)}</span><span><Calendar className="inline w-3.5 h-3.5" /> {record.recommended_date || record.sanction_date || 'Date unavailable'}</span>{record.quantity && <span>Qty: {record.quantity}</span>}<button onClick={() => onSelectWork(record.work_id)} className="px-2.5 py-1.5 bg-slate-900 text-white rounded-lg font-bold inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> View details</button></div></div>)}</div></div>

              <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 text-xs text-violet-950"><span className="font-black">Audit observation: </span>{cluster.audit_observation}</div>
            </article>;
          })}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between text-xs text-slate-500"><span>Page {page} of {totalPages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Previous</button><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold inline-flex items-center gap-1">Next <ArrowRight className="w-3.5 h-3.5" /></button></div></div>
    </div>
  );
};
