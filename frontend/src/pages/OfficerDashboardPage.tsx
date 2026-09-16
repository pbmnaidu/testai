import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  FileSearch,
  HardHat,
  MapPin,
  MessageSquareWarning,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  WalletCards,
  X,
  XCircle,
} from 'lucide-react';
import { fetchOfficerDashboard, fetchOfficerWork, reviewCitizenEvidence } from '../services/api';
import { OfficerDashboardResponse, OfficerWorkResponse, CitizenEvidenceRecord, AttendanceRecord } from '../types';
import { RiskBadge } from '../components/cards/RiskBadge';
import { CitizenEvidenceModal } from '../components/CitizenEvidenceModal';
import { PortalAuthGate } from '../components/auth/PortalAuthGate';

type QueueFocus = 'priority' | 'all' | 'high_priority' | 'material' | 'attendance' | 'citizen' | 'compliance' | 'schedule' | 'duplicate';

export interface OfficerDashboardPageProps {
  onSelectWork?: (workId: string) => void;
}

const initialDashboard: OfficerDashboardResponse = {
  selected_filters: {},
  available: { states: [], constituencies: [], statuses: [], severities: [] },
  summary: {
    total_works: 0,
    high_priority_works: 0,
    material_price_reviews: 0,
    attendance_issues: 0,
    citizen_complaints: 0,
    compliance_issues: 0,
    schedule_risks: 0,
    duplicate_candidates: 0,
    financial_reviews: 0,
  },
  data_availability: {},
  queue_total: 0,
  priority_works: [],
};

const money = (amount?: number) => {
  if (amount === undefined || amount === null) return 'Not available';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
};

const ScoreBar = ({ label, score, source }: { label: string; score: number; source?: string }) => (
  <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
    <div className="flex justify-between gap-3 text-xs font-bold text-slate-800 dark:text-slate-200">
      <span>{label}</span>
      <span className="font-mono">{Number(score || 0).toFixed(1)} / 100</span>
    </div>
    <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden dark:bg-slate-800">
      <div
        className="h-full rounded-full bg-slate-900 dark:bg-emerald-500"
        style={{ width: `${Math.min(100, Math.max(0, Number(score || 0)))}%` }}
      />
    </div>
    {source && <p className="mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">Source: {source}</p>}
  </div>
);

const DataWarning = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
    <div className="flex-1">{children}</div>
  </div>
);

