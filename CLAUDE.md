# poke-tcg — notes for Claude

## Product direction
- Single-player game: the player battles a generation's gym leaders against CPU opponents. Not PvP. Don't add lobbies, multiplayer or realtime features.
- Roadmap order: (1) refine card-playing mechanics → (2) gym-leader campaign structure → (3) multiple saves per account → (4) progression across runs through different generations. Currently on step (2), the run loop (since 2026-10-17). Stay on the current step unless asked.
- Card pool: WOTC era (1999–2003) and Generation 3's EX series, EX Ruby & Sapphire to EX Power Keepers (2003–2007, agreed 2026-10-20), from TCGdex. Cards with no image are excluded. Cards TCGdex lacks can be added by hand in `packages/db/prisma/data/custom-cards.json` (only with the user's say-so), with images in `apps/web/public/cards/<id>/`.
- If you're unsure what a card does or how its rules should work, stop and ask. Don't guess at card effects.
- Feature notes (each agreed with the user and binding) live in `docs/claude/`. Before working on one of these, read its file:
  - Battle Tower: `docs/claude/battle-tower.md`
  - Idle Adventure (`packages/idle`, `/idle`): `docs/claude/idle-adventure.md`
  - Card flair (Stardust looks, borders, effects): `docs/claude/card-flair.md`
  - Gen 4 and HGSS sets (DP, Platinum, HGSS; LEGEND, LV.X, Heal Block): `docs/claude/gen4.md`
  - Extras (Berry Farm, Blender, Game Corner, Poffins, Voltorb Flip) and Who's That Pokémon?: `docs/claude/extras.md`
  - Runs, routes, maps, bosses, unlocks, packs, cosmetics: `docs/claude/runs.md`
  - Any rules-engine or CPU change: `docs/claude/engine.md` (the #99 shared helpers: use them, never re-implement inline; CPU difficulty rules)
  - A specific card set (Gen 1–3: base, Jungle, Fossil, Rocket, Gym, Neo, e-Card, LC, Base Set 2, EX): `docs/claude/card-sets.md`
  - Any web UI (site menu, board, hand, dialogs, phone layout, deck sharing, post-run screen, music, settings): `docs/claude/ui.md`
  - Debug tools: `docs/claude/debug-tools.md`
- Keep this file lean: it is sent with every request. A new feature's agreed details go in its own `docs/claude/<feature>.md` (or the topic file it belongs to) with one line in the list above, never as a long bullet here.

## Stack and layout
- pnpm + turbo monorepo:
  - `apps/web`: Vite, React 19, TanStack Query/Router, Tailwind v4, dnd-kit, MUI icons (`@mui/icons-material`, so `@mui/material` and emotion are installed too).
  - `apps/api`: Hono + tRPC, deployed on Vercel.
  - `packages/game-engine`: pure TypeScript rules engine, tested with vitest.
  - `packages/campaign`: pure TypeScript runs (map, encounters, deck lists and generator, items), tested with vitest.
  - `packages/idle`: pure TypeScript Idle Adventure (FireRed's data, the Gen 3 battle engine, Kanto's areas, the run), tested with vitest. Shared depends on it (its inputs' schemas); it depends on campaign (the RNG).
  - `packages/shared`: Zod schemas shared by web and API. Zod drops keys a schema doesn't list, so every new field of an engine choice type must be added there too (`covers` fails to compile otherwise).
  - `packages/db`: Prisma on Supabase.
- Card fixes live in one place: `packages/campaign/src/card-fixes.ts` (`catalogCardDef`, `BABIES`, `OWNER`, `ALSO_EVOLVES_FROM`, the missing "Evolves from", promo holos, galaxy foil, `cardRarity`, `isImplemented`…). The API's `toCardDef` is `catalogCardDef`, and the campaign's `test-pool.ts` builds its defs with the same functions, so the two can't drift (`apps/api/src/cards.test.ts` checks they agree). A fix to a card's data goes there, never in `apps/api/src/cards.ts` or `test-pool.ts` alone. The seed's own fixes (`TCGDEX_FIXES`, printed names, Pokémon-ex stages, `packages/db/prisma/seed.ts`) are made before the catalog is written; the test pool's `exEvolving` copies the stage one until the next re-seed.
- `apps/api/src/games.ts` holds what saving games and runs share (`asJson`, `newSeed`, `actionRows`); `runs.ts` exports `lockUser` (a `SELECT … FOR UPDATE` on the user row inside a transaction) and `takeItem` (an atomic decrement). Any check-then-write on an account (a one-of-a-kind item, a second active run, a craft, a consumable) must run with the user row locked or as one atomic update, never a read outside the transaction. `saveGameState` returns false on a stale version: every caller must handle it (CONFLICT, or retry), never ignore it.
- The CPU runs after the player's action in `routers/game.ts`; if it throws, the error is logged and the CPU concedes so the game is saved whole (a behaviour choice from #102; swap for an error if the user prefers). The CPUs must never `reduce()` an empty list or `promotion()` an empty Bench.
- Dev servers: web on :5173, API on :8787.
- Game state lives in the engine. The API loads a game, applies an action with an `expectedVersion` (a stale version gets CONFLICT), saves the state plus an action row, then runs the CPU's response.
- Runs work the same way: `RunState` (campaign) is plain JSON in `Run.state`, changed only by `applyRunAction` with an `expectedVersion`. Battles are ordinary games with `Game.runId`; the run asks for one (`needsBattle`) and gets the result back (`BATTLE_OVER`, settled in `apps/api/src/runs.ts`).

## Conventions
- Code style: single quotes and long lines. Never run prettier with its default config; it reformats the whole repo.
- Keep README.md up to date. Every new file gets a row or line in the README, and new features get a section.
- Match the comment density, naming and idioms of the surrounding code.
- Colour themes (Settings, `utils/themes.ts`) redefine Tailwind's `--color-slate-*` and `--color-yellow-50`…`400`: chrome colours must be slate classes (yellow 50–400 for the accent) or `var(--color-slate-…)`, never a fixed hex, or the themes miss them. Yellow 500+ stays yellow for game meaning (Paralyzed, Lightning). Light themes (`light`, agreed 2026-10-23: Start Menu) turn the shades round, so text that must stay light on slate is `text-slate-50`/`hover:text-slate-50`, never `text-white`.
- Some files have CRLF line endings, so scripted find/replace can silently miss. Prefer exact edits.

## Checks before calling work done
- `pnpm typecheck` in `apps/web` and in `apps/api`, or `npx turbo run typecheck` at the root to check all packages.
- `npx vite build` in `apps/web`.
- `npx vitest run` in `packages/game-engine`, `packages/campaign`, `packages/idle`, `apps/api` and `apps/web` (all four have vitest since #107; the API's vitest config has a placeholder `DATABASE_URL`, so its tests never touch the DB). All tests must pass, and new engine rules get tests.
- Any new `PendingChoice` gets a `settles` test (`effects/test-kit.ts`: follows every legal answer and fails if a path still asks after 12 answers or no answer is accepted; `effects/choices.test.ts`): the hangs of #99 were choices that returned without `delete state.pendingChoice`. A choice must always end, whoever it's for.
- The campaign's `effects.test.ts` checks every id and attack name in the effect tables (`effectIds()`, `effects/index.ts`) exists in the snapshot (known exceptions: the seed's `TCGDEX_FIXES` renames, `ex6-107`'s spelling); `run-maps.test.ts` checks the generator's rules on every run type over 20 seeds (first step a battle, required battles, Centers from step 3, Aces from step 5, Swimmers only at sea, Gym Trainers before leaders). A new run type or map rule is covered by them for free; a new exception goes in their lists.
- Claude usually can't see the UI. Unless browser tools are connected, UI changes are only checked by typecheck and build, and you should be told that explicitly.
- For API checks against the real DB, use a throwaway script in `apps/api/src/_*.tmp.ts`, run it with `npx tsx --env-file-if-exists=../../.env`, and delete both the script and any test data afterwards.
- Development runs on a local Supabase (Docker; `pnpm db:local`, README: Setup, agreed 2026-10-25), never the hosted project: the hosted database's egress spiked from dev servers and review jobs each reloading the whole catalog on every restart. `pnpm dev` asks which database (local by default, hosted from `.env.remote`; `--local`/`--remote` skip it) and passes it to the servers as environment variables, leaving `.env` alone: start servers with `pnpm dev --here --local`. Scripts that read `.env` themselves (Prisma, the seed, `_*.tmp.ts` checks) follow `.env`: if it points at `supabase.co`/`supabase.com`, run `pnpm db:local` first. Touch the hosted database only when the user asks (migrations to production, a re-seed, a production data check), with `.env.remote`'s values. Never read the Card table in the API: card lookups go through `apps/api/src/catalog.ts` (`catalogInIdOrder`, `catalogIndex`, `catalogCards`) or `catalogRows`, which the Vercel build bundles (`scripts/dump-catalog.ts`; a re-seed falls back to the table until the next deploy, so redeploy after re-seeding the hosted database).

## Debug tools must never reach production
- The full list of cheats is in `docs/claude/debug-tools.md`.
- The debug tools must never be reachable in production. It is gated twice:
  - API: `debugProcedure` returns NOT_FOUND when `VERCEL_ENV=production` or `NODE_ENV=production`. `ENABLE_DEBUG=false` turns it off anywhere else.
  - Web: `__DEBUG_BUILD__` (set in `vite.config.ts`) is on in the dev server and off in `vite build` unless `VITE_ENABLE_DEBUG=true`, so production bundles don't contain the panel.
- Any new cheat or debug-only data must go through `debugProcedure` and the `__DEBUG_BUILD__` guard.
- Debug actions are logged ("Debug: …") and saved as `DEBUG` action rows. Anything that replays games from action rows must handle them.
- SET_HP has a minimum of 10; debug can't Knock Out a Pokémon directly.
