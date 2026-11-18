# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 98.6 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 737 of 1000 (73.7%).**
- **Banked by a won run: ₱3,749 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,195, a quarter over ₱4,279.
- A lost run banks nothing; it ended holding ₱938 on average.
- **Merges** (the shop favours cards held, `DRAFT.favour` 4% of its cards): of the runs alive at battle 10, 87% held a Stage 2 or golden copy by then; the first came by battle 7 (median, of the 914 runs that made one).

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 5.10 | 95% |
| medium | 7.08 | 87% |
| hard | 1.95 | 69% |
| gymLeader | 0.00 | 0% |
| champion | 1.24 | 60% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,749 | ₱938 |
| ₱ earned in battles | ₱8,333 | ₱4,159 |
| ₱ spent on cards | ₱5,140 | ₱3,264 |
| ₱ got back selling | ₱1,889 | ₱1,045 |
| ₱ spent on the shop tier | ₱1,289 | ₱1,106 |
| ₱ spent on rerolls | ₱345 | ₱196 |
| Battles lost | 0.9 | 3.0 |
| Draws | 0.9 | 0.7 |
| Tries at the Champion | 1.5 | 0.5 |
| Shop tier at the end | 5.0 | 4.6 |
| Cards bought | 39.9 | 28.9 |
| Cards sold | 21.7 | 13.8 |
| Merges | 6.5 | 4.4 |
| Golden copies | 0.9 | 0.4 |
| Rerolls paid for | 17.2 | 9.8 |
| Encounters taken | 4.9 | 3.5 |
