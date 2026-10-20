// Southern Islands (si1) attack effects, by card id and attack name. Rulings follow the card text (the Neo-era rulebook).
// Attacks that only deal damage need no entry. TCGdex has no attacks for Marill (Squirt and Rolling Tackle are added by the
// seed's TCGDEX_FIXES) and lists Tentacruel's two attacks twice (the API keeps the first of each name); Tentacruel's
// Poison Sting Paralyzes, as printed.
// Rulings (from the text): Rainbow Wave's type is one an attached Energy provides (Rainbow Energy: any but Colorless), and
// it hits the Defending Pokémon and the Benched ones of that type alike. Strange Scent's players each remove their 3
// damage counters one at a time (no question when it's all of them, or all on one Pokémon), the attacking player first.
// Questions whose answer depends on a flip are asked before it (Lick Wounds, Tongue Stretch, Paradise Pollen), as in Neo
// Genesis. Gentle Song heals the Defending Pokémon as an effect of the attack, so whatever stops those stops it.
import { targetsIn, pokemonOn, type AttackContext, type AttackEffect, type AttackSituation, type ChoiceSpec } from '../attacks.js';
import { counts, energyPool, type InPlayPokemon, type PlayerState, type PoolEnergy } from '../engine.js';
import type { EnergyType } from '../cards.js';
import { inPlayDef, pokemonName } from '../status.js';
import { benchedSlots, extraEnergy, flipToInflict, flipToProtect, lure, perHeads } from './common.js';
import { flipForMore } from './jungle.js';
import { damageOpponent, opponentTargets } from './neo1.js';
import { flipOrNothing } from './rocket.js';

/** Every type but Colorless, for questions about a type. */
export const TYPES: EnergyType[] = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal'];

/** Heads: no damage or effects to the attacker next turn, and base damage; tails: nothing at all (Fly). */
export const fly = (damage: number): AttackEffect => ({
  run(ctx) {
    if (!ctx.flip()) return ctx.log('Fly did nothing.');
    ctx.hit(damage);
    ctx.protect('preventAll');
  },
});

/** Base damage; heads gives the Defending Pokémon one condition, tails another (Rainbow Powder, Horrid Pollen). */
export const eitherCondition = (damage: number, heads: 'asleep' | 'confused' | 'paralyzed' | 'poisoned', tails: 'asleep' | 'confused' | 'paralyzed' | 'poisoned'): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    ctx.inflict(ctx.flip() ? heads : tails);
  },
});

/** Removes up to `amount` damage from one of `owner`'s Pokémon (as an attack's effect on its own player's side). */
export function healUpTo(ctx: AttackContext, owner: PlayerState, p: InPlayPokemon, amount: number) {
  const healed = Math.min(amount, p.damage);
  if (!healed) return;
  p.damage -= healed;
  ctx.log(`${pokemonName(ctx.state, p)} healed ${healed} damage.`, owner.id);
}

/** Removes up to `amount` damage from the Defending Pokémon, as an effect of the attack (Gentle Song, Present). */
export function healDefender(ctx: AttackContext, amount: number | 'all') {
  ctx.affectDefender(() => {
    const defender = ctx.opp.active!;
    healUpTo(ctx, ctx.opp, defender, amount === 'all' ? defender.damage : amount);
  });
}

/** `player`'s Pokémon in play with damage counters. */
const damaged = (player: PlayerState) => [player.active, ...player.bench].filter((p): p is InPlayPokemon => !!p && p.damage >= 10);

/**
 * `player` removes `count` damage counters from among their Pokémon (all of them, if fewer): at once when there's nothing
 * to choose, otherwise one at a time on the board (removeDamage), after the attack; `first`: the attacking player is asked
 * now, the opponent once that's done.
 */
function removeCounters(ctx: AttackContext, player: PlayerState, count: number, source: string, first: boolean) {
  const hurt = damaged(player);
  const total = hurt.reduce((n, p) => n + p.damage, 0);
  if (!hurt.length) return;
  if (total <= 10 * count || hurt.length === 1) {
    for (const p of hurt) healUpTo(ctx, player, p, 10 * count);
    return;
  }
  const choice = { source, kind: 'removeDamage', count } as const;
  if (player === ctx.me) ctx.pend(choice);
  else if (first) ctx.opponentChooses(choice);
  else (ctx.state.queuedChoices ??= []).push({ ...choice, player: player.id });
}

