/**
 * The booster packs' real wrapper art, by set: scans of the English packs from the Bulbagarden Archives
 * (archives.bulbagarden.net), trimmed of their scan margins and resized, in `public/packs/<set>/`. Each set had several
 * artworks; the Packs tab shows a random one of each per visit. The Black Star Promos were never sold in packs, so
 * theirs is drawn (BoosterPack).
 */
export const PACK_ART: Record<string, string[]> = {
  base1: ['charizard', 'blastoise', 'venusaur'],
  base2: ['flareon', 'scyther', 'wigglytuff'],
  base3: ['aerodactyl', 'lapras', 'zapdos'],
  base4: ['gyarados', 'mewtwo', 'pidgeot', 'raichu'],
  base5: ['giovanni', 'gyarados', 'jessie-james', 'team-rocket'],
};

/** A random wrapper for each set that has them, as image paths: picked once per visit to the Packs tab. */
export const pickPackArt = (): Record<string, string> =>
  Object.fromEntries(Object.entries(PACK_ART).map(([set, names]) => [set, `/packs/${set}/${names[Math.floor(Math.random() * names.length)]}.jpg`]));
