// Shared by the CPU difficulties. What the CPU knows about a position: what each attack would do, worked out by playing it on copies of the
// state with fixed coin flips (so it never sees the real flips to come), plus Energy arithmetic and which
// cards are useful. Everything here is generic over cards: no card ids, and only the rules engine's own
// effects decide what an attack does.
import { answerChoice, attackError, attackSituation, performAttack, resolveChoices, type AttackChoices, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, isBasicPokemon, isPokemonCard, isTrainerCard, lookupCard, type CardDef, type CardLibrary, type EnergyType, type PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, energyProvided, payCost, type PoolEnergy, evolveError, opponentOf, retreatCost, retreatError, type CardInstance, type GameAction, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from '../engine.js';
import { nextRandom } from '../rng.js';
import { inPlayDef, openBenchSlot } from '../status.js';
import { pendingChoiceView, type TrainerChoices } from '../trainers.js';

/** Card names compared without accents, spaces or case ('Pokémon Breeder' = 'pokemonbreeder'). */
export const nameKey = (name: string) => name.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();

export const pokemonDef = (cards: CardLibrary, p: InPlayPokemon): PokemonCardDef => inPlayDef(cards, p);

export const at = (side: Pick<PlayerState, 'active' | 'bench'>, t: Target) => (t === 'active' ? side.active : side.bench[t]) ?? null;

/** The player's Pokémon in play, active first. */
export const inPlay = (side: Pick<PlayerState, 'active' | 'bench'>): [Target, InPlayPokemon][] => [
  ...(side.active ? [['active', side.active] as [Target, InPlayPokemon]] : []),
  ...side.bench.flatMap((p, i) => (p ? [[i, p] as [Target, InPlayPokemon]] : [])),
];

export const hpLeft = (cards: CardLibrary, p: InPlayPokemon) => pokemonDef(cards, p).hp - p.damage;

/** During setup: the first Basic Pokémon in the hand as the Active Pokémon (null once it has one). */
export function chooseActive(state: GameState, cpu: PlayerState): GameAction | null {
  if (cpu.ready) return null;
  // Its active only; it benches on its first turn.
  if (cpu.active) return { type: 'START_BATTLE' };
  const basic = cpu.hand.find((c) => isBasicPokemon(lookupCard(state.cards, c.defId)));
  if (!basic) throw new Error('CPU has no Basic Pokémon to start with');
  return { type: 'SET_ACTIVE', cardUid: basic.uid };
}

/** The state after `action`, or null if it isn't allowed. */
export function tryAction(state: GameState, playerId: PlayerId, action: GameAction): GameState | null {
  const result = applyAction(state, playerId, action);
  return result.ok ? result.state : null;
}

// ---- Energy arithmetic ----

/** How many more Energy the cost needs, paying typed symbols first and colorless with what's left. */
export const missingEnergy = (pool: PoolEnergy[], cost: EnergyType[]): number => payCost(pool, cost);

/** Colorless symbols still unpaid (after typed ones take their matching Energy) in the attack's cost. */
function colorlessLeft(pool: PoolEnergy[], cost: EnergyType[]): number {
  const left = [...pool];
  for (const need of cost.filter((t) => t !== 'colorless')) {
    const i = left.includes(need) ? left.indexOf(need) : left.indexOf('any');
    if (i >= 0) left.splice(i, 1);
  }
  return Math.max(0, cost.filter((t) => t === 'colorless').length - left.length);
}

const provides = (cards: CardLibrary, card: CardInstance): PoolEnergy[] => {
  const { type, amount } = energyProvided(card, cards);
  return Array<PoolEnergy>(amount).fill(type);
};

const poolWith = (cards: CardLibrary, p: InPlayPokemon, energy: CardInstance[]) => energyPool({ ...p, energy }, cards);

/** Fewest Energy still missing for any of the Pokémon's attacks (Infinity with no attacks). */
export function closeness(cards: CardLibrary, p: InPlayPokemon, energy = p.energy): number {
  const pool = poolWith(cards, p, energy);
  return Math.min(...pokemonDef(cards, p).attacks.map((a) => missingEnergy(pool, a.cost)));
}

/** What attaching `card` does for `p`: whether it helps any attack, makes a new one payable, and how close it gets. */
export function attachEffect(cards: CardLibrary, p: InPlayPokemon, card: CardInstance) {
  const attacks = pokemonDef(cards, p).attacks;
  const before = energyPool(p, cards);
  const after = [...before, ...provides(cards, card)];
  const helps = attacks.some((a) => missingEnergy(after, a.cost) < missingEnergy(before, a.cost));
  const enables = attacks.some((a) => missingEnergy(before, a.cost) > 0 && missingEnergy(after, a.cost) === 0);
  // Energy worth 2 (Double Colorless) only goes where two colorless symbols are still open.
  const { type, amount } = energyProvided(card, cards);
  const fits = amount < 2 || type !== 'colorless' || attacks.some((a) => colorlessLeft(before, a.cost) >= 2);
  return { helps: helps && fits, enables: enables && fits, closeness: Math.min(...attacks.map((a) => missingEnergy(after, a.cost))) };
}

/** How much the Pokémon's attached Energy is worth to it: payable attacks count most, then how close the others are. */
export function energyValue(cards: CardLibrary, p: InPlayPokemon, energy = p.energy): number {
  const pool = poolWith(cards, p, energy);
  return pokemonDef(cards, p).attacks.reduce((sum, a) => {
    const missing = missingEnergy(pool, a.cost);
    return sum + (missing === 0 ? 100 + a.damage : -missing);
  }, 0);
}

/** Every way to pick `n` of the cards (identical cards count once). */
export function combinations<T extends CardInstance>(items: T[], n: number): T[][] {
  const out: T[][] = [];
  const seen = new Set<string>();
  const walk = (start: number, picked: T[]) => {
    if (picked.length === n) {
      const key = picked.map((c) => `${c.defId}/${c.provides?.type ?? ''}`).sort().join(',');
      if (!seen.has(key)) seen.add(key), out.push(picked);
      return;
    }
    for (let i = start; i < items.length; i++) walk(i + 1, [...picked, items[i]!]);
  };
  walk(0, []);
  return out;
}

const isSpecial = (cards: CardLibrary, c: CardInstance) => !!c.provides || energyProvided(c, cards).amount > 1;

/**
 * The `n` Energy cards the Pokémon can best spare: the rest keep the most attacks payable. Ties keep
 * special Energy (Double Colorless) and discard basic Energy.
 */
export function spareEnergy(cards: CardLibrary, p: InPlayPokemon, n: number, options = p.energy): CardInstance[] | null {
  let best: { picked: CardInstance[]; score: number } | null = null;
  for (const picked of combinations(options, n)) {
    const score = energyValue(cards, p, p.energy.filter((e) => !picked.includes(e))) * 10 - picked.filter((e) => isSpecial(cards, e)).length;
    if (!best || score > best.score) best = { picked, score };
  }
  return best?.picked ?? null;
}

/** The `n` Energy cards whose loss hurts the Pokémon most (for discarding the opponent's). Ties take special Energy. */
export function vitalEnergy(cards: CardLibrary, p: InPlayPokemon, n: number): CardInstance[] | null {
  let best: { picked: CardInstance[]; score: number } | null = null;
  for (const picked of combinations(p.energy, n)) {
    const score = -energyValue(cards, p, p.energy.filter((e) => !picked.includes(e))) * 10 + picked.filter((e) => isSpecial(cards, e)).length;
    if (!best || score > best.score) best = { picked, score };
  }
  return best?.picked ?? null;
}

/**
 * Energy to discard to retreat: enough to pay `cost`, with no card more than needed (the engine's rule),
 * keeping what the Pokémon's attacks need most and basic Energy going before special Energy.
 */
export function retreatPayment(cards: CardLibrary, p: InPlayPokemon, cost: number): CardInstance[] | null {
  if (cost === 0) return [];
  let best: { picked: CardInstance[]; score: number } | null = null;
  for (let n = 1; n <= Math.min(cost, p.energy.length); n++) {
    for (const picked of combinations(p.energy, n)) {
      const amounts = picked.map((e) => energyProvided(e, cards).amount);
      const total = amounts.reduce((a, b) => a + b, 0);
      if (total < cost || amounts.some((a) => total - a >= cost)) continue;
      const score = energyValue(cards, p, p.energy.filter((e) => !picked.includes(e))) * 10 - picked.filter((e) => isSpecial(cards, e)).length;
      if (!best || score > best.score) best = { picked, score };
    }
  }
  return best?.picked ?? null;
}

// ---- Attacks, simulated ----

/**
 * Seeds whose first three coin flips are each of the 8 heads/tails patterns, so attacks with up to three
 * flips are averaged over every outcome equally.
 */
const SEEDS: number[] = Array.from({ length: 8 }, (_, pattern) => {
  for (let seed = 1; ; seed++) {
    let s = seed;
    const matches = [0, 1, 2].every((bit) => {
      const [r, next] = nextRandom(s);
      s = next;
      return (r < 0.5) === (((pattern >> bit) & 1) === 1);
    });
    if (matches) return seed;
  }
});

/** A copy to try things on. The log isn't needed for that. */
const scratch = (state: GameState): GameState => structuredClone({ ...state, log: [] });

/** One way to use an attack, and what it does on average. */
export interface AttackOption {
  attackIndex: number;
  choices: AttackChoices;
  /** Energy symbols in its cost. */
  cost: number;
  /** Share of coin-flip outcomes in which it Knocks Out one of the opponent's Pokémon. */
  koChance: number;
  /** Average damage done to the opponent's Pokémon, counting no more than each had left. */
  expected: number;
  /** It damages or Knocks Out the attacker, or discards its Energy. */
  costly: boolean;
  /** Average number of Special Conditions or Poison it inflicts. */
  inflicts: number;
  /** How much the attacker's Energy is still worth afterwards (choices that discard less come first). */
  keeps: number;
}

/** It Knocks Out often enough to count on: in at least half the outcomes. */
export const knocksOut = (o: AttackOption | null | undefined) => (o?.koChance ?? 0) >= 0.5;

/** Every complete set of answers to the attack's questions (a few dozen at most). */
function choiceSets(s: AttackSituation, attackIndex: number): AttackChoices[] {
  const out: AttackChoices[] = [];
  const walk = (given: AttackChoices) => {
    if (out.length >= 24) return;
    const result = resolveChoices(s, attackIndex, given);
    if ('choices' in result) return void out.push(result.choices);
    if (!result.need) return;
    for (const value of answers(result.need)) walk(answerChoice(given, result.need, value));
  };
  walk({});
  return out;
}

function answers(spec: ChoiceSpec): AttackChoices[keyof AttackChoices][] {
  switch (spec.kind) {
    case 'ownEnergy':
      return combinations(spec.options, spec.count).map((picked) => picked.map((e) => e.uid));
    case 'defenderEnergy':
    case 'pokemonEnergy':
      return combinations(spec.options, 1).map(([e]) => e!.uid);
    // Keeping energy first: on a tie the first choice wins.
    case 'ownEnergyUpTo': {
      const most = Math.min(spec.max ?? spec.options.length, spec.options.length);
      return Array.from({ length: most + 1 }, (_, n) => combinations(spec.options, n)).flat().map((picked) => picked.map((e) => e.uid));
    }
    // Taking the most cards first.
    case 'ownDiscard': {
      const sizes = Array.from({ length: Math.min(spec.max, spec.options.length) - spec.min + 1 }, (_, i) => Math.min(spec.max, spec.options.length) - i);
      return sizes.flatMap((n) => combinations(spec.options, n)).map((picked) => picked.map((c) => c.uid));
    }
    case 'opponentBenchMany':
      return slotCombinations(spec.options, Math.min(spec.count, spec.options.length));
    case 'eitherDiscard':
      return spec.options.map((c) => [c.uid]);
    case 'oppDiscard':
      return spec.options.map((c) => c.uid);
    // Vermilion City Gym: the CPU always flips (agreed). Charity: it never holds back.
    case 'vermilion':
      return [true];
    case 'charity':
      return [-1];
    default:
      return spec.options;
  }
}

/** Every way to pick `n` of the slots. */
function slotCombinations(slots: number[], n: number): number[][] {
  if (n === 0) return [[]];
  return slots.flatMap((slot, i) => slotCombinations(slots.slice(i + 1), n - 1).map((rest) => [slot, ...rest]));
}

/**
 * What each of `attackerId`'s attacks would do to the opponent now, one option per attack (its best
 * answers to the attack's questions). With `nextTurn`, it's the opponent's coming turn instead: effects
 * lasting "until the end of the opponent's next turn" still apply, and the first-turn rule doesn't.
 * Confusion is left out, since it affects every attack alike (the CPU retreats from it instead).
 */
export function attackOptions(state: GameState, attackerId: PlayerId, { nextTurn = false } = {}): AttackOption[] {
  const me = state.players[attackerId]!;
  const opp = state.players[opponentOf(state, attackerId)]!;
  if (!me.active || !opp.active || (!nextTurn && state.turn === 1)) return [];
  const base = scratch(state);
  if (nextTurn) base.turn += 1;
  const attacker = base.players[attackerId]!.active!;
  // A Pokémon Asleep now may wake up before its turn.
  if (attacker.condition === 'confused' || (nextTurn && attacker.condition === 'asleep')) attacker.condition = null;
  const situation = situationOf(base, attackerId);

  const options: AttackOption[] = [];
  pokemonDef(base.cards, attacker).attacks.forEach((attack, attackIndex) => {
    if (attackError(situation, attackIndex)) return;
    let best: AttackOption | null = null;
    for (const choices of choiceSets(situation, attackIndex)) {
      const option = simulate(base, attackerId, attackIndex, choices, attack.cost.length);
      if (option && (!best || compareOptions(option, best) > 0)) best = option;
    }
    if (best) options.push(best);
  });
  return options;
}

/** The attacker's side of `state` for the attack rules (attackError, choiceSets). */
function situationOf(state: GameState, attackerId: PlayerId): AttackSituation {
  const me = state.players[attackerId]!;
  const opp = state.players[opponentOf(state, attackerId)]!;
  // The Stadium (Vermilion City Gym's question) and Recall too.
  return attackSituation(state, me, opp);
}

/** The least and most damage an attack does to the Defending Pokémon. */
export interface DamageRange {
  min: number;
  max: number;
}

/**
 * What each of `attackerId`'s attacks would do to the Defending Pokémon now: the least and most damage over every
 * coin-flip pattern and every answer to its questions, worked out like attackOptions by playing it on copies (so
 * "10+" and "20×" attacks, weakness, resistance, PlusPower and Defender all count). Null for an attack that can't be
 * used now. Confusion is left out, as it is for attackOptions. For the player's attack list.
 */
export function attackDamageRanges(state: GameState, attackerId: PlayerId): (DamageRange | null)[] {
  const me = state.players[attackerId]!;
  const opp = state.players[opponentOf(state, attackerId)]!;
  if (!me.active || !opp.active) return [];
  const base = scratch(state);
  const attacker = base.players[attackerId]!.active!;
  if (attacker.condition === 'confused') attacker.condition = null;
  const situation = situationOf(base, attackerId);
  return pokemonDef(base.cards, attacker).attacks.map((_, attackIndex) => {
    if (attackError(situation, attackIndex)) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const choices of choiceSets(situation, attackIndex)) {
      for (const seed of SEEDS) {
        const s = structuredClone(base);
        s.rngState = seed;
        const defender = s.players[opp.id]!.active!;
        const before = defender.damage;
        try {
          if (performAttack(s, s.players[attackerId]!, s.players[opp.id]!, attackIndex, choices)) continue;
        } catch {
          continue;
        }
        min = Math.min(min, defender.damage - before);
        max = Math.max(max, defender.damage - before);
      }
    }
    return min === Infinity ? null : { min, max };
  });
}

