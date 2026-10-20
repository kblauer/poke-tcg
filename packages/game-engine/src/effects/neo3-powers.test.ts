import { describe, expect, it } from 'vitest';
import { applyAction, inPlayDef, usableAttacks, type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (name: string, n = 0) => ({ uid: `${name}-card-${n}`, defId: id(name) });

describe('Neo Revelation Pokémon Powers', () => {
  it("Time Travel: heads, the attack doesn't Knock Celebi Out; it's shuffled into its owner's deck, and no Prize card is taken", () => {
    const start = duel('charmander', 'celebiTime', { energy: ['fire', 'fire'], oppBench: ['charmander'] });
    misty(start).active!.damage = 30;
    const s = attack(flips(start, true), 1);
    expect(misty(s).active).toBeNull();
    expect(misty(s).deck.some((c) => c.defId === id('celebiTime'))).toBe(true);
    expect(ash(s).prizes.length).toBe(6);
  });

  it('Time Travel: tails, Celebi is Knocked Out as usual', () => {
    const start = duel('charmander', 'celebiTime', { energy: ['fire', 'fire'], oppBench: ['charmander'] });
    misty(start).active!.damage = 30;
    const s = attack(flips(start, false), 1);
    expect([misty(s).discard.some((c) => c.defId === id('celebiTime')), ash(s).prizes.length]).toEqual([true, 5]);
  });

  it('Hard Shell: 40 or less damage to Shuckle is 10', () => {
    const s = attack(duel('charmander', 'shuckle', { energy: ['fire', 'fire'] }), 1);
    expect(misty(s).active!.damage).toBe(10);
  });

  it("Crystal Body: the opponent's attacks do Suicune damage but nothing else", () => {
    const asleep = attack(duel('misdreavusNeo3', 'suicuneCrystal', { energy: ['psychic'] }), 0);
    expect(misty(asleep).active!.condition ?? null).toBeNull();
    const hit = attack(flips(duel('pikachuP1', 'suicuneCrystal', { energy: ['lightning', 'lightning'] }), true), 1);
    expect([misty(hit).active!.damage, misty(hit).active!.condition ?? null]).toEqual([20, null]);
  });

  it('Prehistoric Memory: an Evolved Pokémon can use the attacks of the cards it evolved from', () => {
    const start = duel('charmeleon', 'machoke', { energy: ['fire', 'fire', 'fire'], bench: ['aerodactylNeo3'] });
    ash(start).active!.evolvedFrom = [card('charmander')];
    expect(usableAttacks(ash(start).active!, start.cards, { recall: true }).map((u) => u.attack.name)).toEqual(['Slash', 'Scratch', 'Ember']);
    const s = attack(start, 1);
    expect(misty(s).active!.damage).toBe(10);
  });

  it("Prehistoric Memory: no lower attacks without a working Aerodactyl in play", () => {
    const start = duel('charmeleon', 'machoke', { energy: ['fire', 'fire', 'fire'] });
    ash(start).active!.evolvedFrom = [card('charmander')];
    expect(tryAttack(start, 1).ok).toBe(false);
  });

  it("Mimic: Sudowoodo can use the Defending Pokémon's attacks, paying their costs", () => {
    const start = duel('sudowoodo', 'charmander', { energy: ['fighting', 'fire'] });
    expect(usableAttacks(ash(start).active!, start.cards, { defender: misty(start).active }).map((u) => u.attack.name)).toEqual(['Slam', 'Scratch', 'Ember']);
    const s = attack(start, 1);
    expect(misty(s).active!.damage).toBe(10);
  });

  it('Magma Pool: when Magcargo retreats, a Fire Energy card goes from it to the new Active Pokémon', () => {
    const start = duel('magcargo', 'machoke', { energy: ['fire', 'fire', 'fire'], bench: ['charmander'] });
    // As at the start of every turn: the Active Pokémon the turn began with.
    ash(start).lastActive = ash(start).active!.card.uid;
    const s = act(start, 'ash', { type: 'RETREAT', slot: 0, energyUids: [ash(start).active!.energy[0]!.uid] });
    expect([ash(s).active!.energy.length, ash(s).bench[0]!.energy.length]).toEqual([1, 1]);
  });

  it('Allergic Pollen: attacks take nothing from discard piles while Parasect works', () => {
    const start = duel('magnetonNeo3', 'machoke', { energy: ['lightning', 'lightning', 'fire'], oppBench: ['parasect'] });
    ash(start).discard.push(card('lightning'));
    const s = attack(start, 0);
    expect([ash(s).active!.energy.length, ash(s).discard.length]).toEqual([3, 1]);
  });

  it("[Keep]: the opponent's attacks can't discard Energy cards from Pokémon with Unown in their names", () => {
    const start = duel('poliwrath', 'unownK', { energy: ['water', 'water', 'water', 'water'], defenderEnergy: ['psychic'] });
    // Defender keeps Unown K in play through Whirlpool's 40.
    misty(start).active!.attached = [{ card: card('defender'), until: 99 }];
    const s = attack(start, 1);
    expect(misty(s).active!.energy.length).toBe(1);
  });

  it('Lightning Burst: attaching a Lightning Energy card to Raikou, the opponent switches in their only benched Pokémon', () => {
    const start = duel('raikouBurst', 'machoke', { oppBench: ['charmander'] });
    const [lightning] = give(start, 'ash', 'lightning');
    const s = act(start, 'ash', { type: 'ATTACH_ENERGY', cardUid: lightning!, target: 'active' });
    expect([misty(s).active!.card.defId, misty(s).bench[0]!.card.defId]).toEqual([id('charmander'), id('machoke')]);
  });

  it('Lightning Burst: with several benched Pokémon, the opponent picks', () => {
    const start = duel('raikouBurst', 'machoke', { oppBench: ['charmander', 'squirtle'] });
    const [lightning] = give(start, 'ash', 'lightning');
    let s = act(start, 'ash', { type: 'ATTACH_ENERGY', cardUid: lightning!, target: 'active' });
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'switchIn' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', target: 1 });
    expect([misty(s).active!.card.defId, s.currentPlayer]).toEqual([id('squirtle'), 'ash']);
  });

  it('Energy Converter: a basic Energy card is another type until the end of the turn', () => {
    const start = duel('charmander', 'machoke', { energy: ['water', 'water'], bench: ['porygon2'] });
    expect(tryAttack(start, 1).ok).toBe(false);
    const energyUid = ash(start).active!.energy[0]!.uid;
    let s = act(start, 'ash', { type: 'USE_POWER', source: 0, choices: { from: 'active', energyUid, type: 'fire' } });
    s = attack(s, 1, { energyUids: [energyUid] });
    expect(misty(s).active!.damage).toBe(30);
  });

  it('Energy Converter: the Energy goes back to its type at the end of the turn', () => {
    const start = duel('charmander', 'machoke', { energy: ['water', 'water'], bench: ['porygon2'] });
    const energyUid = ash(start).active!.energy[0]!.uid;
    let s = act(start, 'ash', { type: 'USE_POWER', source: 0, choices: { from: 'active', energyUid, type: 'fire' } });
    s = endTurn(s, 'ash');
    expect(ash(s).active!.energy[0]!.converted).toBeUndefined();
  });

  it('Submerge: Lanturn is a Water Pokémon until the end of the turn', () => {
    let s = act(duel('lanturnNeo3', 'machoke'), 'ash', { type: 'USE_POWER', source: 'active' });
    expect(inPlayDef(s.cards, ash(s).active!).type).toBe('water');
    s = endTurn(s, 'ash');
    expect(inPlayDef(s.cards, ash(s).active!).type).toBe('lightning');
  });

  it('Howl: playing Entei from the hand, the top 5 cards are discarded, their Fire Energy cards go to Fire Pokémon, and the turn ends', () => {
    const start = duel('charmander', 'machoke');
    ash(start).deck.unshift(card('fire', 1), card('water', 1), card('fire', 2));
    const [entei] = give(start, 'ash', 'enteiHowl');
    let s = act(start, 'ash', { type: 'PLAY_BENCH', cardUid: entei!, slot: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayFlip', power: 'howl' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'distributeEnergy', toType: 'fire' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).active!.energy.length, ash(s).bench[0]!.energy.length, s.currentPlayer]).toEqual([1, 1, 'misty']);
  });

  it("Howl: not used, the turn goes on", () => {
    const start = duel('charmander', 'machoke');
    const [entei] = give(start, 'ash', 'enteiHowl');
    let s = act(start, 'ash', { type: 'PLAY_BENCH', cardUid: entei!, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 1 });
    expect(s.currentPlayer).toBe('ash');
  });

  it('Howl: with no Fire Energy among the 5, the turn still ends', () => {
    const start = duel('charmander', 'machoke');
    const [entei] = give(start, 'ash', 'enteiHowl');
    let s = act(start, 'ash', { type: 'PLAY_BENCH', cardUid: entei!, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(s.currentPlayer).toBe('misty');
  });

  it('Softboiled: evolving into Blissey, heads removes up to 8 damage counters', () => {
    const start = duel('charmander', 'machoke', { bench: ['chansey'] });
    ash(start).bench[0]!.damage = 100;
    const [blissey] = give(start, 'ash', 'blissey');
    let s = act(start, 'ash', { type: 'EVOLVE', cardUid: blissey!, target: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayFlip', power: 'softboiled' });
    s = act(flips(s, true), 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(ash(s).bench[0]!.damage).toBe(20);
  });

  it('[Bear]: moves a damage counter from another Unown to Unown B, even while Unown B is Asleep', () => {
    const start = duel('unownB', 'machoke', { bench: ['unownK'] });
    ash(start).active!.condition = 'asleep';
    ash(start).bench[0]!.damage = 20;
    const s = act(start, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 0 } });
    expect([ash(s).active!.damage, ash(s).bench[0]!.damage]).toEqual([10, 10]);
  });

  it("[Bear]: can't be used with 10 HP left", () => {
    const start = duel('unownB', 'machoke', { bench: ['unownK'] });
    ash(start).active!.damage = 40;
    ash(start).bench[0]!.damage = 20;
    expect(applyAction(start, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 0 } }).ok).toBe(false);
  });

  it('[Yield]: heads attaches a Psychic Energy card from the deck to a Pokémon with Unown in its name', () => {
    const start = duel('unownY', 'machoke', { bench: ['charmander'] });
    ash(start).deck.unshift(card('psychic', 1));
    let s = act(flips(start, true), 'ash', { type: 'USE_POWER', source: 'active' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'psychic-card-1' });
    expect(s.pendingChoice).toMatchObject({ kind: 'attachCard', only: { name: 'Unown' } });
    expect(() => act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 })).toThrow();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(ash(s).active!.energy.length).toBe(1);
  });

  it('Electromagnetic Power: moves an Energy card between Magnemites and Magnetons', () => {
    const start = duel('magnetonNeo3', 'machoke', { energy: ['lightning'], bench: ['magnemite', 'charmander'] });
    const energyUid = ash(start).active!.energy[0]!.uid;
    const s = act(start, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 'active', energyUid, to: 0 } });
    expect([ash(s).active!.energy.length, ash(s).bench[0]!.energy.length]).toEqual([0, 1]);
    expect(applyAction(start, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 'active', energyUid, to: 1 } }).ok).toBe(false);
  });

  it("Legendary Body: the opponent's Trainer cards can't switch the Active Entei or take its Energy", () => {
    const start = duel('charmander', 'enteiFlame', { defenderEnergy: ['fire'], oppBench: ['squirtle'] });
    const [gust, removal] = give(start, 'ash', 'gustofwind', 'energyremoval');
    expect(applyAction(start, 'ash', { type: 'PLAY_TRAINER', cardUid: gust!, choices: { oppTarget: 0 } }).ok).toBe(false);
    expect(applyAction(start, 'ash', { type: 'PLAY_TRAINER', cardUid: removal!, choices: { oppTarget: 'active' } }).ok).toBe(false);
  });

  it("Legendary Body: its own player's Trainer cards don't affect it either, even while it's Asleep", () => {
    const start = duel('enteiFlame', 'machoke', { bench: ['squirtle'] });
    ash(start).active!.damage = 20;
    ash(start).active!.condition = 'asleep';
    const [potion, sw] = give(start, 'ash', 'potion', 'switch');
    expect(applyAction(start, 'ash', { type: 'PLAY_TRAINER', cardUid: potion!, choices: { target: 'active' } }).ok).toBe(false);
    expect(applyAction(start, 'ash', { type: 'PLAY_TRAINER', cardUid: sw!, choices: { target: 0 } }).ok).toBe(false);
  });

  it('Legendary Body: benched, it can be chosen as usual', () => {
    const start = duel('charmander', 'machoke', { bench: ['enteiFlame'] });
    ash(start).bench[0]!.damage = 20;
    const [potion] = give(start, 'ash', 'potion');
    const s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: potion!, choices: { target: 0 } });
    expect(ash(s).bench[0]!.damage).toBe(0);
  });

  it('Legendary Body: Trainer cards attached to it are discarded once it is the Active Pokémon', () => {
    const start = duel('squirtle', 'machoke', { bench: ['enteiFlame'] });
    ash(start).bench[0]!.attached = [{ card: card('focusBand'), until: Number.MAX_SAFE_INTEGER, tool: true }];
    const [sw] = give(start, 'ash', 'switch');
    const s = act(start, 'ash', { type: 'PLAY_TRAINER', cardUid: sw!, choices: { target: 0 } });
    expect([ash(s).active!.attached?.length, ash(s).discard.some((c) => c.defId === id('focusBand'))]).toEqual([0, true]);
  });

  it('Prehistoric Memory works for the opponent too', () => {
    const start = duel('charmander', 'charmeleon', { oppBench: ['aerodactylNeo3'] });
    misty(start).active!.evolvedFrom = [card('charmander', 1)];
    misty(start).active!.energy = [card('fire', 3)];
    const s = attack(endTurn(start, 'ash'), 1, {}, 'misty');
    expect(ash(s).active!.damage).toBe(10);
  });
});
