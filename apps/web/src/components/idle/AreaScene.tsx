import { AREAS, mapView, type WalkArea } from '@poke-tcg/idle';
import type { ReactNode } from 'react';
import type { Playback } from '../../hooks/useIdle';
import type { Facing } from '../../utils/overworld';
import { Exclamation, OverworldSprite } from '../run/RouteSprites';

/** How the scene is zoomed (the run maps' 2×) and how tall it is. */
const ZOOM = 2;
const HEIGHT = 'h-[22rem]';

/** A trainer's sprite standing in water (the Swimmers on surfed routes): FireRed's swimming one. */
const WATER_SPRITES: Record<string, string> = { swimmer_m: 'swimmer_m_water', swimmer_f: 'swimmer_f_water' };

/**
 * A map of the run, the player standing on `tile` (in map tiles) and `people` around: the map drawn at 2×, panned to keep
 * the player in the middle (as the run maps' RouteView, without dragging), fading out between maps; `children` over it
 * (the battle, a notice).
 */
export function MapScene({
  image,
  width,
  height,
  tile,
  player,
  face,
  walkTick,
  moveMs,
  jump,
  fading = false,
  people = [],
  spotted,
  children,
}: {
  image: string;
  width: number;
  height: number;
  tile: { x: number; y: number };
  player: string;
  face: Facing;
  walkTick?: number;
  moveMs: number;
  jump?: { ms: number; stamp: number } | null;
  fading?: boolean;
  people?: { key: string; sprite: string; x: number; y: number; face: Facing }[];
  spotted?: string | null;
  children?: ReactNode;
}) {
  // The map's offset so the player's tile is in the middle (CSS: half the box less the tile's centre).
  const cx = (tile.x * 16 + 8) * ZOOM;
  const cy = (tile.y * 16 + 8) * ZOOM;
  return (
    <div className={`relative ${HEIGHT} overflow-hidden rounded-lg bg-black ring-1 ring-slate-700`}>
      <div
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(${-cx}px, ${-cy}px)`, transition: `transform ${moveMs}ms linear`, opacity: fading ? 0 : 1 }}
      >
        <div className="relative origin-top-left [image-rendering:pixelated]" style={{ width: width * 16, height: height * 16, transform: `scale(${ZOOM})`, transition: 'opacity 300ms' }}>
          <img src={image} alt="" draggable={false} className="absolute inset-0 max-w-none select-none" style={{ width: width * 16, height: height * 16 }} />
          {people.map((p) => (
            <div key={p.key}>
              <OverworldSprite name={p.sprite} tile={{ x: p.x, y: p.y }} face={p.face} />
              {spotted === p.key && <Exclamation tile={{ x: p.x, y: p.y }} />}
            </div>
          ))}
          <OverworldSprite name={player} tile={tile} face={face} walkTick={moveMs ? walkTick : undefined} moveMs={moveMs} {...(jump && { jump })} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-300" style={{ opacity: fading ? 1 : 0 }} />
      {children}
    </div>
  );
}

/**
 * The run's area as it plays (README: Idle Adventure): the map of the leg's current step, the player walking its track
 * (Red, or Leaf; surfing on water), its trainers where the game has them, the "!" over one who has seen the player.
 */
export function AreaScene({ playback, gender, children }: { playback: Playback; gender: 'male' | 'female'; children?: ReactNode }) {
  const place = playback.place;
  const area = place && (AREAS[place.area] as WalkArea | undefined);
  if (!place || !area || area.kind === undefined || !('legs' in area)) return <div className={`${HEIGHT} rounded-lg bg-slate-900 ring-1 ring-slate-700`}>{children}</div>;
  const leg = area.legs[Math.min(place.leg, area.legs.length - 1)]!;
  const [m, x, y, , tileCode] = leg.track[Math.min(place.step, leg.track.length - 1)]!;
  const map = mapView(leg.maps[m]!);
  const water = tileCode[1] === 'w' || tileCode[1] === 'p';
  const base = gender === 'female' ? 'leaf' : 'red';
  const people = area.trainers
    .filter((t) => t.leg === place.leg && t.map === m)
    .map((t) => ({ key: t.key, sprite: WATER_SPRITES[t.sprite] && water ? WATER_SPRITES[t.sprite]! : t.sprite, x: t.x, y: t.y, face: t.face }));
  return (
    <MapScene
      image={map.image}
      width={map.width}
      height={map.height}
      tile={{ x, y }}
      player={water ? `${base}_surf` : base}
      face={playback.face}
      walkTick={playback.walkTick}
      moveMs={playback.moveMs}
      jump={playback.jump}
      fading={playback.fading}
      people={people}
      spotted={playback.spotted}
    >
      {children}
    </MapScene>
  );
}
