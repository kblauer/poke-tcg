import { hasBenched, retreatCost, retreatError, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
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

  const cost = active ? retreatCost(active, view.cards) : 0;
  const energy = active?.energy ?? [];
  // Only ask which energy to discard when the choice changes what's left.
  const types = new Set(energy.map((e) => e.defId));
  const needsChoice = cost > 0 && cost < energy.length && types.size > 1;
  const discard = needsChoice ? chosen : energy.slice(0, cost).map((e) => e.uid);
  const ready = retreating && discard.length === cost;

  /** Why the Retreat button is disabled; null when it can be used. */
  const blocked = !active
    ? 'No active Pokémon'
    : !isMyTurn(view)
      ? "It's not your turn"
      : retreatError(active, view.cards, hasBenched(view.self), view.retreatedThisTurn);

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
    /** Picks or unpicks an energy to discard; picking past the cost drops the oldest pick. */
    toggleEnergy: (uid: string) =>
      setChosen((c) => (c.includes(uid) ? c.filter((u) => u !== uid) : [...c, uid].slice(-cost))),
    /** Click handler for a slot, when clicking it would switch that Pokémon in. */
    slotClick: (slot: SlotId) =>
      targets.has(slot) && !busy ? () => send({ type: 'RETREAT', slot: toTarget(slot) as number, energyUids: discard }) : undefined,
  };
}

export type Retreat = ReturnType<typeof useRetreat>;
