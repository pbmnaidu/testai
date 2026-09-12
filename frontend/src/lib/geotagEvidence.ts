import auditJson from '../../../data/processed/combined_geotag_audit.json';
import manifestJson from '../../../data/processed/combined_download_manifest.json';

export interface GeotagBoundingBox {
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
}

export interface GeotagStamp {
  latitude: number;
  longitude: number;
  source?: string;
  raw_stamp_text?: string;
  location_name?: string | null;
  timestamp?: string;
  image_name?: string;
  bbox?: GeotagBoundingBox;
}

interface AuditSampleImage {
  name: string;
  is_photo?: boolean;
  has_gps?: boolean;
  gps?: GeotagStamp | null;
}

interface AuditAttachedFile {
  name: string;
  type?: string;
  size_kb?: number;
  path?: string;
}

interface AuditRecord {
  work_id: string;
  title?: string;
  description?: string;
  category?: string;
  mandal?: string;
  constituency?: string;
  state?: string;
  completion_date?: string;
  has_real_gps?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  audit_classification?: string;
  audit_badge_text?: string;
  audit_reason?: string;
  geocoding_source?: string | null;
  risk_score?: number;
  risk_level?: string;
  work_risk_description?: string;
  missing_items?: string[];
  missing_summary?: string;
  is_fraud_suspected?: boolean;
  fraud_details?: {
    is_fraud_suspected?: boolean;
    fraud_type?: string;
    fraud_matched_work_id?: string;
    fraud_matched_work_title?: string;
    fraud_matched_mandal?: string;
    fraud_matched_coords?: string;
    fraud_distance_meters?: number;
    fraud_matched_image?: string;
    override_risk_score?: number;
    reason?: string;
  } | null;
  attached_files?: AuditAttachedFile[];
  pdf_audit?: {
    file_name?: string | null;
    file_size_kb?: number;
    page_count?: number;
    has_progress_tables?: boolean;
    total_images?: number;
    has_photo_evidence?: boolean;
    has_bill_proof?: boolean;
    bill_proof_keywords?: string[];
    geotag_status?: string;
    sample_images?: AuditSampleImage[];
  };
}

interface ManifestRecord {
  pdf_file?: string | null;
  pdf_size?: number;
  files?: string[];
  images?: string[];
  image_gps?: Record<string, GeotagStamp>;
}

export interface EvidenceImage {
  name: string;
  url: string;
  sizeKb?: number;
  gps?: GeotagStamp;
}

export interface GeotagEvidenceRecord {
  workId: string;
  fullWorkId?: string;
  title: string;
  description: string;
  category: string;
  mandal: string;
  constituency: string;
  state: string;
  completionDate: string;
  status: string;
  auditBadgeText: string;
  auditReason: string;
  hasPhotoEvidence: boolean;
  hasBillProof: boolean;
  hasProgressTables?: boolean;
  pageCount?: number;
  isFraudSuspected?: boolean;
  fraudDetails?: AuditRecord['fraud_details'];
  missingItems: string[];
  missingSummary: string;
  riskScore?: number;
  riskLevel?: string;
  workRiskDescription?: string;
  isStubDossier?: boolean;
  fraudCollision?: {
    isSuspectedFraud: boolean;
    matchedWorkId?: string;
    fraudReason?: string;
    collisionType?: string;
  };
  attachedFiles: AuditAttachedFile[];
  images: EvidenceImage[];
  gpsImages: EvidenceImage[];
  gps?: GeotagStamp;
}

const audits = auditJson as AuditRecord[];
const manifests = manifestJson as Record<string, ManifestRecord>;

const isValidGps = (gps?: GeotagStamp | null): gps is GeotagStamp => Boolean(
  gps && Number.isFinite(Number(gps.latitude)) && Number.isFinite(Number(gps.longitude)),
);

const isValidBoundingBox = (bbox?: GeotagBoundingBox): bbox is GeotagBoundingBox => Boolean(
  bbox
  && ['x_pct', 'y_pct', 'w_pct', 'h_pct'].every((key) => Number.isFinite(Number(bbox[key as keyof GeotagBoundingBox]))),
);

const publicImageUrl = (name: string) => `/downloads/images/${encodeURIComponent(name)}`;

const normalizedWorkId = (value: string | number | null | undefined) => {
  const text = String(value ?? '').trim();
  return text.match(/(\d+)\s*$/)?.[1] || text;
};

