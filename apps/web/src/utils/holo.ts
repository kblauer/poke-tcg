// Maps our card data onto the attributes the holo card styles (src/styles/holo) select on.

/** What the holo styles need to know about a card. Accepts both catalog and engine card shapes. */
export interface HoloSource {
  /** TCGdex id, e.g. "base1-4". */
  id: string;
  /** Pokémon-ex are named "… ex" (their foil covers the border too). */
  name?: string;
  kind: string;
  stage: string | null;
  type: string | null;
  rarity?: string | null;
  holo?: boolean;
  /** Galaxy foil: around the art (a few promos and Southern Islands), or in it on a holo (Gen 1's and Gen 2's holo Pokémon). */
  galaxy?: boolean;
  /** Holo Energy: the library style it's shown in (its data-* attributes). */
  holoEnergy?: { rarity: string; trainerGallery?: boolean; supertype?: string; subtypes?: string } | null;
  /** A reverse-holo print (EX sets, id "<card id>-reverse"): foil everywhere but the art window. */
  reverseHolo?: boolean;
}

export interface HoloAttributes {
  /** Space-separated lowercase types, used as classes (sets the glow colour). */
  types: string;
  rarity: string;
  supertype: string;
  subtypes: string;
  set: string;
  number: string;
  /** Card layout the tuning in wotc.css applies to: classic (Base–Neo), e-Card, or EX (Generation 3). */
  era: 'wotc' | 'ecard' | 'ex';
  /** A Pokémon-ex (data-pokemon-ex): its foil covers the art and the border around the card (wotc.css). */
  pokemonEx: boolean;
  /** The Trainer Gallery styles (data-trainer-gallery). */
  trainerGallery: boolean;
  /** A holo Energy (data-holo-energy): its style covers the whole card, nothing masked out (wotc.css). */
  holoEnergy: boolean;
  /** Galaxy foil in the art window (data-galaxy-art): Gen 1's and Gen 2's holo Pokémon, rather than around the art. */
  galaxyArt: boolean;
  /**
   * A galaxy-art holo's mask (public/holo-masks/<card id>.png, made by tools/holo-masks): the foil shows only where it's
   * opaque, off the Pokémon.
   */
  mask: string | null;
}

const SUBTYPES: Record<string, string> = { basic: 'basic', baby: 'basic', stage1: 'stage 1', stage2: 'stage 2' };

export function holoAttributes(card: HoloSource): HoloAttributes {
  // A holo Energy's id is its Energy card's with "-holo-<style>" after it; a reverse holo's with "-reverse".
  const id = card.holoEnergy ? card.id.replace(/-holo-[a-z-]+$/, '') : card.id.replace(/-reverse$/, '');
  const split = id.lastIndexOf('-');
  const set = id.slice(0, split);
  const kind = card.kind.toLowerCase();
  const style = card.holoEnergy;
  // The galaxy foil around the art is on reverse-only prints (not holo); a holo with the galaxy foil has it in the art.
  const galaxyArt = !style && !!card.galaxy && !!card.holo;
  return {
    types: card.type?.toLowerCase() ?? '',
    rarity: style ? style.rarity : card.reverseHolo ? 'reverse holo' : card.galaxy ? 'rare holo cosmos' : card.holo ? 'rare holo' : (card.rarity ?? 'common').toLowerCase(),
    supertype: style?.supertype ?? (kind === 'pokemon' ? 'pokémon' : kind),
    // WOTC Trainers have no subtype; "item" picks the Trainer art-window shape.
    subtypes: style?.subtypes ?? (kind === 'pokemon' ? (SUBTYPES[card.stage?.toLowerCase() ?? ''] ?? 'basic') : kind === 'trainer' ? 'item' : 'basic'),
    set,
    number: id.slice(split + 1).toLowerCase(),
    era: set.startsWith('ecard') ? 'ecard' : /^ex\d/.test(set) ? 'ex' : 'wotc',
    pokemonEx: kind === 'pokemon' && / ex$/.test(card.name ?? ''),
    trainerGallery: style?.trainerGallery ?? false,
    holoEnergy: !!style,
    galaxyArt,
    mask: galaxyArt ? `/holo-masks/${id}.png` : null,
  };
}
