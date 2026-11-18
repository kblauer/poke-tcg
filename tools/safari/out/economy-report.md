# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 43.4 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are the draft's** (packages/safari/src/opponents.ts): 1–3 a step, paying easy ₱450, medium ₱550, hard ₱700, gymLeader ₱850, champion ₱1,000; boards around a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy -1, hard +1, a gym leader +2, about 25% of steps); Blue's FireRed team with Defender. The bot sees what a player sees (difficulty and pay, never the boards) and takes the hardest whose tier by the curve is below its board's average, or the easiest offered.

## Runs

- **Won: 120 of 1000 (12.0%).**
- **Banked by a won run: ₱3,591 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱2,941, a quarter over ₱4,186.
- A lost run banks nothing; it ended holding ₱466 on average.

| Opponent | Fought (a run) | Won |
|---|---|---|
| easy | 4.24 | 65% |
| medium | 3.03 | 64% |
| hard | 0.58 | 36% |
| gymLeader | 0.00 | –% |
| champion | 0.45 | 27% |

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,591 | ₱466 |
| ₱ earned in battles | ₱7,852 | ₱1,848 |
| ₱ spent on cards | ₱4,992 | ₱1,567 |
| ₱ got back selling | ₱1,983 | ₱472 |
| ₱ spent on the shop tier | ₱1,278 | ₱503 |
| ₱ spent on rerolls | ₱276 | ₱84 |
| Battles lost | 1.2 | 3.0 |
| Draws | 1.2 | 0.4 |
| Tries at the Champion | 1.7 | 0.3 |
| Shop tier at the end | 5.0 | 2.7 |
| Cards bought | 38.7 | 15.1 |
| Cards sold | 24.4 | 6.5 |
| Merges | 3.1 | 1.2 |
| Golden copies | 0.1 | 0.0 |
| Rerolls paid for | 14.0 | 4.3 |
