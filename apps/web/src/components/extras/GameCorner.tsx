import { buyCoinsError, COIN_OFFERS, GAME_CORNER_MAP, gameCornerMusic, MAX_COINS, routePath, type GameCornerGame, type Route, type RouteSpot } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useRun } from '../../hooks/useRun';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { playerSprite, STEP_MS, WALK_FRAME_MS, type Facing } from '../../utils/overworld';
import { facing } from '../../utils/routeFigures';
import { BUTTON } from '../../utils/styles';
import { DialogueBox, type Dialogue } from '../DialogueBox';
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

const MUSIC = gameCornerMusic();
const { counter: COUNTER } = GAME_CORNER_MAP;
/** The Game Corner as a run map (`Route`, sizes in pixels), for the player's walks (routePath). */
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
/** The money and coins boxes' colours (Emerald's text window, drawn as part of the game's picture). */
const WINDOW = 'rounded-[3px] border-2 border-[#5a6b8c] bg-white px-2 py-1 font-emerald text-[#3a3a3a] shadow-[inset_0_0_0_1px_#a4c5f6]';

/**
 * The counter's clerks stand behind it (the user's, as the Battle Tower's receptionist): drawn SINK px lower and cut off
 * at the counter's top edge (y COUNTER_EDGE, in the map's pixels), so their legs and feet are hidden behind it.
 */
const COUNTER_EDGE = 45;
const SINK = 2;
/** On a phone the room is drawn at least this big, scrolled sideways where it's wider than the screen. */
const MIN_ZOOM = 2;

