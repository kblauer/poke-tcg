import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, retreatCost, type GameState, type InPlayPokemon, type PlayerState } from '../index.js';
import { act, attack, C, duel, F, FI, flips, G, mon, P, settles, W } from './test-kit.js';

// Legendary Treasures (README: Generation 5): its attacks, Abilities and Trainers that aren't reprints. The cards are set up
// here (not in test-kit's BY_NAME): `setup` puts them into a duel's library.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

const LIB: Record<string, CardDef> = {};
const def = <T extends CardDef>(d: T) => ((LIB[d.id] = d), d);
const trainer = (id: string, name: string, extra: object = {}) => def({ id, kind: 'trainer', name, imageUrl: null, text: '', ...extra });

const shuckle = def(mon('bw11-3', 'Shuckle', G, 80, [['Share', [G], 0]]));
const carnivine = def(mon('bw11-5', 'Carnivine', G, 90, [['Ambush Bite', [G, C], 20]]));
const ninetales = def(mon('bw11-21', 'Ninetales', F, 90, [['Color Coordination', [C, C, C], 50]], { stage: 'stage1' }));
const gyarados = def(mon('bw11-31', 'Gyarados', W, 130, [['Howling Rampage', [W, C], 0]], { stage: 'stage1' }));
const phione = def(mon('bw11-36', 'Phione', W, 70, [['Aqua Boomerang', [W], 20]]));
const xatu = def(mon('bw11-56', 'Xatu', P, 90, [['Fortunate Draw', [P], 0]], { stage: 'stage1' }));
const swoobat = def(mon('bw11-65', 'Swoobat', P, 80, [['Energy Gift', [C], 0]], { stage: 'stage1' }));
const gallade = def(mon('bw11-81', 'Gallade', FI, 130, [['Pandemonium Blade', [FI, C, C], 60]], { stage: 'stage2' }));
const excadrill = def(mon('bw11-82', 'Excadrill-EX', FI, 170, [['Dig Out', [C, C], 40]], { pokemonEX: true }));
const spiritomb = def(mon('bw11-87', 'Spiritomb', P, 70, [], { power: { name: 'Sealing Scream', text: '' } }));
const snivy = def(mon('bw11-RC1', 'Snivy', G, 60, [['Growth', [C], 0]]));
const serperior = def(mon('bw11-RC3', 'Serperior', G, 140, [], { stage: 'stage2', retreatCost: 2, power: { name: 'Royal Garden', text: '' } }));
const growlithe = def(mon('bw11-RC4', 'Growlithe', F, 70, [['Rest', [C, C], 0]]));
const kirlia = def(mon('bw11-RC9', 'Kirlia', P, 70, [['Tiptoe Step', [P], 0]], { stage: 'stage1' }));
const gardevoir = def(mon('bw11-RC10', 'Gardevoir', P, 130, [['Eternal Radiance', [P, P], 0]], { stage: 'stage2' }));
const teddiursa = def(mon('test-teddiursa', 'Teddiursa', C, 60, []));
const ursaring = def(mon('bw11-RC16', 'Ursaring', C, 110, [['Picnic Weather', [C, C], 0]], { stage: 'stage1' }));
const target = def(mon('test-target', 'Target', W, 200, []));
const known = def(mon('test-known', 'Known', G, 60, [], { length: `2' 4"` }));
const cedric = trainer('bw11-110', 'Cedric Juniper');
const elesa = trainer('bw11-RC20', 'Elesa');
const ace = trainer('bw10-94', 'Master Ball', { aceSpec: true });
const toolCard = trainer('bw10-88', 'Silver Bangle');

let n = 0;
const card = (d: CardDef | { id: string }) => ({ uid: `${d.id}-${n++}`, defId: d.id });
const poke = (d: PokemonCardDef, energy: string[] = []): InPlayPokemon => ({ card: card(d), evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 });
function setup(attacker: PokemonCardDef, defender: PokemonCardDef, opts: { energy?: string[]; bench?: PokemonCardDef[]; oppBench?: PokemonCardDef[] } = {}): GameState {
  const s = duel('charmander', 'charmander');
  s.cards = { ...s.cards, ...LIB };
  ash(s).active = poke(attacker, opts.energy);
  misty(s).active = poke(defender);
  (opts.bench ?? []).forEach((d, i) => (ash(s).bench[i] = poke(d)));
  (opts.oppBench ?? []).forEach((d, i) => (misty(s).bench[i] = poke(d)));
  return s;
}
const hand = (p: PlayerState, d: CardDef | { id: string }) => {
  const c = card(d);
  p.hand.push(c);
  return c.uid;
};
const play = (s: GameState, cardUid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });

