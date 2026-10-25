// Unleashed (hgss2) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "you may" choices are asked before the attack, and the Energy cards discarded or returned are picked when the
// cards that fit differ (the same-card rule, agreed); Time Hollow's Pokémon are picked before the attack, up to the Energy on
// Jirachi; Heat Acceleration's Pokémon is picked before the attack; Flare Bonus can't be used without a Fire Energy card in
// the hand; Power Claw's damage is changed by nothing on the Defending Pokémon but Weakness and Resistance; Thunder Fall hits
// every Pokémon with a printed Poké-Power, the player's own too.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { hasType, lookupCard, namesMatch } from '../cards.js';
import { energyPool, type Target } from '../engine.js';
import { pokemonPower } from '../powers.js';
import { shuffle } from '../rng.js';
import { devolvable, inPlayDef, removeTopEvolution } from '../status.js';
import { benchedSlots, damageOpponent, energyCards, headsUntilTails, inPlay, leechSeed, opponentBenchChoice, opponentTargets, same } from './common.js';
import { discardOwnEnergy, returnOwnEnergy } from './dp1.js';
import { energyAmount } from './ex1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { EX10 } from './ex10.js';
import { PL1 } from './pl1.js';
import { healUpTo } from './si1.js';

const may = (prompt: string): ChoiceSpec => ({ kind: 'boost', options: [true, false], prompt });
const theirs = (ctx: AttackContext, t: Target) => (t === 'active' ? ctx.opp.active : ctx.opp.bench[t]);
const typedAmount = (ctx: AttackContext, p: Parameters<typeof energyPool>[0], type: 'fighting' | 'water') => energyPool(p, ctx.state.cards).filter((e) => e === type || e === 'any').length;
/** "This attack does N damage to each Pokémon that has any Poké-Powers (both yours and your opponent's)": printed powers, working or not. */
function hitPowered(ctx: AttackContext, amount: number) {
  const powered = (p: Parameters<typeof inPlayDef>[1]) => !!inPlayDef(ctx.state.cards, p).power && !pokemonPower(p)?.body;
  if (powered(ctx.defender)) ctx.hit(amount, { weakness: false });
  for (const slot of benchedSlots(ctx.opp.bench)) if (powered(ctx.opp.bench[slot]!)) ctx.damageBenched(ctx.opp, slot, amount);
  if (powered(ctx.attacker)) ctx.selfDamage(amount);
  for (const slot of benchedSlots(ctx.me.bench)) if (powered(ctx.me.bench[slot]!)) ctx.damageBenched(ctx.me, slot, amount);
}

