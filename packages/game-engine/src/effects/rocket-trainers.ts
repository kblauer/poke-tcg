// Team Rocket (base5) Trainer cards and special Energy, by card id. Cards 71 and 72 are the non-holo prints of 15
// and 16, and 80 of Rainbow Energy (17).
// Rulings (agreed): Challenge! is answered by the opponent; the CPU accepts whenever its Bench has room and its
// deck has a Basic Pokémon. If accepted, the player who played it searches first, then the opponent. Rainbow Energy
// counts as every type while attached (costs, counts of a type of Energy, "discard a Fire Energy card", Energy
// Trans, Gather Fire), and its 10 damage when attached from the hand can Knock Out its own Pokémon. Goop Gas Attack
// stops every Pokémon Power on both sides, including Pokémon put into play afterwards.
import { isBasicEnergy, isPokemonCard, lookupCard } from '../cards.js';
import type { CardInstance, GameState, InPlayPokemon, PlayerState } from '../engine.js';
import { powerActive } from '../powers.js';
import { addLog, effectId, flipCoin, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { otherHandCards, type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { powerEffect } from './index.js';

/** Pokémon cards and basic Energy cards in the discard pile (Nightly Garbage Run). */
const garbage = (s: { cards: GameState['cards'] }, discard: CardInstance[]) =>
  discard.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return isPokemonCard(d) || isBasicEnergy(d);
  });

/** Whether this Pokémon can't be affected by Special Conditions: Clefairy Doll, or a working Thick Skinned. */
const noConditions = (state: GameState, pokemon: InPlayPokemon) => {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  return !!inPlayDef(state.cards, pokemon).trainerText || (powerActive(pokemon, state.cards, sides) && !!powerEffect(effectId(pokemon))?.noConditions);
};

const HOLO: Record<string, TrainerEffect> = {
  // Here Comes Team Rocket!: each player plays with their Prize cards face up for the rest of the game.
  'base5-15': {
    play(ctx) {
      ctx.state.prizesFaceUp = true;
      ctx.log('Both players play with their Prize cards face up for the rest of the game.');
    },
  },

  // Rocket's Sneak Attack: look at the opponent's hand; they shuffle a Trainer card you choose from it into their deck.
  'base5-16': {
    play: (ctx) => ctx.pend({ kind: 'oppHandTrainer', source: "Rocket's Sneak Attack" }),
  },
};

