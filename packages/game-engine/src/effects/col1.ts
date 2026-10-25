// Call of Legends (col1) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Many reprint HeartGold & SoulSilver's series and play as those; the Shiny Legends (SL) play as their regular prints.
// From the text: Fairy Power returns one of the player's Pokémon, Clefable too; Destructive Tsunami's tails does its 40 to each
// of the player's own Pokémon, Kyogre with its Weakness and Resistance (agreed 2026-10-25); Wormhole's opponent switches even when the player has no Benched Pokémon to
// switch with; Clomp Clomp Clobber's Energy card is picked once the attack is over when they differ; Lost Claw's card is one
// at random (without looking); Prehistoric Wisdom draws 3 even with no card to put in the Lost Zone; Raging Thunder's
// Pokémon (the player's) is picked before the attack.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isPokemonCard, lookupCard } from '../cards.js';
import { energyPool } from '../engine.js';
import { nextRandom, shuffle } from '../rng.js';
import { sameCards } from '../status.js';
import { benchedSlots, energyCards, flipToInflict, opponentSwitches, same } from './common.js';
import { discardOwnEnergy, removeDefenderEnergy } from './dp1.js';
import { DP7 } from './dp7.js';
import { notNextTurn } from './ex6.js';
import { GYM2 } from './gym2.js';
import { HGSS1 } from './hgss1.js';
import { HGSS2 } from './hgss2.js';
import { HGSS3 } from './hgss3.js';
import { HGSS4, ownActiveDamage } from './hgss4.js';

const name = (ctx: AttackContext, uid: { defId: string }) => lookupCard(ctx.state.cards, uid.defId).name;
const boosted = (ctx: AttackContext, attack: string) => ctx.attacker.effects?.boostedAttack?.attack === attack && ctx.attacker.effects.boostedAttack.turn === ctx.turn;

/** Cell Storm: 2 Psychic Energy discarded, 6 damage counters off Deoxys. */
const cellStorm: AttackEffect = {
  run(ctx) {
    ctx.hit(60);
    discardOwnEnergy(ctx, 2, 'Cell Storm', ['psychic']);
    ctx.heal(60);
  },
};
/** Time Rewind: the hand shuffled into the deck. */
const timeRewind: AttackEffect = {
  run(ctx) {
    ctx.hit(70);
    [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...ctx.me.hand], ctx.state.rngState);
    ctx.me.hand = [];
    ctx.log('Shuffled the hand into the deck.');
  },
};
/** Volcano Stomp: heads, the opponent's top 4 cards discarded; tails, the player's. */
const volcanoStomp: AttackEffect = {
  run(ctx) {
    ctx.hit(80);
    const side = ctx.flip() ? ctx.opp : ctx.me;
    const top = side.deck.splice(0, 4);
    side.discard.push(...top);
    ctx.log(`Discarded the top ${top.length} cards of the deck.`, side.id);
  },
};
/** Destructive Tsunami: heads, 40 to each of the opponent's Pokémon; tails, to each of the player's. */
const destructiveTsunami: AttackEffect = {
  run(ctx) {
    if (ctx.flip()) {
      ctx.hit(40);
      ctx.benchDamage(ctx.opp, 40);
    } else {
      ctx.selfDamage(ownActiveDamage(ctx, 40));
      ctx.benchDamage(ctx.me, 40);
    }
  },
};
/** Wormhole: Palkia switched with a Benched Pokémon; then the opponent switches. */
const wormhole: AttackEffect = {
  choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: 'Wormhole: choose one of your Benched Pokémon to switch Palkia with' }] : []),
  run(ctx) {
    ctx.hit(60);
    const slot = ctx.choices.ownBenchSlot;
    if (slot !== undefined && ctx.me.bench[slot]) ctx.switchOwn(slot);
    opponentSwitches(ctx, 'Wormhole');
  },
};

