import { evolvesOnto, type PokemonCardDef } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { catalogDef } from './test-pool.js';

describe('card fixes', () => {
  it("names a Pokémon LV.X for the Pokémon it levels up from, whatever TCGdex calls it (the user's: Luxray GL LV.X)", () => {
    // Platinum's are named "… LV.X" in TCGdex, Diamond & Pearl's plainly: both level up their Pokémon.
    for (const [lvx, from] of [['pl2-109', 'pl2-9'], ['pl3-145', 'pl3-60'], ['dp1-120', 'dp1-4']] as const) {
      const evolution = catalogDef(lvx) as PokemonCardDef;
      expect(evolution.stage).toBe('levelUp');
      expect(evolution.evolvesFrom).toBe(catalogDef(from).name);
      expect(evolvesOnto(evolution, catalogDef(from)), lvx).toBe(true);
    }
    expect(catalogDef('pl2-109').name).toBe('Luxray GL');
  });
});
