import React, { useState, useEffect } from 'react';
import { fetchSyncStatus, fetchSyncHistory } from '../services/api';
import { SyncStatusResponse } from '../types';
import { RefreshCw, CheckCircle2, Clock, Database, Calendar } from 'lucide-react';

export const DataSyncPage: React.FC = () => {
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    Promise.all([fetchSyncStatus(), fetchSyncHistory()]).then(([st, hist]) => {
      setStatus(st);
      setHistory(hist);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-slate-900" /> Weekly Automated Dataset Synchronization & Snapshot Status
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Demonstrates periodic dataset synchronization, SHA-256 snapshot hashing, and change detection (NEW vs UPDATED records).
        </p>
      </div>

      {loading || !status ? (
        <div className="p-12 text-center text-xs text-slate-500 font-medium">Loading Sync Engine Status...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Operational Status</span>
              <div className="text-lg font-black text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Operational
              </div>
              <p className="text-xs text-slate-500 font-medium">Weekly Schedule Active</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Current Snapshot ID</span>
              <div className="text-lg font-black text-slate-900 font-mono tracking-tight">{status.current_snapshot_id}</div>
              <p className="text-xs text-slate-500 font-medium">{status.total_records_processed.toLocaleString()} Records Active</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">NEW Records (Last Sync)</span>
              <div className="text-lg font-black text-indigo-600 font-mono tracking-tight">{status.new_records_since_last_sync}</div>
              <p className="text-xs text-slate-500 font-medium">Incremental Additions</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-2 shadow-sm">
              <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Next Scheduled Sync</span>
              <div className="text-xs font-bold text-slate-900 font-mono flex items-center gap-1.5 pt-1">
                <Clock className="w-3.5 h-3.5 text-amber-600" /> {status.next_scheduled_sync}
              </div>
              <p className="text-xs text-slate-500 font-medium">Weekly Frequency (7 Days)</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
              Synchronization Job History Log
            </h3>

            {history.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 font-medium">No sync execution logs recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/80 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                      <th className="py-3 px-4">Sync ID</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Snapshot ID</th>
                      <th className="py-3 px-4 text-right">Total Records</th>
                      <th className="py-3 px-4 text-right">NEW Records</th>
                      <th className="py-3 px-4 text-right">UPDATED Records</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {history.map((h, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{h.sync_id}</td>
                        <td className="py-3 px-4 font-mono text-slate-600 font-medium">{h.timestamp}</td>
                        <td className="py-3 px-4 font-mono text-slate-600 font-medium">{h.snapshot_id}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-900 font-bold">{h.total_records?.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 font-bold">{h.new_records_count}</td>
                        <td className="py-3 px-4 text-right font-mono text-amber-600 font-bold">{h.updated_records_count}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full font-mono text-[10px] font-bold">
                            {h.status}
                          </span>
                        </td>
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
