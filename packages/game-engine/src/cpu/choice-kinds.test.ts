// A fixture per kind of pending choice, exhaustive by type (#204): FIXTURES is keyed by PendingChoice['kind'], so a new
// kind without a row fails to compile. Each fixture is asked on two boards, one with something to click everywhere (a
// Bench, hands, decks, discard piles, damage, Energy) and one with nothing (no Bench, no hand, no deck, no discard pile),
// and must settle (test-kit's `settles`: every answer ends the question, and every CPU difficulty can be asked it).
//
// The questions are made by hand, not by the cards that ask them, so a fixture checks the resolver and the CPUs'
// answers, not the card: a card's own test still calls `settles` on the state its effect leaves. A question a card
// never asks on such a board (its effect checks first) can still fail here: those go in KNOWN with what was seen, and
// KNOWN's entries are asserted to still fail, so a fix must take its entry out.
import { describe, expect, it } from 'vitest';
import { cpuGaps, duel, give, id, pokemon, settles } from '../effects/test-kit.js';
import type { CardInstance, GameState, PendingChoice, Target } from '../index.js';

type Kind = PendingChoice['kind'];
/** A choice of one kind without who it's for and what asked it. */
type Asked<K extends Kind = Kind> = PendingChoice extends infer C ? (C extends { kind: K } ? Omit<C, 'player' | 'source'> : never) : never;
/** The question(s) to ask on this board; it may put on the board what the question is about (never more to click on the bare one). */
type Fixture<K extends Kind> = (s: GameState, on: Board) => Asked<K> | Asked<K>[];
/** Why a kind has no fixture yet. */
type NotYet = { notYet: string };

const BOARDS = ['full', 'bare'] as const;
type Board = (typeof BOARDS)[number];

let n = 0;
const cards = (...names: string[]): CardInstance[] => names.map((name) => ({ uid: `${name}-k${n++}`, defId: id(name) }));

/** Ash's turn. `full`: something to click everywhere. `bare`: two Active Pokémon and nothing else but the Prize cards. */
function board(kind: Board): GameState {
  if (kind === 'bare') {
    const s = duel('charmander', 'squirtle');
    for (const p of Object.values(s.players)) Object.assign(p, { hand: [], deck: [], discard: [] });
    return s;
  }
  const s = duel('charmeleon', 'squirtle', { energy: ['fire', 'fire', 'water'], defenderEnergy: ['water', 'water'], bench: ['bulbasaur', 'onix', 'squirtle'], oppBench: ['charmander', 'onix'] });
  const [ash, misty] = [s.players.ash!, s.players.misty!];
  ash.active!.evolvedFrom = cards('charmander');
  ash.active!.damage = 20;
  ash.bench[0]!.damage = 10;
  ash.bench[0]!.energy = cards('grass');
  misty.active!.damage = 10;
  misty.bench[0]!.energy = cards('fire');
  misty.bench[1]!.damage = 20;
  for (const p of [ash, misty]) {
    p.hand = [];
    p.deck = cards('charmander', 'fire', 'charmeleon', 'water', 'potion', 'squirtle', 'bill', 'bulbasaur', 'grass', 'charizard', 'onix', 'fighting', 'switch', 'fire', 'water');
    p.discard = cards('charmander', 'fire', 'water', 'potion', 'charmeleon', 'squirtle');
  }
  give(s, 'ash', 'charmander', 'charmeleon', 'charizard', 'fire', 'water', 'potion', 'switch', 'bulbasaur');
  give(s, 'misty', 'squirtle', 'water', 'potion', 'bill', 'charmander');
  return s;
}

const top = (s: GameState, count: number, player = 'ash') => s.players[player]!.deck.slice(0, count).map((c) => c.uid);
const NAMES = ['Charmander', 'Charmeleon', 'Charizard', 'Squirtle'];
const ACTIVE: Target = 'active';
/** An attack waiting behind a question (flee, protector, beforeAttack…): the attacker's first, with no answers, and the Energy for it. */
const waiting = (s: GameState) => {
  const active = s.players.ash!.active!;
  if (!active.energy.length) active.energy = cards('fire');
  return { attackIndex: 0, choices: {} };
};

