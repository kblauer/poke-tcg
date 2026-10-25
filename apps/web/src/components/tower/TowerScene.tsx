import GridOnIcon from '@mui/icons-material/GridOn';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { routePath, type RouteSpot, type TowerRoom } from '@poke-tcg/campaign';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { STEP_MS, WALK_FRAME_MS, type Facing } from '../../utils/overworld';
import { facing, key } from '../../utils/routeFigures';
import { useIsPhone } from '../../hooks/useIsPhone';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { OverworldSprite, TileOverlay } from '../run/RouteSprites';
import { DialogueBox, dialogueKey, type Dialogue } from '../DialogueBox';

/** Someone in a Battle Tower room: their sprite, where they stand, which way they face, and whether they're walking or faded out. */
export interface Actor {
  sprite: string;
  tile: RouteSpot;
  face: Facing;
  walking: boolean;
  hidden: boolean;
  /** Their name, shown on their lines (an opponent's). */
  name?: string;
}

/** Thrown into a script that was stopped (the page left, or another script started), so it goes no further. */
class Stopped extends Error {}

/** How long the scene takes to fade out or back in, between rooms; and how long the elevator rides. */
const FADE_MS = 350;
const RIDE_MS = 1600;
/** How often a wait checks debug's pause. */
const PAUSE_TICK_MS = 50;
/** The scene's largest zoom (the run maps' 2×, a little more for the small rooms), and how tall it may be at most. */
const MAX_ZOOM = 3;
const MAX_HEIGHT = 0.6;
/**
 * On a phone, the room kept free below the scene (the user's): the deck picker, closed (its heading, the deck menu and its
 * buttons, about 230px, and the gap above it), so it shows without scrolling when the receptionist asks for a deck; the
 * scene is that size from the start, so nothing moves as it appears. An opened deck list may scroll.
 */
const PHONE_PANEL_ROOM = 250;

/** What a script's steps change: the scene's state (useScene's), and the script running and its timers. */
interface SceneContext {
  script: { current: number };
  timers: { current: Set<number> };
  /** Debug's pause: waits don't count down while it's on. */
  paused: { current: boolean };
  actorsRef: { current: Record<string, Actor> };
  roomRef: { current: TowerRoom | null };
  setActors: Dispatch<SetStateAction<Record<string, Actor>>>;
  setRoomState: (room: TowerRoom) => void;
  setDialogue: (dialogue: Dialogue | null) => void;
  setDark: (dark: boolean) => void;
  setRiding: (riding: boolean) => void;
  setReserved: (choices: string[] | null) => void;
}

/** Resolves once the picture at `src` is loaded and decoded (cached per picture; a failed one doesn't hold the scene up). */
const pictures = new Map<string, Promise<void>>();
function loaded(src: string): Promise<void> {
  const known = pictures.get(src);
  if (known) return known;
  const img = new Image();
  img.src = src;
  const done = img.decode().catch(() => void pictures.delete(src));
  pictures.set(src, done);
  return done;
}

