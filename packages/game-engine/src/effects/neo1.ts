// Neo Genesis (neo1) attack effects, by card id and attack name. Rulings follow the card text (the Neo-era rulebook);
// `text` has the printed wording where TCGdex drops an Energy symbol (Elemental Blast, Static Electricity, Water Gun) or
// leaves Super Metronome's type blank. Attacks that only deal damage need no entry.
// Rulings (agreed): Pilfer can be used even if Aipom is the only Pokémon in play (then its player has none left and
// loses). Static Electricity counts every Mareep in play, both players', and all the Energy found go to the attacking
// Mareep. Jaw Clamp and Sticky Nectar stop any effect, whoever's, from changing the held Pokémon's player's Active Pokémon
// (activeLocked), and it can't retreat.
// Rulings (from the text): Super Metronome copies an attack of any of the opponent's Pokémon in play, asked (with the
// copied attack's own questions) before the flip, and skips what's needed to use it, as Metronome does; Togetic stays
// Colorless. Zzzap hits every Pokémon in play with a Pokémon Power, both players', without Weakness and Resistance.
// Sputter switches every Pokémon Power off through the attacking player's next turn, as Goop Gas Attack does for one turn
// less. Questions whose answer depends on a flip are asked before it (Sweet Nectar, Sweet Scent, Pilfer, Fireworks), as
// Misty's Psyduck's ESP is. Mean Look lasts while Murkrow is the Active Pokémon (benching or evolving either ends it).
import { attackSituation, targetsIn, pokemonOn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { lookupCard } from '../cards.js';
import { isEnergyCardOf, type CardInstance, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { powerActive } from '../powers.js';
import { shuffle } from '../rng.js';
import { baseUid, effectId, inPlayDef, pokemonName } from '../status.js';
import { attackEffect } from './index.js';
import { BASE1 } from './base1.js';
import {
  benchedSlots,
  benchSearch,
  discardToUse,
  extraEnergy,
  flipToInflict,
  flipToProtect,
  inflicts,
  leechSeed,
  opponentBenchChoice,
  opponentSwitches,
  perHeads,
} from './common.js';
import { FOSSIL, smokescreen } from './fossil.js';
import { discardFromAttacker } from './gym1.js';
import { cantAttackMe, flipForMore, rage } from './jungle.js';
import { flipOrNothing, shuffleIntoDeck } from './rocket.js';

/** Shuffles the attacking player's deck. */
const shuffleOwnDeck = (ctx: AttackContext) => void ([ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState));

/** The attacking player's Pokémon in play. */
const ownInPlay = (ctx: AttackContext) => [ctx.me.active, ...ctx.me.bench].filter((p): p is InPlayPokemon => !!p);

/** Base damage, then 10 for each damage counter on the attacker (Flail). */
const flail: AttackEffect = { run: (ctx) => void ctx.hit(ctx.attacker.damage) };

/** Damage that nothing on the Defending Pokémon changes: Weakness, Resistance, Pokémon Powers or other effects (Swift). */
export const swift = (damage: number): AttackEffect => ({ run: (ctx) => void ctx.hit(damage, { swift: true }) });

/** Removes damage from one of `owner`'s Pokémon (all of it, or up to `amount`). */
function healPokemon(ctx: AttackContext, owner: PlayerState, p: InPlayPokemon, amount: number | 'all') {
  const healed = amount === 'all' ? p.damage : Math.min(amount, p.damage);
  if (!healed) return;
  p.damage -= healed;
  ctx.log(`${pokemonName(ctx.state, p)} healed ${healed} damage.`, owner.id);
}

/** Half the damage the attack did, rounded up to the nearest 10, is removed from the attacker (Absorb, Mega Drain). */
const absorb = (damage: number): AttackEffect => ({ run: (ctx) => ctx.heal(Math.ceil(ctx.hit(damage) / 20) * 10) });

/** Heads: the Defending Pokémon is Paralyzed and 10 damage to each of the opponent's benched Pokémon (Gigaspark, Bubble Shower). */
const shower = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.flip()) return;
    ctx.inflict('paralyzed');
    ctx.benchDamage(ctx.opp, 10);
  },
});

/** Until the end of the attacking player's next turn, attacks that damage the Defending Pokémon do 20 more (Screech). */
export const screech = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.screech = ctx.turn + 2;
      ctx.log(`Attacks that damage ${ctx.defenderDef.name} do 20 more damage until the end of the next turn.`);
    });
  },
});

