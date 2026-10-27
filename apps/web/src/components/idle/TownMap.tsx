import { AREAS, areaIndex, atProgress, isTown, mapGrindPlan, modeOf, reachedArea, TOWN_MAP_GRID, TOWN_MAP_PLACES, townMapArea, townMapPlaceOf, travelError, type IdleAction, type IdleMode, type TownMapPlace } from '@poke-tcg/idle';
import { useState } from 'react';
import { useEscape } from '../../hooks/useEscape';
import type { ClientIdleRun } from '../../hooks/useIdle';

/** One game pixel of FireRed's 240x160 screen, in the game screen's width (container query units). */
const px = (n: number) => `${(n * 100) / 240}cqw`;

/**
 * The Map button's place: the game screen's top left corner on every scene (the user's, 2026-10-27; the store's buy
 * screen's money box moved out of it), short enough to end above the foe's healthbox in battle (y 14).
 */
const TOWN_MAP_TOP = 2;
const TOWN_MAP_HEIGHT = 11;

const FRAME = { border: '#4a4a62', on: '#3994de', shade: '#297bb4', bar: '#283860' };
const TEXT = { fontFamily: '"Pokemon Emerald", monospace', fontSize: px(8), lineHeight: 1 };
/** FireRed's white box with its dark border (the menus' window). */
const BOX = { background: '#ffffff', border: `${px(1)} solid ${FRAME.border}`, borderRadius: px(4), boxShadow: `0 ${px(1)} 0 rgba(0,0,0,0.35)` };
/** The map's picture is drawn where the game draws it: (16, 16) on the screen, its grid's cells from (32, 32). */
const MAP_X = 16;
const MAP_Y = 16;
const cellX = (x: number) => MAP_X + TOWN_MAP_GRID.x + x * TOWN_MAP_GRID.cell;
const cellY = (y: number) => MAP_Y + TOWN_MAP_GRID.y + y * TOWN_MAP_GRID.cell;
/** The route choice's box size (game pixels). */
const CHOICE_W = 88;
const CHOICE_H = 50;

const MODE_LABEL: Record<IdleMode, string> = { route: 'Walking', wild: 'Wild grind', trainers: 'Trainer grind', stop: 'Stopped' };

/**
 * The Town Map (the user's, in place of the mode drop-down): a Map button in the game screen's top left corner, on
 * every scene, opens FireRed's Kanto map (region_map.c's, by tools/idle/town_map.py) over the game screen. Its places
 * are the run's towns, routes and dungeons (TOWN_MAP_PLACES); those not reached yet are darkened. A town clicked takes
 * the run there (TRAVEL), its usual choices waiting; a route or dungeon clicked offers Wild grind and Trainer grind there
 * (GRIND_AT; one that can't start greyed out with why, mapGrindPlan). Continue run (CONTINUE_RUN: straight to the run's
 * furthest place, or on from it) and Stop (SET_MODE stop: at once, a battle begun dropped; nothing in a town) in its
 * corner, the one on lit. The player's icon is where the run is. Escape, × or a town closes it.
 */