function simulate(base: GameState, attackerId: PlayerId, attackIndex: number, choices: AttackChoices, cost: number): AttackOption | null {
  let kos = 0, damage = 0, inflicts = 0, costly = false, keeps = 0;
  for (const seed of SEEDS) {
    const s = structuredClone(base);
    s.rngState = seed;
    const me = s.players[attackerId]!;
    const opp = s.players[opponentOf(s, attackerId)]!;
    const attacker = me.active!;
    const before = new Map(inPlay(opp).map(([, p]) => [p.card.uid, { damage: p.damage, hp: pokemonDef(s.cards, p).hp, condition: p.condition ?? null, poison: p.poison ?? 0, burned: !!p.burned }]));
    const self = { damage: attacker.damage, energy: attacker.energy.length };
    let error: string | null;
    try {
      error = performAttack(s, me, opp, attackIndex, choices);
    } catch {
      return null;
    }
    if (error) return null;
    let ko = false;
    for (const [, p] of inPlay(opp)) {
      const was = before.get(p.card.uid);
      if (!was) continue;
      damage += Math.max(0, Math.min(p.damage, was.hp) - was.damage);
      if (p.damage >= was.hp) ko = true;
      if ((p.condition ?? null) !== was.condition && p.condition) inflicts++;
      if ((p.poison ?? 0) > was.poison) inflicts++;
      if (p.burned && !was.burned) inflicts++;
    }
    if (ko) kos++;
    if (attacker.damage > self.damage || attacker.energy.length < self.energy) costly = true;
    keeps += energyValue(s.cards, attacker);
  }
  const n = SEEDS.length;
  return { attackIndex, choices, cost, koChance: kos / n, expected: damage / n, costly, inflicts: inflicts / n, keeps: keeps / n };
}

