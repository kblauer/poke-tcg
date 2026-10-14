// Where a hand card can be played right now. UI hints only – the server validates every move.
import { evolveError, isBasicPokemon, lookupCard, type CardDef, type CardInstance, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { emptyBenchSlots, occupiedSlots, pokemonAt, toTarget, type SlotId } from './slots';
import { isMyTurn } from './turn';

export function targetsFor(view: PlayerView, card: CardInstance): SlotId[] {
  const { self } = view;
  const def = lookupCard(view.cards, card.defId);
  if (view.phase === 'setup') return isBasicPokemon(def) && !self.active ? ['active'] : [];
  if (!isMyTurn(view)) return [];
  if (isBasicPokemon(def)) return emptyBenchSlots(self);
  if (def.kind === 'pokemon') return occupiedSlots(self).filter((slot) => evolveError(def, pokemonAt(self, slot)!, view.cards, view.turn) === null);
  if (def.kind === 'energy' && !view.energyAttachedThisTurn) return occupiedSlots(self);
  return [];
}

/** Explains why a hand card has no targets. */
export function whyNoTargets(view: PlayerView, card: CardInstance): string {
  const { self } = view;
  const def = lookupCard(view.cards, card.defId);
  if (view.phase === 'setup') return self.active ? 'Waiting for the CPU…' : 'Choose a Basic Pokémon as your active first.';
  if (!isMyTurn(view)) return "It's not your turn.";
  if (def.kind === 'pokemon' && !isBasicPokemon(def)) {
    // A matching Pokémon is in play but blocked (first turn, played this turn): say why.
    const match = occupiedSlots(self)
      .map((slot) => pokemonAt(self, slot))
      .find((p) => p && lookupCard(view.cards, p.card.defId).name === def.evolvesFrom);
    const reason = match && evolveError(def, match, view.cards, view.turn);
    return reason ? `${reason}.` : `No ${def.evolvesFrom} in play to evolve.`;
  }
  if (isBasicPokemon(def)) return 'Your bench is full.';
  if (def.kind === 'energy') return "You've already attached an Energy this turn.";
  return "This card can't be played right now.";
}

/** The action for playing a hand card onto a slot. */
export function playAction(def: CardDef, cardUid: string, slot: SlotId): GameAction {
  const target = toTarget(slot);
  if (def.kind === 'energy') return { type: 'ATTACH_ENERGY', cardUid, target };
  if (!isBasicPokemon(def)) return { type: 'EVOLVE', cardUid, target };
  return target === 'active' ? { type: 'SET_ACTIVE', cardUid } : { type: 'PLAY_BENCH', cardUid, slot: target };
}

/** What dropping the card on a highlighted slot will do. */
export const targetLabel = (def: CardDef) => (def.kind === 'energy' ? 'Attach' : isBasicPokemon(def) ? 'Play' : 'Evolve');
