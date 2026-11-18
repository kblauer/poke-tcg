# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 103.1 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 800 of 1000 (80.0%).**
- **Banked by a won run: ₱4,454 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,915, a quarter over ₱4,883.
- A lost run banks nothing; it ended holding ₱2,349 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 4% of its cards): of the runs alive at battle 10, 93% held a Stage 2 or golden copy by then; the first came by battle 7 (median, of the 971 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 4.98 | 96% |
| medium | 7.34 | 88% |
| hard | 2.23 | 71% |
| gymLeader | 0.00 | 0% |
| champion | 1.27 | 63% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱4,454 | ₱2,349 |
| ₱ earned in battles | ₱9,094 | ₱6,250 |
| ₱ spent on cards | ₱5,228 | ₱4,167 |
| ₱ got back selling | ₱1,937 | ₱1,460 |
| ₱ spent on the shop tier | ₱1,292 | ₱1,229 |
| ₱ spent on rerolls | ₱356 | ₱265 |
| Battles lost | 0.9 | 3.0 |
| Draws | 0.9 | 0.7 |
| Tries at the Champion | 1.4 | 0.8 |
| Shop tier at the end | 5.0 | 4.9 |
| Cards bought | 40.5 | 35.0 |
| Cards sold | 22.2 | 18.6 |
| Merges | 6.5 | 5.3 |
| Golden copies | 0.9 | 0.5 |
| Rerolls paid for | 17.8 | 13.2 |
| Encounters taken | 4.9 | 3.8 |
