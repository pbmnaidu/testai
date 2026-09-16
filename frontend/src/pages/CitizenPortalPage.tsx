import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Camera,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Search,
  Filter,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  Eye,
  FileText,
  UserCheck,
  Compass,
  Crosshair,
  RefreshCw,
  X,
  Lock,
  Phone,
  Mail,
  User,
  Scale,
  DollarSign,
  Ghost,
  AlertOctagon,
  Copy,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  fetchNearbyCitizenWorks,
  fetchCitizenComplaints,
  submitCitizenComplaint,
  fetchFilters,
  locateCitizenByCoords,
  searchCitizenLocations
} from '../services/api';
import {
  WorkRecord,
  CitizenComplaint,
  CitizenComplaintSubmission,
  FilterOptions
} from '../types';

const MALPRACTICE_CATEGORIES = [
  {
    id: 'SUBSTANDARD_MATERIAL',
    label: 'Substandard or Improper Material Quality',
    icon: Scale,
    color: 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    description: 'Inferior cement grades (below OPC 53), weak/corroded TMT rebar, crumbling concrete mix, poor bitumen, uncertified bricks.'
  },
  {
    id: 'FUND_MISAPPROPRIATION',
    label: 'Misuse of Funds & Inflated Invoicing',
    icon: DollarSign,
    color: 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400',
    description: 'Exorbitant unit billing above Schedule of Rates (SOR), ghost contractor claims, payment for unexecuted items.'
  },
  {
    id: 'GHOST_WORK',
    label: 'Ghost / Non-Existent Project',
    icon: Ghost,
    color: 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400',
    description: 'Work recorded as completed or disbursed in government portal, but zero physical construction exists on the ground.'
  },
  {
    id: 'EXECUTION_DELAY',
    label: 'Severe Execution Delay & Abandoned Site',
    icon: Clock,
    color: 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400',
    description: 'Work stalled for months with no laborers or machinery, leaving dangerous open excavations or unfinished halls.'
  },
  {
    id: 'DUPLICATE_BILLING',
    label: 'Duplicate Work / Double-Billing',
    icon: Copy,
    color: 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    description: 'Work constructed under another scheme (e.g. PMGSY, Municipal fund) being claimed and billed under MPLADS.'
  },
  {
    id: 'SPECIFICATION_DEVIATION',
    label: 'Deviation from Approved Specifications',
    icon: Layers,
    color: 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400',
    description: 'Narrower road width than DPR specifications, reduced foundation depth, omitted drainage or substandard fittings.'
  },
  {
    id: 'SAFETY_HAZARD',
    label: 'Structural Defect & Public Safety Hazard',
    icon: AlertOctagon,
    color: 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-400',
    description: 'Cracking load-bearing pillars, unstable roofs, or unsafe public structures endangering citizens.'
  }
];

const POPULAR_HUBS = [
  { label: 'Bengaluru', state: 'KARNATAKA', constituency: 'BANGALORE SOUTH' },
  { label: 'Delhi', state: 'DELHI', constituency: 'NEW DELHI' },
  { label: 'Mumbai', state: 'MAHARASHTRA', constituency: 'MUMBAI SOUTH' },
  { label: 'Pune', state: 'MAHARASHTRA', constituency: 'PUNE' },
  { label: 'Hyderabad', state: 'TELANGANA', constituency: 'HYDERABAD' },
  { label: 'Chennai', state: 'TAMIL NADU', constituency: 'CHENNAI CENTRAL' },
  { label: 'Kolkata', state: 'WEST BENGAL', constituency: 'KOLKATA DAKSHIN' },
  { label: 'Jaipur', state: 'RAJASTHAN', constituency: 'JAIPUR' },
  { label: 'Lucknow', state: 'UTTAR PRADESH', constituency: 'LUCKNOW' },
  { label: 'Varanasi', state: 'UTTAR PRADESH', constituency: 'VARANASI' },
  { label: 'Ahmedabad', state: 'GUJARAT', constituency: 'AHMEDABAD EAST' },
  { label: 'Patna', state: 'BIHAR', constituency: 'PATNA SAHIB' },
  { label: 'Dharwad', state: 'KARNATAKA', constituency: 'DHARWAD' },
];

