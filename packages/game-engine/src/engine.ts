/// <reference path="./globals.d.ts" />
import { applyWeaknessResistance, attackSituation, checkAttack, performAttack, recallsAttacks, usableAttacks, type AttackChoices } from './attacks.js';
import { attachBlocked, discardsLocked, energyFromHand, evolutionBlocked, primalBlock, retreatBodies, guardedBy, spiraledBy, conditionFree, miraculousWind, offerChainReaction, playedFromHand, powerActive, refreshTransforms, retreatAid, deepSleep, hotPlate, stickyGoo, trainerProof, primalLocked, trainersDusted, trainersBlocked, usePower, zoomed, type PowerChoices } from './powers.js';
import { evolvesFromEevee, evolveWith, playTrainer, resolvePending, stadiumError, trainersLocked, TRAINERS_LOCKED, type PendingChoice, type TrainerChoices } from './trainers.js';
import { energyEffect, powerEffect, trainerEffect } from './effects/index.js';
import { conditionProof, hasType, isBasicEnergy, isBasicPokemon, isBenchable, isTrainerCard, lookupCard, type Attack, type CardDef, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { addLog, baseUid, clearOnLeavingActive, effectId, evolvedHook, hasSpecialCondition, shapeshiftCard, flipCoin, inPlayDef, openBenchSlot, pokemonName, revealFaceDown, type LogEntry } from './status.js';
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
}

/** Energy that pays for a Crystal Energy card: one of these types (`crystal:fire,water`), chosen as the cost needs. */
export type CrystalEnergy = `crystal:${string}`;

/** Asleep, Confused and Paralyzed replace each other; Poison and Burned are tracked separately (InPlayPokemon.poison, .burned). */
export type SpecialCondition = 'asleep' | 'confused' | 'paralyzed';

/** Something an attack did to a Pokémon besides damage, as Mirror Move reflects it. */
export type Affliction = SpecialCondition | 'poisoned' | 'toxic' | 'burned';

/**
 * Lasting effects of attacks on a Pokémon. Turn numbers are the last turn the effect applies
 * ("during your opponent's next turn" = the turn after the attack). All are removed when the
 * Pokémon is benched or evolves, except `leekSlapUsed`.
 */
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
  timeTravel?: boolean;
  /** Submerge: the turn it's a Water Pokémon (inPlayDef), until it has any Special Condition (refreshConverted). */
  submerged?: number;
  /** Rocket's Hideout is the Stadium in play and it has Dark in its name: 20 more HP (refreshHideout, inPlayDef). */
  hideout?: boolean;
  /** Crystal Type: the type it's changed to until the end of the turn (inPlayDef). */
  crystalType?: EnergyType;
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
  /** Dragon Dance: the turn this player's attacks do 40 more damage to each Defending Pokémon they damage, before Weakness and Resistance. */
  dragonDanceTurn?: number;
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
    const eevee = (target === 'active' ? owner.active : owner.bench[target])!;
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

