// Expedition (ecard1) attack effects, by card id and attack name. Rulings follow the card text (the e-Card rulebook), as
// for the Neo sets. TCGdex's Expedition text has every Energy type in it (checked against the card images), so no
// printed `text` is needed; its other errors are fixed in the seed's TCGDEX_FIXES (Weakness and Resistance, two missing
// "Evolves from", Hoppip's attacks, "Entagling Thread"), and the misspelling is answered to here until a re-seed. The
// non-holo prints of the holo rares (33–70) take the holos' effects (withNonHolo, ecard1-prints.ts). Attacks that only
// deal damage need no entry.
// Rulings (from the text): questions whose answer depends on a flip are asked before it (Scorching Whirlwind's 2 Energy
// cards, Overrun's Benched Pokémon). Energy Patch and Reflect Energy move a basic Energy card between the attacking
// player's own Pokémon (no Energy is attached from the hand). Super Psywave and Misfire put damage counters (no Weakness,
// Resistance or anything that changes damage). Giant Wave stops Wartortle attacking at all during its player's next turn.
import { pokemonOn, targetsIn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard } from '../cards.js';
import { energyPool, isEnergyCardOf, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { pokemonName } from '../status.js';
import {
  basicEnergyOn,
  benchedSlots,
  benchTarget,
  discardToUse,
  energyCards,
  flipToInflict,
  headsUntilTails,
  inflicts,
  leechSeed,
  opponentBenchChoice,
  opponentTargets,
  perHeads,
  recoil,
  tailsSelfDamage,
  thrash,
  whirlwind,
} from './common.js';
import { withNonHolo } from './ecard1-prints.js';
import { benchMany, discardFromAttacker, noRetreat } from './gym1.js';
import { flipForMore } from './jungle.js';
import { attachFromDiscard } from './neo3.js';
import { flipOrNothing } from './rocket.js';
import { eitherCondition, healUpTo } from './si1.js';

export { basicEnergyOn, energyCards };

/** `type` Energy cards attached to the attacker (Rainbow Energy last). */
export const typedCards = (ctx: AttackContext, type: 'fire' | 'lightning' | 'water') => {
  const cards = ctx.attacker.energy.filter((e) => isEnergyCardOf(e, ctx.state.cards, type));
  const rainbow = (e: CardInstance) => lookupCard(ctx.state.cards, e.defId).name === 'Rainbow Energy';
  return [...cards.filter((e) => !rainbow(e)), ...cards.filter(rainbow)];
};

/** Base damage, or `alt` instead when `alternative` says so (Syncroblast, Rending Jaws). */
const baseOr = (damage: number, alt: number, alternative: (ctx: AttackContext) => boolean): AttackEffect => ({
  run(ctx) {
    const other = alternative(ctx);
    if (other) ctx.log(`The attack's base damage is ${alt}.`);
    ctx.hit(other ? alt : damage);
  },
});

/** Base damage, then the attacker switches with one of its player's benched Pokémon, if any (Hide in Shadows). */
export const hideAway = (damage: number): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const options = benchedSlots(s.ownBench);
    return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your benched Pokémon to switch with' }] : [];
  },
  run(ctx) {
    ctx.hit(damage);
    if (ctx.choices.ownBenchSlot !== undefined && ctx.choices.ownBenchSlot >= 0) ctx.switchOwn(ctx.choices.ownBenchSlot);
  },
});

/** `damage` to each of the opponent's benched Pokémon (no Weakness or Resistance), after the attack's own (Thermal Blast, Stamp). */
const benchSplash = (ctx: AttackContext, damage: number) => ctx.benchDamage(ctx.opp, damage);

/** Puts `n` damage counters on one of the opponent's Pokémon, unless the attack can't affect it. */
export function putCounters(ctx: AttackContext, t: Target, n: number) {
  const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t);
  if (!p || n <= 0) return;
  const put = () => {
    p.damage += 10 * n;
    ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
  };
  if (t === 'active') ctx.affectDefender(put);
  else if (ctx.canAffect(ctx.opp, p)) put();
}

