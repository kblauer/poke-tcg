// Dark Explorers (bw5) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "a Fire Energy" or "a Lightning Energy" to discard is an Energy card of that type, basic or Special
// (energyCardOf), asked before the attack (Fire Slash, Electrigun); Burning Wind's is any Energy card; Deck and Cover's
// Pokémon is shuffled away once the attack is over (its Special Conditions given first); Slurp Shakedown's 60 is for
// whichever Pokémon is the opponent's Active one after the switch (the old one, with no Benched Pokémon to switch in);
// Electrisilk reads the Defending Pokémon's Retreat Cost as it is now (Dark Cloak, Stadiums…); Junk Hunt takes Item cards
// (agreed: any Trainer but a Supporter or a Stadium); Chuck's Pokémon Tool cards are the player's pick, asked once the
// attack is over when they differ.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { lookupCard, namesMatch, type EnergyType } from '../cards.js';
import { activeLocked, retreatCost, type CardInstance, type PlayerState } from '../engine.js';
import { shuffle } from '../rng.js';
import { pokemonName, sameCards } from '../status.js';
import { trainerEffect } from './index.js';
import { opponentBenchChoice } from './common.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { discardFree } from './neo3.js';

/** The Energy cards of `type` (basic or Special) attached to the attacker; any Energy card without a type. */
const energyOfType = (cards: Parameters<typeof energyCardOf>[0], energy: CardInstance[], type?: EnergyType) => energy.filter((e) => !e.provides && (!type || energyCardOf(cards, e, type)));

/** "You may discard a [type] Energy attached to this Pokémon. If you do, this attack does N more damage" (Fire Slash, Electrigun). */
const discardForMore = (damage: number, more: number, type: EnergyType, label: string): AttackEffect => ({
  choices: (s): ChoiceSpec[] => (energyOfType(s.cards, s.attacker.energy, type).length ? [{ kind: 'boost', options: [true, false], prompt: `Discard a ${label} Energy attached to it for ${more} more damage?` }] : []),
  run(ctx) {
    const [card] = energyOfType(ctx.state.cards, ctx.attacker.energy, type);
    const discarding = !!ctx.choices.boost && !!card;
    if (discarding) discardOwn(ctx, [card!]);
    ctx.hit(damage + (discarding ? more : 0));
  },
});

/** Random cards from `player`'s hand, revealed and shuffled into their deck (Astonish, Hooligans Jim & Cas). */
export function randomHandToDeck(state: AttackContext['state'], player: PlayerState, n: number, log: (text: string) => void) {
  if (!player.hand.length) return log('There were no cards in the hand.');
  const [mixed, rng] = shuffle(player.hand, state.rngState);
  const picked = mixed.slice(0, n);
  player.hand = player.hand.filter((c) => !picked.includes(c));
  [player.deck, state.rngState] = shuffle([...player.deck, ...picked], rng);
  log(`Revealed ${picked.map((c) => lookupCard(state.cards, c.defId).name).join(', ')} and shuffled ${picked.length === 1 ? 'it' : 'them'} into the deck.`);
}

