import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import type { GameState, InPlayPokemon, Target } from '../index.js';
import { act, attack, duel, endTurn, flips, id, mon, settles, C, F, FI, G, L, P, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards = { ...s.cards, [def.id]: def };
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards = { ...s.cards, [def.id]: def };
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}
const pile = (s: GameState, player: string, k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const usePower = (s: GameState, source: Target, choices = {}) => act(s, 'ash', { type: 'USE_POWER', source, choices });

describe('Secret Wonders attacks', () => {
  it('Blast Burn: heads discards 2 Energy cards for 120; without the cards it does nothing', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-3', 'Charizard', F, 130, [['Blast Burn', [C], 120]], { stage: 'stage2' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const hit = attack(flips(s, true), 0);
    expect([misty(hit).active!.damage, ash(hit).active!.energy.length]).toEqual([120, 1]);
    const missed = attack(flips(s, false), 0);
    expect([misty(missed).active!.damage, ash(missed).active!.energy.length]).toEqual([0, 3]);
  });

  it('Psychic Cut: 20 more for each Prize card turned face up', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-6', 'Gallade', FI, 130, [['Sonic Blade', [C], 0], ['Psychic Cut', [C], 60]], { stage: 'stage2' }), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    ash(s).prizes = pile(s, 'ash', 6);
    const after = attack(s, 1, { amount: 2 });
    expect([misty(after).active!.damage, ash(after).faceUpPrizes?.length]).toEqual([100, 2]);
  });

  it('Sonic Blade: the Defending Pokémon left with 50 HP, then the opponent switches', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-6', 'Gallade', FI, 130, [['Sonic Blade', [C], 0]], { stage: 'stage2' }), ['psychic']);
    const snorlax = put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    const after = attack(s, 0);
    expect([misty(after).active!.card.uid, misty(after).bench[0]!.card.uid, misty(after).bench[0]!.damage]).toEqual([misty(s).bench[0]!.card.uid, snorlax.card.uid, 250]);
  });

  it('Ghost Head: as many damage counters on the Defending Pokémon as on Banette', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-23', 'Banette', P, 80, [['Ghost Head', [], 0]], { stage: 'stage1' }));
    put(s, 'misty', 'active', big('Snorlax'));
    const after = attack(s, 0, { amount: 3 });
    expect([ash(after).active!.damage, misty(after).active!.damage]).toEqual([30, 30]);
  });

  it("Re-creation: an attack of a Pokémon in the opponent's discard pile", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-15', 'Mew', P, 60, [['Psychic Balance', [], 0], ['Re-creation', [C], 0]]), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    const donor = mon('donor', 'Rhydon', FI, 100, [['Horn Drill', [C, C, C, C], 70]]);
    s.cards = { ...s.cards, donor };
    misty(s).discard.push({ uid: 'donor-1', defId: 'donor' });
    expect(misty(attack(s, 1, { oppDiscardUid: 'donor-1', amount: 0 })).active!.damage).toBe(70);
  });

  it("Dig Trap: heads, Dugtrio protected and 6 damage counters on one of the opponent's Benched Pokémon after their turn", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-24', 'Dugtrio', FI, 90, [['Dig Trap', [C], 0]], { stage: 'stage1' }), ['fighting']);
    put(s, 'misty', 'active', mon('punch', 'Machop', FI, 60, [['Punch', [C], 50]]), ['fighting']);
    const lapras = put(s, 'misty', 0, big('Lapras'));
    misty(s).deck = pile(s, 'misty', 5);
    ash(s).deck = pile(s, 'ash', 5);
    s = attack(flips(s, true), 0);
    s = attack(s, 0, undefined, 'misty');
    expect(ash(s).active!.damage).toBe(0);
    const asked = s.pendingChoice ? s : endTurn(s, 'misty');
    expect(asked.pendingChoice).toMatchObject({ player: 'ash', kind: 'placeCounters' });
    for (const end of settles(asked)) expect(lapras.damage + (misty(end).bench[0]?.damage ?? 0)).toBe(60);
  });

  it('Spine Missile: 20 for each heads to the Pokémon picked in order', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-47', 'Cloyster', W, 80, [['Spine Missile', [C], 0]], { stage: 'stage1' }), ['water']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    const after = attack(flips(s, true, true, true, false), 0, { benchSlots: [0, 0, -1, -1] });
    expect([misty(after).bench[0]!.damage, misty(after).active!.damage]).toEqual([40, 20]);
  });

  it('Bring Down: the Pokémon with the fewest HP left is Knocked Out', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-131', 'Gardevoir', P, 130, [['Bring Down', [C], 0]], { stage: 'levelUp' }), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    const weak = put(s, 'misty', 0, mon('weak', 'Caterpie', G, 40, []));
    weak.damage = 20;
    const after = attack(s, 0);
    expect(misty(after).bench[0]?.card.uid).not.toBe(weak.card.uid);
  });
});

