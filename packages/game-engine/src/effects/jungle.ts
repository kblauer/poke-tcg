// Jungle (base2) attack effects, by card id and attack name. Rulings follow the 1999 rulebook;
// where TCGdex's text differs from the printed card (it drops energy icons), `text` has the printed
// wording. Attacks that only deal damage need no entry. Cards 17–32 are the non-holo prints of 1–16.
// Rulings (agreed): Big Eggsplosion counts Energy provided (Double Colorless = 2 coins); Flareon's
// Flamethrower discards a Fire Energy card and Vaporeon's Water Gun counts Water Energy only.
import type { AttackEffect, ChoiceSpec } from '../attacks.js';
import { energyPool } from '../engine.js';
import { baseUid, inPlayDef } from '../status.js';
import { metronome } from './base1.js';
import {
  benchedSlots,
  benchSearch,
  benchTarget,
  discardToUse,
  extraEnergy,
  flipToInflict,
  flipToProtect,
  inflicts,
  leechLife,
  leechSeed,
  lure,
  mirrorMove,
  opponentSwitches,
  perHeads,
  whirlwind,
} from './common.js';

/** Flip: heads does `damage + bonus`, tails `damage` (Quick Attack, Stomp). */
export const flipForMore = (damage: number, bonus: number): AttackEffect => ({
  run: (ctx) => void ctx.hit(ctx.flip() ? damage + bonus : damage),
});

/** Base damage plus 10 for each damage counter on the attacker (Rage). */
export const rage = (damage: number): AttackEffect => ({
  run: (ctx) => void ctx.hit(damage + ctx.attacker.damage),
});

/** On heads, the Defending Pokémon can't attack this Pokémon next turn (Tail Wag, Leer). */
export const cantAttackMe: AttackEffect = {
  run(ctx) {
    if (!ctx.flip()) return ctx.log(`${ctx.defenderDef.name} can still attack.`);
    const target = baseUid(ctx.attacker);
    ctx.affectDefender((e) => {
      e.cantAttack = { target, until: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name} can't attack ${ctx.attackerDef.name} next turn.`);
    });
  },
};

/** Base damage; the Defending Pokémon's attacks on this Pokémon next turn do `amount` less (Pounce, Snivel). */
export const pounce = (damage: number, amount: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    const target = baseUid(ctx.attacker);
    ctx.affectDefender((e) => {
      e.pounce = { target, amount, until: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name}'s attacks on ${ctx.attackerDef.name} do ${amount} less damage next turn.`);
    });
  },
});

/** Base damage; on tails the attacker is now Confused (Tantrum). */
const tailsConfusesSelf = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.flip()) ctx.confuseSelf();
  },
});

const quickAttack = flipForMore(10, 20);
const stomp = flipForMore(20, 10);
const supersonic = flipToInflict(0, 'confused');
const spore = inflicts(0, 'asleep');
const stunSpore = flipToInflict(10, 'paralyzed');
const NIDORANS = ['Nidoran♂', 'Nidoran♀', 'Nidoran ♂', 'Nidoran ♀'];

