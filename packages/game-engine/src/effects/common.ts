// Building blocks for attack effects that many cards share.
import type { AttackContext, AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import type { PendingChoice } from '../trainers.js';
import type { EnergyType } from '../cards.js';
import { counts, energyPool, type Affliction, type PoolEnergy } from '../engine.js';

/** Base damage, then on heads the Defending Pokémon gets `affliction`. */
export const flipToInflict = (damage: number, affliction: Affliction): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (ctx.flip()) ctx.inflict(affliction);
  },
});

/** Base damage, and the Defending Pokémon always gets `affliction`. */
export const inflicts = (damage: number, affliction: Affliction): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.inflict(affliction);
  },
});

/** Base damage; on tails the attacker also damages itself. */
export const tailsSelfDamage = (damage: number, self: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (!ctx.flip()) ctx.selfDamage(self);
  },
});

/** Base damage, and the attacker always damages itself. */
export const recoil = (damage: number, self: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.selfDamage(self);
  },
});

/** Flip `coins` coins; `damage` times the number of heads. */
export const perHeads = (coins: number, damage: number): AttackEffect => ({
  run: (ctx) => void ctx.hit(damage * ctx.flips(coins)),
});

/** Heads: +10 damage. Tails: base damage and 10 to itself (Thrash, Thunderpunch). */
export const thrash = (damage: number): AttackEffect => ({
  run(ctx) {
    if (ctx.flip()) ctx.hit(damage + 10);
    else {
      ctx.hit(damage);
      ctx.selfDamage(10);
    }
  },
});

/** Discards energy to use, then deals base damage (Ember, Flamethrower, Fire Spin…). */
export const discardToUse = (damage: number, count: number | 'all', type: EnergyType | undefined, text?: string): AttackEffect => ({
  text,
  discard: { count, type },
  run: (ctx) => void ctx.hit(damage),
});

/** On heads, an effect on the attacker for the opponent's next turn (Withdraw, Agility…), after base damage. */
export const flipToProtect = (damage: number, key: 'preventDamage' | 'preventAll'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    if (ctx.flip()) ctx.protect(key);
  },
});

/** "Discard 1 <type> Energy card … Remove all damage counters" (Recover). */
export const recover = (type: EnergyType, text: string): AttackEffect => ({
  text,
  discard: { count: 1, type },
  run: (ctx) => ctx.heal('all'),
});

/**
 * Energy of `type` attached to the attacker but not needed for the attack's cost (colorless
 * cost is paid with other energy first), up to `cap`. For Hydro Pump and Water Gun.
 */
export function extraEnergy(ctx: AttackContext, cost: EnergyType[], type: EnergyType, cap: number): number {
  // A Transformed Ditto may treat all its Energy as `type`.
  const pool = energyPool(ctx.attacker, ctx.state.cards).map((t) => (ctx.attacker.transformed ? type : t));
  const take = (match: (t: PoolEnergy) => boolean) => {
    const i = pool.findIndex(match);
    if (i >= 0) pool.splice(i, 1);
    return i >= 0;
  };
  // Rainbow Energy ('any') counts as `type` too, so it pays other symbols only when nothing else can.
  for (const need of cost.filter((t) => t !== 'colorless')) take((t) => t === need) || take((t) => t === 'any');
  for (const _ of cost.filter((t) => t === 'colorless')) {
    if (pool.some((t) => !counts(t, type))) take((t) => !counts(t, type));
    else take(() => true);
  }
  return Math.min(cap, pool.filter((t) => counts(t, type)).length);
}

/** Opponent's benched Pokémon slots. */
export const benchedSlots = (bench: readonly unknown[]) => bench.flatMap((p, i) => (p ? [i] : []));

const defenderEnergyChoice = (s: AttackSituation): ChoiceSpec[] =>
  s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy to discard from the Defending Pokémon' }] : [];

/** Base damage, then discard 1 Energy from the Defending Pokémon (Whirlpool, Hyper Beam). */
export const discardDefenderEnergy = (damage: number): AttackEffect => ({
  choices: defenderEnergyChoice,
  run(ctx) {
    ctx.hit(damage);
    if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
  },
});

