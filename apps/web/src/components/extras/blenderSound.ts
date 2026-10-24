// The Berry Blender's sounds (BlenderScreen's): Emerald's sound effects and the Pokéblock's fanfare, rendered from the
// pokeemerald decompilation by tools/extras/m4a_render.py (public/extras/blender/sounds/), played as the game's sound
// engine plays them (MinigameSound): each on its music player (SE1 or SE2, song_table.inc), its priority midi.cfg's -P,
// and the blender's whirring looped, its pitch raised with the blender's speed (UpdateHitPitch).
import { MinigameSound } from './minigameSound';

export type BlenderSoundName =
  | 'se_ball_tray_exit'
  | 'se_fall'
  | 'se_truck_door'
  | 'se_ball_bounce_1'
  | 'se_pin'
  | 'se_berry_blender'
  | 'se_ice_stairs'
  | 'se_success'
  | 'se_failure'
  | 'se_select'
  | 'mus_level_up';

/** Each sound's music player and priority (song_table.inc, midi.cfg). The fanfare plays on its own (PlayFanfare). */
const PLAYERS: Record<BlenderSoundName, [player: 'se1' | 'se2' | 'fanfare', priority: number]> = {
  se_ball_tray_exit: ['se2', 5],
  se_fall: ['se1', 4],
  se_truck_door: ['se1', 4],
  se_ball_bounce_1: ['se1', 4],
  se_pin: ['se1', 4],
  se_berry_blender: ['se2', 4],
  se_ice_stairs: ['se1', 4],
  se_success: ['se1', 4],
  se_failure: ['se1', 4],
  se_select: ['se2', 5],
  mus_level_up: ['fanfare', 5],
};

/** The blender's sounds, loaded once a screen; `close` when it goes. */
export class BlenderSound extends MinigameSound<BlenderSoundName> {
  constructor(volume: number) {
    super('/extras/blender/sounds', PLAYERS, volume);
  }

  /** SE_BERRY_BLENDER, looped on SE2 until `stopLoop`. */
  startWhirring() {
    this.startLoop('se_berry_blender');
  }
}