/** Base damage; heads attaches a `type` Energy card from the discard pile to the attacker, if there are any (Plasma, Collect Fire). */
export const plasma = (damage: number, type: 'lightning' | 'fire' | 'water'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.me.discard.some((c) => isEnergyCardOf(c, ctx.state.cards, type))) return;
    if (ctx.flip()) attachFromDiscard(ctx, (c) => isEnergyCardOf(c, ctx.state.cards, type));
  },
});

/** Base damage; then a basic Energy card from the attacker moves to one of its player's Benched Pokémon (Reflect Energy). */
export const reflectEnergy = (damage: number, name: string): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const energy = basicEnergyOn(s.cards, s.attacker);
    const bench = benchedSlots(s.ownBench);
    if (!energy.length || !bench.length) return [];
    return [
      { kind: 'pokemonEnergy', options: energy, prompt: `Choose a basic Energy card to move from ${name}` },
      { kind: 'ownBench', options: bench, prompt: 'Choose one of your benched Pokémon to attach it to' },
    ];
  },
  run(ctx) {
    ctx.hit(damage);
    const slot = ctx.choices.ownBenchSlot;
    const to = slot === undefined || slot < 0 ? null : ctx.me.bench[slot];
    if (to && ctx.choices.oppEnergyUid && ctx.me.active === ctx.attacker) moveEnergy(ctx, ctx.attacker, to, ctx.choices.oppEnergyUid);
  },
});

/** A basic Energy card from the deck, attached to the attacker (Energy Draw). */
export const energyDraw: AttackEffect = {
  run(ctx) {
    if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Energy Draw', filter: 'basicEnergy', attachToActive: true });
  },
};

/** The attacking player's Pokémon in play that have a basic Energy card attached (Energy Patch). */
const withBasicEnergy = (s: AttackSituation) => targetsIn(s.attacker, s.ownBench).filter((t) => basicEnergyOn(s.cards, pokemonOn(s.attacker, s.ownBench, t)!).length > 0);

/** Moves the Energy card `uid` from one of the attacking player's Pokémon to another, logging it. */
export function moveEnergy(ctx: AttackContext, from: InPlayPokemon, to: InPlayPokemon, uid: string) {
  const energy = from.energy.find((e) => e.uid === uid);
  if (!energy || from === to) return;
  from.energy = from.energy.filter((e) => e !== energy);
  to.energy.push(energy);
  ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
}

