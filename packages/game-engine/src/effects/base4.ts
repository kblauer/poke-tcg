// Base Set 2 (base4): every card is a reprint of a Base Set or Jungle card (94 and 36), and works the same,
// so its effects are the original's. TCGdex words a few of them differently (Blastoise, Gyarados, Poliwrath,
// Super Energy Removal, Super Potion, Switch, Double Colorless Energy) but the printed cards play alike.
// Jungle cards map to their holo print where TCGdex has both (they share effects).

/** Each Base Set 2 card, and the card it reprints. */
export const BASE4_REPRINTS: Record<string, string> = {
  'base4-1': 'base1-1', // Alakazam
  'base4-2': 'base1-2', // Blastoise
  'base4-3': 'base1-3', // Chansey
  'base4-4': 'base1-4', // Charizard
  'base4-5': 'base2-1', // Clefable
  'base4-6': 'base1-5', // Clefairy
  'base4-7': 'base1-6', // Gyarados
  'base4-8': 'base1-7', // Hitmonchan
  'base4-9': 'base1-9', // Magneton
  'base4-10': 'base1-10', // Mewtwo
  'base4-11': 'base1-11', // Nidoking
  'base4-12': 'base2-7', // Nidoqueen
  'base4-13': 'base1-12', // Ninetales
  'base4-14': 'base2-8', // Pidgeot
  'base4-15': 'base1-13', // Poliwrath
  'base4-16': 'base1-14', // Raichu
  'base4-17': 'base2-10', // Scyther
  'base4-18': 'base1-15', // Venusaur
  'base4-19': 'base2-16', // Wigglytuff
  'base4-20': 'base1-16', // Zapdos
  'base4-21': 'base1-17', // Beedrill
  'base4-22': 'base1-18', // Dragonair
  'base4-23': 'base1-19', // Dugtrio
  'base4-24': 'base1-20', // Electabuzz
  'base4-25': 'base1-21', // Electrode
  'base4-26': 'base2-5', // Kangaskhan
  'base4-27': 'base2-6', // Mr. Mime
  'base4-28': 'base1-22', // Pidgeotto
  'base4-29': 'base2-9', // Pinsir
  'base4-30': 'base2-11', // Snorlax
  'base4-31': 'base2-13', // Venomoth
  'base4-32': 'base2-14', // Victreebel
  'base4-33': 'base1-23', // Arcanine
  'base4-34': 'base2-33', // Butterfree
  'base4-35': 'base1-24', // Charmeleon
  'base4-36': 'base1-25', // Dewgong
  'base4-37': 'base2-34', // Dodrio
  'base4-38': 'base1-26', // Dratini
  'base4-39': 'base2-35', // Exeggutor
  'base4-40': 'base1-27', // Farfetch'd
  'base4-41': 'base2-36', // Fearow
  'base4-42': 'base1-28', // Growlithe
  'base4-43': 'base1-29', // Haunter
  'base4-44': 'base1-30', // Ivysaur
  'base4-45': 'base1-31', // Jynx
  'base4-46': 'base1-32', // Kadabra
  'base4-47': 'base1-33', // Kakuna
  'base4-48': 'base2-38', // Lickitung
  'base4-49': 'base1-34', // Machoke
  'base4-50': 'base1-35', // Magikarp
  'base4-51': 'base1-36', // Magmar
  'base4-52': 'base2-39', // Marowak
  'base4-53': 'base2-40', // Nidorina
  'base4-54': 'base1-37', // Nidorino
  'base4-55': 'base2-41', // Parasect
  'base4-56': 'base2-42', // Persian
  'base4-57': 'base1-38', // Poliwhirl
  'base4-58': 'base1-40', // Raticate
  'base4-59': 'base2-45', // Rhydon
  'base4-60': 'base2-46', // Seaking
  'base4-61': 'base1-41', // Seel
  'base4-62': 'base2-47', // Tauros
  'base4-63': 'base1-42', // Wartortle
  'base4-64': 'base2-48', // Weepinbell
  'base4-65': 'base1-43', // Abra
  'base4-66': 'base2-49', // Bellsprout
  'base4-67': 'base1-44', // Bulbasaur
  'base4-68': 'base1-45', // Caterpie
  'base4-69': 'base1-46', // Charmander
  'base4-70': 'base2-50', // Cubone
  'base4-71': 'base1-47', // Diglett
  'base4-72': 'base1-48', // Doduo
  'base4-73': 'base1-49', // Drowzee
  'base4-74': 'base2-52', // Exeggcute
  'base4-75': 'base1-50', // Gastly
  'base4-76': 'base2-53', // Goldeen
  'base4-77': 'base2-54', // Jigglypuff
  'base4-78': 'base1-52', // Machop
  'base4-79': 'base1-53', // Magnemite
  'base4-80': 'base2-56', // Meowth
  'base4-81': 'base1-54', // Metapod
  'base4-82': 'base2-57', // Nidoran♀
  'base4-83': 'base1-55', // Nidoran♂
  'base4-84': 'base1-56', // Onix
  'base4-85': 'base2-59', // Paras
  'base4-86': 'base1-57', // Pidgey
  'base4-87': 'base1-58', // Pikachu
  'base4-88': 'base1-59', // Poliwag
  'base4-89': 'base1-61', // Rattata
  'base4-90': 'base2-61', // Rhyhorn
  'base4-91': 'base1-62', // Sandshrew
  'base4-92': 'base2-62', // Spearow
  'base4-93': 'base1-63', // Squirtle
  'base4-94': 'base1-64', // Starmie
  'base4-95': 'base1-65', // Staryu
  'base4-96': 'base1-66', // Tangela
  'base4-97': 'base2-63', // Venonat
  'base4-98': 'base1-67', // Voltorb
  'base4-99': 'base1-68', // Vulpix
  'base4-100': 'base1-69', // Weedle
  'base4-101': 'base1-71', // Computer Search
  'base4-102': 'base1-73', // Impostor Professor Oak
  'base4-103': 'base1-74', // Item Finder
  'base4-104': 'base1-75', // Lass
  'base4-105': 'base1-76', // Pokémon Breeder
  'base4-106': 'base1-77', // Pokémon Trader
  'base4-107': 'base1-78', // Scoop Up
  'base4-108': 'base1-79', // Super Energy Removal
  'base4-109': 'base1-80', // Defender
  'base4-110': 'base1-81', // Energy Retrieval
  'base4-111': 'base1-82', // Full Heal
  'base4-112': 'base1-83', // Maintenance
  'base4-113': 'base1-84', // PlusPower
  'base4-114': 'base1-85', // Pokémon Center
  'base4-115': 'base1-87', // Pokédex
  'base4-116': 'base1-88', // Professor Oak
  'base4-117': 'base1-90', // Super Potion
  'base4-118': 'base1-91', // Bill
  'base4-119': 'base1-92', // Energy Removal
  'base4-120': 'base1-93', // Gust of Wind
  'base4-121': 'base2-64', // Poké Ball
  'base4-122': 'base1-94', // Potion
  'base4-123': 'base1-95', // Switch
  'base4-124': 'base1-96', // Double Colorless Energy
  'base4-125': 'base1-97', // Fighting Energy
  'base4-126': 'base1-98', // Fire Energy
  'base4-127': 'base1-99', // Grass Energy
  'base4-128': 'base1-100', // Lightning Energy
  'base4-129': 'base1-101', // Psychic Energy
  'base4-130': 'base1-102', // Water Energy
};

/** The entries of an effects table (attacks, powers or Trainers by card id) for the Base Set 2 reprints of its cards. */
export const base4Reprints = <T>(table: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(BASE4_REPRINTS).flatMap(([id, original]) => (table[original] ? [[id, table[original]!]] : [])));
