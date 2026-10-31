import { useEffect, useRef, useState } from 'react';
import type { SpriteSet } from '../utils/overworld';

/** How long each frame of tall grass's rustle shows (FireRed's and Emerald's sAnim_TallGrass: 10 of their 60 frames a second). */
export const GRASS_FRAME_MS = 167;
/** The rustle's frames in order (sAnim_TallGrass): the tuft, the leaves flying off it, then the grass at rest (frame 0). */
export const RUSTLE = [1, 2, 3, 4, 0];
/** How long the rustle takes, after which the grass is at rest. */
const RUSTLE_MS = RUSTLE.length * GRASS_FRAME_MS;
/**
 * Emerald's long grass's rustle (sAnim_LongGrass, Route 119's very tall grass): its frames and how many of the game's 60
 * frames a second each shows, ending at rest (frame 0).
 */
export const LONG_RUSTLE: [frame: number, ticks: number][] = [[1, 3], [2, 3], [0, 4], [3, 4], [0, 4], [3, 4], [0, 4]];
/** How long long grass's rustle takes. */
const LONG_RUSTLE_MS = (LONG_RUSTLE.reduce((n, [, t]) => n + t, 0) * 1000) / 60;

/** A tuft of tall grass drawn over someone (TallGrass): its tile, whether it rustles, when it began, and whether it's long grass (or its foot, 'edge'). */
export interface GrassTuft {
  key: number;
  x: number;
  y: number;
  rustle: boolean;
  at: number;
  long: boolean | 'edge';
}

/**
 * The tall grass over someone walking as FireRed's ground effects make it (event_object_movement.c, field_effect_helpers.c;
 * Emerald's the same, `set` its pictures): put on a tile of tall grass (`grass`: the map shown, after a fade or a battle) the grass at rest over his feet
 * (GroundEffect_SpawnOnTallGrass); each step into it a new tuft rustling, from the step's start (StepOnTallGrass); a ledge
 * jump none on the way, but landing in it the grass thrown up (`splash`, JumpDust's `grass`) and a tuft at rest if there's
 * none (JumpOnTallGrass). A tuft stays while he's on its tile or has just left it (drawn over him as he steps out), and
 * goes once he's off both and its rustle is over (UpdateTallGrassFieldEffect). `map` is the map shown: a new one starts over.
 * `long`: the tile is Emerald's long grass, whose tufts are its own (FldEff_LongGrass, the same rules); 'edge', its foot
 * (onLongGrassEdge: long grass's tufts cut off above the band of ground).
 */
export function useTallGrass({ tile, grass, long = false, map, moveMs, jump, set = 'frlg' }: { tile: { x: number; y: number }; grass: boolean; long?: boolean | 'edge'; map: string; moveMs: number; jump?: { ms: number } | null; set?: SpriteSet }) {
  const keys = useRef(0);
  const tuft = (rustle: boolean): GrassTuft => ({ key: ++keys.current, x: tile.x, y: tile.y, rustle, at: Date.now(), long });
  const [tufts, setTufts] = useState<GrassTuft[]>(() => (grass ? [tuft(false)] : []));
  const [splash, setSplash] = useState<{ stamp: number; tile: { x: number; y: number } } | null>(null);
  const last = useRef({ x: tile.x, y: tile.y, map });
  useEffect(() => {
    const was = last.current;
    if (was.x === tile.x && was.y === tile.y && was.map === map) return;
    last.current = { x: tile.x, y: tile.y, map };
    // Put there (a fade, a new map): only the grass he stands in.
    if (!moveMs || was.map !== map) return setTufts(grass ? [tuft(false)] : []);
    const now = Date.now();
    const keep = (t: GrassTuft) => !(t.x === tile.x && t.y === tile.y) && ((t.x === was.x && t.y === was.y) || now - t.at < (t.long ? LONG_RUSTLE_MS : RUSTLE_MS));
    if (!jump) return setTufts((old) => [...old.filter(keep), ...(grass ? [tuft(true)] : [])]);
    setTufts((old) => old.filter(keep));
    if (!grass) return;
    const landed = { x: tile.x, y: tile.y };
    const timer = window.setTimeout(() => {
      setSplash({ stamp: Date.now(), tile: landed });
      setTufts((old) => (old.some((t) => t.x === landed.x && t.y === landed.y) ? old : [...old, { key: ++keys.current, ...landed, rustle: false, at: Date.now(), long }]));
    }, jump.ms);
    return () => window.clearTimeout(timer);
    // Only as he moves (the step's time and the jump are the ones it starts with).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile.x, tile.y, map]);
  // The grass's picture fetched ahead, so the first rustle never draws in late.
  useEffect(() => {
    const dir = set === 'rse' ? 'rse/' : '';
    new Image().src = `/overworld/${dir}tall_grass.png`;
    new Image().src = `/overworld/${dir}jump_tall_grass.png`;
    if (set === 'rse') new Image().src = '/overworld/rse/long_grass.png';
  }, [set]);
  return { tufts, splash };
}
