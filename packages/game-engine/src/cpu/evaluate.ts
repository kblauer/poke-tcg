// The CPU's judgement of cards it has no rule of its own for (agreed with the user: the hand-written rules come first,
// and this covers every other Trainer, Pokémon Power, Stadium and special Energy). A move is tried on copies of the
// state the CPU imagines (its own deck and Prize cards, and the player's hand, deck and Prize cards, reshuffled; coin
// flips seeded), its questions answered as the CPU would answer them, and the position after it scored from what the
// CPU could see. It's played if the position is better than before.
import { isBasicEnergy, isPokemonCard, isTrainerCard, lookupCard, type CardLibrary } from '../cards.js';
import { applyWeaknessResistance } from '../attacks.js';
import { energyPool, opponentOf, type CardInstance, type GameAction, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from '../engine.js';
import { powerError, powerOf, resolvePowerChoices, situationCounts, type PowerChoices, type PowerChoiceSpec, type PowerSituation } from '../powers.js';
import { shuffle } from '../rng.js';
import { trainerEffect } from '../effects/index.js';
import { resolveTrainerChoices, trainerSituation, type TrainerChoices, type TrainerChoiceSpec } from '../trainers.js';
import {
  attackOptions,
  attackScore,
  bestAttack,
  combinations,
  damages,
  hpLeft,
  inPlay,
  missingEnergy,
  nameKey,
  pokemonDef,
  resolveSearch,
  SEEDS,
  threat,
  threatKnocksOut,
  tryAction,
  turnOf,
  unusableEnergy,
  unusablePokemon,
  type Turn,
} from './shared.js';

/**
 * The imagined copies a move is tried on: each its own shuffle, and coin flips from SEEDS' patterns (shared.ts) chosen so
 * every one of the first two flips, and the third, is heads in exactly half of them (TTH, HTT, THT, HHH).
 */
const IMAGINED = [4, 1, 2, 7].map((pattern, i) => ({ shuffle: 7919 * (i + 1), flips: SEEDS[pattern]! }));

/** The least gain in position worth playing a card for (a useful card in the hand is worth about 5). */
const MIN_GAIN = 1.5;

// ---- Scoring a position ----

/** What one Pokémon in play is worth to its player: being there, its HP left, its stage, Energy and attacks. */
function pokemonValue(cards: CardLibrary, p: InPlayPokemon, active: boolean): number {
  const d = pokemonDef(cards, p);
  const pool = energyPool(p, cards);
  // How ready its best attack is: payable ones by their damage, the others by how close they are.
  const ready = Math.max(0, ...d.attacks.map((a) => {
    const missing = missingEnergy(pool, a.cost);
    return missing === 0 ? 25 + a.damage / 2 : Math.max(0, 12 - 6 * missing);
  }));
  let value = 30 + hpLeft(cards, p) / 2 + 15 * p.evolvedFrom.length + 5 * p.energy.length + ready * (active ? 1.5 : 1);
  // Pokémon Tools keep working (Berries, Focus Band…).
  value += 8 * (p.attached ?? []).filter((a) => a.tool).length;
  if (active) {
    if (p.condition === 'asleep' || p.condition === 'paralyzed') value -= 25;
    if (p.condition === 'confused') value -= 15;
    if (p.poison) value -= 10;
    if (p.burned) value -= 10;
  }
  return value;
}

/** A side's board: its Pokémon, and having something on the Bench to fall back on. */
function boardValue(cards: CardLibrary, side: PlayerState): number {
  const pokemon = inPlay(side).reduce((sum, [target, p]) => sum + pokemonValue(cards, p, target === 'active'), 0);
  return pokemon + (side.bench.some(Boolean) ? 0 : -40);
}

/**
 * The CPU's hand: Pokémon and Energy cards it can use count most (the first Energy card most of all while the turn's
 * attachment is still to come), Trainers a little (they're worth what playing them brings), cards it can't use least.
 */
function handValue(state: GameState, me: PlayerState, id: PlayerId): number {
  const junk = new Set([...unusablePokemon(state, me), ...unusableEnergy(state, me)]);
  let energy = 0;
  return me.hand.reduce((sum, c) => {
    const d = lookupCard(state.cards, c.defId);
    if (junk.has(c)) return sum + 1;
    if (isTrainerCard(d) && !isPokemonCard(d)) return sum + 2;
    if (d.kind === 'energy') return sum + (energy++ === 0 && !(state.currentPlayer === id && state.energyAttachedThisTurn) ? 8 : 4);
    return sum + 5;
  }, 0);
}

/**
 * How good the position is for `id`, from what it can see: Prize cards above all, then each side's Pokémon (HP left,
 * stage, Energy, how ready their attacks are, Special Conditions), the hands' sizes (its own by how useful the cards
 * are) and a deck that's running out. Never the order of a deck or what's in the player's hand.
 */
export function positionScore(state: GameState, id: PlayerId): number {
  if (state.phase === 'finished') return state.winner === id ? 100_000 : -100_000;
  const me = state.players[id]!;
  const opp = state.players[opponentOf(state, id)]!;
  let score = 400 * (opp.prizes.length - me.prizes.length);
  score += boardValue(state.cards, me) - boardValue(state.cards, opp);
  score += handValue(state, me, id) - 4 * opp.hand.length;
  // A deck running out: a little below 15 cards, a lot below 6.
  score -= 3 * Math.max(0, 15 - me.deck.length) + 25 * Math.max(0, 6 - me.deck.length);
  // Knock Outs in sight, by the printed damage the Active Pokémon can pay for: the CPU's now (on its turn), the player's next.
  if (me.active && opp.active) {
    if (state.currentPlayer === id && reach(state.cards, me.active, opp.active) >= hpLeft(state.cards, opp.active)) score += 150;
    if (reach(state.cards, opp.active, me.active) >= hpLeft(state.cards, me.active)) score -= 150;
  }
  return score;
}

/** The most printed damage `attacker` can pay for against `defender`, with Weakness and Resistance. */
function reach(cards: CardLibrary, attacker: InPlayPokemon, defender: InPlayPokemon): number {
  const pool = energyPool(attacker, cards);
  const type = pokemonDef(cards, attacker).type;
  return Math.max(0, ...pokemonDef(cards, attacker).attacks.filter((a) => missingEnergy(pool, a.cost) === 0).map((a) => applyWeaknessResistance(a.damage, type, pokemonDef(cards, defender), defender.effects)));
}

// ---- Trying a move ----

/**
 * The state as the CPU imagines it: what it can't see reshuffled (its own deck with its Prize cards, the player's hand,
 * deck and Prize cards), and the coin flips seeded.
 */
function imagine(state: GameState, id: PlayerId, { shuffle: seed, flips }: (typeof IMAGINED)[number]): GameState {
  const s: GameState = structuredClone({ ...state, log: [] });
  let rng = seed;
  const me = s.players[id]!;
  const opp = s.players[opponentOf(s, id)]!;
  const faceDown = (p: PlayerState) => p.prizes.filter((c) => !p.faceUpPrizes?.includes(c.uid) && !s.prizesFaceUp);
  // Face-up Prize cards (Card-Flip Game, Here Comes Team Rocket!) stay where they are.
  const redeal = (p: PlayerState, hand: boolean) => {
    const hidden = faceDown(p);
    let pile: CardInstance[];
    [pile, rng] = shuffle([...p.deck, ...hidden, ...(hand ? p.hand : [])], rng);
    let i = 0;
    p.prizes = p.prizes.map((c) => (hidden.includes(c) ? pile[i++]! : c));
    if (hand) p.hand = pile.slice(i, (i += p.hand.length));
    p.deck = pile.slice(i);
  };
  redeal(me, false);
  redeal(opp, true);
  s.rngState = flips;
  return s;
}

/** Answers every question left (the CPU's and, as it guesses, the player's) the way the CPU would. Null if one fails. */
function settle(state: GameState): GameState | null {
  for (let guard = 0; guard < 30 && state.phase === 'playing' && state.pendingChoice; guard++) {
    const choice = state.pendingChoice;
    const t = turnOf(state, choice.player);
    const action: GameAction =
      choice.kind === 'switchIn'
        ? { type: 'RESOLVE_CHOICE', target: inPlay(t.me).filter(([target]) => target !== 'active').reduce((a, b) => (hpLeft(state.cards, b[1]) > hpLeft(state.cards, a[1]) ? b : a))[0] }
        : choice.kind === 'borrowedTrainer'
          ? { type: 'RESOLVE_CHOICE' }
          : resolveSearch(t);
    const next = safely(() => tryAction(state, choice.player, action));
    if (!next) return null;
    state = next;
  }
  return state;
}

const safely = <T>(f: () => T | null): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};

