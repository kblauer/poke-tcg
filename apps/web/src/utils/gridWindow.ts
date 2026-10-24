// The card grid's row windowing (CardGrid): which rows of the fanned grid to render for a scroll position, and its height.

/** The grid's measured layout, in px: rows `pitch` apart (each card hangs `cardHeight` down from its row's top). */
export interface GridLayout {
  columns: number;
  pitch: number;
  cardHeight: number;
}

/** Rows rendered past the viewport's bottom edge, so a fast scroll doesn't show the grid's background first. */
export const OVERSCAN_ROWS = 2;

/** The scrolling height of `count` cards: the last row's top, and its card hanging down from it. */
export const gridHeight = (count: number, { columns, pitch, cardHeight }: GridLayout) => {
  const rows = Math.ceil(count / columns);
  return rows ? (rows - 1) * pitch + cardHeight : 0;
};

/**
 * The rows to render (`first` to `last`, inclusive) for a viewport `top` px down the grid and `height` tall. A card
 * hangs down over the next rows (the fan), so the window starts at the first row whose card still reaches the
 * viewport, not the first row whose top is in it, or cards above would pop in as their strips scroll up.
 */
export function gridWindow(count: number, layout: GridLayout, top: number, height: number) {
  const rows = Math.ceil(count / layout.columns);
  if (!rows) return { first: 0, last: -1 };
  const first = Math.max(0, Math.floor((top - layout.cardHeight) / layout.pitch));
  const last = Math.min(rows - 1, Math.floor((top + height) / layout.pitch) + OVERSCAN_ROWS);
  return { first: Math.min(first, last), last };
}
