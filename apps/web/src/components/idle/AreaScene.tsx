import { AREAS, areaById, mapView, type TownArea, type WalkArea } from '@poke-tcg/idle';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import { placeTrack, type Playback } from '../../hooks/useIdle';
import { usePanTo } from '../../hooks/usePan';
import type { Facing } from '../../utils/overworld';
import { DialogueBox, dialogueKey, type Dialogue } from '../DialogueBox';
import { Exclamation, GrassTufts, OverworldSprite, SURF_BOB, TallGrass } from '../run/RouteSprites';
import { DIALOGUE_TEXT, GAME_HEIGHT, GAME_WIDTH, GameScreen, useGameScale } from './GameScreen';

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
 * A map of the run, the player standing on `tile` (in map tiles) and `people` around: the game screen (the user's: the
 * battle screen's size, FireRed's 15 by 10 tiles, its pixels a whole number of device pixels: useGameScale), the map cut
 * off at its edges; across each way it fits it's centred (Oak's lab, the user's), otherwise panned to keep the player in
 * the middle (as the run maps' RouteView, without dragging), on whole device pixels either way; fading out between maps;
 * tall grass over the player's feet (`grass`: his tile is tall grass) and the people's (their `grass`), rustling as he
 * steps in, as FireRed has it (GrassTufts); `children` over it (the battle's flash), and `dialogue` in the Battle Tower's text
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
  grass = false,
  fading = false,
  people = [],
  spotted,
  dialogue,
  fishing,
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
  grass?: boolean;
  fading?: boolean;
  people?: { key: string; sprite: string; x: number; y: number; face: Facing; grass?: boolean }[];
  spotted?: string | null;
  dialogue?: Dialogue | null;
  /** A cast on screen (the user's: fishing): the player's fishing sprite in its phase, in place of the player's. */
  fishing?: { sprite: string; surfing: boolean; phase: 'cast' | 'hooked' | 'away'; stamp: number };
  children?: ReactNode;
}) {
  const phone = useIsPhone();
  /** The dialogue box's click (DialogueBox sets it while it's up), for a click anywhere on the scene. */
  const pressDialogue = useRef<(() => void) | null>(null);
  // The game screen's scale (CSS pixels a game pixel) and size.
  const { ref, scale: zoom } = useGameScale();
  const view = { w: GAME_WIDTH * zoom, h: GAME_HEIGHT * zoom };
  // The map is shown only once it's placed and its picture loaded (the user's: no pan to the player as the scene comes
  // back after a battle, no picture drawing in bit by bit): hidden until the scene is measured and `loaded` is its
  // picture, and the pan's slide on only once it's shown (usePanTo places it at once the first time).
  const [loaded, setLoaded] = useState<string | null>(() => (ready(image) ? image : null));
  const measured = view.w > 0;
  const shown = measured && loaded === image;
  // The map's offset in the scene: centred across a way it fits, else the player's tile in the middle.
  const mapW = width * 16 * zoom;
  const mapH = height * 16 * zoom;
  const left = mapW <= view.w ? (view.w - mapW) / 2 : view.w / 2 - (tile.x * 16 + 8) * zoom;
  const top = mapH <= view.h ? (view.h - mapH) / 2 : view.h / 2 - (tile.y * 16 + 8) * zoom;
  const panned = useRef<HTMLDivElement>(null);
  usePanTo(panned, { x: left, y: top }, shown && moveMs ? { ms: moveMs, ease: 'linear' } : null, `${zoom} ${image}`);
  return (
    <div ref={ref} className="w-full">
    <div className="relative mx-auto overflow-hidden rounded-lg bg-black ring-1 ring-slate-700" style={measured ? { width: view.w, height: view.h } : { width: '100%', aspectRatio: '3 / 2' }} onClick={() => pressDialogue.current?.()}>
      {/* Placed and slid by usePanTo, in step with the player's sprite. */}
      <div ref={panned} className="absolute" style={{ opacity: fading || !shown ? 0 : 1 }}>
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
          {fishing ? <FishingSprite {...fishing} tile={tile} face={face} /> : <OverworldSprite name={player} tile={tile} face={face} walkTick={moveMs ? walkTick : undefined} moveMs={moveMs} {...(jump && { jump })} />}
          {/* The grass after the sprites, so it's over the feet of those on its row. */}
          {people.map((p) => p.grass && <TallGrass key={p.key} tile={{ x: p.x, y: p.y }} />)}
          <GrassTufts tile={tile} grass={grass} map={image} moveMs={moveMs} jump={jump} />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-300" style={{ opacity: fading ? 1 : 0 }} />
      {children}
      {dialogue && <DialogueBox key={dialogueKey(dialogue)} dialogue={dialogue} pressRef={pressDialogue} phone={phone} maxWidth={Math.min(DIALOGUE_MAX, width * 16 * zoom, view.w)} fontSize={DIALOGUE_TEXT * zoom || undefined} />}
    </div>
    </div>
  );
}

/** The fishing sprite's frames by facing (red_fish.png's 12, 32x32: left, up, down; right the left ones mirrored, as object_event_anims.h). */
const FISH_BASE: Record<Facing, number> = { left: 0, right: 0, up: 4, down: 8 };
/** 4 game frames a frame (sAnim_TakeOutRod*), 6 for the bite's jerks (sAnim_HookedPokemon*), at 60 a second. */
const FISH_FRAME_MS = 67;

/** The surf blob's frame by facing (surf_blob.png's 6, 32x32: down, up, left, two each; right the left mirrored). */
const BLOB_FRAME: Record<Facing, number> = { down: 0, up: 2, left: 4, right: 4 };

