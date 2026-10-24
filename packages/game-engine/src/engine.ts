/// <reference path="./globals.d.ts" />
import { applyWeaknessResistance, attackSituation, checkAttack, performAttack, recallsAttacks, usableAttacks, type AttackChoices } from './attacks.js';
import { attachBlocked, discardsLocked, energyFromHand, evolutionBlocked, primalBlock, retreatBodies, guardedBy, spiraledBy, bindingAura, conditionBarred, conditionFree, holonWith, miraculousWind, offerChainReaction, playedFromHand, pokemonAt, powerActive, refreshTransforms, retreatAid, deepSleep, hotPlate, stickyGoo, trainerProof, primalLocked, trainersDusted, trainersBlocked, usePower, zoomed, type PowerChoices, type PowerEffect } from './powers.js';
import { evolvesFromEevee, evolveWith, playTrainer, resolvePending, stadiumError, trainersLocked, TRAINERS_LOCKED, type PendingChoice, type TrainerChoices } from './trainers.js';
import { energyEffect, powerEffect, trainerEffect } from './effects/index.js';
import { conditionProof, hasOwner, hasType, holonEnergy, namesMatch, isBasicEnergy, isBasicPokemon, isBenchable, isTrainerCard, lookupCard, type Attack, type CardDef, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { addLog, baseUid, clearOnLeavingActive, clearSpecialConditions, effectId, isDelta, evolvedHook, hasSpecialCondition, shapeshiftCard, flipCoin, inPlayDef, logTool, openBenchSlot, pokemonName, revealFaceDown, type LogEntry } from './status.js';
import { shuffle } from './rng.js';
import type { CpuDifficulty } from './cpu/index.js';

export type PlayerId = string;

export interface CardInstance {
  /** Unique within a game, e.g. "p1-17". */
  uid: string;
  defId: string;
  /** Set on a non-Energy card attached as Energy (Buzzap): the energy it provides. */
  provides?: { type: EnergyType; amount: number };
  /**
   * Energy Converter: this basic Energy card is treated as `type` until the end of the turn, while the Porygon2 whose
   * top card is `by` works (refreshConverted). `activeOnly` (Ion Coating): also until its Pokémon leaves the Active spot.
   * `untied` (Burning Energy, Ion Coating): until the end of the turn, whatever becomes of the Pokémon that used it.
   */
  converted?: { type: EnergyType; by: string; activeOnly?: boolean; untied?: boolean };
  /** Miraculous Wind: this attached Special Energy card provides Colorless Energy only and its other effects stop (refreshWind). */
  windless?: boolean;
  /** Multi Energy beside another Special Energy card on its Pokémon: it provides Colorless Energy only (refreshMultiEnergy). */
  colorlessOnly?: boolean;
  /** Holon Research Tower: this basic Energy card on a δ Pokémon is Metal too, 1 Energy at a time (refreshHideout, energyPool). */
  holonMetal?: boolean;
  /** Scramble Energy while its owner has more Prize cards left: 3 Energy, each of any type (dropBoostEnergy, energyPool). */
  scrambled?: boolean;
  /** Reactive Booster: this React Energy card provides 2 Energy of every type (refreshHideout, energyPool). */
  reactBoost?: boolean;
  /** Crystal Beach: this Special Energy card provides 1 Colorless Energy whenever it would provide 2 or more (refreshHideout, energyPool). */
  beached?: boolean;
  /** Chlorophyll: this card provides only Colorless Energy on a Grass Pokémon whose player's Venusaur works: Grass instead (refreshHideout, energyPool). */
  chlorophyll?: boolean;
}

/** Energy that pays for a Crystal Energy card: one of these types (`crystal:fire,water`), chosen as the cost needs. */
export type CrystalEnergy = `crystal:${string}`;

/** Asleep, Confused and Paralyzed replace each other; Poison and Burned are tracked separately (InPlayPokemon.poison, .burned). */
export type SpecialCondition = 'asleep' | 'confused' | 'paralyzed';

/** Something an attack did to a Pokémon besides damage, as Mirror Move reflects it. */
export type Affliction = SpecialCondition | 'poisoned' | 'toxic' | 'burned';

/**
 * A rule from outside the cards (a run's events and items). `label` names it on the screen and in the log.
 * - `typeDamage`: attacks by Pokémon of `type` (either player's) do `multiplier`× their base damage.
 * - `damageBonus`: attacks by `player`'s Pokémon (of `type`, if given) do `amount` more base damage.
 * - `damageGuard`: attacks do `amount` less damage to `player`'s Pokémon (of `type`, if given), after Weakness and Resistance.
 * - `conditionGuard`: the opponent's attacks can't give `player`'s Pokémon these conditions (Poisoned covers toxic poison).
 * - `openingHand`: `player` draws `cards` more cards before the game starts.
 * - `luckyFlips`: `player`'s next `flips` coin flips are heads (it counts down).
 */
export type BattleRule = (
  | { kind: 'typeDamage'; type: EnergyType; multiplier: number }
  | { kind: 'damageBonus'; player: PlayerId; amount: number; type?: EnergyType }
  | { kind: 'damageGuard'; player: PlayerId; amount: number; type?: EnergyType }
  | { kind: 'conditionGuard'; player: PlayerId; conditions: Exclude<Affliction, 'toxic'>[] }
  | { kind: 'openingHand'; player: PlayerId; cards: number }
  | { kind: 'luckyFlips'; player: PlayerId; flips: number }
) & { label?: string };

/**
 * Lasting effects of attacks on a Pokémon. Turn numbers are the last turn the effect applies
 * ("during your opponent's next turn" = the turn after the attack). All are removed when the
 * Pokémon is benched or evolves, except `leekSlapUsed`.
 */
export interface PokemonEffects {
  /** Prevent all damage done to it by attacks (Scrunch, Withdraw, Stiffen). */
  preventDamage?: number;
  /** Prevent all effects of attacks, including damage (Barrier, Agility). */
  preventAll?: number;
  /** Prevent attack damage of 30 or less (Harden). */
  harden?: number;
  /** If an attack Knocks it Out, Knock Out the attacker (Destiny Bond). */
  destinyBond?: number;
  /** Its attacks only happen on heads (Sand-attack). */
  sandAttack?: number;
  /** The same as Sand-attack, from Smokescreen. */
  smokescreen?: number;
  /** Damage done to it by attacks is reduced by 20, after weakness and resistance (Minimize). */
  minimize?: number;
  /** It can't use this attack (Amnesia). */
  amnesia?: { attack: string; until: number };
  /** Weakness type changed by Conversion 1. */
  weakness?: EnergyType;
  /** Resistance type changed by Conversion 2. */
  resistance?: EnergyType;
  /** All its energy is Fire this turn (Energy Burn). */
  energyBurn?: number;
  /** It can't retreat (Acid). */
  noRetreat?: number;
  /** It can't attack the Pokémon whose `target` is its baseUid (Tail Wag, Leer). */
  cantAttack?: { target: string; until: number };
  /**
   * Its attacks do `amount` less damage to the Pokémon whose baseUid is `target` (Pounce, Snivel, Growl):
   * after weakness and resistance, or before them with `beforeWeakness` (Togepi's Snivel).
   */
  pounce?: { target: string; amount: number; until: number; beforeWeakness?: boolean };
  /** Attack damage to it is halved, rounded down to the nearest 10 (Light Screen). */
  lightScreen?: number;
  /** Attack damage to it is done back to the attacker, without Weakness or anything else (Mirror Shell). */
  mirrorShell?: number;
  /** The turn its Slash does 60 base damage (Swords Dance: its owner's next turn). */
  swordsDance?: number;
  /** Leek Slap can't be used again while it stays in play. */
  leekSlapUsed?: boolean;
  /** What the opponent's last attack on it did, for Mirror Move. */
  attackedOn?: { turn: number; damage: number; afflictions: Affliction[] };
  /** It can't attack (Suggestion on the Defending Pokémon; Tunneling on the attacker, through its owner's next turn). */
  noAttack?: number;
  /** Stockpile: through its owner's next turn, Spit Up and Swallow do more. */
  stockpile?: number;
  /** Its owner can't attach Energy cards to it (Crystal Beam). */
  noEnergy?: number;
  /** Whenever it's attacked, the attacker flips; tails does no damage to it. Lasts until it takes damage (Shadow Images). */
  shadowImages?: boolean;
  /** Whenever an attack damages it, 10 damage back to the attacker, with Weakness and Resistance (Fire Wall). */
  fireWall?: number;
  /** The turn its Gnaw does double base damage (Focus Energy: its owner's next turn). */
  focusEnergy?: number;
  /** When an attack damages it, flip; heads does double that damage back, with Weakness and Resistance (Crosscounter). */
  crosscounter?: number;
  /** Attack damage to it is `amount` less, after Weakness and Resistance, through turn `until` (Lie Low, Barrier Attack). */
  reduceDamage?: { amount: number; until: number };
  /** Attack damage to it is `amount` less, before Weakness and Resistance, through turn `until` (Delta Reduction). */
  reduceBefore?: { amount: number; until: number };
  /** It has no Weakness through this turn (Aqua Flower). */
  weaknessOffUntil?: number;
  /** On turn `turn`, its attacks do `amount` more to the Defending Pokémon, before Weakness and Resistance (Crystal Laser). */
  nextTurnMore?: { amount: number; turn: number };
  /** The last attack it used, and when (Earthdrill needs Lie Low the turn before). */
  lastAttack?: { name: string; turn: number };
  /** Attacks it can't use again while it stays in play, even if it's benched (Hyper Needle, Ancestral Memory). */
  usedOnce?: string[];
  /** Giant Growth: its maximum HP are 80 and its Pound does 30 (benching it ends this). */
  giantGrowth?: boolean;
  /** Ink Spurt: its attacks need heads, until it evolves or is benched. */
  inkSpurt?: boolean;
  /** Attacks that damage it do 20 more (after Weakness and Resistance), through this turn (Screech). */
  screech?: number;
  /** Silver Wind: the turn the opponent's attacks that damage it do 30 more, after Weakness and Resistance. */
  silverWind?: number;
  /** Extra Comet Punch: the turn its Extra Comet Punch does 50 more. */
  cometPunch?: number;
  /** Advanced Armor: until this turn, attacks by the opponent's Evolved Pokémon don't affect it. */
  evolvedProof?: number;
  /** Psychic Shield: until this turn, attacks by the opponent's Pokémon-ex don't affect it. */
  exProof?: number;
  /** Pivot Throw: until this turn, attacks do 10 more damage to it, before Weakness and Resistance. */
  pivot?: number;
  /** Hustle Punch: the turn its base damage is 50 instead of 70. */
  hustle?: number;
  /** Extra Comet Punch, Standing By, Steep Dive: on `turn`, this attack of its does more (its own rule). */
  boostedAttack?: { attack: string; turn: number };
  /** If an attack would Knock it Out, it's left with 10 HP instead, through this turn (Endure). */
  endure?: number;
  /** It can't become Asleep, Confused, Paralyzed or Poisoned, through this turn (Pollen Shield). */
  pollenShield?: number;
  /** It can't become affected by any Special Condition, Burned included, through this turn (Skyridge's Pollen Shield). */
  conditionProof?: number;
  /** It can't attack until it's benched or evolves (Freeze). */
  frozen?: boolean;
  /** It can't retreat until it's benched or evolves (Spider Web). */
  stuck?: boolean;
  /**
   * It can't retreat while the opponent's Active Pokémon is the one that held it (`by`, its top card's uid: benching or
   * evolving it ends this): Mean Look. Jaw Clamp and Sticky Nectar also stop any effect from changing its owner's Active
   * Pokémon (`switches`), and last through turn `until`.
   */
  heldBy?: { by: string; until?: number; switches?: boolean };
  /** Attack damage to it of `amount` or less (after Weakness and Resistance) is prevented, through turn `until` (Metapod's Harden). */
  preventUpTo?: { amount: number; until: number };
  /** When an attack damages it, its owner flips; heads does the same damage back to the attacker, without Weakness or Resistance (Counter). */
  counter?: number;
  /** When an attack damages it, the attacker is Poisoned and each of the attacking player's benched Pokémon takes 10 (Secrete Poison). */
  secretePoison?: number;
  /** When an attack would damage it, the attacking player flips; tails prevents the damage (Slime). */
  slime?: number;
  /** If it tries to retreat, 10 damage to it (Pursuit). */
  pursuit?: number;
  /** Through this turn, tails flipped for its Electric Bolt on the Pokémon Locked On to it count as heads (Lock-on). */
  lockOn?: number;
  /** Lock-on: the top card uid of the Pokémon that Locked On to it (benching or evolving it ends this). */
  lockedOnBy?: string;
  /** Through this turn, an Energy card its owner attaches to it Poisons it (Triggered Poison). */
  triggeredPoison?: number;
  /**
   * Aqua Trance, Slow-Acting Poison: at the end of turn `turn` (the opponent's next), it's now `affliction`, if it's still the
   * Active Pokémon; benching or evolving it ends this, as it ends Special Conditions (agreed).
   */
  delayed?: { affliction?: 'asleep' | 'poisoned' | 'confused'; counters?: number; turn: number };
  /** The turn it was attacked with Night Eyes (Perish Song); benching or evolving it ends this. */
  nightEyes?: number;
  /** Attacks do nothing to it but damage, through this turn (Light Wave). */
  effectProof?: number;
  /** Attack damage of 30 or more to it (after Weakness and Resistance) is prevented, through this turn (Pulse Guard). */
  pulseGuard?: number;
  /** When an attack would damage it, its owner flips; heads prevents the damage, through this turn (Dodge). */
  dodge?: number;
  /** When an attack damages it, its owner flips; heads prevents the damage and does 20 to the attacker, through this turn (Reflect Shield). */
  reflectShield?: number;
  /** An attack that would Knock it Out leaves it with 10 HP on heads, through this turn (Armor Up). */
  armorUp?: number;
  /** Its attacks do `amount` less damage, before Weakness and Resistance, through turn `until` (Charm). */
  charm?: { amount: number; until: number };
  /** It can't evolve, except by attacks and Pokémon Powers, through this turn (Dark Tentacle). */
  noEvolve?: number;
  /** It costs 1 more to retreat, through this turn (Tentacle Wrap). */
  heavier?: number;
  /** It can't become Asleep, Confused, Paralyzed or Poisoned while it's the Active Pokémon (Flash Touch). */
  flashTouch?: boolean;
  /** Its retreat cost is 0 through this turn (Tailwind). */
  tailwind?: number;
  /** Its Poké-Powers (and Pokémon Powers) don't work, through this turn (Dark Impact); Poké-Bodies still do. */
  noPokePowers?: number;
}

export interface InPlayPokemon {
  /** Top card: the current (most evolved) Pokémon. */
  card: CardInstance;
  /** Cards this Pokémon evolved from, bottom (Basic) first. */
  evolvedFrom: CardInstance[];
  damage: number;
  energy: CardInstance[];
  /** Turn this Pokémon was put into play or last evolved (0 = during setup). */
  playedTurn: number;
  /** Special Condition; only the active Pokémon can have one. Missing in older games. */
  condition?: SpecialCondition | null;
  /** Turn Paralysis was applied; it wears off after its owner's next turn. */
  paralyzedTurn?: number;
  /** Poison damage between turns: 10, or 20 from Toxic. 0 or missing = not Poisoned. */
  poison?: number;
  /** Burned: 20 damage between turns, then a flip; heads cures it. Missing = not Burned. */
  burned?: boolean;
  /** Wild Growth is working for it (refreshWildGrowth): each Grass Energy card attached provides 2 Grass Energy. */
  wildGrowth?: boolean;
  /** A Char counter (Char): after every turn its owner flips, and tails puts 2 damage counters on it. Stays while it's in play. */
  charCounter?: boolean;
  effects?: PokemonEffects;
  /**
   * Trainer cards attached to it (PlusPower, Defender), each discarded after turn `until`, or returned to its owner's hand
   * then with `toHand` (Charity); `activeOnly` ones once it's benched (Koga's Ninja Trick). The Evolution card Shapeshift
   * attached (`shapeshift`, which Brock's Ninetales is treated as: shapeshiftCard) stays until it's discarded. Missing in older games.
   */
  attached?: { card: CardInstance; until: number; toHand?: boolean; activeOnly?: boolean; shapeshift?: boolean; tool?: boolean }[];
  /**
   * The type it's changed to until it leaves play: Venomoth's Shift (until it Shifts again) or a Coloring
   * counter from Smeargle's Paint (until another replaces it).
   */
  shiftedType?: EnergyType;
  /** It has a Lightning Rod marker (Electabuzz, Wizards Promo 46): Lightning Bolt does 20 to it. Stays until it leaves play. */
  lightningRod?: boolean;
  /** Last turn its Pokémon Power doesn't work (Stare), wherever it is. Missing = it works. */
  powerOffUntil?: number;
  /** Ditto's Transform: the id of the card it's a copy of (the Defending Pokémon), kept up to date by refreshTransforms. */
  transformed?: string;
  /** Last turn its "once during your turn" power was used (Step In, Curse). Stays when it moves. */
  powerUsedTurn?: number;
  /** Lt. Surge's Secret Plan: a card from the hand put face down onto the Bench, treated as a Basic Pokémon until it's turned over (revealFaceDown). */
  faceDown?: boolean;
  /** Giovanni: the turn it may evolve even if it was played or evolved this turn, or on the first turn. */
  giovanniTurn?: number;
  /** Gaze switched its power off (`powerOffUntil`) while it's benched: leaving the Bench turns it back on. */
  gazed?: boolean;
  /** Time Travel: an opponent's attack would have Knocked it Out, and a heads shuffles it into its owner's deck instead (resolveKnockouts). */
  timeTravel?: boolean | 'bottom';
  /** Submerge: the turn it's a Water Pokémon (inPlayDef), until it has any Special Condition (refreshConverted). */
  submerged?: number;
  /** Rocket's Hideout is the Stadium in play and it has Dark in its name: 20 more HP (refreshHideout, inPlayDef). */
  hideout?: boolean;
  /** Space Center ('bodies') or Battle Frontier ('all'): its Poké-Powers or Poké-Bodies don't work (refreshHideout). */
  stadiumMuted?: 'bodies' | 'powers' | 'all';
  /** Green Essence: as its player's Active Pokémon, it can't have Special Conditions (refreshHideout, conditionFree). */
  greenEssence?: boolean;
  /** Sunbeam: its HP is now this (refreshHideout, inPlayDef). */
  hpSet?: number;
  /** Stages of Evolution (Hitmonchan), Energy Root: this much more HP (refreshHideout, inPlayDef). */
  hpPlus?: number;
  /** Sidney's Stadium and a Darkness Pokémon: it can't be Asleep, Confused or Paralyzed (refreshHideout, conditionBarred). */
  sidneyGuard?: boolean;
  /** An Imprison marker (Gardevoir ex δ): no Poké-Powers or Poké-Bodies until it leaves play (agreed), or Tropical Heal. */
  imprisoned?: boolean;
  /** A Shock-wave marker (Tyranitar ex δ): Shock-wave can Knock it Out; until it leaves play (agreed), or Tropical Heal. */
  shockwave?: boolean;
  /** Holon Veil: its player's Ampharos δ makes it a Pokémon that has δ on its card (refreshHideout, isDelta). */
  veiled?: boolean;
  /** Put into play by Strange Cave, Holon Fossil or Influence: treated as a Basic Pokémon (inPlayDef). */
  asBasic?: boolean;
  /** Full Flame: the top card it was Burned with, so evolving or devolving keeps it Burned (refreshHideout). */
  flameBurned?: string;
  /** Crystal Type: the type it's changed to until the end of the turn (inPlayDef). */
  crystalType?: EnergyType;
  /** Type Change: the types it has until the end of the turn (inPlayDef). */
  typesCopied?: EnergyType[];
  /** Low Pressure System is the Stadium in play and it's a Grass or Lightning Pokémon: 10 more HP (refreshHideout, inPlayDef). */
  lowPressure?: boolean;
  /** Energy Variation, while it works: the types of the basic Energy cards attached, which it is (refreshHideout, inPlayDef). */
  variedTypes?: EnergyType[];
  /**
   * Time Shard: an opponent's attack's damage is Knocking it Out; up to 2 of its basic Energy cards go back to the hand
   * (resolveKnockouts), or 'asked': its owner was asked which, with more than 2.
   */
  timeShard?: boolean | 'asked';
  /** EXP. ALL (EX FireRed & LeafGreen) was offered for this Knock Out. */
  expAllAsked?: boolean;
  /** Curse Powder and Golden Wing were handled for this Knock Out (attacks.ts, knockedOutEffects). */
  koHandled?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  prizes: CardInstance[];
  active: InPlayPokemon | null;
  /** Fixed slots (length MAX_BENCH); null = empty. Cards stay in the slot they were played to. */
  bench: (InPlayPokemon | null)[];
  /** Last turn this player can't play Trainer cards (Headache). Missing = no limit. */
  noTrainersUntil?: number;
  /** Disconnect: through this turn, the player can't play Trainer cards but Supporters from their hand. */
  noItemsUntil?: number;
  /** Prize cards turned face up (by uid: Card-Flip Game); both players see them. */
  faceUpPrizes?: string[];
  /** Setup: done placing Pokémon (START_BATTLE). Cleared when the battle starts. */
  ready?: boolean;
  /** Last turn attacks can't affect this player's Benched Pokémon (Protective Flame). Missing = none. */
  benchProtectedUntil?: number;
  /** Last turn no Pokémon Powers work (Goop Gas Attack, set on both players). Missing = they work. */
  powersOffUntil?: number;
  /** Ancient Wind: every Poké-Body is ignored this turn (set on both players, removed between turns). Missing = they work. */
  bodiesOffTurn?: number;
  /** Freeze Lock: last turn this player can't attach Energy cards from the hand to their Active Pokémon. */
  freezeLockUntil?: number;
  /** The turn this player last used a Wigglytuff's Good Neighbor (once a turn, whichever Wigglytuff). */
  goodNeighborTurn?: number;
  /** Misty: the turn this player's Pokémon with Misty in its name do `count` × 20 more damage to the Defending Pokémon. */
  misty?: { turn: number; count: number };
  /** Tickling Machine: the hand, set aside face down; it comes back at the end of turn `until`. */
  setAside?: { cards: CardInstance[]; until: number };
  /** Recall: the turn this player's Active Pokémon can use the attacks of the cards it evolved from. */
  recallTurn?: number;
  /** Koga: the turn attacks by this player's Pokémon with Koga in their names poison the Defending Pokémon they damage. */
  kogaTurn?: number;
  /** Blaine: the turn this player may attach 2 Fire Energy cards to 1 Pokémon with Blaine in its name instead of 1 Energy card. */
  blaineTurn?: number;
  /** Transparent Walls: the last turn attack damage to this player's Benched Pokémon is prevented. */
  benchDamageProtectedUntil?: number;
  /** The baseUid of the Active Pokémon when it was last checked (Spikes: a new one during its player's turn). */
  lastActive?: string;
  /** [Quicken]: attacks do nothing to this player's Pokémon with Unown in their names through this turn. */
  quickenUntil?: number;
  /** [Quicken]: the turn this player last used it (only 1 a turn, however many Unown Q they have). */
  quickenTurn?: number;
  /** Ice Pillar: attack damage to this player's Benched Pokémon is prevented through turn `until`, while the Pokémon whose top card is `by` is their Active Pokémon. */
  icePillar?: { until: number; by: string };
  /** The turn this player last played a Supporter card (only one each turn). */
  supporterTurn?: number;
  /** The Supporter card played on `supporterTurn` (Detour uses its effect while it's in play). */
  supporterUid?: string;
  /** The turn this player last attached an Energy card from their hand to their Active Pokémon (Harvest Bounty). */
  activeEnergyTurn?: number;
  /** Last turn this player can't play Supporter cards (Addictive Pollen). */
  noSupportersUntil?: number;
  /** Energy Grounding: the turn this player last used it (once a turn). */
  groundingTurn?: number;
  /** Heal Dance: the turn this player last used it (once a turn, however many Bellossom). */
  healDanceTurn?: number;
  /** Temperamental Weather: the turn this player last used it (once a turn, however many Castform). */
  weatherTurn?: number;
  /** Quick Search: the turn this player last used it (no more than 1 Quick Search a turn). */
  quickSearchTurn?: number;
  /** Form Change: the turn this player last used it (no more than 1 Form Change a turn). */
  formChangeTurn?: number;
  /** Holon Veil works for this player: their Pokémon cards everywhere have δ on them (refreshHideout, isDeltaCard). */
  holonVeil?: boolean;
  /** Happy Dance: the turn this player last used it (no more than 1 Happy Dance a turn). */
  happyDanceTurn?: number;
  /** Powers printed "You can't use more than 1 … Poké-Power each turn" (Delta Heal, Snappy Move, Duplicate): the turn each was last used, by name. */
  powerTurns?: Record<string, number>;
  /**
   * Dragon Dance, Bay Dance: the turn this player's attacks do `dragonDanceMore` (40 if missing) more damage to the Defending
   * Pokémon, before Weakness and Resistance (agreed: never to the Bench); `dragonDanceSource` names the attack for the log.
   */
  dragonDanceTurn?: number;
  dragonDanceMore?: number;
  dragonDanceSource?: string;
  /** The turn Pokémon Park last removed a damage counter for this player (once during each of their turns). */
  parkTurn?: number;
}

export type Phase = 'setup' | 'playing' | 'promote' | 'finished';

export interface GameState {
  /** Incremented on every accepted action; used for optimistic concurrency. */
  version: number;
  rngState: number;
  phase: Phase;
  turn: number;
  playerOrder: [PlayerId, PlayerId];
  currentPlayer: PlayerId;
  /** Set while phase === 'promote': the player who must choose a new active. */
  pendingPromotion: PlayerId | null;
  energyAttachedThisTurn: boolean;
  /** The current player has retreated this turn (once per turn). Missing in older games. */
  retreatedThisTurn?: boolean;
  players: Record<PlayerId, PlayerState>;
  winner: PlayerId | null;
  /** Definitions of every card in both decks, so the engine needs no external lookups. */
  cards: CardLibrary;
  /** A Pokémon Power knocked out the current player's active mid-turn; after promoting, the turn goes on. */
  midTurnPromotion?: boolean;
  /** A search the player must finish (after Computer Search, Pokédex, Prophecy…); nothing else can happen until then. */
  pendingChoice?: PendingChoice;
  /** A card a player looked at with a power (Peek), shown only to them until their next action. */
  peek?: { player: PlayerId; card: CardInstance; label: string };
  /** How the CPU plays this game (cpu/). Missing = DEFAULT_CPU_DIFFICULTY. */
  cpuDifficulty?: CpuDifficulty;
  /** Who the CPU is, for a single battle's screen ("Swimmer Luis"). A run's battles name it from the run instead. */
  opponentName?: string;
  /** Rules from outside the cards, for both players (a run's events, e.g. Fire Pokémon do double damage). */
  rules?: BattleRule[];
  /** The Stadium card in play, shared by both players, and who played it (it goes to their discard pile). */
  stadium?: { card: CardInstance; owner: PlayerId } | null;
  /** Last turn the current player used the Stadium (Lucky Stadium: once during each player's turn). */
  stadiumUsedTurn?: number;
  /** Here Comes Team Rocket!: both players play with their Prize cards face up for the rest of the game. */
  prizesFaceUp?: boolean;
  /** A Trainer just played ends the turn (Minion of Team Rocket, Tickling Machine on tails). */
  endTurnNow?: boolean;
  /** Choices waiting for `pendingChoice` to be finished, asked in order (Bench Guard after an attack, Narrow Gym's second player). */
  queuedChoices?: PendingChoice[];
  /** Psychic Protector: the hand cards the Defending player chose for the attack under way (attacks.ts uses them, attackAction clears them). */
  psychicProtector?: string[];
  /** Blaine: the Pokémon (baseUid) a Fire Energy card went to this turn as the free attachment, or 'done' after the second. */
  blaineAttach?: string;
  /**
   * A Trainer card `player` holds for now but `owner` owns: it goes back to `owner`'s discard pile once played, or at
   * the end of the turn (Sabrina's Psychic Control, Chaos Gym on tails).
   */
  borrowed?: { uid: string; owner: PlayerId; player: PlayerId; chaos?: boolean };
  /** Mind Games let this Trainer card be played (it's being played now): no second question for it. */
  mindGamesPassed?: string;
  /** Recycle Energy cards attached to Pokémon after the last action (by uid): any of them then found in a discard pile goes back to its owner's hand. */
  recycleWatch?: string[];
  /** What happened, oldest first: attacks, coin flips, knockouts… (last LOG_SIZE entries). Missing in older games. */
  log?: LogEntry[];
}

export type Target = 'active' | number; // number = bench slot

export type GameAction =
  | { type: 'SET_ACTIVE'; cardUid: string }
  | { type: 'PLAY_BENCH'; cardUid: string; slot: number }
  | { type: 'ATTACH_ENERGY'; cardUid: string; target: Target }
  | { type: 'EVOLVE'; cardUid: string; target: Target }
  /** `choices` answers the attack's questions (energy to discard, a target…); see attackChoice(). */
  | { type: 'ATTACK'; attackIndex: number; choices?: AttackChoices }
  | { type: 'PROMOTE'; slot: number }
  /** Use the Pokémon Power of the Pokémon at `source`; `choices` answers its questions (see nextPowerChoice). */
  | { type: 'USE_POWER'; source: Target; choices?: PowerChoices }
  /** Swap the active with a benched Pokémon, discarding `energyUids` from the active to pay the retreat cost. */
  | { type: 'RETREAT'; slot: number; energyUids: string[] }
  /** Play a Trainer card from the hand; `choices` answers its questions (see nextTrainerChoice). */
  | { type: 'PLAY_TRAINER'; cardUid: string; choices?: TrainerChoices }
  /** Finish a pending search: the card picked from the deck, the new order of the cards looked at, or how many to draw. */
  | { type: 'RESOLVE_CHOICE'; cardUid?: string; order?: string[]; target?: Target; count?: number }
  /** Setup: take back every Pokémon placed so far. */
  | { type: 'RESET_SETUP' }
  /** Setup: done placing Pokémon; the battle starts once both players are. */
  | { type: 'START_BATTLE' }
  /** Discard a Trainer played as a Pokémon (Clefairy Doll) from play. */
  | { type: 'DISCARD_DOLL'; target: Target }
  /** Use the Stadium card in play (Lucky Stadium), once during the turn. */
  | { type: 'USE_STADIUM' }
  /** Turn over a face-down card on the player's Bench (Lt. Surge's Secret Plan). */
  | { type: 'FLIP_FACE_DOWN'; target: Target }
  /** Discard the Evolution card Shapeshift attached to Brock's Ninetales. */
  | { type: 'DISCARD_SHAPESHIFT'; target: Target }
  | { type: 'END_TURN' }
  | { type: 'CONCEDE' };

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

export const HAND_SIZE = 7;
export const PRIZE_COUNT = 6;
export const MAX_BENCH = 5;

export function opponentOf(state: GameState, playerId: PlayerId): PlayerId {
  const [a, b] = state.playerOrder;
  return playerId === a ? b : a;
}

export interface NewGamePlayer {
  id: PlayerId;
  deck: string[]; // card def ids
}

/** `rules`: battle rules from outside the cards (see BattleRule), in force from the start. */
export function createGame(p1: NewGamePlayer, p2: NewGamePlayer, seed: number, library: CardLibrary, rules: BattleRule[] = []): GameState {
  let rngState = seed;
  const players: Record<PlayerId, PlayerState> = {};
  // Keep only the definitions this game uses.
  const cards: CardLibrary = {};
  for (const defId of [...p1.deck, ...p2.deck]) cards[defId] = lookupCard(library, defId);
  const isBasic = (c: CardInstance) => isBasicPokemon(cards[c.defId]!);

  for (const [i, p] of [p1, p2].entries()) {
    const instances = p.deck.map((defId, n) => ({ uid: `p${i + 1}-${n}`, defId }));
    if (!instances.some(isBasic)) throw new Error(`Deck for ${p.id} has no Basic Pokémon`);
    if (instances.length <= HAND_SIZE + PRIZE_COUNT) {
      throw new Error(`Deck for ${p.id} needs more than ${HAND_SIZE + PRIZE_COUNT} cards (hand + prizes)`);
    }

    // Simplified mulligan: reshuffle until the opening hand contains a Basic.
    let deck: CardInstance[];
    do {
      [deck, rngState] = shuffle(instances, rngState);
    } while (!deck.slice(0, HAND_SIZE).some(isBasic));

    players[p.id] = {
      id: p.id,
      hand: deck.slice(0, HAND_SIZE),
      prizes: deck.slice(HAND_SIZE, HAND_SIZE + PRIZE_COUNT),
      deck: deck.slice(HAND_SIZE + PRIZE_COUNT),
      discard: [],
      active: null,
      bench: Array<InPlayPokemon | null>(MAX_BENCH).fill(null),
    };
  }

  const state: GameState = {
    version: 0,
    rngState,
    phase: 'setup',
    turn: 1,
    playerOrder: [p1.id, p2.id],
    currentPlayer: p1.id,
    pendingPromotion: null,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    players,
    winner: null,
    cards,
    log: [],
  };
  // A coin flip for turn order, called by the first player: heads they go first, tails the second player does.
  const heads = flipCoin(state, TURN_ORDER_FLIP, p1.id);
  state.currentPlayer = heads ? p1.id : p2.id;
  addLog(state, 'Goes first.', state.currentPlayer);
  // Set after the turn-order flip, so a lucky flip doesn't decide who goes first.
  if (rules.length) state.rules = structuredClone(rules);
  for (const rule of rules) {
    if (rule.kind !== 'openingHand') continue;
    const p = players[rule.player];
    if (!p) continue;
    p.hand.push(...p.deck.splice(0, rule.cards));
    addLog(state, `Drew ${rule.cards} extra card${rule.cards === 1 ? '' : 's'}${rule.label ? ` (${rule.label})` : ''}.`, p.id);
  }
  return state;
}

/** The reason on the turn-order coin flip's log entry, so the UI can pick it out. */
export const TURN_ORDER_FLIP = 'Coin flip for turn order';

/** An ending turn's Pokémon Checkup: the state as it began, and as it ended (before the next turn begins). */
export interface Checkup {
  start: GameState;
  end: GameState;
}

/** While `captureCheckup` runs: told the state as an ending turn's Pokémon Checkup begins and ends. */
let onCheckup: ((state: GameState, at: keyof Checkup) => void) | null = null;

/**
 * Runs `run` (an applyAction), and returns with its result copies of the state as the turn's Pokémon Checkup began and
 * ended (null when no turn ended), so the board can show the move (an attack's Sleep) before the checkup's coin flips,
 * and what the checkup did (a Berry's heal) before the next turn. Only around real moves (the API, runCpu's), never the
 * CPU's imagined ones.
 */
export function captureCheckup<T>(run: () => T): { result: T; checkup: Checkup | null } {
  let start: GameState | null = null;
  let end: GameState | null = null;
  const outer = onCheckup;
  onCheckup = (state, at) => {
    if (at === 'start') start ??= structuredClone(state);
    else end ??= structuredClone(state);
  };
  try {
    const result = run();
    return { result, checkup: start && end ? { start, end } : null };
  } finally {
    onCheckup = outer;
  }
}

/**
 * Pure reducer: validates `action` for `playerId` and returns the next state.
 * Never mutates the input. Runs identically on client (preview) and server (authority).
 */
export function applyAction(prev: GameState, playerId: PlayerId, action: GameAction): ActionResult {
  const result = act(prev, playerId, action);
  if (result.ok) {
    energyEvolution(prev, result.state, playerId);
    triggeredPoison(prev, result.state, playerId);
  }
  return result;
}

/** The uids of the Energy attached to each of the player's Pokémon in play, by the Pokémon's top card uid. */
const attachedEnergy = (player: PlayerState) => new Map([player.active, ...player.bench].flatMap((p) => (p ? [[p.card.uid, new Set(p.energy.map((e) => e.uid))] as const] : [])));

/**
 * Triggered Poison: a Pokémon of the player's with it that has an Energy card attached now that it didn't before the
 * action (by any effect of the player's) is now Poisoned.
 */
function triggeredPoison(prev: GameState, state: GameState, playerId: PlayerId) {
  if (state.phase === 'finished' || state.phase === 'setup') return;
  const before = attachedEnergy(prev.players[playerId]!);
  const owner = state.players[playerId]!;
  for (const p of [owner.active, ...owner.bench]) {
    const had = p && before.get(p.card.uid);
    if (!p || !had || (p.effects?.triggeredPoison ?? -1) < prev.turn || !p.energy.some((e) => !had.has(e.uid))) continue;
    delete p.effects!.triggeredPoison;
    p.poison = Math.max(p.poison ?? 0, 10);
    addLog(state, `Triggered Poison: ${pokemonName(state, p)} is now Poisoned.`, playerId);
  }
}

/**
 * Energy Evolution: for each of the player's Eevees with it working that has an Energy card attached now that it didn't
 * before the action (attached or moved by the player, by any effect: agreed), a flip for each such Energy card until one
 * is heads; heads asks for a card from the deck that evolves from Eevee of the Energy's type (Rainbow Energy: any).
 */
function energyEvolution(prev: GameState, state: GameState, playerId: PlayerId) {
  if (state.phase !== 'playing') return;
  const before = new Map(
    [prev.players[playerId]!.active, ...prev.players[playerId]!.bench].flatMap((p) => (p && powerEffect(effectId(p))?.energyEvolution ? [[p.card.uid, new Set(p.energy.map((e) => e.uid))] as const] : [])),
  );
  const owner = state.players[playerId]!;
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const target of [...(owner.active ? (['active'] as Target[]) : []), ...owner.bench.flatMap((p, i) => (p ? [i] : []))]) {
    const eevee = pokemonAt(owner, target)!;
    const had = before.get(eevee.card.uid);
    const added = had ? eevee.energy.filter((e) => !had.has(e.uid)) : [];
    if (!added.length || !powerActive(eevee, state.cards, sides)) continue;
    for (const energy of added) {
      if (!flipCoin(state, 'Energy Evolution', playerId)) continue;
      const d = lookupCard(state.cards, energy.defId);
      const any = d.kind === 'energy' && !!d.anyType;
      const type = energy.provides?.type ?? (d.kind === 'energy' ? d.energyType : null);
      const names = [...new Set(owner.deck.filter((c) => evolvesFromEevee(state.cards, c)).map((c) => card(state, c)).filter((e) => any || e.type === type).map((e) => e.name))];
      if (!names.length) {
        [owner.deck, state.rngState] = shuffle(owner.deck, state.rngState);
        addLog(state, 'Energy Evolution: no card in the deck evolves from Eevee into that type.', playerId);
        break;
      }
      const choice: PendingChoice = { player: playerId, source: 'Energy Evolution', kind: 'evolveFromDeck', target, names };
      if (state.pendingChoice) (state.queuedChoices ??= []).push(choice);
      else state.pendingChoice = choice;
      break;
    }
  }
}

