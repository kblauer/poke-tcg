// Trainer cards: legality, the questions a Trainer asks, and the context Trainer effects run with.
// Card-specific behaviour lives in effects/ (TRAINERS). Searches of hidden cards (the deck) can't
// be answered from a player's view, so those Trainers leave a PendingChoice that only the player
// sees the options of, answered with RESOLVE_CHOICE.
import { applyWeaknessResistance, damageChosenBenched, typeName, usableAttacks, type AttackChoices } from './attacks.js';
import { isBasicEnergy, isBasicPokemon, isPokemonCard, isTrainerCard, lookupCard, type CardLibrary, type CardDef, type EnergyType, type PokemonCardDef } from './cards.js';
import { powerEffect, trainerEffect } from './effects/index.js';
import { activeLocked, discardTheirEnergy, type CardInstance, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from './engine.js';
import { shuffle } from './rng.js';
import { offerChainReaction, powerActive, trainersBlocked } from './powers.js';
import { addLog, benchRoom, clearOnLeavingActive, effectId, evolvedHook, flipCoin, inPlayDef, openBenchSlot, shapeshiftCard } from './status.js';

/** Answers to a Trainer's questions. Each question names the field it fills. */
export interface TrainerChoices {
  /** Other cards from your hand (to discard, shuffle away or trade). */
  handUids?: string[];
  /** Cards from a discard pile (yours, or the opponent's for Pokémon Flute). */
  discardUids?: string[];
  /** One of your Pokémon. */
  target?: Target;
  /** Another of your Pokémon (Sabrina: the one the Energy goes to). */
  target2?: Target;
  /** One of the opponent's Pokémon. */
  oppTarget?: Target;
  /** Energy attached to `target`. */
  energyUids?: string[];
  /** Energy attached to `oppTarget`. */
  oppEnergyUids?: string[];
  /** Stage of Evolution (Devolution Spray: discard that stage and higher). */
  stage?: 'stage1' | 'stage2';
  /** One of a list of labelled options (Card-Flip Game: which of the opponent's Prize cards). */
  pick?: number;
  /** Another labelled choice (Card-Flip Game: Energy, Trainer or Pokémon). */
  guess?: number;
}

/** A question a Trainer asks before it's played. */
export type TrainerChoiceSpec = { prompt: string } & (
  | { kind: 'cards'; field: 'handUids' | 'discardUids' | 'energyUids' | 'oppEnergyUids'; min: number; max: number; options: CardInstance[] }
  | { kind: 'pokemon'; field: 'target' | 'target2' | 'oppTarget'; side: 'own' | 'opp'; options: Target[] }
  | { kind: 'stage'; field: 'stage'; options: ('stage1' | 'stage2')[] }
  /** One of the labelled options, answered with its number (`options`, with `labels` beside them). */
  | { kind: 'pick'; field: 'pick' | 'guess'; options: number[]; labels: string[] }
);

type Side = Pick<PlayerState, 'active' | 'bench' | 'discard'>;

/** What a Trainer can see before it's played. View-safe: the UI builds it from a PlayerView. */
export interface TrainerSituation {
  /** The Trainer card being played. */
  card: CardInstance;
  me: Side & Pick<PlayerState, 'hand' | 'noTrainersUntil'>;
  opp: Side;
  deckCount: number;
  cards: CardLibrary;
  turn: number;
  /** The Stadium card in play, if any. */
  stadium: CardInstance | null;
  /** Which of the opponent's Prize cards are face down, by index (Card-Flip Game). */
  oppFaceDownPrizes: number[];
}

/** Which of the player's Prize cards are face down, by index, from the state or a view (Card-Flip Game). */
export const faceDownPrizes = (count: number, faceUp?: (CardInstance | null)[] | ((i: number) => boolean)) =>
  Array.from({ length: count }, (_, i) => i).filter((i) => !(typeof faceUp === 'function' ? faceUp(i) : faceUp?.[i]));

/** An Energy card Growth may attach from the hand: a basic `type` one, or any Energy card without a type (Sunkern's Growth). */
const attachableFromHand = (cards: CardLibrary, c: CardInstance, type?: EnergyType) => (type ? isBasicEnergyOf(cards, c, type) : lookupCard(cards, c.defId).kind === 'energy');

/** A search the player must finish after playing a Trainer or using an attack. Only they see its options. */
export type PendingChoice = {
  player: PlayerId;
  /** Trainer or attack that started it. */
  source: string;
  /** Started by an attack: the turn ends once it's finished. */
  afterAttack?: boolean;
} & (
  | {
      kind: 'pickFromDeck';
      /**
       * 'basicNamed': a Basic Pokémon called `name` (or any of the names), for Call for Family;
       * 'basicType': a Basic Pokémon of `type` (Call for Friend); 'energyType': a basic Energy card of
       * `type` (Recharge); 'baby': a Baby Pokémon (Let's Play!); 'basic': any Basic Pokémon (Summon Minions);
       * 'evolution': an Evolution card (Evolutionary Light); 'darkEvolution': one with Dark in its name (The Boss's Way).
       */
      filter: 'any' | 'pokemon' | 'basicNamed' | 'basicType' | 'basicEnergy' | 'energyType' | 'baby' | 'basic' | 'evolution' | 'darkEvolution' | 'named' | 'ownerBasic' | 'ownerPokemon' | 'trainer' | 'trainerNamed' | 'pokemonNotNamed' | 'evolvesFrom';
      /**
       * 'basicNamed' and 'named' (a Pokémon card with one of the names: Jellyfish Pod): the names. 'ownerBasic' (Call for
       * Friend) and 'ownerPokemon' (Brock's Training Method): the owner in the card's name, e.g. 'Brock'. 'evolvesFrom'
       * (Omanyte's Fossil): what the card evolves from.
       */
      name?: string | string[];
      type?: EnergyType;
      /** The card goes onto the Bench instead of into the hand (Call for Family). */
      toBench?: boolean;
      /** The card found is attached to one of the player's Pokémon, chosen next (Energy Spike), instead of going to the hand. */
      attach?: boolean;
      /** The card found is attached to the player's Active Pokémon, the attacker (Recharge), instead of going to the hand. */
      attachToActive?: boolean;
      /** The card found is attached to this Pokémon of the player's (Fire Boost), instead of going to the hand. */
      attachTo?: Target;
      /** The card taken is shown to the opponent (Poké Ball): the log names it. */
      reveal?: boolean;
      /** Pokémon Trader: the hand card that goes into the deck once a card is picked. */
      tradeUid?: string;
      /** "Up to": the player may take nothing (Summon Minions). */
      optional?: boolean;
      /** How many cards in all (Summon Minions: up to 2): the search repeats while there are more to take. Missing = 1. */
      count?: number;
      /** Challenge!: once this player is done, this player searches the same way. */
      then?: PlayerId;
      /** Erika's Maids: these cards go from the hand into the deck once the search is over, whatever it found. */
      tradeAway?: string[];
    }
  | {
      /**
       * Look at the top cards of the deck (`looked`, by uid) and put `take` of them into the hand; the rest are discarded
       * (Misty's Wrath), or with `master` (Master Ball) only a Basic Pokémon or Evolution card may be taken, if any, and the
       * rest are shuffled back.
       */
      kind: 'pickFromTop';
      looked: string[];
      take: number;
      master?: boolean;
      /** As `master`, but a Trainer card may be taken (PokéGear), shown to the opponent. */
      trainer?: boolean;
    }
  | {
      /** Put any number of the Basic Pokémon cards in the opponent's hand onto their Bench, one at a time (Erika's Perfume). */
      kind: 'oppHandBasics';
    }
  | {
      /**
       * The opponent of the player who played it picks one (Lt. Surge's Treaty): both players take 1 of their Prizes
       * into their hand (0), or the player who played it draws a card (1).
       */
      kind: 'treaty';
    }
  | {
      /** Return any number of the player's Pokémon in play, and the cards attached, to their hand, one at a time (Fairy Power). */
      kind: 'returnOwn';
    }
  | {
      /** Look at the opponent's hand (Secret Mission); then discard any number of cards from the hand and draw as many (discardDraw). */
      kind: 'secretMission';
    }
  | {
      /** Discard cards from the hand one at a time, then draw as many as were discarded (`discarded` so far). */
      kind: 'discardDraw';
      discarded: number;
    }
  | {
      /**
       * Sleight of Hand: put up to 3 cards from the hand on top of the deck, one at a time (`moved` so far), then search
       * the deck for as many basic Energy cards.
       */
      kind: 'sleightOfHand';
      moved: number;
    }
  | {
      /** Bench Guard: move 10 of the damage done to the benched Pokémon in `target` to the Brock's Rhydon in `guard` (count 0), or not (1). */
      kind: 'benchGuard';
      target: number;
      guard: number;
    }
  | {
      /**
       * Flee, asked of the Defending player before the opponent's attack (`attackIndex`, `choices`): the benched Pokémon
       * Misty's Tentacruel switches with if the attack damages it (target), or none.
       */
      kind: 'flee';
      attackIndex: number;
      choices: AttackChoices;
    }
  | {
      /** Koga's Ninja Trick, asked like Flee: the benched Pokémon to switch in before the attack, or none. */
      kind: 'ninjaTrick';
      attackIndex: number;
      choices: AttackChoices;
    }
  | {
      /** Chaos Gym, on the other player's tails: the player may play the card in `GameState.borrowed`, or not (count 0). */
      kind: 'borrowedTrainer';
    }
  | {
      /** Attach up to `count` `type` Energy cards (any Energy cards, without `type`) from the hand to the player's Active Pokémon, one at a time (Growth). */
      kind: 'attachFromHand';
      type?: EnergyType;
      count: number;
    }
  | {
      /** Super Removal: discard 1 Energy card from each of these of the opponent's Pokémon, one at a time. */
      kind: 'removeEach';
      targets: Target[];
    }
  | {
      /** Energy Drain: discard 1 Energy card from the opponent's Active Pokémon, the attacker. */
      kind: 'drainEnergy';
    }
  | {
      /** Lunar Power: a card from the deck that evolves from one of the player's benched Pokémon, then (`card`) which one. */
      kind: 'lunarPower';
      card?: CardInstance;
    }
  | {
      /** Soak Up's second Grass Energy card: click another of the player's Pokémon to take one from, or be done. */
      kind: 'soakUp';
      to: Target;
    }
  | {
      /**
       * Misty's Wish: the player looks at a Prize card (`prize` unset: they pick which), the opponent says whether they may
       * switch it with a hand card (`asked`), and they pick the hand card (`swap`).
       */
      kind: 'mistysWish';
      prize?: number;
      step: 'prize' | 'ask' | 'swap';
    }
  | {
      /** Blaine's Quiz #2 and #3: the opponent of the player who played it guesses about `card` among `labels`; right gets `draw` cards. */
      kind: 'guess';
      card: CardInstance;
      labels: string[];
      answer: number;
      draw: number;
    }
  | {
      /** Fuchsia City Gym: the player may shuffle 1 of their Pokémon with Koga in its name into their deck. */
      kind: 'fuchsia';
    }
  | {
      /** Saffron City Gym: which Pokémon with Sabrina in its name to return a basic Energy card from. */
      kind: 'saffron';
    }
  | {
      /** Sabrina's Psychic Control: a Trainer card from the opponent's discard pile to use as if it were in the hand. */
      kind: 'psychicControl';
    }
  | {
      /** Look at the opponent's hand, then carry on (Psyscan). */
      kind: 'lookOppHand';
    }
  | {
      /** Look at the top `count` cards of the opponent's deck and put them back in the same order (Observe). */
      kind: 'lookOppDeck';
      count: number;
    }
  | {
      /**
       * Unown E's Engage: the player may shuffle their hand into their deck and draw 4 (count 0) or not (count 1). The
       * opponent of the Unown's owner is asked first (`then`: the owner, asked next).
       */
      kind: 'engage';
      then?: PlayerId;
    }
  | {
      /** Sabrina's ESP: keep the attack's coin flips (count 0), or attack again from `before` with new ones (count 1). */
      kind: 'reflip';
      before: GameState;
      attackIndex: number;
      choices: AttackChoices;
      flee?: number;
    }
  | {
      /** Narrow Gym: return 1 of the player's 5 benched Pokémon, and its cards, to their hand. */
      kind: 'narrowGym';
    }
  | {
      /** Blaine's Quiz #1: the opponent of the player who played it guesses `card`'s length among `lengths` (count = index); `answer` is right. */
      kind: 'quiz';
      card: CardInstance;
      lengths: string[];
      answer: number;
    }
  | {
      /** Challenge!: the opponent of the player who played it accepts (RESOLVE_CHOICE count 1) or declines (count 0). */
      kind: 'challenge';
    }
  | {
      /**
       * Mind Games: the opponent played the Trainer card `cardUid` (with `choices`); the player may flip (count 0), once
       * for each of their Pokémon with it working (`flips`), until one is heads, or let it be played (count 1).
       */
      kind: 'mindGames';
      cardUid: string;
      choices: TrainerChoices;
      flips: number;
    }
  | {
      /** A Pokémon Power the player "may flip" for, as it's played from the hand (Herbal Scent, Fire Boost): flip (count 0) or not (count 1). */
      kind: 'mayFlip';
      power: 'herbalScent' | 'fireBoost';
      /** The Pokémon whose power it is. */
      target: Target;
    }
  | {
      /** Look at the opponent's hand and choose a Trainer card in it, which they shuffle into their deck (Rocket's Sneak Attack). */
      kind: 'oppHandTrainer';
    }
  | {
      kind: 'arrangeTop';
      count: number;
      /** Whose deck it is (Prophecy can pick either). Missing = the player's own. */
      deckOwner?: PlayerId;
    }
  | {
      /** Put a card from the player's discard pile on top of their deck (Recycle). */
      kind: 'pickFromDiscard';
      /** The card that started it, still being played: not an option. */
      excludeUid?: string;
    }
  | {
      /** Put up to `count` Pokémon cards from the player's discard pile into their hand, one at a time (Reel In). */
      kind: 'discardToHand';
      count: number;
      /** Only Basic Pokémon cards, or only Evolution cards (Super Rod). */
      filter?: 'basic' | 'evolution';
    }
  | {
      /** Shuffle `count` cards from the player's hand into their deck, one at a time, then shuffle (Mary). */
      kind: 'shuffleFromHand';
      count: number;
    }
  | {
      /**
       * Time Capsule: shuffle up to `count` Basic Pokémon, Evolution and basic Energy cards from the discard pile into the
       * deck, one at a time (or stop); then (`then`) the other player does the same.
       */
      kind: 'timeCapsule';
      count: number;
      then?: PlayerId;
    }
  | {
      /**
       * Double Gust: the player chooses which of the opponent's benched Pokémon is switched with the opponent's Active
       * Pokémon; then the opponent's chosen `oppSlot` (the player's benched Pokémon) is switched with the player's.
       */
      kind: 'doubleGust';
      oppSlot?: number;
    }
  | {
      /**
       * A power's damage to one of the opponent's Pokémon the player may pick (Sneak Attack): `amount`, with Weakness
       * and Resistance as if from a Pokémon of `type`.
       */
      kind: 'powerDamage';
      amount: number;
      type: EnergyType;
    }
  | {
      /** Remove 1 damage counter from one of the player's Pokémon with damage (Heal), chosen on the board. */
      kind: 'removeDamage';
    }
  | {
      /** Attach `card`, found in the deck, to one of the player's Pokémon, chosen on the board (Energy Spike). */
      kind: 'attachCard';
      card: CardInstance;
    }
  | {
      /** Put a card from the player's hand on top of their deck (Special Delivery). */
      kind: 'handToDeck';
    }
  | {
      /**
       * Switch one of the player's benched Pokémon, chosen on the board, with their Active Pokémon. Asked of the
       * Defending player after the opponent's Whirlwind, Ram, Terror Strike, Rapid Spin or Fling.
       */
      kind: 'switchIn';
    }
  | {
      /** One of the player's benched Pokémon, chosen on the board, takes `amount` damage from the opponent's attack (Cat Punch). */
      kind: 'benchDamage';
      amount: number;
    }
  | {
      /**
       * Discard `count` (1 if missing) of the Energy cards attached to the player's Pokémon at `target`, one at a time (Pure
       * Body, Continuous Fireball). `cure` (Celadon City Gym): then it's no longer Asleep, Confused, Paralyzed or Poisoned.
       * `toHand` (Saffron City Gym): a basic Energy card, returned to the hand instead.
       */
      kind: 'discardAttached';
      target: Target;
      count?: number;
      cure?: boolean;
      toHand?: boolean;
    }
  | {
      /**
       * Draw up to `max` cards (Third Eye). With `alsoOpponent` (Computer Error) the player who played it chooses
       * first, then their opponent, who answers during the other player's turn.
       */
      kind: 'drawCount';
      max: number;
      alsoOpponent?: boolean;
    }
  | {
      /** Evolve the player's Pokémon at `target` with a card from the deck named one of `names` (Rapid Evolution). */
      kind: 'evolveFromDeck';
      target: Target;
      names: string[];
    }
  | {
      /** Attach `cards`, one at a time, each to a benched Pokémon the player clicks (Energy Bomb). */
      kind: 'distributeEnergy';
      cards: CardInstance[];
    }
  | {
      /**
       * Chain Reaction: after a Pokémon evolves, the owner of the Eevee at `target` may search their deck for a
       * card that evolves from Eevee and evolve it. `next` are more Eevees to offer it to afterwards (by uid).
       */
      kind: 'chainReaction';
      target: Target;
      next: { player: PlayerId; uid: string }[];
    }
);

/** A PendingChoice as an effect starts it: the player is filled in. */
export type PendingChoiceInput = PendingChoice extends infer C ? (C extends unknown ? Omit<C, 'player'> : never) : never;

export const TRAINERS_LOCKED = "You can't play Trainer cards this turn";

/** Headache: the player can't play Trainer cards this turn. */
export const trainersLocked = (me: Pick<PlayerState, 'noTrainersUntil'>, turn: number) => (me.noTrainersUntil ?? 0) >= turn;

/** Special Energy behaviour (Rainbow, Full Heal and Potion Energy): what it does when attached from the hand. */
export interface EnergyEffect {
  onAttach: (state: GameState, owner: PlayerState, pokemon: InPlayPokemon) => void;
}

/** Card-specific Trainer behaviour. */
export interface TrainerEffect {
  /** Played onto the Bench as a Pokémon with this HP (Clefairy Doll) instead of with PLAY_TRAINER. */
  asPokemon?: { hp: number };
  /** A Stadium card: it stays in play (GameState.stadium), shared by both players, until another Stadium replaces it. */
  stadium?: boolean;
  /** A Stadium either player can use once during their turn (Lucky Stadium), with USE_STADIUM. */
  useStadium?: (ctx: { state: GameState; me: PlayerState; flip: () => boolean }) => void;
  /** It can be used any number of times a turn (Celadon City Gym), whenever `stadiumBlocked` allows. */
  stadiumAnyTimes?: boolean;
  /** Why the player can't use the Stadium now (Celadon City Gym: no Erika's Pokémon to cure). */
  stadiumBlocked?: (me: Pick<PlayerState, 'active' | 'bench'>, cards: CardLibrary) => string | null;
  /** It puts cards from a discard pile into the hand, which Pokémon Tower stops (Energy Retrieval, Item Finder). */
  discardToHand?: boolean;
  /** A Stadium that changes what each Pokémon pays to retreat (The Rocket's Training Gym, Cerulean City Gym). */
  retreatModifier?: (pokemon: PokemonCardDef) => number;
  /** Why the Trainer can't be played now. */
  blocked?: (s: TrainerSituation) => string | null;
  choices?: (s: TrainerSituation, c: TrainerChoices) => TrainerChoiceSpec[];
  play?: (ctx: TrainerContext) => void;
}

export interface TrainerContext {
  state: GameState;
  me: PlayerState;
  opp: PlayerState;
  card: CardInstance;
  choices: TrainerChoices;
  turn: number;
  log: (text: string, player?: PlayerId) => void;
  /** Flips a coin for the Trainer (logged). True = heads. */
  flip: () => boolean;
  /** Draws up to `n` cards (an empty deck just stops; that only loses at the start of a turn). */
  draw: (player: PlayerState, n: number) => void;
  /** Puts cards into the deck and shuffles it. */
  shuffleIntoDeck: (player: PlayerState, cards: CardInstance[]) => void;
  /** Removes these cards from the player's hand and returns them. */
  fromHand: (player: PlayerState, uids: string[]) => CardInstance[];
  /**
   * Attaches the Trainer to a Pokémon until the end of turn `until`, instead of discarding it; `toHand`: then it goes back
   * to the hand (Charity); `activeOnly`: it's discarded once the Pokémon is benched (Koga's Ninja Trick).
   */
  attachTo: (pokemon: InPlayPokemon, until: number, opts?: { toHand?: boolean; activeOnly?: boolean; tool?: boolean }) => void;
  /** Asks the player to finish a search (see PendingChoice). */
  pend: (choice: PendingChoiceInput) => void;
  /** The player's turn ends once the Trainer is done (Minion of Team Rocket, Tickling Machine). */
  endTurn: () => void;
}

export const own =(s: TrainerSituation, t: Target) => (t === 'active' ? s.me.active : s.me.bench[t]) ?? null;
export const theirs = (s: TrainerSituation, t: Target) => (t === 'active' ? s.opp.active : s.opp.bench[t]) ?? null;
export const targetsOf = (side: Pick<PlayerState, 'active' | 'bench'>): Target[] => [
  ...(side.active ? (['active'] as Target[]) : []),
  ...side.bench.flatMap((p, i) => (p ? [i] : [])),
];
/** The other cards in the player's hand (not the Trainer being played). */
export const otherHandCards = (s: TrainerSituation) => s.me.hand.filter((c) => c.uid !== s.card.uid);
export const def = (s: { cards: CardLibrary }, c: CardInstance): CardDef => lookupCard(s.cards, c.defId);

/** Why the Trainer can't be played now, or null if it can (given the right choices). View-safe. */
export function trainerError(s: TrainerSituation): string | null {
  const d = def(s, s.card);
  const effect = trainerEffect(s.card.defId);
  if (d.kind !== 'trainer' || !(effect?.play || effect?.stadium)) return `${d.name} can't be played this way`;
  if (trainersLocked(s.me, s.turn)) return TRAINERS_LOCKED;
  const hayFever = trainersBlocked([s.me, s.opp], s.cards);
  if (hayFever) return hayFever;
  // A Stadium can't be played while one with the same name is in play.
  if (effect.stadium && s.stadium && def(s, s.stadium).name === d.name) return `${d.name} is already in play`;
  if (effect.discardToHand && pokemonTower(s)) return 'Pokémon Tower: cards in discard piles stay there';
  if (removalTax(s) && otherHandCards(s).length < 2) return `No Removal Gym: you must discard 2 other cards from your hand to play ${d.name}`;
  return effect.blocked?.(s) ?? null;
}

/** No Removal Gym is in play and this is Energy Removal or Super Energy Removal: 2 other cards from the hand must be discarded to play it. */
const removalTax = (s: TrainerSituation) =>
  !!s.stadium && def(s, s.stadium).name === 'No Removal Gym' && ['Energy Removal', 'Super Energy Removal'].includes(def(s, s.card).name);

/** Pokémon Tower is in play: effects can't put cards from a discard pile into the hand. */
export const pokemonTower = (s: { stadium?: CardInstance | null; cards: CardLibrary }) => !!s.stadium && def(s, s.stadium).name === 'Pokémon Tower';

/**
 * Why the Stadium in play can't be used now (Lucky Stadium: once during each player's turn), or null. `player`: the
 * player using it, for Stadiums that depend on their Pokémon (Celadon City Gym). View-safe.
 */
export function stadiumError(
  stadium: CardInstance | null,
  usedTurn: number | undefined,
  turn: number,
  player?: { me: Pick<PlayerState, 'active' | 'bench'>; cards: CardLibrary },
): string | null {
  const effect = stadium && trainerEffect(stadium.defId);
  if (!effect?.useStadium) return 'There is no Stadium to use';
  const blocked = player && effect.stadiumBlocked?.(player.me, player.cards);
  if (blocked) return blocked;
  return !effect.stadiumAnyTimes && usedTurn === turn ? 'You already used the Stadium this turn' : null;
}

function choiceSpecs(s: TrainerSituation, c: TrainerChoices): TrainerChoiceSpec[] {
  const specs = trainerEffect(s.card.defId)?.choices?.(s, c) ?? [];
  if (!removalTax(s)) return specs;
  return [{ kind: 'cards', field: 'handUids', min: 2, max: 2, options: otherHandCards(s), prompt: 'No Removal Gym: choose 2 cards from your hand to discard' }, ...specs];
}

function autoAnswer(spec: TrainerChoiceSpec): TrainerChoices[keyof TrainerChoices] | undefined {
  switch (spec.kind) {
    case 'cards': {
      if (spec.options.length <= spec.min) return spec.options.map((c) => c.uid);
      // Identical cards make no difference when the count is fixed.
      const same = new Set(spec.options.map((c) => c.defId)).size === 1 && !spec.options.some((c) => c.provides);
      return same && spec.min === spec.max ? spec.options.slice(0, spec.max).map((c) => c.uid) : undefined;
    }
    default:
      return spec.options.length === 1 ? spec.options[0] : undefined;
  }
}

function validAnswer(spec: TrainerChoiceSpec, value: unknown): boolean {
  if (spec.kind !== 'cards') return (spec.options as unknown[]).includes(value);
  const uids = value as string[];
  return (
    Array.isArray(uids) &&
    uids.length >= spec.min &&
    uids.length <= spec.max &&
    new Set(uids).size === uids.length &&
    uids.every((u) => spec.options.some((c) => c.uid === u))
  );
}

/** Fills in answers that need no decision and checks the given ones (as for attacks and powers). */
export function resolveTrainerChoices(
  s: TrainerSituation,
  given: TrainerChoices,
): { choices: TrainerChoices } | { error: string; need?: TrainerChoiceSpec } {
  const c: TrainerChoices = { ...given };
  for (let guard = 0; guard < 10; guard++) {
    const specs = choiceSpecs(s, c);
    for (const spec of specs) {
      const value = c[spec.field];
      if (value !== undefined && !validAnswer(spec, value)) return { error: `Invalid choice: ${spec.prompt.toLowerCase()}` };
    }
    const open = specs.find((spec) => c[spec.field] === undefined);
    if (!open) return { choices: c };
    if ((open.kind === 'cards' ? open.options.length < open.min : open.options.length === 0)) return { error: `${open.prompt}: not enough to choose from` };
    const auto = autoAnswer(open);
    if (auto === undefined) return { error: open.prompt, need: open };
    (c as Record<string, unknown>)[open.field] = auto;
  }
  return { error: 'Too many choices' };
}

/** The next question the player has to answer for this Trainer, or null when it's ready to play. */
export function nextTrainerChoice(s: TrainerSituation, given: TrainerChoices): TrainerChoiceSpec | null {
  const result = resolveTrainerChoices(s, given);
  return 'need' in result ? (result.need ?? null) : null;
}

/** Plays a Trainer card from the hand. Mutates `state`; returns an error instead if not allowed. */
export function playTrainer(state: GameState, me: PlayerState, opp: PlayerState, cardUid: string, given: TrainerChoices): string | null {
  const card = me.hand.find((c) => c.uid === cardUid);
  if (!card) return 'That card is not in your hand';
  const oppFaceDownPrizes = faceDownPrizes(opp.prizes.length, (i) => !!opp.faceUpPrizes?.includes(opp.prizes[i]!.uid));
  const situation: TrainerSituation = { card, me, opp, deckCount: me.deck.length, cards: state.cards, turn: state.turn, stadium: state.stadium?.card ?? null, oppFaceDownPrizes };
  const error = trainerError(situation);
  if (error) return error;
  const resolved = resolveTrainerChoices(situation, given);
  if ('error' in resolved) return resolved.error;

  // Mind Games: the opponent may flip first, and the card waits for their answer (resumed by the engine).
  const minds = state.mindGamesPassed === card.uid ? 0 : mindGamesFlips(state, opp, me);
  if (minds > 0) {
    state.pendingChoice = { player: opp.id, source: 'Mind Games', kind: 'mindGames', cardUid: card.uid, choices: resolved.choices, flips: minds };
    addLog(state, `Played ${lookupCard(state.cards, card.defId).name}: Mind Games may stop it.`, me.id);
    return null;
  }
  me.hand = me.hand.filter((c) => c !== card);
  let attached = false;
  const ctx: TrainerContext = {
    state,
    me,
    opp,
    card,
    choices: resolved.choices,
    turn: state.turn,
    log: (text, player = me.id) => addLog(state, text, player),
    flip: () => flipCoin(state, lookupCard(state.cards, card.defId).name, me.id),
    draw(player, n) {
      const drawn = player.deck.splice(0, n);
      player.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, player.id);
    },
    shuffleIntoDeck(player, cards) {
      [player.deck, state.rngState] = shuffle([...player.deck, ...cards], state.rngState);
    },
    fromHand(player, uids) {
      const taken = player.hand.filter((c) => uids.includes(c.uid));
      player.hand = player.hand.filter((c) => !uids.includes(c.uid));
      return taken;
    },
    attachTo(pokemon, until, opts) {
      (pokemon.attached ??= []).push({ card, until, ...(opts?.toHand && { toHand: true }), ...(opts?.activeOnly && { activeOnly: true }), ...(opts?.tool && { tool: true }) });
      attached = true;
    },
    pend(choice) {
      state.pendingChoice = { ...choice, player: me.id } as PendingChoice;
    },
    endTurn() {
      state.endTurnNow = true;
    },
  };
  const name = lookupCard(state.cards, card.defId).name;
  const effect = trainerEffect(card.defId)!;
  // Chaos Gym: a flip to play any Trainer but a Stadium; on tails the opponent may play it instead (not again on their turn to play it).
  const chaos = state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Chaos Gym' && !effect.stadium && !(state.borrowed?.uid === card.uid && state.borrowed.chaos);
  if (chaos && !flipCoin(state, 'Chaos Gym', me.id)) {
    addLog(state, `Chaos Gym: couldn't play ${name}.`, me.id);
    const owner = state.borrowed?.uid === card.uid ? state.borrowed.owner : me.id;
    opp.hand.push(card);
    state.borrowed = { uid: card.uid, owner, player: opp.id, chaos: true };
    state.pendingChoice = { player: opp.id, source: 'Chaos Gym', kind: 'borrowedTrainer' };
    return null;
  }
  addLog(state, `Played ${name}.`, me.id);
  if (removalTax(situation)) {
    const taxed = ctx.fromHand(me, resolved.choices.handUids!);
    me.discard.push(...taxed);
    ctx.log(`No Removal Gym: discarded ${taxed.map((c) => lookupCard(state.cards, c.defId).name).join(' and ')}.`);
  }
  effect.play?.(ctx);
  if (effect.stadium) {
    // It replaces the Stadium in play, which goes to its owner's discard pile.
    const old = state.stadium;
    if (old) {
      state.players[old.owner]!.discard.push(old.card);
      addLog(state, `${lookupCard(state.cards, old.card.defId).name} was discarded.`, old.owner);
    }
    state.stadium = { card, owner: me.id };
    delete state.stadiumUsedTurn;
    attached = true;
  }
  // A borrowed card (Psychic Control, Chaos Gym) goes to its owner's discard pile.
  const borrowed = state.borrowed?.uid === card.uid ? state.borrowed : undefined;
  if (borrowed) delete state.borrowed;
  if (!attached) state.players[borrowed?.owner ?? me.id]!.discard.push(card);
  return null;
}

