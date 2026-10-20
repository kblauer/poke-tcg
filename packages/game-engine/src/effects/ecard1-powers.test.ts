import { describe, expect, it } from 'vitest';
import type { PokemonCardDef } from '../cards.js';
import { applyAction, energyPool, powerError, retreatCost, situationCounts, type GameState, type InPlayPokemon, type PowerChoices, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, C, F, FI, G, L, P, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const usePower = (s: GameState, source: Target, choices: PowerChoices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });
const situation = (s: GameState, source: Target) => ({ me: ash(s), opp: misty(s), counts: situationCounts(ash(s), misty(s)), source, cards: s.cards, turn: s.turn });
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards[def.id] = def;
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}

const power = (name: string) => ({ power: { name, text: '' } });
const ampharos = mon('ecard1-2', 'Ampharos', L, 100, [['Lightning Strike', [L, L, C, C], 40]], { stage: 'stage2', ...power('Energy Connect') });
const blastoise = mon('ecard1-4', 'Blastoise', W, 100, [['Energy Cannon', [W, W, C], 40]], { stage: 'stage2', ...power('Jet Stream') });
const charizard = mon('ecard1-6', 'Charizard', F, 120, [['Scorching Whirlwind', [F, F, F, F], 120]], { stage: 'stage2', ...power('Burning Energy') });
const dragonite = mon('ecard1-9', 'Dragonite', C, 100, [['Dragon Tail', [L, W, FI], 40]], { stage: 'stage2', retreatCost: 2, ...power('Tailwind') });
const feraligatr = mon('ecard1-12', 'Feraligatr', W, 120, [['Rending Jaws', [W, W, C, C], 70]], { stage: 'stage2', ...power('Major Tsunami') });
const gengar = mon('ecard1-13', 'Gengar', P, 90, [['Hide in Shadows', [P, P, C], 40]], { stage: 'stage2', ...power('Chaos Move') });
const golem = mon('ecard1-14', 'Golem', FI, 100, [['Rock Tumble', [FI, FI, C, C], 60]], { stage: 'stage2', ...power('Rock Body') });
const poliwrath = mon('ecard1-24', 'Poliwrath', W, 100, [['Water Punch', [W, W, C, C], 40]], { stage: 'stage2', ...power('Plunge') });
const typhlosion = mon('ecard1-28', 'Typhlosion', F, 100, [['Super Singe', [F, F, C, C], 50]], { stage: 'stage2', ...power('Heat Up') });
const tyranitar = mon('ecard1-29', 'Tyranitar', 'darkness', 120, [['Stamp', ['darkness', 'darkness', 'darkness', 'darkness'], 50]], { stage: 'stage2', ...power('Dark Aura') });
const venusaur = mon('ecard1-30', 'Venusaur', G, 100, [['Body Slam', [G, G, C, C], 40]], { stage: 'stage2', ...power('Harvest Bounty') });
const meganium = mon('ecard1-18', 'Meganium', G, 100, [['Poisonpowder', [G, G, C, C], 40]], { stage: 'stage2', ...power('Soothing Aroma') });
const metapod = mon('ecard1-87', 'Metapod', G, 60, [['Rollout', [C], 10]], { stage: 'stage1', ...power('Exoskeleton') });

