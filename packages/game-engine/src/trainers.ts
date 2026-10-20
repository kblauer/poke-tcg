// Trainer cards: legality, the questions a Trainer asks, and the context Trainer effects run with.
// Card-specific behaviour lives in effects/ (TRAINERS). Searches of hidden cards (the deck) can't
// be answered from a player's view, so those Trainers leave a PendingChoice that only the player
// sees the options of, answered with RESOLVE_CHOICE.
import { applyWeaknessResistance, damageChosenBenched, recallsAttacks, typeName, usableAttacks, type AttackChoices } from './attacks.js';
import { isBasicEnergy, isBasicPokemon, isPokemonCard, isTrainerCard, lookupCard, type Attack, type CardLibrary, type CardDef, type EnergyType, type PokemonCardDef } from './cards.js';
import { powerEffect, trainerEffect } from './effects/index.js';
import { activeLocked, discardTheirEnergy, evolvesOnto, type CardInstance, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from './engine.js';
import { shuffle } from './rng.js';
import { offerChainReaction, powerActive, trainerProof, trainersBlocked } from './powers.js';
import { addLog, baseUid, benchRoom, clearOnLeavingActive, effectId, evolvedHook, flipCoin, inPlayDef, openBenchSlot, shapeshiftCard } from './status.js';

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
  me: Side & Pick<PlayerState, 'hand' | 'noTrainersUntil' | 'supporterTurn' | 'noSupportersUntil'>;
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
const attachableFromHand = (cards: CardLibrary, c: CardInstance, type?: EnergyType, basic?: boolean) =>
  type ? isBasicEnergyOf(cards, c, type) : basic ? isBasicEnergy(lookupCard(cards, c.defId)) : lookupCard(cards, c.defId).kind === 'energy';

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
       * 'evolution': an Evolution card (Evolutionary Light); 'darkEvolution': one with Dark in its name (The Boss's Way);
       * 'basicNotBaby': a Basic Pokémon that isn't a Baby Pokémon (Dual Ball); 'energy': any Energy card (Scavenger Hunt);
       * 'toolOrMachine': a Pokémon Tool or Technical Machine card (Traveling Salesman).
       */
      filter:
        | 'any'
        | 'pokemon'
        | 'basicNamed'
        | 'basicType'
        | 'basicEnergy'
        | 'energyType'
        | 'baby'
        | 'basic'
        | 'basicNotBaby'
        | 'evolution'
        | 'darkEvolution'
        | 'named'
        | 'ownerBasic'
        | 'ownerPokemon'
        | 'trainer'
        | 'trainerNamed'
        | 'pokemonNotNamed'
        | 'evolvesFrom'
        | 'tool'
        | 'energy'
        | 'toolOrMachine'
        | 'supporter'
        | 'supporterOrStadium'
        | 'ballTrainer'
        | 'pokemonType';
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
      /** With `attach`: only to one of these (attachCard's `only`). */
      attachOnly?: { type?: EnergyType; name?: string; bench?: boolean };
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
      /** Gift: once this player is done, this player may make the same search. */
      thenSame?: PlayerId;
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
      /** Any card must be taken; the rest are shuffled back (Baby Outing, Forest Guardian). */
      shuffleRest?: boolean;
      /** Any number of basic Energy cards may be taken, one at a time, shown to the opponent; the rest are shuffled back (Flipper Stroke). */
      basicEnergy?: boolean;
      /** Then this player looks at as many cards from the top of their deck, the same way (Flipper Stroke). */
      then?: PlayerId;
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
      /** Up to this many (Shadow Hand: 2). Missing = any number. */
      max?: number;
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
      /** Basic Energy cards only (Sudden Growth). */
      basic?: boolean;
      /** To this Pokémon of the player's instead of the Active Pokémon (Reflected Sunlight). */
      target?: Target;
    }
  | {
      /** Super Removal: discard 1 Energy card from each of these of the opponent's Pokémon, one at a time; `toHand`: to their hand instead (Thought Wave Machine). */
      kind: 'removeEach';
      targets: Target[];
      toHand?: boolean;
      /** Shuffled into the opponent's deck instead (Stone Crush). */
      toDeck?: boolean;
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
      /** Look at the top `count` cards of the opponent's deck (`own`: the player's own, Radio Tower) and put them back in the same order (Observe). */
      kind: 'lookOppDeck';
      count: number;
      own?: boolean;
      /** Their first `count` Prize cards instead (Investigate). */
      prizes?: boolean;
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
      /**
       * A Pokémon Power the player "may flip" for, as it's played from the hand (Herbal Scent, Fire Boost, Softboiled): flip
       * (count 0) or not (count 1). Howl: use it (count 0) or not (count 1). Unown V's [Vanish]: flip, then a Pokémon to return.
       */
      kind: 'mayFlip';
      power: 'herbalScent' | 'fireBoost' | 'softboiled' | 'howl' | 'vanish';
      /** The Pokémon whose power it is. */
      target: Target;
    }
  | {
      /**
       * Look at the opponent's hand and choose a Trainer card in it (`any`: any card, Team Rocket's Evil Deeds), which they
       * shuffle into their deck (Rocket's Sneak Attack).
       */
      kind: 'oppHandTrainer';
      any?: boolean;
      /** Instead of a Trainer card: a Baby, Basic or Evolution card (Carry Off), or an Energy card (Sudden Swipe). */
      filter?: 'pokemon' | 'energy';
      /** Up to this many cards, one at a time (Dark Moon); the opponent then draws as many as were shuffled away (`taken`). */
      count?: number;
      taken?: number;
    }
  | {
      /** Apricorn Forest: a basic Energy card from the player's hand to show; then a Basic Pokémon of its type from the deck onto the Bench. */
      kind: 'revealEnergy';
    }
  | {
      /** Undersea Ruins: one of the player's Evolved Pokémon loses its top Evolution card (discarded), devolving it. */
      kind: 'devolveOwn';
    }
  | {
      /** Power Plant: a basic Energy card from the player's hand to discard; then a basic Energy card from the discard pile into the hand. */
      kind: 'powerPlant';
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
      /**
       * Only Basic Pokémon cards, or only Evolution cards (Super Rod); or Trainer cards instead (Old Rod), basic Energy cards
       * (Energy Stadium), any card (Searchlight), or a Pokémon or basic Energy card (Fishing Tail).
       */
      filter?: 'basic' | 'evolution' | 'trainer' | 'basicEnergy' | 'any' | 'pokemonOrBasicEnergy';
      /** The card taken is shown to the opponent (Fishing Tail): the log names it. */
      reveal?: boolean;
      /** The card that started it, still being played: not an option (Old Rod). */
      excludeUid?: string;
      /** Then this player may do the same (Searchlight, Mysterious Wing). */
      then?: PlayerId;
    }
  | {
      /**
       * Shuffle up to `count` Pokémon cards (Baby, Basic, Evolution) from the discard pile into the deck, one at a time (or
       * stop); then `then` does the same, up to `of` (the count it started with): Fish Out.
       */
      kind: 'discardToDeck';
      count: number;
      of: number;
      then?: PlayerId;
      /** Basic Energy cards instead of Pokémon cards (Energy Recycle). */
      filter?: 'basicEnergy';
    }
  | {
      /** Spatial Distortion: a Stadium card from the player's discard pile goes into play. */
      kind: 'stadiumFromDiscard';
    }
  | {
      /** Eerie Howl: a Baby or Basic Pokémon card in the opponent's hand goes onto their Bench and is switched in for their Active Pokémon. */
      kind: 'oppHandToActive';
    }
  | {
      /** Unown V's [Vanish]: one of the player's other Pokémon with Unown in its name goes back to their hand, every card attached discarded. */
      kind: 'returnUnown';
      /** The Unown V's top card uid: not an option. */
      except: string;
    }
  | {
      /** Impostor Professor Oak's Invention: the player saw the opponent's Prize cards; shuffle them into that deck for new ones from the top (count 0), or not (count 1). */
      kind: 'invention';
    }
  | {
      /** Cunning: the player saw the top card of the opponent's deck; have them shuffle their deck (count 0), or not (count 1). */
      kind: 'cunning';
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
      /** No Weakness or Resistance (Surprise Bite). */
      noWeakness?: boolean;
    }
  | {
      /** Remove 1 damage counter from one of the player's Pokémon with damage (Heal), chosen on the board; `count` of them one at a time (Strange Scent). */
      kind: 'removeDamage';
      count?: number;
    }
  | {
      /**
       * Attach `card`, found in the deck, to one of the player's Pokémon, chosen on the board (Energy Spike); only to one of
       * `type` (Attract Current) or with `name` in its name (Unown Y's Yield), when given.
       */
      kind: 'attachCard';
      card: CardInstance;
      only?: { type?: EnergyType; name?: string; bench?: boolean };
      /** The search to go on with once it's attached (more cards to find: Attract Current). */
      next?: PendingChoice;
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
      /** With `toHand`: up to `count`, one at a time, and the player may stop (Time Shard). */
      optional?: boolean;
    }
  | {
      /**
       * Draw up to `max` cards (Third Eye). With `alsoOpponent` (Computer Error) the player who played it chooses
       * first, then their opponent, who answers during the other player's turn.
       */
      kind: 'drawCount';
      max: number;
      alsoOpponent?: boolean;
      /** All `max` cards or none ("may draw 2 cards": Gold Scale). */
      allOrNone?: boolean;
    }
  | {
      /** Evolve the player's Pokémon at `target` with a card from the deck named one of `names` (Rapid Evolution). */
      kind: 'evolveFromDeck';
      target: Target;
      names: string[];
    }
  | {
      /** Attach `cards`, one at a time, each to a benched Pokémon the player clicks (Energy Bomb), or to any of their Pokémon of `toType` (Howl). */
      kind: 'distributeEnergy';
      cards: CardInstance[];
      toType?: EnergyType;
    }
  | {
      /**
       * Evolutionary Spore: a card from the deck that evolves from one of the player's Pokémon named one of `names` that
       * hasn't evolved this way yet (`done`, by baseUid), then (`card`) which Pokémon; again until the player is done.
       */
      kind: 'evolveMany';
      names: string[];
      done: string[];
      card?: CardInstance;
      /** One evolution only (Evolution Song). */
      once?: boolean;
      /** Then this player may do the same, with `thenNames` (Evolution Song). */
      then?: PlayerId;
      thenNames?: string[];
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
  | {
      /** A "may" as a card is played (Energy Recharge, Flame Vapor, Streaming Mantle, Retro Energy): yes (count 0) or no (count 1). */
      kind: 'mayUse';
      power: 'energyRecharge' | 'flameVapor' | 'streamingMantle' | 'retroEnergy';
      /** The Pokémon it's about. */
      target: Target;
    }
  | {
      /**
       * Attach `count` basic Energy cards from the discard pile, one at a time, to the Pokémon at `target` (Energy Recharge,
       * Manipulate); with no `target`, each to one of the player's Pokémon clicked next (Star Back).
       */
      kind: 'attachFromDiscard';
      count: number;
      target?: Target;
    }
  | {
      /**
       * A card from the discard pile onto the Bench: a Basic Pokémon that isn't a Baby (Manipulate: then 3 flips, a basic
       * Energy card from the discard pile attached to it for each heads), or an Omanyte or Kabuto, as a Basic Pokémon
       * (Underground Lake). The player may take nothing.
       */
      kind: 'discardToBench';
      filter: 'basicNotBaby' | 'fossil';
      manipulate?: boolean;
    }
  | {
      /** Attract Energy: move any number of basic Energy cards from the player's other Pokémon to the one at `target`, one at a time. */
      kind: 'moveAttached';
      target: Target;
    }
  | {
      /** Oracle: 2 cards from the deck (`picked` so far) go on top, the rest shuffled; then they're put in any order. */
      kind: 'oracle';
      picked: string[];
    }
  | {
      /** Underground Expedition: `take` of the bottom cards of the deck (`looked`) go into the hand; the rest stay at the bottom. */
      kind: 'bottomPick';
      looked: string[];
      take: number;
    }
  | {
      /** Water of Evolution: evolve the Pokémon at `target` with a card from the hand named one of `names`. */
      kind: 'evolveFromHand';
      target: Target;
      names: string[];
    }
  | {
      /** Mystery Zone: an Evolution card from the hand goes into the deck; then a basic Energy card from the deck into the hand. */
      kind: 'mysteryZone';
    }
  | {
      /** Electric Blast: `count` damage counters, one at a time, on the opponent's Benched Pokémon the player clicks. */
      kind: 'placeCounters';
      count: number;
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
  /** Why it can't be attached to this Pokémon from the hand (Miracle Energy: Shining and Light Pokémon only; Boost Energy: Evolved Pokémon only; Bounce Energy: one with basic Energy cards). */
  attachError?: (pokemon: PokemonCardDef, inPlay: InPlayPokemon, cards: CardLibrary) => string | null;
}

/** Card-specific Trainer behaviour. */
export interface TrainerEffect {
  /** Played onto the Bench as a Pokémon with this HP (Clefairy Doll) instead of with PLAY_TRAINER. */
  asPokemon?: { hp: number };
  /** A Supporter card: only one can be played each turn (PlayerState.supporterTurn). */
  supporter?: boolean;
  /** A Technical Machine: the Pokémon it's attached to can use this attack instead of its own (usableAttacks). */
  technicalMachine?: Attack;
  /** A Pokémon Tool (Gift searches for one). */
  tool?: boolean;
  /** A Stadium card: it stays in play (GameState.stadium), shared by both players, until another Stadium replaces it. */
  stadium?: boolean;
  /** A Stadium either player can use once during their turn (Lucky Stadium), with USE_STADIUM. */
  useStadium?: (ctx: { state: GameState; me: PlayerState; flip: () => boolean }) => void;
  /** It can be used any number of times a turn (Celadon City Gym), whenever `stadiumBlocked` allows. */
  stadiumAnyTimes?: boolean;
  /** Why the player can't use the Stadium now (Celadon City Gym: no Erika's Pokémon to cure). */
  stadiumBlocked?: (me: Pick<PlayerState, 'active' | 'bench' | 'hand' | 'discard' | 'supporterTurn'>, cards: CardLibrary, turn: number) => string | null;
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
  if (effect.supporter && s.me.supporterTurn === s.turn) return 'You can play only one Supporter card each turn';
  if (effect.supporter && (s.me.noSupportersUntil ?? 0) >= s.turn) return "Addictive Pollen: you can't play Supporter cards this turn";
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
  player?: { me: Pick<PlayerState, 'active' | 'bench' | 'hand' | 'discard' | 'supporterTurn'>; cards: CardLibrary },
): string | null {
  const effect = stadium && trainerEffect(stadium.defId);
  if (!effect?.useStadium) return 'There is no Stadium to use';
  const blocked = player && effect.stadiumBlocked?.(player.me, player.cards, turn);
  if (blocked) return blocked;
  return !effect.stadiumAnyTimes && usedTurn === turn ? 'You already used the Stadium this turn' : null;
}

/** Legendary Body: a Trainer card that isn't a Stadium can't choose an Active Pokémon with it working, or its Energy. */
function withoutProof(s: TrainerSituation, spec: TrainerChoiceSpec): TrainerChoiceSpec {
  const sides = [s.me, s.opp];
  if (spec.kind === 'pokemon') return trainerProof(spec.side === 'own' ? s.me : s.opp, sides, s.cards) ? { ...spec, options: spec.options.filter((t) => t !== 'active') } : spec;
  if (spec.kind !== 'cards' || (spec.field !== 'energyUids' && spec.field !== 'oppEnergyUids')) return spec;
  const proof = sides.flatMap((side) => (trainerProof(side, sides, s.cards) ? side.active!.energy.map((e) => e.uid) : []));
  return proof.length ? { ...spec, options: spec.options.filter((e) => !proof.includes(e.uid)) } : spec;
}

function choiceSpecs(s: TrainerSituation, c: TrainerChoices): TrainerChoiceSpec[] {
  const effect = trainerEffect(s.card.defId);
  const specs = (effect?.choices?.(s, c) ?? []).map((spec) => (effect?.stadium ? spec : withoutProof(s, spec)));
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
  if (effect.supporter) me.supporterTurn = state.turn;
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

/** A card Super Rod (`filter`), Old Rod, Energy Stadium, Searchlight or Reel In may take from the discard pile. */
const discardToHandFits = (cards: CardLibrary, c: CardInstance, filter?: Extract<PendingChoice, { kind: 'discardToHand' }>['filter']) => {
  const d = lookupCard(cards, c.defId);
  if (filter === 'any') return true;
  if (filter === 'trainer') return isTrainerCard(d);
  if (filter === 'basicEnergy') return isBasicEnergy(d);
  if (filter === 'pokemonOrBasicEnergy') return isPokemonCard(d) || isBasicEnergy(d);
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
  /** `allOrNone`: 0 or `max` only. */
  | { kind: 'drawCount'; prompt: string; max: number; allOrNone?: boolean }
  /** Pick one of the labelled answers (Lt. Surge's Treaty), answered with count = its index. */
  /** `playable`: a card the player may play from their hand instead of answering (Chaos Gym). */
  | { kind: 'options'; prompt: string; labels: string[]; playable?: string };

/** The options of a pending search, for the player making it. Deck cards are sorted so their order stays secret. */
export function pendingChoiceView(state: GameState, choice: PendingChoice): PendingChoiceView {
  if (isSkyridge(choice)) return skyridgeView(state, choice);
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
    if (choice.power === 'howl') {
      return { kind: 'options', prompt: `${choice.source}: discard the top 5 cards of your deck and attach the Fire Energy cards among them to your Fire Pokémon? Your turn ends`, labels: ['Use Howl', "Don't use it"] };
    }
    const text = {
      herbalScent: 'heads removes all damage counters from every Grass Pokémon in play (both players\')',
      fireBoost: 'heads attaches up to 4 Fire Energy cards from your deck to Typhlosion',
      softboiled: 'heads removes 8 damage counters from Blissey, tails 4',
      vanish: 'heads returns 1 of your other Pokémon with Unown in its name to your hand (its cards are discarded)',
    }[choice.power];
    return { kind: 'options', prompt: `${choice.source}: flip a coin? ${text[0]!.toUpperCase()}${text.slice(1)}`, labels: ['Flip a coin', "Don't flip"] };
  }
  if (choice.kind === 'challenge') {
    return { kind: 'challenge', prompt: `${choice.source}: your opponent challenges you. If you accept, each of you puts any number of Basic Pokémon from your deck onto your Bench; if you decline, they draw 2 cards` };
  }
  if (choice.kind === 'oppHandTrainer' && choice.count !== undefined) {
    const hand = state.players[opponentOfChoice(state, choice)]!.hand;
    return { kind: 'oppHand', prompt: `${choice.source}: choose up to ${choice.count} more card${choice.count === 1 ? '' : 's'} for your opponent to shuffle into their deck (they then draw as many)`, cards: hand, options: hand, optional: true };
  }
  if (choice.kind === 'revealEnergy' || choice.kind === 'powerPlant') {
    const hand = state.players[choice.player]!.hand.filter((c) => isBasicEnergy(lookupCard(state.cards, c.defId)));
    const what = choice.kind === 'revealEnergy' ? 'show a basic Energy card from your hand: a Basic Pokémon of its type goes from your deck onto your Bench' : 'discard a basic Energy card from your hand, then take one from your discard pile';
    return { kind: 'pickFromHand', prompt: `${choice.source}: ${what}`, options: hand };
  }
  if (choice.kind === 'devolveOwn') {
    const player = state.players[choice.player]!;
    return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: click one of your Evolved Pokémon to discard its top Evolution card`, options: targetsOf(player).filter((t) => (t === 'active' ? player.active : player.bench[t])!.evolvedFrom.length > 0) };
  }
  if (choice.kind === 'oppHandTrainer') {
    const hand = state.players[opponentOfChoice(state, choice)]!.hand;
    const options = hand.filter((c) => oppHandFits(state.cards, choice, c));
    const what = choice.any ? 'a card' : choice.filter === 'pokemon' ? 'a Baby, Basic or Evolution card' : choice.filter === 'energy' ? 'an Energy card' : 'a Trainer card';
    const none = choice.any ? 'cards' : choice.filter === 'pokemon' ? 'Pokémon cards' : choice.filter === 'energy' ? 'Energy cards' : 'Trainer cards';
    const prompt = options.length ? `${choice.source}: choose ${what} for your opponent to shuffle into their deck` : `${choice.source}: your opponent has no ${none}`;
    return { kind: 'oppHand', prompt, cards: hand, options };
  }
  if (choice.kind === 'stadiumFromDiscard') {
    const options = state.players[choice.player]!.discard.filter((c) => !!trainerEffect(c.defId)?.stadium);
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: choose a Stadium card from your discard pile to put into play`, options };
  }
  if (choice.kind === 'oppHandToActive') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const room = openBenchSlot(opp.bench, state.cards, state.stadium?.card) >= 0;
    const options = room ? opp.hand.filter((c) => isBasicPokemon(lookupCard(state.cards, c.defId))) : [];
    const prompt = options.length ? `${choice.source}: choose a Baby or Basic Pokémon from your opponent's hand to put onto their Bench and switch in` : `${choice.source}: your opponent has no Baby or Basic Pokémon to put down`;
    return { kind: 'oppHand', prompt, cards: opp.hand, options };
  }
  if (choice.kind === 'returnUnown') {
    return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: click one of your Pokémon with Unown in its name to return to your hand (its cards are discarded)`, options: unownTargets(state, choice) };
  }
  if (choice.kind === 'invention') {
    const prizes = state.players[opponentOfChoice(state, choice)]!.prizes.map((c) => cardName(state, c));
    return { kind: 'options', prompt: `${choice.source}: your opponent's Prize cards are ${prizes.join(', ') || 'none'}. Have them shuffled into their deck, for as many new ones from the top?`, labels: ['Shuffle them in', 'Leave them'] };
  }
  if (choice.kind === 'cunning') {
    const top = state.players[opponentOfChoice(state, choice)]!.deck[0];
    return { kind: 'options', prompt: `${choice.source}: the top card of your opponent's deck is ${top ? cardName(state, top) : 'nothing'}. Have them shuffle their deck?`, labels: ['Shuffle it', 'Leave it'] };
  }
  if (choice.kind === 'discardToDeck') {
    const options = state.players[choice.player]!.discard.filter((c) => toDeckFits(state.cards, choice, c));
    if (choice.filter === 'basicEnergy') return { kind: 'pickFromDiscard', prompt: `${choice.source}: shuffle a basic Energy card from your discard pile into your deck`, options };
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: you may shuffle up to ${choice.count} more Baby, Basic or Evolution cards from your discard pile into your deck`, options, optional: true };
  }
  if (choice.kind === 'removeDamage') {
    const options = damagedTargets(state.players[choice.player]!);
    const left = (choice.count ?? 1) > 1 ? ` (${choice.count} left)` : '';
    return { kind: 'ownPokemon', purpose: 'heal', prompt: `${choice.source}: click one of your Pokémon to remove a damage counter from${left}`, options };
  }
  if (choice.kind === 'attachCard') {
    const name = lookupCard(state.cards, choice.card.defId).name;
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click one of your Pokémon to attach ${name} to`, options: attachTargets(state, choice) };
  }
  if (choice.kind === 'evolveMany') {
    const player = state.players[choice.player]!;
    if (!choice.card) {
      const options = player.deck.filter((c) => sporeTargets(state, choice, c).length).sort((a, b) => cardName(state, a).localeCompare(cardName(state, b)) || a.uid.localeCompare(b.uid));
      return { kind: 'pickFromDeck', prompt: `${choice.source}: you may take a card from your deck that evolves from one of your ${choice.names.join(' or ')}`, options, optional: true };
    }
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click the Pokémon to evolve into ${cardName(state, choice.card)}`, options: sporeTargets(state, choice, choice.card) };
  }
  if (choice.kind === 'pickFromDiscard') {
    const options = discardOptions(state.players[choice.player]!, choice);
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: put a card from your discard pile on top of your deck`, options };
  }
  const player = state.players[choice.player]!;
  if (choice.kind === 'discardToHand') {
    const more = choice.count > 1 ? ` (up to ${choice.count})` : '';
    const what = { basic: 'a Basic Pokémon card', evolution: 'an Evolution card', trainer: 'a Trainer card', basicEnergy: 'a basic Energy card', any: 'a card', pokemonOrBasicEnergy: 'a Pokémon or basic Energy card' }[choice.filter ?? 'basic'];
    const pokemon = choice.filter === undefined ? 'a Basic Pokémon or Evolution card' : what;
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: put ${pokemon} from your discard pile into your hand${more}`, options: player.discard.filter((c) => c.uid !== choice.excludeUid && discardToHandFits(state.cards, c, choice.filter)), optional: true };
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
    const options = distributeTargets(state, player, choice);
    const left = choice.cards.length > 1 ? ` (${choice.cards.length} left)` : '';
    const which = choice.toType ? `one of your ${typeName(choice.toType)} Pokémon` : 'a benched Pokémon';
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click ${which} to attach ${lookupCard(state.cards, choice.cards[0]!.defId).name} to${left}`, options };
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
      const options = p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)));
      const from = lookupCard(state.cards, p.card.defId).name;
      if (choice.optional) {
        const what = (choice.count ?? 1) > 1 ? `up to ${choice.count} basic Energy cards` : 'a basic Energy card';
        return { kind: 'pickAttached', prompt: `${choice.source}: you may return ${what} from ${from} to your hand, one at a time`, options, optional: true };
      }
      return { kind: 'pickAttached', prompt: `${choice.source}: return a basic Energy card from ${from} to your hand`, options };
    }
    return { kind: 'pickAttached', prompt: `${choice.source}: discard an Energy card from ${lookupCard(state.cards, p.card.defId).name}`, options: p.energy };
  }
  if (choice.kind === 'drawCount') {
    const max = Math.min(choice.max, player.deck.length);
    if (choice.allOrNone) return { kind: 'drawCount', prompt: `${choice.source}: you may draw ${max} card${max === 1 ? '' : 's'}`, max, allOrNone: true };
    return { kind: 'drawCount', prompt: `${choice.source}: draw up to ${choice.max} cards`, max };
  }
  if (choice.kind === 'chainReaction') {
    const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
    const options = player.deck.filter((c) => evolvesFromEevee(state.cards, c)).sort((a, b) => name(a).localeCompare(name(b)) || a.uid.localeCompare(b.uid));
    return { kind: 'pickFromDeck', prompt: `${choice.source}: you may evolve Eevee with a card from your deck`, options, optional: true };
  }
  if (choice.kind === 'pickFromTop' && choice.shuffleRest) {
    const options = player.deck.filter((c) => choice.looked.includes(c.uid));
    return { kind: 'pickFromDeck', prompt: `${choice.source}: put one of these cards into your hand; the rest are shuffled back`, options };
  }
  if (choice.kind === 'pickFromTop') {
    const options = player.deck.filter((c) => choice.looked.includes(c.uid));
    const left = choice.take > 1 ? ` (${choice.take} left)` : '';
    if (choice.basicEnergy) {
      const energy = options.filter((c) => isBasicEnergy(lookupCard(state.cards, c.defId)));
      return { kind: 'pickFromDeck', prompt: `${choice.source}: you may take any of the basic Energy cards among the top cards of your deck (shown to your opponent), one at a time; the rest are shuffled back`, options: energy, optional: true };
    }
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
    const many = choice.max ? `up to ${choice.max}` : 'any number of';
    return { kind: 'pickFromHand', prompt: `${choice.source}: discard ${many} cards from your hand, then draw as many${so}`, options: player.hand, optional: true };
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
    const attack = attacker.active && usableAttacks(attacker.active, state.cards, { recall: recallsAttacks(state, attacker), bench: attacker.bench, defender: player.active, oppBench: player.bench })[choice.attackIndex]?.attack.name;
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
    const options = player.hand.filter((c) => attachableFromHand(state.cards, c, choice.type, choice.basic));
    const to = choice.target === undefined || choice.target === 'active' ? 'your Active Pokémon' : cardName(state, player.bench[choice.target]!.card);
    return { kind: 'pickFromHand', prompt: `${choice.source}: you may attach up to ${choice.count} ${choice.type ? `${typeName(choice.type)} ` : ''}Energy card${choice.count === 1 ? '' : 's'} from your hand to ${to}`, options, optional: true };
  }
  if (choice.kind === 'removeEach' || choice.kind === 'drainEnergy') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const target = choice.kind === 'drainEnergy' ? 'active' : choice.targets[0]!;
    const p = (target === 'active' ? opp.active : opp.bench[target])!;
    const what =
      choice.kind === 'removeEach' && choice.toHand
        ? "return an Energy card to your opponent's hand from their"
        : choice.kind === 'removeEach' && choice.toDeck
          ? "shuffle an Energy card into your opponent's deck from their"
          : "discard an Energy card from your opponent's";
    return { kind: 'pickAttached', prompt: `${choice.source}: ${what} ${lookupCard(state.cards, p.card.defId).name}`, options: p.energy.filter((e) => !e.provides) };
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
  if (choice.kind === 'lookOppDeck' && choice.prizes) {
    const cards = state.players[choice.own ? choice.player : opponentOfChoice(state, choice)]!.prizes.slice(0, choice.count);
    return { kind: 'oppHand', prompt: `${choice.source}: ${cards.length} of ${choice.own ? 'your' : "your opponent's"} Prize cards (they stay where they are)`, cards, options: [] };
  }
  if (choice.kind === 'lookOppDeck') {
    const cards = state.players[choice.own ? choice.player : opponentOfChoice(state, choice)]!.deck.slice(0, choice.count);
    return { kind: 'oppHand', prompt: `${choice.source}: the top ${cards.length} cards of ${choice.own ? 'your' : "your opponent's"} deck, top first (they go back in this order)`, cards, options: [] };
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
      : choice.filter === 'basicNotBaby'
        ? 'a Basic Pokémon (not a Baby Pokémon)'
      : choice.filter === 'energy'
        ? 'an Energy card'
      : choice.filter === 'toolOrMachine'
        ? 'a Pokémon Tool or Technical Machine card'
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
      : choice.filter === 'tool'
        ? 'a Pokémon Tool card'
      : choice.filter === 'supporter'
        ? 'a Supporter card'
      : choice.filter === 'supporterOrStadium'
        ? 'a Supporter or Stadium card'
      : choice.filter === 'ballTrainer'
        ? 'a Trainer card with Ball in its name'
      : choice.filter === 'pokemonType'
        ? `a Baby, Basic or Evolution card of the ${typeName(choice.type!)} type`
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
  if (choice.filter === 'basicNotBaby') return isBasicPokemon(d) && d.kind === 'pokemon' && !d.baby;
  if (choice.filter === 'evolution') return isPokemonCard(d) && d.stage !== 'basic';
  if (choice.filter === 'darkEvolution') return isPokemonCard(d) && d.stage !== 'basic' && /\bDark\b/.test(d.name);
  if (choice.filter === 'named') return isPokemonCard(d) && [choice.name].flat().includes(d.name);
  if (choice.filter === 'ownerBasic') return isBasicPokemon(d) && d.name.includes(String(choice.name));
  if (choice.filter === 'ownerPokemon') return isPokemonCard(d) && d.name.includes(String(choice.name));
  if (choice.filter === 'trainer') return isTrainerCard(d);
  if (choice.filter === 'trainerNamed') return isTrainerCard(d) && d.name === choice.name;
  if (choice.filter === 'pokemonNotNamed') return isPokemonCard(d) && d.name !== choice.name;
  if (choice.filter === 'evolvesFrom') return d.kind === 'pokemon' && !d.trainerText && d.evolvesFrom === choice.name;
  if (choice.filter === 'tool') return d.kind === 'trainer' && !!trainerEffect(c.defId)?.tool;
  if (choice.filter === 'energy') return d.kind === 'energy';
  if (choice.filter === 'toolOrMachine') return d.kind === 'trainer' && (!!trainerEffect(c.defId)?.tool || !!trainerEffect(c.defId)?.technicalMachine);
  if (choice.filter === 'supporter') return d.kind === 'trainer' && !!trainerEffect(c.defId)?.supporter;
  if (choice.filter === 'supporterOrStadium') return d.kind === 'trainer' && (!!trainerEffect(c.defId)?.supporter || !!trainerEffect(c.defId)?.stadium);
  if (choice.filter === 'ballTrainer') return isTrainerCard(d) && /\bBall\b/.test(d.name);
  if (choice.filter === 'pokemonType') return isPokemonCard(d) && d.type === choice.type;
  return choice.filter === 'any' || (d.kind === 'pokemon' && !d.trainerText);
};

