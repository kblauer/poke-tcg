import CloseIcon from '@mui/icons-material/Close';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import AudioPlayer, { RHAP_UI } from 'react-h5-audio-player';
import 'react-h5-audio-player/lib/styles.css';
import { duration, groupByGame, MUSIC_GENERATIONS, playlist, type GenFilter, type Track } from '../utils/music';

/** localStorage key for the player's settings and the last track. */
const PREFS_KEY = 'poke-tcg.music';

interface MusicPrefs {
  open: boolean;
  gen: GenFilter;
  shuffle: boolean;
  /** The volume slider, 0–1 (the audio plays at MAX_VOLUME of it). */
  volume: number;
  /** The last track played (its URL), ready to play again on the next visit. */
  track: string | null;
}

/** The loudest the songs play, at the slider's top (agreed with the user: half the audio's full volume). */
const MAX_VOLUME = 0.5;

const DEFAULTS: MusicPrefs = { open: false, gen: null, shuffle: false, volume: 0.5, track: null };

function loadPrefs(): MusicPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<MusicPrefs> | null;
    return saved ? { ...DEFAULTS, ...saved } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(prefs: MusicPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered; the player starts from its defaults next time.
  }
}

const iconButton = 'flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-100';

/** Three bars bouncing up and down (`.playing-bars` in index.css), beside the song playing in the list. */
const PlayingBars = () => (
  <span className="playing-bars" aria-hidden>
    <span />
    <span />
    <span />
  </span>
);

/**
 * The music player, at the bottom right of every page: a small bar with the track playing and play/pause, which pops out
 * for the track controls (react-h5-audio-player: seek, previous/next, repeat, shuffle, volume) and the song list. The list
 * shows one generation or all, game by game, each game's other music apart from its battle music; each song's play button
 * plays it at once (clicking the song itself only selects it, leaving what's playing alone), and when one ends the next in the list plays (a random one with shuffle). The tracks (public/music/tracks.json) are
 * loaded once the player is first used. The audio stays mounted while the panel is closed, so music plays on across pages.
 * Settings and the last track are remembered in localStorage (`poke-tcg.music`); nothing plays until clicked.
 */
