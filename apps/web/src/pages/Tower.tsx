import { battleMusic, towerMusic } from '@poke-tcg/campaign';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useContext, useEffect, useRef, useState } from 'react';
import { DeckSummary } from '../components/DeckList';
import { CatalogContext } from '../components/InspectContext';
import { useMusicCue, useMusicSettings } from '../components/MusicPlayer';
import { PageHeader } from '../components/PageHeader';
import { DeckMenu } from '../components/run/DeckMenu';
import { Toasts } from '../components/Toasts';
import { BpShop } from '../components/tower/BpShop';
import { VsBanner } from '../components/tower/VsBanner';
import { TowerScene, useScene } from '../components/tower/TowerScene';
import { afterBattleScript, lobbyScript, roomScript, type TowerContext } from '../components/tower/towerScripts';
import { useIsPhone } from '../hooks/useIsPhone';
import { useTRPC } from '../lib/trpc';
import { useRun } from '../hooks/useRun';
import { useToasts } from '../hooks/useToasts';
import { towerUnderway, useTowerActions, useTowerOverview, type ClientTower } from '../hooks/useTower';
import { DEBUG_BUILD, useDebugEnabled } from '../utils/debug';
import { PAGE_WIDTH } from '../utils/layout';
import { commas } from '../utils/math';

/** localStorage key: the last challenge result whose scene was played (`<id>:<version>`), so a reload doesn't play it again. */
const SEEN_KEY = 'poke-tcg.tower-seen';
const seenKey = (c: ClientTower) => `${c.id}:${c.version}`;
function wasSeen(c: ClientTower) {
  try {
    return localStorage.getItem(SEEN_KEY) === seenKey(c);
  } catch {
    return false;
  }
}
function markSeen(c: ClientTower) {
  try {
    localStorage.setItem(SEEN_KEY, seenKey(c));
  } catch {
    // Not remembered: a reload plays the scene again.
  }
}

/** Marks a challenge's state as played, and passes it on. */
const seen = (c: ClientTower) => (markSeen(c), c);

/** A deck as a list of card ids (a challenge's) as deck entries, for its summary. */
const entriesOf = (ids: string[]) => [...ids.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map<string, number>())].map(([cardId, quantity]) => ({ cardId, quantity }));

/**
 * The Battle Tower (`/tower`, from the Play tab's menu; README: Battle Tower): the tower's rooms as scenes (TowerScene,
 * the scripts in towerScripts.ts). Opened with no challenge under way, the player walks in to the lobby's desk, where the
 * receptionist takes a saved challenge up again or starts a new one (its floor, then its deck, picked under the scene);
 * then up to the floor and its battle. Back from a battle, its opponent says their line and leaves, and the attendant
 * asks whether to go on, save and quit, or concede. In the lobby, the BP Shop's vendor exchanges the Battle Points won for packs (BpShop). Under way, the Play tab stays here (usePlayRedirect); a battle under
 * way opens its game. Saved or over, Return to Home goes back to the Play tab's menu.
 */
