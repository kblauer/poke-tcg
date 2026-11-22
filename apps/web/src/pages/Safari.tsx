import type { SafariAction } from '@poke-tcg/safari';
import type { TrainerName } from '@poke-tcg/safari/effects';
import { useEffect, useState, type ReactNode } from 'react';
import { ConcedeButton } from '../components/ConcedeButton';
import { useNavPage } from '../components/NavLog';
import { Playmat } from '../components/Playmat';
import { Toasts } from '../components/Toasts';
import { BattleLine, BattleResult, TrainerWords, useBattlePlayback, type LastBattle, type Playback } from '../components/safari/BattlePlayback';
import { CARD, CardRow, EmptyPlace, PlaceSpacers, PlayerSide, SynergyChips } from '../components/safari/SafariBoard';
import { SafariNav, type SafariNavProps } from '../components/safari/SafariNav';
import { EncounterOverlay, NextStepOverlay, PickDialog, RunOverDialog, ShopOverlay, StarterDialog } from '../components/safari/SafariPanels';
import { UnitCard } from '../components/safari/UnitCard';
import { UnitInspectProvider } from '../components/safari/UnitInspector';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, opponentSprite } from '../components/safari/safariArt';
import { useCosmetics } from '../hooks/useCosmetics';
import { useSafariActions, useSafariOverview, useSafariUnits, type ClientSafari, type SafariUnit, type SafariViewData } from '../hooks/useSafari';
import { useToasts } from '../hooks/useToasts';
import { useWindowFill } from '../hooks/useWindowFill';
import { PAGE_WIDTH } from '../utils/layout';
import { BUTTON } from '../utils/styles';

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

/** The table's own buttons, in its top right corner: the battle page's Concede button's size (the user's, 2026-11-22). */
const TABLE_BUTTON = 'rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 transition hover:bg-slate-600 active:scale-95 disabled:cursor-progress';
type Units = Map<string, SafariUnit>;
type Act = (action: SafariAction) => void;

/**
 * Safari Draft (`/safari`, from the Play tab's menu; README: Safari Draft; issue #239): an auto-battler run in one window,
 * the battle page's way (the user's, 2026-11-18): a table filling the window, the opponent's row at the top, the player's
 * board in the middle and the inventory at the bottom. The run's figures, the shop's button, the playback's speed and
 * the log are in the site menu, as the Badge Challenge's run's are (the user's, 2026-11-22: SafariNav; no bar, title or
 * Return to Play of the page's own), Concede in the table's top right corner. The shop, the step's choices
 * and the encounters are panels over the opponent's row (the board stays usable under them); the starter, a merge's pick
 * and the run's start and end are dialogs. A battle plays back on the table itself, once,
 * as soon as its result comes. The server plays everything: the page sends the player's actions (safari.act) and shows
 * the view it gets back.
 */
