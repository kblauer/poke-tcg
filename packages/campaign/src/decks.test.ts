import { canPayCost, cardImplemented, isBasicPokemon, isPokemonCard, TRAINER_CPU_ENERGY, TRAINER_CPU_PLAYS, TRAINER_CPU_RULES, type PokemonCardDef } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { BOSSES, HOENN_ELITE_FOUR, HOENN_GYMS, JOHTO_ELITE_FOUR, JOHTO_GYMS } from './bosses.js';
import { DECK_SIZE, deckErrors, expandDeck, GEN1_DECK_RULES, GEN2_DECK_RULES, GEN3_DECK_RULES, generateDeck, STARTER_DECK, trainerFavorites } from './decks.js';
import { GEN2_SETS, GEN3_SETS, nameKey } from './pool.js';
import { rngFrom } from './random.js';
import { catalogDef, GEN2_TEST_POOL, GEN3_TEST_POOL, TEST_POOL, testDef } from './test-pool.js';

describe('fixed decks', () => {
  it('the starter deck is a legal 60-card deck of cards from the run pool', () => {
    expect(deckErrors(expandDeck(STARTER_DECK), testDef)).toEqual([]);
  });

  it('a deck holds only 1 of each Shining Pokémon and 1 Miracle Energy', () => {
    const starter = expandDeck(STARTER_DECK);
    const swap = (extra: string[]) => [...starter.slice(0, DECK_SIZE - extra.length), ...extra];
    expect(deckErrors(swap(['neo4-107', 'neo4-107']), catalogDef)).toEqual(['2 copies of Shining Charizard']);
    expect(deckErrors(swap(['neo4-16', 'neo4-16']), catalogDef)).toEqual(['2 copies of Miracle Energy']);
    expect(deckErrors(swap(['neo4-107', 'neo4-16']), catalogDef)).toEqual([]);
  });

  const johto = new Set<string>([...JOHTO_GYMS, ...JOHTO_ELITE_FOUR, 'johto-lance']);
  const hoenn = new Set<string>([...HOENN_GYMS, ...HOENN_ELITE_FOUR, 'wallace']);
  const kanto = Object.entries(BOSSES).filter(([id]) => !johto.has(id) && !hoenn.has(id));

  it.each(kanto)("%s's deck is a legal 60-card deck of catalog cards the engine fully implements", (_, b) => {
    const deck = expandDeck(b.deck);
    expect(deckErrors(deck, catalogDef)).toEqual([]);
    expect(deck.filter((id) => !cardImplemented(catalogDef(id)))).toEqual([]);
  });

  // Gen 2's card effects are still to come: its bosses' decks only need to be legal and Gen 2's.
  it.each([...johto])("%s's deck is a legal 60-card deck of Gen 2 cards, each evolution with its earlier stage", (id) => {
    const deck = expandDeck(BOSSES[id as keyof typeof BOSSES].deck);
    expect(deckErrors(deck, catalogDef)).toEqual([]);
    expect(deck.filter((c) => !GEN2_SETS.includes(c.split('-')[0]!))).toEqual([]);
    const names = new Set(deck.map((c) => catalogDef(c).name));
    expect(deck.map(catalogDef).filter((d) => isPokemonCard(d) && d.evolvesFrom && !names.has(d.evolvesFrom)).map((d) => d.name)).toEqual([]);
  });

  it.each([...hoenn])("%s's deck is a legal 60-card deck of Gen 3 cards the engine fully implements, each evolution with its earlier stage", (id) => {
    const deck = expandDeck(BOSSES[id as keyof typeof BOSSES].deck);
    expect(deckErrors(deck, catalogDef)).toEqual([]);
    expect(deck.filter((c) => !GEN3_SETS.includes(c.split('-')[0]!))).toEqual([]);
    expect(deck.filter((c) => !cardImplemented(catalogDef(c)))).toEqual([]);
    const names = new Set(deck.map((c) => catalogDef(c).name));
    expect(deck.map(catalogDef).filter((d) => isPokemonCard(d) && d.evolvesFrom && !names.has(d.evolvesFrom)).map((d) => d.name)).toEqual([]);
  });
});

