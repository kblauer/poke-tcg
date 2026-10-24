import AutoModeIcon from '@mui/icons-material/AutoMode';
import CloseIcon from '@mui/icons-material/Close';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RepeatIcon from '@mui/icons-material/Repeat';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { pickSong, type MusicCue, type Song, type Soundtrack } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type AudioPlayerElement from 'react-h5-audio-player';
import { registerSetting, saveSetting } from '../utils/accountSettings';
import { duration, groupByGame, MUSIC_GENERATIONS, playlist, type GenFilter, type Track } from '../utils/music';

// The audio player (and its styles) loads the first time a song is picked, not with every page.
const AudioPlayer = lazy(async () => {
  await import('react-h5-audio-player/lib/styles.css');
  return import('react-h5-audio-player');
});
import { ICON_BUTTON } from '../utils/styles';

/** localStorage key for the player's settings and the last track. */
const PREFS_KEY = 'poke-tcg.music';

interface MusicPrefs {
  open: boolean;
  gen: GenFilter;
  shuffle: boolean;
  /** Repeat: the song playing starts again when it ends, instead of the next. */
  repeat: boolean;
  /** The volume slider, 0–1 (the audio plays at MAX_VOLUME of it). */
  volume: number;
  /** The last track played (its URL), ready to play again on the next visit. */
  track: string | null;
  /** Auto play: the music follows the run (and Training battles), looping the song that suits it (`MusicCue`). */
  autoplay: boolean;
  /** Auto play's songs: the original games' or their remakes'. */
  soundtrack: Soundtrack;
}

/** The loudest the songs play, at the slider's top (agreed with the user: half the audio's full volume). */
const MAX_VOLUME = 0.5;

/** How long a song takes to fade out before the next, and the next to fade in. */
const FADE_MS = 1000;

// Auto play on and the Remastered soundtrack by default (agreed 2026-10-23).
const DEFAULTS: MusicPrefs = { open: false, gen: null, shuffle: false, repeat: false, volume: 0.5, track: null, autoplay: true, soundtrack: 'remastered' };

/** Auto play and its soundtrack as the account keeps them (utils/accountSettings): the browser's, or null when it has none saved. */
function storedAutoplay(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<MusicPrefs> | null;
    return saved && (saved.autoplay !== undefined || saved.soundtrack !== undefined) ? JSON.stringify({ autoplay: saved.autoplay ?? DEFAULTS.autoplay, soundtrack: saved.soundtrack ?? DEFAULTS.soundtrack }) : null;
  } catch {
    return null;
  }
}

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

const iconButton = `${ICON_BUTTON} shrink-0`;

/** Three bars bouncing up and down (`.playing-bars` in index.css), beside the song playing in the list. */
const PlayingBars = () => (
  <span className="playing-bars" aria-hidden>
    <span />
    <span />
    <span />
  </span>
);

/** What MusicControls shows and does: whether music is playing, the song, play/pause, and opening the player's panel. */
interface MusicState {
  playing: boolean;
  title: string | null;
  open: boolean;
  togglePlay: () => void;
  toggleOpen: () => void;
  autoplay: boolean;
  soundtrack: Soundtrack;
  setAutoplay: (on: boolean) => void;
  setSoundtrack: (soundtrack: Soundtrack) => void;
  /** What the page on screen wants auto play to play (null: nothing, the song playing plays on). */
  setCue: (cue: MusicCue | null) => void;
  /** A jingle (the Pokémon Center's), then back to the song it interrupted, where it was. Only while music plays. */
  playJingle: (song: Song) => void;
  /** The music's tempo (1: as recorded), its pitch kept, whatever plays: the Berry Blender's speed-up (useMusicTempo). */
  setTempo: (rate: number) => void;
  /** Pauses the song playing (true) and plays it on again where it was (false): a minigame's fanfare (useMusicHold). */
  hold: (on: boolean) => void;
}

const MusicContext = createContext<MusicState | null>(null);

