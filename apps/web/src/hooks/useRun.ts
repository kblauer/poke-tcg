import type { AppRouter } from '@poke-tcg/api/router';
import { isBattleKind, type RunAction, type RunTypeId } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { useTRPC } from '../lib/trpc';

export type Overview = inferRouterOutputs<AppRouter>['run']['overview'];
export type ClientRun = NonNullable<Overview['run']>;
export type RunViewData = ClientRun['view'];

/** How long a trainer's "!" shows over them before their battle opens, at least (the battle is being set up meanwhile). */
const SPOTTED_MS = 1000;

/**
 * The home screen's data (account, latest run, decks, run types) and the run's moves. A move that starts a battle goes to
 * its game; every move replaces the cached run with the server's answer. Choosing a battle (or accepting an Ace Trainer's)
 * marks its trainer as `spotted` at once, for the route map's "!" over them, as when a trainer spots you in the games: the
 * request is sent straight away, and the game opens once it's in and the "!" has shown for SPOTTED_MS. Any other option
 * chosen is marked too, while its request runs, so the route map's NPC can start walking up to the player at once.
 *
 * One instance for the whole site (`RunProvider`, in the layout; `useRun` reads it): the site menu, the top bar, the run
 * screen and the game page all share its `busy` and `spotted`, so two of them can't send a move at once, and its overview
 * is fetched once, not again whenever one of them mounts.
 */
function useRunControl() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const overviewKey = trpc.run.overview.queryKey();
  // Always fresh on arrival: decks edited on the Collection tab change which ones can start a run.
  const overview = useQuery({ ...trpc.run.overview.queryOptions(), staleTime: 0 });
  const run = overview.data?.run ?? null;
  // The battle just chosen, while its "!" shows: the step's option (null: the encounter under way, an Ace Trainer accepted).
  const [spotted, setSpotted] = useState<{ option: number | null } | null>(null);
  const spottedAt = useRef<number | null>(null);
  // The wait for the "!" before the game opens, cleared if the provider goes (signing out) so it can't navigate afterwards.
  const opening = useRef<number | null>(null);
  useEffect(() => () => void (opening.current !== null && window.clearTimeout(opening.current)), []);
  /** Marks an option chosen at once, for the route map; only a battle holds its game back for its "!" (SPOTTED_MS). */
  const spot = (option: number | null, battle = true) => {
    spottedAt.current = battle ? Date.now() : null;
    setSpotted({ option });
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: overviewKey });
  const onRun = {
    onSuccess: (next: ClientRun) => {
      queryClient.setQueryData(overviewKey, (old) => old && { ...old, run: next });
      // A card gained is unlocked for the deck builder at once.
      if (next.view.gained.length !== run?.view.gained.length) {
        queryClient.invalidateQueries({ queryKey: trpc.decks.unlocked.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.decks.list.queryKey() });
      }
      if (next.gameId && next.gameId !== run?.gameId) {
        const gameId = next.gameId;
        // Once the "!" has shown long enough (at once if the request took longer).
        const wait = spottedAt.current === null ? 0 : Math.max(0, SPOTTED_MS - (Date.now() - spottedAt.current));
        if (opening.current !== null) window.clearTimeout(opening.current);
        opening.current = window.setTimeout(() => {
          opening.current = null;
          spottedAt.current = null;
          setSpotted(null);
          navigate({ to: '/game/$gameId', params: { gameId } });
        }, wait);
      } else if (!spottedAt.current) setSpotted(null);
      // Escaped from the battle (an Escape Rope): back to the run.
      else if (run?.gameId && !next.gameId) navigate({ to: '/' });
    },
    onError: () => {
      spottedAt.current = null;
      setSpotted(null);
      refresh();
    },
  };
  const act = useMutation(trpc.run.act.mutationOptions(onRun));
  const choose = useMutation(trpc.run.choose.mutationOptions(onRun));
  // Debug only: a battle chosen and won at once, with no game to open.
  const skip = useMutation(trpc.run.debugSkipBattle.mutationOptions(onRun));
  // Using an item also changes how many are left.
  const itemUse = useMutation(
    trpc.run.useItem.mutationOptions({
      ...onRun,
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.run.inventory.queryKey() }),
    }),
  );
  const retry = useMutation(trpc.run.retry.mutationOptions(onRun));
  const start = useMutation(trpc.run.start.mutationOptions({ onSuccess: refresh }));
  // Debug only: a locked run type started anyway.
  const debugStart = useMutation(trpc.run.debugStart.mutationOptions({ onSuccess: refresh }));

  const busy = act.isPending || choose.isPending || skip.isPending || itemUse.isPending || retry.isPending || start.isPending || debugStart.isPending;
  const error = act.error ?? choose.error ?? skip.error ?? itemUse.error ?? retry.error ?? start.error ?? debugStart.error;
  return {
    overview,
    run,
    busy,
    error: error?.message ?? null,
    spotted,
    send(action: RunAction) {
      if (!run || busy) return;
      if (action.type === 'ACCEPT' && run.view.encounter?.kind === 'elite') spot(null);
      act.mutate({ runId: run.id, expectedVersion: run.version, action });
    },
    /** Takes option `option` on the map; `deckId` switches to that deck first (whatever the option). */
    choose(option: number, deckId?: string) {
      if (!run || busy) return;
      // A battle starts at once (an Ace Trainer's only once accepted): its trainer spots the player. Any other encounter's
      // NPC starts walking up to him at once too (the route map).
      const kind = run.view.steps[run.view.position]?.options[option]?.kind;
      if (kind && kind !== 'elite') spot(option, isBattleKind(kind));
      choose.mutate({ runId: run.id, expectedVersion: run.version, option, deckId });
    },
    /** Debug: takes battle option `option` and wins it at once (debugSkipBattle); `deckId` as for `choose`. */
    skipBattle(option: number, deckId?: string) {
      if (run && !busy) skip.mutate({ runId: run.id, expectedVersion: run.version, option, deckId });
    },
    applyItem(itemId: string) {
      if (run && !busy) itemUse.mutate({ runId: run.id, itemId });
    },
    retry() {
      if (run && !busy) retry.mutate({ runId: run.id });
    },
    /** Starts a run; `locked`: a locked run type, in debug mode (debugStart). */
    start(type: RunTypeId, deckId: string, locked = false) {
      if (!busy) (locked ? debugStart : start).mutate({ type, deckId });
    },
  };
}

export type RunControl = ReturnType<typeof useRunControl>;

const RunContext = createContext<RunControl | null>(null);

/** Holds the one `useRunControl` for the site; mounted in the layout, inside the router (it navigates). */
export function RunProvider({ children }: { children: ReactNode }) {
  return createElement(RunContext.Provider, { value: useRunControl() }, children);
}

/** The site's run control (RunProvider). */
export function useRun(): RunControl {
  const control = useContext(RunContext);
  if (!control) throw new Error('useRun needs a RunProvider');
  return control;
}
