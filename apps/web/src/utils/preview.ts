// Size and placement of the large card preview that follows the pointer.

const CARD_ASPECT = 88 / 63; // height / width
const PREVIEW_GAP = 20; // between pointer and preview
const VIEWPORT_MARGIN = 8;
const MIN_PREVIEW_WIDTH = 160;
const MAX_PREVIEW_WIDTH = 800;
const DEFAULT_PREVIEW_WIDTH = 288;
/** Width change per pixel of wheel delta: one ~100px mouse-wheel notch ≈ 15%. */
const WHEEL_ZOOM_RATE = 0.0015;
/** Pixels per line for wheels that report deltas in lines. */
const WHEEL_LINE_HEIGHT = 33;
const PREVIEW_WIDTH_KEY = 'poke-tcg:preview-width';

/** Largest width that still fits the window both ways (a phone is narrower than the default). */
const maxPreviewWidth = () => Math.min(MAX_PREVIEW_WIDTH, window.innerWidth - 2 * VIEWPORT_MARGIN, (window.innerHeight - 2 * VIEWPORT_MARGIN) / CARD_ASPECT);
const clampPreviewWidth = (w: number) => Math.min(Math.max(MIN_PREVIEW_WIDTH, w), maxPreviewWidth());

/** Preview size chosen with the scroll wheel; shared by every preview and remembered across reloads. */
let previewWidth = (() => {
  try {
    return Number(localStorage.getItem(PREVIEW_WIDTH_KEY)) || DEFAULT_PREVIEW_WIDTH;
  } catch {
    return DEFAULT_PREVIEW_WIDTH; // storage unavailable (private mode, blocked site data)
  }
})();

/** Current preview width, fitted to the window. */
export const getPreviewWidth = () => clampPreviewWidth(previewWidth);

/** Resizes the preview for a wheel event (up = bigger) and remembers the new size. */
export function zoomPreview(e: WheelEvent) {
  const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * WHEEL_LINE_HEIGHT : e.deltaY;
  previewWidth = clampPreviewWidth(getPreviewWidth() * Math.exp(-delta * WHEEL_ZOOM_RATE));
  try {
    localStorage.setItem(PREVIEW_WIDTH_KEY, String(Math.round(previewWidth)));
  } catch {
    // Not persisted; the size still applies for this session.
  }
}

/** Top-left corner for a preview opened by holding a card (touch screens): the middle of the window, clear of the finger. */
export function heldPreviewPosition(width: number) {
  const height = width * CARD_ASPECT;
  return { left: (window.innerWidth - width) / 2, top: Math.max(VIEWPORT_MARGIN, (window.innerHeight - height) / 2) };
}

/** Top-left corner for the preview: right of the pointer (left near the edge), vertically centred, kept on screen. */
export function previewPosition(x: number, y: number, width: number) {
  const height = width * CARD_ASPECT;
  const fitsRight = x + PREVIEW_GAP + width <= window.innerWidth - VIEWPORT_MARGIN;
  const left = fitsRight ? x + PREVIEW_GAP : x - PREVIEW_GAP - width;
  const maxTop = window.innerHeight - height - VIEWPORT_MARGIN;
  const top = Math.min(Math.max(y - height / 2, VIEWPORT_MARGIN), maxTop);
  return { left: Math.max(left, VIEWPORT_MARGIN), top: Math.max(top, VIEWPORT_MARGIN) };
}
