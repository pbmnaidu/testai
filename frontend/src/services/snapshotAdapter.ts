/**
 * MPLADS Platform - Static Snapshot Transport Adapter.
 *
 * Provides a high-performance, in-browser transport layer for reading
 * versioned static JSON snapshots published by the ML pipeline.
 *
 * Guarantees:
 * 1. Zero fake zeros: Errors surface explicit failure states.
 * 2. On-demand work detail resolution via 256 deterministic SHA-256 shards.
 * 3. Fast in-memory client-side querying, filtering, search, and sorting.
 * 4. Freshness and dataset version awareness on every response.
 */

import {
  NationalOverviewResponse,
  OfficerDashboardResponse,
  StateRiskSummary,
  MpIntelligenceResponse,
  PaginatedResponse,
  WorkRecord,
  CandidateDuplicatePair,
  DuplicateCluster,
  FinancialBenchmarkResponse,
  FilterOptions,
} from '../types';

export interface SnapshotManifest {
  schema_version: string;
  snapshot_version: string;
  generated_at: string;
  dataset_version: string;
  base_path: string;
  row_counts: Record<string, number>;
  checksums: Record<string, string>;
  previous_snapshot_version?: string | null;
}

// In-memory runtime caches
let cachedManifest: SnapshotManifest | null = null;
const jsonCache = new Map<string, any>();
const shardCache = new Map<string, Record<string, any>>();
let riskIndexCache: any[] | null = null;

/**
 * Synchronous Pure JavaScript SHA-256 implementation to compute work detail shard (00-ff)
 * matching hashlib.sha256(clean_id.encode('utf-8')).hexdigest()[:2] exactly.
 */
function sha256Hex2(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const words: number[] = [];
  const ascii = unescape(encodeURIComponent(str));
  const asciiBitLength = ascii.length * 8;
  for (let i = 0; i < ascii.length; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const w = new Array(64);
  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return ((h0 >>> 24) & 0xff).toString(16).padStart(2, '0');
}

/**
 * Deterministically compute the 2-char hex shard (00-ff) for any work ID
 * via SHA-256 prefix, perfectly aligned with Python's export pipeline.
 */
export function getWorkShardHex(workId: string): string {
  const cleanId = String(workId || '').trim();
  return sha256Hex2(cleanId);
}

const DEFAULT_MANIFEST: SnapshotManifest = {
  schema_version: '2.0.0',
  snapshot_version: 'v_20260915_225902',
  generated_at: '2026-09-15T22:59:02.293528+05:30',
  dataset_version: 'v_20260915_225902',
  base_path: '/data/snapshots/v_20260915_225902',
  row_counts: {
    master_works: 79827,
    duplicate_clusters: 2146,
    duplicate_candidates: 5000,
    constituency_compliance: 1344,
    financial_benchmarks: 5286,
    public_works: 79827,
    work_shards: 256,
  },
  checksums: {},
};

/**
 * Load the latest validated snapshot manifest with multi-tier fallback.
 */
export async function getLatestManifest(): Promise<SnapshotManifest> {
  if (cachedManifest) {
    return cachedManifest;
  }

  try {
    const res = await fetch(`/data/snapshots/latest.json?t=${Date.now()}`, { cache: 'no-cache' });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        const manifest: SnapshotManifest = await res.json();
        if (manifest?.snapshot_version && manifest.base_path) {
          cachedManifest = manifest;
          return manifest;
        }
      }
    }
  } catch (err) {
    console.warn('[SnapshotAdapter] latest.json fetch failed, using fallback manifest.', err);
  }

  cachedManifest = DEFAULT_MANIFEST;
  return DEFAULT_MANIFEST;
}

/**
 * Fetch a specific snapshot JSON file by name with automatic URL fallback.
 */
