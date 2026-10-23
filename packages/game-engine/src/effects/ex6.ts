// EX FireRed & LeafGreen (ex6) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts)
// don't play. Rulings follow the card text and the earlier EX sets'.
// Agreed with the user: Burn Down's 5 Fire Energy and the Energy Energy Flame turns to Fire count Energy provided (Double
// Colorless is 2); Crush and Burn (and Volcanic Ash) count the Energy cards discarded; Slow Trip Gas's Confusion happens only to
// the Pokémon still Active then (as Aqua Trance); Toss and Turn can be used while Snorlax is Asleep.
// From the text: Linear Attack, Bound Crush and Tunneling's damage to a Benched Pokémon has no Weakness or Resistance;
// Hyper Whirlpool's Energy cards are the opponent's pick, Twister's the attacking player's (after the flips); Vine Tease's
// Prize card is picked after looking at them all; Look for Friends reveals cards from the top until a Basic Pokémon (all
// shuffled back if there's none); Metronome copies the Defending Pokémon's attack with its other requirements (as
// Mini-Metronome); the attacks that "may discard" an Energy card ask before the attack.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch, type EnergyType } from '../cards.js';
import { counts, discardTheirEnergy, energyPool, energyProvided, isEnergyCardOf, type CardInstance, type Target } from '../engine.js';
import { shuffle } from '../rng.js';
import { inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { handTrainerFits } from '../trainers.js';
import { benchedSlots, headsUntilTails, opponentBenchChoice, same } from './common.js';
import { copyAttack } from './ecard2.js';
import { energyAmount } from './ex1.js';
import { discardOwn, inPlay, putCounters } from './ex2.js';
import { knockOver } from './ex4.js';
import { healUpTo } from './si1.js';
import { EX2 } from './ex2.js';
import { EX3 } from './ex3.js';
import { EX5 } from './ex5.js';
import { energyCanGo } from './neo3.js';
import { ROCKET } from './rocket.js';

/** "Choose 1 of your opponent's Pokémon. This attack does `damage` to that Pokémon" (no Weakness or Resistance on the Bench). */
export const snipe = (damage: number, then?: (ctx: AttackContext) => void): AttackEffect => ({
  choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: `Choose one of your opponent's Pokémon to do ${damage} damage to` }],
  run(ctx) {
    const t = ctx.choices.oppTarget ?? 'active';
    if (t === 'active') ctx.hit(damage);
    else ctx.damageBenched(ctx.opp, t, damage);
    then?.(ctx);
  },
});

/** The attacker can't use `attack` during its player's next turn. */
export const notNextTurn = (ctx: AttackContext, attack: string) => {
  (ctx.attacker.effects ??= {}).amnesia = { attack, until: ctx.turn + 2 };
  ctx.log(`${ctx.attackerDef.name} can't use ${attack} next turn.`);
};

/** The attacker can't attack during its player's next turn. */
export const restNext = (ctx: AttackContext) => {
  (ctx.attacker.effects ??= {}).noAttack = ctx.turn + 2;
  ctx.log(`${ctx.attackerDef.name} can't attack next turn.`);
};

/** Hyper Pump: `per` more for each basic Energy card beyond the attack's cost (`cost` Energy), at most `cap` more. */
export const hyperPump = (base: number, per: number, cap: number, cost: number): AttackEffect => ({
  run(ctx) {
    const basics = ctx.attacker.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(ctx.state.cards, e.defId))).length;
    const extra = Math.min(basics, Math.max(0, energyAmount(ctx, ctx.attacker) - cost));
    ctx.hit(base + Math.min(cap, per * extra));
  },
});

/** "Search your deck for up to `count` `type` Energy cards and attach them to …" (Recharge, Salt Water). */
export const chargeUp = (source: string, type: EnergyType, count: number): AttackEffect => ({
  run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source, filter: 'energyType', type, attachToActive: true, optional: true, count })),
});

