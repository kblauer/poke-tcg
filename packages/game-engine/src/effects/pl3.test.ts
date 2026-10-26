import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { inPlayDef, retreatCost, type GameState, type InPlayPokemon, type Target } from '../index.js';
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
const pile = (k: number) => Array.from({ length: k }, () => ({ uid: `deck-${n++}`, defId: id('charmander') }));
const trainer = (cardId: string, name: string): CardDef => ({ id: cardId, kind: 'trainer', name, imageUrl: null, text: '' });
const body = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const hitter = (damage: number, extra: Partial<PokemonCardDef> = {}) => mon(`hitter-${damage}`, 'Machop', FI, 300, [['Punch', [C], damage]], extra);
const usePower = (s: GameState, source: Target, choices = {}, player = 'ash') => act(s, player, { type: 'USE_POWER', source, choices });
const decks = (s: GameState) => {
  ash(s).deck = pile(10);
  misty(s).deck = pile(10);
};
const stadium = (s: GameState, cardId: string, name: string, owner = 'misty') => {
  s.cards = { ...s.cards, [cardId]: trainer(cardId, name) };
  s.stadium = { card: { uid: `stadium-${n++}`, defId: cardId }, owner };
};

describe('Supreme Victors powers', () => {
  it('Pump Up and Gravitation: 40 more HP late in the game; 20 less for everyone', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-3', 'Drifblim FB', P, 80, [], body('Pump Up')));
    put(s, 'misty', 'active', mon('pl3-7', 'Metagross', 'metal', 130, [], { stage: 'stage2', ...body('Gravitation') }));
    put(s, 'misty', 0, mon('pl3-7', 'Metagross', 'metal', 130, [], { stage: 'stage2', ...body('Gravitation') }));
    misty(s).prizes = misty(s).prizes.slice(0, 3);
    s = endTurn(s, 'ash');
    expect([inPlayDef(s.cards, ash(s).active!).hp, inPlayDef(s.cards, misty(s).active!).hp]).toEqual([100, 110]);
  });

  it('Root Protector: 20 less from Pokémon that are not Evolved Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(50), ['fighting']);
    put(s, 'misty', 'active', mon('pl3-12', 'Swampert', W, 130, [], { stage: 'stage2', ...body('Root Protector') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Green Aroma: the Grass Pokémon have no Special Conditions and get none', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-61', 'Seviper', P, 80, [['Paralyze Poison', [C], 40]]), ['psychic']);
    put(s, 'misty', 'active', mon('grass-x', 'Tangela', G, 300, [])).condition = 'confused';
    put(s, 'misty', 0, mon('pl3-13', 'Venusaur', G, 140, [], { stage: 'stage2', ...body('Green Aroma') }));
    s = attack(flips(s, true), 0);
    expect([misty(s).active!.condition, !!misty(s).active!.poison]).toEqual([null, false]);
  });

  it('Extreme Speed and Champion\'s Room: 1 less to retreat for each Fire Energy; 1 less for a Pokémon SP', () => {
    const s = duel('charmander', 'onix');
    const arcanine = put(s, 'ash', 'active', mon('pl3-15', 'Arcanine G', F, 90, [], { retreatCost: 3, ...body('Extreme Speed') }), ['fire', 'fire']);
    expect(retreatCost(arcanine, s.cards, [ash(s), misty(s)], s.stadium?.card)).toBe(1);
    stadium(s, 'pl3-135', "Champion's Room");
    expect(retreatCost(arcanine, s.cards, [ash(s), misty(s)], s.stadium?.card)).toBe(0);
  });

  it('Compound Eyes: 30 more against a Poké-Body', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-17', 'Butterfree FB', G, 90, [['Gust', [C], 30]], body('Compound Eyes')), ['grass']);
    put(s, 'misty', 'active', mon('pl3-28', 'Exploud', C, 300, [], { stage: 'stage2', ...body('Erasing Sound') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Erasing Sound: no Weakness for its player\'s Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax', { weakness: { type: 'fighting', multiplier: 2 } }));
    put(s, 'misty', 0, mon('pl3-28', 'Exploud', C, 130, [], { stage: 'stage2', ...body('Erasing Sound') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });

  it("Darkness Restore: a Basic Pokémon from the opponent's discard pile onto their Bench", () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-29', 'Honchkrow', 'darkness', 90, [], { stage: 'stage1', ...body('Darkness Restore') }));
    misty(s).discard = [{ uid: 'c1', defId: id('charmander') }, { uid: 'w1', defId: 'water' }];
    s = usePower(s, 'active');
    expect(misty(s).bench.some((p) => p?.card.uid === 'c1')).toBe(true);
  });

  it('Marvel Shell and Marvel Eyes: nothing from attackers with powers; from Pokémon LV.X to Lunatone with Solrock', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('powered', 'Machop', FI, 300, [['Punch', [C], 30]], body('Something')), ['fighting']);
    put(s, 'misty', 'active', mon('pl3-44', 'Shedinja', G, 60, [], { stage: 'stage1', ...body('Marvel Shell') }));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    put(s, 'ash', 'active', mon('lvx', 'Machop', FI, 300, [['Punch', [C], 30]], { stage: 'levelUp' }), ['fighting']);
    put(s, 'misty', 'active', mon('pl3-32', 'Lunatone', P, 70, [], body('Marvel Eyes')));
    put(s, 'misty', 0, mon('solrock-x', 'Solrock', P, 80, []));
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Focus Wall: an attack doing 70 or more leaves it with 10 HP', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(100), ['fighting']);
    put(s, 'misty', 'active', mon('pl3-37', 'Mr. Mime', P, 70, [], body('Focus Wall')));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });

  it('Plunge: heads, the Active Pokémon\'s Energy cards to Marshtomp, which is switched in', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax'), ['water', 'fire']);
    put(s, 'ash', 0, mon('pl3-67', 'Marshtomp', W, 80, [], { stage: 'stage1', ...body('Plunge') }));
    const after = usePower(flips(s, true), 0);
    expect([inPlayDef(after.cards, ash(after).active!).name, ash(after).active!.energy.length, ash(after).bench[0]!.energy.length]).toEqual(['Marshtomp', 2, 0]);
  });

  it('Burning Spirit and Jet Shoot: 40 more to a Burned Pokémon; 40 more to Blaziken FB next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-142', 'Blaziken FB', F, 110, [['Jet Shoot', [C], 80]], { stage: 'levelUp', ...body('Burning Spirit') }), ['fire']);
    put(s, 'misty', 'active', hitter(30), ['fighting']);
    misty(s).active!.burned = true;
    decks(s);
    s = attack(s, 0);
    // 80, 40 more for Burned, then 20 from the Burn between turns.
    expect(misty(s).active!.damage).toBe(140);
    s = attack(s, 0, undefined, 'misty');
    expect(ash(s).active!.damage).toBe(70);
  });

  it('Aqua Mirage: no damage with an empty hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('pl3-SH7', 'Milotic', W, 80, [], { stage: 'stage1', ...body('Aqua Mirage') }));
    misty(s).hand = [];
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
  });

  it('Darkness Send: as Absol G levels up, 3 coins, the top cards of the opponent\'s deck into the Lost Zone', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('absol-g', 'Absol G', 'darkness', 70, []));
    decks(s);
    const lvx = hand(s, 'ash', mon('pl3-141', 'Absol G', 'darkness', 100, [], { stage: 'levelUp', ...body('Darkness Send') }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: lvx, target: 'active' });
    s = act(flips(s, true, true, false), 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(misty(s).lostZone?.length).toBe(2);
  });

  it('Energy Recycle: the turn ends; up to 3 Energy cards from the discard pile attached', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-144', 'Electivire FB', L, 120, [], { stage: 'levelUp', ...body('Energy Recycle') }));
    ash(s).discard = [{ uid: 'l1', defId: 'lightning' }, { uid: 'w1', defId: 'water' }];
    decks(s);
    s = usePower(s, 'active');
    for (const end of settles(s)) expect(end.currentPlayer).toBe('misty');
  });
});

