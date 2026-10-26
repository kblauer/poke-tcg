// Stormfront (dp7) Trainer cards and Special Energy, by card id. Marley's Request is a Supporter; Conductive Quarry is a Stadium;
// Energy Link is a Pokémon Tool used from its Pokémon (USE_TOOL). The Poké + cards ask whether a second copy from the hand is
// played with them (it's discarded too) when there is one.
// From the text: Marley's Request picks 2 cards of different names (1 when every Trainer card in the discard pile has the same
// name), then the opponent picks the one that goes into the hand (marley); Poké Healer + removes the Special Condition picked
// when there are several.
import { isTrainerCard, lookupCard } from '../cards.js';
import { activeLocked } from '../engine.js';
import { discardsLocked } from '../powers.js';
import { clearSpecialConditions, hasSpecialCondition, openBenchSlot, pokemonName } from '../status.js';
import { energyLinked, swapActive, targetsOf, type EnergyEffect, type TrainerContext, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { DP4_TRAINERS } from './dp4-trainers.js';
import { ECARD2_TRAINERS } from './ecard2-trainers.js';
import { EX1_TRAINERS } from './ex1-trainers.js';
import { EX10_ENERGY } from './ex10-trainers.js';
import { tool } from './neo1-trainers.js';

/** Another copy of this card in the hand (the Poké + cards). */
const twin = (s: Pick<TrainerSituation, 'me' | 'card' | 'cards'>) => s.me.hand.find((c) => c.uid !== s.card.uid && lookupCard(s.cards, c.defId).name === lookupCard(s.cards, s.card.defId).name);
/** "You may play 2 … at the same time": the question, asked when there's a second copy. */
const howMany = (s: TrainerSituation, name: string) =>
  twin(s) ? [{ kind: 'pick' as const, field: 'pick' as const, options: [0, 1], labels: [`Play 1 ${name}`, `Play 2 ${name}`], prompt: `${name}: play 1, or 2 at the same time?` }] : [];
/** Playing 2: the second copy goes to the discard pile with the first. Returns whether 2 were played. */
function playedTwo(ctx: TrainerContext) {
  if (ctx.choices.pick !== 1) return false;
  const second = twin({ me: ctx.me, card: ctx.card, cards: ctx.state.cards });
  if (!second) return false;
  ctx.me.hand = ctx.me.hand.filter((c) => c !== second);
  ctx.me.discard.push(second);
  ctx.log('Played 2 at the same time.');
  return true;
}
/** Trainer cards in the player's discard pile but this one (Marley's Request). */
const trainersIn = (s: TrainerSituation) => s.me.discard.filter((c) => c.uid !== s.card.uid && isTrainerCard(lookupCard(s.cards, c.defId)));

export const DP7_TRAINERS: Record<string, TrainerEffect> = {
  // Conductive Quarry: once a turn for each player, heads: a Lightning or Metal Energy card from the discard pile, shown.
  'dp7-82': {
    stadium: true,
    useStadium({ state, me, flip }) {
      if (!flip()) return;
      if (!me.discard.some((c) => lookupCard(state.cards, c.defId).kind === 'energy')) return;
      state.pendingChoice = { player: me.id, source: 'Conductive Quarry', kind: 'discardToHand', count: 1, filter: 'lightningOrMetal', reveal: true };
    },
  },
  // Energy Link: a Pokémon Tool; its Pokémon's Energy cards move to another of the player's Pokémon with Energy Link, any number of times.
  'dp7-83': {
    ...tool('Energy Link'),
    useTool: {
      blocked: (state, me, pokemon) => (!pokemon.energy.some((e) => !e.provides) ? `${pokemonName(state, pokemon)} has no Energy cards attached` : energyLinked(state, me).length < 2 ? 'You have no other Pokémon with Energy Link attached' : null),
      run(state, me, target) {
        const others = energyLinked(state, me).filter((t) => t !== target);
        state.pendingChoice = others.length === 1 ? { player: me.id, source: 'Energy Link', kind: 'shiftEnergy', from: target, to: others[0]!, any: true } : { player: me.id, source: 'Energy Link', kind: 'energyLink', from: target };
      },
    },
  },
  // Energy Switch: as Aquapolis's. Premier Ball: as Great Encounters'. Potion, Switch: as EX Ruby & Sapphire's.
  'dp7-84': ECARD2_TRAINERS['ecard2-120']!,
  'dp7-91': DP4_TRAINERS['dp4-101']!,
  'dp7-92': EX1_TRAINERS['ex1-91']!,
  'dp7-93': EX1_TRAINERS['ex1-92']!,
  // Great Ball: a Basic Pokémon from the deck onto the Bench.
  'dp7-85': {
    blocked: (s) => (!s.deckCount ? 'Your deck is empty' : openBenchSlot(s.me, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Great Ball', filter: 'basic', toBench: true, optional: true }),
  },
  // Luxury Ball: a Pokémon (not a Pokémon LV.X) from the deck, shown; not with a Luxury Ball in the discard pile.
  'dp7-86': {
    blocked: (s) => (s.me.discard.some((c) => lookupCard(s.cards, c.defId).name === 'Luxury Ball') ? "You can't play Luxury Ball with a Luxury Ball in your discard pile" : s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Luxury Ball', filter: 'notLevelUp', reveal: true, optional: true }),
  },
  // Marley's Request (Supporter): 2 Trainer cards of different names from the discard pile; the opponent picks the one that goes into the hand.
  "dp7-87": {
    supporter: true,
    blocked: (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : trainersIn(s).length ? null : 'There are no Trainer cards in your discard pile'),
    choices(s) {
      const names = new Set(trainersIn(s).map((c) => lookupCard(s.cards, c.defId).name));
      const n = names.size > 1 ? 2 : 1;
      return [{ kind: 'cards', field: 'discardUids', min: n, max: n, options: trainersIn(s), prompt: `Marley's Request: choose ${n === 2 ? '2 Trainer cards with different names' : 'a Trainer card'} from your discard pile` }];
    },
    play(ctx) {
      const picked = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid));
      const [a, b] = picked;
      if (!a) return;
      if (!b || lookupCard(ctx.state.cards, a.defId).name === lookupCard(ctx.state.cards, b.defId).name) {
        ctx.me.discard = ctx.me.discard.filter((c) => c !== a);
        ctx.me.hand.push(a);
        return ctx.log(`Put ${lookupCard(ctx.state.cards, a.defId).name} into the hand.`);
      }
      ctx.log(`Showed ${lookupCard(ctx.state.cards, a.defId).name} and ${lookupCard(ctx.state.cards, b.defId).name}.`);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: "Marley's Request", kind: 'marley', uids: [a.uid, b.uid] };
    },
  },
  // Poké Blower +: 1, heads puts a damage counter on one of the opponent's Pokémon; 2, one of their Benched Pokémon switched in.
  'dp7-88': {
    choices(s, c) {
      const ask = howMany(s, 'Poké Blower +');
      if (ask.length && c.pick === undefined) return ask;
      const two = c.pick === 1;
      const options = two ? targetsOf(s.opp).filter((t) => t !== 'active') : targetsOf(s.opp);
      return [...ask, { kind: 'pokemon', field: 'oppTarget', side: 'opp', options, prompt: two ? "Choose one of your opponent's Benched Pokémon to switch in" : "Choose one of your opponent's Pokémon for a damage counter (if heads)" }];
    },
    play(ctx) {
      const t = ctx.choices.oppTarget;
      if (playedTwo(ctx)) {
        const locked = activeLocked(ctx.state, ctx.opp.id);
        if (locked) return ctx.log(locked);
        if (typeof t === 'number' && ctx.opp.bench[t]) swapActive(ctx.state, ctx.opp, t);
        return;
      }
      const p = t === undefined ? null : t === 'active' ? ctx.opp.active : ctx.opp.bench[t];
      if (!p || !ctx.flip()) return ctx.log('Poké Blower + did nothing.');
      p.damage += 10;
      ctx.log(`Put a damage counter on ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Poké Drawer +: 1 draws a card; 2 find any 2 cards in the deck.
  'dp7-89': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    choices: (s) => howMany(s, 'Poké Drawer +'),
    play(ctx) {
      if (playedTwo(ctx)) return ctx.pend({ kind: 'pickFromDeck', source: 'Poké Drawer +', filter: 'any', count: 2, optional: true });
      ctx.draw(ctx.me, 1);
    },
  },
  // Poké Healer +: 1, a damage counter and a Special Condition off the Active Pokémon; 2, 8 damage counters and every Special Condition.
  'dp7-90': {
    blocked: (s) => (s.me.active && (s.me.active.damage || hasSpecialCondition(s.me.active)) ? null : 'Your Active Pokémon has no damage counters or Special Conditions'),
    choices: (s) => howMany(s, 'Poké Healer +'),
    play(ctx) {
      const p = ctx.me.active;
      if (!p) return;
      if (playedTwo(ctx)) {
        p.damage = Math.max(0, p.damage - 80);
        clearSpecialConditions(p);
        return ctx.log(`Healed ${pokemonName(ctx.state, p)} and removed its Special Conditions.`);
      }
      p.damage = Math.max(0, p.damage - 10);
      ctx.log(`Removed a damage counter from ${pokemonName(ctx.state, p)}.`);
      if (hasSpecialCondition(p)) ctx.pend({ kind: 'removeCondition', source: 'Poké Healer +', target: 'active' });
    },
  },
};

export const DP7_ENERGY: Record<string, EnergyEffect> = {
  // Cyclone Energy, Warp Energy: as EX Unseen Forces'.
  'dp7-94': EX10_ENERGY['ex10-99']!,
  'dp7-95': EX10_ENERGY['ex10-100']!,
};
