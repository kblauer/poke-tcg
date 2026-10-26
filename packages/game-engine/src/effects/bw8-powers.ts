// Plasma Storm (bw8) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY): it works whatever its
// Pokémon's Special Conditions, and the older effects that stop Pokémon Powers, Poké-Powers or Poké-Bodies don't stop it.
// From the text: Fair-Weather Heal heals one of the player's Pokémon with Grass Energy attached (Energy provided); Freefloating
// and Free Flight need no Energy attached at all; Rough Skin works even if the Attacking Pokémon Knocks Sharpedo Out (as EX Ruby
// & Sapphire's); Final Wish, Spiteful Spirit and Aftermath react to a Knock Out by the opponent's attack's damage only
// (`onKnockedOutByAttack`), Final Wish's search asked between turns, Spiteful Spirit only from the Active Spot; Dual Brains lets
// its player play 2 Supporter cards a turn, however many Magnezone (trainerError); Night Sight draws 1 card once a turn
// (as EX Deoxys Ludicolo's Swing Dance); Premonition puts the 2 cards back in the order picked; Dual Armor makes Lucario both
// Fighting and Metal with Metal Energy attached; Plasma Steel covers every Metal Pokémon of its player's, Klinklang too, against
// the opponent's Pokémon-EX only; Moon Guidance evolves one of the player's Pokémon with the usual limits for evolving (as
// Evolution Wish), on heads; Block is Guard; Bright Veil stops the opponent's Item cards choosing their Pokémon or their Energy
// (itemVeiled), and those that do something to them by themselves check it (Hypnotoxic Laser, Escape Rope); Overflow is Space
// Virus (1 more Prize card for a Knock Out by its attack's damage); Big Wing asks the opponent which Pokémon switches in.
import { lookupCard } from '../cards.js';
import { activeLocked, afflictBetweenTurns, counts, energyPool, type InPlayPokemon } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect } from '../powers.js';
import { addLog, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { ABILITY, inPlay, onlyActive } from './common.js';
import { asAbility } from './bw7-powers.js';
import { roughSkin } from './ex1-powers.js';
import { freeRetreat } from './ex2-powers.js';
import { EX8_POWERS } from './ex8-powers.js';

/** Freefloating, Free Flight: with no Energy attached, no Retreat Cost. */
const floats = asAbility(freeRetreat((pokemon) => pokemon.energy.length === 0));

/** One of the player's Pokémon that has damage counters and Grass Energy attached. */
const grassHurt = (p: InPlayPokemon, cards: Parameters<typeof energyPool>[1]) => p.damage > 0 && energyPool(p, cards).some((e) => counts(e, 'grass'));

export const BW8_POWERS: Record<string, PowerEffect> = {
  // Cherrim – Fair-Weather Heal: once a turn, 20 off one of the player's Pokémon with Grass Energy attached.
  'bw8-7': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).some((t) => grassHurt(pokemonAt(s.me, t)!, s.cards)) ? null : 'None of your Pokémon with Grass Energy attached have damage counters'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => grassHurt(pokemonAt(s.me, t)!, s.cards)), prompt: 'Heal 20 damage from' }],
    use(ctx) {
      const p = pokemonAt(ctx.me, ctx.choices.to!);
      if (!p) return;
      const healed = Math.min(20, p.damage);
      p.damage -= healed;
      ctx.log(`Healed ${healed} damage from ${pokemonName(ctx.state, p)}.`);
    },
  },

  // Lampent – Freefloating; Zubat – Free Flight.
  'bw8-22': floats,
  'bw8-53': floats,

  // Ludicolo – Rain Dish: 20 off it between turns.
  'bw8-31': { ...ABILITY, rainDish: 20 },

  // Sharpedo – Rough Skin: as the Active Pokémon, damaged by the opponent's attack, 2 damage counters on the Attacking Pokémon.
  'bw8-33': asAbility(roughSkin(2)),

  // Manaphy – Final Wish: Knocked Out by the opponent's attack, a card from the deck into the hand (asked between turns).
  'bw8-34': {
    ...ABILITY,
    onKnockedOutByAttack(state, owner) {
      if (!owner.deck.length) return;
      (state.queuedChoices ??= []).push({ player: owner.id, source: 'Final Wish', kind: 'pickFromDeck', filter: 'any', betweenTurns: true });
    },
  },

  // Jellicent – Spiteful Spirit: Knocked Out as the Active Pokémon by the opponent's attack, the Attacking Pokémon is Confused and Poisoned.
  'bw8-39': {
    ...ABILITY,
    onKnockedOutByAttack(state, owner, pokemon, taker) {
      if (owner.active !== pokemon || !taker.active) return;
      addLog(state, 'Spiteful Spirit:', owner.id);
      afflictBetweenTurns(state, taker.id, taker.active, 'confused');
      afflictBetweenTurns(state, taker.id, taker.active, 'poisoned');
    },
  },

  // Magnezone – Dual Brains: 2 Supporter cards a turn (trainerError).
  'bw8-46': { ...ABILITY, dualBrains: true },

  // Crobat – Night Sight: once a turn, a card drawn.
  'bw8-55': asAbility(EX8_POWERS['ex8-10']!),

  // Weezing – Aftermath: Knocked Out by the opponent's attack, the top 3 cards of the opponent's deck discarded.
  'bw8-58': {
    ...ABILITY,
    onKnockedOutByAttack(state, owner, _pokemon, taker) {
      const top = taker.deck.splice(0, 3);
      taker.discard.push(...top);
      addLog(state, `Aftermath: discarded the top ${top.length} card${top.length === 1 ? '' : 's'} of the opponent's deck.`, owner.id);
    },
  },

  // Lunatone – Premonition: once a turn, the top 2 cards of the deck looked at and put back in any order.
  'bw8-73': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'arrangeTop', source: 'Premonition', count: 2 }),
  },

  // Lucario – Dual Armor: with Metal Energy attached, it's both Fighting and Metal (refreshHideout).
  'bw8-78': { ...ABILITY, dualArmor: { energy: 'metal', types: ['fighting', 'metal'] } },

  // Klinklang – Plasma Steel: no damage to the player's Metal Pokémon from the opponent's Pokémon-EX's attacks (attacks.ts).
  'bw8-90': { ...ABILITY, plasmaSteel: true },

  // Clefable – Moon Guidance: once a turn, a coin; heads, a card from the deck that evolves from one of the player's Pokémon put onto it.
  'bw8-98': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Moon Guidance: tails.');
      const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
      ctx.pend({ kind: 'evolveMany', source: 'Moon Guidance', names, done: [], once: true, limits: true });
    },
  },

  // Snorlax – Block: as the Active Pokémon, the opponent's Active Pokémon can't retreat (Guard).
  'bw8-101': { ...ABILITY, guard: true },

  // Togekiss – Bright Veil: as the Active Pokémon, the opponent's Item cards do nothing to the player's Pokémon (itemVeiled).
  'bw8-104': { ...ABILITY, brightVeil: true },

  // Lugia-EX – Overflow: 1 more Prize card for a Pokémon its attack's damage Knocks Out (Space Virus).
  'bw8-108': { ...ABILITY, spaceVirus: true },

  // Braviary – Big Wing: once a turn, as the Active Pokémon, the opponent switches their Active Pokémon with a Benched one of their choice.
  'bw8-116': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Braviary') ?? (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    use(ctx) {
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      const slots = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      if (slots.length === 1) return swapActive(ctx.state, ctx.opp, slots[0]!);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Big Wing', kind: 'switchIn' };
    },
  },
};
