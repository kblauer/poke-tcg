// Neo Genesis (neo1) Trainer cards and special Energy, by card id. Super Energy Retrieval stands in for the Japanese Fan
// Book promo of the same card, which TCGdex doesn't have (agreed).
// Pokémon Tools (Focus Band, Berry, Gold Berry, Miracle Berry) are attached to a Pokémon without one (`attached` with
// `tool`) and stay until it leaves play; their rules live where they apply: the Berries between turns (useBerry in
// engine.ts, automatic as soon as they can be used: agreed), Focus Band in attacks.ts (fortitude). The Stadiums' too:
// Ecogym (discardTheirEnergy), Sprout Tower (attacks.ts). So do the special Energy's: Darkness and Metal Energy (the EX
// rules, for every set's: agreed; attacks.ts) and Recycle Energy (back to the hand when it's discarded from play:
// returnRecycleEnergy).
// Rulings (from the text): Time Capsule's players each shuffle back 5 cards or none (all or none, if they have fewer),
// the opponent first, one at a time, so only the first can be declined; the CPU takes Pokémon before Energy (agreed). Double Gust's opponent picks first. Card-Flip Game's
// guess is Energy, Trainer or Pokémon, and the Prize card stays face up. Super Scoop Up, as Scoop Up, can't take the
// player's only Pokémon in play. Mind Games (Slowking) applies to all of these, Stadiums and Tools too.
import { isBasicEnergy, isPokemonCard, lookupCard } from '../cards.js';
import { activeLock, type CardInstance, type InPlayPokemon } from '../engine.js';
import { pokemonAt, trainerProof } from '../powers.js';
import { shuffle } from '../rng.js';
import { openBenchSlot, pokemonName } from '../status.js';
import { def, otherHandCards, swapActive, targetsOf, timeCapsuleCards, type EnergyEffect, type PendingChoice, type TrainerContext, type TrainerEffect, type TrainerSituation } from '../trainers.js';

const at = (side: { active: InPlayPokemon | null; bench: (InPlayPokemon | null)[] }, t: 'active' | number) => pokemonAt(side, t)!;
const isEnergy = (s: { cards: TrainerSituation['cards'] }, c: CardInstance) => def(s, c).kind === 'energy';

/** No more Trainer cards this turn (PokéGear, Time Capsule, Professor Elm). */
const noMoreTrainers = (ctx: TrainerContext) => void (ctx.me.noTrainersUntil = Math.max(ctx.me.noTrainersUntil ?? 0, ctx.turn));

/** A Pokémon Tool: attached to 1 of the player's Pokémon that doesn't have one. */
export const tool = (what: string): TrainerEffect => ({
  tool: true,
  blocked: (s) => (toolTargets(s).length ? null : 'All your Pokémon have a Pokémon Tool attached'),
  choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: toolTargets(s), prompt: `Choose a Pokémon to attach ${what} to` }],
  play(ctx) {
    const p = at(ctx.me, ctx.choices.target!);
    ctx.attachTo(p, Number.MAX_SAFE_INTEGER, { tool: true });
    ctx.log(`Attached ${what} to ${pokemonName(ctx.state, p)}.`);
  },
});
const toolTargets = (s: TrainerSituation) => targetsOf(s.me).filter((t) => !at(s.me, t).attached?.some((a) => a.tool));