/** Auto play's settings (on the Settings page and the player), or null outside the music player (signed out). */
export function useMusicSettings() {
  const music = useContext(MusicContext);
  return music && { autoplay: music.autoplay, soundtrack: music.soundtrack, setAutoplay: music.setAutoplay, setSoundtrack: music.setSoundtrack };
}

/** Tells auto play what suits the page while it's on screen (a run, a battle); as NavLog's useGameLogInNav does. */
export function useMusicCue(cue: MusicCue | null) {
  const setCue = useContext(MusicContext)?.setCue;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setCue?.(cue), [setCue, cue?.key]);
  useEffect(() => () => setCue?.(null), [setCue]);
}

export const usePlayJingle = () => useContext(MusicContext)?.playJingle ?? null;

/**
 * Sets the music's tempo (1 as recorded, its pitch kept) while the page using it is on screen, back to 1 when it goes:
 * the Berry Blender's, speeding up with the blender as the game's does (`blenderTempo`). Null outside the music player.
 */
export function useMusicTempo() {
  const setTempo = useContext(MusicContext)?.setTempo ?? null;
  useEffect(() => () => setTempo?.(1), [setTempo]);
  return setTempo;
}

/**
 * Pauses the music for a while and plays it on again where it was, as the GBA's PlayFanfare does (the Game Corner's
 * fanfares and Reel Time's song): `hold(true)` pauses the song playing (nothing if none plays), `hold(false)` plays it on;
 * let go of when the page using it goes. A no-op outside the music player.
 */
export function useMusicHold() {
  const hold = useContext(MusicContext)?.hold;
  useEffect(() => () => hold?.(false), [hold]);
  return useCallback((on: boolean) => hold?.(on), [hold]);
}

/**
 * The music player's small bar: play/pause and the song playing (only the note while nothing plays), which opens the player's panel. In the top bar's right
 * end on a big screen (main.tsx, the user's), or (`MusicProvider`'s `docked`) in a menu: the site's ☰ menu, or the phone
 * battle screen's. `onOpen`: called when it opens the panel (a menu closes itself, so the panel can be seen).
 */
export function MusicControls({ onOpen }: { onOpen?: () => void }) {
  const music = useContext(MusicContext);
  if (!music) return null;
  const { playing, title, open, togglePlay, toggleOpen } = music;
  const openTitle = open ? 'Hide the music player' : 'Show the music player';
  return (
    // Clicks here don't cancel a move in progress on the board (the Board's outside-click listener).
    <div data-keep-action className="flex w-fit min-w-0 items-center gap-1 rounded-full bg-slate-800 p-1 shadow-lg ring-1 ring-slate-600">
      <button className={`${iconButton} rounded-full`} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
        {playing ? <PauseIcon sx={{ fontSize: 20 }} /> : <PlayArrowIcon sx={{ fontSize: 20 }} />}
      </button>
      <button
        className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 text-sm text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
        onClick={() => {
          if (!open) onOpen?.();
          toggleOpen();
        }}
        aria-expanded={open}
        title={!playing && title ? `${title} (${openTitle.toLowerCase()})` : openTitle}
      >
        <MusicNoteIcon sx={{ fontSize: 18 }} className={playing ? 'text-yellow-300' : undefined} />
        {/* Minimised to the two icons while nothing plays (the user's); the song's title in the tooltip. */}
        {playing && <span className="max-w-48 truncate">{title ?? 'Music'}</span>}
      </button>
    </div>
  );
}