/** The Pokémon card definition of a card. */
const card = (state: GameState, c: CardInstance) => lookupCard(state.cards, c.defId) as PokemonCardDef;

/**
 * A copy of the state to change. The card library is shared, not copied: nothing changes it after createGame (applyDebug
 * replaces it), and copying its definitions was most of the cost of every action and of every move the CPU tries.
 */
export function cloneState(state: GameState): GameState {
  const { cards, ...rest } = state;
  return { ...structuredClone(rest), cards };
}

function act(prev: GameState, playerId: PlayerId, action: GameAction): ActionResult {
  if (!prev.players[playerId]) return fail('Not a player in this game');
  if (prev.phase === 'finished') return fail('Game is over');

  const state = cloneState(prev);
  // Games saved before Transform existed (or set up directly, in tests) may not have Ditto's copy yet.
  refreshTransforms(state);
  // A card looked at with Peek stays in view until that player's next action.
  if (state.peek?.player === playerId) delete state.peek;
  const me = state.players[playerId]!;
  const opp = state.players[opponentOf(state, playerId)]!;
  const card = (c: CardInstance) => lookupCard(state.cards, c.defId);
  const isBasic = (c: CardInstance) => isBasicPokemon(card(c));

  if (action.type === 'CONCEDE') {
    return finish(state, opp.id);
  }

  if (state.phase === 'setup') return setupAction(state, me, opp, action);

  if (state.phase === 'promote') {
    if (playerId !== state.pendingPromotion) return fail('Waiting for opponent to promote');
    if (action.type !== 'PROMOTE') return fail('You must promote a benched Pokémon');
    const promoted = isBenchSlot(action.slot) ? me.bench[action.slot] : null;
    if (!promoted) return fail('That bench slot is empty');
    me.bench[action.slot] = null;
    me.active = promoted;
    state.pendingPromotion = null;
    addLog(state, `${pokemonName(state, promoted)} is the new Active Pokémon.`, me.id);
    // Spikes, for a promotion during the player's own turn (its Pokémon was Knocked Out mid-turn).
    newActives(state, !!state.midTurnPromotion);
    if (promoted.damage >= inPlayDef(state.cards, promoted).hp) {
      const winner = resolveKnockouts(state, opp.id);
      if (winner) return finish(state, winner);
      if (!me.active) {
        state.pendingPromotion = me.id;
        return ok(state);
      }
    }
    // Knockouts only happen at the end of a turn, so once both actives are filled the next turn starts.
    return promoteOrBeginTurn(state);
  }

  // A choice can be the other player's, answered during this turn (Computer Error, Chain Reaction).
  const pending = state.pendingChoice;
  if (pending && pending.player !== playerId) return fail(playerId === state.currentPlayer ? `Waiting for your opponent to finish ${pending.source}` : 'Not your turn');
  if (!pending && playerId !== state.currentPlayer) return fail('Not your turn');

  if (pending) {
    // Chaos Gym, on the other player's tails: the card they couldn't play may be played instead.
    if (pending.kind === 'borrowedTrainer' && action.type === 'PLAY_TRAINER' && action.cardUid === state.borrowed?.uid) {
      delete state.pendingChoice;
      const error = playTrainer(state, me, opp, action.cardUid, action.choices ?? {});
      if (error) return fail(error);
      // Its "your turn ends" (Minion of Team Rocket) doesn't end the other player's turn.
      delete state.endTurnNow;
      return afterOwnMove(state, state.players[state.currentPlayer]!, state.players[opponentOf(state, state.currentPlayer)]!);
    }
    if (action.type !== 'RESOLVE_CHOICE') return fail(`Finish ${pending.source} first`);
    // Mind Games, answered by the opponent of the player who played the Trainer: flip, or let it be played.
    if (pending.kind === 'mindGames') {
      if (action.count !== 0 && action.count !== 1) return fail('Flip a coin, or let it be played');
      delete state.pendingChoice;
      const player = state.players[state.currentPlayer]!;
      const other = state.players[opponentOf(state, state.currentPlayer)]!;
      const card = player.hand.find((c) => c.uid === pending.cardUid);
      if (!card) return ok(state);
      // One flip for each Slowking, until one is heads.
      const stopped = action.count === 0 && Array.from({ length: pending.flips }).some(() => flipCoin(state, 'Mind Games', me.id));
      if (stopped) {
        player.hand = player.hand.filter((c) => c !== card);
        player.deck.unshift(card);
        addLog(state, `Mind Games: ${lookupCard(state.cards, card.defId).name} did nothing; it went on top of the deck.`, player.id);
        return afterOwnMove(state, player, other);
      }
      state.mindGamesPassed = card.uid;
      const error = playTrainer(state, player, other, card.uid, pending.choices);
      delete state.mindGamesPassed;
      return error ? fail(error) : afterTrainer(state, player, other);
    }
    const { afterAttack } = pending;
    const attacker = state.players[state.currentPlayer]!;
    const defending = state.players[opponentOf(state, state.currentPlayer)]!;
    // Flee, asked of the Defending player before the attack: then the attack happens.
    if (pending.kind === 'flee') {
      const slot = action.target;
      if (slot !== undefined && (slot === 'active' || !me.bench[slot])) return fail('Choose one of your benched Pokémon, or not to flee');
      delete state.pendingChoice;
      addLog(state, slot === undefined ? "Won't use Flee." : `Flee: will switch with ${pokemonName(state, me.bench[slot]!)} if the attack does damage.`, me.id);
      return attackAction(state, attacker, defending, pending.attackIndex, pending.choices, { flee: slot as number | undefined });
    }
    // Psychic Protector: up to 4 hand cards, one at a time; then the attack happens.
    if (pending.kind === 'protector') {
      const card = action.cardUid === undefined ? undefined : me.hand.find((c) => c.uid === action.cardUid && !pending.picked.includes(c.uid));
      if (action.cardUid !== undefined && !card) return fail('Choose a card from your hand');
      const picked = card ? [...pending.picked, card.uid] : pending.picked;
      if (card && picked.length < 4 && me.hand.length > picked.length) {
        state.pendingChoice = { ...pending, picked };
        return ok(state);
      }
      delete state.pendingChoice;
      if (picked.length) state.psychicProtector = picked;
      addLog(state, picked.length ? `Psychic Protector: ${picked.length} card${picked.length === 1 ? '' : 's'} chosen.` : "Won't use Psychic Protector.", me.id);
      return attackAction(state, attacker, defending, pending.attackIndex, pending.choices);
    }
    // Koga's Ninja Trick: the switch happens before the attack (which then hits the new Defending Pokémon), and the card is discarded.
    if (pending.kind === 'ninjaTrick') {
      const slot = action.target;
      const benched = typeof slot === 'number' ? me.bench[slot] : null;
      if (slot !== undefined && !benched) return fail('Choose one of your benched Pokémon, or not to switch');
      delete state.pendingChoice;
      if (benched && me.active) {
        const old = me.active;
        clearOnLeavingActive(old);
        discardActiveOnly(state, me, old);
        me.bench[slot as number] = old;
        me.active = benched;
        addLog(state, `Koga's Ninja Trick: ${pokemonName(state, benched)} was switched in for ${pokemonName(state, old)}.`, me.id);
      }
      if (!attacker.active || !defending.active) return ok(state);
      return preAttackQuestion(state, attacker, defending, pending.attackIndex, pending.choices, true) ?? attackAction(state, attacker, defending, pending.attackIndex, pending.choices);
    }
    // Sabrina's ESP: the attack happens again from where it started, with new coin flips (the log keeps the first ones).
    if (pending.kind === 'reflip' && action.count === 1) {
      const again: GameState = { ...cloneState(pending.before), rngState: state.rngState, log: state.log, version: state.version };
      addLog(again, "Sabrina's ESP: re-flipped the coins.", me.id);
      const [mine, theirs] = [again.players[me.id]!, again.players[opponentOf(again, me.id)]!];
      return attackAction(again, mine, theirs, pending.attackIndex, pending.choices, { flee: pending.flee, reflipped: true });
    }
    const error = resolvePending(state, me, action);
    if (error) return fail(error);
    if (!state.pendingChoice) nextQueued(state, afterAttack);
    // Another step may follow (Energy Spike: pick the energy, then the Pokémon to attach it to).
    if (state.pendingChoice) {
      if (pending.betweenTurns) (state.pendingChoice as PendingChoice).betweenTurns = true;
      return ok(state);
    }
    // Asked between turns (Team Aqua Belt): now the next turn starts.
    if (pending.betweenTurns) return promoteOrBeginTurn(state);
    // A power's answer ends the turn (Howl).
    if (state.endTurnNow) return afterTrainer(state, state.players[state.currentPlayer]!, state.players[opponentOf(state, state.currentPlayer)]!);
    // Damage it did (Sneak Attack) can Knock Out a Pokémon during the turn.
    if (!afterAttack) return afterOwnMove(state, state.players[state.currentPlayer]!, state.players[opponentOf(state, state.currentPlayer)]!);
    // The search was the attack's (or Computer Error's): the turn ends as it does after any attack.
    const winner = resolveKnockouts(state, state.currentPlayer);
    return winner ? finish(state, winner) : endTurn(state);
  }

  switch (action.type) {
    case 'PLAY_BENCH': {
      if (!isBenchSlot(action.slot)) return fail('Invalid bench slot');
      if (me.bench[action.slot]) return fail('That bench slot is occupied');
      // Narrow Gym: no more than 4 benched Pokémon; Giant Stump: 3.
      if (openBenchSlot(me.bench, state.cards, state.stadium?.card) < 0) return fail(`Your Bench is full (${state.stadium ? card(state.stadium.card).name : 'the Stadium'} limits it)`);
      const played = takeFromHand(me, action.cardUid);
      if (!played || !isBenchable(card(played))) return fail('Must play a Basic Pokémon from your hand');
      if (isTrainerCard(card(played)) && trainersLocked(me, state.turn)) return fail(TRAINERS_LOCKED);
      const hayFever = isTrainerCard(card(played)) && (trainersBlocked([me, opp], state.cards) ?? trainersDusted(me, [me, opp], state.cards));
      if (hayFever) return fail(hayFever);
      me.bench[action.slot] = newInPlay(played, state.turn);
      addLog(state, `Put ${card(played).name} on the Bench.`, me.id);
      // Team Magma Hideout: a damage counter on a Basic Pokémon played from the hand without Team Magma in its name.
      if (state.stadium && card(state.stadium.card).name === 'Team Magma Hideout' && !isTrainerCard(card(played)) && !card(played).name.includes('Team Magma')) {
        me.bench[action.slot]!.damage += 10;
        addLog(state, `Team Magma Hideout put a damage counter on ${card(played).name}.`, me.id);
      }
      // Rocket's Minefield Gym: tails puts 2 damage counters on it (agreed: the printed card leaves out the number), which can Knock it Out.
      if (state.stadium && card(state.stadium.card).name === "Rocket's Minefield Gym" && !flipCoin(state, "Rocket's Minefield Gym", me.id)) {
        me.bench[action.slot]!.damage += 20;
        addLog(state, `Rocket's Minefield Gym put 2 damage counters on ${card(played).name}.`, me.id);
      }
      // Hot Plate: 10 damage to it from a working Dark Magcargo, either player's Active Pokémon.
      if (!isTrainerCard(card(played))) hotPlate(state, me.bench[action.slot]!, me.id);
      // Unown E and I: powers that react to the Pokémon being played from the hand.
      playedFromHand(state, me, me.bench[action.slot]!);
      return afterOwnMove(state, me, opp);
    }

    case 'EVOLVE': {
      const target = actionTarget(me, action.target);
      if (!target) return fail('Evolve one of your Pokémon in play');
      // Secret Plan: evolving turns the face-down card over; if it isn't a Basic Pokémon, it's discarded and nothing evolves.
      if (target.faceDown) {
        if (!revealFaceDown(state, me.id, target)) return afterOwnMove(state, me, opp);
        const evo = me.hand.find((c) => c.uid === action.cardUid);
        const evoDef = evo && card(evo);
        if (evoDef?.kind === 'pokemon' && evolveError(evoDef, target, state.cards, state.turn, [me, opp])) return ok(state);
      }
      const evolution = takeFromHand(me, action.cardUid);
      const evolutionDef = evolution && card(evolution);
      if (!evolution || evolutionDef?.kind !== 'pokemon' || evolutionDef.stage === 'basic') {
        return fail('Must evolve with a Stage 1 or Stage 2 Pokémon from your hand');
      }
      const error = evolveError(evolutionDef, target, state.cards, state.turn, [me, opp]);
      if (error) return fail(error);
      // Damage and attached energy stay; the new card's HP and attacks apply from now on.
      // Evolving removes Special Conditions and the effects of attacks.
      addLog(state, `Evolved ${pokemonName(state, target)} into ${evolutionDef.name}.`, me.id);
      target.evolvedFrom.push(target.card);
      target.card = evolution;
      target.playedTurn = state.turn;
      clearOnLeavingActive(target);
      evolvedHook(state, me.id, target);
      // Darkest Impulse: the opponent's working Dark Ampharos puts 2 damage counters on it (one, however many; agreed).
      const impulse = [opp.active, ...opp.bench].find((p) => p && powerEffect(effectId(p))?.darkestImpulse && powerActive(p, state.cards, [me, opp]));
      if (impulse) {
        target.damage += 20;
        addLog(state, `Darkest Impulse put 2 damage counters on ${pokemonName(state, target)}.`, opp.id);
      }
      // Its power may react to being played (Summon Minions…); then any Eevee's Chain Reaction, unless that's asking something.
      playedFromHand(state, me, target);
      if (!state.pendingChoice) offerChainReaction(state);
      // Sneak Attack can Knock Out.
      return afterOwnMove(state, me, opp);
    }

    case 'ATTACH_ENERGY': {
      const target = actionTarget(me, action.target);
      if (!target) return fail('Attach energy to one of your Pokémon');
      // Blaine: a second Fire Energy card can go to the Pokémon with Blaine in its name that got the first.
      const fire = (c: CardInstance) => isBasicEnergy(card(c)) && (card(c) as { energyType?: EnergyType }).energyType === 'fire';
      const blaine = me.blaineTurn === state.turn && pokemonName(state, target).includes('Blaine');
      const second = state.energyAttachedThisTurn && blaine && state.blaineAttach === baseUid(target);
      if (state.energyAttachedThisTurn && !second) return fail('Already attached energy this turn');
      const handCard = me.hand.find((c) => c.uid === action.cardUid);
      if (second && handCard && !fire(handCard)) return fail('Blaine: the second Energy card must be a Fire Energy card');
      const energy = takeFromHand(me, action.cardUid);
      // A Holon's Pokémon may be attached as a Special Energy card; Electrode, Magneton and Castform only onto a Pokémon with an
      // Energy card attached, one of which goes back to the hand.
      const holon = energy && holonEnergy(card(energy));
      if (!energy || (card(energy).kind !== 'energy' && !holon)) return fail('Must attach an energy card from your hand');
      if (holon === 'every' && !target.energy.some((e) => !e.provides)) return fail(`${card(energy).name} can only be attached to a Pokémon that already has an Energy card attached`);
      state.blaineAttach = second ? 'done' : blaine && fire(energy) ? baseUid(target) : 'done';
      if (target.effects?.noEnergy !== undefined) return fail(`Energy cards can't be attached to ${pokemonName(state, target)} this turn`);
      if (action.target === 'active' && (me.freezeLockUntil ?? 0) >= state.turn) return fail("Freeze Lock: you can't attach Energy cards from your hand to your Active Pokémon this turn");
      // Miracle Energy goes only on Shining and Light Pokémon, Boost Energy only on an Evolved Pokémon; Anti-Lightning.
      const notHere = energyEffect(energy.defId)?.attachError?.(inPlayDef(state.cards, target), target, state.cards) ?? attachBlocked(state.cards, [me, opp], target, energy);
      if (notHere) return fail(notHere);
      target.energy.push(energy);
      state.energyAttachedThisTurn = true;
      if (action.target === 'active') me.activeEnergyTurn = state.turn;
      addLog(state, `Attached ${card(energy).name} to ${pokemonName(state, target)}.`, me.id);
      // Miraculous Wind stops a Special Energy card's other effects (Rainbow Energy's damage counter…).
      if (!(isSpecialEnergy(state.cards, energy) && miraculousWind([me, opp], state.cards))) energyEffect(energy.defId)?.onAttach?.(state, me, target);
      energyFromHand(state, me, action.target, energy);
      // Delta Moon: the opponent's working Umbreon δ puts a damage counter on a Pokémon a Special Energy card is attached to (one, however many; agreed).
      if (isSpecialEnergy(state.cards, energy) && [opp.active, ...opp.bench].some((p) => p && powerEffect(effectId(p))?.deltaMoon && powerActive(p, state.cards, [me, opp]))) {
        target.damage += 10;
        addLog(state, `Delta Moon put a damage counter on ${pokemonName(state, target)}.`, opp.id);
      }
      if (holon === 'every') {
        const back = target.energy.filter((e) => !e.provides && e !== energy);
        if (back.length === 1) {
          target.energy = target.energy.filter((e) => e !== back[0]);
          me.hand.push(back[0]!);
          addLog(state, `Returned ${card(back[0]!).name} to the hand.`, me.id);
        } else if (back.length) {
          const choice = { player: me.id, source: card(energy).name, kind: 'discardAttached' as const, target: action.target, toHand: true, holonReturn: energy.uid };
          if (state.pendingChoice) (state.queuedChoices ??= []).push(choice);
          else state.pendingChoice = choice;
        }
      }
      // Rainbow Energy's damage can Knock Out the Pokémon.
      return afterOwnMove(state, me, opp);
    }

    case 'ATTACK': {
      if (state.turn === 1) return fail('The first player cannot attack on turn 1');
      if (!me.active || !opp.active) return fail('No active Pokémon');
      return preAttackQuestion(state, me, opp, action.attackIndex, action.choices ?? {}) ?? attackAction(state, me, opp, action.attackIndex, action.choices ?? {});
    }

    case 'FLIP_FACE_DOWN': {
      const target = actionTarget(me, action.target);
      if (!target?.faceDown) return fail('Choose one of your face-down cards');
      revealFaceDown(state, me.id, target);
      return afterOwnMove(state, me, opp);
    }

    case 'DISCARD_SHAPESHIFT': {
      const target = actionTarget(me, action.target);
      if (!target || !shapeshiftCard(target)) return fail('Choose a Pokémon with an Evolution card attached by Shapeshift');
      discardShapeshift(state, me, target);
      // It's its own card again: its damage may Knock it Out.
      return afterOwnMove(state, me, opp);
    }

    case 'RETREAT': {
      if (!me.active) return fail('No active Pokémon');
      if (me.active.faceDown && !revealFaceDown(state, me.id, me.active)) return afterOwnMove(state, me, opp);
      const error = retreatError(me.active, state.cards, hasBenched(me), state.retreatedThisTurn ?? false, [me, opp], state.stadium?.card);
      if (error) return fail(error);
      const benched = isBenchSlot(action.slot) ? me.bench[action.slot] : null;
      if (!benched) return fail('Retreat to one of your benched Pokémon');
      const cost = retreatCost(me.active, state.cards, [me, opp], state.stadium?.card);
      const uids = new Set(action.energyUids);
      if (uids.size !== action.energyUids.length || !action.energyUids.every((uid) => me.active!.energy.some((e) => e.uid === uid))) {
        return fail('Discard energy attached to your active Pokémon');
      }
      // Enough energy to pay, and no card more than needed (a card worth 2 can pay a cost of 1).
      const amounts = me.active.energy.filter((e) => uids.has(e.uid)).map((e) => energyProvided(e, state.cards).amount);
      const total = amounts.reduce((a, b) => a + b, 0);
      if (total < cost || amounts.some((a) => total - a >= cost)) return fail(`Retreating costs ${cost} energy`);
      // Mirage Stadium: a flip first; tails, it can't retreat this turn and no Energy is discarded.
      if (state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Mirage Stadium' && !flipCoin(state, 'Mirage Stadium', me.id)) {
        (me.active.effects ??= {}).noRetreat = state.turn;
        addLog(state, `Mirage Stadium: ${pokemonName(state, me.active)} can't retreat this turn.`, me.id);
        return afterOwnMove(state, me, opp);
      }
      me.discard.push(...me.active.energy.filter((e) => uids.has(e.uid)));
      me.active.energy = me.active.energy.filter((e) => !uids.has(e.uid));
      state.retreatedThisTurn = true;
      // Balloon Berry is discarded instead of Energy cards (its retreat cost is 0).
      if (toolOf(state.cards, me.active)?.name === 'Balloon Berry') {
        discardTool(state, me, me.active);
        addLog(state, `Discarded Balloon Berry from ${pokemonName(state, me.active)}.`, me.id);
      }
      // Pursuit: trying to retreat does 10 damage to it (no Weakness or Resistance).
      if (me.active.effects?.pursuit !== undefined) {
        me.active.damage += 10;
        addLog(state, `Pursuit did 10 damage to ${pokemonName(state, me.active)}.`, me.id);
      }
      // Suction Cups: the opponent's Active Octillery's discards every Energy card from the Pokémon that retreats.
      const suction = opp.active && powerEffect(effectId(opp.active))?.suctionCups && powerActive(opp.active, state.cards, [opp, me]);
      // [Chase]: the opponent's Active Unown C flips; heads puts a damage counter on it, with Weakness and Resistance.
      const chaser = opp.active;
      if (chaser && powerEffect(effectId(chaser))?.chase && powerActive(chaser, state.cards, [opp, me]) && flipCoin(state, '[Chase]', opp.id)) {
        const damage = applyWeaknessResistance(10, inPlayDef(state.cards, chaser).type, inPlayDef(state.cards, me.active), me.active.effects);
        me.active.damage += damage;
        addLog(state, `[Chase] did ${damage} damage to ${pokemonName(state, me.active)}.`, me.id);
      }
      // Modern rules (agreed): a Confused Pokémon retreats like any other, with no flip.
      addLog(state, `${pokemonName(state, me.active)} retreated for ${pokemonName(state, benched)}.`, me.id);
      // Damage stays with each Pokémon; the retreated one takes the chosen slot.
      const retreated = me.active;
      // Metal Gravity (the opponent's, only one): with 40 HP or more left, 3 damage counters on it.
      const gravity = inPlayDef(state.cards, retreated).hp - retreated.damage >= 40 && [opp.active, ...opp.bench].some((p) => p && powerEffect(effectId(p))?.metalGravity && powerActive(p, state.cards, [opp, me]));
      clearOnLeavingActive(retreated);
      if (gravity) {
        retreated.damage += 30;
        addLog(state, `Metal Gravity put 3 damage counters on ${pokemonName(state, retreated)}.`, opp.id);
      }
      me.bench[action.slot] = retreated;
      me.active = benched;
      if (suction && retreated.energy.length) {
        me.discard.push(...retreated.energy.map(asDiscarded));
        retreated.energy = [];
        addLog(state, `Suction Cups: discarded every Energy card from ${pokemonName(state, retreated)}.`, me.id);
      }
      // Sinkhole: for each working one on the other side, the retreating player flips; tails does 20 to the Pokémon that retreated.
      for (const p of [opp.active, ...opp.bench]) {
        if (!p || !powerEffect(effectId(p))?.sinkhole || !powerActive(p, state.cards, [opp, me])) continue;
        if (flipCoin(state, 'Sinkhole', me.id)) continue;
        retreated.damage += 20;
        addLog(state, `Sinkhole did 20 damage to ${pokemonName(state, retreated)}.`, me.id);
      }
      return afterOwnMove(state, me, opp);
    }

    case 'USE_POWER': {
      if (action.source !== 'active' && !isBenchSlot(action.source)) return fail('Invalid Pokémon');
      const error = usePower(state, me, opp, action.source, action.choices ?? {});
      // Buzzap knocks out its own Pokémon: the opponent takes a prize and the active may need replacing. Playful Punch ends the turn.
      return error ? fail(error) : afterTrainer(state, me, opp);
    }

    case 'PLAY_TRAINER': {
      const error = playTrainer(state, me, opp, action.cardUid, action.choices ?? {});
      return error ? fail(error) : afterTrainer(state, me, opp);
    }

    case 'DISCARD_DOLL': {
      const target = actionTarget(me, action.target);
      const def = target && card(target.card);
      if (!target || def?.kind !== 'pokemon' || !def.trainerText) return fail('Choose a Clefairy Doll in play');
      if (!hasBenched(me)) return fail("You can't discard your only Pokémon in play");
      me.discard.push(target.card, ...target.energy.map(asDiscarded), ...(target.attached ?? []).map((a) => a.card));
      if (action.target === 'active') me.active = null;
      else me.bench[action.target] = null;
      addLog(state, `Discarded ${def.name}.`, me.id);
      return afterOwnMove(state, me, opp);
    }

    case 'USE_STADIUM': {
      const error = stadiumError(state.stadium?.card ?? null, state.stadiumUsedTurn, state.turn, { me, cards: state.cards });
      if (error) return fail(error);
      state.stadiumUsedTurn = state.turn;
      addLog(state, `Used ${card(state.stadium!.card).name}.`, me.id);
      trainerEffect(state.stadium!.card.defId)!.useStadium!({ state, me, flip: () => flipCoin(state, card(state.stadium!.card).name, me.id) });
      return afterOwnMove(state, me, opp);
    }

    case 'RESOLVE_CHOICE':
      return fail('Nothing to choose');

    case 'END_TURN':
      addLog(state, 'Ended the turn.', me.id);
      return endTurn(state);

    case 'SET_ACTIVE':
    case 'RESET_SETUP':
    case 'START_BATTLE':
    case 'PROMOTE':
      return fail(`${action.type} is not allowed now`);
  }
}

