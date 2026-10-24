import { describe, expect, it } from 'vitest';
import { applyAction, energyPool, retreatCost, type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (name: string, n = 0) => ({ uid: `${name}-card-${n}`, defId: id(name) });

describe('Neo Destiny Pokémon Powers', () => {
  it("Conductivity: 10 damage to a Pokémon the opponent attaches an Energy card to from their hand", () => {
    const start = duel('charmander', 'darkAmpharos');
    const [fire] = give(start, 'ash', 'fire');
    const s = act(start, 'ash', { type: 'ATTACH_ENERGY', cardUid: fire!, target: 'active' });
    expect(ash(s).active!.damage).toBe(10);
  });

  it('Conductivity: stops working with more than 1 Dark Ampharos in play', () => {
    const start = duel('charmander', 'darkAmpharos', { oppBench: ['darkAmpharos'] });
    const [fire] = give(start, 'ash', 'fire');
    const s = act(start, 'ash', { type: 'ATTACH_ENERGY', cardUid: fire!, target: 'active' });
    expect(ash(s).active!.damage).toBe(0);
  });

  it("Surprise Bite: evolving into Dark Crobat, 20 damage to the chosen Pokémon, without Weakness", () => {
    const start = duel('charmander', 'machoke', { bench: ['darkGolbat'] });
    const [crobat] = give(start, 'ash', 'darkCrobat');
    let s = act(start, 'ash', { type: 'EVOLVE', cardUid: crobat!, target: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'powerDamage', noWeakness: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(misty(s).active!.damage).toBe(20);
  });

  it("Scare: the opponent's Baby Pokémon can't attack while Dark Feraligatr is the Active Pokémon", () => {
    const s = duel('smoochum', 'darkFeraligatr', { energy: ['psychic'] });
    expect(tryAttack(s, 0).ok).toBe(false);
  });

  it('Deep Sleep: an Asleep Pokémon needs 2 heads to wake up', () => {
    const start = duel('charmander', 'machoke', { bench: ['darkGengar'] });
    misty(start).active!.condition = 'asleep';
    const s = endTurn(flips(start, true, false), 'ash');
    expect(misty(s).active!.condition).toBe('asleep');
  });

  it('Spatial Distortion: heads puts a Stadium card from the discard pile into play', () => {
    const start = duel('charmander', 'machoke', { bench: ['darkPorygon2'] });
    ash(start).discard.push(card('healingField', 1));
    let s = act(flips(start, true), 'ash', { type: 'USE_POWER', source: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'healingField-card-1' });
    expect(s.stadium?.card.uid).toBe('healingField-card-1');
  });

  it('Drive Off: the opponent switches in their only Benched Pokémon', () => {
    const s = act(duel('lightArcanine', 'machoke', { oppBench: ['charmander'] }), 'ash', { type: 'USE_POWER', source: 'active' });
    expect(misty(s).active!.card.defId).toBe(id('charmander'));
  });

  it('Drive Off: only as the Active Pokémon', () => {
    expect(applyAction(duel('charmander', 'machoke', { bench: ['lightArcanine'], oppBench: ['charmander'] }), 'ash', { type: 'USE_POWER', source: 0 }).ok).toBe(false);
  });

  it('Miraculous Wind: Special Energy provides Colorless only, and Darkness Energy does nothing more', () => {
    let s = duel('houndourDark', 'lightDragonite', { energy: ['darkness', 'rainbow'] });
    s = act(s, 'ash', { type: 'END_TURN' });
    s = act(s, 'misty', { type: 'END_TURN' });
    expect(energyPool(ash(s).active!, s.cards)).toEqual(['colorless', 'colorless']);
    s = attack(s, 1);
    expect(misty(s).active!.damage).toBe(20);
  });

  it('Gift: playing Light Togetic, the opponent and then its player may take a Pokémon Tool card from the deck', () => {
    const start = duel('charmander', 'machoke', { bench: ['togepiNeo4'] });
    misty(start).deck.unshift(card('focusBand', 1));
    ash(start).deck.unshift(card('focusBand', 2));
    const [togetic] = give(start, 'ash', 'lightTogetic');
    let s = act(start, 'ash', { type: 'EVOLVE', cardUid: togetic!, target: 0 });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', filter: 'tool' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'focusBand-card-1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'focusBand-card-2' });
    expect([misty(s).hand.some((c) => c.uid === 'focusBand-card-1'), ash(s).hand.some((c) => c.uid === 'focusBand-card-2')]).toEqual([true, true]);
  });

  it('Hot Plate: 10 damage to a Basic Pokémon put onto the Bench from the hand', () => {
    const start = duel('charmander', 'darkMagcargo');
    const [squirtle] = give(start, 'ash', 'squirtle');
    const s = act(start, 'ash', { type: 'PLAY_BENCH', cardUid: squirtle!, slot: 0 });
    expect(ash(s).bench[0]!.damage).toBe(10);
  });

  it("Cunning: heads, a look at the top of the opponent's deck, then they may be made to shuffle it", () => {
    let s = act(flips(duel('darkSlowking', 'machoke'), true), 'ash', { type: 'USE_POWER', source: 'active' });
    expect([s.peek?.player, s.pendingChoice?.kind]).toEqual(['ash', 'cunning']);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 1 });
    expect(s.pendingChoice).toBeUndefined();
  });

  it('Tag Team: evolving a benched Light Machoke heals the Active Pokémon 30 and switches Light Machamp in', () => {
    const start = duel('charmander', 'machoke', { bench: ['lightMachoke'] });
    ash(start).active!.damage = 40;
    const [machamp] = give(start, 'ash', 'lightMachamp');
    const s = act(start, 'ash', { type: 'EVOLVE', cardUid: machamp!, target: 0 });
    expect([ash(s).active!.card.defId, ash(s).bench[0]!.damage]).toEqual([id('lightMachamp'), 10]);
  });

  it("Fluffy Wool: heads puts the attacker to sleep when it damages the Active Light Piloswine", () => {
    let s = endTurn(duel('lightPiloswine', 'machoke', { defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 'ash');
    // Fluffy Wool's heads, then tails for Machoke's Asleep check between the turns.
    s = attack(flips(s, true, false), 0, {}, 'misty');
    expect(misty(s).active!.condition).toBe('asleep');
  });

  it("Fluffy Wool's Asleep is kept off by a run's conditionGuard rule, like any Special Condition (afflictionBlocked)", () => {
    let s = endTurn(duel('lightPiloswine', 'machoke', { defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 'ash');
    s.rules = [{ kind: 'conditionGuard', player: 'misty', conditions: ['asleep'], label: 'Awakening' }];
    s = attack(flips(s, true), 0, {}, 'misty');
    expect(misty(s).active!.condition ?? null).toBeNull();
    expect(s.log?.some((l) => l.text.includes('Awakening protected'))).toBe(true);
  });

  it('[Help]: with Unown H, E, L and P on the Bench, a new hand of as many cards', () => {
    const start = duel('charmander', 'machoke', { bench: ['unownH', 'unownE', 'unownL', 'unownP'] });
    const n = ash(start).hand.length;
    const s = act(start, 'ash', { type: 'USE_POWER', source: 0 });
    expect(ash(s).hand.length).toBe(n);
    expect(applyAction(duel('charmander', 'machoke', { bench: ['unownH', 'unownE'] }), 'ash', { type: 'USE_POWER', source: 0 }).ok).toBe(false);
  });

  it("[Chase]: heads puts a damage counter (with Weakness) on the opponent's Active Pokémon that retreats", () => {
    let s = endTurn(duel('unownC', 'machoke', { defenderEnergy: ['fighting'], oppBench: ['charmander'] }), 'ash');
    s = act(flips(s, true), 'misty', { type: 'RETREAT', slot: 0, energyUids: [misty(s).active!.energy[0]!.uid] });
    expect(misty(s).bench[0]!.damage).toBe(10);
  });

  it('[Quicken]: heads, attacks do nothing to the Unown next turn; once a turn', () => {
    let s = act(flips(duel('unownQ', 'machoke', { defenderEnergy: ['fighting', 'fighting', 'fighting'], bench: ['unownC'] }), true), 'ash', { type: 'USE_POWER', source: 'active' });
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active' }).ok).toBe(false);
    s = endTurn(s, 'ash');
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(0);
  });

  it('[Zoom]: an Unown retreats for free while Unown Z is benched', () => {
    const s = duel('unownC', 'machoke', { bench: ['unownZ'] });
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(0);
  });

  it('[Search]: looks at one of the Prize cards', () => {
    const s = act(duel('unownS', 'machoke'), 'ash', { type: 'USE_POWER', source: 'active', choices: { prize: 2 } });
    expect(s.peek).toMatchObject({ player: 'ash', label: 'Prize 3' });
  });

  it("[Tell]: heads, each player sees the other's hand", () => {
    let s = act(flips(duel('unownT', 'machoke'), true), 'ash', { type: 'USE_POWER', source: 'active' });
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'lookOppHand' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'lookOppHand' });
  });

  it('[Vanish]: played from the hand, heads returns another Unown to the hand and discards its cards', () => {
    const start = duel('charmander', 'machoke', { bench: ['unownC'] });
    ash(start).bench[0]!.energy.push(card('psychic', 1));
    const [v] = give(start, 'ash', 'unownV');
    let s = act(start, 'ash', { type: 'PLAY_BENCH', cardUid: v!, slot: 1 });
    s = act(flips(s, true), 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).bench[0], ash(s).discard.some((c) => c.uid === 'psychic-card-1')]).toEqual([null, true]);
  });
});
