// Deck lists: the starter deck, gym leaders' decks, and random medium-strength decks for the other trainers.
import { isBasicPokemon, isPokemonCard, type CardDef, type EnergyType, type PokemonCardDef } from '@poke-tcg/game-engine';
import { BASIC_ENERGY, DECK_TYPES, DOUBLE_COLORLESS, nameKey, type PoolCard } from './pool.js';
import { between, chance, pick, sample, type Rng } from './random.js';

/** [card id, copies] */
export type DeckList = [string, number][];

export const DECK_SIZE = 60;

/** Expands a deck list into one card id per card. */
export const expandDeck = (list: DeckList) => list.flatMap(([id, copies]) => Array<string>(copies).fill(id));

/**
 * The deck every account starts with: medium strength, Water and Lightning. Two evolution lines
 * (Poliwag 4-3-2, Pikachu 4-2), two Basics that attack on their own, 17 Trainers that draw, heal,
 * switch and disrupt, and 24 Energy.
 */
export const STARTER_DECK: DeckList = [
  ['base1-59', 4], // Poliwag
  ['base1-38', 3], // Poliwhirl
  ['base1-13', 2], // Poliwrath
  ['base3-10', 2], // Lapras
  ['base1-58', 4], // Pikachu
  ['base1-14', 2], // Raichu
  ['base1-20', 2], // Electabuzz
  ['base1-91', 3], // Bill
  ['base1-88', 1], // Professor Oak
  ['base2-64', 1], // Poké Ball
  ['base1-76', 1], // Pokémon Breeder
  ['base1-94', 2], // Potion
  ['base1-90', 1], // Super Potion
  ['base1-85', 1], // Pokémon Center
  ['base1-95', 2], // Switch
  ['base1-84', 2], // PlusPower
  ['base1-80', 1], // Defender
  ['base1-92', 1], // Energy Removal
  ['base1-93', 1], // Gust of Wind
  ['base1-102', 13], // Water Energy
  ['base1-100', 10], // Lightning Energy
  ['base1-96', 1], // Double Colorless Energy
];

/** An evolution line: the cards for each stage (one print of each), its type and how strong it is. */
interface Line {
  stages: PokemonCardDef[];
  type: EnergyType;
  /** Energy types (not Colorless) its attacks need. */
  needs: Set<EnergyType>;
  score: number;
}

/** Copies of each stage, by the length of the line. */
const LINE_COPIES: Record<number, number[]> = { 1: [3], 2: [4, 3], 3: [4, 3, 2] };

/** The best attack's base damage plus a quarter of its HP: a rough strength for the line's top card. */
const strength = (d: PokemonCardDef) => Math.max(0, ...d.attacks.map((a) => a.damage)) + d.hp / 4;

/** Every evolution line in the pool (Basics alone, Basic → Stage 1, Basic → Stage 1 → Stage 2), one random print per stage. */
function evolutionLines(pool: readonly PoolCard[], rng: Rng): Line[] {
  const pokemon = pool.map((c) => c.def).filter(isPokemonCard);
  const prints = (stage: PokemonCardDef['stage'], name: string, from?: string) =>
    pokemon.filter((d) => d.stage === stage && d.name === name && (from === undefined || d.evolvesFrom === from));
  const names = (stage: PokemonCardDef['stage'], from: string) => [...new Set(pokemon.filter((d) => d.stage === stage && d.evolvesFrom === from).map((d) => d.name))];
  const lines: PokemonCardDef[][] = [];
  for (const basic of new Set(pokemon.filter((d) => isBasicPokemon(d)).map((d) => d.name))) {
    const b = pick(rng, prints('basic', basic));
    lines.push([b]);
    for (const s1 of names('stage1', basic)) {
      const one = pick(rng, prints('stage1', s1, basic));
      lines.push([b, one]);
      for (const s2 of names('stage2', s1)) lines.push([b, one, pick(rng, prints('stage2', s2, s1))]);
    }
  }
  return lines.map((stages) => {
    const top = stages.at(-1)!;
    const needs = new Set(stages.flatMap((d) => d.attacks.flatMap((a) => a.cost)).filter((t) => t !== 'colorless'));
    return { stages, type: top.type, needs, score: strength(top) };
  });
}

