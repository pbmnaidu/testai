import React, { useEffect, useState } from 'react';
import { MapPin, AlertTriangle, Navigation, Layers, Info } from 'lucide-react';
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
  // Northern Region
  { state: 'Ladakh', code: 'LA', lat: 34.1526, lng: 77.5771, x: 35.5, y: 10 },
  { state: 'Jammu & Kashmir', code: 'JK', lat: 33.7782, lng: 76.5762, x: 28.5, y: 14 },
  { state: 'Himachal Pradesh', code: 'HP', lat: 31.1048, lng: 77.1734, x: 33, y: 19 },
  { state: 'Punjab', code: 'PB', lat: 31.1471, lng: 75.3412, x: 28, y: 22 },
  { state: 'Chandigarh', code: 'CH', lat: 30.7333, lng: 76.7794, x: 31, y: 22 },
  { state: 'Haryana', code: 'HR', lat: 29.0588, lng: 76.0856, x: 30, y: 26 },
  { state: 'Uttarakhand', code: 'UK', lat: 30.0668, lng: 79.0193, x: 37, y: 23 },
  { state: 'Delhi', code: 'DL', lat: 28.7041, lng: 77.1025, x: 33.8, y: 28.5 },
  
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

export const IndiaGisHeatmap: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<StateGisData>(STATE_GIS_NODES[9]); // UP default
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

  const filteredNodes = liveNodes.filter((n) => {
    if (overviewStatus !== 'ready') return filterLevel === 'ALL';
    if (filterLevel === 'ALL') return true;
    return n.riskLevel === filterLevel;
  });

  const getBadgeColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'gis-risk-badge gis-risk-badge--critical bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-rose-500/20';
      case 'HIGH':
        return 'gis-risk-badge gis-risk-badge--high bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-500/20';
      case 'MEDIUM':
        return 'gis-risk-badge gis-risk-badge--medium bg-orange-500/20 text-orange-400 border-orange-500/40';
      default:
        return 'gis-risk-badge gis-risk-badge--low bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    }
  };

  const getNodeBg = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-rose-500 shadow-rose-500/50';
      case 'HIGH':
        return 'bg-amber-500 shadow-amber-500/50';
      case 'MEDIUM':
        return 'bg-orange-500 shadow-orange-500/50';
      default:
        return 'bg-emerald-500 shadow-emerald-500/50';
    }
  };

  const getSignalTone = (key: string) => {
    switch (key) {
      case 'financial':
        return 'text-indigo-400';
      case 'compliance':
        return 'text-rose-400';
      case 'duplicate':
        return 'text-amber-400';
      default:
        return 'text-sky-400';
    }
  };

  return (
    <div className="card-panel p-6 space-y-4">
      {/* Header Bar */}
      <div className="gis-map-header flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-indigo-400 animate-pulse" />
            <span>Geospatial Risk Heatmap & Spatial Context</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">
            Live state-level risk and duplicate-candidate metrics across 36 States & UTs. Exact &lt;200m clustering requires latitude/longitude fields in the source records.
          </p>
        </div>

        {/* Risk Level Filter Toggle */}
        <div className="gis-map-filter flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all ${
                filterLevel === lvl
                  ? 'bg-slate-100 text-slate-900 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Main Map Container Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interactive Visual Map Box */}
        <div className="gis-map-panel lg:col-span-2 bg-slate-950/95 rounded-2xl border border-slate-800 p-4 space-y-2 flex flex-col justify-between overflow-hidden shadow-inner">
          
          {/* Map Sub-Header Bar */}
          <div className="flex justify-between items-center z-10">
            <div className="gis-map-header-chip flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 shadow-md">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>India State-Centre View (36 States & UTs)</span>
            </div>

            <div className="gis-map-live-chip text-[10px] text-slate-400 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800 font-mono shadow-md">
              {overviewStatus === 'loading' ? 'Loading live metrics…' : overviewStatus === 'ready' ? 'Live risk metrics' : 'Live metrics unavailable'}
            </div>
          </div>

          {/* Compact Map View Canvas Box (Height reduced to 390px) */}
          <div className="gis-map-canvas relative w-full h-[390px] rounded-xl bg-slate-950 border border-slate-800/80 overflow-hidden my-1 flex items-center justify-center">
            {/* Grid pattern backdrop */}
            <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] opacity-20 pointer-events-none" />

            {/* Keep the image and nodes in the same aspect-ratio layer. This
                prevents object-contain letterboxing from shifting points away
                from their corresponding state locations. */}
            <div className="gis-map-image-layer relative h-full max-w-full mx-auto">
              <img
                src={indiaMapAsset}
                alt="Official India Map with 36 States & Territories"
                className="absolute inset-0 w-full h-full object-contain rounded-xl filter contrast-[1.05] brightness-[0.95] drop-shadow-[0_0_20px_rgba(99,102,241,0.3)] pointer-events-none select-none z-0"
              />

              {/* Positioned Interactive State Nodes (36 States & UTs) */}
              {filteredNodes.map((node) => {
                const isSelected = selectedLiveNode.state === node.state;
                return (
                  <div
                    key={node.code}
                    onClick={() => setSelectedNode(node)}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-200 group/node ${
                      isSelected ? 'scale-125 z-30' : 'hover:scale-110 z-20'
                    }`}
                  >
                    {/* Pulse Effect for Critical States */}
                    {overviewStatus === 'ready' && node.hasLiveData && node.riskLevel === 'CRITICAL' && (
                      <span className="absolute -inset-1.5 rounded-full bg-rose-500/50 animate-ping" />
                    )}

                    {/* Compact State Node Circle Badge (w-6 h-6) */}
                    <div
                      className={`gis-node-badge w-6 h-6 rounded-full ${overviewStatus === 'ready' && node.hasLiveData ? getNodeBg(node.riskLevel) : 'bg-slate-500'} border-[1.5px] border-slate-950 flex items-center justify-center text-[9px] font-black text-slate-950 shadow-xl ${
                        isSelected ? 'ring-2 ring-indigo-400 scale-110' : ''
                      }`}
                    >
                      {node.code}
                    </div>

                    {/* Tooltip on Hover */}
                    <div className="gis-map-tooltip absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/node:flex flex-col bg-slate-900/95 border border-slate-700 text-slate-100 text-[10px] rounded-xl px-2.5 py-1 shadow-2xl whitespace-nowrap z-40 pointer-events-none">
                      <span className="font-extrabold">{node.state}</span>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {overviewStatus === 'ready' && node.hasLiveData ? `₹${node.sanctionedCr.toFixed(2)} Cr • ${node.duplicateCandidatePairs.toLocaleString()} Duplicate Pairs` : 'Live metrics unavailable'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Map Footer Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-2.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-4 font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-rose-500/50" /> Critical</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-amber-500/50" /> High</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-orange-500/50" /> Medium</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-emerald-500/50" /> Low</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono font-medium">Click a node to inspect live state metrics</span>
          </div>
        </div>

        {/* Selected State GIS Intelligence Panel */}
        <div className="gis-selected-region-panel bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between shadow-lg">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-wider block">Selected Region</span>
                <h4 className="text-lg font-black text-slate-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-400" />
                  <span>{selectedLiveNode.state}</span>
                </h4>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${overviewStatus === 'ready' && selectedLiveNode.hasLiveData ? getBadgeColor(selectedLiveNode.riskLevel) : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                {overviewStatus === 'loading' ? 'LOADING' : overviewStatus === 'unavailable' ? 'UNAVAILABLE' : selectedLiveNode.hasLiveData ? `${selectedLiveNode.riskLevel} RISK` : 'NO DATA'}
              </span>
            </div>

            {/* Region KPI Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Sanction Volume</span>
                <span className="text-base font-black text-slate-100 font-mono">
                  {overviewStatus === 'ready' && selectedLiveNode.hasLiveData ? `₹${selectedLiveNode.sanctionedCr.toFixed(2)} Cr` : '—'}
                </span>
              </div>
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Duplicate Candidate Pairs</span>
                <span className="text-base font-black text-rose-400 font-mono">
                  {overviewStatus === 'ready' && selectedLiveNode.hasLiveData ? selectedLiveNode.duplicateCandidatePairs.toLocaleString() : '—'}
                </span>
              </div>
            </div>

            {/* Live state-level risk profile: prioritise the strongest risk
                engine instead of presenting duplicate candidates alone. */}
            <div className="gis-state-risk-detail bg-slate-800/40 p-3.5 rounded-xl border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Highest State Risk Signal</span>
                </span>
                <span className="gis-dominant-risk font-mono font-black text-amber-400">
                  {stateRiskSummary === null
                    ? 'Loading…'
                    : stateRiskSummary.dominant_signal
                      ? `${stateRiskSummary.dominant_signal.label} ${stateRiskSummary.dominant_signal.average_score.toFixed(1)}/100`
                      : 'No live data'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                {stateRiskSummary === null
                  ? `Loading the four-engine risk profile for ${selectedLiveNode.state}.`
                  : stateRiskSummary.dominant_signal
                    ? `${stateRiskSummary.dominant_signal.label} is the strongest signal across ${stateRiskSummary.total_works.toLocaleString()} analysed works; ${stateRiskSummary.dominant_signal.flagged_works.toLocaleString()} works score 35 or above in this engine.`
                    : `No analysed work records are available for ${selectedLiveNode.state}.`}
              </p>
              {stateRiskSummary && stateRiskSummary.signals.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {stateRiskSummary.signals.map((signal) => (
                    <div key={signal.key} className="gis-risk-signal-card bg-slate-900/60 border border-slate-800/80 rounded-lg px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-slate-400">{signal.label}</span>
                        <span className={`text-[11px] font-black font-mono ${getSignalTone(signal.key)}`}>
                          {signal.average_score.toFixed(1)}
                        </span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-medium">{signal.flagged_works.toLocaleString()} works ≥35</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lat/Lng Coordinates */}
            <div className="gis-coordinates text-[11px] font-mono text-slate-500 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 flex items-center justify-between">
              <span>Representative State Centre:</span>
              <span className="text-slate-300 font-bold">{selectedLiveNode.lat.toFixed(4)}° N, {selectedLiveNode.lng.toFixed(4)}° E</span>
            </div>
          </div>

          <div className="pt-2">
            <div className="gis-map-info p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-[11px] text-indigo-300 font-medium flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>State-centre positions are reference geometry; risk and duplicate-pair values come from the live MPLADS feature store. Exact spatial proximity is unavailable until source coordinates are provided.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
