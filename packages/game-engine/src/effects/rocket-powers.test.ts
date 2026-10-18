import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, powerTakesHandCard, situationCounts, type GameState, type Target } from '../index.js';
import { act, attack, duel, flips, give, id, pokemon } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const usePower = (s: GameState, source: Target, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const tryPower = (s: GameState, source: Target, choices = {}) => applyAction(s, 'ash', { type: 'USE_POWER', source, choices });
const situation = (s: GameState, source: Target) => ({ me: ash(s), opp: misty(s), counts: situationCounts(ash(s), misty(s)), source, cards: s.cards, turn: s.turn });
/** Ash evolves the Active Pokémon with `name` from the hand. */
const evolve = (s: GameState, name: string) => act(s, 'ash', { type: 'EVOLVE', cardUid: give(s, 'ash', name)[0]!, target: 'active' });

describe('Team Rocket Pokémon Powers', () => {
  it('Summon Minions: evolving into Dark Dragonite puts up to 2 Basic Pokémon from the deck onto the Bench', () => {
    let s = evolve(duel('darkDragonair', 'onix'), 'darkDragonite');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', optional: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).deck[0]!.uid });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).deck[0]!.uid });
    expect([ash(s).bench.filter(Boolean).length, s.pendingChoice]).toEqual([2, undefined]);
    // "Up to": taking none is fine.
    const none = act(evolve(duel('darkDragonair', 'onix'), 'darkDragonite'), 'ash', { type: 'RESOLVE_CHOICE' });
    expect([ash(none).bench.filter(Boolean).length, none.pendingChoice]).toEqual([0, undefined]);
  });

  it("Sneak Attack: evolving into Dark Golbat may do 10 damage to one of the opponent's Pokémon, picked on the board", () => {
    const s = evolve(duel('zubat', 'onix', { oppBench: ['squirtle'] }), 'darkGolbat');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'oppPokemon', options: ['active', 0] });
    expect(misty(act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 })).bench[0]!.damage).toBe(10);
    expect(misty(act(s, 'ash', { type: 'RESOLVE_CHOICE' })).bench[0]!.damage).toBe(0);
  });

  it('Sneak Attack can Knock Out a Pokémon during the turn', () => {
    const s = evolve(duel('zubat', 'onix', { oppBench: ['squirtle'] }), 'darkGolbat');
    misty(s).bench[0]!.damage = 30;
    const after = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([misty(after).bench[0], ash(after).hand.length, after.currentPlayer]).toEqual([null, ash(s).hand.length + 1, 'ash']);
  });

  it('Reel In: evolving into Dark Slowbro puts up to 3 Pokémon cards from the discard pile into the hand', () => {
    let s = duel('slowpoke', 'onix');
    ash(s).discard = [
      { uid: 'c1', defId: id('charmander') },
      { uid: 'f1', defId: 'fire' },
      { uid: 'c2', defId: id('squirtle') },
    ];
    s = evolve(s, 'darkSlowbro');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDiscard', options: [{ uid: 'c1' }, { uid: 'c2' }] });
    s = act(act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'c1' }), 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'c2' });
    // No Pokémon cards left, so it's over after 2.
    expect([ash(s).discard.map((c) => c.uid), s.pendingChoice]).toEqual([['f1'], undefined]);
  });

  it("Final Beam: when an attack Knocks Out Dark Gyarados, heads does 20 per Water Energy to the attacker, with Weakness", () => {
    const s = duel('charmander', 'darkGyarados', { energy: ['fire'], defenderEnergy: ['water', 'water'], bench: ['squirtle'], oppBench: ['squirtle'] });
    misty(s).active!.damage = 60;
    const heads = attack(flips(s, true), 0);
    expect(heads.log!.map((e) => e.text)).toContain('Final Beam did 80 damage to Charmander.');
    expect(attack(flips(s, false), 0).log!.map((e) => e.text).some((t) => t.startsWith('Final Beam did'))).toBe(false);
    // Not Knocked Out: nothing.
    misty(s).active!.damage = 0;
    expect(ash(attack(flips(s, true), 0)).active!.damage).toBe(0);
  });

  it('Hay Fever: no Trainer cards can be played', () => {
    const s = duel('charmander', 'onix', { oppBench: ['darkVileplume'] });
    const [recycle] = give(s, 'ash', 'recycle');
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: recycle! })).toEqual({ ok: false, error: 'Hay Fever: no Trainer cards can be played' });
  });

  it("Sinkhole: when the opponent's Active Pokémon retreats, they flip; tails does 20 to it", () => {
    const s = duel('charmander', 'onix', { energy: ['fire'], bench: ['squirtle'], oppBench: ['darkDugtrio'] });
    const retreat = (state: GameState) => act(state, 'ash', { type: 'RETREAT', slot: 0, energyUids: [ash(state).active!.energy[0]!.uid] });
    expect(ash(retreat(flips(s, false))).bench[0]!.damage).toBe(20);
    expect(ash(retreat(flips(s, true))).bench[0]!.damage).toBe(0);
  });

  it("Sticky Goo: while Dark Muk is Active, the opponent's Active Pokémon costs 2 more to retreat", () => {
    const s = duel('charmander', 'darkMuk', { energy: ['fire'], bench: ['squirtle'] });
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [ash(s).active!.energy[0]!.uid] })).toEqual({ ok: false, error: 'Retreating costs 3 energy' });
  });

  it('Frenzy: Dark Primeape does 30 more while Confused, to itself too', () => {
    const s = duel('darkPrimeape', 'onix', { energy: ['fighting', 'fighting'] });
    ash(s).active!.condition = 'confused';
    expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(70);
    expect(ash(attack(flips(s, false), 0)).active!.damage).toBe(50);
  });

  it('Gather Fire moves a Fire Energy card from another of your Pokémon to Charmander, once a turn', () => {
    const s = duel('charmanderR', 'onix');
    expect(tryPower(s, 'active')).toEqual({ ok: false, error: 'None of your other Pokémon have Fire Energy cards' });
    ash(s).bench[0] = pokemon('squirtle', ['fire']);
    const after = usePower(s, 'active', { from: 0 });
    expect([ash(after).active!.energy.length, ash(after).bench[0]!.energy]).toEqual([1, []]);
    ash(after).bench[0]!.energy.push({ uid: 'f2', defId: 'fire' });
    expect(tryPower(after, 'active', { from: 0 })).toMatchObject({ ok: false, error: 'Charmander has already used Gather Fire this turn' });
  });

  it('Pollen Stench and Long Distance Hypnosis: heads affects the Defending Pokémon, tails your Active Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['darkGloom', 'drowzeeR'] });
    expect(misty(usePower(flips(s, true), 0)).active!.condition).toBe('confused');
    expect([ash(usePower(flips(s, false), 0)).active!.condition, misty(usePower(flips(s, false), 0)).active!.condition]).toEqual(['confused', undefined]);
    expect(misty(usePower(flips(s, true), 1)).active!.condition).toBe('asleep');
    expect(ash(usePower(flips(s, false), 1)).active!.condition).toBe('asleep');
  });

  it("Matter Exchange discards a card from the hand to draw a card, and isn't used by dropping an Energy on a Pokémon", () => {
    const s = duel('darkKadabra', 'onix');
    const [fire] = give(s, 'ash', 'fire');
    expect(powerTakesHandCard(situation(s, 'active'), fire!)).toBe(false);
    const hand = ash(s).hand.length;
    const after = usePower(s, 'active', { cardUid: fire });
    expect([ash(after).hand.length, ash(after).discard.map((c) => c.uid)]).toEqual([hand, [fire]]);
  });

  it('Trickery switches the Prize the player picks with the top card of the deck', () => {
    const s = duel('rattataR', 'onix');
    const [prize, top] = [ash(s).prizes[2]!, ash(s).deck[0]!];
    const after = usePower(s, 'active', { prize: 2 });
    expect([ash(after).prizes[2], ash(after).deck[0]]).toEqual([top, prize]);
  });

  it('Evolutionary Light takes an Evolution card from the deck', () => {
    const s = duel('darkDragonair', 'onix');
    ash(s).deck.push({ uid: 'cm', defId: id('charmeleon') });
    const after = usePower(s, 'active');
    expect(getPlayerView(after, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: [{ uid: 'cm' }] });
    expect(ash(act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'cm' })).hand.map((c) => c.uid)).toContain('cm');
  });
});