/**
 * Uses an attack and ends the turn, or waits for the choices it leaves (a search, Bench Guard, Sabrina's ESP's re-flip),
 * after which the turn ends. `flee`: the Defending Pokémon's Flee answer. `reflipped`: Sabrina's ESP was already used.
 */
function attackAction(
  state: GameState,
  me: PlayerState,
  opp: PlayerState,
  attackIndex: number,
  choices: AttackChoices,
  { flee, reflipped = false }: { flee?: number; reflipped?: boolean } = {},
): ActionResult {
  const usable = usableAttacks(me.active!, state.cards, { recall: recallsAttacks(state, me), bench: me.bench, defender: opp.active, oppBench: opp.bench, stadium: state.stadium?.card ?? null, sides: [me, opp] })[attackIndex];
  const esp = !reflipped && (me.active!.attached ?? []).some((a) => lookupCard(state.cards, a.card.defId).name === "Sabrina's ESP");
  const before = esp ? cloneState(state) : null;
  const source = usable && `${inPlayDef(state.cards, me.active!).name}'s ${usable.attack.name}`;
  const logged = state.log?.at(-1)?.n ?? 0;
  const error = performAttack(state, me, opp, attackIndex, choices, { flee });
  delete state.psychicProtector;
  if (error) return fail(error);
  // Before the turn ends, while a Special Condition the attack gave is still there.
  dropShapeshifts(state);
  // Sabrina's ESP: the attack's coins can be flipped again once, before anything else it asks.
  if (before && (state.log ?? []).some((e) => (e.n ?? 0) > logged && e.coin?.reason === source)) {
    if (state.pendingChoice) (state.queuedChoices ??= []).unshift(state.pendingChoice);
    state.pendingChoice = { player: me.id, source: "Sabrina's ESP", kind: 'reflip', before, attackIndex, choices, ...(flee !== undefined && { flee }) };
  }
  // An attack that starts a search (Prophecy, Call for Family), or leaves Bench Guard's questions, ends the turn once they're answered.
  if (!state.pendingChoice) nextQueued(state, true);
  const search = state.pendingChoice as PendingChoice | undefined;
  if (search) {
    search.afterAttack = true;
    for (const queued of state.queuedChoices ?? []) queued.afterAttack = true;
    return ok(state);
  }
  // Attacking ends the turn.
  const winner = resolveKnockouts(state, me.id);
  return winner ? finish(state, winner) : endTurn(state);
}

