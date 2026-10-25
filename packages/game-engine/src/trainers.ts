// Trainer cards: legality, the questions a Trainer asks, and the context Trainer effects run with.
// Card-specific behaviour lives in effects/ (TRAINERS). Searches of hidden cards (the deck) can't
// be answered from a player's view, so those Trainers leave a PendingChoice that only the player
// sees the options of, answered with RESOLVE_CHOICE.
import { applyWeaknessResistance, damageChosenBenched, performCopiedAttack, recallsAttacks, usableAttacks, type AttackChoices } from './attacks.js';
import { conditionProof, hasType, isBasicEnergy, isBasicPokemon, isPokemonCard, isTrainerCard, lookupCard, namesMatch, typeName, type Attack, type CardLibrary, type CardDef, type EnergyType, type PokemonCardDef } from './cards.js';
import { powerEffect, trainerEffect } from './effects/index.js';
import { activeLocked, afflictBetweenTurns, conditionLabel, discardTheirEnergy, discardTool, evolvesOnto, newInPlay, opponentOf, toolOf, type CardInstance, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from './engine.js';
import { nextRandom, shuffle } from './rng.js';
import { conditionFree, offerChainReaction, powerActive, primalLocked, supportersVeiled, trainerProof, trainersBlocked, trainersDusted } from './powers.js';
import { addLog, baseUid, benchRoom, clearOnLeavingActive, clearSpecialConditions, devolvable, effectId, evolvedHook, flipCoin, inPlayDef, isDelta, isDeltaCard, openBenchSlot, removeTopEvolution, shapeshiftCard } from './status.js';

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
  me: Side & Pick<PlayerState, 'hand' | 'noTrainersUntil' | 'supporterTurn' | 'noSupportersUntil' | 'noItemsUntil'>;
  opp: Side;
  deckCount: number;
  cards: CardLibrary;
  turn: number;
  /** The Stadium card in play, if any. */
  stadium: CardInstance | null;
  /** Which of the opponent's Prize cards are face down, by index (Card-Flip Game). */
  oppFaceDownPrizes: number[];
  /** How many Prize cards each player has left (Pow! Hand Extension). Missing = not known. */
  prizes?: { me: number; opp: number };
}

/** Which of the player's Prize cards are face down, by index, from the state or a view (Card-Flip Game). */
export const faceDownPrizes = (count: number, faceUp?: (CardInstance | null)[] | ((i: number) => boolean)) =>
  Array.from({ length: count }, (_, i) => i).filter((i) => !(typeof faceUp === 'function' ? faceUp(i) : faceUp?.[i]));

/** An Energy card Growth may attach from the hand: a basic `type` one, or any Energy card without a type (Sunkern's Growth). */
const attachableFromHand = (cards: CardLibrary, c: CardInstance, type?: EnergyType, basic?: boolean, types?: EnergyType[]) => {
  const d = lookupCard(cards, c.defId);
  // Dark Provide: a Grass or Darkness Energy card, basic or Special.
  if (types) return d.kind === 'energy' && !d.anyType && types.includes(d.energyType);
  return type ? isBasicEnergyOf(cards, c, type) : basic ? isBasicEnergy(d) : d.kind === 'energy';
};

