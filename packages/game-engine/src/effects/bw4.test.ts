import { describe, expect, it } from 'vitest';
import type { CardDef, CardLibrary } from '../cards.js';
import { applyAction, canPayCost, getPlayerView, type GameState, type InPlayPokemon } from '../index.js';
import { act, C, CARDS, duel, F, FI, flips, G, mon, P, settles, W } from './test-kit.js';

// Next Destinies (README: Generation 5): its attacks, Abilities, Trainers and Special Energy.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

const CARD_DEFS: CardDef[] = [
  mon('bw4-1', 'Pinsir', G, 90, [['Power Pinch', [C, C], 0]]),
  mon('bw4-4', 'Kricketune', G, 90, [['Draining Cut', [G, C], 40]], { stage: 'stage1', evolvesFrom: 'Kricketot' }),
  mon('bw4-7', 'Simisage', G, 90, [['Stadium Drain', [G, C], 30]], { stage: 'stage1', evolvesFrom: 'Pansage' }),
  mon('bw4-8', 'Foongus', G, 50, [['Find a Friend', [C], 0]]),
  mon('bw4-9', 'Amoonguss', G, 90, [['Rising Lunge', [G], 30]], { stage: 'stage1', evolvesFrom: 'Foongus', power: { name: 'Sporprise', text: '' } }),
  mon('bw4-10', 'Growlithe', F, 70, [['Stoke', [C], 0]]),
  mon('bw4-12', 'Arcanine', F, 130, [['Fire Spin', [F, F, C], 100]], { stage: 'stage1', evolvesFrom: 'Growlithe', power: { name: 'Blazing Mane', text: '' } }),
  mon('bw4-20', 'Chandelure', F, 130, [['Inferno', [F, C], 80]], { stage: 'stage2', evolvesFrom: 'Lampent' }),
  mon('bw4-29', 'Simipour', W, 90, [['Stadium Wave', [W, C], 30]], { stage: 'stage1', evolvesFrom: 'Panpour' }),
  mon('bw4-30', 'Basculin', W, 80, [['Bared Fangs', [W], 40]]),
  mon('bw4-33', 'Vanilluxe', W, 130, [['Blizzard', [W], 60]], { stage: 'stage2', evolvesFrom: 'Vanillish', power: { name: 'Slippery Soles', text: '' } }),
  mon('bw4-35', 'Jellicent', W, 110, [['Vengeful Wish', [C], 0]], { stage: 'stage1', evolvesFrom: 'Frillish' }),
  mon('bw4-36', 'Cubchoo', W, 60, [['Sniffle', [W], 0], ['Belt', [W, C], 10]]),
  mon('bw4-57', 'Gardevoir', P, 130, [['Psychic', [P, P, P], 60]], { stage: 'stage2', evolvesFrom: 'Kirlia', power: { name: 'Psychic Mirage', text: '' } }),
  mon('bw4-59', 'Musharna', P, 100, [['Psybeam', [P], 20]], { stage: 'stage1', evolvesFrom: 'Munna', power: { name: 'Forewarn', text: '' } }),
  mon('bw4-62', 'Beheeyem', P, 90, [['Brain Control', [P], 0]], { stage: 'stage1', evolvesFrom: 'Elgyem' }),
  mon('bw4-66', 'Hippowdon', FI, 130, [['Sand Bazooka', [FI, C, C], 70]], { stage: 'stage1', evolvesFrom: 'Hippopotas' }),
  mon('bw4-68', 'Mienshao', FI, 90, [['Haul In', [C], 0]], { stage: 'stage1', evolvesFrom: 'Mienfoo' }),
  mon('bw4-70', 'Weavile', 'darkness', 80, [['Dark Penalty', [C], 90]], { stage: 'stage1', evolvesFrom: 'Sneasel' }),
  mon('bw4-71', 'Seedot', G, 50, [['Ram', [C], 10]]),
  mon('bw4-72', 'Shiftry', 'darkness', 130, [['Slash', [C], 60]], { stage: 'stage1', evolvesFrom: 'Seedot', power: { name: 'Giant Fan', text: '' } }),
  mon('bw4-76', 'Bronzong', 'metal', 100, [['Oracle Inflict', [C], 30]], { stage: 'stage1', evolvesFrom: 'Bronzor', power: { name: 'Heal Block', text: '' } }),
  mon('bw4-85', 'Cinccino', C, 90, [['Tail Slap', [C], 30]], { stage: 'stage1', evolvesFrom: 'Minccino', power: { name: 'Smooth Coat', text: '' } }),
  mon('bwt-big', 'Snorlax', C, 200, [['Body Slam', [C], 100], ['Tackle', [C], 30]], { retreatCost: 4 }),
  mon('bwt-small', 'Pichu', C, 30, [['Tackle', [C], 10]], { retreatCost: 1 }),
  mon('bwt-psy', 'Kirlia', P, 80, [['Psyshock', [P, P], 30]], { stage: 'stage1', evolvesFrom: 'Ralts' }),
  mon('bwt-psy-basic', 'Ralts', P, 60, [['Psyshock', [P, P], 30]]),
  { id: 'bw4-86', kind: 'trainer', name: 'Cilan', imageUrl: null, text: '' },
  { id: 'bw4-87', kind: 'trainer', name: 'Exp. Share', imageUrl: null, text: '' },
  { id: 'bw4-88', kind: 'trainer', name: 'Heavy Ball', imageUrl: null, text: '' },
  { id: 'bw4-89', kind: 'trainer', name: 'Level Ball', imageUrl: null, text: '' },
  { id: 'bw4-90', kind: 'trainer', name: 'Pokémon Center', imageUrl: null, text: '' },
  { id: 'bw4-91', kind: 'trainer', name: 'Skyarrow Bridge', imageUrl: null, text: '' },
  { id: 'bw1-100', kind: 'trainer', name: 'Potion', imageUrl: null, text: '' },
  { id: 'bw4-93', kind: 'energy', name: 'Prism Energy', imageUrl: null, energyType: 'colorless', basic: false },
];
const LIB: CardLibrary = { ...CARDS, ...Object.fromEntries(CARD_DEFS.map((d) => [d.id, d])) };

