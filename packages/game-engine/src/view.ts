import type { CardLibrary } from './cards.js';
import type { CardInstance, GameState, InPlayPokemon, Phase, PlayerId } from './engine.js';
import type { LogEntry } from './status.js';

/** What a single player is allowed to see. Never send raw GameState to a client. */
export interface PlayerView {
  version: number;
  phase: Phase;
  turn: number;
  you: PlayerId;
  currentPlayer: PlayerId;
  pendingPromotion: PlayerId | null;
  energyAttachedThisTurn: boolean;
  retreatedThisTurn: boolean;
  winner: PlayerId | null;
  /** Game log, oldest first. Only public information goes in it. */
  log: LogEntry[];
  /** Definitions for every card visible in this view (and nothing else). */
  cards: CardLibrary;
  self: {
    hand: CardInstance[];
    deckCount: number;
    prizeCount: number;
    discard: CardInstance[];
    active: InPlayPokemon | null;
    /** Fixed slots; null = empty. */
    bench: (InPlayPokemon | null)[];
  };
  opponent: {
    id: PlayerId;
    handCount: number;
    deckCount: number;
    prizeCount: number;
    discard: CardInstance[];
    /** Hidden while both players are still choosing actives. */
    active: InPlayPokemon | null;
    /** Fixed slots; null = empty. */
    bench: (InPlayPokemon | null)[];
  };
}

export function getPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  const me = state.players[playerId];
  if (!me) throw new Error('Not a player in this game');
  const oppId = state.playerOrder[0] === playerId ? state.playerOrder[1] : state.playerOrder[0];
  const opp = state.players[oppId]!;

  const oppActive = state.phase === 'setup' ? null : opp.active;
  const visible: CardInstance[] = [
    ...me.hand,
    ...me.discard,
    ...opp.discard,
    ...[me.active, ...me.bench, oppActive, ...opp.bench].flatMap((p) => (p ? [p.card, ...p.evolvedFrom, ...p.energy] : [])),
  ];
  const cards: CardLibrary = {};
  for (const c of visible) cards[c.defId] = state.cards[c.defId]!;

  return {
    version: state.version,
    phase: state.phase,
    turn: state.turn,
    you: playerId,
    currentPlayer: state.currentPlayer,
    pendingPromotion: state.pendingPromotion,
    energyAttachedThisTurn: state.energyAttachedThisTurn,
    retreatedThisTurn: state.retreatedThisTurn ?? false,
    winner: state.winner,
    log: state.log ?? [],
    cards,
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
      active: oppActive,
      bench: opp.bench,
    },
  };
}