const money = (val?: number) => {
  if (val === undefined || val === null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
};

export const CitizenPortalPage: React.FC<{ onSelectWork?: (workId: string) => void }> = ({ onSelectWork }) => {
  const [activeTab, setActiveTab] = useState<'works' | 'report' | 'my-complaints'>('works');
  
  // Location State
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'detecting' | 'detected' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const [selectedState, setSelectedState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('mplads_citizen_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.state || 'KARNATAKA';
      }
    } catch {}
    return 'KARNATAKA';
  });
  const [selectedConstituency, setSelectedConstituency] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('mplads_citizen_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.constituency || 'DHARWAD';
      }
    } catch {}
    return 'DHARWAD';
  });
  const [detectedLocationInfo, setDetectedLocationInfo] = useState<{
    city?: string;
    district?: string;
    displayName?: string;
    source?: 'gps' | 'manual';
  }>(() => {
    try {
      const saved = localStorage.getItem('mplads_citizen_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          city: parsed.city,
          district: parsed.district,
          displayName: parsed.displayName,
          source: parsed.source || 'manual'
        };
      }
    } catch {}
    return {};
  });
  const [availableFilters, setAvailableFilters] = useState<FilterOptions | null>(null);
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [locationSearchInput, setLocationSearchInput] = useState<string>('');
  const [locationSearchResults, setLocationSearchResults] = useState<Array<{
    state: string;
    constituency: string;
    city: string;
    label: string;
    match_type: string;
  }>>([]);
  const [locationSearching, setLocationSearching] = useState<boolean>(false);

  // Works Explorer State
  const [works, setWorks] = useState<WorkRecord[]>([]);
  const [totalWorks, setTotalWorks] = useState<number>(0);
  const [worksLoading, setWorksLoading] = useState<boolean>(true);
  const [workStatusFilter, setWorkStatusFilter] = useState<'all' | 'ongoing' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Complaint Filing Form State
  const [targetWork, setTargetWork] = useState<WorkRecord | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('SUBSTANDARD_MATERIAL');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [description, setDescription] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [citizenName, setCitizenName] = useState<string>('');
  const [citizenPhone, setCitizenPhone] = useState<string>('');
  const [citizenEmail, setCitizenEmail] = useState<string>('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submittedComplaint, setSubmittedComplaint] = useState<CitizenComplaint | null>(null);
  const [submissionError, setSubmissionError] = useState<string>('');

  // Camera Capture Ref & State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Citizen Tracked Complaints State
  const [trackedComplaints, setTrackedComplaints] = useState<CitizenComplaint[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState<boolean>(false);

  // Load available states & constituencies on mount
  useEffect(() => {
    fetchFilters().then(setAvailableFilters).catch(() => undefined);
    loadTrackedComplaints();
    // Only auto-trigger GPS if user hasn't explicitly saved a location
    const saved = localStorage.getItem('mplads_citizen_location');
    if (!saved) {
      detectGpsLocation();
    }
  }, []);

  // Reload works when location, status, or search change
  useEffect(() => {
    loadWorks();
  }, [selectedState, selectedConstituency, workStatusFilter, page]);

  const detectGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }
    setGpsStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const accuracy = Math.round(pos.coords.accuracy);
        setCoords({ lat, lon, accuracy });
        setGpsStatus('detected');
        
        // Reverse-geocode coordinates to actual State and Constituency!
        try {
          const loc = await locateCitizenByCoords(lat, lon);
          if (loc && loc.detected && loc.state && loc.constituency) {
            setSelectedState(loc.state);
            setSelectedConstituency(loc.constituency);
            const info = {
              city: loc.city,
              district: loc.district,
              displayName: loc.display_name,
              source: 'gps' as const
            };
            setDetectedLocationInfo(info);
            try {
              localStorage.setItem('mplads_citizen_location', JSON.stringify({
                state: loc.state,
                constituency: loc.constituency,
                city: loc.city,
                district: loc.district,
                source: 'gps'
              }));
            } catch {}
          }
        } catch (err) {
          console.warn('Could not reverse-geocode coordinates:', err);
        }
      },
      (err) => {
        console.warn('Geolocation permission not granted:', err.message);
        setGpsStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleLocationSearch = async (val: string) => {
    setLocationSearchInput(val);
    if (!val || val.trim().length < 2) {
      setLocationSearchResults([]);
      return;
    }
    setLocationSearching(true);
    try {
      const res = await searchCitizenLocations(val.trim());
      setLocationSearchResults(res.results || []);
    } catch {
      setLocationSearchResults([]);
    } finally {
      setLocationSearching(false);
    }
  };

  const handleSelectLocation = (st: string, pc: string, cityName?: string) => {
    setSelectedState(st);
    setSelectedConstituency(pc);
    const info = {
      city: cityName || pc,
      displayName: `${pc}, ${st}`,
      source: 'manual' as const
    };
    setDetectedLocationInfo(info);
    try {
      localStorage.setItem('mplads_citizen_location', JSON.stringify({
        state: st,
        constituency: pc,
        city: cityName || pc,
        source: 'manual'
      }));
    } catch {}
    setLocationSearchInput('');
    setLocationSearchResults([]);
    setShowLocationModal(false);
  };

  const loadWorks = () => {
    setWorksLoading(true);
    fetchNearbyCitizenWorks({
      state: selectedState || undefined,
      constituency: selectedConstituency || undefined,
      work_status: workStatusFilter,
      search: searchQuery || undefined,
      page,
      limit: 20
    }).then((res) => {
      setWorks(res.works || []);
      setTotalWorks(res.total || 0);
      setWorksLoading(false);
    }).catch(() => setWorksLoading(false));
  };

  const loadTrackedComplaints = () => {
    setComplaintsLoading(true);
    fetchCitizenComplaints({
      state: selectedState || undefined,
      constituency: selectedConstituency || undefined
    }).then((res) => {
      setTrackedComplaints(res.complaints || []);
      setComplaintsLoading(false);
    }).catch(() => setComplaintsLoading(false));
  };

  const handleStartReportOnWork = (work: WorkRecord) => {
    setTargetWork(work);
    setSubmittedComplaint(null);
    setSubmissionError('');
    setActiveTab('report');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setUploadedImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setSubmissionError('Please provide specific details about the observed malpractice.');
      return;
    }
    setSubmitting(true);
    setSubmissionError('');

    const categoryObj = MALPRACTICE_CATEGORIES.find((c) => c.id === selectedCategory);

    const payload: CitizenComplaintSubmission = {
      work_id: targetWork ? targetWork.work_id : undefined,
      work_title: targetWork ? targetWork.description : 'Unlisted Local Public Work',
      state: selectedState,
      constituency: selectedConstituency,
      work_status: targetWork ? targetWork.work_status : 'Ongoing',
      category: selectedCategory,
      category_label: categoryObj?.label || selectedCategory,
      severity,
      description,
      location: coords ? {
        lat: coords.lat,
        lon: coords.lon,
        accuracy: coords.accuracy,
        address: `${selectedConstituency}, ${selectedState}`,
        timestamp: new Date().toISOString()
      } : {
        address: `${selectedConstituency}, ${selectedState}`
      },
      proof_images: uploadedImages,
      proof_docs: [],
      citizen_name: citizenName || 'Concerned Citizen',
      citizen_phone: citizenPhone || undefined,
      citizen_email: citizenEmail || undefined,
      is_anonymous: isAnonymous
    };

    try {
      const res = await submitCitizenComplaint(payload);
      setSubmittedComplaint(res.complaint);
      setSubmitting(false);
      // Reset inputs
      setDescription('');
      setUploadedImages([]);
      loadTrackedComplaints();
    } catch (err: any) {
      setSubmissionError(err.message || 'Failed to submit grievance. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Citizen Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white p-6 md:p-8 shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 animate-spin" /> Citizen Public Audit Portal
              </span>
              <span className="px-3 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> Whistleblower Protected
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              Public Works Accountability &amp; Grievance Redressal
            </h1>
            <p className="text-slate-300 text-xs md:text-sm max-w-3xl leading-relaxed">
              Monitor sanctioned, ongoing, and completed public development projects funded under MPLADS in your constituency. Report sub-standard materials, execution delays, fund misuse, or ghost works with verified geotagged photographic proof directly to implementing district officers.
            </p>
          </div>

          {/* Action Tabs in Banner */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('works')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs ${
                activeTab === 'works'
                  ? 'bg-white text-slate-900 shadow-md ring-2 ring-emerald-500'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              <Building2 className="w-4 h-4 text-emerald-600" /> Nearby Works
            </button>
            <button
              onClick={() => { setTargetWork(null); setSubmittedComplaint(null); setActiveTab('report'); }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs ${
                activeTab === 'report'
                  ? 'bg-white text-slate-900 shadow-md ring-2 ring-emerald-500'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              <Camera className="w-4 h-4 text-amber-400" /> Report Malpractice
            </button>
            <button
              onClick={() => { loadTrackedComplaints(); setActiveTab('my-complaints'); }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs ${
                activeTab === 'my-complaints'
                  ? 'bg-white text-slate-900 shadow-md ring-2 ring-emerald-500'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              <FileText className="w-4 h-4 text-sky-400" /> Tracked Grievances ({trackedComplaints.length})
            </button>
          </div>
        </div>

        {/* Location Detection & Quick Switcher Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="font-black text-white flex flex-wrap items-center gap-2 text-sm">
                  <span>{selectedConstituency}, {selectedState}</span>
                  {detectedLocationInfo?.city && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {detectedLocationInfo.city}
                    </span>
                  )}
                  {coords && (
                    <span className="text-[10px] text-emerald-400/90 font-mono">
                      (GPS: {coords.lat}°, {coords.lon}° ±{coords.accuracy}m)
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px]">
                  <span className="text-slate-300">
                    {detectedLocationInfo?.source === 'gps'
                      ? '✓ Detected from GPS coordinates'
                      : detectedLocationInfo?.source === 'manual'
                      ? '✓ Confirmed citizen location'
                      : 'Displaying works for this constituency'}
                  </span>
                  <span className="text-slate-500">•</span>
                  <button
                    onClick={() => setShowLocationModal(true)}
                    className="text-amber-300 hover:text-amber-200 font-extrabold underline cursor-pointer flex items-center gap-1"
                  >
                    Wrong location? Click to change or search your city
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={detectGpsLocation}
                disabled={gpsStatus === 'detecting'}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold flex items-center gap-1.5 transition-colors border border-white/10 shadow-xs"
                title="Re-query device GPS coordinates"
              >
                <Crosshair className={`w-3.5 h-3.5 ${gpsStatus === 'detecting' ? 'animate-spin text-emerald-400' : ''}`} />
                {gpsStatus === 'detecting' ? 'Locating...' : 'Auto-Detect GPS'}
              </button>
              <button
                onClick={() => setShowLocationModal(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold flex items-center gap-1.5 transition-all shadow-md"
              >
                <Compass className="w-3.5 h-3.5" />
                Change City / Constituency
              </button>
            </div>
          </div>

          {/* Quick Select Popular Hubs */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
              <span>Quick Select City:</span>
            </span>
            {POPULAR_HUBS.map((hub) => {
              const isSelected = selectedState === hub.state && selectedConstituency === hub.constituency;
              return (
                <button
                  key={hub.label}
                  onClick={() => handleSelectLocation(hub.state, hub.constituency, hub.label)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 font-black shadow-xs ring-2 ring-emerald-300'
                      : 'bg-white/10 text-slate-300 hover:bg-white/25 hover:text-white border border-white/5'
                  }`}
                >
                  {hub.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal: Change Location & Instant City Search */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  Set Your Location
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Search any Indian city, district, or constituency to see nearby public works.
                </p>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Live Search Input */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                Type City, District or Constituency Name
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. Pune, Jaipur, Varanasi, Bangalore, Delhi, Lucknow, Noida..."
                  value={locationSearchInput}
                  onChange={(e) => handleLocationSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {locationSearching && (
                  <RefreshCw className="w-3.5 h-3.5 absolute right-3.5 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" />
                )}
              </div>

              {/* Autocomplete Search Results List */}
              {locationSearchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700 shadow-lg text-xs">
                  {locationSearchResults.map((res, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectLocation(res.state, res.constituency, res.city)}
                      className="w-full px-3.5 py-2 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 group-hover:scale-110 transition-transform" />
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{res.label}</span>
                          <span className="text-[10px] text-slate-400 block">{res.constituency}, {res.state}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick City Pills in Modal */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">Popular City Hubs:</span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_HUBS.map((hub) => (
                  <button
                    key={hub.label}
                    onClick={() => handleSelectLocation(hub.state, hub.constituency, hub.label)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    {hub.label}
                  </button>
                ))}
              </div>
            </div>

            {/* State and Constituency Selectors */}
            <div className="space-y-3 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select State / UT</label>
                <select
                  value={selectedState}
                  onChange={(e) => {
                    setSelectedState(e.target.value);
                    setSelectedConstituency('');
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="">All States</option>
                  {(availableFilters?.states || []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select Parliamentary Constituency</label>
                <select
                  value={selectedConstituency}
                  onChange={(e) => setSelectedConstituency(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="">All Constituencies</option>
                  {(availableFilters?.constituencies || []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={detectGpsLocation}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <Crosshair className="w-3.5 h-3.5" /> Re-detect Device GPS
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleSelectLocation(selectedState, selectedConstituency);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                >
                  Confirm &amp; Load Works
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 1: Nearby Works Explorer */}
      {activeTab === 'works' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Public Works in {selectedConstituency || selectedState || 'National Portfolio'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showing {totalWorks.toLocaleString()} projects. Select any work to lodge a citizen grievance with evidence.
                </p>
              </div>

              {/* Status Filter Segment */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  onClick={() => { setWorkStatusFilter('all'); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    workStatusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Works
                </button>
                <button
                  onClick={() => { setWorkStatusFilter('ongoing'); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    workStatusFilter === 'ongoing'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ongoing Works
                </button>
                <button
                  onClick={() => { setWorkStatusFilter('completed'); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    workStatusFilter === 'completed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Finished Works
                </button>
              </div>
            </div>

            {/* Search Input Bar */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadWorks(); }}
                  placeholder="Search work title, ID, village, contractor..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                />
              </div>
              <button
                onClick={loadWorks}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors shrink-0"
              >
                Search
              </button>
            </div>
          </div>

          {/* Works Grid */}
          {worksLoading ? (
            <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center min-h-[300px] gap-3">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Fetching works for {selectedConstituency}...</span>
            </div>
          ) : works.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
              No works found matching the selected filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {works.map((w) => {
                const isCompleted = (w.work_status || '').toLowerCase().includes('completed');
                return (
                  <div
                    key={w.work_id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                          {w.work_id}
                        </span>
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {w.work_status || 'Under Execution'}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                        {w.description || 'Project title not available'}
                      </h4>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Sanction Amount</span>
                          <span className="font-mono font-bold text-slate-800">{money(w.sanction_amount)}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Sector / Category</span>
                          <span className="font-medium text-slate-600 truncate block">{w.work_category || w.main_sector || 'Public Works'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500 font-medium">
                        {w.state} · {w.constituency}
                      </span>
                      <button
                        onClick={() => handleStartReportOnWork(w)}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs shrink-0"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Report Malpractice →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Report Malpractice Form */}
      {activeTab === 'report' && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Success Screen if grievance just submitted */}
          {submittedComplaint ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-8 text-center space-y-5 shadow-lg">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-black text-emerald-950">Grievance Registered Successfully!</h3>
                <p className="text-xs text-emerald-800 mt-1 max-w-md mx-auto">
                  Your grievance has been transmitted to the Implementing Officer's Portal for field verification.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-300 bg-white p-5 max-w-md mx-auto text-left space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Grievance Tracking ID</span>
                  <span className="font-mono font-black text-emerald-700 text-sm">{submittedComplaint.complaint_id}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Work ID</span>
                  <span className="font-mono font-bold text-slate-800">{submittedComplaint.work_id || 'General Local Work'}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Malpractice Type</span>
                  <span className="font-bold text-amber-800">{submittedComplaint.category_label}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold uppercase text-[10px]">Status</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-black text-[10px]">
                    {submittedComplaint.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => { setSubmittedComplaint(null); setActiveTab('works'); }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs"
                >
                  Return to Nearby Works
                </button>
                <button
                  onClick={() => { setSubmittedComplaint(null); setActiveTab('my-complaints'); }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                >
                  View Tracked Grievances →
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitGrievance} className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm space-y-6">
              <div>
                <h3 className="text-xl font-black text-slate-900">File Public Malpractice Grievance</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Upload geotagged photographic evidence and report issues observed on site. Whistleblower protection is available.
                </p>
              </div>

              {/* Target Work Summary Card */}
              {targetWork ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => setTargetWork(null)}
                    className="absolute right-3 top-3 text-amber-700 hover:text-amber-900 font-bold text-xs flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
                    Reporting on Selected Work
                  </span>
                  <div className="font-mono text-xs font-bold text-slate-900">{targetWork.work_id}</div>
                  <p className="text-xs font-semibold text-slate-800">{targetWork.description}</p>
                  <div className="text-[11px] text-slate-500">{targetWork.state} · {targetWork.constituency} · Sanctioned: {money(targetWork.sanction_amount)}</div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800">Reporting general or unlisted work in this area</span>
                    <p className="text-[11px] text-slate-500">Location will be recorded as {selectedConstituency}, {selectedState}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('works')}
                    className="text-xs font-bold text-indigo-700 underline"
                  >
                    Select Specific Work Instead →
                  </button>
                </div>
              )}

              {/* Malpractice Categories Selector */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Select Malpractice Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {MALPRACTICE_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`rounded-2xl border p-3.5 text-left transition-all flex items-start gap-3 ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <div className={`p-2 rounded-xl shrink-0 ${isSelected ? 'bg-white/20 text-white' : cat.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold leading-snug">{cat.label}</h4>
                          <p className={`text-[10px] mt-1 leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                            {cat.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Severity Selector */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Severity Level
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    ['LOW', 'Low', 'bg-slate-100 text-slate-700'],
                    ['MEDIUM', 'Medium', 'bg-amber-100 text-amber-800'],
                    ['HIGH', 'High', 'bg-orange-100 text-orange-800'],
                    ['CRITICAL', 'Critical / Urgent', 'bg-rose-100 text-rose-800']
                  ].map(([val, label, tone]) => (
                    <button
                      type="button"
                      key={val}
                      onClick={() => setSeverity(val as any)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all ${
                        severity === val
                          ? 'border-2 border-slate-900 bg-slate-900 text-white'
                          : `border border-slate-200 ${tone}`
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Description */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                  Description of Malpractice / On-Ground Observations *
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe in detail what you observed on site: e.g. brand/grade of cement used, measurements observed, duration site has been abandoned, absence of physical structure, etc."
                  className="w-full rounded-xl border border-slate-200 p-3.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Proof Uploading & Geotag Camera */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                    Geotagged Photographic Proof / Evidence
                  </label>
                  {coords && (
                    <span className="text-[10px] text-emerald-600 font-mono font-bold">
                      GPS Stamping Active: {coords.lat}°, {coords.lon}°
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Native Camera Trigger */}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 p-4 text-center flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-950">Capture Photo with Camera</div>
                      <p className="text-[10px] text-emerald-700 mt-0.5">Auto-applies GPS geotag stamp</p>
                    </div>
                  </button>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  {/* File Upload Trigger */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 p-4 text-center flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800">Upload Images or Documents</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">JPG, PNG, PDF up to 25MB</p>
                    </div>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>

                {/* Uploaded Images Preview */}
                {uploadedImages.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    {uploadedImages.map((img, idx) => (
                      <div key={idx} className="relative rounded-xl border border-slate-200 overflow-hidden group aspect-video bg-slate-100">
                        <img src={img} alt="Evidence preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={() => setUploadedImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 rounded-lg bg-rose-600 text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {coords && (
                          <div className="absolute bottom-1 left-1 right-1 bg-slate-950/80 text-[8px] text-emerald-400 font-mono p-1 rounded backdrop-blur-xs truncate">
                            GPS: {coords.lat}°, {coords.lon}°
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Citizen Information & Whistleblower Anonymous Toggle */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">Whistleblower Identity Protection</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    Submit as Anonymous Whistleblower
                  </label>
                </div>

                {!isAnonymous ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Your Name</label>
                      <input
                        value={citizenName}
                        onChange={(e) => setCitizenName(e.target.value)}
                        placeholder="Full name"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Phone Number</label>
                      <input
                        value={citizenPhone}
                        onChange={(e) => setCitizenPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 block mb-1">Email (for status alerts)</label>
                      <input
                        value={citizenEmail}
                        onChange={(e) => setCitizenEmail(e.target.value)}
                        placeholder="you@email.com"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Your personal information will be completely omitted from the grievance sent to implementing officers.
                  </p>
                )}
              </div>

              {submissionError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {submissionError}
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('works')}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
                >
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Submit Grievance to Implementing Officer
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab 3: Tracked Grievances */}
      {activeTab === 'my-complaints' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Grievances Filed in {selectedConstituency}, {selectedState}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time official review and field inspection status from the Implementing Officer.
              </p>
            </div>
            <button
              onClick={loadTrackedComplaints}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${complaintsLoading ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
          </div>

          {complaintsLoading ? (
            <div className="p-12 text-center text-xs text-slate-500">Loading grievances...</div>
          ) : trackedComplaints.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500">
              No citizen grievances have been recorded for this constituency yet.
            </div>
          ) : (
            <div className="space-y-4">
              {trackedComplaints.map((c) => {
                const isPending = c.status === 'PENDING_VERIFICATION';
                const isInspection = c.status === 'FIELD_INSPECTION_ORDERED';
                const isResolved = c.status === 'RESOLVED';
                return (
                  <div key={c.complaint_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-900">{c.complaint_id}</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800">
                            {c.category_label}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isResolved
                              ? 'bg-emerald-100 text-emerald-800'
                              : isInspection
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {c.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">{c.work_title || c.work_id}</h4>
                        <div className="text-[11px] text-slate-400">
                          {c.state} · {c.constituency} · Filed on {new Date(c.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                        </div>
                      </div>

                      <div className="text-right text-xs shrink-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Filed by</span>
                        <span className="font-bold text-slate-700">{c.citizen_name || 'Anonymous Whistleblower'}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 leading-relaxed">
                      "{c.description}"
                    </p>

                    {/* Geotag & Coordinates display */}
                    {c.location && (c.location.lat || c.location.address) && (
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-medium">
                        <span className="flex items-center gap-1 text-emerald-700">
                          <MapPin className="w-3.5 h-3.5" />
                          {c.location.address || 'Field Site'}
                        </span>
                        {c.location.lat && (
                          <span className="font-mono text-[10px] text-slate-400">
                            GPS: {c.location.lat}°, {c.location.lon}°
                          </span>
                        )}
                      </div>
                    )}

                    {/* Photo Proof Preview */}
                    {c.proof_images && c.proof_images.length > 0 && (
                      <div className="flex items-center gap-2 pt-1 overflow-x-auto">
                        {c.proof_images.map((img, i) => (
                          <img
                            key={i}
                            src={img}
                            alt="Grievance proof"
                            className="w-20 h-14 object-cover rounded-lg border border-slate-200"
                          />
                        ))}
                      </div>
                    )}

                    {/* Officer Action Timeline Note */}
                    <div className="pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                        <UserCheck className="w-3.5 h-3.5" />
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400">
                          Official Implementing Authority Status
                        </span>
                        <p className="text-slate-800 font-medium">
                          {c.officer_action_notes || 'Grievance is queued in Implementing Officer monitoring center for field inspection.'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
