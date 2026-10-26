/**
 * The booster packs' real wrapper art, by set, in `public/packs/<set>/`: Gen 1's are scans of the English packs from the
 * Bulbagarden Archives (archives.bulbagarden.net), Gen 2's product photos from TCGplayer and PriceCharting (Neo Genesis's
 * Lugia a Heritage Auctions scan), Gen 3's (the EX sets, all four artworks of each) scans from the Bulbagarden Archives
 * (EX Dragon's Latios, EX Team Magma vs Team Aqua's Aggron, EX Emerald's Kyogre and EX Unseen Forces' Umbreon product
 * photos from shops and listings instead), Gen 4's (DP, Platinum, HGSS, Call of Legends) product photos from PriceCharting and
 * TCGplayer (the larger of the two; most about 450px tall), all trimmed of their margins and resized. Each set had several artworks; the
 * Packs tab shows a random one of each per visit. Gen 2's sets have only the artworks those sources had (one or two
 * each). Gen 4's have one each (Undaunted three). The Black Star Promos and Southern Islands were never sold in booster packs, so theirs are drawn (BoosterPack).
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
  ex1: ['lairon', 'mightyena', 'manectric', 'sceptile'],
  ex2: ['shiftry', 'seviper', 'zangoose', 'dusclops'],
  ex3: ['absol', 'rayquaza', 'latias', 'latios'],
  ex4: ['sharpedo', 'aggron', 'houndoom', 'walrein'],
  ex5: ['metagross', 'registeel', 'regice', 'regirock'],
  ex6: ['charizard', 'blastoise', 'pikachu', 'venusaur'],
  ex7: ['tyranitar', 'mewtwo', 'gyarados', 'scyther'],
  ex8: ['deoxys-normal', 'deoxys-defense', 'deoxys-attack', 'rayquaza'],
  ex9: ['groudon', 'deoxys-speed', 'rayquaza', 'kyogre'],
  ex10: ['typhlosion', 'steelix', 'raikou', 'umbreon'],
  ex11: ['flareon', 'metagross', 'salamence', 'dragonite'],
  ex12: ['banette', 'arcanine', 'mew', 'aerodactyl'],
  ex13: ['zangoose', 'mewtwo', 'kabutops', 'gyarados'],
  ex14: ['delcatty', 'blaziken', 'jirachi', 'charizard'],
  ex15: ['tyranitar', 'latias', 'salamence', 'nidoking'],
  ex16: ['aggron', 'raichu', 'walrein', 'absol'],
  dp1: ['palkia'],
  dp2: ['uxie-mesprit-azelf'],
  dp3: ['gallade'],
  dp4: ['cresselia'],
  dp5: ['darkrai'],
  dp6: ['lucario'],
  dp7: ['regigigas'],
  pl1: ['dialga'],
  pl2: ['leafeon'],
  pl3: ['charizard'],
  pl4: ['arceus'],
  hgss1: ['lugia'],
  hgss2: ['suicune'],
  hgss3: ['jolteon', 'rayquaza', 'skarmory'],
  hgss4: ['palkia'],
  col1: ['groudon'],
};

/** A random wrapper for each set that has them, as image paths: picked once per visit to the Packs tab. */
export const pickPackArt = (): Record<string, string> =>
  Object.fromEntries(Object.entries(PACK_ART).map(([set, names]) => [set, `/packs/${set}/${names[Math.floor(Math.random() * names.length)]}.jpg`]));
