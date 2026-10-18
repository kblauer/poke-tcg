// Gym Heroes (gym1) attack effects, by card id and attack name. Rulings follow the 1999 rulebook; where TCGdex's text
// differs from the printed card, `text` has the printed wording, and `damage` the printed number (TCGdex leaves out
// the damage of Lariat, Horn Hazard, Child's Punch, Egg Bomb, Drill Tackle, Razor Wind and Clamp). Attacks that only
// deal damage need no entry. An owner's Pokémon (Brock's Rhyhorn…) evolves only into one with the same owner, which
// the names already do (apps/api/src/cards.ts gives TCGdex's evolutions their owner).
// Rulings: Pain Amplifier puts damage counters, which aren't damage (no Weakness, Resistance or Defender; only
// effects that prevent all effects of attacks stop it). Eggsplosion counts Energy provided (Double Colorless = 2
// coins), as Big Eggsplosion does. Stretch Vine does its 20 to the Defending Pokémon too, as Rock Slide does.
// Discharge, Electric Current and Energy Charge count Rainbow Energy as a Lightning Energy card while it's attached;
// Lava Burst and the Charge attacks only take basic Lightning or Fire Energy cards from the deck or discard pile.
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { counts, energyPool, isEnergyCardOf, type CardInstance, type InPlayPokemon, type PlayerState } from '../engine.js';
import { shuffle } from '../rng.js';
import { inPlayDef, pokemonName } from '../status.js';
import { BASE1 } from './base1.js';
import {
  benchedSlots,
  benchSearch,
  benchTarget,
  discardDefenderEnergy,
  discardToUse,
  extraEnergy,
  flipToInflict,
  flipToProtect,
  inflicts,
  lure,
  opponentBenchChoice,
  opponentSwitches,
  perHeads,
  recoil,
  tailsSelfDamage,
  whirlwind,
} from './common.js';
import { smokescreen } from './fossil.js';
import { flipForMore } from './jungle.js';
import { flipOrNothing, shuffleIntoDeck } from './rocket.js';

/** Basic Energy cards of `type` in the attacking player's discard pile (Charge). */
export const discardEnergyOf = (s: AttackSituation, type: EnergyType) =>
  s.ownDiscard.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return isBasicEnergy(d) && d.kind === 'energy' && d.energyType === type;
  });

/** Take up to `max` Lightning Energy cards from the discard pile and attach them to the attacker (Charge). */
const charge = (max: number, upTo: boolean): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const options = discardEnergyOf(s, 'lightning');
    if (!options.length) return [];
    const what = max === 1 ? 'a Lightning Energy card' : `up to ${max} Lightning Energy cards`;
    return [{ kind: 'ownDiscard', min: upTo ? 0 : 1, max, options, prompt: `Choose ${what} from your discard pile to attach` }];
  },
  run(ctx) {
    const uids = ctx.choices.discardUids ?? [];
    const taken = ctx.me.discard.filter((c) => uids.includes(c.uid));
    if (!taken.length) return ctx.log('Charge attached nothing.');
    ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
    ctx.attacker.energy.push(...taken);
    ctx.log(`Attached ${taken.length} Lightning Energy card${taken.length === 1 ? '' : 's'} from the discard pile to ${ctx.attackerDef.name}.`);
  },
});

/** Discards Energy cards from the attacker, logging it. */
export function discardFromAttacker(ctx: AttackContext, gone: CardInstance[]) {
  if (!gone.length) return;
  ctx.attacker.energy = ctx.attacker.energy.filter((e) => !gone.includes(e));
  ctx.me.discard.push(...gone);
  ctx.log(`${ctx.attackerDef.name} discarded ${gone.length} Energy.`);
}

