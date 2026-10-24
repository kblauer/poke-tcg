// Skyridge (ecard3) Trainer cards and special Energy, by card id. The Miracle Spheres and Mystery Plates are Technical
// Machines (as Expedition's Multi Technical Machine 01): attached until the end of the turn, a Miracle Sphere only to an
// Evolved Pokémon of its types (or one with Synchronicity), and their attacks are in ecard3.ts. Crystal Shard's type change
// is in inPlayDef (status.ts) and its discard in performAttack; Star Piece works between turns (engine.ts); Mirage Stadium's
// rule is in RETREAT.
// Rulings (from the text): Desert Shaman shuffles both hands in, then each player draws up to 4 (the player who played it
// first). Fast Ball reveals from the top until an Evolution card; the other revealed cards are shuffled back. Fisherman takes
// 4 basic Energy cards, or all of them if there are fewer. Friend Ball takes a Baby, Basic or Evolution card of the chosen
// Pokémon's type. Hyper Potion needs a Pokémon with damage counters and a basic Energy card. Ancient Ruins can't be used
// after a Supporter card was played that turn. Underground Expedition's other 2 cards stay at the bottom in the same order.
// Bounce Energy returns a basic Energy card (the player picks one when they differ); Cyclone Energy's switch is the
// opponent's choice; Retro Energy asks whether to use it.
import { isBasicEnergy, isPokemonCard, isTrainerCard, lookupCard, type Attack, type EnergyType } from '../cards.js';
import type { InPlayPokemon, PlayerState, Target } from '../engine.js';
import { pokemonAt, powerActive } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog, effectId, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { swapActive, targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { targetOf } from './common.js';
import { powerEffect, trainerEffect } from './index.js';
import { tool } from './neo1-trainers.js';

const at = (side: Pick<PlayerState, 'active' | 'bench'>, t: Target) => pokemonAt(side, t)!;
const isBasic = (cards: TrainerSituation['cards'], c: { defId: string }) => isBasicEnergy(lookupCard(cards, c.defId));
const attack = (name: string, cost: EnergyType[], damage: number, damageText: string | null, text: string): Attack => ({ name, cost, damage, damageText, text });

/** Synchronicity: any Technical Machine can be attached to this Pokémon (while the Poké-Body works). */
const synchronized = (s: TrainerSituation, p: InPlayPokemon) => !!powerEffect(effectId(p))?.synchronicity && powerActive(p, s.cards, [s.me, s.opp]);

/** A Technical Machine attached to one of the player's Pokémon `fits` allows (or one with Synchronicity), with its attack (in ecard3.ts, by this card's id). */
const machine = (what: string, fits: (s: TrainerSituation, p: InPlayPokemon) => boolean, technicalMachine: Attack): TrainerEffect => {
  const options = (s: TrainerSituation) => targetsOf(s.me).filter((t) => fits(s, at(s.me, t)) || synchronized(s, at(s.me, t)));
  return {
    technicalMachine,
    blocked: (s) => (options(s).length ? null : `You have no ${what} in play`),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: options(s), prompt: `Choose one of your ${what} to attach it to` }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      ctx.attachTo(p, ctx.turn);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, ctx.card.defId).name} to ${pokemonName(ctx.state, p)}.`);
    },
  };
};

/** A Miracle Sphere: for an Evolved Pokémon of one of `types`. */
const sphere = (types: EnergyType[], technicalMachine: Attack) =>
  machine(`Evolved ${types.map((t) => t[0]!.toUpperCase() + t.slice(1)).join(', ')} Pokémon`, (s, p) => p.evolvedFrom.length > 0 && types.includes(inPlayDef(s.cards, p).type), technicalMachine);

/** A Mystery Plate: for any Pokémon. */
const plate = (technicalMachine: Attack) => machine('Pokémon', () => true, technicalMachine);

const isEvolution = (cards: TrainerSituation['cards'], c: { defId: string }) => {
  const d = lookupCard(cards, c.defId);
  return isPokemonCard(d) && d.stage !== 'basic';
};

/** The player's Pokémon Hyper Potion can be played on: damaged, with a basic Energy card attached. */
const potionTargets = (s: TrainerSituation) => targetsOf(s.me).filter((t) => at(s.me, t).damage > 0 && at(s.me, t).energy.some((e) => !e.provides && isBasic(s.cards, e)));

export const ECARD3_TRAINERS: Record<string, TrainerEffect> = {
  // Ancient Ruins (Stadium): once during each player's turn, with no Supporter card played, they show their hand; with no Supporter card in it, they draw a card.
  'ecard3-119': {
    stadium: true,
    stadiumBlocked: (me, _cards, turn) => (me.supporterTurn === turn ? 'Ancient Ruins: you have played a Supporter card this turn' : null),
    useStadium({ state, me }) {
      const names = me.hand.map((c) => lookupCard(state.cards, c.defId).name);
      addLog(state, `Ancient Ruins: showed the hand (${names.join(', ') || 'no cards'}).`, me.id);
      if (me.hand.some((c) => !!trainerEffect(c.defId)?.supporter)) return;
      const drawn = me.deck.shift();
      if (drawn) me.hand.push(drawn);
      addLog(state, drawn ? 'Ancient Ruins: no Supporter card, so drew a card.' : 'Ancient Ruins: no cards left to draw.', me.id);
    },
  },

  // Relic Hunter (Supporter): up to 2 Supporter and/or Stadium cards from the deck.
  'ecard3-120': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Relic Hunter', filter: 'supporterOrStadium', count: 2, optional: true, reveal: true }),
  },

  // Apricorn Maker (Supporter): up to 2 Trainer cards with Ball in their names from the deck.
  'ecard3-121': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Apricorn Maker', filter: 'ballTrainer', count: 2, optional: true, reveal: true }),
  },

  // Crystal Shard (Pokémon Tool): the Pokémon is Colorless; discarded at the end of a turn it attacks.
  'ecard3-122': tool('Crystal Shard'),

  // Desert Shaman (Supporter): both players shuffle their hands into their decks and draw up to 4 cards.
  'ecard3-123': {
    supporter: true,
    play(ctx) {
      for (const player of [ctx.me, ctx.opp]) {
        ctx.shuffleIntoDeck(player, player.hand);
        player.hand = [];
      }
      ctx.log('Both players shuffled their hands into their decks.');
      ctx.pend({ kind: 'drawCount', source: 'Desert Shaman', max: 4, alsoOpponent: true });
    },
  },

  // Fast Ball: cards from the top of the deck until an Evolution card, which goes into the hand; the rest are shuffled back.
  'ecard3-124': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const i = ctx.me.deck.findIndex((c) => isEvolution(ctx.state.cards, c));
      if (i < 0) ctx.log(`Fast Ball revealed the whole deck (${ctx.me.deck.length} cards): no Evolution card.`);
      else {
        const [found] = ctx.me.deck.splice(i, 1);
        ctx.me.hand.push(found!);
        ctx.log(`Fast Ball revealed ${i + 1} card${i ? 's' : ''} and took ${lookupCard(ctx.state.cards, found!.defId).name}.`);
      }
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
    },
  },

  // Fisherman (Supporter): 4 basic Energy cards from the discard pile into the hand (all of them, if fewer).
  'ecard3-125': {
    supporter: true,
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => isBasic(s.cards, c)) ? null : 'No basic Energy cards in your discard pile'),
    play(ctx) {
      const energy = ctx.me.discard.filter((c) => isBasic(ctx.state.cards, c));
      if (energy.length > 4) return ctx.pend({ kind: 'discardToHand', source: 'Fisherman', count: 4, filter: 'basicEnergy', reveal: true });
      ctx.me.discard = ctx.me.discard.filter((c) => !energy.includes(c));
      ctx.me.hand.push(...energy);
      ctx.log(`Fisherman: put ${energy.length} basic Energy card${energy.length === 1 ? '' : 's'} from the discard pile into the hand.`);
    },
  },

  // Friend Ball: a Baby, Basic or Evolution card from the deck of the type of the chosen opponent's Pokémon.
  'ecard3-126': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    choices: (s) => [{ kind: 'pokemon', field: 'oppTarget', side: 'opp', options: targetsOf(s.opp), prompt: "Choose one of your opponent's Pokémon: a card of its type comes from your deck" }],
    play(ctx) {
      const type = inPlayDef(ctx.state.cards, at(ctx.opp, ctx.choices.oppTarget!)).type;
      ctx.pend({ kind: 'pickFromDeck', source: 'Friend Ball', filter: 'pokemonType', type, reveal: true });
    },
  },

  // Hyper Potion: discard 1 or 2 basic Energy cards from one of the player's Pokémon; up to 3 (1) or 5 (2) damage counters off it.
  'ecard3-127': {
    blocked: (s) => (potionTargets(s).length ? null : 'None of your Pokémon has damage counters and a basic Energy card attached'),
    choices(s, c) {
      const specs = [{ kind: 'pokemon' as const, field: 'target' as const, side: 'own' as const, options: potionTargets(s), prompt: 'Choose one of your Pokémon to heal' }];
      if (c.target === undefined) return specs;
      const energy = at(s.me, c.target).energy.filter((e) => !e.provides && isBasic(s.cards, e));
      return [...specs, { kind: 'cards' as const, field: 'energyUids' as const, min: 1, max: 2, options: energy, prompt: 'Discard 1 basic Energy card (3 damage counters off) or 2 (5)' }];
    },
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      const gone = p.energy.filter((e) => ctx.choices.energyUids!.includes(e.uid));
      p.energy = p.energy.filter((e) => !gone.includes(e));
      ctx.me.discard.push(...gone);
      const healed = Math.min(gone.length === 2 ? 50 : 30, p.damage);
      p.damage -= healed;
      ctx.log(`Discarded ${gone.length} basic Energy card${gone.length === 1 ? '' : 's'}; ${pokemonName(ctx.state, p)} healed ${healed} damage.`);
    },
  },

  // Lure Ball: a flip for each of 3 coins; an Evolution card from the discard pile into the hand for each heads.
  'ecard3-128': {
    discardToHand: true,
    play(ctx) {
      let heads = 0;
      for (let i = 0; i < 3; i++) if (ctx.flip()) heads++;
      if (!heads) return ctx.log('Lure Ball did nothing.');
      if (!ctx.me.discard.some((c) => isEvolution(ctx.state.cards, c))) return ctx.log('Lure Ball: no Evolution cards in the discard pile.');
      ctx.pend({ kind: 'discardToHand', source: 'Lure Ball', count: heads, filter: 'evolution', reveal: true });
    },
  },

  // The Miracle Spheres (Technical Machines, for Evolved Pokémon of 3 types).
  'ecard3-129': sphere(
    ['fire', 'lightning', 'fighting'],
    attack('Fire Force', ['fire', 'colorless', 'colorless'], 30, '30+', 'If the Pokémon using this attack has Fire and Lightning basic Energy cards attached to it, the Defending Pokémon is now Confused. If the Pokémon using this attack has Fire and Fighting basic Energy cards attached to it, this attack does 30 damage plus 10 more damage and removes 3 damage counters from the Pokémon that Miracle Sphere α is attached to.'),
  ),
  'ecard3-130': sphere(
    ['fire', 'water', 'psychic'],
    attack('Freezing Force', ['water', 'colorless', 'colorless'], 30, '30+', 'If the Pokémon using this attack has Fire and Water basic Energy cards attached to it, this attack does 30 damage plus 10 more damage and the Defending Pokémon is now Burned. If the Pokémon using this attack has Water and Psychic basic Energy cards attached to it, choose an Energy card attached to the Defending Pokémon, if any, and your opponent shuffles that card into his or her deck.'),
  ),
  'ecard3-131': sphere(
    ['grass', 'water', 'lightning'],
    attack('Thunder Force', ['lightning', 'colorless', 'colorless'], 30, '30+', "If the Pokémon using this attack has Grass and Lightning basic Energy cards attached to it, the Defending Pokémon is now Asleep and Poisoned. If the Pokémon using this attack has Water and Lightning basic Energy cards attached to it, this attack does 30 damage plus 10 more damage and lets you put 1 damage counter on each of your opponent's Benched Pokémon."),
  ),

  // Mirage Stadium (Stadium): its rule is in RETREAT (engine.ts).
  'ecard3-132': { stadium: true },

  // The Mystery Plates (Technical Machines, for any Pokémon).
  'ecard3-133': plate(attack('Desert Burn', ['colorless'], 0, null, 'If your opponent has 5 or more Prizes, search your deck for a Trainer card, show it to your opponent, and put it into your hand. If your opponent has only 1 Prize, the Defending Pokémon is now Burned, Paralyzed, and Poisoned.')),
  'ecard3-134': plate(attack('Stone Crush', ['colorless'], 0, null, 'If your opponent has 5 or more Prizes, draw 3 cards. If your opponent has only 1 Prize, choose 2 Energy cards attached to the Defending Pokémon (1 if it has only 1). Your opponent shuffles those cards into his or her deck.')),
  'ecard3-135': plate(attack('Retro Cave', ['colorless'], 0, null, "If your opponent has 5 or more Prizes, shuffle your hand into your deck and then draw 6 cards. If your opponent has exactly 2 Prizes, choose 1 of your opponent's Evolved Pokémon. Your opponent puts the top card on that Evolved Pokémon on the bottom of his or her deck. (This counts as devolving that Pokémon.)")),
  'ecard3-136': plate(attack('Healing Oasis', ['colorless'], 0, null, 'If your opponent has 5 or more Prizes, search your deck for up to 3 basic Energy cards, show them to your opponent, and put them into your hand. Shuffle your deck afterward. If your opponent has exactly 2 Prizes, remove all damage counters from 1 of your Pokémon.')),

  // Mystery Zone (Stadium): once during each player's turn, with an Evolution card in the hand, a basic Energy card from the deck into the hand and an Evolution card from the hand into the deck.
  'ecard3-137': {
    stadium: true,
    stadiumBlocked: (me, cards) => (me.hand.some((c) => isEvolution(cards, c)) ? null : 'Mystery Zone: no Evolution cards in your hand'),
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Mystery Zone', kind: 'mysteryZone' };
    },
  },

  // Oracle (Supporter): 2 cards from the deck on top, in any order; the rest shuffled.
  'ecard3-138': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'oracle', source: 'Oracle', picked: [] }),
  },

  // Star Piece (Pokémon Tool): between turns, Benched with 2 or more damage counters, its Pokémon evolves from the deck (engine.ts).
  'ecard3-139': tool('Star Piece'),

  // Underground Expedition (Supporter): 2 of the bottom 4 cards of the deck into the hand.
  'ecard3-140': {
    supporter: true,
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const looked = ctx.me.deck.slice(-4).map((c) => c.uid);
      ctx.pend({ kind: 'bottomPick', source: 'Underground Expedition', looked, take: Math.min(2, looked.length) });
    },
  },

  // Underground Lake (Stadium): once during each player's turn, an Omanyte or Kabuto from the discard pile onto the Bench, as a Basic Pokémon.
  'ecard3-141': {
    stadium: true,
    stadiumBlocked(me, cards) {
      if (openBenchSlot(me.bench, cards) < 0) return 'Underground Lake: your Bench is full';
      const fossil = me.discard.some((c) => ['Omanyte', 'Kabuto'].includes(lookupCard(cards, c.defId).name) && !isTrainerCard(lookupCard(cards, c.defId)));
      return fossil ? null : 'Underground Lake: no Omanyte or Kabuto in your discard pile';
    },
    useStadium({ state, me }) {
      state.pendingChoice = { player: me.id, source: 'Underground Lake', kind: 'discardToBench', filter: 'fossil' };
    },
  },
};

/** Skyridge's special Energy (see the header). Bounce Energy provides 2 Colorless Energy (apps/api/src/cards.ts). */
export const ECARD3_ENERGY: Record<string, EnergyEffect> = {
  // Bounce Energy: only onto a Pokémon with basic Energy cards; a basic Energy card attached to it goes back to the hand.
  'ecard3-142': {
    attachError: (_p, inPlay, cards) => (inPlay.energy.some((e) => !e.provides && isBasic(cards, e)) ? null : 'Bounce Energy can only be attached to a Pokémon with basic Energy cards attached'),
    onAttach(state, owner, pokemon) {
      const basic = pokemon.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)));
      if (!basic.length) return;
      if (new Set(basic.map((e) => e.defId)).size > 1) {
        state.pendingChoice = { player: owner.id, source: 'Bounce Energy', kind: 'discardAttached', target: targetOf(owner, pokemon), toHand: true };
        return;
      }
      const back = basic[0]!;
      pokemon.energy = pokemon.energy.filter((e) => e !== back);
      const { converted: _c, windless: _w, ...card } = back;
      owner.hand.push(card);
      addLog(state, `Bounce Energy: returned ${lookupCard(state.cards, back.defId).name} to the hand.`, owner.id);
    },
  },
  // Cyclone Energy: attached to the Active Pokémon, the opponent switches their Active Pokémon (their choice).
  'ecard3-143': {
    onAttach(state, owner, pokemon) {
      if (owner.active !== pokemon) return;
      const opp = state.playerOrder.map((id) => state.players[id]!).find((p) => p !== owner)!;
      const benched = opp.bench.flatMap((p, i) => (p ? [i] : []));
      if (benched.length === 1) return swapActive(state, opp, benched[0]!);
      if (benched.length) state.pendingChoice = { player: opp.id, source: 'Cyclone Energy', kind: 'switchIn' };
    },
  },
  // Retro Energy: attached to an Evolved Pokémon, it may lose up to 2 damage counters and devolve.
  'ecard3-144': {
    onAttach(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length) return;
      state.pendingChoice = { player: owner.id, source: 'Retro Energy', kind: 'mayUse', power: 'retroEnergy', target: targetOf(owner, pokemon) };
    },
  },
};
