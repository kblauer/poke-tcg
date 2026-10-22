// EX Dragon (ex3) Trainer cards, by card id. Mr. Briney's Compassion and TV Reporter are Supporters; High Pressure System and
// Low Pressure System are Stadiums; Balloon Berry and Buffer Piece are Pokémon Tools.
// Agreed with the user: Mr. Briney's Compassion can return the Active Pokémon (a Benched one then becomes the Active Pokémon).
// From the text: Balloon Berry's rule lives in retreatCost and RETREAT (engine.ts); Buffer Piece takes 20 off the opponent's
// attacks (attacks.ts) and is discarded at the end of the opponent's turn after it was played; High Pressure System takes 1
// off the Retreat Cost of Fire and Water Pokémon (Kecleon too, while it's one of those types); Low Pressure System gives Grass
// and Lightning Pokémon 10 more HP (refreshHideout, inPlayDef); Energy Recycle System is either 1 basic Energy card into the
// hand or 3 into the deck, the player's pick.
import { hasType, isBasicEnergy, lookupCard } from '../cards.js';
import { activeLock } from '../engine.js';
import { pokemonName } from '../status.js';
import { def, own, targetsOf, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { tool } from './neo1-trainers.js';

/** Basic Energy cards in the player's discard pile. */
const basicsIn = (s: Pick<TrainerSituation, 'me' | 'cards'>) => s.me.discard.filter((c) => isBasicEnergy(lookupCard(s.cards, c.defId)));

/** Mr. Briney's Compassion: the player's Pokémon it can return (not a Pokémon-ex; the Active Pokémon only with a Benched one to take its place). */
const brineyTargets = (s: TrainerSituation) =>
  targetsOf(s.me).filter((t) => {
    const p = own(s, t)!;
    if (def(s, p.card).kind === 'pokemon' && (def(s, p.card) as { ex?: boolean }).ex) return false;
    return t !== 'active' || (s.me.bench.some(Boolean) && !activeLock(s.me, [s.me, s.opp], s.cards));
  });

export const EX3_TRAINERS: Record<string, TrainerEffect> = {
  // Balloon Berry: retreating, it's discarded instead of Energy cards.
  'ex3-82': tool('Balloon Berry'),

  // Buffer Piece: 20 less from the opponent's attacks, until the end of their next turn.
  'ex3-83': {
    ...tool('Buffer Piece'),
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      ctx.attachTo(p, ctx.turn + 1, { tool: true });
      ctx.log(`Attached Buffer Piece to ${pokemonName(ctx.state, p)}.`);
    },
  },

  // Energy Recycle System: 1 basic Energy card from the discard pile into the hand, or 3 shuffled into the deck (shown).
  'ex3-84': {
    discardToHand: true,
    blocked: (s) => (basicsIn(s).length ? null : 'No basic Energy cards in your discard pile'),
    choices(s, c) {
      const count = basicsIn(s).length;
      const options = count >= 3 ? [0, 1] : [0];
      const specs: ReturnType<NonNullable<TrainerEffect['choices']>> = [{ kind: 'pick', field: 'pick', options, labels: ['1 into your hand', '3 into your deck'], prompt: 'Put 1 basic Energy card into your hand, or shuffle 3 into your deck?' }];
      if (c.pick !== undefined) {
        const n = c.pick === 1 ? 3 : 1;
        specs.push({ kind: 'cards', field: 'discardUids', min: n, max: n, options: basicsIn(s), prompt: `Choose ${n === 1 ? 'a basic Energy card' : '3 basic Energy cards'} from your discard pile` });
      }
      return specs;
    },
    play(ctx) {
      const cards = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !cards.includes(c));
      const names = cards.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ');
      if (ctx.choices.pick === 1) {
        ctx.shuffleIntoDeck(ctx.me, cards);
        ctx.log(`Shuffled ${names} into the deck.`);
      } else {
        ctx.me.hand.push(...cards);
        ctx.log(`Put ${names} into the hand.`);
      }
    },
  },

  // High Pressure System: Fire and Water Pokémon retreat for 1 less.
  'ex3-85': { stadium: true, retreatModifier: (pokemon) => (hasType(pokemon, 'fire') || hasType(pokemon, 'water') ? -1 : 0) },

  // Low Pressure System: Grass and Lightning Pokémon have 10 more HP (refreshHideout).
  'ex3-86': { stadium: true },

  // Mr. Briney's Compassion (Supporter): one of the player's Pokémon (not a Pokémon-ex) and every card attached back to the hand.
  'ex3-87': {
    supporter: true,
    blocked: (s) => (brineyTargets(s).length ? null : 'No Pokémon you can return'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: brineyTargets(s), prompt: 'Choose a Pokémon to return to your hand with every card attached' }],
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, converted: _c, windless: _w, colorlessOnly: _o, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
      if (t === 'active') ctx.me.active = null;
      else ctx.me.bench[t] = null;
      ctx.log(`Returned ${pokemonName(ctx.state, p)} and every card attached to it to the hand.`);
    },
  },

  // TV Reporter (Supporter): draw 3 cards, then discard 1 from the hand.
  'ex3-88': {
    supporter: true,
    play(ctx) {
      ctx.draw(ctx.me, 3);
      if (ctx.me.hand.length) ctx.pend({ kind: 'discardFromHand', source: 'TV Reporter', count: 1 });
    },
  },
};
