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

/** Side margins of a page (the card list, and the board inside the game page, whose log reaches past them to the window edge). */
export const PAGE_WIDTH = 'px-4 lg:px-24';

/** Undoes PAGE_WIDTH's margins, for something that spans the page's full width (the hand). */
export const PAGE_BLEED = '-mx-4 lg:-mx-24';
