/**
 * The booster packs' real wrapper art, by set, in `public/packs/<set>/`: Gen 1's are scans of the English packs from the
 * Bulbagarden Archives (archives.bulbagarden.net), Gen 2's product photos from TCGplayer and PriceCharting (Neo Genesis's
 * Lugia a Heritage Auctions scan), all trimmed of their margins and resized. Each set had several artworks; the Packs tab
 * shows a random one of each per visit. Gen 2's sets have only the artworks those sources had (one or two each). The
 * Black Star Promos and Southern Islands were never sold in booster packs, so theirs are drawn (BoosterPack).
 */
export const PACK_ART: Record<string, string[]> = {
  base1: ['charizard', 'blastoise', 'venusaur'],
  base2: ['flareon', 'scyther', 'wigglytuff'],
  base3: ['aerodactyl', 'lapras', 'zapdos'],
  base4: ['gyarados', 'mewtwo', 'pidgeot', 'raichu'],
  base5: ['giovanni', 'gyarados', 'jessie-james', 'team-rocket'],
  gym1: ['brock', 'erika', 'misty'],
  gym2: ['blaine', 'koga', 'sabrina'],
  neo1: ['lugia', 'typhlosion'],
  neo2: ['umbreon'],
  neo3: ['suicune'],
  neo4: ['celebi', 'tyranitar'],
  ecard1: ['blastoise'],
  ecard2: ['arcanine'],
  ecard3: ['ho-oh'],
};

/** A random wrapper for each set that has them, as image paths: picked once per visit to the Packs tab. */
export const pickPackArt = (): Record<string, string> =>
  Object.fromEntries(Object.entries(PACK_ART).map(([set, names]) => [set, `/packs/${set}/${names[Math.floor(Math.random() * names.length)]}.jpg`]));
