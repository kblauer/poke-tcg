// Dark Explorers (bw5) Trainer cards, by card id. So far the Fossil Item, done with the Black & White series' shared rules
// (README: Generation 5): Old Amber Aerodactyl, the only way its Restored Aerodactyl comes into play.
import type { TrainerEffect } from '../trainers.js';
import { fossilItem } from './bw3-trainers.js';

export const BW5_TRAINERS: Record<string, TrainerEffect> = {
  // Old Amber Aerodactyl: as Noble Victories' Fossils, Aerodactyl.
  'bw5-97': fossilItem('Old Amber Aerodactyl', 'Aerodactyl'),
};
