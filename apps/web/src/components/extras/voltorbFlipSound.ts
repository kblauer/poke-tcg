// Voltorb Flip's sounds (VoltorbFlipScreen's): HeartGold and SoulSilver's sound effects and fanfares, rendered from the
// pokeheartgold decompilation's sound archive by tools/extras/hgss_voltorb_flip.py (sdat.py, nds_render.py) into
// public/extras/voltorb-flip/sounds/, played as voltorb_flip.c plays them (MinigameSound): the effects on one player,
// the newest replacing the one playing, and the fanfares (PlayFanfare) on their own.
import { MinigameSound } from './minigameSound';

export type VoltorbFlipSoundName =
  | 'se_dp_select'
  | 'se_dp_decide'
  | 'se_dp_box01'
  | 'se_dp_box03'
  | 'se_dp_card2'
  | 'se_dp_button3'
  | 'se_gs_paneru_mekuru'
  | 'se_gs_coin_hazure'
  | 'se_gs_coin_payout_one'
  | 'se_gs_coin_payout_last'
  | 'se_gs_okozukai'
  | 'se_gs_slot01'
  | 'se_gs_slot03'
  | 'me_cardgame1'
  | 'me_cardgame2'
  | 'me_mushitori3';

const SE: [string, number] = ['se', 64];
const ME: [string, number] = ['me', 64];
const PLAYERS: Record<VoltorbFlipSoundName, [player: string, priority: number]> = {
  se_dp_select: SE,
  se_dp_decide: SE,
  se_dp_box01: SE,
  se_dp_box03: SE,
  se_dp_card2: SE,
  se_dp_button3: SE,
  se_gs_paneru_mekuru: SE,
  se_gs_coin_hazure: SE,
  se_gs_coin_payout_one: SE,
  se_gs_coin_payout_last: SE,
  se_gs_okozukai: SE,
  se_gs_slot01: SE,
  se_gs_slot03: SE,
  me_cardgame1: ME,
  me_cardgame2: ME,
  me_mushitori3: ME,
};

/** The fanfares (IsFanfarePlaying). */
export const FANFARES: VoltorbFlipSoundName[] = ['me_cardgame1', 'me_cardgame2', 'me_mushitori3'];
/** The sound effects (GF_IsAnySEPlaying). */
export const EFFECTS = (Object.keys(PLAYERS) as VoltorbFlipSoundName[]).filter((n) => !FANFARES.includes(n));

/** The game's sounds, loaded once a screen; `close` when it goes. */
export class VoltorbFlipSound extends MinigameSound<VoltorbFlipSoundName> {
  constructor(volume: number) {
    super('/extras/voltorb-flip/sounds', PLAYERS, volume);
  }
}