/** A target on the map (a machine, a table, a person, the door): see-through, outlined on hover. */
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
 * The Mauville Game Corner (the Extras page's): the game's own room (GAME_CORNER_MAP) across the page's width, its people
 * where the game has them. Clicking a slot machine or a roulette table walks the player (Brendan or May) to it and
 * sits them at it (SlotMachineScreen, with the machine's luck today; RouletteScreen, the left table 1 coin a ball, the
 * right 3); the coin clerk sells coins for banked ₱ as the game's does (her words and menu, `extras.buyCoins`); the others
 * say their lines, in the Battle Tower's text box (DialogueBox, the user's). The door leads back to the Extras menu. Each
 * round played is settled by the API in turn (`extras.coinRound`), while the screen keeps its own count as the game does.
 * Auto play plays the Game Corner's theme throughout.
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
 * The Game Corner's room (GameCorner's), the containing box's whole width (the user's; on a phone at least MIN_ZOOM,
 * scrolled sideways): its people, the player, and the targets to click. A machine or table clicked walks the player to
 * its seat (a table's nearest side) and `onSit`s them; a person clicked walks them up to talk (across the counter to its
 * clerks), their words in the text box (DialogueBox: typed out, a click anywhere on the room or Enter showing the line
 * whole, then going on). The coin clerk's talk ends in her question (50 or 500 coins, or EXIT, as the game's menu), the
 * money and coins shown as the game shows them. The door walks the player out, back to the Extras menu.
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
  const navigate = useNavigate();
  const phone = useIsPhone();
  const box = useRef<HTMLDivElement>(null);
  // The room fills the box's width.
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const zoom = width ? Math.max(phone ? MIN_ZOOM : 0, width / CORNER.width) : 0;
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
  // A room wider than the box (a phone) opens on the player.
  const centred = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (centred.current || !zoom || !el) return;
    centred.current = true;
    el.scrollLeft = (walkerRef.current.tile.x * 16 + 8) * zoom - el.clientWidth / 2;
  }, [zoom]);

  // What's said, a page at a time (the coin clerk's last page her question), and whether the money and coins boxes are up.
  const [dialogue, setDialogue] = useState<(Dialogue & { id: number }) | null>(null);
  const said = useRef(0);
  const [atCounter, setAtCounter] = useState(false);
  const pressDialogue = useRef<(() => void) | null>(null);
  /** Says `pages` one after another, then asks `ask`'s question on the last page (its choices answering it), or ends. */
  const say = (pages: string[][], ask?: { choices: string[]; answer: (choice: number) => void }) => {
    const show = (i: number) => {
      const last = i === pages.length - 1;
      const text = pages[i]!.join('\n');
      setDialogue({ id: ++said.current, text, ...(last && ask ? ask : { answer: () => (last ? setDialogue(null) : show(i + 1)) }) });
    };
    show(0);
  };
  const busy = !!dialogue;

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

  /** The coin clerk's question answered: one of the offers bought (her thanks, or why not), or EXIT. */
  const choose = async (i: number) => {
    if (buying) return;
    setDialogue(null);
    setAtCounter(false);
    const offer = COIN_OFFERS[i];
    say(offer ? await onBuy(offer) : COUNTER.cancel);
  };
  // Escape (the GBA's B): EXIT at the coin clerk's question, otherwise as a click on the box.
  useEscape(() => (dialogue?.choices ? void choose(dialogue.choices.length - 1) : pressDialogue.current?.()), busy);

  const onMachine = (m: number) => {
    const machine = GAME_CORNER_MAP.machines[m]!;
    walkTo([machine.seat], () => machine.tile, () => (coins ? onSit({ game: 'slots', machine: m }) : say([['COINS are needed to play here', 'in the GAME CORNER.']])), machine.face);
  };
  const onTable = (table: 0 | 1) => {
    const { tiles, stands } = GAME_CORNER_MAP.tables[table]!;
    walkTo(stands, nextTo(tiles), () => onSit({ game: 'roulette', table }));
  };
  const onPerson = (p: (typeof GAME_CORNER_MAP.people)[number]) =>
    // Across the counter its clerks are 2 tiles up, faced all the same.
    walkTo(p.stands, () => p.tile, () => {
      if (p.role !== 'coins') return say(p.text);
      setAtCounter(true);
      // The game's menu as the question's choices, its columns' spaces closed up.
      say([...COUNTER.hello, ...COUNTER.ask], { choices: COUNTER.offers.map((o) => o.trim().replace(/\s+/g, ' ')), answer: (i) => void choose(i) });
    });
  // Out by the door (onto its mat, facing out), back to the Extras menu.
  const door = GAME_CORNER_MAP.door;
  const onDoor = () => walkTo([door], () => ({ x: door.x, y: door.y + 1 }), () => navigate({ to: '/extras' }), 'down');

  const clerk = (p: (typeof GAME_CORNER_MAP.people)[number]) => p.role !== 'talk';
  return (
    <figure className="w-full space-y-1">
      {/* A click anywhere on the room does as a click on the text box (the Battle Tower's). */}
      <div className="relative overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-600" style={{ height: zoom ? CORNER.height * zoom : 240 }} onClick={() => pressDialogue.current?.()}>
        <div
          ref={box}
          className="h-full overflow-x-auto overflow-y-hidden"
          aria-label="Mauville's Game Corner. Click a slot machine or a roulette table to play, someone to talk to them, or the door to leave."
        >
          {zoom > 0 && (
            <div className="relative" style={{ width: CORNER.width * zoom, height: CORNER.height * zoom }}>
              <div className="absolute left-0 top-0 origin-top-left" style={{ width: CORNER.width, height: CORNER.height, transform: `scale(${zoom})` }}>
                <img src={CORNER.image} alt="" draggable={false} className="h-full w-full select-none [image-rendering:pixelated]" />
                {GAME_CORNER_MAP.people.map((p, i) => !clerk(p) && <OverworldSprite key={i} name={`rse/${p.sprite}`} tile={p.tile} face={p.face} />)}
                {/* The counter's clerks behind it, their legs and feet hidden (COUNTER_EDGE, SINK). */}
                <div className="pointer-events-none absolute inset-0" style={{ clipPath: `inset(0 0 ${CORNER.height - COUNTER_EDGE}px 0)` }}>
                  <div className="absolute inset-0" style={{ transform: `translateY(${SINK}px)` }}>
                    {GAME_CORNER_MAP.people.map((p, i) => clerk(p) && <OverworldSprite key={i} name={`rse/${p.sprite}`} tile={p.tile} face={p.face} />)}
                  </div>
                </div>
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
                    {/* The door's mat, both its tiles. */}
                    <Target x={door.x * 16} y={door.y * 16} w={32} h={16} title="Exit: back to the Extras menu" onClick={onDoor} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* The money and coins boxes while at the counter, as the game shows them (showmoneybox, showcoinsbox). */}
        {atCounter && (
          <div className="absolute left-2 top-2 z-[1000] space-y-1 text-sm">
            <div className={WINDOW}>MONEY ₱{bank.toLocaleString()}</div>
            <div className={WINDOW}>COINS {coins.toLocaleString()}</div>
          </div>
        )}
        {dialogue && <DialogueBox key={dialogue.id} dialogue={dialogue} pressRef={pressDialogue} phone={phone} />}
      </div>
      <figcaption className="text-center text-xs text-slate-400">
        Click a slot machine or a roulette table to play (the left table 1 coin a ball, the right 3), the clerk at the counter for coins, or anyone to talk · each machine's
        luck changes every day · the door leads back to the Extras menu
      </figcaption>
    </figure>
  );
}
