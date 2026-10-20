import { prisma, type Card } from '@poke-tcg/db';
import { attackEffect, energyEffect, powerEffect, trainerEffect, type Attack, type CardDef, type CardLibrary, type EnergyType, type PokemonCardDef, type Stage } from '@poke-tcg/game-engine';
import { pokedexLength } from './lengths.js';

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

/**
 * A holo Energy's style, or null for any other card. Holo Energy is basic Energy for the deck rules (no limit by name),
 * but it's only found in packs: locked until pulled, and a deck holds no more copies than were pulled.
 */
export const holoEnergyStyle = (card: Pick<Card, 'data'>): HoloEnergyStyle | null => (card.data as CardData).holoEnergy ?? null;

/** A card's name for messages: a holo Energy's says its style ("Fire Energy (Rainbow holo)"). */
export const cardLabel = (card: Pick<Card, 'name' | 'data'>) => {
  const style = holoEnergyStyle(card);
  return style ? `${card.name} (${style.label} holo)` : card.name;
};

/** Stage 1 Pokémon printed as evolving from Mysterious Fossil, which TCGdex leaves out. */
const FROM_MYSTERIOUS_FOSSIL = new Set(['Omanyte', 'Kabuto', 'Aerodactyl']);

/** Baby Pokémon promos, which TCGdex lists as Basic (Neo-era Babies have the stage "Baby"). */
/** Baby Pokémon TCGdex lists as Basic: the promos, Neo Genesis's Pichu, Cleffa, Elekid and Magby, Neo Discovery's Igglybuff and Tyrogue, and Neo Revelation's Smoochum. */
const BABIES = new Set(['basep-31', 'basep-35', 'basep-36', 'neo1-12', 'neo1-20', 'neo1-22', 'neo1-23', 'neo2-40', 'neo2-66', 'neo3-54']);

/** Gym Heroes evolutions TCGdex leaves out, by name (without the owner). */
const TCGDEX_MISSING_EVOLVES_FROM: Record<string, string> = { "Lt. Surge's Magneton": 'Magnemite' };

