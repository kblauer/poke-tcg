// Whole games, the CPU against itself, with each generation's random decks from its own pool (#204): the invariants no
// single card's test can hold the engine to. After every action: each card is in exactly one place and none appears or
// goes missing; a state waiting for a move has both Active Pokémon; no Pokémon is left in play with damage up to its HP;
// `levelUpFrom` is only on a Pokémon under a LV.X card; a finished game asks nothing; every turn that ends has its
// Pokémon Checkup. The CPUs never throw, never make a move the engine refuses, are never both without a move, and
// every action they make comes through the API's schema (gameActionSchema) unchanged. Each state is frozen before it's
// handed on, so nothing changes one in place.
//
// Here, not in the engine: the real cards and generateDeck are the campaign's, the schema shared's. Gen 5 has no random
// decks yet (no DeckRules), so its cards aren't played.
import { GENERATIONS, generateDeck, rngFrom, type PoolCard } from '@poke-tcg/campaign';
import { applyAction, captureCheckup, cpuFor, createGame, getPlayerView, inPlayDef, type CardInstance, type CardLibrary, type CpuDifficulty, type GameAction, type GameState, type PendingChoice } from '@poke-tcg/game-engine';
import { gameActionSchema } from '@poke-tcg/shared';
import { describe, expect, it } from 'vitest';
import { GEN2_TEST_POOL, GEN3_TEST_POOL, GEN4_TEST_POOL, TEST_POOL, catalogDef } from '../../../packages/campaign/src/test-pool.js';

const POOLS: Record<number, PoolCard[]> = { 1: TEST_POOL, 2: GEN2_TEST_POOL, 3: GEN3_TEST_POOL, 4: GEN4_TEST_POOL };
const DIFFICULTIES: CpuDifficulty[] = ['trainer', 'gymLeader'];
/** Seeds a generation, by difficulty: kept few, as a game is some hundreds of CPU decisions and a gym leader's take longest (the whole file runs in about 25 s). */
const SEEDS: Record<string, number[]> = { trainer: [1, 2, 3], gymLeader: [2, 3] };
const MAX_TURNS = 150;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Every card in a place of its own: the piles, the Pokémon in play and what's on them, the Stadium. */
function placed(state: GameState): CardInstance[] {
  const cards: CardInstance[] = state.stadium ? [state.stadium.card] : [];
  for (const p of Object.values(state.players)) {
    cards.push(...p.deck, ...p.hand, ...p.discard, ...p.prizes, ...(p.lostZone ?? []), ...(p.setAside?.cards ?? []));
    for (const q of [p.active, ...p.bench]) if (q) cards.push(q.card, ...q.evolvedFrom, ...q.energy, ...(q.attached ?? []).map((a) => a.card));
  }
  return cards;
}

/** Cards a question holds while it's asked, taken out of their place until it's answered (attachCard, distributeEnergy…). */
function held(state: GameState): CardInstance[] {
  const of = (c: PendingChoice): CardInstance[] => {
    const q = c as { card?: CardInstance; cards?: CardInstance[]; next?: PendingChoice };
    return [...(q.card ? [q.card] : []), ...(q.cards ?? []), ...(q.next ? of(q.next) : [])];
  };
  return [...(state.pendingChoice ? [state.pendingChoice] : []), ...(state.queuedChoices ?? [])].flatMap(of);
}

/** What's wrong with a state reached by `action`, each as a short line (the same wording for the same kind of fault). */
function faults(state: GameState, uids: Set<string>): string[] {
  const found: string[] = [];
  const inPlace = placed(state).map((c) => c.uid);
  const seen = new Set<string>();
  for (const uid of inPlace) {
    if (seen.has(uid)) found.push('a card is in two places');
    if (!uids.has(uid)) found.push('a card appeared from nowhere');
    seen.add(uid);
  }
  const kept = new Set([...inPlace, ...held(state).map((c) => c.uid)]);
  if ([...uids].some((uid) => !kept.has(uid))) found.push('a card went missing');

  const waiting = state.phase === 'playing' && !state.pendingChoice;
  for (const p of Object.values(state.players)) {
    if (waiting && !p.active) found.push('waiting for a move with no Active Pokémon');
    for (const q of [p.active, ...p.bench]) {
      if (!q) continue;
      const def = inPlayDef(state.cards, q);
      if (waiting && q.damage >= def.hp) found.push('a Pokémon is left in play with damage up to its HP');
      if (q.levelUpFrom && state.cards[q.card.defId]?.kind === 'pokemon' && (state.cards[q.card.defId] as { stage?: string }).stage !== 'levelUp') found.push('levelUpFrom on a Pokémon with no LV.X card');
    }
  }
  if (state.phase === 'finished' && (state.pendingChoice || state.queuedChoices?.length)) found.push('a finished game still asks a question');
  if (state.phase === 'finished' && !state.winner) found.push('a finished game has no winner');
  return found;
}

