import { AREAS, areaById, mapView, type TownArea, type WalkArea } from '@poke-tcg/idle';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import { placeTrack, type Playback } from '../../hooks/useIdle';
import type { Facing } from '../../utils/overworld';
import { DialogueBox, dialogueKey, type Dialogue } from '../DialogueBox';
import { Exclamation, OverworldSprite } from '../run/RouteSprites';

/**
 * The scene (the user's layout): a game screen centred on the page, 20 tiles by 17 at the map's 3× (the user's), narrower
 * with the page and shorter with the window (most of it below the page's header, at least 22rem); on a phone the page's
 * width, 22rem tall, at the run maps' 2×.
 */
const ZOOM = 3;
const PHONE_ZOOM = 2;
const VIEW_WIDTH = 20 * 16 * ZOOM;
const VIEW_HEIGHT = 17 * 16 * ZOOM;
const sceneSize = (phone: boolean) => (phone ? { height: '22rem' } : { maxWidth: VIEW_WIDTH, height: `min(${VIEW_HEIGHT}px, max(22rem, calc(100dvh - 11rem)))` });
/** The text box's widest (the user's: bound to less than the scene's width), and never wider than the map drawn. */
const DIALOGUE_MAX = 768;

/** The map pictures fetched ahead (kept, so the browser keeps them decoded), by src. */
const preloaded = new Map<string, HTMLImageElement>();

/** Whether a map picture is fetched and decoded already (preloaded), so it's drawn whole at once. */
const ready = (src: string) => {
  const img = preloaded.get(src);
  return !!img && img.complete && img.naturalWidth > 0;
};

/**
 * Fetches the maps the run will show next (the user's: a new map mustn't draw in bit by bit): every map of the area it's
 * in and the next two (their towns and gyms included), and each town's grind loop's.
 */
export function usePreloadMaps(area: number | null) {
  useEffect(() => {
    if (area === null) return;
    const names = new Set<string>();
    for (const a of AREAS.slice(area, area + 3)) {
      if ('legs' in a) a.legs.forEach((l) => l.maps.forEach((m) => names.add(m)));
      else {
        names.add(a.map);
        const grind = (a as TownArea).grind;
        if (grind) (areaById(grind.area) as WalkArea).legs[grind.leg]!.maps.forEach((m) => names.add(m));
      }
    }
    for (const n of names) {
      const src = mapView(n).image;
      if (preloaded.has(src)) continue;
      const img = Object.assign(new Image(), { src });
      preloaded.set(src, img);
      void img.decode().catch(() => {});
    }
  }, [area]);
}

/** A trainer's sprite standing in water (the Swimmers on surfed routes): FireRed's swimming one. */
const WATER_SPRITES: Record<string, string> = { swimmer_m: 'swimmer_m_water', swimmer_f: 'swimmer_f_water' };

/**
 * A map of the run, the player standing on `tile` (in map tiles) and `people` around: the map drawn at 3× (2× on a
 * phone), cut off at the scene's edges; across each way it fits in the scene it's centred (Oak's lab, the user's),
 * otherwise panned to keep the player in the middle (as the run maps' RouteView, without dragging), whole pixels either
 * way; fading out between maps; `children` over it (the battle's flash), and `dialogue` in the Battle Tower's text
 * box (DialogueBox, the user's: a click anywhere on the scene a click on the box), no wider than DIALOGUE_MAX or the map.
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
  dialogue,
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
  dialogue?: Dialogue | null;
  children?: ReactNode;
}) {
  const phone = useIsPhone();
  /** The dialogue box's click (DialogueBox sets it while it's up), for a click anywhere on the scene. */
  const pressDialogue = useRef<(() => void) | null>(null);
  const zoom = phone ? PHONE_ZOOM : ZOOM;
  // The scene's size, measured (and again as the window changes).
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  // The map is shown only once it's placed and its picture loaded (the user's: no pan to the player as the scene comes
  // back after a battle, no picture drawing in bit by bit): hidden until the scene is measured and `loaded` is its
  // picture, and the pan's slide on only from the frame after it was first placed.
  const [loaded, setLoaded] = useState<string | null>(() => (ready(image) ? image : null));
  const [settled, setSettled] = useState(false);
  const measured = view.w > 0;
  const shown = measured && loaded === image;
  useEffect(() => {
    if (!shown || settled) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [shown, settled]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setView({ w: el.clientWidth, h: el.clientHeight });
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    fit();
    return () => observer.disconnect();
  }, []);
  // The map's offset in the scene: centred across a way it fits, else the player's tile in the middle.
  const mapW = width * 16 * zoom;
  const mapH = height * 16 * zoom;
  const left = Math.round(mapW <= view.w ? (view.w - mapW) / 2 : view.w / 2 - (tile.x * 16 + 8) * zoom);
  const top = Math.round(mapH <= view.h ? (view.h - mapH) / 2 : view.h / 2 - (tile.y * 16 + 8) * zoom);
  return (
    <div ref={box} className="relative mx-auto w-full overflow-hidden rounded-lg bg-black ring-1 ring-slate-700" style={sceneSize(phone)} onClick={() => pressDialogue.current?.()}>
      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${left}px, ${top}px)`, transition: settled ? `transform ${moveMs}ms linear` : 'none', opacity: fading || !shown ? 0 : 1 }}
      >
        <div className="relative origin-top-left [image-rendering:pixelated]" style={{ width: width * 16, height: height * 16, transform: `scale(${zoom})`, transition: 'opacity 300ms' }}>
          <img
            src={image}
            alt=""
            draggable={false}
            className="absolute inset-0 max-w-none select-none"
            style={{ width: width * 16, height: height * 16 }}
            onLoad={(e) => void e.currentTarget.decode().catch(() => {}).then(() => setLoaded(image))}
          />
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
      {dialogue && <DialogueBox key={dialogueKey(dialogue)} dialogue={dialogue} pressRef={pressDialogue} phone={phone} maxWidth={Math.min(DIALOGUE_MAX, width * 16 * zoom)} />}
    </div>
  );
}

/**
 * The run's area as it plays (README: Idle Adventure): the map of the leg's current step, the player walking its track
 * (Red, or Leaf; surfing on water), its trainers where the game has them, the "!" over one who has seen the player;
 * `dialogue` in its text box (a notice, the catch-up's pages).
 */
export function AreaScene({ playback, gender, dialogue, children }: { playback: Playback; gender: 'male' | 'female'; dialogue?: Dialogue | null; children?: ReactNode }) {
  const phone = useIsPhone();
  const place = playback.place;
  const area = place && (AREAS[place.area] as WalkArea | undefined);
  if (!place || !area || !('legs' in area)) return <div className="mx-auto w-full rounded-lg bg-slate-900 ring-1 ring-slate-700" style={sceneSize(phone)}>{children}</div>;
  const leg = area.legs[Math.min(place.leg, area.legs.length - 1)]!;
  // Grinding, the step round the town's loop (on one of the leg's maps).
  const track = placeTrack(place);
  const [m, x, y, , tileCode] = track[Math.min(place.step, track.length - 1)]!;
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
      dialogue={dialogue}
    >
      {children}
    </MapScene>
  );
}
