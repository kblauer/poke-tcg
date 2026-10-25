import { describe, expect, it } from 'vitest';
import { HOLO_ENERGY_STYLES } from '../../db/prisma/holo-energy.js';
import { canHaveBorder, canSwitchPattern, EFFECT_PRICE, EFFECTS, effectFamilies, effectsFor, flairFor, HOLO_PATTERNS, ownPattern, PATTERN_PRICE, patternsFor, type EffectFamily } from './flair.js';
import { SPECIES_TYPES } from './species-types.js';

const plain = { holo: false, galaxy: false };
const holo = { holo: true, galaxy: false };
const galaxy = { holo: false, galaxy: true };
const galaxyArt = { holo: true, galaxy: true };

describe('holo patterns', () => {
  it('are the holo Energy styles', () => {
    expect(HOLO_PATTERNS).toEqual(HOLO_ENERGY_STYLES);
  });

  it('only holo rares and galaxy foils switch, never reverse-holo prints, holo Energy or non-holos', () => {
    expect(canSwitchPattern(holo)).toBe(true);
    expect(canSwitchPattern(galaxy)).toBe(true);
    expect(canSwitchPattern(galaxyArt)).toBe(true);
    expect(canSwitchPattern({ holo: false, galaxy: false })).toBe(false);
    expect(canSwitchPattern({ ...holo, reverseHolo: true })).toBe(false);
    expect(canSwitchPattern({ ...holo, holoEnergy: { key: 'rainbow' } })).toBe(false);
  });

  it("offer every style but the card's own", () => {
    expect(ownPattern(holo)).toBe('holo');
    expect(ownPattern(galaxy)).toBe('galaxy');
    expect(ownPattern(galaxyArt)).toBe('galaxy');
    expect(patternsFor(holo).map((p) => p.key)).not.toContain('holo');
    expect(patternsFor(galaxyArt).map((p) => p.key)).not.toContain('galaxy');
    expect(patternsFor(holo)).toHaveLength(HOLO_PATTERNS.length - 1);
    expect(patternsFor({ holo: false, galaxy: false })).toEqual([]);
  });
});

describe('effects', () => {
  // Kabutops (#141, Rock/Water in Generation 3), printed Fighting; a Stage 2.
  const kabutops = { ...plain, kind: 'POKEMON', stage: 'Stage2', type: 'Fighting', dexNumber: 141 };
  const charmander = { ...plain, kind: 'POKEMON', stage: 'Basic', type: 'Fire', dexNumber: 4 };
  const families = (card: typeof kabutops) => new Set(effectsFor(card, 'effect-play').map((e) => e.family));

  it("come from the species' Generation 3 types (Rock and Ground as earth) and the printed type, with the generic ones", () => {
    expect(effectFamilies(kabutops)).toEqual(new Set(['fighting', 'earth', 'water']));
    expect(families(kabutops)).toEqual(new Set(['fighting', 'earth', 'water', 'generic']));
    expect(families(charmander)).toEqual(new Set(['fire', 'generic']));
    // Clefairy (#35) was Normal before the Fairy type.
    expect(effectFamilies({ ...charmander, type: 'Colorless', dexNumber: 35 })).toEqual(new Set(['normal']));
  });

  it('only Pokémon, and evolving only for evolved ones', () => {
    expect(effectsFor({ ...plain, kind: 'TRAINER' }, 'effect-play')).toEqual([]);
    expect(effectsFor(charmander, 'effect-evolve')).toEqual([]);
    expect(effectsFor(kabutops, 'effect-evolve').length).toBeGreaterThan(0);
  });

  it('every family has an effect, each at the effect price, and every Pokémon from #1 to #386 has types', () => {
    const all = new Set(EFFECTS.map((e) => e.family));
    for (const types of SPECIES_TYPES) for (const t of types.split('/')) expect(all.has(t === 'rock' || t === 'ground' ? 'earth' : (t as EffectFamily))).toBe(true);
    expect(SPECIES_TYPES).toHaveLength(386);
    expect(new Set(EFFECTS.map((e) => e.price))).toEqual(new Set([EFFECT_PRICE]));
    expect(flairFor(kabutops, 'effect-ko')).toEqual(effectsFor(kabutops, 'effect-ko'));
  });
});

describe('borders', () => {
  it('only low-rarity cards: never a holo of any kind or basic Energy', () => {
    expect(canHaveBorder(plain)).toBe(true);
    expect(canHaveBorder(holo)).toBe(false);
    expect(canHaveBorder(galaxy)).toBe(false);
    expect(canHaveBorder({ ...plain, reverseHolo: true })).toBe(false);
    expect(canHaveBorder({ ...plain, holoEnergy: { key: 'rainbow' } })).toBe(false);
    expect(canHaveBorder({ ...plain, basicEnergy: true })).toBe(false);
  });

  it('a card gets patterns or a border, never both', () => {
    for (const card of [plain, holo, galaxy, galaxyArt]) expect(flairFor(card, 'pattern').length > 0 && flairFor(card, 'border').length > 0).toBe(false);
    expect(flairFor(plain, 'border').map((b) => b.key)).toEqual(['gold', 'rainbow', 'pastel', 'black']);
    expect(flairFor(holo, 'pattern').map((p) => p.key)).toEqual(patternsFor(holo).map((p) => p.key));
  });

  it('each at its own price: patterns 5000, gold 2000, the rainbows 5000', () => {
    expect(new Set(flairFor(holo, 'pattern').map((p) => p.price))).toEqual(new Set([PATTERN_PRICE]));
    expect(Object.fromEntries(flairFor(plain, 'border').map((b) => [b.key, b.price]))).toMatchObject({ gold: 2000, rainbow: 5000, pastel: 5000 });
  });
});
