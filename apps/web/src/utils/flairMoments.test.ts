import type { InPlayPokemon } from '@poke-tcg/game-engine';
import { describe, expect, it } from 'vitest';
import { findMoments, inPlay } from './flairMoments';

const card = (uid: string, defId = `base1-${uid}`) => ({ uid, defId });
const mon = (uid: string, under: string[] = []) => ({ card: card(uid), evolvedFrom: under.map((u) => card(u)), damage: 0, energy: [], playedTurn: 1 }) as unknown as InPlayPokemon;
const sides = (mine: [InPlayPokemon | null, (InPlayPokemon | null)[]], theirs: [InPlayPokemon | null, (InPlayPokemon | null)[]]) => ({
  mine: inPlay(...mine),
  theirs: inPlay(...theirs, 'cpu-'),
});

describe('flair moments', () => {
  const foe = mon('90');

  it('a Pokémon new to the bench comes into play; one on top of a Pokémon the player had evolves', () => {
    const before = sides([mon('1'), [mon('2'), null]], [foe, []]);
    const after = sides([mon('3', ['1']), [mon('2'), mon('4')]], [foe, []]);
    expect(findMoments(before, after, false, null)).toEqual([
      { defId: 'base1-3', moment: 'evolve', slot: 'active', delay: 0 },
      { defId: 'base1-4', moment: 'play', slot: 'bench-1', delay: 0 },
    ]);
  });

  it('switching places is no moment', () => {
    const a = mon('1');
    const b = mon('2');
    expect(findMoments(sides([a, [b]], [foe, []]), sides([b, [a]], [foe, []]), false, null)).toEqual([]);
  });

  it("an attack is the Active Pokémon attacking, and each of the opponent's Pokémon gone a Knock Out by it, on the slot it left", () => {
    const hitter = mon('1');
    const before = sides([hitter, []], [foe, [mon('91')]]);
    const after = sides([hitter, []], [null, [mon('91')]]);
    expect(findMoments(before, after, true, hitter)).toEqual([
      { defId: 'base1-1', moment: 'attack', slot: 'active', delay: 0 },
      { defId: 'base1-1', moment: 'ko', slot: 'cpu-active', delay: 200 },
    ]);
    // Without the player's attack, a Pokémon gone (Poison between turns) is nobody's Knock Out.
    expect(findMoments(before, after, false, hitter)).toEqual([]);
  });
});
