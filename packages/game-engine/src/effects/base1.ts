// Base Set (base1) attack effects, by card id and attack name. Rulings follow the 1999 rulebook;
// where TCGdex's text differs from the printed card, `text` has the printed wording.
// Attacks that only deal damage need no entry. Pokémon Powers aren't implemented yet.
import { typeName, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import type { EnergyType } from '../cards.js';
import { effectId, inPlayDef } from '../status.js';
import {
  discardDefenderEnergy,
  discardToUse,
  extraEnergy,
  flipToInflict,
  flipToProtect,
  inflicts,
  leechSeed,
  lure,
  mirrorMove,
  perHeads,
  recoil,
  recover,
  selfdestruct,
  tailsSelfDamage,
  thrash,
  whirlwind,
} from './common.js';
import { attackEffect } from './index.js';

const defenderDef = (s: AttackSituation) => inPlayDef(s.cards, s.defender);

/** Types Conversion 1 and 2 can choose ("other than Colorless"). */
const CONVERSION_TYPES: EnergyType[] = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal'];

const flamethrower = (name: string) =>
  discardToUse(50, 1, 'fire', `Discard 1 Fire Energy card attached to ${name} in order to use this attack.`);

const withdraw: AttackEffect = flipToProtect(0, 'preventDamage');

export const metronome: AttackEffect = {
  choices(s, c) {
    const attacks = defenderDef(s).attacks;
    const options = attacks.flatMap((a, i) => (a.name === 'Metronome' ? [] : [i]));
    if (!options.length) return [];
    const specs: ChoiceSpec[] = [{ kind: 'copyAttack', options, prompt: "Choose one of the Defending Pokémon's attacks to copy" }];
    const copied = c.copyIndex !== undefined ? attacks[c.copyIndex] : undefined;
    // The copied attack's own questions, except its discard: Metronome skips what's required to use it.
    const effect = copied && attackEffect(effectId(s.defender), copied.name);
    if (effect?.choices) specs.push(...effect.choices(s, c));
    return specs;
  },
  run(ctx) {
    const sourceDefId = effectId(ctx.defender);
    const copied = ctx.choices.copyIndex !== undefined ? ctx.defenderDef.attacks[ctx.choices.copyIndex] : undefined;
    if (!copied) return ctx.log('Metronome had nothing to copy.');
    ctx.log(`Metronome copies ${copied.name}.`);
    ctx.useAttack(copied, sourceDefId);
  },
};

const conversionTypeChoice = (prompt: string): ChoiceSpec[] => [{ kind: 'type', options: CONVERSION_TYPES, prompt }];

export const BASE1: Record<string, Record<string, AttackEffect>> = {
  // Alakazam
  'base1-1': { 'Confuse Ray': flipToInflict(30, 'confused') },
  // Blastoise
  'base1-2': {
    'Hydro Pump': { run: (ctx) => void ctx.hit(40 + 10 * extraEnergy(ctx, ['water', 'water', 'water'], 'water', 2)) },
  },
  // Chansey
  'base1-3': { Scrunch: withdraw, 'Double-edge': recoil(80, 80) },
  // Charizard
  'base1-4': { 'Fire Spin': discardToUse(100, 2, undefined) },
  // Clefairy
  'base1-5': { Sing: flipToInflict(0, 'asleep'), Metronome: metronome },
  // Gyarados
  'base1-6': { Bubblebeam: flipToInflict(40, 'paralyzed') },
  // Magneton
  'base1-9': { 'Thunder Wave': flipToInflict(30, 'paralyzed'), Selfdestruct: selfdestruct(80, 20) },
  // Mewtwo
  'base1-10': {
    Psychic: { run: (ctx) => void ctx.hit(10 + 10 * ctx.defender.energy.length) },
    Barrier: {
      text: 'Discard 1 Psychic Energy card attached to Mewtwo in order to use this attack. During your opponent\'s next turn, prevent all effects of attacks, including damage, done to Mewtwo.',
      discard: { count: 1, type: 'psychic' },
      run: (ctx) => ctx.protect('preventAll'),
    },
  },
  // Nidoking
  'base1-11': { Thrash: thrash(30), Toxic: inflicts(20, 'toxic') },
  // Ninetales
  'base1-12': {
    Lure: lure,
    'Fire Blast': discardToUse(80, 1, 'fire', 'Discard 1 Fire Energy card attached to Ninetales in order to use this attack.'),
  },
  // Poliwrath
  'base1-13': {
    'Water Gun': { run: (ctx) => void ctx.hit(30 + 10 * extraEnergy(ctx, ['water', 'water', 'colorless'], 'water', 2)) },
    Whirlpool: discardDefenderEnergy(40),
  },
  // Raichu
  'base1-14': { Agility: flipToProtect(20, 'preventAll'), Thunder: tailsSelfDamage(60, 30) },
  // Zapdos
  'base1-16': { Thunder: tailsSelfDamage(60, 30), Thunderbolt: discardToUse(100, 'all', undefined) },
  // Beedrill
  'base1-17': { Twineedle: perHeads(2, 30), 'Poison Sting': flipToInflict(40, 'poisoned') },
  // Dragonair
  'base1-18': { Slam: perHeads(2, 30), 'Hyper Beam': discardDefenderEnergy(20) },
  // Dugtrio
  'base1-19': {
    Earthquake: {
      run(ctx) {
        ctx.hit(70);
        ctx.benchDamage(ctx.me, 10);
      },
    },
  },
  // Electabuzz
  'base1-20': { Thundershock: flipToInflict(10, 'paralyzed'), Thunderpunch: thrash(30) },
  // Electrode
  'base1-21': { 'Electric Shock': tailsSelfDamage(50, 10) },
  // Pidgeotto
  'base1-22': {
    Whirlwind: whirlwind(20),
    'Mirror Move': mirrorMove,
  },
  // Arcanine
  'base1-23': { Flamethrower: flamethrower('Arcanine'), 'Take Down': recoil(80, 30) },
  // Charmeleon
  'base1-24': { Flamethrower: flamethrower('Charmeleon') },
  // Dewgong
  'base1-25': { 'Ice Beam': flipToInflict(30, 'paralyzed') },
  // Farfetch'd
  'base1-27': {
    'Leek Slap': {
      blocked: (s) => (s.attacker.effects?.leekSlapUsed ? "Farfetch'd has already used Leek Slap" : null),
      run(ctx) {
        (ctx.attacker.effects ??= {}).leekSlapUsed = true;
        if (ctx.flip()) ctx.hit(30);
        else ctx.log('Leek Slap did nothing.');
      },
    },
  },
  // Haunter
  'base1-29': {
    Hypnosis: inflicts(0, 'asleep'),
    'Dream Eater': {
      text: "You can't use this attack unless the Defending Pokémon is Asleep.",
      blocked: (s) => (s.defender.condition === 'asleep' ? null : 'The Defending Pokémon must be Asleep'),
      run: (ctx) => void ctx.hit(50),
    },
  },
  // Ivysaur
  'base1-30': { Poisonpowder: inflicts(20, 'poisoned') },
  // Jynx
  'base1-31': {
    Doubleslap: perHeads(2, 10),
    Meditate: { run: (ctx) => void ctx.hit(20 + ctx.defender.damage) },
  },
  // Kadabra
  'base1-32': {
    Recover: recover('psychic', 'Discard 1 Psychic Energy card attached to Kadabra in order to use this attack. Remove all damage counters from Kadabra.'),
  },
  // Kakuna
  'base1-33': { Stiffen: withdraw, Poisonpowder: flipToInflict(20, 'poisoned') },
  // Machoke
  'base1-34': {
    // Printed "50-": TCGdex leaves it out of the Base Set 2 reprint (which shares this).
    'Karate Chop': { run: (ctx) => void ctx.hit(Math.max(0, 50 - ctx.attacker.damage)), damage: '50-' },
    Submission: recoil(60, 20),
  },
  // Magikarp
  'base1-35': { Flail: { run: (ctx) => void ctx.hit(ctx.attacker.damage) } },
  // Magmar
  'base1-36': { Flamethrower: flamethrower('Magmar') },
  // Nidorino
  'base1-37': { 'Double Kick': perHeads(2, 30) },
  // Poliwhirl
  'base1-38': {
    Amnesia: {
      text: "Choose 1 of the Defending Pokémon's attacks. That Pokémon can't use that attack during your opponent's next turn.",
      choices: (s) => {
        const options = defenderDef(s).attacks.map((_, i) => i);
        return options.length ? [{ kind: 'defenderAttack', options, prompt: "Choose one of the Defending Pokémon's attacks to block" }] : [];
      },
      run(ctx) {
        const attack = ctx.choices.attackIndex !== undefined ? ctx.defenderDef.attacks[ctx.choices.attackIndex] : undefined;
        if (!attack) return;
        ctx.affectDefender((e) => {
          e.amnesia = { attack: attack.name, until: ctx.turn + 1 };
          ctx.log(`${ctx.defenderDef.name} can't use ${attack.name} next turn.`);
        });
      },
    },
    Doubleslap: perHeads(2, 30),
  },
  // Porygon
  'base1-39': {
    'Conversion 1': {
      choices: (s) => (defenderDef(s).weakness ? conversionTypeChoice("Choose the Defending Pokémon's new Weakness") : []),
      run(ctx) {
        const type = ctx.choices.type;
        if (!type || !ctx.defenderDef.weakness) return ctx.log('Conversion 1 had no effect.');
        ctx.affectDefender((e) => {
          e.weakness = type;
          ctx.log(`${ctx.defenderDef.name}'s Weakness is now ${typeName(type)}.`);
        });
      },
    },
    'Conversion 2': {
      choices: () => conversionTypeChoice("Choose Porygon's new Resistance"),
      run(ctx) {
        const type = ctx.choices.type;
        if (!type) return;
        (ctx.attacker.effects ??= {}).resistance = type;
        ctx.log(`${ctx.attackerDef.name}'s Resistance is now ${typeName(type)}.`);
      },
    },
  },
  // Raticate
  'base1-40': {
    'Super Fang': {
      run(ctx) {
        const remaining = Math.max(0, ctx.defenderDef.hp - ctx.defender.damage);
        // Half the remaining HP, rounded up to the nearest 10; not affected by weakness or resistance.
        ctx.hit(Math.ceil(remaining / 20) * 10, { weakness: false });
      },
    },
  },
  // Wartortle
  'base1-42': { Withdraw: withdraw },
  // Abra
  'base1-43': { Psyshock: flipToInflict(10, 'paralyzed') },
  // Bulbasaur
  'base1-44': {
    'Leech Seed': leechSeed(20),
  },
  // Caterpie
  'base1-45': { 'String Shot': flipToInflict(10, 'paralyzed') },
  // Charmander
  'base1-46': { Ember: discardToUse(30, 1, 'fire', 'Discard 1 Fire Energy card attached to Charmander in order to use this attack.') },
  // Doduo
  'base1-48': { 'Fury Attack': perHeads(2, 10) },
  // Drowzee
  'base1-49': { 'Confuse Ray': flipToInflict(10, 'confused') },
  // Gastly
  'base1-50': {
    'Sleeping Gas': flipToInflict(0, 'asleep'),
    'Destiny Bond': {
      text: 'Discard 1 Psychic Energy card attached to Gastly in order to use this attack. If a Pokémon Knocks Out Gastly during your opponent\'s next turn, Knock Out that Pokémon.',
      discard: { count: 1, type: 'psychic' },
      run: (ctx) => ctx.protect('destinyBond'),
    },
  },
  // Koffing
  'base1-51': {
    'Foul Gas': {
      run(ctx) {
        ctx.hit(10);
        ctx.inflict(ctx.flip() ? 'poisoned' : 'confused');
      },
    },
  },
  // Magnemite
  'base1-53': { 'Thunder Wave': flipToInflict(10, 'paralyzed'), Selfdestruct: selfdestruct(40, 10) },
  // Metapod
  'base1-54': { Stiffen: withdraw, 'Stun Spore': flipToInflict(20, 'paralyzed') },
  // Nidoran♂
  'base1-55': {
    'Horn Hazard': {
      run(ctx) {
        if (ctx.flip()) ctx.hit(30);
        else ctx.log('Horn Hazard did nothing.');
      },
    },
  },
  // Onix
  'base1-56': { Harden: { run: (ctx) => ctx.protect('harden') } },
  // Pidgey
  'base1-57': { Whirlwind: whirlwind(10) },
  // Pikachu
  'base1-58': { 'Thunder Jolt': tailsSelfDamage(30, 10) },
  // Poliwag
  'base1-59': {
    'Water Gun': {
      text: "Does 10 damage plus 10 more damage for each Water Energy attached to Poliwag but not used to pay for this attack's Energy cost. Extra Water Energy after the 2nd doesn't count.",
      run: (ctx) => void ctx.hit(10 + 10 * extraEnergy(ctx, ['water'], 'water', 2)),
    },
  },
  // Sandshrew
  'base1-62': {
    'Sand-attack': {
      run(ctx) {
        ctx.hit(10);
        ctx.affectDefender((e) => {
          e.sandAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} needs heads to attack next turn.`);
        });
      },
    },
  },
  // Squirtle
  'base1-63': { Bubble: flipToInflict(10, 'paralyzed'), Withdraw: withdraw },
  // Starmie
  'base1-64': {
    Recover: recover('water', 'Discard 1 Water Energy card attached to Starmie in order to use this attack. Remove all damage counters from Starmie.'),
    'Star Freeze': flipToInflict(20, 'paralyzed'),
  },
  // Tangela
  'base1-66': { Bind: flipToInflict(20, 'paralyzed'), Poisonpowder: inflicts(20, 'poisoned') },
  // Vulpix
  'base1-68': { 'Confuse Ray': flipToInflict(10, 'confused') },
  // Weedle
  'base1-69': { 'Poison Sting': flipToInflict(10, 'poisoned') },
};
