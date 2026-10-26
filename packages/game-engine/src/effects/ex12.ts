// EX Legend Maker (ex12) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Rulings follow the card text and the earlier EX sets'.
// Agreed with the user: Shadow Tag's damage counters go only on the Pokémon still Active at the end of the opponent's next
// turn (as Spiky Shell's).
// From the text: the React Energy attacks count React Energy cards attached; Devolution Wave and Time Spiral shuffle the
// top card into its owner's deck; Influence puts its Pokémon onto the Bench as Basic Pokémon; Regice ☆, Regirock ☆ and
// Registeel ☆'s Final attacks need the opponent at 1 Prize card and the attacker as its player's only Pokémon in play.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { lookupCard, namesMatch } from '../cards.js';
import { isEnergyCardOf, isSpecialEnergy, type InPlayPokemon, type Target } from '../engine.js';
import { reactCount } from '../powers.js';
import { shuffle } from '../rng.js';
import { clearSpecialConditions, devolvable, inPlayDef, pokemonName, removeTopEvolution } from '../status.js';
import { trainerEffect } from './index.js';
import { benchedSlots, extraEnergy, guardNext, headsUntilTails, opponentBenchChoice, same, selfdestruct } from './common.js';
import { ascension } from './ex5.js';
import { discardOwn, inPlay, putCounters, typeCards } from './ex2.js';
import { lureIn, notNextTurn, snipe } from './ex6.js';
import { dragOff, EX8 } from './ex8.js';

import { FOSSIL_POKEMON } from './ex12-trainers.js';
import { discardFree } from './neo3.js';
import { healUpTo } from './si1.js';

export { same };

const reacts = (ctx: Pick<AttackContext, 'state' | 'attacker'>) => reactCount(ctx.attacker, ctx.state.cards);

/** Foresight: as EX Deoxys Lunatone's (the top 5 cards of either deck, back in any order). */
export const foresight = same(() => EX8['ex8-36']?.['Foresight']);

/** One of the opponent's Pokémon loses its top card, shuffled into their deck (Devolution Wave, Time Spiral). */
export function devolveIntoDeck(ctx: AttackContext, p: InPlayPokemon) {
  if (!devolvable(ctx.state.cards, p) || !ctx.canAffect(ctx.opp, p)) return;
  const top = removeTopEvolution(ctx.state, ctx.opp, p);
  if (ctx.opp.active === p) {
    p.condition = null;
    p.poison = 0;
    p.burned = false;
  }
  [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, top], ctx.state.rngState);
  ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} was shuffled into the deck: it's ${pokemonName(ctx.state, p)} again.`, ctx.opp.id);
}

/** The opponent's Evolved Pokémon, as `opponentBenchMany` options (-1: the Active one). */
const evolvedOptions = (s: Parameters<NonNullable<AttackEffect['choices']>>[0]) => [
  ...(devolvable(s.cards, s.defender) ? [-1] : []),
  ...benchedSlots(s.opponentBench).filter((i) => devolvable(s.cards, s.opponentBench[i]!)),
];
const atOpp = (ctx: AttackContext, slot: number) => (slot === -1 ? ctx.opp.active : ctx.opp.bench[slot]) ?? null;

/** "Search your deck for a … Pokémon (excluding Pokémon-ex), show it…" (Cry for Help). */
export const cryForHelp = (type: 'grass' | 'fire' | 'lightning'): AttackEffect => ({
  run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Cry for Help', filter: 'typesNotEx', types: [type], reveal: true })),
});

/** Prevent all effects of the opponent's Pokémon-ex's attacks on it during their next turn (Speed Stroke, Ice Barrier). */
export const exProof = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    (ctx.attacker.effects ??= {}).exProof = ctx.turn + 1;
    ctx.log(`Attacks by Pokémon-ex do nothing to ${ctx.attackerDef.name} next turn.`);
  },
});

/** The Final attacks: the opponent has 1 Prize card left and the attacker is its player's only Pokémon in play. */
const finalOdds = (ctx: AttackContext) => ctx.opp.prizes.length === 1 && inPlay(ctx.me).length === 1;

