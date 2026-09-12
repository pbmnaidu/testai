export interface WorkRecord {
  work_id: string;
  work_category: string;
  State: string;
  Constituency: string;
  state: string;
  constituency: string;
  work_status?: string;
  mp_name?: string;
  description: string;
  sanction_amount: number;
  effective_expenditure?: number;
  peer_category_median_amount?: number;
  peer_median?: number;
  amount_to_peer_ratio?: number;
  category_percentile?: number;
  has_evidence_image?: boolean;
  financial_risk_score: number;
  financial_risk_level: string;
  financial_explanation?: string;
  financial_what_happened?: string;
  financial_why_it_matters?: string;
  financial_supporting_details?: string;
  financial_risk_evidence?: string;
  financial_audit_interpretation?: string;
  financial_risk_rank?: number;
  is_financial_outlier?: boolean;
  current_cost?: number;
  current_unit_price?: number;
  quantity_detected?: number;
  quantity_unit?: string;
  historical_cost_min?: number;
  historical_cost_max?: number;
  historical_cost_median?: number;
  historical_cost_count?: number;
  historical_unit_price_min?: number;
  historical_unit_price_max?: number;
  historical_unit_price_median?: number;
  historical_unit_price_count?: number;
  cost_comparison_status?: string;
  unit_comparison_status?: string;
  unit_price_comparison_eligible?: boolean;
  unit_price_skip_reason?: string;
  comparison_scope?: 'CONSTITUENCY' | 'STATE' | 'ALL_INDIA' | string;
  comparison_level?: 'EFFECTIVE_CATEGORY' | 'SUBSECTOR' | 'MAIN_SECTOR' | string;
  comparison_state?: string;
  comparison_constituency?: string;
  comparison_sector?: string;
  comparison_subsector?: string;
  comparison_work_type?: string;
  comparison_peer_category?: string;
  peer_category?: string;
  peer_category_auto_generated?: boolean;
  original_effective_work_category?: string;
  comparison_group_label?: string;
  unit_comparison_scope?: string;
  duplicate_risk_score: number;
  duplicate_risk_level?: string;
  duplicate_explanation?: string;
  duplicate_what_happened?: string;
  duplicate_why_it_matters?: string;
  duplicate_supporting_details?: string;
  compliance_risk_score: number;
  compliance_risk_level: string;
  compliance_explanation?: string;
  compliance_scope?: 'WORK_LEVEL_ONLY' | string;
  compliance_review_status?: string;
  is_work_level_compliance_risk?: boolean;
  compliance_primary_rule_id?: string;
  compliance_primary_status?: string;
  compliance_primary_guideline_basis?: string;
  compliance_primary_what_happened?: string;
  compliance_primary_why_it_matters?: string;
  compliance_primary_supporting_details?: string;
  compliance_primary_details_json?: string;
  compliance_what_happened?: string;
  compliance_why_it_matters?: string;
  compliance_supporting_details?: string;
  compliance_data_quality?: string[];
  compliance_findings?: ComplianceFinding[];
  compliance_rule_results?: ComplianceFinding[];
  schedule_risk_score: number;
  schedule_risk_level: string;
  schedule_explanation?: string;
  schedule_what_happened?: string;
  schedule_why_it_matters?: string;
  schedule_supporting_details?: string;
  expected_timeline_progress_pct?: number;
  expenditure_progress_pct?: number;
  progress_gap_pct?: number;
  overdue_days?: number;
  composite_risk_score: number;
  overall_risk_level: string;
  explainable_audit_summary?: string;
  recommended_reviewer_action?: string;
  sanction_date?: string;
  estimated_completion_date?: string;
  completion_date?: string;
  model_name?: string;
  model_version?: string;
  dataset_snapshot?: string;
  last_analyzed_at?: string;
  original_work_category?: string;
  effective_work_category?: string;
  main_sector?: string;
  work_domain?: string;
  ai_work_domain?: string;
  ai_work_category?: string;
  work_subcategory?: string;
  category_confidence?: number;
  category_confidence_band?: string;
  category_source?: string;
  peer_group_level?: string;
  peer_group_size?: number;
  peer_group_median?: number;
  avg_payment?: number;
  max_payment?: number;
  payment_count?: number;
  first_payment_date?: string;
  last_payment_date?: string;
  recommended_date?: string;
  expenditure_trips?: ExpenditureTrip[];
}

export interface ExpenditureTrip {
  trip_number?: number;
  work_id?: string;
  expenditure_date?: string;
  expenditure_amount?: number;
  payment_status?: string;
}

export interface ComplianceFinding {
  rule_id: string;
  rule_name: string;
  status: 'FAIL' | 'NEEDS_REVIEW' | 'PASS' | 'NOT_EVALUATED' | string;
  severity?: string;
  scope?: string;
  guideline_name?: string;
  guideline_section?: string;
  source_document?: string;
  guideline_basis?: string;
  rule_interpretation?: string;
  threshold?: string;
  what_happened?: string;
  why_it_matters?: string;
  supporting_details?: string;
  details?: Record<string, unknown>;
  evidence_quality?: string;
  review_priority?: string;
}