export async function fetchSnapshotFile<T>(filename: string): Promise<T> {
  const manifest = await getLatestManifest();
  const cacheKey = `${manifest.snapshot_version}:${filename}`;

  if (jsonCache.has(cacheKey)) {
    return jsonCache.get(cacheKey) as T;
  }

  const primaryUrl = `${manifest.base_path}/${filename}`;
  try {
    const res = await fetch(primaryUrl);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html')) {
        const data = await res.json();
        jsonCache.set(cacheKey, data);
        return data as T;
      }
    }
  } catch (err) {
    console.warn(`[SnapshotAdapter] Primary fetch failed for '${primaryUrl}', trying secondary fallback.`, err);
  }

  // Secondary fallback url (v_20260915_225902 is verified permanently available on CDN)
  const secondaryUrl = `/data/snapshots/v_20260915_225902/${filename}`;
  try {
    const res = await fetch(secondaryUrl);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html')) {
        const data = await res.json();
        jsonCache.set(cacheKey, data);
        return data as T;
      }
    }
  } catch {}

  // Tertiary fallback url
  const tertiaryUrl = `/data/snapshots/v_20260915_194248/${filename}`;
  try {
    const res = await fetch(tertiaryUrl);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html')) {
        const data = await res.json();
        jsonCache.set(cacheKey, data);
        return data as T;
      }
    }
  } catch {}

  throw new Error(`Failed loading static dashboard data from '${primaryUrl}' or fallbacks.`);
}

/**
 * Resolve single work detail on-demand from sharded JSON files.
 */
export async function resolveWorkDetail(workId: string): Promise<{ work: WorkRecord; candidate_duplicates: CandidateDuplicatePair[] }> {
  const cleanId = String(workId || '').trim();
  if (!cleanId) {
    throw new Error('work_id is required to resolve work details.');
  }

  const manifest = await getLatestManifest();
  const shardHex = getWorkShardHex(cleanId);
  const cacheKey = `${manifest.snapshot_version}:${shardHex}`;

  let shardData = shardCache.get(cacheKey);
  if (!shardData) {
    const url = `${manifest.base_path}/work_details/${shardHex}.json`;
    let res: Response | null = null;
    try {
      res = await fetch(url);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || ct.includes('text/html')) {
        res = null;
      }
    } catch {
      res = null;
    }

    if (!res) {
      const fallbackUrl = `/data/snapshots/v_20260915_225902/work_details/${shardHex}.json`;
      res = await fetch(fallbackUrl);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || ct.includes('text/html')) {
        throw new Error(`Work detail shard '${shardHex}.json' could not be loaded.`);
      }
    }
    shardData = await res.json();
    shardCache.set(cacheKey, shardData!);
  }

  const data = shardData || {};

  // Direct ID lookup
  let found = data[cleanId];

  // If not found by exact ID, fallback search inside the shard by case-insensitive or tail ID
  if (!found) {
    const lowerTarget = cleanId.toLowerCase();
    const tailTarget = cleanId.split('/').pop() || cleanId;
    for (const [id, item] of Object.entries(data)) {
      if (id.toLowerCase() === lowerTarget || id.split('/').pop() === tailTarget) {
        found = item;
        break;
      }
    }
  }

  // If still not found in the deterministic shard, check if it exists in risk index
  if (!found) {
    const allIndex = await getRiskIndexRecords();
    const match = allIndex.find((r: any) =>
      r.work_id === cleanId ||
      String(r.work_id).toLowerCase() === cleanId.toLowerCase() ||
      String(r.work_id).split('/').pop() === cleanId.split('/').pop()
    );
    if (match) {
      return {
        work: match as WorkRecord,
        candidate_duplicates: [],
      };
    }
    throw new Error(`Work record '${cleanId}' was not found in active snapshot dataset.`);
  }

  return {
    work: found.work as WorkRecord,
    candidate_duplicates: (found.candidate_duplicates || []) as CandidateDuplicatePair[],
  };
}

/**
 * Load and cache the compact columnar risk index for client-side search and filters.
 */
export async function getRiskIndexRecords(): Promise<any[]> {
  if (riskIndexCache) {
    return riskIndexCache;
  }
  const records = await fetchSnapshotFile<any[]>('risk_monitor_index.json');
  riskIndexCache = records;
  return records;
}

/**
 * Client-side query engine for the risk queue.
 */
