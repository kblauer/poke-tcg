// Trainer cards: legality, the questions a Trainer asks, and the context Trainer effects run with.
// Card-specific behaviour lives in effects/ (TRAINERS). Searches of hidden cards (the deck) can't
// be answered from a player's view, so those Trainers leave a PendingChoice that only the player
// sees the options of, answered with RESOLVE_CHOICE.
import { applyWeaknessResistance, damageChosenBenched, typeName } from './attacks.js';
import { isBasicEnergy, isBasicPokemon, isPokemonCard, isTrainerCard, lookupCard, type CardLibrary, type CardDef, type EnergyType } from './cards.js';
import { trainerEffect } from './effects/index.js';
import type { CardInstance, GameState, InPlayPokemon, PlayerId, PlayerState, Target } from './engine.js';
import { shuffle } from './rng.js';
import { offerChainReaction, trainersBlocked } from './powers.js';
import { addLog, clearOnLeavingActive, flipCoin, inPlayDef } from './status.js';

/** Answers to a Trainer's questions. Each question names the field it fills. */
export interface TrainerChoices {
  /** Other cards from your hand (to discard, shuffle away or trade). */
  handUids?: string[];
  /** Cards from a discard pile (yours, or the opponent's for Pokémon Flute). */
  discardUids?: string[];
  /** One of your Pokémon. */
  target?: Target;
  /** One of the opponent's Pokémon. */
  oppTarget?: Target;
  /** Energy attached to `target`. */
  energyUids?: string[];
  /** Energy attached to `oppTarget`. */
  oppEnergyUids?: string[];
  /** Stage of Evolution (Devolution Spray: discard that stage and higher). */
  stage?: 'stage1' | 'stage2';
}

/** A question a Trainer asks before it's played. */
export type TrainerChoiceSpec = { prompt: string } & (
  | { kind: 'cards'; field: 'handUids' | 'discardUids' | 'energyUids' | 'oppEnergyUids'; min: number; max: number; options: CardInstance[] }
  | { kind: 'pokemon'; field: 'target' | 'oppTarget'; side: 'own' | 'opp'; options: Target[] }
  | { kind: 'stage'; field: 'stage'; options: ('stage1' | 'stage2')[] }
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
}

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
      filter: 'any' | 'pokemon' | 'basicNamed' | 'basicType' | 'basicEnergy' | 'energyType' | 'baby' | 'basic' | 'evolution' | 'darkEvolution';
      name?: string | string[];
      type?: EnergyType;
      /** The card goes onto the Bench instead of into the hand (Call for Family). */
      toBench?: boolean;
      /** The card found is attached to one of the player's Pokémon, chosen next (Energy Spike), instead of going to the hand. */
      attach?: boolean;
      /** The card found is attached to the player's Active Pokémon, the attacker (Recharge), instead of going to the hand. */
      attachToActive?: boolean;
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
    }
  | {
      /** Challenge!: the opponent of the player who played it accepts (RESOLVE_CHOICE count 1) or declines (count 0). */
      kind: 'challenge';
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
      /** Discard `count` (1 if missing) of the Energy cards attached to the player's Pokémon at `target`, one at a time (Pure Body, Continuous Fireball). */
      kind: 'discardAttached';
      target: Target;
      count?: number;
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
  /** It puts cards from a discard pile into the hand, which Pokémon Tower stops (Energy Retrieval, Item Finder). */
  discardToHand?: boolean;
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
  /** Attaches the Trainer to a Pokémon until the end of turn `until`, instead of discarding it. */
  attachTo: (pokemon: InPlayPokemon, until: number) => void;
  /** Asks the player to finish a search (see PendingChoice). */
  pend: (choice: PendingChoiceInput) => void;
}

export const own = (s: TrainerSituation, t: Target) => (t === 'active' ? s.me.active : s.me.bench[t]) ?? null;
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
  return effect.blocked?.(s) ?? null;
}

/** Pokémon Tower is in play: effects can't put cards from a discard pile into the hand. */
export const pokemonTower = (s: { stadium?: CardInstance | null; cards: CardLibrary }) => !!s.stadium && def(s, s.stadium).name === 'Pokémon Tower';

/** Why the Stadium in play can't be used now (Lucky Stadium: once during each player's turn), or null. View-safe. */
export function stadiumError(stadium: CardInstance | null, usedTurn: number | undefined, turn: number): string | null {
  if (!stadium || !trainerEffect(stadium.defId)?.useStadium) return 'There is no Stadium to use';
  return usedTurn === turn ? 'You already used the Stadium this turn' : null;
}