/** A card Super Rod (`filter`) or Reel In may take from the discard pile. */
const discardToHandFits = (cards: CardLibrary, c: CardInstance, filter?: 'basic' | 'evolution') => {
  const d = lookupCard(cards, c.defId);
  if (!isPokemonCard(d)) return false;
  return filter === 'basic' ? isBasicPokemon(d) : filter === 'evolution' ? !isBasicPokemon(d) : true;
};

/** The cards Time Capsule may shuffle back: Basic Pokémon, Evolution and basic Energy cards, Pokémon first. */
export const timeCapsuleCards = (cards: CardLibrary, discard: CardInstance[]) => {
  const pokemon = discard.filter((c) => isPokemonCard(lookupCard(cards, c.defId)));
  return [...pokemon, ...discard.filter((c) => isBasicEnergy(lookupCard(cards, c.defId)))];
};

/** Switches `side`'s Active Pokémon with its benched one in `slot` (Double Gust), unless Jaw Clamp holds it. */
export function swapActive(state: GameState, side: PlayerState, slot: number) {
  const locked = activeLocked(state, side.id);
  if (locked) return addLog(state, `${locked}.`, side.id);
  const benched = side.bench[slot]!;
  if (side.active) clearOnLeavingActive(side.active);
  side.bench[slot] = side.active;
  side.active = benched;
  addLog(state, `${lookupCard(state.cards, benched.card.defId).name} was switched in.`, side.id);
}

