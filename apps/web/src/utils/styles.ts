// Class strings shared by the site's chrome, so the agreed dialog style (`bg-slate-800` with `ring-1 ring-slate-600`,
// buttons `bg-slate-600`/`hover:bg-slate-500`) is written once. Slate classes only, so the colour themes (themes.ts) reach them.

/** A dialog's or form's button, faded when disabled (the Share dialog, the account name's Save and Cancel). */
export const BUTTON = 'rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500 disabled:opacity-40';

/** The same button answering a question on the board (PendingChoicePanel, the Trainer dialog's Done), disabled while a move is in flight, and a dialog's Cancel. */
export const CHOICE_BUTTON = 'rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500';

/** An option in the attack, power and Trainer question panels: one shade lighter than the panel (slate-800), so it stands out on it. */
export const OPTION_BUTTON = 'rounded bg-slate-600 px-2 py-1 text-left text-xs transition hover:bg-slate-500 active:scale-95';

/** A page toolbar's button (the deck builder's, Community Decks'), its colours given beside it. */
/**
 * A card's move, on the card itself (the user's, 2026-11-08: no window behind them): an attack, an Ability or Pokémon
 * Power, Retreat, and the other moves on a Pokémon in play, in the hand or in the discard pile; each the slate of the old
 * window behind them, with its edge.
 */
export const MOVE_BUTTON =
  'rounded bg-slate-800/95 px-2 py-1 text-left text-xs shadow-lg shadow-black/50 ring-1 ring-slate-600 transition hover:bg-slate-700 active:scale-95 disabled:opacity-40 disabled:hover:bg-slate-800/95';

/** Why a move on a card can't be used now, under its button (MOVE_BUTTON), on the same slate so it reads over the card. */
export const MOVE_NOTE = 'max-w-60 rounded bg-slate-800/95 px-2 py-1 text-[11px] text-amber-300 ring-1 ring-slate-600';

export const PAGE_BUTTON = 'rounded px-3 py-1 text-sm disabled:opacity-40';

/** A small square button holding only an icon (the phone panel's and the music player's bars). */
export const ICON_BUTTON = 'flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-100';

/** The dimmed backdrop of a centred dialog, filling the screen; its z-index is given beside it. A click on it closes the dialog. */
export const DIALOG_BACKDROP = 'fixed inset-0 flex items-center justify-center bg-black/60 p-4';

/** A dialog's box: the shared dialog style, its size and padding given beside it. */
export const DIALOG = 'rounded-lg bg-slate-800 ring-1 ring-slate-600';

/** A run screen panel's heading (Battles, Battle with, Unlocked this run, Bag…): one style for all of them (the user's). */
export const PANEL_HEADING = 'text-lg font-semibold';

/** The count beside a panel's heading: "(3)". */
export const PANEL_COUNT = 'text-sm font-normal text-slate-400';
