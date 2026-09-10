import React, { useState, useEffect } from 'react';
import { fetchModelStatus } from '../services/api';
import { ModelStatusResponse } from '../types';
import { Cpu, CheckCircle2, Layers, GitBranch, Terminal } from 'lucide-react';

export const ModelMonitoringPage: React.FC = () => {
  const [modelData, setModelData] = useState<ModelStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchModelStatus().then((res) => {
      setModelData(res);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Cpu className="w-6 h-6 text-slate-900" /> ML Machine Learning Experiment & Model Registry Monitor
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Manages model experiment runs, hyperparameter tracking, model artifacts, versioning, and identifies the active production Isolation Forest model.
        </p>
      </div>

      {loading || !modelData ? (
        <div className="p-12 text-center text-xs text-slate-500 font-medium">Loading ML Model Registry...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Registered Model Name</span>
              <div className="text-sm font-black text-slate-900 font-mono truncate">{modelData.registered_model}</div>
              <p className="text-xs text-slate-500 font-medium">ML Model Registry</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Production Model Version</span>
              <div className="text-lg font-black text-emerald-600 font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> {modelData.production_model.model_version} (Stage: {modelData.production_model.stage})
              </div>
              <p className="text-xs text-slate-500 font-medium">Inference Engine Model</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Feature Set Version</span>
              <div className="text-sm font-black text-slate-900 font-mono">financial_features_v2</div>
              <p className="text-xs text-slate-500 font-medium">11 Engineered Signals</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">ML Algorithm</span>
              <div className="text-sm font-black text-amber-600 font-mono">Isolation Forest (Unsupervised)</div>
              <p className="text-xs text-slate-500 font-medium">n_estimators=100, contam=0.05</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              ML Experiment Run Registry Log
            </h3>

            {modelData.runs.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 font-medium">No model runs recorded in registry log.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                      <th className="py-3 px-4">Run ID</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Version & Stage</th>
                      <th className="py-3 px-4">Dataset Version</th>
                      <th className="py-3 px-4 text-right">Parameters</th>
                      <th className="py-3 px-4 text-right">Anomalies Detected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {modelData.runs.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.run_id}</td>
                        <td className="py-3 px-4 font-mono text-slate-600 font-medium">{r.timestamp}</td>
                        <td className="py-3 px-4 font-mono text-emerald-700 font-bold">{r.version} ({r.stage})</td>
                        <td className="py-3 px-4 font-mono text-slate-600 font-medium">{r.dataset_version}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500 font-medium">estimators={r.parameters?.n_estimators}, contam={r.parameters?.contamination}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-600">{r.metrics?.number_of_anomalies} ({r.metrics?.anomaly_percentage}%)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
