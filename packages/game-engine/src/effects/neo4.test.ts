import { describe, expect, it } from 'vitest';
import { applyAction, retreatCost, type GameState } from '../index.js';
import { act, attack, duel, endTurn, flips, give, id, tryAttack } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const card = (name: string, n = 0) => ({ uid: `${name}-card-${n}`, defId: id(name) });

describe('Neo Destiny attacks', () => {
  it('Dark Drain: a coin for each of the opponent\'s Pokémon, 10 to each heads; Dark Crobat heals as much', () => {
    const start = duel('darkCrobat', 'machoke', { energy: ['grass', 'grass'], oppBench: ['charmander'] });
    ash(start).active!.damage = 30;
    const s = attack(flips(start, true, true), 0);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage, ash(s).active!.damage]).toEqual([10, 10, 10]);
  });

  it('Tusk Toss: heads returns the Defending Pokémon and its cards to the hand', () => {
    const s = attack(flips(duel('darkDonphan', 'machoke', { energy: ['fighting', 'fighting'], defenderEnergy: ['fighting'], oppBench: ['charmander'] }), true), 0);
    expect(misty(s).hand.filter((c) => c.defId === id('machoke') || c.defId === id('fighting')).length).toBe(2);
  });

  it('Pull In: switches in the chosen Benched Pokémon first, then damages it and puts it to Sleep', () => {
    // Misty's Asleep flip between the turns: tails.
    const s = attack(flips(duel('darkGengar', 'machoke', { energy: ['psychic', 'psychic', 'psychic'], oppBench: ['squirtle'] }), false), 0, { benchSlot: 0 });
    expect([misty(s).active!.card.defId, misty(s).active!.damage, misty(s).active!.condition]).toEqual([id('squirtle'), 30, 'asleep']);
  });

  it("Pull In: -1 doesn't switch", () => {
    const s = attack(flips(duel('darkGengar', 'machoke', { energy: ['psychic', 'psychic', 'psychic'], oppBench: ['squirtle'] }), false), 0, { benchSlot: -1 });
    expect([misty(s).active!.card.defId, misty(s).active!.damage, misty(s).active!.condition]).toEqual([id('machoke'), 30, 'asleep']);
  });

  it('Dark Fire: discarding a Darkness Energy card does 60', () => {
    const s = attack(duel('darkHoundoom', 'snorlax', { energy: ['fire', 'darkness'] }), 1);
    expect([misty(s).active!.damage, ash(s).active!.energy.length]).toEqual([60, 1]);
  });

  it('Rushing Flames: Fire Energy cards discarded from any of the Pokémon, 40 for each heads', () => {
    const start = duel('darkTyphlosion', 'snorlax', { energy: ['fire'], bench: ['charmander'] });
    ash(start).bench[0]!.energy.push(card('fire', 1));
    const s = attack(flips(start, true, true), 1, { energyUids: [ash(start).active!.energy[0]!.uid, 'fire-card-1'] });
    expect([misty(s).active!.damage, ash(s).bench[0]!.energy.length]).toEqual([80, 0]);
  });

  it("Mountain Smasher: a coin per Energy card, 20 each heads, and as many cards off the top of the opponent's deck", () => {
    const start = duel('darkTyranitar', 'machoke', { energy: ['fighting', 'fighting'] });
    const deck = misty(start).deck.length;
    const s = attack(flips(start, true, true), 0);
    // 2 discarded, then 1 drawn for Misty's turn.
    expect([misty(s).active!.damage, misty(s).deck.length]).toEqual([40, deck - 3]);
  });

  it('Gentle Flames: 30 to a Basic Pokémon, 10 to a Baby', () => {
    expect(misty(attack(duel('lightArcanine', 'snorlax', { energy: ['fire', 'fire', 'fire'] }), 0)).active!.damage).toBe(30);
    expect(misty(attack(flips(duel('lightArcanine', 'smoochum', { energy: ['fire', 'fire', 'fire'] }), true), 0)).active!.damage).toBe(10);
  });

  it('Bubble Jump: heads moves 2 Energy cards to the chosen Benched Pokémon and returns Light Azumarill to the hand', () => {
    const s = attack(flips(duel('lightAzumarill', 'snorlax', { energy: ['water', 'water', 'water'], bench: ['squirtle'] }), true), 1, { ownBenchSlot: 0 });
    expect([misty(s).active!.damage, ash(s).active, ash(s).bench[0]!.energy.length]).toEqual([30, null, 2]);
    expect(ash(s).hand.some((c) => c.defId === id('lightAzumarill'))).toBe(true);
  });

  it('Light Wave: next turn, attacks do Light Dragonite damage but nothing else', () => {
    let s = attack(duel('lightDragonite', 'haunter', { energy: ['fire', 'fire', 'fire'], defenderEnergy: ['psychic'] }), 0);
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.condition ?? null).toBeNull();
  });

  it("Poison Bind: Poisoned; heads holds it (it can't retreat or be switched out) through the opponent's next turn", () => {
    const s = attack(flips(duel('darkAriados', 'machoke', { energy: ['grass', 'grass', 'grass'], oppBench: ['charmander'] }), true), 1);
    expect([misty(s).active!.poison, misty(s).active!.effects?.heldBy?.switches]).toEqual([10, true]);
  });

  it("Prehistoric Water: heads shuffles the top Evolution card of the chosen Pokémon into its player's deck", () => {
    const start = duel('darkOmastar', 'charmeleon', { energy: ['water'] });
    misty(start).active!.evolvedFrom = [card('charmander', 1)];
    const s = attack(flips(start, true), 0, { oppTarget: 'active' });
    expect(misty(s).active!.card.defId).toBe(id('charmander'));
    expect([...misty(s).deck, ...misty(s).hand].some((c) => c.defId === id('charmeleon'))).toBe(true);
  });

  it("Dark Tentacle: the Defending Pokémon can't evolve from the hand next turn", () => {
    let s = attack(duel('darkOmastar', 'charmander', { energy: ['water', 'water'] }), 1);
    const [evo] = give(s, 'misty', 'charmeleon');
    s = { ...s, turn: 6 };
    expect(applyAction(s, 'misty', { type: 'EVOLVE', cardUid: evo!, target: 'active' }).ok).toBe(false);
  });

  it("Clamping Jaw: the Defending Pokémon can't retreat and needs heads to attack next turn", () => {
    const s = attack(duel('darkCroconaw', 'machoke', { energy: ['water', 'water'], defenderEnergy: ['fighting', 'fighting', 'fighting'], oppBench: ['charmander'] }), 0);
    expect(applyAction(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: [misty(s).active!.energy[0]!.uid] }).ok).toBe(false);
    expect(ash(attack(flips(s, false), 0, {}, 'misty')).active!.damage).toBe(0);
  });

  it("High Voltage: heads, the opponent can't play Trainer cards next turn", () => {
    const s = attack(flips(duel('darkFlaaffy', 'machoke', { energy: ['lightning'] }), true), 0);
    const [potion] = give(s, 'misty', 'potion');
    misty(s).active!.damage = 10;
    expect(applyAction(s, 'misty', { type: 'PLAY_TRAINER', cardUid: potion!, choices: { target: 'active' } }).ok).toBe(false);
  });

  it("Armor Up: an attack that would Knock Out Dark Forretress leaves it with 10 HP on heads", () => {
    let s = attack(duel('darkForretress', 'machoke', { energy: ['grass'], defenderEnergy: ['fighting', 'fighting', 'fighting', 'fighting'] }), 0);
    ash(s).active!.damage = 40;
    s = attack(flips(s, true), 1, {}, 'misty');
    expect(ash(s).active!.damage).toBe(50);
  });

  it("Call Back: a Basic Pokémon from the opponent's discard pile goes onto their Bench with a damage counter", () => {
    const start = duel('darkHaunter', 'machoke', { energy: ['psychic'] });
    misty(start).discard.push(card('squirtle', 1));
    const s = attack(start, 0);
    expect([misty(s).bench[0]!.card.defId, misty(s).bench[0]!.damage]).toEqual([id('squirtle'), 10]);
  });

  it('Explosive Evolution: heads, 10 to each of the opponent\'s Pokémon, then Dark Pupitar evolves into Dark Tyranitar from the deck', () => {
    const start = duel('darkPupitar', 'machoke', { energy: ['fire', 'fire', 'fire'], oppBench: ['charmander'] });
    ash(start).deck.unshift(card('darkTyranitar', 1));
    let s = attack(flips(start, true), 1);
    expect([misty(s).active!.damage, misty(s).bench[0]!.damage]).toEqual([10, 10]);
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'darkTyranitar-card-1' });
    expect(ash(s).active!.card.defId).toBe(id('darkTyranitar'));
  });

  it("Incinerate: the top card of the opponent's deck is discarded if it's a Trainer card", () => {
    const start = duel('darkQuilava', 'machoke', { energy: ['fire'] });
    misty(start).deck.unshift(card('potion', 1));
    const s = attack(start, 0);
    expect(misty(s).discard.some((c) => c.uid === 'potion-card-1')).toBe(true);
  });

  it('Rushing Magma: 20 for each Energy card among the top 5 cards of the deck', () => {
    const start = duel('darkQuilava', 'snorlax', { energy: ['fire', 'fire'] });
    ash(start).deck.unshift(card('fire', 1), card('water', 1), card('potion', 1));
    const s = attack(start, 1);
    expect(misty(s).active!.damage).toBe(40);
  });

  it('Slap Awake: 40 to an Asleep Defending Pokémon, which wakes up', () => {
    const start = duel('darkWigglytuff', 'machoke', { energy: ['fire', 'fire', 'fire'] });
    misty(start).active!.condition = 'asleep';
    const s = attack(start, 1);
    expect([misty(s).active!.damage, misty(s).active!.condition]).toEqual([40, null]);
  });

  it('Ice Pillar: next turn, attack damage to the Benched Pokémon is prevented while Light Dewgong is the Active Pokémon', () => {
    let s = attack(duel('lightDewgong', 'darkTyranitar', { energy: ['water', 'water', 'water'], defenderEnergy: ['fighting', 'fighting', 'fighting', 'fighting'], bench: ['charmander'] }), 1);
    s = attack(s, 1, { benchSlot: 0 }, 'misty');
    expect([ash(s).active!.damage, ash(s).bench[0]!.damage]).toEqual([30, 0]);
  });

  it('Burning Flame: a Fire Energy card discarded for each heads, 20 more each', () => {
    const s = attack(flips(duel('lightFlareon', 'snorlax', { energy: ['fire', 'fire', 'water'] }), true, true), 1);
    expect([misty(s).active!.damage, ash(s).active!.energy.length]).toEqual([70, 1]);
  });

  it('Pulse Guard: next turn, attack damage of 30 or more is prevented', () => {
    let s = attack(duel('lightJolteon', 'machoke', { energy: ['lightning'], defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 0);
    s = attack(s, 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(0);
  });

  it('Return Home: a Benched Pokémon and its cards are shuffled into the deck', () => {
    const start = duel('lightMachoke', 'machoke', { energy: ['fighting'], bench: ['squirtle'] });
    const s = attack(start, 0, { ownBenchSlot: 0 });
    expect(ash(s).bench[0]).toBeNull();
  });

  it('Fish Out: the opponent, then the attacking player, may shuffle up to 3 Pokémon cards from their discard pile into their deck', () => {
    const start = duel('lightSlowbro', 'machoke', { energy: ['psychic'] });
    misty(start).discard.push(card('squirtle', 1));
    ash(start).discard.push(card('squirtle', 2));
    let s = attack(start, 0);
    expect(s.pendingChoice).toMatchObject({ player: 'misty', kind: 'discardToDeck', count: 3 });
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'squirtle-card-1' });
    expect(s.pendingChoice).toMatchObject({ player: 'ash', kind: 'discardToDeck' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE' });
    expect([misty(s).discard.length, ash(s).discard.length, s.currentPlayer]).toEqual([0, 1, 'misty']);
  });

  it('Evolution Song: the opponent, then the attacking player, may evolve 1 Pokémon from the deck', () => {
    const start = duel('lightWigglytuff', 'charmander', { energy: ['fire'], bench: ['squirtle'] });
    misty(start).deck.unshift(card('charmeleon', 1));
    ash(start).deck.unshift(card('darkWartortle', 1));
    let s = attack(start, 0);
    s = act(s, 'misty', { type: 'RESOLVE_CHOICE', cardUid: 'charmeleon-card-1' });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: 'darkWartortle-card-1' });
    expect([misty(s).active!.card.defId, ash(s).bench[0]!.card.defId]).toEqual([id('charmeleon'), id('darkWartortle')]);
  });

  it("Charm: the Defending Pokémon's attacks do 10 less next turn, before Weakness", () => {
    let s = attack(duel('togepiNeo4', 'charmander', { energy: ['fire'], defenderEnergy: ['fire', 'fire'] }), 0);
    // Ember: 30, less 10.
    s = attack(s, 1, {}, 'misty');
    expect(ash(s).active!.damage).toBe(20);
  });

  it('Tentacle Wrap: tails, the Defending Pokémon costs 1 more to retreat next turn', () => {
    const s = attack(flips(duel('darkOctillery', 'machoke', { energy: ['water', 'water'] }), false), 1);
    expect(retreatCost(misty(s).active!, s.cards)).toBe(2);
  });

  it('Dodge: next turn, a heads prevents the damage', () => {
    let s = attack(duel('hitmonchanNeo4', 'machoke', { energy: ['fighting'], defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 0);
    s = attack(flips(s, true), 0, {}, 'misty');
    expect(ash(s).active!.damage).toBe(0);
  });

  it('Reflected Sunlight: up to 2 Energy cards from the hand go to the chosen Pokémon', () => {
    const start = duel('lightSunflora', 'machoke', { energy: ['fire', 'fire'], bench: ['squirtle'] });
    const [w1, w2] = give(start, 'ash', 'water', 'water');
    let s = attack(start, 0, { ownTarget: 0 });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: w1! });
    s = act(s, 'ash', { type: 'RESOLVE_CHOICE', cardUid: w2! });
    expect(ash(s).bench[0]!.energy.length).toBe(2);
  });

  it("Giant Wave: Mantine can't attack on its next turn", () => {
    let s = attack(duel('mantine', 'snorlax', { energy: ['water', 'water'] }), 0);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 0).ok).toBe(false);
  });

  it('White-Hot Flame: discards a Fire and a Lightning Energy card for 100; tails does 30 to Shining Charizard', () => {
    const s = attack(flips(duel('shiningCharizard', 'snorlax', { energy: ['fire', 'fire', 'fire', 'lightning', 'lightning'] }), false), 0);
    expect([misty(s).active, ash(s).active!.damage, ash(s).active!.energy.length]).toEqual([null, 30, 3]);
  });

  it('Reflect Shield: next turn, heads prevents the damage and does 20 back', () => {
    let s = attack(duel('shiningMewtwo', 'machoke', { energy: ['psychic', 'lightning'], defenderEnergy: ['fighting', 'fighting', 'fighting'] }), 0);
    s = attack(flips(s, true), 0, {}, 'misty');
    expect([ash(s).active!.damage, misty(s).active!.damage]).toEqual([0, 20]);
  });

  it("Crushing Earth: tails does nothing, and Shining Steelix can't attack on its next turn either way", () => {
    let s = attack(flips(duel('shiningSteelix', 'snorlax', { energy: ['fire', 'fire', 'fighting', 'fighting'] }), false), 0);
    expect(misty(s).active!.damage).toBe(0);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 0).ok).toBe(false);
  });

  it("Destructive Fire: for each heads, a Fire Energy card of Shining Tyranitar's and an Energy card of the Defending Pokémon's are discarded", () => {
    const s = attack(flips(duel('shiningTyranitar', 'snorlax', { energy: ['water', 'fire', 'fire', 'fire'], defenderEnergy: ['water', 'water'] }), true, true, false), 1);
    expect([misty(s).active!.damage, ash(s).active!.energy.length, misty(s).active!.energy.length]).toEqual([50, 2, 0]);
  });

  it('Mountain Crush: flips until tails; the opponent discards a card off the top of the deck for each heads', () => {
    const start = duel('shiningTyranitar', 'snorlax', { energy: ['water', 'fighting', 'fighting'] });
    const deck = misty(start).deck.length;
    const s = attack(flips(start, true, true, false), 0);
    expect(misty(s).deck.length).toBe(deck - 3);
  });

  it('[XXXXX]: Hidden Power flips until tails, 10 more each heads', () => {
    const s = attack(flips(duel('unownC', 'snorlax', { energy: ['psychic'], bench: ['unownX'] }), true, true, false), 0);
    expect(misty(s).active!.damage).toBe(30);
  });

  it('[Perform]: Hidden Power does as much more as the attack did to Unown P last turn', () => {
    const start = duel('unownP', 'machoke', { energy: ['psychic'] });
    // Misty's attack on turn 2 did 30 to it.
    ash(start).active!.effects = { attackedOn: { turn: 2, damage: 30, afflictions: [] } };
    const s = attack(start, 0);
    expect(misty(s).active!.damage).toBe(40);
  });
});
