/**
 * route_completion_score.js
 * GUNO V6 — Route Completion Scoring Module
 *
 * Rewards players for collecting stations from the same route.
 * Designed to encourage strategic network-based play.
 *
 * Usage (browser / ES module):
 *   import { computeRouteScore } from './route_completion_score.js';
 *   const result = await computeRouteScore(playerStations);
 *
 * Usage (Node.js / CommonJS):
 *   const { computeRouteScore } = require('./route_completion_score.js');
 */

'use strict';

// ── Data paths ───────────────────────────────────────────────────────────────
// Default paths are relative to this file's location (src/scoring/ → ../../data/master/)
// When calling from debug/, pass baseUrl: location.href to resolve correctly.
const DEFAULT_STATION_LINES_PATH = '../../data/master/station_lines_tokyo.json';
const DEFAULT_LINES_MASTER_PATH  = '../../data/master/lines_tokyo_master.json';

function resolveDataUrls(baseUrl) {
  if (baseUrl) {
    return {
      stationLinesUrl: new URL('../data/master/station_lines_tokyo.json', baseUrl).href,
      linesMasterUrl:  new URL('../data/master/lines_tokyo_master.json', baseUrl).href
    };
  }
  return {
    stationLinesUrl: DEFAULT_STATION_LINES_PATH,
    linesMasterUrl:  DEFAULT_LINES_MASTER_PATH
  };
}

// ── Bonus table ───────────────────────────────────────────────────────────────
/**
 * Look up bonus values based on route_total (number of stations on the route).
 * @param {number} routeTotal
 * @returns {{ full: number, partial: number }}
 */
function getBonusValues(routeTotal) {
  if (routeTotal >= 10) return { full: 20, partial: 5 };
  if (routeTotal >= 8)  return { full: 15, partial: 4 };
  if (routeTotal >= 6)  return { full: 10, partial: 3 };
  // Shorter routes (< 6): no bonus defined in spec; return 0
  return { full: 0, partial: 0 };
}

// ── Data loader ───────────────────────────────────────────────────────────────
let _stationLinesCache = null;
let _linesMasterCache  = null;

async function loadStationLines(baseUrl) {
  if (_stationLinesCache) return _stationLinesCache;
  const { stationLinesUrl } = resolveDataUrls(baseUrl);
  const res = await fetch(stationLinesUrl);
  if (!res.ok) throw new Error('Failed to load station_lines_tokyo.json: HTTP ' + res.status + ' (' + stationLinesUrl + ')');
  _stationLinesCache = await res.json();
  return _stationLinesCache;
}

async function loadLinesMaster(baseUrl) {
  if (_linesMasterCache) return _linesMasterCache;
  const { linesMasterUrl } = resolveDataUrls(baseUrl);
  const res = await fetch(linesMasterUrl);
  if (!res.ok) throw new Error('Failed to load lines_tokyo_master.json: HTTP ' + res.status + ' (' + linesMasterUrl + ')');
  _linesMasterCache = await res.json();
  return _linesMasterCache;
}

// ── Core scoring function ─────────────────────────────────────────────────────
/**
 * Compute route completion bonus for a player's collected stations.
 *
 * @param {string[]} playerStations  Array of station_global_id strings
 * @param {Object}   [options]
 * @param {Object}   [options.stationLines]  Pre-loaded station_lines data (skips fetch)
 * @param {Object}   [options.linesMaster]   Pre-loaded lines_master data (skips fetch)
 * @returns {Promise<{
 *   route_bonus: number,
 *   completed_routes: string[],
 *   partial_routes: string[],
 *   route_details: Object[]
 * }>}
 */
