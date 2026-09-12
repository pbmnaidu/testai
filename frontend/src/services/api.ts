import {
  NationalOverviewResponse,
  MpIntelligenceResponse,
  SyncStatusResponse,
  ModelStatusResponse,
  StateRiskSummary,
  PaginatedResponse,
  WorkRecord,
  CandidateDuplicatePair,
  DuplicateCluster,
  ConstituencyComplianceRecord,
  FinancialBenchmarkResponse,
  FilterOptions,
  SyncPreviewResponse
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
      total_allocated_funds: 0,
      total_sanctioned_amount: 0,
      total_disbursed_amount: 0,
      total_works: 0,
      completed_works: 0,
      high_risk_works: 0,
      critical_works: 0,
      overdue_works: 0,
    },
    risk_distribution: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    top_states: [],
    state_metrics: [],
    category_distribution: [],
    financial_summary: { flagged_financial_outliers: 0, historical_comparison_available: 0, unit_price_comparisons: 0 },
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
    available_constituencies: [],
    available_mps: [],
    portfolio_summary: { total_works: 0, completed_works: 0, ongoing_works: 0, total_sanctioned: 0, total_expenditure: 0, utilization_rate: 0 },
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
    operational_status: 'unavailable',
    sync_frequency: '',
    last_sync: '',
    next_scheduled_sync: '',
    current_snapshot_id: 'NONE',
    total_records_processed: 0,
    new_records_since_last_sync: 0,
    updated_records_since_last_sync: 0,
    snapshot_count: 0,
    job: { status: 'IDLE', message: 'No synchronization job is running.', datasets: [], counters: {} }
  };
  return safeFetchJson<SyncStatusResponse>(`${API_BASE}/sync/status`, fallback);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.detail || `Request failed (${response.status})`);
  return payload as T;
}

export async function startSync(): Promise<SyncStatusResponse['job']> {
  return postJson<SyncStatusResponse['job']>(API_BASE + '/sync/start', {});
}

export async function fetchAnalyticsStates(): Promise<any> {
  return safeFetchJson(API_BASE + '/analytics/states', { metadata: undefined, states: [], methodology: {} });
}

export async function fetchHighestRiskWorksByState(state: string, limit = 10): Promise<any> {
  const query = new URLSearchParams({ limit: String(limit) });
  return safeFetchJson(API_BASE + '/analytics/states/' + encodeURIComponent(state) + '/highest-risk?' + query.toString(), {
    state,
    total_works: 0,
    records: [],
    metadata: undefined,
  });
}

export async function previewSyncDiff(filters: { state?: string; constituency?: string; work_ids?: string[]; page?: number; limit?: number } = {}): Promise<SyncPreviewResponse> {
  return postJson<SyncPreviewResponse>(`${API_BASE}/sync/preview-diff`, filters);
}

export async function commitSyncDiff(preview_token: string): Promise<any> {
  return postJson(`${API_BASE}/sync/commit-diff`, { preview_token });
}

export async function fetchTrainingStatus(): Promise<any> {
  return safeFetchJson(`${API_BASE}/sync/training-status`, { status: 'UNKNOWN', progress: 0, message: 'Training status unavailable.' });
}

export async function startTraining(): Promise<any> {
  return postJson(`${API_BASE}/sync/training/start`, {});
}

export async function fetchSyncHealth(): Promise<any> {
  return safeFetchJson(`${API_BASE}/sync/health`, {
    source_url: '', status: 'unknown', last_successful_request: null, last_failure: null,
    response_time_ms: null, records_fetched: 0, request_count: 0, error_count: 0, error_rate: 0,
  });
}

export async function fetchSyncHistory(): Promise<any[]> {
  return safeFetchJson(`${API_BASE}/sync/history`, []);
}

export async function fetchModelStatus(): Promise<ModelStatusResponse> {
  const fallback: ModelStatusResponse = {
    experiment_name: '',
    registered_model: '',
    production_model: {
      model_name: '',
      model_version: '',
      run_id: '',
      stage: 'UNAVAILABLE',
      dataset_version: '',
      last_trained_at: ''
    },
    runs: []
  };
  return safeFetchJson<ModelStatusResponse>(`${API_BASE}/model/status`, fallback);
}

