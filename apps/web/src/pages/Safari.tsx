import type { SafariAction } from '@poke-tcg/safari';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ReturnToPlay } from '../components/ReturnToPlay';
import { Toasts } from '../components/Toasts';
import { BattlePlayback } from '../components/safari/BattlePlayback';
import { SafariBoard } from '../components/safari/SafariBoard';
import { EncounterPanel, NextStepPanel, Panel, PickDialog, ReadyPanel, ShopPanel, StarterPanel } from '../components/safari/SafariPanels';
import { SAFARI_BALL, SAFARI_MAPS } from '../components/safari/safariArt';
import { useIsPhone } from '../hooks/useIsPhone';
import { useSafariActions, useSafariOverview, useSafariUnits, type ClientSafari } from '../hooks/useSafari';
import { useToasts } from '../hooks/useToasts';
import { PAGE_WIDTH } from '../utils/layout';
import { commas } from '../utils/math';
import { BUTTON, DIALOG, DIALOG_BACKDROP } from '../utils/styles';

/** localStorage key: the last battle played back (its run and seed), so a reload doesn't play it again. */
const SEEN_KEY = 'poke-tcg.safari-seen';
const battleKey = (run: ClientSafari) => (run.view.last ? `${run.id}:${run.view.last.seed}` : null);
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function writeSeen(key: string) {
  try {
    localStorage.setItem(SEEN_KEY, key);
  } catch {
    // Not remembered: a reload plays the battle again.
  }
}

const BATTLES = 15;

/**
 * Safari Draft (`/safari`, from the Play tab's menu; README: Safari Draft; issue #239): an auto-battler run on the Safari
 * Zone's map (FireRed's). With no run under way, its start (and the last run's result); then the starter, and between
 * battles the shop, the step's opponents and encounters, the board and the inventory; an opponent chosen, their board and
 * Start battle; each battle played back (BattlePlayback) as soon as its result comes, once. The server plays everything:
 * the page sends the player's actions (safari.act) and shows the view it gets back.
 */
