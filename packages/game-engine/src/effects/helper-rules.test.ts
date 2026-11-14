// The "one helper each" rules of #204: a rule the engine has, applied in every place that needs it (levelling up and the
// cards under a Pokémon, switches and Sticky Hold, Bench room, Stadiums leaving play, the discard-pile lock, typed Energy
// cards, the same-card rule, Evolved Pokémon, Pokémon LEGEND halves, Trainers played as Pokémon, cards leaving play).
import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { cardsOf, isEvolved, removeTopEvolution, sameCards } from '../status.js';
import { act, attack, duel, endTurn, flips, give, mon, playAuto, settles, C, F, FI, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
let n = 0;

/** Adds the card to the library and puts it into play (`under`: the cards it evolved from, bottom first). */
function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = [], under: PokemonCardDef[] = []): InPlayPokemon {
  s.cards = { ...s.cards, [def.id]: def, ...Object.fromEntries(under.map((d) => [d.id, d])) };
  const p: InPlayPokemon = {
    card: { uid: `${def.id}-${n++}`, defId: def.id },
    evolvedFrom: under.map((d) => ({ uid: `${d.id}-${n++}`, defId: d.id })),
    damage: 0,
    energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })),
    playedTurn: 0,
  };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards = { ...s.cards, [def.id]: def };
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const play = (s: GameState, player: string, action: Parameters<typeof applyAction>[2]): GameState => {
  const r = applyAction(s, player, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

const rhydon = mon('dp1-61', 'Rhydon', FI, 90, [['Horn Drill', [FI, C], 30]], { stage: 'stage1', evolvesFrom: 'Rhyhorn' });
const rhyperior = mon('dp1-12', 'Rhyperior', FI, 140, [['Rock Wrecker', [FI, FI, C], 80]], { stage: 'stage2', evolvesFrom: 'Rhydon', power: { name: 'Earth Fissure', text: '' } });
const rhyperiorX = mon('dp6-145', 'Rhyperior', FI, 170, [['Hard Crush', [FI, FI], 0]], { stage: 'levelUp' });
const dialga = mon('dp4-16', 'Dialga', C, 90, [['Time Bellow', [C], 10]]);
const dialgaX = mon('dp4-105', 'Dialga', C, 110, [['Metal Flash', [C], 80]], { stage: 'levelUp' });

describe('levelling up and the cards under a Pokémon', () => {
  it('removeTopEvolution takes `levelUpFrom` with the Pokémon LV.X: the Pokémon under it evolves and levels up as any other', () => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', rhyperiorX, [], [rhydon, rhyperior]);
    p.levelUpFrom = rhyperior.id;
    const top = removeTopEvolution(s, ash(s), p);
    expect(top.defId).toBe(rhyperior.id);
    expect(p.card.defId).toBe(rhydon.id);
    expect(p.levelUpFrom).toBeUndefined();
    expect(ash(s).discard.map((c) => c.defId)).toEqual([rhyperiorX.id]);
  });

  it('Earth Fissure is asked as Rhyperior evolves from the hand, never again as it levels up', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', rhydon);
    const evolved = play(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', rhyperior), target: 'active' });
    expect(evolved.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'earthFissure' });

    const t = duel('charmander', 'onix');
    put(t, 'ash', 'active', rhyperior, [], [rhydon]);
    const levelled = play(t, 'ash', { type: 'EVOLVE', cardUid: hand(t, 'ash', rhyperiorX), target: 'active' });
    expect(ash(levelled).active!.levelUpFrom).toBe(rhyperior.id);
    expect(levelled.pendingChoice).toBeUndefined();
  });

  it('a Pokémon that lost its LV.X and its Evolution card is asked its on-evolve power as it evolves again', () => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', rhyperiorX, [], [rhydon, rhyperior]);
    p.levelUpFrom = rhyperior.id;
    removeTopEvolution(s, ash(s), p);
    const evolved = play(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', rhyperior), target: 'active' });
    expect(evolved.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'earthFissure' });
  });
});

