// Dragons Exalted (bw6) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY), stopped only by effects
// that name Abilities: Garbotoxin, here (garbotoxinStops: any Garbodor in play with a Pokémon Tool attached, either player's,
// switches off every other Ability in play; Garbotoxin itself works on).
// From the text: Cast-off Shell, Le Parfum, Bright Look and Toppling Wind work when the card is played from the hand to evolve
// (Rare Candy too), never when it's put into play another way, and each asks first (they're "may"); Cast-off Shell's Shedinja
// goes onto the Bench as the Stage 1 Pokémon it is; Fight Song adds 20 for each Altaria to the player's Dragon Pokémon's
// attacks on the Active Pokémon, before Weakness and Resistance (they add up); Electromagnetic Wall puts 3 damage counters
// (Shocking Tail's 2, otherwise the same: only Energy cards attached from the hand); Dark Trance moves Darkness Energy cards
// (basic or Special) as often as the player likes; Leave It to the Wind can't return its player's only Pokémon in play, nor
// an Active Pokémon held by Jaw Clamp and the like; Unobservant reads the opponent's Active Pokémon as the attack is chosen
// (a Restored Pokémon is no Basic Pokémon). Safeguard is the older one for Pokémon-EX only (agreed: Pokémon-ex aren't
// Pokémon-EX).
// Ho-Oh-EX's Rebirth is used from the discard pile (fromZone, USE_CARD_POWER: the card clicked there, the user's 2026-10-26):
// not with a full Bench; heads, onto the Bench, then basic Energy cards of 3 different types from the discard pile, the player's
// picks (as many types as there are, when fewer: attachFromDiscard's distinctTypes).
import { isBasicEnergy, lookupCard, type EnergyType } from '../cards.js';
import { activeLock, newInPlay, type CardInstance, type GameState, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { ABILITY, targetOf } from './common.js';
import { energyCardOf } from './ex2.js';

/** "When you play this Pokémon from your hand to evolve 1 of your Pokémon, you may …": `then` asks or does it. */
const onEvolve = (then: (state: GameState, owner: PlayerState, pokemon: InPlayPokemon) => void): PowerEffect => ({
  ...ABILITY,
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length && !pokemon.levelUpFrom) then(state, owner, pokemon);
  },
});

/** "Move a [type] Energy attached to 1 of your Pokémon to another of your Pokémon", as often as the player likes (Dark Trance). */
function moveTyped(type: EnergyType, label: string): PowerEffect {
  const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;
  const typed = (s: PowerSituation, t: Target) => at(s, t).energy.filter((e: CardInstance) => energyCardOf(s.cards, e, type));
  return {
    ...ABILITY,
    blocked(s) {
      if (ownTargets(s.me).length < 2) return 'You need another Pokémon to move Energy to';
      return ownTargets(s.me).some((t) => typed(s, t).length) ? null : `None of your Pokémon have ${label} Energy`;
    },
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => typed(s, t).length), prompt: `Take a ${label} Energy from` }];
      if (c.from === undefined) return specs;
      return [
        ...specs,
        { kind: 'attachedEnergy', field: 'energyUid', options: typed(s, c.from), prompt: `Choose the ${label} Energy` },
        { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Move it to' },
      ];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const energy = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved a ${label} Energy from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  };
}

