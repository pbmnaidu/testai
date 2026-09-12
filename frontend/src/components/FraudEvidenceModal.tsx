import React from 'react';
import { AlertTriangle, ArrowRight, ExternalLink, MapPin, ShieldAlert, X } from 'lucide-react';
import { formatCoordinate, getGeotagEvidence, GeotagEvidenceRecord } from '../lib/geotagEvidence';

interface FraudEvidenceModalProps {
  isOpen: boolean;
  workId: string | null;
  onClose: () => void;
  onSelectWork?: (workId: string) => void;
}

export const FraudEvidenceModal: React.FC<FraudEvidenceModalProps> = ({
  isOpen,
  workId,
  onClose,
  onSelectWork,
}) => {
  if (!isOpen || !workId) return null;

  const record = getGeotagEvidence(workId);
  if (!record || !record.isFraudSuspected || !record.fraudDetails) {
    return null;
  }

  const fraud = record.fraudDetails;
  const matchedId = fraud.fraud_matched_work_id;
  const matchedRecord = matchedId ? getGeotagEvidence(matchedId) : undefined;

  const currentPhoto = record.gpsImages[0] || record.images[0];
  const matchedPhoto = matchedRecord?.gpsImages[0] || matchedRecord?.images[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-rose-500/40 bg-white shadow-2xl dark:border-rose-700/60 dark:bg-[#0f172a]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rose-200 bg-rose-50/80 px-6 py-4 dark:border-rose-900/60 dark:bg-rose-950/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-rose-950 dark:text-rose-100">
                  Cross-Work Evidence Reuse Detected · 100% Risk Override
                </h2>
                <span className="rounded-full border border-rose-300 bg-rose-200 px-2 py-0.5 text-[10px] font-black uppercase text-rose-900 dark:border-rose-700 dark:bg-rose-900 dark:text-rose-100">
                  Suspected Fraud
                </span>
              </div>
              <p className="text-xs text-rose-800 dark:text-rose-300">
                Two separate project submissions share duplicate physical photographic proof or identical geotagged GPS coordinates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-900/50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Forensic Collision Details Banner */}
          <div className="rounded-2xl border border-rose-300 bg-rose-50/50 p-4 text-xs dark:border-rose-800/80 dark:bg-rose-950/30">
            <div className="font-bold text-rose-900 dark:text-rose-200">
              Forensic Match Reason:
            </div>
            <p className="mt-1 leading-relaxed text-rose-800 dark:text-rose-300">
              {fraud.reason || 'Exact duplicate geotag location reused across distinct works.'}
            </p>
            {fraud.fraud_distance_meters != null && (
              <div className="mt-2 flex items-center gap-2 font-mono text-[11px] font-bold text-rose-900 dark:text-rose-200">
                <MapPin className="h-3.5 w-3.5 text-rose-600" />
                Distance between claimed physical photo stamps: <span className="underline">{fraud.fraud_distance_meters} meters</span>
              </div>
            )}
          </div>

          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Work 1 (Current) */}
            <div className="flex flex-col rounded-2xl border-2 border-indigo-200 bg-slate-50 p-4 dark:border-indigo-900/70 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  Work ID: {record.workId}
                </span>
                <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                  Currently Viewing
                </span>
              </div>
              <h3 className="line-clamp-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                {record.title}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Mandal: {record.mandal}
                </span>
                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {record.constituency}
                </span>
              </div>

              {/* Photo Preview with GPS Overlay */}
              <div className="relative mt-3 h-48 overflow-hidden rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700">
                {currentPhoto ? (
                  <img
                    src={currentPhoto.url}
                    alt={`Evidence photo for work ${record.workId}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    No image preview
                  </div>
                )}
                {record.gps && (
                  <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-slate-950/85 p-2 font-mono text-[10px] text-emerald-300 shadow-md">
                    <div>Lat: {formatCoordinate(record.gps.latitude)}</div>
                    <div>Lon: {formatCoordinate(record.gps.longitude)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Work 2 (Matched Collision) */}
            <div className="flex flex-col rounded-2xl border-2 border-rose-200 bg-slate-50 p-4 dark:border-rose-900/70 dark:bg-slate-900/60">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-rose-700 dark:text-rose-300">
                  Work ID: {matchedId || '—'}
                </span>
                <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  Duplicate Collision Target
                </span>
              </div>
              <h3 className="line-clamp-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                {matchedRecord?.title || fraud.fraud_matched_work_title || 'Work ' + matchedId}
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Mandal: {matchedRecord?.mandal || fraud.fraud_matched_mandal || '—'}
                </span>
                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {matchedRecord?.constituency || record.constituency}
                </span>
              </div>

              {/* Matched Photo Preview */}
              <div className="relative mt-3 h-48 overflow-hidden rounded-xl border border-slate-300 bg-slate-950 dark:border-slate-700">
                {matchedPhoto ? (
                  <img
                    src={matchedPhoto.url}
                    alt={`Matched evidence photo for work ${matchedId}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    No image preview
                  </div>
                )}
                {matchedRecord?.gps && (
                  <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-slate-950/85 p-2 font-mono text-[10px] text-emerald-300 shadow-md">
                    <div>Lat: {formatCoordinate(matchedRecord.gps.latitude)}</div>
                    <div>Lon: {formatCoordinate(matchedRecord.gps.longitude)}</div>
                  </div>
                )}
              </div>

              {matchedId && onSelectWork && (
                <button
                  onClick={() => {
                    onClose();
                    onSelectWork(matchedId);
                  }}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Inspect Work {matchedId} Risk Profile <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Override Status: <strong className="text-rose-600 dark:text-rose-400">Risk Score: 100 / 100 (CRITICAL)</strong>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};

export default FraudEvidenceModal;
