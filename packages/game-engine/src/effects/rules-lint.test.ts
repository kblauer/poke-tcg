// A lint for the helper rules of CLAUDE.md that were held only by memory (#204): the engine's sources (tests aside) are
// read as text and searched for the hand-written forms the helpers replace. A hit is named by its file and the nearest
// table key, function or case above it (not its line number, so edits elsewhere don't move it), with how many there are.
//
// Each rule has the hits there are today, every one with where it was reported or why it's right. A hit that isn't
// listed fails (use the helper, or list it with a reason when the helper truly doesn't fit); so does a listed one that
// is gone or has fewer hits (take it out, or lower its count: the list only shrinks).
import { describe, expect, it } from 'vitest';

// Vite's glob import, typed here as the engine has neither Vite's nor Node's types (it reads no file itself).
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { query: string; import: string; eager: true }): Record<string, string>;
  }
}

const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }))
    .map(([path, text]) => [path.startsWith('./') ? `effects/${path.slice(2)}` : path.replace(/^\.\.\//, ''), text] as const)
    .filter(([path]) => !/\.test\.ts$|(^|\/)test-(kit|cards)\.ts$|\.d\.ts$/.test(path)),
);

/**
 * What a hit is in: the nearest of these at or above it. A table's card (`'dp1-12':`), a top-level function or const, a
 * `case` or a `choice.kind`/`choice.power` branch of the resolvers, a method of the attack context (`    sleepSelf() {`).
 */
const SCOPES = [
  /^(?:export )?(?:async )?function\*? (\w+)/,
  /^(?:export )?const (\w+)/,
  /^ {2}'([^']+)':/,
  /^ {2}"([^"]+)":/,
  /^\s+case '([^']+)'/,
  /^\s*(?:\} else )?if \(choice\.(?:kind|power) === '(\w+)'\)/,
];
/** (Not in the effect tables, where a card's `use(ctx) {` would hide the card.) */
const METHOD = /^ {4}(\w+)\(\w*\) \{$/;
function scopeOf(file: string, lines: string[], at: number): string {
  for (let i = at; i >= 0; i--) for (const scope of file.startsWith('effects/') ? SCOPES : [...SCOPES, METHOD]) {
    const m = scope.exec(lines[i]!);
    if (m) return m[1]!;
  }
  return '(top)';
}

interface Rule {
  /** What is banned, and what to use. */
  name: string;
  pattern: RegExp;
  /** Files the rule doesn't read (where the helper itself lives). */
  skip?: RegExp;
  /** A hit that isn't one after all, by its line and the lines above it. */
  unless?: (line: string, above: string[]) => boolean;
  /** Today's hits, as `file > scope` → [how many, where it was reported or why it's right]. */
  allowed: Record<string, [number, string]>;
}

const BENCH = '#204 area 4: Bench room checked by hand (Narrow Gym, Giant Stump, Dittobolic)';
const STADIUM = '#204 areas 3 and 4: the Stadium discarded by hand (a Dusknoir LV.X played as one goes to the discard pile)';
const TYPE = '#204 area 3: one printed type compared (dual types, Kecleon)';

const RULES: Rule[] = [
  {
    name: 'Bench room by hand: use openBenchSlot/benchRoom (they know Narrow Gym, Giant Stump and Dittobolic)',
    pattern: /bench\.(?:indexOf\(null\)|includes\(null\)|some\(\((\w+)\) => !\1\)|findIndex\(\((\w+)\) => !\2\)|every\(Boolean\)|every\(\((\w+)\) => \3\))/,
    allowed: {
      'effects/dp1-powers.ts > dp1-67': [1, BENCH], // Unown C
      'effects/dp4-powers.ts > dp4-71': [1, BENCH], // Scent Conduct
      'effects/dp5-powers.ts > fossilCall': [1, BENCH], // Ancient Guidance, Call Up
      'effects/dp5.ts > dp5-97': [1, BENCH], // Garchomp LV.X's Restore
      'effects/dp6-powers.ts > dp6-67': [1, BENCH], // Cast-off Shell
      'effects/dp6-powers.ts > dp6-83': [1, BENCH],
      'effects/pl3-powers.ts > pl3-29': [1, BENCH], // Darkness Restore (the opponent's Bench)
      'engine.ts > PLAY_BENCH': [1, 'right as it is: only which message to give, after openBenchSlot found no room'],
    },
  },
  {
    name: 'A Stadium leaving play by hand: use retireStadium (engine.ts)',
    pattern: /\bstate\.stadium = (?:null|undefined)/,
    skip: /^engine\.ts$/,
    allowed: {
      'attacks.ts > performAttack': [1, STADIUM], // Holon Circle
      'effects/gym2.ts > discardStadium': [1, STADIUM], // and Spacial Rend, Pulse Barrier through it
      'effects/ex4.ts > knockOver': [1, STADIUM],
      'effects/ex5.ts > ex5-84': [1, STADIUM],
      'effects/ex10.ts > ex10-111': [1, STADIUM],
      'effects/ex13.ts > ex13-50': [1, STADIUM],
      'effects/ex14-trainers.ts > ex14-85': [1, STADIUM],
      'effects/ex16.ts > ex16-99': [1, STADIUM],
      'effects/pl2-powers.ts > pl2-107': [1, '#204 area 4: Sand Reset shuffles the Stadium into the deck (which is right for Ectoplasm needs a ruling)'],
      'effects/hgss3-trainers.ts > hgss3-THREE': [1, "right as it is: Alph Lithograph puts the Stadium into its owner's hand, where retireStadium would discard a Trainer"],
    },
  },
  {
    name: "An in-play Pokémon's power read with powerEffect(effectId(p)): use pokemonPower(p) (a LV.X has its previous level's too)",
    pattern: /powerEffect\(effectId\(/,
    allowed: {},
  },
  {
    name: 'applyWeaknessResistance with one type: pass typesOf(…) (dual types, Kecleon)',
    pattern: /applyWeaknessResistance\(/,
    unless: (line) => line.includes('typesOf(') || /^export function applyWeaknessResistance/.test(line),
    allowed: {
      'cpu/evaluate.ts > reach': [1, '#204 area 2: one type passed'],
      'trainers.ts > powerDamage': [1, '#204 area 2: one type passed (the type the power gave the question)'],
      'effects/neo1-powers.ts > neo1-22': [1, 'found by this lint, not in #204: Playful Punch passes Elekid\'s one type'],
      'effects/rocket-powers.ts > base5-8': [1, 'found by this lint, not in #204: Final Beam passes Dark Gyarados\'s one type'],
      'engine.ts > RETREAT': [1, 'found by this lint, not in #204: [Chase] passes Unown C\'s one type'],
    },
  },
  {
    name: "A Special Condition set by hand: go through afflictionBlocked (or the attack context's inflict)",
    pattern: /\.condition = '/,
    unless: (_, above) => above.slice(-4).some((l) => l.includes('afflictionBlocked(')),
    allowed: {
      'trainers.ts > froth': [1, '#204 area 2: Froth checks conditionProof and conditionFree by hand'],
      'attacks.ts > confuseSelf': [1, 'found by this lint, not in #204: a hand-written part of afflictionBlocked (conditionFree, conditionBarred, Flash Touch)'],
      'attacks.ts > sleepSelf': [1, 'found by this lint, not in #204: the same hand-written part'],
      'effects/ex15-powers.ts > ex15-10': [1, 'found by this lint, not in #204: Dozing puts its own Snorlax to sleep with no check'],
      'effects/ex8-powers.ts > ex8-9': [1, 'found by this lint, not in #204: Wishing Star puts its own Jirachi to sleep with no check'],
      'cpu/shared.ts > confusedLoss': [1, 'right as it is: the CPU imagining its Confused attack on a copy of the state'],
    },
  },
  {
    name: "A Pokémon's one printed type compared: use hasType/typesOf",
    pattern: /\)\.type [!=]== /,
    skip: /^cards\.ts$/,
    unless: (line) => /energyProvided\([^)]*\)\.type/.test(line),
    allowed: {
      'effects/base1-powers.ts > base1-2': [2, TYPE], // Rain Dance
      'effects/jungle.ts > base2-2': [1, TYPE], // Chain Lightning
      'effects/neo1-powers.ts > firePokemon': [1, TYPE],
      'effects/neo2.ts > neo2-45': [1, TYPE], // Dust Devil
      'effects/ecard2.ts > ecard2-22': [1, TYPE], // Steel Wave
      'effects/ecard2-trainers.ts > cubeTargets': [1, TYPE],
      'effects/ecard3.ts > ecard3-145': [1, TYPE], // Empathic Healing
    },
  },
  {
    name: '"Evolves from" compared by hand: use evolvesOnto (Blissey ex, Buried Fossil, the in-play definition)',
    pattern: /\.name === \w+\.evolvesFrom\b|\.evolvesFrom === \w/,
    skip: /^engine\.ts$/,
    allowed: {
      'trainers.ts > lunarTargets': [1, '#204 area 2: evolving from the deck re-implements evolvesOnto'],
      'trainers.ts > sporeTargets': [1, '#204 area 2: the same'],
      'cpu/shared.ts > evolvesInto': [1, '#204 area 2: the CPU\'s copy of evolvesOnto (no Buried Fossil, the printed card)'],
      'cpu/shared.ts > lineIndex': [1, 'right as it is: puts a line\'s cards in order for the CPU, no rule'],
      'trainers.ts > deckFilter': [1, 'found by this lint, not in #204: a deck search for cards that evolve from a name, by the printed "Evolves from" only'],
      'effects/neo2.ts > evolutionsOf': [1, 'found by this lint, not in #204: the names that evolve from a name, by the printed "Evolves from" only'],
      'effects/neo3-trainers.ts > laterStages': [1, 'found by this lint, not in #204: Pokémon Breeder Fields\' later stages, by the printed "Evolves from" only'],
    },
  },
];

/** A rule's hits today, as `file > scope` → how many. */
function hits(rule: Rule): Record<string, number> {
  const found: Record<string, number> = {};
  for (const [file, text] of Object.entries(SOURCES)) {
    if (rule.skip?.test(file)) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!rule.pattern.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line) || rule.unless?.(line, lines.slice(Math.max(0, i - 6), i))) return;
      const key = `${file} > ${scopeOf(file, lines, i)}`;
      found[key] = (found[key] ?? 0) + 1;
    });
  }
  return found;
}

describe('the helper rules, by reading the sources', () => {
  it('reads the engine', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(150);
    expect(Object.keys(SOURCES)).toEqual(expect.arrayContaining(['engine.ts', 'trainers.ts', 'effects/base1.ts', 'cpu/shared.ts']));
  });

  describe.each(RULES)('$name', (rule) => {
    const found = hits(rule);

    it('has no new hit', () => {
      const fresh = Object.entries(found).filter(([key, count]) => count > (rule.allowed[key]?.[0] ?? 0));
      expect(fresh.map(([key, count]) => `${key}: ${count}${rule.allowed[key] ? ` (${rule.allowed[key]![0]} listed)` : ''}`)).toEqual([]);
    });

    it('lists no hit that is gone (take it out, or lower its count)', () => {
      const gone = Object.entries(rule.allowed).filter(([key, [count]]) => (found[key] ?? 0) < count);
      expect(gone.map(([key, [count]]) => `${key}: ${found[key] ?? 0} of ${count} left`)).toEqual([]);
    });
  });
});
