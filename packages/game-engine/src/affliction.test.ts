// afflictionBlocked: what keeps a Special Condition off a Pokémon outside an attack (powers, bodies and Trainer cards all
// check it), one test per blocker, and Sleep! (a Trainer) going through it.
import { describe, expect, it } from 'vitest';
import { act, duel, flips, give } from './effects/test-kit.js';
import { afflictionBlocked, type GameState } from './index.js';

const misty = (s: GameState) => s.players.misty!;
const blockedOn = (s: GameState, affliction: Parameters<typeof afflictionBlocked>[3] = 'asleep') => afflictionBlocked(s, 'misty', misty(s).active!, affliction);

describe('afflictionBlocked', () => {
  it('nothing blocks an ordinary Pokémon', () => {
    expect(blockedOn(duel('charmander', 'squirtle'))).toBeNull();
    expect(blockedOn(duel('charmander', 'squirtle'), 'poisoned')).toBeNull();
  });

  it("Clefairy Doll (a Trainer played as a Pokémon) can't be affected by Special Conditions", () => {
    expect(blockedOn(duel('charmander', 'doll'))).toBe("Clefairy Doll can't be affected by Special Conditions.");
  });

  it("Thick Skinned (a power): Snorlax can't become Asleep, Confused, Paralyzed or Poisoned, unless the power stops working", () => {
    const s = duel('charmander', 'snorlax');
    expect(blockedOn(s)).toBe("Snorlax can't be affected by Special Conditions.");
    expect(blockedOn(s, 'poisoned')).toBe("Snorlax can't be affected by Special Conditions.");
    // Burned too, as the engine has it (conditionFree covers every condition; the card predates Burned).
    expect(blockedOn(s, 'burned')).toBe("Snorlax can't be affected by Special Conditions.");
    // Goop Gas Attack: no powers work.
    misty(s).powersOffUntil = s.turn + 1;
    expect(blockedOn(s)).toBeNull();
  });

  it('Flash Touch keeps the Active Pokémon from Asleep, Confused, Paralyzed and Poisoned, not from Burned, and not once it’s benched', () => {
    const s = duel('charmander', 'squirtle', { oppBench: ['onix'] });
    misty(s).active!.effects = { flashTouch: true };
    expect(blockedOn(s)).toBe("Squirtle can't be affected by Special Conditions.");
    expect(blockedOn(s, 'burned')).toBeNull();
    expect(afflictionBlocked(s, 'misty', misty(s).bench[0]!, 'asleep')).toBeNull();
    [misty(s).active, misty(s).bench[0]] = [misty(s).bench[0]!, misty(s).active];
    expect(afflictionBlocked(s, 'misty', misty(s).bench[0]!, 'asleep')).toBeNull();
  });

  it("Pollen Shield and an attack's conditionProof last through the turn they're set for, then expire", () => {
    for (const key of ['pollenShield', 'conditionProof'] as const) {
      const s = duel('charmander', 'squirtle');
      misty(s).active!.effects = { [key]: s.turn };
      expect(blockedOn(s), key).toBe("Squirtle can't be affected by Special Conditions.");
      misty(s).active!.effects = { [key]: s.turn - 1 };
      expect(blockedOn(s), key).toBeNull();
    }
  });

  it("a run's conditionGuard rule protects its player's Pokémon from the conditions it names, by name", () => {
    const s = duel('charmander', 'squirtle');
    s.rules = [{ kind: 'conditionGuard', player: 'misty', conditions: ['asleep', 'paralyzed'], label: 'Sleep Pendulum' }];
    expect(blockedOn(s)).toBe('Sleep Pendulum protected Squirtle from that.');
    expect(blockedOn(s, 'paralyzed')).toBe('Sleep Pendulum protected Squirtle from that.');
    expect(blockedOn(s, 'poisoned')).toBeNull();
    // Only its player's.
    s.rules = [{ kind: 'conditionGuard', player: 'ash', conditions: ['asleep'] }];
    expect(blockedOn(s)).toBeNull();
    expect(afflictionBlocked(s, 'ash', s.players.ash!.active!, 'asleep')).toBe('A battle rule protected Charmander from that.');
  });

  it('Sleep! (a Trainer card) goes through it: heads puts the Defending Pokémon to sleep, unless it’s protected', () => {
    const asleep = (s: GameState) => {
      const [sleep] = give(s, 'ash', 'sleep');
      return act(flips(s, true), 'ash', { type: 'PLAY_TRAINER', cardUid: sleep! });
    };
    expect(misty(asleep(duel('charmander', 'squirtle'))).active!.condition).toBe('asleep');
    const guarded = duel('charmander', 'squirtle');
    guarded.rules = [{ kind: 'conditionGuard', player: 'misty', conditions: ['asleep'], label: 'Sleep Pendulum' }];
    const after = asleep(guarded);
    expect(misty(after).active!.condition ?? null).toBeNull();
    expect(after.log!.map((l) => l.text)).toContain('Sleep Pendulum protected Squirtle from that.');
    expect(misty(asleep(duel('charmander', 'snorlax'))).active!.condition ?? null).toBeNull();
    expect(misty(asleep(duel('charmander', 'doll'))).active!.condition ?? null).toBeNull();
  });
});
