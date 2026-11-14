// The "one helper each" rules of #204: a rule the engine has, applied in every place that needs it (levelling up and the
// cards under a Pokémon, switches and Sticky Hold, Bench room, Stadiums leaving play, the discard-pile lock, typed Energy
// cards, the same-card rule, Evolved Pokémon, Pokémon LEGEND halves, Trainers played as Pokémon, cards leaving play).
import { describe, expect, it } from 'vitest';
import { isBasicInPlay, type CardDef, type PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { cardsOf, isEvolved, removeTopEvolution, sameCards } from '../status.js';
import { legendNames, takeLegend } from '../trainers.js';
import { act, attack, duel, endTurn, flips, give, id, mon, playAuto, settles, C, F, FI, W } from './test-kit.js';

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

  it("an effect that switches and then asks keeps Sticky Hold's question behind its own (askChoice): Scramble Switch, Slippery Soles", () => {
    const scramble = board('ash', () => {}).s;
    const played = playAuto(scramble, 'ash', hand(scramble, 'ash', { id: 'bw8-129', kind: 'trainer', name: 'Scramble Switch', imageUrl: null, text: '' }));
    expect([played.pendingChoice?.source, played.queuedChoices?.map((c) => c.source)]).toEqual(['Scramble Switch', ['Sticky Hold']]);
    for (const end of settles(played)) expect(end.pendingChoice).toBeUndefined();

    const soles = board('ash', (s) => void put(s, 'misty', 1, mon('base1-46', 'Charmander', F, 50, []))).s;
    put(soles, 'ash', 1, mon('bw4-33', 'Accelgor', C, 90, [], { stage: 'stage1', power: { name: 'Slippery Soles', text: '' } }));
    const used = act(soles, 'ash', { type: 'USE_POWER', source: 1, choices: { to: 0 } });
    expect([used.pendingChoice?.source, used.queuedChoices?.map((c) => c.source)]).toEqual(['Slippery Soles', ['Sticky Hold']]);
    for (const end of settles(used)) expect(end.pendingChoice).toBeUndefined();
  });
});

