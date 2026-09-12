import React, { useEffect, useMemo, useState } from 'react';
import { fetchComplianceRules, fetchComplianceSummary, fetchConstituencyCompliance, fetchFilters, fetchRiskQueue } from '../services/api';
import { ComplianceFinding, ConstituencyComplianceRecord, FilterOptions, WorkRecord } from '../types';
import { AlertCircle, ArrowUpDown, CheckSquare, Eye, FileText, Filter, Image as ImageIcon, MapPin, RotateCcw, ShieldCheck } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';
import { formatCoordinate, getGeotagEvidence } from '../lib/geotagEvidence';

interface ComplianceMonitorPageProps {
  onSelectWork?: (workId: string) => void;
  onOpenEvidence?: (workId: string, imageName?: string) => void;
}

const statusLabel = (value?: string) => (value || '').replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (letter: string) => letter.toUpperCase());
const formatAmount = (value?: number) => value == null ? 'Not available' : '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const formatPct = (value?: number) => value == null ? '—' : Number(value).toFixed(2) + '%';

const primaryFinding = (record: WorkRecord): ComplianceFinding | undefined => {
  const nested = (record.compliance_findings || record.compliance_rule_results || [])
    .find((finding) => finding.status === 'FAIL' || finding.status === 'NEEDS_REVIEW');
  if (nested) return nested;
  if (!record.compliance_primary_rule_id) return undefined;
  let details: Record<string, unknown> = {};
  try {
    details = record.compliance_primary_details_json ? JSON.parse(record.compliance_primary_details_json) : {};
  } catch {
    details = {};
  }
  return {
    rule_id: record.compliance_primary_rule_id,
    rule_name: record.compliance_primary_rule_id,
    status: record.compliance_primary_status || 'NEEDS_REVIEW',
    guideline_basis: record.compliance_primary_guideline_basis,
    what_happened: record.compliance_primary_what_happened || record.compliance_what_happened,
    why_it_matters: record.compliance_primary_why_it_matters,
    supporting_details: record.compliance_primary_supporting_details || record.compliance_supporting_details,
    details,
  };
};

const FindingDetails: React.FC<{ finding?: ComplianceFinding }> = ({ finding }) => {
  if (!finding) return <span className="text-slate-500">No work-level guideline concern identified from the available record.</span>;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] font-bold text-indigo-700">View details</summary>
      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-[11px]">
        <div><b>Why it matters:</b> {finding.why_it_matters || 'Review the record against the cited guideline provision.'}</div>
        {finding.supporting_details && <div><b>Supporting details:</b> {finding.supporting_details}</div>}
        <div><b>Guideline basis:</b> {finding.guideline_basis || finding.guideline_section || 'MPLADS Guidelines'}</div>
        {finding.threshold && <div><b>Requirement:</b> {finding.threshold}</div>}
        {finding.evidence_quality && <div><b>Evidence status:</b> {statusLabel(finding.evidence_quality)}</div>}
        {finding.details && Object.entries(finding.details).map(([key, value]) => (
          <div key={key}><b>{statusLabel(key)}:</b> {typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'Not available')}</div>
        ))}
      </div>
    </details>
  );
};

