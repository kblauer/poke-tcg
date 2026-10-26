// Dragons Exalted (bw6) Trainer cards and Special Energy, by card id. Giant Cape and Rescue Scarf are Pokémon Tools read where
// they apply (Giant Cape's HP in refreshHideout, Rescue Scarf in resolveKnockouts, as Rescue Energy); the rest are Items.
// Blend Energy provides 1 Energy of any one of its 4 types while attached (energyPool's BLEND_ENERGY, as Crystal Energy's
// choice of types), Colorless anywhere else.
// From the text: Devolution Spray's devolved Pokémon keeps its damage counters but loses Special Conditions and other effects
// (as evolving does), and can't evolve again that turn; Rescue Scarf works whatever attack's damage Knocks its Pokémon Out
// (either player's), its Pokémon cards going into the hand and the rest discarded; Tool Scrapper picks 1 or 2 Pokémon Tool
// cards, either player's, in one go.
import { lookupCard } from '../cards.js';
import { discardTool, type InPlayPokemon, type PlayerState } from '../engine.js';
import { itemVeiled, pokemonAt, trainerProof } from '../powers.js';
import { clearOnLeavingActive, devolvable, pokemonName, removeTopEvolution } from '../status.js';
import { targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { tool } from './neo1-trainers.js';

/** The player's Evolved Pokémon that can be devolved (Devolution Spray). */
const sprayable = (s: TrainerSituation) => targetsOf(s.me).filter((t) => devolvable(s.cards, pokemonAt(s.me, t)!));

/**
 * Every Pokémon Tool card attached to a Pokémon in play, either player's (not to an Active Pokémon Legendary Body keeps Trainers
 * off, nor to the opponent's Pokémon while Bright Veil keeps Item cards off them).
 */
const toolsInPlay = (s: Pick<TrainerSituation, 'me' | 'opp' | 'cards'>) =>
  (itemVeiled(s.opp, [s.opp, s.me], s.cards) ? [s.me] : [s.me, s.opp]).flatMap((side) =>
    [side.active, ...side.bench].flatMap((p) => (p && !(side.active === p && trainerProof(side, [s.me, s.opp], s.cards)) ? (p.attached ?? []).filter((a) => a.tool).map((a) => a.card) : [])),
  );

export const BW6_TRAINERS: Record<string, TrainerEffect> = {
  // Devolution Spray: the top Evolution card of 1 of the player's Evolved Pokémon back into the hand; it can't evolve this turn.
  'bw6-113': {
    blocked: (s) => (sprayable(s).length ? null : 'You have no Evolved Pokémon'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: sprayable(s), prompt: 'Choose one of your Evolved Pokémon to devolve' }],
    play(ctx) {
      const p = pokemonAt(ctx.me, ctx.choices.target!)!;
      const top = removeTopEvolution(ctx.state, ctx.me, p);
      ctx.me.hand.push(top);
      clearOnLeavingActive(p);
      (p.effects ??= {}).noEvolve = ctx.turn;
      ctx.log(`Put ${lookupCard(ctx.state.cards, top.defId).name} into the hand: it's ${pokemonName(ctx.state, p)} again.`);
    },
  },
  // Giant Cape: 20 more HP (refreshHideout).
  'bw6-114': tool('Giant Cape'),
  // Rescue Scarf: Knocked Out by an attack's damage, its Pokémon goes into the hand, the other cards discarded (resolveKnockouts).
  'bw6-115': tool('Rescue Scarf'),
  // Tool Scrapper: up to 2 Pokémon Tool cards attached to Pokémon in play, either player's, discarded.
  'bw6-116': {
    blocked: (s) => (toolsInPlay(s).length ? null : 'No Pokémon in play has a Pokémon Tool attached'),
    choices: (s) => [{ kind: 'cards', field: 'discardUids', min: 1, max: 2, options: toolsInPlay(s), prompt: 'Choose up to 2 Pokémon Tool cards to discard' }],
    play(ctx) {
      for (const side of [ctx.me, ctx.opp] as PlayerState[]) {
        for (const p of [side.active, ...side.bench].filter((q): q is InPlayPokemon => !!q)) {
          const found = (p.attached ?? []).find((a) => a.tool && ctx.choices.discardUids!.includes(a.card.uid));
          if (!found) continue;
          discardTool(ctx.state, side, p);
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, found.card.defId).name} from ${pokemonName(ctx.state, p)}.`, side.id);
        }
      }
    },
  },
};

/** Blend Energy: what it provides is energyPool's (BLEND_ENERGY); nothing happens when it's attached. */
export const BW6_ENERGY: Record<string, EnergyEffect> = {
  'bw6-117': {},
  'bw6-118': {},
};
