import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useRef } from 'react';
import { saveVolume } from './minigameSound';

/**
 * The minigames' sound volume (under a minigame's screen; the music's is the music player's own), remembered in this
 * browser and the same for every minigame: a slider, and the speaker beside it silencing the sounds and back.
 * `onTouch`: called on any change (browsers start audio only after a click: the sounds' resume).
 */
export function MinigameVolume({ volume, onChange, onTouch }: { volume: number; onChange: (volume: number) => void; onTouch?: () => void }) {
  // The volume before the speaker silenced it, for turning it back on.
  const loudBefore = useRef(0);
  const set = (v: number) => {
    onChange(v);
    saveVolume(v);
    onTouch?.();
  };
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded text-slate-300 transition hover:bg-slate-700 hover:text-slate-50"
        onClick={() => {
          if (volume) loudBefore.current = volume;
          set(volume ? 0 : loudBefore.current || 70);
        }}
        aria-label={volume ? 'Silence the sounds' : 'Turn the sounds back on'}
        title={volume ? 'Silence the sounds' : 'Turn the sounds back on'}
      >
        {volume ? <VolumeUpIcon sx={{ fontSize: 18 }} /> : <VolumeOffIcon sx={{ fontSize: 18 }} />}
      </button>
      <span className="sr-only">Sound volume</span>
      <input type="range" min={0} max={100} value={volume} onChange={(e) => set(Number(e.target.value))} className="w-32 accent-yellow-300" aria-label="Sound volume" />
      <span className="w-8 tabular-nums">{volume}%</span>
    </label>
  );
}