export const HGSS2: Record<string, Record<string, AttackEffect>> = {
  // Jirachi – Time Hollow: up to as many of the opponent's Evolved Pokémon as Energy on Jirachi lose their top card to the hand.
  'hgss2-1': {
    'Time Hollow': {
      choices(s): ChoiceSpec[] {
        const n = energyPool(s.attacker, s.cards).length;
        const options = [-1, ...benchedSlots(s.opponentBench)].filter((i) => devolvable(s.cards, (i === -1 ? s.defender : s.opponentBench[i])!));
        return n && options.length ? [{ kind: 'opponentBenchMany', count: Math.min(n, options.length), options, prompt: `Time Hollow: choose up to ${n} of your opponent's Evolved Pokémon` }] : [];
      },
      run(ctx) {
        for (const slot of new Set(ctx.choices.benchSlots ?? [])) {
          const p = theirs(ctx, slot === -1 ? 'active' : slot);
          if (!p || !devolvable(ctx.state.cards, p) || !ctx.canAffect(ctx.opp, p)) continue;
          const top = removeTopEvolution(ctx.state, ctx.opp, p);
          ctx.opp.hand.push(top);
          ctx.log(`${lookupCard(ctx.state.cards, top.defId).name} went back into the hand.`, ctx.opp.id);
        }
      },
    },
  },
  // Magmortar – Mantle Bazooka: 2 Fire Energy discarded.
  'hgss2-2': {
    'Mantle Bazooka': {
      run(ctx) {
        discardOwnEnergy(ctx, 2, 'Mantle Bazooka', ['fire']);
        ctx.hit(100);
      },
    },
  },
  // Manaphy – Deep Sea Swirl: the hand shuffled into the deck, then 5 cards drawn.
  'hgss2-3': {
    'Deep Sea Swirl': {
      run(ctx) {
        [ctx.me.deck, ctx.state.rngState] = shuffle([...ctx.me.deck, ...ctx.me.hand], ctx.state.rngState);
        ctx.me.hand = [];
        ctx.draw(5);
      },
    },
  },
  // Octillery – Switch Cannon: 30 to one of the opponent's Pokémon, then Octillery switched with a Benched Pokémon.
  'hgss2-6': {
    'Switch Cannon': {
      choices: (s): ChoiceSpec[] => [...opponentTargets(s, "Choose one of your opponent's Pokémon to do 30 damage to"), ...(benchedSlots(s.ownBench).length ? [{ kind: 'ownBench' as const, options: benchedSlots(s.ownBench), prompt: 'Switch Cannon: choose a Benched Pokémon to switch Octillery with' }] : [])],
      run(ctx) {
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 30);
        const slot = ctx.choices.ownBenchSlot;
        if (slot !== undefined) ctx.after(() => ctx.me.active === ctx.attacker && ctx.me.bench[slot] && ctx.switchOwn(slot));
      },
    },
  },
  // Politoed – Big Chorus: a coin for each of the player's Water Pokémon, 30 for each heads.
  'hgss2-7': { 'Big Chorus': { run: (ctx) => void ctx.hit(30 * ctx.flips(inPlay(ctx.me).filter((p) => hasType(inPlayDef(ctx.state.cards, p), 'water')).length)) } },
  // Shaymin – Energy Bloom: 3 damage counters off each of the player's Pokémon with Energy attached.
  'hgss2-8': {
    'Energy Bloom': {
      run(ctx) {
        ctx.hit(30);
        for (const p of inPlay(ctx.me)) if (p.energy.length) healUpTo(ctx, ctx.me, p, 30);
      },
    },
  },
  // Sudowoodo – Push Over: 20 for each Fighting Energy on it.
  'hgss2-9': { 'Push Over': { run: (ctx) => void ctx.hit(20 * typedAmount(ctx, ctx.attacker, 'fighting')) } },
  // Beedrill – Paralyze Poison: Poisoned; heads, Paralyzed too.
  'hgss2-12': {
    'Paralyze Poison': {
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('poisoned');
        if (ctx.flip()) ctx.inflict('paralyzed');
      },
    },
  },
  // Blastoise – Hydro Launcher: 2 Water Energy back into the hand, 100 to one of the opponent's Pokémon.
  'hgss2-13': {
    'Hydro Launcher': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 100 damage to"),
      run(ctx) {
        returnOwnEnergy(ctx, 2, 'Hydro Launcher', ['water']);
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 100);
      },
    },
  },
  // Kingdra – Stream Pump: may do 30 more, an Energy card then back into the hand.
  'hgss2-17': {
    'Stream Pump': {
      choices: () => [may('Stream Pump: do 30 more damage (returning an Energy card on Kingdra to your hand)?')],
      run(ctx) {
        ctx.hit(ctx.choices.boost ? 80 : 50);
        if (ctx.choices.boost) returnOwnEnergy(ctx, 1, 'Stream Pump');
      },
    },
  },
  // Ninetales – Heat Acceleration: up to 3 Fire Energy cards from the discard pile attached to one of the player's Pokémon.
  'hgss2-20': {
    'Heat Acceleration': {
      choices: (s): ChoiceSpec[] => (s.ownDiscard.some((c) => energyCardOf(s.cards, c, 'fire')) && !s.discardsLocked ? [{ kind: 'ownPokemon', options: ['active', ...benchedSlots(s.ownBench)], prompt: 'Heat Acceleration: choose one of your Pokémon to attach Fire Energy cards to' }] : []),
      run(ctx) {
        const t = ctx.choices.ownTarget;
        if (t !== undefined && ctx.me.discard.some((c) => energyCardOf(ctx.state.cards, c, 'fire'))) ctx.pend({ kind: 'attachFromDiscard', source: 'Heat Acceleration', count: 3, target: t, type: 'fire', optional: true });
      },
    },
  },
  // Primeape – Bebop Punch: coins until tails, 50 for each heads, to one of the opponent's Pokémon.
  'hgss2-22': {
    'Bebop Punch': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do the damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 50 * headsUntilTails(ctx)),
    },
  },
  // Metang – Energy Crane: up to 2 Psychic Energy cards from the discard pile attached to the player's Pokémon.
  'hgss2-33': {
    'Energy Crane': {
      run(ctx) {
        if (ctx.me.discard.some((c) => energyCardOf(ctx.state.cards, c, 'psychic'))) ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Crane', count: 2, type: 'psychic', optional: true });
      },
    },
  },
  // Minun – Tag Team Boost: 20 more with Plusle on the Bench.
  'hgss2-34': { 'Tag Team Boost': { run: (ctx) => void ctx.hit(ctx.me.bench.some((p) => p && namesMatch(inPlayDef(ctx.state.cards, p).name, 'Plusle')) ? 30 : 10) } },
  // Numel – Flare Bonus: a Fire Energy card discarded from the hand, then 3 cards drawn.
  'hgss2-35': {
    'Flare Bonus': {
      blocked: (s) => ((s.ownHand ?? []).some((c) => energyCardOf(s.cards, c, 'fire')) ? null : 'You have no Fire Energy card in your hand to discard'),
      run(ctx) {
        const fire = ctx.me.hand.find((c) => energyCardOf(ctx.state.cards, c, 'fire'));
        if (!fire) return;
        ctx.me.hand = ctx.me.hand.filter((c) => c !== fire);
        ctx.me.discard.push(fire);
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, fire.defId).name}.`);
        ctx.draw(3);
      },
    },
  },
  // Larvitar – Mountain Eater: the top card of the opponent's deck discarded, then 2 damage counters off Larvitar.
  'hgss2-50': {
    'Mountain Eater': {
      run(ctx) {
        const top = ctx.opp.deck.shift();
        if (top) {
          ctx.opp.discard.push(top);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, top.defId).name} from the top of the deck.`, ctx.opp.id);
        }
        ctx.heal(20);
      },
    },
  },
  // Spearow – Roost: as Platinum Swablu's.
  'hgss2-62': { Roost: same(() => PL1['pl1-SH5']?.['Roost']) },
  // Tropius – Green Call: 2 coins, a Grass Pokémon from the deck for each heads, shown.
  'hgss2-66': {
    'Green Call': {
      run(ctx) {
        const heads = ctx.flips(2);
        if (heads && ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Green Call', filter: 'pokemonType', type: 'grass', reveal: true, optional: true, count: heads });
      },
    },
  },
  // Turtwig – Leech Seed: a damage counter off it if it did damage.
  'hgss2-67': { 'Leech Seed': leechSeed(10) },
  // Crobat – Severe Poison: Poisoned, 4 damage counters between turns.
  'hgss2-84': {
    'Severe Poison': {
      run(ctx) {
        ctx.inflict('poisoned');
        if (ctx.defender.poison) ctx.affectDefender(() => (ctx.defender.poison = Math.max(ctx.defender.poison ?? 0, 40)));
      },
    },
  },
  // Kingdra – Dragon Steam: base 20 with a Fire Pokémon in play on the opponent's side.
  'hgss2-85': { 'Dragon Steam': { run: (ctx) => void ctx.hit(inPlay(ctx.opp).some((p) => hasType(inPlayDef(ctx.state.cards, p), 'fire')) ? 20 : 60) } },
  // Lanturn – Powerful Spark: 10 more for each Energy on the player's Pokémon.
  'hgss2-86': { 'Powerful Spark': { run: (ctx) => void ctx.hit(40 + 10 * inPlay(ctx.me).reduce((n, p) => n + energyAmount(ctx, p), 0)) } },
  // Tyranitar – Darkness Howl: 20 to each Pokémon in play but Darkness ones. Power Claw: nothing on the Defending Pokémon but
  // Weakness and Resistance changes the damage. Megaton Tail: as EX Unseen Forces Tyranitar's Losing Control.
  'hgss2-88': {
    'Darkness Howl': {
      run(ctx) {
        const dark = (p: Parameters<typeof inPlayDef>[1]) => hasType(inPlayDef(ctx.state.cards, p), 'darkness');
        if (!dark(ctx.defender)) ctx.hit(20);
        for (const slot of benchedSlots(ctx.opp.bench)) if (!dark(ctx.opp.bench[slot]!)) ctx.damageBenched(ctx.opp, slot, 20);
        if (!dark(ctx.attacker)) ctx.selfDamage(20);
        for (const slot of benchedSlots(ctx.me.bench)) if (!dark(ctx.me.bench[slot]!)) ctx.damageBenched(ctx.me, slot, 20);
      },
    },
    'Power Claw': { run: (ctx) => void ctx.hit(60, { swift: true, keepWeakness: true, keepResistance: true }) },
    'Megaton Tail': same(() => EX10['ex10-111']?.['Losing Control']),
  },
  // Entei & Raikou LEGEND – Thunder Fall: every Energy discarded, 80 to each Pokémon with a Poké-Power, no Weakness or Resistance.
  'hgss2-90': { 'Thunder Fall': { run: thunderFall } },
  'hgss2-91': { 'Thunder Fall': { run: thunderFall } },
  // Raikou & Suicune LEGEND – Thunderbolt Spear: 50 to itself, no Weakness.
  'hgss2-92': { 'Thunderbolt Spear': { run: thunderboltSpear } },
  'hgss2-93': { 'Thunderbolt Spear': { run: thunderboltSpear } },
  // Suicune & Entei LEGEND – Torrent Blade: 2 Water Energy back into the hand, 100 to one of the opponent's Benched Pokémon.
  'hgss2-94': { 'Torrent Blade': torrentBlade() },
  'hgss2-95': { 'Torrent Blade': torrentBlade() },
};

function thunderFall(ctx: AttackContext) {
  discardOwn(ctx, energyCards(ctx.attacker));
  hitPowered(ctx, 80);
}
function thunderboltSpear(ctx: AttackContext) {
  ctx.hit(150);
  ctx.selfDamage(50);
}
function torrentBlade(): AttackEffect {
  return {
    choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's Benched Pokémon to do 100 damage to"),
    run(ctx) {
      returnOwnEnergy(ctx, 2, 'Torrent Blade', ['water']);
      const slot = ctx.choices.benchSlot;
      if (slot !== undefined && ctx.opp.bench[slot]) ctx.damageBenched(ctx.opp, slot, 100);
    },
  };
}
