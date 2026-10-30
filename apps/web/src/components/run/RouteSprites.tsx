import { inGrass, ledgeAt, onIce, onPath, onWater, type EncounterKind, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useEffect, useRef, useState } from 'react';
import { GRASS_FRAME_MS, RUSTLE, useTallGrass } from '../../hooks/useTallGrass';
import { FADE_MS } from '../../hooks/useWalk';
import { bobFrame, bobs, isItemBall, mirrored, spriteHeight, spriteWidth, standFrame, stripFrames, surfBobs, walkFrame, waterSprite, type Facing, type SpriteSet } from '../../utils/overworld';
import { facing, type RouteFigure } from '../../utils/routeFigures';
import { ENCOUNTER_STYLE } from './encounterIcons';

/**
 * What's drawn on the route map (RouteView), in map pixels: the overworld sprites (the player's, the figures'), a
 * figure with its speech bubble, the "!" over a spotted trainer, a ledge jump's shadow and landing dust, and the debug
 * tile overlay.
 */

/**
 * How high a sprite is over the ground through a ledge jump, in map pixels (up is negative), from its start to its
 * landing: FireRed's own (sJumpY_High, its "high" jump), each step of it held for 2 of the jump's 32 frames.
 */
const JUMP_Y = [-4, -6, -8, -10, -11, -12, -12, -12, -11, -10, -9, -8, -6, -4, 0, 0];

/** A ledge jump under way: its stamp (each jump's own, to play it once) and how long it takes. */
export interface Jump {
  stamp: number;
  ms: number;
}

/** The route's walkable areas: each walkable tile's area number (from 1), tiles joined 4 ways; 0 for others. */
function walkableAreas(route: Route): number[][] {
  const areas = route.walkable.map((row) => [...row].map(() => 0));
  let next = 0;
  route.walkable.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (!onPath(route, { x, y }) || areas[y]![x]) return;
      next++;
      const queue: RouteSpot[] = [{ x, y }];
      areas[y]![x] = next;
      while (queue.length) {
        const t = queue.shift()!;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const n = { x: t.x + dx, y: t.y + dy };
          if (!onPath(route, n) || areas[n.y]![n.x]) continue;
          areas[n.y]![n.x] = next;
          queue.push(n);
        }
      }
    }),
  );
  return areas;
}

/**
 * Debug (the Show tiles button, debug builds only; also the entrance, IN, and exit, OUT, dashed): a grid over the map with every tile's x,y (hovering one tells its
 * walkable area: tiles joined 4 ways; a walk can't cross between areas), the tiles that can't be walked on red, ledges amber with an arrow the way they're jumped (ledgeAt; never stood on), tall grass green, ice cyan, and on a surfed route water a faint blue and land a faint tan (where the player surfs or walks), and each spot outlined with its number,
 * to tell where walking connections should be.
 */
/** A ledge's arrow on the debug grid: the way it's jumped. */
const LEDGE_ARROWS = { down: '▼', up: '▲', left: '◀', right: '▶' } as const;

