# Poké TCG

Monorepo for a single-player Pokémon TCG game: battle through the gym leaders of each Pokémon generation against CPU opponents. React SPA + Hono/tRPC API on Vercel, Supabase (Postgres, Auth), Prisma ORM.

**Current stage:** refining the card-playing mechanics. The home screen starts a test game (fixed Base Set test decks) against a simple CPU that benches its Basics, evolves when it can and attaches energy to Pokémon of the same type, but never attacks or retreats. Single-player structure, multiple saves per account and cross-run progression come later.

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
      styles/holo/      Holo card effect styles (one file per card style) plus WOTC tuning
    public/img/         Textures used by the holo styles
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
| `AttackList.tsx` | Attack buttons beside your active Pokémon, with damage after the defender's weakness and resistance (variable damage like "30+" is shown as printed); attacks it can't use are disabled with the reason as a tooltip |
| `AttackChoicePanel.tsx` | Asks the current question of an attack being used: energy to discard, an opponent's benched Pokémon, a defender's energy or attack, or a type |
| `PrizeCards.tsx` | Prize cards face down in 2 columns of 3 with overlapping rows (like the card list), left of your play area and right of the CPU's |
| `DeckAndDiscard.tsx` | A player's deck (face down) and discard pile (top card face up) with counts, in a column beside each play area (discard above deck on your right; mirrored both ways on the CPU's left) |
| `CardBack.tsx` | A face-down card |
| `CoinFlip.tsx` | Animated coin under the game log for each coin flip in a move's result, one after another |
| `GameLog.tsx` | The game log (attacks, coin flips, Special Conditions, knockouts), beside the table on large screens |
| `RetreatPanel.tsx` | Retreat button under the attacks; while retreating, picks which energy to discard (when it matters) and prompts for a benched Pokémon |
| `Hand.tsx` | Your hand |
| `HandCard.tsx` | One draggable, clickable card in your hand |
| `Slot.tsx` | An active or bench slot: drop target, highlight ring, tint band and "Play"/"Attach"/"Evolve"/"Promote" label |
| `Card.tsx` | Card art with damage, attached-energy, Special Condition and protection overlays; opens the hover preview |
| `CardPreview.tsx` | The large card preview that follows the cursor and resizes with the mouse wheel |
| `PreviewContext.ts` | Context that lets any card show or hide the hover preview |
| `HoloCard.tsx` | A card with the holo effect: tilts toward the pointer while shine and glare layers follow it. Used by `CardViewer` in the Cards tab only; play mode shows plain card images |
| `CardFilters.tsx` | Card browser controls: name search, set, type and stage filters, max-attack range, sort field and direction, match count |
| `CardGrid.tsx` | Scrollable grid of low-res card images; the number of columns follows the width. Rows overlap so only each card's top strip (its name, set by the `gap-y-6` row gap) shows; hovering a strip brings that card to the front, clicking selects it |
| `CardViewer.tsx` | The selected card's high-res image (low-res shown while it loads), sized to the window, with set, rarity, stage, type, HP and max attack |

### `src/hooks/`

