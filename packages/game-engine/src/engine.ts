/// <reference path="./globals.d.ts" />
import { attackSituation, checkAttack, performAttack, recallsAttacks, usableAttacks, type AttackChoices } from './attacks.js';
import { discardsLocked, energyFromHand, evolutionBlocked, guardedBy, offerChainReaction, playedFromHand, powerActive, refreshTransforms, retreatAid, stickyGoo, trainersBlocked, usePower, type PowerChoices } from './powers.js';
import { evolvesFromEevee, playTrainer, resolvePending, stadiumError, trainersLocked, TRAINERS_LOCKED, type PendingChoice, type TrainerChoices } from './trainers.js';
import { energyEffect, powerEffect, trainerEffect } from './effects/index.js';
import { isBasicEnergy, isBasicPokemon, isBenchable, isTrainerCard, lookupCard, type Attack, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { addLog, baseUid, clearOnLeavingActive, effectId, evolvedHook, shapeshiftCard, flipCoin, inPlayDef, openBenchSlot, pokemonName, revealFaceDown, type LogEntry } from './status.js';
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
   * top card is `by` works (refreshConverted).
   */
  converted?: { type: EnergyType; by: string };
}

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
  /** If an attack would Knock it Out, it's left with 10 HP instead, through this turn (Endure). */
  endure?: number;
  /** It can't become Asleep, Confused, Paralyzed or Poisoned, through this turn (Pollen Shield). */
  pollenShield?: number;
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
  /** The turn it was attacked with Night Eyes (Perish Song); benching or evolving it ends this. */
  nightEyes?: number;
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
  /** Submerge: the turn it's a Water Pokémon (inPlayDef), until it's Asleep, Confused or Paralyzed (refreshSubmerge). */
  submerged?: number;
  /** Rocket's Hideout is the Stadium in play and it has Dark in its name: 20 more HP (refreshHideout, inPlayDef). */
  hideout?: boolean;
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
    if (state.pendingChoice) return ok(state);
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
      const hayFever = isTrainerCard(card(played)) && trainersBlocked([me, opp], state.cards);
      if (hayFever) return fail(hayFever);
      me.bench[action.slot] = newInPlay(played, state.turn);
      addLog(state, `Put ${card(played).name} on the Bench.`, me.id);
      // Rocket's Minefield Gym: tails puts 2 damage counters on it (agreed: the printed card leaves out the number), which can Knock it Out.
      if (state.stadium && card(state.stadium.card).name === "Rocket's Minefield Gym" && !flipCoin(state, "Rocket's Minefield Gym", me.id)) {
        me.bench[action.slot]!.damage += 20;
        addLog(state, `Rocket's Minefield Gym put 2 damage counters on ${card(played).name}.`, me.id);
      }
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
      target.energy.push(energy);
      state.energyAttachedThisTurn = true;
      addLog(state, `Attached ${card(energy).name} to ${pokemonName(state, target)}.`, me.id);
      energyEffect(energy.defId)?.onAttach?.(state, me, target);
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
      me.discard.push(...me.active.energy.filter((e) => uids.has(e.uid)));
      me.active.energy = me.active.energy.filter((e) => !uids.has(e.uid));
      state.retreatedThisTurn = true;
      // Balloon Berry is discarded instead of Energy cards (its retreat cost is 0).
      if (toolOf(state.cards, me.active)?.name === 'Balloon Berry') {
        discardTool(state, me, me.active);
        addLog(state, `Discarded Balloon Berry from ${pokemonName(state, me.active)}.`, me.id);
      }
      // Pursuit: trying to retreat does 10 damage to it (no Weakness or Resistance), even if Confusion then stops it.
      if (me.active.effects?.pursuit !== undefined) {
        me.active.damage += 10;
        addLog(state, `Pursuit did 10 damage to ${pokemonName(state, me.active)}.`, me.id);
      }
      // 1999 rules: a Confused Pokémon needs heads to retreat; the energy is discarded either way.
      if (me.active.condition === 'confused') {
        const heads = flipCoin(state, `${pokemonName(state, me.active)} is Confused`, me.id);
        if (!heads) {
          addLog(state, `${pokemonName(state, me.active)} couldn't retreat.`, me.id);
          return afterOwnMove(state, me, opp);
        }
      }
      addLog(state, `${pokemonName(state, me.active)} retreated for ${pokemonName(state, benched)}.`, me.id);
      // Damage stays with each Pokémon; the retreated one takes the chosen slot.
      const retreated = me.active;
      clearOnLeavingActive(retreated);
      me.bench[action.slot] = retreated;
      me.active = benched;
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
  const usable = usableAttacks(me.active!, state.cards, { recall: recallsAttacks(state, me), bench: me.bench, defender: opp.active })[attackIndex];
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

