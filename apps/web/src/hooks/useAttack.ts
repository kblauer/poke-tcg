import {
  answerChoice,
  attackError,
  nextAttackChoice,
  type AttackChoices,
  type AttackSituation,
  type ChoiceSpec,
  type GameAction,
  type PlayerView,
} from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';

/**
 * Using an attack: clicking it either attacks straight away or first asks the attack's questions
 * (energy to discard, a target, a type…) one at a time. Esc cancels.
 */
export function useAttack({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const [choosing, setChoosing] = useState<{ attackIndex: number; choices: AttackChoices } | null>(null);
  const { self, opponent } = view;
  const situation: AttackSituation | null =
    self.active && opponent.active
      ? { attacker: self.active, defender: opponent.active, opponentBench: opponent.bench, ownBench: self.bench, ownDiscard: self.discard, cards: view.cards, turn: view.turn }
      : null;

  const cancel = () => setChoosing(null);
  // Done (or moot) once the game state moves on.
  useEffect(cancel, [view.version]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Asks the next question, or attacks once there are none left. */
  function proceed(attackIndex: number, choices: AttackChoices) {
    if (!situation) return;
    if (nextAttackChoice(situation, attackIndex, choices)) return setChoosing({ attackIndex, choices });
    setChoosing(null);
    send({ type: 'ATTACK', attackIndex, choices });
  }

  /** The question being asked now. */
  const spec: ChoiceSpec | null = choosing && situation ? nextAttackChoice(situation, choosing.attackIndex, choosing.choices) : null;

  /** Benched Pokémon clicked so far, for a question asking for several (Gigashock); reset for each new question. */
  const [benchPicked, setBenchPicked] = useState<number[]>([]);
  const questionKey = spec ? `${choosing!.attackIndex}:${spec.kind}:${spec.prompt}` : '';
  useEffect(() => setBenchPicked([]), [questionKey]);

  return {
    /** Index of the attack whose questions are being asked. */
    choosingIndex: spec ? choosing!.attackIndex : null,
    spec,
    /** Why the attack can't be used right now (energy, Special Conditions, card text), or null. */
    error: (attackIndex: number) => (situation ? attackError(situation, attackIndex) : 'No Defending Pokémon'),
    start: (attackIndex: number) => {
      if (!busy) proceed(attackIndex, {});
    },
    answer: (value: AttackChoices[keyof AttackChoices]) => {
      if (choosing && spec) proceed(choosing.attackIndex, answerChoice(choosing.choices, spec, value));
    },
    benchPicked,
    /** Picks or unpicks one of the opponent's benched Pokémon, keeping at most as many as the question asks for. */
    toggleBench: (slot: number) => {
      const count = spec?.kind === 'opponentBenchMany' ? spec.count : 1;
      setBenchPicked((p) => (p.includes(slot) ? p.filter((s) => s !== slot) : [...p, slot].slice(-count)));
    },
    cancel,
  };
}

export type AttackControl = ReturnType<typeof useAttack>;