export function SafariPage() {
  const overview = useSafariOverview();
  const units = useSafariUnits();
  const actions = useSafariActions();
  const toasts = useToasts();
  const phone = useIsPhone();
  const run = overview.data?.run ?? null;
  const view = run?.view;
  const [watching, setWatching] = useState<string | null>(null);
  const [conceding, setConceding] = useState(false);

  // A battle's result plays back once, as soon as it comes (and not again after a reload).
  const lastKey = run && battleKey(run);
  useEffect(() => {
    if (lastKey && readSeen() !== lastKey) {
      writeSeen(lastKey);
      setWatching(lastKey);
    }
  }, [lastKey]);

  const act = (action: SafariAction) => {
    if (!run || actions.busy) return;
    actions.act(run, action).catch((e: Error) => toasts.push('warning', e.message));
  };
  const start = () => actions.start().catch((e: Error) => toasts.push('warning', e.message));

  const cardWidth = phone ? '4.6rem' : 'clamp(5rem, 7.5vw, 7.5rem)';
  const background = SAFARI_MAPS[Math.min(SAFARI_MAPS.length - 1, Math.floor((view?.battles ?? 0) / 4))]!;
  const over = !run || run.status !== 'ACTIVE';

  if (overview.error && !overview.data) return <div className={`${PAGE_WIDTH} text-red-400`}>Couldn't load the Safari Draft: {overview.error.message}</div>;

  return (
    <div className="relative min-h-full">
      {/* The Safari Zone (FireRed) behind the page, a different area as the run goes on, dimmed so the panels read over it. */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-60 [image-rendering:pixelated]" style={{ backgroundImage: `url(${background})` }} />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-slate-950/40" />
      <div className={`${PAGE_WIDTH} space-y-4 pb-8`}>
        <PageHeader
          title="Safari Draft"
          info={view && !over ? <RunFigures view={view} /> : 'Draft a team, battle 15 trainers, then beat the Champion.'}
          actions={
            <>
              {view && !over && (
                <button type="button" className={BUTTON} onClick={() => setConceding(true)}>
                  Concede
                </button>
              )}
              <ReturnToPlay />
            </>
          }
        />

        {overview.isPending && <p className="text-slate-300">Loading…</p>}

        {!overview.isPending && over && <RunOver run={run} busy={actions.busy} onStart={start} onWatch={() => run && setWatching(battleKey(run))} />}

        {view && !over && (
          <>
            {view.phase === 'starter' && <StarterPanel view={view} units={units} cardWidth={cardWidth} busy={actions.busy} act={act} />}
            {view.phase === 'shop' && <NextStepPanel view={view} units={units} busy={actions.busy} act={act} />}
            {view.phase === 'ready' && <ReadyPanel view={view} units={units} cardWidth={cardWidth} busy={actions.busy} act={act} />}
            {view.phase === 'encounter' && <EncounterPanel view={view} units={units} cardWidth={cardWidth} busy={actions.busy} act={act} />}
            {view.phase !== 'starter' && (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Panel title="Your team" info={view.last && <WatchAgain onWatch={() => setWatching(battleKey(run!))} />}>
                  <SafariBoard view={view} units={units} cardWidth={cardWidth} busy={actions.busy} canSell={view.phase !== 'ready'} act={act} />
                </Panel>
                <div className="space-y-4">
                  {view.phase !== 'encounter' && <ShopPanel view={view} units={units} cardWidth={cardWidth} busy={actions.busy} act={act} open={view.phase === 'shop'} />}
                  <RunLog log={view.log} />
                </div>
              </div>
            )}
            <PickDialog view={view} units={units} cardWidth={cardWidth} busy={actions.busy} act={act} />
          </>
        )}
      </div>

      {watching && run?.view.last && battleKey(run) === watching && <BattlePlayback battle={run.view.last} units={units} cardWidth={phone ? '3.4rem' : 'clamp(4rem, 6.5vw, 6.5rem)'} onClose={() => setWatching(null)} />}

      {conceding && (
        <div className={`${DIALOG_BACKDROP} z-[1100]`} onClick={() => setConceding(false)}>
          <div className={`${DIALOG} max-w-sm space-y-3 p-4`} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-slate-100">Concede this run? It ends at once and banks nothing.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={BUTTON} onClick={() => setConceding(false)}>
                Keep playing
              </button>
              <button type="button" className={`${BUTTON} !bg-red-500 !text-gray-900 hover:!bg-red-400`} onClick={() => (setConceding(false), act({ type: 'CONCEDE' }))}>
                Concede
              </button>
            </div>
          </div>
        </div>
      )}
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}

/** The run's figures in the heading: its HP as Safari Balls, its ₱, the battle and the shop tier. */
function RunFigures({ view }: { view: NonNullable<ClientSafari['view']> }) {
  const champion = view.battles >= BATTLES;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-200">
      <span className="flex items-center gap-0.5" title={`${view.hp} HP left`}>
        {Array.from({ length: 3 }, (_, i) => (
          <img key={i} src={SAFARI_BALL} alt="" className={`h-4 w-4 [image-rendering:pixelated] ${i < view.hp ? '' : 'opacity-25 grayscale'}`} />
        ))}
      </span>
      <span className="text-yellow-200">₱{commas(view.pokedollars)}</span>
      <span>{champion ? `Champion${view.championTries ? `, try ${view.championTries + 1}` : ''}` : `Battle ${Math.min(view.battles + 1, BATTLES)} of ${BATTLES}`}</span>
    </span>
  );
}

function WatchAgain({ onWatch }: { onWatch: () => void }) {
  return (
    <button type="button" className="text-xs text-yellow-300 underline-offset-2 hover:underline" onClick={onWatch}>
      Watch the last battle again
    </button>
  );
}

/** The run's log, newest first. */
function RunLog({ log }: { log: string[] }) {
  if (!log.length) return null;
  return (
    <Panel title="Log">
      <ol className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-slate-300">
        {[...log].reverse().map((line, i) => (
          <li key={log.length - i}>{line}</li>
        ))}
      </ol>
    </Panel>
  );
}

/** No run under way: the last run's result, if any, and a new run. */
function RunOver({ run, busy, onStart, onWatch }: { run: ClientSafari | null; busy: boolean; onStart: () => void; onWatch: () => void }) {
  const view = run?.view;
  return (
    <Panel title={view ? (view.phase === 'won' ? 'You beat the Champion!' : 'Run over') : 'Welcome to the Safari Zone!'}>
      <div className="space-y-3 text-sm text-slate-200">
        {view?.phase === 'won' && <p className="text-yellow-200">₱{commas(view.pokedollars)} went to your bank.</p>}
        {view?.phase === 'lost' && <p>{view.conceded ? 'You conceded the run.' : 'You ran out of HP.'} Nothing was banked.</p>}
        {!view && (
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            <li>Pick a starter, then buy Pokémon cards in the shop after every battle. Up to 6 fight on your board, 6 more wait in your inventory.</li>
            <li>Battles play themselves: each side attacks left to right, every attack at a random opposing Pokémon, which strikes back.</li>
            <li>2 of a Pokémon that evolve into the same card merge into it; 3 of a Pokémon with no evolutions make a golden copy. 2, 4 or 6 of a type give a synergy.</li>
            <li>15 battles, then Champion Blue, on 3 HP. Beat him to bank the run's ₱.</li>
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${BUTTON} !bg-yellow-300 !px-5 !py-1.5 font-bold !text-gray-900 hover:!bg-yellow-200`} disabled={busy} onClick={onStart}>
            {view ? 'Start a new run' : 'Start a run'}
          </button>
          {view?.last && (
            <button type="button" className={BUTTON} onClick={onWatch}>
              Watch the last battle
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
}
