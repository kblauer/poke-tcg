import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router';
import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
// Puts the saved colour theme on before the first render.
import './hooks/useColorTheme';
import './hooks/useFontStyle';
import { AccountSettingsSync } from './components/AccountSettingsSync';
import { CardInspectProvider } from './components/CardInspectProvider';
import { MusicControls, MusicProvider } from './components/MusicPlayer';
import { NavLogProvider } from './components/NavLog';
import { RunProvider } from './hooks/useRun';
import { BattleTransitionProvider } from './components/BattleTransition';
import { NavRail, PhoneNavRun } from './components/NavRail';
import { PageMenu } from './components/PageNav';
import { TopBarAccount, TopBarStats } from './components/TopBarStats';
import { SidePanel } from './components/SidePanel';
import { useIsPhone } from './hooks/useIsPhone';
import { useSession } from './lib/auth';
import { signInWithGoogle, signOut } from './lib/supabase';
import { queryClient, TRPCProvider, trpcClient } from './lib/trpc';

// Marks the dev server's tab so it isn't confused with the deployed app.
if (import.meta.env.DEV) document.title += ' - local';

// Each page is its own chunk, fetched when it's first opened (the battle screen's brings the rules engine with it; the
// others don't need it), so the first load is the layout alone.
const PlayPage = lazyRouteComponent(() => import('./pages/Play'), 'PlayPage');
const HomePage = lazyRouteComponent(() => import('./pages/Home'), 'HomePage');
const TowerPage = lazyRouteComponent(() => import('./pages/Tower'), 'TowerPage');
const IdlePage = lazyRouteComponent(() => import('./pages/Idle'), 'IdlePage');
const GamePage = lazyRouteComponent(() => import('./pages/Game'), 'GamePage');
const DecksPage = lazyRouteComponent(() => import('./pages/Decks'), 'DecksPage');
const CommunityPage = lazyRouteComponent(() => import('./pages/Community'), 'CommunityPage');
const SingleBattlePage = lazyRouteComponent(() => import('./pages/SingleBattle'), 'SingleBattlePage');
const InventoryPage = lazyRouteComponent(() => import('./pages/Inventory'), 'InventoryPage');
const PacksPage = lazyRouteComponent(() => import('./pages/Packs'), 'PacksPage');
const CosmeticsPage = lazyRouteComponent(() => import('./pages/Cosmetics'), 'CosmeticsPage');
const SettingsPage = lazyRouteComponent(() => import('./pages/Settings'), 'SettingsPage');
const ExtrasPage = lazyRouteComponent(() => import('./pages/Extras'), 'ExtrasPage');
const BerryFarmPage = lazyRouteComponent(() => import('./pages/Extras'), 'BerryFarmPage');
const BerryBlenderPage = lazyRouteComponent(() => import('./pages/Extras'), 'BerryBlenderPage');
const PoffinCookingPage = lazyRouteComponent(() => import('./pages/Extras'), 'PoffinCookingPage');
const GameCornerPage = lazyRouteComponent(() => import('./pages/Extras'), 'GameCornerPage');
const VoltorbFlipPage = lazyRouteComponent(() => import('./pages/Extras'), 'VoltorbFlipPage');
const WhosThatPage = lazyRouteComponent(() => import('./pages/Extras'), 'WhosThatPage');

// The logo, in the top bar and the phone's menu: the Pokémon logo's lettering (Pokemon Solid, `font-logo`); everything
// else is in the UI's font (index.css).
const LOGO = 'font-logo text-2xl font-normal leading-none tracking-wide text-yellow-300';

const RAIL_KEY = 'poke-tcg.nav-open';

/** Whether the big screen's menu was left open (`RAIL_KEY`), remembered in the browser; closed when storage fails. */
function loadRail(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === 'true';
  } catch {
    return false;
  }
}

