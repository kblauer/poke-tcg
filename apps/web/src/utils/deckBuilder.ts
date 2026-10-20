// Deck builder: the search filters and editing a deck's card list. The rules themselves (60 cards, 4 of a
// name, a Basic Pokémon) are in @poke-tcg/shared, where the API checks them too.
import { GENERATIONS } from '@poke-tcg/campaign';
import { DECK_SIZE, MAX_UNOWN, maxCopiesOf, copiesAllowed, copiesOfName, deckProblems, isUnownCard, unownCount, type DeckRuleCard } from '@poke-tcg/shared';
import { CARD_TYPES, cardTitle, matchesSearch, type CatalogCard } from './cardList';

/** Pokémon stages for the stage filter. */
export const POKEMON_STAGES = [
  { value: 'Baby', label: 'Baby' },
  { value: 'Basic', label: 'Basic' },
  { value: 'Stage1', label: 'Stage 1' },
  { value: 'Stage2', label: 'Stage 2' },
];

/** A card kind, for the kind toggles. */
export type CardKind = CatalogCard['kind'];

/** The kind toggles, in this order. */
export const CARD_KINDS: { value: CardKind; label: string }[] = [
  { value: 'POKEMON', label: 'Pokémon' },
  { value: 'TRAINER', label: 'Trainer' },
  { value: 'ENERGY', label: 'Energy' },
];

export interface DeckFilter {
  search: string;
  /** The release sets to show (any of them); null is every set (`[]` is none). */
  sets: string[] | null;
  /** Kind toggles: the kinds to show (any of them); none on shows every kind. */
  kinds: CardKind[];
  /** Type toggles: Pokémon of these types and Energy providing them (any of them); none on is every type. */
  types: string[];
  /** Pokémon filters: Pokémon must match them all. */
  stage: string | null;
  minHp: number | null;
  maxHp: number | null;
  hasAbility: boolean;
  /** Show cards the engine fully implements, or the ones it doesn't (only implemented ones by default; both off or both on shows all). */
  implemented: boolean;
  notImplemented: boolean;
  /** Only holo cards: holo, galaxy foil or holo Energy (isHoloCard). */
  holoOnly: boolean;
  /** Only the account's favorite cards. */
  favorites: boolean;
  /** Show unlocked cards, or locked ones (both off, the default, or both on shows all). */
  unlocked: boolean;
  locked: boolean;
}

export const EMPTY_DECK_FILTER: DeckFilter = {
  search: '',
  sets: null,
  kinds: [],
  types: [],
  stage: null,
  minHp: null,
  maxHp: null,
  hasAbility: false,
  implemented: false,
  notImplemented: false,
  holoOnly: false,
  favorites: false,
  unlocked: false,
  locked: false,
};

/** Whether the card is a holo of any kind: holo, galaxy foil or holo Energy (the cards that count their copies). */
export const isHoloCard = (c: Pick<CatalogCard, 'holo' | 'galaxy' | 'holoEnergy'>) => c.holo || c.galaxy || c.holoEnergy !== null;

/** A card's type for the type toggles: a Pokémon's type, or the type of Energy provided (Trainers have none). */
const cardType = (c: CatalogCard) => (c.kind === 'POKEMON' ? c.type : c.kind === 'ENERGY' ? c.energyType : null);

/**
 * Cards matching the filters. The search (name or attack), sets, implemented or not, unlocked or locked and favorites apply to every card.
 * The kind toggles show those kinds (none on: every kind). The type toggles and the Pokémon filters only say
 * something about cards that have a type, or are Pokémon: a card they say nothing about (a Trainer for the
 * types, a Trainer or Energy for the Pokémon filters) still shows when its kind is toggled on, and is hidden
 * otherwise. So with no kind on, picking Fire shows Fire Pokémon and Fire Energy, and with Pokémon and
 * Trainer on, Fire Pokémon and every Trainer.
 */
export function filterForDeck(
  cards: CatalogCard[],
  f: DeckFilter,
  isLocked: (card: CatalogCard) => boolean = () => false,
  isFavorite: (cardId: string) => boolean = () => false,
): CatalogCard[] {
  const search = f.search.trim().toLowerCase();
  const pokemonFilters = f.stage !== null || f.minHp !== null || f.maxHp !== null || f.hasAbility;
  return cards.filter((c) => {
    if (search && !matchesSearch(c, search)) return false;
    if (f.sets && !f.sets.includes(c.setName)) return false;
    // Like the kind toggles: neither on shows every card.
    if ((f.implemented || f.notImplemented) && !(c.implemented ? f.implemented : f.notImplemented)) return false;
    if (f.holoOnly && !isHoloCard(c)) return false;
    if (f.favorites && !isFavorite(c.id)) return false;
    if ((f.unlocked || f.locked) && !(isLocked(c) ? f.locked : f.unlocked)) return false;
    if (f.kinds.length && !f.kinds.includes(c.kind)) return false;
    const picked = f.kinds.includes(c.kind);
    if (f.types.length) {
      const type = cardType(c);
      if (c.kind === 'TRAINER' ? !picked : type === null || !f.types.includes(type)) return false;
    }
    if (pokemonFilters) {
      if (c.kind !== 'POKEMON') return picked;
      return (
        (f.stage === null || c.stage === f.stage) &&
        (f.minHp === null || (c.hp !== null && c.hp >= f.minHp)) &&
        (f.maxHp === null || (c.hp !== null && c.hp <= f.maxHp)) &&
        (!f.hasAbility || c.hasAbility)
      );
    }
    return true;
  });
}