/**
 * A question the Defending player answers before the attack (which waits in it), or null: Koga's Ninja Trick (switch
 * first; `ninjaAsked` once it's answered), then Flee. Checks the attack first, so the question is never wasted.
 */
function preAttackQuestion(state: GameState, me: PlayerState, opp: PlayerState, attackIndex: number, given: AttackChoices, ninjaAsked = false): ActionResult | null {
  const defender = opp.active!;
  const ninja = !ninjaAsked && hasBenched(opp) && (defender.attached ?? []).some((a) => lookupCard(state.cards, a.card.defId).name === "Koga's Ninja Trick");
  const flee = powerEffect(effectId(defender))?.flee && powerActive(defender, state.cards, [opp, me]) && hasBenched(opp);
  // Psychic Protector: the Defending player's working Flygon ex, Active or Benched, with cards in the hand (agreed: asked first).
  const protector = opp.hand.length > 0 && [opp.active, ...opp.bench].some((p) => p && powerEffect(effectId(p))?.psychicProtector && powerActive(p, state.cards, [opp, me]));
  if (!ninja && !flee && !protector) return null;
  const checked = checkAttack(attackSituation(state, me, opp), attackIndex, given);
  if ('error' in checked) return fail(checked.error);
  if (!ninja && !flee) {
    state.pendingChoice = { player: opp.id, source: 'Psychic Protector', kind: 'protector', attackIndex, choices: checked.choices, picked: [] };
    return ok(state);
  }
  state.pendingChoice = { player: opp.id, source: ninja ? "Koga's Ninja Trick" : 'Flee', kind: ninja ? 'ninjaTrick' : 'flee', attackIndex, choices: checked.choices };
  return ok(state);
}

/** Koga's Ninja Trick is discarded once its Pokémon is benched (and Charity-like cards stay). */
function discardActiveOnly(state: GameState, owner: PlayerState, pokemon: InPlayPokemon) {
  const gone = (pokemon.attached ?? []).filter((a) => a.activeOnly);
  if (!gone.length) return;
  pokemon.attached = pokemon.attached!.filter((a) => !a.activeOnly);
  owner.discard.push(...gone.map((a) => a.card));
  for (const a of gone) addLog(state, `${lookupCard(state.cards, a.card.defId).name} was discarded.`, owner.id);
}