export interface ConstituencyComplianceRecord {
  scope: 'CONSTITUENCY' | string;
  state: string;
  constituency: string;
  mp_name?: string;
  financial_year: string;
  total_observed_sanctioned_amount?: number;
  official_allocation_reference_inr?: number;
  allocation_basis?: string;
  sc_observed_amount?: number;
  sc_observed_pct_of_allocation_basis?: number;
  sc_target_pct?: number;
  sc_status?: string;
  sc_evidence_work_count?: number;
  st_observed_amount?: number;
  st_observed_pct_of_allocation_basis?: number;
  st_target_pct?: number;
  st_status?: string;
  st_evidence_work_count?: number;
  repair_renovation_pct_of_allocation_basis?: number;
  repair_status?: string;
  entity_assistance_pct_of_allocation_basis?: number;
  entity_assistance_status?: string;
  bar_library_pct_of_allocation_basis?: number;
  bar_library_status?: string;
  allocation_data_status?: string;
  analysis_note?: string;
  source_sections?: string;
}

export interface CandidateDuplicatePair {
  work_id_1: string;
  work_id_2: string;
  state: string;
  constituency: string;
  similarity_score: number;
  sanction_amount_1: number;
  sanction_amount_2: number;
  description_1: string;
  description_2: string;
  source_dataset_1?: string;
  source_dataset_2?: string;
  recommended_description_1?: string;
  recommended_description_2?: string;
  sanctioned_description_1?: string;
  sanctioned_description_2?: string;
  recommended_work_id_1?: string;
  recommended_work_id_2?: string;
  sanctioned_work_id_1?: string;
  sanctioned_work_id_2?: string;
  sanction_date_1?: string;
  sanction_date_2?: string;
  recommended_date_1?: string;
  recommended_date_2?: string;
  same_description_match?: boolean;
  same_recommended_date?: boolean;
  same_sanction_date?: boolean;
  work_id_numeric_distance?: number;
  within_10_ids?: boolean;
    possible_split_work?: boolean;
    split_work_investigation?: boolean;
    quantity_signature_1?: string;
    quantity_signature_2?: string;
    quantity_identity_match?: boolean;
    quantity_identity_status?: string;
    duplicate_risk_level?: string;
    review_classification?: 'PROBABLE_WORK_DIVISION' | 'DUPLICATE_OVERLAP_REVIEW' | string;
  nlp_explanation?: string;
}

export interface DuplicateClusterRecord {
  work_id: string;
  work_name: string;
  sanction_amount?: number;
  recommended_amount?: number;
  recommended_work_id?: string;
  sanctioned_work_id?: string;
  comparison_source?: string;
  recommended_date?: string;
  sanction_date?: string;
  quantity?: string;
}

export interface DuplicateCluster {
  cluster_id: string;
  work_ids: string[];
  cluster_size: number;
  state: string;
  constituency: string;
  sector?: string;
  common_asset: string;
  duplicate_risk_score: number;
  duplicate_risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  possible_split_work: boolean;
  review_classification?: string;
  related_record_count: number;
  id_range?: number;
  total_sanctioned_amount?: number;
  total_recommended_amount?: number;
  recommended_to_sanctioned_ratio?: number;
  quantity_totals?: Record<string, number>;
  key_indicators: string[];
  risk_reason: string;
  audit_observation: string;
  record_summaries: DuplicateClusterRecord[];
}

export interface NationalOverviewResponse {
  metadata?: AnalyticsMetadata;
  summary: {
    total_allocated_funds: number;
    total_sanctioned_amount: number;
    total_disbursed_amount: number;
    total_works: number;
    completed_works: number;
    high_risk_works: number;
    critical_works: number;
    overdue_works?: number;
  };
  financial_summary?: {
    flagged_financial_outliers: number;
    historical_comparison_available: number;
    unit_price_comparisons: number;
  };
  risk_distribution: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  top_states: Array<{
    state: string;
    total_works: number;
    total_sanctioned: number;
    total_disbursed?: number;
    high_risk_works: number;
    risk_percentage?: number;
    financial_risk_works?: number;
    compliance_risk_works?: number;
    duplicate_risk_works?: number;
    schedule_risk_works?: number;
  }>;
  state_metrics?: Array<{
    state: string;
    total_works: number;
    total_sanctioned: number;
    total_disbursed?: number;
    high_risk_works: number;
    critical_works?: number;
    average_risk_score?: number;
    risk_level?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    duplicate_candidate_pairs?: number;
    risk_percentage?: number;
    financial_risk_works?: number;
    compliance_risk_works?: number;
    duplicate_risk_works?: number;
    schedule_risk_works?: number;
  }>;
  category_distribution: Array<{
    work_category: string;
    total_works: number;
    total_sanctioned: number;
    high_risk_works: number;
  }>;
}

