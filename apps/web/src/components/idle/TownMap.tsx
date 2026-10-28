import { AREAS, areaIndex, areaOpen, atProgress, isTown, legendError, legendOf, mapGrindPlan, mapView, modeOf, reachedArea, species, TOWN_MAP_GRID, TOWN_MAP_PLACES, townMapArea, townMapAreas, townMapPlaceOf, travelError, wildSpots, type IdleAction, type IdleMode, type TownMapPlace } from '@poke-tcg/idle';
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
/** The route choice's box: its least width, a choice's height and the gap between them (game pixels). */
const CHOICE_W = 88;
const CHOICE_ROW = 14;
/** About a character's width in the menus' font, to fit the box to its longest choice. */
const CHAR_W = 6;

const MODE_LABEL: Record<IdleMode, string> = { route: 'Walking', wild: 'Wild grind', trainers: 'Trainer grind', stop: 'Stopped' };

/**
 * The Town Map (the user's, in place of the mode drop-down): a Map button in the game screen's top left corner, on
 * every scene, opens FireRed's Kanto map (region_map.c's, by tools/idle/town_map.py) over the game screen. Its places
 * are the run's towns, routes and dungeons (TOWN_MAP_PLACES); those not reached yet are darkened. A town clicked takes
 * the run there (TRAVEL), its usual choices waiting; a route or dungeon clicked offers Wild grind and Trainer grind there
 * (GRIND_AT; one that can't start greyed out with why, mapGrindPlan), a wild grind for each of the place's own maps' wild
 * tables, walked, surfed and fished (a floor, a zone; Route 17's on Route 17, the user's: wildSpots, IdleMap.section), and
 * Go to the town a dungeon stands on (the Pokémon Tower's Lavender
 * Town). The places off the main road (Route 11, the Safari Zone…) open once the run reaches the area that opens them;
 * from the Indigo Plateau on, a place's legendary Pokémon (Articuno on the Seafoam Islands…) is a choice too (LEGEND). Continue run (CONTINUE_RUN: straight to the run's
 * furthest place, or on from it) and Stop (SET_MODE stop: at once, a battle begun dropped; nothing in a town) in its
 * corner, the one on lit (under the Map button too: a stop icon, a play one for Continue run once stopped). The player's icon is where the run is. Escape, × or a town closes it.
 */
