/** The Pokémon TCG card back (the same design since 1999): the CPU's, and every card back but the player's own. */
export const CARD_BACK = '/cardbacks/classic.jpg';

/**
 * A card back cosmetic's image (COSMETICS in the campaign package), 660×921: `public/cardbacks/<id>.jpg`, or for a TCG Pocket
 * sleeve (`sleeve-<slug>`) `public/cardbacks/sleeves/<slug>.webp`. The English and Japanese backs come from the official
 * sites (tcg.pokemon.com, pokemon-card.com); the foil ones are them with a holo texture from public/img laid over.
 */
export const cardBackUrl = (id: string) => (id.startsWith('sleeve-') ? `/cardbacks/sleeves/${id.slice('sleeve-'.length)}.webp` : `/cardbacks/${id}.jpg`);