export function SafariPage() {
  const overview = useSafariOverview();
  const units = useSafariUnits();
  const actions = useSafariActions();
  const toasts = useToasts();
  const fill = useWindowFill<HTMLDivElement>();
  const { playmat } = useCosmetics();
  const run = overview.data?.run ?? null;
  const view = run?.view;
  const [watching, setWatching] = useState<string | null>(null);
  // The shop's card size (the table's, CARD), for the starter's and a merge's pick, which show over the whole window.
  const [cardProbe, setCardProbe] = useState<HTMLDivElement | null>(null);
  const [cardWidth, setCardWidth] = useState<string | undefined>();
  useEffect(() => {
    if (!cardProbe) return;
    const observer = new ResizeObserver(() => setCardWidth(`${cardProbe.getBoundingClientRect().width}px`));
    observer.observe(cardProbe);
    return () => observer.disconnect();
  }, [cardProbe]);
  const slots = useNavPage();
  /** The panel over the top of the table between battles: the shop, the step's choices, or none (hidden). */
  const [panel, setPanel] = useState<'shop' | 'next' | null>('shop');

  // A battle's result plays back once, as soon as it comes (and not again after a reload).
  const lastKey = run && battleKey(run);
  useEffect(() => {
    if (lastKey && readSeen() !== lastKey) {
      writeSeen(lastKey);
      setWatching(lastKey);
    }
  }, [lastKey]);
  // Each shop opens on its cards (an encounter step with no shop on its choices).
  const shopId = view?.phase === 'shop' ? `${view.battles}:${view.encounters.length}:${view.opponents.length}:${!!view.shop}` : null;
  useEffect(() => {
    if (shopId) setPanel(view?.shop ? 'shop' : 'next');
  }, [shopId]);

  const act = (action: SafariAction) => {
    if (!run || actions.busy) return;
    actions.act(run, action).catch((e: Error) => toasts.push('warning', e.message));
  };
  const start = () => actions.start().catch((e: Error) => toasts.push('warning', e.message));

  const over = !run || run.status !== 'ACTIVE';
  const battle = watching && run?.view.last && battleKey(run) === watching ? run.view.last : null;

  if (overview.error && !overview.data) return <div className={`${PAGE_WIDTH} text-red-400`}>Couldn't load the Safari Draft: {overview.error.message}</div>;

  const nav: SafariNavProps = {
    slots,
    view: view && !over ? view : null,
    before: battle,
    shop: view && !over && !battle && view.phase === 'shop' && view.shop ? { open: panel === 'shop', toggle: () => setPanel((p) => (p === 'shop' ? null : 'shop')) } : null,
    onWatch: view?.last && !battle ? () => setWatching(battleKey(run!)) : undefined,
  };

  return (
    // Fills the window below the header, as the battle page does (-mt/-mb undo the layout's spacing).
    <UnitInspectProvider>
    <div ref={fill.ref} className="-mb-4 -mt-6 flex select-none" style={fill.style}>
      <div className={`flex min-w-0 flex-1 flex-col py-2 ${PAGE_WIDTH}`}>
        {/* The table: the player's playmat over slate, its cards sized to fill it (index.css's .safari-cards). */}
        <div className="relative min-h-0 flex-1 rounded-lg bg-slate-900 ring-1 ring-slate-700 [container-type:size]">
          <div className="safari-cards absolute inset-0 rounded-[inherit]">
            {/* The table's card width, measured for the dialogs over the whole window (outside the table's sizing). */}
            <div ref={setCardProbe} aria-hidden className="pointer-events-none invisible absolute" style={{ width: CARD }} />
            <Playmat id={playmat} />
            <div className="relative flex h-full flex-col justify-between gap-1.5 overflow-y-auto p-2">
              {overview.isPending && <p className="m-auto text-slate-300">Loading…</p>}
              {view && battle && <BattleTable key={watching!} battle={battle} view={view} units={units} busy={actions.busy} act={act} onClose={() => setWatching(null)} nav={(playback) => <SafariNav {...nav} playback={playback} />} />}
              {view && !battle && <DraftTable view={view} units={units} busy={actions.busy} act={act} active={!over} onPanel={setPanel} />}
              {!view && !overview.isPending && <EmptyTable />}
            </div>
            {/* The table's top right corner (under the panels, which have their own Hide): Concede, which asks first. */}
            {view && !over && !battle && (
              <div className="absolute right-2 top-2 z-20" data-keep-action>
                <ConcedeButton className={TABLE_BUTTON} disabled={actions.busy} note="This Safari Draft run ends at once and banks nothing." onConcede={() => act({ type: 'CONCEDE' })} />
              </div>
            )}

            {/* What's over the table between battles. */}
            {view && !over && !battle && (
              <>
                {view.phase === 'shop' && panel === 'shop' && <ShopOverlay view={view} units={units} busy={actions.busy} act={act} onClose={() => setPanel(null)} onNext={() => setPanel('next')} />}
                {view.phase === 'shop' && panel === 'next' && <NextStepOverlay view={view} units={units} busy={actions.busy} act={act} onBack={() => setPanel('shop')} />}
                {view.phase === 'encounter' && <EncounterOverlay view={view} units={units} busy={actions.busy} act={act} />}
              </>
            )}
          </div>
        </div>
      </div>
      {!battle && <SafariNav {...nav} />}

      {view && !over && !battle && view.phase === 'starter' && <StarterDialog view={view} units={units} busy={actions.busy} act={act} cardWidth={cardWidth} />}
      {view && !over && !battle && <PickDialog view={view} units={units} busy={actions.busy} act={act} cardWidth={cardWidth} />}
      {!overview.isPending && over && !battle && <RunOverDialog run={run} busy={actions.busy} onStart={start} onWatch={() => run && setWatching(battleKey(run))} />}
      <Toasts toasts={toasts.toasts} />
    </div>
    </UnitInspectProvider>
  );
}

/** No run yet: the table bare, its places dashed (the run's start is a dialog over it). */
function EmptyTable() {
  const row = (
    <CardRow>
      {Array.from({ length: 6 }, (_, i) => (
        <EmptyPlace key={i} width={CARD} />
      ))}
    </CardRow>
  );
  return (
    <>
      {row}
      {row}
    </>
  );
}

/** An opponent's name, sprite (or the legendary's card), difficulty and pay, and their Trainer as words (the user's: no card on the board), above their row. */
function OpponentTag({ o, units, trainer }: { o: { name: string; boss?: string; difficulty: string; pay: number; board?: string[] }; units: Units; trainer?: TrainerName }) {
  const sprite = opponentSprite(o);
  return (
    <div className="flex items-center justify-center gap-2">
      {sprite ? <img src={sprite} alt="" className="h-10 w-10 [image-rendering:pixelated]" /> : o.board?.[0] && <UnitCard id={o.board[0]} unit={units.get(o.board[0])} width="1.75rem" />}
      <span className="font-heading text-sm text-slate-50">{o.name}</span>
      <span className={`rounded px-1.5 text-xs font-bold text-gray-900 ${DIFFICULTY_COLOR[o.difficulty]}`}>{DIFFICULTY_LABEL[o.difficulty]}</span>
      {o.pay > 0 && <span className="text-xs text-yellow-200">₱{o.pay} for a win</span>}
      {trainer && <TrainerWords trainer={trainer} />}
    </div>
  );
}