const discardOptions = (player: PlayerState, choice: Extract<PendingChoice, { kind: 'pickFromDiscard' }>) => player.discard.filter((c) => c.uid !== choice.excludeUid);

/** Whether a card in the opponent's hand can be chosen (Sneak Attack: a Trainer card; Carry Off: a Pokémon card; Sudden Swipe: an Energy card). */
const oppHandFits = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'oppHandTrainer' }>, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return choice.any || (choice.filter === 'pokemon' ? isPokemonCard(d) : choice.filter === 'energy' ? d.kind === 'energy' : isTrainerCard(d));
};

/** Whether a card in the discard pile can go back into the deck (Fish Out: a Pokémon card; Energy Recycle: a basic Energy card). */
const toDeckFits = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'discardToDeck' }>, c: CardInstance) =>
  choice.filter === 'basicEnergy' ? isBasicEnergy(lookupCard(cards, c.defId)) : isPokemonCard(lookupCard(cards, c.defId));

const SKYRIDGE_KINDS = ['mayUse', 'attachFromDiscard', 'discardToBench', 'moveAttached', 'oracle', 'bottomPick', 'evolveFromHand', 'mysteryZone', 'placeCounters'] as const;

/** A pending choice Skyridge's cards add (skyridgeView, resolveSkyridge). */
type SkyridgeChoice = Extract<PendingChoice, { kind: (typeof SKYRIDGE_KINDS)[number] }>;