/** The imagined states after `action`, its questions answered, one per seed (null if it can't be made). */
function outcomes(t: Turn, action: GameAction): GameState[] | null {
  const out: GameState[] = [];
  for (const imagined of IMAGINED) {
    const after = safely(() => tryAction(imagine(t.state, t.id, imagined), t.id, action));
    const settled = after && settle(after);
    if (!settled) return null;
    out.push(settled);
  }
  return out;
}

/** The turn is over (Tickling Machine's tails, Computer Error…), or the move left it waiting on the player. */
const turnEnded = (after: GameState, id: PlayerId) => after.phase === 'playing' && after.currentPlayer !== id;

/**
 * How much better `action` leaves the position, on average over the imagined copies (null if it can't be made). Ending
 * the turn costs the attack it would have made.
 */
export function judge(t: Turn, action: GameAction, attackLoss: () => number): number | null {
  const after = outcomes(t, action);
  if (!after) return null;
  const before = positionScore(t.state, t.id);
  const scores = after.map((s) => positionScore(s, t.id) - (turnEnded(s, t.id) ? attackLoss() : 0));
  const stadium = playsStadium(t, action) ? stadiumValue(t, after[0]!) : 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length - before + stadium;
}

const playsStadium = (t: Turn, action: GameAction) => {
  if (action.type !== 'PLAY_TRAINER') return false;
  const card = t.me.hand.find((c) => c.uid === action.cardUid);
  return !!card && !!trainerEffect(card.defId)?.stadium;
};

