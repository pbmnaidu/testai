import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { fetchCitizenEvidenceStats, fetchCitizenWorks } from '../services/api';
import { CitizenEvidenceConfig, CitizenEvidenceRecord, PublicWorkRecord } from '../types';
import CitizenEvidenceModal from '../components/CitizenEvidenceModal';
import CitizenLeafletMap from '../components/CitizenLeafletMap';

const emptyConfig: CitizenEvidenceConfig = {
  gps_accuracy_threshold_meters: 50,
  allowed_evidence_radius_meters: 250,
  max_upload_bytes: 10 * 1024 * 1024,
  allowed_categories: [],
};

const statusLabel = (value: string) => {
  switch (value) {
    case 'ONGOING': return 'Ongoing Work';
    case 'COMPLETED': return 'Completed Work';
    case 'NOT_STARTED': return 'Not Started';
    default: return 'Other Status';
  }
};

const statusIcon = (value: string) => value === 'COMPLETED' ? '●' : value === 'ONGOING' ? '◆' : value === 'NOT_STARTED' ? '○' : '•';

const money = (value?: number) => {
  if (value == null || !Number.isFinite(Number(value))) return 'Not published';
  return `₹${(Number(value) / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} lakh`;
};

const dateValue = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not published';

export const CitizenProtocolPage: React.FC = () => {
  const [records, setRecords] = useState<PublicWorkRecord[]>([]);
  const [stats, setStats] = useState<{ total_works: number; ongoing_works: number; completed_works: number; works_with_coordinates: number; citizen_evidence: number; categories: string[] }>({ total_works: 0, ongoing_works: 0, completed_works: 0, works_with_coordinates: 0, citizen_evidence: 0, categories: [] });
  const [config, setConfig] = useState<CitizenEvidenceConfig>(emptyConfig);
  const [evidenceStats, setEvidenceStats] = useState<{ total_submissions: number; submitted_today: number; submitted_this_week: number; within_expected_radius: number; needs_review: number; outside_expected_radius: number; categories: Record<string, number> }>({ total_submissions: 0, submitted_today: 0, submitted_this_week: 0, within_expected_radius: 0, needs_review: 0, outside_expected_radius: 0, categories: {} });
  const [selectedWork, setSelectedWork] = useState<PublicWorkRecord | null>(null);
  const [status, setStatus] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  const [nearby, setNearby] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyError, setNearbyError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    const params: Parameters<typeof fetchCitizenWorks>[0] = { limit: 250, status, category, search: search.trim() || undefined };
    if (nearby) Object.assign(params, { latitude: nearby.latitude, longitude: nearby.longitude, nearby_radius_meters: 25000 });
    Promise.all([fetchCitizenWorks(params), fetchCitizenEvidenceStats()]).then(([workResponse, evidenceResponse]) => {
      if (!active) return;
      setRecords(workResponse.records);
      setStats(workResponse.stats);
      setConfig(workResponse.config || emptyConfig);
      setEvidenceStats(evidenceResponse);
      setSelectedWork((current) => current && workResponse.records.some((record: PublicWorkRecord) => record.work_id === current.work_id) ? workResponse.records.find((record: PublicWorkRecord) => record.work_id === current.work_id) || current : workResponse.records[0] || null);
      setIsLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Unable to load the public work register right now. Please retry.');
      setIsLoading(false);
    });
    return () => { active = false; };
  }, [status, category, search, nearby, refreshToken]);

  const categories = useMemo(() => (stats.categories || []).length ? (stats.categories || []) : Array.from(new Set(records.map((record) => record.work_category).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [records, stats.categories]);

  const useMyArea = () => {
    if (!navigator.geolocation) {
      setNearbyError('This browser does not provide location capability.');
      return;
    }
    setNearbyError('');
    navigator.geolocation.getCurrentPosition((position) => setNearby({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => setNearbyError('Unable to obtain your location. Nearby search was not enabled.'));
  };

  const handleSubmitted = (_record: CitizenEvidenceRecord) => {
    setRefreshToken((value) => value + 1);
  };

  return <div className="citizen-protocol-page space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" /> Citizen verification / proof protocol</div><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Document what you see. Let officers verify it.</h1><p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">Find an MPLADS work near you, open its published details, and submit a geo-tagged observation. A citizen report remains an observation until an authorized officer reviews the evidence.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setRefreshToken((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" /> Refresh register</button><span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> No automatic fraud labels</span></div></header>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"><div className="citizen-stat-card"><span>MPLADS works</span><strong>{stats.total_works.toLocaleString()}</strong><small>Public work register</small></div><div className="citizen-stat-card"><span>Ongoing</span><strong className="text-emerald-700 dark:text-emerald-400">{stats.ongoing_works.toLocaleString()}</strong><small>Current work status</small></div><div className="citizen-stat-card"><span>Completed</span><strong className="text-sky-700 dark:text-sky-400">{stats.completed_works.toLocaleString()}</strong><small>Current work status</small></div><div className="citizen-stat-card"><span>Citizen evidence</span><strong className="text-indigo-700 dark:text-indigo-400">{evidenceStats.total_submissions.toLocaleString()}</strong><small>{evidenceStats.needs_review.toLocaleString()} pending review</small></div><div className="citizen-stat-card col-span-2 sm:col-span-1"><span>Map positions</span><strong>{stats.works_with_coordinates.toLocaleString()}</strong><small>Published coordinates only</small></div></div>

    <section className="citizen-protocol-layout"><aside className="citizen-work-browser"><div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><SlidersHorizontal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> Find a work</h2><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Search by Work ID, constituency, category, or description.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{records.length} shown</span></div><div className="mt-4 space-y-2"><label className="relative block"><span className="sr-only">Search works</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Work ID or description" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-xs text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label><div className="grid grid-cols-2 gap-2"><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter work status" className="rounded-xl border border-slate-300 px-2.5 py-2 text-[11px] font-bold dark:border-slate-700"><option value="ALL">All statuses</option><option value="ONGOING">Ongoing</option><option value="COMPLETED">Completed</option><option value="NOT_STARTED">Not started</option><option value="OTHER">Other</option></select><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter work category" className="rounded-xl border border-slate-300 px-2.5 py-2 text-[11px] font-bold dark:border-slate-700"><option value="ALL">All categories</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={useMyArea} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-bold ${nearby ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}><LocateFixed className="h-3.5 w-3.5" /> {nearby ? 'Nearby enabled' : 'Use my area'}</button>{nearby && <button type="button" onClick={() => setNearby(null)} className="text-[10px] font-bold text-slate-500 underline">Clear area</button>}</div>{nearbyError && <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300">{nearbyError}</p>}</div><div className="citizen-work-list mt-4" aria-live="polite">{isLoading && <div className="flex items-center justify-center gap-2 p-8 text-xs font-semibold text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading public works…</div>}{!isLoading && error && <div className="p-5 text-center text-xs font-semibold text-rose-700 dark:text-rose-300">{error}</div>}{!isLoading && !error && records.length === 0 && <div className="p-6 text-center text-xs text-slate-500">No works match these filters.</div>}{!isLoading && !error && records.map((record) => <button type="button" key={record.work_id} onClick={() => setSelectedWork(record)} className={`citizen-work-row ${selectedWork?.work_id === record.work_id ? 'citizen-work-row--selected' : ''}`}><span className={`citizen-status-symbol citizen-status-symbol--${record.normalized_status.toLowerCase()}`} aria-hidden="true">{statusIcon(record.normalized_status)}</span><span className="min-w-0 flex-1 text-left"><span className="block truncate font-mono text-[10px] font-black text-slate-900 dark:text-slate-100">{record.work_id}</span><span className="mt-1 block line-clamp-2 text-[11px] font-semibold leading-relaxed text-slate-700 dark:text-slate-300">{record.description || 'Description not published'}</span><span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{statusLabel(record.normalized_status)} · {record.constituency || 'Constituency not published'}</span></span>{record.coordinate_available && <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Published map coordinate" />}</button>)}</div></aside>

      <div className="citizen-map-column"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Public works GIS view</h2><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Leaflet map of existing published work coordinates; select a marker to inspect the public record.</p></div><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{stats.works_with_coordinates} positioned works</span></div><CitizenLeafletMap records={records} selectedId={selectedWork?.work_id} onSelect={setSelectedWork} />{selectedWork ? <section className="citizen-work-detail" aria-label="Selected work details"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">{selectedWork.work_id}</span><span className="citizen-status-pill"><span aria-hidden="true">{statusIcon(selectedWork.normalized_status)}</span> {statusLabel(selectedWork.normalized_status)}</span></div><h3 className="mt-3 text-base font-black leading-relaxed text-slate-900 dark:text-slate-100">{selectedWork.description || 'Work description not published'}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedWork.state || 'State not published'} · {selectedWork.constituency || 'Constituency not published'} · {selectedWork.work_category || 'Category not published'}</p></div><button type="button" onClick={() => setIsEvidenceOpen(true)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow-sm hover:bg-emerald-700"><Camera className="h-4 w-4" /> Submit Proof</button></div><dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-200 pt-4 sm:grid-cols-4 dark:border-slate-700"><div><dt>Sanctioned amount</dt><dd>{money(selectedWork.sanction_amount)}</dd></div><div><dt>Progress signal</dt><dd>{selectedWork.progress_pct == null ? 'Not published' : `${Number(selectedWork.progress_pct).toFixed(1)}% expenditure progress`}</dd></div><div><dt>Start / sanction date</dt><dd>{dateValue(selectedWork.sanction_date || selectedWork.recommended_date)}</dd></div><div><dt>Completion date</dt><dd>{dateValue(selectedWork.completion_date || selectedWork.estimated_completion_date)}</dd></div><div><dt>Public owner / MP</dt><dd>{selectedWork.mp_name || 'Not published'}</dd></div><div><dt>Published location</dt><dd className="font-mono">{selectedWork.coordinate_available ? `${Number(selectedWork.latitude).toFixed(5)}, ${Number(selectedWork.longitude).toFixed(5)}` : 'Not available'}</dd></div><div><dt>Location source</dt><dd>{selectedWork.coordinate_source || 'No coordinate published'}</dd></div><div><dt>Citizen evidence</dt><dd>{selectedWork.citizen_evidence_count.toLocaleString()} submission{selectedWork.citizen_evidence_count === 1 ? '' : 's'}</dd></div></dl>{!selectedWork.coordinate_available && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />This work can be selected and reported, but no public work coordinate is available for distance comparison. Your live device GPS will still be preserved when you submit proof.</div>}<p className="mt-4 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Citizen evidence is stored against this Work ID and routed to the officer review workflow. GPS proximity helps assess location context; it does not confirm fraud or the truth of an allegation.</p></section> : <div className="citizen-empty-detail"><MapPin className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">Select a work from the list or map</p></div>}</div>
    </section>
    <CitizenEvidenceModal isOpen={isEvidenceOpen} work={selectedWork} config={config} onClose={() => setIsEvidenceOpen(false)} onSubmitted={handleSubmitted} />
  </div>;
};

export default CitizenProtocolPage;
