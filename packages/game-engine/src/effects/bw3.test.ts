import { describe, expect, it } from 'vitest';
import type { CardDef, CardLibrary } from '../cards.js';
import { applyAction, getPlayerView, type GameState, type InPlayPokemon } from '../index.js';
import { act, C, CARDS, duel, F, FI, flips, G, L, mon, P, settles, W } from './test-kit.js';

// Noble Victories (README: Generation 5): its attacks, Abilities and Trainers.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

const CARD_DEFS: CardDef[] = [
  mon('bw3-3', 'Leavanny', G, 130, [['Slash', [C], 20]], { stage: 'stage2', evolvesFrom: 'Swadloon', power: { name: 'Leaf Tailor', text: '' } }),
  mon('bw3-5', 'Lilligant', G, 90, [['Aromax', [G], 0]], { stage: 'stage1', evolvesFrom: 'Petilil' }),
  mon('bw3-7', 'Karrablast', G, 60, [['Mysterious Evolution', [C], 0]]),
  mon('bw3-9', 'Escavalier', 'metal', 110, [['Slash', [C], 20]], { stage: 'stage1', evolvesFrom: 'Karrablast' }),
  mon('bw3-11', 'Shelmet', G, 60, [['Mysterious Evolution', [C], 0]]),
  mon('bw3-8', 'Karrablast', G, 60, [['Mysterious Evolution', [C], 0]]),
  mon('bw3-14', 'Victini', F, 60, [['Collect', [C], 0]], { power: { name: 'Victory Star', text: '' } }),
  mon('bw3-15', 'Victini', F, 70, [['V-create', [F, C], 100]]),
  mon('bw3-21', 'Volcarona', F, 120, [['Fiery Dance', [F], 30]], { stage: 'stage1', evolvesFrom: 'Larvesta' }),
  mon('bw3-26', 'Carracosta', W, 140, [['Hydro Pump', [W], 60]], { stage: 'stage1', evolvesFrom: 'Tirtouga', power: { name: 'Solid Rock', text: '' } }),
  mon('bw3-29', 'Vanilluxe', W, 130, [['Double Freeze', [W, C], 40]], { stage: 'stage2', evolvesFrom: 'Vanillish' }),
  mon('bw3-31', 'Jellicent', W, 100, [['Hydro Pump', [W], 40]], { stage: 'stage1', evolvesFrom: 'Frillish', power: { name: 'Cursed Body', text: '' } }),
  mon('bw3-32', 'Cryogonal', W, 90, [['Ice Shard', [W, C], 30]]),
  mon('bw3-33', 'Cryogonal', W, 90, [['Frost Vanish', [W, W], 40]]),
  mon('bw3-37', 'Emolga', L, 70, [['Electrichain', [L], 10]]),
  mon('bw3-40', 'Eelektrik', L, 90, [['Electric Ball', [L, C], 50]], { stage: 'stage1', evolvesFrom: 'Tynamo', power: { name: 'Dynamotor', text: '' } }),
  mon('bw3-46', 'Cofagrigus', P, 100, [['Damagriiigus', [P, C], 0]], { stage: 'stage1', evolvesFrom: 'Yamask' }),
  mon('bw3-47', 'Cofagrigus', P, 100, [['Hex', [P], 30]], { stage: 'stage1', evolvesFrom: 'Yamask', power: { name: 'Durable Body', text: '' } }),
  mon('bw3-56', 'Beheeyem', P, 90, [['Synchronoise', [P], 20]], { stage: 'stage1', evolvesFrom: 'Elgyem' }),
  mon('bw3-60', 'Chandelure', P, 130, [['Eerie Glow', [P], 50]], { stage: 'stage2', evolvesFrom: 'Lampent', power: { name: 'Cursed Shadow', text: '' } }),
  mon('bw3-61', 'Gigalith', FI, 150, [['Core Cannon', [FI], 0]], { stage: 'stage2', evolvesFrom: 'Boldore' }),
  mon('bw3-64', 'Conkeldurr', FI, 140, [['Hammer Arm', [FI], 30]], { stage: 'stage2', evolvesFrom: 'Gurdurr', power: { name: 'Craftsmanship', text: '' } }),
  mon('bw3-67', 'Archeops', FI, 110, [['Rock Slide', [FI], 60]], { stage: 'stage1', evolvesFrom: 'Archen', power: { name: 'Ancient Power', text: '' } }),
  mon('bw3-79', 'Hydreigon', 'darkness', 150, [['Dark Trance', [C], 0], ['Dragonblast', ['darkness', 'darkness', 'darkness', C], 140]], { stage: 'stage2', evolvesFrom: 'Zweilous', power: { name: 'Dark Aura', text: '' } }),
  mon('bw3-83', 'Durant', 'metal', 70, [['Devour', ['metal'], 0]]),
  mon('bw3-89', 'Druddigon', 'dragon', 100, [['Dragon Claw', [C], 60]], { power: { name: 'Rough Skin', text: '' } }),
  mon('bw2-5', 'Sewaddle', G, 50, [['Bug Bite', [G], 10]]),
  mon('bw2-6', 'Swadloon', G, 80, [['Leaf Shield', [G], 0]], { stage: 'stage1', evolvesFrom: 'Sewaddle' }),
  mon('bw2-14', 'Lilligant', G, 90, [['Bemusing Aroma', [G], 20]], { stage: 'stage1', evolvesFrom: 'Petilil' }),
  mon('bw2-7', 'Leavanny', G, 130, [['Nurturing', [C], 0]], { stage: 'stage2', evolvesFrom: 'Swadloon' }),
  mon('bwt-big', 'Snorlax', C, 200, [['Body Slam', [C], 100], ['Tackle', [C], 30]]),
  mon('bwt-water', 'Lapras', W, 100, [['Bubble', [W], 10]], { weakness: { type: G, multiplier: 2 } }),
  { id: 'bwt-darkness', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' },
  { id: 'bwt-metal', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal' },
  { id: 'bw3-91', kind: 'trainer', name: 'Eviolite', imageUrl: null, text: '' },
  { id: 'bw3-92', kind: 'trainer', name: 'N', imageUrl: null, text: '' },
  { id: 'bw3-94', kind: 'trainer', name: 'Rocky Helmet', imageUrl: null, text: '' },
  { id: 'bw3-95', kind: 'trainer', name: 'Super Rod', imageUrl: null, text: '' },
  { id: 'bw3-96', kind: 'trainer', name: 'Xtransceiver', imageUrl: null, text: '' },
  { id: 'bw1-101', kind: 'trainer', name: 'Professor Juniper', imageUrl: null, text: '' },
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

describe('attacks', () => {
  it('Aromax: all damage off a Benched Pokémon', () => {
    const s = game('bw3-5', 'bwt-big', { energy: ['grass'], bench: ['bwt-big'] });
    ash(s).bench[0]!.damage = 90;
    expect(ash(attack(s, 0, { ownBenchSlot: 0 })).bench[0]!.damage).toBe(0);
  });

  it("Mysterious Evolution: from the deck only with the player's Shelmet in play", () => {
    const s = game('bw3-8', 'bwt-big', { energy: ['grass'] });
    ash(s).deck.unshift({ uid: 'esc', defId: 'bw3-9' });
    expect(attack(s, 0).pendingChoice).toBeUndefined();
    ash(s).bench[0] = put('bw3-11');
    const after = attack(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'evolveFromDeck', target: 'active' });
    expect(ash(resolve(after, 'ash', { cardUid: 'esc' })).active!.card.defId).toBe('bw3-9');
  });

  it('V-create: nothing with 4 or fewer Benched Pokémon', () => {
    expect(misty(attack(game('bw3-15', 'bwt-big', { energy: ['fire', 'fire'], bench: ['bwt-big'] }), 0)).active!.damage).toBe(0);
    const full = game('bw3-15', 'bwt-big', { energy: ['fire', 'fire'], bench: ['bwt-big', 'bwt-big', 'bwt-big', 'bwt-big', 'bwt-big'] });
    expect(misty(attack(full, 0)).active!.damage).toBe(100);
  });

  it('Fiery Dance: a basic Energy card from the discard pile onto any of the player\'s Pokémon', () => {
    const s = game('bw3-21', 'bwt-big', { energy: ['fire'], bench: ['bwt-big'] });
    ash(s).discard.push({ uid: 'w', defId: 'water' });
    const after = attack(s, 0, { discardUids: ['w'], ownTarget: 0 });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual(['w']);
  });

  it('Double Freeze: 40 for each heads; any heads, Paralyzed', () => {
    const after = attack(flips(game('bw3-29', 'bwt-big', { energy: ['water', 'water'] }), true, false), 0);
    expect([misty(after).active!.damage, misty(after).active!.condition]).toEqual([40, 'paralyzed']);
  });

  it('Ice Shard: 40 more to a Fighting Pokémon. Frost Vanish: back to the hand with its cards', () => {
    expect(misty(attack(game('bw3-32', 'bw3-61', { energy: ['water', 'water'] }), 0)).active!.damage).toBe(70);
    const after = attack(game('bw3-33', 'bwt-big', { energy: ['water', 'water'], bench: ['bwt-big'] }), 0, { boost: true });
    expect(ash(after).hand.map((c) => c.defId).sort()).toEqual(['bw3-33', 'water', 'water']);
    expect(misty(after).active!.damage).toBe(40);
  });

  it('Electrichain: 20 more with a Lightning Pokémon on the Bench', () => {
    expect(misty(attack(game('bw3-37', 'bwt-big', { energy: ['lightning'], bench: ['bw3-40'] }), 0)).active!.damage).toBe(30);
    expect(misty(attack(game('bw3-37', 'bwt-big', { energy: ['lightning'], bench: ['bwt-big'] }), 0)).active!.damage).toBe(10);
  });

  it('Damagriiigus: every damage counter from a Benched Pokémon moved to the Defending Pokémon', () => {
    const s = game('bw3-46', 'bwt-big', { energy: ['psychic', 'psychic'], bench: ['bwt-big'] });
    ash(s).bench[0]!.damage = 70;
    const after = attack(s, 0, { ownBenchSlot: 0 });
    expect([ash(after).bench[0]!.damage, misty(after).active!.damage]).toEqual([0, 70]);
  });

  it('Synchronoise: 20 to each Benched Pokémon sharing a type with the Defending Pokémon', () => {
    const after = attack(game('bw3-56', 'bwt-big', { energy: ['psychic'], oppBench: ['bwt-big', 'bwt-water'] }), 0);
    expect([misty(after).bench[0]!.damage, misty(after).bench[1]!.damage]).toEqual([20, 0]);
  });

  it('Core Cannon: 20 for each Fighting Energy, to 1 of the opponent\'s Pokémon. Devour: a card for each Durant', () => {
    expect(misty(attack(game('bw3-61', 'bwt-big', { energy: ['fighting', 'fighting', 'fire'], oppBench: ['bwt-big'] }), 0, { oppTarget: 0 })).bench[0]!.damage).toBe(40);
    const s = game('bw3-83', 'bwt-big', { energy: ['bwt-metal'], bench: ['bw3-83', 'bw3-83'] });
    expect(misty(attack(s, 0)).discard.length - misty(s).discard.length).toBe(3);
  });
});

describe('Abilities', () => {
  it('Leaf Tailor: no Weakness for its player\'s Pokémon with Energy attached', () => {
    const s = game('bw2-5', 'bwt-water', { energy: ['grass'], defenderEnergy: ['water'], oppBench: ['bw3-3'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
    misty(s).active!.energy = [];
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it("Victory Star: an attack's coins flipped again, once a turn", () => {
    const s = game('bw2-14', 'bwt-big', { energy: ['grass'], bench: ['bw3-14', 'bw3-14'] });
    const after = attack(flips(s, false), 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'reflip', source: 'Victory Star' });
    expect(settles(after).length).toBeGreaterThan(0);
    const again = resolve(after, 'ash', { count: 1 });
    expect(again.pendingChoice).toBeUndefined();
    expect(ash(again).powerTurns?.['Victory Star']).toBe(3);
    expect(resolve(after, 'ash', { count: 0 }).pendingChoice).toBeUndefined();
  });

  it('Solid Rock: heads, 50 less; Durable Body: heads, 10 HP left', () => {
    expect(misty(attack(flips(game('bwt-big', 'bw3-26', { energy: ['fire'] }), true), 0)).active!.damage).toBe(50);
    const s = game('bwt-big', 'bw3-47', { energy: ['fire'] });
    misty(s).active!.damage = 50;
    expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(90);
  });

  it('Cursed Body and Rough Skin: the attacker Confused, or 2 damage counters on it, only from the Active Spot', () => {
    expect(ash(attack(game('bwt-big', 'bw3-31', { energy: ['fire'] }), 1)).active!.condition).toBe('confused');
    expect(ash(attack(game('bwt-big', 'bw3-89', { energy: ['fire'] }), 1)).active!.damage).toBe(20);
  });

  it('Dynamotor: a Lightning Energy card from the discard pile onto a Benched Pokémon, once a turn', () => {
    const s = game('bw3-40', 'bwt-big', { bench: ['bwt-big'] });
    ash(s).discard.push({ uid: 'l1', defId: 'lightning' }, { uid: 'l2', defId: 'lightning' });
    const after = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { cardUid: 'l1', to: 0 } });
    expect(ash(after).bench[0]!.energy.map((e) => e.uid)).toEqual(['l1']);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active', choices: { cardUid: 'l2', to: 0 } }).ok).toBe(false);
  });

  it('Cursed Shadow: 3 damage counters on the opponent\'s Pokémon, from the Active Spot', () => {
    const after = act(game('bw3-60', 'bwt-big', { oppBench: ['bwt-big'] }), 'ash', { type: 'USE_POWER', source: 'active' });
    expect(after.pendingChoice).toMatchObject({ kind: 'placeCounters', count: 3 });
    expect(settles(after).length).toBeGreaterThan(0);
  });

  it('Craftsmanship: 20 more HP for each Fighting Energy attached', () => {
    const after = attack(game('bwt-big', 'bw3-64', { energy: ['fire'], defenderEnergy: ['fighting', 'fighting'] }), 1);
    expect(misty(after).active!.hpPlus).toBe(40);
  });

  it('Ancient Power: no evolving from the hand, either player\'s; evolving from the deck still works', () => {
    const s = game('bw2-7', 'bw3-67', { energy: ['grass'], bench: ['bw2-5'] });
    const swadloon = hand(s, 'ash', 'bw2-6');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: swadloon, target: 0 }).ok).toBe(false);
    ash(s).deck.unshift({ uid: 'deck-swadloon', defId: 'bw2-6' });
    expect(attack(s, 0, { ownTarget: 0 }).pendingChoice).toMatchObject({ kind: 'evolveFromDeck' });
  });

  it('Dark Aura: all its Energy is Darkness Energy', () => {
    expect(misty(attack(game('bw3-79', 'bwt-big', { energy: ['fire', 'water', 'grass', 'lightning'] }), 1)).active!.damage).toBe(140);
  });
});

describe('Trainers', () => {
  it('Eviolite: 20 less damage to a Basic Pokémon; Rocky Helmet: 2 damage counters on the attacker', () => {
    const s = game('bwt-big', 'bwt-big', { energy: ['fire'] });
    tool(misty(s).active!, 'bw3-91');
    expect(misty(attack(s, 1)).active!.damage).toBe(10);
    const t = game('bwt-big', 'bwt-big', { energy: ['fire'] });
    tool(misty(t).active!, 'bw3-94');
    expect(ash(attack(t, 1)).active!.damage).toBe(20);
  });

  it("N: each player's hand shuffled away, then a card drawn for each Prize card left", () => {
    const s = game('bwt-big', 'bwt-big');
    for (let i = 0; i < 5; i++) hand(s, 'misty', 'water');
    misty(s).prizes.splice(0, 4);
    const after = play(s, hand(s, 'ash', 'bw3-92'));
    expect([ash(after).hand.length, misty(after).hand.length]).toEqual([ash(s).prizes.length, 2]);
  });

  it('Super Rod: up to 3 Pokémon and basic Energy cards shuffled back. Xtransceiver: heads, a Supporter', () => {
    const s = game('bwt-big', 'bwt-big');
    ash(s).discard.push({ uid: 'a', defId: 'water' }, { uid: 'b', defId: 'bwt-big' }, { uid: 'c', defId: 'fire' }, { uid: 'd', defId: 'grass' });
    const after = play(s, hand(s, 'ash', 'bw3-95'));
    expect(after.pendingChoice).toMatchObject({ kind: 'discardToDeck', count: 3 });
    expect(settles(after).length).toBeGreaterThan(0);
    const t = game('bwt-big', 'bwt-big');
    ash(t).deck.unshift({ uid: 'jun', defId: 'bw1-101' });
    const searched = play(flips(t, true), hand(t, 'ash', 'bw3-96'));
    expect(ash(searched).hand.map((c) => c.uid)).toEqual(['jun']);
  });
});
