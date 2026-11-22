# Safari Draft: the economy report

2000 runs by the buying bot (packages/safari/src/economy.ts), 111.1 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱450 / ₱600 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 1278 of 2000 (63.9%).**
- **Banked by a won run: ₱3,616 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,132, a quarter over ₱4,028.
- A lost run banks nothing; it ended holding ₱2,188 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 4% of its cards): of the runs alive at battle 10, 92% held a Stage 2 or golden copy by then; the first came by battle 6 (median, of the 1960 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 3.09 | 97% |
| medium | 10.05 | 85% |
| hard | 1.49 | 64% |
| gymLeader | 0.00 | –% |
| champion | 0.98 | 65% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,616 | ₱2,188 |
| ₱ earned in battles | ₱9,067 | ₱6,836 |
| ₱ spent on cards | ₱6,217 | ₱5,216 |
| ₱ got back selling | ₱2,280 | ₱1,967 |
| ₱ spent on the shop tier | ₱1,422 | ₱1,373 |
| ₱ spent on rerolls | ₱392 | ₱327 |
| Battles lost | 1.1 | 3.0 |
| Draws | 0.8 | 0.5 |
| Tries at the Champion | 1.3 | 0.4 |
| Shop tier at the end | 5.0 | 4.9 |
| Cards bought | 46.7 | 41.7 |
| Cards sold | 27.4 | 24.8 |
| Merges | 3.3 | 3.1 |
| Golden copies | 2.9 | 1.8 |
| Rerolls paid for | 17.9 | 15.0 |
| Encounters taken | 4.9 | 4.3 |