/** A search the player must finish after playing a Trainer or using an attack. Only they see its options. */
export type PendingChoice = {
  player: PlayerId;
  /** Trainer or attack that started it. */
  source: string;
  /** Started by an attack: the turn ends once it's finished. */
  afterAttack?: boolean;
  /** Asked between turns (Team Aqua Belt): the next turn starts once it's finished. */
  betweenTurns?: boolean;
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
        | 'pokemonType'
        | 'ownerBasicOrEnergy'
        | 'basicTypeOrOwner'
        | 'toolOrSecret'
        | 'pokemonNotEx'
        | 'basicNotEx'
        | 'energyNamed'
        | 'darkOrRockets'
        | 'basicMaxHp'
        | 'metalOrDelta'
        | 'holonSupporter'
        | 'typesNotEx'
        | 'deltaPokemon'
        | 'pokemonEx'
        | 'trainerNotSupporter'
        | 'typedEnergy'
        | 'stadium';
      /** 'basicMaxHp': the most HP the Basic Pokémon may have (Holon Mentor). */
      maxHp?: number;
      /** 'typesNotEx': a Pokémon (not a Pokémon-ex) of any of these types (Cry for Help). */
      types?: EnergyType[];
      /**
       * 'basicNamed' and 'named' (a Pokémon card with one of the names: Jellyfish Pod): the names. 'ownerBasic' (Call for
       * Friend) and 'ownerPokemon' (Brock's Training Method): the owner in the card's name, e.g. 'Brock'. 'evolvesFrom'
       * (Omanyte's Fossil): what the card evolves from.
       */
      name?: string | string[];
      type?: EnergyType;
      /** The card goes on top of the deck, once it's shuffled, instead of into the hand (Smooth Over). */
      toTop?: boolean;
      /** The card goes onto the Bench instead of into the hand (Call for Family). */
      toBench?: boolean;
      /** With `toBench`: the new Benched Pokémon is treated as a Basic Pokémon (Influence, Holon Fossil). */
      asBasic?: boolean;
      /** The card found is attached to one of the player's Pokémon, chosen next (Energy Spike), instead of going to the hand. */
      attach?: boolean;
      /** With `attach`: the cards after the first go to the same Pokémon (Bursting Up). */
      attachSame?: boolean;
      /** With `attach`: only to one of these (attachCard's `only`). */
      attachOnly?: { type?: EnergyType; name?: string; bench?: boolean; notEx?: boolean };
      /** The card found is attached to the player's Active Pokémon, the attacker (Recharge), instead of going to the hand. */
      attachToActive?: boolean;
      /** The card found is attached to this Pokémon of the player's (Fire Boost), instead of going to the hand. */
      attachTo?: Target;
      /** A Pokémon Tool found may be attached to one of the player's Pokémon instead of going to the hand (Mining). */
      toolMayAttach?: boolean;
      /** The card taken is shown to the opponent (Poké Ball): the log names it. */
      reveal?: boolean;
      /** Pokémon Trader: the hand card that goes into the deck once a card is picked. */
      tradeUid?: string;
      /** "Up to": the player may take nothing (Summon Minions). */
      optional?: boolean;
      /** How many cards in all (Summon Minions: up to 2): the search repeats while there are more to take. Missing = 1. */
      count?: number;
      /** Each a different type of basic Energy (Lady Outing) or a different name (Signs of Evolution): `taken` has those found so far. */
      distinct?: 'type' | 'name';
      taken?: string[];
      /** 'named': or any Basic Pokémon (Team Assembly). */
      orBasic?: boolean;
      /** With `toBench`: this many damage counters on a Stage 2 Pokémon put there (Archie). */
      stage2Counters?: number;
      /** With `attach`: then this many damage counters on the Pokémon it's attached to (Psy Shadow). */
      counters?: number;
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
      /** With `shuffleRest`: the rest go on the bottom of the deck instead (Delta Control). */
      toBottom?: boolean;
      /** Any number of basic Energy cards may be taken, one at a time, shown to the opponent; the rest are shuffled back (Flipper Stroke). */
      basicEnergy?: boolean;
      /** With `basicEnergy`: any Energy cards, not only basic ones (Holon Lass). */
      anyEnergy?: boolean;
      /** With `basicEnergy`: the cards taken are attached to this Pokémon of the player's, and the rest discarded (Peal of Thunder). */
      attachTo?: Target;
      /** A Basic Pokémon, Evolution or Energy card may be taken, shown to the opponent; the rest go back on top in any order (PokéNav). */
      pokeNav?: boolean;
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
      /** Evolutionary Fan: one of the player's Evolved Pokémon, not one with this name, may be returned. */
      evolvedNot?: string;
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
      /**
       * Psychic Protector, asked like Flee: up to 4 cards from the hand (`picked` so far) to discard if the attack damages the
       * player's Flygon ex, 10 less damage for each.
       */
      kind: 'protector';
      attackIndex: number;
      choices: AttackChoices;
      picked: string[];
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
      /** Each to any of the player's Pokémon, clicked after the card is picked (Energy Shower, Speed Growth). */
      anyTarget?: boolean;
      /** Energy cards of these types, basic or Special, instead of `type` (Dark Provide: Grass or Darkness). */
      types?: EnergyType[];
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
      /**
       * Up to `count` of their Prize cards instead (Investigate): with more Prizes than that, the player first picks which,
       * one at a time (`picked`, by index), and may stop after one; `looking` once they're shown.
       */
      prizes?: boolean;
      picked?: number[];
      looking?: boolean;
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
      /**
       * Narrow Gym: return 1 of the player's 5 benched Pokémon, and its cards, to their hand. Giant Stump (`limit` 3,
       * `discard`): discard benched Pokémon and their cards, one at a time, until 3 are left.
       */
      kind: 'narrowGym';
      limit?: number;
      discard?: boolean;
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
      /** Instead of a Trainer card: a Baby, Basic or Evolution card (Carry Off), an Energy card (Sudden Swipe), or a Supporter card (Scam). */
      filter?: 'pokemon' | 'energy' | 'supporter';
      /** Up to this many cards, one at a time (Dark Moon); the opponent then draws as many as were shuffled away (`taken`). */
      count?: number;
      taken?: number;
      /** Exactly `count` cards, none drawn after (Pick On: until the opponent has 5 cards left). */
      exact?: boolean;
      /** Where the card goes instead of into the deck: their discard pile (Flutter Trick) or the bottom of their deck (Push Aside). */
      place?: 'discard' | 'bottom';
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
      filter?: 'basic' | 'evolution' | 'trainer' | 'basicEnergy' | 'any' | 'pokemonOrBasicEnergy' | 'stadium' | 'energy' | 'waterEnergy' | 'supporter' | 'holonSupporter' | 'tool';
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
      /**
       * Basic Energy cards instead of Pokémon cards (Energy Recycle, Streaming Mantle: then `then` does the same, mantleEnergy);
       * Pokémon or Supporter cards, shown (Wind Wave).
       */
      filter?: 'basicEnergy' | 'pokemonOrSupporter';
    }
  | {
      /** Spatial Distortion: a Stadium card from the player's discard pile goes into play (`fromDeck`: from the deck, Forecast). */
      kind: 'stadiumFromDiscard';
      fromDeck?: boolean;
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
      only?: { type?: EnergyType; name?: string; bench?: boolean; notEx?: boolean };
      /** The search to go on with once it's attached (more cards to find: Attract Current). */
      next?: PendingChoice;
      /** Then this many damage counters on that Pokémon (Psy Shadow). */
      counters?: number;
      /** It may go into the hand instead, when no Pokémon is clicked (Mining). */
      orHand?: boolean;
    }
  | {
      /**
       * Fast Stream: the player moves an Energy card attached to their Active Pokémon to one of their Benched Pokémon (they
       * pick both): first the Energy card, then (`energyUid` set) the Benched Pokémon.
       */
      kind: 'fastStream';
      energyUid?: string;
    }
  | {
      /** Put a card from the player's hand on top of their deck (Special Delivery). */
      kind: 'handToDeck';
    }
  | {
      /** A card from the player's hand becomes a face-up Prize card, and a face-down one (at random) goes into their hand (See Beyond). */
      kind: 'handToPrize';
    }
  | {
      /**
       * Rival: the opponent of the player who played it picks 3 of the top cards of that player's deck shown (`looked`), one at
       * a time (`picked` so far); those go into that player's hand, and their deck is shuffled.
       */
      kind: 'rival';
      looked: string[];
      picked: string[];
    }
  | {
      /**
       * Switch one of the player's benched Pokémon, chosen on the board, with their Active Pokémon. Asked of the
       * Defending player after the opponent's Whirlwind, Ram, Terror Strike, Rapid Spin or Fling. `optional`: the player
       * may also not switch (Strike and Run).
       */
      kind: 'switchIn';
      optional?: boolean;
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
      /** With `toHand`: any Energy card but this one (a Holon's Pokémon just attached as Energy), not only basic ones. */
      holonReturn?: string;
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
      /** The player may not evolve (EX Eevee's Energy Evolution). */
      optional?: boolean;
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
      /** The usual limits for evolving apply (Make a Wish, agreed). */
      limits?: boolean;
      /** Once a Pokémon evolves, a damage counter on the Pokémon whose top card is this (Make a Wish). */
      counterOn?: string;
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
      power: 'energyRecharge' | 'flameVapor' | 'streamingMantle' | 'retroEnergy' | 'belt' | 'healingShower' | 'legendaryAscent' | 'froth' | 'dragonBoost' | 'lightningBurst' | 'evoFlame' | 'evoThunder' | 'evoSwirl' | 'excavate' | 'crushChance' | 'crimsonRay' | 'yellowRay' | 'blueRay' | 'earthFissure' | 'sharpEye';
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
      /** Any Energy cards, not only basic ones (Extra Energy Bomb). */
      anyEnergy?: boolean;
      /** Only basic Energy cards of this type (Fire Dance). */
      type?: EnergyType;
      /** Not this card (Rotating Claws: the one just discarded). */
      excludeUid?: string;
      /** Without `target`: only to the player's Pokémon that aren't Pokémon-ex (Extra Energy Bomb). */
      notEx?: boolean;
      /** Without `target`: only to the player's Pokémon with this in their names (Paste: δ). */
      onlyName?: string;
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
      /** Only basic Energy cards of this type (Legendary Ascent). */
      type?: EnergyType;
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
      /** Electric Blast: `count` damage counters, one at a time, on the opponent's Benched Pokémon the player clicks (`active`: or their Active Pokémon, Random Curse). */
      kind: 'placeCounters';
      count: number;
      active?: boolean;
      /** The opponent's Pokémon the attack can't affect (Wonder Guard…), by uid: not options. */
      skip?: string[];
      /** All `count` on the one Pokémon clicked (Shadow Curse). */
      together?: boolean;
      /** The player may not (Shadow Curse). */
      optional?: boolean;
    }
  | {
      /** Discard `count` cards from the hand, one at a time (TV Reporter); `energyOnly`: Energy cards (Crushing Mantle). */
      kind: 'discardFromHand';
      count: number;
      energyOnly?: boolean;
      /** Only these: Pokémon Tool and Technical Machine cards (Toss), or Pokémon Tool and Rocket's Secret Machine cards (Litter). */
      only?: 'toolOrMachine' | 'toolOrSecret' | 'pokemon';
    }
  | {
      /**
       * Energy Grounding: the opponent's attack is Knocking Out the player's Pokémon at `target`; they may move one of its basic
       * Energy cards to their Pokémon whose top card is `to` (the Lanturn), or not.
       */
      kind: 'energyGrounding';
      target: Target;
      to: string;
      /**
       * EXP. ALL instead: the player's Pokémon with EXP. ALL attached, by top card uid; with more than one, once the Energy
       * card is picked (`cardUid`) they click which one, and its EXP. ALL is discarded.
       */
      expAll?: string[];
      /** Golden Wing instead: how many more Energy cards (any, not only basic) may move, to any of `expAll`; no Tool is discarded. */
      goldenWing?: number;
      /** With `goldenWing`: only React Energy cards (Reactive Recharge). */
      reactOnly?: boolean;
      cardUid?: string;
    }
  | {
      /** Power Shift: move any number of basic Energy cards from the player's Pokémon at `from` to the one at `to`, one at a time. */
      kind: 'shiftEnergy';
      from: Target;
      to: Target;
      /** Only Energy cards of this type (Thunder Reflection: Lightning). */
      type?: EnergyType;
    }
  | {
      /** Temperamental Weather: the Castform at `target` is switched with a card from the deck named one of `names`. */
      kind: 'castform';
      target: Target;
      names: string[];
      /** Swoop! Teleporter: the old card is discarded instead of shuffled into the deck. */
      discardOld?: boolean;
      /** Form Change (Deoxys): its once-a-turn marker is the player's `formChangeTurn`, not Temperamental Weather's. */
      formChange?: boolean;
    }
  | {
      /** Vine Tease: one of the player's Prize cards, picked after looking, changes places with the top card of their deck. */
      kind: 'vineTease';
    }
  | {
      /** Assistance: which Special Condition to remove from the player's Pokémon at `target`. */
      kind: 'removeCondition';
      target: Target;
    }
  | {
      /**
       * One of the opponent's Benched Pokémon, picked on the board: 'gust' switches it with their Active Pokémon (Darker
       * Ring); 'devolve' (an Evolved one, optional) puts its top card into their hand (Devo Flash).
       */
      kind: 'oppBenchPick';
      purpose: 'gust' | 'devolve';
    }
  | {
      /**
       * Strange Cave, Holon Fossil: a Pokémon card named one of `names` from the hand onto the Bench, treated as a Basic
       * Pokémon (`optional`: the player may not).
       */
      kind: 'handToBench';
      names: string[];
      optional?: boolean;
    }
  | {
      /** Peal of Thunder: the player's Pokémon to attach Energy cards to (or none: the power isn't used); then the top 5 cards. */
      kind: 'pealTarget';
    }
  | {
      /** Cursed Eyes: up to 3 damage counters move from one of the opponent's Pokémon (`from`, picked first) to another of theirs. */
      kind: 'cursedEyes';
      from?: Target;
    }
  | {
      /** Skill Hack: an attack of a Basic Pokémon or Evolution card in the opponent's hand (`cardUid`, picked first), performed by the Active Pokémon. */
      kind: 'skillHack';
      cardUid?: string;
    }
  | {
      /** Deceive: the player picks one of their own Pokémon to put `count` damage counters on (asked of the attacked player). */
      kind: 'ownCounters';
      count: number;
    }
  | {
      /** Blissful Support: any number of the player's Pokémon, one at a time, have all their Energy cards discarded and all damage counters removed. */
      kind: 'blissful';
    }
  | {
      /**
       * Delta Switch: any number of basic Energy cards move from the player's Pokémon to their others, one at a time, never
       * to the Pokémon whose top card is `exclude` (Mewtwo); `cardUid`: the Energy card picked, the Pokémon to move it to next.
       */
      kind: 'deltaSwitch';
      exclude: string;
      cardUid?: string;
    }
  | {
      /**
       * Supernatural: look at the opponent's hand; the player may use the effect of a Supporter card in it (it stays there).
       * Once one is picked (`cardUid`), its questions are asked one at a time (agreed), the answers so far in `choices`
       * (and `taken`: the cards picked so far for a question that takes several).
       */
      kind: 'supernatural';
      /** From the opponent's discard pile instead (Chime). */
      fromDiscard?: boolean;
      /** The player's own Supporter card in play instead (Detour). */
      own?: boolean;
      cardUid?: string;
      choices?: TrainerChoices;
      taken?: string[];
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
  asPokemon?: {
    hp: number;
    /** Its printed Poké-Body (the Fossils' Jagged Stone, Spongy Stone), whose effect is in the powers table. */
    power?: { name: string; text: string };
    /** In play it's a Trainer card as well as a Pokémon (EX Legend Maker's Fossils on; EX Sandstorm's are a Pokémon instead). */
    alsoTrainer?: boolean;
  };
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
  /** A Stadium's attack the Pokémon whose names `for` accepts can use instead of their own (Rocket's Tricky Gym; usableAttacks). */
  stadiumAttack?: { attack: Attack; for: (name: string, pokemon: InPlayPokemon, cards: CardLibrary) => boolean };
  /** A Pokémon Tool that can go only on some Pokémon (EXP. ALL, the Belts): which, for Tools attached by other effects (Hoard). */
  toolFor?: (pokemon: PokemonCardDef) => boolean;
  /** A Pokémon Tool only for Evolved Pokémon (Curse Powder, Protective Orb, Solid Rage): discarded from a Basic Pokémon (refreshHideout). */
  evolvedToolOnly?: boolean;
  /** A Rocket's Secret Machine (Snatch and Run, Dark Aid and Litter look for them). */
  secretMachine?: boolean;
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
  // The Diamond & Pearl era's rule, for every set (agreed): the player going first plays no Supporter on their first turn.
  if (effect.supporter && s.turn === 1) return "The first player can't play a Supporter card on turn 1";
  if (effect.supporter && (s.me.noSupportersUntil ?? 0) >= s.turn) return "Addictive Pollen: you can't play Supporter cards this turn";
  const hayFever = trainersBlocked([s.me, s.opp], s.cards);
  if (hayFever) return hayFever;
  const veiled = effect.supporter && supportersVeiled([s.me, s.opp], s.cards);
  if (veiled) return veiled;
  const dusted = !effect.supporter && trainersDusted(s.me, [s.me, s.opp], s.cards);
  if (dusted) return dusted;
  if (effect.tool && primalLocked(s.me, [s.me, s.opp], s.cards)) return "Primal Lock: you can't play Pokémon Tool cards";
  // Disconnect: no Trainer cards but Supporters this turn.
  if (!effect.supporter && (s.me.noItemsUntil ?? 0) >= s.turn) return "Disconnect: you can't play Trainer cards but Supporters this turn";
  // Commanding Aura (the opponent's Active Hariyama ex): no Stadium cards. Mystic Scale (any Milotic ex): no Technical Machines.
  const holding = (key: 'commandingAura' | 'mysticScale' | 'lonesome' | 'deltaBlock', pokemon: (InPlayPokemon | null)[]) =>
    pokemon.some((p) => !!p && !!powerEffect(effectId(p))?.[key] && powerActive(p, s.cards, [s.me, s.opp]));
  if (effect.stadium && holding('commandingAura', [s.opp.active])) return "Commanding Aura: you can't play Stadium cards";
  // Delta Block (the opponent's Golduck δ): no Stadium cards while one with Holon in its name is in play.
  if (effect.stadium && s.stadium && def(s, s.stadium).name.includes('Holon') && holding('deltaBlock', [s.opp.active, ...s.opp.bench])) return "Delta Block: you can't play Stadium cards";
  // Lonesome (the opponent's Houndoom): while they have fewer Pokémon in play, no Trainer cards but Supporters.
  const inPlayCount = (side: Pick<PlayerState, 'active' | 'bench'>) => [side.active, ...side.bench].filter(Boolean).length;
  if (!effect.supporter && inPlayCount(s.opp) < inPlayCount(s.me) && holding('lonesome', [s.opp.active, ...s.opp.bench])) return "Lonesome: you can't play Trainer cards but Supporters";
  if (effect.technicalMachine && holding('mysticScale', [s.me.active, ...s.me.bench, s.opp.active, ...s.opp.bench])) return "Mystic Scale: Technical Machine cards can't be played";
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

/** What `me` sees when playing `card` from their hand (trainerError, resolveTrainerChoices). */
export function trainerSituation(state: GameState, me: PlayerState, opp: PlayerState, card: CardInstance): TrainerSituation {
  const oppFaceDownPrizes = faceDownPrizes(opp.prizes.length, (i) => !!opp.faceUpPrizes?.includes(opp.prizes[i]!.uid));
  return { card, me, opp, deckCount: me.deck.length, cards: state.cards, turn: state.turn, stadium: state.stadium?.card ?? null, oppFaceDownPrizes, prizes: { me: me.prizes.length, opp: opp.prizes.length } };
}

/** Plays a Trainer card from the hand. Mutates `state`; returns an error instead if not allowed. */
export function playTrainer(state: GameState, me: PlayerState, opp: PlayerState, cardUid: string, given: TrainerChoices): string | null {
  const card = me.hand.find((c) => c.uid === cardUid);
  if (!card) return 'That card is not in your hand';
  const situation = trainerSituation(state, me, opp, card);
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
  const ctx = trainerContext(state, me, opp, card, resolved.choices, () => (attached = true));
  const name = lookupCard(state.cards, card.defId).name;
  const effect = trainerEffect(card.defId)!;
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
  if (effect.supporter) {
    me.supporterTurn = state.turn;
    me.supporterUid = card.uid;
  }
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

/**
 * What a Trainer's effect runs with: `me` plays `card` (from the hand, or only its effect: Supernatural). `onAttach`: the card
 * was attached to a Pokémon (or became the Stadium), so it isn't discarded.
 */
function trainerContext(state: GameState, me: PlayerState, opp: PlayerState, card: CardInstance, choices: TrainerChoices, onAttach: () => void): TrainerContext {
  const ctx: TrainerContext = {
    state,
    me,
    opp,
    card,
    choices,
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
      onAttach();
    },
    pend(choice) {
      state.pendingChoice = { ...choice, player: me.id } as PendingChoice;
    },
    endTurn() {
      state.endTurnNow = true;
    },
  };
  return ctx;
}

/**
 * Supernatural: the Supporter cards in the opponent's hand whose effect the player can use now (agreed: as if they'd played
 * it, though it stays in that hand; Primal Veil and the one-Supporter rule don't stop it). Their questions are asked during
 * the attack (agreed).
 */
function supernaturalCards(state: GameState, me: PlayerState, opp: PlayerState, fromDiscard = false, own = false): CardInstance[] {
  return (own ? me.discard.filter((c) => c.uid === me.supporterUid && me.supporterTurn === state.turn) : fromDiscard ? opp.discard : opp.hand).filter((c) => {
    const effect = trainerEffect(c.defId);
    if (!effect?.supporter || !effect.play) return false;
    const s = trainerSituation(state, me, opp, c);
    if (effect.blocked?.(s)) return false;
    const resolved = resolveTrainerChoices(s, {});
    return 'choices' in resolved || !!resolved.need;
  });
}

type SupernaturalChoice = Extract<PendingChoice, { kind: 'supernatural' }>;

/** The cards Supernatural (the opponent's hand), Chime (their discard pile) or Detour (`own`: the player's Supporter in play) uses. */
const supernaturalPile = (me: PlayerState, opp: PlayerState, choice: SupernaturalChoice) => (choice.own ? me.discard.filter((c) => c.uid === me.supporterUid) : choice.fromDiscard ? opp.discard : opp.hand);

/** Supernatural: the Supporter's next question, or its effect once every one is answered. */
function supernaturalStep(state: GameState, me: PlayerState, opp: PlayerState, choice: SupernaturalChoice) {
  const card = supernaturalPile(me, opp, choice).find((c) => c.uid === choice.cardUid);
  if (!card) return;
  const resolved = resolveTrainerChoices(trainerSituation(state, me, opp, card), choice.choices ?? {});
  if ('error' in resolved) {
    if (resolved.need) state.pendingChoice = choice;
    else addLog(state, `${choice.source}: ${resolved.error}.`, me.id);
    return;
  }
  addLog(state, `${choice.source}: used the effect of ${lookupCard(state.cards, card.defId).name} from the opponent's ${choice.fromDiscard ? 'discard pile' : 'hand'}.`, me.id);
  trainerEffect(card.defId)!.play!(trainerContext(state, me, opp, card, resolved.choices, () => {}));
  // A choice the effect asks (a search) is still the attack's: the turn ends once it's answered.
  const next = state.pendingChoice as PendingChoice | undefined;
  if (next && choice.afterAttack) next.afterAttack = true;
}

/** Supernatural: the view of the Supporter's open question `spec`. */
function supernaturalView(choice: SupernaturalChoice, spec: TrainerChoiceSpec): PendingChoiceView {
  const prompt = `${choice.source}: ${spec.prompt}`;
  if (spec.kind === 'pokemon') return spec.side === 'own' ? { kind: 'ownPokemon', purpose: 'return', prompt, options: spec.options } : { kind: 'oppPokemon', prompt, options: spec.options };
  if (spec.kind === 'stage') return { kind: 'options', prompt, labels: spec.options.map((s) => (s === 'stage1' ? 'Stage 1' : 'Stage 2')) };
  if (spec.kind === 'pick') return { kind: 'options', prompt, labels: spec.labels };
  const taken = choice.taken ?? [];
  const options = spec.options.filter((c) => !taken.includes(c.uid));
  const kind = spec.field === 'handUids' ? 'pickFromHand' : spec.field === 'discardUids' ? 'pickFromDiscard' : 'pickAttached';
  const more = spec.max > 1 ? ` (${taken.length} of up to ${spec.max} chosen)` : '';
  return { kind, prompt: `${prompt}${more}`, options, optional: taken.length >= spec.min };
}

/** A card Super Rod (`filter`), Old Rod, Energy Stadium, Searchlight or Reel In may take from the discard pile. */
const discardToHandFits = (cards: CardLibrary, c: CardInstance, filter?: Extract<PendingChoice, { kind: 'discardToHand' }>['filter']) => {
  const d = lookupCard(cards, c.defId);
  if (filter === 'any') return true;
  if (filter === 'trainer') return isTrainerCard(d);
  if (filter === 'stadium') return !!trainerEffect(c.defId)?.stadium;
  if (filter === 'basicEnergy') return isBasicEnergy(d);
  // Pickup: any Energy card. Water Plant: a Water Energy card.
  if (filter === 'energy') return d.kind === 'energy';
  if (filter === 'waterEnergy') return isBasicEnergyOf(cards, c, 'water');
  // VS Seeker: a Supporter card.
  if (filter === 'supporter') return !!trainerEffect(c.defId)?.supporter;
  if (filter === 'holonSupporter') return !!trainerEffect(c.defId)?.supporter && d.name.includes('Holon');
  if (filter === 'tool') return d.kind === 'trainer' && !!trainerEffect(c.defId)?.tool;
  if (filter === 'pokemonOrBasicEnergy') return isPokemonCard(d) || isBasicEnergy(d);
  if (!isPokemonCard(d)) return false;
  return filter === 'basic' ? isBasicPokemon(d) : filter === 'evolution' ? !isBasicPokemon(d) : true;
};

/** A Pokémon Tool, or (`toolOrMachine`) a Technical Machine, or (`toolOrSecret`) a Rocket's Secret Machine card. */
export const handTrainerFits = (c: CardInstance, only: 'toolOrMachine' | 'toolOrSecret') => {
  const effect = trainerEffect(c.defId);
  return !!effect?.tool || (only === 'toolOrMachine' ? !!effect?.technicalMachine : !!effect?.secretMachine);
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
    // Any card (Dark Moon), or only Supporter cards (Scam).
    const options = choice.filter ? hand.filter((c) => oppHandFits(state.cards, choice, c)) : hand;
    const cards = `${choice.count} more card${choice.count === 1 ? '' : 's'}`;
    if (choice.exact) return { kind: 'oppHand', prompt: `${choice.source}: choose ${cards} for your opponent to shuffle into their deck`, cards: hand, options };
    return { kind: 'oppHand', prompt: `${choice.source}: choose up to ${cards} for your opponent to shuffle into their deck (they then draw as many)`, cards: hand, options, optional: true };
  }
  if (choice.kind === 'revealEnergy' || choice.kind === 'powerPlant') {
    const hand = state.players[choice.player]!.hand.filter((c) => isBasicEnergy(lookupCard(state.cards, c.defId)));
    const what = choice.kind === 'revealEnergy' ? 'show a basic Energy card from your hand: a Basic Pokémon of its type goes from your deck onto your Bench' : 'discard a basic Energy card from your hand, then take one from your discard pile';
    return { kind: 'pickFromHand', prompt: `${choice.source}: ${what}`, options: hand };
  }
  if (choice.kind === 'devolveOwn') {
    const player = state.players[choice.player]!;
    return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: click one of your Evolved Pokémon to discard its top Evolution card`, options: targetsOf(player).filter((t) => devolvable(state.cards, atTarget(player, t)!)) };
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
    const player = state.players[choice.player]!;
    if (choice.fromDeck) return { kind: 'pickFromDeck', prompt: `${choice.source}: choose a Stadium card from your deck to play`, options: deckStadiums(state, player), optional: true };
    const options = player.discard.filter((c) => !!trainerEffect(c.defId)?.stadium);
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
    if (choice.filter === 'basicEnergy') {
      const left = choice.count > 1 ? ` (${choice.count} left)` : '';
      return { kind: 'pickFromDiscard', prompt: `${choice.source}: shuffle a basic Energy card from your discard pile into your deck${left}`, options };
    }
    const what = choice.filter === 'pokemonOrSupporter' ? 'Pokémon or Supporter cards' : 'Baby, Basic or Evolution cards';
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: you may shuffle up to ${choice.count} more ${what} from your discard pile into your deck`, options, optional: true };
  }
  if (choice.kind === 'removeDamage') {
    const options = damagedTargets(state.players[choice.player]!);
    const left = (choice.count ?? 1) > 1 ? ` (${choice.count} left)` : '';
    return { kind: 'ownPokemon', purpose: 'heal', prompt: `${choice.source}: click one of your Pokémon to remove a damage counter from${left}`, options };
  }
  if (choice.kind === 'fastStream') {
    const owner = state.players[choice.player]!;
    if (!choice.energyUid) return { kind: 'pickAttached', prompt: `${choice.source}: choose an Energy card attached to your Active Pokémon to move to one of your Benched Pokémon`, options: owner.active?.energy ?? [] };
    return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click one of your Benched Pokémon to move the Energy card to`, options: owner.bench.flatMap((p, i) => (p ? [i] : [])) };
  }
  if (choice.kind === 'attachCard') {
    const name = lookupCard(state.cards, choice.card.defId).name;
    if (choice.orHand) return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: you may click one of your Pokémon to attach ${name} to (or it goes into your hand)`, options: attachTargets(state, choice), optional: true };
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
    const what = { basic: 'a Basic Pokémon card', evolution: 'an Evolution card', trainer: 'a Trainer card', basicEnergy: 'a basic Energy card', any: 'a card', pokemonOrBasicEnergy: 'a Pokémon or basic Energy card', stadium: 'a Stadium card', energy: 'an Energy card', waterEnergy: 'a Water Energy card', supporter: 'a Supporter card', holonSupporter: 'a Supporter card with Holon in its name', tool: 'a Pokémon Tool card' }[choice.filter ?? 'basic'];
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
    const opp = state.players[opponentOf(state, choice.player)]!;
    return { kind: 'oppPokemon', prompt: `${choice.source}: you may click one of your opponent's Pokémon to do ${choice.amount} damage to`, options: targetsOf(opp), optional: true };
  }
  if (choice.kind === 'evolveFromDeck') {
    const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
    const options = player.deck.filter((c) => choice.names.includes(name(c))).sort((a, b) => name(a).localeCompare(name(b)) || a.uid.localeCompare(b.uid));
    if (choice.optional) return { kind: 'pickFromDeck', prompt: `${choice.source}: you may evolve with ${choice.names.join(' or ')} from your deck`, options, optional: true };
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
  if (choice.kind === 'rival') {
    const owner = state.players[opponentOfChoice(state, choice)]!;
    const options = owner.deck.filter((c) => choice.looked.includes(c.uid) && !choice.picked.includes(c.uid));
    const left = RIVAL_PICKS - choice.picked.length;
    return { kind: 'pickFromDeck', prompt: `${choice.source}: choose ${left} of these cards to go into your opponent's hand (the others go back into their deck)`, options };
  }
  if (choice.kind === 'handToPrize') {
    return { kind: 'pickFromHand', prompt: `${choice.source}: choose a card from your hand to put face up as a Prize card`, options: player.hand };
  }
  if (choice.kind === 'switchIn') {
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    return { kind: 'ownPokemon', purpose: 'switchIn', prompt: `${choice.source}: ${choice.optional ? 'you may click' : 'click'} one of your benched Pokémon to switch in`, options, ...(choice.optional && { optional: true }) };
  }
  if (choice.kind === 'benchDamage') {
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    return { kind: 'ownPokemon', purpose: 'benchDamage', prompt: `${choice.source}: click one of your benched Pokémon to take ${choice.amount} damage`, options };
  }
  if (choice.kind === 'discardAttached') {
    const p = atTarget(player, choice.target)!;
    if (choice.toHand) {
      const from = lookupCard(state.cards, p.card.defId).name;
      if (choice.holonReturn) return { kind: 'pickAttached', prompt: `${choice.source}: return an Energy card attached to ${from} to your hand`, options: p.energy.filter((e) => !e.provides && e.uid !== choice.holonReturn) };
      const options = p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)));
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
    return { kind: 'pickFromDeck', prompt: `${choice.source}: put one of these cards into your hand; the rest ${choice.toBottom ? 'go on the bottom of your deck' : 'are shuffled back'}`, options };
  }
  if (choice.kind === 'pickFromTop') {
    const options = player.deck.filter((c) => choice.looked.includes(c.uid));
    const left = choice.take > 1 ? ` (${choice.take} left)` : '';
    if (choice.basicEnergy) {
      const energy = options.filter((c) => topEnergyFits(state.cards, choice, c));
      return { kind: 'pickFromDeck', prompt: `${choice.source}: you may take any of the ${choice.anyEnergy ? '' : 'basic '}Energy cards among the top cards of your deck (shown to your opponent), one at a time; the rest are shuffled back`, options: energy, optional: true };
    }
    if (choice.trainer) {
      const trainers = options.filter((c) => isTrainerCard(lookupCard(state.cards, c.defId)));
      return { kind: 'pickFromDeck', prompt: `${choice.source}: you may take a Trainer card (shown to your opponent); the rest are shuffled back`, options: trainers, optional: true };
    }
    if (choice.pokeNav) {
      return { kind: 'pickFromDeck', prompt: `${choice.source}: you may take a Basic Pokémon, Evolution or Energy card (shown to your opponent); the others go back on top of your deck`, options: options.filter((c) => pokeNavFits(state.cards, c)), optional: true };
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
  if (choice.kind === 'returnOwn' && choice.evolvedNot) {
    return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: you may click one of your Evolved Pokémon (not ${choice.evolvedNot}) to return it and its cards to your hand`, options: fanTargets(state.cards, player, choice.evolvedNot), optional: true };
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
    const attack = attacker.active && usableAttacks(attacker.active, state.cards, { recall: recallsAttacks(state, attacker), bench: attacker.bench, defender: player.active, oppBench: player.bench, stadium: state.stadium?.card ?? null, sides: [attacker, player] })[choice.attackIndex]?.attack.name;
    const options = player.bench.flatMap((p, i) => (p ? [i] : []));
    const prompt =
      choice.kind === 'flee'
        ? `${choice.source}: your opponent is attacking with ${attack ?? 'an attack'}. If it damages Misty's Tentacruel, it switches with the benched Pokémon you click (Done: it stays)`
        : `${choice.source}: your opponent is attacking with ${attack ?? 'an attack'}. Click a benched Pokémon to switch in first, or Done`;
    return { kind: 'ownPokemon', purpose: 'switchIn', prompt, options, optional: true };
  }
  if (choice.kind === 'protector') {
    const options = player.hand.filter((c) => !choice.picked.includes(c.uid));
    const so = choice.picked.length ? ` (${choice.picked.length} chosen)` : '';
    return { kind: 'pickFromHand', prompt: `${choice.source}: your opponent is attacking. You may choose up to 4 cards to discard if it damages Flygon ex, 10 less damage each${so}; Done when finished`, options, optional: true };
  }
  if (choice.kind === 'borrowedTrainer') {
    const card = state.borrowed?.uid;
    const what = card ? lookupCard(state.cards, player.hand.find((c) => c.uid === card)?.defId ?? '') : null;
    return { kind: 'options', prompt: `${choice.source}: your opponent couldn't play ${what?.name ?? 'a Trainer card'}. You may play it from your hand now`, labels: ["Don't play it"], ...(card && { playable: card }) };
  }
  if (choice.kind === 'attachFromHand') {
    const options = player.hand.filter((c) => attachableFromHand(state.cards, c, choice.type, choice.basic, choice.types));
    const to = choice.anyTarget ? 'your Pokémon' : choice.target === undefined || choice.target === 'active' ? 'your Active Pokémon' : cardName(state, player.bench[choice.target]!.card);
    return { kind: 'pickFromHand', prompt: `${choice.source}: you may attach up to ${choice.count} ${choice.type ? `${typeName(choice.type)} ` : ''}Energy card${choice.count === 1 ? '' : 's'} from your hand to ${to}`, options, optional: true };
  }
  if (choice.kind === 'removeEach' || choice.kind === 'drainEnergy') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const target = choice.kind === 'drainEnergy' ? 'active' : choice.targets[0]!;
    const p = atTarget(opp, target)!;
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
    const options = targetsOf(player).filter((t) => t !== choice.to && atTarget(player, t)!.energy.some((e) => isEnergyCardOfType(state.cards, e, 'grass')));
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
    const whose = choice.own ? 'your' : "your opponent's";
    const pile = state.players[choice.own ? choice.player : opponentOfChoice(state, choice)]!.prizes;
    if (pickingPrizes(choice, pile)) {
      const labels = unpickedPrizes(choice, pile).map((i) => `Prize ${i + 1}`);
      if (!choice.picked?.length) return { kind: 'options', prompt: `${choice.source}: look at which of ${whose} Prize cards?`, labels };
      return { kind: 'options', prompt: `${choice.source}: look at another of ${whose} Prize cards?`, labels: [...labels, 'Only that one'] };
    }
    const cards = choice.looking ? choice.picked!.map((i) => pile[i]!) : pile.slice(0, choice.count);
    return { kind: 'oppHand', prompt: `${choice.source}: ${cards.length} of ${whose} Prize cards (they stay where they are)`, cards, options: [] };
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
    const options = targetsOf(player).filter((t) => cardName(state, atTarget(player, t)!.card).includes('Koga'));
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
    if (choice.discard) return { kind: 'ownPokemon', purpose: 'return', prompt: `${choice.source}: no more than ${choice.limit} benched Pokémon. Click one to discard it and its cards`, options };
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
  const options = deck.filter((c) => deckFilter(state.cards, choice, c, !!state.players[choice.player]?.holonVeil)).sort((a, b) => name(a).localeCompare(name(b)) || a.uid.localeCompare(b.uid));
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
      : choice.filter === 'ownerBasicOrEnergy'
        ? `a Basic Pokémon with ${choice.name} in its name or a basic Energy card`
      : choice.filter === 'basicTypeOrOwner'
        ? `a ${typeName(choice.type!)} Basic Pokémon or a Basic Pokémon with ${choice.name} in its name`
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
      : choice.filter === 'darkOrRockets'
        ? "a Pokémon with Dark or Rocket's in its name"
      : choice.filter === 'basicMaxHp'
        ? `a Basic Pokémon with ${choice.maxHp} HP or less`
      : choice.filter === 'metalOrDelta'
        ? 'a Metal Energy card or a δ Pokémon card'
      : choice.filter === 'holonSupporter'
        ? 'a Supporter card with Holon in its name'
      : choice.filter === 'deltaPokemon'
        ? 'a Pokémon with δ on its card'
      : choice.filter === 'pokemonEx'
        ? 'a Pokémon-ex'
      : choice.filter === 'trainerNotSupporter'
        ? 'a Trainer card (not a Supporter card)'
      : choice.filter === 'typedEnergy'
        ? `a ${typeName(choice.type!)} Energy card`
      : choice.filter === 'stadium'
        ? 'a Stadium card'
      : choice.filter === 'typesNotEx'
        ? `a ${(choice.types ?? []).map(typeName).join(' or ')} Pokémon (not a Pokémon-ex)`
        : choice.filter === 'pokemon'
          ? 'a Basic Pokémon or Evolution card'
          : 'any card';
  const more = (choice.count ?? 1) > 1 ? ` (up to ${choice.count} more)` : '';
  const prompt = choice.toBench ? `${choice.source}: put ${what} from your deck onto your Bench${more}` : `${choice.source}: take ${what} from your deck${more}`;
  return { kind: 'pickFromDeck', prompt, options, ...(choice.optional && { optional: true }) };
}

/** How many of the cards Rival shows go into the hand. */
export const RIVAL_PICKS = 3;

/** Rival: the cards picked go from the top of the deck into the hand, and the deck is shuffled. */
export function rivalHand(state: GameState, owner: PlayerState, uids: string[], source: string) {
  const cards = owner.deck.filter((c) => uids.includes(c.uid));
  owner.deck = owner.deck.filter((c) => !uids.includes(c.uid));
  owner.hand.push(...cards);
  [owner.deck, state.rngState] = shuffle(owner.deck, state.rngState);
  addLog(state, `${source}: put ${cards.map((c) => lookupCard(state.cards, c.defId).name).join(', ')} into the hand and shuffled the deck.`, owner.id);
}

/** The other player from the one choosing. */
const opponentOfChoice = (state: GameState, choice: PendingChoice) => opponentOf(state, choice.player);

/**
 * Challenge!: `player` puts any number of Basic Pokémon from their deck onto their Bench (unless it's full or they have
 * none), then `then` does the same.
 */
function challengeSearch(state: GameState, player: PlayerState, source: string, then?: PlayerId) {
  const room = benchRoom(player.bench, state.cards, state.stadium?.card);
  if (room && player.deck.some((c) => isBasicPokemon(lookupCard(state.cards, c.defId)))) {
    state.pendingChoice = { player: player.id, source, kind: 'pickFromDeck', filter: 'basic', toBench: true, optional: true, count: room, ...(then && { then }) };
  } else if (then) challengeSearch(state, state.players[then]!, source);
}

/** Whether a deck card can be picked in this search. */
const deckFilter = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'pickFromDeck' }>, c: CardInstance, veiled = false) => {
  const d = lookupCard(cards, c.defId);
  // A named Pokémon's variants count too (agreed: Team Aqua's Seviper, Dark Golbat…), never a Pokémon-ex.
  const named = (name: string) => [choice.name].flat().some((n) => namesMatch(name, n!));
  if (choice.filter === 'basicNamed') return isBasicPokemon(d) && named(d.name);
  if (choice.filter === 'basicType') return isBasicPokemon(d) && hasType(d, choice.type!);
  if (choice.distinct === 'name' && choice.taken?.includes(d.name)) return false;
  if (choice.distinct === 'type' && d.kind === 'pokemon' && choice.taken?.includes(d.type)) return false;
  if (choice.filter === 'basicEnergy') return isBasicEnergy(d) && !(choice.distinct === 'type' && d.kind === 'energy' && choice.taken?.includes(d.energyType));
  if (choice.filter === 'energyType') return isBasicEnergy(d) && d.kind === 'energy' && d.energyType === choice.type;
  if (choice.filter === 'baby') return isPokemonCard(d) && !!d.baby;
  if (choice.filter === 'basic') return isBasicPokemon(d);
  if (choice.filter === 'basicNotBaby') return isBasicPokemon(d) && d.kind === 'pokemon' && !d.baby;
  if (choice.filter === 'evolution') return isPokemonCard(d) && d.stage !== 'basic';
  if (choice.filter === 'darkEvolution') return isPokemonCard(d) && d.stage !== 'basic' && /\bDark\b/.test(d.name);
  if (choice.filter === 'named') return isPokemonCard(d) && (named(d.name) || (!!choice.orBasic && isBasicPokemon(d)));
  if (choice.filter === 'ownerBasic') return isBasicPokemon(d) && d.name.includes(String(choice.name));
  if (choice.filter === 'ownerBasicOrEnergy') return (isBasicPokemon(d) && d.name.includes(String(choice.name))) || isBasicEnergy(d);
  if (choice.filter === 'basicTypeOrOwner') return isBasicPokemon(d) && ((d.kind === 'pokemon' && hasType(d, choice.type!)) || d.name.includes(String(choice.name)));
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
  if (choice.filter === 'pokemonType') return isPokemonCard(d) && d.kind === 'pokemon' && hasType(d, choice.type!);
  // Snatch and Run: a Pokémon Tool or Rocket's Secret Machine. Celio's Network, Great Ball: not a Pokémon-ex. Darkness
  // Navigation: an Energy card with one of the names.
  if (choice.filter === 'toolOrSecret') return d.kind === 'trainer' && (!!trainerEffect(c.defId)?.tool || !!trainerEffect(c.defId)?.secretMachine);
  if (choice.filter === 'pokemonNotEx') return isPokemonCard(d) && d.kind === 'pokemon' && !d.trainerText && !d.ex;
  if (choice.filter === 'basicNotEx') return isBasicPokemon(d) && d.kind === 'pokemon' && !d.ex;
  if (choice.filter === 'energyNamed') return d.kind === 'energy' && [choice.name].flat().includes(d.name);
  // Night Cry: a Pokémon with Dark or Rocket's in its name. Holon Mentor: a Basic Pokémon with at most `maxHp` HP. Holon
  // Researcher: a Metal Energy card (basic or Special) or a δ Pokémon card. Holon Transceiver: a Supporter with Holon in
  // its name. Cry for Help: a Pokémon of one of `types`, not a Pokémon-ex.
  if (choice.filter === 'darkOrRockets') return isPokemonCard(d) && d.kind === 'pokemon' && !d.trainerText && /\bDark\b|\bRocket's\b/.test(d.name);
  if (choice.filter === 'basicMaxHp') return isBasicPokemon(d) && d.kind === 'pokemon' && d.hp <= (choice.maxHp ?? 0);
  if (choice.filter === 'metalOrDelta') return (d.kind === 'energy' && !d.anyType && d.energyType === 'metal') || isDeltaCard(d, veiled);
  if (choice.filter === 'holonSupporter') return d.kind === 'trainer' && !!trainerEffect(c.defId)?.supporter && d.name.includes('Holon');
  if (choice.filter === 'deltaPokemon') return isDeltaCard(d, veiled);
  // Extra Call: a Pokémon-ex. Moon Guidance: a Trainer card but a Supporter.
  if (choice.filter === 'pokemonEx') return isPokemonCard(d) && d.kind === 'pokemon' && !!d.ex;
  if (choice.filter === 'trainerNotSupporter') return isTrainerCard(d) && !trainerEffect(c.defId)?.supporter;
  // "A Lightning Energy card": basic or Special of the type (as energyCardOf, agreed for the EX sets). A Stadium card (Spacial Rend).
  if (choice.filter === 'typedEnergy') return d.kind === 'energy' && !d.anyType && d.energyType === choice.type;
  if (choice.filter === 'stadium') return d.kind === 'trainer' && !!trainerEffect(c.defId)?.stadium;
  if (choice.filter === 'typesNotEx') return isPokemonCard(d) && d.kind === 'pokemon' && !d.trainerText && !d.ex && (choice.types ?? []).some((t) => hasType(d, t));
  return choice.filter === 'any' || (d.kind === 'pokemon' && !d.trainerText);
};