async function computeRouteScore(playerStations, options) {
  options = options || {};
  if (!Array.isArray(playerStations) || playerStations.length === 0) {
    return {
      route_bonus: 0,
      completed_routes: [],
      partial_routes: [],
      route_details: []
    };
  }

  // Load data (use cache or pre-loaded data from options)
  const stationLines = options.stationLines || await loadStationLines(options.baseUrl);
  const linesMaster  = options.linesMaster  || await loadLinesMaster(options.baseUrl);

  // Build lookup: line_id → { line_name_en, station_count }
  const lineInfo = {};
  for (const line of linesMaster) {
    lineInfo[line.line_id] = {
      line_name:    line.line_name,
      line_name_en: line.line_name_en,
      station_count: line.station_count
    };
  }

  // Build lookup: station_global_id → [line_id, ...]
  const stationToLines = {};
  for (const record of stationLines) {
    const sid = record.station_global_id;
    if (!stationToLines[sid]) stationToLines[sid] = [];
    stationToLines[sid].push(record.line_id);
  }

  // Build route membership: line_id → Set of all station_global_ids on that line
  const routeStations = {};
  for (const record of stationLines) {
    const lid = record.line_id;
    if (!routeStations[lid]) routeStations[lid] = new Set();
    routeStations[lid].add(record.station_global_id);
  }

  // Count player stations per route
  const playerSet = new Set(playerStations);
  const routeCounts = {}; // line_id → count of player stations on that route

  for (const sid of playerStations) {
    const lines = stationToLines[sid];
    if (!lines) continue; // station not in any known route
    for (const lid of lines) {
      routeCounts[lid] = (routeCounts[lid] || 0) + 1;
    }
  }

  // Evaluate each route
  let totalBonus = 0;
  const completedRoutes = [];
  const partialRoutes   = [];
  const routeDetails    = [];

  for (const [lineId, count] of Object.entries(routeCounts)) {
    const routeTotal = routeStations[lineId] ? routeStations[lineId].size : 0;
    const info       = lineInfo[lineId] || {};
    const bonuses    = getBonusValues(routeTotal);
    const threshold  = routeTotal / 2;

    let bonus = 0;
    let status = 'none';

    if (count >= routeTotal) {
      bonus  = bonuses.full;
      status = 'complete';
      completedRoutes.push(info.line_name_en || lineId);
    } else if (count >= threshold) {
      bonus  = bonuses.partial;
      status = 'partial';
      partialRoutes.push(info.line_name_en || lineId);
    }

    totalBonus += bonus;

    routeDetails.push({
      line_id:      lineId,
      line_name:    info.line_name    || lineId,
      line_name_en: info.line_name_en || lineId,
      count,
      route_total:  routeTotal,
      threshold:    Math.ceil(threshold),
      status,
      bonus,
      full_bonus:    bonuses.full,
      partial_bonus: bonuses.partial
    });
  }

  // Sort details by bonus descending, then by count descending
  routeDetails.sort((a, b) => b.bonus - a.bonus || b.count - a.count);

  return {
    route_bonus:       totalBonus,
    completed_routes:  completedRoutes,
    partial_routes:    partialRoutes,
    route_details:     routeDetails
  };
}

// ── Synchronous variant (for pre-loaded data) ─────────────────────────────────
/**
 * Synchronous version of computeRouteScore.
 * Requires stationLines and linesMaster to be passed directly.
 *
 * @param {string[]} playerStations
 * @param {Object[]} stationLines   Raw array from station_lines_tokyo.json
 * @param {Object[]} linesMaster    Raw array from lines_tokyo_master.json
 * @returns {{ route_bonus, completed_routes, partial_routes, route_details }}
 */
function computeRouteScoreSync(playerStations, stationLines, linesMaster) {
  if (!Array.isArray(playerStations) || playerStations.length === 0) {
    return { route_bonus: 0, completed_routes: [], partial_routes: [], route_details: [] };
  }

  const lineInfo = {};
  for (const line of linesMaster) {
    lineInfo[line.line_id] = {
      line_name:     line.line_name,
      line_name_en:  line.line_name_en,
      station_count: line.station_count
    };
  }

  const stationToLines = {};
  for (const record of stationLines) {
    const sid = record.station_global_id;
    if (!stationToLines[sid]) stationToLines[sid] = [];
    stationToLines[sid].push(record.line_id);
  }

  const routeStations = {};
  for (const record of stationLines) {
    const lid = record.line_id;
    if (!routeStations[lid]) routeStations[lid] = new Set();
    routeStations[lid].add(record.station_global_id);
  }

  const routeCounts = {};
  for (const sid of playerStations) {
    const lines = stationToLines[sid];
    if (!lines) continue;
    for (const lid of lines) {
      routeCounts[lid] = (routeCounts[lid] || 0) + 1;
    }
  }

  let totalBonus = 0;
  const completedRoutes = [];
  const partialRoutes   = [];
  const routeDetails    = [];

  for (const [lineId, count] of Object.entries(routeCounts)) {
    const routeTotal = routeStations[lineId] ? routeStations[lineId].size : 0;
    const info       = lineInfo[lineId] || {};
    const bonuses    = getBonusValues(routeTotal);
    const threshold  = routeTotal / 2;

    let bonus = 0;
    let status = 'none';

    if (count >= routeTotal) {
      bonus  = bonuses.full;
      status = 'complete';
      completedRoutes.push(info.line_name_en || lineId);
    } else if (count >= threshold) {
      bonus  = bonuses.partial;
      status = 'partial';
      partialRoutes.push(info.line_name_en || lineId);
    }

    totalBonus += bonus;

    routeDetails.push({
      line_id:      lineId,
      line_name:    info.line_name    || lineId,
      line_name_en: info.line_name_en || lineId,
      count,
      route_total:  routeTotal,
      threshold:    Math.ceil(threshold),
      status,
      bonus,
      full_bonus:    bonuses.full,
      partial_bonus: bonuses.partial
    });
  }

  routeDetails.sort((a, b) => b.bonus - a.bonus || b.count - a.count);

  return {
    route_bonus:      totalBonus,
    completed_routes: completedRoutes,
    partial_routes:   partialRoutes,
    route_details:    routeDetails
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  // Node.js CommonJS
  module.exports = { computeRouteScore, computeRouteScoreSync, getBonusValues };
} else if (typeof window !== 'undefined') {
  // Browser global fallback (non-module script tag)
  window.RouteCompletionScore = { computeRouteScore, computeRouteScoreSync, getBonusValues };
}

// ES module named exports
export { computeRouteScore, computeRouteScoreSync, getBonusValues };
