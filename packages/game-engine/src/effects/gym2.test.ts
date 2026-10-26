import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, inPlayDef, usableAttacks, type GameState, type InPlayPokemon, type TrainerChoices } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, mon, pokemon, tryAttack, C, FI, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (uid: string, name: string) => ({ uid, defId: id(name) });
const play = (s: GameState, name: string, choices: TrainerChoices = {}) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', name)[0]!, choices });
const resolve = (s: GameState, player: string, answer: { cardUid?: string; target?: 'active' | number; count?: number } = {}) => act(s, player, { type: 'RESOLVE_CHOICE', ...answer });
const stadium = (s: GameState, name: string) => (s.stadium = { card: card('stadium', name), owner: 'misty' });

describe('Gym Challenge attacks', () => {
  it('Roaring Flames discards every Fire Energy card: 20 more for each', () => {
    const after = attack(duel('blainesCharizard', 'onix', { energy: ['fire', 'fire', 'water'] }), 0);
    expect([misty(after).active!.damage, ash(after).active!.energy.map((e) => e.defId)]).toEqual([60, ['water']]);
  });

  it("Lie Low reduces next turn's damage by 20, and Earthdrill needs it the turn before", () => {
    let s = duel('brocksDugtrio', 'onix', { energy: ['fighting', 'fighting', 'fighting'], defenderEnergy: ['fighting'] });
    expect(tryAttack(s, 1)).toEqual({ ok: false, error: "Brock's Dugtrio didn't use Lie Low last turn" });
    s = attack(s, 0);
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(0);
    expect(tryAttack(s, 1)).toMatchObject({ ok: true });
  });

  it("Hyper Needle can't be used again while Koga's Beedrill stays in play", () => {
    let s = attack(flips(duel('kogasBeedrill', 'onix', { energy: ['grass', 'grass', 'grass'] }), true), 1);
    expect(misty(s).active!.damage).toBe(70);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 1)).toMatchObject({ ok: false });
  });

  it("Giant Growth: Koga's Ditto has 80 HP and Pound does 30; Gaseous Form adds 10 HP per Psychic Energy card", () => {
    const s = attack(flips(duel('kogasDitto', 'onix', { energy: ['fire'] }), true), 0);
    expect(inPlayDef(s.cards, ash(s).active!).hp).toBe(80);
    expect(misty(attack(endTurn(s, 'misty'), 1)).active!.damage).toBe(30);
    expect(inPlayDef(s.cards, pokemon('sabrinasGastly', ['psychic', 'psychic'])).hp).toBe(60);
  });

  it("Group Attack benches Koga's Zubat from the deck first, then does 10 for each in play", () => {
    const s = duel('kogasZubat', 'onix', { energy: ['grass', 'grass'] });
    ash(s).deck = [card('z1', 'kogasZubat'), card('c1', 'charmander'), card('z2', 'kogasZubat')];
    const after = attack(s, 0, { amount: 2 });
    expect([misty(after).active!.damage, ash(after).bench.filter(Boolean).length]).toEqual([30, 2]);
  });

  it('Super Removal discards 1 Energy card from each of the opponent’s Pokémon with any (the player picks when they differ)', () => {
    let s = duel('mistysGolduck', 'onix', { energy: ['psychic', 'water'], defenderEnergy: ['fighting'], oppBench: ['squirtle'] });
    misty(s).bench[0]!.energy = [card('w1', 'water'), card('f1', 'fire')];
    s = attack(flips(s, true), 1);
    expect(misty(s).active!.energy).toEqual([]);
    s = resolve(s, 'ash', { cardUid: 'f1' });
    expect([misty(s).bench[0]!.energy.map((e) => e.uid), s.currentPlayer]).toEqual([['w1'], 'misty']);
  });

  it('Lunar Power evolves a benched Pokémon with a card from the deck', () => {
    let s = duel('erikasClefairyC', 'onix', { energy: ['fire'], bench: ['charmander'] });
    ash(s).deck = [card('evo', 'charmeleon'), card('c1', 'water')];
    s = resolve(attack(flips(s, true), 0), 'ash', { cardUid: 'evo' });
    expect(ash(s).bench[0]!.card.uid).toBe('evo');
  });
});