const discardOptions = (player: PlayerState, choice: Extract<PendingChoice, { kind: 'pickFromDiscard' }>) => player.discard.filter((c) => c.uid !== choice.excludeUid);

/** Whether a card in the opponent's hand can be chosen (Sneak Attack: a Trainer card; Carry Off: a Pokémon card; Sudden Swipe: an Energy card). */
const oppHandFits = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'oppHandTrainer' }>, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  if (choice.filter === 'supporter') return d.kind === 'trainer' && !!trainerEffect(c.defId)?.supporter;
  return choice.any || (choice.filter === 'pokemon' ? isPokemonCard(d) : choice.filter === 'energy' ? d.kind === 'energy' : isTrainerCard(d));
};

/** Forecast: the Stadium cards in the deck that can be played (agreed: not one with the same name as the Stadium in play). */
const deckStadiums = (state: GameState, player: PlayerState) => {
  const inPlay = state.stadium && lookupCard(state.cards, state.stadium.card.defId).name;
  return player.deck.filter((c) => !!trainerEffect(c.defId)?.stadium && lookupCard(state.cards, c.defId).name !== inPlay);
};

/** Whether a card in the discard pile can go back into the deck (Fish Out: a Pokémon card; Energy Recycle: a basic Energy card). */
const toDeckFits = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'discardToDeck' }>, c: CardInstance) =>
  choice.filter === 'basicEnergy'
    ? isBasicEnergy(lookupCard(cards, c.defId))
    : choice.filter === 'pokemonOrSupporter'
      ? isPokemonCard(lookupCard(cards, c.defId)) || !!trainerEffect(c.defId)?.supporter
      : isPokemonCard(lookupCard(cards, c.defId));

