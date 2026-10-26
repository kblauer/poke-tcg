# Debug tools (testing cheats)

Moved out of CLAUDE.md word for word (2026-10-26) so it loads only when needed. Everything here is still agreed with the user and binding.

- The Debug tab can show a test coin flip (random, heads or tails; only in the browser, the game unchanged: `requestTestFlip`), change the CPU's difficulty, draw a card, add any card or Energy to the hand, set the HP of any Pokémon in play, and turn Special Conditions on or off on either active.
- The pack window's "Debug: force holo Energy" and "Debug: force all-rares pack" checkboxes open packs with a holo Energy each, or all rares (`packs.debugOpen`, a `debugProcedure`; the checkbox is guarded by `DEBUG_BUILD` and `useDebugEnabled`).
- The Battle Tower's scenes (`TowerScene`) have debug buttons in their top right corner: Show tiles (as the run maps', with the room's places) and Pause (the user's, to look at the maps while Red walks).
- In debug mode the run picker unlocks every run type (`run.debugStart` starts a locked one).
- Debug switches on the Settings page (the user's; only in debug mode: `User.debugFlags`, `apps/api/src/debugFlags.ts` reads them as off unless `env.debugEnabled`, set by `debug.setFlags`): "Unlock everything that's locked" (`unlocksAll`: cards 4 copies each, packs, run types, Battle Tower start floors, cosmetics, card flair; opening packs and a run's earned packs still read the real unlocks, `owned`) and "Add ₱1,000,000 to the bank", "Add 1,000,000 Stardust", "Add 1,000,000 EXP" (`CURRENCY_FLAGS`: each adds it when switched on, takes it away again when off, never below 0). Anything new that's locked must honour `unlocksAll`.
- A run's battles have a "Skip battle" button under Battle (`run.debugSkipBattle`): the battle is chosen and its game won at once with the `WIN` debug command, then settled as a won battle that gives no ₱, EXP or card reward (`skipped` on `BATTLE_OVER`).
  - Engine: `applyDebug` in `packages/game-engine/src/debug.ts`.
  - API: `debug` router.
  - Web: `DebugPanel.tsx`.
- It must never be reachable in production. It is gated twice:
  - API: `debugProcedure` returns NOT_FOUND when `VERCEL_ENV=production` or `NODE_ENV=production`. `ENABLE_DEBUG=false` turns it off anywhere else.
  - Web: `__DEBUG_BUILD__` (set in `vite.config.ts`) is on in the dev server and off in `vite build` unless `VITE_ENABLE_DEBUG=true`, so production bundles don't contain the panel.
- Any new cheat or debug-only data must go through `debugProcedure` and the `__DEBUG_BUILD__` guard.
- Debug actions are logged ("Debug: …") and saved as `DEBUG` action rows. Anything that replays games from action rows must handle them.
- SET_HP has a minimum of 10; debug can't Knock Out a Pokémon directly.
