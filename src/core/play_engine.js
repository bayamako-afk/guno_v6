/**
 * GUNO V6 - Play Engine
 * Core game loop for GUNO, handling turn progression, card playing, and game state.
 */

import { computeFinalScoreSync } from '../scoring/final_score_engine.js';

/**
 * Creates the initial game state.
 * @param {Array} deck - Array of card objects
 * @param {Array} players - Array of player objects: { id: "P1" }
 * @returns {Object} Initial game state
 */
export function createInitialGameState(deck, players) {
  // 1. Shuffle deck (simple Fisher-Yates)
  const shuffledDeck = [...deck];
  for (let i = shuffledDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledDeck[i], shuffledDeck[j]] = [shuffledDeck[j], shuffledDeck[i]];
  }

  // 2. Initialize players
  const initializedPlayers = players.map(p => ({
    id: p.id,
    hand: [],
    ownedStations: []
  }));

  // 3. Deal 5 cards to each player
  for (let i = 0; i < 5; i++) {
    for (const player of initializedPlayers) {
      if (shuffledDeck.length > 0) {
        player.hand.push(shuffledDeck.pop());
      }
    }
  }

  // 4. Draw first card to start the discard pile (currentCard)
  // Note: This first card is not added to any player's ownedStations
  let currentCard = null;
  const discardPile = [];
  if (shuffledDeck.length > 0) {
    currentCard = shuffledDeck.pop();
    discardPile.push(currentCard);
  }

  return {
    deck: shuffledDeck,
    discardPile,
    players: initializedPlayers,
    turnIndex: 0,
    currentCard,
    winner: null,
    gameOver: false,
    turnCount: 0
  };
}

/**
 * Checks if a candidate card can be played on top of the current card.
 * Conditions (v1):
 * A: Same line (shares at least one line_id)
 * B: Adjacent station in graph
 * C: Same station_global_id
 * 
 * @param {Object} currentCard 
 * @param {Object} candidateCard 
 * @param {Object} stationGraph 
 * @param {Array} stationLines 
 * @returns {boolean}
 */
export function canPlayCard(currentCard, candidateCard, stationGraph, stationLines) {
  if (!currentCard || !candidateCard) return false;
  
  const currentId = currentCard.station_global_id;
  const candidateId = candidateCard.station_global_id;

  // Condition C: Same station
  if (currentId === candidateId) {
    return true;
  }

  // Condition B: Adjacent station
  if (stationGraph && stationGraph.edges) {
    const isAdjacent = stationGraph.edges.some(edge => 
      (edge.from === currentId && edge.to === candidateId) ||
      (edge.from === candidateId && edge.to === currentId)
    );
    if (isAdjacent) return true;
  }

  // Condition A: Same line
  if (stationLines) {
    // Find all lines for current card
    const currentLines = stationLines
      .filter(sl => sl.station_global_id === currentId)
      .map(sl => sl.line_id);
    
    // Find all lines for candidate card
    const candidateLines = stationLines
      .filter(sl => sl.station_global_id === candidateId)
      .map(sl => sl.line_id);
    
    // Check intersection
    const sharesLine = currentLines.some(lineId => candidateLines.includes(lineId));
    if (sharesLine) return true;
  }

  return false;
}

/**
 * Chooses a card to play from the available playable cards.
 * v1 default: highest station score first.
 * @param {Object} player 
 * @param {Array} playableCards 
 * @returns {Object} Selected card
 */
export function choosePlayableCard(player, playableCards) {
  if (!playableCards || playableCards.length === 0) return null;
  
  // Sort descending by score_total and pick the highest
  const sorted = [...playableCards].sort((a, b) => (b.score_total || 0) - (a.score_total || 0));
  return sorted[0];
}

/**
 * Executes a single turn for the current player.
 * @param {Object} state - Current game state
 * @param {Object} options - { stationGraph, stationLines }
 * @returns {Object} Updated game state
 */
export function playTurn(state, options) {
  if (state.gameOver) return state;

  const { stationGraph, stationLines } = options;
  const currentPlayer = state.players[state.turnIndex];
  
  // 1. Find playable cards in hand
  const playableCards = currentPlayer.hand.filter(card => 
    canPlayCard(state.currentCard, card, stationGraph, stationLines)
  );

  let cardPlayed = false;

  // 2. Play a card if possible
  if (playableCards.length > 0) {
    const cardToPlay = choosePlayableCard(currentPlayer, playableCards);
    
    // Remove from hand
    currentPlayer.hand = currentPlayer.hand.filter(c => c.card_id !== cardToPlay.card_id);
    
    // Add to discard pile and set as current
    state.discardPile.push(cardToPlay);
    state.currentCard = cardToPlay;
    
    // Add to owned stations
    currentPlayer.ownedStations.push(cardToPlay.station_global_id);
    cardPlayed = true;
  } 
  // 3. Draw a card if cannot play
  else {
    if (state.deck.length > 0) {
      const drawnCard = state.deck.pop();
      
      // Can we play the drawn card immediately?
      if (canPlayCard(state.currentCard, drawnCard, stationGraph, stationLines)) {
        state.discardPile.push(drawnCard);
        state.currentCard = drawnCard;
        currentPlayer.ownedStations.push(drawnCard.station_global_id);
        cardPlayed = true;
      } else {
        // Keep in hand
        currentPlayer.hand.push(drawnCard);
      }
    }
  }

  // 4. Check end conditions
  state.turnCount++;
  
  // Condition 1: Hand is empty
  if (currentPlayer.hand.length === 0) {
    state.gameOver = true;
    state.winner = currentPlayer.id;
  }
  // Condition 2: Turn limit or deck empty (simplified: just turn limit for now to prevent infinite loops)
  else if (state.turnCount >= 100) {
    state.gameOver = true;
    // No clear winner by emptying hand, winner determined by score later
  }

  // 5. Next player
  if (!state.gameOver) {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
  }

  return state;
}

/**
 * Calculates final scores for all players.
 * @param {Object} state - Finished game state
 * @param {Object} scoringData - { stationMetrics, stationLines, linesMaster }
 * @returns {Array} Array of player results
 */
export function scoreFinishedGame(state, scoringData) {
  return state.players.map(player => {
    const scoreResult = computeFinalScoreSync(player.ownedStations, scoringData);
    return {
      playerId: player.id,
      stationCount: player.ownedStations.length,
      finalScore: scoreResult.final_score,
      stationScore: scoreResult.station_score,
      routeBonus: scoreResult.route_bonus,
      hubBonus: scoreResult.hub_bonus
    };
  });
}

/**
 * Runs a complete game simulation from start to finish.
 * @param {Object} options - { deck, players, stationGraph, stationLines, stationMetrics, linesMaster }
 * @returns {Object} Simulation result
 */
export function runGameSimulation(options) {
  const { deck, players, stationGraph, stationLines, stationMetrics, linesMaster } = options;
  
  let state = createInitialGameState(deck, players);
  
  const turnOptions = { stationGraph, stationLines };
  
  // Run turns until game over
  while (!state.gameOver) {
    state = playTurn(state, turnOptions);
  }
  
  // Calculate scores
  const scoringData = { stationMetrics, stationLines, linesMaster };
  const results = scoreFinishedGame(state, scoringData);
  
  // If no winner from emptying hand, winner is the one with highest score
  let finalWinner = state.winner;
  if (!finalWinner) {
    const sortedResults = [...results].sort((a, b) => b.finalScore - a.finalScore);
    finalWinner = sortedResults[0].playerId;
  }
  
  return {
    winner: finalWinner,
    turns: state.turnCount,
    results
  };
}
