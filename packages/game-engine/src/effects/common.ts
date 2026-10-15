// Building blocks for attack effects that many cards share.
import type { AttackContext, AttackEffect } from '../attacks.js';
import type { EnergyType } from '../cards.js';
import { energyPool, type Affliction } from '../engine.js';

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
  const pool = energyPool(ctx.attacker, ctx.state.cards);
  const take = (match: (t: EnergyType) => boolean) => {
    const i = pool.findIndex(match);
    if (i >= 0) pool.splice(i, 1);
  };
  for (const need of cost.filter((t) => t !== 'colorless')) take((t) => t === need);
  for (const _ of cost.filter((t) => t === 'colorless')) {
    if (pool.some((t) => t !== type)) take((t) => t !== type);
    else take(() => true);
  }
  return Math.min(cap, pool.filter((t) => t === type).length);
}

/** Opponent's benched Pokémon slots. */
export const benchedSlots = (bench: readonly unknown[]) => bench.flatMap((p, i) => (p ? [i] : []));
