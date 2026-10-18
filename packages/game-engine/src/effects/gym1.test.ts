import { describe, expect, it } from 'vitest';
import { applyAction, evolveError, getPlayerView, type GameState, type PokemonCardDef } from '../index.js';
import { act, attack, CARDS, duel, endTurn, flips, give, id, pokemon, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (uid: string, name: string) => ({ uid, defId: id(name) });

describe('Gym Heroes attacks', () => {
  it("an owner's Pokémon evolves only from the same owner's Pokémon", () => {
    const s = duel('brocksRhyhorn', 'onix', { bench: ['tentacool'] });
    expect(evolveError(CARDS[id('brocksRhydon')] as PokemonCardDef, ash(s).active!, s.cards, s.turn)).toBeNull();
    expect(evolveError(CARDS[id('mistysTentacruel')] as PokemonCardDef, ash(s).bench[0]!, s.cards, s.turn)).toBe("Misty's Tentacruel evolves from Misty's Tentacool");
  });

  it('Phoenix Flame: on tails, Blaine’s Moltres and its cards are shuffled into the deck after the damage', () => {
    const s = duel('blainesMoltres', 'blastoise', { energy: ['fire', 'fire', 'fire', 'fire', 'fire'], bench: ['charmander'] });
    const deck = ash(s).deck.length;
    const tails = attack(flips(s, false), 0);
    expect([misty(tails).active!.damage, ash(tails).active, ash(tails).deck.length, tails.pendingPromotion]).toEqual([90, null, deck + 6, 'ash']);
    expect(ash(attack(flips(s, true), 0)).active!.card.defId).toBe(id('blainesMoltres'));
  });

  it('Take Away shuffles both Active Pokémon and their cards into their decks', () => {
    const s = duel('erikasDragonair', 'onix', { energy: ['fire', 'fire', 'fire', 'fire'], defenderEnergy: ['fighting'], bench: ['charmander'], oppBench: ['squirtle'] });
    const [mine, theirs] = [ash(s).deck.length, misty(s).deck.length];
    const after = attack(s, 1);
    expect([ash(after).active, misty(after).active, ash(after).deck.length, misty(after).deck.length]).toEqual([null, null, mine + 5, theirs + 2]);
  });

  it('Mega Drain removes half the damage done, rounded up to the nearest 10', () => {
    const s = duel('erikasVileplume', 'onix', { energy: ['grass', 'grass', 'grass'] });
    ash(s).active!.damage = 50;
    expect(ash(attack(s, 0)).active!.damage).toBe(30);
  });

  it('Discharge discards every Lightning Energy card and flips a coin for each: 30 per heads', () => {
    const s = flips(duel('surgesElectabuzz', 'onix', { energy: ['lightning', 'lightning', 'fire'] }), true, false);
    const after = attack(s, 1);
    expect([misty(after).active!.damage, ash(after).active!.energy.map((e) => e.defId)]).toEqual([30, ['fire']]);
  });

  it('Charge attaches up to 2 Lightning Energy cards from the discard pile', () => {
    const s = duel('surgesElectabuzz', 'onix', { energy: ['lightning'] });
    ash(s).discard.push(card('l1', 'lightning'), card('l2', 'lightning'), card('f1', 'fire'));
    const after = attack(s, 0, { discardUids: ['l1', 'l2'] });
    expect([ash(after).active!.energy.length, ash(after).discard.map((c) => c.uid)]).toEqual([3, ['f1']]);
    expect(tryAttack(s, 0, { discardUids: ['f1'] })).toMatchObject({ ok: false });
  });

  it('Pain Amplifier puts a damage counter on each of the opponent’s Pokémon that has any', () => {
    const s = duel('sabrinasGengar', 'onix', { energy: ['psychic'], oppBench: ['squirtle', 'squirtle'] });
    misty(s).active!.damage = 10;
    misty(s).bench[1]!.damage = 20;
    const after = attack(s, 0);
    expect([misty(after).active!.damage, misty(after).bench[0]!.damage, misty(after).bench[1]!.damage]).toEqual([20, 0, 30]);
  });

  it('Hook Shot ignores Resistance, and so do Brock’s Pokémon with Pewter City Gym in play', () => {
    expect(misty(attack(duel('brocksGeodude', 'surgesSpearow', { energy: ['fighting', 'fighting'] }), 1)).active!.damage).toBe(20);
    const s = duel('brocksRhyhorn', 'surgesSpearow', { energy: ['fighting', 'fighting'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(0);
    s.stadium = { card: card('pewter', 'pewterGym'), owner: 'ash' };
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Swift ignores Defender and effects on the Defending Pokémon', () => {
    const s = duel('mistysStaryu', 'onix', { energy: ['water', 'water'] });
    misty(s).active!.attached = [{ card: card('defender', 'defender'), until: 4 }];
    misty(s).active!.effects = { preventAll: 3 };
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Shadow Images: the attacker flips, and tails does no damage, until Rocket’s Scyther takes damage', () => {
    const fresh = attack(duel('rocketsScyther', 'onix', { energy: ['grass'], defenderEnergy: ['fighting'] }), 0);
    const missed = attack(flips(fresh, false), 0, {}, 'misty');
    expect([ash(missed).active!.damage, ash(missed).active!.effects?.shadowImages]).toEqual([0, true]);
    const hit = attack(flips(fresh, true), 0, {}, 'misty');
    expect([ash(hit).active!.damage, ash(hit).active!.effects?.shadowImages]).toEqual([10, undefined]);
  });

  it('Fire Wall does 10 damage back to an attacker that damages Rocket’s Moltres next turn', () => {
    const s = attack(duel('rocketsMoltres', 'onix', { energy: ['fire', 'fire', 'fire'], defenderEnergy: ['fighting'] }), 0);
    const after = attack(s, 0, {}, 'misty');
    expect([ash(after).active!.damage, misty(after).active!.damage]).toEqual([10, 50]);
  });

  it("Crystal Beam: on heads, Energy cards can't be attached to the Defending Pokémon next turn", () => {
    const s = attack(flips(duel('mistysTentacoolC', 'onix', { energy: ['water', 'water'], oppBench: ['squirtle'] }), true), 0);
    const [water, water2] = give(s, 'misty', 'water', 'water');
    expect(applyAction(s, 'misty', { type: 'ATTACH_ENERGY', cardUid: water!, target: 'active' })).toMatchObject({ ok: false });
    expect(act(s, 'misty', { type: 'ATTACH_ENERGY', cardUid: water2!, target: 0 }).players.misty!.bench[0]!.energy).toHaveLength(1);
  });

  it("Suggestion: on heads, the Defending Pokémon can't attack next turn", () => {
    const s = attack(flips(duel('sabrinasDrowzee', 'onix', { energy: ['psychic'], defenderEnergy: ['fighting'] }), true), 0);
    expect(tryAttack(s, 0, {}, 'misty')).toEqual({ ok: false, error: "Onix can't attack this turn" });
  });

  it("Tunneling does 20 to up to 2 benched Pokémon, and Brock's Onix can't attack during its next turn", () => {
    let s = duel('brockOnixR', 'onix', { energy: ['fighting', 'fighting', 'fighting'], oppBench: ['squirtle', 'squirtle', 'squirtle'] });
    expect(tryAttack(s, 1, { benchSlots: [0] })).toMatchObject({ ok: false });
    s = attack(s, 1, { benchSlots: [0, 2] });
    expect(misty(s).bench.slice(0, 3).map((p) => p!.damage)).toEqual([20, 0, 20]);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 0)).toEqual({ ok: false, error: "Brock's Onix can't attack this turn" });
  });

  it('Magic Pollen gives the Defending Pokémon the condition chosen, on heads', () => {
    // Heads for Magic Pollen, then tails for Sleep between turns.
    const s = flips(duel('erikasGloom', 'onix', { energy: ['grass', 'grass', 'grass'] }), true, false);
    expect(misty(attack(s, 1, { condition: 'asleep' })).active!.condition).toBe('asleep');
    expect(misty(attack(s, 1, { condition: 'poisoned' })).active!.poison).toBe(10);
  });

  it('Fairy Power: on heads, any number of your Pokémon return to your hand, then the turn ends', () => {
    let s = attack(flips(duel('erikasClefable', 'onix', { energy: ['fire'], bench: ['charmander', 'squirtle'] }), true), 0);
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'ownPokemon', purpose: 'return', optional: true });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', target: 0 });
    expect([ash(s).bench[0], ash(s).hand.at(-1)!.defId]).toEqual([null, id('charmander')]);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect([s.pendingChoice, s.currentPlayer]).toEqual([undefined, 'misty']);
  });

  it('Lava Burst discards the top 5 cards of the deck: 20 damage per Fire Energy card among them', () => {
    const s = duel('blainesMagmar', 'onix', { energy: ['fire', 'fire', 'fire'] });
    ash(s).deck = ['fire', 'fire', 'charmander', 'fire', 'water', 'fire'].map((n, i) => card(`d${i}`, n));
    const after = attack(s, 1);
    expect([misty(after).active!.damage, ash(after).deck.map((c) => c.uid)]).toEqual([60, ['d5']]);
  });

  it("Focus Energy doubles Gnaw's base damage during the next turn", () => {
    let s = endTurn(attack(duel('surgesRattata', 'onix', { energy: ['fire', 'fire'] }), 0), 'misty');
    s = attack(s, 1);
    expect(misty(s).active!.damage).toBe(40);
  });

  it('Sleight of Hand puts up to 3 cards from the hand on top of the deck, then takes as many basic Energy cards', () => {
    let s = duel('sabrinasMrMime', 'onix', { energy: ['psychic'] });
    ash(s).hand = [card('h1', 'charmander'), card('h2', 'squirtle')];
    ash(s).deck = [card('e1', 'water'), card('e2', 'fire'), card('c1', 'charmander')];
    s = act(attack(s, 0), 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'h1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect(getPlayerView(s, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: [{ uid: 'e2' }, { uid: 'e1' }] });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'e1' });
    expect([ash(s).hand.map((c) => c.uid), s.currentPlayer]).toEqual([['h2', 'e1'], 'misty']);
  });

  it('Jellyfish Pod takes any number of Tentacool and Tentacruel from the deck', () => {
    const s = duel('mistysTentacool', 'onix', { energy: ['water', 'water'] });
    ash(s).deck = [card('t1', 'mistysTentacruel'), card('c1', 'charmander'), card('t2', 'tentacool')];
    const view = getPlayerView(attack(s, 1), 'ash').self.pendingChoice;
    expect(view?.kind === 'pickFromDeck' && view.optional && view.options.map((c) => c.uid).sort()).toEqual(['t1', 't2']);
  });
});

describe('Gym Heroes Pokémon Powers', () => {
  it('Pollen Defense: an attack that damages Erika’s Vileplume as the Active Pokémon may confuse the attacker', () => {
    const s = flips(duel('charmander', 'erikasVileplume', { energy: ['fire'] }), true);
    expect(ash(attack(s, 0)).active!.condition).toBe('confused');
    expect(ash(attack(flips(s, false), 0)).active!.condition).toBeFalsy();
  });

  it('Restless Sleep does 20 damage to an attacker that damages the Asleep Rocket’s Snorlax', () => {
    const s = duel('charmander', 'rocketsSnorlax', { energy: ['fire'] });
    expect(ash(attack(s, 0)).active!.damage).toBe(0);
    misty(s).active!.condition = 'asleep';
    expect(ash(attack(s, 0)).active!.damage).toBe(20);
  });

  it('Shell Armor takes 10 off attack damage to Misty’s Cloyster', () => {
    expect(misty(attack(duel('charmander', 'mistysCloyster', { energy: ['fire', 'fire'] }), 1)).active!.damage).toBe(20);
  });

  it('Strange Barrier: an attack by a Basic Pokémon that does 20 or more damage to Erika’s Dratini does 10', () => {
    expect(misty(attack(duel('charmander', 'erikasDratini', { energy: ['fire', 'fire'] }), 1)).active!.damage).toBe(10);
    expect(misty(attack(duel('charmeleon', 'erikasDratini', { energy: ['fire', 'fire', 'fire'] }), 0)).active!.damage).toBe(30);
  });

  it("Photosynthesis: Erika's Oddish's Energy is all Grass", () => {
    expect(tryAttack(duel('erikasOddish', 'onix', { energy: ['fire', 'water'] }), 0)).toMatchObject({ ok: true });
  });

  it("Rebirth returns a Knocked Out Rocket's Moltres to the hand, unless it was Asleep", () => {
    const s = duel('charmander', 'rocketsMoltres', { energy: ['fire'], oppBench: ['squirtle'] });
    misty(s).active!.damage = 50;
    const after = attack(s, 0);
    expect([misty(after).hand.some((c) => c.defId === id('rocketsMoltres')), misty(after).discard.some((c) => c.defId === id('rocketsMoltres'))]).toEqual([true, false]);
    misty(s).active!.condition = 'asleep';
    expect(misty(attack(s, 0)).discard.some((c) => c.defId === id('rocketsMoltres'))).toBe(true);
  });

  it("Energy Charge moves Lightning Energy cards to Lt. Surge's Magneton while it's the Active Pokémon", () => {
    const s = duel('surgesMagneton', 'onix', { bench: ['surgesElectabuzz'] });
    ash(s).bench[0]!.energy = [card('l1', 'lightning'), card('f1', 'fire')];
    const after = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: { from: 0 } });
    expect([ash(after).active!.energy.map((e) => e.uid), ash(after).bench[0]!.energy.map((e) => e.uid)]).toEqual([['l1'], ['f1']]);
    ash(s).bench[1] = pokemon('surgesMagneton');
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 1, choices: { from: 0 } })).toMatchObject({ ok: false });
  });

  it('Fragrance Trap: on heads, one of the opponent’s benched Pokémon is switched in', () => {
    const s = flips(duel('charmander', 'onix', { bench: ['victreebelG'], oppBench: ['squirtle'] }), true);
    const after = act(s, 'ash', { type: 'USE_POWER', source: 0, choices: { oppTo: 0 } });
    expect([misty(after).active!.card.defId, misty(after).bench[0]!.card.defId]).toEqual([id('squirtle'), id('onix')]);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 0, choices: { oppTo: 0 } })).toMatchObject({ ok: false });
  });

  it("Natural Healing removes a damage counter from Blaine's Vulpix once a turn", () => {
    const s = duel('blainesVulpix', 'onix');
    ash(s).active!.damage = 20;
    const after = act(s, 'ash', { type: 'USE_POWER', source: 'active' });
    expect(ash(after).active!.damage).toBe(10);
    expect(applyAction(after, 'ash', { type: 'USE_POWER', source: 'active' })).toMatchObject({ ok: false });
  });
});
