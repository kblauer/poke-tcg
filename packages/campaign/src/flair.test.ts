import { describe, expect, it } from 'vitest';
import { HOLO_ENERGY_STYLES } from '../../db/prisma/holo-energy.js';
import { canHaveBorder, canSwitchPattern, flairFor, HOLO_PATTERNS, ownPattern, patternsFor } from './flair.js';

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
    expect(flairFor(plain, 'border').map((b) => b.key)).toEqual(['gold', 'rainbow', 'pastel']);
    expect(flairFor(holo, 'pattern')).toEqual(patternsFor(holo));
  });
});
