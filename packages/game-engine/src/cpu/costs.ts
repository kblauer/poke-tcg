// The Poké-Powers every CPU difficulty pays Power Cancel against whatever the 2 cards are (the optional-cost rule, agreed
// 2026-11-14: shared.ts's `optionalCost`). A proposal for the user to confirm: activated Poké-Powers (not Poké-Bodies, not
// Abilities) whose use changes a game a lot. By card id; a reprint playing as its first print, or a card sharing its
// power's effect (Feraligatr's Rain Dance is Blastoise's), counts too.
import { powerEffect } from '../effects/index.js';
import type { InPlayPokemon } from '../engine.js';
import { pokemonPower } from '../powers.js';

/** Card id → its power's name, for the reader: the match is by the power's effect. */
export const STRONG_POWERS: Record<string, string> = {
  // Energy acceleration.
  'base1-2': 'Rain Dance', // Blastoise (Feraligatr Prime's too)
  'hgss1-110': 'Afterburner', // Typhlosion Prime
  // Draw and search engines.
  'ex6-10': 'Quick Search', // Pidgeot
  'dp4-15': 'Cosmic Power', // Claydol
  'hgss4-96': 'Magnetic Draw', // Magnezone Prime
  'dp3-7': 'Telepass', // Gardevoir
  // Damage moved: off its player's Pokémon, or onto the opponent's.
  'base1-1': 'Damage Swap', // Alakazam
  'ex12-85': 'Shady Move', // Banette ex
  // Healing.
  'ex9-4': 'Heal Dance', // Gardevoir
  // A power lock.
  'ex15-93': 'Imprison', // Gardevoir ex δ
};

/** The Pokémon's power is one of STRONG_POWERS (the tables read when asked, never as the module loads). */
export const strongPower = (p: InPlayPokemon) => {
  const effect = pokemonPower(p);
  return !!effect && Object.keys(STRONG_POWERS).some((id) => powerEffect(id) === effect);
};
