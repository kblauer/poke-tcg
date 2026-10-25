// Diamond & Pearl (dp1) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// The Baby Evolution powers play as the EX sets' (agreed: usable on the first turn and the turn the baby was played).
// From the text: Sharp Eye and Earth Fissure are asked as Luxray and Rhyperior evolve from the hand; Sharp Eye's Basic
// Pokémon must be put down once the hand is looked at, if the Bench has room; Supreme Command takes 2 cards (1 from a hand
// of 1) at random and gives them back at the end of the opponent's next turn; Bounce can return the Unown B using it;
// Unown D's draw asks each player, its own player first.
import { lookupCard } from '../cards.js';
import { activeLocked, isEnergyCardOf, type CardInstance } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { nextRandom } from '../rng.js';
import { devolvable, evolvedFromName, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { onlyBenched, targetOf } from './common.js';
import { shuffleIntoDeck } from './dp1.js';
import { babyEvolution, POKE_BODY } from './ex2-powers.js';

/** "When you play this from your hand to evolve 1 of your Pokémon, you may …": a yes-or-no question as it evolves. */
const onEvolveMay = (power: 'earthFissure' | 'sharpEye', source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length) state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});

/** Lightning Energy cards attached to the player's Pokémon other than the source (Intense Voltage). */
const lightningOn = (s: PowerSituation, t: ReturnType<typeof ownTargets>[number]) => (t === s.source ? [] : (pokemonAt(s.me, t)?.energy ?? []).filter((e) => !e.provides && isEnergyCardOf(e, s.cards, 'lightning')));

/** The player's Pokémon with Unown in their names (Bounce). */
const unowns = (s: PowerSituation) => ownTargets(s.me).filter((t) => inPlayDef(s.cards, pokemonAt(s.me, t)!).name.includes('Unown'));

