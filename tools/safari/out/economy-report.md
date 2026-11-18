# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 62.2 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 267 of 1000 (26.7%).**
- **Banked by a won run: ₱3,596 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,055, a quarter over ₱4,130.
- A lost run banks nothing; it ended holding ₱445 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 4% of its cards): of the runs alive at battle 10, 83% held a Stage 2 or golden copy by then; the first came by battle 7 (median, of the 504 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 4.02 | 72% |
| medium | 4.21 | 71% |
| hard | 0.96 | 54% |
| gymLeader | 0.00 | 25% |
| champion | 0.58 | 46% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,596 | ₱445 |
| ₱ earned in battles | ₱8,134 | ₱1,929 |
| ₱ spent on cards | ₱5,111 | ₱1,608 |
| ₱ got back selling | ₱1,882 | ₱453 |
| ₱ spent on the shop tier | ₱1,278 | ₱534 |
| ₱ spent on rerolls | ₱331 | ₱95 |
| Battles lost | 1.2 | 3.0 |
| Draws | 0.9 | 0.5 |
| Tries at the Champion | 1.5 | 0.2 |
| Shop tier at the end | 5.0 | 2.8 |
| Cards bought | 39.8 | 15.7 |
| Cards sold | 21.6 | 6.0 |
| Merges | 6.3 | 2.6 |
| Golden copies | 1.0 | 0.1 |
| Rerolls paid for | 16.7 | 4.8 |
| Encounters taken | 4.9 | 2.1 |