export function TileOverlay({ route }: { route: Route }) {
  const areas = walkableAreas(route);
  return (
    <div className="pointer-events-auto absolute inset-0 select-none" style={{ zIndex: 2000 }}>
      {areas.flatMap((row, y) =>
        row.map((area, x) => {
          const ledge = ledgeAt(route, { x, y });
          return (
            <div
              key={`${x},${y}`}
              title={`${x},${y}${ledge ? ` · ledge, jumped going ${ledge}` : area ? ` · walkable area ${area}` : ' · not walkable'}${inGrass(route, { x, y }) ? ' · tall grass' : ''}${onIce(route, { x, y }) ? ' · ice' : ''}${area && route.travel === 'surf' ? (onWater(route, { x, y }) ? ' · water' : ' · land') : ''}`}
              className="absolute flex items-center justify-center font-mono leading-none"
              style={{
                left: x * 16,
                top: y * 16,
                width: 16,
                height: 16,
                fontSize: 4.5,
                boxShadow: 'inset 0 0 0 0.25px rgba(15,23,42,0.6)',
                background: ledge ? 'rgba(245,158,11,0.6)' : !area ? 'rgba(220,38,38,0.4)' : inGrass(route, { x, y }) ? 'rgba(34,197,94,0.4)' : onIce(route, { x, y }) ? 'rgba(34,211,238,0.3)' : route.travel !== 'surf' ? undefined : onWater(route, { x, y }) ? 'rgba(59,130,246,0.2)' : 'rgba(210,180,140,0.3)',
                color: '#0f172a',
              }}
            >
              {ledge ? <span className="font-sans font-bold" style={{ fontSize: 9 }}>{LEDGE_ARROWS[ledge]}</span> : `${x},${y}`}
            </div>
          );
        }),
      )}
      {route.spots.map((s, i) => (
        <div
          key={i}
          className="absolute flex items-start justify-start font-bold leading-none text-white"
          style={{ left: s.x * 16, top: s.y * 16, width: 16, height: 16, boxShadow: 'inset 0 0 0 1px #dc2626', fontSize: 5, textShadow: '0 0 1px #000' }}
        >
          {i + 1}
        </div>
      ))}
      {/* The spots the map's other version uses (a gym's Gym Trainer spot, on its leader-only version): dotted orange, G1… */}
      {route.otherSpots?.map((s, i) => (
        <div
          key={`other${i}`}
          title={`The gym run's encounter ${i + 1} (${s.x},${s.y})`}
          className="absolute flex items-start justify-start font-bold leading-none text-white"
          style={{ left: s.x * 16, top: s.y * 16, width: 16, height: 16, outline: '1px dotted #f97316', outlineOffset: -1, fontSize: 5, textShadow: '0 0 1px #000' }}
        >
          G{i + 1}
        </div>
      ))}
      {/* Where the player comes in (IN) and leaves (OUT): a dashed outline, apart from the spots' solid red one. */}
      {[
        { tile: route.entrance, label: 'IN', colour: '#22c55e' },
        { tile: route.exit, label: 'OUT', colour: '#3b82f6' },
      ].map(({ tile, label, colour }) =>
        tile ? (
          <div
            key={label}
            title={`${label === 'IN' ? 'Entrance' : 'Exit'} ${tile.x},${tile.y}`}
            className="absolute flex items-end justify-center font-bold leading-none text-white"
            style={{ left: tile.x * 16, top: tile.y * 16, width: 16, height: 16, outline: `1px dashed ${colour}`, outlineOffset: -1, background: `${colour}55`, fontSize: 5, textShadow: '0 0 1px #000' }}
          >
            {label}
          </div>
        ) : null,
      )}
    </div>
  );
}

/**
 * FireRed's "!" balloon over a figure's head (`public/overworld/exclamation.png`, from the decompilation's emoticons): it
 * pops open over three frames, as when a trainer spots you, and stays.
 */
export function Exclamation({ tile }: { tile: RouteSpot }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timers = [window.setTimeout(() => setFrame(1), 70), window.setTimeout(() => setFrame(2), 140)];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  return (
    <div
      className="pointer-events-none absolute [image-rendering:pixelated]"
      style={{
        left: tile.x * 16,
        // Just over the head (the sprite's top is 16px above its tile), touching it as in the games.
        top: tile.y * 16 - 28,
        width: 16,
        height: 16,
        backgroundImage: 'url(/overworld/exclamation.png)',
        backgroundSize: '48px 16px',
        backgroundPosition: `${-frame * 16}px 0`,
        zIndex: 1500,
      }}
    />
  );
}

/** See-through pixels on each side of every frame of a sprite's strip as drawn (useGutteredStrip). */
const GUTTER = 2;
const guttered = new Map<string, Promise<string>>();

