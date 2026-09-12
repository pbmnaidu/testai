import React, { useState } from 'react';
import { Eye, Image as ImageIcon, MapPin } from 'lucide-react';
import { formatCoordinate, getGeotagEvidence } from '../lib/geotagEvidence';
import GeotagEvidenceModal from './GeotagEvidenceModal';

interface GeotagEvidenceCardProps {
  workId: string;
  onOpenEvidence?: (workId: string, imageName?: string) => void;
}

export const GeotagEvidenceCard: React.FC<GeotagEvidenceCardProps> = ({ workId, onOpenEvidence }) => {
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const record = getGeotagEvidence(workId);
  const previewImage = record?.gpsImages[0] || record?.images[0];
  const gps = record?.gpsImages[0]?.gps;

  const openPreview = () => {
    if (onOpenEvidence) onOpenEvidence(workId, previewImage?.name);
    else setLocalModalOpen(true);
  };

  if (!record || (!record.hasPhotoEvidence && record.attachedFiles.length === 0)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/25">
        <div className="flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div><h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">Photographic Site Inspection &amp; Geotag Evidence</h3><p className="mt-1 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-300">No physical site inspection photographs or completion dossiers uploaded to MoSPI.</p></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300"><ImageIcon className="h-3.5 w-3.5" /> Field evidence</div>
            <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">Photographic Site Inspection &amp; Geotag Evidence</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Read-only evidence from the extracted visual audit manifest.</p>
          </div>
          {gps ? <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-300">📍 Genuine GPS Stamped</span> : <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">🟢 Physical Photo Attached (Untagged)</span>}
        </div>

        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
          {previewImage ? <img src={previewImage.url} alt={`Site inspection evidence for work ${workId}`} className="h-32 w-full rounded-xl border border-slate-200 object-cover md:w-56 dark:border-slate-700" /> : <div className="flex h-32 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 md:w-56 dark:border-slate-700">No image preview</div>}
          <div className="min-w-0 flex-1 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><MapPin className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> <span>{record.images.length} attached photo{record.images.length === 1 ? '' : 's'} · {record.hasBillProof ? 'Bill / UC proof also attached' : 'No bill / UC proof in this manifest'}</span></div>
            {gps ? <div className="grid grid-cols-1 gap-1 font-mono text-[11px] text-slate-700 sm:grid-cols-2 dark:text-slate-300"><span>Lat {formatCoordinate(gps.latitude)}</span><span>Long {formatCoordinate(gps.longitude)}</span></div> : <p className="text-slate-500 dark:text-slate-400">The attached photo has no verified GPS watermark, so no coordinate or bounding box is shown.</p>}
            <button onClick={openPreview} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"><Eye className="h-3.5 w-3.5" /> Inspect Geotag Stamp &amp; Coordinates</button>
          </div>
        </div>
      </section>
      {!onOpenEvidence && <GeotagEvidenceModal isOpen={localModalOpen} workId={workId} initialImageName={previewImage?.name} onClose={() => setLocalModalOpen(false)} />}
    </>
  );
};

export default GeotagEvidenceCard;
