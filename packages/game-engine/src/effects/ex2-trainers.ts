// EX Sandstorm (ex2) Trainer cards and special Energy, by card id. Lanette's Net Search and Wally's Training are Supporters.
// Agreed with the user: Rare Candy and Wally's Training follow the usual rules for evolving (not on the player's first turn,
// nor on a Pokémon played or evolved this turn); Rare Candy can take Claw, Root or Mysterious Fossil straight to its Stage 2
// (Armaldo, Cradily, Omastar, Kabutops ex). Multi Energy provides every type, 1 at a time, and only Colorless while another
// Special Energy card is attached to its Pokémon (checked all the time: refreshMultiEnergy).
// From the text: the Fossils are played as Basic Pokémon (Claw and Root Fossil 40 HP, Mysterious Fossil 10), like Fossil's
// Mysterious Fossil; Lanette's Net Search finds Basic Pokémon of different types, never Baby Pokémon.
import { isBenchable, lookupCard, type PokemonCardDef } from '../cards.js';
import { evolvesOnto, type CardInstance, type InPlayPokemon, type Target } from '../engine.js';
import { evolutionBlocked, offerChainReaction, playedFromHand, primalBlock, trainerProof } from '../powers.js';
import { evolveWith, own, otherHandCards, targetsOf, def, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';

/** Your Pokémon in play (Basic ones only) that `card` can go onto with Rare Candy: a Stage 1 onto its Basic, a Stage 2 onto the Basic at the bottom of its line. */
function candyTargets(s: TrainerSituation, card: CardInstance): Target[] {
  const d = def(s, card);
  if (d.kind !== 'pokemon' || d.stage === 'basic' || d.trainerText) return [];
  const sides = [s.me, s.opp];
  return targetsOf(s.me).filter((t) => {
    const p = own(s, t)!;
    const current = def(s, p.card);
    if (!isBenchable(current) || p.playedTurn === s.turn || p.effects?.noEvolve !== undefined || primalBlock(p, sides, s.cards)) return false;
    return d.stage === 'stage1' ? evolvesOnto(d, current) : d.evolvesFromBasic === current.name;
  });
}

/** Whether the player's Active Pokémon can evolve now (Wally's Training): not on the first turn, nor if it was played or evolved this turn. */
const activeCanEvolve = (s: TrainerSituation, p: InPlayPokemon | null) => !!p && s.turn > 2 && p.playedTurn !== s.turn && p.effects?.noEvolve === undefined;

/** The Fossils' printed Poké-Bodies (TCGdex has EX Sandstorm's; the later Fossils' names and text come from here too). */
export const JAGGED_STONE = { name: 'Jagged Stone', text: "If Claw Fossil is your Active Pokémon and is damaged by an opponent's attack (even if Claw Fossil is Knocked Out), put 1 damage counter on the Attacking Pokémon." };
export const SPONGY_STONE = { name: 'Spongy Stone', text: 'At any time between turns, remove 1 damage counter from Root Fossil.' };

export const EX2_TRAINERS: Record<string, TrainerEffect> = {
  // Double Full Heal: no more Special Conditions for the Active Pokémon.
  'ex2-86': {
    blocked: (s) => (s.me.active ? (trainerProof(s.me, [s.me, s.opp], s.cards) ?? null) : 'No Active Pokémon'),
    play(ctx) {
      const active = ctx.me.active;
      if (!active) return;
      Object.assign(active, { condition: null, poison: 0, burned: false });
      delete active.paralyzedTurn;
      ctx.log(`${lookupCard(ctx.state.cards, active.card.defId).name} is no longer affected by Special Conditions.`);
    },
  },

  // Lanette's Net Search (Supporter): up to 3 Basic Pokémon of different types (not Baby Pokémon) from the deck, shown.
  'ex2-87': {
    supporter: true,
    blocked: (s) => (s.deckCount > 0 ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: "Lanette's Net Search", filter: 'basicNotBaby', reveal: true, count: 3, optional: true, distinct: 'type' }),
  },

  // Rare Candy: a Stage 1 or Stage 2 card from the hand onto the Basic Pokémon it evolves from (its line's, for a Stage 2).
  'ex2-88': {
    blocked(s) {
      if (s.turn <= 2) return "You can't evolve on your first turn";
      const blocked = evolutionBlocked([s.me, s.opp], s.cards);
      if (blocked) return blocked;
      return otherHandCards(s).some((c) => candyTargets(s, c).length) ? null : 'No Evolution card in your hand evolves from a Basic Pokémon you can evolve';
    },
    choices(s, c) {
      const cards = otherHandCards(s).filter((card) => candyTargets(s, card).length);
      const chosen = c.handUids && s.me.hand.find((card) => card.uid === c.handUids![0]);
      return [
        { kind: 'cards', field: 'handUids', min: 1, max: 1, options: cards, prompt: 'Choose a Stage 1 or Stage 2 card from your hand' },
        ...(chosen ? [{ kind: 'pokemon' as const, field: 'target' as const, side: 'own' as const, options: candyTargets(s, chosen), prompt: 'Put it on' }] : []),
      ];
    },
    play(ctx) {
      const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      evolveWith(ctx.state, ctx.me, p, card!, 'with Rare Candy');
      playedFromHand(ctx.state, ctx.me, p);
      if (!ctx.state.pendingChoice) offerChainReaction(ctx.state);
    },
  },

  // Wally's Training (Supporter): a card from the deck that evolves from the Active Pokémon goes onto it.
  'ex2-89': {
    supporter: true,
    blocked(s) {
      if (s.deckCount === 0) return 'Your deck is empty';
      const blocked = evolutionBlocked([s.me, s.opp], s.cards);
      if (blocked) return blocked;
      if (s.turn <= 2) return "You can't evolve on your first turn";
      return activeCanEvolve(s, s.me.active) ? null : "Your Active Pokémon can't evolve this turn";
    },
    play(ctx) {
      const active = ctx.me.active!;
      const current = lookupCard(ctx.state.cards, active.card.defId);
      const names = [...new Set(ctx.me.deck.map((c) => lookupCard(ctx.state.cards, c.defId)).filter((d): d is PokemonCardDef => d.kind === 'pokemon' && evolvesOnto(d, current)).map((d) => d.name))];
      if (names.length) return ctx.pend({ kind: 'evolveFromDeck', source: "Wally's Training", target: 'active', names });
      ctx.shuffleIntoDeck(ctx.me, []);
      ctx.log('Found nothing in the deck.');
    },
  },

  // Claw Fossil, Mysterious Fossil, Root Fossil: played onto the Bench as Basic Pokémon, like Fossil's Mysterious Fossil. Claw
  // Fossil's Jagged Stone and Root Fossil's Spongy Stone are in ex2-powers.ts.
  'ex2-90': { asPokemon: { hp: 40, power: JAGGED_STONE } },
  'ex2-91': { asPokemon: { hp: 10 } },
  'ex2-92': { asPokemon: { hp: 40, power: SPONGY_STONE } },
};

export const EX2_ENERGY: Record<string, EnergyEffect> = {
  // Multi Energy: every type, 1 at a time (an 'any' Energy, as Rainbow Energy), Colorless beside another Special Energy card.
  'ex2-93': { onAttach: () => {} },
};
