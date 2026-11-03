import { gearStateAt, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Which frame of a map's gears' turning is shown (Sunyshore Gym's, its `gears.frames`: a quarter of them a state):
 * standing still at one of the map's stops, its state as its walks there leave them (gearStateAt); each button he steps
 * onto on the way turning them on frame by frame over the turn's time (`turn`, from useWalk's `onTurn`). A new map starts
 * in state 0.
 */
export function useGears(route: Route, tile: RouteSpot, walking: boolean) {
  const count = route.gears?.frames.count ?? 0;
  const [frame, setFrame] = useState(0);
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const map = useRef(route.image);
  useEffect(() => {
    if (map.current === route.image) return;
    map.current = route.image;
    stop();
    setFrame(0);
  }, [route.image]);
  useEffect(() => {
    const at = walking || timer.current !== null ? null : gearStateAt(route, tile);
    if (at !== null) setFrame((at * count) / 4);
  }, [route, tile.x, tile.y, walking, count]);
  const turn = useCallback(
    (turns: number, ms: number) => {
      stop();
      let left = (turns * count) / 4;
      timer.current = window.setInterval(() => {
        setFrame((f) => (f + 1) % count);
        if (--left <= 0) stop();
      }, ms / left);
    },
    [count],
  );
  // Its sheet fetched ahead, so the gears never draw in late.
  useEffect(() => {
    if (route.gears) new Image().src = route.gears.frames.image;
  }, [route.gears]);
  return { frame, turn };
}
