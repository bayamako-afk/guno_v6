/**
 * GUNO V6 - Game Simulator v2 (AI Strategy Simulator)
 * 
 * This module simulates games between AI players using different strategies
 * (Hub, Route, Balanced) to test game balance and scoring rules.
 */

import { generateDeckSync } from '../generators/deck_generator.js';
import { computeFinalScoreSync } from '../scoring/final_score_engine.js';

// Define the strategies and their evaluation weights
const STRATEGIES = {
  hub: {
    name: 'Hub AI',
    weights: { station_score: 0.8, hub_potential: 2.0, route_potential: 0.4 }
  },
  route: {
    name: 'Route AI',
    weights: { station_score: 0.7, hub_potential: 0.4, route_potential: 2.0 }
  },
  balanced: {
    name: 'Balanced AI',
    weights: { station_score: 1.0, hub_potential: 1.0, route_potential: 1.0 }
  }
};

/**
 * Pre-calculate potential values for all cards in the deck
 */
function enrichDeckWithPotentials(deck, stationMetrics, stationLines) {
  // Build lookup maps
  const metricsMap = new Map();
  if (stationMetrics) {
    const stations = Array.isArray(stationMetrics) ? stationMetrics : (stationMetrics.stations || []);
    stations.forEach(s => metricsMap.set(s.station_global_id, s));
  }

  const linesMap = new Map();
  if (stationLines) {
    stationLines.forEach(record => {
      const sid = record.station_global_id;
      if (!linesMap.has(sid)) linesMap.set(sid, []);
      linesMap.get(sid).push(record.line_name);
    });
  }

  return deck.map(card => {
    const gid = card.station_global_id;
    const metric = metricsMap.get(gid) || {};
    
    // Hub potential: based on hub_score and line_count
    const hubScore = metric.hub_score || 0;
    const lineCount = metric.line_count || 1;
    const hubPotential = hubScore * 2 + lineCount;

    // Route potential: based on how many lines pass through this station
    // A station on many lines is good for route completion flexibility
    const lines = linesMap.get(gid) || [];
    const routePotential = lines.length * 2.5;

    return {
      ...card,
      station_score: card.score_total || 0,
      hub_potential: hubPotential,
      route_potential: routePotential,
      lines: lines
    };
  });
}

/**
 * AI evaluates a card based on its strategy
 */
function evaluateCard(card, strategy) {
  const w = strategy.weights;
  return (card.station_score * w.station_score) +
         (card.hub_potential * w.hub_potential) +
         (card.route_potential * w.route_potential);
}

/**
 * Run a single game simulation
 */
function simulateSingleGame(players, data) {
  // 1. Generate deck (40 cards)
  const deckResult = generateDeckSync(data.stationMetrics, data.stationLines);
  let deck = enrichDeckWithPotentials(deckResult.cards, data.stationMetrics, data.stationLines);
  
  // 2. Shuffle deck
  deck = [...deck].sort(() => Math.random() - 0.5);
  
  // 3. Draft cards (each player gets 10 cards)
  // In a real game, players draft from a pool.
  // For this simulation, we simulate a simple draft:
  // Each round, players are presented with a hand of cards and pick the best one.
  // To simplify: we just deal 10 random cards to each player, but we simulate
  // the AI "picking" the best cards from their dealt hand to form their final hand.
  // Actually, a better simulation of "strategy" is to let them pick from a shared pool.
  
  // Pool drafting simulation:
  // All 40 cards are in a pool. Players take turns picking 1 card until they have 10.
  const hands = players.map(() => []);
  let pool = [...deck];
  
  for (let round = 0; round < 10; round++) {
    for (let p = 0; p < players.length; p++) {
      if (pool.length === 0) break;
      
      const player = players[p];
      const strategy = STRATEGIES[player.strategy];
      
      // Evaluate all cards in pool
      const evaluated = pool.map(card => ({
        card,
        value: evaluateCard(card, strategy)
      }));
      
      // Sort by value desc
      evaluated.sort((a, b) => b.value - a.value);
      
      // Pick the best card
      const bestPick = evaluated[0].card;
      hands[p].push(bestPick);
      
      // Remove from pool
      pool = pool.filter(c => c.card_id !== bestPick.card_id);
    }
  }
  
  // 4. Calculate scores
  const results = players.map((player, index) => {
    const stationIds = hands[index].map(c => c.station_global_id);
    const scoreResult = computeFinalScoreSync(stationIds, data);
    
    return {
      player_id: player.id,
      strategy: player.strategy,
      strategy_name: STRATEGIES[player.strategy].name,
      hand: hands[index],
      score: scoreResult
    };
  });
  
  // 5. Determine winner
  results.sort((a, b) => b.score.final_score - a.score.final_score);
  const winner = results[0];
  
  return {
    winner: winner.player_id,
    winner_strategy: winner.strategy,
    results
  };
}

