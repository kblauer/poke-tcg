// Neo Destiny (neo4) Trainer cards and Miracle Energy, by card id. EXP.ALL and Counterattack Claws are Pokémon Tools whose
// rules live in attacks.ts (`hit`). Broken Ground Gym, Radio Tower, Energy Stadium and Lucky Stadium are Stadiums; Lucky
// Stadium is the Wizards Promo's card again. Miracle Energy (`NEO4_ENERGY`) counts as every type and provides 2 Energy
// (apps/api/src/cards.ts), goes only on Shining and Light Pokémon (`attachError`), and is discarded at the end of its owner's
// turn (betweenTurns); a deck holds only 1 (packages/shared/src/deck.ts).
// Rulings (from the text): EXP.ALL moves a basic Energy card by itself (of the EXP.ALL Pokémon's type when one is) as the
// Active Pokémon is Knocked Out by the opponent's attack, and is discarded. Counterattack Claws is discarded whatever the
// flip. Thought Wave Machine's heads return Energy cards from the opponent's Active Pokémon to their hand (Brock's Protection
// and Legendary Body stop it), then the turn ends. Pokémon Personality Test's guess is Light, Dark or neither; the card stays
// in the hand. Team Rocket's Evil Deeds' opponent may then draw up to 2 cards. Mail from Bill counts itself in the hand.
import { isBasicEnergy, isPokemonCard, type CardLibrary } from '../cards.js';
import type { CardInstance } from '../engine.js';
import { trainerProof } from '../powers.js';
import { addLog, energyProtected, pokemonName } from '../status.js';
import { cureConditions, def, otherHandCards, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { tool } from './neo1-trainers.js';
import { PROMO_TRAINERS } from './promos-trainers.js';

/** An Evolution card (Pokémon Personality Test). */
const isEvolutionCard = (cards: CardLibrary, c: CardInstance) => {
  const d = def({ cards }, c);
  return isPokemonCard(d) && d.stage !== 'basic';
};

/** Pokémon Personality Test's answer: 0 Light, 1 Dark, 2 neither. */
const PERSONALITIES = ['A Pokémon with Light in its name', 'A Pokémon with Dark in its name', 'Neither'];
const personality = (name: string) => (/\bLight\b/.test(name) ? 0 : /\bDark\b/.test(name) ? 1 : 2);

export const NEO4_TRAINERS: Record<string, TrainerEffect> = {
  // Broken Ground Gym: a Stadium; Baby and Basic Pokémon cost 1 more to retreat.
  'neo4-92': { stadium: true, retreatModifier: (p) => (p.stage === 'basic' ? 1 : 0) },

  // EXP.ALL: a Pokémon Tool (attacks.ts: a basic Energy card goes from the Knocked Out Active Pokémon to it).
  'neo4-93': tool('EXP.ALL'),

  // Impostor Professor Oak's Invention: look at the opponent's Prize cards; you may have them shuffled into their deck for new ones.
  'neo4-94': {
    play:(ctx) => (ctx.opp.prizes.length ? ctx.pend({ kind: 'invention', source: "Impostor Professor Oak's Invention" }) : ctx.log('Your opponent has no Prize cards.')),
  },

  // Radio Tower: a Stadium; once during each player's turn, they may look at the top 2 cards of their deck (put back in the same order).
  'neo4-95': {
    stadium: true,
    useStadium({ state, me }) {
      if (!me.deck.length) return addLog(state, 'Radio Tower: the deck is empty.', me.id);
      state.pendingChoice = { player: me.id, source: 'Radio Tower', kind: 'lookOppDeck', count: 2, own: true };
    },
  },

  // Thought Wave Machine: flip until tails; for each heads, an Energy card from the opponent's Active Pokémon goes back to their hand. The turn ends.
  'neo4-96': {
    blocked: (s) => (s.opp.active?.energy.some((e) => !e.provides) ? null : "Your opponent's Active Pokémon has no Energy cards"),
    play(ctx) {
      let heads = 0;
      while (heads < 100 && ctx.flip()) heads++;
      const active = ctx.opp.active!;
      const energy = active.energy.filter((e) => !e.provides);
      const proof = trainerProof(ctx.opp, [ctx.me, ctx.opp], ctx.state.cards);
      if (!heads || proof || energyProtected(ctx.state.cards, active)) {
        if (proof) ctx.log(`${proof}.`, ctx.opp.id);
        else if (heads) ctx.log(`Brock's Protection: ${pokemonName(ctx.state, active)}'s Energy can't be removed.`, ctx.opp.id);
        return ctx.endTurn();
      }
      if (heads >= energy.length || new Set(energy.map((e) => e.defId)).size === 1) {
        const back = energy.slice(0, heads);
        active.energy = active.energy.filter((e) => !back.includes(e));
        ctx.opp.hand.push(...back);
        ctx.log(`Returned ${back.length} Energy card${back.length === 1 ? '' : 's'} from ${pokemonName(ctx.state, active)} to the hand.`, ctx.opp.id);
        return ctx.endTurn();
      }
      // The player picks which; the turn ends once that's done.
      ctx.pend({ kind: 'removeEach', source: 'Thought Wave Machine', targets: Array<'active'>(heads).fill('active'), toHand: true, afterAttack: true });
    },
  },

  // Counterattack Claws: a Pokémon Tool (attacks.ts: when an attack damages its Active Pokémon, heads puts 2 damage counters on the attacker; then it's discarded).
  'neo4-97': tool('Counterattack Claws'),

  // Energy Amplifier: shuffle an Energy card from the hand into the deck (shown); heads takes up to 3 basic Energy cards from the deck (shown).
  'neo4-98': {
    blocked: (s) => (otherHandCards(s).some((c) => def(s, c).kind === 'energy') ? null : 'You have no Energy cards in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => def(s, c).kind === 'energy'), prompt: 'Choose an Energy card to shuffle into your deck' }],
    play(ctx) {
      const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.shuffleIntoDeck(ctx.me, [card!]);
      ctx.log(`Shuffled ${def(ctx.state, card!).name} into the deck.`);
      if (!ctx.flip()) return ctx.log('Energy Amplifier found nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Energy Amplifier', filter: 'basicEnergy', count: 3, optional: true, reveal: true });
    },
  },

  // Energy Stadium: a Stadium; once during each player's turn, they may flip; heads puts a basic Energy card from their discard pile into their hand.
  'neo4-99': {
    stadium: true,
    useStadium({ state, me, flip }) {
      if (!me.discard.some((c) => isBasicEnergy(def(state, c)))) return addLog(state, 'Energy Stadium: no basic Energy cards in the discard pile.', me.id);
      if (!flip()) return addLog(state, 'Energy Stadium: nothing.', me.id);
      state.pendingChoice = { player: me.id, source: 'Energy Stadium', kind: 'discardToHand', count: 1, filter: 'basicEnergy' };
    },
  },

  // Lucky Stadium: the Wizards Promo's card.
  'neo4-100': PROMO_TRAINERS['basep-41']!,

  // Magnifier: attach to 1 of your Pokémon until the end of the turn; its attack doesn't apply Resistance (attacks.ts).
  'neo4-101': {
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: [...(s.me.active ? (['active'] as const) : []), ...s.me.bench.flatMap((p, i) => (p ? [i] : []))], prompt: 'Attach Magnifier to' }],
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      ctx.attachTo(p, ctx.turn);
      ctx.log(`Attached Magnifier to ${pokemonName(ctx.state, p)}.`);
    },
  },

  // Pokémon Personality Test: an Evolution card from the hand, face down; the opponent guesses Light, Dark or neither. Right, they draw 3; wrong, you do.
  'neo4-102': {
    blocked: (s) => (otherHandCards(s).some((c) => isEvolutionCard(s.cards, c)) ? null : 'You have no Evolution cards in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => isEvolutionCard(s.cards, c)), prompt: 'Choose an Evolution card to put face down' }],
    play(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.handUids![0])!;
      ctx.log('Put an Evolution card face down.');
      ctx.state.pendingChoice = { player: ctx.opp.id, source: "Pokémon Personality Test: what is the face-down card?", kind: 'guess', card, labels: PERSONALITIES, answer: personality(def(ctx.state, card).name), draw: 3 };
    },
  },

  // Team Rocket's Evil Deeds: look at the opponent's hand and choose a card, which they shuffle into their deck; then they may draw up to 2 cards.
  'neo4-103': {
    play(ctx) {
      ctx.pend({ kind: 'oppHandTrainer', source: "Team Rocket's Evil Deeds", any: true });
      (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: "Team Rocket's Evil Deeds", kind: 'drawCount', max: 2 });
    },
  },

  // Heal Powder: flip; heads, your Active Pokémon is no longer Asleep, Confused, Paralyzed or Poisoned, and 2 damage counters come off it.
  'neo4-104': {
    blocked: (s) => trainerProof(s.me, [s.me, s.opp], s.cards) ?? (s.me.active ? null : 'You have no Active Pokémon'),
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Heal Powder did nothing.');
      const p = ctx.me.active!;
      cureConditions(ctx.state, ctx.me, p);
      const healed = Math.min(20, p.damage);
      p.damage -= healed;
      if (healed) ctx.log(`${pokemonName(ctx.state, p)} healed ${healed} damage.`);
    },
  },

  // Mail from Bill: only with 4 or fewer cards in the hand (this one included); draw until you have 4.
  'neo4-105': {
    blocked: (s) => (s.me.hand.length >= 5 ? 'You have 5 or more cards in your hand' : null),
    play: (ctx) => ctx.draw(ctx.me, Math.max(0, 4 - ctx.me.hand.length)),
  },
};

/** Miracle Energy: only on Shining and Light Pokémon; its other rules live where they apply (see the header). */
export const NEO4_ENERGY: Record<string, EnergyEffect> = {
  'neo4-16': {
    onAttach: () => {},
    attachError: (p) => (/^(Shining|Light) /.test(p.name) ? null : 'Miracle Energy can only be attached to Shining or Light Pokémon'),
  },
};
