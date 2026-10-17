import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/holo/index.css';
import { useSession } from './lib/auth';
import { signInWithGoogle, signOut } from './lib/supabase';
import { queryClient, TRPCProvider, trpcClient } from './lib/trpc';
import { CardsPage } from './pages/Cards';
import { DecksPage } from './pages/Decks';
import { GamePage } from './pages/Game';
import { HomePage } from './pages/Home';
import { InventoryPage } from './pages/Inventory';

// Marks the dev server's tab so it isn't confused with the deployed app.
if (import.meta.env.DEV) document.title += ' - local';

// The router sets data-status="active" on the link for the current page.
const tab = 'rounded px-3 py-1 max-sm:px-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 data-[status=active]:bg-slate-800 data-[status=active]:text-slate-100';

function RootLayout() {
  const session = useSession();
  if (session === undefined) return null;

  return (
    // Each page sets its own width and side padding.
    <div className="py-4">
      {/* On a phone the title is smaller and the email is left out, so it all fits on one line. */}
      <header className="mb-6 flex items-center justify-between gap-2 px-4">
        <div className="flex items-center gap-6 max-sm:gap-2">
          <Link to="/" className="whitespace-nowrap text-xl font-bold text-yellow-300 max-sm:text-lg">
            Poké TCG
          </Link>
          {session && (
            <nav className="flex gap-1 text-sm">
              <Link to="/" className={tab} activeOptions={{ exact: true }}>
                Play
              </Link>
              <Link to="/inventory" className={tab}>
                Inventory
              </Link>
              <Link to="/cards" className={tab}>
                Cards
              </Link>
              <Link to="/decks" className={tab}>
                Decks
              </Link>
            </nav>
          )}
        </div>
        {session && (
          <div className="flex items-center gap-3 text-sm">
            <span className="truncate text-slate-400 max-md:hidden">{session.user.email}</span>
            <button className="whitespace-nowrap rounded bg-slate-800 px-3 py-1 hover:bg-slate-700 max-sm:px-2" onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        )}
      </header>
      {session ? (
        <Outlet />
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
const cardsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/cards', component: CardsPage });
const decksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/decks', component: DecksPage });
const inventoryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/inventory', component: InventoryPage });

const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, gameRoute, cardsRoute, decksRoute, inventoryRoute]) });

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
