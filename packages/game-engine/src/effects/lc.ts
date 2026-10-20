// Legendary Collection (lc): every card is a reprint of a Base Set, Jungle, Fossil, Team Rocket or Wizards promo card,
// so its attacks, Trainer and special Energy effects are the original's (as Base Set 2's are, base4.ts). It's in Gen 1's
// pool and packs (agreed with the user).
//
// Differences from the originals, as printed:
// - Its Pokémon Powers say "affected by a Special Condition" where the originals say "Asleep, Confused, or Paralyzed"
//   (Haunter's Transparency: "Asleep"). Every Pokémon Power now stops with any Special Condition, Poisoned and Burned
//   included (agreed with the user), so only Transparency differs (`stopsOnlyWhileAsleep` off). LC Snorlax can't be Burned either (Thick Skinned already keeps every Special Condition off).
// - TCGdex leaves out some damage (Dark Dragonite's Giant Tail…) and has Omastar's Spike Cannon cost as Colorless; the
//   printed values are below. It also spells Jolteon's Pin Missile "Pin Missle" and Grimer's Minimize "Minimized" (fixed
//   in the seed's TCGDEX_FIXES; the misspellings are kept here too until a re-seed).
// - Its Nidoran ♀ and ♂ are spelled with a space, unlike the earlier sets' and the Nidorina and Nidorino they evolve into
//   (fixed in the seed's TCGDEX_FIXES).
// Other wording changes ("…or this attack does nothing", Whirlwind's "Your opponent switches…") play the same.
import type { AttackEffect } from '../attacks.js';
import type { PowerEffect } from '../powers.js';

