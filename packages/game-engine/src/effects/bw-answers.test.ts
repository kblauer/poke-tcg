import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, getPlayerView, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, C, duel, F, FI, flips, G, id, mon, P, W } from './test-kit.js';

// The user's answers to the Gen 5 ruling questions (2026-10-26, README: Generation 5), each where it changed what was
// implemented first.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: CardDef & PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards = { ...s.cards, [def.id]: def };
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
const ability = (name: string) => ({ power: { name, text: '' } });
const big = (name: string) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]]);
/** Groudon's Earthquake (EX Hidden Legends): 60, and 10 to each of its player's own Benched Pokémon. */
const groudon = mon('ex5-102', 'Groudon', FI, 100, [['Earthquake', [FI], 60]]);

describe('Abilities against any attack, its own player\'s too', () => {
  it('Smooth Coat, Solid Rock and Durable Body cover their own player\'s attack damage', () => {
    for (const [def, damage] of [
      [mon('bw4-85', 'Cinccino', C, 90, [], { stage: 'stage1', ...ability('Smooth Coat') }), 0],
      [mon('bw3-26', 'Carracosta', W, 140, [], { stage: 'stage1', ...ability('Solid Rock') }), 0],
      [mon('bw3-47', 'Cofagrigus', P, 90, [], { stage: 'stage1', ...ability('Durable Body') }), 80],
    ] as const) {
      const s = duel('charmander', 'onix');
      put(s, 'ash', 'active', groudon, ['fighting']);
      put(s, 'misty', 'active', big('Snorlax'));
      const p = put(s, 'ash', 0, def);
      if (def.id === 'bw3-47') p.damage = 80;
      expect(ash(attack(flips(s, true), 0)).bench[0]!.damage).toBe(damage);
    }
  });
});

describe('attacks', () => {
  it('Mysterious Evolution: the partner may be the opponent\'s', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw3-8', 'Karrablast', G, 60, [['Mysterious Evolution', [C], 0]]), ['grass']);
    put(s, 'misty', 'active', mon('bw3-10', 'Shelmet', G, 60, []));
    s.cards = { ...s.cards, 'bw3-9': mon('bw3-9', 'Escavalier', G, 100, [], { stage: 'stage1', evolvesFrom: 'Karrablast' }) };
    ash(s).deck.unshift({ uid: 'esc', defId: 'bw3-9' });
    const after = attack(s, 0);
    expect(after.log!.some((e) => e.text.includes("isn't in play"))).toBe(false);
  });

  it('Lure Poison with no Benched Pokémon: the Active Pokémon is Poisoned (Grimer\'s on heads, Carnivine\'s)', () => {
    const grimer = duel('charmander', 'onix');
    put(grimer, 'ash', 'active', mon('bw9-45', 'Grimer', P, 70, [['Lure Poison', [C], 0]]), ['psychic']);
    expect(misty(attack(flips(grimer, true), 0)).active!.poison).toBe(10);
    const carnivine = duel('charmander', 'onix');
    put(carnivine, 'ash', 'active', mon('bw5-5', 'Carnivine', G, 90, [['Lure Poison', [G], 0]]), ['grass']);
    expect(misty(attack(carnivine, 0)).active!.poison).toBe(10);
  });

  it('Tailwind and Helping Hand can\'t be used when they\'d do nothing', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('bw2-82', 'Unfezant', C, 130, [['Tailwind', [C], 0]], { stage: 'stage2' }), ['fire']);
    ash(s).hand = ash(s).hand.filter((c) => s.cards[c.defId]!.kind !== 'energy');
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
    ash(s).hand.push({ uid: 'w', defId: 'water' });
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(true);
    const t = duel('charmander', 'onix');
    put(t, 'ash', 'active', mon('bw2-11', 'Whimsicott', P, 70, [['Helping Hand', [C], 0]], { stage: 'stage1' }), ['fire']);
    expect(applyAction(t, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
  });

  it('Solar Revelation: no effect but damage on any of its player\'s Pokémon with Energy, the Bench too', () => {
    const s = duel('charmander', 'onix');
    // EX Sandstorm Wobbuffet's Psyimpact: a damage counter on each of the opponent's Pokémon.
    put(s, 'ash', 'active', mon('ex2-55', 'Wobbuffet', P, 80, [['Psyimpact', [P], 0]]), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, mon('bw5-48', 'Espeon', P, 90, [], { stage: 'stage1', ...ability('Solar Revelation') }));
    put(s, 'misty', 1, big('Ditto'), ['water']);
    const after = attack(s, 0);
    expect(misty(after).bench[1]!.damage).toBe(0);
    expect(misty(after).bench[0]!.damage).toBe(10);
  });
});

