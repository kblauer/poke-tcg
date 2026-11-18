// Safari Draft (issue #238), a planning tool: no game code. Derives each Gen 1 card's draft unit from the snapshot, as the
// issue's proposals have it, and writes the table the user reviews:
//   - attack: the average damage a turn over 6 turns, alone, attaching 1 Energy a turn, starting with 1 Energy attached and
//     1 more for each stage (the user's: a Basic 1, a Stage 1 2, a Stage 2 3), never under 10;
//   - the pool: no word-for-word reprints, a card printed holo and not in one set once (the holo, the user's), no
//     Pokémon past #151 (the Wizards promos' Gen 2 Pokémon, the user's);
//   - HP: the printed HP;
//   - tier 1–5 from the derived stats and what the unit's keyword and power are worth (the user's, 2026-11-18, after the
//     balance pass: packages/safari's unitScore and its worth tables, the one thing this tool takes from the game code), a
//     slight pyramid (TIER_SHARES), an evolved card always above what it evolves from;
//   - keyword: one auto-battler effect, by the wording of its attacks (KEYWORDS, first match wins). Pokémon Powers are
//     never mapped here: each is listed for the user's ruling.
// Run from the repo's root: npx tsx tools/safari/unit_table.ts
// Writes tools/safari/out/gen1-units.csv (every unit) and gen1-report.md (the spread, the outliers, the open rulings).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Attack, PokemonCardDef } from '../../packages/game-engine/src/cards.ts';
import { BASE4_REPRINTS } from '../../packages/game-engine/src/effects/base4.ts';
import { LC_REPRINTS } from '../../packages/game-engine/src/effects/lc.ts';
import { TEST_POOL } from '../../packages/campaign/src/test-pool.ts';
import { unitScore, type Keyword } from '../../packages/safari/src/units.ts';

/** The formula's knobs (the user's, 2026-11-18: 1 Energy to start with and 1 more for each stage). */
const TURNS = 6;
const START_ENERGY = Number(process.env.START_ENERGY ?? 1);
const STAGE_ENERGY: Record<string, number> = { basic: 0, stage1: 1, stage2: 2 };
/** The share of the units in each tier, 1 to 5: slightly more at the bottom, a wide top tier (the user's). */
const TIER_SHARES = [0.25, 0.23, 0.2, 0.17, 0.15];

const round10 = (n: number) => Math.max(10, Math.round(n / 10) * 10);
const num = (s: string | undefined) => (s ? ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }[s.toLowerCase()] ?? Number(s)) : 0);