describe('Supreme Victors attacks', () => {
  it('Doom News: Energy back to the hand; the Defending Pokémon Knocked Out at the end of the next turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-1', 'Absol G', 'darkness', 70, [['Doom News', [C], 0]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    s = attack(s, 0);
    expect(ash(s).hand.some((c) => c.defId === 'fire')).toBe(true);
    s = endTurn(s, 'misty');
    expect(misty(s).discard.some((c) => c.defId === 'big-Snorlax') || s.phase === 'promote').toBe(true);
  });

  it('Antique Magic: 3 damage counters on any Pokémon in play', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-22', 'Claydol', P, 90, [['Antique Magic', [C], 0]], { stage: 'stage1' }), ['psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    s = attack(s, 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'antiqueMagic', count: 3 });
    for (const end of settles(s, 20)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 1 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 'active' });
    expect(ash(s).active!.damage).toBe(10);
  });

  it('Hibernation Spore: Asleep, 2 coins to wake', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-38', 'Parasect', G, 80, [['Hibernation Spore', [C], 40]], { stage: 'stage1' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(flips(s, true, false), 0);
    expect(misty(s).active!.condition).toBe('asleep');
  });

  it('Hover Hit and Deep Sea Pressure: the Retreat Cost is 0, or 2 more', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-52', 'Breloom', FI, 90, [['Hover Hit', [C], 40], ['Crash Bomber', [C], 20]], { stage: 'stage1' }), ['fighting']);
    put(s, 'misty', 'active', big('Snorlax', { retreatCost: 3 }));
    s = attack(s, 0);
    expect(retreatCost(misty(s).active!, s.cards, [misty(s), ash(s)])).toBe(0);
    put(s, 'ash', 'active', mon('pl3-SH8', 'Relicanth', FI, 80, [['Deep Sea Pressure', [C], 20]]), ['fighting']);
    put(s, 'misty', 'active', big('Lapras', { retreatCost: 1 }));
    s.currentPlayer = 'ash';
    s = attack(s, 0);
    expect(retreatCost(misty(s).active!, s.cards, [misty(s), ash(s)])).toBe(3);
  });

  it('Synchro Removal: an Energy card of a type on Spinda discarded from the Defending Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-46', 'Spinda', C, 70, [['Synchro Removal', [C], 0]]), ['water']);
    put(s, 'misty', 'active', big('Snorlax'), ['fire', 'water']);
    s = attack(s, 0);
    expect(misty(s).active!.energy.map((e) => e.defId)).toEqual(['fire']);
  });

  it('Licking-Licking Heal: a basic Energy card attached, 2 damage counters off that Pokémon', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl3-30', 'Lickilicky C', C, 90, [['Licking-Licking Heal', [C], 0]]), ['fire']);
    put(s, 'ash', 0, big('Snorlax')).damage = 50;
    ash(s).hand = [{ uid: 'w1', defId: 'water' }];
    s = attack(s, 0);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).bench[0]!.energy.length, ash(s).bench[0]!.damage]).toEqual([1, 30]);
  });

  it('Dragon Intimidation: an Energy card of the attacker into the opponent\'s hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(30), ['fighting']);
    put(s, 'misty', 'active', mon('pl3-5', 'Garchomp', C, 130, [], { stage: 'stage2', ...body('Dragon Intimidation') }));
    const after = attack(s, 0);
    expect([ash(after).active!.energy.length, ash(after).hand.some((c) => c.defId === 'fighting')]).toEqual([0, true]);
  });
});