/** Shapeshift: the Evolution card attached to Brock's Ninetales is discarded, and it's Brock's Ninetales again. */
export function discardShapeshift(state: GameState, owner: PlayerState, pokemon: InPlayPokemon) {
  const card = shapeshiftCard(pokemon);
  if (!card) return;
  pokemon.attached = pokemon.attached!.filter((a) => !a.shapeshift);
  owner.discard.push(card);
  addLog(state, `Discarded ${lookupCard(state.cards, card.defId).name} from ${lookupCard(state.cards, pokemon.card.defId).name}.`, owner.id);
}

/** Shapeshift: Brock's Ninetales loses its Evolution card as soon as it has any Special Condition. */
function dropShapeshifts(state: GameState) {
  for (const player of Object.values(state.players)) {
    for (const p of [player.active, ...player.bench]) if (p && shapeshiftCard(p) && hasSpecialCondition(p)) discardShapeshift(state, player, p);
  }
}

/**
 * After a Trainer card or a Pokémon Power: Minion of Team Rocket, Tickling Machine on tails and Playful Punch end the turn at
 * once (no attack); otherwise Knock Outs are checked (Devolution Spray, Buzzap; Scoop Up can empty the active spot).
 */
function afterTrainer(state: GameState, me: PlayerState, opp: PlayerState): ActionResult {
  if (state.endTurnNow) {
    delete state.endTurnNow;
    addLog(state, 'The turn ends.', me.id);
    const winner = resolveKnockouts(state, opp.id);
    return winner ? finish(state, winner) : endTurn(state);
  }
  return afterOwnMove(state, me, opp);
}

/** Asks the next queued choice, if any; after an attack's choice, it ends the turn too (`afterAttack`). */
function nextQueued(state: GameState, afterAttack?: boolean) {
  const next = state.queuedChoices?.shift();
  if (!state.queuedChoices?.length) delete state.queuedChoices;
  if (next) state.pendingChoice = { ...next, ...(afterAttack && { afterAttack }) };
}

/**
 * Setting up: each player puts a Basic Pokémon in the active spot and any number on the Bench, face down
 * (the log doesn't name them), and can take them all back (RESET_SETUP) until they start the battle
 * (START_BATTLE). Once both have, the Pokémon are revealed and the player who won the turn-order flip
 * starts turn 1.
 */
function setupAction(state: GameState, me: PlayerState, opp: PlayerState, action: GameAction): ActionResult {
  const isBasic = (c: CardInstance) => isBasicPokemon(lookupCard(state.cards, c.defId));
  if (me.ready) return fail('Waiting for your opponent to start the battle');
  switch (action.type) {
    case 'SET_ACTIVE': {
      if (me.active) return fail('Active Pokémon already chosen');
      const chosen = takeFromHand(me, action.cardUid);
      if (!chosen || !isBasic(chosen)) return fail('Must choose a Basic Pokémon from your hand');
      me.active = newInPlay(chosen, 0);
      addLog(state, 'Chose an Active Pokémon.', me.id);
      return ok(state);
    }
    case 'PLAY_BENCH': {
      if (!isBenchSlot(action.slot)) return fail('Invalid bench slot');
      if (me.bench[action.slot]) return fail('That bench slot is occupied');
      const played = takeFromHand(me, action.cardUid);
      // Basic Pokémon cards only: not a Trainer played as one (Clefairy Doll).
      if (!played || !isBasic(played)) return fail('Only Basic Pokémon can be put on the Bench before the battle');
      me.bench[action.slot] = newInPlay(played, 0);
      addLog(state, 'Put a Pokémon on the Bench.', me.id);
      return ok(state);
    }
    case 'RESET_SETUP': {
      const placed = [me.active, ...me.bench].flatMap((p) => (p ? [p.card] : []));
      if (!placed.length) return fail('You have no Pokémon to take back');
      me.hand.push(...placed);
      me.active = null;
      me.bench = me.bench.map(() => null);
      addLog(state, 'Took their Pokémon back.', me.id);
      return ok(state);
    }
    case 'START_BATTLE': {
      if (!me.active) return fail('Choose an Active Pokémon first');
      me.ready = true;
      addLog(state, 'Is ready.', me.id);
      if (!opp.ready) return ok(state);
      // Both are ready: turn the Pokémon face up, and the first player starts.
      for (const id of state.playerOrder) {
        const player = state.players[id]!;
        delete player.ready;
        // The first turn's changes of Active Pokémon count too (Spikes, Magma Pool).
        player.lastActive = baseUid(player.active!);
        const bench = player.bench.flatMap((p) => (p ? [pokemonName(state, p)] : []));
        addLog(state, `Active: ${pokemonName(state, player.active!)}${bench.length ? `. Bench: ${bench.join(', ')}` : ''}.`, id);
      }
      state.phase = 'playing';
      return ok(state);
    }
    default:
      return fail('Place your Pokémon, then start the battle');
  }
}

/**
 * After a move by the current player that can knock out or remove Pokémon (a power or Trainer):
 * prizes, a possible win, and promoting new actives (the player's first) without ending the turn.
 */
function afterOwnMove(state: GameState, me: PlayerState, opp: PlayerState): ActionResult {
  const winner = resolveKnockouts(state, opp.id);
  if (winner) return finish(state, winner);
  const needs = [me, opp].find((p) => !p.active);
  if (needs) {
    state.phase = 'promote';
    state.pendingPromotion = needs.id;
    state.midTurnPromotion = true;
  }
  return ok(state);
}

/**
 * Why `evolution` can't be played onto `target` right now, or null if it can. `sides` are both
 * players' Pokémon in play, for powers that stop evolution (Prehistoric Power).
 * Pure and view-safe, so the UI uses it for hints and the engine for validation.
 */
export function evolveError(
  evolution: PokemonCardDef,
  target: InPlayPokemon,
  cards: CardLibrary,
  turn: number,
  sides: Pick<PlayerState, 'active' | 'bench'>[] = [],
): string | null {
  const blocked = evolutionBlocked(sides, cards);
  if (blocked) return blocked;
  if (shapeshiftCard(target)) return `${lookupCard(cards, target.card.defId).name} can't evolve while Shapeshift is in use`;
  if (target.faceDown) return null;
  // Owners' Pokémon (Gym Heroes) need no rule of their own: Brock's Rhydon evolves from Brock's Rhyhorn, by name.
  const current = lookupCard(cards, target.card.defId);
  if (!evolvesOnto(evolution, current)) return `${evolution.name} evolves from ${evolution.evolvesFrom ?? 'nothing'}`;
  // Primal Aura and Primal Stare: not from the hand onto a Benched (or the opponent's Active) Pokémon.
  const primal = primalBlock(target, sides, cards);
  if (primal) return primal;
  // Dark Tentacle: not by an Evolution card from the hand or a Trainer this turn.
  if (target.effects?.noEvolve !== undefined) return `${current.name} can't evolve this turn`;
  // Binding Aura (the opponent's Hypno): not an Asleep Pokémon, from the hand.
  if (target.condition === 'asleep' && bindingAura(sides, cards)) return `Binding Aura: ${current.name} is Asleep and can't evolve`;
  // Giovanni: no first-turn or played-this-turn limit for the Pokémon chosen, this turn.
  if (target.giovanniTurn === turn) return null;
  // Turns 1 and 2 are each player's first turn.
  if (turn <= 2) return "You can't evolve on your first turn";
  if (target.playedTurn === turn) return `${current.name} was played or evolved this turn`;
  return null;
}

/**
 * Whether `evolution` can be put onto a Pokémon whose top card is `current`: it evolves from that name and stage, or it
 * evolves from Mysterious Fossil and `current` is Buried Fossil (which counts as one for this).
 */
export function evolvesOnto(evolution: PokemonCardDef, current: CardDef): boolean {
  const evolvesFromStage = evolution.stage === 'stage2' ? 'stage1' : 'basic';
  if (current.kind !== 'pokemon' || current.stage !== evolvesFromStage || evolution.stage === 'basic') return false;
  return current.name === evolution.evolvesFrom || !!evolution.alsoEvolvesFrom?.includes(current.name) || (current.name === 'Buried Fossil' && evolution.evolvesFrom === 'Mysterious Fossil');
}

/**
 * Energy the Pokémon must discard to retreat. `sides` (its owner first) are for powers that change it:
 * each working Retreat Aid on the owner's Bench takes 1 off the Active Pokémon's cost, and the opponent's working
 * Sticky Goo adds 2. The Stadium in play can change it too (The Rocket's Training Gym, Cerulean City Gym).
 */
export const retreatCost = (pokemon: InPlayPokemon, cards: CardLibrary, sides: Pick<PlayerState, 'active' | 'bench'>[] = [], stadium?: CardInstance | null) =>
  // Balloon Berry: it's discarded instead of Energy cards (RETREAT). [Zoom]: free for an Unown.
  // Tailwind: 0 this turn.
  // Fluffy Berry, and Holon Energy WP with a basic Psychic Energy card: 0.
  ['Balloon Berry', 'Fluffy Berry'].includes(toolOf(cards, pokemon)?.name ?? '') || holonWith(pokemon, cards, 'WP', 'psychic') || zoomed(pokemon, cards, sides) || pokemon.effects?.tailwind !== undefined ? 0 : Math.max(
    0,
    (inPlayDef(cards, pokemon).retreatCost ?? 0) +
      // Tentacle Wrap: 1 more.
      (pokemon.effects?.heavier !== undefined ? 1 : 0) -
      retreatAid(pokemon, cards, sides) +
      // Poké-Bodies: Extreme Speed, Heavyweight, Lightweight, Conductive Body, Gluey Slime.
      retreatBodies(pokemon, cards, sides) +
      (sides[0]?.active === pokemon ? stickyGoo(sides, cards) : 0) +
      (stadium ? (trainerEffect(stadium.defId)?.retreatModifier?.(inPlayDef(cards, pokemon)) ?? 0) : 0),
  );

/**
 * Why the active Pokémon can't retreat right now, or null if it can (given a bench target
 * and the energy to discard). Pure and view-safe, so the UI uses it for hints too.
 */
export function retreatError(
  active: InPlayPokemon,
  cards: CardLibrary,
  hasBench: boolean,
  retreatedThisTurn: boolean,
  sides: Pick<PlayerState, 'active' | 'bench'>[] = [],
  stadium?: CardInstance | null,
): string | null {
  if (retreatedThisTurn) return 'You can only retreat once per turn';
  const def = lookupCard(cards, active.card.defId);
  if (def.kind === 'pokemon' && def.trainerText) return `${def.name} can't retreat`;
  // Effects are removed once they run out (expireEffects), so being set means it applies.
  if (active.effects?.noRetreat !== undefined) return `${def.name} can't retreat this turn`;
  if (active.effects?.stuck) return `${def.name} can't retreat`;
  // Boost Energy: the Pokémon it's attached to can't retreat.
  if (active.energy.some((e) => !e.provides && !e.windless && lookupCard(cards, e.defId).name === 'Boost Energy')) return `${def.name} can't retreat while Boost Energy is attached`;
  if (heldActive(active, sides)) return `${def.name} can't retreat while ${lookupCard(cards, heldActive(active, sides)!.card.defId).name} is the Active Pokémon`;
  const guard = guardedBy(sides, cards) ?? spiraledBy(sides, cards);
  if (guard) return `${guard}: ${def.name} can't retreat`;
  // Fast Feet: it retreats even while Asleep or Paralyzed.
  const fastFeet = !!powerEffect(effectId(active))?.fastFeet && powerActive(active, cards, sides);
  if ((active.condition === 'asleep' || active.condition === 'paralyzed') && !fastFeet) {
    return `${lookupCard(cards, active.card.defId).name} is ${conditionLabel(active.condition)} and can't retreat`;
  }
  if (!hasBench) return 'No benched Pokémon to switch in';
  const cost = retreatCost(active, cards, sides, stadium);
  if (energyPool(active, cards).length < cost) return `Retreating costs ${cost} energy`;
  return null;
}

/**
 * The opponent's Active Pokémon holding this one (Mean Look, Jaw Clamp, Sticky Nectar), if it still is: it can't retreat.
 * `sides` are both players'.
 */
const heldActive = (pokemon: InPlayPokemon, sides: Pick<PlayerState, 'active'>[]) => {
  const by = pokemon.effects?.heldBy?.by;
  return by ? (sides.find((s) => s.active && s.active !== pokemon && s.active.card.uid === by)?.active ?? null) : null;
};

/**
 * Why `side`'s Active Pokémon can't be changed by an effect now (Jaw Clamp, Sticky Nectar), or null; `sides` are both
 * players'. Whoever's effect it is (agreed): Switch, Scoop Up, Gust of Wind, Whirlwind… that part does nothing.
 */
export function activeLock(side: Pick<PlayerState, 'active'>, sides: Pick<PlayerState, 'active'>[], cards: CardLibrary): string | null {
  const active = side.active;
  if (!active?.effects?.heldBy?.switches) return null;
  const holder = heldActive(active, sides);
  return holder ? `${lookupCard(cards, active.card.defId).name} is held by ${lookupCard(cards, holder.card.defId).name}: it can't be switched out` : null;
}

/** activeLock for `player` in a game. */
export const activeLocked = (state: Pick<GameState, 'players' | 'cards'>, player: PlayerId) => activeLock(state.players[player]!, Object.values(state.players), state.cards);

export const conditionLabel = (c: SpecialCondition) => ({ asleep: 'Asleep', confused: 'Confused', paralyzed: 'Paralyzed' })[c];

/** One energy a Pokémon has: a type, 'any' for Rainbow Energy, which counts as every type, or Crystal Energy's types. */
export type PoolEnergy = EnergyType | 'any' | CrystalEnergy;

/** Whether energy in a pool counts as `type` (Rainbow Energy counts as every type; Crystal Energy as each of its types). */
export const counts = (energy: PoolEnergy, type: EnergyType) => energy === type || energy === 'any' || (energy.startsWith('crystal:') && energy.slice(8).split(',').includes(type));

/** The type and amount of energy an attached card provides: 1 of its type for basic Energy, or what a power made it (Buzzap). */
export function energyProvided(card: CardInstance, cards: CardLibrary): { type: PoolEnergy; amount: number } {
  if (card.provides) return card.provides;
  // Energy Converter: a basic Energy card treated as another type.
  if (card.converted) return { type: card.converted.type, amount: 1 };
  const def = lookupCard(cards, card.defId);
  // Miraculous Wind: a Special Energy card provides Colorless Energy (as much as it usually does).
  if (card.windless) return { type: 'colorless', amount: def.kind === 'energy' ? (def.amount ?? 1) : 1 };
  if (card.colorlessOnly) return { type: 'colorless', amount: 1 };
  // Holon's Electrode, Magneton, Castform attached as Energy: every type, 2 at a time.
  if (holonEnergy(def) === 'every') return { type: 'any', amount: 2 };
  if (def.kind !== 'energy') return { type: 'colorless', amount: 1 };
  return { type: def.anyType ? 'any' : def.energyType, amount: def.amount ?? 1 };
}

/** A Special Energy card (not basic Energy, nor a Pokémon attached as Energy by a power), a Holon's Pokémon attached as Energy too. */
export function isSpecialEnergy(cards: CardLibrary, card: CardInstance): boolean {
  const d = lookupCard(cards, card.defId);
  return !card.provides && ((d.kind === 'energy' && d.basic === false) || !!holonEnergy(d));
}

/**
 * Whether an attached card is a `type` Energy card: a basic one of that type (a converted one of its new type), or Rainbow
 * Energy (every type while in play). Not Double Colorless, a windless or Chlorophyll card, nor a Pokémon attached as Energy (Buzzap).
 */
export function isEnergyCardOf(card: CardInstance, cards: CardLibrary, type: EnergyType): boolean {
  if (card.provides || card.windless || card.colorlessOnly) return false;
  if (card.converted) return card.converted.type === type;
  const d = lookupCard(cards, card.defId);
  return d.kind === 'energy' && (!!d.anyType || (d.energyType === type && d.basic !== false));
}

/**
 * Every energy the Pokémon's attached cards provide, one entry per energy. Energy Burn makes it all Fire, and
 * Photosynthesis all Grass (it works whatever the Pokémon's condition; only Stare stops it here, as this sees no
 * other Pokémon for Toxic Gas or Goop Gas Attack).
 */
const isBasicGrass = (cards: CardLibrary, e: CardInstance) => {
  const d = lookupCard(cards, e.defId);
  return d.kind === 'energy' && d.energyType === 'grass' && d.basic !== false && !d.anyType;
};

export const energyPool = (pokemon: InPlayPokemon, cards: CardLibrary): PoolEnergy[] => {
  const pool = pokemon.energy.flatMap((e) => {
    const provided = cardEnergy(pokemon, e, cards);
    // Crystal Beach: a Special Energy card providing 2 or more Energy now, provides 1 Colorless Energy (agreed: whatever makes it 2).
    const beached = e.beached && provided.length >= 2 ? (['colorless'] as PoolEnergy[]) : provided;
    // Chlorophyll: an Energy card providing only Colorless Energy on its player's Grass Pokémon provides as much Grass Energy.
    return e.chlorophyll ? beached.map((t): PoolEnergy => (t === 'colorless' ? 'grass' : t)) : beached;
  });
  if (pokemon.effects?.energyBurn !== undefined) return pool.map(() => 'fire');
  // Dark Aura: all of it is Darkness Energy.
  const as = powerEffect(effectId(pokemon))?.energyAs;
  // Magmar's Stages of Evolution: all of it is Fire Energy, only while it's an Evolved Pokémon.
  const asWorks = !powerEffect(effectId(pokemon))?.evolvedOnly || pokemon.evolvedFrom.length > 0;
  if (as && asWorks && pokemon.powerOffUntil === undefined) return pool.map(() => as);
  // Wild Growth: each basic Grass Energy card attached provides 2 Grass Energy.
  if (pokemon.wildGrowth) pool.push(...pokemon.energy.filter((e) => !e.provides && isBasicGrass(cards, e)).map((): PoolEnergy => 'grass'));
  return powerEffect(effectId(pokemon))?.photosynthesis && pokemon.powerOffUntil === undefined ? pool.map(() => 'grass') : pool;
};