/** Positive when `a` is the better way to attack: Knock Outs (cheapest first), then damage, then effects. */
function compareOptions(a: AttackOption, b: AttackOption): number {
  if (knocksOut(a) !== knocksOut(b)) return knocksOut(a) ? 1 : -1;
  if (knocksOut(a)) return b.cost - a.cost || a.koChance - b.koChance || a.expected - b.expected || a.keeps - b.keeps;
  return a.expected - b.expected || a.koChance - b.koChance || a.inflicts - b.inflicts || a.keeps - b.keeps;
}

/**
 * The attack to use: the cheapest one that Knocks Out, otherwise the most damage. Attacks that hurt the
 * attacker or discard its Energy only when they Knock Out or nothing else does damage. Attacking ends the
 * turn anyway, so with no damage to do, any attack that costs nothing (Sing, Withdraw) beats passing.
 */
export function bestAttack(options: AttackOption[]): AttackOption | null {
  const ko = options.filter(knocksOut);
  if (ko.length) return ko.reduce((a, b) => (compareOptions(b, a) > 0 ? b : a));
  const pick = (list: AttackOption[]) => (list.length ? list.reduce((a, b) => (compareOptions(b, a) > 0 ? b : a)) : null);
  return (
    pick(options.filter((o) => !o.costly && o.expected > 0)) ??
    pick(options.filter((o) => o.costly && o.expected > 0)) ??
    pick(options.filter((o) => !o.costly))
  );
}

