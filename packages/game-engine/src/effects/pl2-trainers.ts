// Rising Rivals (pl2) Trainer cards and Special Energy, by card id. Several are the engine's own rules: Sunyshore City Gym
// (attacks.ts) is a Stadium read where it applies; Technical Machine G is discarded from a Pokémon that isn't a Pokémon SP
// (refreshHideout); SP Energy and Upper Energy are read by energyPool (cardEnergy, dropBoostEnergy); Charon's Choice goes back
// into the hand at the end of the turn (`returnsToHand`).
// From the text: Flint's Willpower attaches the basic Energy card picked to the Pokémon SP picked; Lucian's Assignment moves
// Energy cards one at a time, as the player stops; Pokémon Contest Hall's Pokémon Tool search follows a Basic Pokémon found,
// attached to it; Volkner's Philosophy can't be played when no card could be drawn; Charon's Choice puts the Rotom from play
// into the deck before the shuffle.
import { isBasicEnergy, lookupCard, namesMatch } from '../cards.js';
import { energyFromHand } from '../powers.js';
import { inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { isPokemonSP, otherHandCards, targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { DP2_ENERGY, DP2_TRAINERS } from './dp2-trainers.js';
import { ECARD3_TRAINERS } from './ecard3-trainers.js';
import { EX1_ENERGY } from './ex1-trainers.js';

const at = (side: Pick<TrainerSituation['me'], 'active' | 'bench'>, t: 'active' | number) => (t === 'active' ? side.active : side.bench[t])!;
/** The player's Pokémon SP in play, by target (`damaged`: with damage counters on them). */
const spTargets = (s: TrainerSituation, damaged = false) => targetsOf(s.me).filter((t) => isPokemonSP(inPlayDef(s.cards, at(s.me, t)).name) && (!damaged || at(s.me, t).damage > 0));
/** The player's Rotom in play. */
const rotoms = (s: TrainerSituation) => targetsOf(s.me).filter((t) => namesMatch(inPlayDef(s.cards, at(s.me, t)).name, 'Rotom') || inPlayDef(s.cards, at(s.me, t)).name.endsWith(' Rotom'));

export const PL2_TRAINERS: Record<string, TrainerEffect> = {
  // Aaron's Collection (Supporter): up to 2 Pokémon SP and basic Energy cards from the discard pile into the hand, shown.
  'pl2-88': {
    supporter: true,
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId)) || isPokemonSP(lookupCard(s.cards, c.defId).name)) ? null : 'You have no Pokémon SP or basic Energy cards in your discard pile'),
    play: (ctx) => ctx.pend({ kind: 'discardToHand', source: "Aaron's Collection", count: 2, filter: 'spOrBasicEnergy', reveal: true }),
  },
  // Bebe's Search: as Mysterious Treasures'.
  'pl2-89': DP2_TRAINERS['dp2-109']!,
  // Bertha's Warmth (Supporter): 5 damage counters off one of the player's Pokémon SP.
  'pl2-90': {
    supporter: true,
    blocked: (s) => (spTargets(s, true).length ? null : 'None of your Pokémon SP has damage counters'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: spTargets(s, true), prompt: "Bertha's Warmth: choose one of your Pokémon SP to heal" }],
    play(ctx) {
      const p = ctx.choices.target === undefined ? null : at(ctx.me, ctx.choices.target);
      if (!p) return;
      const healed = Math.min(50, p.damage);
      p.damage -= healed;
      ctx.log(`Removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Flint's Willpower (Supporter): a basic Energy card from the hand attached to one of the player's Pokémon SP.
  'pl2-91': {
    supporter: true,
    blocked: (s) => (!spTargets(s).length ? 'You have no Pokémon SP in play' : otherHandCards(s).some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'You have no basic Energy cards in your hand'),
    choices: (s) => [
      { kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s).filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId))), prompt: "Flint's Willpower: choose a basic Energy card to attach" },
      { kind: 'pokemon', field: 'target', side: 'own', options: spTargets(s), prompt: 'Choose one of your Pokémon SP to attach it to' },
    ],
    play(ctx) {
      const t = ctx.choices.target;
      const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids ?? []);
      if (!card || t === undefined) return;
      at(ctx.me, t).energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, at(ctx.me, t))}.`);
      energyFromHand(ctx.state, ctx.me, t, card);
    },
  },
  // Lucian's Assignment (Supporter): any Energy cards moved from one of the player's Pokémon to another.
  'pl2-92': {
    supporter: true,
    blocked: (s) => (targetsOf(s.me).length > 1 && targetsOf(s.me).some((t) => at(s.me, t).energy.some((e) => !e.provides)) ? null : 'You need a Pokémon with Energy cards and another Pokémon'),
    choices: (s, c) => [
      { kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => at(s.me, t).energy.some((e) => !e.provides)), prompt: "Lucian's Assignment: choose the Pokémon to move Energy cards from" },
      { kind: 'pokemon', field: 'target2', side: 'own', options: targetsOf(s.me).filter((t) => t !== c.target), prompt: 'Choose the Pokémon to move them to' },
    ],
    play(ctx) {
      const { target: from, target2: to } = ctx.choices;
      if (from === undefined || to === undefined || from === to) return;
      ctx.pend({ kind: 'shiftEnergy', source: "Lucian's Assignment", from, to, any: true });
    },
  },
  // Pokémon Contest Hall: once a turn, with room on the Bench, heads: a Basic Pokémon from the deck onto the Bench, then a
  // Pokémon Tool from the deck may be attached to it.
  'pl2-93': {
    stadium: true,
    stadiumBlocked: (me, cards) => (openBenchSlot(me, cards) < 0 ? 'Your Bench is full' : null),
    useStadium({ state, me, flip }) {
      if (!flip()) return;
      if (me.deck.length) state.pendingChoice = { player: me.id, source: 'Pokémon Contest Hall', kind: 'pickFromDeck', filter: 'basic', toBench: true, optional: true, thenTool: true };
    },
  },
  // Sunyshore City Gym: Lightning Pokémon's attacks ignore Resistance; Lightning Pokémon have no Weakness (attacks.ts).
  'pl2-94': { stadium: true },
  // Team Galactic's Invention G-107 Technical Machine G: Damage Porter, for Pokémon SP only.
  'pl2-95': {
    technicalMachine: { name: 'Damage Porter', cost: ['colorless', 'colorless', 'colorless'], damage: 0, damageText: null, text: "Choose 1 of your opponent's Pokémon. This attack does 10 damage times the number of damage counters on the Pokémon this card is attached to to that Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" },
    toolFor: (d) => isPokemonSP(d.name),
    blocked: (s) => (spTargets(s).length ? null : 'You have no Pokémon SP in play'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: spTargets(s), prompt: 'Choose one of your Pokémon SP to attach Technical Machine G to' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      ctx.attachTo(p, Number.MAX_SAFE_INTEGER);
      ctx.log(`Attached Technical Machine G to ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Team Galactic's Invention G-109 SP Radar: a card from the hand on top of the deck, then a Pokémon SP from the deck, shown.
  'pl2-96': {
    blocked: (s) => (otherHandCards(s).length ? null : "You can't play SP Radar when it's the only card in your hand"),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'SP Radar: choose a card to put on top of your deck' }],
    play(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.handUids?.[0]);
      if (card) {
        ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
        ctx.me.deck.unshift(card);
        ctx.log('Put a card from the hand on top of the deck.');
      }
      ctx.pend({ kind: 'pickFromDeck', source: 'SP Radar', filter: 'pokemonSP', reveal: true, optional: true });
    },
  },
  // Underground Expedition: as Skyridge's.
  'pl2-97': ECARD3_TRAINERS['ecard3-140']!,
  // Volkner's Philosophy (Supporter): may discard a card from the hand, then cards drawn until the hand has 6.
  'pl2-98': {
    supporter: true,
    blocked: (s) => (!s.deckCount || otherHandCards(s).length >= 7 ? "You can't draw any cards" : null),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 0, max: otherHandCards(s).length >= 6 ? 1 : Math.min(1, otherHandCards(s).length), options: otherHandCards(s), prompt: "Volkner's Philosophy: you may discard a card from your hand first" }],
    play(ctx) {
      const gone = ctx.fromHand(ctx.me, ctx.choices.handUids ?? []);
      ctx.me.discard.push(...gone);
      if (gone.length) ctx.log(`Discarded ${lookupCard(ctx.state.cards, gone[0]!.defId).name}.`);
      ctx.draw(ctx.me, Math.max(0, 6 - ctx.me.hand.length));
    },
  },
  // Charon's Choice (Supporter, back into the hand at the end of the turn): a Rotom from the deck takes the place of one in play.
  'pl2-RT6': {
    supporter: true,
    returnsToHand: true,
    blocked: (s) => (rotoms(s).length ? null : 'You have no Rotom in play'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: rotoms(s), prompt: "Charon's Choice: choose the Rotom to switch" }],
    play(ctx) {
      if (ctx.choices.target === undefined) return;
      ctx.pend({ kind: 'pickFromDeck', source: "Charon's Choice", filter: 'ownerPokemon', name: 'Rotom', swapOnto: ctx.choices.target, optional: true });
    },
  },
};

export const PL2_ENERGY: Record<string, EnergyEffect> = {
  // Darkness Energy, Metal Energy: as the earlier cards.
  'pl2-99': DP2_ENERGY['dp2-119']!,
  'pl2-100': EX1_ENERGY['ex1-94']!,
  // SP Energy: every type, 1 at a time, on a Pokémon SP (cardEnergy). Upper Energy: 2 Colorless while behind on Prize cards, not on a Pokémon LV.X (dropBoostEnergy).
  'pl2-101': { onAttach: () => {} },
  'pl2-102': { onAttach: () => {} },
};
