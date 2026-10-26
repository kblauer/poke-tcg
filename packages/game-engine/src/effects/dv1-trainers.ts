// Dragon Vault (dv1) Trainer cards, by card id: Items. Exp. Share and Super Rod play as their first prints (Next Destinies'
// and Noble Victories'), whose TCGdex text here carries the reminder text too.
// From the text: First Ticket is played as the battle starts (START_BATTLE), by the one player with one in their hand,
// who goes first; with both players holding one, the flip stands. It's played for its player whenever they can (they never
// keep it: a question for the user), and can't be played during a turn.
import type { TrainerEffect } from '../trainers.js';
import { BW3_TRAINERS } from './bw3-trainers.js';
import { BW4_TRAINERS } from './bw4-trainers.js';

export const DV1_TRAINERS: Record<string, TrainerEffect> = {
  // Exp. Share: as Next Destinies'. Super Rod: as Noble Victories'.
  'dv1-18': BW4_TRAINERS['bw4-87']!,
  'dv1-20': BW3_TRAINERS['bw3-95']!,
  // First Ticket: goes first instead of the flip (START_BATTLE).
  'dv1-19': { firstTicket: true },
};