/** One script's steps (useScene's `run`): each checks the script is still the one running, and stops it (Stopped) if not. */
function sceneSteps(id: number, { script, timers, paused, actorsRef, roomRef, setActors, setRoomState, setDialogue, setDark, setRiding, setReserved }: SceneContext) {
  const alive = () => {
    if (script.current !== id) throw new Stopped();
  };
  /** Waits `ms` of unpaused time (PAUSE_TICK_MS at a time, so debug's pause holds it), then goes on unless the script was stopped. */
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      let left = ms;
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        if (!paused.current) left -= now - last;
        last = now;
        if (script.current !== id) return reject(new Stopped());
        if (left <= 0) return resolve();
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          tick();
        }, Math.min(left, PAUSE_TICK_MS));
        timers.current.add(t);
      };
      tick();
    });
  const update = (who: string, patch: Partial<Actor>) => {
    alive();
    setActors((all) => (all[who] ? { ...all, [who]: { ...all[who]!, ...patch } } : all));
    actorsRef.current = actorsRef.current[who] ? { ...actorsRef.current, [who]: { ...actorsRef.current[who]!, ...patch } } : actorsRef.current;
  };
  /** The tiles of a walk from `who`'s tile to `to`, around everyone else (straight through them if there's no way round). */
  const pathFor = (who: string, to: RouteSpot) => {
    const r = roomRef.current!;
    const from = actorsRef.current[who]!.tile;
    if (from.x === to.x && from.y === to.y) return [];
    const others = new Set(Object.entries(actorsRef.current).filter(([id, a]) => id !== who && !a.hidden).map(([, a]) => key(a.tile)));
    return (routePath(r, from, to, others) ?? routePath(r, from, to) ?? []).map((s) => s.tile);
  };
  const api = {
    wait,
    /** Shows a room with these people in it (the scene stays dark until `fadeIn`). */
    setRoom(next: TowerRoom, people: Record<string, Omit<Actor, 'walking' | 'hidden'> & { hidden?: boolean }>) {
      alive();
      roomRef.current = next;
      const placed = Object.fromEntries(Object.entries(people).map(([id, a]) => [id, { ...a, walking: false, hidden: !!a.hidden }]));
      actorsRef.current = placed;
      setRoomState(next);
      setActors(placed);
    },
    place(who: string, actor: Omit<Actor, 'walking' | 'hidden'> & { hidden?: boolean }) {
      alive();
      const a = { ...actor, walking: false, hidden: !!actor.hidden };
      actorsRef.current = { ...actorsRef.current, [who]: a };
      setActors((all) => ({ ...all, [who]: a }));
    },
    face: (who: string, face: Facing) => update(who, { face }),
    /** Turns `who` to face `other`. */
    faceTo: (who: string, other: string) => update(who, { face: facing(actorsRef.current[who]!.tile, actorsRef.current[other]!.tile) }),
    show: (who: string, shown: boolean) => update(who, { hidden: !shown }),
    async fadeOut() {
      alive();
      setDark(true);
      await wait(FADE_MS);
    },
    /** Fades the room in, once its picture (and overhead) is loaded: never the last room's picture under the new room's people. */
    async fadeIn() {
      alive();
      const r = roomRef.current;
      if (r) await Promise.all([r.image, r.overhead].filter((src): src is string => !!src).map(loaded));
      alive();
      setDark(false);
      await wait(FADE_MS);
    },
    /** The elevator going up: the room shaking a little for RIDE_MS. */
    async ride() {
      alive();
      setRiding(true);
      await wait(RIDE_MS);
      setRiding(false);
    },
    /** Walks `who` to `to`, a tile a step. */
    async walk(who: string, to: RouteSpot) {
      let from = actorsRef.current[who]!.tile;
      for (const tile of pathFor(who, to)) {
        update(who, { tile, face: facing(from, tile), walking: true });
        from = tile;
        await wait(STEP_MS);
      }
      update(who, { walking: false });
    },
    /** Walks `leader` to `to` with `follower` a step behind, onto each tile the leader leaves. */
    async lead(leader: string, follower: string, to: RouteSpot) {
      let from = actorsRef.current[leader]!.tile;
      for (const tile of pathFor(leader, to)) {
        const behind = actorsRef.current[follower]!.tile;
        update(leader, { tile, face: facing(from, tile), walking: true });
        update(follower, { tile: from, face: facing(behind, from), walking: true });
        from = tile;
        await wait(STEP_MS);
      }
      update(leader, { walking: false });
      update(follower, { walking: false });
    },
    /** A line in the dialogue box, waiting for a click (or a key) to go on. */
    say(text: string, speaker?: string) {
      alive();
      return new Promise<void>((resolve, reject) =>
        setDialogue({
          text,
          speaker,
          answer: () => {
            setDialogue(null);
            if (script.current === id) resolve();
            else reject(new Stopped());
          },
        }),
      );
    },
    /** A question in the dialogue box, waiting for one of its choices: its index. */
    ask(text: string, choices: string[], speaker?: string) {
      alive();
      return new Promise<number>((resolve, reject) =>
        setDialogue({
          text,
          speaker,
          choices,
          answer: (choice) => {
            setDialogue(null);
            if (script.current === id) resolve(choice);
            else reject(new Stopped());
          },
        }),
      );
    },
    /** A line left in the dialogue box, with nothing to click (while something is picked under the scene), until `hush`. */
    prompt(text: string, speaker?: string) {
      alive();
      setDialogue({ text, speaker, choices: [], answer: () => {} });
    },
    /** Clears the dialogue box (a line left showing while something else is picked). */
    /**
     * Keeps room beside the dialogue box for these choices from now on (null: none), so the box is as wide through a
     * conversation as when its question's choices come up (the user's: its text never reflows).
     */
    reserve(choices: string[] | null) {
      alive();
      setReserved(choices);
    },
    hush() {
      alive();
      setDialogue(null);
    },
  };
  return api;
}

export type SceneSteps = ReturnType<typeof sceneSteps>;

