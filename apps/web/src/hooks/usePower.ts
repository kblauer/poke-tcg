import {
  lookupCard,
  nextPowerChoice,
  ownTargets,
  pokemonAt,
  powerEffect,
  powerError,
  type GameAction,
  type PlayerView,
  type PokemonCardDef,
  type PowerChoices,
  type PowerSituation,
  type Target,
} from '@poke-tcg/game-engine';
import { useEffect, useState } from 'react';
import { isMyTurn } from '../utils/turn';

/**
 * Using Pokémon Powers: lists the powers of the player's Pokémon in play, and runs one by asking
 * its questions one at a time (like useAttack). The active's power is a button under its attacks;
 * a benched Pokémon's is used by clicking the Pokémon, then its Activate button. Esc cancels.
 */
export function usePower({ view, send, busy }: { view: PlayerView; send: (a: GameAction) => void; busy: boolean }) {
  const [using, setUsing] = useState<{ source: Target; choices: PowerChoices } | null>(null);
  /** Benched Pokémon clicked to show its Activate button. */
  const [selected, setSelected] = useState<number | null>(null);
  const situation = (source: Target): PowerSituation => ({ me: view.self, source, cards: view.cards, turn: view.turn });

  const cancel = () => {
    setUsing(null);
    setSelected(null);
  };
  useEffect(cancel, [view.version]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function proceed(source: Target, choices: PowerChoices) {
    if (nextPowerChoice(situation(source), choices)) return setUsing({ source, choices });
    setUsing(null);
    send({ type: 'USE_POWER', source, choices });
  }

  /** Powers that are used (not ones that only react, like Strikes Back), with why each is unusable now. */
  const powers = ownTargets(view.self).flatMap((source) => {
    const pokemon = pokemonAt(view.self, source)!;
    const def = lookupCard(view.cards, pokemon.card.defId) as PokemonCardDef;
    if (!def.power || !powerEffect(def.id)?.use) return [];
    const error = !isMyTurn(view) ? "It's not your turn" : powerError(situation(source));
    return [{ source, pokemon: def.name, name: def.power.name, text: def.power.text, error }];
  });

  const spec = using ? nextPowerChoice(situation(using.source), using.choices) : null;

  return {
    powers,
    /** The power whose questions are being asked. */
    usingSource: spec ? using!.source : null,
    spec,
    start: (source: Target) => {
      if (busy) return;
      setSelected(null);
      proceed(source, {});
    },
    /** The benched Pokémon whose Activate button is shown. */
    selected,
    /** Shows (or, clicked again, hides) the Activate button of a benched Pokémon with a power. */
    select: (slot: number) => setSelected((s) => (s === slot ? null : slot)),
    answer: (value: PowerChoices[keyof PowerChoices]) => {
      if (using && spec) proceed(using.source, { ...using.choices, [spec.field]: value });
    },
    cancel,
  };
}

export type PowerControl = ReturnType<typeof usePower>;