/** One number for comparing positions: Knock Outs first, then expected damage. */
export const attackScore = (o: AttackOption | null) => (o ? (knocksOut(o) ? 10_000 : 0) + o.koChance * 100 + o.expected : -1);

/** Whether the option does damage or Knocks Out (i.e. the Pokémon can really attack). */
export const damages = (o: AttackOption | null) => !!o && (o.expected > 0 || o.koChance > 0);

/** The CPU's best attack with the benched Pokémon in `slot` as its Active Pokémon instead. */
export function attackAsActive(state: GameState, playerId: PlayerId, slot: number): AttackOption | null {
  return bestAttack(attackOptions(swapIn(state, playerId, slot), playerId));
}

/** A copy where the benched Pokémon in `slot` and the active have swapped places (nothing else happens). */
export function swapIn(state: GameState, playerId: PlayerId, slot: number): GameState {
  const s = scratch(state);
  const me = s.players[playerId]!;
  [me.active, me.bench[slot]] = [me.bench[slot]!, me.active];
  return s;
}

/**
 * The opponent's most dangerous attack next turn against `playerId`'s Active Pokémon, with the Energy the
 * opponent's Active Pokémon has now. Its chance to Knock Out is the highest of any of its attacks.
 */
export function threat(state: GameState, playerId: PlayerId): { koChance: number; expected: number } {
  const options = attackOptions(state, opponentOf(state, playerId), { nextTurn: true });
  return { koChance: Math.max(0, ...options.map((o) => o.koChance)), expected: Math.max(0, ...options.map((o) => o.expected)) };
}