describe('Gym Challenge Pokémon Powers', () => {
  it("Rebellion: 2 tails and Misty's Gyarados is shuffled into the deck instead of attacking", () => {
    const s = duel('mistysGyarados', 'onix', { energy: ['water', 'water', 'water', 'water'], bench: ['squirtle'] });
    const deck = ash(s).deck.length;
    const rebelled = attack(flips(s, false, false), 0);
    expect([ash(rebelled).active, ash(rebelled).deck.length, misty(rebelled).active!.damage]).toEqual([null, deck + 5, 0]);
    expect(misty(attack(flips(s, true, false), 0)).active!.damage).toBe(70);
  });

  it("Fortitude: on heads, an attack that would Knock Out Giovanni's Machamp leaves it with 10 HP", () => {
    const s = duel('charmander', 'giovannisMachamp', { energy: ['fire', 'fire'], oppBench: ['squirtle'] });
    misty(s).active!.damage = 80;
    expect(misty(attack(flips(s, true), 1)).active!.damage).toBe(90);
    expect(misty(attack(flips(s, false), 1)).active).toBeNull();
  });

  it("Psylink: Sabrina's Alakazam can use the attacks of your benched Psychic Pokémon", () => {
    const s = duel('sabrinasAlakazam', 'onix', { energy: ['psychic'], bench: ['sabrinasAbra'] });
    expect(misty(attack(s, 1)).active!.damage).toBe(10);
  });

  it('Psylink stops with any Special Condition, Poisoned included (agreed), like every Pokémon Power', () => {
    const s = duel('sabrinasAlakazam', 'onix', { energy: ['psychic'], bench: ['sabrinasAbra'] });
    const linked = usableAttacks(ash(s).active!, s.cards, { bench: ash(s).bench }).length;
    ash(s).active!.poison = 10;
    expect(usableAttacks(ash(s).active!, s.cards, { bench: ash(s).bench }).length).toBeLessThan(linked);
    expect(tryAttack(s, 1)).toMatchObject({ ok: false });
  });

  it("Ice Throw does 40 to a Defending Pokémon that's Fighting among its types (Kecleon, printed dual types)", () => {
    const s = duel('charmander', 'onix', { energy: ['water', 'water'] });
    const dewgong = mon('gym2-54', "Misty's Dewgong", W, 80, [['Ice Throw', [W, W], 20]], { stage: 'stage1' });
    const kecleon = mon('big-Kecleon', 'Kecleon', C, 100, [], { types: [C, FI] });
    s.cards = { ...s.cards, [dewgong.id]: dewgong, [kecleon.id]: kecleon };
    const inPlay = (defId: string, energy: InPlayPokemon['energy']): InPlayPokemon => ({ card: { uid: `${defId}-x`, defId }, evolvedFrom: [], damage: 0, energy, playedTurn: 0 });
    ash(s).active = inPlay(dewgong.id, ash(s).active!.energy);
    misty(s).active = inPlay(kecleon.id, []);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
  });

  it('Relaxing Scent halves attack damage to any Pokémon, rounded up to the nearest 10', () => {
    expect(misty(attack(duel('charmander', 'erikasIvysaur', { energy: ['fire', 'fire'] }), 1)).active!.damage).toBe(20);
  });

  it("Scram: with exactly 10 HP left, Brock's Primeape is shuffled into its owner's deck", () => {
    const s = duel('charmander', 'brocksPrimeape', { energy: ['fire'], oppBench: ['squirtle'] });
    misty(s).active!.damage = 50;
    const after = attack(s, 0);
    expect([misty(after).active, after.pendingPromotion, misty(after).discard]).toEqual([null, 'misty', []]);
  });

  it("Shapeshift: Brock's Ninetales is treated as the Evolution card attached, until it's discarded or Ninetales gets a Special Condition", () => {
    let s = duel('charmander', 'onix', { bench: ['brocksNinetales'] });
    const [evo] = give(s, 'ash', 'charmeleon');
    s = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { cardUid: evo } });
    expect([inPlayDef(s.cards, ash(s).bench[0]!).name, inPlayDef(s.cards, ash(s).bench[0]!).hp]).toEqual(['Charmeleon', 80]);
    const discarded = act(s, 'ash', { type: 'DISCARD_SHAPESHIFT', target: 0 });
    expect([inPlayDef(discarded.cards, ash(discarded).bench[0]!).name, ash(discarded).discard.at(-1)!.uid]).toEqual(["Brock's Ninetales", evo]);
    // Confused: the card is discarded with the next move.
    const asleep = structuredClone(s);
    [ash(asleep).active, ash(asleep).bench[0]] = [ash(asleep).bench[0]!, ash(asleep).active];
    ash(asleep).active!.condition = 'confused';
    expect(inPlayDef(asleep.cards, ash(endTurn(asleep, 'ash')).active!).name).toBe("Brock's Ninetales");
  });

  it('Energy Drain: on heads, the owner of Koga’s Muk discards an Energy card from the attacker', () => {
    let s = attack(flips(duel('charmander', 'kogasMuk', { energy: ['fire', 'water'] }), true), 0);
    expect(getPlayerView(s, 'misty').self.pendingChoice).toMatchObject({ kind: 'pickAttached' });
    const water = ash(s).active!.energy.find((e) => e.defId === 'water')!.uid;
    s = resolve(s, 'misty', { cardUid: water });
    expect([ash(s).active!.energy.map((e) => e.defId), s.currentPlayer]).toEqual([['fire'], 'misty']);
  });

  it("Shock Blast: on tails, 20 damage to each Active Pokémon when Lt. Surge's Electrode is damaged", () => {
    const after = attack(flips(duel('charmander', 'surgesElectrode', { energy: ['fire'] }), false), 0);
    expect([ash(after).active!.damage, misty(after).active!.damage]).toEqual([20, 30]);
  });
});

