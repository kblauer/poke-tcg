import { healedJingle, practiceMusic, runMusic } from '@poke-tcg/campaign';
import { useEffect, useRef } from 'react';
import { useMusicCue, useMusicSettings, usePlayJingle } from '../components/MusicPlayer';
import type { RunViewData } from './useRun';

/**
 * Auto play during a run (the run page and its battles): the song for where the run stands (`runMusic`), and the
 * Pokémon Center's jingle when Nurse Joy heals (the run's HP up as its center encounter ends). Nothing once it's over.
 */
export function useRunMusic(view: RunViewData | null | undefined) {
  const soundtrack = useMusicSettings()?.soundtrack ?? 'original';
  const playing = view && view.phase !== 'won' && view.phase !== 'lost' ? view : null;
  useMusicCue(playing && runMusic(playing, soundtrack));
  const playJingle = usePlayJingle();
  const last = useRef(view);
  useEffect(() => {
    const before = last.current;
    last.current = view;
    if (before && view && before.encounter?.kind === 'center' && view.hp > before.hp) playJingle?.(healedJingle(view.type, soundtrack));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
}

/** Auto play in a Practice battle: its opponent's theme. */
export function usePracticeMusic(opponent: string | null, gameId: string) {
  const soundtrack = useMusicSettings()?.soundtrack ?? 'original';
  useMusicCue(practiceMusic(opponent, soundtrack, gameId));
}
