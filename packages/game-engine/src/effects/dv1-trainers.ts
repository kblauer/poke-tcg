// Dragon Vault (dv1) Trainer cards, by card id: Items. Exp. Share and Super Rod play as their first prints (Next Destinies'
// and Noble Victories'), whose TCGdex text here carries the reminder text too.
// First Ticket is played from the hand as its player starts the battle, if they choose to (START_BATTLE's `firstTicket`, the
// user's, 2026-10-26; the CPU always does), and they go first; if both players play one, the flip stands, and Overeager wins
// over it (the user's). It can't be played during a turn.
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