export const threatKnocksOut = (state: GameState, playerId: PlayerId) => threat(state, playerId).koChance >= 0.5;

// ---- Useful cards ----

/** Next-stage cards for the player's Pokémon in play: the Pokémon cards (by definition) they could evolve into. */
export function evolvesInto(cards: CardLibrary, side: Pick<PlayerState, 'active' | 'bench'>, candidate: CardDef): boolean {
  if (!isPokemonCard(candidate) || candidate.stage === 'basic') return false;
  const from = candidate.stage === 'stage2' ? 'stage1' : 'basic';
  return inPlay(side).some(([, p]) => {
    const current = pokemonDef(cards, p);
    return current.name === candidate.evolvesFrom && current.stage === from && !current.trainerText;
  });
}

/**
 * The cards among `pool` the player most wants to fetch: the next stage of a Pokémon in play (Active
 * Pokémon's line first) that isn't in the hand already, otherwise a Basic Pokémon when the Bench is empty
 * and there's none in the hand.
 */
export function wantedCards(state: GameState, me: PlayerState, pool: CardInstance[]): CardInstance[] {
  const def = (c: CardInstance) => lookupCard(state.cards, c.defId);
  const inHand = new Set(me.hand.map((c) => def(c).name));
  const lines = inPlay(me).map(([, p]) => pokemonDef(state.cards, p));
  const evolutions = pool.filter((c) => !inHand.has(def(c).name) && evolvesInto(state.cards, me, def(c)));
  // Lines in the order their Pokémon are in play, so the active's evolution comes first.
  evolutions.sort((a, b) => lineIndex(lines, def(a)) - lineIndex(lines, def(b)));
  if (evolutions.length) return evolutions;
  const benchEmpty = !me.bench.some(Boolean);
  const basicInHand = me.hand.some((c) => isBasicPokemon(def(c)));
  return benchEmpty && !basicInHand ? pool.filter((c) => isBasicPokemon(def(c))) : [];
}

const lineIndex = (lines: PokemonCardDef[], d: CardDef) => lines.findIndex((l) => d.kind === 'pokemon' && l.name === d.evolvesFrom);

/**
 * Pokémon cards in the hand the player can't use: an Evolution with nothing in play or in the hand to
 * evolve from, or a Basic when the Bench is full.
 */
export function unusablePokemon(state: GameState, me: PlayerState, except?: CardInstance): CardInstance[] {
  const def = (c: CardInstance) => lookupCard(state.cards, c.defId);
  const names = new Set([...inPlay(me).map(([, p]) => pokemonDef(state.cards, p).name), ...me.hand.filter((c) => c !== except).map((c) => def(c).name)]);
  const benchFull = openBenchSlot(me.bench, state.cards, state.stadium?.card) < 0;
  return me.hand.filter((c) => {
    const d = def(c);
    if (c === except || !isPokemonCard(d)) return false;
    return d.stage === 'basic' ? benchFull : !names.has(d.evolvesFrom ?? '');
  });
}

/** Basic Energy cards in the hand that no attack of the player's Pokémon (in play or in the hand) can use. */
export function unusableEnergy(state: GameState, me: PlayerState): CardInstance[] {
  const def = (c: CardInstance) => lookupCard(state.cards, c.defId);
  const pokemon = [...inPlay(me).map(([, p]) => pokemonDef(state.cards, p)), ...me.hand.map(def).filter(isPokemonCard)];
  const costs = pokemon.flatMap((p) => p.attacks.flatMap((a) => a.cost));
  return me.hand.filter((c) => {
    const d = def(c);
    return d.kind === 'energy' && !costs.includes('colorless') && !costs.includes(d.energyType);
  });
}

// ---- Playing a turn ----

/** One CPU turn: the state, whose move it is, both players and card definitions. */
export interface Turn {
  state: GameState;
  id: PlayerId;
  me: PlayerState;
  opp: PlayerState;
  def: (c: CardInstance) => CardDef;
}

export function turnOf(state: GameState, id: PlayerId): Turn {
  return { state, id, me: state.players[id]!, opp: state.players[opponentOf(state, id)]!, def: (c) => lookupCard(state.cards, c.defId) };
}

