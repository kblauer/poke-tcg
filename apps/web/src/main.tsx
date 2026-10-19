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
import { CardInspectProvider } from './components/CardInspectProvider';
import { MusicPlayer } from './components/MusicPlayer';
import { SidePanel } from './components/SidePanel';
import { useSession } from './lib/auth';
import { signInWithGoogle, signOut } from './lib/supabase';
import { queryClient, TRPCProvider, trpcClient } from './lib/trpc';
import { DecksPage } from './pages/Decks';
import { GamePage } from './pages/Game';
import { HomePage } from './pages/Home';
import { InventoryPage } from './pages/Inventory';
import { PacksPage } from './pages/Packs';
import { SingleBattlePage } from './pages/SingleBattle';

// Marks the dev server's tab so it isn't confused with the deployed app.
if (import.meta.env.DEV) document.title += ' - local';

// The router sets data-status="active" on the link for the current page.
const tab = 'rounded px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 data-[status=active]:bg-slate-800 data-[status=active]:text-slate-100';
const menuItem = 'rounded px-3 py-2 text-slate-300 hover:bg-slate-700 hover:text-slate-100 data-[status=active]:bg-slate-700 data-[status=active]:font-semibold data-[status=active]:text-yellow-300';

/** The site's pages, in the menu's order. */
const PAGES = [
  { to: '/', label: 'Play' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/packs', label: 'Packs' },
  { to: '/decks', label: 'Collection' },
  { to: '/battle', label: 'Single battle' },
] as const;

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
      <div className="flex items-center gap-6">
        {logo}
        <nav className="flex gap-1 text-sm">
          {PAGES.map((p) => (
            <Link key={p.to} to={p.to} className={tab} activeOptions={{ exact: p.to === '/' }}>
              {p.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="hidden text-slate-400 sm:inline">{session.user.email}</span>
        <button className="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </>
  );

  return (
    // Each page sets its own width and side padding. The header is one row when it fits the window; when it would
    // wrap, the pages go in a menu behind a ☰ button (the phone's battle screen covers the header).
    <div className="py-4">
      <header ref={header} className="relative mb-6 flex items-center justify-between gap-2 whitespace-nowrap px-4">
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
      {session && menu && !fits && (
        <SidePanel side="left" title="Poké TCG" onClose={() => setMenu(false)}>
          <nav className="flex flex-col gap-1">
            {PAGES.map((p) => (
              <Link key={p.to} to={p.to} className={menuItem} activeOptions={{ exact: p.to === '/' }} onClick={() => setMenu(false)}>
                {p.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-2 border-t border-slate-700 pt-3 text-sm">
            <p className="truncate text-slate-400">{session.user.email}</p>
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
          {/* Mounted with the layout, so the music plays on from page to page. */}
          <MusicPlayer />
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
const battleRoute = createRoute({ getParentRoute: () => rootRoute, path: '/battle', component: SingleBattlePage });
const inventoryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/inventory', component: InventoryPage });
const packsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/packs', component: PacksPage });

const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, battleRoute, gameRoute, decksRoute, inventoryRoute, packsRoute]) });

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
