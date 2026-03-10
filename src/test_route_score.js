/**
 * test_route_score.js
 * Unit tests for route_completion_score.js (Node.js / ES module)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeRouteScoreSync, getBonusValues } from './scoring/route_completion_score.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Load data
const stationLines = JSON.parse(
  readFileSync(join(__dirname, '../data/master/station_lines_tokyo.json'), 'utf8')
);
const linesMaster = JSON.parse(
  readFileSync(join(__dirname, '../data/master/lines_tokyo_master.json'), 'utf8')
);

// Build helper: get all station_global_ids for a given line_id
function getLineStations(lineId) {
  return stationLines
    .filter(r => r.line_id === lineId)
    .map(r => r.station_global_id);
}

let passed = 0;
let failed = 0;

function assert(label, condition, got) {
  if (condition) {
    console.log('  PASS: ' + label);
    passed++;
  } else {
    console.log('  FAIL: ' + label + ' -> got: ' + JSON.stringify(got));
    failed++;
  }
}

// ── Test 1: Empty input ───────────────────────────────────────────────────────
console.log('\n[Test 1] Empty player stations');
{
  const result = computeRouteScoreSync([], stationLines, linesMaster);
  assert('route_bonus === 0', result.route_bonus === 0, result.route_bonus);
  assert('completed_routes is empty', result.completed_routes.length === 0, result.completed_routes);
  assert('partial_routes is empty', result.partial_routes.length === 0, result.partial_routes);
}

// ── Test 2: Full Ginza Line (18 stations → FULL_ROUTE_BONUS = 20) ─────────────
console.log('\n[Test 2] Full Ginza Line (18 stations)');
{
  const ginzaStations = getLineStations('G');
  console.log('  Ginza stations: ' + ginzaStations.length);
  const result = computeRouteScoreSync(ginzaStations, stationLines, linesMaster);
  const ginzaDetail = result.route_details.find(function(d) { return d.line_id === 'G'; });
  assert('Ginza status === complete', ginzaDetail && ginzaDetail.status === 'complete', ginzaDetail);
  assert('Ginza bonus === 20', ginzaDetail && ginzaDetail.bonus === 20, ginzaDetail && ginzaDetail.bonus);
  assert('completed_routes includes Ginza Line',
    result.completed_routes.includes('Ginza Line'), result.completed_routes);
  assert('partial_routes is empty', result.partial_routes.length === 0, result.partial_routes);
}

// ── Test 3: Partial Ginza Line (9 of 18 → PARTIAL_ROUTE_BONUS = 5) ───────────
console.log('\n[Test 3] Partial Ginza Line (9 of 18 stations = exactly 50%)');
{
  // Use only pure Ginza stations (no transfer stations to avoid cross-line counting)
  // Get 9 Ginza-only stations (not transfer stations)
  const ginzaOnly = stationLines
    .filter(function(r) { return r.line_id === 'G' && !r.is_transfer_station; })
    .map(function(r) { return r.station_global_id; });
  console.log('  Ginza non-transfer stations available: ' + ginzaOnly.length);
  // Use 9 stations total: mix of transfer and non-transfer, all Ginza
  const ginzaNine = getLineStations('G').slice(0, 9);
  const result = computeRouteScoreSync(ginzaNine, stationLines, linesMaster);
  const ginzaDetail = result.route_details.find(function(d) { return d.line_id === 'G'; });
  assert('Ginza count === 9', ginzaDetail && ginzaDetail.count === 9, ginzaDetail && ginzaDetail.count);
  assert('Ginza status === partial', ginzaDetail && ginzaDetail.status === 'partial', ginzaDetail && ginzaDetail.status);
  assert('Ginza bonus === 5', ginzaDetail && ginzaDetail.bonus === 5, ginzaDetail && ginzaDetail.bonus);
  assert('partial_routes includes Ginza Line',
    result.partial_routes.includes('Ginza Line'), result.partial_routes);
  assert('completed_routes is empty', result.completed_routes.length === 0, result.completed_routes);
}

// ── Test 4: Below threshold Ginza (8 of 18 → no bonus) ───────────────────────
console.log('\n[Test 4] Below threshold Ginza Line (8 of 18 stations)');
{
  const ginzaEight = getLineStations('G').slice(0, 8);
  const result = computeRouteScoreSync(ginzaEight, stationLines, linesMaster);
  const ginzaDetail = result.route_details.find(function(d) { return d.line_id === 'G'; });
  assert('Ginza count === 8', ginzaDetail && ginzaDetail.count === 8, ginzaDetail && ginzaDetail.count);
  assert('Ginza status === none', ginzaDetail && ginzaDetail.status === 'none', ginzaDetail && ginzaDetail.status);
  assert('Ginza bonus === 0', ginzaDetail && ginzaDetail.bonus === 0, ginzaDetail && ginzaDetail.bonus);
}

// ── Test 5: Full Hanzomon Line (14 stations → route_total >= 10 → FULL = 20) ──
// Note: getBonusValues(14) returns full=20 because 14 >= 10
console.log('\n[Test 5] Full Hanzomon Line (14 stations, getBonusValues(14).full = 20)');
{
  const hanzoStations = getLineStations('Z');
  console.log('  Hanzomon stations: ' + hanzoStations.length);
  const result = computeRouteScoreSync(hanzoStations, stationLines, linesMaster);
  const hanzoDetail = result.route_details.find(function(d) { return d.line_id === 'Z'; });
  assert('Hanzomon status === complete', hanzoDetail && hanzoDetail.status === 'complete', hanzoDetail && hanzoDetail.status);
  assert('Hanzomon bonus === 20 (route_total=14 >= 10)', hanzoDetail && hanzoDetail.bonus === 20, hanzoDetail && hanzoDetail.bonus);
  assert('completed_routes includes Hanzomon Line',
    result.completed_routes.includes('Hanzomon Line'), result.completed_routes);
}

// ── Test 6: Full Yamanote Line (30 stations → FULL_ROUTE_BONUS = 20) ─────────
console.log('\n[Test 6] Full Yamanote Line (30 stations)');
{
  const jyStations = getLineStations('JY');
  const result = computeRouteScoreSync(jyStations, stationLines, linesMaster);
  const jyDetail = result.route_details.find(function(d) { return d.line_id === 'JY'; });
  assert('Yamanote status === complete', jyDetail && jyDetail.status === 'complete', jyDetail && jyDetail.status);
  assert('Yamanote bonus === 20', jyDetail && jyDetail.bonus === 20, jyDetail && jyDetail.bonus);
  assert('completed_routes includes Yamanote Line',
    result.completed_routes.includes('Yamanote Line'), result.completed_routes);
}

// ── Test 7: Multi-route (Ginza full + Hanzomon partial) ───────────────────────
// Note: Transfer stations between lines are counted on both routes.
// Ginza Line shares transfer stations with Hanzomon (e.g. 渋谷),
// so Hanzomon count may be > 8 when Ginza stations are included.
console.log('\n[Test 7] Multi-route: Ginza full + Hanzomon partial');
{
  var ginzaAll  = getLineStations('G');            // 18 → full → +20
  var hanzoHalf = getLineStations('Z').slice(0, 8); // 8 stations from Hanzomon
  var combined  = Array.from(new Set(ginzaAll.concat(hanzoHalf)));
  var result = computeRouteScoreSync(combined, stationLines, linesMaster);
  var ginzaDetail = result.route_details.find(function(d) { return d.line_id === 'G'; });
  var hanzoDetail = result.route_details.find(function(d) { return d.line_id === 'Z'; });
  // Ginza must be complete
  assert('Ginza status === complete', ginzaDetail && ginzaDetail.status === 'complete', ginzaDetail && ginzaDetail.status);
  assert('Ginza bonus === 20', ginzaDetail && ginzaDetail.bonus === 20, ginzaDetail && ginzaDetail.bonus);
  // Hanzomon must be at least partial (count >= threshold=7)
  assert('Hanzomon count >= 7', hanzoDetail && hanzoDetail.count >= 7, hanzoDetail && hanzoDetail.count);
  assert('Hanzomon status is partial or complete',
    hanzoDetail && (hanzoDetail.status === 'partial' || hanzoDetail.status === 'complete'),
    hanzoDetail && hanzoDetail.status);
  assert('completed_routes includes Ginza Line',
    result.completed_routes.includes('Ginza Line'), result.completed_routes);
}

// ── Test 8: getBonusValues boundary checks ────────────────────────────────────
console.log('\n[Test 8] getBonusValues boundary checks');
{
  var b10 = getBonusValues(10);
  assert('route_total=10 full=20', b10.full === 20, b10.full);
  assert('route_total=10 partial=5', b10.partial === 5, b10.partial);

  var b8 = getBonusValues(8);
  assert('route_total=8 full=15', b8.full === 15, b8.full);
  assert('route_total=8 partial=4', b8.partial === 4, b8.partial);

  var b6 = getBonusValues(6);
  assert('route_total=6 full=10', b6.full === 10, b6.full);
  assert('route_total=6 partial=3', b6.partial === 3, b6.partial);

  var b5 = getBonusValues(5);
  assert('route_total=5 full=0 (no bonus)', b5.full === 0, b5.full);
}

// ── Test 9: Unknown station IDs are ignored ───────────────────────────────────
console.log('\n[Test 9] Unknown station IDs are silently ignored');
{
  var result = computeRouteScoreSync(
    ['ST_UNKNOWN_001', 'ST_UNKNOWN_002'],
    stationLines, linesMaster
  );
  assert('route_bonus === 0', result.route_bonus === 0, result.route_bonus);
}

// ── Test 10: Single station (no bonus) ───────────────────────────────────────
console.log('\n[Test 10] Single station (no bonus expected)');
{
  var singleStation = getLineStations('G').slice(0, 1);
  var result = computeRouteScoreSync(singleStation, stationLines, linesMaster);
  assert('route_bonus === 0 for single station', result.route_bonus === 0, result.route_bonus);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
  console.log('All tests passed');
} else {
  console.log(failed + ' test(s) failed');
  process.exit(1);
}
