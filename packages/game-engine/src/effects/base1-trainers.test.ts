import { describe, expect, it } from 'vitest';
import { applyAction, createGame, energyPool, getPlayerView, type GameState, type TrainerChoices } from '../index.js';
import { act, attack, CARDS, duel, endTurn, give, id } from './test-kit.js';

const play = (state: GameState, cardUid: string, choices?: TrainerChoices, player = 'ash') =>
  act(state, player, { type: 'PLAY_TRAINER', cardUid, choices });
const tryPlay = (state: GameState, cardUid: string, choices?: TrainerChoices, player = 'ash') =>
  applyAction(state, player, { type: 'PLAY_TRAINER', cardUid, choices });
const names = (state: GameState, cards: { defId: string }[]) => cards.map((c) => state.cards[c.defId]!.name);

/** Ash on turn 3 with Charmander active and a Charmander benched, against Squirtle; hands emptied. */
function table(opts: Parameters<typeof duel>[2] = {}) {
  const s = duel('charmander', 'squirtle', { bench: ['charmander'], ...opts });
  s.players.ash!.hand = [];
  s.players.misty!.hand = [];
  return s;
}

describe('Base Set Trainers', () => {
  describe('drawing', () => {
    it('Bill draws 2 cards and goes to the discard pile', () => {
      const s = table();
      const [bill] = give(s, 'ash', 'bill');
      const after = play(s, bill!);
      expect(after.players.ash!.hand).toHaveLength(2);
      expect(names(after, after.players.ash!.discard)).toEqual(['Bill']);
    });

    it('Professor Oak discards your hand and draws 7', () => {
      const s = table();
      const [oak] = give(s, 'ash', 'professoroak', 'potion', 'potion');
      const after = play(s, oak!);
      expect(after.players.ash!.hand).toHaveLength(7);
      expect(names(after, after.players.ash!.discard).sort()).toEqual(['Potion', 'Potion', 'Professor Oak']);
    });

    it("Impostor Professor Oak shuffles the opponent's hand into their deck; they draw 7", () => {
      const s = table();
      give(s, 'misty', 'potion', 'potion');
      const deck = s.players.misty!.deck.length;
      const [oak] = give(s, 'ash', 'impostorprofessoroak');
      const after = play(s, oak!);
      expect(after.players.misty!.hand).toHaveLength(7);
      expect(after.players.misty!.deck).toHaveLength(deck + 2 - 7);
    });

    it('Maintenance shuffles 2 other cards into the deck and draws 1', () => {
      const s = table();
      const [m] = give(s, 'ash', 'maintenance', 'potion', 'switch');
      expect(tryPlay(s, m!, { handUids: [] })).toMatchObject({ ok: false });
      const after = play(s, m!, { handUids: s.players.ash!.hand.slice(1).map((c) => c.uid) });
      expect(after.players.ash!.hand).toHaveLength(1);
      expect(after.players.ash!.deck).toHaveLength(s.players.ash!.deck.length + 1);
    });

    it('Lass shuffles every Trainer card in both hands into the decks', () => {
      const s = table();
      give(s, 'ash', 'potion', 'fire');
      give(s, 'misty', 'switch', 'doll', 'water');
      const [lass] = give(s, 'ash', 'lass');
      const after = play(s, lass!);
      expect(names(after, after.players.ash!.hand)).toEqual(['Fire Energy']);
      expect(names(after, after.players.misty!.hand)).toEqual(['Water Energy']);
    });
  });

  describe('searches', () => {
    it('Computer Search: discard 2, then only the player sees their deck to take any card', () => {
      const s = table();
      const [search, a, b] = give(s, 'ash', 'computersearch', 'potion', 'switch');
      let after = play(s, search!, { handUids: [a!, b!] });
      expect(after.pendingChoice).toMatchObject({ player: 'ash', kind: 'pickFromDeck' });
      const view = getPlayerView(after, 'ash').self.pendingChoice!;
      expect(view.kind === 'pickFromDeck' && view.options).toHaveLength(after.players.ash!.deck.length);
      expect(getPlayerView(after, 'misty').self.pendingChoice).toBeNull();
      // Nothing else until it's finished.
      expect(applyAction(after, 'ash', { type: 'END_TURN' })).toEqual({ ok: false, error: 'Finish Computer Search first' });
      const pick = after.players.ash!.deck[5]!;
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: pick.uid });
      expect(after.players.ash!.hand.map((c) => c.uid)).toEqual([pick.uid]);
      expect(after.pendingChoice).toBeUndefined();
      expect(names(after, after.players.ash!.discard).sort()).toEqual(['Computer Search', 'Potion', 'Switch']);
    });

    it('Pokémon Trader trades a Pokémon card from the hand for one from the deck', () => {
      const s = table();
      s.players.ash!.deck.unshift({ uid: 'deck-squirtle', defId: id('squirtle') });
      const [trader, offered] = give(s, 'ash', 'pokemontrader', 'bulbasaur');
      let after = play(s, trader!);
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'deck-squirtle' });
      expect(after.players.ash!.hand.map((c) => c.uid)).toEqual(['deck-squirtle']);
      expect(after.players.ash!.deck.some((c) => c.uid === offered)).toBe(true);
    });

    it('Pokédex rearranges the top 5 cards of the deck', () => {
      const s = table();
      const [dex] = give(s, 'ash', 'pokedex');
      let after = play(s, dex!);
      const top = after.players.ash!.deck.slice(0, 5).map((c) => c.uid);
      const order = [...top].reverse();
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', order });
      expect(after.players.ash!.deck.slice(0, 5).map((c) => c.uid)).toEqual(order);
    });

    it('Item Finder takes a Trainer back from the discard pile', () => {
      const s = table();
      s.players.ash!.discard.push({ uid: 'old-bill', defId: id('bill') });
      const [finder, a, b] = give(s, 'ash', 'itemfinder', 'fire', 'water');
      const after = play(s, finder!, { handUids: [a!, b!] });
      expect(after.players.ash!.hand.map((c) => c.uid)).toEqual(['old-bill']);
    });

    it('Energy Retrieval trades a card for up to 2 basic Energy from the discard pile', () => {
      const s = table();
      s.players.ash!.discard.push({ uid: 'f1', defId: 'fire' }, { uid: 'f2', defId: 'fire' }, { uid: 'f3', defId: 'fire' }, { uid: 'd', defId: id('dce') });
      const [retrieval, junk] = give(s, 'ash', 'energyretrieval', 'potion');
      const after = play(s, retrieval!, { handUids: [junk!], discardUids: ['f1', 'f2'] });
      expect(after.players.ash!.hand.map((c) => c.uid).sort()).toEqual(['f1', 'f2']);
      expect(tryPlay(s, retrieval!, { handUids: [junk!], discardUids: ['d'] })).toMatchObject({ ok: false });
    });
  });

  describe('healing', () => {
    it('Potion removes up to 20 damage', () => {
      const s = table();
      s.players.ash!.active!.damage = 30;
      const [potion] = give(s, 'ash', 'potion');
      expect(play(s, potion!, { target: 'active' }).players.ash!.active!.damage).toBe(10);
    });

    it('Super Potion discards an Energy to remove up to 40 damage', () => {
      const s = table({ energy: ['fire'] });
      s.players.ash!.active!.damage = 40;
      const [sp] = give(s, 'ash', 'superpotion');
      const after = play(s, sp!, { target: 'active' });
      expect(after.players.ash!.active!.damage).toBe(0);
      expect(after.players.ash!.active!.energy).toEqual([]);
    });

    it('Pokémon Center heals all damaged Pokémon and discards their Energy', () => {
      const s = table({ energy: ['fire', 'fire'] });
      s.players.ash!.active!.damage = 30;
      const [center] = give(s, 'ash', 'pokemoncenter');
      const after = play(s, center!);
      expect(after.players.ash!.active!.damage).toBe(0);
      expect(after.players.ash!.active!.energy).toEqual([]);
    });

    it('Full Heal removes Special Conditions and Poison from the Active Pokémon', () => {
      const s = table();
      Object.assign(s.players.ash!.active!, { condition: 'asleep', poison: 10 });
      const [heal] = give(s, 'ash', 'fullheal');
      const after = play(s, heal!);
      expect(after.players.ash!.active!.condition).toBeNull();
      expect(after.players.ash!.active!.poison).toBe(0);
    });
  });

  describe('switching', () => {
    it('Switch swaps in a Benched Pokémon and clears Special Conditions', () => {
      const s = table();
      s.players.ash!.active!.condition = 'paralyzed';
      const old = s.players.ash!.active!.card.uid;
      const [sw] = give(s, 'ash', 'switch');
      const after = play(s, sw!);
      expect(after.players.ash!.bench[0]!.card.uid).toBe(old);
      expect(after.players.ash!.bench[0]!.condition).toBeNull();
    });

    it("Gust of Wind brings out one of the opponent's Benched Pokémon", () => {
      const s = table({ oppBench: ['bulbasaur'] });
      const [gust] = give(s, 'ash', 'gustofwind');
      expect(play(s, gust!).players.misty!.active!.card.defId).toBe(id('bulbasaur'));
    });

    it('Scoop Up returns the Basic to the hand, discards the rest, and promotes mid-turn', () => {
      let s = table({ energy: ['fire'] });
      s.players.ash!.active!.evolvedFrom = [s.players.ash!.active!.card];
      s.players.ash!.active!.card = { uid: 'meleon', defId: id('charmeleon') };
      const basic = s.players.ash!.active!.evolvedFrom[0]!.uid;
      const [scoop] = give(s, 'ash', 'scoopup');
      s = play(s, scoop!, { target: 'active' });
      expect(s.players.ash!.hand.map((c) => c.uid)).toEqual([basic]);
      expect(names(s, s.players.ash!.discard).sort()).toEqual(['Charmeleon', 'Fire Energy', 'Scoop Up']);
      expect(s.phase).toBe('promote');
      s = act(s, 'ash', { type: 'PROMOTE', slot: 0 });
      expect([s.phase, s.currentPlayer, s.turn]).toEqual(['playing', 'ash', 3]);
    });

    it("Scoop Up can't take your only Pokémon in play", () => {
      const s = duel('charmander', 'squirtle');
      const [scoop] = give(s, 'ash', 'scoopup');
      expect(tryPlay(s, scoop!, { target: 'active' })).toEqual({ ok: false, error: "You can't Scoop Up your only Pokémon in play" });
    });
  });

  describe('energy removal', () => {
    it('Energy Removal discards an Energy from an opponent\'s Pokémon', () => {
      const s = table({ defenderEnergy: ['water', 'water'] });
      const [er] = give(s, 'ash', 'energyremoval');
      expect(play(s, er!).players.misty!.active!.energy).toHaveLength(1);
    });

    it('Super Energy Removal discards 1 of yours to discard up to 2 of theirs', () => {
      const s = table({ energy: ['fire'], defenderEnergy: ['water', 'water', 'water'] });
      const [ser] = give(s, 'ash', 'superenergyremoval');
      const theirs = s.players.misty!.active!.energy.slice(0, 2).map((e) => e.uid);
      const after = play(s, ser!, { oppTarget: 'active', oppEnergyUids: theirs });
      expect(after.players.ash!.active!.energy).toEqual([]);
      expect(after.players.misty!.active!.energy).toHaveLength(1);
    });
  });

  describe('attached Trainers', () => {
    it('PlusPower adds 10 after weakness and is discarded at the end of the turn', () => {
      const s = table({ energy: ['fire'] });
      const [plus] = give(s, 'ash', 'pluspower');
      let after = play(s, plus!);
      after = attack(after, 0); // Scratch 10 → 20
      expect(after.players.misty!.active!.damage).toBe(20);
      expect(after.players.ash!.active!.attached ?? []).toEqual([]);
      expect(names(after, after.players.ash!.discard)).toContain('PlusPower');
    });

    it("Defender reduces damage by 20 until the end of the opponent's next turn", () => {
      let s = table({ defenderEnergy: ['water', 'water'] });
      const [defender] = give(s, 'ash', 'defender');
      s = play(s, defender!, { target: 'active' });
      s = endTurn(s, 'ash');
      s = attack(s, 0, undefined, 'misty'); // Bubble: 10 × 2 (weak to Water) − 20
      expect(s.players.ash!.active!.damage).toBe(0);
      expect(s.players.ash!.active!.attached ?? []).toEqual([]);
    });
  });

  describe('evolution', () => {
    it('Pokémon Breeder puts a Stage 2 straight onto its Basic', () => {
      const s = table();
      const [breeder, zard] = give(s, 'ash', 'pokemonbreeder', 'charizard');
      const after = play(s, breeder!, { target: 'active' });
      expect(after.players.ash!.active!.card.uid).toBe(zard);
      expect(after.players.ash!.hand).toEqual([]);
      const first = { ...s, turn: 2 };
      expect(tryPlay(first, breeder!, { target: 'active' })).toEqual({ ok: false, error: "You can't evolve on your first turn" });
    });

    it('Devolution Spray devolves; a Pokémon with too much damage is Knocked Out and gives a prize', () => {
      let s = table({ oppBench: [] });
      const p = s.players.ash!.active!;
      p.evolvedFrom = [p.card];
      p.card = { uid: 'meleon', defId: id('charmeleon') };
      p.damage = 50; // Charmander has 50 HP
      const prizes = s.players.misty!.prizes.length;
      const [spray] = give(s, 'ash', 'devolutionspray');
      s = play(s, spray!, { target: 'active' });
      expect(s.players.ash!.active).toBeNull();
      expect(s.players.misty!.prizes).toHaveLength(prizes - 1);
      expect(s.phase).toBe('promote');
    });
  });

  describe('from the discard pile', () => {
    it('Revive benches a Basic with half its HP as damage, rounded down to 10', () => {
      const s = table();
      s.players.ash!.discard.push({ uid: 'dead', defId: id('charmander') });
      const [revive] = give(s, 'ash', 'revive');
      const after = play(s, revive!);
      expect(after.players.ash!.bench[1]).toMatchObject({ card: { uid: 'dead' }, damage: 20 });
    });

    it("Pokémon Flute benches a Basic from the opponent's discard pile", () => {
      const s = table();
      s.players.misty!.discard.push({ uid: 'theirs', defId: id('squirtle') });
      const [flute] = give(s, 'ash', 'pokemonflute');
      expect(play(s, flute!).players.misty!.bench[0]!.card.uid).toBe('theirs');
    });
  });

  describe('Clefairy Doll', () => {
    it('is played onto the Bench, but not chosen as the starting Active or counted as a Basic', () => {
      const s = table();
      const [doll] = give(s, 'ash', 'doll');
      expect(act(s, 'ash', { type: 'PLAY_BENCH', cardUid: doll!, slot: 2 }).players.ash!.bench[2]!.card.uid).toBe(doll);
      expect(() => createGame({ id: 'a', deck: Array(20).fill(id('doll')) }, { id: 'b', deck: Array(20).fill(id('charmander')) }, 1, CARDS)).toThrow(/no Basic/);
    });

    it("can't retreat, ignores Special Conditions, and gives no prize when Knocked Out", () => {
      let s = duel('doll', 'squirtle', { bench: ['charmander'], defenderEnergy: ['water'] });
      expect(applyAction(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] })).toEqual({ ok: false, error: "Clefairy Doll can't retreat" });
      const prizes = s.players.misty!.prizes.length;
      s = endTurn(s, 'ash');
      s = attack(s, 0, undefined, 'misty'); // Bubble knocks it out
      expect(s.players.ash!.active).toBeNull();
      expect(s.players.misty!.prizes).toHaveLength(prizes);
    });

    it('can be discarded during your turn', () => {
      const s = duel('charmander', 'squirtle', { bench: ['doll'] });
      const after = act(s, 'ash', { type: 'DISCARD_DOLL', target: 0 });
      expect(after.players.ash!.bench[0]).toBeNull();
      expect(names(after, after.players.ash!.discard)).toEqual(['Clefairy Doll']);
    });
  });

  it('Double Colorless Energy provides 2 Colorless energy', () => {
    const s = duel('charmeleon', 'squirtle', { energy: ['dce', 'fire'] });
    expect(energyPool(s.players.ash!.active!, s.cards)).toEqual(['colorless', 'colorless', 'fire']);
    expect(attack(s, 0).players.misty!.active!.damage).toBe(30); // Slash: C C C
  });

  it("can't be played on the opponent's turn", () => {
    const s = table();
    const [bill] = give(s, 'misty', 'bill');
    expect(tryPlay(s, bill!, undefined, 'misty')).toEqual({ ok: false, error: 'Not your turn' });
  });

});
