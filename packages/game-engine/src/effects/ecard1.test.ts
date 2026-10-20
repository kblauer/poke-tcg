import { describe, expect, it } from 'vitest';
import type { PokemonCardDef } from '../cards.js';
import { attackEffect, usableAttacks, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, tryAttack, C, F, FI, G, L, P, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

/** Puts the card `def` into play for `player` at `target`, with Energy cards (by test-kit id: 'fire', 'water'…). */
function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards[def.id] = def;
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}

const alakazam = mon('ecard1-1', 'Alakazam', P, 100, [['Syncroblast', [P, C, C], 80]], { stage: 'stage2', power: { name: 'Psymimic', text: '' } });
const ampharos = mon('ecard1-2', 'Ampharos', L, 100, [['Lightning Strike', [L, L, C, C], 40]], { stage: 'stage2' });
const charizard = mon('ecard1-6', 'Charizard', F, 120, [['Scorching Whirlwind', [F, F, F, F], 120]], { stage: 'stage2' });
const mew = mon('ecard1-19', 'Mew', P, 50, [['Super Psywave', [P, C], 0]]);
const ninetales = mon('ecard1-21', 'Ninetales', F, 80, [['Mislead', [F, C], 0], ['Ethereal Flame', [C, C, C], 30]], { stage: 'stage1' });
const pichu = mon('ecard1-22', 'Pichu', L, 30, [['Energy Patch', [L], 0]], { baby: true });
const weezing = mon('ecard1-32', 'Weezing', G, 80, [['Foul Gas', [G, C], 0], ['Misfire', [G, G, C], 60]], { stage: 'stage1' });
const wartortle = mon('ecard1-92', 'Wartortle', W, 80, [['Doubleslap', [C], 10], ['Giant Wave', [W, W], 40]], { stage: 'stage1' });
// As the API builds it: the printed cost from the attack's effect.
const hoppip = mon('ecard1-112', 'Hoppip', G, 40, [['Sleep Powder', [G], 10]]);
const tauros = mon('ecard1-133', 'Tauros', C, 70, [['Horn Hazard', [C, C], 30], ['Take Down', [C, C], 30]]);
const golem = mon('ecard1-14', 'Golem', FI, 100, [['Rock Tumble', [FI, FI, C, C], 60]], { stage: 'stage2' });

