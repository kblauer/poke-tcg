import { lookupCard, type GameAction, type PlayerView } from '@poke-tcg/game-engine';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Board, type LastMove, type PlayedMove } from '../components/Board';
import { PLAYED_CARD_MS } from '../components/PlayedCard';
import { TOOL_POP_MS, toolPopsAfter, ToolPopsContext, type ToolPop } from '../components/ToolPops';
import { TURN_BANNER_MS } from '../components/TurnBanner';
import { CoinFlip, flipsAfter, useTestFlips, type Flip } from '../components/CoinFlip';
import { useGameLogInNav } from '../components/NavLog';
import { RunStats } from '../components/run/RunStats';
import { useIsPhone } from '../hooks/useIsPhone';
import { useOptions } from '../hooks/useOptions';
import { useRun } from '../hooks/useRun';
import { usePracticeMusic, useRunMusic } from '../hooks/useRunMusic';
import { useSkipFlips } from '../hooks/useSkipFlips';
import { DeckCosmeticsContext } from '../hooks/useCosmetics';
import { useTRPC } from '../lib/trpc';
import { PAGE_WIDTH } from '../utils/layout';

/** How long each move of a reply stays on screen before the next one (a CPU move showing its card: PLAYED_CARD_MS; one that began a turn: TURN_BANNER_MS). */
const MOVE_MS = 900;

/** A move still to be shown: the view after it, and whether it began a new turn (the TurnBanner then plays before the next move). */
type Frame = LastMove & { view: PlayerView; newTurn: boolean };

const lastEntry = (view: PlayerView) => view.log.at(-1)?.n ?? 0;

