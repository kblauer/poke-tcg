// Safari Draft (issue #239, section 10): the economy report. A simple buying bot plays whole runs through the draft
// (packages/safari/src/economy.ts) against stand-in opponents and writes tools/safari/out/economy-report.md: what the
// runs bank against the issue's target (an average run banking about ₱3,000–5,000), and where their ₱ came from and went.
// Run from the repo's root: npx tsx tools/safari/economy.ts          (RUNS=2000 for less noise; the default is 1000)
import { mkdirSync, writeFileSync } from 'node:fs';
import { DRAFT } from '../../packages/safari/src/draft.ts';
import { botRuns, STANDIN_PAY, STANDIN_TIERS, type BotRun } from '../../packages/safari/src/economy.ts';
import { gen1Units } from '../../packages/safari/src/gen1.ts';

const RUNS = Number(process.env.RUNS ?? 1000);
const t0 = Date.now();
const runs = botRuns(gen1Units(), RUNS, 1);
const won = runs.filter((r) => r.won);
const lost = runs.filter((r) => !r.won);
const mean = (rs: BotRun[], f: (r: BotRun) => number) => (rs.length ? rs.reduce((s, r) => s + f(r), 0) / rs.length : 0);
const pd = (n: number) => `₱${Math.round(n).toLocaleString('en-US')}`;
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] ?? 0;
const banked = won.map((r) => r.banked);

const rows: [string, (r: BotRun) => number, boolean][] = [
  ['₱ held at the end', (r) => r.pokedollars, true],
  ['₱ earned in battles', (r) => r.earned, true],
  ['₱ spent on cards', (r) => r.onCards, true],
  ['₱ got back selling', (r) => r.fromSales, true],
  ['₱ spent on the shop tier', (r) => r.onTiers, true],
  ['₱ spent on rerolls', (r) => r.onRerolls, true],
  ['Battles lost', (r) => r.battlesLost, false],
  ['Draws', (r) => r.draws, false],
  ['Tries at the Champion', (r) => r.championTries, false],
  ['Shop tier at the end', (r) => r.shopTier, false],
  ['Cards bought', (r) => r.bought, false],
  ['Cards sold', (r) => r.sold, false],
  ['Merges', (r) => r.merges, false],
  ['Golden copies', (r) => r.goldens, false],
  ['Rerolls paid for', (r) => r.rerolls, false],
];

const report = `# Safari Draft: the economy report

${RUNS} runs by the buying bot (packages/safari/src/economy.ts), ${((Date.now() - t0) / 1000).toFixed(1)} s. The draft's numbers are \`DRAFT\`'s (packages/safari/src/draft.ts): start ${pd(DRAFT.startPokedollars)}, cards ${DRAFT.cardPrice.map(pd).join(' / ')}, sold for ${DRAFT.sellShare * 100}%, rerolls ${pd(DRAFT.reroll)}, shop tiers ${DRAFT.tierPrice.map(pd).join(' / ')} less ${pd(DRAFT.tierDiscount)} a battle.

**The opponents are a stand-in until step 3 builds them:** each battle offers one of each difficulty (paying ${STANDIN_PAY.map(pd).join(' / ')}), a board of 6 random units of a tier that rises through the run (medium: ${STANDIN_TIERS.join(', ')}; easy a tier lower, hard one higher, a gym leader two), and the Champion a top-tier board with Defender. The bot takes the hardest a tier below its board's average (a tier beats the one below 93–95% of the time), or the easiest. So these numbers say whether the ₱ flow fits the target, not how hard a run will be.

## Runs

- **Won: ${won.length} of ${RUNS} (${((100 * won.length) / RUNS).toFixed(1)}%).**
- **Banked by a won run: ${pd(mean(won, (r) => r.banked))} on average** (the target: about ₱3,000–5,000); a quarter bank under ${pd(quantile(banked, 0.25))}, a quarter over ${pd(quantile(banked, 0.75))}.
- A lost run banks nothing; it ended holding ${pd(mean(lost, (r) => r.pokedollars))} on average.

| | Won runs | Lost runs |
|---|---|---|
${rows.map(([label, f, money]) => `| ${label} | ${money ? pd(mean(won, f)) : mean(won, f).toFixed(1)} | ${money ? pd(mean(lost, f)) : mean(lost, f).toFixed(1)} |`).join('\n')}
`;

mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/economy-report.md', import.meta.url), report);
console.log(report);