/** The types the attacker's Energy provides, but Colorless (Rainbow Energy: every type). */
const attachedTypes = (s: Pick<AttackSituation, 'attacker' | 'cards'>) => {
  const pool = energyPool(s.attacker, s.cards);
  return TYPES.filter((t) => pool.some((e: PoolEnergy) => counts(e, t)));
};

/** The opponent's Pokémon in play of `type`, by target. */
const opponentOfType = (ctx: AttackContext, type: EnergyType) => targetsIn(ctx.opp.active, ctx.opp.bench).filter((t) => inPlayDef(ctx.state.cards, pokemonOn(ctx.opp.active, ctx.opp.bench, t)!).type === type);

/** `amount` damage (no Weakness or Resistance) to each of the opponent's Pokémon at `targets` (Rainbow Wave, Core Stream). */
export function damageEach(ctx: AttackContext, targets: ReturnType<typeof targetsIn>, amount: number) {
  for (const t of targets) damageOpponent(ctx, t, amount);
}

/** Pokémon in play with damage counters on one side, to choose 1 of. */
const damagedOn = (active: InPlayPokemon | null, bench: (InPlayPokemon | null)[]) => targetsIn(active, bench).filter((t) => (pokemonOn(active, bench, t)?.damage ?? 0) >= 10);