const SKYRIDGE_KINDS = ['mayUse', 'attachFromDiscard', 'discardToBench', 'moveAttached', 'oracle', 'bottomPick', 'evolveFromHand', 'mysteryZone', 'placeCounters', 'discardFromHand', 'supernatural', 'energyGrounding', 'castform', 'shiftEnergy', 'vineTease', 'removeCondition', 'oppBenchPick', 'blissful', 'deltaSwitch', 'handToBench', 'ownCounters', 'pealTarget', 'cursedEyes', 'skillHack'] as const;

/** A pending choice Skyridge's cards add (skyridgeView, resolveSkyridge). */
type SkyridgeChoice = Extract<PendingChoice, { kind: (typeof SKYRIDGE_KINDS)[number] }>;

const isSkyridge = (choice: PendingChoice): choice is SkyridgeChoice => (SKYRIDGE_KINDS as readonly string[]).includes(choice.kind);

/** Investigate: the player is still picking which Prize cards to look at (there are more than it looks at). */
const pickingPrizes = (choice: Extract<PendingChoice, { kind: 'lookOppDeck' }>, pile: CardInstance[]) => !choice.looking && pile.length > choice.count;
/** Investigate: the indexes of the Prize cards not picked yet. */
const unpickedPrizes = (choice: Extract<PendingChoice, { kind: 'lookOppDeck' }>, pile: CardInstance[]) => pile.flatMap((_, i) => (choice.picked?.includes(i) ? [] : [i]));

/** A card PokéNav can take: a Basic Pokémon, Evolution or Energy card. */
const pokeNavFits = (cards: CardLibrary, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return (d.kind === 'pokemon' && !d.trainerText) || d.kind === 'energy';
};

/** A card Skill Hack can copy an attack of: a Basic Pokémon or Evolution card with an attack. */
export const skillHackFits = (cards: CardLibrary, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return d.kind === 'pokemon' && !d.trainerText && d.attacks.length > 0;
};

/** Basic Energy cards in the discard pile. */
const basicEnergyIn = (cards: CardLibrary, pile: CardInstance[]) => pile.filter((c) => isBasicEnergy(lookupCard(cards, c.defId)));

/**
 * Streaming Mantle: each of `players` in turn shuffles 3 basic Energy cards from their discard pile into their deck: all of
 * them with 3 or fewer, otherwise the player picks which (agreed), and the next one goes after.
 */
function mantleEnergy(state: GameState, players: PlayerState[], source: string) {
  for (const [i, player] of players.entries()) {
    const basic = basicEnergyIn(state.cards, player.discard);
    if (basic.length > 3) {
      const next = players[i + 1];
      state.pendingChoice = { player: player.id, source, kind: 'discardToDeck', count: 3, of: 3, filter: 'basicEnergy', ...(next && { then: next.id }) };
      return;
    }
    player.discard = player.discard.filter((c) => !basic.includes(c));
    [player.deck, state.rngState] = shuffle([...player.deck, ...basic], state.rngState);
    addLog(state, `${source}: shuffled ${basic.length} basic Energy card${basic.length === 1 ? '' : 's'} into the deck.`, player.id);
  }
  delete state.pendingChoice;
}

/** Cards in the discard pile `discardToBench` can put onto the Bench. */
const toBenchFits = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'discardToBench' }>, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  if (choice.filter === 'fossil') return d.kind === 'pokemon' && !d.trainerText && (d.name === 'Omanyte' || d.name === 'Kabuto');
  return isBasicPokemon(d) && d.kind === 'pokemon' && !d.baby;
};

/** Basic Energy cards on the player's Pokémon other than `to` (Attract Energy). */
const otherBasicEnergy = (state: GameState, me: PlayerState, to: InPlayPokemon, type?: EnergyType) =>
  [me.active, ...me.bench].flatMap((p) => (p && p !== to ? p.energy.filter((e) => (type ? isBasicEnergyOf(state.cards, e, type) : !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))) : []));

/** The basic Energy cards (of `type`, when given: Thunder Reflection) Power Shift can move from `from`. */
const shiftable = (state: GameState, from: InPlayPokemon, type?: EnergyType) =>
  from.energy.filter((e) => (type ? isBasicEnergyOf(state.cards, e, type) : !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId))));

const atTarget = (player: Pick<PlayerState, 'active' | 'bench'>, t: Target) => (t === 'active' ? player.active : player.bench[t]) ?? null;

/** The Energy cards in the discard pile an `attachFromDiscard` can take: basic ones, or (`anyEnergy`) any. */
const discardEnergyFor = (state: GameState, player: PlayerState, choice: Extract<PendingChoice, { kind: 'attachFromDiscard' }>) => discardEnergyAll(state, player, choice).filter((c) => c.uid !== choice.excludeUid);
const discardEnergyAll = (state: GameState, player: PlayerState, choice: Extract<PendingChoice, { kind: 'attachFromDiscard' }>) =>
  choice.anyEnergy ? player.discard.filter((c) => lookupCard(state.cards, c.defId).kind === 'energy') : choice.type ? player.discard.filter((c) => isBasicEnergyOf(state.cards, c, choice.type!)) : basicEnergyIn(state.cards, player.discard);

/** The Special Conditions a Pokémon has, as labels (Assistance). */
const conditionsOf = (p: InPlayPokemon): string[] => [
  ...(p.condition ? [conditionLabel(p.condition)] : []),
  ...(p.poison ? ['Poisoned'] : []),
  ...(p.burned ? ['Burned'] : []),
];

/** Evolutionary Fan: the player's Evolved Pokémon without `not` in their names. */
const fanTargets = (cards: CardLibrary, player: Pick<PlayerState, 'active' | 'bench'>, not: string) =>
  targetsOf(player).filter((t) => {
    const p = atTarget(player, t)!;
    return p.evolvedFrom.length > 0 && !namesMatch(inPlayDef(cards, p).name, not);
  });

/** The Energy cards Energy Grounding (basic ones), Golden Wing (any) or Reactive Recharge (React Energy) can move. */
const groundable = (cards: CardLibrary, choice: { goldenWing?: number; reactOnly?: boolean }, e: CardInstance) => {
  if (e.provides) return false;
  const d = lookupCard(cards, e.defId);
  return choice.reactOnly ? d.name === 'React Energy' : !!choice.goldenWing || isBasicEnergy(d);
};

/** Strange Cave, Holon Fossil: a Pokémon card in the hand named one of `names` (their variants too; a Pokémon-ex only by its own name). */
export const handToBenchFits = (cards: CardLibrary, names: string[], c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return d.kind === 'pokemon' && !d.trainerText && names.some((n) => namesMatch(d.name, n));
};

/** Blissful Support: the player's Pokémon with Energy cards attached or damage counters on them. */
const blissfulTargets = (player: Pick<PlayerState, 'active' | 'bench'>) => targetsOf(player).filter((t) => {
  const p = atTarget(player, t)!;
  return p.damage > 0 || p.energy.some((e) => !e.provides);
});

/** Delta Switch: the Pokémon the Energy card picked can move to (not the one it's on, nor Mewtwo). */
const deltaTargets = (player: Pick<PlayerState, 'active' | 'bench'>, choice: { exclude: string; cardUid?: string }) =>
  targetsOf(player).filter((t) => {
    const p = atTarget(player, t)!;
    return p.card.uid !== choice.exclude && !p.energy.some((e) => e.uid === choice.cardUid);
  });

/** Delta Switch: the basic Energy cards attached to the player's Pokémon that can move somewhere. */
const deltaEnergy = (state: GameState, player: Pick<PlayerState, 'active' | 'bench'>, choice: { exclude: string }) =>
  [player.active, ...player.bench].flatMap((p) =>
    p && targetsOf(player).some((t) => atTarget(player, t) !== p && atTarget(player, t)!.card.uid !== choice.exclude)
      ? p.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)))
      : [],
  );

