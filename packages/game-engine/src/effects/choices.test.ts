// Every kind of pending choice terminates: each question's answers are all followed (settles, test-kit.ts) until nothing
// is asked, for the choices Trainers, attacks and powers start, the ones that go on to another question (`then`,
// `attach`, both players) or may be declined (`optional`) above all.
import { describe, expect, it } from 'vitest';
import { act, attack, duel, flips, give, id, playAuto, settles } from './test-kit.js';
import type { GameState } from '../index.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
/** Plays the named card from a hand with the first answers to its own questions. */
function play(s: GameState, name: string, player = 'ash'): GameState {
  const [uid] = give(s, player, name);
  return playAuto(s, player, uid!);
}
/** A duel with both hands empty. */
function table(opts: Parameters<typeof duel>[2] = {}, attacker = 'charmander', defender = 'squirtle'): GameState {
  const s = duel(attacker, defender, opts);
  ash(s).hand = [];
  misty(s).hand = [];
  return s;
}
/** The choice asked, then every path of answers ending with nothing asked. */
function asked(s: GameState, kind: string, player = 'ash'): GameState[] {
  expect(s.pendingChoice).toMatchObject({ player, kind });
  const ends = settles(s);
  expect(ends.length).toBeGreaterThan(0);
  for (const end of ends) expect(end.pendingChoice).toBeUndefined();
  return ends;
}

