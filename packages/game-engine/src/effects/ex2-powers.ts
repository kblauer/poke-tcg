// EX Sandstorm (ex2) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never
// do (`body`, `ignoresConditions`), as in EX Ruby & Sapphire (ex1-powers.ts).
// Agreed with the user: Lunar Eclipse's Solrock and Solar Eclipse's Lunatone, and Glowing Screen's and Uplifting Glow's
// partners, must be their owner's own; Energy Variation makes Kecleon every type of basic Energy card attached (Weakness and
// Resistance apply if any of them matches, Low Pressure System counts it; inPlayDef); Baby Evolution can be used on the
// player's first turn and the turn the baby was played, unlike evolving from the hand (it's still evolving: Prehistoric
// Power, Primal Aura and Primal Stare stop it); a named Pokémon matches every variant of it, never a Pokémon-ex (namesMatch).
// From the text: Poison Payback and Fire Veil work even when the Attacking Pokémon Knocks it Out (as Rough Skin); Fan Away
// returns the Energy card its player picks; Super Suction Cups is Guard; Primal Lock also discards the opponent's Pokémon Tools.
import { conditionProof, lookupCard, namesMatch, type CardLibrary } from '../cards.js';
import { afflictionBlocked, type CardInstance, type InPlayPokemon, type PlayerState } from '../engine.js';
import { evolutionBlocked, playedFromHand, offerChainReaction, pokemonAt, powerActive, primalBlock, type PowerContext, type PowerEffect, type PowerSituation, pokemonPower } from '../powers.js';
import { powerEffect } from './index.js';
import { addLog, effectId, inPlayDef, pokemonName } from '../status.js';
import { evolveWith } from '../trainers.js';
import type { AttackContext } from '../attacks.js';
import { POKE_BODY } from './common.js';

export { POKE_BODY };

/**
 * Poison Payback, Fire Veil: as its player's Active Pokémon, damaged by the opponent's attack (even Knocked Out), the
 * Attacking Pokémon is now Poisoned (or Burned), unless it can't be.
 */
export const payback = (condition: 'poisoned' | 'burned'): PowerEffect => ({
  ...POKE_BODY,
  onAttackDamage(ctx: AttackContext, pokemon) {
    if (ctx.opp.active !== pokemon || ctx.me.active !== ctx.attacker) return;
    const name = ctx.attackerDef.name;
    const working = powerActive(ctx.attacker, ctx.state.cards, [ctx.me, ctx.opp]) ? pokemonPower(ctx.attacker) : undefined;
    if (conditionProof(ctx.attackerDef) || working?.noConditions || (condition === 'poisoned' && working?.noPoison)) return ctx.log(`${name} can't be ${condition === 'burned' ? 'Burned' : 'Poisoned'}.`);
    if (condition === 'burned') ctx.attacker.burned = true;
    else ctx.attacker.poison = Math.max(ctx.attacker.poison ?? 0, 10);
    ctx.log(`${pokemonName(ctx.state, pokemon)}'s ${inPlayDef(ctx.state.cards, pokemon).power!.name}: ${name} is now ${condition === 'burned' ? 'Burned' : 'Poisoned'}.`);
  },
});

/** Whether `owner` has a Pokémon called `name` (or a variant) in play. */
export const hasInPlay = (owner: Pick<PlayerState, 'active' | 'bench'>, cards: CardLibrary, name: string) =>
  [owner.active, ...owner.bench].some((p) => p && namesMatch(inPlayDef(cards, p).name, name));

/** Lunar Eclipse, Solar Eclipse: once a turn, with its partner in its player's play, its type is `type` until the end of the turn. */
const eclipse = (partner: string, type: 'darkness' | 'fire'): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) => (hasInPlay(s.me, s.cards, partner) ? null : `${partner} isn't in play`),
  use(ctx) {
    ctx.source.crystalType = type;
    ctx.log(`${pokemonName(ctx.state, ctx.source)} is a ${type === 'fire' ? 'Fire' : 'Darkness'} Pokémon until the end of the turn.`);
  },
});