type MayUsePower = Asked<'mayUse'>['power'];
/** Every power a mayUse question can be for (a new one without a row fails to compile), each asked for the Active Pokémon. */
const MAY_USE: Record<MayUsePower, true> = {
  energyRecharge: true, breakwing: true, flameVapor: true, streamingMantle: true, retroEnergy: true, belt: true, healingShower: true, legendaryAscent: true,
  froth: true, dragonBoost: true, lightningBurst: true, evoFlame: true, evoThunder: true, evoSwirl: true, excavate: true, crushChance: true, crimsonRay: true,
  yellowRay: true, blueRay: true, earthFissure: true, sharpEye: true, freezeUp: true, evolutionaryVitality: true, evolutionaryToxic: true, flameDash: true,
  aquaRecovery: true, sereneGrace: true, freezingScreech: true, darknessShade: true, flameCharge: true, sheetLightning: true, primalSwirl: true, dragonPulse: true,
  modeCrash: true, curseBreath: true, timeWalk: true, setUp: true, psychicBind: true, unownBang: true, junk: true, castOffShell: true, shootPoison: true,
  ironShell: true, emperorAura: true, blazeDance: true, sunshineSong: true, evolutionaryGas: true, healingBreath: true, reverseTime: true, letLoose: true,
  flashBite: true, brightLook: true, disruptingSpy: true, darknessSend: true, dowsingCode: true, doubleFall: true, unownReturn: true, unownFlash: true,
  blissfulNurse: true, oceanGrow: true, stardustSong: true, celebrationWind: true, hotSnort: true, clawSnag: true, unownDark: true, spookyWhirlpool: true,
  unownCure: true, mapping: true, selfGeneration: true, sporprise: true, giantFan: true, topplingWind: true,
};