export type DeckSort = 'set' | 'dex' | 'type';

export const DECK_SORTS: { value: DeckSort; label: string }[] = [
  { value: 'set', label: 'Set number' },
  { value: 'dex', label: 'Dex Number' },
  { value: 'type', label: 'Type' },
];

/** What a card sorts by; null sorts last (Trainers and Energy have no Pokédex number). */
const sortValue = (c: CatalogCard, sort: DeckSort): number | null =>
  sort === 'dex' ? c.dexNumber : sort === 'type' ? (c.type ? CARD_TYPES.indexOf(c.type) : null) : c.order;

/**
 * Sorted copy. "Set number" is release order, then the number within the set; ties in the others keep
 * that order too.
 */
export function sortForDeck(cards: CatalogCard[], sort: DeckSort): CatalogCard[] {
  return [...cards].sort((a, b) => {
    const va = sortValue(a, sort);
    const vb = sortValue(b, sort);
    if (va === null || vb === null) return va === vb ? a.order - b.order : va === null ? 1 : -1;
    return va - vb || a.order - b.order;
  });
}

/** A card in a deck being built. */
export interface DeckEntry {
  cardId: string;
  quantity: number;
}

const ruleCard = (c: CatalogCard): DeckRuleCard => ({ name: c.name, kind: c.kind, stage: c.stage, basicEnergy: c.basicEnergy });

/** The deck's entries with their catalog cards (entries missing from the catalog are left out). */
export const withCards = (entries: DeckEntry[], byId: Map<string, CatalogCard>) =>
  entries.flatMap((e) => {
    const card = byId.get(e.cardId);
    return card ? [{ ...e, card }] : [];
  });

/** The generations (GENERATIONS) a deck's cards come from, by their sets; basic Energy left out, as any generation's deck may use any set's. */
export const generationsOf = (cards: ReturnType<typeof withCards>) =>
  Object.entries(GENERATIONS)
    .filter(([, g]) => cards.some((e) => !e.card.basicEnergy && g.poolSets.includes(e.card.setId)))
    .map(([id]) => Number(id));

/** Whether a deck shows with the generations `shown` on (GenerationFilter's `toggles`): any of its generations is on, and one with only basic Energy always does. */
export const deckInGenerations = (entries: DeckEntry[], byId: Map<string, CatalogCard>, shown: ReadonlySet<number>) => {
  const gens = generationsOf(withCards(entries, byId));
  return gens.length === 0 || gens.some((g) => shown.has(g));
};

/** Every generation, the generation filter's start (all on). */
export const allGenerations = () => new Set(Object.keys(GENERATIONS).map(Number));

export const deckSize = (entries: DeckEntry[]) => entries.reduce((n, e) => n + e.quantity, 0);

/** Why the deck can't be played yet; empty when it's ready. */
export const problemsOf = (entries: DeckEntry[], byId: Map<string, CatalogCard>) =>
  deckProblems(withCards(entries, byId).map((e) => ({ card: ruleCard(e.card), quantity: e.quantity })));

/**
 * Why another copy of `card` can't go in the deck, or null if it can. Locked cards can (agreed with the user): the deck
 * just can't be played until they're unlocked (lockedWarning, hasLockedCards).
 */
export function cantAdd(entries: DeckEntry[], card: CatalogCard, byId: Map<string, CatalogCard>): string | null {
  if (deckSize(entries) >= DECK_SIZE) return `The deck already has ${DECK_SIZE} cards`;
  const rules = withCards(entries, byId).map((e) => ({ card: ruleCard(e.card), quantity: e.quantity }));
  // At most 4 of a name; 1 for a Shining Pokémon or Miracle Energy.
  const most = maxCopiesOf(ruleCard(card));
  if (!card.basicEnergy && copiesOfName(rules, card.name) >= most) return `Already ${most} card${most === 1 ? '' : 's'} named ${card.name}`;
  if (isUnownCard(ruleCard(card)) && unownCount(rules) >= MAX_UNOWN) return `Already ${MAX_UNOWN} Unown (at most ${MAX_UNOWN} Basic Pokémon with Unown in their names)`;
  const own = entries.find((e) => e.cardId === card.id)?.quantity ?? 0;
  return own >= copiesAllowed(ruleCard(card)) ? `Already ${own} of this card` : null;
}

/**
 * A copy of the card is locked: not unlocked, or (a holo Energy or special holo) more copies than were pulled (`pulled`).
 * `copies` is how many the deck would hold.
 */
