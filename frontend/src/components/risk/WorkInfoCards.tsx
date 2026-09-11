import React from 'react';
import { CalendarDays, CreditCard, Layers3, MapPinned } from 'lucide-react';
import { WorkRecord } from '../../types';

const money = (value?: number) => `₹${(Number(value || 0) / 100000).toFixed(2)} Lakh`;
const valueOrDash = (value?: string | number) => value === undefined || value === null || value === '' ? '—' : String(value);
const percentage = (value?: number) => value === undefined || value === null || Number.isNaN(value) ? '—' : `${(Number(value) <= 1 ? Number(value) * 100 : Number(value)).toFixed(1)}%`;

interface Props { work: WorkRecord; }

export const WorkInfoCards: React.FC<Props> = ({ work }) => {
  const trips = work.expenditure_trips || [];
  const disbursed = trips.reduce((sum, trip) => sum + Number(trip.expenditure_amount || 0), 0) || Number(work.effective_expenditure || 0);
  const sanctioned = Number(work.sanction_amount || 0);
  const utilization = sanctioned > 0 ? (disbursed / sanctioned) * 100 : 0;
  const group = work.peer_category || work.comparison_peer_category || work.comparison_subsector || work.peer_group_level || work.effective_work_category || work.work_category || 'Unclassified';
  const state = work.state || work.State;
  const constituency = work.constituency || work.Constituency;
  const medianLabel = work.comparison_scope === 'ALL_INDIA' ? 'India peer median' : work.comparison_scope === 'STATE' ? 'State peer median' : 'Constituency peer median';

  return <div className="space-y-5">
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2"><Layers3 className="w-4 h-4 text-indigo-600" /> Work classification / group</h3>
        <dl className="mt-4 space-y-2 text-xs"><div><dt className="text-slate-500">Effective category</dt><dd className="font-bold text-slate-900 break-words">{valueOrDash(work.effective_work_category || work.work_category)}</dd></div><div><dt className="text-slate-500">Domain · main sector · subcategory</dt><dd className="font-semibold text-slate-800 break-words">{valueOrDash(work.work_domain || work.ai_work_domain)} · {valueOrDash(work.main_sector)} · {valueOrDash(work.work_subcategory)}</dd></div><div><dt className="text-slate-500">Peer group</dt><dd className="font-bold text-slate-900 break-words">{group}</dd>{work.peer_category_auto_generated && <p className="mt-1 text-[10px] font-semibold text-indigo-600">Auto-created family from unspecified category; unit-price comparison skipped.</p>}</div><div><dt className="text-slate-500">Classification confidence</dt><dd className="font-bold text-slate-900">{work.category_confidence !== undefined ? percentage(work.category_confidence) : valueOrDash(work.category_confidence_band)}</dd></div></dl>
      </section>
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2"><CreditCard className="w-4 h-4 text-emerald-600" /> Financial realization</h3>
        <dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Sanctioned amount</dt><dd className="font-black text-slate-900">{money(sanctioned)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Disbursed amount</dt><dd className="font-black text-emerald-700">{money(disbursed)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Utilization</dt><dd className="font-bold text-slate-900">{utilization.toFixed(1)}%</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">{medianLabel}</dt><dd className="font-bold text-slate-900">{money(work.historical_cost_median)}</dd></div></dl>
      </section>
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2"><MapPinned className="w-4 h-4 text-amber-600" /> Location & ownership</h3>
        <dl className="mt-4 space-y-2 text-xs"><div><dt className="text-slate-500">State · constituency</dt><dd className="font-bold text-slate-900">{valueOrDash(state)} · {valueOrDash(constituency)}</dd></div><div><dt className="text-slate-500">MP</dt><dd className="font-semibold text-slate-800 break-words">{valueOrDash(work.mp_name)}</dd></div><div><dt className="text-slate-500">Source</dt><dd className="font-semibold text-slate-800">{valueOrDash(work.category_source)}</dd></div></dl>
      </section>
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-blue-600" /> Dates & payment count</h3>
        <dl className="mt-4 space-y-2 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Payment trips</dt><dd className="font-black text-slate-900">{trips.length || valueOrDash(work.payment_count)}</dd></div><div><dt className="text-slate-500">Recommended</dt><dd className="font-semibold text-slate-800">{valueOrDash(work.recommended_date)}</dd></div><div><dt className="text-slate-500">Sanction · completion</dt><dd className="font-semibold text-slate-800">{valueOrDash(work.sanction_date)} · {valueOrDash(work.completion_date || work.estimated_completion_date)}</dd></div></dl>
      </section>
    </div>
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3"><h3 className="text-sm font-bold text-slate-900">Payment / expenditure trips</h3><span className="text-xs font-bold text-slate-500">{trips.length} recorded trip{trips.length === 1 ? '' : 's'} · {money(disbursed)} disbursed</span></div>
      {trips.length === 0 ? <p className="pt-4 text-xs text-slate-500">No row-level payment trips were returned for this work. The aggregate expenditure shown above comes from the risk master record.</p> : <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{trips.map((trip, index) => <div key={`${trip.trip_number || index}-${trip.expenditure_date}`} className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs"><div className="flex justify-between gap-2"><span className="font-black text-slate-900">Trip #{trip.trip_number || index + 1}</span><span className="font-bold text-emerald-700">{money(trip.expenditure_amount)}</span></div><p className="mt-2 text-slate-500">{valueOrDash(trip.expenditure_date)} · {valueOrDash(trip.payment_status)}</p></div>)}</div>}
    </section>
  </div>;
};
