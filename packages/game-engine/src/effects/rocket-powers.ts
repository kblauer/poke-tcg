// Team Rocket (base5) Pokémon Powers, by card id. Powers that are used stop working while their Pokémon is
// Asleep, Confused or Paralyzed (checked in powerError); the rest are flags the engine checks with powerActive,
// which also handles Toxic Gas. Cards 22–30 are the non-holo prints of 5–13.
// Rulings (agreed): Summon Minions, Sneak Attack and Reel In ("when you play it from your hand") also trigger
// when Pokémon Breeder puts the card into play (playedFromHand). Frenzy's 30 is added before Weakness and
// Resistance, so Confusion's self-damage is 50. Trickery: the player picks which face-down Prize, by position,
// to switch with the top card of the deck.
import { isBasicPokemon, isPokemonCard, lookupCard, type CardLibrary } from '../cards.js';
import { applyWeaknessResistance } from '../attacks.js';
import { counts, energyPool, isEnergyCardOf, type CardInstance, type GameState, type InPlayPokemon, type PlayerState, type Target } from '../engine.js';
import { ownTargets, pokemonAt, powerActive, type PowerContext, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, effectId, flipCoin, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { pokemonTower, type PendingChoice, type PendingChoiceInput } from '../trainers.js';
import { powerEffect } from './index.js';

const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;

/** A Fire Energy card, or Rainbow Energy (Gather Fire moves Energy cards, not Buzzap'd Electrodes). */
const isFireCard = (cards: CardLibrary, c: CardInstance) => isEnergyCardOf(c, cards, 'fire');

/**
 * Pollen Stench and Long Distance Hypnosis: `pokemon` (of `owner`) is now `condition`, unless it can't be
 * affected by Special Conditions (Thick Skinned, Clefairy Doll) or a battle rule guards it.
 */
function afflict(ctx: PowerContext, owner: PlayerState, pokemon: InPlayPokemon | null, condition: 'asleep' | 'confused') {
  if (!pokemon) return;
  const name = pokemonName(ctx.state, pokemon);
  const sides = [ctx.me, ctx.opp];
  if (inPlayDef(ctx.state.cards, pokemon).trainerText || (powerActive(pokemon, ctx.state.cards, sides) && powerEffect(effectId(pokemon))?.noConditions)) return addLog(ctx.state, `${name} can't be affected by Special Conditions.`, owner.id);
  const guard = ctx.state.rules?.find((r) => r.kind === 'conditionGuard' && r.player === owner.id && r.conditions.includes(condition));
  if (guard) return addLog(ctx.state, `${guard.label ?? 'A battle rule'} protected ${name} from that.`, owner.id);
  pokemon.condition = condition;
  delete pokemon.paralyzedTurn;
  addLog(ctx.state, `${name} is now ${condition === 'asleep' ? 'Asleep' : 'Confused'}.`, owner.id);
}

/** A once-per-turn flip: heads gives the Defending Pokémon `condition`, tails gives it to the player's own Active Pokémon. */
const flipCondition = (condition: 'asleep' | 'confused'): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
  use: (ctx) => (ctx.flip() ? afflict(ctx, ctx.opp, ctx.opp.active, condition) : afflict(ctx, ctx.me, ctx.me.active, condition)),
});

const pend = (state: GameState, owner: PlayerState, choice: PendingChoiceInput) => {
  state.pendingChoice = { ...choice, player: owner.id } as PendingChoice;
};

const HOLO: Record<string, PowerEffect> = {
  // Dark Dragonite – Summon Minions: when you play it from your hand, put up to 2 Basic Pokémon from your deck onto your Bench.
  'base5-5': {
    onPlayFromHand(state, owner) {
      if (openBenchSlot(owner.bench, state.cards, state.stadium?.card) < 0 || !owner.deck.some((c) => isBasicPokemon(lookupCard(state.cards, c.defId)))) return;
      pend(state, owner, { source: 'Summon Minions', kind: 'pickFromDeck', filter: 'basic', toBench: true, optional: true, count: 2 });
    },
  },

  // Dark Dugtrio – Sinkhole: whenever the opponent's Active Pokémon retreats, they flip; tails does 20 to it (engine.ts, RETREAT).
  'base5-6': { sinkhole: true },

  // Dark Golbat – Sneak Attack: when you play it from your hand, you may do 10 damage to 1 of the opponent's Pokémon (Weakness and Resistance apply).
  'base5-7': {
    onPlayFromHand(state, owner, golbat) {
      pend(state, owner, { source: 'Sneak Attack', kind: 'powerDamage', amount: 10, type: inPlayDef(state.cards, golbat).type });
    },
  },

  // Dark Gyarados – Final Beam: when an attack Knocks it Out, flip; heads does 20 per Water Energy on it to the attacker (Weakness and Resistance apply).
  'base5-8': {
    onAttackDamage(ctx, gyarados) {
      // Once the attack is over, so only a Knock Out counts.
      ctx.after(() => {
        const owner = ctx.opp;
        if (gyarados.damage < inPlayDef(ctx.state.cards, gyarados).hp || !flipCoin(ctx.state, 'Final Beam', owner.id)) return;
        const water = energyPool(gyarados, ctx.state.cards).filter((t) => counts(t, 'water')).length;
        const damage = applyWeaknessResistance(20 * water, inPlayDef(ctx.state.cards, gyarados).type, ctx.attackerDef, ctx.attacker.effects);
        ctx.attacker.damage += damage;
        addLog(ctx.state, `Final Beam did ${damage} damage to ${ctx.attackerDef.name}.`, owner.id);
      });
    },
  },

  // Dark Slowbro – Reel In: when you play it from your hand, put up to 3 Pokémon cards from your discard pile into your hand.
  'base5-12': {
    onPlayFromHand(state, owner) {
      if (!owner.discard.some((c) => isPokemonCard(lookupCard(state.cards, c.defId)))) return;
      if (pokemonTower({ stadium: state.stadium?.card, cards: state.cards })) return addLog(state, 'Pokémon Tower: cards in discard piles stay there.', owner.id);
      pend(state, owner, { source: 'Reel In', kind: 'discardToHand', count: 3 });
    },
  },

  // Dark Vileplume – Hay Fever: no Trainer cards can be played (trainersBlocked).
  'base5-13': { noTrainers: true },
};

