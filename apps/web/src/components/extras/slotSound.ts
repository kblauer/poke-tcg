// The slot machines' sounds (SlotMachineScreen's): Emerald's sound effects, its fanfares and Reel Time's song, rendered
// from the pokeemerald decompilation by tools/extras/emerald_slots.py (public/extras/slots/sounds/), played as the game's
// sound engine plays them (MinigameSound): each on its music player (song_table.inc), its priority midi.cfg's -P. The
// fanfares are on SE2 with the menu's beep and the stop button's sound, as the game has them, so a fanfare holds off the
// stop button's lower priority sound; MUS_ROULETTE loops on its own player (the BGM's) while Reel Time's lottery runs.
import type { SlotFanfare, SlotSound as SlotSoundName } from '@poke-tcg/campaign';
import { MinigameSound } from './minigameSound';

type Name = SlotSoundName | SlotFanfare | 'mus_roulette';

/** Each sound's music player and priority (song_table.inc, midi.cfg). */
const PLAYERS: Record<Name, [player: 'se1' | 'se2' | 'bgm', priority: number]> = {
  se_shop: ['se1', 5],
  se_pin: ['se1', 4],
  se_m_explosion: ['se1', 4],
  se_contest_place: ['se2', 4],
  se_select: ['se2', 5],
  mus_slots_win: ['se2', 5],
  mus_slots_jackpot: ['se2', 5],
  mus_too_bad: ['se2', 5],
  mus_roulette: ['bgm', 0],
};

/** The slot machine's sounds, loaded once a screen; `close` when it goes. */
export class SlotSound extends MinigameSound<Name> {
  constructor(volume: number) {
    super('/extras/slots/sounds', PLAYERS, volume);
  }

  /** Reel Time's song (MUS_ROULETTE), looped until `stopLoop`. */
  startRoulette() {
    this.startLoop('mus_roulette');
  }
}