describe('attacks', () => {
  it('Share: 40 off a Benched Pokémon; Ambush Bite: heads, 20 more and an Energy discarded', () => {
    const s = setup(shuckle, target, { energy: ['grass'], bench: [teddiursa] });
    ash(s).bench[0]!.damage = 50;
    expect(ash(attack(s, 0, { ownBenchSlot: 0 })).bench[0]!.damage).toBe(10);
    const b = setup(carnivine, target, { energy: ['grass', 'fire'] });
    misty(b).active!.energy.push({ uid: 'w', defId: 'water' });
    expect(misty(attack(flips(b, true), 0)).active).toMatchObject({ damage: 40, energy: [] });
    expect(misty(attack(flips(b, false), 0)).active).toMatchObject({ damage: 20, energy: [{ uid: 'w' }] });
  });

  it('Color Coordination: 40 more with a basic Energy card of the Defending Pokémon\'s type', () => {
    const s = setup(ninetales, target, { energy: ['fire', 'fire', 'fire'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
    ash(s).active!.energy[2] = { uid: 'w', defId: 'water' };
    expect(misty(attack(s, 0)).active!.damage).toBe(90);
  });

  it('Howling Rampage: 20 for each Prize card both players have taken', () => {
    const s = setup(gyarados, target, { energy: ['water', 'fire'] });
    ash(s).prizes = ash(s).prizes.slice(0, 5);
    misty(s).prizes = misty(s).prizes.slice(0, 4);
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Aqua Boomerang: Phione and its cards back into the hand once the attack is done', () => {
    const s = setup(phione, target, { energy: ['water'], bench: [teddiursa] });
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(20);
    expect(ash(after).hand.some((c) => c.defId === 'bw11-36')).toBe(true);
  });

  it('Fortunate Draw: Rock-Paper-Scissors; the winner draws 3, the loser discards the top 3', () => {
    const s = setup(xatu, target, { energy: ['psychic'] });
    const asked = attack(s, 0);
    expect(asked.pendingChoice).toMatchObject({ kind: 'rps', player: 'ash', fortunate: true, afterAttack: true });
    const hand0 = ash(asked).hand.length;
    const discard0 = misty(asked).discard.length;
    let after = act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    after = act(after, 'misty', { type: 'RESOLVE_CHOICE', count: 2 });
    // Rock beats scissors: Ash draws 3 (then Misty's turn starts), Misty discards 3.
    expect(ash(after).hand.length).toBe(hand0 + 3);
    expect(misty(after).discard.length).toBe(discard0 + 3);
  });

  it('Energy Gift: heads, Psychic Energy cards from the deck onto the player\'s Pokémon', () => {
    const s = setup(swoobat, target, { energy: ['fire'], bench: [teddiursa] });
    ash(s).deck.unshift({ uid: 'p1', defId: 'psychic' }, { uid: 'p2', defId: 'psychic' });
    const after = attack(flips(s, true), 0);
    expect(settles(after).some((d) => [ash(d).active!, ash(d).bench[0]!].flatMap((p) => p.energy).filter((e) => e.defId === 'psychic').length === 2)).toBe(true);
  });

  it('Pandemonium Blade: 20 more for each Benched Pokémon with damage counters', () => {
    const s = setup(gallade, target, { energy: ['fighting', 'fire', 'fire'], bench: [teddiursa, teddiursa, teddiursa] });
    ash(s).bench[0]!.damage = 10;
    ash(s).bench[2]!.damage = 30;
    expect(misty(attack(s, 0)).active!.damage).toBe(100);
  });

  it('Dig Out: the top card discarded; a basic Energy card goes onto a Pokémon instead', () => {
    const s = setup(excadrill, target, { energy: ['fire', 'fire'], bench: [teddiursa] });
    ash(s).deck.unshift({ uid: 'top', defId: 'water' });
    const asked = attack(s, 0);
    const after = act(asked, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual(['top']);
    const other = setup(excadrill, target, { energy: ['fire', 'fire'] });
    ash(other).deck.unshift(card(teddiursa));
    expect(ash(attack(other, 0)).discard.some((c) => c.defId === 'test-teddiursa')).toBe(true);
  });

  it('Growth: a Grass Energy card from the hand onto Snivy; Rest; Tiptoe Step', () => {
    const s = setup(snivy, target, { energy: ['fire'] });
    ash(s).hand = [];
    const g = hand(ash(s), { id: 'grass' });
    const asked = attack(s, 0);
    expect(settles(asked).length).toBeGreaterThan(0);
    const after = asked.pendingChoice ? act(asked, 'ash', { type: 'RESOLVE_CHOICE', cardUid: g }) : asked;
    expect(ash(after).active!.energy.map((e) => e.uid)).toContain(g);
    const r = setup(growlithe, target, { energy: ['fire', 'fire'] });
    ash(r).active!.damage = 50;
    // (Tails between turns: still Asleep.)
    expect(ash(attack(flips(r, false), 0)).active).toMatchObject({ damage: 0, condition: 'asleep' });
    const k = setup(kirlia, target, { energy: ['psychic', 'psychic'] });
    const before = ash(k).hand.length;
    expect(ash(attack(k, 0)).hand.length).toBe(before + 2);
  });

  it('Eternal Radiance: every damage counter moved to the Defending Pokémon; not again next turn', () => {
    const s = setup(gardevoir, target, { energy: ['psychic', 'psychic'] });
    ash(s).active!.damage = 70;
    const after = attack(s, 0);
    expect(ash(after).active!.damage).toBe(0);
    expect(misty(after).active!.damage).toBe(70);
    expect(ash(after).active!.effects?.amnesia).toEqual({ attack: 'Eternal Radiance', until: s.turn + 2 });
  });

  it('Picnic Weather: a Teddiursa from the discard pile onto the Bench, with an Energy card from it', () => {
    const s = setup(ursaring, target, { energy: ['fire', 'fire'] });
    ash(s).discard.push({ uid: 'ted', defId: 'test-teddiursa' }, { uid: 'en', defId: 'water' });
    const after = attack(s, 0, { discardUids: ['ted', 'en'] });
    expect(ash(after).bench[0]).toMatchObject({ card: { uid: 'ted' }, energy: [{ uid: 'en' }] });
  });
});

describe('Abilities', () => {
  it('Sealing Scream: no ACE SPEC cards for either player', () => {
    const s = setup(teddiursa, target, { oppBench: [spiritomb] });
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(ash(s), ace) }).ok).toBe(false);
    misty(s).bench[0] = null;
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(ash(s), ace) }).ok).toBe(true);
  });

  it('Royal Garden: no Retreat Cost with Grass Energy attached', () => {
    const s = setup(serperior, target);
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(2);
    ash(s).active!.energy.push({ uid: 'g', defId: 'grass' });
    expect(retreatCost(ash(s).active!, s.cards, [ash(s), misty(s)])).toBe(0);
  });
});

