// Maps our card data onto the attributes the holo card styles (src/styles/holo) select on.

/** What the holo styles need to know about a card. Accepts both catalog and engine card shapes. */
export interface HoloSource {
  /** TCGdex id, e.g. "base1-4". */
  id: string;
  kind: string;
  stage: string | null;
  type: string | null;
  rarity?: string | null;
  holo?: boolean;
  /** Galaxy foil around the art (a few promos and Southern Islands). */
  galaxy?: boolean;
  /** Holo Energy: the library style it's shown in (its data-* attributes). */
  holoEnergy?: { rarity: string; trainerGallery?: boolean; supertype?: string; subtypes?: string } | null;
}

export interface HoloAttributes {
  /** Space-separated lowercase types, used as classes (sets the glow colour). */
  types: string;
  rarity: string;
  supertype: string;
  subtypes: string;
  set: string;
  number: string;
  /** Card layout the WOTC tuning in wotc.css applies to: classic (Base–Neo) or e-Card. */
  era: 'wotc' | 'ecard';
  /** The Trainer Gallery styles (data-trainer-gallery). */
  trainerGallery: boolean;
}

const SUBTYPES: Record<string, string> = { basic: 'basic', baby: 'basic', stage1: 'stage 1', stage2: 'stage 2' };

export function holoAttributes(card: HoloSource): HoloAttributes {
  // A holo Energy's id is its Energy card's with "-holo-<style>" after it.
  const id = card.holoEnergy ? card.id.replace(/-holo-[a-z-]+$/, '') : card.id;
  const split = id.lastIndexOf('-');
  const set = id.slice(0, split);
  const kind = card.kind.toLowerCase();
  const style = card.holoEnergy;
  return {
    types: card.type?.toLowerCase() ?? '',
    rarity: style ? style.rarity : card.galaxy ? 'rare holo cosmos' : card.holo ? 'rare holo' : (card.rarity ?? 'common').toLowerCase(),
    supertype: style?.supertype ?? (kind === 'pokemon' ? 'pokémon' : kind),
    // WOTC Trainers have no subtype; "item" picks the Trainer art-window shape.
    subtypes: style?.subtypes ?? (kind === 'pokemon' ? (SUBTYPES[card.stage?.toLowerCase() ?? ''] ?? 'basic') : kind === 'trainer' ? 'item' : 'basic'),
    set,
    number: id.slice(split + 1).toLowerCase(),
    era: set.startsWith('ecard') ? 'ecard' : 'wotc',
    trainerGallery: style?.trainerGallery ?? false,
  };
}
