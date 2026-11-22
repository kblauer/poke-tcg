import { describe, expect, it } from 'vitest';
import { allUnits } from './species.js';
import { GENERATIONS_IN_PLAY, KEYWORDS_BY_GENERATION, KEYWORDS_IN_PLAY, KEYWORD_NAMES, TOP_TIER, UNIT_TYPES, abilityName, keywordGeneration, keywordInPlay, parseAbility, unitEvolvesFrom } from './units.js';

const units = allUnits();
const byName = new Map(units.map((u) => [u.name, u]));

describe('the units', () => {
  it('are Pokédex #1–386, one each, with different names', () => {
    expect(units.map((u) => u.dex)).toEqual(Array.from({ length: 386 }, (_, i) => i + 1));
    expect(units.map((u) => u.id)).toEqual(units.map((u) => String(u.dex)));
    expect(byName.size).toBe(386);
  });

  it('have numbers in multiples of 10, a tier of 1 to 5, one of the nine types and at most 3 keywords', () => {
    for (const u of units) {
      expect(u.attack % 10, u.name).toBe(0);
      expect(u.hp % 10, u.name).toBe(0);
      expect(u.attack, u.name).toBeGreaterThanOrEqual(0);
      expect(u.hp, u.name).toBeGreaterThan(0);
      expect(u.tier >= 1 && u.tier <= TOP_TIER, u.name).toBe(true);
      expect(UNIT_TYPES, u.name).toContain(u.type);
      expect(u.abilities.length, u.name).toBeLessThanOrEqual(3);
      expect(new Set(u.abilities.map((a) => a.k)).size, u.name).toBe(u.abilities.length);
    }
  });

  it('give a number to the keywords that take one, a type to Bane, and none to the others', () => {
    const numbered = new Set(['Splash', 'Finisher', 'Bane', 'Barrage', 'Recoil', 'Enrage', 'Rampage', 'Grow', 'Scavenger', 'Armor', 'Thorns', 'Regen', 'Rally', 'Fortify', 'Pack', 'Guardian', 'Mend', 'Baton Pass', 'Legacy', 'Vanguard', 'Rearguard', 'Leader', 'Loner', 'Intimidate', 'Pounce', 'Explode', 'Memento', 'Weaken']);
    for (const u of units) {
      for (const a of u.abilities) {
        expect(KEYWORD_NAMES, `${u.name}: ${a.k}`).toContain(a.k);
        expect(a.n !== undefined, `${u.name}: ${abilityName(a)}`).toBe(numbered.has(a.k));
        expect(!!a.type, `${u.name}: ${abilityName(a)}`).toBe(a.k === 'Bane');
        if (a.n !== undefined) expect(a.n > 0 && a.n % 10 === 0, `${u.name}: ${abilityName(a)}`).toBe(true);
      }
    }
  });

  it("follow the games' lines: every evolved unit's Pokémon exists, stages count up, tiers rise", () => {
    for (const u of units) {
      if (!u.evolvesFrom) {
        expect(u.stage, u.name).toBe('basic');
        continue;
      }
      const from = byName.get(u.evolvesFrom)!;
      expect(from, u.name).toBeDefined();
      expect(u.stage, u.name).toBe(from.stage === 'basic' ? 'stage1' : 'stage2');
      expect(u.tier, u.name).toBeGreaterThan(from.tier);
      expect(unitEvolvesFrom(u, from.name)).toBe(true);
    }
    // A Pokémon with two stages above it leaves room for them.
    for (const u of units.filter((x) => x.stage === 'stage2')) expect(byName.get(byName.get(u.evolvesFrom!)!.evolvesFrom!)!.tier, u.name).toBeLessThanOrEqual(3);
    expect(byName.get('Raichu')).toMatchObject({ stage: 'stage2', evolvesFrom: 'Pikachu' });
    expect(units.filter((u) => u.evolvesFrom === 'Eevee').map((u) => u.name)).toEqual(['Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon']);
  });

  it('are all different cards within a tier', () => {
    const face = (u: (typeof units)[number]) => [u.tier, u.type, u.attack, u.hp, u.abilities.map(abilityName).join('; ')].join(' | ');
    const seen = new Map<string, string>();
    for (const u of units) {
      expect(seen.get(face(u)), `${u.name} is the same card as ${seen.get(face(u))}`).toBeUndefined();
      seen.set(face(u), u.name);
    }
  });

  it('mark the 21 legendaries, and every tier and type has units a shop can show', () => {
    expect(units.filter((u) => u.legendary).map((u) => u.name)).toEqual(['Articuno', 'Zapdos', 'Moltres', 'Mewtwo', 'Mew', 'Raikou', 'Entei', 'Suicune', 'Lugia', 'Ho-Oh', 'Celebi', 'Regirock', 'Regice', 'Registeel', 'Latias', 'Latios', 'Kyogre', 'Groudon', 'Rayquaza', 'Jirachi', 'Deoxys']);
    const shown = units.filter((u) => !u.legendary && u.stage !== 'stage2');
    for (let tier = 1; tier <= TOP_TIER; tier++) expect(shown.filter((u) => u.tier === tier).length, `tier ${tier}`).toBeGreaterThanOrEqual(10);
    // Everything a merge makes exists above it: a last Pokémon's tier is 3 or more.
    for (const u of units.filter((x) => x.stage === 'stage2')) expect(u.tier, u.name).toBeGreaterThanOrEqual(3);
    for (const type of UNIT_TYPES) expect(shown.filter((u) => u.type === type).length, type).toBeGreaterThanOrEqual(8);
  });

  it('use every keyword of the generations in play, and none kept for a later one', () => {
    expect(KEYWORD_NAMES).toHaveLength(64);
    expect(new Set(KEYWORD_NAMES).size).toBe(64);
    expect(Object.keys(KEYWORDS_BY_GENERATION)).toHaveLength(9);
    expect(GENERATIONS_IN_PLAY).toBe(3);
    expect(KEYWORDS_IN_PLAY).toHaveLength(30);
    expect([keywordGeneration('Taunt'), keywordGeneration('Armor'), keywordGeneration('Intimidate'), keywordGeneration('Pounce')]).toEqual([1, 2, 3, 9]);
    const used = new Set(units.flatMap((u) => u.abilities.map((a) => a.k)));
    expect(KEYWORD_NAMES.filter((k) => used.has(k) !== keywordInPlay(k))).toEqual([]);
  });

  it('have 1 keyword mostly, 2 on fewer than half, 3 on a select few legendaries', () => {
    const count = (n: number) => units.filter((u) => u.abilities.length === n);
    expect(count(3).length).toBeLessThanOrEqual(6);
    expect(count(3).every((u) => u.legendary)).toBe(true);
    expect(count(1).length).toBeGreaterThan(count(2).length);
    expect(count(2).length + count(3).length).toBeLessThan(units.length * 0.4);
  });
});

describe('a keyword as written', () => {
  it('parses its number and type', () => {
    expect(parseAbility('Taunt')).toEqual({ k: 'Taunt' });
    expect(parseAbility(' Splash 20')).toEqual({ k: 'Splash', n: 20 });
    expect(parseAbility('Baton Pass 10')).toEqual({ k: 'Baton Pass', n: 10 });
    expect(parseAbility('Bane water 20')).toEqual({ k: 'Bane', n: 20, type: 'water' });
    expect(abilityName(parseAbility('Bane water 20'))).toBe('Bane Water 20');
    expect(() => parseAbility('Poison')).toThrow();
  });
});
