// Promo cards' attack effects, by card id and attack name: Wizards Black Star Promos (basep) and the
// Japanese-only Pokémon Web Electrode (pkweb-26, a hand-made catalog card: packages/db/prisma/data/custom-cards.json).
// Where TCGdex's text differs from the printed card (it drops energy icons), `text` has the printed wording.
// Rulings (agreed): Energy Absorption works like Energy Conversion: it needs an Energy card in the
// discard pile and takes 1 or 2. It's never your birthday (___________'s Pikachu). Lightning Bolt does 20
// instead of 10 to a Defending Pokémon with a Lightning Rod marker, and 20 to each marked benched one, all
// with Weakness and Resistance. Marill's Water Gun counts any Energy (the printed text names no type).
// "Your opponent chooses" (Cat Punch, Rapid Spin, Fling): they pick the benched Pokémon once the attack is over.
import { benchShielded, discardOptions, pokemonOn, targetsIn, typeName, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { energyPool, type InPlayPokemon, type Target } from '../engine.js';
import { baseUid, clearOnLeavingActive, effectId, inPlayDef, pokemonName } from '../status.js';
import {
  benchedSlots,
  benchSearch,
  discardToUse,
  flipToInflict,
  flipToProtect,
  headsUntilTails,
  inflicts,
  opponentBenchChoice,
  opponentSwitches,
  perHeads,
  recoil,
} from './common.js';
import { attackEffect } from './index.js';
import { cantAttackMe, flipForMore, pounce } from './jungle.js';

/** Energy cards in the attacking player's discard pile. */
const discardEnergy = (s: AttackSituation) => s.ownDiscard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');

/** Types that can be chosen "other than Colorless" (Texture Magic, Paint). */
const TYPES: EnergyType[] = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal'];

/** Mewtwo's Energy Absorption: attach up to 2 Energy cards from your discard pile to Mewtwo. */
const energyAbsorption: AttackEffect = {
  blocked: (s) => (discardEnergy(s).length ? null : 'There are no Energy cards in your discard pile'),
  choices: (s): ChoiceSpec[] => [
    { kind: 'ownDiscard', min: 1, max: 2, options: discardEnergy(s), prompt: 'Choose up to 2 Energy cards from your discard pile to attach to Mewtwo' },
  ],
  run(ctx) {
    const uids = new Set(ctx.choices.discardUids ?? []);
    const taken = ctx.me.discard.filter((c) => uids.has(c.uid));
    ctx.me.discard = ctx.me.discard.filter((c) => !uids.has(c.uid));
    ctx.attacker.energy.push(...taken);
    ctx.log(`Attached ${taken.length} Energy card${taken.length === 1 ? '' : 's'} from the discard pile to ${ctx.attackerDef.name}.`);
  },
};

/** Base damage, or nothing on tails (Supersonic Flight). */
const flipOrNothing = (damage: number): AttackEffect => ({
  run(ctx) {
    if (ctx.flip()) ctx.hit(damage);
    else ctx.log('The attack did nothing.');
  },
});

/** Base damage plus `step` for each heads, flipping until tails (Metal Pincer); `0` base = `step` × heads (Repeating Kick). */
const untilTails = (damage: number, step: number): AttackEffect => ({
  run: (ctx) => void ctx.hit(damage + step * headsUntilTails(ctx)),
});

/** Choose 1 of the opponent's benched Pokémon; on heads, `damage` to it (Jump Over). */
const flipBenchTarget = (damage: number): AttackEffect => ({
  choices: (s) => opponentBenchChoice(s, `Choose one of your opponent's benched Pokémon (heads: ${damage} damage to it)`),
  run(ctx) {
    const slot = ctx.choices.benchSlot;
    if (slot === undefined) return ctx.log('Your opponent has no benched Pokémon.');
    if (ctx.flip()) ctx.damageBenched(ctx.opp, slot, damage);
    else ctx.log('The attack did nothing.');
  },
});

/** Headache: the opponent can't play Trainer cards during their next turn. */
const headache: AttackEffect = {
  run(ctx) {
    ctx.opp.noTrainersUntil = ctx.turn + 1;
    ctx.log("The opponent can't play Trainer cards next turn.");
  },
};

/** Any of the opponent's Pokémon in play. */
const opponentTargets = (s: AttackSituation) => targetsIn(s.defender, s.opponentBench);

/** Basic Energy cards attached to a Pokémon (Energy Control moves these; not a Buzzap'd Electrode). */
const basicEnergyOn = (s: AttackSituation, p: InPlayPokemon) => p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId)));

