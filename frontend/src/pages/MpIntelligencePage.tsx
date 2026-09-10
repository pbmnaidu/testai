import React, { useState, useEffect } from 'react';
import { fetchFilters, fetchMpIntelligence } from '../services/api';
import { FilterOptions, MpIntelligenceResponse } from '../types';
import { RiskBadge } from '../components/cards/RiskBadge';
import { UserCheck, MapPin, Building, Eye, ChevronRight, ArrowUpDown } from 'lucide-react';

interface MpIntelligencePageProps {
  onSelectWork: (workId: string) => void;
}

export const MpIntelligencePage: React.FC<MpIntelligencePageProps> = ({ onSelectWork }) => {
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  
  // Cascading optional filter states
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedConstituency, setSelectedConstituency] = useState<string>('');
  const [selectedMp, setSelectedMp] = useState<string>('');

  const [data, setData] = useState<MpIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sortField, setSortField] = useState<string>('composite_risk_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Load Filter Options
  useEffect(() => {
    fetchFilters().then(setFilterOpts).catch(console.error);
  }, []);

  // Fetch MP Intelligence Data whenever cascading filters change
  const loadIntelligence = () => {
    setLoading(true);
    fetchMpIntelligence({
      state: selectedState,
      constituency: selectedConstituency,
      mp_name: selectedMp,
    })
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadIntelligence();
  }, [selectedState, selectedConstituency, selectedMp]);

  const sortedWorks = React.useMemo(() => {
    if (!data?.suspicious_works) return [];
    return [...data.suspicious_works].sort((a, b) => {
      let aVal: any = a[sortField as keyof typeof a];
      let bVal: any = b[sortField as keyof typeof b];
      if (sortField === 'State') { aVal = a.State; bVal = b.State; }
      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
  }, [data?.suspicious_works, sortField, sortOrder]);

  const availableConstituencies = data?.available_constituencies || [];
  const availableMps = data?.available_mps || [];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card-panel p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <UserCheck className="w-6 h-6 text-indigo-600" />
              <span>MP Portfolio Risk Intelligence</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Filter portfolio metrics and audit risk signals by State, Constituency, and Member of Parliament
            </p>
          </div>
        </div>

        {/* Cascading Filter Toolbar */}
        <div className="mt-6 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-wrap items-center gap-3">
          {/* State Filter */}
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">State / UT</label>
            <select
              value={selectedState}
              onChange={(e) => {
                setSelectedState(e.target.value);
                setSelectedConstituency('');
                setSelectedMp('');
              }}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All States / UTs</option>
              {filterOpts?.states.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Constituency Filter */}
          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Constituency</label>
            <select
              value={selectedConstituency}
              onChange={(e) => {
                setSelectedConstituency(e.target.value);
                setSelectedMp('');
              }}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All Constituencies</option>
              {availableConstituencies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* MP Name Filter */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider">Member of Parliament</label>
            <select
              value={selectedMp}
              onChange={(e) => setSelectedMp(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="">All MPs</option>
              {availableMps.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex flex-col justify-end">
            <button
              onClick={() => {
                setSelectedState('');
                setSelectedConstituency('');
                setSelectedMp('');
              }}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-xl font-extrabold transition-colors mt-4"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card-panel p-12 text-center text-xs text-slate-500 font-medium">
          Loading MP Portfolio Intelligence...
        </div>
      ) : !data ? (
        <div className="card-panel p-12 text-center text-xs text-slate-500 font-medium">
          Failed to load MP portfolio analytics.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Portfolio KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card-panel p-4 space-y-1">
              <div className="text-[10px] font-extrabold uppercase text-slate-500">Representative MP</div>
              <div className="text-base font-extrabold text-slate-900 truncate">{selectedMp || 'Selected MP Portfolio'}</div>
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-indigo-600" /> {selectedConstituency || 'All Constituencies'}, {selectedState || 'National'}
              </div>
            </div>

            <div className="card-panel p-4 space-y-1">
              <div className="text-[10px] font-extrabold uppercase text-slate-500">Portfolio Work Count</div>
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">{data.portfolio_summary.total_works.toLocaleString()}</div>
              <p className="text-xs text-slate-500 font-medium">{data.portfolio_summary.completed_works} Completed • {data.portfolio_summary.ongoing_works} Ongoing</p>
            </div>

            <div className="card-panel p-4 space-y-1">
              <div className="text-[10px] font-extrabold uppercase text-slate-500">Total Sanctioned Budget</div>
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">₹{(data.portfolio_summary.total_sanctioned / 10000000).toFixed(2)} Cr</div>
              <p className="text-xs text-slate-500 font-medium">Sanctioned allocation value</p>
            </div>

            <div className="card-panel p-4 space-y-1">
              <div className="text-[10px] font-extrabold uppercase text-slate-500">Total Expenditure</div>
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">₹{(data.portfolio_summary.total_expenditure / 10000000).toFixed(2)} Cr</div>
              <p className="text-xs text-slate-500 font-medium">
                {((data.portfolio_summary.total_expenditure / (data.portfolio_summary.total_sanctioned || 1)) * 100).toFixed(1)}% Disbursed
              </p>
            </div>
          </div>

          {/* High Risk Works Table */}
          <div className="card-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building className="w-4 h-4 text-indigo-600" />
              <span>Priority Flagged Works Portfolio ({sortedWorks.length})</span>
            </h3>

            {sortedWorks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-medium">
                No high-risk or flagged works found for the selected entity criteria.
              </div>
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
                          State & Constituency <ArrowUpDown className={`w-3 h-3 ${sortField === 'State' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                        </span>
                      </th>
                      <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('work_category')}>
                        <span className="flex items-center gap-1">
                          Category <ArrowUpDown className={`w-3 h-3 ${sortField === 'work_category' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                        </span>
                      </th>
                      <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('sanction_amount')}>
                        <span className="flex items-center justify-end gap-1">
                          Sanction Budget <ArrowUpDown className={`w-3 h-3 ${sortField === 'sanction_amount' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                        </span>
                      </th>
                      <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('composite_risk_score')}>
                        <span className="flex items-center justify-center gap-1">
                          Composite Risk <ArrowUpDown className={`w-3 h-3 ${sortField === 'composite_risk_score' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                        </span>
                      </th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {sortedWorks.map((r) => (
                      <tr key={r.work_id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.work_id}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{r.State}</div>
                          <div className="text-[11px] text-slate-500">{r.Constituency}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">{r.work_category}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">₹{(r.sanction_amount / 100000).toFixed(2)} L</td>
                        <td className="py-3 px-4 text-center">
                          <RiskBadge level={r.overall_risk_level} score={r.composite_risk_score} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => onSelectWork(r.work_id)}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                          >
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
      )}
    </div>
  );
};
