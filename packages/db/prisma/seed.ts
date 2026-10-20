// Loads the TCGdex card snapshot (prisma/data/tcgdex-wotc.json), then the hand-made cards TCGdex doesn't
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
    stage: category === 'Pokemon' ? stage : null,
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