/** "You may discard an Energy card attached to …. If you do, `then`" (Cold Crush, Crushing Flames, Electron Crush): asked first. */
export const mayDiscardAny = (damage: number, then: (ctx: AttackContext) => number | void): AttackEffect => ({
  choices: (s): ChoiceSpec[] => {
    const own = s.attacker.energy.filter((e) => !e.provides);
    return own.length ? [{ kind: 'ownEnergyUpTo', max: 1, options: own, prompt: 'You may choose an Energy card to discard for the attack’s effect' }] : [];
  },
  run(ctx) {
    const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
    if (!card) return void ctx.hit(damage);
    discardOwn(ctx, [card]);
    const more = then(ctx);
    ctx.hit(damage + (more ?? 0));
  },
});

/** The Pokémon cards (Basic Pokémon and Evolution cards) in a discard pile, not Trainers played as Pokémon. */
export const pokemonCards = (ctx: AttackContext, pile: CardInstance[]) =>
  pile.filter((c) => {
    const d = lookupCard(ctx.state.cards, c.defId);
    return d.kind === 'pokemon' && !d.trainerText;
  });

/** Look for Friends: cards from the top until a Basic Pokémon, which goes into the hand (shown); the rest shuffled back. */
export function lookForFriends(ctx: AttackContext) {
  const i = ctx.me.deck.findIndex((c) => {
    const d = lookupCard(ctx.state.cards, c.defId);
    return d.kind === 'pokemon' && d.stage === 'basic' && !d.trainerText;
  });
  if (i < 0) {
    ctx.log(`Revealed the whole deck (${ctx.me.deck.length} cards): no Basic Pokémon.`);
  } else {
    const [found] = ctx.me.deck.splice(i, 1);
    ctx.me.hand.push(found!);
    ctx.log(`Revealed ${i + 1} card${i ? 's' : ''}; put ${lookupCard(ctx.state.cards, found!.defId).name} into the hand.`);
  }
  [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
}

/** A Benched Pokémon of the opponent's (the player's pick) is switched in for the Defending Pokémon, then `then` (Gesture, Sleep Inducer). */
export const lureIn = (prompt: string, then?: (ctx: AttackContext) => void): AttackEffect => ({
  choices: (s) => opponentBenchChoice(s, prompt),
  run(ctx) {
    if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
    then?.(ctx);
  },
});

/** A delayed Special Condition: at the end of the opponent's next turn, the Defending Pokémon, if still Active (as Aqua Trance). */
export const delayedCondition = (damage: number, affliction: 'confused'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.delayed = { affliction, turn: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name} will be Confused at the end of the next turn.`, ctx.opp.id);
    });
  },
});

/**
 * Twister: `damage` and, for each heads of 2, an Energy card from the Defending Pokémon the player picks; 2 tails, nothing.
 * As Neo Revelation's: Brock's Protection and Unown [K]'s Keep keep the Energy (`energyCanGo`).
 */
const twister = (damage: number): AttackEffect => ({
  run(ctx) {
    const heads = ctx.flips(2);
    if (!heads) return ctx.log('Twister did nothing.');
    ctx.hit(damage);
    const defender = ctx.opp.active;
    if (!defender || defender.damage >= inPlayDef(ctx.state.cards, defender).hp || !ctx.canAffect(ctx.opp, defender)) return;
    const energy = defender.energy.filter((e) => !e.provides);
    if (!energy.length || !energyCanGo(ctx, defender)) return;
    if (energy.length <= heads || new Set(energy.map((e) => e.defId)).size === 1) {
      const gone = energy.slice(0, heads);
      defender.energy = defender.energy.filter((e) => !gone.includes(e));
      ctx.log(`Twister: discarded ${gone.map((e) => lookupCard(ctx.state.cards, e.defId).name).join(' and ')} from ${ctx.defenderDef.name}.`, ctx.opp.id);
      return discardTheirEnergy(ctx.state, ctx.opp, gone);
    }
    ctx.pend({ kind: 'removeEach', source: 'Twister', targets: Array<Target>(heads).fill('active') });
  },
});

export const EX6: Record<string, Record<string, AttackEffect>> = {
  // Beedrill – Link Needle: 30 more for each other Beedrill the player has in play.
  'ex6-1': { 'Link Needle': { run: (ctx) => void ctx.hit(50 + 30 * inPlay(ctx.me).filter((p) => p !== ctx.attacker && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Beedrill')).length) } },
  // Ditto – Energy Ball: 10 more for each Energy beyond the cost, at most 20 more.
  'ex6-4': { 'Energy Ball': { run: (ctx) => void ctx.hit(10 + Math.min(20, 10 * Math.max(0, energyAmount(ctx, ctx.attacker) - 1))) } },
  // Exeggutor – Psychic Exchange: the hand shuffled into the deck, then up to 8 drawn.
  'ex6-5': {
    'Psychic Exchange': {
      run(ctx) {
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...ctx.me.hand.splice(0)], ctx.state.rngState);
        ctx.log('Shuffled the hand into the deck.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'drawCount', source: 'Psychic Exchange', max: 8 });
      },
    },
  },
  // Marowak – Linear Attack: 30 to one of the opponent's Pokémon; Vengeance: 10 more for each Basic Pokémon and Evolution card
  // in the discard pile, at most 60 more.
  'ex6-7': {
    'Linear Attack': { ...snipe(30), cost: ['fighting', 'colorless'], damage: '' },
    Vengeance: { run: (ctx) => void ctx.hit(30 + Math.min(60, 10 * pokemonCards(ctx, ctx.me.discard).length)) },
  },
  // Nidoking – Earth Poison: Poisoned if it already had damage counters; Bound Crush: 60 to one of the opponent's Pokémon, not again next turn.
  'ex6-8': {
    'Earth Poison': {
      run(ctx) {
        const damaged = ctx.defender.damage > 0;
        ctx.hit(40);
        if (damaged) ctx.inflict('poisoned');
      },
    },
    'Bound Crush': snipe(60, (ctx) => notNextTurn(ctx, 'Bound Crush')),
  },
  // Nidoqueen – Power Lariat: 10 more for each of the player's Evolved Pokémon in play.
  'ex6-9': { 'Power Lariat': { run: (ctx) => void ctx.hit(40 + 10 * inPlay(ctx.me).filter((p) => p.evolvedFrom.length > 0).length) } },
  // Raichu – Recharge: up to 2 Lightning Energy cards from the deck to it; Thunder Reflection: any of its Lightning Energy
  // cards may move to another of the player's Pokémon.
  'ex6-12': {
    Recharge: chargeUp('Recharge', 'lightning', 2),
    'Thunder Reflection': {
      choices(s): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        const lightning = s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'lightning'));
        return bench.length && lightning ? [{ kind: 'ownBench', options: [-1, ...bench], optional: true, prompt: 'You may choose one of your Pokémon to move Lightning Energy cards to' }] : [];
      },
      run(ctx) {
        ctx.hit(50);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && slot >= 0 && ctx.me.bench[slot]) ctx.pend({ kind: 'shiftEnergy', source: 'Thunder Reflection', from: 'active', to: slot, type: 'lightning' });
      },
    },
  },
  // Snorlax – Toss and Turn: 30 more while Asleep (it can be used while Asleep).
  'ex6-15': { 'Toss and Turn': { whileAsleep: true, run: (ctx) => void ctx.hit(ctx.attacker.condition === 'asleep' ? 60 : 30) } },
  // Tauros – Knock Over; Rampage: 10 more for each damage counter on it, then tails Confused.
  'ex6-16': {
    'Knock Over': knockOver(10),
    Rampage: {
      run(ctx) {
        ctx.hit(20 + ctx.attacker.damage);
        if (!ctx.flip()) ctx.confuseSelf();
      },
    },
  },
  // Chansey – Egg Surprise: heads 50 to the Defending Pokémon, tails 5 damage counters off Chansey.
  'ex6-19': {
    'Egg Surprise': {
      run(ctx) {
        if (ctx.flip()) ctx.hit(50);
        else healUpTo(ctx, ctx.me, ctx.attacker, 50);
      },
    },
  },
  // Cloyster – Double Bubble: as EX Sandstorm Marill's.
  'ex6-20': { 'Double Bubble': same(() => EX2['ex2-68']?.['Double Bubble']) },
  // Farfetch'd – Hoard: up to 2 Pokémon Tool cards from the deck, each onto one of the player's Pokémon without a Tool.
  'ex6-23': { Hoard: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Hoard', filter: 'tool', attach: true, optional: true, count: 2 })) } },
  // Kingler – Salt Water: up to 2 Water Energy cards from the deck to it; Hyper Pump: 20 more for each basic Energy beyond the cost, at most 40.
  'ex6-26': { 'Salt Water': chargeUp('Salt Water', 'water', 2), 'Hyper Pump': hyperPump(30, 20, 40, 2) },
  // Primeape – Toss: any number of Technical Machine and Pokémon Tool cards from the hand discarded, 30 each.
  'ex6-28': {
    Toss: {
      choices: () => [{ kind: 'amount', options: Array.from({ length: 11 }, (_, i) => i), prompt: 'How many Technical Machine and Pokémon Tool cards to discard from your hand (30 damage each)?' }],
      run(ctx) {
        const n = Math.min(ctx.choices.amount ?? 0, ctx.me.hand.filter((c) => handTrainerFits(c, 'toolOrMachine')).length);
        ctx.hit(30 * n);
        if (n) ctx.pend({ kind: 'discardFromHand', source: 'Toss', count: n, only: 'toolOrMachine' });
      },
    },
  },
  // Scyther – Fury Cutter: 3 flips; 1 heads 10 more, 2 heads 20 more, 3 heads 40 more.
  'ex6-29': { 'Fury Cutter': { run: (ctx) => void ctx.hit(10 + [0, 10, 20, 40][ctx.flips(3)]!) } },
  // Tangela – Vine Tease: a Prize card (picked after looking) changes places with the top card of the deck.
  'ex6-30': { 'Vine Tease': { run: (ctx) => (ctx.me.deck.length && ctx.me.prizes.length ? ctx.pend({ kind: 'vineTease', source: 'Vine Tease' }) : ctx.log('Vine Tease did nothing.')) } },
  // Charmeleon – Damage Burn: 20 more if the Defending Pokémon already has damage counters.
  'ex6-31': { 'Damage Burn': { run: (ctx) => void ctx.hit(ctx.defender.damage > 0 ? 60 : 40) } },
  // Mankey – Mischief: as Team Rocket's.
  'ex6-38': { Mischief: same(() => ROCKET['base5-61']?.Mischief) },
  // Nidorina – Fast Evolution: up to 2 Evolution cards from the deck, shown.
  'ex6-40': { 'Fast Evolution': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Fast Evolution', filter: 'evolution', reveal: true, optional: true, count: 2 })) } },
  // Onix – Tunneling: 10 to up to 2 of the opponent's Benched Pokémon; it can't attack next turn.
  'ex6-42': {
    Tunneling: {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBenchMany', count: 2, options, prompt: "Choose up to 2 of your opponent's Benched Pokémon to do 10 damage to" }] : [];
      },
      run(ctx) {
        for (const slot of ctx.choices.benchSlots ?? []) ctx.damageBenched(ctx.opp, slot, 10);
        restNext(ctx);
      },
    },
  },
  // Parasect – Energy Powder: up to 2 basic Energy cards from the deck to the player's Pokémon (not Pokémon-ex), each where they like.
  'ex6-43': {
    'Energy Powder': {
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Energy Powder', filter: 'basicEnergy', attach: true, attachOnly: { notEx: true }, optional: true, count: 2 })),
    },
  },
  // Porygon – Data Retrieval: draw until there are 4 cards in the hand.
  'ex6-47': { 'Data Retrieval': { run: (ctx) => ctx.draw(Math.max(0, 4 - ctx.me.hand.length)) } },
  // Raticate – Pickup: a Basic Pokémon or Evolution card, a Trainer card and an Energy card from the discard pile, shown.
  'ex6-48': {
    Pickup: {
      run(ctx) {
        const searches = [
          { kind: 'discardToHand' as const, source: 'Pickup', count: 1, reveal: true },
          { kind: 'discardToHand' as const, source: 'Pickup', count: 1, filter: 'trainer' as const, reveal: true },
          { kind: 'discardToHand' as const, source: 'Pickup', count: 1, filter: 'energy' as const, reveal: true },
        ];
        const [first, ...rest] = searches;
        ctx.pend(first!);
        (ctx.state.queuedChoices ??= []).push(...rest.map((s) => ({ ...s, player: ctx.me.id })));
      },
    },
  },
  // Wigglytuff – Expand: during the opponent's next turn, 10 less attack damage to it.
  'ex6-52': {
    Expand: {
      run(ctx) {
        ctx.hit(30);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 10, until: ctx.turn + 1 };
        ctx.log(`Damage done to ${ctx.attackerDef.name} by attacks next turn is reduced by 10.`);
      },
    },
  },
  // Caterpie – Signs of Evolution: a Metapod and a Butterfree from the deck, shown.
  'ex6-56': {
    'Signs of Evolution': {
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Signs of Evolution', filter: 'named', name: ['Metapod', 'Butterfree'], distinct: 'name', reveal: true, optional: true, count: 2 })),
    },
  },
  // Clefairy – Gesture: one of the opponent's Benched Pokémon switched in.
  'ex6-59': { Gesture: lureIn("Choose one of your opponent's Benched Pokémon to switch in") },
  // Gastly – Slow Trip Gas.
  'ex6-63': { 'Slow Trip Gas': delayedCondition(0, 'confused') },
  // Jigglypuff – Sleep Inducer: one of the opponent's Benched Pokémon switched in, then Asleep.
  'ex6-65': { 'Sleep Inducer': lureIn("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => ctx.inflict('asleep')) },
  // Krabby – Nap: 2 damage counters off it.
  'ex6-66': { Nap: { run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 20) } },
  // Magikarp – Ascension: as Hidden Legends Feebas's.
  'ex6-67': { Ascension: same(() => EX5['ex5-61']?.Ascension) },
  // Nidoran♀ – Look for Friends.
  'ex6-70': { 'Look for Friends': { run: lookForFriends } },
  // Nidoran♂ – Call for Family: a Nidoran ♀ or Nidoran ♂ from the deck onto the Bench.
  'ex6-71': {
    'Call for Family': {
      blocked: (s) => (openBenchSlot(s.ownBench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicNamed', name: ['Nidoran♀', 'Nidoran♂'], toBench: true, optional: true })),
    },
  },
  // Shellder – Minimize: 20 less attack damage to it next turn.
  'ex6-79': { Minimize: { run: (ctx) => ctx.protect('minimize') } },
  // Venonat – Psycho Waves: an Energy card discarded from it, then Confused.
  'ex6-84': { 'Psycho Waves': { discard: { count: 1 }, run: (ctx) => ctx.inflict('confused') } },
  // Weedle – Call for Family: up to 2 Grass Basic Pokémon from the deck onto the Bench; Poison Spurt: as EX Dragon Grimer's.
  'ex6-86': {
    'Call for Family': {
      blocked: (s) => (openBenchSlot(s.ownBench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
      run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicType', type: 'grass', toBench: true, optional: true, count: 2 })),
    },
    'Poison Spurt': same(() => EX3['ex3-57']?.['Poison Spurt']),
  },
  // Blastoise ex – Hyper Whirlpool: flips until tails; for each heads, the opponent discards an Energy card from the Defending Pokémon.
  'ex6-104': {
    'Hyper Whirlpool': {
      run(ctx) {
        ctx.hit(80);
        const heads = headsUntilTails(ctx);
        const n = Math.min(heads, ctx.defender.energy.filter((e) => !e.provides).length);
        if (n && ctx.canAffect(ctx.opp, ctx.defender)) ctx.opponentChooses({ kind: 'discardAttached', source: 'Hyper Whirlpool', target: 'active', count: n });
      },
    },
  },
  // Charizard ex – Burn Down: Energy cards providing 5 Fire Energy discarded (agreed: Double Colorless counts 2); 200 damage
  // that nothing on the Defending Pokémon changes.
  'ex6-105': {
    'Burn Down': {
      run(ctx) {
        const gone: CardInstance[] = [];
        let fire = 0;
        for (const e of ctx.attacker.energy.filter((c) => !c.provides).sort((a, b) => fireIn(ctx, b) - fireIn(ctx, a))) {
          if (fire >= 5) break;
          const provides = fireIn(ctx, e);
          if (!provides) continue;
          gone.push(e);
          fire += provides;
        }
        discardOwn(ctx, gone);
        ctx.hit(200, { swift: true });
      },
    },
  },
  // Clefable ex – Metronome: one of the Defending Pokémon's attacks, with its other requirements (as Mini-Metronome).
  'ex6-106': { Metronome: copyAttack('Metronome', { needsEnergy: false, flip: false }) },
  // Electrode ex – Crush and Burn: any number of Energy cards from the player's Pokémon discarded, 20 more each (agreed: cards).
  'ex6-107': {
    'Crush and Burn': {
      choices(s): ChoiceSpec[] {
        const options = [s.attacker, ...s.ownBench].flatMap((p) => (p ? p.energy.filter((e) => !e.provides) : []));
        return options.length ? [{ kind: 'ownEnergyAny', options, prompt: 'You may choose any Energy cards attached to your Pokémon to discard (20 more damage each)' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        let n = 0;
        for (const p of inPlay(ctx.me)) {
          const gone = p.energy.filter((e) => uids.has(e.uid));
          if (!gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          n += gone.length;
          ctx.log(`Discarded ${gone.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from ${pokemonName(ctx.state, p)}.`);
        }
        ctx.hit(30 + 20 * n);
      },
    },
  },
  // Gengar ex – Poltergeist: the opponent's hand looked at, 10 more for each Trainer card in it.
  'ex6-108': {
    Poltergeist: {
      run(ctx) {
        ctx.log(`Hand: ${ctx.opp.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`, ctx.opp.id);
        ctx.hit(40 + 10 * ctx.opp.hand.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'trainer').length);
      },
    },
  },
  // Gyarados ex – Twister.
  'ex6-109': { Twister: twister(40) },
  // Mr. Mime ex – Breakdown: a damage counter on the Defending Pokémon for each card in the opponent's hand.
  'ex6-110': { Breakdown: { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, ctx.opp.hand.length) } },
  'ex6-111': { Breakdown: { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, ctx.opp.hand.length) } },
  // Venusaur ex – Pollen Hazard: Poisoned, Burned and Confused.
  'ex6-112': {
    'Pollen Hazard': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('poisoned');
        ctx.inflict('burned');
        ctx.inflict('confused');
      },
    },
  },
  // Articuno ex – Cold Crush: an Energy card may be discarded; then the opponent discards one from the Defending Pokémon.
  'ex6-114': {
    'Cold Crush': mayDiscardAny(50, (ctx) => {
      ctx.after(() => {
        if (ctx.opp.active && ctx.opp.active.energy.some((e) => !e.provides) && ctx.canAffect(ctx.opp, ctx.opp.active)) ctx.opponentChooses({ kind: 'discardAttached', source: 'Cold Crush', target: 'active' });
      });
    }),
  },
  // Moltres ex – Crushing Flames: an Energy card may be discarded; then Confused.
  'ex6-115': { 'Crushing Flames': mayDiscardAny(60, (ctx) => ctx.after(() => ctx.inflict('confused'))) },
  // Zapdos ex – Electron Crush: an Energy card may be discarded for 20 more.
  'ex6-116': { 'Electron Crush': mayDiscardAny(50, () => 20) },
};

// Electrode ex: "Crash and Burn" is TCGdex's name for Crush and Burn (the seed fixes it; kept for databases not yet re-seeded).
EX6['ex6-107']!['Crash and Burn'] = EX6['ex6-107']!['Crush and Burn']!;

/** How much Fire Energy an Energy card on the attacker provides (Energy Flame makes it all Fire). */
function fireIn(ctx: AttackContext, e: CardInstance) {
  const pool = energyPool({ ...ctx.attacker, energy: [e] }, ctx.state.cards);
  return pool.filter((t) => counts(t, 'fire')).length || (energyProvided(e, ctx.state.cards).type === 'fire' ? 1 : 0);
}
