// EX Dragon (ex3) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the EX Ruby & Sapphire ones (ex1.ts). Agreed with the user: Dragon Dance's 40 more is for
// whichever Pokémon is its player's Active one next turn, never for damage to the Bench (changed 2026-10-22)
// (PlayerState.dragonDanceTurn); Dragon Crush's heads does 10 to each of the opponent's Pokémon and discards an Energy card
// from each (nothing on tails); Luster Purge's 3 Energy count the Energy provided (Double Colorless is 2); Rainbow Energy and
// Multi Energy count as Fire or Water for Mist Ball (and for Dragon Wave and Dragon Burst, as for every attack); Big
// Explosion does its 80 to Graveler too, Weakness and Resistance only for the opponent's Active Pokémon; Special Circuit
// counts the older sets' Pokémon Powers as Poké-Powers.
// From the text: Luring Flame's new Defending Pokémon is the one the attacking player picks (with one Active Pokémon a side,
// the opponent has nothing to choose), and with no Benched Pokémon to switch in the Defending Pokémon is Burned; Dragon
// Burst does 40 for each Energy of that type discarded (Rainbow and Multi Energy are 1 each).
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { targetsIn } from '../attacks.js';
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { energyProvided, isEnergyCardOf, retreatCost, type CardInstance } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { benchRoom, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { benchedSlots, headsUntilTails, opponentBenchChoice, same } from './common.js';
import { attachFromDiscard } from './neo3.js';
import { typedCards } from './ecard1.js';
import { eachDefending, energyAmount } from './ex1.js';
import { discardOwn, downToFive, inPlay, putCounters, typeCards } from './ex2.js';
import { NEO3 } from './neo3.js';
import { healUpTo } from './si1.js';

/** Energy cards attached to the attacker the player may pick (not a Pokémon attached as Energy). */
const ownCards = (s: Parameters<NonNullable<AttackEffect['choices']>>[0]) => s.attacker.energy.filter((e) => !e.provides);

/** A basic Energy card. */
const basic = (ctx: Pick<AttackContext, 'state'>, c: CardInstance) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId));

/** Discards a `first`-type and a `second`-type Energy card from the attacker, two different cards (Mist Ball, Dragon Wave). */
function discardPair(ctx: AttackContext, first: EnergyType, second: EnergyType) {
  const one = typeCards(ctx.state.cards, ctx.attacker, first)[0];
  const two = typeCards(ctx.state.cards, ctx.attacker, second).find((c) => c !== one);
  discardOwn(ctx, [one, two].filter((c): c is CardInstance => !!c));
}

/** Choose one of the opponent's Pokémon; `amount(target)` damage to it (Weakness and Resistance for the Active one only). */
const chosenDamage = (prompt: string, amount: (ctx: AttackContext, t: 'active' | number) => number): AttackEffect => ({
  choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt }],
  run(ctx) {
    const t = ctx.choices.oppTarget ?? 'active';
    const damage = amount(ctx, t);
    if (t === 'active') ctx.hit(damage);
    else ctx.damageBenched(ctx.opp, t, damage);
  },
});

const pokemonAtOpp = (ctx: AttackContext, t: 'active' | number) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]) ?? null;