/** The Defending Pokémon can't retreat during the opponent's next turn (Clutch, Sand Pit, Spook). */
export const noRetreat = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.noRetreat = ctx.turn + 1;
      ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`);
    });
  },
});

/** Base damage; then, if the Defending Pokémon has Energy, heads discards 1 of its Energy cards (Removal Pulse, Rapids, Removal Beam). */
export const removalFlip = (damage: number): AttackEffect => ({
  choices: (s) => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon (on heads)' }] : []),
  run(ctx) {
    ctx.hit(damage);
    const uid = ctx.choices.defenderEnergyUid;
    if (!uid || !ctx.defender.energy.some((e) => e.uid === uid)) return;
    if (ctx.flip()) ctx.discardDefenderEnergy(uid);
  },
});

/** Base damage, then the opponent switches the Defending Pokémon with a benched one of their choice (Horn Toss, Shake). */
const opponentSwitch = (damage: number, source: string): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    opponentSwitches(ctx, source);
  },
});

/** Flip a coin; heads: search the deck for a Basic Pokémon with `owner` in its name and put it onto the Bench (Call for Friend). */
const callForFriend = (owner: string): AttackEffect => ({
  blocked: benchSearch('Call for Friend', { filter: 'ownerBasic', name: owner }).blocked,
  run(ctx) {
    if (!ctx.flip()) return ctx.log('Call for Friend found nothing.');
    ctx.pend({ kind: 'pickFromDeck', source: 'Call for Friend', filter: 'ownerBasic', name: owner, toBench: true, optional: true });
  },
});

/** Removes up to `amount` damage from each of the player's Pokémon (Healing Pollen). */
export function healEach(ctx: AttackContext, amount: number) {
  for (const p of [ctx.me.active, ...ctx.me.bench]) {
    if (!p || !p.damage) continue;
    const healed = Math.min(amount, p.damage);
    p.damage -= healed;
    ctx.log(`${pokemonName(ctx.state, p)} healed ${healed} damage.`);
  }
}

/** "This attack can't be used if your opponent has no Benched Pokémon" (Lucky Shot, Flytrap). */
const needsOpponentBench = (s: AttackSituation) => (benchedSlots(s.opponentBench).length ? null : 'Your opponent has no benched Pokémon');

/** Choose up to `count` of the opponent's benched Pokémon: base damage, and `bench` damage to each (Rock Slide, Tunneling). */
export const benchMany = (count: number, damage: number, bench: number): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const options = benchedSlots(s.opponentBench);
    return options.length ? [{ kind: 'opponentBenchMany', count, options, prompt: `Choose up to ${count} of your opponent's benched Pokémon to do ${bench} damage to` }] : [];
  },
  run(ctx) {
    ctx.hit(damage);
    for (const slot of ctx.choices.benchSlots ?? []) ctx.damageBenched(ctx.opp, slot, bench);
  },
});

/** Damage to every benched Pokémon of `player` that matches (Water Ring, Blaze), without Weakness and Resistance. */
export function benchWhere(ctx: AttackContext, player: PlayerState, amount: number, matches: (p: InPlayPokemon) => boolean) {
  for (const slot of benchedSlots(player.bench)) if (matches(player.bench[slot]!)) ctx.damageBenched(player, slot, amount);
}

const typeOf = (ctx: AttackContext, p: InPlayPokemon) => inPlayDef(ctx.state.cards, p).type;

/** Base damage, then the attacker is now Asleep (Collapse, Lazy Attack). */
export const fallsAsleep = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.sleepSelf();
  },
});

/** Pokémon Jellyfish Pod finds. */
const JELLYFISH = ['Tentacool', 'Tentacruel', "Misty's Tentacool", "Misty's Tentacruel"];

/** Pokémon Night Spirits counts. */
const NIGHT_SPIRITS = ["Sabrina's Gastly", "Sabrina's Haunter", "Sabrina's Gengar"];

const charge2 = charge(2, true);