function RootLayout() {
  const session = useSession();
  const phone = useIsPhone();
  // A battle: on a phone its screen covers the top bar, which mustn't stick over it.
  const inBattle = useRouterState({ select: (s) => s.location.pathname.startsWith('/game/') });
  /** The big screen's menu shows the pages' names (NavRail's `open`); remembered. */
  const [rail, setRail] = useState(loadRail);
  /** The phone's ☰ panel is open. */
  const [panel, setPanel] = useState(false);
  const closePanel = useCallback(() => setPanel(false), []);
  if (session === undefined) return null;
  const menu = phone ? panel : rail;
  const toggleMenu = () => {
    if (phone) return setPanel((o) => !o);
    setRail(!rail);
    try {
      localStorage.setItem(RAIL_KEY, String(!rail));
    } catch {
      // Not remembered; it still applies until the page is reloaded.
    }
  };

  const signOutButton = (
    <button
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800 hover:text-slate-100 sm:px-3"
      onClick={() => signOut()}
      title="Sign out"
      aria-label="Sign out"
    >
      <LogoutIcon sx={{ fontSize: 16 }} />
      <span className="hidden sm:inline">Sign out</span>
    </button>
  );

  const page = (
    // The top bar across the window: the ☰ (the menu), the logo, and Sign out (on a big screen the bank, EXP, Stardust and the music player's bar before it, on a phone the run's and account's figures). Below it, on a big screen, the
    // menu down the left edge (NavRail) beside the page, the ☰ widening it with the pages' names; on a phone the ☰ opens the menu as a panel,
    // with the music player's bar (the phone's battle screen covers the top bar). Each page sets its own width and side
    // padding (PAGE_WIDTH).
    <div>
      <header
        data-top-bar
        className={`${phone && inBattle ? '' : 'sticky top-0 z-[820]'} flex h-14 items-center justify-between gap-2 whitespace-nowrap border-b border-slate-800 bg-slate-900 px-2 shadow-md shadow-black/30 sm:px-3`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {session && (
            <button
              className={`flex rounded-md p-1.5 transition hover:bg-slate-800 hover:text-slate-100 ${menu ? 'bg-slate-800 text-yellow-200' : 'text-slate-300'}`}
              onClick={toggleMenu}
              aria-label="Menu"
              aria-expanded={menu}
              title="Menu"
            >
              <MenuIcon />
            </button>
          )}
          <Link to="/" className={`${LOGO} ml-2 sm:ml-3`}>
            PoKé TcG
          </Link>
        </div>
        {/* On a phone, the run's HP and ₱, the bank and Stardust, centred between the logo and Sign out. */}
        {session && phone && (
          <div className="flex min-w-0 flex-1 justify-center">
            <TopBarStats />
          </div>
        )}
        {/* On a big screen the bank, EXP and Stardust, then the music player's bar, at the right end before Sign out (the user's); on a phone the music is in the ☰ panel. */}
        {session && (
          <div className="flex min-w-0 items-center gap-3 text-sm">
            {!phone && <TopBarAccount />}
            {!phone && <MusicControls />}
            <span className="shrink-0">{signOutButton}</span>
          </div>
        )}
      </header>
      {session && phone && panel && (
        <SidePanel side="left" title={<span className={LOGO}>PoKé TcG</span>} onClose={closePanel}>
          <PageMenu onPick={closePanel} />
          {/* During a run, its numbers and log, as in the big screen's menu. */}
          <PhoneNavRun />
          <div className="mt-3 shrink-0 border-t border-slate-700 pt-3">
            <MusicControls onOpen={closePanel} />
          </div>
        </SidePanel>
      )}
      {session ? (
        <div className="flex">
          {!phone && <NavRail open={rail} />}
          {/* Its padding, not the layout's, so the menu beside it ends at the bottom of the window. The battle transitions cover it (`data-battle-area`), below the top bar. */}
          <main className="min-w-0 flex-1 pb-4 pt-6" data-battle-area>
            <CardInspectProvider>
              <Outlet />
            </CardInspectProvider>
          </main>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-24">
          <p className="text-slate-400">Sign in to play.</p>
          <button
            className="rounded bg-white px-4 py-2 font-medium text-slate-900 hover:bg-slate-200"
            onClick={() => signInWithGoogle()}
          >
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
  // Mounted with the layout, so the music plays on from page to page; in the ☰ panel on a phone. The game page passes its
  // log up to the site menu (NavLogProvider). The Settings page's choices follow the account (AccountSettingsSync).
  return session ? (
    <MusicProvider docked={phone}>
      <AccountSettingsSync />
      <NavLogProvider>
        <BattleTransitionProvider>
          <RunProvider>{page}</RunProvider>
        </BattleTransitionProvider>
      </NavLogProvider>
    </MusicProvider>
  ) : (
    page
  );
}

const rootRoute = createRootRoute({ component: RootLayout });
// The Play tab: its menu of modes (`/`), the Badge Challenge (the runs), the Battle Tower, the Idle Adventure (`/idle`) and Training (`/battle`).
const playRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: PlayPage });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/badge', component: HomePage });
const towerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tower', component: TowerPage });
const idleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/idle', component: IdlePage });
const gameRoute = createRoute({ getParentRoute: () => rootRoute, path: '/game/$gameId', component: GamePage });
// `?deck=<id>` opens that deck, `?deck=new` a new one (the Single battle tab's links).
const decksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/decks',
  component: DecksPage,
  validateSearch: (search: Record<string, unknown>): { deck?: string } => (typeof search.deck === 'string' ? { deck: search.deck } : {}),
});
const communityRoute = createRoute({ getParentRoute: () => rootRoute, path: '/community', component: CommunityPage });
const battleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/battle', component: SingleBattlePage });
const inventoryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/inventory', component: InventoryPage });
const packsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/packs', component: PacksPage });
const cosmeticsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/cosmetics', component: CosmeticsPage });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage });
const extrasRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extras', component: ExtrasPage });
const berryFarmRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extras/berry-farm', component: BerryFarmPage });
const berryBlenderRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extras/berry-blender', component: BerryBlenderPage });
const poffinCookingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extras/poffin-cooking', component: PoffinCookingPage });
const gameCornerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extras/game-corner', component: GameCornerPage });
const voltorbFlipRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extras/voltorb-flip', component: VoltorbFlipPage });
const whosThatRoute = createRoute({ getParentRoute: () => rootRoute, path: '/extras/whos-that', component: WhosThatPage });

const router = createRouter({
  routeTree: rootRoute.addChildren([playRoute, homeRoute, towerRoute, idleRoute, battleRoute, gameRoute, decksRoute, communityRoute, inventoryRoute, cosmeticsRoute, packsRoute, settingsRoute, extrasRoute, berryFarmRoute, berryBlenderRoute, poffinCookingRoute, gameCornerRoute, voltorbFlipRoute, whosThatRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  </StrictMode>,
);
