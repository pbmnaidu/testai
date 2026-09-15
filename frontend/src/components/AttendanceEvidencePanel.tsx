import React, { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Clock3, MapPin, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { fetchAttendance } from '../services/api';
import { AttendanceRecord } from '../types';

interface AttendanceEvidencePanelProps {
  workId: string;
}

const locationLabel = (value: string) => {
  switch (value) {
    case 'WITHIN_EXPECTED_RADIUS': return 'Within expected radius';
    case 'OUTSIDE_EXPECTED_RADIUS': return 'Outside expected radius';
    case 'LOW_GPS_ACCURACY': return 'Low GPS accuracy';
    default: return 'Work coordinate unavailable';
  }
};

const locationTone = (value: string) => value === 'WITHIN_EXPECTED_RADIUS'
  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-300'
  : value === 'OUTSIDE_EXPECTED_RADIUS' || value === 'LOW_GPS_ACCURACY'
    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200'
    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';

export const AttendanceEvidencePanel: React.FC<AttendanceEvidencePanelProps> = ({ workId }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    fetchAttendance(workId).then((response) => {
      setRecords(response.records);
      setLoading(false);
    }).catch(() => {
      setError('Attendance evidence could not be loaded.');
      setLoading(false);
    });
  };

  useEffect(load, [workId]);

  const summary = useMemo(() => ({
    submissions: records.length,
    staff: records.reduce((sum, record) => sum + Number(record.staff_count || 0), 0),
    within: records.filter((record) => record.location_validation_status === 'WITHIN_EXPECTED_RADIUS').length,
    pending: records.filter((record) => !['VERIFIED', 'REJECTED'].includes(record.review_status)).length,
  }), [records]);

  return <section className="attendance-officer-panel mt-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/15"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Attendance evidence · Officer review</h3><p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">These records came from the contractor camera flow and are linked to this complete Work ID. GPS status is a review signal, not automatic proof that every person worked.</p></div><button type="button" onClick={load} className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className="h-3 w-3" /> Refresh</button></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-amber-100 bg-white p-3 dark:border-amber-900/50 dark:bg-slate-900"><span className="block text-[10px] font-bold uppercase text-slate-500">Captures</span><strong className="mt-1 block font-mono text-lg text-slate-900 dark:text-slate-100">{summary.submissions}</strong></div><div className="rounded-xl border border-amber-100 bg-white p-3 dark:border-amber-900/50 dark:bg-slate-900"><span className="block text-[10px] font-bold uppercase text-slate-500">Staff reported</span><strong className="mt-1 block font-mono text-lg text-amber-700 dark:text-amber-300">{summary.staff}</strong></div><div className="rounded-xl border border-amber-100 bg-white p-3 dark:border-amber-900/50 dark:bg-slate-900"><span className="block text-[10px] font-bold uppercase text-slate-500">Within radius</span><strong className="mt-1 block font-mono text-lg text-emerald-700 dark:text-emerald-300">{summary.within}</strong></div><div className="rounded-xl border border-amber-100 bg-white p-3 dark:border-amber-900/50 dark:bg-slate-900"><span className="block text-[10px] font-bold uppercase text-slate-500">Pending review</span><strong className="mt-1 block font-mono text-lg text-indigo-700 dark:text-indigo-300">{summary.pending}</strong></div></div>{loading && <div className="flex items-center justify-center gap-2 p-8 text-xs font-semibold text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading attendance evidence…</div>}{!loading && error && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}{!loading && !error && records.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-amber-200 bg-white/70 p-8 text-center text-xs text-slate-500 dark:border-amber-900/60 dark:bg-slate-900/40">No contractor attendance capture has been submitted for this work yet.</div>}{!loading && records.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{records.map((record) => <article key={record.attendance_id} className="rounded-2xl border border-amber-100 bg-white p-3 dark:border-amber-900/60 dark:bg-slate-900/70"><div className="flex gap-3"><div className="h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-950">{record.image_reference ? <img src={record.image_reference} alt={`Attendance evidence ${record.attendance_id}`} className="h-full w-full object-cover" /> : <Camera className="m-10 h-6 w-6 text-slate-400" />}</div><div className="min-w-0"><div className="font-mono text-[10px] font-black text-slate-900 dark:text-slate-100">{record.attendance_id}</div><div className="mt-1 flex items-center gap-1.5 text-amber-700 dark:text-amber-300"><Users className="h-3.5 w-3.5" /><strong className="text-sm">{record.staff_count}</strong><span className="text-[10px] font-bold">staff reported</span></div><div className="mt-2 text-[10px] font-black uppercase text-slate-500">{record.review_status.replaceAll('_', ' ')}</div><span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-bold ${locationTone(record.location_validation_status)}`}><MapPin className="h-3 w-3" /> {locationLabel(record.location_validation_status)}</span></div></div><div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-[10px] text-slate-600 dark:border-slate-800 dark:text-slate-400"><div className="flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> {new Date(record.captured_at).toLocaleString()}</div><div className="font-mono">GPS {Number(record.latitude).toFixed(6)}, {Number(record.longitude).toFixed(6)}{record.gps_accuracy == null ? '' : ` · ±${Math.round(Number(record.gps_accuracy))} m`}</div>{record.distance_from_work != null && <div>{Math.round(record.distance_from_work)} m from published work coordinate</div>}<div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Live camera capture · image hash recorded</div></div></article>)}</div>}</section>;
};

export default AttendanceEvidencePanel;
