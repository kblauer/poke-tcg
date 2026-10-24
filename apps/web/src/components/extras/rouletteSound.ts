// The roulette's sounds (RouletteScreen's): Emerald's sound effects, its 2 fanfares and the cries of Shroomish and
// Taillow, rendered from the pokeemerald decompilation by tools/extras/emerald_roulette.py (public/extras/roulette/sounds/),
// played as the game's sound engine plays them (MinigameSound): each on its music player with its priority (campaign's
// ROULETTE_SOUNDS: song_table.inc, midi.cfg; the fanfares on SE2 as the game has them), the cries on their own, and
// Taillow's wing flaps looped until it flies off.
import { ROULETTE_SOUNDS, type RouletteSoundName } from '@poke-tcg/campaign';
import { MinigameSound } from './minigameSound';

export type RouletteSoundFile = RouletteSoundName | 'cry_taillow' | 'cry_shroomish';

const PLAYERS = {
  ...(Object.fromEntries(Object.entries(ROULETTE_SOUNDS).map(([name, [player, priority]]) => [name, [player, priority]])) as Record<RouletteSoundName, [string, number]>),
  cry_taillow: ['cry', 0],
  cry_shroomish: ['cry', 0],
} satisfies Record<RouletteSoundFile, [string, number]>;

/** The wing flaps: looped (their loop rendered once) until stopped. */
const LOOPED: RouletteSoundFile = 'se_taillow_wing_flap';

/** The roulette's sounds, loaded once a screen; `close` when it goes. */
export class RouletteSound extends MinigameSound<RouletteSoundFile> {
  constructor(volume: number) {
    super('/extras/roulette/sounds', PLAYERS, volume);
  }

  /** PlaySE / m4aSongNumStart (the game's model has already settled whether it plays over what's playing). */
  start(name: RouletteSoundFile) {
    if (name === LOOPED) this.startLoop(name);
    else this.play(name);
  }

  /** m4aSongNumStop: only the wing flaps are stopped before they end (SE_PIN's ping is cut by the next one anyway). */
  stop(name: RouletteSoundFile) {
    if (name === LOOPED) this.stopLoop();
  }
}