/**
 * The music player, mounted with the layout so music plays on from page to page: a small bar (MusicControls) with the
 * track playing and play/pause, which pops out a panel for the track controls (react-h5-audio-player: seek, previous/next, repeat, shuffle, volume) and the song list. The list
 * shows one generation or all, game by game, each game's other music apart from its battle music; each song's play button
 * plays it at once (clicking the song itself only selects it, leaving what's playing alone), and when one ends the next in the list plays (a random one with shuffle). The tracks (public/music/tracks.json) are
 * loaded once the player is first used. The audio stays mounted while the panel is closed, so music plays on across pages.
 * Settings and the last track are remembered in localStorage (`poke-tcg.music`); nothing plays until clicked.
 * Auto play (its button beside shuffle, or the Settings page) follows the page instead: the run's map and battles, and
 * Training battles, tell it what suits them (useMusicCue, `runMusic` in campaign's music.ts), and it loops that song;
 * a Pokémon Center's heal plays its jingle first (usePlayJingle). Elsewhere the song playing plays on.
 * The bar is in the top bar (main.tsx), its panel opening under it on the right; `docked` (when the site's pages are in
 * its ☰ menu: a phone), the bar is in the menus instead and the panel opens at the bottom of the screen.
 */
export function MusicProvider({ children, docked }: { children: ReactNode; docked: boolean }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const update = (change: Partial<MusicPrefs>) => setPrefs((p) => ({ ...p, ...change }));
  useEffect(() => savePrefs(prefs), [prefs]);
  // Only fetched once the player has been opened, has a track to resume or plays by itself.
  const [wanted, setWanted] = useState(prefs.open || prefs.track !== null || prefs.autoplay);
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
  const player = useRef<AudioPlayerElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The song clicked in the list (its URL): only highlighted; its play button is what plays it. */
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fades between songs: the audio plays at the slider's volume times `gain`, which falls to 0 over FADE_MS before a song
  // is switched and rises again once the next one is playing (onPlaying). Timed with an interval, not animation frames,
  // which a hidden tab doesn't run: a switch must still happen with the site in the background.
  const gain = useRef(1);
  const level = useRef(prefs.volume * MAX_VOLUME);
  level.current = prefs.volume * MAX_VOLUME;
  const fading = useRef<number | null>(null);
  /** What a fade out does once it's silent (a switch of song); null while nothing waits for one. */
  const afterFade = useRef<(() => void) | null>(null);
  const setGain = (to: number) => {
    gain.current = to;
    const audio = player.current?.audio.current;
    if (audio) audio.volume = level.current * to;
  };
  const stopFade = () => {
    if (fading.current !== null) window.clearInterval(fading.current);
    fading.current = null;
    afterFade.current = null;
  };
  const fade = (to: number, then?: () => void) => {
    stopFade();
    afterFade.current = then ?? null;
    const from = gain.current;
    const began = performance.now();
    fading.current = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - began) / FADE_MS);
      setGain(from + (to - from) * t);
      if (t < 1) return;
      const done = afterFade.current;
      stopFade();
      done?.();
    }, 30);
  };
  useEffect(() => () => void (fading.current !== null && window.clearInterval(fading.current)), []);
  /**
   * Runs `change` (a switch of song) once the song playing has faded out; at once when none plays, the next song fading
   * in. `cut` (a battle's): at once and at full volume, no fade either way.
   */
  const fadeOutThen = (change: () => void, cut = false) => {
    const audio = player.current?.audio.current;
    if (audio && !audio.paused && !cut) return fade(0, change);
    stopFade();
    setGain(cut ? 1 : 0);
    change();
  };
  /** The switch a fade out was waiting for, made at once (the song ended, or was paused, before it was silent). */
  const finishFade = () => {
    const pending = afterFade.current;
    stopFade();
    pending?.();
  };

  /** Set when a song is chosen to play: the effect below starts it once its audio is in place. */
  const startNext = useRef(false);
  /** While a switch is made on pausing: the new song waits for play. */
  const pausing = useRef(false);
  const play = (track: Track) => {
    setError(null);
    inJingle.current = false;
    shuffling.current = null;
    if (track.url === prefs.track) {
      // Called off: a switch waiting for this song to fade out.
      if (afterFade.current) fade(1);
      startNext.current = true;
      return startPlaying();
    }
    fadeOutThen(() => {
      startNext.current = true;
      update({ track: track.url });
    });
  };
  const startPlaying = () => {
    const audio = player.current?.audio.current;
    if (!audio || !startNext.current || pausing.current) return;
    startNext.current = false;
    audio.play().catch((e: unknown) => {
      // A newer choice interrupting this one isn't an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError("This song couldn't be played.");
    });
  };

  // Auto play: the song the page on screen wants (useMusicCue), looped. Each song auto play leaves is remembered where it
  // was, and picks up from there when it comes back (the route's after a battle, the song a jingle interrupted), but a
  // cue's `fromStart` (a battle's) starts it over, once a cue, and its `cut` (a battle's too) switches without fading. A cue's `then` (a beaten run's victory theme) plays once a
  // session, then shuffles its album's music (`shuffling`), until another cue or a song picked from the list.
  const [cue, setCue] = useState<MusicCue | null>(null);
  const shuffling = useRef<string | null>(null);
  /** The `fromStart` cues already started (their keys): coming back to one (a page reloaded, the battle's page opening) doesn't start it over. */
  const begun = useRef(new Set<string>());
  const findSong = (song: Song) => tracks.data?.find((t) => t.game === song.game && t.title === song.title) ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cueTrack = useMemo(() => (prefs.autoplay && cue ? findSong(pickSong(cue)) : null), [prefs.autoplay, cue?.key, tracks.data]);
  const positions = useRef(new Map<string, number>());
  /** Where the song about to play starts (a song come back to). */
  const resumeAt = useRef(0);
  /** While a jingle plays: auto play waits for it to end before following the page again. */
  const inJingle = useRef(false);
  /** The song a jingle interrupted, gone back to after it when no page wants another. */
  const afterJingle = useRef<Track | null>(null);
  /**
   * Switches song, fading (but for a `cut`): `fromStart` plays it from the beginning (even the song playing), not where it
   * was left.
   */
  const switchTo = (track: Track, start: boolean, fromStart = false, cut = false) =>
    fadeOutThen(() => {
      const audio = player.current?.audio.current;
      if (current && audio) positions.current.set(current.url, audio.currentTime);
      startNext.current = start;
      if (track.url === prefs.track) {
        if (fromStart && audio) audio.currentTime = 0;
        fade(1);
        return startPlaying();
      }
      resumeAt.current = fromStart ? 0 : (positions.current.get(track.url) ?? 0);
      update({ track: track.url });
    }, cut);
  // A cue that starts the music (`start`: the Berry Blender's) plays it even when it was paused, and pauses it again when
  // that cue ends (`cueStarted`); any other only switches the song of music already playing.
  const cueStarted = useRef(false);
  useEffect(() => {
    if (!cueTrack || !cue || inJingle.current) return;
    const again = begun.current.has(cue.key);
    if (cue.then && again) return;
    if (!cue.then) shuffling.current = null;
    if (cue.fromStart) begun.current.add(cue.key);
    const fromStart = !!cue.fromStart && !again;
    const start = playing || !!cue.start;
    if (start && !playing) cueStarted.current = true;
    if (cueTrack.url !== prefs.track || fromStart) switchTo(cueTrack, start, fromStart, !!cue.cut && !again);
    else if (start && !playing) {
      startNext.current = true;
      startPlaying();
    } else if (afterFade.current) fade(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueTrack, cue?.key]);
  useEffect(() => {
    if (cue?.start || !cueStarted.current) return;
    cueStarted.current = false;
    player.current?.audio.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.key]);
  const playJingle = (song: Song) => {
    const jingle = findSong(song);
    if (!prefs.autoplay || !playing || !jingle || inJingle.current) return;
    inJingle.current = true;
    afterJingle.current = current;
    switchTo(jingle, true);
  };
  /**
   * A song over: a switch waiting for it to fade out made now; the jingle's back to what auto play wants (or the song it
   * interrupted); after a victory theme (or a song of the shuffle after it) another song of its album; auto play's song
   * again, the same one with repeat, or the list's next.
   */
  const ended = () => {
    if (afterFade.current) return finishFade();
    if (inJingle.current) {
      inJingle.current = false;
      const back = cueTrack ?? afterJingle.current;
      if (back) return switchTo(back, true);
    }
    const album = cue?.then && cueTrack && current === cueTrack ? cue.then.shuffle : shuffling.current;
    if (album) return shuffleFrom(album);
    const audio = player.current?.audio.current;
    if (((cueTrack && current === cueTrack) || prefs.repeat) && audio) {
      audio.currentTime = 0;
      return void audio.play();
    }
    step(1);
  };
  /** The shuffle after a victory theme: any of the album's music (not its battle music, nor the song just played), at random. */
  const shuffleFrom = (game: string) => {
    const songs = (tracks.data ?? []).filter((t) => t.game === game && !t.battle && !t.hidden && t !== current);
    const next = songs[Math.floor(Math.random() * songs.length)];
    if (!next) return step(1);
    play(next);
    shuffling.current = game;
  };

  // The tempo (setTempo): the audio's playback rate, its pitch kept; its default rate too, which a new song starts at.
  const tempo = useRef(1);
  const applyTempo = () => {
    const audio = player.current?.audio.current;
    if (!audio) return;
    audio.defaultPlaybackRate = tempo.current;
    audio.playbackRate = tempo.current;
  };
  const setTempo = useCallback((rate: number) => {
    if (tempo.current === rate) return;
    tempo.current = rate;
    applyTempo();
  }, []);

  // A hold (useMusicHold): the song playing paused, and played on when it's let go of, unless something else has played
  // or paused it meanwhile.
  const held = useRef(false);
  const hold = useCallback((on: boolean) => {
    const audio = player.current?.audio.current;
    if (on) {
      if (!audio || audio.paused) return;
      held.current = true;
      audio.pause();
    } else if (held.current) {
      held.current = false;
      if (audio?.paused) void audio.play().catch(() => {});
    }
  }, []);

  // Starts the chosen song as soon as its audio has it: also the first one, whose player (and audio) has only just
  // appeared, which the player's own autoplay (only on a change of song) would leave paused. A song come back to
  // starts where it was (set again once its audio has loaded, as loading starts it over).
  useEffect(() => {
    applyTempo();
    const audio = player.current?.audio.current;
    const at = resumeAt.current;
    resumeAt.current = 0;
    if (audio && at > 0) {
      const src = audio.src;
      audio.currentTime = at;
      audio.addEventListener('loadedmetadata', () => audio.src === src && (audio.currentTime = at), { once: true });
    }
    startPlaying();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
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
      const first = cueTrack ?? list[0];
      if (first) play(first);
      else update({ open: true });
    } else if (audio?.paused) void audio.play();
    else {
      audio?.pause();
      // A switch waiting for the song to fade out is made at once, the new song waiting for play.
      pausing.current = true;
      finishFade();
      pausing.current = false;
      startNext.current = false;
    }
  };

  // The audio plays at MAX_VOLUME of the slider (the player's own volume bar is replaced, as it sets the audio's volume directly).
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const audio = player.current?.audio.current;
    if (!audio) return;
    audio.volume = prefs.volume * MAX_VOLUME * gain.current;
    audio.muted = muted;
  }, [prefs.volume, muted, current]);

  // Opening the panel scrolls the song playing into view.
  useEffect(() => {
    if (prefs.open) listRef.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'center' });
  }, [prefs.open, prefs.gen, tracks.data]);

  const toggleOpen = () => {
    setWanted(true);
    update({ open: !prefs.open });
  };
  const setAutoplay = (autoplay: boolean) => {
    setWanted(true);
    update({ autoplay });
    saveSetting('music', JSON.stringify({ autoplay, soundtrack: prefs.soundtrack }));
  };
  const setSoundtrack = (soundtrack: Soundtrack) => {
    update({ soundtrack });
    saveSetting('music', JSON.stringify({ autoplay: prefs.autoplay, soundtrack }));
  };
  // Auto play and its soundtrack follow the account (utils/accountSettings).
  useEffect(
    () =>
      registerSetting('music', {
        read: storedAutoplay,
        apply: (value) => {
          try {
            const saved = JSON.parse(value ?? '{}') as Partial<Pick<MusicPrefs, 'autoplay' | 'soundtrack'>>;
            update({ autoplay: saved.autoplay ?? DEFAULTS.autoplay, soundtrack: saved.soundtrack ?? DEFAULTS.soundtrack });
          } catch {
            update({ autoplay: DEFAULTS.autoplay, soundtrack: DEFAULTS.soundtrack });
          }
        },
      }),
    [],
  );
  const state: MusicState = {
    playing,
    title: current?.title ?? null,
    open: prefs.open,
    togglePlay,
    toggleOpen,
    autoplay: prefs.autoplay,
    soundtrack: prefs.soundtrack,
    setAutoplay,
    setSoundtrack,
    setCue,
    playJingle,
    setTempo,
    hold,
  };
  return (
    <MusicContext.Provider value={state}>
      {children}
      {/* Clicks here don't cancel a move in progress on the board (the Board's outside-click listener). */}
      <div data-keep-action className={`fixed z-[1300] flex flex-col gap-2 ${docked ? 'bottom-3 left-3 items-start' : 'right-4 top-16 items-end'}`}>
        <section
          aria-label="Music player"
          className={`${prefs.open ? 'flex' : 'hidden'} max-h-[min(42rem,calc(100vh-5rem))] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg bg-slate-800 shadow-xl ring-1 ring-slate-600`}
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
            <Suspense fallback={null}>
            <AudioPlayer
              // The first song's player only appears once its code has loaded, after the effect that starts a song ran:
              // a song waiting to start (startNext) starts as soon as it's there.
              ref={(el) => {
                player.current = el;
                if (el) startPlaying();
              }}
              className="music-player"
              src={current.url}
              preload="none"
              autoPlayAfterSrcChange={false}
              volume={prefs.volume * MAX_VOLUME * gain.current}
              showSkipControls
              showJumpControls={false}
              onClickNext={() => step(1)}
              onClickPrevious={() => step(-1)}
              onEnded={ended}
              onPlay={() => setPlaying(true)}
              // A song switched to (or played again after a switch made while paused) fades in once it's really playing.
              onPlaying={() => gain.current < 1 && !afterFade.current && fade(1)}
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
                // Our own, not the player's (RHAP_UI.LOOP, a crossed-out icon of its own size): grey when off, white when on.
                <button
                  key="repeat"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded transition hover:bg-slate-700 ${prefs.repeat ? 'text-slate-50' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => update({ repeat: !prefs.repeat })}
                  aria-pressed={prefs.repeat}
                  title={prefs.repeat ? 'Repeat on' : 'Repeat off'}
                >
                  <RepeatIcon sx={{ fontSize: 20 }} />
                </button>,
                <button
                  key="shuffle"
                  className={`${iconButton} ${prefs.shuffle ? 'text-yellow-300 hover:text-yellow-200' : ''}`}
                  onClick={() => update({ shuffle: !prefs.shuffle })}
                  aria-pressed={prefs.shuffle}
                  title={prefs.shuffle ? 'Shuffle on' : 'Shuffle off'}
                >
                  <ShuffleIcon sx={{ fontSize: 20 }} />
                </button>,
                <button
                  key="autoplay"
                  className={`${iconButton} ${prefs.autoplay ? 'text-yellow-300 hover:text-yellow-200' : ''}`}
                  onClick={() => setAutoplay(!prefs.autoplay)}
                  aria-pressed={prefs.autoplay}
                  title={prefs.autoplay ? 'Auto play on: the music follows the run' : 'Auto play off'}
                >
                  <AutoModeIcon sx={{ fontSize: 20 }} />
                </button>,
              ]}
            />
            </Suspense>
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
      </div>
    </MusicContext.Provider>
  );
}