const OfficerDashboardInner: React.FC<OfficerDashboardPageProps> = ({ onSelectWork }) => {
  const [dashboard, setDashboard] = useState<OfficerDashboardResponse>(initialDashboard);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ state: '', constituency: '', work_status: '', severity: '', search: '' });
  const [focusDimension, setFocusDimension] = useState<QueueFocus>('priority');
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OfficerWorkResponse | null>(null);
  const [detailError, setDetailError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  const loadDashboard = () => {
    setLoading(true);
    fetchOfficerDashboard({ ...filters, focus: focusDimension, limit: 100 })
      .then((result) => {
        setDashboard(result);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchOfficerDashboard({ ...filters, focus: focusDimension, limit: 100 })
      .then((result) => {
        if (active) {
          setDashboard(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters, focusDimension]);

  const loadWorkDetail = (workId: string) => {
    setDetail(null);
    setDetailError('');
    setActionNotice('');
    fetchOfficerWork(workId)
      .then((result) => {
        setDetail(result);
      })
      .catch((error) => {
        setDetailError(error.message || 'Unable to load work monitoring record.');
      });
  };

  useEffect(() => {
    if (!selectedWorkId) return;
    loadWorkDetail(selectedWorkId);
  }, [selectedWorkId]);

  const setFilter = (key: keyof typeof filters, value: string) =>
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'state' ? { constituency: '' } : {}),
    }));

  const visiblePriority = dashboard.priority_works;
  const cardFocus: Record<string, QueueFocus> = {
    'Total works': 'all',
    'High priority works': 'high_priority',
    'Material price reviews': 'material',
    'Attendance issues': 'attendance',
    'Citizen complaints': 'citizen',
    'Compliance issues': 'compliance',
    'Schedule risks': 'schedule',
    'Candidate duplicates': 'duplicate',
  };

  if (selectedWorkId) {
    if (detailError)
      return (
        <div className="p-6 space-y-4">
          <button
            onClick={() => setSelectedWorkId(null)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to officer queue
          </button>
          <DataWarning>{detailError}</DataWarning>
        </div>
      );
    if (!detail)
      return (
        <div className="p-10 text-center text-sm font-medium text-slate-500">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-emerald-600" />
          Loading Project Monitoring 360° for {selectedWorkId}…
        </div>
      );
    return (
      <OfficerWorkView
        detail={detail}
        onBack={() => setSelectedWorkId(null)}
        actionNotice={actionNotice}
        onAction={(label) => setActionNotice(`${label} is recorded in officer log.`)}
        onSelectWork={onSelectWork}
        onRefreshDetail={() => selectedWorkId && loadWorkDetail(selectedWorkId)}
      />
    );
  }

  const cards = [
    ['Total works', dashboard.summary.total_works, ClipboardCheck, 'slate'],
    ['High priority works', dashboard.summary.high_priority_works, ShieldAlert, 'rose'],
    ['Material price reviews', dashboard.summary.material_price_reviews, Scale, 'amber'],
    ['Attendance issues', dashboard.summary.attendance_issues, Users, 'indigo'],
    ['Citizen complaints', dashboard.summary.citizen_complaints, MessageSquareWarning, 'orange'],
    ['Compliance issues', dashboard.summary.compliance_issues, FileSearch, 'emerald'],
    ['Schedule risks', dashboard.summary.schedule_risks, CalendarClock, 'sky'],
    ['Candidate duplicates', dashboard.summary.duplicate_candidates, Copy, 'violet'],
  ] as const;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Control Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
              MPLADS Implementing Officer
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">Monitoring &amp; Action Center</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Verified physical progress, contractor attendance muster logs, and citizen evidence linked directly to official canonical Work IDs.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadDashboard}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Center
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live Evidence &amp; Attendance Connected
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <select
            value={filters.state}
            onChange={(e) => setFilter('state', e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">All states</option>
            {dashboard.available.states.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={filters.constituency}
            onChange={(e) => setFilter('constituency', e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">
              {filters.state ? `All constituencies in ${filters.state} (${dashboard.available.constituencies.length})` : `All constituencies (${dashboard.available.constituencies.length})`}
            </option>
            {dashboard.available.constituencies.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={filters.work_status}
            onChange={(e) => setFilter('work_status', e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">All work statuses</option>
            {dashboard.available.statuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={filters.severity}
            onChange={(e) => setFilter('severity', e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">All risk levels</option>
            {dashboard.available.severities.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <label className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Search Work ID or project"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </label>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {cards.map(([label, value, Icon, tone]) => {
          const isSelected = focusDimension === cardFocus[label];
          return (
            <button
              type="button"
              key={label}
              onClick={() => setFocusDimension(cardFocus[label])}
              className={`group flex flex-col justify-between rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 dark:bg-[#0f172a] ${
                isSelected
                  ? 'border-indigo-600 ring-2 ring-indigo-500 bg-indigo-50/30 dark:border-emerald-400 dark:ring-emerald-400 dark:bg-emerald-950/20'
                  : 'border-slate-200/80 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <div
                  className={`mb-3 inline-flex rounded-lg p-2 transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                      : tone === 'rose'
                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300'
                        : tone === 'indigo'
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300'
                          : tone === 'orange'
                            ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-2xl font-black text-slate-900 dark:text-slate-100">{loading ? '—' : value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
              </div>
              <div className="mt-3">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition ${
                    isSelected
                      ? 'bg-indigo-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                      : 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:group-hover:bg-indigo-900/60'
                  }`}
                >
                  {isSelected ? 'Active queue ✓' : 'Filter queue →'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Focus Pill Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Queue focus:</span>
        {[
          ['priority', 'Default priority'],
          ['all', 'All works (Total)'],
          ['high_priority', 'High priority'],
          ['material', 'Material price reviews'],
          ['attendance', 'Attendance issues'],
          ['citizen', 'Citizen complaints'],
          ['compliance', 'Compliance issues'],
          ['schedule', 'Schedule risks'],
          ['duplicate', 'Candidate duplicates'],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            onClick={() => setFocusDimension(key as QueueFocus)}
            className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
              focusDimension === key
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Priority Work Review Table */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-[#0f172a]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                {focusDimension === 'all'
                  ? 'Total Works Queue'
                  : focusDimension === 'high_priority'
                    ? 'High Priority Works Queue'
                    : focusDimension === 'material'
                      ? 'Material Price Reviews Queue'
                      : focusDimension === 'attendance'
                        ? 'Attendance Issues Queue'
                        : focusDimension === 'citizen'
                          ? 'Citizen Complaints Queue'
                          : focusDimension === 'compliance'
                            ? 'Compliance Issues Queue'
                            : focusDimension === 'schedule'
                              ? 'Schedule Risks Queue'
                              : focusDimension === 'duplicate'
                                ? 'Candidate Duplicates Queue'
                                : 'Priority Work Review & Monitoring Queue'}
              </h3>
              {focusDimension !== 'priority' && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Filtered by card
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {filters.state ? `Showing works for ${filters.state}` : 'Showing works nationwide'} · Ranked by analytical risk indicators.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {visiblePriority.length}{dashboard.queue_total && dashboard.queue_total > visiblePriority.length ? ` of ${dashboard.queue_total}` : ''} works
            </span>
          </div>
        </div>

        {visiblePriority.length === 0 && !loading ? (
          <div className="p-8 text-center text-xs text-slate-500">No works match the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Work ID / Project</th>
                  <th className="px-4 py-3">Why flagged</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Officer status</th>
                  <th className="px-5 py-3 text-right">Actions &amp; Risk Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visiblePriority.map((item) => (
                  <tr key={item.work_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setSelectedWorkId(item.work_id)}
                        className="font-mono font-bold text-indigo-700 hover:underline dark:text-indigo-400"
                      >
                        {item.work_id}
                      </button>
                      <p className="mt-1 max-w-xs truncate text-slate-500 dark:text-slate-400">
                        {item.description || 'Description unavailable'}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {item.state} · {item.constituency}
                      </p>
                    </td>
                    <td className="max-w-sm px-4 py-4 leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.why_flagged}
                    </td>
                    <td className="px-4 py-4">
                      <RiskBadge level={item.overall_risk || item.overall_risk_level} score={item.overall_risk_score ?? item.composite_risk_score} />
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{item.recommended_action}</span>
                      <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{item.officer_review_status}</p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {onSelectWork && (
                          <button
                            type="button"
                            onClick={() => onSelectWork(item.work_id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 shadow-sm hover:bg-indigo-100 dark:border-indigo-800/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60"
                            title={`Open respected risk profile for ${item.work_id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Risk Profile ↗</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedWorkId(item.work_id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                        >
                          Review <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export const OfficerDashboardPage: React.FC<OfficerDashboardPageProps> = (props) => {
  return (
    <PortalAuthGate
      requiredRole="officer"
      requiredEmail="naidupolimera.6@gmail.com"
      portalTitle="Implementing Officer Monitoring & Action Center"
      portalSubtitle="Statutory Physical Verification, Contractor Muster Review & Canonical Work Evidence Audit"
      portalBadge="Implementing Officer Only"
      portalIcon={ClipboardCheck}
      accentColor="indigo"
    >
      <OfficerDashboardInner {...props} />
    </PortalAuthGate>
  );
};

// ==========================================
// 360° Work Detail Component
// ==========================================

const OfficerWorkView: React.FC<{
  detail: OfficerWorkResponse;
  onBack: () => void;
  actionNotice: string;
  onAction: (label: string) => void;
  onSelectWork?: (workId: string) => void;
  onRefreshDetail?: () => void;
}> = ({ detail, onBack, actionNotice, onAction, onSelectWork, onRefreshDetail }) => {
  const { work } = detail;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [evidenceInitialRole, setEvidenceInitialRole] = useState<'citizen' | 'contractor_attendance' | 'contractor_progress' | 'officer_inspection'>('officer_inspection');
  const [selectedPhoto, setSelectedPhoto] = useState<{ src: string; title: string; meta?: string } | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string>('');

  const jumpTo = (id: string) => {
    const order: Record<string, number> = {
      'risk-summary': 0,
      evidence: 1,
      financial: 2,
      material: 3,
      compliance: 4,
      duplicates: 4,
      schedule: 5,
      actions: 1,
    };
    const target = rootRef.current?.querySelectorAll(':scope > section')[order[id]];
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const materialItems = detail.material?.material_benchmark_details || [];
  const attendanceRecords = detail.attendance.records || [];
  const citizenRecords = detail.citizen_feedback.records || [];

  const handleStatusReview = async (submissionId: string, newStatus: string) => {
    setReviewingId(submissionId);
    setReviewSuccess('');
    try {
      await reviewCitizenEvidence(submissionId, newStatus, 'Status updated via Implementing Officer Action Center');
      setReviewSuccess(`Record ${submissionId} marked as ${newStatus}`);
      setTimeout(() => setReviewSuccess(''), 4000);
      onRefreshDetail?.();
    } catch (err: any) {
      alert(`Unable to update review status: ${err?.message || 'Error occurred'}`);
    } finally {
      setReviewingId(null);
    }
  };

  const actions = [
    'Mark for Field Verification',
    'Request Supporting Documents',
    'Review Material Evidence',
    'Review Attendance',
    'Review Citizen Complaint',
    'Mark as Reviewed',
  ];

  return (
    <div ref={rootRef} className="p-4 md:p-6 space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Return to priority work review
      </button>

      {/* Header Banner with Work Risk Link Button */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
        <div className="flex flex-col justify-between gap-5 lg:flex-row">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
                Project Monitoring — 360° Evidence &amp; Compliance Center
              </p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                {work.work_id}
              </span>
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                <MapPin className="mr-1 inline h-3.5 w-3.5" />
                {work.state || work.State} · {work.constituency || work.Constituency}
              </span>
              <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {work.work_status || 'Status unavailable'}
              </span>
            </div>

            <h1 className="mt-4 max-w-4xl text-lg font-black leading-snug text-slate-900 dark:text-slate-100">
              {work.description || 'Project description unavailable'}
            </h1>

            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Category: {work.work_category || 'Not available'} · Analytical result:{' '}
              <strong className="text-slate-700 dark:text-slate-200">{work.overall_risk_level || 'UNASSESSED'}</strong> · Officer review:{' '}
              <strong className="text-slate-700 dark:text-slate-200">{detail.officer_review.status}</strong>
            </p>

            {/* HIGH VISIBILITY ACTION BUTTONS: Respected Work Risk Profile & Live Field Capture */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {onSelectWork && (
                <button
                  type="button"
                  onClick={() => onSelectWork(work.work_id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white shadow hover:bg-indigo-700 transition"
                  title="Navigate to respected work analytical risk details"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Respected Work Risk Profile ↗
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEvidenceInitialRole('officer_inspection');
                  setIsEvidenceModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow hover:bg-emerald-700 transition"
              >
                <Camera className="h-4 w-4" />
                📸 Record Live Field Inspection
              </button>
              <button
                type="button"
                onClick={() => {
                  setEvidenceInitialRole('contractor_attendance');
                  setIsEvidenceModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <HardHat className="h-4 w-4 text-amber-600" />
                Log Contractor Attendance Headcount
              </button>
            </div>
          </div>

          <div className="self-start rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 text-center dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Composite Risk Score
            </p>
            <p className="mt-1 text-3xl font-black text-slate-900 dark:text-slate-100">
              {Number(work.composite_risk_score ?? (work as any).overall_risk_score ?? 0).toFixed(1)}
            </p>
            <div className="mt-2">
              <RiskBadge
                level={work.overall_risk_level || (work as any).overall_risk}
                score={Number(work.composite_risk_score ?? (work as any).overall_risk_score ?? 0)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Anchor Navigation */}
      <nav className="sticky top-2 z-10 flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-[#0f172a]/95">
        {[
          ['risk-summary', 'Risk summary'],
          ['evidence', 'Field Evidence & Attendance'],
          ['financial', 'Financial'],
          ['material', 'Material'],
          ['compliance', 'Compliance'],
          ['schedule', 'Schedule'],
          ['duplicates', 'Duplicates'],
          ['actions', 'Actions'],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => jumpTo(id)}
            className="whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Review Success Notification */}
      {reviewSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {reviewSuccess}
        </div>
      )}

      {/* Risk Summary Component Bars */}
      <section id="risk-summary" className="grid gap-4 lg:grid-cols-4">
        {detail.risk_components.map((component) => (
          <ScoreBar key={component.key} label={component.label} score={component.score} source={component.source} />
        ))}
      </section>

      {/* Evidence & Action Center */}
      <section className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Cross-module evidence summary</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Independent analytical indicators that require officer verification.
          </p>
          {detail.evidence_summary.length ? (
            <ul className="mt-4 space-y-3">
              {detail.evidence_summary.map((signal) => (
                <li
                  key={signal.key}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{signal.label}</span>
                    <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                      {signal.score.toFixed(1)} / 100
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{signal.explanation}</p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Suggested verification: {signal.recommended_action}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              No component score meets the review threshold in the currently available analytical data.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Officer action center</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Statutory officer audit and log operations.</p>
          <div className="mt-4 space-y-2">
            {actions.map((action) => (
              <button
                key={action}
                onClick={() => onAction(action)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {action}
              </button>
            ))}
          </div>
          {actionNotice && <div className="mt-3"><DataWarning>{actionNotice}</DataWarning></div>}
        </div>
      </section>

      {/* MODULE: ATTENDANCE & CITIZEN FEEDBACK (Elevated with Respected Fields) */}
      <section id="evidence" className="grid gap-5">
        <ModuleCard
          title="Attendance, Citizen Feedback & Field Verification Records"
          icon={<Users className="h-4 w-4 text-emerald-600" />}
        >
          <div className="space-y-6">
            {/* Field A: Contractor Attendance & Labor Headcount Field */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/80 pb-3 dark:border-amber-900/40">
                <div>
                  <div className="flex items-center gap-2">
                    <HardHat className="h-4 w-4 text-amber-600" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-950 dark:text-amber-100">
                      Contractor Daily Attendance &amp; Labor Headcount Field
                    </h3>
                  </div>
                  <p className="mt-0.5 text-[11px] text-amber-900/80 dark:text-amber-200/80">
                    Live camera worker headcount captures submitted by contractors and verified on site.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                    {attendanceRecords.length} records stored
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEvidenceInitialRole('contractor_attendance');
                      setIsEvidenceModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-amber-700"
                  >
                    <Camera className="h-3 w-3" /> + Log Attendance
                  </button>
                </div>
              </div>

              {attendanceRecords.length ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {attendanceRecords.map((record: AttendanceRecord) => (
                    <article
                      key={record.attendance_id}
                      className="flex flex-col justify-between overflow-hidden rounded-xl border border-amber-200 bg-white p-3 shadow-sm dark:border-amber-800/60 dark:bg-slate-900"
                    >
                      <div>
                        {/* Image Preview with click to zoom */}
                        <div
                          className="relative h-36 w-full cursor-pointer overflow-hidden rounded-lg bg-slate-950 group"
                          onClick={() =>
                            setSelectedPhoto({
                              src: record.image_reference,
                              title: `Attendance Capture (${record.staff_count} Staff)`,
                              meta: `Work ID: ${record.work_id} · Captured: ${new Date(record.captured_at).toLocaleString()}`,
                            })
                          }
                        >
                          <img
                            src={record.image_reference}
                            alt={`Attendance ${record.attendance_id}`}
                            className="h-full w-full object-cover transition group-hover:scale-105"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-bold text-white">
                              <Eye className="h-3 w-3" /> View Full
                            </span>
                          </div>
                          <div className="absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                            ● Live Camera
                          </div>
                        </div>

                        {/* Metadata details */}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900 dark:bg-amber-950/70 dark:text-amber-200">
                            👷 {record.staff_count} Workers on site
                          </span>
                          <span
                            className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                              record.review_status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : record.review_status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {record.review_status.replaceAll('_', ' ')}
                          </span>
                        </div>

                        {record.latitude != null && record.longitude != null && (
                          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                            <MapPin className="h-3 w-3 text-emerald-600" />
                            <span className="font-mono">
                              {Number(record.latitude).toFixed(5)}, {Number(record.longitude).toFixed(5)}
                            </span>
                            <a
                              href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-auto text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              Maps ↗
                            </a>
                          </div>
                        )}

                        {record.notes && (
                          <p className="mt-2 text-[11px] text-slate-600 line-clamp-2 dark:text-slate-300">
                            {record.notes}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">
                          {new Date(record.captured_at).toLocaleString()}
                        </p>
                      </div>

                      {/* Review Buttons */}
                      <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleStatusReview(record.attendance_id.replace('att_sync_', ''), 'VERIFIED')}
                          disabled={reviewingId === record.attendance_id.replace('att_sync_', '')}
                          className="flex-1 rounded-lg border border-emerald-300 bg-emerald-50 py-1 text-center text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusReview(record.attendance_id.replace('att_sync_', ''), 'UNDER_REVIEW')}
                          disabled={reviewingId === record.attendance_id.replace('att_sync_', '')}
                          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-1 text-center text-[10px] font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusReview(record.attendance_id.replace('att_sync_', ''), 'REJECTED')}
                          disabled={reviewingId === record.attendance_id.replace('att_sync_', '')}
                          className="flex-1 rounded-lg border border-rose-300 bg-rose-50 py-1 text-center text-[10px] font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <DataWarning>
                    {detail.attendance.warning || 'No contractor attendance record is currently associated with this canonical Work ID.'}
                  </DataWarning>
                </div>
              )}
            </div>

            {/* Field B: Citizen Evidence & Feedback Field */}
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-200/80 pb-3 dark:border-indigo-900/40">
                <div>
                  <div className="flex items-center gap-2">
                    <MessageSquareWarning className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-indigo-950 dark:text-indigo-100">
                      Citizen Evidence &amp; Compliance Review Field
                    </h3>
                  </div>
                  <p className="mt-0.5 text-[11px] text-indigo-900/80 dark:text-indigo-200/80">
                    Live camera photographic proofs and observations submitted by community members.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-200">
                    {citizenRecords.length} submissions stored
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEvidenceInitialRole('citizen');
                      setIsEvidenceModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <Camera className="h-3 w-3" /> + Submit Proof
                  </button>
                </div>
              </div>

              {citizenRecords.length ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {citizenRecords.map((record: CitizenEvidenceRecord) => (
                    <article
                      key={record.submission_id}
                      className="flex flex-col justify-between overflow-hidden rounded-xl border border-indigo-200 bg-white p-3 shadow-sm dark:border-indigo-800/60 dark:bg-slate-900"
                    >
                      <div>
                        {/* Image preview */}
                        <div
                          className="relative h-36 w-full cursor-pointer overflow-hidden rounded-lg bg-slate-950 group"
                          onClick={() =>
                            setSelectedPhoto({
                              src: record.image_reference || '',
                              title: `${record.category} (Citizen Observation)`,
                              meta: `Work ID: ${record.work_id} · Submission ID: ${record.submission_id}`,
                            })
                          }
                        >
                          {record.image_reference ? (
                            <img
                              src={record.image_reference}
                              alt={`Citizen Evidence ${record.submission_id}`}
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-slate-500">
                              No image attached
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-bold text-white">
                              <Eye className="h-3 w-3" /> View Stamped Proof
                            </span>
                          </div>
                          <div className="absolute left-2 top-2 rounded bg-slate-950/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                            ● Live Capture
                          </div>
                        </div>

                        {/* Category & Status */}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                            {record.category}
                          </span>
                          <span
                            className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${
                              record.review_status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : record.review_status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {record.review_status.replaceAll('_', ' ')}
                          </span>
                        </div>

                        {/* Citizen observation text */}
                        <p className="mt-2 text-xs italic text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200 line-clamp-3 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                          "{record.description}"
                        </p>

                        {/* Proximity / Location Info */}
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-emerald-600" />
                            {record.distance_from_work != null ? `${Math.round(record.distance_from_work)}m from work` : 'Device GPS logged'}
                          </span>
                          {record.latitude != null && record.longitude != null && (
                            <a
                              href={`https://www.google.com/maps?q=${record.latitude},${record.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              Maps ↗
                            </a>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {record.captured_at ? new Date(record.captured_at).toLocaleString() : 'Live capture'}
                        </p>
                      </div>

                      {/* Review Buttons */}
                      <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleStatusReview(record.submission_id, 'VERIFIED')}
                          disabled={reviewingId === record.submission_id}
                          className="flex-1 rounded-lg border border-emerald-300 bg-emerald-50 py-1 text-center text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusReview(record.submission_id, 'UNDER_REVIEW')}
                          disabled={reviewingId === record.submission_id}
                          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-1 text-center text-[10px] font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          Review
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusReview(record.submission_id, 'REJECTED')}
                          disabled={reviewingId === record.submission_id}
                          className="flex-1 rounded-lg border border-rose-300 bg-rose-50 py-1 text-center text-[10px] font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <DataWarning>
                    {detail.citizen_feedback.warning || 'No citizen evidence is currently associated with this canonical Work ID.'}
                  </DataWarning>
                </div>
              )}
            </div>
          </div>
        </ModuleCard>
      </section>

      {/* Financial & Schedule Modules */}
      <section className="grid gap-5 lg:grid-cols-2">
        <ModuleCard title="Financial analysis" icon={<WalletCards className="h-4 w-4" />}>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Sanction amount" value={money(work.sanction_amount)} />
            <Metric label="Effective expenditure" value={money(work.effective_expenditure)} />
            <Metric label="Peer median" value={money(work.peer_median || work.peer_group_median)} />
            <Metric label="Peer ratio" value={work.amount_to_peer_ratio?.toFixed(2) || 'Not available'} />
            <Metric label="Payment count" value={String(work.payment_count ?? 'Not available')} />
            <Metric label="Financial risk" value={`${Number(work.financial_risk_score || 0).toFixed(1)} / 100`} />
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {work.financial_explanation || 'No financial explanation is available.'}
          </p>
        </ModuleCard>

        <ModuleCard title="Schedule / progress monitoring" icon={<Clock3 className="h-4 w-4" />}>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="Sanction date" value={work.sanction_date || 'Not available'} />
            <Metric label="Expected completion" value={work.estimated_completion_date || 'Not available'} />
            <Metric
              label="Expected progress"
              value={work.expected_timeline_progress_pct !== undefined ? `${work.expected_timeline_progress_pct}%` : 'Not available'}
            />
            <Metric
              label="Expenditure progress"
              value={work.expenditure_progress_pct !== undefined ? `${work.expenditure_progress_pct}%` : 'Not available'}
            />
            <Metric
              label="Progress gap"
              value={work.progress_gap_pct !== undefined ? `${work.progress_gap_pct}%` : 'Not available'}
            />
            <Metric label="Schedule risk" value={`${Number(work.schedule_risk_score || 0).toFixed(1)} / 100`} />
          </dl>
          {!work.sanction_date || !work.estimated_completion_date ? (
            <div className="mt-4">
              <DataWarning>Timeline information is incomplete. Do not infer a definite delay without the missing dates.</DataWarning>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">
              Schedule indicator:{' '}
              <strong>{Number(work.schedule_risk_score || 0) >= 35 ? 'REQUIRES REVIEW' : 'Standard monitoring'}</strong>
            </p>
          )}
        </ModuleCard>
      </section>

      {/* Material & Benchmark Context */}
      <section className="grid gap-5 lg:grid-cols-2">
        <ModuleCard title="Material quality & price context" icon={<Scale className="h-4 w-4" />}>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Observed description → rule-based inference → externally referenced benchmark. This is not laboratory quality confirmation.
          </p>
          {detail.material_warning && (
            <div className="mt-3">
              <DataWarning>{detail.material_warning}</DataWarning>
            </div>
          )}
          {materialItems.length ? (
            <div className="mt-4 space-y-3">
              {materialItems.map((item: any) => (
                <div key={item.material} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="flex justify-between gap-3">
                    <strong className="text-slate-800 dark:text-slate-200">{item.material}</strong>
                    <span className="font-bold text-slate-600 dark:text-slate-400">
                      {item.source === 'EXPLICIT' ? 'Observed in description' : 'AI-inferred from work type'}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    Reference: {item.benchmark_price ? money(item.benchmark_price) + ' / ' + (item.benchmark_unit || 'unit') : 'No matching reference price'} · Quantity:{' '}
                    {item.quantity ? item.quantity + ' ' + (item.unit || '') : 'Not provided'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <DataWarning>
                Material specification or BOQ could not be verified from the available work data. Manual verification is required.
              </DataWarning>
            </div>
          )}
        </ModuleCard>

        <ModuleCard title={`Compliance monitoring (${detail.compliance_findings.length})`} icon={<ClipboardCheck className="h-4 w-4" />}>
          {detail.compliance_findings.length ? (
            <div className="space-y-3">
              {detail.compliance_findings.map((finding) => (
                <div key={finding.rule_id} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                  <div className="flex justify-between gap-3">
                    <strong>{finding.rule_id}: {finding.rule_name}</strong>
                    <span className="font-bold text-slate-600 dark:text-slate-400">{finding.status}</span>
                  </div>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">
                    {finding.what_happened || finding.supporting_details || 'No explanatory evidence is available for this rule.'}
                  </p>
                  <p className="mt-2 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
                    Requires verification: {finding.why_it_matters || 'Review underlying compliance evidence.'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No rule-level compliance findings are available for this work.</p>
          )}
        </ModuleCard>
      </section>

      {/* Duplicates and Traceability */}
      <section className="grid gap-5 lg:grid-cols-2">
        <ModuleCard title={`Potentially similar works (${detail.candidate_duplicates.length})`} icon={<Copy className="h-4 w-4" />}>
          {detail.candidate_duplicates.length ? (
            <div className="space-y-3">
              {detail.candidate_duplicates.map((candidate, index) => {
                const other = candidate.work_id_1 === work.work_id ? candidate.work_id_2 : candidate.work_id_1;
                const similarity = Number(candidate.similarity_score || 0);
                return (
                  <div key={`${other}-${index}`} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                    <strong className="font-mono text-slate-800 dark:text-slate-200">Candidate duplicate: {other}</strong>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      Similarity: {similarity.toFixed(1)}% · {candidate.nlp_explanation || 'Potentially similar work; officer review required.'}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No candidate duplicate result is associated with this Work ID.</p>
          )}
        </ModuleCard>

        <ModuleCard title="Evidence timeline & Traceability" icon={<CalendarClock className="h-4 w-4" />}>
          {detail.timeline.length ? (
            <ol className="space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-800">
              {detail.timeline.map((entry, index) => (
                <li key={`${entry.event}-${index}`} className="relative text-xs">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <strong className="text-slate-800 dark:text-slate-200">{entry.event}</strong>
                  <span className="ml-2 font-mono text-slate-500">{entry.date}</span>
                  <p className="mt-0.5 text-slate-500">
                    Source: {entry.source}
                    {entry.detail ? ` · ${entry.detail}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-slate-500">No dated monitoring events are available.</p>
          )}
        </ModuleCard>
      </section>

      {/* Modal for Live Field Evidence / Attendance Capture */}
      <CitizenEvidenceModal
        isOpen={isEvidenceModalOpen}
        work={work}
        initialRole={evidenceInitialRole}
        allowedRoles={
          evidenceInitialRole === 'contractor_attendance'
            ? ['contractor_attendance', 'contractor_progress']
            : ['citizen', 'officer_inspection']
        }
        onClose={() => setIsEvidenceModalOpen(false)}
        onSubmitted={() => {
          setIsEvidenceModalOpen(false);
          onRefreshDetail?.();
        }}
      />

      {/* Photo Zoom Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{selectedPhoto.title}</h3>
                {selectedPhoto.meta && <p className="text-[11px] text-slate-500 font-mono">{selectedPhoto.meta}</p>}
              </div>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-950 p-4 text-center">
              <img src={selectedPhoto.src} alt={selectedPhoto.title} className="mx-auto max-h-[75vh] object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className="mt-1 font-bold text-slate-800 dark:text-slate-200">{value}</dd>
  </div>
);

const ModuleCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
    <h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
      {icon}
      {title}
    </h2>
    <div className="mt-4">{children}</div>
  </section>
);