describe('Secret Wonders powers', () => {
  it('Miracle Aroma: heads, the player picks Asleep, Burned or Poisoned for the Defending Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-20', 'Venusaur', G, 130, [], { stage: 'stage2', ...body('Miracle Aroma') }));
    put(s, 'misty', 'active', big('Snorlax'));
    const asked = usePower(flips(s, true), 'active');
    expect(asked.pendingChoice).toMatchObject({ kind: 'chooseCondition' });
    expect(misty(act(asked, 'ash', { type: 'RESOLVE_CHOICE', count: 1 })).active!.burned).toBe(true);
    for (const end of settles(asked)) expect(end.pendingChoice).toBeUndefined();
  });

  it('NOD: the opponent takes a Prize card and so does the player, or the player draws', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'));
    put(s, 'ash', 0, mon('dp3-69', 'Unown N', P, 50, [], body('NOD')));
    put(s, 'ash', 1, mon('dp3-70', 'Unown O', P, 50, [], body('ONE')));
    put(s, 'ash', 2, mon('unown-d', 'Unown D', P, 50, []));
    ash(s).prizes = pile(s, 'ash', 6);
    misty(s).prizes = pile(s, 'misty', 6);
    ash(s).deck = pile(s, 'ash', 5);
    const asked = usePower(s, 0);
    expect(asked.pendingChoice).toMatchObject({ kind: 'nod', player: 'misty' });
    const took = act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: 0 });
    expect([ash(took).prizes.length, misty(took).prizes.length]).toEqual([5, 5]);
    const drew = act(asked, 'misty', { type: 'RESOLVE_CHOICE', count: 1 });
    expect(ash(drew).hand.length).toBe(ash(s).hand.length + 1);
    for (const end of settles(asked)) expect(end.pendingChoice).toBeUndefined();
  });

  it('Psychic Shift: from the Bench, the Active Pokémon\'s Special Condition goes to the Defending Pokémon', () => {
    const s = duel('charmander', 'onix');
    const active = put(s, 'ash', 'active', big('Snorlax'));
    active.poison = 10;
    put(s, 'ash', 0, mon('dp3-44', 'Xatu', P, 80, [], { stage: 'stage1', ...body('Psychic Shift') }));
    put(s, 'misty', 'active', big('Lapras'));
    const asked = usePower(s, 0);
    for (const end of settles(asked)) {
      expect(end.pendingChoice).toBeUndefined();
      expect([ash(end).active!.poison ?? 0, misty(end).active!.poison ?? 0]).toEqual([0, 10]);
    }
  });

  it('Minus Charge: only after one of the player\'s Pokémon was Knocked Out last turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-32', 'Minun', L, 60, [], body('Minus Charge')));
    ash(s).deck = pile(s, 'ash', 5);
    expect(() => usePower(s, 'active')).toThrow(/Knocked Out/);
    ash(s).knockedOutTurn = s.turn - 1;
    expect(ash(usePower(s, 'active')).hand.length).toBe(ash(s).hand.length + 2);
  });

  it('Osmosis: up to 3 damage counters moved to Gastrodon West Sea', () => {
    const s = duel('charmander', 'onix');
    const east = put(s, 'ash', 'active', mon('dp3-8', 'Gastrodon East Sea', W, 100, [], { stage: 'stage1', ...body('Osmosis') }));
    east.damage = 50;
    put(s, 'ash', 0, mon('dp3-9', 'Gastrodon West Sea', FI, 100, [], { stage: 'stage1' }));
    const after = usePower(s, 'active', { to: 0 });
    expect([ash(after).active!.damage, ash(after).bench[0]!.damage]).toEqual([20, 30]);
  });

  it('Teleportation: Gardevoir LV.X switched with a Benched Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-131', 'Gardevoir', P, 130, [], { stage: 'levelUp', ...body('Teleportation') }));
    const snorlax = put(s, 'ash', 0, big('Snorlax'));
    expect(ash(usePower(s, 'active', { to: 0 })).active!.card.uid).toBe(snorlax.card.uid);
  });

  it('Waterlog: basic Water Energy cards to any of the Pokémon, then the turn ends', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-2', 'Blastoise', W, 120, [], { stage: 'stage2', ...body('Waterlog') }));
    put(s, 'ash', 0, big('Lapras'));
    ash(s).hand = [];
    hand(s, 'ash', s.cards.water!);
    hand(s, 'ash', s.cards.water!);
    misty(s).deck = pile(s, 'misty', 5);
    s = usePower(s, 'active');
    expect(s.pendingChoice).toMatchObject({ kind: 'attachFromHand', source: 'Waterlog' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    const [first, second] = ash(s).hand;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: first!.uid });
    if (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    if (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: second!.uid });
    if (s.pendingChoice) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(s.currentPlayer).toBe('misty');
    expect(ash(s).bench[0]!.energy.length + ash(s).active!.energy.length).toBe(2);
  });

  it('Toxic Sludge: between turns, the opponent\'s Active Pokémon with Grass Energy is Poisoned', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('dp3-56', 'Muk', P, 80, [], { stage: 'stage1', ...body('Toxic Sludge') }));
    put(s, 'misty', 'active', big('Bulbasaur'), ['grass']);
    misty(s).deck = pile(s, 'misty', 5);
    s = endTurn(s, 'ash');
    expect(misty(s).active!.poison).toBe(10);
  });

  it('Dangerous Scales: damaged as the Active Pokémon, the Attacking Pokémon is Asleep and Poisoned', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('puncher', 'Machop', FI, 60, [['Punch', [C], 20]]), ['fighting']);
    put(s, 'misty', 'active', mon('dp3-73', 'Venomoth', G, 80, [], { stage: 'stage1', ...body('Dangerous Scales') }));
    // Tails on the Sleep flip between turns: still Asleep.
    const after = attack(flips(s, false), 0);
    expect([ash(after).active!.condition, ash(after).active!.poison]).toEqual(['asleep', 10]);
  });

  it('Flame Dash and Aqua Recovery are asked as they come into play, and always end', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['fire']);
    put(s, 'ash', 0, mon('growlithe', 'Growlithe', F, 60, []));
    const arcanine = hand(s, 'ash', mon('dp3-22', 'Arcanine', F, 100, [], { stage: 'stage1', evolvesFrom: 'Growlithe', ...body('Flame Dash') }));
    const dashed = act(s, 'ash', { type: 'EVOLVE', cardUid: arcanine, target: 0 });
    expect(dashed.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'flameDash' });
    for (const end of settles(dashed)) expect(end.pendingChoice).toBeUndefined();
    const suicune = hand(s, 'ash', mon('dp3-19', 'Suicune', W, 70, [], body('Aqua Recovery')));
    ash(s).discard.push({ uid: 'lapras-d', defId: 'big-Lapras' });
    s.cards = { ...s.cards, 'big-Lapras': big('Lapras', { type: W }) };
    const benched = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: suicune, slot: 1 });
    expect(benched.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'aquaRecovery' });
    for (const end of settles(benched)) expect(end.pendingChoice).toBeUndefined();
  });
});

