// Class strings shared by the site's chrome, so the agreed dialog style (`bg-slate-800` with `ring-1 ring-slate-600`,
// buttons `bg-slate-600`/`hover:bg-slate-500`) is written once. Slate classes only, so the colour themes (themes.ts) reach them.

/** A dialog's or form's button, faded when disabled (the Share dialog, the account name's Save and Cancel). */
export const BUTTON = 'rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500 disabled:opacity-40';

/** The same button answering a question on the board (PendingChoicePanel, the Trainer dialog's Done), disabled while a move is in flight, and a dialog's Cancel. */
export const CHOICE_BUTTON = 'rounded bg-slate-600 px-3 py-1 text-sm hover:bg-slate-500';

/** An option in the attack, power and Trainer question panels: one shade lighter than the panel (slate-800), so it stands out on it. */
export const OPTION_BUTTON = 'rounded bg-slate-600 px-2 py-1 text-left text-xs transition hover:bg-slate-500 active:scale-95';

/** A page toolbar's button (the deck builder's, Community Decks'), its colours given beside it. */
export const PAGE_BUTTON = 'rounded px-3 py-1 text-sm disabled:opacity-40';

/** A small square button holding only an icon (the phone panel's and the music player's bars). */
export const ICON_BUTTON = 'flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-100';

/** The dimmed backdrop of a centred dialog, filling the screen; its z-index is given beside it. A click on it closes the dialog. */
export const DIALOG_BACKDROP = 'fixed inset-0 flex items-center justify-center bg-black/60 p-4';

/** A dialog's box: the shared dialog style, its size and padding given beside it. */
export const DIALOG = 'rounded-lg bg-slate-800 ring-1 ring-slate-600';
