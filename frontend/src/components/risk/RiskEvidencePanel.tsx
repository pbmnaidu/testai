import React from 'react';
import { WorkRecord } from '../../types';
import { ShieldCheck } from 'lucide-react';
import { GeotagEvidenceCard } from '../GeotagEvidenceCard';

interface RiskEvidencePanelProps {
  work: WorkRecord;
  onOpenEvidence?: (workId: string, imageName?: string) => void;
  onSelectWork?: (workId: string) => void;
}

export const RiskEvidencePanel: React.FC<RiskEvidencePanelProps> = ({ work, onOpenEvidence, onSelectWork }) => {
  const amount = work.sanction_amount || 0;
  const nestedComplianceFinding = (work.compliance_findings || work.compliance_rule_results || [])
    .find((finding) => finding.status === 'FAIL' || finding.status === 'NEEDS_REVIEW');
  let primaryDetails: Record<string, unknown> = {};
  try {
    primaryDetails = work.compliance_primary_details_json ? JSON.parse(work.compliance_primary_details_json) : {};
  } catch {
    primaryDetails = {};
  }
  const complianceFinding = nestedComplianceFinding || (work.compliance_primary_rule_id ? {
    rule_id: work.compliance_primary_rule_id,
    rule_name: work.compliance_primary_rule_id,
    status: work.compliance_primary_status || 'NEEDS_REVIEW',
    guideline_basis: work.compliance_primary_guideline_basis,
    what_happened: work.compliance_primary_what_happened || work.compliance_what_happened,
    why_it_matters: work.compliance_primary_why_it_matters,
    supporting_details: work.compliance_primary_supporting_details || work.compliance_supporting_details,
    details: primaryDetails,
  } : undefined);
  const complianceAction = complianceFinding
    ? 'Review this work against ' + (complianceFinding.guideline_basis || complianceFinding.guideline_section || 'the cited MPLADS guideline provision') + '.'
    : 'No work-level guideline concern was identified from the available record.';
  const recommendedAction = [work.recommended_reviewer_action, complianceAction]
    .filter((action, index, actions) => Boolean(action) && actions.indexOf(action) === index)
    .join('\n');

  const dimensions = [
    {
      title: 'Financial Risk Engine',
      observed: `₹${(amount / 100000).toFixed(2)} Lakh`,
      baseline: work.historical_cost_count ? `${work.comparison_group_label || 'Selected peer-group'} historical range (${work.historical_cost_count} completed works)` : 'Comparable completed-work history',
      deviation: work.financial_risk_level || 'NO SIGNAL',
      isHighDev: Boolean(work.is_financial_outlier),
      whatHappened: work.financial_what_happened || work.financial_explanation || "There is insufficient historical data for a reliable comparison of this work's pricing.",
      whyItMatters: work.financial_why_it_matters || 'Review the estimate, quantity, scope, and supporting cost justification against the available local records.',
      supportingDetails: work.financial_supporting_details || work.financial_risk_evidence || 'No additional comparable cost details are available.'
    },
    {
      title: 'Related Work Records',
      observed: work.description || 'N/A',
      baseline: 'Related descriptions and record details',
      deviation: work.duplicate_risk_level || ((work.duplicate_risk_score || 0) >= 70 ? 'REVIEW' : 'NO SIGNAL'),
      isHighDev: (work.duplicate_risk_score || 0) >= 70,
      whatHappened: work.duplicate_what_happened || ((work.duplicate_risk_score || 0) >= 70
        ? 'Related work records share project details and were recorded close enough together to warrant a scope check.'
        : 'No material overlap signal was identified in the related work records.'),
      whyItMatters: work.duplicate_why_it_matters || 'Verify that each record represents a distinct physical scope, quantity, location, and implementing arrangement.',
      supportingDetails: work.duplicate_supporting_details || 'Open the related-record view for the descriptions, dates, quantities, and recorded costs used in the review.'
    },
    {
      title: 'Compliance & Evidence Gaps',
      observed: complianceFinding ? complianceFinding.status.replace(/_/g, ' ') : 'No finding',
      baseline: complianceFinding?.threshold || 'Applicable work-level MPLADS guideline requirement',
      deviation: complianceFinding?.severity || 'LOW',
      isHighDev: Boolean(complianceFinding),
      whatHappened: complianceFinding?.what_happened || work.compliance_what_happened || 'No work-level guideline concern was identified from the available record.',
      whyItMatters: complianceFinding?.why_it_matters || work.compliance_why_it_matters || 'Continue to retain the supporting administrative and implementation records.',
      supportingDetails: complianceFinding?.supporting_details || work.compliance_supporting_details || ('Guideline basis: ' + (complianceFinding?.guideline_basis || complianceFinding?.guideline_section || 'MPLADS Guidelines'))
    },
    {
      title: 'Schedule & Progress Risk',
      observed: `${work.expenditure_progress_pct || 0}% Expenditure Progress`,
      baseline: `${work.expected_timeline_progress_pct || 0}% Expected Timeline Progress`,
      deviation: `${work.progress_gap_pct || 0}% Progress Gap`,
      isHighDev: (work.progress_gap_pct || 0) >= 15,
      whatHappened: work.schedule_what_happened || work.schedule_explanation || 'The available execution and expenditure records do not show a material schedule concern.',
      whyItMatters: work.schedule_why_it_matters || 'Routine monitoring can continue using the next physical progress and expenditure update.',
      supportingDetails: work.schedule_supporting_details || 'No additional schedule details are available.'
    }
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
          Multi-Signal Audit Evidence Breakdown ("Why Flagged?")
        </h3>
        <span className="text-xs font-mono font-bold text-slate-500">Work ID: {work.work_id}</span>
      </div>

      {/* Put the action first so the reviewer sees the recommended next step
          before reading the supporting signal explanations. */}
      <div className="risk-evidence-admin-action p-5 rounded-2xl bg-slate-900 text-white space-y-1.5 text-xs shadow-md">
        <span className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] block flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Recommended Administrative Review Action:
        </span>
        <p className="text-slate-200 leading-relaxed font-medium">
          {recommendedAction || 'Perform standard periodic monitoring.'}
        </p>
      </div>

      <GeotagEvidenceCard workId={work.work_id} onOpenEvidence={onOpenEvidence} onSelectWork={onSelectWork} />

      {/* 5 Risk Sub-Engine Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {dimensions.map((dim, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-3 shadow-sm">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-900">{dim.title}</span>
              <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-bold ${
                dim.isHighDev ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'
              }`}>
                {dim.deviation}
              </span>
            </div>

            <div className="text-xs space-y-1.5 text-slate-500">
              <div className="flex justify-between">
                <span>Observed:</span>
                <span className="text-slate-900 font-bold truncate max-w-[200px]">{dim.observed}</span>
              </div>
              <div className="flex justify-between">
                <span>Baseline:</span>
                <span className="text-slate-700 font-medium">{dim.baseline}</span>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80 leading-relaxed font-medium space-y-2" style={{ overflowWrap: 'anywhere' }}>
              <div><span className="font-bold text-slate-900">What happened?</span> {dim.whatHappened}</div>
              <div><span className="font-bold text-slate-900">Why it matters:</span> {dim.whyItMatters}</div>
              <div className="text-slate-600"><span className="font-bold text-slate-900">Supporting details:</span> {dim.supportingDetails}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="risk-evidence-engine-summary rounded-2xl bg-slate-900 text-slate-100 p-5 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">Engine summary</h4>
          <p className="mt-3 text-xs leading-relaxed whitespace-pre-line break-words" style={{ overflowWrap: 'anywhere' }}>{work.explainable_audit_summary || 'The work is prioritized from the combined financial, duplicate, compliance and schedule signals shown above.'}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800">Why this work was prioritized</h4>
          <p className="mt-3 text-xs leading-relaxed text-amber-950 whitespace-pre-line break-words" style={{ overflowWrap: 'anywhere' }}>{recommendedAction || 'Review the highlighted signals against the source records and supporting evidence.'}</p>
        </div>
      </div>
    </div>
  );
};
