/** The card pictures loaded ahead this session, kept so the browser holds on to them. */
const kept = new Map<string, HTMLImageElement>();

/** Pictures waiting to be loaded ahead, small ones first; the ones loading now. */
const waiting: string[] = [];
const loading = new Set<string>();

/**
 * How many pictures load ahead at a time. TCGdex's images come from one server over HTTP/1.1, where a browser opens at
 * most 6 connections: queuing a whole deck at once (both sizes, both decks: up to 160) kept the pictures on screen
 * waiting behind them, and the server turned some away, leaving cards on their backs (the run's reward cards).
 */
const AT_ONCE = 2;

/** Starts the next pictures waiting, up to AT_ONCE at a time, at low priority so the ones on screen go first. */
function pump() {
  while (loading.size < AT_ONCE && waiting.length) {
    const src = waiting.shift()!;
    loading.add(src);
    const img = Object.assign(new Image(), { decoding: 'async' as const, fetchPriority: 'low' as const });
    const done = (ok: boolean) => {
      loading.delete(src);
      // One that failed is forgotten, so a later call (the next screen, the next battle) tries it again.
      if (!ok) kept.delete(src);
      pump();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    kept.set(src, img);
    img.src = src;
  }
}

/**
 * Loads card pictures ahead (`imageUrl`s, TCGdex's), quietly in the background, each once a session: every small one
 * first (`low.webp`: the Bench, the opponent's side, the piles, the run screen), then every large one (`high.webp`: the
 * hand, the Active, the preview), a few at a time (AT_ONCE). Battles load both decks' (Game.tsx); the run screen its
 * deck's (Home.tsx), ahead of its battles. TCGdex keeps them cacheable for a year, so a picture loaded here shows at once later.
 */
export function preloadCardImages(urls: Iterable<string>) {
  const unique = [...new Set(urls)];
  const queued = new Set(waiting);
  const fresh = (size: 'low' | 'high') => unique.map((url) => `${url}/${size}.webp`).filter((src) => !kept.has(src) && !queued.has(src));
  const low = fresh('low');
  // Small pictures go ahead of any large ones still waiting; large ones after everything.
  const firstHigh = waiting.findIndex((src) => src.endsWith('/high.webp'));
  waiting.splice(firstHigh < 0 ? waiting.length : firstHigh, 0, ...low);
  waiting.push(...fresh('high'));
  pump();
}
