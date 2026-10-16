import {
  lookupCard,
  nextTrainerChoice,
  trainerError,
  type CardInstance,
  type GameAction,
  type PlayerView,
  type TrainerChoices,
  type TrainerSituation,
} from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { isMyTurn } from '../utils/turn';

/**
 * Playing a Trainer card: clicking it in the hand opens its questions (cards to discard, a target…)
 * one at a time, and answering the last one plays it. One with no questions is confirmed with a
 * Play button, or played at once when dropped on the play area. Esc cancels.
 */
export function useTrainer({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const [playing, setPlaying] = useState<{ cardUid: string; choices: TrainerChoices } | null>(null);

  const situation = (card: CardInstance): TrainerSituation => ({
    card,
    me: view.self,
    opp: view.opponent,
    deckCount: view.self.deckCount,
    cards: view.cards,
    turn: view.turn,
  });

  const cancel = () => setPlaying(null);
  useEffect(cancel, [view.version]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Why a Trainer card in the hand can't be played now; null if it can. */
  const error = (card: CardInstance) => (!isMyTurn(view) ? "It's not your turn" : view.self.pendingChoice ? 'Finish your search first' : trainerError(situation(card)));

  const card = playing && view.self.hand.find((c) => c.uid === playing.cardUid);
  const spec = card ? nextTrainerChoice(situation(card), playing!.choices) : null;

  return {
    /** The Trainer being played, if any. */
    card: card ?? null,
    def: card ? lookupCard(view.cards, card.defId) : null,
    spec,
    error,
    isTrainer: (card: CardInstance) => lookupCard(view.cards, card.defId).kind === 'trainer',
    start(card: CardInstance) {
      if (busy) return;
      setPlaying(playing?.cardUid === card.uid ? null : { cardUid: card.uid, choices: {} });
    },
    /** Dropped on the play area: plays it straight away, or opens its questions if it has any. */
    drop(card: CardInstance) {
      if (busy || error(card)) return;
      if (nextTrainerChoice(situation(card), {})) setPlaying({ cardUid: card.uid, choices: {} });
      else send({ type: 'PLAY_TRAINER', cardUid: card.uid, choices: {} });
    },
    /** Answers the current question; the last answer plays the card without a separate Play click. */
    answer(value: TrainerChoices[keyof TrainerChoices]) {
      if (!playing || !spec || !card || busy) return;
      const choices = { ...playing.choices, [spec.field]: value };
      if (nextTrainerChoice(situation(card), choices)) return setPlaying({ ...playing, choices });
      send({ type: 'PLAY_TRAINER', cardUid: playing.cardUid, choices });
      setPlaying(null);
    },
    /** Plays it once every question is answered. */
    play() {
      if (!playing || spec || busy) return;
      send({ type: 'PLAY_TRAINER', cardUid: playing.cardUid, choices: playing.choices });
      setPlaying(null);
    },
    cancel,
  };
}

export type TrainerControl = ReturnType<typeof useTrainer>;
