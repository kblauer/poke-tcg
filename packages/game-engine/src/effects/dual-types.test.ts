// Pokémon with two types (printed dual types, Energy Variation): every rule that checks a Pokémon's type goes through
// hasType/typesOf, so either type counts.
import { describe, expect, it } from 'vitest';
import { act, attack, C, duel, F, flips, G, give, id, mon, P, W } from './test-kit.js';
import { energyPool, type EnergyType, type GameState, type PokemonCardDef } from '../index.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

/** A 60 HP Basic Pokémon of two types with one Colorless attack for 30. */
const twin = (type: EnergyType, second: EnergyType): PokemonCardDef => mon(`test-twin-${type}-${second}`, 'Twin', type, 60, [['Tackle', [C], 30]], { types: [type, second] });

/** Puts `def` into the game's library and makes it a side's Active Pokémon, with the Energy given. */
function active(s: GameState, side: 'ash' | 'misty', def: PokemonCardDef, energy: string[] = []) {
  s.cards = { ...s.cards, [def.id]: def };
  s.players[side]!.active = { card: { uid: `${def.id}-${side}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e, i) => ({ uid: `${def.id}-e${i}`, defId: id(e) })), playedTurn: 0 };
}

describe('dual-typed Pokémon', () => {
  it("Weakness applies to a dual-typed attacker's second type too (Charmeleon is weak to Water)", () => {
    const s = duel('charmander', 'charmeleon');
    active(s, 'ash', twin(F, W), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    // Neither type: plain damage.
    const plain = duel('charmander', 'charmeleon');
    active(plain, 'ash', twin(F, G), ['fire']);
    expect(misty(attack(plain, 0)).active!.damage).toBe(30);
  });

  it("Resistance applies to a dual-typed attacker's second type too (Cool Porygon resists Psychic)", () => {
    const s = duel('charmander', 'porygonP');
    active(s, 'ash', twin(F, P), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it("Herbal Scent heals a dual-typed Grass Pokémon on either side", () => {
    const s = duel('bayleef', 'charmander');
    active(s, 'misty', twin(F, G));
    misty(s).active!.damage = 20;
    ash(s).active!.damage = 30;
    const [meganium] = give(s, 'ash', 'meganiumHerbal');
    let after = act(flips(s, true), 'ash', { type: 'EVOLVE', cardUid: meganium!, target: 'active' });
    expect(after.pendingChoice).toMatchObject({ kind: 'mayFlip', power: 'herbalScent' });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([ash(after).active!.damage, misty(after).active!.damage]).toEqual([0, 0]);
  });

  it("Wild Growth doubles the Grass Energy on a dual-typed Grass Pokémon of Meganium's owner", () => {
    let s = duel('charmander', 'squirtle', { bench: ['meganiumWild'] });
    active(s, 'ash', twin(W, G), ['grass']);
    s = act(act(s, 'ash', { type: 'END_TURN' }), 'misty', { type: 'END_TURN' });
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['grass', 'grass']);
  });

  it("Cinnabar City Gym: a dual-typed Water Pokémon's attack ignores Weakness on a Pokémon with Blaine in its name", () => {
    const s = duel('charmander', 'blainesGrowlithe');
    active(s, 'ash', twin(F, W), ['fire']);
    const growlithe = s.cards[id('blainesGrowlithe')] as PokemonCardDef;
    expect(growlithe.weakness?.type).toBe('water');
    // 60 would Knock Out a 60 HP Growlithe: give it the HP to take it.
    s.cards = { ...s.cards, [growlithe.id]: { ...growlithe, hp: 100 } };
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    const [gym] = give(s, 'ash', 'cinnabarGym');
    const stadium = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: gym! });
    expect(misty(attack(stadium, 0)).active!.damage).toBe(30);
  });
});
