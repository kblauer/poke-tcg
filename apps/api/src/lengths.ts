// Pokédex lengths for Blaine's Quiz #1, which TCGdex doesn't have. Heights in decimetres by National Pokédex number
// (1–251, the WOTC era), from PokeAPI's data (data/v2/csv/pokemon.csv), rounded to the inch as the cards print them
// (checked against the printed Gym Heroes cards).
const HEIGHT_DM = [
  7, 10, 20, 6, 11, 17, 5, 10, 16, 3, 7, 11, 3, 6, 10, 3, 11, 15, 3, 7, 3, 12, 20, 35, 4,
  8, 6, 10, 4, 8, 13, 5, 9, 14, 6, 13, 6, 11, 5, 10, 8, 16, 5, 8, 12, 3, 10, 10, 15, 2,
  7, 4, 10, 8, 17, 5, 10, 7, 19, 6, 10, 13, 9, 13, 15, 8, 15, 16, 7, 10, 17, 9, 16, 4, 10,
  14, 10, 17, 12, 16, 3, 10, 8, 14, 18, 11, 17, 9, 12, 3, 15, 13, 16, 15, 88, 10, 16, 4, 13, 5,
  12, 4, 20, 4, 10, 15, 14, 12, 6, 12, 10, 19, 11, 10, 22, 4, 12, 6, 13, 8, 11, 13, 15, 14, 11,
  13, 15, 14, 9, 65, 25, 3, 3, 10, 8, 9, 8, 4, 10, 5, 13, 18, 21, 17, 16, 20, 18, 40, 22, 20,
  4, 9, 12, 18, 5, 9, 17, 6, 11, 23, 8, 18, 7, 16, 10, 14, 5, 11, 18, 5, 12, 3, 3, 3, 3,
  6, 2, 15, 6, 8, 14, 4, 4, 8, 12, 11, 4, 6, 8, 8, 3, 8, 12, 4, 14, 9, 10, 5, 20, 7,
  5, 13, 15, 6, 12, 15, 11, 92, 6, 14, 5, 18, 6, 15, 9, 6, 18, 7, 8, 4, 11, 6, 6, 9, 9,
  21, 17, 6, 14, 18, 5, 11, 6, 14, 12, 7, 14, 4, 6, 7, 12, 15, 19, 21, 20, 6, 12, 20, 52, 38,
  6,
];

/** The length printed on a card of this National Pokédex number, e.g. `6' 3"`; undefined outside 1–251. */
export function pokedexLength(dex: number | undefined): string | undefined {
  const dm = dex === undefined ? undefined : HEIGHT_DM[dex - 1];
  if (dm === undefined) return undefined;
  const inches = Math.round(dm * 3.93701);
  return `${Math.floor(inches / 12)}' ${inches % 12}"`;
}
