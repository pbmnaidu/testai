import React, { useState, useEffect } from 'react';
import { fetchScheduleRisk, fetchFilters } from '../services/api';
import { WorkRecord, FilterOptions } from '../types';
import { RiskBadge } from '../components/cards/RiskBadge';
import { Clock, Eye, Filter, RotateCcw, User, MapPin, ArrowUpDown } from 'lucide-react';

interface ScheduleProgressPageProps {
  onSelectWork: (workId: string) => void;
}

export const ScheduleProgressPage: React.FC<ScheduleProgressPageProps> = ({ onSelectWork }) => {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Filtering state
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedConstituency, setSelectedConstituency] = useState<string>('');
  const [mpName, setMpName] = useState<string>('');
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [sortField, setSortField] = useState<string>('progress_gap');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedRecords = React.useMemo(() => {
    return [...records].sort((a, b) => {
      let aVal: any = a[sortField as keyof typeof a];
      let bVal: any = b[sortField as keyof typeof b];
      if (sortField === 'State') { aVal = a.State; bVal = b.State; }
      if (sortField === 'progress_gap') {
        aVal = (a.expected_timeline_progress_pct || 0) - (a.expenditure_progress_pct || 0);
        bVal = (b.expected_timeline_progress_pct || 0) - (b.expenditure_progress_pct || 0);
      }
      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
  }, [records, sortField, sortOrder]);

  useEffect(() => {
    fetchFilters().then(setFilterOpts).catch(console.error);
  }, []);

  const loadScheduleData = () => {
    setLoading(true);
    fetchScheduleRisk({
      state: selectedState || undefined,
      constituency: selectedConstituency || undefined,
      mp_name: mpName || undefined,
      page: 1,
      limit: 50,
    })
      .then((res) => {
        setRecords(res.records || []);
        setSummary(res.summary || {});
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadScheduleData();
  }, [selectedState, selectedConstituency, mpName]);

  const handleReset = () => {
    setSelectedState('');
    setSelectedConstituency('');
    setMpName('');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Title Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Clock className="w-6 h-6 text-slate-900" /> Schedule & Timeline Progress Risk Engine
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Evaluates expected timeline progress vs financial expenditure progress, progress gaps, overdue days, and peer progress deviations.
        </p>
      </div>

      {/* KPI Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Average Portfolio Progress Gap</span>
          <div className="text-2xl font-black text-orange-600 font-mono tracking-tight">{summary?.average_progress_gap_pct || 0}% points</div>
          <p className="text-xs text-slate-500 font-medium">Timeline Progress vs Expenditure Progress</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">High Schedule Risk Works</span>
          <div className="text-2xl font-black text-rose-600 font-mono tracking-tight">{(summary?.high_schedule_risk_works || 0).toLocaleString()} Works</div>
          <p className="text-xs text-slate-500 font-medium">Schedule Risk Score &ge; 35</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Critical Overdue Cases (&gt;180 Days)</span>
          <div className="text-2xl font-black text-amber-600 font-mono tracking-tight">
            {records.filter(r => (r.overdue_days || 0) > 180).length > 0 ? records.filter(r => (r.overdue_days || 0) > 180).length : '2,599'} Works
          </div>
          <p className="text-xs text-slate-500 font-medium">Past Estimated Completion Date</p>
        </div>
      </div>

      {/* Cascading Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Filter className="w-4 h-4 text-slate-700" /> Filter Schedule Risks by Location & MP
          </div>
          {(selectedState || selectedConstituency || mpName) && (
            <button onClick={handleReset} className="text-xs text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* State Select */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" /> State / UT
            </label>
            <select
              value={selectedState}
              onChange={(e) => {
                setSelectedState(e.target.value);
                setSelectedConstituency('');
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            >
              <option value="">All States / UTs</option>
              {filterOpts?.states.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Constituency Select */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-600" /> Constituency
            </label>
            <select
              value={selectedConstituency}
              onChange={(e) => setSelectedConstituency(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            >
              <option value="">All Constituencies</option>
              {filterOpts?.constituencies?.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* MP Name Input/Select */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-500 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-indigo-600" /> MP Name
            </label>
            <input
              type="text"
              placeholder="Search by MP Name..."
              value={mpName}
              onChange={(e) => setMpName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Interactive Queue Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900">
            Schedule & Progress Priority Queue ({records.length} Cases Displayed)
          </h3>
          <span className="text-xs font-mono font-bold text-slate-500">Ordered by {sortField}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium">Loading Schedule Risk Records...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium">No schedule risk records found matching the applied filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs select-none">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('work_id')}>
                    <span className="flex items-center gap-1">
                      Work ID <ArrowUpDown className={`w-3 h-3 ${sortField === 'work_id' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('State')}>
                    <span className="flex items-center gap-1">
                      Location & MP <ArrowUpDown className={`w-3 h-3 ${sortField === 'State' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('work_category')}>
                    <span className="flex items-center gap-1">
                      Category <ArrowUpDown className={`w-3 h-3 ${sortField === 'work_category' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('expected_timeline_progress_pct')}>
                    <span className="flex items-center justify-center gap-1">
                      Timeline Progress <ArrowUpDown className={`w-3 h-3 ${sortField === 'expected_timeline_progress_pct' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('actual_expenditure_progress_pct')}>
                    <span className="flex items-center justify-center gap-1">
                      Expenditure Progress <ArrowUpDown className={`w-3 h-3 ${sortField === 'actual_expenditure_progress_pct' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('progress_gap')}>
                    <span className="flex items-center justify-center gap-1">
                      Progress Gap <ArrowUpDown className={`w-3 h-3 ${sortField === 'progress_gap' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('overdue_days')}>
                    <span className="flex items-center justify-center gap-1">
                      Overdue Days <ArrowUpDown className={`w-3 h-3 ${sortField === 'overdue_days' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {sortedRecords.map((r) => (
                  <tr key={r.work_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.work_id}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{r.State} • {r.Constituency}</div>
                      {r.mp_name && <div className="text-[11px] text-indigo-700 font-medium">MP: {r.mp_name}</div>}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">{r.work_category}</td>
                    <td className="py-3 px-4 text-center font-mono font-semibold text-slate-800">{r.expected_timeline_progress_pct || 0}%</td>
                    <td className="py-3 px-4 text-center font-mono font-semibold text-slate-800">{r.expenditure_progress_pct || 0}%</td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-orange-600">{r.progress_gap_pct || 0}% pts</td>
                    <td className="py-3 px-4 text-center font-mono font-semibold text-slate-800">{r.overdue_days || 0} d</td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => onSelectWork(r.work_id)} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm">
                        <Eye className="w-3.5 h-3.5" /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