/** Each Legendary Collection card, and the card it reprints (a holo for a holo). */
export const LC_REPRINTS: Record<string, string> = {
  'lc-1': 'base1-1', // Alakazam (Base Set)
  'lc-2': 'base3-2', // Articuno (Fossil)
  'lc-3': 'base1-4', // Charizard (Base Set)
  'lc-4': 'base5-3', // Dark Blastoise (Team Rocket)
  'lc-5': 'base5-5', // Dark Dragonite (Team Rocket)
  'lc-6': 'base5-42', // Dark Persian (Team Rocket)
  'lc-7': 'base5-83', // Dark Raichu (Team Rocket)
  'lc-8': 'base5-12', // Dark Slowbro (Team Rocket)
  'lc-9': 'base5-45', // Dark Vaporeon (Team Rocket)
  'lc-10': 'base2-3', // Flareon (Jungle)
  'lc-11': 'base3-5', // Gengar (Fossil)
  'lc-12': 'base1-6', // Gyarados (Base Set)
  'lc-13': 'base3-7', // Hitmonlee (Fossil)
  'lc-14': 'base2-4', // Jolteon (Jungle)
  'lc-15': 'base1-8', // Machamp (Base Set)
  'lc-16': 'base3-13', // Muk (Fossil)
  'lc-17': 'base1-12', // Ninetales (Base Set)
  'lc-18': 'base1-15', // Venusaur (Base Set)
  'lc-19': 'base1-16', // Zapdos (Base Set)
  'lc-20': 'base1-17', // Beedrill (Base Set)
  'lc-21': 'base2-33', // Butterfree (Jungle)
  'lc-22': 'base2-18', // Electrode (Jungle)
  'lc-23': 'base2-35', // Exeggutor (Jungle)
  'lc-24': 'base3-36', // Golem (Fossil)
  'lc-25': 'base3-23', // Hypno (Fossil)
  'lc-26': 'base1-31', // Jynx (Base Set)
  'lc-27': 'base3-24', // Kabutops (Fossil)
  'lc-28': 'base3-26', // Magneton (Fossil)
  'lc-29': 'basep-12', // Mewtwo (Wizards Promo)
  'lc-30': 'base3-27', // Moltres (Fossil)
  'lc-31': 'base1-11', // Nidoking (Base Set)
  'lc-32': 'base2-23', // Nidoqueen (Jungle)
  'lc-33': 'base2-24', // Pidgeot (Jungle)
  'lc-34': 'base1-22', // Pidgeotto (Base Set)
  'lc-35': 'base2-45', // Rhydon (Jungle)
  'lc-36': 'base1-23', // Arcanine (Base Set)
  'lc-37': 'base1-24', // Charmeleon (Base Set)
  'lc-38': 'base5-33', // Dark Dragonair (Team Rocket)
  'lc-39': 'base5-46', // Dark Wartortle (Team Rocket)
  'lc-40': 'base1-25', // Dewgong (Base Set)
  'lc-41': 'base2-34', // Dodrio (Jungle)
  'lc-42': 'base2-36', // Fearow (Jungle)
  'lc-43': 'base3-35', // Golduck (Fossil)
  'lc-44': 'base3-37', // Graveler (Fossil)
  'lc-45': 'base1-28', // Growlithe (Base Set)
  'lc-46': 'base3-21', // Haunter (Fossil)
  'lc-47': 'base1-30', // Ivysaur (Base Set)
  'lc-48': 'base3-50', // Kabuto (Fossil)
  'lc-49': 'base1-32', // Kadabra (Base Set)
  'lc-50': 'base1-33', // Kakuna (Base Set)
  'lc-51': 'base1-34', // Machoke (Base Set)
  'lc-52': 'base1-35', // Magikarp (Base Set)
  'lc-53': 'base2-56', // Meowth (Jungle)
  'lc-54': 'base1-54', // Metapod (Base Set)
  'lc-55': 'base2-40', // Nidorina (Jungle)
  'lc-56': 'base1-37', // Nidorino (Base Set)
  'lc-57': 'base3-52', // Omanyte (Fossil)
  'lc-58': 'base3-40', // Omastar (Fossil)
  'lc-59': 'base2-43', // Primeape (Jungle)
  'lc-60': 'base2-44', // Rapidash (Jungle)
  'lc-61': 'base1-40', // Raticate (Base Set)
  'lc-62': 'base3-41', // Sandslash (Fossil)
  'lc-63': 'base3-42', // Seadra (Fossil)
  'lc-64': 'base2-27', // Snorlax (Jungle)
  'lc-65': 'base2-47', // Tauros (Jungle)
  'lc-66': 'base3-44', // Tentacruel (Fossil)
  'lc-67': 'base1-43', // Abra (Base Set)
  'lc-68': 'base1-44', // Bulbasaur (Base Set)
  'lc-69': 'base1-45', // Caterpie (Base Set)
  'lc-70': 'base1-46', // Charmander (Base Set)
  'lc-71': 'base1-48', // Doduo (Base Set)
  'lc-72': 'base1-26', // Dratini (Base Set)
  'lc-73': 'base5-54', // Drowzee (Team Rocket)
  'lc-74': 'base2-51', // Eevee (Jungle)
  'lc-75': 'base2-52', // Exeggcute (Jungle)
  'lc-76': 'base3-33', // Gastly (Fossil)
  'lc-77': 'base3-47', // Geodude (Fossil)
  'lc-78': 'base3-48', // Grimer (Fossil)
  'lc-79': 'base5-59', // Machop (Team Rocket)
  'lc-80': 'base1-53', // Magnemite (Base Set)
  'lc-81': 'base5-61', // Mankey (Team Rocket)
  'lc-82': 'base2-57', // Nidoran♀ (Jungle)
  'lc-83': 'base1-55', // Nidoran♂ (Base Set)
  'lc-84': 'base1-56', // Onix (Base Set)
  'lc-85': 'base1-57', // Pidgey (Base Set)
  'lc-86': 'base2-60', // Pikachu (Jungle)
  'lc-87': 'base1-60', // Ponyta (Base Set)
  'lc-88': 'base5-65', // Psyduck (Team Rocket)
  'lc-89': 'base1-61', // Rattata (Base Set)
  'lc-90': 'base2-61', // Rhyhorn (Jungle)
  'lc-91': 'base1-62', // Sandshrew (Base Set)
  'lc-92': 'base1-41', // Seel (Base Set)
  'lc-93': 'base3-55', // Slowpoke (Fossil)
  'lc-94': 'base2-62', // Spearow (Jungle)
  'lc-95': 'base1-63', // Squirtle (Base Set)
  'lc-96': 'base3-56', // Tentacool (Fossil)
  'lc-97': 'base1-67', // Voltorb (Base Set)
  'lc-98': 'base1-68', // Vulpix (Base Set)
  'lc-99': 'base1-69', // Weedle (Base Set)
  'lc-100': 'base5-81', // Full Heal Energy (Team Rocket)
  'lc-101': 'base5-82', // Potion Energy (Team Rocket)
  'lc-102': 'base1-76', // Pokémon Breeder (Base Set)
  'lc-103': 'base1-77', // Pokémon Trader (Base Set)
  'lc-104': 'base1-78', // Scoop Up (Base Set)
  'lc-105': 'base5-73', // The Boss's Way (Team Rocket)
  'lc-106': 'base5-74', // Challenge! (Team Rocket)
  'lc-107': 'base1-81', // Energy Retrieval (Base Set)
  'lc-108': 'base1-91', // Bill (Base Set)
  'lc-109': 'base3-62', // Mysterious Fossil (Fossil)
  'lc-110': 'base1-94', // Potion (Base Set)
};

