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

function toCardRow(card: TcgdexCard) {
  const { id, set, localId, name, category, image, rarity, hp, types, stage, evolveFrom, ...data } = card;
  return {
    setId: set.id,
    localId,
    name,
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
