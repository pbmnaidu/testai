import React, { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Copy,
  Eye,
  FileX2,
  Image as ImageIcon,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { formatCoordinate, getGeotagEvidence } from '../lib/geotagEvidence';
import GeotagEvidenceModal from './GeotagEvidenceModal';
import FraudEvidenceModal from './FraudEvidenceModal';

interface GeotagEvidenceCardProps {
  workId: string;
  onOpenEvidence?: (workId: string, imageName?: string) => void;
  onSelectWork?: (workId: string) => void;
}

export const GeotagEvidenceCard: React.FC<GeotagEvidenceCardProps> = ({
  workId,
  onOpenEvidence,
  onSelectWork,
}) => {
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const [fraudModalOpen, setFraudModalOpen] = useState(false);

  const record = getGeotagEvidence(workId);
  const previewImage = record?.gpsImages[0] || record?.images[0];
  const gps = record?.gpsImages[0]?.gps;

  const openPreview = () => {
    if (onOpenEvidence) onOpenEvidence(workId, previewImage?.name);
    else setLocalModalOpen(true);
  };

  if (!record || (!record.hasPhotoEvidence && record.attachedFiles.length === 0)) {
    return (
      <div className="rounded-2xl border border-rose-300 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30">
        <div className="flex items-start gap-3">
          <FileX2 className="h-6 w-6 text-rose-600 dark:text-rose-400 shrink-0" />
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-rose-950 dark:text-rose-200">
              Photographic Site Inspection &amp; Evidence Audit
            </h3>
            <p className="text-xs font-medium leading-relaxed text-rose-900 dark:text-rose-300">
              No physical site inspection photographs or completion dossiers were uploaded to MoSPI.
            </p>
            <div className="rounded-xl border border-rose-200 bg-white/80 p-3 text-xs dark:border-rose-900 dark:bg-slate-900/60">
              <span className="font-bold text-rose-900 dark:text-rose-200 block mb-1">
                Missing from submission:
              </span>
              <ul className="list-disc pl-4 space-y-0.5 text-rose-800 dark:text-rose-300">
                <li>Entire completion dossier (no photographs, bills, or completion certificates)</li>
                <li>Physical ground-level photographic inspection proof</li>
                <li>Contractor bills and measurement book (M-book) records</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isFraud = Boolean(record.isFraudSuspected && record.fraudDetails);
  const fraud = record.fraudDetails;
  const missingItems = record.missingItems || [];

  return (
    <>
      <section className="space-y-4">
        {/* 100% Risk Override Fraud Banner */}
        {isFraud && fraud && (
          <div className="rounded-2xl border-2 border-rose-500 bg-rose-50 p-5 shadow-md dark:border-rose-700 dark:bg-rose-950/40 animate-in fade-in duration-200">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                  <AlertOctagon className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-black uppercase text-white tracking-wider">
                      🚨 Suspected Fraud · 100% Risk Override
                    </span>
                    <span className="font-mono text-xs font-bold text-rose-900 dark:text-rose-200">
                      Score: 100 / 100
                    </span>
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-rose-950 dark:text-rose-100">
                    Cross-Work Duplicate Evidence Collision Detected
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-rose-800 dark:text-rose-300">
                    {fraud.reason || 'Claimed evidence matches another work record.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setFraudModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
              >
                <Copy className="h-4 w-4" /> Compare Matching Works Side-by-Side
              </button>
            </div>
          </div>
        )}

        {/* Main Photographic Evidence Card */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
                <ImageIcon className="h-3.5 w-3.5" /> Field evidence inspection
              </div>
              <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                Photographic Site Inspection &amp; Geotag Evidence
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Read-only field inspection assets extracted from official MoSPI submissions.
              </p>
            </div>
            {isFraud ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-[10px] font-bold text-rose-900 dark:border-rose-700 dark:bg-rose-900 dark:text-rose-100">
                🚨 Evidence Collision Flagged
              </span>
            ) : gps ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">
                📍 Genuine GPS Stamped
              </span>
            ) : (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
                🟢 Physical Photo Attached (Untagged)
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
            {previewImage ? (
              <img
                src={previewImage.url}
                alt={`Site inspection evidence for work ${workId}`}
                className="h-32 w-full rounded-xl border border-slate-200 object-cover md:w-56 dark:border-slate-700"
              />
            ) : (
              <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 md:w-56 dark:border-slate-700">
                No image preview
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <MapPin className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />{' '}
                <span>
                  {record.images.length} attached photo{record.images.length === 1 ? '' : 's'} ·{' '}
                  {record.hasBillProof ? 'Bill / UC proof attached' : 'No bill / UC proof in submission'}
                </span>
              </div>
              {gps ? (
                <div className="grid grid-cols-1 gap-1 font-mono text-[11px] text-slate-700 sm:grid-cols-2 dark:text-slate-300">
                  <span>Lat {formatCoordinate(gps.latitude)}</span>
                  <span>Long {formatCoordinate(gps.longitude)}</span>
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">
                  The attached photo has no verified GPS watermark, so no coordinate or bounding box is shown.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={openPreview}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  <Eye className="h-3.5 w-3.5" /> Inspect Geotag Stamp &amp; Coordinates
                </button>
                {isFraud && (
                  <button
                    onClick={() => setFraudModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> View Fraud Comparison
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Evidence Completeness & Fraud Audit Grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Dossier Page Count</span>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{record.pageCount ? `${record.pageCount} page${record.pageCount === 1 ? '' : 's'}` : 'Standalone File'}</span>
                {record.pageCount != null && record.pageCount > 0 && record.pageCount <= 2 && (
                  <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-800 dark:bg-rose-950 dark:text-rose-300">Stub &lt;= 2p</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Photographic Proof</span>
              <div className="mt-1 text-xs font-bold">
                {record.hasPhotoEvidence ? (
                  gps ? (
                    <span className="text-emerald-700 dark:text-emerald-400">🟢 Verified Geotagged</span>
                  ) : (
                    <span className="text-sky-700 dark:text-sky-400">🟢 Scanned (Untagged)</span>
                  )
                ) : (
                  <span className="text-rose-600 dark:text-rose-400">❌ Missing Photos</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Financial Proof</span>
              <div className="mt-1 text-xs font-bold">
                {record.hasBillProof ? (
                  <span className="text-emerald-700 dark:text-emerald-400">🧾 Verified Bills / UC</span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400">❌ No Bills Attached</span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Progress Tables</span>
              <div className="mt-1 text-xs font-bold">
                {record.hasProgressTables ? (
                  <span className="text-emerald-700 dark:text-emerald-400">📊 Progress Tables Verified</span>
                ) : (
                  <span className="text-slate-500 dark:text-slate-400">❌ Missing Tables</span>
                )}
              </div>
            </div>
          </div>

          {/* Clean 'Missing From Submission' Box */}
          <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
            {missingItems.length > 0 ? (
              <div>
                <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 block mb-1">
                  ⚠️ Missing from submission (Field &amp; Financial Verification Gaps):
                </span>
                <ul className="space-y-1 text-slate-700 dark:text-slate-300">
                  {missingItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-rose-500 font-bold shrink-0">✕</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>All key evidence attached: Field geotagged photo and financial bills verified.</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {!onOpenEvidence && (
        <GeotagEvidenceModal
          isOpen={localModalOpen}
          workId={workId}
          initialImageName={previewImage?.name}
          onClose={() => setLocalModalOpen(false)}
        />
      )}

      <FraudEvidenceModal
        isOpen={fraudModalOpen}
        workId={workId}
        onClose={() => setFraudModalOpen(false)}
        onSelectWork={onSelectWork}
      />
    </>
  );
};

export default GeotagEvidenceCard;