describe('generateDeck', () => {
  const decks = Array.from({ length: 200 }, (_, seed) => generateDeck(TEST_POOL, rngFrom(seed)));

  it('builds legal 60-card decks with at least 8 Basic Pokémon', () => {
    for (const deck of decks) {
      expect(deckErrors(deck, testDef)).toEqual([]);
      expect(deck.filter((id) => isBasicPokemon(testDef(id))).length).toBeGreaterThanOrEqual(8);
    }
  });

  it('has 16–24 Pokémon, 12–16 Trainers and 20–28 Energy', () => {
    for (const deck of decks) {
      const defs = deck.map(testDef);
      const pokemon = defs.filter(isPokemonCard).length;
      const energy = defs.filter((d) => d.kind === 'energy').length;
      expect(pokemon).toBeGreaterThanOrEqual(16);
      expect(pokemon).toBeLessThanOrEqual(24);
      expect(60 - pokemon - energy).toBeGreaterThanOrEqual(12);
      expect(60 - pokemon - energy).toBeLessThanOrEqual(16);
      expect(energy).toBeGreaterThanOrEqual(20);
      expect(energy).toBeLessThanOrEqual(28);
    }
  });

  it("every Pokémon's attacks can be paid for with the deck's Energy", () => {
    for (const deck of decks) {
      const energy = deck.filter((id) => testDef(id).kind === 'energy').map((id, n) => ({ uid: `e${n}`, defId: id }));
      const cards = Object.fromEntries(deck.map((id) => [id, testDef(id)]));
      for (const d of new Set(deck.map(testDef).filter(isPokemonCard))) {
        const p = { card: { uid: 'p', defId: d.id }, evolvedFrom: [], damage: 0, energy, playedTurn: 0 };
        for (const a of (d as PokemonCardDef).attacks) expect(canPayCost(p, a, cards), `${d.name}: ${a.name}`).toBe(true);
      }
    }
  });

  it("with a type (a Gym Trainer's gym), most of the Energy is that type", () => {
    for (const type of ['fighting', 'water', 'lightning', 'grass', 'psychic', 'fire'] as const) {
      for (let seed = 0; seed < 20; seed++) {
        const deck = generateDeck(TEST_POOL, rngFrom(seed), { type }).map(testDef);
        expect(deckErrors(deck.map((d) => d.id), testDef)).toEqual([]);
        const energy = deck.filter((d) => d.kind === 'energy' && d.basic !== false);
        expect(energy.filter((d) => d.kind === 'energy' && d.energyType === type).length, `${type} seed ${seed}`).toBeGreaterThanOrEqual(energy.length / 2);
      }
    }
  });

  it('is the same deck for the same seed', () => {
    expect(generateDeck(TEST_POOL, rngFrom(42))).toEqual(generateDeck(TEST_POOL, rngFrom(42)));
  });

  it("holds only Trainers and special Energy the Trainer CPU plays, in a Trainer CPU's deck, in every generation", () => {
    const plays = new Set([...TRAINER_CPU_PLAYS, ...TRAINER_CPU_RULES, ...TRAINER_CPU_ENERGY, 'doublecolorlessenergy']);
    for (const [pool, rules] of [[TEST_POOL, GEN1_DECK_RULES], [GEN2_TEST_POOL, GEN2_DECK_RULES], [GEN3_TEST_POOL, GEN3_DECK_RULES]] as const) {
      for (let seed = 0; seed < 100; seed++) {
        for (const d of generateDeck(pool, rngFrom(seed), { rules, difficulty: 'trainer' }).map(catalogDef)) {
          if (d.kind === 'trainer' || (d.kind === 'energy' && d.basic === false)) expect(plays, d.name).toContain(nameKey(d.name));
        }
      }
    }
  });

  it("gives a gym leader's deck its disruption Trainers too", () => {
    const names = (difficulty: 'trainer' | 'gymLeader') => new Set(Array.from({ length: 50 }, (_, seed) => generateDeck(TEST_POOL, rngFrom(seed), { difficulty })).flat().map((id) => testDef(id).name));
    expect(names('gymLeader')).toContain('Energy Removal');
    expect(names('trainer')).not.toContain('Energy Removal');
  });
});