const FIXTURES: { [K in Kind]: Fixture<K> | NotYet } = {
  pickFromDeck: () => [
    { kind: 'pickFromDeck', filter: 'any' },
    { kind: 'pickFromDeck', filter: 'basic', toBench: true },
    { kind: 'pickFromDeck', filter: 'basicEnergy', attach: true },
    { kind: 'pickFromDeck', filter: 'trainer', optional: true, count: 2 },
    { kind: 'pickFromDeck', filter: 'evolution', toTop: true },
    { kind: 'pickFromDeck', filter: 'basic', toBench: true, then: 'misty' },
  ],
  pickFromTop: (s) => [{ kind: 'pickFromTop', looked: top(s, 3), take: 1 }, { kind: 'pickFromTop', looked: top(s, 5), take: 2, basicEnergy: true, shuffleRest: true }],
  oppHandBasics: () => ({ kind: 'oppHandBasics' }),
  treaty: () => ({ kind: 'treaty' }),
  returnOwn: () => ({ kind: 'returnOwn' }),
  secretMission: () => ({ kind: 'secretMission' }),
  discardDraw: () => ({ kind: 'discardDraw', discarded: 0 }),
  sleightOfHand: () => ({ kind: 'sleightOfHand', moved: 0 }),
  benchGuard: () => ({ kind: 'benchGuard', target: 0, guard: 1 }),
  flee: (s) => ({ kind: 'flee', ...waiting(s) }),
  protector: (s) => ({ kind: 'protector', ...waiting(s), picked: [] }),
  ninjaTrick: (s) => ({ kind: 'ninjaTrick', ...waiting(s) }),
  borrowedTrainer: () => ({ kind: 'borrowedTrainer' }),
  attachFromHand: () => [{ kind: 'attachFromHand', count: 1 }, { kind: 'attachFromHand', count: 2, basic: true, benchOnly: true }],
  removeEach: (_, on) => [{ kind: 'removeEach', targets: [ACTIVE] }, { kind: 'removeEach', targets: on === 'full' ? [ACTIVE, 0] : [ACTIVE], toHand: true }],
  drainEnergy: () => ({ kind: 'drainEnergy' }),
  lunarPower: () => ({ kind: 'lunarPower' }),
  soakUp: () => ({ kind: 'soakUp', to: ACTIVE }),
  mistysWish: () => ({ kind: 'mistysWish', step: 'prize' }),
  guess: (s) => ({ kind: 'guess', card: s.players.ash!.prizes[0]!, labels: ['Charmander', 'Squirtle'], answer: 0, draw: 1 }),
  fuchsia: () => ({ kind: 'fuchsia' }),
  saffron: (s, on) => {
    if (on === 'full') s.players.ash!.bench[3] = pokemon('sabrinasAbra', ['psychic']);
    return { kind: 'saffron' };
  },
  psychicControl: () => ({ kind: 'psychicControl' }),
  lookOppHand: () => ({ kind: 'lookOppHand' }),
  lookOppDeck: () => [{ kind: 'lookOppDeck', count: 3 }, { kind: 'lookOppDeck', count: 2, own: true }],
  engage: () => ({ kind: 'engage' }),
  reflip: { notYet: 'holds a whole earlier game state and the attack flipped for (Sabrina\'s ESP, Victory Star): asked through the cards in gym1-trainers.test.ts and bw3-powers.test.ts' },
  narrowGym: () => ({ kind: 'narrowGym', limit: 2 }),
  quiz: (s) => ({ kind: 'quiz', card: s.players.ash!.prizes[0]!, lengths: [`2' 0"`, `5' 7"`], answer: 0 }),
  challenge: () => ({ kind: 'challenge' }),
  mindGames: { notYet: 'holds the Trainer card being played and its answers (Slowking): asked through the card in neo1-powers.test.ts' },
  mayFlip: () => (['herbalScent', 'fireBoost', 'softboiled', 'howl', 'vanish'] as const).map((power) => ({ kind: 'mayFlip' as const, power, target: ACTIVE })),
  oppHandTrainer: () => [{ kind: 'oppHandTrainer' }, { kind: 'oppHandTrainer', any: true, count: 2 }],
  revealEnergy: () => ({ kind: 'revealEnergy' }),
  devolveOwn: () => ({ kind: 'devolveOwn' }),
  powerPlant: () => ({ kind: 'powerPlant' }),
  arrangeTop: () => ({ kind: 'arrangeTop', count: 3 }),
  pickFromDiscard: () => [{ kind: 'pickFromDiscard' }, { kind: 'pickFromDiscard', filter: 'trainer' }],
  discardToHand: () => [{ kind: 'discardToHand', count: 1 }, { kind: 'discardToHand', count: 2, filter: 'basicEnergy' }],
  discardToDeck: () => [{ kind: 'discardToDeck', count: 1, of: 1 }, { kind: 'discardToDeck', count: 3, of: 3, filter: 'basicEnergy' }],
  stadiumFromDiscard: () => ({ kind: 'stadiumFromDiscard' }),
  oppHandToActive: () => ({ kind: 'oppHandToActive' }),
  returnUnown: (s, on) => {
    if (on === 'full') Object.assign(s.players.ash!.bench, { 3: pokemon('unownJ'), 4: pokemon('unownO') });
    return { kind: 'returnUnown', except: s.players.ash!.bench[3]?.card.uid ?? 'none' };
  },
  invention: () => ({ kind: 'invention' }),
  cunning: () => ({ kind: 'cunning' }),
  shuffleFromHand: () => [{ kind: 'shuffleFromHand', count: 1 }, { kind: 'shuffleFromHand', count: 2, thenDraw: true }],
  timeCapsule: () => ({ kind: 'timeCapsule', count: 5 }),
  doubleGust: () => ({ kind: 'doubleGust' }),
  powerDamage: () => ({ kind: 'powerDamage', amount: 10, type: 'fire' }),
  removeDamage: () => [{ kind: 'removeDamage' }, { kind: 'removeDamage', count: 2, benchOnly: true }],
  attachCard: { notYet: 'holds a card already taken out of its zone, to attach: asked through the cards (Energy Stadium, Holon Lake, Colress Machine…)' },
  fastStream: () => ({ kind: 'fastStream' }),
  handToDeck: () => [{ kind: 'handToDeck' }, { kind: 'handToDeck', count: 2, optional: true }],
  handToPrize: () => ({ kind: 'handToPrize' }),
  beforeAttack: (s) => (['discardTwo', 'guessCoin', 'discardOne', 'plead'] as const).map((question) => ({ kind: 'beforeAttack' as const, question, ...waiting(s), picked: [] })),
  iceBind: () => ({ kind: 'iceBind' }),
  rps: { notYet: 'a tie asks again, so settles\' walk (one answer at a time after the first) never ends: asked through the cards (Team Galactic\'s Wager in pl1-trainers.test.ts, Fortunate Draw)' },
  powerCancel: { notYet: 'holds the Poké-Power being used and its answers: asked through the cards in ex4-trainers.test.ts and pl1-trainers.test.ts' },
  rival: (s) => ({ kind: 'rival', looked: top(s, 5, 'misty'), picked: [] }),
  switchIn: () => [{ kind: 'switchIn' }, { kind: 'switchIn', optional: true }],
  benchDamage: () => ({ kind: 'benchDamage', amount: 10 }),
  discardAttached: () => [{ kind: 'discardAttached', target: ACTIVE }, { kind: 'discardAttached', target: ACTIVE, count: 2, optional: true }],
  drawCount: () => ({ kind: 'drawCount', max: 3 }),
  evolveFromDeck: () => [{ kind: 'evolveFromDeck', target: ACTIVE, names: NAMES }, { kind: 'evolveFromDeck', target: ACTIVE, names: NAMES, optional: true }],
  distributeEnergy: { notYet: 'holds Energy cards already taken out of their zone, to hand out: asked through the cards (Energy Trans\'s kin, Holon Circle…)' },
  evolveMany: () => ({ kind: 'evolveMany', names: NAMES, done: [] }),
  chainReaction: () => ({ kind: 'chainReaction', target: ACTIVE, next: [] }),
  mayUse: () => (Object.keys(MAY_USE) as MayUsePower[]).map((power) => ({ kind: 'mayUse' as const, power, target: ACTIVE })),
  attachFromDiscard: () => [{ kind: 'attachFromDiscard', count: 1 }, { kind: 'attachFromDiscard', count: 2, type: 'fire', optional: true }],
  discardToBench: () => ({ kind: 'discardToBench', filter: 'basicNotBaby' }),
  energyAnyWay: () => ({ kind: 'energyAnyWay' }),
  moveAttached: () => [{ kind: 'moveAttached', target: ACTIVE }, { kind: 'moveAttached', target: ACTIVE, anyEnergy: true }],
  oracle: () => ({ kind: 'oracle', picked: [] }),
  bottomPick: (s) => ({ kind: 'bottomPick', looked: s.players.ash!.deck.slice(-3).map((c) => c.uid), take: 1 }),
  evolveFromHand: () => ({ kind: 'evolveFromHand', target: ACTIVE, names: NAMES }),
  mysteryZone: () => ({ kind: 'mysteryZone' }),
  placeCounters: () => [{ kind: 'placeCounters', count: 2 }, { kind: 'placeCounters', count: 2, optional: true }],
  discardFromHand: () => [{ kind: 'discardFromHand', count: 1 }, { kind: 'discardFromHand', count: 2, upTo: true }, { kind: 'discardFromHand', count: 1, energyOnly: true }],
  energyGrounding: { notYet: 'asked as a Pokémon is Knocked Out, with the uid of the Pokémon its Energy goes to: asked through the cards (Energy Grounding, Exp. All, Golden Wing)' },
  shiftEnergy: () => ({ kind: 'shiftEnergy', from: ACTIVE, to: 0 }),
  castform: () => ({ kind: 'castform', target: ACTIVE, names: NAMES }),
  vineTease: () => ({ kind: 'vineTease' }),
  removeCondition: (s) => {
    Object.assign(s.players.ash!.active!, { condition: 'asleep', poison: 10 });
    return [{ kind: 'removeCondition', target: ACTIVE }, { kind: 'removeCondition', target: ACTIVE, shift: true }];
  },
  rammingStrike: () => ({ kind: 'rammingStrike', heads: 1 }),
  energyLink: () => ({ kind: 'energyLink', from: ACTIVE }),
  marley: (s) => [{ kind: 'marley', uids: top(s, 2, 'misty'), fromDeck: true }, { kind: 'marley', uids: s.players.misty!.discard.slice(0, 2).map((c) => c.uid) }],
  lostCyclone: () => ({ kind: 'lostCyclone', kept: [] }),
  looker: () => ({ kind: 'looker' }),
  returnEnergy: () => ({ kind: 'returnEnergy' }),
  antiqueMagic: () => ({ kind: 'antiqueMagic', count: 1 }),
  legendPick: () => ({ kind: 'legendPick', names: NAMES }),
  researchRecord: (s) => ({ kind: 'researchRecord', looked: top(s, 4), top: [], bottom: [] }),
  moveCounters: () => [{ kind: 'moveCounters' }, { kind: 'moveCounters', fromSide: 'opp' }, { kind: 'moveCounters', count: 2, toActive: true }],
  darknessRestore: () => ({ kind: 'darknessRestore' }),
  waterRescue: (s) => ({ kind: 'waterRescue', uids: s.players.ash!.discard.slice(0, 3).map((c) => c.uid) }),
  timeWalk: () => ({ kind: 'timeWalk' }),
  chooseCondition: () => ({ kind: 'chooseCondition', options: ['asleep', 'burned', 'poisoned'] }),
  nod: () => ({ kind: 'nod' }),
  oppBenchPick: () => (['gust', 'devolve', 'shuffle'] as const).flatMap((purpose) => [{ kind: 'oppBenchPick' as const, purpose }, { kind: 'oppBenchPick' as const, purpose, optional: true }]),
  handToBench: () => [{ kind: 'handToBench', names: NAMES }, { kind: 'handToBench', names: NAMES, optional: true }],
  pealTarget: () => ({ kind: 'pealTarget' }),
  cursedEyes: () => ({ kind: 'cursedEyes' }),
  skillHack: () => ({ kind: 'skillHack' }),
  ownCounters: () => ({ kind: 'ownCounters', count: 2 }),
  blissful: () => ({ kind: 'blissful' }),
  deltaSwitch: () => ({ kind: 'deltaSwitch', exclude: 'none', anyEnergy: true }),
  supernatural: () => [{ kind: 'supernatural' }, { kind: 'supernatural', fromDiscard: true }, { kind: 'supernatural', ownDiscard: true }],
};