/** The Energy one attached card provides, before Crystal Beach and Chlorophyll (energyPool). */
export function cardEnergy(pokemon: InPlayPokemon, e: CardInstance, cards: CardLibrary): PoolEnergy[] {
  const { type, amount } = energyProvided(e, cards);
  // Rare Metal, Prismatic Body: each basic Energy card provides another type (Prismatic Body: every type, 1 at a time).
  const basicAs = pokemon.powerOffUntil === undefined ? powerEffect(effectId(pokemon))?.basicEnergyAs : undefined;
  if (basicAs && !e.provides && isBasicEnergy(lookupCard(cards, e.defId))) return [basicAs];
  // Aqua Energy and Magma Energy: 2 Energy, each either of its types (agreed: any mix).
  const team = !e.provides && !e.windless && TEAM_ENERGY[lookupCard(cards, e.defId).name];
  if (team) return [team, team];
  // Dark Metal Energy: 1 Energy, Darkness or Metal.
  if (!e.provides && !e.windless && lookupCard(cards, e.defId).name === 'Dark Metal Energy') return ['crystal:darkness,metal' as CrystalEnergy];
  // Scramble Energy: 3 Energy of any types while its owner has more Prize cards left (otherwise Colorless).
  if (e.scrambled && !e.windless) return ['any', 'any', 'any'] as PoolEnergy[];
  // Holon Research Tower: a basic Energy card on a δ Pokémon is its type or Metal.
  if (e.holonMetal && type !== 'metal') return [`crystal:${type},metal` as CrystalEnergy];
  // Reactive Booster: a React Energy card provides 2 Energy of every type.
  if (e.reactBoost && !e.windless) return ['any', 'any'] as PoolEnergy[];
  // δ Rainbow Energy: every type, 1 at a time, on a δ Pokémon; Colorless otherwise.
  if (!e.provides && !e.windless && lookupCard(cards, e.defId).name === 'δ Rainbow Energy' && isDelta(cards, pokemon)) return ['any'] as PoolEnergy[];
  return Array<PoolEnergy>(amount).fill(isCrystalEnergy(cards, e) ? crystalProvides(pokemon, cards) : type);
}

/** What each of the 2 Energy that Aqua Energy and Magma Energy provide can be. */
const TEAM_ENERGY: Record<string, CrystalEnergy> = { 'Aqua Energy': 'crystal:water,darkness', 'Magma Energy': 'crystal:fighting,darkness' };

/** A Crystal Energy card (its effect not stopped by Miraculous Wind). */
const isCrystalEnergy = (cards: CardLibrary, e: CardInstance) => !e.provides && !e.windless && lookupCard(cards, e.defId).name === 'Crystal Energy';

/**
 * What a Crystal Energy card on `pokemon` provides: 1 Energy of every type of the basic Energy cards attached to it (one
 * of them, as a cost needs: `crystal:<types>`), or Colorless if there are none.
 */
function crystalProvides(pokemon: InPlayPokemon, cards: CardLibrary): PoolEnergy {
  const types = [
    ...new Set(
      pokemon.energy.flatMap((e) => {
        const d = lookupCard(cards, e.defId);
        return !e.provides && d.kind === 'energy' && d.basic !== false && !d.anyType ? [e.converted?.type ?? d.energyType] : [];
      }),
    ),
  ];
  return types.length === 0 ? 'colorless' : types.length === 1 ? types[0]! : (`crystal:${types.join(',')}` as CrystalEnergy);
}

export function canPayCost(pokemon: InPlayPokemon, attack: Attack, cards: CardLibrary): boolean {
  const pool = energyPool(pokemon, cards);
  // A Transformed Ditto may treat its Energy as any type.
  if (pokemon.transformed) return pool.length >= attack.cost.length;
  return payCost(pool, attack.cost) === 0;
}

/**
 * How many of `cost`'s symbols `pool` can't pay. Typed symbols take their own type first and Rainbow Energy ('any')
 * only after that; colorless symbols take whatever is left.
 */
export function payCost(pool: PoolEnergy[], cost: EnergyType[]): number {
  const left = [...pool];
  const unpaid: EnergyType[] = [];
  for (const need of cost.filter((t) => t !== 'colorless')) {
    const i = left.indexOf(need);
    if (i >= 0) left.splice(i, 1);
    else unpaid.push(need);
  }
  let missing = 0;
  for (const need of unpaid) {
    // Crystal Energy that has the type, then Rainbow Energy.
    const crystal = left.findIndex((t) => t.startsWith('crystal:') && counts(t, need));
    const i = crystal >= 0 ? crystal : left.indexOf('any');
    if (i >= 0) left.splice(i, 1);
    else missing++;
  }
  return missing + Math.max(0, cost.filter((t) => t === 'colorless').length - left.length);
}

/**
 * Ends the current player's turn: Pokémon Checkup (Poison, Sleep, Paralysis, expiring
 * effects), knockouts from it, then promotions and the next player's turn.
 */
function endTurn(state: GameState): ActionResult {
  onCheckup?.(state, 'start');
  betweenTurns(state);
  onCheckup?.(state, 'end');
  // A knockout between turns isn't caused by either player; ties go to the player whose turn it was.
  const winner = resolveKnockouts(state, state.currentPlayer);
  if (winner) return finish(state, winner);
  // Team Aqua Belt and Team Magma Belt: each player whose Active Pokémon could use one is asked (agreed: not automatically).
  if (askBelts(state)) return ok(state);
  return promoteOrBeginTurn(state);
}

/**
 * Team Aqua Belt and Team Magma Belt, between turns: asks each player whose Active Pokémon has one, with a card in their deck
 * that evolves from it, whether to use it (the usual limits for evolving apply, agreed). Returns whether anyone is asked.
 */
function askBelts(state: GameState): boolean {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  const asks: PendingChoice[] = [];
  for (const player of sides) {
    const p = player.active;
    const belt = p && toolOf(state.cards, p);
    if (!p || !belt || !['Team Aqua Belt', 'Team Magma Belt'].includes(belt.name)) continue;
    // Not on a Pokémon played or evolved this turn, nor before both players have had a turn.
    if (state.turn < 2 || p.playedTurn === state.turn || p.effects?.noEvolve !== undefined || evolutionBlocked(sides, state.cards)) continue;
    const current = lookupCard(state.cards, p.card.defId);
    if (!player.deck.some((c) => { const d = card(state, c); return d.kind === 'pokemon' && evolvesOnto(d, current); })) continue;
    asks.push({ player: player.id, source: belt.name, kind: 'mayUse', power: 'belt', target: 'active', betweenTurns: true });
  }
  const [first, ...rest] = asks;
  if (!first) return false;
  state.pendingChoice = first;
  if (rest.length) (state.queuedChoices ??= []).push(...rest);
  return true;
}

/** Asks the next player without an active Pokémon to promote one, or starts the next turn. */
function promoteOrBeginTurn(state: GameState): ActionResult {
  // The player whose turn is next promotes last.
  const order = [state.currentPlayer, opponentOf(state, state.currentPlayer)];
  const needs = order.find((id) => !state.players[id]!.active);
  if (needs) {
    state.phase = 'promote';
    state.pendingPromotion = needs;
    return ok(state);
  }
  state.phase = 'playing';
  if (state.midTurnPromotion) {
    delete state.midTurnPromotion;
    return ok(state);
  }
  return beginNextTurn(state);
}

function beginNextTurn(state: GameState): ActionResult {
  state.currentPlayer = opponentOf(state, state.currentPlayer);
  state.turn += 1;
  state.energyAttachedThisTurn = false;
  state.retreatedThisTurn = false;
  delete state.blaineAttach;
  const next = state.players[state.currentPlayer]!;
  for (const player of Object.values(state.players)) if (player.active) player.lastActive = baseUid(player.active);
  const drawn = next.deck.shift();
  if (!drawn) {
    addLog(state, 'No cards left to draw.', next.id);
    return finish(state, opponentOf(state, next.id)); // decked out
  }
  next.hand.push(drawn);
  addLog(state, `Turn ${state.turn}.`, next.id);
  return ok(state);
}

/**
 * 1999 rules Pokémon Checkup, run after every turn. Conditions are handled one at a time for
 * both actives, in this order: Poisoned, Burned, Asleep, Paralyzed.
 */
function betweenTurns(state: GameState) {
  // Aqua Trance, Slow-Acting Poison: at the end of the turn they name, before the checkup (a Poisoned Pokémon takes its damage now).
  for (const id of state.playerOrder) {
    const active = state.players[id]!.active;
    const delayed = active?.effects?.delayed;
    if (!active || !delayed || delayed.turn > state.turn) continue;
    delete active.effects!.delayed;
    if (delayed.affliction) afflictBetweenTurns(state, id, active, delayed.affliction);
    // Dark Seed: damage counters at the end of the opponent's next turn.
    if (delayed.counters) {
      active.damage += 10 * delayed.counters;
      addLog(state, `Put ${delayed.counters} damage counters on ${pokemonName(state, active)}.`, id);
    }
  }
  const actives = state.playerOrder.flatMap((id) => {
    const active = state.players[id]!.active;
    return active ? [{ id, active, name: pokemonName(state, active) }] : [];
  });
  for (const { id, active, name } of actives) {
    if (!active.poison) continue;
    active.damage += active.poison;
    // Shadow Images lasts until the Pokémon takes damage.
    if (active.effects) delete active.effects.shadowImages;
    addLog(state, `${name} takes ${active.poison} Poison damage.`, id);
  }
  // Fiery Aura: an Active Rapidash's makes Burn 4 damage counters, for both players' Burned Pokémon (agreed).
  const everyone = state.playerOrder.map((id) => state.players[id]!);
  const fiery = everyone.some((s) => s.active && powerEffect(effectId(s.active))?.fieryAura && powerActive(s.active, state.cards, everyone));
  for (const { id, active, name } of actives) {
    if (!active.burned) continue;
    // Full Flame: 4 damage counters as well.
    const flame = !!state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Full Flame';
    const burn = fiery || flame ? 40 : 20;
    active.damage += burn;
    if (active.effects) delete active.effects.shadowImages;
    addLog(state, `${name} takes ${burn} Burn damage${fiery ? ' (Fiery Aura)' : ''}.`, id);
    if (flipCoin(state, `${name} is Burned`, id)) {
      active.burned = false;
      addLog(state, `${name} is no longer Burned.`, id);
    }
  }
  // Char counters: on any of the player's Pokémon in play, Active or Benched.
  for (const id of state.playerOrder) {
    const player = state.players[id]!;
    for (const p of [player.active, ...player.bench]) {
      if (!p?.charCounter) continue;
      const name = pokemonName(state, p);
      if (flipCoin(state, `${name} has a Char counter`, id)) continue;
      p.damage += 20;
      addLog(state, `Char: 2 damage counters on ${name}.`, id);
    }
  }
  // Deep Sleep: with a Dark Gengar's working, 2 coins, and it wakes up only on 2 heads.
  const deep = deepSleep(state.playerOrder.map((id) => state.players[id]!), state.cards);
  for (const { id, active, name } of actives) {
    if (active.condition !== 'asleep') continue;
    const awake = deep ? [flipCoin(state, `${name} is Asleep (Deep Sleep)`, id), flipCoin(state, `${name} is Asleep (Deep Sleep)`, id)].every(Boolean) : flipCoin(state, `${name} is Asleep`, id);
    if (!awake) continue;
    active.condition = null;
    addLog(state, `${name} woke up.`, id);
  }
  // Bodies that work between turns, once the Special Conditions are done (Sooth Dust, Eerie Aura, Sand Damage…).
  const done = new Set<string>();
  for (const id of state.playerOrder) {
    const owner = state.players[id]!;
    const opp = state.players[opponentOf(state, id)]!;
    for (const p of [owner.active, ...owner.bench]) {
      const checkup = p && powerActive(p, state.cards, everyone) ? powerEffect(effectId(p))?.checkup : undefined;
      if (p && checkup && [owner.active, ...owner.bench].includes(p)) checkup(state, owner, p, opp, done);
    }
  }
  // Cursed Stone: a damage counter on each Pokémon with a Poké-Power (printed, working or not: agreed; the older Pokémon Powers too).
  if (state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Cursed Stone') {
    for (const owner of everyone) {
      for (const p of [owner.active, ...owner.bench]) {
        if (!p || !inPlayDef(state.cards, p).power || powerEffect(effectId(p))?.body) continue;
        p.damage += 10;
        addLog(state, `Cursed Stone put a damage counter on ${pokemonName(state, p)}.`, owner.id);
      }
    }
  }
  // Miracle Energy, Boost Energy, Aqua Energy, Magma Energy and R Energy: discarded at the end of their owner's turn (Boost Energy: the turn it was attached).
  const current = state.players[state.currentPlayer]!;
  for (const p of [current.active, ...current.bench]) {
    for (const special of ['Miracle Energy', 'Boost Energy', 'Aqua Energy', 'Magma Energy', 'R Energy']) {
      const gone = p?.energy.filter((e) => !e.provides && lookupCard(state.cards, e.defId).name === special) ?? [];
      if (!p || !gone.length) continue;
      p.energy = p.energy.filter((e) => !gone.includes(e));
      current.discard.push(...gone.map(asDiscarded));
      addLog(state, `${special} on ${pokemonName(state, p)} was discarded.`, current.id);
    }
  }
  for (const { id, active, name } of actives) {
    // Paralysis wears off at the end of its owner's next turn.
    if (active.condition === 'paralyzed' && id === state.currentPlayer && (active.paralyzedTurn ?? 0) < state.turn) {
      active.condition = null;
      addLog(state, `${name} is no longer Paralyzed.`, id);
    }
  }
  // Berries (Pokémon Tools): used by themselves as soon as they can be, between turns (agreed). Star Piece too.
  for (const id of state.playerOrder) {
    const player = state.players[id]!;
    for (const p of [player.active, ...player.bench]) if (p) useBerry(state, player, p);
    for (const p of player.bench) if (p) useStarPiece(state, player, p);
  }
  // Desert Ruins: a damage counter on each Pokémon-ex with 100 HP or more, both players'.
  const sides = state.playerOrder.map((id) => state.players[id]!);
  if (state.stadium && card(state, state.stadium.card).name === 'Desert Ruins') {
    for (const player of sides) {
      for (const p of [player.active, ...player.bench]) {
        if (!p || !inPlayDef(state.cards, p).ex || lookupCard(state.cards, p.card.defId).kind !== 'pokemon' || (lookupCard(state.cards, p.card.defId) as PokemonCardDef).hp < 100) continue;
        p.damage += 10;
        addLog(state, `Desert Ruins put a damage counter on ${pokemonName(state, p)}.`, player.id);
      }
    }
  }
  // Rain Dish: a set amount of damage off between turns, wherever it is.
  for (const player of sides) {
    for (const p of [player.active, ...player.bench]) {
      const effect = p && powerActive(p, state.cards, sides) ? powerEffect(effectId(p)) : undefined;
      // Dark Healer: only with Darkness Energy attached.
      const dish = effect?.rainDishWith && !energyPool(p!, state.cards).some((e) => counts(e, effect.rainDishWith!)) ? undefined : effect?.rainDish;
      if (!p || !dish || p.damage < 10) continue;
      const healed = Math.min(dish, p.damage);
      p.damage -= healed;
      addLog(state, `${inPlayDef(state.cards, p).power!.name}: removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(state, p)}.`, player.id);
    }
  }
  for (const id of state.playerOrder) {
    const player = state.players[id]!;
    if (player.powersOffUntil !== undefined && player.powersOffUntil <= state.turn) {
      delete player.powersOffUntil;
      if (id === state.currentPlayer) addLog(state, 'Pokémon Powers work again.');
    }
    delete player.bodiesOffTurn;
    // Sabrina's Psychic Control: a borrowed card not played this turn goes back to its owner's discard pile.
    const borrowed = state.borrowed;
    const held = borrowed?.player === id ? player.hand.find((c) => c.uid === borrowed.uid) : undefined;
    if (borrowed && held) {
      player.hand = player.hand.filter((c) => c !== held);
      state.players[borrowed.owner]!.discard.push(held);
      delete state.borrowed;
      addLog(state, `${lookupCard(state.cards, held.defId).name} went back to the opponent's discard pile.`, id);
    }
    // Koga's Ninja Trick is discarded once its Pokémon is on the Bench.
    for (const p of player.bench) if (p) discardActiveOnly(state, player, p);
    // Tickling Machine: the cards set aside go back into the hand at the end of the player's next turn.
    if (player.setAside && player.setAside.until <= state.turn) {
      player.hand.push(...player.setAside.cards);
      addLog(state, `Put the ${player.setAside.cards.length} cards set aside back into the hand.`, id);
      delete player.setAside;
    }
    // Energy Converter and Submerge last until the end of the turn.
    for (const card of [...player.deck, ...player.hand, ...player.discard, ...player.prizes]) delete card.converted;
    for (const pokemon of [player.active, ...player.bench]) {
      if (!pokemon) continue;
      for (const e of pokemon.energy) delete e.converted;
      delete pokemon.submerged;
      delete pokemon.crystalType;
      delete pokemon.typesCopied;
      expireEffects(pokemon, state.turn);
      if (pokemon.powerOffUntil !== undefined && pokemon.powerOffUntil <= state.turn) {
        delete pokemon.powerOffUntil;
        delete pokemon.gazed;
      }
      // PlusPower at the end of its turn, Defender at the end of the opponent's next turn.
      const expired = (pokemon.attached ?? []).filter((a) => a.until <= state.turn);
      if (!expired.length) continue;
      pokemon.attached = pokemon.attached!.filter((a) => !expired.includes(a));
      // Charity goes back to the hand instead.
      for (const a of expired) {
        (a.toHand ? player.hand : player.discard).push(a.card);
        addLog(state, `${lookupCard(state.cards, a.card.defId).name} on ${pokemonName(state, pokemon)} ${a.toHand ? 'returned to the hand' : 'was discarded'}.`, id);
      }
    }
  }
}

