# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 47.9 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 218 of 1000 (21.8%).**
- **Banked by a won run: ₱3,356 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱2,835, a quarter over ₱3,924.
- A lost run banks nothing; it ended holding ₱335 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 8% of its cards): of the runs alive at battle 10, 78% held a Stage 2 or golden copy by then; the first came by battle 8 (median, of the 433 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 3.70 | 69% |
| medium | 3.91 | 67% |
| hard | 0.84 | 48% |
| gymLeader | 0.00 | 0% |
| champion | 0.47 | 46% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,356 | ₱335 |
| ₱ earned in battles | ₱8,130 | ₱1,707 |
| ₱ spent on cards | ₱5,310 | ₱1,492 |
| ₱ got back selling | ₱1,789 | ₱371 |
| ₱ spent on the shop tier | ₱1,281 | ₱475 |
| ₱ spent on rerolls | ₱272 | ₱75 |
| Battles lost | 1.1 | 3.0 |
| Draws | 0.9 | 0.4 |
| Tries at the Champion | 1.5 | 0.2 |
| Shop tier at the end | 5.0 | 2.6 |
| Cards bought | 42.0 | 15.0 |
| Cards sold | 20.7 | 5.0 |
| Merges | 7.8 | 2.6 |
| Golden copies | 1.2 | 0.2 |
| Rerolls paid for | 13.7 | 3.9 |