/**
 * Fixtures that don't settle today, by `kind/board#index` (the index of the kind's fixture), each with where it was
 * reported. Every entry is asserted to still fail: take it out with its fix.
 */
const NOTHING_TO_CLICK =
  'found by this test, not in #204: asked with nothing to click, no answer is accepted, not even nothing (a hang, were a card to ask it so; the cards that ask it were not all read, and those read check first)';
const KNOWN: Record<string, string> = {
  'saffron/bare#0': NOTHING_TO_CLICK,
  'narrowGym/bare#0': NOTHING_TO_CLICK,
  'revealEnergy/bare#0': NOTHING_TO_CLICK,
  'devolveOwn/bare#0': NOTHING_TO_CLICK,
  'powerPlant/bare#0': NOTHING_TO_CLICK,
  'returnUnown/bare#0': NOTHING_TO_CLICK,
  'shuffleFromHand/bare#0': NOTHING_TO_CLICK,
  'doubleGust/bare#0': NOTHING_TO_CLICK,
  'fastStream/bare#0': NOTHING_TO_CLICK,
  'handToDeck/bare#0': NOTHING_TO_CLICK,
  'handToPrize/bare#0': NOTHING_TO_CLICK,
  'beforeAttack/bare#2': NOTHING_TO_CLICK,
  'rival/bare#0': NOTHING_TO_CLICK,
  'switchIn/bare#0': NOTHING_TO_CLICK,
  'benchDamage/bare#0': NOTHING_TO_CLICK,
  'discardAttached/bare#0': NOTHING_TO_CLICK,
  'marley/bare#0': NOTHING_TO_CLICK,
  'marley/bare#1': NOTHING_TO_CLICK,
  'lostCyclone/bare#0': NOTHING_TO_CLICK,
  'moveCounters/bare#2': NOTHING_TO_CLICK,
  'oppBenchPick/bare#0': NOTHING_TO_CLICK,
  'skillHack/bare#0': NOTHING_TO_CLICK,
};