/** A line from the middle of the strength ranking (not the best or worst fifth): medium strength. */
function mediumLine(rng: Rng, lines: Line[]): Line | null {
  if (!lines.length) return null;
  const ranked = [...lines].sort((a, b) => a.score - b.score);
  const cut = Math.floor(ranked.length / 5);
  return pick(rng, ranked.length >= 5 ? ranked.slice(cut, ranked.length - cut) : ranked);
}

/** Trainers by name, with copies: some in every deck, the rest picked at random. */
const CORE_TRAINERS: [string, number][] = [
  ['Bill', 3],
  ['Professor Oak', 1],
  ['Potion', 2],
  ['Switch', 2],
];
const EXTRA_TRAINERS: [string, number][] = [
  ['PlusPower', 2],
  ['Energy Removal', 2],
  ['Gust of Wind', 1],
  ['Super Potion', 1],
  ['Defender', 1],
  ['Full Heal', 1],
  ['Pokémon Center', 1],
  ['Poké Ball', 1],
  ['Energy Retrieval', 1],
  ['Energy Search', 1],
  ['Pokémon Trader', 1],
  ['Scoop Up', 1],
];

/**
 * A random 60-card deck of medium strength for a trainer, following the usual rules of deck building:
 * one or two Energy types, 2–4 evolution lines of middling strength (about 18–20 Pokémon, at least 8
 * of them Basic), 14–16 Trainers (draw, healing, switching, a little disruption) and the rest Energy,
 * split by what the attacks need. No more than 4 of any card but basic Energy. `type` makes a deck of just that
 * type (and Colorless).
 */
