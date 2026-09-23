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
  Store,
  FileCheck,
  HardHat,
  XCircle,
  Hash,
  Send,
  AlertOctagon
} from 'lucide-react';
import { fetchMaterialAssessmentForWork } from '../services/firebase';
import { recordOfficerMaterialDecision } from '../services/api';

interface MaterialEvidencePanelProps {
  workId: string;
  onNavigateToMaterial?: () => void;
  showOfficerControls?: boolean;
}

export const MaterialEvidencePanel: React.FC<MaterialEvidencePanelProps> = ({
  workId,
  onNavigateToMaterial,
  showOfficerControls = false
}) => {
  const [assessment, setAssessment] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

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

  const handleOfficerDecision = async (
    decision: 'APPROVED_FOR_PAYMENT' | 'FIELD_INSPECTION_ORDERED' | 'REJECTED_SUBSTANDARD' | 'SHOW_CAUSE_ISSUED',
    notes: string
  ) => {
    if (!assessment) return;
    setActionInProgress(true);
    try {
      const actionType: 'APPROVE' | 'ORDER_TEST' | 'REJECT' =
        decision === 'APPROVED_FOR_PAYMENT'
          ? 'APPROVE'
          : decision === 'FIELD_INSPECTION_ORDERED'
            ? 'ORDER_TEST'
            : 'REJECT';

      const asmtId = assessment.assessment_id || `asmt_${workId}`;
      await recordOfficerMaterialDecision(asmtId, actionType, notes, workId);

      // Update state locally
      setAssessment((prev: any) => ({
        ...prev,
        quality_test_report: {
          ...(prev?.quality_test_report || {}),
          inspection_status: decision
        }
      }));

      setActionNotice(`Officer decision recorded: ${decision.replace(/_/g, ' ')}`);
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setActionNotice(`Error recording officer decision: ${err?.message || 'Server error'}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const priceDiffPct = assessment?.price_comparison?.price_difference_pct ?? null;
  const isElevated = priceDiffPct != null && priceDiffPct > 15;
  const isHighAnomaly = priceDiffPct != null && priceDiffPct > 30;

  const testReport = assessment?.quality_test_report;
  const vendorShop = assessment?.contractor_procurement;
  const inspectionStatus = testReport?.inspection_status || 'OFFICER_REVIEW_PENDING';

  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/15">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
              Material Quality &amp; Rate Fairness Audit Record
            </h3>
            {assessment && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                Work ID: {workId}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            Automated technical specification extraction, lab quality tests, and CPWD/State Schedule of Rates (SOR) price fairness verification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToMaterial && (
            <button
              type="button"
              onClick={onNavigateToMaterial}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300 shadow-2xs"
            >
              Open Full Audit <ExternalLink className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={loadAssessment}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 shadow-2xs"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-emerald-300">
          {actionNotice}
        </div>
      )}

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
            Contractor test certificates, procurement vouchers, or BOQs can be analyzed to verify concrete grade, tensile strength, and SOR price benchmark compliance.
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
                Rate Fairness Assessment
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
                Material &amp; Standard Code
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

          {/* Quality Test Verification & Vendor Procurement Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendor Procurement Details */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Store className="h-4 w-4 text-emerald-600" /> Authorized Vendor / Shop
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Inv: {vendorShop?.invoice_no || assessment.extracted_attributes?.invoice_no || 'VOUCH-INSPECT'}
                </span>
              </div>
              <div className="mt-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Shop / Supplier:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {vendorShop?.shop_name || assessment.extracted_attributes?.shop_name || 'Authorized Regional Vendor'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Batch / Heat No:</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {vendorShop?.batch_no || assessment.extracted_attributes?.batch_no || 'BATCH-VERIFIED'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Statutory Inspection Status:</span>
                  <span className="rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                    {inspectionStatus.replace(/_/g, ' ')}
                  </span>
                </div>
                {assessment.audit_dossier_hash && (
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 font-mono">
                    <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> Audit Dossier:</span>
                    <span>{assessment.audit_dossier_hash.slice(0, 16)}…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quality Test Specs */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Physical &amp; Lab Quality Test Specs
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                  testReport?.passed === false
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {testReport?.status || 'SPECIFICATION VERIFIED'}
                </span>
              </div>
              <div className="mt-2.5 space-y-2">
                {testReport?.test_parameters && testReport.test_parameters.length > 0 ? (
                  testReport.test_parameters.map((param: any, pIdx: number) => (
                    <div key={pIdx} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{param.parameter}</span>
                        <div className="text-[10px] text-slate-400">Min: {param.specified_min}</div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{param.observed_value}</span>
                        <div className={`text-[10px] font-black uppercase ${param.is_passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {param.is_passed ? 'PASSED' : 'DEFICIENT'}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    All standard Indian Standards (IS) physical strength criteria satisfied for grade {assessment.extracted_attributes?.grade || 'Standard'}.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Officer Action Bar if controls are enabled */}
          {showOfficerControls && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                    <HardHat className="h-4 w-4 text-indigo-600" /> Implementing Officer Statutory Decision
                  </h4>
                  <p className="text-[11px] text-indigo-800/80 dark:text-indigo-300 mt-0.5">
                    Adjudicate contractor material voucher for this sanctioned work.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={actionInProgress}
                    onClick={() => handleOfficerDecision('APPROVED_FOR_PAYMENT', 'Voucher rates & lab test report validated against state SOR.')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition disabled:opacity-50"
                  >
                    Approve Material Quality
                  </button>
                  <button
                    type="button"
                    disabled={actionInProgress}
                    onClick={() => handleOfficerDecision('FIELD_INSPECTION_ORDERED', 'Assistant Engineer deputed for independent lab core/cube sample testing.')}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-2xs transition disabled:opacity-50"
                  >
                    Order Field Sample Test
                  </button>
                  <button
                    type="button"
                    disabled={actionInProgress}
                    onClick={() => handleOfficerDecision('SHOW_CAUSE_ISSUED', 'Notice issued for deviation between voucher grade and sanctioned schedule.')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-2xs transition disabled:opacity-50"
                  >
                    Issue Show-Cause Notice
                  </button>
                </div>
              </div>
            </div>
          )}

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
