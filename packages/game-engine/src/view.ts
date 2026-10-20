import type { CardLibrary } from './cards.js';
import { DEFAULT_CPU_DIFFICULTY, type CpuDifficulty } from './cpu/index.js';
import { recallsAttacks } from './attacks.js';
import { attackDamageRanges, type DamageRange } from './cpu/shared.js';
import type { BattleRule, CardInstance, GameState, InPlayPokemon, Phase, PlayerId } from './engine.js';
import { FACE_DOWN, type LogEntry } from './status.js';
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
  /** Rules from outside the cards (a run's events). */
  rules: BattleRule[];
  /** The Stadium card in play, shared by both players, and who played it. */
  stadium: { card: CardInstance; owner: PlayerId } | null;
  /** Last turn the current player used the Stadium (Lucky Stadium). */
  stadiumUsedTurn?: number;
  /**
   * On the player's turn, what each of their Active Pokémon's attacks would do to the Defending Pokémon now (least and
   * most, over coin flips and choices; null for one it can't use), so "10+" shows as the damage it does now.
   */
  attackDamage?: (DamageRange | null)[];
  /** Game log, oldest first. Only public information goes in it. */
  log: LogEntry[];
  /** Definitions for every card visible in this view (and nothing else). */
  cards: CardLibrary;
  self: {
    hand: CardInstance[];
    deckCount: number;
    prizeCount: number;
    /** Their Prize cards, in order, while they're face up (Here Comes Team Rocket!). */
    prizes?: CardInstance[];
    /** Prize cards turned face up one by one (Card-Flip Game), in Prize order; null while face down. */
    faceUpPrizes?: (CardInstance | null)[];
    discard: CardInstance[];
    active: InPlayPokemon | null;
    /** Fixed slots; null = empty. */
    bench: (InPlayPokemon | null)[];
    /** Last turn no Pokémon Powers work (Goop Gas Attack). */
    powersOffUntil?: number;
    /** A search this player must finish, with the cards it reveals to them. */
    pendingChoice: PendingChoiceView | null;
    /** Last turn this player can't play Trainer cards (Headache). */
    noTrainersUntil?: number;
    /** Setup: done placing Pokémon, waiting for the opponent. */
    ready?: boolean;
    /** A card they looked at with Peek, until their next action. */
    peek?: { card: CardInstance; label: string };
    /** Recall was played this turn: the Active Pokémon can use the attacks of the cards it evolved from (usableAttacks). */
    recall?: boolean;
  };
  opponent: {
    id: PlayerId;
    handCount: number;
    /** Their hand, when a power shows it (Clairvoyance). */
    hand?: CardInstance[];
    deckCount: number;
    prizeCount: number;
    /** Their Prize cards, in order, while they're face up (Here Comes Team Rocket!). */
    prizes?: CardInstance[];
    /** Prize cards turned face up one by one (Card-Flip Game), in Prize order; null while face down. */
    faceUpPrizes?: (CardInstance | null)[];
    discard: CardInstance[];
    /** Last turn no Pokémon Powers work (Goop Gas Attack). */
    powersOffUntil?: number;
    /** Hidden while the players are still placing their Pokémon (setup). */
    active: InPlayPokemon | null;
    /** Fixed slots; null = empty. Hidden (all empty) during setup, like the active. */
    bench: (InPlayPokemon | null)[];
    /** Setup: done placing Pokémon. */
    ready?: boolean;
  };
}

/** PowerSituation.counts from what a player can see. */
export const viewCounts = (view: PlayerView) => ({
  deck: view.self.deckCount,
  prizes: view.self.prizeCount,
  oppDeck: view.opponent.deckCount,
  oppHand: view.opponent.handCount,
  oppPrizes: view.opponent.prizeCount,
});

