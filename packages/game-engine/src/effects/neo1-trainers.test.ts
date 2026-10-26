import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState, type PokemonCardDef, type TrainerChoices } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
/** Ash plays the Trainer `name` from the hand. */
const play = (s: GameState, name: string, choices: TrainerChoices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
const tryPlay = (s: GameState, name: string, choices: TrainerChoices = {}) => applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
const resolve = (s: GameState, player: string, answer: object = {}) => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });
const card = (uid: string, name: string) => ({ uid, defId: id(name) });
/** A duel with both hands empty (Ash's 7-card deck is all Charmander). */
const table = (...args: Parameters<typeof duel>) => {
  const s = duel(...args);
  ash(s).hand = [];
  misty(s).hand = [];
  return s;
};

describe('Neo Genesis Trainers', () => {
  describe('Pokémon Tools', () => {
    it('attach to a Pokémon without one; a second Tool can’t go on it', () => {
      let s = play(table('charmander', 'squirtle'), 'berry', { target: 'active' });
      expect(ash(s).active!.attached).toMatchObject([{ card: { defId: id('berry') }, tool: true }]);
      expect(tryPlay(s, 'goldBerry')).toMatchObject({ ok: false, error: 'All your Pokémon have a Pokémon Tool attached' });
      s = table('charmander', 'squirtle', { bench: ['squirtle'] });
      s = play(s, 'berry', { target: 'active' });
      // Only the benched Pokémon is left to choose: no question.
      s = play(s, 'goldBerry');
      expect(ash(s).bench[0]!.attached).toMatchObject([{ card: { defId: id('goldBerry') } }]);
    });

    it('Focus Band: on heads, a Pokémon the opponent’s attack would Knock Out is left with 10 HP, and the band is discarded', () => {
      let s = table('squirtle', 'charmander', { defenderEnergy: ['fire'] });
      ash(s).active!.damage = 30;
      s = endTurn(play(s, 'focusBand', { target: 'active' }), 'ash');
      s = attack(flips(s, true), 0, {}, 'misty');
      expect([ash(s).active!.damage, ash(s).active!.attached ?? [], ash(s).discard.some((c) => c.defId === id('focusBand'))]).toEqual([30, [], true]);
      // Tails: Knocked Out.
      let t = table('squirtle', 'charmander', { defenderEnergy: ['fire'], bench: ['squirtle'] });
      ash(t).active!.damage = 30;
      t = attack(flips(endTurn(play(t, 'focusBand', { target: 'active' }), 'ash'), false), 0, {}, 'misty');
      expect(ash(t).discard.some((c) => c.defId === id('squirtle'))).toBe(true);
    });

    it('Berry removes 2 damage counters between turns once there are 2 or more, then is discarded', () => {
      let s = play(table('charmander', 'squirtle'), 'berry', { target: 'active' });
      ash(s).active!.damage = 10;
      s = endTurn(s, 'ash');
      expect(ash(s).active!.damage).toBe(10);
      ash(s).active!.damage = 30;
      s = endTurn(s, 'misty');
      expect([ash(s).active!.damage, ash(s).active!.attached ?? []]).toEqual([10, []]);
    });

    it('Gold Berry removes 4 damage counters once there are 4 or more', () => {
      let s = play(table('charmeleon', 'squirtle'), 'goldBerry', { target: 'active' });
      ash(s).active!.damage = 50;
      s = endTurn(s, 'ash');
      expect(ash(s).active!.damage).toBe(10);
    });

    it('Miracle Berry removes Special Conditions between turns', () => {
      let s = play(table('charmander', 'squirtle'), 'miracleBerry', { target: 'active' });
      Object.assign(ash(s).active!, { condition: 'confused', poison: 10 });
      s = endTurn(s, 'ash');
      expect([ash(s).active!.condition ?? null, ash(s).active!.poison ?? 0, ash(s).active!.attached ?? []]).toEqual([null, 0, []]);
    });
  });

  describe('special Energy', () => {
    it('Darkness Energy (EX rules, agreed): 10 more damage to the Active Pokémon only from a Darkness or Dark Pokémon, no damage counters', () => {
      const s = attack(table('charmander', 'onix', { energy: ['darkness'] }), 0);
      expect([misty(s).active!.damage, ash(s).active!.damage]).toEqual([10, 0]);
      const dark = table('charmander', 'onix', { energy: ['darkness'] });
      dark.cards[id('charmander')] = { ...(dark.cards[id('charmander')] as PokemonCardDef), type: 'darkness' };
      expect(misty(attack(dark, 0)).active!.damage).toBe(20);
    });

    it('Metal Energy (EX rules, agreed): 10 less damage only to a Metal Pokémon, and nothing less from its own attacks', () => {
      expect(misty(attack(table('charmander', 'onix', { defenderEnergy: ['metal'], energy: ['fire', 'fire'] }), 1)).active!.damage).toBe(30);
      expect(misty(attack(table('charmander', 'onix', { energy: ['metal', 'fire'] }), 1)).active!.damage).toBe(30);
      const steel = table('charmander', 'onix', { defenderEnergy: ['metal'], energy: ['fire', 'fire'] });
      steel.cards[id('onix')] = { ...(steel.cards[id('onix')] as PokemonCardDef), type: 'metal' };
      expect(misty(attack(steel, 1)).active!.damage).toBe(20);
    });

    it('Recycle Energy goes back to the hand when it’s discarded from play', () => {
      let s = table('charmander', 'squirtle', { defenderEnergy: ['recycleEnergy'] });
    // Watched from the action that attached it on.
    s.recycleWatch = misty(s).active!.energy.map((e) => e.uid);
    s = play(s, 'energyremoval');
      expect([misty(s).active!.energy, misty(s).discard, misty(s).hand.some((c) => c.defId === id('recycleEnergy'))]).toEqual([[], [], true]);
    });
  });

  describe('Stadiums', () => {
    it('Ecogym: an Energy card the opponent’s effect discards goes back to the hand (not Colorless)', () => {
      let s = play(table('charmander', 'squirtle', { defenderEnergy: ['water'] }), 'ecogym');
      s = play(s, 'energyremoval');
      expect([misty(s).discard, misty(s).hand.some((c) => c.defId === id('water'))]).toEqual([[], true]);
      s = play(table('charmander', 'squirtle', { defenderEnergy: ['dce'] }), 'ecogym');
      expect(misty(play(s, 'energyremoval')).discard.map((c) => c.defId)).toEqual([id('dce')]);
    });

    it('Sprout Tower: Colorless Pokémon’s attacks do 30 less, after Weakness and Resistance', () => {
      const s = play(table('noctowl', 'charmander', { energy: ['fire', 'fire', 'fire'] }), 'sproutTower');
      expect(misty(attack(s, 0)).active!.damage).toBe(0);
      expect(misty(attack(play(table('charmander', 'squirtle', { energy: ['fire'] }), 'sproutTower'), 0)).active!.damage).toBe(10);
    });
  });

  it('Arcade Game: 2 or more of the top 3 with the same name go into the hand', () => {
    const s = play(table('charmander', 'squirtle'), 'arcadeGame');
    expect(ash(s).hand.filter((c) => c.defId === id('charmander'))).toHaveLength(3);
    expect(ash(s).deck).toHaveLength(4);
  });

  it('Energy Charge: heads shuffles up to 2 Energy cards from the discard pile into the deck', () => {
    let s = table('charmander', 'squirtle');
    ash(s).discard = [card('f1', 'fire'), card('f2', 'fire'), card('f3', 'fire')];
    s = play(flips(s, true), 'energyCharge', { discardUids: ['f1', 'f2'] });
    expect([ash(s).discard.map((c) => c.uid), ash(s).deck.length]).toEqual([['f3', expect.stringMatching(/^energyCharge/)], 9]);
    s = table('charmander', 'squirtle');
    expect(tryPlay(s, 'energyCharge')).toMatchObject({ ok: false });
  });

  it('Mary: draw 2, then shuffle 2 cards from the hand into the deck', () => {
    let s = play(table('charmander', 'squirtle'), 'mary');
    expect(ash(s).hand).toHaveLength(2);
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromHand' });
    s = resolve(s, 'ash', { cardUid: ash(s).hand[0]!.uid });
    s = resolve(s, 'ash', { cardUid: ash(s).hand[0]!.uid });
    expect([ash(s).hand.length, ash(s).deck.length, s.pendingChoice]).toEqual([0, 7, undefined]);
  });

  it('PokéGear: take a Trainer card from the top 7, and no more Trainer cards this turn', () => {
    let s = table('charmander', 'squirtle');
    ash(s).deck.splice(3, 0, card('bill', 'bill'), card('ball', 'pokeball'));
    s = play(s, 'pokeGear');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ options: [{ uid: 'bill' }, { uid: 'ball' }] });
    s = resolve(s, 'ash', { cardUid: 'bill' });
    expect(ash(s).hand.map((c) => c.uid)).toEqual(['bill']);
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'bill', choices: {} })).toMatchObject({ ok: false });
  });

  describe('Time Capsule', () => {
    it('the opponent, then the player, shuffle 5 Pokémon and basic Energy cards (or none) back', () => {
      let s = table('charmander', 'squirtle');
      misty(s).discard = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((u) => card(u, 'squirtle'));
      ash(s).discard = [card('a1', 'fire'), card('a2', 'bill')];
      s = play(s, 'timeCapsule');
      expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'timeCapsule', then: 'ash' });
      s = resolve(s, 'misty', { cardUid: 'm1' });
      // Once started, all 5.
      expect(applyAction(s, 'misty', { type: 'RESOLVE_CHOICE' })).toMatchObject({ ok: false });
      for (const u of ['m2', 'm3', 'm4', 'm5']) s = resolve(s, 'misty', { cardUid: u });
      expect([misty(s).discard.map((c) => c.uid), s.pendingChoice]).toMatchObject([['m6'], { player: 'ash' }]);
      // Fewer than 5: all or none. Declining is allowed.
      s = resolve(s, 'ash');
      expect([ash(s).discard.length, s.pendingChoice]).toEqual([3, undefined]);
      expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'bill')[0]!, choices: {} })).toMatchObject({ ok: false });
    });

    it('with nothing in the opponent’s discard pile, the player goes first', () => {
      let s = table('charmander', 'squirtle');
      ash(s).discard = [card('a1', 'fire')];
      s = play(s, 'timeCapsule');
      expect(s.pendingChoice).toMatchObject({ player: 'ash' });
      s = resolve(s, 'ash', { cardUid: 'a1' });
      expect([ash(s).discard.map((c) => c.defId), s.pendingChoice]).toEqual([[id('timeCapsule')], undefined]);
    });
  });

  it("Bill's Teleporter: heads draws 4", () => {
    expect(ash(play(flips(table('charmander', 'squirtle'), true), 'billsTeleporter')).hand).toHaveLength(4);
    expect(ash(play(flips(table('charmander', 'squirtle'), false), 'billsTeleporter')).hand).toHaveLength(0);
  });

  it('Card-Flip Game: turns a Prize card face up; a right guess draws 2', () => {
    let s = play(table('charmander', 'squirtle'), 'cardFlipGame', { pick: 2, guess: 2 });
    expect(misty(s).faceUpPrizes).toEqual([misty(s).prizes[2]!.uid]);
    expect(ash(s).hand).toHaveLength(2);
    const view = getPlayerView(s, 'ash');
    expect(view.opponent.faceUpPrizes?.[2]).toEqual(misty(s).prizes[2]);
    expect(view.opponent.faceUpPrizes?.[0]).toBeNull();
    // A face-up Prize can't be picked again; a wrong guess draws nothing.
    expect(tryPlay(structuredClone(s), 'cardFlipGame', { pick: 2, guess: 0 })).toMatchObject({ ok: false });
    s = play(s, 'cardFlipGame', { pick: 0, guess: 0 });
    expect(ash(s).hand).toHaveLength(2);
    misty(s).faceUpPrizes = misty(s).prizes.map((c) => c.uid);
    expect(tryPlay(s, 'cardFlipGame')).toMatchObject({ ok: false, error: 'Your opponent has no face-down Prize cards' });
  });

  it('New Pokédex: shuffle, then put up to 5 cards from the top back in any order', () => {
    const s = play(table('charmander', 'squirtle'), 'newPokedex');
    expect(s.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 5 });
  });

  it('Professor Elm: the hand goes into the deck, draw 7, no more Trainer cards this turn', () => {
    let s = table('charmander', 'squirtle');
    give(s, 'ash', 'bill', 'squirtle');
    s = play(s, 'professorElm');
    expect([ash(s).hand.length, ash(s).deck.length]).toEqual([7, 2]);
    expect(tryPlay(s, 'bill')).toMatchObject({ ok: false });
  });

  it('Super Scoop Up: heads returns a Pokémon and all its cards to the hand; not the only one in play', () => {
    expect(tryPlay(table('charmander', 'squirtle'), 'superScoopUp')).toMatchObject({ ok: false });
    let s = table('charmander', 'squirtle', { bench: ['squirtle'] });
    ash(s).bench[0]!.energy.push(card('w', 'water'));
    s = play(flips(s, true), 'superScoopUp', { target: 0 });
    expect([ash(s).bench[0], ash(s).hand.map((c) => c.defId).sort()]).toEqual([null, [id('squirtle'), id('water')].sort()]);
  });

  it('Double Gust: the opponent switches in one of your benched Pokémon, then you one of theirs', () => {
    let s = table('charmander', 'squirtle', { bench: ['magnemite', 'onix'], oppBench: ['charmeleon'] });
    s = play(s, 'doubleGust', { oppTarget: 0 });
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'oppPokemon', options: [0, 1] });
    s = resolve(s, 'misty', { target: 1 });
    expect([ash(s).active!.card.defId, misty(s).active!.card.defId]).toEqual([id('onix'), id('charmeleon')]);
    // No Bench of your own: just theirs.
    s = play(table('charmander', 'squirtle', { oppBench: ['charmeleon'] }), 'doubleGust', { oppTarget: 0 });
    expect([s.pendingChoice, misty(s).active!.card.defId]).toEqual([undefined, id('charmeleon')]);
    expect(tryPlay(table('charmander', 'squirtle'), 'doubleGust')).toMatchObject({ ok: false });
  });

  it('Moo-Moo Milk: 20 healed for each heads of 2 flips', () => {
    let s = table('charmeleon', 'squirtle');
    ash(s).active!.damage = 60;
    s = play(flips(s, true, true), 'mooMooMilk');
    expect(ash(s).active!.damage).toBe(20);
    expect(tryPlay(table('charmeleon', 'squirtle'), 'mooMooMilk')).toMatchObject({ ok: false });
  });

  it('Pokémon March: the opponent, then the player, may bench a Basic Pokémon from the deck', () => {
    let s = table('charmander', 'squirtle');
    // A second Basic Pokémon in Ash's deck, so his search is still asked.
    ash(s).deck.push(card('sq', 'squirtle'));
    s = play(s, 'pokemonMarch');
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'pickFromDeck', filter: 'basic', toBench: true, then: 'ash' });
    s = resolve(s, 'misty', { cardUid: misty(s).deck[0]!.uid });
    expect(s.pendingChoice).toMatchObject({ player: 'ash' });
    s = resolve(s, 'ash');
    expect([misty(s).bench.filter(Boolean).length, ash(s).bench.filter(Boolean).length, s.pendingChoice]).toEqual([1, 0, undefined]);
  });

  it('Super Rod: heads takes an Evolution card from the discard pile, tails a Basic Pokémon', () => {
    let s = table('charmander', 'squirtle');
    ash(s).discard = [card('basic', 'squirtle'), card('evo', 'charmeleon'), card('basic2', 'charmander'), card('evo2', 'darkCharmeleon')];
    expect(getPlayerView(play(flips(s, true), 'superRod'), 'ash').self.pendingChoice).toMatchObject({ options: [{ uid: 'evo' }, { uid: 'evo2' }] });
    expect(getPlayerView(play(flips(s, false), 'superRod'), 'ash').self.pendingChoice).toMatchObject({ options: [{ uid: 'basic' }, { uid: 'basic2' }] });
    ash(s).discard = [card('evo', 'charmeleon')];
    expect(play(flips(s, false), 'superRod').pendingChoice).toBeUndefined();
  });

  it('Jaw Clamp keeps Double Gust and Super Scoop Up off the held Active Pokémon', () => {
    let s = table('charmander', 'squirtle', { bench: ['magnemite'], oppBench: ['onix'] });
    ash(s).active!.effects = { heldBy: { by: misty(s).active!.card.uid, switches: true } };
    // Super Scoop Up can only take the benched one.
    s = play(flips(s, true), 'superScoopUp');
    expect([ash(s).active!.card.defId, ash(s).bench[0]]).toEqual([id('charmander'), null]);
    s = table('charmander', 'squirtle', { bench: ['magnemite'], oppBench: ['onix'] });
    ash(s).active!.effects = { heldBy: { by: misty(s).active!.card.uid, switches: true } };
    s = resolve(play(s, 'doubleGust', { oppTarget: 0 }), 'misty', { target: 0 });
    expect([ash(s).active!.card.defId, misty(s).active!.card.defId]).toEqual([id('charmander'), id('onix')]);
  });
});