/**
 * The Defending Pokémon can't retreat while the attacker is the Active Pokémon (Jaw Clamp, Sticky Nectar: until the end of
 * the opponent's next turn, and no effect can change its player's Active Pokémon either; Mean Look: for as long as it lasts).
 */
function hold(ctx: AttackContext, until?: number) {
  const by = ctx.attacker.card.uid;
  ctx.affectDefender((e) => {
    e.heldBy = { by, ...(until !== undefined && { until, switches: true }) };
    ctx.log(`${ctx.defenderDef.name} can't retreat while ${ctx.attackerDef.name} is the Active Pokémon${until !== undefined ? ', and nothing can switch it out, until the end of the next turn' : ''}.`);
  });
}

/** Damage to one of the opponent's Pokémon: the Active one without Weakness and Resistance (`swift`: without anything else on it either). */
export function damageOpponent(ctx: AttackContext, target: Target, amount: number, swift = false) {
  if (target === 'active') ctx.hit(amount, swift ? { swift } : { weakness: false });
  else ctx.damageBenched(ctx.opp, target, amount);
}

export const opponentTargets = (s: AttackSituation, prompt: string): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt }];

/** Base damage; the opponent switches the Defending Pokémon (their choice), then the attacker may be switched with a benched Pokémon (Rapid Spin). */
export const rapidSpin = (damage: number, name: string): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const options = benchedSlots(s.ownBench);
    return options.length ? [{ kind: 'ownBench', options, prompt: `Choose one of your benched Pokémon to switch with ${name}` }] : [];
  },
  run(ctx) {
    ctx.hit(damage);
    opponentSwitches(ctx, 'Rapid Spin');
    if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
  },
});

/** The attacker's own damaged Pokémon, to choose 1 of (Sweet Nectar, Sweet Scent). */
const ownDamaged = (s: AttackSituation, prompt: string): ChoiceSpec[] => {
  const options = targetsIn(s.attacker, s.ownBench).filter((t) => (pokemonOn(s.attacker, s.ownBench, t)?.damage ?? 0) >= 10);
  return options.length ? [{ kind: 'ownPokemon', options, prompt }] : [];
};

/** The opponent's damaged Pokémon, to choose 1 of (Sweet Scent). */
const opponentDamaged = (s: AttackSituation, prompt: string): ChoiceSpec[] => {
  const options = targetsIn(s.defender, s.opponentBench).filter((t) => (pokemonOn(s.defender, s.opponentBench, t)?.damage ?? 0) >= 10);
  return options.length ? [{ kind: 'opponentPokemon', options, prompt }] : [];
};

/** One Energy card of the attacker to choose, when they're not all the same (Fireworks, Electric Current). */
const oneOwnEnergy = (s: AttackSituation, prompt: string): ChoiceSpec[] => (s.attacker.energy.length ? [{ kind: 'ownEnergy', count: 1, options: s.attacker.energy, prompt }] : []);

/** The chosen (or only) Energy card of the attacker. */
const chosenEnergy = (ctx: AttackContext): CardInstance | undefined => ctx.attacker.energy.find((e) => e.uid === ctx.choices.energyUids?.[0]) ?? (ctx.attacker.energy.length === 1 ? ctx.attacker.energy[0] : undefined);

/** Elemental Blast's Energy: a Fire, a Water and a Lightning Energy card attached (Rainbow Energy counts as any, last). */
function elementalEnergy(cards: AttackSituation['cards'], attacker: InPlayPokemon): CardInstance[] | null {
  const picked: CardInstance[] = [];
  for (const type of ['fire', 'water', 'lightning'] as const) {
    const free = attacker.energy.filter((e) => !picked.includes(e) && isEnergyCardOf(e, cards, type));
    // Plain cards of the type first, so Rainbow Energy is left for a type nothing else covers.
    const card = free.find((e) => lookupCard(cards, e.defId).name !== 'Rainbow Energy') ?? free[0];
    if (!card) return null;
    picked.push(card);
  }
  return picked;
}

