import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, type GameState, type InPlayPokemon, type Target } from '../index.js';
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
const stadium = (s: GameState, cardId: string, name: string) => {
  s.cards = { ...s.cards, [cardId]: trainer(cardId, name) };
  s.stadium = { card: { uid: `stadium-${n++}`, defId: cardId }, owner: 'misty' };
};

describe('Platinum powers', () => {
  it('Damage Bind: a Pokémon with damage counters can use no Poké-Powers', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('pl1-1', 'Ampharos', L, 130, [], { stage: 'stage2', ...body('Damage Bind') }));
    put(s, 'ash', 'active', mon('pl1-3', 'Blaziken', F, 130, [], { stage: 'stage2', ...body('Fire Breath') }));
    const burned = usePower(s, 'active');
    expect(misty(burned).active!.burned).toBe(true);
    ash(s).active!.damage = 10;
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });

  it('Time Crystal: only Pokémon SP can use Poké-Bodies', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('pl1-122', 'Dialga G', 'metal', 120, [], { stage: 'levelUp', ...body('Time Crystal') }));
    const zangoose = put(s, 'ash', 'active', mon('pl1-66', 'Zangoose', C, 80, [], body('Thick Skin')));
    put(s, 'ash', 0, mon('pl1-1', 'Ampharos', L, 130, [], { stage: 'stage2', ...body('Damage Bind') }));
    // Thick Skin is off, so Zangoose can be Poisoned.
    put(s, 'misty', 0, mon('pl1-94', 'Skuntank G', P, 80, [], body('Poison Structure')));
    misty(s).active = misty(s).bench[0]!;
    misty(s).bench[0] = null;
    put(s, 'misty', 1, mon('pl1-122', 'Dialga G', 'metal', 120, [], { stage: 'levelUp', ...body('Time Crystal') }));
    stadium(s, 'pl1-104', 'Broken Time-Space');
    s.currentPlayer = 'misty';
    const after = usePower(s, 'active', {}, 'misty');
    expect(!!ash(after).active!.poison).toBe(true);
    expect(zangoose).toBeDefined();
  });

  it('Dig Well: Water Energy cards among the top 3 attached, the rest discarded', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-2', 'Blastoise', W, 130, [], { stage: 'stage2', ...body('Dig Well') }));
    put(s, 'ash', 0, big('Snorlax'));
    ash(s).deck = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }, { uid: 'w2', defId: 'water' }, ...pile(3)];
    s = usePower(s, 'active');
    expect(s.pendingChoice).toMatchObject({ kind: 'distributeEnergy' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    for (const end of settles(s)) {
      expect(ash(end).discard.map((c) => c.uid)).toEqual(['f1']);
      expect(ash(end).active!.energy.length + ash(end).bench[0]!.energy.length).toBe(2);
    }
  });

  it('Power Circulation: up to 2 basic Energy cards on top of the deck in any order, 2 damage counters on Delcatty', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-4', 'Delcatty', C, 90, [], { stage: 'stage1', ...body('Power Circulation') }));
    ash(s).discard = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }, { uid: 'g1', defId: 'grass' }];
    s = usePower(s, 'active');
    expect([s.pendingChoice?.kind, ash(s).active!.damage]).toEqual(['discardToDeck', 20]);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    expect(s.pendingChoice).toMatchObject({ kind: 'arrangeTop', count: 2 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', order: ['f1', 'w1'] });
    expect([ash(s).deck.slice(0, 2).map((c) => c.uid), ash(s).discard.map((c) => c.uid)]).toEqual([['f1', 'w1'], ['g1']]);
  });

  it('Reverse Time: benched from the hand, up to 3 Pokémon and basic Energy cards on top of the deck', () => {
    let s = duel('charmander', 'onix');
    ash(s).discard = [{ uid: 'w1', defId: 'water' }, { uid: 'c1', defId: id('charmander') }];
    const dialga = hand(s, 'ash', mon('pl1-5', 'Dialga', 'metal', 100, [], body('Reverse Time')));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: dialga, slot: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'mayUse', power: 'reverseTime' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'c1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', order: ['c1', 'w1'] });
    expect(ash(s).deck.slice(0, 2).map((c) => c.uid)).toEqual(['c1', 'w1']);
  });

  it('Time Aura: the opponent can\'t evolve their Active Pokémon from the hand', () => {
    const s = duel('charmander', 'onix');
    put(s, 'misty', 'active', mon('pl1-6', 'Dialga', 'metal', 100, [], body('Time Aura')));
    const charmeleon = hand(s, 'ash', mon('charmeleon-x', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: charmeleon, target: 'active' })).toMatchObject({ ok: false, error: expect.stringMatching(/Time Aura/) });
  });

  it('Let Loose: each player shuffles their hand away and draws up to 4, the player first', () => {
    let s = duel('charmander', 'onix');
    decks(s);
    misty(s).hand = pile(7);
    const giratina = hand(s, 'ash', mon('pl1-9', 'Giratina', P, 100, [], body('Let Loose')));
    s = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: giratina, slot: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
    expect(s.pendingChoice).toMatchObject({ kind: 'drawCount', player: 'ash', max: 4 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 4 });
    expect(s.pendingChoice).toMatchObject({ kind: 'drawCount', player: 'misty', max: 4 });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 4 });
    expect([ash(s).hand.length, misty(s).hand.length]).toEqual([4, 4]);
  });

  it('Electric Barrier: no attack damage to the Benched Pokémon but Manectric', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-10', 'Giratina', P, 100, [['Over Slash', [C, C], 0]]), ['psychic', 'psychic']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, mon('pl1-11', 'Manectric', L, 90, [], { stage: 'stage1', ...body('Electric Barrier') }));
    put(s, 'misty', 1, big('Lapras'));
    const after = attack(s, 0);
    expect([misty(after).active!.damage, misty(after).bench[0]!.damage, misty(after).bench[1]!.damage]).toEqual([10, 10, 0]);
  });

  it('Lazy Paunch: Slaking can\'t attack the turn after it attacked', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-16', 'Slaking', C, 150, [['Punch', [C], 10]], { stage: 'stage2', ...body('Lazy Paunch') }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = attack(s, 0);
    s = endTurn(s, 'misty');
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 })).toMatchObject({ ok: false, error: expect.stringMatching(/Lazy Paunch/) });
  });

  it('Temper Tantrum: cards discarded one at a time, a damage counter for each', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-19', 'Banette', P, 90, [], { stage: 'stage1', ...body('Temper Tantrum') }));
    ash(s).hand = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }, { uid: 'g1', defId: 'grass' }];
    s = usePower(s, 'active');
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'f1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect([ash(s).hand.map((c) => c.uid), ash(s).active!.damage, s.pendingChoice]).toEqual([['g1'], 20, undefined]);
  });

  it('Nurse Call: a card discarded, 2 damage counters off; one Nurse Call a turn', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-22', 'Blissey', C, 120, [], { stage: 'stage1', ...body('Nurse Call') })).damage = 50;
    put(s, 'ash', 0, mon('pl1-22', 'Blissey', C, 120, [], { stage: 'stage1', ...body('Nurse Call') }));
    ash(s).hand = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }];
    const after = usePower(s, 'active', { cardUid: 'w1', to: 'active' });
    expect(ash(after).active!.damage).toBe(30);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 0, choices: { cardUid: 'f1', to: 'active' } })).toMatchObject({ ok: false, error: expect.stringMatching(/Nurse Call/) });
  });

  it('Sinkhole: 2 damage counters on the opponent\'s Pokémon that retreats', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', big('Snorlax', { retreatCost: 0 }));
    put(s, 'ash', 0, big('Lapras'));
    put(s, 'misty', 0, mon('pl1-24', 'Dugtrio', FI, 90, [], { stage: 'stage1', ...body('Sinkhole') }));
    const after = act(s, 'ash', { type: 'RETREAT', slot: 0, energyUids: [] });
    expect(ash(after).bench[0]!.damage).toBe(20);
  });

  it('Camouflage Pattern: nothing from an attacker with 2 Special Conditions', () => {
    const s = duel('charmander', 'onix');
    const machop = put(s, 'ash', 'active', hitter(30), ['fighting']);
    machop.poison = 10;
    machop.burned = true;
    put(s, 'misty', 'active', mon('pl1-25', 'Dustox', P, 130, [], { stage: 'stage2', ...body('Camouflage Pattern') }));
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(0);
  });

  it('Galactic Switch: an Energy card from a Pokémon SP to another Pokémon, 2 damage counters on Bronzong G', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('weavile-g', 'Weavile G', 'darkness', 80, []), ['fire']);
    put(s, 'ash', 0, mon('pl1-41', 'Bronzong G', 'metal', 90, [], body('Galactic Switch')));
    const fire = ash(s).active!.energy[0]!.uid;
    const after = usePower(s, 0, { from: 'active', energyUid: fire, to: 0 });
    expect([ash(after).bench[0]!.energy.map((e) => e.uid), ash(after).bench[0]!.damage]).toEqual([[fire], 20]);
  });

  it('Cold Feet: with a Special Condition, no Energy needed', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-54', 'Mightyena', 'darkness', 90, [['Bite', [C, C], 40]], { stage: 'stage1', ...body('Cold Feet') }));
    put(s, 'misty', 'active', big('Snorlax'));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
    ash(s).active!.poison = 10;
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Lost Cyclone: each player with 4 or more Benched Pokémon keeps 3, the rest to the Lost Zone', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-125', 'Palkia G', W, 120, [], { stage: 'levelUp', ...body('Lost Cyclone') }));
    for (const i of [0, 1, 2, 3]) put(s, 'ash', i, big(`Mine${i}`));
    for (const i of [0, 1, 2, 3, 4]) put(s, 'misty', i, big(`Theirs${i}`));
    s = usePower(s, 'active');
    expect(s.pendingChoice).toMatchObject({ kind: 'lostCyclone', player: 'ash' });
    for (const t of [0, 1, 2]) s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: t });
    expect(s.pendingChoice).toMatchObject({ kind: 'lostCyclone', player: 'misty' });
    for (const end of settles(s)) expect([ash(end).bench.filter(Boolean).length, misty(end).bench.filter(Boolean).length, misty(end).lostZone?.length]).toEqual([3, 3, 2]);
  });

  it('Thankfulness: Grass Pokémon but Shaymin get 40 more HP', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-126', 'Shaymin', G, 100, [], { stage: 'levelUp', ...body('Thankfulness') }));
    const tangela = put(s, 'ash', 0, mon('tangela', 'Tangela', G, 80, []));
    put(s, 'ash', 1, mon('pl1-126', 'Shaymin', G, 100, [], { stage: 'levelUp', ...body('Thankfulness') }));
    const after = endTurn(s, 'ash');
    expect([inPlayDef(after.cards, ash(after).bench[0]!).hp, ash(after).active!.hpPlus ?? 0]).toEqual([120, 0]);
    expect(tangela).toBeDefined();
  });

  it('Armor Stone: coins until tails, 10 less damage for each heads', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(40), ['fighting']);
    s.cards = { ...s.cards, 'pl1-119': mon('pl1-119', 'Armor Fossil', C, 50, [], { trainerText: 'x', ...body('Armor Stone') }) };
    put(s, 'misty', 'active', s.cards['pl1-119'] as PokemonCardDef);
    const after = attack(flips(s, true, true, false), 0);
    expect(misty(after).active!.damage).toBe(20);
  });

  it('Skull Stone: Knocked Out, coins until tails, a damage counter on the attacker for each heads', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', hitter(60), ['fighting']);
    s.cards = { ...s.cards, 'pl1-120': mon('pl1-120', 'Skull Fossil', C, 50, [], { trainerText: 'x', ...body('Skull Stone') }) };
    put(s, 'misty', 'active', s.cards['pl1-120'] as PokemonCardDef);
    put(s, 'misty', 0, big('Snorlax'));
    const after = attack(flips(s, true, true, false), 0);
    expect(ash(after).active!.damage).toBe(20);
  });

  it('Tri-Poison: heads, Poisoned with 3 damage counters between turns', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-123', 'Drapion', 'darkness', 130, [], { stage: 'levelUp', ...body('Tri-Poison') }));
    put(s, 'misty', 'active', big('Snorlax'));
    const after = usePower(flips(s, true), 'active');
    expect(misty(after).active!.poison).toBe(30);
  });

  it('Cheerful Voice: the turn ends; next turn Ludicolo\'s attacks do 60 more', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-34', 'Ludicolo', G, 120, [['Mad Dance', [C], 20]], { stage: 'stage2', ...body('Cheerful Voice') }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    decks(s);
    s = usePower(s, 'active');
    expect(s.currentPlayer).toBe('misty');
    s = endTurn(s, 'misty');
    expect(misty(attack(s, 0)).active!.damage).toBe(80);
  });
});