/**
 * A Stadium lasts, so the position just after playing it says little: what it's worth is how it changes this turn's attack
 * and the player's next one, what using it now would bring, and taking the player's Stadium away.
 */
function stadiumValue(t: Turn, after: GameState): number {
  const attackGain = attackScore(bestAttack(attackOptions(after, t.id))) - attackScore(bestAttack(attackOptions(t.state, t.id)));
  const threatGain = threat(t.state, t.id).expected - threat(after, t.id).expected;
  const use: GameAction = { type: 'USE_STADIUM' };
  const useGain = after.currentPlayer === t.id && tryAction(after, t.id, use) ? Math.max(0, judge(turnOf(after, t.id), use, () => 0) ?? 0) : 0;
  const replaced = t.state.stadium && t.state.stadium.owner !== t.id ? 3 : 0;
  return Math.max(-50, Math.min(50, attackGain / 2 + threatGain / 2)) + useGain + replaced;
}

// ---- Every way to play a card ----

/** Every complete set of answers to a Trainer's questions (at most `cap`). */
export function trainerChoiceSets(t: Turn, card: CardInstance, cap = 8): TrainerChoices[] {
  const s = trainerSituation(t.state, t.me, t.opp, card);
  const out: TrainerChoices[] = [];
  const answers = (spec: TrainerChoiceSpec): unknown[] => {
    if (spec.kind !== 'cards') return spec.options;
    // The most cards first ("up to"), then fewer.
    const most = Math.min(spec.max, spec.options.length);
    return Array.from({ length: most - spec.min + 1 }, (_, i) => combinations(spec.options, most - i)).flat().map((picked) => picked.map((c) => c.uid));
  };
  const walk = (given: TrainerChoices) => {
    if (out.length >= cap) return;
    const result = resolveTrainerChoices(s, given);
    if ('choices' in result) return void out.push(result.choices);
    if (!result.need) return;
    for (const value of answers(result.need)) walk({ ...given, [result.need.field]: value });
  };
  walk({});
  return out;
}

