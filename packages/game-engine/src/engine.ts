/// <reference path="./globals.d.ts" />
import { isBasicPokemon, lookupCard, type Attack, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { shuffle } from './rng.js';

export type PlayerId = string;

export interface CardInstance {
  /** Unique within a game, e.g. "p1-17". */
  uid: string;
  defId: string;
}

export interface InPlayPokemon {
  card: CardInstance;
  damage: number;
  energy: CardInstance[];
}

export interface PlayerState {
  id: PlayerId;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  prizes: CardInstance[];
  active: InPlayPokemon | null;
  /** Fixed slots (length MAX_BENCH); null = empty. Cards stay in the slot they were played to. */
  bench: (InPlayPokemon | null)[];
}

export type Phase = 'setup' | 'playing' | 'promote' | 'finished';

export interface GameState {
  /** Incremented on every accepted action; used for optimistic concurrency. */
  version: number;
  rngState: number;
  phase: Phase;
  turn: number;
  playerOrder: [PlayerId, PlayerId];
  currentPlayer: PlayerId;
  /** Set while phase === 'promote': the player who must choose a new active. */
  pendingPromotion: PlayerId | null;
  energyAttachedThisTurn: boolean;
  players: Record<PlayerId, PlayerState>;
  winner: PlayerId | null;
  /** Definitions of every card in both decks, so the engine needs no external lookups. */
  cards: CardLibrary;
}

export type Target = 'active' | number; // number = bench slot

export type GameAction =
  | { type: 'SET_ACTIVE'; cardUid: string }
  | { type: 'PLAY_BENCH'; cardUid: string; slot: number }
  | { type: 'ATTACH_ENERGY'; cardUid: string; target: Target }
  | { type: 'ATTACK'; attackIndex: number }
  | { type: 'PROMOTE'; slot: number }
  | { type: 'END_TURN' }
  | { type: 'CONCEDE' };

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

export const HAND_SIZE = 7;
export const PRIZE_COUNT = 6;
export const MAX_BENCH = 5;


export function opponentOf(state: GameState, playerId: PlayerId): PlayerId {
  const [a, b] = state.playerOrder;
  return playerId === a ? b : a;
}

export interface NewGamePlayer {
  id: PlayerId;
  deck: string[]; // card def ids
}

export function createGame(p1: NewGamePlayer, p2: NewGamePlayer, seed: number, library: CardLibrary): GameState {
  let rngState = seed;
  const players: Record<PlayerId, PlayerState> = {};
  // Keep only the definitions this game uses.
  const cards: CardLibrary = {};
  for (const defId of [...p1.deck, ...p2.deck]) cards[defId] = lookupCard(library, defId);
  const isBasic = (c: CardInstance) => isBasicPokemon(cards[c.defId]!);

  for (const [i, p] of [p1, p2].entries()) {
    const instances = p.deck.map((defId, n) => ({ uid: `p${i + 1}-${n}`, defId }));
    if (!instances.some(isBasic)) throw new Error(`Deck for ${p.id} has no Basic Pokémon`);
    if (instances.length <= HAND_SIZE + PRIZE_COUNT) {
      throw new Error(`Deck for ${p.id} needs more than ${HAND_SIZE + PRIZE_COUNT} cards (hand + prizes)`);
    }

    // Simplified mulligan: reshuffle until the opening hand contains a Basic.
    let deck: CardInstance[];
    do {
      [deck, rngState] = shuffle(instances, rngState);
    } while (!deck.slice(0, HAND_SIZE).some(isBasic));

    players[p.id] = {
      id: p.id,
      hand: deck.slice(0, HAND_SIZE),
      prizes: deck.slice(HAND_SIZE, HAND_SIZE + PRIZE_COUNT),
      deck: deck.slice(HAND_SIZE + PRIZE_COUNT),
      discard: [],
      active: null,
      bench: Array<InPlayPokemon | null>(MAX_BENCH).fill(null),
    };
  }

  return {
    version: 0,
    rngState,
    phase: 'setup',
    turn: 1,
    playerOrder: [p1.id, p2.id],
    currentPlayer: p1.id,
    pendingPromotion: null,
    energyAttachedThisTurn: false,
    players,
    winner: null,
    cards,
  };
}

/**
 * Pure reducer: validates `action` for `playerId` and returns the next state.
 * Never mutates the input. Runs identically on client (preview) and server (authority).
 */
export function applyAction(prev: GameState, playerId: PlayerId, action: GameAction): ActionResult {
  if (!prev.players[playerId]) return fail('Not a player in this game');
  if (prev.phase === 'finished') return fail('Game is over');

  const state = structuredClone(prev);
  const me = state.players[playerId]!;
  const opp = state.players[opponentOf(state, playerId)]!;
  const card = (c: CardInstance) => lookupCard(state.cards, c.defId);
  const isBasic = (c: CardInstance) => isBasicPokemon(card(c));

  if (action.type === 'CONCEDE') {
    return finish(state, opp.id);
  }

  if (state.phase === 'setup') {
    if (action.type !== 'SET_ACTIVE') return fail('Choose your active Pokémon first');
    if (me.active) return fail('Active Pokémon already chosen');
    const chosen = takeFromHand(me, action.cardUid);
    if (!chosen || !isBasic(chosen)) return fail('Must choose a Basic Pokémon from your hand');
    me.active = { card: chosen, damage: 0, energy: [] };
    if (opp.active) state.phase = 'playing';
    return ok(state);
  }

  if (state.phase === 'promote') {
    if (playerId !== state.pendingPromotion) return fail('Waiting for opponent to promote');
    if (action.type !== 'PROMOTE') return fail('You must promote a benched Pokémon');
    const promoted = me.bench[action.slot];
    if (!promoted) return fail('That bench slot is empty');
    me.bench[action.slot] = null;
    me.active = promoted;
    state.pendingPromotion = null;
    state.phase = 'playing';
    // The knockout happened on an attack, which ends the attacker's turn.
    return startNextTurn(state);
  }

  if (playerId !== state.currentPlayer) return fail('Not your turn');

  switch (action.type) {
    case 'PLAY_BENCH': {
      if (!isBenchSlot(action.slot)) return fail('Invalid bench slot');
      if (me.bench[action.slot]) return fail('That bench slot is occupied');
      const played = takeFromHand(me, action.cardUid);
      if (!played || !isBasic(played)) return fail('Must play a Basic Pokémon from your hand');
      me.bench[action.slot] = { card: played, damage: 0, energy: [] };
      return ok(state);
    }

    case 'ATTACH_ENERGY': {
      if (state.energyAttachedThisTurn) return fail('Already attached energy this turn');
      const target = action.target === 'active' ? me.active : isBenchSlot(action.target) ? me.bench[action.target] : null;
      if (!target) return fail('Attach energy to one of your Pokémon');
      const energy = takeFromHand(me, action.cardUid);
      if (!energy || card(energy).kind !== 'energy') return fail('Must attach an energy card from your hand');
      target.energy.push(energy);
      state.energyAttachedThisTurn = true;
      return ok(state);
    }

    case 'ATTACK': {
      if (state.turn === 1) return fail('The first player cannot attack on turn 1');
      if (!me.active || !opp.active) return fail('No active Pokémon');
      const attacker = card(me.active.card) as PokemonCardDef;
      const attack = attacker.attacks[action.attackIndex];
      if (!attack) return fail('Invalid attack');
      if (!canPayCost(me.active, attack, state.cards)) return fail('Not enough energy');

      opp.active.damage += attack.damage;
      const defender = card(opp.active.card) as PokemonCardDef;
      if (opp.active.damage >= defender.hp) {
        opp.discard.push(opp.active.card, ...opp.active.energy);
        opp.active = null;
        const prize = me.prizes.pop();
        if (prize) me.hand.push(prize);
        if (me.prizes.length === 0 || !hasBenched(opp)) return finish(state, me.id);
        state.phase = 'promote';
        state.pendingPromotion = opp.id;
        return ok(state);
      }
      return startNextTurn(state);
    }

    case 'END_TURN':
      return startNextTurn(state);

    case 'SET_ACTIVE':
    case 'PROMOTE':
      return fail(`${action.type} is not allowed now`);
  }
}

export function canPayCost(pokemon: InPlayPokemon, attack: Attack, cards: CardLibrary): boolean {
  const pool = pokemon.energy.map((e) => {
    const def = lookupCard(cards, e.defId);
    return def.kind === 'energy' ? def.energyType : 'colorless';
  }) as EnergyType[];
  // Pay typed costs first, then colorless with whatever is left.
  const sorted = [...attack.cost].sort((a, b) => Number(a === 'colorless') - Number(b === 'colorless'));
  for (const need of sorted) {
    const idx = need === 'colorless' ? 0 : pool.indexOf(need);
    if (idx < 0 || pool.length === 0) return false;
    pool.splice(idx, 1);
  }
  return true;
}

function startNextTurn(state: GameState): ActionResult {
  state.currentPlayer = opponentOf(state, state.currentPlayer);
  state.turn += 1;
  state.energyAttachedThisTurn = false;
  const next = state.players[state.currentPlayer]!;
  const drawn = next.deck.shift();
  if (!drawn) return finish(state, opponentOf(state, next.id)); // decked out
  next.hand.push(drawn);
  return ok(state);
}

const isBenchSlot = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < MAX_BENCH;

export const hasBenched = (player: PlayerState) => player.bench.some((p) => p !== null);

function takeFromHand(player: PlayerState, uid: string): CardInstance | undefined {
  const idx = player.hand.findIndex((c) => c.uid === uid);
  return idx < 0 ? undefined : player.hand.splice(idx, 1)[0];
}

function finish(state: GameState, winner: PlayerId): ActionResult {
  state.phase = 'finished';
  state.winner = winner;
  state.pendingPromotion = null;
  return ok(state);
}

function ok(state: GameState): ActionResult {
  state.version += 1;
  return { ok: true, state };
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}
