// The Idle Adventure's data types (README: Idle Adventure): the shapes of the generated tables (data/gen1/, by
// tools/idle/firered_data.py) and of a Pokémon as a run keeps it. Stats are always in the order HP, Attack, Defense,
// Sp. Atk, Sp. Def, Speed (the games' summary order), never the battle engine's internal one.

export type TypeName =
  | 'normal' | 'fighting' | 'flying' | 'poison' | 'ground' | 'rock' | 'bug' | 'ghost' | 'steel' | 'mystery'
  | 'fire' | 'water' | 'grass' | 'electric' | 'psychic' | 'ice' | 'dragon' | 'dark';

export type GrowthRate = 'mediumFast' | 'erratic' | 'fluctuating' | 'mediumSlow' | 'fast' | 'slow';

/** Six numbers, one per stat: HP, Attack, Defense, Sp. Atk, Sp. Def, Speed. */
export type Stats = [number, number, number, number, number, number];

export interface Evolution {
  /** 'level', 'item' (a stone), 'trade', 'friendship'…: the game's EVO_ method. Trades evolve on level-up at TRADE_LEVELS. */
  method: string;
  into: number;
  level?: number;
  item?: string;
}

export interface SpeciesData {
  /** National Pokédex number. */
  id: number;
  key: string;
  name: string;
  types: TypeName[];
  base: Stats;
  catchRate: number;
  baseExp: number;
  evYield: Stats;
  growth: GrowthRate;
  /** 0–254: the chance in 255 of being female (0 always male, 254 always female); 255 genderless. */
  genderRatio: number;
  abilities: string[];
  /** [level, move], in the game's order (level 1's first). */
  learnset: [number, string][];
  evolutions: Evolution[];
  /** Its party icon's palette (0–2). */
  icon: number;
  /** Its Pokédex entry (FireRed's): category, height in tenths of a metre, weight in tenths of a kilo (Low Kick), text. */
  category: string;
  height: number;
  weight: number;
  dexText: string;
  /**
   * Where the battle screen draws it (FireRed's GetBattlerSpriteFinal_Y): its front and back pictures' y_offset, in game
   * pixels (lowered so it stands on its spot), and the foe's elevation (fliers and floaters raised).
   */
  pic: { frontY: number; backY: number; elevation: number };
}

export interface MoveData {
  name: string;
  type: TypeName;
  power: number;
  accuracy: number;
  pp: number;
  /** battle_moves.h's EFFECT_, lower case (EFFECT_HIT: 'hit'): the move's implementation (moves.ts's EFFECTS). */
  effect: string;
  /** The secondary effect's chance in percent. */
  chance: number;
  target: string;
  priority: number;
  flags: string[];
}

export interface ItemData {
  name: string;
  price: number;
  pocket: string;
  hold: string;
  holdParam: number;
}

/** A wild encounter table: its rate and its slots, [min level, max level, dex number]. */
export interface EncounterSlots {
  rate: number;
  mons: [number, number, number][];
}

export interface EncounterTable {
  land?: EncounterSlots;
  water?: EncounterSlots;
}

export interface TrainerMonData {
  species: number;
  level: number;
  /** The game's 0–255 scale: each IV is iv * 31 / 255. */
  iv: number;
  item?: string;
  /** Its moves; the species' last 4 level-up moves at its level when not given (as the game). */
  moves?: string[];
}

export interface TrainerData {
  class: string;
  name: string;
  /** Prize money per level of their last Pokémon. */
  money: number;
  pic: string;
  female: boolean;
  /** Bag items they use in battle (Potions, Full Restores). */
  items: string[];
  party: TrainerMonData[];
}

/** A Pokémon as a run keeps it (plain JSON). Its HP isn't kept: the party is fully healed after every battle. */
export interface Mon {
  /** Unique within the run. */
  uid: string;
  species: number;
  level: number;
  /** Total experience points. */
  exp: number;
  ivs: Stats;
  evs: Stats;
  /** 0–24, the game's order (Hardy, Lonely…). */
  nature: number;
  gender: 'male' | 'female' | null;
  /** Which of its species' abilities (0 or 1). */
  abilitySlot: number;
  /** Every level-up move it has learned, oldest first (all kept: no forgetting; agreed). */
  moves: string[];
  /** The up to 3 moves in its slots, highest priority first (the player's, or picked by `autoSlots`). */
  slots: string[];
  /** The slots are picked automatically (the 3 strongest, newest first on ties) until the player sets them. */
  autoSlots: boolean;
  /** A held item (trainers' Pokémon only, for now). */
  item?: string;
  /** Shiny (a wild one's 1 in 8192, kept when caught; agreed with the user: shown and recorded). */
  shiny?: boolean;
}