/** A Trainer card in the hand by nameKey. */
export const trainer = (t: Turn, key: string) => t.me.hand.find((c) => isTrainerCard(t.def(c)) && nameKey(t.def(c).name) === key);

/** Playing the card with these answers, if that's allowed. */
export function play(t: Turn, card: CardInstance | undefined, choices?: TrainerChoices): GameAction | null {
  if (!card) return null;
  const action: GameAction = { type: 'PLAY_TRAINER', cardUid: card.uid, ...(choices && { choices }) };
  return tryAction(t.state, t.id, action) ? action : null;
}

export const benched = (t: Turn) => inPlay(t.me).filter(([target]) => target !== 'active') as [number, InPlayPokemon][];

/** Finishing a search: the most wanted card (see wantedCards), a Basic, an Energy that helps, or anything. Pokédex keeps the order. */
/** Challenge! (agreed): the CPU accepts whenever its Bench has room and its deck has a Basic Pokémon. */
export const acceptsChallenge = (state: GameState, cpu: PlayerState) =>
  openBenchSlot(cpu.bench, state.cards, state.stadium?.card) >= 0 && cpu.deck.some((c) => isBasicPokemon(lookupCard(state.cards, c.defId)));

export function resolveSearch(t: Turn): GameAction {
  const view = pendingChoiceView(t.state, t.state.pendingChoice!);
  if (view.kind === 'challenge') return { type: 'RESOLVE_CHOICE', count: acceptsChallenge(t.state, t.me) ? 1 : 0 };
  if (view.kind === 'arrangeTop') return { type: 'RESOLVE_CHOICE', order: view.cards.map((c) => c.uid) };
  // Lt. Surge's Treaty: both take a Prize card unless that helps the other player more (they have fewer left).
  if (view.kind === 'options') return { type: 'RESOLVE_CHOICE', count: optionAnswer(t, view.labels.length) };
  // Flee and Koga's Ninja Trick: it switches out when its Active Pokémon has 40 HP or less left, to the benched Pokémon with the most HP left.
  const choice = t.state.pendingChoice!;
  if ((choice.kind === 'flee' || choice.kind === 'ninjaTrick') && view.kind === 'ownPokemon') {
    const left = (target: Target) => hpLeft(t.state.cards, at(t.me, target)!);
    if (!view.options.length || left('active') > 40) return { type: 'RESOLVE_CHOICE' };
    return { type: 'RESOLVE_CHOICE', target: view.options.reduce((a, b) => (left(b) > left(a) ? b : a)) };
  }
  // Returning its own Pokémon to the hand (Fairy Power): it keeps them in play.
  if (view.kind === 'ownPokemon' && view.optional) return { type: 'RESOLVE_CHOICE' };
  // Healing one of its Pokémon (Heal): the one with the most damage. Attaching (Energy Spike): the active.
  if (view.kind === 'ownPokemon') {
    if (view.purpose === 'attach') return { type: 'RESOLVE_CHOICE', target: view.options.includes('active') ? 'active' : view.options[0] };
    // Taking damage from the player's attack (Cat Punch): the benched Pokémon with the most HP left.
    if (view.purpose === 'benchDamage') {
      const left = (target: Target) => hpLeft(t.state.cards, at(t.me, target)!);
      return { type: 'RESOLVE_CHOICE', target: view.options.reduce((a, b) => (left(b) > left(a) ? b : a)) };
    }
    const damage = (target: Target) => at(t.me, target)!.damage;
    return { type: 'RESOLVE_CHOICE', target: view.options.reduce((a, b) => (damage(b) > damage(a) ? b : a)) };
  }
  // Damage to one of the player's Pokémon (Sneak Attack): the one with the least HP left, the Active Pokémon on a tie.
  if (view.kind === 'oppPokemon') {
    const left = (target: Target) => hpLeft(t.state.cards, at(t.opp, target)!);
    return { type: 'RESOLVE_CHOICE', target: view.options.reduce((a, b) => (left(b) < left(a) ? b : a)) };
  }
  // Computer Error: always the most cards (agreed).
  if (view.kind === 'drawCount') return { type: 'RESOLVE_CHOICE', count: view.max };
  if (choice.kind === 'attachFromHand' && view.kind === 'pickFromHand') return view.options[0] ? { type: 'RESOLVE_CHOICE', cardUid: view.options[0].uid } : { type: 'RESOLVE_CHOICE' };
  // Secret Mission: only cards it can't use (Energy no attack needs, Pokémon it can't play) go, then it draws as many.
  if (choice.kind === 'discardDraw') {
    const junk = [...unusableEnergy(t.state, t.me), ...unusablePokemon(t.state, t.me)][0];
    return junk ? { type: 'RESOLVE_CHOICE', cardUid: junk.uid } : { type: 'RESOLVE_CHOICE' };
  }
  // Special Delivery: the card it wants least goes back on the deck. Sleight of Hand ("up to"): only cards it doesn't want.
  if (view.kind === 'pickFromHand') {
    const wanted = wantedCards(t.state, t.me, view.options);
    const pick = view.options.find((c) => !wanted.includes(c)) ?? (view.optional ? undefined : view.options.at(-1));
    return pick ? { type: 'RESOLVE_CHOICE', cardUid: pick.uid } : { type: 'RESOLVE_CHOICE' };
  }
  // Super Removal, Energy Drain: an Energy card of the player's Pokémon, the first. Growth: every Grass Energy card it can.
  if (choice.kind === 'removeEach' || choice.kind === 'drainEnergy') return view.kind === 'pickAttached' && view.options[0] ? { type: 'RESOLVE_CHOICE', cardUid: view.options[0].uid } : { type: 'RESOLVE_CHOICE' };
  // Pure Body: the Energy card that leaves Suicune closest to attacking.
  if (view.kind === 'pickAttached') {
    const p = inPlay(t.me).map(([, p]) => p).find((p) => p.energy.includes(view.options[0]!))!;
    const without = (c: CardInstance) => closeness(t.state.cards, p, p.energy.filter((e) => e !== c));
    const pick = view.options.reduce((a, b) => (without(b) < without(a) ? b : a));
    return { type: 'RESOLVE_CHOICE', cardUid: pick.uid };
  }
  const helpsEnergy = (c: CardInstance) => t.def(c).kind === 'energy' && inPlay(t.me).some(([, p]) => closeness(t.state.cards, p, [...p.energy, c]) < closeness(t.state.cards, p));
  const pick =
    wantedCards(t.state, t.me, view.options)[0] ??
    view.options.find((c) => isBasicPokemon(t.def(c))) ??
    view.options.find(helpsEnergy) ??
    view.options[0];
  return pick ? { type: 'RESOLVE_CHOICE', cardUid: pick.uid } : { type: 'RESOLVE_CHOICE' };
}

