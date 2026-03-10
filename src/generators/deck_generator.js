/**
 * deck_generator.js
 * GUNO V6 — Dynamic Deck Generator
 *
 * Generates a playable GUNO deck from station metrics and rarity classifications.
 * Applies rarity targets and attempts to maintain route diversity.
 */

import { classifyAllStationsSync, classifyAllStations } from '../scoring/station_rarity.js';

// Default configuration for v1
const DEFAULT_CONFIG = {
  deckSize: 40,
  rarityTargets: {
    Legendary: 1,
    Epic: 9,
    Rare: 10,
    Common: 20
  },
  deckName: "tokyo_dynamic_v1",
  version: "1.0"
};

const RARITY_ORDER = ['Legendary', 'Epic', 'Rare', 'Common'];

/**
 * Generate a deck synchronously using pre-loaded data.
 * @param {Object} stationMetrics - Parsed JSON from station_metrics_tokyo.json
 * @param {Array} stationLines - Parsed JSON from station_lines_tokyo.json (optional, for diversity)
 * @param {Object} config - Optional configuration overrides
 * @returns {Object} Generated deck JSON structure
 */
export function generateDeckSync(stationMetrics, stationLines = null, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const targets = { ...finalConfig.rarityTargets };

  // 1. Classify all stations
  const allStations = classifyAllStationsSync(stationMetrics);
  if (!allStations || allStations.length === 0) {
    throw new Error("Failed to classify stations. Metrics data may be invalid.");
  }

  // Build a lookup for lines if provided
  const stationToLines = {};
  if (stationLines && Array.isArray(stationLines)) {
    stationLines.forEach(record => {
      const sid = record.station_global_id;
      if (!stationToLines[sid]) stationToLines[sid] = [];
      if (record.line_name && !stationToLines[sid].includes(record.line_name)) {
        stationToLines[sid].push(record.line_name);
      }
    });
  }

  // 2. Group stations by rarity (already sorted by score_total desc from classifyAllStationsSync)
  const grouped = {
    Legendary: allStations.filter(s => s.rarity === 'Legendary'),
    Epic:      allStations.filter(s => s.rarity === 'Epic'),
    Rare:      allStations.filter(s => s.rarity === 'Rare'),
    Common:    allStations.filter(s => s.rarity === 'Common')
  };

  const selectedStations = [];
  const lineCounts = {}; // Track how many times each line appears in the deck

  // Helper to pick a station considering diversity
  function pickNextStation(candidates) {
    if (candidates.length === 0) return null;
    
    // If no line data, just take the highest score (first item)
    if (!stationLines || stationLines.length === 0) {
      return candidates.shift();
    }

    // Diversity: limit how many times a single line can appear in the deck.
    // With 40 cards across 5 lines (~8 stations each on average), aim for ~8 per line max.
    // Use a soft cap: prefer stations whose lines are under-represented.
    // Hard cap: skip stations where ALL lines are at or above the hard limit.
    const SOFT_CAP = 6;  // prefer stations with at least one line below this
    const HARD_CAP = 10; // never let a single line exceed this count
    
    let bestIdx = -1;
    // Pass 1: find first candidate with at least one line below SOFT_CAP
    for (let i = 0; i < candidates.length; i++) {
      const lines = stationToLines[candidates[i].station_global_id] || [];
      const hasSoftRoom = lines.length === 0 || lines.some(line => (lineCounts[line] || 0) < SOFT_CAP);
      if (hasSoftRoom) { bestIdx = i; break; }
    }
    // Pass 2: if no soft-room candidate found, find first below HARD_CAP
    if (bestIdx === -1) {
      for (let i = 0; i < candidates.length; i++) {
        const lines = stationToLines[candidates[i].station_global_id] || [];
        const hasHardRoom = lines.length === 0 || lines.some(line => (lineCounts[line] || 0) < HARD_CAP);
        if (hasHardRoom) { bestIdx = i; break; }
      }
    }
    // Fallback: just take the first candidate
    if (bestIdx === -1) bestIdx = 0;

    const picked = candidates.splice(bestIdx, 1)[0];
    
    // Update line counts
    const pickedLines = stationToLines[picked.station_global_id] || [];
    pickedLines.forEach(line => {
      lineCounts[line] = (lineCounts[line] || 0) + 1;
    });

    return picked;
  }

  // 3. Select stations to meet targets, cascading shortages downward
  let carryOver = 0;

  for (const rarity of RARITY_ORDER) {
    let target = (targets[rarity] || 0) + carryOver;
    const candidates = [...grouped[rarity]]; // clone array to mutate
    
    let pickedCount = 0;
    while (pickedCount < target && candidates.length > 0) {
      const picked = pickNextStation(candidates);
      if (picked) {
        selectedStations.push(picked);
        pickedCount++;
      }
    }

    // If we couldn't meet the target, carry the shortage to the next lower rarity
    if (pickedCount < target) {
      carryOver = target - pickedCount;
    } else {
      carryOver = 0;
    }
  }

  // If we still have a shortage after Common, just grab any remaining stations by score
  if (selectedStations.length < finalConfig.deckSize) {
    const remainingNeeded = finalConfig.deckSize - selectedStations.length;
    const allRemaining = allStations.filter(s => !selectedStations.some(sel => sel.station_global_id === s.station_global_id));
    
    for (let i = 0; i < remainingNeeded && allRemaining.length > 0; i++) {
      selectedStations.push(pickNextStation(allRemaining));
    }
  }

  // 4. Final sorting and card generation
  // Sort the final deck by score_total descending
  selectedStations.sort((a, b) => b.score_total - a.score_total);

  // Truncate if we somehow overshot (shouldn't happen with the logic above, but safe)
  const finalCards = selectedStations.slice(0, finalConfig.deckSize).map((s, index) => {
    return {
      card_id: `card_${String(index + 1).padStart(3, '0')}`,
      station_global_id: s.station_global_id,
      station_name: s.station_name,
      station_slug: s.station_slug,
      score_total: s.score_total,
      rank: s.rank,
      rarity: s.rarity
    };
  });

  // 5. Build final deck object
  return {
    deck_meta: {
      version: finalConfig.version,
      deck_name: finalConfig.deckName,
      deck_size: finalCards.length,
      generator: "deck_generator.js",
      source_metrics: "station_metrics_tokyo.json"
    },
    cards: finalCards
  };
}