/** Printed damage and costs where TCGdex's Legendary Collection data differs (the originals' are right). */
const PRINTED: Record<string, Record<string, Pick<AttackEffect, 'damage' | 'cost'>>> = {
  'lc-5': { 'Giant Tail': { damage: '70' } },
  'lc-6': { 'Poison Claws': { damage: '10' } },
  'lc-8': { 'Fickle Attack': { damage: '40' } },
  'lc-16': { Sludge: { damage: '30' } },
  'lc-20': { 'Poison Sting': { damage: '40' } },
  'lc-30': { 'Dive Bomb': { damage: '80' } },
  'lc-50': { Poisonpowder: { damage: '20' } },
  'lc-58': { 'Spike Cannon': { cost: ['water', 'water'] } },
};

/** TCGdex's misspelt attack names, until a re-seed brings in the fixed ones: the misspelling, and the printed name. */
const MISSPELT: Record<string, [string, string]> = {
  'lc-14': ['Pin Missle', 'Pin Missile'],
  'lc-78': ['Minimized', 'Minimize'],
};

/** The entries of an effects table (Trainers or special Energy by card id) for the Legendary Collection reprints of its cards. */
export const lcReprints = <T>(table: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(LC_REPRINTS).flatMap(([id, original]) => (table[original] ? [[id, table[original]!]] : [])));

/** The attack effects of the Legendary Collection reprints: the originals', with the printed damage and costs. */
export function lcAttacks(table: Record<string, Record<string, AttackEffect>>): Record<string, Record<string, AttackEffect>> {
  const out: Record<string, Record<string, AttackEffect>> = {};
  for (const [id, original] of Object.entries(LC_REPRINTS)) {
    const attacks: Record<string, AttackEffect> = { ...table[original] };
    for (const [name, fix] of Object.entries(PRINTED[id] ?? {})) {
      const amount = Number.parseInt(fix.damage ?? '', 10);
      // An attack with no effect of its own just does its printed damage.
      attacks[name] = { ...(attacks[name] ?? { run: (ctx) => void ctx.hit(amount) }), ...fix };
    }
    const misspelt = MISSPELT[id];
    if (misspelt && attacks[misspelt[1]]) attacks[misspelt[0]] = attacks[misspelt[1]]!;
    if (Object.keys(attacks).length) out[id] = attacks;
  }
  return out;
}

/** The Pokémon Powers of the Legendary Collection reprints: the originals', Transparency stopping with any Special Condition. */
export const lcPowers = (table: Record<string, PowerEffect>): Record<string, PowerEffect> =>
  Object.fromEntries(Object.entries(lcReprints(table)).map(([id, effect]) => [id, { ...effect, stopsOnlyWhileAsleep: false }]));
