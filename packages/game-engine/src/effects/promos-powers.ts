// Wizards Black Star Promos (basep) Pokémon Powers, by card id. Powers that are used stop working while their
// Pokémon is Asleep, Confused, Paralyzed, Poisoned or Burned (agreed; checked in powerError); the rest are flags the engine checks with
// powerActive, which also handles Toxic Gas.
// Rulings (agreed): Chain Reaction can be used after any Pokémon evolves, either player's, and counts as
// evolving Eevee (the usual evolution rules apply). Pure Body: the player chooses which Energy card to discard
// from Suicune, which can be the Water Energy just attached. Unown [J]'s Join works as printed, though Unown
// O, I and N aren't in the run card pool.
import { isBasicEnergy, lookupCard } from '../cards.js';
import type { InPlayPokemon } from '../engine.js';
import { type PowerEffect } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog, flipCoin, inPlayDef, pokemonName } from '../status.js';

/** Special Conditions Solar Power removes (not Burned). */
const solarCured = (p: InPlayPokemon | null) => !!p && (!!p.condition || !!p.poison);

/** The Unown Join needs on its owner's Bench. */
const JOIN = ['Unown [J]', 'Unown [O]', 'Unown [I]', 'Unown [N]'];

export const PROMO_POWERS: Record<string, PowerEffect> = {
  // Dragonite – Special Delivery: once during your turn, draw a card, then put a card from your hand on top of your deck.
  'basep-5': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      ctx.me.hand.push(ctx.me.deck.shift()!);
      ctx.log('Drew a card.');
      ctx.pend({ kind: 'handToDeck', source: 'Special Delivery' });
    },
  },

  // Eevee – Chain Reaction: when a Pokémon evolves, search your deck for a card that evolves from Eevee and evolve Eevee with it.
  'basep-11': { chainReaction: true },

  // Venusaur – Solar Power: once during your turn, your Active Pokémon and the Defending Pokémon are no longer Asleep, Confused, Paralyzed or Poisoned.
  'basep-13': {
    oncePerTurn: true,
    blocked: (s) => (solarCured(s.me.active) || solarCured(s.opp.active) ? null : 'Neither Active Pokémon is Asleep, Confused, Paralyzed or Poisoned'),
    use(ctx) {
      for (const p of [ctx.me.active, ctx.opp.active]) {
        if (!solarCured(p)) continue;
        p!.condition = null;
        p!.poison = 0;
        delete p!.paralyzedTurn;
        ctx.log(`${pokemonName(ctx.state, p!)} is no longer Asleep, Confused, Paralyzed or Poisoned.`);
      }
    },
  },

  // Entei – Bolt: when the opponent's attack damages Entei without Knocking it Out, flip; heads shuffles Entei and its cards into the deck.
  'basep-34': {
    onAttackDamage(ctx, entei) {
      // Once the attack is over, so its other effects still find Entei where it was.
      ctx.after(() => {
        const owner = ctx.opp;
        const target = owner.active === entei ? 'active' : owner.bench.indexOf(entei);
        if (target === -1 || entei.damage >= inPlayDef(ctx.state.cards, entei).hp) return;
        if (!flipCoin(ctx.state, 'Bolt', owner.id)) return;
        const cards = [...entei.evolvedFrom, entei.card, ...entei.energy.map(({ provides: _, ...card }) => card), ...(entei.attached ?? []).map((a) => a.card)];
        [owner.deck, ctx.state.rngState] = shuffle([...owner.deck, ...cards], ctx.state.rngState);
        if (target === 'active') owner.active = null;
        else owner.bench[target] = null;
        ctx.log(`Bolt: ${pokemonName(ctx.state, entei)} and all cards attached to it were shuffled into the deck.`, owner.id);
      });
    },
  },

  // Unown [J] – Join: once during your turn, with Unown J, O, I and N on your Bench, take a Basic Pokémon or Evolution card from your deck (shown to the opponent).
  'basep-38': {
    oncePerTurn: true,
    blocked(s) {
      const benched = s.me.bench.flatMap((p) => (p ? [inPlayDef(s.cards, p).name] : []));
      return JOIN.every((name) => benched.includes(name)) ? null : 'You need Unown J, O, I and N on your Bench';
    },
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Join', filter: 'pokemon', reveal: true }),
  },

  // Mew – Neutral Shield: attacks by Evolved Pokémon don't affect Mew.
  'basep-47': { neutralShield: true },

  // Articuno – Aurora Veil: while Articuno is your Active Pokémon, attacks don't affect your Benched Pokémon. Off while it has any Special Condition.
  'basep-48': { auroraVeil: true },

  // Snorlax – Guard: while Snorlax is your Active Pokémon, the Defending Pokémon can't retreat. Off while it has any Special Condition.
  'basep-49': { guard: true },

  // Suicune – Pure Body: after a Water Energy card from your hand is attached to Suicune, discard an Energy card from Suicune.
  'basep-53': {
    onEnergyFromHand(state, owner, suicune, target, energy) {
      const d = lookupCard(state.cards, energy.defId);
      if (energy.provides || !isBasicEnergy(d) || d.kind !== 'energy' || d.energyType !== 'water') return;
      // Identical cards make no difference, so only a real choice is asked.
      if (new Set(suicune.energy.map((e) => e.defId)).size > 1) {
        state.pendingChoice = { player: owner.id, source: 'Pure Body', kind: 'discardAttached', target };
        return;
      }
      const discarded = suicune.energy.pop()!;
      owner.discard.push(discarded);
      addLog(state, `Pure Body: discarded ${lookupCard(state.cards, discarded.defId).name} from ${pokemonName(state, suicune)}.`, owner.id);
    },
  },
};
