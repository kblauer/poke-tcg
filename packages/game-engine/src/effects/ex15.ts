// EX Dragon Frontiers (ex15) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// From the text: Charm and Delta Reduction take their damage off before Weakness and Resistance, to any target; Dark Horn
// asks first which card to discard, if any; Sting Turn asks for the Benched Pokémon before the flip; Dragon Roar's 8 damage
// counters go on the Defending Pokémon up to what Knocks it Out, the rest on the opponent's Bench as the player likes;
// Shock-wave markers stay until their Pokémon leaves play; Rage Aura makes Special Circuit cost Lightning and Sky-high Claws
// Lightning Lightning while the player has more Prize cards left; Mimicry needs the Energy for the attack, Delta Copy doesn't.
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { lookupCard, type EnergyType } from '../cards.js';
import { counts, energyPool, toolOf, type Target } from '../engine.js';
import { powerActive } from '../powers.js';
import { inPlayDef, isDelta, pokemonName } from '../status.js';
import { benchedSlots, flipToInflict, opponentBenchChoice } from './common.js';
import { discardOwn, energyCardOf, inPlay } from './ex2.js';
import { EX6 } from './ex6.js';
import { copyAmong, rotatingClaws } from './ex7.js';
import { dragOff, EX8 } from './ex8.js';
import { EX10, guardNext } from './ex10.js';
import { exProof, same } from './ex12.js';
import { EX13 } from './ex13.js';
import { damageAt } from './ex14.js';
import { healEach } from './gym1.js';
import { discardFree } from './neo3.js';
import { SI1 } from './si1.js';

/** The player's δ Pokémon in play. */
const deltas = (ctx: AttackContext) => inPlay(ctx.me).filter((p) => isDelta(ctx.state.cards, p)).length;

/** The Pokémon at the target of the opponent's side. */
const oppAt = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]) ?? null;

/** How much Energy of `type` the attacker has attached. */
const energyOf = (ctx: AttackContext, type: EnergyType) => energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, type)).length;

/** Rage Aura: the attack costs `cost` while the player has more Prize cards left than the opponent and it works. */
const rageAura = (cost: EnergyType[]) => (s: AttackSituation): EnergyType[] | null => {
  const sides = [{ active: s.attacker, bench: s.ownBench }, { active: s.defender, bench: s.opponentBench }];
  const behind = s.ownPrizes !== undefined && s.opponentPrizes !== undefined && s.ownPrizes > s.opponentPrizes;
  return behind && powerActive(s.attacker, s.cards, sides) ? cost : null;
};

/** "During your opponent's next turn, any damage done by attacks from the Defending Pokémon is reduced by N (before Weakness and Resistance)" (Charm, Delta Reduction, Negative Ion). */
export const charmFor = (damage: number, amount: number): AttackEffect => ({
  run(ctx) {
    if (damage) ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.charm = { amount, until: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name}'s attacks do ${amount} less damage next turn.`, ctx.opp.id);
    });
  },
});

/** Psychic Pulse: 10 to each of the opponent's Benched Pokémon with damage counters. */
export const psychicPulse = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.opp.bench.forEach((p, i) => p && p.damage > 0 && ctx.damageBenched(ctx.opp, i, 10));
  },
});

/** Against a Pokémon-ex, 10 more and `affliction` (Tail Sting, Flickering Tail). */
const againstEx = (affliction: 'poisoned' | 'asleep'): AttackEffect => ({
  run(ctx) {
    if (!ctx.defenderDef.ex) return void ctx.hit(10);
    ctx.hit(20);
    ctx.inflict(affliction);
  },
});

/** Choose one of the opponent's Pokémon (Delta Mind, Electromark). */
const anyOpponent = (prompt: string) => (s: AttackSituation): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt }];

/** The Basic Pokémon and Evolution cards in the hand (Dark Horn). */
const pokemonInHand = (s: Pick<AttackSituation, 'cards'>, hand: AttackSituation['ownHand'] = []) =>
  hand.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return d.kind === 'pokemon' && !d.trainerText;
  });

