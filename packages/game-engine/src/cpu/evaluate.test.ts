// The CPUs' generic judgement (evaluate.ts): the cards they have no rule of their own for.
import { describe, expect, it } from 'vitest';
import type { CardDef } from '../cards.js';
import { duel, flips, give, id } from '../effects/test-kit.js';
import { runCpu, trainerCpu, type GameAction, type GameState } from '../index.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

/** Puts `def` into the CPU's hand and returns its uid. */
function hand(s: GameState, def: CardDef): string {
  s.cards[def.id] = def;
  const uid = `${def.id}-${n++}`;
  ash(s).hand.push({ uid, defId: def.id });
  return uid;
}
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
/** The CPU's turn with `active` against `defender`, an empty hand and a deck of `deck`. */
function cpuTurn(active: string, defender: string, deck: string[] = Array(12).fill('fire'), opts: Parameters<typeof duel>[2] = {}): GameState {
  const s = duel(active, defender, opts);
  ash(s).hand = [];
  ash(s).deck = deck.map((name) => ({ uid: `deck-${n++}`, defId: id(name) }));
  return s;
}
const playsOf = (actions: GameAction[]) => actions.filter((a) => a.type === 'PLAY_TRAINER').map((a) => (a as Extract<GameAction, { type: 'PLAY_TRAINER' }>).cardUid);

describe('CPU: cards without a rule of their own', () => {
  it('plays a Trainer when it leaves a better position: Energy Search for the Energy its attack needs, then attaches it', () => {
    const s = cpuTurn('charmander', 'squirtle');
    const [search] = give(s, 'ash', 'energysearch');
    const actions = runCpu(s, 'ash').actions;
    expect(actions[0]).toMatchObject({ type: 'PLAY_TRAINER', cardUid: search });
    expect(actions.map((a) => a.type)).toContain('ATTACH_ENERGY');
  });

  it("doesn't peek at the coin flips to come: Bill's Teleporter is played on heads and tails alike", () => {
    for (const heads of [true, false]) {
      const s = cpuTurn('charmander', 'squirtle');
      const teleporter = hand(s, trainer('neo1-91', "Bill's Teleporter"));
      expect(runCpu(flips(s, heads), 'ash').actions[0], `heads ${heads}`).toMatchObject({ type: 'PLAY_TRAINER', cardUid: teleporter });
    }
  });

  it("doesn't play a card that does nothing for it", () => {
    const s = cpuTurn('charmander', 'squirtle');
    // Energy Search with no basic Energy left in the deck.
    ash(s).deck = Array.from({ length: 10 }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
    const [search] = give(s, 'ash', 'energysearch');
    expect(playsOf(runCpu(s, 'ash').actions)).not.toContain(search);
  });

  it('plays a Technical Machine when its attack beats its own: Fighting Cube 01 on a badly hurt Onix', () => {
    const s = cpuTurn('onix', 'squirtle', undefined, { energy: ['fighting'] });
    ash(s).active!.damage = 60;
    const cube = hand(s, trainer('ecard2-121', 'Fighting Cube 01'));
    const actions = runCpu(s, 'ash').actions;
    expect(actions[0]).toMatchObject({ type: 'PLAY_TRAINER', cardUid: cube });
    expect(actions.at(-1)).toMatchObject({ type: 'ATTACK', attackIndex: 2 });
  });

  it('attaches a special Energy card where it does more than basic Energy: Potion Energy on its hurt Active Pokémon', () => {
    const s = cpuTurn('charmander', 'squirtle', Array(12).fill('charmander'));
    ash(s).active!.damage = 20;
    const potion = hand(s, { id: 'base5-82', kind: 'energy', name: 'Potion Energy', imageUrl: null, energyType: 'colorless', basic: false });
    const actions = runCpu(s, 'ash').actions;
    expect(actions[0]).toEqual({ type: 'ATTACH_ENERGY', cardUid: potion, target: 'active' });
    expect(ash(runCpu(s, 'ash').state).active?.damage ?? 0).toBeLessThan(20 + 1);
  });
});

describe('Trainer CPU: its short list', () => {
  it("plays the simple Trainers on its list, but not the gym leader's disruption", () => {
    const s = cpuTurn('charmander', 'squirtle', undefined, { defenderEnergy: ['water'] });
    const [search] = give(s, 'ash', 'energysearch');
    const removal = hand(s, trainer('ecard1-140', 'Energy Removal 2'));
    const played = playsOf(runCpu(s, 'ash', trainerCpu).actions);
    expect(played).toContain(search);
    expect(played).not.toContain(removal);
  });
});