/**
 * The table between battles: the chosen opponent's board at the top, its synergies above its cards (dashed places until
 * one is chosen); between the two sides, Start battle once an opponent is chosen, under what can still be done, else the
 * shop's and the next battle's buttons (the shop may be hidden: the user's, 2026-11-22); the player's side. Both rows
 * are 6 places wide, a shorter line filled from the left, so each Pokémon is above the one across from it.
 */
function DraftTable({ view, units, busy, act, active, onPanel }: { view: SafariViewData; units: Units; busy: boolean; act: Act; active: boolean; onPanel: (p: 'shop' | 'next') => void }) {
  const o = view.phase === 'ready' ? view.opponent : null;
  const empty = !view.board.some((c) => c?.kind === 'pokemon');
  return (
    <>
      <div className="flex flex-col gap-1.5">
        {o ? (
          <>
            <OpponentTag o={o} units={units} trainer={o.trainer} />
            <div className="flex min-h-6 justify-center">
              <SynergyChips types={o.board.map((id) => units.get(id)?.type ?? '')} quiet />
            </div>
            <CardRow>
              {o.board.map((id, i) => (
                <UnitCard key={i} id={id} unit={units.get(id)} width={CARD} />
              ))}
              <PlaceSpacers count={6 - o.board.length} />
            </CardRow>
          </>
        ) : (
          <>
            <div className="flex min-h-10 items-center justify-center text-xs text-slate-500">{active ? "Your next opponent's board shows here once chosen." : ''}</div>
            <div className="min-h-6" />
            <CardRow>
              {Array.from({ length: 6 }, (_, i) => (
                <EmptyPlace key={i} width={CARD} />
              ))}
            </CardRow>
          </>
        )}
      </div>

      <div className="flex min-h-11 flex-col items-center justify-center gap-1.5" data-keep-action>
        {active && o && (
          <>
            <span className="rounded-full bg-slate-950/70 px-4 py-0.5 text-center text-base text-slate-100">Reorder your board or pick your Trainer card, then start the battle.</span>
            <button type="button" className={`${BUTTON} !bg-yellow-300 !px-8 !py-2 !text-base font-bold !text-gray-900 hover:!bg-yellow-200`} disabled={busy || empty} onClick={() => act({ type: 'BATTLE' })}>
              Start battle
            </button>
          </>
        )}
        {active && view.phase === 'shop' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {view.shop && (
              <button type="button" className={`${BUTTON} !px-4 !py-1.5`} onClick={() => onPanel('shop')}>
                Open shop
              </button>
            )}
            <button type="button" className={`${BUTTON} !bg-yellow-300 !px-5 !py-1.5 font-bold !text-gray-900 hover:!bg-yellow-200`} onClick={() => onPanel('next')}>
              Next battle →
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <PlayerSide view={view} units={units} busy={busy || !active} canSell={active && view.phase !== 'ready'} act={act} />
      </div>
    </>
  );
}

/**
 * A battle played back on the table: the opponent's line at the top, the player's where their board is, and nothing
 * between them until it's over (the result and Continue). Its lines of text, the speed and Skip are in the site menu
 * (`nav`: SafariNav with the playback); Skip is in the table's top right corner too, for a screen with no menu open.
 */
function BattleTable({ battle, view, units, busy, act, onClose, nav }: { battle: LastBattle; view: SafariViewData; units: Units; busy: boolean; act: Act; onClose: () => void; nav: (playback: Playback) => ReactNode }) {
  const playback = useBattlePlayback(battle);
  return (
    <>
      {nav(playback)}
      {!playback.done && (
        <button type="button" className={`${TABLE_BUTTON} absolute right-2 top-2 z-20`} onClick={playback.skip} data-keep-action>
          Skip
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <OpponentTag o={{ ...battle.against, pay: 0, board: battle.opponent.units.map((u) => u.id) }} units={units} trainer={battle.opponent.trainer} />
        <BattleLine playback={playback} side={1} units={units} types={battle.opponent.units.map((u) => u.type)} trainer={battle.opponent.trainer} />
      </div>
      <BattleResult playback={playback} battle={battle} onClose={onClose} />
      <div className="flex flex-col gap-1.5">
        <PlayerSide view={view} units={units} busy canSell={false} act={act} board={<BattleLine playback={playback} side={0} units={units} types={battle.mine.units.map((u) => u.type)} trainer={battle.mine.trainer} />} />
      </div>
    </>
  );
}