const HOLO: Record<string, Record<string, AttackEffect>> = {
  // Alakazam – Syncroblast: 20 instead of 80 unless Alakazam and the Defending Pokémon have as many Energy cards attached.
  'ecard1-1': { Syncroblast: baseOr(80, 20, (ctx) => energyCards(ctx.attacker).length !== energyCards(ctx.defender).length) },
  // Ampharos – Lightning Strike: may discard all its Lightning Energy cards for 80 instead of 40.
  'ecard1-2': {
    'Lightning Strike': {
      choices: (s) => (s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'lightning')) ? [{ kind: 'boost', options: [true, false], prompt: 'Discard all Lightning Energy cards attached to Ampharos for 80 damage instead of 40?' }] : []),
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(40);
        discardFromAttacker(ctx, typedCards(ctx, 'lightning'));
        ctx.hit(80);
      },
    },
  },
  // Arbok – Poison Spray; Poison Reaction: 20 more if the Defending Pokémon is Poisoned.
  'ecard1-3': {
    'Poison Spray': inflicts(0, 'poisoned'),
    'Poison Reaction': { run: (ctx) => void ctx.hit(ctx.defender.poison ? 40 : 20) },
  },
  // Blastoise – Energy Cannon: 10 more for each Energy beyond the cost (3), up to 20 more.
  'ecard1-4': { 'Energy Cannon': { run: (ctx) => void ctx.hit(40 + 10 * Math.min(2, Math.max(0, energyPool(ctx.attacker, ctx.state.cards).length - 3))) } },
  // Butterfree – Spiral Drain: heads removes 2 damage counters from Butterfree.
  'ecard1-5': {
    'Spiral Drain': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.flip()) ctx.heal(20);
      },
    },
  },
  // Charizard – Scorching Whirlwind: 2 coins; 1 tails discards 2 of its Energy cards (chosen first), 2 tails all of them.
  'ecard1-6': {
    'Scorching Whirlwind': {
      choices: (s) => (energyCards(s.attacker).length > 2 ? [{ kind: 'ownEnergy', count: 2, options: energyCards(s.attacker), prompt: 'Choose 2 Energy cards to discard if 1 coin is tails' }] : []),
      run(ctx) {
        ctx.hit(120);
        const heads = ctx.flips(2);
        if (heads === 0) discardFromAttacker(ctx, energyCards(ctx.attacker));
        else if (heads === 1) {
          const chosen = new Set(ctx.choices.energyUids ?? []);
          const cards = energyCards(ctx.attacker);
          discardFromAttacker(ctx, chosen.size ? cards.filter((e) => chosen.has(e.uid)) : cards.slice(0, 2));
        }
      },
    },
  },
  // Clefable – Doubleslap.
  'ecard1-7': { Doubleslap: perHeads(2, 20) },
  // Cloyster – Lick, Auto Fire.
  'ecard1-8': { Lick: flipToInflict(10, 'paralyzed'), 'Auto Fire': perHeads(4, 20) },
  // Dragonite – Dragon Tail.
  'ecard1-9': { 'Dragon Tail': perHeads(2, 40) },
  // Dugtrio – Magnitude: 10 to each Benched Pokémon, both players'.
  'ecard1-10': {
    Magnitude: {
      run(ctx) {
        ctx.hit(40);
        ctx.benchDamage(ctx.opp, 10);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Fearow – Clutch; Supersonic Flight.
  'ecard1-11': { Clutch: noRetreat(20), 'Supersonic Flight': flipOrNothing(50) },
  // Feraligatr – Rending Jaws: 40 instead of 70 if the Defending Pokémon has no damage counters.
  'ecard1-12': { 'Rending Jaws': baseOr(70, 40, (ctx) => ctx.defender.damage === 0) },
  // Gengar – Hide in Shadows.
  'ecard1-13': { 'Hide in Shadows': hideAway(40) },
  // Golem – Rock Tumble: no Resistance.
  'ecard1-14': { 'Rock Tumble': { run: (ctx) => void ctx.hit(60, { resistance: false }) } },
  // Kingler – Bubble; Giant Claw.
  'ecard1-15': { Bubble: flipToInflict(10, 'paralyzed'), 'Giant Claw': flipOrNothing(70) },
  // Machamp – Iron Fist: heads, 10 more for each of its player's Pokémon in play with damage counters.
  'ecard1-16': {
    'Iron Fist': {
      run(ctx) {
        const hurt = [ctx.me.active, ...ctx.me.bench].filter((p) => p && p.damage > 0).length;
        ctx.hit(ctx.flip() ? 50 + 10 * hurt : 50);
      },
    },
  },
  // Magby – Energy Catch: heads puts a basic Energy card from the discard pile into the hand.
  'ecard1-17': {
    'Energy Catch': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Energy Catch did nothing.');
        if (ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'discardToHand', source: 'Energy Catch', count: 1, filter: 'basicEnergy' });
      },
    },
  },
  // Meganium – Poisonpowder.
  'ecard1-18': { Poisonpowder: inflicts(40, 'poisoned') },
  // Mew – Super Psywave: damage counters on one of the opponent's Pokémon, one for each Energy card attached to it.
  'ecard1-19': {
    'Super Psywave': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon: a damage counter for each Energy card attached to it"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t);
        if (p) putCounters(ctx, t, energyCards(p).length);
      },
    },
  },
  // Mewtwo – Hypnosis; Psychic: 10 more for each Energy card attached to the Defending Pokémon.
  'ecard1-20': {
    Hypnosis: flipToInflict(0, 'asleep'),
    Psychic: { run: (ctx) => void ctx.hit(20 + 10 * energyCards(ctx.defender).length) },
  },
  // Ninetales – Mislead: 2 coins, either heads Confuses; Ethereal Flame: discards its Fire Energy cards, 20 more for each.
  'ecard1-21': {
    Mislead: {
      run(ctx) {
        if (ctx.flips(2) > 0) ctx.inflict('confused');
      },
    },
    'Ethereal Flame': {
      damage: '30+',
      run(ctx) {
        const fire = typedCards(ctx, 'fire');
        discardFromAttacker(ctx, fire);
        ctx.hit(30 + 20 * fire.length);
      },
    },
  },
  // Pichu – Energy Patch: a basic Energy card from one of its player's Pokémon to another.
  'ecard1-22': {
    'Energy Patch': {
      blocked: (s) => (!withBasicEnergy(s).length ? 'None of your Pokémon has a basic Energy card attached' : targetsIn(s.attacker, s.ownBench).length < 2 ? 'You have no other Pokémon to move it to' : null),
      choices(s, c): ChoiceSpec[] {
        const specs: ChoiceSpec[] = [{ kind: 'ownPokemon', options: withBasicEnergy(s), prompt: 'Choose one of your Pokémon to take a basic Energy card from' }];
        if (c.ownTarget === undefined) return specs;
        const from = pokemonOn(s.attacker, s.ownBench, c.ownTarget);
        if (!from) return specs;
        specs.push({ kind: 'pokemonEnergy', options: basicEnergyOn(s.cards, from), prompt: 'Choose the basic Energy card to move' });
        specs.push({ kind: 'ownPokemonTo', options: targetsIn(s.attacker, s.ownBench).filter((t) => t !== c.ownTarget), prompt: 'Choose one of your Pokémon to attach it to' });
        return specs;
      },
      run(ctx) {
        const { ownTarget, ownTo, oppEnergyUid } = ctx.choices;
        const from = ownTarget === undefined ? null : pokemonOn(ctx.me.active, ctx.me.bench, ownTarget);
        const to = ownTo === undefined ? null : pokemonOn(ctx.me.active, ctx.me.bench, ownTo);
        if (from && to && oppEnergyUid) moveEnergy(ctx, from, to, oppEnergyUid);
      },
    },
  },
  // Pidgeot – Sharp Beak.
  'ecard1-23': { 'Sharp Beak': flipForMore(20, 30) },
  // Poliwrath – Water Punch: a coin for each Water Energy attached, 10 more for each heads.
  'ecard1-24': { 'Water Punch': { run: (ctx) => void ctx.hit(40 + 10 * ctx.flips(energyPool(ctx.attacker, ctx.state.cards).filter((t) => t === 'water' || t === 'any').length)) } },
  // Raichu – Plasma: heads attaches a Lightning Energy card from the discard pile; Shock Bolt: discards its Lightning Energy cards.
  'ecard1-25': {
    Plasma: plasma(10, 'lightning'),
    'Shock Bolt': {
      run(ctx) {
        const lightning = typedCards(ctx, 'lightning');
        if (!lightning.length) return ctx.log('Shock Bolt did nothing.');
        discardFromAttacker(ctx, lightning);
        ctx.hit(60);
      },
    },
  },
  // Rapidash – Overrun: heads, 10 to one of the opponent's benched Pokémon (chosen first).
  'ecard1-26': {
    Overrun: {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to do 10 damage to (on heads)"),
      run(ctx) {
        ctx.hit(20);
        if (ctx.choices.benchSlot !== undefined && ctx.opp.bench[ctx.choices.benchSlot] && ctx.flip()) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 10);
      },
    },
  },
  // Skarmory – Steel Beak; Air Cutter.
  'ecard1-27': { 'Steel Beak': flipForMore(20, 10), 'Air Cutter': flipOrNothing(50) },
  // Typhlosion – Super Singe.
  'ecard1-28': { 'Super Singe': flipToInflict(50, 'burned') },
  // Tyranitar – Stamp: heads, 10 more and 10 to each of the opponent's benched Pokémon.
  'ecard1-29': {
    Stamp: {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(50);
        ctx.hit(60);
        benchSplash(ctx, 10);
      },
    },
  },
  // Venusaur – Body Slam.
  'ecard1-30': { 'Body Slam': flipToInflict(40, 'paralyzed') },
  // Vileplume – Petal Dance: Vileplume is now Confused.
  'ecard1-31': {
    'Petal Dance': {
      run(ctx) {
        ctx.hit(30 * ctx.flips(3));
        ctx.confuseSelf();
      },
    },
  },
  // Weezing – Foul Gas; Misfire: tails puts 6 damage counters on Weezing.
  'ecard1-32': {
    'Foul Gas': eitherCondition(0, 'poisoned', 'confused'),
    Misfire: {
      run(ctx) {
        ctx.hit(60);
        if (ctx.flip()) return;
        ctx.attacker.damage += 60;
        ctx.log(`Put 6 damage counters on ${ctx.attackerDef.name}.`);
      },
    },
  },
};