export function GamePage() {
  const { gameId } = useParams({ from: '/game/$gameId' });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const viewQuery = trpc.game.view.queryOptions({ gameId });
  const { data, error } = useQuery(viewQuery);
  /** The moves of the last action still to be played back, oldest first; the last is the view in the cache. */
  const [replay, setReplay] = useState<Frame[]>([]);
  /** While they play back: the view on screen (the move before the next one). Null shows the cached view. */
  const [shownView, setShownView] = useState<PlayerView | null>(null);
  /** The next move's coin flips, playing before the move is shown. */
  const [flips, setFlips] = useState<Flip[]>([]);
  /** Debug only: a test coin flip from the Debug tab (requestTestFlip), shown over the table with the game unchanged. */
  const [testFlip, setTestFlip] = useState<Flip[] | null>(null);
  useTestFlips(setTestFlip);
  /** The next move is on screen, and the one after it follows shortly. */
  const [revealed, setRevealed] = useState(false);
  const [skipFlips] = useSkipFlips();
  const phone = useIsPhone();
  const [options] = useOptions();
  /** The move that led to the view on screen, for its animation. */
  const [lastMove, setLastMove] = useState<LastMove | null>(null);
  /** The card the CPU's move played or used, shown large (PlayedCard): with the move, or before its coin flips. */
  const [played, setPlayed] = useState<PlayedMove | null>(null);
  /** Pokémon Tools that worked by themselves in the move on screen (a Berry's heal), shown over their Pokémon (ToolPops). */
  const [toolPops, setToolPops] = useState<ToolPop[]>([]);
  useEffect(() => {
    if (!toolPops.length) return;
    const timer = setTimeout(() => setToolPops([]), TOOL_POP_MS);
    return () => clearTimeout(timer);
  }, [toolPops]);

  // The response already includes the CPU's reply, so no polling or realtime is needed. It comes as the
  // view after every move; the cache gets the last one, and they're all played back one at a time.
  const act = useMutation(
    trpc.game.act.mutationOptions({
      onSuccess: ({ frames }) => {
        if (data) setShownView(data.view);
        queryClient.setQueryData(viewQuery.queryKey, (old) => old && { ...old, view: frames.at(-1)!.view });
        // An action that ends the battle (won or lost) goes straight to the result: no coin flips or move-by-move replay.
        const shown = frames.at(-1)!.view.phase === 'finished' ? frames.slice(-1) : frames;
        const turnOf = (i: number) => (i === 0 ? data?.view.turn : shown[i - 1]!.view.turn);
        // A Pokémon or Energy card isn't shown when the Options tab says so (its Pokémon still glow); Trainers always are.
        const hidden = ({ highlight, view }: (typeof shown)[number]) => {
          const kind = highlight?.defId ? lookupCard(view.cards, highlight.defId).kind : null;
          return (kind === 'pokemon' && !options.showPokemonPlayed) || (kind === 'energy' && !options.showEnergyPlayed);
        };
        setReplay(
          shown.map((f, i) => ({
            player: f.player,
            type: f.type,
            version: f.view.version,
            highlight: f.highlight && hidden(f) ? { ...f.highlight, defId: null } : f.highlight,
            view: f.view,
            newTurn: f.view.turn !== turnOf(i),
          })),
        );
      },
      onError: () => {
        setReplay([]);
        setShownView(null);
        setFlips([]);
        queryClient.invalidateQueries({ queryKey: viewQuery.queryKey });
      },
    }),
  );

  // Each move's coin flips play first, while the board still shows what came before, so their results only
  // appear once the coins have landed (or are skipped). A CPU card with coin flips is shown before them, and the coins
  // only spin once it has burst away. Then the move is shown, and after a moment the next.
  const next = replay[0];
  /** The card of the move shown with it (its flips came first, or it has none), unless it was shown before the flips. */
  const cardShown = useRef(false);
  /** The move's coin flips were played out: the Pokémon it changed don't glow after them (they do when the flips are skipped). */
  const flipsShown = useRef(false);
  const showCard = (frame: Frame) => frame.highlight?.defId && setPlayed({ defId: frame.highlight.defId, cards: frame.view.cards, stamp: frame.version });
  /** The move shown has Tools at work: the next one waits for their animation (TOOL_POP_MS). */
  const toolsShown = useRef(false);
  const reveal = () => {
    setFlips([]);
    // Its Tools at work (the API gives them a move of their own, after the attack and before the next turn).
    const before = shownView ?? data?.view;
    const pops = before ? toolPopsAfter(next!.view.log, lastEntry(before)) : [];
    toolsShown.current = pops.length > 0;
    if (pops.length) setToolPops(pops);
    setShownView(next!.view);
    const highlight = flipsShown.current && next!.highlight ? { ...next!.highlight, pokemon: [] } : next!.highlight;
    setLastMove({ player: next!.player, type: next!.type, version: next!.version, highlight, cardFirst: cardShown.current });
    if (!cardShown.current) showCard(next!);
    setRevealed(true);
  };
  useEffect(() => {
    cardShown.current = false;
    flipsShown.current = false;
    if (!next) return;
    const before = shownView ?? data?.view;
    const fresh = before ? flipsAfter(next.view.log, lastEntry(before)) : [];
    // Once the battle is over, its flips aren't shown.
    if (!fresh.length || skipFlips || next.view.phase === 'finished') return reveal();
    flipsShown.current = true;
    if (!next.highlight?.defId) return setFlips(fresh);
    cardShown.current = true;
    showCard(next);
    const timer = setTimeout(() => setFlips(fresh), PLAYED_CARD_MS);
    return () => clearTimeout(timer);
  }, [next]);
  useEffect(() => {
    if (!revealed) return;
    const last = replay.length === 1;
    const timer = setTimeout(
      () => {
        setRevealed(false);
        setReplay((r) => r.slice(1));
        if (last) setShownView(null);
      },
      last ? 0 : toolsShown.current ? TOOL_POP_MS : next?.newTurn ? TURN_BANNER_MS : next?.highlight?.defId && !cardShown.current ? PLAYED_CARD_MS : MOVE_MS,
    );
    return () => clearTimeout(timer);
  }, [revealed]);

  // The log as it's played back, in the site menu's Battle log tab on a big screen (and the view for its Debug tab).
  const logView = shownView ?? data?.view;
  useGameLogInNav(logView ? { log: logView.log, you: logView.you, gameId, view: logView } : null);

  // A failed refetch (a dropped connection on a tab focus) keeps the board up with what it has: the next action refetches.
  if (error && !data) return <p className={`${PAGE_WIDTH} text-red-400`}>{error.message}</p>;
  if (!data) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;

  const view = data.view;
  const replaying = next !== undefined;
  // One move at a time: a second click would be built on a stale version and rejected. Nothing can be done while
  // the reply plays back, coin flips included.
  const send = (action: GameAction) => {
    if (!act.isPending && !replaying) act.mutate({ gameId, expectedVersion: view.version, action });
  };
  const pending = act.isPending ? act.variables.action : null;
  const shown = shownView ?? view;
  return (
    // The battle's deck's own cosmetics, where it has them (useCosmetics); the Tools at work, over their Pokémon (ToolPops).
    <DeckCosmeticsContext.Provider value={data.cosmetics}>
      <ToolPopsContext.Provider value={toolPops}>
        <Board
          gameId={gameId}
          view={shown}
          lastMove={lastMove}
          played={played}
          replaying={replaying}
          send={send}
          pending={pending}
          error={act.error?.message}
          errorAt={act.submittedAt}
          runTab={data.runId && phone ? <GameRunTab /> : undefined}
          overlay={
            flips.length > 0 ? (
              <CoinFlip flips={flips} you={view.you} onDone={reveal} />
            ) : testFlip ? (
              // Shown whatever the skip setting, and done with nothing to reveal.
              <CoinFlip flips={testFlip} you={view.you} onDone={() => setTestFlip(null)} />
            ) : (
              shown.phase === 'finished' && <BattleResult view={shown} opponent={data.opponent} run={data.runId !== null} />
            )
          }
        />
      </ToolPopsContext.Provider>
      {data.runId ? <RunBattleMusic /> : <PracticeMusic opponent={data.opponent} gameId={gameId} />}
    </DeckCosmeticsContext.Provider>
  );
}

