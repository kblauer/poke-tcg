// EX Delta Species (ex11) Trainer cards and special Energy, by card id. Holon Farmer, Holon Lass, Holon Mentor, Holon
// Researcher and Holon Scientist are Supporters, each played by discarding another card from the hand first; Holon Research
// Tower and Holon Ruins are Stadiums.
// Agreed with the user: Holon Energy GL takes 10 off the damage of the opponent's Pokémon-ex's attacks after Weakness and
// Resistance, only for the Pokémon it's attached to.
// From the text: the Holon Energy cards' effects (attacks.ts, retreatCost, conditionFree) work while their Pokémon isn't a
// Pokémon-ex and has the basic Energy card they name attached; Holon Research Tower makes basic Energy cards on δ Pokémon
// Metal too, 1 Energy at a time (refreshHideout, energyPool); Holon Ruins draws a card and then discards one, once a turn
// for a player with a δ Pokémon in play; Holon Farmer's cards are shuffled into the deck; Holon Lass counts both players'
// Prize cards left; Holon Scientist counts the hands once its card is discarded.
import { isBasicEnergy, lookupCard } from '../cards.js';
import { def, otherHandCards, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { inPlayDef } from '../status.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { EX1_ENERGY, EX1_TRAINERS } from './ex1-trainers.js';
import { EX4_TRAINERS } from './ex4-trainers.js';
import { EX6_TRAINERS } from './ex6-trainers.js';

/** A Holon Supporter: another card from the hand is discarded first (`handUids`), then `then`. */
const holon = (then: NonNullable<TrainerEffect['play']>, blocked?: (s: TrainerSituation) => string | null): TrainerEffect => ({
  supporter: true,
  blocked: (s) => (otherHandCards(s).length ? (blocked?.(s) ?? null) : "You can't discard a card from your hand"),
  choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Choose a card from your hand to discard' }],
  play(ctx) {
    const gone = ctx.fromHand(ctx.me, ctx.choices.handUids ?? []);
    ctx.me.discard.push(...gone);
    if (gone.length) ctx.log(`Discarded ${gone.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the hand.`);
    then(ctx);
  },
});

/** The player has a δ Pokémon in play (Holon Ruins). */
const hasDelta = (me: Pick<TrainerSituation['me'], 'active' | 'bench'>, cards: TrainerSituation['cards']) =>
  [me.active, ...me.bench].some((p) => p && / δ$/.test(inPlayDef(cards, p).name));

export const EX11_TRAINERS: Record<string, TrainerEffect> = {
  // Dual Ball: as EX Team Magma vs Team Aqua's. Great Ball, Super Scoop Up, Switch: as EX FireRed & LeafGreen's.
  'ex11-89': EX4_TRAINERS['ex4-72']!,
  'ex11-90': EX6_TRAINERS['ex6-92']!,
  'ex11-100': EX6_TRAINERS['ex6-99']!,
  'ex11-102': EX6_TRAINERS['ex6-102']!,
  // Holon Farmer: 3 basic Energy cards and 3 Basic Pokémon or Evolution cards from the discard pile shuffled into the deck.
  'ex11-91': holon((ctx) => {
    const energy = ctx.me.discard.filter((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId))).length;
    const pokemon = ctx.me.discard.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'pokemon').length;
    const pokemonStep = { source: 'Holon Farmer', kind: 'discardToDeck' as const, count: Math.min(3, pokemon), of: 3 };
    if (energy) {
      ctx.pend({ source: 'Holon Farmer', kind: 'discardToDeck', count: Math.min(3, energy), of: 3, filter: 'basicEnergy' });
      if (pokemon) (ctx.state.queuedChoices ??= []).push({ ...pokemonStep, player: ctx.me.id });
    } else if (pokemon) ctx.pend(pokemonStep);
  }),
  // Holon Lass: any Energy cards among as many top cards as both players' Prize cards left, shown; the rest shuffled back.
  'ex11-92': holon(
    (ctx) => {
      const n = Math.min(ctx.me.deck.length, ctx.me.prizes.length + ctx.opp.prizes.length);
      if (n) ctx.pend({ source: 'Holon Lass', kind: 'pickFromTop', looked: ctx.me.deck.slice(0, n).map((c) => c.uid), take: n, basicEnergy: true, anyEnergy: true });
    },
    (s) => (s.deckCount ? null : 'Your deck is empty'),
  ),
  // Holon Mentor: up to 3 Basic Pokémon with 100 HP or less from the deck, shown.
  'ex11-93': holon(
    (ctx) => ctx.pend({ source: 'Holon Mentor', kind: 'pickFromDeck', filter: 'basicMaxHp', maxHp: 100, count: 3, optional: true, reveal: true }),
    (s) => (s.deckCount ? null : 'Your deck is empty'),
  ),
  // Holon Research Tower: a Stadium (refreshHideout).
  'ex11-94': { stadium: true },
  // Holon Researcher: a Metal Energy card or a δ Pokémon card from the deck, shown.
  'ex11-95': holon(
    (ctx) => ctx.pend({ source: 'Holon Researcher', kind: 'pickFromDeck', filter: 'metalOrDelta', reveal: true }),
    (s) => (s.deckCount ? null : 'Your deck is empty'),
  ),
  // Holon Ruins (Stadium): once a turn, with a δ Pokémon in play, a card drawn and then a card discarded from the hand.
  'ex11-96': {
    stadium: true,
    stadiumBlocked: (me, cards) => (hasDelta(me, cards) ? null : 'Holon Ruins: you have no δ Pokémon in play'),
    useStadium({ state, me }) {
      const [card] = me.deck.splice(0, 1);
      if (card) me.hand.push(card);
      if (me.hand.length) state.pendingChoice = { player: me.id, source: 'Holon Ruins', kind: 'discardFromHand', count: 1 };
    },
  },
  // Holon Scientist: cards drawn until the player has as many in the hand as the opponent.
  'ex11-97': holon((ctx) => {
    const n = ctx.opp.hand.length - ctx.me.hand.length;
    if (n > 0) ctx.draw(ctx.me, n);
  }),
  // Holon Transceiver: a Supporter with Holon in its name from the deck or the discard pile, shown.
  'ex11-98': {
    blocked: (s) => (s.deckCount || s.me.discard.some((c) => def(s, c).kind === 'trainer' && def(s, c).name.includes('Holon')) ? null : 'Your deck and discard pile have no Holon Supporter cards'),
    choices: (s) => [
      {
        kind: 'pick',
        field: 'pick',
        options: [...(s.deckCount ? [0] : []), ...(s.me.discard.some((c) => def(s, c).kind === 'trainer' && def(s, c).name.includes('Holon')) ? [1] : [])],
        labels: ['From your deck', 'From your discard pile'],
        prompt: 'Holon Transceiver: take a Holon Supporter card from your deck or your discard pile?',
      },
    ],
    play(ctx) {
      if (ctx.choices.pick === 1) ctx.pend({ kind: 'discardToHand', source: 'Holon Transceiver', count: 1, filter: 'holonSupporter', reveal: true });
      else ctx.pend({ kind: 'pickFromDeck', source: 'Holon Transceiver', filter: 'holonSupporter', reveal: true });
    },
  },
  // Master Ball: as Expedition's.
  'ex11-99': ECARD1_TRAINERS['ecard1-143']!,
  // Potion: as EX Ruby & Sapphire's.
  'ex11-101': EX1_TRAINERS['ex1-91']!,
};

export const EX11_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as EX Ruby & Sapphire's.
  'ex11-103': EX1_ENERGY['ex1-93']!,
  'ex11-107': EX1_ENERGY['ex1-94']!,
  // Holon Energy FF, GL, WP: they provide Colorless Energy; their effects are where they apply (holonWith).
  'ex11-104': { onAttach: () => {} },
  'ex11-105': { onAttach: () => {} },
  'ex11-106': { onAttach: () => {} },
};