describe('Bench room goes through openBenchSlot, with the Stadium', () => {
  const power = (id: string, name: string, powerName: string, extra: Partial<PokemonCardDef> = {}) => mon(id, name, C, 60, [], { power: { name: powerName, text: '' }, ...extra });
  const squirtles = (s: GameState, player: string, slots: number[]) => slots.forEach((i) => put(s, player, i, mon('base1-63', 'Squirtle', W, 40, [])));
  const toDiscard = (s: GameState, player: string, def: CardDef) => {
    s.cards = { ...s.cards, [def.id]: def };
    s.players[player]!.discard.push({ uid: `${def.id}-${n++}`, defId: def.id });
  };
  const usePower = (source: Target) => (s: GameState) => act(flips(s, true), 'ash', { type: 'USE_POWER', source });

  /**
   * Each Gen 4 effect that puts a Pokémon onto a Bench, with 4 Pokémon on that Bench: `setup`, then `go` uses it. Two different
   * cards to pick from, or the same-card rule answers by itself.
   */
  const BENCHERS: [name: string, setup: (s: GameState) => void, go: (s: GameState) => GameState][] = [
    ['Unown C (Call)', (s) => (squirtles(s, 'ash', [1, 2, 3]), void put(s, 'ash', 0, power('dp1-67', 'Unown C', 'Call'))), usePower(0)],
    ['Illumise (Scent Conduct)', (s) => (squirtles(s, 'ash', [1, 2, 3]), void put(s, 'ash', 0, power('dp4-71', 'Illumise', 'Scent Conduct'))), usePower(0)],
    ['Unown A (Ancient Guidance)', (s) => (squirtles(s, 'ash', [1, 2, 3]), void put(s, 'ash', 0, power('dp5-67', 'Unown A', 'Ancient Guidance'))), usePower(0)],
    [
      'Unown C (Call Up)',
      (s) => (squirtles(s, 'ash', [1, 2, 3]), put(s, 'ash', 0, power('dp5-69', 'Unown C', 'Call Up')), toDiscard(s, 'ash', mon('helix', 'Helix Fossil', C, 50, [], { trainerText: '' })), toDiscard(s, 'ash', mon('dome', 'Dome Fossil', C, 50, [], { trainerText: '' }))),
      usePower(0),
    ],
    [
      "Garchomp LV.X (Restore)",
      (s) => (squirtles(s, 'ash', [0, 1, 2, 3]), put(s, 'ash', 'active', mon('dp5-97', 'Garchomp', C, 140, [['Restore', [C], 0]]), ['fire']), toDiscard(s, 'ash', mon('base1-46', 'Charmander', F, 50, [])), toDiscard(s, 'ash', mon('base1-63', 'Squirtle', W, 40, []))),
      (s) => attack(s, 0),
    ],
    [
      'Ninjask (Cast-off Shell)',
      (s) => (squirtles(s, 'ash', [0, 1, 2, 3]), put(s, 'ash', 'active', mon('dp6-109', 'Nincada', C, 50, [])), void hand(s, 'ash', mon('dp6-40', 'Shedinja', C, 60, [], { stage: 'stage1', evolvesFrom: 'Nincada' }))),
      (s) => act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', power('dp6-67', 'Ninjask', 'Cast-off Shell', { stage: 'stage1', evolvesFrom: 'Nincada' })), target: 'active' }),
    ],
    [
      'Beldum (Metal Chain)',
      (s) => (squirtles(s, 'ash', [0, 1, 2, 3]), void put(s, 'ash', 'active', power('dp6-83', 'Beldum', 'Metal Chain'))),
      (s) => act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', { id: 'metal-e', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' }), target: 'active' }),
    ],
    [
      "Honchkrow (Darkness Restore, the opponent's Bench)",
      (s) => (squirtles(s, 'misty', [0, 1, 2, 3]), put(s, 'ash', 'active', power('pl3-29', 'Honchkrow', 'Darkness Restore')), toDiscard(s, 'misty', mon('base1-46', 'Charmander', F, 50, [])), toDiscard(s, 'misty', mon('base1-63', 'Squirtle', W, 40, []))),
      usePower('active'),
    ],
  ];
  const outcome = (setup: (s: GameState) => void, go: (s: GameState) => GameState, narrow: boolean) => {
    const s = duel('charmander', 'onix');
    setup(s);
    if (narrow) {
      s.cards = { ...s.cards, 'gym1-124': { id: 'gym1-124', kind: 'trainer', name: 'Narrow Gym', imageUrl: null, text: '' } };
      s.stadium = { card: { uid: 'narrow', defId: 'gym1-124' }, owner: 'misty' };
    }
    try {
      return go(s).pendingChoice ? 'asked' : 'nothing';
    } catch {
      return 'refused';
    }
  };

  it.each(BENCHERS)('%s: offered with room for one more, never under Narrow Gym with 4 Benched', (_name, setup, go) => {
    expect(outcome(setup, go, false)).toBe('asked');
    expect(outcome(setup, go, true)).not.toBe('asked');
  });
});

