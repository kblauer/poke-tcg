import { idleMusic } from '@poke-tcg/campaign';
import { AREAS, cuts, mapView, species, TICK_MS, type IdleAction, type WalkArea } from '@poke-tcg/idle';
import { useState } from 'react';
import type { Dialogue } from '../components/DialogueBox';
import { useMusicCue, useMusicSettings } from '../components/MusicPlayer';
import { PageHeader } from '../components/PageHeader';
import { ReturnToPlay } from '../components/ReturnToPlay';
import { Toasts } from '../components/Toasts';
import { SceneTransition } from '../components/BattleTransition';
import { AreaScene, usePreloadMaps } from '../components/idle/AreaScene';
import { TownMap } from '../components/idle/TownMap';
import { BattleScreen } from '../components/idle/BattleScreen';
import { Bag, catchUpPages, IdleSettings } from '../components/idle/IdleSettings';
import { PartyOverlay } from '../components/idle/PartyOverlay';
import { MonIcon } from '../components/idle/MonIcon';
import { Pokedex } from '../components/idle/Pokedex';
import { StarterScene } from '../components/idle/StarterScene';
import { MartScene } from '../components/idle/MartScene';
import { TownMenu } from '../components/idle/TownMenu';
import { useEscape } from '../hooks/useEscape';
import { placeOf, placeTrack, useIdleActions, useIdleOverview, useIdlePlayback, useTownHere, type ClientIdleRun } from '../hooks/useIdle';
import { useRun } from '../hooks/useRun';
import { useToasts } from '../hooks/useToasts';
import { DEBUG_BUILD, useDebugEnabled } from '../utils/debug';
import { PAGE_WIDTH } from '../utils/layout';
import { commas } from '../utils/math';
import { BUTTON } from '../utils/styles';

// The party is an overlay over the game screen (PartyOverlay, the user's), not a tab.
type Tab = 'bag' | 'dex' | 'settings' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'bag', label: 'Bag' },
  { id: 'dex', label: 'Pokédex' },
  { id: 'settings', label: 'Settings' },
  { id: 'log', label: 'Log' },
];

const name = (id: number) => species(id).name;

/** The battle music's kind for a battle (the Champion's, a gym leader's or the Elite Four's, a trainer's, a wild one). */
const battleKind = (trainer: string | undefined) => (!trainer ? 'wild' : trainer.startsWith('champion') ? 'champion' : trainer.startsWith('leader') || trainer.startsWith('elite-four') ? 'leader' : 'trainer');

/**
 * The Idle Adventure (`/idle`, from the Play tab's menu; README: Idle Adventure, issue #133): with no run under way,
 * Professor Oak's lab and the starters (later runs, the Pokédex's caught species too); under way, the run plays itself
 * (useIdlePlayback): the player walking the area's track, its battles a turn every TICK_MS, the towns going on by
 * themselves after a moment; the lab's and the town's questions, the notices and what happened while away in the
 * scene's text box (DialogueBox, the Battle Tower's and the Game Corner's). Under the scene, the party, bag, Pokédex,
 * settings and the run's log. A run never holds the Play tab (it runs on its own). Open to every account (the user's,
 * 2026-10-25; only in local debug before); its debug tools (the warp) only in a debug build with them on.
 */
