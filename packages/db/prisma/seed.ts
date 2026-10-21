// Loads the TCGdex card snapshot (prisma/data/tcgdex-wotc.json: the WOTC era and Generation 3's EX sets), then the hand-made cards TCGdex doesn't
// have (prisma/data/custom-cards.json), into the database, with the holo Energy made from the packs' basic Energy
// (holo-energy.ts).
// Idempotent: re-running updates existing rows. Refresh the snapshot with `pnpm cards:fetch`.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prisma, type Prisma } from '../src/index.js';
import { HOLO_ENERGY_SETS, holoEnergyCards } from './holo-energy.js';
import { CUSTOM_PATH, SNAPSHOT_PATH, type CardSnapshot, type TcgdexCard } from './tcgdex.js';

const KIND = { Pokemon: 'POKEMON', Trainer: 'TRAINER', Energy: 'ENERGY' } as const;
/** Upserts in flight at once. No transaction: the seed is idempotent, so a partial run is safe to re-run. */
const CONCURRENCY = 20;

const load = async (file: string) => JSON.parse(await readFile(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8')) as CardSnapshot;
const [tcgdex, custom] = await Promise.all([load(SNAPSHOT_PATH), load(CUSTOM_PATH)]);
const cards = [...tcgdex.cards, ...custom.cards];
const holoEnergy = cards.filter((c) => c.category === 'Energy' && c.energyType === 'Normal' && HOLO_ENERGY_SETS.includes(c.set.id)).flatMap(holoEnergyCards);
const snapshot = { sets: [...tcgdex.sets, ...custom.sets], cards: [...cards, ...holoEnergy] };

/** Where TCGdex's data differs from the printed card (checked against the card image), by card id. */
const TCGDEX_FIXES: Record<string, Partial<TcgdexCard>> = {
  // Wizards Promo 7 Jigglypuff: 50 HP as printed (TCGdex has 70).
  'basep-7': { hp: 50 },
  // Southern Islands Marill: TCGdex has none of its attacks.
  'si1-11': {
    attacks: [
      { name: 'Squirt', cost: ['Water'], damage: null, effect: "Choose 1 of your opponent's Pokémon. This attack does 10 damage to that Pokémon. Don't apply Weakness and Resistance." },
      { name: 'Rolling Tackle', cost: ['Colorless', 'Colorless'], damage: '20', effect: null },
    ],
  },
  // Neo Destiny Shining Tyranitar: TCGdex has its attacks' costs and damage only.
  'neo4-113': {
    attacks: [
      { name: 'Mountain Crush', cost: ['Darkness', 'Fighting', 'Fighting'], damage: '30', effect: 'Flip a coin until you get tails. For each heads, your opponent discards the top card from his or her deck.' },
      {
        name: 'Destructive Fire',
        cost: ['Darkness', 'Fire', 'Fire', 'Fire'],
        damage: '50',
        effect:
          'Flip a coin for each Fire Energy card attached to Shining Tyranitar. For each heads, discard a Fire Energy card attached to Shining Tyranitar or this attack does nothing. Then, for each heads, choose an Energy card attached to the Defending Pokémon and discard it. If it has fewer Energy cards than that, remove all of them.',
      },
    ],
  },
  // Legendary Collection Jolteon: TCGdex spells Pin Missile "Pin Missle".
  'lc-14': {
    attacks: [
      { name: 'Quick Attack', cost: ['Colorless', 'Colorless'], damage: '10+', effect: 'Flip a coin. If heads, this attack does 10 damage plus 20 more damage; if tails, this attack does 10 damage.' },
      { name: 'Pin Missile', cost: ['Lightning', 'Lightning', 'Colorless'], damage: '20×', effect: 'Flip 4 coins. This attack does 20 damage times the number of heads.' },
    ],
  },
  // Legendary Collection Grimer: TCGdex calls Minimize "Minimized".
  'lc-78': {
    attacks: [
      { name: 'Nasty Goo', cost: ['Colorless'], damage: '10', effect: 'Flip a coin. If heads, the Defending Pokémon is now Paralyzed.' },
      { name: 'Minimize', cost: ['Grass'], damage: null, effect: "All damage done by attacks to Grimer during your opponent's next turn is reduced by 20 (after applying Weakness and Resistance)." },
    ],
  },
  // Expedition: Weakness and Resistance TCGdex gives cards printed without them (the Babies have neither), two missing
  // "Evolves from", Ninetales' Ethereal Flame damage, Caterpie's misspelt attack and Hoppip's garbled attacks.
  ...Object.fromEntries(['ecard1-5', 'ecard1-7', 'ecard1-15', 'ecard1-24', 'ecard1-39', 'ecard1-40', 'ecard1-41', 'ecard1-46', 'ecard1-60', 'ecard1-72', 'ecard1-73', 'ecard1-83', 'ecard1-87', 'ecard1-110'].map((id) => [id, { resistances: null }])),
  ...Object.fromEntries(['ecard1-17', 'ecard1-22', 'ecard1-52'].map((id) => [id, { weaknesses: null, resistances: null }])),
  ...Object.fromEntries(['ecard1-43', 'ecard1-58', 'ecard1-75', 'ecard1-107'].map((id) => [id, { weaknesses: null }])),
  'ecard1-35': { resistances: null, evolveFrom: 'Ekans' },
  'ecard1-37': { evolveFrom: 'Wartortle' },
  'ecard1-57': {
    attacks: [
      { name: 'Mislead', cost: ['Fire', 'Colorless'], damage: null, effect: 'Flip 2 coins. If either of them is heads, the Defending Pokémon is now Confused.' },
      { name: 'Ethereal Flame', cost: ['Colorless', 'Colorless', 'Colorless'], damage: '30+', effect: 'Discard all Fire Energy cards attached to Ninetales. This attack does 30 damage plus 20 more damage for each card discarded this way.' },
    ],
  },
  'ecard1-96': {
    attacks: [
      { name: 'Headbutt', cost: ['Colorless'], damage: '10', effect: null },
      { name: 'Entangling Thread', cost: ['Colorless', 'Colorless'], damage: '10', effect: 'Flip a coin. If heads, the Defending Pokémon is now Paralyzed.' },
    ],
  },
  'ecard1-112': { attacks: [{ name: 'Sleep Powder', cost: ['Grass'], damage: '10', effect: 'The Defending Pokémon is now Asleep.' }] },
  // Expedition Multi Technical Machine 01: TCGdex leaves out its attack.
  'ecard1-144': {
    effect:
      "Attach this card to 1 of your Pokémon in play. That Pokémon may use this card's attack instead of its own. At the end of your turn, discard Multi Technical Machine 01. Attack: Paralyzing Gaze (Colorless): The Defending Pokémon is now Paralyzed.",
  },
  // Aquapolis Smeargle: TCGdex spells Doubleslap "Doublslap".
  'ecard2-109': {
    attacks: [
      { name: 'Paint Trick', cost: ['Colorless'], damage: null, effect: 'Flip a coin. If heads, the Defending Pokémon is now Confused. Then, choose 1 of your Benched Pokémon and switch Smeargle with it.' },
      { name: 'Doubleslap', cost: ['Colorless', 'Colorless'], damage: '20×', effect: 'Flip 2 coins. This attack does 20 damage times the number of heads.' },
    ],
  },
  // Aquapolis's Cubes (Technical Machines): TCGdex leaves out their attacks.
  ...Object.fromEntries(
    (
      [
        ['ecard2-119', 'Darkness', 'Plunder (Darkness) 10: Before doing damage, discard any Trainer cards attached to the Defending Pokémon.'],
        ['ecard2-121', 'Fighting', 'Violent Rage (Fighting) 10×: Flip a number of coins equal to the number of damage counters on this Pokémon. This attack does 10 damage times the number of heads.'],
        ['ecard2-122', 'Fire', 'Singe (Fire): The Defending Pokémon is now Burned.'],
        ['ecard2-124', 'Grass', 'Sleep Poison (Grass): The Defending Pokémon is now Asleep and Poisoned.'],
        ['ecard2-127', 'Lightning', 'Discharge (Lightning) 40×: Discard all Lightning Energy cards attached to this Pokémon. Then, flip a number of coins equal to the number of Energy cards discarded that way. This attack does 40 damage times the number of heads.'],
        ['ecard2-129', 'Metal', "Metal Reversal (Metal) 10: Before doing damage, you may choose 1 of your opponent's Benched Pokémon and switch it with the Defending Pokémon."],
        ['ecard2-132', 'Psychic', 'Psy Confuse (Psychic): The Defending Pokémon is now Confused.'],
        ['ecard2-140', 'Water', "Splatter (Water): Choose 1 of your opponent's Pokémon. This attack does 20 damage to that Pokémon. Don't apply Weakness or Resistance."],
      ] as const
    ).map(([id, type, attack]) => {
      const cube = `${type} Cube 01`;
      return [id, { effect: `Attach this card to 1 of your ${type} Pokémon in play. That Pokémon may use this card's attack instead of its own. At the end of your turn, discard ${cube}. Attack: ${attack}` }];
    }),
  ),
  // Skyridge Omanyte: printed without Resistance.
  'ecard3-41': { resistances: null },
  // Skyridge's Miracle Spheres: α's text names itself (TCGdex: "Miracle Plate α"); γ's Thunder Force costs Lightning.
  'ecard3-129': {
    effect: 'Attach this card to 1 of your Evolved Fire, Lightning, or Fighting Pokémon in play. That Pokémon may use this card\'s attack instead of its own. At the end of your turn, discard Miracle Sphere α.',
    attacks: [
      {
        name: 'Fire Force',
        cost: ['Fire', 'Colorless', 'Colorless'],
        damage: '30+',
        effect:
          'If the Pokémon using this attack has Fire and Lightning basic Energy cards attached to it, the Defending Pokémon is now Confused. If the Pokémon using this attack has Fire and Fighting basic Energy cards attached to it, this attack does 30 damage plus 10 more damage and removes 3 damage counters from the Pokémon that Miracle Sphere α is attached to.',
      },
    ],
  },
  'ecard3-131': {
    attacks: [
      {
        name: 'Thunder Force',
        cost: ['Lightning', 'Colorless', 'Colorless'],
        damage: '30+',
        effect:
          "If the Pokémon using this attack has Grass and Lightning basic Energy cards attached to it, the Defending Pokémon is now Asleep and Poisoned. If the Pokémon using this attack has Water and Lightning basic Energy cards attached to it, this attack does 30 damage plus 10 more damage and lets you put 1 damage counter on each of your opponent's Benched Pokémon.",
      },
    ],
  },
  // Southern Islands Tentacruel: TCGdex lists both attacks twice; the printed card Paralyzes with Poison Sting.
  'si1-10': {
    attacks: [
      { name: 'Tentacle Grip', cost: ['Water'], damage: null, effect: 'Flip a number of coins equal to the number of Water Energy cards attached to Tentacruel. For each heads, draw 2 cards.' },
      { name: 'Poison Sting', cost: ['Water', 'Water'], damage: '20', effect: 'Flip a coin. If heads, the Defending Pokémon is now Paralyzed.' },
    ],
  },
};

/**
 * The printed name, the same in every set: Legendary Collection and the e-Card sets spell Nidoran "Nidoran ♀" (with a
 * space), unlike the earlier sets and the Nidorina and Nidorino that evolve from them. Owners' (Giovanni's Nidoran ♀)
 * keep theirs.
 */
const printedName = (name: string) => name.replace(/^Nidoran ([♀♂])$/, 'Nidoran$1');

/**
 * TCGdex has no stage for many Pokémon-ex (EX FireRed & LeafGreen on, e.g. Blastoise ex): no "Evolves from" makes it a
 * Basic Pokémon, otherwise it's a stage above the Pokémon it evolves from (Charizard ex from Charmeleon: Stage 2).
 */
function stageOf(card: TcgdexCard): string | null {
  if (card.category !== 'Pokemon' || card.stage) return card.stage;
  if (!card.evolveFrom) return 'Basic';
  const from = cards.find((c) => c.category === 'Pokemon' && c.stage && printedName(c.name) === printedName(card.evolveFrom!));
  return from?.stage === 'Stage1' ? 'Stage2' : 'Stage1';
}

function toCardRow(tcgdex: TcgdexCard) {
  const card = { ...tcgdex, ...TCGDEX_FIXES[tcgdex.id] };
  const { id, set, localId, name, category, image, rarity, hp, types, stage, evolveFrom, ...data } = card;
  return {
    setId: set.id,
    localId,
    name: printedName(name),
    kind: KIND[category],
    imageUrl: image,
    rarity,
    hp,
    types: types ?? [],
    // TCGdex also tags basic Energy as "Basic"; stage only matters for Pokémon.
    stage: category === 'Pokemon' ? (stage ?? stageOf(card)) : null,
    evolveFrom,
    data: data as unknown as Prisma.InputJsonObject,
  };
}

for (const s of snapshot.sets) {
  const row = {
    name: s.name,
    series: s.series,
    releaseDate: s.releaseDate ? new Date(s.releaseDate) : null,
    cardCount: s.cardCount.total,
    logoUrl: s.logo,
    symbolUrl: s.symbol,
  };
  await prisma.cardSet.upsert({ where: { id: s.id }, create: { id: s.id, ...row }, update: row });
}
console.log(`Seeded ${snapshot.sets.length} sets`);

for (let i = 0; i < snapshot.cards.length; i += CONCURRENCY) {
  const batch = snapshot.cards.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map((card) => {
      const row = toCardRow(card);
      return prisma.card.upsert({ where: { id: card.id }, create: { id: card.id, ...row }, update: row });
    }),
  );
  process.stdout.write(`\rSeeded ${Math.min(i + CONCURRENCY, snapshot.cards.length)}/${snapshot.cards.length} cards`);
}
process.stdout.write('\n');

await prisma.$disconnect();
