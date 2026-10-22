// EX Dragon Frontiers (ex15) Trainer cards and special Energy, by card id. Copycat, Holon Mentor, Island Hermit, Mr. Stone's
// Project, Professor Elm's Training Method, Professor Oak's Research and TV Reporter are Supporters; Holon Legacy is a
// Stadium; Buffer Piece and Strength Charm are Pokémon Tools. Most reprint earlier sets' cards and play as those.
// From the text: Holon Legacy's δ Pokémon have no Weakness (attacks.ts) and can't use Poké-Powers (refreshHideout);
// Island Hermit's Prize cards are face down, so the ones turned face up are picked at random from the face-down ones.
import { lookupCard } from '../cards.js';
import { nextRandom } from '../rng.js';
import { type EnergyEffect, type TrainerEffect } from '../trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ECARD2_ENERGY } from './ecard2-trainers.js';
import { EX3_TRAINERS } from './ex3-trainers.js';
import { EX6_TRAINERS } from './ex6-trainers.js';
import { EX7_TRAINERS } from './ex7-trainers.js';
import { EX8_ENERGY, EX8_TRAINERS } from './ex8-trainers.js';
import { EX9_TRAINERS } from './ex9-trainers.js';
import { EX11_ENERGY, EX11_TRAINERS } from './ex11-trainers.js';
import { EX13_ENERGY } from './ex13-trainers.js';
import { NEO3_TRAINERS } from './neo3-trainers.js';

export const EX15_TRAINERS: Record<string, TrainerEffect> = {
  // Buffer Piece, TV Reporter: as EX Dragon's. Copycat: as EX Team Rocket Returns'. Holon Mentor: as EX Delta Species'.
  'ex15-72': EX3_TRAINERS['ex3-83']!,
  'ex15-82': EX3_TRAINERS['ex3-88']!,
  'ex15-73': EX7_TRAINERS['ex7-83']!,
  'ex15-75': EX11_TRAINERS['ex11-93']!,
  // Holon Legacy: a Stadium (refreshHideout, attacks.ts).
  'ex15-74': { stadium: true },
  // Island Hermit (Supporter): up to 2 Prize cards turned face up for the rest of the game, then 2 cards drawn.
  'ex15-76': {
    supporter: true,
    choices(s) {
      const most = Math.min(2, s.prizes?.me ?? 0);
      if (!most) return [];
      const options = Array.from({ length: most + 1 }, (_, i) => i);
      return [{ kind: 'pick', field: 'pick', options, labels: options.map((n) => (n === 1 ? '1 Prize card' : `${n} Prize cards`)), prompt: 'Island Hermit: how many Prize cards do you put face up?' }];
    },
    play(ctx) {
      for (let n = ctx.choices.pick ?? 0; n > 0; n--) {
        const faceDown = ctx.me.prizes.filter((c) => !ctx.me.faceUpPrizes?.includes(c.uid));
        if (!faceDown.length) break;
        const [r, next] = nextRandom(ctx.state.rngState);
        ctx.state.rngState = next;
        const prize = faceDown[Math.floor(r * faceDown.length)]!;
        (ctx.me.faceUpPrizes ??= []).push(prize.uid);
        ctx.log(`Island Hermit: ${lookupCard(ctx.state.cards, prize.defId).name} is now a face-up Prize card.`);
      }
      ctx.draw(ctx.me, 2);
    },
  },
  // Mr. Stone's Project: as EX Emerald's. Old Rod: as Neo Revelation's.
  'ex15-77': EX9_TRAINERS['ex9-79']!,
  'ex15-78': NEO3_TRAINERS['neo3-64']!,
  // Professor Elm's Training Method, Professor Oak's Research: as Expedition's.
  'ex15-79': ECARD1_TRAINERS['ecard1-148']!,
  'ex15-80': ECARD1_TRAINERS['ecard1-149']!,
  // Strength Charm: as EX Deoxys'. Switch: as EX FireRed & LeafGreen's.
  'ex15-81': EX8_TRAINERS['ex8-92']!,
  'ex15-83': EX6_TRAINERS['ex6-102']!,
};

export const EX15_ENERGY: Record<string, EnergyEffect> = {
  // Holon Energy FF, GL, WP: as EX Delta Species'. Boost Energy: as Aquapolis's. δ Rainbow Energy: as EX Holon Phantoms'.
  // Scramble Energy: as EX Deoxys'.
  'ex15-84': EX11_ENERGY['ex11-104']!,
  'ex15-85': EX11_ENERGY['ex11-105']!,
  'ex15-86': EX11_ENERGY['ex11-106']!,
  'ex15-87': ECARD2_ENERGY['ecard2-145']!,
  'ex15-88': EX13_ENERGY['ex13-98']!,
  'ex15-89': EX8_ENERGY['ex8-95']!,
};
