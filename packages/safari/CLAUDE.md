# Safari Draft — notes for Claude

A 1v1 auto-battler (Hearthstone Battlegrounds' way) in the Play tab. This file is the mode's design as it stands; the root CLAUDE.md's Safari Draft bullet is its history, issue #254 the redesign's record, #239 the first spec. Where they disagree, this file and the code win.

## The design philosophy (the user's, 2026-11-21 and 2026-11-22)
- A shop's choice must be more than a type. Cards differ a lot from each other (high variance), while a tier stays balanced overall. Don't make everything play the same.
- Where a Pokémon stands matters: its **neighbours** (the Pokémon beside it in its line), the Pokémon **across** from it (the opponent's in the same place, counted from the left), the **first** and **last** of a line. Keywords, type synergies, Trainer cards and the opponents' boards are all built on this.
- One unit a Pokémon species, no prints or variants. Nothing of a unit comes from a TCG card.
- Keywords are few on a card: most cards have 1, fewer than 40% have 2, and 3 is for a select few (6 legendaries now). 3 keywords complicate the game greatly: don't add more such cards without the user's say-so. An upgrade never makes a third (`MAX_KEYWORDS` = 2).
- Special Conditions: only Paralyzed (misses its next attack, no strike back until then), Confused (its attacks flip a coin: tails, 30 to itself, and it ends) and Burned (attack halved, rounded up to 10, until it has made its next attack, its strikes back too).
- Anything marked "mine" below is Claude's first draft, to check with the user. Ask before changing what's the user's.

## Units (`src/species.ts`, `src/units.ts`)
- Pokédex #1–386 (Gen 1–3), one hand-written row each: number, name, type (the TCG's nine), tier 1–5, attack, HP, keywords, what it evolves from (the games' lines). A unit's id is its Pokédex number as a string. Never derive a row from anything.
- 21 legendaries are encounter rewards, never in a shop. An evolved unit is at least a tier above what it evolves from; tiers 4 and 5 keep Basics and Stage 1s so their shops have cards (a 3-stage line's last Pokémon is never in a shop).
- No two cards of a tier are the same card (`units.test.ts`). Some are meant to be weak (Magikarp and Feebas: two make a tier-5 Pokémon).
- Tune rows with `npx tsx tools/safari/balance.ts` from the repo's root (`BATTLES=5000`, about 20 s): it writes `tools/safari/out/balance-report.md` and `balance-units.csv`. Nearly every unit should win 38–62% on random boards of its tier. The harness places boards at random, so keywords that read a place (Taunt, Face-off, Bodyguard, Whirlwind, Flying) measure near nothing: cost them by hand.

## Keywords by generation (`KEYWORDS_BY_GENERATION`; the split and themes mine)
The user's (2026-11-22): the 64 keywords are a whole game's, split over the nine generations. Only the generations in play (`GENERATIONS_IN_PLAY` = 3, 30 keywords) may be on a unit, an upgrade or anything else in the game (`units.test.ts`). The other 34 stay written and tested in `effects.ts`/`battle.ts`/`battle.test.ts` and wait for their generation's Pokémon: adding a generation means raising `GENERATIONS_IN_PLAY` and adding its rows. Any Pokémon in play may have any keyword in play.

| Gen | Theme | Keywords |
|---|---|---|
| 1 | The basics, after Red and Blue's moves | Taunt, Shield, Quick, Flying, Splash, Rally, Face-off, Explode, Whirlwind, Paralyze, Confuse, Burn, Transform, Pay Day |
| 2 | Gold and Silver: Steel, Dark, breeding, held items | Armor, Finisher, Baton Pass, Safeguard, Sketch, Destiny Bond, Family, Regen |
| 3 | Ruby and Sapphire's Abilities, Follow Me | Intimidate, Sturdy, Truant, Static, Flame Body, Cute Charm, Thorns, Bodyguard |
| 4 | U-turn, Stealth Rock, Sniper, Reckless, Skill Link, Mold Breaker | U-turn, Barrage, Sniper, Recoil, Double Strike, Breaker |
| 5 | Triple battles' neighbours, Moxie, Justified, Speed Boost | Guardian, Mend, Screen, Rampage, Enrage, Grow |
| 6 | Hordes, Mega Evolution, the type chart redrawn | Pack, Leader, Fortify, Bane, Cleave, Drain |
| 7 | What a faint leaves behind, Ultra Beasts, Z-Moves | Legacy, Scavenger, Memento, Weaken, Loner, Trample |
| 8 | Intrepid Sword, Dauntless Shield, Unseen Fist, Body Press | Vanguard, Rearguard, Reach, Counter, Roar |
| 9 | The first move on the Pokémon across | Pounce, Glare, Supersonic, Will-O-Wisp, Evasive |

Each keyword's words are its `text` in `effects.ts`'s `KEYWORDS`. A new keyword needs its generation, its words, a hook or its place in `battle.ts`, and a test in `battle.test.ts` (which fails on a keyword with none).

## Battle (`src/battle.ts`: its header lists every fine rule)
- 6 a side, a coin flip for who attacks first, sides alternating, each attacking left to right; damage is simultaneous; rising damage from round 10 ends every battle (the user's).
- Start, in order: synergies counted; Transform and Sketch; the Trainers that read places and the synergies; the keywords' start-of-battle changes; the Energy Removals; start-of-battle damage; then the attacks before the normal order (Lightning's Quick, the keyword Quick), not struck back.
- A target: Gust of Wind first; then a Taunt Pokémon (not for Flying); then the attacker's own aim (Face-off, Fighting's Duel: the Pokémon across), else random; then a Bodyguard beside the target takes it.
- A round also ends once each side has had a turn for each of its Pokémon (Whirlwind kept battles from ending).

## Type synergies (`SYNERGIES`, numbers in `TUNING`; mine), at 2 / 4 / 6 of a type
Leech (Grass heal 10 as they hit), Blaze (Fire's hits Burn; the Burned take 10/10/20 more), Current (Water +10/10/20 HP for each Water neighbour), Quick (the leftmost 1/3/6 Lightning attack first), Pressure (the Pokémon across from each Psychic has −10 attack), Duel (Fighting attack the Pokémon across for +10), Versatile (Colorless +10 HP for each other type, ×1/1/2), Prey (Darkness +20/20/40 to the damaged or afflicted), Plating (Metal's neighbours take 10/10/20 less).

## Trainer cards (`TRAINERS`; redesigned 2026-11-22, the cards mine)
One a battle, only from encounters. Most read places, as the keywords do. Worth +6 to +26 points of win rate each (the balance report).
- PlusPower: your first 2 Pokémon get +20 attack. Defender: your first and last Pokémon start with a Shield. Clefairy Doll (in Gambler's place): your last Pokémon has Taunt and +30 HP.
- Potion: the first to fall under half its HP heals 30, and so do its neighbours. Super Potion: when one of yours faints, its neighbours heal 20.
- Kept as they were: Full Heal, Revive, Pokémon Center, Gust of Wind, Energy Removal, Super Energy Removal, Scoop Up, Imposter Professor Oak, and the draft's Bill and Professor Oak.

## Opponents (`src/opponents.ts`; redesigned 2026-11-22, how is mine)
- The user's: the curve by battle (`MEDIUM_TIERS`; easy −1, hard +1, a gym leader +2), 1–3 offered a step, boards of 3/4/5 Pokémon in battles 1–3, a gym leader about 1 step in 4 and once a run, Blue's FireRed team after the 15 battles. Don't retune the curve without asking.
- A trainer's board is built round a type: `CORE_SIZE` of it (easy 2, medium 3, hard 4), one their class's favourites have, so it has a synergy the player can read from the type shown.
- Medium and hard trainers, gym leaders, Blue and a legendary's board place their Pokémon (`arrange`: the order that scores best by `placementScore`, which reads the line's own keywords and synergies and nothing of the player's board). An easy trainer's line is random. The player sees the line before the battle and can move their own to answer it.
- A gym leader plays their own team's Pokémon wherever the tier has one, with a Trainer that fits (`GYM_LEADERS`). Kanto's 8 only: the others have no battle sprite. Blue plays Defender.
- No easy opponent is offered after the 6th battle (`EASY_BATTLES`, the user's, 2026-11-22): a step then offers medium and hard only.
- Difficulty (the user's targets, 2026-11-22): the buying bot (`npx tsx tools/safari/economy.ts`, about 1 minute; `RUNS=2000` for less noise) should win about 70% of runs and beat Blue 60–65% of the time. Measured: 64% of runs, Blue 65%. The bot takes the hardest opponent whose curve tier is below its board's average, else the easiest, never a gym leader, and rerolls once a shop at most: a player who picks harder fights sees a harder game.

## The draft, encounters, API and screen
- `src/draft.ts` (`SafariState`, `applySafariAction`, the numbers in `DRAFT`), `src/encounters.ts` (upgrades, gifts, the special shop, a legendary's board; `UPGRADE_KEYWORDS` are keywords in play that work anywhere in a line), `src/view.ts` (what the browser gets: never the RNG, an unpicked opponent's board or the steps to come).
- The shop's prices (the user's, 2026-11-22; the numbers mine): the shop tiers cost ₱200 / ₱300 / ₱450 / ₱600 (dearer the higher, ₱20 cheaper for each battle since the last, never under half); a reroll costs ₱20, then ₱10 more for each one made in the same shop, starting again with the next shop (`DRAFT.rerollStep`, `Shop.rerolls`). Shop tier prices move the bot's run wins a lot: ₱250 / ₱400 / ₱600 / ₱800 took them from 69% to 48%.
- `RULES` (now 3) is saved on a run's state: a run of older rules is never shown or played, and is closed when a new one starts. Raise it whenever saved state could hold something that no longer exists (a Trainer card, a unit, a keyword's meaning).
- The package never reads the card catalog: the API gives each unit its picture (`apps/api/src/safari.ts`, `unitPictures`). The web imports only types and `@poke-tcg/safari/effects`' words.
- What a card shows (the user's, 2026-11-22; `apps/web/src/components/safari/keywordMarks.tsx`): a keyword that changes no number on the card is marked by how much a player needs to know it. `frame`: Taunt (stone outline), Shield (glass over the card and a shield on its artwork, while it's up), Bodyguard (dashed blue outline, an arrow to each neighbour). `badge`: an icon by the artwork (aim, tempo, fainting, Special Conditions; faded once used up). Number keywords (Armor 10, Splash 20) read from their words. A new keyword in play needs a row in `KEYWORD_MARKS` or a reason to have none. A right-click on a card opens it as the game has it (`UnitInspector.tsx`), never its TCG print.
- Rough and unchecked: the screen's changes since the redesign are checked by typecheck, build and tests only; the Darkness and Metal blank cards are rough.