/** What a player's view must never hold: the uids of the cards they can't see, and the engine's private fields. */
function leaks(state: GameState, playerId: string): string[] {
  const opp = state.players[state.playerOrder.find((p) => p !== playerId)!]!;
  const me = state.players[playerId]!;
  const json = JSON.stringify(getPlayerView(state, playerId));
  const found: string[] = [];
  if (opp.hand.some((c) => json.includes(`"${c.uid}"`))) found.push("the view holds a card of the opponent's hand");
  if ([...opp.deck, ...me.deck].some((c) => json.includes(`"${c.uid}"`))) found.push('the view holds a card of a deck');
  if (/"rngState"|"firstTicket"/.test(json)) found.push('the view holds rngState or firstTicket');
  return found;
}

/** A whole game; returns each kind of fault seen, with the first action it was seen after. */
function play(generation: number, seed: number, difficulty: CpuDifficulty): Map<string, string> {
  const rules = GENERATIONS[generation]!.deckRules;
  const deck = (n: number) => generateDeck(POOLS[generation]!, rngFrom(seed * 100 + n), { rules, difficulty: difficulty === 'trainer' ? 'trainer' : 'gymLeader' });
  const decks = [deck(1), deck(2)];
  const library: CardLibrary = Object.fromEntries(decks.flat().map((id) => [id, catalogDef(id)]));
  let state = createGame({ id: 'p1', deck: decks[0]! }, { id: 'p2', deck: decks[1]! }, seed, library);
  deepFreeze(state.cards);
  const uids = new Set(placed(state).map((c) => c.uid));
  const decide = cpuFor(difficulty);
  const seen = new Map<string, string>();
  const note = (fault: string, after: string) => void (seen.has(fault) || seen.set(fault, after));

  for (let n = 0; state.phase !== 'finished' && state.turn <= MAX_TURNS; n++) {
    deepFreeze(state);
    const before: GameState = state;
    let moved: GameAction | undefined;
    for (const id of before.playerOrder) {
      let action: GameAction | null;
      try {
        action = decide(before, id);
      } catch (e) {
        note(`the CPU threw: ${(e as Error).message}`, `turn ${before.turn}`);
        return seen;
      }
      if (!action) continue;
      const at = `turn ${before.turn}, ${JSON.stringify(action)}`;
      expect(gameActionSchema.parse(action), `the schema changes ${at}`).toEqual(action);
      let outcome: ReturnType<typeof captureCheckup<ReturnType<typeof applyAction>>>;
      try {
        outcome = captureCheckup(() => applyAction(before, id, action));
      } catch (e) {
        note(`the engine threw: ${(e as Error).message}`, at);
        return seen;
      }
      if (!outcome.result.ok) {
        note(`the CPU's move was refused: ${outcome.result.error}`, at);
        return seen;
      }
      state = outcome.result.state;
      for (const fault of faults(state, uids)) note(fault, at);
      // (A question shows its player the cards it's about, and a peek the card looked at: only a state asking nothing is checked.)
      if (!state.pendingChoice && !state.peek) for (const p of state.playerOrder) for (const leak of leaks(state, p)) note(leak, at);
      if (before.phase === 'playing' && state.turn > before.turn && !outcome.checkup) note('a turn ended with no Pokémon Checkup', at);
      moved = action;
      break;
    }
    if (!moved) {
      note(`nobody has a move (${state.phase}, ${state.pendingChoice ? `asked ${state.pendingChoice.kind}` : 'nothing asked'})`, `turn ${state.turn}`);
      return seen;
    }
    if (n > 20_000) {
      note('the game never ends', `turn ${state.turn}`);
      return seen;
    }
  }
  // (A deck is 60 cards and each turn draws one: a game that isn't won runs out of cards long before.)
  if (state.phase !== 'finished') note(`the game isn't over after ${MAX_TURNS} turns`, `turn ${state.turn}`);
  return seen;
}

/**
 * Faults these games show today, by their line, each with where it was reported. A game may show only these; and each
 * must still be seen in some game, so a fix takes its entry out.
 */
const KNOWN: Record<string, string> = {};

describe('the CPU against itself', () => {
  const allSeen = new Set<string>();

  describe.each([1, 2, 3, 4])('Generation %i', (generation) => {
    it.each(DIFFICULTIES.flatMap((difficulty) => SEEDS[difficulty]!.map((seed) => ({ difficulty, seed }))))('$difficulty decks, seed $seed: a whole game with nothing wrong', ({ difficulty, seed }) => {
      const seen = play(generation, seed, difficulty);
      for (const fault of seen.keys()) allSeen.add(fault);
      expect([...seen].filter(([fault]) => !(fault in KNOWN)).map(([fault, after]) => `${fault} (after ${after})`)).toEqual([]);
    }, 120_000);
  });

  it('every known fault is still seen', () => {
    expect(Object.keys(KNOWN).filter((fault) => !allSeen.has(fault))).toEqual([]);
  });
});
