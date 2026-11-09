import GridOnIcon from '@mui/icons-material/GridOn';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import { dropAt, flowAt, inGrass, inLongGrass, isBattleKind, LIFT_MS, LIFT_PAUSE_MS, liftEnd, onLongGrassEdge, onPath, onWater, routePath, snowSink, travelAt, type Route, type RouteSpot } from '@poke-tcg/campaign';
import type { PlayerGender } from '@poke-tcg/shared';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCrackedIce } from '../../hooks/useCrackedIce';
import { useSnowballs } from '../../hooks/useSnowballs';
import { useGears } from '../../hooks/useGears';
import { TRACK_FADE_STEPS, TRACK_SHOW_STEPS, useSnowTracks } from '../../hooks/useSnowTracks';
import { useIsPhone } from '../../hooks/useIsPhone';
import { clampView, usePan, ZOOM } from '../../hooks/usePan';
import { onDevicePixel } from '../idle/GameScreen';
import type { RunViewData } from '../../hooks/useRun';
import { FADE_MS, GRASS_PACE, pace, slowGrass, stepPace, THROUGH_MS, useWalk, type MapSection, type Walker } from '../../hooks/useWalk';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { bobs, BOB_MS, isItemBall, playerSprite, STEP_MS, WALK_FRAME_MS, type Facing } from '../../utils/overworld';
import { MAP_CARD, MAP_CARD_PHONE, MAP_CARD_SKIP } from '../../utils/layout';
import { encounterFigure, facing, key, layOutCards, placeFigures, setOf, type PlacedFigure } from '../../utils/routeFigures';
import { Exclamation, Figure, GrassTufts, JumpDust, JumpShadow, OverworldSprite, Snowball, SnowTrack, TallGrass, TileOverlay } from './RouteSprites';

/**
 * The players' sprites (Red's, Ethan's and Brendan's, and the girls', Leaf's, Lyra's and May's, walking, on a bike, surfing) and the swimmers' in-water ones, fetched when
 * the map first shows (not on every page), so a switch between them (stepping off the water onto land) never shows him blank while one loads. The
 * images are kept so the browser keeps them decoded.
 */
const PRELOAD = ['red', 'red_bike', 'red_surf', 'leaf', 'leaf_bike', 'leaf_surf', 'swimmer_m_water', 'swimmer_f_water', 'hgss/hero', 'hgss/cyclehero', 'hgss/swimhero', 'hgss/heroine', 'hgss/cycleheroine', 'hgss/swimheroine', 'rse/brendan', 'rse/brendan_bike', 'rse/brendan_surf', 'rse/may', 'rse/may_bike', 'rse/may_surf', 'dp/hero', 'dp/heroine'];
let preloaded: HTMLImageElement[] | undefined;
const preloadSprites = () => (preloaded ??= PRELOAD.map((name) => Object.assign(new Image(), { src: `/overworld/${name}.png` })));

/** localStorage key for the walk speed (the speed button): 1×, 2× or 3×, every walk, fade and glide that much faster. */
const SPEED_KEY = 'poke-tcg.route-speed';
const SPEEDS = [1, 2, 3] as const;

