/**
 * station_rarity.js
 * GUNO V6 — Station Rarity Classification Module
 *
 * Assigns card rarity tiers to stations based on their network importance (score_total).
 */

const DEFAULT_METRICS_PATH = '../data/derived/station_metrics_tokyo.json';

/**
 * Resolve the correct URL for data files when running in different environments.
 * @param {string} baseUrl - Base URL to resolve against (e.g. location.href in browser)
 * @returns {string} - The resolved URL for station_metrics_tokyo.json
 */
function resolveDataUrl(baseUrl) {
  if (baseUrl) {
    const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    return base + 'data/derived/station_metrics_tokyo.json';
  }
  return DEFAULT_METRICS_PATH;
}

/**
 * Fetch station metrics data.
 * @param {string} baseUrl - Optional base URL for resolving the path
 * @returns {Promise<Object>} - Parsed JSON data
 */
async function loadStationMetrics(baseUrl) {
  const url = resolveDataUrl(baseUrl);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load station metrics: HTTP ${res.status} (${url})`);
  }
  return res.json();
}

/**
 * Determine the rarity tier based on score_total.
 * @param {number} score - The station's total score
 * @returns {string} - Rarity tier (Legendary, Epic, Rare, Common)
 */
function getRarityTier(score) {
  if (score >= 14) return 'Legendary';
  if (score >= 11) return 'Epic';
  if (score >= 8)  return 'Rare';
  return 'Common';
}

/**
 * Format a station object with rarity information.
 * @param {Object} station - Raw station object from metrics
 * @returns {Object} - Formatted station object with rarity
 */
function formatStationWithRarity(station) {
  return {
    station_global_id: station.station_global_id,
    station_name: station.station_name,
    station_slug: station.station_slug,
    score_total: station.score_total,
    rank: station.rank,
    rarity: getRarityTier(station.score_total)
  };
}

/**
 * Synchronously get the rarity for a single station.
 * @param {string} stationId - The global ID of the station
 * @param {Object} stationMetrics - The loaded station metrics JSON object
 * @returns {Object|null} - The station with rarity, or null if not found
 */
export function getStationRaritySync(stationId, stationMetrics) {
  if (!stationMetrics || !stationMetrics.stations) {
    console.error('Invalid station metrics data provided.');
    return null;
  }
  
  const station = stationMetrics.stations.find(s => s.station_global_id === stationId);
  if (!station) {
    console.warn(`Station ID not found: ${stationId}`);
    return null;
  }
  
  return formatStationWithRarity(station);
}

/**
 * Asynchronously get the rarity for a single station.
 * @param {string} stationId - The global ID of the station
 * @param {Object} options - Options containing baseUrl or pre-loaded data
 * @returns {Promise<Object|null>} - The station with rarity, or null if not found
 */
export async function getStationRarity(stationId, options = {}) {
  try {
    const stationMetrics = options.stationMetrics || await loadStationMetrics(options.baseUrl);
    return getStationRaritySync(stationId, stationMetrics);
  } catch (error) {
    console.error('Error in getStationRarity:', error);
    throw error;
  }
}

/**
 * Synchronously classify all stations and return them sorted by score.
 * @param {Object} stationMetrics - The loaded station metrics JSON object
 * @returns {Array<Object>} - Array of stations with rarity, sorted by score_total desc
 */
export function classifyAllStationsSync(stationMetrics) {
  if (!stationMetrics || !stationMetrics.stations) {
    console.error('Invalid station metrics data provided.');
    return [];
  }
  
  const classified = stationMetrics.stations.map(formatStationWithRarity);
  
  // Sort by score_total descending
  classified.sort((a, b) => b.score_total - a.score_total);
  
  return classified;
}

/**
 * Asynchronously classify all stations and return them sorted by score.
 * @param {Object} options - Options containing baseUrl or pre-loaded data
 * @returns {Promise<Array<Object>>} - Array of stations with rarity, sorted by score_total desc
 */
export async function classifyAllStations(options = {}) {
  try {
    const stationMetrics = options.stationMetrics || await loadStationMetrics(options.baseUrl);
    return classifyAllStationsSync(stationMetrics);
  } catch (error) {
    console.error('Error in classifyAllStations:', error);
    throw error;
  }
}
