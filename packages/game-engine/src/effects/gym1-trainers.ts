// Gym Heroes (gym1) Trainer cards, by card id. Brock (98), Erika (100), Lt. Surge (101) and Misty (102) are the
// non-holo prints of 15–18. The Stadiums' rules live where they apply: retreat costs (retreatModifier), No Removal
// Gym (trainers.ts), Pewter City Gym and Vermilion City Gym (attacks.ts), Narrow Gym (openBenchSlot).
// Rulings: Misty's Duel's Rock-Paper-Scissors is the card's own coin flip (heads, the player who played it wins).
// Lt. Surge's Treaty: the opponent chooses; a Prize card taken this way can win the game. The Rocket's Trap and
// Tickling Machine affect the opponent's hand as it is (Tickling Machine's cards come back at the end of their turn).
// Agreed: Celadon City Gym can be used any number of times a turn, while there's an Energy card to discard. Vermilion
// City Gym asks the player before each attack; the CPU always flips. Blaine's Quiz #1 offers 4 lengths, and the CPU
// guesses at random.
import { isBasicPokemon, isPokemonCard, lookupCard, type PokemonCardDef } from '../cards.js';
import type { CardInstance, PlayerState } from '../engine.js';
import { trainerProof } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog, clearOnLeavingActive, openBenchSlot, pokemonName } from '../status.js';
import { cureConditions, otherHandCards, targetsOf, type TrainerContext, type TrainerEffect, type TrainerSituation } from '../trainers.js';

const names = (ctx: TrainerContext, cards: CardInstance[]) => cards.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ');

/** Discards the chosen cards from the hand (Misty, Blaine's Gamble). */
function discardFromHand(ctx: TrainerContext) {
  const cards = ctx.fromHand(ctx.me, ctx.choices.handUids ?? []);
  ctx.me.discard.push(...cards);
  if (cards.length) ctx.log(`Discarded ${names(ctx, cards)}.`);
  return cards.length;
}

/** Shuffles the player's hand into their deck and draws `n` (Misty's Duel, Sabrina's Gaze). */
function newHand(ctx: TrainerContext, player: PlayerState, n: number) {
  const hand = player.hand.splice(0);
  ctx.shuffleIntoDeck(player, hand);
  ctx.log(`Shuffled ${hand.length} card${hand.length === 1 ? '' : 's'} into the deck.`, player.id);
  ctx.draw(player, n);
}

const basicsInHand = (s: TrainerSituation) => otherHandCards(s).filter((c) => isBasicPokemon(lookupCard(s.cards, c.defId)));