describe('a Stadium leaves play through retireStadium', () => {
  const dusknoirX = mon('dp7-96', 'Dusknoir', C, 130, [], { stage: 'levelUp', power: { name: 'Ectoplasm', text: '' } });
  const gym: CardDef = { id: 'some-gym', kind: 'trainer', name: 'Some Gym', imageUrl: null, text: '' };
  const hits = (id: string, name: string, choices?: Parameters<typeof attack>[2]) => (s: GameState) => {
    put(s, 'ash', 'active', mon(id, 'Attacker', C, 200, [[name, [C], 0]]), ['fire']);
    return attack(s, 0, choices);
  };
  /** Each effect that discards the Stadium in play (the opponent's, here). */
  const DISCARDS: [name: string, go: (s: GameState) => GameState][] = [
    ['Spacial Rend', hits('dp1-11', 'Spacial Rend')],
    ['Pulse Barrier', hits('dp2-121', 'Pulse Barrier')],
    ['Detonate', hits('gym2-34', 'Detonate')],
    ['Mega Thrash', hits('gym2-35', 'Mega Thrash')],
    ['Shatter', hits('ex10-111', 'Shatter')],
    ['Wreck (EX Holon Phantoms)', hits('ex13-50', 'Wreck')],
    ['Wreck (EX Power Keepers)', hits('ex16-99', 'Wreck')],
    ['Knock Over', hits('ex4-31', 'Knock Over', { boost: true })],
    ['a new Stadium played over it', (s) => playAuto(s, 'ash', hand(s, 'ash', { id: 'gym1-124', kind: 'trainer', name: 'Narrow Gym', imageUrl: null, text: '' }))],
  ];
  const withStadium = (def: CardDef) => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, [def.id]: def };
    s.stadium = { card: { uid: 'the-stadium', defId: def.id }, owner: 'misty' };
    s.players.ash!.deck = [];
    return s;
  };
  const where = (s: GameState) => (['hand', 'discard', 'deck'] as const).filter((zone) => s.players.misty![zone].some((c) => c.uid === 'the-stadium'));

  it.each(DISCARDS)("%s: a Stadium card to its owner's discard pile, Ectoplasm's Dusknoir LV.X back to their hand", (_name, go) => {
    const plain = go(withStadium(gym));
    expect([plain.stadium?.card.uid === 'the-stadium', where(plain)]).toEqual([false, ['discard']]);
    const ecto = go(withStadium(dusknoirX));
    expect([ecto.stadium?.card.uid === 'the-stadium', where(ecto)]).toEqual([false, ['hand']]);
  });

  it("Sand Reset shuffles a Stadium into its player's deck, Ectoplasm's Dusknoir LV.X too (agreed 2026-11-14: it's treated as a Stadium)", () => {
    for (const def of [gym, dusknoirX]) {
      const s = withStadium(def);
      put(s, 'ash', 'active', mon('pl2-107', 'Hippowdon', C, 130, [], { power: { name: 'Sand Reset', text: '' } }));
      const after = act(s, 'ash', { type: 'USE_POWER', source: 'active' });
      expect([after.stadium, where(after)]).toEqual([null, ['deck']]);
    }
  });
});