export const powerSituation = (t: Turn, source: Target): PowerSituation => ({ me: t.me, opp: t.opp, counts: situationCounts(t.me, t.opp), source, cards: t.state.cards, turn: t.state.turn, stadium: t.state.stadium?.card ?? null });

/** Every complete set of answers to a power's questions (at most `cap`). */
export function powerChoiceSets(t: Turn, source: Target, cap = 24): PowerChoices[] {
  const s = powerSituation(t, source);
  const out: PowerChoices[] = [];
  const answers = (spec: PowerChoiceSpec): unknown[] =>
    spec.kind === 'handCard' || spec.kind === 'attachedEnergy' ? combinations(spec.options, 1).map(([c]) => c!.uid) : spec.options;
  const walk = (given: PowerChoices) => {
    if (out.length >= cap) return;
    const result = resolvePowerChoices(s, given);
    if ('choices' in result) return void out.push(result.choices);
    if (!result.need) return;
    for (const value of answers(result.need)) walk({ ...given, [result.need.field]: value });
  };
  walk({});
  return out;
}

/** The Trainer cards in the hand, one of each, whose nameKey `allowed` takes. */
const trainersIn = (t: Turn, allowed: (key: string) => boolean) => {
  const seen = new Set<string>();
  return t.me.hand.filter((c) => {
    const d = t.def(c);
    if (!isTrainerCard(d) || isPokemonCard(d) || seen.has(d.id) || !allowed(nameKey(d.name))) return false;
    return seen.add(d.id), true;
  });
};

/** What the generic judgement may use: Trainers by nameKey, and powers (by nameKey) and the Stadium if given. */
export interface Allowed {
  trainers: (key: string) => boolean;
  powers?: (key: string) => boolean;
  stadium?: (key: string) => boolean;
}

/** Every move the generic judgement looks at: each allowed Trainer with each set of answers, each power, the Stadium. */
function candidates(t: Turn, allowed: Allowed): GameAction[] {
  const moves: GameAction[] = [];
  for (const card of trainersIn(t, allowed.trainers)) {
    for (const choices of trainerChoiceSets(t, card)) moves.push({ type: 'PLAY_TRAINER', cardUid: card.uid, choices });
  }
  if (allowed.powers) {
    for (const [source, p] of inPlay(t.me)) {
      const power = powerOf(p, t.state.cards);
      // TCGdex has no name for a few powers (Unown [M], [N], [I]).
      if (!power || !allowed.powers(nameKey(power.name ?? '')) || powerError(powerSituation(t, source))) continue;
      for (const choices of powerChoiceSets(t, source, 8)) moves.push({ type: 'USE_POWER', source, choices });
    }
  }
  const stadium = t.state.stadium && t.def(t.state.stadium.card);
  if (stadium && allowed.stadium?.(nameKey(stadium.name)) && tryAction(t.state, t.id, { type: 'USE_STADIUM' })) moves.push({ type: 'USE_STADIUM' });
  return moves;
}

/** The value of this turn's attack, lost if a move ends the turn first. */
const attackLossOf = (t: Turn) => {
  let loss: number | undefined;
  return () => (loss ??= damages(bestAttack(attackOptions(t.state, t.id))) ? 80 : 10);
};

/** The allowed move that improves the position most, if any improves it enough. */
export function bestMove(t: Turn, allowed: Allowed): GameAction | null {
  const loss = attackLossOf(t);
  let best: { action: GameAction; gain: number } | null = null;
  for (const action of candidates(t, allowed)) {
    const gain = judge(t, action, loss);
    if (gain !== null && gain > MIN_GAIN && (!best || gain > best.gain)) best = { action, gain };
  }
  return best?.action ?? null;
}

