// Safari Draft's balance report (issue #254; README: Safari Draft, The redesign): plays the units against each other and
// writes tools/safari/out/balance-report.md and balance-units.csv: how battles go, each unit's win rate on random boards
// of its tier, the tiers as a ladder, what each type synergy and Trainer is worth, and the units furthest from their
// tier's mean, which is what species.ts's rows are tuned by.
//
//   npx tsx tools/safari/balance.ts            (BATTLES=3000 a tier by default; BATTLES=10000 for a steadier report)
import { mkdirSync, writeFileSync } from 'node:fs';
import { effectLift, lift, synergyLift, tierLadder, trainerLift, unitRates, winRate } from '../../packages/safari/src/balance.ts';
import { SYNERGIES, SYNERGY_TYPES, TRAINERS, TRAINER_NAMES, TUNING } from '../../packages/safari/src/effects.ts';
import { allUnits } from '../../packages/safari/src/species.ts';
import { KEYWORD_NAMES, TOP_TIER, abilityName, type Unit } from '../../packages/safari/src/units.ts';

const BATTLES = Number(process.env.BATTLES ?? 3000);
const units = allUnits();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pp = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}`;

let seed = 1;
const rates = unitRates(units, BATTLES, seed++, TUNING.risingFrom);
const ladder = tierLadder(units, BATTLES, seed++);
const synergies = SYNERGY_TYPES.map((type) => ({ type, lifts: [2, 4, 6].map((count) => synergyLift(units, type, count, BATTLES, seed++)) }));
const trainers = TRAINER_NAMES.filter((t) => t !== 'Bill' && t !== 'Professor Oak').map((t) => ({ t, lift: trainerLift(units, t, 3, BATTLES, seed++) }));
const keywords = KEYWORD_NAMES.map((k) => {
  const carriers = units.filter((u) => u.abilities.some((a) => a.k === k));
  return { k, carriers: carriers.length, lift: effectLift(units, carriers, (u) => ({ ...u, abilities: u.abilities.filter((a) => a.k !== k) }), BATTLES, seed++) };
});

interface Ranked {
  u: Unit;
  rate: number;
  games: number;
}
const ranked: Ranked[] = units.map((u) => ({ u, rate: winRate(rates.units.get(u.id)!), games: rates.units.get(u.id)!.games })).sort((a, b) => b.rate - a.rate);
const words = (u: Unit) => u.abilities.map(abilityName).join('; ');
const unitLine = ({ u, rate }: Ranked) => `| ${u.dex} | ${u.name} | ${u.tier} | ${u.type} | ${u.attack} | ${u.hp} | ${words(u)} | ${pct(rate)} |`;
const byGroup = (key: (u: Unit) => string) => {
  const groups = new Map<string, Ranked[]>();
  for (const r of ranked) groups.set(key(r.u), [...(groups.get(key(r.u)) ?? []), r]);
  return [...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([k, rs]) => `| ${k} | ${rs.length} | ${pct(rs.reduce((s, r) => s + r.rate, 0) / rs.length)} |`);
};
const tierOf = (t: number) => ranked.filter((r) => r.u.tier === t);

const report = `# Safari Draft: balance report

${units.length} units, ${BATTLES} battles a measurement. A unit's rate is how often a random board of its tier holding it wins (50% is the tier's mean).

## Battles

| Tier | Units | Draws | First attacker wins | Rounds | Reached rising damage |
|---|---|---|---|---|---|
${rates.tiers.map((t) => `| ${t.tier} | ${tierOf(t.tier).length} | ${pct(t.draws / t.battles)} | ${pct(t.firstWins / (t.battles - t.draws))} | ${(t.rounds / t.battles).toFixed(1)} | ${pct(t.rising / t.battles)} |`).join('\n')}

A board of a tier against one of the tier below wins: ${ladder.map((t, i) => `tier ${i + 2} ${pct(winRate(t))}`).join(', ')}.

## Type synergies

What having 2, 4 or 6 of the type is worth (the same battles with the synergy and without).

| Type | Synergy | 2 | 4 | 6 |
|---|---|---|---|---|
${synergies.map(({ type, lifts }) => `| ${type} | ${SYNERGIES[type].name} | ${lifts.map((l) => (l.with.games ? pp(lift(l)) : '')).join(' | ')} |`).join('\n')}

## Trainers

| Trainer | Worth | |
|---|---|---|
${trainers.map(({ t, lift: l }) => `| ${t} | ${pp(lift(l))} | ${TRAINERS[t]} |`).join('\n')}

## Keywords

What a keyword is worth to the units that have it: the same battles with it and with it taken off (one such unit on a random board of its tier).

| Keyword | Units | Worth |
|---|---|---|
${keywords.map(({ k, carriers, lift: l }) => `| ${k} | ${carriers} | ${carriers ? pp(lift(l)) : ''} |`).join('\n')}

## By type and stage

| Type | Units | Mean rate |
|---|---|---|
${byGroup((u) => u.type).join('\n')}

| Stage | Units | Mean rate |
|---|---|---|
${byGroup((u) => u.stage).join('\n')}

## The units furthest from their tier's mean

${Array.from({ length: TOP_TIER }, (_, i) => i + 1)
  .map((t) => {
    const rs = tierOf(t);
    return `### Tier ${t}\n\n| # | Name | Tier | Type | Attack | HP | Keywords | Rate |\n|---|---|---|---|---|---|---|---|\n${[...rs.slice(0, 8), ...rs.slice(-8)].map(unitLine).join('\n')}`;
  })
  .join('\n\n')}
`;

const out = new URL('out/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('balance-report.md', out), report);
writeFileSync(new URL('balance-units.csv', out), ['dex,name,tier,stage,type,attack,hp,keywords,games,winRate', ...ranked.map(({ u, rate, games }) => [u.dex, `"${u.name}"`, u.tier, u.stage, u.type, u.attack, u.hp, `"${words(u)}"`, games, rate.toFixed(4)].join(','))].join('\n') + '\n');
console.log(`Wrote tools/safari/out/balance-report.md (${units.length} units, ${BATTLES} battles a measurement).`);
