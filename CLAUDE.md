# poke-tcg — notes for Claude

## Product direction
- Single-player game: the player battles a generation's gym leaders against CPU opponents. Not PvP. Don't add lobbies, multiplayer or realtime features.
- Roadmap order: (1) refine card-playing mechanics → (2) gym-leader campaign structure → (3) multiple saves per account → (4) progression across runs through different generations. Stay on the current step unless asked.
- Card pool: WOTC era only (1999–2003, before the EX series), from TCGdex. Cards with no image are excluded. Cards TCGdex lacks can be added by hand in `packages/db/prisma/data/custom-cards.json` (only with the user's say-so), with images in `apps/web/public/cards/<id>/`.
- If you're unsure what a card does or how its rules should work, stop and ask. Don't guess at card effects.

## Stack and layout
- pnpm + turbo monorepo:
  - `apps/web`: Vite, React 19, TanStack Query/Router, Tailwind v4, dnd-kit, MUI icons (`@mui/icons-material`, so `@mui/material` and emotion are installed too).
  - `apps/api`: Hono + tRPC, deployed on Vercel.
  - `packages/game-engine`: pure TypeScript rules engine, tested with vitest.
  - `packages/shared`: Zod schemas shared by web and API. Zod drops keys a schema doesn't list, so every new field of an engine choice type must be added there too (`covers` fails to compile otherwise).
  - `packages/db`: Prisma on Supabase.
- Dev servers: web on :5173, API on :8787.
- Game state lives in the engine. The API loads a game, applies an action with an `expectedVersion` (a stale version gets CONFLICT), saves the state plus an action row, then runs the CPU's response.

## Conventions
- Code style: single quotes and long lines. Never run prettier with its default config; it reformats the whole repo.
- Keep README.md up to date. Every new file gets a row or line in the README, and new features get a section.
- Match the comment density, naming and idioms of the surrounding code.
- Some files have CRLF line endings, so scripted find/replace can silently miss. Prefer exact edits.

## Checks before calling work done
- `pnpm typecheck` in `apps/web` and in `apps/api`, or `npx turbo run typecheck` at the root to check all packages.
- `npx vite build` in `apps/web`.
- `npx vitest run` in `packages/game-engine`. All tests must pass, and new engine rules get tests.
- Claude usually can't see the UI. Unless browser tools are connected, UI changes are only checked by typecheck and build, and you should be told that explicitly.
- For API checks against the real DB, use a throwaway script in `apps/api/src/_*.tmp.ts`, run it with `npx tsx --env-file-if-exists=../../.env`, and delete both the script and any test data afterwards.

## UI and interaction decisions (game board)
- The game page fills the window. Side margins come from `PAGE_WIDTH` in `apps/web/src/utils/layout.ts`, shared with the Cards page.
- Card sizes are CSS variables (`--card-sm`/`--card-lg`) on `.play-area-cards` in `index.css`. They scale with the play area's container size, and the large card is 1.4× the small one. Use `SMALL_CARD`/`LARGE_CARD`/`SIDE_COLUMN` rather than hard-coded sizes.
- Hand (`Hand.tsx`):
  - Docked at the bottom edge and partly hidden.
  - A hovered card grows and lifts while its neighbours slide aside, and every card keeps at least a small peek.
  - At rest it stays inside the play area width; it only spills into the margins while a card is hovered.
- Playing cards:
  - Drag cards onto slots. Trainers can be dropped anywhere on the play area.
  - The board glows green for a valid drop and red when the drop would cancel. Dropping on the hand cancels.
- Any effect that asks for a Pokémon is answered by clicking a highlighted slot on the board, not by picking from a list. Effects that pick cards from the hand do it in the hand itself.
- Benched Pokémon Powers and discarding Clefairy Doll are done by clicking the Pokémon and using its `SlotMenu`.
- Clicking outside cancels an in-progress move:
  - The listener uses the capture phase.
  - Elements marked `data-keep-action` are exempt.
  - Clicks right after a drag are ignored.
- Dialogs share one style: `bg-slate-800`, `ring-1 ring-slate-600`, buttons `bg-slate-600`/`hover:bg-slate-500`.
  - The Trainer dialog floats above the CPU's Active Pokémon. It shows no card image, and an eye button makes it see-through and click-through. It only appears when it has something to click (buttons, a multi-card Choose); single-click questions are a prompt toast, and an unplayable Trainer is a warning toast.
  - The deck-search dialog is large and centred, and is rendered outside the PlayArea (its `container-type` would trap fixed elements).
- Hints and errors are toasts (`useToasts`, bottom-right, 4s, deduped), not inline text. Instructions for a move in progress are `Toasts`' `prompt`: shown while the move is pending, gone the instant it's confirmed or cancelled, no timer.
- Game log sidebar (`LogDrawer`):
  - Full height at the window edge; can be minimised, resized and moved to either side.
  - Preferences are saved in localStorage under `poke-tcg.game-log`.
  - Has a "Game log" tab and a "Debug" tab.
- High-res card images are used for the hand, the Active Pokémon and the drag overlay; small images elsewhere.

## Phones and touch screens (README: Phones and touch screens)
- Supported: a phone held upright, and touch screens. The game page shows "turn your phone upright" on a sideways phone (`SIDEWAYS_PHONE`); a real landscape layout would need one row of cards a side.
- Breakpoints: `NARROW_SCREEN` (below 48rem, Tailwind `max-md:`) and the others in `utils/layout.ts`, read with `useMediaQuery`. Use the Tailwind variant for styling, and the hook only where the element tree changes (attacks under the board, the log as an overlay).
- `.play-area-cards` (index.css) subtracts the board's horizontal padding and gaps. If you change the board's `p-`/`gap-` classes, including the `max-md:` ones, update both formulas.
- Hover is mouse-only (check `pointerType === 'mouse'`): on touch, a tap fakes a hover that never ends. Card previews on touch come from holding the card (`useHoldPreview`), which swallows the click that ends the hold.
- Cards outside the play area take their width from `--card-lg`/`--card-sm` fallbacks. The hand sets `--card-lg` to its own card width.
- Effects must return nothing or a cleanup function. Use braces around calls like `scrollIntoView`, which returns a Promise in newer browsers; React would crash calling it on unmount.

## Debug tools (testing cheats)
- The Debug tab can change the CPU's difficulty, draw a card, add any card or Energy to the hand, and set the HP of any Pokémon in play.
  - Engine: `applyDebug` in `packages/game-engine/src/debug.ts`.
  - API: `debug` router.
  - Web: `DebugPanel.tsx`.
- It must never be reachable in production. It is gated twice:
  - API: `debugProcedure` returns NOT_FOUND when `VERCEL_ENV=production` or `NODE_ENV=production`. `ENABLE_DEBUG=false` turns it off anywhere else.
  - Web: `__DEBUG_BUILD__` (set in `vite.config.ts`) is on in the dev server and off in `vite build` unless `VITE_ENABLE_DEBUG=true`, so production bundles don't contain the panel.
- Any new cheat or debug-only data must go through `debugProcedure` and the `__DEBUG_BUILD__` guard.
- Debug actions are logged ("Debug: …") and saved as `DEBUG` action rows. Anything that replays games from action rows must handle them.
- SET_HP has a minimum of 10; debug can't Knock Out a Pokémon directly.

## Known open items
- CPU difficulties live in `packages/game-engine/src/cpu/`, one file each (`passive.ts`, `trainer.ts`, `gym-leader.ts`) plus `shared.ts`. Keep them separate. Gym leader is the baseline the user agreed on (README: The CPU opponent); change the difficulties' rules only with the user's say-so.
- Missing rules: Whirlwind and Terror Strike prompting (both bring in the first benched Pokémon), Burned, and card effects for later sets. Jungle is done (`effects/jungle.ts`, `jungle-powers.ts`, `jungle-trainers.ts`); the CPUs don't play Poké Ball yet. Fossil is done (`effects/fossil.ts`, `fossil-powers.ts`, `fossil-trainers.ts`); the CPUs don't play Fossil's Trainers yet.
- TCGdex card text drops energy icons ("Discard 1 Energy card" for "Discard 1 Fire Energy card"). Check the printed card for any untyped Energy in an effect and store the printed wording as `text`.
- In-play Pokémon: use `inPlayDef`/`effectId` (status.ts), not `lookupCard(cards, p.card.defId)`, for anything rules-related, so a Transformed Ditto works. Check passive powers with `powerActive`, which handles Toxic Gas.
