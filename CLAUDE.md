# poke-tcg — notes for Claude

## Product direction
- Single-player game: the player battles a generation's gym leaders against CPU opponents. Not PvP. Don't add lobbies, multiplayer or realtime features.
- Roadmap order: (1) refine card-playing mechanics → (2) gym-leader campaign structure → (3) multiple saves per account → (4) progression across runs through different generations. Currently on step (2), the run loop (since 2026-10-17). Stay on the current step unless asked.
- Card pool: WOTC era only (1999–2003, before the EX series), from TCGdex. Cards with no image are excluded. Cards TCGdex lacks can be added by hand in `packages/db/prisma/data/custom-cards.json` (only with the user's say-so), with images in `apps/web/public/cards/<id>/`.
- If you're unsure what a card does or how its rules should work, stop and ask. Don't guess at card effects.

## Stack and layout
- pnpm + turbo monorepo:
  - `apps/web`: Vite, React 19, TanStack Query/Router, Tailwind v4, dnd-kit, MUI icons (`@mui/icons-material`, so `@mui/material` and emotion are installed too).
  - `apps/api`: Hono + tRPC, deployed on Vercel.
  - `packages/game-engine`: pure TypeScript rules engine, tested with vitest.
  - `packages/campaign`: pure TypeScript runs (map, encounters, deck lists and generator, items), tested with vitest.
  - `packages/shared`: Zod schemas shared by web and API. Zod drops keys a schema doesn't list, so every new field of an engine choice type must be added there too (`covers` fails to compile otherwise).
  - `packages/db`: Prisma on Supabase.
- Dev servers: web on :5173, API on :8787.
- Game state lives in the engine. The API loads a game, applies an action with an `expectedVersion` (a stale version gets CONFLICT), saves the state plus an action row, then runs the CPU's response.
- Runs work the same way: `RunState` (campaign) is plain JSON in `Run.state`, changed only by `applyRunAction` with an `expectedVersion`. Battles are ordinary games with `Game.runId`; the run asks for one (`needsBattle`) and gets the result back (`BATTLE_OVER`, settled in `apps/api/src/runs.ts`).

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
- The game page fills the window. Side margins come from `PAGE_WIDTH` in `apps/web/src/utils/layout.ts`, shared with the Decks page.
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
- Side panel (`LogDrawer`, the game log sidebar), also on the run screen with the same page margins as the game:
  - Full height at the window edge; can be minimised, resized and moved to either side.
  - Preferences are saved in localStorage under `poke-tcg.game-log`.
  - Tabs: "Run" during a run (HP, ₱, EXP, consumables, Bag), the log ("Game log", or "Run log" on the run screen), and "Debug". The tabs can be picked from the minimised strip too.
- High-res card images are used for the hand, the Active Pokémon and the drag overlay; small images elsewhere.
- Cards show the large hover preview (`CardPreview`, via `PreviewContext`) everywhere except the hand, which grows the hovered card instead. Outside the board, wrap the page in `PreviewProvider`.

## Debug tools (testing cheats)
- The Debug tab can change the CPU's difficulty, draw a card, add any card or Energy to the hand, set the HP of any Pokémon in play, and turn Special Conditions on or off on either active.
  - Engine: `applyDebug` in `packages/game-engine/src/debug.ts`.
  - API: `debug` router.
  - Web: `DebugPanel.tsx`.
- It must never be reachable in production. It is gated twice:
  - API: `debugProcedure` returns NOT_FOUND when `VERCEL_ENV=production` or `NODE_ENV=production`. `ENABLE_DEBUG=false` turns it off anywhere else.
  - Web: `__DEBUG_BUILD__` (set in `vite.config.ts`) is on in the dev server and off in `vite build` unless `VITE_ENABLE_DEBUG=true`, so production bundles don't contain the panel.
- Any new cheat or debug-only data must go through `debugProcedure` and the `__DEBUG_BUILD__` guard.
- Debug actions are logged ("Debug: …") and saved as `DEBUG` action rows. Anything that replays games from action rows must handle them.
- SET_HP has a minimum of 10; debug can't Knock Out a Pokémon directly.

## Runs (game loop) decisions
- Agreed with the user: EXP is a separate account currency (earned by beating runs, spent in the post-run shop); ₱ belongs to a run (starts at 500) and goes to `User.bank` as soon as the run ends (beaten or lost). A lost battle costs 1 of 3 HP and the run moves on; a lost gym leader battle is fought again. Each step offers 2–3 encounters to choose from. Items work (`ItemEffect`/`ItemUse` in `items.ts`): equipment is read live on each run action, consumables are used before a battle, battle effects become the player's battle rules. The user said to balance them later, so prices and strengths are placeholders.
- Trainers use the CPU's Trainer difficulty with `generateDeck`; elite (Ace) trainers and bosses use Gym leader difficulty. Every gym leader has a required Gym Trainer (their gym's type, Trainer difficulty) on the step before them.
- Bosses (`campaign/src/bosses.ts`) play their TCG 1 (Game Boy Color) counterpart's deck, named for the Gen 1 character (Club Masters → gym leaders, Grand Masters → Elite Four, Ronald → Champion Blue). Agreed: Game Boy-only cards (promos, "Mystery"/"Laboratory" prints, Fan Book, Pokémon Web) are replaced by the closest TCGdex card of the same type, never added by hand. Run types: one per gym, Kanto Gym Challenge, Kanto Champion.
- Run cards come from `cardImplemented` cards of `POOL_SETS` only.
- Unlocks (agreed): a card gained in a run is unlocked at once (`CardUnlock`), never added to the run's deck (trades excepted); unlocks are per card, not per copy; basic Energy is always unlocked; a Base Set 2 common and the earlier common it reprints are unlocked together, either way round (same art; only Base Set 2's commons, not its uncommons or rares, and no other set); Base Set 2's holo rares are shown as galaxy foil; the starter deck is saved to the account's deck list with its cards unlocked. Runs start with one of the account's decks, which must follow the rules and hold only unlocked cards. Locked cards are darker on the Decks tab, and shown without holo effects. (The Cards tab was removed: the deck builder covers browsing cards.)
- Booster packs (agreed): bought with banked ₱ on the Packs tab, one per set with card effects; 11 cards with averaged WOTC-era odds (1 rare, holo 1 in 3; 3 uncommons; 6 commons; 1 basic Energy). Every card opened is unlocked.
- The "Retry with 3 HP" button (`run.retry`) is a testing aid the user wants in production for now; remove it before release.