describe('the discard-pile lock (Allergic Pollen)', () => {
  const hits = (id: string, name: string, choices?: Parameters<typeof attack>[2]) => (s: GameState) => {
    put(s, 'ash', 'active', mon(id, 'Attacker', C, 200, [[name, [C], 0]]), ['fire']);
    return attack(flips(s, true, true, true), 0, choices);
  };
  const evolves = (from: PokemonCardDef, to: PokemonCardDef) => (s: GameState) => {
    put(s, 'ash', 'active', from);
    return act(s, 'ash', { type: 'EVOLVE', cardUid: hand(s, 'ash', to), target: 'active' });
  };
  /** Each attack and Pokémon Power that takes cards from a discard pile and didn't check the lock itself (#204). */
  const TAKERS: [name: string, go: (s: GameState) => GameState][] = [
    ["Rocket's Zapdos (Plasma)", hits('gym2-15', 'Plasma')],
    ["Blaine's Vulpix (Call Will-o'-the-wisp)", hits('gym2-66', "Call Will-o'-the-wisp")],
    ['Magby (Energy Catch)', hits('ecard1-17', 'Energy Catch')],
    ['Raticate (Pickup)', hits('ex6-48', 'Pickup')],
    ['Quagsire δ (Dig up)', evolves(mon('ex15-71', 'Wooper δ', W, 50, []), mon('ex15-21', 'Quagsire δ', W, 80, [], { stage: 'stage1', evolvesFrom: 'Wooper δ', power: { name: 'Dig up', text: '' } }))],
    ['Gengar (Manipulate)', evolves(mon('ecard3-63', 'Haunter', C, 70, [], { stage: 'stage1', evolvesFrom: 'Gastly' }), mon('ecard3-10', 'Gengar', C, 100, [], { stage: 'stage2', evolvesFrom: 'Haunter', power: { name: 'Manipulate', text: '' } }))],
    ['Lillipup (Pickup)', hits('bw1-80', 'Pickup')],
    ['Stoutland (Odor Sleuth)', hits('bw1-83', 'Odor Sleuth')],
    ['Manaphy (Seafaring)', hits('bw8-34', 'Seafaring')],
    ['Magnezone (Double Assist)', hits('bw8-47', 'Double Assist', { ownTarget: 0 })],
  ];
  const outcome = (go: (s: GameState) => GameState, pollen: boolean) => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    ash(s).discard = ['fire', 'water', 'lightning', 'potion', 'charmander', 'squirtle'].map((name) => ({ uid: `gone-${name}`, defId: id(name) }));
    if (pollen) put(s, 'misty', 0, mon('neo3-35', 'Parasect', C, 60, [], { stage: 'stage1', power: { name: 'Allergic Pollen', text: '' } }));
    const after = go(s);
    const asked = [after.pendingChoice, ...(after.queuedChoices ?? [])].some((c) => c && /discard|Discard/.test(c.kind));
    return { asked, discard: ash(after).discard.map((c) => c.uid).sort() };
  };

  it.each(TAKERS)('%s takes from the discard pile, and does nothing to it while Allergic Pollen works', (_name, go) => {
    const untouched = ['fire', 'water', 'lightning', 'potion', 'charmander', 'squirtle'].map((name) => `gone-${name}`).sort();
    const free = outcome(go, false);
    expect(free.asked || free.discard.join() !== untouched.join()).toBe(true);
    expect(outcome(go, true)).toEqual({ asked: false, discard: untouched });
  });

  it('a Trainer card still takes from the discard pile (the lock is for attacks and Pokémon Powers)', () => {
    const s = duel('charmander', 'onix');
    ash(s).discard = [{ uid: 'gone-fire', defId: id('fire') }, { uid: 'gone-water', defId: id('water') }];
    put(s, 'misty', 0, mon('neo3-35', 'Parasect', C, 60, [], { stage: 'stage1', power: { name: 'Allergic Pollen', text: '' } }));
    give(s, 'ash', 'squirtle');
    const after = playAuto(s, 'ash', give(s, 'ash', 'energyretrieval')[0]!);
    expect(ash(after).hand.map((c) => c.uid)).toEqual(expect.arrayContaining(['gone-fire', 'gone-water']));
  });

  it('Riptide still counts and shuffles its Energy cards while Allergic Pollen works (the user\'s, 2026-11-14: this attack only)', () => {
    for (const pollen of [false, true]) {
      const s = duel('charmander', 'onix', { bench: ['squirtle'] });
      put(s, 'misty', 'active', mon('wall', 'Wall', C, 500, []));
      ash(s).discard = ['fire', 'water', 'lightning', 'potion'].map((name) => ({ uid: `gone-${name}`, defId: id(name) }));
      if (pollen) put(s, 'misty', 0, mon('neo3-35', 'Parasect', C, 60, [], { stage: 'stage1', power: { name: 'Allergic Pollen', text: '' } }));
      const after = hits('neo1-5', 'Riptide')(s);
      expect([after.players.misty!.active!.damage, ash(after).discard.map((c) => c.uid)]).toEqual([40, ['gone-potion']]);
      expect(ash(after).deck.filter((c) => c.uid.startsWith('gone-')).length).toBe(3);
    }
  });

  it("an Ability's question about a discard pile is not stopped: Dynamotor attaches from the discard pile (the user's, 2026-11-14)", () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 1, mon('bw3-40', 'Eelektrik', C, 90, [], { stage: 'stage1', power: { name: 'Dynamotor', text: '' } }));
    put(s, 'misty', 0, mon('neo3-35', 'Parasect', C, 60, [], { stage: 'stage1', power: { name: 'Allergic Pollen', text: '' } }));
    ash(s).discard = [{ uid: 'gone-lightning', defId: id('lightning') }];
    const after = act(s, 'ash', { type: 'USE_POWER', source: 1, choices: { cardUid: 'gone-lightning', to: 0 } });
    expect([ash(after).bench[0]!.energy.map((e) => e.uid), ash(after).discard]).toEqual([['gone-lightning'], []]);
  });
});