describe('Trainers', () => {
  it('Great Ball: only a Basic Pokémon, never a Pokémon-ex or Pokémon-EX', () => {
    const s = duel('charmander', 'onix');
    s.cards = {
      ...s.cards,
      'bw2-93': { id: 'bw2-93', kind: 'trainer', name: 'Great Ball', imageUrl: null, text: '' },
      'test-ex': mon('test-ex', 'Mewtwo-EX', P, 170, [], { pokemonEX: true }),
    };
    ash(s).deck.unshift({ uid: 'basic', defId: id('onix') }, { uid: 'evo', defId: id('charmeleon') }, { uid: 'ex', defId: 'test-ex' });
    ash(s).hand.push({ uid: 'ball', defId: 'bw2-93' });
    const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'ball' });
    const view = getPlayerView(after, 'ash').self.pendingChoice as { options: { uid: string }[] };
    expect(view.options.map((c) => c.uid)).toContain('basic');
    expect(view.options.map((c) => c.uid)).not.toContain('evo');
    expect(view.options.map((c) => c.uid)).not.toContain('ex');
  });

  it('Moon Guidance evolves on the first turn too, not a Pokémon played this turn', () => {
    const s = duel('charmander', 'onix');
    s.turn = 1;
    put(s, 'ash', 'active', mon('bw8-98', 'Clefable', C, 90, [], { stage: 'stage1', ...ability('Moon Guidance') }));
    put(s, 'ash', 0, mon('charmander-x', 'Charmander', F, 50, []));
    ash(s).deck = [{ uid: 'evo', defId: id('charmeleon') }, ...ash(s).deck];
    const after = act(flips(s, true), 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    const view = getPlayerView(after, 'ash').self.pendingChoice as { options: { uid: string }[] } | undefined;
    expect(view?.options.map((c) => c.uid)).toContain('evo');
  });
});