/** The owner in an owner's Pokémon's name (Gym Heroes, Gym Challenge): "Brock's Rhydon" → "Brock's ". */
const OWNER = /^((?:Blaine|Brock|Erika|Lt\. Surge|Misty|Sabrina|Giovanni|Koga|Rocket)'s )/;

/** What the card evolves from, filling in TCGdex's gaps. */
const evolvesFrom = (card: Pick<Card, 'name' | 'stage' | 'evolveFrom'>) => {
  // Team Rocket's Dark Stage 2 Pokémon evolve from the Dark Stage 1 (Dark Alakazam from Dark Kadabra); TCGdex has the plain one.
  if (card.stage === 'Stage2' && card.name.startsWith('Dark ') && card.evolveFrom && !card.evolveFrom.startsWith('Dark ')) return `Dark ${card.evolveFrom}`;
  // An owner's Pokémon evolves from the same owner's (Brock's Rhydon from Brock's Rhyhorn, as printed); TCGdex has the plain one.
  const owner = card.stage !== 'Basic' && card.stage !== 'Baby' ? card.name.match(OWNER)?.[1] : undefined;
  const from = card.evolveFrom ?? TCGDEX_MISSING_EVOLVES_FROM[card.name];
  // Gym Challenge's Nidoran are named "Giovanni's Nidoran ♀" (with a space), unlike the plain "Nidoran♀".
  if (owner && from) return (from.startsWith(owner) ? from : `${owner}${from}`).replace(/Nidoran([♀♂])$/, 'Nidoran $1');
  return card.evolveFrom ?? (card.stage === 'Stage1' && FROM_MYSTERIOUS_FOSSIL.has(card.name) ? 'Mysterious Fossil' : null);
};

/**
 * Holofoils TCGdex lists as normal printings only: the Wizards Black Star Promos Venusaur (13) and Cool Porygon (15),
 * which were printed holo like the other holo promos (Eevee, Mew, Meowth…).
 */
const TCGDEX_MISSING_HOLO = new Set(['basep-13', 'basep-15']);

/** Whether the card was printed as a holofoil. */
export const isHolo = (card: Pick<Card, 'id' | 'data'>) => (card.data as CardData).variants?.holo === true || TCGDEX_MISSING_HOLO.has(card.id);

/**
 * Cards with galaxy foil over the whole face except the art. TCGdex has no flag for it: these are
 * the reverse-only printings, minus Scizor (basep-33), which is reverse-only but silver foil.
 */
const GALAXY_FOIL = new Set(['basep-34', 'basep-35', 'si1-1', 'si1-4', 'si1-7', 'si1-11', 'si1-14', 'si1-17']);

/** Base Set 2's holo rares are shown with the galaxy foil, to set them apart from the originals they reprint (agreed with the user). */
const isBase2Holo = (card: Pick<Card, 'id' | 'data'>) => card.id.startsWith('base4-') && isHolo(card);

export const isGalaxyFoil = (card: Pick<Card, 'id' | 'data'>) => GALAXY_FOIL.has(card.id) || isBase2Holo(card);

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

/** The card's Pokémon Power, if it has one. */
/** The card's Pokémon Power, with the printed name and text where TCGdex's differ (the power's effect carries them: Downpour, Unown [M]). */
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
export const isBasicEnergyCard = (card: Pick<Card, 'kind' | 'data'>) => card.kind === 'ENERGY' && (card.data as CardData).energyType === 'Normal';

/**
 * Whether the engine implements everything on the card: every attack with text, its Pokémon Power, its
 * Trainer effect, or (Energy) a basic Energy, Double Colorless or a special Energy with an effect (Rainbow). Other cards still load: their attacks
 * do plain damage, and their powers, Trainer effects and special Energy effects do nothing.
 */
export function isImplemented(card: Pick<Card, 'id' | 'name' | 'kind' | 'data'>): boolean {
  const data = card.data as CardData;
  if (card.kind === 'POKEMON') {
    const attacks = printedAttacks(data).every((a) => !a.effect || attackEffect(card.id, attackName(a)));
    return attacks && (!data.abilities?.length || powerEffect(card.id) !== undefined);
  }
  if (card.kind === 'TRAINER') return trainerEffect(card.id) !== undefined;
  return isBasicEnergyCard(card) || card.name === 'Double Colorless Energy' || energyEffect(card.id) !== undefined;
}

/** Converts a catalog row into the engine's card definition. */
export function toCardDef(card: Card): CardDef {
  const imageUrl = card.imageUrl;
  if (card.kind === 'POKEMON') {
    const stage = card.stage && STAGES[card.stage];
    const [type] = card.types;
    if (!stage || !type || card.hp == null) throw new Error(`Card ${card.id} is missing stage, type or HP`);
    const data = card.data as CardData;
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
    const length = pokedexLength(data.dexId?.[0]);
    return { id: card.id, kind: 'pokemon', name: card.name, imageUrl, type: energyType(type), hp: card.hp, stage, evolvesFrom: evolvesFrom(card), attacks, power: power(data, card.id), weakness: weakness(data), resistance: resistance(data), retreatCost: data.retreat ?? 0, holo: isHolo(card), ...(baby && { baby }), ...(length && { length }) };
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
    // Rainbow Energy counts as every type while attached (1 at a time).
    if (card.name === 'Rainbow Energy') return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: 'colorless', anyType: true, basic: false, holo: isHolo(card) };
    // Full Heal, Potion and Recycle Energy provide Colorless (their effects are the engine's); Darkness and Metal Energy 1 Energy of their type.
    return { id: card.id, kind: 'energy', name: card.name, imageUrl, energyType: known ? named : 'colorless', basic: false, holo: isHolo(card) };
  }
  const text = (card.data as CardData).effect ?? '';
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
      holo: isHolo(card),
    };
  }
  return { id: card.id, kind: 'trainer', name: card.name, imageUrl, text, holo: isHolo(card) };
}

/** Loads the definitions for the given card ids from the catalog. */
export async function loadCardLibrary(ids: Iterable<string>): Promise<CardLibrary> {
  const unique = [...new Set(ids)];
  const rows = await prisma.card.findMany({ where: { id: { in: unique } } });
  const missing = unique.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) throw new Error(`Cards not found in catalog: ${missing.join(', ')}`);
  const library: CardLibrary = Object.fromEntries(rows.map((r) => [r.id, toCardDef(r)]));
  // Pokémon Breeder needs the Basic at the bottom of each Stage 2 line: look up its Stage 1 by name.
  const stage2 = Object.values(library).filter((d): d is PokemonCardDef => d.kind === 'pokemon' && d.stage === 'stage2' && d.evolvesFrom !== null);
  if (stage2.length) {
    const stage1 = await prisma.card.findMany({
      where: { kind: 'POKEMON', stage: 'Stage1', name: { in: stage2.map((d) => d.evolvesFrom!) } },
      select: { name: true, stage: true, evolveFrom: true },
    });
    for (const d of stage2) {
      const line = stage1.find((s) => s.name === d.evolvesFrom && evolvesFrom(s));
      d.evolvesFromBasic = line ? evolvesFrom(line) : null;
    }
  }
  return library;
}