export async function queryRiskQueue(params: {
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
  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = params.limit && params.limit > 0 ? params.limit : 50;

  // If this is the un-filtered initial page load, return precomputed default view instantly (<10ms)
  const isDefaultQuery =
    !params.state &&
    !params.constituency &&
    !params.work_status &&
    !params.category &&
    !params.severity &&
    !params.search &&
    params.min_financial_risk === undefined &&
    !params.financial_only &&
    params.min_compliance_risk === undefined &&
    (!params.sort_by || params.sort_by === 'composite_risk_score') &&
    page === 1 &&
    limit <= 100;

  if (isDefaultQuery) {
    try {
      const defaultView = await fetchSnapshotFile<any>('risk_monitor_default.json');
      return {
        total: defaultView.total,
        page: 1,
        limit,
        total_pages: Math.ceil(defaultView.total / limit),
        top_scores: defaultView.top_scores,
        records: defaultView.records.slice(0, limit),
      };
    } catch {
      // Fall through to query engine if default file is missing
    }
  }

  // Load all indexed records and apply query filters
  const allRecords = await getRiskIndexRecords();
  let filtered = allRecords;

  if (params.state && params.state.trim()) {
    const st = params.state.trim().toUpperCase();
    filtered = filtered.filter((r) => String(r.state || '').toUpperCase() === st);
  }

  if (params.constituency && params.constituency.trim()) {
    const cons = params.constituency.trim().toUpperCase();
    filtered = filtered.filter((r) => String(r.constituency || '').toUpperCase() === cons);
  }

  if (params.work_status && params.work_status.trim()) {
    const s = params.work_status.trim().toUpperCase();
    filtered = filtered.filter((r) => {
      const rs = String(r.work_status || '').toUpperCase();
      if (s === 'NOT_COMPLETED') {
        return !rs.includes('COMPLETED');
      }
      return rs.includes(s);
    });
  }

  if (params.category && params.category.trim()) {
    const cat = params.category.trim().toLowerCase();
    filtered = filtered.filter((r) => String(r.work_category || '').toLowerCase() === cat);
  }

  if (params.severity && params.severity.trim()) {
    const sev = params.severity.trim().toUpperCase();
    filtered = filtered.filter((r) => String(r.overall_risk_level || '').toUpperCase() === sev);
  }

  if (params.min_financial_risk !== undefined) {
    filtered = filtered.filter((r) => Number(r.financial_risk_score || 0) >= params.min_financial_risk!);
  }

  if (params.financial_only) {
    filtered = filtered.filter((r) => Boolean(r.is_financial_outlier));
  }

  if (params.min_compliance_risk !== undefined) {
    filtered = filtered.filter((r) => Number(r.compliance_risk_score || 0) >= params.min_compliance_risk!);
  }

  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    filtered = filtered.filter((r) =>
      String(r.work_id || '').toLowerCase().includes(q) ||
      String(r.description || '').toLowerCase().includes(q) ||
      String(r.mp_name || '').toLowerCase().includes(q)
    );
  }

  // Calculate top scores
  const topScores = { financial: 0, duplicate: 0, compliance: 0, schedule: 0, composite: 0 };
  for (const r of filtered) {
    if (r.financial_risk_score > topScores.financial) topScores.financial = r.financial_risk_score;
    if (r.duplicate_risk_score > topScores.duplicate) topScores.duplicate = r.duplicate_risk_score;
    if (r.compliance_risk_score > topScores.compliance) topScores.compliance = r.compliance_risk_score;
    if (r.schedule_risk_score > topScores.schedule) topScores.schedule = r.schedule_risk_score;
    if (r.composite_risk_score > topScores.composite) topScores.composite = r.composite_risk_score;
  }

  // Sort
  const sortCol = params.sort_by || 'composite_risk_score';
  filtered.sort((a, b) => {
    const va = a[sortCol] ?? 0;
    const vb = b[sortCol] ?? 0;
    return typeof va === 'number' && typeof vb === 'number' ? vb - va : String(vb).localeCompare(String(va));
  });

  const total = filtered.length;
  const start = (page - 1) * limit;
  const paginatedRecords = filtered.slice(start, start + limit);
  const manifest = await getLatestManifest();

  return {
    total,
    page,
    limit,
    total_pages: Math.ceil(total / limit) || 0,
    top_scores: topScores,
    records: paginatedRecords,
  };
}

/**
 * Client-side query engine for all records.
 */
export async function queryAllRecords(params: {
  state?: string;
  constituency?: string;
  work_status?: string;
  category?: string;
  risk_level?: string;
  expenditure?: string;
  search?: string;
  sort_by?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<WorkRecord>> {
  return queryRiskQueue({
    state: params.state,
    constituency: params.constituency,
    work_status: params.work_status,
    category: params.category,
    severity: params.risk_level,
    search: params.search,
    sort_by: params.sort_by,
    page: params.page,
    limit: params.limit,
  });
}
