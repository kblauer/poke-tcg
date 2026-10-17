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

// Phones and other small screens (for useMediaQuery). The Tailwind classes that go with them use the
// same breakpoint: `max-md:` (narrower than 48rem) and `md:`/`lg:` for the rest.

/**
 * A phone held upright: too narrow for anything beside the board or the active Pokémon. The attacks go under the
 * board, the game log opens over it, and the hand is smaller.
 */
export const NARROW_SCREEN = '(max-width: 767px)';

/** A phone on its side: too short for the board (two rows of cards a side, plus the hand), so the game asks to turn it upright. */
export const SIDEWAYS_PHONE = '(max-height: 500px) and (orientation: landscape)';

/** A touch screen with no mouse: nothing can be hovered, so cards are inspected by holding a finger on them. */
export const TOUCH_SCREEN = '(hover: none)';

/** The card browser and deck builder show their two columns side by side (else one at a time). */
export const WIDE_SCREEN = '(min-width: 1024px)';
