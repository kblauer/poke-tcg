import { battleMusic, healedJingle, practiceMusic, runMusicOn, victoryMusic } from '@poke-tcg/campaign';
import { useEffect, useRef } from 'react';
import { useMusicCue, useMusicSettings, usePlayJingle } from '../components/MusicPlayer';
import { useRun } from './useRun';
import { useRunMaps } from './useRunMaps';

/**
 * Auto play during a run (the run page and its battles): the song for where the run stands (`runMusic`; a battle's from
 * the click that chooses it, useRun's `spotted`), and the Pokémon Center's jingle when Nurse Joy heals (the run's HP up
 * as its center encounter ends). A beaten run's victory theme once, then its album's music shuffled (`victoryMusic`);
 * nothing new once a run is lost. The run's song waits for its maps (useRunMaps: the route it's on).
 */
export function useRunMusic() {
  const { run, spotted } = useRun();
  const view = run?.view;
  const soundtrack = useMusicSettings()?.soundtrack ?? 'remastered';
  const playing = run && view && view.phase !== 'won' && view.phase !== 'lost' ? view : null;
  const { maps } = useRunMaps(playing?.type);
  useMusicCue(playing && run ? (maps ? runMusicOn(maps, playing, soundtrack, run.id, spotted) : null) : run && view?.phase === 'won' ? victoryMusic(view.type, soundtrack, run.id) : null);
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

/** Auto play in a Battle Tower battle: a trainer's battle theme of its floor's generation (none until it's known). */
export function useTowerBattleMusic(gen: number | null, gameId: string) {
  const soundtrack = useMusicSettings()?.soundtrack ?? 'remastered';
  useMusicCue(gen ? battleMusic(gen, soundtrack, 'battle', gameId) : null);
}
