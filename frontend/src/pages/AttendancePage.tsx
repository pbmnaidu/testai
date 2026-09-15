import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock3, LocateFixed, MapPin, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import { fetchAttendanceStats, fetchCitizenWorks, submitAttendance } from '../services/api';
import { AttendanceStats, PublicWorkRecord } from '../types';

interface LiveLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

interface CapturedAttendance {
  file: File;
  url: string;
  workId: string;
  staffCount: number;
  location: LiveLocation;
  capturedAt: string;
}

const emptyStats: AttendanceStats = {
  total_submissions: 0,
  total_staff_reported: 0,
  pending_review: 0,
  within_expected_radius: 0,
  outside_expected_radius: 0,
  low_gps_accuracy: 0,
};

const locationError = (error: GeolocationPositionError) => {
  if (error.code === error.PERMISSION_DENIED) return 'Location permission is required for a fraud-resistant attendance capture.';
  if (error.code === error.TIMEOUT) return 'The device location timed out. Move to an open area and try again.';
  return 'The device location could not be read. Try again before taking the photo.';
};

const getLiveLocation = () => new Promise<LiveLocation>((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('This browser does not provide live location capability.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => resolve({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    }),
    (error) => reject(new Error(locationError(error))),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );
});

const formatCoordinate = (value: number) => value.toFixed(6);