describe('Expedition attacks', () => {
  it("Syncroblast: 80 when Alakazam and the Defending Pokémon have as many Energy cards, 20 otherwise", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', alakazam, ['psychic', 'psychic', 'psychic']);
    put(s, 'misty', 'active', { ...tauros, hp: 200 }, ['fire', 'fire', 'fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
    misty(s).active!.energy.pop();
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Lightning Strike: discarding all Lightning Energy cards makes it 80', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', ampharos, ['lightning', 'lightning', 'fire', 'fire']);
    const boosted = attack(s, 0, { boost: true });
    expect(misty(boosted).active!.damage).toBe(80);
    expect(ash(boosted).active!.energy.map((e) => e.defId)).toEqual(['fire', 'fire']);
    expect(misty(attack(s, 0, { boost: false })).active!.damage).toBe(40);
  });

  it('Scorching Whirlwind: 1 tails discards the 2 Energy cards chosen, 2 tails all of them', () => {
    const s = duel('charmander', 'onix');
    const zard = put(s, 'ash', 'active', charizard, ['fire', 'fire', 'fire', 'fire', 'water']);
    const keep = zard.energy.slice(0, 3).map((e) => e.uid);
    const chosen = zard.energy.slice(3).map((e) => e.uid);
    expect(ash(attack(flips(s, true, false), 0, { energyUids: chosen })).active!.energy.map((e) => e.uid)).toEqual(keep);
    expect(ash(attack(flips(s, false, false), 0, { energyUids: chosen })).active!.energy).toEqual([]);
    expect(ash(attack(flips(s, true, true), 0, { energyUids: chosen })).active!.energy).toHaveLength(5);
  });

  it('Super Psywave: a damage counter for each Energy card on the chosen Pokémon', () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mew, ['psychic', 'psychic']);
    misty(s).bench[0]!.energy = [{ uid: 'w1', defId: 'water' }, { uid: 'w2', defId: 'water' }, { uid: 'w3', defId: 'water' }];
    const after = attack(s, 0, { oppTarget: 0 });
    expect(misty(after).bench[0]!.damage).toBe(30);
    expect(misty(after).active!.damage).toBe(0);
  });

  it('Energy Patch: moves a basic Energy card from one of your Pokémon to another', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    put(s, 'ash', 'active', pichu, ['lightning']);
    const water = { uid: 'w', defId: 'water' };
    ash(s).bench[0]!.energy = [water];
    const after = attack(s, 0, { ownTarget: 0, oppEnergyUid: 'w', ownTo: 'active' });
    expect(ash(after).active!.energy.map((e) => e.uid)).toContain('w');
    expect(ash(after).bench[0]!.energy).toEqual([]);
  });

  it('Ethereal Flame: discards every Fire Energy card, 20 more for each', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', ninetales, ['fire', 'fire', 'water']);
    const after = attack(s, 1);
    expect(misty(after).active!.damage).toBe(70);
    expect(ash(after).active!.energy.map((e) => e.defId)).toEqual(['water']);
    expect(attackEffect('ecard1-57', 'Ethereal Flame')?.damage).toBe('30+');
  });

  it('Misfire: tails puts 6 damage counters on Weezing', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', weezing, ['grass', 'grass', 'grass']);
    expect(ash(attack(flips(s, false), 1)).active!.damage).toBe(60);
    expect(ash(attack(flips(s, true), 1)).active!.damage).toBe(0);
  });

  it("Giant Wave: Wartortle can't attack during its player's next turn", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', wartortle, ['water', 'water']);
    const next = endTurn(attack(s, 1), 'misty');
    expect(tryAttack(next, 0)).toEqual({ ok: false, error: "Wartortle can't attack this turn" });
  });

  it("Hoppip's Sleep Powder has its printed cost and damage", () => {
    expect(attackEffect('ecard1-112', 'Sleep Powder')).toMatchObject({ cost: ['grass'], damage: '10' });
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hoppip, ['grass']);
    // Tails for the Sleep check between turns.
    expect(misty(attack(flips(s, false), 0)).active!.condition).toBe('asleep');
  });

  it('Rock Tumble ignores Resistance', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', golem, ['fighting', 'fighting', 'fighting', 'fighting']);
    put(s, 'misty', 'active', mon('neo1-x', 'Pidgey', C, 100, [], { resistance: { type: FI, amount: 30 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it("Psymimic: Alakazam can use the opponent's Pokémon's attacks, paying their cost", () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    const zam = put(s, 'ash', 'active', alakazam, ['water', 'water']);
    const names = usableAttacks(zam, s.cards, { defender: misty(s).active, oppBench: misty(s).bench }).map((u) => u.attack.name);
    expect(names).toEqual(['Syncroblast', 'Rock Throw', 'Harden', 'Bubble', 'Withdraw']);
    // Squirtle's Bubble (Water), the fourth: paid with Alakazam's Water Energy.
    expect(misty(attack(flips(s, true), 3)).active!.condition).toBe('paralyzed');
    zam.poison = 10;
    expect(usableAttacks(zam, s.cards, { defender: misty(s).active, oppBench: misty(s).bench })).toHaveLength(1);
  });

  it('Multi Technical Machine 01: its Pokémon can use Paralyzing Gaze this turn; then it is discarded', () => {
    const s = duel('charmander', 'onix');
    s.cards['ecard1-144'] = { id: 'ecard1-144', kind: 'trainer', name: 'Multi Technical Machine 01', imageUrl: null, text: '' };
    ash(s).hand = [{ uid: 'tm', defId: 'ecard1-144' }];
    ash(s).active!.energy = [{ uid: 'f', defId: 'fire' }];
    const attached = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'tm', choices: { target: 'active' } });
    expect(usableAttacks(ash(attached).active!, attached.cards).map((u) => u.attack.name)).toEqual(['Scratch', 'Ember', 'Paralyzing Gaze']);
    const used = attack(attached, 2);
    expect(misty(used).active!.condition).toBe('paralyzed');
    expect(ash(used).active!.attached ?? []).toEqual([]);
    expect(ash(used).discard.map((c) => c.uid)).toContain('tm');
  });
});
