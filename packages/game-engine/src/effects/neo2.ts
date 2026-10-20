// Neo Discovery (neo2) attack effects, by card id and attack name. Rulings follow the card text (the Neo-era rulebook);
// `text` has the printed wording where TCGdex drops an Energy symbol (Collect Fire, Flamethrower, Recover, Water Gun,
// Spike Barrage, Dust Devil). Attacks that only deal damage need no entry. 21–35 are the non-holo prints of 2–17
// (neo2-prints.ts). Hidden Power is here for every Unown, for Unown A's Anger.
// Rulings (agreed): Pineco's Burst flips twice: heads on the first does 40 to Pineco and 10 to every benched Pokémon,
// tails on the second only stops the 40 to the Defending Pokémon. Wobbuffet's Counter does back exactly the damage it took,
// without Weakness or Resistance. Metapod's Hatch and Yanma's Shockwave do their "Then…" part only on heads.
// Rulings (from the text): False Swipe, like Super Fang, isn't affected by Weakness or Resistance. Sketch copies the
// attack the Defending Pokémon used last turn, as Metronome does (its own questions, not what's needed to use it), if
// Smeargle was already in play then. Lock-on's tails-as-heads lasts through the attacking player's next turn, while
// neither Pokémon is benched or evolves. Pursuit's 10 damage happens when the Pokémon tries to retreat, even if
// Confusion then stops it. Triple Poison makes the Defending Pokémon take 30 between turns, even if it was Poisoned.
import { attackSituation, usableAttacks, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec, type UsableAttack } from '../attacks.js';
import { lookupCard } from '../cards.js';
import { counts, energyPool, type InPlayPokemon } from '../engine.js';
import { powerActive } from '../powers.js';
import { shuffle } from '../rng.js';
import { effectId, energyProtected, inPlayDef, pokemonName } from '../status.js';
import { attackEffect, powerEffect } from './index.js';
import { discardToUse, flipToInflict, flipToProtect, headsUntilTails, inflicts, opponentBenchChoice, opponentSwitches, perHeads, recoil, recover, tailsSelfDamage, extraEnergy } from './common.js';
import { benchWhere } from './gym1.js';
import { flipForMore } from './jungle.js';
import { damageOpponent, opponentTargets, rapidSpin, screech, swift } from './neo1.js';
import { withNonHolo } from './neo2-prints.js';
import { flipOrNothing } from './rocket.js';

/** Sketch: the attack the Defending Pokémon used last turn, if Smeargle was in play then (never Sketch itself). */
function sketched(s: AttackSituation): UsableAttack | undefined {
  const last = s.defender.effects?.lastAttack;
  if (!last || last.turn !== s.turn - 1 || s.attacker.playedTurn >= s.turn) return undefined;
  return usableAttacks(s.defender, s.cards, { recall: true }).find((u) => u.attack.name === last.name && u.attack.name !== 'Sketch');
}

/** A Fire Energy card in a discard pile (Collect Fire). */
const isFireEnergyCard = (s: Pick<AttackSituation, 'cards'>, uid: { defId: string }) => {
  const d = lookupCard(s.cards, uid.defId);
  return d.kind === 'energy' && d.energyType === 'fire' && !d.anyType;
};

/** Heads: the Defending Pokémon is Poisoned and takes 30 between turns instead of 10 (Triple Poison). */
const triplePoison = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.flip()) return;
    const defender = ctx.opp.active;
    const before = defender?.effects?.attackedOn?.turn === ctx.turn ? defender.effects.attackedOn.afflictions.length : 0;
    ctx.inflict('poisoned');
    // Only if the Poison took (nothing prevented it).
    if (!defender || (defender.effects?.attackedOn?.afflictions.length ?? 0) <= before) return;
    defender.poison = 30;
    ctx.log(`${pokemonName(ctx.state, defender)} takes 30 Poison damage between turns.`, ctx.opp.id);
  },
});

/** Discard every Trainer card attached to the Defending Pokémon, then base damage (Plunder). */
const plunder = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.affectDefender(() => {
      const defender = ctx.opp.active!;
      const trainers = (defender.attached ?? []).filter((a) => lookupCard(ctx.state.cards, a.card.defId).kind === 'trainer');
      if (!trainers.length) return;
      defender.attached = defender.attached!.filter((a) => !trainers.includes(a));
      ctx.opp.discard.push(...trainers.map((a) => a.card));
      ctx.log(`Discarded ${trainers.map((a) => lookupCard(ctx.state.cards, a.card.defId).name).join(', ')} from ${ctx.defenderDef.name}.`, ctx.opp.id);
    });
    ctx.hit(damage);
  },
});

