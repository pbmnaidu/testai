import React, { useState, useEffect } from 'react';
import { fetchAllRecords, fetchRiskQueue, fetchFilters } from '../services/api';
import { WorkRecord, FilterOptions } from '../types';
import { RiskBadge } from '../components/cards/RiskBadge';
import { Search, ChevronLeft, ChevronRight, Eye, ShieldAlert, PieChart, Copy, CheckSquare, Clock, ArrowUpDown, Sparkles } from 'lucide-react';

interface RiskMonitorPageProps {
  initialSeverity?: string;
  initialDimension?: string;
  totalWorks?: number;
  onSelectWork: (workId: string) => void;
}

const RISK_FILTER_STORAGE_KEY = 'mplads-risk-monitor-filters-v1';

interface PersistedRiskFilters {
  recordView?: 'risk' | 'all';
  dimension?: string;
  state?: string;
  constituency?: string;
  workStatus?: string;
  category?: string;
  severity?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  expenditureFilter?: string;
}

const NOT_COMPLETED_STATUS = 'NOT_COMPLETED';

const normalizeWorkStatus = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/_/g, ' ')
  .replace(/\s+/g, ' ');

const workStatusFilterKey = (value: string) => {
  const normalized = normalizeWorkStatus(value);
  if (normalized === 'sanctioned') return 'sanction';
  if (normalized === 'completed' || normalized === 'work completed') return 'completed';
  if (normalized === 'partially completed' || normalized === 'work partially completed') return 'partially completed';
  return normalized;
};

const formatWorkStatus = (value: string) => {
  const labels: Record<string, string> = {
    Sanction: 'Sanctioned',
    'Work Completed': 'Completed',
    'Work partially Completed': 'Partially Completed',
  };
  return labels[value] || value;
};

function readPersistedRiskFilters(): PersistedRiskFilters {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(RISK_FILTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as PersistedRiskFilters : {};
  } catch {
    return {};
  }
}

