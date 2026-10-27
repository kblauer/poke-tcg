// Boundaries Crossed (bw7) Trainer cards, by card id. Hugh and Skyla are Supporters, Aspertia City Gym a Stadium, Crystal Edge
// and Crystal Wall Pokémon Tools, the rest Items (Computer Search an ACE SPEC). Computer Search plays as Base Set's (the same
// text). From the text: Hugh's discards are picked by each player, the opponent first; Skyla's Trainer card is any Trainer card,
// shown; Town Map's Prize cards stay face up for both players (Prize cards are still taken from the top, as ever); Aspertia City
// Gym's 20 HP is for every Colorless Pokémon, both players' (refreshHideout); Crystal Edge's 50 more is before Weakness and
// Resistance, to the Defending Pokémon (`toolMore`), and Crystal Wall's 300 HP is its maximum HP (`toolHp`), both only for their
// Kyurem-EX; Gold Potion heals the Active Pokémon only.
import { lookupCard, type PokemonCardDef } from '../cards.js';
import type { PendingChoice } from '../trainers.js';
import { trainerProof } from '../powers.js';
import { inPlayDef } from '../status.js';
import type { TrainerEffect } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { tool } from './neo1-trainers.js';

/** Hugh: the player's draws, or a pending discard down to 5. */
const toFive = (ctx: Parameters<NonNullable<TrainerEffect['play']>>[0], player: typeof ctx.me): PendingChoice | null => {
  const n = player.hand.length;
  if (n < 5) ctx.draw(player, 5 - n);
  else if (n > 5) return { player: player.id, source: 'Hugh', kind: 'discardFromHand', count: n - 5 };
  return null;
};

/** The card is this Kyurem-EX (a Tool's own Pokémon). */
const kyurem = (name: string) => (d: PokemonCardDef) => d.name === name;

export const BW7_TRAINERS: Record<string, TrainerEffect> = {
  // Aspertia City Gym (Stadium): each Colorless Pokémon in play has 20 more HP (refreshHideout).
  'bw7-127': { stadium: true },
  // Hugh (Supporter): each player draws or discards until they have 5 cards in the hand, the opponent first.
  'bw7-130': {
    supporter: true,
    play(ctx) {
      const asked = [toFive(ctx, ctx.opp), toFive(ctx, ctx.me)].filter((c): c is PendingChoice => !!c);
      const [first, ...rest] = asked;
      if (!first) return;
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },
  // Skyla (Supporter): a Trainer card from the deck, shown, into the hand.
  'bw7-134': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Skyla', filter: 'trainer', reveal: true }),
  },
  // Town Map: every Prize card of the player's face up for the rest of the game.
  'bw7-136': {
    blocked: (s) => (s.prizes?.me === 0 ? 'You have no Prize cards left' : null),
    play(ctx) {
      ctx.me.faceUpPrizes = ctx.me.prizes.map((c) => c.uid);
      ctx.log(`Town Map: turned ${ctx.me.prizes.length} Prize card${ctx.me.prizes.length === 1 ? '' : 's'} face up: ${ctx.me.prizes.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
    },
  },
  // Computer Search (ACE SPEC): as Base Set's.
  'bw7-137': BASE1_TRAINERS['base1-71']!,
  // Crystal Edge (Tool): White Kyurem-EX's attacks do 50 more to the Defending Pokémon.
  'bw7-138': { ...tool('Crystal Edge'), toolMore: (p) => (kyurem('White Kyurem-EX')(p) ? 50 : 0) },
  // Crystal Wall (Tool): Black Kyurem-EX's maximum HP is 300.
  'bw7-139': { ...tool('Crystal Wall'), toolHp: (p) => (kyurem('Black Kyurem-EX')(p) ? 300 : null) },
  // Gold Potion: 90 damage off the player's Active Pokémon.
  'bw7-140': {
    blocked: (s) => trainerProof(s.me, [s.me, s.opp], s.cards) ?? (s.me.active?.damage ? null : 'Your Active Pokémon has no damage counters'),
    play(ctx) {
      const p = ctx.me.active!;
      const healed = Math.min(90, p.damage);
      p.damage -= healed;
      ctx.log(`Healed ${healed} damage from ${inPlayDef(ctx.state.cards, p).name}.`);
    },
  },
};
