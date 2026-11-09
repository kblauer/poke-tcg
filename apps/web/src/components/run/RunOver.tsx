import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { bankablePokedollars, finalBoss, GENERATIONS, ITEMS, RUN_TYPES, runType, type RunType } from '@poke-tcg/campaign';
import { useEffect, useState, type ReactNode } from 'react';
import type { ClientRun, Overview, RunControl } from '../../hooks/useRun';
import { ItemShop } from './ItemShop';
import { NewRunPicker } from './NewRunPicker';
import { RunCard } from './RunCard';
import { commas } from '../../utils/math';

/** The cards a run unlocked (already on the Collection tab). */
function GainedCards({ view }: { view: ClientRun['view'] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {view.gained.map((id, i) => (
        <RunCard key={i} def={view.cards[id]} />
      ))}
    </div>
  );
}

/** localStorage key: the run whose results the player closed, and which panels (see useClosed). */
const CLOSED_KEY = 'poke-tcg.run-over-closed';
type Panel = 'result' | 'shop';

/** The panels closed until opened: the results (the user's: minimized by default, as a conceded run's rewards). */
const CLOSED_AT_FIRST: Panel[] = ['result'];

/**
 * The panels of a beaten run's screen that are closed: the results at first (CLOSED_AT_FIRST), then as the player opens
 * and closes them, for this run only (the next run's end starts over). Remembered in the browser, so a reload keeps them.
 */
function useClosed(runId: string) {
  const [closed, setClosed] = useState<Panel[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CLOSED_KEY) ?? 'null') as { runId: string; panels: Panel[] } | null;
      return saved?.runId === runId ? saved.panels : CLOSED_AT_FIRST;
    } catch {
      return CLOSED_AT_FIRST;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify({ runId, panels: closed }));
    } catch {
      // Not saved (private window or blocked storage): they just open again on the next visit.
    }
  }, [runId, closed]);
  const toggle = (panel: Panel) => setClosed((c) => (c.includes(panel) ? c.filter((p) => p !== panel) : [...c, panel]));
  return { isClosed: (panel: Panel) => closed.includes(panel), toggle };
}

/** The button that closes a panel, at the end of its header. */
const CloseButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button className="flex shrink-0 self-center rounded p-1 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200" onClick={onClick} aria-label={label} title={label}>
    <CloseIcon sx={{ fontSize: 18 }} />
  </button>
);

/** A closed panel: one slim bar with its title and a summary, which opens it again. */
const Minimized = ({ title, summary, onOpen }: { title: ReactNode; summary?: ReactNode; onOpen: () => void }) => (
  <button className="flex w-full items-center gap-3 rounded-lg bg-slate-800 px-4 py-2 text-left text-sm ring-1 ring-slate-600 transition hover:ring-slate-400" onClick={onOpen}>
    <span className="font-semibold">{title}</span>
    {summary && <span className="min-w-0 flex-1 truncate text-slate-400">{summary}</span>}
    <ExpandMoreIcon sx={{ fontSize: 18 }} className="ml-auto shrink-0 text-slate-400" />
  </button>
);

/**
 * After a run. Beaten: its results first (the boss beaten, the badge won, the runs and booster packs it unlocked and the
 * cards gained, already unlocked in the deck builder, its ₱ and EXP first), then the shop, then the next run (Start run on
 * its tile). The results and the shop can be closed to a slim bar
 * (see useClosed). Lost: the cards gained, start over, or (for testing) carry on with full HP. Conceded: its rewards (what it
 * banked and the cards gained), closed to a bar until opened, then start over (no retry).
 * Whichever way it ended, Return to Play (in the heading, as during the run: the user's) goes back to the Play tab's menu. The run's
 * deck isn't offered to be saved here (the user's: removed); the Collection tab's Copy on the Current run deck keeps it.
 */
