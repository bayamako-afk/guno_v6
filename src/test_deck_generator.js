/**
 * test_deck_generator.js
 * GUNO V6 — Test suite for deck_generator.js
 */

import { readFileSync } from 'fs';
import { generateDeckSync } from './generators/deck_generator.js';

// Load test data
const metricsData = JSON.parse(readFileSync(new URL('../data/derived/station_metrics_tokyo.json', import.meta.url)));
const linesData   = JSON.parse(readFileSync(new URL('../data/master/station_lines_tokyo.json', import.meta.url)));

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ── Suite 1: Basic structure ──────────────────────────────────────────────────
console.log('\n=== Suite 1: Basic deck structure ===');
const deck = generateDeckSync(metricsData, linesData);

assert(deck !== null && typeof deck === 'object', 'generateDeckSync returns an object');
assert(deck.deck_meta !== undefined, 'deck has deck_meta');
assert(deck.cards !== undefined, 'deck has cards');
assert(Array.isArray(deck.cards), 'cards is an array');

// ── Suite 2: Deck meta ────────────────────────────────────────────────────────
console.log('\n=== Suite 2: Deck meta ===');
assert(deck.deck_meta.version === '1.0', 'deck_meta.version = "1.0"');
assert(deck.deck_meta.deck_name === 'tokyo_dynamic_v1', 'deck_meta.deck_name correct');
assert(deck.deck_meta.deck_size === 40, 'deck_meta.deck_size = 40');
assert(deck.deck_meta.generator === 'deck_generator.js', 'deck_meta.generator correct');
assert(deck.deck_meta.source_metrics === 'station_metrics_tokyo.json', 'deck_meta.source_metrics correct');

// ── Suite 3: Card count and uniqueness ────────────────────────────────────────
console.log('\n=== Suite 3: Card count and uniqueness ===');
assert(deck.cards.length === 40, `Total cards = 40 (got ${deck.cards.length})`);

const cardIds = deck.cards.map(c => c.card_id);
const uniqueCardIds = new Set(cardIds);
assert(uniqueCardIds.size === 40, 'No duplicate card_id');

const stationIds = deck.cards.map(c => c.station_global_id);
const uniqueStationIds = new Set(stationIds);
assert(uniqueStationIds.size === 40, 'No duplicate station_global_id');

// ── Suite 4: Card format ──────────────────────────────────────────────────────
console.log('\n=== Suite 4: Card format ===');
const firstCard = deck.cards[0];
assert(firstCard.card_id === 'card_001', 'First card_id = "card_001"');
assert(typeof firstCard.station_global_id === 'string', 'card has station_global_id (string)');
assert(typeof firstCard.station_name === 'string', 'card has station_name (string)');
assert(typeof firstCard.station_slug === 'string', 'card has station_slug (string)');
assert(typeof firstCard.score_total === 'number', 'card has score_total (number)');
assert(typeof firstCard.rank === 'number', 'card has rank (number)');
assert(typeof firstCard.rarity === 'string', 'card has rarity (string)');
assert(['Legendary','Epic','Rare','Common'].includes(firstCard.rarity), 'card rarity is valid');

// card_id format check
deck.cards.forEach((c, i) => {
  const expectedId = `card_${String(i + 1).padStart(3, '0')}`;
  if (c.card_id !== expectedId) {
    console.log(`  ❌ FAIL: card_id[${i}] expected ${expectedId}, got ${c.card_id}`);
    failed++;
  }
});
console.log(`  ✅ PASS: All card_ids follow card_NNN format`);
passed++;

// ── Suite 5: Rarity composition ───────────────────────────────────────────────
console.log('\n=== Suite 5: Rarity composition ===');
const rarityCounts = { Legendary: 0, Epic: 0, Rare: 0, Common: 0 };
deck.cards.forEach(c => rarityCounts[c.rarity]++);
console.log('  Rarity counts:', rarityCounts);

assert(rarityCounts.Legendary === 1, `Legendary = 1 (got ${rarityCounts.Legendary})`);
// Epic: target 9, but only 12 available. Should get 9 or more if shortage cascade needed.
assert(rarityCounts.Epic >= 9, `Epic >= 9 (got ${rarityCounts.Epic})`);
// Rare: target 10, but only 3 available. Shortage should cascade to Common.
assert(rarityCounts.Rare >= 3, `Rare >= 3 (got ${rarityCounts.Rare})`);
assert(rarityCounts.Common >= 0, `Common >= 0 (got ${rarityCounts.Common})`);
assert(rarityCounts.Legendary + rarityCounts.Epic + rarityCounts.Rare + rarityCounts.Common === 40, 'Total = 40');

// ── Suite 6: Sorting ──────────────────────────────────────────────────────────
console.log('\n=== Suite 6: Sorting ===');
let isSortedByScore = true;
for (let i = 0; i < deck.cards.length - 1; i++) {
  if (deck.cards[i].score_total < deck.cards[i + 1].score_total) {
    isSortedByScore = false;
    break;
  }
}
assert(isSortedByScore, 'Cards sorted by score_total descending');
assert(deck.cards[0].station_name === '大手町', `First card is 大手町 (got ${deck.cards[0].station_name})`);

// ── Suite 7: Legendary station ────────────────────────────────────────────────
console.log('\n=== Suite 7: Legendary station ===');
const legendaryCards = deck.cards.filter(c => c.rarity === 'Legendary');
assert(legendaryCards.length === 1, 'Exactly 1 Legendary card');
assert(legendaryCards[0].station_name === '大手町', 'Legendary card is 大手町');
assert(legendaryCards[0].score_total >= 14, 'Legendary card score >= 14');

// ── Suite 8: Custom config ────────────────────────────────────────────────────
console.log('\n=== Suite 8: Custom config ===');
const customDeck = generateDeckSync(metricsData, linesData, {
  deckSize: 20,
  rarityTargets: { Legendary: 1, Epic: 5, Rare: 5, Common: 9 },
  deckName: 'test_custom_deck',
  version: '2.0'
});
assert(customDeck.cards.length === 20, `Custom deckSize=20 (got ${customDeck.cards.length})`);
assert(customDeck.deck_meta.deck_name === 'test_custom_deck', 'Custom deck_name applied');
assert(customDeck.deck_meta.version === '2.0', 'Custom version applied');

// ── Suite 9: Error handling ───────────────────────────────────────────────────
console.log('\n=== Suite 9: Error handling ===');
let threwOnNull = false;
try {
  generateDeckSync(null, null);
} catch (e) {
  threwOnNull = true;
}
assert(threwOnNull, 'generateDeckSync throws on null metrics');

// Without lines data (diversity disabled)
const deckNoLines = generateDeckSync(metricsData, null);
assert(deckNoLines.cards.length === 40, 'generateDeckSync works without lines data');

// ── Suite 10: Diversity check ─────────────────────────────────────────────────
console.log('\n=== Suite 10: Diversity check ===');
// Build line counts from the generated deck
const lineCountsInDeck = {};
deck.cards.forEach(card => {
  const lines = linesData.filter(l => l.station_global_id === card.station_global_id).map(l => l.line_name);
  lines.forEach(line => {
    lineCountsInDeck[line] = (lineCountsInDeck[line] || 0) + 1;
  });
});
const maxLineCount = Math.max(...Object.values(lineCountsInDeck));
console.log('  Line distribution:', lineCountsInDeck);
console.log('  Max single line count:', maxLineCount);
assert(maxLineCount <= 15, `No single line dominates excessively (max=${maxLineCount})`);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n──────────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('✅ All tests passed.');
} else {
  console.log('❌ Some tests failed.');
  process.exit(1);
}
