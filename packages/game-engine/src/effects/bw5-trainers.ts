// Dark Explorers (bw5) Trainer cards, by card id. Hooligans Jim & Cas is a Supporter, Twist Mountain a Stadium, Dark Claw a
// Pokémon Tool (read in attacks.ts); the rest are Items. Old Amber Aerodactyl is a Fossil Item, done with the Black & White
// series' shared rules (README: Generation 5), the only way its Restored Aerodactyl comes into play.
// From the text: Dark Claw's 20 more is for a Darkness Pokémon's attacks to the Active Pokémon, before Weakness and
// Resistance; Dark Patch's Energy goes onto a Benched Pokémon only; Enhanced Hammer takes a Special Energy card, its player's
// pick; Random Receiver with no Supporter card in the deck just shuffles it; Rare Candy takes only a Stage 2 card, onto the
// Basic Pokémon at the bottom of its line (as EX Sandstorm's: not a Restored Pokémon), not on its player's first turn nor
// onto a Pokémon put into play this turn; Twist Mountain's player must put a Restored Pokémon onto the Bench on heads (it
// can't be used without one in the hand, or a full Bench); Ultra Ball's search may find nothing.
import { hasType, isBasicEnergy, isBenchable, lookupCard } from '../cards.js';
import { discardTheirEnergy, isSpecialEnergy, type CardInstance, type Target } from '../engine.js';
import { energyKept, evolutionBlocked, offerChainReaction, playedFromHand, pokemonAt, primalBlock } from '../powers.js';
import { shuffle } from '../rng.js';
import { energyProtected, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { def, evolveWith, otherHandCards, own, targetsOf, theirs, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { randomHandToDeck } from './bw5.js';
import { fossilItem } from './bw3-trainers.js';
import { energyCardOf } from './ex2.js';
import { trainerEffect } from './index.js';
import { tool } from './neo1-trainers.js';

/** Basic Darkness Energy cards in the player's discard pile (Dark Patch). */
const darkInDiscard = (s: TrainerSituation) => s.me.discard.filter((c) => isBasicEnergy(def(s, c)) && energyCardOf(s.cards, c, 'darkness'));
/** The player's Benched Darkness Pokémon (Dark Patch). */
const darkBench = (s: TrainerSituation) => targetsOf(s.me).filter((t) => t !== 'active' && hasType(inPlayDef(s.cards, own(s, t)!), 'darkness'));

/** The Special Energy cards on one of the opponent's Pokémon an Item can discard: not while Brock's Protection or Unown K's Keep holds them. */
const hammerable = (s: TrainerSituation, t: Target) => {
  const p = theirs(s, t)!;
  if (energyProtected(s.cards, p) || energyKept(s.opp, [s.opp, s.me], s.cards, p)) return [];
  return p.energy.filter((e) => isSpecialEnergy(s.cards, e));
};

/** Where Rare Candy can put `card`: a Stage 2 card onto one of the player's Basic Pokémon at the bottom of its line, not put into play this turn. */
function candyTargets(s: TrainerSituation, card: CardInstance): Target[] {
  const d = def(s, card);
  if (d.kind !== 'pokemon' || d.stage !== 'stage2' || d.trainerText) return [];
  return targetsOf(s.me).filter((t) => {
    const p = own(s, t)!;
    const current = def(s, p.card);
    if (p.evolvedFrom.length || !isBenchable(current) || p.playedTurn === s.turn || p.effects?.noEvolve !== undefined || primalBlock(p, [s.me, s.opp], s.cards)) return false;
    return d.evolvesFromBasic === current.name;
  });
}

/** The Restored Pokémon cards in a hand (Twist Mountain). */
const restoredIn = (cards: TrainerSituation['cards'], hand: CardInstance[]) => hand.filter((c) => {
  const d = lookupCard(cards, c.defId);
  return d.kind === 'pokemon' && !!d.restored;
});

export const BW5_TRAINERS: Record<string, TrainerEffect> = {
  // Dark Claw: a Darkness Pokémon's attacks do 20 more to the Active Pokémon, before Weakness and Resistance (attacks.ts).
  'bw5-92': tool('Dark Claw'),
  // Dark Patch: a basic Darkness Energy card from the discard pile onto 1 of the player's Benched Darkness Pokémon.
  'bw5-93': {
    blocked: (s) => (!darkInDiscard(s).length ? 'No basic Darkness Energy in your discard pile' : darkBench(s).length ? null : 'You have no Benched Darkness Pokémon'),
    choices: (s) => [
      { kind: 'cards', field: 'discardUids', min: 1, max: 1, options: darkInDiscard(s), prompt: 'Choose a basic Darkness Energy card from your discard pile' },
      { kind: 'pokemon', field: 'target', side: 'own', options: darkBench(s), prompt: 'Attach it to one of your Benched Darkness Pokémon' },
    ],
    play(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.discardUids![0])!;
      const p = pokemonAt(ctx.me, ctx.choices.target!)!;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      p.energy.push(card);
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} from the discard pile to ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Enhanced Hammer: a Special Energy card attached to 1 of the opponent's Pokémon discarded.
  'bw5-94': {
    blocked: (s) => (targetsOf(s.opp).some((t) => hammerable(s, t).length) ? null : "None of your opponent's Pokémon have Special Energy attached"),
    choices(s, c) {
      const options = targetsOf(s.opp).filter((t) => hammerable(s, t).length);
      const specs: ReturnType<NonNullable<TrainerEffect['choices']>> = [{ kind: 'pokemon', field: 'oppTarget', side: 'opp', options, prompt: "Choose one of your opponent's Pokémon with Special Energy attached" }];
      if (c.oppTarget === undefined || !options.includes(c.oppTarget)) return specs;
      return [...specs, { kind: 'cards', field: 'oppEnergyUids', min: 1, max: 1, options: hammerable(s, c.oppTarget), prompt: 'Choose a Special Energy card to discard' }];
    },
    play(ctx) {
      const p = pokemonAt(ctx.opp, ctx.choices.oppTarget!)!;
      const gone = p.energy.filter((e) => ctx.choices.oppEnergyUids!.includes(e.uid));
      p.energy = p.energy.filter((e) => !gone.includes(e));
      discardTheirEnergy(ctx.state, ctx.opp, gone);
      ctx.log(`Discarded ${gone.map((e) => lookupCard(ctx.state.cards, e.defId).name).join(', ')} from ${pokemonName(ctx.state, p)}.`, ctx.opp.id);
    },
  },
  // Hooligans Jim & Cas (Supporter): heads, 3 random cards from the opponent's hand, revealed, shuffled into their deck.
  'bw5-95': {
    supporter: true,
    play(ctx) {
      if (ctx.flip()) randomHandToDeck(ctx.state, ctx.opp, 3, (text) => ctx.log(text, ctx.opp.id));
    },
  },
  // Old Amber Aerodactyl: as Noble Victories' Fossils, Aerodactyl.
  'bw5-97': fossilItem('Old Amber Aerodactyl', 'Aerodactyl'),
  // Random Receiver: cards from the top until a Supporter card, which goes into the hand; the rest shuffled back.
  'bw5-99': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play(ctx) {
      const i = ctx.me.deck.findIndex((c) => def(ctx.state, c).kind === 'trainer' && !!trainerEffect(c.defId)?.supporter);
      if (i < 0) ctx.log(`Revealed the whole deck (${ctx.me.deck.length} cards): no Supporter card.`);
      else {
        const [found] = ctx.me.deck.splice(i, 1);
        ctx.me.hand.push(found!);
        ctx.log(`Revealed ${i + 1} card${i ? 's' : ''}; put ${def(ctx.state, found!).name} into the hand.`);
      }
      [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
    },
  },
  // Rare Candy: a Stage 2 card from the hand onto the Basic Pokémon it evolves from (this counts as evolving it).
  'bw5-100': {
    blocked(s) {
      if (s.turn <= 2) return "You can't use Rare Candy during your first turn";
      const blocked = evolutionBlocked([s.me, s.opp], s.cards, true);
      if (blocked) return blocked;
      return otherHandCards(s).some((c) => candyTargets(s, c).length) ? null : 'No Stage 2 card in your hand evolves from a Basic Pokémon you can evolve';
    },
    choices(s, c) {
      const cards = otherHandCards(s).filter((card) => candyTargets(s, card).length);
      const chosen = c.handUids && s.me.hand.find((card) => card.uid === c.handUids![0]);
      return [
        { kind: 'cards', field: 'handUids', min: 1, max: 1, options: cards, prompt: 'Choose a Stage 2 card from your hand' },
        ...(chosen ? [{ kind: 'pokemon' as const, field: 'target' as const, side: 'own' as const, options: candyTargets(s, chosen), prompt: 'Put it on' }] : []),
      ];
    },
    play(ctx) {
      const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      const p = pokemonAt(ctx.me, ctx.choices.target!)!;
      evolveWith(ctx.state, ctx.me, p, card!, 'with Rare Candy');
      playedFromHand(ctx.state, ctx.me, p);
      if (!ctx.state.pendingChoice) offerChainReaction(ctx.state);
    },
  },
  // Twist Mountain (Stadium): once during each player's turn, a flip; heads, a Restored Pokémon from their hand onto their Bench.
  'bw5-101': {
    stadium: true,
    stadiumBlocked: (me, cards) => (!restoredIn(cards, me.hand).length ? 'You have no Restored Pokémon in your hand' : openBenchSlot(me, cards) < 0 ? 'Your Bench is full' : null),
    useStadium({ state, me, flip }) {
      if (!flip()) return;
      const names = [...new Set(restoredIn(state.cards, me.hand).map((c) => lookupCard(state.cards, c.defId).name))];
      if (names.length && openBenchSlot(me, state.cards, state.stadium?.card) >= 0) state.pendingChoice = { player: me.id, source: 'Twist Mountain', kind: 'handToBench', names, restored: true };
    },
  },
  // Ultra Ball: 2 other cards from the hand discarded, then a Pokémon from the deck into the hand, shown.
  'bw5-102': {
    blocked: (s) => (otherHandCards(s).length < 2 ? 'You must discard 2 other cards from your hand to play Ultra Ball' : null),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 2, max: 2, options: otherHandCards(s), prompt: 'Choose 2 cards to discard from your hand' }],
    play(ctx) {
      const gone = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      ctx.me.discard.push(...gone);
      ctx.log(`Discarded ${gone.map((c) => def(ctx.state, c).name).join(', ')}.`);
      if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Ultra Ball', filter: 'pokemon', reveal: true });
    },
  },
};