const lockedCopy = (card: CatalogCard, copies: number, locked: boolean, pulled: number) => locked || (card.limitedCopies && copies > pulled);

/** What adding a copy of the card means, when it locks the deck (see cantAdd); null when it doesn't. */
export function lockedWarning(entries: DeckEntry[], card: CatalogCard, locked: boolean, pulled: number): string | null {
  const copies = (entries.find((e) => e.cardId === card.id)?.quantity ?? 0) + 1;
  if (!lockedCopy(card, copies, locked, pulled)) return null;
  const what = locked ? `${cardTitle(card)} isn't unlocked yet (${card.holoEnergy ? 'pull it from a pack' : 'win it in a run'})` : `You've pulled ${pulled} of this holo`;
  return `${what}: the deck can't be played until ${locked ? 'it is' : 'you have as many as it holds'}`;
}

/** The deck holds a locked copy (see lockedWarning): it can't be played. The API's decks.list says the same (`locked`). */
export const hasLockedCards = (entries: DeckEntry[], byId: Map<string, CatalogCard>, isLocked: (card: CatalogCard) => boolean, pulled: (cardId: string) => number) =>
  withCards(entries, byId).some((e) => lockedCopy(e.card, e.quantity, isLocked(e.card), pulled(e.card.id)));

/** The problem shown for a deck with locked cards (hasLockedCards). */
export const LOCKED_DECK_PROBLEM = "Holds cards you haven't unlocked: it can't be played until you have them";

/** The deck with one more (`by` = 1) or one fewer (`by` = −1) copy of the card. */
export function changeCount(entries: DeckEntry[], cardId: string, by: 1 | -1): DeckEntry[] {
  const existing = entries.find((e) => e.cardId === cardId);
  if (!existing) return by > 0 ? [...entries, { cardId, quantity: 1 }] : entries;
  const quantity = existing.quantity + by;
  return quantity > 0 ? entries.map((e) => (e === existing ? { ...e, quantity } : e)) : entries.filter((e) => e !== existing);
}

/** Sections of the deck list, in this order. */
export const DECK_SECTIONS = [
  { kind: 'POKEMON', label: 'Pokémon' },
  { kind: 'TRAINER', label: 'Trainers' },
  { kind: 'ENERGY', label: 'Energy' },
] as const;

/** Cards of each kind in the deck (Pokémon, Trainers, Energy). */
export const deckRatio = (entries: DeckEntry[], byId: Map<string, CatalogCard>) =>
  Object.fromEntries(DECK_SECTIONS.map(({ kind }) => [kind, withCards(entries, byId).reduce((n, e) => n + (e.card.kind === kind ? e.quantity : 0), 0)])) as Record<(typeof DECK_SECTIONS)[number]['kind'], number>;

const STAGE_RANK: Record<string, number> = { Baby: 0, Basic: 1, Stage1: 2, Stage2: 3 };

/**
 * The deck's headline Pokémon, to show on its button: the highest stages first, preferring an evolved
 * Pokémon whose whole line is in the deck with 2 or more copies of each earlier stage, then the most copies.
 * Each comes from a different evolution line while there are enough lines, and names aren't repeated.
 */
export function featuredPokemon(entries: DeckEntry[], byId: Map<string, CatalogCard>, count = 3): CatalogCard[] {
  const pokemon = withCards(entries, byId).filter((e) => e.card.kind === 'POKEMON');
  const copies = new Map<string, number>();
  const evolvesFrom = new Map<string, string>();
  for (const { card, quantity } of pokemon) {
    copies.set(card.name, (copies.get(card.name) ?? 0) + quantity);
    if (card.evolvesFrom) evolvesFrom.set(card.name, card.evolvesFrom);
  }
  /** The names it evolves from, nearest first (stopping at a loop, should the data have one). */
  const earlier = (name: string) => {
    const names: string[] = [];
    for (let n = evolvesFrom.get(name); n && !names.includes(n) && n !== name; n = evolvesFrom.get(n)) names.push(n);
    return names;
  };
  const supported = (card: CatalogCard) => earlier(card.name).every((n) => (copies.get(n) ?? 0) >= 2) && (!card.evolvesFrom || copies.has(card.evolvesFrom));
  const ranked = pokemon
    .map(({ card }) => ({ card, supported: supported(card), stage: STAGE_RANK[card.stage ?? ''] ?? 1, copies: copies.get(card.name)! }))
    .sort((a, b) => Number(b.supported) - Number(a.supported) || b.stage - a.stage || b.copies - a.copies || a.card.order - b.card.order);
  const sameLine = (a: CatalogCard, b: CatalogCard) => earlier(a.name).includes(b.name) || earlier(b.name).includes(a.name);
  const picked: CatalogCard[] = [];
  for (const distinctLines of [true, false]) {
    for (const { card } of ranked) {
      if (picked.length >= count) break;
      if (picked.some((p) => p.name === card.name || (distinctLines && sameLine(p, card)))) continue;
      picked.push(card);
    }
  }
  return picked;
}
