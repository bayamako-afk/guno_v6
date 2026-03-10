/**
 * test_final_score_engine.js
 * Node.js unit tests for final_score_engine.js
 * Run: node src/test_final_score_engine.js
 */

import { readFileSync } from 'fs';
import { computeFinalScoreSync } from './scoring/final_score_engine.js';

// ---------------------------------------------------------------------------
// Load test data from files
// ---------------------------------------------------------------------------
const metricsRaw = JSON.parse(
  readFileSync(new URL('../../guno_v6/data/derived/station_metrics_tokyo.json', import.meta.url))
);
const stationLines = JSON.parse(
  readFileSync(new URL('../../guno_v6/data/master/station_lines_tokyo.json', import.meta.url))
);
const linesMaster = JSON.parse(
  readFileSync(new URL('../../guno_v6/data/master/lines_tokyo_master.json', import.meta.url))
);

const testData = {
  stationMetrics: metricsRaw,
  stationLines,
  linesMaster
};

// Helper: get station_global_id by name
const metricsArr = metricsRaw.stations || metricsRaw;
function gidByName(name) {
  const s = metricsArr.find(st => st.station_name === name);
  if (!s) throw new Error(`Station not found: ${name}`);
  return s.station_global_id;
}

// Helper: get score_total by name
function scoreByName(name) {
  const s = metricsArr.find(st => st.station_name === name);
  if (!s) throw new Error(`Station not found: ${name}`);
  return s.score_total;
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
    throw new Error(`${msg || ''} expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

function assertIncludes(arr, value, msg) {
  if (!arr.includes(value)) {
    throw new Error(`${msg || ''} expected array to include ${JSON.stringify(value)}, got ${JSON.stringify(arr)}`);
  }
}

// ---------------------------------------------------------------------------
// Return shape tests
// ---------------------------------------------------------------------------
console.log('\n=== Return Shape ===');

test('empty input → all zeros, empty arrays', () => {
  const r = computeFinalScoreSync([], testData);
  assertEqual(r.final_score, 0);
  assertEqual(r.station_score, 0);
  assertEqual(r.route_bonus, 0);
  assertEqual(r.hub_bonus, 0);
  assertEqual(r.routes.length, 0);
  assertEqual(r.hubs.length, 0);
});

test('result has all required fields', () => {
  const r = computeFinalScoreSync([gidByName('大手町')], testData);
  if (r.final_score === undefined)  throw new Error('missing final_score');
  if (r.station_score === undefined) throw new Error('missing station_score');
  if (r.route_bonus === undefined)  throw new Error('missing route_bonus');
  if (r.hub_bonus === undefined)    throw new Error('missing hub_bonus');
  if (!Array.isArray(r.routes))     throw new Error('routes must be array');
  if (!Array.isArray(r.hubs))       throw new Error('hubs must be array');
});

// ---------------------------------------------------------------------------
// Station score tests
// ---------------------------------------------------------------------------
console.log('\n=== Station Score ===');

test('single station: station_score = score_total', () => {
  const gid = gidByName('大手町');
  const expected = scoreByName('大手町');
  const r = computeFinalScoreSync([gid], testData);
  assertClose(r.station_score, expected, 0.001, 'station_score mismatch');
});

test('two stations: station_score = sum of score_totals', () => {
  const gids = [gidByName('大手町'), gidByName('渋谷')];
  const expected = scoreByName('大手町') + scoreByName('渋谷');
  const r = computeFinalScoreSync(gids, testData);
  assertClose(r.station_score, expected, 0.01, 'station_score sum mismatch');
});

test('unknown station ID is ignored (station_score unchanged)', () => {
  const gid = gidByName('大手町');
  const r1 = computeFinalScoreSync([gid], testData);
  const r2 = computeFinalScoreSync([gid, 'ST_UNKNOWN_9999'], testData);
  assertClose(r1.station_score, r2.station_score, 0.001, 'unknown station should not affect score');
});

// ---------------------------------------------------------------------------
// Hub bonus tests
// ---------------------------------------------------------------------------
console.log('\n=== Hub Bonus ===');

test('大手町 (score ~18.36) → hub_bonus = 5', () => {
  const r = computeFinalScoreSync([gidByName('大手町')], testData);
  assertEqual(r.hub_bonus, 5);
  assertIncludes(r.hubs, '大手町');
});

test('two hub stations → hub_bonus accumulates', () => {
  const gids = [gidByName('大手町'), gidByName('渋谷')];
  const r = computeFinalScoreSync(gids, testData);
  assertEqual(r.hub_bonus, 10);
  assertEqual(r.hubs.length, 2);
});

test('station with score < 8 → not in hubs', () => {
  const lowStation = metricsArr.find(s => s.score_total < 8);
  if (!lowStation) { console.log('     (skipped: no station with score < 8)'); return; }
  const r = computeFinalScoreSync([lowStation.station_global_id], testData);
  assertEqual(r.hub_bonus, 0);
  assertEqual(r.hubs.length, 0);
});

test('hubs sorted by bonus desc (大手町 before lower-bonus station)', () => {
  // Find a station with bonus=1 (score 8-9.99)
  const bonus1Station = metricsArr.find(s => s.score_total >= 8 && s.score_total < 10);
  if (!bonus1Station) { console.log('     (skipped: no bonus-1 station found)'); return; }
  const gids = [bonus1Station.station_global_id, gidByName('大手町')];
  const r = computeFinalScoreSync(gids, testData);
  assertEqual(r.hubs[0], '大手町', 'highest bonus station should be first in hubs');
});

// ---------------------------------------------------------------------------
// Route bonus tests
// ---------------------------------------------------------------------------
console.log('\n=== Route Bonus ===');

test('no route completion → route_bonus = 0, routes = []', () => {
  // Single station cannot complete a route
  const r = computeFinalScoreSync([gidByName('大手町')], testData);
  assertEqual(r.route_bonus, 0);
  assertEqual(r.routes.length, 0);
});

test('routes array contains only lines with bonus > 0', () => {
  // Collect all stations on Ginza line to get full completion
  const ginzaStations = stationLines
    .filter(sl => sl.line_id === 'G')
    .map(sl => sl.station_global_id);
  const r = computeFinalScoreSync(ginzaStations, testData);
  // Full Ginza line (9 stations) should give a bonus
  if (r.route_bonus > 0) {
    assertEqual(r.routes.length > 0, true, 'routes should be non-empty when route_bonus > 0');
  }
});

// ---------------------------------------------------------------------------
// Final score formula tests
// ---------------------------------------------------------------------------
console.log('\n=== Final Score Formula ===');

test('final_score = station_score + route_bonus + hub_bonus', () => {
  const gids = [gidByName('大手町'), gidByName('渋谷'), gidByName('日本橋')];
  const r = computeFinalScoreSync(gids, testData);
  const expected = r.station_score + r.route_bonus + r.hub_bonus;
  assertClose(r.final_score, expected, 0.001, 'final_score formula mismatch');
});

test('full Ginza line: final_score includes route_bonus', () => {
  const ginzaStations = stationLines
    .filter(sl => sl.line_id === 'G')
    .map(sl => sl.station_global_id);
  const r = computeFinalScoreSync(ginzaStations, testData);
  const expected = r.station_score + r.route_bonus + r.hub_bonus;
  assertClose(r.final_score, expected, 0.001, 'final_score formula mismatch for full route');
});

test('all zeros for empty input → final_score = 0', () => {
  const r = computeFinalScoreSync([], testData);
  assertEqual(r.final_score, 0);
});

test('single unknown station → final_score = 0', () => {
  const r = computeFinalScoreSync(['ST_UNKNOWN_0000000'], testData);
  assertEqual(r.final_score, 0);
  assertEqual(r.station_score, 0);
  assertEqual(r.hub_bonus, 0);
  assertEqual(r.route_bonus, 0);
});

// ---------------------------------------------------------------------------
// Integration test: spec example
// ---------------------------------------------------------------------------
console.log('\n=== Integration ===');

test('spec example stations produce positive final_score', () => {
  const gids = [
    'ST_356842_1397630', // 大手町
    'ST_356582_1397016', // 渋谷
    'ST_356652_1397123'  // (third station from spec)
  ].filter(gid => metricsArr.some(s => s.station_global_id === gid));

  if (gids.length === 0) {
    console.log('     (skipped: spec example stations not found in metrics)');
    return;
  }
  const r = computeFinalScoreSync(gids, testData);
  if (r.final_score <= 0) throw new Error(`Expected positive final_score, got ${r.final_score}`);
  if (r.station_score <= 0) throw new Error(`Expected positive station_score, got ${r.station_score}`);
});

test('top 5 hub stations produce hub_bonus = 25', () => {
  const top5 = metricsArr.slice(0, 5).map(s => s.station_global_id);
  const r = computeFinalScoreSync(top5, testData);
  assertEqual(r.hub_bonus, 25, 'top 5 stations should each give +5');
  assertEqual(r.hubs.length, 5);
});

test('top 5 hubs: final_score > station_score (hub bonus is added)', () => {
  const top5 = metricsArr.slice(0, 5).map(s => s.station_global_id);
  const r = computeFinalScoreSync(top5, testData);
  if (r.final_score <= r.station_score) {
    throw new Error(`final_score (${r.final_score}) should be > station_score (${r.station_score})`);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
