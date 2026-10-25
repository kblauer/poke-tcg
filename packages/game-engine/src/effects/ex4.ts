// EX Team Magma vs Team Aqua (ex4) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts)
// don't play, and the Team Technical Machines' attacks (Miracle, Crushing Magma). Rulings follow the card text and the earlier
// EX sets' (ex1.ts, ex2.ts). Agreed with the user: a Pokémon printed as two types (Team Aqua's Cacturne: Grass and Darkness) is
// both (`types`, hasType); "has Team Aqua in its name" reads the name as printed; Aqua Trance and Slow-Acting Poison happen at
// the end of the opponent's next turn only to the Pokémon still Active then (`delayed`; benching or evolving it ends them);
// Team Play counts both players' Team Magma Pokémon; Bright Flame's 2 Energy count as provided (Double Colorless is 2).
// From the text: Hydro Reverse returns any basic Water Energy cards from the player's Pokémon; Crushing Wave's Energy card is
// discarded by the opponent's choice; Volcanic Ash discards 2 Fire Energy cards first.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { isBasicEnergy, lookupCard } from '../cards.js';
import { energyProvided, isEnergyCardOf, type CardInstance, type Target } from '../engine.js';
import { pokemonAt } from '../powers.js';
import { clearSpecialConditions, devolvable, openBenchSlot, pokemonName } from '../status.js';
import { benchedSlots, energyCanMove, opponentSwitches } from './common.js';
import { discardDefenderTrainers } from './ecard2.js';
import { typedCards } from './ecard1.js';
import { energyAmount } from './ex1.js';
import { devolve, discardOwn, inPlay, mayDiscardFor, putCounters } from './ex2.js';
import { healUpTo } from './si1.js';

/** A basic Energy card. */
const basic = (ctx: Pick<AttackContext, 'state'>, c: CardInstance) => !c.provides && isBasicEnergy(lookupCard(ctx.state.cards, c.defId));

/** The attacker's Energy cards the player may pick. */
const ownCards = (s: Parameters<NonNullable<AttackEffect['choices']>>[0]) => s.attacker.energy.filter((e) => !e.provides);

/** Base damage, then `then` if `when` holds (Shoot Down, Deep Impact…). */
const thenIf = (damage: number, when: (ctx: AttackContext) => boolean, then: (ctx: AttackContext) => void): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (when(ctx)) then(ctx);
  },
});

/** Base damage, then `more` if `when` holds (Poison Reaction, Roasting Heat…). */
const moreIf = (base: number, more: number, when: (ctx: AttackContext) => boolean): AttackEffect => ({ run: (ctx) => void ctx.hit(when(ctx) ? base + more : base) });