/** "Put N damage counters on the Defending Pokémon at the end of your opponent's next turn" (agreed: only if still Active). */
export const lateCounters = (damage: number, n: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.delayed = { counters: n, turn: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name} will have ${n} damage counters put on it at the end of the next turn.`, ctx.opp.id);
    });
  },
});

/** "Discard a Special Energy card, if any, attached to the Defending Pokémon" (Derail). */
export const derail = (damage: number): AttackEffect => ({
  choices(s): ChoiceSpec[] {
    const special = s.defender.energy.filter((e) => isSpecialEnergy(s.cards, e));
    return special.length ? [{ kind: 'defenderEnergy', options: special, prompt: 'Choose a Special Energy card to discard from the Defending Pokémon' }] : [];
  },
  run(ctx) {
    ctx.hit(damage);
    if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
  },
});

export const EX12: Record<string, Record<string, AttackEffect>> = {
  // Aerodactyl – Speed Stroke.
  'ex12-1': { 'Speed Stroke': exProof(40) },
  // Aggron – Heavy Blow: 10 less for each damage counter on it, unless it has a React Energy card; Bound Crush: 60 to one of
  // the opponent's Pokémon, and not next turn.
  'ex12-2': {
    'Heavy Blow': { run: (ctx) => void ctx.hit(reacts(ctx) ? 70 : Math.max(0, 70 - ctx.attacker.damage)) },
    'Bound Crush': snipe(60, (ctx) => notNextTurn(ctx, 'Bound Crush')),
  },
  // Cradily – Devolution Wave: up to as many of the opponent's Evolved Pokémon as React Energy cards attached lose their top card.
  'ex12-3': {
    'Devolution Wave': {
      choices(s): ChoiceSpec[] {
        const n = Math.min(reactCount(s.attacker, s.cards), evolvedOptions(s).length);
        return n ? [{ kind: 'opponentBenchMany', count: n, options: evolvedOptions(s), prompt: `Choose ${n} of your opponent's Evolved Pokémon to devolve` }] : [];
      },
      run(ctx) {
        for (const slot of [...new Set(ctx.choices.benchSlots ?? [])]) {
          const p = atOpp(ctx, slot);
          if (p) devolveIntoDeck(ctx, p);
        }
      },
    },
  },
  // Gengar – Cursed Reaction: 2 damage counters (4 with React Energy) on the opponent's Pokémon, as the player likes.
  'ex12-5': { 'Cursed Reaction': { run: (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Cursed Reaction', count: reacts(ctx) ? 4 : 2, active: true }) } },
  // Golem – Mend: a Fighting Energy card from the discard pile to it, then 2 damage counters off; Enraged Linear Attack: 10
  // for each damage counter on it, to one of the opponent's Pokémon.
  'ex12-6': {
    Mend: {
      run(ctx) {
        const card = ctx.me.discard.find((c) => isEnergyCardOf(c, ctx.state.cards, 'fighting') && lookupCard(ctx.state.cards, c.defId).kind === 'energy');
        if (!card || !discardFree(ctx)) return ctx.log('No Fighting Energy card was attached.');
        ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
        ctx.attacker.energy.push(card);
        ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${ctx.attackerDef.name}.`);
        healUpTo(ctx, ctx.me, ctx.attacker, 20);
      },
    },
    'Enraged Linear Attack': {
      ...snipe(0),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        if (t === 'active') ctx.hit(ctx.attacker.damage);
        else ctx.damageBenched(ctx.opp, t, ctx.attacker.damage);
      },
    },
  },
  // Machamp – Derail; Swift Blow: 20 more for each React Energy card attached.
  'ex12-9': { Derail: derail(40), 'Swift Blow': { run: (ctx) => void ctx.hit(60 + 20 * reacts(ctx)) } },
  // Shiftry – Reactive Beating: Confused with React Energy attached.
  'ex12-12': {
    'Reactive Beating': {
      run(ctx) {
        ctx.hit(30);
        if (reacts(ctx)) ctx.inflict('confused');
      },
    },
  },
  // Wailord – Rely on Friends: 10 more for each of the player's Benched Stage 1 Pokémon.
  'ex12-14': { 'Rely on Friends': { run: (ctx) => void ctx.hit(40 + 10 * ctx.me.bench.filter((p) => p && inPlayDef(ctx.state.cards, p).stage === 'stage1').length) } },
  // Absol – Extra Call: a Pokémon-ex from the deck, shown.
  'ex12-15': { 'Extra Call': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Extra Call', filter: 'pokemonEx', reveal: true })) } },
  // Girafarig – Foresight: as EX Deoxys Lunatone's; Disorder: Confused with a Special Energy card on the Defending Pokémon.
  'ex12-16': {
    Foresight: foresight,
    Disorder: {
      run(ctx) {
        ctx.hit(20);
        if (ctx.defender.energy.some((e) => isSpecialEnergy(ctx.state.cards, e))) ctx.inflict('confused');
      },
    },
  },
  // Lanturn – Water Gun: 20 more for each Water Energy not used for the cost, at most 40 more.
  'ex12-19': { 'Water Gun': { run: (ctx) => void ctx.hit(40 + 20 * extraEnergy(ctx, ['colorless', 'colorless', 'colorless'], 'water', 2)) } },
  // Lunatone – Moon Guidance: a Trainer card (not a Supporter) from the deck, shown.
  'ex12-20': { 'Moon Guidance': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Moon Guidance', filter: 'trainerNotSupporter', reveal: true })) } },
  // Magmar – Burning Sensation: Burned if the Defending Pokémon already had damage counters.
  'ex12-21': {
    'Burning Sensation': {
      run(ctx) {
        const damaged = ctx.defender.damage > 0;
        ctx.hit(40);
        if (damaged) ctx.inflict('burned');
      },
    },
  },
  // Magneton – Multiple Force: with React Energy, 10 more for each Magnemite and Magneton in play (both players').
  'ex12-22': {
    'Multiple Force': {
      run(ctx) {
        if (!reacts(ctx)) return void ctx.hit(30);
        const magnets = [...inPlay(ctx.me), ...inPlay(ctx.opp)].filter((p) => ['Magnemite', 'Magneton'].some((n) => namesMatch(inPlayDef(ctx.state.cards, p).name, n))).length;
        ctx.hit(30 + 10 * magnets);
      },
    },
  },
  // Omastar – Drag Off.
  'ex12-23': { 'Drag Off': dragOff(10) },
  // Pinsir – Cry for Help (Grass); Overhead Toss: 20 to one of the player's own Benched Pokémon.
  'ex12-24': {
    'Cry for Help': cryForHelp('grass'),
    'Overhead Toss': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your Benched Pokémon to do 20 damage to' }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        if (ctx.choices.ownBenchSlot !== undefined) ctx.damageBenched(ctx.me, ctx.choices.ownBenchSlot, 20);
      },
    },
  },
  // Solrock – Call for Family: a Lunatone from the deck onto the Bench.
  'ex12-25': { 'Call for Family': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Family', filter: 'basicNamed', name: 'Lunatone', toBench: true, optional: true })) } },
  // Spinda – Whimsy Draw: 2 cards for each heads.
  'ex12-26': { 'Whimsy Draw': { run: (ctx) => ctx.draw(2 * headsUntilTails(ctx)) } },
  // Torkoal – Cry for Help (Fire); Fireworks: tails discards a Fire Energy.
  'ex12-27': {
    'Cry for Help': cryForHelp('fire'),
    Fireworks: {
      run(ctx) {
        ctx.hit(30);
        const [fire] = typeCards(ctx.state.cards, ctx.attacker, 'fire');
        if (fire && !ctx.flip()) discardOwn(ctx, [fire]);
      },
    },
  },
  // Wobbuffet – Shadow Tag: 7 damage counters at the end of the opponent's next turn.
  'ex12-28': { 'Shadow Tag': lateCounters(0, 7) },
  // Anorith – Influence: up to 2 Fossil Pokémon from the deck onto the Bench, as Basic Pokémon; Stretch Claws: with React
  // Energy, 20 to one of the opponent's Benched Pokémon.
  'ex12-29': {
    Influence: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Influence', filter: 'named', name: FOSSIL_POKEMON.filter((n) => n !== 'Aerodactyl ex'), toBench: true, asBasic: true, count: 2, optional: true })) },
    'Stretch Claws': {
      choices: (s) => (reactCount(s.attacker, s.cards) ? opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 20 damage to") : []),
      run(ctx) {
        if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, 20);
      },
    },
  },
  // Dunsparce – Down Draw: 2 cards from the bottom of the deck; Tripping Turn: Confused, then it may switch with a Benched Pokémon.
  'ex12-31': {
    'Down Draw': {
      run(ctx) {
        const bottom = ctx.me.deck.splice(-2);
        ctx.me.hand.push(...bottom);
        ctx.log(`Drew ${bottom.length} card${bottom.length === 1 ? '' : 's'} from the bottom of the deck.`);
      },
    },
    'Tripping Turn': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, optional: true, prompt: 'You may choose a Benched Pokémon to switch Dunsparce with' }] : [];
      },
      run(ctx) {
        ctx.inflict('confused');
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
      },
    },
  },
  // Furret – Do the Wave: 10 more for each of the player's Benched Pokémon.
  'ex12-33': { 'Do the Wave': { run: (ctx) => void ctx.hit(10 + 10 * ctx.me.bench.filter(Boolean).length) } },
  // Haunter – Time Spiral: one of the opponent's Evolved Pokémon (picked first); heads, its top card shuffled into their deck.
  // Haunt: 2 damage counters on the Defending Pokémon.
  'ex12-35': {
    'Time Spiral': {
      choices(s): ChoiceSpec[] {
        const options = evolvedOptions(s);
        return options.length ? [{ kind: 'opponentBenchMany', count: 1, options, prompt: "Choose one of your opponent's Evolved Pokémon" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlots?.[0];
        const p = slot === undefined ? null : atOpp(ctx, slot);
        if (p && ctx.flip()) devolveIntoDeck(ctx, p);
      },
    },
    Haunt: { run: (ctx) => putCounters(ctx, ctx.opp, ctx.defender, 2) },
  },
  // Kabuto – Granite Head: 10 less damage to it next turn.
  'ex12-36': { 'Granite Head': guardNext(20, 10) },
  // Lairon – Rest: every Special Condition and 5 damage counters off it; it's now Asleep.
  'ex12-38': {
    Rest: {
      run(ctx) {
        const p = ctx.attacker;
        clearSpecialConditions(p);
        healUpTo(ctx, ctx.me, p, 50);
        ctx.sleepSelf();
      },
    },
  },
  // Misdreavus – Return Trance: an Energy card attached to it back to the hand; the Defending Pokémon is now Asleep.
  'ex12-40': {
    'Return Trance': {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.some((e) => !e.provides) ? [{ kind: 'ownEnergy', count: 1, options: s.attacker.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to return to your hand' }] : []),
      run(ctx) {
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (card) {
          ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
          ctx.me.hand.push(card);
          ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} to the hand.`);
        }
        ctx.inflict('asleep');
      },
    },
  },
  // Roselia – Flick Poison: one of the opponent's Benched Pokémon switched in, then Poisoned.
  'ex12-42': { 'Flick Poison': lureIn("Choose one of your opponent's Benched Pokémon to switch in", (ctx) => ctx.inflict('poisoned')) },
  // Tangela – Entangling Vines: a Basic Defending Pokémon can't attack next turn.
  'ex12-44': {
    'Entangling Vines': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.defenderDef.stage !== 'basic') return;
        ctx.affectDefender((e) => {
          e.noAttack = ctx.turn + 1;
          ctx.log(`${ctx.defenderDef.name} can't attack next turn.`, ctx.opp.id);
        });
      },
    },
  },
  // Vibrava – Bi-Blast: 20 more with React Energy.
  'ex12-46': { 'Bi-Blast': { run: (ctx) => void ctx.hit(reacts(ctx) ? 40 : 20) } },
  // Aron – Self Charge: a Metal Energy card from the hand attached to it.
  'ex12-48': { 'Self Charge': { run: (ctx) => void (ctx.me.hand.length && ctx.pend({ kind: 'attachFromHand', source: 'Self Charge', count: 1, types: ['metal'], target: 'active' })) } },
  // Geodude – Selfdestruct: 10 to each Benched Pokémon, and 50 to itself.
  'ex12-53': { Selfdestruct: selfdestruct(50, 10) },
  // Grimer – Ascension.
  'ex12-54': { Ascension: ascension },
  // Lileep – Tender Tentacles: with React Energy, 2 damage counters off it.
  'ex12-56': {
    'Tender Tentacles': {
      run(ctx) {
        ctx.hit(20);
        if (reacts(ctx)) healUpTo(ctx, ctx.me, ctx.attacker, 20);
      },
    },
  },
  // Magby – Ignite: Burned while Full Flame is in play.
  'ex12-58': {
    Ignite: {
      run(ctx) {
        ctx.hit(10);
        if (ctx.state.stadium && lookupCard(ctx.state.cards, ctx.state.stadium.card.defId).name === 'Full Flame') ctx.inflict('burned');
      },
    },
  },
  // Magnemite – Magnetic Swirl: tails, nothing; heads, 10 and an Energy card of the Defending Pokémon's discarded.
  'ex12-59': {
    'Magnetic Swirl': {
      choices: (s): ChoiceSpec[] => (s.defender.energy.some((e) => !e.provides) ? [{ kind: 'defenderEnergy', options: s.defender.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to discard from the Defending Pokémon, if heads' }] : []),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Magnetic Swirl did nothing.');
        ctx.hit(10);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Seedot – Drawup Power: an Energy card from the deck, shown.
  'ex12-61': { 'Drawup Power': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Drawup Power', filter: 'energy', reveal: true })) } },
  // Skitty – Important Errands: a React Energy card from the deck, shown.
  'ex12-64': { 'Important Errands': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Important Errands', filter: 'energyNamed', name: 'React Energy', reveal: true })) } },
  // Wurmple – String Pull: one of the opponent's Benched Pokémon switched in.
  'ex12-70': { 'String Pull': lureIn("Choose one of your opponent's Benched Pokémon to switch in") },
  // Banette ex – Shadow Chant: 10 more for each Supporter card in the discard pile, at most 60 more.
  'ex12-85': { 'Shadow Chant': { run: (ctx) => void ctx.hit(30 + Math.min(60, 10 * ctx.me.discard.filter((c) => !!trainerEffect(c.defId)?.supporter).length)) } },
  // Dustox ex – Silver Wind: next turn, attacks that damage the Defending Pokémon do 30 more (as EX Hidden Legends Masquerain's).
  'ex12-86': {
    'Silver Wind': {
      run(ctx) {
        ctx.hit(40);
        ctx.affectDefender((e) => {
          e.silverWind = ctx.turn + 2;
          ctx.log(`Attacks that damage ${ctx.defenderDef.name} next turn do 30 more.`, ctx.opp.id);
        });
      },
    },
  },
  // Flygon ex – Reactive Blast: any React Energy cards attached discarded, 30 more for each.
  'ex12-87': {
    'Reactive Blast': {
      choices(s): ChoiceSpec[] {
        const options = s.attacker.energy.filter((e) => !e.provides && lookupCard(s.cards, e.defId).name === 'React Energy');
        return options.length ? [{ kind: 'ownEnergyAny', options, prompt: 'You may discard any React Energy cards attached to Flygon ex: 30 more damage each' }] : [];
      },
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid));
        discardOwn(ctx, gone);
        ctx.hit(40 + 30 * gone.length);
      },
    },
  },
  // Mew ex – Power Move: an Energy card from the deck attached to it; then it may switch with a Benched Pokémon (asked first).
  'ex12-88': {
    'Power Move': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench);
        return options.length ? [{ kind: 'ownBench', options, optional: true, prompt: 'You may choose a Benched Pokémon to switch Mew ex with afterwards' }] : [];
      },
      run(ctx) {
        if (ctx.choices.ownBenchSlot !== undefined) ctx.switchOwn(ctx.choices.ownBenchSlot);
        const target: Target = ctx.choices.ownBenchSlot === undefined ? 'active' : ctx.choices.ownBenchSlot;
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Power Move', filter: 'energy', attachTo: target, optional: true });
      },
    },
  },
  // Regice ☆ – Ice Barrier; Final Blizzard: 30 to each of the opponent's Benched Pokémon at the last stand.
  'ex12-90': {
    'Ice Barrier': exProof(10),
    'Final Blizzard': {
      run(ctx) {
        ctx.hit(30);
        if (finalOdds(ctx)) ctx.benchDamage(ctx.opp, 30);
      },
    },
  },
  // Regirock ☆ – Final Blast: 100 at the last stand.
  'ex12-91': { 'Final Blast': { run: (ctx) => void ctx.hit(finalOdds(ctx) ? 100 : 30) } },
  // Registeel ☆ – Barrier Attack: 10 less damage to it next turn; Final Laser: 3 damage counters (6 at the last stand) on the opponent's Pokémon, as the player likes.
  'ex12-92': {
    'Barrier Attack': guardNext(10, 10),
    'Final Laser': { run: (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Final Laser', count: finalOdds(ctx) ? 6 : 3, active: true }) },
  },
};

