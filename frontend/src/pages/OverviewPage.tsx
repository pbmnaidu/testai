import React, { useState, useEffect } from 'react';
import { fetchOverview } from '../services/api';
import { NationalOverviewResponse } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Landmark, DollarSign, CheckCircle, ShieldAlert, ArrowRight, Sparkles, Building, ArrowUpDown, Clock, AlertTriangle } from 'lucide-react';
import { IndiaGisHeatmap } from '../components/gis/IndiaGisHeatmap';

interface OverviewPageProps {
  onNavigateToRiskMonitor: (severity?: string, tab?: string) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigateToRiskMonitor }) => {
  const [data, setData] = useState<NationalOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [stateSortField, setStateSortField] = useState<string>('total_sanctioned');
  const [stateSortOrder, setStateSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchOverview().then((res) => { setData(res); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleStateSort = (field: string) => {
    if (stateSortField === field) {
      setStateSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setStateSortField(field);
      setStateSortOrder('desc');
    }
  };

  if (loading || !data) {
    return (
      <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="w-10 h-10 border-4 border-slate-100 border-t-transparent rounded-full animate-spin"></div>
        <span className="font-semibold text-slate-300">Loading National Executive Portfolio Analytics...</span>
      </div>
    );
  }

  const { summary, risk_distribution, top_states } = data;

  const sortedTopStates = [...top_states].sort((a, b) => {
    let aVal: any = a[stateSortField as keyof typeof a];
    let bVal: any = b[stateSortField as keyof typeof b];
    if (stateSortField === 'high_risk_works') {
      aVal = a.high_risk_works ?? 0;
      bVal = b.high_risk_works ?? 0;
    }
    if (typeof aVal === 'string') {
      return stateSortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return stateSortOrder === 'asc' ? (aVal - bVal) : (bVal - aVal);
  });

  const chartData = [
    {
      name: 'LOW RISK',
      rawCount: risk_distribution.LOW,
      scaledValue: Math.round(Math.log10(risk_distribution.LOW + 1) * 35),
      color: '#10b981',
    },
    {
      name: 'MEDIUM RISK',
      rawCount: risk_distribution.MEDIUM,
      scaledValue: Math.round(Math.log10(risk_distribution.MEDIUM + 1) * 35),
      color: '#f59e0b',
    },
    {
      name: 'HIGH RISK',
      rawCount: risk_distribution.HIGH,
      scaledValue: Math.round(Math.log10(risk_distribution.HIGH + 1) * 35),
      color: '#f97316',
    },
    {
      name: 'CRITICAL RISK',
      rawCount: risk_distribution.CRITICAL,
      scaledValue: Math.round(Math.log10(risk_distribution.CRITICAL + 1) * 35),
      color: '#f43f5e',
    },
  ];

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Executive Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Live National Decision Support System
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white">National Executive Portfolio Overview</h2>
          <p className="text-xs text-slate-300 max-w-2xl font-medium leading-relaxed">
            Macro fund allocation baselines, approved sanctions, disbursals, and multi-signal risk analysis across {summary.total_works.toLocaleString()} works nationwide.
          </p>
        </div>
        <button
          onClick={() => onNavigateToRiskMonitor('CRITICAL')}
          className="relative z-10 self-start md:self-auto px-4 py-2.5 bg-white text-slate-900 hover:bg-slate-100 rounded-2xl text-xs font-extrabold flex items-center gap-2 shadow-lg transition-all hover:scale-105 active:scale-95 shrink-0"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          <span>Inspect Audit Cases ({summary.high_risk_works.toLocaleString()})</span>
        </button>
      </div>

      {/* Macro KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="card-panel p-5 space-y-3 relative overflow-hidden group">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold">
            <span>Total Allocation Limit (T1)</span>
            <div className="w-9 h-9 rounded-2xl bg-indigo-950/60 text-indigo-400 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
            ₹{(summary.total_allocated_funds / 10000000).toFixed(2)} Cr
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            <span>MP Allocation Baseline</span>
          </div>
        </div>

        <div className="card-panel p-5 space-y-3 relative overflow-hidden group">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold">
            <span>Sanctioned Budget (T4)</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-950/60 text-emerald-400 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
            ₹{(summary.total_sanctioned_amount / 10000000).toFixed(2)} Cr
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>{summary.total_works.toLocaleString()} Total Works Base</span>
          </div>
        </div>

        <div className="card-panel p-5 space-y-3 relative overflow-hidden group">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold">
            <span>Disbursed Expenditure (T6)</span>
            <div className="w-9 h-9 rounded-2xl bg-blue-950/60 text-blue-400 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-100 font-mono tracking-tight">
            ₹{(summary.total_disbursed_amount / 10000000).toFixed(2)} Cr
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span>{summary.completed_works.toLocaleString()} Completed Works</span>
          </div>
        </div>

        <div className="card-panel p-5 space-y-3 relative overflow-hidden group border-rose-900/60">
          <div className="flex justify-between items-center text-slate-400 text-xs font-bold">
            <span>Audit Review Cases</span>
            <div className="w-9 h-9 rounded-2xl bg-rose-950/60 text-rose-400 flex items-center justify-center shadow-2xs group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-400 font-mono tracking-tight">
            {summary.high_risk_works.toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>Composite Score &ge; 35 (Audit Queue)</span>
          </div>
        </div>
      </div>

      {/* Interactive GIS Spatial Heatmap Section */}
      <IndiaGisHeatmap />

      {/* Overdue Works & Schedule Delay Alert Banner */}
      <div 
        onClick={() => onNavigateToRiskMonitor(undefined, 'schedule')}
        className="schedule-monitor-banner card-panel p-5 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border-amber-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-amber-700/70 transition-all shadow-md group"
      >
        <div className="flex items-center gap-4">
          <div className="schedule-monitor-icon w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-100">Schedule & Execution Delay Monitor</h3>
              <span className="schedule-monitor-badge px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {(summary.overdue_works ?? 0).toLocaleString()} Overdue Works
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Works exceeding target completion deadlines or exhibiting severe timeline vs expenditure disbursal gaps (&gt;40%). Click to inspect the Schedule Delay Monitor.
            </p>
          </div>
        </div>
        <div className="schedule-monitor-action flex items-center gap-2 text-xs font-bold text-amber-400 shrink-0 bg-amber-950/60 px-4 py-2 rounded-xl border border-amber-800/60 group-hover:bg-amber-900/60 transition-colors">
          <span>Open Schedule Delays Queue</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>

      {/* Risk Distribution & Top States Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Risk Distribution Log-Bar Chart */}
        <div className="card-panel p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>System Risk Distribution</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Log-proportional scaled visualization</p>
            </div>
            <span className="text-[10px] text-slate-300 bg-slate-800 px-2.5 py-1 rounded-full font-bold">Log Scale</span>
          </div>

          <div className="h-60 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 25, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} />
                <YAxis hide domain={[0, 'dataMax + 30']} />
                <Tooltip
                  formatter={(val: any, name: any, item: any) => [item.payload.rawCount.toLocaleString() + ' Works', 'Flagged Works']}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#f8fafc', fontSize: '11px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)' }}
                />
                <Bar dataKey="scaledValue" radius={[8, 8, 0, 0]}>
                  <LabelList
                    dataKey="rawCount"
                    position="top"
                    fontSize={11}
                    fontWeight="bold"
                    fill="#94a3b8"
                    formatter={(v: any) => Number(v).toLocaleString()}
                  />
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* State Portfolio Ranking Table */}
        <div className="card-panel p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-400" />
                <span>State Portfolio Concentration & Audit Ranking</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Ranked by total sanction volume and flagged works</p>
            </div>
            <button
              onClick={() => onNavigateToRiskMonitor()}
              className="text-xs text-slate-100 font-bold inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl transition-all shadow-2xs"
            >
              <span>View All States</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs select-none">
              <thead>
                <tr className="bg-slate-800/60 text-slate-400 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-800">
                  <th 
                    onClick={() => handleStateSort('state')}
                    className="py-3 px-4 rounded-l-xl cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center gap-1">
                      State / UT
                      <ArrowUpDown className={`w-3 h-3 ${stateSortField === 'state' ? 'text-amber-400 opacity-100 font-bold' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th 
                    onClick={() => handleStateSort('total_works')}
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center justify-end gap-1">
                      Total Works
                      <ArrowUpDown className={`w-3 h-3 ${stateSortField === 'total_works' ? 'text-amber-400 opacity-100 font-bold' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th 
                    onClick={() => handleStateSort('total_sanctioned')}
                    className="py-3 px-4 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center justify-end gap-1">
                      Sanctioned Budget
                      <ArrowUpDown className={`w-3 h-3 ${stateSortField === 'total_sanctioned' ? 'text-amber-400 opacity-100 font-bold' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th 
                    onClick={() => handleStateSort('high_risk_works')}
                    className="py-3 px-4 text-right rounded-r-xl cursor-pointer hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center justify-end gap-1">
                      Audit Cases (&ge;35)
                      <ArrowUpDown className={`w-3 h-3 ${stateSortField === 'high_risk_works' ? 'text-amber-400 opacity-100 font-bold' : 'opacity-50'}`} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200 font-medium">
                {sortedTopStates.slice(0, 8).map((st, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-100">
                      <span>{st.state}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400">{st.total_works.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-100">₹{(st.total_sanctioned / 10000000).toFixed(2)} Cr</td>
                    <td className="py-3 px-4 text-right">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-amber-950/80 text-amber-300 font-mono">
                        {(st.high_risk_works ?? 0).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
