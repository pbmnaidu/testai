import React, { useEffect, useState } from 'react';
import {
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  ExternalLink,
  PlusCircle,
  Tag,
} from 'lucide-react';
import { fetchMaterialAssessmentForWork } from '../services/firebase';

interface MaterialEvidencePanelProps {
  workId: string;
  onNavigateToMaterial?: () => void;
}

export const MaterialEvidencePanel: React.FC<MaterialEvidencePanelProps> = ({ workId, onNavigateToMaterial }) => {
  const [assessment, setAssessment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAssessment = () => {
    setLoading(true);
    fetchMaterialAssessmentForWork(workId)
      .then((data) => {
        setAssessment(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAssessment();
  }, [workId]);

  const priceDiffPct = assessment?.price_comparison?.price_difference_pct ?? null;
  const isElevated = priceDiffPct != null && priceDiffPct > 15;
  const isHighAnomaly = priceDiffPct != null && priceDiffPct > 30;

  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/15">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Material Quality &amp; Rate Fairness Audit Record
            </h3>
          </div>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            Automated technical specification extraction and CPWD/State Schedule of Rates (SOR) price fairness verification linked to this Work ID.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAssessment}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 p-8 text-xs font-semibold text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" /> Verifying material records…
        </div>
      )}

      {!loading && !assessment && (
        <div className="mt-4 rounded-2xl border border-dashed border-emerald-300/80 bg-white/70 p-6 text-center dark:border-emerald-900/60 dark:bg-slate-900/40">
          <FileText className="mx-auto h-8 w-8 text-emerald-600/70 dark:text-emerald-400/70" />
          <p className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-200">
            No Material Quality Assessment Logged for {workId}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Test reports, procurement vouchers, or BOQs can be analyzed to verify concrete grade, tensile strength, and SOR price benchmark compliance.
          </p>
          {onNavigateToMaterial && (
            <button
              type="button"
              onClick={onNavigateToMaterial}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
            >
              <PlusCircle className="h-4 w-4" /> Run Material Quality Audit for this Work
            </button>
          )}
        </div>
      )}

      {!loading && assessment && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Card */}
            <div className="rounded-xl border border-emerald-100 bg-white p-4 dark:border-emerald-900/50 dark:bg-slate-900">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Fairness Assessment
              </span>
              <div className="mt-2 flex items-center gap-2">
                {isHighAnomaly ? (
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                ) : isElevated ? (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                )}
                <span
                  className={`text-sm font-black ${
                    isHighAnomaly
                      ? 'text-rose-700 dark:text-rose-300'
                      : isElevated
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  {assessment.fairness_assessment?.label || (isHighAnomaly ? 'PRICE ANOMALY' : isElevated ? 'ELEVATED RATE' : 'FAIR PRICE COMPLIANT')}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                {assessment.fairness_assessment?.explanation || 'Rate validated against official CPWD and State Schedule of Rates.'}
              </p>
            </div>

            {/* Price Comparison Card */}
            <div className="rounded-xl border border-emerald-100 bg-white p-4 dark:border-emerald-900/50 dark:bg-slate-900">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Quoted vs Reference Rate
              </span>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-xl font-black text-slate-900 dark:text-slate-100">
                  ₹{Number(assessment.price_comparison?.quoted_unit_price || 0).toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">
                  / {assessment.price_comparison?.unit || 'unit'}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Benchmark:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  ₹{Number(assessment.price_comparison?.reference_unit_price || 0).toLocaleString()}
                </span>
                {priceDiffPct != null && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-black ${
                      priceDiffPct > 0
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    }`}
                  >
                    {priceDiffPct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {priceDiffPct > 0 ? `+${priceDiffPct}%` : `${priceDiffPct}%`}
                  </span>
                )}
              </div>
            </div>

            {/* Technical Specifications */}
            <div className="rounded-xl border border-emerald-100 bg-white p-4 dark:border-emerald-900/50 dark:bg-slate-900">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Material &amp; Specifications
              </span>
              <p className="mt-1 font-bold text-xs text-slate-900 dark:text-slate-100">
                {assessment.extracted_attributes?.material || 'Construction Material'} · {assessment.extracted_attributes?.grade || 'Standard'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {assessment.extracted_attributes?.is_code && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    IS {assessment.extracted_attributes.is_code}
                  </span>
                )}
                {assessment.extracted_attributes?.brand && (
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                    Brand: {assessment.extracted_attributes.brand}
                  </span>
                )}
                {assessment.extracted_attributes?.quantity && (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    Qty: {assessment.extracted_attributes.quantity} {assessment.extracted_attributes?.unit || ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Guidance box */}
          {assessment.auditor_guidance?.length > 0 && (
            <div className="rounded-xl border border-emerald-200/80 bg-white p-4 dark:border-emerald-900/50 dark:bg-slate-900/70">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Auditor Guidance &amp; Verification Action
              </span>
              <ul className="mt-2 space-y-1">
                {assessment.auditor_guidance.map((guide: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0" />
                    <span>{guide}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default MaterialEvidencePanel;