const ROWS = (Object.keys(FIXTURES) as Kind[]).flatMap((kind) => {
  const fixture = FIXTURES[kind] as Fixture<Kind> | NotYet;
  if (typeof fixture !== 'function') return [];
  return BOARDS.flatMap((on) => [fixture(board(on), on)].flat().map((_, index) => ({ key: `${kind}/${on}#${index}`, kind, on, index, fixture })));
});

/** The fixture's question asked of Ash on that board, or why it doesn't settle. */
function outcome({ fixture, on, index }: (typeof ROWS)[number]): string | null {
  const s = board(on);
  const choice = [fixture(s, on)].flat()[index]!;
  s.pendingChoice = { player: 'ash', source: 'Test', ...choice } as PendingChoice;
  try {
    // The player's answers first (a question no answer ends is a hang for everyone), then the CPUs'.
    for (const end of settles(s, 12, { cpus: false })) if (end.pendingChoice) return `left ${end.pendingChoice.kind} asked`;
    const gaps = cpuGaps(s);
    return gaps.length ? `CPU: ${gaps.join('; ')}` : null;
  } catch (e) {
    return (e as Error).message;
  }
}

describe('a fixture per kind of pending choice', () => {
  it.each(ROWS.filter((r) => !(r.key in KNOWN)))('$key settles, for every answer and every CPU', (row) => {
    // (Thrown, not expected to be null: the whole reason is shown, where expect cuts a long string short.)
    const failed = outcome(row);
    if (failed) throw new Error(failed);
  });

  it.each(ROWS.filter((r) => r.key in KNOWN))('$key is a known gap, and still one', (row) => {
    expect(outcome(row), `${row.key} settles now: take it out of KNOWN (${KNOWN[row.key]})`).not.toBeNull();
  });

  it('KNOWN names only fixtures there are', () => {
    expect(Object.keys(KNOWN).filter((key) => !ROWS.some((r) => r.key === key))).toEqual([]);
  });

  it('the kinds with no fixture yet are listed with a reason', () => {
    const notYet = (Object.keys(FIXTURES) as Kind[]).filter((kind) => typeof FIXTURES[kind] !== 'function');
    expect(notYet).toEqual(['reflip', 'mindGames', 'attachCard', 'rps', 'powerCancel', 'distributeEnergy', 'energyGrounding']);
  });
});