/**
 * An allowed Trainer that makes this turn's attack better (a Technical Machine, Recall, PlusPower-like cards, switching
 * the Defending Pokémon for one it Knocks Out), on average over the imagined copies, without losing a Pokémon or Prize.
 */
export function attackBoost(t: Turn, allowed: Allowed): GameAction | null {
  const now = attackScore(bestAttack(attackOptions(t.state, t.id)));
  let best: { action: GameAction; score: number } | null = null;
  for (const card of trainersIn(t, allowed.trainers)) {
    for (const choices of trainerChoiceSets(t, card, 6)) {
      const action: GameAction = { type: 'PLAY_TRAINER', cardUid: card.uid, choices };
      const after = outcomes(t, action);
      if (!after || after.some((s) => s.phase !== 'playing' || turnEnded(s, t.id) || lost(t, s))) continue;
      const score = after.reduce((sum, s) => sum + attackScore(bestAttack(attackOptions(s, t.id))), 0) / after.length;
      // With no attack at all, one that only gives a Special Condition (Fire Cube 01's Singe) is better than none.
      if (score > now + (now < 0 ? 0 : 1) && (!best || score > best.score)) best = { action, score };
    }
  }
  return best?.action ?? null;
}

/** The CPU has fewer Pokémon in play or more Prize cards to take than before. */
const lost = (t: Turn, s: GameState) => {
  const me = s.players[t.id]!;
  return inPlay(me).length < inPlay(t.me).length || me.prizes.length > t.me.prizes.length;
};

/**
 * An allowed Trainer that stops the player's next attack from Knocking Out the Active Pokémon (Weakness Guard and the
 * like), in every imagined copy, when it would otherwise be.
 */
export function survive(t: Turn, allowed: Allowed): GameAction | null {
  if (!t.me.active || !threatKnocksOut(t.state, t.id)) return null;
  for (const card of trainersIn(t, allowed.trainers)) {
    for (const choices of trainerChoiceSets(t, card, 6)) {
      const action: GameAction = { type: 'PLAY_TRAINER', cardUid: card.uid, choices };
      const after = outcomes(t, action);
      if (after && after.every((s) => s.phase === 'playing' && !turnEnded(s, t.id) && !lost(t, s) && !threatKnocksOut(s, t.id))) return action;
    }
  }
  return null;
}

// ---- Energy ----

/** Special Energy with nothing to it but what it provides: the attachment rule (attachTarget) places it. */
const PLAIN_ENERGY = new Set(['doublecolorlessenergy']);

/** Energy cards in the hand the attachment rule places by itself: basic Energy and Double Colorless. */
export const plainEnergy = (t: Turn, c: CardInstance) => {
  const d = t.def(c);
  return d.kind === 'energy' && (isBasicEnergy(d) || PLAIN_ENERGY.has(nameKey(d.name)));
};

/**
 * The turn's Energy attachment with special Energy in the hand: `plain` (the attachment rule's pick, if any) unless
 * attaching an allowed special Energy card somewhere leaves a better position; with no pick, the special Energy card that
 * improves the position most, if any does.
 */
export function specialAttachment(t: Turn, plain: GameAction | null, allowed: (key: string) => boolean): GameAction | null {
  const special = t.me.hand.filter((c) => t.def(c).kind === 'energy' && !plainEnergy(t, c) && allowed(nameKey(t.def(c).name)));
  const seen = new Set<string>();
  const moves = special
    .filter((c) => !seen.has(c.defId) && seen.add(c.defId))
    .flatMap((c) => inPlay(t.me).map(([target]): GameAction => ({ type: 'ATTACH_ENERGY', cardUid: c.uid, target })))
    .filter((action) => tryAction(t.state, t.id, action));
  if (!moves.length) return plain;
  const loss = attackLossOf(t);
  const base = plain ? (judge(t, plain, loss) ?? 0) : MIN_GAIN;
  let best: { action: GameAction; gain: number } | null = null;
  for (const action of moves) {
    const gain = judge(t, action, loss);
    if (gain !== null && gain > base && (!best || gain > best.gain)) best = { action, gain };
  }
  return best?.action ?? plain;
}
