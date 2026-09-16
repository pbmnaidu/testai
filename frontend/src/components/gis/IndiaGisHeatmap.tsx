import React, { useEffect, useState } from 'react';
import { MapPin, AlertTriangle, Navigation, Layers, Info, ArrowRight } from 'lucide-react';
import indiaMapAsset from '../../assets/india_map.png';
import { fetchOverview, fetchStateRiskSummary } from '../../services/api';
import { NationalOverviewResponse, StateRiskSummary } from '../../types';

interface StateGisData {
  state: string;
  code: string;
  lat: number;
  lng: number;
  x: number; // percentage X position on map canvas
  y: number; // percentage Y position on map canvas
}

interface LiveStateGisData extends StateGisData {
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  sanctionedCr: number;
  duplicateCandidatePairs: number;
  totalWorks: number;
  hasLiveData: boolean;
}

const STATE_GIS_NODES: StateGisData[] = [
  // Northern Region - calibrated for maximum visibility and non-overlap
  { state: 'Ladakh', code: 'LA', lat: 34.1526, lng: 77.5771, x: 36, y: 9 },
  { state: 'Jammu & Kashmir', code: 'JK', lat: 33.7782, lng: 76.5762, x: 28, y: 13.5 },
  { state: 'Himachal Pradesh', code: 'HP', lat: 31.1048, lng: 77.1734, x: 34, y: 18 },
  { state: 'Punjab', code: 'PB', lat: 31.1471, lng: 75.3412, x: 25.5, y: 22 },
  { state: 'Chandigarh', code: 'CH', lat: 30.7333, lng: 76.7794, x: 29.5, y: 20 },
  { state: 'Haryana', code: 'HR', lat: 29.0588, lng: 76.0856, x: 28, y: 26.5 },
  { state: 'Uttarakhand', code: 'UK', lat: 30.0668, lng: 79.0193, x: 39, y: 21.5 },
  { state: 'Delhi', code: 'DL', lat: 28.7041, lng: 77.1025, x: 33.5, y: 27.5 },
  
  // Western & Central Region
  { state: 'Rajasthan', code: 'RJ', lat: 27.0238, lng: 74.2179, x: 23, y: 36 },
  { state: 'Uttar Pradesh', code: 'UP', lat: 26.8467, lng: 80.9462, x: 44, y: 34 },
  { state: 'Gujarat', code: 'GJ', lat: 22.2587, lng: 71.1924, x: 17, y: 46 },
  { state: 'Dadra & Nagar Haveli', code: 'DN', lat: 20.3974, lng: 72.8328, x: 18.5, y: 54 },
  { state: 'Madhya Pradesh', code: 'MP', lat: 22.9734, lng: 78.6569, x: 37, y: 46 },
  { state: 'Chhattisgarh', code: 'CG', lat: 21.2787, lng: 81.8661, x: 49, y: 50 },

  // Eastern Region
  { state: 'Bihar', code: 'BR', lat: 25.0961, lng: 85.3131, x: 60, y: 37 },
  { state: 'Jharkhand', code: 'JH', lat: 23.6102, lng: 85.2799, x: 59, y: 44 },
  { state: 'West Bengal', code: 'WB', lat: 22.9868, lng: 87.8550, x: 66, y: 46 },
  { state: 'Odisha', code: 'OD', lat: 20.9517, lng: 85.0985, x: 57, y: 54 },

  // North-Eastern Region
  { state: 'Sikkim', code: 'SK', lat: 27.5330, lng: 88.5122, x: 69.5, y: 32 },
  { state: 'Assam', code: 'AS', lat: 26.2006, lng: 92.9376, x: 84, y: 35 },
  { state: 'Arunachal Pradesh', code: 'AR', lat: 28.2180, lng: 94.7278, x: 91, y: 29 },
  { state: 'Nagaland', code: 'NL', lat: 26.1584, lng: 94.5624, x: 89.5, y: 36 },
  { state: 'Manipur', code: 'MN', lat: 24.6637, lng: 93.9063, x: 87.5, y: 41 },
  { state: 'Mizoram', code: 'MZ', lat: 23.1645, lng: 92.9376, x: 84, y: 45 },
  { state: 'Tripura', code: 'TR', lat: 23.9408, lng: 91.9882, x: 80, y: 43 },
  { state: 'Meghalaya', code: 'ML', lat: 25.5788, lng: 91.8933, x: 78, y: 37 },

  // Southern & Island Region
  { state: 'Maharashtra', code: 'MH', lat: 19.7515, lng: 75.7139, x: 31, y: 58 },
  { state: 'Goa', code: 'GA', lat: 15.2993, lng: 74.1240, x: 25, y: 70 },
  { state: 'Karnataka', code: 'KA', lat: 15.3173, lng: 75.7139, x: 29, y: 74 },
  { state: 'Telangana', code: 'TG', lat: 18.1124, lng: 79.0193, x: 41, y: 62 },
  { state: 'Andhra Pradesh', code: 'AP', lat: 15.9129, lng: 79.7400, x: 41, y: 72 },
  { state: 'Tamil Nadu', code: 'TN', lat: 11.1271, lng: 78.6569, x: 37, y: 86 },
  { state: 'Kerala', code: 'KL', lat: 10.8505, lng: 76.2711, x: 32.5, y: 88 },
  { state: 'Puducherry', code: 'PY', lat: 11.9416, lng: 79.8083, x: 40.5, y: 82.5 },
  { state: 'Andaman & Nicobar', code: 'AN', lat: 11.7401, lng: 92.6586, x: 83, y: 82 },
  { state: 'Lakshadweep', code: 'LD', lat: 10.5667, lng: 72.6417, x: 8.5, y: 89 },
];