describe('Expedition Poké-Powers and Poké-Bodies', () => {
  it('Energy Connect: a basic Energy card from a Benched Pokémon to the Active Pokémon, as often as you like', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, ampharos, ['lightning', 'lightning']);
    const once = usePower(s, 0, { from: 0 });
    const twice = usePower(once, 0, { from: 0 });
    expect(ash(twice).active!.energy.map((e) => e.defId)).toEqual(['lightning', 'lightning']);
    expect(ash(twice).bench[0]!.energy).toEqual([]);
  });

  it("Poké-Powers can't be used while their Pokémon is Poisoned or Burned (Burning Energy)", () => {
    const s = duel('charmander', 'onix', { energy: ['water'] });
    const zard = put(s, 'ash', 'active', charizard, ['water']);
    zard.burned = true;
    expect(powerError(situation(s, 'active'))).toBe("Charizard is Burned and can't use Burning Energy");
  });

  it('Burning Energy: basic Energy on all your Pokémon is Fire Energy for the rest of the turn', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 'active', charizard, ['water', 'water']);
    ash(s).bench[0]!.energy = [{ uid: 'w', defId: 'water' }];
    const after = usePower(s, 'active');
    expect(energyPool(ash(after).active!, after.cards)).toEqual(['fire', 'fire']);
    expect(energyPool(ash(after).bench[0]!, after.cards)).toEqual(['fire']);
    expect(energyPool(ash(endTurn(after, 'ash')).active!, after.cards)).toEqual(['water', 'water']);
  });

  it('Jet Stream: heads discards an Energy card from Blastoise, then one from the Defending Pokémon', () => {
    const s = duel('charmander', 'onix', { defenderEnergy: ['fighting'] });
    put(s, 'ash', 'active', blastoise, ['water', 'water']);
    const after = usePower(flips(s, true), 'active');
    expect(ash(after).active!.energy).toHaveLength(1);
    expect(after.pendingChoice).toMatchObject({ kind: 'removeEach', targets: ['active'] });
    const done = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: misty(after).active!.energy[0]!.uid });
    expect(misty(done).active!.energy).toEqual([]);
    expect(ash(usePower(flips(s, false), 'active')).active!.energy).toHaveLength(2);
  });

  it("Tailwind: from the Bench, the Active Pokémon's retreat cost is 0 this turn", () => {
    const s = duel('poliwrath', 'onix');
    put(s, 'ash', 0, dragonite);
    expect(powerError(situation(s, 0))).toBeNull();
    const after = usePower(s, 0);
    expect(retreatCost(ash(after).active!, after.cards, [ash(after), misty(after)])).toBe(0);
    expect(act(after, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).players.ash!.active!.card.defId).toBe('ecard1-9');
  });

  it('Major Tsunami: the opponent chooses their new Active Pokémon, then Feraligatr switches with a Benched Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'], oppBench: ['charmander', 'squirtle'] });
    put(s, 'ash', 'active', feraligatr);
    const after = usePower(s, 'active', { to: 0 });
    expect(ash(after).active!.card.defId).toBe('base1-63');
    expect(after.pendingChoice).toMatchObject({ player: 'misty', kind: 'switchIn' });
    const done = act(after, 'misty', { type: 'RESOLVE_CHOICE', target: 1 });
    expect(misty(done).active!.card.defId).toBe('base1-63');
    expect(done.currentPlayer).toBe('ash');
  });

  it('Chaos Move: with the opponent on 3 or fewer Prizes, a damage counter from any Pokémon to another', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', gengar);
    ash(s).active!.damage = 20;
    expect(powerError(situation(s, 'active'))).toBe('Your opponent has more than 3 Prize cards left');
    misty(s).prizes = misty(s).prizes.slice(0, 3);
    const after = usePower(s, 'active', { fromSide: 'own', from: 'active', toSide: 'opp', oppTo: 'active' });
    expect(ash(after).active!.damage).toBe(10);
    expect(misty(after).active!.damage).toBe(10);
  });

  it('Rock Body: 10 less damage, even while Golem is Asleep (a Poké-Body)', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    put(s, 'misty', 'active', golem).condition = 'asleep';
    expect(misty(attack(s, 1)).active!.damage).toBe(20);
  });

  it('Exoskeleton: 20 less damage', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    put(s, 'misty', 'active', { ...metapod, weakness: null });
    expect(misty(attack(s, 1)).active!.damage).toBe(10);
  });

  it('Dark Aura: all Energy attached to Tyranitar is Darkness Energy', () => {
    const s = duel('charmander', 'onix');
    const tt = put(s, 'ash', 'active', tyranitar, ['fire', 'water', 'grass', 'fire']);
    expect(energyPool(tt, s.cards)).toEqual(['darkness', 'darkness', 'darkness', 'darkness']);
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(50);
  });

  it('Plunge: heads moves the Active Pokémon’s Energy to the Benched Poliwrath, then switches them', () => {
    const s = duel('charmander', 'onix', { energy: ['fire', 'fire'] });
    put(s, 'ash', 0, poliwrath);
    const after = usePower(flips(s, true), 0);
    expect(ash(after).active!.card.defId).toBe('ecard1-24');
    expect(ash(after).active!.energy).toHaveLength(2);
    expect(ash(after).bench[0]!.energy).toEqual([]);
    expect(ash(usePower(flips(s, false), 0)).active!.card.defId).toBe('base1-46');
  });

  it('Heat Up: only while the opponent has more Energy cards attached; a Fire Energy card from the deck to a Benched Pokémon', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'], defenderEnergy: ['fighting'] });
    put(s, 'ash', 'active', typhlosion);
    expect(powerError(situation(s, 'active'))).toBeNull();
    ash(s).deck.unshift({ uid: 'deck-fire', defId: 'fire' });
    const after = usePower(s, 'active');
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'energyType', type: 'fire', attach: true });
    ash(s).active!.energy = [{ uid: 'f', defId: 'fire' }];
    expect(powerError(situation(s, 'active'))).toBe("Your opponent doesn't have more Energy cards attached than you");
  });

  it('Harvest Bounty: after the Energy card from the hand went to the Active Pokémon, another one from the hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, venusaur);
    ash(s).hand = [{ uid: 'g1', defId: 'grass' }, { uid: 'g2', defId: 'grass' }];
    expect(powerError(situation(s, 0))).toBe('Attach an Energy card from your hand to your Active Pokémon first');
    const attached = act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: 'g1', target: 'active' });
    const after = usePower(attached, 0, { cardUid: 'g2' });
    expect(ash(after).active!.energy.map((e) => e.uid)).toEqual(['g1', 'g2']);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 0, choices: {} })).toMatchObject({ ok: false });
  });

  it('Soothing Aroma: heads removes a damage counter from each of your Pokémon that has any', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 1, meganium);
    ash(s).active!.damage = 20;
    ash(s).bench[0]!.damage = 10;
    const after = usePower(flips(s, true), 1);
    expect([ash(after).active!.damage, ash(after).bench[0]!.damage, ash(after).bench[1]!.damage]).toEqual([10, 0, 0]);
  });
});