describe('a Basic Pokémon in play, Trainer cards played as one included (isBasicInPlay: Strange Bell)', () => {
  const bell = (defender: PokemonCardDef, asBasic = false) => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'misty', 'active', defender);
    if (asBasic) p.asBasic = true;
    put(s, 'ash', 'active', mon('dp2-22', 'Chimecho', C, 70, [['Call In', [C], 0], ['Strange Bell', [C], 20]]), ['fire']);
    const after = attack(s, 1);
    return { basic: isBasicInPlay(inPlayDef(s.cards, p)), confused: after.players.misty!.active?.condition === 'confused' };
  };
  it('a Basic Pokémon is Confused; a Pokémon LEGEND, a Restored Pokémon and an Evolved Pokémon are not', () => {
    expect(bell(mon('basic', 'Snorlax', C, 200, []))).toEqual({ basic: true, confused: true });
    expect(bell(mon('legend', 'Lugia LEGEND', C, 200, []))).toEqual({ basic: false, confused: false });
    expect(bell(mon('restored', 'Archen', C, 200, [], { restored: true }))).toEqual({ basic: false, confused: false });
    expect(bell(mon('stage1', 'Raichu', C, 200, [], { stage: 'stage1' }))).toEqual({ basic: false, confused: false });
  });
  it('Clefairy Doll and a Fossil in play count as Basic Pokémon for it; their own text keeps Special Conditions off them (conditionProof)', () => {
    expect(bell(mon('base1-70', 'Clefairy Doll', C, 200, [], { trainerText: '' }))).toEqual({ basic: true, confused: false });
    expect(bell(mon('base3-62', 'Mysterious Fossil', C, 200, [], { trainerText: '' }))).toEqual({ basic: true, confused: false });
    // A Stage 1 Fossil Pokémon put into play as a Basic Pokémon (Strange Cave) has no such text: it is Confused.
    expect(bell(mon('as-basic', 'Omanyte', C, 200, [], { stage: 'stage1' }), true)).toEqual({ basic: true, confused: true });
  });
});

describe('a "[type] Energy card" is basic or Special (energyCardOf)', () => {
  const special = (type: 'metal' | 'darkness'): CardDef => ({ id: `special-${type}`, kind: 'energy', name: `${type === 'metal' ? 'Metal' : 'Darkness'} Energy`, imageUrl: null, energyType: type, basic: false });
  const withCards = (s: GameState, ...defs: CardDef[]) => void (s.cards = { ...s.cards, ...Object.fromEntries(defs.map((d) => [d.id, d])) });

  it("Metal Load (a shared wording) attaches the EX sets' Special Metal Energy from the discard pile", () => {
    const s = duel('charmander', 'onix');
    withCards(s, special('metal'));
    put(s, 'ash', 'active', mon('ex5-21', 'Metang', C, 70, [['Metal Load', [C], 0]]), ['fire']);
    ash(s).discard = [{ uid: 'metal-1', defId: 'special-metal' }];
    expect(ash(attack(s, 0)).active!.energy.map((e) => e.uid)).toContain('metal-1');
  });

  it('Heavy Metal (a shared wording) flips a coin for a Special Metal Energy card', () => {
    const s = duel('charmander', 'onix');
    withCards(s, special('metal'));
    put(s, 'ash', 'active', mon('ex8-26', 'Skarmory', C, 70, [['Spearhead', [C], 0], ['Heavy Metal', [C], 10]]), ['special-metal']);
    expect(attack(flips(s, true), 1).players.misty!.active!.damage).toBe(30);
  });

  it('Dark Slash offers its boost with a Special Darkness Energy card, and discards it', () => {
    const s = duel('charmander', 'onix');
    withCards(s, special('darkness'));
    put(s, 'ash', 'active', mon('ex1-22', 'Sharpedo', C, 70, [['Dark Slash', [C], 40]]), ['special-darkness']);
    const after = attack(s, 0, { boost: true });
    expect([after.players.misty!.active!.damage, ash(after).active!.energy.length, ash(after).discard.map((c) => c.defId)]).toEqual([70, 0, ['special-darkness']]);
  });

  it('Dark Trance moves a Special Darkness Energy card', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    withCards(s, special('darkness'));
    const p = put(s, 'ash', 'active', mon('ex7-15', 'Dark Dragonite', C, 100, [], { stage: 'stage2', power: { name: 'Dark Trance', text: '' } }), ['special-darkness']);
    const after = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 'active', energyUid: p.energy[0]!.uid, to: 0 } });
    expect(ash(after).bench[0]!.energy.map((e) => e.defId)).toEqual(['special-darkness']);
  });
});