export const DP1_POWERS: Record<string, PowerEffect> = {
  // Dusknoir – Dark Palm: with 4 or more Benched Pokémon, the opponent's one picked and its cards shuffled into their deck.
  'dp1-2': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.filter(Boolean).length >= 4 ? null : 'Your opponent has fewer than 4 Benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppFrom', options: s.opp.bench.flatMap((p, i) => (p ? [i] : [])), prompt: "Choose one of your opponent's Benched Pokémon to shuffle into their deck" }],
    use(ctx) {
      const p = typeof ctx.choices.oppFrom === 'number' ? ctx.opp.bench[ctx.choices.oppFrom] : null;
      if (p) shuffleIntoDeck(ctx, ctx.opp, p);
    },
  },
  // Electivire – Intense Voltage: any number of times, with Elekid under it, a Lightning Energy card from another of the player's Pokémon to Electivire.
  'dp1-3': {
    blocked(s) {
      const source = pokemonAt(s.me, s.source);
      if (!source || !evolvedFromName(s.cards, source, 'Elekid')) return 'Elekid isn\'t under Electivire';
      return ownTargets(s.me).some((t) => lightningOn(s, t).length) ? null : 'None of your other Pokémon have Lightning Energy attached';
    },
    choices: (s, c) => [
      { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => lightningOn(s, t).length), prompt: 'Choose one of your Pokémon to move a Lightning Energy card from' },
      ...(c.from !== undefined ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: lightningOn(s, c.from), prompt: 'Choose the Lightning Energy card to move to Electivire' }] : []),
    ],
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !card || from === ctx.source) return;
      from.energy = from.energy.filter((e) => e !== card);
      ctx.source.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to Electivire.`);
    },
  },
  // Luxray – Sharp Eye; Rhyperior – Earth Fissure: asked as they evolve from the hand.
  'dp1-7': onEvolveMay('sharpEye', 'Sharp Eye'),
  'dp1-12': onEvolveMay('earthFissure', 'Earth Fissure'),
  // Magnezone – Magnetize: the player's Active Pokémon with Metal Energy attached has no Retreat Cost (retreatBodies).
  'dp1-8': { ...POKE_BODY, magnetize: true },
  // Shiftry – Darkness Fan: heads, one of the opponent's Benched Evolved Pokémon loses its top card, into their hand.
  'dp1-14': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.some((p) => p && devolvable(s.cards, p)) ? null : 'Your opponent has no Benched Evolved Pokémon'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Darkness Fan did nothing.');
      ctx.pend({ kind: 'oppBenchPick', source: 'Darkness Fan', purpose: 'devolve' });
    },
  },
  // Baby Evolution: Munchlax, Wynaut, Budew, Elekid, Mantyke, Azurill, Bonsly, Cleffa, Mime Jr.
  'dp1-33': babyEvolution('Snorlax'),
  'dp1-42': babyEvolution('Wobbuffet'),
  'dp1-43': babyEvolution('Roselia'),
  'dp1-48': babyEvolution('Electabuzz'),
  'dp1-55': babyEvolution('Mantine'),
  'dp1-69': babyEvolution('Marill'),
  'dp1-71': babyEvolution('Sudowoodo'),
  'dp1-78': babyEvolution('Clefairy'),
  'dp1-90': babyEvolution('Mr. Mime'),
  // Unown A – Analyze: on the Bench, the top 2 cards put back in any order.
  'dp1-65': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown A') ?? (s.counts.deck > 1 ? null : 'Your deck has fewer than 2 cards'),
    use: (ctx) => ctx.pend({ kind: 'arrangeTop', source: 'Analyze', count: Math.min(2, ctx.me.deck.length) }),
  },
  // Unown B – Bounce: on the Bench, heads: one of the player's Unown has its cards discarded and is shuffled into the deck.
  'dp1-66': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown B'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'from', options: unowns(s), prompt: 'Choose one of your Unown to shuffle into your deck (if heads)' }],
    use(ctx) {
      const p = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      if (!ctx.flip()) return ctx.log('Bounce did nothing.');
      if (!p) return;
      ctx.me.discard.push(...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card));
      p.energy = [];
      p.attached = [];
      shuffleIntoDeck(ctx, ctx.me, p);
    },
  },
  // Unown C – Call: on the Bench, heads: any Unown from the deck onto the Bench.
  'dp1-67': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown C') ?? (s.me.bench.some((p) => !p) ? null : 'Your Bench is full'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Call did nothing.');
      if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Call', filter: 'ownerBasic', name: 'Unown', toBench: true, optional: true });
    },
  },
  // Unown D – Draw: on the Bench, heads: each player may draw a card, its player first.
  'dp1-68': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown D'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Draw did nothing.');
      ctx.pend({ kind: 'drawCount', source: 'Draw', max: 1, alsoOpponent: true });
    },
  },
  // Empoleon LV.X – Supreme Command: up to 2 cards from the opponent's hand, at random, set aside until the end of their next turn.
  'dp1-120': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.oppHand ? null : "Your opponent's hand is empty"),
    use(ctx) {
      const taken: CardInstance[] = [];
      while (taken.length < 2 && ctx.opp.hand.length) {
        const [r, next] = nextRandom(ctx.state.rngState);
        ctx.state.rngState = next;
        taken.push(...ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1));
      }
      ctx.opp.setAside = { cards: [...(ctx.opp.setAside?.cards ?? []), ...taken], until: ctx.state.turn + 1 };
      ctx.log(`Set ${taken.length} card${taken.length === 1 ? '' : 's'} from the opponent's hand face down beside the Defending Pokémon until the end of their next turn.`);
    },
  },
  // Infernape LV.X – Burning Head: one of the top 3 cards into the hand, the other 2 discarded.
  'dp1-121': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromTop', source: 'Burning Head', looked: ctx.me.deck.slice(0, 3).map((c) => c.uid), take: 1 }),
  },
  // Torterra LV.X – Forest Murmurs: with more Prize cards left than the opponent, one of their Benched Pokémon switched in.
  'dp1-122': {
    oncePerTurn: true,
    blocked(s) {
      if (s.counts.prizes <= s.counts.oppPrizes) return "You don't have more Prize cards left than your opponent";
      return s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon';
    },
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: s.opp.bench.flatMap((p, i) => (p ? [i] : [])), prompt: "Choose one of your opponent's Benched Pokémon to switch in" }],
    use(ctx) {
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      if (typeof ctx.choices.oppTo === 'number') swapActive(ctx.state, ctx.opp, ctx.choices.oppTo);
    },
  },
};

