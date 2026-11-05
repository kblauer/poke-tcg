// The Idle Adventure's data types (README: Idle Adventure): the shapes of the generated tables (data/gen1/, by
// tools/idle/firered_data.py; data/gen2/, by tools/idle/hgss_data.py, with Gen 4's fields) and of a Pokémon as a run keeps it. Stats are always in the order HP, Attack, Defense,
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
  /** Gen 4's: the move it must know (has_move), the species in the party (other_party_mon), the beauty (beauty). */
  move?: string;
  with?: number;
  beauty?: number;
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
  /** Gen 4's: its base friendship (friendship evolutions) and the items wild ones hold, [common, rare]. */
  friendship?: number;
  heldItems?: [string | null, string | null];
}

export interface MoveData {
  name: string;
  type: TypeName;
  /** Gen 4's split (the move's own); Gen 3's is its type's (isPhysical). */
  category?: 'physical' | 'special' | 'status';
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
  /** Its description as the game prints it (Gen 4's tables). */
  description?: string;
}

export interface ItemData {
  name: string;
  price: number;
  pocket: string;
  hold: string;
  holdParam: number;
  /** Its description as the game prints it (the shop's), its lines split by 
. */
  description: string;
  /** Gen 4's: Fling's power, and Natural Gift's power and type (Berries). */
  flingPower?: number;
  naturalGift?: [number, TypeName];
}

/** A wild encounter table: its rate and its slots, [min level, max level, dex number]. */
export interface EncounterSlots {
  rate: number;
  mons: [number, number, number][];
  /** LeafGreen's Pokémon where its slots differ (the user's, 2026-10-27): [slot, min level, max level, dex number], half the time. */
  leafGreen?: [number, number, number, number][];
  /** Pokémon the game only gives, trades or sells, added to the table (the user's, 2026-10-27): EXTRA_PERCENT of its encounters each. */
  extra?: [number, number, number][];
  /** HGSS's land tables (the run's play clock, the user's, 2026-11-04): the morning's and the night's slots where they differ from the day's (`mons`). */
  morning?: [number, number, number][];
  night?: [number, number, number][];
  /** SoulSilver's Pokémon where its slots differ from HeartGold's, by time of day: [slot, min level, max level, dex number], half the time. */
  soulSilver?: { morning?: [number, number, number, number][]; day?: [number, number, number, number][]; night?: [number, number, number, number][] };
}

export interface EncounterTable {
  land?: EncounterSlots;
  water?: EncounterSlots;
  /** Fished (the user's, 2026-10-27): its 10 slots the Old Rod's 2, the Good Rod's 3 and the Super Rod's 5. */
  fishing?: EncounterSlots;
  /** HGSS's: Rock Smash, and each rod's own 5 slots. */
  rockSmash?: EncounterSlots;
  oldRod?: EncounterSlots;
  goodRod?: EncounterSlots;
  superRod?: EncounterSlots;
  /** HGSS's: the night's fished Pokémon (20:00–03:59: the Good Rod's slot 3, the Super Rod's slot 1). */
  nightFish?: number;
}

export interface TrainerMonData {
  species: number;
  level: number;
  /** The game's 0–255 scale: each IV is iv * 31 / 255. */
  iv: number;
  item?: string;
  /** Its moves; the species' last 4 level-up moves at its level when not given (as the game). */
  moves?: string[];
  /** Gen 4's: the ability set by the trainer's data (0 or 1); by the game's personality otherwise. */
  abilitySlot?: number;
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
  /** A double battle in the game (Gen 4's: Twins…). */
  double?: true;
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