describe('Trainers', () => {
  it('Cedric Juniper: the opponent guesses the height; right, they draw 3, wrong, the player does', () => {
    const s = setup(teddiursa, target);
    hand(ash(s), known);
    const asked = play(s, hand(ash(s), cedric), { handUids: [ash(s).hand.find((c) => c.defId === 'test-known')!.uid] });
    const choice = asked.pendingChoice as { kind: string; answer: number; lengths: string[] };
    expect(choice).toMatchObject({ kind: 'quiz', player: 'misty', draw: 3 });
    expect(choice.lengths[choice.answer]).toBe(`2' 4"`);
    const right = act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: choice.answer });
    expect(misty(right).hand.length).toBe(misty(asked).hand.length + 3);
    const wrong = act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: (choice.answer + 1) % 4 });
    expect(ash(wrong).hand.length).toBe(ash(asked).hand.length + 3);
  });

  it('Elesa: up to 3 Pokémon Tool cards from the deck', () => {
    const s = setup(teddiursa, target);
    ash(s).deck.unshift(card(toolCard), card(toolCard), card(toolCard), card(toolCard));
    const after = play(s, hand(ash(s), elesa));
    expect(ash(after).hand.filter((c) => c.defId === 'bw10-88')).toHaveLength(3);
  });
});