export function IdlePage() {
  const overview = useIdleOverview();
  const actions = useIdleActions();
  const toasts = useToasts();
  const gender = useRun().overview.data?.playerGender === 'female' ? 'female' : 'male';
  const debugOn = useDebugEnabled();
  const debug = DEBUG_BUILD && debugOn;
  const soundtrack = useMusicSettings()?.soundtrack ?? 'remastered';
  const [tab, setTab] = useState<Tab>('bag');
  // The party overlay's open (kept as the scene changes: the map, a battle, a town).
  const [partyOpen, setPartyOpen] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const data = overview.data;
  const run = data?.run ?? null;
  const active = run?.status === 'ACTIVE' ? run : null;
  const settings = data?.settings;
  const { play, summary, closeSummary, actOn, acted, interrupt, throwBall, throwing } = useIdlePlayback(active, name, (m) => toasts.push('error', m));
  // A town on screen waits for the player however long (the user's): only time away is played by its wait.
  useTownHere(active);
  // What happened while away, a page at a time in the scene's text box (in place of its own line); Escape closes it.
  const [page, setPage] = useState(0);
  const pages = summary ? catchUpPages(summary) : [];
  const closeCatchUp = () => (setPage(0), closeSummary());
  const catchUp: Dialogue | null = summary ? { text: pages[Math.min(page, pages.length - 1)]!, answer: () => (page < pages.length - 1 ? setPage(page + 1) : closeCatchUp()) } : null;
  useEscape(closeCatchUp, !!summary);

  // The music (auto play), as FireRed plays it where the player is: the battle's theme, the Hall of Fame once won, Oak's
  // lab with no run under way (its starters), otherwise the map's own song; Surfing on any water the player surfs (cave
  // water too), but on Route 23, Victory Road and the Indigo Plateau (Overworld_MusicCanOverrideMapMusic); the bike's on
  // the Cycling Road (Route 17), where the game puts the player on the bike.
  const place = active ? (play.place ?? placeOf(active.view)) : null;
  const area = place ? AREAS[place.area] : null;
  let mapName: string | null = active ? null : 'PalletTown_ProfessorOaksLab';
  let surfing = false;
  if (area && 'legs' in area) {
    const leg = area.legs[Math.min(place!.leg, area.legs.length - 1)]!;
    const track = placeTrack(place!);
    const step = track[Math.min(place!.step, track.length - 1)]!;
    mapName = leg.maps[step[0]]!;
    surfing = (step[4][1] === 'w' || step[4][1] === 'p') && !/^(Route23|VictoryRoad_|IndigoPlateau_)/.test(mapName);
  } else if (area && 'map' in area) mapName = area.map;
  const mapMusic = mapName ? mapView(mapName).music : null;
  const cycling = mapName === 'Route17';
  // A battle's song from its trainer's "!" (or a wild one's flash) on (`cue`, the user's), the same song into the battle.
  // Only while a run is under way: given up, the lab's song at once (the user's).
  const fight = active ? (play.battle ?? play.cue) : null;
  useMusicCue(
    fight
      ? idleMusic(soundtrack, { battle: battleKind(fight.trainer), id: `${run?.id}:${play.segment}` })
      : run?.view.phase === 'won'
        ? idleMusic(soundtrack, { won: true })
        : mapMusic
          ? idleMusic(soundtrack, { map: mapMusic, surfing, cycling })
          : null,
  );

  // The maps it will show next, fetched ahead (the user's: no map drawing in bit by bit).
  usePreloadMaps(place ? place.area : null);

  if (overview.error && !data) return <p className={`${PAGE_WIDTH} text-red-400`}>{overview.error.message}</p>;
  if (!data || !settings) return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;

  const failed = (e: unknown) => toasts.push('error', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
  // Acting on the server's newest version (a segment playing is saved already), and telling the playback the answer.
  const act = (action: IdleAction) =>
    active &&
    actions
      .act(actOn(active), action)
      // Stop, Continue run and the Town Map's moves act at once: the segment on screen dropped (`interrupt`).
      .then((r) => (cuts(action) ? interrupt(r.run) : acted(r.run)))
      .catch(failed);
  // A purchase in the store: whether it went through (the buy screen says "Here you are!" only then).
  const buy = (item: string, count: number) =>
    active
      ? actions
          .act(actOn(active), { type: 'BUY', item, count })
          .then((r) => (acted(r.run), true))
          .catch((e: unknown) => (failed(e), false))
      : Promise.resolve(false);
  const start = (id: number, shiny = false) => actions.start(id, shiny).catch(failed);
  const v = run?.view;
  // A catch with the party full while the player watches (the user's): which party Pokémon it takes the place of, or
  // Release; the run waits for the answer (CAUGHT_CHOICE). Each choice its icon over its name and level.
  const caughtLabel = (m: { species: number; level: number }, i: number, all: { species: number; level: number }[]) =>
    `${name(m.species)} Lv. ${m.level}${all.some((o, j) => j !== i && o.species === m.species && o.level === m.level) ? ` (${i + 1})` : ''}`;
  const choosing: Dialogue | null =
    active && v?.choosing
      ? {
          text: `${name(v.choosing.species)} (Lv. ${v.choosing.level}) was caught, but the party is full. Which Pokémon should it replace?`,
          inline: true,
          choices: [
            ...v.party.map((m, i) => ({ label: caughtLabel(m, i, v.party), icon: <MonIcon id={m.species} />, disabled: actions.busy })),
            { label: `Release ${name(v.choosing.species)}`, icon: <MonIcon id={v.choosing.species} />, disabled: actions.busy },
          ],
          answer: (i) => void act({ type: 'CAUGHT_CHOICE', ...(i < v.party.length && { replace: v.party[i]!.uid }) }),
        }
      : null;
  // The party over the game screen (the user's): its button in the screen's top right corner, its slots sliding out; and
  // the Town Map's button in its top left corner, on every scene (the user's, in place of the mode drop-down), and the
  // map, opened, over everything.
  const overlays = () =>
    active && v ? (
      <>
        <PartyOverlay party={v.party} bag={v.bag} busy={actions.busy} pending={v.pendingChanges} open={partyOpen} onToggle={setPartyOpen} onAct={act} />
        <TownMap view={v} busy={actions.busy} gender={gender} onAct={act} />
      </>
    ) : null;
  const over = run && run.status !== 'ACTIVE';

  return (
    <div className={`${PAGE_WIDTH} space-y-4`}>
      <PageHeader
        title="Idle Adventure"
        info={active && v ? `${v.areaName}${v.phase === 'grinding' ? ` (grinding to Lv. ${v.grindTarget})` : v.loop ? (v.loop.kind === 'fish' ? ' (fishing)' : ' (grinding)') : ''} · ${v.badges.length} badge${v.badges.length === 1 ? '' : 's'} · ₱${commas(v.money)}` : 'Walk Kanto from Pallet Town to the Indigo Plateau'}
        actions={
          active ? (
            <span className="flex items-center gap-2">
              {/* (Auto-grinding is quit with the Town Map's Stop or Continue run, the user's: no button of its own.) */}
              {
            confirmQuit ? (
              <span className="flex items-center gap-2 text-sm">
                Give up this run? Its ₱ are lost (only beating the Champion banks them).
                <button className="rounded bg-red-700 px-3 py-1 text-sm hover:bg-red-600" onClick={() => (setConfirmQuit(false), void act({ type: 'GIVE_UP' }))}>
                  Give up
                </button>
                <button className={BUTTON} onClick={() => setConfirmQuit(false)}>
                  Keep going
                </button>
              </span>
            ) : (
              <button className={BUTTON} onClick={() => setConfirmQuit(true)}>
                Give up
              </button>
            )}
            </span>
          ) : undefined
        }
      />

      {active && <TickMeter turn={play.battle ? play.turn : null} tickAt={play.tickAt} />}

      {/* The scene: the starter's lab, the area walked, a battle, or the town's choice. */}
      {!active ? (
        <div className="space-y-3">
          {over && v && (
            <section className="rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
              <h3 className="text-lg font-semibold">{v.phase === 'won' ? 'You became the Champion!' : 'Your last run is over.'}</h3>
              <p className="text-sm text-slate-300">
                {v.badges.length} badges, {v.totals.battles} battles, {v.totals.caught} Pokémon caught. {v.phase === 'won' ? `Its ₱${commas(v.money)} went to the bank.` : `Its ₱${commas(v.money)} were lost: only beating the Champion banks them.`}
              </p>
              <div className="mt-2 flex gap-2">
                {v.party.map((m) => (
                  <span key={m.uid} className="flex items-center text-xs text-slate-300" title={name(m.species)}>
                    <MonIcon id={m.species} />
                    {m.level}
                  </span>
                ))}
              </div>
            </section>
          )}
          <StarterScene gender={gender} busy={actions.busy} onPick={(id) => start(id)} dialogue={catchUp} />
          {(data.starters.length > 3 || data.shinyStarters.length > 0) && (
            <section className="space-y-2">
              <h3 className="text-lg font-semibold">Or start from your Pokédex</h3>
              <p className="text-sm text-slate-400">Any species you've caught, at level 5 with its best IVs and EVs on record.</p>
              <Pokedex dex={data.dex} starters={data.starters} shinyStarters={data.shinyStarters} onPick={start} busy={actions.busy} />
            </section>
          )}
          <ReturnToPlay />
        </div>
      ) : v?.phase === 'town' && v.inStore ? (
        // In the town's Poké Mart (the user's): the town waits until the player leaves.
        <MartScene key={v.area} run={active} gender={gender} busy={actions.busy} onBuy={buy} onLeave={() => void act({ type: 'LEAVE_STORE' })} dialogue={catchUp} buyChildren={overlays()}>
          {overlays()}
        </MartScene>
      ) : v?.phase === 'town' ? (
        <TownMenu
          run={active}
          gender={gender}
          busy={actions.busy}
          onGym={() => void act({ type: 'GYM' })}
          onGrind={() => void act({ type: 'GRIND' })}
          onStore={() => void act({ type: 'VISIT_STORE' })}
          onContinue={() => void act({ type: 'CONTINUE_RUN' })}
          dialogue={catchUp}
        >
          {overlays()}
        </TownMenu>
      ) : play.battle ? (
        <BattleScreen battle={play.battle} shown={play.shown} gender={gender} dialogue={catchUp} onThrow={throwBall} throwing={throwing}>
          {overlays()}
        </BattleScreen>
      ) : (
        <AreaScene playback={play} gender={gender} dialogue={catchUp ?? choosing ?? (play.notice ? { text: play.notice, choices: [], instant: true, answer: () => {} } : null)}>
          {!play.entering && overlays()}
          {play.entering && <SceneTransition />}
        </AreaScene>
      )}


      {active && v && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-1 border-b border-slate-700">
            {TABS.map((t) => (
              <button key={t.id} className={`rounded-t px-3 py-1.5 text-sm ${tab === t.id ? 'bg-slate-700 font-semibold text-yellow-300' : 'text-slate-400 hover:text-slate-100'}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'bag' && <Bag bag={v.bag} />}
          {tab === 'dex' && <Pokedex dex={data.dex} />}
          {tab === 'settings' && <IdleSettings settings={settings} busy={false} onChange={(s) => void actions.settings(s).catch(failed)} />}
          {tab === 'log' && (
            <ul className="space-y-1 text-sm text-slate-300">
              {[...v.log].reverse().map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          <Badges badges={v.badges} />
          {debug && <DebugWarp run={active} onWarp={(id) => void actions.warp(active, id).catch(failed)} />}
          {debug && <DebugCheats run={active} onMoney={() => void actions.money(active).catch(failed)} onCatch={(on) => void actions.sureCatch(active, on).catch(failed)} />}
        </section>
      )}
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}

/**
 * The game's tick (TICK_MS), only in a battle (the user's): its turn and a narrow bar filling over the turn, from when it
 * began. Out of one (and before the first turn) its row is kept, unseen, so the scene doesn't jump as battles come and go.
 */
function TickMeter({ turn, tickAt }: { turn: number | null; tickAt: number }) {
  return (
    <div className={`mx-auto flex w-full max-w-60 items-center gap-2 text-xs text-slate-400 ${turn === null ? 'invisible' : ''}`} aria-hidden={turn === null || undefined}>
      <span className="shrink-0 tabular-nums">Turn {turn ?? 0}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
        {turn !== null && <div key={`${tickAt}:${turn}`} className="h-full origin-left rounded-full bg-yellow-300" style={{ animation: `idle-tick ${TICK_MS}ms linear 1 both` }} />}
      </div>
      <span className="shrink-0 tabular-nums">{TICK_MS / 1000} s</span>
    </div>
  );
}

/** The run's badges (the run's own: no account badges, those are the Badge Challenge's). */
function Badges({ badges }: { badges: string[] }) {
  if (!badges.length) return null;
  return <p className="text-xs text-slate-400">Badges: {badges.join(', ')}</p>;
}

/** Debug (debug builds only, refused in production): ₱1,000,000 more for the run, and every ball thrown catching. */
function DebugCheats({ run, onMoney, onCatch }: { run: ClientIdleRun; onMoney: () => void; onCatch: (on: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
      <button className={BUTTON} onClick={onMoney}>
        Debug: +₱1,000,000
      </button>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={!!run.view.debugCatch} onChange={(e) => onCatch(e.target.checked)} />
        Debug: every ball catches
      </label>
    </div>
  );
}

/** Debug (debug builds only, refused in production): warps the run to an area's start. */
function DebugWarp({ run, onWarp }: { run: ClientIdleRun; onWarp: (area: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      Debug: warp to
      <select className="rounded bg-slate-700 px-2 py-1 ring-1 ring-slate-600" value={AREAS[run.view.area]!.id} onChange={(e) => onWarp(e.target.value)}>
        {AREAS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.kind === 'gym' ? ` (${(a as WalkArea).leader})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
