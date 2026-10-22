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
import { StrictMode, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/holo/index.css';
import { AccountMenu } from './components/AccountMenu';
import { CardInspectProvider } from './components/CardInspectProvider';
import { MusicControls, MusicProvider } from './components/MusicPlayer';
import { PAGES, PageMenu } from './components/PageNav';
import { SidePanel } from './components/SidePanel';
import { useSession } from './lib/auth';
import { signInWithGoogle, signOut } from './lib/supabase';
import { queryClient, TRPCProvider, trpcClient } from './lib/trpc';
import { PAGE_WIDTH } from './utils/layout';
import { CommunityPage } from './pages/Community';
import { DecksPage } from './pages/Decks';
import { GamePage } from './pages/Game';
import { HomePage } from './pages/Home';
import { InventoryPage } from './pages/Inventory';
import { PacksPage } from './pages/Packs';
import { SingleBattlePage } from './pages/SingleBattle';

// Marks the dev server's tab so it isn't confused with the deployed app.
if (import.meta.env.DEV) document.title += ' - local';

// The router sets data-status="active" on the link for the current page: each tab is its own button (icon and label),
// the current page's lit in the logo's yellow.
const tab =
  'flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 font-medium text-slate-300 shadow-sm shadow-black/40 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:text-white hover:ring-slate-500 active:scale-95 data-[status=active]:bg-yellow-400/15 data-[status=active]:text-yellow-200 data-[status=active]:ring-yellow-400/60';

function RootLayout() {
  const session = useSession();
  /** The menu (the ☰ button's panel) is open. */
  const [menu, setMenu] = useState(false);
  /** The header in one row (the logo, the tabs, the account) fits the window; otherwise the pages are in the ☰ menu. */
  const [fits, setFits] = useState(true);
  const header = useRef<HTMLElement>(null);
  /** An invisible copy of the one-row header, to measure. */
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!header.current || !row.current) return;
    const h = header.current;
    const r = row.current;
    const check = () => {
      const style = getComputedStyle(h);
      setFits(r.offsetWidth <= h.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    check();
    // The window's width, and the copy's (once the fonts load).
    const observer = new ResizeObserver(check);
    observer.observe(h);
    observer.observe(r);
    return () => observer.disconnect();
  }, [session]);
  if (session === undefined) return null;

  const logo = (
    <Link to="/" className="text-xl font-bold text-yellow-300">
      Poké TCG
    </Link>
  );
  // The original header: the logo and the tabs on the left, the account on the right.
  const oneRow = session && (
    <>
      {logo}
      {/* The tabs' tray stretches from the logo to the account, the tabs centred in it. */}
      <nav className="mx-6 flex flex-1 justify-center gap-2 rounded-lg bg-slate-800/70 p-1 text-sm ring-1 ring-slate-700/70">
        {PAGES.map((p) => (
          <Link key={p.to} to={p.to} className={tab} activeOptions={{ exact: p.to === '/' }}>
            <p.Icon sx={{ fontSize: 18 }} />
            {p.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3 text-sm">
        <AccountMenu email={session.user.email ?? ''} />
        <button className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-800 hover:text-slate-100" onClick={() => signOut()}>
          <LogoutIcon sx={{ fontSize: 16 }} />
          Sign out
        </button>
      </div>
    </>
  );

  const page = (
    // Each page sets its own width and side padding. The header is one row when it fits the window; when it would
    // wrap, the pages go in a menu behind a ☰ button (the phone's battle screen covers the header), with the music
    // player's bar. The header is a bar across the window, its contents within the pages' side margins (PAGE_WIDTH), so
    // the logo lines up with the panels below.
    <div className="pb-4">
      <div className="mb-6 border-b border-slate-800 bg-slate-900/80 shadow-md shadow-black/30">
        <header ref={header} className={`relative flex min-h-14 items-center justify-between gap-2 whitespace-nowrap py-2 ${PAGE_WIDTH}`}>
          {session && (
            // Clipped to nothing, so it never widens the page on a narrow screen.
            <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
              <div ref={row} className="flex w-max items-center gap-6">
                {oneRow}
              </div>
            </div>
          )}
          {!session ? (
            logo
          ) : fits ? (
            oneRow
          ) : (
            <div className="flex items-center gap-2">
              <button className="flex rounded p-1 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100" onClick={() => setMenu(true)} aria-label="Menu" title="Menu">
                <MenuIcon />
              </button>
              {logo}
            </div>
          )}
        </header>
      </div>
      {session && menu && !fits && (
        <SidePanel side="left" title="Poké TCG" onClose={() => setMenu(false)}>
          <PageMenu onPick={() => setMenu(false)} />
          <div className="mt-auto space-y-2 border-t border-slate-700 pt-3 text-sm">
            <MusicControls onOpen={() => setMenu(false)} />
            <AccountMenu email={session.user.email ?? ''} inline />
            <button className="flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600" onClick={() => signOut()}>
              <LogoutIcon sx={{ fontSize: 16 }} />
              Sign out
            </button>
          </div>
        </SidePanel>
      )}
      {session ? (
        <CardInspectProvider>
          <Outlet />
        </CardInspectProvider>
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
  // Mounted with the layout, so the music plays on from page to page; in the ☰ menu when there is one.
  return session ? <MusicProvider docked={!fits}>{page}</MusicProvider> : page;
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

const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, battleRoute, gameRoute, decksRoute, communityRoute, inventoryRoute, packsRoute]) });

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
