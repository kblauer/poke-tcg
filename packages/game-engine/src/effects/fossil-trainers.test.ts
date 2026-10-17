import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState, type TrainerChoices } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const play = (s: GameState, cardUid: string, choices?: TrainerChoices) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });
const tryPlay = (s: GameState, cardUid: string, choices?: TrainerChoices) => applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });

describe('Fossil Trainers', () => {
  it('Mr. Fuji shuffles a benched Pokémon and its cards into the deck', () => {
    const s = duel('charmander', 'onix', { bench: ['charmander'] });
    ash(s).bench[0]!.energy.push({ uid: 'e', defId: 'fire' });
    const deck = ash(s).deck.length;
    const [fuji] = give(s, 'ash', 'mrfuji');
    const after = play(s, fuji!, { target: 0 });
    expect(ash(after).bench[0]).toBeNull();
    expect(ash(after).deck.length).toBe(deck + 2);
    expect(tryPlay(duel('charmander', 'onix'), give(duel('charmander', 'onix'), 'ash', 'mrfuji')[0]!)).toMatchObject({ ok: false });
  });

  it('Energy Search takes a basic Energy card from the deck', () => {
    const s = duel('charmander', 'onix');
    ash(s).deck.push({ uid: 'f1', defId: 'fire' }, { uid: 'dce1', defId: id('dce') });
    const [search] = give(s, 'ash', 'energysearch');
    let after = play(s, search!);
    expect(getPlayerView(after, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: [{ uid: 'f1' }] });
    after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    expect(ash(after).hand.some((c) => c.uid === 'f1')).toBe(true);
  });

  it('Gambler shuffles the hand away and draws 8 on heads, 1 on tails', () => {
    const seen = new Set<boolean>();
    for (let seed = 1; seed < 40 && seen.size < 2; seed++) {
      const s = duel('charmander', 'onix');
      s.rngState = seed;
      give(s, 'ash', 'potion', 'potion');
      const [gambler] = give(s, 'ash', 'gambler');
      const total = ash(s).deck.length + ash(s).hand.length - 1;
      const after = play(s, gambler!);
      const heads = after.log!.find((l) => l.coin?.reason === 'Gambler')!.coin!.heads;
      seen.add(heads);
      expect(ash(after).hand).toHaveLength(heads ? 8 : 1);
      expect(ash(after).deck.length + ash(after).hand.length).toBe(total);
      expect(ash(after).discard.map((c) => c.defId)).toEqual([id('gambler')]);
    }
    expect(seen.size).toBe(2);
  });

  describe('Recycle', () => {
    it("can't be played with an empty discard pile", () => {
      const s = duel('charmander', 'onix');
      const [recycle] = give(s, 'ash', 'recycle');
      expect(tryPlay(s, recycle!)).toEqual({ ok: false, error: 'Your discard pile is empty' });
    });

    it('on heads, puts a chosen card from the discard pile on top of the deck (not Recycle itself)', () => {
      const s = flips(duel('charmander', 'onix'), true);
      ash(s).discard.push({ uid: 'd1', defId: 'fire' }, { uid: 'd2', defId: id('potion') });
      const [recycle] = give(s, 'ash', 'recycle');
      let after = play(s, recycle!);
      expect(getPlayerView(after, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDiscard', options: [{ uid: 'd1' }, { uid: 'd2' }] });
      expect(applyAction(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: recycle! }).ok).toBe(false);
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'd2' });
      expect(ash(after).deck[0]!.uid).toBe('d2');
      expect(ash(after).discard.map((c) => c.uid)).toEqual(['d1', recycle]);
    });

    it('does nothing on tails', () => {
      const s = flips(duel('charmander', 'onix'), false);
      ash(s).discard.push({ uid: 'd1', defId: 'fire' });
      const [recycle] = give(s, 'ash', 'recycle');
      const after = play(s, recycle!);
      expect(after.pendingChoice).toBeUndefined();
      expect(ash(after).discard.map((c) => c.uid)).toEqual(['d1', recycle]);
    });
  });

  describe('Mysterious Fossil', () => {
    it("is played onto the Bench, evolves into Omanyte, and Pokémon Breeder can put Omastar on it", () => {
      let s = duel('charmander', 'onix');
      const [fossil, fossil2] = give(s, 'ash', 'fossil', 'fossil');
      s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: fossil!, slot: 0 });
      s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: fossil2!, slot: 1 });
      s = endTurn(endTurn(s, 'ash'), 'misty');
      const [omanyte, omastar, breeder] = give(s, 'ash', 'omanyte', 'omastar', 'pokemonbreeder');
      s = act(s, 'ash', { type: 'EVOLVE', cardUid: omanyte!, target: 0 });
      expect(s.cards[ash(s).bench[0]!.card.defId]!.name).toBe('Omanyte');
      s = play(s, breeder!, { handUids: [omastar!], target: 1 });
      expect(s.cards[ash(s).bench[1]!.card.defId]!.name).toBe('Omastar');
    });

    it("can't be the starting Active, and gives no prize when Knocked Out", () => {
      const s = duel('charmander', 'onix');
      s.phase = 'setup';
      ash(s).active = null;
      const [fossil] = give(s, 'ash', 'fossil');
      expect(applyAction(s, 'ash', { type: 'SET_ACTIVE', cardUid: fossil! }).ok).toBe(false);

      const ko = duel('charmander', 'fossil', { energy: ['fire'], oppBench: ['onix'] });
      const after = attack(ko, 0);
      expect(misty(after).active).toBeNull();
      expect(ash(after).prizes).toHaveLength(6);
    });
  });
});