export const RiskMonitorPage: React.FC<RiskMonitorPageProps> = ({
  initialSeverity,
  initialDimension = 'all',
  totalWorks = 0,
  onSelectWork,
}) => {
  const persisted = React.useMemo(readPersistedRiskFilters, []);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [topScores, setTopScores] = useState({ financial: 0, duplicate: 0, compliance: 0, schedule: 0, composite: 0 });
  const [page, setPage] = useState<number>(persisted.page && persisted.page > 0 ? persisted.page : 1);
  const [loading, setLoading] = useState<boolean>(true);

  const [dimension, setDimension] = useState<string>(initialDimension === 'all' ? (persisted.dimension || initialDimension) : initialDimension);
  const [state, setState] = useState<string>(persisted.state || '');
  const [constituency, setConstituency] = useState<string>(persisted.constituency || '');
  const [workStatus, setWorkStatus] = useState<string>(persisted.workStatus || '');
  const [category, setCategory] = useState<string>(persisted.category || '');
  const [severity, setSeverity] = useState<string>(initialSeverity || persisted.severity || '');
  const [search, setSearch] = useState<string>(persisted.search || '');
  const [sortBy, setSortBy] = useState<string>(persisted.sortBy || 'composite_risk_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(persisted.sortOrder || 'desc');
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [recordView, setRecordView] = useState<'risk' | 'all'>(persisted.recordView || 'risk');
  const [expenditureFilter, setExpenditureFilter] = useState<string>(persisted.expenditureFilter || '');

  const handleColumnSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setFilterOpts((current) => current ? { ...current, constituencies: [], statuses: [] } : current);
    fetchFilters({ state: state || undefined, scope: recordView })
      .then((options) => {
        if (cancelled) return;
        setFilterOpts(options);
        setConstituency((current) => (
          state && current && !(options.constituencies || []).some((item) => item.toLowerCase() === current.toLowerCase()) ? '' : current
        ));
        setWorkStatus((current) => {
          if (!current || current === NOT_COMPLETED_STATUS) return current;
          const matchingStatus = (options.statuses || []).find((item) => (
            workStatusFilterKey(item) === workStatusFilterKey(current)
          ));
          return matchingStatus || '';
        });
      })
      .catch((error) => {
        if (!cancelled) console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [state, recordView]);

  // Folder 2 keeps the queue state while moving between the risk list and a
  // work detail view. Persist the same preference locally so the existing
  // Vite SPA restores filters after the detail page unmounts/remounts.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(RISK_FILTER_STORAGE_KEY, JSON.stringify({
        recordView, dimension, state, constituency, workStatus, category, severity, search, sortBy, sortOrder, page, expenditureFilter,
      } satisfies PersistedRiskFilters));
    } catch {
      // Storage can be unavailable in private/browser-restricted contexts.
    }
  }, [recordView, dimension, state, constituency, workStatus, category, severity, search, sortBy, sortOrder, page, expenditureFilter]);

  const loadQueue = () => {
    setLoading(true);
    let minFin: number | undefined;
    let minComp: number | undefined;
    let effectiveSort = sortBy;

    if (dimension === 'financial') {
      // The backend's financial_only filter is authoritative; do not hide a
      // flagged work behind an internal score cutoff.
      minFin = 0;
      if (sortBy === 'composite_risk_score') effectiveSort = 'financial_risk_score';
    } else if (dimension === 'compliance') {
      minComp = 20;
      if (sortBy === 'composite_risk_score') effectiveSort = 'compliance_risk_score';
    } else if (dimension === 'schedule') {
      if (sortBy === 'composite_risk_score') effectiveSort = 'schedule_risk_score';
    } else if (dimension === 'duplicate') {
      if (sortBy === 'composite_risk_score') effectiveSort = 'duplicate_risk_score';
    }

    const request = recordView === 'all'
      ? fetchAllRecords({
        state,
        constituency,
        work_status: workStatus,
        category,
        risk_level: severity,
        expenditure: expenditureFilter,
        search,
        sort_by: sortBy,
        page,
        limit: 25,
      })
      : fetchRiskQueue({
        state,
        constituency,
        work_status: workStatus,
        category,
        severity,
        search,
        min_financial_risk: minFin,
        financial_only: dimension === 'financial',
        min_compliance_risk: minComp,
        sort_by: effectiveSort,
        page,
        limit: 25,
      });

    request
      .then((res) => {
        setRecords(res.records || []);
        setTotal(res.total || 0);
        setTotalPages(res.total_pages || 1);
        setTopScores(res.top_scores || { financial: 0, duplicate: 0, compliance: 0, schedule: 0, composite: 0 });
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadQueue();
  }, [recordView, state, constituency, workStatus, category, severity, expenditureFilter, search, page, dimension, sortBy]);

  const dimensionTabs = [
    { id: 'all', label: 'All Signals', icon: ShieldAlert },
    { id: 'financial', label: 'Financial Anomalies', icon: PieChart },
    { id: 'duplicate', label: 'Candidate Duplicates', icon: Copy },
    { id: 'compliance', label: 'Compliance Gaps', icon: CheckSquare },
    { id: 'schedule', label: 'Schedule Delays', icon: Clock },
  ];

  const topScoreCards = [
    { key: 'composite', label: 'Composite Risk', score: topScores.composite, tone: 'text-rose-300' },
    { key: 'financial', label: 'Financial', score: topScores.financial, tone: 'text-indigo-300' },
    { key: 'duplicate', label: 'Duplicate', score: topScores.duplicate, tone: 'text-amber-300' },
    { key: 'compliance', label: 'Compliance', score: topScores.compliance, tone: 'text-fuchsia-300' },
    { key: 'schedule', label: 'Schedule', score: topScores.schedule, tone: 'text-sky-300' },
  ];

  const sortedRecords = React.useMemo(() => {
    return [...records].sort((a, b) => {
      let aVal: any = a[sortBy as keyof typeof a];
      let bVal: any = b[sortBy as keyof typeof b];
      if (sortBy === 'state') { aVal = a.state || a.State; bVal = b.state || b.State; }
      if (aVal === undefined || aVal === null) aVal = 0;
      if (bVal === undefined || bVal === null) bVal = 0;
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal - bVal) : (bVal - aVal);
    });
  }, [records, sortBy, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Risk Dimension Selector Banner */}
      <div className="card-panel p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <span>Risk Intelligence Audit Queue</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Multi-dimensional risk classification across {totalWorks.toLocaleString()} works with ML score prioritization
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            Total Records: <strong className="text-slate-100 font-mono">{total.toLocaleString()}</strong>
          </span>
        </div>
      </div>

      {/* Queue scope tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
        {[
          ['risk', 'Risk Audit Queue'],
          ['all', 'All Work Records'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => { setRecordView(value as 'risk' | 'all'); setPage(1); }}
            className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all ${recordView === value ? 'bg-slate-100 text-slate-900 shadow-md' : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
        {recordView === 'all' && <span className="text-[11px] font-semibold text-slate-500">Includes recommended, sanctioned, and expenditure-linked work IDs.</span>}
      </div>

      {recordView === 'risk' && <>
        {/* Dimension Filter Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pb-1 border-b border-slate-800">
          {dimensionTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = dimension === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setDimension(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all min-w-0 ${
                  isActive
                    ? 'bg-slate-100 text-slate-900 shadow-md font-black'
                    : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Maximum score values for the current filtered queue. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {topScoreCards.map((card) => (
            <div key={card.key} className="card-panel px-3.5 py-3 border border-slate-800/80">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Top {card.label} Score</div>
              <div className={`mt-1 text-xl font-black font-mono ${card.tone}`}>{card.score.toFixed(1)}<span className="ml-1 text-xs text-slate-500">/100</span></div>
            </div>
          ))}
        </div>
      </>}

      {/* Filter Control Bar */}
      <div className="card-panel p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Work ID, Title, or Agency..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-100 font-medium placeholder-slate-500"
            />
          </div>
        </div>

        {/* State Filter */}
        <select
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setConstituency('');
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold max-w-[180px] focus:outline-none focus:ring-2 focus:ring-slate-100"
        >
          <option value="">All States / UTs</option>
          {filterOpts?.states.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>

        {/* Constituency Filter */}
        <select
          value={constituency}
          onChange={(e) => {
            setConstituency(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold max-w-[220px] focus:outline-none focus:ring-2 focus:ring-slate-100"
        >
          <option value="">All Constituencies</option>
          {filterOpts?.constituencies?.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        {/* Work Status Filter */}
        <select
          value={workStatus}
          onChange={(e) => {
            setWorkStatus(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold max-w-[220px] focus:outline-none focus:ring-2 focus:ring-slate-100"
        >
          <option value="">All Statuses</option>
          <option value={NOT_COMPLETED_STATUS}>Not Completed / In Progress</option>
          {filterOpts?.statuses?.map((item) => (
            <option key={item} value={item}>{formatWorkStatus(item)}</option>
          ))}
        </select>

        {/* Risk Level Filter */}
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold max-w-[180px] focus:outline-none focus:ring-2 focus:ring-slate-100"
        >
          <option value="">All Risk Levels</option>
          {[...new Set([...(filterOpts?.severities || []), ...(recordView === 'all' ? ['UNASSESSED'] : [])])].map((item) => (
            <option key={item} value={item}>{item === 'UNASSESSED' ? 'Not Assessed' : item}</option>
          ))}
        </select>

        {/* Category Filter */}
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold max-w-[160px] focus:outline-none focus:ring-2 focus:ring-slate-100"
        >
          <option value="">All Categories</option>
          {filterOpts?.categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Expenditure Filter */}
        <select
          value={expenditureFilter}
          onChange={(e) => {
            setExpenditureFilter(e.target.value);
            setPage(1);
          }}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-bold max-w-[180px] focus:outline-none focus:ring-2 focus:ring-slate-100"
        >
          <option value="">All Expenditure</option>
          <option value="with">With Expenditure</option>
          <option value="without">Without Expenditure</option>
        </select>

        <button
          onClick={() => {
            setState('');
            setConstituency('');
            setWorkStatus('');
            setCategory('');
            setSeverity('');
            setExpenditureFilter('');
            setSearch('');
            setDimension('all');
            setSortBy('composite_risk_score');
            setSortOrder('desc');
            setPage(1);
            try {
              window.sessionStorage.removeItem(RISK_FILTER_STORAGE_KEY);
            } catch {
              // Storage can be unavailable in private/browser-restricted contexts.
            }
          }}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-extrabold transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Audit Queue Table */}
      <div className="card-panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 font-semibold">Loading Risk Audit Queue...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 font-semibold">No works matching selected filters.</div>
        ) : (
          <>
          <div className="hidden xl:block overflow-x-auto">
            <table className="w-full text-left text-xs select-none">
              <thead>
                <tr className="bg-slate-800/60 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-extrabold tracking-wider">
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('work_id')}>
                    <span className="flex items-center gap-1">
                      Work ID <ArrowUpDown className={`w-3 h-3 ${sortBy === 'work_id' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('state')}>
                    <span className="flex items-center gap-1">
                      State & Constituency <ArrowUpDown className={`w-3 h-3 ${sortBy === 'state' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('work_category')}>
                    <span className="flex items-center gap-1">
                      Category <ArrowUpDown className={`w-3 h-3 ${sortBy === 'work_category' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4">Status</th>
                  {recordView === 'all' && <th className="py-3 px-4">Source</th>}
                  <th className="py-3 px-4 text-right cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('sanction_amount')}>
                    <span className="flex items-center justify-end gap-1">
                      Sanction Budget <ArrowUpDown className={`w-3 h-3 ${sortBy === 'sanction_amount' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  {recordView === 'all' && <th className="py-3 px-4 text-right">Expenditure</th>}
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('financial_risk_score')}>
                    <span className="flex items-center justify-center gap-1">
                      Financial <ArrowUpDown className={`w-3 h-3 ${sortBy === 'financial_risk_score' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('duplicate_risk_score')}>
                    <span className="flex items-center justify-center gap-1">
                      Duplicate <ArrowUpDown className={`w-3 h-3 ${sortBy === 'duplicate_risk_score' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('compliance_risk_score')}>
                    <span className="flex items-center justify-center gap-1">
                      Compliance <ArrowUpDown className={`w-3 h-3 ${sortBy === 'compliance_risk_score' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('schedule_risk_score')}>
                    <span className="flex items-center justify-center gap-1">
                      Schedule <ArrowUpDown className={`w-3 h-3 ${sortBy === 'schedule_risk_score' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleColumnSort('composite_risk_score')}>
                    <span className="flex items-center justify-center gap-1">
                      Composite Risk <ArrowUpDown className={`w-3 h-3 ${sortBy === 'composite_risk_score' ? 'text-amber-400 opacity-100' : 'opacity-50'}`} />
                    </span>
                  </th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-800 dark:text-slate-200 font-medium">
                {sortedRecords.map((r) => (
                  <tr key={r.work_id} onClick={() => onSelectWork(r.work_id)} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">{r.work_id}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{r.state || r.State}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{r.constituency || r.Constituency}</div>
                    </td>
                    <td className="py-3 px-4 truncate max-w-[140px] text-slate-600 dark:text-slate-400 font-medium">{r.work_category}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-semibold">{formatWorkStatus(r.work_status || 'Not available')}</td>
                    {recordView === 'all' && <td className="py-3 px-4"><span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[9px] font-bold text-indigo-800 dark:border-indigo-800/70 dark:bg-indigo-950/40 dark:text-indigo-200">{r.record_source || 'Record'}</span></td>}
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      ₹{(r.sanction_amount / 100000).toFixed(2)} L
                    </td>
                    {recordView === 'all' && <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">₹{((r.effective_expenditure || 0) / 100000).toFixed(2)} L</td>}
                    <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{r.financial_risk_score.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{r.duplicate_risk_score ? r.duplicate_risk_score.toFixed(1) : '0.0'}</td>
                    <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{r.compliance_risk_score.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{r.schedule_risk_score.toFixed(1)}</td>
                    <td className="py-3 px-4 text-center">
                      <RiskBadge level={r.overall_risk_level} score={r.composite_risk_score} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(event) => { event.stopPropagation(); onSelectWork(r.work_id); }}
                        className="px-3.5 py-1.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 mx-auto transition-all shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
            {sortedRecords.map((r) => (
              <button key={r.work_id} onClick={() => onSelectWork(r.work_id)} className="text-left rounded-2xl border border-slate-700 bg-slate-900/70 hover:bg-slate-800 p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-slate-100 break-all">{r.work_id}</div>
                    <div className="mt-1 text-xs font-bold text-slate-300">{r.state || r.State} · {r.constituency || r.Constituency}</div>
                    <div className="mt-1 text-[11px] font-semibold text-amber-300">{formatWorkStatus(r.work_status || 'Not available')}</div>
                    {recordView === 'all' && <div className="mt-1 text-[10px] font-semibold text-indigo-300">{r.record_source || 'Record'} · Expenditure ₹{((r.effective_expenditure || 0) / 100000).toFixed(2)} L</div>}
                  </div>
                  <RiskBadge level={r.overall_risk_level} score={r.composite_risk_score} />
                </div>
                <p className="mt-3 text-xs text-slate-400 line-clamp-2">{r.description || r.work_category}</p>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <span className="rounded-lg bg-slate-800 p-2"><b className="block text-slate-500">Sanction</b><strong className="text-slate-200">₹{((r.sanction_amount || 0) / 100000).toFixed(2)} L</strong></span>
                  <span className="rounded-lg bg-slate-800 p-2"><b className="block text-slate-500">Financial</b><strong className="text-slate-200">{Number(r.financial_risk_score || 0).toFixed(1)}</strong></span>
                  <span className="rounded-lg bg-slate-800 p-2"><b className="block text-slate-500">Compliance</b><strong className="text-slate-200">{Number(r.compliance_risk_score || 0).toFixed(1)}</strong></span>
                  <span className="rounded-lg bg-slate-800 p-2"><b className="block text-slate-500">Schedule</b><strong className="text-slate-200">{Number(r.schedule_risk_score || 0).toFixed(1)}</strong></span>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1 text-[11px] font-bold text-amber-300"><Eye className="w-3.5 h-3.5" /> Open complete work analysis</div>
              </button>
            ))}
          </div>
          </>
        )}

        {/* Pagination Bar */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-semibold">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 hover:bg-slate-200 rounded-xl font-bold flex items-center gap-1 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 hover:bg-slate-200 rounded-xl font-bold flex items-center gap-1 transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