/** Mewtwo's Energy Control: on heads, move a basic Energy card from one of the opponent's Pokémon to another of theirs. */
const energyControl: AttackEffect = {
  choices(s, c): ChoiceSpec[] {
    const targets = opponentTargets(s);
    const from = targets.filter((t) => basicEnergyOn(s, pokemonOn(s.defender, s.opponentBench, t)!).length);
    if (targets.length < 2 || !from.length) return [];
    const specs: ChoiceSpec[] = [{ kind: 'opponentPokemon', options: from, prompt: "Choose one of your opponent's Pokémon to move a basic Energy card from (on heads)" }];
    if (c.oppTarget === undefined) return specs;
    const source = pokemonOn(s.defender, s.opponentBench, c.oppTarget)!;
    return [
      ...specs,
      { kind: 'pokemonEnergy', options: basicEnergyOn(s, source), prompt: 'Choose the basic Energy card to move' },
      { kind: 'opponentPokemonTo', options: targets.filter((t) => t !== c.oppTarget), prompt: "Choose another of your opponent's Pokémon to attach it to" },
    ];
  },
  run(ctx) {
    if (!ctx.flip()) return ctx.log('Energy Control did nothing.');
    const { oppTarget, oppTo, oppEnergyUid } = ctx.choices;
    if (oppTarget === undefined || oppTo === undefined) return ctx.log('Energy Control had no Energy to move.');
    const from = pokemonOn(ctx.opp.active, ctx.opp.bench, oppTarget)!;
    const to = pokemonOn(ctx.opp.active, ctx.opp.bench, oppTo)!;
    if (!ctx.canAffect(ctx.opp, from) || !ctx.canAffect(ctx.opp, to)) return;
    const energy = from.energy.find((e) => e.uid === oppEnergyUid)!;
    from.energy = from.energy.filter((e) => e !== energy);
    to.energy.push(energy);
    ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
  },
};

/** Any Evolved Pokémon in play on a side (Devolution Beam). */
const evolvedTargets = (active: InPlayPokemon | null, bench: (InPlayPokemon | null)[]) =>
  targetsIn(active, bench).filter((t) => pokemonOn(active, bench, t)!.evolvedFrom.length > 0);

/**
 * Mew's Devolution Beam: return the highest Stage Evolution card on an Evolved Pokémon (either player's) to
 * its owner's hand. Its Special Conditions and the effects of attacks on it end, as if it had evolved.
 */
const devolutionBeam: AttackEffect = {
  choices(s, c): ChoiceSpec[] {
    const own = evolvedTargets(s.attacker, s.ownBench);
    const opp = evolvedTargets(s.defender, s.opponentBench);
    const sides = [...(own.length ? (['own'] as const) : []), ...(opp.length ? (['opponent'] as const) : [])];
    if (!sides.length) return [];
    const side = c.side ?? (sides.length === 1 ? sides[0] : undefined);
    const specs: ChoiceSpec[] = sides.length > 1 ? [{ kind: 'side', options: [...sides], prompt: "Choose whose Evolved Pokémon to devolve" }] : [];
    if (side === 'own') specs.push({ kind: 'ownPokemon', options: own, prompt: 'Choose one of your Evolved Pokémon to devolve' });
    if (side === 'opponent') specs.push({ kind: 'opponentPokemon', options: opp, prompt: "Choose one of your opponent's Evolved Pokémon to devolve" });
    return specs;
  },
  run(ctx) {
    const { ownTarget, oppTarget } = ctx.choices;
    const owner = ownTarget !== undefined ? ctx.me : ctx.opp;
    const target: Target | undefined = ownTarget ?? oppTarget;
    if (target === undefined) return ctx.log('There was no Evolved Pokémon to devolve.');
    const p = pokemonOn(owner.active, owner.bench, target)!;
    if (owner === ctx.opp && !ctx.canAffect(ctx.opp, p)) return;
    const top = p.card;
    p.card = p.evolvedFrom.pop()!;
    owner.hand.push(top);
    clearOnLeavingActive(p);
    ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} returned to the hand; it's ${pokemonName(ctx.state, p)} again.`, owner.id);
  },
};

