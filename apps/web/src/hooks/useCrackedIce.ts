import { onThinIce, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useEffect, useRef, useState } from 'react';

/** How long after the player is on a tile of thin ice it cracks: Emerald's 4 frames (SootopolisGymIcePerStepCallback's tDelay). */
const CRACK_DELAY_MS = (4 * 1000) / 60;
/** How long after the last tile of a section cracks its stairs appear: Emerald's 40 frames (its script's `delay 40`). */
const STAIRS_DELAY_MS = (40 * 1000) / 60;

/**
 * The tiles of a map's thin ice (Sootopolis Gym's, its `thinIce`) the player has cracked, and its stairs that have
 * appeared (its `iceStairs`, each once that many tiles are cracked): each tile he steps onto cracks once he's there
 * (`moveMs`, the step's time, later), then CRACK_DELAY_MS on, as Emerald's does, and stays cracked until the map changes
 * (the user's); a set of stairs appears STAIRS_DELAY_MS after the crack that makes its count. Being put on one (a fade)
 * cracks nothing; only stepping onto it.
 */
export function useCrackedIce(route: Route, tile: RouteSpot, moveMs: number) {
  const [cracked, setCracked] = useState<RouteSpot[]>([]);
  const [stairs, setStairs] = useState(0);
  const map = useRef(route.image);
  const timers = useRef<number[]>([]);
  // A new map starts uncracked, and a crack still waiting from the last one never lands on it.
  useEffect(() => {
    if (map.current === route.image) return;
    map.current = route.image;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setCracked([]);
    setStairs(0);
  }, [route.image]);
  useEffect(() => {
    if (!moveMs || !onThinIce(route, tile)) return;
    const at = { x: tile.x, y: tile.y };
    // Not cleared on the next step: he steps on before this one cracks.
    timers.current.push(window.setTimeout(() => setCracked((c) => (c.some((t) => t.x === at.x && t.y === at.y) ? c : [...c, at])), moveMs + CRACK_DELAY_MS));
    // Only as he moves (the step's time is the one it starts with).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.x, tile.y, route.image]);
  // The stairs whose count the cracks have reached, each its delay later.
  const due = (route.iceStairs ?? []).filter((s) => cracked.length >= s.cracks).length;
  useEffect(() => {
    if (due <= stairs) return;
    timers.current.push(window.setTimeout(() => setStairs((n) => Math.max(n, due)), STAIRS_DELAY_MS));
  }, [due, stairs]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  // The pictures fetched ahead, so the first crack and stairs never draw in late.
  useEffect(() => {
    for (const src of [route.crackedIce, route.iceStairsImage]) if (src) new Image().src = src;
  }, [route.crackedIce, route.iceStairsImage]);
  return { cracked, stairs: (route.iceStairs ?? []).slice(0, stairs).flatMap((s) => s.tiles) };
}