/** Mind Games: how many of `owner`'s Pokémon have it working, each a flip for a Trainer `player` plays. */
export function mindGamesFlips(state: GameState, owner: PlayerState, player: PlayerState): number {
  return [owner.active, ...owner.bench].filter((p) => p && powerEffect(effectId(p))?.mindGames && powerActive(p, state.cards, [owner, player])).length;
}

/** What the player choosing sees of a pending search. */
export type PendingChoiceView =
  /** Click a card to take it. `optional`: the player may also take nothing (Chain Reaction). */
  | { kind: 'pickFromDeck' | 'pickFromDiscard' | 'pickFromHand' | 'pickAttached'; prompt: string; options: CardInstance[]; optional?: boolean }
  /** Click one of the player's Pokémon on the board. `optional`: or be done (Fairy Power). */
  | { kind: 'ownPokemon'; purpose: 'heal' | 'attach' | 'switchIn' | 'benchDamage' | 'return'; prompt: string; options: Target[]; optional?: boolean }
  /** Click one of the opponent's Pokémon on the board (Sneak Attack), or skip. */
  | { kind: 'oppPokemon'; prompt: string; options: Target[]; optional?: boolean }
  | { kind: 'arrangeTop'; prompt: string; cards: CardInstance[] }
  /** Accept or decline (Challenge!), answered with count 1 or 0. */
  | { kind: 'challenge'; prompt: string }
  /**
   * The opponent's whole hand (`cards`), and the cards in it to choose from (Rocket's Sneak Attack: its Trainers);
   * none to choose, or `optional` (Erika's Perfume): the player can carry on.
   */
  | { kind: 'oppHand'; prompt: string; cards: CardInstance[]; options: CardInstance[]; optional?: boolean }
  | { kind: 'drawCount'; prompt: string; max: number }
  /** Pick one of the labelled answers (Lt. Surge's Treaty), answered with count = its index. */
  /** `playable`: a card the player may play from their hand instead of answering (Chaos Gym). */
  | { kind: 'options'; prompt: string; labels: string[]; playable?: string };