export function getPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  const me = state.players[playerId];
  if (!me) throw new Error('Not a player in this game');
  const oppId = state.playerOrder[0] === playerId ? state.playerOrder[1] : state.playerOrder[0];
  const opp = state.players[oppId]!;

  // Lt. Surge's Secret Plan: the opponent's face-down cards are shown as FACE_DOWN, with nothing of the card itself.
  const hide = (p: InPlayPokemon | null): InPlayPokemon | null => (p?.faceDown ? { ...p, card: { uid: p.card.uid, defId: FACE_DOWN.id } } : p);
  const oppActive = state.phase === 'setup' ? null : hide(opp.active);
  const oppBench = state.phase === 'setup' ? opp.bench.map(() => null) : opp.bench.map(hide);
  const pending = state.pendingChoice?.player === playerId ? pendingChoiceView(state, state.pendingChoice) : null;
  const oppHand = seesOpponentHand(me, [me, opp], state.cards) ? opp.hand : undefined;
  const peek = state.peek?.player === playerId ? { card: state.peek.card, label: state.peek.label } : undefined;
  /** A player's Prize cards turned face up (Card-Flip Game). */
  const faceUp = (p: typeof me) => p.prizes.filter((c) => p.faceUpPrizes?.includes(c.uid));
  const inOrder = (p: typeof me) => p.prizes.map((c) => (p.faceUpPrizes?.includes(c.uid) ? c : null));
  const visible: CardInstance[] = [
    ...faceUp(me),
    ...faceUp(opp),
    ...me.hand,
    ...me.discard,
    ...opp.discard,
    ...[me.active, ...me.bench, oppActive, ...oppBench].flatMap((p) => (p ? [p.card, ...p.evolvedFrom, ...p.energy, ...(p.attached ?? []).map((a) => a.card)] : [])),
    ...(pending?.kind === 'arrangeTop' || pending?.kind === 'oppHand' ? pending.cards : pending?.kind === 'pickFromDeck' || pending?.kind === 'pickFromDiscard' ? pending.options : []),
    ...(state.prizesFaceUp ? [...me.prizes, ...opp.prizes] : []),
    ...(oppHand ?? []),
    ...(peek ? [peek.card] : []),
    ...(state.stadium ? [state.stadium.card] : []),
  ];
  const cards: CardLibrary = {};
  for (const c of visible) cards[c.defId] = c.defId === FACE_DOWN.id ? FACE_DOWN : state.cards[c.defId]!;

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
    rules: state.rules ?? [],
    stadium: state.stadium ?? null,
    ...(state.stadiumUsedTurn !== undefined && { stadiumUsedTurn: state.stadiumUsedTurn }),
    ...(state.phase === 'playing' && state.currentPlayer === playerId && me.active && oppActive && { attackDamage: attackDamageRanges(state, playerId) }),
    log: state.log ?? [],
    cards,
    self: {
      hand: me.hand,
      deckCount: me.deck.length,
      prizeCount: me.prizes.length,
      ...(state.prizesFaceUp && { prizes: me.prizes }),
      ...(faceUp(me).length && { faceUpPrizes: inOrder(me) }),
      discard: me.discard,
      active: me.active,
      bench: me.bench,
      ...(me.powersOffUntil !== undefined && { powersOffUntil: me.powersOffUntil }),
      pendingChoice: pending,
      noTrainersUntil: me.noTrainersUntil,
      ...(me.ready && { ready: true }),
      ...(peek && { peek }),
      ...(recallsAttacks(state, me) && { recall: true }),
    },
    opponent: {
      id: opp.id,
      handCount: opp.hand.length,
      ...(oppHand && { hand: oppHand }),
      deckCount: opp.deck.length,
      prizeCount: opp.prizes.length,
      ...(state.prizesFaceUp && { prizes: opp.prizes }),
      ...(faceUp(opp).length && { faceUpPrizes: inOrder(opp) }),
      discard: opp.discard,
      ...(opp.powersOffUntil !== undefined && { powersOffUntil: opp.powersOffUntil }),
      active: oppActive,
      bench: oppBench,
      ...(opp.ready && { ready: true }),
    },
  };
}
