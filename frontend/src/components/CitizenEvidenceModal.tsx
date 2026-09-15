import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HardHat,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { CitizenEvidenceConfig, CitizenEvidenceRecord, PublicWorkRecord, WorkRecord } from '../types';
import { submitCitizenEvidence } from '../services/api';

export type EvidenceRole = 'citizen' | 'contractor_attendance' | 'contractor_progress' | 'officer_inspection';

type EvidenceStep = 'category' | 'capture' | 'description' | 'review' | 'success';

interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface CitizenEvidenceModalProps {
  isOpen: boolean;
  work: (PublicWorkRecord | WorkRecord | { work_id: string; latitude?: number | null; longitude?: number | null; description?: string; [key: string]: any }) | null;
  config?: CitizenEvidenceConfig;
  initialRole?: EvidenceRole;
  onClose: () => void;
  onSubmitted?: (record: CitizenEvidenceRecord) => void;
}

const citizenCategories = [
  ['🚧', 'Work Progress Issue'],
  ['⚠️', 'Work Quality Concern'],
  ['💰', 'Suspected Financial/Quantity Mismatch'],
  ['🏗️', 'Work Not Found at Location'],
  ['📅', 'Work Delayed'],
  ['❌', 'Work Appears Incomplete'],
  ['📍', 'Work Location Mismatch'],
  ['📋', 'Work Details Mismatch'],
  ['🛠️', 'Damaged / Poor Condition'],
  ['✅', 'Work Completed Successfully'],
  ['ℹ️', 'General Observation'],
  ['•', 'Other'],
] as const;

const contractorAttendanceCategories = [
  ['👷', 'Contractor Daily Attendance & Labor Log'],
  ['👥', 'Shift Workforce Muster Roll Verification'],
  ['🧱', 'Specialized Trade Labor Deployment'],
  ['⏱️', 'Overtime / Extended Shift Log'],
  ['•', 'Other Attendance Record'],
] as const;

const contractorProgressCategories = [
  ['🏗️', 'Foundation & Structural Work Proof'],
  ['🧱', 'Civil & Masonry Progress Snapshot'],
  ['🛣️', 'Paving / Road Layering In-Progress'],
  ['💧', 'Plumbing & Drainage Milestones'],
  ['⚡', 'Electrical & Equipment Deployment'],
  ['🏁', 'Substantial Milestone Ready for Measurement'],
  ['•', 'Other Contractor Progress Evidence'],
] as const;

const officerInspectionCategories = [
  ['🛡️', 'Routine Implementing Officer Field Inspection'],
  ['🔍', 'Quality & Technical Specification Audit'],
  ['📐', 'Physical Measurement & BOQ Verification'],
  ['⚠️', 'Site Rectification Notice Issued'],
  ['✅', 'Official Work Completion Sign-off'],
  ['•', 'Other Officer Live Observation'],
] as const;

const roleDefinitions: Record<EvidenceRole, { label: string; badge: string; icon: React.ComponentType<{ className?: string }>; description: string }> = {
  citizen: {
    label: 'Citizen Feedback & Compliance',
    badge: 'Citizen Protocol',
    icon: ShieldAlert,
    description: 'Public observation, work status report, or community quality review.',
  },
  contractor_attendance: {
    label: 'Contractor Daily Attendance & Labor Log',
    badge: 'Contractor Muster',
    icon: HardHat,
    description: 'On-site daily worker headcount and contractor labor muster record.',
  },
  contractor_progress: {
    label: 'Contractor Work Progress Evidence',
    badge: 'Contractor Progress',
    icon: Users,
    description: 'Contractor photographic milestones for payment verification.',
  },
  officer_inspection: {
    label: 'Implementing Officer Live Inspection',
    badge: 'Official Inspection',
    icon: UserCheck,
    description: 'Statutory physical verification by the designated field officer.',
  },
};

const formatDistance = (value?: number | null) => (value == null ? 'Not available' : `${Math.round(value)} m`);
const formatCoordinate = (value?: number | null) => (value == null ? '—' : Number(value).toFixed(6));