let n = 0;
/** A Pokémon in play (by card id) with Energy (by Energy card id: 'fire', 'water'…). */
const put = (defId: string, energy: string[] = []): InPlayPokemon => ({ card: { uid: `${defId}#${n++}`, defId }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}#${n++}`, defId: e })), playedTurn: 0 });
const hand = (s: GameState, player: string, defId: string) => {
  const card = { uid: `${defId}#${n++}`, defId };
  s.players[player]!.hand.push(card);
  return card.uid;
};
const tool = (p: InPlayPokemon, defId: string) => (p.attached = [{ card: { uid: `${defId}#${n++}`, defId }, until: Number.MAX_SAFE_INTEGER, tool: true }]);
/** Ash's `attacker` against Misty's `defender` (card ids), on Ash's turn 3, with empty hands. */
function game(attacker: string, defender: string, opts: { energy?: string[]; defenderEnergy?: string[]; bench?: string[]; oppBench?: string[] } = {}): GameState {
  const s = duel('charmander', 'charmander');
  s.cards = LIB;
  ash(s).hand = [];
  misty(s).hand = [];
  ash(s).active = put(attacker, opts.energy);
  misty(s).active = put(defender, opts.defenderEnergy);
  (opts.bench ?? []).forEach((d, i) => (ash(s).bench[i] = put(d)));
  (opts.oppBench ?? []).forEach((d, i) => (misty(s).bench[i] = put(d)));
  return s;
}
const attack = (s: GameState, attackIndex: number, choices = {}) => act(s, 'ash', { type: 'ATTACK', attackIndex, choices });
const play = (s: GameState, cardUid: string, choices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid, choices });
const resolve = (s: GameState, player: string, answer = {}) => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });
const stadium = (s: GameState, defId: string) => (s.stadium = { card: { uid: `${defId}#${n++}`, defId }, owner: 'misty' });

