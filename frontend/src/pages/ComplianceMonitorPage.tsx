import React, { useState, useEffect } from 'react';
import { fetchRiskQueue, fetchFilters } from '../services/api';
import { WorkRecord, FilterOptions } from '../types';
import { CheckSquare, Eye, Filter, RotateCcw, Image, AlertCircle, ArrowUpDown } from 'lucide-react';

interface ComplianceMonitorPageProps {
  onSelectWork?: (workId: string) => void;
}

export const ComplianceMonitorPage: React.FC<ComplianceMonitorPageProps> = ({ onSelectWork }) => {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [minScore, setMinScore] = useState<number>(30);
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [sortField, setSortField] = useState<string>('compliance_risk_score');
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

  const loadComplianceQueue = () => {
    setLoading(true);
    fetchRiskQueue({
      state: selectedState || undefined,
      category: selectedCategory || undefined,
      min_compliance_risk: minScore,
      sort_by: 'compliance_risk_score',
      page: 1,
      limit: 25,
    })
      .then((res) => {
        setRecords(res.records || []);
        setTotal(res.total || 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadComplianceQueue();
  }, [selectedState, selectedCategory, minScore]);

  const handleReset = () => {
    setSelectedState('');
    setSelectedCategory('');
    setMinScore(30);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <CheckSquare className="w-6 h-6 text-slate-900" /> Compliance & Evidence-Gap Monitoring
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Monitors four deterministic administrative compliance rules and site evidence photo requirements.
        </p>
      </div>

      {/* Rule Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 text-xs">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">RULE 1: Missing Evidence Image</span>
          <div className="text-2xl font-black text-amber-600 font-mono tracking-tight">4,187 Works</div>
          <p className="text-xs text-slate-500 font-medium">Completed without site photo</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">RULE 2: Date Sequence Violation</span>
          <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">0 Works</div>
          <p className="text-xs text-slate-500 font-medium">Chronological sequence intact</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">RULE 3: Incomplete Description</span>
          <div className="text-2xl font-black text-amber-600 font-mono tracking-tight">837 Works</div>
          <p className="text-xs text-slate-500 font-medium">Length &lt; 15 characters</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">RULE 4: Zero Disbursal Completion</span>
          <div className="text-2xl font-black text-emerald-600 font-mono tracking-tight">0 Works</div>
          <p className="text-xs text-slate-500 font-medium">Completed with zero expenditure</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Filter className="w-4 h-4 text-slate-700" /> Filter Compliance Risk Cases
          </div>
          {(selectedState || selectedCategory || minScore !== 30) && (
            <button onClick={handleReset} className="text-xs text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">State / UT</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            >
              <option value="">All States / UTs</option>
              {filterOpts?.states.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Work Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            >
              <option value="">All Categories</option>
              {filterOpts?.categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Min Compliance Risk Score</label>
            <select
              value={minScore}
              onChange={(e) => setMinScore(parseFloat(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            >
              <option value={50}>50+ High Compliance Gap</option>
              <option value={30}>30+ Missing Photo Evidence</option>
              <option value={10}>10+ Baseline Checks</option>
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Compliance Work Queue */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-emerald-600" /> Compliance Priority Queue ({total.toLocaleString()} Cases)
          </h3>
          <span className="text-xs font-mono font-bold text-slate-500">Ordered by Compliance Risk Score</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium">Loading Compliance Queue...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium">No compliance gap cases found matching applied criteria.</div>
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
                      Location & Category <ArrowUpDown className={`w-3 h-3 ${sortField === 'State' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('has_evidence_image')}>
                    <span className="flex items-center justify-center gap-1">
                      Site Photo Status <ArrowUpDown className={`w-3 h-3 ${sortField === 'has_evidence_image' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('compliance_risk_score')}>
                    <span className="flex items-center justify-center gap-1">
                      Compliance Risk <ArrowUpDown className={`w-3 h-3 ${sortField === 'compliance_risk_score' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('compliance_explanation')}>
                    <span className="flex items-center gap-1">
                      Triggered Rule / Explanation <ArrowUpDown className={`w-3 h-3 ${sortField === 'compliance_explanation' ? 'text-indigo-600 opacity-100' : 'opacity-50'}`} />
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
                      <div className="text-[11px] text-slate-500">{r.work_category}</div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {r.has_evidence_image ? (
                        <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1">
                          <Image className="w-3.5 h-3.5 text-emerald-600" /> Photo Uploaded
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold inline-flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Missing Photo
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                      {r.compliance_risk_score.toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium max-w-xs truncate" title={r.compliance_explanation || r.description}>
                      {r.compliance_explanation || r.description}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {onSelectWork && (
                        <button
                          onClick={() => onSelectWork(r.work_id)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5" /> Inspect
                        </button>
                      )}
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
