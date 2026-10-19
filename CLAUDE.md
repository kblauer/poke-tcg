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
- Benched Pokémon Powers, discarding Clefairy Doll and using the Stadium (Lucky Stadium, `StadiumCard`, which glows when it can be used) are done by clicking the card. A card whose only option is its effect uses it at once, with no menu or confirm button; when it can't be used, a warning toast says why.
- Clicking outside cancels an in-progress move:
  - The listener uses the capture phase.
  - Elements marked `data-keep-action` are exempt.
  - Clicks right after a drag are ignored.
- Dialogs share one style: `bg-slate-800`, `ring-1 ring-slate-600`, buttons `bg-slate-600`/`hover:bg-slate-500`.
  - The Trainer dialog floats above the CPU's Active Pokémon. It shows no card image, and an eye button makes it see-through and click-through. It only appears when it has something to click (buttons, a multi-card Choose); single-click questions are a prompt toast, and an unplayable Trainer is a warning toast.
  - The deck-search dialog is large and centred, and is rendered outside the PlayArea (its `container-type` would trap fixed elements).
- Inventory (agreed): page width like the other tabs; items show their picture (`ItemIcon`, `public/items/`, game item icons or the closest stand-in) in the Inventory and the shop; equipment is equipped by dragging (or click, then click) a piece from the grid onto the slots laid over the account's trainer sprite (any of Showdown's ~1,500, `TRAINER_SPRITES`, hotlinked; `User.trainerSprite`, default Hilbert; picked with Change trainer under it) (a quarter of the row; the grid three quarters) (`EquipmentPanel`), the slots it fits green and the others red while it's held. Key items show a badge case per generation (`BadgeCases`) instead of each badge; it opens to the generation's badges, the ones not yet won greyed out.
- The music player (`MusicPlayer`, bottom-right of every page, KHInsider streams listed in `public/music/tracks.json`, gens 1–5, tracks of 1 minute or more, battle music listed apart) was agreed with the user, licensing aside: the app isn't public.
- Hints and errors are toasts (`useToasts`, bottom-right above the music player, 4s, deduped), not inline text. Instructions for a move in progress are `Toasts`' `prompt`: shown while the move is pending, gone the instant it's confirmed or cancelled, no timer.
- Side panel (`LogDrawer`, the game log sidebar), also on the run screen with the same page margins as the game:
  - Full height at the window edge; can be minimised, resized and moved to either side.
  - Preferences are saved in localStorage under `poke-tcg.game-log`.
  - Tabs: "Run" during a run (HP, ₱, EXP, consumables, Bag), the log ("Game log", or "Run log" on the run screen), and "Debug". The tabs can be picked from the minimised strip too.
- High-res card images are used for the hand, the Active Pokémon and the drag overlay; small images elsewhere.
- Cards show the large hover preview (`CardPreview`, via `PreviewContext`) everywhere except the hand, which grows the hovered card instead. Outside the board, wrap the page in `PreviewProvider`.
- Right-clicking any card, anywhere, opens the `CardInspector` (large, all holo effects; `CardInspectProvider` around every page, the deck builder adding its − and +). New card elements should use `useInspectOnRightClick`.
- The Active Pokémon shows its holo effect when it's a holo, but still (`HoloCard` `still`): no tilt or reaction to the pointer.

## Phone layout (agreed)
- Phones held upright (`useIsPhone`) get their own battle screen and Collection layout; tablets and desktops keep the usual ones. See README: Phone layout.
- Battle screen: locked full screen (`useLockedScreen`), TCG Pocket style (`components/phone/`); tap your Active for its moves (`ActiveSheet`); small Prize/deck/discard stacks beside each Active; the round ☰ button opens the side panel's tabs and Concede (`LogSheet`). No hover preview: a long press inspects a card.
- Phone hand: tap selects; hold zooms in (large, above the hand) and sliding along the hand changes the zoomed card; sliding up off the hand drags the zoomed card into play.
- Collection: decks (compact tiles) on the left and the search on the right share the top; the cards get the rest.

