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
import { useEscape } from './useEscape';

/**
 * Using an attack: clicking it either attacks straight away or first asks the attack's questions
 * (energy to discard, a target, a type…) one at a time. Esc cancels. `confirm` is given the attack, once every question
 * is answered, to send when it's sure (useTurnReminders' check: what the player could still do before the turn ends).
 */
export function useAttack({ view, send, busy, confirm = (go) => go() }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean; confirm?: (go: () => void) => void }) {
  const [choosing, setChoosing] = useState<{ attackIndex: number; choices: AttackChoices } | null>(null);
  const { self, opponent } = view;
  const situation: AttackSituation | null =
    self.active && opponent.active
      ? {
          attacker: self.active,
          defender: opponent.active,
          opponentBench: opponent.bench,
          ownBench: self.bench,
          ownDiscard: self.discard,
          ownHand: self.hand,
          opponentHandCount: opponent.handCount,
          lostZones: [...(self.lostZone ?? []), ...(opponent.lostZone ?? [])],
          cards: view.cards,
          turn: view.turn,
          stadium: view.stadium?.card ?? null,
          recall: !!self.recall,
          powersOff: self.powersOffUntil !== undefined || opponent.powersOffUntil !== undefined,
          opponentPrizes: opponent.prizeCount,
          ownPrizes: self.prizeCount,
        }
      : null;

  const cancel = () => setChoosing(null);
  // Done (or moot) once the game state moves on.
  useEffect(cancel, [view.version]);
  useEscape(cancel);

  /** Asks the next question, or attacks once there are none left. */
  function proceed(attackIndex: number, choices: AttackChoices) {
    if (!situation) return;
    if (nextAttackChoice(situation, attackIndex, choices)) return setChoosing({ attackIndex, choices });
    setChoosing(null);
    confirm(() => send({ type: 'ATTACK', attackIndex, choices }));
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
    /** How many of the opponent's Pokémon the question wants: all of them if there are fewer, unless one may be picked again (Rock Blast). */
    benchCount: spec?.kind === 'opponentBenchMany' ? (spec.repeat ? spec.count : Math.min(spec.count, spec.options.length)) : 0,
    /** Picks or unpicks one of the opponent's benched Pokémon, keeping at most as many as the question asks for (`repeat`: every click is another pick). */
    toggleBench: (slot: number) => {
      const count = spec?.kind === 'opponentBenchMany' ? spec.count : 1;
      const repeat = spec?.kind === 'opponentBenchMany' && spec.repeat;
      setBenchPicked((p) => (p.includes(slot) && !repeat ? p.filter((s) => s !== slot) : [...p, slot].slice(-count)));
    },
    cancel,
  };
}

export type AttackControl = ReturnType<typeof useAttack>;
