# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 30.8 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 862 of 1000 (86.2%).**
- **Banked by a won run: ₱3,710 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,242, a quarter over ₱4,087.
- A lost run banks nothing; it ended holding ₱2,299 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 4% of its cards): of the runs alive at battle 10, 90% held a Stage 2 or golden copy by then; the first came by battle 6 (median, of the 983 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 5.90 | 98% |
| medium | 7.40 | 92% |
| hard | 1.54 | 70% |
| gymLeader | 0.00 | –% |
| champion | 1.18 | 73% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,710 | ₱2,299 |
| ₱ earned in battles | ₱8,869 | ₱6,624 |
| ₱ spent on cards | ₱5,926 | ₱4,824 |
| ₱ got back selling | ₱2,107 | ₱1,717 |
| ₱ spent on the shop tier | ₱1,289 | ₱1,234 |
| ₱ spent on rerolls | ₱351 | ₱284 |
| Battles lost | 0.7 | 3.0 |
| Draws | 0.4 | 0.4 |
| Tries at the Champion | 1.2 | 0.9 |
| Shop tier at the end | 5.0 | 4.9 |
| Cards bought | 44.6 | 38.8 |
| Cards sold | 25.6 | 22.1 |
| Merges | 3.4 | 3.1 |
| Golden copies | 2.8 | 1.7 |
| Rerolls paid for | 17.5 | 14.2 |
| Encounters taken | 4.9 | 4.0 |
