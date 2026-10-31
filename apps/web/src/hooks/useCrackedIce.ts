import { onThinIce, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useEffect, useRef, useState } from 'react';

/** How long after the player is on a tile of thin ice it cracks: Emerald's 4 frames (SootopolisGymIcePerStepCallback's tDelay). */
const CRACK_DELAY_MS = (4 * 1000) / 60;

/**
 * The tiles of a map's thin ice (Sootopolis Gym's, its `thinIce`) the player has cracked: each one he steps onto cracks
 * once he's there (`moveMs`, the step's time, later), then CRACK_DELAY_MS on, as Emerald's does, and stays cracked until
 * the map changes (the user's). Being put on one (a fade) cracks nothing; only stepping onto it.
 */
export function useCrackedIce(route: Route, tile: RouteSpot, moveMs: number) {
  const [cracked, setCracked] = useState<RouteSpot[]>([]);
  const map = useRef(route.image);
  const timers = useRef<number[]>([]);
  // A new map starts uncracked, and a crack still waiting from the last one never lands on it.
  useEffect(() => {
    if (map.current === route.image) return;
    map.current = route.image;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setCracked([]);
  }, [route.image]);
  useEffect(() => {
    if (!moveMs || !onThinIce(route, tile)) return;
    const at = { x: tile.x, y: tile.y };
    // Not cleared on the next step: he steps on before this one cracks.
    timers.current.push(window.setTimeout(() => setCracked((c) => (c.some((t) => t.x === at.x && t.y === at.y) ? c : [...c, at])), moveMs + CRACK_DELAY_MS));
    // Only as he moves (the step's time is the one it starts with).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.x, tile.y, route.image]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  // The cracked ice's picture fetched ahead, so the first crack never draws in late.
  useEffect(() => {
    if (route.crackedIce) new Image().src = route.crackedIce;
  }, [route.crackedIce]);
  return cracked;
}