/**
 * Generate a deck asynchronously by fetching data files.
 * @param {Object} options - Options including baseUrl and config overrides
 * @returns {Promise<Object>} Generated deck JSON structure
 */
export async function generateDeck(options = {}) {
  const baseUrl = options.baseUrl || '';
  
  // Resolve URLs
  const metricsUrl = baseUrl ? (baseUrl.endsWith('/') ? baseUrl : baseUrl + '/') + 'data/derived/station_metrics_tokyo.json' : '../data/derived/station_metrics_tokyo.json';
  const linesUrl = baseUrl ? (baseUrl.endsWith('/') ? baseUrl : baseUrl + '/') + 'data/master/station_lines_tokyo.json' : '../data/master/station_lines_tokyo.json';

  try {
    // Fetch metrics (required)
    const metricsRes = await fetch(metricsUrl);
    if (!metricsRes.ok) throw new Error(`Failed to load metrics: ${metricsRes.status}`);
    const metricsData = await metricsRes.json();

    // Fetch lines (optional, for diversity)
    let linesData = null;
    try {
      const linesRes = await fetch(linesUrl);
      if (linesRes.ok) {
        linesData = await linesRes.json();
      }
    } catch (e) {
      console.warn("Could not load station_lines_tokyo.json for diversity control. Proceeding without it.");
    }

    return generateDeckSync(metricsData, linesData, options.config || {});
  } catch (error) {
    console.error("generateDeck error:", error);
    throw error;
  }
}

/**
 * Helper to generate a deck from a specific config (wrapper around generateDeck)
 * @param {Object} config - Configuration object
 * @param {Object} options - Additional options like baseUrl
 * @returns {Promise<Object>}
 */
export async function generateDeckFromConfig(config, options = {}) {
  return generateDeck({ ...options, config });
}