/** The options of a pending search, for the player making it. Deck cards are sorted so their order stays secret. */
export function pendingChoiceView(state: GameState, choice: PendingChoice): PendingChoiceView {
  if (choice.kind === 'arrangeTop') {
    const owner = choice.deckOwner ?? choice.player;
    const where = owner === choice.player ? '' : " on your opponent's deck";
    const cards = state.players[owner]!.deck.slice(0, choice.count);
    return { kind: 'arrangeTop', prompt: `${choice.source}: put these cards back${where} in any order (first is on top)`, cards };
  }
  if (choice.kind === 'mindGames') {
    const card = state.players[opponentOfChoice(state, choice)]!.hand.find((c) => c.uid === choice.cardUid);
    const what = card ? lookupCard(state.cards, card.defId).name : 'a Trainer card';
    const each = choice.flips > 1 ? ` (up to ${choice.flips} flips, until one is heads)` : '';
    return { kind: 'options', prompt: `Mind Games: your opponent played ${what}. Flip a coin${each}? Heads, it does nothing and goes on top of their deck`, labels: ['Flip a coin', 'Let it be played'] };
  }
  if (choice.kind === 'mayFlip') {
    const text = choice.power === 'herbalScent' ? 'heads removes all damage counters from every Grass Pokémon in play (both players\')' : 'heads attaches up to 4 Fire Energy cards from your deck to Typhlosion';
    return { kind: 'options', prompt: `${choice.source}: flip a coin? ${text[0]!.toUpperCase()}${text.slice(1)}`, labels: ['Flip a coin', "Don't flip"] };
  }
  if (choice.kind === 'challenge') {
    return { kind: 'challenge', prompt: `${choice.source}: your opponent challenges you. If you accept, each of you puts any number of Basic Pokémon from your deck onto your Bench; if you decline, they draw 2 cards` };
  }
  if (choice.kind === 'oppHandTrainer') {
    const hand = state.players[opponentOfChoice(state, choice)]!.hand;
    const options = hand.filter((c) => isTrainerCard(lookupCard(state.cards, c.defId)));
    const prompt = options.length ? `${choice.source}: choose a Trainer card for your opponent to shuffle into their deck` : `${choice.source}: your opponent has no Trainer cards`;
    return { kind: 'oppHand', prompt, cards: hand, options };
  }
  if (choice.kind === 'removeDamage') {
    const options = damagedTargets(state.players[choice.player]!);
    return { kind: 'ownPokemon', purpose: 'heal', prompt: `${choice.source}: click one of your Pokémon to remove a damage counter from`, options };
  }
  if (choice.kind === 'attachCard') {
    const name = lookupCard(state.cards, choice.card.defId).name;
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click one of your Pokémon to attach ${name} to`, options: targetsOf(state.players[choice.player]!) };
  }
  if (choice.kind === 'pickFromDiscard') {
    const options = discardOptions(state.players[choice.player]!, choice);
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: put a card from your discard pile on top of your deck`, options };
  }
  const player = state.players[choice.player]!;
  if (choice.kind === 'discardToHand') {
    const more = choice.count > 1 ? ` (up to ${choice.count})` : '';
    const what = choice.filter === 'basic' ? 'Basic Pokémon card' : choice.filter === 'evolution' ? 'Evolution card' : 'Basic Pokémon or Evolution card';
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: put a${choice.filter === 'evolution' ? 'n' : ''} ${what} from your discard pile into your hand${more}`, options: player.discard.filter((c) => discardToHandFits(state.cards, c, choice.filter)), optional: true };
  }
  if (choice.kind === 'shuffleFromHand') {
    return { kind: 'pickFromHand', prompt: `${choice.source}: shuffle ${choice.count} card${choice.count === 1 ? '' : 's'} from your hand into your deck`, options: player.hand };
  }
  if (choice.kind === 'timeCapsule') {
    // Pokémon first, then Energy (the CPU takes them in this order: agreed).
    const options = timeCapsuleCards(state.cards, player.discard);
    // 5 or none (all or none, with fewer): only the first card may be declined.
    const prompt = choice.count === 5 ? 'you may choose 5 Basic Pokémon, Evolution and/or basic Energy cards from your discard pile (all of them, if fewer) to shuffle into your deck' : `choose ${choice.count} more`;
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: ${prompt}`, options, optional: choice.count === 5 };
  }
  if (choice.kind === 'doubleGust') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    return { kind: 'oppPokemon', prompt: `${choice.source}: choose one of your opponent's benched Pokémon to switch with their Active Pokémon`, options: targetsOf(opp).filter((t) => t !== 'active') };
  }
  if (choice.kind === 'powerDamage') {
    const opp = state.players[state.playerOrder.find((id) => id !== choice.player)!]!;
    return { kind: 'oppPokemon', prompt: `${choice.source}: you may click one of your opponent's Pokémon to do ${choice.amount} damage to`, options: targetsOf(opp), optional: true };
  }
  if (choice.kind === 'evolveFromDeck') {
    const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
    const options = player.deck.filter((c) => choice.names.includes(name(c))).sort((a, b) => name(a).localeCompare(name(b)) || a.uid.localeCompare(b.uid));
    return { kind: 'pickFromDeck', prompt: `${choice.source}: evolve with ${choice.names.join(' or ')} from your deck`, options };
  }
  if (choice.kind === 'distributeEnergy') {
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    const left = choice.cards.length > 1 ? ` (${choice.cards.length} left)` : '';
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click a benched Pokémon to attach ${lookupCard(state.cards, choice.cards[0]!.defId).name} to${left}`, options };
  }
  if (choice.kind === 'handToDeck') {
    return { kind: 'pickFromHand', prompt: `${choice.source}: put a card from your hand on top of your deck`, options: player.hand };
  }
  if (choice.kind === 'switchIn') {
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    return { kind: 'ownPokemon', purpose: 'switchIn', prompt: `${choice.source}: click one of your benched Pokémon to switch in`, options };
  }
  if (choice.kind === 'benchDamage') {
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    return { kind: 'ownPokemon', purpose: 'benchDamage', prompt: `${choice.source}: click one of your benched Pokémon to take ${choice.amount} damage`, options };
  }
  if (choice.kind === 'discardAttached') {
    const p = (choice.target === 'active' ? player.active : player.bench[choice.target])!;
    if (choice.toHand) {
      return { kind: 'pickAttached', prompt: `${choice.source}: return a basic Energy card from ${lookupCard(state.cards, p.card.defId).name} to your hand`, options: p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId))) };
    }
    return { kind: 'pickAttached', prompt: `${choice.source}: discard an Energy card from ${lookupCard(state.cards, p.card.defId).name}`, options: p.energy };
  }
  if (choice.kind === 'drawCount') {
    return { kind: 'drawCount', prompt: `${choice.source}: draw up to ${choice.max} cards`, max: Math.min(choice.max, player.deck.length) };
  }
  if (choice.kind === 'chainReaction') {
    const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
    const options = player.deck.filter((c) => evolvesFromEevee(state.cards, c)).sort((a, b) => name(a).localeCompare(name(b)) || a.uid.localeCompare(b.uid));
    return { kind: 'pickFromDeck', prompt: `${choice.source}: you may evolve Eevee with a card from your deck`, options, optional: true };
  }
  if (choice.kind === 'pickFromTop') {
    const options = player.deck.filter((c) => choice.looked.includes(c.uid));
    const left = choice.take > 1 ? ` (${choice.take} left)` : '';
    if (choice.trainer) {
      const trainers = options.filter((c) => isTrainerCard(lookupCard(state.cards, c.defId)));
      return { kind: 'pickFromDeck', prompt: `${choice.source}: you may take a Trainer card (shown to your opponent); the rest are shuffled back`, options: trainers, optional: true };
    }
    if (choice.master) {
      const pokemon = options.filter((c) => isPokemonCard(lookupCard(state.cards, c.defId)));
      return { kind: 'pickFromDeck', prompt: `${choice.source}: you may take a Basic Pokémon or Evolution card; the rest are shuffled back`, options: pokemon, optional: true };
    }
    return { kind: 'pickFromDeck', prompt: `${choice.source}: put a card into your hand${left}; the rest are discarded`, options };
  }
  if (choice.kind === 'oppHandBasics') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const options = openBenchSlot(opp.bench, state.cards, state.stadium?.card) >= 0 ? opp.hand.filter((c) => isBasicPokemon(lookupCard(state.cards, c.defId))) : [];
    return { kind: 'oppHand', prompt: `${choice.source}: you may put Basic Pokémon from your opponent's hand onto their Bench`, cards: opp.hand, options, optional: true };
  }
  if (choice.kind === 'treaty') {
    return { kind: 'options', prompt: `${choice.source}: your opponent asks you to choose`, labels: ['Each player takes 1 of their Prize cards', 'Your opponent draws a card'] };
  }
  if (choice.kind === 'returnOwn') {
    return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: click any of your Pokémon to return it and its cards to your hand, or be done`, options: targetsOf(player), optional: true };
  }
  if (choice.kind === 'secretMission') {
    const hand = state.players[opponentOfChoice(state, choice)]!.hand;
    return { kind: 'oppHand', prompt: `${choice.source}: your opponent's hand`, cards: hand, options: [] };
  }
  if (choice.kind === 'discardDraw') {
    const so = choice.discarded ? ` (${choice.discarded} so far)` : '';
    return { kind: 'pickFromHand', prompt: `${choice.source}: discard any number of cards from your hand, then draw as many${so}`, options: player.hand, optional: true };
  }
  if (choice.kind === 'benchGuard') {
    const damaged = player.bench[choice.target];
    const rhydon = player.bench[choice.guard];
    const who = damaged ? lookupCard(state.cards, damaged.card.defId).name : 'it';
    const guard = rhydon ? lookupCard(state.cards, rhydon.card.defId).name : 'Brock’s Rhydon';
    return { kind: 'options', prompt: `${choice.source}: ${who} was damaged. Do 10 of that damage to ${guard} instead?`, labels: [`Move 10 damage to ${guard}`, `Leave it on ${who}`] };
  }
  if (choice.kind === 'flee' || choice.kind === 'ninjaTrick') {
    const attacker = state.players[opponentOfChoice(state, choice)]!;
    const attack = attacker.active && usableAttacks(attacker.active, state.cards, { recall: attacker.recallTurn === state.turn, bench: attacker.bench })[choice.attackIndex]?.attack.name;
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    const prompt =
      choice.kind === 'flee'
        ? `${choice.source}: your opponent is attacking with ${attack ?? 'an attack'}. If it damages Misty's Tentacruel, it switches with the benched Pokémon you click (Done: it stays)`
        : `${choice.source}: your opponent is attacking with ${attack ?? 'an attack'}. Click a benched Pokémon to switch in first, or Done`;
    return { kind: 'ownPokemon', purpose: 'switchIn', prompt, options, optional: true };
  }
  if (choice.kind === 'borrowedTrainer') {
    const card = state.borrowed?.uid;
    const what = card ? lookupCard(state.cards, player.hand.find((c) => c.uid === card)?.defId ?? '') : null;
    return { kind: 'options', prompt: `${choice.source}: your opponent couldn't play ${what?.name ?? 'a Trainer card'}. You may play it from your hand now`, labels: ["Don't play it"], ...(card && { playable: card }) };
  }
  if (choice.kind === 'attachFromHand') {
    const options = player.hand.filter((c) => attachableFromHand(state.cards, c, choice.type));
    return { kind: 'pickFromHand', prompt: `${choice.source}: you may attach up to ${choice.count} ${choice.type ? `${typeName(choice.type)} ` : ''}Energy card${choice.count === 1 ? '' : 's'} from your hand to your Active Pokémon`, options, optional: true };
  }
  if (choice.kind === 'removeEach' || choice.kind === 'drainEnergy') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const target = choice.kind === 'drainEnergy' ? 'active' : choice.targets[0]!;
    const p = (target === 'active' ? opp.active : opp.bench[target])!;
    return { kind: 'pickAttached', prompt: `${choice.source}: discard an Energy card from your opponent's ${lookupCard(state.cards, p.card.defId).name}`, options: p.energy.filter((e) => !e.provides) };
  }
  if (choice.kind === 'lunarPower') {
    if (!choice.card) {
      const options = player.deck.filter((c) => lunarTargets(state.cards, player, c).length).sort((a, b) => cardName(state, a).localeCompare(cardName(state, b)) || a.uid.localeCompare(b.uid));
      return { kind: 'pickFromDeck', prompt: `${choice.source}: take a card from your deck that evolves from one of your benched Pokémon`, options };
    }
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click the benched Pokémon to evolve into ${cardName(state, choice.card)}`, options: lunarTargets(state.cards, player, choice.card) };
  }
  if (choice.kind === 'soakUp') {
    const options = targetsOf(player).filter((t) => t !== choice.to && (t === 'active' ? player.active : player.bench[t])!.energy.some((e) => isEnergyCardOfType(state.cards, e, 'grass')));
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click another of your Pokémon to take a second Grass Energy card from, or Done`, options, optional: true };
  }
  if (choice.kind === 'mistysWish') {
    if (choice.step === 'prize') return { kind: 'options', prompt: `${choice.source}: look at which Prize card?`, labels: player.prizes.map((_, i) => `Prize ${i + 1}`) };
    if (choice.step === 'ask') return { kind: 'options', prompt: `${choice.source}: your opponent looked at 1 of their Prize cards and asks to switch it with a card from their hand`, labels: ['Let them switch', 'Decline (they draw a card)'] };
    return { kind: 'pickFromHand', prompt: `${choice.source}: choose a card from your hand to switch with the Prize card`, options: player.hand };
  }
  if (choice.kind === 'guess') return { kind: 'options', prompt: choice.source, labels: choice.labels };
  if (choice.kind === 'lookOppHand') return { kind: 'oppHand', prompt: `${choice.source}: your opponent's hand`, cards: state.players[opponentOfChoice(state, choice)]!.hand, options: [] };
  if (choice.kind === 'lookOppDeck') {
    const cards = state.players[opponentOfChoice(state, choice)]!.deck.slice(0, choice.count);
    return { kind: 'oppHand', prompt: `${choice.source}: the top ${cards.length} cards of your opponent's deck, top first (they go back in this order)`, cards, options: [] };
  }
  if (choice.kind === 'engage') {
    const who = choice.then ? 'Your opponent played Unown E. You may' : 'You may';
    return { kind: 'options', prompt: `${choice.source}: ${who} shuffle your hand into your deck and draw 4 cards`, labels: ['Shuffle and draw 4', 'Keep your hand'] };
  }
  if (choice.kind === 'fuchsia') {
    const options = targetsOf(player).filter((t) => cardName(state, (t === 'active' ? player.active : player.bench[t])!.card).includes('Koga'));
    return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: you may click a Pokémon with Koga in its name to shuffle it and its cards into your deck`, options, optional: true };
  }
  if (choice.kind === 'saffron') return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: click a Pokémon with Sabrina in its name to return a basic Energy card from`, options: saffronTargets(state.cards, player) };
  if (choice.kind === 'psychicControl') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: choose a Trainer card in your opponent's discard pile to use as if it were in your hand`, options: opp.discard.filter((c) => controllable(state.cards, c)) };
  }
  if (choice.kind === 'reflip') {
    return { kind: 'options', prompt: `${choice.source}: re-flip all of the attack's coins?`, labels: ['Keep the flips', 'Re-flip the coins'] };
  }
  if (choice.kind === 'narrowGym') {
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: no more than 4 benched Pokémon. Click one to return it and its cards to your hand`, options };
  }
  if (choice.kind === 'quiz') {
    return { kind: 'options', prompt: `${choice.source}: your opponent put ${lookupCard(state.cards, choice.card.defId).name} face down. How long is it?`, labels: choice.lengths };
  }
  if (choice.kind === 'sleightOfHand') {
    return { kind: 'pickFromHand', prompt: `${choice.source}: put up to ${3 - choice.moved} more cards from your hand on top of your deck, then take as many basic Energy cards from it`, options: player.hand, optional: true };
  }
  const deck = state.players[choice.player]!.deck;
  const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
  const options = deck.filter((c) => deckFilter(state.cards, choice, c)).sort((a, b) => name(a).localeCompare(name(b)) || a.uid.localeCompare(b.uid));
  const what =
    choice.filter === 'basicNamed'
      ? `a Basic Pokémon named ${[choice.name].flat().join(' or ')}`
      : choice.filter === 'basicType'
        ? `a ${typeName(choice.type!)} Basic Pokémon`
      : choice.filter === 'basicEnergy'
        ? 'a basic Energy card'
      : choice.filter === 'energyType'
        ? `a ${typeName(choice.type!)} Energy card`
      : choice.filter === 'baby'
        ? 'a Baby Pokémon'
      : choice.filter === 'basic'
        ? 'a Basic Pokémon'
      : choice.filter === 'evolution'
        ? 'an Evolution card'
      : choice.filter === 'darkEvolution'
        ? 'an Evolution card with Dark in its name'
      : choice.filter === 'named'
        ? `any of ${[choice.name].flat().join(', ')}`
      : choice.filter === 'ownerBasic'
        ? `a Basic Pokémon with ${choice.name} in its name`
      : choice.filter === 'ownerPokemon'
        ? `a Basic Pokémon or Evolution card with ${choice.name} in its name`
      : choice.filter === 'trainer'
        ? 'a Trainer card'
      : choice.filter === 'trainerNamed'
        ? `the Trainer card ${choice.name}`
      : choice.filter === 'pokemonNotNamed'
        ? `a Basic Pokémon or Evolution card not named ${choice.name}`
      : choice.filter === 'evolvesFrom'
        ? `a card that evolves from ${choice.name}`
        : choice.filter === 'pokemon'
          ? 'a Basic Pokémon or Evolution card'
          : 'any card';
  const more = (choice.count ?? 1) > 1 ? ` (up to ${choice.count} more)` : '';
  const prompt = choice.toBench ? `${choice.source}: put ${what} from your deck onto your Bench${more}` : `${choice.source}: take ${what} from your deck${more}`;
  return { kind: 'pickFromDeck', prompt, options, ...(choice.optional && { optional: true }) };
}

/** The other player from the one choosing. */
const opponentOfChoice = (state: GameState, choice: PendingChoice) => state.playerOrder.find((id) => id !== choice.player)!;

/**
 * Challenge!: `player` puts any number of Basic Pokémon from their deck onto their Bench (unless it's full or they have
 * none), then `then` does the same.
 */
export function challengeSearch(state: GameState, player: PlayerState, source: string, then?: PlayerId) {
  const room = benchRoom(player.bench, state.cards, state.stadium?.card);
  if (room && player.deck.some((c) => isBasicPokemon(lookupCard(state.cards, c.defId)))) {
    state.pendingChoice = { player: player.id, source, kind: 'pickFromDeck', filter: 'basic', toBench: true, optional: true, count: room, ...(then && { then }) };
  } else if (then) challengeSearch(state, state.players[then]!, source);
}

/** Whether a deck card can be picked in this search. */
export const deckFilter = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'pickFromDeck' }>, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  if (choice.filter === 'basicNamed') return isBasicPokemon(d) && [choice.name].flat().includes(d.name);
  if (choice.filter === 'basicType') return isBasicPokemon(d) && d.type === choice.type;
  if (choice.filter === 'basicEnergy') return isBasicEnergy(d);
  if (choice.filter === 'energyType') return isBasicEnergy(d) && d.kind === 'energy' && d.energyType === choice.type;
  if (choice.filter === 'baby') return isPokemonCard(d) && !!d.baby;
  if (choice.filter === 'basic') return isBasicPokemon(d);
  if (choice.filter === 'evolution') return isPokemonCard(d) && d.stage !== 'basic';
  if (choice.filter === 'darkEvolution') return isPokemonCard(d) && d.stage !== 'basic' && /\bDark\b/.test(d.name);
  if (choice.filter === 'named') return isPokemonCard(d) && [choice.name].flat().includes(d.name);
  if (choice.filter === 'ownerBasic') return isBasicPokemon(d) && d.name.includes(String(choice.name));
  if (choice.filter === 'ownerPokemon') return isPokemonCard(d) && d.name.includes(String(choice.name));
  if (choice.filter === 'trainer') return isTrainerCard(d);
  if (choice.filter === 'trainerNamed') return isTrainerCard(d) && d.name === choice.name;
  if (choice.filter === 'pokemonNotNamed') return isPokemonCard(d) && d.name !== choice.name;
  if (choice.filter === 'evolvesFrom') return d.kind === 'pokemon' && !d.trainerText && d.evolvesFrom === choice.name;
  return choice.filter === 'any' || (d.kind === 'pokemon' && !d.trainerText);
};

const discardOptions = (player: PlayerState, choice: Extract<PendingChoice, { kind: 'pickFromDiscard' }>) => player.discard.filter((c) => c.uid !== choice.excludeUid);

/** The player's Pokémon in play with damage counters. */
export const damagedTargets = (player: Pick<PlayerState, 'active' | 'bench'>) => targetsOf(player).filter((t) => (t === 'active' ? player.active : player.bench[t])!.damage >= 10);

/** A card that evolves from Eevee (Chain Reaction). */
export const evolvesFromEevee = (cards: CardLibrary, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return isPokemonCard(d) && d.stage === 'stage1' && d.evolvesFrom === 'Eevee';
};

const cardName = (state: { cards: CardLibrary }, c: CardInstance) => lookupCard(state.cards, c.defId).name;

/** A basic Energy card of `type` (Growth, Saffron City Gym). */
const isBasicEnergyOf = (cards: CardLibrary, c: CardInstance, type: EnergyType) => {
  const d = lookupCard(cards, c.defId);
  return isBasicEnergy(d) && d.kind === 'energy' && d.energyType === type;
};

/** An attached `type` Energy card: basic, or Rainbow Energy (engine.ts's isEnergyCardOf, which this module can't import). */
const isEnergyCardOfType = (cards: CardLibrary, c: CardInstance, type: EnergyType) => {
  if (c.provides) return false;
  const d = lookupCard(cards, c.defId);
  return d.kind === 'energy' && (!!d.anyType || (d.energyType === type && d.basic !== false));
};

/** Lunar Power: the player's benched Pokémon this deck card evolves from (by name and stage; no other evolution limits). */
export function lunarTargets(cards: CardLibrary, player: Pick<PlayerState, 'bench'>, c: CardInstance): number[] {
  const d = lookupCard(cards, c.defId);
  if (!isPokemonCard(d) || d.stage === 'basic') return [];
  return player.bench.flatMap((p, i) => {
    if (!p || p.faceDown || shapeshiftCard(p)) return [];
    const from = lookupCard(cards, p.card.defId);
    return from.kind === 'pokemon' && from.name === d.evolvesFrom && from.stage === (d.stage === 'stage2' ? 'stage1' : 'basic') ? [i] : [];
  });
}

/** Saffron City Gym: the player's Pokémon with Sabrina in their names that have a basic Energy card attached. */
export const saffronTargets = (cards: CardLibrary, player: Pick<PlayerState, 'active' | 'bench'>) =>
  targetsOf(player).filter((t) => {
    const p = (t === 'active' ? player.active : player.bench[t])!;
    return lookupCard(cards, p.card.defId).name.includes('Sabrina') && p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(cards, e.defId)));
  });

/** Trainer cards that are put into play, which Sabrina's Psychic Control can't use (PlusPower, Mysterious Fossil, Stadiums…). */
const PUT_IN_PLAY = ['PlusPower', 'Defender', 'Charity', "Sabrina's ESP", "Brock's Protection", "Koga's Ninja Trick"];

/** Sabrina's Psychic Control: a Trainer card that's played and not put into play. */
export const controllable = (cards: CardLibrary, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  const effect = trainerEffect(c.defId);
  return d.kind === 'trainer' && !!effect?.play && !effect.stadium && !PUT_IN_PLAY.includes(d.name);
};

/** Lunar Power: the benched Pokémon in `slot` evolves into `card` from the deck (it counts as evolving; Viridian City Gym applies). */
function evolveBenched(state: GameState, owner: PlayerState, slot: number, card: CardInstance) {
  const p = owner.bench[slot]!;
  addLog(state, `Evolved ${lookupCard(state.cards, p.card.defId).name} into ${lookupCard(state.cards, card.defId).name} with a card from the deck.`, owner.id);
  p.evolvedFrom.push(p.card);
  p.card = card;
  p.playedTurn = state.turn;
  clearOnLeavingActive(p);
  evolvedHook(state, owner.id, p);
}

/** Celadon City Gym: the Pokémon is no longer Asleep, Confused, Paralyzed or Poisoned (Burned stays). */
export function cureConditions(state: GameState, owner: PlayerState, pokemon: InPlayPokemon) {
  pokemon.condition = null;
  pokemon.poison = 0;
  delete pokemon.paralyzedTurn;
  addLog(state, `${lookupCard(state.cards, pokemon.card.defId).name} is no longer Asleep, Confused, Paralyzed or Poisoned.`, owner.id);
}

/** Finishes a pending search. Mutates `state`; returns an error instead if the answer is invalid. */
export function resolvePending(state: GameState, me: PlayerState, answer: { cardUid?: string; order?: string[]; target?: Target; count?: number }): string | null {
  const choice = state.pendingChoice!;
  const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
  if (choice.kind === 'discardToHand') {
    if (answer.cardUid !== undefined) {
      const card = me.discard.find((c) => c.uid === answer.cardUid && discardToHandFits(state.cards, c, choice.filter));
      if (!card) return 'Choose a Pokémon card from your discard pile';
      me.discard = me.discard.filter((c) => c !== card);
      me.hand.push(card);
      addLog(state, `Put ${name(card)} from the discard pile into the hand.`, me.id);
      if (choice.count > 1 && me.discard.some((c) => discardToHandFits(state.cards, c, choice.filter))) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
  } else if (choice.kind === 'shuffleFromHand') {
    const card = me.hand.find((c) => c.uid === answer.cardUid);
    if (!card) return 'Choose a card from your hand';
    me.hand = me.hand.filter((c) => c !== card);
    me.deck.push(card);
    if (choice.count > 1 && me.hand.length) {
      state.pendingChoice = { ...choice, count: choice.count - 1 };
      return null;
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    addLog(state, 'Shuffled cards from the hand into the deck.', me.id);
  } else if (choice.kind === 'timeCapsule') {
    const card = answer.cardUid === undefined ? undefined : timeCapsuleCards(state.cards, me.discard).find((c) => c.uid === answer.cardUid);
    if (answer.cardUid !== undefined && !card) return 'Choose a Basic Pokémon, Evolution or basic Energy card from your discard pile';
    if (!card && choice.count < 5) return 'Choose all 5 cards, or none';
    if (card) {
      me.discard = me.discard.filter((c) => c !== card);
      me.deck.push(card);
      addLog(state, `Time Capsule: ${name(card)} goes back into the deck.`, me.id);
      if (choice.count > 1 && timeCapsuleCards(state.cards, me.discard).length) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    delete state.pendingChoice;
    // Then the player who played it.
    if (choice.then && timeCapsuleCards(state.cards, state.players[choice.then]!.discard).length) {
      state.pendingChoice = { player: choice.then, source: choice.source, kind: 'timeCapsule', count: 5 };
    }
    return null;
  } else if (choice.kind === 'doubleGust') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const slot = typeof answer.target === 'number' ? answer.target : -1;
    if (!opp.bench[slot]) return "Choose one of your opponent's benched Pokémon";
    delete state.pendingChoice;
    // First the player's own Active Pokémon (the one they played it on chose), then the opponent's.
    swapActive(state, opp, slot);
    if (choice.oppSlot !== undefined && me.bench[choice.oppSlot]) swapActive(state, me, choice.oppSlot);
    return null;
  } else if (choice.kind === 'mayFlip') {
    if (answer.count !== 0 && answer.count !== 1) return 'Flip a coin, or not';
    delete state.pendingChoice;
    const p = choice.target === 'active' ? me.active : me.bench[choice.target];
    if (answer.count === 1 || !p) return null;
    if (!flipCoin(state, choice.source, me.id)) return null;
    if (choice.power === 'herbalScent') {
      for (const owner of Object.values(state.players)) {
        for (const g of [owner.active, ...owner.bench]) {
          if (!g || inPlayDef(state.cards, g).type !== 'grass' || !g.damage) continue;
          addLog(state, `Herbal Scent: ${name(g.card)} healed ${g.damage} damage.`, owner.id);
          g.damage = 0;
        }
      }
    } else {
      state.pendingChoice = { player: me.id, source: choice.source, kind: 'pickFromDeck', filter: 'energyType', type: 'fire', count: 4, optional: true, attachTo: choice.target };
    }
    return null;
  } else if (choice.kind === 'challenge') {
    if (answer.count !== 0 && answer.count !== 1) return 'Accept or decline the challenge';
    const challenger = state.players[opponentOfChoice(state, choice)]!;
    delete state.pendingChoice;
    if (answer.count === 0) {
      addLog(state, `Declined ${choice.source}`, me.id);
      const drawn = challenger.deck.splice(0, 2);
      challenger.hand.push(...drawn);
      addLog(state, `Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, challenger.id);
      return null;
    }
    addLog(state, `Accepted ${choice.source}`, me.id);
    challengeSearch(state, challenger, choice.source, me.id);
    return null;
  } else if (choice.kind === 'oppHandTrainer') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const trainers = opp.hand.filter((c) => isTrainerCard(lookupCard(state.cards, c.defId)));
    const card = trainers.find((c) => c.uid === answer.cardUid);
    if (trainers.length && !card) return "Choose a Trainer card from your opponent's hand";
    if (card) {
      opp.hand = opp.hand.filter((c) => c !== card);
      [opp.deck, state.rngState] = shuffle([...opp.deck, card], state.rngState);
      addLog(state, `Shuffled ${name(card)} into the deck.`, opp.id);
    } else addLog(state, "Looked at the opponent's hand: no Trainer cards.", me.id);
  } else if (choice.kind === 'powerDamage') {
    if (answer.target !== undefined) {
      const opp = state.players[state.playerOrder.find((id) => id !== me.id)!]!;
      const p = answer.target === 'active' ? opp.active : opp.bench[answer.target];
      if (!p) return "Choose one of your opponent's Pokémon";
      const damage = applyWeaknessResistance(choice.amount, choice.type, inPlayDef(state.cards, p), p.effects);
      p.damage += damage;
      addLog(state, `${choice.source}: ${name(p.card)} took ${damage} damage.`, opp.id);
    }
  } else if (choice.kind === 'benchDamage') {
    if (typeof answer.target !== 'number' || !me.bench[answer.target]) return 'Choose one of your benched Pokémon';
    damageChosenBenched(state, answer.target, choice.amount);
  } else if (choice.kind === 'switchIn') {
    const benched = typeof answer.target === 'number' ? me.bench[answer.target] : null;
    if (!benched) return 'Choose one of your benched Pokémon';
    const locked = activeLocked(state, me.id);
    if (locked) {
      addLog(state, `${locked}.`, me.id);
      return null;
    }
    const old = me.active;
    // The old Active Pokémon takes the chosen slot, even if the attack Knocked it Out (it's then Knocked Out from the Bench).
    if (old) clearOnLeavingActive(old);
    me.bench[answer.target as number] = old;
    me.active = benched;
    addLog(state, old ? `${name(benched.card)} was switched in for ${name(old.card)}.` : `${name(benched.card)} is the new Active Pokémon.`, me.id);
  } else if (choice.kind === 'handToDeck') {
    const card = me.hand.find((c) => c.uid === answer.cardUid);
    if (!card) return 'Choose a card from your hand';
    me.hand = me.hand.filter((c) => c !== card);
    me.deck.unshift(card);
    addLog(state, 'Put a card from the hand on top of the deck.', me.id);
  } else if (choice.kind === 'discardAttached') {
    const p = (choice.target === 'active' ? me.active : me.bench[choice.target])!;
    const energy = p.energy.find((e) => e.uid === answer.cardUid && (!choice.toHand || (!e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))));
    if (!energy) return choice.toHand ? 'Choose a basic Energy card' : 'Choose an Energy card to discard';
    p.energy = p.energy.filter((e) => e !== energy);
    if (choice.toHand) {
      me.hand.push(energy);
      addLog(state, `Returned ${name(energy)} from ${name(p.card)} to the hand.`, me.id);
      delete state.pendingChoice;
      return null;
    }
    me.discard.push(energy);
    addLog(state, `Discarded ${name(energy)} from ${name(p.card)}.`, me.id);
    // More to discard: the same choice again (identical cards need no choice).
    const left = (choice.count ?? 1) - 1;
    if (left > 0 && p.energy.length) {
      if (new Set(p.energy.map((e) => e.defId)).size > 1 && p.energy.length > left) {
        state.pendingChoice = { ...choice, count: left };
        return null;
      }
      const gone = p.energy.splice(-left);
      me.discard.push(...gone);
      addLog(state, `Discarded ${gone.length} more Energy from ${name(p.card)}.`, me.id);
    }
    if (choice.cure) cureConditions(state, me, p);
  } else if (choice.kind === 'evolveFromDeck') {
    const p = (choice.target === 'active' ? me.active : me.bench[choice.target])!;
    const options = me.deck.filter((c) => choice.names.includes(name(c)));
    const picked = options.find((c) => c.uid === answer.cardUid);
    if (!picked && options.length) return 'Choose a card from your deck';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      addLog(state, `Evolved ${name(p.card)} into ${name(picked)} with a card from the deck.`, me.id);
      p.evolvedFrom.push(p.card);
      p.card = picked;
      p.playedTurn = state.turn;
      clearOnLeavingActive(p);
      evolvedHook(state, me.id, p);
    } else addLog(state, 'Found nothing in the deck.', me.id);
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    delete state.pendingChoice;
    if (picked) offerChainReaction(state, undefined, choice.afterAttack);
    return null;
  } else if (choice.kind === 'distributeEnergy') {
    const p = typeof answer.target === 'number' ? me.bench[answer.target] : null;
    if (!p) return 'Choose one of your benched Pokémon';
    const [card, ...rest] = choice.cards;
    p.energy.push(card!);
    addLog(state, `Attached ${name(card!)} to ${name(p.card)}.`, me.id);
    if (rest.length) {
      state.pendingChoice = { ...choice, cards: rest };
      return null;
    }
  } else if (choice.kind === 'drawCount') {
    const max = Math.min(choice.max, me.deck.length);
    const count = answer.count ?? -1;
    if (!Number.isInteger(count) || count < 0 || count > max) return `Draw between 0 and ${max} cards`;
    me.hand.push(...me.deck.splice(0, count));
    addLog(state, `Drew ${count} card${count === 1 ? '' : 's'}.`, me.id);
    // Computer Error: then the opponent of the player who played it may draw too.
    if (choice.alsoOpponent && me.id === state.currentPlayer) {
      const opp = state.playerOrder.find((id) => id !== me.id)!;
      state.pendingChoice = { player: opp, source: choice.source, afterAttack: choice.afterAttack, kind: 'drawCount', max: choice.max, alsoOpponent: true };
      return null;
    }
  } else if (choice.kind === 'chainReaction') {
    const eevee = (choice.target === 'active' ? me.active : me.bench[choice.target])!;
    const picked = answer.cardUid === undefined ? undefined : me.deck.find((c) => c.uid === answer.cardUid && evolvesFromEevee(state.cards, c));
    if (answer.cardUid !== undefined && !picked) return 'Choose a card that evolves from Eevee';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
      addLog(state, `Evolved ${name(eevee.card)} into ${name(picked)} with a card from the deck.`, me.id);
      eevee.evolvedFrom.push(eevee.card);
      eevee.card = picked;
      eevee.playedTurn = state.turn;
      clearOnLeavingActive(eevee);
      evolvedHook(state, me.id, eevee);
    } else addLog(state, `${name(eevee.card)} didn't use ${choice.source}.`, me.id);
    // The next Eevee waiting to be asked, if it still can.
    delete state.pendingChoice;
    offerChainReaction(state, choice.next, choice.afterAttack);
    return null;
  } else if (choice.kind === 'pickFromTop') {
    const looked = me.deck.filter((c) => choice.looked.includes(c.uid));
    const takeable = choice.trainer
      ? looked.filter((c) => isTrainerCard(lookupCard(state.cards, c.defId)))
      : choice.master
        ? looked.filter((c) => isPokemonCard(lookupCard(state.cards, c.defId)))
        : looked;
    const picked = takeable.find((c) => c.uid === answer.cardUid);
    if (answer.cardUid !== undefined && !picked) return 'Choose one of the cards';
    if (!picked && takeable.length && !choice.master && !choice.trainer) return 'Choose one of the cards';
    if (choice.master || choice.trainer) {
      if (picked) {
        me.deck = me.deck.filter((c) => c !== picked);
        me.hand.push(picked);
        addLog(state, `Took ${name(picked)} from the deck.`, me.id);
      }
      [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
      delete state.pendingChoice;
      return null;
    }
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      me.hand.push(picked);
      addLog(state, 'Put a card into the hand.', me.id);
    }
    const rest = looked.filter((c) => c !== picked);
    if (picked && choice.take > 1 && rest.length) {
      state.pendingChoice = { ...choice, take: choice.take - 1 };
      return null;
    }
    me.deck = me.deck.filter((c) => !rest.includes(c));
    me.discard.push(...rest);
    if (rest.length) addLog(state, `Discarded ${rest.map(name).join(', ')}.`, me.id);
  } else if (choice.kind === 'oppHandBasics') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    if (answer.cardUid !== undefined) {
      const isBasic = (c: CardInstance) => isBasicPokemon(lookupCard(state.cards, c.defId));
      const card = opp.hand.find((c) => c.uid === answer.cardUid && isBasic(c));
      const slot = openBenchSlot(opp.bench, state.cards, state.stadium?.card);
      if (!card || slot < 0) return "Choose a Basic Pokémon from your opponent's hand";
      opp.hand = opp.hand.filter((c) => c !== card);
      opp.bench[slot] = { card, evolvedFrom: [], damage: 0, energy: [], playedTurn: state.turn };
      addLog(state, `${name(card)} was put onto the Bench.`, opp.id);
      // More to put down, while there's room.
      if (openBenchSlot(opp.bench, state.cards, state.stadium?.card) >= 0 && opp.hand.some(isBasic)) return null;
    }
  } else if (choice.kind === 'treaty') {
    if (answer.count !== 0 && answer.count !== 1) return 'Choose one of the two';
    const player = state.players[opponentOfChoice(state, choice)]!;
    if (answer.count === 0) {
      addLog(state, `Chose that each player takes 1 of their Prize cards.`, me.id);
      for (const p of [player, me]) {
        const prize = p.prizes.pop();
        if (!prize) continue;
        p.hand.push(prize);
        addLog(state, 'Took a Prize card.', p.id);
      }
    } else {
      addLog(state, 'Chose that their opponent draws a card.', me.id);
      const drawn = player.deck.splice(0, 1);
      player.hand.push(...drawn);
      addLog(state, `Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, player.id);
    }
  } else if (choice.kind === 'returnOwn') {
    if (answer.target !== undefined) {
      const p = answer.target === 'active' ? me.active : me.bench[answer.target];
      if (!p) return 'Choose one of your Pokémon';
      if (answer.target === 'active' && activeLocked(state, me.id)) return activeLocked(state, me.id)!;
      // A Buzzap'd Electrode attached as Energy is a Pokémon card again.
      me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card));
      if (answer.target === 'active') me.active = null;
      else me.bench[answer.target] = null;
      addLog(state, `${name(p.card)} and all cards attached to it returned to the hand.`, me.id);
      if (targetsOf(me).length) return null;
    }
  } else if (choice.kind === 'secretMission') {
    state.pendingChoice = { player: me.id, source: choice.source, kind: 'discardDraw', discarded: 0, ...(choice.afterAttack && { afterAttack: true }) };
    return null;
  } else if (choice.kind === 'discardDraw') {
    let discarded = choice.discarded;
    if (answer.cardUid !== undefined) {
      const card = me.hand.find((c) => c.uid === answer.cardUid);
      if (!card) return 'Choose a card from your hand';
      me.hand = me.hand.filter((c) => c !== card);
      me.discard.push(card);
      addLog(state, `Discarded ${name(card)}.`, me.id);
      discarded++;
      if (me.hand.length) {
        state.pendingChoice = { ...choice, discarded };
        return null;
      }
    }
    const drawn = me.deck.splice(0, discarded);
    me.hand.push(...drawn);
    addLog(state, `Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, me.id);
  } else if (choice.kind === 'benchGuard') {
    if (answer.count !== 0 && answer.count !== 1) return 'Choose one of the two';
    const damaged = me.bench[choice.target];
    const rhydon = me.bench[choice.guard];
    if (answer.count === 0 && damaged && rhydon && damaged.damage >= 10) {
      damaged.damage -= 10;
      rhydon.damage += 10;
      addLog(state, `${choice.source}: moved 10 damage from ${name(damaged.card)} to ${name(rhydon.card)}.`, me.id);
    }
  } else if (choice.kind === 'flee' || choice.kind === 'ninjaTrick') {
    // The engine answers it: the attack happens next.
    return 'Answered with the attack';
  } else if (choice.kind === 'borrowedTrainer') {
    // Not played: it goes to its owner's discard pile.
    const borrowed = state.borrowed;
    const card = borrowed && me.hand.find((c) => c.uid === borrowed.uid);
    if (borrowed && card) {
      me.hand = me.hand.filter((c) => c !== card);
      state.players[borrowed.owner]!.discard.push(card);
      addLog(state, `Didn't play ${name(card)}.`, me.id);
    }
    delete state.borrowed;
  } else if (choice.kind === 'attachFromHand') {
    if (answer.cardUid !== undefined) {
      const card = me.hand.find((c) => c.uid === answer.cardUid && attachableFromHand(state.cards, c, choice.type));
      if (!card || !me.active) return `Choose ${choice.type ? `a ${typeName(choice.type)}` : 'an'} Energy card from your hand`;
      me.hand = me.hand.filter((c) => c !== card);
      me.active.energy.push(card);
      addLog(state, `Attached ${name(card)} to ${name(me.active.card)}.`, me.id);
      if (choice.count > 1 && me.hand.some((c) => attachableFromHand(state.cards, c, choice.type))) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
  } else if (choice.kind === 'removeEach' || choice.kind === 'drainEnergy') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const [target, ...rest] = choice.kind === 'drainEnergy' ? (['active'] as Target[]) : choice.targets;
    const p = target === undefined ? null : target === 'active' ? opp.active : opp.bench[target!];
    const energy = p?.energy.find((e) => e.uid === answer.cardUid && !e.provides);
    if (p && p.energy.some((e) => !e.provides) && !energy) return 'Choose an Energy card to discard';
    if (p && energy) {
      p.energy = p.energy.filter((e) => e !== energy);
      addLog(state, `${choice.source}: discarded ${name(energy)} from ${name(p.card)}.`, opp.id);
      discardTheirEnergy(state, opp, [energy]);
    }
    if (choice.kind === 'removeEach' && rest.length) {
      state.pendingChoice = { ...choice, targets: rest };
      return null;
    }
  } else if (choice.kind === 'lunarPower') {
    if (!choice.card) {
      const picked = me.deck.find((c) => c.uid === answer.cardUid && lunarTargets(state.cards, me, c).length);
      if (!picked && me.deck.some((c) => lunarTargets(state.cards, me, c).length)) return 'Choose a card that evolves from one of your benched Pokémon';
      if (picked) {
        me.deck = me.deck.filter((c) => c !== picked);
        const targets = lunarTargets(state.cards, me, picked);
        if (targets.length > 1) {
          state.pendingChoice = { ...choice, card: picked };
          return null;
        }
        evolveBenched(state, me, targets[0]!, picked);
      } else addLog(state, 'Found nothing in the deck.', me.id);
    } else {
      if (typeof answer.target !== 'number' || !lunarTargets(state.cards, me, choice.card).includes(answer.target)) return 'Choose a benched Pokémon it evolves from';
      evolveBenched(state, me, answer.target, choice.card);
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
  } else if (choice.kind === 'soakUp') {
    if (answer.target !== undefined) {
      const from = answer.target === 'active' ? me.active : me.bench[answer.target];
      const to = choice.to === 'active' ? me.active : me.bench[choice.to];
      const energy = from && answer.target !== choice.to ? from.energy.find((e) => isEnergyCardOfType(state.cards, e, 'grass')) : undefined;
      if (!from || !to || !energy) return 'Choose another of your Pokémon with a Grass Energy card';
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      addLog(state, `Moved a Grass Energy card from ${name(from.card)} to ${name(to.card)}.`, me.id);
    }
  } else if (choice.kind === 'mistysWish') {
    if (choice.step === 'prize') {
      const i = answer.count;
      if (i === undefined || !Number.isInteger(i) || i < 0 || i >= me.prizes.length) return 'Choose a Prize card';
      state.peek = { player: me.id, card: me.prizes[i]!, label: `Prize ${i + 1}` };
      addLog(state, `Looked at Prize ${i + 1}.`, me.id);
      state.pendingChoice = { player: opponentOfChoice(state, choice), source: choice.source, kind: 'mistysWish', step: 'ask', prize: i };
      return null;
    }
    const player = state.players[opponentOfChoice(state, choice)]!;
    if (choice.step === 'ask') {
      if (answer.count !== 0 && answer.count !== 1) return 'Choose one of the two';
      if (answer.count === 1) {
        addLog(state, `Declined ${choice.source}.`, me.id);
        const drawn = player.deck.splice(0, 1);
        player.hand.push(...drawn);
        addLog(state, `Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, player.id);
      } else {
        addLog(state, `Accepted ${choice.source}.`, me.id);
        if (player.hand.length) {
          state.pendingChoice = { player: player.id, source: choice.source, kind: 'mistysWish', step: 'swap', prize: choice.prize };
          return null;
        }
      }
    } else {
      const card = me.hand.find((c) => c.uid === answer.cardUid);
      if (!card) return 'Choose a card from your hand';
      const i = choice.prize!;
      me.hand = me.hand.map((c) => (c === card ? me.prizes[i]! : c));
      me.prizes[i] = card;
      addLog(state, `Switched Prize ${i + 1} with a card from the hand.`, me.id);
    }
  } else if (choice.kind === 'guess') {
    const guess = answer.count;
    if (guess === undefined || !Number.isInteger(guess) || guess < 0 || guess >= choice.labels.length) return 'Choose an answer';
    const player = state.players[opponentOfChoice(state, choice)]!;
    const right = guess === choice.answer;
    addLog(state, `Guessed ${choice.labels[guess]}: it's ${choice.labels[choice.answer]} (${name(choice.card)}). ${right ? 'Right!' : 'Wrong.'}`, me.id);
    const winner = right ? me : player;
    const drawn = winner.deck.splice(0, choice.draw);
    winner.hand.push(...drawn);
    addLog(state, `Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, winner.id);
  } else if (choice.kind === 'fuchsia') {
    if (answer.target !== undefined) {
      const p = answer.target === 'active' ? me.active : me.bench[answer.target];
      if (!p || !name(p.card).includes('Koga')) return 'Choose a Pokémon with Koga in its name';
      if (answer.target === 'active' && activeLocked(state, me.id)) return activeLocked(state, me.id)!;
      const cards = [...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...c }) => c), ...(p.attached ?? []).map((a) => a.card)];
      [me.deck, state.rngState] = shuffle([...me.deck, ...cards], state.rngState);
      if (answer.target === 'active') me.active = null;
      else me.bench[answer.target] = null;
      addLog(state, `Shuffled ${name(p.card)} and all cards attached to it into the deck.`, me.id);
    }
  } else if (choice.kind === 'saffron') {
    const target = answer.target;
    if (target === undefined || !saffronTargets(state.cards, me).includes(target)) return 'Choose a Pokémon with Sabrina in its name and a basic Energy card';
    const p = (target === 'active' ? me.active : me.bench[target])!;
    const basic = p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)));
    if (new Set(basic.map((e) => e.defId)).size > 1) {
      state.pendingChoice = { player: me.id, source: choice.source, kind: 'discardAttached', target, toHand: true };
      return null;
    }
    p.energy = p.energy.filter((e) => e !== basic[0]);
    me.hand.push(basic[0]!);
    addLog(state, `Returned ${name(basic[0]!)} from ${name(p.card)} to the hand.`, me.id);
  } else if (choice.kind === 'psychicControl') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const options = opp.discard.filter((c) => controllable(state.cards, c));
    const picked = options.find((c) => c.uid === answer.cardUid);
    if (!picked && options.length && answer.cardUid !== undefined) return "Choose a Trainer card from your opponent's discard pile";
    if (picked) {
      // It's in the player's hand until it's played or the turn ends, then it goes back to the opponent's discard pile.
      opp.discard = opp.discard.filter((c) => c !== picked);
      me.hand.push(picked);
      state.borrowed = { uid: picked.uid, owner: opp.id, player: me.id };
      addLog(state, `Took ${name(picked)} from the opponent's discard pile to use this turn.`, me.id);
    }
  } else if (choice.kind === 'lookOppHand' || choice.kind === 'lookOppDeck') {
    // Nothing to do: the cards were shown.
  } else if (choice.kind === 'engage') {
    if (answer.count !== 0 && answer.count !== 1) return 'Shuffle and draw, or keep your hand';
    delete state.pendingChoice;
    if (answer.count === 0) {
      [me.deck, state.rngState] = shuffle([...me.deck, ...me.hand], state.rngState);
      me.hand = me.deck.splice(0, 4);
      addLog(state, `${choice.source}: shuffled the hand into the deck and drew ${me.hand.length} cards.`, me.id);
    } else addLog(state, `${choice.source}: kept the hand.`, me.id);
    if (choice.then) state.pendingChoice = { player: choice.then, source: choice.source, kind: 'engage' };
    return null;
  } else if (choice.kind === 'reflip') {
    // Re-flipping (count 1) is the engine's: it replays the attack.
    if (answer.count !== 0) return 'Choose one of the two';
    addLog(state, `Kept the coin flips (${choice.source}).`, me.id);
  } else if (choice.kind === 'narrowGym') {
    const p = typeof answer.target === 'number' ? me.bench[answer.target] : null;
    if (!p) return 'Choose one of your benched Pokémon';
    me.hand.push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card));
    me.bench[answer.target as number] = null;
    addLog(state, `${name(p.card)} and all cards attached to it returned to the hand (${choice.source}).`, me.id);
  } else if (choice.kind === 'quiz') {
    const guess = answer.count;
    if (guess === undefined || !Number.isInteger(guess) || guess < 0 || guess >= choice.lengths.length) return 'Choose a length';
    const player = state.players[opponentOfChoice(state, choice)]!;
    const right = guess === choice.answer;
    addLog(state, `Guessed ${choice.lengths[guess]}: ${name(choice.card)} is ${choice.lengths[choice.answer]}. ${right ? 'Right!' : 'Wrong.'}`, me.id);
    const winner = right ? me : player;
    const drawn = winner.deck.splice(0, 2);
    winner.hand.push(...drawn);
    addLog(state, `Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, winner.id);
  } else if (choice.kind === 'sleightOfHand') {
    let moved = choice.moved;
    if (answer.cardUid !== undefined) {
      const card = me.hand.find((c) => c.uid === answer.cardUid);
      if (!card) return 'Choose a card from your hand';
      me.hand = me.hand.filter((c) => c !== card);
      me.deck.unshift(card);
      addLog(state, 'Put a card from the hand on top of the deck.', me.id);
      moved++;
      if (moved < 3 && me.hand.length) {
        state.pendingChoice = { ...choice, moved };
        return null;
      }
    }
    // Then as many basic Energy cards from the deck, shown to the opponent.
    if (moved && me.deck.some((c) => isBasicEnergy(lookupCard(state.cards, c.defId)))) {
      state.pendingChoice = { player: me.id, source: choice.source, kind: 'pickFromDeck', filter: 'basicEnergy', reveal: true, count: moved, ...(choice.afterAttack && { afterAttack: true }) };
      return null;
    }
  } else if (choice.kind === 'arrangeTop') {
    const owner = state.players[choice.deckOwner ?? choice.player]!;
    const top = owner.deck.slice(0, choice.count);
    const order = answer.order ?? [];
    if (order.length !== top.length || !top.every((c) => order.includes(c.uid))) return 'Put every card back';
    owner.deck.splice(0, top.length, ...order.map((uid) => top.find((c) => c.uid === uid)!));
    addLog(state, `Rearranged the top ${top.length} cards of ${owner === me ? 'the' : "the opponent's"} deck.`, me.id);
  } else if (choice.kind === 'attachCard') {
    const p = answer.target === undefined ? null : answer.target === 'active' ? me.active : me.bench[answer.target];
    if (!p) return 'Choose one of your Pokémon';
    p.energy.push(choice.card);
    addLog(state, `Attached ${lookupCard(state.cards, choice.card.defId).name} to ${lookupCard(state.cards, p.card.defId).name}.`, me.id);
  } else if (choice.kind === 'removeDamage') {
    const options = damagedTargets(me);
    if (options.length && (answer.target === undefined || !options.includes(answer.target))) return 'Choose one of your Pokémon with damage counters';
    const p = answer.target === undefined ? null : answer.target === 'active' ? me.active : me.bench[answer.target];
    if (p) {
      p.damage -= 10;
      addLog(state, `Removed a damage counter from ${lookupCard(state.cards, p.card.defId).name}.`, me.id);
    }
  } else if (choice.kind === 'mindGames') {
    // Answered in the engine, which then plays the card (or doesn't).
    return 'Flip a coin, or let it be played';
  } else if (choice.kind === 'pickFromDiscard') {
    const options = discardOptions(me, choice);
    const picked = options.find((c) => c.uid === answer.cardUid);
    if (!picked && options.length > 0) return 'Choose a card from your discard pile';
    if (picked) {
      me.discard = me.discard.filter((c) => c !== picked);
      me.deck.unshift(picked);
      addLog(state, `Put ${lookupCard(state.cards, picked.defId).name} on top of the deck.`, me.id);
    }
  } else {
    const options = me.deck.filter((c) => deckFilter(state.cards, choice, c));
    const picked = options.find((c) => c.uid === answer.cardUid);
    // Nothing suitable in the deck: the search finds nothing.
    if (!picked && options.length > 0 && !choice.optional) return 'Choose a card from your deck';
    const benchSlot = openBenchSlot(me.bench, state.cards, state.stadium?.card);
    if (picked && choice.toBench && benchSlot < 0) return 'Your Bench is full';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      if (choice.toBench) me.bench[benchSlot] = { card: picked, evolvedFrom: [], damage: 0, energy: [], playedTurn: state.turn };
      else if (choice.attachToActive && me.active) me.active.energy.push(picked);
      else if (choice.attachTo !== undefined && (choice.attachTo === 'active' ? me.active : me.bench[choice.attachTo])) (choice.attachTo === 'active' ? me.active : me.bench[choice.attachTo])!.energy.push(picked);
      else if (!choice.attach) me.hand.push(picked);
    }
    const traded = choice.tradeUid !== undefined && picked ? me.hand.find((c) => c.uid === choice.tradeUid) : undefined;
    if (traded) me.hand = me.hand.filter((c) => c !== traded);
    [me.deck, state.rngState] = shuffle(traded ? [...me.deck, traded] : me.deck, state.rngState);
    const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
    addLog(
      state,
      picked
        ? traded
          ? `Traded ${name(traded)} for ${name(picked)} from the deck.`
          : choice.toBench
            ? `Put ${name(picked)} onto the Bench.`
            : choice.attachToActive && me.active
              ? `Attached ${name(picked)} from the deck to ${lookupCard(state.cards, me.active.card.defId).name}.`
            : choice.attachTo !== undefined
              ? `Attached ${name(picked)} from the deck.`
            : choice.reveal || choice.attach
              ? `${choice.attach ? 'Found' : 'Took'} ${name(picked)} ${choice.attach ? 'in' : 'from'} the deck.`
              : 'Took a card from the deck.'
        : 'Found nothing in the deck.',
      me.id,
    );
    // More to take (Summon Minions), while there's room and something to find.
    const left = (choice.count ?? 1) - 1;
    if (picked && left > 0 && (!choice.toBench || openBenchSlot(me.bench, state.cards, state.stadium?.card) >= 0) && me.deck.some((c) => deckFilter(state.cards, choice, c))) {
      state.pendingChoice = { ...choice, count: left };
      return null;
    }
    // Erika's Maids: the cards traded go from the hand into the deck.
    const away = me.hand.filter((c) => choice.tradeAway?.includes(c.uid));
    if (away.length) {
      me.hand = me.hand.filter((c) => !away.includes(c));
      [me.deck, state.rngState] = shuffle([...me.deck, ...away], state.rngState);
      addLog(state, `Shuffled ${away.length} card${away.length === 1 ? '' : 's'} from the hand into the deck.`, me.id);
    }
    // Challenge!: then the other player searches.
    if (choice.then) {
      delete state.pendingChoice;
      challengeSearch(state, state.players[choice.then]!, choice.source);
      return null;
    }
    // The next step: which Pokémon gets it.
    if (picked && choice.attach) {
      state.pendingChoice = { player: me.id, source: choice.source, afterAttack: choice.afterAttack, kind: 'attachCard', card: picked };
      return null;
    }
  }
  delete state.pendingChoice;
  return null;
}
