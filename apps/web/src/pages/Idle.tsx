import { idleMusic } from '@poke-tcg/campaign';
import { AREAS, mapView, species, TICK_MS, type IdleAction, type WalkArea } from '@poke-tcg/idle';
import { Navigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { Dialogue } from '../components/DialogueBox';
import { useMusicCue, useMusicSettings } from '../components/MusicPlayer';
import { PageHeader } from '../components/PageHeader';
import { ReturnToHome } from '../components/ReturnToHome';
import { Toasts } from '../components/Toasts';
import { AreaScene, usePreloadMaps } from '../components/idle/AreaScene';
import { BattleScreen } from '../components/idle/BattleScreen';
import { Bag, catchUpPages, IdleSettings } from '../components/idle/IdleSettings';
import { MonIcon, PartyScreen } from '../components/idle/PartyScreen';
import { Pokedex } from '../components/idle/Pokedex';
import { StarterScene } from '../components/idle/StarterScene';
import { Store, TownMenu } from '../components/idle/TownMenu';
import { useEscape } from '../hooks/useEscape';
import { placeOf, placeTrack, useIdleActions, useIdleOverview, useIdlePlayback, type ClientIdleRun } from '../hooks/useIdle';
import { useRun } from '../hooks/useRun';
import { useToasts } from '../hooks/useToasts';
import { DEBUG_BUILD, useDebugEnabled, useDebugStatus } from '../utils/debug';
import { PAGE_WIDTH } from '../utils/layout';
import { commas } from '../utils/math';
import { BUTTON } from '../utils/styles';

type Tab = 'party' | 'bag' | 'dex' | 'settings' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'party', label: 'Party' },
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
 * (useIdlePlayback): the player walking the area's track, its battles a turn every 3 s, the town waiting for the
 * player's choice (gym, store, on); the lab's and the town's questions, the notices and what happened while away in the
 * scene's text box (DialogueBox, the Battle Tower's and the Game Corner's). Under the scene, the party, bag, Pokédex,
 * settings and the run's log. A run never holds the Play tab (it runs on its own). Only in local debug for now (the
 * user's: a debug build with the debug tools on, useDebugStatus); anywhere else `/idle` goes back to the Play tab.
 */
export function IdlePage() {
  const debug = useDebugStatus();
  if (debug === 'loading') return <p className={`${PAGE_WIDTH} text-slate-400`}>Loading…</p>;
  if (debug === 'off') return <Navigate to="/" replace />;
  return <IdleAdventure />;
}

function IdleAdventure() {
  const overview = useIdleOverview();
  const actions = useIdleActions();
  const toasts = useToasts();
  const gender = useRun().overview.data?.playerGender === 'female' ? 'female' : 'male';
  const debugOn = useDebugEnabled();
  const debug = DEBUG_BUILD && debugOn;
  const soundtrack = useMusicSettings()?.soundtrack ?? 'remastered';
  const [tab, setTab] = useState<Tab>('party');
  const [store, setStore] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const data = overview.data;
  const run = data?.run ?? null;
  const active = run?.status === 'ACTIVE' ? run : null;
  const settings = data?.settings;
  const { play, summary, closeSummary, actOn, acted } = useIdlePlayback(active, name, (m) => toasts.push('error', m));
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
  const fight = play.battle ?? play.cue;
  useMusicCue(
    fight
      ? idleMusic(soundtrack, { battle: battleKind(fight.trainer), id: `${run?.id}:${fight.events.length}:${fight.foes.map((f) => f.species).join(',')}` })
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
      .then((r) => acted(r.run))
      .catch(failed);
  const start = (id: number, shiny = false) => actions.start(id, shiny).catch(failed);
  const v = run?.view;
  const over = run && run.status !== 'ACTIVE';

  return (
    <div className={`${PAGE_WIDTH} space-y-4`}>
      <PageHeader
        title="Idle Adventure"
        info={active && v ? `${v.areaName}${v.phase === 'grinding' ? ` (grinding to Lv. ${v.grindTarget})` : ''} · ${v.badges.length} badge${v.badges.length === 1 ? '' : 's'} · ₱${commas(v.money)}` : 'Walk Kanto from Pallet Town to the Indigo Plateau'}
        actions={
          active ? (
            <span className="flex items-center gap-2">
              {/* Grinding (the user's): back to the town's choice. */}
              {v?.phase === 'grinding' && (
                <button className={BUTTON} disabled={actions.busy} onClick={() => void act({ type: 'STOP_GRIND' })}>
                  Stop grinding
                </button>
              )}
              {
            confirmQuit ? (
              <span className="flex items-center gap-2 text-sm">
                Give up this run? Its ₱ go to the bank.
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
                {v.badges.length} badges, {v.totals.battles} battles, {v.totals.caught} Pokémon caught. Its ₱{commas(v.money)} went to the bank.
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
          <ReturnToHome />
        </div>
      ) : v?.phase === 'town' ? (
        <TownMenu
          run={active}
          gender={gender}
          busy={actions.busy}
          onGym={() => (setStore(false), void act({ type: 'GYM' }))}
          onGrind={() => (setStore(false), void act({ type: 'GRIND' }))}
          onStore={() => (setStore(true), void act({ type: 'VISIT_STORE' }))}
          onContinue={() => (setStore(false), void act({ type: 'CONTINUE' }))}
          dialogue={catchUp}
        />
      ) : play.battle ? (
        <BattleScreen battle={play.battle} shown={play.shown} gender={gender} dialogue={catchUp} />
      ) : (
        <AreaScene playback={play} gender={gender} dialogue={catchUp ?? (play.notice ? { text: play.notice, choices: [], instant: true, answer: () => {} } : null)}>
          {play.entering && <div className="pointer-events-none absolute inset-0 bg-white" style={{ animation: 'idle-enter 0.9s linear both' }} />}
        </AreaScene>
      )}

      {active && v?.phase === 'town' && store && <Store run={active} busy={actions.busy} onBuy={(item, count) => void act({ type: 'BUY', item, count })} />}

      {active && v && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-1 border-b border-slate-700">
            {TABS.map((t) => (
              <button key={t.id} className={`rounded-t px-3 py-1.5 text-sm ${tab === t.id ? 'bg-slate-700 font-semibold text-yellow-300' : 'text-slate-400 hover:text-slate-100'}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'party' && <PartyScreen party={v.party} bag={v.bag} busy={actions.busy} onAct={(a) => void act(a)} />}
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