export const EX15: Record<string, Record<string, AttackEffect>> = {
  // Ampharos δ – Delta Circle: 10 more for each of the player's δ Pokémon.
  'ex15-1': { 'Delta Circle': { run: (ctx) => void ctx.hit(20 + 10 * deltas(ctx)) } },
  // Feraligatr δ – Drag Off.
  'ex15-2': { 'Drag Off': dragOff(20) },
  // Heracross δ – Dig Deep: as EX Unseen Forces Wobbuffet's.
  'ex15-3': { 'Dig Deep': same(() => EX10['ex10-65']?.['Dig Deep']) },
  // Meganium δ – Delta Reduction: the Defending Pokémon's attacks do 30 less next turn.
  'ex15-4': { 'Delta Reduction': charmFor(40, 30) },
  // Nidoking δ – Dark Horn: a Basic Pokémon or Evolution card may be discarded from the hand for 20 to one of the opponent's Benched Pokémon.
  'ex15-6': {
    'Dark Horn': {
      choices(s, c): ChoiceSpec[] {
        const cards = pokemonInHand(s, s.ownHand);
        if (!cards.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'amount', options: [-1, ...cards.map((_, i) => i)], labels: ["Don't discard", ...cards.map((card) => lookupCard(s.cards, card.defId).name)], prompt: 'Dark Horn: you may discard a Basic Pokémon or Evolution card from your hand' }];
        if (c.amount !== undefined && c.amount >= 0) specs.push(...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to"));
        return specs;
      },
      run(ctx) {
        ctx.hit(60);
        const card = ctx.choices.amount !== undefined && ctx.choices.amount >= 0 ? pokemonInHand(ctx.state, ctx.me.hand)[ctx.choices.amount] : undefined;
        if (!card) return;
        ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
        ctx.me.discard.push(card);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from the hand.`);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
      },
    },
  },
  // Nidoqueen δ – Vengeance: as EX FireRed & LeafGreen Nidoqueen's.
  'ex15-7': { Vengeance: same(() => EX6['ex6-7']?.['Vengeance']) },
  // Ninetales δ – Trick Tail: an Energy card from the discard pile to one of the player's Pokémon.
  'ex15-8': {
    'Trick Tail': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy') && discardFree(ctx)) ctx.pend({ kind: 'attachFromDiscard', source: 'Trick Tail', count: 1, anyEnergy: true });
      },
    },
  },
  // Pinsir δ – Delta Call: as EX Holon Phantoms Holon Lake's.
  'ex15-9': { 'Delta Call': same(() => EX13['ex13-87']?.['Delta Call']) },
  // Togetic δ – Delta Copy: an attack of one of the opponent's δ Pokémon in play, whatever the Energy.
  'ex15-11': { 'Delta Copy': copyAmong('Delta Copy', false, (sides, cards) => [sides.defender, ...sides.opp].filter((p) => p && isDelta(cards, p))) },
  // Typhlosion δ – Burning Ball: Burned with 2 Fire Energy attached.
  'ex15-12': {
    'Burning Ball': {
      run(ctx) {
        ctx.hit(60);
        if (energyOf(ctx, 'fire') >= 2) ctx.inflict('burned');
      },
    },
  },
  // Arbok δ – Strangle: 30 more against a δ Pokémon.
  'ex15-13': { Strangle: { run: (ctx) => void ctx.hit(isDelta(ctx.state.cards, ctx.defender) ? 80 : 50) } },
  // Dewgong δ – Surge: 20 more with 2 Water Energy attached.
  'ex15-15': { Surge: { run: (ctx) => void ctx.hit(energyOf(ctx, 'water') >= 2 ? 60 : 40) } },
  // Gligar δ – Sting Turn: heads, Paralyzed and it switches with a Benched Pokémon; Tail Sting: against a Pokémon-ex, 10 more and Poisoned.
  'ex15-16': {
    'Sting Turn': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'If heads, choose one of your Benched Pokémon to switch with' }] : [];
      },
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Sting Turn did nothing.');
        ctx.inflict('paralyzed');
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
    'Tail Sting': againstEx('poisoned'),
  },
  // Ledian δ – Metal Star: 3 cards drawn with a Pokémon Tool attached.
  'ex15-18': {
    'Metal Star': {
      run(ctx) {
        ctx.hit(30);
        if (toolOf(ctx.state.cards, ctx.attacker)) ctx.draw(3);
      },
    },
  },
  // Lickitung δ – Delta Mind: a damage counter on one of the opponent's Pokémon, 3 on a δ Pokémon.
  'ex15-19': {
    'Delta Mind': {
      choices: anyOpponent("Choose one of your opponent's Pokémon to put damage counters on"),
      run(ctx) {
        const p = oppAt(ctx, ctx.choices.oppTarget ?? 'active');
        if (!p || !ctx.canAffect(ctx.opp, p)) return;
        const n = isDelta(ctx.state.cards, p) ? 3 : 1;
        p.damage += 10 * n;
        ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
  },
  // Xatu δ – Confuse Ray.
  'ex15-25': { 'Confuse Ray': flipToInflict(20, 'confused') },
  // Smeargle δ – Flickering Tail: against a Pokémon-ex, 10 more and Asleep.
  'ex15-39': { 'Flickering Tail': againstEx('asleep') },
  // Togepi δ – Charm: the Defending Pokémon's attacks do 20 less next turn.
  'ex15-41': { Charm: charmFor(0, 20) },
  // Vibrava δ – Sonic Noise: a Pokémon-ex is now Confused.
  'ex15-42': {
    'Sonic Noise': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.defenderDef.ex) ctx.inflict('confused');
      },
    },
  },
  // Bagon δ – Granite Head: 10 less damage to it next turn.
  'ex15-43': { 'Granite Head': guardNext(10, 10) },
  // Cyndaquil δ – Swift.
  'ex15-45': { Swift: { run: (ctx) => void ctx.hit(30, { swift: true }) } },
  // Smoochum δ – Alluring Kiss: a Basic Pokémon and a basic Energy card from the deck, shown.
  'ex15-64': {
    'Alluring Kiss': {
      run(ctx) {
        if (!ctx.me.deck.length) return;
        ctx.pend({ kind: 'pickFromDeck', source: 'Alluring Kiss', filter: 'basic', reveal: true, optional: true });
        (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Alluring Kiss', kind: 'pickFromDeck', filter: 'basicEnergy', reveal: true, optional: true });
      },
    },
  },
  // Altaria ex δ – Healing Light: a damage counter off each of the player's Pokémon.
  'ex15-90': {
    'Healing Light': {
      run(ctx) {
        ctx.hit(60);
        healEach(ctx, 10);
      },
    },
  },
  // Dragonite ex δ – Deafen: as EX Deoxys Rayquaza ex's Disconnect; Dragon Roar: 8 damage counters, those beyond a Knock Out on the Bench.
  'ex15-91': {
    Deafen: same(() => EX8['ex8-101']?.['Disconnect']),
    'Dragon Roar': {
      run(ctx) {
        const p = ctx.defender;
        if (!ctx.canAffect(ctx.opp, p)) return;
        const left = Math.max(0, inPlayDef(ctx.state.cards, p).hp - p.damage);
        const on = Math.min(80, left);
        p.damage += on;
        ctx.log(`Put ${on / 10} damage counters on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
        const rest = (80 - on) / 10;
        if (rest > 0 && benchedSlots(ctx.opp.bench).length) ctx.pend({ kind: 'placeCounters', source: 'Dragon Roar', count: rest });
      },
    },
  },
  // Flygon ex δ – Psychic Pulse.
  'ex15-92': { 'Psychic Pulse': psychicPulse(80) },
  // Gardevoir ex δ – Flame Ball: a Fire Energy card may move to one of the player's Benched Pokémon.
  'ex15-93': {
    'Flame Ball': {
      choices(s): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        const fire = s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'fire'));
        return bench.length && fire ? [{ kind: 'ownBench', options: [-1, ...bench], optional: true, prompt: 'You may choose one of your Benched Pokémon to move a Fire Energy card to' }] : [];
      },
      run(ctx) {
        ctx.hit(80);
        const slot = ctx.choices.ownBenchSlot;
        const to = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
        const fire = ctx.attacker.energy.find((e) => energyCardOf(ctx.state.cards, e, 'fire'));
        if (!to || !fire) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== fire);
        to.energy.push(fire);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, fire.defId).name} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Kingdra ex δ – Protective Swirl: no Weakness during the opponent's next turn.
  'ex15-94': {
    'Protective Swirl': {
      run(ctx) {
        ctx.hit(80);
        (ctx.attacker.effects ??= {}).weaknessOffUntil = ctx.turn + 1;
        ctx.log(`${ctx.attackerDef.name} has no Weakness next turn.`);
      },
    },
  },
  // Latias ex δ – Power Crush: 2 Fire Energy cards discarded if the Defending Pokémon is Knocked Out.
  'ex15-95': {
    'Power Crush': {
      run(ctx) {
        ctx.hit(90);
        if (ctx.defender.damage < inPlayDef(ctx.state.cards, ctx.defender).hp) return;
        discardOwn(ctx, ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'fire')).slice(0, 2));
      },
    },
  },
  // Latios ex δ – Ice Barrier: the opponent's Pokémon-ex's attacks do nothing to it next turn.
  'ex15-96': { 'Ice Barrier': exProof(30) },
  // Rayquaza ex δ – Special Circuit: 30 to one of the opponent's Pokémon, 50 to one with a Poké-Power or Poké-Body; Sky-high
  // Claws. Both cheaper with Rage Aura.
  'ex15-97': {
    'Special Circuit': {
      costNow: rageAura(['lightning']),
      choices: anyOpponent("Choose one of your opponent's Pokémon to do 30 damage to (50 if it has a Poké-Power or Poké-Body)"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = oppAt(ctx, t);
        damageAt(ctx, t, p && inPlayDef(ctx.state.cards, p).power ? 50 : 30);
      },
    },
    'Sky-high Claws': { costNow: rageAura(['lightning', 'lightning']), run: (ctx) => void ctx.hit(70) },
  },
  // Salamence ex δ – Dual Stream: 40 instead of 80 to the Defending Pokémon may be done for 40 to one of the opponent's Benched Pokémon.
  'ex15-98': {
    'Dual Stream': {
      choices(s, c): ChoiceSpec[] {
        if (!benchedSlots(s.opponentBench).length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'boost', options: [true, false], prompt: "Do 40 damage to the Defending Pokémon and 40 to one of your opponent's Benched Pokémon instead of 80?" }];
        if (c.boost) specs.push(...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 40 damage to"));
        return specs;
      },
      run(ctx) {
        if (!ctx.choices.boost || ctx.choices.benchSlot === undefined) return void ctx.hit(80);
        ctx.hit(40);
        ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 40);
      },
    },
  },
  // Tyranitar ex δ – Electromark: a Shock-wave marker on one of the opponent's Pokémon; Shock-wave: one with a marker Knocked Out.
  'ex15-99': {
    Electromark: {
      choices: anyOpponent("Choose one of your opponent's Pokémon to put a Shock-wave marker on"),
      run(ctx) {
        const p = oppAt(ctx, ctx.choices.oppTarget ?? 'active');
        if (!p || !ctx.canAffect(ctx.opp, p)) return;
        p.shockwave = true;
        ctx.log(`Put a Shock-wave marker on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
    'Shock-wave': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => (t === 'active' ? s.defender : s.opponentBench[t])?.shockwave);
        return options.length ? [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon with a Shock-wave marker to Knock Out" }] : [];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        const p = t === undefined ? null : oppAt(ctx, t);
        if (!p?.shockwave) return ctx.log("Shock-wave did nothing: none of your opponent's Pokémon has a Shock-wave marker.");
        if (!ctx.canAffect(ctx.opp, p)) return;
        p.damage = Math.max(p.damage, inPlayDef(ctx.state.cards, p).hp);
        ctx.log(`Shock-wave: ${pokemonName(ctx.state, p)} is Knocked Out.`, ctx.opp.id);
      },
    },
  },
  // Charizard ☆ δ – Rotating Claws; Dark Swirl: every Energy card attached discarded, and the top 3 cards of the opponent's deck.
  'ex15-100': {
    'Rotating Claws': rotatingClaws(20),
    'Dark Swirl': {
      run(ctx) {
        ctx.hit(150);
        discardOwn(ctx, ctx.attacker.energy.filter((e) => !e.provides));
        const gone = ctx.opp.deck.splice(0, 3);
        ctx.opp.discard.push(...gone);
        ctx.log(`Discarded the top ${gone.length} card${gone.length === 1 ? '' : 's'} of the deck.`, ctx.opp.id);
      },
    },
  },
  // Mew ☆ δ – Mimicry: an attack of one of the opponent's Pokémon in play, with the Energy for it; Rainbow Wave: as Southern
  // Islands Mew's.
  'ex15-101': {
    Mimicry: copyAmong('Mimicry', false, (sides) => [sides.defender, ...sides.opp], true),
    'Rainbow Wave': same(() => SI1['si1-1']?.['Rainbow Wave']),
  },
};
