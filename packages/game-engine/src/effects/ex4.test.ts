import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, duel, endTurn, flips, mon, C, F, FI, G, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards[def.id] = def;
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards[def.id] = def;
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const power = (name: string) => ({ power: { name, text: '' } });
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const D = 'darkness';
const AQUA_ENERGY: CardDef = { id: 'ex4-86', kind: 'energy', name: 'Aqua Energy', imageUrl: null, energyType: 'water', amount: 2, basic: false };

describe('EX Team Magma vs Team Aqua', () => {
  it('A Pokémon of two types: Weakness to either applies (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dual', "Team Aqua's Cacturne", G, 80, [['Slash', [C], 30]], { types: [G, D] }), ['fire']);
    put(s, 'misty', 'active', big('Onix', { weakness: { type: D, multiplier: 2 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Two printed Weaknesses: either counts, doubled only once (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', big("Team Magma's Aggron", { weakness: { type: G, multiplier: 2 }, moreWeakness: [W] }));
    put(s, 'ash', 'active', mon('water-mon', 'Wailmer', W, 80, [['Splash', [C], 20]]), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    put(s, 'ash', 'active', mon('both', 'Lotad', W, 80, [['Splash', [C], 20]], { types: [W, G] }), ['fire']);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it("Power Saver: Team Aqua's Kyogre can't attack with 3 or fewer Team Aqua Pokémon in play", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex4-3', "Team Aqua's Kyogre", W, 100, [['Aqua Trip', [C], 10]], power('Power Saver')), ['water']);
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
    for (const slot of [0, 1, 2]) put(s, 'ash', slot, mon(`aqua-${slot}`, "Team Aqua's Carvanha", W, 50, []));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(true);
  });

  it('Aqua Trance: Asleep at the end of the opponent\'s next turn, if still the Active Pokémon (agreed)', () => {
    let s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex4-57', "Team Aqua's Spheal", W, 50, [['Aqua Trance', [W, C], 20]]), ['water', 'water']);
    put(s, 'misty', 'active', big('Snorlax', { retreatCost: 0 }));
    s = attack(s, 0);
    expect(misty(s).active!.condition ?? null).toBeNull();
    // The checkup right after flips to wake it: tails, it stays Asleep.
    expect(misty(endTurn(flips(s, false), 'misty')).active!.condition).toBe('asleep');
    // Benched before then: nothing happens.
    const benched = act(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: [] });
    expect(misty(endTurn(benched, 'misty')).bench[0]!.condition ?? null).toBeNull();
  });

  it('Team Play: 10 for each Team Magma Pokémon in play, both players\' (agreed)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex4-23', "Team Magma's Zangoose", C, 70, [['Call for Family', [C], 0], ['Team Play', [C, C, C], 0]]), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big("Team Magma's Rhydon"));
    put(s, 'misty', 0, mon('magma-b', "Team Magma's Baltoy", FI, 50, []));
    expect(misty(attack(s, 1)).active!.damage).toBe(30);
  });

  it("Team Aqua Schemer can't be played without a Pokémon in the hand (agreed); with one, 4 cards for a Team Aqua Pokémon", () => {
    const s = duel('charmander', 'onix');
    s.players.ash!.hand = [];
    const schemer = hand(s, 'ash', trainer('ex4-69', 'Team Aqua Schemer'));
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: schemer }).ok).toBe(false);
    const aqua = hand(s, 'ash', mon('aqua-p', "Team Aqua's Poochyena", D, 50, []));
    const before = ash(s).hand.length;
    const after = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: schemer, choices: { handUids: [aqua] } });
    expect(ash(after).hand).toHaveLength(before - 2 + 4);
  });

  it('Aqua Energy: 2 Energy, any mix of Water and Darkness (agreed); only on a Team Aqua Pokémon; discarded at the end of the turn', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex4-86'] = AQUA_ENERGY;
    put(s, 'ash', 'active', mon('aqua-dd', "Team Aqua's Mightyena", D, 70, [['Bite', [D, D], 30]]), ['ex4-86']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
    put(s, 'ash', 'active', mon('plain', 'Mightyena', D, 70, [['Bite', [D, D], 30]]));
    const uid = hand(s, 'ash', AQUA_ENERGY);
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: uid, target: 'active' }).ok).toBe(false);
  });

  it('Team Aqua Belt: between turns its owner may evolve their Active Pokémon from the deck (agreed: not automatically), then the Belt is discarded', () => {
    let s = duel('charmander', 'onix');
    const spheal = put(s, 'misty', 'active', mon('aqua-spheal', "Team Aqua's Spheal", W, 50, []));
    spheal.attached = [{ card: { uid: 'belt-1', defId: 'ex4-76' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    s.cards['ex4-76'] = trainer('ex4-76', 'Team Aqua Belt');
    s.cards['aqua-sealeo'] = mon('aqua-sealeo', "Team Aqua's Sealeo", W, 70, [], { stage: 'stage1', evolvesFrom: "Team Aqua's Spheal" });
    s.players.misty!.deck.unshift({ uid: 'sealeo-1', defId: 'aqua-sealeo' });
    s = endTurn(s, 'ash');
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'mayUse', power: 'belt' });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'sealeo-1' });
    expect(misty(s).active!.card.defId).toBe('aqua-sealeo');
    expect(misty(s).active!.attached ?? []).toHaveLength(0);
    expect(s.currentPlayer).toBe('misty');
  });

  it('Double Rainbow Energy: only on an Evolved Pokémon, and its Pokémon does 10 less damage', () => {
    const s = duel('charmander', 'onix');
    s.cards['ex4-88'] = { id: 'ex4-88', kind: 'energy', name: 'Double Rainbow Energy', imageUrl: null, energyType: 'colorless', anyType: true, amount: 2, basic: false };
    const evolved = put(s, 'ash', 'active', mon('evo', 'Charmeleon', F, 80, [['Flare', [F, F], 50]], { stage: 'stage1' }), ['ex4-88']);
    evolved.evolvedFrom = [{ uid: 'cm', defId: 'charmander' }];
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });
});
