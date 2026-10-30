import { inGrass, routePath, travelAt, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Jump } from '../components/run/RouteSprites';
import { facing, key, type PlacedFigure } from '../utils/routeFigures';
import type { Facing } from '../utils/overworld';

/**
 * How much faster than walking the player gets along a map's tile: twice as fast on a bike (Route 17, agreed with the
 * user), but on foot before a route's travel begins (travelAt: Route 110's sandy road).
 */
export const pace = (route: Route, tile: RouteSpot) => (travelAt(route, tile) === 'bike' ? 2 : 1);
/** A step's pace onto `tile`: a little slower into tall grass (GRASS_PACE, agreed with the user). */
export const stepPace = (route: Route, tile: RouteSpot) => pace(route, tile) * (inGrass(route, tile) ? GRASS_PACE : 1);
/** How fast the player wades through tall grass, of his pace elsewhere: 30% slower (agreed with the user). */
export const GRASS_PACE = 0.7;

/** The longest walk between spots, in tiles; farther (or with no path), the player fades out and back in instead. */
const MAX_WALK = 40;
/** How long the player takes to fade out, or back in; and the view's glide while he's out (through a gatehouse). */
export const FADE_MS = 300;
export const THROUGH_MS = 500;

/**
 * The player on the route map (RouteView): the map he's on (its section), where he stands (or is walking through), which
 * way he's going, whether he's faded out, whether he's under a bridge (a track's: the map's overhead drawn over him only
 * then), whether he's sliding across ice, the ledge jump he's in the middle of (`jump`) and where he last landed one
 * (`landed`, for its dust).
 */
export interface Walker {
  section: number;
  tile: RouteSpot;
  face: Facing;
  walking: boolean;
  hidden: boolean;
  under?: boolean;
  sliding?: boolean;
  jump?: Jump;
  landed?: { tile: RouteSpot; stamp: number };
}

/** How long a ledge jump takes, in steps' time: FireRed's 32 frames over its two tiles, as two steps' walk. */
export const JUMP_STEPS = 2;

/** One of the run's maps in order (the routes, then the gym), holding the steps from `first` up to `upto`. */
export interface MapSection {
  map: Route;
  first: number;
  upto: number;
}

/** How the view moves when it moves on its own (following the player, or gliding to his new spot). */
export interface Glide {
  ms: number;
  ease: string;
}

/**
 * When the run moves on: walk to the new spot (the view following; through a gatehouse, fading out at one door and back
 * in at the other), or with no walk there, fade out and back in at it. Onto the next map (route or gym): walk to this
 * one's exit first, if it has one, then fade out and back in at the next one's door. Runs only when the step (`position`)
 * changes, reading the rest as it is then; its timers are cleared when it changes again.
 */