function choiceSpecs(s: TrainerSituation, c: TrainerChoices): TrainerChoiceSpec[] {
  return trainerEffect(s.card.defId)?.choices?.(s, c) ?? [];
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
  const situation: TrainerSituation = { card, me, opp, deckCount: me.deck.length, cards: state.cards, turn: state.turn, stadium: state.stadium?.card ?? null };
  const error = trainerError(situation);
  if (error) return error;
  const resolved = resolveTrainerChoices(situation, given);
  if ('error' in resolved) return resolved.error;

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
    attachTo(pokemon, until) {
      (pokemon.attached ??= []).push({ card, until });
      attached = true;
    },
    pend(choice) {
      state.pendingChoice = { ...choice, player: me.id } as PendingChoice;
    },
  };
  addLog(state, `Played ${lookupCard(state.cards, card.defId).name}.`, me.id);
  const effect = trainerEffect(card.defId)!;
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
  if (!attached) me.discard.push(card);
  return null;
}

/** What the player choosing sees of a pending search. */
export type PendingChoiceView =
  /** Click a card to take it. `optional`: the player may also take nothing (Chain Reaction). */
  | { kind: 'pickFromDeck' | 'pickFromDiscard' | 'pickFromHand' | 'pickAttached'; prompt: string; options: CardInstance[]; optional?: boolean }
  | { kind: 'ownPokemon'; purpose: 'heal' | 'attach' | 'switchIn' | 'benchDamage'; prompt: string; options: Target[] }
  /** Click one of the opponent's Pokémon on the board (Sneak Attack), or skip. */
  | { kind: 'oppPokemon'; prompt: string; options: Target[]; optional: true }
  | { kind: 'arrangeTop'; prompt: string; cards: CardInstance[] }
  /** Accept or decline (Challenge!), answered with count 1 or 0. */
  | { kind: 'challenge'; prompt: string }
  /** The opponent's whole hand (`cards`), and the Trainer cards in it to choose from; none to choose: just carry on. */
  | { kind: 'oppHand'; prompt: string; cards: CardInstance[]; options: CardInstance[] }
  | { kind: 'drawCount'; prompt: string; max: number };

/** The options of a pending search, for the player making it. Deck cards are sorted so their order stays secret. */
export function pendingChoiceView(state: GameState, choice: PendingChoice): PendingChoiceView {
  if (choice.kind === 'arrangeTop') {
    const owner = choice.deckOwner ?? choice.player;
    const where = owner === choice.player ? '' : " on your opponent's deck";
    const cards = state.players[owner]!.deck.slice(0, choice.count);
    return { kind: 'arrangeTop', prompt: `${choice.source}: put these cards back${where} in any order (first is on top)`, cards };
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
    return { kind: 'pickFromDiscard', prompt: `${choice.source}: put a Basic Pokémon or Evolution card from your discard pile into your hand${more}`, options: player.discard.filter((c) => isPokemonCard(lookupCard(state.cards, c.defId))), optional: true };
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
  const room = player.bench.filter((p) => p === null).length;
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

/** Finishes a pending search. Mutates `state`; returns an error instead if the answer is invalid. */
export function resolvePending(state: GameState, me: PlayerState, answer: { cardUid?: string; order?: string[]; target?: Target; count?: number }): string | null {
  const choice = state.pendingChoice!;
  const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
  if (choice.kind === 'discardToHand') {
    if (answer.cardUid !== undefined) {
      const card = me.discard.find((c) => c.uid === answer.cardUid && isPokemonCard(lookupCard(state.cards, c.defId)));
      if (!card) return 'Choose a Pokémon card from your discard pile';
      me.discard = me.discard.filter((c) => c !== card);
      me.hand.push(card);
      addLog(state, `Put ${name(card)} from the discard pile into the hand.`, me.id);
      if (choice.count > 1 && me.discard.some((c) => isPokemonCard(lookupCard(state.cards, c.defId)))) {
        state.pendingChoice = { ...choice, count: choice.count - 1 };
        return null;
      }
    }
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
    const energy = p.energy.find((e) => e.uid === answer.cardUid);
    if (!energy) return 'Choose an Energy card to discard';
    p.energy = p.energy.filter((e) => e !== energy);
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
    } else addLog(state, `${name(eevee.card)} didn't use ${choice.source}.`, me.id);
    // The next Eevee waiting to be asked, if it still can.
    delete state.pendingChoice;
    offerChainReaction(state, choice.next, choice.afterAttack);
    return null;
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
    const benchSlot = me.bench.findIndex((p) => p === null);
    if (picked && choice.toBench && benchSlot < 0) return 'Your Bench is full';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      if (choice.toBench) me.bench[benchSlot] = { card: picked, evolvedFrom: [], damage: 0, energy: [], playedTurn: state.turn };
      else if (choice.attachToActive && me.active) me.active.energy.push(picked);
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
            : choice.reveal || choice.attach
              ? `${choice.attach ? 'Found' : 'Took'} ${name(picked)} ${choice.attach ? 'in' : 'from'} the deck.`
              : 'Took a card from the deck.'
        : 'Found nothing in the deck.',
      me.id,
    );
    // More to take (Summon Minions), while there's room and something to find.
    const left = (choice.count ?? 1) - 1;
    if (picked && left > 0 && (!choice.toBench || me.bench.includes(null)) && me.deck.some((c) => deckFilter(state.cards, choice, c))) {
      state.pendingChoice = { ...choice, count: left };
      return null;
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
