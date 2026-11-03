import { snowTrack, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useEffect, useRef, useState } from 'react';

/** How long a track stays whole, then how long it takes to fade, in steps' time (ov5_021F1FE4: 16 frames, then 16 fading, a walk's step 8). */
export const TRACK_SHOW_STEPS = 2;
export const TRACK_FADE_STEPS = 2;

/** A track left in the snow: where, its frame of snow_tracks.png (snowTrack), and an id for its key. */
export interface Track {
  id: number;
  tile: RouteSpot;
  frame: number;
}

let tracks = 0;

/**
 * The tracks someone walking leaves in the snow (the route's `snow`; drawn by SnowTrack): each step off a tile of snow
 * to the next tile leaves its track on it once the step's done (`stepMs` later, as Diamond's map_object_move.c does at
 * the step's end), gone TRACK_SHOW_STEPS + TRACK_FADE_STEPS steps (`step`, a walk's at the walk speed) after. None from
 * a jump, a fade or a slide's no-step; a new map starts with none.
 */
export function useSnowTracks(route: Route, mover: { tile: RouteSpot; walking: boolean; hidden?: boolean; jumping?: boolean } | null, stepMs: number, step: number) {
  const [left, setLeft] = useState<Track[]>([]);
  const last = useRef<{ tile: RouteSpot; came?: Route['flow']; image: string } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const was = last.current;
    if (!mover) {
      last.current = null;
      return;
    }
    last.current = { tile: mover.tile, image: route.image, came: was?.came };
    if (!was || was.image !== route.image) {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      if (was) setLeft([]);
      return;
    }
    const dx = mover.tile.x - was.tile.x;
    const dy = mover.tile.y - was.tile.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1 || !mover.walking || mover.hidden || mover.jumping) {
      last.current.came = undefined;
      return;
    }
    const way = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    last.current.came = way;
    // The way he came onto it: the step before's, or (from standing) this one's.
    const frame = snowTrack(route, was.tile, way, was.came);
    if (frame === null) return;
    const track = { id: ++tracks, tile: was.tile, frame };
    timers.current.push(
      window.setTimeout(() => setLeft((ts) => [...ts, track]), stepMs),
      window.setTimeout(() => setLeft((ts) => ts.filter((t) => t.id !== track.id)), stepMs + (TRACK_SHOW_STEPS + TRACK_FADE_STEPS) * step),
    );
    // On each step (the tile he's walking onto), or a new map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mover?.tile.x, mover?.tile.y, route.image, !mover]);
  // Standing still a while, the next step starts straight.
  useEffect(() => {
    if (mover && !mover.walking && last.current) last.current.came = undefined;
  }, [mover?.walking]);
  return left;
}
