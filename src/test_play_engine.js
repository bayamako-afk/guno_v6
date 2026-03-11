/**
 * GUNO V6 - Play Engine Tests
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  createInitialGameState,
  canPlayCard,
  choosePlayableCard,
  playTurn,
  scoreFinishedGame,
  runGameSimulation
} from './core/play_engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');

// Load data
const stationMetrics = JSON.parse(readFileSync(join(dataDir, 'derived/station_metrics_tokyo.json'), 'utf8'));
const stationLines = JSON.parse(readFileSync(join(dataDir, 'master/station_lines_tokyo.json'), 'utf8'));
const stationGraph = JSON.parse(readFileSync(join(dataDir, 'graph/station_graph_tokyo.json'), 'utf8'));
const linesMaster = JSON.parse(readFileSync(join(dataDir, 'master/lines_tokyo_master.json'), 'utf8'));
const deckData = JSON.parse(readFileSync(join(dataDir, 'decks/deck_tokyo_v1.json'), 'utf8'));

const deck = deckData.cards;
const players = [
  { id: 'P1' },
  { id: 'P2' },
  { id: 'P3' },
  { id: 'P4' }
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// ─────────────────────────────────────────────
// Suite 1: createInitialGameState
// ─────────────────────────────────────────────
console.log('\n=== Suite 1: createInitialGameState ===');
const state = createInitialGameState(deck, players);

assert(state.players.length === 4, '4 players initialized');
assert(state.players[0].hand.length === 5, 'P1 has 5 cards in hand');
assert(state.players[1].hand.length === 5, 'P2 has 5 cards in hand');
assert(state.players[2].hand.length === 5, 'P3 has 5 cards in hand');
assert(state.players[3].hand.length === 5, 'P4 has 5 cards in hand');
assert(state.currentCard !== null, 'currentCard is set');
assert(state.discardPile.length === 1, 'discardPile has 1 card (currentCard)');
assert(state.deck.length === 40 - 20 - 1, `deck has ${40 - 20 - 1} cards remaining`);
assert(state.turnIndex === 0, 'turnIndex starts at 0');
assert(state.gameOver === false, 'gameOver is false');
assert(state.turnCount === 0, 'turnCount starts at 0');
assert(state.winner === null, 'winner is null');

// No player owns the initial currentCard
const allOwnedStations = state.players.flatMap(p => p.ownedStations);
assert(allOwnedStations.length === 0, 'No stations owned at start');

// ─────────────────────────────────────────────
// Suite 2: canPlayCard - Same station (Condition C)
// ─────────────────────────────────────────────
console.log('\n=== Suite 2: canPlayCard - Condition C (same station) ===');
const cardA = { station_global_id: 'ST_356842_1397630', station_name: '大手町', score_total: 18.36, card_id: 'c1' };
const cardB = { station_global_id: 'ST_356842_1397630', station_name: '大手町', score_total: 18.36, card_id: 'c2' };
assert(canPlayCard(cardA, cardB, stationGraph, stationLines), 'Same station can be played');

// ─────────────────────────────────────────────
// Suite 3: canPlayCard - Same line (Condition A)
// ─────────────────────────────────────────────
console.log('\n=== Suite 3: canPlayCard - Condition A (same line) ===');
// 大手町 (ST_356842_1397630) and 銀座 (ST_356582_1397016) are both on Ginza Line (G)
const otemachi = { station_global_id: 'ST_356842_1397630', station_name: '大手町', score_total: 18.36, card_id: 'c_otemachi' };
const ginza = { station_global_id: 'ST_356582_1397016', station_name: '銀座', score_total: 7.5, card_id: 'c_ginza' };

// Check if they share a line
const otemachi_lines = stationLines.filter(sl => sl.station_global_id === otemachi.station_global_id).map(sl => sl.line_id);
const ginza_lines = stationLines.filter(sl => sl.station_global_id === ginza.station_global_id).map(sl => sl.line_id);
const sharedLines = otemachi_lines.filter(l => ginza_lines.includes(l));
console.log(`  Info: 大手町 lines: ${otemachi_lines.join(', ')}`);
console.log(`  Info: 銀座 lines: ${ginza_lines.join(', ')}`);
console.log(`  Info: Shared lines: ${sharedLines.join(', ')}`);
assert(sharedLines.length > 0, '大手町 and 銀座 share a line (Ginza Line G)');
assert(canPlayCard(otemachi, ginza, stationGraph, stationLines), '大手町 → 銀座 can be played (same line)');

// ─────────────────────────────────────────────
// Suite 4: canPlayCard - Adjacent station (Condition B)
// ─────────────────────────────────────────────
console.log('\n=== Suite 4: canPlayCard - Condition B (adjacent station) ===');
// Find an adjacent pair from the graph
const sampleEdge = stationGraph.edges[0];
const fromId = sampleEdge.from;
const toId = sampleEdge.to;
const fromCard = { station_global_id: fromId, card_id: 'adj_from', score_total: 5 };
const toCard = { station_global_id: toId, card_id: 'adj_to', score_total: 5 };
console.log(`  Info: Testing adjacent pair: ${sampleEdge.from} → ${sampleEdge.to} (${sampleEdge.line_name})`);
assert(canPlayCard(fromCard, toCard, stationGraph, stationLines), 'Adjacent stations can be played');
assert(canPlayCard(toCard, fromCard, stationGraph, stationLines), 'Adjacent stations (reverse) can be played');

// ─────────────────────────────────────────────
// Suite 5: canPlayCard - Non-playable
// ─────────────────────────────────────────────
console.log('\n=== Suite 5: canPlayCard - Non-playable ===');
// Find two stations that are NOT adjacent and NOT on the same line
// 大手町 (G, M, T, Z) and a station that shares none of those lines
// 山手線 only: 東京 (JY, T) - shares T with 大手町, so skip
// Let's find a station only on JY (Yamanote) that doesn't share lines with 大手町
// 大手町 lines: G, M, T, Z
// 高田馬場 is on JY and S (Seibu) - JY not shared with 大手町 lines G/M/T/Z
// But we need to verify dynamically
const otemachi_line_ids = stationLines
  .filter(sl => sl.station_global_id === 'ST_356842_1397630')
  .map(sl => sl.line_id);
console.log(`  Info: 大手町 line_ids: ${otemachi_line_ids.join(', ')}`);

// Find a station not on any of 大手町's lines and not adjacent
const metricsArr = Array.isArray(stationMetrics) ? stationMetrics : stationMetrics.stations;
let nonPlayableStation = null;
for (const s of metricsArr) {
  const sid = s.station_global_id;
  if (sid === 'ST_356842_1397630') continue;
  const sLines = stationLines.filter(sl => sl.station_global_id === sid).map(sl => sl.line_id);
  const sharesLine = sLines.some(l => otemachi_line_ids.includes(l));
  if (sharesLine) continue;
  // Check not adjacent
  const isAdj = stationGraph.edges.some(e =>
    (e.from === 'ST_356842_1397630' && e.to === sid) ||
    (e.from === sid && e.to === 'ST_356842_1397630')
  );
  if (!isAdj) {
    nonPlayableStation = { station_global_id: sid, station_name: s.station_name, card_id: 'non_play', score_total: s.score_total };
    break;
  }
}
if (nonPlayableStation) {
  console.log(`  Info: Non-playable station: ${nonPlayableStation.station_name} (${nonPlayableStation.station_global_id})`);
  assert(!canPlayCard(otemachi, nonPlayableStation, stationGraph, stationLines), `大手町 → ${nonPlayableStation.station_name} cannot be played (no shared line, not adjacent)`);
} else {
  console.log('  ⚠️  Could not find a non-playable station (all stations share a line or are adjacent)');
  passed++; // skip
}

// ─────────────────────────────────────────────
// Suite 6: choosePlayableCard
// ─────────────────────────────────────────────
console.log('\n=== Suite 6: choosePlayableCard ===');
const mockPlayer = { id: 'P1', hand: [], ownedStations: [] };
const mockCards = [
  { card_id: 'c1', score_total: 5.0, station_name: 'A' },
  { card_id: 'c2', score_total: 12.0, station_name: 'B' },
  { card_id: 'c3', score_total: 8.5, station_name: 'C' }
];
const chosen = choosePlayableCard(mockPlayer, mockCards);
assert(chosen.card_id === 'c2', 'choosePlayableCard selects highest score_total');
assert(choosePlayableCard(mockPlayer, []) === null, 'choosePlayableCard returns null for empty array');

// ─────────────────────────────────────────────
// Suite 7: runGameSimulation
// ─────────────────────────────────────────────
console.log('\n=== Suite 7: runGameSimulation ===');
const simResult = runGameSimulation({
  deck: [...deck],
  players: [...players],
  stationGraph,
  stationLines,
  stationMetrics,
  linesMaster
});

assert(typeof simResult.winner === 'string', `winner is a string: ${simResult.winner}`);
assert(typeof simResult.turns === 'number', `turns is a number: ${simResult.turns}`);
assert(simResult.turns > 0, `turns > 0 (${simResult.turns})`);
assert(simResult.turns <= 100, `turns <= 100 (${simResult.turns})`);
assert(Array.isArray(simResult.results), 'results is an array');
assert(simResult.results.length === 4, 'results has 4 entries');
assert(['P1', 'P2', 'P3', 'P4'].includes(simResult.winner), `winner is a valid player: ${simResult.winner}`);

for (const r of simResult.results) {
  assert(typeof r.finalScore === 'number', `${r.playerId} finalScore is a number (${r.finalScore})`);
  assert(typeof r.stationScore === 'number', `${r.playerId} stationScore is a number`);
  assert(typeof r.routeBonus === 'number', `${r.playerId} routeBonus is a number`);
  assert(typeof r.hubBonus === 'number', `${r.playerId} hubBonus is a number`);
  assert(r.stationCount >= 0, `${r.playerId} stationCount >= 0 (${r.stationCount})`);
}

// ─────────────────────────────────────────────
// Suite 8: Multiple simulations for stability
// ─────────────────────────────────────────────
console.log('\n=== Suite 8: Multiple simulations (stability) ===');
let allCompleted = true;
let winners = { P1: 0, P2: 0, P3: 0, P4: 0 };
for (let i = 0; i < 10; i++) {
  try {
    const r = runGameSimulation({
      deck: [...deck],
      players: [...players],
      stationGraph,
      stationLines,
      stationMetrics,
      linesMaster
    });
    winners[r.winner] = (winners[r.winner] || 0) + 1;
  } catch (e) {
    allCompleted = false;
    console.log(`  ❌ Simulation ${i + 1} threw error: ${e.message}`);
  }
}
assert(allCompleted, '10 simulations all completed without error');
console.log(`  Info: Win distribution over 10 games: ${JSON.stringify(winners)}`);

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All tests passed.');
} else {
  console.log(`❌ ${failed} test(s) failed.`);
  process.exit(1);
}
