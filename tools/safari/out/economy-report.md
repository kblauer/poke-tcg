# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 56.0 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 612 of 1000 (61.2%).**
- **Banked by a won run: ₱3,682 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,181, a quarter over ₱4,199.
- A lost run banks nothing; it ended holding ₱958 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 4% of its cards): of the runs alive at battle 10, 88% held a Stage 2 or golden copy by then; the first came by battle 7 (median, of the 876 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 4.84 | 93% |
| medium | 6.94 | 84% |
| hard | 1.87 | 64% |
| gymLeader | 0.00 | 0% |
| champion | 1.12 | 55% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,682 | ₱958 |
| ₱ earned in battles | ₱8,247 | ₱4,208 |
| ₱ spent on cards | ₱5,114 | ₱3,264 |
| ₱ got back selling | ₱1,877 | ₱1,034 |
| ₱ spent on the shop tier | ₱1,289 | ₱1,123 |
| ₱ spent on rerolls | ₱339 | ₱198 |
| Battles lost | 1.1 | 3.0 |
| Draws | 0.8 | 0.8 |
| Tries at the Champion | 1.4 | 0.6 |
| Shop tier at the end | 5.0 | 4.6 |
| Cards bought | 39.8 | 28.9 |
| Cards sold | 21.6 | 13.7 |
| Merges | 6.6 | 4.6 |
| Golden copies | 0.8 | 0.4 |
| Rerolls paid for | 17.1 | 10.0 |
| Encounters taken | 4.9 | 3.5 |
