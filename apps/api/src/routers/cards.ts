import { prisma } from '@poke-tcg/db';
import { baseDamage, isHolo, type CardData } from '../cards.js';
import { publicProcedure, router } from '../trpc.js';

const TYPES = new Set(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Colorless']);

export const cardsRouter = router({
  /**
   * The whole catalog for the card browser, slimmed down to what it shows, filters and sorts by.
   * In set release order, then card number.
   */
  list: publicProcedure.query(async () => {
    const rows = await prisma.card.findMany({
      select: {
        id: true,
        name: true,
        localId: true,
        kind: true,
        imageUrl: true,
        rarity: true,
        hp: true,
        types: true,
        stage: true,
        data: true,
        set: { select: { name: true, releaseDate: true } },
      },
    });
    rows.sort(
      (a, b) =>
        (a.set.releaseDate?.getTime() ?? 0) - (b.set.releaseDate?.getTime() ?? 0) ||
        a.set.name.localeCompare(b.set.name) ||
        a.localId.localeCompare(b.localId, undefined, { numeric: true }),
    );
    return rows.map((c, order) => {
      const attacks = (c.data as CardData).attacks ?? [];
      // Energy cards mostly have no types listed; basic ones are named "<Type> Energy".
      const energyType = c.kind === 'ENERGY' ? c.name.replace(/ Energy$/, '') : null;
      return {
        id: c.id,
        name: c.name,
        setName: c.set.name,
        number: c.localId,
        kind: c.kind,
        /** "Baby" | "Basic" | "Stage1" | "Stage2" for Pokémon, null otherwise. */
        stage: c.stage,
        type: c.types[0] ?? (energyType && TYPES.has(energyType) ? energyType : null),
        hp: c.hp,
        /** Highest base damage among the card's attacks (Pokémon only). */
        maxDamage: c.kind === 'POKEMON' ? Math.max(0, ...attacks.map((a) => baseDamage(a.damage))) : null,
        rarity: c.rarity,
        holo: isHolo(c),
        imageUrl: c.imageUrl,
        /** Position in release order, for sorting by set. */
        order,
      };
    });
  }),
});
