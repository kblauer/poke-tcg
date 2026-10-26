import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState, type TrainerChoices } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, pokemon } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
/** Ash plays the Trainer `name` from the hand. */
const play = (s: GameState, name: string, choices: TrainerChoices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
/** Ash attaches the Energy `name` from the hand to the Active Pokémon. */
const attach = (s: GameState, name: string) => act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: give(s, 'ash', name)[0]!, target: 'active' });

describe('Team Rocket Trainers', () => {
  it('Here Comes Team Rocket! shows both players their own and the opponent’s Prize cards', () => {
    const before = getPlayerView(duel('charmander', 'onix'), 'ash');
    expect([before.self.prizes, before.opponent.prizes]).toEqual([undefined, undefined]);
    const s = play(duel('charmander', 'onix'), 'teamRocket');
    const view = getPlayerView(s, 'ash');
    expect([view.self.prizes, view.opponent.prizes]).toEqual([ash(s).prizes, misty(s).prizes]);
    expect(view.cards[misty(s).prizes[0]!.defId]).toBeDefined();
  });

  it("Rocket's Sneak Attack shows the opponent's hand; they shuffle the Trainer card chosen into their deck", () => {
    let s = duel('charmander', 'onix');
    misty(s).hand = [];
    // Two different Trainer cards, so the pick is asked (the same-card rule).
    const [recycle, , bill] = give(s, 'misty', 'recycle', 'squirtle', 'bill');
    const deck = misty(s).deck.length;
    s = play(s, 'rocketSneakAttack');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'oppHand', cards: misty(s).hand, options: [{ uid: recycle }, { uid: bill }] });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: misty(s).hand[1]!.uid })).toMatchObject({ ok: false });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: recycle });
    expect([misty(s).hand.map((c) => c.defId), misty(s).deck.length]).toEqual([[id('squirtle'), id('bill')], deck + 1]);
    // No Trainer cards: just look.
    misty(s).hand = [];
    expect(act(play(s, 'rocketSneakAttack'), 'ash', { type: 'RESOLVE_CHOICE' }).pendingChoice).toBeUndefined();
  });

  it("The Boss's Way takes an Evolution card with Dark in its name", () => {
    const s = duel('charmander', 'onix');
    ash(s).deck.push({ uid: 'dark', defId: id('darkCharmeleon') }, { uid: 'plain', defId: id('charmeleon') }, { uid: 'dark2', defId: id('darkCharizard') });
    expect(getPlayerView(play(s, 'bossWay'), 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: [{ uid: 'dark2' }, { uid: 'dark' }] });
  });

  describe('Challenge!', () => {
    it('declined: the player draws 2 cards', () => {
      let s = play(duel('charmander', 'onix'), 'challenge');
      expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'challenge' });
      const hand = ash(s).hand.length;
      s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
      expect([ash(s).hand.length, s.pendingChoice]).toEqual([hand + 2, undefined]);
    });

    it('accepted: the player, then the opponent, put any number of Basic Pokémon from their deck onto their Bench', () => {
      const start = duel('charmander', 'onix');
      // Different Basic Pokémon in Misty's deck, so her search is still asked after 2 (the same-card rule).
      misty(start).deck.unshift({ uid: 'm-sq', defId: id('squirtle') }, { uid: 'm-ox', defId: id('onix') }, { uid: 'm-mg', defId: id('magnemite') });
      let s = act(play(start, 'challenge'), 'misty', { type: 'RESOLVE_CHOICE', count: 1 });
      expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'pickFromDeck', filter: 'basic', toBench: true, count: 5 });
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: ash(s).deck[0]!.uid });
      s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
      expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'pickFromDeck' });
      s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'm-sq' });
      s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'm-ox' });
      s = act(s, 'misty', { type: 'RESOLVE_CHOICE' });
      expect([ash(s).bench.filter(Boolean).length, misty(s).bench.filter(Boolean).length, s.pendingChoice]).toEqual([1, 2, undefined]);
    });

    it('with both Benches full, the player just draws 2', () => {
      const full = ['squirtle', 'squirtle', 'squirtle', 'squirtle', 'squirtle'];
      const s = duel('charmander', 'onix', { bench: full, oppBench: full });
      const hand = ash(s).hand.length;
      const after = play(s, 'challenge');
      expect([ash(after).hand.length, after.pendingChoice]).toEqual([hand + 2, undefined]);
    });
  });

  it('Digger: the coin passes back and forth on heads; whoever flips tails takes 10 on their Active Pokémon', () => {
    const s = duel('charmander', 'onix');
    const damage = (state: GameState) => [ash(state).active!.damage, misty(state).active!.damage];
    expect(damage(play(flips(s, false), 'digger'))).toEqual([10, 0]);
    expect(damage(play(flips(s, true, false), 'digger'))).toEqual([0, 10]);
    expect(damage(play(flips(s, true, true, false), 'digger'))).toEqual([10, 0]);
  });

  it("Imposter Oak's Revenge discards a card; the opponent shuffles their hand into their deck and draws 4", () => {
    const s = duel('charmander', 'onix');
    const [fire] = give(s, 'ash', 'fire');
    const after = play(s, 'imposterOak', { handUids: [fire!] });
    expect(ash(after).discard.map((c) => c.uid)).toContain(fire);
    expect(misty(after).hand.length).toBe(4);
  });

  it('Nightly Garbage Run shuffles up to 3 Pokémon or basic Energy cards from the discard pile into the deck', () => {
    const s = duel('charmander', 'onix');
    ash(s).discard = [
      { uid: 'c', defId: id('charmander') },
      { uid: 'f', defId: 'fire' },
      { uid: 'r', defId: id('recycle') },
    ];
    const deck = ash(s).deck.length;
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'garbageRun')[0]!, choices: { discardUids: ['r'] } })).toMatchObject({ ok: false });
    const after = play(s, 'garbageRun', { discardUids: ['c', 'f'] });
    // The Trainer itself and Recycle stay in the discard pile.
    expect([ash(after).discard.map((c) => c.defId).sort(), ash(after).deck.length]).toEqual([[id('recycle'), id('garbageRun')].sort(), deck + 2]);
  });

  it("Goop Gas Attack stops every Pokémon Power until the end of the opponent's next turn", () => {
    let s = duel('rattataR', 'darkMuk', { energy: ['fire'], bench: ['squirtle'] });
    s = play(s, 'goopGas');
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { prize: 0 } })).toMatchObject({ ok: false, error: expect.stringContaining('Goop Gas Attack') });
    // Sticky Goo doesn't work either: retreating costs 1.
    expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [ash(s).active!.energy[0]!.uid] }).ok).toBe(true);
    s = endTurn(s, 'ash');
    expect(misty(s).powersOffUntil).toBe(4);
    s = endTurn(s, 'misty');
    expect([ash(s).powersOffUntil, misty(s).powersOffUntil]).toEqual([undefined, undefined]);
  });

  it('Sleep!: heads puts the Defending Pokémon to sleep', () => {
    const s = duel('charmander', 'onix');
    expect(misty(play(flips(s, true), 'sleep')).active!.condition).toBe('asleep');
    expect(misty(play(flips(s, false), 'sleep')).active!.condition).toBeUndefined();
  });
});

