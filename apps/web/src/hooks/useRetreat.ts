import { energyProvided, hasBenched, retreatCost, retreatError, type CardInstance, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { occupiedSlots, toTarget, type SlotId } from '../utils/slots';
import { isMyTurn } from '../utils/turn';

/**
 * Retreating the active Pokémon: start, choose which energy to discard when it matters,
 * then click a benched Pokémon to switch in. Esc cancels.
 */
export function useRetreat({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const { active } = view.self;
  const [retreating, setRetreating] = useState(false);
  /** Energy picked to discard, when there's a choice. */
  const [chosen, setChosen] = useState<string[]>([]);

  // Both sides, for powers that change it (Retreat Aid), and the Stadium (The Rocket's Training Gym).
  const cost = active ? retreatCost(active, view.cards, [view.self, view.opponent], view.stadium?.card) : 0;
  const energy = active?.energy ?? [];
  const amount = (e: CardInstance) => energyProvided(e, view.cards).amount;
  const total = energy.reduce((sum, e) => sum + amount(e), 0);
  // Only ask which energy to discard when the choice changes what's left.
  const types = new Set(energy.map((e) => e.defId));
  const needsChoice = cost > 0 && cost < total && (types.size > 1 || energy.some((e) => e.provides));
  const discard = needsChoice ? chosen : cheapestDiscard(energy, cost, amount);
  const picked = energy.filter((e) => discard.includes(e.uid)).map(amount);
  const pickedTotal = picked.reduce((a, b) => a + b, 0);
  // Enough to pay, and no card more than needed (the engine's rule).
  const ready = retreating && pickedTotal >= cost && !picked.some((a) => pickedTotal - a >= cost);

  /** Why the Retreat button is disabled; null when it can be used. */
  const blocked = !active
    ? 'No active Pokémon'
    : !isMyTurn(view)
      ? "It's not your turn"
      : retreatError(active, view.cards, hasBenched(view.self), view.retreatedThisTurn, [view.self, view.opponent], view.stadium?.card);

  const cancel = () => {
    setRetreating(false);
    setChosen([]);
  };

  // Done (or moot) once the game state moves on.
  useEffect(cancel, [view.version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Bench slots that can be switched in now. */
  const targets = new Set<SlotId>(ready ? occupiedSlots(view.self).filter((s) => s !== 'active') : []);

  return {
    retreating,
    cost,
    needsChoice,
    chosen,
    ready,
    blocked,
    targets,
    start: () => {
      if (busy || blocked) return;
      setChosen([]);
      setRetreating(true);
    },
    cancel,
    /** Energy picked so far, out of the cost. */
    pickedTotal,
    /** Picks or unpicks an energy card to discard. */
    toggleEnergy: (uid: string) => setChosen((c) => (c.includes(uid) ? c.filter((u) => u !== uid) : [...c, uid])),
    /** Click handler for a slot, when clicking it would switch that Pokémon in. */
    slotClick: (slot: SlotId) =>
      targets.has(slot) && !busy ? () => send({ type: 'RETREAT', slot: toTarget(slot) as number, energyUids: discard }) : undefined,
  };
}

export type Retreat = ReturnType<typeof useRetreat>;

/** Cards to discard when there's no real choice: biggest first until the cost is paid (never more than needed). */
function cheapestDiscard(energy: CardInstance[], cost: number, amount: (e: CardInstance) => number): string[] {
  const out: string[] = [];
  let paid = 0;
  for (const e of [...energy].sort((a, b) => amount(b) - amount(a))) {
    if (paid >= cost) break;
    out.push(e.uid);
    paid += amount(e);
  }
  return out;
}