export const SI1: Record<string, Record<string, AttackEffect>> = {
  // Mew
  'si1-1': {
    'Rainbow Wave': {
      choices(s): ChoiceSpec[] {
        const options = attachedTypes(s);
        return options.length > 1 ? [{ kind: 'type', options, prompt: 'Choose a type of Energy attached to Mew: 20 damage to each of your opponent\'s Pokémon of that type' }] : [];
      },
      run(ctx) {
        const type = ctx.choices.type ?? attachedTypes({ attacker: ctx.attacker, cards: ctx.state.cards })[0];
        if (!type) return ctx.log('Rainbow Wave had no type to choose.');
        const targets = opponentOfType(ctx, type);
        if (!targets.length) return ctx.log(`Your opponent has no ${type[0]!.toUpperCase()}${type.slice(1)} Pokémon in play.`);
        damageEach(ctx, targets, 20);
      },
    },
  },
  // Pidgeot
  'si1-2': { 'Supersonic Flight': flipOrNothing(40) },
  // Onix
  'si1-3': { Slam: perHeads(2, 20), 'Body Slam': flipToInflict(40, 'paralyzed') },
  // Togepi
  'si1-4': { Bawl: flipToInflict(10, 'confused') },
  // Ivysaur
  'si1-5': {
    'Strange Scent': {
      run(ctx) {
        const mine = ctx.flip();
        const theirs = ctx.oppFlip();
        if (mine) removeCounters(ctx, ctx.me, 3, 'Strange Scent', true);
        if (theirs) removeCounters(ctx, ctx.opp, 3, 'Strange Scent', !ctx.state.pendingChoice);
        if (!mine && !theirs) ctx.log('Strange Scent did nothing.');
      },
    },
  },
  // Raticate
  'si1-6': { 'Sharp Teeth': flipForMore(10, 30) },
  // Ledyba
  'si1-7': { Agility: flipToProtect(20, 'preventAll') },
  // Jigglypuff
  'si1-8': { 'Tempting Eyes': lure, Sing: flipToInflict(0, 'asleep') },
  // Butterfree
  'si1-9': { Fly: fly(30), 'Rainbow Powder': eitherCondition(20, 'paralyzed', 'poisoned') },
  // Tentacruel: Poison Sting Paralyzes, as printed.
  'si1-10': {
    'Tentacle Grip': {
      run(ctx) {
        const water = energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'water')).length;
        const heads = ctx.flips(water);
        if (heads) ctx.draw(2 * heads);
        else ctx.log('Tentacle Grip drew nothing.');
      },
    },
    'Poison Sting': flipToInflict(20, 'paralyzed'),
  },
  // Marill
  'si1-11': {
    Squirt: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 10 damage to"),
      run: (ctx) => damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 10),
    },
  },
  // Lapras
  'si1-12': {
    'Gentle Song': {
      run(ctx) {
        healUpTo(ctx, ctx.me, ctx.attacker, 20);
        healDefender(ctx, 20);
        ctx.inflict('asleep');
      },
    },
    'Ice Beam': flipToInflict(20, 'paralyzed'),
  },
  // Exeggutor
  'si1-13': {
    Sharpshooter: {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do the damage to"),
      run(ctx) {
        const grass = energyPool(ctx.attacker, ctx.state.cards).filter((e) => counts(e, 'grass')).length;
        const heads = ctx.flips(grass);
        if (!heads) return ctx.log('Sharpshooter did no damage.');
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 10 * heads);
      },
    },
  },
  // Slowking
  'si1-14': {
    Revelation: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Revelation did nothing.');
        ctx.pend({ kind: 'pickFromDeck', source: 'Revelation', filter: 'trainer', reveal: true });
      },
    },
    Psychic: { run: (ctx) => void ctx.hit(10 + 10 * ctx.defender.energy.length) },
  },
  // Wartortle
  'si1-15': { 'Water Gun': { run: (ctx) => void ctx.hit(20 + 10 * extraEnergy(ctx, ['water', 'water'], 'water', 2)) } },
  // Lickitung
  'si1-16': {
    'Lick Wounds': {
      choices(s, c): ChoiceSpec[] {
        const own = damagedOn(s.attacker, s.ownBench);
        const theirs = damagedOn(s.defender, s.opponentBench);
        const sides = [...(own.length ? (['own'] as const) : []), ...(theirs.length ? (['opponent'] as const) : [])];
        if (!sides.length) return [];
        const side = c.side ?? (sides.length === 1 ? sides[0] : undefined);
        const specs: ChoiceSpec[] = sides.length > 1 ? [{ kind: 'side', options: [...sides], prompt: 'Remove 2 damage counters (if heads) from whose Pokémon?' }] : [];
        if (side === 'own') specs.push({ kind: 'ownPokemon', options: own, prompt: 'Choose one of your Pokémon to remove 2 damage counters from (if heads)' });
        if (side === 'opponent') specs.push({ kind: 'opponentPokemon', options: theirs, prompt: "Choose one of your opponent's Pokémon to remove 2 damage counters from (if heads)" });
        return specs;
      },
      run(ctx) {
        const { ownTarget, oppTarget } = ctx.choices;
        if (ownTarget === undefined && oppTarget === undefined) return ctx.log('No Pokémon has damage counters.');
        if (!ctx.flip()) return ctx.log('Lick Wounds did nothing.');
        if (ownTarget !== undefined) return healUpTo(ctx, ctx.me, pokemonOn(ctx.me.active, ctx.me.bench, ownTarget)!, 20);
        if (oppTarget === 'active') return healDefender(ctx, 20);
        const p = pokemonOn(ctx.opp.active, ctx.opp.bench, oppTarget!)!;
        if (ctx.canAffect(ctx.opp, p)) healUpTo(ctx, ctx.opp, p, 20);
      },
    },
    'Tongue Stretch': {
      choices: (s) => opponentTargets(s, "Choose one of your opponent's Pokémon to do 20 damage to (if heads)"),
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Tongue Stretch did nothing.');
        damageOpponent(ctx, ctx.choices.oppTarget ?? 'active', 20);
      },
    },
  },
  // Vileplume
  'si1-17': {
    'Paradise Pollen': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.ownBench).filter((i) => s.ownBench[i]!.damage >= 10);
        return options.length ? [{ kind: 'ownBench', options, prompt: 'Choose one of your benched Pokémon to remove 2 damage counters from (if heads)' }] : [];
      },
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Paradise Pollen did nothing.');
        healUpTo(ctx, ctx.me, ctx.attacker, 20);
        const slot = ctx.choices.ownBenchSlot;
        const benched = slot === undefined ? null : ctx.me.bench[slot];
        if (benched) healUpTo(ctx, ctx.me, benched, 20);
      },
    },
    'Horrid Pollen': eitherCondition(30, 'paralyzed', 'confused'),
  },
  // Primeape
  'si1-18': {
    Rampage: {
      run(ctx) {
        ctx.hit(20 + ctx.attacker.damage);
        if (!ctx.flip()) ctx.confuseSelf();
      },
    },
  },
};
