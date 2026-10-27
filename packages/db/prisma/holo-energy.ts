// Holo Energy (agreed with the user): holo versions of basic Energy cards, found only in booster packs (about 4% of
// packs' Energy cards). Each comes in every style of the holo card library (apps/web/src/styles/holo/cards), and each
// type and style is a card of its own in the catalog: "<energy id>-holo-<style>", e.g. "base1-98-holo-rainbow" (Fire
// Energy, Rainbow). A pull unlocks one copy (CardUnlock.quantity), and a deck can hold only as many as were pulled.
import type { TcgdexCard } from './tcgdex.js';

/** A style of the holo card library, as the attributes its CSS selects on (HoloCard's data-* attributes). */
export interface HoloEnergyStyle {
  key: string;
  label: string;
  /** data-rarity. */
  rarity: string;
  /** data-trainer-gallery="true" (the Trainer Gallery styles). */
  trainerGallery?: boolean;
  /** Overrides for the styles that select on them (full arts). */
  supertype?: string;
  subtypes?: string;
}

/** Every style in the library but the one made for a single card (swsh-pikachu.css). */
export const HOLO_ENERGY_STYLES: HoloEnergyStyle[] = [
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

/**
 * EX sets TCGdex lists no reverse-holo prints for at all (EX Delta Species on). Their cards get one by the rule every other
 * EX set follows (reverseHoloCard): every card but the Pokémon-ex, the Gold Stars (☆) and the secret rares.
 */
const NO_REVERSE_DATA = new Set(['ex11', 'ex12', 'ex13', 'ex14', 'ex15', 'ex16']);

/**
 * Generation 5's sets (the Black & White series), whose reverse holos TCGdex barely lists: every card gets one by the
 * rule the series was printed by: every card numbered in the set but the Pokémon-EX, the Ultra Rares (full arts), the
 * secret rares and basic Energy; none in Dragon Vault (every card holo) or the Radiant Collection (`RC` numbers).
 */
const GEN5_REVERSE = /^bw[0-9]+$/;
const gen5Reverse = (card: TcgdexCard, official: number) =>
  /^[0-9]+$/.test(card.localId) &&
  Number(card.localId) <= official &&
  card.suffix !== 'EX' &&
  card.rarity !== 'Ultra Rare' &&
  card.rarity !== 'Secret Rare' &&
  !(card.category === 'Energy' && card.energyType === 'Normal');

/** Sets whose reverse holos are prints of their own: the EX sets, Gen 4's (DP, Platinum, HGSS, Call of Legends; agreed) and Gen 5's (by GEN5_REVERSE's rule), not the WOTC-era ones. */
const REVERSE_HOLO_SET = /^(ex|dp|pl|hgss|col)[0-9]+$/;

/**
 * The reverse-holo print of an EX or Gen 4 card (agreed with the user: collectible prints of their own): the card again,
 * id "<card id>-reverse", foil (`holo`) and marked `reverseHolo`; null for a card with none. TCGdex lists them
 * (`variants.reverse`) up to EX Unseen Forces and in every Gen 4 set; for the later EX sets the rule they follow decides
 * (NO_REVERSE_DATA), with the set's official card count (`official`) telling the secret rares apart.
 */
export function reverseHoloCard(card: TcgdexCard, official: number): TcgdexCard | null {
  if (GEN5_REVERSE.test(card.set.id)) {
    if (!gen5Reverse(card, official)) return null;
  } else {
    if (!REVERSE_HOLO_SET.test(card.set.id)) return null;
    const byRule = NO_REVERSE_DATA.has(card.set.id) && card.suffix !== 'ex' && !card.name.includes('☆') && Number(card.localId) <= official;
    if (!card.variants?.reverse && !byRule) return null;
  }
  return { ...card, id: `${card.id}-reverse`, variants: { holo: true, normal: false, reverse: true, firstEdition: false }, reverseHolo: true };
}

/**
 * The sets whose basic Energy packs give out: each pack set's own, or the closest earlier set's of its generation (the API
 * picks by release date, `packEnergy`). Base Set covers Jungle, Fossil and the promos; Base Set 2 Team Rocket; Gym Heroes
 * and Gym Challenge the later Gen 1 sets (Legendary Collection); Neo Genesis and Expedition Gen 2's; EX Ruby & Sapphire,
 * EX Emerald, EX Holon Phantoms and EX Power Keepers Gen 3's; Black & White Gen 5's. Every set with its own basic Energy must be here, or its
 * packs' Energy is never holo. Add a set here when a pack set with its own basic Energy is added (and re-seed).
 */
export const HOLO_ENERGY_SETS = ['base1', 'base4', 'gym1', 'gym2', 'neo1', 'ecard1', 'ex1', 'ex9', 'ex13', 'ex16', 'bw1'];

/** The holo versions of a basic Energy card: the same card in each style, marked with `holoEnergy` and as holo. */
export function holoEnergyCards(card: TcgdexCard): TcgdexCard[] {
  return HOLO_ENERGY_STYLES.map((style) => ({
    ...card,
    id: `${card.id}-holo-${style.key}`,
    rarity: 'Holo Energy',
    variants: { firstEdition: false, holo: true, normal: false, reverse: false },
    holoEnergy: style,
  }));
}
