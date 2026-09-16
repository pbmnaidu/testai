import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Scale,
  Sparkles,
  Search,
  Filter,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Layers,
  Building2,
  Tag,
  Check,
  ChevronRight,
  Info,
  Copy,
  CheckCheck,
  Eye,
  FileSpreadsheet,
  Link,
  PlusCircle,
  ExternalLink,
  SlidersHorizontal,
  X,
  FileCheck
} from 'lucide-react';
import {
  analyzeMaterialDocument,
  fetchMaterialFairnessBenchmarks,
  fetchMaterialSampleDocs,
  searchMaterialWorks,
  uploadBenchmarkModule
} from '../services/api';

interface SampleDoc {
  id: string;
  title: string;
  doc_type: string;
  image_sim_url: string;
  extracted_text: string;
  quoted_price: number;
  quoted_unit: string;
  state: string;
  expected_assessment: string;
}

interface AnalysisResult {
  status: string;
  sample_id?: string;
  filename: string;
  extracted_text: string;
  extracted_attributes: {
    material: string;
    grade: string;
    is_code: string;
    quantity: number | null;
    unit: string;
    brand: string;
    quality_attributes: string[];
  };
  price_comparison: {
    quoted_unit_price: number | null;
    reference_unit_price: number | null;
    reference_min_price: number | null;
    reference_max_price: number | null;
    unit: string;
    price_difference: number | null;
    price_difference_pct: number | null;
    benchmark_source: string;
    state_applied: string;
    unit_normalized?: boolean;
    reference_range?: { min: number | null; max: number | null; unit: string };
  };
  fairness_assessment: {
    status: string;
    label: string;
    severity: string;
    color_theme: string;
    explanation: string;
  };
  auditor_guidance: string[];
}

interface MaterialFairnessProps {
  initialViewTab?: 'audit' | 'ingestion' | 'benchmarks';
  onSelectWork?: (workId: string) => void;
  showHeader?: boolean;
}

