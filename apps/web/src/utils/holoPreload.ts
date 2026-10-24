// Loads the images the holo styles need ahead of time, so a card's foil is there when it's first viewed large.
import { holoAttributes, type HoloSource } from './holo';

/** The texture images each holo style (src/styles/holo/cards, by data-rarity) loads; the others load none. */
const TEXTURES: Record<string, string[]> = {
  'rare holo cosmos': ['/img/cosmos-bottom.png', '/img/cosmos-middle-trans.png', '/img/cosmos-top-trans.png'],
  'amazing rare': ['/img/glitter.png'],
  'radiant rare': ['/img/trainerbg.png', '/img/glitter.png'],
  'rare holo v': ['/img/illusion.png', '/img/grain.webp'],
  'rare holo vmax': ['/img/vmaxbg.jpg', '/img/glitter.png'],
  'rare holo vstar': ['/img/ancient.png'],
  'rare ultra': ['/img/trainerbg.png', '/img/illusion.png'],
  'rare rainbow': ['/img/illusion-mask.png', '/img/glitter.png'],
  'rare rainbow alt': ['/img/glitter.png'],
  'rare secret': ['/img/geometric.png', '/img/illusion-mask.png', '/img/glitter.png'],
  'rare shiny': ['/img/illusion.png'],
  'rare shiny v': ['/img/illusion.png'],
  'rare shiny vmax': ['/img/illusion.png', '/img/glitter.png'],
};

/** Images loaded (or loading) this session, kept so the browser holds on to them. */
const loaded = new Map<string, HTMLImageElement>();

/**
 * Loads the textures of the holo styles the cards are shown in, and their holo masks (utils/holo.ts), each once a
 * session. Given the account's unlocked cards on the Collection tab (locked cards are shown without their holo).
 */
export function preloadHolos(cards: HoloSource[]) {
  for (const card of cards) {
    if (!card.holo && !card.galaxy && !card.holoEnergy && !card.reverseHolo) continue;
    const attrs = holoAttributes(card);
    for (const src of [...(TEXTURES[attrs.rarity] ?? []), ...(attrs.mask ? [attrs.mask] : [])]) {
      if (!loaded.has(src)) loaded.set(src, Object.assign(new Image(), { src }));
    }
  }
}