/**
 * Hidden Power, by a Pokémon with Unown in its name: `damage` (10 on most), plus 10 for each damage counter on the attacking
 * player's Unown A with Anger working (only one Anger: the most damage counters); [XXXXX] (any Unown X of theirs working,
 * one per attack) flips until tails for 10 more each heads; [Perform] adds the damage an attack did to this Unown P as the
 * Active Pokémon on the opponent's last turn.
 */
export const hiddenPowerOf = (damage: number): AttackEffect => ({
  run(ctx) {
    const unown = ctx.attackerDef.name.includes('Unown');
    const works = (p: InPlayPokemon | null): p is InPlayPokemon => !!p && powerActive(p, ctx.state.cards, [ctx.me, ctx.opp]);
    const own = [ctx.me.active, ...ctx.me.bench].filter(works);
    const angry = own.filter((p) => !!powerEffect(effectId(p))?.anger);
    let more = unown ? Math.max(0, ...angry.map((p) => p.damage)) : 0;
    if (more) ctx.log(`Anger: ${more} more damage.`);
    if (unown && own.some((p) => powerEffect(effectId(p))?.xxxxx)) {
      const heads = headsUntilTails(ctx);
      if (heads) ctx.log(`[XXXXX]: ${10 * heads} more damage.`);
      more += 10 * heads;
    }
    const last = ctx.attacker.effects?.attackedOn;
    if (works(ctx.attacker) && powerEffect(effectId(ctx.attacker))?.perform && last?.turn === ctx.turn - 1 && last.damage) {
      ctx.log(`[Perform]: ${last.damage} more damage.`);
      more += last.damage;
    }
    ctx.hit(damage + more);
  },
});

export const hiddenPower = hiddenPowerOf(10);

/** Pokémon Work Together counts on the Bench. */
const FOSSIL_FRIENDS = ['Omanyte', 'Omastar', 'Kabuto', 'Kabutops'];

/** The names of the cards in the game that evolve from `name` (Hatch). */
export const evolutionsOf = (ctx: AttackContext, name: string) => [
  ...new Set(Object.values(ctx.state.cards).flatMap((d) => (d.kind === 'pokemon' && d.evolvesFrom === name ? [d.name] : []))),
];

