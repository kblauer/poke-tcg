import { healedJingle, practiceMusic, runMusic, victoryMusic } from '@poke-tcg/campaign';
import { useEffect, useRef } from 'react';
import { useMusicCue, useMusicSettings, usePlayJingle } from '../components/MusicPlayer';
import type { ClientRun } from './useRun';

/**
 * Auto play during a run (the run page and its battles): the song for where the run stands (`runMusic`), and the
 * Pokémon Center's jingle when Nurse Joy heals (the run's HP up as its center encounter ends). A beaten run's victory
 * theme once, then its album's music shuffled (`victoryMusic`); nothing new once a run is lost.
 */
export function useRunMusic(run: ClientRun | null | undefined) {
  const view = run?.view;
  const soundtrack = useMusicSettings()?.soundtrack ?? 'remastered';
  const playing = view && view.phase !== 'won' && view.phase !== 'lost' ? view : null;
  useMusicCue(playing ? runMusic(playing, soundtrack) : run && view?.phase === 'won' ? victoryMusic(view.type, soundtrack, run.id) : null);
  const playJingle = usePlayJingle();
  const last = useRef(view);
  useEffect(() => {
    const before = last.current;
    last.current = view;
    if (before && view && before.encounter?.kind === 'center' && view.hp > before.hp) playJingle?.(healedJingle(view.type, soundtrack));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
}

/** Auto play in a Training battle: its opponent's theme. */
export function usePracticeMusic(opponent: string | null, gameId: string) {
  const soundtrack = useMusicSettings()?.soundtrack ?? 'remastered';
  useMusicCue(practiceMusic(opponent, soundtrack, gameId));
}