export interface AnalyticsMetadata {
  data_version: string;
  analysis_version: string;
  generated_at: string;
  last_successful_sync?: string;
  analysis_generated_at?: string;
  stale_analysis?: boolean;
}

export interface StateRiskSummary {
  state: string;
  total_works: number;
  signals: Array<{
    key: 'financial' | 'compliance' | 'duplicate' | 'schedule';
    label: string;
    average_score: number;
    flagged_works: number;
  }>;
  dominant_signal: {
    key: 'financial' | 'compliance' | 'duplicate' | 'schedule';
    label: string;
    average_score: number;
    flagged_works: number;
  } | null;
}

export interface MpIntelligenceResponse {
  selected_filters: {
    state: string | null;
    constituency: string | null;
    mp_name: string | null;
  };
  available_constituencies: string[];
  available_mps: string[];
  portfolio_summary: {
    total_works: number;
    completed_works: number;
    ongoing_works: number;
    total_sanctioned: number;
    total_expenditure: number;
    utilization_rate: number;
  };
  suspicious_works: WorkRecord[];
}

export interface SyncStatusResponse {
  operational_status: string;
  sync_frequency: string;
  source_url?: string;
  data_origin?: string;
  last_sync: string;
  next_scheduled_sync: string;
  current_snapshot_id: string;
  total_records_processed: number;
  new_records_since_last_sync: number;
  updated_records_since_last_sync: number;
  removed_records_since_last_sync?: number;
  snapshot_count: number;
  training?: TrainingStatus;
  job?: SyncJobStatus;
  last_successful_sync?: string;
  data_version?: string;
  analysis_version?: string;
  analysis_generated_at?: string;
}

export interface SyncJobStatus {
  job_id?: string;
  status: 'IDLE' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | string;
  message?: string;
  queued_at?: string;
  started_at?: string;
  completed_at?: string;
  snapshot_id?: string;
  sync_id?: string;
  last_event?: string;
  datasets?: Array<{
    dataset: string;
    label?: string;
    status?: string;
    records_received?: number;
    records_processed?: number;
    records_failed?: number;
    pages_fetched?: number;
    error?: string;
  }>;
  counters?: Record<string, number>;
  error_count?: number;
  technical_error?: string;
}

export interface TrainingStatus {
  run_id?: string;
  status: string;
  progress?: number;
  message?: string;
  snapshot_id?: string;
  completed_at?: string;
  error?: string;
}

export interface SyncPreviewResponse {
  success: boolean;
  preview_token: string;
  diff: { new_count: number; updated_count: number; removed_count: number; unchanged_count: number; total_changes: number; tables: Record<string, any> };
  review: { total: number; page: number; limit: number; records: Array<any> };
}

export interface ModelStatusResponse {
  experiment_name: string;
  registered_model: string;
  production_model: {
    model_name: string;
    model_version: string;
    run_id: string;
    stage: string;
    dataset_version: string;
    last_trained_at: string;
  };
  runs: Array<{
    run_id: string;
    timestamp: string;
    version: string;
    stage: string;
    algorithm: string;
    dataset_version?: string;
    parameters: Record<string, any>;
    metrics: Record<string, any>;
  }>;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  limit: number;
  total_pages?: number;
  top_scores?: {
    financial: number;
    duplicate: number;
    compliance: number;
    schedule: number;
    composite: number;
  };
  records: T[];
}

export interface FilterOptions {
  states: string[];
  constituencies?: string[];
  mps?: string[];
  categories: string[];
  severities: string[];
  statuses?: string[];
}

export interface FinancialBenchmarkRecord {
  benchmark_id: string;
  comparison_scope: 'CONSTITUENCY' | 'STATE' | 'ALL_INDIA' | string;
  comparison_level: 'EFFECTIVE_CATEGORY' | 'SUBSECTOR' | 'MAIN_SECTOR' | string;
  state: string;
  constituency: string;
  main_sector: string;
  subsector: string;
  effective_work_category: string;
  original_effective_work_category?: string;
  peer_category?: string;
  peer_category_auto_generated?: boolean;
  completed_work_count: number;
  current_work_count: number;
  outlier_count: number;
  historical_cost_min?: number;
  historical_cost_median?: number;
  historical_cost_max?: number;
  historical_unit_price_min?: number;
  historical_unit_price_median?: number;
  historical_unit_price_max?: number;
  historical_unit_price_count?: number;
}

export interface FinancialBenchmarkResponse extends PaginatedResponse<FinancialBenchmarkRecord> {
  available: { states: string[]; sectors: string[]; subsectors: string[] };
}
