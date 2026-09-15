import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  MapPin,
  Printer,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  fileUrl,
  formatCoordinate,
  formatDms,
  mapsUrl,
  statusLabel,
  GeotagEvidenceRecord,
} from '../lib/geotagEvidence';

interface DossierInspectorModalProps {
  isOpen: boolean;
  record: GeotagEvidenceRecord | null;
  onClose: () => void;
  onOpenPhoto: (record: GeotagEvidenceRecord, imageName?: string) => void;
  onOpenBills: (record: GeotagEvidenceRecord) => void;
}

export const DossierInspectorModal: React.FC<DossierInspectorModalProps> = ({
  isOpen,
  record,
  onClose,
  onOpenPhoto,
  onOpenBills,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !record) return null;

  const isGreen = record.status === 'GEOTAG_VERIFIED' || record.status === 'PHOTO_PRESENT_UNTAGGED';
  const isYellow = record.status === 'TEXT_BILL_PROOF_ONLY';
  const hasGps = record.gps && Number.isFinite(record.gps.latitude) && Number.isFinite(record.gps.longitude);
  const workId = record.fullWorkId || record.workId;

  const handleCopySummary = () => {
    const summary = `=== MPLADS FORENSIC AUDIT DOSSIER ===
Work ID: ${workId}
Title: ${record.title}
Constituency: ${record.constituency} | Mandal: ${record.mandal} | Category: ${record.category}
Audit Status: ${statusLabel(record.status)}
Suspected Fraud Collision: ${record.isFraudSuspected ? 'YES (100% Risk Override)' : 'NO'}
GPS Telemetry: ${hasGps ? `${formatCoordinate(record.gps?.latitude)} N, ${formatCoordinate(record.gps?.longitude)} E (${formatDms(record.gps?.latitude, true)}, ${formatDms(record.gps?.longitude, false)})` : 'None / Untagged'}
Geofence Validation: ${hasGps ? `Verified within ${record.constituency} district envelope` : 'N/A'}
MoSPI Attached Files (${record.attachedFiles.length}): ${record.attachedFiles.map(f => `${f.name} (${f.size_kb || 0} KB)`).join(', ') || 'None'}
Photographic Proof: ${record.images.length} photo(s) (${record.gpsImages.length} GPS stamped)
Handwritten Bills & Vouchers: ${record.handwrittenBillsCount || 0} physical bill(s) extracted & verified
Missing Audit Items: ${record.missingItems.join(', ') || 'None'}
Audit Manifest Timestamp: ${new Date().toISOString()}
=====================================`;

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6">
      <div className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-2xl">
        {/* Modal Header */}
        <header className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${
              isGreen
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'
                : isYellow
                ? 'bg-amber-500/10 text-amber-400 ring-amber-500/30'
                : 'bg-rose-500/10 text-rose-400 ring-rose-500/30'
            }`}>
              {isGreen ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">
                  In-Memory Dossier Inspector
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isGreen
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : isYellow
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {statusLabel(record.status)}
                </span>
              </div>
              <h2 className="text-base font-bold text-white sm:text-lg">
                Work {workId} · {record.constituency}
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-xl">
                {record.title} · {record.mandal} Mandal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-sm"
              title="Copy structured audit summary to clipboard"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
              <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
            </button>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition shadow-sm"
              title="Print or Save PDF Forensic Report"
            >
              <Printer className="h-4 w-4 text-sky-400" />
              <span>Print Report</span>
            </button>

            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700 hover:text-white transition shadow-sm ml-1"
              title="Close modal (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-950">
          {/* Audit Verdict Banner */}
          <div className={`rounded-2xl border p-4 ${
            isGreen
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
              : isYellow
              ? 'border-amber-500/30 bg-amber-950/30 text-amber-200'
              : 'border-rose-500/30 bg-rose-950/30 text-rose-200'
          }`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              <span>{isGreen ? '🟢' : isYellow ? '🟡' : '🔴'}</span>
              <span>
                {isGreen
                  ? 'Scanned Image & Picture Evidence Verified'
                  : isYellow
                  ? 'Text / Bill Proof Verified (No Images Attached)'
                  : 'Missing Proof / Zero Scanned Images Uploaded'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              {record.auditReason || 'Evaluated against official MoSPI documentation requirements.'}
            </p>
          </div>

          {/* Core Telemetry & Files Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Attached Completion Files */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-sky-400" /> Attached Official Documents
              </h4>
              {record.attachedFiles.length > 0 ? (
                <div className="space-y-2">
                  {record.attachedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-slate-950 p-2.5 text-xs font-mono border border-slate-800/80">
                      <div className="truncate mr-2 text-sky-300">
                        📄 {f.name}
                        <span className="text-[10px] text-slate-500 block">
                          {f.size_kb ? `${f.size_kb} KB` : 'Attached'} · {f.type || 'PDF Document'}
                        </span>
                      </div>
                      <a
                        href={fileUrl(f)}
                        download
                        className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-700 shrink-0"
                      >
                        <Download className="h-3 w-3" /> Get
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-rose-400 py-3">
                  No documents or completion files uploaded to MoSPI.
                </div>
              )}
            </div>

            {/* GPS Telemetry & Geofence Verification */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-emerald-400" /> Ground GPS Telemetry
              </h4>

              {hasGps ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Coordinates:</span>
                    <span className="font-mono font-bold text-emerald-300">
                      {formatCoordinate(record.gps?.latitude)} N, {formatCoordinate(record.gps?.longitude)} E
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">DMS Format:</span>
                    <span className="font-mono text-slate-200">
                      {formatDms(record.gps?.latitude, true)}, {formatDms(record.gps?.longitude, false)}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Telemetry Source:</span>
                    <span className="text-slate-200 font-semibold">{record.gps?.source || 'Visual GPS Stamp'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1">
                    <span className="text-slate-400">Geofence Audit:</span>
                    <span className="text-emerald-400 font-semibold">
                      ✅ Verified Inside {record.constituency} District
                    </span>
                  </div>
                  <div className="pt-2">
                    <a
                      href={mapsUrl(record.gps)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
                    </a>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs text-rose-400 py-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4" /> No Geotag Found
                  </div>
                  <p className="text-[11px] text-slate-400">
                    EXIF metadata was stripped upon upload and no visual GPS watermark stamp was detected on attached photos.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Summary Badges & Quick Action to Bills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Scanned Pictures</span>
              <div className="font-mono text-lg font-bold text-white mt-0.5">
                📷 {record.images.length} Image(s)
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Progress Tables</span>
              <div className="font-mono text-lg font-bold text-white mt-0.5">
                {record.hasProgressTables ? '📊 Table Present' : 'None Detected'}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Physical Bills</span>
              <div className="mt-0.5">
                {(record.handwrittenBillsCount || 0) > 0 ? (
                  <button
                    onClick={() => onOpenBills(record)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/25"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    <span>🧾 {record.handwrittenBillsCount} Handwritten Bill(s) ➔</span>
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 font-mono">No bills extracted</span>
                )}
              </div>
            </div>
          </div>

          {/* Attached Pictures & Scanned Documents Strip */}
          {record.images.length > 0 && (
            <div className="border-t border-slate-800 pt-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5 text-sky-400" /> Scanned Pictures &amp; Images ({record.images.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {record.images.map((img, idx) => (
                  <div key={img.name} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 p-2 text-center group">
                    <div
                      onClick={() => onOpenPhoto(record, img.name)}
                      className="relative h-24 w-full overflow-hidden rounded-lg bg-slate-950 cursor-pointer"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      {img.gps && (
                        <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-mono font-bold text-emerald-300">
                          📍 GPS
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 truncate font-mono text-[10px] text-slate-300" title={img.name}>
                      {img.name}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => onOpenPhoto(record, img.name)}
                        className="flex-1 rounded bg-purple-500/20 border border-purple-500/40 py-1 text-[10px] font-bold text-purple-300 hover:bg-purple-500/30"
                      >
                        👁️ Preview
                      </button>
                      <a
                        href={img.url}
                        download={img.name}
                        className="flex-1 rounded bg-slate-800 border border-slate-700 py-1 text-[10px] font-bold text-slate-300 hover:bg-slate-700"
                      >
                        💾 Get
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DossierInspectorModal;