/** Whether the attacker's own Pokémon Power is working (Final Blow, Hydroelectric Power), from what the attack can see. */
const ownPowerWorks = (s: AttackSituation) =>
  powerActive(s.attacker, s.cards, [
    { active: s.attacker, bench: s.ownBench, ...(s.powersOff && { powersOffUntil: s.turn }) },
    { active: s.defender, bench: s.opponentBench },
  ]);

/** Final Blow can be used: Heracross's power works and it has 20 HP or less left. */
const finalBlow = (s: AttackSituation) => ownPowerWorks(s) && inPlayDef(s.cards, s.attacker).hp - s.attacker.damage <= 20;

/** Hydroelectric Power: the Water Energy attached to Lanturn but not needed for Floodlight's cost. */
const spareWater = (s: Pick<AttackSituation, 'attacker' | 'cards'>) => extraEnergy({ attacker: s.attacker, state: { cards: s.cards } } as AttackContext, ['lightning', 'lightning'], 'water', 99);

/** The boost question (yes first), when the power would make the attack stronger. */
const boostQuestion = (prompt: string): ChoiceSpec[] => [{ kind: 'boost', options: [true, false], prompt }];

/** Super Metronome: the opponent's Pokémon in play with an attack to copy. */
const copySources = (s: AttackSituation) => targetsIn(s.defender, s.opponentBench).filter((t) => inPlayDef(s.cards, pokemonOn(s.defender, s.opponentBench, t)!).attacks.length > 0);