/**
 * An answer to a choice between labelled options. Lt. Surge's Treaty: both take a Prize card unless that helps the other
 * player more (they have fewer left). Bench Guard: Brock's Rhydon takes the 10 if that doesn't Knock it Out. Blaine's
 * Quiz #1: a guess at random. Otherwise the first (Sabrina's ESP: keep the flips).
 */
function optionAnswer(t: Turn, count: number): number {
  const choice = t.state.pendingChoice!;
  if (choice.kind === 'treaty') return t.me.prizes.length > t.opp.prizes.length ? 1 : 0;
  if (choice.kind === 'benchGuard') {
    const rhydon = t.me.bench[choice.guard];
    return rhydon && hpLeft(t.state.cards, rhydon) > 10 ? 0 : 1;
  }
  if (choice.kind === 'quiz' || choice.kind === 'guess') return Math.floor(nextRandom(t.state.rngState)[0] * count);
  // Misty's Wish: it declines (agreed); for its own, the first Prize card.
  if (choice.kind === 'mistysWish' && choice.step === 'ask') return 1;
  return 0;
}

/**
 * Chaos Gym, on the player's tails: the CPU plays the card itself if it's what it would do first on a turn of its own with
 * only that card in hand (`decide` is its difficulty's move); otherwise it lets the card go.
 */
export function borrowedTrainerMove(state: GameState, cpuId: PlayerId, decide: (state: GameState, cpuId: PlayerId) => GameAction | null): GameAction {
  const uid = state.borrowed?.uid;
  const scratch = structuredClone(state);
  delete scratch.pendingChoice;
  scratch.currentPlayer = cpuId;
  scratch.energyAttachedThisTurn = true;
  scratch.retreatedThisTurn = true;
  scratch.players[cpuId]!.hand = scratch.players[cpuId]!.hand.filter((c) => c.uid === uid);
  const action = decide(scratch, cpuId);
  if (action?.type === 'PLAY_TRAINER' && action.cardUid === uid && tryAction(state, cpuId, action)) return action;
  return { type: 'RESOLVE_CHOICE' };
}

/** Puts a Basic Pokémon from the hand onto the Bench, while there's room. */
export function benchBasic(t: Turn): GameAction | null {
  const empty = openBenchSlot(t.me.bench, t.state.cards, t.state.stadium?.card);
  const basic = t.me.hand.find((c) => isBasicPokemon(t.def(c)));
  return empty >= 0 && basic ? { type: 'PLAY_BENCH', cardUid: basic.uid, slot: empty } : null;
}

/** Evolves whatever can evolve: the Active Pokémon first, then the Bench in order. */
export function evolve(t: Turn): GameAction | null {
  for (const [target, p] of inPlay(t.me)) {
    for (const card of t.me.hand) {
      const evolution = t.def(card);
      if (evolution.kind !== 'pokemon' || evolution.stage === 'basic') continue;
      if (evolveError(evolution, p, t.state.cards, t.state.turn, [t.me, t.opp]) === null) return { type: 'EVOLVE', cardUid: card.uid, target };
    }
  }
  return null;
}

