export type EnergyType =
  | 'grass'
  | 'fire'
  | 'water'
  | 'lightning'
  | 'psychic'
  | 'fighting'
  | 'darkness'
  | 'metal'
  | 'colorless';

export type Stage = 'basic' | 'stage1' | 'stage2';

export interface Attack {
  name: string;
  /** 'colorless' in a cost can be paid by any energy. */
  cost: EnergyType[];
  /** Base damage: the number in printed values like "30+" or "20×"; effects work out the rest. */
  damage: number;
  /** Printed damage, e.g. "30+", "20×" or "?" (missing in older games). */
  damageText?: string | null;
  /** Printed attack text. Not implemented by the engine yet – shown for reference only. */
  text: string | null;
}

export interface PokemonCardDef {
  id: string;
  kind: 'pokemon';
  name: string;
  imageUrl: string | null;
  type: EnergyType;
  hp: number;
  stage: Stage;
  /** Name of the Pokémon this evolves from (null for Basics). */
  evolvesFrom: string | null;
  /** Other names it's printed to evolve from (EX Unseen Forces Blissey ex: Chansey or Chansey ex). */
  alsoEvolvesFrom?: string[];
  /** Stage 2 only: name of the Basic at the bottom of its line, for Pokémon Breeder. Missing in older games. */
  evolvesFromBasic?: string | null;
  attacks: Attack[];
  /** Takes `multiplier`× damage from attackers of this type. Missing in games created before it was stored. */
  weakness?: { type: EnergyType; multiplier: number } | null;
  /** Takes `amount` less damage from attackers of this type. Missing in games created before it was stored. */
  resistance?: { type: EnergyType; amount: number } | null;
  /** Pokémon Power printed on the card, if any (the effect lives in the engine's effects/). */
  power?: { name: string; text: string } | null;
  /** Energy to discard to retreat (any type). Missing in games created before it was stored: treated as 0. */
  retreatCost?: number;
  /** Printed as a holofoil. Display only. */
  holo?: boolean;
  /** The Pokédex length printed on the card, e.g. `6' 3"` (Blaine's Quiz #1). Missing when it isn't known. */
  length?: string;
  /**
   * A Baby Pokémon (Cleffa, Pichu…): a Basic with the Baby Pokémon rule. When it's the Active Pokémon and the
   * opponent attacks, they flip a coin first; on tails their turn ends. Missing = not a Baby.
   */
  baby?: boolean;
  /** A Pokémon-ex (EX series): when it's Knocked Out, its opponent takes 2 Prize cards. Missing = not one. */
  ex?: boolean;
  /**
   * Set on a Trainer card played as a Pokémon (Clefairy Doll): its printed text. It's a Trainer card
   * in the hand, deck and discard pile, and not a Basic Pokémon card for setup or searches.
   */
  trainerText?: string;
  /** Every type it is, when it's more than one (printed on the card, or Kecleon's Energy Variation in play: inPlayDef). `type` is the first. */
  types?: EnergyType[];
  /** The types of a second printed Weakness (or more), the same multiplier as `weakness`: applied once however many match (agreed). */
  moreWeakness?: EnergyType[];
  /** The types of a second printed Resistance (or more), the same amount as `resistance`: applied once (agreed). */
  moreResistance?: EnergyType[];
}

/** Whether the Pokémon is of `type`: its type, or one of its types (Energy Variation). */
export const hasType = (def: Pick<PokemonCardDef, 'type' | 'types'>, type: EnergyType) => def.type === type || !!def.types?.includes(type);

/** Every type the Pokémon is. */
export const typesOf = (def: Pick<PokemonCardDef, 'type' | 'types'>): EnergyType[] => def.types ?? [def.type];

/**
 * The prefixes and marks a card name may add to a Pokémon's name (agreed: every variant): an owner's (Team Aqua's Seviper,
 * Brock's Onix, Rocket's Scizor, Lt. Surge's Raichu), Dark, Light and Shining Pokémon, δ and Gold Star (☆) Pokémon.
 */