/** The cards in the hand Baby Evolution can put onto the baby: `name`, or a variant of it (never a Pokémon-ex). */
const babyCards = (s: Pick<PowerSituation, 'me' | 'cards'>, name: string | string[]): CardInstance[] =>
  s.me.hand.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return d.kind === 'pokemon' && !d.trainerText && [name].flat().some((n) => namesMatch(d.name, n));
  });

/**
 * Baby Evolution: once during the player's turn, `name` from the hand is put onto the baby (evolving it) and all its damage
 * counters are removed. It can be used on the first turn and the turn the baby was played (agreed).
 */
export const babyEvolution = (name: string | string[]): PowerEffect => ({
  oncePerTurn: true,
  blocked(s) {
    const source = pokemonAt(s.me, s.source);
    if (!babyCards(s, name).length) return `No ${[name].flat().join(' or ')} in your hand`;
    const blocked = evolutionBlocked([s.me, s.opp], s.cards, true) ?? (source && primalBlock(source, [s.me, s.opp], s.cards));
    if (blocked) return blocked;
    return source?.effects?.noEvolve !== undefined ? `${inPlayDef(s.cards, source).name} can't evolve this turn` : null;
  },
  choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: babyCards(s, name), prompt: `Choose ${[name].flat().join(' or ')} from your hand` }],
  use(ctx) {
    const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
    if (!card) return;
    ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
    evolveWith(ctx.state, ctx.me, ctx.source, card, 'with Baby Evolution');
    if (ctx.source.damage) {
      ctx.source.damage = 0;
      ctx.log(`Removed all damage counters from ${pokemonName(ctx.state, ctx.source)}.`);
    }
    playedFromHand(ctx.state, ctx.me, ctx.source);
    if (!ctx.state.pendingChoice) offerChainReaction(ctx.state);
  },
});

/** Its Retreat Cost is 0 while `when` holds (Uplifting Glow, Levitate). */
export const freeRetreat = (when: (pokemon: InPlayPokemon, cards: CardLibrary, owner: Pick<PlayerState, 'active' | 'bench'>) => boolean): PowerEffect => ({
  ...POKE_BODY,
  retreatChange: (pokemon, cards, owner) => (when(pokemon, cards, owner) ? -(inPlayDef(cards, pokemon).retreatCost ?? 0) : 0),
});

/** A Special Condition on the opponent's Active Pokémon from a power, unless it can't be affected (Chaos Flash). */
export function afflictActive(ctx: PowerContext, condition: 'confused') {
  const p = ctx.opp.active;
  if (!p) return;
  const name = pokemonName(ctx.state, p);
  const blocked = afflictionBlocked(ctx.state, ctx.opp.id, p, condition);
  if (blocked) return addLog(ctx.state, blocked, ctx.opp.id);
  p.condition = condition;
  delete p.paralyzedTurn;
  addLog(ctx.state, `${name} is now Confused.`, ctx.opp.id);
}

