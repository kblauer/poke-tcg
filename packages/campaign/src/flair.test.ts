import { describe, expect, it } from 'vitest';
import { HOLO_ENERGY_STYLES } from '../../db/prisma/holo-energy.js';
import { canSwitchPattern, HOLO_PATTERNS, ownPattern, patternsFor } from './flair.js';

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
