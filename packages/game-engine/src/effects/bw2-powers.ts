// Emerging Powers (bw2) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY).
// From the text: Magic Room stops every Item card (agreed: any Trainer but a Supporter or a Stadium, isItemCard) while
// Gothitelle is its player's Active Pokémon; Black Eyes is used once a turn by each Krookodile, only from the Active Spot,
// the player picking which Energy card goes on heads.
import type { PowerEffect } from '../powers.js';
import { ABILITY, energyCards, onlyActive } from './common.js';
import { oppEnergyCanGo } from './ecard1-powers.js';

export const BW2_POWERS: Record<string, PowerEffect> = {
  // Gothitelle – Magic Room: as its player's Active Pokémon, the opponent can't play Item cards (trainerError).
  'bw2-47': { ...ABILITY, magicRoom: true },

  // Krookodile – Black Eyes: once a turn, as the Active Pokémon, a flip; heads discards an Energy card from the opponent's Active Pokémon.
  'bw2-62': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Krookodile') ?? (s.opp.active && energyCards(s.opp.active).length ? null : "Your opponent's Active Pokémon has no Energy attached"),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Black Eyes: tails.');
      const defender = ctx.opp.active;
      if (defender && energyCards(defender).length && oppEnergyCanGo(ctx, defender)) ctx.pend({ kind: 'removeEach', source: 'Black Eyes', targets: ['active'] });
    },
  },
};