describe('attacks', () => {
  it('Power Pinch: an Energy card off the Defending Pokémon for each heads, asked when they differ', () => {
    const after = attack(flips(game('bw4-1', 'bwt-big', { energy: ['grass', 'grass'], defenderEnergy: ['fire', 'water', 'grass'] }), true, true), 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'removeEach', targets: ['active', 'active'] });
    expect(settles(after).length).toBeGreaterThan(0);
    const same = attack(flips(game('bw4-1', 'bwt-big', { energy: ['grass', 'grass'], defenderEnergy: ['fire', 'fire', 'fire'] }), true, false), 0);
    expect(misty(same).active!.energy).toHaveLength(2);
  });

  it('Draining Cut: as much healed as it did', () => {
    const s = game('bw4-4', 'bwt-big', { energy: ['grass', 'grass'] });
    ash(s).active!.damage = 60;
    const after = attack(flips(s, true, false), 0);
    expect([misty(after).active!.damage, ash(after).active!.damage]).toEqual([40, 20]);
  });

  it('The Stadium attacks: 30 more and their effect with a Stadium in play', () => {
    const s = game('bw4-7', 'bwt-big', { energy: ['grass', 'grass'] });
    ash(s).active!.damage = 50;
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    stadium(s, 'bw4-91');
    const after = attack(s, 0);
    expect([misty(after).active!.damage, ash(after).active!.damage]).toEqual([60, 20]);
    const wave = game('bw4-29', 'bwt-big', { energy: ['water', 'water'] });
    stadium(wave, 'bw4-91');
    expect(misty(attack(flips(wave, false), 0)).active!.condition).toBe('asleep');
  });

  it('Find a Friend and Stoke: heads, a search', () => {
    const s = game('bw4-8', 'bwt-big', { energy: ['grass'] });
    ash(s).deck.unshift({ uid: 'big', defId: 'bwt-big' }, { uid: 'w', defId: 'water' });
    expect(attack(flips(s, true), 0).pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'pokemon' });
    const g = game('bw4-10', 'bwt-big', { energy: ['fire'] });
    ash(g).deck.unshift({ uid: 'f', defId: 'fire' });
    expect(ash(attack(flips(g, true), 0)).active!.energy.map((e) => e.uid)).toContain('f');
  });

  it('Fire Spin: tails, 2 Energy cards discarded, asked when they differ. Inferno: all discarded, Burned', () => {
    const after = attack(flips(game('bw4-12', 'bwt-big', { energy: ['fire', 'fire', 'water'] }), false), 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'discardAttached', count: 2 });
    expect(settles(after).length).toBeGreaterThan(0);
    const inferno = attack(flips(game('bw4-20', 'bwt-big', { energy: ['fire', 'water'] }), false), 0);
    expect([ash(inferno).active!.energy.length, misty(inferno).active!.burned]).toEqual([0, true]);
  });

  it('Bared Fangs: nothing unless the Defending Pokémon has damage counters', () => {
    const s = game('bw4-30', 'bwt-big', { energy: ['water'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    misty(s).active!.damage = 10;
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it("Vengeful Wish: the damage it took during the opponent's last turn", () => {
    const s = game('bw4-35', 'bwt-big', { energy: ['water'] });
    ash(s).active!.effects = { attackedOn: { turn: 2, damage: 50, afflictions: [] } };
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it("Sniffle: Belt's base damage is 40 during the player's next turn", () => {
    let s = attack(game('bw4-36', 'bwt-big', { energy: ['water', 'water'] }), 0);
    s = act(s, 'misty', { type: 'END_TURN' });
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Brain Control: a card from the opponent\'s hand on the bottom of their deck', () => {
    const s = game('bw4-62', 'bwt-big', { energy: ['psychic'] });
    hand(s, 'misty', 'water');
    hand(s, 'misty', 'bwt-big');
    const after = attack(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'oppHandTrainer', any: true, place: 'bottom' });
    expect(settles(after).length).toBeGreaterThan(0);
  });

  it('Sand Bazooka: may move a basic Energy card to a Benched Pokémon', () => {
    const s = game('bw4-66', 'bwt-big', { energy: ['fighting', 'fighting', 'fire'], bench: ['bwt-big'] });
    const uid = ash(s).active!.energy[2]!.uid;
    expect(ash(attack(s, 0, { ownBenchSlot: 0, energyUids: [uid] })).bench[0]!.energy.map((e) => e.uid)).toEqual([uid]);
    expect(ash(attack(s, 0, { ownBenchSlot: -1 })).active!.energy).toHaveLength(3);
  });

  it('Haul In, Dark Penalty, Oracle Inflict', () => {
    const s = game('bw4-68', 'bwt-big', { energy: ['fire'] });
    expect(attack(s, 0).pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'tool', count: 2 });
    const w = game('bw4-70', 'bwt-big', { energy: ['fire'] });
    expect(misty(attack(w, 0)).active!.damage).toBe(0);
    tool(misty(w).active!, 'bw4-87');
    expect(misty(attack(w, 0)).active!.damage).toBe(90);
    const b = game('bw4-76', 'bwt-big', { energy: ['fire'] });
    hand(b, 'misty', 'water');
    hand(b, 'misty', 'water');
    expect(misty(attack(b, 0)).active!.damage).toBe(50);
  });
});

describe('Abilities', () => {
  it('Sporprise: as it evolves from the hand, may make the opponent\'s Active Pokémon Confused and Poisoned', () => {
    const s = game('bw4-8', 'bwt-big');
    const card = hand(s, 'ash', 'bw4-9');
    const after = act(s, 'ash', { type: 'EVOLVE', cardUid: card, target: 'active' });
    expect(after.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'sporprise' });
    expect(settles(after).length).toBeGreaterThan(0);
    const used = misty(resolve(after, 'ash', { count: 0 })).active!;
    expect([used.condition, !!used.poison]).toEqual(['confused', true]);
  });

  it('Blazing Mane and Reflexive Retaliation: the attacker Burned, or 2 damage counters on it', () => {
    const s = game('bwt-big', 'bw4-12', { energy: ['fire'] });
    expect(ash(attack(flips(s, false), 1)).active!.burned).toBe(true);
  });

  it('Slippery Soles: the player switches, then the opponent picks their new Active Pokémon', () => {
    const s = game('bw4-33', 'bwt-big', { bench: ['bwt-small'], oppBench: ['bwt-small', 'bw4-8'] });
    const after = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { to: 0 } });
    expect(ash(after).active!.card.defId).toBe('bwt-small');
    expect(after.pendingChoice).toMatchObject({ kind: 'switchIn', player: 'misty' });
    expect(settles(after).length).toBeGreaterThan(0);
  });

  it('Psychic Mirage: basic Psychic Energy on a Psychic Pokémon provides 2', () => {
    const attached = (bench: string[]) => {
      const s = game('bwt-psy', 'bwt-big', { bench });
      return act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: hand(s, 'ash', 'psychic'), target: 'active' });
    };
    expect(misty(attack(attached(['bw4-57']), 0)).active!.damage).toBe(30);
    expect(applyAction(attached([]), 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
  });

  it('Forewarn: one of the top 2 cards into the hand, the other stays on top', () => {
    const s = game('bw4-59', 'bwt-big');
    ash(s).deck.unshift({ uid: 'a', defId: 'water' }, { uid: 'b', defId: 'bwt-big' });
    const after = act(s, 'ash', { type: 'USE_POWER', source: 'active' });
    const done = resolve(after, 'ash', { cardUid: 'b' });
    expect([ash(done).hand.map((c) => c.uid), ash(done).deck[0]!.uid]).toEqual([['b'], 'a']);
  });

  it('Giant Fan: as it evolves, heads shuffles the chosen opponent\'s Pokémon into their deck', () => {
    const s = game('bw4-71', 'bwt-big', { oppBench: ['bwt-small'] });
    const card = hand(s, 'ash', 'bw4-72');
    let after = act(s, 'ash', { type: 'EVOLVE', cardUid: card, target: 'active' });
    after = resolve(flips(after, true), 'ash', { count: 0 });
    expect(after.pendingChoice).toMatchObject({ kind: 'oppBenchPick', purpose: 'shuffle' });
    expect(settles(after).length).toBeGreaterThan(0);
    const deck = misty(after).deck.length;
    const done = resolve(after, 'ash', { target: 0 });
    expect([misty(done).bench[0], misty(done).deck.length]).toEqual([null, deck + 1]);
  });

  it('Heal Block: no damage healed from any Pokémon', () => {
    const s = game('base1-46', 'bw4-76');
    ash(s).active!.damage = 30;
    const after = play(s, hand(s, 'ash', 'bw1-100'), { target: 'active' });
    expect(ash(after).active!.damage).toBe(30);
  });

  it('Smooth Coat: heads, no damage', () => {
    expect(misty(attack(flips(game('bwt-big', 'bw4-85', { energy: ['fire'] }), true), 1)).active!.damage).toBe(0);
  });
});

describe('Trainers and Special Energy', () => {
  it('Cilan: up to 3 basic Energy cards; Heavy Ball and Level Ball: by Retreat Cost and HP', () => {
    const s = game('bwt-big', 'bwt-big');
    ash(s).deck.unshift({ uid: 'big', defId: 'bwt-big' }, { uid: 'small', defId: 'bwt-small' }, { uid: 'w', defId: 'water' });
    expect(ash(play(s, hand(s, 'ash', 'bw4-86'))).hand.map((c) => c.uid)).toEqual(['w']);
    const options = (state: GameState) => (getPlayerView(state, 'ash').self.pendingChoice as { options: { uid: string }[] }).options.map((c) => c.uid);
    expect(ash(play(s, hand(s, 'ash', 'bw4-88'))).hand.map((c) => c.uid)).toContain('big');
    expect(options(play(s, hand(s, 'ash', 'bw4-89')))).toContain('small');
    expect(options(play(s, hand(s, 'ash', 'bw4-89')))).not.toContain('big');
  });

  it('Exp. Share: a basic Energy card from the Knocked Out Active Pokémon to the one with it attached', () => {
    const s = game('bwt-big', 'bwt-small', { energy: ['fire'], defenderEnergy: ['water', 'fire'], oppBench: ['bwt-big'] });
    tool(misty(s).bench[0]!, 'bw4-87');
    const after = attack(s, 1);
    expect(after.pendingChoice).toMatchObject({ kind: 'energyGrounding', source: 'Exp. Share', player: 'misty' });
    expect(settles(after).length).toBeGreaterThan(0);
  });

  it('Pokémon Center: 20 off a Benched Pokémon, once a turn. Skyarrow Bridge: Basic Pokémon retreat for 1 less', () => {
    const s = game('bwt-small', 'bwt-big', { bench: ['bwt-big'] });
    ash(s).bench[0]!.damage = 50;
    stadium(s, 'bw4-90');
    const after = act(s, 'ash', { type: 'USE_STADIUM' });
    expect(after.pendingChoice).toMatchObject({ kind: 'removeDamage', amount: 20, benchOnly: true });
    expect(ash(resolve(after, 'ash', { target: 0 })).bench[0]!.damage).toBe(30);
    const b = game('bwt-small', 'bwt-big', { bench: ['bwt-big'] });
    expect(applyAction(b, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(false);
    stadium(b, 'bw4-91');
    expect(applyAction(b, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] }).ok).toBe(true);
  });

  it('Prism Energy: every type on a Basic Pokémon, Colorless on an Evolved one', () => {
    const attack0 = (defId: string) => ({ name: 'x', cost: ['psychic' as const], damage: 0, text: null });
    expect(canPayCost(put('bwt-psy-basic', ['bw4-93']), attack0(''), LIB)).toBe(true);
    expect(canPayCost(put('bwt-psy', ['bw4-93']), attack0(''), LIB)).toBe(false);
  });
});
