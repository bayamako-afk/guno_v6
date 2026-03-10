/**
 * network_hub_bonus.js
 * GUNO V6 — Hub Station Bonus Scoring Module
 *
 * Rewards players for collecting high-value hub stations.
 * Data source: data/derived/station_metrics_tokyo.json
 *
 * Exports:
 *   computeHubBonus(playerStations)           — async (fetch)
 *   computeHubBonusSync(playerStations, stationMetrics) — sync
 *   getHubBonusValue(scoreTotal)              — bonus lookup
 */

// ---------------------------------------------------------------------------
// Path resolution
// This file lives at: guno_v6/src/scoring/network_hub_bonus.js
// Data lives at:      guno_v6/data/derived/station_metrics_tokyo.json
// Relative path from this file: ../../data/derived/station_metrics_tokyo.json
// ---------------------------------------------------------------------------
const METRICS_URL = '../../data/derived/station_metrics_tokyo.json';

// ---------------------------------------------------------------------------
// Bonus rules (v1)
// ---------------------------------------------------------------------------
/**
 * Return the hub bonus value for a given score_total.
 * @param {number} scoreTotal
 * @returns {number} bonus points
 */
export function getHubBonusValue(scoreTotal) {
  if (scoreTotal >= 12) return 5;
  if (scoreTotal >= 10) return 3;
  if (scoreTotal >= 8)  return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Synchronous version (for preloaded metrics or Node.js tests)
// ---------------------------------------------------------------------------
/**
 * Compute hub bonus synchronously using preloaded metrics array.
 *
 * @param {string[]} playerStations  — array of station_global_id strings
 * @param {Object[]|Object} stationMetrics — array of station metric objects,
 *        OR the full JSON object { dataset_meta, stations: [] }
 * @returns {{ hub_bonus: number, hub_stations: Object[] }}
 */
export function computeHubBonusSync(playerStations, stationMetrics) {
  // Accept both raw array and wrapped { stations: [] } format
  const stations = Array.isArray(stationMetrics)
    ? stationMetrics
    : (stationMetrics && stationMetrics.stations) || [];

  // Build lookup map: station_global_id → metric object
  const metricsMap = new Map();
  for (const s of stations) {
    metricsMap.set(s.station_global_id, s);
  }

  let hub_bonus = 0;
  const hub_stations = [];

  for (const gid of playerStations) {
    const metric = metricsMap.get(gid);
    if (!metric) continue; // unknown station — skip safely

    const bonus = getHubBonusValue(metric.score_total);
    if (bonus > 0) {
      hub_bonus += bonus;
      hub_stations.push({
        station_global_id: metric.station_global_id,
        station_name:      metric.station_name,
        station_slug:      metric.station_slug,
        rank:              metric.rank,
        score_total:       metric.score_total,
        hub_score:         metric.hub_score,
        line_count:        metric.line_count,
        bonus
      });
    }
  }

  // Sort: bonus desc, then score_total desc
  hub_stations.sort((a, b) =>
    b.bonus !== a.bonus ? b.bonus - a.bonus : b.score_total - a.score_total
  );

  return { hub_bonus, hub_stations };
}

// ---------------------------------------------------------------------------
// Async version (browser, uses fetch)
// ---------------------------------------------------------------------------
/**
 * Compute hub bonus asynchronously by fetching metrics JSON.
 *
 * @param {string[]} playerStations  — array of station_global_id strings
 * @param {{ baseUrl?: string }} options
 *   baseUrl: override the base URL for data fetching.
 *            When called from debug/ use baseUrl = '../'
 *            When called from src/  use baseUrl = '../../' (default)
 * @returns {Promise<{ hub_bonus: number, hub_stations: Object[] }>}
 */
export async function computeHubBonus(playerStations, options = {}) {
  const baseUrl = options.baseUrl || '';
  const metricsUrl = baseUrl
    ? `${baseUrl}data/derived/station_metrics_tokyo.json`
    : new URL(METRICS_URL, import.meta.url).href;

  console.log('[HubBonus] Fetching metrics from:', metricsUrl);

  let metricsData;
  try {
    const res = await fetch(metricsUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — ${metricsUrl}`);
    }
    metricsData = await res.json();
  } catch (err) {
    console.error('[HubBonus] Failed to load metrics:', err.message);
    throw err;
  }

  console.log('[HubBonus] Loaded metrics for', (metricsData.stations || metricsData).length, 'stations');

  const result = computeHubBonusSync(playerStations, metricsData);

  console.log('[HubBonus] hub_bonus:', result.hub_bonus);
  console.log('[HubBonus] hub_stations count:', result.hub_stations.length);

  return result;
}