/** Togepi's Mini-Metronome: on heads, copy one of the Defending Pokémon's attacks except for its Energy cost. */
const miniMetronome: AttackEffect = {
  text: "Flip a coin. If heads, choose 1 of the Defending Pokémon's attacks. Mini-Metronome copies that attack except for its Energy cost. (You must still do anything else in order to use that attack.) (No matter what type the Defending Pokémon is, Togepi's type is still Colorless.) Togepi performs that attack.",
  choices(s, c) {
    const attacks = inPlayDef(s.cards, s.defender).attacks;
    const options = attacks.flatMap((a, i) => (a.name === 'Mini-Metronome' || a.name === 'Metronome' ? [] : [i]));
    if (!options.length) return [];
    const specs: ChoiceSpec[] = [{ kind: 'copyAttack', options, prompt: "Choose one of the Defending Pokémon's attacks to copy (on heads)" }];
    const copied = c.copyIndex !== undefined ? attacks[c.copyIndex] : undefined;
    const effect = copied && attackEffect(effectId(s.defender), copied.name);
    // Unlike Metronome, anything else the attack needs still has to be done, its discard included.
    const discard = effect?.discard;
    if (discard && discard.count !== 'all') {
      const energy = discardOptions(s, discard.type);
      if (energy.length >= discard.count) {
        specs.push({ kind: 'ownEnergy', count: discard.count, options: energy, prompt: `Choose ${discard.count} ${discard.type ? `${typeName(discard.type)} ` : ''}Energy to discard` });
      }
    }
    if (effect?.choices) specs.push(...effect.choices(s, c));
    return specs;
  },
  run(ctx) {
    const sourceDefId = effectId(ctx.defender);
    const copied = ctx.choices.copyIndex !== undefined ? ctx.defenderDef.attacks[ctx.choices.copyIndex] : undefined;
    if (!copied) return ctx.log('Mini-Metronome had nothing to copy.');
    if (!ctx.flip()) return ctx.log('Mini-Metronome did nothing.');
    const effect = attackEffect(sourceDefId, copied.name);
    const situation: AttackSituation = {
      attacker: ctx.attacker,
      defender: ctx.defender,
      opponentBench: ctx.opp.bench,
      ownBench: ctx.me.bench,
      ownDiscard: ctx.me.discard,
      cards: ctx.state.cards,
      turn: ctx.turn,
    };
    const discard = effect?.discard;
    const blocked = effect?.blocked?.(situation) ?? (discard && discard.count !== 'all' && !ctx.choices.energyUids?.length ? `${copied.name} needs Energy to discard` : null);
    if (blocked) return ctx.log(`Mini-Metronome couldn't copy ${copied.name}: ${blocked}.`);
    ctx.log(`Mini-Metronome copies ${copied.name}.`);
    if (discard) {
      const uids = new Set(discard.count === 'all' ? ctx.attacker.energy.map((e) => e.uid) : ctx.choices.energyUids);
      ctx.me.discard.push(...ctx.attacker.energy.filter((e) => uids.has(e.uid)));
      ctx.attacker.energy = ctx.attacker.energy.filter((e) => !uids.has(e.uid));
      ctx.log(`${ctx.attackerDef.name} discarded ${uids.size} Energy.`);
    }
    ctx.useAttack(copied, sourceDefId);
  },
};

/** Basic Fire Energy cards attached to the attacking player's Pokémon (Burning Fire). */
const fireEnergyInPlay = (s: AttackSituation) =>
  [s.attacker, ...s.ownBench].flatMap((p) => p?.energy ?? []).filter((e) => {
    const d = lookupCard(s.cards, e.defId);
    return !e.provides && d.kind === 'energy' && d.energyType === 'fire' && d.basic !== false;
  });

