/**
 * test_hub_bonus.js
 * Node.js unit tests for network_hub_bonus.js
 * Run: node src/test_hub_bonus.js
 */

import { readFileSync } from 'fs';
import { computeHubBonusSync, getHubBonusValue } from './scoring/network_hub_bonus.js';

// Load metrics from file
const metricsRaw = JSON.parse(
  readFileSync(new URL('../../guno_v6/data/derived/station_metrics_tokyo.json', import.meta.url))
);

// Accept both wrapped and raw format
const metricsData = metricsRaw.stations ? metricsRaw : { stations: metricsRaw };

// Helper: get station_global_id by name
function gidByName(name) {
  const s = metricsData.stations.find(st => st.station_name === name);
  if (!s) throw new Error(`Station not found: ${name}`);
  return s.station_global_id;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${label}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || ''} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${msg || ''} expected ~${expected}, got ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// getHubBonusValue tests
// ---------------------------------------------------------------------------
console.log('\n=== getHubBonusValue ===');

test('score >= 12 → bonus 5', () => assertEqual(getHubBonusValue(18.36), 5));
test('score == 12 → bonus 5', () => assertEqual(getHubBonusValue(12.0), 5));
test('score 11.99 → bonus 3', () => assertEqual(getHubBonusValue(11.99), 3));
test('score == 10 → bonus 3', () => assertEqual(getHubBonusValue(10.0), 3));
test('score 9.99 → bonus 1', () => assertEqual(getHubBonusValue(9.99), 1));
test('score == 8 → bonus 1', () => assertEqual(getHubBonusValue(8.0), 1));
test('score 7.99 → bonus 0', () => assertEqual(getHubBonusValue(7.99), 0));
test('score 0 → bonus 0', () => assertEqual(getHubBonusValue(0), 0));

// ---------------------------------------------------------------------------
// computeHubBonusSync tests
// ---------------------------------------------------------------------------
console.log('\n=== computeHubBonusSync ===');

test('empty input → hub_bonus=0, hub_stations=[]', () => {
  const r = computeHubBonusSync([], metricsData);
  assertEqual(r.hub_bonus, 0);
  assertEqual(r.hub_stations.length, 0);
});

test('unknown station ID → ignored safely', () => {
  const r = computeHubBonusSync(['ST_UNKNOWN_0000000'], metricsData);
  assertEqual(r.hub_bonus, 0);
  assertEqual(r.hub_stations.length, 0);
});

test('大手町 (rank 1, score ~18.36) → bonus 5', () => {
  const gid = gidByName('大手町');
  const r = computeHubBonusSync([gid], metricsData);
  assertEqual(r.hub_bonus, 5);
  assertEqual(r.hub_stations.length, 1);
  assertEqual(r.hub_stations[0].station_name, '大手町');
  assertEqual(r.hub_stations[0].bonus, 5);
});

test('渋谷 (score ~12.9) → bonus 5', () => {
  const gid = gidByName('渋谷');
  const r = computeHubBonusSync([gid], metricsData);
  assertEqual(r.hub_bonus, 5);
  assertEqual(r.hub_stations[0].bonus, 5);
});

test('大手町 + 渋谷 → hub_bonus = 10', () => {
  const gids = [gidByName('大手町'), gidByName('渋谷')];
  const r = computeHubBonusSync(gids, metricsData);
  assertEqual(r.hub_bonus, 10);
  assertEqual(r.hub_stations.length, 2);
});

test('hub_stations sorted by bonus desc then score_total desc', () => {
  const gids = [gidByName('渋谷'), gidByName('大手町')];
  const r = computeHubBonusSync(gids, metricsData);
  // Both are bonus 5; 大手町 score > 渋谷 score → 大手町 first
  assertEqual(r.hub_stations[0].station_name, '大手町');
  assertEqual(r.hub_stations[1].station_name, '渋谷');
});

test('accepts raw array format (no wrapper)', () => {
  const rawArray = metricsData.stations;
  const gid = gidByName('大手町');
  const r = computeHubBonusSync([gid], rawArray);
  assertEqual(r.hub_bonus, 5);
});

test('station with score < 8 → not in hub_stations', () => {
  // Find a station with score < 8
  const lowStation = metricsData.stations.find(s => s.score_total < 8);
  if (!lowStation) {
    console.log('     (skipped: no station with score < 8 found)');
    return;
  }
  const r = computeHubBonusSync([lowStation.station_global_id], metricsData);
  assertEqual(r.hub_bonus, 0);
  assertEqual(r.hub_stations.length, 0);
});

test('mixed valid + unknown IDs', () => {
  const gids = [gidByName('大手町'), 'ST_UNKNOWN_9999', gidByName('渋谷')];
  const r = computeHubBonusSync(gids, metricsData);
  assertEqual(r.hub_bonus, 10);
  assertEqual(r.hub_stations.length, 2);
});

test('hub_stations contain required fields', () => {
  const gid = gidByName('大手町');
  const r = computeHubBonusSync([gid], metricsData);
  const s = r.hub_stations[0];
  if (!s.station_global_id) throw new Error('missing station_global_id');
  if (!s.station_name)      throw new Error('missing station_name');
  if (s.score_total === undefined) throw new Error('missing score_total');
  if (s.bonus === undefined)       throw new Error('missing bonus');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
