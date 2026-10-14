import type { CardInstance, GameState, InPlayPokemon, Phase, PlayerId } from './engine.js';

/** What a single player is allowed to see. Never send raw GameState to a client. */
export interface PlayerView {
  version: number;
  phase: Phase;
  turn: number;
  you: PlayerId;
  currentPlayer: PlayerId;
  pendingPromotion: PlayerId | null;
  energyAttachedThisTurn: boolean;
  winner: PlayerId | null;
  self: {
    hand: CardInstance[];
    deckCount: number;
    prizeCount: number;
    discard: CardInstance[];
    active: InPlayPokemon | null;
    bench: InPlayPokemon[];
  };
  opponent: {
    id: PlayerId;
    handCount: number;
    deckCount: number;
    prizeCount: number;
    discard: CardInstance[];
    /** Hidden while both players are still choosing actives. */
    active: InPlayPokemon | null;
    bench: InPlayPokemon[];
  };
}

export function getPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  const me = state.players[playerId];
  if (!me) throw new Error('Not a player in this game');
  const oppId = state.playerOrder[0] === playerId ? state.playerOrder[1] : state.playerOrder[0];
  const opp = state.players[oppId]!;

  return {
    version: state.version,
    phase: state.phase,
    turn: state.turn,
    you: playerId,
    currentPlayer: state.currentPlayer,
    pendingPromotion: state.pendingPromotion,
    energyAttachedThisTurn: state.energyAttachedThisTurn,
    winner: state.winner,
    self: {
      hand: me.hand,
      deckCount: me.deck.length,
      prizeCount: me.prizes.length,
      discard: me.discard,
      active: me.active,
      bench: me.bench,
    },
    opponent: {
      id: opp.id,
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      prizeCount: opp.prizes.length,
      discard: opp.discard,
      active: state.phase === 'setup' ? null : opp.active,
      bench: opp.bench,
    },
  };
}
