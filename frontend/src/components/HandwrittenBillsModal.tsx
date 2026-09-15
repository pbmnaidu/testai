import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Minus,
  PenTool,
  Plus,
  Receipt,
  RotateCcw,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { getGeotagEvidence, HandwrittenBillRecord } from '../lib/geotagEvidence';

interface HandwrittenBillsModalProps {
  isOpen: boolean;
  workId: string | null;
  onClose: () => void;
}

export const HandwrittenBillsModal: React.FC<HandwrittenBillsModalProps> = ({
  isOpen,
  workId,
  onClose,
}) => {
  const record = getGeotagEvidence(workId);
  const bills: HandwrittenBillRecord[] = record?.handwrittenBills || [];

  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);
  const [showOcrText, setShowOcrText] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setSelectedIndex(0);
    setZoom(1);
    setShowOcrText(false);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') {
        setSelectedIndex((prev) => (bills.length > 0 ? (prev + 1) % bills.length : 0));
        setZoom(1);
      }
      if (event.key === 'ArrowLeft') {
        setSelectedIndex((prev) => (bills.length > 0 ? (prev - 1 + bills.length) % bills.length : 0));
        setZoom(1);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, workId, bills.length, onClose]);

  const selectedBill = bills[selectedIndex] || bills[0];

  const categoryBadgeClass = (category: string) => {
    if (category.includes('Cash') || category.includes('Voucher')) {
      return 'border-amber-400/50 bg-amber-500/10 text-amber-300';
    }
    if (category.includes('Form 27') || category.includes('Running')) {
      return 'border-indigo-400/50 bg-indigo-500/10 text-indigo-300';
    }
    if (category.includes('M-Book') || category.includes('Measurement')) {
      return 'border-cyan-400/50 bg-cyan-500/10 text-cyan-300';
    }
    if (category.includes('Memorandum') || category.includes('Settlement')) {
      return 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300';
    }
    return 'border-purple-400/50 bg-purple-500/10 text-purple-300';
  };

  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6">
      <div className="relative flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 shadow-2xl">
        {/* Modal Header */}
        <header className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/30">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  Forensic Physical Evidence
                </span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                  {bills.length} Bill{bills.length === 1 ? '' : 's'} &amp; Vouchers Extracted
                </span>
              </div>
              <h2 className="text-base font-bold text-white sm:text-lg">
                Handwritten Bills &amp; Payment Vouchers · {record.fullWorkId || record.workId}
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-xl">
                {record.title} · {record.mandal}, {record.constituency}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-800/80 p-2 text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Close modal (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {bills.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
            <Receipt className="h-16 w-16 text-slate-600 mb-4" />
            <h3 className="text-lg font-bold text-slate-200">No Physical Bills Found in Dossier</h3>
            <p className="mt-1 max-w-md text-xs text-slate-400">
              The completion dossier for Work {record.fullWorkId || record.workId} does not contain scanned physical bills or vouchers.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
            {/* Left: Interactive Bill Document Viewer */}
            <div className="relative flex flex-1 flex-col overflow-hidden bg-slate-950">
              {/* Document Toolbar */}
              <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 p-1.5 shadow-lg backdrop-blur-md">
                <button
                  onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                  title="Zoom Out"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="font-mono text-xs text-slate-300 w-12 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                  title="Zoom In"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setZoom(1)}
                  className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <div className="h-4 w-px bg-slate-700 mx-1" />
                <a
                  href={selectedBill.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-sky-400 hover:bg-slate-800"
                  title="Open Original Resolution in New Tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Full Res
                </a>
              </div>

              {/* Prev / Next Page Overlays */}
              {bills.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      setSelectedIndex((prev) => (prev - 1 + bills.length) % bills.length);
                      setZoom(1);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-white shadow-xl hover:bg-slate-800"
                    title="Previous Bill (Left Arrow)"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => {
                      setSelectedIndex((prev) => (prev + 1) % bills.length);
                      setZoom(1);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80 text-white shadow-xl hover:bg-slate-800"
                    title="Next Bill (Right Arrow)"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {/* Document Image Scroll Area */}
              <div className="flex flex-1 items-center justify-center overflow-auto p-4 select-none">
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease-out',
                  }}
                  className="max-h-full max-w-full shadow-2xl rounded-lg overflow-hidden border border-slate-800"
                >
                  <img
                    src={selectedBill.image_url}
                    alt={`${selectedBill.bill_category} - ${selectedBill.page}`}
                    className="max-h-[75vh] w-auto object-contain bg-white"
                  />
                </div>
              </div>

              {/* Bottom Carousel of Bill Pages */}
              {bills.length > 1 && (
                <div className="border-t border-slate-800 bg-slate-900/80 p-3">
                  <div className="flex items-center gap-3 overflow-x-auto pb-1">
                    {bills.map((b, idx) => (
                      <button
                        key={b.filename}
                        onClick={() => {
                          setSelectedIndex(idx);
                          setZoom(1);
                        }}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs transition ${
                          idx === selectedIndex
                            ? 'border-amber-400 bg-amber-500/20 text-white ring-1 ring-amber-400'
                            : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                      >
                        <PenTool className="h-3.5 w-3.5 text-amber-400" />
                        <div>
                          <div className="font-bold text-[11px] text-white">
                            {b.page} · {b.bill_no !== 'Not Specified' ? `Vr #${b.bill_no}` : b.bill_category.split(' ')[0]}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                            {b.amount}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Forensic Metadata & Text Panel */}
            <aside className="w-full lg:w-96 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900/95 overflow-y-auto">
              <div className="p-5 space-y-5">
                {/* Category & Status */}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    Document Classification
                  </span>
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${categoryBadgeClass(selectedBill.bill_category)}`}>
                    <FileText className="h-3.5 w-3.5" />
                    {selectedBill.bill_category}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    File: <span className="font-mono text-slate-300">{selectedBill.filename}</span> ({selectedBill.page})
                  </div>
                </div>

                {/* Amount Highlight Card */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                    Disbursed / Net Payable Amount
                  </span>
                  <div className="mt-1 font-mono text-2xl font-black text-emerald-300">
                    {selectedBill.amount}
                  </div>
                  {selectedBill.all_amounts.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedBill.all_amounts.slice(1).map((amt, idx) => (
                        <span key={idx} className="rounded bg-emerald-900/50 px-2 py-0.5 text-[10px] font-mono text-emerald-200">
                          {amt}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Core Extracted Metadata */}
                <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Receipt className="h-3.5 w-3.5 text-slate-500" /> Voucher / Bill No:
                    </span>
                    <span className="font-mono font-bold text-white text-right">
                      {selectedBill.bill_no}
                    </span>
                  </div>

                  <div className="flex justify-between items-start gap-2">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-500" /> Bill Date:
                    </span>
                    <span className="font-mono font-bold text-white">
                      {selectedBill.date}
                    </span>
                  </div>

                  <div className="border-t border-slate-800/80 pt-2">
                    <span className="text-slate-400 flex items-center gap-1 mb-1">
                      <User className="h-3.5 w-3.5 text-slate-500" /> Contractor / Payee Agency:
                    </span>
                    <p className="font-semibold text-slate-200 leading-snug">
                      {selectedBill.contractor}
                    </p>
                  </div>

                  <div className="border-t border-slate-800/80 pt-2">
                    <span className="text-slate-400 block mb-1">
                      Head of Account / Purpose:
                    </span>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {selectedBill.work_description}
                    </p>
                  </div>
                </div>

                {/* Signatures & Approvals */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Verified Ink Signatures &amp; Seals
                  </span>
                  <div className="space-y-1.5">
                    {selectedBill.signatures.map((sig, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>{sig}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Handwriting Forensic Proof */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Physical Handwriting Markers
                  </span>
                  <div className="space-y-1.5">
                    {selectedBill.handwriting_evidence.map((ev, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-300">
                        <PenTool className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{ev}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Collapsible OCR Text Inspector */}
                <div className="border-t border-slate-800 pt-4">
                  <button
                    onClick={() => setShowOcrText(!showOcrText)}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <span className="flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-400" />
                      OCR Transcription ({selectedBill.lines_count} lines)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {showOcrText ? 'Hide ▲' : 'View ▼'}
                    </span>
                  </button>

                  {showOcrText && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-slate-300">
                      {selectedBill.key_text_snippets.map((snip, idx) => (
                        <div key={idx} className="border-b border-slate-900/60 pb-0.5 mb-0.5 last:border-0">
                          {snip}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};

export default HandwrittenBillsModal;
