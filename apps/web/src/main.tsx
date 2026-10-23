import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/holo/index.css';
import { AccountMenu } from './components/AccountMenu';
import { CardInspectProvider } from './components/CardInspectProvider';
import { MusicControls, MusicProvider } from './components/MusicPlayer';
import { NavLogProvider } from './components/NavLog';
import { NavRail } from './components/NavRail';
import { PageMenu } from './components/PageNav';
import { SidePanel } from './components/SidePanel';
import { useIsPhone } from './hooks/useIsPhone';
import { useSession } from './lib/auth';
import { signInWithGoogle, signOut } from './lib/supabase';
import { queryClient, TRPCProvider, trpcClient } from './lib/trpc';
import { CommunityPage } from './pages/Community';
import { CosmeticsPage } from './pages/Cosmetics';
import { DecksPage } from './pages/Decks';
import { GamePage } from './pages/Game';
import { HomePage } from './pages/Home';
import { InventoryPage } from './pages/Inventory';
import { PacksPage } from './pages/Packs';
import { SettingsPage } from './pages/Settings';
import { SingleBattlePage } from './pages/SingleBattle';

// Marks the dev server's tab so it isn't confused with the deployed app.
if (import.meta.env.DEV) document.title += ' - local';

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
    // The top bar across the window: the ☰ (the menu), the logo, the account and Sign out. Below it, on a big screen, the
    // menu down the left edge (NavRail) beside the page, the ☰ widening it with the pages' names; on a phone the ☰ opens the menu as a panel,
    // with the music player's bar (the phone's battle screen covers the top bar). Each page sets its own width and side
    // padding (PAGE_WIDTH).
    <div>
      <header
        className={`${phone ? '' : 'sticky top-0 z-[820]'} flex h-14 items-center justify-between gap-2 whitespace-nowrap border-b border-slate-800 bg-slate-900 px-2 shadow-md shadow-black/30 sm:px-3`}
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
          <Link to="/" className="text-xl font-bold text-yellow-300">
            Poké TCG
          </Link>
        </div>
        {session && (
          <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
            <AccountMenu email={session.user.email ?? ''} />
            {signOutButton}
          </div>
        )}
      </header>
      {session && phone && panel && (
        <SidePanel side="left" title="Poké TCG" onClose={closePanel}>
          <PageMenu onPick={closePanel} />
          <div className="mt-3 border-t border-slate-700 pt-3">
            <MusicControls onOpen={closePanel} />
          </div>
        </SidePanel>
      )}
      {session ? (
        <div className="flex">
          {!phone && <NavRail open={rail} />}
          {/* Its padding, not the layout's, so the menu beside it ends at the bottom of the window. */}
          <main className="min-w-0 flex-1 pb-4 pt-6">
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
  // log up to the site menu (NavLogProvider).
  return session ? (
    <MusicProvider docked={phone}>
      <NavLogProvider>{page}</NavLogProvider>
    </MusicProvider>
  ) : (
    page
  );
}

const rootRoute = createRootRoute({ component: RootLayout });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
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

const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, battleRoute, gameRoute, decksRoute, communityRoute, inventoryRoute, cosmeticsRoute, packsRoute, settingsRoute]) });

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