function loadSpeed(): number {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

function saveSpeed(speed: number) {
  try {
    localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // Not remembered; the walks start at 1× next time.
  }
}

/** localStorage key for the phone's map lock (the lock button), on until it's turned off (agreed): while it's on, the map doesn't pan, so a swipe over it scrolls the page. */
const LOCK_KEY = 'poke-tcg.route-lock';

/**
 * The zoom while a step's encounters are chosen (the user's experiment: the encounters' cards on the map, `optionCard`),
 * and how long the zoom in and out takes (the user's: slow), on the player both ways: in, the cards showing once it's
 * there; out, before he walks on.
 */
const CHOOSE_ZOOM = 4;
/** An element's width inside its padding (what a child as wide as it can be gets), or undefined without one. */
const contentWidth = (el: HTMLElement | null | undefined) => {
  if (!el) return undefined;
  const style = getComputedStyle(el);
  return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
};
const PHONE_CHOOSE_ZOOM = 3;
const ZOOM_MS = 1200;

function loadLocked(): boolean {
  try {
    return localStorage.getItem(LOCK_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveLocked(locked: boolean) {
  try {
    localStorage.setItem(LOCK_KEY, locked ? '1' : '0');
  } catch {
    // Not remembered; the map starts locked next time.
  }
}

/**
 * The run's route map (routes.ts): the route's pixel map with every spot's figures (placeFigures, utils/routeFigures.ts;
 * drawn by RouteSprites.tsx), and Red (the player)
 * on the current spot, facing the encounter, at 2×. It pans by dragging or with the mouse wheel (up and down; sideways
 * with a trackpad or Shift; usePan); it opens centred on the player. When the run moves on, Red walks to the next spot tile by
 * tile with FireRed's walk cycle (useWalk), the view following him, where the route has a walkable path between them
 * (routePath, up to MAX_WALK tiles, through gatehouses fading out at one door and back in at the other); otherwise he fades
 * out, the view glides there, and he fades back in. The target
 * button centres the view on him again, and the speed button walks everyone (and fades and glides) at 1×, 2× or 3×. On a
 * phone the lock button below them stops the map panning, so a swipe over it scrolls the page (on by default; remembered, `poke-tcg.route-lock`).
 * With more than one route (Vermilion City: Route 5, then Route 6), each route holds its spots' steps: Red walks to the
 * route's `exit` (if it has one), fades out, and comes back in at the next route's `entrance`, the view switching to it.
 * With a `gym` (its interior: Pewter Gym), the steps after the routes' spots are there:
 * Red fades out on the route and back in at the gym's door, the view switching to the gym, and walks on to the Gym
 * Trainer (standing where the game has them), then to the leader, who waits in their place all along. A trainer whose battle was just chosen (`spotted`, useRun) gets FireRed's "!" over
 * them (Exclamation) and Red turns to them, while the battle is set up; a non-battle encounter's NPC walks up beside him
 * once it's chosen (an item ball stays put). The view stays inside the map (centred along any side where the map is smaller
 * than it). Its height is the player's: drag the handle along its bottom edge (from MIN_HEIGHT to the whole map's height,
 * or 85% of the window), remembered in localStorage (`poke-tcg.route-map`); a double-click on the handle resets it.
 */
export function RouteView({
  routes,
  gym,
  view,
  spotted,
  gender = 'male',
  optionCard,
  overlay,
  corners,
  fill = false,
}: {
  routes: Route[];
  gym?: Route;
  view: RunViewData;
  spotted?: { option: number | null } | null;
  gender?: PlayerGender;
  /** The step's option as a card on the map, beside its figure (MapOption): with it, the map zooms in on the step while it's chosen. */
  optionCard?: (option: number) => ReactNode;
  /** The encounter under way (EncounterPanel), drawn over the bottom of the view, the player and the figures above it (the user's experiment). */
  overlay?: ReactNode;
  /** What sits in the view's corners (the user's experiment): Concede (top left), the Bag (bottom left, the view's height to open in), the deck (bottom right). */
  corners?: { topLeft?: ReactNode; bottomLeft?: ReactNode; bottomRight?: ReactNode };
  /** As tall as its parent (a flex column) lets it be, the caption at the bottom (the user's: with nothing else on the page); no handle for its height. */
  fill?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => void preloadSprites(), []);
  // Debug only: the walkable tiles overlay (TileOverlay).
  const debug = useDebugEnabled();
  const [showTiles, setShowTiles] = useState(false);
  // On a phone, the lock button stops dragging (and the wheel) panning the map, so a swipe over it scrolls the page
  // instead; the view still follows Red and Centre on you still works.
  const phone = useIsPhone();
  const [locked, setLocked] = useState(loadLocked);
  const panLocked = phone && locked;
  // The walk speed (the speed button), and every walk timing at it.
  const [speed, setSpeed] = useState(loadSpeed);
  const ms = { step: STEP_MS / speed, frame: WALK_FRAME_MS / speed, fade: FADE_MS / speed, through: THROUGH_MS / speed, glide: 700 / speed, lift: LIFT_MS / speed, liftPause: LIFT_PAUSE_MS / speed };

  // The step the map shows: the run's, but the last one's while the view zooms back out from it (the walk on waits for that).
  const [position, setPosition] = useState(view.position);
  const total = view.steps.length;
  // The maps in order (the routes, then the gym), each holding the steps from `first` up to `upto`. The gym's steps are the
  // run's last ones (counted from the end, so a run made before its route had 10 spots still works); the last route holds
  // every step before them.
  const gymStart = gym ? total - gym.spots.length : total;
  const sections: MapSection[] = [];
  let counted = 0;
  routes.forEach((map, i) => {
    const first = Math.min(counted, gymStart);
    counted += map.spots.length;
    sections.push({ map, first, upto: i === routes.length - 1 ? gymStart : Math.min(counted, gymStart) });
  });
  if (gym) sections.push({ map: gym, first: gymStart, upto: total });
  /** The section a step is on (the last one for steps past the end). */
  const sectionOf = (p: number) => {
    const i = sections.findIndex((s) => p < s.upto);
    return i < 0 ? sections.length - 1 : i;
  };
  const targetSection = sectionOf(position);
  const target = sections[targetSection]!;
  const targetSpot = target.map.spots[Math.min(position - target.first, target.map.spots.length - 1)]!;

  // The player (Walker): the map he's on, where he stands, which way he's going, whether he's faded out, under a bridge or sliding.
  const [walker, setWalker] = useState<Walker>({
    section: targetSection,
    // At the run's start (nothing chosen yet) he starts at the map's entrance and walks in (the walk effect, on mount).
    // Back from the first encounter (its battle's game, still step 0 while its reward is chosen) he's already there.
    tile: position === 0 && view.phase === 'map' && view.steps[0]?.chosen === undefined && target.map.entrance ? target.map.entrance : targetSpot,
    face: flowAt(target.map, Math.min(position - target.first, target.map.spots.length - 1)),
    walking: false,
    hidden: false,
  });
  const walkerRef = useRef(walker);
  walkerRef.current = walker;
  // The map shown is the one the player is on, which changes when he fades into the next route or the gym.
  const current = sections[walker.section] ?? target;
  const shown = current.map;
  const index = Math.min(Math.max(0, position - current.first), shown.spots.length - 1);
  const spot = shown === target.map ? targetSpot : shown.spots[index]!;

  // The view: its height, its size, and where the map sits in it (panned, or moved by the walk). `mapEl` is the map, moved
  // directly while it's dragged.
  const mapEl = useRef<HTMLDivElement>(null);
  // Zoomed in on the step (CHOOSE_ZOOM) while the player stands on its spot, its encounters chosen or under way; 2× while
  // he walks on (the user's experiment, with `optionCard`).
  const atSpot = walker.section === targetSection && walker.tile.x === targetSpot.x && walker.tile.y === targetSpot.y && !walker.walking && !walker.hidden;
  const zoomedIn = !!optionCard && atSpot && view.position === position && (view.phase === 'map' || view.phase === 'encounter');
  // Eased out from CHOOSE_ZOOM when the step's cards don't fit the view at it (layOutCards, below), kept for the step.
  const [fit, setFit] = useState<{ position: number; zoom: number } | null>(null);
  const chooseZoom = phone ? PHONE_CHOOSE_ZOOM : CHOOSE_ZOOM;
  const zoom = zoomedIn ? (fit?.position === view.position ? fit.zoom : chooseZoom) : ZOOM;
  const pan = usePan({ box, mapEl, map: shown, mapHeight: Math.max(...routes.map((r) => r.height), gym?.height ?? 0), panLocked, zoom, pastEdges: !!optionCard });
  const { size, setOffset, setGlide, centreOn, centreOnMap } = pan;
  // The figures as last drawn, for the walk to go around them.
  const placedRef = useRef<PlacedFigure[]>([]);
  // A non-battle encounter's NPC walking up to the player once chosen (the step it's for, where it is, which way it's going).
  const [approach, setApproach] = useState<{ position: number; tile: RouteSpot; face: Facing; walking: boolean } | null>(null);
  // The figures as last drawn while choosing, to know where the chosen one stood; and the walk's timers.
  const choosingRef = useRef<PlacedFigure[]>([]);
  const approachTimers = useRef<number[]>([]);
  // Where each NPC that walked up to the player ended up, by step (placeFigures keeps it there once passed).
  const movedRef = useRef(new Map<number, RouteSpot>());
  const [tick, setTick] = useState(0);
  const anyWalking = walker.walking || !!approach?.walking;
  // The player bobbing on the spot while still (Ethan surfing): the low half of the bob every other BOB_MS.
  const [bobbing, setBobbing] = useState(false);
  // On foot or riding by where he is (travelAt: Route 110's sandy road walked, the Cycling Road ridden).
  const playerName = playerSprite(setOf(shown), travelAt(shown, walker.tile), onWater(shown, walker.tile), gender);
  const stillBob = bobs(playerName) && !walker.walking;
  useEffect(() => {
    if (!stillBob) return;
    const timer = window.setInterval(() => setBobbing((b) => !b), BOB_MS);
    return () => window.clearInterval(timer);
  }, [stillBob]);
  // Wading through tall grass, the player's legs slow with his steps (GRASS_PACE; not in Diamond and Pearl's short grass).
  const wading = walker.walking && slowGrass(shown, walker.tile);
  // The step he's taking: how long it takes (useWalk's, slower out of deep snow), 0 standing still.
  const stepMs = walker.walking ? (walker.stepMs ?? ms.step / stepPace(shown, walker.tile)) : 0;
  // Sootopolis Gym's thin ice, cracked where the player has stepped (its `crackedIce` drawn over those tiles), and its stairs once they're there.
  const { cracked, stairs } = useCrackedIce(shown, walker.tile, stepMs);
  // Snowpoint Gym's snowballs, crushed as the player slides into them (useWalk's onCrush) and gone once he's passed.
  const { crushed, crush } = useSnowballs(shown, walker.tile, walker.walking);
  // Sunyshore Gym's gears, turning as the player steps onto their buttons (useWalk's onTurn), frame by frame.
  const gears = useGears(shown, walker.tile, walker.walking);
  // How far below its tile each person is drawn: on a lower floor (dropAt: Snowpoint Gym's pit).
  const drop = (tile: RouteSpot) => dropAt(shown, tile);
  // A map's overhead only over its `overheadAt` tiles (the Elite Four's doorways): over him there, and until his step off one is done.
  const atOverhead = !!shown.overheadAt?.some((t) => t.x === walker.tile.x && t.y === walker.tile.y);
  const [overheadOn, setOverheadOn] = useState(atOverhead);
  useEffect(() => {
    if (atOverhead) return setOverheadOn(true);
    const timer = window.setTimeout(() => setOverheadOn(false), stepMs);
    return () => window.clearTimeout(timer);
    // Only as he comes onto or off one of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atOverhead]);
  // How far each person is sunk into deep snow (snowSink: Route 217's).
  const sink = (tile: RouteSpot) => snowSink(shown, tile);
  // Tall grass on the Gen 3 maps is the games' own, drawn over the feet of those in it (TallGrass, GrassTufts: FireRed's,
  // Emerald's on the Hoenn maps), as Diamond and Pearl's short grass is (its own rustle, the user's); on HGSS's, it hides
  // their legs (OverworldSprite's `grass`).
  const sprites = setOf(shown);
  const legsHidden = sprites === 'hgss';
  const masked = (tile: RouteSpot) => legsHidden && inGrass(shown, tile);
  // Emerald's long grass (Route 119's very tall grass) hides the whole bottom tile of those in it, under its own tufts.
  const long = (tile: RouteSpot) => inLongGrass(shown, tile);
  // Its tufts: long grass's, cut off above the band of ground at its foot ('edge', onLongGrassEdge).
  const tuftOf = (tile: RouteSpot) => long(tile) || (onLongGrassEdge(shown, tile) && 'edge');
  useEffect(() => {
    if (!anyWalking) return;
    // His legs as slow as his step (useWalk's: on a bike, in tall grass, out of deep snow).
    const frameMs = walker.walking && walker.stepMs ? (ms.frame * walker.stepMs) / ms.step : ms.frame / (pace(shown, walker.tile) * (wading ? GRASS_PACE : 1));
    const timer = window.setInterval(() => setTick((t) => t + 1), frameMs);
    return () => window.clearInterval(timer);
  }, [anyWalking, shown, wading, walker.tile, walker.stepMs]);

  // A non-battle encounter chosen: its NPC (an item ball aside) walks from where it stood to the free tile beside the
  // player it reaches soonest, then faces him; from the moment it's clicked (`spotted`), or once the encounter is under way
  // (a reload, say). Battles have their "!" instead.
  const chosenOption = view.phase === 'map' ? (spotted?.option ?? undefined) : view.phase === 'encounter' ? view.steps[position]?.chosen : undefined;
  useEffect(() => {
    if (chosenOption === undefined || approach?.position === position) return;
    const option = view.steps[position]?.options[chosenOption];
    if (!option || isBattleKind(option.kind)) return;
    const e = view.encounter;
    if (view.phase === 'encounter' && (!e || e.kind === 'reward' || isItemBall(encounterFigure(view, setOf(shown))?.sprite))) return;
    // A Mystery waits until it's revealed (once under way) to show who walks up; a Lucky Find's ₱ stay on the ground.
    if (view.phase === 'map' && option.kind === 'event' && (!option.event || option.event.id === 'luckyFind')) return;
    const from = choosingRef.current.find((p) => p.spot === spot && !p.faded && p.figure.option === chosenOption)?.tile;
    if (!from) return;
    const others = new Set(choosingRef.current.filter((p) => p.tile !== from).map((p) => key(p.tile)));
    const walks = ([[0, -1], [1, 0], [0, 1], [-1, 0]] as const)
      .map(([dx, dy]) => ({ x: spot.x + dx, y: spot.y + dy }))
      .filter((t) => onPath(shown, t) && !onWater(shown, t) && !others.has(key(t)))
      .map((t) => (t.x === from.x && t.y === from.y ? [] : routePath(shown, from, t, others)))
      .filter((w): w is NonNullable<typeof w> => w !== null)
      .sort((a, b) => a.length - b.length);
    const walk = walks[0];
    setApproach({ position, tile: from, face: facing(from, spot), walking: false });
    // No walking through a gatehouse, or into water (the NPC can't swim: it stays on land).
    if (!walk?.length || walk.some((s) => s.fade || s.lift || onWater(shown, s.tile))) return;
    // Kept until the step changes, not when the encounter comes in mid-walk.
    approachTimers.current = walk.map(({ tile }, i) =>
      window.setTimeout(() => setApproach({ position, tile, face: facing(i ? walk[i - 1]!.tile : from, tile), walking: true }), i * ms.step),
    );
    const last = walk.at(-1)!.tile;
    approachTimers.current.push(window.setTimeout(() => setApproach({ position, tile: last, face: facing(last, spot), walking: false }), walk.length * ms.step));
    // When an option is chosen, or the encounter comes in (or the step changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenOption, view.phase, position]);
  useEffect(
    () => () => {
      approachTimers.current.forEach((t) => window.clearTimeout(t));
      approachTimers.current = [];
    },
    [position],
  );


  // When the run moves on, Red walks (or fades) to the new spot, the view following him.
  // Who stands on another map, as it'll be drawn once he's there (placeFigures), for his walk into it to go round them.
  const figuresOn = (s: number) => placeFigures(sections[s]!.map, view, sections[s]!.first, sections[s]!.upto, movedRef.current).map((p) => p.tile);
  useWalk({ position, sections, targetSection, targetSpot, walkerRef, setWalker, placedRef, figuresOn, ms, centreOnMap, setGlide, setOffset, onCrush: crush, onTurn: gears.turn });

  // Where each non-battle encounter's NPC walked up to (the step it's for), so it stays there once passed.
  if (approach) movedRef.current.set(approach.position, approach.tile);
  // Placed again only when something they depend on changes, not on every walk tick (the walk re-renders every frame).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const placed = useMemo(() => placeFigures(shown, view, current.first, current.upto, movedRef.current), [shown, view, current.first, current.upto, approach]);
  placedRef.current = placed;
  if (view.phase === 'map') choosingRef.current = placed;
  // The NPC coming up to the player (approach), for the encounter under way: drawn where it's walked to.
  const approaching = approach && approach.position === position && view.phase !== 'won' && view.phase !== 'lost' ? approach : null;
  // The tracks the player and the NPC coming up to him leave in the snow (Diamond's).
  const tracks = [
    ...useSnowTracks(shown, { tile: walker.tile, walking: walker.walking, hidden: walker.hidden, jumping: !!walker.jump }, stepMs, ms.step),
    ...useSnowTracks(shown, approaching, ms.step, ms.step),
  ];
  // While choosing, the chosen option's figure; once the encounter is under way, its figure.
  const isApproaching = (p: PlacedFigure) =>
    !!approaching && p.spot === spot && !p.faded && (view.phase === 'encounter' || p.figure.option === chosenOption);
  // Red faces the way he walks, and once there the encounter if there's just one at his spot; otherwise the way the map's encounters go (its flow).
  const mine = placed.filter((p) => p.spot === spot && !p.faded);
  // The step's figures with an option (a card each), while it's chosen.
  const carded = optionCard && view.phase === 'map' && !spotted ? mine.filter((p) => p.figure.option !== undefined) : [];
  // The step's options with no figure on the map (an encounter with no one to stand for it): their cards above the player.
  const uncarded = optionCard && view.phase === 'map' && !spotted ? (view.steps[position]?.options ?? []).map((_, i) => i).filter((i) => !carded.some((p) => p.figure.option === i)) : [];
  // Zooming in or out (`zoom` changing): the scale and the view's offset together, a frame at a time, so the point zoomed
  // on stays put: the player, in and out. The map is drawn at `shownZoom` once it's done (and the offset handed back to usePan), the cards
  // showing once it's in (`settled`: at its zoomed-in scale, nothing moving); the run's next step is taken up once it's out (below).
  const [shownZoom, setShownZoom] = useState(zoom);
  const zoomAt = useRef<{ zoom: number; offset: { x: number; y: number } } | null>(null);
  // The cards showing (the view zoomed in on the step, nothing moving); their figures' speech bubbles hidden meanwhile, the card showing the same icon.
  const cardsShown = zoomedIn && shownZoom === zoom && !zoomAt.current;
  const figureOf = (p: PlacedFigure) => (cardsShown && carded.includes(p) ? { ...p.figure, bubble: undefined } : p.figure);
  // The figure (as wide as the page, but no wider than the map at its zoom: its whole width shown), widened or narrowed
  // with the zoom's frames.
  const figure = useRef<HTMLElement>(null);
  // (Without the map's cards, as wide as the widest of its maps at 2×, as before.)
  const viewWidth = (z: number) => (optionCard ? Math.max(768, shown.width * z) : Math.max(768, ...sections.map((s) => s.map.width * ZOOM)));
  // The bottom corners' height (the deck's and the Bag's), for the cards below the player to stay clear of.
  const bottomRight = useRef<HTMLDivElement>(null);
  const bottomLeft = useRef<HTMLDivElement>(null);
  const [cornersHeight, setCornersHeight] = useState(0);
  const cornered = !!corners;
  useEffect(() => {
    const els = [bottomRight.current, bottomLeft.current?.querySelector<HTMLElement>('[data-corner]')].filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const measure = () => setCornersHeight(Math.max(...els.map((e) => e.offsetHeight)));
    measure();
    const observer = new ResizeObserver(measure);
    els.forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, [cornered]);
  // The cards laid out (layOutCards: apart, inside the view, clear of the corners), at the zoom they fit at; the player
  // resting higher than the middle when the cards below him need it.
  const cardFigures = carded.map((p) => {
    const kind = view.steps[position]?.options[p.figure.option!]?.kind;
    const h = (phone ? MAP_CARD_PHONE : MAP_CARD).h + (DEBUG_BUILD && debug && kind && isBattleKind(kind) ? MAP_CARD_SKIP : 0);
    return { option: p.figure.option!, dx: p.tile.x - walker.tile.x, dy: p.tile.y - walker.tile.y, drop: drop(p.tile), h };
  });
  const layout =
    size.w && (carded.length || uncarded.length)
      ? layOutCards(cardFigures, uncarded, { zoom: chooseZoom, minZoom: ZOOM, card: phone ? MAP_CARD_PHONE : MAP_CARD, view: size, top: 8, bottom: cornersHeight + 16, gap: 4, redDrop: drop(walker.tile) })
      : null;
  useLayoutEffect(() => {
    if (layout && (fit?.position !== view.position || fit.zoom !== layout.zoom)) setFit({ position: view.position, zoom: layout.zoom });
  });
  /**
   * Where the view's focus rests, down from its top: the middle; higher with the encounter's panel over the bottom of the
   * view (a third of the way down); where the cards fit while they're chosen.
   */
  const restY = (h: number) => (overlay ? h * 0.3 : layout ? layout.restY : h * 0.5);
  /** The offset that puts a tile at the view's focus (restY) at a zoom, kept inside the map. */
  const centreAt = (t: { x: number; y: number }, z: number, view: { w: number; h: number }) => clampView(shown, { x: view.w / 2 - (t.x * 16 + 8) * z, y: restY(view.h) - (t.y * 16 + 8) * z }, view, z, !!optionCard);
  /** What the view centres on, zoomed in or out: the player (the user's: never anywhere else, so a zoom never swings the view). */
  const focusTile = () => walkerRef.current.tile;
  // Centred when the view first has a size, or changes size (not while a zoom moves it).
  useEffect(() => {
    if (!size.w || zoomAt.current) return;
    setGlide(null);
    setOffset(centreAt(focusTile(), zoom, size));
    // Only when the view's size changes; walking and panning move it otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);
  // The encounter's panel coming up or going: the view glides to put the focus above it, or back in the middle.
  const overlaid = !!overlay;
  useEffect(() => {
    // Not while a zoom moves the view (it puts him there itself).
    if (!size.w || zoomAt.current || zoom !== shownZoom) return;
    setGlide({ ms: 500, ease: 'ease-in-out' });
    setOffset(centreAt(focusTile(), shownZoom, size));
    // When the panel comes up or goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlaid]);
  useEffect(() => {
    const el = mapEl.current;
    // Not measured yet (or no map): at the new zoom at once.
    if (!size.w || !el) return void setShownZoom(zoom);
    // From where the map is drawn now (a glide may be half done: the DOM's, not the offset it's heading for), any glide
    // stopped there, so nothing else moves the map while the zoom does.
    const from = zoomAt.current ?? { zoom: shownZoom, offset: { x: parseFloat(el.style.left) || pan.offset.x, y: parseFloat(el.style.top) || pan.offset.y } };
    setGlide(null);
    setOffset(from.offset);
    const t = focusTile();
    const red = { x: t.x * 16 + 8, y: t.y * 16 + 8 };
    // The page's width, which the view widens to (or the map's at the zoom); the view stays centred in it.
    const page = contentWidth(figure.current?.parentElement) ?? size.w;
    const w0 = Math.min(page, viewWidth(from.zoom));
    // Where the player is on the page (across from the view's middle, which stays put as it widens; down from its top),
    // moving only from where he is to where he rests (the middle, or above the encounter's panel): no swing.
    const across0 = from.offset.x + red.x * from.zoom - w0 / 2;
    const down0 = from.offset.y + red.y * from.zoom;
    const at = (k: number) => {
      // Evenly in scale (each frame the same ratio).
      const z = from.zoom * (zoom / from.zoom) ** k;
      const view = { w: Math.min(page, viewWidth(z)), h: size.h };
      const across = across0 * (1 - k);
      const down = down0 + (restY(view.h) - down0) * k;
      return { zoom: z, width: viewWidth(z), offset: clampView(shown, { x: view.w / 2 + across - red.x * z, y: down - red.y * z }, view, z, !!optionCard) };
    };
    const start = performance.now();
    const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2);
    let frame = requestAnimationFrame(function step(now) {
      const k = Math.min(1, (now - start) / ZOOM_MS);
      const v = at(ease(k));
      zoomAt.current = v;
      el.style.transform = `scale(${v.zoom})`;
      el.style.left = `${onDevicePixel(v.offset.x)}px`;
      el.style.top = `${onDevicePixel(v.offset.y)}px`;
      if (figure.current) figure.current.style.maxWidth = `${v.width}px`;
      if (k < 1) return void (frame = requestAnimationFrame(step));
      zoomAt.current = null;
      setGlide(null);
      setOffset(v.offset);
      setShownZoom(zoom);
    });
    return () => cancelAnimationFrame(frame);
    // When the zoom changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);
  // The run's next step taken up (the walk on starting) once the view is back out.
  useEffect(() => {
    if (view.position !== position && zoom === shownZoom && !zoomAt.current) setPosition(view.position);
  }, [view.position, position, zoom, shownZoom]);
  // The trainer who just spotted the player (the battle chosen, or the Ace Trainer accepted): the step's option while the
  // battle is being set up, then the encounter's figure once it's in.
  const spottedFigure = spotted ? mine.find((p) => !p.figure.bubble && (view.phase === 'encounter' ? true : p.figure.option === spotted.option)) : undefined;
  // Walking, or passing through a building's doors (fading out and back in), the way the walk has him.
  const redFace: Facing = walker.walking || walker.through
    ? walker.face
    : spottedFigure
      ? facing(walker.tile, spottedFigure.tile)
      : approaching
        ? facing(walker.tile, approaching.tile)
        : mine.length === 1
        ? facing(walker.tile, mine[0]!.tile)
        : flowAt(shown, index);
  const button = 'flex h-8 w-8 items-center justify-center rounded bg-slate-800/90 text-slate-200 ring-1 ring-slate-600 transition hover:bg-slate-700';
  const atGym = !!gym && target.map === gym;

  return (
    // As wide as the widest of its maps at 2× (at least 48rem), up to the page's width: no wider than the maps can fill.
    // As wide as the page, up to the map's whole width at its zoom (at least 48rem).
    <figure ref={figure} className={`mx-auto w-full ${fill ? 'flex min-h-0 flex-1 flex-col gap-1' : 'space-y-1'}`} style={{ maxWidth: viewWidth(shownZoom) }}>
      <div
        ref={box}
        // `isolate`: the layers inside (the corners, the cards, the panel) stack only among themselves, never over the page's (the ☰ menu).
        className={`relative isolate overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-600 ${fill ? 'min-h-50 flex-1' : ''} ${panLocked ? 'touch-pan-y' : 'cursor-grab touch-none active:cursor-grabbing'}`}
        style={fill ? undefined : { height: pan.height }}
        aria-label={panLocked ? `${shown.name}. The map is locked.` : `${shown.name}. Drag or scroll to look around.`}
        onPointerDown={pan.onPointerDown}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.endDrag}
        onPointerCancel={pan.endDrag}
      >
        {size.w > 0 && (
          <div
            ref={mapEl}
            className="absolute origin-top-left"
            // Placed and glided by usePan (usePanTo).
            // Only the part shown where the map has one (its `view`: a gym's leader's room).
            style={{ width: shown.width, height: shown.height, transform: `scale(${shownZoom})`, ...(shown.view && { clipPath: `inset(${shown.view.y * 16}px ${shown.width - (shown.view.x + shown.view.width) * 16}px ${shown.height - (shown.view.y + shown.view.height) * 16}px ${shown.view.x * 16}px)` }) }}
          >
            <img src={shown.image} alt="" draggable={false} className="h-full w-full select-none [image-rendering:pixelated]" />
            {/* The gears (Sunyshore Gym's), the frame of their turning they're at, over the part of the map they change. */}
            {shown.gears && (
              <div
                className="pointer-events-none absolute [image-rendering:pixelated]"
                style={{
                  left: shown.gears.frames.x,
                  top: shown.gears.frames.y,
                  width: shown.gears.frames.width,
                  height: shown.gears.frames.height,
                  backgroundImage: `url(${shown.gears.frames.image})`,
                  backgroundPosition: `${-(gears.frame % shown.gears.frames.columns) * shown.gears.frames.width}px ${-Math.floor(gears.frame / shown.gears.frames.columns) * shown.gears.frames.height}px`,
                }}
              />
            )}
            {shown.crackedIce && cracked.map((t) => <img key={key(t)} src={shown.crackedIce} alt="" draggable={false} className="pointer-events-none absolute select-none [image-rendering:pixelated]" style={{ left: t.x * 16, top: t.y * 16, width: 16, height: 16 }} />)}
            {tracks.map((t) => <SnowTrack key={t.id} tile={t.tile} frame={t.frame} showMs={TRACK_SHOW_STEPS * ms.step} fadeMs={TRACK_FADE_STEPS * ms.step} />)}
            {shown.iceStairsImage && stairs.map((t) => <img key={`stairs${key(t)}`} src={shown.iceStairsImage} alt="" draggable={false} className="pointer-events-none absolute select-none [image-rendering:pixelated]" style={{ left: t.x * 16, top: t.y * 16, width: 16, height: 16 }} />)}
            {/* A lift's platform (Iron Island's), at the end the player's at (liftEnd), riding with him, under him. */}
            {shown.lifts?.map((l, i) => {
              const at = liftEnd(l, walker.tile) === 'top' ? l.top : l.bottom;
              return (
                <img
                  key={`lift${i}`}
                  src={l.image}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute select-none [image-rendering:pixelated]"
                  style={{ left: at.x * 16 + l.offset.x, top: at.y * 16 + l.offset.y, zIndex: Math.max(0, at.y - 1), transition: walker.riding ? `left ${walker.riding}ms linear, top ${walker.riding}ms linear` : undefined }}
                />
              );
            })}
            {/* The people always there (a gym's guide). */}
            {shown.npcs?.map((n, i) => <OverworldSprite key={`npc${i}`} name={n.sprite} tile={n.tile} face={n.face} grass={masked(n.tile)} longGrass={long(n.tile)} drop={drop(n.tile)} sink={sink(n.tile)} />)}
            {shown.snowballImage && shown.snowballs?.map((t) => <Snowball key={`snow${key(t)}`} tile={t} image={shown.snowballImage!} crushed={crushed.get(key(t))} drop={drop(t)} />)}
            {/* Keyed by the spot and option, not the index, so a step's change doesn't remount every figure (their transitions would snap). */}
            {placed.map((p) =>
              isApproaching(p) ? (
                <Figure
                  key={`${key(p.spot)}|${p.figure.option ?? ''}|${p.figure.title}`}
                  figure={p.figure}
                  tile={approaching!.tile}
                  spot={p.spot}
                  face={approaching!.face}
                  walkTick={approaching!.walking ? tick : undefined}
                  moveMs={approaching!.walking ? ms.step : 0}
                  wet={onWater(shown, approaching!.tile)}
                  grass={masked(approaching!.tile)}
                  longGrass={long(approaching!.tile)}
                  drop={drop(approaching!.tile)}
                  sink={sink(approaching!.tile)}
                />
              ) : (
                <Figure key={`${key(p.spot)}|${p.figure.option ?? ''}|${p.figure.title}`} figure={figureOf(p)} tile={p.tile} spot={p.spot} faded={p.faded} wet={onWater(shown, p.tile)} grass={masked(p.tile)} longGrass={long(p.tile)} drop={drop(p.tile)} sink={sink(p.tile)} />
              ),
            )}
            {/* A ledge jump's shadow on the ground under him, and the dust where he lands (FireRed's). */}
            <JumpShadow tile={walker.tile} shown={!!walker.jump} moveMs={walker.jump?.ms ?? stepMs} />
            {/* (Landing in tall grass on a Gen 3 map, the grass thrown up instead: GrassTufts.) */}
            {walker.landed && (legsHidden || !inGrass(shown, walker.landed.tile)) && <JumpDust key={walker.landed.stamp} tile={walker.landed.tile} />}
            <OverworldSprite
              name={playerName}
              bob={stillBob && bobbing}
              tile={walker.tile}
              face={redFace}
              walkTick={walker.walking ? (walker.sliding ? 0 : tick) : undefined}
              moveMs={walker.riding ?? walker.jump?.ms ?? stepMs}
              jump={walker.jump}
              fadeMs={ms.fade}
              hidden={walker.hidden}
              grass={masked(walker.tile)}
              longGrass={long(walker.tile)}
              drop={drop(walker.tile)}
              sink={sink(walker.tile)}
              title="You"
            />
            {/* The Gen 3 maps' and Diamond and Pearl's grass, after the sprites so it's over the feet of those on its row. */}
            {!legsHidden && (
              <>
                {shown.npcs?.map((n, i) => inGrass(shown, n.tile) && <TallGrass key={`npc${i}`} tile={n.tile} set={sprites} long={tuftOf(n.tile)} />)}
                {placed.map((p) =>
                  isApproaching(p) ? (
                    <GrassTufts key="approach" tile={approaching!.tile} grass={inGrass(shown, approaching!.tile)} long={tuftOf(approaching!.tile)} map={shown.image} moveMs={approaching!.walking ? ms.step : 0} set={sprites} />
                  ) : (
                    inGrass(shown, p.tile) && <TallGrass key={`${key(p.spot)}|${p.figure.option ?? ''}|${p.figure.title}`} tile={p.tile} set={sprites} long={tuftOf(p.tile)} />
                  ),
                )}
                <GrassTufts
                  tile={walker.tile}
                  grass={inGrass(shown, walker.tile)}
                  long={tuftOf(walker.tile)}
                  map={shown.image}
                  moveMs={walker.jump?.ms ?? stepMs}
                  jump={walker.jump}
                  hidden={walker.hidden}
                  set={sprites}
                />
              </>
            )}
            {/* What's over the people walking under it (a bridge): above every sprite (zIndex: their row), below the bubbles and "!";
                on a track (walked over the bridge too), only while the player is under it. */}
            {shown.overhead && (!shown.track || walker.under) && (!shown.overheadAt || overheadOn) && <img src={shown.overhead} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none [image-rendering:pixelated]" style={{ zIndex: 899 }} />}
            {/* A bridge walked over and under (the route's `bridges`): its deck over him only while he's under it. */}
            {shown.bridgeOverhead && walker.under && <img src={shown.bridgeOverhead} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none [image-rendering:pixelated]" style={{ zIndex: 899 }} />}
            {spottedFigure && <Exclamation tile={spottedFigure.tile} drop={drop(spottedFigure.tile)} />}
            {/* The step's encounters as cards beside their figures (above one standing above the player, below the others; laid
                out by layOutCards), drawn at the page's own size (scaled back from the zoom) so they're crisp; once the zoom has settled. */}
            {cardsShown &&
              layout?.cards.map((c) => (
                <div
                  key={`card${c.option}`}
                  className="absolute origin-top-left animate-[idle-fade-in_200ms_ease-out]"
                  style={{ left: walker.tile.x * 16 + 8 + c.x / zoom, top: walker.tile.y * 16 + 8 + c.y / zoom, zIndex: 950, transform: `scale(${1 / zoom})` }}
                >
                  {optionCard?.(c.option)}
                </div>
              ))}
            {cardsShown && layout?.others && (
              <div
                className="absolute flex origin-top-left animate-[idle-fade-in_200ms_ease-out] flex-col gap-1"
                style={{ left: walker.tile.x * 16 + 8 + layout.others.x / zoom, top: walker.tile.y * 16 + 8 + layout.others.y / zoom, zIndex: 950, transform: `scale(${1 / zoom})` }}
              >
                {uncarded.map((i) => (
                  <div key={i}>{optionCard?.(i)}</div>
                ))}
              </div>
            )}
            {DEBUG_BUILD && debug && showTiles && <TileOverlay route={shown} />}
          </div>
        )}
        {/* The encounter under way, over the bottom of the view: its own scrolling, never panning the map (data-no-pan). */}
        {overlay && (
          <div data-no-pan className="absolute inset-x-2 bottom-2 z-[999] max-h-[70%] cursor-auto overflow-y-auto rounded-lg shadow-xl shadow-black/60 animate-[idle-fade-in_200ms_ease-out]">
            {overlay}
          </div>
        )}
        {/* The corners: never panning the map (data-no-pan). */}
        {corners?.topLeft && (
          <div data-no-pan className="absolute left-2 top-2 z-[1000] max-w-sm cursor-auto">
            {corners.topLeft}
          </div>
        )}
        {corners?.bottomLeft && (
          <div ref={bottomLeft} data-no-pan className="pointer-events-none absolute inset-2 z-[1000] cursor-auto">
            {corners.bottomLeft}
          </div>
        )}
        {corners?.bottomRight && (
          <div ref={bottomRight} data-no-pan className="absolute bottom-2 right-2 z-[1000] cursor-auto">
            {corners.bottomRight}
          </div>
        )}
        <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-1">
          <button
            className={button}
            onClick={() => {
              setGlide({ ms: 700, ease: 'ease-in-out' });
              setOffset(centreOn(walkerRef.current.tile));
            }}
            aria-label="Centre on you"
            title="Centre on you"
          >
            <MyLocationIcon sx={{ fontSize: 16 }} />
          </button>
          {/* The walk speed: 1×, 2×, 3× in turn, an arrow more for each. */}
          <button
            className={button}
            onClick={() => {
              const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!;
              setSpeed(next);
              saveSpeed(next);
            }}
            aria-label={`Walk speed ${speed}×`}
            title={`Walk speed ${speed}× (click to change)`}
          >
            <span className="flex items-center">
              {Array.from({ length: speed }, (_, i) => (
                <ChevronRightIcon key={i} sx={{ fontSize: 16, mx: speed > 1 ? '-4.5px' : 0 }} />
              ))}
            </span>
          </button>
          {/* On a phone: the map lock (see `locked`). */}
          {phone && (
            <button
              className={`${button} ${locked ? 'ring-yellow-300' : ''}`}
              onClick={() => {
                setLocked(!locked);
                saveLocked(!locked);
                pan.endDrag();
              }}
              aria-pressed={locked}
              aria-label={locked ? 'Unlock the map' : 'Lock the map'}
              title={locked ? 'Map locked: tap to drag it around again' : 'Lock the map, so a swipe over it scrolls the page'}
            >
              {locked ? <LockIcon sx={{ fontSize: 16 }} /> : <LockOpenIcon sx={{ fontSize: 16 }} />}
            </button>
          )}
          {/* DEBUG_BUILD first: a production build drops the button altogether. */}
          {DEBUG_BUILD && debug && (
            <button
              className={`${button} ${showTiles ? 'ring-yellow-300' : ''}`}
              onClick={() => setShowTiles(!showTiles)}
              aria-pressed={showTiles}
              aria-label="Debug: show tiles"
              title="Debug: show the tiles' coordinates and walkable areas"
            >
              <GridOnIcon sx={{ fontSize: 16 }} />
            </button>
          )}
        </div>
      </div>
      {/* The handle for the view's height: drag it up or down; a double-click resets it. */}
      {!fill && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the map"
          title="Drag to resize the map (double-click to reset)"
          className="group flex h-3 cursor-ns-resize touch-none items-center justify-center"
          onPointerDown={pan.onResizeDown}
          onPointerMove={pan.onResizeMove}
          onPointerUp={pan.onResizeUp}
          onPointerCancel={pan.onResizeUp}
          onDoubleClick={pan.resetHeight}
        >
          <span className="h-1 w-12 rounded-full bg-slate-600 transition group-hover:bg-slate-400" />
        </div>
      )}
      <figcaption className="text-center text-xs text-slate-400">
        {/* The map's name is in the run's heading (RunHeader). */}
        {!atGym && target.map.spots.length > 1 && `encounter ${Math.min(position - target.first, target.map.spots.length - 1) + 1} of ${target.map.spots.length} · `}step {Math.min(position + 1, total)} of {total} · {panLocked ? 'map locked' : 'drag or scroll to look around'}
      </figcaption>
    </figure>
  );
}