/** Aqua Trance, Slow-Acting Poison: at the end of the opponent's next turn, the Defending Pokémon is now Asleep or Poisoned. */
export const delayed = (damage: number, affliction: 'asleep' | 'poisoned'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.delayed = { affliction, turn: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name} will be ${affliction === 'asleep' ? 'Asleep' : 'Poisoned'} at the end of the next turn.`, ctx.opp.id);
    });
  },
});

/** The Defending Pokémon's name has `team` in it (Team Aqua, Team Magma), as printed. */
const isTeam = (ctx: AttackContext, team: string) => ctx.defenderDef.name.includes(team);

/** Knock Over: the player may discard the Stadium in play (to its owner's discard pile). */
export const knockOver = (damage: number): AttackEffect => ({
  choices: (s): ChoiceSpec[] => (s.stadium ? [{ kind: 'boost', options: [true, false], prompt: 'Discard the Stadium card in play?' }] : []),
  run(ctx) {
    ctx.hit(damage);
    const stadium = ctx.state.stadium;
    if (!ctx.choices.boost || !stadium) return;
    ctx.state.players[stadium.owner]!.discard.push(stadium.card);
    ctx.state.stadium = null;
    ctx.log(`Discarded ${lookupCard(ctx.state.cards, stadium.card.defId).name}.`);
  },
});

/** Call for Family: a Basic Pokémon of `type` or with `team` in its name from the deck onto the Bench. */
const teamFamily = (type: 'grass' | 'colorless', team: string): AttackEffect => ({
  blocked: (s) => (openBenchSlot(s.ownBench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
  run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicTypeOrOwner', type, name: team, toBench: true, optional: true })),
});

/** "You may discard an Energy card … If tails, discard an Energy card": the player picks it before the flip. */
const tailsDiscard = (damage: number): AttackEffect => ({
  choices: (s): ChoiceSpec[] => (ownCards(s).length ? [{ kind: 'ownEnergy', count: 1, options: ownCards(s), prompt: 'Choose an Energy card to discard (if tails)' }] : []),
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.flip()) discardOwn(ctx, ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid)));
  },
});

/** Damage counters on the opponent's Pokémon the player picks (Psymist, Clay Curse, Night Attack), not on those the attack can't affect. */
export function counterPicks(ctx: AttackContext, source: string, count: number) {
  const skip = inPlay(ctx.opp).filter((p) => !ctx.canAffect(ctx.opp, p)).map((p) => p.card.uid);
  if (count > 0 && inPlay(ctx.opp).length > skip.length) ctx.pend({ kind: 'placeCounters', source, count, active: true, skip });
}

export const EX4: Record<string, Record<string, AttackEffect>> = {
  // Team Aqua's Cacturne – Dark Bind.
  'ex4-1': { 'Dark Bind': mayDiscardFor(10, 'darkness', (ctx) => ctx.inflict('paralyzed')) },
  // Team Aqua's Crawdaunt – Aqua Reverse: a Benched Team Magma Pokémon may be switched in first; Deep Impact: Confused if damaged before.
  'ex4-2': {
    'Aqua Reverse': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench).filter((i) => lookupCard(s.cards, s.opponentBench[i]!.card.defId).name.includes('Team Magma'));
        return options.length ? [{ kind: 'opponentBench', options: [-1, ...options], optional: true, prompt: "You may choose one of your opponent's Benched Pokémon with Team Magma in its name to switch in" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot !== undefined && slot >= 0) ctx.switchDefender(slot);
        ctx.hit(20);
      },
    },
    'Deep Impact': {
      run(ctx) {
        const damaged = ctx.defender.damage > 0;
        ctx.hit(40);
        if (damaged) ctx.inflict('confused');
      },
    },
  },
  // Team Aqua's Manectric – Thunderspark: 10 to each Benched Pokémon with Energy cards attached, both players'.
  'ex4-4': {
    Thunderspark: {
      run(ctx) {
        ctx.hit(50);
        for (const side of [ctx.opp, ctx.me]) side.bench.forEach((p, i) => p && p.energy.length && ctx.damageBenched(side, i, 10));
      },
    },
  },
  // Team Aqua's Walrein – Hydro Reverse: basic Water Energy cards from the player's Pokémon back to the hand, 10 more each.
  'ex4-6': {
    'Hydro Reverse': {
      choices(s): ChoiceSpec[] {
        const water = [s.attacker, ...s.ownBench].flatMap((p) => (p ? p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId)) && isEnergyCardOf(e, s.cards, 'water')) : []));
        return water.length ? [{ kind: 'ownEnergyAny', options: water, prompt: 'Choose any basic Water Energy cards to return to your hand (10 more damage each)' }] : [];
      },
      run(ctx) {
        const uids = new Set(ctx.choices.energyUids ?? []);
        let returned = 0;
        for (const p of inPlay(ctx.me)) {
          const back = p.energy.filter((e) => uids.has(e.uid));
          p.energy = p.energy.filter((e) => !uids.has(e.uid));
          ctx.me.hand.push(...back);
          returned += back.length;
        }
        if (returned) ctx.log(`Returned ${returned} Water Energy card${returned === 1 ? '' : 's'} to the hand.`);
        ctx.hit(50 + 10 * returned);
      },
    },
  },
  // Team Magma's Aggron – Land Stream: any basic Energy cards discarded, 20 more each.
  'ex4-7': {
    'Land Stream': {
      choices(s): ChoiceSpec[] {
        const basics = ownCards(s).filter((e) => isBasicEnergy(lookupCard(s.cards, e.defId)));
        return basics.length ? [{ kind: 'ownEnergyUpTo', options: basics, prompt: 'Choose any basic Energy cards to discard (20 more damage each)' }] : [];
      },
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid) && basic(ctx, e));
        discardOwn(ctx, gone);
        ctx.hit(50 + 20 * gone.length);
      },
    },
  },
  // Team Magma's Claydol – Dark Hand: 20 more with more cards in the hand than the opponent.
  'ex4-8': { 'Dark Hand': moreIf(40, 20, (ctx) => ctx.me.hand.length > ctx.opp.hand.length) },
  // Team Magma's Houndoom – Roasting Heat: 20 more if Burned; Magma Spurt: the top 5 cards discarded, 30 for each Fire or Fighting basic Energy card.
  'ex4-10': {
    'Roasting Heat': moreIf(30, 20, (ctx) => !!ctx.defender.burned),
    'Magma Spurt': {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 5);
        ctx.me.discard.push(...top);
        ctx.log(`Discarded the top ${top.length} cards of the deck.`);
        const hits = top.filter((c) => basic(ctx, c) && (isEnergyCardOf(c, ctx.state.cards, 'fire') || isEnergyCardOf(c, ctx.state.cards, 'fighting'))).length;
        ctx.hit(30 * hits);
      },
    },
  },
  // Team Magma's Rhydon – Shoot Down: Confused if it has Team Aqua in its name.
  'ex4-11': { 'Shoot Down': thenIf(50, (ctx) => isTeam(ctx, 'Team Aqua'), (ctx) => ctx.inflict('confused')) },
  // Team Magma's Torkoal – Magma Burn: the top card of the opponent's deck discarded, and tails a Fire Energy discarded; Hot Air: a Fire Energy discarded and the opponent switches.
  'ex4-12': {
    'Magma Burn': {
      run(ctx) {
        ctx.hit(10);
        const [top] = ctx.opp.deck.splice(0, 1);
        if (top) {
          ctx.opp.discard.push(top);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`, ctx.opp.id);
        }
        if (!ctx.flip()) discardOwn(ctx, typedCards(ctx, 'fire').slice(0, 1));
      },
    },
    'Hot Air': {
      run(ctx) {
        ctx.hit(30);
        discardOwn(ctx, typedCards(ctx, 'fire').slice(0, 1));
        opponentSwitches(ctx, 'Hot Air');
      },
    },
  },
  // Raichu – Kerzap: heads, 40 more and all Lightning Energy cards discarded.
  'ex4-13': {
    Kerzap: {
      run(ctx) {
        if (!ctx.flip()) return void ctx.hit(40);
        ctx.hit(80);
        discardOwn(ctx, typedCards(ctx, 'lightning'));
      },
    },
  },
  // Team Aqua's Crawdaunt – Poison Reaction: 20 more if Poisoned.
  'ex4-14': { 'Poison Reaction': moreIf(20, 20, (ctx) => !!ctx.defender.poison) },
  // Team Aqua's Mightyena – Mystic Fang: Confused if it's a Pokémon-ex.
  'ex4-15': { 'Mystic Fang': thenIf(50, (ctx) => !!ctx.defenderDef.ex, (ctx) => ctx.inflict('confused')) },
  // Team Aqua's Sealeo – Aqua Trance; Super Hypnoblast: 20 more if Asleep.
  'ex4-16': { 'Aqua Trance': delayed(20, 'asleep'), 'Super Hypnoblast': moreIf(30, 20, (ctx) => ctx.defender.condition === 'asleep') },
  // Team Aqua's Seviper – Call for Family; Thick Poison: heads Confused and Poisoned, tails Poisoned.
  'ex4-17': {
    'Call for Family': teamFamily('grass', 'Team Aqua'),
    'Thick Poison': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.flip()) ctx.inflict('confused');
        ctx.inflict('poisoned');
      },
    },
  },
  // Team Aqua's Sharpedo – Slow-Acting Poison.
  'ex4-18': { 'Slow-Acting Poison': delayed(20, 'poisoned') },
  // Team Magma's Camerupt – Flame Ball: a Fire Energy card may move to a Benched Pokémon.
  'ex4-19': {
    'Flame Ball': {
      choices(s): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        const fire = ownCards(s).some((e) => isEnergyCardOf(e, s.cards, 'fire'));
        return bench.length && fire ? [{ kind: 'ownBench', options: [-1, ...bench], optional: true, prompt: 'You may choose one of your Benched Pokémon to move a Fire Energy card to' }] : [];
      },
      run(ctx) {
        ctx.hit(50);
        const slot = ctx.choices.ownBenchSlot;
        const to = slot !== undefined && slot >= 0 ? ctx.me.bench[slot] : null;
        const [fire] = typedCards(ctx, 'fire');
        if (!to || !fire) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== fire);
        to.energy.push(fire);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, fire.defId).name} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Team Magma's Rhydon – Land Crush: tails, an Energy card discarded.
  'ex4-22': { 'Land Crush': tailsDiscard(60) },
  // Team Magma's Zangoose – Call for Family; Team Play: 10 for each Team Magma Pokémon in play, both players' (agreed).
  'ex4-23': {
    'Call for Family': teamFamily('colorless', 'Team Magma'),
    'Team Play': { run: (ctx) => void ctx.hit(10 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].filter((p) => lookupCard(ctx.state.cards, p.card.defId).name.includes('Team Magma')).length) },
  },
  // Team Aqua's Carvanha, Team Aqua's Corphish – Slow-Acting Poison.
  'ex4-25': { 'Slow-Acting Poison': delayed(20, 'poisoned') },
  'ex4-51': { 'Slow-Acting Poison': delayed(10, 'poisoned') },
  // Team Aqua's Corphish – Dark Poison: a basic Energy card discarded or nothing, then Poisoned.
  'ex4-26': {
    'Dark Poison': {
      choices(s): ChoiceSpec[] {
        const basics = ownCards(s).filter((e) => isBasicEnergy(lookupCard(s.cards, e.defId)));
        return basics.length ? [{ kind: 'ownEnergy', count: 1, options: basics, prompt: 'Choose a basic Energy card to discard' }] : [];
      },
      run(ctx) {
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid) && basic(ctx, e));
        if (!card) return ctx.log('Dark Poison did nothing.');
        discardOwn(ctx, [card]);
        ctx.hit(20);
        ctx.inflict('poisoned');
      },
    },
  },
  // Team Aqua's Manectric – Aqua Beam: Confused if Team Magma; Chaos Crush: an Energy card discarded from a Confused Defending Pokémon.
  'ex4-29': {
    'Aqua Beam': thenIf(20, (ctx) => isTeam(ctx, 'Team Magma'), (ctx) => ctx.inflict('confused')),
    'Chaos Crush': {
      choices: (s): ChoiceSpec[] => (s.defender.condition === 'confused' && s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon' }] : []),
      run(ctx) {
        const confused = ctx.defender.condition === 'confused';
        ctx.hit(50);
        if (confused && ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Team Aqua's Mightyena – Aqua Call: up to 3 Pokémon with Team Aqua in their names from the deck, shown.
  'ex4-30': {
    'Aqua Call': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Aqua Call', filter: 'ownerPokemon', name: 'Team Aqua', reveal: true, optional: true, count: 3 })) },
  },
  // Team Aqua's Sealeo, Team Magma's Rhyhorn – Knock Over.
  'ex4-31': { 'Knock Over': knockOver(40) },
  'ex4-68': { 'Knock Over': knockOver(10) },
  // Team Magma's Baltoy – Psymist: a damage counter on the chosen Pokémon for each heads; Pain Amplifier: one on each damaged Pokémon.
  'ex4-32': {
    Psymist: { run: (ctx) => counterPicks(ctx, 'Psymist', ctx.flips(2)) },
    'Pain Amplifier': { run: (ctx) => inPlay(ctx.opp).filter((p) => p.damage > 0).forEach((p) => putCounters(ctx, ctx.opp, p, 1)) },
  },
  // Team Magma's Claydol – Clay Curse: 2 damage counters as the player likes; Clay Pulse: 10 to each damaged Benched Pokémon.
  'ex4-33': {
    'Clay Curse': { run: (ctx) => counterPicks(ctx, 'Clay Curse', 2) },
    'Clay Pulse': {
      run(ctx) {
        const damaged = benchedSlots(ctx.opp.bench).filter((i) => ctx.opp.bench[i]!.damage > 0);
        ctx.hit(50);
        for (const i of damaged) ctx.damageBenched(ctx.opp, i, 10);
      },
    },
  },
  // Team Magma's Houndoom – Target Scorch: Burned if Team Aqua.
  'ex4-34': { 'Target Scorch': thenIf(30, (ctx) => isTeam(ctx, 'Team Aqua'), (ctx) => ctx.inflict('burned')) },
  // Team Magma's Lairon – Land Sonic: Confused if damaged before.
  'ex4-36': {
    'Land Sonic': {
      run(ctx) {
        const damaged = ctx.defender.damage > 0;
        ctx.hit(40);
        if (damaged) ctx.inflict('confused');
      },
    },
  },
  // Bulbasaur – Growth: a Grass Energy card from the hand to Bulbasaur.
  'ex4-39': {
    Growth: {
      run(ctx) {
        if (ctx.me.hand.some((c) => basic(ctx, c) && isEnergyCardOf(c, ctx.state.cards, 'grass'))) ctx.pend({ kind: 'attachFromHand', source: 'Growth', type: 'grass', basic: true, count: 1 });
        else ctx.log('There are no Grass Energy cards in the hand.');
      },
    },
  },
  // Jigglypuff – Rest: its Special Conditions and 3 damage counters off, then Asleep.
  'ex4-41': {
    Rest: {
      run(ctx) {
        clearSpecialConditions(ctx.attacker);
        healUpTo(ctx, ctx.me, ctx.attacker, 30);
        ctx.sleepSelf();
      },
    },
  },
  // Meowth – Plunder: the Defending Pokémon's Trainer cards discarded first.
  'ex4-42': {
    Plunder: {
      run(ctx) {
        discardDefenderTrainers(ctx);
        ctx.hit(10);
      },
    },
  },
  // Team Aqua's Electrike – Self Charge: an Energy card from the hand to Electrike.
  'ex4-53': {
    'Self Charge': {
      run(ctx) {
        if (ctx.me.hand.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'attachFromHand', source: 'Self Charge', count: 1 });
        else ctx.log('There are no Energy cards in the hand.');
      },
    },
  },
  // Team Aqua's Spheal – Aqua Trance.
  'ex4-57': { 'Aqua Trance': delayed(20, 'asleep') },
  // Team Magma's Baltoy – Night Attack.
  'ex4-61': { 'Night Attack': { run: (ctx) => counterPicks(ctx, 'Night Attack', 1) } },
  // Blaziken ex – Blaze Kick: heads 20 more, tails Burned; Volcanic Ash: 2 Fire Energy discarded, 100 to the chosen Pokémon.
  'ex4-89': {
    'Blaze Kick': {
      run(ctx) {
        const heads = ctx.flip();
        ctx.hit(heads ? 50 : 30);
        if (!heads) ctx.inflict('burned');
      },
    },
    'Volcanic Ash': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: "Choose one of your opponent's Pokémon to do 100 damage to" }],
      run(ctx) {
        discardOwn(ctx, typedCards(ctx, 'fire').slice(0, 2));
        const t = ctx.choices.oppTarget ?? 'active';
        if (t === 'active') ctx.hit(100);
        else ctx.damageBenched(ctx.opp, t, 100);
      },
    },
  },
  // Entei ex – Bright Flame: Energy providing 2 discarded (agreed: as provided).
  'ex4-91': {
    'Bright Flame': {
      choices: (s): ChoiceSpec[] => (ownCards(s).length ? [{ kind: 'ownEnergyUpTo', options: ownCards(s), prompt: 'Choose Energy cards providing 2 Energy to discard from Entei ex' }] : []),
      run(ctx) {
        ctx.hit(90);
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid));
        const provided = () => gone.reduce((n, e) => n + energyProvided(e, ctx.state.cards).amount, 0);
        for (const e of ctx.attacker.energy) if (provided() < 2 && !gone.includes(e)) gone.push(e);
        discardOwn(ctx, gone);
      },
    },
  },
  // Sceptile ex – Green Heal: 4 damage counters off each of the player's Pokémon with Grass Energy attached; Poison Ring:
  // Poisoned and can't retreat; Slashing Strike: not again next turn.
  'ex4-93': {
    'Green Heal': { run: (ctx) => inPlay(ctx.me).filter((p) => p.energy.some((e) => isEnergyCardOf(e, ctx.state.cards, 'grass'))).forEach((p) => healUpTo(ctx, ctx.me, p, 40)) },
    'Poison Ring': {
      run(ctx) {
        ctx.hit(40);
        ctx.inflict('poisoned');
        ctx.affectDefender((e) => {
          e.noRetreat = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't retreat next turn.`, ctx.opp.id);
        });
      },
    },
    'Slashing Strike': {
      run(ctx) {
        ctx.hit(100);
        (ctx.attacker.effects ??= {}).amnesia = { attack: 'Slashing Strike', until: ctx.turn + 2 };
        ctx.log(`${ctx.attackerDef.name} can't use Slashing Strike next turn.`);
      },
    },
  },
  // Suicune ex – Energy Flip: 10 to a Benched Pokémon, then one of its Energy cards may move to another of the opponent's
  // Pokémon; Reverse Stream: all its basic Energy cards may go back to the hand, 10 more each.
  'ex4-94': {
    'Energy Flip': {
      choices(s, c): ChoiceSpec[] {
        const bench = benchedSlots(s.opponentBench);
        if (!bench.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'opponentBench', options: bench, prompt: "Choose one of your opponent's Benched Pokémon to do 10 damage to" }];
        const p = c.benchSlot !== undefined ? s.opponentBench[c.benchSlot] : null;
        const energy = p?.energy.filter((e) => !e.provides) ?? [];
        if (!p || !energy.length) return specs;
        specs.push({ kind: 'boost', options: [true, false], prompt: "Move one of its Energy cards to another of your opponent's Pokémon?" });
        if (c.boost) {
          specs.push({ kind: 'pokemonEnergy', options: energy, prompt: 'Choose the Energy card to move' });
          specs.push({ kind: 'opponentPokemonTo', options: targetsIn(s.defender, s.opponentBench).filter((t) => t !== c.benchSlot), prompt: "Choose the opponent's Pokémon to move it to" });
        }
        return specs;
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined) return;
        const from = ctx.opp.bench[slot];
        ctx.damageBenched(ctx.opp, slot, 10);
        const to = ctx.choices.oppTo !== undefined ? pokemonAt(ctx.opp, ctx.choices.oppTo) : null;
        const card = from?.energy.find((e) => e.uid === ctx.choices.oppEnergyUid);
        if (!ctx.choices.boost || !from || !to || !card || !ctx.canAffect(ctx.opp, from)) return;
        from.energy = from.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
      },
    },
    'Reverse Stream': {
      choices: (s): ChoiceSpec[] => (ownCards(s).some((e) => isBasicEnergy(lookupCard(s.cards, e.defId))) ? [{ kind: 'boost', options: [true, false], prompt: 'Return all basic Energy cards to your hand (10 more damage each)?' }] : []),
      run(ctx) {
        const back = ctx.choices.boost ? ctx.attacker.energy.filter((e) => basic(ctx, e)) : [];
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => !back.includes(e));
        ctx.me.hand.push(...back);
        if (back.length) ctx.log(`Returned ${back.length} basic Energy card${back.length === 1 ? '' : 's'} to the hand.`);
        ctx.hit(50 + 10 * back.length);
      },
    },
  },
  // Swampert ex – Hyper Pump: 20 more for each basic Energy beyond the cost (at most 80 more); Crushing Wave: 40 to the chosen
  // Pokémon, then heads, the opponent discards one of its Energy cards.
  'ex4-95': {
    'Hyper Pump': {
      run(ctx) {
        const basics = ctx.attacker.energy.filter((e) => basic(ctx, e)).length;
        const extra = Math.min(basics, Math.max(0, energyAmount(ctx, ctx.attacker) - 1));
        ctx.hit(20 + Math.min(80, 20 * extra));
      },
    },
    'Crushing Wave': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: "Choose one of your opponent's Pokémon to do 40 damage to" }],
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        if (t === 'active') ctx.hit(40);
        else ctx.damageBenched(ctx.opp, t, 40);
        const p = pokemonAt(ctx.opp, t);
        if (!ctx.flip() || !p?.energy.length || !ctx.canAffect(ctx.opp, p)) return;
        ctx.opponentChooses({ kind: 'discardAttached', source: 'Crushing Wave', target: t });
      },
    },
  },
  // Team Aqua Technical Machine 01 – Miracle: the Special Condition the player picks.
  'ex4-79': {
    Miracle: {
      choices: () => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose a Special Condition for the Defending Pokémon' }],
      run(ctx) {
        ctx.hit(10);
        if (ctx.choices.condition) ctx.inflict(ctx.choices.condition);
      },
    },
  },
  // Team Magma Technical Machine 01 – Crushing Magma: an Energy card attached to the Defending Pokémon to the bottom of the opponent's deck.
  'ex4-84': {
    'Crushing Magma': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: "Choose an Energy card to put at the bottom of your opponent's deck" }] : []),
      run(ctx) {
        ctx.hit(10);
        const card = ctx.defender.energy.find((e) => e.uid === ctx.choices.defenderEnergyUid);
        if (!card) return;
        ctx.affectDefender(() => {
          if (!energyCanMove(ctx, ctx.defender)) return;
          ctx.defender.energy = ctx.defender.energy.filter((e) => e !== card);
          ctx.opp.deck.push(card);
          ctx.log(`Put ${lookupCard(ctx.state.cards, card.defId).name} at the bottom of the deck.`, ctx.opp.id);
        });
      },
    },
  },
};

/** Stone Generator (Ancient Technical Machine [Rock]) and Pull Down: each of the opponent's Evolved Pokémon loses its top Evolution card, to their hand. */
export function pullDown(ctx: AttackContext) {
  const evolved = inPlay(ctx.opp).filter((p) => devolvable(ctx.state.cards, p));
  if (!evolved.length) return ctx.log('Your opponent has no Evolved Pokémon.');
  for (const p of evolved) if (ctx.canAffect(ctx.opp, p)) ctx.opp.hand.push(devolve(ctx, ctx.opp, p));
}