/** The Pokémon with a Lightning Rod marker take 20 (the Defending Pokémon 20 instead of 10), all with Weakness and Resistance. */
const lightningBolt: AttackEffect = {
  run(ctx) {
    ctx.hit(ctx.defender.lightningRod ? 20 : 10);
    for (const slot of benchedSlots(ctx.opp.bench)) {
      if (ctx.opp.bench[slot]!.lightningRod) ctx.damageBenched(ctx.opp, slot, 20, { weakness: true });
    }
  },
};

const quickAttack = flipForMore(10, 20);
const thundershock = (damage: number) => flipToInflict(damage, 'paralyzed');
const psywave: AttackEffect = { run: (ctx) => void ctx.hit(10 * ctx.defender.energy.length) };
const mew = { Psywave: psywave, 'Devolution Beam': devolutionBeam };

export const PROMOS: Record<string, Record<string, AttackEffect>> = {
  // Pikachu (Wizards Promo 1)
  'basep-1': {
    // The Defending Pokémon's attacks on Pikachu next turn do 10 less, after Weakness and Resistance.
    Growl: pounce(0, 10),
    Thundershock: thundershock(20),
  },
  // Electabuzz (Wizards Promo 2)
  'basep-2': {
    'Light Screen': {
      run(ctx) {
        ctx.protect('lightScreen');
        ctx.log(`Attacks do half damage to ${ctx.attackerDef.name} next turn.`);
      },
    },
    'Quick Attack': quickAttack,
  },
  // Mewtwo (Wizards Promo 3, and its reprint 14)
  'basep-3': { 'Energy Absorption': energyAbsorption },
  'basep-14': { 'Energy Absorption': energyAbsorption },
  // Pikachu (Wizards Promo 4)
  'basep-4': {
    Recharge: {
      text: 'Search your deck for a Lightning Energy card and attach it to Pikachu. Shuffle your deck afterward.',
      run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Recharge', filter: 'energyType', type: 'lightning', attachToActive: true }),
    },
    Thunderbolt: discardToUse(50, 'all', undefined),
  },
  // Dragonite (Wizards Promo 5)
  'basep-5': { 'Supersonic Flight': flipOrNothing(60) },
  // Arcanine (Wizards Promo 6)
  'basep-6': {
    'Quick Attack': quickAttack,
    'Flames of Rage': {
      text: 'Discard 2 Fire Energy cards attached to Arcanine in order to use this attack. This attack does 40 damage plus 10 more damage for each damage counter on Arcanine.',
      discard: { count: 2, type: 'fire' },
      run: (ctx) => void ctx.hit(40 + ctx.attacker.damage),
    },
  },
  // Jigglypuff (Wizards Promo 7)
  'basep-7': { 'First Aid': { run: (ctx) => ctx.heal(10) }, 'Double-Edge': recoil(40, 20) },
  // Mew (Wizards Promo 8, and 9)
  'basep-8': mew,
  'basep-9': mew,
  // Meowth (Wizards Promo 10)
  'basep-10': {
    'Cat Punch': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(20);
        const slots = benchedSlots(ctx.opp.bench);
        if (!slots.length) return ctx.log('Cat Punch did nothing.');
        // The opponent chooses which benched Pokémon takes it, once the attack is over (none to choose from with one).
        const shield = benchShielded(ctx.opp, ctx.state.cards, [ctx.me, ctx.opp], ctx.turn);
        if (slots.length === 1 || shield) return ctx.damageBenched(ctx.opp, slots[0]!, 20);
        ctx.opponentChooses({ kind: 'benchDamage', source: 'Cat Punch', amount: 20 });
      },
    },
  },
  // Mewtwo (Wizards Promo 12)
  'basep-12': {
    'Energy Control': energyControl,
    Telekinesis: {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: opponentTargets(s), prompt: "Choose one of your opponent's Pokémon to do 30 damage to" }],
      run(ctx) {
        const target = ctx.choices.oppTarget ?? 'active';
        if (target === 'active') ctx.hit(30, { weakness: false });
        else ctx.damageBenched(ctx.opp, target, 30);
      },
    },
  },
  // Venusaur (Wizards Promo 13): half the damage done, rounded up to the nearest 10.
  'basep-13': { 'Mega Drain': { run: (ctx) => ctx.heal(Math.ceil(ctx.hit(40) / 20) * 10) } },
  // Cool Porygon (Wizards Promo 15)
  'basep-15': {
    'Texture Magic': {
      // "You may" change them: choosing the type it already has changes nothing.
      choices(s): ChoiceSpec[] {
        const specs: ChoiceSpec[] = [{ kind: 'type', options: TYPES, prompt: "Choose Cool Porygon's Resistance" }];
        if (inPlayDef(s.cards, s.defender).weakness) specs.push({ kind: 'weaknessType', options: TYPES, prompt: "Choose the Defending Pokémon's Weakness" });
        return specs;
      },
      run(ctx) {
        const { type, weaknessType } = ctx.choices;
        if (type) {
          (ctx.attacker.effects ??= {}).resistance = type;
          ctx.log(`${ctx.attackerDef.name}'s Resistance is now ${typeName(type)}.`);
        }
        if (weaknessType && ctx.defenderDef.weakness) {
          ctx.affectDefender((e) => {
            e.weakness = weaknessType;
            ctx.log(`${ctx.defenderDef.name}'s Weakness is now ${typeName(weaknessType)}.`);
          });
        }
      },
    },
    '3-D Attack': perHeads(3, 20),
  },
  // Dark Persian (Wizards Promo 17)
  'basep-17': {
    Tempt: {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to switch in (on heads)"),
      run(ctx) {
        if (ctx.choices.benchSlot === undefined) return ctx.log('Your opponent has no benched Pokémon.');
        if (ctx.flip()) ctx.switchDefender(ctx.choices.benchSlot);
        else ctx.log('Tempt did nothing.');
      },
    },
    'Poison Claws': { ...flipToInflict(10, 'poisoned'), damage: '10' },
  },
  // Team Rocket's Meowth (Wizards Promo 18)
  'basep-18': {
    'Miraculous Comeback': {
      run(ctx) {
        const inPlay = [ctx.me, ctx.opp].reduce((n, p) => n + targetsIn(p.active, p.bench).length, 0);
        const heads = ctx.flips(inPlay);
        ctx.hit(10 * heads);
        if (inPlay > heads) ctx.selfDamage(10 * (inPlay - heads));
      },
    },
  },
  // Sabrina's Abra (Wizards Promo 19)
  'basep-19': {
    Synchronize: {
      blocked: (s) => (s.attacker.energy.length === s.defender.energy.length ? null : 'Sabrina\'s Abra and the Defending Pokémon must have the same number of Energy cards'),
      run: (ctx) => void ctx.hit(40),
    },
  },
  // Psyduck (Wizards Promo 20)
  'basep-20': { Headache: headache, 'Fury Swipes': perHeads(3, 10) },
  // Moltres (Wizards Promo 21)
  'basep-21': {
    'Hyper Flame': {
      text: "Flip a coin. If heads, discard 1 Fire Energy card attached to Moltres. If tails, discard all Energy cards attached to Moltres. If you can't discard Energy cards, this attack does nothing.",
      run(ctx) {
        const fire = ctx.attacker.energy.filter((e) => {
          const d = lookupCard(ctx.state.cards, e.defId);
          return !e.provides && d.kind === 'energy' && d.energyType === 'fire';
        });
        const gone = ctx.flip() ? fire.slice(0, 1) : ctx.attacker.energy;
        if (!gone.length) return ctx.log('Hyper Flame did nothing.');
        ctx.me.discard.push(...gone);
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !gone.includes(e));
        ctx.log(`${ctx.attackerDef.name} discarded ${gone.length} Energy.`);
        ctx.hit(60);
      },
    },
  },
  // Articuno (Wizards Promo 22)
  'basep-22': {
    'Diamond Dust': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.inflict('paralyzed');
        ctx.benchDamage(ctx.opp, 10);
      },
    },
  },
  // Zapdos (Wizards Promo 23)
  'basep-23': {
    'Lightning Burn': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon (heads: 30 damage to it)"),
      run(ctx) {
        ctx.hit(30);
        if (!ctx.flip()) return ctx.selfDamage(30);
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 30);
      },
    },
  },
  // ___________'s Pikachu (Wizards Promo 24): it's never your birthday.
  'basep-24': {
    'Birthday Surprise': {
      run(ctx) {
        ctx.log("It's not your birthday, liar");
        ctx.hit(30);
      },
    },
  },
  // Flying Pikachu (Wizards Promo 25)
  'basep-25': {
    Thundershock: thundershock(10),
    Fly: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Fly did nothing.');
        ctx.hit(30);
        ctx.protect('preventAll');
      },
    },
  },
  // Pikachu (Wizards Promo 26)
  'basep-26': { Thunderbolt: discardToUse(40, 'all', undefined) },
  // Pikachu (Wizards Promo 27)
  'basep-27': { Thundershock: thundershock(10), Agility: flipToProtect(20, 'preventAll') },
  // Marill (Wizards Promo 29): any Energy beyond the cost counts, at most 20 more damage.
  'basep-29': {
    'Water Gun': { run: (ctx) => void ctx.hit(20 + 10 * Math.min(2, Math.max(0, energyPool(ctx.attacker, ctx.state.cards).length - 2))) },
  },
  // Togepi (Wizards Promo 30)
  'basep-30': {
    // The Defending Pokémon's attacks on Togepi next turn do 20 less, before Weakness and Resistance.
    Snivel: {
      run(ctx) {
        const target = baseUid(ctx.attacker);
        ctx.affectDefender((e) => {
          e.pounce = { target, amount: 20, until: ctx.turn + 1, beforeWeakness: true };
          ctx.log(`${ctx.defenderDef.name}'s attacks on ${ctx.attackerDef.name} do 20 less damage next turn.`);
        });
      },
    },
    'Mini-Metronome': miniMetronome,
  },
  // Cleffa (Wizards Promo 31)
  'basep-31': { Eek: { run: (ctx) => ctx.draw(2) } },
  // Smeargle (Wizards Promo 32)
  'basep-32': {
    Paint: {
      choices: (): ChoiceSpec[] => [{ kind: 'type', options: TYPES, prompt: 'Choose the Defending Pokémon\'s new type (on heads)' }],
      run(ctx) {
        const type = ctx.choices.type;
        if (!type || !ctx.flip()) return ctx.log('Paint did nothing.');
        // A Coloring counter: the Pokémon is that type until it leaves play (a new counter replaces the old one).
        ctx.affectDefender(() => {
          ctx.defender.shiftedType = type;
          ctx.log(`${ctx.defenderDef.name} has a Coloring counter: it's ${typeName(type)} type now.`, ctx.opp.id);
        });
      },
    },
  },
  // Scizor (Wizards Promo 33)
  'basep-33': { Leer: cantAttackMe, 'Metal Pincer': untilTails(30, 10) },
  // Entei (Wizards Promo 34)
  'basep-34': {
    'Protective Flame': {
      run(ctx) {
        ctx.hit(50);
        ctx.me.benchProtectedUntil = ctx.turn + 1;
        ctx.log("Attacks can't affect the Benched Pokémon next turn.");
      },
    },
  },
  // Pichu (Wizards Promo 35)
  'basep-35': { "Let's Play!": benchSearch("Let's Play!", { filter: 'baby' }) },
  // Igglybuff (Wizards Promo 36)
  'basep-36': { 'Good Night Song': inflicts(0, 'asleep') },
  // Hitmontop (Wizards Promo 37)
  'basep-37': {
    'Repeating Kick': untilTails(0, 20),
    'Rapid Spin': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your benched Pokémon to switch with Hitmontop' }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        opponentSwitches(ctx, 'Rapid Spin');
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
  },
  // Misdreavus (Wizards Promo 39)
  'basep-39': {
    // Damage counters, not damage: Weakness, Resistance and damage prevention don't apply.
    'Pain Split': {
      run(ctx) {
        const counters = ctx.attacker.damage / 10;
        if (!counters) return ctx.log('Misdreavus has no damage counters.');
        ctx.affectDefender(() => {
          ctx.defender.damage += 10 * counters;
          ctx.log(`Put ${counters} damage counter${counters === 1 ? '' : 's'} on ${ctx.defenderDef.name}.`, ctx.opp.id);
        });
      },
    },
    'Confuse Ray': flipToInflict(10, 'confused'),
  },
  // Machamp (Wizards Promo 43)
  'basep-43': {
    'Seething Anger': { run: (ctx) => void ctx.hit(20 + 10 * ctx.flips(ctx.attacker.damage / 10)) },
    Fling: {
      run(ctx) {
        ctx.hit(50);
        opponentSwitches(ctx, 'Fling');
      },
    },
  },
  // Magmar (Wizards Promo 44)
  'basep-44': {
    'Burning Fire': {
      text: 'When you use this attack, you may discard any number of Fire Energy cards attached to your Pokémon in play. This attack does 10 damage plus 10 more damage for each Fire Energy card you discarded in this way.',
      choices(s): ChoiceSpec[] {
        const options = fireEnergyInPlay(s);
        return options.length ? [{ kind: 'ownEnergyUpTo', options, prompt: 'Choose any number of Fire Energy cards on your Pokémon to discard (10 more damage each)' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        for (const p of [ctx.me.active, ...ctx.me.bench]) {
          if (!p) continue;
          ctx.me.discard.push(...p.energy.filter((e) => uids.has(e.uid)));
          p.energy = p.energy.filter((e) => !uids.has(e.uid));
        }
        if (uids.size) ctx.log(`Discarded ${uids.size} Fire Energy card${uids.size === 1 ? '' : 's'}.`);
        ctx.hit(10 + 10 * uids.size);
      },
    },
  },
  // Scyther (Wizards Promo 45): Slashing Strike can't be used during Scyther's next turn (benching it ends that).
  'basep-45': {
    'Slashing Strike': {
      run(ctx) {
        ctx.hit(40);
        (ctx.attacker.effects ??= {}).amnesia = { attack: 'Slashing Strike', until: ctx.turn + 2 };
      },
    },
  },
  // Electabuzz (Wizards Promo 46)
  'basep-46': {
    'Lightning Rod': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: opponentTargets(s), prompt: "Choose one of your opponent's Pokémon to put a Lightning Rod marker on" }],
      run(ctx) {
        const p = pokemonOn(ctx.opp.active, ctx.opp.bench, ctx.choices.oppTarget ?? 'active')!;
        if (!ctx.canAffect(ctx.opp, p)) return;
        p.lightningRod = true;
        ctx.log(`${pokemonName(ctx.state, p)} has a Lightning Rod marker.`, ctx.opp.id);
      },
    },
    'Lightning Bolt': lightningBolt,
  },
  // Mew (Wizards Promo 47)
  'basep-47': { Psyshock: flipToInflict(10, 'confused') },
  // Articuno (Wizards Promo 48)
  'basep-48': { 'Ice Beam': flipToInflict(30, 'paralyzed') },
  // Snorlax (Wizards Promo 49)
  'basep-49': {
    'Roll Over': {
      run(ctx) {
        ctx.hit(30);
        ctx.sleepSelf();
        if (ctx.flip()) ctx.inflict('asleep');
      },
    },
  },
  // Celebi (Wizards Promo 50)
  'basep-50': { 'Leaf Slice': perHeads(2, 20) },
  // Rapidash (Wizards Promo 51)
  'basep-51': { 'Jump Over': flipBenchTarget(20), 'Super Singe': flipToInflict(30, 'burned') },
  // Ho-oh (Wizards Promo 52)
  'basep-52': { 'Sacred Fire': { damage: '60', run: (ctx) => void ctx.hit(ctx.flip() ? 60 : 20) } },
  // Suicune (Wizards Promo 53)
  'basep-53': {
    'Hypno Wave': {
      run(ctx) {
        if (ctx.flip()) return void ctx.hit(50);
        ctx.hit(30);
        ctx.inflict('asleep');
      },
    },
  },
  // Electrode (Pokémon Web 26)
  'pkweb-26': {
    Sonicboom: { run: (ctx) => void ctx.hit(30, { weakness: false }) },
    // Search the deck for a basic Energy card, then pick the Pokémon to attach it to.
    'Energy Spike': { run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Energy Spike', filter: 'basicEnergy', attach: true }) },
  },
};
