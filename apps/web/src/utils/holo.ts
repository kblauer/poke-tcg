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
}

const SUBTYPES: Record<string, string> = { basic: 'basic', baby: 'basic', stage1: 'stage 1', stage2: 'stage 2' };

export function holoAttributes(card: HoloSource): HoloAttributes {
  const split = card.id.lastIndexOf('-');
  const set = card.id.slice(0, split);
  const kind = card.kind.toLowerCase();
  return {
    types: card.type?.toLowerCase() ?? '',
    rarity: card.holo ? 'rare holo' : (card.rarity ?? 'common').toLowerCase(),
    supertype: kind === 'pokemon' ? 'pokémon' : kind,
    // WOTC Trainers have no subtype; "item" picks the Trainer art-window shape.
    subtypes: kind === 'pokemon' ? (SUBTYPES[card.stage?.toLowerCase() ?? ''] ?? 'basic') : kind === 'trainer' ? 'item' : 'basic',
    set,
    number: card.id.slice(split + 1).toLowerCase(),
    era: set.startsWith('ecard') ? 'ecard' : 'wotc',
  };
}