describe('Team Rocket special Energy', () => {
  it('Rainbow Energy does 10 damage when attached from the hand, and counts as every type (even for a Fire Energy discard)', () => {
    let s = attach(duel('charmander', 'onix', { energy: ['water'] }), 'rainbow');
    expect(ash(s).active!.damage).toBe(10);
    // Ember: Fire + Colorless, discarding a Fire Energy card. The Rainbow Energy is the only Fire one.
    s = attack(s, 1);
    expect([misty(s).active!.damage, ash(s).discard.map((c) => c.defId)]).toEqual([30, [id('rainbow')]]);
  });

  it("Rainbow Energy's damage can Knock Out the Pokémon it's attached to", () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    ash(s).active!.damage = 40;
    const after = attach(s, 'rainbow');
    expect([ash(after).active, after.pendingPromotion, misty(after).hand.length]).toEqual([null, 'ash', misty(s).hand.length + 1]);
  });

  it('Full Heal Energy cures Asleep, Confused, Paralyzed and Poisoned; Potion Energy removes a damage counter', () => {
    let s = duel('charmander', 'onix');
    Object.assign(ash(s).active!, { condition: 'confused', poison: 10, damage: 20 });
    s = attach(s, 'fullHeal');
    expect([ash(s).active!.condition, ash(s).active!.poison]).toEqual([null, 0]);
    s = { ...s, energyAttachedThisTurn: false };
    expect(ash(attach(s, 'potionEnergy')).active!.damage).toBe(10);
  });

  it('Rainbow Energy pays a typed cost', () => {
    const s = duel('charmander', 'onix');
    ash(s).active = pokemon('charmander', ['rainbow', 'water']);
    expect(misty(attack(s, 1)).active!.damage).toBe(30);
  });
});