/** "Shuffle this Pokémon and all cards attached to it into your deck", once the attack is over. */
function shuffleSelf(ctx: AttackContext) {
  const p = ctx.attacker;
  if (ctx.me.active !== p) return;
  const locked = activeLocked(ctx.state, ctx.me.id);
  if (locked) return ctx.log(`${locked}.`);
  const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, converted: _c, windless: _w, ...c }) => c), ...(p.attached ?? []).map((a) => a.card)];
  [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...cards], ctx.state.rngState);
  ctx.me.active = null;
  ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it were shuffled into the deck.`);
}

/** "Flip a coin. If heads, attach an Energy card from your discard pile to this Pokémon" (Charge Beam). */
const chargeBeam = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.flip() || !ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy') || !discardFree(ctx)) return;
    ctx.pend({ kind: 'attachFromDiscard', source: 'Charge Beam', count: 1, target: 'active', anyEnergy: true });
  },
});

/** "Flip 3 coins. If 1 of them is heads, 10 more; 2, 30 more; all of them, 60 more" (Fury Cutter, as Maractus's Constant Rattle). */
const furyCutter = (damage: number): AttackEffect => ({ run: (ctx) => void ctx.hit(damage + [0, 10, 30, 60][ctx.flips(3)]!) });

/** The Pokémon Tool cards in a hand. */
const toolsIn = (hand: CardInstance[]) => hand.filter((c) => !!trainerEffect(c.defId)?.tool);

export const BW5: Record<string, Record<string, AttackEffect>> = {
  // Carnivine – Spit Squall: the Defending Pokémon and every card attached to it into the opponent's hand.
  'bw5-5': { 'Spit Squall': { run: (ctx) => ctx.returnDefender() } },
  // Accelgor – Deck and Cover: Paralyzed and Poisoned, then Accelgor and its cards shuffled into the deck.
  'bw5-11': {
    'Deck and Cover': {
      run(ctx) {
        ctx.hit(50);
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
        ctx.after(() => shuffleSelf(ctx));
      },
    },
  },
  // Flareon – Fire Slash: may discard a Fire Energy for 30 more.
  'bw5-12': { 'Fire Slash': discardForMore(60, 30, 'fire', 'Fire') },
  // Entei-EX – Grand Flame: a Fire Energy card from the discard pile onto 1 of the player's Benched Pokémon.
  'bw5-13': {
    'Grand Flame': {
      run(ctx) {
        ctx.hit(90);
        const fire = ctx.me.discard.some((c) => energyCardOf(ctx.state.cards, c, 'fire') && lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        if (fire && ctx.me.bench.some(Boolean) && discardFree(ctx)) ctx.pend({ kind: 'attachFromDiscard', source: 'Grand Flame', count: 1, type: 'fire', benchOnly: true });
      },
    },
  },
  // Heatmor – Hot Lick: 50 more to a Durant.
  'bw5-19': { 'Hot Lick': { run: (ctx) => void ctx.hit(namesMatch(ctx.defenderDef.name, 'Durant') ? 60 : 10) } },
  // Volcarona – Burning Wind: may discard an Energy attached to it; if it does, the Defending Pokémon is Burned.
  'bw5-22': {
    'Burning Wind': {
      choices: (s): ChoiceSpec[] => (energyOfType(s.cards, s.attacker.energy).length ? [{ kind: 'boost', options: [true, false], prompt: 'Discard an Energy attached to it to Burn the Defending Pokémon?' }] : []),
      run(ctx) {
        ctx.hit(70);
        const energy = energyOfType(ctx.state.cards, ctx.attacker.energy);
        if (!ctx.choices.boost || !energy.length) return;
        // Which Energy card goes: the player's pick once the attack is over, when they differ (the same-card rule).
        if (sameCards(ctx.state.cards, energy)) discardOwn(ctx, [energy[0]!]);
        else ctx.pend({ kind: 'discardAttached', source: 'Burning Wind', target: 'active' });
        ctx.inflict('burned');
      },
    },
  },
  // Glaceon – Reflect Energy: an Energy from it to 1 of the player's Benched Pokémon.
  'bw5-30': {
    'Reflect Energy': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.attacker.energy.length && ctx.me.bench.some(Boolean) && ctx.me.active === ctx.attacker) ctx.pend({ kind: 'fastStream', source: 'Reflect Energy' });
      },
    },
  },
  // Jolteon – Electrigun: may discard a Lightning Energy for 40 more.
  'bw5-37': { Electrigun: discardForMore(20, 40, 'lightning', 'Lightning') },
  // Galvantula – Electrisilk: 40 more if the Defending Pokémon has no Retreat Cost.
  'bw5-43': { Electrisilk: { run: (ctx) => void ctx.hit(retreatCost(ctx.defender, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card) <= 0 ? 70 : 30) } },
  // Tynamo – Charge Beam: heads, an Energy card from the discard pile onto it.
  'bw5-44': { 'Charge Beam': chargeBeam(10) },
  // Eelektross – Slurp Shakedown: one of the opponent's Benched Pokémon (the player's pick) switched in, then 60 to it.
  'bw5-47': {
    'Slurp Shakedown': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch in"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
        ctx.hit(60);
      },
    },
  },
  // Slowking – Hand Press: 30 more with more cards in the player's hand than the opponent's.
  'bw5-49': { 'Hand Press': { run: (ctx) => void ctx.hit(ctx.me.hand.length > ctx.opp.hand.length ? 80 : 50) } },
  // Yamask – Astonish: heads, a random card from the opponent's hand, revealed, shuffled into their deck.
  'bw5-51': {
    Astonish: {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip()) randomHandToDeck(ctx.state, ctx.opp, 1, (text) => ctx.log(text, ctx.opp.id));
      },
    },
  },
  // Cofagrigus – Chuck: any number of Pokémon Tool cards from the hand discarded, 40 for each.
  'bw5-52': {
    Chuck: {
      choices(s): ChoiceSpec[] {
        const n = toolsIn(s.ownHand ?? []).length;
        return n ? [{ kind: 'amount', options: Array.from({ length: n + 1 }, (_, i) => n - i), prompt: 'Chuck: how many Pokémon Tool cards do you discard from your hand (40 damage each)?' }] : [];
      },
      run(ctx) {
        const tools = toolsIn(ctx.me.hand);
        const n = Math.min(ctx.choices.amount ?? 0, tools.length);
        ctx.hit(40 * n);
        if (!n) return;
        if (n === tools.length || sameCards(ctx.state.cards, tools)) {
          const gone = tools.slice(0, n);
          ctx.me.hand = ctx.me.hand.filter((c) => !gone.includes(c));
          ctx.me.discard.push(...gone);
          ctx.log(`Discarded ${gone.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the hand.`);
        } else ctx.pend({ kind: 'discardFromHand', source: 'Chuck', count: n, only: 'toolOrMachine' });
      },
    },
  },
  // Groudon-EX – Giant Claw: 40 more if the Defending Pokémon already has 2 or more damage counters.
  'bw5-54': { 'Giant Claw': { run: (ctx) => void ctx.hit(ctx.defender.damage >= 20 ? 120 : 80) } },
  // Excadrill – Dig Uppercut: a card from the discard pile into the hand.
  'bw5-56': {
    'Dig Uppercut': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.me.discard.length && discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source: 'Dig Uppercut', count: 1, filter: 'any', exact: true });
      },
    },
  },
  // Sableye – Junk Hunt: 2 Item cards from the discard pile into the hand.
  'bw5-62': {
    'Junk Hunt': {
      run(ctx) {
        if (discardFree(ctx)) ctx.pend({ kind: 'discardToHand', source: 'Junk Hunt', count: 2, filter: 'item', exact: true });
      },
    },
  },
  // Bisharp – Fury Cutter: 3 coins; 10 more for 1 heads, 30 for 2, 60 for 3.
  'bw5-72': { 'Fury Cutter': furyCutter(30) },
  // Klang – Charge Beam: as Tynamo's.
  'bw5-76': { 'Charge Beam': chargeBeam(20) },
  // Haxorus – Stunning Uppercut: 2 heads also Paralyze; 2 tails, nothing.
  'bw5-89': {
    'Stunning Uppercut': {
      run(ctx) {
        const heads = ctx.flips(2);
        if (!heads) return ctx.log('Stunning Uppercut did nothing.');
        ctx.hit(80);
        if (heads === 2) ctx.inflict('paralyzed');
      },
    },
  },
  // Tornadus-EX – Blow Through: 30 more while any Stadium card is in play.
  'bw5-90': { 'Blow Through': { run: (ctx) => void ctx.hit(ctx.state.stadium ? 60 : 30) } },
};
