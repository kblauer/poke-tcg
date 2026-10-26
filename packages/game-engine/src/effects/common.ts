// Building blocks for attack effects that many cards share.
import { targetsIn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import type { PendingChoice } from '../trainers.js';
import type { PowerSituation } from '../powers.js';
import { isBasicEnergy, lookupCard, type CardLibrary, type EnergyType } from '../cards.js';
import { counts, energyPool, type Affliction, type InPlayPokemon, type PlayerState, type PoolEnergy, type Target } from '../engine.js';
import { energyProtected, openBenchSlot, pokemonName } from '../status.js';

/** Every Pokémon in play on a side. */
export const inPlay = (side: Pick<PlayerState, 'active' | 'bench'>) => [side.active, ...side.bench].filter((p): p is InPlayPokemon => !!p);

/** Where the Pokémon is on its player's side (-1 if it isn't there). */
export const targetOf = (owner: { active: unknown; bench: unknown[] }, pokemon: unknown): Target => (owner.active === pokemon ? 'active' : owner.bench.indexOf(pokemon));

/** Energy cards attached to a Pokémon (not a Pokémon attached as Energy). */
export const energyCards = (p: InPlayPokemon) => p.energy.filter((e) => !e.provides);

/** Basic Energy cards attached to a Pokémon (not a Pokémon attached as Energy). */
export const basicEnergyOn = (cards: CardLibrary, p: InPlayPokemon) => p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(cards, e.defId)));

/** A Poké-Body: always on, whatever its Pokémon's Special Conditions. */
export const POKE_BODY = { ignoresConditions: true, body: true } as const;

/** "If [it] is your Active Pokémon" / "on your Bench": why a power can't be used from where its Pokémon is. */
export const onlyActive = (s: PowerSituation, name: string) => (s.source === 'active' ? null : `${name} must be your Active Pokémon`);
export const onlyBenched = (s: PowerSituation, name: string) => (s.source !== 'active' ? null : `${name} must be on your Bench`);

/** Another set's attack, read when used (the effect tables can't be read while the modules load). */
export const same = (get: () => AttackEffect | undefined): AttackEffect => ({
  blocked: (s) => get()?.blocked?.(s) ?? null,
  choices: (s, c) => get()?.choices?.(s, c) ?? [],
  run: (ctx) => get()?.run(ctx),
});

/** Damage to one of the opponent's Pokémon: the Active one without Weakness and Resistance (`swift`: without anything else on it either). */
export function damageOpponent(ctx: AttackContext, target: Target, amount: number, swift = false) {
  if (target === 'active') ctx.hit(amount, swift ? { swift } : { weakness: false });
  else ctx.damageBenched(ctx.opp, target, amount);
}

/**
 * Damage to one of the opponent's Pokémon, as the later sets print it ("Don't apply Weakness and Resistance for Benched
 * Pokémon"): the Active one with Weakness and Resistance, a Benched one without.
 */
export function damageChosen(ctx: AttackContext, target: Target, amount: number) {
  if (target === 'active') ctx.hit(amount);
  else ctx.damageBenched(ctx.opp, target, amount);
}

/** "Choose 1 of your opponent's Pokémon": a choice of any of them. */
export const opponentTargets = (s: AttackSituation, prompt: string): ChoiceSpec[] => [{ kind: 'opponentPokemon', options: targetsIn(s.defender, s.opponentBench), prompt }];

/**
 * Whether an attack may move an Energy card off this Pokémon of the opponent's (to another of their Pokémon, their hand or
 * their deck): Brock's Protection keeps it (logged). Discards go through neo3's `energyCanGo`, which also checks Unown K's Keep.
 */
export function energyCanMove(ctx: AttackContext, p: InPlayPokemon): boolean {
  if (!energyProtected(ctx.state.cards, p)) return true;
  ctx.log(`Brock's Protection: ${pokemonName(ctx.state, p)}'s Energy can't be removed.`, ctx.opp.id);
  return false;
}

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
  blocked: (s) => (openBenchSlot({ bench: s.ownBench, benchLimit: s.ownBenchLimit }, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
  run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source, ...find, toBench: true }),
});

/** Steel Wing, Teary Eyes, Flame Screen: `amount` less damage to the attacker during the opponent's next turn, after Weakness and Resistance. */
export const guardNext = (damage: number, amount: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    (ctx.attacker.effects ??= {}).reduceDamage = { amount, until: ctx.turn + 1 };
    ctx.log(`Damage to ${ctx.attackerDef.name} is reduced by ${amount} next turn.`);
  },
});

/** "During your opponent's next turn, any damage done by attacks from the Defending Pokémon is reduced by N (before Weakness and Resistance)" (Charm, Delta Reduction, Negative Ion). */
export const charmFor = (damage: number, amount: number): AttackEffect => ({
  run(ctx) {
    if (damage) ctx.hit(damage);
    ctx.affectDefender((e) => {
      e.charm = { amount, until: ctx.turn + 1 };
      ctx.log(`${ctx.defenderDef.name}'s attacks do ${amount} less damage next turn.`, ctx.opp.id);
    });
  },
});
