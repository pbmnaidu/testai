import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Image as ImageIcon, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { fetchCitizenEvidence, reviewCitizenEvidence } from '../services/api';
import { CitizenEvidenceRecord } from '../types';

interface CitizenEvidenceReviewPanelProps {
  workId: string;
}

const locationLabel = (value: string) => {
  switch (value) {
    case 'WITHIN_EXPECTED_RADIUS': return 'Within expected radius';
    case 'OUTSIDE_EXPECTED_RADIUS': return 'Outside expected radius';
    case 'LOW_GPS_ACCURACY': return 'Low GPS accuracy';
    default: return 'Location not captured live';
  }
};

const locationTone = (value: string) => value === 'WITHIN_EXPECTED_RADIUS'
  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300'
  : value === 'OUTSIDE_EXPECTED_RADIUS' || value === 'LOW_GPS_ACCURACY'
    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';

const reviewTone = (value: string) => value === 'VERIFIED'
  ? 'text-emerald-700 dark:text-emerald-300'
  : value === 'REJECTED'
    ? 'text-rose-700 dark:text-rose-300'
    : 'text-amber-700 dark:text-amber-300';

export const CitizenEvidenceReviewPanel: React.FC<CitizenEvidenceReviewPanelProps> = ({ workId }) => {
  const [records, setRecords] = useState<CitizenEvidenceRecord[]>([]);
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [officerToken, setOfficerToken] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchCitizenEvidence(workId, { sort_by: sortBy, limit: 200 }).then((response) => {
      setRecords(response.records);
      setLoading(false);
    }).catch(() => {
      setError('Citizen evidence could not be loaded.');
      setLoading(false);
    });
  };

  useEffect(load, [workId, sortBy]);

  const summary = useMemo(() => ({
    total: records.length,
    within: records.filter((record) => record.location_validation_status === 'WITHIN_EXPECTED_RADIUS').length,
    outside: records.filter((record) => record.location_validation_status === 'OUTSIDE_EXPECTED_RADIUS').length,
    pending: records.filter((record) => !['VERIFIED', 'REJECTED'].includes(record.review_status)).length,
  }), [records]);

  const saveReview = async (record: CitizenEvidenceRecord, status: string) => {
    setSavingId(record.submission_id);
    try {
      let updated: CitizenEvidenceRecord;
      try {
        updated = await reviewCitizenEvidence(record.submission_id, status, reviewComment, officerToken);
      } catch (reviewError) {
        if (officerToken || !(reviewError instanceof Error) || !reviewError.message.toLowerCase().includes('authorization')) throw reviewError;
        const enteredToken = window.prompt('Officer authorization token configured for this deployment:')?.trim() || '';
        if (!enteredToken) throw reviewError;
        setOfficerToken(enteredToken);
        updated = await reviewCitizenEvidence(record.submission_id, status, reviewComment, enteredToken);
      }
      setRecords((current) => current.map((item) => item.submission_id === updated.submission_id ? updated : item));
      setReviewingId(null);
      setReviewComment('');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Review update failed.');
    } finally {
      setSavingId(null);
    }
  };

  return <section className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm dark:border-indigo-900/70 dark:bg-indigo-950/15"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Citizen Evidence · Officer Review</h3><p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">Citizen submissions are evidence records linked to this Work ID. A matching GPS position supports location context; it does not confirm an allegation or automatically create a fraud finding.</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Sort citizen evidence" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="category">Category</option><option value="location_mismatch">Location mismatch</option><option value="gps_accuracy">GPS accuracy</option></select><button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className="h-3 w-3" /> Refresh</button></div></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-indigo-100 bg-white p-3 dark:border-indigo-900/50 dark:bg-slate-900/60"><span className="block text-[10px] font-bold uppercase text-slate-500">Total submissions</span><strong className="mt-1 block font-mono text-lg text-slate-900 dark:text-slate-100">{summary.total}</strong></div><div className="rounded-xl border border-indigo-100 bg-white p-3 dark:border-indigo-900/50 dark:bg-slate-900/60"><span className="block text-[10px] font-bold uppercase text-slate-500">Within radius</span><strong className="mt-1 block font-mono text-lg text-emerald-700 dark:text-emerald-300">{summary.within}</strong></div><div className="rounded-xl border border-indigo-100 bg-white p-3 dark:border-indigo-900/50 dark:bg-slate-900/60"><span className="block text-[10px] font-bold uppercase text-slate-500">Outside radius</span><strong className="mt-1 block font-mono text-lg text-amber-700 dark:text-amber-300">{summary.outside}</strong></div><div className="rounded-xl border border-indigo-100 bg-white p-3 dark:border-indigo-900/50 dark:bg-slate-900/60"><span className="block text-[10px] font-bold uppercase text-slate-500">Needs review</span><strong className="mt-1 block font-mono text-lg text-indigo-700 dark:text-indigo-300">{summary.pending}</strong></div></div>{loading && <div className="flex items-center justify-center gap-2 p-8 text-xs font-semibold text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading citizen evidence…</div>}{!loading && error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}{!loading && !error && records.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-indigo-200 bg-white/60 p-8 text-center text-xs text-slate-500 dark:border-indigo-900/60 dark:bg-slate-900/40">No citizen evidence has been submitted for this work yet.</div>}{!loading && records.length > 0 && <div className="mt-4 space-y-3">{records.map((record) => <article key={record.submission_id} className="rounded-2xl border border-indigo-100 bg-white p-4 dark:border-indigo-900/60 dark:bg-slate-900/70"><div className="flex flex-col gap-4 md:flex-row"><div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 md:w-44 dark:border-slate-700 dark:bg-slate-950">{record.image_reference ? <img src={record.image_reference} alt={`Citizen evidence for ${record.work_id}`} className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-slate-900 dark:text-slate-100">{record.submission_id}</span><span className={`text-[10px] font-black uppercase ${reviewTone(record.review_status)}`}>{record.review_status.replaceAll('_', ' ')}</span>{record.duplicate_flag && <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Similar image flag</span>}</div><h4 className="mt-2 text-xs font-black text-slate-900 dark:text-slate-100">{record.category}</h4><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">{record.description}</p><div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold"><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${locationTone(record.location_validation_status)}`}><MapPin className="h-3 w-3" /> {locationLabel(record.location_validation_status)}</span>{record.distance_from_work != null && <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{Math.round(record.distance_from_work)} m from work</span>}<span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><Clock3 className="h-3 w-3" /> {record.captured_at ? new Date(record.captured_at).toLocaleString() : 'Not captured live'}</span></div><div className="mt-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">GPS {record.latitude == null ? 'not captured' : `${Number(record.latitude).toFixed(6)}, ${Number(record.longitude).toFixed(6)} · ±${record.gps_accuracy == null ? '—' : Math.round(Number(record.gps_accuracy))} m`}</div></div></div>{reviewingId === record.submission_id && <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800/70 dark:bg-indigo-950/25"><label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-800 dark:text-indigo-200" htmlFor={`review-comment-${record.submission_id}`}>Review comment<textarea id={`review-comment-${record.submission_id}`} rows={2} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Record the basis for this review decision" className="mt-2 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-indigo-800 dark:bg-slate-900 dark:text-slate-100" /></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={savingId === record.submission_id} onClick={() => saveReview(record, 'UNDER_REVIEW')} className="rounded-lg border border-indigo-300 bg-white px-2.5 py-2 text-[10px] font-bold text-indigo-800 dark:border-indigo-700 dark:bg-slate-900 dark:text-indigo-200">Under review</button><button type="button" disabled={savingId === record.submission_id} onClick={() => saveReview(record, 'VERIFIED')} className="rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white">Verified</button><button type="button" disabled={savingId === record.submission_id} onClick={() => saveReview(record, 'NEEDS_MORE_INFORMATION')} className="rounded-lg bg-amber-600 px-2.5 py-2 text-[10px] font-bold text-white">Needs information</button><button type="button" disabled={savingId === record.submission_id} onClick={() => saveReview(record, 'REJECTED')} className="rounded-lg bg-rose-600 px-2.5 py-2 text-[10px] font-bold text-white">Rejected</button></div></div>}{reviewingId !== record.submission_id && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"><span className="text-[10px] text-slate-500">Submitted {new Date(record.uploaded_at).toLocaleString()}</span><button type="button" onClick={() => { setReviewingId(record.submission_id); setReviewComment(record.review_comment || ''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{record.review_status === 'SUBMITTED' ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />} Review submission</button></div>}</article>)}</div>}</section>;
};

export default CitizenEvidenceReviewPanel;