export function TownMap({ view, busy, gender, onAct }: { view: ClientIdleRun['view']; busy: boolean; gender: 'male' | 'female'; onAct: (action: IdleAction) => unknown }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<TownMapPlace | null>(null);
  /** The route (or dungeon) clicked: its grinds offered, and the town on its cell (a dungeon's), if any. */
  const [picked, setPicked] = useState<{ place: TownMapPlace; area: number; town: number | null; x: number; y: number } | null>(null);
  /** An answer awaited (the map locked meanwhile), and the mode chosen while it is (shown at once). */
  const [waiting, setWaiting] = useState<IdleMode | true | null>(null);
  const close = () => (setPicked(null), setHover(null), setOpen(false));
  useEscape(() => (picked ? setPicked(null) : close()), open);

  const reached = reachedArea(view);
  const mode = typeof waiting === 'string' ? waiting : modeOf(view);
  // Where the run is: grinding from a town (its auto-grind), on the town's grind route.
  const area = AREAS[view.area]!;
  const at = view.phase === 'grinding' && isTown(area) && area.grind ? areaIndex(area.grind.area) : view.area;
  // On the map the run walks (Route 17 of Routes 16, 17 and 18: its own place).
  const leg = view.phase === 'walking' && 'legs' in area ? area.legs[view.leg] : undefined;
  const here = townMapPlaceOf(at, leg?.maps[leg.track[view.step]?.[0] ?? 0]);
  const locked = busy || waiting !== null;
  const send = (action: IdleAction, then?: () => void) => {
    if (locked) return;
    setWaiting(action.type === 'SET_MODE' ? action.mode : true);
    void Promise.resolve(onAct(action)).finally(() => (setWaiting(null), then?.()));
  };
  // Stop (the map's and the one under the Map button): at once, a battle begun dropped; nothing to stop in a town.
  const stop = (then?: () => void) => mode !== 'stop' && view.phase !== 'town' && send({ type: 'SET_MODE', mode: 'stop' }, then);
  const stopTitle = view.phase === 'town' ? 'Nothing to stop in a town' : 'Stop where you are now (a battle under way ends with no rewards), offline too, until Continue run';

  // A cell's places reached: a route or dungeon offers its grinds (and the town under a dungeon); a town alone is gone to.
  const click = (places: TownMapPlace[], x: number, y: number) => {
    if (locked) return;
    const open = places.flatMap((place) => {
      const index = townMapArea(place, reached);
      return index === null ? [] : [{ place, index }];
    });
    const walk = open.find((o) => !isTown(AREAS[o.index]!));
    const town = open.find((o) => isTown(AREAS[o.index]!));
    if (walk) return setPicked({ place: walk.place, area: walk.index, town: town?.index ?? null, x, y });
    if (!town) return;
    const error = travelError(view, town.index);
    if (error === 'You are here') close();
    else if (!error) send({ type: 'TRAVEL', area: town.index }, close);
  };

  // Each cell once, its places the dungeons' layer first (a dungeon's cell over its route's or its town's).
  const cells: { x: number; y: number; places: TownMapPlace[] }[] = [];
  for (const layer of ['dungeon', 'map'] as const)
    for (const place of TOWN_MAP_PLACES)
      for (const [x, y, l] of place.cells) {
        if (l !== layer) continue;
        const cell = cells.find((c) => c.x === x && c.y === y);
        if (cell) cell.places.push(place);
        else cells.push({ x, y, places: [place] });
      }
  // The picked place's own wild tables, only its own maps' (the user's: Route 17's on Route 17, not every map of Routes 16,
  // 17 and 18): walked, surfed and fished, by its areas (Route 21's tall grass too) or any other open area walking its
  // maps (Route 4's grass, walked out of Mt. Moon).
  const spots = picked
    ? [...townMapAreas(picked.place, reached), ...AREAS.map((_, i) => i).filter((i) => areaOpen(i, reached))]
        .flatMap((area) => wildSpots(area).map((spot) => ({ ...spot, area })))
        .filter((s, i, all) => all.findIndex((t) => t.id === s.id) === i && mapView(s.map).section === picked.place.section)
    : [];
  // Each kind's word, and its map's name when the place has more than one of that kind (a dungeon's floors).
  const kindOf = (s: { water: boolean; fish?: true }) => (s.fish ? 'Fishing' : s.water ? 'Surf grind' : 'Wild grind');
  const spotLabel = (s: { label: string; water: boolean; fish?: true }) => (spots.filter((t) => kindOf(t) === kindOf(s)).length > 1 ? `${kindOf(s)}: ${s.label}` : kindOf(s));
  // Its legendary Pokémon, once the run has reached the Indigo Plateau (the user's): walked up to and battled (LEGEND).
  const legends = picked ? townMapAreas(picked.place, reached).flatMap((area) => (legendOf(area) ? [{ area, name: species(legendOf(area)!.species).name }] : [])) : [];
  const choices = picked ? [picked.place.name, 'Trainer grind', ...(spots.length ? spots.map(spotLabel) : ['Wild grind']), ...legends.map((l) => l.name), ...(picked.town !== null ? [`Go to ${AREAS[picked.town]!.name}`] : [])] : [];
  const choiceW = Math.max(CHOICE_W, ...choices.map((c) => c.length * CHAR_W + 10));
  const choiceH = 4 + 10 + (choices.length + 1) * CHOICE_ROW;
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
      {/* Stop or play under it (the user's, 2026-10-27): the map's Stop without opening the map, and once stopped a play
          icon in its place, the map's Continue run. Nothing to stop in a town. */}
      {(() => {
        const stopped = mode === 'stop';
        return (
          <button
            type="button"
            title={stopped ? 'Continue run: straight to the furthest you have been in this run, and on from there' : stopTitle}
            aria-label={stopped ? 'Continue run' : 'Stop'}
            disabled={locked || (!stopped && view.phase === 'town')}
            className="pointer-events-auto absolute flex items-center justify-center disabled:cursor-default"
            style={{ ...BOX, left: px(2), top: px(TOWN_MAP_TOP + TOWN_MAP_HEIGHT + 2), width: px(TOWN_MAP_HEIGHT), height: px(TOWN_MAP_HEIGHT) }}
            onClick={(e) => (e.stopPropagation(), stopped ? send({ type: 'CONTINUE_RUN' }) : stop())}
          >
            <svg aria-hidden viewBox="0 0 6 6" style={{ width: px(6), height: px(6) }} fill={!stopped && view.phase === 'town' ? '#a0a0a0' : '#404040'}>
              {stopped ? <path d="M1 0.5L5.5 3L1 5.5z" /> : <rect x="0.5" y="0.5" width="5" height="5" />}
            </svg>
          </button>
        );
      })()}

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

          {/* The places: a cell each, darkened until one there is reached, the place pointed at outlined. */}
          {cells.map(({ places, x, y }) => {
            const open = places.filter((place) => townMapArea(place, reached) !== null);
            const top = open[0] ?? places[0]!;
            const lit = places.some((place) => hover === place || picked?.place === place);
            return (
              <button
                key={`${x}:${y}`}
                type="button"
                title={open.length ? open.map((place) => place.name).join(' / ') : `${top.name}: not reached yet`}
                disabled={!open.length}
                className="absolute disabled:cursor-default"
                style={{
                  left: px(cellX(x)),
                  top: px(cellY(y)),
                  width: px(TOWN_MAP_GRID.cell),
                  height: px(TOWN_MAP_GRID.cell),
                  background: !open.length ? 'rgba(0,0,0,0.5)' : lit ? 'rgba(248,56,24,0.35)' : 'transparent',
                  outline: lit ? `${px(1)} solid #f83818` : undefined,
                  zIndex: 1,
                }}
                onPointerEnter={() => setHover(top)}
                onPointerLeave={() => setHover((h) => (h === top ? null : h))}
                onClick={() => click(places, x, y)}
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
              title={view.phase === 'town' ? `${stopTitle} (closes the map)` : stopTitle}
              on={mode === 'stop'}
              disabled={locked}
              onClick={() => (view.phase === 'town' ? close() : stop(close))}
            />
          </div>

          {/* A route's (or dungeon's) grinds, by the cell clicked. */}
          {picked && (
            <div
              className="absolute flex flex-col"
              style={{
                ...BOX,
                left: px(Math.min(Math.max(cellX(picked.x) + 4 - choiceW / 2, 2), 240 - choiceW - 2)),
                top: px(Math.min(Math.max(cellY(picked.y) < 90 ? cellY(picked.y) + 10 : cellY(picked.y) - 2 - choiceH, 2), 160 - choiceH - 2)),
                width: px(choiceW),
                padding: px(2),
                gap: px(2),
                zIndex: 5,
              }}
            >
              <span style={{ ...TEXT, color: '#404040', padding: `${px(1)} ${px(2)}` }}>{picked.place.name}</span>
              {!spots.length && <MapButton label="Wild grind" title="No wild Pokémon here" on={false} disabled onClick={() => {}} />}
              {spots.map((spot) => {
                const plan = mapGrindPlan(view, spot.area, 'wild', spot.id);
                const on = 'error' in plan && plan.error === 'Already in that mode';
                const what = spot.fish ? `Fish on ${spot.label}, cast after cast` : `Battle wild Pokémon ${spot.water ? 'surfing on' : 'on'} ${spot.label}`;
                return (
                  <MapButton
                    key={spot.id}
                    label={spotLabel(spot)}
                    title={'error' in plan ? plan.error : `${what}, until Continue route`}
                    on={on}
                    disabled={locked || 'error' in plan}
                    onClick={() => send({ type: 'GRIND_AT', area: spot.area, kind: 'wild', spot: spot.id }, close)}
                  />
                );
              })}
              {(() => {
                const plan = mapGrindPlan(view, picked.area, 'trainers');
                const on = 'error' in plan && plan.error === 'Already in that mode';
                return <MapButton label="Trainer grind" title={'error' in plan ? plan.error : 'Fight its trainers in a loop (a rematch pays a quarter), until Continue route'} on={on} disabled={locked || 'error' in plan} onClick={() => send({ type: 'GRIND_AT', area: picked.area, kind: 'trainers' }, close)} />;
              })()}
              {legends.map(({ area, name }) => {
                const error = legendError(view, area);
                return <MapButton key={area} label={name} title={error ?? `Walk up to ${name} and battle it (beaten or caught, it's gone for the run; back to the Indigo Plateau either way)`} on={false} disabled={locked || !!error} onClick={() => send({ type: 'LEGEND', area }, close)} />;
              })}
              {picked.town !== null &&
                (() => {
                  const town = picked.town;
                  const error = travelError(view, town);
                  return <MapButton label={`Go to ${AREAS[town]!.name}`} title={error ?? `Go to ${AREAS[town]!.name}`} on={false} disabled={locked || !!error} onClick={() => send({ type: 'TRAVEL', area: town }, close)} />;
                })()}
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