export const GYM1: Record<string, Record<string, AttackEffect>> = {
  // Blaine's Moltres
  'gym1-1': {
    'Phoenix Flame': {
      run(ctx) {
        const heads = ctx.flip();
        ctx.hit(90);
        if (!heads && ctx.me.active === ctx.attacker) shuffleIntoDeck(ctx, ctx.me, 'active', false);
      },
    },
  },
  // Brock's Rhydon
  'gym1-2': { Lariat: { ...flipOrNothing(70), damage: '70' } },
  // Erika's Clefable
  'gym1-3': {
    'Fairy Power': {
      run(ctx) {
        if (ctx.flip()) ctx.pend({ kind: 'returnOwn', source: 'Fairy Power' });
        else ctx.log('Fairy Power did nothing.');
      },
    },
  },
  // Erika's Dragonair
  'gym1-4': {
    Blizzard: {
      run(ctx) {
        ctx.hit(30);
        ctx.benchDamage(ctx.flip() ? ctx.opp : ctx.me, 10);
      },
    },
    'Take Away': {
      run(ctx) {
        shuffleIntoDeck(ctx, ctx.me, 'active', false);
        if (ctx.opp.active && ctx.canAffect(ctx.opp, ctx.opp.active)) shuffleIntoDeck(ctx, ctx.opp, 'active', false);
      },
    },
  },
  // Erika's Vileplume
  'gym1-5': {
    // Half the damage done, rounded up to the nearest 10.
    'Mega Drain': { run: (ctx) => ctx.heal(Math.ceil(ctx.hit(30) / 20) * 10) },
  },
  // Lt. Surge's Electabuzz
  'gym1-6': {
    Charge: charge2,
    Discharge: {
      run(ctx) {
        const lightning = ctx.attacker.energy.filter((e) => isEnergyCardOf(e, ctx.state.cards, 'lightning'));
        discardFromAttacker(ctx, lightning);
        ctx.hit(30 * ctx.flips(lightning.length));
      },
    },
  },
  // Lt. Surge's Fearow
  'gym1-7': { 'Repeating Drill': perHeads(5, 10), Clutch: noRetreat(30) },
  // Lt. Surge's Magneton
  'gym1-8': { 'Mega Shock': tailsSelfDamage(50, 20) },
  // Misty's Seadra
  'gym1-9': { 'Knockout Needle': { run: (ctx) => void ctx.hit(ctx.flips(2) === 2 ? 90 : 30) } },
  // Misty's Tentacruel
  'gym1-10': {
    'Jellyfish Poison': { run: (ctx) => ctx.inflict(ctx.flip() ? 'poisoned' : 'confused') },
  },
  // Rocket's Hitmonchan
  'gym1-11': {
    // Its attack back does double the damage taken, with Weakness and Resistance (agreed: it's an attack by Hitmonchan).
    Crosscounter: {
      run(ctx) {
        ctx.protect('crosscounter');
        ctx.log(`If an attack damages ${ctx.attackerDef.name} next turn, it may hit back for double.`);
      },
    },
  },
  // Rocket's Moltres
  'gym1-12': {
    'Fire Wall': {
      run(ctx) {
        ctx.hit(40);
        ctx.protect('fireWall');
        ctx.log(`Attacks that damage ${ctx.attackerDef.name} next turn take 10 damage back.`);
      },
    },
  },
  // Rocket's Scyther
  'gym1-13': {
    'Shadow Images': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).shadowImages = true;
        ctx.log(`Attacks on ${ctx.attackerDef.name} need heads to damage it, until it takes damage.`);
      },
    },
  },
  // Sabrina's Gengar
  'gym1-14': {
    'Pain Amplifier': {
      run(ctx) {
        for (const p of [ctx.opp.active, ...ctx.opp.bench]) {
          if (!p || !p.damage || !ctx.canAffect(ctx.opp, p)) continue;
          p.damage += 10;
          ctx.log(`Put a damage counter on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
        }
      },
    },
    'Call of the Night': {
      run(ctx) {
        ctx.hit(40);
        const defender = ctx.opp.active;
        if (!defender || defender.damage >= inPlayDef(ctx.state.cards, defender).hp) return;
        if (ctx.flips(2) === 2 && ctx.canAffect(ctx.opp, defender)) shuffleIntoDeck(ctx, ctx.opp, 'active', false);
      },
    },
  },
  // Brock's Golem
  'gym1-20': { 'Rock Slide': benchMany(3, 20, 10) },
  // Brock's Onix
  'gym1-21': {
    Bind: flipToInflict(20, 'paralyzed'),
    Tunneling: {
      ...benchMany(2, 20, 20),
      run(ctx) {
        benchMany(2, 20, 20).run(ctx);
        // Through the attacker's next turn (benching it ends that).
        (ctx.attacker.effects ??= {}).noAttack = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name} can't attack next turn.`);
      },
    },
  },
  // Brock's Rhyhorn
  'gym1-22': { 'Horn Toss': opponentSwitch(20, 'Horn Toss'), 'Take Down': recoil(40, 10) },
  // Brock's Sandslash
  'gym1-23': {
    Needles: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Needles did nothing.');
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
    Sandstorm: smokescreen(20),
  },
  // Brock's Zubat
  'gym1-24': {
    Alert: {
      blocked: (s) => (benchedSlots(s.ownBench).length ? null : 'Your Bench is empty'),
      choices: (s): ChoiceSpec[] => [{ kind: 'ownBench', options: benchedSlots(s.ownBench), prompt: "Choose one of your benched Pokémon to switch with Brock's Zubat" }],
      run(ctx) {
        ctx.draw(1);
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
  },
  // Erika's Clefairy
  'gym1-25': {
    Moonwatching: { run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Moonwatching', filter: 'basicEnergy', reveal: true }) },
    'Comet Slap': perHeads(3, 10),
  },
  // Lt. Surge's Electabuzz
  'gym1-27': {
    Charge: charge2,
    'Electric Current': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your benched Pokémon to move a Lightning Energy card to' }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        // A basic Lightning Energy card before Rainbow Energy.
        const lightning = ctx.attacker.energy.filter((e) => isEnergyCardOf(e, ctx.state.cards, 'lightning'));
        const energy = lightning.find((e) => isBasicEnergy(lookupCard(ctx.state.cards, e.defId))) ?? lightning[0];
        if (!energy) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== energy);
        const to = ctx.choices.ownBenchSlot === undefined ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        if (!to) {
          ctx.me.discard.push(energy);
          return ctx.log(`${ctx.attackerDef.name} discarded a Lightning Energy card (no benched Pokémon).`);
        }
        to.energy.push(energy);
        ctx.log(`Moved a Lightning Energy card to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Lt. Surge's Raichu
  'gym1-28': { Thunderbolt: discardToUse(100, 'all', undefined) },
  // Misty's Cloyster
  'gym1-29': { 'Triple Cannon': perHeads(3, 20) },
  // Misty's Goldeen
  'gym1-30': { 'Horn Hazard': { ...flipOrNothing(30), damage: '30' } },
  // Misty's Poliwrath
  'gym1-31': {
    'Water Ring': {
      run(ctx) {
        ctx.hit(30);
        for (const side of [ctx.opp, ctx.me]) benchWhere(ctx, side, 10, (p) => typeOf(ctx, p) !== 'water');
      },
    },
  },
  // Misty's Tentacool
  'gym1-32': {
    'Mysterious Light': flipToInflict(0, 'asleep'),
    'Jellyfish Pod': {
      run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Jellyfish Pod', filter: 'named', name: JELLYFISH, reveal: true, optional: true, count: 60 }),
    },
  },
  // Rocket's Snorlax
  'gym1-33': { Collapse: fallsAsleep(20) },
  // Sabrina's Venomoth
  'gym1-34': {
    'Healing Pollen': {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads) healEach(ctx, 10 * heads);
      },
    },
    'Sonic Distortion': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flips(2) >= 1) ctx.inflict('confused');
      },
    },
  },
  // Blaine's Growlithe
  'gym1-35': { Shake: opponentSwitch(10, 'Shake'), 'Fire Tackle': recoil(30, 10) },
  // Blaine's Kangaskhan
  'gym1-36': { "Child's Punch": { ...flipOrNothing(10), damage: '10' }, 'One-Two Punch': flipForMore(30, 10) },
  // Blaine's Magmar
  'gym1-37': {
    Firebreathing: flipForMore(10, 10),
    'Lava Burst': {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 5);
        ctx.me.discard.push(...top);
        const fire = top.filter((c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return isBasicEnergy(d) && d.kind === 'energy' && d.energyType === 'fire';
        }).length;
        ctx.log(`Discarded the top ${top.length} cards of the deck: ${fire} Fire Energy card${fire === 1 ? '' : 's'}.`);
        ctx.hit(20 * fire);
      },
    },
  },
  // Brock's Geodude
  'gym1-38': {
    'Lucky Shot': {
      blocked: needsOpponentBench,
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon (heads: 30 damage to it)"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined && ctx.flip()) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 30);
        else ctx.log('Lucky Shot did nothing.');
      },
    },
  },
  // Brock's Golbat
  'gym1-39': {
    'Spiral Dive': {
      run(ctx) {
        ctx.hit(10, { weakness: false });
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Brock's Graveler
  'gym1-40': { 'Rock Toss': perHeads(3, 20) },
  // Brock's Lickitung
  'gym1-41': { Slam: perHeads(2, 30) },
  // Erika's Dratini
  'gym1-42': { 'Tail Strike': flipForMore(10, 20) },
  // Erika's Exeggcute
  'gym1-43': {
    Deflector: {
      run(ctx) {
        ctx.protect('lightScreen');
        ctx.log(`Damage done to ${ctx.attackerDef.name} next turn is halved.`);
      },
    },
    'Egg Bomb': {
      damage: '40',
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(40);
        ctx.log('Egg Bomb did nothing to the Defending Pokémon.');
        ctx.selfDamage(20);
      },
    },
  },
  // Erika's Exeggutor
  'gym1-44': {
    'Psychic Exchange': {
      run(ctx) {
        const hand = ctx.me.hand.splice(0);
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...hand], ctx.state.rngState);
        ctx.log(`Shuffled ${hand.length} card${hand.length === 1 ? '' : 's'} into the deck.`);
        ctx.draw(5);
      },
    },
    Stomp: flipForMore(30, 10),
  },
  // Erika's Gloom
  'gym1-45': {
    'Healing Pollen': {
      run(ctx) {
        if (ctx.flip()) ctx.heal(40);
        else ctx.log('Healing Pollen did nothing.');
      },
    },
    'Magic Pollen': {
      choices: (): ChoiceSpec[] => [{ kind: 'condition', options: ['paralyzed', 'asleep', 'confused', 'poisoned'], prompt: 'Choose what the Defending Pokémon becomes (on heads)' }],
      run(ctx) {
        if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
        else ctx.log('Magic Pollen did nothing.');
      },
    },
  },
  // Erika's Gloom
  'gym1-46': {
    'Dream Dance': {
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('asleep');
        ctx.sleepSelf();
      },
    },
    'Vile Smell': {
      run(ctx) {
        ctx.hit(30);
        ctx.inflict('confused');
        ctx.confuseSelf();
      },
    },
  },
  // Erika's Oddish
  'gym1-47': { Poisonpowder: flipToInflict(0, 'poisoned') },
  // Erika's Weepinbell
  'gym1-48': {
    Flytrap: {
      blocked: needsOpponentBench,
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to switch in (it takes the damage)"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
        ctx.hit(20);
      },
    },
  },
  // Erika's Weepinbell
  'gym1-49': {
    'Sleep Poison': {
      run(ctx) {
        ctx.hit(10);
        ctx.inflict('asleep');
        ctx.inflict('poisoned');
      },
    },
  },
  // Lt. Surge's Magnemite
  'gym1-50': { 'Removal Pulse': removalFlip(10), 'Confusion Pulse': flipToInflict(20, 'confused') },
  // Lt. Surge's Raticate
  'gym1-51': { 'Super Fang': BASE1['base1-40']!['Super Fang']! },
  // Misty's Poliwhirl
  'gym1-53': {
    Rapids: removalFlip(20),
    'Water Punch': {
      run(ctx) {
        const water = energyPool(ctx.attacker, ctx.state.cards).filter((t) => counts(t, 'water')).length;
        ctx.hit(30 + 10 * ctx.flips(water));
      },
    },
  },
  // Misty's Psyduck
  'gym1-54': { 'Call for Friend': callForFriend('Misty') },
  // Misty's Seaking
  'gym1-55': {
    'Mud Splash': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon (heads: 10 damage to it)"),
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.opp.bench[slot] && ctx.flip()) ctx.damageBenched(ctx.opp, slot, 10);
      },
    },
  },
  // Misty's Starmie
  'gym1-56': {
    'Water Gun': { run: (ctx) => void ctx.hit(10 + 10 * extraEnergy(ctx, ['water'], 'water', 2)) },
    Bubblebeam: flipToInflict(30, 'paralyzed'),
  },
  // Misty's Tentacool
  'gym1-57': {
    'Crystal Beam': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.noEnergy = ctx.turn + 1;
          ctx.log(`Energy cards can't be attached to ${ctx.defenderDef.name} next turn.`);
        });
      },
    },
  },
  // Sabrina's Haunter
  'gym1-58': {
    'Night Spirits': {
      run(ctx) {
        const ghosts = [ctx.me.active, ...ctx.me.bench].filter((p) => p && NIGHT_SPIRITS.includes(inPlayDef(ctx.state.cards, p).name)).length;
        ctx.hit(30 * ctx.flips(ghosts));
      },
    },
  },
  // Sabrina's Jynx
  'gym1-59': {
    'Good Night': inflicts(10, 'asleep'),
    'Good Morning': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.opp.active?.condition !== 'asleep') return;
        ctx.affectDefender(() => {
          ctx.opp.active!.condition = null;
          ctx.log(`${ctx.defenderDef.name} is no longer Asleep.`, ctx.opp.id);
        });
      },
    },
  },
  // Sabrina's Slowbro
  'gym1-60': {
    Naptime: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Naptime did nothing.');
        ctx.heal(30);
        ctx.sleepSelf();
      },
    },
    // It can't be used during Slowbro's next turn (benching it ends that).
    'Screaming Headbutt': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).amnesia = { attack: 'Screaming Headbutt', until: ctx.turn + 2 };
      },
    },
  },
  // Blaine's Charmander
  'gym1-61': { Kindle: { ...discardDefenderEnergy(10), discard: { count: 1 } } },
  // Blaine's Growlithe
  'gym1-62': {
    Blaze: {
      run(ctx) {
        ctx.hit(20);
        benchWhere(ctx, ctx.opp, 10, (p) => typeOf(ctx, p) === 'grass');
      },
    },
  },
  // Blaine's Ponyta
  'gym1-63': { Agility: flipToProtect(20, 'preventAll') },
  // Blaine's Tauros
  'gym1-64': {
    '3-Pronged Tail': perHeads(3, 10),
    'Full Speed Charge': {
      run(ctx) {
        const heads = ctx.flips(4);
        ctx.hit(20 * heads);
        if (heads < 4) ctx.selfDamage(20 * (4 - heads));
      },
    },
  },
  // Blaine's Vulpix
  'gym1-65': { 'Tail Fan': flipToInflict(20, 'confused') },
  // Brock's Geodude
  'gym1-66': { 'Call for Friend': callForFriend('Brock'), 'Hook Shot': { run: (ctx) => void ctx.hit(20, { resistance: false }) } },
  // Brock's Mankey
  'gym1-67': { Taunt: lure },
  // Brock's Mankey
  'gym1-68': {
    Fidget: {
      run(ctx) {
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Shuffled the deck.');
      },
    },
    'Karate Chop': { run: (ctx) => void ctx.hit(Math.max(0, 40 - ctx.attacker.damage)) },
  },
  // Brock's Onix
  'gym1-69': { Bellow: flipToInflict(0, 'paralyzed') },
  // Brock's Rhyhorn
  'gym1-70': {
    'Drill Tackle': {
      damage: '70',
      run(ctx) {
        if (ctx.flips(2) === 2) ctx.hit(70);
        else ctx.log('Drill Tackle did nothing.');
      },
    },
  },
  // Brock's Sandshrew
  'gym1-71': {
    'Defense Curl': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Defense Curl did nothing.');
        ctx.protect('preventDamage');
        ctx.log(`Damage done to ${ctx.attackerDef.name} next turn is prevented.`);
      },
    },
  },
  // Brock's Sandshrew
  'gym1-72': { 'Sand Pit': noRetreat(20) },
  // Brock's Vulpix
  'gym1-73': { 'Quick Attack': flipForMore(10, 20) },
  // Brock's Zubat
  'gym1-74': { 'Poison Fang': flipToInflict(0, 'poisoned') },
  // Erika's Bellsprout
  'gym1-75': { 'Poison Vine': flipToInflict(0, 'poisoned') },
  // Erika's Bellsprout
  'gym1-76': { 'Careless Tackle': recoil(20, 10) },
  // Erika's Exeggcute
  'gym1-77': {
    Eggsplosion: { run: (ctx) => void ctx.hit(10 * ctx.flips(energyPool(ctx.attacker, ctx.state.cards).length)) },
    Psychic: BASE1['base1-10']!.Psychic!,
  },
  // Erika's Oddish
  'gym1-78': {
    Blot: { run: (ctx) => ctx.heal(10) },
    'Sporadic Sponging': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.attacker.damage > 0 && ctx.flip()) ctx.heal(10);
      },
    },
  },
  // Erika's Tangela
  'gym1-79': { 'Stretch Vine': benchTarget(20, 20) },
  // Lt. Surge's Magnemite
  'gym1-80': { Thundershock: flipToInflict(10, 'paralyzed') },
  // Lt. Surge's Pikachu
  'gym1-81': { Charge: charge(1, false), 'Lightning Tail': flipToInflict(20, 'paralyzed') },
  // Lt. Surge's Rattata
  'gym1-82': {
    'Focus Energy': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).focusEnergy = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name}'s Gnaw does double base damage next turn.`);
      },
    },
    Gnaw: { run: (ctx) => void ctx.hit(ctx.attacker.effects?.focusEnergy === ctx.turn ? 40 : 20) },
  },
  // Lt. Surge's Spearow
  'gym1-83': { Whirlwind: whirlwind(10), 'Razor Wind': { ...flipOrNothing(40), damage: '40' } },
  // Lt. Surge's Voltorb
  'gym1-84': { 'Spin Ball': perHeads(1, 20), 'Double Spin': perHeads(2, 20) },
  // Misty's Goldeen
  'gym1-85': { 'Fury Attack': perHeads(2, 10), Supersonic: flipToInflict(0, 'confused') },
  // Misty's Horsea
  'gym1-86': { Smokescreen: smokescreen(20) },
  // Misty's Poliwag
  'gym1-87': {
    'Hypnotic Stare': { run: (ctx) => ctx.inflict(ctx.flip() ? 'paralyzed' : 'asleep') },
    'Tail Rap': perHeads(2, 20),
  },
  // Misty's Shellder
  'gym1-89': {
    Clamp: {
      damage: '20',
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Clamp did nothing.');
        ctx.hit(20);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Misty's Staryu
  'gym1-90': { Swift: { run: (ctx) => void ctx.hit(20, { swift: true }) } },
  // Sabrina's Abra
  'gym1-91': {
    'Energy Loop': {
      blocked: (s) => (s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'psychic')) ? null : 'There are no Psychic Energy cards attached'),
      choices: (s): ChoiceSpec[] => [
        { kind: 'ownEnergy', count: 1, options: s.attacker.energy.filter((e) => isEnergyCardOf(e, s.cards, 'psychic')), prompt: 'Choose a Psychic Energy card to return to your hand' },
      ],
      run(ctx) {
        const energy = ctx.attacker.energy.find((e) => e.uid === ctx.choices.energyUids?.[0]);
        if (!energy) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== energy);
        ctx.me.hand.push(energy);
        ctx.log(`Returned ${lookupCard(ctx.state.cards, energy.defId).name} to the hand.`);
        ctx.hit(20);
      },
    },
  },
  // Sabrina's Drowzee
  'gym1-92': {
    Suggestion: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Suggestion did nothing.');
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack next turn.`);
        });
      },
    },
  },
  // Sabrina's Gastly
  'gym1-93': { Spook: noRetreat(20) },
  // Sabrina's Mr. Mime
  'gym1-94': {
    'Sleight of Hand': {
      run(ctx) {
        if (!ctx.me.hand.length) return ctx.log('No cards in the hand to put back.');
        ctx.pend({ kind: 'sleightOfHand', source: 'Sleight of Hand', moved: 0 });
      },
    },
  },
  // Sabrina's Slowpoke
  'gym1-95': { 'Lazy Attack': fallsAsleep(30) },
  // Sabrina's Venonat
  'gym1-96': { 'Poison Antennae': inflicts(10, 'poisoned'), 'Removal Beam': removalFlip(20) },
};
