import React, { useCallback, useEffect, useState } from 'react';
import { commitSyncDiff, fetchSyncHealth, fetchSyncHistory, fetchSyncStatus, fetchTrainingStatus, previewSyncDiff, resetSyncJob, startSync, startTraining } from '../services/api';
import { SyncPreviewResponse, SyncStatusResponse } from '../types';
import { RefreshCw, CheckCircle2, Clock, Database, GitCompare, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';

const formatSyncError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : String(error || fallback);
  if (/WinError 10061|connection refused|urlopen error/i.test(message)) {
    return 'The official MPLADS API connection was refused. Check internet access or configure MPLADS_PROXY_URL; local dataset results remain available.';
  }
  if (/previous validated dataset|previous analysis|temporarily unavailable|could not be started/i.test(message)) {
    return message;
  }
  return fallback;
};

export const DataSyncPage: React.FC = () => {
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [preview, setPreview] = useState<SyncPreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [nextStatus, nextHistory, training, nextHealth] = await Promise.all([fetchSyncStatus(), fetchSyncHistory(), fetchTrainingStatus(), fetchSyncHealth()]);
    setStatus({ ...nextStatus, training });
    setHistory(nextHistory);
    setHealth(nextHealth);
  }, []);

  useEffect(() => { refresh().catch(() => setError('Unable to read sync status.')); }, [refresh]);
  useEffect(() => {
    if (!['RUNNING', 'QUEUED'].includes(status?.training?.status || '') && !['RUNNING', 'QUEUED'].includes(status?.job?.status || '')) return;
    const timer = window.setInterval(() => refresh().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, [status?.training?.status, refresh]);

  const inspectChanges = async () => {
    setBusy(true); setError('');
    try { await startSync(); await refresh(); }
    catch (err) { setError(formatSyncError(err, 'Synchronization could not be started.')); }
    finally { setBusy(false); }
  };

  const handleReset = async () => {
    setBusy(true); setError('');
    try { await resetSyncJob(); await refresh(); }
    catch (err) { setError(formatSyncError(err, 'Failed to reset sync job.')); }
    finally { setBusy(false); }
  };

  const commitChanges = async () => {
    if (!preview) return;
    setBusy(true); setError('');
    try { await commitSyncDiff(preview.preview_token); setPreview(null); await refresh(); }
    catch (err) { setError(formatSyncError(err, 'Sync commit failed safely.')); }
    finally { setBusy(false); }
  };

  const runAnalysis = async () => {
    setTrainingBusy(true); setError('');
    try { await startTraining(); await refresh(); }
    catch (err) { setError(formatSyncError(err, 'The analysis update could not be started. The previous analysis remains available.')); }
    finally { setTrainingBusy(false); }
  };

  const training = status?.training;
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2"><RefreshCw className="w-6 h-6 text-indigo-600" /> Data Synchronization & Status</h2>
          <p className="text-xs text-slate-500 mt-1">Official MPLADS data is synchronized in the background using the configured schedule. The dashboard continues using the last validated dataset during an update.</p>
        </div>
        <div className="flex items-center gap-2">
          {['RUNNING', 'QUEUED'].includes(status?.job?.status || '') && (
            <button onClick={handleReset} disabled={busy} className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300" title="Reset stuck or running synchronization job">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Job
            </button>
          )}
          <button onClick={inspectChanges} disabled={busy || ['RUNNING', 'QUEUED'].includes(status?.job?.status || '')} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"><RefreshCw className="w-4 h-4" />{busy ? 'Starting…' : 'Sync Now'}</button>
          <button onClick={runAnalysis} disabled={trainingBusy || ['RUNNING', 'QUEUED'].includes(training?.status || '')} className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"><Database className="w-4 h-4" />{trainingBusy ? 'Starting…' : 'Run Analysis'}</button>
          {preview && <button onClick={commitChanges} disabled={busy} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"><ShieldCheck className="w-4 h-4" />Apply & Retrain</button>}
        </div>
      </div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      {status?.job && status.job.status !== 'IDLE' && <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Loader2 className={status.job.status === 'RUNNING' || status.job.status === 'QUEUED' ? 'w-4 h-4 text-indigo-600 animate-spin' : 'w-4 h-4 text-indigo-600'} />
              Dataset synchronization
            </h3>
            <p className="text-xs text-slate-500 mt-1">{status.job.message || 'Synchronization status unavailable.'}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className={`text-xs font-mono font-bold ${status.job.status === 'COMPLETED' ? 'text-emerald-700' : status.job.status === 'FAILED' ? 'text-rose-700' : 'text-indigo-700'}`}>
              {status.job.status}
            </span>
            <button
              onClick={handleReset}
              disabled={busy}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center gap-1 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              title="Reset synchronization status to IDLE"
            >
              <RotateCcw className="w-3 h-3 text-slate-500" />
              Reset
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"><div className="p-3 rounded-lg bg-slate-50 text-slate-700">Records received <b>{(status.job.counters?.records_received || 0).toLocaleString()}</b></div><div className="p-3 rounded-lg bg-slate-50 text-slate-700">Records processed <b>{(status.job.counters?.records_processed || 0).toLocaleString()}</b></div><div className="p-3 rounded-lg bg-slate-50 text-slate-700">Pages fetched <b>{(status.job.counters?.pages_fetched || 0).toLocaleString()}</b></div><div className="p-3 rounded-lg bg-slate-50 text-slate-700">API requests <b>{(status.job.counters?.api_requests || 0).toLocaleString()}</b></div></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">{(status.job.datasets || []).map((dataset) => <div key={dataset.dataset} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs"><span className="font-semibold text-slate-700">{dataset.dataset}</span><span className={dataset.status === 'COMPLETED' ? 'text-emerald-700 font-bold' : dataset.status === 'FAILED' ? 'text-rose-700 font-bold' : 'text-amber-700 font-bold'}>{dataset.status || 'PENDING'}</span></div>)}</div>
        {status.job.status === 'FAILED' && <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">The synchronization was incomplete. The previous validated dataset remains available; please try again later.{status.job.technical_error && <details className="mt-2 text-[11px]"><summary className="cursor-pointer font-bold">View technical details</summary><pre className="mt-2 whitespace-pre-wrap rounded bg-rose-100 p-2 text-rose-900">{status.job.technical_error}</pre></details>}</div>}
      </div>}
      {status && <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2"><span className="text-[11px] text-slate-500 uppercase font-bold">Operational Status</span><div className="text-lg font-black text-emerald-600 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{status.operational_status}</div><p className="text-xs text-slate-500">{status.sync_frequency}</p></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2"><span className="text-[11px] text-slate-500 uppercase font-bold">Current Snapshot</span><div className="text-lg font-black text-slate-900 font-mono">{status.current_snapshot_id}</div><p className="text-xs text-slate-500">{(status.total_records_processed || 0).toLocaleString()} records processed</p></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2"><span className="text-[11px] text-slate-500 uppercase font-bold">Latest Delta</span><div className="text-lg font-black text-indigo-600 font-mono">+{status.new_records_since_last_sync} / {status.updated_records_since_last_sync}</div><p className="text-xs text-slate-500">NEW / MODIFIED • {status.removed_records_since_last_sync || 0} removed</p><p className="text-[10px] text-slate-400 uppercase">{status.data_origin === 'local_dataset_files' ? 'Local dataset pipeline' : 'Official API sync'}</p></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 min-w-0"><span className="text-[11px] text-slate-500 uppercase font-bold">Next Automatic Sync</span><div className="text-xs font-bold text-slate-900 font-mono flex items-start gap-1.5 pt-1 min-w-0"><Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" /><span className="break-words">{status.next_scheduled_sync || 'Pending first successful sync'}</span></div><p className="text-[11px] leading-5 text-slate-600 break-all min-w-0"><a href={status.source_url || 'https://mplads.mospi.gov.in'} target="_blank" rel="noreferrer" className="text-indigo-700 hover:text-indigo-900 hover:underline">{status.source_url || 'Official MOSPI endpoint'}</a></p></div>
      </div>}
      {health && <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">Official source health</h3><p className="text-xs text-slate-500 mt-1">Credential-free request telemetry from the synchronization service.</p></div><span className={`text-xs font-bold uppercase ${health.status === 'available' ? 'text-emerald-700' : health.status === 'degraded' ? 'text-amber-700' : 'text-slate-500'}`}>{health.status}</span></div><div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-xs"><div className="rounded-lg bg-slate-50 p-3"><span className="block text-slate-500">Requests</span><b>{Number(health.request_count || 0).toLocaleString()}</b></div><div className="rounded-lg bg-slate-50 p-3"><span className="block text-slate-500">Errors</span><b>{Number(health.error_count || 0).toLocaleString()}</b></div><div className="rounded-lg bg-slate-50 p-3"><span className="block text-slate-500">Error rate</span><b>{(Number(health.error_rate || 0) * 100).toFixed(1)}%</b></div><div className="rounded-lg bg-slate-50 p-3"><span className="block text-slate-500">Avg response</span><b>{health.response_time_ms == null ? '—' : `${health.response_time_ms} ms`}</b></div><div className="rounded-lg bg-slate-50 p-3"><span className="block text-slate-500">Last successful request</span><b className="font-mono text-[10px]">{health.last_successful_request || '—'}</b></div></div></div>}
      {training && <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Database className="w-4 h-4 text-indigo-600" />Background model retraining</h3><span className="text-xs font-mono font-bold text-indigo-700">{training.status} {training.progress ?? 0}%</span></div><div className="h-2 mt-4 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${training.progress ?? 0}%` }} /></div><p className="text-xs text-slate-500 mt-2">{training.message}</p></div>}
      {preview && <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-sm space-y-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">Record-level change review</h3><span className="text-xs text-slate-500">Token {preview.preview_token.slice(0, 10)}…</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs"><div className="p-3 rounded-lg bg-emerald-50 text-emerald-700">NEW <b>{preview.diff.new_count}</b></div><div className="p-3 rounded-lg bg-amber-50 text-amber-700">MODIFIED <b>{preview.diff.updated_count}</b></div><div className="p-3 rounded-lg bg-red-50 text-red-700">REMOVED <b>{preview.diff.removed_count}</b></div><div className="p-3 rounded-lg bg-slate-50 text-slate-700">UNCHANGED <b>{preview.diff.unchanged_count}</b></div></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-2">Change</th><th className="py-2">Table</th><th className="py-2">Composite key</th><th className="py-2">Old → New</th></tr></thead><tbody>{preview.review.records.map((item: any, index: number) => <tr key={index} className="border-b border-slate-100"><td className="py-2 font-bold">{item.change_type}</td><td className="py-2">{item.table}</td><td className="py-2 font-mono">{item.composite_key}</td><td className="py-2 text-slate-500">{item.old?.description || item.old?.sanction_amount || '—'} → {item.new?.description || item.new?.sanction_amount || '—'}</td></tr>)}</tbody></table></div></div>}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm"><h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Synchronization history</h3>{history.length === 0 ? <div className="p-4 text-xs text-slate-500">No sync execution logs recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="bg-slate-50 border-b text-slate-500 uppercase text-[10px] font-bold"><th className="py-3 px-4">Sync ID</th><th className="py-3 px-4">Timestamp</th><th className="py-3 px-4">Snapshot</th><th className="py-3 px-4 text-right">NEW</th><th className="py-3 px-4 text-right">MODIFIED</th><th className="py-3 px-4 text-center">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{history.map((item, index) => <tr key={index}><td className="py-3 px-4 font-mono font-bold">{item.sync_id}</td><td className="py-3 px-4 font-mono">{item.timestamp}</td><td className="py-3 px-4 font-mono">{item.snapshot_id || '—'}</td><td className="py-3 px-4 text-right font-mono text-emerald-700">{item.new_records_count || 0}</td><td className="py-3 px-4 text-right font-mono text-amber-700">{item.updated_records_count || 0}</td><td className="py-3 px-4 text-center"><span className="px-3 py-1 rounded-full bg-slate-100 font-mono text-[10px] font-bold">{item.status}</span></td></tr>)}</tbody></table></div>}</div>
    </div>
  );
};
