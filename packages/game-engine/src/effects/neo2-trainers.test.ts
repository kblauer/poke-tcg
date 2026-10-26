import { describe, expect, it } from 'vitest';
import { applyAction, type GameState, type TrainerChoices } from '../index.js';
import { act, duel, flips, give, id, pokemon } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const play = (s: GameState, name: string, choices: TrainerChoices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
const deckCard = (s: GameState, name: string) => {
  const card = { uid: `${name}-deck-${ash(s).deck.length}`, defId: id(name) };
  ash(s).deck.unshift(card);
  return card.uid;
};

describe('Neo Discovery Trainers', () => {
  it('Fossil Egg: heads, a card that evolves from Mysterious Fossil from the deck onto the Bench', () => {
    let s = duel('charmander', 'squirtle');
    const kabuto = deckCard(s, 'kabutoNeo');
    deckCard(s, 'omanyteNeo');
    s = play(flips(s, true), 'fossilEgg');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: kabuto });
    expect(ash(s).bench[0]!.card.uid).toBe(kabuto);
  });

  it('Fossil Egg: or one from the hand, chosen before the flip', () => {
    let s = duel('charmander', 'squirtle');
    const [omanyte] = give(s, 'ash', 'omanyteNeo');
    s = play(flips(s, true), 'fossilEgg', { pick: 1 });
    expect([ash(s).bench[0]!.card.uid, s.pendingChoice]).toEqual([omanyte, undefined]);
  });

  it("Fossil Egg: tails does nothing; it can't be played with a full Bench", () => {
    const s = duel('charmander', 'squirtle', { bench: ['charmander', 'charmander', 'charmander', 'charmander', 'charmander'] });
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'fossilEgg')[0]! })).toEqual({ ok: false, error: 'Your Bench is full' });
    const tails = play(flips(duel('charmander', 'squirtle'), false), 'fossilEgg');
    expect([ash(tails).bench[0], tails.pendingChoice]).toEqual([null, undefined]);
  });

  it("Hyper Devolution Spray: the top Evolution card goes back to the hand, and the Pokémon can't evolve again this turn", () => {
    let s = duel('charmander', 'squirtle');
    const charmeleon = { uid: 'charmeleon-1', defId: id('charmeleon') };
    ash(s).active = { ...pokemon('charmander'), evolvedFrom: [ash(s).active!.card], card: charmeleon, damage: 30 };
    ash(s).active!.condition = 'confused';
    s = play(s, 'hyperDevolutionSpray', { target: 'active' });
    expect([ash(s).active!.card.defId, ash(s).active!.damage, ash(s).active!.condition, ash(s).hand.some((c) => c.uid === 'charmeleon-1')]).toEqual([id('charmander'), 30, null, true]);
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: 'charmeleon-1', target: 'active' })).toMatchObject({ ok: false });
  });

  it('Ruin Wall: an Unown from the deck onto the Bench', () => {
    let s = duel('charmander', 'squirtle');
    const unown = deckCard(s, 'unownA');
    deckCard(s, 'unownO');
    s = play(s, 'ruinWall');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: unown });
    expect(ash(s).bench[0]!.card.uid).toBe(unown);
  });

  it('Energy Ark: a basic Energy card from the deck for each heads', () => {
    const s = duel('charmander', 'squirtle');
    deckCard(s, 'fire');
    deckCard(s, 'water');
    expect(play(flips(s, true, true), 'energyArk').pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'basicEnergy', count: 2 });
    expect(play(flips(s, false, false), 'energyArk').pendingChoice).toBeUndefined();
  });
});
