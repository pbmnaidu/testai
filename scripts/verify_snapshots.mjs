import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const snapshotsDir = path.resolve('frontend/public/data/snapshots');
const manifestPath = path.join(snapshotsDir, 'latest.json');

console.log('[TEST] Checking manifest:', manifestPath);
if (!fs.existsSync(manifestPath)) {
  console.error('FAIL: Manifest not found!');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log('  Active snapshot version:', manifest.snapshot_version);
console.log('  Dataset version:', manifest.dataset_version);
console.log('  Base path:', manifest.base_path);
console.log('  Master works row count:', manifest.row_counts?.master_works);

const snapshotDir = path.join(snapshotsDir, manifest.snapshot_version);
const rootFiles = [
  'overview.json',
  'state_summaries.json',
  'officer_dashboard.json',
  'schedule_risk.json',
  'model_status.json',
  'filters.json',
  'duplicate_candidates.json',
  'duplicate_clusters.json',
  'compliance_rules.json',
  'compliance_summary.json',
  'constituency_compliance.json',
  'financial_benchmarks.json',
  'citizen_works.json',
  'citizen_evidence_baseline.json',
  'attendance_baseline.json',
  'risk_monitor_index.json',
  'risk_monitor_default.json',
  'metadata.json',
];

console.log('\n[TEST] Verifying root files existence & valid JSON:');
for (const rf of rootFiles) {
  const fp = path.join(snapshotDir, rf);
  if (!fs.existsSync(fp)) {
    console.error(`FAIL: Missing root file: ${rf}`);
    process.exit(1);
  }
  const stat = fs.statSync(fp);
  const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const isArr = Array.isArray(data);
  const count = isArr ? data.length : Object.keys(data).length;
  console.log(`  ✓ ${rf.padEnd(30)} ${(stat.size / 1024).toFixed(1).padStart(8)} KB (${count} ${isArr ? 'items' : 'keys'})`);
}

// Check sample work lookup and shard hashing
console.log('\n[TEST] Testing deterministic work detail shard lookups:');
const riskIndexPath = path.join(snapshotDir, 'risk_monitor_index.json');
const riskIndex = JSON.parse(fs.readFileSync(riskIndexPath, 'utf8'));
console.log(`  Total indexed risk records: ${riskIndex.length}`);

// Sample 25 records spread across the dataset
const sampleStep = Math.floor(riskIndex.length / 25);
const sampleRecords = [];
for (let i = 0; i < 25; i++) {
  sampleRecords.push(riskIndex[i * sampleStep]);
}

let matchedShards = 0;
let matchedDetails = 0;

for (const r of sampleRecords) {
  const normId = r.work_id.trim().toUpperCase();
  const hash = crypto.createHash('sha256').update(normId).digest('hex');
  const shardHex = hash.substring(0, 2);
  const shardPath = path.join(snapshotDir, 'work_details', `${shardHex}.json`);
  if (!fs.existsSync(shardPath)) {
    console.error(`FAIL: Missing shard ${shardHex}.json for work_id ${r.work_id}`);
    process.exit(1);
  }
  const shardData = JSON.parse(fs.readFileSync(shardPath, 'utf8'));
  matchedShards++;

  // Look up in shard
  let found = shardData[normId] || shardData[r.work_id];
  if (!found) {
    // fallback check
    for (const [id, item] of Object.entries(shardData)) {
      if (id.toUpperCase() === normId) {
        found = item;
        break;
      }
    }
  }

  if (found) {
    matchedDetails++;
    if (!found.work || !found.candidate_duplicates) {
      console.error(`FAIL: Detail shape incomplete for ${r.work_id}`);
      process.exit(1);
    }
  } else {
    console.warn(`WARN: Work ID ${r.work_id} not found in shard ${shardHex}.json`);
  }
}

console.log(`  ✓ Shards loaded: ${matchedShards}/${sampleRecords.length}`);
console.log(`  ✓ Work details resolved: ${matchedDetails}/${sampleRecords.length}`);

if (matchedDetails < sampleRecords.length) {
  console.error('FAIL: Not all sample records could be resolved from shards.');
  process.exit(1);
}

console.log('\n[TEST] Verifying National Overview metrics:');
const natOverview = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'overview.json'), 'utf8'));
if (!natOverview.summary || typeof natOverview.summary.total_works !== 'number') {
  console.error('FAIL: overview.json missing valid summary!');
  process.exit(1);
}
console.log('  Total Works:', natOverview.summary.total_works);
console.log('  Total Sanctioned Amount: ₹', (natOverview.summary.total_sanctioned_amount / 1e7).toFixed(2), 'Cr');
console.log('  Top States Count:', natOverview.top_states?.length || 0);

console.log('\n[TEST] Verifying Filters:');
const filters = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'filters.json'), 'utf8'));
console.log('  States count:', filters.states?.length || 0);
console.log('  Categories count:', filters.categories?.length || 0);

console.log('\n[TEST] Verifying Citizen Works register:');
const citizenWorks = JSON.parse(fs.readFileSync(path.join(snapshotDir, 'citizen_works.json'), 'utf8'));
console.log('  Records count:', citizenWorks.records?.length || 0);
console.log('  Config:', JSON.stringify(citizenWorks.config));

console.log('\n[ALL TESTS PASSED] Static snapshot deployment verification successful!');
