import { snowballsLeft, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useCallback, useEffect, useRef, useState } from 'react';
import { key } from '../utils/routeFigures';

/**
 * Which of a map's snowballs (Snowpoint Gym's, its `snowballs`) are crushed, by tile key: when (a Date.now() stamp, for
 * the crush to play), or 0 for one crushed before the player came to where he stands (gone at once). Standing still at one
 * of the map's stops, as its walks there have them (snowballsLeft); each one slid into on the way crushed as he gets to it
 * (`crush`, from useWalk's `onCrush`). A new map starts with them all whole.
 */
export function useSnowballs(route: Route, tile: RouteSpot, walking: boolean) {
  const [crushed, setCrushed] = useState<Map<string, number>>(() => new Map());
  const map = useRef(route.image);
  useEffect(() => {
    if (map.current === route.image) return;
    map.current = route.image;
    setCrushed(new Map());
  }, [route.image]);
  useEffect(() => {
    const left = !walking && snowballsLeft(route, tile);
    if (!left) return;
    const whole = new Set(left.map(key));
    // Those crushed by the walks there: kept as they are if they've been crushed already (playing), gone if not.
    setCrushed((c) => new Map((route.snowballs ?? []).filter((t) => !whole.has(key(t))).map((t) => [key(t), c.get(key(t)) ?? 0])));
  }, [route, tile.x, tile.y, walking]);
  const crush = useCallback((t: RouteSpot) => setCrushed((c) => new Map(c).set(key(t), Date.now())), []);
  // The picture fetched ahead, so the snowballs never draw in late.
  useEffect(() => {
    if (route.snowballImage) new Image().src = route.snowballImage;
  }, [route.snowballImage]);
  return { crushed, crush };
}