export const ROCKET_POWERS: Record<string, PowerEffect> = {
  ...HOLO,
  ...Object.fromEntries(Object.entries(HOLO).map(([id, effect]) => [`base5-${Number(id.slice(6)) + 17}`, effect])),

  // Dark Dragonair – Evolutionary Light: once during your turn, take an Evolution card from your deck (shown to the opponent).
  'base5-33': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Evolutionary Light', filter: 'evolution', reveal: true }),
  },

  // Dark Gloom – Pollen Stench: once during your turn, flip; heads confuses the Defending Pokémon, tails your Active Pokémon.
  'base5-36': flipCondition('confused'),

  // Dark Kadabra – Matter Exchange: once during your turn, discard a card from your hand to draw a card.
  'base5-39': {
    oncePerTurn: true,
    blocked: (s) => (!s.me.hand.length ? 'Your hand is empty' : !s.counts.deck ? 'Your deck is empty' : null),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Discard a card from your hand' }],
    use(ctx) {
      const [card] = ctx.me.hand.splice(ctx.me.hand.findIndex((c) => c.uid === ctx.choices.cardUid), 1);
      ctx.me.discard.push(card!);
      ctx.me.hand.push(ctx.me.deck.shift()!);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card!.defId).name} and drew a card.`);
    },
  },

  // Dark Muk – Sticky Goo: while it's your Active Pokémon, the opponent's Active Pokémon costs 2 more to retreat.
  'base5-41': { stickyGoo: 2 },

  // Dark Primeape – Frenzy: damage it does while Confused, to itself too, is 30 more (attacks.ts). It works while Confused.
  'base5-43': { frenzy: true, ignoresConditions: true },

  // Charmander – Gather Fire: once during your turn, move a Fire Energy card from 1 of your other Pokémon to Charmander.
  'base5-50': {
    oncePerTurn: true,
    blocked: (s) => (others(s).length ? null : 'None of your other Pokémon have Fire Energy cards'),
    choices(s, c) {
      const from = { kind: 'ownPokemon', field: 'from', options: others(s), prompt: 'Take a Fire Energy card from' } as const;
      if (c.from === undefined) return [from];
      return [from, { kind: 'attachedEnergy', field: 'energyUid', options: at(s, c.from).energy.filter((e) => isFireCard(s.cards, e)), prompt: 'Choose the Fire Energy card' }];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const [energy] = from.energy.splice(from.energy.findIndex((e) => e.uid === ctx.choices.energyUid), 1);
      ctx.source.energy.push(energy!);
      ctx.log(`Moved a Fire Energy card from ${pokemonName(ctx.state, from)} to Charmander.`);
    },
  },

  // Drowzee – Long Distance Hypnosis: once during your turn, flip; heads puts the Defending Pokémon to sleep, tails your Active Pokémon.
  'base5-54': flipCondition('asleep'),

  // Rattata – Trickery: once during your turn, switch 1 of your Prizes (picked face down) with the top card of your deck.
  'base5-66': {
    oncePerTurn: true,
    blocked: (s) => (!s.counts.prizes ? 'You have no Prize cards left' : !s.counts.deck ? 'Your deck is empty' : null),
    choices: (s) => [{ kind: 'prize', field: 'prize', options: Array.from({ length: s.counts.prizes }, (_, i) => i), prompt: 'Choose a Prize card to switch' }],
    use(ctx) {
      const i = ctx.choices.prize!;
      [ctx.me.prizes[i], ctx.me.deck[0]] = [ctx.me.deck[0]!, ctx.me.prizes[i]!];
      ctx.log(`Switched Prize ${i + 1} with the top card of the deck.`);
    },
  },
};

/** Gather Fire: the player's other Pokémon with a Fire Energy card attached. */
function others(s: PowerSituation): Target[] {
  return ownTargets(s.me).filter((t) => t !== s.source && at(s, t).energy.some((e) => isFireCard(s.cards, e)));
}
