import { COIN_OFFERS, gameCornerMusic, MAX_COINS, ROULETTE_MIN_BETS, SLOT_MACHINES, type GameCornerGame } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { DEBUG_BUILD, useDebugEnabled } from '../../utils/debug';
import { BUTTON } from '../../utils/styles';
import { useMusicCue } from '../MusicPlayer';
import { Toasts } from '../Toasts';
import { RouletteScreen } from './RouletteScreen';
import { SlotMachineScreen } from './SlotMachineScreen';

/** Where the player sits: at a roulette table (0 left, 1 right) or a slot machine (0-11), or at neither. */
type Seat = { game: 'roulette'; table: 0 | 1 } | { game: 'slots'; machine: number } | null;

const MUSIC = gameCornerMusic();
const TILE = 'flex flex-col items-center gap-2 rounded-lg bg-slate-800 p-3 text-sm ring-1 ring-slate-700 transition hover:bg-slate-700 hover:ring-yellow-300/60 disabled:opacity-50 disabled:hover:bg-slate-800 disabled:hover:ring-slate-700';

/**
 * The Mauville Game Corner (the Extras page's): the account's Coin Case, the counter selling coins for banked ₱ at the
 * game's prices (`extras.buyCoins`), and the 2 roulette tables (RouletteScreen) and 12 slot machines (SlotMachineScreen,
 * each with its luck today) to sit at. Each round played is settled by the API in turn (`extras.coinRound`), while the
 * screen keeps its own count as the game does. Auto play plays the Game Corner's theme throughout.
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
  const buy = useMutation(
    trpc.extras.buyCoins.mutationOptions({
      onSuccess: (r) => {
        setCoins(r.coins, r.bank);
        // The bank in the top bar.
        queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() });
      },
      onError: (e) => toasts.push('error', e.message),
    }),
  );
  const fill = useMutation(trpc.extras.fillCoins.mutationOptions({ onSuccess: (r) => setCoins(r.coins), onError: (e) => toasts.push('error', e.message) }));
  const round = useMutation(trpc.extras.coinRound.mutationOptions());
  const [seat, setSeat] = useState<Seat>(null);
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

  return (
    <div className="space-y-6">
      <section className="space-y-2">
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-400">Were you looking for coins? It's ₱1,000 for 50 coins.</span>
          {COIN_OFFERS.map((o) => (
            <button key={o.coins} className={BUTTON} disabled={buy.isPending || coins > MAX_COINS - o.coins || bank < o.price} onClick={() => buy.mutate({ coins: o.coins })}>
              {o.coins} coins · ₱{o.price.toLocaleString()}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Roulette</h3>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
          {([0, 1] as const).map((table) => (
            <li key={table}>
              <button type="button" className={`${TILE} w-full`} disabled={coins < ROULETTE_MIN_BETS[table]} onClick={() => setSeat({ game: 'roulette', table })}>
                <div className="h-16 w-16 rounded-full bg-[url(/extras/roulette/wheel.png)] bg-cover [image-rendering:pixelated]" />
                <span>{table ? 'Right table' : 'Left table'}</span>
                <span className="text-xs text-slate-400">{ROULETTE_MIN_BETS[table]} {ROULETTE_MIN_BETS[table] === 1 ? 'coin' : 'coins'} a ball</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Slot machines</h3>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
          {Array.from({ length: SLOT_MACHINES }, (_, machine) => (
            <li key={machine}>
              <button type="button" className={`${TILE} w-full`} disabled={!coins} onClick={() => setSeat({ game: 'slots', machine })}>
                <div className="h-12 w-12 bg-[url(/extras/slots/seven.png)] bg-contain bg-center bg-no-repeat [image-rendering:pixelated]" />
                <span>Machine {machine + 1}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-sm text-slate-400">Each machine's luck changes every day, as the game's do. Up to 3 coins a spin: each coin plays another line.</p>
      </section>
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}