describe('Platinum Trainers', () => {
  it('Power Spray: with 3 Pokémon SP in play, played from the hand to stop a Poké-Power', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-3', 'Blaziken', F, 130, [], { stage: 'stage2', ...body('Fire Breath') }));
    for (const t of ['active', 0, 1] as Target[]) put(s, 'misty', t, mon(`sp-${t}`, 'Crobat G', P, 80, []));
    s.cards = { ...s.cards, 'pl1-117': trainer('pl1-117', "Team Galactic's Invention G-103 Power Spray") };
    misty(s).hand = [{ uid: 'spray', defId: 'pl1-117' }];
    s = usePower(s, 'active');
    expect(s.pendingChoice).toMatchObject({ kind: 'powerCancel', player: 'misty', spray: true });
    const passed = act(s, 'misty', { type: 'RESOLVE_CHOICE' });
    expect(misty(passed).active!.burned).toBe(true);
    const sprayed = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'spray' });
    expect([misty(sprayed).active!.burned, misty(sprayed).discard.map((c) => c.uid), ash(sprayed).active!.powerUsedTurn]).toEqual([undefined, ['spray'], sprayed.turn]);
  });

  it('Broken Time-Space: a Pokémon evolved this turn may evolve again', () => {
    let s = duel('charmander', 'onix');
    const charmeleon = hand(s, 'ash', mon('charmeleon-x', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    const charizard = hand(s, 'ash', mon('charizard-x', 'Charizard', F, 120, [], { stage: 'stage2', evolvesFrom: 'Charmeleon' }));
    s = act(s, 'ash', { type: 'EVOLVE', cardUid: charmeleon, target: 'active' });
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: charizard, target: 'active' }).ok).toBe(false);
    stadium(s, 'pl1-104', 'Broken Time-Space');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: charizard, target: 'active' }).ok).toBe(true);
  });

  it('Galactic HQ: 2 damage counters on a Pokémon evolved from the hand', () => {
    const s = duel('charmander', 'onix');
    stadium(s, 'pl1-106', 'Galactic HQ');
    const charmeleon = hand(s, 'ash', mon('charmeleon-x', 'Charmeleon', F, 80, [], { stage: 'stage1', evolvesFrom: 'Charmander' }));
    expect(ash(act(s, 'ash', { type: 'EVOLVE', cardUid: charmeleon, target: 'active' })).active!.damage).toBe(20);
  });

  it('Miasma Valley: 2 damage counters on a Basic Pokémon benched from the hand, but Grass and Psychic', () => {
    const s = duel('charmander', 'onix');
    stadium(s, 'pl1-111', 'Miasma Valley');
    const vulpix = hand(s, 'ash', mon('vulpix-x', 'Vulpix', F, 50, []));
    const oddish = hand(s, 'ash', mon('oddish-x', 'Oddish', G, 50, []));
    let after = act(s, 'ash', { type: 'PLAY_BENCH', cardUid: vulpix, slot: 0 });
    after = act(after, 'ash', { type: 'PLAY_BENCH', cardUid: oddish, slot: 1 });
    expect([ash(after).bench[0]!.damage, ash(after).bench[1]!.damage]).toEqual([20, 0]);
  });

  it("Energy Gain: a Pokémon SP's attacks cost 1 Colorless less", () => {
    const s = duel('charmander', 'onix');
    const weavile = put(s, 'ash', 'active', mon('weavile-g', 'Weavile G', 'darkness', 80, [['Slash', [C, C], 40]]), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(applyAction(s, 'ash', { type: 'ATTACK', attackIndex: 0 }).ok).toBe(false);
    s.cards = { ...s.cards, 'pl1-116': trainer('pl1-116', "Team Galactic's Invention G-101 Energy Gain") };
    weavile.attached = [{ card: { uid: 'gain', defId: 'pl1-116' }, until: Number.MAX_SAFE_INTEGER, tool: true }];
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it("Looker's Investigation: the opponent's hand shown, then whose hand goes back for 5", () => {
    let s = duel('charmander', 'onix');
    decks(s);
    s.cards = { ...s.cards, 'pl1-109': trainer('pl1-109', "Looker's Investigation") };
    ash(s).hand = [{ uid: 'looker', defId: 'pl1-109' }];
    misty(s).hand = pile(2);
    s = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'looker' });
    expect(s.pendingChoice).toMatchObject({ kind: 'lookOppHand' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(s.pendingChoice).toMatchObject({ kind: 'looker' });
    for (const end of settles(s)) expect(end.pendingChoice).toBeUndefined();
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', count: 1 });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', count: 5 });
    expect(misty(s).hand.length).toBe(5);
  });
});