export const EX3: Record<string, Record<string, AttackEffect>> = {
  // Absol – Bad News: the opponent's hand down to 5, at random.
  'ex3-1': { 'Bad News': { run: downToFive } },
  // Altaria – Dragon Dance: next turn, its player's attacks do 40 more to each Defending Pokémon they damage (agreed).
  'ex3-2': {
    'Dragon Dance': {
      run(ctx) {
        Object.assign(ctx.me, { dragonDanceTurn: ctx.turn + 2, dragonDanceMore: 40, dragonDanceSource: 'Dragon Dance' });
        ctx.log('Dragon Dance: your attacks do 40 more damage next turn.');
      },
    },
  },
  // Flygon – Energy Shower: any number of basic Energy cards from the hand to the player's Pokémon; Rainbow Burn: 10 more for each type of basic Energy card attached.
  'ex3-4': {
    'Energy Shower': {
      run(ctx) {
        const count = ctx.me.hand.filter((c) => basic(ctx, c)).length;
        if (count) ctx.pend({ kind: 'attachFromHand', source: 'Energy Shower', basic: true, count, anyTarget: true });
        else ctx.log('There are no basic Energy cards in the hand.');
      },
    },
    'Rainbow Burn': {
      run(ctx) {
        const types = new Set(ctx.attacker.energy.filter((e) => !e.provides && basic(ctx, e)).map((e) => energyProvided(e, ctx.state.cards).type));
        ctx.hit(30 + 10 * types.size);
      },
    },
  },
  // Golem – Rock Vengeance: 10 more for each damage counter on its player's Active Pokémon.
  'ex3-5': { 'Rock Vengeance': { run: (ctx) => void ctx.hit(20 + ctx.attacker.damage) } },
  // Grumpig – Mind Trip: Confused when the two have the same amount of Energy attached.
  'ex3-6': {
    'Mind Trip': {
      run(ctx) {
        ctx.hit(50);
        if (energyAmount(ctx, ctx.attacker) === energyAmount(ctx, ctx.defender)) ctx.inflict('confused');
      },
    },
  },
  // Minun – Special Circuit: 20 to the chosen Pokémon, 40 if it has a Poké-Power or Poké-Body (or an older Pokémon Power, agreed).
  'ex3-7': {
    'Special Circuit': chosenDamage("Choose one of your opponent's Pokémon to do 20 damage to (40 if it has a Poké-Power or Poké-Body)", (ctx, t) => (inPlayDef(ctx.state.cards, pokemonAtOpp(ctx, t)!).power ? 40 : 20)),
  },
  // Plusle – Extra Circuit: 20 to the chosen Pokémon, 40 if it's a Pokémon-ex.
  'ex3-8': {
    'Extra Circuit': chosenDamage("Choose one of your opponent's Pokémon to do 20 damage to (40 if it's a Pokémon-ex)", (ctx, t) => (inPlayDef(ctx.state.cards, pokemonAtOpp(ctx, t)!).ex ? 40 : 20)),
  },
  // Roselia – Speed Growth: up to 2 Grass Energy cards from the hand to the player's Pokémon.
  'ex3-9': {
    'Speed Growth': {
      run(ctx) {
        const grass = ctx.me.hand.filter((c) => basic(ctx, c) && isEnergyCardOf(c, ctx.state.cards, 'grass')).length;
        if (grass) ctx.pend({ kind: 'attachFromHand', source: 'Speed Growth', type: 'grass', basic: true, count: Math.min(2, grass), anyTarget: true });
        else ctx.log('There are no Grass Energy cards in the hand.');
      },
    },
  },
  // Shedinja – Damage Curse: a damage counter on the Defending Pokémon, and one more for each on Shedinja.
  'ex3-11': { 'Damage Curse': { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, 1 + Math.floor(ctx.attacker.damage / 10)) } },
  // Torkoal – Power Generation: up to 2 basic Energy cards from the discard pile into the hand, shown; Scorching Smoke: Burned, and tails discards a Fire Energy card.
  'ex3-12': {
    'Power Generation': {
      run(ctx) {
        if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
        if (ctx.me.discard.some((c) => basic(ctx, c))) ctx.pend({ kind: 'discardToHand', source: 'Power Generation', count: 2, filter: 'basicEnergy', reveal: true });
      },
    },
    'Scorching Smoke': {
      run(ctx) {
        ctx.inflict('burned');
        if (!ctx.flip()) discardOwn(ctx, typedCards(ctx, 'fire').slice(0, 1));
      },
    },
  },
  // Dragonair – Healing Wave: a damage counter off its player's Active Pokémon.
  'ex3-14': {
    'Healing Wave': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.active) healUpTo(ctx, ctx.me, ctx.me.active, 10);
      },
    },
  },
  // Flygon – Air Slash: tails discards the Energy card the player picked.
  'ex3-15': {
    'Air Slash': {
      choices: (s): ChoiceSpec[] => (ownCards(s).length ? [{ kind: 'ownEnergy', count: 1, options: ownCards(s), prompt: 'Choose an Energy card to discard from Flygon (if tails)' }] : []),
      run(ctx) {
        ctx.hit(60);
        if (!ctx.flip()) discardOwn(ctx, ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid)));
      },
    },
  },
  // Girafarig – Synchronized Search: with the same amount of Energy as the Defending Pokémon, any card from the deck;
  // Breaking Impact: 10 to the chosen Pokémon for each Colorless Energy in its Retreat Cost.
  'ex3-16': {
    'Synchronized Search': {
      run(ctx) {
        if (energyAmount(ctx, ctx.attacker) !== energyAmount(ctx, ctx.defender)) return ctx.log('Synchronized Search did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Synchronized Search', filter: 'any' });
      },
    },
    'Breaking Impact': chosenDamage("Choose one of your opponent's Pokémon to do 10 damage to for each Energy in its Retreat Cost", (ctx, t) =>
      10 * retreatCost(pokemonAtOpp(ctx, t)!, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card),
    ),
  },
  // Ninjask – Quick Touch: it may switch with a Benched Pokémon, then move any of its Grass Energy cards to the new Active Pokémon.
  'ex3-18': {
    'Quick Touch': {
      choices(s, c): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        if (!bench.length) return [];
        const grass = ownCards(s).filter((e) => isEnergyCardOf(e, s.cards, 'grass'));
        const specs: ChoiceSpec[] = [{ kind: 'ownBench', options: [-1, ...bench], optional: true, prompt: 'You may choose one of your Benched Pokémon to switch Ninjask with' }];
        if (c.ownBenchSlot !== undefined && c.ownBenchSlot >= 0 && grass.length) specs.push({ kind: 'ownEnergyUpTo', options: grass, prompt: 'Choose any Grass Energy cards to move to the new Active Pokémon' });
        return specs;
      },
      run(ctx) {
        ctx.hit(30);
        const slot = ctx.choices.ownBenchSlot;
        const ninjask = ctx.attacker;
        if (slot === undefined || slot < 0 || !ctx.me.bench[slot]) return;
        ctx.switchOwn(slot);
        const moving = ninjask.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid));
        if (!moving.length || ctx.me.active === ninjask || !ctx.me.active) return;
        ninjask.energy = ninjask.energy.filter((e) => !moving.includes(e));
        ctx.me.active.energy.push(...moving);
        ctx.log(`Moved ${moving.length} Grass Energy card${moving.length === 1 ? '' : 's'} to ${pokemonName(ctx.state, ctx.me.active)}.`);
      },
    },
  },
  // Salamence – Dragon Flame: an Energy card may be discarded for 20 more.
  'ex3-19': {
    'Dragon Flame': {
      choices(s, c): ChoiceSpec[] {
        if (!ownCards(s).length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'boost', options: [true, false], prompt: 'Discard an Energy card for 20 more damage?' }];
        if (c.boost) specs.push({ kind: 'ownEnergy', count: 1, options: ownCards(s), prompt: 'Choose an Energy card to discard from Salamence' });
        return specs;
      },
      run(ctx) {
        const card = ctx.choices.boost ? ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid)) : undefined;
        ctx.hit(card ? 60 : 40);
        if (card) discardOwn(ctx, [card]);
      },
    },
  },
  // Shelgon – Scrunch: heads, no damage to it next turn.
  'ex3-20': {
    Scrunch: {
      run(ctx) {
        if (ctx.flip()) ctx.protect('preventDamage');
        else ctx.log('Scrunch did nothing.');
      },
    },
  },
  // Skarmory – Pick On: the opponent shuffles cards the player picks from their hand into their deck until they have 5;
  // Power Count: 30 more if its player's Pokémon have less Energy than the opponent's.
  'ex3-21': {
    'Pick On': {
      run(ctx) {
        const over = ctx.opp.hand.length - 5;
        if (over < 1) return ctx.log('Your opponent has fewer than 6 cards in their hand.');
        ctx.pend({ kind: 'oppHandTrainer', source: 'Pick On', any: true, count: over, exact: true });
      },
    },
    'Power Count': {
      run(ctx) {
        const energy = (side: typeof ctx.me) => inPlay(side).reduce((n, p) => n + energyAmount(ctx, p), 0);
        ctx.hit(energy(ctx.me) < energy(ctx.opp) ? 50 : 20);
      },
    },
  },
  // Vibrava – Quick Charge: up to 3 basic Energy cards of different types from the deck, shown.
  'ex3-22': {
    'Quick Charge': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Quick Charge', filter: 'basicEnergy', reveal: true, count: 3, optional: true, distinct: 'type' })) },
  },
  // Dratini – Dragon Dew: 2 damage counters off one of the player's Pokémon.
  'ex3-26': {
    'Dragon Dew': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: targetsIn(s.attacker, s.ownBench), prompt: 'Choose one of your Pokémon to remove 2 damage counters from' }],
      run(ctx) {
        const t = ctx.choices.ownTarget ?? 'active';
        const p = t === 'active' ? ctx.me.active : ctx.me.bench[t];
        if (p) healUpTo(ctx, ctx.me, p, 20);
      },
    },
  },
  // Flaaffy – Energy Recall: up to 2 basic Energy cards from the discard pile to Flaaffy.
  'ex3-27': {
    'Energy Recall': {
      choices(s): ChoiceSpec[] {
        const basics = s.discardsLocked ? [] : s.ownDiscard.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId)));
        return basics.length ? [{ kind: 'ownDiscard', min: 1, max: 2, options: basics, prompt: 'Choose up to 2 basic Energy cards from your discard pile' }] : [];
      },
      run(ctx) {
        const cards = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid));
        if (!cards.length || discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Energy Recall found nothing.');
        ctx.me.discard = ctx.me.discard.filter((c) => !cards.includes(c));
        ctx.attacker.energy.push(...cards);
        ctx.log(`Attached ${cards.length} basic Energy card${cards.length === 1 ? '' : 's'} from the discard pile to ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Forretress – Double Metal Ball: 2 damage counters on each Defending Pokémon (agreed: the Active and every Benched one);
  // Backspin: it may discard an Energy card to switch with a Benched Pokémon.
  'ex3-28': {
    'Double Metal Ball': { run: (ctx) => inPlay(ctx.opp).forEach((p) => putCounters(ctx, ctx.opp, p, 2)) },
    Backspin: {
      choices(s, c): ChoiceSpec[] {
        const bench = benchedSlots(s.ownBench);
        if (!bench.length || !ownCards(s).length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'ownBench', options: [-1, ...bench], optional: true, prompt: 'You may discard an Energy card to switch Forretress with one of your Benched Pokémon' }];
        if (c.ownBenchSlot !== undefined && c.ownBenchSlot >= 0) specs.push({ kind: 'ownEnergy', count: 1, options: ownCards(s), prompt: 'Choose an Energy card to discard from Forretress' });
        return specs;
      },
      run(ctx) {
        ctx.hit(40);
        const slot = ctx.choices.ownBenchSlot;
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (slot === undefined || slot < 0 || !card || !ctx.me.bench[slot]) return;
        discardOwn(ctx, [card]);
        ctx.switchOwn(slot);
      },
    },
  },
  // Graveler – Big Explosion: 80 to each Active Pokémon, Graveler too (agreed).
  'ex3-29': {
    'Big Explosion': {
      run(ctx) {
        ctx.hit(80);
        ctx.selfDamage(80);
      },
    },
  },
  // Grovyle – Fury Cutter: 4 heads 70; otherwise 10 more for each heads.
  'ex3-31': {
    'Fury Cutter': {
      run(ctx) {
        const heads = ctx.flips(4);
        ctx.hit(heads === 4 ? 70 : 10 + 10 * heads);
      },
    },
  },
  // Gyarados – Dragon Crush: heads, 10 to the Defending Pokémon and an Energy card discarded from it (agreed: "each Defending
  // Pokémon" is the Active Pokémon only).
  'ex3-32': {
    'Dragon Crush': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Dragon Crush did nothing.');
        eachDefending(ctx, 10);
        const targets = targetsIn(ctx.opp.active, []).filter((t) => {
          const p = pokemonAtOpp(ctx, t)!;
          return p.energy.some((e) => !e.provides) && ctx.canAffect(ctx.opp, p);
        });
        if (targets.length) ctx.pend({ kind: 'removeEach', source: 'Dragon Crush', targets });
      },
    },
  },
  // Horsea – Retaliate: heads, 10 for each damage counter on Horsea.
  'ex3-33': { Retaliate: { run: (ctx) => void ctx.hit(ctx.flip() ? ctx.attacker.damage : 0) } },
  // Shelgon – Granite Head: 10 less damage to it next turn, after Weakness and Resistance.
  'ex3-42': {
    'Granite Head': {
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).reduceDamage = { amount: 10, until: ctx.turn + 1 };
      },
    },
  },
  // Shuppet – Night Attack: a damage counter on one of the opponent's Pokémon.
  'ex3-43': {
    'Night Attack': {
      run(ctx) {
        const skip = inPlay(ctx.opp).filter((p) => !ctx.canAffect(ctx.opp, p)).map((p) => p.card.uid);
        if (inPlay(ctx.opp).length > skip.length) ctx.pend({ kind: 'placeCounters', source: 'Night Attack', count: 1, active: true, skip });
      },
    },
  },
  // Swellow – Quick Dive: heads, 50 to the chosen Pokémon, without Weakness or Resistance.
  'ex3-45': {
    'Quick Dive': {
      choices: (s): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt: "Choose one of your opponent's Pokémon to do 50 damage to (if heads)" }],
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Quick Dive did nothing.');
        const t = ctx.choices.oppTarget ?? 'active';
        if (t === 'active') ctx.hit(50, { weakness: false });
        else ctx.damageBenched(ctx.opp, t, 50);
      },
    },
  },
  // Grimer – Poison Spurt: a Grass Energy card discarded, then Poisoned.
  'ex3-57': {
    'Poison Spurt': {
      run(ctx) {
        discardOwn(ctx, typeCards(ctx.state.cards, ctx.attacker, 'grass').slice(0, 1));
        ctx.inflict('poisoned');
      },
    },
  },
  // Magikarp – Call for Family: any number of Magikarp onto the Bench.
  'ex3-60': {
    'Call for Family': {
      blocked: (s) => (openBenchSlot(s.ownBench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
      run(ctx) {
        const room = benchRoom(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card);
        if (ctx.me.deck.length && room) ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicNamed', name: 'Magikarp', toBench: true, optional: true, count: room });
      },
    },
  },
  // Numel – Kindle: a Fire Energy card discarded, then an Energy card attached to the Defending Pokémon.
  'ex3-70': {
    Kindle: {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card to discard from the Defending Pokémon' }] : []),
      run(ctx) {
        ctx.hit(10);
        discardOwn(ctx, typedCards(ctx, 'fire').slice(0, 1));
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Slugma – Luring Flame: one of the opponent's Benched Pokémon switched in, then Burned.
  'ex3-72': {
    'Luring Flame': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to switch in"),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
        ctx.inflict('burned');
      },
    },
  },
  // Wurmple – Call for Friends: any number of Grass Basic Pokémon onto the Bench.
  'ex3-81': {
    'Call for Friends': {
      blocked: (s) => (openBenchSlot(s.ownBench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
      run(ctx) {
        const room = benchRoom(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card);
        if (ctx.me.deck.length && room) ctx.pend({ kind: 'pickFromDeck', source: 'Call for Friends', filter: 'basicType', type: 'grass', toBench: true, optional: true, count: room });
      },
    },
  },
  // Ampharos ex – Gigavolt: heads 30 more, tails Paralyzed.
  'ex3-89': {
    Gigavolt: {
      run(ctx) {
        const heads = ctx.flip();
        ctx.hit(heads ? 70 : 40);
        if (!heads) ctx.inflict('paralyzed');
      },
    },
  },
  // Dragonite ex – Dragon Wave: a Water and a Lightning Energy card discarded.
  'ex3-90': {
    'Dragon Wave': {
      run(ctx) {
        ctx.hit(70);
        discardPair(ctx, 'water', 'lightning');
      },
    },
  },
  // Kingdra ex – Genetic Memory: as Neo Revelation Kingdra's.
  'ex3-92': { 'Genetic Memory': same(() => NEO3['neo3-19']?.['Genetic Memory']) },
  // Latias ex – Mist Ball: a Fire and a Water Energy card discarded (Rainbow and Multi Energy count, agreed).
  'ex3-93': {
    'Mist Ball': {
      run(ctx) {
        ctx.hit(100);
        discardPair(ctx, 'fire', 'water');
      },
    },
  },
  // Latios ex – Energy Stream: heads, a basic Energy card from the discard pile to Latios ex; Luster Purge: 3 Energy discarded (as provided, agreed).
  'ex3-94': {
    'Energy Stream': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip()) attachFromDiscard(ctx, (c) => basic(ctx, c));
      },
    },
    'Luster Purge': {
      choices: (s): ChoiceSpec[] => (ownCards(s).length ? [{ kind: 'ownEnergyUpTo', options: ownCards(s), prompt: 'Choose Energy cards providing 3 Energy to discard from Latios ex' }] : []),
      run(ctx) {
        ctx.hit(100);
        // The chosen cards, then more (in the order attached) until they provide 3 Energy.
        const chosen = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid));
        const gone = [...chosen];
        const provided = () => gone.reduce((n, e) => n + energyProvided(e, ctx.state.cards).amount, 0);
        for (const e of ctx.attacker.energy) if (provided() < 3 && !gone.includes(e)) gone.push(e);
        discardOwn(ctx, gone);
      },
    },
  },
  // Magcargo ex – Melting Mountain: the top card of the deck discarded, attached instead if it's a basic Energy card;
  // Lava Flow: 20 more for each basic Energy card discarded.
  'ex3-95': {
    'Melting Mountain': {
      run(ctx) {
        ctx.hit(20);
        const [top] = ctx.me.deck.splice(0, 1);
        if (!top) return;
        if (basic(ctx, top)) {
          ctx.attacker.energy.push(top);
          ctx.log(`Attached ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck to ${ctx.attackerDef.name}.`);
        } else {
          ctx.me.discard.push(top);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`);
        }
      },
    },
    'Lava Flow': {
      choices(s): ChoiceSpec[] {
        const basics = ownCards(s).filter((e) => isBasicEnergy(lookupCard(s.cards, e.defId)));
        return basics.length ? [{ kind: 'ownEnergyUpTo', options: basics, prompt: 'Choose any basic Energy cards to discard (20 more damage each)' }] : [];
      },
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid) && basic(ctx, e));
        discardOwn(ctx, gone);
        ctx.hit(40 + 20 * gone.length);
      },
    },
  },
  // Muk ex – Slimy Water: 10 more for each Energy in the Defending Pokémon's Retreat Cost.
  'ex3-96': { 'Slimy Water': { run: (ctx) => void ctx.hit(40 + 10 * retreatCost(ctx.defender, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card)) } },
  // Rayquaza ex – Spiral Growth: a basic Energy card from the discard pile for each heads until tails; Dragon Burst: all
  // Fire or all Lightning Energy discarded, 40 for each.
  'ex3-97': {
    'Spiral Growth': {
      run(ctx) {
        const heads = headsUntilTails(ctx);
        if (!heads || discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return;
        const count = Math.min(heads, ctx.me.discard.filter((c) => basic(ctx, c)).length);
        if (count) ctx.pend({ kind: 'attachFromDiscard', source: 'Spiral Growth', count, target: 'active' });
      },
    },
    'Dragon Burst': {
      choices(s): ChoiceSpec[] {
        const options = (['fire', 'lightning'] as const).filter((t) => ownCards(s).some((e) => isEnergyCardOf(e, s.cards, t)));
        return options.length ? [{ kind: 'type', options: [...options], prompt: 'Discard all Fire or all Lightning Energy?' }] : [];
      },
      run(ctx) {
        const type = ctx.choices.type === 'lightning' ? 'lightning' : 'fire';
        const gone = typedCards(ctx, type);
        discardOwn(ctx, gone);
        ctx.hit(40 * gone.length);
      },
    },
  },
  // Charizard – Collect Fire: heads, 2 Fire Energy cards from the discard pile to Charizard; Flame Pillar: a Fire Energy card
  // may be discarded for 30 to one of the opponent's Benched Pokémon.
  'ex3-100': {
    'Collect Fire': {
      run(ctx) {
        ctx.hit(30);
        if (!ctx.flip() || discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return;
        const fire = ctx.me.discard.filter((c) => basic(ctx, c) && isEnergyCardOf(c, ctx.state.cards, 'fire')).slice(0, 2);
        if (!fire.length) return;
        ctx.me.discard = ctx.me.discard.filter((c) => !fire.includes(c));
        ctx.attacker.energy.push(...fire);
        ctx.log(`Attached ${fire.length} Fire Energy card${fire.length === 1 ? '' : 's'} from the discard pile to ${ctx.attackerDef.name}.`);
      },
    },
    'Flame Pillar': {
      choices(s, c): ChoiceSpec[] {
        if (!benchedSlots(s.opponentBench).length || !typeCards(s.cards, s.attacker, 'fire').length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'boost', options: [true, false], prompt: "Discard a Fire Energy card to do 30 damage to one of your opponent's Benched Pokémon?" }];
        if (c.boost) specs.push(...opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 30 damage to"));
        return specs;
      },
      run(ctx) {
        ctx.hit(60);
        const [card] = typeCards(ctx.state.cards, ctx.attacker, 'fire');
        if (!ctx.choices.boost || !card || ctx.choices.benchSlot === undefined) return;
        discardOwn(ctx, [card]);
        ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 30);
      },
    },
  },
};
