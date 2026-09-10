import React from 'react';
import { WorkRecord } from '../../types';
import { ShieldCheck } from 'lucide-react';

interface RiskEvidencePanelProps {
  work: WorkRecord;
}

export const RiskEvidencePanel: React.FC<RiskEvidencePanelProps> = ({ work }) => {
  const amount = work.sanction_amount || 0;
  const ratio = work.amount_to_peer_ratio || 1.0;
  const pct = work.category_percentile || 50.0;
  const hasImage = work.has_evidence_image || false;
  const complianceExplanation = work.compliance_explanation || '';
  const sanctionDateRule = complianceExplanation
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /sanction|administrative sanction|75-day/i.test(line));
  const sanctionDateAction = work.sanction_date && sanctionDateRule
    ? `Compliance — sanction-date review: verify the sanction date against the recommendation, start, and completion timeline. ${sanctionDateRule}`
    : '';
  const recommendedAction = [work.recommended_reviewer_action, sanctionDateAction]
    .filter((action, index, actions) => Boolean(action) && actions.indexOf(action) === index)
    .join('\n');

  const dimensions = [
    {
      title: 'Financial Risk Engine',
      observed: `₹${(amount / 100000).toFixed(2)} Lakh`,
      baseline: 'Category Median Baseline',
      deviation: `${ratio.toFixed(2)}x Peer Ratio (${pct.toFixed(1)}th percentile)`,
      isHighDev: ratio >= 2.0,
      explanation: work.financial_explanation || 'Expenditure falls within expected baseline bounds.'
    },
    {
      title: 'Duplicate Text (NLP Engine)',
      observed: work.description || 'N/A',
      baseline: 'Unique Text Threshold (< 70%)',
      deviation: work.duplicate_risk_score ? `${work.duplicate_risk_score.toFixed(1)}% Match` : 'No Match',
      isHighDev: (work.duplicate_risk_score || 0) >= 70,
      explanation: (work.duplicate_risk_score || 0) >= 70
        ? `Candidate duplicate description detected in ${work.Constituency} constituency.`
        : 'Unique description text verified across database.'
    },
    {
      title: 'Compliance & Evidence Gaps',
      observed: hasImage ? 'Image Uploaded' : 'Missing Photo Evidence',
      baseline: 'Physical Site Upload Required',
      deviation: !hasImage && work.completion_date ? 'Missing Photo' : 'Compliant',
      isHighDev: !hasImage && work.completion_date,
      explanation: work.compliance_explanation || 'Site evidence requirements satisfied.'
    },
    {
      title: 'Schedule & Progress Risk',
      observed: `${work.expenditure_progress_pct || 0}% Expenditure Progress`,
      baseline: `${work.expected_timeline_progress_pct || 0}% Expected Timeline Progress`,
      deviation: `${work.progress_gap_pct || 0}% Progress Gap`,
      isHighDev: (work.progress_gap_pct || 0) >= 15,
      explanation: work.schedule_explanation || 'Schedule timeline progress aligns with financial disbursals.'
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

            <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80 leading-relaxed font-medium whitespace-pre-line break-words" style={{ overflowWrap: 'anywhere' }}>
              {dim.explanation}
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
