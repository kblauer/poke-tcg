// Gym Heroes (gym1) Pokémon Powers, by card id. Powers that are used stop working while their Pokémon is Asleep,
// Confused or Paralyzed (checked in powerError); the rest are flags the engine checks with powerActive, which also
// handles Toxic Gas.
// Rulings: Shell Armor and Rebirth ("you may") are always used, as there's never a reason not to. Restless Sleep's 20
// damage, like Strikes Back's, has no Weakness or Resistance. Photosynthesis makes the Energy Grass for costs, counts
// and retreating (energyPool); Stare stops it there, Toxic Gas and Goop Gas Attack don't (energyPool sees no other Pokémon).
import { isEnergyCardOf, type InPlayPokemon, type Target } from '../engine.js';
import { ownTargets, pokemonAt, powerActive, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, clearOnLeavingActive, effectId, flipCoin, inPlayDef, pokemonName } from '../status.js';
import { powerEffect } from './index.js';

const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;

/** Energy Charge: the player's other Pokémon with a Lightning Energy card attached. */
const lightningSources = (s: PowerSituation): Target[] =>
  ownTargets(s.me).filter((t) => t !== s.source && at(s, t).energy.some((e) => isEnergyCardOf(e, s.cards, 'lightning')));

/** The opponent's benched Pokémon (Fragrance Trap). */
const oppBench = (s: PowerSituation): Target[] => s.opp.bench.flatMap((p, i) => (p ? [i] : []));

export const GYM1_POWERS: Record<string, PowerEffect> = {
  // Brock's Rhydon – Bench Guard: while it's benched, after an attack damages another of your benched Pokémon, you're
  // asked whether to move 10 of that damage to it, once for each (attacks.ts queues the questions).
  'gym1-2': { benchGuard: true },

  // Misty's Tentacruel – Flee: before the opponent attacks it, you're asked whether it switches out if the attack damages
  // it; if so it takes the damage, nothing else the attack does affects it, and it's switched once the attack is over.
  'gym1-10': { flee: true },

  // Erika's Vileplume – Pollen Defense: when an attack damages it as the Active Pokémon (even a Knock Out), flip; heads confuses the attacker.
  'gym1-5': {
    ignoresConditions: true,
    onAttackDamage(ctx, vileplume) {
      if (ctx.opp.active !== vileplume || !flipCoin(ctx.state, 'Pollen Defense', ctx.opp.id)) return;
      const attacker = ctx.attacker;
      const name = pokemonName(ctx.state, attacker);
      if (powerActive(attacker, ctx.state.cards, [ctx.me, ctx.opp]) && powerEffect(effectId(attacker))?.noConditions) return addLog(ctx.state, `${name} can't be affected by Special Conditions.`, ctx.me.id);
      const guard = ctx.state.rules?.find((r) => r.kind === 'conditionGuard' && r.player === ctx.me.id && r.conditions.includes('confused'));
      if (guard) return addLog(ctx.state, `${guard.label ?? 'A battle rule'} protected ${name} from that.`, ctx.me.id);
      attacker.condition = 'confused';
      delete attacker.paralyzedTurn;
      addLog(ctx.state, `Pollen Defense: ${name} is now Confused.`, ctx.me.id);
    },
  },

  // Lt. Surge's Magneton – Energy Charge: as often as you like, as your Active Pokémon, move a Lightning Energy card from another of your Pokémon to it.
  'gym1-8': {
    blocked(s) {
      if (s.source !== 'active') return "Lt. Surge's Magneton must be your Active Pokémon";
      return lightningSources(s).length ? null : 'None of your other Pokémon have Lightning Energy cards';
    },
    choices(s, c) {
      const from = { kind: 'ownPokemon', field: 'from', options: lightningSources(s), prompt: 'Take a Lightning Energy card from' } as const;
      if (c.from === undefined) return [from];
      return [from, { kind: 'attachedEnergy', field: 'energyUid', options: at(s, c.from).energy.filter((e) => isEnergyCardOf(e, s.cards, 'lightning')), prompt: 'Choose the Lightning Energy card' }];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const [energy] = from.energy.splice(from.energy.findIndex((e) => e.uid === ctx.choices.energyUid), 1);
      ctx.source.energy.push(energy!);
      ctx.log(`Moved a Lightning Energy card from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },

  // Rocket's Moltres – Rebirth: when it's Knocked Out, it goes back to the hand after it's discarded (engine.ts, resolveKnockouts).
  'gym1-12': { rebirth: true },

  // Erika's Victreebel – Fragrance Trap: once during your turn, flip; heads switches 1 of the opponent's benched Pokémon with their Active Pokémon.
  'gym1-26': {
    oncePerTurn: true,
    blocked: (s) => (!s.opp.active ? 'Your opponent has no Active Pokémon' : oppBench(s).length ? null : 'Your opponent has no benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: oppBench(s), prompt: "Choose one of your opponent's benched Pokémon to switch in (on heads)" }],
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Fragrance Trap did nothing.');
      const slot = ctx.choices.oppTo as number;
      const benched = ctx.opp.bench[slot]!;
      const old = ctx.opp.active!;
      clearOnLeavingActive(old);
      ctx.opp.bench[slot] = old;
      ctx.opp.active = benched;
      addLog(ctx.state, `${pokemonName(ctx.state, benched)} was switched in for ${pokemonName(ctx.state, old)}.`, ctx.opp.id);
    },
  },

  // Misty's Cloyster – Shell Armor: attack damage to it is 10 less, after Weakness and Resistance (attacks.ts).
  'gym1-29': { shellArmor: true },

  // Rocket's Snorlax – Restless Sleep: when an attack damages it while it's Asleep (even a Knock Out), 20 damage to the attacker.
  'gym1-33': {
    ignoresConditions: true,
    onAttackDamage(ctx, snorlax: InPlayPokemon) {
      if (snorlax.condition !== 'asleep') return;
      ctx.attacker.damage += 20;
      addLog(ctx.state, `Restless Sleep: ${ctx.attackerDef.name} took 20 damage.`, ctx.opp.id);
    },
  },

  // Erika's Dratini – Strange Barrier: an attack by a Basic Pokémon that does 20 or more damage to it does 10 (attacks.ts).
  'gym1-42': { strangeBarrier: true },

  // Erika's Oddish – Photosynthesis: all Energy attached to it provides Grass Energy (energyPool). It works whatever its condition.
  'gym1-47': { photosynthesis: true, ignoresConditions: true },

  // Blaine's Vulpix – Natural Healing: once during your turn, remove 1 damage counter from it.
  'gym1-65': {
    oncePerTurn: true,
    blocked: (s) => (at(s, s.source).damage ? null : "Blaine's Vulpix has no damage counters"),
    use(ctx) {
      ctx.source.damage -= 10;
      ctx.log(`Removed a damage counter from ${inPlayDef(ctx.state.cards, ctx.source).name}.`);
    },
  },
};
