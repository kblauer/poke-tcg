# Poké TCG

Monorepo for a single-player Pokémon TCG game: battle through the gym leaders of each Pokémon generation against CPU opponents. React SPA + Hono/tRPC API on Vercel, Supabase (Postgres, Auth), Prisma ORM.

**Current stage:** refining the card-playing mechanics. The home screen starts a test game (fixed test deck) against a dummy CPU that makes only forced moves and otherwise passes. Single-player structure, multiple saves per account and cross-run progression come later.

```
apps/
  web/                  Vite + React 19 SPA (TanStack Router/Query, tRPC client, Tailwind v4)
    src/
      main.tsx          Routes, root layout (header with Play / Cards tabs), providers
      pages/            Route-level pages: data loading only
      components/       Game UI components, one per file
      hooks/            React hooks: interaction state and handlers used by components
      utils/            Pure helper functions grouped by use (no React)
      lib/              tRPC client, Supabase client, session hook
  api/                  Hono + tRPC API (Supabase JWT auth, game endpoints)
    scripts/
      vercel-build.mjs  Bundles the API and web app into .vercel/output for Vercel
packages/
  game-engine/          Pure TS rules engine + CPU opponents – shared by client (UI hints) and server (authority)
  shared/               Zod schemas for API input, player ids
  db/                   Prisma 7 schema, client (pg driver adapter), migrations, seed
supabase/               Local Supabase config (CLI)
```

## Web app structure

Pages load data, set their own width and side padding, and hand data to components. Components render. Hooks hold interaction state and behaviour. Utils are plain functions with no React, so the play rules for the UI can be read (and tested) on their own. Every move is still validated by the server.

### `src/pages/`

| File | Description |
|---|---|
| `Home.tsx` | Home screen with the "Start test game" button |
| `Game.tsx` | Loads the game view, sends moves to the API (one at a time) and renders `<Board>` |
| `Cards.tsx` | Card browser (`/cards`): loads the catalog once (`cards.list`), holds the filters, sort and selected card, and lays out the grid on the left and the viewer on the right |

### `src/components/`

| File | Description |
|---|---|
| `Board.tsx` | The game table. Gets card play from `useCardPlay`, holds the hover preview, and lays out the components below |
| `StatusBar.tsx` | Status text, hint, and the End turn / Concede buttons |
| `OpponentArea.tsx` | The CPU's bench, active and hand/deck/prize counts |
| `AttackList.tsx` | Attack buttons beside your active Pokémon; attacks you can't pay for are disabled |
| `Hand.tsx` | Your hand |
| `HandCard.tsx` | One draggable, clickable card in your hand |
| `Slot.tsx` | An active or bench slot: drop target, highlight ring, tint band and "Play"/"Attach"/"Evolve"/"Promote" label |
| `Card.tsx` | Card art with damage and attached-energy overlays; opens the hover preview |
| `CardPreview.tsx` | The large card preview that follows the cursor and resizes with the mouse wheel |
| `PreviewContext.ts` | Context that lets any card show or hide the hover preview |
| `CardFilters.tsx` | Card browser controls: name search, type and stage filters, max-attack range, sort field and direction, match count |
| `CardGrid.tsx` | Scrollable grid of low-res card images; the number of columns follows the width. Rows overlap so only each card's top strip (its name, set by the `gap-y-6` row gap) shows; hovering a strip brings that card to the front, clicking selects it |
| `CardViewer.tsx` | The selected card's high-res image (low-res shown while it loads), sized to the window, with set, rarity, stage, type, HP and max attack |

### `src/hooks/`

| File | Description |
|---|---|
| `useCardPlay.ts` | Playing cards from the hand by click (select, then click a highlighted slot; Esc cancels) or drag and drop. Tracks the selected and dragged card and the "can't play" hint, and returns the highlighted slots, their label, click handlers and the `DndContext` props |

### `src/utils/`

