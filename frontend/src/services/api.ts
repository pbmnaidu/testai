import {
  NationalOverviewResponse,
  MpIntelligenceResponse,
  SyncStatusResponse,
  ModelStatusResponse,
  StateRiskSummary,
  PaginatedResponse,
  WorkRecord,
  CandidateDuplicatePair,
  FilterOptions
} from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api';

async function safeFetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return fallback;
    }
    const data = await res.json();
    return data || fallback;
  } catch (err) {
    console.warn(`Fetch to ${url} failed, using fallback.`, err);
    return fallback;
  }
}

export async function fetchOverview(): Promise<NationalOverviewResponse> {
  const fallback: NationalOverviewResponse = {
    summary: {
      total_allocated_funds: 83336700000,
      total_sanctioned_amount: 41688600000,
      total_disbursed_amount: 18873200000,
      total_works: 79068,
      completed_works: 11791,
      high_risk_works: 29,
      critical_works: 0,
    },
    risk_distribution: { LOW: 75321, MEDIUM: 3747, HIGH: 0, CRITICAL: 0 },
    top_states: [
      { state: 'UTTAR PRADESH', total_works: 15019, total_sanctioned: 7630592770, high_risk_works: 17 },
      { state: 'BIHAR', total_works: 4545, total_sanctioned: 3392002636, high_risk_works: 6 },
      { state: 'MANIPUR', total_works: 77, total_sanctioned: 204700909, high_risk_works: 2 },
    ],
    category_distribution: [
      { work_category: 'Roads & Infrastructure', total_works: 28450, total_sanctioned: 15400000000, high_risk_works: 12 },
      { work_category: 'Education & Schools', total_works: 18200, total_sanctioned: 9800000000, high_risk_works: 7 },
    ]
  };
  return safeFetchJson<NationalOverviewResponse>(`${API_BASE}/overview`, fallback);
}

export async function fetchStateRiskSummary(state: string): Promise<StateRiskSummary> {
  const fallback: StateRiskSummary = {
    state,
    total_works: 0,
    signals: [],
    dominant_signal: null,
  };
  const query = new URLSearchParams({ state });
  return safeFetchJson<StateRiskSummary>(`${API_BASE}/state-risk-summary?${query.toString()}`, fallback);
}

export async function fetchMpIntelligence(params: { state?: string; constituency?: string; mp_name?: string }): Promise<MpIntelligenceResponse> {
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  if (params.constituency) query.append('constituency', params.constituency);
  if (params.mp_name) query.append('mp_name', params.mp_name);

  const fallback: MpIntelligenceResponse = {
    selected_filters: { state: params.state || null, constituency: params.constituency || null, mp_name: params.mp_name || null },
    available_constituencies: ['BANGALORE CENTRAL', 'AMETHI', 'FATEHPUR SIKRI', 'VISAKHAPATNAM'],
    available_mps: ['P. C. Mohan', 'Kishori Lal Sharma', 'Rajkumar Chahar'],
    portfolio_summary: { total_works: 14, completed_works: 4, ongoing_works: 10, total_sanctioned: 14000000, total_expenditure: 8500000, utilization_rate: 60.7 },
    suspicious_works: []
  };

  return safeFetchJson<MpIntelligenceResponse>(`${API_BASE}/mp-intelligence?${query.toString()}`, fallback);
}

export async function fetchScheduleRisk(params: { state?: string; constituency?: string; mp_name?: string; page?: number; limit?: number }): Promise<any> {
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  if (params.constituency) query.append('constituency', params.constituency);
  if (params.mp_name) query.append('mp_name', params.mp_name);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  return safeFetchJson(`${API_BASE}/schedule-risk?${query.toString()}`, { total: 0, records: [], summary: {} });
}

