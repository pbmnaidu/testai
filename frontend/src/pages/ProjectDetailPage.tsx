import React, { useState, useEffect } from 'react';
import { fetchWorkDetail } from '../services/api';
import { WorkRecord, CandidateDuplicatePair } from '../types';
import { RiskBadge } from '../components/cards/RiskBadge';
import { RiskEvidencePanel } from '../components/risk/RiskEvidencePanel';
import { WorkInfoCards } from '../components/risk/WorkInfoCards';
import { GeotagEvidenceCard } from '../components/GeotagEvidenceCard';
import { 
  ArrowLeft, 
  DollarSign, 
  Copy, 
  CheckSquare, 
  Clock, 
  LayoutGrid, 
  FileCheck, 
  MapPin, 
  UserCheck, 
  Cpu, 
  Calendar,
  AlertTriangle,
  Eye,
  ArrowRight
} from 'lucide-react';

interface ProjectDetailPageProps {
  workId: string;
  onBack: () => void;
  onSelectWork?: (workId: string) => void;
  onOpenEvidence?: (workId: string, imageName?: string) => void;
}

export const ProjectDetailPage: React.FC<ProjectDetailPageProps> = ({ workId, onBack, onSelectWork, onOpenEvidence }) => {
  const [data, setData] = useState<{ work: WorkRecord; candidate_duplicates: CandidateDuplicatePair[] } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'evidence' | 'duplicates'>('overview');

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData(null);
    fetchWorkDetail(workId)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load project detail record.');
        setLoading(false);
      });
  }, [workId]);

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center min-h-[450px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">Loading 360° Risk Profile for {workId}...</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.work || !data.work.work_id) {
    return (
      <div className="p-8 space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl border border-slate-200">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Risk Queue
        </button>
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
          <p className="font-bold">Unable to Load Project Record</p>
          <p className="mt-1">{error || `Work record '${workId}' was not found in the current dataset.`}</p>
        </div>
      </div>
    );
  }

  const { work, candidate_duplicates } = data;
  const compositeRiskScore = Number.isFinite(Number(work.composite_risk_score)) ? Number(work.composite_risk_score) : 0;
  const financialRiskScore = Number.isFinite(Number(work.financial_risk_score)) ? Number(work.financial_risk_score) : 0;
  const duplicateRiskScore = Number.isFinite(Number(work.duplicate_risk_score)) ? Number(work.duplicate_risk_score) : 0;
  const complianceRiskScore = Number.isFinite(Number(work.compliance_risk_score)) ? Number(work.compliance_risk_score) : 0;
  const scheduleRiskScore = Number.isFinite(Number(work.schedule_risk_score)) ? Number(work.schedule_risk_score) : 0;

  const formatAmount = (amt: number) => {
    if (!amt) return '₹0.00 Lakh';
    const inLakhs = amt / 100000;
    if (inLakhs >= 100) {
      return `₹${(inLakhs / 100).toFixed(2)} Crore`;
    }
    return `₹${inLakhs.toFixed(2)} Lakh`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top Header & Breadcrumb Bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl border border-slate-200/80 shadow-sm transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-700" /> Return to Risk Queue
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Status:</span>
            <RiskBadge level={work.overall_risk_level || 'LOW'} score={compositeRiskScore} />
          </div>
        </div>

        {/* Executive Banner Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-4xl">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-3 py-1 rounded-xl border border-slate-200">
                  {work.work_id}
                </span>
                <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                  {work.work_category}
                </span>
                <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {work.state || work.State || '—'} • {work.constituency || work.Constituency || '—'}
                </span>
                {work.mp_name && (
                  <span className="px-3 py-1 rounded-xl bg-indigo-50 text-indigo-800 font-semibold border border-indigo-200 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" /> MP: {work.mp_name}
                  </span>
                )}
              </div>

              <h1 className="text-xl font-bold text-slate-900 leading-snug">
                {work.description || 'Project description text unavailable.'}
              </h1>
            </div>

            {/* Composite Risk Box */}
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80 shrink-0 self-start lg:self-center">
              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Composite Risk Score</span>
                <div className="text-3xl font-black text-slate-900 leading-tight">
                  {compositeRiskScore.toFixed(1)} <span className="text-xs text-slate-400 font-normal">/ 100</span>
                </div>
              </div>
              <div className="w-px h-10 bg-slate-200" />
              <div className="flex flex-col items-start gap-1">
                <RiskBadge level={work.overall_risk_level} />
                <span className="text-[10px] text-slate-500 font-bold">
                  {compositeRiskScore >= 35 ? 'Requires Review' : 'Standard Monitoring'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Segmented View Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
        <button onClick={() => setActiveSubTab('overview')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeSubTab === 'overview' ? 'bg-slate-200/90 text-slate-900 border border-slate-300/80 shadow-2xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
          <LayoutGrid className="w-4 h-4" /> Overview & Key Metrics
        </button>
        <button onClick={() => setActiveSubTab('evidence')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeSubTab === 'evidence' ? 'bg-slate-200/90 text-slate-900 border border-slate-300/80 shadow-2xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
          <FileCheck className="w-4 h-4" /> Audit Evidence Matrix
        </button>
        <button onClick={() => setActiveSubTab('duplicates')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeSubTab === 'duplicates' ? 'bg-slate-200/90 text-slate-900 border border-slate-300/80 shadow-2xs' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
          <Copy className="w-4 h-4" /> Candidate Duplicates ({candidate_duplicates.length})
        </button>
      </div>

      {/* SUB-TAB 1: Overview & Executive Metrics */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Executive Key Metrics Cards: Budget, Deadline, Overdue, Gap */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Sanctioned Budget */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" /> Sanctioned Budget
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">{formatAmount(work.sanction_amount)}</div>
              <p className="text-xs text-slate-500 font-medium">
                Disbursed: <span className="text-slate-900 font-bold">{formatAmount(work.effective_expenditure || 0)}</span>
              </p>
            </div>

            {/* Estimated Completion Deadline */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" /> Completion Deadline
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {work.estimated_completion_date || work.completion_date || '2025-03-31'}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Sanction Date: <span className="text-slate-900 font-bold">{work.sanction_date || '2024-04-01'}</span>
              </p>
            </div>

            {/* Timeline Progress Gap */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" /> Progress Gap
              </span>
              <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {work.progress_gap_pct || 0}% points
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Expected: {work.expected_timeline_progress_pct || 0}% | Disbursed: {work.expenditure_progress_pct || 0}%
              </p>
            </div>

            {/* Overdue / Elapsed Duration */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> Timeline Status
              </span>
              <div className={`text-2xl font-black font-mono tracking-tight ${(work.overdue_days || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {(work.overdue_days || 0) > 0 ? `${work.overdue_days} Days Overdue` : 'On Schedule'}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Historical Cost Median: <span className="text-slate-900 font-bold">{work.historical_cost_median ? formatAmount(work.historical_cost_median) : 'Not available'}</span>
              </p>
            </div>
          </div>

          {/* 5 Risk Sub-Engine Gauges */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Analytical Risk Sub-Engine Scores</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Financial Risk */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                  <span className="flex items-center gap-1.5 text-amber-700"><DollarSign className="w-4 h-4" /> Financial</span>
                  <span className="font-mono text-sm">{financialRiskScore.toFixed(1)}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-amber-500 h-full rounded-full" style={{ width: `${Math.min(financialRiskScore, 100)}%` }} />
                </div>
                <div className="text-[11px] text-slate-500 font-medium">Historical comparison: <strong className="text-slate-900">{work.is_financial_outlier ? work.financial_risk_level : 'No range breach'}</strong></div>
              </div>

              {/* Duplicate Risk */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                  <span className="flex items-center gap-1.5 text-indigo-700"><Copy className="w-4 h-4" /> Duplicate NLP</span>
                  <span className="font-mono text-sm">{duplicateRiskScore.toFixed(1)}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(duplicateRiskScore, 100)}%` }} />
                </div>
                <div className="text-[11px] text-slate-500 font-medium">{duplicateRiskScore >= 85 ? 'High Overlap' : 'Unique Text Verified'}</div>
              </div>

              {/* Compliance Risk */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                  <span className="flex items-center gap-1.5 text-emerald-700"><CheckSquare className="w-4 h-4" /> Compliance</span>
                  <span className="font-mono text-sm">{complianceRiskScore.toFixed(1)}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(complianceRiskScore, 100)}%` }} />
                </div>
                <div className="text-[11px] text-slate-500 font-medium">{work.compliance_review_status === 'REVIEW_REQUIRED' ? 'Work-level review required' : 'No work-level concern'}</div>
              </div>

              {/* Schedule & Progress Risk */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                <div className="flex justify-between items-center text-xs font-bold text-slate-900">
                  <span className="flex items-center gap-1.5 text-blue-700"><Clock className="w-4 h-4" /> Schedule</span>
                  <span className="font-mono text-sm">{scheduleRiskScore.toFixed(1)}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(scheduleRiskScore, 100)}%` }} />
                </div>
                <div className="text-[11px] text-slate-500 font-medium">Gap: <strong className="text-slate-900">{work.progress_gap_pct || 0}% pts</strong></div>
              </div>
            </div>
          </div>
          <WorkInfoCards work={work} />
          <GeotagEvidenceCard workId={work.work_id} onOpenEvidence={onOpenEvidence} onSelectWork={onSelectWork} />
        </div>
      )}

      {activeSubTab === 'evidence' && <RiskEvidencePanel work={work} onOpenEvidence={onOpenEvidence} onSelectWork={onSelectWork} />}

      {activeSubTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
            <h3 className="text-sm font-bold text-slate-900">Candidate Duplicate Pairs ({candidate_duplicates.length} Matches Found)</h3>
            <span className="text-xs font-mono font-semibold text-slate-500">Constituency Comparison Search</span>
          </div>

          {candidate_duplicates.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-xs text-slate-500 font-medium shadow-sm">
              No candidate duplicate matches detected for this work record.
            </div>
          ) : (
            candidate_duplicates.map((dup, idx) => {
              const otherWorkId = dup.work_id_1 === work.work_id ? dup.work_id_2 : dup.work_id_1;
              const otherDesc = dup.work_id_1 === work.work_id ? dup.description_2 : dup.description_1;
              const otherAmt = dup.work_id_1 === work.work_id ? dup.sanction_amount_2 : dup.sanction_amount_1;

              return (
                <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center text-xs border-b border-slate-100 pb-3">
                    <span className="font-mono font-bold text-slate-900">Matched Candidate: {otherWorkId}</span>
                    <span className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl text-indigo-700 font-bold">{dup.possible_split_work ? 'Possible divided scope' : 'Related scope review'}</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                          <th className="py-2.5 px-3">Field</th>
                          <th className="py-2.5 px-3">Current Work ({work.work_id})</th>
                          <th className="py-2.5 px-3">Matched Work ({otherWorkId})</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        <tr>
                          <td className="py-2.5 px-3 font-bold text-slate-500">Sanction Amount</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{formatAmount(work.sanction_amount)}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{formatAmount(otherAmt)}</td>
                        </tr>
                        <tr>
                          <td className="py-2.5 px-3 font-bold text-slate-500">Work Description</td>
                          <td className="py-2.5 px-3 leading-relaxed text-slate-700">{work.description}</td>
                          <td className="py-2.5 px-3 leading-relaxed text-slate-700">{otherDesc}</td>
                        </tr>
                        {dup.nlp_explanation && (
                          <tr>
                            <td className="py-2.5 px-3 font-bold text-slate-500">What happened?</td>
                            <td colSpan={2} className={`py-2.5 px-3 leading-relaxed font-semibold ${dup.possible_split_work ? 'text-amber-800 bg-amber-50' : 'text-slate-700'}`}>
                              {dup.nlp_explanation}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td className="py-2.5 px-3 font-bold text-slate-500">Action</td>
                          <td className="py-2.5 px-3 text-slate-400 font-medium">Currently Viewing</td>
                          <td className="py-2.5 px-3">
                            {onSelectWork && (
                              <button onClick={() => onSelectWork(otherWorkId)} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm">
                                <Eye className="w-3.5 h-3.5" /> Inspect {otherWorkId}
                              </button>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