function act(prev: GameState, playerId: PlayerId, action: GameAction): ActionResult {
  if (!prev.players[playerId]) return fail('Not a player in this game');
  if (prev.phase === 'finished') return fail('Game is over');

  const state = structuredClone(prev);
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
      const again: GameState = { ...structuredClone(pending.before), rngState: state.rngState, log: state.log, version: state.version };
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
      // Narrow Gym: no more than 4 benched Pokémon.
      if (openBenchSlot(me.bench, state.cards, state.stadium?.card) < 0) return fail('Your Bench is full (Narrow Gym: 4 Pokémon at most)');
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
      const target = action.target === 'active' ? me.active : isBenchSlot(action.target) ? me.bench[action.target] : null;
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
      const target = action.target === 'active' ? me.active : isBenchSlot(action.target) ? me.bench[action.target] : null;
      if (!target) return fail('Attach energy to one of your Pokémon');
      // Blaine: a second Fire Energy card can go to the Pokémon with Blaine in its name that got the first.
      const fire = (c: CardInstance) => isBasicEnergy(card(c)) && (card(c) as { energyType?: EnergyType }).energyType === 'fire';
      const blaine = me.blaineTurn === state.turn && pokemonName(state, target).includes('Blaine');
      const second = state.energyAttachedThisTurn && blaine && state.blaineAttach === baseUid(target);
      if (state.energyAttachedThisTurn && !second) return fail('Already attached energy this turn');
      const handCard = me.hand.find((c) => c.uid === action.cardUid);
      if (second && handCard && !fire(handCard)) return fail('Blaine: the second Energy card must be a Fire Energy card');
      const energy = takeFromHand(me, action.cardUid);
      if (!energy || card(energy).kind !== 'energy') return fail('Must attach an energy card from your hand');
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
      // Rainbow Energy's damage can Knock Out the Pokémon.
      return afterOwnMove(state, me, opp);
    }

    case 'ATTACK': {
      if (state.turn === 1) return fail('The first player cannot attack on turn 1');
      if (!me.active || !opp.active) return fail('No active Pokémon');
      return preAttackQuestion(state, me, opp, action.attackIndex, action.choices ?? {}) ?? attackAction(state, me, opp, action.attackIndex, action.choices ?? {});
    }

    case 'FLIP_FACE_DOWN': {
      const target = action.target === 'active' ? me.active : isBenchSlot(action.target) ? me.bench[action.target] : null;
      if (!target?.faceDown) return fail('Choose one of your face-down cards');
      revealFaceDown(state, me.id, target);
      return afterOwnMove(state, me, opp);
    }

    case 'DISCARD_SHAPESHIFT': {
      const target = action.target === 'active' ? me.active : isBenchSlot(action.target) ? me.bench[action.target] : null;
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
      clearOnLeavingActive(retreated);
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
      const target = action.target === 'active' ? me.active : isBenchSlot(action.target) ? me.bench[action.target] : null;
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
  const usable = usableAttacks(me.active!, state.cards, { recall: recallsAttacks(state, me), bench: me.bench, defender: opp.active, oppBench: opp.bench, stadium: state.stadium?.card ?? null })[attackIndex];
  const esp = !reflipped && (me.active!.attached ?? []).some((a) => lookupCard(state.cards, a.card.defId).name === "Sabrina's ESP");
  const before = esp ? structuredClone(state) : null;
  const source = usable && `${inPlayDef(state.cards, me.active!).name}'s ${usable.attack.name}`;
  const logged = state.log?.at(-1)?.n ?? 0;
  const error = performAttack(state, me, opp, attackIndex, choices, { flee });
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
  if (!ninja && !flee) return null;
  const checked = checkAttack(attackSituation(state, me, opp), attackIndex, given);
  if ('error' in checked) return fail(checked.error);
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
  return current.name === evolution.evolvesFrom || (current.name === 'Buried Fossil' && evolution.evolvesFrom === 'Mysterious Fossil');
}

/**
 * Energy the Pokémon must discard to retreat. `sides` (its owner first) are for powers that change it:
 * each working Retreat Aid on the owner's Bench takes 1 off the Active Pokémon's cost, and the opponent's working
 * Sticky Goo adds 2. The Stadium in play can change it too (The Rocket's Training Gym, Cerulean City Gym).
 */
export const retreatCost = (pokemon: InPlayPokemon, cards: CardLibrary, sides: Pick<PlayerState, 'active' | 'bench'>[] = [], stadium?: CardInstance | null) =>
  // Balloon Berry: it's discarded instead of Energy cards (RETREAT). [Zoom]: free for an Unown.
  // Tailwind: 0 this turn.
  toolOf(cards, pokemon)?.name === 'Balloon Berry' || zoomed(pokemon, cards, sides) || pokemon.effects?.tailwind !== undefined ? 0 : Math.max(
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
export const heldActive = (pokemon: InPlayPokemon, sides: Pick<PlayerState, 'active'>[]) => {
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
  if (def.kind !== 'energy') return { type: 'colorless', amount: 1 };
  return { type: def.anyType ? 'any' : def.energyType, amount: def.amount ?? 1 };
}

/**
 * Whether an attached card is a `type` Energy card: a basic one of that type, or Rainbow Energy (every type while in
 * play). Not Double Colorless, nor a Pokémon attached as Energy (Buzzap).
 */
/** A Special Energy card (not basic Energy, nor a Pokémon attached as Energy). */
export function isSpecialEnergy(cards: CardLibrary, card: CardInstance): boolean {
  const d = lookupCard(cards, card.defId);
  return !card.provides && d.kind === 'energy' && d.basic === false;
}

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
  // Rare Metal, Prismatic Body: each basic Energy card provides another type (Prismatic Body: every type, 1 at a time).
  const basicAs = pokemon.powerOffUntil === undefined ? powerEffect(effectId(pokemon))?.basicEnergyAs : undefined;
  const pool = pokemon.energy.flatMap((e) => {
    const { type, amount } = energyProvided(e, cards);
    if (basicAs && !e.provides && isBasicEnergy(lookupCard(cards, e.defId))) return [basicAs];
    // Aqua Energy and Magma Energy: 2 Energy, each either of its types (agreed: any mix).
    const team = !e.provides && !e.windless && TEAM_ENERGY[lookupCard(cards, e.defId).name];
    if (team) return [team, team];
    // Dark Metal Energy: 1 Energy, Darkness or Metal.
    if (!e.provides && !e.windless && lookupCard(cards, e.defId).name === 'Dark Metal Energy') return ['crystal:darkness,metal' as CrystalEnergy];
    return Array<PoolEnergy>(amount).fill(isCrystalEnergy(cards, e) ? crystalProvides(pokemon, cards) : type);
  });
  if (pokemon.effects?.energyBurn !== undefined) return pool.map(() => 'fire');
  // Dark Aura: all of it is Darkness Energy.
  const as = powerEffect(effectId(pokemon))?.energyAs;
  if (as && pokemon.powerOffUntil === undefined) return pool.map(() => as);
  // Wild Growth: each basic Grass Energy card attached provides 2 Grass Energy.
  if (pokemon.wildGrowth) pool.push(...pokemon.energy.filter((e) => !e.provides && isBasicGrass(cards, e)).map((): PoolEnergy => 'grass'));
  return powerEffect(effectId(pokemon))?.photosynthesis && pokemon.powerOffUntil === undefined ? pool.map(() => 'grass') : pool;
};

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
  betweenTurns(state);
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
    const burn = fiery ? 40 : 20;
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
 * Berry and Oran Berry (2 damage counters), Gold Berry (4), Miracle Berry (Asleep, Confused, Paralyzed or Poisoned) and Lum
 * Berry (any Special Condition): between turns,
 * if the Pokémon has that much damage (or one of those), it's removed and the Berry is discarded.
 */
