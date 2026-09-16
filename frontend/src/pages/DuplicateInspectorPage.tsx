import React, { useEffect, useState } from 'react';
import { fetchDuplicateClusters, fetchDuplicateCandidates, fetchFilters } from '../services/api';
import { DuplicateCluster, DuplicateClusterRecord, CandidateDuplicatePair, FilterOptions } from '../types';
import { AlertTriangle, ArrowLeft, ArrowRight, Calendar, Copy, DollarSign, Eye, MapPin, RotateCcw, SlidersHorizontal, ArrowLeftRight } from 'lucide-react';
import { usePersistentState } from '../hooks/usePersistentState';

interface DuplicateInspectorPageProps {
  onSelectWork: (workId: string) => void;
}

const amount = (value?: number) => value === undefined || value === null ? 'Not available' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const DuplicateInspectorPage: React.FC<DuplicateInspectorPageProps> = ({ onSelectWork }) => {
  const [activeTab, setActiveTab] = usePersistentState<'clusters' | 'candidates'>('mplads.duplicate-inspector.tab', 'clusters');
  
  // Clusters state
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [totalClusters, setTotalClusters] = useState(0);
  const [clusterPage, setClusterPage] = usePersistentState('mplads.duplicate-inspector.page', 1);
  const [totalClusterPages, setTotalClusterPages] = useState(1);
  const [clusterState, setClusterState] = usePersistentState('mplads.duplicate-inspector.state', '');
  const [riskLevel, setRiskLevel] = usePersistentState('mplads.duplicate-inspector.risk-level', '');
  
  // Candidates state
  const [candidates, setCandidates] = useState<CandidateDuplicatePair[]>([]);
  const [totalCandidates, setTotalCandidates] = useState(0);
  const [candidatePage, setCandidatePage] = useState(1);
  const [totalCandidatePages, setTotalCandidatePages] = useState(1);
  const [candidateState, setCandidateState] = useState('');
  const [minSimilarity, setMinSimilarity] = useState(70);

  const [filterOpts, setFilterOpts] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFilters().then(setFilterOpts).catch(console.error);
  }, []);

  // Fetch Clusters
  useEffect(() => {
    if (activeTab !== 'clusters') return;
    setLoading(true);
    fetchDuplicateClusters({ state: clusterState || undefined, risk_level: riskLevel || undefined, page: clusterPage, limit: 12 })
      .then((result) => {
        setClusters(result.records || []);
        setTotalClusters(result.total || 0);
        setTotalClusterPages(result.total_pages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeTab, clusterState, riskLevel, clusterPage]);

  // Fetch Candidate Pairs
  useEffect(() => {
    if (activeTab !== 'candidates') return;
    setLoading(true);
    fetchDuplicateCandidates({ state: candidateState || undefined, min_similarity: minSimilarity, page: candidatePage, limit: 12 })
      .then((result) => {
        setCandidates(result.records || []);
        setTotalCandidates(result.total || 0);
        setTotalCandidatePages(Math.ceil(result.total / 12) || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeTab, candidateState, minSimilarity, candidatePage]);

  const resetFilters = () => {
    if (activeTab === 'clusters') {
      setClusterState('');
      setRiskLevel('');
      setClusterPage(1);
    } else {
      setCandidateState('');
      setMinSimilarity(70);
      setCandidatePage(1);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header & Mode Tabs */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Copy className="w-6 h-6 text-violet-600" /> Duplicate & Split-Work Review
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Detect overlapping physical scopes, semantic title similarity, and potential work fragmentation across all sanctioned records.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('clusters')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'clusters' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Duplicate Clusters ({totalClusters || '...'})
          </button>
          <button
            onClick={() => setActiveTab('candidates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'candidates' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Candidate Pairs (5,000 Pairs)
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center gap-3 shadow-sm">
        {activeTab === 'clusters' ? (
          <>
            <select
              value={clusterState}
              onChange={(e) => { setClusterState(e.target.value); setClusterPage(1); }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold"
            >
              <option value="">All States / UTs</option>
              {filterOpts?.states.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select
              value={riskLevel}
              onChange={(e) => { setRiskLevel(e.target.value); setClusterPage(1); }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold"
            >
              <option value="">All Audit Priorities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </>
        ) : (
          <>
            <select
              value={candidateState}
              onChange={(e) => { setCandidateState(e.target.value); setCandidatePage(1); }}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold"
            >
              <option value="">All States / UTs</option>
              {filterOpts?.states.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <span className="text-[11px] font-bold text-slate-600">Min Similarity:</span>
              <input
                type="range"
                min="50"
                max="95"
                step="5"
                value={minSimilarity}
                onChange={(e) => { setMinSimilarity(Number(e.target.value)); setCandidatePage(1); }}
                className="w-24 accent-violet-600"
              />
              <span className="text-xs font-mono font-black text-violet-700">{minSimilarity}%</span>
            </div>
          </>
        )}
        <button
          onClick={resetFilters}
          className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 ml-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Clear filters
        </button>
      </div>

      {/* CLUSTERS VIEW */}
      {activeTab === 'clusters' && (
        loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">Loading duplicate-work clusters...</div>
        ) : clusters.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">No suspicious clusters found for the selected filters.</div>
        ) : (
          <div className="space-y-5">
            {clusters.map((cluster) => {
              const high = cluster.duplicate_risk_level === 'HIGH';
              const split = cluster.possible_split_work;
              const recordSummaries: DuplicateClusterRecord[] = Array.isArray(cluster.record_summaries)
                ? cluster.record_summaries
                : typeof cluster.record_summaries === 'string'
                ? (() => {
                    try {
                      const parsed = JSON.parse(cluster.record_summaries);
                      return Array.isArray(parsed) ? parsed : [];
                    } catch {
                      return [];
                    }
                  })()
                : [];
              const keyIndicators: string[] = Array.isArray(cluster.key_indicators)
                ? cluster.key_indicators
                : typeof cluster.key_indicators === 'string'
                ? (() => {
                    try {
                      const parsed = JSON.parse(cluster.key_indicators);
                      return Array.isArray(parsed) ? parsed : [cluster.key_indicators];
                    } catch {
                      return [cluster.key_indicators];
                    }
                  })()
                : [];

              return (
                <article key={cluster.cluster_id} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-xl p-2.5 ${high ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-mono text-slate-500">{cluster.cluster_id}</div>
                        <h3 className="text-lg font-black text-slate-900">{split ? 'Possible Split Work' : 'Possible Duplicate Work'}</h3>
                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-2">
                          <MapPin className="w-3.5 h-3.5" /> {cluster.state} · {cluster.constituency} · {cluster.sector || 'Sector unavailable'}
                        </div>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${high ? 'bg-rose-100 text-rose-800' : cluster.duplicate_risk_level === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {cluster.duplicate_risk_level} AUDIT PRIORITY
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <div className="text-[10px] uppercase tracking-wider font-black text-slate-500">Common project / asset</div>
                      <div className="mt-1 text-base font-bold text-slate-900">{cluster.common_asset}</div>
                      <p className="mt-3 text-sm text-slate-700 leading-relaxed">{cluster.risk_reason}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
                      <div className="font-bold text-slate-900">Cluster evidence</div>
                      <div>{cluster.related_record_count} related records</div>
                      <div>{cluster.id_range !== undefined && cluster.id_range !== null ? `Work-ID range: ${cluster.id_range}` : 'Work-ID range unavailable'}</div>
                      <div className="font-mono font-bold text-emerald-700">Combined cost: {amount(cluster.total_sanctioned_amount)}</div>
                      {cluster.total_recommended_amount && <div className="font-mono text-slate-600">Recommended total: {amount(cluster.total_recommended_amount)}</div>}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {keyIndicators.map((indicator, idx) => (
                      <span key={`${indicator}_${idx}`} className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-[10px] font-bold text-indigo-800">
                        {indicator}
                      </span>
                    ))}
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2.5 text-[10px] uppercase tracking-wider font-black text-slate-500">Supporting records — concise view</div>
                    <div className="divide-y divide-slate-100">
                      {recordSummaries.map((record, rIdx) => (
                        <div key={record.work_id || rIdx} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="font-bold text-slate-900">{record.work_name || 'Project Work'}</div>
                            <div className="font-mono text-[10px] text-slate-500 mt-1">{record.work_id}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-slate-600">
                            <span className="font-mono font-bold text-emerald-700"><DollarSign className="inline w-3.5 h-3.5" /> {amount(record.sanction_amount)}</span>
                            <span><Calendar className="inline w-3.5 h-3.5" /> {record.recommended_date || record.sanction_date || 'Date unavailable'}</span>
                            {record.quantity && <span>Qty: {record.quantity}</span>}
                            {record.work_id && (
                              <button onClick={() => onSelectWork(record.work_id)} className="px-2.5 py-1.5 bg-slate-900 text-white rounded-lg font-bold inline-flex items-center gap-1">
                                <Eye className="w-3.5 h-3.5" /> View details
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {recordSummaries.length === 0 && (
                        <div className="px-4 py-3 text-xs text-slate-400 italic">No record summaries available</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 text-xs text-violet-950">
                    <span className="font-black">Audit observation: </span>{cluster.audit_observation}
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {/* CANDIDATE DUPLICATE PAIRS VIEW */}
      {activeTab === 'candidates' && (
        loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">Loading candidate duplicate pairs...</div>
        ) : candidates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">No candidate duplicate pairs found matching the criteria.</div>
        ) : (
          <div className="space-y-4">
            {candidates.map((pair, idx) => {
              const score = Math.round(pair.similarity_score || 0);
              const isHigh = score >= 85;
              return (
                <div key={`${pair.work_id_1}_${pair.work_id_2}_${idx}`} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black ${isHigh ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                        {score}% Similarity
                      </span>
                      <span className="text-xs font-bold text-slate-600">
                        {pair.state} · {pair.constituency}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                      {pair.review_classification || 'DUPLICATE_OVERLAP_REVIEW'}
                    </span>
                  </div>

                  {/* Side-by-side comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Work 1 */}
                    <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-black text-slate-900">{pair.work_id_1}</span>
                        <button
                          onClick={() => onSelectWork(pair.work_id_1)}
                          className="px-2 py-1 text-[10px] font-bold bg-slate-900 text-white rounded-md hover:bg-slate-800 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Inspect Work
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {pair.description_1 || pair.recommended_description_1 || 'Description unavailable'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 pt-1">
                        <span>Cost: <strong className="text-emerald-700">{amount(pair.sanction_amount_1)}</strong></span>
                        {pair.sanction_date_1 && <span>Sanction: {pair.sanction_date_1}</span>}
                      </div>
                    </div>

                    {/* Work 2 */}
                    <div className="p-3.5 bg-violet-50/50 rounded-xl border border-violet-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-black text-violet-950">{pair.work_id_2}</span>
                        <button
                          onClick={() => onSelectWork(pair.work_id_2)}
                          className="px-2 py-1 text-[10px] font-bold bg-violet-900 text-white rounded-md hover:bg-violet-800 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Inspect Work
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed font-medium">
                        {pair.description_2 || pair.recommended_description_2 || 'Description unavailable'}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 pt-1">
                        <span>Cost: <strong className="text-emerald-700">{amount(pair.sanction_amount_2)}</strong></span>
                        {pair.sanction_date_2 && <span>Sanction: {pair.sanction_date_2}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Explanation */}
                  {pair.nlp_explanation && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
                      <strong className="text-slate-800">Duplicate Investigation Reason: </strong>
                      {pair.nlp_explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Pagination */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          Page {activeTab === 'clusters' ? clusterPage : candidatePage} of {activeTab === 'clusters' ? totalClusterPages : totalCandidatePages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={activeTab === 'clusters' ? clusterPage <= 1 : candidatePage <= 1}
            onClick={() => {
              if (activeTab === 'clusters') setClusterPage((v) => v - 1);
              else setCandidatePage((v) => v - 1);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <button
            disabled={activeTab === 'clusters' ? clusterPage >= totalClusterPages : candidatePage >= totalCandidatePages}
            onClick={() => {
              if (activeTab === 'clusters') setClusterPage((v) => v + 1);
              else setCandidatePage((v) => v + 1);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold inline-flex items-center gap-1"
          >
            Next <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