| File | Description |
|---|---|
| `useCardPlay.ts` | Playing cards from the hand by click (select, then click a highlighted slot; Esc cancels) or drag and drop. Tracks the selected and dragged card and the "can't play" hint, and returns the highlighted slots, their label, click handlers and the `DndContext` props |
| `useAttack.ts` | Using an attack: attacks straight away or asks its questions one at a time (via the engine's `nextAttackChoice`), and says why an attack can't be used (Esc cancels) |
| `useRetreat.ts` | Retreating the active: tracks the chosen energy, says why retreat is blocked, and returns the bench slots to switch in and their click handlers (Esc cancels) |

### `src/utils/`

| File | Description |
|---|---|
| `targets.ts` | Where a hand card can be played, why it can't, which action playing it sends, and its target label |
| `slots.ts` | Slot ids (`active`, `bench-N`), converting them to engine targets, empty/occupied slots, and which slot an in-flight move is about |
| `turn.ts` | Whose turn it is, whether you must promote, and the status headline |
| `preview.ts` | Preview size limits, wheel zoom, saving the size in localStorage, and positioning next to the cursor |
| `layout.ts` | Shared widths: the side columns (prizes, deck and discard), so both active slots line up, and small cards (bench and prizes) |
| `cardBack.ts` | URL of the card back image |
| `cardColors.ts` | Background colour for each card type |
| `holo.ts` | Maps catalog and engine cards to the attributes the holo styles select on (rarity, supertype, subtypes, era) |
| `spring.ts` | Spring physics for the holo effect's tilt and glare |
| `math.ts` | `round`, `clamp` and `adjust` (re-map a value between ranges) |
| `cardList.ts` | Card browser data: the `CatalogCard` type, set/type/stage/sort options, and the filter and sort functions |

### `src/styles/holo/`

Holo card effect: layered gradients, blend modes and textures moved by CSS variables that `HoloCard` sets from the pointer position. Each file styles one card type, selected by the card's `data-rarity`, `data-subtypes` and `data-supertype` attributes.

| File | Description |
|---|---|
| `index.css` | Imports everything in cascade order and sets the variables' resting values. Imported by `main.tsx` |
| `base.css` | Card structure (3D tilt, front/back, shine and glare layers) and the default glare every card gets |
| `cards.css` | Shared variables: textures, colours and art-window clip shapes measured on modern cards |
| `cards/*.css` | One style per rarity: `regular-holo.css` is the WOTC-era holo and `cosmos-holo.css` the galaxy foil; the others (reverse holo, V, VMAX, rainbow, secret, gallery…) are for later eras |
| `wotc.css` | WOTC tuning: card aspect ratio and art-window clip shapes re-measured on TCGdex scans for the classic (Base–Neo), Trainer and e-Card layouts, separate stage-badge shapes for Neo, and the galaxy-foil shape around the art; holo Energy is foil across the whole card; glare at half strength |

Holo cards are those with `variants.holo` in their TCGdex data (the rarity alone doesn't say: Base Set holos are listed as "Rare"). The API passes it on as `holo` in `cards.list` and in the engine's card definitions. Galaxy-foil cards (the Entei and Pichu promos and the Southern Islands set) have no TCGdex flag, so `isGalaxyFoil` in `apps/api/src/cards.ts` lists them; `cards.list` returns it as `galaxy`.

### `src/lib/`

| File | Description |
|---|---|
| `trpc.ts` | Query client and typed tRPC client for the API |
| `supabase.ts` | Supabase client and Google sign-in/sign-out |
| `auth.ts` | `useSession` hook for the current Supabase session |

## Game engine (`packages/game-engine/src/`)

| File | Purpose |
| --- | --- |
| `engine.ts` | State types and the `applyAction` reducer: setup, playing cards, retreat, turn flow (Pokémon Checkup between turns, knockouts, prizes, promotions) |
| `attacks.ts` | Attack resolution: legality (`attackError`), the questions an attack asks (`nextAttackChoice`), weakness/resistance and prevention, and the context card effects run with |
| `effects/` | Card-specific attack effects by card id and attack name (`base1.ts` for the Base Set), built from shared pieces in `common.ts` |
| `status.ts` | Game log, coin flips and clearing conditions when a Pokémon leaves the active spot |
| `view.ts` | `getPlayerView`: what one player may see |
| `cpu.ts` | The CPU opponent |

Rules follow the 1999 Base Set rulebook. Special Conditions: Asleep (flip between turns to wake), Confused (flip to attack, tails = 20 damage to itself; flip to retreat), Paralyzed (until after its owner's next turn), Poisoned (10 between turns, 20 from Toxic). The checkup between turns handles them in order for both actives: Poisoned, Burned (not in the Base Set, not implemented yet), Asleep, Paralyzed. Where TCGdex's attack text differs from the printed card, the effect carries the printed wording and the API shows that instead.

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

- Pokémon Powers (Base Set: Damage Swap, Rain Dance, Energy Burn, Strikes Back, Energy Trans, Buzzap), Trainers, and attack effects for sets after the Base Set.
- Ask the player to choose when an opponent's attack makes them pick (Whirlwind currently brings in their first benched Pokémon).
- Deck builder backed by `Deck` and `DeckCard`.
- A CPU that attacks and plays strategically (the `decide` function passed to `runCpu`).
- Single-player structure: gym leader battles per generation, multiple saves per account, persistent progression across runs.
