// EX Unseen Forces (ex10) Trainer cards and special Energy, by card id. Mary's Request and Professor Elm's Training Method are
// Supporters; Curse Powder, Energy Root, Fluffy Berry, Protective Orb, Sitrus Berry and Solid Rage are Pokémon Tools.
// From the text: Curse Powder, Protective Orb and Solid Rage go only on Evolved Pokémon (not Pokémon-ex), and are discarded
// from one that isn't (refreshHideout); Energy Root, Fluffy Berry and Sitrus Berry go on any Pokémon but Pokémon-ex and ones
// with Dark or an owner in their names; Energy Root's 20 HP and stopped Poké-Powers and Poké-Bodies are in refreshHideout,
// Curse Powder's damage counters in attacks.ts (knockedOutEffects), Protective Orb's no Weakness and Solid Rage's 20 more in
// attacks.ts, Fluffy Berry's free retreat in retreatCost, Sitrus Berry in useBerry; Mary's Request counts the player's Stage 2
// Pokémon in play.
import { hasOwner, type PokemonCardDef } from '../cards.js';
import { targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { inPlayDef, pokemonName } from '../status.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_ENERGY } from './ecard2-trainers.js';
import { ECARD3_ENERGY } from './ecard3-trainers.js';
import { EX1_ENERGY, EX1_TRAINERS } from './ex1-trainers.js';
import { EX3_TRAINERS } from './ex3-trainers.js';
import { EX4_TRAINERS } from './ex4-trainers.js';
import { EX6_TRAINERS } from './ex6-trainers.js';

/** Energy Root, Fluffy Berry, Sitrus Berry: not a Pokémon-ex, nor one with Dark or an owner in its name. */
export const plainPokemon = (d: PokemonCardDef) => !d.ex && !/\bDark\b/.test(d.name) && !hasOwner(d.name);

/** A Pokémon Tool that goes only on the player's Pokémon `fits` accepts (and, with `evolved`, only Evolved ones). */
export const limitedTool = (what: string, fits: (d: PokemonCardDef) => boolean, evolved = false): TrainerEffect => {
  const targets = (s: TrainerSituation) =>
    targetsOf(s.me).filter((t) => {
      const p = (t === 'active' ? s.me.active : s.me.bench[t])!;
      return !p.attached?.some((a) => a.tool) && fits(inPlayDef(s.cards, p)) && (!evolved || p.evolvedFrom.length > 0);
    });
  return {
    tool: true,
    toolFor: fits,
    ...(evolved && { evolvedToolOnly: true }),
    blocked: (s) => (targets(s).length ? null : `None of your Pokémon can take ${what}`),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targets(s), prompt: `Choose one of your Pokémon to attach ${what} to` }],
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      ctx.attachTo(p, Number.MAX_SAFE_INTEGER, { tool: true });
      ctx.log(`Attached ${what} to ${pokemonName(ctx.state, p)}.`);
    },
  };
};

const notEx = (d: PokemonCardDef) => !d.ex;

export const EX10_TRAINERS: Record<string, TrainerEffect> = {
  'ex10-80': limitedTool('Curse Powder', notEx, true),
  // Energy Recycle System: as EX Dragon's.
  'ex10-81': EX3_TRAINERS['ex3-84']!,
  // Energy Removal 2, Energy Switch, Poké Ball, Pokémon Reversal: as EX FireRed & LeafGreen's.
  'ex10-82': EX6_TRAINERS['ex6-89']!,
  'ex10-84': EX6_TRAINERS['ex6-90']!,
  'ex10-87': EX6_TRAINERS['ex6-95']!,
  'ex10-88': EX6_TRAINERS['ex6-97']!,
  'ex10-83': limitedTool('Energy Root', plainPokemon),
  'ex10-85': limitedTool('Fluffy Berry', plainPokemon),
  // Mary's Request (Supporter): a card drawn, 2 more with no Stage 2 Pokémon in play.
  'ex10-86': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const stage2 = [ctx.me.active, ...ctx.me.bench].some((p) => p && inPlayDef(ctx.state.cards, p).stage === 'stage2');
      ctx.draw(ctx.me, stage2 ? 1 : 3);
    },
  },
  // Professor Elm's Training Method: as Expedition's.
  'ex10-89': ECARD1_TRAINERS['ecard1-148']!,
  'ex10-90': limitedTool('Protective Orb', notEx, true),
  'ex10-91': limitedTool('Sitrus Berry', plainPokemon),
  'ex10-92': limitedTool('Solid Rage', notEx, true),
  // Warp Point: as EX Team Magma vs Team Aqua's.
  'ex10-93': EX4_TRAINERS['ex4-85']!,
  // Energy Search, Potion: as EX Ruby & Sapphire's.
  'ex10-94': EX1_TRAINERS['ex1-90']!,
  'ex10-95': EX1_TRAINERS['ex1-91']!,
};

export const EX10_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as EX Ruby & Sapphire's. Boost Energy, Warp Energy: as Aquapolis's. Cyclone Energy: as Skyridge's.
  'ex10-96': EX1_ENERGY['ex1-93']!,
  'ex10-97': EX1_ENERGY['ex1-94']!,
  'ex10-98': ECARD2_ENERGY['ecard2-145']!,
  'ex10-99': ECARD3_ENERGY['ecard3-143']!,
  'ex10-100': ECARD2_ENERGY['ecard2-147']!,
};
