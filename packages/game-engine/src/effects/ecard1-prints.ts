// Expedition (ecard1) prints of the same card: 33–70 include a non-holo print of each holo rare 1–32 (the others are
// different cards). Their attacks, powers and bodies are the holos'.

/** The non-holo prints of the holo rares (the same cards). */
const NON_HOLO: Record<string, string> = {
  'ecard1-33': 'ecard1-1', // Alakazam
  'ecard1-34': 'ecard1-2', // Ampharos
  'ecard1-35': 'ecard1-3', // Arbok
  'ecard1-37': 'ecard1-4', // Blastoise
  'ecard1-38': 'ecard1-5', // Butterfree
  'ecard1-40': 'ecard1-6', // Charizard
  'ecard1-41': 'ecard1-7', // Clefable
  'ecard1-42': 'ecard1-8', // Cloyster
  'ecard1-43': 'ecard1-9', // Dragonite
  'ecard1-44': 'ecard1-10', // Dugtrio
  'ecard1-45': 'ecard1-11', // Fearow
  'ecard1-47': 'ecard1-12', // Feraligatr
  'ecard1-48': 'ecard1-13', // Gengar
  'ecard1-49': 'ecard1-14', // Golem
  'ecard1-50': 'ecard1-15', // Kingler
  'ecard1-51': 'ecard1-16', // Machamp
  'ecard1-52': 'ecard1-17', // Magby
  'ecard1-54': 'ecard1-18', // Meganium
  'ecard1-55': 'ecard1-19', // Mew
  'ecard1-56': 'ecard1-20', // Mewtwo
  'ecard1-57': 'ecard1-21', // Ninetales
  'ecard1-58': 'ecard1-22', // Pichu
  'ecard1-59': 'ecard1-23', // Pidgeot
  'ecard1-60': 'ecard1-24', // Poliwrath
  'ecard1-61': 'ecard1-25', // Raichu
  'ecard1-62': 'ecard1-26', // Rapidash
  'ecard1-63': 'ecard1-27', // Skarmory
  'ecard1-65': 'ecard1-28', // Typhlosion
  'ecard1-66': 'ecard1-29', // Tyranitar
  'ecard1-68': 'ecard1-30', // Venusaur
  'ecard1-69': 'ecard1-31', // Vileplume
  'ecard1-70': 'ecard1-32', // Weezing
};

/** `holo`'s entries again under the ids of their non-holo prints. */
export const withNonHolo = <T>(holo: Record<string, T>): Record<string, T> => ({
  ...holo,
  ...Object.fromEntries(Object.entries(NON_HOLO).flatMap(([copy, of]) => (holo[of] ? [[copy, holo[of]]] : []))),
});