/**
 * A sprite's strip redrawn with GUTTER see-through pixels each side of every frame (a data URL), made once per sprite and
 * kept: drawn zoomed by a fraction (the Battle Tower's scenes) or between whole pixels (walking), the browser samples a
 * sliver of the frame next to the one shown, and a neighbour's outline showed as a dark line beside the sprite (Red's
 * walking-down frame beside his walking-up one; the user's screenshot). With a gutter, that sliver is see-through.
 * Undefined until it's made (the file is drawn meanwhile).
 */
function useGutteredStrip(name: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    let made = guttered.get(name);
    if (!made) {
      made = new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const w = spriteWidth(name);
          const h = spriteHeight(name);
          const frames = stripFrames(name);
          const canvas = document.createElement('canvas');
          canvas.width = frames * (w + 2 * GUTTER);
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('No canvas'));
          for (let f = 0; f < frames; f++) ctx.drawImage(img, f * w, 0, w, h, f * (w + 2 * GUTTER) + GUTTER, 0, w, h);
          resolve(canvas.toDataURL());
        };
        img.onerror = reject;
        img.src = `/overworld/${name}.png`;
      });
      // A failure is tried again next time (the file is drawn meanwhile).
      made.catch(() => guttered.delete(name));
      guttered.set(name, made);
    }
    made.then((u) => live && setUrl(u), () => {});
    return () => {
      live = false;
    };
  }, [name]);
  return url;
}

/**
 * A FireRed overworld sprite standing on a tile (its feet on the tile, its head on the one above), facing a way, in map
 * pixels; lower on the map is in front, as in the game. `frame` shows another frame of its strip (a walking one), `moveMs`
 * slides it to a new tile over that long (a step), and `hidden` fades it out. `grass`: on a tile of tall grass, its
 * bottom (GRASS_HIDES) fades out (GRASS_MASK), so the grass drawn on the map shows there instead, as in the games (agreed with the user);
 * stepping or jumping into it, only once it's there (`moveMs` later, the user's), stepping out of it, at once.
 */