const BROCK: TrainerEffect = {
  blocked: (s) => (targetsOf(s.me).some((t) => (t === 'active' ? s.me.active : s.me.bench[t])!.damage > 0) ? null : 'None of your Pokémon have damage counters'),
  play(ctx) {
    for (const p of [ctx.me.active, ...ctx.me.bench]) {
      if (!p || !p.damage || trainerProof(ctx.me, [ctx.me, ctx.opp], ctx.state.cards, p)) continue;
      p.damage -= 10;
      ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, p)}.`);
    }
  },
};

// Draw up to 3, then the opponent may draw up to 3 (the same choice as Computer Error).
const ERIKA: TrainerEffect = { play: (ctx) => ctx.pend({ kind: 'drawCount', source: 'Erika', max: 3, alsoOpponent: true }) };

const LT_SURGE: TrainerEffect = {
  blocked(s) {
    if (!basicsInHand(s).length) return 'You have no Basic Pokémon cards in your hand';
    return trainerProof(s.me, [s.me, s.opp], s.cards) ?? (openBenchSlot(s.me.bench, s.cards, s.stadium) >= 0 ? null : 'Your Bench is full');
  },
  choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: basicsInHand(s), prompt: 'Choose a Basic Pokémon to put into play as your Active Pokémon' }],
  play(ctx) {
    const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
    const old = ctx.me.active!;
    clearOnLeavingActive(old);
    ctx.me.bench[openBenchSlot(ctx.me.bench, ctx.state.cards, ctx.state.stadium?.card)] = old;
    ctx.me.active = { card: card!, evolvedFrom: [], damage: 0, energy: [], playedTurn: ctx.turn };
    ctx.log(`${pokemonName(ctx.state, ctx.me.active)} is the new Active Pokémon; ${pokemonName(ctx.state, old)} went to the Bench.`);
  },
};

const MISTY: TrainerEffect = {
  blocked: (s) => (otherHandCards(s).length >= 2 ? null : 'You need 2 other cards in your hand to discard'),
  choices: (s) => [{ kind: 'cards', field: 'handUids', min: 2, max: 2, options: otherHandCards(s), prompt: 'Choose 2 cards from your hand to discard' }],
  play(ctx) {
    discardFromHand(ctx);
    const count = (ctx.me.misty?.turn === ctx.turn ? ctx.me.misty.count : 0) + 1;
    ctx.me.misty = { turn: ctx.turn, count };
    ctx.log('Attacks by Pokémon with Misty in their names do 20 more damage this turn.');
  },
};

export const GYM1_TRAINERS: Record<string, TrainerEffect> = {
  'gym1-15': BROCK,
  'gym1-98': BROCK,
  'gym1-16': ERIKA,
  'gym1-100': ERIKA,
  'gym1-17': LT_SURGE,
  'gym1-101': LT_SURGE,
  'gym1-18': MISTY,
  'gym1-102': MISTY,

  // The Rocket's Trap: flip; heads, up to 3 cards at random from the opponent's hand are shuffled into their deck.
  'gym1-19': {
    play(ctx) {
      if (!ctx.flip()) return ctx.log("The Rocket's Trap did nothing.");
      let order: CardInstance[];
      [order, ctx.state.rngState] = shuffle(ctx.opp.hand, ctx.state.rngState);
      const taken = order.slice(0, 3);
      ctx.opp.hand = ctx.opp.hand.filter((c) => !taken.includes(c));
      ctx.shuffleIntoDeck(ctx.opp, taken);
      ctx.log(`Shuffled ${taken.length} card${taken.length === 1 ? '' : 's'} from the hand into the deck.`, ctx.opp.id);
    },
  },

  // Blaine's Quiz #1: a Pokémon card from the hand, named; the opponent guesses its length among 4. Right, they draw 2;
  // wrong, you do. The card stays in the hand.
  'gym1-97': {
    blocked: (s) => (quizCards(s).length ? null : 'You have no Pokémon card in your hand to quiz on'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: quizCards(s), prompt: 'Choose a Pokémon card from your hand to put face down' }],
    play(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.handUids![0])!;
      const d = lookupCard(ctx.state.cards, card.defId) as PokemonCardDef;
      const inches = toInches(d.length!);
      // The right length and 3 others a few inches to a foot away, in order.
      let others: number[];
      [others, ctx.state.rngState] = shuffle([-12, -6, -3, 3, 6, 12].map((n) => inches + n).filter((n) => n > 0), ctx.state.rngState);
      const lengths = [inches, ...others.slice(0, 3)].sort((a, b) => a - b);
      ctx.log(`Put ${d.name} face down.`);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: "Blaine's Quiz #1", kind: 'quiz', card, lengths: lengths.map(fromInches), answer: lengths.indexOf(inches) };
    },
  },

  // Charity: attach to your Active Pokémon; it goes back to your hand at the end of the turn unless that Pokémon is
  // Knocked Out. Its attack may do less damage (the attack's `charity` question).
  'gym1-99': {
    blocked: (s) => trainerProof(s.me, [s.me, s.opp], s.cards) ?? (s.me.active ? null : 'You have no Active Pokémon'),
    play(ctx) {
      ctx.attachTo(ctx.me.active!, ctx.turn, { toHand: true });
      ctx.log(`Attached Charity to ${pokemonName(ctx.state, ctx.me.active!)}.`);
    },
  },

  // No Removal Gym: Energy Removal and Super Energy Removal need 2 other cards discarded from the hand (trainers.ts).
  'gym1-103': { stadium: true },

  // The Rocket's Training Gym: each Active Pokémon pays 1 more to retreat.
  'gym1-104': { stadium: true, retreatModifier: () => 1 },

  // Blaine's Last Resort: only with no other cards in the hand; draw 5.
  'gym1-105': {
    blocked: (s) => (otherHandCards(s).length ? 'You can play it only with no other cards in your hand' : null),
    play(ctx) {
      ctx.log('Showed the hand: no other cards.');
      ctx.draw(ctx.me, 5);
    },
  },

  // Brock's Training Method: take a Pokémon card with Brock in its name from the deck (shown to the opponent).
  'gym1-106': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: "Brock's Training Method", filter: 'ownerPokemon', name: 'Brock', reveal: true }),
  },

  // Celadon City Gym: any number of times during a turn, discard an Energy card from your Pokémon with Erika in its name to
  // cure it of Asleep, Confused, Paralyzed and Poisoned. Only an Active Pokémon has those, so it's the Active one.
  'gym1-107': {
    stadium: true,
    stadiumAnyTimes: true,
    stadiumBlocked(me, cards) {
      const p = me.active;
      if (!p || !lookupCard(cards, p.card.defId).name.includes('Erika')) return 'Celadon City Gym: your Active Pokémon must have Erika in its name';
      if (!p.energy.some((e) => !e.provides)) return 'Celadon City Gym: it has no Energy cards to discard';
      return p.condition || p.poison ? null : 'Celadon City Gym: it has no Special Condition to remove';
    },
    useStadium({ state, me }) {
      const p = me.active!;
      const energy = p.energy.filter((e) => !e.provides);
      // Identical cards need no choice.
      if (new Set(energy.map((e) => e.defId)).size > 1) {
        state.pendingChoice = { player: me.id, source: 'Celadon City Gym', kind: 'discardAttached', target: 'active', cure: true };
        return;
      }
      p.energy = p.energy.filter((e) => e !== energy[0]);
      me.discard.push(energy[0]!);
      addLog(state, `Discarded ${lookupCard(state.cards, energy[0]!.defId).name} from ${pokemonName(state, p)}.`, me.id);
      cureConditions(state, me, p);
    },
  },

  // Cerulean City Gym: a Pokémon with Misty in its name pays 1 less to retreat.
  'gym1-108': { stadium: true, retreatModifier: (p) => (p.name.includes('Misty') ? -1 : 0) },

  // Erika's Maids: trade 2 other cards from the hand for up to 2 Pokémon cards with Erika in their names from the deck.
  'gym1-109': {
    blocked: (s) => (otherHandCards(s).length >= 2 ? null : 'You need 2 other cards in your hand to trade'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 2, max: 2, options: otherHandCards(s), prompt: 'Choose 2 cards from your hand to trade' }],
    play: (ctx) =>
      ctx.pend({ kind: 'pickFromDeck', source: "Erika's Maids", filter: 'ownerPokemon', name: 'Erika', reveal: true, optional: true, count: 2, tradeAway: ctx.choices.handUids! }),
  },

  // Erika's Perfume: look at the opponent's hand; put any number of its Basic Pokémon onto their Bench.
  'gym1-110': {
    play(ctx) {
      ctx.log("Looked at the opponent's hand.");
      ctx.pend({ kind: 'oppHandBasics', source: "Erika's Perfume" });
    },
  },

  // Good Manners: only with no Basic Pokémon cards in the hand; show it, then take a Basic Pokémon from the deck.
  'gym1-111': {
    blocked: (s) => (basicsInHand(s).length ? "You can't play it with Basic Pokémon cards in your hand" : s.deckCount > 0 ? null : 'Your deck is empty'),
    play(ctx) {
      ctx.log(`Showed the hand: ${names(ctx, ctx.me.hand) || 'no cards'}.`);
      ctx.pend({ kind: 'pickFromDeck', source: 'Good Manners', filter: 'basic', reveal: true });
    },
  },

  // Lt. Surge's Treaty: the opponent chooses: each player takes 1 of their Prizes, or you draw a card.
  'gym1-112': {
    play(ctx) {
      ctx.state.pendingChoice = { player: ctx.opp.id, source: "Lt. Surge's Treaty", kind: 'treaty' };
    },
  },

  // Minion of Team Rocket: flip 2 coins; both heads returns 1 of the opponent's benched Pokémon and its cards to their hand; otherwise the turn ends.
  'gym1-113': {
    choices(s) {
      const options = s.opp.bench.flatMap((p, i) => (p ? [i] : []));
      return options.length ? [{ kind: 'pokemon', field: 'oppTarget', side: 'opp', options, prompt: "Choose one of your opponent's benched Pokémon (both heads: it returns to their hand)" }] : [];
    },
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].every(Boolean);
      if (!heads) return ctx.endTurn();
      const slot = ctx.choices.oppTarget;
      const p = typeof slot === 'number' ? ctx.opp.bench[slot] : null;
      if (!p) return;
      ctx.opp.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card));
      ctx.opp.bench[slot as number] = null;
      ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it returned to the hand.`, ctx.opp.id);
    },
  },

  // Misty's Wrath: look at the top 7 cards of the deck, put 2 into the hand and discard the rest.
  'gym1-114': {
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play(ctx) {
      const looked = ctx.me.deck.slice(0, 7).map((c) => c.uid);
      ctx.pend({ kind: 'pickFromTop', source: "Misty's Wrath", looked, take: Math.min(2, looked.length) });
    },
  },

  // Pewter City Gym: no Resistance for attacks by Pokémon with Brock in their names (attacks.ts).
  'gym1-115': { stadium: true },

  // Recall: this turn, the Active Pokémon can also use the attacks of the cards it evolved from (usableAttacks).
  'gym1-116': {
    blocked: (s) => (s.me.active?.evolvedFrom.length ? null : 'Your Active Pokémon has no Basic Pokémon or Evolution card under it'),
    play(ctx) {
      ctx.me.recallTurn = ctx.turn;
      ctx.log(`${pokemonName(ctx.state, ctx.me.active!)} can use the attacks of the cards it evolved from this turn.`);
    },
  },

  // Sabrina's ESP: attach to a Pokémon with Sabrina in its name until the end of the turn; its attack's coins can be
  // re-flipped once (the engine asks after the attack).
  'gym1-117': {
    blocked: (s) => (sabrinas(s).length ? null : 'You have no Pokémon with Sabrina in its name'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: sabrinas(s), prompt: "Choose a Pokémon with Sabrina in its name to attach Sabrina's ESP to" }],
    play(ctx) {
      const p = (ctx.choices.target === 'active' ? ctx.me.active : ctx.me.bench[ctx.choices.target!])!;
      ctx.attachTo(p, ctx.turn);
      ctx.log(`Attached Sabrina's ESP to ${pokemonName(ctx.state, p)}.`);
    },
  },

  // Secret Mission: look at the opponent's hand, then discard any number of cards from your hand and draw as many.
  'gym1-118': {
    play(ctx) {
      ctx.log("Looked at the opponent's hand.");
      ctx.pend({ kind: 'secretMission', source: 'Secret Mission' });
    },
  },

  // Tickling Machine: flip; heads sets the opponent's hand aside until the end of their next turn; tails ends your turn.
  'gym1-119': {
    play(ctx) {
      if (!ctx.flip()) return ctx.endTurn();
      const cards = ctx.opp.hand.splice(0);
      ctx.opp.setAside = { cards: [...(ctx.opp.setAside?.cards ?? []), ...cards], until: ctx.turn + 1 };
      ctx.log(`Set aside ${cards.length} card${cards.length === 1 ? '' : 's'} from the hand until the end of the next turn.`, ctx.opp.id);
    },
  },

  // Vermilion City Gym: an attack by a Pokémon with Lt. Surge in its name may flip (the attack's `vermilion` question; the CPU always does).
  'gym1-120': { stadium: true },

  // Blaine's Gamble: discard any number of other cards from the hand, then flip; heads draws twice that many.
  'gym1-121': {
    blocked: (s) => (otherHandCards(s).length ? null : 'You have no other cards in your hand to discard'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: otherHandCards(s).length, options: otherHandCards(s), prompt: 'Choose any number of cards from your hand to discard' }],
    play(ctx) {
      const n = discardFromHand(ctx);
      if (ctx.flip()) ctx.draw(ctx.me, 2 * n);
      else ctx.log("Blaine's Gamble drew nothing.");
    },
  },

  // Energy Flow: return any number of Energy cards attached to your Pokémon to your hand.
  'gym1-122': {
    blocked: (s) => (attachedEnergy(s).length ? null : 'None of your Pokémon have Energy cards attached'),
    choices: (s) => [{ kind: 'cards', field: 'energyUids', min: 1, max: attachedEnergy(s).length, options: attachedEnergy(s), prompt: 'Choose the Energy cards to return to your hand' }],
    play(ctx) {
      const uids = ctx.choices.energyUids!;
      for (const p of [ctx.me.active, ...ctx.me.bench]) {
        if (!p) continue;
        const back = p.energy.filter((e) => uids.includes(e.uid));
        if (!back.length) continue;
        p.energy = p.energy.filter((e) => !back.includes(e));
        ctx.me.hand.push(...back);
        ctx.log(`Returned ${names(ctx, back)} from ${pokemonName(ctx.state, p)} to the hand.`);
      }
    },
  },

  // Misty's Duel: the winner (a coin flip: heads, you) shuffles their hand into their deck and draws 5.
  'gym1-123': {
    play(ctx) {
      const winner = ctx.flip() ? ctx.me : ctx.opp;
      ctx.log('Won the duel.', winner.id);
      newHand(ctx, winner, 5);
    },
  },

  // Narrow Gym: no more than 4 benched Pokémon (openBenchSlot). When it's played, a player with 5 returns 1 to their hand,
  // the opponent first.
  'gym1-124': {
    stadium: true,
    play(ctx) {
      const crowded = [ctx.opp, ctx.me].filter((p) => p.bench.filter(Boolean).length > 4);
      const [first, ...rest] = crowded.map((p) => ({ player: p.id, source: 'Narrow Gym', kind: 'narrowGym' as const }));
      if (!first) return;
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },

  // Sabrina's Gaze: each player shuffles their hand into their deck and draws as many cards.
  'gym1-125': {
    play(ctx) {
      for (const player of [ctx.me, ctx.opp]) newHand(ctx, player, player.hand.length);
    },
  },

  // Trash Exchange: shuffle the discard pile into the deck, then discard that many cards from the top.
  'gym1-126': {
    blocked: (s) => (s.me.discard.length ? null : 'Your discard pile is empty'),
    play(ctx) {
      const pile = ctx.me.discard.splice(0);
      ctx.shuffleIntoDeck(ctx.me, pile);
      const top = ctx.me.deck.splice(0, pile.length);
      ctx.me.discard.push(...top);
      ctx.log(`Shuffled ${pile.length} cards from the discard pile into the deck, then discarded the top ${top.length}.`);
    },
  },
};

/** Energy cards attached to the player's Pokémon (Energy Flow; not a Buzzap'd Electrode). */
function attachedEnergy(s: TrainerSituation): CardInstance[] {
  return [s.me.active, ...s.me.bench].flatMap((p) => (p ? p.energy.filter((e) => !e.provides && lookupCard(s.cards, e.defId).kind === 'energy') : []));
}

/** Pokémon cards in the hand with a known length (Blaine's Quiz #1). */
const quizCards = (s: TrainerSituation) =>
  otherHandCards(s).filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return isPokemonCard(d) && !!d.length;
  });

/** A printed length (`6' 3"`) in inches, and back. */
const toInches = (length: string) => {
  const [feet = 0, inches = 0] = length.match(/\d+/g)!.map(Number);
  return feet * 12 + inches;
};
const fromInches = (n: number) => `${Math.floor(n / 12)}' ${n % 12}"`;

/** The player's Pokémon with Sabrina in their names (Sabrina's ESP). */
const sabrinas = (s: TrainerSituation) => targetsOf(s.me).filter((t) => lookupCard(s.cards, (t === 'active' ? s.me.active : s.me.bench[t])!.card.defId).name.includes('Sabrina'));