function useBerry(state: GameState, owner: PlayerState, p: InPlayPokemon) {
  const name = toolOf(state.cards, p)?.name;
  // Oran Berry (EX Ruby & Sapphire) works as Berry.
  const amount = name === 'Berry' || name === 'Oran Berry' ? 20 : name === 'Gold Berry' ? 40 : 0;
  // Healing Berry: 20 HP or less left, 3 damage counters off.
  if (name === 'Healing Berry' && p.damage >= 10 && inPlayDef(state.cards, p).hp - p.damage <= 20) {
    const healed = Math.min(30, p.damage);
    p.damage -= healed;
    addLog(state, `Healing Berry: ${pokemonName(state, p)} healed ${healed} damage.`, owner.id);
  } else if (amount && p.damage >= amount) {
    p.damage -= amount;
    addLog(state, `${name}: ${pokemonName(state, p)} healed ${amount} damage.`, owner.id);
  } else if (name === 'Miracle Berry' && (p.condition || p.poison)) {
    p.condition = null;
    p.poison = 0;
    delete p.paralyzedTurn;
    addLog(state, `Miracle Berry: ${pokemonName(state, p)} is no longer Asleep, Confused, Paralyzed or Poisoned.`, owner.id);
  } else if (name === 'Lum Berry' && hasSpecialCondition(p)) {
    // Lum Berry: every Special Condition, Burned included.
    p.condition = null;
    p.poison = 0;
    p.burned = false;
    delete p.paralyzedTurn;
    addLog(state, `Lum Berry: ${pokemonName(state, p)} is no longer affected by Special Conditions.`, owner.id);
  } else return;
  discardTool(state, owner, p);
}

/**
 * A Special Condition or Poison on `owner`'s Active Pokémon outside an attack (Aqua Trance, or a power: Black Beam, Fire
 * Breath), unless it can't be affected.
 */
export function afflictBetweenTurns(state: GameState, owner: PlayerId, pokemon: InPlayPokemon, affliction: 'asleep' | 'poisoned' | 'confused' | 'paralyzed' | 'burned') {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  const effect = powerActive(pokemon, state.cards, sides) ? powerEffect(effectId(pokemon)) : undefined;
  const name = pokemonName(state, pokemon);
  const label = affliction === 'poisoned' ? 'Poisoned' : affliction === 'burned' ? 'Burned' : conditionLabel(affliction);
  if (conditionProof(inPlayDef(state.cards, pokemon)) || conditionFree(pokemon, state.cards, effect) || (affliction === 'poisoned' && effect?.noPoison) || (affliction === 'asleep' && effect?.noSleep)) {
    return addLog(state, `${name} can't be ${label}.`, owner);
  }
  const guard = state.rules?.find((r) => r.kind === 'conditionGuard' && r.player === owner && r.conditions.includes(affliction));
  if (guard) return addLog(state, `${guard.label ?? 'A battle rule'} protected ${name} from that.`, owner);
  if (affliction === 'poisoned') pokemon.poison = Math.max(pokemon.poison ?? 0, 10);
  else if (affliction === 'burned') pokemon.burned = true;
  else {
    pokemon.condition = affliction;
    delete pokemon.paralyzedTurn;
    if (affliction === 'paralyzed') pokemon.paralyzedTurn = state.turn;
  }
  addLog(state, `${name} is now ${label}.`, owner);
}