describe('Secret Wonders Trainers', () => {
  it("Professor Oak's Visit: 3 cards drawn, then one from the hand on the bottom of the deck", () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    ash(s).deck = pile(s, 'ash', 6);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp3-122', "Professor Oak's Visit")) });
    expect(s.pendingChoice).toMatchObject({ kind: 'handToDeck', bottom: true });
    const card = ash(s).hand[0]!;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: card.uid });
    expect([ash(s).hand.length, ash(s).deck.at(-1)?.uid]).toEqual([2, card.uid]);
  });

  it("Team Galactic's Mars: 2 cards drawn, then a card from the opponent's hand on the bottom of their deck", () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [];
    ash(s).deck = pile(s, 'ash', 6);
    misty(s).hand = pile(s, 'misty', 3);
    misty(s).deck = pile(s, 'misty', 3);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp3-126', "Team Galactic's Mars")) });
    expect([ash(s).hand.length, misty(s).hand.length, misty(s).deck.length]).toEqual([2, 2, 4]);
  });

  it("Roseanne's Research: Basic Pokémon and basic Energy cards from the deck", () => {
    let s = duel('charmander', 'onix');
    ash(s).deck = [...pile(s, 'ash', 2), { uid: 'w', defId: 'water' }, { uid: 'pp', defId: 'dp1-109' }];
    s.cards = { ...s.cards, 'dp1-109': trainer('dp1-109', 'PlusPower') };
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: hand(s, 'ash', trainer('dp3-125', "Roseanne's Research")) });
    expect(s.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'basicOrBasicEnergy' });
    for (const end of settles(s)) expect(ash(end).hand.some((c) => c.uid === 'pp')).toBe(false);
  });
});