interface IndiaGisHeatmapProps {
  onSelectState?: (state: string) => void;
  onNavigateToRiskMonitor?: (severity?: string, tab?: string) => void;
  initialSelectedState?: string;
  className?: string;
}

export const IndiaGisHeatmap: React.FC<IndiaGisHeatmapProps> = ({
  onSelectState,
  onNavigateToRiskMonitor,
  initialSelectedState,
  className = ''
}) => {
  const [selectedNode, setSelectedNode] = useState<StateGisData>(() => {
    if (initialSelectedState) {
      const match = STATE_GIS_NODES.find(
        (n) => n.state.toUpperCase() === initialSelectedState.toUpperCase()
      );
      if (match) return match;
    }
    return STATE_GIS_NODES[9]; // UP default
  });
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [stateRiskSummary, setStateRiskSummary] = useState<StateRiskSummary | null>(null);
  const [overview, setOverview] = useState<NationalOverviewResponse | null>(null);
  const [overviewStatus, setOverviewStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    fetchOverview()
      .then((response) => {
        setOverview(response);
        setOverviewStatus('ready');
      })
      .catch(() => {
        setOverview(null);
        setOverviewStatus('unavailable');
      });
  }, []);

  useEffect(() => {
    if (initialSelectedState) {
      const match = STATE_GIS_NODES.find(
        (n) => normalizeStateName(n.state) === normalizeStateName(initialSelectedState)
      );
      if (match) {
        setSelectedNode(match);
      }
    }
  }, [initialSelectedState]);

  const normalizeStateName = (value: string) => {
    const normalized = value
      .toUpperCase()
      .replace(/&/g, ' AND ')
      .replace(/^THE\s+/, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    return normalized === 'DADRA AND NAGAR HAVELI'
      ? 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU'
      : normalized;
  };

  const liveNodes: LiveStateGisData[] = STATE_GIS_NODES.map((node) => {
    const metric = overview?.state_metrics?.find(
      (item) => normalizeStateName(item.state) === normalizeStateName(node.state),
    );
    return {
      ...node,
      riskLevel: metric?.risk_level || 'LOW',
      sanctionedCr: metric ? metric.total_sanctioned / 10000000 : 0,
      duplicateCandidatePairs: metric?.duplicate_candidate_pairs || 0,
      totalWorks: metric?.total_works || 0,
      hasLiveData: Boolean(metric),
    };
  });

  const selectedLiveNode = liveNodes.find((node) => node.state === selectedNode.state) || liveNodes[9];

  useEffect(() => {
    let active = true;
    setStateRiskSummary(null);

    fetchStateRiskSummary(selectedNode.state)
      .then((response) => {
        if (active) setStateRiskSummary(response);
      })
      .catch(() => {
        if (active) {
          setStateRiskSummary({
            state: selectedNode.state,
            total_works: 0,
            signals: [],
            dominant_signal: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [selectedNode.state]);

  const handleNodeClick = (node: StateGisData) => {
    setSelectedNode(node);
    onSelectState?.(node.state);
  };

  const filteredNodes = liveNodes.filter((n) => {
    if (overviewStatus !== 'ready') return filterLevel === 'ALL';
    if (filterLevel === 'ALL') return true;
    return n.riskLevel === filterLevel;
  });

  const getBadgeColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-[#fde8e4] text-[#b24e28] border border-[#f2c4b8] font-bold';
      case 'HIGH':
        return 'bg-[#fef4e6] text-[#b8741a] border border-[#f6dbb5] font-bold';
      case 'MEDIUM':
        return 'bg-[#fef3eb] text-[#ba6e3a] border border-[#f8dcce] font-bold';
      default:
        return 'bg-[#edf5f0] text-[#20664e] border border-[#cbe4d5] font-bold';
    }
  };

  const getNodeBg = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-[#b24e28]';
      case 'HIGH':
        return 'bg-[#c07218]';
      case 'MEDIUM':
        return 'bg-[#ba6e3a]';
      default:
        return 'bg-[#20664e]';
    }
  };

  const getSignalTone = (key: string) => {
    switch (key) {
      case 'financial':
        return 'text-[#263a42]';
      case 'compliance':
        return 'text-[#b24e28]';
      case 'duplicate':
        return 'text-[#ba6e3a]';
      default:
        return 'text-[#20664e]';
    }
  };

  return (
    <div className={`editorial-panel rounded-sm border border-[#e3ddd3] bg-[#fffefa] p-5 space-y-4 shadow-2xs ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e8e0d6] pb-3.5">
        <div>
          <h3 className="font-editorial-serif text-[18px] font-semibold text-[#263a42] m-0 leading-tight">
            Geographic review &amp; spatial context
          </h3>
          <p className="text-[10px] text-[#7b817c] mt-1 m-0">
            Live state-level risk, duplicate candidates, and delivery signals across 36 States &amp; UTs.
          </p>
        </div>

        {/* Header Right: State Selector & Risk Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedNode.state}
            onChange={(e) => {
              const match = STATE_GIS_NODES.find((n) => n.state === e.target.value);
              if (match) handleNodeClick(match);
            }}
            className="text-[10px] bg-[#fffefa] text-[#263a42] border border-[#ded7ca] rounded px-2 py-1 font-editorial-sans focus:outline-none focus:border-[#b24e28]"
            title="Jump to State/UT"
          >
            {STATE_GIS_NODES.map((n) => (
              <option key={n.code} value={n.state}>
                {n.state} ({n.code})
              </option>
            ))}
          </select>

          {/* Risk Level Filter Toggle */}
          <div className="flex items-center gap-1.5 bg-[#f4f0e8] border border-[#ded7ca] p-1 rounded-md">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2.5 py-1 rounded text-[9.5px] font-editorial-mono font-bold transition-all ${
                  filterLevel === lvl
                    ? 'bg-white text-[#b24e28] shadow-xs border border-[#ded7ca]'
                    : 'text-[#65736f] hover:text-[#263a42]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Map Container Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Interactive Visual Map Box */}
        <div className="lg:col-span-7 xl:col-span-8 bg-[#fdfbf7] rounded border border-[#e5dfd5] p-3.5 space-y-2 flex flex-col justify-between overflow-hidden">
          {/* Map Sub-Header Bar */}
          <div className="flex justify-between items-center z-10">
            <div className="flex items-center gap-1.5 bg-white border border-[#ded7ca] px-2.5 py-1 rounded text-[10px] font-bold text-[#263a42] shadow-2xs">
              <Layers className="w-3 h-3 text-[#b24e28]" />
              <span>India State-Centre View (36 States &amp; UTs)</span>
            </div>

            <div className="text-[9.5px] text-[#577469] bg-[#e8f0ea] border border-[#d2dfd4] px-2 py-0.5 rounded font-editorial-mono font-bold">
              {overviewStatus === 'loading' ? 'Loading live metrics…' : overviewStatus === 'ready' ? 'Live risk metrics' : 'Live metrics unavailable'}
            </div>
          </div>

          {/* Compact Map View Canvas Box */}
          <div 
            className="relative w-full rounded bg-[#e9f1eb] border border-[#dce5dd] overflow-hidden my-1 flex items-center justify-center shrink-0"
            style={{ height: '430px', minHeight: '430px' }}
          >
            {/* Aspect-ratio layer keeping pins aligned */}
            <div 
              className="gis-map-image-layer relative mx-auto" 
              style={{ width: '400px', height: '410px', maxWidth: '100%', position: 'relative' }}
            >
              <img
                src={indiaMapAsset}
                alt="Official India Map with 36 States & Territories"
                className="w-full h-full object-contain rounded filter contrast-[1.03] brightness-[0.98] pointer-events-none select-none z-0 opacity-95 block"
                style={{ width: '100%', height: '100%', display: 'block' }}
              />

              {/* Positioned Interactive State Nodes (36 States & UTs) */}
              {filteredNodes.map((node) => {
                const isSelected = selectedLiveNode.state === node.state;
                return (
                  <div
                    key={node.code}
                    onClick={() => handleNodeClick(node)}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-150 group/node ${
                      isSelected ? 'scale-125 z-40' : 'hover:scale-115 z-20'
                    }`}
                  >
                    {/* Focus Ring for Selected State */}
                    {isSelected && (
                      <span className="absolute -inset-1 rounded-full bg-[#1c2a30]/20 animate-ping pointer-events-none" />
                    )}

                    {/* State Node Circle Badge - 24px, high-contrast border and drop shadow */}
                    <div
                      className={`w-6 h-6 rounded-full ${
                        overviewStatus === 'ready' && node.hasLiveData ? getNodeBg(node.riskLevel) : 'bg-[#7b817c]'
                      } border-[1.5px] ${
                        isSelected
                          ? 'border-[#1c2a30] ring-[3px] ring-[#b24e28] ring-offset-1 ring-offset-white shadow-xl scale-110'
                          : 'border-white shadow-[0_2px_5px_rgba(0,0,0,0.35)]'
                      } flex items-center justify-center text-[9px] font-black font-editorial-mono text-white select-none`}
                    >
                      {node.code}
                    </div>

                    {/* Persistent Mini-Pill for Selected State */}
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          marginTop: '3px',
                          padding: '1px 5px',
                          backgroundColor: '#1c2a30',
                          color: '#ffffff',
                          fontSize: '8px',
                          fontWeight: 700,
                          lineHeight: '1.2',
                          borderRadius: '3px',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.35)',
                          pointerEvents: 'none',
                          zIndex: 50,
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        {node.state}
                      </div>
                    )}

                    {/* Tooltip on Hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/node:flex flex-col bg-[#fffefa] border border-[#ded7ca] text-[#263a42] text-[10px] rounded-md px-3 py-1.5 shadow-xl whitespace-nowrap z-50 pointer-events-none font-editorial-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[#1c2a30]">{node.state}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-editorial-mono font-bold ${getBadgeColor(node.riskLevel)}`}>
                          {node.riskLevel}
                        </span>
                      </div>
                      <span className="text-[9px] text-[#7b817c] font-editorial-mono mt-0.5">
                        {overviewStatus === 'ready' && node.hasLiveData
                          ? `₹${node.sanctionedCr.toFixed(2)} Cr • ${node.duplicateCandidatePairs.toLocaleString()} Duplicates`
                          : 'Live metrics unavailable'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Map Footer Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e8e0d6] pt-2 text-[10px] text-[#7b817c]">
            <div className="flex items-center gap-3 font-medium">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#b24e28]" /> Priority review</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#c07218]" /> Watch (High)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#ba6e3a]" /> Medium</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#20664e]" /> Stable</span>
            </div>
            <span className="text-[9.5px] text-[#958a7d] font-editorial-mono">Click a node to inspect state profile</span>
          </div>
        </div>

        {/* Selected State GIS Intelligence Panel */}
        <div className="lg:col-span-5 xl:col-span-4 bg-[#fffefa] border border-[#ded7ca] rounded-md p-5 flex flex-col justify-between shadow-xs">
          <div className="space-y-3.5">
            {/* Header: Eyebrow + State Name + Risk Level Badge */}
            <div className="border-b border-[#ece5db] pb-3">
              <div className="flex items-center justify-between">
                <span className="text-[8.5px] font-editorial-mono font-bold uppercase tracking-[0.1em] text-[#8e8275]">
                  State Focus · Region Context
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-editorial-mono font-bold flex items-center gap-1 ${getBadgeColor(selectedLiveNode.riskLevel)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${getNodeBg(selectedLiveNode.riskLevel)}`} />
                  <span>
                    {overviewStatus === 'loading'
                      ? 'LOADING'
                      : overviewStatus === 'unavailable'
                        ? 'UNAVAILABLE'
                        : selectedLiveNode.hasLiveData
                          ? `${selectedLiveNode.riskLevel} ATTENTION`
                          : 'NO DATA'}
                  </span>
                </span>
              </div>
              <h4 className="font-editorial-serif text-[21px] font-semibold text-[#1c2a30] flex items-center gap-2 mt-1 m-0">
                <MapPin className="w-4 h-4 text-[#b24e28] shrink-0" />
                <span>{selectedLiveNode.state}</span>
              </h4>
            </div>

            {/* Region Key Financial & Quality Metrics (2 Tiles) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-[#fbfaf6] p-3 rounded border border-[#e8e1d5]">
                <span className="text-[8.5px] font-editorial-mono font-bold text-[#8e8275] uppercase tracking-wider block">
                  Sanctioned Budget
                </span>
                <span className="text-[16px] font-bold text-[#1c2a30] font-editorial-mono mt-1 block">
                  {overviewStatus === 'ready' && selectedLiveNode.hasLiveData
                    ? `₹${selectedLiveNode.sanctionedCr.toFixed(2)} Cr`
                    : '—'}
                </span>
                <span className="text-[9px] text-[#7b817c] font-editorial-sans mt-0.5 block">
                  {selectedLiveNode.totalWorks > 0
                    ? `${selectedLiveNode.totalWorks.toLocaleString()} total works recorded`
                    : 'Portfolio allocation'}
                </span>
              </div>

              <div className="bg-[#fbfaf6] p-3 rounded border border-[#e8e1d5]">
                <span className="text-[8.5px] font-editorial-mono font-bold text-[#8e8275] uppercase tracking-wider block">
                  Duplicate Work-Pairs
                </span>
                <span className="text-[16px] font-bold text-[#b24e28] font-editorial-mono mt-1 block">
                  {overviewStatus === 'ready' && selectedLiveNode.hasLiveData
                    ? selectedLiveNode.duplicateCandidatePairs.toLocaleString()
                    : '—'}
                </span>
                <span className="text-[9px] text-[#7b817c] font-editorial-sans mt-0.5 block">
                  Similarity candidates flagged
                </span>
              </div>
            </div>

            {/* Dominant Risk Signal Editorial Callout */}
            <div
              style={{
                backgroundColor: '#faf6ed',
                borderLeft: '4px solid #b24e28',
                borderTop: '1px solid #eddccb',
                borderRight: '1px solid #eddccb',
                borderBottom: '1px solid #eddccb',
                padding: '10px 12px',
                borderRadius: '0 6px 6px 0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#1c2a30', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle style={{ width: '14px', height: '14px', color: '#b24e28' }} />
                  <span>Dominant Risk Engine</span>
                </span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: '#b24e28', fontSize: '10.5px' }}>
                  {stateRiskSummary === null
                    ? 'Loading…'
                    : stateRiskSummary.dominant_signal
                      ? `${stateRiskSummary.dominant_signal.label} (${stateRiskSummary.dominant_signal.average_score.toFixed(1)}/100)`
                      : 'No live data'}
                </span>
              </div>
              <p style={{ fontSize: '10px', color: '#635b52', lineHeight: '1.5', marginTop: '6px', margin: '6px 0 0' }}>
                {stateRiskSummary === null
                  ? `Compiling four-engine risk indicators for ${selectedLiveNode.state}…`
                  : stateRiskSummary.dominant_signal
                    ? `${stateRiskSummary.dominant_signal.label} represents the primary audit pressure across ${stateRiskSummary.total_works.toLocaleString()} works, with ${stateRiskSummary.dominant_signal.flagged_works.toLocaleString()} works requiring review.`
                    : `No analyzed risk records are currently logged for ${selectedLiveNode.state}.`}
              </p>
            </div>

            {/* 4-Engine Risk Indicator Bars */}
            {stateRiskSummary && stateRiskSummary.signals && stateRiskSummary.signals.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-[#ece5db]">
                <span className="text-[9px] font-editorial-mono font-bold uppercase text-[#8e8275] tracking-wider block">
                  Four-Engine Risk Breakdown
                </span>
                <div className="space-y-2">
                  {stateRiskSummary.signals.map((signal) => {
                    const score = signal.average_score;
                    const barFillColor =
                      signal.key === 'compliance'
                        ? '#b24e28'
                        : signal.key === 'schedule'
                          ? '#c07218'
                          : signal.key === 'duplicate'
                            ? '#ba6e3a'
                            : '#20664e';
                    return (
                      <div key={signal.key} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[9.5px]">
                          <span className="text-[#364b53] font-medium font-editorial-sans">
                            {signal.label}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[8.5px] text-[#8e8275] font-editorial-mono">
                              {signal.flagged_works.toLocaleString()} flagged
                            </span>
                            <span className="font-bold font-editorial-mono text-[#1c2a30]">
                              {score.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: '6px',
                            borderRadius: '9999px',
                            backgroundColor: '#e8e2d8',
                            overflow: 'hidden',
                            marginTop: '2px',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              borderRadius: '9999px',
                              width: `${Math.min(100, Math.max(5, score))}%`,
                              backgroundColor: barFillColor,
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* State Center Coordinates */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: '#fbfaf6',
                border: '1px solid #e8e1d5',
                borderRadius: '6px',
                fontSize: '10px',
                fontFamily: "'DM Mono', monospace",
                color: '#7b817c',
              }}
            >
              <span>State Centre:</span>
              <span style={{ color: '#1c2a30', fontWeight: 700 }}>
                {selectedLiveNode.lat.toFixed(4)}° N, {selectedLiveNode.lng.toFixed(4)}° E
              </span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => onNavigateToRiskMonitor?.(selectedLiveNode.riskLevel)}
            style={{
              width: '100%',
              marginTop: '12px',
              padding: '10px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#b24e28',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(178, 78, 40, 0.25)',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#993d1d')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#b24e28')}
          >
            <span>Inspect Audit Cases for {selectedLiveNode.state}</span>
            <ArrowRight style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      </div>
    </div>
  );
};
export default IndiaGisHeatmap;