/** What one use of an attack is worth, with `energy` attached, and what using it costs. */
function attackValue(def: PokemonCardDef, a: Attack, energy: number) {
  const text = a.text ?? '';
  let damage = a.damage;
  const coins = /Flip (\d+|a|two|three|four) coins?\. This attack does (\d+) damage times the number of heads/i.exec(text);
  const untilTails = /Flip a coin until you get tails\. This attack does (\d+) damage times the number of heads/i.exec(text);
  const extraEnergy = /plus (\d+) more damage for each .*?Energy attached to .*? but not used to pay/i.exec(text);
  const coinPlus = /Flip a coin\. If heads, this attack does (\d+) damage plus (\d+) more damage/i.exec(text);
  const perEnergy = /Flip a number of coins equal to the (?:total )?number of .*?Energy cards? (?:attached|you discarded)[^.]*\. This attack does (\d+) damage times the number of heads/i.exec(text);
  const birthday = /If it's not your birthday, this attack does (d+) damage/i.exec(text);
  if (birthday) damage = Number(birthday[1]); // it's never the player's birthday (the user's)
  else if (perEnergy) damage = (energy * Number(perEnergy[1])) / 2;
  else if (coins) damage = (num(coins[1]) * Number(coins[2])) / 2;
  else if (untilTails) damage = Number(untilTails[1]);
  else if (extraEnergy) damage += Math.min(Math.max(energy - a.cost.length, 0), 2) * Number(extraEnergy[1]);
  else if (coinPlus) damage = Number(coinPlus[1]) + Number(coinPlus[2]) / 2;
  else if (/damage counter on (?!the Defending)/i.test(text) && /[×x+]/.test(a.damageText ?? '')) damage = a.damage * (/×|x/.test(a.damageText ?? '') ? def.hp / 20 : 1) + (/\+/.test(a.damageText ?? '') ? def.hp / 20 : 0);
  else if (/×|x$/.test(a.damageText ?? '')) damage = a.damage * 2; // any other "×": a typical 2
  else if (/\+$/.test(a.damageText ?? '')) damage = a.damage + 10; // any other "+": a typical 10 more
  if (/If tails, this attack does nothing/i.test(text)) damage /= 2;
  if (/If 1 or both of them are tails, this attack does nothing/i.test(text)) damage /= 4;
  // Damage to itself: half its worth off, a quarter when a flip decides it.
  const self = /does (\d+) damage to (?:itself|[A-Z][\w'’.♀♂ -]*?)(?=[.,]| and)/.exec(text.replace(/to (the Defending|each|your opponent)[^.]*/gi, ''));
  if (self && /to itself|damage to [A-Z]/.test(self[0]) && !/Benched/.test(self[0])) damage -= Number(self[1]) * (/If tails[^.]*damage to/i.test(text) ? 0.25 : 0.5);
  const discard = /Discard (\d+|a|an|one|two|all)(?: of the)? .*?Energy cards? attached to (?!the Defending)/i.exec(text);
  const discards = perEnergy && /Discard a number of Energy/i.test(text) ? Math.ceil(energy / 2) : discard ? (discard[1]!.toLowerCase() === 'all' ? energy : num(discard[1])) : 0;
  const rests = /can't attack during your next turn/i.test(text);
  return { damage: Math.max(damage, 0), discards, rests };
}

/** The 6 turns: each turn 1 Energy more, then the payable attack worth the most. */
function derivedAttack(def: PokemonCardDef) {
  let energy = START_ENERGY + (STAGE_ENERGY[def.stage] ?? 0);
  let total = 0;
  let resting = false;
  for (let turn = 0; turn < TURNS; turn++) {
    energy++;
    if (resting) {
      resting = false;
      continue;
    }
    const best = def.attacks
      .filter((a) => a.cost.length <= energy)
      .map((a) => attackValue(def, a, energy))
      .sort((x, y) => y.damage - x.damage)[0];
    if (!best) continue;
    total += best.damage;
    energy -= best.discards;
    resting = best.rests;
  }
  return total / TURNS;
}

/**
 * The proposed keywords an attack's wording maps to, first match first. Each is one auto-battler effect; the user approves
 * the list and what each does (the issue has the table).
 */
const KEYWORDS: [keyword: string, wording: RegExp][] = [
  ['Explode', /damage to itself[^.]*\.[^.]*Bench|Selfdestruct|Explosion/i],
  ['Destiny Bond', /Destiny Bond|Knocked Out during your opponent's next turn/i],
  ['Toxic', /takes 20 Poison damage/i],
  ['Poison', /Poisoned/i],
  ['Paralyze', /Paralyzed/i],
  ['Sleep', /Asleep/i],
  ['Confuse', /Confused/i],
  ['Drain', /Remove (?:a number of |\d+ |all )?damage counters? from (?!the Defending|1 of your)/i],
  ['Mend', /Remove .*?damage counters? from (?:1|each) of your/i],
  ['Guard', /prevent all (?:effects of attacks, including )?damage done to|Prevent all damage/i],
  ['Harden', /damage done to .*? is reduced|whenever \d+ or less damage is done/i],
  ['Blind', /tries to attack[^.]*flips? a coin|If tails, that attack does nothing/i],
  ['Weaken', /attacks? .*?(?:do|does) \d+ less damage|can't (?:use that attack|attack)(?! during your next)/i],
  ['Splash', /damage to each (?:of your opponent's )?Benched|to each Pokémon on each player's Bench|1 of your opponent's Benched Pokémon/i],
  ['Unburden', /Discard \d+ .*?Energy cards? attached to the Defending|choose 1 Energy card attached to the Defending/i],
  ['Whirlwind', /switch(?:es)? (?:it|the Defending Pokémon) with|your opponent switches/i],
  ['Family', /Search your deck for .*?put (?:it|them) onto your Bench/i],
  ['Copycat', /Metronome|Mirror Move|copies? (?:that|1 of the Defending)/i],
  ['Enrage', /for each damage counter on (?!the Defending)/i],
  ['Finisher', /for each damage counter on the Defending|If the Defending Pokémon (?:already )?has/i],
  ['Charge', /during your next turn[^.]*(?:base damage|does? \d+ damage instead|double)/i],
  ['Flurry', /times the number of heads/i],
  ['Recoil', /does \d+ damage to itself/i],
  ['Pay Day', /draw (?:a|\d+) cards?/i],
];

function keywordOf(def: PokemonCardDef) {
  for (const [keyword, wording] of KEYWORDS) {
    const from = def.attacks.find((a) => wording.test(`${a.name}. ${a.text ?? ''}`));
    if (from) return { keyword, from: from.name };
  }
  return { keyword: '', from: '' };
}

const reprints = new Set([...Object.keys(BASE4_REPRINTS), ...Object.keys(LC_REPRINTS)]);
const snapshot = JSON.parse(readFileSync(new URL('../../packages/db/prisma/data/tcgdex-wotc.json', import.meta.url), 'utf8')) as { cards: { id: string; dexId?: number[] | null }[] };
const dex = new Map(snapshot.cards.map((c) => [c.id, c.dexId ?? []]));
const pokemon = TEST_POOL.map((c) => c.def)
  .filter((d): d is PokemonCardDef => d.kind === 'pokemon' && !reprints.has(d.id) && d.hp > 0 && !d.trainerText) // not Clefairy Doll or the Fossil
  .filter((d) => !dex.get(d.id)!.some((n) => n > 151));
// A card printed twice in its set, holo and not, is one unit: the holo.
const print = (d: PokemonCardDef) => JSON.stringify([d.id.split('-')[0], d.name, d.hp, d.attacks, d.power]);
const holos = new Set(pokemon.filter((d) => d.holo).map(print));
const defs = pokemon.filter((d) => d.holo || !holos.has(print(d)));
const noDex = defs.filter((d) => !dex.get(d.id)!.length);

interface Unit {
  def: PokemonCardDef;
  raw: number;
  attack: number;
  hp: number;
  score: number;
  tier: number;
  keyword: string;
  from: string;
  flags: string[];
}
const units: Unit[] = defs.map((def) => {
  const raw = derivedAttack(def);
  const attack = round10(raw);
  return { def, raw, attack, hp: def.hp, score: 0, tier: 0, flags: [], ...keywordOf(def) };
});
// A unit's worth in a fight is about what it deals times how long it lasts, raised by what its effects are worth.
const scoreOf = (u: Unit) => unitScore({ attack: u.attack, hp: u.hp, keyword: (u.keyword || undefined) as Keyword | undefined, power: u.def.power?.name });

// The evolution floor (the user's, 2026-11-18): an evolved unit's attack and HP together are at least 10 more than every
// print it evolves from, its attack raised to get there. Stage 1s first, so a Stage 2 stands on the raised ones.
const printsBelow = (u: Unit) => units.filter((p) => p.def.name === u.def.evolvesFrom || u.def.alsoEvolvesFrom?.includes(p.def.name));
for (const stage of ['stage1', 'stage2']) {
  for (const u of units.filter((x) => x.def.stage === stage)) {
    const need = 10 + Math.max(0, ...printsBelow(u).map((p) => p.attack + p.hp));
    if (!printsBelow(u).length || u.attack + u.hp >= need) continue;
    u.flags.push(`attack raised from ${u.attack} by the evolution floor`);
    u.attack = need - u.hp;
  }
}
for (const u of units) u.score = scoreOf(u);

// Tiers: fifths of the score, then an evolved card at least one above every print it evolves from (the user's, 1c). A card
// that evolves leaves room above it (a Basic of a 3-stage line at most 3).
const sorted = [...units].sort((a, b) => a.score - b.score);
const tierEnds = TIER_SHARES.map((_, t) => TIER_SHARES.slice(0, t + 1).reduce((a, b) => a + b, 0) * sorted.length);
sorted.forEach((u, i) => (u.tier = 1 + tierEnds.findIndex((end) => i < end)));
const evolvesInto = (name: string) => units.filter((u) => u.def.evolvesFrom === name || u.def.alsoEvolvesFrom?.includes(name));
const stagesAbove = (name: string): number => Math.max(0, ...evolvesInto(name).map((u) => 1 + stagesAbove(u.def.name)));
for (const u of units) u.tier = Math.min(u.tier, 5 - stagesAbove(u.def.name));
for (const stage of ['stage1', 'stage2']) {
  for (const u of units.filter((x) => x.def.stage === stage)) {
    u.tier = Math.max(u.tier, 1 + Math.max(0, ...printsBelow(u).map((p) => p.tier)));
  }
}

// Outliers: each stage's cards of an HP band against each other.
const band = (hp: number) => (hp <= 40 ? '≤40' : hp <= 60 ? '50–60' : hp <= 80 ? '70–80' : '90+');
const groups = new Map<string, Unit[]>();
for (const u of units) {
  const key = `${u.def.stage} ${band(u.hp)}`;
  groups.set(key, [...(groups.get(key) ?? []), u]);
}
const spread: string[] = [];
for (const [key, group] of [...groups].sort()) {
  const mean = group.reduce((s, u) => s + u.raw, 0) / group.length;
  const sd = Math.sqrt(group.reduce((s, u) => s + (u.raw - mean) ** 2, 0) / group.length);
  spread.push(`| ${key} | ${group.length} | ${mean.toFixed(1)} | ${sd.toFixed(1)} | ${Math.min(...group.map((u) => u.attack))}–${Math.max(...group.map((u) => u.attack))} |`);
  for (const u of group) if (sd > 0 && Math.abs(u.raw - mean) > 1.5 * sd) u.flags.push(`${u.raw > mean ? 'high' : 'low'} for ${key} (mean ${mean.toFixed(0)})`);
}
for (const u of units) if (u.raw < 5) u.flags.push('almost no damage: its attacks are effects');

const csv = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const rows = [...units].sort((a, b) => a.tier - b.tier || a.def.name.localeCompare(b.def.name) || a.def.id.localeCompare(b.def.id));
const out = new URL('./out/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(
  new URL('gen1-units.csv', out),
  ['id,name,type,stage,evolvesFrom,hp,attack,rawAttack,tier,keyword,keywordFrom,power,flags', ...rows.map((u) => [u.def.id, u.def.name, u.def.type, u.def.stage, u.def.evolvesFrom ?? '', u.hp, u.attack, u.raw.toFixed(1), u.tier, u.keyword, u.from, u.def.power?.name ?? '', u.flags.join('; ')].map(csv).join(','))].join('\n') + '\n',
);

const count = <T,>(list: T[], key: (x: T) => string | number) => {
  const m = new Map<string | number, number>();
  for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
};
const line = (u: Unit) => `| ${u.def.id} | ${u.def.name} | ${u.def.stage} | ${u.hp} | ${u.attack} (${u.raw.toFixed(1)}) | ${u.tier} | ${u.flags.join('; ')} |`;
const powers = units.filter((u) => u.def.power);
const report = `# Safari Draft: Gen 1 units (generated by tools/safari/unit_table.ts)

${units.length} units (word-for-word reprints left out). Attack: the average damage a turn over ${TURNS} turns, starting with ${START_ENERGY} Energy and 1 more for each stage.${noDex.length ? ` No Pokédex number in the snapshot, kept: ${noDex.map((d) => `${d.name} (${d.id})`).join(', ')}.` : ''}

## Counts

- By tier: ${count(units, (u) => u.tier).map(([k, n]) => `tier ${k}: ${n}`).join(', ')}
- By type: ${count(units, (u) => u.def.type).map(([k, n]) => `${k}: ${n}`).join(', ')}
- By stage: ${count(units, (u) => u.def.stage).map(([k, n]) => `${k}: ${n}`).join(', ')}
- By attack: ${count(units, (u) => u.attack).map(([k, n]) => `${k}: ${n}`).join(', ')}
- By keyword: ${count(units, (u) => u.keyword || '(none)').map(([k, n]) => `${k}: ${n}`).join(', ')}

## Attack by stage and HP band

| Group | Units | Mean | SD | Rounded range |
|---|---|---|---|---|
${spread.join('\n')}

## Outliers and raised evolutions (${units.filter((u) => u.flags.length).length})

| Id | Name | Stage | HP | Attack (raw) | Tier | Why |
|---|---|---|---|---|---|---|
${rows.filter((u) => u.flags.length).map(line).join('\n')}

## Pokémon Powers, each for the user's ruling (${powers.length} cards, ${new Set(powers.map((u) => u.def.power!.name)).size} powers)

| Power | Cards | Text |
|---|---|---|
${[...new Set(powers.map((u) => u.def.power!.name))].sort().map((name) => {
  const with_ = powers.filter((u) => u.def.power!.name === name);
  return `| ${name} | ${with_.map((u) => `${u.def.name} (${u.def.id})`).join(', ')} | ${with_[0]!.def.power!.text.replace(/\|/g, '/').replace(/\s+/g, ' ')} |`;
}).join('\n')}
`;
writeFileSync(new URL('gen1-report.md', out), report);
console.log(report.split('## Outliers')[0]);
