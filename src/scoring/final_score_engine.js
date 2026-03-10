/**
 * final_score_engine.js
 * GUNO V6 — Final Score Calculation Engine
 *
 * Combines station scores, route completion bonuses, and network hub bonuses
 * into a single final score.
 *
 * Usage (browser / ES module):
 *   import { computeFinalScore } from './final_score_engine.js';
 *   const result = await computeFinalScore(playerStations);
 *
 * Usage (Node.js / preloaded data):
 *   import { computeFinalScoreSync } from './final_score_engine.js';
 *   const result = computeFinalScoreSync(playerStations, { stationMetrics, stationLines, linesMaster });
 */

import { computeRouteScore, computeRouteScoreSync } from './route_completion_score.js';
import { computeHubBonus, computeHubBonusSync } from './network_hub_bonus.js';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------
const METRICS_URL = '../../data/derived/station_metrics_tokyo.json';

// ---------------------------------------------------------------------------
// Synchronous version (for preloaded data or Node.js tests)
// ---------------------------------------------------------------------------
/**
 * Compute the final score synchronously using preloaded data.
 *
 * @param {string[]} playerStations  — array of station_global_id strings
 * @param {Object} data
 * @param {Object[]|Object} data.stationMetrics — from station_metrics_tokyo.json
 * @param {Object[]} data.stationLines          — from station_lines_tokyo.json
 * @param {Object[]} data.linesMaster           — from lines_tokyo_master.json
 * @returns {Object} Final score result
 */
export function computeFinalScoreSync(playerStations, data) {
  if (!Array.isArray(playerStations) || playerStations.length === 0) {
    return {
      final_score: 0,
      station_score: 0,
      route_bonus: 0,
      hub_bonus: 0,
      routes: [],
      hubs: []
    };
  }

  // 1. Calculate station score sum
  const metrics = Array.isArray(data.stationMetrics)
    ? data.stationMetrics
    : (data.stationMetrics && data.stationMetrics.stations) || [];

  const metricsMap = new Map();
  for (const s of metrics) {
    metricsMap.set(s.station_global_id, s);
  }

  let station_score_sum = 0;
  for (const gid of playerStations) {
    const metric = metricsMap.get(gid);
    if (metric && typeof metric.score_total === 'number') {
      station_score_sum += metric.score_total;
    }
  }

  // 2. Calculate route completion bonus
  const routeResult = computeRouteScoreSync(playerStations, data.stationLines, data.linesMaster);

  // 3. Calculate hub bonus
  const hubResult = computeHubBonusSync(playerStations, data.stationMetrics);

  // 4. Combine into final score
  // Sort routes by bonus descending
  const routes = [...routeResult.route_details]
    .filter(r => r.bonus > 0)
    .sort((a, b) => b.bonus - a.bonus)
    .map(r => r.line_name_en || r.line_name);

  // Hubs are already sorted by computeHubBonusSync (bonus desc, score_total desc)
  const hubs = hubResult.hub_stations.map(h => h.station_name);

  // Build per-station detail list (all input stations, sorted by score_total desc)
  const station_details = playerStations
    .map(gid => {
      const m = metricsMap.get(gid);
      if (!m) return { station_global_id: gid, station_name: '(unknown)', score_total: 0, rank: null, unknown: true };
      return {
        station_global_id: m.station_global_id,
        station_name:      m.station_name,
        station_slug:      m.station_slug,
        score_total:       m.score_total,
        rank:              m.rank,
        line_count:        m.line_count
      };
    })
    .sort((a, b) => b.score_total - a.score_total);

  const final_score = station_score_sum + routeResult.route_bonus + hubResult.hub_bonus;

  return {
    final_score,
    station_score: station_score_sum,
    route_bonus: routeResult.route_bonus,
    hub_bonus: hubResult.hub_bonus,
    routes,
    hubs,
    route_details: routeResult.route_details,
    hub_stations:  hubResult.hub_stations,
    station_details
  };
}

// ---------------------------------------------------------------------------
// Async version (browser, uses fetch)
// ---------------------------------------------------------------------------
/**
 * Compute the final score asynchronously by fetching required JSON data.
 *
 * @param {string[]} playerStations  — array of station_global_id strings
 * @param {{ baseUrl?: string }} options
 * @returns {Promise<Object>} Final score result
 */
export async function computeFinalScore(playerStations, options = {}) {
  if (!Array.isArray(playerStations) || playerStations.length === 0) {
    return {
      final_score: 0,
      station_score: 0,
      route_bonus: 0,
      hub_bonus: 0,
      routes: [],
      hubs: []
    };
  }

  const baseUrl = options.baseUrl || '';
  
  // 1. Fetch metrics for station scores
  const metricsUrl = baseUrl
    ? `${baseUrl}data/derived/station_metrics_tokyo.json`
    : new URL(METRICS_URL, import.meta.url).href;

  let metricsData;
  try {
    const res = await fetch(metricsUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${metricsUrl}`);
    metricsData = await res.json();
  } catch (err) {
    console.error('[FinalScore] Failed to load metrics:', err.message);
    throw err;
  }

  const metrics = Array.isArray(metricsData)
    ? metricsData
    : (metricsData && metricsData.stations) || [];

  const metricsMap = new Map();
  for (const s of metrics) {
    metricsMap.set(s.station_global_id, s);
  }

  let station_score_sum = 0;
  for (const gid of playerStations) {
    const metric = metricsMap.get(gid);
    if (metric && typeof metric.score_total === 'number') {
      station_score_sum += metric.score_total;
    }
  }

  // 2. Compute Route Score (handles its own fetching)
  const routeResult = await computeRouteScore(playerStations, options);

  // 3. Compute Hub Bonus (pass pre-fetched metrics to sync version to avoid double fetch)
  const hubResult = computeHubBonusSync(playerStations, metricsData);

  // 4. Combine results
  const routes = [...routeResult.route_details]
    .filter(r => r.bonus > 0)
    .sort((a, b) => b.bonus - a.bonus)
    .map(r => r.line_name_en || r.line_name);

  const hubs = hubResult.hub_stations.map(h => h.station_name);

  // Build per-station detail list (all input stations, sorted by score_total desc)
  const station_details = playerStations
    .map(gid => {
      const m = metricsMap.get(gid);
      if (!m) return { station_global_id: gid, station_name: '(unknown)', score_total: 0, rank: null, unknown: true };
      return {
        station_global_id: m.station_global_id,
        station_name:      m.station_name,
        station_slug:      m.station_slug,
        score_total:       m.score_total,
        rank:              m.rank,
        line_count:        m.line_count
      };
    })
    .sort((a, b) => b.score_total - a.score_total);

  const final_score = station_score_sum + routeResult.route_bonus + hubResult.hub_bonus;

  return {
    final_score,
    station_score: station_score_sum,
    route_bonus: routeResult.route_bonus,
    hub_bonus: hubResult.hub_bonus,
    routes,
    hubs,
    route_details: routeResult.route_details,
    hub_stations:  hubResult.hub_stations,
    station_details
  };
}
