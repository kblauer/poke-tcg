// Card flair (agreed with the user 2026-10-25): looks bought with Stardust for one card, used by every copy of it in
// every deck (account-wide) and only on the player's own cards. First, holo patterns: a card that has a holo pattern of
// its own (a holo rare or a galaxy foil; never a reverse-holo print or a holo Energy) can be shown in any style of the
// holo card library instead. Each pattern is bought once per card (PATTERN_PRICE): one bought for Kabutops is
// Kabutops' alone. The card's own pattern and every one bought for it can be switched to at any time, for nothing.
// Second, borders (as in Pokémon TCG Pocket): a gold, rainbow or black frame over the card's printed border, for the
// low-rarity cards only (commons, uncommons and non-holo rares; never a holo of any kind), each bought once per card
// at its own price (BORDERS).
import type { HoloEnergyStyle } from './card-fixes.js';

/** A holo pattern: a style of the holo card library, as the attributes its CSS selects on (the web's HoloCard). */
export type HoloPattern = HoloEnergyStyle;

/** What can be bought for a card: one flair of each slot is shown at a time. Effects come later. */
export const FLAIR_SLOTS = ['pattern', 'border'] as const;
export type FlairSlot = (typeof FLAIR_SLOTS)[number];

/** Stardust for one holo pattern for one card (the user's). */
export const PATTERN_PRICE = 5000;

/** A flair a card can be given in a slot: its key (stored in FlairUnlock and CardFlair), its name and its Stardust for one card. */
export interface FlairOption {
  key: string;
  label: string;
  price: number;
}

/**
 * The borders, each bought on its own (the user's prices): gold (brushed metal) 2000, PTCGP's rainbow and a softer,
 * pastel one 5000 each, and black (its banner left as printed, its text unreadable on black) 2000, a placeholder.
 */
export const BORDERS: FlairOption[] = [
  { key: 'gold', label: 'Gold', price: 2000 },
  { key: 'rainbow', label: 'Rainbow', price: 5000 },
  { key: 'pastel', label: 'Pastel Rainbow', price: 5000 },
  { key: 'black', label: 'Black', price: 2000 },
];

/**
 * Every style of the holo card library but the one made for a single card (swsh-pikachu.css): the holo Energy styles
 * (HOLO_ENERGY_STYLES in packages/db/prisma/holo-energy.ts, which a test keeps the same).
 */
export const HOLO_PATTERNS: HoloPattern[] = [
  { key: 'holo', label: 'Holo', rarity: 'rare holo' },
  { key: 'reverse', label: 'Reverse Holo', rarity: 'reverse holo' },
  { key: 'galaxy', label: 'Galaxy', rarity: 'rare holo cosmos' },
  { key: 'amazing', label: 'Amazing Rare', rarity: 'amazing rare' },
  { key: 'radiant', label: 'Radiant', rarity: 'radiant rare' },
  { key: 'v', label: 'V', rarity: 'rare holo v' },
  { key: 'vmax', label: 'VMAX', rarity: 'rare holo vmax' },
  { key: 'vstar', label: 'VSTAR', rarity: 'rare holo vstar' },
  { key: 'full-art', label: 'Full Art', rarity: 'rare ultra', supertype: 'pokémon' },
  { key: 'trainer-full-art', label: 'Trainer Full Art', rarity: 'rare ultra', subtypes: 'supporter' },
  { key: 'rainbow', label: 'Rainbow', rarity: 'rare rainbow' },
  { key: 'rainbow-alt', label: 'Rainbow Alt', rarity: 'rare rainbow alt' },
  { key: 'secret', label: 'Secret Rare', rarity: 'rare secret' },
  { key: 'shiny', label: 'Shiny', rarity: 'rare shiny' },
  { key: 'shiny-v', label: 'Shiny V', rarity: 'rare shiny v' },
  { key: 'shiny-vmax', label: 'Shiny VMAX', rarity: 'rare shiny vmax' },
  { key: 'gallery', label: 'Trainer Gallery', rarity: 'trainer gallery rare holo' },
  { key: 'gallery-v', label: 'Trainer Gallery V', rarity: 'rare holo v', trainerGallery: true },
  { key: 'gallery-vmax', label: 'Trainer Gallery VMAX', rarity: 'rare holo vmax', trainerGallery: true },
  { key: 'gallery-secret', label: 'Trainer Gallery Secret', rarity: 'rare secret', trainerGallery: true },
];

/** A pattern by its key, or undefined for an unknown one. */
export const holoPattern = (key: string | null | undefined) => (key ? HOLO_PATTERNS.find((p) => p.key === key) : undefined);

/** What the rules need to know about a card: the catalog's flags (the web's catalog list has them, the API works them out). */
export interface PatternCard {
  holo: boolean;
  galaxy: boolean;
  holoEnergy?: unknown;
  reverseHolo?: boolean;
  basicEnergy?: boolean;
}

/** A card whose holo pattern can be switched: one with a pattern of its own, a holo rare or a galaxy foil, but not a reverse-holo print or a holo Energy (the user's). */
export const canSwitchPattern = (card: PatternCard) => (card.holo || card.galaxy) && !card.holoEnergy && !card.reverseHolo;

/** The card's own pattern (shown as Default, never bought): the galaxy foil's, or the regular holo. */
export const ownPattern = (card: PatternCard) => (card.galaxy ? 'galaxy' : 'holo');

/** The patterns a card can be given: every library style but its own, none for a card that can't switch. */
export const patternsFor = (card: PatternCard) => (canSwitchPattern(card) ? HOLO_PATTERNS.filter((p) => p.key !== ownPattern(card)) : []);

/** A card that can have a border:a common, uncommon or non-holo rare (the user's), so no holo, galaxy foil, reverse-holo print or holo Energy, and no basic Energy, which has no rarity. */
export const canHaveBorder = (card: PatternCard) => !card.holo && !card.galaxy && !card.holoEnergy && !card.reverseHolo && !card.basicEnergy;

/** What a card can be given in a slot: its other patterns, or the borders. */
export const flairFor = (card: PatternCard, slot: FlairSlot): FlairOption[] =>
  slot === 'pattern' ? patternsFor(card).map((p) => ({ key: p.key, label: p.label, price: PATTERN_PRICE })) : canHaveBorder(card) ? BORDERS : [];