/**
 * Discards Energy cards an effect took off one of `owner`'s Pokémon, the effect being another player's (Energy Removal,
 * Whirlpool…). With Ecogym in play, a non-Colorless Energy card goes back to its owner's hand instead.
 */
export function discardTheirEnergy(state: GameState, owner: PlayerState, cards: CardInstance[]) {
  const ecogym = !!state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Ecogym';
  for (const { provides, ...card } of cards) {
    const d = lookupCard(state.cards, card.defId);
    // A Pokémon attached as Energy (Buzzap) isn't an Energy card.
    const back = ecogym && !provides && d.kind === 'energy' && (!!d.anyType || d.energyType !== 'colorless');
    (back ? owner.hand : owner.discard).push(card);
    if (back) addLog(state, `Ecogym: ${d.name} went back to the hand.`, owner.id);
  }
}

/** The Pokémon Tool attached to the Pokémon, if any, and its name. */
export const toolOf = (cards: CardLibrary, p: Pick<InPlayPokemon, 'attached'>) => {
  const tool = p.attached?.find((a) => a.tool);
  return tool ? { tool, name: lookupCard(cards, tool.card.defId).name } : null;
};

/** Discards the Pokémon's Pokémon Tool (once it's used). */
export function discardTool(state: Pick<GameState, 'cards'>, owner: PlayerState, p: InPlayPokemon) {
  const found = toolOf(state.cards, p);
  if (!found) return;
  p.attached = p.attached!.filter((a) => a !== found.tool);
  owner.discard.push(found.tool.card);
}

/**
 * Star Piece: between turns, on a Benched Pokémon with 2 or more damage counters, a card from the deck that evolves from it
 * goes onto it (the first one in the deck: the deck is shuffled, so it's a random one of them); then Star Piece is discarded.
 * With no such card in the deck, nothing happens.
 */
function useStarPiece(state: GameState, owner: PlayerState, p: InPlayPokemon) {
  if (toolOf(state.cards, p)?.name !== 'Star Piece' || p.damage < 20) return;
  const current = lookupCard(state.cards, p.card.defId);
  const card = owner.deck.find((c) => {
    const d = lookupCard(state.cards, c.defId);
    return d.kind === 'pokemon' && evolvesOnto(d, current);
  });
  if (!card) return;
  owner.deck = owner.deck.filter((c) => c !== card);
  evolveWith(state, owner, p, card, 'with Star Piece');
  [owner.deck, state.rngState] = shuffle(owner.deck, state.rngState);
  discardTool(state, owner, p);
  addLog(state, `Star Piece on ${pokemonName(state, p)} was discarded.`, owner.id);
}

/**
 * Berry and Oran Berry (2 damage counters), Sitrus Berry (3), Gold Berry (4), Miracle Berry (Asleep, Confused, Paralyzed or Poisoned) and Lum
 * Berry (any Special Condition): between turns,
 * if the Pokémon has that much damage (or one of those), it's removed and the Berry is discarded.
 */
function useBerry(state: GameState, owner: PlayerState, p: InPlayPokemon) {
  const name = toolOf(state.cards, p)?.name;
  // Oran Berry (EX Ruby & Sapphire) works as Berry.
  const amount = name === 'Berry' || name === 'Oran Berry' ? 20 : name === 'Sitrus Berry' ? 30 : name === 'Gold Berry' ? 40 : 0;
  // Healing Berry: 20 HP or less left, 3 damage counters off.
  // Each logged with what it did (logTool), for the board's animation over the Pokémon.
  const uid = p.card.uid;
  if (name === 'Healing Berry' && p.damage >= 10 && inPlayDef(state.cards, p).hp - p.damage <= 20) {
    const healed = Math.min(30, p.damage);
    p.damage -= healed;
    logTool(state, `Healing Berry: ${pokemonName(state, p)} healed ${healed} damage.`, owner.id, { uid, name, heal: healed });
  } else if (name && amount && p.damage >= amount) {
    p.damage -= amount;
    logTool(state, `${name}: ${pokemonName(state, p)} healed ${amount} damage.`, owner.id, { uid, name, heal: amount });
  } else if (name === 'Miracle Berry' && (p.condition || p.poison)) {
    p.condition = null;
    p.poison = 0;
    delete p.paralyzedTurn;
    logTool(state, `Miracle Berry: ${pokemonName(state, p)} is no longer Asleep, Confused, Paralyzed or Poisoned.`, owner.id, { uid, name });
  } else if (name === 'Lum Berry' && hasSpecialCondition(p)) {
    // Lum Berry: every Special Condition, Burned included.
    clearSpecialConditions(p);
    logTool(state, `Lum Berry: ${pokemonName(state, p)} is no longer affected by Special Conditions.`, owner.id, { uid, name });
  } else return;
  discardTool(state, owner, p);
}

/**
 * A Special Condition or Poison on `owner`'s Active Pokémon outside an attack (Aqua Trance, or a power: Black Beam, Fire
 * Breath), unless it can't be affected.
 */
export function afflictBetweenTurns(state: GameState, owner: PlayerId, pokemon: InPlayPokemon, affliction: 'asleep' | 'poisoned' | 'confused' | 'paralyzed' | 'burned') {
  const name = pokemonName(state, pokemon);
  const label = affliction === 'poisoned' ? 'Poisoned' : affliction === 'burned' ? 'Burned' : conditionLabel(affliction);
  const blocked = afflictionBlocked(state, owner, pokemon, affliction);
  if (blocked) return addLog(state, blocked, owner);
  if (affliction === 'poisoned') pokemon.poison = Math.max(pokemon.poison ?? 0, 10);
  else if (affliction === 'burned') pokemon.burned = true;
  else {
    pokemon.condition = affliction;
    delete pokemon.paralyzedTurn;
    if (affliction === 'paralyzed') pokemon.paralyzedTurn = state.turn;
  }
  addLog(state, `${name} is now ${label}.`, owner);
}

/**
 * Why `pokemon` (of `owner`) can't get `affliction` now, or null: Clefairy Doll and Buried Fossil (`conditionProof`), Thick
 * Skinned and its like (`conditionFree`), `noPoison`, `noSleep`/`immuneTo` (`conditionBarred`), Flash Touch (not for Burned),
 * Pollen Shield and an attack's `conditionProof` effect, and a run's `conditionGuard` rule (named). Every power, body and
 * Trainer card that gives a Special Condition outside an attack checks here (attacks' `inflict` checks the same itself).
 */
export function afflictionBlocked(state: GameState, owner: PlayerId, pokemon: InPlayPokemon, affliction: 'asleep' | 'poisoned' | 'confused' | 'paralyzed' | 'burned'): string | null {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  const effect = powerActive(pokemon, state.cards, sides) ? powerEffect(effectId(pokemon)) : undefined;
  const name = pokemonName(state, pokemon);
  const e = pokemon.effects;
  const shielded = (e?.flashTouch && state.players[owner]!.active === pokemon && affliction !== 'burned') || (e?.pollenShield ?? -1) >= state.turn || (e?.conditionProof ?? -1) >= state.turn;
  if (conditionProof(inPlayDef(state.cards, pokemon)) || conditionFree(pokemon, state.cards, effect) || (affliction === 'poisoned' && effect?.noPoison) || conditionBarred(effect, affliction, pokemon) || shielded) {
    return `${name} can't be affected by Special Conditions.`;
  }
  const guard = state.rules?.find((r) => r.kind === 'conditionGuard' && r.player === owner && r.conditions.includes(affliction));
  return guard ? `${guard.label ?? 'A battle rule'} protected ${name} from that.` : null;
}

function expireEffects(pokemon: InPlayPokemon, turn: number) {
  const e = pokemon.effects;
  if (!e) return;
  for (const key of ['preventDamage', 'preventAll', 'harden', 'destinyBond', 'sandAttack', 'smokescreen', 'minimize', 'noRetreat', 'swordsDance', 'energyBurn', 'lightScreen', 'mirrorShell', 'noAttack', 'noEnergy', 'fireWall', 'focusEnergy', 'crosscounter', 'screech', 'endure', 'pollenShield', 'counter', 'secretePoison', 'slime', 'pursuit', 'lockOn', 'triggeredPoison', 'effectProof', 'pulseGuard', 'dodge', 'reflectShield', 'armorUp', 'noEvolve', 'heavier', 'tailwind', 'noPokePowers', 'conditionProof', 'stockpile', 'silverWind', 'cometPunch', 'evolvedProof', 'exProof', 'pivot', 'hustle'] as const) {
    if (e[key] !== undefined && e[key] <= turn) delete e[key];
  }
  if (e.charm && e.charm.until <= turn) delete e.charm;
  if (e.heldBy?.until !== undefined && e.heldBy.until <= turn) delete e.heldBy;
  if (e.amnesia && e.amnesia.until <= turn) delete e.amnesia;
  if (e.cantAttack && e.cantAttack.until <= turn) delete e.cantAttack;
  if (e.pounce && e.pounce.until <= turn) delete e.pounce;
  if (e.preventUpTo && e.preventUpTo.until <= turn) delete e.preventUpTo;
}

/**
 * After the Active Pokémon may have changed: a player's new Active Pokémon (from their Bench) during their own turn takes
 * 10 from each working Spikes on the other side (no Weakness or Resistance); a Pokémon Gaze switched off works again once
 * it's left the Bench. `duringTurn`: false for a promotion between turns.
 */
function newActives(state: GameState, duringTurn: boolean) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const player of sides) {
    const active = player.active;
    if (!active) continue;
    if (active.gazed) {
      delete active.gazed;
      delete active.powerOffUntil;
    }
    const base = baseUid(active);
    const changed = player.lastActive !== undefined && player.lastActive !== base;
    const benched = changed ? player.bench.find((p) => p && baseUid(p) === player.lastActive) : undefined;
    player.lastActive = base;
    // Magma Pool: the Active Pokémon that moved to the Bench gives a Fire Energy card to the new one.
    if (benched && powerEffect(effectId(benched))?.magmaPool && powerActive(benched, state.cards, sides)) {
      const fire = benched.energy.filter((e) => isEnergyCardOf(e, state.cards, 'fire'));
      const energy = fire.find((e) => lookupCard(state.cards, e.defId).name !== 'Rainbow Energy') ?? fire[0];
      if (energy) {
        benched.energy = benched.energy.filter((e) => e !== energy);
        active.energy.push(energy);
        addLog(state, `Magma Pool: moved ${lookupCard(state.cards, energy.defId).name} from ${pokemonName(state, benched)} to ${pokemonName(state, active)}.`, player.id);
      }
    }
    if (!changed || !duringTurn || player.id !== state.currentPlayer) continue;
    const other = sides.find((p) => p !== player)!;
    for (const p of [other.active, ...other.bench]) {
      if (!p || !powerEffect(effectId(p))?.spikes || !powerActive(p, state.cards, sides)) continue;
      active.damage += 10;
      addLog(state, `Spikes: ${pokemonName(state, p)} did 10 damage to ${pokemonName(state, active)}.`, other.id);
    }
  }
}

/**
 * Knocks out every Pokémon whose damage reached its HP; for each, its owner's opponent takes a
 * prize. Returns the winner, if any: a player wins by taking their last prize or when the
 * opponent has no Pokémon left in play. If both win at once, `favoured` wins. Exported for the CPU, which runs it on its
 * copies to see whether an attack would lose it the game (cpu/shared.ts).
 */
export function resolveKnockouts(state: GameState, favoured: PlayerId): PlayerId | null {
  newActives(state, state.phase === 'playing');
  // A Ditto that stopped being a copy (Asleep, switched…) has its own HP again; so has a Dark Pokémon once Rocket's Hideout is gone.
  refreshTransforms(state);
  refreshHideout(state);
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const id of state.playerOrder) {
    const owner = state.players[id]!;
    const taker = state.players[opponentOf(state, id)]!;
    // Time Travel: Knocked Out by the opponent's attack, a heads (flipped then) shuffles it and its cards into the deck instead.
    for (const p of [owner.active, ...owner.bench]) {
      if (!p?.timeTravel) continue;
      const bottom = p.timeTravel === 'bottom';
      delete p.timeTravel;
      if (p.damage < inPlayDef(state.cards, p).hp) continue;
      if (owner.active === p) owner.active = null;
      else owner.bench = owner.bench.map((q) => (q === p ? null : q));
      // Celebi ☆: the cards attached are discarded, and it goes on the bottom of the deck.
      if (bottom) {
        owner.discard.push(...p.evolvedFrom, ...p.energy.map(asDiscarded), ...(p.attached ?? []).map((a) => a.card));
        owner.deck.push(p.card);
        addLog(state, `Time Travel: ${pokemonName(state, p)} isn't Knocked Out; its cards were discarded and it went on the bottom of the deck.`, id);
        continue;
      }
      const cards = [...p.evolvedFrom, p.card, ...p.energy.map(asDiscarded), ...(p.attached ?? []).map((a) => a.card)];
      [owner.deck, state.rngState] = shuffle([...owner.deck, ...cards], state.rngState);
      addLog(state, `Time Travel: ${pokemonName(state, p)} isn't Knocked Out; it was shuffled into the deck.`, id);
    }
    const knockOut = (pokemon: InPlayPokemon) => {
      addLog(state, `${pokemonName(state, pokemon)} was Knocked Out.`, id);
      // Time Shard: Knocked Out by the opponent's attack, up to 2 of its basic Energy cards go back to the hand.
      if (pokemon.timeShard === true) {
        const back = pokemon.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId))).slice(0, 2);
        pokemon.energy = pokemon.energy.filter((e) => !back.includes(e));
        owner.hand.push(...back.map(asDiscarded));
        if (back.length) addLog(state, `Time Shard: ${back.length} basic Energy card${back.length === 1 ? '' : 's'} went back to the hand.`, id);
      }
      // Rebirth: the card goes back to the hand once it's discarded, unless its power isn't working (Asleep…).
      const reborn = !!powerEffect(effectId(pokemon))?.rebirth && powerActive(pokemon, state.cards, sides) && !discardsLocked(sides, state.cards);
      owner.discard.push(...pokemon.evolvedFrom, pokemon.card, ...pokemon.energy.map(asDiscarded), ...(pokemon.attached ?? []).map((a) => a.card));
      if (reborn) {
        owner.discard = owner.discard.filter((c) => c !== pokemon.card);
        owner.hand.push(pokemon.card);
        addLog(state, `Rebirth: ${pokemonName(state, pokemon)} returned to the hand.`, id);
      }
      // A Trainer played as a Pokémon (Clefairy Doll) doesn't count as a Knocked Out Pokémon: no prize.
      const def = lookupCard(state.cards, pokemon.card.defId);
      if (def.kind === 'pokemon' && def.trainerText) return;
      // Empty Shell: the opponent takes no Prize cards for Shedinja, while the body works (Ancient Wind, Imprison and Stadiums turn it off).
      if (powerEffect(effectId(pokemon))?.noPrizes && powerActive(pokemon, state.cards, sides)) return addLog(state, `Empty Shell: no Prize cards for ${pokemonName(state, pokemon)}.`, id);
      // A Pokémon-ex gives up 2 Prize cards.
      for (let n = def.kind === 'pokemon' && def.ex ? 2 : 1; n > 0; n--) {
        const prize = taker.prizes.pop();
        if (prize) taker.hand.push(prize);
      }
    };
    // Scram: with exactly 10 HP left, Brock's Primeape is shuffled into its owner's deck with every card attached.
    for (const p of [owner.active, ...owner.bench]) {
      if (!p || !powerEffect(effectId(p))?.scram || !powerActive(p, state.cards, sides) || inPlayDef(state.cards, p).hp - p.damage !== 10) continue;
      const cards = [...p.evolvedFrom, p.card, ...p.energy.map(asDiscarded), ...(p.attached ?? []).map((a) => a.card)];
      [owner.deck, state.rngState] = shuffle([...owner.deck, ...cards], state.rngState);
      if (owner.active === p) owner.active = null;
      else owner.bench = owner.bench.map((q) => (q === p ? null : q));
      addLog(state, `Scram: ${pokemonName(state, p)} was shuffled into the deck.`, id);
    }
    const isOut = (p: InPlayPokemon) => p.damage >= inPlayDef(state.cards, p).hp;
    if (owner.active && isOut(owner.active)) {
      knockOut(owner.active);
      owner.active = null;
    }
    owner.bench = owner.bench.map((p) => (p && isOut(p) ? (knockOut(p), null) : p));
  }
  const winners = state.playerOrder.filter((id) => {
    const opp = state.players[opponentOf(state, id)]!;
    return state.players[id]!.prizes.length === 0 || (!opp.active && !hasBenched(opp));
  });
  if (winners.length === 0) return null;
  return winners.includes(favoured) ? favoured : winners[0]!;
}