export const EX2_POWERS: Record<string, PowerEffect> = {
  // Claw Fossil – Jagged Stone: damaged by the opponent's attack as its player's Active Pokémon, a damage counter on the attacker.
  'ex2-90': {
    ...POKE_BODY,
    onAttackDamage(ctx, damaged) {
      if (damaged !== ctx.opp.active) return;
      ctx.attacker.damage += 10;
      ctx.log(`Jagged Stone put a damage counter on ${ctx.attackerDef.name}.`, ctx.opp.id);
    },
  },
  // Root Fossil – Spongy Stone: a damage counter off it between turns.
  'ex2-92': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (!pokemon.damage) return;
      pokemon.damage -= 10;
      addLog(state, `Spongy Stone removed a damage counter from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Armaldo – Primal Veil: as the Active Pokémon, neither player can play Supporter cards (supportersVeiled).
  'ex2-1': { ...POKE_BODY, primalVeil: true },
  // Cacturne, Cacnea – Poison Payback.
  'ex2-2': payback('poisoned'),
  'ex2-57': payback('poisoned'),
  // Cradily – Super Suction Cups: as the Active Pokémon, the opponent's Active Pokémon can't retreat (Guard).
  'ex2-3': { ...POKE_BODY, guard: true },
  // Ludicolo, Lombre, Lotad – Rain Dish: a damage counter off between turns.
  'ex2-7': { ...POKE_BODY, rainDish: 10 },
  'ex2-45': { ...POKE_BODY, rainDish: 10 },
  'ex2-66': { ...POKE_BODY, rainDish: 10 },
  // Lunatone – Lunar Eclipse; Solrock – Solar Eclipse.
  'ex2-8': eclipse('Solrock', 'darkness'),
  'ex2-13': eclipse('Lunatone', 'fire'),
  // Shiftry – Fan Away: once a turn, heads returns an Energy card attached to the Defending Pokémon to the opponent's hand.
  'ex2-12': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active?.energy.length ? null : 'The Defending Pokémon has no Energy cards attached'),
    choices: (s) => [{ kind: 'attachedEnergy', field: 'energyUid', options: s.opp.active!.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to return (if heads)' }],
    use(ctx) {
      const defender = ctx.opp.active;
      const card = defender?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!ctx.flip() || !defender || !card) return ctx.log('Fan Away did nothing.');
      defender.energy = defender.energy.filter((e) => e !== card);
      const { provides: _, ...returned } = card;
      ctx.opp.hand.push(returned);
      ctx.log(`Returned ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, defender)} to the opponent's hand.`);
    },
  },
  // Zangoose – Poison Resistance.
  'ex2-14': { ...POKE_BODY, noPoison: true },
  // Arcanine, Growlithe – Fire Veil.
  'ex2-15': payback('burned'),
  'ex2-65': payback('burned'),
  // Golduck – Chaos Flash: once a turn, as the Active Pokémon, heads Confuses the Defending Pokémon.
  'ex2-17': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Golduck must be your Active Pokémon' : s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use: (ctx) => (ctx.flip() ? afflictActive(ctx, 'confused') : ctx.log('Chaos Flash did nothing.')),
  },
  // Kecleon – Energy Variation: every type of basic Energy card attached (inPlayDef).
  'ex2-18': { ...POKE_BODY },
  // Pichu, Azurill, Elekid, Wynaut – Baby Evolution.
  'ex2-20': babyEvolution('Pikachu'),
  'ex2-31': babyEvolution('Marill'),
  'ex2-36': babyEvolution('Electabuzz'),
  'ex2-54': babyEvolution('Wobbuffet'),
  // Wobbuffet – Safeguard: attacks by the opponent's Pokémon-ex don't affect it.
  'ex2-26': { ...POKE_BODY, guardFrom: 'ex' },
  // Arbok – Intimidating Fang.
  'ex2-29': { ...POKE_BODY, intimidatingFang: 10 },
  // Illumise – Glowing Screen: with its player's Volbeat in play, 30 less from Fighting and Darkness Pokémon's attacks.
  'ex2-38': { ...POKE_BODY, partnerGuard: { partner: 'Volbeat', types: ['fighting', 'darkness'], amount: 30 } },
  // Kabuto – Exoskeleton: 20 less attack damage, after Weakness and Resistance.
  'ex2-39': { ...POKE_BODY, damageReduction: 20 },
  // Volbeat – Uplifting Glow: with its player's Illumise in play, its Retreat Cost is 0.
  'ex2-53': freeRetreat((_, cards, owner) => hasInPlay(owner, cards, 'Illumise')),
  // Xatu – Healing Wind: once a turn, a damage counter off the player's Active Pokémon.
  'ex2-55': {
    oncePerTurn: true,
    use(ctx) {
      const active = ctx.me.active;
      if (!active?.damage) return ctx.log('Healing Wind did nothing.');
      active.damage -= 10;
      ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, active)}.`);
    },
  },
  // Aerodactyl ex – Primal Lock: the opponent can't play Pokémon Tools, and theirs are discarded (trainerError, dropLockedTools).
  'ex2-94': { ...POKE_BODY, primalLock: true },
};