describe('Supreme Victors Trainers', () => {
  it('Battle Tower: 4 damage counters off a Pokémon levelled up from the hand', () => {
    const s = duel('charmander', 'onix');
    stadium(s, 'pl3-134', 'Battle Tower');
    put(s, 'ash', 'active', mon('absol-g', 'Absol G', 'darkness', 70, [])).damage = 50;
    const lvx = hand(s, 'ash', mon('lvx-absol', 'Absol G', 'darkness', 100, [], { stage: 'levelUp' }));
    expect(ash(act(s, 'ash', { type: 'EVOLVE', cardUid: lvx, target: 'active' })).active!.damage).toBe(10);
  });

  it("Cyrus's Initiative: for each heads, a card from the opponent's hand on the bottom of their deck", () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'pl3-137': trainer('pl3-137', "Cyrus's Initiative") };
    ash(s).hand = [{ uid: 'cyrus', defId: 'pl3-137' }];
    misty(s).hand = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }];
    s = act(flips(s, true, false), 'ash', { type: 'PLAY_TRAINER', cardUid: 'cyrus' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    expect([misty(s).hand.map((c) => c.uid), misty(s).deck.at(-1)?.uid]).toEqual([['w1'], 'f1']);
  });

  it('Night Teleporter: heads, the hand on top of the deck, then any card into the hand', () => {
    let s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'pl3-138': trainer('pl3-138', 'Night Teleporter') };
    ash(s).hand = [{ uid: 'nt', defId: 'pl3-138' }, { uid: 'w1', defId: 'water' }];
    ash(s).deck = [{ uid: 'f1', defId: 'fire' }, ...pile(3)];
    s = act(flips(s, true), 'ash', { type: 'PLAY_TRAINER', cardUid: 'nt' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    expect([ash(s).hand.map((c) => c.uid), ash(s).deck.some((c) => c.uid === 'w1')]).toEqual([['f1'], true]);
  });
});