const isSkyridge = (choice: PendingChoice): choice is SkyridgeChoice => (SKYRIDGE_KINDS as readonly string[]).includes(choice.kind);

/** Basic Energy cards in the discard pile. */
const basicEnergyIn = (cards: CardLibrary, pile: CardInstance[]) => pile.filter((c) => isBasicEnergy(lookupCard(cards, c.defId)));

/** Cards in the discard pile `discardToBench` can put onto the Bench. */
const toBenchFits = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'discardToBench' }>, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  if (choice.filter === 'fossil') return d.kind === 'pokemon' && !d.trainerText && (d.name === 'Omanyte' || d.name === 'Kabuto');
  return isBasicPokemon(d) && d.kind === 'pokemon' && !d.baby;
};

/** Basic Energy cards on the player's Pokémon other than `to` (Attract Energy). */
const otherBasicEnergy = (state: GameState, me: PlayerState, to: InPlayPokemon) =>
  [me.active, ...me.bench].flatMap((p) => (p && p !== to ? p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId))) : []));

const atTarget = (player: Pick<PlayerState, 'active' | 'bench'>, t: Target) => (t === 'active' ? player.active : player.bench[t]) ?? null;

/** The views of the pending choices Skyridge's cards add. */
function skyridgeView(state: GameState, choice: SkyridgeChoice): PendingChoiceView {
  const player = state.players[choice.player]!;
  const cardName = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
  const sorted = (cards: CardInstance[]) => [...cards].sort((a, b) => cardName(a).localeCompare(cardName(b)) || a.uid.localeCompare(b.uid));
  switch (choice.kind) {
    case 'mayUse': {
      const text = {
        energyRecharge: 'flip 3 coins? For each heads, a basic Energy card from your discard pile is attached to Arcanine',
        flameVapor: 'flip 2 coins? For each heads, an Energy card attached to the Defending Pokémon is discarded',
        streamingMantle: 'discard the top 3 cards of your deck, then shuffle 3 basic Energy cards from your discard pile into it? Your opponent does the same',
        retroEnergy: 'remove up to 2 damage counters from that Pokémon and discard its top card (devolving it)?',
      }[choice.power];
      return { kind: 'options', prompt: `${choice.source}: ${text}`, labels: ['Yes', 'No'] };
    }
    case 'attachFromDiscard': {
      const to = choice.target === undefined ? 'one of your Pokémon' : cardName(atTarget(player, choice.target)!.card);
      const left = choice.count > 1 ? ` (${choice.count} left)` : '';
      return { kind: 'pickFromDiscard', prompt: `${choice.source}: choose a basic Energy card from your discard pile to attach to ${to}${left}`, options: basicEnergyIn(state.cards, player.discard) };
    }
    case 'discardToBench': {
      const what = choice.filter === 'fossil' ? 'an Omanyte or Kabuto card' : 'a Basic Pokémon (not a Baby Pokémon)';
      return { kind: 'pickFromDiscard', prompt: `${choice.source}: you may put ${what} from your discard pile onto your Bench`, options: player.discard.filter((c) => toBenchFits(state.cards, choice, c)), optional: true };
    }
    case 'moveAttached': {
      const to = atTarget(player, choice.target);
      return { kind: 'pickAttached', prompt: `${choice.source}: you may move basic Energy cards from your other Pokémon to ${to ? cardName(to.card) : 'it'}, one at a time`, options: to ? otherBasicEnergy(state, player, to) : [], optional: true };
    }
    case 'oracle': {
      const left = 2 - choice.picked.length;
      return { kind: 'pickFromDeck', prompt: `${choice.source}: choose ${left} card${left === 1 ? '' : 's'} from your deck to put on top`, options: sorted(player.deck.filter((c) => !choice.picked.includes(c.uid))) };
    }
    case 'bottomPick': {
      const left = choice.take > 1 ? ` (${choice.take} left)` : '';
      return { kind: 'pickFromDeck', prompt: `${choice.source}: put one of the bottom cards of your deck into your hand${left}; the rest go back to the bottom`, options: player.deck.filter((c) => choice.looked.includes(c.uid)) };
    }
    case 'evolveFromHand': {
      const p = atTarget(player, choice.target);
      const options = p ? player.hand.filter((c) => choice.names.includes(cardName(c)) && isPokemonCard(lookupCard(state.cards, c.defId)) && evolvesOnto(lookupCard(state.cards, c.defId) as PokemonCardDef, lookupCard(state.cards, p.card.defId))) : [];
      return { kind: 'pickFromHand', prompt: `${choice.source}: choose a card from your hand to put onto ${p ? cardName(p.card) : 'it'}`, options };
    }
    case 'mysteryZone':
      return { kind: 'pickFromHand', prompt: `${choice.source}: put an Evolution card from your hand into your deck (then a basic Energy card from your deck goes into your hand)`, options: player.hand.filter((c) => isEvolutionCard(state.cards, c)) };
    case 'placeCounters': {
      const opp = state.players[opponentOfChoice(state, choice)]!;
      const left = choice.count > 1 ? ` (${choice.count} left)` : '';
      return { kind: 'oppPokemon', prompt: `${choice.source}: click one of your opponent's Benched Pokémon to put a damage counter on${left}`, options: opp.bench.flatMap((p, i) => (p ? [i] : [])) };
    }
  }
}