/** Returns one of the player's Pokémon and every card with it to the hand (Super Scoop Up). */
function returnToHand(ctx: TrainerContext, t: 'active' | number) {
  const p = at(ctx.me, t);
  ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
  if (t === 'active') ctx.me.active = null;
  else ctx.me.bench[t] = null;
  ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it returned to the hand.`);
}

/** What a Prize card is, for Card-Flip Game's guess: 0 Energy, 1 Trainer, 2 Pokémon. */
const GUESSES = ['An Energy card', 'A Trainer card', 'A Pokémon card'];
const kindOf = (ctx: TrainerContext, c: CardInstance) => {
  const d = def(ctx.state, c);
  return d.kind === 'energy' ? 0 : isPokemonCard(d) ? 2 : 1;
};

/** Special Energy whose rules live where they apply (see the header): nothing happens when it's attached. */
const passiveEnergy: EnergyEffect = { onAttach: () => {} };

export const NEO1_TRAINERS: Record<string, TrainerEffect> = {
  // Arcade Game: shuffle the deck and reveal the top 3; 2 or more with the same name go into the hand, the rest are shuffled back.
  'neo1-83': {
    play(ctx) {
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      const top = ctx.me.deck.slice(0, 3);
      const names = top.map((c) => def(ctx.state, c).name);
      ctx.log(`Revealed ${names.join(', ') || 'nothing'}.`);
      const twice = names.find((n, i) => names.indexOf(n) !== i);
      const taken = twice ? top.filter((c) => def(ctx.state, c).name === twice) : [];
      ctx.me.deck = ctx.me.deck.filter((c) => !taken.includes(c));
      ctx.me.hand.push(...taken);
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      ctx.log(taken.length ? `Put ${taken.length} ${twice} into the hand; shuffled the rest back.` : 'No two shared a name: shuffled them back.');
    },
  },

  // Ecogym: a Stadium; non-Colorless Energy cards discarded from a Pokémon by another player's effect go back to the hand (discardTheirEnergy).
  'neo1-84': { stadium: true },

  // Energy Charge: flip; heads shuffles up to 2 Energy cards from the discard pile into the deck.
  'neo1-85': {
    blocked: (s) => (s.me.discard.some((c) => isEnergy(s, c)) ? null : 'No Energy cards in your discard pile'),
    choices: (s) => [{ kind: 'cards', field: 'discardUids', min: 1, max: 2, options: s.me.discard.filter((c) => isEnergy(s, c)), prompt: 'Choose up to 2 Energy cards to shuffle into your deck (if heads)' }],
    play(ctx) {
      if (!ctx.flip()) return ctx.log('Energy Charge did nothing.');
      const cards = ctx.me.discard.filter((c) => ctx.choices.discardUids!.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !cards.includes(c));
      ctx.shuffleIntoDeck(ctx.me, cards);
      ctx.log(`Shuffled ${cards.length} Energy card${cards.length === 1 ? '' : 's'} into the deck.`);
    },
  },

  // Focus Band: a Pokémon Tool (attacks.ts: on heads, not Knocked Out by the opponent's attack, 10 HP left).
  'neo1-86': tool('Focus Band'),

  // Mary: draw 2 cards, then shuffle 2 cards from the hand into the deck.
  'neo1-87': {
    play(ctx) {
      ctx.draw(ctx.me, 2);
      const count = Math.min(2, ctx.me.hand.length);
      if (count) ctx.pend({ kind: 'shuffleFromHand', source: 'Mary', count });
    },
  },

  // PokéGear: look at the top 7 cards; you may take a Trainer card among them (shown); shuffle. No more Trainer cards this turn.
  'neo1-88': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      noMoreTrainers(ctx);
      const looked = ctx.me.deck.slice(0, 7).map((c) => c.uid);
      ctx.pend({ kind: 'pickFromTop', source: 'PokéGear', looked, take: 1, trainer: true });
    },
  },

  // Super Energy Retrieval: trade 2 other cards from your hand for 4 basic Energy cards from your discard pile (all of them, if fewer).
  'neo1-89': {
    discardToHand: true,
    blocked(s) {
      if (otherHandCards(s).length < 2) return 'You need 2 other cards in your hand';
      return s.me.discard.some((c) => isBasicEnergy(def(s, c))) ? null : 'No basic Energy cards in your discard pile';
    },
    choices(s) {
      const energy = s.me.discard.filter((c) => isBasicEnergy(def(s, c)));
      const count = Math.min(4, energy.length);
      return [
        { kind: 'cards', field: 'handUids', min: 2, max: 2, options: otherHandCards(s), prompt: 'Choose 2 other cards to discard' },
        { kind: 'cards', field: 'discardUids', min: count, max: count, options: energy, prompt: `Choose ${count} basic Energy card${count === 1 ? '' : 's'} from your discard pile` },
      ];
    },
    play(ctx) {
      const taken = ctx.me.discard.filter((c) => ctx.choices.discardUids!.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !taken.includes(c));
      ctx.me.discard.push(...ctx.fromHand(ctx.me, ctx.choices.handUids!));
      ctx.me.hand.push(...taken);
      ctx.log(`Took ${taken.length} Energy from the discard pile.`);
    },
  },

  // Time Capsule: the opponent, then you, may shuffle 5 Basic Pokémon, Evolution and basic Energy cards (all or none, if fewer) from the discard pile into the deck. No more Trainer cards this turn.
  'neo1-90': {
    play(ctx) {
      noMoreTrainers(ctx);
      const first = timeCapsuleCards(ctx.state.cards, ctx.opp.discard).length ? ctx.opp : ctx.me;
      if (!timeCapsuleCards(ctx.state.cards, first.discard).length) return ctx.log('Time Capsule found nothing to shuffle back.');
      ctx.state.pendingChoice = { player: first.id, source: 'Time Capsule', kind: 'timeCapsule', count: 5, ...(first === ctx.opp && { then: ctx.me.id }) } as PendingChoice;
    },
  },

  // Bill's Teleporter: flip; heads draws 4 cards.
  'neo1-91': {
    play(ctx) {
      if (ctx.flip()) ctx.draw(ctx.me, 4);
      else ctx.log("Bill's Teleporter did nothing.");
    },
  },

  // Card-Flip Game: choose 1 of the opponent's face-down Prize cards and guess what it is; it's turned face up, and a right guess draws 2 cards.
  'neo1-92': {
    blocked: (s) => (s.oppFaceDownPrizes.length ? null : 'Your opponent has no face-down Prize cards'),
    choices(s) {
      const options = s.oppFaceDownPrizes;
      return [
        { kind: 'pick', field: 'pick', options, labels: options.map((i) => `Prize ${i + 1}`), prompt: "Choose one of your opponent's face-down Prize cards" },
        { kind: 'pick', field: 'guess', options: [0, 1, 2], labels: GUESSES, prompt: 'Guess what it is' },
      ];
    },
    play(ctx) {
      const prize = ctx.opp.prizes[ctx.choices.pick!];
      if (!prize) return;
      (ctx.opp.faceUpPrizes ??= []).push(prize.uid);
      const right = kindOf(ctx, prize) === ctx.choices.guess;
      ctx.log(`Guessed ${GUESSES[ctx.choices.guess!]!.toLowerCase()}: Prize ${ctx.choices.pick! + 1} is ${def(ctx.state, prize).name}${right ? ', a right guess' : ''}.`);
      if (right) ctx.draw(ctx.me, 2);
    },
  },

  // Gold Berry: a Pokémon Tool (useBerry: between turns, with 4 or more damage counters, remove 4).
  'neo1-93': tool('Gold Berry'),

  // Miracle Berry: a Pokémon Tool (useBerry: between turns, removes Asleep, Confused, Paralyzed and Poisoned).
  'neo1-94': tool('Miracle Berry'),

  // New Pokédex: shuffle the deck, then look at up to 5 cards from the top and put them back in any order.
  'neo1-95': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
      ctx.pend({ kind: 'arrangeTop', source: 'New Pokédex', count: Math.min(5, ctx.me.deck.length) });
    },
  },

  // Professor Elm: shuffle the hand into the deck and draw 7 cards. No more Trainer cards this turn.
  'neo1-96': {
    play(ctx) {
      noMoreTrainers(ctx);
      ctx.shuffleIntoDeck(ctx.me, ctx.fromHand(ctx.me, ctx.me.hand.map((c) => c.uid)));
      ctx.draw(ctx.me, 7);
    },
  },

  // Sprout Tower: a Stadium; Colorless Pokémon's attacks do 30 less damage, after Weakness and Resistance (attacks.ts).
  'neo1-97': { stadium: true },

  // Super Scoop Up: flip; heads returns 1 of your Pokémon and all cards attached to it to your hand.
  'neo1-98': {
    blocked: (s) => (targetsOf(s.me).length < 2 ? "You can't Scoop Up your only Pokémon in play" : null),
    // Not an Active Pokémon held by Jaw Clamp.
    choices: (s) => [
      { kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => t !== 'active' || !activeLock(s.me, [s.me, s.opp], s.cards)), prompt: 'Choose a Pokémon to return to your hand (if heads)' },
    ],
    play(ctx) {
      if (ctx.flip()) returnToHand(ctx, ctx.choices.target!);
      else ctx.log('Super Scoop Up did nothing.');
    },
  },

  // Berry: a Pokémon Tool (useBerry: between turns, with 2 or more damage counters, remove 2).
  'neo1-99': tool('Berry'),

  // Double Gust: the opponent switches 1 of your benched Pokémon (their pick) with your Active Pokémon; then you switch 1 of theirs with their Active Pokémon.
  'neo1-100': {
    blocked: (s) => (s.me.bench.some(Boolean) || s.opp.bench.some(Boolean) ? null : 'Neither player has any Benched Pokémon'),
    choices: (s) => {
      const options = targetsOf(s.opp).filter((t) => t !== 'active');
      return options.length ? [{ kind: 'pokemon', field: 'oppTarget', side: 'opp', options, prompt: "Choose one of your opponent's benched Pokémon to switch with their Active Pokémon" }] : [];
    },
    play(ctx) {
      // Legendary Body: an Active Pokémon with it working isn't switched.
      const proof = (side: typeof ctx.me) => trainerProof(side, [ctx.me, ctx.opp], ctx.state.cards);
      const oppSlot = typeof ctx.choices.oppTarget === 'number' && !proof(ctx.opp) ? ctx.choices.oppTarget : undefined;
      if (ctx.me.bench.some(Boolean) && !proof(ctx.me)) {
        // The opponent picks which of the player's benched Pokémon comes in; then the player's pick of theirs.
        ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Double Gust', kind: 'doubleGust', ...(oppSlot !== undefined && { oppSlot }) } as PendingChoice;
        return;
      }
      if (oppSlot !== undefined && ctx.opp.bench[oppSlot]) swapActive(ctx.state, ctx.opp, oppSlot);
    },
  },

  // Moo-Moo Milk: choose 1 of your Pokémon; flip 2 coins and remove 2 damage counters for each heads.
  'neo1-101': {
    blocked: (s) => (targetsOf(s.me).some((t) => at(s.me, t).damage > 0) ? null : 'None of your Pokémon have damage counters'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => at(s.me, t).damage > 0), prompt: 'Choose a Pokémon to heal' }],
    play(ctx) {
      const p = at(ctx.me, ctx.choices.target!);
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      const healed = Math.min(20 * heads, p.damage);
      p.damage -= healed;
      ctx.log(healed ? `${pokemonName(ctx.state, p)} healed ${healed} damage.` : 'Moo-Moo Milk did nothing.');
    },
  },

  // Pokémon March: the opponent, then you, may put a Basic Pokémon from the deck onto the Bench (unless it's full).
  'neo1-102': {
    play(ctx) {
      const room = (p: typeof ctx.me) => openBenchSlot(p, ctx.state.cards, ctx.state.stadium?.card) >= 0;
      const search = { source: 'Pokémon March', kind: 'pickFromDeck', filter: 'basic', toBench: true, optional: true, reveal: true } as const;
      if (room(ctx.opp)) ctx.state.pendingChoice = { ...search, player: ctx.opp.id, ...(room(ctx.me) && { then: ctx.me.id }) };
      else if (room(ctx.me)) ctx.pend(search);
      else ctx.log('Both Benches are full.');
    },
  },

  // Super Rod: flip; heads puts an Evolution card from the discard pile into the hand, tails a Basic Pokémon card.
  'neo1-103': {
    discardToHand: true,
    blocked: (s) => (s.me.discard.some((c) => isPokemonCard(def(s, c))) ? null : 'No Pokémon cards in your discard pile'),
    play(ctx) {
      const filter = ctx.flip() ? 'evolution' : 'basic';
      if (!ctx.me.discard.some((c) => isPokemonCard(def(ctx.state, c)) && isBasic(ctx, c) === (filter === 'basic'))) return ctx.log(`No ${filter === 'basic' ? 'Basic Pokémon' : 'Evolution'} cards in the discard pile.`);
      ctx.pend({ kind: 'discardToHand', source: 'Super Rod', count: 1, filter });
    },
  },
};

const isBasic = (ctx: TrainerContext, c: CardInstance) => {
  const d = lookupCard(ctx.state.cards, c.defId);
  return d.kind === 'pokemon' && d.stage === 'basic';
};

/** Neo Genesis's special Energy: Metal (19), Darkness (104) and Recycle (105); their rules live where they apply. */
export const NEO1_ENERGY: Record<string, EnergyEffect> = {
  'neo1-19': passiveEnergy,
  'neo1-104': passiveEnergy,
  'neo1-105': passiveEnergy,
};