export function TownMap({ view, busy, gender, onAct }: { view: ClientIdleRun['view']; busy: boolean; gender: 'male' | 'female'; onAct: (action: IdleAction) => unknown }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<TownMapPlace | null>(null);
  /** The route (or dungeon) clicked: its grinds offered. */
  const [picked, setPicked] = useState<{ place: TownMapPlace; area: number; x: number; y: number } | null>(null);
  /** An answer awaited (the map locked meanwhile), and the mode chosen while it is (shown at once). */
  const [waiting, setWaiting] = useState<IdleMode | true | null>(null);
  const close = () => (setPicked(null), setHover(null), setOpen(false));
  useEscape(() => (picked ? setPicked(null) : close()), open);

  const reached = reachedArea(view);
  const mode = typeof waiting === 'string' ? waiting : modeOf(view);
  // Where the run is: grinding from a town (its auto-grind), on the town's grind route.
  const area = AREAS[view.area]!;
  const at = view.phase === 'grinding' && isTown(area) && area.grind ? areaIndex(area.grind.area) : view.area;
  const here = townMapPlaceOf(at);
  const locked = busy || waiting !== null;
  const send = (action: IdleAction, then?: () => void) => {
    if (locked) return;
    setWaiting(action.type === 'SET_MODE' ? action.mode : true);
    void Promise.resolve(onAct(action)).finally(() => (setWaiting(null), then?.()));
  };

  const click = (place: TownMapPlace, x: number, y: number) => {
    const index = townMapArea(place, reached);
    if (index === null || locked) return;
    if (isTown(AREAS[index]!)) {
      const error = travelError(view, index);
      if (error === 'You are here') close();
      else if (!error) send({ type: 'TRAVEL', area: index }, close);
      return;
    }
    setPicked({ place, area: index, x, y });
  };

  // Each place's cells, the map's layer under the dungeons' (a dungeon's cell over its route's is the dungeon's).
  const cells = (['map', 'dungeon'] as const).flatMap((layer) => TOWN_MAP_PLACES.flatMap((place) => place.cells.filter((c) => c[2] === layer).map(([x, y]) => ({ place, x, y, layer }))));
  const title = (picked?.place ?? hover ?? here)?.name ?? 'KANTO';

  return (
    <div className="pointer-events-none absolute inset-0 [container-type:inline-size]">
      <button
        type="button"
        title={`Town Map (mode: ${MODE_LABEL[mode]})`}
        disabled={busy}
        className="pointer-events-auto absolute flex items-center whitespace-nowrap disabled:cursor-default"
        style={{ ...TEXT, ...BOX, left: px(2), top: px(TOWN_MAP_TOP), height: px(TOWN_MAP_HEIGHT), gap: px(3), padding: `0 ${px(3)}`, color: '#404040', textShadow: `${px(1)} ${px(1)} 0 #d0d0c8` }}
        onClick={(e) => (e.stopPropagation(), setOpen(true))}
      >
        Map
        {/* The mode: a dot, red when stopped, blue walking on, yellow grinding. */}
        <span aria-hidden style={{ width: px(5), height: px(5), borderRadius: '50%', background: mode === 'stop' ? '#e03030' : mode === 'route' ? FRAME.on : '#e8b820' }} />
      </button>

      {open && (
        <div className="pointer-events-auto absolute inset-0 z-20 overflow-hidden" style={{ background: '#000000' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Town Map">
          <img src={TOWN_MAP_GRID.image} alt="" draggable={false} className="absolute select-none" style={{ left: px(MAP_X), top: px(MAP_Y), width: px(TOWN_MAP_GRID.imageWidth), height: px(TOWN_MAP_GRID.imageHeight), imageRendering: 'pixelated' }} />

          {/* The top bar: the place pointed at (or where the run is), the mode, and ×. */}
          <div className="absolute flex items-center justify-between" style={{ ...TEXT, left: 0, right: 0, top: 0, height: px(16), padding: `0 ${px(4)}`, background: FRAME.bar, color: '#ffffff', textShadow: `${px(1)} ${px(1)} 0 #101828` }}>
            <span>{title}</span>
            <span className="flex items-center" style={{ gap: px(6) }}>
              <span style={{ color: '#c8d8f0' }}>{MODE_LABEL[mode]}</span>
              <button type="button" aria-label="Close the Town Map" style={{ ...TEXT, color: '#ffffff' }} onClick={close}>
                ×
              </button>
            </span>
          </div>

          {/* The places: a cell each, darkened until reached, the place pointed at outlined. */}
          {cells.map(({ place, x, y, layer }) => {
            const index = townMapArea(place, reached);
            const lit = hover === place || picked?.place === place;
            return (
              <button
                key={`${layer}:${x}:${y}`}
                type="button"
                title={index === null ? `${place.name}: not reached yet` : place.name}
                disabled={index === null}
                className="absolute disabled:cursor-default"
                style={{
                  left: px(cellX(x)),
                  top: px(cellY(y)),
                  width: px(TOWN_MAP_GRID.cell),
                  height: px(TOWN_MAP_GRID.cell),
                  background: index === null ? 'rgba(0,0,0,0.5)' : lit ? 'rgba(248,56,24,0.35)' : 'transparent',
                  outline: lit ? `${px(1)} solid #f83818` : undefined,
                  zIndex: layer === 'dungeon' ? 2 : 1,
                }}
                onPointerEnter={() => setHover(place)}
                onPointerLeave={() => setHover((h) => (h === place ? null : h))}
                onClick={() => click(place, x, y)}
              />
            );
          })}

          {/* The player's icon (region_map.c's: centred on the cell). */}
          {here && (
            <img
              src={`/idle/gen1/town-map/${gender === 'female' ? 'leaf' : 'red'}.png`}
              alt=""
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: px(cellX(here.cells[0]![0]) - 4), top: px(cellY(here.cells[0]![1]) - 4), width: px(16), height: px(16), imageRendering: 'pixelated', zIndex: 3 }}
            />
          )}

          {/* Continue run and Stop, over the sea in the bottom right corner (the user's); each closes the map when it moves the run. */}
          <div className="absolute flex flex-col" style={{ right: px(4), bottom: px(4), gap: px(2), zIndex: 4 }}>
            <MapButton
              label="Continue run"
              title={atProgress(view) ? 'Walk on from here, the furthest you have been' : 'Straight to the furthest you have been in this run, and on from there'}
              on={mode === 'route' && atProgress(view)}
              disabled={locked}
              onClick={() => send({ type: 'CONTINUE_RUN' }, close)}
            />
            <MapButton
              label="Stop"
              title={view.phase === 'town' ? 'Nothing to stop in a town' : 'Stop where you are now (a battle under way ends with no rewards), offline too, until Continue run'}
              on={mode === 'stop'}
              disabled={locked}
              onClick={() => view.phase !== 'town' && mode !== 'stop' && send({ type: 'SET_MODE', mode: 'stop' }, close)}
            />
          </div>

          {/* A route's (or dungeon's) grinds, by the cell clicked. */}
          {picked && (
            <div
              className="absolute flex flex-col"
              style={{
                ...BOX,
                left: px(Math.min(Math.max(cellX(picked.x) + 4 - CHOICE_W / 2, 2), 240 - CHOICE_W - 2)),
                top: px(cellY(picked.y) < 90 ? cellY(picked.y) + 10 : cellY(picked.y) - 2 - CHOICE_H),
                width: px(CHOICE_W),
                padding: px(2),
                gap: px(2),
                zIndex: 5,
              }}
            >
              <span style={{ ...TEXT, color: '#404040', padding: `${px(1)} ${px(2)}` }}>{AREAS[picked.area]!.name}</span>
              {(
                [
                  ['wild', 'Wild grind'],
                  ['trainers', 'Trainer grind'],
                ] as const
              ).map(([kind, label]) => {
                const plan = mapGrindPlan(view, picked.area, kind);
                const on = 'error' in plan && plan.error === 'Already in that mode';
                return <MapButton key={kind} label={label} title={'error' in plan ? plan.error : kind === 'wild' ? 'Battle wild Pokémon here, until Continue route' : "Fight its trainers in a loop (a rematch pays a quarter), until Continue route"} on={on} disabled={locked || 'error' in plan} onClick={() => send({ type: 'GRIND_AT', area: picked.area, kind }, close)} />;
              })}
              <MapButton label="Cancel" disabled={false} on={false} onClick={() => setPicked(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A choice on the map, in FireRed's menu style: lit blue when it's the one on. */
function MapButton({ label, title, on, disabled, onClick }: { label: string; title?: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={on}
      className="block w-full whitespace-nowrap text-left disabled:cursor-default"
      style={{
        ...TEXT,
        ...(on ? {} : BOX),
        height: px(12),
        padding: `0 ${px(4)}`,
        borderRadius: px(3),
        color: on ? '#ffffff' : disabled ? '#a0a0a0' : '#404040',
        background: on ? FRAME.on : '#ffffff',
        textShadow: on ? `${px(1)} ${px(1)} 0 ${FRAME.shade}` : `${px(1)} ${px(1)} 0 #d0d0c8`,
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
