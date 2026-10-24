// The catalog's card fixes and its conversion to the engine's card definitions, shared by the API (apps/api/src/cards.ts,
// toCardDef, from the Card table) and the campaign's test pool (test-pool.ts, from the TCGdex snapshot), so the two can't
// drift apart: TCGdex's gaps (Baby Pokémon it lists as Basic, "Evolves from" it leaves out, holos it lists as normal
// printings), the owners' and Dark and Light evolution lines, Trainers played as Pokémon, the special Energy cards, and
// a card's rarity for the pool. The seed's own fixes (TCGDEX_FIXES, printed names, Pokémon-ex stages: packages/db/prisma/
// seed.ts) are made before the catalog is written, so they aren't here; the test pool copies the ones it needs.
import { attackEffect, energyEffect, powerEffect, trainerEffect, type Attack, type CardDef, type EnergyType, type PokemonCardDef, type Stage } from '@poke-tcg/game-engine';
import { GEN2_SETS, POOL_SETS, type Rarity } from './pool.js';

const ENERGY_TYPES = new Set<EnergyType>(['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless']);
const STAGES: Record<string, Stage> = { Basic: 'basic', Baby: 'basic', Stage1: 'stage1', Stage2: 'stage2' };

/** Shape of the TCGdex fields kept in Card.data (see packages/db/prisma/tcgdex.ts). */
export interface CardData {
  /** WOTC values are all "×2" (or "x2"). */
  weaknesses?: { type: string; value: string | null }[] | null;
  /** WOTC values are all "-30". */
  resistances?: { type: string; value: string | null }[] | null;
  /** WOTC era: Pokémon Powers (type "Pokemon Power"); e-Card era: Poké-Powers and Poké-Bodies. */
  abilities?: { name: string; type: string; effect: string }[] | null;
  /** Card text of Trainers and special Energy. */
  effect?: string | null;
  /** Pokémon: National Pokédex numbers (the first is the Pokémon's own). */
  dexId?: number[] | null;
  /** Energy: "Normal" for basic Energy, "Special" otherwise. */
  energyType?: string | null;
  /** Retreat cost (number of energy); null for Pokémon that retreat for free. */
  retreat?: number | null;
  attacks?: { name: string | null; cost: string[] | null; damage: string | number | null; effect: string | null }[] | null;
  /** Printings that exist; `holo` marks holofoil cards (rarity alone doesn't, e.g. Base Set holos are "Rare"). */
  variants?: { holo?: boolean; normal?: boolean; reverse?: boolean; firstEdition?: boolean } | null;
  /** Holo Energy only (made by the seed, packages/db/prisma/holo-energy.ts): the holo style it's shown in. */
  holoEnergy?: HoloEnergyStyle | null;
  /** "ex" on a Pokémon-ex (EX series). */
  suffix?: string | null;
  /** A reverse-holo print (made by the seed from an EX card, id "<card id>-reverse", packages/db/prisma/holo-energy.ts). */
  reverseHolo?: boolean;
}

/** A holo Energy's style: the attributes the holo card styles select on (see HoloCard). */
export interface HoloEnergyStyle {
  key: string;
  label: string;
  rarity: string;
  trainerGallery?: boolean;
  supertype?: string;
  subtypes?: string;
}

/** A catalog card as the fixes read it: the Card table's row (its `data` the JSON, CardData), or one the test pool makes from the TCGdex snapshot. */
export interface CatalogCard {
  id: string;
  name: string;
  /** POKEMON, TRAINER or ENERGY. */
  kind: string;
  imageUrl: string | null;
  rarity: string | null;
  hp: number | null;
  types: string[];
  stage: string | null;
  evolveFrom: string | null;
  data: unknown;
}

/** Stage 1 Pokémon printed as evolving from Mysterious Fossil, which TCGdex leaves out. */
const FROM_MYSTERIOUS_FOSSIL = new Set(['Omanyte', 'Kabuto', 'Aerodactyl', 'Dark Omanyte']);

/**
 * Baby Pokémon TCGdex lists as Basic (the Neo-era Babies have the stage "Baby"): the promos, Neo Genesis's Pichu, Cleffa,
 * Elekid and Magby, Neo Discovery's Igglybuff and Tyrogue, and Neo Revelation's Smoochum.
 */
const BABIES = new Set(['basep-31', 'basep-35', 'basep-36', 'neo1-12', 'neo1-20', 'neo1-22', 'neo1-23', 'neo2-40', 'neo2-66', 'neo3-54']);

/** Gym Heroes evolutions TCGdex leaves out, by name (without the owner). */
const TCGDEX_MISSING_EVOLVES_FROM: Record<string, string> = { "Lt. Surge's Magneton": 'Magnemite' };