describe('Platinum attacks', () => {
  it('Perish Song: Knocks Out an Asleep Pokémon hit by Midnight Eyes last turn', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-18', 'Altaria', C, 90, [['Midnight Eyes', [C], 20], ['Perish Song', [C], 0]], { stage: 'stage1' }), ['fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    put(s, 'misty', 0, big('Lapras'));
    decks(s);
    s = attack(s, 0);
    // Misty's Snorlax stays Asleep through her turn.
    s = endTurn(flips(s, false, false), 'misty');
    if (misty(s).active!.condition !== 'asleep') return;
    s = attack(s, 1);
    expect(misty(s).discard.some((c) => c.defId === 'big-Snorlax') || s.phase === 'promote' || !!s.pendingPromotion).toBe(true);
  });

  it('Octazooka: while the Defending Pokémon stays Active, its attacks need heads', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-58', 'Octillery', W, 90, [['Octazooka', [C], 40]], { stage: 'stage1' }), ['water']);
    put(s, 'misty', 'active', hitter(30), ['fighting']);
    decks(s);
    s = attack(s, 0);
    const tails = attack(flips(s, false), 0, undefined, 'misty');
    expect(ash(tails).active!.damage).toBe(0);
    const heads = attack(flips(s, true), 0, undefined, 'misty');
    expect(ash(heads).active!.damage).toBe(30);
  });

  it('Reheat: up to 2 Energy cards discarded from the hand, then 2 cards drawn for each', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-102', 'Vulpix', F, 50, [['Reheat', [], 0]]));
    decks(s);
    ash(s).hand = [{ uid: 'w1', defId: 'water' }, { uid: 'f1', defId: 'fire' }, { uid: 'x', defId: id('charmander') }];
    s = attack(s, 0, { amount: 2 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'w1' });
    expect(ash(s).hand.map((c) => c.uid).sort()).toEqual(['x'].concat(ash(s).hand.filter((c) => c.uid !== 'x').map((c) => c.uid)).sort());
    expect([ash(s).hand.length, ash(s).discard.length]).toEqual([5, 2]);
  });

  it('Remove Lost: an Energy card of the Defending Pokémon into the Lost Zone for each heads, picked when they differ', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-122', 'Dialga G', 'metal', 120, [['Remove Lost', [C], 80]], { stage: 'levelUp' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'), ['water', 'fire']);
    s = attack(flips(s, true, false), 0);
    expect(s.pendingChoice).toMatchObject({ kind: 'removeEach', toLostZone: true });
    const fire = misty(s).active!.energy[1]!.uid;
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: fire });
    expect([misty(s).lostZone?.map((c) => c.uid), misty(s).active!.energy.length]).toEqual([[fire], 1]);
  });

  it('Seed Flare: Grass Energy cards from the hand attached, 20 more for each', () => {
    let s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('pl1-126', 'Shaymin', G, 100, [['Seed Flare', [C], 40]], { stage: 'levelUp' }), ['grass']);
    put(s, 'ash', 0, big('Snorlax'));
    put(s, 'misty', 'active', big('Lapras'));
    ash(s).hand = [{ uid: 'g1', defId: 'grass' }, { uid: 'g2', defId: 'grass' }];
    s = attack(s, 0, { amount: 2 });
    expect(misty(s).active!.damage).toBe(80);
    for (const end of settles(s)) expect(ash(end).active!.energy.length + ash(end).bench[0]!.energy.length).toBe(3);
  });
});