export const BW6_POWERS: Record<string, PowerEffect> = {
  // Ho-Oh-EX – Rebirth: once a turn, from the discard pile, a coin; heads, onto the Bench with basic Energy cards of 3
  // different types from the discard pile.
  'bw6-22': {
    ...ABILITY,
    fromZone: 'discard',
    blockedFrom: (s) => (openBenchSlot(s.me, s.cards, s.stadium) < 0 ? 'Your Bench is full' : null),
    useFrom(ctx) {
      if (!ctx.flip()) return ctx.log('Rebirth: tails.');
      const slot = openBenchSlot(ctx.me, ctx.state.cards, ctx.state.stadium?.card);
      ctx.me.discard = ctx.me.discard.filter((c) => c !== ctx.card);
      ctx.me.bench[slot] = newInPlay(ctx.card, ctx.state.turn);
      ctx.log('Rebirth: put Ho-Oh-EX onto the Bench.');
      const types = new Set(ctx.me.discard.flatMap((c) => {
        const d = lookupCard(ctx.state.cards, c.defId);
        return d.kind === 'energy' && isBasicEnergy(d) ? [d.energyType] : [];
      }));
      if (types.size) ctx.pend({ kind: 'attachFromDiscard', source: 'Rebirth', count: Math.min(3, types.size), target: slot, distinctTypes: true });
    },
  },
  // Jumpluff – Leave It to the Wind: once during the player's turn, it and every card attached to it go back into the hand.
  'bw6-3': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).length < 2 ? "You can't return your only Pokémon in play" : s.source === 'active' ? activeLock(s.me, [s.me, s.opp], s.cards) : null),
    use(ctx) {
      const p = ctx.source;
      ctx.me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, converted: _c, windless: _w, ...c }) => c), ...(p.attached ?? []).map((a) => a.card));
      if (ctx.me.active === p) ctx.me.active = null;
      else ctx.me.bench = ctx.me.bench.map((q) => (q === p ? null : q));
      ctx.log(`${pokemonName(ctx.state, p)} and all cards attached to it returned to the hand.`);
    },
  },

  // Ninjask – Cast-off Shell: evolving from the hand, may put a Shedinja from the deck onto the Bench.
  'bw6-11': onEvolve((state, owner) => {
    if (!owner.deck.length || openBenchSlot(owner, state.cards, state.stadium?.card) < 0) return;
    state.pendingChoice = { player: owner.id, source: 'Cast-off Shell', kind: 'pickFromDeck', filter: 'named', name: 'Shedinja', toBench: true, optional: true };
  }),

  // Roserade – Le Parfum: evolving from the hand, may take any card from the deck into the hand.
  'bw6-15': onEvolve((state, owner) => {
    if (owner.deck.length) state.pendingChoice = { player: owner.id, source: 'Le Parfum', kind: 'pickFromDeck', filter: 'any', optional: true };
  }),

  // Ninetales – Bright Look: evolving from the hand, may switch 1 of the opponent's Benched Pokémon (the player's pick) with their Active Pokémon.
  'bw6-19': onEvolve((state, owner, pokemon) => {
    const opp = state.players[state.playerOrder.find((id) => id !== owner.id)!]!;
    if (opp.bench.some(Boolean)) state.pendingChoice = { player: owner.id, source: 'Bright Look', kind: 'mayUse', power: 'brightLook', target: targetOf(owner, pokemon) };
  }),

  // Ampharos – Electromagnetic Wall: as the Active Pokémon, 3 damage counters on any Pokémon the opponent attaches an Energy card to from their hand.
  'bw6-40': { ...ABILITY, shockingTail: 3 },

  // Mew-EX – Versatile: the attacks of any Pokémon in play, either player's, paying their costs (usableAttacks).
  'bw6-46': { ...ABILITY, versatile: true },

  // Shedinja – Empty Shell: Knocked Out, no Prize cards for the opponent.
  'bw6-48': { ...ABILITY, noPrizes: true },

  // Sigilyph – Safeguard: nothing from attacks by the opponent's Pokémon-EX, damage included.
  'bw6-52': { ...ABILITY, guardFrom: 'pokemonEX' },

  // Garbodor – Garbotoxin: with a Pokémon Tool attached, no other Pokémon in play has Abilities (garbotoxinStops).
  'bw6-54': { ...ABILITY, garbotoxin: true },

  // Aggron – Toppling Wind: evolving from the hand, may discard the top 3 cards of the opponent's deck.
  'bw6-80': onEvolve((state, owner, pokemon) => {
    state.pendingChoice = { player: owner.id, source: 'Toppling Wind', kind: 'mayUse', power: 'topplingWind', target: targetOf(owner, pokemon) };
  }),

  // Altaria – Fight Song: 20 more for the player's Dragon Pokémon's attacks to the Active Pokémon, before Weakness and Resistance.
  'bw6-84': { ...ABILITY, allyMore: { amount: 20, type: 'dragon' } },

  // Gabite – Dragon Call: once during the player's turn, a Dragon Pokémon from the deck into the hand, shown.
  'bw6-89': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Dragon Call', filter: 'pokemonType', type: 'dragon', reveal: true }),
  },

  // Hydreigon – Dark Trance: a Darkness Energy from one of the player's Pokémon to another, as often as they like.
  'bw6-97': moveTyped('darkness', 'Darkness'),

  // Slaking – Unobservant: it can't attack while the opponent's Active Pokémon is a Basic Pokémon.
  'bw6-103': {
    ...ABILITY,
    attackBlocked(s) {
      const d = inPlayDef(s.cards, s.defender);
      return d.stage === 'basic' && !d.restored ? `Unobservant: ${inPlayDef(s.cards, s.attacker).name} can't attack while your opponent's Active Pokémon is a Basic Pokémon` : null;
    },
  },

  // Bouffalant – Bouffer: attack damage to it 20 less, after Weakness and Resistance.
  'bw6-110': { ...ABILITY, damageReduction: 20 },
};
