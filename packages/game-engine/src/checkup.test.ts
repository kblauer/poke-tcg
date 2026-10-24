import { describe, expect, it } from 'vitest';
import { captureCheckup, type GameState } from './index.js';
import { act, attack, duel, flips } from './effects/test-kit.js';

const misty = (s: GameState) => s.players.misty!;
const coins = (s: GameState) => s.log!.filter((l) => l.coin).map((l) => l.text);

describe('captureCheckup', () => {
  it("keeps the state after an attack and before the checkup's coin flips (Sing, then the Sleep flip)", () => {
    const s = duel('clefairy', 'charmander', { energy: ['fire'] });
    // Sing: heads; then the checkup's Sleep flip: heads, it wakes up.
    const { result: after, checkup } = captureCheckup(() => attack(flips(s, true, true), 0));
    expect(misty(checkup!).active!.condition).toBe('asleep');
    expect(coins(checkup!)).toHaveLength(1);
    expect(coins(after)).toHaveLength(2);
    expect(coins(after)[1]).toMatch(/Asleep: heads/);
    expect(misty(after).active!.condition).toBeNull();
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
