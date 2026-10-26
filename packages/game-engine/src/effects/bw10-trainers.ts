// Plasma Blast (bw10) Trainer cards, by card id. So far the Fossil Items, done with the Black & White series' shared rules
// (README: Generation 5): Cover Fossil, Plume Fossil and Root Fossil Lileep, the only way their Restored Pokémon come into play.
import type { TrainerEffect } from '../trainers.js';
import { fossilItem } from './bw3-trainers.js';

export const BW10_TRAINERS: Record<string, TrainerEffect> = {
  // Cover Fossil, Plume Fossil: as Noble Victories'.
  'bw10-79': fossilItem('Cover Fossil', 'Tirtouga'),
  'bw10-82': fossilItem('Plume Fossil', 'Archen'),
  // Root Fossil Lileep: Lileep from the bottom 7 cards onto the Bench.
  'bw10-87': fossilItem('Root Fossil Lileep', 'Lileep'),
};
