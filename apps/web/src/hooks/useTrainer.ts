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
 * Play button, or played at once when dropped on the play area. A question answered by a single
 * click in the hand or on the board has no dialog, just a `prompt`. Esc cancels.
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
    stadium: view.stadium?.card ?? null,
  });

  const cancel = () => setPlaying(null);
  useEffect(cancel, [view.version]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Chaos Gym, on the CPU's tails: the card it couldn't play, which the player may play now. */
  const pending = view.self.pendingChoice;
  const borrowed = pending?.kind === 'options' ? pending.playable : undefined;
  /** Why a Trainer card in the hand can't be played now; null if it can. */
  const error = (card: CardInstance) =>
    card.uid === borrowed ? trainerError(situation(card)) : !isMyTurn(view) ? "It's not your turn" : view.self.pendingChoice ? 'Finish your search first' : trainerError(situation(card));

  const card = playing && view.self.hand.find((c) => c.uid === playing.cardUid);
  const spec = card ? nextTrainerChoice(situation(card), playing!.choices) : null;

  /** Cards picked so far in the hand, for a question about hand cards; reset for each new question. */
  const [handPicked, setHandPicked] = useState<string[]>([]);
  const questionKey = spec ? `${playing!.cardUid}:${spec.field}:${spec.prompt}` : '';
  useEffect(() => setHandPicked([]), [questionKey]);

  function answer(value: TrainerChoices[keyof TrainerChoices]) {
    if (!playing || !spec || !card || busy) return;
    const choices = { ...playing.choices, [spec.field]: value };
    if (nextTrainerChoice(situation(card), choices)) return setPlaying({ ...playing, choices });
    send({ type: 'PLAY_TRAINER', cardUid: playing.cardUid, choices });
    setPlaying(null);
  }

  /**
   * A question answered by clicking cards in the hand (Computer Search's discards, Pokémon Breeder's
   * Stage 2…): which cards can be picked, the ones picked so far, and how many are needed. A single
   * card is answered as soon as it's clicked; more are confirmed with the panel's Choose button.
   */
  const handPick =
    spec?.kind === 'cards' && spec.field === 'handUids'
      ? {
          options: new Set(spec.options.map((c) => c.uid)),
          picked: new Set(handPicked),
          min: spec.min,
          max: spec.max,
          toggle(uid: string) {
            if (spec.min === 1 && spec.max === 1) return answer([uid]);
            setHandPicked((p) => (p.includes(uid) ? p.filter((u) => u !== uid) : [...p, uid].slice(-spec.max)));
          },
          confirm() {
            if (handPicked.length >= spec.min && handPicked.length <= spec.max) answer(handPicked);
          },
        }
      : null;

  /**
   * The instruction for a question answered entirely outside the dialog (one card clicked in the hand, or a
   * Pokémon on the board), shown as a prompt toast instead of the dialog; null when the dialog is needed.
   */
  const name = card ? lookupCard(view.cards, card.defId).name : '';
  const where =
    spec?.kind === 'pokemon'
      ? `one of ${spec.side === 'own' ? 'your' : "the CPU's"} highlighted Pokémon`
      : handPick && handPick.min === 1 && handPick.max === 1
        ? 'a highlighted card in your hand'
        : null;
  const prompt = spec && where && card && !error(card) ? `${name}: ${spec.prompt}. Click ${where} (Esc to cancel)` : null;

  return {
    /** The Trainer being played, if any. */
    card: card ?? null,
    prompt,
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
    answer,
    handPick,
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