const buildEvidenceRecord = (audit: AuditRecord): GeotagEvidenceRecord => {
  const manifest = manifests[audit.work_id] || manifests[normalizedWorkId(audit.work_id)] || {};
  const auditSamples = audit.pdf_audit?.sample_images || [];
  const attachedByName = new Map((audit.attached_files || []).map((file) => [file.name, file]));
  const imageNames = Array.from(new Set([
    ...(manifest.images || []),
    ...auditSamples.filter((sample) => sample.is_photo !== false).map((sample) => sample.name),
  ]));

  const images = imageNames.map((name) => {
    // The manifest is the source of truth for per-image GPS and bounding boxes.
    const manifestGps = manifest.image_gps?.[name];
    const gps = isValidGps(manifestGps) && isValidBoundingBox(manifestGps.bbox)
      ? manifestGps
      : undefined;
    return {
      name,
      url: publicImageUrl(name),
      sizeKb: attachedByName.get(name)?.size_kb,
      gps: gps || undefined,
    };
  });

  const gpsImages = images.filter((image) => isValidGps(image.gps) && isValidBoundingBox(image.gps.bbox));
  const firstGps = gpsImages[0]?.gps;
  const status = audit.pdf_audit?.geotag_status
    || (gpsImages.length > 0 ? 'GEOTAG_VERIFIED' : audit.pdf_audit?.has_photo_evidence ? 'PHOTO_PRESENT_UNTAGGED' : 'NO_DOCUMENT_UPLOADED');

  return {
    workId: audit.work_id,
    title: audit.title || audit.description || `Work ${audit.work_id}`,
    description: audit.description || audit.title || '',
    category: audit.category || 'Unclassified',
    mandal: audit.mandal || '—',
    constituency: audit.constituency || '—',
    state: audit.state || '—',
    completionDate: audit.completion_date || '—',
    status,
    auditBadgeText: audit.audit_badge_text || status,
    auditReason: audit.audit_reason || '',
    hasPhotoEvidence: Boolean(audit.pdf_audit?.has_photo_evidence || images.length),
    hasBillProof: Boolean(
      audit.pdf_audit?.has_bill_proof
      && ((audit.attached_files || []).length > 0 || (manifest.files || []).length > 0),
    ),
    hasProgressTables: audit.pdf_audit?.has_progress_tables,
    pageCount: audit.pdf_audit?.page_count,
    isFraudSuspected: Boolean(audit.is_fraud_suspected),
    fraudDetails: audit.fraud_details,
    fraudCollision: audit.is_fraud_suspected ? {
      isSuspectedFraud: true,
      matchedWorkId: audit.fraud_details?.fraud_matched_work_id,
      fraudReason: audit.fraud_details?.reason,
      collisionType: audit.fraud_details?.fraud_type,
    } : undefined,
    isStubDossier: Boolean(
      audit.pdf_audit?.page_count != null
      && audit.pdf_audit.page_count > 0
      && audit.pdf_audit.page_count <= 2
      && !audit.pdf_audit?.has_photo_evidence
      && !images.length
      && !audit.pdf_audit?.has_bill_proof,
    ),
    missingItems: audit.missing_items || [],
    missingSummary: audit.missing_summary || '',
    riskScore: audit.risk_score,
    riskLevel: audit.risk_level,
    workRiskDescription: audit.work_risk_description,
    attachedFiles: audit.attached_files || [],
    images,
    gpsImages,
    gps: firstGps,
  };
};

export const geotagEvidenceRecords = audits.map(buildEvidenceRecord);

const evidenceByWorkId = new Map<string, GeotagEvidenceRecord>();
geotagEvidenceRecords.forEach((record) => {
  evidenceByWorkId.set(String(record.workId).trim(), record);
  evidenceByWorkId.set(normalizedWorkId(record.workId), record);
});

export const applyFullWorkIds = (workIdMap: Record<string, string>) => {
  geotagEvidenceRecords.forEach((record) => {
    const fullWorkId = workIdMap[normalizedWorkId(record.workId)] || workIdMap[record.workId];
    if (!fullWorkId) return;
    record.fullWorkId = fullWorkId;
    record.workId = fullWorkId;
    evidenceByWorkId.set(fullWorkId, record);
  });
};

export const getGeotagEvidence = (workId: string | null | undefined) => (
  workId
    ? evidenceByWorkId.get(String(workId).trim()) || evidenceByWorkId.get(normalizedWorkId(workId))
    : undefined
);

export const formatCoordinate = (value?: number, suffix?: string) => (
  value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(6)}°${suffix ? ` ${suffix}` : ''}`
);

export const formatDms = (value?: number, latitude = true) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = ((minutesFloat - minutes) * 60).toFixed(2);
  const direction = latitude ? (Number(value) >= 0 ? 'N' : 'S') : (Number(value) >= 0 ? 'E' : 'W');
  return `${degrees}° ${minutes}' ${seconds}\" ${direction}`;
};

export const mapsUrl = (gps?: GeotagStamp) => (
  gps ? `https://www.google.com/maps/search/?api=1&query=${gps.latitude},${gps.longitude}` : '#'
);

export const fileUrl = (file: AuditAttachedFile) => {
  const path = file.path || '';
  if (path.startsWith('downloads/')) return `/${path}`;
  if (/\.(jpe?g|png|webp)$/i.test(file.name)) return publicImageUrl(file.name);
  return `/downloads/pdfs/${encodeURIComponent(file.name)}`;
};

export const statusLabel = (status: string) => {
  switch (status) {
    case 'FRAUD_SUSPECTED': return '🚨 Suspected Fraud (100% Risk Override)';
    case 'GEOTAG_VERIFIED': return '🟢 Geotagged Picture Verified';
    case 'PHOTO_PRESENT_UNTAGGED': return '🟢 Scanned Picture Present (Untagged)';
    case 'TEXT_BILL_PROOF_ONLY': return '🟡 Bill Proof Only';
    case 'STUB_DOSSIER_NO_EVIDENCE': return '🔴 Stub Dossier (Critical Risk)';
    case 'NO_BILLS_NO_PROGRESS_TABLES': return '🔴 Missing Bills / Progress Tables';
    case 'FILE_NO_BILLS_OR_IMAGES': return '🟠 File Present, No Photo';
    default: return '🔴 Missing / No Files';
  }
};
