// Expedition (ecard1) Trainer cards, by card id. Supporters (`supporter`) are one a turn (trainerError); played, a Supporter
// is discarded at once rather than at the end of the turn (nothing in these sets looks at it in between). Master Ball,
// Super Scoop Up, Warp Point, Energy Search, Full Heal, Moo-Moo Milk, Potion and Switch reprint earlier cards and play the
// same. Strength Charm is a Pokémon Tool (attacks.ts: 10 more damage after Weakness and Resistance, then it's discarded at
// the end of that turn). Multi Technical Machine 01 is attached until the end of the turn, and its Pokémon can use its
// attack (Paralyzing Gaze, in ecard1.ts; usableAttacks). Darkness and Metal Energy's rules are the engine's (attacks.ts:
// both play like Neo Genesis's, agreed with the user).
// Rulings (from the text): questions whose answer depends on a flip are asked before it (Energy Removal 2's Energy card,
// Pokémon Reversal's Benched Pokémon, Power Charge's Energy cards). Dual Ball and Energy Restore take as many cards as
// there are heads (or as many as there are). Pokémon Nurse can be played on a Pokémon with no damage counters.
// Bill's Maintenance can't be played with no other card in the hand (agreed with the user).
import { isBasicEnergy, isBasicPokemon, lookupCard, type CardDef } from '../cards.js';
import { activeLock, discardTheirEnergy, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { energyKept, trainerProof } from '../powers.js';
import { energyProtected, pokemonName } from '../status.js';
import { otherHandCards, swapActive, targetsOf, theirs, type EnergyEffect, type TrainerContext, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { BASE1_TRAINERS } from './base1-trainers.js';
import { FOSSIL_TRAINERS } from './fossil-trainers.js';
import { GYM2_TRAINERS } from './gym2-trainers.js';
import { NEO1_TRAINERS, tool } from './neo1-trainers.js';

const at = (side: Pick<PlayerState, 'active' | 'bench'>, t: Target) => (t === 'active' ? side.active : side.bench[t])!;
const card = (s: { cards: TrainerSituation['cards'] }, defId: string): CardDef => lookupCard(s.cards, defId);

/** Shuffles the player's hand into their deck (Copycat, Professor Oak's Research). */
function shuffleHandAway(ctx: TrainerContext) {
  const hand = ctx.me.hand.splice(0);
  ctx.shuffleIntoDeck(ctx.me, hand);
  ctx.log(`Shuffled ${hand.length} card${hand.length === 1 ? '' : 's'} from the hand into the deck.`);
}

/** Energy cards an effect of the player's may discard from this Pokémon of the opponent's (not Brock's Protection, Unown K's Keep). */
const removable = (s: TrainerSituation, p: InPlayPokemon) => p.energy.some((e) => !e.provides) && !energyProtected(s.cards, p) && !energyKept(s.opp, [s.opp, s.me], s.cards, p);

/** Every card the player has in play, by target. */
const ownTargets = (s: TrainerSituation) => targetsOf(s.me);

export const ECARD1_TRAINERS: Record<string, TrainerEffect> = {
  // Bill's Maintenance (Supporter): shuffle 1 other card from the hand into the deck, then draw 3 cards.
  'ecard1-137': {
    supporter: true,
    blocked: (s) => (otherHandCards(s).length ? null : 'You have no other cards in your hand'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Choose a card to shuffle into your deck' }],
    play(ctx) {
      ctx.shuffleIntoDeck(ctx.me, ctx.fromHand(ctx.me, ctx.choices.handUids!));
      ctx.log('Shuffled 1 card from the hand into the deck.');
      ctx.draw(ctx.me, 3);
    },
  },

  // Copycat (Supporter): shuffle the hand into the deck, then draw as many cards as the opponent has in their hand.
  'ecard1-138': {
    supporter: true,
    play(ctx) {
      shuffleHandAway(ctx);
      ctx.draw(ctx.me, ctx.opp.hand.length);
    },
  },

  // Dual Ball: flip 2 coins; for each heads, a Basic Pokémon (not a Baby Pokémon) from the deck into the hand, shown to the opponent.
  'ecard1-139': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (!heads) return ctx.log('Dual Ball found nothing.');
      if (!ctx.me.deck.some((c) => { const d = card(ctx.state, c.defId); return isBasicPokemon(d) && d.kind === 'pokemon' && !d.baby; })) return ctx.log('There are no Basic Pokémon (other than Baby Pokémon) in the deck.');
      ctx.pend({ kind: 'pickFromDeck', source: 'Dual Ball', filter: 'basicNotBaby', reveal: true, count: heads });
    },
  },

  // Energy Removal 2: choose an Energy card attached to one of the opponent's Pokémon; heads discards it.
  'ecard1-140': {
    blocked: (s) => (targetsOf(s.opp).some((t) => removable(s, theirs(s, t)!)) ? null : "None of your opponent's Pokémon has an Energy card you can discard"),
    choices(s, c) {
      const options = targetsOf(s.opp).filter((t) => removable(s, theirs(s, t)!) && !trainerProof(s.opp, [s.me, s.opp], s.cards, theirs(s, t)));
      const specs: ReturnType<NonNullable<TrainerEffect['choices']>> = [{ kind: 'pokemon', field: 'oppTarget', side: 'opp', options, prompt: "Choose one of your opponent's Pokémon" }];
      if (c.oppTarget === undefined) return specs;
      return [...specs, { kind: 'cards', field: 'oppEnergyUids', min: 1, max: 1, options: theirs(s, c.oppTarget)!.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to discard (on heads)' }];
    },
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Energy Removal 2 did nothing.');
      const p = at(ctx.opp, ctx.choices.oppTarget!);
      const gone = p.energy.filter((e) => ctx.choices.oppEnergyUids!.includes(e.uid));
      p.energy = p.energy.filter((e) => !gone.includes(e));
      discardTheirEnergy(ctx.state, ctx.opp, gone);
      ctx.log(`Discarded ${gone.map((e) => card(ctx.state, e.defId).name).join(', ')} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
    },
  },

  // Energy Restore: flip 3 coins; for each heads, a basic Energy card from the discard pile into the hand.
  'ecard1-141': {
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => isBasicEnergy(card(s, c.defId))) ? null : 'No basic Energy cards in your discard pile'),
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (!heads) return ctx.log('Energy Restore did nothing.');
      const basics = ctx.me.discard.filter((c) => isBasicEnergy(card(ctx.state, c.defId)));
      if (basics.length > heads && new Set(basics.map((c) => c.defId)).size > 1) return ctx.pend({ kind: 'discardToHand', source: 'Energy Restore', count: heads, filter: 'basicEnergy' });
      const taken = basics.slice(0, heads);
      ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
      ctx.me.hand.push(...taken);
      ctx.log(`Put ${taken.length} basic Energy card${taken.length === 1 ? '' : 's'} from the discard pile into the hand.`);
    },
  },

  // Mary's Impulse (Supporter): flip until tails; draw 2 cards for each heads.
  'ecard1-142': {
    supporter: true,
    play(ctx) {
      let heads = 0;
      while (heads < 100 && ctx.flip()) heads++;
      if (!heads) return ctx.log("Mary's Impulse drew nothing.");
      ctx.draw(ctx.me, 2 * heads);
    },
  },

  // Master Ball: as Gym Challenge's.
  'ecard1-143': GYM2_TRAINERS['gym2-116']!,

  // Multi Technical Machine 01: attached to one of the player's Pokémon until the end of the turn; it can use Paralyzing Gaze.
  'ecard1-144': {
    technicalMachine: { name: 'Paralyzing Gaze', cost: ['colorless'], damage: 0, damageText: null, text: 'The Defending Pokémon is now Paralyzed.' },
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: ownTargets(s), prompt: 'Choose one of your Pokémon to attach Multi Technical Machine 01 to' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      ctx.attachTo(p, ctx.turn);
      ctx.log(`Attached Multi Technical Machine 01 to ${pokemonName(ctx.state, p)}.`);
    },
  },

  // Pokémon Nurse (Supporter): remove all damage counters from one of the player's Pokémon, then discard its Energy cards.
  'ecard1-145': {
    supporter: true,
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: ownTargets(s), prompt: 'Choose one of your Pokémon to heal' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      p.damage = 0;
      const energy = p.energy.map(({ provides: _, converted: _c, windless: _w, ...c }) => c);
      p.energy = [];
      ctx.me.discard.push(...energy);
      ctx.log(`Removed all damage counters from ${pokemonName(ctx.state, p)}${energy.length ? ` and discarded ${energy.length} Energy card${energy.length === 1 ? '' : 's'}` : ''}.`);
    },
  },

  // Pokémon Reversal: choose one of the opponent's Benched Pokémon; heads switches it with the Defending Pokémon.
  'ecard1-146': {
    blocked: (s) => trainerProof(s.opp, [s.me, s.opp], s.cards) ?? (s.opp.bench.some(Boolean) ? activeLock(s.opp, [s.me, s.opp], s.cards) : 'Your opponent has no Benched Pokémon'),
    choices: (s) => [{ kind: 'pokemon', field: 'oppTarget', side: 'opp', options: targetsOf(s.opp).filter((t) => t !== 'active'), prompt: "Choose one of your opponent's Benched Pokémon (switched in on heads)" }],
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Pokémon Reversal did nothing.');
      swapActive(ctx.state, ctx.opp, ctx.choices.oppTarget as number);
    },
  },

  // Power Charge: choose 2 Energy cards in the discard pile (1 if there's only 1); heads shuffles them into the deck.
  'ecard1-147': {
    blocked: (s) => (s.me.discard.some((c) => card(s, c.defId).kind === 'energy') ? null : 'No Energy cards in your discard pile'),
    choices(s) {
      const options = s.me.discard.filter((c) => card(s, c.defId).kind === 'energy');
      const n = Math.min(2, options.length);
      return [{ kind: 'cards', field: 'discardUids', min: n, max: n, options, prompt: `Choose ${n} Energy card${n === 1 ? '' : 's'} to shuffle into your deck (on heads)` }];
    },
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Power Charge did nothing.');
      const taken = ctx.me.discard.filter((c) => ctx.choices.discardUids!.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
      ctx.shuffleIntoDeck(ctx.me, taken);
      ctx.log(`Shuffled ${taken.map((c) => card(ctx.state, c.defId).name).join(' and ')} into the deck.`);
    },
  },

  // Professor Elm's Training Method (Supporter): an Evolution card from the deck into the hand, shown to the opponent.
  'ecard1-148': {
    supporter: true,
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: "Professor Elm's Training Method", filter: 'evolution', reveal: true }),
  },

  // Professor Oak's Research (Supporter): shuffle the hand into the deck, then draw 5 cards.
  'ecard1-149': {
    supporter: true,
    play(ctx) {
      shuffleHandAway(ctx);
      ctx.draw(ctx.me, 5);
    },
  },

  // Strength Charm: a Pokémon Tool.
  'ecard1-150': tool('Strength Charm'),

  // Super Scoop Up, Warp Point, Energy Search, Full Heal, Moo-Moo Milk, Potion, Switch: as the earlier cards.
  'ecard1-151': NEO1_TRAINERS['neo1-98']!,
  'ecard1-152': GYM2_TRAINERS['gym2-126']!,
  'ecard1-153': FOSSIL_TRAINERS['base3-59']!,
  'ecard1-154': BASE1_TRAINERS['base1-82']!,
  'ecard1-155': NEO1_TRAINERS['neo1-101']!,
  'ecard1-156': BASE1_TRAINERS['base1-94']!,
  'ecard1-157': BASE1_TRAINERS['base1-95']!,
};

/** Darkness and Metal Energy: their rules live in the engine (attacks.ts: the EX rules, for every set's, agreed). */
export const ECARD1_ENERGY: Record<string, EnergyEffect> = {
  'ecard1-158': { onAttach: () => {} },
  'ecard1-159': { onAttach: () => {} },
};
