import { describe, expect, it } from 'vitest';
import { type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
/** Puts a card (by short name) on top of the player's deck. */
const onDeck = (s: GameState, player: string, ...names: string[]) => s.players[player]!.deck.unshift(...names.map((n, i) => ({ uid: `deck-${n}-${i}`, defId: id(n) })));
const card = (name: string, n = 0) => ({ uid: `${name}-card-${n}`, defId: id(name) });

describe('Neo Revelation attacks', () => {
  it("Genetic Memory: uses an attack of a card Kingdra evolved from, with its effect but not its cost", () => {
    const start = duel('kingdra', 'machoke', { energy: ['water'] });
    ash(start).active!.evolvedFrom = [card('horsea'), card('seadra')];
    const s = attack(start, 0, { amount: 0 });
    expect(misty(s).active!.damage).toBe(10);
    expect(misty(s).active!.effects?.smokescreen).toBeDefined();
  });

  it('Night Eyes, then Perish Song on the next turn: the Defending Pokémon, still Asleep, is Knocked Out', () => {
    // Misty's Asleep flips between the turns: tails both times.
    let s = attack(flips(duel('misdreavusNeo3', 'machoke', { energy: ['psychic', 'psychic', 'psychic'], oppBench: ['charmander'] }), false), 0);
    expect(misty(s).active!.condition).toBe('asleep');
    s = endTurn(flips(s, false), 'misty');
    s = attack(s, 1);
    expect(misty(s).discard.some((c) => c.defId === id('machoke'))).toBe(true);
  });

  it('Perish Song: nothing without Night Eyes last turn', () => {
    const start = duel('misdreavusNeo3', 'machoke', { energy: ['psychic', 'psychic', 'psychic'] });
    misty(start).active!.condition = 'asleep';
    const s = attack(start, 1);
    expect(misty(s).active!.damage).toBe(0);
  });

  it('Triggered Poison: an Energy card its player attaches to the Defending Pokémon next turn Poisons it', () => {
    let s = attack(duel('crobat', 'machoke', { energy: ['grass'] }), 0);
    expect(misty(s).active!.poison ?? 0).toBe(0);
    const [fire] = give(s, 'misty', 'fire');
    s = act(s, 'misty', { type: 'ATTACH_ENERGY', cardUid: fire!, target: 'active' });
    expect(misty(s).active!.poison).toBe(10);
  });

  it('Present: exactly 1 heads does 40; all tails removes every damage counter from the Defending Pokémon', () => {
    const one = attack(flips(duel('delibird', 'machoke', { energy: ['fire', 'fire'] }), true, false, false), 0);
    expect(misty(one).active!.damage).toBe(40);
    const start = duel('delibird', 'machoke', { energy: ['fire', 'fire'] });
    misty(start).active!.damage = 50;
    const none = attack(flips(start, false, false, false), 0);
    expect(misty(none).active!.damage).toBe(0);
  });

  it('Twister: one heads does 50 and discards an Energy card from the Defending Pokémon; both tails does nothing', () => {
    const energy = { energy: ['water', 'water', 'water', 'water'], defenderEnergy: ['fighting', 'fighting'] };
    const one = attack(flips(duel('kingdra', 'machoke', energy), true, false), 1);
    expect([misty(one).active!.damage, misty(one).active!.energy.length]).toEqual([50, 1]);
    const none = attack(flips(duel('kingdra', 'machoke', energy), false, false), 1);
    expect([misty(none).active!.damage, misty(none).active!.energy.length]).toEqual([0, 2]);
  });

  it('Twister: with a choice of Energy cards, they are chosen after the attack', () => {
    const s = attack(flips(duel('kingdra', 'machoke', { energy: ['water', 'water', 'water', 'water'], defenderEnergy: ['fighting', 'fire', 'water'] }), true, true), 1);
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'removeEach', targets: ['active', 'active'] });
  });

  it('Rainbow Burn: 10 more for each type of basic Energy card attached', () => {
    const s = attack(duel('hoohRainbow', 'machoke', { energy: ['fire', 'water', 'water', 'dce'] }), 0);
    expect(misty(s).active!.damage).toBe(50);
  });

  it("Core Stream: 20 to each of the opponent's Pokémon with Energy of the chosen type", () => {
    const start = duel('starmieNeo3', 'machoke', { energy: ['psychic', 'psychic', 'psychic'], defenderEnergy: ['water'], oppBench: ['charmander', 'charmander'] });
    misty(start).bench[0]!.energy.push(card('fire'));
    const s = attack(start, 1, { type: 'fire' });
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, misty(s).bench[1]!.damage]).toEqual([0, 20, 0]);
  });

  it('Lava Flow: 20 more for each Fire Energy card discarded', () => {
    const start = duel('magcargo', 'snorlax', { energy: ['fire', 'fire', 'fire', 'fire'] });
    const uids = ash(start).active!.energy.slice(0, 2).map((e) => e.uid);
    const s = attack(start, 0, { energyUids: uids });
    expect([misty(s).active!.damage, ash(s).active!.energy.length]).toEqual([80, 2]);
  });

  it("High-Speed Charge: 30 to Piloswine, and it can't be used on the next turn", () => {
    let s = attack(duel('piloswineNeo3', 'snorlax', { energy: ['fighting', 'fighting', 'fire', 'fire'] }), 1);
    expect([misty(s).active!.damage, ash(s).active!.damage]).toEqual([80, 30]);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 1).ok).toBe(false);
    expect(tryAttack(s, 0).ok).toBe(true);
  });

  it('Leek Jab: not again on the next turn', () => {
    let s = attack(duel('farfetchdNeo3', 'machoke', { energy: ['fire', 'fire', 'fire'] }), 1);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 1).ok).toBe(false);
  });

  it('Terrorize: blocks an attack of a Basic Defending Pokémon only', () => {
    let s = attack(duel('stantler', 'charmander', { energy: ['fire'], defenderEnergy: ['fire'] }), 0, { attackIndex: 0 });
    expect(tryAttack(s, 0, {}, 'misty').ok).toBe(false);
    s = attack(duel('stantler', 'machoke', { energy: ['fire'] }), 0);
    expect(misty(s).active!.effects?.amnesia).toBeUndefined();
  });

  it('Aerowing: "you may flip": heads 80, or no flip for 40', () => {
    const energy = { energy: ['fire', 'fire', 'fire', 'fire'] };
    expect(misty(attack(duel('lugiaNeo3', 'snorlax', energy), 0, { boost: false })).active!.damage).toBe(40);
    expect(misty(attack(flips(duel('lugiaNeo3', 'snorlax', energy), true), 0, { boost: true })).active!.damage).toBe(80);
    expect(misty(attack(flips(duel('lugiaNeo3', 'snorlax', energy), false), 0, { boost: true })).active!.damage).toBe(0);
  });

  it('Lightning Strike: discarding every Lightning Energy card does 80', () => {
    const s = attack(duel('raichuNeo3', 'snorlax', { energy: ['lightning', 'lightning', 'lightning', 'fire'] }), 1, { boost: true });
    expect([misty(s).active!.damage, ash(s).active!.energy.length]).toEqual([80, 1]);
  });

  it('Swipe: heads discards every Trainer card attached to the opponent\'s Pokémon', () => {
    const start = duel('sneasel', 'machoke', { energy: ['fire'], oppBench: ['charmander'] });
    misty(start).active!.attached = [{ card: card('defender'), until: 99 }];
    misty(start).bench[0]!.attached = [{ card: card('focusBand'), until: Number.MAX_SAFE_INTEGER, tool: true }];
    const s = attack(flips(start, true), 0);
    expect([misty(s).active!.attached?.length, misty(s).bench[0]!.attached?.length, misty(s).discard.length]).toEqual([0, 0, 2]);
  });

  it("Grab: a Trainer card attached to the opponent's Pokémon goes into their deck", () => {
    const start = duel('aipomNeo3', 'machoke', { energy: ['fire'], oppBench: ['charmander'] });
    misty(start).bench[0]!.attached = [{ card: card('focusBand'), until: Number.MAX_SAFE_INTEGER, tool: true }];
    const s = attack(start, 0, { oppTarget: 0 });
    // Misty has drawn for her turn since: the Focus Band is in her deck or, just drawn, her hand.
    expect(misty(s).bench[0]!.attached?.length).toBe(0);
    expect([...misty(s).deck, ...misty(s).hand].some((c) => c.defId === id('focusBand'))).toBe(true);
  });

  it('Psykiss: heads shuffles a Special Energy card into its player\'s deck', () => {
    const s = attack(flips(duel('smoochum', 'machoke', { energy: ['fire'], defenderEnergy: ['fighting', 'dce'] }), true), 0, { oppTarget: 'active', oppEnergyUid: undefined });
    // One Special Energy card: no question about which.
    expect(misty(s).active!.energy.map((e) => e.defId)).toEqual([id('fighting')]);
  });

  it('Negative Ion: the Defending Pokémon does 10 less to Chinchou next turn, before Weakness', () => {
    let s = attack(duel('chinchou', 'machoke', { energy: ['water'], defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 1);
    // Karate Chop: 50, less 10 for Machoke's damage counter, less 10 for Negative Ion.
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(30);
  });

  it('Gold Scale: the opponent, then the attacking player, may each draw 2 cards or none', () => {
    let s = attack(duel('shiningMagikarp', 'machoke', { energy: ['water'] }), 0);
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'drawCount', allOrNone: true });
    expect(() => act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 1 })).toThrow();
    const mistyHand = misty(s).hand.length;
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 2 });
    expect(misty(s).hand.length).toBe(mistyHand + 2);
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'drawCount' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(s.currentPlayer).toBe('misty');
  });

  it('Attract Current: each heads attaches a Lightning Energy card from the deck to one of the Lightning Pokémon', () => {
    const start = duel('ampharos', 'machoke', { energy: ['lightning'], bench: ['raikouBurst', 'charmander'] });
    onDeck(start, 'ash', 'lightning', 'lightning');
    let s = attack(flips(start, true, true, false), 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', count: 2, attach: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'deck-lightning-0' });
    expect(s.pendingChoice).toMatchObject({ kind: 'attachCard', only: { type: 'lightning' } });
    // Charmander (bench 1) isn't a Lightning Pokémon.
    expect(() => act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 1 })).toThrow();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'deck-lightning-1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect([ash(s).bench[0]!.energy.length, ash(s).active!.energy.length, s.currentPlayer]).toEqual([1, 2, 'misty']);
  });

  it('Evolutionary Spore: evolves Hoppip and Skiploom with cards from the deck, each once', () => {
    const start = duel('jumpluff', 'machoke', { energy: ['grass'], bench: ['hoppip', 'skiploom'] });
    onDeck(start, 'ash', 'skiploom', 'jumpluff');
    let s = attack(start, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'evolveMany' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'deck-skiploom-0' });
    // Only the Skiploom that was already in play can become Jumpluff now: no question.
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'deck-jumpluff-1' });
    expect([ash(s).bench[0]!.card.defId, ash(s).bench[1]!.card.defId]).toEqual([id('skiploom'), id('jumpluff')]);
    expect(s.currentPlayer).toBe('misty');
  });

  it("Devastate: 10 to each of the opponent's benched Pokémon; heads discards an Energy card from each of their Pokémon", () => {
    const start = duel('shiningGyarados', 'machoke', { energy: ['water', 'water', 'fire', 'fire'], defenderEnergy: ['fighting'], oppBench: ['charmander'] });
    misty(start).bench[0]!.energy.push(card('fire'));
    const s = attack(flips(start, true), 1, { energyUids: ash(start).active!.energy.filter((e) => e.defId === id('fire')).map((e) => e.uid) });
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, misty(s).active!.energy.length, misty(s).bench[0]!.energy.length]).toEqual([50, 10, 0, 0]);
  });

  it('Mega Flame: each tails discards an Energy card from Entei; different cards are chosen after the attack', () => {
    const s = attack(flips(duel('enteiFlame', 'machoke', { energy: ['fire', 'fire', 'fire', 'water'] }), false, true), 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'discardAttached', target: 'active', count: 1 });
  });

  it('Dark Flame: a Darkness Energy card from the discard pile goes to Houndoom', () => {
    const start = duel('houndoomNeo3', 'machoke', { energy: ['fire', 'fire'] });
    ash(start).discard.push(card('darkness'));
    const s = attack(start, 0, { energyUids: [ash(start).active!.energy[0]!.uid] });
    expect(ash(s).active!.energy.map((e) => e.defId)).toEqual([id('fire'), id('darkness')]);
  });

  it('Psychic Damage: a damage counter on the Defending Pokémon for each heads', () => {
    const s = attack(flips(duel('celebiTime', 'machoke', { energy: ['psychic'] }), true, true, false), 0);
    expect(misty(s).active!.damage).toBe(20);
  });

  it('Toxic Saliva: heads Poisons for 20, even if it was already Poisoned', () => {
    const start = duel('shuckle', 'machoke', { energy: ['grass', 'grass'] });
    misty(start).active!.poison = 10;
    const s = attack(flips(start, true), 0);
    // 20 Poison damage between the turns.
    expect([misty(s).active!.poison, misty(s).active!.damage]).toEqual([20, 20]);
  });

  it('Flock Attack: a coin for each Murkrow on the Bench', () => {
    const s = attack(flips(duel('murkrowNeo3', 'machoke', { energy: ['fire', 'fire'], bench: ['murkrowNeo3', 'charmander'] }), true), 1);
    expect(misty(s).active!.damage).toBe(20);
  });
});
