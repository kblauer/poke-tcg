import type { CardLibrary } from './cards.js';
import { DEFAULT_CPU_DIFFICULTY, type CpuDifficulty } from './cpu/index.js';
import type { CardInstance, GameState, InPlayPokemon, Phase, PlayerId } from './engine.js';
import type { LogEntry } from './status.js';
import { seesOpponentHand } from './powers.js';
import { pendingChoiceView, type PendingChoiceView } from './trainers.js';

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
  /** How the CPU opponent plays. */
  cpuDifficulty: CpuDifficulty;
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
    /** A search this player must finish, with the cards it reveals to them. */
    pendingChoice: PendingChoiceView | null;
    /** Last turn this player can't play Trainer cards (Headache). */
    noTrainersUntil?: number;
  };
  opponent: {
    id: PlayerId;
    handCount: number;
    /** Their hand, when a power shows it (Clairvoyance). */
    hand?: CardInstance[];
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
  const pending = state.pendingChoice?.player === playerId ? pendingChoiceView(state, state.pendingChoice) : null;
  const oppHand = seesOpponentHand(me, [me, opp], state.cards) ? opp.hand : undefined;
  const visible: CardInstance[] = [
    ...me.hand,
    ...me.discard,
    ...opp.discard,
    ...[me.active, ...me.bench, oppActive, ...opp.bench].flatMap((p) => (p ? [p.card, ...p.evolvedFrom, ...p.energy, ...(p.attached ?? []).map((a) => a.card)] : [])),
    ...(pending ? (pending.kind === 'arrangeTop' ? pending.cards : pending.options) : []),
    ...(oppHand ?? []),
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
    cpuDifficulty: state.cpuDifficulty ?? DEFAULT_CPU_DIFFICULTY,
    log: state.log ?? [],
    cards,
    self: {
      hand: me.hand,
      deckCount: me.deck.length,
      prizeCount: me.prizes.length,
      discard: me.discard,
      active: me.active,
      bench: me.bench,
      pendingChoice: pending,
      noTrainersUntil: me.noTrainersUntil,
    },
    opponent: {
      id: opp.id,
      handCount: opp.hand.length,
      ...(oppHand && { hand: oppHand }),
      deckCount: opp.deck.length,
      prizeCount: opp.prizes.length,
      discard: opp.discard,
      active: oppActive,
      bench: opp.bench,
    },
  };
}
