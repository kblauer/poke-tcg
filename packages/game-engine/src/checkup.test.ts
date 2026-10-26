import { describe, expect, it } from 'vitest';
import { captureCheckup, type GameState } from './index.js';
import { act, attack, duel, endTurn, flips, give, id } from './effects/test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const coins = (s: GameState) => s.log!.filter((l) => l.coin).map((l) => l.text);

describe('captureCheckup', () => {
  it("keeps the state after an attack and before the checkup's coin flips (Sing, then the Sleep flip)", () => {
    const s = duel('clefairy', 'charmander', { energy: ['fire'] });
    // Sing: heads; then the checkup's Sleep flip: heads, it wakes up.
    const { result: after, checkup } = captureCheckup(() => attack(flips(s, true, true), 0));
    expect(misty(checkup!.start).active!.condition).toBe('asleep');
    expect(coins(checkup!.start)).toHaveLength(1);
    expect(coins(after)).toHaveLength(2);
    expect(coins(after)[1]).toMatch(/Asleep: heads/);
    expect(misty(after).active!.condition).toBeNull();
  });

  it("keeps the state as the checkup ended, before the next turn: a Berry's heal, with the Pokémon and amount logged", () => {
    let s = duel('charmander', 'squirtle');
    ash(s).hand = [];
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'berry')[0]!, choices: { target: 'active' } });
    ash(s).active!.damage = 30;
    const { result: after, checkup } = captureCheckup(() => endTurn(s, 'ash'));
    expect([ash(checkup!.start).active!.damage, ash(checkup!.end).active!.damage]).toEqual([30, 10]);
    // The end is still the ending turn's; the next has begun only after it.
    expect([checkup!.end.currentPlayer, after.currentPlayer]).toEqual(['ash', 'misty']);
    expect(checkup!.end.log!.at(-1)!.tool).toEqual({ uid: ash(s).active!.card.uid, name: 'Berry', heal: 20 });
    expect(ash(after).discard.some((c) => c.defId === id('berry'))).toBe(true);
  });

  it("keeps the state after the Burn damage and before the Burn flip, and none when nothing is Burned", () => {
    const s = duel('charmander', 'charmander');
    misty(s).active!.burned = true;
    const { result: after, checkup } = captureCheckup(() => endTurn(flips(s, true), 'ash'));
    expect([misty(checkup!.burn!).active!.damage, misty(checkup!.burn!).active!.burned, coins(checkup!.burn!)]).toEqual([20, true, []]);
    expect([misty(after).active!.burned, coins(after)]).toEqual([false, [expect.stringMatching(/Burned: heads/)]]);
    expect(captureCheckup(() => endTurn(duel('charmander', 'charmander'), 'ash')).checkup!.burn).toBeUndefined();
  });

  it('is null for a move that ends no turn', () => {
    const s = duel('clefairy', 'charmander', { energy: ['fire'], bench: ['charmander'] });
    const energy = s.players.ash!.active!.energy[0]!.uid;
    const { checkup } = captureCheckup(() => act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [energy] }));
    expect(checkup).toBeNull();
  });

  it('only captures inside it', () => {
    const s = duel('clefairy', 'charmander', { energy: ['fire'] });
    attack(flips(s, true, true), 0);
    const { checkup } = captureCheckup(() => null);
    expect(checkup).toBeNull();
  });
});