/**
 * The player fishing (the user's; object_event_anims.h): the rod taken out (frames 0 to 3) and held; on a bite, the rod
 * jerking (2 and 3, twice, then held a moment, over again); none, the rod put away (3 to 0). Surfing, on the surf blob
 * (a little below, as surf_frames draws Red surfing), the two bobbing together (SURF_BOB).
 */
function FishingSprite({ sprite, surfing, phase, stamp, tile, face }: { sprite: string; surfing: boolean; phase: 'cast' | 'hooked' | 'away'; stamp: number; tile: { x: number; y: number }; face: Facing }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), FISH_FRAME_MS / 2);
    return () => window.clearInterval(timer);
  }, []);
  const n = Math.floor(Math.max(0, now - stamp) / FISH_FRAME_MS);
  const hooked = [2, 2, 3, 3, 2, 2, 3, 3, ...Array(8).fill(3)];
  const frame = phase === 'cast' ? Math.min(3, n) : phase === 'hooked' ? hooked[n % hooked.length]! : Math.max(0, 3 - n);
  const flip = face === 'right' ? 'scaleX(-1)' : undefined;
  return (
    <>
      {surfing && (
        <div
          className={`absolute [image-rendering:pixelated] ${SURF_BOB}`}
          style={{ left: tile.x * 16 + 8 - 16, top: tile.y * 16 - 8, width: 32, height: 24, backgroundImage: 'url(/overworld/surf_blob.png)', backgroundSize: '192px 32px', backgroundPosition: `${-BLOB_FRAME[face] * 32}px 0`, transform: flip, zIndex: tile.y }}
        />
      )}
      <div
        className={`absolute [image-rendering:pixelated] ${surfing ? SURF_BOB : ''}`}
        style={{
          left: tile.x * 16 + 8 - 16,
          top: tile.y * 16 - 16,
          width: 32,
          height: 32,
          backgroundImage: `url(/overworld/${sprite}.png)`,
          backgroundSize: '384px 32px',
          backgroundPosition: `${-(FISH_BASE[face] + frame) * 32}px 0`,
          transform: flip,
          zIndex: tile.y,
        }}
      />
    </>
  );
}

/**
 * The run's area as it plays (README: Idle Adventure): the map of the leg's current step, the player walking its track
 * (Red, or Leaf; surfing on water), its trainers where the game has them, the "!" over one who has seen the player;
 * `dialogue` in its text box (a notice, the catch-up's pages).
 */
export function AreaScene({ playback, gender, dialogue, children }: { playback: Playback; gender: 'male' | 'female'; dialogue?: Dialogue | null; children?: ReactNode }) {
  const place = playback.place;
  const area = place && (AREAS[place.area] as WalkArea | undefined);
  if (!place || !area || !('legs' in area)) return <GameScreen className="rounded-lg bg-slate-900 ring-1 ring-slate-700">{() => children}</GameScreen>;
  const leg = area.legs[Math.min(place.leg, area.legs.length - 1)]!;
  // Grinding, the step round the town's loop (on one of the leg's maps).
  const track = placeTrack(place);
  const [m, x, y, , tileCode] = track[Math.min(place.step, track.length - 1)]!;
  const map = mapView(leg.maps[m]!);
  const water = tileCode[1] === 'w' || tileCode[1] === 'p';
  // Tall grass (MB_TALL_GRASS: the tile's battle terrain).
  const grass = tileCode[1] === 'g';
  const base = gender === 'female' ? 'leaf' : 'red';
  const people = area.trainers
    .filter((t) => t.leg === place.leg && t.map === m)
    .map((t) => ({ key: t.key, sprite: WATER_SPRITES[t.sprite] && water ? WATER_SPRITES[t.sprite]! : t.sprite, x: t.x, y: t.y, face: t.face, grass: t.grass }));
  // A legendary Pokémon where it stands (WalkArea.legend), the player facing it once walked up to it (its battle next).
  const legend = area.legend && area.legend.map === m ? area.legend : null;
  if (legend) people.push({ key: 'legend', sprite: legend.sprite, x: legend.x, y: legend.y, face: legend.face, grass: undefined });
  const arrived = legend && place.step >= track.length - 1 && !playback.moveMs;
  // Fishing (the user's): on its spot's tile, facing the water, the rod's frames while a cast plays.
  const fishAt = playback.fishSpot !== null && place.grind === undefined ? area.fishing?.[playback.fishSpot] : undefined;
  const at = fishAt ? { x: fishAt[3], y: fishAt[4] } : { x, y };
  const face: Facing = fishAt ? fishAt[2] : arrived ? (Math.abs(legend.x - x) > Math.abs(legend.y - y) ? (legend.x > x ? 'right' : 'left') : legend.y > y ? 'down' : 'up') : playback.face;
  return (
    <MapScene
      image={map.image}
      width={map.width}
      height={map.height}
      tile={at}
      player={(fishAt ? fishAt[5] : water) ? `${base}_surf` : base}
      {...(fishAt && playback.fishing && { fishing: { sprite: `${base}_fish`, surfing: !!fishAt[5], ...playback.fishing } })}
      face={face}
      walkTick={playback.walkTick}
      moveMs={playback.moveMs}
      jump={playback.jump}
      grass={grass}
      fading={playback.fading}
      people={people}
      spotted={playback.spotted}
      dialogue={dialogue}
    >
      {children}
    </MapScene>
  );
}