export function MusicPlayer() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const update = (change: Partial<MusicPrefs>) => setPrefs((p) => ({ ...p, ...change }));
  useEffect(() => savePrefs(prefs), [prefs]);
  // Only fetched once the player has been opened or has a track to resume.
  const [wanted, setWanted] = useState(prefs.open || prefs.track !== null);
  const tracks = useQuery({
    queryKey: ['music-tracks'],
    queryFn: async () => {
      const res = await fetch('/music/tracks.json');
      if (!res.ok) throw new Error(`Couldn't load the song list (${res.status})`);
      return (await res.json()) as Track[];
    },
    enabled: wanted,
    staleTime: Infinity,
  });
  const list = useMemo(() => playlist(tracks.data ?? [], prefs.gen), [tracks.data, prefs.gen]);
  const current = useMemo(() => tracks.data?.find((t) => t.url === prefs.track) ?? null, [tracks.data, prefs.track]);
  const player = useRef<AudioPlayer>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The song clicked in the list (its URL): only highlighted; its play button is what plays it. */
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /** Set when a song is chosen to play: the effect below starts it once its audio is in place. */
  const startNext = useRef(false);
  const play = (track: Track) => {
    setError(null);
    startNext.current = true;
    if (track.url === prefs.track) startPlaying();
    else update({ track: track.url });
  };
  const startPlaying = () => {
    const audio = player.current?.audio.current;
    if (!audio || !startNext.current) return;
    startNext.current = false;
    audio.play().catch((e: unknown) => {
      // A newer choice interrupting this one isn't an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError("This song couldn't be played.");
    });
  };
  // Starts the chosen song as soon as its audio has it: also the first one, whose player (and audio) has only just
  // appeared, which the player's own autoplay (only on a change of song) would leave paused.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(startPlaying, [current]);
  /** The next (or previous) song in the list shown; with shuffle, any other one at random. */
  const step = (by: 1 | -1) => {
    if (!list.length) return;
    const i = current ? list.indexOf(current) : -1;
    if (prefs.shuffle && list.length > 1) {
      const others = list.filter((t) => t !== current);
      return play(others[Math.floor(Math.random() * others.length)]!);
    }
    play(list[i < 0 ? 0 : (i + by + list.length) % list.length]!);
  };
  const togglePlay = () => {
    const audio = player.current?.audio.current;
    if (!current) {
      setWanted(true);
      if (list[0]) play(list[0]);
      else update({ open: true });
    } else if (audio?.paused) void audio.play();
    else audio?.pause();
  };

  // The audio plays at MAX_VOLUME of the slider (the player's own volume bar is replaced, as it sets the audio's volume directly).
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const audio = player.current?.audio.current;
    if (!audio) return;
    audio.volume = prefs.volume * MAX_VOLUME;
    audio.muted = muted;
  }, [prefs.volume, muted, current]);

  // Opening the panel scrolls the song playing into view.
  useEffect(() => {
    if (prefs.open) listRef.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'center' });
  }, [prefs.open, prefs.gen, tracks.data]);

  return (
    // Clicks here don't cancel a move in progress on the board (the Board's outside-click listener).
    <div data-keep-action className="fixed bottom-4 right-4 z-[1300] flex flex-col items-end gap-2">
      <section
        aria-label="Music player"
        className={`${prefs.open ? 'flex' : 'hidden'} max-h-[min(42rem,calc(100vh-6rem))] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg bg-slate-800 shadow-xl ring-1 ring-slate-600`}
      >
        <div className="flex items-start gap-2 px-4 pt-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{current?.title ?? 'Pick a song'}</p>
            <p className="truncate text-xs text-slate-400">{current ? `${current.game} · Gen ${current.gen}${current.battle ? ' · Battle' : ''}` : 'Pokémon game music, generations 1–5'}</p>
          </div>
          <button className={iconButton} onClick={() => update({ open: false })} aria-label="Close the music player" title="Close">
            <CloseIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
        {current && (
          <AudioPlayer
            ref={player}
            className="music-player"
            src={current.url}
            preload="none"
            autoPlayAfterSrcChange={false}
            volume={prefs.volume * MAX_VOLUME}
            showSkipControls
            showJumpControls={false}
            onClickNext={() => step(1)}
            onClickPrevious={() => step(-1)}
            onEnded={() => step(1)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setError("This song couldn't be loaded.")}
            customVolumeControls={[
              <div key="volume" className="flex items-center gap-1">
                <button className={iconButton} onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
                  {muted || prefs.volume === 0 ? <VolumeOffIcon sx={{ fontSize: 20 }} /> : <VolumeUpIcon sx={{ fontSize: 20 }} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={prefs.volume}
                  onChange={(e) => {
                    setMuted(false);
                    update({ volume: Number(e.target.value) });
                  }}
                  aria-label="Volume"
                  className="h-1 w-20 cursor-pointer accent-yellow-300"
                />
              </div>,
            ]}
            customAdditionalControls={[
              RHAP_UI.LOOP,
              <button
                key="shuffle"
                className={`${iconButton} ${prefs.shuffle ? 'text-yellow-300 hover:text-yellow-200' : ''}`}
                onClick={() => update({ shuffle: !prefs.shuffle })}
                aria-pressed={prefs.shuffle}
                title={prefs.shuffle ? 'Shuffle on' : 'Shuffle off'}
              >
                <ShuffleIcon sx={{ fontSize: 20 }} />
              </button>,
            ]}
          />
        )}
        {error && <p className="px-4 pb-1 text-xs text-amber-300">{error}</p>}

        <div role="radiogroup" aria-label="Generation" className="flex flex-wrap gap-1 border-t border-slate-700 px-4 py-2 text-xs">
          {[null, ...MUSIC_GENERATIONS].map((gen) => (
            <button
              key={gen ?? 'all'}
              role="radio"
              aria-checked={prefs.gen === gen}
              onClick={() => update({ gen })}
              className={`rounded px-2 py-1 transition ${prefs.gen === gen ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
            >
              {gen === null ? 'All' : `Gen ${gen}`}
            </button>
          ))}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {tracks.error && <p className="px-2 text-sm text-red-400">{tracks.error.message}</p>}
          {!tracks.data && !tracks.error && <p className="px-2 text-sm text-slate-400">Loading songs…</p>}
          {groupByGame(list).map((g) => (
            <div key={g.game} className="pt-2">
              <p className="sticky top-0 z-10 bg-slate-800 px-2 py-1 text-sm font-semibold text-yellow-300">
                {g.game} {prefs.gen === null && <span className="text-xs font-normal text-slate-500">Gen {g.gen}</span>}
              </p>
              {[
                { label: 'Music', songs: g.music },
                { label: 'Battle', songs: g.battle },
              ].map(
                ({ label, songs }) =>
                  songs.length > 0 && (
                    <div key={label}>
                      <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      <ul>
                        {songs.map((t) => {
                          const isCurrent = t === current;
                          const isSelected = t.url === selected;
                          return (
                            <li
                              key={t.url}
                              data-current={isCurrent || undefined}
                              className={`flex items-center gap-1 rounded pl-1 text-sm transition ${isSelected ? 'bg-slate-700 ring-1 ring-slate-500' : 'hover:bg-slate-700/60'} ${isCurrent ? 'text-yellow-200' : 'text-slate-300'}`}
                            >
                              {/* The only way to play a song from the list: it starts at once. */}
                              <button
                                className={`${iconButton} h-6 w-6 ${isCurrent ? 'text-yellow-300 hover:text-yellow-200' : ''}`}
                                onClick={() => play(t)}
                                aria-label={`Play ${t.title}`}
                                title={isCurrent && playing ? 'Playing' : 'Play'}
                              >
                                {isCurrent && playing ? <PlayingBars /> : <PlayArrowIcon sx={{ fontSize: 18 }} />}
                              </button>
                              {/* Clicking the song only selects it: what's playing and the controls above stay as they are. */}
                              <button className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-2 text-left" onClick={() => setSelected(t.url)} aria-pressed={isSelected}>
                                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                                <span className="shrink-0 text-xs tabular-nums text-slate-500">{duration(t.seconds)}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ),
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-1 rounded-full bg-slate-800 py-1 pl-1 pr-1 shadow-lg ring-1 ring-slate-600">
        <button className={`${iconButton} rounded-full`} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon sx={{ fontSize: 20 }} /> : <PlayArrowIcon sx={{ fontSize: 20 }} />}
        </button>
        <button
          className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-sm text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
          onClick={() => {
            setWanted(true);
            update({ open: !prefs.open });
          }}
          aria-expanded={prefs.open}
          title={prefs.open ? 'Hide the music player' : 'Show the music player'}
        >
          <MusicNoteIcon sx={{ fontSize: 18 }} className={playing ? 'text-yellow-300' : undefined} />
          {current && <span className="max-w-48 truncate">{current.title}</span>}
        </button>
      </div>
    </div>
  );
}
