import { describe, expect, it } from 'vitest';
import { applyAction, energyPool, retreatCost, type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (name: string, n = 0) => ({ uid: `${name}-card-${n}`, defId: id(name) });

describe('Neo Destiny Trainers and Miracle Energy', () => {
  it('Broken Ground Gym: Basic Pokémon cost 1 more to retreat', () => {
    const start = duel('charmander', 'machoke');
    const [gym] = give(start, 'ash', 'brokenGroundGym');
    const s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: gym! });
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)], s.stadium?.card)).toBe(2);
  });

  it("EXP.ALL: as the Active Pokémon is Knocked Out, a basic Energy card goes to the Pokémon with EXP.ALL", () => {
    let s = endTurn(duel('charmander', 'machoke', { energy: ['fire'], defenderEnergy: ['fighting', 'fighting', 'fighting'], bench: ['squirtle'] }), 'ash');
    ash(s).bench[0]!.attached = [{ card: card('expAll', 1), until: Number.MAX_SAFE_INTEGER, tool: true }];
    s = attack(s, 0, {}, 'misty');
    expect([ash(s).bench[0]!.energy.length, ash(s).bench[0]!.attached?.length]).toEqual([1, 0]);
  });

  it("Impostor Professor Oak's Invention: the opponent's Prize cards are shuffled into their deck for new ones", () => {
    const start = duel('charmander', 'machoke');
    const before = misty(start).prizes.map((c) => c.uid);
    const [invention] = give(start, 'ash', 'invention');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: invention! });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(misty(s).prizes.length).toBe(6);
    expect(misty(s).prizes.map((c) => c.uid)).not.toEqual(before);
  });

  it('Radio Tower: a look at the top 2 cards of the deck', () => {
    const start = duel('charmander', 'machoke');
    const [tower] = give(start, 'ash', 'radioTower');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: tower! });
    s = act(s, 'ash', { type: 'USE_STADIUM' });
    expect(s.pendingChoice).toMatchObject({ kind: 'lookOppDeck', own: true, count: 2 });
  });

  it("Thought Wave Machine: heads return the opponent's Active Pokémon's Energy cards to their hand, then the turn ends", () => {
    const start = duel('charmander', 'machoke', { defenderEnergy: ['fighting', 'fighting'] });
    const [machine] = give(start, 'ash', 'thoughtWave');
    const s = act(flips(start, true, false), 'ash', { type: 'PLAY_TRAINER', cardUid: machine! });
    expect([misty(s).active!.energy.length, s.currentPlayer]).toEqual([1, 'misty']);
  });

  it("Counterattack Claws: heads puts 2 damage counters on the attacker; then it's discarded", () => {
    let s = endTurn(duel('charmander', 'machoke', { defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 'ash');
    ash(s).active!.attached = [{ card: card('counterClaws', 1), until: Number.MAX_SAFE_INTEGER, tool: true }];
    s = attack(flips(s, true), 0, {}, 'misty');
    expect([misty(s).active!.damage, ash(s).discard.some((c) => c.uid === 'counterClaws-card-1')]).toEqual([20, true]);
  });

  it('Energy Amplifier: an Energy card into the deck; heads takes up to 3 basic Energy cards', () => {
    const start = duel('charmander', 'machoke');
    const [amp, fire] = give(start, 'ash', 'energyAmplifier', 'fire');
    // The shuffle comes before the flip: a lucky flip instead of a seed.
    start.rules = [{ kind: 'luckyFlips', player: 'ash', flips: 1 }];
    const s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: amp!, choices: { handUids: [fire!] } });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'basicEnergy', count: 3 });
  });

  it('Energy Stadium: heads puts a basic Energy card from the discard pile into the hand', () => {
    const start = duel('charmander', 'machoke');
    ash(start).discard.push(card('water', 1));
    const [stadium] = give(start, 'ash', 'energyStadium');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: stadium! });
    s = act(flips(s, true), 'ash', { type: 'USE_STADIUM' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'water-card-1' });
    expect(ash(s).hand.some((c) => c.uid === 'water-card-1')).toBe(true);
  });

  it("Magnifier: its Pokémon's attack doesn't apply Resistance this turn", () => {
    // Cool Porygon resists Psychic: Psyburn does 40, not 10.
    const start = duel('mewtwoP', 'porygonP', { energy: ['psychic', 'psychic', 'psychic'] });
    const [magnifier] = give(start, 'ash', 'magnifier');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: magnifier!, choices: { target: 'active' } });
    s = attack(s, 1);
    expect(misty(s).active!.damage).toBe(40);
  });

  it('Pokémon Personality Test: the opponent guesses; wrong, the player draws 3', () => {
    const start = duel('charmander', 'machoke');
    const [test, evo] = give(start, 'ash', 'personalityTest', 'lightMachamp');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: test!, choices: { handUids: [evo!] } });
    const hand = ash(s).hand.length;
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 1 });
    expect(ash(s).hand.length).toBe(hand + 3);
    expect(ash(s).hand.some((c) => c.uid === evo)).toBe(true);
  });

  it("Team Rocket's Evil Deeds: a card from the opponent's hand into their deck; then they may draw up to 2", () => {
    const start = duel('charmander', 'machoke');
    const [deeds] = give(start, 'ash', 'evilDeeds');
    let s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: deeds! });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: misty(s).hand[0]!.uid });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'drawCount', max: 2 });
  });

  it('Heal Powder: heads cures the Active Pokémon and removes 2 damage counters', () => {
    const start = duel('charmander', 'machoke');
    ash(start).active!.damage = 30;
    ash(start).active!.poison = 10;
    const [powder] = give(start, 'ash', 'healPowder');
    const s = act(flips(start, true), 'ash', { type: 'PLAY_TRAINER', cardUid: powder! });
    expect([ash(s).active!.damage, ash(s).active!.poison]).toEqual([10, 0]);
  });

  it('Mail from Bill: only with 4 or fewer cards in the hand; draws until there are 4', () => {
    const start = duel('charmander', 'machoke');
    ash(start).hand = [];
    const [mail] = give(start, 'ash', 'mailFromBill');
    const s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: mail! });
    expect(ash(s).hand.length).toBe(4);
    const full = duel('charmander', 'machoke');
    const [mail2] = give(full, 'ash', 'mailFromBill');
    expect(applyAction(full, 'ash', { type: 'PLAY_TRAINER', cardUid: mail2! }).ok).toBe(false);
  });

  it('Miracle Energy: only on Shining and Light Pokémon; every type, 2 Energy; discarded at the end of the turn', () => {
    const start = duel('charmander', 'machoke', { bench: ['lightMachoke'] });
    const [miracle] = give(start, 'ash', 'miracleEnergy');
    expect(applyAction(start, 'ash', { type: 'ATTACH_ENERGY', cardUid: miracle!, target: 'active' }).ok).toBe(false);
    let s = act(start, 'ash', { type: 'ATTACH_ENERGY', cardUid: miracle!, target: 0 });
    expect(energyPool(ash(s).bench[0]!, s.cards)).toEqual(['any', 'any']);
    s = endTurn(s, 'ash');
    expect(ash(s).bench[0]!.energy.length).toBe(0);
  });
});
