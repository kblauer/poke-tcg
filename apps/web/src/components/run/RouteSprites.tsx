import { inGrass, onIce, onPath, onWater, type EncounterKind, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useEffect, useState } from 'react';
import { FADE_MS } from '../../hooks/useWalk';
import { bobFrame, bobs, isItemBall, mirrored, spriteWidth, standFrame, stripFrames, walkFrame, waterSprite, type Facing } from '../../utils/overworld';
import { facing, type RouteFigure } from '../../utils/routeFigures';
import { ENCOUNTER_STYLE } from './encounterIcons';

/**
 * What's drawn on the route map (RouteView), in map pixels: the overworld sprites (the player's, the figures'), a
 * figure with its speech bubble, the "!" over a spotted trainer, and the debug tile overlay.
 */

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
 * walkable area: tiles joined 4 ways; a walk can't cross between areas), the tiles that can't be walked on red, tall grass green, ice cyan, and on a surfed route water a faint blue and land a faint tan (where the player surfs or walks), and each spot outlined with its number,
 * to tell where walking connections should be.
 */
export function TileOverlay({ route }: { route: Route }) {
  const areas = walkableAreas(route);
  return (
    <div className="pointer-events-auto absolute inset-0 select-none" style={{ zIndex: 2000 }}>
      {areas.flatMap((row, y) =>
        row.map((area, x) => (
          <div
            key={`${x},${y}`}
            title={`${x},${y}${area ? ` · walkable area ${area}` : ' · not walkable'}${inGrass(route, { x, y }) ? ' · tall grass' : ''}${onIce(route, { x, y }) ? ' · ice' : ''}${area && route.travel === 'surf' ? (onWater(route, { x, y }) ? ' · water' : ' · land') : ''}`}
            className="absolute flex items-center justify-center font-mono leading-none"
            style={{
              left: x * 16,
              top: y * 16,
              width: 16,
              height: 16,
              fontSize: 4.5,
              boxShadow: 'inset 0 0 0 0.25px rgba(15,23,42,0.6)',
              background: !area ? 'rgba(220,38,38,0.4)' : inGrass(route, { x, y }) ? 'rgba(34,197,94,0.4)' : onIce(route, { x, y }) ? 'rgba(34,211,238,0.3)' : route.travel !== 'surf' ? undefined : onWater(route, { x, y }) ? 'rgba(59,130,246,0.2)' : 'rgba(210,180,140,0.3)',
              color: '#0f172a',
            }}
          >
            {x},{y}
          </div>
        )),
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

/**
 * A FireRed overworld sprite standing on a tile (its feet on the tile, its head on the one above), facing a way, in map
 * pixels; lower on the map is in front, as in the game. `frame` shows another frame of its strip (a walking one), `moveMs`
 * slides it to a new tile over that long (a step), and `hidden` fades it out. `grass`: on a tile of tall grass, its
 * bottom (GRASS_HIDES) is cut off, so the grass drawn on the map shows there instead, as in the games (agreed with the user).
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
}) {
  const w = spriteWidth(name);
  // An item ball stays whole (it lies in the grass, one tile tall).
  const inGrass = grass && !isItemBall(name);
  const frame = walkTick !== undefined ? walkFrame(name, face, walkTick) : bob && bobs(name) ? bobFrame(name, face) : standFrame(name, face);
  return (
    <div
      title={title}
      className={`absolute [image-rendering:pixelated] ${faded ? 'opacity-50' : ''}`}
      style={{
        transition: `left ${moveMs}ms linear, top ${moveMs}ms linear, opacity ${fadeMs}ms`,
        opacity: hidden ? 0 : undefined,
        left: tile.x * 16 + 8 - w / 2,
        top: tile.y * 16 - 16,
        width: w,
        height: 32,
        backgroundImage: `url(/overworld/${name}.png)`,
        backgroundSize: `${w * stripFrames(name)}px 32px`,
        backgroundPosition: `${-frame * w}px 0`,
        transform: mirrored(name, face) ? 'scaleX(-1)' : undefined,
        clipPath: inGrass ? `inset(0 0 ${GRASS_HIDES}px 0)` : undefined,
        zIndex: tile.y,
      }}
    />
  );
}

/** How much of someone standing in tall grass it hides, in map pixels: the bottom half of their tile, their feet and legs. */
const GRASS_HIDES = 8;

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
