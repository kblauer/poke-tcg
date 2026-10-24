// Card sizes on the board scale with the space the play area has: `.play-area-cards` (index.css)
// sets --card-sm and --card-lg from its container's size. Outside the board (the hand, panels)
// the fallbacks apply.

/** Width of a benched Pokémon (Slot) and of each prize card, so they match. */
export const SMALL_CARD = 'w-[var(--card-sm,5rem)]';

/** Width of an active Pokémon, and of a card shown at full size outside the board. */
export const LARGE_CARD = 'w-[var(--card-lg,7rem)]';

/**
 * Width of the columns either side of a play area (prizes on one side, deck and discard on the
 * other): one small card. Both are the same, so the play areas between them, and both active
 * slots, line up.
 */
export const SIDE_COLUMN = 'w-[var(--card-sm,5rem)] shrink-0';

/** Side margins of every page (narrow, as the site menu, NavRail, already sets the page in from the left edge). */
export const PAGE_WIDTH = 'px-4 lg:px-8';

/** Undoes PAGE_WIDTH's margins, for something that spans the page's full width (the hand). */
export const PAGE_BLEED = '-mx-4 lg:-mx-8';

// Card thumbnails off the board, at a card's 63:88 proportions, from the largest down: the sizes don't scale.

/** A Community Decks tile's featured Pokémon. */
export const CARD_THUMB_XL = 'h-[9.375rem] w-[6.72rem]';

/** A deck tile's featured Pokémon, and the current deck's card back and coin. */
export const CARD_THUMB_LG = 'h-[4.2rem] w-[3rem]';

/** A deck summary's featured Pokémon (the Practice and run deck choices). */
export const CARD_THUMB_MD = 'h-14 w-10';

/** A compact deck tile's first Pokémon (the Cosmetics tab's Assign list). */
export const CARD_THUMB_SM = 'h-[2.8rem] w-[2rem]';

/** A card in a deck's card list (the deck builder's deck, a community deck's cards). */
export const CARD_THUMB_XS = 'h-9 w-[1.6rem]';

/** A run's card (RunCard: rewards, shops, the cards unlocked this run), and its `fluid` version that shrinks to share a phone's row. */
export const RUN_CARD = 'w-28';
export const RUN_CARD_FLUID = 'w-full max-w-28';

/** The pack window's cards: the card being revealed (as big as the screen's height allows), the commons laid out, and the list of every card opened. */
export const PACK_REVEAL = 'w-[min(85vw,34rem,calc((100dvh_-_15rem)*0.716))]';
export const PACK_COMMON = 'w-36 sm:w-44 2xl:w-52';
export const PACK_SUMMARY = 'w-32 sm:w-40 2xl:w-44';
