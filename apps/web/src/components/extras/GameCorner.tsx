import MyLocationIcon from '@mui/icons-material/MyLocation';
import { buyCoinsError, COIN_OFFERS, GAME_CORNER_MAP, gameCornerMusic, MAX_COINS, routePath, type GameCornerGame, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { mapTransform, usePan, ZOOM } from '../../hooks/usePan';
import { useRun } from '../../hooks/useRun';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { playerSprite, STEP_MS, WALK_FRAME_MS, type Facing } from '../../utils/overworld';
import { facing } from '../../utils/routeFigures';
import { BUTTON } from '../../utils/styles';
import { useMusicCue } from '../MusicPlayer';
import { OverworldSprite } from '../run/RouteSprites';
import { Toasts } from '../Toasts';
import { RouletteScreen } from './RouletteScreen';
import { SlotMachineScreen } from './SlotMachineScreen';

/** Where the player sits: at a roulette table (0 left, 1 right) or a slot machine (0-11), or at neither. */
type Seat = { game: 'roulette'; table: 0 | 1 } | { game: 'slots'; machine: number } | null;
/** Where the player stands on the map, and which way they face. */
interface Standing {
  tile: RouteSpot;
  face: Facing;
}
/** What's being said in the message box: its pages (each its lines), the page shown, and what follows the last page. */
interface Talk {
  pages: string[][];
  page: number;
  then?: 'offers';
}

const MUSIC = gameCornerMusic();
const { counter: COUNTER } = GAME_CORNER_MAP;
/** The Game Corner as a run map (`Route`, sizes in pixels), for the view's panning (usePan) and the player's walks (routePath). */
const CORNER: Route = {
  name: 'Game Corner',
  flow: 'up',
  image: GAME_CORNER_MAP.image,
  width: GAME_CORNER_MAP.width * 16,
  height: GAME_CORNER_MAP.height * 16,
  spots: [],
  walkable: GAME_CORNER_MAP.walkable,
  sprites: 'rse',
};
/** The Emerald message box's and menus' colours (the game's text window, drawn as part of the game's picture). */
const WINDOW = 'rounded-[3px] border-2 border-[#5a6b8c] bg-white px-2 py-1 font-emerald text-[#3a3a3a] shadow-[inset_0_0_0_1px_#a4c5f6]';

/** A target on the map (a machine, a table, a person): see-through, outlined on hover. */
function Target({ x, y, w, h, title, onClick }: { x: number; y: number; w: number; h: number; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="absolute cursor-pointer rounded-sm hover:bg-yellow-300/20 hover:ring-1 hover:ring-yellow-300/70"
      style={{ left: x, top: y, width: w, height: h, zIndex: 800 }}
    />
  );
}

/**
 * The Mauville Game Corner (the Extras page's): the game's own room (GAME_CORNER_MAP), panned like the Berry Farm's, its
 * people where the game has them. Clicking a slot machine or a roulette table walks the player (Brendan or May) to it and
 * sits them at it (SlotMachineScreen, with the machine's luck today; RouletteScreen, the left table 1 coin a ball, the
 * right 3); the coin clerk sells coins for banked ₱ as the game's does (her words and menu, `extras.buyCoins`); the others
 * say their lines, in Emerald's message box. Each round played is settled by the API in turn (`extras.coinRound`), while
 * the screen keeps its own count as the game does. Auto play plays the Game Corner's theme throughout.
 */
export function GameCorner() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const debug = useDebugEnabled();
  useMusicCue(MUSIC);
  const key = trpc.extras.gameCorner.queryKey();
  const corner = useQuery(trpc.extras.gameCorner.queryOptions());
  const setCoins = (coins: number, bank?: number) => queryClient.setQueryData(key, (old) => old && { ...old, coins, bank: bank ?? old.bank });
  const buy = useMutation(trpc.extras.buyCoins.mutationOptions());
  const fill = useMutation(trpc.extras.fillCoins.mutationOptions({ onSuccess: (r) => setCoins(r.coins), onError: (e) => toasts.push('error', e.message) }));
  const round = useMutation(trpc.extras.coinRound.mutationOptions());
  const gender = useRun().overview.data?.playerGender ?? undefined;
  const [seat, setSeat] = useState<Seat>(null);
  // Where the player stands, kept while they sit at a game: they're back on the same seat after it.
  const standing = useRef<Standing>({ tile: GAME_CORNER_MAP.entrance, face: 'up' });
  // The rounds played, settled one after another in the order they were played.
  const settling = useRef(Promise.resolve());
  const onRound = (game: GameCornerGame) => (bet: number, payout: number) => {
    settling.current = settling.current
      .then(() => round.mutateAsync({ game, bet, payout }))
      .then((r) => void setCoins(r.coins))
      .catch((e: Error) => {
        toasts.push('error', e.message);
        queryClient.invalidateQueries({ queryKey: key });
      });
  };
  const leave = () => {
    setSeat(null);
    void settling.current.then(() => queryClient.invalidateQueries({ queryKey: key }));
  };

  if (corner.error && !corner.data) return <p className="text-red-400">{corner.error.message}</p>;
  if (!corner.data) return <p className="text-slate-400">Opening the Game Corner…</p>;
  const { coins, bank, machines } = corner.data;

  if (seat) {
    return (
      <div className="space-y-3">
        {seat.game === 'roulette' ? (
          <RouletteScreen table={seat.table} coins={coins} onRound={onRound('roulette')} onExit={leave} />
        ) : (
          <SlotMachineScreen machine={seat.machine} machineId={machines[seat.machine]!} coins={coins} onRound={onRound('slots')} onExit={leave} />
        )}
        <Toasts toasts={toasts.toasts} />
      </div>
    );
  }

  /** Buys one of the counter's offers; the clerk's answer (thanks, or why not). */
  const buyCoins = async (offer: (typeof COIN_OFFERS)[number]): Promise<string[][]> => {
    const error = buyCoinsError(coins, bank, offer);
    if (error) return error.includes('full') ? COUNTER.full : COUNTER.noMoney;
    try {
      const r = await buy.mutateAsync({ coins: offer.coins });
      setCoins(r.coins, r.bank);
      // The bank in the top bar.
      queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
      return COUNTER.thanks;
    } catch (e) {
      toasts.push('error', (e as Error).message);
      return COUNTER.cancel;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">Coin Case</h3>
        <span className="tabular-nums text-yellow-200">{coins.toLocaleString()} coins</span>
        <span className="text-sm text-slate-400">(holds {MAX_COINS.toLocaleString()}) · ₱{bank.toLocaleString()} in the bank</span>
        {DEBUG_BUILD && debug && (
          <button className={`${BUTTON} ml-auto`} disabled={fill.isPending} onClick={() => fill.mutate()}>
            Debug: fill the Coin Case
          </button>
        )}
      </div>
      <CornerMap
        standing={standing}
        gender={gender}
        coins={coins}
        bank={bank}
        buying={buy.isPending}
        onSit={setSeat}
        onBuy={buyCoins}
      />
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}

/**
 * The Game Corner's room (GameCorner's), panned like a run's map (usePan): its people, the player, and the targets to
 * click. A machine or table clicked walks the player to its seat (a table's nearest side) and `onSit`s them; a person
 * clicked walks them up to talk (across the counter to its clerks), their words in the message box. The coin clerk's
 * talk ends in her menu (50 or 500 coins, or EXIT), the money and coins shown as the game shows them. Only mounted once
 * the Game Corner has loaded: usePan measures its box when it mounts.
 */
function CornerMap({
  standing,
  gender,
  coins,
  bank,
  buying,
  onSit,
  onBuy,
}: {
  standing: { current: Standing };
  gender: 'male' | 'female' | undefined;
  coins: number;
  bank: number;
  buying: boolean;
  onSit: (seat: Seat) => void;
  onBuy: (offer: (typeof COIN_OFFERS)[number]) => Promise<string[][]>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const pan = usePan({ box, mapEl, map: CORNER, mapHeight: CORNER.height, panLocked: false });
  const [walker, setWalker] = useState<Standing & { walking: boolean }>({ ...standing.current, walking: false });
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
  // The view opens on the player.
  const centred = useRef(false);
  useEffect(() => {
    if (centred.current || !pan.size.w) return;
    centred.current = true;
    pan.setOffset(pan.centreOn(walkerRef.current.tile));
  }, [pan.size.w]);

  const [talk, setTalk] = useState<Talk | null>(null);
  const [menu, setMenu] = useState<number | null>(null);

  /** Walks the player to the nearest of `stands`, then faces `target` (the tile it's next to from the stand reached, or `face`) and `then`. */
  const walkTo = (stands: readonly RouteSpot[], target: (stand: RouteSpot) => RouteSpot, then: () => void, face?: Facing) => {
    clearWalk();
    const from = walkerRef.current.tile;
    const walks = stands.flatMap((to) => {
      const steps = to.x === from.x && to.y === from.y ? [] : routePath(CORNER, from, to);
      return steps ? [{ to, steps }] : [];
    });
    if (!walks.length) return;
    const { to, steps } = walks.reduce((a, b) => (b.steps.length < a.steps.length ? b : a));
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
        const end = { tile: to, face: face ?? facing(to, target(to)) };
        setWalker({ ...end, walking: false });
        standing.current = end;
        then();
      }, steps.length * STEP_MS),
    );
  };
  // A table (or a person) is faced from a stand beside it: the tile of it next to the stand.
  const nextTo = (tiles: readonly RouteSpot[]) => (stand: RouteSpot) => tiles.find((t) => Math.abs(t.x - stand.x) + Math.abs(t.y - stand.y) === 1) ?? tiles[0]!;
  const busy = !!talk || menu !== null;

  /** The message box's next page, or what follows its last: the counter's menu, or nothing. */
  const advance = useCallback(() => {
    if (menu !== null || !talk) return;
    if (talk.page + 1 < talk.pages.length) return setTalk({ ...talk, page: talk.page + 1 });
    setTalk(null);
    if (talk.then === 'offers') setMenu(0);
  }, [talk, menu]);
  const choose = async (i: number) => {
    if (buying) return;
    setMenu(null);
    const offer = COIN_OFFERS[i];
    setTalk({ pages: offer ? await onBuy(offer) : COUNTER.cancel, page: 0 });
  };
  // A or B as the GBA's (Z, Enter or Space; X or Escape): the next page, or the menu's choice (B its EXIT).
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (menu !== null) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') setMenu((m) => ((m ?? 0) + (e.key === 'ArrowUp' ? 2 : 1)) % 3);
        else if (['z', 'Z', 'Enter', ' '].includes(e.key)) void choose(menu);
        else if (['x', 'X', 'Backspace'].includes(e.key)) void choose(2);
        else return;
      } else if (['z', 'Z', 'Enter', ' ', 'x', 'X'].includes(e.key)) advance();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  useEscape(useCallback(() => (menu !== null ? void choose(2) : advance()), [menu, advance]), busy);

  const onMachine = (m: number) => {
    const machine = GAME_CORNER_MAP.machines[m]!;
    walkTo([machine.seat], () => machine.tile, () => (coins ? onSit({ game: 'slots', machine: m }) : setTalk({ pages: [['COINS are needed to play here', 'in the GAME CORNER.']], page: 0 })), machine.face);
  };
  const onTable = (table: 0 | 1) => {
    const { tiles, stands } = GAME_CORNER_MAP.tables[table]!;
    walkTo(stands, nextTo(tiles), () => onSit({ game: 'roulette', table }));
  };
  const onPerson = (p: (typeof GAME_CORNER_MAP.people)[number]) =>
    // Across the counter its clerks are 2 tiles up, faced all the same.
    walkTo(p.stands, () => p.tile, () => {
      if (p.role === 'coins') setTalk({ pages: [...COUNTER.hello, ...COUNTER.ask], page: 0, then: 'offers' });
      else setTalk({ pages: p.text, page: 0 });
    });

  return (
    <figure className="mx-auto w-full space-y-1" style={{ maxWidth: Math.max(768, CORNER.width * ZOOM) }}>
      <div
        ref={box}
        className="relative cursor-grab touch-none overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-600 active:cursor-grabbing"
        style={{ height: Math.min(pan.height, CORNER.height * ZOOM) }}
        aria-label="Mauville's Game Corner. Drag or scroll to look around; click a slot machine or a roulette table to play, or someone to talk to them."
        onPointerDown={pan.onPointerDown}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.endDrag}
        onPointerCancel={pan.endDrag}
      >
        {pan.size.w > 0 && (
          <div
            ref={mapEl}
            className="absolute left-0 top-0 origin-top-left"
            style={{ width: CORNER.width, height: CORNER.height, transform: mapTransform(pan.offset), transition: pan.glide ? `transform ${pan.glide.ms}ms ${pan.glide.ease}` : undefined }}
          >
            <img src={CORNER.image} alt="" draggable={false} className="h-full w-full select-none [image-rendering:pixelated]" />
            {GAME_CORNER_MAP.people.map((p, i) => (
              <OverworldSprite key={i} name={`rse/${p.sprite}`} tile={p.tile} face={p.face} />
            ))}
            <OverworldSprite
              name={playerSprite('rse', undefined, false, gender ?? 'male')}
              tile={walker.tile}
              face={walker.face}
              walkTick={walker.walking ? tick : undefined}
              moveMs={walker.walking ? STEP_MS : 0}
              title="You"
            />
            {!busy && (
              <>
                {GAME_CORNER_MAP.machines.map((m, i) => (
                  <Target key={`m${i}`} x={m.tile.x * 16} y={m.tile.y * 16} w={16} h={16} title={`Slot machine ${i + 1}`} onClick={() => onMachine(i)} />
                ))}
                {GAME_CORNER_MAP.tables.map((t, i) => {
                  const xs = t.tiles.map((s) => s.x);
                  const ys = t.tiles.map((s) => s.y);
                  const x = Math.min(...xs);
                  const y = Math.min(...ys);
                  return (
                    <Target
                      key={`t${i}`}
                      x={x * 16}
                      y={y * 16}
                      w={(Math.max(...xs) - x + 1) * 16}
                      h={(Math.max(...ys) - y + 1) * 16}
                      title={`Roulette, the ${i ? 'right' : 'left'} table: ${i ? 3 : 1} ${i ? 'coins' : 'coin'} a ball`}
                      onClick={() => onTable(i as 0 | 1)}
                    />
                  );
                })}
                {GAME_CORNER_MAP.people.map((p, i) => (
                  <Target
                    key={`p${i}`}
                    x={p.tile.x * 16}
                    y={p.tile.y * 16 - 12}
                    w={16}
                    h={28}
                    title={p.role === 'coins' ? 'The coin counter' : p.role === 'prizes' ? 'The prize corner' : 'Talk'}
                    onClick={() => onPerson(p)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* The money and coins boxes while at the counter, as the game shows them (showmoneybox, showcoinsbox). */}
        {(talk?.then === 'offers' || menu !== null) && (
          <div className="absolute left-2 top-2 z-[1000] space-y-1 text-sm">
            <div className={WINDOW}>MONEY ₱{bank.toLocaleString()}</div>
            <div className={WINDOW}>COINS {coins.toLocaleString()}</div>
          </div>
        )}
        {menu !== null && (
          <ul className={`${WINDOW} absolute right-2 top-2 z-[1000] text-sm`} role="menu">
            {COUNTER.offers.map((o, i) => (
              <li key={o}>
                <button type="button" role="menuitem" className="flex w-full items-center gap-1 whitespace-pre text-left" onMouseEnter={() => setMenu(i)} onClick={() => void choose(i)}>
                  <span className={menu === i ? '' : 'invisible'}>▶</span>
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
        {talk && (
          <button type="button" onClick={advance} className={`${WINDOW} absolute inset-x-2 bottom-2 z-[1000] min-h-[3.5rem] text-left text-sm leading-6`}>
            {talk.pages[talk.page]!.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
            {(talk.page + 1 < talk.pages.length || talk.then) && <span className="absolute bottom-1 right-2 animate-pulse text-[#e05050]">▼</span>}
          </button>
        )}

        <div className="absolute right-2 top-2 z-[900] flex flex-col gap-1">
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
      <figcaption className="text-center text-xs text-slate-400">
        Click a slot machine or a roulette table to play (the left table 1 coin a ball, the right 3), the clerk at the counter for coins, or anyone to talk · each machine's
        luck changes every day · drag or scroll to look around
      </figcaption>
    </figure>
  );
}
