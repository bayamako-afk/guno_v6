/**
 * test_station_rarity.js
 * GUNO V6 — Unit tests for station_rarity.js
 */

import { readFile } from 'fs/promises';
import { getStationRaritySync, classifyAllStationsSync } from './scoring/station_rarity.js';

// ─── Test Utilities ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertEq(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    console.error(`     Expected: ${JSON.stringify(expected)}`);
    console.error(`     Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Load Test Data ───────────────────────────────────────────────────────────

const metricsRaw = await readFile('data/derived/station_metrics_tokyo.json', 'utf-8');
const stationMetrics = JSON.parse(metricsRaw);

// ─── Test Suite 1: getRarityTier (via getStationRaritySync) ──────────────────

console.log('\n=== Suite 1: Rarity tier classification ===');

// Legendary: 大手町 (score_total = 18.3609)
const otemachi = getStationRaritySync('ST_356842_1397630', stationMetrics);
assert(otemachi !== null, '大手町 should be found');
assertEq(otemachi.rarity, 'Legendary', '大手町 (18.36) → Legendary');
assertEq(otemachi.station_name, '大手町', '大手町 name matches');
assertEq(otemachi.station_slug, 'otemachi', '大手町 slug matches');
assertEq(otemachi.rank, 1, '大手町 rank = 1');

// Epic: 渋谷 (score_total = 12.9084)
const shibuya = getStationRaritySync('ST_356582_1397016', stationMetrics);
assert(shibuya !== null, '渋谷 should be found');
assertEq(shibuya.rarity, 'Epic', '渋谷 (12.91) → Epic');
assertEq(shibuya.station_name, '渋谷', '渋谷 name matches');
assertEq(shibuya.rank, 2, '渋谷 rank = 2');

// Epic: 赤坂見附 (score_total = 11.2068)
const akasaka = getStationRaritySync('ST_356796_1397361', stationMetrics);
assert(akasaka !== null, '赤坂見附 should be found');
assertEq(akasaka.rarity, 'Epic', '赤坂見附 (11.21) → Epic');

// ─── Test Suite 2: Boundary conditions ───────────────────────────────────────

console.log('\n=== Suite 2: Boundary conditions ===');

// Find stations near thresholds
const allClassified = classifyAllStationsSync(stationMetrics);

// score >= 14 → Legendary
const legendaries = allClassified.filter(s => s.rarity === 'Legendary');
assert(legendaries.length === 1, 'Exactly 1 Legendary station');
assert(legendaries[0].score_total >= 14, 'Legendary station has score >= 14');

// score >= 11 → Epic
const epics = allClassified.filter(s => s.rarity === 'Epic');
assert(epics.length === 12, 'Exactly 12 Epic stations');
assert(epics.every(s => s.score_total >= 11 && s.score_total < 14), 'All Epic stations have 11 <= score < 14');

// score >= 8 → Rare
const rares = allClassified.filter(s => s.rarity === 'Rare');
assert(rares.length === 3, 'Exactly 3 Rare stations');
assert(rares.every(s => s.score_total >= 8 && s.score_total < 11), 'All Rare stations have 8 <= score < 11');

// score < 8 → Common
const commons = allClassified.filter(s => s.rarity === 'Common');
assert(commons.length === 70, 'Exactly 70 Common stations');
assert(commons.every(s => s.score_total < 8), 'All Common stations have score < 8');

// ─── Test Suite 3: Return format ──────────────────────────────────────────────

console.log('\n=== Suite 3: Return format ===');

const sample = getStationRaritySync('ST_356842_1397630', stationMetrics);
assert('station_global_id' in sample, 'Result has station_global_id');
assert('station_name' in sample, 'Result has station_name');
assert('station_slug' in sample, 'Result has station_slug');
assert('score_total' in sample, 'Result has score_total');
assert('rank' in sample, 'Result has rank');
assert('rarity' in sample, 'Result has rarity');
assert(typeof sample.score_total === 'number', 'score_total is a number');
assert(typeof sample.rank === 'number', 'rank is a number');
assert(typeof sample.rarity === 'string', 'rarity is a string');

// ─── Test Suite 4: classifyAllStationsSync ────────────────────────────────────

console.log('\n=== Suite 4: classifyAllStationsSync ===');

assert(Array.isArray(allClassified), 'classifyAllStationsSync returns an array');
assertEq(allClassified.length, 86, 'classifyAllStationsSync returns all 86 stations');

// Sorted by score_total desc
let isSorted = true;
for (let i = 0; i < allClassified.length - 1; i++) {
  if (allClassified[i].score_total < allClassified[i + 1].score_total) {
    isSorted = false;
    break;
  }
}
assert(isSorted, 'classifyAllStationsSync is sorted by score_total desc');

// First station should be 大手町
assertEq(allClassified[0].station_name, '大手町', 'First station is 大手町');
assertEq(allClassified[0].rarity, 'Legendary', 'First station is Legendary');

// Last station should be Common
assertEq(allClassified[allClassified.length - 1].rarity, 'Common', 'Last station is Common');

// All stations have required fields
const requiredFields = ['station_global_id', 'station_name', 'station_slug', 'score_total', 'rank', 'rarity'];
const allHaveFields = allClassified.every(s => requiredFields.every(f => f in s));
assert(allHaveFields, 'All stations have required fields');

// ─── Test Suite 5: Error handling ────────────────────────────────────────────

console.log('\n=== Suite 5: Error handling ===');

// Unknown station ID returns null
const unknown = getStationRaritySync('ST_UNKNOWN_0000000', stationMetrics);
assertEq(unknown, null, 'Unknown station ID returns null');

// Invalid metrics returns null
const invalidResult = getStationRaritySync('ST_356842_1397630', null);
assertEq(invalidResult, null, 'Null metrics returns null');

// Invalid metrics for classifyAll returns empty array
const emptyResult = classifyAllStationsSync(null);
assertEq(emptyResult, [], 'classifyAllStationsSync with null returns empty array');

const noStationsResult = classifyAllStationsSync({ dataset_meta: {} });
assertEq(noStationsResult, [], 'classifyAllStationsSync with no stations returns empty array');

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All tests passed.');
} else {
  console.error(`❌ ${failed} test(s) failed.`);
  process.exit(1);
}
