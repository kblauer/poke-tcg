import { useEffect, useRef, useState } from 'react';
import type { SpriteSet } from '../utils/overworld';

/** How long each frame of tall grass's rustle shows (FireRed's and Emerald's sAnim_TallGrass: 10 of their 60 frames a second). */
export const GRASS_FRAME_MS = 167;
/** The rustle's frames in order (sAnim_TallGrass): the tuft, the leaves flying off it, then the grass at rest (frame 0). */
export const RUSTLE = [1, 2, 3, 4, 0];
/** How long the rustle takes, after which the grass is at rest. */
const RUSTLE_MS = RUSTLE.length * GRASS_FRAME_MS;

/** A tuft of tall grass drawn over someone (TallGrass): its tile, whether it rustles, and when it began. */
export interface GrassTuft {
  key: number;
  x: number;
  y: number;
  rustle: boolean;
  at: number;
}

/**
 * The tall grass over someone walking as FireRed's ground effects make it (event_object_movement.c, field_effect_helpers.c;
 * Emerald's the same, `set` its pictures): put on a tile of tall grass (`grass`: the map shown, after a fade or a battle) the grass at rest over his feet
 * (GroundEffect_SpawnOnTallGrass); each step into it a new tuft rustling, from the step's start (StepOnTallGrass); a ledge
 * jump none on the way, but landing in it the grass thrown up (`splash`, JumpDust's `grass`) and a tuft at rest if there's
 * none (JumpOnTallGrass). A tuft stays while he's on its tile or has just left it (drawn over him as he steps out), and
 * goes once he's off both and its rustle is over (UpdateTallGrassFieldEffect). `map` is the map shown: a new one starts over.
 */
export function useTallGrass({ tile, grass, map, moveMs, jump, set = 'frlg' }: { tile: { x: number; y: number }; grass: boolean; map: string; moveMs: number; jump?: { ms: number } | null; set?: SpriteSet }) {
  const keys = useRef(0);
  const tuft = (rustle: boolean): GrassTuft => ({ key: ++keys.current, x: tile.x, y: tile.y, rustle, at: Date.now() });
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
    const keep = (t: GrassTuft) => !(t.x === tile.x && t.y === tile.y) && ((t.x === was.x && t.y === was.y) || now - t.at < RUSTLE_MS);
    if (!jump) return setTufts((old) => [...old.filter(keep), ...(grass ? [tuft(true)] : [])]);
    setTufts((old) => old.filter(keep));
    if (!grass) return;
    const landed = { x: tile.x, y: tile.y };
    const timer = window.setTimeout(() => {
      setSplash({ stamp: Date.now(), tile: landed });
      setTufts((old) => (old.some((t) => t.x === landed.x && t.y === landed.y) ? old : [...old, { key: ++keys.current, ...landed, rustle: false, at: Date.now() }]));
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
  }, [set]);
  return { tufts, splash };
}
