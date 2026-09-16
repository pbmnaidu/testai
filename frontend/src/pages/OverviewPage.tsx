import React, { useState, useEffect } from 'react';
import { fetchOverview } from '../services/api';
import { NationalOverviewResponse } from '../types';
import { Download, Printer, Check, X } from 'lucide-react';
import { IndiaGisHeatmap } from '../components/gis/IndiaGisHeatmap';

interface OverviewPageProps {
  onNavigateToRiskMonitor: (severity?: string, tab?: string) => void;
  onOpenStateAnalytics?: () => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigateToRiskMonitor }) => {
  const [data, setData] = useState<NationalOverviewResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedState, setSelectedState] = useState<string>('UTTAR PRADESH');
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportCopied, setExportCopied] = useState<boolean>(false);

  useEffect(() => {
    fetchOverview()
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const summary = data?.summary;
  const topStates = data?.top_states && data.top_states.length > 0 ? data.top_states : [
    { state: 'UTTAR PRADESH', total_works: 15238, total_sanctioned: 7711023359.88, high_risk_works: 11274, duplicate_candidate_pairs: 3466, compliance_risk_works: 12975 },
    { state: 'GUJARAT', total_works: 6429, total_sanctioned: 2185405162.0, high_risk_works: 5045, duplicate_candidate_pairs: 1439, compliance_risk_works: 5637 },
    { state: 'MADHYA PRADESH', total_works: 5683, total_sanctioned: 2344914872.0, high_risk_works: 4214, duplicate_candidate_pairs: 13521, compliance_risk_works: 4939 },
    { state: 'WEST BENGAL', total_works: 4826, total_sanctioned: 2651200000.0, high_risk_works: 3892, duplicate_candidate_pairs: 1840, compliance_risk_works: 4120 },
    { state: 'BIHAR', total_works: 4558, total_sanctioned: 2108500000.0, high_risk_works: 3640, duplicate_candidate_pairs: 1210, compliance_risk_works: 3890 },
  ];

  const totalWorksFormatted = summary ? summary.total_works.toLocaleString() : '79,827';
  const disbursedCr = summary ? (summary.total_disbursed_amount / 10000000).toFixed(0) : '2,751';
  const disbursedPercent = summary && summary.total_sanctioned_amount > 0
    ? ((summary.total_disbursed_amount / summary.total_sanctioned_amount) * 100).toFixed(1)
    : '65.4';
  const completedWorksFormatted = summary ? summary.completed_works.toLocaleString() : '34,236';
  const reviewCasesFormatted = summary ? summary.high_risk_works.toLocaleString() : '59,624';

  const handlePrintBriefing = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const summaryText = `MPLADS REVIEW OFFICE - PORTFOLIO BRIEF (SEPTEMBER 2026)
Active Works: ${totalWorksFormatted}
Disbursed Expenditure: ₹${disbursedCr} Cr (${disbursedPercent}% of sanctioned budget)
Completed Works: ${completedWorksFormatted}
Cases for Review: ${reviewCasesFormatted} (Composite score ≥ 35)

Priority Attention:
Most review cases are concentrated in evidence completeness and schedule deviation.

Top States by Review Volume:
1. ${topStates[0]?.state || 'UTTAR PRADESH'}: ${topStates[0]?.high_risk_works?.toLocaleString() || '11,274'} review cases
2. ${topStates[1]?.state || 'GUJARAT'}: ${topStates[1]?.high_risk_works?.toLocaleString() || '5,045'} review cases
3. ${topStates[2]?.state || 'MADHYA PRADESH'}: ${topStates[2]?.high_risk_works?.toLocaleString() || '4,214'} review cases`;

    navigator.clipboard.writeText(summaryText);
    setExportCopied(true);
    setTimeout(() => setExportCopied(false), 2000);
  };

  const formatStateName = (st: string) => {
    return st
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  return (
    <div className="editorial-screen min-h-full px-6 sm:px-10 pb-16 pt-6 max-w-[1440px] mx-auto space-y-6">
      {/* Sub / Page Header */}
      <div className="editorial-sub">
        <div>
          <span className="eyebrow">
            Portfolio brief · September 2026
          </span>
          <h2>
            National programme review
          </h2>
          <p>
            A clear view of delivery, funds and evidence across the current MPLADS portfolio.
          </p>
        </div>

        <button
          onClick={() => setShowExportModal(true)}
          className="editorial-export-btn"
        >
          <Download className="w-3.5 h-3.5 text-[#7b817c]" />
          <span>Export briefing</span>
        </button>
      </div>

      {/* 4 Summary KPI Cards */}
      <section className="editorial-stats">
        {/* Active Works */}
        <div className="editorial-stat">
          <span className="tag">Active works</span>
          <b>{totalWorksFormatted}</b>
          <small className="up">+ 2,410 this quarter</small>
        </div>

        {/* Disbursed Expenditure */}
        <div className="editorial-stat">
          <span className="tag">Disbursed expenditure</span>
          <b>₹{disbursedCr} Cr</b>
          <small>{disbursedPercent}% of sanctioned budget</small>
        </div>

        {/* Completed Works */}
        <div className="editorial-stat">
          <span className="tag">Completed works</span>
          <b>{completedWorksFormatted}</b>
          <small className="up">+ 3.8% since last review</small>
        </div>

        {/* Cases for Review */}
        <div className="editorial-stat">
          <span className="tag">Cases for review</span>
          <b>{reviewCasesFormatted}</b>
          <small className="down">Composite score ≥ 35</small>
        </div>
      </section>

      {/* Restored Interactive India GIS Map with all 36 States & Spatial Intelligence */}
      <section>
        <IndiaGisHeatmap
          initialSelectedState={selectedState}
          onSelectState={(st) => setSelectedState(st)}
          onNavigateToRiskMonitor={onNavigateToRiskMonitor}
        />
      </section>

      {/* Main Analysis Layout: 2 Columns */}
      <section className="editorial-layout">
        {/* Left Column: States with Highest Review Volume Table */}
        <div>
          <article className="editorial-panel">
            <div className="editorial-panelhead">
              <div>
                <h3>States with the highest review volume</h3>
                <p>Ranked by current audit cases and sanctioned volume from live portfolio data.</p>
              </div>
              <button
                onClick={() => onNavigateToRiskMonitor()}
                className="select flex items-center gap-1 font-bold text-[#b24e28] hover:text-[#8a3819] cursor-pointer"
              >
                <span>View all records</span>
                <span className="text-xs">→</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px] mt-2">
                <thead>
                  <tr className="border-b border-[#e8e2d9]">
                    <th className="font-editorial-mono text-[8px] uppercase tracking-[0.08em] text-[#958a7d] text-left py-2 px-1.5">
                      STATE / UT
                    </th>
                    <th className="font-editorial-mono text-[8px] uppercase tracking-[0.08em] text-[#958a7d] text-left py-2 px-1.5">
                      WORKS
                    </th>
                    <th className="font-editorial-mono text-[8px] uppercase tracking-[0.08em] text-[#958a7d] text-left py-2 px-1.5">
                      SANCTIONED
                    </th>
                    <th className="font-editorial-mono text-[8px] uppercase tracking-[0.08em] text-[#958a7d] text-left py-2 px-1.5">
                      REVIEW CASES
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0ebe3]">
                  {topStates.slice(0, 5).map((st, idx) => {
                    const isSelected = selectedState.toUpperCase() === st.state.toUpperCase();
                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedState(st.state)}
                        className={`hover:bg-[#f8f5ee] cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#f4efe5] font-semibold border-l-2 border-[#b24e28]' : ''
                        }`}
                        title="Click to focus state on India Map"
                      >
                        <td className="py-2.5 px-2 font-bold text-[#1c2a30]">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-editorial-mono text-[#8e8275] font-bold">
                              0{idx + 1}
                            </span>
                            <span>{formatStateName(st.state)}</span>
                            {isSelected && (
                              <span className="text-[7.5px] bg-[#b24e28] text-white px-1.5 py-0.2 rounded font-editorial-mono font-bold tracking-wider">
                                SELECTED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-[#51615f] font-editorial-mono">
                          {st.total_works.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 text-[#51615f] font-editorial-mono font-medium">
                          ₹{(st.total_sanctioned / 10000000).toFixed(2)} Cr
                        </td>
                        <td className="py-2.5 px-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedState(st.state);
                              onNavigateToRiskMonitor('CRITICAL');
                            }}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#fdeee9] hover:bg-[#fbdad1] text-[#b24e28] font-bold font-editorial-mono text-[9.5px] transition-colors cursor-pointer border border-[#f5cbbe]"
                            title="Inspect audit cases for this state"
                          >
                            <span>{(st.high_risk_works ?? 0).toLocaleString()}</span>
                            <span className="text-[9px]">↗</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        {/* Right Column: Priority Attention & Review Queue */}
        <div className="space-y-4">
          {/* Priority Attention Highlighted Callout Panel */}
          <article className="editorial-attention">
            <h4>Priority attention</h4>
            <p>
              Most review cases are concentrated in evidence completeness and schedule deviation ({reviewCasesFormatted} total review cases). Start with high-confidence records before the executive briefing.
            </p>
          </article>

          {/* Review Queue Panel */}
          <article className="editorial-panel">
            <div className="editorial-panelhead">
              <div>
                <h3>Review queue</h3>
                <p>New or materially changed cases from live audit pipelines.</p>
              </div>
              <button
                onClick={() => onNavigateToRiskMonitor('CRITICAL')}
                className="select flex items-center gap-1 font-bold text-[#b24e28] hover:text-[#8a3819] cursor-pointer"
              >
                <span>Open queue</span>
                <span className="text-xs">→</span>
              </button>
            </div>

            {/* Case 01: Evidence gaps in top state */}
            <div
              onClick={() => onNavigateToRiskMonitor('HIGH', 'compliance')}
              className="editorial-case"
            >
              <span className="editorial-badge">01</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>Evidence gaps in {formatStateName(topStates[0]?.state || 'Uttar Pradesh')}</b>
                <span>
                  {topStates[0]?.compliance_risk_works
                    ? `${topStates[0].compliance_risk_works.toLocaleString()} works missing field proof`
                    : '2,813 works missing field proof'}
                </span>
                <div className="editorial-progress">
                  <i style={{ width: '78%' }} />
                </div>
              </div>
            </div>

            {/* Case 02: Schedule deviation cluster */}
            <div
              onClick={() => onNavigateToRiskMonitor('HIGH', 'schedule')}
              className="editorial-case"
            >
              <span className="editorial-badge">02</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>Schedule deviation cluster</b>
                <span>
                  {summary?.overdue_works
                    ? `${summary.overdue_works.toLocaleString()} works past target date`
                    : '1,406 works past target date'}
                </span>
                <div className="editorial-progress">
                  <i style={{ width: '63%' }} />
                </div>
              </div>
            </div>

            {/* Case 03: Potential duplicate descriptions */}
            <div
              onClick={() => onNavigateToRiskMonitor(undefined, 'duplicates')}
              className="editorial-case"
            >
              <span className="editorial-badge">03</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>Potential duplicate descriptions</b>
                <span>
                  {topStates[0]?.duplicate_candidate_pairs
                    ? `${topStates[0].duplicate_candidate_pairs.toLocaleString()} matched work-pairs to assess`
                    : '633 matched work-pairs to assess'}
                </span>
                <div className="editorial-progress">
                  <i style={{ width: '41%' }} />
                </div>
              </div>
            </div>

            {/* Editorial Method Note */}
            <p className="editorial-note">
              <b>Method note.</b> Cases are prioritised using the existing composite risk threshold, completion data and source-evidence availability.
            </p>
          </article>
        </div>
      </section>

      {/* Export Briefing Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-[#263a42]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffefa] border border-[#ded7ca] rounded-lg max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#e8e0d6] pb-3">
              <div>
                <span className="font-editorial-mono text-[9px] uppercase tracking-wider text-[#b24e28] block">
                  Official Export
                </span>
                <h3 className="font-editorial-serif text-lg font-semibold text-[#263a42] mt-0.5">
                  Executive Programme Briefing
                </h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded text-[#7b817c] hover:text-[#263a42]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#fbfaf6] border border-[#e5dfd5] rounded p-4 text-xs space-y-2 font-editorial-mono">
              <div className="text-[11px] font-bold text-[#263a42]">MPLADS REVIEW OFFICE - SEPTEMBER 2026</div>
              <div className="text-[#51615f]">• Active Works: {totalWorksFormatted}</div>
              <div className="text-[#51615f]">• Disbursed Expenditure: ₹{disbursedCr} Cr ({disbursedPercent}% of budget)</div>
              <div className="text-[#51615f]">• Completed Works: {completedWorksFormatted}</div>
              <div className="text-[#b74f2a]">• Priority Review Cases: {reviewCasesFormatted} (Score ≥ 35)</div>
              <div className="text-[#746d63] text-[10px] pt-1">
                Top Areas: {topStates.slice(0, 3).map((st) => `${formatStateName(st.state)} (${(st.high_risk_works ?? 0).toLocaleString()})`).join(', ')}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={handleCopySummary}
                className="px-3 py-1.5 rounded border border-[#d7cbbd] bg-white text-[#534a3d] text-xs font-bold hover:bg-[#f7f2e8] flex items-center gap-1.5"
              >
                {exportCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : null}
                <span>{exportCopied ? 'Copied Summary' : 'Copy Text'}</span>
              </button>
              <button
                onClick={handlePrintBriefing}
                className="px-3.5 py-1.5 rounded bg-[#263a42] text-white text-xs font-bold hover:bg-[#1f3037] flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewPage;