export function RunOver({ current, overview, run }: { current: ClientRun; overview: Overview; run: RunControl }) {
  const view = current.view;
  const type = runType(view.type);
  const last = finalBoss(type);
  const won = (view.badges ?? []).map((id) => ITEMS[id]?.name).filter(Boolean);
  // The booster packs the run unlocked (its first battle completed, or beating it), from its log.
  const packs = view.log.flatMap((line) => line.match(/^Unlocked (.+) booster packs\.$/)?.slice(1) ?? []);
  const packsNote = packs.length > 0 ? ` Unlocked booster packs: ${packs.join(', ')}.` : '';
  const banked = bankablePokedollars(view);
  const { isClosed, toggle } = useClosed(current.id);
  // A conceded run's rewards: closed to its bar until opened (the user's).
  const [rewardsOpen, setRewardsOpen] = useState(false);
  if (view.phase === 'lost' && view.conceded) {
    const earned = `Earned ₱${commas(banked)}, 0 EXP`;
    return (
      // Its rewards above the next run (the user's: the cards it unlocked are shown nowhere else), closed to a bar with what
      // it banked (no EXP: that's for beating a run) until opened.
      <div className="space-y-4">
        {rewardsOpen ? (
          <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600">
            <div className="flex items-baseline gap-3">
              <h3 className="text-lg font-semibold">Run rewards</h3>
              <span className="min-w-0 flex-1 text-sm text-slate-400">{earned}</span>
              <CloseButton label="Close the run's rewards" onClick={() => setRewardsOpen(false)} />
            </div>
            {packs.length > 0 && <p className="text-sm text-slate-300">Unlocked {packs.join(', ')} booster packs</p>}
            {view.gained.length > 0 ? <GainedCards view={view} /> : <p className="text-sm text-slate-400">No new cards this time.</p>}
          </section>
        ) : (
          <Minimized title="Run rewards" summary={`${earned} · ${view.gained.length} card${view.gained.length === 1 ? '' : 's'} unlocked`} onOpen={() => setRewardsOpen(true)} />
        )}
        <NewRunPicker overview={overview} run={run} title="Start over" defaultType={view.type} />
      </div>
    );
  }
  if (view.phase === 'lost') {
    return (
      <div className="space-y-4">
        <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-rose-700">
          <h3 className="text-lg font-semibold text-rose-300">Out of HP: the run is over</h3>
          <p className="text-sm text-slate-300">
            You made it to encounter {Math.min(view.position + 1, view.steps.length)} of {view.steps.length}. The cards you gained stay unlocked in the deck builder.{' '}
            {banked ? `₱${banked} went to your bank.` : 'No battle was completed without conceding it, so no ₱ were banked.'}
            {packsNote}
          </p>
          {view.gained.length > 0 && <GainedCards view={view} />}
          <button className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold transition hover:bg-amber-500 active:scale-95 disabled:opacity-40" disabled={run.busy} onClick={() => run.retry()}>
            Retry with 3 HP (testing)
          </button>
        </section>
        <NewRunPicker overview={overview} run={run} title="Start over" defaultType={view.type} />
      </div>
    );
  }
  const beat = `You beat ${last.title} ${last.name}!`;
  // The runs beating this one opened (the first time it's beaten): a gym run's last badge opens its Gym Challenge, the Gym
  // Challenge its Champion run and the next generation's runs.
  const firstWin = overview.runTypes.find((t) => t.id === view.type)?.beaten === 1;
  const opened = (id: string) => overview.runTypes.find((t) => t.id === id)?.locked === null;
  const gen = GENERATIONS[type.generation];
  const champion = (Object.values(RUN_TYPES) as RunType[]).find((t) => t.generation === type.generation && t.requires === 'gymChallenge');
  const nextGen = GENERATIONS[type.generation + 1];
  const runUnlocks = !firstWin
    ? []
    : type.segments.length === 1 && type.segments[0]!.bosses.length === 1
      ? gen && opened(gen.gymChallenge) ? [runType(gen.gymChallenge).name] : []
      : gen && view.type === gen.gymChallenge
        ? [...(champion && opened(champion.id) ? [champion.name] : []), ...(nextGen ? [`Gen ${type.generation + 1} · ${nextGen.region}`] : [])]
        : [];
  // What it won, a line each: the ₱ and EXP first (the user's).
  const lines = [
    `Earned ₱${commas(view.pokedollars)}, ${view.exp} EXP`,
    ...(won.length > 0 ? [`Gained the ${won.join(' and the ')}!`] : []),
    ...runUnlocks.map((name) => `Unlocked ${name}`),
    ...(packs.length > 0 ? [`Unlocked ${packs.join(', ')} booster packs`] : []),
  ];
  return (
    <div className="space-y-4">
      {/* The results first, then the shop (the user's). */}
      {isClosed('result') ? (
        <Minimized title={<span className="text-yellow-300">{beat}</span>} summary={[...lines, `${view.gained.length} cards gained`].join(' · ')} onOpen={() => toggle('result')} />
      ) : (
        <section className="space-y-3 rounded-lg bg-slate-800 p-5 ring-1 ring-yellow-400">
          <div className="flex items-start gap-3">
            <h3 className="flex-1 text-lg font-semibold text-yellow-300">{beat}</h3>
            <CloseButton label="Close the results" onClick={() => toggle('result')} />
          </div>
          <div className="space-y-1 text-sm text-slate-300">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          {view.gained.length > 0 ? (
            <GainedCards view={view} />
          ) : (
            <p className="text-sm text-slate-400">No new cards this time.</p>
          )}
        </section>
      )}
      {isClosed('shop') ? (
        <Minimized title="Shop" summary="Spend the EXP from your runs" onOpen={() => toggle('shop')} />
      ) : (
        <ItemShop close={<CloseButton label="Close the shop" onClick={() => toggle('shop')} />} />
      )}
      <NewRunPicker overview={overview} run={run} title="Next run" />
    </div>
  );
}