export function generateDeck(pool: readonly PoolCard[], rng: Rng, { type }: { type?: EnergyType } = {}): string[] {
  const all = evolutionLines(pool, rng);
  const mainTypes = DECK_TYPES.filter((t) => all.some((l) => l.type === t && l.stages.length > 1));
  // `type` (a Gym Trainer's gym) is the main type when the pool has evolution lines of it.
  const main = type && mainTypes.includes(type) ? type : pick(rng, mainTypes);
  // A Gym Trainer's deck sticks to its gym's type (Colorless Pokémon aside); others add a second type 60% of the time.
  const second = !type && chance(rng, 0.6) ? pick(rng, DECK_TYPES.filter((t) => t !== main)) : null;
  const types = new Set<EnergyType>([main, ...(second ? [second] : [])]);
  // A line fits if all its attacks can be paid with the deck's Energy.
  const fits = (l: Line, type: EnergyType) => l.type === type || (l.type === 'colorless' && [...l.needs].every((t) => types.has(t)));
  const usable = all.filter((l) => [...l.needs].every((t) => types.has(t)));

  const chosen: Line[] = [];
  const taken = new Set<string>();
  const add = (line: Line | null) => {
    if (!line || taken.has(line.stages[0]!.name)) return;
    chosen.push(line);
    taken.add(line.stages[0]!.name);
  };
  const candidates = (type: EnergyType, length: number) => usable.filter((l) => fits(l, type) && l.stages.length === length && !taken.has(l.stages[0]!.name));
  // The main attacker, of the main type: a Stage 2 line half the time, otherwise a Stage 1 line.
  const ofMain = (length: number) => candidates(main, length).filter((l) => l.type === main);
  add(mediumLine(rng, ofMain(chance(rng, 0.5) ? 3 : 2)) ?? mediumLine(rng, ofMain(2)) ?? mediumLine(rng, candidates(main, 2)));
  add(mediumLine(rng, candidates(second ?? main, 2)) ?? mediumLine(rng, candidates(second ?? main, 1)));
  const count = () => chosen.reduce((n, l) => n + LINE_COPIES[l.stages.length]!.reduce((a, b) => a + b, 0), 0);
  for (let tries = 0; count() < 18 && tries < 20; tries++) {
    const type = pick(rng, [...types]);
    add(mediumLine(rng, candidates(type, count() <= 14 ? 2 : 1)) ?? mediumLine(rng, candidates(type, 1)));
  }

  const deck: string[] = [];
  for (const line of chosen) line.stages.forEach((d, i) => deck.push(...Array<string>(LINE_COPIES[line.stages.length]![i]!).fill(d.id)));

  // Trainers: the core ones, Pokémon Breeder with a Stage 2 line, then random extras up to 14–16.
  const trainer = (name: string) => pool.find((c) => c.def.kind !== 'pokemon' || c.def.trainerText ? nameKey(c.def.name) === nameKey(name) : false)?.def.id;
  const trainerTarget = between(rng, 14, 16);
  const plan: [string, number][] = [...CORE_TRAINERS];
  if (chosen.some((l) => l.stages.length === 3)) plan.push(['Pokémon Breeder', 1]);
  for (const [name, copies] of sample(rng, EXTRA_TRAINERS, EXTRA_TRAINERS.length)) {
    if (plan.reduce((n, [, c]) => n + c, 0) >= trainerTarget) break;
    plan.push([name, copies]);
  }
  let trainers = 0;
  for (const [name, copies] of plan) {
    const id = trainer(name);
    const n = Math.min(copies, trainerTarget - trainers);
    if (!id || n <= 0) continue;
    deck.push(...Array<string>(n).fill(id));
    trainers += n;
  }

  // Energy: the rest, split by the Energy symbols in the attacks (weighted by copies), at least 4 of each
  // type used; Double Colorless when Colorless symbols are common.
  const symbols = new Map<EnergyType, number>();
  let colorless = 0;
  for (const id of deck) {
    const d = pool.find((c) => c.def.id === id)!.def;
    if (d.kind !== 'pokemon') continue;
    for (const t of d.attacks.flatMap((a) => a.cost)) {
      if (t === 'colorless') colorless++;
      else symbols.set(t, (symbols.get(t) ?? 0) + 1);
    }
  }
  if (!symbols.size) symbols.set(main, 1);
  let energy = DECK_SIZE - deck.length;
  const total = [...symbols.values()].reduce((a, b) => a + b, 0);
  if (colorless / (colorless + total) > 0.3 && energy > 10) {
    const dce = between(rng, 1, 2);
    deck.push(...Array<string>(dce).fill(DOUBLE_COLORLESS));
    energy -= dce;
  }
  const split = [...symbols.entries()].map(([t, n]) => [t, Math.max(4, Math.round((energy * n) / total))] as const);
  // Rounding can over- or undershoot: the main type takes up the difference.
  const sum = split.reduce((a, [, n]) => a + n, 0);
  for (const [i, [t, n]] of split.entries()) {
    const fix = i === 0 ? energy - sum : 0;
    deck.push(...Array<string>(Math.max(0, n + fix)).fill(BASIC_ENERGY[t]!));
  }
  while (deck.length < DECK_SIZE) deck.push(BASIC_ENERGY[split[0]![0]]!);
  return deck.slice(0, DECK_SIZE);
}

/** Checks the deck-building rules this game uses: 60 cards, at most 4 of a card but basic Energy, and a Basic Pokémon. */
export function deckErrors(deck: readonly string[], defs: (id: string) => CardDef): string[] {
  const errors: string[] = [];
  if (deck.length !== DECK_SIZE) errors.push(`The deck has ${deck.length} cards, not ${DECK_SIZE}`);
  const counts = new Map<string, number>();
  for (const id of deck) {
    const d = defs(id);
    if (d.kind === 'energy' && d.basic !== false) continue;
    counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
  }
  for (const [name, n] of counts) if (n > 4) errors.push(`${n} copies of ${name}`);
  if (!deck.some((id) => isBasicPokemon(defs(id)))) errors.push('No Basic Pokémon');
  return errors;
}