export function OverworldSprite({
  name,
  tile,
  face,
  title,
  faded,
  walkTick,
  bob = false,
  moveMs = 0,
  fadeMs = FADE_MS,
  hidden = false,
  grass = false,
  jump,
}: {
  name: string;
  tile: RouteSpot;
  face: Facing;
  title?: string;
  faded?: boolean;
  /** While walking: how far into its walk cycle it is (walkFrame). */
  walkTick?: number;
  /** Standing still: in the low half of its bob (a sprite that bobs, bobFrame). */
  bob?: boolean;
  moveMs?: number;
  fadeMs?: number;
  hidden?: boolean;
  grass?: boolean;
  /** Jumping a ledge: it rises and falls along JUMP_Y over the jump's time (as it slides to the landing tile, `moveMs`). */
  jump?: Jump;
}) {
  const el = useRef<HTMLDivElement>(null);
  const flip = mirrored(name, face) ? 'scaleX(-1) ' : '';
  useEffect(() => {
    if (!jump || !el.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.current.animate(
      JUMP_Y.map((y, i) => ({ transform: `${flip}translateY(${y}px)`, offset: i / (JUMP_Y.length - 1) })),
      { duration: jump.ms, easing: 'linear' },
    );
    // Each jump once (its stamp).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.stamp]);
  const w = spriteWidth(name);
  const strip = useGutteredStrip(name);
  // An item ball stays whole (it lies in the grass, one tile tall).
  const inGrass = grass && !isItemBall(name);
  const [sunk, setSunk] = useState(inGrass);
  useEffect(() => {
    if (!inGrass || !moveMs) return setSunk(inGrass);
    const timer = window.setTimeout(() => setSunk(true), moveMs);
    return () => window.clearTimeout(timer);
    // Only on going into or out of the grass (the move's time is the one it starts with).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGrass]);
  const frame = walkTick !== undefined ? walkFrame(name, face, walkTick) : bob && bobs(name) ? bobFrame(name, face) : standFrame(name, face);
  return (
    <div
      ref={el}
      title={title}
      className={`absolute [image-rendering:pixelated] ${faded ? 'opacity-50' : ''} ${surfBobs(name) ? SURF_BOB : ''}`}
      style={{
        transition: `left ${moveMs}ms linear, top ${moveMs}ms linear, opacity ${fadeMs}ms`,
        opacity: hidden ? 0 : undefined,
        left: tile.x * 16 + 8 - w / 2,
        top: tile.y * 16 - 16,
        width: w,
        height: spriteHeight(name),
        // The strip with see-through gutters between its frames once it's made (useGutteredStrip), the file till then.
        backgroundImage: `url(${strip ?? `/overworld/${name}.png`})`,
        backgroundSize: `${(w + (strip ? 2 * GUTTER : 0)) * stripFrames(name)}px ${spriteHeight(name)}px`,
        backgroundPosition: `${strip ? -frame * (w + 2 * GUTTER) - GUTTER : -frame * w}px 0`,
        backgroundRepeat: 'no-repeat',
        transform: mirrored(name, face) ? 'scaleX(-1)' : undefined,
        ...(inGrass && sunk && GRASS_MASK),
        ...(surfBobs(name) && spriteHeight(name) === 32 && SURF_MASK),
        zIndex: tile.y,
      }}
    />
  );
}

/**
 * The shadow under a sprite jumping a ledge (FireRed's, `shadow.png`: 16x8, its bottom at the sprite's feet), on the ground
 * while the sprite rises over it; there only while it jumps (`shown`), following the sprite's tile (`moveMs`).
 */
export function JumpShadow({ tile, shown, moveMs }: { tile: RouteSpot; shown: boolean; moveMs: number }) {
  return (
    <div
      className="pointer-events-none absolute [image-rendering:pixelated]"
      style={{
        left: tile.x * 16,
        top: tile.y * 16 + 8,
        width: 16,
        height: 8,
        backgroundImage: 'url(/overworld/shadow.png)',
        opacity: shown ? 1 : 0,
        transition: `left ${moveMs}ms linear, top ${moveMs}ms linear`,
        // Under the sprite on its row (sprites are drawn at their row).
        zIndex: tile.y - 1,
      }}
    />
  );
}

/** How long each of the landing dust's 3 frames shows (FireRed's: 8 of its 60 frames a second). */
const DUST_FRAME_MS = 133;

/**
 * The dust where a ledge jump lands (FireRed's ground impact dust, `jump_dust.png`: 3 frames of 16x8, stacked), played once;
 * `grass`, landing in tall grass, the grass thrown up instead (FLDEFF_JUMP_TALL_GRASS, `jump_tall_grass.png`: 4 frames; on
 * Emerald's maps, `set` 'rse', its own).
 */
export function JumpDust({ tile, grass = false, set = 'frlg' }: { tile: RouteSpot; grass?: boolean; set?: SpriteSet }) {
  const frames = grass ? 4 : 3;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timers = Array.from({ length: frames }, (_, i) => window.setTimeout(() => setFrame(i + 1), (i + 1) * DUST_FRAME_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [frames]);
  if (frame >= frames) return null;
  return (
    <div
      className="pointer-events-none absolute [image-rendering:pixelated]"
      style={{ left: tile.x * 16, top: tile.y * 16 + 8, width: 16, height: 8, backgroundImage: `url(/overworld/${grass ? `${grassDir(set)}jump_tall_grass` : 'jump_dust'}.png)`, backgroundPosition: `0 ${-frame * 8}px`, zIndex: tile.y + 1 }}
    />
  );
}

/** Where a map's tall grass pictures are: FireRed's, or Emerald's on the Hoenn maps (tools/routes/jump_effects.py). */
const grassDir = (set: SpriteSet) => (set === 'rse' ? 'rse/' : '');

/**
 * Tall grass drawn over someone standing in it, on its tile (FireRed's FLDEFF_TALL_GRASS, `tall_grass.png`: 5 frames of
 * 16x16, stacked): at rest (frame 0, its blades over their feet) or, `rustle`, rustling as they step in (frames 1 to 4,
 * then at rest). Drawn after the sprites: in front of one on its row or above it, behind one below it (on a higher
 * zIndex), as the game layers them; and during the rustle's first frame behind the one stepping in too (its subpriority
 * 4 more then: UpdateTallGrassFieldEffect). Emerald's (`set` 'rse') works the same, with its own pictures.
 */
export function TallGrass({ tile, rustle = false, set = 'frlg' }: { tile: RouteSpot; rustle?: boolean; set?: SpriteSet }) {
  const [step, setStep] = useState(rustle ? 0 : RUSTLE.length - 1);
  useEffect(() => {
    if (!rustle) return;
    const timers = RUSTLE.slice(1).map((_, i) => window.setTimeout(() => setStep(i + 1), (i + 1) * GRASS_FRAME_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [rustle]);
  const frame = RUSTLE[step]!;
  return (
    <div
      className="pointer-events-none absolute [image-rendering:pixelated]"
      style={{ left: tile.x * 16, top: tile.y * 16, width: 16, height: 16, backgroundImage: `url(/overworld/${grassDir(set)}tall_grass.png)`, backgroundPosition: `0 ${-frame * 16}px`, zIndex: frame === 1 ? Math.max(0, tile.y - 1) : tile.y }}
    />
  );
}

/**
 * The tall grass over someone walking (useTallGrass: rustling as they step in, at rest where they're put, thrown up where a
 * ledge jump lands in it), on `map` (its picture: a new one starts over); none while they're `hidden` (faded out).
 */
export function GrassTufts({ tile, grass, map, moveMs, jump, hidden = false, set = 'frlg' }: { tile: RouteSpot; grass: boolean; map: string; moveMs: number; jump?: { ms: number } | null; hidden?: boolean; set?: SpriteSet }) {
  const { tufts, splash } = useTallGrass({ tile, grass, map, moveMs, jump, set });
  if (hidden) return null;
  return (
    <>
      {tufts.map((t) => (
        <TallGrass key={t.key} tile={t} rustle={t.rustle} set={set} />
      ))}
      {splash && <JumpDust key={splash.stamp} tile={splash.tile} grass set={set} />}
    </>
  );
}

/** How much of someone standing in tall grass it hides, in map pixels: the bottom half of their tile, their feet and legs. */
const GRASS_HIDES = 8;
/** Over how many map pixels, across that line, they fade into the grass (the user's, in place of a hard edge). */
const GRASS_FADE = 4;
/** The mask hiding their bottom in tall grass: whole down to GRASS_FADE / 2 above the line, gone GRASS_FADE / 2 below it. */
const GRASS_MASK = (() => {
  const line = 32 - GRASS_HIDES;
  const mask = `linear-gradient(to bottom, black ${line - GRASS_FADE / 2}px, transparent ${line + GRASS_FADE / 2}px)`;
  return { maskImage: mask, WebkitMaskImage: mask };
})();

/**
 * Gen 3's surfing player's bottom fading into the water (the user's, in place of the sprite's hard edge), in map pixels;
 * FireRed's Red's and Leaf's only (the user's: Brendan's and May's are Emerald's whole, the blob under them round to its
 * bottom: spriteHeight).
 */
const SURF_FADE = 3;
const SURF_MASK = (() => {
  const mask = `linear-gradient(to bottom, black ${32 - SURF_FADE}px, transparent 32px)`;
  return { maskImage: mask, WebkitMaskImage: mask };
})();

/** The surf bob (index.css's `surf-bob`): on anything the surfing player carries along (the Idle Adventure's surf blob). */
export const SURF_BOB = 'motion-safe:animate-[surf-bob_536ms_step-end_infinite]';

/**
 * A speech bubble over a figure's head with its encounter's icon (ENCOUNTER_STYLE, as in the encounter panels), in map
 * pixels: a white bubble with a tail, the icon on the encounter's colour. Over every sprite; `low` over a sprite one tile tall (the item ball).
 */
function EncounterBubble({ kind, tile, faded, low, below, moveMs = 0 }: { kind: EncounterKind; tile: RouteSpot; faded?: boolean; low?: boolean; below?: boolean; moveMs?: number }) {
  const { Icon, color, name } = ENCOUNTER_STYLE[kind];
  const bubble = (
    <div className="flex h-[13px] w-[15px] items-center justify-center rounded-[4px] bg-white shadow ring-[0.5px] ring-slate-900">
      <span className={`${color} flex h-[10px] w-[10px] items-center justify-center rounded-full text-white`}>
        <Icon sx={{ fontSize: 7 }} />
      </span>
    </div>
  );
  return (
    <div
      className={`pointer-events-none absolute -translate-x-1/2 ${faded ? 'opacity-50' : ''}`}
      // Above the figure's head; or `below` its feet (a figure standing below the player's spot, whose bubble would cover him).
      style={{ left: tile.x * 16 + 8, top: below ? tile.y * 16 + 16 : tile.y * 16 - (low ? 15 : 31), zIndex: 900 + tile.y, transition: `left ${moveMs}ms linear, top ${moveMs}ms linear` }}
      title={name}
    >
      {below ? (
        <>
          {/* The tail, pointing up at the figure. */}
          <div className="relative mx-auto h-0 w-0 border-x-[3px] border-b-[3.5px] border-x-transparent border-b-slate-900">
            <div className="absolute -left-[2.2px] top-[1.5px] h-0 w-0 border-x-[2.2px] border-b-[2.7px] border-x-transparent border-b-white" />
          </div>
          {bubble}
        </>
      ) : (
        <>
          {bubble}
          {/* The tail, pointing down at the figure: a black triangle with a white one inside, overlapping the bubble's edge so they join. */}
          <div className="relative mx-auto h-0 w-0 border-x-[3px] border-t-[3.5px] border-x-transparent border-t-slate-900">
            <div className="absolute -left-[2.2px] -top-[4.2px] h-0 w-0 border-x-[2.2px] border-t-[2.7px] border-x-transparent border-t-white" />
          </div>
        </>
      )}
    </div>
  );
}

/** A figure on its tile, facing its spot: a boss's own sprite (a single front-facing frame) or an overworld sprite, with its bubble for a non-battle encounter. */
export function Figure({
  figure,
  tile,
  spot,
  faded,
  face,
  walkTick,
  moveMs,
  wet,
  grass,
}: {
  figure: RouteFigure;
  tile: RouteSpot;
  spot: RouteSpot;
  faded?: boolean;
  /** Standing in water: a swimmer shows swimming (waterSprite). */
  wet?: boolean;
  /** Standing in tall grass: half hidden in it. */
  grass?: boolean;
  /** While walking (an NPC coming up to the player): the way it's going, its walking frame and its step's time. */
  face?: Facing;
  walkTick?: number;
  moveMs?: number;
}) {
  if (!figure.boss) {
    return (
      <>
        <OverworldSprite name={(wet && figure.sprite && waterSprite(figure.sprite)) || figure.sprite || 'boy'} tile={tile} face={face ?? facing(tile, spot)} title={figure.title} faded={faded} walkTick={walkTick} moveMs={moveMs} grass={grass} />
        {figure.bubble && <EncounterBubble kind={figure.bubble} tile={tile} faded={faded} low={isItemBall(figure.sprite)} below={tile.y > spot.y} moveMs={moveMs} />}
      </>
    );
  }
  return (
    <img
      src={`/trainers/${figure.boss}.png`}
      alt=""
      title={figure.title}
      draggable={false}
      className={`absolute select-none [image-rendering:pixelated] ${faded ? 'opacity-50' : ''}`}
      style={{ left: tile.x * 16 + 8, top: tile.y * 16 + 16, transform: 'translate(-50%, -100%)', zIndex: tile.y }}
    />
  );
}
