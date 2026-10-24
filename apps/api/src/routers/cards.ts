import { baseDamage, catalogRows, holoEnergyStyle, isBasicEnergyCard, isGalaxyFoil, isHolo, isImplemented, isReverseHolo, type CardData } from '../cards.js';
import { publicProcedure, router } from '../trpc.js';
import { holoTwins } from '../unlocks.js';
import { craftCost } from './packs.js';

const TYPES = new Set(['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Colorless']);

export const cardsRouter = router({
  /**
   * The whole catalog for the deck builder, slimmed down to what it shows, filters and sorts by.
   * In set release order, then card number. Computed once per instance (the catalog only changes with the seed); the
   * response is cacheable too (app.ts sets Cache-Control on this route).
   */
  list: publicProcedure.query(() => catalogList()),
});

let listed: Promise<CatalogCard[]> | undefined;
type CatalogCard = Awaited<ReturnType<typeof buildCatalogList>>[number];

function catalogList(): Promise<CatalogCard[]> {
  listed ??= buildCatalogList();
  listed.catch(() => (listed = undefined));
  return listed;
}

async function buildCatalogList() {
  const [twins, rows] = await Promise.all([holoTwins(), catalogRows()]);
  return rows.map((c, order) => {
      const attacks = (c.data as CardData).attacks ?? [];
      // Energy cards mostly have no types listed; basic ones are named "<Type> Energy".
      const energyType = c.kind === 'ENERGY' ? c.name.replace(/ Energy$/, '') : null;
      return {
        id: c.id,
        name: c.name,
        setId: c.setId,
        setName: c.set.name,
        number: c.localId,
        kind: c.kind,
        /** "Baby" | "Basic" | "Stage1" | "Stage2" for Pokémon, null otherwise. */
        stage: c.stage,
        /** The Pokémon's name it evolves from (evolved Pokémon only). */
        evolvesFrom: c.evolveFrom,
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
        /**
         * A Stadium Trainer, for the search ("Stadium"). TCGdex doesn't list the Trainer type for these sets, so it's
         * known by the rule every Stadium prints: discard it if another Stadium card comes into play.
         */
        stadium: c.kind === 'TRAINER' && /another Stadium card comes into play/i.test((c.data as CardData).effect ?? ''),
        rarity: c.rarity,
        holo: isHolo(c),
        /** Galaxy foil around the art instead of holofoil in it (see isGalaxyFoil). */
        galaxy: isGalaxyFoil(c),
        /** Holo Energy (found only in packs, as many copies as were pulled): its holo style. Null for other cards. */
        holoEnergy: holoEnergyStyle(c),
        /** A reverse-holo print (EX sets): a special holo like holoTwins'. */
        reverseHolo: isReverseHolo(c),
        /** A deck holds no more copies than were gained: holo Energy and special holos (holoTwins). */
        limitedCopies: holoEnergyStyle(c) !== null || twins.has(c.id),
        /** Stardust to craft it (packs.craft), or null for a card that can't be crafted. */
        craftCost: craftCost(c),
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
}