export const CitizenEvidenceModal: React.FC<CitizenEvidenceModalProps> = ({
  isOpen,
  work,
  config,
  initialRole = 'citizen',
  onClose,
  onSubmitted,
}) => {
  const [step, setStep] = useState<EvidenceStep>('category');
  const [evidenceType, setEvidenceType] = useState<EvidenceRole>(initialRole);
  const [staffCount, setStaffCount] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'loading' | 'ready' | 'denied' | 'error'>('idle');
  const [locationError, setLocationError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [description, setDescription] = useState('');
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<CitizenEvidenceRecord | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const accuracyThreshold = config?.gps_accuracy_threshold_meters || 50;
  const radiusThreshold = config?.allowed_evidence_radius_meters || 250;

  // Read live GPS position
  const readLiveLocation = () =>
    new Promise<DeviceLocation>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('This browser or device does not provide location capability.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          }),
        (error) =>
          reject(
            new Error(
              error.code === error.TIMEOUT
                ? 'Location request timed out. Please retry from an open area.'
                : error.code === error.PERMISSION_DENIED
                  ? 'Location permission was denied. Enable location in your browser/device settings.'
                  : 'Unable to obtain your current location. Please retry.'
            )
          ),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  const requestLocation = async () => {
    setLocationState('loading');
    setLocationError('');
    try {
      const nextLocation = await readLiveLocation();
      setLocation(nextLocation);
      setLocationState('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to obtain your current location. Please retry.';
      setLocationState(message.includes('permission') ? 'denied' : 'error');
      setLocationError(message);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser does not provide camera access. Use a secure HTTPS connection on a supported device.');
      return;
    }
    setIsStartingCamera(true);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      setCameraReady(false);
      setCameraError(
        error instanceof Error && error.name === 'NotAllowedError'
          ? 'Camera permission was denied. Live camera access is strictly required; gallery uploads are not accepted.'
          : 'The live camera could not be started.'
      );
    } finally {
      setIsStartingCamera(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  // Reset and auto-acquire GPS on open
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    setStep('category');
    setEvidenceType(initialRole);
    setStaffCount('');
    setCategory(
      initialRole === 'contractor_attendance'
        ? contractorAttendanceCategories[0][1]
        : initialRole === 'contractor_progress'
          ? contractorProgressCategories[0][1]
          : initialRole === 'officer_inspection'
            ? officerInspectionCategories[0][1]
            : ''
    );
    setLocation(null);
    setLocationState('idle');
    setLocationError('');
    setPhoto(null);
    setPreviewUrl('');
    setDescription('');
    setCapturedAt(null);
    setSubmitError('');
    setIsSubmitting(false);
    setSubmission(null);
    setCameraReady(false);
    setCameraError('');
    stopCamera();

    // Automatically trigger GPS acquisition immediately
    void requestLocation();
  }, [isOpen, work?.work_id, initialRole]);

  // Clean up tracks on unmount
  useEffect(() => () => {
    stopCamera();
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Auto-start camera when entering 'capture' step
  useEffect(() => {
    if (step === 'capture' && !cameraReady && !isStartingCamera) {
      void startCamera();
      if (!location) {
        void requestLocation();
      }
    }
  }, [step]);

  const distanceFromWork = useMemo(() => {
    const workLat = (work as any)?.latitude ?? (work as any)?.Latitude;
    const workLng = (work as any)?.longitude ?? (work as any)?.Longitude;
    if (!location || workLat == null || workLng == null) return null;
    const earthRadius = 6371008.8;
    const latA = (location.latitude * Math.PI) / 180;
    const latB = (Number(workLat) * Math.PI) / 180;
    const deltaLat = ((Number(workLat) - location.latitude) * Math.PI) / 180;
    const deltaLng = ((Number(workLng) - location.longitude) * Math.PI) / 180;
    const haversine =
      Math.sin(deltaLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
  }, [location, work]);

  if (!isOpen || !work) return null;

  const currentCategoryList =
    evidenceType === 'contractor_attendance'
      ? contractorAttendanceCategories
      : evidenceType === 'contractor_progress'
        ? contractorProgressCategories
        : evidenceType === 'officer_inspection'
          ? officerInspectionCategories
          : citizenCategories;

  const handleRoleChange = (role: EvidenceRole) => {
    setEvidenceType(role);
    if (role === 'contractor_attendance') {
      setCategory(contractorAttendanceCategories[0][1]);
    } else if (role === 'contractor_progress') {
      setCategory(contractorProgressCategories[0][1]);
    } else if (role === 'officer_inspection') {
      setCategory(officerInspectionCategories[0][1]);
    } else {
      setCategory('');
    }
  };

  const captureLivePhoto = async () => {
    setSubmitError('');
    setCameraError('');
    if (!cameraReady || !videoRef.current || !canvasRef.current || videoRef.current.videoWidth === 0) {
      setSubmitError('Start the live camera before taking the proof photo.');
      return;
    }
    setIsCapturing(true);
    try {
      // Auto-query exact GPS live position
      const liveLocation = await readLiveLocation().catch(() => location || { latitude: 0, longitude: 0, accuracy: 999 });
      const captureTime = new Date().toISOString();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth;
      const height = video.videoHeight;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The device could not prepare the camera capture surface.');

      // Draw camera frame
      context.drawImage(video, 0, 0, width, height);

      // Watermark Stamp overlay with full canonical work ID, role, category, GPS, and timestamp
      const stampHeight = Math.max(160, Math.round(height * 0.26));
      const fontSize = Math.max(18, Math.round(width / 46));
      context.fillStyle = 'rgba(2, 6, 23, 0.88)';
      context.fillRect(0, height - stampHeight, width, stampHeight);

      context.fillStyle = '#10b981'; // Emerald accent
      context.font = `800 ${fontSize}px Arial, sans-serif`;
      const roleLabel = roleDefinitions[evidenceType].badge.toUpperCase();
      context.fillText(`MPLADS LIVE AUDIT PROOF [${roleLabel}]`, Math.round(width * 0.025), height - stampHeight + fontSize * 1.3);

      context.fillStyle = '#ffffff';
      context.font = `600 ${Math.max(14, Math.round(fontSize * 0.72))}px Arial, sans-serif`;
      context.fillText(`Work ID: ${work.work_id}`, Math.round(width * 0.025), height - stampHeight + fontSize * 2.35);

      const staffText = evidenceType === 'contractor_attendance' && staffCount ? ` · Staff Count: ${staffCount} personnel` : '';
      context.fillText(`Record: ${category}${staffText}`, Math.round(width * 0.025), height - stampHeight + fontSize * 3.35);

      context.fillText(
        `GPS: ${formatCoordinate(liveLocation.latitude)}, ${formatCoordinate(liveLocation.longitude)} ±${Math.round(liveLocation.accuracy)}m [LIVE AUTO-TAGGED]`,
        Math.round(width * 0.025),
        height - stampHeight + fontSize * 4.35
      );

      context.fillText(
        `Captured: ${new Date(captureTime).toLocaleString()} · STRICT LIVE CAMERA CAPTURE ONLY`,
        Math.round(width * 0.025),
        height - stampHeight + fontSize * 5.35
      );

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('The camera image could not be encoded.'))), 'image/jpeg', 0.92)
      );
      const file = new File([blob], `${evidenceType}-proof-${Date.now()}.jpg`, { type: 'image/jpeg' });

      setLocation(liveLocation);
      setLocationState('ready');
      setCapturedAt(captureTime);
      setPhoto(file);
      setPreviewUrl(URL.createObjectURL(file));

      // Auto-populate description if empty for contractor attendance
      if (evidenceType === 'contractor_attendance' && !description) {
        setDescription(`Daily contractor muster roll: ${staffCount || 'N/A'} staff/workers physically on site. Captured via live field camera with high-accuracy GPS coordinates.`);
      }

      setStep('description');
      stopCamera();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The live camera capture failed.';
      setLocationError(message);
      setLocationState(message.includes('permission') ? 'denied' : 'error');
      setSubmitError(message);
    } finally {
      setIsCapturing(false);
    }
  };

  const submit = async () => {
    if (!photo || !category || description.trim().length < 5) return;
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const parsedStaff = evidenceType === 'contractor_attendance' && staffCount ? parseInt(staffCount, 10) : undefined;
      const saved = await submitCitizenEvidence({
        workId: work.work_id,
        category,
        description: description.trim(),
        evidenceType,
        staffCount: Number.isFinite(parsedStaff) ? parsedStaff : undefined,
        latitude: location?.latitude,
        longitude: location?.longitude,
        gpsAccuracy: location?.accuracy,
        capturedAt,
        liveCapture: true,
        image: photo,
      });
      setSubmission(saved);
      setStep('success');
      onSubmitted?.(saved);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Your evidence could not be submitted. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextFromCategory = () => {
    if (evidenceType === 'contractor_attendance' && !staffCount) {
      setSubmitError('Please specify the on-site staff / worker headcount.');
      return;
    }
    setStep('capture');
    setSubmitError('');
  };

  const renderLocationStatus = () => {
    if (locationState === 'loading') {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800 dark:border-indigo-800/70 dark:bg-indigo-950/30 dark:text-indigo-200">
          <RefreshCw className="h-4 w-4 animate-spin" /> Auto-acquiring high-accuracy GPS geotag from device…
        </div>
      );
    }
    if (locationState === 'ready' && location) {
      const lowAccuracy = location.accuracy > accuracyThreshold;
      return (
        <div
          className={`rounded-xl border p-3 text-xs ${
            lowAccuracy
              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            <MapPin className="h-4 w-4" /> GPS Locked: ±{Math.round(location.accuracy)} m accuracy ·{' '}
            {lowAccuracy ? 'Fair accuracy' : 'High accuracy verified'}
          </div>
          <div className="mt-1 font-mono text-[10px]">
            {formatCoordinate(location.latitude)}, {formatCoordinate(location.longitude)}
          </div>
          {distanceFromWork != null && (
            <p className="mt-1 text-[11px]">
              Distance from official work record: <strong>{formatDistance(distanceFromWork)}</strong>
              {distanceFromWork > radiusThreshold ? ' · (flagged outside expected boundary)' : ' · (within expected boundary)'}
            </p>
          )}
        </div>
      );
    }
    if (locationError) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4" /> {locationError}
          </div>
          <button
            type="button"
            onClick={requestLocation}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 font-bold text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-200"
          >
            Retry GPS acquisition
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
        High-accuracy GPS coordinates will automatically be stamped onto your live camera photo.
      </div>
    );
  };

  const title =
    step === 'category'
      ? 'Field Evidence & Attendance Classification'
      : step === 'capture'
        ? 'Live Camera Capture (Strictly No Local Uploads)'
        : step === 'description'
          ? 'Observation Details & Notes'
          : step === 'review'
            ? 'Review Submission & Stamped Metadata'
            : 'Evidence Successfully Stored';

  const stepIndex = ['category', 'capture', 'description', 'review'].indexOf(step);

  return (
    <div
      className="citizen-protocol-modal fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-2 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="citizen-evidence-title"
    >
      <div className="flex max-h-[96vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#0f172a]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" /> MPLADS Live Field Evidence Protocol
            </div>
            <h2 id="citizen-evidence-title" className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            <p className="mt-1 truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
              Work ID · {work.work_id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close evidence form"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper */}
        {step !== 'success' && (
          <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
            {['Classification', 'Live Photo & GPS', 'Details', 'Review'].map((label, index) => (
              <React.Fragment key={label}>
                <div
                  className={`flex items-center gap-1.5 text-[10px] font-bold ${
                    index <= stepIndex ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] ${
                      index < stepIndex
                        ? 'bg-emerald-600 text-white'
                        : index === stepIndex
                          ? 'border border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                    }`}
                  >
                    {index < stepIndex ? '✓' : index + 1}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {index < 3 && <span className="mx-1 h-px flex-1 bg-slate-200 dark:bg-slate-700" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Step Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {/* STEP 1: CATEGORY & ROLE */}
          {step === 'category' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Select Evidence Role / Submitter Type
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(Object.keys(roleDefinitions) as EvidenceRole[]).map((roleKey) => {
                    const rDef = roleDefinitions[roleKey];
                    const IconComp = rDef.icon;
                    const isSelected = evidenceType === roleKey;
                    return (
                      <button
                        key={roleKey}
                        type="button"
                        onClick={() => handleRoleChange(roleKey)}
                        className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/30'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
                        }`}
                      >
                        <div
                          className={`mt-0.5 rounded-lg p-1.5 ${
                            isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                          }`}
                        >
                          <IconComp className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{rDef.label}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{rDef.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Headcount input if Contractor Attendance */}
              {evidenceType === 'contractor_attendance' && (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-800/60 dark:bg-indigo-950/30">
                  <label className="block text-xs font-black text-indigo-950 dark:text-indigo-100" htmlFor="worker-headcount">
                    On-Site Staff / Worker Headcount (Present Today) *
                  </label>
                  <p className="mt-0.5 text-[11px] text-indigo-800 dark:text-indigo-300">
                    This headcount will be cross-referenced with daily muster rolls and stored in the Implementing Officer's Attendance field.
                  </p>
                  <input
                    id="worker-headcount"
                    type="number"
                    min="1"
                    max="1000"
                    value={staffCount}
                    onChange={(e) => setStaffCount(e.target.value)}
                    placeholder="e.g. 14 workers on site"
                    className="mt-2 w-full rounded-xl border border-indigo-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-indigo-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Select Specific Observation / Field Record Type
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {currentCategoryList.map(([icon, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setCategory(label)}
                      className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition ${
                        category === label
                          ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/25'
                          : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
                      }`}
                    >
                      <span className="text-lg" aria-hidden="true">
                        {icon}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {submitError && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{submitError}</p>}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={!category || (evidenceType === 'contractor_attendance' && !staffCount)}
                  onClick={nextFromCategory}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                >
                  Continue to Live Camera <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CAPTURE WITH STRICT LIVE CAMERA & AUTO GPS */}
          {step === 'capture' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800/70 dark:bg-emerald-950/25">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                      Live Camera &amp; Automatic GPS Geotagging
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-emerald-900/80 dark:text-emerald-200/80">
                      To prevent fraud and spoofed submissions, <strong>only live device camera captures are accepted</strong>. Exact GPS coordinates are automatically acquired and burned into the image.
                    </p>
                  </div>
                </div>
              </div>

              {renderLocationStatus()}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(14rem,0.8fr)]">
                {/* Live Camera Viewport */}
                <div className="citizen-camera-stage relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-inner">
                  <video
                    ref={videoRef}
                    className={`min-h-[250px] w-full object-cover ${cameraReady ? '' : 'hidden'}`}
                    autoPlay
                    muted
                    playsInline
                    aria-label="Live field evidence camera preview"
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {!cameraReady && (
                    <div className="flex min-h-[250px] flex-col items-center justify-center p-6 text-center">
                      <Camera className="h-10 w-10 text-slate-500 animate-pulse" />
                      <p className="mt-3 text-xs font-bold text-slate-300">
                        {isStartingCamera ? 'Connecting to live camera…' : 'Live camera is off'}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        Only photos captured directly from this live camera stream are permitted.
                      </p>
                    </div>
                  )}
                  <div className="absolute left-3 top-3 rounded-lg bg-slate-950/85 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-400 backdrop-blur">
                    {cameraReady ? '● LIVE CAMERA ACTIVE' : 'LIVE CAMERA REQUIRED'}
                  </div>
                  {location && (
                    <div className="absolute bottom-3 left-3 rounded-lg bg-slate-950/85 px-2 py-1 font-mono text-[9px] text-slate-300 backdrop-blur">
                      GPS: {formatCoordinate(location.latitude)}, {formatCoordinate(location.longitude)}
                    </div>
                  )}
                </div>

                {/* Camera & Geotag Controls */}
                <div className="flex flex-col justify-between space-y-3">
                  <div className="space-y-2.5">
                    {!cameraReady ? (
                      <button
                        type="button"
                        onClick={() => {
                          void startCamera();
                        }}
                        disabled={isStartingCamera}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                      >
                        <Camera className="h-4 w-4" /> {isStartingCamera ? 'Starting camera…' : 'Turn On Live Camera'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <X className="h-4 w-4" /> Pause Live Camera
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        void requestLocation();
                      }}
                      disabled={locationState === 'loading'}
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      <MapPin className="h-4 w-4 text-emerald-600" />{' '}
                      {locationState === 'loading' ? 'Acquiring GPS…' : 'Refresh Device GPS'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void captureLivePhoto();
                      }}
                      disabled={!cameraReady || isCapturing}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Camera className="h-5 w-5" />
                      {isCapturing ? 'Acquiring GPS & Snapping…' : '📸 Take Live Proof Photo'}
                    </button>
                  </div>

                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
                    <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
                    Complete Work ID, Role ({roleDefinitions[evidenceType].badge}), GPS Coordinates, and Timestamp will be permanently watermarked onto the image.
                  </p>
                </div>
              </div>

              {cameraError && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-relaxed text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300">
                  {cameraError}
                </p>
              )}
              {submitError && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{submitError}</p>}
            </div>
          )}

          {/* STEP 3: OBSERVATION DESCRIPTION */}
          {step === 'description' && (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
                {previewUrl && <img src={previewUrl} alt="Live field evidence preview" className="max-h-64 w-full object-contain" />}
                <div className="absolute left-3 top-3 rounded-lg bg-emerald-950/85 px-2.5 py-1 text-[10px] font-bold text-emerald-300 backdrop-blur">
                  Live Camera Proof Stamped
                </div>
              </div>

              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200" htmlFor="citizen-observation">
                Observation Description &amp; Field Notes *
                <textarea
                  id="citizen-observation"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder="Detail the on-site conditions, personnel observed, work progress, or specific compliance concern…"
                  className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs leading-relaxed text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>

              {submitError && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{submitError}</p>}

              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('capture')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" /> Retake Live Photo
                </button>
                <button
                  type="button"
                  disabled={description.trim().length < 5}
                  onClick={() => setStep('review')}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                >
                  Review Stamped Record <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
                  {previewUrl && <img src={previewUrl} alt="Live camera evidence preview" className="h-full max-h-72 w-full object-contain" />}
                </div>
                <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-700 dark:bg-slate-900/60">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Evidence Role / Type</span>
                    <p className="mt-0.5 font-bold text-emerald-700 dark:text-emerald-400">
                      {roleDefinitions[evidenceType].label}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Record Classification</span>
                    <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">{category}</p>
                  </div>
                  {evidenceType === 'contractor_attendance' && staffCount && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Staff Headcount</span>
                      <p className="mt-0.5 font-bold text-indigo-700 dark:text-indigo-400">{staffCount} personnel on site</p>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Capture Mode</span>
                    <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                      Strict Live Camera Capture with Auto-GPS
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Auto-Tagged GPS</span>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-700 dark:text-slate-300">
                      {location ? `${formatCoordinate(location.latitude)}, ${formatCoordinate(location.longitude)} (±${Math.round(location.accuracy)} m)` : 'Not captured'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Captured At</span>
                    <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                      {capturedAt ? new Date(capturedAt).toLocaleString() : 'Live capture'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Description &amp; Notes</span>
                <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                  {description}
                </p>
              </div>

              {submitError && <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">{submitError}</p>}

              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('description')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" /> Edit notes
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {isSubmitting ? 'Submitting & Indexing…' : 'Submit & Register to Officer Center'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: SUCCESS */}
          {step === 'success' && submission && (
            <div className="flex min-h-[340px] flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="mt-5 text-xl font-black text-slate-900 dark:text-slate-100">
                Field Evidence Safely Stored &amp; Indexed
              </h3>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                The record has been linked to Work ID <strong className="font-mono">{work.work_id}</strong> and is now visible in the Implementing Officer Monitoring &amp; Action Center under its respected field (Attendance / Citizen Feedback).
              </p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-left dark:border-slate-700 dark:bg-slate-900/70">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Submission ID</span>
                <span className="mt-0.5 block font-mono text-xs font-black text-slate-900 dark:text-slate-100">
                  {submission.submission_id}
                </span>
                <span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Field Reflected</span>
                <span className="mt-0.5 block font-semibold text-emerald-700 dark:text-emerald-400">
                  {roleDefinitions[evidenceType].label}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        {step !== 'success' && (
          <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[10px] text-slate-500 sm:px-6 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
            <Clock3 className="h-3.5 w-3.5" /> Complete canonical Work ID, auto-GPS coordinates, and role metadata are permanently audited.
          </div>
        )}
      </div>
    </div>
  );
};

export default CitizenEvidenceModal;