export function TowerPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const overview = useTowerOverview();
  const actions = useTowerActions();
  const { overview: runOverview } = useRun();
  const scene = useScene();
  const toasts = useToasts();
  const phone = useIsPhone();
  const byId = useContext(CatalogContext);
  // The player's name on the VS banner: the account's chosen name (Settings).
  const trpc = useTRPC();
  const accountName = useQuery(trpc.community.accountName.queryOptions());
  const debugOn = useDebugEnabled();
  const debug = DEBUG_BUILD && debugOn;
  const soundtrack = useMusicSettings()?.soundtrack ?? 'remastered';
  const [music, setMusic] = useState<{ gen: number; place: 'lobby' | 'rooms' | 'battle'; gameId?: string } | null>(null);
  // A battle's music is the battle page's cue (battleMusic, as TowerBattleMusic plays it), so it doesn't start over there.
  useMusicCue(music && (music.place === 'battle' ? battleMusic(music.gen, soundtrack, 'battle', music.gameId!) : towerMusic(music.gen, soundtrack, music.place)));
  /** The deck picker under the scene, while the receptionist waits for a deck: the floor it's for, and its answer. */
  const [picking, setPicking] = useState<{ floor: number; done: (deckId: string | null) => void } | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  /** The lobby's BP Shop is open under the scene (while its vendor asks how he can help). */
  const [shop, setShop] = useState(false);
  const started = useRef(false);
  /** Bumped to start the scene again (after a move the server refused). */
  const [attempt, setAttempt] = useState(0);
  const data = overview.data;
  // The latest overview, for the scripts (the start floors grow as a challenge reaches checkpoints).
  const latest = useRef(data);
  latest.current = data;
  const challenge = data?.challenge ?? null;

  // Once, with the overview fetched since the page opened (back from a battle, its result is in it): the scene that fits.
  useEffect(() => {
    if (started.current || !overview.isFetchedAfterMount || !data || !runOverview.data) return;
    started.current = true;
    const c = data.challenge;
    if (c?.status === 'ACTIVE' && c.view.phase === 'battle' && c.gameId) {
      navigate({ to: '/game/$gameId', params: { gameId: c.gameId }, replace: true });
      return;
    }
    const ctx: TowerContext = {
      gender: runOverview.data.playerGender,
      get startFloors() {
        return latest.current?.startFloors ?? data.startFloors;
      },
      pickDeck: (floor) => new Promise((done) => setPicking({ floor, done: (id) => (setPicking(null), done(id)) })),
      // Every answer is a state whose scene has been played (a reload shows where it stands, not the last result again).
      start: (id, floor) => actions.start(id, floor).then(seen),
      act: (on, action) => actions.act(on, action).then(seen),
      skip: debug ? (on) => actions.skip(on) : null,
      openGame: (gameId) => navigate({ to: '/game/$gameId', params: { gameId } }),
      preloadGame: (gameId) => void router.preloadRoute({ to: '/game/$gameId', params: { gameId } }).catch(() => {}),
      finish: () => setFinished(true),
      shop: setShop,
      leave: () => navigate({ to: '/' }),
      music: (gen, place) => setMusic({ gen, place }),
      battleMusic: (gen, gameId) => setMusic({ gen, place: 'battle', gameId }),
      failed: (error) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.'),
    };
    // A move the server refused mid-scene: said, then the scene starts again from the overview.
    const onError = (error: unknown) => {
      toasts.push('error', ctx.failed(error));
      started.current = false;
      void overview.refetch().then(() => setAttempt((a) => a + 1));
    };
    const fresh = c && c.view.last && !wasSeen(c);
    if (fresh) markSeen(c);
    if (c && fresh && (c.status !== 'ACTIVE' || !c.view.saved)) scene.run((s) => afterBattleScript(s, ctx, c), onError);
    else if (c?.status === 'ACTIVE' && !c.view.saved) scene.run((s) => roomScript(s, ctx, c), onError);
    else scene.run((s) => lobbyScript(s, ctx, c?.status === 'ACTIVE' && c.view.saved ? c : null), onError);
    // Started once; the scripts read what they need as they go.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.isFetchedAfterMount, data, runOverview.data, attempt]);

  if (overview.error && !data) return <p className={`${PAGE_WIDTH} text-red-400`}>{overview.error.message}</p>;
  const decks = runOverview.data?.decks ?? [];
  const playable = decks.filter((d) => d.problems.length === 0);
  const chosen = playable.find((d) => d.id === deckId)?.id ?? playable.find((d) => d.id === runOverview.data?.lastDeckId)?.id ?? playable[0]?.id ?? null;
  const v = challenge?.view;
  const underway = towerUnderway(challenge);
  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      <PageHeader
        title="Battle Tower"
        info={data && data.best > 0 ? `Highest floor beaten: ${data.best}` : 'Win as many battles in a row as you can'}
      />
      <TowerScene scene={scene}>
        {/* The challenge under way, under the map (the user's): its floor, wins and BP, then the VS banner, its deck's tile
            against the opponent's (once they're in, from the challenge's `opponentDeck`), the next challenger unknown till then. */}
        {underway && v && byId && (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">
              Floor {v.floor} · {v.wins} {v.wins === 1 ? 'win' : 'wins'} · {commas(v.bp)} BP won
            </p>
            <VsBanner
              phone={phone}
              left={{ entries: entriesOf(v.deck), name: accountName.data ?? 'You', info: v.deckName }}
              right={
                challenge.opponentDeck && v.opponent
                  ? { entries: entriesOf(challenge.opponentDeck), name: `${v.opponent.trainerClass} ${v.opponent.name}`, info: challenge.opponentDeckName ? `${challenge.opponentDeckName} Deck` : undefined }
                  : null
              }
            />
          </div>
        )}
        {/* The lobby's BP Shop (the user's): Battle Points for packs, opened by its vendor (Exchange BP at the desk). */}
        {shop && <BpShop />}
        {/* The receptionist's question: a saved challenge's deck, shown to take it up again (and only then: the user's). */}
        {challenge?.status === 'ACTIVE' && v?.saved && !picking && !finished && scene.room?.points.desk && byId && (
          <section className="space-y-2 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
            <h3 className="text-sm text-slate-400">
              Your saved challenge's deck{v.deckName && <span className="text-slate-200">: {v.deckName}</span>} · floor {v.floor}
            </h3>
            <DeckSummary entries={entriesOf(v.deck)} compact={phone} />
          </section>
        )}
        {picking && byId && (
          <section className="space-y-3 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-600">
            <h3 className="text-lg font-semibold">Your deck for floor {picking.floor}</h3>
            <DeckMenu
              selected={chosen}
              onPick={(id) => id && setDeckId(id)}
              decks={decks.map((d) => ({ id: d.id, name: d.name, note: d.problems[0], entries: d.cards, disabled: d.problems.length > 0, locked: d.locked }))}
              compact={phone}
            />
            {playable.length === 0 && <p className="text-xs text-amber-300">None of your decks can be played yet: fix one on the Collection tab.</p>}
            <div className="flex flex-wrap gap-3">
              <button className="rounded bg-blue-600 px-5 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40" disabled={!chosen || actions.busy} onClick={() => chosen && picking.done(chosen)}>
                Begin the challenge
              </button>
              <button className="rounded bg-slate-600 px-4 py-2 text-sm transition hover:bg-slate-500" onClick={() => picking.done(null)}>
                Back
              </button>
            </div>
          </section>
        )}
      </TowerScene>
      <Toasts toasts={toasts.toasts} />
    </div>
  );
}
