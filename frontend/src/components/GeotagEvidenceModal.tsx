import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  formatCoordinate,
  formatDms,
  getGeotagEvidence,
  mapsUrl,
} from '../lib/geotagEvidence';
import { fetchWorkDetail } from '../services/api';
import { WorkRecord } from '../types';

interface GeotagEvidenceModalProps {
  isOpen: boolean;
  workId: string | null;
  initialImageName?: string;
  onClose: () => void;
  onSelectWork?: (workId: string) => void;
}

export const GeotagEvidenceModal: React.FC<GeotagEvidenceModalProps> = ({
  isOpen,
  workId,
  initialImageName,
  onClose,
  onSelectWork,
}) => {
  const record = getGeotagEvidence(workId);
  const [selectedImageName, setSelectedImageName] = useState<string | undefined>();
  const [zoom, setZoom] = useState(1);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [riskWork, setRiskWork] = useState<WorkRecord | null>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const image = record?.images.find((candidate) => candidate.name === initialImageName)
      || record?.gpsImages[0]
      || record?.images[0];
    setSelectedImageName(image?.name);
    setZoom(1);
    setImageLoadError(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, workId, initialImageName, record, onClose]);

  useEffect(() => {
    if (!isOpen || !workId) {
      setRiskWork(null);
      return undefined;
    }
    let cancelled = false;
    fetchWorkDetail(workId)
      .then((response) => {
        if (!cancelled) setRiskWork(response.work || null);
      })
      .catch(() => {
        if (!cancelled) setRiskWork(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, workId]);

  const selectedImage = useMemo(
    () => record?.images.find((image) => image.name === selectedImageName) || record?.images[0],
    [record, selectedImageName],
  );
  const selectedGps = selectedImage?.gps;
  const firstGpsImage = record?.gpsImages[0];
  const selectedIndex = record?.images.findIndex((image) => image.name === selectedImage?.name) ?? -1;
  const displayWorkId = riskWork?.work_id || (workId && workId.includes('/') ? workId : record?.fullWorkId || record?.workId || workId);
  const formatAmount = (amount?: number) => `₹${(Number(amount || 0) / 100000).toFixed(2)} L`;

  if (!isOpen) return null;

  const selectRelativeImage = (delta: number) => {
    if (!record || record.images.length === 0) return;
    const nextIndex = (selectedIndex + delta + record.images.length) % record.images.length;
    setSelectedImageName(record.images[nextIndex].name);
    setZoom(1);
  };

  return (
    <div className="geotag-evidence-modal fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 lg:p-6" role="dialog" aria-modal="true" aria-label="Photographic evidence preview">
      <button aria-label="Close evidence preview" onClick={onClose} className="geotag-evidence-modal__backdrop absolute inset-0 backdrop-blur-sm" />
      <div className="geotag-evidence-modal__panel relative z-10 flex max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                <ImageIcon className="h-3.5 w-3.5" /> Visual field evidence
              </div>
              <h2 className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white">Work {displayWorkId || '—'}</h2>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="geotag-evidence-modal__image-canvas relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3 sm:p-5">
            {selectedImage && !imageLoadError ? (
              <div className="relative inline-block max-h-full max-w-full origin-center transition-transform duration-150" style={{ transform: `scale(${zoom})` }}>
                <img
                  src={selectedImage.url}
                  alt={`Photographic evidence for work ${displayWorkId || workId}`}
                  onError={() => setImageLoadError(true)}
                  className="block h-auto max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                />
                {selectedGps?.bbox && (
                  <div
                    className="pointer-events-none absolute z-10 rounded-sm border-2 border-emerald-300 bg-emerald-400/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.12),0_0_18px_rgba(52,211,153,0.8)]"
                    style={{
                      left: `${selectedGps.bbox.x_pct}%`,
                      top: `${selectedGps.bbox.y_pct}%`,
                      width: `${selectedGps.bbox.w_pct}%`,
                      height: `${selectedGps.bbox.h_pct}%`,
                    }}
                  >
                    <span className="absolute bottom-full left-0 mb-1 whitespace-nowrap rounded-md border border-emerald-300/80 bg-emerald-400 px-2 py-1 text-[10px] font-black text-slate-950 shadow-lg">
                      📍 STAMPED GPS: {selectedGps.raw_stamp_text || `${selectedGps.latitude}, ${selectedGps.longitude}`}
                    </span>
                  </div>
                )}
              </div>
            ) : selectedImage ? (
              <div className="rounded-xl border border-dashed border-rose-300 bg-rose-50 px-6 py-10 text-center text-xs text-rose-700 dark:border-rose-700/70 dark:bg-rose-950/30 dark:text-rose-200">
                The image file could not be loaded from the evidence archive.
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">No photographic evidence is attached to this work.</div>
            )}

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900/90">
              <button onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
              <button onClick={() => setZoom(1)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white" aria-label="Reset zoom"><RotateCcw className="h-4 w-4" /></button>
              <span className="w-12 text-center font-mono text-[10px] text-slate-600 dark:text-slate-400">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          {selectedImage && !selectedGps && firstGpsImage && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              This photo has no verified visual GPS stamp. No bounding box is drawn.{' '}
              <button onClick={() => setSelectedImageName(firstGpsImage.name)} className="font-bold underline underline-offset-2 hover:text-amber-950 dark:hover:text-white">Switch to the geotagged photo</button>
            </div>
          )}

          <div className="border-t border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-500">
              <span>{record?.images.length || 0} attached photo{record?.images.length === 1 ? '' : 's'}</span>
              {record && record.images.length > 1 && <span>Photo {(selectedIndex + 1).toLocaleString()} of {record.images.length}</span>}
            </div>
            <div className="flex items-center gap-2">
              {record && record.images.length > 1 && <button onClick={() => selectRelativeImage(-1)} className="hidden rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:block" aria-label="Previous photo"><ChevronLeft className="h-4 w-4" /></button>}
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {record?.images.map((image) => (
                  <button key={image.name} onClick={() => { setSelectedImageName(image.name); setZoom(1); }} className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${image.name === selectedImage?.name ? 'border-emerald-400' : 'border-slate-300 hover:border-slate-500 dark:border-slate-700'}`} title={image.name}>
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                    {image.gps && <span className="absolute bottom-0 left-0 right-0 bg-emerald-400/95 py-0.5 text-[8px] font-black text-slate-950">📍 GPS</span>}
                  </button>
                ))}
              </div>
              {record && record.images.length > 1 && <button onClick={() => selectRelativeImage(1)} className="hidden rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:block" aria-label="Next photo"><ChevronRight className="h-4 w-4" /></button>}
            </div>
          </div>
        </div>

        <aside className="geotag-evidence-modal__aside w-full shrink-0 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70 sm:p-5 lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-500">Audit telemetry</p>
              <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{record?.title || `Work ${displayWorkId || workId}`}</h3>
            </div>
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
          </div>

          <div className={`mt-4 rounded-xl border px-3 py-2 text-[11px] font-bold ${record?.status === 'GEOTAG_VERIFIED' ? 'border-emerald-800/70 bg-emerald-950/50 text-emerald-300' : record?.hasPhotoEvidence ? 'border-amber-800/70 bg-amber-950/40 text-amber-200' : 'border-rose-800/70 bg-rose-950/40 text-rose-300'}`}>
            {record ? (record.status === 'GEOTAG_VERIFIED' ? '🟢 Geotagged Picture Verified' : record.hasPhotoEvidence ? '🟢 Scanned Picture Present (Untagged)' : '🔴 Missing / No Files') : 'Record unavailable'}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-[11px] dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-500">Work details</p>
            <dl className="mt-2 space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Work ID</dt><dd className="text-right font-mono font-bold text-slate-900 dark:text-slate-200">{displayWorkId || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Constituency</dt><dd className="text-right font-semibold text-slate-700 dark:text-slate-300">{record?.constituency || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Mandal</dt><dd className="text-right font-semibold text-slate-700 dark:text-slate-300">{record?.mandal || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Category</dt><dd className="text-right font-semibold text-slate-700 dark:text-slate-300">{record?.category || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Completion</dt><dd className="text-right font-semibold text-slate-700 dark:text-slate-300">{record?.completionDate || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Attached files</dt><dd className="font-semibold text-slate-700 dark:text-slate-300">{record?.attachedFiles.length || 0}</dd></div>
            </dl>
            {record?.auditReason && <p className="mt-3 border-t border-slate-200 pt-3 leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">{record.auditReason}</p>}
          </div>

          {riskWork && <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-[11px] dark:border-indigo-800/70 dark:bg-indigo-950/30">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Complete risk record</p>
            <dl className="mt-2 space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd className="text-right font-semibold text-slate-900 dark:text-slate-200">{riskWork.work_status || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Risk level</dt><dd className="font-bold text-amber-300">{riskWork.overall_risk_level || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Composite risk</dt><dd className="font-mono font-bold text-slate-900 dark:text-slate-200">{Number(riskWork.composite_risk_score || 0).toFixed(1)} / 100</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Sanctioned</dt><dd className="font-mono font-semibold text-slate-900 dark:text-slate-200">{formatAmount(riskWork.sanction_amount)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Expenditure</dt><dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-300">{formatAmount(riskWork.effective_expenditure)}</dd></div>
            </dl>
            {onSelectWork && <button onClick={() => { onClose(); onSelectWork(riskWork.work_id); }} className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-indigo-300 bg-indigo-100 px-3 py-2 text-[11px] font-bold text-indigo-800 transition hover:bg-indigo-200 dark:border-indigo-500/70 dark:bg-indigo-500/20 dark:text-indigo-200 dark:hover:bg-indigo-500/35">Open full risk profile</button>}
          </div>}

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/60">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-500">Coordinates</p>
            {selectedGps ? (
              <div className="mt-2 space-y-2 font-mono text-xs">
                <div className="flex justify-between gap-3"><span className="text-slate-500">Latitude</span><span className="font-bold text-emerald-300">{formatCoordinate(selectedGps.latitude, selectedGps.latitude >= 0 ? 'N' : 'S')}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Longitude</span><span className="font-bold text-emerald-300">{formatCoordinate(selectedGps.longitude, selectedGps.longitude >= 0 ? 'E' : 'W')}</span></div>
                <div className="border-t border-slate-200 pt-2 text-[10px] leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">{formatDms(selectedGps.latitude, true)}<br />{formatDms(selectedGps.longitude, false)}</div>
              </div>
            ) : <p className="mt-2 text-xs text-slate-500">No coordinates are verified for this specific photo.</p>}
          </div>

          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Watermark source</span><span className="text-right font-semibold text-slate-700 dark:text-slate-300">{selectedGps?.source || 'Not detected'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Location</span><span className="text-right font-semibold text-slate-700 dark:text-slate-300">{selectedGps?.location_name || record?.mandal || 'Not available'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Inspection time</span><span className="text-right font-semibold text-slate-700 dark:text-slate-300">{selectedGps?.timestamp || record?.completionDate || 'Not available'}</span></div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="geotag-evidence-modal__coordinate-canvas relative h-36 overflow-hidden">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(35deg,transparent_48%,#67e8f9_49%,transparent_51%),linear-gradient(120deg,transparent_48%,#22c55e_49%,transparent_51%)] [background-size:72px_72px]" />
              {selectedGps && <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-400 px-2 py-1 text-[9px] font-black text-slate-950 shadow-[0_0_24px_rgba(52,211,153,0.8)]"><MapPin className="h-3 w-3" /> GPS</div>}
              <span className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[9px] font-bold text-slate-700 dark:bg-slate-950/75 dark:text-slate-300">Coordinate preview</span>
            </div>
          </div>

          {selectedGps && <a href={mapsUrl(selectedGps)} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-300">Open in Google Maps <ExternalLink className="h-3.5 w-3.5" /></a>}
        </aside>
      </div>
    </div>
  );
};

export default GeotagEvidenceModal;
