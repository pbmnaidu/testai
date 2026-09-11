import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Database, Map, RefreshCw } from 'lucide-react';
import { fetchAnalyticsStates, fetchHighestRiskWorksByState } from '../services/api';
import { usePersistentState } from '../hooks/usePersistentState';

interface StateRiskAnalyticsPageProps {
  onSelectWork?: (workId: string) => void;
}

export const StateRiskAnalyticsPage: React.FC<StateRiskAnalyticsPageProps> = ({ onSelectWork }) => {
  const [states, setStates] = useState<any[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [selectedState, setSelectedState] = usePersistentState('mplads.state-risk-analytics.state', '');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchAnalyticsStates().then((response) => {
      const nextStates = response.states || [];
      setStates(nextStates);
      setMetadata(response.metadata || null);
      setSelectedState((current) => current || nextStates[0]?.state || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedState) return;
    setDetailLoading(true);
    fetchHighestRiskWorksByState(selectedState, 10).then((response) => {
      setRecords(response.records || []);
      setDetailLoading(false);
    }).catch(() => {
      setRecords([]);
      setDetailLoading(false);
    });
  }, [selectedState]);

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-500">Loading state analytics...</div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><Map className="w-6 h-6 text-indigo-600" /> State Risk & Original Records</h2>
          <p className="text-xs text-slate-500 mt-1">Every state statistic is derived from individual works in the active validated dataset.</p>
        </div>
        {metadata && <div className="text-right text-[11px] text-slate-500"><div>Data version <b className="font-mono text-slate-800">{metadata.data_version}</b></div><div>Analysis version <b className="font-mono text-slate-800">{metadata.analysis_version}</b></div>{metadata.stale_analysis && <div className="text-amber-700 font-bold mt-1">Analysis is based on an older dataset.</div>}</div>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">State risk distribution</h3>
          <span className="text-[11px] text-slate-500">Flag threshold: 35</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="bg-slate-50 border-b text-slate-500 uppercase text-[10px] font-bold"><th className="py-3 px-3">State</th><th className="py-3 px-3 text-right">Works</th><th className="py-3 px-3 text-right">High-risk works</th><th className="py-3 px-3 text-right">Risk %</th><th className="py-3 px-3 text-right">Financial</th><th className="py-3 px-3 text-right">Compliance</th><th className="py-3 px-3 text-right">Duplicate</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{states.map((item) => <tr key={item.state} onClick={() => setSelectedState(item.state)} className={selectedState === item.state ? 'bg-indigo-50 cursor-pointer' : 'hover:bg-slate-50 cursor-pointer'}><td className="py-3 px-3 font-bold text-slate-900">{item.state}</td><td className="py-3 px-3 text-right font-mono">{Number(item.total_works || 0).toLocaleString()}</td><td className="py-3 px-3 text-right font-mono text-rose-700">{Number(item.high_risk_works || 0).toLocaleString()}</td><td className="py-3 px-3 text-right font-mono">{Number(item.risk_percentage || 0).toFixed(1)}%</td><td className="py-3 px-3 text-right font-mono">{item.financial_risk_works || 0}</td><td className="py-3 px-3 text-right font-mono">{item.compliance_risk_works || 0}</td><td className="py-3 px-3 text-right font-mono">{item.duplicate_risk_works || 0}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-600" /> Highest-risk works by state</h3><p className="text-xs text-slate-500 mt-1">Select a row above to inspect the underlying work records.</p></div>
          <select value={selectedState} onChange={(event) => setSelectedState(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800"><option value="">Select state</option>{states.map((item) => <option key={item.state} value={item.state}>{item.state}</option>)}</select>
        </div>
        {detailLoading ? <div className="py-8 text-center text-xs text-slate-500"><RefreshCw className="w-4 h-4 animate-spin inline mr-2" />Loading work records...</div> : records.length === 0 ? <div className="py-8 text-center text-xs text-slate-500">No high-risk works found for the selected state.</div> : <div className="space-y-3">{records.map((record) => <div key={record.work_id} className="rounded-xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-slate-900">{record.work_id}</span><span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">{record.risk_level} · {record.risk_type}</span></div><p className="mt-1 text-xs font-semibold text-slate-800">{record.short_work_name}</p><p className="mt-1 text-[11px] text-slate-500">{record.constituency} · {record.sector}</p><p className="mt-2 text-xs text-slate-600">{record.risk_explanation}</p></div><div className="flex items-center gap-3 shrink-0"><span className="font-mono text-xs font-bold text-slate-700">Score {Number(record.risk_score || 0).toFixed(1)}</span>{onSelectWork && <button onClick={() => onSelectWork(record.work_id)} className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-bold inline-flex items-center gap-1">View record <ArrowRight className="w-3.5 h-3.5" /></button>}</div></div>)}</div>}
      </div>

      <div className="rounded-2xl bg-slate-900 text-slate-200 p-5 text-xs flex items-start gap-3"><Database className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /><p>Original values and derived risk explanations are kept separate in the analytics API, so each finding can be traced back to its underlying work record.</p></div>
    </div>
  );
};
