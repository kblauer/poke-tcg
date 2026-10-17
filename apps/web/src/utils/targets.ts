// Where a hand card can be played right now. UI hints only – the server validates every move.
import {
  evolveError,
  isBasicPokemon,
  isBenchable,
  lookupCard,
  ownTargets,
  powerError,
  powerTakesHandCard,
  resolvePowerChoices,
  isTrainerCard,
  trainersLocked,
  type CardDef,
  type CardInstance,
  type GameAction,
  type PlayerView,
} from '@poke-tcg/game-engine';
import { emptyBenchSlots, occupiedSlots, pokemonAt, toTarget, type SlotId } from './slots';
import { isMyTurn } from './turn';

export function targetsFor(view: PlayerView, card: CardInstance): SlotId[] {
  const { self } = view;
  const def = lookupCard(view.cards, card.defId);
  if (view.phase === 'setup') return isBasicPokemon(def) && !self.active ? ['active'] : [];
  if (!isMyTurn(view) || view.self.pendingChoice) return [];
  // Trainers are played from the TrainerPanel; Clefairy Doll goes onto the Bench like a Basic.
  if (def.kind === 'trainer') return [];
  if (isTrainerCard(def) && trainersLocked(self, view.turn)) return [];
  if (isBenchable(def)) return emptyBenchSlots(self);
  if (def.kind === 'pokemon') return occupiedSlots(self).filter((slot) => evolveError(def, pokemonAt(self, slot)!, view.cards, view.turn, [self, view.opponent]) === null);
  if (def.kind === 'energy') return occupiedSlots(self).filter((slot) => !view.energyAttachedThisTurn || powerPlay(view, card, slot));
  return [];
}

/**
 * A Pokémon Power that can put this hand card onto the slot (Rain Dance), as the action that uses
 * it; null if none can. Such powers don't use up the turn's energy attachment, so they're preferred.
 */
export function powerPlay(view: PlayerView, card: CardInstance, slot: SlotId): GameAction | null {
  if (!isMyTurn(view)) return null;
  for (const source of ownTargets(view.self)) {
    const situation = { me: view.self, opp: view.opponent, source, cards: view.cards, turn: view.turn };
    if (powerError(situation)) continue;
    // Only powers that put this card from the hand into play (Rain Dance), not ones like Energy Burn.
    if (!powerTakesHandCard(situation, card.uid)) continue;
    const choices = { cardUid: card.uid, to: toTarget(slot) };
    if ('choices' in resolvePowerChoices(situation, choices)) return { type: 'USE_POWER', source, choices };
  }
  return null;
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
    const reason = match && evolveError(def, match, view.cards, view.turn, [self, view.opponent]);
    return reason ? `${reason}.` : `No ${def.evolvesFrom} in play to evolve.`;
  }
  if (isTrainerCard(def) && trainersLocked(self, view.turn)) return "You can't play Trainer cards this turn.";
  if (isBenchable(def)) return 'Your bench is full.';
  if (def.kind === 'energy') return "You've already attached an Energy this turn.";
  return "This card can't be played right now.";
}

/** The action for playing a hand card onto a slot. */
export function playAction(view: PlayerView, card: CardInstance, slot: SlotId): GameAction {
  const def = lookupCard(view.cards, card.defId);
  const cardUid = card.uid;
  const target = toTarget(slot);
  if (def.kind === 'energy') return powerPlay(view, card, slot) ?? { type: 'ATTACH_ENERGY', cardUid, target };
  if (!isBenchable(def)) return { type: 'EVOLVE', cardUid, target };
  return target === 'active' ? { type: 'SET_ACTIVE', cardUid } : { type: 'PLAY_BENCH', cardUid, slot: target };
}

/** What dropping the card on a highlighted slot will do. */
export const targetLabel = (def: CardDef) => (def.kind === 'energy' ? 'Attach' : isBenchable(def) ? 'Play' : 'Evolve');
