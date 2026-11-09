/** The card pictures loaded ahead this session, kept so the browser holds on to them. */
const kept = new Map<string, HTMLImageElement>();

/**
 * Loads card pictures ahead (`imageUrl`s, TCGdex's), quietly in the background, each once a session: every small one
 * first (`low.webp`: the Bench, the opponent's side, the piles, the run screen), then every large one (`high.webp`: the
 * hand, the Active, the preview). Battles load both decks' (Game.tsx); the run screen its deck's (Home.tsx), ahead of
 * its battles. TCGdex keeps them cacheable for a year, so a picture loaded here shows at once later.
 */
export function preloadCardImages(urls: Iterable<string>) {
  const unique = [...new Set(urls)];
  for (const size of ['low', 'high'] as const) {
    for (const url of unique) {
      const src = `${url}/${size}.webp`;
      if (!kept.has(src)) kept.set(src, Object.assign(new Image(), { src, decoding: 'async' as const }));
    }
  }
}
