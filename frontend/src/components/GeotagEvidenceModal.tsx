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

interface GeotagEvidenceModalProps {
  isOpen: boolean;
  workId: string | null;
  initialImageName?: string;
  onClose: () => void;
}

export const GeotagEvidenceModal: React.FC<GeotagEvidenceModalProps> = ({
  isOpen,
  workId,
  initialImageName,
  onClose,
}) => {
  const record = getGeotagEvidence(workId);
  const [selectedImageName, setSelectedImageName] = useState<string | undefined>();
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!isOpen) return undefined;
    const image = record?.images.find((candidate) => candidate.name === initialImageName)
      || record?.gpsImages[0]
      || record?.images[0];
    setSelectedImageName(image?.name);
    setZoom(1);
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

  const selectedImage = useMemo(
    () => record?.images.find((image) => image.name === selectedImageName) || record?.images[0],
    [record, selectedImageName],
  );
  const selectedGps = selectedImage?.gps;
  const firstGpsImage = record?.gpsImages[0];
  const selectedIndex = record?.images.findIndex((image) => image.name === selectedImage?.name) ?? -1;

  if (!isOpen) return null;

  const selectRelativeImage = (delta: number) => {
    if (!record || record.images.length === 0) return;
    const nextIndex = (selectedIndex + delta + record.images.length) % record.images.length;
    setSelectedImageName(record.images[nextIndex].name);
    setZoom(1);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Photographic evidence preview">
      <button aria-label="Close evidence preview" onClick={onClose} className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                <ImageIcon className="h-3.5 w-3.5" /> Visual field evidence
              </div>
              <h2 className="mt-1 truncate text-sm font-bold text-white">Work {record?.workId || workId || '—'}</h2>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,_#1e293b_0,_#020617_70%)] p-4 sm:min-h-[460px]">
            {selectedImage ? (
              <div className="relative inline-block max-w-full origin-center transition-transform duration-150" style={{ transform: `scale(${zoom})` }}>
                <img src={selectedImage.url} alt={`Photographic evidence for work ${record?.workId || workId}`} className="block max-h-[58vh] max-w-[min(78vw,920px)] rounded-lg object-contain shadow-2xl" />
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
            ) : (
              <div className="rounded-xl border border-dashed border-slate-700 px-6 py-10 text-center text-xs text-slate-400">No photographic evidence is attached to this work.</div>
            )}

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/90 p-1 shadow-xl">
              <button onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
              <button onClick={() => setZoom(1)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Reset zoom"><RotateCcw className="h-4 w-4" /></button>
              <span className="w-12 text-center font-mono text-[10px] text-slate-400">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))} className="rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            </div>
          </div>

          {selectedImage && !selectedGps && firstGpsImage && (
            <div className="border-t border-amber-900/60 bg-amber-950/40 px-4 py-2.5 text-[11px] text-amber-200">
              This photo has no verified visual GPS stamp. No bounding box is drawn.{' '}
              <button onClick={() => setSelectedImageName(firstGpsImage.name)} className="font-bold underline underline-offset-2 hover:text-white">Switch to the geotagged photo</button>
            </div>
          )}

          <div className="border-t border-slate-800 bg-slate-900/80 p-3">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>{record?.images.length || 0} attached photo{record?.images.length === 1 ? '' : 's'}</span>
              {record && record.images.length > 1 && <span>Photo {(selectedIndex + 1).toLocaleString()} of {record.images.length}</span>}
            </div>
            <div className="flex items-center gap-2">
              {record && record.images.length > 1 && <button onClick={() => selectRelativeImage(-1)} className="hidden rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white sm:block" aria-label="Previous photo"><ChevronLeft className="h-4 w-4" /></button>}
              <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                {record?.images.map((image) => (
                  <button key={image.name} onClick={() => { setSelectedImageName(image.name); setZoom(1); }} className={`relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${image.name === selectedImage?.name ? 'border-emerald-400' : 'border-slate-700 hover:border-slate-500'}`} title={image.name}>
                    <img src={image.url} alt="" className="h-full w-full object-cover" />
                    {image.gps && <span className="absolute bottom-0 left-0 right-0 bg-emerald-400/95 py-0.5 text-[8px] font-black text-slate-950">📍 GPS</span>}
                  </button>
                ))}
              </div>
              {record && record.images.length > 1 && <button onClick={() => selectRelativeImage(1)} className="hidden rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white sm:block" aria-label="Next photo"><ChevronRight className="h-4 w-4" /></button>}
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 overflow-y-auto border-t border-slate-800 bg-slate-900/70 p-4 sm:p-5 lg:w-[330px] lg:border-l lg:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Audit telemetry</p>
              <h3 className="mt-1 text-base font-bold text-white">{record?.title || `Work ${workId}`}</h3>
            </div>
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
          </div>

          <div className={`mt-4 rounded-xl border px-3 py-2 text-[11px] font-bold ${record?.status === 'GEOTAG_VERIFIED' ? 'border-emerald-800/70 bg-emerald-950/50 text-emerald-300' : record?.hasPhotoEvidence ? 'border-amber-800/70 bg-amber-950/40 text-amber-200' : 'border-rose-800/70 bg-rose-950/40 text-rose-300'}`}>
            {record ? (record.status === 'GEOTAG_VERIFIED' ? '🟢 Geotagged Picture Verified' : record.hasPhotoEvidence ? '🟢 Scanned Picture Present (Untagged)' : '🔴 Missing / No Files') : 'Record unavailable'}
          </div>

          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Work details</p>
            <dl className="mt-2 space-y-2">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Work ID</dt><dd className="font-mono font-bold text-slate-200">{record?.workId || workId || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Constituency</dt><dd className="text-right font-semibold text-slate-300">{record?.constituency || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Mandal</dt><dd className="text-right font-semibold text-slate-300">{record?.mandal || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Category</dt><dd className="text-right font-semibold text-slate-300">{record?.category || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Completion</dt><dd className="text-right font-semibold text-slate-300">{record?.completionDate || '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Attached files</dt><dd className="font-semibold text-slate-300">{record?.attachedFiles.length || 0}</dd></div>
            </dl>
            {record?.auditReason && <p className="mt-3 border-t border-slate-800 pt-3 leading-relaxed text-slate-400">{record.auditReason}</p>}
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Coordinates</p>
            {selectedGps ? (
              <div className="mt-2 space-y-2 font-mono text-xs">
                <div className="flex justify-between gap-3"><span className="text-slate-500">Latitude</span><span className="font-bold text-emerald-300">{formatCoordinate(selectedGps.latitude, selectedGps.latitude >= 0 ? 'N' : 'S')}</span></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Longitude</span><span className="font-bold text-emerald-300">{formatCoordinate(selectedGps.longitude, selectedGps.longitude >= 0 ? 'E' : 'W')}</span></div>
                <div className="border-t border-slate-800 pt-2 text-[10px] leading-relaxed text-slate-400">{formatDms(selectedGps.latitude, true)}<br />{formatDms(selectedGps.longitude, false)}</div>
              </div>
            ) : <p className="mt-2 text-xs text-slate-500">No coordinates are verified for this specific photo.</p>}
          </div>

          <div className="mt-3 space-y-2 text-[11px]">
            <div className="flex justify-between gap-3"><span className="text-slate-500">Watermark source</span><span className="text-right font-semibold text-slate-300">{selectedGps?.source || 'Not detected'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Location</span><span className="text-right font-semibold text-slate-300">{selectedGps?.location_name || record?.mandal || 'Not available'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Inspection time</span><span className="text-right font-semibold text-slate-300">{selectedGps?.timestamp || record?.completionDate || 'Not available'}</span></div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div className="relative h-36 overflow-hidden bg-[radial-gradient(circle_at_45%_40%,_#164e63_0,_#0f172a_52%,_#020617_100%)]">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(35deg,transparent_48%,#67e8f9_49%,transparent_51%),linear-gradient(120deg,transparent_48%,#22c55e_49%,transparent_51%)] [background-size:72px_72px]" />
              {selectedGps && <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-400 px-2 py-1 text-[9px] font-black text-slate-950 shadow-[0_0_24px_rgba(52,211,153,0.8)]"><MapPin className="h-3 w-3" /> GPS</div>}
              <span className="absolute bottom-2 left-2 rounded bg-slate-950/75 px-2 py-1 text-[9px] font-bold text-slate-300">Coordinate preview</span>
            </div>
          </div>

          {selectedGps && <a href={mapsUrl(selectedGps)} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-black text-slate-950 transition hover:bg-emerald-300">Open in Google Maps <ExternalLink className="h-3.5 w-3.5" /></a>}
        </aside>
      </div>
    </div>
  );
};

export default GeotagEvidenceModal;
