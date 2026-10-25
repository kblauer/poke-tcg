// Stormfront (dp7) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: the Energy cards discarded are the first that fit; Crash Chant discards the opponent's Pokémon Tools and
// Technical Machines (up to 4) by itself; Burst Ball discards the Energy cards picked, then the attacker's first ones to make
// up 3; Lifting attaches up to 2 basic Energy cards from the deck to the player's Benched Pokémon, picked one at a time;
// Ramming Strike flips once until tails (no starting again); Dragon Beat and Bowed Whip discard the first Energy card;
// Ingrain's protection needs a Grass Energy card in the deck; Impersonate's Supporter is picked from the deck.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, isBasicEnergy, isTrainerCard, lookupCard, namesMatch } from '../cards.js';
import { counts, energyPool, isSpecialEnergy, retreatCost, type InPlayPokemon, type Target } from '../engine.js';
import { pokemonPower } from '../powers.js';
import { shuffle } from '../rng.js';
import { evolvedFromName, inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, damageOpponent, energyCards, headsUntilTails, inPlay, opponentBenchChoice, opponentSwitches, opponentTargets, same } from './common.js';
import { DP1 } from './dp1.js';
import { discardAtRandom, energyAmount } from './ex1.js';
import { discardOwn, energyCardOf, EX2 } from './ex2.js';
import { EX6 } from './ex6.js';
import { trainerEffect } from './index.js';
import { screech } from './neo1.js';
import { notNextTurn } from './neo3.js';
import { healUpTo } from './si1.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const ownTargets = (s: { ownBench: (InPlayPokemon | null)[] }): Target[] => ['active', ...benchedSlots(s.ownBench)];
const mine = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.me.active : ctx.me.bench[t]);
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const typed = (ctx: AttackContext, type: Parameters<typeof energyCardOf>[2]) => ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, type));
const boosted = (ctx: AttackContext, name: string) => ctx.attacker.effects?.boostedAttack?.attack === name && ctx.attacker.effects.boostedAttack.turn === ctx.turn;
function putCounters(ctx: AttackContext, p: InPlayPokemon | null | undefined, n: number) {
  if (!p || n <= 0 || !ctx.canAffect(ctx.opp, p)) return;
  p.damage += 10 * n;
  ctx.log(`Put ${n} damage counter${n === 1 ? '' : 's'} on ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
}
/** The player's or the opponent's Stadium in play. */
const stadiumOf = (ctx: AttackContext) => ctx.state.stadium?.owner;
/** Pokémon Tools and Technical Machines on a Pokémon. */
const machines = (p: InPlayPokemon) => (p.attached ?? []).filter((a) => a.tool || trainerEffect(a.card.defId)?.technicalMachine);
/** Up to `n` of the opponent's Pokémon picked, the Active one as -1. */
const pickMany = (s: Parameters<NonNullable<AttackEffect['choices']>>[0], n: number, prompt: string): ChoiceSpec[] => {
  const options = [-1, ...benchedSlots(s.opponentBench)];
  return n > 0 ? [{ kind: 'opponentBenchMany', count: Math.min(n, options.length), options, prompt }] : [];
};
const picked = (ctx: AttackContext, n: number): Target[] => [...new Set(ctx.choices.benchSlots ?? [])].slice(0, n).map((s) => (s === -1 ? 'active' : s));

export const DP7: Record<string, Record<string, AttackEffect>> = {
  // Dusknoir – Damage Even: as Diamond & Pearl Lucario's Force Palm. Night Spin: next turn, nothing from Pokémon with 2 Energy or less.
  'dp7-1': {
    'Damage Even': same(() => DP1['dp1-32']?.['Force Palm']),
    'Night Spin': {
      run(ctx) {
        ctx.hit(50);
        (ctx.attacker.effects ??= {}).nightSpin = ctx.turn + 1;
        ctx.log("Next turn, attacks by Pokémon with 2 Energy or less attached do nothing to Dusknoir.");
      },
    },
  },
  // Infernape – Spreading Fire: 2 Fire Energy discarded, 20 to each of the opponent's Benched Pokémon.
  'dp7-3': {
    'Spreading Fire': {
      run(ctx) {
        discardOwn(ctx, typed(ctx, 'fire').slice(0, 2));
        ctx.hit(80);
        ctx.benchDamage(ctx.opp, 20);
      },
    },
  },
  // Magnezone – Gyro Ball: may switch with a Benched Pokémon; then the opponent switches too.
  'dp7-6': {
    'Gyro Ball': {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: [-1, ...benchedSlots(s.ownBench)], optional: true, prompt: 'You may choose one of your Benched Pokémon to switch Magnezone with' }] : []),
      run(ctx) {
        ctx.hit(60);
        const slot = ctx.choices.ownBenchSlot;
        if (slot === undefined || slot < 0 || !ctx.me.bench[slot]) return;
        ctx.switchOwn(slot);
        opponentSwitches(ctx, 'Gyro Ball');
      },
    },
  },
  // Mismagius – Crash Chant: up to 4 of the opponent's Pokémon Tools and Technical Machines discarded, 20 for each. Horror Chant:
  // with 4 or more Benched Pokémon, one of them and its cards back into the opponent's hand.
  'dp7-7': {
    'Crash Chant': {
      run(ctx) {
        let n = 0;
        for (const p of inPlay(ctx.opp)) {
          for (const a of machines(p)) {
            if (n >= 4 || !ctx.canAffect(ctx.opp, p)) break;
            p.attached = p.attached!.filter((x) => x !== a);
            ctx.opp.discard.push(a.card);
            ctx.log(`Discarded ${lookupCard(ctx.state.cards, a.card.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
            n++;
          }
        }
        ctx.hit(20 * n);
      },
    },
    'Horror Chant': {
      choices: (s) => (benchedSlots(s.opponentBench).length >= 4 ? opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to return to their hand") : []),
      run(ctx) {
        ctx.hit(40);
        const slot = ctx.choices.benchSlot;
        const p = slot === undefined || ctx.opp.bench.filter(Boolean).length < 4 ? null : ctx.opp.bench[slot];
        if (!p || !ctx.canAffect(ctx.opp, p)) return;
        ctx.opp.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
        ctx.opp.bench[slot!] = null;
        ctx.log(`${pokemonName(ctx.state, p)} and its cards went back into the hand.`, ctx.opp.id);
      },
    },
  },
  // Raichu – Burst Ball: 3 Energy cards discarded from the player's Pokémon.
  'dp7-8': {
    'Burst Ball': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownEnergyAny', options: [s.attacker, ...s.ownBench].flatMap((p) => (p ? energyCards(p) : [])), prompt: 'Burst Ball: choose 3 Energy cards to discard from your Pokémon' }],
      run(ctx) {
        ctx.hit(100);
        let left = 3;
        for (const p of inPlay(ctx.me)) {
          const gone = p.energy.filter((e) => !e.provides && ctx.choices.energyUids?.includes(e.uid)).slice(0, left);
          if (!gone.length) continue;
          p.energy = p.energy.filter((e) => !gone.includes(e));
          ctx.me.discard.push(...gone);
          left -= gone.length;
        }
        if (left > 0) discardOwn(ctx, energyCards(ctx.attacker).slice(0, left));
      },
    },
  },
  // Torterra – Crash Impact: 20 to itself, then the opponent switches. Land Shake: next turn, 2 damage counters on each Basic
  // Pokémon the opponent puts onto their Bench from the hand.
  'dp7-11': {
    'Crash Impact': {
      run(ctx) {
        ctx.hit(60);
        ctx.selfDamage(20);
        opponentSwitches(ctx, 'Crash Impact');
      },
    },
    'Land Shake': {
      run(ctx) {
        ctx.hit(80);
        ctx.opp.landShakeUntil = ctx.turn + 1;
        ctx.log('Next turn, each Basic Pokémon your opponent puts onto their Bench gets 2 damage counters.', ctx.opp.id);
      },
    },
  },
  // Abomasnow – Snow Play: 20 to each of the opponent's Benched Pokémon but Grass and Water ones. Below Zero: Paralyzed if it evolved from Snover this turn.
  'dp7-12': {
    'Snow Play': {
      run(ctx) {
        ctx.hit(20);
        ctx.opp.bench.forEach((p, i) => p && !hasType(inPlayDef(ctx.state.cards, p), 'grass') && !hasType(inPlayDef(ctx.state.cards, p), 'water') && ctx.damageBenched(ctx.opp, i, 20));
      },
    },
    'Below Zero': {
      run(ctx) {
        ctx.hit(60);
        const from = ctx.attacker.evolvedFrom.at(-1);
        if (ctx.attacker.playedTurn === ctx.turn && from && namesMatch(lookupCard(ctx.state.cards, from.defId).name, 'Snover')) ctx.inflict('paralyzed');
      },
    },
  },
  // Bronzong – Strange Spin: with as many cards in the hand as the opponent, 40 more and Confused. Heavy Potential: damage
  // counters on each of the opponent's Pokémon equal to its Retreat Cost.
  'dp7-13': {
    'Strange Spin': {
      run(ctx) {
        const same = ctx.me.hand.length === ctx.opp.hand.length;
        ctx.hit(same ? 60 : 20);
        if (same) ctx.inflict('confused');
      },
    },
    'Heavy Potential': {
      run(ctx) {
        for (const p of inPlay(ctx.opp)) putCounters(ctx, p, retreatCost(p, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card));
      },
    },
  },
  // Drapion – Scorpion Grapple: heads Paralyzed, tails can't retreat. Cross Poison: 4 coins, 20 each, Poisoned with 2 or more
  // heads. Derail: every Special Energy card of the Defending Pokémon discarded.
  'dp7-15': {
    'Scorpion Grapple': {
      run(ctx) {
        ctx.hit(10);
        if (ctx.flip()) return void ctx.inflict('paralyzed');
        ctx.affectDefender((e) => (e.noRetreat = ctx.turn + 1));
      },
    },
    'Cross Poison': {
      run(ctx) {
        const heads = ctx.flips(4);
        ctx.hit(20 * heads);
        if (heads >= 2) ctx.inflict('poisoned');
      },
    },
    Derail: {
      run(ctx) {
        ctx.hit(60);
        for (const e of ctx.defender.energy.filter((x) => isSpecialEnergy(ctx.state.cards, x))) ctx.discardDefenderEnergy(e.uid);
      },
    },
  },
  // Drifblim – Delivery: as EX Sandstorm's Sniff Out. Lifting: up to 2 Basic Pokémon onto the Bench, then up to 2 basic Energy
  // cards from the deck attached to the Benched Pokémon.
  'dp7-16': {
    Delivery: same(() => EX2['ex2-44']?.['Sniff Out']),
    Lifting: {
      run(ctx) {
        if (!ctx.me.deck.length) return ctx.log('Your deck is empty.');
        ctx.pend({ kind: 'pickFromDeck', source: 'Lifting', filter: 'basic', toBench: true, optional: true, count: 2 });
        (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Lifting', kind: 'pickFromDeck', filter: 'basicEnergy', attach: true, attachOnly: { bench: true }, optional: true, count: 2 });
      },
    },
  },
  // Dusknoir – Darkness Mist: 20 more against 2 or more damage counters.
  'dp7-17': { 'Darkness Mist': { run: (ctx) => void ctx.hit(ctx.defender.damage >= 20 ? 80 : 60) } },
  // Gengar – Shadow Room: 3 damage counters on one of the opponent's Pokémon, 6 if it has a Poké-Power. Poltergeist: the
  // opponent's hand shown, 30 for each Trainer card in it.
  'dp7-18': {
    'Shadow Room': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to put damage counters on"),
      run(ctx) {
        const p = theirs(ctx, ctx.choices.oppTarget ?? 'active');
        const power = p && inPlayDef(ctx.state.cards, p).power;
        putCounters(ctx, p, power && !body(ctx, p) ? 6 : 3);
      },
    },
    Poltergeist: {
      run(ctx) {
        ctx.log(`Your opponent's hand: ${ctx.opp.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`);
        ctx.hit(30 * ctx.opp.hand.filter((c) => isTrainerCard(lookupCard(ctx.state.cards, c.defId))).length);
      },
    },
  },
  // Gyarados – Tail Revenge: 30 for each Magikarp in the discard pile. Wreak Havoc: coins until tails, the opponent's top card
  // discarded for each heads. Dragon Beat: heads, an Energy card discarded from each of the opponent's Pokémon.
  'dp7-19': {
    'Tail Revenge': { run: (ctx) => void ctx.hit(30 * ctx.me.discard.filter((c) => namesMatch(lookupCard(ctx.state.cards, c.defId).name, 'Magikarp')).length) },
    'Wreak Havoc': {
      run(ctx) {
        ctx.hit(40);
        const top = ctx.opp.deck.splice(0, headsUntilTails(ctx));
        ctx.opp.discard.push(...top);
        if (top.length) ctx.log(`Discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the deck.`, ctx.opp.id);
      },
    },
    'Dragon Beat': {
      run(ctx) {
        ctx.hit(100);
        if (!ctx.flip()) return;
        for (const p of inPlay(ctx.opp)) {
          const card = energyCards(p)[0];
          if (!card || !ctx.canAffect(ctx.opp, p)) continue;
          if (p === ctx.opp.active) ctx.discardDefenderEnergy(card.uid);
          else {
            p.energy = p.energy.filter((e) => e !== card);
            ctx.opp.discard.push(card);
            ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
          }
        }
      },
    },
  },
  // Machamp – Take Out: a Defending Pokémon that isn't an Evolved Pokémon is Knocked Out instead.
  'dp7-20': {
    'Take Out': {
      run(ctx) {
        if (ctx.defender.evolvedFrom.length) return void ctx.hit(40);
        if (!ctx.canAffect(ctx.opp, ctx.defender)) return;
        ctx.defender.damage = Math.max(ctx.defender.damage, ctx.defenderDef.hp);
        ctx.log(`${ctx.defenderDef.name} is Knocked Out.`, ctx.opp.id);
      },
    },
  },
  // Mamoswine – Ramming Strike: coins until tails, 30 for each heads. Parade: more for each Swinub, Piloswine and Mamoswine on the Bench.
  'dp7-21': {
    'Ramming Strike': { run: (ctx) => void ctx.hit(30 * headsUntilTails(ctx)) },
    Parade: {
      run(ctx) {
        const count = (name: string) => ctx.me.bench.filter((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, name)).length;
        ctx.hit(60 + 10 * count('Swinub') + 20 * count('Piloswine') + 40 * count('Mamoswine'));
      },
    },
  },
  // Rapidash – Shooting Fire: 2 Fire Energy discarded, 60 to one of the opponent's Pokémon.
  'dp7-22': {
    'Shooting Fire': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 60 damage to"),
      run(ctx) {
        discardOwn(ctx, typed(ctx, 'fire').slice(0, 2));
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 60);
      },
    },
  },
  // Roserade – Bowed Whip: 30 to one of the opponent's Pokémon; heads, an Energy card discarded from it.
  'dp7-23': {
    'Bowed Whip': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 30 damage to"),
      run(ctx) {
        const t = ctx.choices.oppTarget ?? 'active';
        damageOpponent(ctx, t, 30);
        const p = theirs(ctx, t);
        const card = p && energyCards(p)[0];
        if (!p || !card || !ctx.flip() || !ctx.canAffect(ctx.opp, p)) return;
        if (t === 'active') return ctx.discardDefenderEnergy(card.uid);
        p.energy = p.energy.filter((e) => e !== card);
        ctx.opp.discard.push(card);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
      },
    },
  },
  // Scizor – Accelerate: a Knock Out makes it safe from attacks next turn. Pound Down: 30 more with none of the player's Pokémon having a Poké-Power.
  'dp7-25': {
    Accelerate: {
      run(ctx) {
        ctx.hit(30);
        if (ctx.defender.damage >= inPlayDef(ctx.state.cards, ctx.defender).hp) ctx.protect('preventAll');
      },
    },
    'Pound Down': { run: (ctx) => void ctx.hit(inPlay(ctx.me).some((p) => inPlayDef(ctx.state.cards, p).power && !body(ctx, p)) ? 40 : 70) },
  },
  // Staraptor – Strong Breeze: heads, one of the opponent's Benched Pokémon and its cards shuffled into their deck.
  'dp7-27': {
    'Strong Breeze': {
      choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon (if heads)"),
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        const p = slot === undefined ? null : ctx.opp.bench[slot];
        if (!p || !ctx.flip() || !ctx.canAffect(ctx.opp, p)) return ctx.log('Strong Breeze did nothing.');
        const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card)];
        ctx.opp.bench[slot!] = null;
        [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, ...cards], ctx.state.rngState);
        ctx.log(`${pokemonName(ctx.state, p)} and its cards were shuffled into the deck.`, ctx.opp.id);
      },
    },
  },
  // Steelix – Outbreak Power: 20 to as many of the opponent's Pokémon as it has Energy.
  'dp7-28': {
    'Outbreak Power': {
      choices: (s) => pickMany(s, energyPool(s.attacker, s.cards).length, "Choose your opponent's Pokémon to do 20 damage to (as many as Steelix has Energy)"),
      run(ctx) {
        for (const t of picked(ctx, energyAmount(ctx, ctx.attacker))) damageOpponent(ctx, t, 20);
      },
    },
  },
  // Tangrowth – Green Acid: first coin Confused, second Poisoned.
  'dp7-29': {
    'Green Acid': {
      run(ctx) {
        ctx.hit(20);
        const [first, second] = [ctx.flip(), ctx.flip()];
        if (first) ctx.inflict('confused');
        if (second) ctx.inflict('poisoned');
      },
    },
  },
  // Vespiquen – Bee Powder: 2 heads, Burned, Paralyzed and Poisoned.
  'dp7-31': {
    'Bee Powder': {
      run(ctx) {
        ctx.hit(50);
        if (ctx.flips(2) < 2) return;
        ctx.inflict('burned');
        ctx.inflict('paralyzed');
        ctx.inflict('poisoned');
      },
    },
  },
  // Dusclops – Dark One-eye: may discard a card from the hand; then the opponent discards one.
  'dp7-34': {
    'Dark One-eye': {
      choices: (s) => ((s.ownHand?.length ?? 1) ? [may('Dark One-eye: discard a card from your hand (then your opponent discards one)?')] : []),
      run(ctx) {
        ctx.hit(20);
        if (!ctx.choices.boost || !ctx.me.hand.length) return;
        ctx.pend({ kind: 'discardFromHand', source: 'Dark One-eye', count: 1 });
        if (ctx.opp.hand.length) (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Dark One-eye', kind: 'discardFromHand', count: 1 });
      },
    },
  },
  // Dusclops – Trick Room: with the player's Stadium in play, 20 more; with the opponent's, 2 damage counters off it.
  'dp7-35': {
    'Trick Room': {
      run(ctx) {
        ctx.hit(stadiumOf(ctx) === ctx.me.id ? 60 : 40);
        if (stadiumOf(ctx) === ctx.opp.id) healUpTo(ctx, ctx.me, ctx.attacker, 20);
      },
    },
  },
  // Electrode – Electro Diffusion: 10 more for each Lightning Energy; tails, every Lightning Energy discarded.
  'dp7-37': {
    'Electro Diffusion': {
      run(ctx) {
        ctx.hit(40 + 10 * energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'lightning')).length);
        if (!ctx.flip()) discardOwn(ctx, typed(ctx, 'lightning'));
      },
    },
  },
  // Farfetch'd – Go and Collect: a Trainer, Supporter or Stadium card from the deck, shown. Fury Cutter: as EX FireRed & LeafGreen Scyther's.
  'dp7-38': {
    'Go and Collect': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Go and Collect', filter: 'trainer', reveal: true, optional: true })) },
    'Fury Cutter': same(() => EX6['ex6-29']?.['Fury Cutter']),
  },
  // Haunter – Hoodwink: may put up to 3 Trainer cards from the opponent's discard pile into their hand.
  'dp7-40': {
    Hoodwink: {
      choices(s): ChoiceSpec[] {
        const options = (s.opponentDiscard ?? []).filter((c) => isTrainerCard(lookupCard(s.cards, c.defId)));
        return options.length && !s.discardsLocked ? [{ kind: 'ownDiscard', min: 0, max: Math.min(3, options.length), options, prompt: "Hoodwink: you may choose up to 3 Trainer cards in your opponent's discard pile to put into their hand" }] : [];
      },
      run(ctx) {
        ctx.hit(30);
        const back = ctx.opp.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid) && isTrainerCard(lookupCard(ctx.state.cards, c.defId))).slice(0, 3);
        if (!back.length) return;
        ctx.opp.discard = ctx.opp.discard.filter((c) => !back.includes(c));
        ctx.opp.hand.push(...back);
        ctx.log(`Put ${back.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} into your opponent's hand.`);
      },
    },
  },
  // Magneton – Magnetic Resonance: with the player's Stadium in play, 20 to 2 of the opponent's Benched Pokémon.
  'dp7-42': {
    'Magnetic Resonance': {
      choices: (s): ChoiceSpec[] => (s.stadium && benchedSlots(s.opponentBench).length ? [{ kind: 'opponentBenchMany', count: Math.min(2, benchedSlots(s.opponentBench).length), options: benchedSlots(s.opponentBench), prompt: "Choose 2 of your opponent's Benched Pokémon to do 20 damage to (if your Stadium is in play)" }] : []),
      run(ctx) {
        ctx.hit(20);
        if (stadiumOf(ctx) !== ctx.me.id) return;
        for (const slot of [...new Set(ctx.choices.benchSlots ?? [])].slice(0, 2)) ctx.damageBenched(ctx.opp, slot, 20);
      },
    },
  },
  // Miltank – Energy Milk: coins until tails, 2 damage counters off one of the player's Pokémon (picked first) for each heads.
  'dp7-44': {
    'Energy Milk': {
      choices: (s): ChoiceSpec[] => [{ kind: 'ownPokemon', options: ownTargets(s), prompt: 'Choose one of your Pokémon to heal' }],
      run(ctx) {
        const heads = headsUntilTails(ctx);
        const p = mine(ctx, ctx.choices.ownTarget ?? 'active');
        if (p && heads) healUpTo(ctx, ctx.me, p, 20 * heads);
      },
    },
  },
  // Pichu – Electric Circuit: up to 4 Lightning Energy cards from the discard pile into the hand, shown.
  'dp7-45': { 'Electric Circuit': { run: (ctx) => void (ctx.me.discard.some((c) => energyCardOf(ctx.state.cards, c, 'lightning')) ? ctx.pend({ kind: 'discardToHand', source: 'Electric Circuit', count: 4, filter: 'lightningEnergy', reveal: true }) : ctx.log('Electric Circuit found nothing.')) } },
  // Sableye – Impersonate: a Supporter card from the deck discarded and its effect used. Overconfident: base 40 against fewer HP left.
  'dp7-48': {
    Impersonate: { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Impersonate', filter: 'supporter', toDiscard: true, useSupporter: true, optional: true })) },
    Overconfident: { run: (ctx) => void ctx.hit(ctx.defenderDef.hp - ctx.defender.damage < inPlayDef(ctx.state.cards, ctx.attacker).hp - ctx.attacker.damage ? 40 : 10) },
  },
  // Scyther – Swords Dance: Slashing Strike's base damage is 60 next turn. Slashing Strike: not again next turn.
  'dp7-49': {
    'Swords Dance': {
      run(ctx) {
        (ctx.attacker.effects ??= {}).boostedAttack = { attack: 'Slashing Strike', turn: ctx.turn + 2 };
        ctx.log("Scyther's Slashing Strike's base damage is 60 next turn.");
      },
    },
    'Slashing Strike': {
      run(ctx) {
        ctx.hit(boosted(ctx, 'Slashing Strike') ? 60 : 30);
        notNextTurn(ctx, 'Slashing Strike');
      },
    },
  },
  // Skarmory – Mach Blade: heads, 50 to one of the opponent's Pokémon.
  'dp7-51': {
    'Mach Blade': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 50 damage to (if heads)"),
      run: (ctx) => void (ctx.flip() ? damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 50) : ctx.log('Mach Blade did nothing.')),
    },
  },
  // Bidoof – Self-abandonment: heads 30 to the Defending Pokémon, tails 10 to itself.
  'dp7-54': { 'Self-abandonment': { run: (ctx) => void (ctx.flip() ? ctx.hit(30) : ctx.selfDamage(10)) } },
  // Bronzor – Gyro Swap: damage counters on the Defending Pokémon equal to its own Retreat Cost.
  'dp7-55': { 'Gyro Swap': { run: (ctx) => putCounters(ctx, ctx.defender, retreatCost(ctx.attacker, ctx.state.cards, [ctx.me, ctx.opp], ctx.state.stadium?.card)) } },
  // Combee – Alert: a card drawn, then may switch with a Benched Pokémon.
  'dp7-57': {
    Alert: {
      choices: (s): ChoiceSpec[] => (benchedSlots(s.ownBench).length ? [{ kind: 'ownBench', options: [-1, ...benchedSlots(s.ownBench)], optional: true, prompt: 'You may choose one of your Benched Pokémon to switch Combee with' }] : []),
      run(ctx) {
        ctx.draw(1);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined && slot >= 0 && ctx.me.bench[slot]) ctx.switchOwn(slot);
      },
    },
  },
  // Duskull – Silhouette: a damage counter, 2 if it already has any.
  'dp7-59': { Silhouette: { run: (ctx) => putCounters(ctx, ctx.defender, ctx.defender.damage ? 2 : 1) } },
  // Gastly – Pitch-Dark: no Trainer (Item) cards for the opponent next turn.
  'dp7-62': {
    'Pitch-Dark': {
      run(ctx) {
        ctx.opp.noItemsUntil = ctx.turn + 1;
        ctx.log("Your opponent can't play Trainer cards next turn.", ctx.opp.id);
      },
    },
  },
  // Magikarp – Sea Spray: coins until tails, a card drawn for each heads.
  'dp7-65': { 'Sea Spray': { run: (ctx) => void ((n) => (n ? ctx.draw(n) : ctx.log('Sea Spray drew nothing.')))(headsUntilTails(ctx)) } },
  // Misdreavus – Nightmare Feast: against an Asleep Pokémon, 50 and 5 damage counters off it; otherwise nothing.
  'dp7-68': {
    'Nightmare Feast': {
      run(ctx) {
        if (ctx.defender.condition !== 'asleep') return ctx.log('Nightmare Feast did nothing.');
        ctx.hit(50);
        healUpTo(ctx, ctx.me, ctx.attacker, 50);
      },
    },
  },
  // Pikachu – Speed Bolt: if it evolved from Pichu this turn, safe from attacks next turn.
  'dp7-70': {
    'Speed Bolt': {
      run(ctx) {
        ctx.hit(40);
        const from = ctx.attacker.evolvedFrom.at(-1);
        if (ctx.attacker.playedTurn === ctx.turn && from && namesMatch(lookupCard(ctx.state.cards, from.defId).name, 'Pichu')) ctx.protect('preventAll');
      },
    },
  },
  // Roselia – Petal Spikes: heads (or with Budew under it), Asleep and Poisoned.
  'dp7-72': {
    'Petal Spikes': {
      run(ctx) {
        ctx.hit(20);
        if (!evolvedFromName(ctx.state.cards, ctx.attacker, 'Budew') && !ctx.flip()) return;
        ctx.inflict('asleep');
        ctx.inflict('poisoned');
      },
    },
  },
  // Tangela – Ingrain: tails nothing; heads, a Grass Energy card from the deck attached to it, and it's safe from attacks next turn.
  'dp7-78': {
    Ingrain: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Ingrain did nothing.');
        if (!ctx.me.deck.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)) && energyCardOf(ctx.state.cards, c, 'grass'))) {
          [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
          return ctx.log('Ingrain found no Grass Energy card.');
        }
        ctx.protect('preventAll');
        ctx.pend({ kind: 'pickFromDeck', source: 'Ingrain', filter: 'energyType', type: 'grass', attachToActive: true });
      },
    },
  },
  // Voltorb – Screech: as Neo Genesis Pikachu's.
  'dp7-80': { Screech: screech(0) },
  // Machamp LV.X – Strong-Willed: next turn, heads keeps it from being Knocked Out by an attack, with 10 HP left (as Armor Up).
  'dp7-98': {
    'Strong-Willed': {
      run(ctx) {
        ctx.hit(20);
        (ctx.attacker.effects ??= {}).armorUp = ctx.turn + 1;
      },
    },
  },
  // Raichu LV.X – Voltage Shoot: 2 Lightning Energy cards discarded from the hand, 80 to one of the opponent's Pokémon.
  'dp7-99': {
    'Voltage Shoot': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 80 damage to"),
      run(ctx) {
        const gone = ctx.me.hand.filter((c) => energyCardOf(ctx.state.cards, c, 'lightning')).slice(0, 2);
        if (gone.length < 2) return ctx.log('Voltage Shoot did nothing: you need 2 Lightning Energy cards in your hand.');
        ctx.me.hand = ctx.me.hand.filter((c) => !gone.includes(c));
        ctx.me.discard.push(...gone);
        ctx.log('Discarded 2 Lightning Energy cards from the hand.');
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 80);
      },
    },
  },
  // Regigigas LV.X – Giga Blaster: the opponent's top card discarded, and a card from their hand at random; not again next turn.
  'dp7-100': {
    'Giga Blaster': {
      run(ctx) {
        ctx.hit(100);
        const top = ctx.opp.deck.shift();
        if (top) {
          ctx.opp.discard.push(top);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`, ctx.opp.id);
        }
        discardAtRandom(ctx);
        notNextTurn(ctx, 'Giga Blaster');
      },
    },
  },
  // Duskull – Counting Song: up to 3 damage counters on Duskull, as many on the Defending Pokémon. Night Bind: heads, no Energy
  // cards attached from the hand to the opponent's Active Pokémon next turn.
  'dp7-SH2': {
    'Counting Song': {
      choices(s): ChoiceSpec[] {
        const most = Math.max(0, Math.min(3, Math.floor((inPlayDef(s.cards, s.attacker).hp - s.attacker.damage) / 10)));
        return most ? [{ kind: 'amount', options: Array.from({ length: most + 1 }, (_, i) => most - i), prompt: 'Counting Song: how many damage counters do you put on Duskull (as many on the Defending Pokémon)?' }] : [];
      },
      run(ctx) {
        const n = Math.min(ctx.choices.amount ?? 0, 3, Math.floor((ctx.attackerDef.hp - ctx.attacker.damage) / 10));
        if (!n) return ctx.log('Counting Song did nothing.');
        ctx.attacker.damage += 10 * n;
        putCounters(ctx, ctx.defender, n);
      },
    },
    'Night Bind': {
      run(ctx) {
        ctx.hit(20);
        if (!ctx.flip()) return;
        ctx.opp.freezeLockUntil = ctx.turn + 1;
        ctx.log("Your opponent can't attach Energy cards from their hand to their Active Pokémon next turn.", ctx.opp.id);
      },
    },
  },
  // Voltorb – Fastball: heads, 20 to one of the opponent's Pokémon.
  'dp7-SH3': {
    Fastball: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to (if heads)"),
      run: (ctx) => void (ctx.flip() ? damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 20) : ctx.log('Fastball did nothing.')),
    },
  },
};

/** The Pokémon's power is a Poké-Body (Shadow Room and Pound Down count only Poké-Powers). */
function body(_ctx: AttackContext, p: InPlayPokemon) {
  return !!pokemonPower(p)?.body;
}