export const ECARD1: Record<string, Record<string, AttackEffect>> = {
  ...withNonHolo(HOLO),
  // Blastoise – Bubble, Double Cannon.
  'ecard1-36': { Bubble: flipToInflict(20, 'paralyzed'), 'Double Cannon': perHeads(2, 40) },
  // Charizard – Tail Smash; Flamethrower: discard a Fire Energy card.
  'ecard1-39': { 'Tail Smash': flipOrNothing(40), Flamethrower: discardToUse(60, 1, 'fire') },
  // Feraligatr – Double Claw: 20 more for each heads.
  'ecard1-46': { 'Double Claw': { run: (ctx) => void ctx.hit(30 + 20 * ctx.flips(2)) } },
  // Meganium – Sleep Powder.
  'ecard1-53': { 'Sleep Powder': inflicts(20, 'asleep') },
  // Typhlosion – Quick Attack; Thermal Blast: heads, 10 to each of the opponent's benched Pokémon.
  'ecard1-64': {
    'Quick Attack': flipForMore(10, 20),
    'Thermal Blast': {
      run(ctx) {
        ctx.hit(40);
        if (ctx.flip()) benchSplash(ctx, 10);
      },
    },
  },
  // Venusaur – Leech Seed; Fury Strikes.
  'ecard1-67': { 'Leech Seed': leechSeed(20), 'Fury Strikes': perHeads(3, 30) },
  // Bayleef – Mysterious Powder.
  'ecard1-71': { 'Mysterious Powder': flipToInflict(0, 'confused') },
  // Chansey – Bind Wound: heads removes 2 damage counters from one of its player's Pokémon (chosen first); Dogpile.
  'ecard1-72': {
    'Bind Wound': {
      choices: (s) => [{ kind: 'ownPokemon', options: targetsIn(s.attacker, s.ownBench), prompt: 'Choose one of your Pokémon to remove 2 damage counters from (on heads)' }],
      run(ctx) {
        const p = pokemonOn(ctx.me.active, ctx.me.bench, ctx.choices.ownTarget ?? 'active');
        if (!ctx.flip()) return ctx.log('Bind Wound did nothing.');
        if (p) healUpTo(ctx, ctx.me, p, 20);
      },
    },
    Dogpile: {
      run(ctx) {
        const benched = benchedSlots(ctx.me.bench).length;
        ctx.hit(10 * benched);
        if (benched) ctx.selfDamage(10 * benched);
      },
    },
  },
  // Charmeleon – Double Scratch; Flamethrower.
  'ecard1-73': { 'Double Scratch': perHeads(2, 20), Flamethrower: discardToUse(50, 1, 'fire') },
  // Croconaw – Take Down.
  'ecard1-74': { 'Take Down': recoil(40, 10) },
  // Dragonair – Spiral Wave.
  'ecard1-75': { 'Spiral Wave': { run: (ctx) => void ctx.hit(20 * headsUntilTails(ctx)) } },
  // Electabuzz – Energy Draw: a basic Energy card from the deck attached to it; Reflect Energy: a basic Energy card from it to a benched Pokémon.
  'ecard1-76': {
    'Energy Draw': energyDraw,
    'Reflect Energy': reflectEnergy(20, 'Electabuzz'),
  },
  // Flaaffy – Thunder Jolt.
  'ecard1-77': { 'Thunder Jolt': tailsSelfDamage(50, 20) },
  // Gloom – Foul Odor: both the Defending Pokémon and Gloom are now Confused.
  'ecard1-78': {
    'Foul Odor': {
      run(ctx) {
        ctx.hit(30);
        ctx.inflict('confused');
        ctx.confuseSelf();
      },
    },
  },
  // Graveler – Rock Hurl: no Resistance; Rock Slide: 10 to 2 of the opponent's benched Pokémon.
  'ecard1-79': { 'Rock Hurl': { run: (ctx) => void ctx.hit(20, { resistance: false }) }, 'Rock Slide': benchMany(2, 30, 10) },
  // Haunter – Nightmare; Dream Eater: nothing unless the Defending Pokémon is Asleep.
  'ecard1-80': {
    Nightmare: inflicts(20, 'asleep'),
    'Dream Eater': {
      run(ctx) {
        if (ctx.defender.condition !== 'asleep') return ctx.log('Dream Eater did nothing.');
        ctx.hit(50);
      },
    },
  },
  // Hitmonlee – Stretch Kick: 30 to one of the opponent's benched Pokémon.
  'ecard1-81': { 'Stretch Kick': benchTarget(0, 30) },
  // Ivysaur – Sleep Seed.
  'ecard1-82': { 'Sleep Seed': inflicts(20, 'asleep') },
  // Jynx – Ice Punch, Powder Snow.
  'ecard1-83': { 'Ice Punch': flipToInflict(10, 'paralyzed'), 'Powder Snow': inflicts(20, 'asleep') },
  // Kadabra – Energy Recall: 2 basic Energy cards from the discard pile attached to it; Confuse Ray.
  'ecard1-84': {
    'Energy Recall': {
      choices(s): ChoiceSpec[] {
        const options = s.ownDiscard.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId)));
        return options.length ? [{ kind: 'ownDiscard', min: Math.min(2, options.length), max: 2, options, prompt: 'Choose 2 basic Energy cards to attach to Kadabra' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.discardUids ?? []);
        const cards = ctx.me.discard.filter((c) => uids.has(c.uid));
        if (!cards.length || ctx.me.active !== ctx.attacker) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !uids.has(c.uid));
        ctx.attacker.energy.push(...cards);
        ctx.log(`Attached ${cards.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(' and ')} from the discard pile to ${ctx.attackerDef.name}.`);
      },
    },
    'Confuse Ray': flipToInflict(20, 'confused'),
  },
  // Magmar – Flaming Punch; Thrash.
  'ecard1-86': { 'Flaming Punch': flipToInflict(10, 'burned'), Thrash: thrash(30) },
  // Pidgeotto – Whirlwind.
  'ecard1-88': { Whirlwind: whirlwind(20) },
  // Poliwhirl – Bubblebeam.
  'ecard1-89': { Bubblebeam: flipToInflict(30, 'paralyzed') },
  // Quilava – Super Singe.
  'ecard1-91': { 'Super Singe': flipToInflict(20, 'burned') },
  // Wartortle – Doubleslap; Giant Wave: Wartortle can't attack during its player's next turn.
  'ecard1-92': {
    Doubleslap: perHeads(2, 10),
    'Giant Wave': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).noAttack = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name} can't attack next turn.`);
      },
    },
  },
  // Abra – Confuse Ray.
  'ecard1-93': { 'Confuse Ray': flipToInflict(0, 'confused') },
  // Bulbasaur – Poison Seed.
  'ecard1-94': { 'Poison Seed': flipToInflict(10, 'poisoned') },
  // Bulbasaur – Sleep Seed.
  'ecard1-95': { 'Sleep Seed': inflicts(0, 'asleep') },
  // Caterpie – Entangling Thread (TCGdex: "Entagling Thread", until a re-seed).
  'ecard1-96': { 'Entangling Thread': flipToInflict(10, 'paralyzed'), 'Entagling Thread': flipToInflict(10, 'paralyzed') },
  // Charmander – Tail Rap.
  'ecard1-97': { 'Tail Rap': perHeads(2, 10) },
  // Charmander – Searing Flame.
  'ecard1-98': { 'Searing Flame': flipToInflict(10, 'burned') },
  // Chikorita – Hypnotic Gaze; Double Scratch.
  'ecard1-99': { 'Hypnotic Gaze': inflicts(0, 'asleep'), 'Double Scratch': perHeads(2, 20) },
  // Chikorita – Sleep Powder.
  'ecard1-100': { 'Sleep Powder': inflicts(10, 'asleep') },
  // Clefairy – Shining Fingers.
  'ecard1-101': { 'Shining Fingers': inflicts(0, 'asleep') },
  // Corsola – Spike Cannon.
  'ecard1-102': { 'Spike Cannon': perHeads(3, 20) },
  // Cubone – Bone Smash.
  'ecard1-103': { 'Bone Smash': flipOrNothing(30) },
  // Cyndaquil – Singe; Quick Attack.
  'ecard1-104': { Singe: flipToInflict(0, 'burned'), 'Quick Attack': flipForMore(10, 20) },
  // Cyndaquil – Ember.
  'ecard1-105': { Ember: discardToUse(30, 1, 'fire') },
  // Diglett – Fury Headbutt.
  'ecard1-106': { 'Fury Headbutt': perHeads(3, 10) },
  // Dratini – Dragon Smash.
  'ecard1-107': { 'Dragon Smash': flipOrNothing(40) },
  // Ekans – Poison Sting.
  'ecard1-108': { 'Poison Sting': flipToInflict(10, 'poisoned') },
  // Gastly – Bad Dream.
  'ecard1-109': { 'Bad Dream': eitherCondition(0, 'asleep', 'confused') },
  // Geodude – Rock Hurl: no Resistance.
  'ecard1-110': { 'Rock Hurl': { run: (ctx) => void ctx.hit(10, { resistance: false }) } },
  // Hoppip – Sleep Powder: [G] 10 and Asleep, as printed (TCGdex has it wrong until a re-seed).
  'ecard1-112': { 'Sleep Powder': { ...inflicts(10, 'asleep'), cost: ['grass'], damage: '10', text: 'The Defending Pokémon is now Asleep.' } },
  // Koffing – Confusion Gas.
  'ecard1-114': { 'Confusion Gas': flipToInflict(0, 'confused') },
  // Machop – Double Chop.
  'ecard1-117': { 'Double Chop': perHeads(2, 20) },
  // Magikarp – Flail: 10 for each damage counter on it.
  'ecard1-118': { Flail: { run: (ctx) => void ctx.hit(ctx.attacker.damage) } },
  // Mareep – Thundershock.
  'ecard1-119': { Thundershock: flipToInflict(10, 'paralyzed') },
  // Marill – Bubble.
  'ecard1-120': { Bubble: flipToInflict(10, 'paralyzed') },
  // Meowth – Double Scratch; Pay Day: heads draws a card.
  'ecard1-121': {
    'Double Scratch': perHeads(2, 10),
    'Pay Day': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip()) ctx.draw(1);
      },
    },
  },
  // Oddish – Sleep Seed.
  'ecard1-122': { 'Sleep Seed': inflicts(10, 'asleep') },
  // Pidgey – Fury Strikes.
  'ecard1-123': { 'Fury Strikes': perHeads(3, 10) },
  // Pikachu – Lightning Tail.
  'ecard1-124': { 'Lightning Tail': flipToInflict(0, 'paralyzed') },
  // Ponyta – Singe.
  'ecard1-126': { Singe: flipToInflict(0, 'burned') },
  // Qwilfish – Stun Needle.
  'ecard1-127': { 'Stun Needle': flipToInflict(20, 'paralyzed') },
  // Rattata – Quick Attack.
  'ecard1-128': { 'Quick Attack': flipForMore(10, 20) },
  // Shellder – Lick.
  'ecard1-129': { Lick: flipToInflict(10, 'paralyzed') },
  // Spearow – Razor Wind.
  'ecard1-130': { 'Razor Wind': flipOrNothing(20) },
  // Squirtle – Doubleslap.
  'ecard1-131': { Doubleslap: perHeads(2, 20) },
  // Squirtle – Bubblebeam.
  'ecard1-132': { Bubblebeam: flipToInflict(20, 'paralyzed') },
  // Tauros – Horn Hazard; Take Down.
  'ecard1-133': { 'Horn Hazard': flipOrNothing(30), 'Take Down': recoil(30, 20) },
  // Totodile – Double Scratch.
  'ecard1-134': { 'Double Scratch': perHeads(2, 20) },
  // Totodile – Paralyzing Gaze.
  'ecard1-135': { 'Paralyzing Gaze': flipToInflict(0, 'paralyzed') },
  // Vulpix – Tail Shake.
  'ecard1-136': { 'Tail Shake': inflicts(0, 'asleep') },
  // Multi Technical Machine 01 – Paralyzing Gaze (its attack, used by the Pokémon it's attached to).
  'ecard1-144': { 'Paralyzing Gaze': inflicts(0, 'paralyzed') },
};
