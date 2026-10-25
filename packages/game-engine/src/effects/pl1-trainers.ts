// Platinum (pl1) Trainer cards and Special Energy, by card id. Several are the engine's own rules: Broken Time-Space (evolving
// twice in a turn), Galactic HQ (evolving from the hand) and Miasma Valley (PLAY_BENCH) are Stadiums read where they apply;
// Team Galactic's Invention G-101 Energy Gain is a Pokémon Tool read by attackError and discarded from a Pokémon that isn't a
// Pokémon SP (refreshHideout); G-103 Power Spray is played during the opponent's turn, asked as they use a Poké-Power
// (usePower, as Power Cancel).
// From the text: Cyrus's Conspiracy searches for its 3 cards one after another; Level Max finds a Pokémon LV.X for any of the
// player's Pokémon (the usual limits); Life Herb's Pokémon is picked before the flip; Looker's Investigation shows the
// opponent's hand, then asks whose hand is shuffled away; Poké Turn takes any of the player's Pokémon SP, Active or Benched.
import { isPokemonCard, lookupCard } from '../cards.js';
import { activeLock } from '../engine.js';
import { clearSpecialConditions, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { isPokemonSP, targetsOf, type EnergyEffect, type TrainerContext, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { DP1_TRAINERS } from './dp1-trainers.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { limitedTool } from './ex10-trainers.js';
import { EX12_ENERGY } from './ex12-trainers.js';
import { inPlay } from './common.js';

const at = (side: Pick<TrainerSituation['me'], 'active' | 'bench'>, t: 'active' | number) => (t === 'active' ? side.active : side.bench[t])!;
/** The player's Pokémon SP in play, by target. */
const spTargets = (s: TrainerSituation) => targetsOf(s.me).filter((t) => isPokemonSP(inPlayDef(s.cards, at(s.me, t)).name));

/** Returns one of the player's Pokémon and every card with it to the hand (Poké Turn). */
function returnToHand(ctx: TrainerContext, t: 'active' | number) {
  const p = at(ctx.me, t);
  ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
  if (t === 'active') ctx.me.active = null;
  else ctx.me.bench[t] = null;
  ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it returned to the hand.`);
}

const ARMOR_STONE = { name: 'Armor Stone', text: "Whenever Armor Fossil would be damaged by your opponent's attack, flip a coin until you get tails. For each heads, reduce that damage by 10." };
const SKULL_STONE = { name: 'Skull Stone', text: "During your opponent's turn, if Skull Fossil would be Knocked Out by damage from an opponent's attack, flip a coin until you get tails. For each heads, put 1 damage counter on the Attacking Pokémon." };

export const PL1_TRAINERS: Record<string, TrainerEffect> = {
  // Broken Time-Space: a Pokémon played or evolved this turn may evolve again (engine.ts).
  'pl1-104': { stadium: true },
  // Cyrus's Conspiracy (Supporter): a Supporter card, a basic Energy card and a Team Galactic's Invention card from the deck, shown.
  'pl1-105': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      ctx.pend({ kind: 'pickFromDeck', source: "Cyrus's Conspiracy", filter: 'supporter', reveal: true, optional: true });
      (ctx.state.queuedChoices ??= []).push(
        { player: ctx.me.id, source: "Cyrus's Conspiracy", kind: 'pickFromDeck', filter: 'basicEnergy', reveal: true, optional: true },
        { player: ctx.me.id, source: "Cyrus's Conspiracy", kind: 'pickFromDeck', filter: 'invention', reveal: true, optional: true },
      );
    },
  },
  // Galactic HQ: 2 damage counters on a Pokémon evolved from the hand (engine.ts).
  'pl1-106': { stadium: true },
  // Level Max: heads, a Pokémon LV.X from the deck levels up one of the player's Pokémon.
  'pl1-107': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Level Max did nothing.');
      const names = [...new Set(inPlay(ctx.me).map((p) => lookupCard(ctx.state.cards, p.card.defId).name))];
      ctx.pend({ kind: 'evolveMany', source: 'Level Max', names, done: [], once: true, limits: true, levelUp: true });
    },
  },
  // Life Herb: heads, every Special Condition and 6 damage counters off one of the player's Pokémon.
  'pl1-108': {
    blocked: (s) => (targetsOf(s.me).some((t) => at(s.me, t).damage || hasSpecialCondition(at(s.me, t))) ? null : 'None of your Pokémon has damage counters or a Special Condition'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => at(s.me, t).damage || hasSpecialCondition(at(s.me, t))), prompt: 'Life Herb: choose one of your Pokémon (if heads)' }],
    play(ctx) {
      const p = ctx.choices.target === undefined ? null : at(ctx.me, ctx.choices.target);
      if (!p || !ctx.flip()) return ctx.log('Life Herb did nothing.');
      clearSpecialConditions(p);
      const healed = Math.min(60, p.damage);
      p.damage -= healed;
      ctx.log(`Life Herb: cured ${pokemonName(ctx.state, p)} and removed ${healed / 10} damage counter${healed === 10 ? '' : 's'}.`);
    },
  },
  // Looker's Investigation (Supporter): the opponent's hand shown, then a player picked shuffles their hand into their deck and draws up to 5.
  'pl1-109': {
    supporter: true,
    play(ctx) {
      ctx.pend({ kind: 'lookOppHand', source: "Looker's Investigation" });
      (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: "Looker's Investigation", kind: 'looker' });
    },
  },
  // Memory Berry: as Aquapolis's (usableAttacks).
  'pl1-110': ECARD2_TRAINERS['ecard2-128']!,
  // Miasma Valley: 2 damage counters on a Basic Pokémon (but Grass and Psychic) benched from the hand (engine.ts).
  'pl1-111': { stadium: true },
  // PlusPower, Poké Ball, Pokédex HANDY910is: as Diamond & Pearl's.
  'pl1-112': DP1_TRAINERS['dp1-109']!,
  'pl1-113': DP1_TRAINERS['dp1-110']!,
  'pl1-114': DP1_TRAINERS['dp1-111']!,
  // Pokémon Rescue: a Pokémon from the discard pile into the hand, shown.
  'pl1-115': {
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => isPokemonCard(lookupCard(s.cards, c.defId))) ? null : 'You have no Pokémon in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToHand', source: 'Pokémon Rescue', count: 1, reveal: true }),
  },
  // Team Galactic's Invention G-101 Energy Gain: a Pokémon Tool for Pokémon SP; their attacks cost 1 Colorless less (attackError).
  'pl1-116': limitedTool("Team Galactic's Invention G-101 Energy Gain", (d) => isPokemonSP(d.name)),
  // Team Galactic's Invention G-103 Power Spray: played during the opponent's turn, with 3 or more Pokémon SP in play (usePower).
  'pl1-117': { powerSpray: true },
  // Team Galactic's Invention G-105 Poké Turn: one of the player's Pokémon SP and every card with it back into the hand.
  'pl1-118': {
    blocked: (s) => (spTargets(s).length ? null : 'You have no Pokémon SP in play'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: spTargets(s).filter((t) => t !== 'active' || !activeLock(s.me, [s.me, s.opp], s.cards)), prompt: 'Poké Turn: choose one of your Pokémon SP to return to your hand' }],
    play(ctx) {
      if (ctx.choices.target !== undefined) returnToHand(ctx, ctx.choices.target);
    },
  },
  // Armor Fossil, Skull Fossil: played as Colorless Basic Pokémon, Trainer cards as well.
  'pl1-119': { asPokemon: { hp: 50, power: ARMOR_STONE, alsoTrainer: true } },
  'pl1-120': { asPokemon: { hp: 50, power: SKULL_STONE, alsoTrainer: true } },
};

export const PL1_ENERGY: Record<string, EnergyEffect> = {
  // Rainbow Energy: as EX Legend Maker's.
  'pl1-121': EX12_ENERGY['ex12-81']!,
};
