# Poké TCG

Monorepo for a single-player Pokémon TCG game: battle through the gym leaders of each Pokémon generation against CPU opponents. React SPA + Hono/tRPC API on Vercel, Supabase (Postgres, Auth), Prisma ORM.

**Current stage:** refining the card-playing mechanics. The home screen starts a test game (fixed Base Set test decks) against the gym-leader CPU (see [The CPU opponent](#the-cpu-opponent)), whose moves play out one at a time. Single-player structure, multiple saves per account and cross-run progression come later.

```
apps/
  web/                  Vite + React 19 SPA (TanStack Router/Query, tRPC client, Tailwind v4, Material UI icons)
    src/
      main.tsx          Routes, root layout (header with Play / Cards tabs), providers
      pages/            Route-level pages: data loading only
      components/       Game UI components, one per file
      hooks/            React hooks: interaction state and handlers used by components
      utils/            Pure helper functions grouped by use (no React)
      lib/              tRPC client, Supabase client, session hook
      styles/holo/      Holo card effect styles (one file per card style) plus WOTC tuning
    public/img/         Textures used by the holo styles
  api/                  Hono + tRPC API (Supabase JWT auth, game endpoints, debug endpoints outside production)
    scripts/
      vercel-build.mjs  Bundles the API and web app into .vercel/output for Vercel
packages/
  game-engine/          Pure TS rules engine + CPU opponents – shared by client (UI hints) and server (authority)
  shared/               Zod schemas for API input, player ids
  db/                   Prisma 7 schema, client (pg driver adapter), migrations, seed
supabase/               Local Supabase config (CLI)
CLAUDE.md               Project notes and decisions for Claude Code (read automatically each session)
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
| `Board.tsx` | The game table. Gets card play from `useCardPlay`, holds the hover preview, and lays out the components below. A move being set up (Trainer, attack or power questions, a held card, retreating, a Pokémon's menu) is cancelled by clicking anywhere except a Pokémon slot, a hand card or the move's own panel (elements marked `data-keep-action`) |
| `StatusBar.tsx` | Whose turn it is and the End turn button, centred in the middle of the table between the two sides |
| `DebugPanel.tsx` | The game log's Debug tab (see [Debug tools](#debug-tools)): draw a card, put any card or an Energy into your hand, set any Pokémon's HP. Loaded lazily, and left out of production builds |
| `Toasts.tsx` | Messages in the bottom right of the page (amber warnings such as why a card can't be played, red errors for a move the server rejected) that fade away after a few seconds, newer ones stacking underneath, nearest the corner. The instruction for a held card ("Click a highlighted slot") is a prompt instead: it stays up while the card is held and disappears the moment it's played or put down |
| `OpponentArea.tsx` | The CPU's bench, active and hand/deck/prize counts, and its hand face up while your Omanyte's Clairvoyance works. When an effect asks for one of the CPU's Pokémon, the choices are highlighted and clicked (several for Gigashock, marked "Chosen"). The Trainer being played floats over this side, its bottom level with the CPU's active |
| `FloatingDialog.tsx` | Holds those floating panels, with an eye button that fades them to 20% opacity with a dashed outline and lets every click through to what's underneath (only the eye button stays clickable); the deck search only fades |
| `AttackList.tsx` | Attack buttons beside your active Pokémon, with damage after the defender's weakness and resistance (variable damage like "30+" is shown as printed); attacks it can't use are disabled with the reason as a tooltip |
| `AttackChoicePanel.tsx` | Asks the current question of an attack being used: energy to discard (a set number, or any number for Wildfire), a defender's energy or attack, a type, cards from your discard pile (Energy Conversion, Scavenge), whose deck (Prophecy), or confirming the benched Pokémon picked on the board (Gigashock) |
| `PrizeCards.tsx` | Prize cards face down in one overlapping column of 6, the last shown whole and level with the bench (upside down on the CPU's side), left of your play area (under your Concede button) and right of the CPU's |
| `DeckAndDiscard.tsx` | A player's deck (face down) and discard pile (top card face up) with counts, in a column beside each play area (discard above deck on your right; mirrored both ways on the CPU's left), with the deck level with the bench. |
| `CardBack.tsx` | A face-down card |
| `CoinFlip.tsx` | Animated coin under the game log (beside the strip when the log is minimised) for each coin flip in a move's result, one after another |
| `GameLog.tsx` | The game log (attacks, coin flips, Special Conditions, knockouts), with room for buttons in its header |
| `LogDrawer.tsx` | The game log and coin flips as a full-height panel at the left or right edge of the window, outside the page margins: minimise it to a strip, move it to the left or right (swap button), using Material UI icons, or drag its inner edge to resize it. Remembered in the browser. With the debug tools enabled it has a second tab, Debug |
| `PowerPanel.tsx` | The active Pokémon's Power button under its attacks, or the current question while any power is being used. `BenchPowerButton` is the Activate button that appears under a benched Pokémon with a power when you click it |
| `TrainerPanel.tsx` | The Trainer card being played (floating over the CPU's side): its name, text and questions one at a time; answering the last one plays it (a single card or Pokémon is chosen by clicking it). Cards from your hand (Computer Search, Item Finder, Energy Retrieval, Maintenance, Pokémon Breeder, Pokémon Trader) are picked by clicking them in the hand itself (`handPick` in `useTrainer`), with a Choose button when it takes more than one. A Trainer with no questions gets a Play button. A question answered by a single click in the hand or on the board (Pokémon Breeder, Gust of Wind, Potion…) shows no panel, only a prompt toast that stays until the card is played or cancelled; a Trainer that can't be played shows a warning toast instead of the panel |
| `PendingChoicePanel.tsx` | Finishing a search from a Trainer or attack: take a card from your deck (Computer Search, Pokémon Trader, Energy Search, Call for Family) or your discard pile (Recycle) or reorder the top cards of a deck (Pokédex, Prophecy) by dragging them or with the arrow buttons. Only you see these cards. Shown big in the middle of the table (not counting the game log), as wide as its cards need, with large card images |
| `RetreatPanel.tsx` | Retreat button under the attacks; while retreating, picks which energy to discard (when it matters) and prompts for a benched Pokémon |
| `Hand.tsx` | Your hand along the very bottom of the screen, centred, each card partly below the edge. At rest it keeps to the play area's width; only a hovered card's neighbours spill into the page margins (up to the window edge and the game log) when they need the room; they overlap when there are too many to fit. Hovering a card grows it, lifts it fully into view and slides its neighbours aside, squeezing them closer rather than off the screen while every card keeps at least a 2rem strip showing to hover; the selected card is lifted too. Dragging a card back over the hand puts it back (`HAND_ZONE`), even where the dragged image overlaps the bench |
| `HandCard.tsx` | One draggable, clickable card in your hand; while a Trainer asks for hand cards it's highlighted if it can be picked, ringed and raised once picked, and faded if not |
| `PlayArea.tsx` | Both sides of the table, filling the window's height above the hand; the cards scale to the space (`.play-area-cards`). While a Trainer card is dragged it glows green with the pointer over it, where dropping plays the card, and red with the pointer anywhere else, where dropping does nothing. Energy and Pokémon cards dragged to a slot do the same: red unless they're over a slot they can go to (then the slot glows instead) |
| `SlotMenu.tsx` | The small panel under a clicked Pokémon in play with what you can do with it: Activate a benched Pokémon's power, or Discard Clefairy Doll |
| `Slot.tsx` | An active or bench slot: drop target, highlight ring, tint band and "Play"/"Attach"/"Evolve"/"Promote"/"Choose" label (both across the middle of the card, clear of the Energy along the bottom). Any attack, power or Trainer that asks for a Pokémon in play is answered by clicking a highlighted slot (`pokemonPick` in `Board.tsx`), not a button. A Transformed Ditto shows the card it's a copy of, with a "Ditto" chip |
| `Card.tsx` | Card art with damage, attached-energy (a row of `EnergyIcon`s along the bottom), Special Condition and protection overlays; opens the hover preview |
| `EnergyIcon.tsx` | One energy as a coloured disc with its type's MUI symbol (leaf, flame, drop, bolt, eye, fist, moon, gear, star), so types differ by shape as well as colour. Used on cards in play and in the attack, retreat and debug panels |
| `CardPreview.tsx` | The large card preview that follows the cursor and resizes with the mouse wheel (except over the deck-search lists, where the wheel scrolls the page) |
| `PreviewContext.ts` | Context that lets any card show or hide the hover preview |
| `HoloCard.tsx` | A card with the holo effect: tilts toward the pointer while shine and glare layers follow it. Used by `CardViewer` in the Cards tab only; play mode shows plain card images |
| `CardFilters.tsx` | Card browser controls: name search, set, type and stage filters, max-attack range, sort field and direction, match count |
| `CardGrid.tsx` | Scrollable grid of low-res card images; the number of columns follows the width. Rows overlap so only each card's top strip (its name, set by the `gap-y-6` row gap) shows; hovering a strip brings that card to the front, clicking selects it |
| `CardViewer.tsx` | The selected card's high-res image (low-res shown while it loads), sized to the window, with set, rarity, stage, type, HP and max attack |

### `src/hooks/`

| File | Description |
|---|---|
| `useCardPlay.ts` | Playing cards from the hand by click (select, then click a highlighted slot; Esc cancels) or drag and drop (Trainers onto anywhere in the play area). Tracks the selected and dragged card, reports why a clicked card can't be played (`notify`), and returns the highlighted slots, their label, click handlers and the `DndContext` props |
| `useAttack.ts` | Using an attack: attacks straight away or asks its questions one at a time (via the engine's `nextAttackChoice`), and says why an attack can't be used (Esc cancels) |
| `usePower.ts` | Using Pokémon Powers: lists your Pokémon's powers with why each can't be used, tracks the benched Pokémon clicked to show its Activate button, and asks a power's questions one at a time (Esc cancels) |
| `useToasts.ts` | The messages `Toasts` shows: `push(kind, text)` adds one, which fades out after 4 seconds; one already showing isn't repeated |
| `useTrainer.ts` | Playing a Trainer from the hand: says why it can't be played, asks its questions, and plays it as soon as the last one is answered (Esc cancels). Dropped on the play area, a Trainer with no questions is played at once |
| `useRetreat.ts` | Retreating the active: tracks the chosen energy, says why retreat is blocked, and returns the bench slots to switch in and their click handlers (Esc cancels) |

### `src/utils/`

| File | Description |
|---|---|
| `targets.ts` | Where a hand card can be played, why it can't, which action playing it sends, and its target label |
| `slots.ts` | Slot ids (`active`, `bench-N`), converting them to engine targets, empty/occupied slots, and which slot an in-flight move is about |
| `debug.ts` | `DEBUG_BUILD` (whether this build has the debug tools) and `useDebugEnabled` (and whether the API accepts them) |
| `turn.ts` | Whose turn it is, whether you must promote, and the status headline |
| `preview.ts` | Preview size limits, wheel zoom, saving the size in localStorage, and positioning next to the cursor |
| `dragOverlay.ts` | `centerOnPointer`: keeps a dragged card's image centred on the pointer, wherever the card was grabbed |
| `layout.ts` | Shared card widths: small (bench, prizes, piles) and large (active), which scale with the board through CSS variables, the one-card-wide side columns (prizes, deck and discard) so both active slots line up, and the page side margins (`PAGE_WIDTH`, undone by `PAGE_BLEED` for the hand) |
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
| `powers.ts` | Pokémon Powers: legality (`powerError`), their questions (`nextPowerChoice`) and `usePower`; whether a power works (`powerActive`: Special Conditions and Toxic Gas), Prehistoric Power (`evolutionBlocked`), Clairvoyance (`seesOpponentHand`) and Ditto's Transform (`refreshTransforms`, run on every action) |
| `trainers.ts` | Trainer cards: legality (`trainerError`, including Headache's lock), their questions (`nextTrainerChoice`), `playTrainer`, and pending searches of the deck that only the searching player sees (`PendingChoice`, resolved with `RESOLVE_CHOICE`; attacks start them too) |
| `effects/` | Card-specific effects by card id: attacks (`base1.ts` for the Base Set, `fossil.ts` for Fossil, from shared pieces in `common.ts`), Pokémon Powers (`base1-powers.ts`, `fossil-powers.ts`) and Trainers (`base1-trainers.ts`, `fossil-trainers.ts`). `test-kit.ts` sets up duels for their tests (`fossil.test.ts`, `fossil-powers.test.ts` and `fossil-trainers.test.ts` cover Fossil) |
| `status.ts` | Game log, coin flips, clearing conditions when a Pokémon leaves the active spot, and the card an in-play Pokémon counts as (`inPlayDef`, `effectId`: a Transformed Ditto's copy) |
| `view.ts` | `getPlayerView`: what one player may see |
| `cpu/index.ts` | CPU difficulties (`CPU_DIFFICULTIES`, `cpuFor`) and `runCpu`, which plays at the game's `cpuDifficulty` |
| `cpu/passive.ts` | The **Passive** CPU (`passiveCpu`): benches, evolves and attaches matching Energy; never attacks, retreats or plays Trainers |
| `cpu/trainer.ts` | The **Trainer** CPU (`trainerCpu`): a simpler gym leader for the other fights |
| `cpu/gym-leader.ts` | The **Gym leader** CPU (`gymLeaderCpu`): its rules, step by step |
| `cpu/shared.ts` | What the CPUs share: the turn context and common moves (benching, evolving, aiming Energy, Switch or retreat, finishing a search), choosing the first active, each attack simulated over every coin-flip outcome, the opponent's threat next turn, Energy arithmetic and which cards are useful |
| `cpu/*.test.ts` | Tests per difficulty (`gym-leader.test.ts` has one block per rule, with Base Set cards) |
| `debug.ts` | `applyDebug`: testing cheats (a card into the hand, draw, set a Pokémon's HP). Not `GameAction`s, so normal moves can never reach them; each is logged |

Rules follow the 1999 Base Set rulebook. Special Conditions: Asleep (flip between turns to wake), Confused (flip to attack, tails = 20 damage to itself; flip to retreat), Paralyzed (until after its owner's next turn), Poisoned (10 between turns, 20 from Toxic). The checkup between turns handles them in order for both actives: Poisoned, Burned (not in the Base Set, not implemented yet), Asleep, Paralyzed. Trainers: PlusPower (+10) and Defender (−20) attach to a Pokémon and change attack damage after weakness and resistance, PlusPower first; they're discarded at the end of the turn / the opponent's next turn. Clefairy Doll is played onto the Bench as a 10 HP Pokémon (it can't start as your Active or count as a Basic for the opening hand), can't retreat or get Special Conditions, gives no prize when Knocked Out, and can be discarded during your turn. Scoop Up can't take your only Pokémon in play; Devolution Spray can Knock Out. Double Colorless Energy provides 2 Colorless energy. Pokémon Powers stop working while their Pokémon is Asleep, Confused or Paralyzed. Dropping a Water Energy on a Water Pokémon uses Rain Dance when a Blastoise can, so it doesn't use up the turn's attachment. Where TCGdex's attack text differs from the printed card, the effect carries the printed wording and the API shows that instead.

Fossil attacks: every Fossil Pokémon's attack effects are in `effects/fossil.ts`. Damage to benched Pokémon (Dark Mind, Stretch Kick, Gigashock, Thunderstorm, Blizzard, Selfdestruct, Earthquake) ignores weakness and resistance, but Defender still takes 20 off it, as it does off damage an attack does to the attacker itself (Selfdestruct, Thunder, Double-edge…, and the 20 a Confused Pokémon does to itself on tails). Headache works even if the Defending Pokémon is protected by Agility or Barrier. Energy Conversion needs an Energy card in the discard pile and takes 1 or 2 of them. Fossil's Water Guns count every extra Energy, not only Water. Minimize takes 20 off attack damage after weakness, resistance, PlusPower and Defender. Smokescreen works like Sand-attack. Headache stops the opponent playing Trainer cards, Clefairy Doll included, during their next turn; it's on the player, so switching doesn't end it. Prophecy (either deck) and Call for Family leave a search to finish, and the turn ends once it's done. Terror Strike, like Whirlwind, brings in the opponent's first benched Pokémon for now.

Fossil Pokémon Powers (`effects/fossil-powers.ts`): Toxic Gas makes every other power stop working, on both sides, while Muk isn't Asleep, Confused or Paralyzed. Prehistoric Power stops both players playing Evolution cards (Pokémon Breeder included). Ditto's Transform, while it's the active and has no Special Condition, makes it a copy of the Defending Pokémon: type, HP, Weakness, Resistance, retreat cost, attacks and power; its Energy counts as any type; damage stays, so it's Knocked Out if it stops being a copy with more damage than its own 50 HP. Step In and Curse can be used once per turn per Pokémon; Curse can Knock Out, and the opponent then promotes without the turn ending. Strange Behavior can't Knock Out Slowbro. Transparency flips once per attack against any attack that does anything to Haunter, even its owner's, and only Sleep stops it. Kabuto Armor halves attack damage, rounded down to the nearest 10, after weakness, resistance, PlusPower and Defender. Clairvoyance shows the opponent's hand in the player's view. Cowardice returns Tentacool to the hand (not the turn it was put into play, nor your only Pokémon), discarding its cards.

Fossil Trainers (`effects/fossil-trainers.ts`): Mr. Fuji shuffles a benched Pokémon and everything attached into the deck. Energy Search takes a basic Energy card from the deck. Gambler shuffles the hand into the deck, then draws 8 on heads or 1 on tails. Recycle needs a card in the discard pile; on heads the player picks one (not Recycle itself) to put on top of the deck. Mysterious Fossil follows Clefairy Doll's rules (a 10 HP Pokémon on the Bench, never the starting Active, no prize when Knocked Out, can be discarded during your turn). Omanyte, Kabuto and Aerodactyl evolve from it, and Pokémon Breeder can put Omastar or Kabutops straight onto it. TCGdex leaves out "evolves from Mysterious Fossil", so `apps/api/src/cards.ts` fills it in.

## How a move works

1. Client sends `game.act({ gameId, expectedVersion, action })`.
2. API validates the input with Zod, loads the game state, and runs `applyAction` from `@poke-tcg/game-engine`.
3. If the move is legal, the API runs the CPU (`runCpu`) until it's the player's move again.
4. If `expectedVersion` still matches, the API writes the new state and every action (player and CPU) to the `GameAction` log in one transaction.
5. The response is `frames`: the player's `getPlayerView` after their move and after each of the CPU's, with who moved and the action type. Raw state, which includes the CPU's hand, deck order and RNG, never leaves the server.
6. The web caches the last frame and plays the others back (`pages/Game.tsx`): each stays up for 0.9s plus 1.9s per coin flip in it, and nothing can be clicked until the reply ends. Slots animate what changed (`Slot.tsx`): a Pokémon dropping in, a red shake for damage, green for healing, yellow for Energy, and the attacker lunging at the defender.

## The CPU opponent

Each difficulty has its own file in `packages/game-engine/src/cpu/`, with shared helpers in `shared.ts`. A game's `cpuDifficulty` picks one (missing = Gym leader), and the Debug tab can change it mid-game:

- **Passive** (`passive.ts`): benches Basics, evolves and attaches Energy to a Pokémon of the same type. It never attacks, retreats or plays Trainers.
- **Trainer** (`trainer.ts`), for the fights that aren't gym leaders: plays Bill and Professor Oak (same rules as the gym leader), benches and evolves, aims its Energy attachment like the gym leader, heals only its active (Potion at 20+, Super Potion at 40+ if it can still use its best attack), retreats or switches only when the active can't attack this turn or next and a benched Pokémon can, and attacks for the most damage even when that costs Energy or hurts itself. It never uses Pokémon Powers, searches its deck, disrupts, boosts, or looks at the player's next turn. After a Knock Out it promotes the Pokémon with the most HP left.
- **Gym leader** (`gym-leader.ts`): the strongest, described below.

The gym leader takes, on its turn, it takes the first move any of these steps wants, over and over, until it attacks or ends its turn:

1. **Draw and search**: Bill (keeping cards to draw). Computer Search for the next stage of a line in play, or a Basic if the Bench is empty, discarding Energy nothing can use, spare Trainers, Trainers it never plays and Pokémon it can't use (never anything else). Pokémon Trader swaps a Pokémon it can't use for one it wants. It only searches when the card could still be in its deck (counting the face-down prizes). Pokédex isn't played.
2. **Develop**: bench Basics, Pokémon Breeder straight to Stage 2, evolve (active first), and a Clefairy Doll only when the Bench is empty.
3. **Energy**: Rain Dance and the turn's attachment go to the active if they make a new attack usable, otherwise to the benched Pokémon they bring closest to attacking; Double Colorless only where two colorless symbols are open, and never Energy no attack can use. Energy Trans moves Grass Energy from the Bench to the active when that makes a stronger attack usable. Then Professor Oak, if the hand is down to 2 other cards (and the deck has more than 7).
4. **Heal**: Full Heal for a Special Condition; Super Potion on the active at 40+ damage if it can spare the Energy and still use its best attack, else the most damaged benched Pokémon at 40+; Potion at 20+ damage (active first); Pokémon Center for 60+ healed when the active isn't about to attack with Energy it would lose; Damage Swap moves damage counters off an active that would be Knocked Out.
5. **Disrupt**: Energy Removal on the player's active (else the Pokémon closest to its strongest attack); Super Energy Removal only when both Energy were going towards one attack, discarding its own Energy that's missed least; Gust of Wind for a Knock Out, else to strand a benched Pokémon with no Energy and a Retreat Cost of 2+.
6. **Retreat or Switch** (Switch first): when the active can't attack this turn or next but a benched Pokémon can; when it would be Knocked Out next turn (and isn't Knocking Out the attacker first) and a benched Pokémon would survive; or when it still has a Special Condition. The benched Pokémon that attacks best comes in. The Retreat Cost is paid with the Energy it can best spare, basic before special, and never when nothing could attack afterwards.
7. **Boost**: any Pokémon Power that makes this turn's attack better without costing a Pokémon or prize (Energy Burn); PlusPower when +10 makes a Knock Out; Defender when −20 stops a Knock Out next turn.
8. **Attack**: the cheapest attack that Knocks Out, otherwise the most damage. Attacks that hurt the attacker or discard its Energy only when they Knock Out or nothing else does damage.

After a Knock Out it promotes the benched Pokémon that attacks best (then the one with the most HP left). It plays no other Trainers yet (Lass, Impostor Professor Oak, Item Finder, Maintenance, Revive, Pokémon Flute, Scoop Up, Devolution Spray, Energy Retrieval), and never uses Buzzap.

It only uses what the player could see. What an attack would do is worked out in `cpu/shared.ts` by playing it on copies of the state with fixed coin flips covering every heads/tails pattern of three flips, so it never knows the real flips to come; "Knocks Out" means in at least half of those outcomes. The player's threat is their active's best attack next turn with the Energy it has now. Trainers and powers are recognised by name, so reprints work the same, and nothing depends on the current test decks.

## Debug tools

The game log has a **Debug** tab for testing: change the CPU's difficulty, draw a card, put any card (or an Energy) into your hand, and set the HP of any Pokémon in play. It only exists outside production, enforced in two places:

- **API** (the authority): the `debug.run` procedure is a `debugProcedure` (`apps/api/src/trpc.ts`), which answers `NOT_FOUND` unless `env.debugEnabled` (`apps/api/src/env.ts`). That's always false in production (`VERCEL_ENV=production` or `NODE_ENV=production`, whatever else is set), and true elsewhere unless `ENABLE_DEBUG=false`. `debug.enabled` tells the client which.
- **Web**: `__DEBUG_BUILD__` is a build-time constant from `vite.config.ts`: on in the dev server (unless `VITE_ENABLE_DEBUG=false`), off in a `vite build` (unless `VITE_ENABLE_DEBUG=true`). A production build leaves the Debug tab's code out of the bundle entirely; the tab also needs `debug.enabled` from the API.

Debug commands go through the engine's `applyDebug` (`packages/game-engine/src/debug.ts`), are written to the game log as "Debug: …", and are saved in the `GameAction` log as `{ type: 'DEBUG', command }`.

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

- Card effects for sets after the Base Set: Fossil is done; Jungle and later sets next. The CPUs only use Fossil's powers when the gym leader's generic "Boost" finds them helpful, and play none of Fossil's Trainers yet.
- Ask the player to choose when an opponent's attack makes them pick (Whirlwind and Terror Strike currently bring in their first benched Pokémon).
- Deck builder backed by `Deck` and `DeckCard`.
- Single-player structure: gym leader battles per generation, multiple saves per account, persistent progression across runs.