export const AttendancePage: React.FC = () => {
  const [works, setWorks] = useState<PublicWorkRecord[]>([]);
  const [workSearch, setWorkSearch] = useState('');
  const [selectedWork, setSelectedWork] = useState<PublicWorkRecord | null>(null);
  const [staffCount, setStaffCount] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captured, setCaptured] = useState<CapturedAttendance | null>(null);
  const [submittedId, setSubmittedId] = useState('');
  const [stats, setStats] = useState<AttendanceStats>(emptyStats);
  const [isLoadingWorks, setIsLoadingWorks] = useState(true);
  const [worksError, setWorksError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      setIsLoadingWorks(true);
      fetchCitizenWorks({ search: workSearch.trim() || undefined, limit: 50 })
        .then((response) => {
          if (!active) return;
          setWorks(response.records);
          setSelectedWork((current) => current && response.records.some((record) => record.work_id === current.work_id)
            ? current
            : response.records[0] || null);
          setWorksError('');
          setIsLoadingWorks(false);
        })
        .catch(() => {
          if (!active) return;
          setWorksError('The public work register could not be loaded.');
          setIsLoadingWorks(false);
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [workSearch]);

  useEffect(() => {
    fetchAttendanceStats().then(setStats).catch(() => undefined);
  }, [submittedId]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => () => {
    if (captured?.url) URL.revokeObjectURL(captured.url);
  }, [captured]);

  const selectedStaffCount = Number(staffCount);
  const countIsValid = Number.isInteger(selectedStaffCount) && selectedStaffCount > 0 && selectedStaffCount <= 10000;
  const workHasCoordinate = Boolean(selectedWork?.coordinate_available && selectedWork.latitude != null && selectedWork.longitude != null);

  const locationText = useMemo(() => captured
    ? `${formatCoordinate(captured.location.latitude)}, ${formatCoordinate(captured.location.longitude)}${captured.location.accuracy == null ? '' : ` ±${Math.round(captured.location.accuracy)} m`}`
    : 'A fresh GPS fix is captured at shutter time', [captured]);

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
      setCameraError(error instanceof Error && error.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access to capture attendance; local uploads are not accepted.'
        : 'The live camera could not be started.');
      setCameraReady(false);
    } finally {
      setIsStartingCamera(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const captureFrame = async () => {
    setCaptureError('');
    setSubmittedId('');
    if (!selectedWork) {
      setCaptureError('Select the exact Work ID before taking the photo.');
      return;
    }
    if (!countIsValid) {
      setCaptureError('Enter the staff count at the moment of capture. Use a whole number from 1 to 10,000.');
      return;
    }
    if (!cameraReady || !videoRef.current || !canvasRef.current || videoRef.current.videoWidth === 0) {
      setCaptureError('Start the live camera before taking the attendance photo.');
      return;
    }

    setIsCapturing(true);
    try {
      const location = await getLiveLocation();
      const capturedAt = new Date().toISOString();
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const width = video.videoWidth;
      const height = video.videoHeight;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The device could not prepare the secure capture surface.');
      context.drawImage(video, 0, 0, width, height);

      const stampHeight = Math.max(150, Math.round(height * 0.23));
      const fontSize = Math.max(18, Math.round(width / 48));
      context.fillStyle = 'rgba(2, 6, 23, 0.86)';
      context.fillRect(0, height - stampHeight, width, stampHeight);
      context.fillStyle = '#ffffff';
      context.font = `700 ${fontSize}px Arial, sans-serif`;
      context.fillText('MPLADS LIVE ATTENDANCE', Math.round(width * 0.025), height - stampHeight + fontSize * 1.35);
      context.font = `600 ${Math.max(14, Math.round(fontSize * 0.76))}px Arial, sans-serif`;
      context.fillText(`Work ID: ${selectedWork.work_id}`, Math.round(width * 0.025), height - stampHeight + fontSize * 2.45);
      context.fillText(`Staff observed: ${selectedStaffCount}`, Math.round(width * 0.025), height - stampHeight + fontSize * 3.45);
      context.fillText(`GPS: ${formatCoordinate(location.latitude)}, ${formatCoordinate(location.longitude)}${location.accuracy == null ? '' : ` ±${Math.round(location.accuracy)}m`}`, Math.round(width * 0.025), height - stampHeight + fontSize * 4.45);
      context.fillText(`Captured: ${new Date(capturedAt).toLocaleString()}`, Math.round(width * 0.025), height - stampHeight + fontSize * 5.45);

      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('The camera image could not be encoded.')), 'image/jpeg', 0.92));
      const file = new File([blob], `attendance-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setCaptured({ file, url: URL.createObjectURL(file), workId: selectedWork.work_id, staffCount: selectedStaffCount, location, capturedAt });
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'The attendance capture failed.');
    } finally {
      setIsCapturing(false);
    }
  };

  const clearCapture = () => {
    setCaptured(null);
    setCaptureError('');
    setSubmittedId('');
  };

  const submitCaptured = async () => {
    if (!captured || !countIsValid) return;
    setIsSubmitting(true);
    setCaptureError('');
    try {
      const record = await submitAttendance({
        workId: captured.workId,
        staffCount: captured.staffCount,
        latitude: captured.location.latitude,
        longitude: captured.location.longitude,
        gpsAccuracy: captured.location.accuracy,
        capturedAt: captured.capturedAt,
        image: captured.file,
      });
      setSubmittedId(record.attendance_id);
      setCaptured(null);
      setStaffCount('');
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : 'The attendance record could not be sent to the officer queue.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return <div className="attendance-page space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400"><Users className="h-4 w-4" /> Contractor attendance capture</div>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Record the staff present at the worksite.</h1>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">Attendance is accepted only from the live device camera. Each capture burns the Work ID, staff count, live GPS, accuracy, and capture time into the image and stores the same values in an auditable officer record.</p>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-bold leading-relaxed text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/25 dark:text-amber-200"><ShieldCheck className="mb-1 inline h-4 w-4" /> No gallery upload · no manual location · no silent overwrite</div>
    </header>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <div className="attendance-stat-card"><span>Captures</span><strong>{stats.total_submissions.toLocaleString()}</strong><small>Sent to officers</small></div>
      <div className="attendance-stat-card"><span>Staff reported</span><strong>{stats.total_staff_reported.toLocaleString()}</strong><small>Across submissions</small></div>
      <div className="attendance-stat-card"><span>Pending review</span><strong className="text-amber-700 dark:text-amber-300">{stats.pending_review.toLocaleString()}</strong><small>Officer action</small></div>
      <div className="attendance-stat-card"><span>Within radius</span><strong className="text-emerald-700 dark:text-emerald-300">{stats.within_expected_radius.toLocaleString()}</strong><small>GPS context</small></div>
      <div className="attendance-stat-card"><span>Outside radius</span><strong className="text-rose-700 dark:text-rose-300">{stats.outside_expected_radius.toLocaleString()}</strong><small>Needs scrutiny</small></div>
      <div className="attendance-stat-card"><span>Low accuracy</span><strong className="text-indigo-700 dark:text-indigo-300">{stats.low_gps_accuracy.toLocaleString()}</strong><small>Weak GPS fix</small></div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.22fr)]">
      <section className="attendance-card">
        <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><MapPin className="h-4 w-4 text-emerald-600" /> 1. Select exact work</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Attendance is permanently linked to this Work ID. Check it before capture.</p></div><span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{works.length} shown</span></div>
        <label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Search Work ID or description</span><input type="search" value={workSearch} onChange={(event) => setWorkSearch(event.target.value)} placeholder="e.g. WS/MP18002/2025-2026/256730" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label>
        <div className="attendance-work-list mt-3" aria-live="polite">{isLoadingWorks && <div className="flex items-center justify-center gap-2 p-8 text-xs font-semibold text-slate-500"><RefreshCw className="h-4 w-4 animate-spin" /> Loading works…</div>}{!isLoadingWorks && worksError && <p className="p-5 text-center text-xs font-semibold text-rose-700 dark:text-rose-300">{worksError}</p>}{!isLoadingWorks && !worksError && works.length === 0 && <p className="p-5 text-center text-xs text-slate-500">No public works matched the search.</p>}{works.map((work) => <button key={work.work_id} type="button" disabled={Boolean(captured)} onClick={() => { setSelectedWork(work); setSubmittedId(''); }} className={`attendance-work-row ${selectedWork?.work_id === work.work_id ? 'attendance-work-row--selected' : ''} ${captured ? 'cursor-not-allowed opacity-70' : ''}`}><span className="min-w-0 flex-1 text-left"><span className="block truncate font-mono text-[10px] font-black text-slate-900 dark:text-slate-100">{work.work_id}</span><span className="mt-1 block line-clamp-2 text-[11px] font-semibold leading-relaxed text-slate-700 dark:text-slate-300">{work.description || 'Description not published'}</span><span className="mt-1 block text-[10px] text-slate-500 dark:text-slate-400">{work.state || 'State not published'} · {work.constituency || 'Constituency not published'}</span></span>{work.coordinate_available ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Work coordinate available" /> : <MapPin className="h-4 w-4 shrink-0 text-slate-400" aria-label="Work coordinate unavailable" />}</button>)}</div>
        {selectedWork && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800/70 dark:bg-emerald-950/25"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Selected work</div><div className="mt-1 break-all font-mono text-xs font-black text-slate-900 dark:text-slate-100">{selectedWork.work_id}</div><div className="mt-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{selectedWork.description || 'Description not published'}</div><div className="mt-2 text-[10px] font-semibold text-slate-600 dark:text-slate-400">{workHasCoordinate ? `Official coordinate: ${Number(selectedWork.latitude).toFixed(5)}, ${Number(selectedWork.longitude).toFixed(5)}` : 'Official work coordinate is not published; live device GPS will still be stored.'}</div></div>}
      </section>

      <section className="attendance-card">
        <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100"><Camera className="h-4 w-4 text-amber-600" /> 2. Count and capture from camera</h2><p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">The count is locked into the image at shutter time. There is intentionally no file-picker upload path.</p></div>{cameraReady && <button type="button" onClick={stopCamera} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-2 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"><X className="h-3 w-3" /> Stop</button>}</div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.72fr)]">
          <div className="attendance-camera-stage relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950"><video ref={videoRef} className={`h-full min-h-[260px] w-full object-cover ${cameraReady ? '' : 'hidden'}`} autoPlay muted playsInline aria-label="Live attendance camera preview" /><canvas ref={canvasRef} className="hidden" />{!cameraReady && <div className="flex min-h-[260px] flex-col items-center justify-center p-8 text-center"><Camera className="h-10 w-10 text-slate-500" /><p className="mt-3 text-xs font-bold text-slate-300">Camera is off</p><p className="mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">Start the camera to request device permission. Gallery uploads are not supported.</p></div>}<div className="absolute left-3 top-3 rounded-lg bg-slate-950/80 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">{cameraReady ? 'Live camera preview' : 'Camera required'}</div></div>
          <div className="space-y-3"><label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Staff present at this capture</span><div className="relative"><Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="number" min="1" max="10000" step="1" value={staffCount} onChange={(event) => { setStaffCount(event.target.value); setSubmittedId(''); }} placeholder="Enter whole number" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-9 pr-3 font-mono text-sm font-bold text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></div></label><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"><LocateFixed className="mr-1 inline h-3.5 w-3.5 text-emerald-600" /> {locationText}<br /><span className="text-[10px] text-slate-500">A fresh high-accuracy GPS fix is required when the shutter is pressed.</span></div>{!cameraReady ? <button type="button" onClick={startCamera} disabled={isStartingCamera} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-xs font-black text-slate-950 shadow-sm hover:bg-amber-400 disabled:opacity-60"><Camera className="h-4 w-4" /> {isStartingCamera ? 'Requesting camera…' : 'Start live camera'}</button> : <button type="button" onClick={captureFrame} disabled={isCapturing || !selectedWork || !countIsValid} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Camera className="h-4 w-4" /> {isCapturing ? 'Getting GPS and capturing…' : 'Take attendance photo'}</button>}{cameraError && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] font-semibold leading-relaxed text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300">{cameraError}</p>}</div>
        </div>
        {captured && <div className="mt-4 grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-800/70 dark:bg-emerald-950/20 sm:grid-cols-[10rem_minmax(0,1fr)]"><img src={captured.url} alt={`Attendance capture for ${captured.workId}`} className="attendance-captured-image h-40 w-full rounded-xl border border-emerald-200 object-cover sm:h-32" /><div><div className="flex items-center justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Ready to submit</div><div className="mt-1 text-xs font-black text-slate-900 dark:text-slate-100">{captured.staffCount} staff · {captured.workId}</div></div><button type="button" onClick={clearCapture} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/70 dark:hover:bg-slate-800" aria-label="Discard captured attendance photo"><X className="h-4 w-4" /></button></div><div className="mt-2 text-[10px] font-mono text-slate-600 dark:text-slate-400">{locationText}<br />{new Date(captured.capturedAt).toLocaleString()}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={captureFrame} disabled={isCapturing} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[10px] font-bold text-emerald-800 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-300">Retake with fresh GPS</button><button type="button" onClick={submitCaptured} disabled={isSubmitting} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-60">{isSubmitting ? 'Sending…' : 'Send to officer queue'}</button></div></div></div>}
        {captureError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[10px] font-semibold leading-relaxed text-rose-700 dark:border-rose-800/70 dark:bg-rose-950/30 dark:text-rose-300">{captureError}</p>}
        {submittedId && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] leading-relaxed text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/25 dark:text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Attendance saved and queued for officer review. Submission ID: <strong className="font-mono">{submittedId}</strong>. The officer will see the stamped image against the full Work ID.</span></div>}
      </section>
    </div>

    <section className="attendance-integrity-note rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-xs font-black text-slate-900 dark:text-slate-100">What this reduces — and what still needs officer judgment</h2><div className="mt-2 grid gap-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 sm:grid-cols-3"><p><strong className="text-slate-900 dark:text-slate-200">Reduces:</strong> gallery reuse, detached location claims, post-capture count changes, and Work ID mix-ups.</p><p><strong className="text-slate-900 dark:text-slate-200">Flags:</strong> weak GPS, distance from the published work position, duplicate submissions, and unusual counts for review.</p><p><strong className="text-slate-900 dark:text-slate-200">Does not prove:</strong> each person’s identity or hours worked. Officers must compare the image, work progress, roster, and records.</p></div></section>
  </div>;
};

export default AttendancePage;