export const ROCKET_TRAINERS: Record<string, TrainerEffect> = {
  ...HOLO,
  'base5-71': HOLO['base5-15']!,
  'base5-72': HOLO['base5-16']!,

  // The Boss's Way: take an Evolution card with Dark in its name from your deck (shown to the opponent).
  'base5-73': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: "The Boss's Way", filter: 'darkEvolution', reveal: true }),
  },

  // Challenge!: the opponent accepts (both bench any number of Basic Pokémon from their decks) or declines (you draw 2).
  'base5-74': {
    play(ctx) {
      const full = (p: PlayerState) => openBenchSlot(p.bench, ctx.state.cards, ctx.state.stadium?.card) < 0;
      if (full(ctx.me) && full(ctx.opp)) {
        ctx.log('Both Benches are full.');
        return ctx.draw(ctx.me, 2);
      }
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Challenge!', kind: 'challenge' };
    },
  },

  // Digger: flip; tails does 10 to your Active Pokémon, heads passes the flip to the opponent, until someone gets tails.
  'base5-75': {
    play(ctx) {
      for (let player: PlayerState = ctx.me; ; player = player === ctx.me ? ctx.opp : ctx.me) {
        if (flipCoin(ctx.state, 'Digger', player.id)) continue;
        if (!player.active) return;
        player.active.damage += 10;
        return addLog(ctx.state, `Digger did 10 damage to ${pokemonName(ctx.state, player.active)}.`, player.id);
      }
    },
  },

  // Imposter Oak's Revenge: discard a card from your hand; the opponent shuffles their hand into their deck and draws 4.
  'base5-76': {
    blocked: (s) => (otherHandCards(s).length ? null : 'You need another card in your hand to discard'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Choose a card from your hand to discard' }],
    play(ctx) {
      const discarded = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.me.discard.push(...discarded);
      ctx.log(`Discarded ${discarded.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
      const hand = ctx.opp.hand.splice(0);
      ctx.shuffleIntoDeck(ctx.opp, hand);
      ctx.log(`Shuffled ${hand.length} card${hand.length === 1 ? '' : 's'} into the deck.`, ctx.opp.id);
      ctx.draw(ctx.opp, 4);
    },
  },

  // Nightly Garbage Run: shuffle up to 3 Pokémon cards and/or basic Energy cards from your discard pile into your deck (shown to the opponent).
  'base5-77': {
    blocked: (s) => (garbage(s, s.me.discard).length ? null : 'No Pokémon or basic Energy cards in your discard pile'),
    choices: (s) => [{ kind: 'cards', field: 'discardUids', min: 1, max: 3, options: garbage(s, s.me.discard), prompt: 'Choose up to 3 Pokémon or basic Energy cards to shuffle into your deck' }],
    play(ctx) {
      const uids = ctx.choices.discardUids!;
      const cards = ctx.me.discard.filter((c) => uids.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !uids.includes(c.uid));
      ctx.shuffleIntoDeck(ctx.me, cards);
      ctx.log(`Shuffled ${cards.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')} from the discard pile into the deck.`);
    },
  },

  // Goop Gas Attack: all Pokémon Powers stop working until the end of the opponent's next turn.
  'base5-78': {
    play(ctx) {
      ctx.me.powersOffUntil = ctx.opp.powersOffUntil = ctx.turn + 1;
      ctx.log("All Pokémon Powers stop working until the end of the opponent's next turn.");
    },
  },

  // Sleep!: flip; heads puts the Defending Pokémon to sleep.
  'base5-79': {
    play(ctx) {
      const defending = ctx.opp.active;
      if (!ctx.flip() || !defending) return ctx.log('Sleep! did nothing.');
      const name = pokemonName(ctx.state, defending);
      if (noConditions(ctx.state, defending)) return ctx.log(`${name} can't be affected by Special Conditions.`, ctx.opp.id);
      defending.condition = 'asleep';
      delete defending.paralyzedTurn;
      ctx.log(`${name} is now Asleep.`, ctx.opp.id);
    },
  },
};

/** Rainbow Energy: when attached from the hand, 10 damage to the Pokémon (no Weakness or Resistance). */
const RAINBOW: EnergyEffect = {
  onAttach(state, owner, pokemon) {
    pokemon.damage += 10;
    addLog(state, `Rainbow Energy did 10 damage to ${pokemonName(state, pokemon)}.`, owner.id);
  },
};

export const ROCKET_ENERGY: Record<string, EnergyEffect> = {
  'base5-17': RAINBOW,
  'base5-80': RAINBOW,

  // Full Heal Energy: attached from the hand, the Pokémon is no longer Asleep, Confused, Paralyzed or Poisoned (Burned stays).
  'base5-81': {
    onAttach(state, owner, pokemon) {
      if (!pokemon.condition && !pokemon.poison) return;
      pokemon.condition = null;
      pokemon.poison = 0;
      delete pokemon.paralyzedTurn;
      addLog(state, `Full Heal Energy: ${pokemonName(state, pokemon)} is no longer Asleep, Confused, Paralyzed or Poisoned.`, owner.id);
    },
  },

  // Potion Energy: attached from the hand, remove 1 damage counter from the Pokémon, if it has any.
  'base5-82': {
    onAttach(state, owner, pokemon) {
      if (pokemon.damage < 10) return;
      pokemon.damage -= 10;
      addLog(state, `Potion Energy removed a damage counter from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
};