/** Energy cards in the hand: all of them, or basic Energy of one type. */
export const energyInHand = (t: Turn, type?: EnergyType) =>
  t.me.hand.filter((c) => {
    const d = t.def(c);
    return d.kind === 'energy' && (!type || (d.energyType === type && d.basic !== false));
  });

/**
 * Where to attach one of `energy`: the Active Pokémon if it makes a new attack payable, otherwise the
 * benched Pokémon it brings closest to attacking, otherwise the Active Pokémon if it helps at all.
 * Never Energy that helps no attack. Basic Energy is tried before special Energy.
 */
export function attachTarget(t: Turn, energy: CardInstance[], allowed: (p: InPlayPokemon) => boolean): { card: CardInstance; target: Target } | null {
  const cards = t.state.cards;
  const special = (c: CardInstance) => Number(!isBasicEnergy(t.def(c)));
  const ordered = [...energy].sort((a, b) => special(a) - special(b));
  const active = t.me.active && allowed(t.me.active) ? t.me.active : null;
  const effect = (p: InPlayPokemon, card: CardInstance) => attachEffect(cards, p, card);
  if (active) {
    const card = ordered.find((c) => effect(active, c).enables);
    if (card) return { card, target: 'active' };
  }
  let best: { card: CardInstance; target: Target; closeness: number } | null = null;
  for (const [target, p] of benched(t).filter(([, p]) => allowed(p))) {
    for (const card of ordered) {
      const e = effect(p, card);
      if (e.helps && (!best || e.closeness < best.closeness)) best = { card, target, closeness: e.closeness };
    }
  }
  if (best) return best;
  const card = active && ordered.find((c) => effect(active, c).helps);
  return card ? { card, target: 'active' } : null;
}

/** Whether the Pokémon can discard one Energy and still pay for the strongest attack it can pay for now. */
export function keepsBestAttack(t: Turn, p: InPlayPokemon): boolean {
  const cards = t.state.cards;
  const pool = energyPool(p, cards);
  const payable = pokemonDef(cards, p).attacks.filter((a) => missingEnergy(pool, a.cost) === 0);
  if (!payable.length) return true;
  const strongest = payable.reduce((a, b) => (b.damage > a.damage ? b : a));
  const spare = spareEnergy(cards, p, 1);
  return !!spare && missingEnergy(energyPool({ ...p, energy: p.energy.filter((e) => !spare.includes(e)) }, cards), strongest.cost) === 0;
}

/** Each benched Pokémon with its best attack if it were the Active Pokémon. */
export const benchAttackers = (t: Turn) => benched(t).map(([slot, p]) => ({ slot, p, best: attackAsActive(t.state, t.id, slot) }));

/** The one that attacks best, then the one with the most HP left. */
export function strongestOf<T extends { p: InPlayPokemon; best: AttackOption | null }>(cards: CardLibrary, list: T[]): T {
  return list.reduce((a, b) => {
    const diff = attackScore(b.best) - attackScore(a.best);
    return diff > 0 || (diff === 0 && hpLeft(cards, b.p) > hpLeft(cards, a.p)) ? b : a;
  });
}

/**
 * Brings the benched Pokémon in `slot` in: with Switch if it's in the hand, otherwise by retreating,
 * paying with the Energy the active can best spare. Not worth paying for when nothing could attack
 * afterwards anyway (`bench` from benchAttackers).
 */
export function switchOrRetreat(t: Turn, slot: number, bench: { best: AttackOption | null }[]): GameAction | null {
  const cards = t.state.cards;
  const active = t.me.active!;
  const sw = play(t, trainer(t, 'switch'), { target: slot });
  if (sw) return sw;
  if (retreatError(active, cards, true, t.state.retreatedThisTurn ?? false, [t.me, t.opp], t.state.stadium?.card)) return null;
  const payment = retreatPayment(cards, active, retreatCost(active, cards, [t.me, t.opp], t.state.stadium?.card));
  if (!payment) return null;
  const left = { ...active, energy: active.energy.filter((e) => !payment.includes(e)) };
  const oldCanAttack = pokemonDef(cards, active).attacks.some((a) => missingEnergy(energyPool(left, cards), a.cost) === 0);
  if (!bench.some((b) => damages(b.best)) && !oldCanAttack) return null;
  const action: GameAction = { type: 'RETREAT', slot, energyUids: payment.map((e) => e.uid) };
  return tryAction(t.state, t.id, action) ? action : null;
}

/** Whether the active can't attack now and won't next turn either (one Energy short is "next turn"). */
export function stuckActive(t: Turn): boolean {
  const active = t.me.active!;
  const pool = energyPool(active, t.state.cards);
  const soon = pokemonDef(t.state.cards, active).attacks.some((a) => missingEnergy(pool, a.cost) <= 1);
  return !damages(bestAttack(attackOptions(t.state, t.id))) && !soon;
}

/** The ATTACK action for an option, or null with none. */
export const attackWith = (o: AttackOption | null): GameAction | null => (o ? { type: 'ATTACK', attackIndex: o.attackIndex, choices: o.choices } : null);