/** Damage to the defender, every benched Pokémon on both sides, and itself. */
export const selfdestruct = (damage: number, bench: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.benchDamage(ctx.opp, bench);
    ctx.benchDamage(ctx.me, bench);
    ctx.selfDamage(damage);
  },
});

/**
 * The opponent switches the Defending Pokémon with a benched one of their choice (Whirlwind, Terror Strike).
 * With one benched Pokémon it comes straight in; otherwise the opponent picks it once the attack is over,
 * and the turn ends after that (`source` names the attack).
 */
export function opponentSwitches(ctx: AttackContext, source: string) {
  const slots = benchedSlots(ctx.opp.bench);
  if (!slots.length || !ctx.opp.active) return;
  if (slots.length === 1) return ctx.switchDefender(slots[0]!);
  if (ctx.canAffect(ctx.opp, ctx.opp.active)) ctx.opponentChooses({ kind: 'switchIn', source });
}

/** Base damage, then the opponent switches the Defending Pokémon with a benched one of their choice. */
export const whirlwind = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    opponentSwitches(ctx, 'Whirlwind');
  },
});

/** Choose 1 of the opponent's benched Pokémon, if they have any (Lure, Dark Mind…). */
export const opponentBenchChoice = (s: AttackSituation, prompt: string): ChoiceSpec[] => {
  const options = benchedSlots(s.opponentBench);
  return options.length ? [{ kind: 'opponentBench', options, prompt }] : [];
};

/** Switch one of the opponent's benched Pokémon (the attacker chooses) with the Defending Pokémon. */
export const lure: AttackEffect = {
  choices: (s) => opponentBenchChoice(s, "Choose one of your opponent's benched Pokémon to switch in"),
  run(ctx) {
    if (ctx.choices.benchSlot !== undefined) ctx.switchDefender(ctx.choices.benchSlot);
  },
};

/** Base damage, then `bench` damage to 1 of the opponent's benched Pokémon (Dark Mind, Stretch Kick, Spark). */
export const benchTarget = (damage: number, bench: number): AttackEffect => ({
  choices: (s) => opponentBenchChoice(s, `Choose one of your opponent's benched Pokémon to do ${bench} damage to`),
  run(ctx) {
    ctx.hit(damage);
    if (ctx.choices.benchSlot !== undefined) ctx.damageBenched(ctx.opp, ctx.choices.benchSlot, bench);
  },
});

/** Removes damage counters equal to the damage done (Leech Life). */
export const leechLife = (damage: number): AttackEffect => ({
  run: (ctx) => ctx.heal(ctx.hit(damage)),
});

/** Base damage; unless it was all prevented, remove 1 damage counter from the attacker (Leech Seed). */
export const leechSeed = (damage: number): AttackEffect => ({
  run(ctx) {
    if (ctx.hit(damage) > 0) ctx.heal(10);
  },
});

/** "If Spearow was attacked last turn, do the final result of that attack to the Defending Pokémon." */
export const mirrorMove: AttackEffect = {
  run(ctx) {
    const last = ctx.attacker.effects?.attackedOn;
    if (!last || last.turn !== ctx.turn - 1 || (last.damage === 0 && last.afflictions.length === 0)) {
      return ctx.log('Mirror Move had nothing to reflect.');
    }
    // The final result already includes weakness and resistance, so they aren't applied again.
    if (last.damage) ctx.hit(last.damage, { weakness: false });
    for (const a of last.afflictions) ctx.inflict(a);
  },
};

/** Flips until tails and returns the number of heads (capped, in case of a very long run of heads). */
export function headsUntilTails(ctx: AttackContext): number {
  let heads = 0;
  while (heads < 100 && ctx.flip()) heads++;
  return heads;
}

/** Search the deck for a Basic Pokémon and put it onto the Bench (Call for Family, Sprout, Call for Friend). */
export const benchSearch = (source: string, find: Pick<Extract<PendingChoice, { kind: 'pickFromDeck' }>, 'filter' | 'name' | 'type'>): AttackEffect => ({
  blocked: (s) => (s.ownBench.every(Boolean) ? 'Your Bench is full' : null),
  run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source, ...find, toBench: true }),
});