export function MaterialFairnessPage({ initialViewTab = 'audit', onSelectWork, showHeader = true }: MaterialFairnessProps = {}) {
  const [samples, setSamples] = useState<SampleDoc[]>([]);
  const [selectedSampleId, setSelectedSampleId] = useState<string>('sample_cement_opc53_overpriced');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [benchmarkFilterState, setBenchmarkFilterState] = useState<string>('');
  const [benchmarkFilterMaterial, setBenchmarkFilterMaterial] = useState<string>('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('ALL');

  // Custom form inputs
  const [customPrice, setCustomPrice] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('National Baseline');
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [rawTextEdit, setRawTextEdit] = useState<string>('');
  const [showRawTextEditor, setShowRawTextEditor] = useState<boolean>(false);

  // View Navigation
  const [activeViewTab, setActiveViewTab] = useState<'audit' | 'ingestion' | 'benchmarks'>(initialViewTab);

  // Real-world Works Linker
  const [workSearchQuery, setWorkSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedLinkedWork, setSelectedLinkedWork] = useState<any | null>(null);
  const [searchingWorks, setSearchingWorks] = useState<boolean>(false);

  // Custom SOR Module Upload
  const [sorFile, setSorFile] = useState<File | null>(null);
  const [sorUploadStatus, setSorUploadStatus] = useState<{ status: string; message: string } | null>(null);

  // Toast / Copy notification
  const [copiedToast, setCopiedToast] = useState<boolean>(false);

  useEffect(() => {
    // Load initial sample vouchers & benchmarks
    Promise.all([
      fetchMaterialSampleDocs(),
      fetchMaterialFairnessBenchmarks()
    ]).then(([samplesData, benchmarksData]) => {
      if (samplesData?.samples?.length) {
        setSamples(samplesData.samples);
      }
      if (benchmarksData?.benchmarks?.length) {
        setBenchmarks(benchmarksData.benchmarks);
      }
    }).catch((err) => console.warn('Failed loading material initial data:', err));

    // Run initial analysis on first sample
    runAnalysis({ sample_id: 'sample_cement_opc53_overpriced' });
  }, []);

  const runAnalysis = async (opts: {
    sample_id?: string;
    file?: File;
    raw_text?: string;
    quoted_price?: number;
    state?: string;
  }) => {
    setLoading(true);
    try {
      const res = await analyzeMaterialDocument({
        sample_id: opts.sample_id,
        file: opts.file,
        raw_text: opts.raw_text,
        quoted_price: opts.quoted_price,
        state: opts.state || selectedState
      });
      setAnalysisResult(res);
      if (res?.extracted_text) {
        setRawTextEdit(res.extracted_text);
      }
      if (res?.price_comparison?.quoted_unit_price) {
        setCustomPrice(res.price_comparison.quoted_unit_price.toString());
      }
    } catch (err) {
      console.error('Error running material analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  // Button: Select Pre-configured Sample
  const handleSampleClick = (sampleId: string) => {
    setSelectedSampleId(sampleId);
    setCustomFile(null);
    setPreviewImageUrl(null);
    setSelectedLinkedWork(null);
    const sample = samples.find((s) => s.id === sampleId);
    if (sample) {
      setCustomPrice(sample.quoted_price?.toString() || '');
      setSelectedState(sample.state || 'National Baseline');
      runAnalysis({ sample_id: sampleId, state: sample.state || selectedState });
    }
  };

  // Button: Upload Document Image / PDF / Text
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCustomFile(file);
      setSelectedSampleId('');
      
      // If image file, generate preview
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        setPreviewImageUrl(url);
      } else {
        setPreviewImageUrl(null);
      }

      const priceNum = customPrice ? parseFloat(customPrice) : undefined;
      runAnalysis({ file, quoted_price: priceNum, state: selectedState });
    }
  };

  // Button: Recalculate / Apply Changes
  const handleRecalculate = () => {
    const priceNum = customPrice ? parseFloat(customPrice) : undefined;
    if (customFile) {
      runAnalysis({ file: customFile, raw_text: rawTextEdit, quoted_price: priceNum, state: selectedState });
    } else if (selectedSampleId) {
      runAnalysis({ sample_id: selectedSampleId, raw_text: rawTextEdit, quoted_price: priceNum, state: selectedState });
    } else {
      runAnalysis({ raw_text: rawTextEdit, quoted_price: priceNum, state: selectedState });
    }
  };

  // Button: Reset / Clear
  const handleReset = () => {
    setCustomFile(null);
    setPreviewImageUrl(null);
    setCustomPrice('');
    setRawTextEdit('');
    setSelectedLinkedWork(null);
    setSelectedSampleId('sample_cement_opc53_overpriced');
    runAnalysis({ sample_id: 'sample_cement_opc53_overpriced' });
  };

  // Button: Search Real MPLADS Works
  const handleSearchWorks = async () => {
    setSearchingWorks(true);
    try {
      const res = await searchMaterialWorks(workSearchQuery);
      setSearchResults(res.works || []);
    } catch (err) {
      console.error('Error searching works:', err);
    } finally {
      setSearchingWorks(false);
    }
  };

  // Button: Link Real MPLADS Work to Analysis
  const handleLinkWork = (work: any) => {
    setSelectedLinkedWork(work);
    if (work.state) setSelectedState(work.state);
    
    // Construct rich real-world project context for analysis
    const generatedVoucherText = `
    GOVERNMENT OF INDIA - MPLADS PROJECT MATERIAL INVOICE
    Linked Work ID: ${work.work_id}
    Project Title: ${work.description}
    Constituency: ${work.constituency}, State: ${work.state}
    Work Category: ${work.work_category}
    Sanctioned Amount: ₹${work.sanction_amount?.toLocaleString()}
    Material Specification: Ordinary Portland Cement (OPC 53 Grade) IS 12269:2013
    Supplier: District Authorized Government Contractor Depot
    Quantity: 500 bags
    Quoted Unit Price: ₹${customPrice || '485.00'} per bag
    Verification: Passed site technical inspection
    `;
    setRawTextEdit(generatedVoucherText);
    runAnalysis({ raw_text: generatedVoucherText, state: work.state, quoted_price: customPrice ? parseFloat(customPrice) : 485.0 });
    setActiveViewTab('audit');
  };

  // Button: Upload Custom Benchmark SOR CSV
  const handleUploadSorModule = async () => {
    if (!sorFile) return;
    setSorUploadStatus({ status: 'LOADING', message: 'Ingesting Schedule of Rates module...' });
    try {
      const res = await uploadBenchmarkModule(sorFile);
      if (res.status === 'SUCCESS') {
        setSorUploadStatus({
          status: 'SUCCESS',
          message: `Successfully ingested ${res.records_ingested} real-world specification rate benchmarks!`
        });
        // Refresh benchmarks list
        const benchRes = await fetchMaterialFairnessBenchmarks();
        if (benchRes?.benchmarks) setBenchmarks(benchRes.benchmarks);
      } else {
        setSorUploadStatus({ status: 'ERROR', message: res.message || 'Failed to parse benchmark file' });
      }
    } catch (err: any) {
      setSorUploadStatus({ status: 'ERROR', message: err.message || 'Upload failed' });
    }
  };

  // Button: Copy Official Auditor Decision Citation
  const handleCopyAuditCitation = () => {
    if (!analysisResult) return;
    const p = analysisResult.price_comparison;
    const a = analysisResult.fairness_assessment;
    const s = analysisResult.extracted_attributes;

    const citation = `
================================================================================
OFFICIAL AUDIT DECISION SUPPORT CITATION - MPLADS MATERIAL PRICE FAIRNESS
================================================================================
Generated: ${new Date().toLocaleString()}
Document Source: ${analysisResult.filename}
State / Market: ${p.state_applied}

MATERIAL SPECIFICATIONS:
- Material: ${s.material}
- Specific Grade: ${s.grade}
- Standard / IS Code: ${s.is_code}
- Brand / Supplier: ${s.brand}
- Quantity: ${s.quantity ? `${s.quantity} ${s.unit}` : s.unit}

PRICE COMPARISON & ARITHMETIC:
- Market Reference Benchmark: ₹${p.reference_unit_price?.toLocaleString() || 'N/A'}/${p.unit}
- MPLADS Quoted Unit Price:   ₹${p.quoted_unit_price?.toLocaleString() || 'N/A'}/${p.unit}
- Absolute Difference:        ₹${p.price_difference !== null ? (p.price_difference >= 0 ? '+' : '') + p.price_difference : 'N/A'}/${p.unit}
- Percentage Variance:        ${p.price_difference_pct !== null ? (p.price_difference_pct >= 0 ? '+' : '') + p.price_difference_pct + '%' : 'N/A'}
- Formula: ((Quoted Price - Reference Price) / Reference Price) * 100

FAIRNESS ASSESSMENT (NON-ADJUDICATED GOVERNANCE):
- Assessment Indicator: ${a.label}
- Severity Level:       ${a.severity}
- Finding Rationale:    ${a.explanation}

AUDITOR GUIDANCE CHECKLIST:
${analysisResult.auditor_guidance.map((g) => `[ ] ${g}`).join('\n')}
================================================================================
    `.trim();

    navigator.clipboard.writeText(citation).then(() => {
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 3000);
    });
  };

  // Filter benchmarks table
  const filteredBenchmarks = benchmarks.filter((b) => {
    const matchesState = !benchmarkFilterState || b.state?.toLowerCase().includes(benchmarkFilterState.toLowerCase());
    const matchesMat = !benchmarkFilterMaterial || b.material?.toLowerCase().includes(benchmarkFilterMaterial.toLowerCase()) || b.grade?.toLowerCase().includes(benchmarkFilterMaterial.toLowerCase());
    const matchesCategory = activeCategoryFilter === 'ALL' || b.material?.toLowerCase().includes(activeCategoryFilter.toLowerCase());
    return matchesState && matchesMat && matchesCategory;
  });

  const getStatusTheme = (theme?: string) => {
    switch (theme) {
      case 'emerald':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
          badge: 'bg-emerald-500 text-white',
          pill: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
        };
      case 'amber':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
          badge: 'bg-amber-500 text-white',
          pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
        };
      default:
        return {
          bg: 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-400',
          badge: 'bg-slate-500 text-white',
          pill: 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
        };
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Toast Notification */}
      {copiedToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-emerald-500/40 flex items-center gap-2 animate-bounce">
          <CheckCheck className="w-5 h-5 text-emerald-400" />
          <span className="text-xs font-bold">Official Auditor Citation copied to clipboard!</span>
        </div>
      )}

      {/* Top Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-slate-800">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" /> Material Quality & Price Fairness Engine
              </span>
              <span className="px-3 py-1 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full flex items-center gap-1">
                <FileCheck className="w-3 h-3" /> Grade-Specific OCR & Vision Analysis
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Material Specification & Price Fairness Intelligence
            </h1>
            <p className="text-slate-300 text-sm max-w-3xl leading-relaxed">
              Extract exact material components, grades, and quality standards (OPC 53 Cement, Fe500D TMT Steel, M25 Concrete, etc.) from physical vouchers/invoices. Evaluates unit price fairness against state Schedule of Rates (SOR) benchmarks using non-adjudicated decision support governance.
            </p>
          </div>

          {/* Navigation Tab Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setActiveViewTab('audit')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs ${
                activeViewTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-md ring-2 ring-indigo-500'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /> Live Document Audit
            </button>
            <button
              onClick={() => setActiveViewTab('ingestion')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs ${
                activeViewTab === 'ingestion'
                  ? 'bg-white text-slate-900 shadow-md ring-2 ring-indigo-500'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              <Upload className="w-4 h-4 text-emerald-500" /> Real-World Ingestion Hub
            </button>
            <button
              onClick={() => setActiveViewTab('benchmarks')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-xs ${
                activeViewTab === 'benchmarks'
                  ? 'bg-white text-slate-900 shadow-md ring-2 ring-indigo-500'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              <Layers className="w-4 h-4 text-amber-400" /> Specification Benchmarks ({benchmarks.length})
            </button>
          </div>
        </div>

        {/* Responsible AI Governance Notice Banner */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-start gap-3 text-xs text-slate-300">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-white">Responsible AI Governance Enforced:</strong> The engine evaluates material pricing as an operational decision-support indicator. Strict governance terms apply (<em>"Price appears reasonable"</em>, <em>"Price is above the reference range"</em>, <em>"Requires review"</em>). Terms such as <em>"Fraud"</em> or <em>"Illegal"</em> are strictly excluded.
          </span>
        </div>
      </div>

      {/* VIEW 1: LIVE DOCUMENT AUDIT */}
      {activeViewTab === 'audit' && (
        <>
          {/* Top Controls Toolbar: Pre-configured Vouchers, Upload, and Rate Controls */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2 uppercase tracking-wide">
                  <Sparkles className="w-4 h-4 text-indigo-500" /> Real-World SIH Audit Test Vouchers (1-Click Demo)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select a test case to immediately verify quality-aware specification matching & price difference calculations.
                </p>
              </div>

              {/* State Selection Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                  Benchmark Market:
                </label>
                <select
                  value={selectedState}
                  onChange={(e) => {
                    setSelectedState(e.target.value);
                    handleRecalculate();
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="National Baseline">National Baseline (All India SOR)</option>
                  <option value="Andhra Pradesh">Andhra Pradesh PWD</option>
                  <option value="Delhi (UT)">Delhi (UT) PWD SOR</option>
                  <option value="Maharashtra">Maharashtra PWD / Mumbai</option>
                  <option value="Uttar Pradesh">Uttar Pradesh PWD / Lucknow</option>
                </select>
              </div>
            </div>

            {/* 5 Real-World Sample Voucher Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {samples.map((sample) => {
                const isSelected = selectedSampleId === sample.id;
                return (
                  <button
                    key={sample.id}
                    onClick={() => handleSampleClick(sample.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex flex-col justify-between space-y-2 group cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/40 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-indigo-300 dark:hover:border-indigo-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          {sample.doc_type}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                      </div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                        {sample.title}
                      </h3>
                    </div>
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">
                        ₹{sample.quoted_price?.toLocaleString()}/{sample.quoted_unit}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {sample.expected_assessment?.includes('above') ? '⚠️ Overpriced' : sample.expected_assessment?.includes('Low') ? '⚠️ Under-spec' : '✓ Standard'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Direct Upload & Price Adjustment Action Bar */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm">
                  <Upload className="w-4 h-4" /> Upload Material Invoice / Document
                  <input type="file" accept="image/*,.pdf,.txt,.csv" onChange={handleFileUpload} className="hidden" />
                </label>

                <button
                  onClick={() => setShowRawTextEditor(!showRawTextEditor)}
                  className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-500" /> {showRawTextEditor ? 'Hide OCR Editor' : 'Edit OCR Text'}
                </button>

                <button
                  onClick={handleReset}
                  className="px-3.5 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset Form
                </button>

                {customFile && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 truncate max-w-[200px]">
                    ✓ Uploaded: {customFile.name}
                  </span>
                )}
              </div>

              {/* Price Override Tool */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">
                  Quoted Unit Price (₹):
                </span>
                <input
                  type="number"
                  placeholder="e.g. 485"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-28 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-extrabold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
                <button
                  onClick={handleRecalculate}
                  className="px-4 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shrink-0 shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Recalculate
                </button>
              </div>
            </div>

            {/* Optional Raw OCR Text Editor Box */}
            {showRawTextEditor && (
              <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-600" /> Extracted Raw OCR Text (Editable by Auditor):
                  </span>
                  <button
                    onClick={handleRecalculate}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 underline"
                  >
                    Apply & Re-extract
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={rawTextEdit}
                  onChange={(e) => setRawTextEdit(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500"
                  placeholder="Paste or edit voucher text here..."
                />
              </div>
            )}
          </div>

          {/* Loading Spinner */}
          {loading && (
            <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Running OCR vision extraction, quality-grade matching & price variance arithmetic…
              </p>
            </div>
          )}

          {/* MAIN DUAL-PANE AUDIT SHOWCASE */}
          {!loading && analysisResult && (
            <div className="space-y-6">
              {/* SECTION A: MATERIAL SPECIFICATION MASTER SHOWCASE CARD */}
              <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-md space-y-6">
                {/* Hero Specification Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 text-white flex items-center justify-center font-black shadow-lg shrink-0">
                      <Scale className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Identified Material Component
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          ✓ Quality-Aware Matching Active
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                        {analysisResult.extracted_attributes.material}
                      </h2>
                    </div>
                  </div>

                  {/* Grade Hero Pill */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-800 text-white shadow-md space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-indigo-200 tracking-wider block">
                        Verified Specification Grade
                      </span>
                      <span className="text-base font-black tracking-wide">
                        {analysisResult.extracted_attributes.grade}
                      </span>
                    </div>

                    <div className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider block">
                        Bureau of Indian Standards
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                        {analysisResult.extracted_attributes.is_code}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 6 High-Clarity Specification Property Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Card 1: Material Category */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-indigo-500" /> Material Component
                    </span>
                    <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {analysisResult.extracted_attributes.material}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Standard construction input category
                    </p>
                  </div>

                  {/* Card 2: Grade & Specification */}
                  <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Specific Grade
                    </span>
                    <div className="text-base font-extrabold text-indigo-900 dark:text-indigo-200">
                      {analysisResult.extracted_attributes.grade}
                    </div>
                    <p className="text-[11px] text-indigo-700/70 dark:text-indigo-300/70">
                      Granular specification used for pricing
                    </p>
                  </div>

                  {/* Card 3: Standard & IS Code */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500" /> IS Standard Code
                    </span>
                    <div className="text-base font-extrabold font-mono text-slate-900 dark:text-slate-100">
                      {analysisResult.extracted_attributes.is_code}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      BIS statutory technical specification
                    </p>
                  </div>

                  {/* Card 4: Supplier / Brand */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500" /> Brand / Supplier
                    </span>
                    <div className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                      {analysisResult.extracted_attributes.brand}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Procurement vendor / mill source
                    </p>
                  </div>

                  {/* Card 5: Sanctioned Quantity & Unit */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-500" /> Sanctioned Quantity & Unit
                    </span>
                    <div className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                      {analysisResult.extracted_attributes.quantity ? `${analysisResult.extracted_attributes.quantity.toLocaleString()} ${analysisResult.extracted_attributes.unit}` : `Unit: ${analysisResult.extracted_attributes.unit}`}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Bill of Quantities (BOQ) billing metric
                    </p>
                  </div>

                  {/* Card 6: Quality Test Compliance */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Quality Attributes
                    </span>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2">
                      {analysisResult.extracted_attributes.quality_attributes.join(' • ')}
                    </div>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      ✓ Mandatory quality tests verified
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION B: DUAL-PANE RESULTS (PRICE GAUGE & AUDITOR DECISION SUPPORT) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Pane (7 Cols): Price Variance Comparison & Mathematical Calculation */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Fairness Assessment Indicator Banner */}
                  <div className={`p-6 rounded-3xl border shadow-sm space-y-4 ${getStatusTheme(analysisResult.fairness_assessment.color_theme).bg}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {analysisResult.fairness_assessment.color_theme === 'emerald' ? (
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
                        ) : analysisResult.fairness_assessment.color_theme === 'amber' ? (
                          <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0" />
                        ) : (
                          <HelpCircle className="w-8 h-8 text-slate-500 shrink-0" />
                        )}
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider opacity-75 block">
                            Fairness Assessment Indicator
                          </span>
                          <h3 className="text-xl font-black tracking-tight">
                            {analysisResult.fairness_assessment.label}
                          </h3>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusTheme(analysisResult.fairness_assessment.color_theme).badge}`}>
                        Severity: {analysisResult.fairness_assessment.severity}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed font-medium">
                      {analysisResult.fairness_assessment.explanation}
                    </p>
                  </div>

                  {/* Visual Side-by-Side Comparative Price Cards */}
                  <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <Scale className="w-4 h-4 text-indigo-500" /> Side-by-Side Unit Price Comparison
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Audited against: <strong>{analysisResult.price_comparison.benchmark_source}</strong>
                        </p>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {analysisResult.price_comparison.state_applied}
                      </span>
                    </div>

                    {/* Comparative Price Metric Bars */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {/* Reference Benchmark Price */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Reference Price (₹X)
                        </span>
                        <div className="text-xl font-black text-slate-900 dark:text-slate-100">
                          {analysisResult.price_comparison.reference_unit_price !== null
                            ? `₹${analysisResult.price_comparison.reference_unit_price.toLocaleString()}`
                            : 'N/A'}
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            /{analysisResult.price_comparison.unit}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                          State SOR Index
                        </span>
                      </div>

                      {/* MPLADS Quoted Price */}
                      <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          Quoted Price (₹Y)
                        </span>
                        <div className="text-xl font-black text-indigo-900 dark:text-indigo-100">
                          {analysisResult.price_comparison.quoted_unit_price !== null
                            ? `₹${analysisResult.price_comparison.quoted_unit_price.toLocaleString()}`
                            : 'N/A'}
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            /{analysisResult.price_comparison.unit}
                          </span>
                        </div>
                        <span className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 block">
                          Sanctioned Rate
                        </span>
                      </div>

                      {/* Absolute Difference */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Difference (₹)
                        </span>
                        <div className="text-xl font-black text-slate-900 dark:text-slate-100">
                          {analysisResult.price_comparison.price_difference !== null
                            ? `${analysisResult.price_comparison.price_difference >= 0 ? '+' : ''}₹${analysisResult.price_comparison.price_difference.toLocaleString()}`
                            : 'N/A'}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          Quoted - Reference
                        </span>
                      </div>

                      {/* Percentage Difference */}
                      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Variance (%)
                        </span>
                        <div className={`text-xl font-black ${
                          analysisResult.price_comparison.price_difference_pct !== null && analysisResult.price_comparison.price_difference_pct > 15
                            ? 'text-amber-600 dark:text-amber-400'
                            : analysisResult.price_comparison.price_difference_pct !== null && analysisResult.price_comparison.price_difference_pct < -20
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {analysisResult.price_comparison.price_difference_pct !== null
                            ? `${analysisResult.price_comparison.price_difference_pct >= 0 ? '+' : ''}${analysisResult.price_comparison.price_difference_pct}%`
                            : 'N/A'}
                        </div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                          Variance Percentage
                        </span>
                      </div>
                    </div>

                    {/* Step-by-Step Mathematical Calculation Box */}
                    <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-xs space-y-2 font-mono border border-slate-800 shadow-inner">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Mathematical Formula Execution</span>
                        <span className="text-emerald-400 font-bold">100% Deterministic Arithmetic</span>
                      </div>
                      <div className="text-slate-300">
                        Price Difference = Quoted Unit Price (₹Y) - Reference Price (₹X)
                      </div>
                      <div className="text-slate-300">
                        Price Difference % = ((Quoted Price - Reference Price) / Reference Price) × 100
                      </div>
                      {analysisResult.price_comparison.reference_unit_price && analysisResult.price_comparison.quoted_unit_price && (
                        <div className="text-indigo-300 font-bold pt-2 border-t border-slate-800">
                          Result: (({analysisResult.price_comparison.quoted_unit_price} - {analysisResult.price_comparison.reference_unit_price}) / {analysisResult.price_comparison.reference_unit_price}) × 100 = {analysisResult.price_comparison.price_difference_pct}%
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Pane (5 Cols): Evidence Preview, Checklist, and Citation Export */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Actionable Auditor Checklist */}
                  <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-indigo-500" /> Auditor Review Checklist
                      </h3>
                      <button
                        onClick={handleCopyAuditCitation}
                        className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copy Citation
                      </button>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {analysisResult.auditor_guidance.map((guide, i) => (
                        <label key={i} className="flex items-start gap-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          <input type="checkbox" className="mt-0.5 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{guide}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Document Preview & OCR Text Card */}
                  <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500" /> Document Evidence Source
                      </h3>
                      <span className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                        {analysisResult.filename}
                      </span>
                    </div>

                    {/* Image preview thumbnail if uploaded */}
                    {previewImageUrl && (
                      <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                        <img src={previewImageUrl} alt="Uploaded Voucher" className="object-contain max-h-48 w-full" />
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-slate-950/80 text-white text-[10px] rounded-md font-mono">
                          Live Image Preview
                        </span>
                      </div>
                    )}

                    <div className="p-3.5 bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto max-h-44 border border-slate-800 leading-relaxed whitespace-pre-wrap">
                      {analysisResult.extracted_text}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* VIEW 2: REAL-WORLD MODULE & DOCUMENT INGESTION HUB */}
      {activeViewTab === 'ingestion' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-500" /> Real-World Module & Document Ingestion Center
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Upload real-world vouchers, link active MPLADS project records, or ingest state Schedule of Rates (SOR) benchmark modules.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Box 1: Real-world Voucher / Document Upload */}
              <div className="p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between space-y-4 text-center">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Upload Real-World Voucher / Bill Image
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Upload JPG, PNG, WEBP, or PDF material test certificates or contractor bills for instant OCR analysis.
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm text-center">
                    Select Document File
                    <input type="file" accept="image/*,.pdf,.txt" onChange={handleFileUpload} className="hidden" />
                  </label>
                  {customFile && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold truncate">
                      ✓ {customFile.name} ({(customFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>
              </div>

              {/* Box 2: Link Live MPLADS Work Record */}
              <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <Link className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 text-center">
                    Link with Live MPLADS Work Record
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                    Search and attach an existing project from the master 79,068 works database to audit its sanctioned material.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Enter Work ID or keyword (e.g. road, school)..."
                      value={workSearchQuery}
                      onChange={(e) => setWorkSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={handleSearchWorks}
                      className="px-3 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shrink-0"
                    >
                      {searchingWorks ? '...' : 'Search'}
                    </button>
                  </div>

                  {/* Search Results List */}
                  {searchResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                      {searchResults.map((work) => (
                        <div
                          key={work.work_id}
                          onClick={() => handleLinkWork(work)}
                          className="p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer text-left transition-colors border border-transparent hover:border-indigo-200"
                        >
                          <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">{work.work_id}</div>
                          <div className="text-[10px] text-slate-500 truncate">{work.description}</div>
                          <div className="text-[10px] font-bold text-indigo-600">₹{work.sanction_amount?.toLocaleString()} • {work.state}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Box 3: Ingest Custom Benchmark Module (SOR CSV) */}
              <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 text-center">
                    Ingest Custom Benchmark / SOR Module
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
                    Upload state Schedule of Rates CSV (columns: material, grade, unit, reference_price, state).
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="block w-full py-2.5 px-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors shadow-sm text-center">
                    Select CSV File
                    <input type="file" accept=".csv" onChange={(e) => e.target.files && setSorFile(e.target.files[0])} className="hidden" />
                  </label>
                  {sorFile && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block truncate">
                        {sorFile.name}
                      </span>
                      <button
                        onClick={handleUploadSorModule}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                      >
                        Ingest into Benchmark Database
                      </button>
                    </div>
                  )}
                  {sorUploadStatus && (
                    <div className={`text-xs font-bold p-2 rounded-lg ${sorUploadStatus.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-700'}`}>
                      {sorUploadStatus.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: SPECIFICATION BENCHMARKS CATALOG EXPLORER */}
      {activeViewTab === 'benchmarks' && (
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" /> Material Quality Specification Price Reference Benchmarks
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grade-specific reference unit prices compiled from CPWD Schedule of Rates, State PWDs, and Steel/Cement Market Indices across India.
              </p>
            </div>

            {/* Filter Search Bars */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter material or grade..."
                  value={benchmarkFilterMaterial}
                  onChange={(e) => setBenchmarkFilterMaterial(e.target.value)}
                  className="pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 w-48 sm:w-56"
                />
              </div>

              <input
                type="text"
                placeholder="Filter state..."
                value={benchmarkFilterState}
                onChange={(e) => setBenchmarkFilterState(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 w-32"
              />

              <button
                onClick={() => {
                  setBenchmarkFilterMaterial('');
                  setBenchmarkFilterState('');
                  setActiveCategoryFilter('ALL');
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Quick Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {['ALL', 'Cement', 'Steel', 'Aggregate', 'Brick', 'Concrete', 'Pipe', 'Bitumen'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeCategoryFilter === cat
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Benchmarks Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3.5">State / Market</th>
                  <th className="p-3.5">Material Component</th>
                  <th className="p-3.5">Specific Grade</th>
                  <th className="p-3.5">IS Standard</th>
                  <th className="p-3.5">Unit</th>
                  <th className="p-3.5 text-right">Reference Price (₹)</th>
                  <th className="p-3.5 text-right">Tolerance Band (₹)</th>
                  <th className="p-3.5">Benchmark Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredBenchmarks.map((b, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5 font-semibold text-slate-900 dark:text-slate-100">{b.state}</td>
                    <td className="p-3.5 font-medium">{b.material}</td>
                    <td className="p-3.5 font-bold text-indigo-600 dark:text-indigo-400">{b.grade}</td>
                    <td className="p-3.5 font-mono">{b.is_code}</td>
                    <td className="p-3.5 font-semibold">{b.unit}</td>
                    <td className="p-3.5 text-right font-black text-slate-900 dark:text-slate-100">
                      ₹{parseFloat(b.reference_price).toLocaleString()}/{b.unit}
                    </td>
                    <td className="p-3.5 text-right text-slate-500 dark:text-slate-400 font-mono">
                      ₹{parseFloat(b.min_price).toLocaleString()} - ₹{parseFloat(b.max_price).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-slate-500 dark:text-slate-400 max-w-[200px] truncate" title={b.source}>
                      {b.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default MaterialFairnessPage;
