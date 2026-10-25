// Arceus (pl4) Trainer cards, by card id. Bench Shield and Expert Belt are Pokémon Tools read where they apply (attacks.ts;
// Expert Belt's HP in refreshHideout and its Prize card in resolveKnockouts), Lucky Egg in resolveKnockouts.
// From the text: Lucky Egg's draw comes as its Pokémon is Knocked Out by the opponent's attack damage.
import type { TrainerEffect } from '../trainers.js';
import { DP3_TRAINERS } from './dp3-trainers.js';
import { DPP_TRAINERS } from './dpp-trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { EX3_TRAINERS } from './ex3-trainers.js';
import { tool } from './neo1-trainers.js';

const HARD_AMBER = { name: 'Hard Amber', text: "As long as Old Amber is on your Bench, prevent all damage done to Old Amber by attacks (both yours and your opponent's)." };
const ROCK_REACTION = { name: 'Rock Reaction', text: 'When you attach a Fighting Energy card from your hand to Dome Fossil (excluding effects of attacks or Poké-Powers), search your deck for a card that evolves from Dome Fossil and put it onto Dome Fossil (this counts as evolving Dome Fossil). Shuffle your deck afterward.' };
const AQUA_REACTION = { name: 'Aqua Reaction', text: 'When you attach a Water Energy card from your hand to Helix Fossil (excluding effects of attacks or Poké-Powers), search your deck for a card that evolves from Helix Fossil and put it onto Helix Fossil (this counts as evolving Helix Fossil). Shuffle your deck afterward.' };

export const PL4_TRAINERS: Record<string, TrainerEffect> = {
  // Beginning Door: as the DP Black Star Promo's.
  'pl4-82': DPP_TRAINERS['dpp-DP54']!,
  // Bench Shield: on the Bench, no attack damage to its Pokémon (attacks.ts).
  'pl4-83': tool('Bench Shield'),
  // Buffer Piece: as EX Dragon's.
  'pl4-84': EX3_TRAINERS['ex3-83']!,
  // Department Store Girl (Supporter): up to 3 Pokémon Tool cards from the deck, shown.
  'pl4-85': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Department Store Girl', filter: 'tool', reveal: true, optional: true, count: 3 }),
  },
  // Energy Restore: as Expedition's.
  'pl4-86': ECARD1_TRAINERS['ecard1-141']!,
  // Expert Belt: 20 more HP, 20 more damage to the opponent's Active Pokémon; Knocked Out, 1 more Prize card for the opponent.
  'pl4-87': tool('Expert Belt'),
  // Lucky Egg: Knocked Out by the opponent's attack damage, cards drawn until the hand has 7.
  'pl4-88': tool('Lucky Egg'),
  // Old Amber, Dome Fossil, Helix Fossil: played as Colorless Basic Pokémon, Trainer cards as well.
  'pl4-89': { asPokemon: { hp: 50, power: HARD_AMBER, alsoTrainer: true } },
  'pl4-92': { asPokemon: { hp: 50, power: ROCK_REACTION, alsoTrainer: true } },
  'pl4-93': { asPokemon: { hp: 50, power: AQUA_REACTION, alsoTrainer: true } },
  // Professor Oak's Visit: as Secret Wonders'. Ultimate Zone: as the DP Black Star Promo's.
  'pl4-90': DP3_TRAINERS['dp3-122']!,
  'pl4-91': DPP_TRAINERS['dpp-DP55']!,
};
