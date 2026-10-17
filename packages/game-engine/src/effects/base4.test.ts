import { describe, expect, it } from 'vitest';
import { BASE4_REPRINTS } from './base4.js';
import { act, attack, duel, flips, mon, pokemon, C, G, L } from './test-kit.js';

// The checks against the TCGdex snapshot (every card mapped, every attack's effect) are in packages/campaign/src/base4.test.ts.
describe('Base Set 2', () => {
  it("plays a reprint's attack like the original (Electabuzz's Thundershock)", () => {
    const id = Object.keys(BASE4_REPRINTS).find((k) => BASE4_REPRINTS[k] === 'base1-20')!;
    const s = duel('charmander', 'onix', { energy: ['lightning'] });
    s.cards[id] = mon(id, 'Electabuzz', L, 70, [['Thundershock', [L], 10], ['Thunderpunch', [L, C], 30]]);
    s.players.ash!.active!.card.defId = id;
    expect(attack(flips(s, true), 0).players.misty!.active!.condition).toBe('paralyzed');
  });

  it("plays a reprinted Trainer like the original (Bill)", () => {
    const id = Object.keys(BASE4_REPRINTS).find((k) => BASE4_REPRINTS[k] === 'base1-91')!;
    const s = duel('charmander', 'onix');
    s.cards[id] = { id, kind: 'trainer', name: 'Bill', imageUrl: null, text: '' };
    s.players.ash!.hand = [{ uid: 'bill', defId: id }];
    expect(act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'bill' }).players.ash!.hand).toHaveLength(2);
  });

  it("uses a reprint's Pokémon Power like the original (Venusaur's Energy Trans)", () => {
    const id = Object.keys(BASE4_REPRINTS).find((k) => BASE4_REPRINTS[k] === 'base1-15')!;
    const s = duel('charmander', 'onix', { energy: ['grass'] });
    s.cards[id] = mon(id, 'Venusaur', G, 100, [['Solarbeam', [G, G, G, G], 60]], { stage: 'stage2', power: { name: 'Energy Trans', text: '' } });
    s.players.ash!.bench[0] = { ...pokemon('charmander'), card: { uid: 'venusaur', defId: id } };
    const after = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { from: 'active', to: 0 } });
    expect(after.players.ash!.bench[0]!.energy.map((e) => e.defId)).toEqual(['grass']);
  });
});