const HOLO: Record<string, Record<string, AttackEffect>> = {
  // Clefable
  'base2-1': {
    Metronome: metronome,
    Minimize: {
      run(ctx) {
        ctx.protect('minimize');
        ctx.log(`Damage done to ${ctx.attackerDef.name} by attacks next turn is reduced by 20.`);
      },
    },
  },
  // Electrode
  'base2-2': {
    'Chain Lightning': {
      run(ctx) {
        const type = ctx.defenderDef.type;
        ctx.hit(20);
        if (type === 'colorless') return;
        // Every benched Pokémon of the Defending Pokémon's type, the attacker's own included.
        for (const player of [ctx.opp, ctx.me]) {
          for (const slot of benchedSlots(player.bench)) {
            if (inPlayDef(ctx.state.cards, player.bench[slot]!).type === type) ctx.damageBenched(player, slot, 10);
          }
        }
      },
    },
  },
  // Flareon
  'base2-3': {
    'Quick Attack': quickAttack,
    Flamethrower: discardToUse(60, 1, 'fire', 'Discard 1 Fire Energy card attached to Flareon in order to use this attack.'),
  },
  // Jolteon
  'base2-4': { 'Quick Attack': quickAttack, 'Pin Missile': perHeads(4, 20) },
  // Kangaskhan
  'base2-5': { Fetch: { run: (ctx) => ctx.draw(1) }, 'Comet Punch': perHeads(4, 20) },
  // Mr. Mime
  'base2-6': { Meditate: { run: (ctx) => void ctx.hit(10 + ctx.defender.damage) } },
  // Nidoqueen
  'base2-7': {
    Boyfriends: {
      run(ctx) {
        const nidokings = [ctx.me.active, ...ctx.me.bench].filter((p) => p && inPlayDef(ctx.state.cards, p).name === 'Nidoking').length;
        ctx.hit(20 + 20 * nidokings);
      },
    },
  },
  // Pidgeot
  'base2-8': {
    Hurricane: {
      run(ctx) {
        ctx.hit(30);
        if (ctx.opp.active && ctx.defender.damage < ctx.defenderDef.hp) ctx.returnDefender();
      },
    },
  },
  // Pinsir
  'base2-9': { Irongrip: flipToInflict(20, 'paralyzed') },
  // Scyther
  'base2-10': {
    'Swords Dance': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).swordsDance = ctx.turn + 2;
        ctx.log(`${ctx.attackerDef.name}'s Slash does 60 base damage next turn.`);
      },
    },
    Slash: { run: (ctx) => void ctx.hit(ctx.attacker.effects?.swordsDance === ctx.turn ? 60 : 30) },
  },
  // Snorlax
  'base2-11': { 'Body Slam': flipToInflict(30, 'paralyzed') },
  // Vaporeon
  'base2-12': {
    'Quick Attack': quickAttack,
    'Water Gun': {
      text: "Does 30 damage plus 10 more damage for each Water Energy attached to Vaporeon but not used to pay for this attack's Energy cost. Extra Water Energy after the 2nd doesn't count.",
      run: (ctx) => void ctx.hit(30 + 10 * extraEnergy(ctx, ['water', 'water', 'colorless'], 'water', 2)),
    },
  },
  // Venomoth
  'base2-13': {
    'Venom Powder': {
      run(ctx) {
        ctx.hit(10);
        if (!ctx.flip()) return;
        ctx.inflict('confused');
        ctx.inflict('poisoned');
      },
    },
  },
  // Victreebel
  'base2-14': {
    Lure: lure,
    Acid: {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`);
        });
      },
    },
  },
  // Vileplume
  'base2-15': {
    'Petal Dance': {
      run(ctx) {
        ctx.hit(40 * ctx.flips(3));
        ctx.confuseSelf();
      },
    },
  },
  // Wigglytuff
  'base2-16': {
    Lullaby: inflicts(0, 'asleep'),
    'Do the Wave': { run: (ctx) => void ctx.hit(10 + 10 * ctx.me.bench.filter(Boolean).length) },
  },
};

export const JUNGLE: Record<string, Record<string, AttackEffect>> = {
  ...HOLO,
  ...Object.fromEntries(Object.entries(HOLO).map(([id, effects]) => [`base2-${Number(id.slice(6)) + 16}`, effects])),
  // Butterfree
  'base2-33': {
    Whirlwind: whirlwind(20),
    // Half the damage done, rounded up to the nearest 10.
    'Mega Drain': { run: (ctx) => ctx.heal(Math.ceil(ctx.hit(40) / 20) * 10) },
  },
  // Dodrio
  'base2-34': { Rage: rage(10) },
  // Exeggutor
  'base2-35': {
    Teleport: {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your benched Pokémon to switch with' }] : [];
      },
      run(ctx) {
        if (ctx.choices.ownBenchSlot === undefined) return ctx.log('Teleport had no benched Pokémon to switch with.');
        ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
    'Big Eggsplosion': { run: (ctx) => void ctx.hit(20 * ctx.flips(energyPool(ctx.attacker, ctx.state.cards).length)) },
  },
  // Fearow
  'base2-36': { Agility: flipToProtect(20, 'preventAll') },
  // Gloom
  'base2-37': {
    Poisonpowder: inflicts(0, 'poisoned'),
    'Foul Odor': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('confused');
        ctx.confuseSelf();
      },
    },
  },
  // Lickitung
  'base2-38': { 'Tongue Wrap': flipToInflict(10, 'paralyzed'), Supersonic: supersonic },
  // Marowak
  'base2-39': { Bonemerang: perHeads(2, 30), 'Call for Friend': benchSearch('Call for Friend', { filter: 'basicType', type: 'fighting' }) },
  // Nidorina
  'base2-40': { Supersonic: supersonic, 'Double Kick': perHeads(2, 30) },
  // Parasect
  'base2-41': { Spore: spore },
  // Persian
  'base2-42': { Pounce: pounce(30, 10) },
  // Primeape
  'base2-43': { 'Fury Swipes': perHeads(3, 20), Tantrum: tailsConfusesSelf(50) },
  // Rapidash
  'base2-44': { Stomp: stomp, Agility: flipToProtect(30, 'preventAll') },
  // Rhydon
  'base2-45': {
    Ram: {
      run(ctx) {
        ctx.hit(50);
        ctx.selfDamage(20);
        // Even if Rhydon is Knocked Out.
        opponentSwitches(ctx, 'Ram');
      },
    },
  },
  // Tauros
  'base2-47': {
    Stomp: stomp,
    Rampage: {
      run(ctx) {
        ctx.hit(20 + ctx.attacker.damage);
        if (!ctx.flip()) ctx.confuseSelf();
      },
    },
  },
  // Weepinbell
  'base2-48': { Poisonpowder: flipToInflict(10, 'poisoned') },
  // Bellsprout
  'base2-49': { 'Call for Family': benchSearch('Call for Family', { filter: 'basicNamed', name: 'Bellsprout' }) },
  // Cubone
  'base2-50': { Snivel: pounce(0, 20), Rage: rage(10) },
  // Eevee
  'base2-51': { 'Tail Wag': cantAttackMe, 'Quick Attack': quickAttack },
  // Exeggcute
  'base2-52': { Hypnosis: inflicts(0, 'asleep'), 'Leech Seed': leechSeed(20) },
  // Jigglypuff
  'base2-54': { Lullaby: inflicts(0, 'asleep') },
  // Meowth
  'base2-56': {
    'Pay Day': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip()) ctx.draw(1);
      },
    },
  },
  // Nidoran♀
  'base2-57': { 'Fury Swipes': perHeads(3, 10), 'Call for Family': benchSearch('Call for Family', { filter: 'basicNamed', name: NIDORANS }) },
  // Oddish
  'base2-58': { 'Stun Spore': stunSpore, Sprout: benchSearch('Sprout', { filter: 'basicNamed', name: 'Oddish' }) },
  // Paras
  'base2-59': { Spore: spore },
  // Pikachu
  'base2-60': { Spark: benchTarget(20, 10) },
  // Rhyhorn
  'base2-61': { Leer: cantAttackMe },
  // Spearow
  'base2-62': { 'Mirror Move': mirrorMove },
  // Venonat
  'base2-63': { 'Stun Spore': stunSpore, 'Leech Life': leechLife(10) },
};