/** Auto play during a run's battle: the battle's theme, from the run's encounter. */
function RunBattleMusic() {
  useRunMusic();
  return null;
}

/** Auto play during a Training battle: its opponent's theme. */
function PracticeMusic({ opponent, gameId }: { opponent: string | null; gameId: string }) {
  usePracticeMusic(opponent, gameId);
  return null;
}

/** The side panel's Run tab during a run's battle on a phone: the run's HP, ₱, EXP and Bag (on a big screen, the site menu's). */
function GameRunTab() {
  const run = useRun();
  const data = run.overview.data;
  if (!data?.run) return <p className="text-xs text-slate-500">Loading…</p>;
  return <RunStats view={data.run.view} account={data.account} run={run} />;
}

/**
 * Once the battle is over, centred on the play area (the Board's overlay): the result and the way back, to the run
 * for a run's battle, otherwise to the Training tab.
 */
function BattleResult({ view, opponent, run }: { view: PlayerView; opponent: string | null; run: boolean }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const won = view.winner === view.you;
  return (
    <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center p-4">
      <div data-keep-action className="pointer-events-auto w-fit space-y-3 rounded-lg bg-slate-800 p-6 text-center shadow-2xl ring-1 ring-slate-600">
        <p className={`text-2xl font-bold ${won ? 'text-yellow-300' : 'text-rose-300'}`}>{won ? `You beat ${opponent ?? 'your opponent'}!` : `${opponent ?? 'Your opponent'} won.`}</p>
        {run ? (
          <>
            <p className="text-sm text-slate-400">{won ? 'Your reward is waiting.' : 'You lose 1 HP.'}</p>
            <Link
              to="/"
              onClick={() => queryClient.invalidateQueries({ queryKey: trpc.run.overview.queryKey() })}
              className="inline-block rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95"
            >
              Back to the run
            </Link>
          </>
        ) : (
          <Link to="/battle" className="inline-block rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95">
            Next battle
          </Link>
        )}
      </div>
    </div>
  );
}
