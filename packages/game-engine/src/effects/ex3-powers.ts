// EX Dragon (ex3) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Chain of Events needs a second Active Pokémon, so it does nothing here; Muk ex's Toxic Gas, as its
// owner's Active Pokémon, ignores every other Poké-Power and Poké-Body, the older sets' Pokémon Powers too (toxicGas).
// From the text: Dragon Wind switches in the Benched Pokémon its player picks (the opponent has only one Defending Pokémon
// to choose); Loose Shell works only when Ninjask is played from the hand to evolve; Magnetic Field's discarded card can't
// come back; Call for Power moves Energy cards to Dragonite ex any number of times a turn; Ampharos ex's Conductivity puts at
// most 1 damage counter, however many there are (conductivityEx).
import { isBasicEnergy, lookupCard } from '../cards.js';
import { activeLocked, type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { benchRoom, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { freeRetreat, POKE_BODY } from './ex2-powers.js';

/** The player's other Pokémon with Energy cards attached (Call for Power). */
const energySources = (s: PowerSituation): Target[] => ownTargets(s.me).filter((t) => t !== s.source && pokemonAt(s.me, t)!.energy.some((e) => !e.provides));

export const EX3_POWERS: Record<string, PowerEffect> = {
  // Crawdaunt – Power Pinchers: as the Active Pokémon, its player's attacks do 10 more to the Defending Pokémon (attacks.ts).
  'ex3-3': { ...POKE_BODY, powerPinchers: 10 },
  // Minun, Plusle – Chain of Events: only with 2 Active Pokémon a side (agreed: nothing here).
  'ex3-7': { ...POKE_BODY },
  'ex3-8': { ...POKE_BODY },
  // Roselia – Thick Skin: it can't be affected by any Special Conditions.
  'ex3-9': { ...POKE_BODY, noConditions: true },
  // Salamence – Dragon Wind: once a turn, as the Active Pokémon, one of the opponent's Benched Pokémon is switched in.
  'ex3-10': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Salamence must be your Active Pokémon' : s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: s.opp.bench.flatMap((p, i) => (p ? [i] : [])), prompt: "Choose one of your opponent's Benched Pokémon to switch in" }],
    use(ctx) {
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      if (typeof ctx.choices.oppTo === 'number') swapActive(ctx.state, ctx.opp, ctx.choices.oppTo);
    },
  },
  // Shedinja – Wonder Guard: attacks by the opponent's Evolved Pokémon and Pokémon-ex don't affect it.
  'ex3-11': { ...POKE_BODY, guardFrom: 'evolvedOrEx' },
  // Flygon – Sand Guard: heads, 20 less damage from the opponent's attack (as Hard Cocoon).
  'ex3-15': { ...POKE_BODY, hardCocoon: 20 },
  // Magneton – Magnetic Field: once a turn, a card from the hand discarded, then up to 2 basic Energy cards from the discard pile into the hand.
  'ex3-17': {
    oncePerTurn: true,
    blocked(s) {
      if (!s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId)))) return 'No basic Energy cards in your discard pile';
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      return s.me.hand.length ? null : 'Your hand is empty';
    },
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Choose a card from your hand to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name} from the hand.`);
      ctx.pend({ kind: 'discardToHand', source: 'Magnetic Field', count: 2, filter: 'basicEnergy', reveal: true, excludeUid: card.uid });
    },
  },
  // Ninjask – Loose Shell: played from the hand to evolve, Shedinja may go from the deck onto the Bench.
  'ex3-18': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length || !owner.deck.length || !benchRoom(owner.bench, state.cards, state.stadium?.card)) return;
      state.pendingChoice = { player: owner.id, source: 'Loose Shell', kind: 'pickFromDeck', filter: 'named', name: 'Shedinja', toBench: true, optional: true };
    },
  },
  // Salamence – Intimidating Fang.
  'ex3-19': { ...POKE_BODY, intimidatingFang: 10 },
  // Shelgon – Energy Guard: with a basic Energy card attached, 10 less from the opponent's attacks (attacks.ts).
  'ex3-41': { ...POKE_BODY, energyGuard: 10 },
  // Vibrava – Levitate: with a basic Energy card attached, its Retreat Cost is 0.
  'ex3-46': freeRetreat((pokemon, cards) => pokemon.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(cards, e.defId)))),
  // Whiscash – Submerge: on the Bench, no damage from the opponent's attacks.
  'ex3-48': { ...POKE_BODY, benchImmune: true },
  // Pineco – Exoskeleton: 10 less attack damage, after Weakness and Resistance.
  'ex3-71': { ...POKE_BODY, damageReduction: 10 },
  // Ampharos ex – Conductivity.
  'ex3-89': { ...POKE_BODY, conductivityEx: true },
  // Dragonite ex – Call for Power: any number of times a turn, an Energy card from another of the player's Pokémon to Dragonite ex.
  'ex3-90': {
    blocked: (s) => (energySources(s).length ? null : 'None of your other Pokémon have Energy cards attached'),
    choices(s, c) {
      const specs: ReturnType<NonNullable<PowerEffect['choices']>> = [{ kind: 'ownPokemon', field: 'from', options: energySources(s), prompt: 'Choose a Pokémon to move an Energy card from' }];
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      if (from) specs.push({ kind: 'attachedEnergy', field: 'energyUid', options: from.energy.filter((e) => !e.provides), prompt: 'Choose an Energy card to move to Dragonite ex' });
      return specs;
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !card) return;
      from.energy = from.energy.filter((e) => e !== card);
      ctx.source.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },
  // Muk ex – Toxic Gas: as its player's Active Pokémon, every other Poké-Power and Poké-Body is ignored (toxicGas).
  'ex3-96': { ...POKE_BODY, toxicGas: true },
};