const NEO2_HOLO: Record<string, Record<string, AttackEffect>> = {
  // Espeon
  'neo2-1': { Psychic: { run: (ctx) => void ctx.hit(30 + 10 * ctx.defender.energy.length) } },
  // Forretress
  'neo2-2': { 'Rapid Spin': rapidSpin(30, 'Forretress') },
  // Hitmontop
  'neo2-3': { Detect: flipToProtect(0, 'preventAll'), 'Triple Kick': perHeads(3, 30) },
  // Houndoom
  'neo2-4': {
    Crunch: screech(30),
    Flamethrower: discardToUse(50, 1, 'fire', 'Discard 1 Fire Energy card attached to Houndoom or this attack does nothing.'),
  },
  // Houndour
  'neo2-5': {
    Smog: flipToInflict(10, 'poisoned'),
    'Collect Fire': {
      text: 'If there are any Fire Energy cards in your discard pile, choose 1 of them and attach it to Houndour.',
      choices(s): ChoiceSpec[] {
        const options = s.ownDiscard.filter((c) => isFireEnergyCard(s, c));
        return options.length ? [{ kind: 'ownDiscard', min: 1, max: 1, options, prompt: 'Choose a Fire Energy card from your discard pile to attach to Houndour' }] : [];
      },
      run(ctx) {
        ctx.hit(20);
        const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids?.[0] && isFireEnergyCard(ctx.state, c));
        if (!card || ctx.me.active !== ctx.attacker) return;
        ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
        ctx.attacker.energy.push(card);
        ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Kabutops: at most 3 coins.
  'neo2-6': { Hydrocutter: { run: (ctx) => void ctx.hit(40 * ctx.flips(Math.min(3, ctx.attacker.energy.length))) } },
  // Magnemite
  'neo2-7': {
    'Lock-on': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).lockOn = ctx.turn + 2;
        (ctx.opp.active!.effects ??= {}).lockedOnBy = ctx.attacker.card.uid;
        ctx.log(`Next turn, tails flipped for ${ctx.attackerDef.name}'s Electric Bolt on ${ctx.defenderDef.name} count as heads.`);
      },
    },
    'Electric Bolt': {
      run(ctx) {
        const locked = (ctx.attacker.effects?.lockOn ?? 0) >= ctx.turn && ctx.defender.effects?.lockedOnBy === ctx.attacker.card.uid;
        const heads = ctx.flips(2);
        if (heads < 2 && !locked) return ctx.log('Electric Bolt did nothing.');
        if (heads < 2) ctx.log('Lock-on: the tails count as heads.');
        ctx.hit(50);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Politoed
  'neo2-8': { Doubleslap: perHeads(2, 40) },
  // Poliwrath
  'neo2-9': { Submission: recoil(70, 20) },
  // Scizor
  'neo2-10': {
    'False Swipe': {
      run(ctx) {
        // Half the remaining HP, rounded down to the nearest 10; not affected by Weakness or Resistance (as Super Fang).
        const remaining = Math.max(0, ctx.defenderDef.hp - ctx.defender.damage);
        ctx.hit(Math.floor(remaining / 20) * 10, { weakness: false });
      },
    },
    'Double Claw': perHeads(2, 20),
  },
  // Smeargle
  'neo2-11': {
    Sketch: {
      // The copied attack's own questions, except its discard (as Metronome).
      choices(s, c) {
        const copied = sketched(s);
        return (copied && attackEffect(copied.source, copied.attack.name)?.choices?.(s, c)) ?? [];
      },
      run(ctx) {
        const copied = sketched(attackSituation(ctx.state, ctx.me, ctx.opp));
        if (!copied) return ctx.log('Sketch had nothing to copy.');
        ctx.log(`Sketch copies ${copied.attack.name}.`);
        ctx.useAttack(copied.attack, copied.source);
      },
    },
  },
  // Tyranitar
  'neo2-12': {
    Slam: perHeads(2, 30),
    Trample: {
      run(ctx) {
        ctx.hit(50);
        for (const side of [ctx.opp, ctx.me]) {
          side.bench.forEach((p, slot) => {
            if (p && ctx.flip()) ctx.damageBenched(side, slot, 30);
          });
        }
      },
    },
  },
  // Umbreon
  'neo2-13': {
    'Feint Attack': {
      damage: '',
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 30 damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 30, true),
    },
  },
  // Unown A
  'neo2-14': { 'Hidden Power': hiddenPower },
  // Ursaring
  'neo2-15': {
    Headpress: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Headpress did nothing.');
        ctx.hit(20);
        ctx.inflict('paralyzed');
      },
    },
    'Double Lariat': perHeads(2, 40),
  },
  // Wobbuffet
  'neo2-16': {
    Counter: {
      run(ctx) {
        ctx.protect('counter');
        ctx.log(`If an attack damages ${ctx.attackerDef.name} next turn, a heads does the same damage back.`);
      },
    },
  },
  // Yanma
  'neo2-17': {
    Shockwave: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Shockwave did nothing.');
        ctx.hit(10, { weakness: false });
        ctx.opp.bench.forEach((p, slot) => p && ctx.damageBenched(ctx.opp, slot, 10));
        opponentSwitches(ctx, 'Shockwave');
      },
    },
    Swift: swift(30),
  },
};