describe('Gym Challenge Trainers', () => {
  it("Blaine: 2 Fire Energy cards can go to 1 Pokémon with Blaine in its name this turn", () => {
    let s = play(duel('blainesGrowlithe', 'onix'), 'blaine');
    const [f1, f2, f3] = give(s, 'ash', 'fire', 'fire', 'fire');
    s = act(act(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: f1!, target: 'active' }), 'ash', { type: 'ATTACH_ENERGY', cardUid: f2!, target: 'active' });
    expect(ash(s).active!.energy).toHaveLength(2);
    expect(applyAction(s, 'ash', { type: 'ATTACH_ENERGY', cardUid: f3!, target: 'active' })).toMatchObject({ ok: false });
  });

  it("Giovanni: a Pokémon with Giovanni in its name can evolve the turn it was played", () => {
    let s = duel('charmander', 'onix', { bench: ['giovannisMachop'] });
    ash(s).bench[0]!.playedTurn = 3;
    const [machoke] = give(s, 'ash', 'giovannisMachoke');
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: machoke!, target: 0 })).toMatchObject({ ok: false });
    s = act(play(s, 'giovanni', { target: 0 }), 'ash', { type: 'EVOLVE', cardUid: machoke!, target: 0 });
    expect(ash(s).bench[0]!.card.uid).toBe(machoke);
  });

  it('Koga: attacks by Pokémon with Koga in their names poison the Defending Pokémon they damage', () => {
    const s = attack(flips(play(duel('kogasKoffing', 'onix', { energy: ['grass'] }), 'koga'), false), 0);
    expect(misty(s).active!.poison).toBe(10);
  });

  it("Brock's Protection: Energy Removal can't take its Pokémon's Energy", () => {
    const s = duel('charmander', 'onix', { defenderEnergy: ['fighting'] });
    misty(s).active!.attached = [{ card: card('prot', 'brocksProtection'), until: 999 }];
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'energyremoval')[0]!, choices: {} })).toMatchObject({ ok: false });
  });

  it('Chaos Gym: on tails the opponent may play the card instead; it ends in its owner’s discard pile', () => {
    const s = duel('charmander', 'onix');
    stadium(s, 'chaosGym');
    const [bill] = give(s, 'ash', 'bill');
    const tails = act(flips(s, false), 'ash', { type: 'PLAY_TRAINER', cardUid: bill!, choices: {} });
    expect(getPlayerView(tails, 'misty').self.pendingChoice).toMatchObject({ kind: 'options', playable: bill });
    const hand = misty(tails).hand.length;
    const used = act(tails, 'misty', { type: 'PLAY_TRAINER', cardUid: bill!, choices: {} });
    expect([misty(used).hand.length, ash(used).discard.at(-1)!.uid, used.pendingChoice]).toEqual([hand - 1 + 2, bill, undefined]);
    const declined = resolve(tails, 'misty');
    expect([ash(declined).discard.at(-1)!.uid, misty(declined).hand.some((c) => c.uid === bill)]).toEqual([bill, false]);
  });

  it("Sabrina's Psychic Control: a Trainer from the opponent's discard pile, usable this turn, then back to their discard pile", () => {
    let s = duel('charmander', 'onix');
    misty(s).discard = [card('obill', 'bill')];
    s = resolve(act(flips(s, true), 'ash', { type: 'PLAY_TRAINER', cardUid: give(s, 'ash', 'psychicControl')[0]!, choices: {} }), 'ash', { cardUid: 'obill' });
    expect(ash(s).hand.some((c) => c.uid === 'obill')).toBe(true);
    const played = act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'obill', choices: {} });
    expect(misty(played).discard.map((c) => c.uid)).toEqual(['obill']);
    const kept = endTurn(s, 'ash');
    expect([ash(kept).hand.some((c) => c.uid === 'obill'), misty(kept).discard.map((c) => c.uid)]).toEqual([false, ['obill']]);
  });

  it("Lt. Surge's Secret Plan: a hand card face down on the Bench; it's turned over, and discarded if it isn't a Basic Pokémon", () => {
    let s = duel('squirtle', 'onix');
    ash(s).hand = [card('hidden', 'charizard'), card('basic', 'charmander')];
    s = play(s, 'secretPlan', { handUids: ['hidden'] });
    expect(getPlayerView(s, 'misty').opponent.bench[0]!.card.defId).toBe('face-down');
    expect(getPlayerView(s, 'misty').cards[id('charizard')]).toBeUndefined();
    const flipped = act(s, 'ash', { type: 'FLIP_FACE_DOWN', target: 0 });
    expect([ash(flipped).bench[0], ash(flipped).discard.some((c) => c.uid === 'hidden')]).toEqual([null, true]);
    const basic = act(play(s, 'secretPlan', { handUids: ['basic'] }), 'ash', { type: 'FLIP_FACE_DOWN', target: 1 });
    expect([ash(basic).bench[1]!.card.uid, ash(basic).bench[1]!.faceDown]).toEqual(['basic', undefined]);
  });

  it("Rocket's Minefield Gym puts 2 damage counters on a Basic Pokémon benched from the hand, on tails", () => {
    const s = duel('charmander', 'onix');
    stadium(s, 'minefieldGym');
    const [basic] = give(s, 'ash', 'squirtle');
    expect(ash(act(flips(s, false), 'ash', { type: 'PLAY_BENCH', cardUid: basic!, slot: 0 })).bench[0]!.damage).toBe(20);
    expect(ash(act(flips(s, true), 'ash', { type: 'PLAY_BENCH', cardUid: basic!, slot: 0 })).bench[0]!.damage).toBe(0);
  });

  it("Viridian City Gym removes 2 damage counters from a Pokémon with Giovanni in its name when it evolves", () => {
    const s = duel('charmander', 'onix', { bench: ['giovannisMachop'] });
    stadium(s, 'viridianGym');
    ash(s).bench[0]!.damage = 30;
    const [machoke] = give(s, 'ash', 'giovannisMachoke');
    expect(ash(act(s, 'ash', { type: 'EVOLVE', cardUid: machoke!, target: 0 })).bench[0]!.damage).toBe(10);
  });

  it('Resistance Gym reduces every Resistance by 20', () => {
    const s = duel('brocksRhyhorn', 'surgesSpearow', { energy: ['fighting', 'fighting'] });
    stadium(s, 'resistanceGym');
    expect(misty(attack(s, 0)).active!.damage).toBe(10);
  });

  it('Transparent Walls prevents attack damage to your Benched Pokémon until the end of the opponent’s next turn', () => {
    let s = play(duel('charmander', 'erikasDragonair', { defenderEnergy: ['fire', 'fire', 'fire'], bench: ['squirtle'] }), 'transparentWalls');
    s = attack(flips(endTurn(s, 'ash'), true), 0, {}, 'misty');
    expect(ash(s).bench[0]!.damage).toBe(0);
  });

  it('Warp Point: the opponent switches first, then you do', () => {
    let s = play(duel('charmander', 'onix', { bench: ['squirtle'], oppBench: ['squirtle'] }), 'warpPoint');
    s = resolve(resolve(s, 'misty', { target: 0 }), 'ash', { target: 0 });
    expect([misty(s).active!.card.defId, ash(s).active!.card.defId, s.pendingChoice]).toEqual([id('squirtle'), id('squirtle'), undefined]);
  });

  it("Koga's Ninja Trick: when the opponent attacks, its Pokémon may switch out first, and the card is discarded", () => {
    let s = endTurn(play(duel('kogasZubat', 'onix', { bench: ['squirtle'], defenderEnergy: ['fighting'] }), 'ninjaTrick'), 'ash');
    s = act(s, 'misty', { type: 'ATTACK', attackIndex: 0 });
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'ownPokemon', optional: true });
    s = resolve(s, 'ash', { target: 0 });
    expect([ash(s).active!.card.defId, ash(s).active!.damage, ash(s).bench[0]!.damage, ash(s).discard.some((c) => c.defId === id('ninjaTrick'))]).toEqual([id('squirtle'), 10, 0, true]);
  });

  it("Misty's Wish: look at a Prize card; the opponent lets you switch it with a hand card, or you draw", () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [card('mine', 'water')];
    s = resolve(play(s, 'mistysWish'), 'ash', { count: 0 });
    expect(getPlayerView(s, 'ash').self.peek).toMatchObject({ card: ash(s).prizes[0] });
    const prize = ash(s).prizes[0]!.uid;
    const swapped = resolve(resolve(s, 'misty', { count: 0 }), 'ash', { cardUid: 'mine' });
    expect([ash(swapped).prizes[0]!.uid, ash(swapped).hand.some((c) => c.uid === prize)]).toEqual(['mine', true]);
    const hand = ash(s).hand.length;
    expect(ash(resolve(s, 'misty', { count: 1 })).hand.length).toBe(hand + 1);
  });

  it("Blaine's Quiz #2: the opponent guesses the face-down card's kind; right, they draw 2", () => {
    let s = duel('charmander', 'onix');
    ash(s).hand = [card('q', 'water')];
    s = play(s, 'blainesQuiz2', { handUids: ['q'] });
    const hand = misty(s).hand.length;
    expect(misty(resolve(s, 'misty', { count: 0 })).hand.length).toBe(hand + 2);
    expect(ash(resolve(s, 'misty', { count: 2 })).hand.length).toBe(3);
  });

  it('Master Ball: a Basic Pokémon or Evolution card from the top 7, and the rest are shuffled back', () => {
    let s = duel('charmander', 'onix');
    ash(s).deck = [card('w', 'water'), card('c', 'charmander'), card('q', 'squirtle'), card('f', 'fire')];
    s = play(s, 'masterBall');
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: [{ uid: 'c' }, { uid: 'q' }], optional: true });
    s = resolve(s, 'ash', { cardUid: 'c' });
    expect([ash(s).hand.at(-1)!.uid, ash(s).deck.map((c) => c.uid).sort()]).toEqual(['c', ['f', 'q', 'w']]);
  });

  it('Saffron City Gym returns a basic Energy card from a Pokémon with Sabrina in its name to the hand', () => {
    const s = duel('sabrinasAbra', 'onix', { energy: ['psychic'] });
    stadium(s, 'saffronGym');
    const after = act(s, 'ash', { type: 'USE_STADIUM' });
    expect([ash(after).active!.energy, ash(after).hand.at(-1)!.defId]).toEqual([[], 'psychic']);
    expect(applyAction(after, 'ash', { type: 'USE_STADIUM' })).toMatchObject({ ok: false });
  });

  it('Fuchsia City Gym: on heads, a Pokémon with Koga in its name may be shuffled into the deck', () => {
    const s = duel('kogasZubat', 'onix', { bench: ['squirtle'] });
    stadium(s, 'fuchsiaGym');
    const after = resolve(act(flips(s, true), 'ash', { type: 'USE_STADIUM' }), 'ash', { target: 'active' });
    expect([ash(after).active, after.pendingPromotion]).toEqual([null, 'ash']);
  });
});
