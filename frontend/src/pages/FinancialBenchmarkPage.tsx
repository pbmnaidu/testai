import React, { useEffect, useState } from 'react';
import { BarChart3, Filter, RotateCcw } from 'lucide-react';
import { fetchFinancialBenchmarks } from '../services/api';
import { FinancialBenchmarkRecord } from '../types';
import { usePersistentState } from '../hooks/usePersistentState';

const money = (value?: number) => value === undefined || value === null ? '—' : `₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const FinancialBenchmarkPage: React.FC = () => {
  const [records, setRecords] = useState<FinancialBenchmarkRecord[]>([]);
  const [available, setAvailable] = useState({ states: [] as string[], sectors: [] as string[], subsectors: [] as string[] });
  const [scope, setScope] = usePersistentState('mplads.financial-benchmarks.scope', 'CONSTITUENCY');
  const [state, setState] = usePersistentState('mplads.financial-benchmarks.state', '');
  const [sector, setSector] = usePersistentState('mplads.financial-benchmarks.sector', '');
  const [subsector, setSubsector] = usePersistentState('mplads.financial-benchmarks.subsector', '');
  const [page, setPage] = usePersistentState('mplads.financial-benchmarks.page', 1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchFinancialBenchmarks({ scope, state: state || undefined, main_sector: sector || undefined, subsector: subsector || undefined, page, limit: 50 })
      .then((result) => { setRecords(result.records); setAvailable(result.available); setTotal(result.total); setTotalPages(result.total_pages || 0); })
      .finally(() => setLoading(false));
  }, [scope, state, sector, subsector, page]);

  const reset = () => { setScope('CONSTITUENCY'); setState(''); setSector(''); setSubsector(''); setPage(1); };
  return <div className="p-6 space-y-6">
    <div>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><BarChart3 className="w-6 h-6 text-indigo-600" /> Peer Benchmark Statistics</h2>
      <p className="text-xs text-slate-500 mt-1">Completed-work cost ranges by constituency, state, and all-India peer groups. Low, median, and high are shown separately from unit prices, which are included only for exact, specific work types with validated quantities.</p>
    </div>
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex justify-between items-center mb-3"><div className="flex gap-2 items-center text-xs font-bold"><Filter className="w-4 h-4" /> Benchmark filters</div><button onClick={reset} className="text-xs font-bold text-slate-600 flex gap-1 items-center"><RotateCcw className="w-3.5 h-3.5" /> Clear</button></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <select value={scope} onChange={(e) => { setScope(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><option value="CONSTITUENCY">Constituency</option><option value="STATE">State</option><option value="ALL_INDIA">All India</option></select>
        <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><option value="">All states / UTs</option>{available.states.filter((item) => item !== 'All India').map((item) => <option key={item}>{item}</option>)}</select>
        <select value={sector} onChange={(e) => { setSector(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><option value="">All main sectors</option>{available.sectors.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={subsector} onChange={(e) => { setSubsector(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><option value="">All sub-sectors</option>{available.subsectors.filter((item) => item !== 'All Sub-sectors').map((item) => <option key={item}>{item}</option>)}</select>
      </div>
    </div>
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm overflow-x-auto">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3"><h3 className="font-bold text-sm text-slate-900">Historical benchmark groups ({total.toLocaleString()})</h3><span className="text-[11px] text-slate-500">Minimum two completed works per group</span></div>
      {loading ? <div className="p-8 text-xs text-center text-slate-500">Loading benchmark statistics…</div> : <table className="w-full min-w-[1100px] text-left text-xs"><thead><tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><th className="p-3">Geography / level</th><th className="p-3">Sector / peer category</th><th className="p-3 text-center">Completed</th><th className="p-3 text-center">Outliers</th><th className="p-3">Cost low</th><th className="p-3">Cost median</th><th className="p-3">Cost high</th><th className="p-3">Unit-price median</th></tr></thead><tbody className="divide-y divide-slate-100">{records.map((record) => <tr key={record.benchmark_id}><td className="p-3"><div className="font-bold text-slate-900">{record.state} · {record.constituency}</div><div className="text-[10px] text-slate-500">{record.comparison_scope.replace('_', ' ')} · {record.comparison_level.replace('_', ' ')}</div></td><td className="p-3"><div className="font-semibold">{record.main_sector}</div><div className="text-[10px] text-slate-500">{record.comparison_level === 'EFFECTIVE_CATEGORY' ? record.effective_work_category : record.subsector}</div>{record.peer_category_auto_generated && <div className="text-[10px] font-semibold text-indigo-600">Auto-created from unspecified category</div>}</td><td className="p-3 text-center font-bold">{record.completed_work_count}</td><td className="p-3 text-center font-bold text-amber-700">{record.outlier_count}</td><td className="p-3">{money(record.historical_cost_min)}</td><td className="p-3 font-bold">{money(record.historical_cost_median)}</td><td className="p-3">{money(record.historical_cost_max)}</td><td className="p-3">{record.historical_unit_price_count ? money(record.historical_unit_price_median) : 'Not applicable'}</td></tr>)}</tbody></table>}
      {!loading && records.length === 0 && <div className="p-8 text-xs text-center text-slate-500">No completed-work benchmark groups match these filters.</div>}
      <div className="pt-4 mt-4 border-t flex justify-between text-xs text-slate-500"><span>Page {page} of {totalPages || 1}</span><div className="space-x-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-lg bg-slate-100 disabled:opacity-40 font-bold">Previous</button><button disabled={totalPages === 0 || page >= totalPages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-lg bg-slate-100 disabled:opacity-40 font-bold">Next</button></div></div>
    </div>
  </div>;
};