export const COL1: Record<string, Record<string, AttackEffect>> = {
  // Clefable – Fairy Power: one of the player's Pokémon and its cards back into the hand.
  'col1-1': { 'Fairy Power': { run: (ctx) => ctx.pend({ kind: 'returnOwn', source: 'Fairy Power' }) } },
  // Deoxys – Cell Storm. Dialga – Time Rewind. Groudon – Volcano Stomp. Kyogre – Destructive Tsunami. Palkia – Wormhole.
  'col1-2': { 'Cell Storm': cellStorm },
  'col1-SL1': { 'Cell Storm': cellStorm },
  'col1-3': { 'Time Rewind': timeRewind },
  'col1-SL2': { 'Time Rewind': timeRewind },
  'col1-6': { 'Volcano Stomp': volcanoStomp },
  'col1-SL4': { 'Volcano Stomp': volcanoStomp },
  'col1-12': { 'Destructive Tsunami': destructiveTsunami },
  'col1-SL6': { 'Destructive Tsunami': destructiveTsunami },
  'col1-19': { Wormhole: wormhole },
  'col1-SL8': { Wormhole: wormhole },
  // Reprints of the HeartGold & SoulSilver series' attacks.
  'col1-4': { 'Solar Suggestion': same(() => HGSS3['hgss3-2']?.['Solar Suggestion']) },
  'col1-5': { 'Everyone Explode Now': same(() => HGSS3['hgss3-3']?.['Everyone Explode Now']) },
  'col1-10': { 'Dark Roar': same(() => HGSS3['hgss3-5']?.['Dark Roar']) },
  'col1-11': { 'Time Hollow': same(() => HGSS2['hgss2-1']?.['Time Hollow']) },
  'col1-16': { 'Mantle Bazooka': same(() => HGSS2['hgss2-2']?.['Mantle Bazooka']) },
  'col1-23': { 'Acceleration Bolt': same(() => HGSS1['hgss1-14']?.['Acceleration Bolt']) },
  'col1-26': { 'Timid Tackle': same(() => HGSS1['hgss1-22']?.['Timid Tackle']) },
  'col1-30': { Headwind: same(() => HGSS4['hgss4-29']?.Headwind) },
  'col1-36': { 'Mischievous Punch': same(() => HGSS1['hgss1-33']?.['Mischievous Punch']) },
  'col1-38': { 'Super Explosion': same(() => HGSS1['hgss1-34']?.['Super Explosion']) },
  'col1-46': { 'Play with Fire': same(() => HGSS4['hgss4-41']?.['Play with Fire']) },
  'col1-48': { Twister: same(() => HGSS4['hgss4-47']?.Twister) },
  'col1-64': { 'Selfish Draw': same(() => HGSS3['hgss3-56']?.['Selfish Draw']) },
  'col1-65': { 'Dual Draw': same(() => HGSS3['hgss3-57']?.['Dual Draw']) },
  'col1-67': { Messenger: same(() => HGSS4['hgss4-71']?.Messenger) },
  'col1-68': { 'Focus Energy': same(() => HGSS3['hgss3-63']?.['Focus Energy']), 'Surprise Attack': same(() => HGSS3['hgss3-63']?.['Surprise Attack']) },
  // Leafeon – Miasma Wind; Umbreon – Moonlight Fang: as Undaunted's. Mismagius – Poltergeist: as Stormfront's.
  'col1-13': { 'Miasma Wind': same(() => HGSS3['hgss3-17']?.['Miasma Wind']) },
  'col1-22': { 'Moonlight Fang': same(() => HGSS3['hgss3-10']?.['Moonlight Fang']) },
  'col1-28': { Poltergeist: same(() => DP7['dp7-18']?.['Poltergeist']) },
  // Lucario – Dimension Sphere: 20 more for each of the player's Pokémon in the Lost Zone.
  'col1-14': { 'Dimension Sphere': { run: (ctx) => void ctx.hit(30 + 20 * (ctx.me.lostZone ?? []).filter((c) => isPokemonCard(lookupCard(ctx.state.cards, c.defId))).length) } },
  // Pachirisu – Shocking Bolt: every Energy card on Pachirisu to the Lost Zone.
  'col1-18': {
    'Shocking Bolt': {
      run(ctx) {
        ctx.hit(50);
        const gone = energyCards(ctx.attacker);
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !gone.includes(e));
        (ctx.me.lostZone ??= []).push(...gone.map(({ converted: _c, windless: _w, ...c }) => c));
        if (gone.length) ctx.log(`Put ${gone.length} Energy card${gone.length === 1 ? '' : 's'} in the Lost Zone.`);
      },
    },
  },
  // Snorlax – Layabout: every damage counter off, not again next turn. Clomp Clomp Clobber: an Energy card on Snorlax to the Lost Zone.
  'col1-33': {
    Layabout: {
      run(ctx) {
        ctx.heal('all');
        notNextTurn(ctx, 'Layabout');
      },
    },
    'Clomp Clomp Clobber': {
      run(ctx) {
        ctx.hit(80);
        const energy = energyCards(ctx.attacker);
        if (energy.length > 1 && !sameCards(ctx.state.cards, energy)) return ctx.pend({ kind: 'discardAttached', source: 'Clomp Clomp Clobber', target: 'active', count: 1, toLostZone: true });
        const [card] = energy;
        if (!card) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        (ctx.me.lostZone ??= []).push(card);
        ctx.log(`Put ${name(ctx, card)} in the Lost Zone.`);
      },
    },
  },
  // Tangrowth – Grind: 20 for each Energy on it. Plow Over: heads, Paralyzed; tails, an Energy card on the Defending Pokémon to the Lost Zone.
  'col1-34': {
    Grind: { run: (ctx) => void ctx.hit(20 * energyPool(ctx.attacker, ctx.state.cards).length) },
    'Plow Over': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) ctx.inflict('paralyzed');
        else removeDefenderEnergy(ctx, 1, 'Plow Over', { toLostZone: true });
      },
    },
  },
  // Zangoose – Swords Dance: Lost Claw's base damage is 80 next turn. Lost Claw: a card from the opponent's hand at random to the Lost Zone.
  'col1-39': {
    'Swords Dance': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Lost Claw', turn: ctx.turn + 2 };
        ctx.log("Zangoose's Lost Claw's base damage is 80 next turn.");
      },
    },
    'Lost Claw': {
      run(ctx) {
        ctx.hit(boosted(ctx, 'Lost Claw') ? 80 : 30);
        if (!ctx.opp.hand.length) return;
        const [r, next] = nextRandom(ctx.state.rngState);
        ctx.state.rngState = next;
        const [card] = ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1);
        (ctx.opp.lostZone ??= []).push(card!);
        ctx.log(`Put ${name(ctx, card!)} from the hand in the Lost Zone.`, ctx.opp.id);
      },
    },
  },
  // Flaaffy – Thundershock: heads, Paralyzed.
  'col1-43': { Thundershock: flipToInflict(40, 'paralyzed') },
  // Mime Jr. – Sleepy Lost: the opponent's top card to the Lost Zone; Mime Jr. is now Asleep.
  'col1-47': {
    'Sleepy Lost': {
      run(ctx) {
        const [top] = ctx.opp.deck.splice(0, 1);
        if (top) {
          (ctx.opp.lostZone ??= []).push(top);
          ctx.log(`Put ${name(ctx, top)} from the top of the deck in the Lost Zone.`, ctx.opp.id);
        }
        ctx.sleepSelf();
      },
    },
  },
  // Seviper – Poison Buildup: as Gym Challenge's. Poison Effect: Poisoned, 60 more, and the Poison removed.
  'col1-51': {
    'Poison Buildup': same(() => GYM2['gym2-25']?.['Poison Buildup']),
    'Poison Effect': {
      run(ctx) {
        const poisoned = !!ctx.attacker.poison;
        ctx.hit(poisoned ? 80 : 20);
        if (!poisoned) return;
        delete ctx.attacker.poison;
        ctx.log(`${ctx.attackerDef.name} is no longer Poisoned.`);
      },
    },
  },
  // Clefairy – Minimize: 20 less damage next turn.
  'col1-54': { Minimize: { run: (ctx) => ctx.protect('minimize') } },
  // Relicanth – Prehistoric Wisdom: a card from the hand to the Lost Zone, then 3 cards drawn.
  'col1-69': {
    'Prehistoric Wisdom': {
      run(ctx) {
        if (ctx.me.hand.length) ctx.pend({ kind: 'discardFromHand', source: 'Prehistoric Wisdom', count: 1, toLostZone: true, drawEach: 3 });
        else ctx.draw(3);
      },
    },
  },
  // Teddiursa – Fake Tears: heads, no Trainer cards for the opponent next turn and 30 less damage to Teddiursa.
  'col1-73': {
    'Fake Tears': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Fake Tears did nothing.');
        ctx.opp.noTrainersUntil = ctx.turn + 1;
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 30, until: ctx.turn + 1 };
        ctx.log("Your opponent can't play Trainer cards next turn.", ctx.opp.id);
      },
    },
  },
  // Entei – Wild Blaze: the top 3 cards of the deck discarded.
  'col1-SL3': {
    'Wild Blaze': {
      run(ctx) {
        ctx.hit(70);
        const top = ctx.me.deck.splice(0, 3);
        ctx.me.discard.push(...top);
        ctx.log(`Discarded the top ${top.length} cards of the deck.`);
      },
    },
  },
  // Raikou – Raging Thunder: 20 to one of the player's Pokémon, no Weakness or Resistance.
  'col1-SL9': {
    'Raging Thunder': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ['active', ...benchedSlots(s.ownBench)], prompt: 'Raging Thunder: choose one of your Pokémon to take 20 damage' }],
      run(ctx) {
        ctx.hit(70);
        const own = ctx.choices.ownTarget ?? 'active';
        if (own === 'active') ctx.selfDamage(20);
        else if (ctx.me.bench[own]) ctx.damageBenched(ctx.me, own, 20);
      },
    },
  },
};
