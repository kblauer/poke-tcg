# Safari Draft: the economy report

1000 runs by the buying bot (packages/safari/src/economy.ts), 12.3 s. The draft's numbers are `DRAFT`'s (packages/safari/src/draft.ts): start ₱300, cards ₱60 / ₱90 / ₱120 / ₱160 / ₱200, sold for 75%, rerolls ₱20, shop tiers ₱200 / ₱300 / ₱400 / ₱500 less ₱20 a battle.

**The opponents are a stand-in until step 3 builds them:** each battle offers one of each difficulty (paying ₱450 / ₱550 / ₱700 / ₱850), a board of 6 random units of a tier that rises through the run (medium: 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5; easy a tier lower, hard one higher, a gym leader two), and the Champion a top-tier board with Defender. The bot takes the hardest a tier below its board's average (a tier beats the one below 93–95% of the time), or the easiest. So these numbers say whether the ₱ flow fits the target, not how hard a run will be.

## Runs

- **Won: 274 of 1000 (27.4%).**
- **Banked by a won run: ₱3,929 on average** (the target: about ₱3,000–5,000); a quarter bank under ₱3,389, a quarter over ₱4,469.
- A lost run banks nothing; it ended holding ₱534 on average.

| | Won runs | Lost runs |
|---|---|---|
| ₱ held at the end | ₱3,929 | ₱534 |
| ₱ earned in battles | ₱8,156 | ₱1,552 |
| ₱ spent on cards | ₱4,935 | ₱1,316 |
| ₱ got back selling | ₱1,961 | ₱415 |
| ₱ spent on the shop tier | ₱1,276 | ₱341 |
| ₱ spent on rerolls | ₱276 | ₱76 |
| Battles lost | 1.2 | 3.0 |
| Draws | 0.8 | 0.4 |
| Tries at the Champion | 1.8 | 0.4 |
| Shop tier at the end | 5.0 | 2.1 |
| Cards bought | 38.3 | 12.5 |
| Cards sold | 24.4 | 5.4 |
| Merges | 2.9 | 0.9 |
| Golden copies | 0.0 | 0.0 |
| Rerolls paid for | 14.0 | 3.9 |
