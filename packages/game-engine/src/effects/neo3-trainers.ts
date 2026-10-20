// Neo Revelation (neo3) Trainer cards, by card id. Balloon Berry is a Pokémon Tool (its rule lives in engine.ts: retreatCost
// is 0 with it, and RETREAT discards it). Healing Field and Rocket's Hideout are Stadiums (Rocket's Hideout's 20 HP:
// refreshHideout and inPlayDef).
// Rulings (agreed): Pokémon Breeder Fields' heads finds any later-Stage card of that Pokémon's line (a Basic's Stage 1 or
// Stage 2), each flip its own search, one after the other.
// Rulings (from the text): Healing Field can be used once during each player's turn while their Active Pokémon has damage
// counters. Rocket's Hideout counts "Dark" as a word in the name (Dark Gyarados, not Darkrai-like names), and a Pokémon
// whose damage then reaches its HP once the Stadium leaves is Knocked Out. Old Rod's card can't be the Old Rod being played.
import { addLog, pokemonName } from '../status.js';
import { def, targetsOf, type TrainerChoiceSpec, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { isPokemonCard, isTrainerCard, type CardLibrary } from '../cards.js';
import { tool } from './neo1-trainers.js';

/**
 * The names of the later-Stage cards of `name`'s line among the game's cards (Pokémon Breeder Fields, agreed: any later
 * stage): the cards that evolve from it, and the cards that evolve from those.
 */
function laterStages(cards: CardLibrary, name: string): string[] {
  const pokemon = Object.values(cards).filter((d) => d.kind === 'pokemon' && !d.trainerText);
  const next = pokemon.filter((d) => d.kind === 'pokemon' && d.stage !== 'basic' && d.evolvesFrom === name).map((d) => d.name);
  const after = pokemon.filter((d) => d.kind === 'pokemon' && d.stage === 'stage2' && next.includes(d.evolvesFrom ?? '')).map((d) => d.name);
  return [...new Set([...next, ...after])];
}

/** Pokémon Breeder Fields: the player's non-Baby Pokémon that can evolve (some card in the game is a later stage of it). */
const breedable = (s: TrainerSituation) =>
  targetsOf(s.me).filter((t) => {
    const d = def(s, (t === 'active' ? s.me.active : s.me.bench[t])!.card);
    return d.kind === 'pokemon' && !d.baby && laterStages(s.cards, d.name).length > 0;
  });

export const NEO3_TRAINERS: Record<string, TrainerEffect> = {
  // Balloon Berry: a Pokémon Tool; when its Pokémon retreats, it's discarded instead of Energy cards (engine.ts).
  'neo3-60': tool('Balloon Berry'),

  // Healing Field: a Stadium; once during each player's turn, they may flip a coin; heads removes 2 damage counters from their Active Pokémon (1 if it has only 1).
  'neo3-61': {
    stadium: true,
    stadiumBlocked: (me) => (me.active && me.active.damage >= 10 ? null : 'Your Active Pokémon has no damage counters'),
    useStadium({ state, me, flip }) {
      if (!flip()) return addLog(state, 'Healing Field: nothing removed.', me.id);
      const active = me.active!;
      const healed = Math.min(20, active.damage);
      active.damage -= healed;
      addLog(state, `Healing Field: ${pokemonName(state, active)} healed ${healed} damage.`, me.id);
    },
  },

  // Pokémon Breeder Fields: a flip for each of 1 or 2 of your non-Baby Pokémon that can evolve; heads takes a later-Stage card of its line from the deck.
  'neo3-62': {
    blocked: (s) => (breedable(s).length ? null : 'None of your Pokémon can evolve'),
    choices(s, c) {
      const options = breedable(s);
      const specs: TrainerChoiceSpec[] = [];
      if (options.length > 1) specs.push({ kind: 'pick', field: 'pick', options: [0, 1], labels: ['1 Pokémon', '2 Pokémon'], prompt: 'Flip for how many of your Pokémon?' });
      specs.push({ kind: 'pokemon', field: 'target', side: 'own', options, prompt: 'Choose a Pokémon to flip for' });
      if (c.pick === 1 && c.target !== undefined) specs.push({ kind: 'pokemon', field: 'target2', side: 'own', options: options.filter((t) => t !== c.target), prompt: 'Choose the other Pokémon to flip for' });
      return specs;
    },
    play(ctx) {
      const targets = [ctx.choices.target!, ...(ctx.choices.pick === 1 && ctx.choices.target2 !== undefined ? [ctx.choices.target2] : [])];
      const searches = targets.flatMap((t) => {
        const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
        if (!ctx.flip()) return [];
        return [{ player: ctx.me.id, source: 'Pokémon Breeder Fields', kind: 'pickFromDeck' as const, filter: 'named' as const, name: laterStages(ctx.state.cards, def(ctx.state, p.card).name) }];
      });
      const [first, ...rest] = searches;
      if (!first) return ctx.log('Pokémon Breeder Fields found nothing.');
      ctx.state.pendingChoice = first;
      if (rest.length) (ctx.state.queuedChoices ??= []).push(...rest);
    },
  },

  // Rocket's Hideout: a Stadium; each Pokémon with Dark in its name has 20 more HP (refreshHideout).
  'neo3-63': { stadium: true },

  // Old Rod: 2 flips; both heads, a Pokémon card (Baby, Basic or Evolution) from the discard pile into the hand; both tails, a Trainer card.
  'neo3-64': {
    discardToHand: true,
    play(ctx) {
      const heads = [ctx.flip(), ctx.flip()].filter(Boolean).length;
      if (heads === 1) return ctx.log('Old Rod did nothing.');
      const trainer = heads === 0;
      const fits = (c: { uid: string; defId: string }) => c.uid !== ctx.card.uid && (trainer ? isTrainerCard(def(ctx.state, c)) : isPokemonCard(def(ctx.state, c)));
      if (!ctx.me.discard.some(fits)) return ctx.log(`No ${trainer ? 'Trainer' : 'Pokémon'} cards in the discard pile.`);
      ctx.pend({ kind: 'discardToHand', source: 'Old Rod', count: 1, ...(trainer && { filter: 'trainer' as const }), excludeUid: ctx.card.uid });
    },
  },
};