/** Flipper Stroke takes basic Energy cards from the top of the deck, Holon Lass (`anyEnergy`) any Energy cards. */
const topEnergyFits = (cards: CardLibrary, choice: { anyEnergy?: boolean }, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return choice.anyEnergy ? d.kind === 'energy' : isBasicEnergy(d);
};

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
        belt: 'search your deck for a card that evolves from your Active Pokémon and put it on it (then discard the Belt)?',
        healingShower: "remove all damage counters from all of your Pokémon and your opponent's Pokémon (but Pokémon-ex)?",
        legendaryAscent: 'switch it with your Active Pokémon (then you may move basic Energy cards of its type from your other Pokémon to it)?',
        froth: "paralyze your opponent's Active Pokémon?",
        dragonBoost: 'move any number of basic Energy cards from your other Pokémon to Rayquaza ex?',
        lightningBurst: "have your opponent switch their Active Pokémon with one of their Benched Pokémon?",
        evoFlame: "make your opponent's Active Pokémon Burned and Confused?",
        evoThunder: "put a damage counter on each of your opponent's Pokémon?",
        evoSwirl: 'have your opponent shuffle their hand into their deck and draw up to 4 cards?',
        excavate: `discard the top card of your deck (${player.deck[0] ? cardName(player.deck[0]) : 'none'})? No: it stays on top`,
        crushChance: `discard ${state.stadium ? cardName(state.stadium.card) : 'the Stadium in play'}?`,
        crimsonRay: 'make each Active Pokémon (yours too) Burned?',
        yellowRay: 'put a damage counter on each Active Pokémon (yours too)?',
        blueRay: 'remove every Special Condition and 3 damage counters from each Active Pokémon (yours too)?',
        earthFissure: "discard the top 3 cards of your opponent's deck?",
        sharpEye: "look at your opponent's hand (and, if their Bench isn't full, put a Basic Pokémon from it onto their Bench and switch it in)?",
      }[choice.power];
      return { kind: 'options', prompt: `${choice.source}: ${text}`, labels: ['Yes', 'No'] };
    }
    case 'attachFromDiscard': {
      const to = choice.target === undefined ? 'one of your Pokémon' : cardName(atTarget(player, choice.target)!.card);
      const left = choice.count > 1 ? ` (${choice.count} left)` : '';
      return { kind: 'pickFromDiscard', prompt: `${choice.source}: choose a${choice.anyEnergy ? 'n' : ' basic'} Energy card from your discard pile to attach to ${to}${left}`, options: discardEnergyFor(state, player, choice) };
    }
    case 'discardToBench': {
      const what = choice.filter === 'fossil' ? 'an Omanyte or Kabuto card' : 'a Basic Pokémon (not a Baby Pokémon)';
      return { kind: 'pickFromDiscard', prompt: `${choice.source}: you may put ${what} from your discard pile onto your Bench`, options: player.discard.filter((c) => toBenchFits(state.cards, choice, c)), optional: true };
    }
    case 'moveAttached': {
      const to = atTarget(player, choice.target);
      const what = choice.type ? `basic ${choice.type[0]!.toUpperCase()}${choice.type.slice(1)} Energy cards` : 'basic Energy cards';
      return { kind: 'pickAttached', prompt: `${choice.source}: you may move ${what} from your other Pokémon to ${to ? cardName(to.card) : 'it'}, one at a time`, options: to ? otherBasicEnergy(state, player, to, choice.type) : [], optional: true };
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
      const open = (p: InPlayPokemon | null): p is InPlayPokemon => !!p && !choice.skip?.includes(p.card.uid);
      const bench = opp.bench.flatMap((p, i) => (open(p) ? [i] : []));
      const options: Target[] = choice.active && open(opp.active) ? ['active', ...bench] : bench;
      if (choice.together) return { kind: 'oppPokemon', prompt: `${choice.source}: you may click one of your opponent's Pokémon to put ${choice.count} damage counters on`, options, ...(choice.optional && { optional: true }) };
      return { kind: 'oppPokemon', prompt: `${choice.source}: click one of your opponent's ${choice.active ? '' : 'Benched '}Pokémon to put a damage counter on${left}`, options };
    }
    case 'discardFromHand':
      return {
        kind: 'pickFromHand',
        prompt: `${choice.source}: discard ${choice.count === 1 ? `a${choice.energyOnly ? 'n Energy' : ''} card` : `${choice.count} ${choice.energyOnly ? 'Energy ' : ''}cards`} from your hand`,
        options: choice.energyOnly ? player.hand.filter((c) => lookupCard(state.cards, c.defId).kind === 'energy') : choice.only === 'pokemon' ? player.hand.filter((c) => isPokemonCard(lookupCard(state.cards, c.defId))) : choice.only ? player.hand.filter((c) => handTrainerFits(c, choice.only as 'toolOrMachine' | 'toolOrSecret')) : player.hand,
      };
    case 'energyGrounding': {
      const p = atTarget(player, choice.target);
      // EXP. ALL, with the Energy card picked: which of the player's Pokémon with EXP. ALL takes it.
      if (choice.expAll && choice.cardUid) {
        const options = [player.active, ...player.bench].flatMap((q, i): Target[] => (q && choice.expAll!.includes(q.card.uid) ? [i === 0 ? 'active' : i - 1] : []));
        const which = choice.goldenWing ? 'which of your other Pokémon' : 'which of your Pokémon with EXP. ALL attached';
        return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: choose ${which} takes the Energy card`, options };
      }
      // Golden Wing: any Energy card.
      const options = p ? p.energy.filter((e) => groundable(state.cards, choice, e)) : [];
      const to = choice.goldenWing ? 'your other Pokémon' : choice.expAll ? 'your Pokémon with EXP. ALL attached' : 'your Lanturn';
      return { kind: 'pickAttached', prompt: `${choice.source}: you may choose a${choice.goldenWing ? 'n' : ' basic'} Energy card from ${p ? cardName(p.card) : 'it'} to attach to ${to}`, options, optional: true };
    }
    case 'shiftEnergy': {
      const from = atTarget(player, choice.from);
      const to = atTarget(player, choice.to);
      const options = from ? shiftable(state, from, choice.type) : [];
      const what = choice.type ? `${choice.type[0]!.toUpperCase()}${choice.type.slice(1)} Energy cards` : 'basic Energy cards';
      return { kind: 'pickAttached', prompt: `${choice.source}: you may move ${what} from ${from ? cardName(from.card) : 'it'} to ${to ? cardName(to.card) : 'it'}, one at a time`, options, optional: true };
    }
    case 'castform': {
      const options = player.deck.filter((c) => choice.names.includes(cardName(c))).sort((a, b) => cardName(a).localeCompare(cardName(b)) || a.uid.localeCompare(b.uid));
      const prompt = choice.discardOld ? `${choice.source}: choose a Basic Pokémon from your deck to switch with ${cardName(atTarget(player, choice.target)!.card)}` : `${choice.source}: choose ${choice.names.join(', ')} from your deck`;
      return { kind: 'pickFromDeck', prompt, options, optional: true };
    }
    case 'vineTease':
      return { kind: 'pickFromDeck', prompt: `${choice.source}: choose a Prize card to switch with the top card of your deck`, options: player.prizes };
    case 'removeCondition': {
      const p = atTarget(player, choice.target);
      return { kind: 'options', prompt: `${choice.source}: choose a Special Condition to remove from ${p ? cardName(p.card) : 'it'}`, labels: p ? conditionsOf(p) : [] };
    }
    case 'oppBenchPick': {
      const opp = state.players[opponentOfChoice(state, choice)]!;
      const options = targetsOf(opp).filter((t) => t !== 'active' && (choice.purpose === 'gust' || devolvable(state.cards, atTarget(opp, t)!)));
      if (choice.purpose === 'gust') return { kind: 'oppPokemon', prompt: `${choice.source}: click one of your opponent's Benched Pokémon to switch with their Active Pokémon`, options };
      return { kind: 'oppPokemon', prompt: `${choice.source}: you may click one of your opponent's Benched Evolved Pokémon to put its top card back into their hand`, options, optional: true };
    }
    case 'pealTarget':
      return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: you may click one of your Pokémon to attach Energy cards from the top 5 cards of your deck to (the others are discarded)`, options: targetsOf(player), optional: true };
    case 'cursedEyes': {
      const opp = state.players[opponentOfChoice(state, choice)]!;
      if (choice.from === undefined) return { kind: 'oppPokemon', prompt: `${choice.source}: you may click one of your opponent's Pokémon to move up to 3 damage counters from`, options: targetsOf(opp).filter((t) => atTarget(opp, t)!.damage > 0), optional: true };
      return { kind: 'oppPokemon', prompt: `${choice.source}: click another of your opponent's Pokémon to move them to`, options: targetsOf(opp).filter((t) => t !== choice.from) };
    }
    case 'skillHack': {
      const opp = state.players[opponentOfChoice(state, choice)]!;
      const card = opp.hand.find((c) => c.uid === choice.cardUid);
      if (!card) return { kind: 'oppHand', prompt: `${choice.source}: choose a Basic Pokémon or Evolution card in your opponent's hand to copy an attack of`, cards: opp.hand, options: opp.hand.filter((c) => skillHackFits(state.cards, c)) };
      return { kind: 'options', prompt: `${choice.source}: choose ${cardName(card)}'s attack to copy`, labels: (lookupCard(state.cards, card.defId) as PokemonCardDef).attacks.map((a) => a.name) };
    }
    case 'ownCounters':
      return { kind: 'ownPokemon', purpose: 'benchDamage', prompt: `${choice.source}: click one of your Pokémon to put ${choice.count} damage counters on`, options: targetsOf(player) };
    case 'handToBench': {
      const options = openBenchSlot(player.bench, state.cards, state.stadium?.card) < 0 ? [] : player.hand.filter((c) => handToBenchFits(state.cards, choice.names, c));
      return { kind: 'pickFromHand', prompt: `${choice.source}: ${choice.optional ? 'you may put' : 'put'} ${choice.names.join(', ')} from your hand onto your Bench (as a Basic Pokémon)`, options, ...(choice.optional && { optional: true }) };
    }
    case 'blissful':
      return { kind: 'ownPokemon', purpose: 'heal', prompt: `${choice.source}: you may click your Pokémon, one at a time, to discard all their Energy cards and remove all their damage counters`, options: blissfulTargets(player), optional: true };
    case 'deltaSwitch': {
      const card = choice.cardUid ? [player.active, ...player.bench].flatMap((p) => p?.energy ?? []).find((e) => e.uid === choice.cardUid) : undefined;
      if (card) return { kind: 'ownPokemon', purpose: 'attach', prompt: `${choice.source}: click the Pokémon to move ${cardName(card)} to`, options: deltaTargets(player, choice) };
      return { kind: 'pickAttached', prompt: `${choice.source}: you may move basic Energy cards attached to your Pokémon to your other Pokémon (not Mewtwo), one at a time`, options: deltaEnergy(state, player, choice), optional: true };
    }
    case 'supernatural': {
      const opp = state.players[opponentOfChoice(state, choice)]!;
      const card = choice.cardUid && supernaturalPile(player, opp, choice).find((c) => c.uid === choice.cardUid);
      if (card) {
        const resolved = resolveTrainerChoices(trainerSituation(state, player, opp, card), choice.choices ?? {});
        if ('need' in resolved && resolved.need) return supernaturalView(choice, resolved.need);
      }
      const options = supernaturalCards(state, player, opp, choice.fromDiscard, choice.own);
      const where = choice.fromDiscard ? 'discard pile' : 'hand';
      const prompt = choice.own
        ? options.length ? `${choice.source}: you may use the effect of your Supporter card in play` : `${choice.source}: you have no Supporter card in play whose effect you can use`
        : options.length ? `${choice.source}: you may choose a Supporter card in your opponent's ${where} to use its effect` : `${choice.source}: your opponent has no Supporter card you can use`;
      if (choice.fromDiscard) return { kind: 'pickFromDiscard', prompt, options, optional: true };
      return { kind: 'oppHand', prompt, cards: opp.hand, options, optional: true };
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
  /** The answer was no good: the choice is put back to be answered again, and `message` says what was wrong. */
  const retry = (next: PendingChoice, message: string) => {
    state.pendingChoice = next;
    return message;
  };
  switch (choice.kind) {
    case 'mayUse': {
      if (answer.count !== 0 && answer.count !== 1) return retry(choice, 'Yes or no');
      const p = atTarget(me, choice.target);
      if (answer.count === 1 || !p) return null;
      if (choice.power === 'legendaryAscent') {
        // It's switched with the Active Pokémon; then basic Energy cards of its type may move to it from the player's other Pokémon.
        const locked = activeLocked(state, me.id);
        if (locked) return addLog(state, locked, me.id), null;
        if (typeof choice.target === 'number') swapActive(state, me, choice.target);
        const type = inPlayDef(state.cards, p).type;
        return otherBasicEnergy(state, me, p, type).length ? again({ player: me.id, source: choice.source, kind: 'moveAttached', target: 'active', type }) : null;
      }
      if (choice.power === 'dragonBoost') {
        // Dragon Boost: any basic Energy cards from the player's other Pokémon to Rayquaza ex, one at a time.
        return otherBasicEnergy(state, me, p).length ? again({ player: me.id, source: choice.source, kind: 'moveAttached', target: choice.target }) : null;
      }
      if (choice.power === 'lightningBurst') {
        // Lightning Burst: the opponent switches their Active Pokémon with a Benched one of their choice.
        const slots = opp.bench.flatMap((q, i) => (q ? [i] : []));
        const locked = activeLocked(state, opp.id);
        if (!slots.length || locked) return addLog(state, locked ?? 'Your opponent has no Benched Pokémon.', me.id), null;
        if (slots.length === 1) return swapActive(state, opp, slots[0]!), null;
        return again({ player: opp.id, source: choice.source, kind: 'switchIn' });
      }
      if (choice.power === 'excavate') {
        const top = me.deck.shift();
        if (top) {
          me.discard.push(top);
          addLog(state, `${choice.source}: discarded the top card of the deck (${name(top)}).`, me.id);
        }
        return null;
      }
      if (choice.power === 'sharpEye') {
        // Sharp Eye: the opponent's hand, then (with room on their Bench and a Basic Pokémon in it) one put down and switched in.
        const room = openBenchSlot(opp.bench, state.cards, state.stadium?.card) >= 0;
        const basic = room && opp.hand.some((c) => isBasicPokemon(lookupCard(state.cards, c.defId)));
        return again({ player: me.id, source: choice.source, kind: basic ? 'oppHandToActive' : 'lookOppHand' });
      }
      if (choice.power === 'earthFissure') {
        const top = opp.deck.splice(0, 3);
        opp.discard.push(...top);
        addLog(state, `${choice.source}: discarded the top ${top.length} cards of the deck${top.length ? ` (${top.map(name).join(', ')})` : ''}.`, opp.id);
        return null;
      }
      if (choice.power === 'crushChance') {
        const stadium = state.stadium;
        if (!stadium) return null;
        state.players[stadium.owner]!.discard.push(stadium.card);
        state.stadium = null;
        addLog(state, `${choice.source}: discarded ${name(stadium.card)}.`, me.id);
        return null;
      }
      if (choice.power === 'crimsonRay' || choice.power === 'yellowRay' || choice.power === 'blueRay') {
        for (const side of [me, opp]) {
          const a = side.active;
          if (!a) continue;
          if (choice.power === 'crimsonRay') afflictBetweenTurns(state, side.id, a, 'burned');
          else if (choice.power === 'yellowRay') {
            a.damage += 10;
            addLog(state, `${choice.source}: put a damage counter on ${name(a.card)}.`, side.id);
          } else {
            clearSpecialConditions(a);
            const healed = Math.min(30, a.damage);
            a.damage -= healed;
            addLog(state, `${choice.source}: removed every Special Condition and ${healed / 10} damage counters from ${name(a.card)}.`, side.id);
          }
        }
        return null;
      }
      if (choice.power === 'evoFlame') {
        // Evolutionary Flame: the opponent's Active Pokémon is now Burned and Confused, unless it can't be.
        if (opp.active) for (const condition of ['burned', 'confused'] as const) afflictBetweenTurns(state, opp.id, opp.active, condition);
        return null;
      }
      if (choice.power === 'evoThunder') {
        for (const q of [opp.active, ...opp.bench]) {
          if (!q) continue;
          q.damage += 10;
          addLog(state, `${choice.source}: put a damage counter on ${name(q.card)}.`, opp.id);
        }
        return null;
      }
      if (choice.power === 'evoSwirl') {
        // Evolutionary Swirl: the opponent's hand goes into their deck; then they draw up to 4 cards, as they choose.
        [opp.deck, state.rngState] = shuffle([...opp.deck, ...opp.hand], state.rngState);
        addLog(state, `${choice.source}: shuffled ${opp.hand.length} card${opp.hand.length === 1 ? '' : 's'} from the hand into the deck.`, opp.id);
        opp.hand = [];
        return opp.deck.length ? again({ player: opp.id, source: choice.source, kind: 'drawCount', max: 4 }) : null;
      }
      if (choice.power === 'froth') {
        // Froth: the opponent's Active Pokémon is now Paralyzed, unless it can't be.
        const target = opp.active;
        if (!target) return null;
        const effect = powerActive(target, state.cards, [me, opp]) ? powerEffect(effectId(target)) : undefined;
        if (conditionProof(inPlayDef(state.cards, target)) || conditionFree(target, state.cards, effect)) return addLog(state, `${name(target.card)} can't be affected by Special Conditions.`, opp.id), null;
        target.condition = 'paralyzed';
        target.paralyzedTurn = state.turn;
        addLog(state, `${choice.source}: ${name(target.card)} is now Paralyzed.`, opp.id);
        return null;
      }
      if (choice.power === 'belt') {
        // The Belt goes; then a card from the deck that evolves from the Active Pokémon goes on it (the deck shuffled either way).
        const belt = toolOf(state.cards, p);
        if (belt) discardTool(state, me, p);
        addLog(state, `${choice.source}: discarded ${belt?.name ?? 'the Belt'}.`, me.id);
        const current = lookupCard(state.cards, p.card.defId);
        const names = [...new Set(me.deck.map((c) => lookupCard(state.cards, c.defId)).filter((d): d is PokemonCardDef => d.kind === 'pokemon' && evolvesOnto(d, current)).map((d) => d.name))];
        if (names.length) return again({ player: me.id, source: choice.source, kind: 'evolveFromDeck', target: choice.target, names, ...(choice.betweenTurns && { betweenTurns: true }) });
        [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
        return null;
      }
      if (choice.power === 'healingShower') {
        for (const side of [me, opp]) {
          for (const q of [side.active, ...side.bench]) {
            if (!q || !q.damage || inPlayDef(state.cards, q).ex) continue;
            q.damage = 0;
            addLog(state, `${choice.source}: removed all damage counters from ${name(q.card)}.`, side.id);
          }
        }
        return null;
      }
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
        // Both decks lose their top 3 first (neither player's picks change the other's deck), then each player's basic Energy go back.
        for (const player of [me, opp]) {
          const top = player.deck.splice(0, 3);
          player.discard.push(...top);
          addLog(state, `${choice.source}: discarded the top ${top.length} cards of the deck.`, player.id);
        }
        mantleEnergy(state, [me, opp], choice.source);
        return null;
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
      if (!picked) return view.kind === 'pickFromDiscard' && view.options.length ? retry(choice, 'Choose a basic Energy card from your discard pile') : null;
      me.discard = me.discard.filter((c) => c !== picked);
      if (choice.target === undefined) {
        // Each to a Pokémon clicked next; then the next card, while there are more to attach (Extra Energy Bomb).
        const more = choice.count > 1 && discardEnergyFor(state, me, choice).length > 0;
        return again({ player: me.id, source: choice.source, kind: 'attachCard', card: picked, ...((choice.notEx || choice.onlyName) && { only: { ...(choice.notEx && { notEx: true }), ...(choice.onlyName && { name: choice.onlyName }) } }), ...(more && { next: { ...choice, count: choice.count - 1 } }), ...(choice.afterAttack && { afterAttack: true }) });
      }
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
      if (slot < 0) return retry(choice, 'Your Bench is full');
      me.discard = me.discard.filter((c) => c !== picked);
      me.bench[slot] = newInPlay(picked, state.turn);
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
      return otherBasicEnergy(state, me, to, choice.type).length ? again(choice) : null;
    }
    case 'oracle': {
      if (!picked) return view.kind === 'pickFromDeck' && view.options.length ? retry(choice, 'Choose a card from your deck') : null;
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
      if (!picked) return view.kind === 'pickFromDeck' && view.options.length ? retry(choice, 'Choose one of the cards') : null;
      me.deck = me.deck.filter((c) => c !== picked);
      me.hand.push(picked);
      addLog(state, `${choice.source}: put a card from the bottom of the deck into the hand.`, me.id);
      if (choice.take > 1 && me.deck.some((c) => choice.looked.includes(c.uid))) return again({ ...choice, take: choice.take - 1 });
      return null;
    }
    case 'evolveFromHand': {
      const p = atTarget(me, choice.target);
      if (!picked || !p) return view.kind === 'pickFromHand' && view.options.length ? retry(choice, 'Choose a card from your hand') : null;
      me.hand = me.hand.filter((c) => c !== picked);
      evolveWith(state, me, p, picked, 'from the hand');
      return null;
    }
    case 'mysteryZone': {
      if (!picked) return view.kind === 'pickFromHand' && view.options.length ? retry(choice, 'Choose an Evolution card from your hand') : null;
      me.hand = me.hand.filter((c) => c !== picked);
      me.deck.push(picked);
      addLog(state, `${choice.source}: put ${name(picked)} from the hand into the deck.`, me.id);
      if (me.deck.some((c) => isBasicEnergy(lookupCard(state.cards, c.defId)))) return again({ player: me.id, source: choice.source, kind: 'pickFromDeck', filter: 'basicEnergy', reveal: true });
      [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
      return null;
    }
    case 'placeCounters': {
      const p = answer.target === 'active' && choice.active ? opp.active : typeof answer.target === 'number' ? opp.bench[answer.target] : null;
      if (choice.optional && answer.target === undefined) return null;
      if (!p || choice.skip?.includes(p.card.uid)) return view.kind === 'oppPokemon' && view.options.length ? retry(choice, `Choose one of your opponent's ${choice.active ? '' : 'Benched '}Pokémon`) : null;
      if (choice.together) {
        p.damage += 10 * choice.count;
        addLog(state, `${choice.source}: put ${choice.count} damage counters on ${name(p.card)}.`, opp.id);
        return null;
      }
      p.damage += 10;
      addLog(state, `${choice.source}: put a damage counter on ${name(p.card)}.`, opp.id);
      if (choice.count > 1) return again({ ...choice, count: choice.count - 1 });
      return null;
    }
    case 'energyGrounding': {
      const from = atTarget(me, choice.target);
      if (choice.expAll) {
        // EXP. ALL: the Energy card, then (with more than one) which Pokémon with EXP. ALL; that EXP. ALL is discarded.
        const card = choice.cardUid ? from?.energy.find((e) => e.uid === choice.cardUid) : picked;
        if (!card || !from) return null;
        const holders = [me.active, ...me.bench].filter((q): q is InPlayPokemon => !!q && choice.expAll!.includes(q.card.uid));
        if (!choice.cardUid && holders.length > 1) return again({ ...choice, cardUid: card.uid });
        const to = choice.cardUid ? (answer.target === undefined ? null : atTarget(me, answer.target)) : holders[0];
        if (!to || !holders.includes(to)) return retry(choice, 'Choose one of your Pokémon with EXP. ALL attached');
        from.energy = from.energy.filter((e) => e !== card);
        to.energy.push(card);
        // Golden Wing: up to 2 Energy cards, no Tool discarded.
        if (choice.goldenWing) {
          addLog(state, `${choice.source}: moved ${name(card)} to ${name(to.card)}.`, me.id);
          const more = choice.goldenWing > 1 && from.energy.some((e) => groundable(state.cards, choice, e));
          return more ? again({ ...choice, cardUid: undefined, goldenWing: choice.goldenWing - 1 }) : null;
        }
        discardTool(state, me, to);
        addLog(state, `${choice.source}: attached ${name(card)} to ${name(to.card)}, and discarded EXP. ALL.`, me.id);
        return null;
      }
      const to = [me.active, ...me.bench].find((q) => q?.card.uid === choice.to);
      if (!picked || !from || !to) return null;
      from.energy = from.energy.filter((e) => e !== picked);
      to.energy.push(picked);
      me.groundingTurn = state.turn;
      addLog(state, `${choice.source}: attached ${name(picked)} to ${name(to.card)}.`, me.id);
      return null;
    }
    case 'shiftEnergy': {
      const from = atTarget(me, choice.from);
      const to = atTarget(me, choice.to);
      if (!picked || !from || !to) return null;
      from.energy = from.energy.filter((e) => e !== picked);
      to.energy.push(picked);
      addLog(state, `${choice.source}: moved ${name(picked)} from ${name(from.card)} to ${name(to.card)}.`, me.id);
      return shiftable(state, from, choice.type).length ? again(choice) : null;
    }
    case 'castform': {
      const p = atTarget(me, choice.target);
      if (picked && p) {
        // The new card takes the old one's place: everything attached, damage, Special Conditions and effects stay.
        const old = p.card;
        me.deck = me.deck.filter((c) => c !== picked);
        p.card = picked;
        // Swoop! Teleporter: the old card is discarded, and the new Pokémon can use its Poké-Power this turn (agreed).
        if (choice.discardOld) {
          me.discard.push(old);
          delete p.powerUsedTurn;
        } else {
          me.deck.push(old);
          if (!choice.formChange) me.weatherTurn = state.turn;
        }
        addLog(state, `${choice.source}: switched ${name(old)} with ${name(picked)}.`, me.id);
      }
      [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
      return null;
    }
    case 'vineTease': {
      // The Prize card picked and the top card of the deck change places, unseen.
      const i = picked ? me.prizes.indexOf(picked) : -1;
      const top = me.deck[0];
      if (i < 0 || !top) return null;
      me.prizes[i] = top;
      me.deck[0] = picked!;
      addLog(state, `${choice.source}: switched a Prize card with the top card of the deck.`, me.id);
      return null;
    }
    case 'removeCondition': {
      const p = atTarget(me, choice.target);
      const label = p && answer.count !== undefined ? conditionsOf(p)[answer.count] : undefined;
      if (!p || !label) return retry(choice, 'Choose a Special Condition');
      if (label === 'Poisoned') p.poison = 0;
      else if (label === 'Burned') p.burned = false;
      else {
        p.condition = null;
        delete p.paralyzedTurn;
      }
      addLog(state, `${choice.source}: ${name(p.card)} is no longer ${label}.`, me.id);
      return null;
    }
    case 'oppBenchPick': {
      const slot = typeof answer.target === 'number' && view.kind === 'oppPokemon' && view.options.includes(answer.target) ? answer.target : undefined;
      const p = slot === undefined ? null : opp.bench[slot];
      if (!p || slot === undefined) return choice.purpose === 'devolve' && answer.target === undefined ? null : retry(choice, "Choose one of your opponent's highlighted Pokémon");
      if (choice.purpose === 'gust') {
        const locked = activeLocked(state, opp.id);
        if (locked) return addLog(state, locked, me.id), null;
        swapActive(state, opp, slot);
        return null;
      }
      // Devo Flash: its top card goes back into its player's hand.
      const top = removeTopEvolution(state, opp, p);
      opp.hand.push(top);
      clearOnLeavingActive(p);
      addLog(state, `${choice.source}: ${name(top)} went back into the hand; it's ${name(p.card)} again.`, opp.id);
      return null;
    }
    case 'pealTarget': {
      if (answer.target === undefined || !atTarget(me, answer.target)) return null;
      const looked = me.deck.slice(0, 5).map((c) => c.uid);
      return again({ player: me.id, source: choice.source, kind: 'pickFromTop', looked, take: looked.length, basicEnergy: true, anyEnergy: true, attachTo: answer.target });
    }
    case 'cursedEyes': {
      const p = answer.target === undefined ? null : atTarget(opp, answer.target);
      if (choice.from === undefined) {
        if (answer.target === undefined) return null;
        if (!p || !p.damage) return retry(choice, "Choose one of your opponent's Pokémon with damage counters");
        return again({ ...choice, from: answer.target });
      }
      const from = atTarget(opp, choice.from);
      if (!p || !from || p === from) return retry(choice, "Choose another of your opponent's Pokémon");
      // Agreed: up to 3, as many as it has.
      const moved = Math.min(30, from.damage);
      from.damage -= moved;
      p.damage += moved;
      addLog(state, `${choice.source}: moved ${moved / 10} damage counter${moved === 10 ? '' : 's'} from ${name(from.card)} to ${name(p.card)}.`, opp.id);
      return null;
    }
    case 'skillHack': {
      const card = opp.hand.find((c) => c.uid === (choice.cardUid ?? answer.cardUid));
      if (!card || !skillHackFits(state.cards, card)) return retry(choice, "Choose a Basic Pokémon or Evolution card in your opponent's hand");
      const attacks = (lookupCard(state.cards, card.defId) as PokemonCardDef).attacks;
      if (!choice.cardUid && attacks.length > 1) return again({ ...choice, cardUid: card.uid });
      const attack = attacks[choice.cardUid ? (answer.count ?? -1) : 0];
      if (!attack) return retry(choice, 'Choose an attack');
      addLog(state, `${choice.source} copies ${name(card)}'s ${attack.name}.`, me.id);
      performCopiedAttack(state, attack, card.defId);
      if (state.pendingChoice) (state.pendingChoice as PendingChoice).afterAttack = true;
      return null;
    }
    case 'ownCounters': {
      const p = answer.target === undefined ? null : atTarget(me, answer.target);
      if (!p) return targetsOf(me).length ? retry(choice, 'Choose one of your Pokémon') : null;
      p.damage += 10 * choice.count;
      addLog(state, `${choice.source}: put ${choice.count} damage counters on ${name(p.card)}.`, me.id);
      return null;
    }
    case 'handToBench': {
      if (!picked) return view.kind === 'pickFromHand' && view.options.length && !choice.optional ? retry(choice, 'Choose a card from your hand') : null;
      const slot = openBenchSlot(me.bench, state.cards, state.stadium?.card);
      if (slot < 0) return null;
      me.hand = me.hand.filter((c) => c !== picked);
      me.bench[slot] = { card: picked, evolvedFrom: [], damage: 0, energy: [], playedTurn: state.turn, asBasic: true };
      addLog(state, `${choice.source}: put ${name(picked)} onto the Bench as a Basic Pokémon.`, me.id);
      return null;
    }
    case 'blissful': {
      if (answer.target === undefined) return null;
      const p = blissfulTargets(me).includes(answer.target) ? atTarget(me, answer.target) : null;
      if (!p) return retry(choice, 'Choose one of your highlighted Pokémon');
      const energy = p.energy.filter((e) => !e.provides);
      p.energy = p.energy.filter((e) => e.provides);
      me.discard.push(...energy);
      p.damage = 0;
      addLog(state, `${choice.source}: discarded ${energy.length} Energy card${energy.length === 1 ? '' : 's'} from ${name(p.card)} and removed all its damage counters.`, me.id);
      return blissfulTargets(me).length ? again(choice) : null;
    }
    case 'deltaSwitch': {
      if (!choice.cardUid) {
        if (!picked) return answer.cardUid === undefined ? null : retry(choice, 'Choose a basic Energy card');
        return again({ ...choice, cardUid: picked.uid });
      }
      const from = [me.active, ...me.bench].find((p) => p?.energy.some((e) => e.uid === choice.cardUid));
      const to = answer.target !== undefined && deltaTargets(me, choice).includes(answer.target) ? atTarget(me, answer.target) : null;
      if (!from || !to) return retry(choice, 'Choose one of your highlighted Pokémon');
      const card = from.energy.find((e) => e.uid === choice.cardUid)!;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      addLog(state, `${choice.source}: moved ${name(card)} from ${name(from.card)} to ${name(to.card)}.`, me.id);
      return deltaEnergy(state, me, choice).length ? again({ player: me.id, source: choice.source, kind: 'deltaSwitch', exclude: choice.exclude }) : null;
    }
    case 'discardFromHand': {
      if (!picked) return view.kind === 'pickFromHand' && view.options.length ? retry(choice, 'Choose a card from your hand') : null;
      me.hand = me.hand.filter((c) => c !== picked);
      me.discard.push(picked);
      addLog(state, `${choice.source}: discarded ${name(picked)} from the hand.`, me.id);
      if (choice.count > 1 && me.hand.length) return again({ ...choice, count: choice.count - 1 });
      return null;
    }
    case 'supernatural': {
      const card = choice.cardUid ? supernaturalPile(me, opp, choice).find((c) => c.uid === choice.cardUid) : undefined;
      if (!card) {
        if (!picked) return answer.cardUid === undefined ? null : retry(choice, 'Choose a Supporter card');
        supernaturalStep(state, me, opp, { ...choice, cardUid: picked.uid, choices: {} });
        return null;
      }
      // The answer to the Supporter's open question.
      const resolved = resolveTrainerChoices(trainerSituation(state, me, opp, card), choice.choices ?? {});
      const spec = 'need' in resolved ? resolved.need : undefined;
      if (!spec) {
        supernaturalStep(state, me, opp, choice);
        return null;
      }
      const choices: TrainerChoices = { ...choice.choices };
      const set = (value: unknown) => ((choices as Record<string, unknown>)[spec.field] = value);
      if (spec.kind === 'pokemon') {
        if (answer.target === undefined || !spec.options.includes(answer.target)) return retry(choice, 'Choose one of the highlighted Pokémon');
        set(answer.target);
      } else if (spec.kind === 'stage' || spec.kind === 'pick') {
        const value = typeof answer.count === 'number' ? spec.options[answer.count] : undefined;
        if (value === undefined) return retry(choice, 'Choose one of the options');
        set(value);
      } else {
        // Cards one at a time: done at the most, or when the player stops (with at least the fewest it needs).
        const taken = [...(choice.taken ?? [])];
        if (answer.cardUid !== undefined) {
          if (!spec.options.some((c) => c.uid === answer.cardUid) || taken.includes(answer.cardUid)) return retry(choice, 'Choose one of the cards');
          taken.push(answer.cardUid);
          if (taken.length < spec.max && spec.options.length > taken.length) return again({ ...choice, taken });
        } else if (taken.length < spec.min) return retry(choice, `Choose ${spec.min} card${spec.min === 1 ? '' : 's'}`);
        set(taken);
      }
      supernaturalStep(state, me, opp, { ...choice, choices, taken: undefined });
      return null;
    }
    default:
      return null;
  }
}

/** The player's Pokémon in play with damage counters. */
export const damagedTargets = (player: Pick<PlayerState, 'active' | 'bench'>) => targetsOf(player).filter((t) => atTarget(player, t)!.damage >= 10);

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

/**
 * An attached `type` Energy card: basic, or Rainbow Energy (Soak Up). Unlike engine.ts's isEnergyCardOf, it reads the card as
 * printed: a converted, windless or Chlorophyll (`colorlessOnly`) card is still its printed type.
 */
const isEnergyCardOfType = (cards: CardLibrary, c: CardInstance, type: EnergyType) => {
  if (c.provides) return false;
  const d = lookupCard(cards, c.defId);
  return d.kind === 'energy' && (!!d.anyType || (d.energyType === type && d.basic !== false));
};

/** Lunar Power: the player's benched Pokémon this deck card evolves from (by name and stage; no other evolution limits). */
function lunarTargets(cards: CardLibrary, player: Pick<PlayerState, 'bench'>, c: CardInstance): number[] {
  const d = lookupCard(cards, c.defId);
  if (!isPokemonCard(d) || d.stage === 'basic') return [];
  return player.bench.flatMap((p, i) => {
    if (!p || p.faceDown || shapeshiftCard(p)) return [];
    const from = lookupCard(cards, p.card.defId);
    return from.kind === 'pokemon' && from.name === d.evolvesFrom && from.stage === (d.stage === 'stage2' ? 'stage1' : 'basic') ? [i] : [];
  });
}

/** Evolutionary Spore: the player's Pokémon this deck card can evolve (by name and stage), named one of `names`, not evolved by it yet. */
export function sporeTargets(state: Pick<GameState, 'players' | 'cards' | 'turn'>, choice: Extract<PendingChoice, { kind: 'evolveMany' }>, c: CardInstance): Target[] {
  const d = lookupCard(state.cards, c.defId);
  const player = state.players[choice.player]!;
  if (!isPokemonCard(d) || d.stage === 'basic') return [];
  return targetsOf(player).filter((t) => {
    const p = atTarget(player, t)!;
    const from = lookupCard(state.cards, p.card.defId);
    if (p.faceDown || shapeshiftCard(p) || choice.done.includes(baseUid(p)) || !choice.names.includes(from.name)) return false;
    // Make a Wish (agreed): the usual limits, not on a Pokémon played or evolved this turn nor on the first turn.
    if (choice.limits && (state.turn <= 2 || p.playedTurn === state.turn || p.effects?.noEvolve !== undefined)) return false;
    return from.kind === 'pokemon' && from.name === d.evolvesFrom && from.stage === (d.stage === 'stage2' ? 'stage1' : 'basic');
  });
}

/** Where a card found in the deck may be attached (attachCard): any of the player's Pokémon, or those `only` allows. */
const attachTargets = (state: Pick<GameState, 'players' | 'cards'>, choice: Extract<PendingChoice, { kind: 'attachCard' }>) => {
  const player = state.players[choice.player]!;
  // A Pokémon Tool (Hoard): only onto a Pokémon without one, that the Tool can go on (EXP. ALL: not a Pokémon-ex…).
  const tool = trainerEffect(choice.card.defId)?.tool ? trainerEffect(choice.card.defId) : undefined;
  return targetsOf(player).filter((t) => {
    const p = atTarget(player, t)!;
    const d = inPlayDef(state.cards, p);
    if (tool && (p.attached?.some((a) => a.tool) || (tool.toolFor && !tool.toolFor(d)))) return false;
    return (!choice.only?.type || hasType(d, choice.only.type)) && (!choice.only?.name || (choice.only.name === 'δ' ? isDelta(state.cards, p) : d.name.includes(choice.only.name))) && (!choice.only?.bench || t !== 'active') && (!choice.only?.notEx || !d.ex);
  });
};

/** [Vanish]: the player's Pokémon with Unown in their names it may return, but the Unown V itself and any Unown [V]. */
const unownTargets = (state: Pick<GameState, 'players' | 'cards'>, choice: Extract<PendingChoice, { kind: 'returnUnown' }>) => {
  const player = state.players[choice.player]!;
  return targetsOf(player).filter((t) => {
    const p = atTarget(player, t)!;
    const name = inPlayDef(state.cards, p).name;
    return p.card.uid !== choice.except && name.includes('Unown') && name !== 'Unown [V]';
  });
};

/** Where Energy Bomb's (benched Pokémon) or Howl's (any of the player's Pokémon of `toType`) Energy cards may go. */
const distributeTargets = (state: Pick<GameState, 'cards'>, player: Pick<PlayerState, 'active' | 'bench'>, choice: Extract<PendingChoice, { kind: 'distributeEnergy' }>) =>
  choice.toType ? targetsOf(player).filter((t) => hasType(inPlayDef(state.cards, atTarget(player, t)!), choice.toType!)) : player.bench.flatMap((p, i) => (p ? [i] : []));

/** Saffron City Gym: the player's Pokémon with Sabrina in their names that have a basic Energy card attached. */
export const saffronTargets = (cards: CardLibrary, player: Pick<PlayerState, 'active' | 'bench'>) =>
  targetsOf(player).filter((t) => {
    const p = atTarget(player, t)!;
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
  const p = atTarget(me, target)!;
  addLog(state, `Evolved ${cardName(state, p.card)} into ${cardName(state, card)} with a card from the deck.`, me.id);
  const done = [...choice.done, baseUid(p)];
  p.evolvedFrom.push(p.card);
  p.card = card;
  p.playedTurn = state.turn;
  clearOnLeavingActive(p);
  evolvedHook(state, me.id, p);
  // Make a Wish: then a damage counter on the Pokémon that used it.
  const wisher = choice.counterOn ? [me.active, ...me.bench].find((q) => q?.card.uid === choice.counterOn) : undefined;
  if (wisher) {
    wisher.damage += 10;
    addLog(state, `Put a damage counter on ${cardName(state, wisher.card)}.`, me.id);
  }
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
    const p = atTarget(me, choice.target);
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
          if (!g || !hasType(inPlayDef(state.cards, g), 'grass') || !g.damage) continue;
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
    const card = opp.hand.find((c) => c.uid === answer.cardUid && (!choice.filter || oppHandFits(state.cards, choice, c)));
    if ((answer.cardUid !== undefined || choice.exact) && !card) return "Choose a card from your opponent's hand";
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
    if (taken && !choice.exact) {
      const drawn = opp.deck.splice(0, taken);
      opp.hand.push(...drawn);
      addLog(state, `${choice.source}: drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`, opp.id);
    }
  } else if (choice.kind === 'revealEnergy') {
    const energy = me.hand.find((c) => c.uid === answer.cardUid && isBasicEnergy(lookupCard(state.cards, c.defId)));
    if (!energy) return 'Choose a basic Energy card from your hand';
    const type = (lookupCard(state.cards, energy.defId) as { energyType: EnergyType }).energyType;
    addLog(state, `${choice.source}: showed ${name(energy)}.`, me.id);
    if (me.deck.some((c) => { const d = lookupCard(state.cards, c.defId); return isBasicPokemon(d) && d.kind === 'pokemon' && hasType(d, type); })) {
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
    const p = answer.target === undefined ? null : atTarget(me, answer.target);
    if (!p || !devolvable(state.cards, p)) return 'Choose one of your Evolved Pokémon';
    const top = removeTopEvolution(state, me, p);
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
    if (choice.toBottom) {
      // Delta Control: the others go on the bottom, in the order they were.
      const rest = me.deck.filter((c) => choice.looked.includes(c.uid));
      me.deck = [...me.deck.filter((c) => !choice.looked.includes(c.uid)), ...rest];
      if (rest.length) addLog(state, `Put ${rest.length} card${rest.length === 1 ? '' : 's'} on the bottom of the deck.`, me.id);
    } else [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
  } else if (choice.kind === 'oppHandTrainer') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const trainers = opp.hand.filter((c) => oppHandFits(state.cards, choice, c));
    const card = trainers.find((c) => c.uid === answer.cardUid);
    if (trainers.length && !card) return `Choose ${choice.any ? 'a card' : choice.filter ? 'one of the cards' : 'a Trainer card'} from your opponent's hand`;
    if (card) {
      opp.hand = opp.hand.filter((c) => c !== card);
      // Flutter Trick: discarded instead. Push Aside: to the bottom of the deck.
      if (choice.place === 'discard') opp.discard.push(card);
      else if (choice.place === 'bottom') opp.deck.push(card);
      else [opp.deck, state.rngState] = shuffle([...opp.deck, card], state.rngState);
      addLog(state, choice.place === 'discard' ? `Discarded ${name(card)} from the hand.` : choice.place === 'bottom' ? `Put ${name(card)} at the bottom of the deck.` : `Shuffled ${name(card)} into the deck.`, opp.id);
    } else addLog(state, `Looked at the opponent's hand: no ${choice.any ? 'cards' : choice.filter === 'pokemon' ? 'Pokémon cards' : choice.filter === 'energy' ? 'Energy cards' : 'Trainer cards'}.`, me.id);
  } else if (choice.kind === 'powerDamage') {
    if (answer.target !== undefined) {
      const opp = state.players[opponentOf(state, me.id)]!;
      const p = atTarget(opp, answer.target);
      if (!p) return "Choose one of your opponent's Pokémon";
      const damage = choice.noWeakness ? choice.amount : applyWeaknessResistance(choice.amount, choice.type, inPlayDef(state.cards, p), p.effects);
      p.damage += damage;
      addLog(state, `${choice.source}: ${name(p.card)} took ${damage} damage.`, opp.id);
    }
  } else if (choice.kind === 'stadiumFromDiscard') {
    // Forecast: from the deck (it may find nothing), then the deck is shuffled.
    const pile = choice.fromDeck ? deckStadiums(state, me) : me.discard.filter((c) => !!trainerEffect(c.defId)?.stadium);
    const card = pile.find((c) => c.uid === answer.cardUid);
    if (!card && pile.length && !choice.fromDeck) return 'Choose a Stadium card from your discard pile';
    if (choice.fromDeck) {
      if (card) me.deck = me.deck.filter((c) => c !== card);
      [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    }
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
      opp.bench[slot] = newInPlay(card, state.turn);
      addLog(state, `${name(card)} was put onto the Bench.`, opp.id);
      swapActive(state, opp, slot);
    }
  } else if (choice.kind === 'returnUnown') {
    const target = answer.target;
    if (target === undefined || !unownTargets(state, choice).includes(target)) return 'Choose one of your other Pokémon with Unown in its name';
    if (target === 'active' && activeLocked(state, me.id)) return activeLocked(state, me.id)!;
    const p = atTarget(me, target)!;
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
      if (!card) return choice.filter === 'basicEnergy' ? 'Choose a basic Energy card from your discard pile' : choice.filter ? 'Choose a Pokémon or Supporter card from your discard pile' : 'Choose a Baby, Basic or Evolution card from your discard pile';
      me.discard = me.discard.filter((c) => c !== card);
      me.deck.push(card);
      addLog(state, `${choice.source}: ${name(card)} goes back into the deck.`, me.id);
      if (choice.count > 1 && me.discard.some((c) => toDeckFits(state.cards, choice, c))) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    // Streaming Mantle: then the opponent's basic Energy cards (shuffled back by themselves, or picked).
    if (choice.filter === 'basicEnergy' && choice.then) {
      mantleEnergy(state, [state.players[choice.then]!], choice.source);
      return null;
    }
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
    // "You may switch" (Strike and Run): no answer, no switch.
    if (!benched && choice.optional && answer.target === undefined) {
      delete state.pendingChoice;
      return null;
    }
    if (!benched) return 'Choose one of your benched Pokémon';
    const locked = activeLocked(state, me.id);
    if (locked) {
      // Nothing happens (Jaw Clamp, Sticky Nectar), and the question is over, or it would be asked again forever.
      addLog(state, `${locked}.`, me.id);
      delete state.pendingChoice;
      return null;
    }
    const old = me.active;
    // The old Active Pokémon takes the chosen slot, even if the attack Knocked it Out (it's then Knocked Out from the Bench).
    if (old) clearOnLeavingActive(old);
    me.bench[answer.target as number] = old;
    me.active = benched;
    addLog(state, old ? `${name(benched.card)} was switched in for ${name(old.card)}.` : `${name(benched.card)} is the new Active Pokémon.`, me.id);
  } else if (choice.kind === 'rival') {
    const owner = state.players[opponentOfChoice(state, choice)]!;
    const card = owner.deck.find((c) => c.uid === answer.cardUid && choice.looked.includes(c.uid) && !choice.picked.includes(c.uid));
    if (!card) return "Choose one of the cards shown from your opponent's deck";
    const picked = [...choice.picked, card.uid];
    if (picked.length < Math.min(RIVAL_PICKS, choice.looked.length)) {
      state.pendingChoice = { ...choice, picked };
      return null;
    }
    rivalHand(state, owner, picked, choice.source);
  } else if (choice.kind === 'handToPrize') {
    const card = me.hand.find((c) => c.uid === answer.cardUid);
    if (!card) return 'Choose a card from your hand';
    const faceDown = me.prizes.flatMap((c, i) => (me.faceUpPrizes?.includes(c.uid) ? [] : [i]));
    if (faceDown.length) {
      const [r, next] = nextRandom(state.rngState);
      state.rngState = next;
      const i = faceDown[Math.floor(r * faceDown.length)]!;
      const prize = me.prizes[i]!;
      me.prizes[i] = card;
      me.hand = [...me.hand.filter((c) => c !== card), prize];
      (me.faceUpPrizes ??= []).push(card.uid);
      addLog(state, `${choice.source}: ${name(card)} is now a face-up Prize card, and a face-down Prize card went into the hand.`, me.id);
    }
  } else if (choice.kind === 'handToDeck') {
    const card = me.hand.find((c) => c.uid === answer.cardUid);
    if (!card) return 'Choose a card from your hand';
    me.hand = me.hand.filter((c) => c !== card);
    me.deck.unshift(card);
    addLog(state, 'Put a card from the hand on top of the deck.', me.id);
  } else if (choice.kind === 'discardAttached') {
    const p = atTarget(me, choice.target)!;
    // Time Shard ("up to"): nothing chosen, and it's done.
    if (choice.optional && answer.cardUid === undefined) {
      delete state.pendingChoice;
      return null;
    }
    const returnable = (e: CardInstance) => (choice.holonReturn ? !e.provides && e.uid !== choice.holonReturn : !e.provides && isBasicEnergy(lookupCard(state.cards, e.defId)));
    const energy = p.energy.find((e) => e.uid === answer.cardUid && (!choice.toHand || returnable(e)));
    if (!energy) return choice.toHand ? `Choose a${choice.holonReturn ? 'n' : ' basic'} Energy card` : 'Choose an Energy card to discard';
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
    const p = atTarget(me, choice.target)!;
    const options = me.deck.filter((c) => choice.names.includes(name(c)));
    const picked = options.find((c) => c.uid === answer.cardUid);
    if (!picked && options.length && (!choice.optional || answer.cardUid !== undefined)) return 'Choose a card from your deck';
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
    const p = ok ? atTarget(me, answer.target!) : null;
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
      const opp = opponentOf(state, me.id);
      state.pendingChoice = { player: opp, source: choice.source, afterAttack: choice.afterAttack, kind: 'drawCount', max: choice.max, alsoOpponent: true };
      return null;
    }
  } else if (choice.kind === 'chainReaction') {
    const eevee = atTarget(me, choice.target)!;
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
    const energy = me.deck.filter((c) => choice.looked.includes(c.uid) && topEnergyFits(state.cards, choice, c));
    const picked = energy.find((c) => c.uid === answer.cardUid);
    if (answer.cardUid !== undefined && !picked) return `Choose one of the ${choice.anyEnergy ? '' : 'basic '}Energy cards`;
    // Peal of Thunder: each to the Pokémon chosen; the others looked at are discarded.
    const to = choice.attachTo === undefined ? null : atTarget(me, choice.attachTo);
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      if (to) to.energy.push(picked);
      else me.hand.push(picked);
      addLog(state, to ? `Attached ${name(picked)} to ${name(to.card)}.` : `Took ${name(picked)} from the deck.`, me.id);
      if (energy.length > 1) return null;
    }
    if (choice.attachTo !== undefined) {
      const rest = me.deck.filter((c) => choice.looked.includes(c.uid));
      me.deck = me.deck.filter((c) => !rest.includes(c));
      me.discard.push(...rest);
      if (rest.length) addLog(state, `${choice.source}: discarded the other ${rest.length} card${rest.length === 1 ? '' : 's'}.`, me.id);
      delete state.pendingChoice;
      return null;
    }
    [me.deck, state.rngState] = shuffle(me.deck, state.rngState);
    const next = choice.then ? state.players[choice.then] : undefined;
    if (next?.deck.length) {
      state.pendingChoice = { player: next.id, source: choice.source, kind: 'pickFromTop', looked: next.deck.slice(0, choice.take).map((c) => c.uid), take: choice.take, basicEnergy: true, ...(choice.afterAttack && { afterAttack: true }) };
      return null;
    }
  } else if (choice.kind === 'pickFromTop') {
    const looked = me.deck.filter((c) => choice.looked.includes(c.uid));
    const takeable = choice.pokeNav
      ? looked.filter((c) => pokeNavFits(state.cards, c))
      : choice.trainer
      ? looked.filter((c) => isTrainerCard(lookupCard(state.cards, c.defId)))
      : choice.master
        ? looked.filter((c) => isPokemonCard(lookupCard(state.cards, c.defId)))
        : looked;
    const picked = takeable.find((c) => c.uid === answer.cardUid);
    if (answer.cardUid !== undefined && !picked) return 'Choose one of the cards';
    if (!picked && takeable.length && !choice.master && !choice.trainer && !choice.pokeNav) return 'Choose one of the cards';
    // PokéNav: the card taken is shown; the others stay on top, in the order the player puts them.
    if (choice.pokeNav) {
      if (picked) {
        me.deck = me.deck.filter((c) => c !== picked);
        me.hand.push(picked);
        addLog(state, `Took ${name(picked)} from the deck.`, me.id);
      }
      const rest = looked.length - (picked ? 1 : 0);
      if (rest > 1) state.pendingChoice = { player: me.id, source: choice.source, kind: 'arrangeTop', count: rest };
      else delete state.pendingChoice;
      return null;
    }
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
      opp.bench[slot] = newInPlay(card, state.turn);
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
      const p = atTarget(me, answer.target);
      if (!p || (choice.evolvedNot && !fanTargets(state.cards, me, choice.evolvedNot).includes(answer.target))) return 'Choose one of your highlighted Pokémon';
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
  } else if (choice.kind === 'flee' || choice.kind === 'ninjaTrick' || choice.kind === 'protector') {
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
      const card = me.hand.find((c) => c.uid === answer.cardUid && attachableFromHand(state.cards, c, choice.type, choice.basic, choice.types));
      const to = choice.target === undefined ? me.active : atTarget(me, choice.target);
      if (!card || !to) return `Choose ${choice.type ? `a ${typeName(choice.type)}` : 'an'} Energy card from your hand`;
      me.hand = me.hand.filter((c) => c !== card);
      // To any of the player's Pokémon: which one is asked next, then the rest of the cards.
      if (choice.anyTarget) {
        const more = choice.count > 1 && me.hand.some((c) => attachableFromHand(state.cards, c, choice.type, choice.basic, choice.types));
        state.pendingChoice = { player: me.id, source: choice.source, kind: 'attachCard', card, ...(more && { next: { ...choice, count: choice.count - 1 } }), ...(choice.afterAttack && { afterAttack: true }) };
        return null;
      }
      to.energy.push(card);
      addLog(state, `Attached ${name(card)} to ${name(to.card)}.`, me.id);
      if (choice.count > 1 && me.hand.some((c) => attachableFromHand(state.cards, c, choice.type, choice.basic, choice.types))) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
  } else if (choice.kind === 'removeEach' || choice.kind === 'drainEnergy') {
    const opp = state.players[opponentOfChoice(state, choice)]!;
    const [target, ...rest] = choice.kind === 'drainEnergy' ? (['active'] as Target[]) : choice.targets;
    const p = target === undefined ? null : atTarget(opp, target);
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
      const from = atTarget(me, answer.target);
      const to = atTarget(me, choice.to);
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
      const p = atTarget(me, answer.target);
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
    const p = atTarget(me, target)!;
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
  } else if (choice.kind === 'lookOppDeck' && choice.prizes && pickingPrizes(choice, state.players[choice.own ? choice.player : opponentOfChoice(state, choice)]!.prizes)) {
    // Investigate: a Prize card to look at, or (after the first) 'Only that one'.
    const pile = state.players[choice.own ? choice.player : opponentOfChoice(state, choice)]!.prizes;
    const unpicked = unpickedPrizes(choice, pile);
    const picked = choice.picked ?? [];
    const i = answer.count;
    if (typeof i !== 'number' || i < 0 || i > unpicked.length || (i === unpicked.length && !picked.length)) return 'Choose a Prize card';
    const more = i === unpicked.length ? picked : [...picked, unpicked[i]!];
    state.pendingChoice = { ...choice, picked: more, ...((i === unpicked.length || more.length >= choice.count) && { looking: true }) };
    return null;
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
    (choice.discard ? me.discard : me.hand).push(...p.evolvedFrom, p.card, ...p.energy.map(({ provides: _, ...card }) => card), ...(p.attached ?? []).map((a) => a.card));
    me.bench[answer.target as number] = null;
    addLog(state, `${name(p.card)} and all cards attached to it ${choice.discard ? 'were discarded' : 'returned to the hand'} (${choice.source}).`, me.id);
    // Giant Stump: again while there are more than its limit.
    if (choice.limit !== undefined && me.bench.filter(Boolean).length > choice.limit) {
      state.pendingChoice = choice;
      return null;
    }
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
  } else if (choice.kind === 'fastStream') {
    if (!choice.energyUid) {
      if (!me.active?.energy.some((e) => e.uid === answer.cardUid)) return 'Choose an Energy card attached to your Active Pokémon';
      state.pendingChoice = { ...choice, energyUid: answer.cardUid };
      return null;
    }
    const to = typeof answer.target === 'number' ? me.bench[answer.target] : null;
    if (!to) return 'Choose one of your Benched Pokémon';
    const energy = me.active!.energy.find((e) => e.uid === choice.energyUid)!;
    me.active!.energy = me.active!.energy.filter((e) => e !== energy);
    to.energy.push(energy);
    addLog(state, `${choice.source}: moved ${lookupCard(state.cards, energy.defId).name} to ${lookupCard(state.cards, to.card.defId).name}.`, me.id);
  } else if (choice.kind === 'attachCard' && choice.orHand && answer.target === undefined) {
    me.hand.push(choice.card);
    addLog(state, `${choice.source}: put ${lookupCard(state.cards, choice.card.defId).name} into the hand.`, me.id);
  } else if (choice.kind === 'attachCard') {
    const p = answer.target === undefined || !attachTargets(state, choice).includes(answer.target) ? null : atTarget(me, answer.target);
    if (!p) return 'Choose one of your highlighted Pokémon';
    if (trainerEffect(choice.card.defId)?.tool) (p.attached ??= []).push({ card: choice.card, until: Number.MAX_SAFE_INTEGER, tool: true });
    else p.energy.push(choice.card);
    addLog(state, `Attached ${lookupCard(state.cards, choice.card.defId).name} to ${lookupCard(state.cards, p.card.defId).name}.`, me.id);
    if (choice.counters) {
      p.damage += 10 * choice.counters;
      addLog(state, `Put ${choice.counters} damage counters on ${lookupCard(state.cards, p.card.defId).name}.`, me.id);
    }
    if (choice.next) {
      // Bursting Up: the rest go to the Pokémon just picked.
      const { next } = choice;
      state.pendingChoice = next.kind === 'pickFromDeck' && next.attachSame ? { ...next, attach: false, attachTo: answer.target } : next;
      return null;
    }
  } else if (choice.kind === 'removeDamage') {
    const options = damagedTargets(me);
    if (options.length && (answer.target === undefined || !options.includes(answer.target))) return 'Choose one of your Pokémon with damage counters';
    const p = answer.target === undefined ? null : atTarget(me, answer.target);
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
    const options = me.deck.filter((c) => deckFilter(state.cards, choice, c, !!state.players[choice.player]?.holonVeil));
    const picked = options.find((c) => c.uid === answer.cardUid);
    // Nothing suitable in the deck: the search finds nothing.
    if (!picked && options.length > 0 && !choice.optional) return 'Choose a card from your deck';
    const benchSlot = openBenchSlot(me.bench, state.cards, state.stadium?.card);
    if (picked && choice.toBench && benchSlot < 0) return 'Your Bench is full';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      // Archie: a Stage 2 Pokémon put onto the Bench gets `stage2Counters` damage counters.
      const stage2 = choice.stage2Counters && (lookupCard(state.cards, picked.defId) as PokemonCardDef).stage === 'stage2' ? 10 * choice.stage2Counters : 0;
      if (choice.toBench) me.bench[benchSlot] = { card: picked, evolvedFrom: [], damage: stage2, energy: [], playedTurn: state.turn, ...(choice.asBasic && { asBasic: true }) };
      else if (choice.attachToActive && me.active) me.active.energy.push(picked);
      else if (choice.attachTo !== undefined && atTarget(me, choice.attachTo)) atTarget(me, choice.attachTo)!.energy.push(picked);
      else if (!choice.attach && !choice.toTop && !(choice.toolMayAttach && trainerEffect(picked.defId)?.tool)) me.hand.push(picked);
    }
    const traded = choice.tradeUid !== undefined && picked ? me.hand.find((c) => c.uid === choice.tradeUid) : undefined;
    if (traded) me.hand = me.hand.filter((c) => c !== traded);
    [me.deck, state.rngState] = shuffle(traded ? [...me.deck, traded] : me.deck, state.rngState);
    // Smooth Over: the card goes on top of the shuffled deck.
    if (picked && choice.toTop) me.deck.unshift(picked);
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
            : choice.toTop
              ? 'Put a card on top of the deck.'
            : choice.reveal || choice.attach
              ? `${choice.attach ? 'Found' : 'Took'} ${name(picked)} ${choice.attach ? 'in' : 'from'} the deck.`
              : 'Took a card from the deck.'
        : 'Found nothing in the deck.',
      me.id,
    );
    const left = (choice.count ?? 1) - 1;
    // Mining: a Pokémon Tool found may be attached to one of the player's Pokémon, or go into the hand.
    if (picked && choice.toolMayAttach && trainerEffect(picked.defId)?.tool) {
      state.pendingChoice = { player: me.id, source: choice.source, afterAttack: choice.afterAttack, kind: 'attachCard', card: picked, orHand: true };
      return null;
    }
    // The next step: which Pokémon gets the card found; then the search goes on for more (Attract Current).
    if (picked && choice.attach) {
      const next = left > 0 && me.deck.some((c) => deckFilter(state.cards, choice, c, !!state.players[choice.player]?.holonVeil)) ? { ...choice, count: left } : undefined;
      state.pendingChoice = { player: me.id, source: choice.source, afterAttack: choice.afterAttack, kind: 'attachCard', card: picked, ...(choice.attachOnly && { only: choice.attachOnly }), ...(next && { next }), ...(choice.counters && { counters: choice.counters }) };
      return null;
    }
    // More to take (Summon Minions), while there's room and something to find.
    // Lady Outing: the next must be another type; Signs of Evolution: another name.
    const found = picked && choice.distinct ? lookupCard(state.cards, picked.defId) : undefined;
    const key = found && (choice.distinct === 'type' ? (found.kind === 'energy' ? found.energyType : found.kind === 'pokemon' ? found.type : undefined) : found.name);
    const more = { ...choice, count: left, ...(key && { taken: [...(choice.taken ?? []), key] }) };
    if (picked && left > 0 && (!choice.toBench || openBenchSlot(me.bench, state.cards, state.stadium?.card) >= 0) && me.deck.some((c) => deckFilter(state.cards, more, c, !!state.players[choice.player]?.holonVeil))) {
      state.pendingChoice = more;
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
