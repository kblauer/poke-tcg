// Poffin cooking's sounds (PoffinScreen's): Platinum's sound effects, rendered from the pokeplatinum decompilation by
// tools/extras/nds_render.py (public/extras/poffin/sounds/), played as the game plays them (MinigameSound): each on its
// player (SE 1, 2 or 3, pl_sound_data.json; every one priority 64, so the newest on a player replaces the one playing).
import { MinigameSound } from './minigameSound';

export type PoffinSoundName = 'nm01' | 'nm02' | 'nm03' | 'nm04_2' | 'nm05' | 'nm07_2' | 'nm08' | 'nm09' | 'nm10' | 'nm10_2' | 'nm12_2' | 'nm13' | 'nm14';

const PLAYERS: Record<PoffinSoundName, [player: 'se1' | 'se2' | 'se3', priority: number]> = {
  nm01: ['se1', 64],
  nm02: ['se2', 64],
  nm03: ['se3', 64],
  nm04_2: ['se1', 64],
  nm05: ['se2', 64],
  nm07_2: ['se1', 64],
  nm08: ['se3', 64],
  nm09: ['se1', 64],
  nm10: ['se1', 64],
  nm10_2: ['se1', 64],
  nm12_2: ['se1', 64],
  nm13: ['se1', 64],
  nm14: ['se1', 64],
};

/** Each phase's lap (the batter's turn: ov83_0223C90C), spill and burn sounds (ov83_0223C6D4). */
export const LAP_SOUNDS: PoffinSoundName[] = ['nm01', 'nm04_2', 'nm07_2'];
export const SPILL_SOUNDS: PoffinSoundName[] = ['nm02', 'nm05', 'nm05'];
export const BURN_SOUNDS: PoffinSoundName[] = ['nm03', 'nm03', 'nm08'];

/** The cooking's sounds, loaded once a screen; `close` when it goes. */
export class PoffinSound extends MinigameSound<PoffinSoundName> {
  constructor(volume: number) {
    super('/extras/poffin/sounds', PLAYERS, volume);
  }
}