describe('trainer decks suit their name', () => {
  it("reads the trainer's class from their name", () => {
    expect(trainerFavorites('Swimmer Luis')).toContain('Tentacruel');
    expect(trainerFavorites('Bird Keeper Sebastian')).toContain('Pidgeot');
    expect(trainerFavorites('Cooltrainer Mary')).toBeUndefined();
  });

  it.each(['Swimmer Luis', 'Bug Catcher Rick', 'Hiker Marcos', 'Bird Keeper Sebastian', 'Psychic Tyron'])("%s's decks are legal, and nearly all their favourite Pokémon", (trainer) => {
    const favorites = trainerFavorites(trainer)!;
    for (let seed = 0; seed < 30; seed++) {
      const deck = generateDeck(TEST_POOL, rngFrom(seed), { favorites });
      expect(deckErrors(deck, testDef)).toEqual([]);
      // A line counts when its top card is a favourite (Abra → Kadabra counts, through Kadabra).
      const pokemon = deck.map(testDef).filter(isPokemonCard);
      const tops = pokemon.filter((d) => favorites.includes(d.name));
      const inFavoriteLine = pokemon.filter((d) => favorites.includes(d.name) || tops.some((t) => t.evolvesFrom === d.name || pokemon.some((m) => m.evolvesFrom === d.name && t.evolvesFrom === m.name)));
      expect(inFavoriteLine.length / pokemon.length, `${trainer} seed ${seed}`).toBeGreaterThanOrEqual(0.75);
    }
  });
});

describe('generateDeck for Gen 2', () => {
  const gen2Def = (id: string) => GEN2_TEST_POOL.find((c) => c.def.id === id)!.def;
  const decks = Array.from({ length: 100 }, (_, seed) => generateDeck(GEN2_TEST_POOL, rngFrom(seed), { rules: GEN2_DECK_RULES }));

  it("builds legal 60-card decks of Gen 2's cards only, with Gen 2's basic Energy and Trainers", () => {
    for (const deck of decks) {
      expect(deckErrors(deck, gen2Def)).toEqual([]);
      expect(deck.filter((id) => !GEN2_SETS.includes(id.split('-')[0]!))).toEqual([]);
      expect(deck.filter((id) => gen2Def(id).kind === 'trainer').length).toBeGreaterThanOrEqual(12);
    }
  });

  it("builds a Gym Trainer's deck from their gym's favourites when its type has no basic Energy", () => {
    const deck = generateDeck(GEN2_TEST_POOL, rngFrom(3), { favorites: BOSSES.falkner.gym.favorites, rules: GEN2_DECK_RULES });
    const names = new Set(deck.map((id) => gen2Def(id).name));
    expect(BOSSES.falkner.gym.favorites.filter((n) => names.has(n)).length).toBeGreaterThanOrEqual(3);
  });
});

describe('generateDeck for Gen 3', () => {
  const gen3Def = (id: string) => GEN3_TEST_POOL.find((c) => c.def.id === id)!.def;
  const decks = Array.from({ length: 100 }, (_, seed) => generateDeck(GEN3_TEST_POOL, rngFrom(seed), { rules: GEN3_DECK_RULES }));

  it("builds legal 60-card decks of Gen 3's cards only (the EX sets), with Gen 3's basic Energy and Trainers", () => {
    for (const deck of decks) {
      expect(deckErrors(deck, gen3Def)).toEqual([]);
      expect(deck.filter((id) => !GEN3_SETS.includes(id.split('-')[0]!))).toEqual([]);
      expect(deck.filter((id) => gen3Def(id).kind === 'trainer').length).toBeGreaterThanOrEqual(12);
    }
  });

  it("builds a Gym Trainer's deck from their gym's favourites when its type has no basic Energy (Norman's Normal)", () => {
    const deck = generateDeck(GEN3_TEST_POOL, rngFrom(3), { favorites: BOSSES.norman.gym.favorites, rules: GEN3_DECK_RULES });
    const names = new Set(deck.map((id) => gen3Def(id).name));
    expect(BOSSES.norman.gym.favorites.filter((n) => names.has(n)).length).toBeGreaterThanOrEqual(3);
  });
});