/**
 * Run multiple simulations and aggregate results
 */
export function runSimulationsSync(numSimulations, playersConfig, data) {
  console.log(`Starting ${numSimulations} simulations...`);
  
  const players = playersConfig || [
    { id: 'P1', strategy: 'hub' },
    { id: 'P2', strategy: 'route' },
    { id: 'P3', strategy: 'balanced' },
    { id: 'P4', strategy: 'balanced' }
  ];
  
  const stats = {
    total_simulations: numSimulations,
    strategies: {},
    top_stations: {},
    top_routes: {}
  };
  
  // Initialize strategy stats
  Object.keys(STRATEGIES).forEach(key => {
    stats.strategies[key] = {
      name: STRATEGIES[key].name,
      wins: 0,
      win_rate: 0,
      total_final_score: 0,
      total_station_score: 0,
      total_route_bonus: 0,
      total_hub_bonus: 0,
      games_played: 0
    };
  });
  
  // Run simulations
  for (let i = 1; i <= numSimulations; i++) {
    if (i % 100 === 0 || i === 1 || i === numSimulations) {
      console.log(`Game ${i} / ${numSimulations}`);
    }
    
    const gameResult = simulateSingleGame(players, data);
    
    // Update stats for all players
    gameResult.results.forEach(res => {
      const st = stats.strategies[res.strategy];
      st.games_played++;
      st.total_final_score += res.score.final_score;
      st.total_station_score += res.score.station_score;
      st.total_route_bonus += res.score.route_bonus;
      st.total_hub_bonus += res.score.hub_bonus;
      
      if (res.player_id === gameResult.winner) {
        st.wins++;
        
        // Track winning stations
        res.hand.forEach(card => {
          const name = card.station_name;
          stats.top_stations[name] = (stats.top_stations[name] || 0) + 1;
        });
        
        // Track winning routes
        res.score.routes.forEach(route => {
          stats.top_routes[route] = (stats.top_routes[route] || 0) + 1;
        });
      }
    });
  }
  
  // Finalize averages and win rates
  Object.keys(stats.strategies).forEach(key => {
    const st = stats.strategies[key];
    if (st.games_played > 0) {
      // Since multiple players can have the same strategy, we calculate win rate
      // based on total simulations, but we need to account for how many players
      // used this strategy. A simpler metric is: Wins / Total Simulations
      st.win_rate = (st.wins / numSimulations) * 100;
      
      st.avg_final_score = st.total_final_score / st.games_played;
      st.avg_station_score = st.total_station_score / st.games_played;
      st.avg_route_bonus = st.total_route_bonus / st.games_played;
      st.avg_hub_bonus = st.total_hub_bonus / st.games_played;
    }
  });
  
  // Sort top stations
  const sortedStations = Object.entries(stats.top_stations)
    .map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 20);
    
  // Sort top routes
  const sortedRoutes = Object.entries(stats.top_routes)
    .map(([name, wins]) => ({ name, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 10);
    
  return {
    ...stats,
    top_stations: sortedStations,
    top_routes: sortedRoutes
  };
}

/**
 * Async wrapper that fetches data first
 */
export async function runSimulations(numSimulations, playersConfig, options = {}) {
  const baseUrl = options.baseUrl || '';
  
  // Fetch required data
  const [metricsRes, linesRes, masterRes] = await Promise.all([
    fetch(`${baseUrl}data/derived/station_metrics_tokyo.json`),
    fetch(`${baseUrl}data/master/station_lines_tokyo.json`),
    fetch(`${baseUrl}data/master/lines_tokyo_master.json`)
  ]);
  
  const stationMetrics = await metricsRes.json();
  const stationLines = await linesRes.json();
  const linesMaster = await masterRes.json();
  
  const data = {
    stationMetrics,
    stationLines: Array.isArray(stationLines) ? stationLines : stationLines.station_lines || [],
    linesMaster: Array.isArray(linesMaster) ? linesMaster : linesMaster.lines || []
  };
  
  return runSimulationsSync(numSimulations, playersConfig, data);
}