export const NEO1: Record<string, Record<string, AttackEffect>> = {
  // Ampharos
  'neo1-1': { Gigaspark: shower(40) },
  // Azumarill
  'neo1-2': { 'Bubble Shower': shower(30) },
  // Bellossom
  'neo1-3': {
    'Sweet Nectar': {
      choices: (s) => ownDamaged(s, 'Choose one of your Pokémon (heads: remove all damage counters from it)'),
      run(ctx) {
        const target = ctx.choices.ownTarget;
        const p = target === undefined ? null : target === 'active' ? ctx.me.active : ctx.me.bench[target];
        if (!p) return ctx.log('None of your Pokémon have damage counters.');
        if (ctx.flip()) healPokemon(ctx, ctx.me, p, 'all');
        else ctx.log('Sweet Nectar did nothing.');
      },
    },
    'Flower Dance': {
      run: (ctx) => void ctx.hit(30 * ownInPlay(ctx).filter((p) => inPlayDef(ctx.state.cards, p).name.includes('Bellossom')).length),
    },
  },
  // Feraligatr
  'neo1-4': { Chomp: { run: (ctx) => void ctx.hit(50 + 10 * ctx.flips(Math.floor(ctx.attacker.damage / 10))) } },
  // Feraligatr
  'neo1-5': {
    Riptide: {
      run(ctx) {
        const energy = ctx.me.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        ctx.hit(10 + 10 * energy.length);
        if (!energy.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !energy.includes(c));
        ctx.me.deck.push(...energy);
        shuffleOwnDeck(ctx);
        ctx.log(`Shuffled ${energy.length} Energy card${energy.length === 1 ? '' : 's'} from the discard pile into the deck.`);
      },
    },
  },
  // Heracross: Final Blow (its Pokémon Power), at 20 HP or less left, may make Megahorn's base damage 120 (asked, agreed).
  'neo1-6': {
    Megahorn: {
      choices: (s) => (finalBlow(s) ? boostQuestion("Final Blow: make Megahorn's base damage 120") : []),
      run(ctx) {
        // Only when it was asked (the answer is checked against what the attack sees now).
        const boosted = !!ctx.choices.boost && finalBlow(attackSituation(ctx.state, ctx.me, ctx.opp));
        if (!ctx.flip()) return ctx.log('The attack did nothing.');
        if (boosted) ctx.log('Final Blow: Megahorn does 120.');
        ctx.hit(boosted ? 120 : 60);
      },
    },
  },
  // Jumpluff
  'neo1-7': { 'Sleep Powder': inflicts(20, 'asleep'), 'Leech Seed': leechSeed(20) },
  // Kingdra
  'neo1-8': {
    Agility: flipToProtect(30, 'preventAll'),
    'Dragon Tornado': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to switch in if this doesn't Knock Out the Defending Pokémon"),
      run(ctx) {
        ctx.hit(50);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.active && ctx.opp.active.damage < ctx.defenderDef.hp) ctx.switchDefender(slot);
      },
    },
  },
  // Lugia
  'neo1-9': {
    'Elemental Blast': {
      text: 'Discard a Fire Energy card, a Water Energy card, and a Lightning Energy card attached to Lugia in order to use this attack.',
      blocked: (s) => (elementalEnergy(s.cards, s.attacker) ? null : 'Elemental Blast needs a Fire, a Water and a Lightning Energy card to discard'),
      run(ctx) {
        discardFromAttacker(ctx, elementalEnergy(ctx.state.cards, ctx.attacker) ?? []);
        ctx.hit(90);
      },
    },
  },
  // Meganium
  'neo1-10': { 'Body Slam': flipToInflict(40, 'paralyzed') },
  // Meganium
  'neo1-11': { 'Soothing Scent': inflicts(40, 'asleep') },
  // Pichu
  'neo1-12': {
    Zzzap: {
      run(ctx) {
        const powered = (p: InPlayPokemon | null) => !!p && !!inPlayDef(ctx.state.cards, p).power;
        if (powered(ctx.opp.active)) ctx.hit(20, { weakness: false });
        ctx.opp.bench.forEach((p, slot) => powered(p) && ctx.damageBenched(ctx.opp, slot, 20));
        ctx.me.bench.forEach((p, slot) => powered(p) && ctx.damageBenched(ctx.me, slot, 20));
        if (powered(ctx.attacker)) ctx.selfDamage(20);
      },
    },
  },
  // Skarmory
  'neo1-13': {
    Claw: flipOrNothing(20),
    'Steel Wing': {
      run(ctx) {
        ctx.hit(30);
        if (!ctx.flip()) return;
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 20, until: ctx.turn + 1 };
        ctx.log(`Attack damage to ${ctx.attackerDef.name} is reduced by 20 next turn.`);
      },
    },
  },
  // Slowking
  'neo1-14': {
    'Mind Blast': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(20);
        ctx.hit(30);
        ctx.inflict('confused');
      },
    },
  },
  // Steelix
  'neo1-15': { 'Tail Crush': flipForMore(30, 20) },
  // Togetic
  'neo1-16': {
    'Super Metronome': {
      text: "Flip a coin. If heads, choose an attack of 1 of your opponent's Pokémon. Super Metronome copies that attack except for its Energy cost. (You must still do anything else in order to use that attack.) (No matter what type the Defending Pokémon is, Togetic's type is still Colorless.) Togetic performs that attack. (Togetic can make that attack even if it does not have the appropriate number or type of Energy attached to it necessary to make the attack.)",
      choices(s, c) {
        const sources = copySources(s);
        if (!sources.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'copySource', options: sources, prompt: "Choose one of your opponent's Pokémon to copy an attack of (if heads)" }];
        const from = c.copyFrom !== undefined ? pokemonOn(s.defender, s.opponentBench, c.copyFrom) : null;
        if (!from || !sources.includes(c.copyFrom!)) return specs;
        const attacks = inPlayDef(s.cards, from).attacks;
        specs.push({ kind: 'copyAttack', of: c.copyFrom, options: attacks.flatMap((a, i) => (a.name === 'Super Metronome' ? [] : [i])), prompt: `Choose one of ${inPlayDef(s.cards, from).name}'s attacks to copy` });
        const copied = c.copyIndex !== undefined ? attacks[c.copyIndex] : undefined;
        // The copied attack's own questions, except its discard (as Metronome).
        const effect = copied && attackEffect(effectId(from), copied.name);
        if (effect?.choices) specs.push(...effect.choices(s, c));
        return specs;
      },
      run(ctx) {
        const from = ctx.choices.copyFrom !== undefined ? pokemonOn(ctx.opp.active, ctx.opp.bench, ctx.choices.copyFrom) : null;
        const copied = from && ctx.choices.copyIndex !== undefined ? inPlayDef(ctx.state.cards, from).attacks[ctx.choices.copyIndex] : undefined;
        if (!from || !copied) return ctx.log('Super Metronome had nothing to copy.');
        if (!ctx.flip()) return ctx.log('Super Metronome did nothing.');
        ctx.log(`Super Metronome copies ${copied.name}.`);
        ctx.useAttack(copied, effectId(from));
      },
    },
    Fly: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Fly did nothing.');
        ctx.hit(30);
        ctx.protect('preventAll');
      },
    },
  },
  // Typhlosion
  'neo1-17': {
    'Flame Burst': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(60);
        ctx.hit(80);
        ctx.selfDamage(20);
      },
    },
  },
  // Typhlosion
  'neo1-18': {
    'Flame Wheel': {
      discard: { count: 3 },
      run(ctx) {
        ctx.hit(80);
        ctx.benchDamage(ctx.me, 20);
        ctx.benchDamage(ctx.opp, 20);
      },
    },
  },
  // Cleffa
  'neo1-20': {
    Eeeeeeek: {
      run(ctx) {
        ctx.me.deck.push(...ctx.me.hand);
        ctx.me.hand = [];
        shuffleOwnDeck(ctx);
        ctx.log('Shuffled the hand into the deck.');
        ctx.draw(7);
      },
    },
  },
  // Donphan
  'neo1-21': {
    Flail: flail,
    'Rapid Spin': rapidSpin(50, 'Donphan'),
  },
  // Magby
  'neo1-23': {
    Sputter: {
      run(ctx) {
        ctx.hit(10);
        ctx.me.powersOffUntil = ctx.opp.powersOffUntil = ctx.turn + 2;
        ctx.log('All Pokémon Powers stop working until the end of the next turn.');
      },
    },
  },
  // Murkrow
  'neo1-24': {
    'Mean Look': { run: (ctx) => hold(ctx) },
    'Feint Attack': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 20, true),
    },
  },
  // Sneasel
  'neo1-25': {
    'Fury Swipes': perHeads(3, 10),
    'Beat Up': { run: (ctx) => void ctx.hit(20 * ctx.flips(ownInPlay(ctx).length)) },
  },
  // Aipom
  'neo1-26': {
    Pilfer: {
      choices: (s): ChoiceSpec[] =>
        s.ownDiscard.length ? [{ kind: 'ownDiscard', min: 1, max: 1, options: s.ownDiscard, prompt: 'Choose a card from your discard pile to shuffle into your deck (if heads)' }] : [],
      run(ctx) {
        shuffleIntoDeck(ctx, ctx.me, 'active', false);
        if (!ctx.flip()) return;
        const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids?.[0]);
        if (!card) return;
        ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
        ctx.me.deck.push(card);
        shuffleOwnDeck(ctx);
        ctx.log(`Shuffled ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile into the deck.`);
      },
    },
    'Tail Rap': perHeads(2, 10),
  },
  // Ariados
  'neo1-27': {
    'Spider Web': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log(`${ctx.defenderDef.name} can still retreat.`);
        ctx.affectDefender((e) => {
          e.stuck = true;
          ctx.log(`${ctx.defenderDef.name} can't retreat.`);
        });
      },
    },
    'Poison Bite': {
      run(ctx) {
        const damage = ctx.hit(20);
        if (!damage) return;
        ctx.inflict('poisoned');
        ctx.heal(Math.ceil(damage / 20) * 10);
      },
    },
  },
  // Bayleef
  'neo1-28': {
    Poisonpowder: flipToInflict(20, 'poisoned'),
    'Pollen Shield': {
      run(ctx) {
        ctx.hit(30);
        (ctx.attacker.effects ??= {}).pollenShield = ctx.turn + 1;
        ctx.log(`${ctx.attackerDef.name} can't become Asleep, Confused, Paralyzed or Poisoned next turn.`);
      },
    },
  },
  // Bayleef
  'neo1-29': {
    'Sweet Scent': {
      choices: (s) => [
        ...ownDamaged(s, 'Heads: choose one of your Pokémon to remove 2 damage counters from'),
        ...opponentDamaged(s, "Tails: choose one of your opponent's Pokémon to remove 2 damage counters from"),
      ],
      run(ctx) {
        const heads = ctx.flip();
        const owner = heads ? ctx.me : ctx.opp;
        const target = heads ? ctx.choices.ownTarget : ctx.choices.oppTarget;
        const p = target === undefined ? null : target === 'active' ? owner.active : owner.bench[target];
        if (p) healPokemon(ctx, owner, p, 20);
        else ctx.log('Sweet Scent did nothing.');
      },
    },
    'Double Razor Leaf': perHeads(2, 40),
  },
  // Clefairy
  'neo1-30': {
    Doubleslap: perHeads(2, 10),
    Squaredance: {
      run(ctx) {
        const inPlay = [ctx.me, ctx.opp].reduce((n, p) => n + [p.active, ...p.bench].filter(Boolean).length, 0);
        const heads = ctx.flips(inPlay);
        if (!heads) return ctx.log('Squaredance found nothing.');
        ctx.pend({ kind: 'pickFromDeck', source: 'Squaredance', filter: 'basicEnergy', count: heads, optional: true, reveal: true });
      },
    },
  },
  // Croconaw
  'neo1-31': {
    Screech: screech(0),
    'Jaw Clamp': {
      run(ctx) {
        ctx.hit(30);
        hold(ctx, ctx.turn + 1);
      },
    },
  },
  // Croconaw
  'neo1-32': {
    'Sweep Away': {
      run(ctx) {
        ctx.hit(50);
        const gone = ctx.me.deck.splice(0, 3);
        ctx.me.discard.push(...gone);
        ctx.log(`Discarded the top ${gone.length} card${gone.length === 1 ? '' : 's'} of the deck.`);
      },
    },
  },
  // Electabuzz
  'neo1-33': { Swift: swift(30) },
  // Flaaffy
  'neo1-34': {
    Discharge: {
      run(ctx) {
        const energy = [...ctx.attacker.energy];
        discardFromAttacker(ctx, energy);
        ctx.hit(30 * ctx.flips(energy.length));
      },
    },
    'Electric Current': {
      choices(s): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        return [
          ...oneOwnEnergy(s, bench.length ? 'Choose an Energy card to move' : 'Choose an Energy card to discard (you have no benched Pokémon)'),
          ...(bench.length ? [{ kind: 'ownBench' as const, options: bench, prompt: 'Choose one of your benched Pokémon to attach it to' }] : []),
        ];
      },
      run(ctx) {
        ctx.hit(20);
        const energy = chosenEnergy(ctx);
        if (!energy) return;
        const slot = ctx.choices.ownBenchSlot;
        const to = slot === undefined ? null : ctx.me.bench[slot];
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== energy);
        if (!to) {
          ctx.me.discard.push(energy);
          return ctx.log(`Discarded ${lookupCard(ctx.state.cards, energy.defId).name}.`);
        }
        to.energy.push(energy);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Furret
  'neo1-35': { 'Quick Attack': flipForMore(20, 10), Slam: perHeads(2, 30) },
  // Gloom
  'neo1-36': {
    'Strange Powder': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict(ctx.flip() ? 'confused' : 'asleep');
      },
    },
    'Sticky Nectar': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(20);
        ctx.hit(30);
        hold(ctx, ctx.turn + 1);
      },
    },
  },
  // Granbull
  'neo1-37': {
    'Raging Charge': {
      run(ctx) {
        ctx.hit(10 + ctx.attacker.damage);
        ctx.selfDamage(20);
      },
    },
  },
  // Lanturn: Hydroelectric Power (its Pokémon Power) may add 10 for each Water Energy not used for Floodlight's cost (asked, agreed).
  'neo1-38': {
    Floodlight: {
      choices: (s) => (ownPowerWorks(s) && spareWater(s) > 0 ? boostQuestion(`Hydroelectric Power: Floodlight does ${10 * spareWater(s)} more damage`) : []),
      run(ctx) {
        const more = ctx.choices.boost && ownPowerWorks(attackSituation(ctx.state, ctx.me, ctx.opp)) ? 10 * spareWater({ attacker: ctx.attacker, cards: ctx.state.cards }) : 0;
        if (more) ctx.log(`Hydroelectric Power: ${more} more damage.`);
        ctx.hit(20 + more);
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Ledian
  'neo1-39': {
    'Baton Pass': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: "Choose one of your benched Pokémon to take Ledian's Energy and switch in" }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        const to = slot === undefined ? null : ctx.me.bench[slot];
        if (!to || ctx.me.active !== ctx.attacker) return;
        const moved = ctx.attacker.energy;
        ctx.attacker.energy = [];
        to.energy.push(...moved);
        if (moved.length) ctx.log(`Moved ${moved.length} Energy card${moved.length === 1 ? '' : 's'} to ${pokemonName(ctx.state, to)}.`);
        ctx.switchOwn(slot!);
      },
    },
  },
  // Miltank
  'neo1-41': {
    'Milk Drink': { run: (ctx) => ctx.heal(20 * ctx.flips(2)) },
    'Body Slam': flipToInflict(20, 'paralyzed'),
  },
  // Phanpy
  'neo1-43': {
    Endure: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Endure did nothing.');
        (ctx.attacker.effects ??= {}).endure = ctx.turn + 1;
        ctx.log(`${ctx.attackerDef.name} can't be Knocked Out by an attack next turn: it would be left with 10 HP.`);
      },
    },
  },
  // Piloswine
  'neo1-44': {
    Freeze: {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.frozen = true;
          ctx.log(`${ctx.defenderDef.name} can't attack.`);
        });
      },
    },
    Blizzard: {
      run(ctx) {
        ctx.hit(30);
        ctx.benchDamage(ctx.flip() ? ctx.opp : ctx.me, 10);
      },
    },
  },
  // Quagsire
  'neo1-45': {
    Earthquake: {
      run(ctx) {
        ctx.hit(60);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Quilava
  'neo1-46': {
    Ember: discardToUse(30, 1, undefined),
    'Fire Wind': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon (10 damage to it for each heads)"),
      run(ctx) {
        ctx.hit(20);
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot]) return;
        const heads = ctx.flips(2);
        if (heads) ctx.damageBenched(ctx.opp, slot, 10 * heads);
      },
    },
  },
  // Quilava
  'neo1-47': {
    Smokescreen: smokescreen(20),
    Char: {
      run(ctx) {
        ctx.hit(30);
        const defender = ctx.opp.active;
        if (!defender || defender.charCounter || !ctx.flip()) return;
        ctx.affectDefender(() => {
          defender.charCounter = true;
          ctx.log(`A Char counter is on ${pokemonName(ctx.state, defender)}.`);
        });
      },
    },
  },
  // Seadra
  'neo1-48': {
    Bubble: flipToInflict(10, 'paralyzed'),
    'Mud Splash': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon (heads: 10 damage to it)"),
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot] && ctx.flip()) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Skiploom
  'neo1-49': { Poisonpowder: inflicts(10, 'poisoned'), 'Stun Spore': flipToInflict(10, 'paralyzed') },
  // Sunflora
  'neo1-50': {
    'Petal Dance': {
      run(ctx) {
        ctx.hit(30 * ctx.flips(3));
        ctx.confuseSelf();
      },
    },
  },
  // Togepi
  'neo1-51': { 'Poison Barb': inflicts(10, 'poisoned') },
  // Xatu
  'neo1-52': { Prophecy: FOSSIL['base3-8']!.Prophecy!, 'Confuse Ray': flipToInflict(30, 'confused') },
  // Chikorita: half the damage, rounded down to the nearest 10, as Light Screen.
  'neo1-53': { Deflector: { run: (ctx) => ctx.protect('lightScreen') } },
  // Chikorita
  'neo1-54': {
    // The Defending Pokémon's attacks on Chikorita next turn do 10 less, before Weakness and Resistance (as Togepi's Snivel).
    Growl: {
      run(ctx) {
        const target = baseUid(ctx.attacker);
        ctx.affectDefender((e) => {
          e.pounce = { target, amount: 10, until: ctx.turn + 1, beforeWeakness: true };
          ctx.log(`${ctx.defenderDef.name}'s attacks on ${ctx.attackerDef.name} do 10 less damage next turn.`);
        });
      },
    },
  },
  // Chinchou
  'neo1-55': { Supersonic: flipToInflict(0, 'confused'), Flail: flail },
  // Cyndaquil
  'neo1-56': { Leer: cantAttackMe, Swift: swift(20) },
  // Cyndaquil
  'neo1-57': {
    Fireworks: {
      choices: (s) => oneOwnEnergy(s, 'Choose an Energy card to discard (if tails)'),
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) return;
        const energy = chosenEnergy(ctx);
        if (energy) discardFromAttacker(ctx, [energy]);
      },
    },
    'Quick Attack': flipForMore(10, 20),
  },
  // Girafarig
  'neo1-58': { Agility: flipToProtect(10, 'preventAll'), Psybeam: flipToInflict(20, 'confused') },
  // Gligar
  'neo1-59': { 'Poison Sting': flipToInflict(10, 'poisoned') },
  // Hoothoot
  'neo1-60': { Hypnosis: inflicts(0, 'asleep') },
  // Hoppip
  'neo1-61': { Sprout: benchSearch('Sprout', { filter: 'basicNamed', name: 'Hoppip' }) },
  // Horsea
  'neo1-62': {
    'Fin Slap': {
      run(ctx) {
        const last = ctx.attacker.effects?.attackedOn;
        ctx.hit(last && last.turn === ctx.turn - 1 && last.damage > 0 ? 30 : 20);
      },
    },
  },
  // Ledyba
  'neo1-63': { Supersonic: flipToInflict(0, 'confused'), 'Comet Punch': perHeads(4, 10) },
  // Mantine
  'neo1-64': { Undulate: flipToProtect(20, 'preventAll') },
  // Mareep
  'neo1-65': {
    'Static Electricity': {
      text: 'For each Mareep in play, you may search your deck for a Lightning Energy card and attach it to Mareep. Shuffle your deck afterward.',
      run(ctx) {
        const mareep = [ctx.me, ctx.opp].flatMap((p) => [p.active, ...p.bench]).filter((p) => p && inPlayDef(ctx.state.cards, p).name === 'Mareep').length;
        ctx.pend({ kind: 'pickFromDeck', source: 'Static Electricity', filter: 'energyType', type: 'lightning', count: mareep, optional: true, attachToActive: true });
      },
    },
    Thundershock: flipToInflict(20, 'paralyzed'),
  },
  // Marill
  'neo1-66': {
    'Defense Curl': flipToProtect(0, 'preventDamage'),
    'Bubble Bomb': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) ctx.inflict('paralyzed');
        else ctx.selfDamage(10);
      },
    },
  },
  // Natu
  'neo1-67': {
    Telekinesis: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 20),
    },
  },
  // Oddish
  'neo1-68': { Hide: flipToProtect(0, 'preventAll'), Absorb: absorb(20) },
  // Onix
  'neo1-69': { Screech: screech(0), Rage: rage(10) },
  // Pikachu
  'neo1-70': { 'Quick Attack': flipForMore(10, 20), Agility: flipToProtect(20, 'preventAll') },
  // Sentret
  'neo1-71': { 'Fury Swipes': perHeads(3, 10) },
  // Shuckle
  'neo1-72': { Withdraw: flipToProtect(0, 'preventDamage'), Wrap: flipToInflict(20, 'paralyzed') },
  // Slowpoke
  'neo1-73': {
    Psyshock: flipToInflict(10, 'paralyzed'),
    'Water Gun': {
      text: "Does 10 damage plus 10 more damage for each Water Energy attached to Slowpoke but not used to pay for this attack's Energy cost. You can't add more than 20 damage in this way.",
      run: (ctx) => void ctx.hit(10 + 10 * extraEnergy(ctx, ['water'], 'water', 2)),
    },
  },
  // Snubbull
  'neo1-74': {
    Roar: {
      run(ctx) {
        if (ctx.flip()) opponentSwitches(ctx, 'Roar');
        else ctx.log('Roar did nothing.');
      },
    },
    Lick: flipToInflict(10, 'paralyzed'),
  },
  // Spinarak
  'neo1-75': {
    'Scary Face': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Scary Face did nothing.');
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          e.noRetreat = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack or retreat next turn.`);
        });
      },
    },
    'String Shot': flipToInflict(10, 'paralyzed'),
  },
  // Stantler
  'neo1-76': { Stomp: flipForMore(20, 10), 'Mystifying Horns': flipToInflict(20, 'confused') },
  // Sudowoodo
  'neo1-77': { Flail: flail },
  // Sunkern
  'neo1-78': {
    Growth: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Growth did nothing.');
        if (!ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) return ctx.log('No Energy cards in the hand.');
        ctx.pend({ kind: 'attachFromHand', source: 'Growth', count: 2 });
      },
    },
    'Mega Drain': absorb(30),
  },
  // Swinub
  'neo1-79': { 'Powder Snow': inflicts(10, 'asleep') },
  // Totodile
  'neo1-80': { Rage: rage(10) },
  // Totodile
  'neo1-81': { Leer: cantAttackMe, 'Fury Swipes': perHeads(3, 10) },
  // Wooper
  'neo1-82': { Amnesia: BASE1['base1-38']!.Amnesia!, Slam: perHeads(2, 20) },
};
