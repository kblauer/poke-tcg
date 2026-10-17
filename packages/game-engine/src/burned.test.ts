import { describe, expect, it } from 'vitest';
import type { GameState } from './index.js';
import { act, attack, duel, endTurn, flips, give } from './effects/test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
/** Misty's active Charmander, Burned, on Ash's turn. */
const burned = (opts: Parameters<typeof duel>[2] = {}) => {
  const s = duel('charmander', 'charmander', opts);
  misty(s).active!.burned = true;
  return s;
};

describe('Burned', () => {
  it('does 20 damage between turns, then a flip: heads cures it', () => {
    const s = endTurn(flips(burned(), true), 'ash');
    expect(misty(s).active!.damage).toBe(20);
    expect(misty(s).active!.burned).toBe(false);
  });

  it('stays on tails, and does 20 again after the next turn', () => {
    let s = endTurn(flips(burned(), false), 'ash');
    expect([misty(s).active!.damage, misty(s).active!.burned]).toEqual([20, true]);
    s = endTurn(flips(s, true), 'misty');
    expect([misty(s).active!.damage, misty(s).active!.burned]).toEqual([40, false]);
  });

  it('is checked after Poison and before Asleep and Paralyzed', () => {
    const s = burned();
    Object.assign(misty(s).active!, { poison: 10, condition: 'asleep' });
    const after = endTurn(flips(s, false, false), 'ash');
    const lines = after.log!.map((l) => l.text).filter((t) => /Poison|Burn|Asleep/.test(t));
    expect(lines).toEqual(['Charmander takes 10 Poison damage.', 'Charmander takes 20 Burn damage.', 'Charmander is Burned: tails.', 'Charmander is Asleep: tails.']);
  });

  it('goes with the other Special Conditions: a Burned, Poisoned Pokémon put to Sleep stays Burned and Poisoned', () => {
    const s = duel('clefairy', 'charmander', { energy: ['fire'] });
    Object.assign(misty(s).active!, { burned: true, poison: 10 });
    // Sing: heads; then the checkup: Burn flip tails, Sleep flip tails.
    const slept = attack(flips(s, true, false, false), 0);
    expect([misty(slept).active!.condition, misty(slept).active!.burned, misty(slept).active!.poison]).toEqual(['asleep', true, 10]);
  });

  it('can be inflicted by an attack (Mirror Move repeating it), but not on Thick Skinned Snorlax', () => {
    const s = duel('pidgeotto', 'charmander', { energy: ['fire', 'fire', 'fire'] });
    ash(s).active!.effects = { attackedOn: { turn: 2, damage: 0, afflictions: ['burned'] } };
    // Tails on the checkup's Burn flip right after.
    expect(misty(attack(flips(s, false), 1)).active!.burned).toBe(true);
    const snorlax = duel('pidgeotto', 'snorlax', { energy: ['fire', 'fire', 'fire'] });
    ash(snorlax).active!.effects = { attackedOn: { turn: 2, damage: 0, afflictions: ['burned'] } };
    expect(misty(attack(snorlax, 1)).active!.burned ?? false).toBe(false);
  });

  it('is cured by retreating, evolving and Full Heal', () => {
    // Retreating: Misty's Burned Charmander goes to the Bench.
    const retreat = endTurn(flips(burned({ defenderEnergy: ['fire'], oppBench: ['squirtle'] }), false), 'ash');
    const energy = misty(retreat).active!.energy[0]!.uid;
    const benched = act(retreat, 'misty', { type: 'RETREAT', slot: 0, energyUids: [energy] });
    expect(misty(benched).bench[0]!.burned).toBe(false);

    // Evolving Ash's own Burned Charmander.
    const evolve = duel('charmander', 'onix');
    ash(evolve).active!.burned = true;
    const [charmeleon] = give(evolve, 'ash', 'charmeleon');
    expect(ash(act(evolve, 'ash', { type: 'EVOLVE', cardUid: charmeleon!, target: 'active' })).active!.burned).toBe(false);

    // Full Heal, which a Burn alone is enough to play.
    const heal = duel('charmander', 'onix');
    ash(heal).active!.burned = true;
    const [fullHeal] = give(heal, 'ash', 'fullheal');
    expect(ash(act(heal, 'ash', { type: 'PLAY_TRAINER', cardUid: fullHeal! })).active!.burned).toBe(false);
  });
});