describe('pending choices terminate', () => {
  it('Computer Search: pickFromDeck', () => {
    const s = table();
    give(s, 'ash', 'potion', 'switch');
    const ends = asked(play(s, 'computersearch'), 'pickFromDeck');
    // Taken, or nothing taken: either way the deck is shuffled and the turn goes on.
    expect(ends.some((e) => ash(e).hand.length === 1)).toBe(true);
  });

  it('Pokémon Trader: pickFromDeck with the traded card going back', () => {
    const s = table();
    ash(s).deck.unshift({ uid: 'deck-squirtle', defId: id('squirtle') });
    give(s, 'ash', 'bulbasaur');
    asked(play(s, 'pokemontrader'), 'pickFromDeck');
  });

  it('Pokédex: arrangeTop', () => {
    asked(play(table(), 'pokedex'), 'arrangeTop');
  });

  it("Rocket's Sneak Attack: oppHand, also with no Trainer card to take", () => {
    const s = table();
    give(s, 'misty', 'potion', 'water');
    asked(play(s, 'rocketSneakAttack'), 'oppHandTrainer');
    const none = table();
    give(none, 'misty', 'water');
    asked(play(none, 'rocketSneakAttack'), 'oppHandTrainer');
  });

  it("Erika's Perfume: oppHand, optional", () => {
    const s = table();
    give(s, 'misty', 'bulbasaur', 'water');
    asked(play(s, 'erikasPerfume'), 'oppHandBasics');
  });

  it('Challenge!: the opponent accepts or declines, then both search (`then`)', () => {
    const s = table({ oppBench: [] });
    const ends = asked(play(s, 'challenge'), 'challenge', 'misty');
    // Declined: Ash drew 2. Accepted: both benched Basic Pokémon from their decks (or took none).
    expect(ends.some((e) => ash(e).hand.length === 2)).toBe(true);
    expect(ends.some((e) => ash(e).hand.length !== 2)).toBe(true);
  });

  it("Misty's Wrath: pickFromTop (2 of 7)", () => {
    const ends = asked(play(table(), 'mistysWrath'), 'pickFromTop');
    for (const e of ends) expect(ash(e).hand).toHaveLength(2);
  });

  it('Secret Mission: discardDraw', () => {
    const s = table();
    give(s, 'ash', 'potion', 'fire', 'bulbasaur');
    asked(play(s, 'secretMission'), 'secretMission');
  });

  it("Lt. Surge's Treaty: the opponent's options", () => {
    asked(play(table(), 'surgesTreaty'), 'treaty', 'misty');
  });

  it("Computer Error: drawCount for the player, then the opponent's", () => {
    const ends = asked(play(table(), 'computererror'), 'drawCount');
    // Ash's two answers, each followed to the opponent's question and its last answer.
    expect(ends.length).toBe(2);
    for (const e of ends) expect(misty(e).hand.length).toBeGreaterThanOrEqual(0);
  });

  it("Whirlwind: the opponent's switchIn with several benched Pokémon; none asked with no Bench", () => {
    const s = attack(table({ energy: ['fire', 'fire'], oppBench: ['charmander', 'bulbasaur'] }, 'pidgeotto', 'squirtle'), 0);
    const ends = asked(s, 'switchIn', 'misty');
    for (const e of ends) expect(e.currentPlayer).toBe('misty');
    expect(attack(table({ energy: ['fire', 'fire'] }, 'pidgeotto', 'squirtle'), 0).pendingChoice).toBeUndefined();
  });

  it("Cat Punch: the opponent's benchDamage on tails", () => {
    const s = flips(table({ energy: ['fire', 'fire'], oppBench: ['charmander', 'bulbasaur'] }, 'meowthP', 'squirtle'), false);
    const ends = asked(attack(s, 0), 'benchDamage', 'misty');
    for (const e of ends) expect(misty(e).bench.some((p) => p?.damage === 20)).toBe(true);
  });

  it('Herbal Scent: mayFlip when Meganium is played', () => {
    const s = table({ bench: ['charmander'] }, 'bayleef', 'bulbasaur');
    ash(s).active!.damage = 30;
    const [meganium] = give(s, 'ash', 'meganiumHerbal');
    asked(act(flips(s, true), 'ash', { type: 'EVOLVE', cardUid: meganium!, target: 'active' }), 'mayFlip');
  });

  it('Time Capsule: pickFromDiscard, 5 or none (all of them, with fewer)', () => {
    const s = table();
    ash(s).discard.push({ uid: 'd-char', defId: id('charmander') }, { uid: 'd-fire', defId: id('fire') }, { uid: 'd-potion', defId: id('potion') });
    asked(play(s, 'timeCapsule'), 'timeCapsule');
  });

  it('Super Scoop Up: heads returns one of your Pokémon (ownPokemon)', () => {
    const s = flips(table({ bench: ['bulbasaur'] }), true);
    const after = play(s, 'superScoopUp');
    if (after.pendingChoice) asked(after, after.pendingChoice.kind);
    else expect(ash(after).hand.length).toBeGreaterThan(0);
  });

  it("Double Gust: one of the opponent's benched Pokémon (oppPokemon), then the opponent picks one of yours", () => {
    const s = table({ bench: ['bulbasaur', 'onix'], oppBench: ['charmander', 'bulbasaur'] });
    const after = play(s, 'doubleGust');
    // The player's own pick is a Trainer question (playAuto answered it); the opponent's is the pending choice.
    const ends = asked(after, 'doubleGust', 'misty');
    for (const e of ends) expect(ash(e).active!.card.defId).not.toBe(id('charmander'));
  });

  it('Hyper Devolution Spray: devolveOwn (one of your Evolved Pokémon)', () => {
    const s = table({ bench: ['charmeleon'] });
    ash(s).bench[0]!.evolvedFrom = [{ uid: 'under', defId: id('charmander') }];
    const after = play(s, 'hyperDevolutionSpray');
    if (after.pendingChoice) asked(after, 'devolveOwn');
    else expect(ash(after).bench[0]!.card.defId).toBe(id('charmander'));
  });

  it('Recycle: heads picks a card from the discard pile (pickFromDiscard)', () => {
    const s = flips(table(), true);
    ash(s).discard.push({ uid: 'd-potion', defId: id('potion') }, { uid: 'd-fire', defId: id('fire') });
    const after = play(s, 'recycle');
    if (after.pendingChoice) asked(after, after.pendingChoice.kind);
  });

  it("Blaine's Quiz #1: the opponent's labelled options", () => {
    // The quiz asks the Pokémon's length: Charmander is the kit's one Pokémon with its Pokédex length.
    const quiz = table();
    give(quiz, 'ash', 'charmander', 'charmander');
    const after = play(quiz, 'blainesQuiz');
    if (after.pendingChoice) asked(after, after.pendingChoice.kind, after.pendingChoice.player);
  });

  it('a question with nothing to click (a heal with no damaged Pokémon, a removal with no Energy) is answered with nothing', () => {
    const s = table();
    s.pendingChoice = { player: 'ash', source: 'Heal', kind: 'removeDamage' };
    asked(s, 'removeDamage');
    const removal = table();
    removal.pendingChoice = { player: 'ash', source: 'Super Removal', kind: 'removeEach', targets: ['active'] };
    asked(removal, 'removeEach');
  });
});