export async function fetchRiskQueue(params: {
  state?: string;
  constituency?: string;
  work_status?: string;
  category?: string;
  severity?: string;
  search?: string;
  min_financial_risk?: number;
  financial_only?: boolean;
  min_compliance_risk?: number;
  sort_by?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<WorkRecord>> {
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  if (params.constituency) query.append('constituency', params.constituency);
  if (params.work_status) query.append('work_status', params.work_status);
  if (params.category) query.append('category', params.category);
  if (params.severity) query.append('severity', params.severity);
  if (params.search) query.append('search', params.search);
  if (params.min_financial_risk !== undefined) query.append('min_financial_risk', params.min_financial_risk.toString());
  if (params.financial_only) query.append('financial_only', 'true');
  if (params.min_compliance_risk !== undefined) query.append('min_compliance_risk', params.min_compliance_risk.toString());
  if (params.sort_by) query.append('sort_by', params.sort_by);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());

  return safeFetchJson<PaginatedResponse<WorkRecord>>(`${API_BASE}/risk-monitor?${query.toString()}`, {
    total: 0,
    page: 1,
    limit: 50,
    top_scores: { financial: 0, duplicate: 0, compliance: 0, schedule: 0, composite: 0 },
    records: [],
  });
}

export async function fetchFinancialBenchmarks(params: { scope?: string; state?: string; constituency?: string; main_sector?: string; subsector?: string; page?: number; limit?: number } = {}): Promise<FinancialBenchmarkResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.append(key, String(value));
  }
  return safeFetchJson<FinancialBenchmarkResponse>(`${API_BASE}/financial/benchmarks?${query.toString()}`, {
    total: 0, page: 1, limit: 50, total_pages: 0, records: [], available: { states: [], sectors: [], subsectors: [] },
  });
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

export async function fetchDuplicateClusters(params: { state?: string; constituency?: string; risk_level?: string; page?: number; limit?: number }): Promise<PaginatedResponse<DuplicateCluster>> {
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  if (params.constituency) query.append('constituency', params.constituency);
  if (params.risk_level) query.append('risk_level', params.risk_level);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  return safeFetchJson<PaginatedResponse<DuplicateCluster>>(`${API_BASE}/duplicate-clusters?${query.toString()}`, {
    total: 0, page: 1, limit: 20, total_pages: 0, records: [],
  });
}

export async function fetchFilters(params: { state?: string } = {}): Promise<FilterOptions> {
  const fallback: FilterOptions = {
    states: [],
    categories: [],
    severities: [],
    statuses: [],
  };
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  const suffix = query.toString();
  return safeFetchJson<FilterOptions>(`${API_BASE}/filters${suffix ? `?${suffix}` : ''}`, fallback);
}

export async function fetchComplianceRules(): Promise<any> {
  return safeFetchJson(API_BASE + '/compliance/rules', {
    source: 'mplads_2023_guidelines_including_changes.pdf',
    work_level_rules: [],
    constituency_level_rules: [],
    non_guideline_heuristics: [],
  });
}

export async function fetchComplianceSummary(): Promise<any> {
  return safeFetchJson(API_BASE + '/compliance/summary', {
    work_level_risk: 0,
    critical: 0,
    high: 0,
    medium: 0,
    needs_review: 0,
    rule_counts: {},
    constituency_observations: 0,
  });
}

export async function fetchConstituencyCompliance(params: {
  state?: string;
  constituency?: string;
  mp_name?: string;
  financial_year?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<ConstituencyComplianceRecord>> {
  const query = new URLSearchParams();
  if (params.state) query.append('state', params.state);
  if (params.constituency) query.append('constituency', params.constituency);
  if (params.mp_name) query.append('mp_name', params.mp_name);
  if (params.financial_year) query.append('financial_year', params.financial_year);
  if (params.page) query.append('page', params.page.toString());
  if (params.limit) query.append('limit', params.limit.toString());
  return safeFetchJson<PaginatedResponse<ConstituencyComplianceRecord>>(
    API_BASE + '/compliance/constituency?' + query.toString(),
    { total: 0, page: 1, limit: 25, records: [] },
  );
}