/** Shapeshift: Brock's Ninetales loses its Evolution card as soon as it's Asleep, Confused or Paralyzed. */
function dropShapeshifts(state: GameState) {
  for (const player of Object.values(state.players)) {
    for (const p of [player.active, ...player.bench]) if (p && shapeshiftCard(p) && p.condition) discardShapeshift(state, player, p);
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
  const evolvesFromStage = evolution.stage === 'stage2' ? 'stage1' : 'basic';
  if (current.kind !== 'pokemon' || current.name !== evolution.evolvesFrom || current.stage !== evolvesFromStage) {
    return `${evolution.name} evolves from ${evolution.evolvesFrom ?? 'nothing'}`;
  }
  // Giovanni: no first-turn or played-this-turn limit for the Pokémon chosen, this turn.
  if (target.giovanniTurn === turn) return null;
  // Turns 1 and 2 are each player's first turn.
  if (turn <= 2) return "You can't evolve on your first turn";
  if (target.playedTurn === turn) return `${current.name} was played or evolved this turn`;
  return null;
}

/**
 * Energy the Pokémon must discard to retreat. `sides` (its owner first) are for powers that change it:
 * each working Retreat Aid on the owner's Bench takes 1 off the Active Pokémon's cost, and the opponent's working
 * Sticky Goo adds 2. The Stadium in play can change it too (The Rocket's Training Gym, Cerulean City Gym).
 */
export const retreatCost = (pokemon: InPlayPokemon, cards: CardLibrary, sides: Pick<PlayerState, 'active' | 'bench'>[] = [], stadium?: CardInstance | null) =>
  // Balloon Berry: it's discarded instead of Energy cards (RETREAT).
  toolOf(cards, pokemon)?.name === 'Balloon Berry' ? 0 : Math.max(
    0,
    (inPlayDef(cards, pokemon).retreatCost ?? 0) -
      retreatAid(pokemon, cards, sides) +
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
  if (heldActive(active, sides)) return `${def.name} can't retreat while ${lookupCard(cards, heldActive(active, sides)!.card.defId).name} is the Active Pokémon`;
  const guard = guardedBy(sides, cards);
  if (guard) return `${guard}: ${def.name} can't retreat`;
  if (active.condition === 'asleep' || active.condition === 'paralyzed') {
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

/** One energy a Pokémon has: a type, or 'any' for Rainbow Energy, which counts as every type. */
export type PoolEnergy = EnergyType | 'any';

/** Whether energy in a pool counts as  (Rainbow Energy counts as every type). */
export const counts = (energy: PoolEnergy, type: EnergyType) => energy === type || energy === 'any';

/** The type and amount of energy an attached card provides: 1 of its type for basic Energy, or what a power made it (Buzzap). */
export function energyProvided(card: CardInstance, cards: CardLibrary): { type: PoolEnergy; amount: number } {
  if (card.provides) return card.provides;
  // Energy Converter: a basic Energy card treated as another type.
  if (card.converted) return { type: card.converted.type, amount: 1 };
  const def = lookupCard(cards, card.defId);
  if (def.kind !== 'energy') return { type: 'colorless', amount: 1 };
  return { type: def.anyType ? 'any' : def.energyType, amount: def.amount ?? 1 };
}

/**
 * Whether an attached card is a `type` Energy card: a basic one of that type, or Rainbow Energy (every type while in
 * play). Not Double Colorless, nor a Pokémon attached as Energy (Buzzap).
 */
export function isEnergyCardOf(card: CardInstance, cards: CardLibrary, type: EnergyType): boolean {
  if (card.provides) return false;
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
    const { type, amount } = energyProvided(e, cards);
    return Array<PoolEnergy>(amount).fill(type);
  });
  if (pokemon.effects?.energyBurn !== undefined) return pool.map(() => 'fire');
  // Wild Growth: each basic Grass Energy card attached provides 2 Grass Energy.
  if (pokemon.wildGrowth) pool.push(...pokemon.energy.filter((e) => !e.provides && isBasicGrass(cards, e)).map((): PoolEnergy => 'grass'));
  return powerEffect(effectId(pokemon))?.photosynthesis && pokemon.powerOffUntil === undefined ? pool.map(() => 'grass') : pool;
};

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
  for (const _ of unpaid) {
    const i = left.indexOf('any');
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
  return winner ? finish(state, winner) : promoteOrBeginTurn(state);
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
  for (const { id, active, name } of actives) {
    if (!active.burned) continue;
    active.damage += 20;
    if (active.effects) delete active.effects.shadowImages;
    addLog(state, `${name} takes 20 Burn damage.`, id);
    if (flipCoin(state, `${name} is Burned`, id)) {
      active.burned = false;
      addLog(state, `${name} is no longer Burned.`, id);
    }
  }
  // Darkness Energy: 1 damage counter for each on a Pokémon that isn't Darkness and doesn't have Dark in its name.
  for (const id of state.playerOrder) {
    const player = state.players[id]!;
    for (const p of [player.active, ...player.bench]) {
      if (!p) continue;
      const d = inPlayDef(state.cards, p);
      const dark = p.energy.filter((e) => !e.provides && lookupCard(state.cards, e.defId).name === 'Darkness Energy').length;
      if (!dark || d.type === 'darkness' || d.name.includes('Dark')) continue;
      p.damage += 10 * dark;
      addLog(state, `Darkness Energy: ${dark === 1 ? 'a damage counter' : `${dark} damage counters`} on ${pokemonName(state, p)}.`, id);
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
  for (const { id, active, name } of actives) {
    if (active.condition === 'asleep' && flipCoin(state, `${name} is Asleep`, id)) {
      active.condition = null;
      addLog(state, `${name} woke up.`, id);
    }
  }
  for (const { id, active, name } of actives) {
    // Paralysis wears off at the end of its owner's next turn.
    if (active.condition === 'paralyzed' && id === state.currentPlayer && (active.paralyzedTurn ?? 0) < state.turn) {
      active.condition = null;
      addLog(state, `${name} is no longer Paralyzed.`, id);
    }
  }
  // Berries (Pokémon Tools): used by themselves as soon as they can be, between turns (agreed).
  for (const id of state.playerOrder) {
    const player = state.players[id]!;
    for (const p of [player.active, ...player.bench]) if (p) useBerry(state, player, p);
  }
  for (const id of state.playerOrder) {
    const player = state.players[id]!;
    if (player.powersOffUntil !== undefined && player.powersOffUntil <= state.turn) {
      delete player.powersOffUntil;
      if (id === state.currentPlayer) addLog(state, 'Pokémon Powers work again.');
    }
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
 * Berry (2 damage counters), Gold Berry (4) and Miracle Berry (Asleep, Confused, Paralyzed or Poisoned): between turns,
 * if the Pokémon has that much damage (or one of those), it's removed and the Berry is discarded.
 */
function useBerry(state: GameState, owner: PlayerState, p: InPlayPokemon) {
  const name = toolOf(state.cards, p)?.name;
  const amount = name === 'Berry' ? 20 : name === 'Gold Berry' ? 40 : 0;
  if (amount && p.damage >= amount) {
    p.damage -= amount;
    addLog(state, `${name}: ${pokemonName(state, p)} healed ${amount} damage.`, owner.id);
  } else if (name === 'Miracle Berry' && (p.condition || p.poison)) {
    p.condition = null;
    p.poison = 0;
    delete p.paralyzedTurn;
    addLog(state, `Miracle Berry: ${pokemonName(state, p)} is no longer Asleep, Confused, Paralyzed or Poisoned.`, owner.id);
  } else return;
  discardTool(state, owner, p);
}

function expireEffects(pokemon: InPlayPokemon, turn: number) {
  const e = pokemon.effects;
  if (!e) return;
  for (const key of ['preventDamage', 'preventAll', 'harden', 'destinyBond', 'sandAttack', 'smokescreen', 'minimize', 'noRetreat', 'swordsDance', 'energyBurn', 'lightScreen', 'mirrorShell', 'noAttack', 'noEnergy', 'fireWall', 'focusEnergy', 'crosscounter', 'screech', 'endure', 'pollenShield', 'counter', 'secretePoison', 'slime', 'pursuit', 'lockOn', 'triggeredPoison'] as const) {
    if (e[key] !== undefined && e[key] <= turn) delete e[key];
  }
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
      const prize = taker.prizes.pop();
      if (prize) taker.hand.push(prize);
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
const asDiscarded = ({ provides: _, ...card }: CardInstance): CardInstance => card;

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
  const watch = attached.filter((e) => !e.provides && lookupCard(state.cards, e.defId).name === 'Recycle Energy').map((e) => e.uid);
  if (watch.length) state.recycleWatch = watch;
  else delete state.recycleWatch;
}

function finish(state: GameState, winner: PlayerId): ActionResult {
  state.phase = 'finished';
  state.winner = winner;
  state.pendingPromotion = null;
  return ok(state);
}

/** Rocket's Hideout: while it's the Stadium in play, each Pokémon with Dark in its name has 20 more HP (`hideout`, inPlayDef). */
function refreshHideout(state: GameState) {
  const hideout = !!state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === "Rocket's Hideout";
  for (const player of Object.values(state.players)) {
    for (const p of [player.active, ...player.bench]) {
      if (!p) continue;
      if (hideout && /\bDark\b/.test(lookupCard(state.cards, p.card.defId).name)) p.hideout = true;
      else delete p.hideout;
    }
  }
}

/**
 * Energy Converter's Energy goes back to its own type once the Porygon2 that converted it is gone or Asleep, Confused or
 * Paralyzed; Submerge ends once Lanturn is. (Both end with the turn: betweenTurns.)
 */
function refreshConverted(state: GameState) {
  const inPlay = Object.values(state.players).flatMap((player) => [player.active, ...player.bench]).filter((p): p is InPlayPokemon => !!p);
  for (const p of inPlay) {
    if (p.submerged !== undefined && p.condition) delete p.submerged;
    for (const e of p.energy) {
      if (!e.converted) continue;
      const porygon = inPlay.find((q) => q.card.uid === e.converted!.by);
      if (!porygon || porygon.condition) delete e.converted;
    }
  }
}

function ok(state: GameState): ActionResult {
  refreshTransforms(state);
  refreshWildGrowth(state);
  refreshHideout(state);
  refreshConverted(state);
  returnRecycleEnergy(state);
  dropShapeshifts(state);
  state.version += 1;
  return { ok: true, state };
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}
