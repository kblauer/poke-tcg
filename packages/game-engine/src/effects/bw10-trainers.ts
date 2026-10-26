// Plasma Blast (bw10) Trainer cards, by card id. The Fossil Items were done with the Black & White series' shared rules
// (README: Generation 5): Cover Fossil, Plume Fossil and Root Fossil Lileep, the only way their Restored Pokémon come into play.
// Caitlin and Iris are Supporters; Reversal Trigger, Silver Bangle, Silver Mirror, G Booster and G Scope are Pokémon Tools (their
// rules where they apply: Reversal Trigger in resolveKnockouts, Silver Bangle and Silver Mirror in attacks.ts); G Booster, G
// Scope, Master Ball and Scoop Up Cyclone are ACE SPEC cards (the shared deck rules). TCGdex has no attacks for G Booster and
// G Scope: theirs come from the printed cards (Grass, Grass, Colorless: 200, and the Bench's 100), usable only by Genesect-EX
// (`machineFor`), and their effects are in bw10.ts.
// From the text: Caitlin puts the cards on the bottom one at a time (the order they go in), then draws as many; Iris counts the
// Prize cards the opponent has taken as it's played; a Team Plasma Pokémon is one with Team Plasma on its card or Team Plasma
// Badge attached (isPlasmaPokemon); Reversal Trigger's search is asked between turns, once the Knock Out is done; Scoop Up
// Cyclone can't take the player's only Pokémon in play.
import type { Attack } from '../cards.js';
import { activeLock, PRIZE_COUNT } from '../engine.js';
import { pokemonAt } from '../powers.js';
import { pokemonName } from '../status.js';
import { targetsOf, type TrainerEffect } from '../trainers.js';
import { fossilItem } from './bw3-trainers.js';
import { tool } from './neo1-trainers.js';

/** A Genesect-EX's Pokémon Tool with an attack (G Booster, G Scope). */
const genesectTool = (name: string, technicalMachine: Attack): TrainerEffect => ({ ...tool(name), technicalMachine, machineFor: (d) => d.name === 'Genesect-EX' });

export const BW10_TRAINERS: Record<string, TrainerEffect> = {
  // Caitlin (Supporter): any number of cards from the hand on the bottom of the deck, then a card drawn for each.
  'bw10-78': {
    supporter: true,
    play(ctx) {
      const rest = ctx.me.hand.filter((c) => c.uid !== ctx.card.uid).length;
      if (rest) ctx.pend({ kind: 'handToDeck', source: 'Caitlin', bottom: true, count: rest, optional: true, drawTo: rest });
    },
  },
  // Cover Fossil, Plume Fossil: as Noble Victories'.
  'bw10-79': fossilItem('Cover Fossil', 'Tirtouga'),
  // Iris (Supporter): this turn, the player's attacks do 10 more to the Active Pokémon for each Prize card the opponent has taken.
  'bw10-81': {
    supporter: true,
    play(ctx) {
      const amount = 10 * Math.max(0, PRIZE_COUNT - ctx.opp.prizes.length);
      ctx.me.moreToActive = { turn: ctx.turn, amount, source: 'Iris' };
      ctx.log(`Iris: your attacks do ${amount} more damage to the Active Pokémon this turn.`);
    },
  },
  'bw10-82': fossilItem('Plume Fossil', 'Archen'),
  // Reversal Trigger: on a Team Plasma Pokémon Knocked Out by damage from the opponent's attack, any card from the deck (resolveKnockouts).
  'bw10-86': tool('Reversal Trigger'),
  // Root Fossil Lileep: Lileep from the bottom 7 cards onto the Bench.
  'bw10-87': fossilItem('Root Fossil Lileep', 'Lileep'),
  // Silver Bangle: 30 more to an Active Pokémon-EX from a Pokémon that isn't one. Silver Mirror: nothing from the opponent's Team
  // Plasma Pokémon to a Pokémon that isn't a Pokémon-EX (attacks.ts).
  'bw10-88': tool('Silver Bangle'),
  'bw10-89': tool('Silver Mirror'),
  // G Booster (ACE SPEC): Genesect-EX's 200, discarding 2 Energy. G Scope (ACE SPEC): Genesect-EX's 100 to a Benched Pokémon.
  'bw10-92': genesectTool('G Booster', { name: 'G Booster', cost: ['grass', 'grass', 'colorless'], damage: 200, damageText: '200', text: "Discard 2 Energy attached to this Pokémon. This attack's damage isn't affected by any effects on the Defending Pokémon." }),
  'bw10-93': genesectTool('G Scope', { name: 'G Scope', cost: ['grass', 'grass', 'colorless'], damage: 0, damageText: null, text: "This attack does 100 damage to 1 of your opponent's Benched Pokémon. (Don't apply Weakness and Resistance for Benched Pokémon.)" }),
  // Master Ball (ACE SPEC): any Pokémon from the deck, shown.
  'bw10-94': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Master Ball', filter: 'pokemon', reveal: true, optional: true }),
  },
  // Scoop Up Cyclone (ACE SPEC): one of the player's Pokémon and every card attached to it into the hand.
  'bw10-95': {
    blocked: (s) => (targetsOf(s.me).length < 2 ? "You can't take back your only Pokémon in play" : null),
    // Not an Active Pokémon held by Jaw Clamp.
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => t !== 'active' || !activeLock(s.me, [s.me, s.opp], s.cards)), prompt: 'Choose a Pokémon to put into your hand' }],
    play(ctx) {
      const t = ctx.choices.target!;
      const p = pokemonAt(ctx.me, t)!;
      ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
      if (t === 'active') ctx.me.active = null;
      else ctx.me.bench[t] = null;
      ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it went into the hand.`);
    },
  },
};
