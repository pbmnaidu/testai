import React, { useEffect, useState } from 'react';
import { fetchFilters, fetchOverview, fetchRiskQueue } from '../services/api';
import { FilterOptions, NationalOverviewResponse, WorkRecord } from '../types';
import { ArrowLeft, ArrowUpDown, ArrowRight, BarChart3, DollarSign, Eye, Filter, RotateCcw } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

interface FinancialAnalyticsPageProps {
  onSelectWork?: (workId: string) => void;
  onOpenBenchmarks?: () => void;
}

const money = (value?: number) => {
  if (value === undefined || value === null || Number.isNaN(value)) return 'Not available';
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const comparison = (min?: number, max?: number, current?: number, unit = '') => {
  if (min === undefined || max === undefined || current === undefined) return 'Insufficient historical data';
  const suffix = unit ? `/${unit}` : '';
  return `Historical: ${money(min)}${suffix} – ${money(max)}${suffix} · Current: ${money(current)}${suffix}`;
};

export const FinancialAnalyticsPage: React.FC<FinancialAnalyticsPageProps> = ({ onSelectWork, onOpenBenchmarks }) => {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<NationalOverviewResponse | null>(null);
  const [selectedState, setSelectedState] = usePersistentState('mplads.financial-analytics.state', '');
  const [selectedCategory, setSelectedCategory] = usePersistentState('mplads.financial-analytics.category', '');
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [sortField, setSortField] = usePersistentState('mplads.financial-analytics.sort-field', 'financial_risk_rank');
  const [sortOrder, setSortOrder] = usePersistentState<'asc' | 'desc'>('mplads.financial-analytics.sort-order', 'desc');
  const [page, setPage] = usePersistentState('mplads.financial-analytics.page', 1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchFilters().then(setFilterOpts).catch(console.error);
    fetchOverview().then(setOverview).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRiskQueue({
      state: selectedState || undefined,
      category: selectedCategory || undefined,
      financial_only: true,
      min_financial_risk: 0,
      sort_by: 'financial_risk_rank',
      page,
      limit: 50,
    }).then((res) => {
      setRecords(res.records || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedState, selectedCategory, page]);

  const sortedRecords = [...records].sort((a, b) => {
    const left = a[sortField as keyof WorkRecord] ?? '';
    const right = b[sortField as keyof WorkRecord] ?? '';
    const result = typeof left === 'string' || typeof right === 'string'
      ? String(left).localeCompare(String(right))
      : Number(left) - Number(right);
    return sortOrder === 'asc' ? result : -result;
  });

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortOrder('desc'); }
  };

  const reset = () => { setSelectedState(''); setSelectedCategory(''); setPage(1); };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <DollarSign className="w-6 h-6 text-amber-600" /> Financial Risk Order
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Ranked works outside a labelled completed-work peer range. Cost groups use constituency, then state, then India only when a narrower group has insufficient history; unit prices require a specific work type and validated quantity.
        </p>
        </div>
        {onOpenBenchmarks && <button onClick={onOpenBenchmarks} className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"><BarChart3 className="w-4 h-4" /> View peer benchmark statistics</button>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Works requiring financial review</span>
          <div className="text-2xl font-black text-amber-600 font-mono mt-2">{(overview?.financial_summary?.flagged_financial_outliers ?? 0).toLocaleString()}</div>
          <p className="text-xs text-slate-500 mt-1">Outside the selected completed-work peer range</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Comparable cost histories</span>
          <div className="text-2xl font-black text-slate-900 font-mono mt-2">{(overview?.financial_summary?.historical_comparison_available ?? 0).toLocaleString()}</div>
          <p className="text-xs text-slate-500 mt-1">At least two completed works in a labelled peer group</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Unit-price histories</span>
          <div className="text-2xl font-black text-slate-900 font-mono mt-2">{(overview?.financial_summary?.unit_price_comparisons ?? 0).toLocaleString()}</div>
          <p className="text-xs text-slate-500 mt-1">Validated quantity and matching unit</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><Filter className="w-4 h-4" /> Filter financial risks</div>
          {(selectedState || selectedCategory) && <button onClick={reset} className="text-xs text-slate-600 font-bold flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Clear filters</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <select value={selectedState} onChange={(event) => { setSelectedState(event.target.value); setPage(1); }} className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium">
            <option value="">All States / UTs</option>
            {filterOpts?.states.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
          <select value={selectedCategory} onChange={(event) => { setSelectedCategory(event.target.value); setPage(1); }} className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 font-medium">
            <option value="">All Sectors / Categories</option>
            {filterOpts?.categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">Financial Risk Order ({total.toLocaleString()} works)</h3>
          <span className="text-xs text-slate-500">All flagged works are included</span>
        </div>
        {loading ? <div className="p-8 text-center text-xs text-slate-500">Loading Financial Risk Order...</div> : sortedRecords.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">No financially unusual works found for the selected filters.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                <th className="py-3 px-4">Work</th><th className="py-3 px-4">Constituency / Sector</th>
                <th className="py-3 px-4 text-center cursor-pointer" onClick={() => handleSort('financial_risk_level')}>Risk <ArrowUpDown className="inline w-3 h-3" /></th>
                <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort('financial_explanation')}>What happened? <ArrowUpDown className="inline w-3 h-3" /></th>
                <th className="py-3 px-4">Evidence</th><th className="py-3 px-4 text-center">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {sortedRecords.map((record) => (
                  <tr key={record.work_id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 min-w-[240px]"><div className="font-bold text-slate-900">{record.description || record.work_id}</div><div className="text-[10px] font-mono text-slate-500 mt-1">{record.work_id}</div></td>
                    <td className="py-3 px-4 min-w-[160px]"><div className="font-bold">{record.constituency || 'Unknown constituency'}</div><div className="text-[11px] text-slate-500">{record.main_sector || record.work_category}</div></td>
                    <td className="py-3 px-4 text-center"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${record.financial_risk_level === 'HIGH' ? 'bg-red-100 text-red-700' : record.financial_risk_level === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{record.financial_risk_level}</span><div className="text-[10px] text-slate-500 mt-2">#{record.financial_risk_rank ?? '—'}</div></td>
                    <td className="py-3 px-4 min-w-[360px] font-medium"><div>{record.financial_what_happened || record.financial_explanation}</div><div className="mt-2 text-[11px] text-slate-600"><b>Why it matters:</b> {record.financial_why_it_matters || 'Review the estimate and supporting cost records.'}</div></td>
                    <td className="py-3 px-4 min-w-[350px] text-slate-600 leading-5 whitespace-pre-line"><div><b className="text-slate-800">Supporting details:</b> {record.financial_supporting_details || record.financial_risk_evidence || 'Insufficient historical data for a reliable comparison.'}</div>{record.financial_audit_interpretation && <div className="mt-2 text-[11px] text-slate-500">{record.financial_audit_interpretation}</div>}</td>
                    <td className="py-3 px-4 text-center">{onSelectWork && <button onClick={() => onSelectWork(record.work_id)} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Inspect</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Previous</button>
            <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold inline-flex items-center gap-1">Next <ArrowRight className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};