## Debug tools (testing cheats)
- The Debug tab can change the CPU's difficulty, draw a card, add any card or Energy to the hand, set the HP of any Pokémon in play, and turn Special Conditions on or off on either active.
- The pack window's "Debug: force holo Energy" and "Debug: force all-rares pack" checkboxes open packs with a holo Energy each, or all rares (`packs.debugOpen`, a `debugProcedure`; the checkbox is guarded by `DEBUG_BUILD` and `useDebugEnabled`).
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
- Agreed with the user: EXP is a separate account currency (earned by beating runs, spent in the post-run shop); ₱ belongs to a run (starts at 500) and goes to `User.bank` as soon as the run ends (beaten or lost). A lost battle costs 1 of 3 HP and the run moves on; a lost gym leader battle is fought again. Each step offers 2–3 encounters to choose from. Trainer battles lean different ways (`focus`: twice the ₱, twice the EXP, or reward cards one rarity up; placeholder amounts). Items work (`ItemEffect`/`ItemUse` in `items.ts`): equipment is read live on each run action, consumables are used before a battle, the post-run shop stocks 3–4 consumables, 1–2 misc items and 1 piece of gear after each run (`shopStock`), battle effects become the player's battle rules. The user said to balance them later, so prices and strengths are placeholders.
- Trainers use the CPU's Trainer difficulty with `generateDeck`; elite (Ace) trainers and bosses use Gym leader difficulty. Every gym leader has a required Gym Trainer (their gym's type, Trainer difficulty) on the step before them.
- Bosses (`campaign/src/bosses.ts`) play their TCG 1 (Game Boy Color) counterpart's deck, named for the Gen 1 character (Club Masters → gym leaders, Grand Masters → Elite Four, Ronald → Champion Blue). Agreed: Game Boy-only cards (promos, "Mystery"/"Laboratory" prints, Fan Book, Pokémon Web) are replaced by the closest TCGdex card of the same type, never added by hand. Run types: one per gym, Kanto Gym Challenge, Kanto Champion.
- Run cards come from the run's generation only (`GENERATIONS[gen].poolSets`, `runPool` in `apps/api/src/pool.ts`): Gen 1's `cardImplemented` cards of `POOL_SETS`, Gen 2's every card of `GEN2_SETS`.
- Gen 2 (agreed, scaffolding; card effects to come later): sets Neo Genesis → Skyridge with Southern Islands, not Legendary Collection (`GEN2_SETS`); Johto runs (8 gyms, Johto Gym Challenge, Johto Champion) with bosses in `johto-bosses.ts` (our own decks of Gen 2 cards around each character's GSC/HGSS team; ids `johto-koga`/`johto-bruno`/`johto-lance`); random decks use `GEN2_DECK_RULES` (Neo Genesis basic Energy, Gen 2 Trainers, no Double Colorless); Johto badges and the Johto Champion Ribbon; boss sprites from Crystal (pokecrystal), as HGSS ones weren't reachable. The run picker has a Generation dropdown; the Packs tab shows every set with a multi-select generation filter (`GenerationFilter`).
- Conceding (agreed): only while choosing the next step; the run is lost (`conceded`, no retry, no EXP), its gained cards stay unlocked. However a run ends, its ₱ are banked only once a battle has been completed without conceding that game, won or lost (`battlesCompleted`, `bankablePokedollars`; the API passes `conceded` with `BATTLE_OVER` from the game's action rows).
- Progress (agreed): an account starts with no booster packs. A run's first completed battle (same rule) unlocks its generation's next pack in release order (`GENERATIONS`, `nextPack`; `PackUnlock`, `apps/api/src/progress.ts`), beating a run all of the generation's packs. Gen 2 runs, when they exist, unlock from Neo Genesis. Gym runs are open from the start; the Gym Challenge needs all its generation's badges, the Champion run its Gym Challenge beaten (`runTypeLock`). The run picker shows each run's final boss's overworld sprite (`public/trainers/`, from the remake where there is one: FireRed/LeafGreen for Kanto, via the pret decompilation) and ticks runs beaten.
- Unlocks (agreed): a card gained in a run is unlocked at once (`CardUnlock`), never added to the run's deck (trades excepted; and before a battle the run's deck can be switched for another of the account's playable decks, in the `RouteChoice` panel beside the map); unlocks are per card, not per copy, except that a holo with a non-holo version of the same card in its set (`holoTwins`) is a special addition: it counts every copy gained (`CardUnlock.quantity`) and unlocks the non-holo version with it; holo-only cards (Base Set Alakazam) are ordinary unlocks with 4 copies; holo Energy counts copies too; a deck holds no more copies of a special holo or a holo Energy than were gained (the starter deck uses Fossil's non-holo Lapras for this); basic Energy is always unlocked (holo Energy isn't: found only in packs, 2% of Energy cards, one random holo-library style each, and a deck holds no more of each than were pulled: `CardUnlock.quantity`); a Base Set 2 card and the earlier print with its look are unlocked together, either way round, whenever neither is holo (commons, uncommons and non-holo rares; holos look different and unlock separately; only Base Set 2, no other set); Base Set 2's holo rares are shown as galaxy foil; the starter deck is saved to the account's deck list with its cards unlocked. Runs start with one of the account's decks, which must follow the rules and hold only unlocked cards. Run deck (agreed): during a run the deck list has an automatic, read-only "Current run" deck (`Deck.runId`) copying the run's deck; when the run is over it can be saved under a name (default "Run #N – <run type>"), and if it isn't, the next run (started with one of the account's own decks) takes it over. Locked cards are darker on the Collection tab, and shown without holo effects. (The Cards tab was removed: the deck builder covers browsing cards.)
- Booster packs (agreed): bought with banked ₱ on the Packs tab, one per set with card effects; 11 cards with averaged WOTC-era odds (1 rare, holo 1 in 3; 3 uncommons; 6 commons, each of the 9 rolling to be an extra rare: 4%, then 2%, then sharply less as the pack gets more; 0.6% of packs all rares, with fireworks; 1 basic Energy: the set's own or the closest earlier set's, sometimes holo). Every card opened is unlocked, and one already obtained gives Stardust (agreed; new unlocks give none): 50 a common, 100 an uncommon, 300 a rare or holo; crafting a card in the deck builder's right-click view costs 100 (common/uncommon) or 500 (rare/holo) and unlocks it as a pull would (only cards packs hold, not basic or holo Energy, and only from sets whose packs are unlocked).
- The "Retry with 3 HP" button (`run.retry`) is a testing aid the user wants in production for now; remove it before release.

## Known open items
- CPU difficulties live in `packages/game-engine/src/cpu/`, one file each (`passive.ts`, `trainer.ts`, `gym-leader.ts`) plus `shared.ts`. Keep them separate. Gym leader is the baseline the user agreed on (README: The CPU opponent); change the difficulties' rules only with the user's say-so.
- Team Rocket (base5) is done (`effects/rocket.ts`, `rocket-powers.ts`, `rocket-trainers.ts`, rulings in their headers) and in the run pool and packs; the CPUs don't play its Trainers or special Energy. The campaign's test pool (`test-pool.ts`) copies the API's card fixes (Dark Stage 2 evolutions, printed attack costs, special Energy), so keep the two in step. Rainbow Energy is `'any'` in an energy pool: check attached Energy of a type with `counts`, `isEnergyCardOf` or `payCost` (engine.ts), never by comparing `energyType`. Its Dark Stage 2 Pokémon evolve from the Dark Stage 1 (fixed in `apps/api/src/cards.ts`).
- Base Set 2 is done (`effects/base4.ts`) and in the run pool. Its cards are all reprints: each takes its original's attacks, power and Trainer effect through `BASE4_REPRINTS` and `base4Reprints`, so fixing an original fixes its reprint too. Never key behaviour on a specific card id (use names, as the CPUs do), or the reprint won't match.
- Missing rules: card effects for later sets. Attacks where the opponent chooses a benched Pokémon ask them once the attack is over (a `PendingChoice` for the defending player, via `ctx.opponentChooses`; the turn ends after it). Switching (Whirlwind, Ram, Terror Strike, Rapid Spin, Fling) uses `opponentSwitches`, and the CPU brings in what it would promote. Cat Punch's damage goes through `damageChosenBenched`, so it still counts as the attack's (Defender, Kabuto Armor, bench protection), and the CPU picks the benched Pokémon with the most HP left. With one benched Pokémon there's no question. Jungle is done (`effects/jungle.ts`, `jungle-powers.ts`, `jungle-trainers.ts`); the CPUs don't play Poké Ball yet. Fossil is done (`effects/fossil.ts`, `fossil-powers.ts`, `fossil-trainers.ts`); the CPUs don't play Fossil's Trainers yet. The Wizards Black Star Promos are done (`effects/promos.ts`, `promos-powers.ts`, `promos-trainers.ts`, rulings in their header comments); the CPUs don't play Computer Error or the Stadiums, or use Lucky Stadium.
- Gym Heroes (gym1) is done on the `gym-heroes-sets` branch (`effects/gym1.ts`, `gym1-powers.ts`, `gym1-trainers.ts`, rulings in their headers) and in the run pool and packs. Agreed: Bench Guard and Vermilion City Gym ask each time (the CPU always flips), Flee is asked before the attack, Crosscounter applies Weakness and Resistance, Celadon City Gym can be used any number of times. Choices that must wait behind another go in `GameState.queuedChoices`. Bench room goes through `openBenchSlot` (Narrow Gym).
- Gym Challenge (gym2) is done on the same branch (`effects/gym2.ts`, `gym2-powers.ts`, `gym2-trainers.ts`, rulings in their headers) and in the run pool and packs. Agreed: Rocket's Minefield Gym puts 2 damage counters on tails, Chaos Gym's tails lets the opponent play the card, Blaine's Quiz #3 offers 4 names, Shapeshift and Secret Plan have their full rules. A face-down card (Secret Plan) must never reach the opponent's view (`getPlayerView` hides it); anything that damages or evolves a Pokémon must turn it over first (`revealFaceDown`). Shapeshift's card is an `attached` entry, so it leaves play with its Pokémon. Owners' Pokémon evolve only from the same owner's (`OWNER` in `apps/api/src/cards.ts`, copied in `test-pool.ts`); never key an owner check on anything but the name. The gym leader CPU plays most of its Trainers (README: The CPU opponent); the Trainer CPU stays as documented (agreed).
- A `PendingChoice` can belong to the player whose turn it isn't (Computer Error, Chain Reaction). `applyAction` takes `RESOLVE_CHOICE` from that player only, and every CPU difficulty answers its own pending choice before checking whose turn it is. New choices that the CPU can be asked must be handled in `resolveSearch` (`cpu/shared.ts`) and `finishSearch` (`cpu/passive.ts`).
- Stadiums: `GameState.stadium` (one for both players), played like any Trainer with `stadium: true` on its effect; `useStadium` makes it usable once a turn with `USE_STADIUM`. Baby Pokémon are `baby: true` on the card (the API sets it from the "Baby" stage and for the promos TCGdex lists as Basic).
- TCGdex card text drops energy icons ("Discard 1 Energy card" for "Discard 1 Fire Energy card"). Check the printed card for any untyped Energy in an effect and store the printed wording as `text`.
- In-play Pokémon: use `inPlayDef`/`effectId` (status.ts), not `lookupCard(cards, p.card.defId)`, for anything rules-related, so a Transformed Ditto works. Check passive powers with `powerActive`, which handles Toxic Gas.
