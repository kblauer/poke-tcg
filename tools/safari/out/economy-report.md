# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 54.4 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 825 of 1000 (82.5%).**
- **Banked by a won run: ₱3,683 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,194, a quarter over ₱4,124.
- A lost run banks nothing; it ended holding ₱2,688 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 4% of its cards): of the runs alive at battle 10, 88% held a Stage 2 or golden copy by then; the first came by battle 6 (median, of the 981 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 6.01 | 98% |
| medium | 7.35 | 92% |
| hard | 1.52 | 70% |
| gymLeader | 0.00 | –% |
| champion | 1.35 | 61% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,683 | ₱2,688 |
| ₱ earned in battles | ₱8,938 | ₱7,238 |
| ₱ spent on cards | ₱6,099 | ₱5,242 |
| ₱ got back selling | ₱2,184 | ₱1,942 |
| ₱ spent on the shop tier | ₱1,289 | ₱1,241 |
| ₱ spent on rerolls | ₱351 | ₱310 |
| Battles lost | 0.8 | 3.0 |
| Draws | 0.5 | 0.5 |
| Tries at the Champion | 1.4 | 1.3 |
| Shop tier at the end | 5.0 | 4.9 |
| Cards bought | 45.3 | 41.0 |
| Cards sold | 26.2 | 24.1 |
| Merges | 3.2 | 3.0 |
| Golden copies | 2.9 | 1.9 |
| Rerolls paid for | 17.6 | 15.5 |
| Encounters taken | 4.8 | 4.3 |
