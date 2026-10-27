import MyLocationIcon from '@mui/icons-material/MyLocation';
import { BERRY_FARM_MAP, RIPE, routePath, STAGES, stageAt, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { glideTransition, mapPlacement, usePan, ZOOM } from '../../hooks/usePan';
import { useRun } from '../../hooks/useRun';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { playerSprite, STEP_MS, WALK_FRAME_MS, type Facing } from '../../utils/overworld';
import { facing } from '../../utils/routeFigures';
import { BUTTON } from '../../utils/styles';
import { OverworldSprite } from '../run/RouteSprites';
import { Toasts } from '../Toasts';
import { BerryIcon, berryName } from './BerryIcon';

/** The farm's map as a run map (`Route`, sizes in pixels), for the view's panning (usePan) and the player's walks (routePath). */
const FARM: Route = {
  name: 'Berry Farm',
  flow: 'up',
  image: BERRY_FARM_MAP.image,
  width: BERRY_FARM_MAP.width * 16,
  height: BERRY_FARM_MAP.height * 16,
  spots: [],
  walkable: BERRY_FARM_MAP.walkable,
  sprites: 'rse',
};

/** Each stage's frames in a tree's strip (`public/extras/trees/`): the game plays the first, then stays on the second (sAnim_BerryTreeStage0-4). */
const STAGE_FRAMES: [number, number][] = [[0, 0], [1, 2], [3, 4], [5, 6], [7, 8]];
/** How long a stage's first frame shows before its second (32 or 48 of the game's frames). */
const SETTLE_MS = 700;

/** "in 1 h 12 min", "in 8 min", "in less than a minute". */
function timeLeft(ms: number) {
  const min = Math.ceil(ms / 60000);
  if (ms <= 0) return 'now';
  if (min < 2) return 'in less than a minute';
  const h = Math.floor(min / 60);
  return `in ${h ? `${h} h ` : ''}${min % 60 ? `${min % 60} min` : ''}`.trim();
}

/** A tree on its plot (its feet on the soil, its top on the tile above), at its stage. Lower on the map is in front, as the sprites. */
function Tree({ berry, plot, stage, settled, ripeIn, onClick }: { berry: string; plot: RouteSpot; stage: number; settled: boolean; ripeIn: number; onClick: () => void }) {
  const frame = STAGE_FRAMES[stage]![settled ? 1 : 0];
  const ripe = stage === RIPE;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${berryName(berry)} tree · ${ripe ? 'ripe: click to pick its berries' : `${STAGES[stage]}, ripe ${timeLeft(ripeIn)}`}`}
      aria-label={`${berryName(berry)} tree, ${ripe ? 'ripe' : STAGES[stage]}`}
      className={`absolute cursor-pointer [image-rendering:pixelated] ${ripe ? 'hover:brightness-125' : 'hover:brightness-110'}`}
      style={{
        left: plot.x * 16,
        top: plot.y * 16 - 16,
        width: 16,
        height: 32,
        backgroundImage: `url(/extras/trees/${berry}.png)`,
        backgroundSize: '144px 32px',
        backgroundPosition: `${-frame * 16}px 0`,
        zIndex: plot.y,
      }}
    />
  );
}

/** A picked tree's berries, rising from it and fading ("+3" and the berry's icon). */
function Picked({ berry, count, plot }: { berry: string; count: number; plot: RouteSpot }) {
  return (
    <div
      className="pointer-events-none absolute flex animate-[berry-picked_1.6s_ease-out_forwards] items-center gap-px rounded bg-slate-900/80 px-0.5 text-[7px] font-bold leading-none text-yellow-200"
      style={{ left: plot.x * 16 + 8, top: plot.y * 16 - 26, zIndex: 900 }}
    >
      <BerryIcon berry={berry} size={10} />+{count}
    </div>
  );
}

interface PickedBerries {
  id: number;
  berry: string;
  count: number;
  plot: RouteSpot;
}

/**
 * The Berry Farm (the Extras page's): Route 123's Berry Master's garden made bigger (BERRY_FARM_MAP), a tree of every
 * berry growing on it in real time (the farm's `extras.farm`; each through the game's stages, ripe GROW_HOURS after it was
 * planted). Clicking a ripe tree walks the player (Brendan or May, the account's choice) to it and picks it: its berries
 * go to the account's (listed under the map) and it's planted again; an unripe one says when it will be. The map pans like
 * a run's (FarmMap). Debug builds can ripen every tree at once.
 */
export function BerryFarm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const debug = useDebugEnabled();
  const farm = useQuery({ ...trpc.extras.farm.queryOptions(), refetchInterval: 60_000 });
  const setFarm = (data: NonNullable<typeof farm.data>) => queryClient.setQueryData(trpc.extras.farm.queryKey(), data);
  const [picked, setPicked] = useState<PickedBerries[]>([]);
  /** Each picked tree's berries rising from it (a single pick's, or Gather all's), and the minigames' berry lists refreshed. */
  const showPicked = (data: NonNullable<typeof farm.data>, counts: Record<string, number>) => {
    setFarm(data);
    const base = Date.now();
    const pops = Object.entries(counts).map(([berry, count], i) => ({ id: base + i, berry, count, plot: data.trees.find((t) => t.berry === berry)!.plot }));
    setPicked((p) => [...p, ...pops]);
    window.setTimeout(() => setPicked((p) => p.filter((x) => !pops.some((q) => q.id === x.id))), 1700);
    for (const key of [trpc.extras.blender.queryKey(), trpc.extras.poffins.queryKey()]) queryClient.invalidateQueries({ queryKey: key });
  };
  const harvest = useMutation(
    trpc.extras.harvest.mutationOptions({
      onSuccess: ({ berry, count, ...data }) => showPicked(data, { [berry]: count }),
      onError: (e) => toasts.push('error', e.message),
    }),
  );
  const gather = useMutation(
    trpc.extras.harvestAll.mutationOptions({
      onSuccess: ({ picked: counts, ...data }) => showPicked(data, counts),
      onError: (e) => toasts.push('error', e.message),
    }),
  );
  const ripen = useMutation(trpc.extras.ripenAll.mutationOptions({ onSuccess: setFarm, onError: (e) => toasts.push('error', e.message) }));
  const gender = useRun().overview.data?.playerGender ?? undefined;

  // The server's clock (the trees ripen by it), ticking along here between fetches.
  const skew = useMemo(() => (farm.data ? farm.data.now - Date.now() : 0), [farm.data]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const serverNow = now + skew;

  if (farm.error && !farm.data) return <p className="text-red-400">{farm.error.message}</p>;
  if (!farm.data) return <p className="text-slate-400">Loading the farm…</p>;
  const { trees, berries, growMs } = farm.data;
  const stages = trees.map((t) => stageAt(t.ripeAt - growMs, serverNow));
  const ripeCount = stages.filter((s) => s === RIPE).length;
  const nextRipe = Math.min(...trees.filter((_, i) => stages[i] !== RIPE).map((t) => t.ripeAt));
  const owned = Object.entries(berries).filter(([, n]) => n > 0);

  const onUnripe = (i: number) => {
    const tree = trees[i]!;
    toasts.push('warning', `The ${berryName(tree.berry)} tree is ${STAGES[stages[i]!]}: its berries are ripe ${timeLeft(tree.ripeAt - serverNow)}.`);
  };
  const onPick = (i: number) => {
    if (!harvest.isPending) harvest.mutate({ berry: trees[i]!.berry });
  };

  return (
    <div className="space-y-4">
      {/* Gather all: every ripe tree picked at once (its berries rising from each), the player staying put. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">Emerald’s berries grow in the top garden, Platinum’s in the one below.</p>
        <button className={BUTTON} disabled={!ripeCount || gather.isPending || harvest.isPending} onClick={() => gather.mutate()}>
          {ripeCount ? `Gather all ripe (${ripeCount})` : 'Gather all ripe'}
        </button>
      </div>
      <FarmMap
        trees={trees}
        stages={stages}
        serverNow={serverNow}
        picked={picked}
        gender={gender}
        onUnripe={onUnripe}
        onPick={onPick}
        caption={
          <>
            {ripeCount ? `${ripeCount} ${ripeCount === 1 ? 'tree is' : 'trees are'} ripe` : `The next tree is ripe ${timeLeft(nextRipe - serverNow)}`} · every tree is ripe {Math.round(growMs / 3600000)} hours
            after it's picked · drag or scroll to look around
          </>
        }
      />

      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">Berry Pouch</h3>
          {DEBUG_BUILD && debug && (
            <button className={`${BUTTON} ml-auto`} disabled={ripen.isPending} onClick={() => ripen.mutate()}>
              Debug: ripen every tree
            </button>
          )}
        </div>
        {owned.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
            {owned.map(([berry, n]) => (
              <li key={berry} className="flex items-center gap-2 rounded bg-slate-800 px-2 py-1.5 text-sm ring-1 ring-slate-700">
                <BerryIcon berry={berry} />
                <span className="truncate">{berryName(berry)}</span>
                <span className="ml-auto tabular-nums text-slate-300">×{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No berries yet: pick a ripe tree.</p>
        )}
      </section>
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}

/**
 * The farm's map (BerryFarm's), panned like a run's (usePan): the trees at their stages, the player, and the berries just
 * picked rising. A ripe tree clicked walks the player to the tile below it, facing it, then `onPick`s it; an unripe one
 * is `onUnripe` at once. Only mounted once the farm has loaded: usePan measures its box when it mounts, so the box must
 * be there then (with "Loading the farm…" in its place it never was, and the map never showed).
 */
function FarmMap({
  trees,
  stages,
  serverNow,
  picked,
  gender,
  onUnripe,
  onPick,
  caption,
}: {
  trees: { berry: string; plot: RouteSpot; ripeAt: number }[];
  stages: number[];
  serverNow: number;
  picked: PickedBerries[];
  gender: 'male' | 'female' | undefined;
  onUnripe: (i: number) => void;
  onPick: (i: number) => void;
  caption: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const pan = usePan({ box, mapEl, map: FARM, mapHeight: FARM.height, panLocked: false });
  const [walker, setWalker] = useState<{ tile: RouteSpot; face: Facing; walking: boolean }>({ tile: BERRY_FARM_MAP.entrance, face: 'up', walking: false });
  const walkerRef = useRef(walker);
  walkerRef.current = walker;
  const [tick, setTick] = useState(0);
  const timers = useRef<number[]>([]);
  const clearWalk = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearWalk, []);
  // The walk cycle's frames while walking.
  useEffect(() => {
    if (!walker.walking) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), WALK_FRAME_MS);
    return () => window.clearInterval(timer);
  }, [walker.walking]);
  // Each stage's first frame when the trees first show, then its second, as the game plays them.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);
  // The view opens on the middle of the farm.
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current || !pan.size.w) return;
    centred.current = true;
    pan.setOffset(pan.centreOn({ x: Math.floor(BERRY_FARM_MAP.width / 2), y: BERRY_FARM_MAP.height / 2 }));
  }, [pan.size.w]);

  /** Walks the player to the tile below a tree, then faces it and `then`. */
  const walkTo = (tree: RouteSpot, then: () => void) => {
    clearWalk();
    const from = walkerRef.current.tile;
    const to = { x: tree.x, y: tree.y + 1 };
    const steps = routePath(FARM, from, to) ?? [];
    steps.forEach((step, i) => {
      timers.current.push(
        window.setTimeout(() => {
          const prev = i ? steps[i - 1]!.tile : from;
          setWalker({ tile: step.tile, face: facing(prev, step.tile), walking: true });
        }, i * STEP_MS),
      );
    });
    timers.current.push(
      window.setTimeout(() => {
        setWalker({ tile: to, face: facing(to, tree), walking: false });
        then();
      }, steps.length * STEP_MS),
    );
  };
  const onTree = (i: number) => {
    if (stages[i] !== RIPE) onUnripe(i);
    else walkTo(trees[i]!.plot, () => onPick(i));
  };

  return (
    <figure className="mx-auto w-full space-y-1" style={{ maxWidth: Math.max(768, FARM.width * ZOOM) }}>
      <div
        ref={box}
        className="relative cursor-grab touch-none overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-600 active:cursor-grabbing"
        style={{ height: Math.min(pan.height, FARM.height * ZOOM) }}
        aria-label="The Berry Farm. Drag or scroll to look around; click a ripe tree to pick it."
        onPointerDown={pan.onPointerDown}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.endDrag}
        onPointerCancel={pan.endDrag}
      >
        {pan.size.w > 0 && (
          <div
            ref={mapEl}
            className="absolute origin-top-left"
            style={{ width: FARM.width, height: FARM.height, ...mapPlacement(pan.offset), transition: glideTransition(pan.glide) }}
          >
            <img src={FARM.image} alt="" draggable={false} className="h-full w-full select-none [image-rendering:pixelated]" />
            {trees.map((t, i) => (
              <Tree key={t.berry} berry={t.berry} plot={t.plot} stage={stages[i]!} settled={settled} ripeIn={t.ripeAt - serverNow} onClick={() => onTree(i)} />
            ))}
            <OverworldSprite
              name={playerSprite('rse', undefined, false, gender ?? 'male')}
              tile={walker.tile}
              face={walker.face}
              walkTick={walker.walking ? tick : undefined}
              moveMs={walker.walking ? STEP_MS : 0}
              title="You"
            />
            {picked.map((p) => (
              <Picked key={p.id} berry={p.berry} count={p.count} plot={p.plot} />
            ))}
          </div>
        )}
        <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-1">
          <button
            className="flex h-8 w-8 items-center justify-center rounded bg-slate-800/90 text-slate-200 ring-1 ring-slate-600 transition hover:bg-slate-700"
            onClick={() => {
              pan.setGlide({ ms: 700, ease: 'ease-in-out' });
              pan.setOffset(pan.centreOn(walkerRef.current.tile));
            }}
            aria-label="Centre on you"
            title="Centre on you"
          >
            <MyLocationIcon sx={{ fontSize: 16 }} />
          </button>
        </div>
      </div>
      <figcaption className="text-center text-xs text-slate-400">{caption}</figcaption>
    </figure>
  );
}