## Known open items
- CPU difficulties live in `packages/game-engine/src/cpu/`, one file each (`passive.ts`, `trainer.ts`, `gym-leader.ts`) plus `shared.ts`. Keep them separate. Gym leader is the baseline the user agreed on (README: The CPU opponent); change the difficulties' rules only with the user's say-so.
- Team Rocket (base5) is done (`effects/rocket.ts`, `rocket-powers.ts`, `rocket-trainers.ts`, rulings in their headers) and in the run pool and packs; the CPUs don't play its Trainers or special Energy. The campaign's test pool (`test-pool.ts`) copies the API's card fixes (Dark Stage 2 evolutions, printed attack costs, special Energy), so keep the two in step. Rainbow Energy is `'any'` in an energy pool: check attached Energy of a type with `counts`, `isEnergyCardOf` or `payCost` (engine.ts), never by comparing `energyType`. Its Dark Stage 2 Pokémon evolve from the Dark Stage 1 (fixed in `apps/api/src/cards.ts`).
- Base Set 2 is done (`effects/base4.ts`) and in the run pool. Its cards are all reprints: each takes its original's attacks, power and Trainer effect through `BASE4_REPRINTS` and `base4Reprints`, so fixing an original fixes its reprint too. Never key behaviour on a specific card id (use names, as the CPUs do), or the reprint won't match.
- Missing rules: card effects for later sets. Attacks where the opponent chooses a benched Pokémon ask them once the attack is over (a `PendingChoice` for the defending player, via `ctx.opponentChooses`; the turn ends after it). Switching (Whirlwind, Ram, Terror Strike, Rapid Spin, Fling) uses `opponentSwitches`, and the CPU brings in what it would promote. Cat Punch's damage goes through `damageChosenBenched`, so it still counts as the attack's (Defender, Kabuto Armor, bench protection), and the CPU picks the benched Pokémon with the most HP left. With one benched Pokémon there's no question. Jungle is done (`effects/jungle.ts`, `jungle-powers.ts`, `jungle-trainers.ts`); the CPUs don't play Poké Ball yet. Fossil is done (`effects/fossil.ts`, `fossil-powers.ts`, `fossil-trainers.ts`); the CPUs don't play Fossil's Trainers yet. The Wizards Black Star Promos are done (`effects/promos.ts`, `promos-powers.ts`, `promos-trainers.ts`, rulings in their header comments); the CPUs don't play Computer Error or the Stadiums, or use Lucky Stadium.
- A `PendingChoice` can belong to the player whose turn it isn't (Computer Error, Chain Reaction). `applyAction` takes `RESOLVE_CHOICE` from that player only, and every CPU difficulty answers its own pending choice before checking whose turn it is. New choices that the CPU can be asked must be handled in `resolveSearch` (`cpu/shared.ts`) and `finishSearch` (`cpu/passive.ts`).
- Stadiums: `GameState.stadium` (one for both players), played like any Trainer with `stadium: true` on its effect; `useStadium` makes it usable once a turn with `USE_STADIUM`. Baby Pokémon are `baby: true` on the card (the API sets it from the "Baby" stage and for the promos TCGdex lists as Basic).
- TCGdex card text drops energy icons ("Discard 1 Energy card" for "Discard 1 Fire Energy card"). Check the printed card for any untyped Energy in an effect and store the printed wording as `text`.
- In-play Pokémon: use `inPlayDef`/`effectId` (status.ts), not `lookupCard(cards, p.card.defId)`, for anything rules-related, so a Transformed Ditto works. Check passive powers with `powerActive`, which handles Toxic Gas.