/** A card leaving play: an Electrode attached as Energy (Buzzap) is a Pokémon card again. */
const asDiscarded = ({ provides: _, converted: _c, windless: _w, ...card }: CardInstance): CardInstance => card;

const isBenchSlot = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < MAX_BENCH;

/** The player's Pokémon at an action's target (nothing when the slot is empty, or isn't a Bench slot at all). */
const actionTarget = (me: PlayerState, target: Target) => (target === 'active' ? me.active : isBenchSlot(target) ? me.bench[target] : null);

export const hasBenched = (player: Pick<PlayerState, 'bench'>) => player.bench.some((p) => p !== null);

/** A Pokémon card as it comes into play (put onto the Bench, or the Active spot at the start). */
export function newInPlay(card: CardInstance, turn: number): InPlayPokemon {
  return { card, evolvedFrom: [], damage: 0, energy: [], playedTurn: turn };
}

function takeFromHand(player: PlayerState, uid: string): CardInstance | undefined {
  const idx = player.hand.findIndex((c) => c.uid === uid);
  return idx < 0 ? undefined : player.hand.splice(idx, 1)[0];
}

/**
 * Wild Growth: a player's Grass Pokémon are marked (`wildGrowth`) while any of their Pokémon has it working, so energyPool
 * counts their Grass Energy cards twice. However many there are, it doesn't stack (agreed).
 */
function refreshWildGrowth(state: GameState) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const player of sides) {
    const inPlay = [player.active, ...player.bench].filter((p): p is InPlayPokemon => !!p);
    const growing = inPlay.some((p) => powerEffect(effectId(p))?.wildGrowth && powerActive(p, state.cards, sides));
    for (const p of inPlay) {
      if (growing && hasType(inPlayDef(state.cards, p), 'grass')) p.wildGrowth = true;
      else delete p.wildGrowth;
    }
  }
}

/**
 * Recycle Energy: put into a discard pile from play (since the last action), it goes back to its owner's hand. Then the
 * ones attached now are noted for next time.
 */
function returnRecycleEnergy(state: GameState) {
  for (const uid of state.recycleWatch ?? []) {
    for (const player of Object.values(state.players)) {
      const i = player.discard.findIndex((c) => c.uid === uid);
      if (i < 0) continue;
      player.hand.push(...player.discard.splice(i, 1));
      addLog(state, 'Recycle Energy went back to the hand.', player.id);
    }
  }
  const attached = Object.values(state.players).flatMap((p) => [p.active, ...p.bench]).flatMap((p) => p?.energy ?? []);
  const watch = attached.filter((e) => !e.provides && !e.windless && lookupCard(state.cards, e.defId).name === 'Recycle Energy').map((e) => e.uid);
  if (watch.length) state.recycleWatch = watch;
  else delete state.recycleWatch;
}

function finish(state: GameState, winner: PlayerId): ActionResult {
  state.phase = 'finished';
  state.winner = winner;
  state.pendingPromotion = null;
  return ok(state);
}

/**
 * Rocket's Hideout: while it's the Stadium in play, each Pokémon with Dark in its name has 20 more HP (`hideout`, inPlayDef).
 * Low Pressure System: each Grass and Lightning Pokémon, both players', has 10 more (`lowPressure`). Energy Variation, while it
 * works (Toxic Gas…): Kecleon is the types of the basic Energy cards attached (`variedTypes`), which Low Pressure System sees.
 */
function refreshHideout(state: GameState) {
  const stadium = state.stadium && lookupCard(state.cards, state.stadium.card.defId).name;
  // EX Team Rocket Returns' Rocket's Hideout: Pokémon with Rocket's in their names too.
  const rockets = !!state.stadium && (lookupCard(state.cards, state.stadium.card.defId) as { text?: string }).text?.includes("Rocket's in its name");
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const player of Object.values(state.players)) {
    for (const p of [player.active, ...player.bench]) {
      if (!p) continue;
      delete p.variedTypes;
      if (inPlayDef(state.cards, p).power?.name === 'Energy Variation' && powerActive(p, state.cards, sides)) {
        const types = [...new Set(p.energy.flatMap((e) => (!e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)) ? [energyProvided(e, state.cards).type as EnergyType] : [])))];
        if (types.length) p.variedTypes = types;
      }
      // Dual Armor: with Energy of its type attached, it's both types.
      const armor = powerEffect(effectId(p))?.dualArmor;
      if (armor && powerActive(p, state.cards, sides) && energyPool(p, state.cards).some((e) => counts(e, armor.energy))) p.variedTypes = armor.types;
      // Dual Armor (React Energy), Reactive Colors: with a card of that name attached, it's those types.
      const named = powerEffect(effectId(p))?.dualArmorNamed ?? powerEffect(effectId(p))?.colorsNamed;
      if (named && powerActive(p, state.cards, sides) && p.energy.some((e) => !e.provides && !e.windless && lookupCard(state.cards, e.defId).name === named.name)) p.variedTypes = named.types;
      if (stadium === "Rocket's Hideout" && (/\bDark\b/.test(lookupCard(state.cards, p.card.defId).name) || (rockets && lookupCard(state.cards, p.card.defId).name.startsWith("Rocket's ")))) p.hideout = true;
      else delete p.hideout;
      const d = inPlayDef(state.cards, p);
      if (stadium === 'Low Pressure System' && (hasType(d, 'grass') || hasType(d, 'lightning'))) p.lowPressure = true;
      else delete p.lowPressure;
      // Space Center: no Poké-Bodies for Basic Pokémon (not Pokémon-ex or an owner's). Battle Frontier: no Poké-Powers or
      // Poké-Bodies for Colorless, Darkness and Metal Evolved Pokémon (either of a dual type's types).
      delete p.stadiumMuted;
      if (stadium === 'Space Center' && d.stage === 'basic' && !d.ex && !hasOwner(d.name)) p.stadiumMuted = 'bodies';
      if (stadium === 'Battle Frontier' && p.evolvedFrom.length && (['colorless', 'darkness', 'metal'] as const).some((t) => hasType(d, t))) p.stadiumMuted = 'all';
      // Sidney's Stadium: Darkness Pokémon can't be Asleep, Confused or Paralyzed (one already is, no longer).
      if (stadium === "Sidney's Stadium" && hasType(d, 'darkness')) {
        p.sidneyGuard = true;
        if (p.condition) {
          p.condition = null;
          delete p.paralyzedTurn;
          addLog(state, `Sidney's Stadium: ${pokemonName(state, p)} is no longer affected by that Special Condition.`, player.id);
        }
      } else delete p.sidneyGuard;
      // Holon Legacy: no Poké-Powers for δ Pokémon. Cessation Crystal on either Active Pokémon: no powers for anyone.
      if (stadium === 'Holon Legacy' && isDelta(state.cards, p)) p.stadiumMuted = 'powers';
      if (sides.some((s) => s.active && toolOf(state.cards, s.active)?.name === 'Cessation Crystal')) p.stadiumMuted = 'all';
      // A Pokémon Tool that can't stay on its Pokémon (Curse Powder on a Basic Pokémon, Energy Root on a Pokémon-ex…) is discarded.
      const tool = toolOf(state.cards, p);
      const fits = tool && trainerEffect(tool.tool.card.defId)?.toolFor;
      if (tool && fits && (!fits(d) || (trainerEffect(tool.tool.card.defId)?.evolvedToolOnly && !p.evolvedFrom.length))) {
        discardTool(state, player, p);
        addLog(state, `${tool.name} on ${pokemonName(state, p)} was discarded.`, player.id);
      }
      // Full Flame: evolving or devolving doesn't remove Burned (a Burned Active Pokémon whose top card changed is Burned again).
      if (stadium === 'Full Flame' && player.active === p) {
        if (!p.burned && p.flameBurned && p.flameBurned !== p.card.uid) {
          p.burned = true;
          addLog(state, `Full Flame: ${pokemonName(state, p)} is still Burned.`, player.id);
        }
        if (p.burned) p.flameBurned = p.card.uid;
        else delete p.flameBurned;
      } else delete p.flameBurned;
      // Energy Root: 20 more HP and no Poké-Powers or Poké-Bodies (as Battle Frontier). Hitmonchan's Stages of Evolution: 30 more HP.
      delete p.hpPlus;
      if (toolOf(state.cards, p)?.name === 'Energy Root') {
        p.hpPlus = 20;
        p.stadiumMuted = 'all';
      }
      const plus = powerEffect(effectId(p))?.hpPlus;
      if (plus && powerActive(p, state.cards, sides)) p.hpPlus = (p.hpPlus ?? 0) + plus;
      // Holon Research Tower: the basic Energy cards on a δ Pokémon are Metal too (energyPool).
      for (const e of p.energy) {
        if (stadium === 'Holon Research Tower' && isDelta(state.cards, p) && !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId))) e.holonMetal = true;
        else delete e.holonMetal;
      }
    }
  }
  // Then the bodies that change other Pokémon, now that the Stadium's have been worked out.
  for (const player of Object.values(state.players)) {
    const own = [player.active, ...player.bench].filter((p): p is InPlayPokemon => !!p);
    const working = (key: keyof PowerEffect) => own.filter((q) => powerEffect(effectId(q))?.[key] && powerActive(q, state.cards, sides)).map((q) => powerEffect(effectId(q))!);
    // Holon Veil: every Pokémon of the player's has δ on its card, for both players' cards (agreed).
    const veil = working('holonVeil').length > 0;
    if (veil) player.holonVeil = true;
    else delete player.holonVeil;
    for (const p of own) {
      if (veil) p.veiled = true;
      else delete p.veiled;
    }
    // Crystal Beach: every Special Energy card is checked for providing 2 or more (energyPool). Chlorophyll: on the player's
    // Grass Pokémon, a card providing only Colorless Energy provides Grass instead (agreed: as much, any such card).
    const beach = stadium === 'Crystal Beach';
    const chlorophyll = working('chlorophyll').length > 0;
    for (const p of own) {
      const grass = chlorophyll && hasType(inPlayDef(state.cards, p), 'grass');
      for (const e of p.energy) {
        if (beach && isSpecialEnergy(state.cards, e)) e.beached = true;
        else delete e.beached;
        delete e.chlorophyll;
        if (grass && cardEnergy(p, e, state.cards).every((t) => t === 'colorless')) e.chlorophyll = true;
      }
    }
    // Reactive Booster: each React Energy card on the player's Pokémon it names provides 2 Energy of every type (energyPool).
    const boosted = working('reactiveBooster').flatMap((e) => e.reactiveBooster!);
    for (const p of own) {
      const name = inPlayDef(state.cards, p).name;
      for (const e of p.energy) {
        if (boosted.some((n) => namesMatch(name, n)) && !e.provides && !e.windless && lookupCard(state.cards, e.defId).name === 'React Energy') e.reactBoost = true;
        else delete e.reactBoost;
      }
    }
    // Green Essence: the player's Active Pokémon with its Energy type attached can't have Special Conditions.
    const essence = working('greenEssence').map((e) => e.greenEssence!);
    for (const p of own) {
      if (p === player.active && essence.some((t) => energyPool(p, state.cards).some((e) => counts(e, t)))) p.greenEssence = true;
      else delete p.greenEssence;
      // Sunbeam: the player's Lunatone have 80 HP.
      const sunbeam = working('hpOf').find((e) => namesMatch(inPlayDef(state.cards, { ...p, hpSet: undefined }).name, e.hpOf!.name));
      if (sunbeam) p.hpSet = sunbeam.hpOf!.hp;
      else delete p.hpSet;
    }
  }
  // Mystic Scale: while a Milotic ex has it working, Technical Machines in play are discarded.
  if (sides.some((s) => [s.active, ...s.bench].some((q) => q && powerEffect(effectId(q))?.mysticScale && powerActive(q, state.cards, sides)))) {
    for (const player of Object.values(state.players)) {
      for (const p of [player.active, ...player.bench]) {
        const machines = (p?.attached ?? []).filter((a) => !!trainerEffect(a.card.defId)?.technicalMachine);
        if (!p || !machines.length) continue;
        p.attached = p.attached!.filter((a) => !machines.includes(a));
        player.discard.push(...machines.map((a) => a.card));
        addLog(state, `Mystic Scale: discarded ${machines.map((a) => lookupCard(state.cards, a.card.defId).name).join(', ')}.`, player.id);
      }
    }
  }
}

/** Multi Energy provides Colorless Energy only while another Special Energy card is attached to its Pokémon (agreed: checked all the time). */
function refreshMultiEnergy(state: GameState) {
  for (const player of Object.values(state.players)) {
    for (const p of [player.active, ...player.bench]) {
      for (const e of p?.energy ?? []) {
        const multi = !e.provides && lookupCard(state.cards, e.defId).name === 'Multi Energy';
        if (multi && p!.energy.some((o) => o !== e && isSpecialEnergy(state.cards, o))) e.colorlessOnly = true;
        else delete e.colorlessOnly;
      }
    }
  }
}

/** Primal Lock: while one works, the Pokémon Tool cards attached to its owner's opponent's Pokémon are discarded. */
function dropLockedTools(state: GameState) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const player of sides) {
    if (!primalLocked(player, sides, state.cards)) continue;
    for (const p of [player.active, ...player.bench]) {
      const tool = p && toolOf(state.cards, p);
      if (!p || !tool) continue;
      addLog(state, `Primal Lock: ${tool.name} on ${pokemonName(state, p)} was discarded.`, player.id);
      discardTool(state, player, p);
    }
  }
}

/**
 * Energy Converter's Energy goes back to its own type once the Porygon2 that converted it is gone or has any Special
 * Condition; Submerge ends once Lanturn is. (Both end with the turn: betweenTurns.)
 */
function refreshConverted(state: GameState) {
  const inPlay = Object.values(state.players).flatMap((player) => [player.active, ...player.bench]).filter((p): p is InPlayPokemon => !!p);
  for (const p of inPlay) {
    if (p.submerged !== undefined && hasSpecialCondition(p)) delete p.submerged;
    for (const e of p.energy) {
      if (!e.converted || e.converted.untied) continue;
      const porygon = inPlay.find((q) => q.card.uid === e.converted!.by);
      if (!porygon || hasSpecialCondition(porygon)) delete e.converted;
    }
  }
}

/** Legendary Body: an Active Pokémon with it working has every Trainer card attached to it discarded (not Shapeshift's Evolution card). */
function discardLegendaryTrainers(state: GameState) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const player of sides) {
    const active = player.active;
    const trainers = active && trainerProof(player, sides, state.cards) ? (active.attached ?? []).filter((a) => lookupCard(state.cards, a.card.defId).kind === 'trainer') : [];
    if (!active || !trainers.length) continue;
    active.attached = active.attached!.filter((a) => !trainers.includes(a));
    player.discard.push(...trainers.map((a) => a.card));
    addLog(state, `Legendary Body: discarded ${trainers.map((a) => lookupCard(state.cards, a.card.defId).name).join(', ')} from ${pokemonName(state, active)}.`, player.id);
  }
}

/** Miraculous Wind: while a Light Dragonite has it working as the Active Pokémon, every Special Energy card in play is `windless`. */
function refreshWind(state: GameState) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  const blowing = miraculousWind(sides, state.cards);
  for (const p of sides.flatMap((s) => [s.active, ...s.bench])) {
    for (const e of p?.energy ?? []) {
      if (blowing && isSpecialEnergy(state.cards, e)) e.windless = true;
      else delete e.windless;
    }
  }
}

/**
 * Boost Energy, Double Rainbow Energy and Scramble Energy are discarded from a Pokémon that's no longer an Evolved Pokémon
 * (devolved), Scramble Energy from a Pokémon-ex too. Scramble Energy provides 3 Energy of any types while its owner has more
 * Prize cards left than the opponent (`scrambled`, energyPool).
 */
function dropBoostEnergy(state: GameState) {
  for (const player of Object.values(state.players)) {
    const behind = player.prizes.length > state.players[opponentOf(state, player.id)]!.prizes.length;
    for (const p of [player.active, ...player.bench]) {
      const name = (e: CardInstance) => lookupCard(state.cards, e.defId).name;
      const ex = !!p && inPlayDef(state.cards, p).ex;
      for (const e of p?.energy ?? []) if (!e.provides && name(e) === 'Scramble Energy') e.scrambled = behind || undefined;
      const boost = p ? p.energy.filter((e) => !e.provides && ((!p.evolvedFrom.length && ['Boost Energy', 'Double Rainbow Energy', 'Scramble Energy'].includes(name(e))) || (ex && name(e) === 'Scramble Energy'))) : [];
      if (!p || !boost.length) continue;
      p.energy = p.energy.filter((e) => !boost.includes(e));
      player.discard.push(...boost.map(asDiscarded));
      addLog(state, `${boost.map((e) => lookupCard(state.cards, e.defId).name).join(' and ')} on ${pokemonName(state, p)} was discarded.`, player.id);
    }
  }
}

function ok(state: GameState): ActionResult {
  refreshTransforms(state);
  dropBoostEnergy(state);
  refreshWildGrowth(state);
  refreshHideout(state);
  refreshConverted(state);
  discardLegendaryTrainers(state);
  refreshWind(state);
  refreshMultiEnergy(state);
  dropLockedTools(state);
  returnRecycleEnergy(state);
  dropShapeshifts(state);
  state.version += 1;
  return { ok: true, state };
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}