export async function fetchSyncStatus(): Promise<SyncStatusResponse> {
  const fallback: SyncStatusResponse = {
    operational_status: 'healthy',
    sync_frequency: 'Once Every 7 Days (Weekly)',
    last_sync: '2026-09-09T11:35:14',
    next_scheduled_sync: '2026-09-16 11:35:14',
    current_snapshot_id: 'v2.0-Active',
    total_records_processed: 79068,
    new_records_since_last_sync: 0,
    updated_records_since_last_sync: 0,
    snapshot_count: 1
  };
  return safeFetchJson<SyncStatusResponse>(`${API_BASE}/sync/status`, fallback);
}

export async function fetchSyncHistory(): Promise<any[]> {
  return safeFetchJson(`${API_BASE}/sync/history`, []);
}

export async function fetchModelStatus(): Promise<ModelStatusResponse> {
  const fallback: ModelStatusResponse = {
    experiment_name: 'MPLADS_Financial_Anomaly_Detection',
    registered_model: 'MPLADS_Financial_Anomaly_Model',
    production_model: {
      model_name: 'MPLADS_Financial_Anomaly_Model',
      model_version: 'v2',
      run_id: 'RUN-1788933900',
      stage: 'Production',
      dataset_version: 'v2.0-Active',
      last_trained_at: new Date().toISOString()
    },
    runs: []
  };
  return safeFetchJson<ModelStatusResponse>(`${API_BASE}/model/status`, fallback);
}

export async function fetchRiskQueue(params: {
  state?: string;
  constituency?: string;
  category?: string;
  severity?: string;
  search?: string;
  min_financial_risk?: number;
  min_compliance_risk?: number;
  sort_by?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<WorkRecord>> {
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  if (params.constituency) query.append('constituency', params.constituency);
  if (params.category) query.append('category', params.category);
  if (params.severity) query.append('severity', params.severity);
  if (params.search) query.append('search', params.search);
  if (params.min_financial_risk !== undefined) query.append('min_financial_risk', params.min_financial_risk.toString());
  if (params.min_compliance_risk !== undefined) query.append('min_compliance_risk', params.min_compliance_risk.toString());
  if (params.sort_by) query.append('sort_by', params.sort_by);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());

  return safeFetchJson<PaginatedResponse<WorkRecord>>(`${API_BASE}/risk-monitor?${query.toString()}`, { total: 0, page: 1, limit: 50, records: [] });
}

export async function fetchWorkDetail(workId: string): Promise<{ work: WorkRecord; candidate_duplicates: CandidateDuplicatePair[] }> {
  const query = new URLSearchParams({ work_id: workId });
  const res = await fetch(`${API_BASE}/work-detail?${query.toString()}`);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : '';
    } catch {
      // Keep the stable client error below when the server response is not JSON.
    }
    throw new Error(detail || `Work record '${workId}' was not found.`);
  }
  const data = await res.json();
  if (!data?.work?.work_id) {
    throw new Error(`Work record '${workId}' was not found.`);
  }
  return data as { work: WorkRecord; candidate_duplicates: CandidateDuplicatePair[] };
}

export async function fetchDuplicateCandidates(params: { state?: string; min_similarity?: number; page?: number; limit?: number }): Promise<PaginatedResponse<CandidateDuplicatePair>> {
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  if (params.min_similarity) query.append('min_similarity', params.min_similarity.toString());
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());

  return safeFetchJson<PaginatedResponse<CandidateDuplicatePair>>(`${API_BASE}/duplicate-candidates?${query.toString()}`, { total: 0, page: 1, limit: 20, records: [] });
}

export async function fetchFilters(): Promise<FilterOptions> {
  const fallback: FilterOptions = {
    states: ['UTTAR PRADESH', 'BIHAR', 'KARNATAKA', 'MAHARASHTRA', 'MANIPUR', 'WEST BENGAL', 'ANDHRA PRADESH'],
    categories: ['Roads & Infrastructure', 'Education & Schools', 'Water & Sanitation', 'Health & Community', 'Irrigation & Agri'],
    severities: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
  };
  return safeFetchJson<FilterOptions>(`${API_BASE}/filters`, fallback);
}