/**
 * The director of a Battle Tower scene (TowerScene draws it): the room, the people in it and the dialogue box, changed by
 * scripts (`run`) made of awaited steps: walking someone along the room's paths (routePath, at the run maps' pace and walk
 * cycle), someone following them a step behind, a line said (waiting for a click) or a question asked (waiting for a
 * choice), fading between rooms, the elevator riding. A new script, or leaving the page, stops the one running. Debug's
 * pause (`setPaused`) holds every wait and the walk cycle until it's lifted.
 */
export function useScene() {
  const [room, setRoomState] = useState<TowerRoom | null>(null);
  const [actors, setActors] = useState<Record<string, Actor>>({});
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [dark, setDark] = useState(true);
  const [riding, setRiding] = useState(false);
  /** The choices the dialogue box keeps room for (reserve). */
  const [reserved, setReserved] = useState<string[] | null>(null);
  const [tick, setTick] = useState(0);
  /** Debug's pause (the pause button): the scene holds still, the walks stopping at the end of their step. */
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const setPaused = useCallback((p: boolean) => {
    pausedRef.current = p;
    setPausedState(p);
  }, []);
  const actorsRef = useRef(actors);
  actorsRef.current = actors;
  const roomRef = useRef(room);
  roomRef.current = room;
  /** The script running (its number); a step of an older one stops it. */
  const script = useRef(0);
  const timers = useRef(new Set<number>());
  useEffect(
    () => () => {
      script.current++;
      timers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );
  const walking = Object.values(actors).some((a) => a.walking);
  useEffect(() => {
    if (!walking || paused) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), WALK_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [walking, paused]);

  const ctx = { script, timers, paused: pausedRef, actorsRef, roomRef, setActors, setRoomState, setDialogue, setDark, setRiding, setReserved };
  const steps = useCallback((id: number) => sceneSteps(id, ctx), []);

  /** Runs a script, stopping the one running. A stopped script ends quietly; any other error is passed on to `onError`. */
  const run = useCallback(
    (body: (scene: SceneSteps) => Promise<void>, onError?: (error: unknown) => void) => {
      const id = ++script.current;
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
      setDialogue(null);
      setReserved(null);
      body(steps(id)).catch((error) => {
        if (!(error instanceof Stopped)) onError?.(error);
      });
    },
    [steps],
  );

  return { room, actors, dialogue, dark, riding, tick, run, paused, setPaused, reserved };
}

/**
 * A Battle Tower scene (useScene's state): the room's picture at the largest zoom that fits (up to MAX_ZOOM, and
 * MAX_HEIGHT of the window), its people on it as on the run maps (OverworldSprite), the dialogue box over its bottom edge
 * in the games' style (a click or Enter goes on; a question lists its choices on its right), fading between rooms and
 * shaking while the elevator rides. `children` are shown under it (the deck to pick).
 */
export function TowerScene({ scene, children }: { scene: ReturnType<typeof useScene>; children?: ReactNode }) {
  const { room, actors, dialogue, dark, riding, tick, paused, setPaused, reserved } = scene;
  // Debug only (never in production): the tiles overlay and the pause.
  const debugOn = useDebugEnabled();
  const debug = DEBUG_BUILD && debugOn;
  const [showTiles, setShowTiles] = useState(false);
  /** The dialogue box's click (DialogueBox sets it while it's up), for a click anywhere on the scene. */
  const pressDialogue = useRef<(() => void) | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /** On a phone, how tall the scene may be: the screen below its top, less PHONE_PANEL_ROOM. */
  const [phoneRoom, setPhoneRoom] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setPhoneRoom(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - PHONE_PANEL_ROOM);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  // On a big screen the largest zoom the window's width and MAX_HEIGHT allow; on a phone (the user's) the room is as tall
  // as the screen leaves room for (phoneRoom), wider than the window if it must be, the view following the player across it.
  const phone = useIsPhone();
  const fit = room ? Math.min(MAX_ZOOM, width / room.width, (window.innerHeight * MAX_HEIGHT) / room.height) : 1;
  // A battle room (one with an opponent's place) is shown whole across, both sides of its court in view (the user's).
  const wholeWidth = !!room?.points.opponent;
  const zoom = room ? Math.max(1, phone ? Math.min(MAX_ZOOM, phoneRoom / room.height, wholeWidth ? width / room.width : Infinity) : fit) : 1;
  const you = actors.player;
  const span = room ? room.width * zoom : 0;
  const left = !room || span <= width ? (width - span) / 2 : Math.min(0, Math.max(width - span, width / 2 - ((you?.tile.x ?? room.width / 32) * 16 + 8) * zoom));
  const people = useMemo(() => Object.entries(actors), [actors]);
  return (
    <div className="space-y-4">
      {/* A click anywhere on the scene is a click on the dialogue box (the user's): a line typing out shown whole, then on. */}
      <div ref={box} onClick={() => pressDialogue.current?.()} className="relative mx-auto w-full overflow-hidden rounded-lg ring-1 ring-slate-600" style={{ height: room ? room.height * zoom : 240, maxWidth: room && !phone ? room.width * MAX_ZOOM : undefined, background: '#000' }}>
        {room && (
          <div
            className={`absolute top-0 origin-top-left ${riding ? 'animate-[tower-ride_160ms_steps(2)_infinite]' : ''}`}
            style={{
              width: room.width,
              height: room.height,
              left,
              transform: `scale(${zoom})`,
              // Following the player step by step as he walks (a phone's view across a wide room).
              transition: you?.walking ? `left ${STEP_MS}ms linear` : undefined,
              animationPlayState: paused ? 'paused' : undefined,
            }}
          >
            {/* Keyed by the picture, so a new room's is a new element, never the last one's still showing while it loads. */}
            <img key={room.image} src={room.image} alt={room.name} draggable={false} className="h-full w-full select-none [image-rendering:pixelated]" />
            {people.map(([id, a]) => (
              <OverworldSprite key={id} name={a.sprite} tile={a.tile} face={a.face} walkTick={a.walking ? tick : undefined} moveMs={a.walking ? STEP_MS : 0} hidden={a.hidden} title={a.name} />
            ))}
            {/* What the game draws over its people (FireRed's and Emerald's top layer: a counter's near edge over the receptionist behind it), above every sprite (zIndex: their row). */}
            {room.overhead && <img key={room.overhead} src={room.overhead} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none [image-rendering:pixelated]" style={{ zIndex: 899 }} />}
            {DEBUG_BUILD && debug && showTiles && (
              <>
                <TileOverlay route={room} />
                <PointsOverlay room={room} />
              </>
            )}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-black transition-opacity" style={{ opacity: dark ? 1 : 0, transitionDuration: `${FADE_MS}ms` }} />
        {/* Keyed by the line, so each one types out afresh. */}
        {dialogue && <DialogueBox key={dialogueKey(dialogue)} dialogue={dialogue} reserved={reserved} paused={paused} pressRef={pressDialogue} phone={phone} />}
        {/* Debug (DEBUG_BUILD first: a production build drops them): the tiles overlay, as on the run maps, and the pause. */}
        {DEBUG_BUILD && debug && (
          <div className="absolute right-2 top-2 z-[3000] flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              className={`${SCENE_BUTTON} ${showTiles ? 'ring-yellow-300' : ''}`}
              onClick={() => setShowTiles(!showTiles)}
              aria-pressed={showTiles}
              aria-label="Debug: show tiles"
              title="Debug: show the tiles' coordinates, walkable areas and the room's places"
            >
              <GridOnIcon sx={{ fontSize: 16 }} />
            </button>
            <button
              className={`${SCENE_BUTTON} ${paused ? 'ring-yellow-300' : ''}`}
              onClick={() => setPaused(!paused)}
              aria-pressed={paused}
              aria-label={paused ? 'Debug: resume' : 'Debug: pause'}
              title={paused ? 'Debug: resume the scene' : 'Debug: pause the scene (walks stop at the end of their step)'}
            >
              {paused ? <PlayArrowIcon sx={{ fontSize: 16 }} /> : <PauseIcon sx={{ fontSize: 16 }} />}
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** The scene's buttons in its top right corner, as the run map's (RouteView). */
const SCENE_BUTTON = 'flex h-8 w-8 items-center justify-center rounded bg-slate-800/90 text-slate-200 ring-1 ring-slate-600 transition hover:bg-slate-700';

/** Debug (with the tiles overlay): each of the room's named places (`points`: the desk, the elevator, where the opponent stops…), outlined and named. */
function PointsOverlay({ room }: { room: TowerRoom }) {
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 2001 }}>
      {Object.entries(room.points).map(([name, t]) => (
        <div
          key={name}
          className="absolute flex items-end justify-center font-bold leading-none text-white"
          style={{ left: t.x * 16, top: t.y * 16, width: 16, height: 16, outline: '1px solid #a855f7', outlineOffset: -1, background: '#a855f744', fontSize: 4, textShadow: '0 0 1px #000', whiteSpace: 'nowrap' }}
        >
          {name}
        </div>
      ))}
    </div>
  );
}
