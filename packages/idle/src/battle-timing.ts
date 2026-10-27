// The time FireRed's battle animations take (README: Idle Adventure, battles), in frames at 60 a second as the game
// counts them (from the pret/pokefirered decompilation: battle_intro.c, pokeball.c, battle_anim_special.c,
// battle_controller_player.c and _opponent.c). The browser draws them frame by frame; the run counts the time they take
// into a battle's segment (simulateSegment), so the two keep in step.
import type { BattleEvent } from './battle.js';

/** One frame (the GBA's ~60 a second). */
export const FRAME_MS = 1000 / 60;

/**
 * The battle's opening cut-in at twice FireRed's speed (the user's, 2026-10-26; the game's 32 and 120 frames): the band
 * opening (16 frames), the two halves and both sides sliding in (60, 4 pixels a frame), then a wild Pokémon's healthbox
 * (23, the game's).
 */
export const INTRO_SPEED = 2;
export const INTRO_FRAMES = { band: 32 / INTRO_SPEED, slide: 120 / INTRO_SPEED, healthbox: 23 } as const;

/** A healthbox sliding in (StartHealthboxSlideIn: 115 pixels at 5 a frame). */
export const HEALTHBOX_FRAMES = 23;

/**
 * A ball opening (SpriteCB_ReleaseMonFromBall): its anim (5 frames half open, 5 open), the Pokémon emerging (12, from
 * 0.156× and 16 pixels low), the background's white flash (17 up, 17 down) as the Pokémon's ball colour fades.
 */
export const OPEN_FRAMES = { anim: 10, emerge: 12, flash: 17 } as const;

/** The opponent's send-out (OpponentHandleIntroTrainerBallThrow): the trainer off in 35 frames, the ball opening 1 + 16 frames in. */
export const FOE_SEND = { trainerOut: 35, open: 17 } as const;

/**
 * The player's send-out (PlayerHandleIntroTrainerBallThrow): the back pic's throw (sheet frames 1, 2, 3, 4 for 20, 6, 6
 * and 24 frames, 2 and 3 drawn 16 pixels right) as it slides from 80 to -40 in 50 frames; the ball from 48,70 at frame
 * 32 (at once on a later send-out), in a 25-frame arc 30 pixels high, opening as it lands.
 */
export const PLAYER_SEND = { throwAt: 32, slide: 50, arc: 25 } as const;

/**
 * Catching (Special_BallThrow): the throw (34 frames, from 32,80 to 176,24, 40 high), the ball opening (10), a 10-frame
 * wait, the Pokémon drawn in (1 + 28 + 1), the ball closing (10), falling and bouncing (84: peaks 40, 30, 20, 10), a
 * 31-frame wait, then each shake (28, and a 31-frame pause); broken out 31 frames after the last shake, or clicked 40
 * frames after the third (stars, the ball darkened), "Gotcha!" 95 frames after it.
 */
export const CATCH = { throw: 34, open: 10, wait: 10, shrink: 30, close: 10, bounce: 84, preShake: 31, shake: 28, pause: 31, click: 40, gotcha: 95, breakText: 30 } as const;

/** When the shakes start (frames from the throw). */
export const SHAKES_AT = CATCH.throw + CATCH.open + CATCH.wait + CATCH.shrink + CATCH.close + CATCH.bounce + CATCH.preShake;

/** The frame a thrown ball's line comes up (its animation played): "Gotcha!" after the click, or the Pokémon out again. */
export function catchTextFrame(shakes: number, caught: boolean): number {
  if (caught) return SHAKES_AT + 2 * (CATCH.shake + CATCH.pause) + CATCH.shake + CATCH.click + CATCH.gotcha;
  return SHAKES_AT + shakes * (CATCH.shake + CATCH.pause) + CATCH.breakText;
}

/** How long a line stays up once its animation has played (the player's time to read it). */
export const READ_MS = 1200;

/**
 * How long one of the battle's opening lines takes (the browser's pacing and the run's segment alike): a wild Pokémon's
 * "appeared", the foe's send-out (its 60-frame pause, the ball, its healthbox), the player's (the throw, its healthbox),
 * any other line READ_MS.
 */
export function openingLineMs(e: BattleEvent, kind: 'wild' | 'trainer'): number {
  if (e.t !== 'send') return READ_MS;
  if (e.side === 1) return kind === 'wild' ? READ_MS : (60 + FOE_SEND.open + OPEN_FRAMES.emerge + HEALTHBOX_FRAMES) * FRAME_MS + READ_MS;
  return (PLAYER_SEND.throwAt + PLAYER_SEND.arc + OPEN_FRAMES.emerge + HEALTHBOX_FRAMES) * FRAME_MS + READ_MS;
}

/** The trainer's "would like to battle!" before their send-out. */
export const CHALLENGE_MS = 1500;

/** The intro's slides (and a wild Pokémon's healthbox) before the first line. */
export const INTRO_MS = (INTRO_FRAMES.band + INTRO_FRAMES.slide + INTRO_FRAMES.healthbox) * FRAME_MS;

/** The battle's opening events (before its first tick), each with a line of its own. */
export function openingLines(events: BattleEvent[]): BattleEvent[] {
  // (They begin with turn 0's tick; the opening runs to turn 1's.)
  const end = events.findIndex((e, i) => i > 0 && e.t === 'tick');
  return events.slice(0, end < 0 ? events.length : end).filter((e) => 'msg' in e && !!e.msg);
}

/** The whole opening: the intro, a trainer's challenge, and its lines. */
export function openingMs(events: BattleEvent[], kind: 'wild' | 'trainer'): number {
  return INTRO_MS + (kind === 'trainer' ? CHALLENGE_MS : 0) + openingLines(events).reduce((t, e) => t + openingLineMs(e, kind), 0);
}

/** How long a thrown ball's line takes: its animation, then the line to read. */
export const ballLineMs = (shakes: number, caught: boolean) => catchTextFrame(shakes, caught) * FRAME_MS + READ_MS;