const VARIANT_NAME = /^(?:[A-Z][\w.]*(?: [A-Z][\w.]*)?'s|Dark|Light|Shining) | (?:δ|☆|Star)$/g;

/**
 * "A Pokémon that has an owner in its name" (Ancient Tomb, the Ancient Technical Machines; agreed): Team Aqua's and Team
 * Magma's Pokémon, the Gym Heroes owners' (Brock's, Lt. Surge's…) and Rocket's. Dark and Light Pokémon have no owner.
 */
export const hasOwner = (name: string) => /^[A-Z][\w.]*(?: [A-Z][\w.]*)?'s /.test(name);

/**
 * Whether a card called `name` counts as `wanted` when an effect names a Pokémon ("If the Defending Pokémon is Seviper",
 * "Search your deck for Omanyte"): the same name, or a variant of it (agreed: Team Aqua's Seviper, Kabuto δ, Dark Golbat…).
 * Only a Pokémon-ex never counts as its non-ex name, or the other way round (agreed, for every rule).
 */
export const namesMatch = (name: string, wanted: string) => name === wanted || name.replace(VARIANT_NAME, '') === wanted.replace(VARIANT_NAME, '');

export interface EnergyCardDef {
  id: string;
  kind: 'energy';
  name: string;
  imageUrl: string | null;
  /** Type of energy it provides ('colorless' for Double Colorless Energy). */
  energyType: EnergyType;
  /** Energy it provides (2 for Double Colorless Energy). Missing = 1. */
  amount?: number;
  /** False for special Energy (Double Colorless), which isn't a basic Energy card. Missing = basic. */
  basic?: boolean;
  /** Rainbow Energy: while attached, it counts as every type of basic Energy (1 at a time). */
  anyType?: boolean;
  /** Printed as a holofoil. Display only. */
  holo?: boolean;
}

export interface TrainerCardDef {
  id: string;
  kind: 'trainer';
  name: string;
  imageUrl: string | null;
  text: string;
  /** Printed as a holofoil. Display only. */
  holo?: boolean;
}

export type CardDef = PokemonCardDef | EnergyCardDef | TrainerCardDef;

/** Card definitions by id. Built from the database and stored in each game's state. */
export type CardLibrary = Record<string, CardDef>;

export function lookupCard(cards: CardLibrary, defId: string): CardDef {
  const def = cards[defId];
  if (!def) throw new Error(`Unknown card: ${defId}`);
  return def;
}

/** A Basic Pokémon card (not a Trainer played as one, like Clefairy Doll). */
export const isBasicPokemon = (def: CardDef): def is PokemonCardDef & { stage: 'basic' } =>
  def.kind === 'pokemon' && def.stage === 'basic' && !def.trainerText;

/** A Pokémon card: Basic or Evolution (not Clefairy Doll). */
export const isPokemonCard = (def: CardDef): def is PokemonCardDef => def.kind === 'pokemon' && !def.trainerText;

/** A Trainer card, including one played as a Pokémon (Clefairy Doll). */
export const isTrainerCard = (def: CardDef) => def.kind === 'trainer' || (def.kind === 'pokemon' && def.trainerText !== undefined);

/** A basic Energy card (not Double Colorless Energy). */
export const isBasicEnergy = (def: CardDef) => def.kind === 'energy' && def.basic !== false;

/** A Pokémon that can't be affected by Special Conditions by its own rule: a Trainer played as one (Clefairy Doll), or Buried Fossil. */
export const conditionProof = (def: CardDef) => def.kind === 'pokemon' && (def.trainerText !== undefined || def.name === 'Buried Fossil');

/** Can be played onto the Bench: a Basic Pokémon, or a Trainer played as one. */
export const isBenchable = (def: CardDef) => def.kind === 'pokemon' && def.stage === 'basic';
