import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  MapPin,
  Receipt,
  Search,
  ShieldAlert,
  ShieldCheck,
  TableProperties,
} from 'lucide-react';
import GeotagEvidenceModal from '../components/GeotagEvidenceModal';
import FraudEvidenceModal from '../components/FraudEvidenceModal';
import HandwrittenBillsModal from '../components/HandwrittenBillsModal';
import { LeafletGeotagMap } from '../components/LeafletGeotagMap';
import { ForensicScanTerminal } from '../components/ForensicScanTerminal';
import { DossierInspectorModal } from '../components/DossierInspectorModal';
import {
  applyFullWorkIds,
  fileUrl,
  formatCoordinate,
  geotagEvidenceRecords,
  statusLabel,
  type GeotagEvidenceRecord,
} from '../lib/geotagEvidence';
import { fetchWorkIdMap } from '../services/api';

interface GeotagEvidenceAuditPageProps {
  onSelectWork?: (workId: string) => void;
  onOpenEvidence?: (workId: string, imageName?: string) => void;
}

type ConstituencyFilter = 'ALL' | 'Anakapalle' | 'Vijayawada';
type EvidenceFilter = 'ALL' | 'FRAUD' | 'GEOTAG' | 'PHOTO' | 'BILL' | 'HANDWRITTEN_BILLS' | 'MISSING';

const statusClass = (status: string) => {
  if (status === 'FRAUD_SUSPECTED') return 'border-rose-400 bg-rose-100 text-rose-950 font-black animate-pulse dark:border-rose-700 dark:bg-rose-950/70 dark:text-rose-200';
  if (status === 'GEOTAG_VERIFIED') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (status === 'PHOTO_PRESENT_UNTAGGED') return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-300';
  if (status === 'TEXT_BILL_PROOF_ONLY') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300';
  if (status === 'STUB_DOSSIER_NO_EVIDENCE') return 'border-rose-400 bg-rose-100 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200';
  return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/40 dark:text-rose-300';
};

const matchesEvidenceFilter = (record: GeotagEvidenceRecord, filter: EvidenceFilter) => {
  if (filter === 'ALL') return true;
  if (filter === 'FRAUD') return Boolean(record.isFraudSuspected);
  if (filter === 'GEOTAG') return record.status === 'GEOTAG_VERIFIED';
  if (filter === 'PHOTO') return record.hasPhotoEvidence;
  if (filter === 'BILL') return record.status === 'TEXT_BILL_PROOF_ONLY';
  if (filter === 'HANDWRITTEN_BILLS') return (record.handwrittenBillsCount || 0) > 0;
  return record.status === 'NO_DOCUMENT_UPLOADED' || record.status === 'NO_BILLS_NO_PROGRESS_TABLES' || record.status === 'STUB_DOSSIER_NO_EVIDENCE';
};