describe('a Team Plasma Pokémon in play is isPlasmaPokemon (Team Plasma Badge)', () => {
  const badge: CardDef = { id: 'bw9-104', kind: 'trainer', name: 'Team Plasma Badge', imageUrl: null, text: '' };
  const badged = (s: GameState, p: InPlayPokemon) => {
    s.cards = { ...s.cards, [badge.id]: badge };
    p.attached = [{ card: { uid: `badge-${n++}`, defId: badge.id }, tool: true, until: Number.MAX_SAFE_INTEGER }];
  };

  it('Teampact counts a Pokémon holding the Badge', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 'active', mon('bw8-101', 'Snorlax', C, 130, [['Teampact', [C], 0]], { teamPlasma: true }), ['fire']);
    expect(attack(structuredClone(s), 0).players.misty!.active!.damage).toBe(30);
    badged(s, ash(s).bench[0]!);
    expect(attack(s, 0).players.misty!.active!.damage).toBe(60);
  });

  it('Colress Machine can be played when the only Team Plasma Pokémon is a Badge holder', () => {
    const s = duel('charmander', 'onix');
    const machine = hand(s, 'ash', { id: 'bw8-119', kind: 'trainer', name: 'Colress Machine', imageUrl: null, text: '' });
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: machine, choices: {} })).toMatchObject({ ok: false, error: 'You have no Team Plasma Pokémon in play' });
    badged(s, ash(s).active!);
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: machine, choices: {} }).ok).toBe(true);
  });
});

describe('the same-card rule in the shared wordings', () => {
  const rainbow: CardDef = { id: 'rainbow', kind: 'energy', name: 'Rainbow Energy', imageUrl: null, energyType: C, basic: false, anyType: true };
  /** A wording that discards an Energy card from the attacker, with Energy cards that differ: the player is asked, and every answer ends. */
  const WORDINGS: [name: string, id: string, attackName: string, energy: string[], left: number][] = [
    ['"if tails, discard an Energy" (Air Slash)', 'pl1-15', 'Air Slash', ['fire', 'water'], 1],
    ['"if tails, discard a Fire Energy" (Fireworks)', 'ex7-108', 'Fireworks', ['fire', 'rainbow'], 1],
    ['"discard a Fire Energy and a Water Energy" (Mist Ball)', 'dp4-22', 'Mist Ball', ['fire', 'rainbow', 'water'], 1],
  ];
  it.each(WORDINGS)('%s asks which card when they differ', (_name, cardId, attackName, energy, left) => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, rainbow };
    s.players.misty!.active!.damage = 0;
    put(s, 'misty', 'active', mon('wall', 'Wall', C, 500, []));
    put(s, 'ash', 'active', mon(cardId, 'Attacker', C, 100, [[attackName, [C], 10]]), energy);
    const after = attack(flips(s, false), 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'discardAttached', player: 'ash' });
    const ends = settles(after);
    expect(ends.length).toBeGreaterThan(0);
    for (const end of ends) expect(end.players.ash!.active!.energy.length).toBe(left);
  });

  it('nothing is asked when the cards are the same card', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-15', 'Shaymin', C, 100, [['Air Slash', [C], 40]]), ['fire', 'fire']);
    const after = attack(flips(s, false), 0);
    expect([after.pendingChoice, ash(after).active!.energy.length]).toEqual([undefined, 1]);
  });
});

describe('a Pokémon LEGEND is its two different halves (legendPair)', () => {
  const lugia = (cardId: string) => mon(cardId, 'Lugia LEGEND', W, 130, [['Elemental Blast', [C], 200]]);

  it('from the hand: never two copies of the same half, nor a half and its reverse-holo print', () => {
    for (const second of ['hgss1-113', 'hgss1-113-reverse']) {
      const s = duel('charmander', 'onix');
      const top = hand(s, 'ash', lugia('hgss1-113'));
      hand(s, 'ash', lugia(second));
      expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: top, slot: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/other half/) });
    }
    const s = duel('charmander', 'onix');
    const top = hand(s, 'ash', lugia('hgss1-113'));
    hand(s, 'ash', lugia('hgss1-113'));
    const bottom = hand(s, 'ash', lugia('hgss1-114'));
    const after = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: top, slot: 0 });
    expect(ash(after).bench[0]!.attached?.map((a) => a.card.uid)).toEqual([bottom]);
  });

  it('from the deck (Legend Ceremony, Legend Box): the same pairing', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'hgss1-113': lugia('hgss1-113'), 'hgss1-114': lugia('hgss1-114') };
    const copies = [{ uid: 'top-1', defId: 'hgss1-113' }, { uid: 'top-2', defId: 'hgss1-113' }];
    expect(legendNames(s.cards, copies)).toEqual([]);
    ash(s).deck = [...copies];
    takeLegend(s, ash(s), 'Lugia LEGEND', 'Legend Ceremony');
    expect(ash(s).hand.filter((c) => c.uid.startsWith('top-'))).toEqual([]);

    const both = [...copies, { uid: 'bottom-1', defId: 'hgss1-114' }];
    expect(legendNames(s.cards, both)).toEqual(['Lugia LEGEND']);
    ash(s).deck = [...both];
    takeLegend(s, ash(s), 'Lugia LEGEND', 'Legend Ceremony');
    expect(ash(s).hand.map((c) => c.uid).filter((u) => /^(top|bottom)-/.test(u)).sort()).toEqual(['bottom-1', 'top-1']);
  });
});

