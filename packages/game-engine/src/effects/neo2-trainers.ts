// Neo Discovery (neo2) Trainer cards, by card id.
// Rulings (from the text): Fossil Egg's choice (a card from the hand, or a search of the deck) is asked before the flip,
// like other questions whose answer depends on a flip; the card goes onto the Bench as a Basic Pokémon. Hyper Devolution
// Spray returns the top card only, as Devolution Beam does: Special Conditions and attack effects end, damage stays (it
// can Knock the Pokémon Out), and it can't evolve again this turn. Ruin Wall and Energy Ark can find nothing.
import type { CardLibrary } from '../cards.js';
import { newInPlay, type CardInstance } from '../engine.js';
import { clearOnLeavingActive, devolvable, openBenchSlot, pokemonName } from '../status.js';
import { def, own, targetsOf, type TrainerEffect, type TrainerSituation } from '../trainers.js';

const benchFull = (s: TrainerSituation) => (openBenchSlot(s.me.bench, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null);

/** Cards in the hand, other than `played`, that evolve from Mysterious Fossil (Fossil Egg). */
const fossilsInHand = (s: { cards: CardLibrary }, hand: CardInstance[], played: CardInstance) =>
  hand.filter((c) => {
    const d = def(s, c);
    return c.uid !== played.uid && d.kind === 'pokemon' && d.evolvesFrom === 'Mysterious Fossil';
  });

/** The player's Evolved Pokémon (Hyper Devolution Spray). */
const evolvedTargets = (s: TrainerSituation) => targetsOf(s.me).filter((t) => devolvable(s.cards, own(s, t)!));

export const NEO2_TRAINERS: Record<string, TrainerEffect> = {
  // Fossil Egg: heads, a card that evolves from Mysterious Fossil from the deck (or the hand) onto the Bench, as a Basic Pokémon.
  'neo2-72': {
    blocked: benchFull,
    choices(s) {
      const inHand = fossilsInHand(s, s.me.hand, s.card);
      if (!inHand.length) return [];
      const labels = ['Search your deck', ...inHand.map((c) => `${def(s, c).name} from your hand`)];
      return [{ kind: 'pick', field: 'pick', options: labels.map((_, i) => i), labels, prompt: 'If heads: search your deck, or put a card from your hand onto your Bench' }];
    },
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Fossil Egg did nothing.');
      const fromHand = ctx.choices.pick ? fossilsInHand(ctx.state, ctx.me.hand, ctx.card)[ctx.choices.pick - 1] : undefined;
      const slot = openBenchSlot(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card);
      if (fromHand && slot >= 0) {
        const [card] = ctx.fromHand(ctx.me, [fromHand.uid]);
        ctx.me.bench[slot] = newInPlay(card!, ctx.turn);
        return ctx.log(`Put ${def(ctx.state, card!).name} from the hand onto the Bench.`);
      }
      ctx.pend({ kind: 'pickFromDeck', source: 'Fossil Egg', filter: 'evolvesFrom', name: 'Mysterious Fossil', toBench: true, optional: true, reveal: true });
    },
  },

  // Hyper Devolution Spray: the highest Stage Evolution card on one of the player's Evolved Pokémon goes back to the hand.
  'neo2-73': {
    blocked: (s) => (evolvedTargets(s).length ? null : 'None of your Pokémon are evolved'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: evolvedTargets(s), prompt: 'Choose one of your evolved Pokémon' }],
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      const top = p.card;
      p.card = p.evolvedFrom.pop()!;
      ctx.me.hand.push(top);
      // As if it had evolved: Special Conditions and attack effects end. It can't evolve again this turn. A Knock Out is handled after.
      clearOnLeavingActive(p);
      p.playedTurn = ctx.turn;
      ctx.log(`${def(ctx.state, top).name} returned to the hand; it's ${pokemonName(ctx.state, p)} again.`);
    },
  },

  // Ruin Wall: a card with Unown in its name from the deck onto the Bench.
  'neo2-74': {
    blocked: benchFull,
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Ruin Wall', filter: 'ownerBasic', name: 'Unown', toBench: true, optional: true }),
  },

  // Energy Ark: 2 flips; a basic Energy card from the deck into the hand for each heads (shown to the opponent).
  'neo2-75': {
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (!heads) return ctx.log('Energy Ark found nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Energy Ark', filter: 'basicEnergy', count: heads, optional: true, reveal: true });
    },
  },
};