export const NEO2: Record<string, Record<string, AttackEffect>> = {
  ...withNonHolo(NEO2_HOLO),
  // Beedrill
  'neo2-18': { 'Triple Poison': triplePoison(10), 'Pin Missile': perHeads(4, 20) },
  // Butterfree
  'neo2-19': {
    'Magic Dust': {
      choices: (): ChoiceSpec[] => [{ kind: 'condition', options: ['asleep', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose what the Defending Pokémon becomes (on heads)' }],
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
      },
    },
    // Damage counters removed equal to the damage done, after Weakness and Resistance.
    'Hyper Reverse': { run: (ctx) => ctx.heal(ctx.hit(10 * ctx.defender.energy.length)) },
  },
  // Espeon
  'neo2-20': { 'Quick Attack': flipForMore(10, 20), Psybeam: flipToInflict(30, 'confused') },
  // Umbreon
  'neo2-32': {
    'Quick Attack': flipForMore(10, 20),
    Pursuit: {
      run(ctx) {
        ctx.hit(30);
        ctx.affectDefender((e) => {
          e.pursuit = ctx.turn + 1;
          ctx.log(`If ${ctx.defenderDef.name} tries to retreat next turn, it takes 10 damage.`);
        });
      },
    },
  },
  // Corsola
  'neo2-37': {
    Recover: recover('water', 'Discard 1 Water Energy card attached to Corsola or this attack does nothing. Remove all damage counters from Corsola.'),
    'Spike Cannon': perHeads(2, 30),
  },
  // Houndour
  'neo2-39': { Plunder: plunder(20) },
  // Kakuna
  'neo2-41': {
    'Secrete Poison': {
      run(ctx) {
        ctx.protect('secretePoison');
        ctx.log(`If an attack damages ${ctx.attackerDef.name} next turn, the attacker is Poisoned and 10 damage to each of its player's benched Pokémon.`);
      },
    },
  },
  // Metapod
  'neo2-42': {
    Harden: {
      run(ctx) {
        (ctx.attacker.effects ??= {}).preventUpTo = { amount: 20, until: ctx.turn + 1 };
        ctx.log(`Attack damage of 20 or less to ${ctx.attackerDef.name} is prevented next turn.`);
      },
    },
    Hatch: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Hatch did nothing.');
        ctx.heal('all');
        const names = evolutionsOf(ctx, ctx.attackerDef.name);
        if (ctx.me.deck.some((c) => names.includes(lookupCard(ctx.state.cards, c.defId).name))) return ctx.pend({ kind: 'evolveFromDeck', source: 'Hatch', target: 'active', names });
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Found nothing in the deck.');
      },
    },
  },
  // Omastar
  'neo2-43': {
    Squeeze: {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(10);
        ctx.hit(30);
        ctx.inflict('paralyzed');
      },
    },
    'Spike Barrage': {
      text: 'Flip a number of coins equal to the number of Water Energy attached to Omastar. This attack does 20 damage plus 20 more damage for each heads.',
      run: (ctx) => void ctx.hit(20 + 20 * ctx.flips(energyPool(ctx.attacker, ctx.state.cards).filter((t) => counts(t, 'water')).length)),
    },
  },
  // Poliwhirl
  'neo2-44': {
    'Belly Drum': {
      run(ctx) {
        ctx.attacker.damage += 30;
        ctx.log(`Put 3 damage counters on ${ctx.attackerDef.name}.`);
        if (ctx.attacker.damage >= ctx.attackerDef.hp) return;
        ctx.pend({ kind: 'pickFromDeck', source: 'Belly Drum', filter: 'basicEnergy', count: 2, optional: true, attachToActive: true });
      },
    },
    'Water Gun': {
      text: "Does 30 damage plus 10 more damage for each Water Energy attached to Poliwhirl but not used to pay for this attack's Energy cost. You can't add more than 20 damage in this way.",
      run: (ctx) => void ctx.hit(30 + 10 * extraEnergy(ctx, ['water', 'water', 'colorless'], 'water', 2)),
    },
  },
  // Pupitar
  'neo2-45': {
    'Dust Devil': {
      text: "Does 10 damage to each non-Fighting Pokémon in play. Don't apply Weakness and Resistance.",
      run(ctx) {
        const nonFighting = (p: InPlayPokemon) => inPlayDef(ctx.state.cards, p).type !== 'fighting';
        if (ctx.opp.active && nonFighting(ctx.opp.active)) ctx.hit(10, { weakness: false });
        benchWhere(ctx, ctx.opp, 10, nonFighting);
        benchWhere(ctx, ctx.me, 10, nonFighting);
        if (nonFighting(ctx.attacker)) ctx.selfDamage(10);
      },
    },
  },
  // Scyther: 10 more for 1 heads, 20 for 2, 40 for 3, 80 for 4.
  'neo2-46': { 'Fury Cutter': { run: (ctx) => void ctx.hit(10 + [0, 10, 20, 40, 80][ctx.flips(4)]!) } },
  // Unown D, F, M, N and U
  'neo2-47': { 'Hidden Power': hiddenPower },
  'neo2-48': { 'Hidden Power': hiddenPower },
  'neo2-49': { 'Hidden Power': hiddenPower },
  'neo2-50': { 'Hidden Power': hiddenPower },
  'neo2-51': { 'Hidden Power': hiddenPower },
  // Xatu
  'neo2-52': {
    'Energy Cycle': {
      choices: (s): ChoiceSpec[] => [
        ...(s.defender.energy.length ? [{ kind: 'defenderEnergy' as const, options: s.defender.energy, prompt: 'Choose an Energy card attached to the Defending Pokémon to move (if heads)' }] : []),
        ...opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to attach it to (if heads)"),
      ],
      run(ctx) {
        ctx.hit(10);
        const energy = ctx.opp.active?.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        const slot = ctx.choices.benchSlot;
        const to = slot === undefined ? null : ctx.opp.bench[slot];
        if (!energy || !to || !ctx.flip()) return;
        ctx.affectDefender(() => {
          const defender = ctx.opp.active!;
          if (energyProtected(ctx.state.cards, defender)) return ctx.log(`Brock's Protection: ${ctx.defenderDef.name}'s Energy can't be removed.`, ctx.opp.id);
          defender.energy = defender.energy.filter((e) => e !== energy);
          to.energy.push(energy);
          ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${ctx.defenderDef.name} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
        });
      },
    },
  },
  // Caterpie
  'neo2-53': { 'Spin Tackle': recoil(20, 10) },
  // Dunsparce
  'neo2-54': { Glare: flipToInflict(10, 'paralyzed') },
  // Kabuto
  'neo2-56': {
    'Work Together': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(10);
        ctx.hit(10 + 10 * ctx.me.bench.filter((p) => p && FOSSIL_FRIENDS.includes(inPlayDef(ctx.state.cards, p).name)).length);
      },
    },
  },
  // Mareep
  'neo2-58': { 'Thunder Jolt': tailsSelfDamage(30, 10) },
  // Natu
  'neo2-59': { 'Confuse Ray': flipToInflict(10, 'confused') },
  // Omanyte
  'neo2-60': { Bind: flipToInflict(10, 'paralyzed') },
  // Pineco: heads on the first flip, 40 to Pineco and 10 to every benched Pokémon; tails on the second, no 40 to the Defending Pokémon (agreed).
  'neo2-61': {
    Burst: {
      run(ctx) {
        if (ctx.flip()) {
          ctx.selfDamage(40);
          ctx.benchDamage(ctx.opp, 10);
          ctx.benchDamage(ctx.me, 10);
        }
        if (ctx.flip()) ctx.hit(40);
        else ctx.log('Burst did no damage to the Defending Pokémon.');
      },
    },
  },
  // Poliwag
  'neo2-62': { Hypnosis: inflicts(0, 'asleep') },
  // Sentret
  'neo2-63': { Scout: { run: (ctx) => ctx.pend({ kind: 'lookOppHand', source: 'Scout' }) } },
  // Spinarak
  'neo2-64': { 'Poison Sting': flipToInflict(20, 'poisoned') },
  // Teddiursa
  'neo2-65': {
    'Nap Time': {
      run(ctx) {
        ctx.heal('all');
        ctx.sleepSelf();
      },
    },
  },
  // Tyrogue
  'neo2-66': { 'Smash Punch': flipOrNothing(30) },
  // Unown E, I and O
  'neo2-67': { 'Hidden Power': hiddenPower },
  'neo2-68': { 'Hidden Power': hiddenPower },
  'neo2-69': { 'Hidden Power': hiddenPower },
  // Unown J (Wizards Promo; it has no other attack effect)
  'basep-38': { 'Hidden Power': hiddenPower },
  // Weedle
  'neo2-70': {
    'Spike Stab': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Spike Stab did nothing.');
        ctx.hit(20);
        ctx.inflict('poisoned');
      },
    },
  },
  // Wooper
  'neo2-71': {
    Slime: {
      run(ctx) {
        ctx.protect('slime');
        ctx.log(`If an attack would damage ${ctx.attackerDef.name} next turn, the attacking player flips: tails prevents the damage.`);
      },
    },
  },
};
