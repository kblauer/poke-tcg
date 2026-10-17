import { prisma } from '@poke-tcg/db';
import { baseDamage, isBasicEnergyCard, isGalaxyFoil, isHolo, isImplemented, type CardData } from '../cards.js';
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
        /**
         * Energy: the type it provides, for the deck builder's Energy toggles. Special Energy with no type
         * of its own (Double Colorless, Rainbow…) counts as Colorless, as the engine treats it.
         */
        energyType: energyType === null ? null : TYPES.has(energyType) ? energyType : 'Colorless',
        hp: c.hp,
        /** Highest base damage among the card's attacks (Pokémon only). */
        maxDamage: c.kind === 'POKEMON' ? Math.max(0, ...attacks.map((a) => baseDamage(a.damage))) : null,
        /** Attack names (Pokémon only), for the search. TCGdex leaves some unnamed (null); those are skipped. */
        attacks: attacks.flatMap((a) => (a.name ? [a.name] : [])),
        rarity: c.rarity,
        holo: isHolo(c),
        /** Galaxy foil around the art instead of holofoil in it (see isGalaxyFoil). */
        galaxy: isGalaxyFoil(c),
        imageUrl: c.imageUrl,
        /** Position in release order, for sorting by set. */
        order,
        /** National Pokédex number (Pokémon only). */
        dexNumber: (c.data as CardData).dexId?.[0] ?? null,
        /** Has a Pokémon Power, Poké-Power or Poké-Body. */
        hasAbility: ((c.data as CardData).abilities ?? []).length > 0,
        /** Basic Energy: no limit on copies in a deck. */
        basicEnergy: isBasicEnergyCard(c),
        /** The engine implements all of the card (see isImplemented). */
        implemented: isImplemented(c),
      };
    });
  }),
});