describe('switches go through swapActive', () => {
  const gastrodon = mon('pl2-21', "Koga's Gastrodon", W, 90, [['Raging Flood', [W], 20]], { stage: 'stage1', power: { name: 'Sticky Hold', text: '' } });
  const hold = (s: GameState) => [s.pendingChoice, ...(s.queuedChoices ?? [])].find((c) => c?.source === 'Sticky Hold');
  const trainer = (s: GameState, name: string) => playAuto(s, 'ash', give(s, 'ash', name)[0]!);

  /**
   * Each way an effect switches an Active Pokémon: `side`'s Sticky Hold Pokémon is Active with Energy, a Squirtle on its Bench
   * in slot 0. `setup` puts the effect's own Pokémon in, `go` switches.
   */
  const SWITCHES: [name: string, side: 'ash' | 'misty', setup: (s: GameState) => void, go: (s: GameState) => GameState][] = [
    ['Switch', 'ash', () => {}, (s) => trainer(s, 'switch')],
    ['Gust of Wind', 'misty', () => {}, (s) => trainer(s, 'gustofwind')],
    ['Lure (the attack context)', 'misty', (s) => void put(s, 'ash', 'active', mon('base1-12', 'Ninetales', F, 80, [['Lure', [C, C], 0]]), ['fire', 'fire']), (s) => attack(s, 0, { benchSlot: 0 })],
    [
      'Fragrance Trap',
      'misty',
      (s) => void put(s, 'ash', 1, mon('gym1-26', "Erika's Victreebel", C, 80, [], { stage: 'stage2', power: { name: 'Fragrance Trap', text: '' } })),
      (s) => act(flips(s, true), 'ash', { type: 'USE_POWER', source: 1, choices: { oppTo: 0 } }),
    ],
    ['Step In', 'ash', (s) => void put(s, 'ash', 0, mon('base3-4', 'Dragonite', C, 100, [], { stage: 'stage2', power: { name: 'Step In', text: '' } })), (s) => act(s, 'ash', { type: 'USE_POWER', source: 0 })],
    ['Warp Point (a switchIn question)', 'misty', () => {}, (s) => act(trainer(s, 'warpPoint'), 'misty', { type: 'RESOLVE_CHOICE', target: 0 })],
    [
      "Koga's Ninja Trick",
      'ash',
      (s) => void s.players.misty!.active!.energy.push({ uid: 'f1', defId: 'fighting' }),
      (s) => act(act(endTurn(trainer(s, 'ninjaTrick'), 'ash'), 'misty', { type: 'ATTACK', attackIndex: 0 }), 'ash', { type: 'RESOLVE_CHOICE', target: 0 }),
    ],
  ];
  const board = (side: 'ash' | 'misty', setup: (s: GameState) => void) => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'], oppBench: ['squirtle'] });
    const p = put(s, side, 'active', gastrodon, ['water', 'fire']);
    setup(s);
    return { s, p };
  };

  it.each(SWITCHES)('%s asks Sticky Hold, and every path from it ends', (_name, side, setup, go) => {
    const { s, p } = board(side, setup);
    const after = go(s);
    const now = after.players[side]!;
    expect(now.active!.card.uid).not.toBe(p.card.uid);
    expect(now.bench.some((b) => b?.card.uid === p.card.uid)).toBe(true);
    expect(hold(after)).toMatchObject({ kind: 'shiftEnergy', player: side, to: 'active' });
    for (const end of settles(after)) expect(end.pendingChoice).toBeUndefined();
  });

  it.each(SWITCHES)('%s never switches an Active Pokémon held by Jaw Clamp', (_name, side, setup, go) => {
    const { s, p } = board(side, setup);
    s.players[side]!.active!.effects = { heldBy: { by: s.players[side === 'ash' ? 'misty' : 'ash']!.active!.card.uid, switches: true } };
    let after = s;
    try {
      after = go(s);
    } catch {
      // Refused outright (`blocked`: Switch, Gust of Wind, Step In): nothing switched either.
    }
    expect(after.players[side]!.active!.card.uid).toBe(p.card.uid);
    expect(hold(after)).toBeUndefined();
  });
});

describe('an Evolved Pokémon (isEvolved)', () => {
  it("isn't a Basic Pokémon with a LV.X on it; an Evolution card under a LV.X still counts", () => {
    const s = duel('charmander', 'onix');
    const evolved = (def: PokemonCardDef, under: PokemonCardDef[] = []) => {
      const p = put(s, 'ash', 'active', def, [], under);
      return isEvolved(s.cards, p);
    };
    expect(evolved(dialga)).toBe(false);
    expect(evolved(dialgaX, [dialga])).toBe(false);
    expect(evolved(rhydon, [mon('dp1-97', 'Rhyhorn', FI, 70, [])])).toBe(true);
    expect(evolved(rhyperiorX, [rhydon, rhyperior])).toBe(true);
  });
});

describe('the same-card rule (sameCards)', () => {
  const electrode = mon('base1-21', 'Electrode', C, 80, []);
  const lib = { [electrode.id]: electrode, fire: { id: 'fire', kind: 'energy', name: 'Fire Energy', imageUrl: null, energyType: F } as CardDef };
  it('two Electrode attached as different Energy (Buzzap) are different cards, as are two amounts', () => {
    const buzz = (type: typeof F, amount = 2) => ({ uid: `e-${n++}`, defId: electrode.id, provides: { type, amount } });
    expect(sameCards(lib, [buzz(F), buzz(F)])).toBe(true);
    expect(sameCards(lib, [buzz(F), buzz(W)])).toBe(false);
    expect(sameCards(lib, [buzz(F), buzz(F, 1)])).toBe(false);
  });
  it('a basic Energy card made another type differs from one that is not, and from one made a third type', () => {
    const fire = (type?: typeof F) => ({ uid: `f-${n++}`, defId: 'fire', ...(type && { converted: { type, by: 'porygon2' } }) });
    expect(sameCards(lib, [fire(), fire()])).toBe(true);
    expect(sameCards(lib, [fire(W), fire(W)])).toBe(true);
    expect(sameCards(lib, [fire(), fire(W)])).toBe(false);
    expect(sameCards(lib, [fire(W), fire(C)])).toBe(false);
  });
});

describe('cards leaving play (cardsOf)', () => {
  it("lists every card of the Pokémon, the Energy cards as the cards they are (no `provides`, `converted` or `windless`)", () => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', rhydon, [], [mon('dp1-97', 'Rhyhorn', FI, 70, [])]);
    p.energy = [
      { uid: 'buzz', defId: 'base1-21', provides: { type: F, amount: 2 } },
      { uid: 'conv', defId: 'fire', converted: { type: W, by: 'x' } },
      { uid: 'wind', defId: 'dce', windless: true },
    ];
    p.attached = [{ card: { uid: 'tool', defId: 'tool' }, tool: true, until: Infinity }];
    expect(cardsOf(p)).toEqual([p.evolvedFrom[0], p.card, { uid: 'buzz', defId: 'base1-21' }, { uid: 'conv', defId: 'fire' }, { uid: 'wind', defId: 'dce' }, { uid: 'tool', defId: 'tool' }]);
  });
});
