// Card flair (agreed with the user 2026-10-25): looks bought with Stardust for one card, used by every copy of it in
// every deck (account-wide) and only on the player's own cards. First, holo patterns: a card that has a holo pattern of
// its own (a holo rare or a galaxy foil; never a reverse-holo print or a holo Energy) can be shown in any style of the
// holo card library instead. Each pattern is bought once per card (PATTERN_PRICE): one bought for Kabutops is
// Kabutops' alone. The card's own pattern and every one bought for it can be switched to at any time, for nothing.
// Second, borders (as in Pokémon TCG Pocket): a gold, rainbow or black frame over the card's printed border, for the
// low-rarity cards only (commons, uncommons and non-holo rares; never a holo of any kind), each bought once per card
// at its own price (BORDERS).
// Third, effects (as in Pokémon TCG Pocket): an animation on the card when it comes into play, attacks, evolves or
// Knocks Out the opponent's Pokémon, offered by the Pokémon's types (EFFECTS), each moment bought on its own per card
// (EFFECT_PRICE).
import type { HoloEnergyStyle } from './card-fixes.js';
import { SPECIES_TYPES } from './species-types.js';

/** A holo pattern: a style of the holo card library, as the attributes its CSS selects on (the web's HoloCard). */
export type HoloPattern = HoloEnergyStyle;

/** What can be bought for a card: one flair of each slot is shown at a time; an effect's slot is its moment (EFFECT_MOMENTS), each bought on its own while testing (the user's). */
export const FLAIR_SLOTS = ['pattern', 'border', 'effect-play', 'effect-attack', 'effect-evolve', 'effect-ko'] as const;
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
 * pastel one 5000 each, and black (the outer border alone, everything inside it as printed) 2000, a placeholder.
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
  /** For effects: the card's kind ("POKEMON"…), stage ("Basic", "Stage1"…), its first printed type ("Fire", "Lightning"…) and National Pokédex number. */
  kind?: string;
  stage?: string | null;
  type?: string | null;
  dexNumber?: number | null;
}

/** A card whose holo pattern can be switched: one with a pattern of its own, a holo rare or a galaxy foil, but not a reverse-holo print or a holo Energy (the user's). */
export const canSwitchPattern = (card: PatternCard) => (card.holo || card.galaxy) && !card.holoEnergy && !card.reverseHolo;

/** The card's own pattern (shown as Default, never bought): the galaxy foil's, or the regular holo. */
export const ownPattern = (card: PatternCard) => (card.galaxy ? 'galaxy' : 'holo');

/** The patterns a card can be given: every library style but its own, none for a card that can't switch. */
export const patternsFor = (card: PatternCard) => (canSwitchPattern(card) ? HOLO_PATTERNS.filter((p) => p.key !== ownPattern(card)) : []);

/** A card that can have a border: a common, uncommon or non-holo rare (the user's), so no holo, galaxy foil, reverse-holo print or holo Energy, and no basic Energy, which has no rarity. */
export const canHaveBorder = (card: PatternCard) => !card.holo && !card.galaxy && !card.holoEnergy && !card.reverseHolo && !card.basicEnergy;

/** A family of effects: each species type's own, Rock and Ground sharing one (earth), and the generic ones any Pokémon can have. */
export type EffectFamily = 'fire' | 'water' | 'grass' | 'electric' | 'psychic' | 'fighting' | 'earth' | 'ice' | 'flying' | 'poison' | 'bug' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'normal' | 'generic';

/** An effect: one look, played at any of the four moments (each its own purchase), offered to Pokémon of its family. */
export interface FlairEffect extends FlairOption {
  family: EffectFamily;
}

/** Stardust for one effect at one moment for one card (the user's). */
export const EFFECT_PRICE = 1000;

/**
 * The effects: one per family to start (the user's drafted ideas, tuned as they're built: README, Card flair), and
 * three generic ones. Drawn by the web's FlairEffect.
 */
export const EFFECTS: FlairEffect[] = (
  [
    ['embers', 'Embers', 'fire'],
    ['splash', 'Splash', 'water'],
    ['leaves', 'Leaves', 'grass'],
    ['sparks', 'Sparks', 'electric'],
    ['psywave', 'Psywave', 'psychic'],
    ['impact', 'Impact', 'fighting'],
    ['rockfall', 'Rockfall', 'earth'],
    ['frost', 'Frost', 'ice'],
    ['feathers', 'Feathers', 'flying'],
    ['toxic', 'Toxic Bubbles', 'poison'],
    ['fireflies', 'Fireflies', 'bug'],
    ['wisps', 'Wisps', 'ghost'],
    ['dragon-aura', 'Dragon Aura', 'dragon'],
    ['shadow', 'Shadow', 'dark'],
    ['glint', 'Glint', 'steel'],
    ['glow', 'Glow', 'normal'],
    ['sparkle', 'Sparkle', 'generic'],
    ['confetti', 'Confetti', 'generic'],
    ['starfall', 'Starfall', 'generic'],
  ] as const
).map(([key, label, family]) => ({ key, label, family, price: EFFECT_PRICE }));

/** The moments an effect plays at, by its slot: a Pokémon coming into play, attacking, evolving (on the new card), and Knocking Out the opponent's Pokémon (played on it as it goes). */
export const EFFECT_MOMENTS = { 'effect-play': 'play', 'effect-attack': 'attack', 'effect-evolve': 'evolve', 'effect-ko': 'ko' } as const;
export type EffectSlot = keyof typeof EFFECT_MOMENTS;
export type EffectMoment = (typeof EFFECT_MOMENTS)[EffectSlot];
export const isEffectSlot = (slot: string): slot is EffectSlot => slot in EFFECT_MOMENTS;

/** A printed type's family. */
const TCG_FAMILY: Record<string, EffectFamily> = { Grass: 'grass', Fire: 'fire', Water: 'water', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'dark', Metal: 'steel', Colorless: 'normal' };

/** The families a Pokémon's effects come from (the user's): its species' types as Generation 3 had them (by its Pokédex number), Rock and Ground as earth, and its printed type's (a δ Pokémon's changed type, a Dark Pokémon's Darkness). */
export function effectFamilies(card: PatternCard): Set<EffectFamily> {
  const families = new Set<EffectFamily>();
  const printed = card.type ? TCG_FAMILY[card.type] : undefined;
  if (printed) families.add(printed);
  for (const type of (card.dexNumber && SPECIES_TYPES[card.dexNumber - 1]?.split('/')) || []) families.add(type === 'rock' || type === 'ground' ? 'earth' : (type as EffectFamily));
  return families;
}

/** The effects a card can be given at a moment: a Pokémon's families' and the generic ones; evolving only on an evolved Pokémon (Stage 1 or 2); none for Trainers and Energy (yet). */
export function effectsFor(card: PatternCard, slot: EffectSlot): FlairEffect[] {
  if (card.kind?.toUpperCase() !== 'POKEMON') return [];
  if (slot === 'effect-evolve' && card.stage !== 'Stage1' && card.stage !== 'Stage2') return [];
  const families = effectFamilies(card);
  return EFFECTS.filter((e) => e.family === 'generic' || families.has(e.family));
}

/** What a card can be given in a slot: its other patterns, the borders, or its effects at that moment. */
export const flairFor = (card: PatternCard, slot: FlairSlot): FlairOption[] =>
  isEffectSlot(slot)
    ? effectsFor(card, slot)
    : slot === 'pattern'
      ? patternsFor(card).map((p) => ({ key: p.key, label: p.label, price: PATTERN_PRICE }))
      : canHaveBorder(card)
        ? BORDERS
        : [];
