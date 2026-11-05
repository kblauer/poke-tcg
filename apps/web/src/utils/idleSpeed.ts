import { useEffect, useState } from 'react';
import { DEBUG_BUILD } from './debug';

/**
 * The Idle Adventure's playback speed (debug mode's, the user's, 2026-11-04: ×3 to test what's far into a run): every
 * wait, step and animation of the playback that many times faster, and each next segment asked for with the debug-only
 * idle.debugNext (the server counting it played that much faster). 1 outside debug mode.
 */
let speed = 1;
export const idleSpeed = () => speed;

const KEY = 'poke-tcg.idle-speed';

/** The speed and its toggle, kept in the browser; only `debug` (a debug build with the debug tools on) speeds anything up. */
export function useIdleSpeed(debug: boolean): [number, (fast: boolean) => void] {
  const [fast, setFast] = useState(() => DEBUG_BUILD && localStorage.getItem(KEY) === '3');
  speed = debug && fast ? 3 : 1;
  useEffect(() => () => void (speed = 1), []);
  return [speed, (on: boolean) => (localStorage.setItem(KEY, on ? '3' : '1'), setFast(on))];
}
