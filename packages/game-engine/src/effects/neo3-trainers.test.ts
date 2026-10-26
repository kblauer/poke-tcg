import { describe, expect, it } from 'vitest';
import { applyAction, inPlayDef, type GameState } from '../index.js';
import { act, duel, flips, give, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const card = (name: string, n = 0) => ({ uid: `${name}-card-${n}`, defId: id(name) });

describe('Neo Revelation Trainers', () => {
  it('Balloon Berry: its Pokémon retreats for free, and Balloon Berry is discarded instead of Energy', () => {
    const start = duel('charmander', 'machoke', { energy: ['fire'], bench: ['squirtle'] });
    const [berry] = give(start, 'ash', 'balloonBerry');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: berry!, choices: { target: 'active' } });
    s = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] });
    expect([ash(s).active!.card.defId, ash(s).bench[0]!.energy.length, ash(s).bench[0]!.attached?.length]).toEqual([id('squirtle'), 1, 0]);
    expect(ash(s).discard.some((c) => c.defId === id('balloonBerry'))).toBe(true);
  });

  it('Healing Field: once a turn, heads removes 2 damage counters from the Active Pokémon', () => {
    const start = duel('charmander', 'machoke');
    ash(start).active!.damage = 30;
    const [field] = give(start, 'ash', 'healingField');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: field! });
    s = act(flips(s, true), 'ash', { type: 'USE_STADIUM' });
    expect(ash(s).active!.damage).toBe(10);
    expect(applyAction(s, 'ash', { type: 'USE_STADIUM' }).ok).toBe(false);
  });

  it("Healing Field: can't be used without damage counters on the Active Pokémon", () => {
    const start = duel('charmander', 'machoke');
    const [field] = give(start, 'ash', 'healingField');
    const s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: field! });
    expect(applyAction(s, 'ash', { type: 'USE_STADIUM' }).ok).toBe(false);
  });

  it("Rocket's Hideout: 20 more HP for each Pokémon with Dark in its name; gone with the Stadium", () => {
    const start = duel('darkGyarados', 'machoke');
    const [hideout] = give(start, 'ash', 'rocketsHideout');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: hideout! });
    expect([inPlayDef(s.cards, ash(s).active!).hp, inPlayDef(s.cards, s.players.misty!.active!).hp]).toEqual([90, 80]);
    // 80 damage: it stays in play while the Stadium does, and is Knocked Out once another Stadium replaces it.
    ash(s).active!.damage = 80;
    ash(s).bench[0] = { card: card('charmander', 1), evolvedFrom: [], damage: 0, energy: [], playedTurn: 0 };
    const [field] = give(s, 'ash', 'healingField');
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: field! });
    expect(ash(s).discard.some((c) => c.defId === id('darkGyarados'))).toBe(true);
  });

  it('Old Rod: both heads, a Pokémon card from the discard pile into the hand', () => {
    const start = duel('charmander', 'machoke');
    ash(start).discard.push(card('squirtle', 1), card('charmander', 1), card('potion', 1));
    const [rod] = give(start, 'ash', 'oldRod');
    let s = act(flips(start, true, true), 'ash', { type: 'PLAY_TRAINER', cardUid: rod! });
    expect(s.pendingChoice).toMatchObject({ kind: 'discardToHand' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'squirtle-card-1' });
    expect(ash(s).hand.some((c) => c.uid === 'squirtle-card-1')).toBe(true);
  });

  it('Old Rod: both tails, a Trainer card, but not the Old Rod being played', () => {
    const start = duel('charmander', 'machoke');
    ash(start).discard.push(card('potion', 1), card('bill', 1));
    const [rod] = give(start, 'ash', 'oldRod');
    let s = act(flips(start, false, false), 'ash', { type: 'PLAY_TRAINER', cardUid: rod! });
    expect(applyAction(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: rod! }).ok).toBe(false);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'potion-card-1' });
    expect(ash(s).hand.some((c) => c.uid === 'potion-card-1')).toBe(true);
  });

  it('Pokémon Breeder Fields: heads takes any later-Stage card of the chosen Pokémon\'s line from the deck', () => {
    const start = duel('charmander', 'machoke', { bench: ['squirtle'] });
    ash(start).deck.unshift(card('charizard', 1), card('charmeleon', 1));
    const [fields] = give(start, 'ash', 'breederFields');
    let s = act(flips(start, true), 'ash', { type: 'PLAY_TRAINER', cardUid: fields!, choices: { pick: 0, target: 'active' } });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'named', name: expect.arrayContaining(['Charmeleon', 'Charizard']) });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'charizard-card-1' });
    expect(ash(s).hand.some((c) => c.uid === 'charizard-card-1')).toBe(true);
  });

  it('Pokémon Breeder Fields: 2 Pokémon, a flip and a search each', () => {
    const start = duel('charmander', 'machoke', { bench: ['charmander'] });
    ash(start).deck.unshift(card('charmeleon', 1), card('charmeleon', 2), card('charizard', 1));
    const [fields] = give(start, 'ash', 'breederFields');
    let s = act(flips(start, true, true), 'ash', { type: 'PLAY_TRAINER', cardUid: fields!, choices: { pick: 1, target: 'active', target2: 0 } });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'charmeleon-card-1' });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'named' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'charmeleon-card-2' });
    expect(ash(s).hand.filter((c) => c.defId === id('charmeleon')).length).toBe(2);
  });

  it('Old Rod: one heads and one tails does nothing', () => {
    const start = duel('charmander', 'machoke');
    ash(start).discard.push(card('potion', 1));
    const [rod] = give(start, 'ash', 'oldRod');
    const s = act(flips(start, true, false), 'ash', { type: 'PLAY_TRAINER', cardUid: rod! });
    expect(s.pendingChoice).toBeUndefined();
  });
});
