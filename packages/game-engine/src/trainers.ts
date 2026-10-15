// Trainer cards: legality, the questions a Trainer asks, and the context Trainer effects run with.
// Card-specific behaviour lives in effects/ (TRAINERS). Searches of hidden cards (the deck) can't
// be answered from a player's view, so those Trainers leave a PendingChoice that only the player
// sees the options of, answered with RESOLVE_CHOICE.
import { lookupCard, type CardLibrary, type CardDef } from './cards.js';
import { trainerEffect } from './effects/index.js';
import type { CardInstance, GameState, InPlayPokemon, PlayerId, PlayerState, Target } from './engine.js';
import { shuffle } from './rng.js';
import { addLog } from './status.js';

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
  me: Side & Pick<PlayerState, 'hand'>;
  opp: Side;
  deckCount: number;
  cards: CardLibrary;
  turn: number;
}

/** A search the player must finish after playing a Trainer. Only they see its options. */
export type PendingChoice =
  | {
      player: PlayerId;
      kind: 'pickFromDeck';
      /** Trainer that started it. */
      source: string;
      filter: 'any' | 'pokemon';
      /** Pokémon Trader: the hand card that goes into the deck once a card is picked. */
      tradeUid?: string;
    }
  | { player: PlayerId; kind: 'arrangeTop'; source: string; count: number };

/** Card-specific Trainer behaviour. */
export interface TrainerEffect {
  /** Played onto the Bench as a Pokémon with this HP (Clefairy Doll) instead of with PLAY_TRAINER. */
  asPokemon?: { hp: number };
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
  /** Draws up to `n` cards (an empty deck just stops; that only loses at the start of a turn). */
  draw: (player: PlayerState, n: number) => void;
  /** Puts cards into the deck and shuffles it. */
  shuffleIntoDeck: (player: PlayerState, cards: CardInstance[]) => void;
  /** Removes these cards from the player's hand and returns them. */
  fromHand: (player: PlayerState, uids: string[]) => CardInstance[];
  /** Attaches the Trainer to a Pokémon until the end of turn `until`, instead of discarding it. */
  attachTo: (pokemon: InPlayPokemon, until: number) => void;
  /** Asks the player to finish a search (see PendingChoice). */
  pend: (choice: PendingChoice extends infer C ? (C extends unknown ? Omit<C, 'player'> : never) : never) => void;
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
  if (d.kind !== 'trainer' || !effect?.play) return `${d.name} can't be played this way`;
  return effect.blocked?.(s) ?? null;
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
  const situation: TrainerSituation = { card, me, opp, deckCount: me.deck.length, cards: state.cards, turn: state.turn };
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
  trainerEffect(card.defId)!.play!(ctx);
  if (!attached) me.discard.push(card);
  return null;
}

/** What the player choosing sees of a pending search. */
export type PendingChoiceView =
  | { kind: 'pickFromDeck'; prompt: string; options: CardInstance[] }
  | { kind: 'arrangeTop'; prompt: string; cards: CardInstance[] };

/** The options of a pending search, for the player making it. Deck cards are sorted so their order stays secret. */
export function pendingChoiceView(state: GameState, choice: PendingChoice): PendingChoiceView {
  const deck = state.players[choice.player]!.deck;
  if (choice.kind === 'arrangeTop') {
    return { kind: 'arrangeTop', prompt: `${choice.source}: put these cards back in any order (first is on top)`, cards: deck.slice(0, choice.count) };
  }
  const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
  const options = deck.filter((c) => deckFilter(state.cards, choice, c)).sort((a, b) => name(a).localeCompare(name(b)) || a.uid.localeCompare(b.uid));
  const what = choice.filter === 'pokemon' ? 'a Basic Pokémon or Evolution card' : 'any card';
  return { kind: 'pickFromDeck', prompt: `${choice.source}: take ${what} from your deck`, options };
}

const deckFilter = (cards: CardLibrary, choice: Extract<PendingChoice, { kind: 'pickFromDeck' }>, c: CardInstance) => {
  const d = lookupCard(cards, c.defId);
  return choice.filter === 'any' || (d.kind === 'pokemon' && !d.trainerText);
};

/** Finishes a pending search. Mutates `state`; returns an error instead if the answer is invalid. */
export function resolvePending(state: GameState, me: PlayerState, answer: { cardUid?: string; order?: string[] }): string | null {
  const choice = state.pendingChoice!;
  if (choice.kind === 'arrangeTop') {
    const top = me.deck.slice(0, choice.count);
    const order = answer.order ?? [];
    if (order.length !== top.length || !top.every((c) => order.includes(c.uid))) return 'Put every card back';
    me.deck.splice(0, top.length, ...order.map((uid) => top.find((c) => c.uid === uid)!));
    addLog(state, `Rearranged the top ${top.length} cards of the deck.`, me.id);
  } else {
    const options = me.deck.filter((c) => deckFilter(state.cards, choice, c));
    const picked = options.find((c) => c.uid === answer.cardUid);
    // Nothing suitable in the deck: the search finds nothing.
    if (!picked && options.length > 0) return 'Choose a card from your deck';
    if (picked) {
      me.deck = me.deck.filter((c) => c !== picked);
      me.hand.push(picked);
    }
    const traded = choice.tradeUid !== undefined && picked ? me.hand.find((c) => c.uid === choice.tradeUid) : undefined;
    if (traded) me.hand = me.hand.filter((c) => c !== traded);
    [me.deck, state.rngState] = shuffle(traded ? [...me.deck, traded] : me.deck, state.rngState);
    const name = (c: CardInstance) => lookupCard(state.cards, c.defId).name;
    addLog(
      state,
      picked ? (traded ? `Traded ${name(traded)} for ${name(picked)} from the deck.` : 'Took a card from the deck.') : 'Found nothing in the deck.',
      me.id,
    );
  }
  delete state.pendingChoice;
  return null;
}
