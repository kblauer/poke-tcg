// HGSS Black Star Promos (hgssp) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition,
// Poké-Bodies never do. Most reprint earlier cards' powers and play as those.
// From the text: Night Scope needs a card in the opponent's hand; Rain Dance is the Base Set's; Fermenting Liquid works on its
// player's turn, for each Energy card attached to Shuckle from the hand.
import { namesMatch } from '../cards.js';
import type { PowerEffect } from '../powers.js';
import { addLog, inPlayDef } from '../status.js';
import { BASE1_POWERS } from './base1-powers.js';
import { POKE_BODY } from './common.js';
import { freeRetreat } from './ex2-powers.js';
import { EX7_POWERS } from './ex7-powers.js';
import { HGSS1_POWERS } from './hgss1-powers.js';
import { HGSS4_POWERS } from './hgss4-powers.js';

export const HGSSP_POWERS: Record<string, PowerEffect> = {
  // Wobbuffet – Tenacious Bind: as Triumphant Victreebel's Tangling Tendrils. Hoothoot – Insomnia: as EX Team Rocket Returns'.
  'hgssp-HGSS04': HGSS4_POWERS['hgss4-12']!,
  'hgssp-HGSS05': EX7_POWERS['ex7-54']!,
  // Noctowl – Night Scope: the opponent's hand looked at.
  'hgssp-HGSS06': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.oppHand ? null : "Your opponent's hand is empty"),
    use: (ctx) => ctx.pend({ kind: 'lookOppHand', source: 'Night Scope' }),
  },
  // Feraligatr – Rain Dance: as Base Set Blastoise's. Meganium – Leaf Trans, Typhlosion – Afterburner: as HeartGold & SoulSilver's.
  'hgssp-HGSS07': BASE1_POWERS['base1-2']!,
  'hgssp-HGSS08': HGSS1_POWERS['hgss1-109']!,
  'hgssp-HGSS09': HGSS1_POWERS['hgss1-110']!,
  // Latios – Luster Float: with Latias in play, no Retreat Cost.
  'hgssp-HGSS11': freeRetreat((_p, cards, owner) => [owner.active, ...owner.bench].some((q) => q && namesMatch(inPlayDef(cards, q).name, 'Latias'))),
  // Cleffa, Smoochum – Sweet Sleeping Face: as HeartGold & SoulSilver's.
  'hgssp-HGSS12': HGSS1_POWERS['hgss1-17']!,
  'hgssp-HGSS13': HGSS1_POWERS['hgss1-17']!,
  // Shuckle – Fermenting Liquid: an Energy card attached to it from the hand draws a card.
  'hgssp-HGSS15': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner) {
      if (state.currentPlayer !== owner.id || !owner.deck.length) return;
      owner.hand.push(...owner.deck.splice(0, 1));
      addLog(state, 'Fermenting Liquid: drew a card.', owner.id);
    },
  },
};
