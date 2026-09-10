import React, { useState, useEffect } from 'react';
import { fetchRiskQueue, fetchFilters } from '../services/api';
import { WorkRecord, FilterOptions } from '../types';
import { PieChart, DollarSign, Eye, Filter, RotateCcw, MapPin, ArrowUpDown } from 'lucide-react';

interface FinancialAnalyticsPageProps {
  onSelectWork?: (workId: string) => void;
}

export const FinancialAnalyticsPage: React.FC<FinancialAnalyticsPageProps> = ({ onSelectWork }) => {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [minScore, setMinScore] = useState<number>(50);
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [sortField, setSortField] = useState<string>('financial_risk_score');
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

  const loadFinancialQueue = () => {
    setLoading(true);
    fetchRiskQueue({
      state: selectedState || undefined,
      category: selectedCategory || undefined,
      min_financial_risk: minScore,
      sort_by: 'financial_risk_score',
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
    loadFinancialQueue();
  }, [selectedState, selectedCategory, minScore]);

  const handleReset = () => {
    setSelectedState('');
    setSelectedCategory('');
    setMinScore(50);
  };

  const formatAmount = (amt: number) => {
    if (!amt) return '₹0.00 Lakh';
    const inLakhs = amt / 100000;
    if (inLakhs >= 100) {
      return `₹${(inLakhs / 100).toFixed(2)} Cr`;
    }
    return `₹${inLakhs.toFixed(2)} L`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <PieChart className="w-6 h-6 text-slate-900" /> Financial & Cost Anomaly Analytics
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Deep-dive analysis into statistical cost outliers, peer-group median ratios, and multi-variate Isolation Forest anomaly scores.
        </p>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Flagged Financial Outliers</span>
          <div className="text-2xl font-black text-amber-600 font-mono tracking-tight">2,982 Works</div>
          <p className="text-xs text-slate-500 font-medium">Financial Risk Score &ge; 50 / 100</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">High Peer Ratio Works (&gt;3.0x)</span>
          <div className="text-2xl font-black text-orange-600 font-mono tracking-tight">1,124 Works</div>
          <p className="text-xs text-slate-500 font-medium">Exceed 3.0x Category Peer Median</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
          <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Isolation Forest Model</span>
          <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">5.0% Baseline</div>
          <p className="text-xs text-slate-500 font-medium">Trained on 79,068 Historical Works</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <Filter className="w-4 h-4 text-slate-700" /> Filter Financial Anomaly Cases
          </div>
          {(selectedState || selectedCategory || minScore !== 50) && (
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
            <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Min Financial Risk Score</label>
            <select
              value={minScore}
              onChange={(e) => setMinScore(parseFloat(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 font-medium"
            >
              <option value={70}>70+ Critical Financial Risks</option>
              <option value={50}>50+ Moderate Outliers</option>
              <option value={30}>30+ Baseline Outliers</option>
            </select>
          </div>
        </div>
      </div>

      {/* Interactive Financial Anomaly Work Queue Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" /> Flagged Financial Anomaly Queue ({total.toLocaleString()} Cases)
          </h3>
          <span className="text-xs font-mono font-bold text-slate-500">Ordered by {sortField}</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium">Loading Financial Risk Queue...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 font-medium">No financial anomaly cases found matching applied criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs select-none">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('work_id')}>
                    <span className="flex items-center gap-1">
                      Work ID <ArrowUpDown className={`w-3 h-3 ${sortField === 'work_id' ? 'text-amber-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('State')}>
                    <span className="flex items-center gap-1">
                      Location & Category <ArrowUpDown className={`w-3 h-3 ${sortField === 'State' ? 'text-amber-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 font-mono text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('sanction_amount')}>
                    <span className="flex items-center justify-end gap-1">
                      Sanction Budget <ArrowUpDown className={`w-3 h-3 ${sortField === 'sanction_amount' ? 'text-amber-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('amount_to_peer_ratio')}>
                    <span className="flex items-center justify-center gap-1">
                      Peer Ratio <ArrowUpDown className={`w-3 h-3 ${sortField === 'amount_to_peer_ratio' ? 'text-amber-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('financial_risk_score')}>
                    <span className="flex items-center justify-center gap-1">
                      Financial Risk <ArrowUpDown className={`w-3 h-3 ${sortField === 'financial_risk_score' ? 'text-amber-600 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('financial_explanation')}>
                    <span className="flex items-center gap-1">
                      Audit Explanation <ArrowUpDown className={`w-3 h-3 ${sortField === 'financial_explanation' ? 'text-amber-600 opacity-100' : 'opacity-50'}`} />
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
                    <td className="py-3 px-4 font-mono text-right font-bold text-emerald-700">
                      {formatAmount(r.sanction_amount)}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-orange-600">
                      {(r.amount_to_peer_ratio || 1.0).toFixed(2)}x
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-amber-600">
                      {r.financial_risk_score.toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium max-w-xs truncate" title={r.financial_explanation || r.description}>
                      {r.financial_explanation || r.description}
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