describe('Abilities used from the hand or the discard pile (USE_CARD_POWER)', () => {
  const use = (s: GameState, cardUid: string) => applyAction(s, 'ash', { type: 'USE_CARD_POWER', cardUid });
  const exeggcute = mon('bw9-4', 'Exeggcute', P, 50, [], ability('Propagation'));
  const archen = mon('bw10-53', 'Archen', C, 80, [], ability('Prehistoric Call'));
  const hooh = mon('bw6-22', 'Ho-Oh-EX', F, 170, [], { pokemonEX: true, ...ability('Rebirth') });
  const audino = mon('bw7-126', 'Audino', C, 90, [], ability('Busybody'));
  const withCards = (s: GameState, ...defs: PokemonCardDef[]) => Object.assign(s, { cards: { ...s.cards, ...Object.fromEntries(defs.map((d) => [d.id, d])) } });

  it('Propagation: into the hand, once a turn for each card; Prehistoric Call: the bottom of the deck', () => {
    const s = withCards(duel('charmander', 'onix'), exeggcute, archen);
    ash(s).discard.push({ uid: 'egg', defId: 'bw9-4' }, { uid: 'arc', defId: 'bw10-53' });
    expect(use(s, 'nothing').ok).toBe(false);
    const after = act(s, 'ash', { type: 'USE_CARD_POWER', cardUid: 'egg' });
    expect(ash(after).hand.map((c) => c.uid)).toContain('egg');
    // Back in the discard pile, the same card can't use it again this turn.
    ash(after).hand = ash(after).hand.filter((c) => c.uid !== 'egg');
    ash(after).discard.push({ uid: 'egg', defId: 'bw9-4' });
    expect(use(after, 'egg').ok).toBe(false);
    const called = act(s, 'ash', { type: 'USE_CARD_POWER', cardUid: 'arc' });
    expect(ash(called).deck.at(-1)!.uid).toBe('arc');
    // In the hand, a discard-pile Ability can't be used.
    ash(s).hand.push({ uid: 'egg2', defId: 'bw9-4' });
    expect(use(s, 'egg2').ok).toBe(false);
  });

  it('Garbotoxin stops them', () => {
    const s = withCards(duel('charmander', 'onix'), exeggcute);
    ash(s).discard.push({ uid: 'egg', defId: 'bw9-4' });
    const garbodor = put(s, 'misty', 0, mon('bw6-54', 'Garbodor', P, 100, [], { stage: 'stage1', ...ability('Garbotoxin') }));
    s.cards = { ...s.cards, tool: { id: 'tool', kind: 'trainer', name: 'Tool', imageUrl: null, text: '' } };
    garbodor.attached = [{ card: { uid: 't', defId: 'tool' }, until: Infinity, tool: true }];
    expect(use(s, 'egg').ok).toBe(false);
  });

  it('Rebirth: heads, onto the Bench with basic Energy cards of 3 different types', () => {
    const s = withCards(duel('charmander', 'onix'), hooh);
    ash(s).discard.push({ uid: 'ho', defId: 'bw6-22' }, { uid: 'f1', defId: 'fire' }, { uid: 'f2', defId: 'fire' }, { uid: 'w1', defId: 'water' }, { uid: 'g1', defId: 'grass' });
    const tails = act(flips(s, false), 'ash', { type: 'USE_CARD_POWER', cardUid: 'ho' });
    expect(ash(tails).discard.map((c) => c.uid)).toContain('ho');
    let after = act(flips(s, true), 'ash', { type: 'USE_CARD_POWER', cardUid: 'ho' });
    const slot = ash(after).bench.findIndex((p) => p?.card.uid === 'ho');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(after.pendingChoice).toMatchObject({ kind: 'attachFromDiscard', count: 3, distinctTypes: true });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    const view = getPlayerView(after, 'ash').self.pendingChoice as { options: { uid: string }[] };
    expect(view.options.map((c) => c.uid)).not.toContain('f2');
    // The last type left (Grass) is taken for the player (the same-card rule).
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    expect(ash(after).bench[slot]!.energy.map((e) => e.uid)).toEqual(['f1', 'w1', 'g1']);
    expect(after.pendingChoice).toBeUndefined();
    // A full Bench: it can't be used.
    for (let i = 0; i < 5; i++) put(s, 'ash', i, big(`B${i}`));
    expect(use(s, 'ho').ok).toBe(false);
  });

  it('Busybody: 10 off the Active Pokémon and a Special Condition, then Audino discarded', () => {
    const s = withCards(duel('charmander', 'onix'), audino);
    ash(s).hand.push({ uid: 'aud', defId: 'bw7-126' });
    ash(s).active!.damage = 30;
    ash(s).active!.condition = 'confused';
    const after = act(s, 'ash', { type: 'USE_CARD_POWER', cardUid: 'aud' });
    expect(ash(after).active).toMatchObject({ damage: 20, condition: null });
    expect(ash(after).discard.map((c) => c.uid)).toContain('aud');
    // Two Special Conditions: the player picks which.
    ash(s).active!.poison = 10;
    const asked = act(s, 'ash', { type: 'USE_CARD_POWER', cardUid: 'aud' });
    expect(asked.pendingChoice).toMatchObject({ kind: 'removeCondition', target: 'active' });
  });
});