export function useWalk({
  position,
  sections,
  targetSection,
  targetSpot,
  walkerRef,
  setWalker,
  placedRef,
  ms,
  centreOnMap,
  setGlide,
  setOffset,
}: {
  position: number;
  sections: MapSection[];
  /** The section and spot of the current step. */
  targetSection: number;
  targetSpot: RouteSpot;
  /** The player as last rendered, and his state. */
  walkerRef: RefObject<Walker>;
  setWalker: Dispatch<SetStateAction<Walker>>;
  /** The figures as last drawn, for the walk to go around them. */
  placedRef: RefObject<PlacedFigure[]>;
  /** The walk's timings at the walk speed. */
  ms: { step: number; fade: number; through: number; glide: number };
  centreOnMap: (map: Route, t: RouteSpot) => { x: number; y: number };
  setGlide: Dispatch<SetStateAction<Glide | null>>;
  setOffset: Dispatch<SetStateAction<{ x: number; y: number }>>;
}) {
  useEffect(() => {
    const { section, tile: from } = walkerRef.current;
    const target = sections[targetSection]!;
    const map = target.map;
    const to = targetSpot;
    if (section === targetSection && from.x === to.x && from.y === to.y) return;
    const timers: number[] = [];
    const later = (ms: number, then: () => void) => timers.push(window.setTimeout(then, ms));
    let t = 0;
    let start = from;
    /** Walks a path on a map from `begin`, step by step (through a link, fading out and in), from `t` on. */
    const walk = (on: Route, onSection: number, path: NonNullable<ReturnType<typeof routePath>>, begin: RouteSpot) => {
      path.forEach(({ tile, fade, under, slide, jump }, i) => {
        const face = facing(i ? path[i - 1]!.tile : begin, tile);
        if (fade) {
          later(t, () => setWalker((w) => ({ ...w, walking: false, hidden: true })));
          later(t + ms.fade, () => {
            setWalker({ section: onSection, tile, face, walking: false, hidden: true });
            setGlide({ ms: ms.through, ease: 'ease-in-out' });
            setOffset(centreOnMap(on, tile));
          });
          later(t + ms.fade + ms.through, () => setWalker((w) => ({ ...w, hidden: false })));
          t += ms.fade * 2 + ms.through;
        } else if (jump) {
          // Over a ledge (the user's): two tiles in one hop (FireRed's, JUMP_STEPS), walking as he goes, his shadow under him;
          // the dust where he lands.
          const jumpMs = ms.step * JUMP_STEPS;
          later(t, () => {
            setWalker((w) => ({ landed: w.landed, section: onSection, tile, face, walking: true, hidden: false, under, jump: { stamp: Date.now(), ms: jumpMs } }));
            setGlide({ ms: jumpMs, ease: 'linear' });
            setOffset(centreOnMap(on, tile));
          });
          later(t + jumpMs, () => setWalker((w) => ({ ...w, jump: undefined, landed: { tile, stamp: Date.now() } })));
          t += jumpMs;
        } else {
          later(t, () => {
            // Across ice: on the move, facing the way he goes, held mid-step, legs out (his walk cycle's first frame), as in the games.
            setWalker((w) => ({ landed: w.landed, section: onSection, tile, face, walking: true, hidden: false, under, sliding: slide }));
            setGlide({ ms: ms.step / stepPace(on, tile), ease: 'linear' });
            setOffset(centreOnMap(on, tile));
          });
          t += ms.step / stepPace(on, tile);
        }
      });
      later(t, () => setWalker((w) => ({ ...w, walking: false, sliding: false })));
    };
    // Into another map: walk to this one's exit (going on to the next), fade out, appear at the next one's door with the
    // view on it, fade in, then walk on from there.
    if (section !== targetSection) {
      const leaving = sections[section]?.map;
      const exit = targetSection > section ? leaving?.exit : undefined;
      if (leaving && exit) {
        const others = new Set(placedRef.current.map((p) => key(p.tile)));
        const out = from.x === exit.x && from.y === exit.y ? [] : (routePath(leaving, from, exit, others) ?? routePath(leaving, from, exit));
        if (out && out.length <= MAX_WALK) walk(leaving, section, out, from);
      }
      const door = map.entrance ?? to;
      later(t, () => setWalker((w) => ({ ...w, walking: false, hidden: true })));
      later(t + ms.fade, () => {
        setWalker({ section: targetSection, tile: door, face: 'down', walking: false, hidden: true });
        setGlide(null);
        setOffset(centreOnMap(map, door));
      });
      later(t + ms.fade + 50, () => setWalker((w) => ({ ...w, hidden: false })));
      t += ms.fade * 2 + 50;
      start = door;
    }
    // Around the people there, unless one stands in a one-tile gap (a cut-tree's, a door): then past them.
    const others = section === targetSection ? new Set(placedRef.current.map((p) => key(p.tile))) : new Set((map.stands ?? []).map(key));
    // Several people at the spot standing in a line (a row, on one y, or a column, on one x): the player comes into their
    // line of sight only as he arrives, as in the games (agreed with the user): a row's by its column first, a column's by
    // its row first.
    const there = section === targetSection ? placedRef.current.filter((p) => key(p.spot) === key(to)) : [];
    const lineOfSight =
      there.length < 2 ? undefined : there.every((p) => p.tile.y === there[0]!.tile.y) ? 'row' : there.every((p) => p.tile.x === there[0]!.tile.x) ? 'column' : undefined;
    const path = start.x === to.x && start.y === to.y ? [] : (routePath(map, start, to, others, lineOfSight) ?? routePath(map, start, to, new Set(), lineOfSight));
    // A track is walked however long it is (the gym's one way through).
    if (path && (path.length <= MAX_WALK || map.track)) {
      walk(map, targetSection, path, start);
    } else {
      later(t, () => setWalker((w) => ({ ...w, walking: false, hidden: true })));
      later(t + ms.fade, () => {
        setWalker({ section: targetSection, tile: to, face: 'up', walking: false, hidden: true });
        setGlide({ ms: ms.glide, ease: 'ease-in-out' });
        setOffset(centreOnMap(map, to));
      });
      later(t + ms.fade + ms.glide, () => setWalker((w) => ({ ...w, hidden: false })));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Only when the step changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);
}