describe('a Trainer card played as a Pokémon obeys every Trainer lock (trainerLockError)', () => {
  const doll = mon('base1-70', 'Clefairy Doll', C, 10, [], { trainerText: '' });
  const fossil = mon('base3-62', 'Mysterious Fossil', C, 10, [], { trainerText: '' });
  const holder = (cardId: string, powerName: string) => mon(cardId, 'Holder', C, 90, [], { power: { name: powerName, text: '' } });
  /** Each lock that stops an Item card (a Trainer that's neither a Supporter nor a Stadium). */
  const LOCKS: [name: string, lock: (s: GameState) => void][] = [
    ['no lock', () => {}],
    ['Headache', (s) => void (ash(s).noTrainersUntil = s.turn)],
    ['Disconnect', (s) => void (ash(s).noItemsUntil = s.turn)],
    ["the Black & White series' Item lock", (s) => void (ash(s).noItemCardsUntil = s.turn)],
    ['Dark Vileplume (Hay Fever)', (s) => void put(s, 'misty', 0, holder('base5-13', 'Hay Fever'))],
    ['Block Dust', (s) => void put(s, 'misty', 'active', holder('ex5-100', 'Block Dust'))],
    ['Magic Room', (s) => void put(s, 'misty', 'active', holder('bw2-47', 'Magic Room'))],
    ['Primal Shell', (s) => void put(s, 'misty', 'active', holder('dp5-6', 'Primal Shell'))],
    ['Lonesome', (s) => (put(s, 'misty', 'active', holder('ex10-7', 'Lonesome')), void put(s, 'ash', 1, mon('base1-63', 'Squirtle', W, 40, [])))],
  ];

  it.each(LOCKS)('%s: Clefairy Doll and a Fossil are refused exactly when an Item card is, with its reason', (name, lock) => {
    const s = duel('charmander', 'onix');
    lock(s);
    const item = applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'bill')[0]!, choices: {} });
    expect(item.ok).toBe(name === 'no lock');
    for (const def of [doll, fossil]) {
      const played = applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: hand(s, 'ash', def), slot: 0 });
      expect(played.ok ? null : played.error).toBe(item.ok ? null : item.error);
    }
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

  it('effects that ask for an Evolved Pokémon read it: Cross-Cut, an "is an Evolved Pokémon" wording, Boost Energy', () => {
    const board = (defender: PokemonCardDef, under: PokemonCardDef[]) => {
      const s = duel('charmander', 'onix');
      put(s, 'misty', 'active', defender, [], under);
      return s;
    };
    const crossCut = (s: GameState) => {
      put(s, 'ash', 'active', mon('ecard2-57', 'Scyther', C, 70, [['Quick Turn', [C], 0], ['Cross-Cut', [C], 20]]), ['fire']);
      return attack(s, 1).players.misty!.active!.damage;
    };
    expect(crossCut(board(dialgaX, [dialga]))).toBe(20);
    expect(crossCut(board(rhyperiorX, [rhydon, rhyperior]))).toBe(40);

    const boost: CardDef = { id: 'ecard2-145', kind: 'energy', name: 'Boost Energy', imageUrl: null, energyType: C, basic: false };
    const attach = (s: GameState) => {
      ash(s).active = s.players.misty!.active;
      return applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', boost), target: 'active' });
    };
    expect(attach(board(dialgaX, [dialga]))).toMatchObject({ ok: false, error: expect.stringMatching(/Evolved Pokémon/) });
    expect(attach(board(rhydon, [mon('dp1-97', 'Rhyhorn', FI, 70, [])])).ok).toBe(true);
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