const isEvolutionCard = (cards: CardLibrary, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return isPokemonCard(d) && d.stage !== 'basic';
};

/** Evolves `p` with `card` (from the hand or deck, by an effect): as playing an Evolution card does, without the usual limits. */
export function evolveWith(state: GameState, owner: PlayerState, p: InPlayPokemon, card: CardInstance, from: string) {
  addLog(state, `Evolved ${lookupCard(state.cards, p.card.defId).name} into ${lookupCard(state.cards, card.defId).name} ${from}.`, owner.id);
  p.evolvedFrom.push(p.card);
  p.card = card;
  p.playedTurn = state.turn;
  clearOnLeavingActive(p);
  evolvedHook(state, owner.id, p);
}

/** Answers the pending choices Skyridge's cards add. */
function resolveSkyridge(state: GameState, me: PlayerState, choice: SkyridgeChoice, answer: { cardUid?: string; order?: string[]; target?: Target; count?: number }): string | null {
  const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
  const opp = state.players[opponentOfChoice(state, choice)]!;
  const view = skyridgeView(state, choice);
  const picked = 'options' in view && view.kind !== 'oppPokemon' ? (view.options as CardInstance[]).find((c) => c.uid === answer.cardUid) : undefined;
  delete state.pendingChoice;
  const again = (next: PendingChoice) => {
    state.pendingChoice = next;
    return null;
  };
  switch (choice.kind) {
    case 'mayUse': {
      if (answer.count !== 0 && answer.count !== 1) return again(choice) ?? 'Yes or no';
      const p = atTarget(me, choice.target);
      if (answer.count === 1 || !p) return null;
      if (choice.power === 'energyRecharge') {
        let heads = 0;
        for (let i = 0; i < 3; i++) if (flipCoin(state, choice.source, me.id)) heads++;
        if (heads && basicEnergyIn(state.cards, me.discard).length) return again({ player: me.id, source: choice.source, kind: 'attachFromDiscard', count: heads, target: choice.target });
      } else if (choice.power === 'flameVapor') {
        let heads = 0;
        for (let i = 0; i < 2; i++) if (flipCoin(state, choice.source, me.id)) heads++;
        const energy = opp.active?.energy.filter((e) => !e.provides).length ?? 0;
        if (Math.min(heads, energy)) return again({ player: me.id, source: choice.source, kind: 'removeEach', targets: Array<Target>(Math.min(heads, energy)).fill('active') });
      } else if (choice.power === 'streamingMantle') {
        for (const player of [me, opp]) {
          const top = player.deck.splice(0, 3);
          player.discard.push(...top);
          // The last 3 basic Energy cards discarded go back (agreed reading: the player doesn't choose which).
          const back = basicEnergyIn(state.cards, player.discard).slice(-3);
          player.discard = player.discard.filter((c) => !back.includes(c));
          [player.deck, state.rngState] = shuffle([...player.deck, ...back], state.rngState);
          addLog(state, `${choice.source}: discarded the top ${top.length} cards of the deck and shuffled ${back.length} basic Energy cards into it.`, player.id);
        }
      } else {
        // Retro Energy: up to 2 damage counters off, then its top card is discarded.
        const healed = Math.min(20, p.damage);
        p.damage -= healed;
        const top = p.card;
        if (p.evolvedFrom.length) {
          p.card = p.evolvedFrom.pop()!;
          me.discard.push(top);
          clearOnLeavingActive(p);
        }
        addLog(state, `${choice.source}: removed ${healed / 10} damage counters and discarded ${name(top)}; it's ${name(p.card)} again.`, me.id);
      }
      return null;
    }
    case 'attachFromDiscard': {
      if (!picked) return view.kind === 'pickFromDiscard' && view.options.length ? again(choice) ?? 'Choose a basic Energy card from your discard pile' : null;
      me.discard = me.discard.filter((c) => c !== picked);
      if (choice.target === undefined) return again({ player: me.id, source: choice.source, kind: 'attachCard', card: picked, ...(choice.afterAttack && { afterAttack: true }) });
      const p = atTarget(me, choice.target);
      if (!p) return null;
      p.energy.push(picked);
      addLog(state, `${choice.source}: attached ${name(picked)} from the discard pile to ${name(p.card)}.`, me.id);
      if (choice.count > 1 && basicEnergyIn(state.cards, me.discard).length) return again({ ...choice, count: choice.count - 1 });
      return null;
    }
    case 'discardToBench': {
      if (!picked) return null;
      const slot = openBenchSlot(me.bench, state.cards, state.stadium?.card);
      if (slot < 0) return again(choice) ?? 'Your Bench is full';
      me.discard = me.discard.filter((c) => c !== picked);
      me.bench[slot] = { card: picked, evolvedFrom: [], damage: 0, energy: [], playedTurn: state.turn };
      addLog(state, `${choice.source}: put ${name(picked)} from the discard pile onto the Bench.`, me.id);
      if (!choice.manipulate) return null;
      let heads = 0;
      for (let i = 0; i < 3; i++) if (flipCoin(state, choice.source, me.id)) heads++;
      if (heads && basicEnergyIn(state.cards, me.discard).length) return again({ player: me.id, source: choice.source, kind: 'attachFromDiscard', count: heads, target: slot });
      return null;
    }
    case 'moveAttached': {
      const to = atTarget(me, choice.target);
      if (!picked || !to) return null;
      const from = [me.active, ...me.bench].find((p) => p?.energy.includes(picked))!;
      from.energy = from.energy.filter((e) => e !== picked);
      to.energy.push(picked);
      addLog(state, `${choice.source}: moved ${name(picked)} from ${name(from.card)} to ${name(to.card)}.`, me.id);
      return otherBasicEnergy(state, me, to).length ? again(choice) : null;
    }
    case 'oracle': {
      if (!picked) return view.kind === 'pickFromDeck' && view.options.length ? again(choice) ?? 'Choose a card from your deck' : null;
      const chosen = [...choice.picked, picked.uid];
      if (chosen.length < 2 && me.deck.length > chosen.length) return again({ ...choice, picked: chosen });
      const top = chosen.map((uid) => me.deck.find((c) => c.uid === uid)!);
      [me.deck, state.rngState] = shuffle(me.deck.filter((c) => !top.includes(c)), state.rngState);
      me.deck.unshift(...top);
      addLog(state, `${choice.source}: put ${top.length} chosen cards on top of the shuffled deck.`, me.id);
      if (top.length > 1) return again({ player: me.id, source: choice.source, kind: 'arrangeTop', count: top.length });
      return null;
    }
    case 'bottomPick': {
      if (!picked) return view.kind === 'pickFromDeck' && view.options.length ? again(choice) ?? 'Choose one of the cards' : null;
      me.deck = me.deck.filter((c) => c !== picked);
      me.hand.push(picked);
      addLog(state, `${choice.source}: put a card from the bottom of the deck into the hand.`, me.id);
      if (choice.take > 1 && me.deck.some((c) => choice.looked.includes(c.uid))) return again({ ...choice, take: choice.take - 1 });
      return null;
    }
    case 'evolveFromHand': {
      const p = atTarget(me, choice.target);
      if (!picked || !p) return view.kind === 'pickFromHand' && view.options.length ? again(choice) ?? 'Choose a card from your hand' : null;
      me.hand = me.hand.filter((c) => c !== picked);
      evolveWith(state, me, p, picked, 'from the hand');
      return null;
    }
    case 'mysteryZone': {
      if (!picked) return view.kind === 'pickFromHand' && view.options.length ? again(choice) ?? 'Choose an Evolution card from your hand' : null;
      me.hand = me.hand.filter((c) => c !== picked);
      me.deck.push(picked);
      addLog(state, `${choice.source}: put ${name(picked)} from the hand into the deck.`, me.id);
      if (me.deck.some((c) => isBasicEnergy(lookupCard(state.cards, c.defId)))) return again({ player: me.id, source: choice.source, kind: 'pickFromDeck', filter: 'basicEnergy', reveal: true });
      [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
      return null;
    }
    case 'placeCounters': {
      const p = typeof answer.target === 'number' ? opp.bench[answer.target] : null;
      if (!p) return again(choice) ?? "Choose one of your opponent's Benched Pokémon";
      p.damage += 10;
      addLog(state, `${choice.source}: put a damage counter on ${name(p.card)}.`, opp.id);
      if (choice.count > 1) return again({ ...choice, count: choice.count - 1 });
      return null;
    }
    default:
      return null;
  }
}

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

/** Evolutionary Spore: the player's Pokémon this deck card can evolve (by name and stage), named one of `names`, not evolved by it yet. */
export function sporeTargets(state: Pick<GameState, 'players' | 'cards'>, choice: Extract<PendingChoice, { kind: 'evolveMany' }>, c: CardInstance): Target[] {
  const d = lookupCard(state.cards, c.defId);
  const player = state.players[choice.player]!;
  if (!isPokemonCard(d) || d.stage === 'basic') return [];
  return targetsOf(player).filter((t) => {
    const p = (t === 'active' ? player.active : player.bench[t])!;
    const from = lookupCard(state.cards, p.card.defId);
    if (p.faceDown || shapeshiftCard(p) || choice.done.includes(baseUid(p)) || !choice.names.includes(from.name)) return false;
    return from.kind === 'pokemon' && from.name === d.evolvesFrom && from.stage === (d.stage === 'stage2' ? 'stage1' : 'basic');
  });
}

/** Where a card found in the deck may be attached (attachCard): any of the player's Pokémon, or those `only` allows. */
const attachTargets = (state: Pick<GameState, 'players' | 'cards'>, choice: Extract<PendingChoice, { kind: 'attachCard' }>) => {
  const player = state.players[choice.player]!;
  return targetsOf(player).filter((t) => {
    const d = inPlayDef(state.cards, (t === 'active' ? player.active : player.bench[t])!);
    return (!choice.only?.type || d.type === choice.only.type) && (!choice.only?.name || d.name.includes(choice.only.name)) && (!choice.only?.bench || t !== 'active');
  });
};

/** [Vanish]: the player's Pokémon with Unown in their names it may return, but the Unown V itself and any Unown [V]. */
const unownTargets = (state: Pick<GameState, 'players' | 'cards'>, choice: Extract<PendingChoice, { kind: 'returnUnown' }>) => {
  const player = state.players[choice.player]!;
  return targetsOf(player).filter((t) => {
    const p = (t === 'active' ? player.active : player.bench[t])!;
    const name = inPlayDef(state.cards, p).name;
    return p.card.uid !== choice.except && name.includes('Unown') && name !== 'Unown [V]';
  });
};

/** Where Energy Bomb's (benched Pokémon) or Howl's (any of the player's Pokémon of `toType`) Energy cards may go. */
const distributeTargets = (state: Pick<GameState, 'cards'>, player: Pick<PlayerState, 'active' | 'bench'>, choice: Extract<PendingChoice, { kind: 'distributeEnergy' }>) =>
  choice.toType ? targetsOf(player).filter((t) => inPlayDef(state.cards, (t === 'active' ? player.active : player.bench[t])!).type === choice.toType) : player.bench.flatMap((p, i) => (p ? [i] : []));

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

/**
 * Evolutionary Spore: the player's Pokémon at `target` evolves into `card` from the deck (it counts as evolving), and the
 * search goes on for the others while the deck has a card for one of them; then the deck is shuffled.
 */
function evolveBySpore(state: GameState, me: PlayerState, choice: Extract<PendingChoice, { kind: 'evolveMany' }>, target: Target, card: CardInstance): null {
  const p = (target === 'active' ? me.active : me.bench[target])!;
  addLog(state, `Evolved ${cardName(state, p.card)} into ${cardName(state, card)} with a card from the deck.`, me.id);
  const done = [...choice.done, baseUid(p)];
  p.evolvedFrom.push(p.card);
  p.card = card;
  p.playedTurn = state.turn;
  clearOnLeavingActive(p);
  evolvedHook(state, me.id, p);
  const { card: _, ...rest } = choice;
  const next = { ...rest, done };
  if (!choice.once && me.deck.some((c) => sporeTargets(state, next, c).length)) {
    state.pendingChoice = next;
    return null;
  }
  return finishEvolveMany(state, me, choice, true);
}

/** The end of an `evolveMany` search: the deck is shuffled, then the next player (`then`) may search too (Evolution Song). */
function finishEvolveMany(state: GameState, me: PlayerState, choice: Extract<PendingChoice, { kind: 'evolveMany' }>, evolved = false): null {
  [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
  delete state.pendingChoice;
  const next = choice.then ? state.players[choice.then] : undefined;
  const theirs = next && { player: next.id, source: choice.source, kind: 'evolveMany' as const, names: choice.thenNames ?? [], done: [], once: true, ...(choice.afterAttack && { afterAttack: true }) };
  if (next && theirs && next.deck.some((c) => sporeTargets(state, theirs, c).length)) state.pendingChoice = theirs;
  if (evolved && !state.pendingChoice) offerChainReaction(state, undefined, choice.afterAttack);
  return null;
}

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

/**
 * Howl: the top 5 cards of the player's deck are discarded, and the Fire Energy cards among them go to their Fire Pokémon,
 * one at a time (the player picks which); then the turn ends.
 */
function howl(state: GameState, me: PlayerState, source: string) {
  const gone = me.deck.splice(0, 5);
  me.discard.push(...gone);
  addLog(state, `${source}: discarded ${gone.map((c) => cardName(state, c)).join(', ') || 'nothing'} from the deck.`, me.id);
  const fire = gone.filter((c) => isBasicEnergyOf(state.cards, c, 'fire'));
  const choice = { player: me.id, source, kind: 'distributeEnergy', cards: fire, toType: 'fire', afterAttack: true } as const;
  if (fire.length && distributeTargets(state, me, { ...choice, cards: [...fire] }).length) {
    me.discard = me.discard.filter((c) => !fire.includes(c));
    state.pendingChoice = { ...choice, cards: fire };
  } else state.endTurnNow = true;
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
  if (isSkyridge(choice)) return resolveSkyridge(state, me, choice, answer);
  if (choice.kind === 'discardToHand') {
    if (answer.cardUid !== undefined) {
      const card = me.discard.find((c) => c.uid === answer.cardUid && c.uid !== choice.excludeUid && discardToHandFits(state.cards, c, choice.filter));
      if (!card) return 'Choose one of the cards from your discard pile';
      me.discard = me.discard.filter((c) => c !== card);
      me.hand.push(card);
      addLog(state, `Put ${name(card)} from the discard pile into the hand.`, me.id);
      if (choice.count > 1 && me.discard.some((c) => discardToHandFits(state.cards, c, choice.filter))) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
    // Then the other player may do the same (Searchlight, Mysterious Wing).
    const next = choice.then ? state.players[choice.then] : undefined;
    if (next && next.discard.some((c) => discardToHandFits(state.cards, c, choice.filter))) {
      const { then: _, excludeUid: _x, ...same } = choice;
      state.pendingChoice = { ...same, player: next.id };
      return null;
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
    if (choice.power === 'howl') {
      howl(state, me, choice.source);
      return null;
    }
    const heads = flipCoin(state, choice.source, me.id);
    // Softboiled: 8 damage counters on heads, 4 on tails (all of them, if fewer).
    if (choice.power === 'softboiled') {
      const healed = Math.min(heads ? 80 : 40, p.damage);
      p.damage -= healed;
      if (healed) addLog(state, `Softboiled: ${name(p.card)} healed ${healed} damage.`, me.id);
      return null;
    }
    if (!heads) return null;
    // [Vanish]: then which of the player's other Unown goes back to the hand.
    if (choice.power === 'vanish') {
      const next = { player: me.id, source: choice.source, kind: 'returnUnown', except: p.card.uid } as const;
      if (unownTargets(state, next).length) state.pendingChoice = next;
      else addLog(state, `${choice.source}: no other Pokémon with Unown in its name to return.`, me.id);
      return null;
    }
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
  } else if (choice.kind === 'oppHandTrainer' && choice.count !== undefined) {
    // Dark Moon: up to `count` cards, one at a time; then the opponent draws as many as were shuffled away.
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const card = opp.hand.find((c) => c.uid === answer.cardUid);
    if (answer.cardUid !== undefined && !card) return "Choose a card from your opponent's hand";
    const taken = (choice.taken ?? 0) + (card ? 1 : 0);
    if (card) {
      opp.hand = opp.hand.filter((c) => c !== card);
      [opp.deck, state.rngState] = shuffle([...opp.deck, card], state.rngState);
      addLog(state, `${choice.source}: shuffled ${name(card)} into the deck.`, opp.id);
      if (choice.count > 1 && opp.hand.length) {
        state.pendingChoice = { ...choice, count: choice.count - 1, taken };
        return null;
      }
    }
    if (taken) {
      const drawn = opp.deck.splice(0, taken);
      opp.hand.push(...drawn);
      addLog(state, `${choice.source}: drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, opp.id);
    }
  } else if (choice.kind === 'revealEnergy') {
    const energy = me.hand.find((c) => c.uid === answer.cardUid && isBasicEnergy(lookupCard(state.cards, c.defId)));
    if (!energy) return 'Choose a basic Energy card from your hand';
    const type = (lookupCard(state.cards, energy.defId) as { energyType: EnergyType }).energyType;
    addLog(state, `${choice.source}: showed ${name(energy)}.`, me.id);
    if (me.deck.some((c) => { const d = lookupCard(state.cards, c.defId); return isBasicPokemon(d) && d.kind === 'pokemon' && d.type === type; })) {
      state.pendingChoice = { player: me.id, source: choice.source, kind: 'pickFromDeck', filter: 'basicType', type, toBench: true };
      return null;
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    addLog(state, `${choice.source}: no Basic Pokémon of that type in the deck.`, me.id);
  } else if (choice.kind === 'powerPlant') {
    const energy = me.hand.find((c) => c.uid === answer.cardUid && isBasicEnergy(lookupCard(state.cards, c.defId)));
    if (!energy) return 'Choose a basic Energy card from your hand';
    me.hand = me.hand.filter((c) => c !== energy);
    me.discard.push(energy);
    addLog(state, `${choice.source}: discarded ${name(energy)}.`, me.id);
    state.pendingChoice = { player: me.id, source: choice.source, kind: 'discardToHand', count: 1, filter: 'basicEnergy', reveal: true };
    return null;
  } else if (choice.kind === 'devolveOwn') {
    const p = answer.target === undefined ? null : answer.target === 'active' ? me.active : me.bench[answer.target];
    if (!p?.evolvedFrom.length) return 'Choose one of your Evolved Pokémon';
    const top = p.card;
    p.card = p.evolvedFrom.pop()!;
    me.discard.push(top);
    // As if it had evolved: Special Conditions and attack effects end. A Knock Out is handled after.
    clearOnLeavingActive(p);
    addLog(state, `${choice.source}: discarded ${name(top)}; it's ${name(p.card)} again.`, me.id);
  } else if (choice.kind === 'pickFromTop' && choice.shuffleRest) {
    const picked = me.deck.find((c) => c.uid === answer.cardUid && choice.looked.includes(c.uid));
    if (!picked && me.deck.some((c) => choice.looked.includes(c.uid))) return 'Choose one of the cards';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      me.hand.push(picked);
      addLog(state, 'Put a card into the hand.', me.id);
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
  } else if (choice.kind === 'oppHandTrainer') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const trainers = opp.hand.filter((c) => oppHandFits(state.cards, choice, c));
    const card = trainers.find((c) => c.uid === answer.cardUid);
    if (trainers.length && !card) return `Choose ${choice.any ? 'a card' : choice.filter ? 'one of the cards' : 'a Trainer card'} from your opponent's hand`;
    if (card) {
      opp.hand = opp.hand.filter((c) => c !== card);
      [opp.deck, state.rngState] = shuffle([...opp.deck, card], state.rngState);
      addLog(state, `Shuffled ${name(card)} into the deck.`, opp.id);
    } else addLog(state, `Looked at the opponent's hand: no ${choice.any ? 'cards' : choice.filter === 'pokemon' ? 'Pokémon cards' : choice.filter === 'energy' ? 'Energy cards' : 'Trainer cards'}.`, me.id);
  } else if (choice.kind === 'powerDamage') {
    if (answer.target !== undefined) {
      const opp = state.players[state.playerOrder.find((id) => id !== me.id)!]!;
      const p = answer.target === 'active' ? opp.active : opp.bench[answer.target];
      if (!p) return "Choose one of your opponent's Pokémon";
      const damage = choice.noWeakness ? choice.amount : applyWeaknessResistance(choice.amount, choice.type, inPlayDef(state.cards, p), p.effects);
      p.damage += damage;
      addLog(state, `${choice.source}: ${name(p.card)} took ${damage} damage.`, opp.id);
    }
  } else if (choice.kind === 'stadiumFromDiscard') {
    const card = me.discard.find((c) => c.uid === answer.cardUid && !!trainerEffect(c.defId)?.stadium);
    if (!card && me.discard.some((c) => !!trainerEffect(c.defId)?.stadium)) return 'Choose a Stadium card from your discard pile';
    if (card) {
      me.discard = me.discard.filter((c) => c !== card);
      const old = state.stadium;
      if (old) {
        state.players[old.owner]!.discard.push(old.card);
        addLog(state, `${name(old.card)} was discarded.`, old.owner);
      }
      state.stadium = { card, owner: me.id };
      delete state.stadiumUsedTurn;
      addLog(state, `Put ${name(card)} from the discard pile into play.`, me.id);
    }
  } else if (choice.kind === 'oppHandToActive') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const slot = openBenchSlot(opp.bench, state.cards, state.stadium?.card);
    const options = slot >= 0 ? opp.hand.filter((c) => isBasicPokemon(lookupCard(state.cards, c.defId))) : [];
    const card = options.find((c) => c.uid === answer.cardUid);
    if (options.length && !card) return "Choose a Baby or Basic Pokémon from your opponent's hand";
    if (card) {
      opp.hand = opp.hand.filter((c) => c !== card);
      opp.bench[slot] = { card, evolvedFrom: [], damage: 0, energy: [], playedTurn: state.turn };
      addLog(state, `${name(card)} was put onto the Bench.`, opp.id);
      swapActive(state, opp, slot);
    }
  } else if (choice.kind === 'returnUnown') {
    const target = answer.target;
    if (target === undefined || !unownTargets(state, choice).includes(target)) return 'Choose one of your other Pokémon with Unown in its name';
    if (target === 'active' && activeLocked(state, me.id)) return activeLocked(state, me.id)!;
    const p = (target === 'active' ? me.active : me.bench[target])!;
    me.hand.push(...p.evolvedFrom, p.card);
    me.discard.push(...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card));
    if (target === 'active') me.active = null;
    else me.bench[target] = null;
    addLog(state, `${name(p.card)} returned to the hand; its cards were discarded.`, me.id);
  } else if (choice.kind === 'invention') {
    if (answer.count !== 0 && answer.count !== 1) return 'Choose one of the two';
    const opp = state.players[opponentOfChoice(state, choice)]!;
    if (answer.count === 0) {
      const n = opp.prizes.length;
      [opp.deck, state.rngState] = shuffle([...opp.deck, ...opp.prizes], state.rngState);
      opp.prizes = opp.deck.splice(0, n);
      delete opp.faceUpPrizes;
      addLog(state, `${choice.source}: the ${n} Prize cards were shuffled into the deck, and ${n} new ones set aside.`, opp.id);
    } else addLog(state, `${choice.source}: the Prize cards stay.`, me.id);
  } else if (choice.kind === 'cunning') {
    if (answer.count !== 0 && answer.count !== 1) return 'Choose one of the two';
    const opp = state.players[opponentOfChoice(state, choice)]!;
    if (answer.count === 0) {
      [opp.deck, state.rngState] = shuffle(opp.deck, state.rngState);
      addLog(state, `${choice.source}: shuffled the deck.`, opp.id);
    }
  } else if (choice.kind === 'discardToDeck') {
    if (answer.cardUid !== undefined) {
      const card = me.discard.find((c) => c.uid === answer.cardUid && toDeckFits(state.cards, choice, c));
      if (!card) return choice.filter ? 'Choose a basic Energy card from your discard pile' : 'Choose a Baby, Basic or Evolution card from your discard pile';
      me.discard = me.discard.filter((c) => c !== card);
      me.deck.push(card);
      addLog(state, `${choice.source}: ${name(card)} goes back into the deck.`, me.id);
      if (choice.count > 1 && me.discard.some((c) => toDeckFits(state.cards, choice, c))) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    // Then the other player may do the same.
    const next = choice.then ? state.players[choice.then] : undefined;
    if (next && next.discard.some((c) => isPokemonCard(lookupCard(state.cards, c.defId)))) {
      state.pendingChoice = { player: next.id, source: choice.source, kind: 'discardToDeck', count: choice.of, of: choice.of, ...(choice.afterAttack && { afterAttack: true }) };
      return null;
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
    // Time Shard ("up to"): nothing chosen, and it's done.
    if (choice.optional && answer.cardUid === undefined) {
      delete state.pendingChoice;
      return null;
    }
    const energy = p.energy.find((e) => e.uid === answer.cardUid && (!choice.toHand || (!e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))));
    if (!energy) return choice.toHand ? 'Choose a basic Energy card' : 'Choose an Energy card to discard';
    p.energy = p.energy.filter((e) => e !== energy);
    if (choice.toHand) {
      me.hand.push(energy);
      addLog(state, `Returned ${name(energy)} from ${name(p.card)} to the hand.`, me.id);
      // Time Shard: up to `count`, asked again while there are basic Energy cards left.
      const left = (choice.count ?? 1) - 1;
      if (left > 0 && p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))) {
        state.pendingChoice = { ...choice, count: left };
        return null;
      }
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
    const ok = answer.target !== undefined && distributeTargets(state, me, choice).includes(answer.target);
    const p = ok ? (answer.target === 'active' ? me.active : me.bench[answer.target as number]) : null;
    if (!p) return choice.toType ? `Choose one of your ${typeName(choice.toType)} Pokémon` : 'Choose one of your benched Pokémon';
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
    if (choice.allOrNone && count !== 0 && count !== max) return `Draw ${max} cards, or none`;
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
  } else if (choice.kind === 'pickFromTop' && choice.basicEnergy) {
    // Flipper Stroke: any number of the basic Energy cards looked at, one at a time, then the rest are shuffled back.
    const energy = me.deck.filter((c) => choice.looked.includes(c.uid) && isBasicEnergy(lookupCard(state.cards, c.defId)));
    const picked = energy.find((c) => c.uid === answer.cardUid);
    if (answer.cardUid !== undefined && !picked) return 'Choose one of the basic Energy cards';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      me.hand.push(picked);
      addLog(state, `Took ${name(picked)} from the deck.`, me.id);
      if (energy.length > 1) return null;
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    const next = choice.then ? state.players[choice.then] : undefined;
    if (next?.deck.length) {
      state.pendingChoice = { player: next.id, source: choice.source, kind: 'pickFromTop', looked: next.deck.slice(0, choice.take).map((c) => c.uid), take: choice.take, basicEnergy: true, ...(choice.afterAttack && { afterAttack: true }) };
      return null;
    }
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
      if (me.hand.length && (choice.max === undefined || discarded < choice.max)) {
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
      const card = me.hand.find((c) => c.uid === answer.cardUid && attachableFromHand(state.cards, c, choice.type, choice.basic));
      const to = choice.target === undefined || choice.target === 'active' ? me.active : me.bench[choice.target];
      if (!card || !to) return `Choose ${choice.type ? `a ${typeName(choice.type)}` : 'an'} Energy card from your hand`;
      me.hand = me.hand.filter((c) => c !== card);
      to.energy.push(card);
      addLog(state, `Attached ${name(card)} to ${name(to.card)}.`, me.id);
      if (choice.count > 1 && me.hand.some((c) => attachableFromHand(state.cards, c, choice.type, choice.basic))) {
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
      if (choice.kind === 'removeEach' && choice.toHand) {
        const { converted: _c, windless: _w, ...card } = energy;
        opp.hand.push(card);
        addLog(state, `${choice.source}: returned ${name(energy)} from ${name(p.card)} to the hand.`, opp.id);
      } else if (choice.kind === 'removeEach' && choice.toDeck) {
        const { converted: _c, windless: _w, ...card } = energy;
        [opp.deck, state.rngState] = shuffle([...opp.deck, card], state.rngState);
        addLog(state, `${choice.source}: shuffled ${name(energy)} from ${name(p.card)} into the deck.`, opp.id);
      } else {
        addLog(state, `${choice.source}: discarded ${name(energy)} from ${name(p.card)}.`, opp.id);
        discardTheirEnergy(state, opp, [energy]);
      }
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
    const p = answer.target === undefined || !attachTargets(state, choice).includes(answer.target) ? null : answer.target === 'active' ? me.active : me.bench[answer.target];
    if (!p) return 'Choose one of your highlighted Pokémon';
    p.energy.push(choice.card);
    addLog(state, `Attached ${lookupCard(state.cards, choice.card.defId).name} to ${lookupCard(state.cards, p.card.defId).name}.`, me.id);
    if (choice.next) {
      state.pendingChoice = choice.next;
      return null;
    }
  } else if (choice.kind === 'removeDamage') {
    const options = damagedTargets(me);
    if (options.length && (answer.target === undefined || !options.includes(answer.target))) return 'Choose one of your Pokémon with damage counters';
    const p = answer.target === undefined ? null : answer.target === 'active' ? me.active : me.bench[answer.target];
    if (p) {
      p.damage -= 10;
      addLog(state, `Removed a damage counter from ${lookupCard(state.cards, p.card.defId).name}.`, me.id);
      // More to remove (Strange Scent), while any of the player's Pokémon has damage counters.
      if ((choice.count ?? 1) > 1 && damagedTargets(me).length) {
        state.pendingChoice = { ...choice, count: choice.count! - 1 };
        return null;
      }
    }
  } else if (choice.kind === 'evolveMany') {
    if (!choice.card) {
      const picked = answer.cardUid === undefined ? undefined : me.deck.find((c) => c.uid === answer.cardUid && sporeTargets(state, choice, c).length);
      if (answer.cardUid !== undefined && !picked) return `Choose a card that evolves from one of your ${choice.names.join(' or ')}`;
      if (picked) {
        const targets = sporeTargets(state, choice, picked);
        me.deck = me.deck.filter((c) => c !== picked);
        if (targets.length > 1) {
          state.pendingChoice = { ...choice, card: picked };
          return null;
        }
        return evolveBySpore(state, me, choice, targets[0]!, picked);
      }
    } else {
      if (answer.target === undefined || !sporeTargets(state, choice, choice.card).includes(answer.target)) return `Choose one of your Pokémon that ${cardName(state, choice.card)} evolves from`;
      return evolveBySpore(state, me, choice, answer.target, choice.card);
    }
    return finishEvolveMany(state, me, choice);
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
    const left = (choice.count ?? 1) - 1;
    // The next step: which Pokémon gets the card found; then the search goes on for more (Attract Current).
    if (picked && choice.attach) {
      const next = left > 0 && me.deck.some((c) => deckFilter(state.cards, choice, c)) ? { ...choice, count: left } : undefined;
      state.pendingChoice = { player: me.id, source: choice.source, afterAttack: choice.afterAttack, kind: 'attachCard', card: picked, ...(choice.attachOnly && { only: choice.attachOnly }), ...(next && { next }) };
      return null;
    }
    // More to take (Summon Minions), while there's room and something to find.
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
    // Gift: then the other player may make the same search.
    if (choice.thenSame) {
      const { thenSame, count: _, ...same } = choice;
      state.pendingChoice = { ...same, player: thenSame };
      return null;
    }
  }
  delete state.pendingChoice;
  return null;
}