export const GeotagEvidenceAuditPage: React.FC<GeotagEvidenceAuditPageProps> = ({ onSelectWork, onOpenEvidence }) => {
  const [constituency, setConstituency] = useState<ConstituencyFilter>('ALL');
  const [filter, setFilter] = useState<EvidenceFilter>('ALL');
  const [search, setSearch] = useState('');
  const [mandalFilter, setMandalFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [modalWorkId, setModalWorkId] = useState<string | null>(null);
  const [modalImageName, setModalImageName] = useState<string | undefined>();
  const [billsModalWorkId, setBillsModalWorkId] = useState<string | null>(null);
  const [fraudModalWorkId, setFraudModalWorkId] = useState<string | null>(null);
  const [dossierRecord, setDossierRecord] = useState<GeotagEvidenceRecord | null>(null);
  const [fullWorkIds, setFullWorkIds] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchWorkIdMap(geotagEvidenceRecords.map((record) => record.workId))
      .then((resolved) => {
        applyFullWorkIds(resolved);
        setFullWorkIds(resolved);
      })
      .catch(() => undefined);
  }, []);

  const constituencyRecords = useMemo(() => constituency === 'ALL'
    ? geotagEvidenceRecords
    : geotagEvidenceRecords.filter((record) => record.constituency === constituency), [constituency]);

  const uniqueMandals = useMemo(() => {
    const set = new Set<string>();
    constituencyRecords.forEach((r) => { if (r.mandal) set.add(r.mandal); });
    return Array.from(set).sort();
  }, [constituencyRecords]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    constituencyRecords.forEach((r) => { if (r.category) set.add(r.category); });
    return Array.from(set).sort();
  }, [constituencyRecords]);

  const counts = useMemo(() => ({
    all: constituencyRecords.length,
    fraud: constituencyRecords.filter((record) => record.isFraudSuspected).length,
    geotag: constituencyRecords.filter((record) => record.status === 'GEOTAG_VERIFIED').length,
    photo: constituencyRecords.filter((record) => record.hasPhotoEvidence).length,
    bill: constituencyRecords.filter((record) => record.status === 'TEXT_BILL_PROOF_ONLY').length,
    handwritten: constituencyRecords.filter((record) => (record.handwrittenBillsCount || 0) > 0).length,
    missing: constituencyRecords.filter((record) => record.status === 'NO_DOCUMENT_UPLOADED' || record.status === 'NO_BILLS_NO_PROGRESS_TABLES' || record.status === 'STUB_DOSSIER_NO_EVIDENCE').length,
  }), [constituencyRecords]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return constituencyRecords.filter((record) => {
      if (mandalFilter !== 'ALL' && record.mandal !== mandalFilter) return false;
      if (categoryFilter !== 'ALL' && record.category !== categoryFilter) return false;
      const searchable = `${record.workId} ${record.title} ${record.mandal} ${record.constituency} ${record.missingSummary}`.toLowerCase();
      return matchesEvidenceFilter(record, filter) && (!query || searchable.includes(query));
    });
  }, [constituencyRecords, filter, search, mandalFilter, categoryFilter]);

  const verifiedRecords = constituencyRecords.filter((record) => (record.status === 'GEOTAG_VERIFIED' || record.isFraudSuspected) && record.gps);
  const displayWorkId = (record: GeotagEvidenceRecord) => record.fullWorkId || fullWorkIds[record.workId] || record.workId;
  const openEvidence = (record: GeotagEvidenceRecord, imageName?: string) => {
    const completeWorkId = displayWorkId(record);
    if (onOpenEvidence) onOpenEvidence(completeWorkId, imageName || record.gpsImages[0]?.name);
    else {
      setModalWorkId(completeWorkId);
      setModalImageName(imageName || record.gpsImages[0]?.name);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Work ID', 'Constituency', 'Mandal', 'Category', 'Title', 'Status', 'Suspected Fraud', 'GPS Latitude', 'GPS Longitude', 'GPS Watermark Verified', 'Photos Attached', 'Handwritten Bills Count', 'Attached Files'];
    const rows = filteredRecords.map((r) => [
      `"${displayWorkId(r)}"`,
      `"${r.constituency}"`,
      `"${r.mandal}"`,
      `"${r.category}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.status}"`,
      r.isFraudSuspected ? 'YES' : 'NO',
      r.gps?.latitude || '',
      r.gps?.longitude || '',
      r.gps ? 'YES' : 'NO',
      r.images.length,
      r.handwrittenBillsCount || 0,
      r.attachedFiles.length,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `mplads_geotag_audit_${constituency.toLowerCase()}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredRecords, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `mplads_geotag_audit_${constituency.toLowerCase()}_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const kpis = [
    ['Works Audited', counts.all.toLocaleString(), 'Read-only audit manifest', 'text-indigo-700 dark:text-indigo-300'],
    ['🚨 Suspected Fraud (100% Risk)', counts.fraud.toLocaleString(), 'Duplicate geotag/file reuse override', 'text-rose-700 dark:text-rose-300 font-black'],
    ['🟢 Scanned Pictures & Evidence', counts.photo.toLocaleString(), `📍 ${counts.geotag} Geotagged · ${Math.max(0, counts.photo - counts.geotag)} Untagged`, 'text-emerald-700 dark:text-emerald-300'],
    ['🧾 Handwritten Bills Verified', counts.handwritten.toLocaleString(), 'Vouchers, Form 27 & M-Books', 'text-amber-700 dark:text-amber-300 font-bold'],
  ];

  const tabs: Array<[EvidenceFilter, string, number]> = [
    ['ALL', `All Works (${counts.all})`, counts.all],
    ['FRAUD', `🚨 Suspected Fraud (${counts.fraud})`, counts.fraud],
    ['GEOTAG', `📍 Verified Geotags (${counts.geotag})`, counts.geotag],
    ['HANDWRITTEN_BILLS', `🧾 Handwritten Bills (${counts.handwritten})`, counts.handwritten],
    ['PHOTO', `🟢 Scanned Pictures (${counts.photo})`, counts.photo],
    ['BILL', `🟡 Bill Proof Only (${counts.bill})`, counts.bill],
    ['MISSING', `🔴 Missing Proof (${counts.missing})`, counts.missing],
  ];

  return (
    <div className="geotag-evidence-page space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
            <ShieldCheck className="h-4 w-4" /> Evidence integrity &amp; fraud detection engine
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            Field Photographic Evidence &amp; Fraud Audit
          </h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Multi-file evidence classifier inspecting photographic proof, contractor bills, progress status tables, and cross-work evidence reuse with a 100% risk score override.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/geotag_dashboard.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-700 shadow-sm transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/80"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Fullscreen Leaflet Portal ↗
          </a>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
            {(['ALL', 'Anakapalle', 'Vijayawada'] as ConstituencyFilter[]).map((value) => (
              <button
                key={value}
                onClick={() => { setConstituency(value); setFilter('ALL'); }}
                className={`rounded-xl px-3 py-2 text-[11px] font-bold transition ${constituency === value ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
              >
                {value === 'ALL' ? `All Works (${geotagEvidenceRecords.length})` : `${value} (${geotagEvidenceRecords.filter((record) => record.constituency === value).length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([label, value, note, color]) => (
          <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
            <div className={`mt-1 font-mono text-2xl font-black tracking-tight ${color}`}>{value}</div>
            <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{note}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Interactive Leaflet GIS &amp; District Geofence Map
            </h2>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Real-time interactive Leaflet GIS mapping with CartoDB Dark Matter, OSM, and Esri Satellite basemaps. Verified pulse markers and Anakapalli / Vijayawada geofence envelopes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">
              {verifiedRecords.length} genuine positions
            </span>
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-800 dark:border-indigo-800/70 dark:bg-indigo-950/40 dark:text-indigo-300">
              2 District Geofences
            </span>
          </div>
        </div>
        <LeafletGeotagMap
          records={verifiedRecords}
          selectedConstituency={constituency}
          onOpenPhoto={(record, imageName) => openEvidence(record, imageName)}
          onOpenBills={(record) => setBillsModalWorkId(displayWorkId(record))}
          onOpenDossier={(record) => setDossierRecord(record)}
        />
      </section>

      <ForensicScanTerminal records={constituencyRecords} />

      <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition ${filter === value ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <TableProperties className="h-4 w-4 text-indigo-600 dark:text-indigo-300" /> Audited work evidence ({filteredRecords.length})
            </h2>
            <label className="relative block w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search work, title, missing items…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none ring-indigo-200 placeholder:text-slate-400 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          </div>

          {/* Quick Filters and Export Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Filter by:</span>
              <select
                value={mandalFilter}
                onChange={(e) => setMandalFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="ALL">All Mandals ({uniqueMandals.length})</option>
                {uniqueMandals.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="ALL">All Categories ({uniqueCategories.length})</option>
                {uniqueCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              {(mandalFilter !== 'ALL' || categoryFilter !== 'ALL' || search || filter !== 'ALL') && (
                <button
                  onClick={() => { setMandalFilter('ALL'); setCategoryFilter('ALL'); setSearch(''); setFilter('ALL'); }}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 transition"
                  title="Clear all active filters"
                >
                  Reset ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 transition"
                title="Export filtered records as CSV spreadsheet"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
              <button
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 transition"
                title="Export filtered records as JSON audit stream"
              >
                <FileText className="h-3.5 w-3.5" /> JSON
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="geotag-evidence-table w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                <th className="px-5 py-3">Work ID &amp; constituency</th>
                <th className="px-5 py-3">Mandal &amp; work title</th>
                <th className="px-5 py-3">Photographic Proof &amp; GPS</th>
                <th className="px-5 py-3">Bills &amp; Progress Tables</th>
                <th className="px-5 py-3">Audit Classification &amp; Gaps</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRecords.map((record) => {
                const completeWorkId = displayWorkId(record);
                const firstFile = record.attachedFiles[0];
                const preview = record.gpsImages[0] || record.images[0];
                const isFraud = record.isFraudSuspected;
                return (
                  <tr
                    key={record.workId}
                    tabIndex={0}
                    onClick={() => openEvidence(record, preview?.name)}
                    className="cursor-pointer bg-white align-top text-slate-900 transition hover:bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-300 dark:bg-[#0f172a] dark:text-slate-100 dark:hover:bg-[#0f172a]/80"
                  >
                    <td className="px-5 py-4">
                      <button onClick={() => openEvidence(record, preview?.name)} className="font-mono font-bold text-slate-900 underline-offset-2 hover:text-indigo-700 hover:underline dark:text-slate-100 dark:hover:text-indigo-300">
                        {completeWorkId}
                      </button>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{record.constituency}</div>
                      {isFraud && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-xs">
                          <AlertOctagon className="h-3 w-3" /> 100% Risk Override
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-5 py-4">
                      <button onClick={() => openEvidence(record, preview?.name)} className="text-left font-bold leading-relaxed text-slate-900 hover:text-indigo-700 dark:text-slate-100 dark:hover:text-indigo-300">
                        {record.title}
                      </button>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{record.mandal} · {record.category}</div>
                    </td>
                    <td className="px-5 py-4">
                      {record.images.length ? (
                        <>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{record.images.length} photo{record.images.length === 1 ? '' : 's'}</div>
                          {record.gps ? (
                            <>
                              <div className="mt-1 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                                {formatCoordinate(record.gps.latitude)} N · {formatCoordinate(record.gps.longitude)} E
                              </div>
                              <span className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                                🏷️ GPS Stamped
                              </span>
                            </>
                          ) : (
                            <span className="mt-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                              No GPS stamp
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">No images attached</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-1.5">
                        {record.handwrittenBillsCount > 0 ? (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setBillsModalWorkId(completeWorkId);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200 transition"
                            title="Click to inspect extracted handwritten bills & vouchers"
                          >
                            <Receipt className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            <span>🧾 {record.handwrittenBillsCount} Handwritten Bill{record.handwrittenBillsCount === 1 ? '' : 's'}</span>
                          </button>
                        ) : record.hasBillProof ? (
                          <span className="font-bold text-emerald-700 dark:text-emerald-300 block">🧾 Bills / UC Verified</span>
                        ) : (
                          <span className="text-slate-500 block">No bills verified</span>
                        )}
                        {record.hasProgressTables ? (
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block text-[11px]">📊 Progress table present</span>
                        ) : (
                          <span className="text-slate-400 block text-[11px]">No progress table</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 max-w-sm">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(record.status)}`}>
                        {statusLabel(record.status)}
                      </span>
                      {record.missingItems.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 text-[10px] text-rose-700 dark:text-rose-400">
                          {record.missingItems.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="truncate">✕ {item}</div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                        {record.handwrittenBillsCount > 0 && (
                          <button
                            onClick={() => setBillsModalWorkId(completeWorkId)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-900 shadow-sm hover:bg-amber-100 hover:text-amber-950 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-200 dark:hover:bg-amber-900/80 transition"
                            title={`View ${record.handwrittenBillsCount} extracted physical bills & vouchers`}
                          >
                            <Receipt className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> View Bills ({record.handwrittenBillsCount})
                          </button>
                        )}
                        {isFraud && (
                          <button
                            onClick={() => setFraudModalWorkId(completeWorkId)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-[10px] font-black text-rose-900 shadow-sm hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-200"
                          >
                            <Copy className="h-3.5 w-3.5 text-rose-600" /> Compare Collision
                          </button>
                        )}
                        <button
                          onClick={() => openEvidence(record, preview?.name)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-900 shadow-sm hover:bg-slate-100 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                        >
                          <ImageIcon className="h-3.5 w-3.5" /> Preview Photo
                        </button>
                        <button
                          onClick={() => setDossierRecord(record)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-900 shadow-sm hover:bg-indigo-100 hover:text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200 dark:hover:bg-indigo-900/80 transition"
                          title="Open comprehensive Dossier Inspector"
                        >
                          <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Dossier ➔
                        </button>
                        {onSelectWork && (
                          <button
                            onClick={() => onSelectWork(completeWorkId)}
                            className="inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[10px] font-bold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
                          >
                            Risk profile
                          </button>
                        )}
                        {firstFile && (
                          <a
                            href={fileUrl(firstFile)}
                            download
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-900 shadow-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Download className="h-3.5 w-3.5" /> File
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredRecords.length === 0 && <div className="p-10 text-center text-xs text-slate-500">No audit records match the selected filter.</div>}
        </div>
      </section>

      {!onOpenEvidence && (
        <GeotagEvidenceModal
          isOpen={Boolean(modalWorkId)}
          workId={modalWorkId}
          initialImageName={modalImageName}
          onSelectWork={onSelectWork}
          onClose={() => setModalWorkId(null)}
        />
      )}

      <HandwrittenBillsModal
        isOpen={Boolean(billsModalWorkId)}
        workId={billsModalWorkId}
        onClose={() => setBillsModalWorkId(null)}
      />

      <FraudEvidenceModal
        isOpen={Boolean(fraudModalWorkId)}
        workId={fraudModalWorkId}
        onSelectWork={onSelectWork}
        onClose={() => setFraudModalWorkId(null)}
      />

      <DossierInspectorModal
        isOpen={Boolean(dossierRecord)}
        record={dossierRecord}
        onClose={() => setDossierRecord(null)}
        onOpenPhoto={(rec, img) => openEvidence(rec, img)}
        onOpenBills={(rec) => setBillsModalWorkId(displayWorkId(rec))}
      />
    </div>
  );
};

export default GeotagEvidenceAuditPage;
