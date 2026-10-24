// Neo Revelation (neo3) attack effects, by card id and attack name. Rulings follow the card text (the Neo-era rulebook);
// `text` has the printed wording where TCGdex drops an Energy symbol (Dark Flame, Searing Flames, Stoke, Plasma, Lightning
// Strike, Core Stream, Lava Flow, Devastate). Attacks that only deal damage need no entry. Hidden Power is here for every
// Unown, for Unown A's Anger (neo2.ts).
// Rulings (from the text): Genetic Memory uses an attack of a card Kingdra evolved from with that attack's own questions and
// effect but not its cost or the discards it needs (as Metronome does). Questions whose answer depends on a flip are asked
// before it (Sacred Fire, Lightning Spark, Overhead Toss, Delta Beam, Psykiss). Perish Song Knocks Out the Defending
// Pokémon if it's Asleep and was Asleep from Night Eyes on the attacking player's last turn. Triggered Poison Poisons the
// Defending Pokémon when its player attaches an Energy card to it by any effect, through their next turn (engine.ts).
// High-Speed Charge and Leek Jab can't be used on the attacking player's next turn (benching ends that). Evolutionary Spore
// evolves each chosen Hoppip and Skiploom once, like any evolution but for the turn limits (as Rapid Evolution does);
// Prehistoric Power still stops it. Present's "remove 3 damage counters" and Gentle Song's healing are effects of the
// attack on the Defending Pokémon, so whatever stops those stops them. Twister, Devastate and Sneasel's Swipe go through
// Brock's Protection, Unown K's Keep and Crystal Body like every other effect on the opponent's Energy or Pokémon.
import { pokemonOn, targetsIn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, namesMatch, type EnergyType } from '../cards.js';
import { counts, discardTheirEnergy, energyPool, energyProvided, isEnergyCardOf, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { discardsLocked, energyKept, evolutionBlocked } from '../powers.js';
import { shuffle } from '../rng.js';
import { baseUid, energyProtected, inPlayDef, pokemonName } from '../status.js';
import { sporeTargets } from '../trainers.js';
import { attackEffect } from './index.js';
import { BASE1 } from './base1.js';
import { benchSearch, discardDefenderEnergy, discardToUse, flipToInflict, flipToProtect, headsUntilTails, inflicts, opponentBenchChoice, opponentSwitches, perHeads, recoil, tailsSelfDamage } from './common.js';
import { discardFromAttacker, noRetreat } from './gym1.js';
import { flipForMore, rage } from './jungle.js';
import { damageOpponent, opponentTargets, screech } from './neo1.js';
import { hiddenPower } from './neo2.js';
import { flipOrNothing } from './rocket.js';
import { damageEach, fly, healDefender, TYPES } from './si1.js';

/** Whether the attack can do anything with cards in discard piles: not while Allergic Pollen works (logged). */
export function discardFree(ctx: AttackContext): boolean {
  if (!discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return true;
  ctx.log('Allergic Pollen: cards in discard piles are not affected.');
  return false;
}

/** Attaches the first card `matches` finds in the attacking player's discard pile to the attacker (Plasma, Dark Flame). */
export function attachFromDiscard(ctx: AttackContext, matches: (c: CardInstance) => boolean) {
  const card = ctx.me.discard.find(matches);
  if (!card || ctx.me.active !== ctx.attacker || !discardFree(ctx)) return;
  ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
  ctx.attacker.energy.push(card);
  ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${ctx.attackerDef.name}.`);
}

const basicOf = (ctx: AttackContext, type: EnergyType) => (c: CardInstance) => {
  const d = lookupCard(ctx.state.cards, c.defId);
  return isBasicEnergy(d) && d.kind === 'energy' && d.energyType === type;
};

/** The attacker can't use this attack during its player's next turn (High-Speed Charge, Leek Jab: benching ends this). */
export const notNextTurn = (ctx: AttackContext, attack: string) => {
  (ctx.attacker.effects ??= {}).amnesia = { attack, until: ctx.turn + 2 };
  ctx.log(`${ctx.attackerDef.name} can't use ${attack} next turn.`);
};

/** Whether an attack may discard Energy cards from this Pokémon of the opponent's: Brock's Protection and Unown K's Keep (logged). */
export function energyCanGo(ctx: AttackContext, p: InPlayPokemon): boolean {
  const why = energyProtected(ctx.state.cards, p)
    ? `Brock's Protection: ${pokemonName(ctx.state, p)}'s Energy can't be removed.`
    : energyKept(ctx.opp, [ctx.opp, ctx.me], ctx.state.cards, p)
      ? `[Keep]: ${pokemonName(ctx.state, p)}'s Energy cards can't be discarded.`
      : null;
  if (why) ctx.log(why, ctx.opp.id);
  return !why;
}

/** Whether the attack's effects can reach the Defending Pokémon (not Agility, Crystal Body…); logs why not. */
export function reachesDefender(ctx: AttackContext): boolean {
  let reached = false;
  ctx.affectDefender(() => void (reached = true));
  return reached;
}

/**
 * Discards 1 Energy card from each of the opponent's Pokémon at `targets` (as Super Removal): at once when there's nothing
 * to choose, otherwise the attacking player picks them after the attack (removeEach, one at a time).
 */
export function discardFromEach(ctx: AttackContext, targets: Target[], source: string) {
  const ask: Target[] = [];
  for (const t of targets) {
    const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t)!;
    const energy = p.energy.filter((e) => !e.provides);
    if (!energy.length || !(t === 'active' ? reachesDefender(ctx) : ctx.canAffect(ctx.opp, p)) || !energyCanGo(ctx, p)) continue;
    // Identical cards need no choice.
    if (new Set(energy.map((e) => e.defId)).size > 1) {
      ask.push(t);
      continue;
    }
    p.energy = p.energy.filter((e) => e !== energy[0]);
    ctx.log(`${source}: discarded ${lookupCard(ctx.state.cards, energy[0]!.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
    discardTheirEnergy(ctx.state, ctx.opp, [energy[0]!]);
  }
  if (ask.length) ctx.pend({ kind: 'removeEach', source, targets: ask });
}

/** Genetic Memory: the attacks of the cards Kingdra evolved from, Basic first. */
const remembered = (s: Pick<AttackSituation, 'attacker' | 'cards'>) =>
  s.attacker.evolvedFrom.flatMap((c) => {
    const d = lookupCard(s.cards, c.defId);
    return d.kind === 'pokemon' ? d.attacks.map((attack) => ({ attack, source: d.id, from: d.name })) : [];
  });

/** Trainer cards attached to a Pokémon (not Shapeshift's Evolution card). */
const attachedTrainers = (cards: AttackSituation['cards'], p: InPlayPokemon) => (p.attached ?? []).filter((a) => lookupCard(cards, a.card.defId).kind === 'trainer');

/** Special Energy cards attached to a Pokémon (Psykiss): not basic Energy, nor a Pokémon attached as Energy. */
const specialEnergy = (cards: AttackSituation['cards'], p: InPlayPokemon) => p.energy.filter((e) => !e.provides && lookupCard(cards, e.defId).kind === 'energy' && !isBasicEnergy(lookupCard(cards, e.defId)));

export const NEO3: Record<string, Record<string, AttackEffect>> = {
  // Ampharos
  'neo3-1': {
    'Attract Current': {
      text: 'Flip 3 coins. For each heads, you may search your deck for a Lightning Energy card and attach it to 1 of your Lightning Pokémon. Shuffle your deck afterward.',
      run(ctx) {
        ctx.hit(20);
        const heads = ctx.flips(3);
        if (!heads) return;
        ctx.pend({ kind: 'pickFromDeck', source: 'Attract Current', filter: 'energyType', type: 'lightning', count: heads, optional: true, attach: true, attachOnly: { type: 'lightning' } });
      },
    },
    Gigavolt: {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(60);
        ctx.hit(40);
        ctx.inflict('paralyzed');
      },
    },
  },
  // Blissey
  'neo3-2': { 'Body Slam': flipToInflict(30, 'paralyzed') },
  // Celebi
  'neo3-3': {
    'Psychic Damage': {
      run(ctx) {
        const heads = ctx.flips(3);
        if (!heads) return ctx.log('Psychic Damage did nothing.');
        ctx.affectDefender(() => {
          ctx.opp.active!.damage += 10 * heads;
          ctx.log(`Put ${heads} damage counter${heads === 1 ? '' : 's'} on ${ctx.defenderDef.name}.`, ctx.opp.id);
        });
      },
    },
  },
  // Crobat
  'neo3-4': {
    'Triggered Poison': {
      run(ctx) {
        ctx.hit(20);
        ctx.affectDefender((e) => {
          e.triggeredPoison = ctx.turn + 1;
          ctx.log(`If an Energy card is attached to ${ctx.defenderDef.name} next turn, it's Poisoned.`, ctx.opp.id);
        });
      },
    },
    'Cross Attack': {
      run(ctx) {
        const heads = ctx.flips(4);
        ctx.hit(20 * heads);
        if (heads >= 2) ctx.inflict('confused');
      },
    },
  },
  // Delibird
  'neo3-5': {
    Present: {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads === 1) ctx.hit(40);
        else if (heads === 3) ctx.hit(60);
        else healDefender(ctx, heads === 2 ? 30 : 'all');
      },
    },
  },
  // Entei
  'neo3-6': { 'Searing Flames': discardToUse(60, 2, 'fire', 'Discard 2 Fire Energy cards attached to Entei or this attack does nothing.') },
  // Ho-oh
  'neo3-7': {
    Stoke: {
      text: 'You may search your deck for a Fire Energy card and attach it to Ho-oh. Shuffle your deck afterward.',
      run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Stoke', filter: 'energyType', type: 'fire', optional: true, attachToActive: true }),
    },
    'Sacred Fire': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 40 damage to (if heads)"),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Sacred Fire did nothing.');
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 40);
      },
    },
    'Dive Bomb': flipOrNothing(90),
  },
  // Houndoom
  'neo3-8': {
    'Dark Flame': {
      text: 'Discard 1 Fire Energy card attached to Houndoom or this attack does nothing. If there are any Darkness Energy cards in your discard pile, attach 1 of them to Houndoom.',
      discard: { count: 1, type: 'fire' },
      run(ctx) {
        ctx.hit(20);
        attachFromDiscard(ctx, (c) => lookupCard(ctx.state.cards, c.defId).name === 'Darkness Energy');
      },
    },
    'Black Fang': { run: (ctx) => void ctx.hit(30 + 10 * ctx.flips(energyPool(ctx.attacker, ctx.state.cards).length)) },
  },
  // Jumpluff
  'neo3-9': {
    'Evolutionary Spore': {
      run(ctx) {
        const blocked = evolutionBlocked([ctx.me, ctx.opp], ctx.state.cards);
        if (blocked) return ctx.log(`${blocked}.`);
        const spore = { kind: 'evolveMany' as const, source: 'Evolutionary Spore', names: ['Hoppip', 'Skiploom'], done: [] as string[] };
        if (ctx.me.deck.some((c) => sporeTargets(ctx.state, { ...spore, player: ctx.me.id }, c).length)) return ctx.pend(spore);
        [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
        ctx.log('Found nothing in the deck to evolve with.');
      },
    },
  },
  // Magneton
  'neo3-10': {
    Plasma: {
      text: 'If there are any Lightning Energy cards in your discard pile, attach 1 of them to Magneton.',
      run(ctx) {
        ctx.hit(30);
        attachFromDiscard(ctx, basicOf(ctx, 'lightning'));
      },
    },
  },
  // Misdreavus
  'neo3-11': {
    'Night Eyes': {
      run(ctx) {
        ctx.inflict('asleep');
        const defender = ctx.opp.active;
        if (defender?.condition === 'asleep') (defender.effects ??= {}).nightEyes = ctx.turn;
      },
    },
    'Perish Song': {
      run(ctx) {
        const defender = ctx.defender;
        if (defender.condition !== 'asleep' || defender.effects?.nightEyes !== ctx.turn - 2) return ctx.log('Perish Song did nothing.');
        ctx.affectDefender(() => {
          defender.damage = Math.max(defender.damage, inPlayDef(ctx.state.cards, defender).hp);
          ctx.log(`Perish Song: ${ctx.defenderDef.name} is Knocked Out.`, ctx.opp.id);
        });
      },
    },
  },
  // Porygon2
  'neo3-12': {
    'Delta Beam': {
      choices: (): ChoiceSpec[] => [{ kind: 'condition', options: ['asleep', 'confused', 'paralyzed'], prompt: 'Choose what the Defending Pokémon becomes (on heads)' }],
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
      },
    },
  },
  // Raikou
  'neo3-13': { 'Lightning Tackle': tailsSelfDamage(50, 20) },
  // Suicune
  'neo3-14': {
    'Aurora Wave': {
      run(ctx) {
        ctx.hit(30);
        const heads = ctx.flips(2);
        if (heads === 2) ctx.inflict('paralyzed');
        else if (heads === 1) ctx.inflict('asleep');
      },
    },
  },
  // Aerodactyl
  'neo3-15': { Fly: fly(30) },
  // Celebi: damage counters removed equal to the damage done, after Weakness and Resistance.
  'neo3-16': { 'Psychic Leaf': { run: (ctx) => ctx.heal(ctx.hit(10 + 10 * ctx.flips(energyPool(ctx.defender, ctx.state.cards).length))) } },
  // Entei
  'neo3-17': {
    'Mega Flame': {
      run(ctx) {
        ctx.hit(50);
        const tails = 2 - ctx.flips(2);
        const energy = ctx.attacker.energy;
        if (!tails || !energy.length || ctx.me.active !== ctx.attacker) return;
        // Identical cards (or all of them) need no choice; otherwise its player picks after the attack.
        if (energy.length <= tails || new Set(energy.map((e) => e.defId)).size === 1) return discardFromAttacker(ctx, energy.slice(0, tails));
        ctx.pend({ kind: 'discardAttached', source: 'Mega Flame', target: 'active', count: tails });
      },
    },
  },
  // Ho-oh: 10 more for each type of basic Energy card attached.
  'neo3-18': {
    'Rainbow Burn': {
      run(ctx) {
        const types = new Set(ctx.attacker.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(ctx.state.cards, e.defId))).map((e) => energyProvided(e, ctx.state.cards).type));
        ctx.hit(30 + 10 * types.size);
      },
    },
  },
  // Kingdra
  'neo3-19': {
    'Genetic Memory': {
      choices(s, c): ChoiceSpec[] {
        const lower = remembered(s);
        if (!lower.length) return [];
        const spec: ChoiceSpec = { kind: 'amount', options: lower.map((_, i) => i), labels: lower.map((u) => `${u.from}: ${u.attack.name}`), prompt: "Choose an attack from the cards Kingdra evolved from" };
        const copied = c.amount === undefined ? undefined : lower[c.amount];
        return [spec, ...((copied && attackEffect(copied.source, copied.attack.name)?.choices?.(s, c)) ?? [])];
      },
      run(ctx) {
        const copied = remembered({ attacker: ctx.attacker, cards: ctx.state.cards })[ctx.choices.amount ?? -1];
        if (!copied) return ctx.log('Genetic Memory had no attack to use.');
        ctx.log(`Genetic Memory uses ${copied.from}'s ${copied.attack.name}.`);
        ctx.useAttack(copied.attack, copied.source);
      },
    },
    Twister: {
      run(ctx) {
        const heads = ctx.flips(2);
        if (!heads) return ctx.log('Twister did nothing.');
        ctx.hit(50);
        const defender = ctx.opp.active;
        if (!defender || defender.damage >= inPlayDef(ctx.state.cards, defender).hp) return;
        const energy = defender.energy.filter((e) => !e.provides);
        if (!energy.length || !reachesDefender(ctx) || !energyCanGo(ctx, defender)) return;
        // Identical cards (or all of them) need no choice; otherwise the attacking player picks after the attack.
        if (energy.length <= heads || new Set(energy.map((e) => e.defId)).size === 1) {
          const gone = energy.slice(0, heads);
          defender.energy = defender.energy.filter((e) => !gone.includes(e));
          ctx.log(`Twister: discarded ${gone.map((e) => lookupCard(ctx.state.cards, e.defId).name).join(' and ')} from ${ctx.defenderDef.name}.`, ctx.opp.id);
          return discardTheirEnergy(ctx.state, ctx.opp, gone);
        }
        ctx.pend({ kind: 'removeEach', source: 'Twister', targets: Array<Target>(heads).fill('active') });
      },
    },
  },
  // Lugia: "you may flip": yes is 80 on heads, nothing on tails; no is 40.
  'neo3-20': {
    Aerowing: {
      choices: (): ChoiceSpec[] => [{ kind: 'boost', options: [true, false], prompt: 'Flip a coin? Heads: 80 damage, tails: nothing (no: 40 damage)' }],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(40);
        if (ctx.flip()) ctx.hit(80);
        else ctx.log('Aerowing did nothing.');
      },
    },
  },
  // Raichu
  'neo3-21': {
    Thundershock: flipToInflict(20, 'paralyzed'),
    'Lightning Strike': {
      text: 'You may discard all Lightning Energy cards attached to Raichu. If you do, this attack does 80 damage.',
      choices: (s): ChoiceSpec[] =>
        s.attacker.energy.some((e) => isEnergyCardOf(e, s.cards, 'lightning')) ? [{ kind: 'boost', options: [true, false], prompt: 'Discard all Lightning Energy cards attached to Raichu for 80 damage?' }] : [],
      run(ctx) {
        if (!ctx.choices.boost) return void ctx.hit(40);
        discardFromAttacker(ctx, ctx.attacker.energy.filter((e) => isEnergyCardOf(e, ctx.state.cards, 'lightning')));
        ctx.hit(80);
      },
    },
  },
  // Raikou
  'neo3-22': {
    'Lightning Spark': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to do 20 damage to (if heads)"),
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && ctx.flip()) ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Skarmory
  'neo3-23': { 'Fury Attack': perHeads(2, 10), Agility: flipToProtect(20, 'preventAll') },
  // Sneasel
  'neo3-24': {
    Swipe: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Swipe did nothing.');
        for (const t of targetsIn(ctx.opp.active, ctx.opp.bench)) {
          const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t)!;
          const trainers = attachedTrainers(ctx.state.cards, p);
          if (!trainers.length || !(t === 'active' ? reachesDefender(ctx) : ctx.canAffect(ctx.opp, p))) continue;
          p.attached = p.attached!.filter((a) => !trainers.includes(a));
          ctx.opp.discard.push(...trainers.map((a) => a.card));
          ctx.log(`Discarded ${trainers.map((a) => lookupCard(ctx.state.cards, a.card.defId).name).join(', ')} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
        }
      },
    },
    'Quick Attack': flipForMore(10, 20),
  },
  // Starmie
  'neo3-25': {
    'Confuse Ray': flipToInflict(10, 'confused'),
    'Core Stream': {
      text: "Choose an Energy type other than Colorless. This attack does 20 damage to each of your opponent's Pokémon with any Energy cards of that type attached to it. Don't apply Weakness and Resistance.",
      choices: (): ChoiceSpec[] => [{ kind: 'type', options: TYPES, prompt: 'Choose an Energy type: 20 damage to each of your opponent\'s Pokémon with Energy of that type' }],
      run(ctx) {
        const type = ctx.choices.type;
        if (!type) return;
        const targets = targetsIn(ctx.opp.active, ctx.opp.bench).filter((t) =>
          pokemonOn(ctx.opp.active, ctx.opp.bench, t)!.energy.some((e) => !e.provides && counts(energyProvided(e, ctx.state.cards).type, type)),
        );
        if (!targets.length) return ctx.log('None of your opponent\'s Pokémon have Energy of that type.');
        damageEach(ctx, targets, 20);
      },
    },
  },
  // Sudowoodo
  'neo3-26': { Slam: perHeads(2, 20) },
  // Suicune: the damage, then (tails) the switch.
  'neo3-27': {
    'Crystal Wave': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(40);
        ctx.hit(30);
        opponentSwitches(ctx, 'Crystal Wave');
      },
    },
  },
  // Flaaffy
  'neo3-28': {
    'Tail Shock': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip()) ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Golbat: the Defending Pokémon is Poisoned either way; half the damage done (rounded up to the nearest 10) is removed from Golbat.
  'neo3-29': {
    Screech: screech(0),
    'Poison Bite': {
      run(ctx) {
        const done = ctx.hit(10);
        if (done > 0) ctx.heal(Math.ceil(done / 20) * 10);
        ctx.inflict('poisoned');
      },
    },
  },
  // Graveler
  'neo3-30': {
    Earthquake: {
      run(ctx) {
        ctx.hit(40);
        ctx.benchDamage(ctx.me, 10);
      },
    },
    'Rock Tumble': { run: (ctx) => void ctx.hit(50, { resistance: false }) },
  },
  // Jynx
  'neo3-31': {
    'Freezing Kiss Goodnight': inflicts(0, 'asleep'),
    'Strange Dance': {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(20);
        ctx.hit(40);
        ctx.inflict('confused');
      },
    },
  },
  // Lanturn
  'neo3-32': { 'Blinding Light': flipToInflict(30, 'confused') },
  // Magcargo
  'neo3-33': {
    'Lava Flow': {
      text: 'You may discard any number of Fire Energy cards attached to Magcargo when you use this attack. If you do, this attack does 40 damage plus 20 more damage for each Energy card you discarded in this way.',
      choices(s): ChoiceSpec[] {
        const options = s.attacker.energy.filter((e) => isEnergyCardOf(e, s.cards, 'fire'));
        return options.length ? [{ kind: 'ownEnergyUpTo', options, prompt: 'Choose any number of Fire Energy cards to discard: 20 more damage for each' }] : [];
      },
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid) && isEnergyCardOf(e, ctx.state.cards, 'fire'));
        discardFromAttacker(ctx, gone);
        ctx.hit(40 + 20 * gone.length);
      },
    },
  },
  // Octillery: Octazooka's flip lasts until the Defending Pokémon is benched or evolves (as Ink Spurt).
  'neo3-34': {
    Constrict: flipToInflict(10, 'paralyzed'),
    Octazooka: {
      run(ctx) {
        ctx.hit(40);
        if (!ctx.flip()) return;
        ctx.affectDefender((e) => {
          e.inkSpurt = true;
          ctx.log(`${ctx.defenderDef.name}'s attacks need heads until it evolves or is benched.`, ctx.opp.id);
        });
      },
    },
  },
  // Parasect
  'neo3-35': { 'Sleep Pinchers': flipToInflict(30, 'asleep') },
  // Piloswine
  'neo3-36': {
    Nap: { run: (ctx) => ctx.heal(30) },
    'High-Speed Charge': {
      run(ctx) {
        ctx.hit(80);
        ctx.selfDamage(30);
        notNextTurn(ctx, 'High-Speed Charge');
      },
    },
  },
  // Seaking
  'neo3-37': {
    'Rising Lunge': flipForMore(10, 10),
    'Horn Swipe': { run: (ctx) => void ctx.hit(ctx.flips(2) === 2 ? 60 : 20) },
  },
  // Stantler
  'neo3-38': {
    Terrorize: {
      choices: (s, c) => (inPlayDef(s.cards, s.defender).stage === 'basic' ? (BASE1['base1-38']!.Amnesia!.choices?.(s, c) ?? []) : []),
      run(ctx) {
        if (ctx.defenderDef.stage !== 'basic') return ctx.log(`${ctx.defenderDef.name} isn't a Basic Pokémon.`);
        BASE1['base1-38']!.Amnesia!.run(ctx);
      },
    },
    'Overhead Toss': {
      choices(s): ChoiceSpec[] {
        const options = targetsIn(null, s.ownBench) as number[];
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your benched Pokémon to take 10 damage (if tails)' }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && ctx.me.bench[slot] && !ctx.flip()) ctx.damageBenched(ctx.me, slot, 10);
      },
    },
  },
  // Unown B, Y
  'neo3-39': { 'Hidden Power': hiddenPower },
  'neo3-40': { 'Hidden Power': hiddenPower },
  // Aipom
  'neo3-41': {
    Grab: {
      choices(s, c): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => attachedTrainers(s.cards, pokemonOn(s.defender, s.opponentBench, t)!).length);
        if (!options.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon with a Trainer card attached" }];
        const trainers = c.oppTarget === undefined ? [] : attachedTrainers(s.cards, pokemonOn(s.defender, s.opponentBench, c.oppTarget)!);
        if (trainers.length > 1) specs.push({ kind: 'amount', options: trainers.map((_, i) => i), labels: trainers.map((a) => lookupCard(s.cards, a.card.defId).name), prompt: 'Choose the Trainer card' });
        return specs;
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        if (t === undefined) return ctx.log('Your opponent has no Trainer cards attached.');
        const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t)!;
        const card = attachedTrainers(ctx.state.cards, p)[ctx.choices.amount ?? 0];
        if (!card || !(t === 'active' ? reachesDefender(ctx) : ctx.canAffect(ctx.opp, p))) return;
        p.attached = p.attached!.filter((a) => a !== card);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, card.card], ctx.state.rngState);
        ctx.log(`Shuffled ${lookupCard(ctx.state.cards, card.card.defId).name} from ${pokemonName(ctx.state, p)} into the deck.`, ctx.opp.id);
      },
    },
  },
  // Chinchou: the Defending Pokémon's attacks on Chinchou next turn do 10 less, before Weakness and Resistance (as Togepi's Snivel).
  'neo3-42': {
    'Positive Ion': flipForMore(10, 10),
    'Negative Ion': {
      run(ctx) {
        ctx.hit(10);
        const target = baseUid(ctx.attacker);
        ctx.affectDefender((e) => {
          e.pounce = { target, amount: 10, until: ctx.turn + 1, beforeWeakness: true };
          ctx.log(`${ctx.defenderDef.name}'s attacks on ${ctx.attackerDef.name} do 10 less damage next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Farfetch'd
  'neo3-43': {
    'Leek Jab': {
      run(ctx) {
        ctx.hit(40);
        notNextTurn(ctx, 'Leek Jab');
      },
    },
  },
  // Goldeen
  'neo3-45': { 'Fin Smack': perHeads(2, 10) },
  // Murkrow
  'neo3-46': {
    'Call for Family': benchSearch('Call for Family', { filter: 'basicNamed', name: 'Murkrow' }),
    'Flock Attack': {
      run(ctx) {
        const murkrows = ctx.me.bench.filter((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Murkrow')).length;
        ctx.hit(10 + 10 * ctx.flips(murkrows));
      },
    },
  },
  // Paras
  'neo3-47': { 'Sleep Spore': flipToInflict(10, 'asleep') },
  // Quagsire
  'neo3-48': { Whirlpool: discardDefenderEnergy(40) },
  // Qwilfish
  'neo3-49': { 'Poison Sting': flipToInflict(10, 'poisoned'), 'Needle Storm': { run: (ctx) => void ctx.hit(20 * headsUntilTails(ctx)) } },
  // Remoraid
  'neo3-50': {
    Sharpshooting: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to (if heads)"),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Sharpshooting did nothing.');
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 20);
      },
    },
  },
  // Shuckle: 20 Poison damage between turns, even if it was already Poisoned.
  'neo3-51': {
    'Toxic Saliva': {
      run(ctx) {
        if (ctx.flip()) ctx.inflict('toxic');
        else ctx.log('Toxic Saliva did nothing.');
      },
    },
  },
  // Skiploom
  'neo3-52': { 'Mysterious Powder': flipToInflict(10, 'confused') },
  // Slugma
  'neo3-53': { 'Magma Ring': noRetreat(20) },
  // Smoochum
  'neo3-54': {
    Psykiss: {
      choices(s, c): ChoiceSpec[] {
        const options = targetsIn(s.defender, s.opponentBench).filter((t) => specialEnergy(s.cards, pokemonOn(s.defender, s.opponentBench, t)!).length);
        if (!options.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'opponentPokemon', options, prompt: "Choose one of your opponent's Pokémon with a Special Energy card attached (on heads)" }];
        if (c.oppTarget === undefined) return specs;
        return [...specs, { kind: 'pokemonEnergy', options: specialEnergy(s.cards, pokemonOn(s.defender, s.opponentBench, c.oppTarget)!), prompt: 'Choose the Special Energy card' }];
      },
      run(ctx) {
        const t = ctx.choices.oppTarget;
        if (t === undefined) return ctx.log('Your opponent has no Special Energy cards attached.');
        if (!ctx.flip()) return ctx.log('Psykiss did nothing.');
        const p = pokemonOn(ctx.opp.active, ctx.opp.bench, t)!;
        const energy = p.energy.find((e) => e.uid === ctx.choices.oppEnergyUid);
        if (!energy || !(t === 'active' ? reachesDefender(ctx) : ctx.canAffect(ctx.opp, p))) return;
        if (energyProtected(ctx.state.cards, p)) return ctx.log(`Brock's Protection: ${pokemonName(ctx.state, p)}'s Energy can't be removed.`, ctx.opp.id);
        p.energy = p.energy.filter((e) => e !== energy);
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, energy], ctx.state.rngState);
        ctx.log(`Shuffled ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, p)} into the deck.`, ctx.opp.id);
      },
    },
  },
  // Snubbull
  'neo3-55': { 'Raging Headbutt': { run: (ctx) => (ctx.flip() ? rage(10).run(ctx) : void ctx.hit(10)) } },
  // Staryu
  'neo3-56': { Bubblebeam: flipToInflict(10, 'paralyzed') },
  // Swinub
  'neo3-57': { 'Take Down': recoil(30, 10) },
  // Unown K
  'neo3-58': { 'Hidden Power': hiddenPower },
  // Zubat
  'neo3-59': { 'Poison Spray': inflicts(0, 'poisoned') },
  // Shining Gyarados
  'neo3-65': {
    Outrage: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Outrage did nothing.');
        rage(30).run(ctx);
      },
    },
    Devastate: {
      text: "Discard 2 Fire Energy cards attached to Shining Gyarados or this attack does nothing. This attack does 10 damage to each of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.) Then, flip a coin. If heads, choose 1 Energy card attached to each of your opponent's Pokémon that has any Energy cards attached to it and discard those Energy cards.",
      discard: { count: 2, type: 'fire' },
      run(ctx) {
        ctx.hit(50);
        ctx.benchDamage(ctx.opp, 10);
        if (!ctx.flip()) return;
        const alive = (p: InPlayPokemon) => p.damage < inPlayDef(ctx.state.cards, p).hp;
        discardFromEach(ctx, targetsIn(ctx.opp.active, ctx.opp.bench).filter((t) => alive(pokemonOn(ctx.opp.active, ctx.opp.bench, t)!)), 'Devastate');
      },
    },
  },
  // Shining Magikarp
  'neo3-66': {
    'Gold Scale': {
      run(ctx) {
        // The opponent first, then the attacking player; each may draw 2 cards or none.
        ctx.opponentChooses({ kind: 'drawCount', source: 'Gold Scale', max: 2, allOrNone: true });
        (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Gold Scale', kind: 'drawCount', max: 2, allOrNone: true });
      },
    },
    'Dragon Bond': {
      run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Dragon Bond', filter: 'named', name: ['Gyarados', 'Dark Gyarados', 'Shining Gyarados'], reveal: true }),
    },
  },
};
