// EX Crystal Guardians (ex14) Trainer cards and special Energy, by card id. Bill's Maintenance, Castaway and Celio's Network are
// Supporters; Crystal Beach and Holon Circle are Stadiums; Cessation Crystal, Crystal Shard, Memory Berry and Mysterious
// Shard are Pokémon Tools.
// Agreed with the user: Crystal Beach makes a Special Energy card that's providing 2 or more Energy at the time (whatever
// makes it so: Scramble Energy, a Holon's Pokémon, a boosted React Energy…) provide 1 Colorless Energy (refreshHideout, energyPool).
// From the text: Cessation Crystal works while its Pokémon is an Active Pokémon, stopping every Poké-Power and Poké-Body
// (refreshHideout); Holon Circle stops the next attack by either Active Pokémon entirely and is discarded (attacks.ts);
// Mysterious Shard keeps the opponent's Pokémon-ex's attacks off its Pokémon until the end of the opponent's next turn;
// Castaway's three searches are each "if any"; Windstorm discards up to 2 Pokémon Tools and Stadiums in play, either player's.
import { lookupCard } from '../cards.js';
import { type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { pokemonName } from '../status.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { ECARD3_TRAINERS } from './ecard3-trainers.js';
import { EX1_TRAINERS } from './ex1-trainers.js';
import { EX2_TRAINERS } from './ex2-trainers.js';
import { EX4_ENERGY, EX4_TRAINERS } from './ex4-trainers.js';
import { EX6_TRAINERS } from './ex6-trainers.js';
import { limitedTool } from './ex10-trainers.js';

/** Windstorm's cards: every Pokémon Tool attached to a Pokémon in play, and the Stadium. */
const windstormCards = (s: TrainerSituation) => [
  ...[s.me.active, ...s.me.bench, s.opp.active, ...s.opp.bench].flatMap((p) => (p?.attached ?? []).filter((a) => a.tool).map((a) => a.card)),
  ...(s.stadium ? [s.stadium] : []),
];

export const EX14_TRAINERS: Record<string, TrainerEffect> = {
  // Bill's Maintenance, Celio's Network, Poké Ball, Warp Point: as the earlier EX sets'.
  'ex14-71': EX6_TRAINERS['ex6-87']!,
  'ex14-73': EX6_TRAINERS['ex6-88']!,
  'ex14-82': EX6_TRAINERS['ex6-95']!,
  'ex14-84': EX4_TRAINERS['ex4-85']!,
  // Castaway (Supporter): a Supporter, a Pokémon Tool and a basic Energy card from the deck, shown.
  'ex14-72': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const [first, ...rest] = (['supporter', 'tool', 'basicEnergy'] as const).map((filter) => ({ player: ctx.me.id, source: 'Castaway', kind: 'pickFromDeck' as const, filter, reveal: true, optional: true }));
      ctx.state.pendingChoice = first!;
      (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },
  // Cessation Crystal: a Pokémon Tool (not on a Pokémon-ex; refreshHideout).
  'ex14-74': limitedTool('Cessation Crystal', (d) => !d.ex),
  // Crystal Beach, Holon Circle: Stadiums (refreshHideout, attacks.ts).
  'ex14-75': { stadium: true },
  'ex14-79': { stadium: true },
  // Crystal Shard: as Skyridge's. Memory Berry: as Aquapolis's.
  'ex14-76': ECARD3_TRAINERS['ecard3-122']!,
  'ex14-80': ECARD2_TRAINERS['ecard2-128']!,
  // Double Full Heal: as EX Sandstorm's. Dual Ball: as EX Team Magma vs Team Aqua's.
  'ex14-77': EX2_TRAINERS['ex2-86']!,
  'ex14-78': EX4_TRAINERS['ex4-72']!,
  // Mysterious Shard: a Pokémon Tool (not on a Pokémon-ex) until the end of the opponent's next turn (attacks.ts).
  'ex14-81': {
    ...limitedTool('Mysterious Shard', (d) => !d.ex),
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      ctx.attachTo(p, ctx.turn + 1, { tool: true });
      ctx.log(`Attached Mysterious Shard to ${pokemonName(ctx.state, p)}.`);
    },
  },
  // PokéNav, Energy Search, Potion: as EX Ruby & Sapphire's.
  'ex14-83': EX1_TRAINERS['ex1-88']!,
  'ex14-86': EX1_TRAINERS['ex1-90']!,
  'ex14-87': EX1_TRAINERS['ex1-91']!,
  // Windstorm: up to 2 Pokémon Tools and Stadiums in play discarded.
  'ex14-85': {
    blocked: (s) => (windstormCards(s).length ? null : 'There are no Pokémon Tools or Stadium cards in play'),
    choices: (s) => [{ kind: 'cards', field: 'discardUids', min: 1, max: Math.min(2, windstormCards(s).length), options: windstormCards(s), prompt: 'Choose up to 2 Pokémon Tools and Stadium cards in play to discard' }],
    play(ctx) {
      for (const uid of ctx.choices.discardUids ?? []) {
        if (ctx.state.stadium?.card.uid === uid) {
          const stadium = ctx.state.stadium;
          ctx.state.players[stadium.owner]!.discard.push(stadium.card);
          ctx.state.stadium = null;
          ctx.log(`Discarded ${lookupCard(ctx.state.cards, stadium.card.defId).name}.`);
          continue;
        }
        for (const player of [ctx.me, ctx.opp]) {
          for (const p of [player.active, ...player.bench]) {
            const tool = p?.attached?.find((a) => a.card.uid === uid);
            if (!p || !tool) continue;
            p.attached = p.attached!.filter((a) => a !== tool);
            player.discard.push(tool.card);
            ctx.log(`Discarded ${lookupCard(ctx.state.cards, tool.card.defId).name} from ${pokemonName(ctx.state, p)}.`, player.id);
          }
        }
      }
    },
  },
};

export const EX14_ENERGY: Record<string, EnergyEffect> = {
  // Double Rainbow Energy: as EX Team Magma vs Team Aqua's.
  'ex14-88': EX4_ENERGY['ex4-88']!,
};
