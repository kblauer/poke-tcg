// The engine's effect tables checked against the TCGdex snapshot the other way round from ex.test.ts and ecard.test.ts:
// every card id they name is a card in the snapshot (or a hand-made one), and every attack name an attack of that card,
// so a renamed or mistyped key can't leave an effect that never applies.
import { effectIds } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { catalogDef } from './test-pool.js';

/**
 * Attack names the tables have under the name the seed gives the card, which the test pool doesn't copy (TCGDEX_FIXES:
 * Southern Islands Marill's and Shining Tyranitar's attacks, Legendary Collection's two misspelt ones, re-seed for them),
 * and EX FireRed & LeafGreen's 107, whose effect is keyed on the printed spelling TCGdex doesn't use.
 */
const KNOWN: Record<string, string[]> = {
  'si1-11': ['Squirt'],
  'neo4-113': ['Mountain Crush', 'Destructive Fire'],
  'lc-14': ['Pin Missile'],
  'lc-78': ['Minimize'],
  'ecard1-96': ['Entangling Thread'],
  'ecard2-109': ['Doubleslap'],
  'ex6-107': ['Crush and Burn'],
};

const has = (id: string) => {
  try {
    catalogDef(id);
    return true;
  } catch {
    return false;
  }
};

describe('the effect tables', () => {
  const ids = effectIds();

  it('name only cards in the snapshot (attacks, powers, Trainers and special Energy)', () => {
    const named = [...Object.keys(ids.attacks), ...ids.powers, ...ids.trainers, ...ids.energy];
    expect(named.length).toBeGreaterThan(1000);
    expect([...new Set(named)].filter((id) => !has(id))).toEqual([]);
  });

  it("give attack effects only to attacks the card has (the seed's renames aside; a Technical Machine's or Stadium's attack is the Trainer card's own)", () => {
    const orphans: string[] = [];
    let trainers = 0;
    for (const [id, names] of Object.entries(ids.attacks)) {
      if (!has(id)) continue;
      const def = catalogDef(id);
      if (def.kind !== 'pokemon') {
        trainers++;
        continue;
      }
      const printed = def.attacks.map((a) => a.name);
      const allowed = KNOWN[id] ?? [];
      for (const name of names) if (!printed.includes(name) && !allowed.includes(name)) orphans.push(`${id} ${name} (has ${printed.join(', ') || 'no attacks'})`);
    }
    expect(orphans).toEqual([]);
    // The Technical Machines and the Stadiums with an attack (Fire Cube 01, Holon Lake…).
    expect(trainers).toBeGreaterThan(10);
  });
});