export const ComplianceMonitorPage: React.FC<ComplianceMonitorPageProps> = ({ onSelectWork, onOpenEvidence }) => {
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [constituencyRecords, setConstituencyRecords] = useState<ConstituencyComplianceRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<any>({});
  const [rules, setRules] = useState<any>({ work_level_rules: [], constituency_level_rules: [] });
  const [loading, setLoading] = useState(true);
  const [selectedState, setSelectedState] = usePersistentState('mplads.compliance-monitor.state', '');
  const [selectedCategory, setSelectedCategory] = usePersistentState('mplads.compliance-monitor.category', '');
  const [minScore, setMinScore] = usePersistentState('mplads.compliance-monitor.min-score', 20);
  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [sortField, setSortField] = useState('compliance_risk_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [gapFilter, setGapFilter] = useState<'all' | 'fraud' | 'stub' | 'missing_both'>('all');

  useEffect(() => {
    Promise.all([fetchFilters(), fetchComplianceSummary(), fetchComplianceRules()])
      .then(([filters, summaryResponse, ruleResponse]) => {
        setFilterOpts(filters);
        setSummary(summaryResponse);
        setRules(ruleResponse);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchRiskQueue({
        state: selectedState || undefined,
        category: selectedCategory || undefined,
        min_compliance_risk: minScore,
        sort_by: 'compliance_risk_score',
        page: 1,
        limit: 50,
      }),
      fetchConstituencyCompliance({ state: selectedState || undefined, page: 1, limit: 12 }),
    ])
      .then(([queue, aggregate]) => {
        setRecords(queue.records || []);
        setTotal(queue.total || 0);
        setConstituencyRecords(aggregate.records || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedState, selectedCategory, minScore]);

  const sortedRecords = useMemo(() => [...records].sort((left, right) => {
    const a = left[sortField as keyof WorkRecord] as any;
    const b = right[sortField as keyof WorkRecord] as any;
    if (typeof a === 'string' || typeof b === 'string') {
      return sortOrder === 'asc' ? String(a || '').localeCompare(String(b || '')) : String(b || '').localeCompare(String(a || ''));
    }
    return sortOrder === 'asc' ? Number(a || 0) - Number(b || 0) : Number(b || 0) - Number(a || 0);
  }), [records, sortField, sortOrder]);

  const filteredRecords = useMemo(() => {
    return sortedRecords.filter((record) => {
      const evidence = getGeotagEvidence(record.work_id);
      if (gapFilter === 'fraud') {
        return Boolean(
          evidence?.fraudCollision?.isSuspectedFraud ||
          record.compliance_findings?.some((f) => f.rule_id === 'C_FRAUD_DUPLICATE_EVIDENCE') ||
          record.compliance_primary_rule_id === 'C_FRAUD_DUPLICATE_EVIDENCE'
        );
      }
      if (gapFilter === 'stub') {
        return Boolean(
          evidence?.isStubDossier ||
          record.compliance_findings?.some((f) => f.rule_id === 'C_EVIDENCE_STUB_DOSSIER') ||
          record.compliance_primary_rule_id === 'C_EVIDENCE_STUB_DOSSIER'
        );
      }
      if (gapFilter === 'missing_both') {
        return Boolean(
          (!evidence?.hasPhotoEvidence && !evidence?.hasBillProof) ||
          record.compliance_findings?.some((f) => f.rule_id === 'C_EVIDENCE_NO_BILLS_TABLES' || f.rule_id === 'C_EVIDENCE_PHOTO_GAP') ||
          record.compliance_primary_rule_id === 'C_EVIDENCE_NO_BILLS_TABLES'
        );
      }
      return true;
    });
  }, [sortedRecords, gapFilter]);

  const handleSort = (field: string) => {
    if (sortField === field) setSortOrder((value) => value === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const clearFilters = () => {
    setSelectedState('');
    setSelectedCategory('');
    setMinScore(20);
    setGapFilter('all');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <CheckSquare className="w-6 h-6 text-slate-900" /> Compliance Risk Analyzer
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Work-level findings are ordered separately from constituency allocation observations and traced to the MPLADS guideline source.
        </p>
      </div>

      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-xs text-indigo-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-0.5 text-indigo-700" />
          <div>
            <b>Guideline basis:</b> {rules.source || 'mplads_2023_guidelines_including_changes.pdf'}
            <p className="mt-1">SC/ST percentages and other allocation caps are shown below at constituency scope. They never create an individual-work violation.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        {[
          ['Work review order', Number(summary.work_level_risk || 0).toLocaleString(), 'Individual works requiring review', 'text-indigo-700'],
          ['Critical', Number(summary.critical || 0).toLocaleString(), 'Highest-priority work findings', 'text-rose-700'],
          ['High', Number(summary.high || 0).toLocaleString(), 'High-priority work findings', 'text-amber-700'],
          ['Constituency observations', Number(summary.constituency_observations || 0).toLocaleString(), 'Aggregate records kept separate', 'text-emerald-700'],
        ].map(([label, value, note, color]) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">{label}</span>
            <div className={'text-2xl font-black font-mono tracking-tight ' + color}>{value}</div>
            <p className="text-xs text-slate-500 font-medium">{note}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><Filter className="w-4 h-4" /> Filter work-level review order</div>
          {(selectedState || selectedCategory || minScore !== 20 || gapFilter !== 'all') && (
            <button onClick={clearFilters} className="text-xs text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Clear filters</button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <label className="text-[10px] uppercase font-bold text-slate-500">State / UT
            <select value={selectedState} onChange={(event) => setSelectedState(event.target.value)} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800">
              <option value="">All States / UTs</option>
              {filterOpts?.states.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase font-bold text-slate-500">Work category
            <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800">
              <option value="">All categories</option>
              {filterOpts?.categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="text-[10px] uppercase font-bold text-slate-500">Minimum review score
            <select value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800">
              <option value={20}>All review findings</option>
              <option value={35}>Medium and above</option>
              <option value={65}>High and above</option>
              <option value={85}>Critical</option>
            </select>
          </label>
        </div>

        {/* Evidence Gaps Quick-Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
          <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Evidence Gaps:</span>
          <button
            onClick={() => setGapFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              gapFilter === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Gaps
          </button>
          <button
            onClick={() => setGapFilter('fraud')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              gapFilter === 'fraud'
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-200'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
          >
            <span>🚨 Fraud / Reused Files</span>
          </button>
          <button
            onClick={() => setGapFilter('stub')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              gapFilter === 'stub'
                ? 'bg-red-600 text-white shadow-sm shadow-red-200'
                : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
            }`}
          >
            <span>🔴 Empty Stub Dossiers (≤ 2 pages)</span>
          </button>
          <button
            onClick={() => setGapFilter('missing_both')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              gapFilter === 'missing_both'
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-200'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span>🟠 Missing Photos & Bills</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /> Work Compliance Risk Order ({filteredRecords.length.toLocaleString()} works)</h3>
          <span className="text-xs font-mono font-bold text-slate-500">Guideline findings only</span>
        </div>
        {loading ? <div className="p-8 text-center text-xs text-slate-500">Loading work-level findings...</div> : filteredRecords.length === 0 ? <div className="p-8 text-center text-xs text-slate-500">No work-level findings match the selected filters.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort('work_id')}>Work ID <ArrowUpDown className="inline w-3 h-3" /></th>
                <th className="py-3 px-4">Work / location</th>
                <th className="py-3 px-4 text-center cursor-pointer" onClick={() => handleSort('compliance_risk_score')}>Review priority <ArrowUpDown className="inline w-3 h-3" /></th>
                <th className="py-3 px-4">What happened?</th>
                <th className="py-3 px-4">Site photo / geotag evidence</th>
                <th className="py-3 px-4">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredRecords.map((record) => {
                  const finding = primaryFinding(record);
                  const evidence = getGeotagEvidence(record.work_id);
                  const previewImage = evidence?.gpsImages[0] || evidence?.images[0];
                  return <tr key={record.work_id} className="align-top hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{record.work_id}</td>
                    <td className="py-3 px-4"><div className="font-bold text-slate-900">{record.state || record.State} · {record.constituency || record.Constituency}</div><div className="text-[11px] text-slate-500">{record.work_category}</div></td>
                    <td className="py-3 px-4 text-center"><span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-1 font-bold">{record.compliance_risk_level} · {record.compliance_risk_score.toFixed(0)}</span><div className="text-[10px] text-slate-500 mt-1">{finding ? statusLabel(finding.status) : 'Review'}</div></td>
                    <td className="py-3 px-4 max-w-md">
                      {evidence?.fraudCollision?.isSuspectedFraud ? (
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-1 rounded-md bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-black text-rose-900">
                            🚨 SUSPECTED FRAUD: RECYCLED EVIDENCE (SCORE 100)
                          </div>
                          <div className="text-xs font-semibold text-rose-950">
                            {evidence.fraudCollision.fraudReason || `Exact duplicate evidence matching Work ${evidence.fraudCollision.matchedWorkId}`}
                          </div>
                        </div>
                      ) : evidence?.isStubDossier ? (
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-1 rounded-md bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] font-black text-red-900">
                            🔴 CRITICAL: EMPTY STUB DOSSIER
                          </div>
                          <div className="text-xs font-semibold text-red-950">
                            Uploaded dossier is only {evidence.pageCount} page(s) lacking physical progress, site photos, or itemized bills.
                          </div>
                        </div>
                      ) : (
                        <div className="font-semibold text-slate-900">{finding?.what_happened || record.compliance_explanation}</div>
                      )}
                      <FindingDetails finding={finding} />
                    </td>
                    <td className="py-3 px-4 min-w-[190px]">
                      {evidence?.gps ? <button onClick={() => onOpenEvidence?.(record.work_id, evidence.gpsImages[0]?.name)} className="text-left group"><span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-800 group-hover:bg-emerald-100"><MapPin className="h-3 w-3" /> 🟢 Geotagged</span><span className="mt-1 block font-mono text-[10px] text-emerald-700">{formatCoordinate(evidence.gps.latitude)} · {formatCoordinate(evidence.gps.longitude)}</span></button>
                        : evidence?.hasPhotoEvidence ? <button onClick={() => onOpenEvidence?.(record.work_id, previewImage?.name)} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-bold text-sky-800 hover:bg-sky-100"><ImageIcon className="h-3 w-3" /> 🟢 Photo Attached (Untagged)</button>
                          : evidence?.hasBillProof ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-bold text-amber-800">📄 Text/Bill Only</span>
                            : <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-bold text-rose-800">🔴 Missing Evidence</span>}
                    </td>
                    <td className="py-3 px-4">{onSelectWork && <button onClick={() => onSelectWork(record.work_id)} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Inspect</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-amber-600" /> Constituency-level Compliance / Allocation Analysis</h3>
          <span className="text-xs text-slate-500">Not part of work risk ranking</span>
        </div>
        <p className="text-xs text-slate-600">These observations use available area labels and allocation references. They are review prompts, not violations assigned to individual roads, schools, or other works.</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {constituencyRecords.map((row) => (
            <div key={row.state + row.constituency + row.mp_name + row.financial_year} className="rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex justify-between gap-3"><div><div className="font-bold text-slate-900">{row.constituency}</div><div className="text-[11px] text-slate-500">{row.state} · {row.financial_year}</div></div><span className="text-[10px] font-bold text-slate-500">{row.allocation_basis}</span></div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 p-3"><b className="block text-slate-500">SC allocation</b><span className="font-bold text-slate-900">{formatPct(row.sc_observed_pct_of_allocation_basis)} / {formatPct(row.sc_target_pct)}</span><div className="text-[10px] text-amber-700 mt-1">{statusLabel(row.sc_status)}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><b className="block text-slate-500">ST allocation</b><span className="font-bold text-slate-900">{formatPct(row.st_observed_pct_of_allocation_basis)} / {formatPct(row.st_target_pct)}</span><div className="text-[10px] text-amber-700 mt-1">{statusLabel(row.st_status)}</div></div>
              </div>
              <div className="text-[11px] text-slate-600">Observed sanctioned amount: <b>{formatAmount(row.total_observed_sanctioned_amount)}</b>. Repair/renovation: <b>{formatPct(row.repair_renovation_pct_of_allocation_basis)}</b> of analysis basis.</div>
              <div className="text-[11px] text-slate-500">Guideline basis: {row.source_sections || 'MPLADS Guidelines'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