function expireEffects(pokemon: InPlayPokemon, turn: number) {
  const e = pokemon.effects;
  if (!e) return;
  for (const key of ['preventDamage', 'preventAll', 'harden', 'destinyBond', 'sandAttack', 'smokescreen', 'minimize', 'noRetreat', 'swordsDance', 'energyBurn', 'lightScreen', 'mirrorShell', 'noAttack', 'noEnergy', 'fireWall', 'focusEnergy', 'crosscounter', 'screech', 'endure', 'pollenShield', 'counter', 'secretePoison', 'slime', 'pursuit', 'lockOn', 'triggeredPoison', 'effectProof', 'pulseGuard', 'dodge', 'reflectShield', 'armorUp', 'noEvolve', 'heavier', 'tailwind', 'noPokePowers', 'conditionProof', 'stockpile', 'silverWind', 'cometPunch'] as const) {
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
 * opponent has no Pokémon left in play. If both win at once, `favoured` wins.
 */
function resolveKnockouts(state: GameState, favoured: PlayerId): PlayerId | null {
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
      delete p.timeTravel;
      if (p.damage < inPlayDef(state.cards, p).hp) continue;
      const cards = [...p.evolvedFrom, p.card, ...p.energy.map(asDiscarded), ...(p.attached ?? []).map((a) => a.card)];
      [owner.deck, state.rngState] = shuffle([...owner.deck, ...cards], state.rngState);
      if (owner.active === p) owner.active = null;
      else owner.bench = owner.bench.map((q) => (q === p ? null : q));
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
      const reborn = !!powerEffect(pokemon.card.defId)?.rebirth && powerActive(pokemon, state.cards, sides) && !discardsLocked(sides, state.cards);
      owner.discard.push(...pokemon.evolvedFrom, pokemon.card, ...pokemon.energy.map(asDiscarded), ...(pokemon.attached ?? []).map((a) => a.card));
      if (reborn) {
        owner.discard = owner.discard.filter((c) => c !== pokemon.card);
        owner.hand.push(pokemon.card);
        addLog(state, `Rebirth: ${pokemonName(state, pokemon)} returned to the hand.`, id);
      }
      // A Trainer played as a Pokémon (Clefairy Doll) doesn't count as a Knocked Out Pokémon: no prize.
      const def = lookupCard(state.cards, pokemon.card.defId);
      if (def.kind === 'pokemon' && def.trainerText) return;
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

export const hasBenched = (player: Pick<PlayerState, 'bench'>) => player.bench.some((p) => p !== null);

function newInPlay(card: CardInstance, turn: number): InPlayPokemon {
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
      if (growing && inPlayDef(state.cards, p).type === 'grass') p.wildGrowth = true;
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
      // EX Team Rocket Returns' Rocket's Hideout: Pokémon with Rocket's in their names too.
      const rockets = !!state.stadium && (lookupCard(state.cards, state.stadium.card.defId) as { text?: string }).text?.includes("Rocket's in its name");
      if (stadium === "Rocket's Hideout" && (/\bDark\b/.test(lookupCard(state.cards, p.card.defId).name) || (rockets && lookupCard(state.cards, p.card.defId).name.startsWith("Rocket's ")))) p.hideout = true;
      else delete p.hideout;
      const d = inPlayDef(state.cards, p);
      if (stadium === 'Low Pressure System' && (hasType(d, 'grass') || hasType(d, 'lightning'))) p.lowPressure = true;
      else delete p.lowPressure;
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

/** Boost Energy and Double Rainbow Energy are discarded from a Pokémon that's no longer an Evolved Pokémon (devolved). */
function dropBoostEnergy(state: GameState) {
  for (const player of Object.values(state.players)) {
    for (const p of [player.active, ...player.bench]) {
      const boost = p && !p.evolvedFrom.length ? p.energy.filter((e) => !e.provides && ['Boost Energy', 'Double Rainbow Energy'].includes(lookupCard(state.cards, e.defId).name)) : [];
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