/** Other cards whose "Evolves from" TCGdex leaves out, by id (Expedition's non-holo Arbok and Blastoise; also fixed in the seed). */
const MISSING_EVOLVES_FROM_BY_ID: Record<string, string> = { 'ecard1-35': 'Ekans', 'ecard1-37': 'Wartortle' };

/** The owner in an owner's Pokémon's name (Gym Heroes, Gym Challenge): "Brock's Rhydon" → "Brock's ". */
const OWNER = /^((?:Blaine|Brock|Erika|Lt\. Surge|Misty|Sabrina|Giovanni|Koga|Rocket)'s )/;

/** A second printed "Evolves from" (EX Unseen Forces Blissey ex: "Evolves from Chansey or Chansey ex"), by card id. */
const ALSO_EVOLVES_FROM: Record<string, string[]> = { 'ex10-101': ['Chansey ex'] };

/** What the card evolves from, filling in TCGdex's gaps. */
export const evolvesFrom = (card: Pick<CatalogCard, 'id' | 'name' | 'stage' | 'evolveFrom'>) => {
  // Team Rocket's Dark Stage 2 Pokémon evolve from the Dark Stage 1 (Dark Alakazam from Dark Kadabra); TCGdex has the plain one.
  if (card.stage === 'Stage2' && card.name.startsWith('Dark ') && card.evolveFrom && !card.evolveFrom.startsWith('Dark ')) return `Dark ${card.evolveFrom}`;
  // Neo Destiny's Light Stage 2 Pokémon likewise evolve from the Light Stage 1 (Light Dragonite from Light Dragonair).
  if (card.stage === 'Stage2' && card.name.startsWith('Light ') && card.evolveFrom && !card.evolveFrom.startsWith('Light ')) return `Light ${card.evolveFrom}`;
  // An owner's Pokémon evolves from the same owner's (Brock's Rhydon from Brock's Rhyhorn, as printed); TCGdex has the plain one.
  const owner = card.stage !== 'Basic' && card.stage !== 'Baby' ? card.name.match(OWNER)?.[1] : undefined;
  const from = card.evolveFrom ?? TCGDEX_MISSING_EVOLVES_FROM[card.name];
  // Gym Challenge's Nidoran are named "Giovanni's Nidoran ♀" (with a space), unlike the plain "Nidoran♀".
  if (owner && from) return (from.startsWith(owner) ? from : `${owner}${from}`).replace(/Nidoran([♀♂])$/, 'Nidoran $1');
  return card.evolveFrom ?? MISSING_EVOLVES_FROM_BY_ID[card.id] ?? (card.stage === 'Stage1' && FROM_MYSTERIOUS_FOSSIL.has(card.name) ? 'Mysterious Fossil' : null);
};

/**
 * Holofoils TCGdex lists as normal printings only: the Wizards Black Star Promos Venusaur (13) and Cool Porygon (15),
 * which were printed holo like the other holo promos (Eevee, Mew, Meowth…).
 */
const TCGDEX_MISSING_HOLO = new Set(['basep-13', 'basep-15']);

/** Whether the card was printed as a holofoil. */
export const isHolo = (card: Pick<CatalogCard, 'id' | 'data'>) => (card.data as CardData).variants?.holo === true || TCGDEX_MISSING_HOLO.has(card.id);

/**
 * Cards with galaxy foil over the whole face except the art. TCGdex has no flag for it: these are
 * the reverse-only printings, minus Scizor (basep-33), which is reverse-only but silver foil.
 */
const GALAXY_FOIL = new Set(['basep-34', 'basep-35', 'si1-1', 'si1-4', 'si1-7', 'si1-11', 'si1-14', 'si1-17']);

/**
 * Gen 1's and Gen 2's holo Pokémon are shown with the galaxy foil in the art window, their Pokémon masked out of it
 * (apps/web/public/holo-masks): asked by the user 2026-10-23, after Base Set 2's holo rares had it to set them apart
 * from the originals they reprint. Holo Trainers and Energy keep their foil.
 */
const GALAXY_ART_SETS = new Set([...POOL_SETS, ...GEN2_SETS]);
const isGalaxyArt = (card: Pick<CatalogCard, 'id' | 'data'>) =>
  GALAXY_ART_SETS.has(card.id.slice(0, card.id.lastIndexOf('-'))) && isHolo(card) && !!(card.data as CardData).dexId?.length;

export const isGalaxyFoil = (card: Pick<CatalogCard, 'id' | 'data'>) => GALAXY_FOIL.has(card.id) || isGalaxyArt(card);

/** A catalog card's rarity, holos apart: holo and galaxy-foil cards (the promo Entei and Pichu, which TCGdex lists as Common) are holos. */
export const cardRarity = (card: Pick<CatalogCard, 'id' | 'rarity' | 'data'>): Rarity =>
  isHolo(card) || isGalaxyFoil(card) ? 'holo' : card.rarity === 'Rare' ? 'rare' : card.rarity === 'Uncommon' ? 'uncommon' : 'common';

function energyType(tcgdexType: string): EnergyType {
  const type = tcgdexType.toLowerCase() as EnergyType;
  if (!ENERGY_TYPES.has(type)) throw new Error(`Unknown energy type: ${tcgdexType}`);
  return type;
}

/** Leading number of a printed damage value: "30+" → 30, "20×" → 20, null/"" → 0. */
export function baseDamage(damage: string | number | null): number {
  if (typeof damage === 'number') return damage;
  return Number.parseInt(damage ?? '', 10) || 0;
}

/** The card's Pokémon Power, if it has one, with the printed name and text where TCGdex's differ (the power's effect carries them: Downpour, Unown [M]). */
function power(data: CardData, cardId: string): PokemonCardDef['power'] {
  const [ability] = data.abilities ?? [];
  const effect = powerEffect(cardId);
  return ability ? { name: effect?.name ?? ability.name, text: effect?.text ?? ability.effect } : null;
}

/** First weakness as type and multiplier ("×2" → 2). */
function weakness(data: CardData): PokemonCardDef['weakness'] {
  const [w] = data.weaknesses ?? [];
  if (!w) return null;
  return { type: energyType(w.type), multiplier: Number.parseInt((w.value ?? '').replace(/^[×x]/, ''), 10) || 2 };
}

/** First resistance as type and amount ("-30" → 30). */
function resistance(data: CardData): PokemonCardDef['resistance'] {
  const [r] = data.resistances ?? [];
  if (!r) return null;
  return { type: energyType(r.type), amount: Math.abs(Number.parseInt(r.value ?? '', 10)) || 30 };
}

/** An attack's name. TCGdex leaves a few unnamed (null: Shining Tyranitar, e-Card Hoppip). */
const attackName = (a: { name: string | null }) => a.name ?? 'Unnamed attack';

/** The card's attacks, each name once: TCGdex lists some twice (Southern Islands Tentacruel, before the seed's fix). */
const printedAttacks = (data: CardData) => (data.attacks ?? []).filter((a, i, all) => all.findIndex((b) => attackName(b) === attackName(a)) === i);

/** Basic Energy (TCGdex "Normal"), which a deck may hold any number of. */
export const isBasicEnergyCard = (card: Pick<CatalogCard, 'kind' | 'data'>) => card.kind === 'ENERGY' && (card.data as CardData).energyType === 'Normal';

/**
 * Whether the engine implements everything on the card: every attack with text, its Pokémon Power, its
 * Trainer effect, or (Energy) a basic Energy, Double Colorless or a special Energy with an effect (Rainbow). Other cards still load: their attacks
 * do plain damage, and their powers, Trainer effects and special Energy effects do nothing.
 */
export function isImplemented(card: Pick<CatalogCard, 'id' | 'name' | 'kind' | 'data'>): boolean {
  const data = card.data as CardData;
  if (card.kind === 'POKEMON') {
    const attacks = printedAttacks(data).every((a) => !a.effect || attackEffect(card.id, attackName(a)));
    return attacks && (!data.abilities?.length || powerEffect(card.id) !== undefined);
  }
  if (card.kind === 'TRAINER') return trainerEffect(card.id) !== undefined;
  return isBasicEnergyCard(card) || card.name === 'Double Colorless Energy' || energyEffect(card.id) !== undefined;
}

/**
 * Converts a catalog card into the engine's card definition. `length` is the Pokédex length printed on a Pokémon card
 * (the API's lengths.ts, for Blaine's Quiz #1). Throws for a card the engine can't take: a Pokémon with no stage, type or
 * HP, or a basic Energy of an unknown type.
 */
export function catalogCardDef(card: CatalogCard, length?: string): CardDef {
  const imageUrl = card.imageUrl;
  const data = card.data as CardData;
  if (card.kind === 'POKEMON') {
    // TCGdex has no stage for many Pokémon-ex; the seed works it out (stageOf), and until a re-seed it's Basic or Stage 1.
    const stage = (card.stage && STAGES[card.stage]) || (card.stage === null ? (card.evolveFrom ? 'stage1' : 'basic') : undefined);
    const [type] = card.types;
    if (!stage || !type || card.hp == null) throw new Error(`Card ${card.id} is missing stage, type or HP`);
    const attacks: Attack[] = printedAttacks(data).map((a) => {
      const effect = attackEffect(card.id, attackName(a));
      // Printed cost, damage and wording where TCGdex's differ (kept with the attack's effect in the engine).
      const damage = effect?.damage ?? a.damage;
      return {
        name: attackName(a),
        cost: effect?.cost ?? (a.cost ?? []).map(energyType),
        damage: baseDamage(damage),
        damageText: damage == null || damage === '' ? null : String(damage),
        text: effect?.text ?? a.effect,
      };
    });
    const baby = card.stage === 'Baby' || BABIES.has(card.id);
    const ex = data.suffix === 'ex';
    // Both types of a Pokémon printed as two (Team Aqua's Cacturne: Grass and Darkness), and every Weakness and Resistance after the first.
    const types = card.types.length > 1 ? { types: card.types.map(energyType) } : {};
    const moreWeakness = (data.weaknesses ?? []).slice(1).map((w) => energyType(w.type));
    const moreResistance = (data.resistances ?? []).slice(1).map((r) => energyType(r.type));
    return {
      id: card.id,
      kind: 'pokemon',
      name: card.name,
      imageUrl,
      type: energyType(type),
      ...types,
      hp: card.hp,
      stage,
      evolvesFrom: evolvesFrom(card),
      ...(ALSO_EVOLVES_FROM[card.id.replace(/-reverse$/, '')] && { alsoEvolvesFrom: ALSO_EVOLVES_FROM[card.id.replace(/-reverse$/, '')] }),
      attacks,
      power: power(data, card.id),
      weakness: weakness(data),
      resistance: resistance(data),
      ...(moreWeakness.length && { moreWeakness }),
      ...(moreResistance.length && { moreResistance }),
      retreatCost: data.retreat ?? 0,
      holo: isHolo(card),
      ...(baby && { baby }),
      ...(ex && { ex }),
      ...(length && { length }),
    };
  }
  if (card.kind === 'ENERGY') {
    if (card.name === 'Double Colorless Energy') {
      return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'colorless', amount: 2, basic: false, holo: isHolo(card) };
    }
    // Basic energy cards are named "<Type> Energy".
    const named = card.name.replace(/ Energy$/, '').toLowerCase() as EnergyType;
    const known = ENERGY_TYPES.has(named) && named !== 'colorless';
    if (isBasicEnergyCard(card)) {
      if (!known) throw new Error(`Card ${card.id} is not a supported energy`);
      return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: named, holo: isHolo(card) };
    }
    // Double Rainbow Energy: every type, 2 at a time. Aqua Energy and Magma Energy: 2 Energy, each either of their types (energyPool).
    if (card.name === 'Double Rainbow Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'colorless', anyType: true, amount: 2, basic: false, holo: isHolo(card) };
    if (card.name === 'Aqua Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'water', amount: 2, basic: false, holo: isHolo(card) };
    if (card.name === 'Magma Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'fighting', amount: 2, basic: false, holo: isHolo(card) };
    // R Energy: 2 Darkness Energy. Dark Metal Energy: 1 Energy, Darkness or Metal (energyPool).
    if (card.name === 'R Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'darkness', amount: 2, basic: false, holo: isHolo(card) };
    if (card.name === 'Dark Metal Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'darkness', basic: false, holo: isHolo(card) };
    // Rainbow Energy and Multi Energy count as every type while attached (1 at a time; Multi Energy only Colorless beside another Special Energy card: colorlessOnly).
    if (card.name === 'Rainbow Energy' || card.name === 'Multi Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'colorless', anyType: true, basic: false, holo: isHolo(card) };
    // Miracle Energy counts as every type but provides only 2 Energy at a time.
    if (card.name === 'Miracle Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'colorless', anyType: true, amount: 2, basic: false, holo: isHolo(card) };
    // Boost Energy provides 3 Colorless Energy, Bounce Energy 2 (their other rules are the engine's).
    if (card.name === 'Boost Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'colorless', amount: 3, basic: false, holo: isHolo(card) };
    if (card.name === 'Bounce Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'colorless', amount: 2, basic: false, holo: isHolo(card) };
    // Full Heal, Potion and Recycle Energy provide Colorless (their effects are the engine's); Darkness and Metal Energy 1 Energy of their type.
    return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: known ? named : 'colorless', basic: false, holo: isHolo(card) };
  }
  const text = data.effect ?? '';
  const effect = trainerEffect(card.id);
  // A Trainer the engine doesn't implement yet can be in a deck, but can't be played (trainerError says so).
  if (!effect) return { id: card.id, kind: 'trainer', name: card.name, imageUrl, text, holo: isHolo(card) };
  // A Trainer played as a Pokémon (Clefairy Doll): no type, attacks, weakness or retreat.
  if (effect.asPokemon) {
    return {
      id: card.id,
      kind: 'pokemon',
      name: card.name,
      imageUrl,
      type: 'colorless',
      hp: effect.asPokemon.hp,
      stage: 'basic',
      evolvesFrom: null,
      attacks: [],
      retreatCost: 0,
      trainerText: text,
      ...(effect.asPokemon.power && { power: effect.asPokemon.power }),
      holo: isHolo(card),
    };
  }
  return { id: card.id, kind: 'trainer', name: card.name, imageUrl, text, holo: isHolo(card) };
}