| File | Description |
|---|---|
| `targets.ts` | Where a hand card can be played, why it can't, which action playing it sends, and its target label |
| `slots.ts` | Slot ids (`active`, `bench-N`), converting them to engine targets, empty/occupied slots, and which slot an in-flight move is about |
| `turn.ts` | Whose turn it is, whether you must promote, and the status headline |
| `preview.ts` | Preview size limits, wheel zoom, saving the size in localStorage, and positioning next to the cursor |
| `cardColors.ts` | Background colour for each card type |
| `cardList.ts` | Card browser data: the `CatalogCard` type, type/stage/sort options, and the filter and sort functions |

### `src/lib/`

| File | Description |
|---|---|
| `trpc.ts` | Query client and typed tRPC client for the API |
| `supabase.ts` | Supabase client and Google sign-in/sign-out |
| `auth.ts` | `useSession` hook for the current Supabase session |

## How a move works

1. Client sends `game.act({ gameId, expectedVersion, action })`.
2. API validates the input with Zod, loads the game state, and runs `applyAction` from `@poke-tcg/game-engine`.
3. If the move is legal, the API runs the CPU (`runCpu`) until it's the player's move again.
4. If `expectedVersion` still matches, the API writes the new state and every action (player and CPU) to the `GameAction` log in one transaction.
5. The response is the player's `getPlayerView`. Raw state, which includes the CPU's hand, deck order and RNG, never leaves the server.

## Setup

Requires Node 24+, pnpm, and Docker if you want local Supabase.

```sh
pnpm install
cp .env.example .env        # fill in values (see below)
pnpm db:migrate             # create tables (prompts for a migration name)
pnpm db:seed                # load the WOTC card catalog (1999–2003) from the TCGdex snapshot
pnpm dev                    # web on :5173 and API on :8787, both with live reload
```

### Option A – hosted Supabase project

1. Copy the pooled (6543) and direct (5432) connection strings into `DATABASE_URL` and `DIRECT_URL`. They're under **Project Settings → Database**.
2. Copy the project URL and anon key into `SUPABASE_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Enable the Google provider under **Authentication → Providers**.
4. Under **Authentication → URL Configuration**, add `http://localhost:5173` and your Vercel URL to the redirect URLs.

### Option B – local Supabase (Docker)

```sh
pnpm supabase:start         # prints the local URLs and keys
```

Use the printed DB URL for both `DATABASE_URL` and `DIRECT_URL`, `http://127.0.0.1:54321` as the Supabase URL, and the printed anon key. If the local project signs tokens with HS256, also set `SUPABASE_JWT_SECRET`.

### Google OAuth

1. In Google Cloud Console, create an OAuth client ID of type *Web application*.
2. Add this authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. For local Supabase use `http://127.0.0.1:54321/auth/v1/callback`.
3. Paste the client ID and secret into the Supabase dashboard. For local Supabase, set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in `.env`.

## Deploying to Vercel

1. Import the repo into Vercel and leave the **Root Directory** as the repo root. `vercel.json` sets the build command, which writes `.vercel/output` (Build Output API): the web app as static files and the API bundled into one function serving `/api/*`.
2. Add the variables from `.env.example` in the Vercel project settings. Use the **pooled** `DATABASE_URL`.
3. Run migrations against production from your machine or CI with `pnpm --filter @poke-tcg/db migrate:deploy`. They don't run during the Vercel build, so preview deploys can't touch the production schema.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run all apps with live reload |
| `pnpm build` | Build everything |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm test` | Run Vitest suites (game engine) |
| `pnpm db:migrate` / `db:studio` / `db:seed` | Prisma migrate dev / Studio / seed |
| `pnpm cards:fetch` | Re-download the WOTC card snapshot from TCGdex (`packages/db/prisma/data/tcgdex-wotc.json`) |

## Next steps

- Drive the engine from the imported `Card` catalog instead of the placeholder definitions in `game-engine/src/cards.ts`.
- Evolutions, trainers, retreat, weakness/resistance and special conditions in the engine.
- Deck builder backed by `Deck` and `DeckCard`.
- A CPU that actually plays (the `decide` function passed to `runCpu`).
- Single-player structure: gym leader battles per generation, multiple saves per account, persistent progression across runs.
