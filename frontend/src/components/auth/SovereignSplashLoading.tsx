import React from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export const SovereignSplashLoading: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#fbfaf6] text-[#263a42] flex flex-col items-center justify-center p-6 select-none font-editorial-sans">
      <div className="max-w-md w-full text-center space-y-6 animate-fadeIn">
        {/* Government Emblem Seal */}
        <div className="mx-auto w-16 h-16 rounded-full border-2 border-[#b6a58b] bg-[#f2ede4] flex items-center justify-center shadow-sm">
          <span className="font-editorial-serif font-bold text-lg text-[#b24e28] tracking-wider">
            भारत
          </span>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e8f0ea] text-[#4b8c72] text-[10px] font-editorial-mono font-bold uppercase tracking-wider border border-[#d2dfd4]">
            <ShieldCheck className="w-3.5 h-3.5" /> Sovereign Session Verification
          </div>
          <h1 className="font-editorial-serif text-2xl sm:text-3xl font-bold text-[#263a42] tracking-tight">
            MPLADS Review Office
          </h1>
          <p className="font-editorial-mono text-[11px] text-[#7b817c] tracking-[0.06em] uppercase">
            Ministry of Statistics &amp; Programme Implementation
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 pt-4">
          <RefreshCw className="w-5 h-5 text-[#b24e28] animate-spin" />
          <span className="text-xs font-semibold text-[#7b817c]">
            Verifying statutory security credentials &amp; session…
          </span>
        </div>

        <div className="pt-8 border-t border-[#ded7ca] text-[11px] text-[#8d8171] leading-relaxed">
          National Portfolio &amp; Risk Intelligence System · Government of India
        </div>
      </div>
    </div>
  );
};
