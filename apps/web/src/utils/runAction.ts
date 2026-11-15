/** How long a trainer's "!" shows over them before their battle opens, at least (the battle is being set up meanwhile). */
export const SPOTTED_MS = 1000;

/**
 * What the site does once a run's move is in (useRun), from the run before it and the server's answer:
 * - `battle`: the move started a game (a battle chosen, an Ace Trainer's accepted): its "!" and transition, then its page;
 * - `escaped`: the battle under way is gone with no result (an Escape Rope, used from the battle's Run tab): back to the run;
 * - `settled`: anything else (an event's NPC walked up, an item used, a reward taken): the chosen option's mark comes off.
 * The escape is checked before the mark, which is never set during a battle: checked after it, it was never reached.
 */
export function afterRunAction(prev: { gameId?: string | null } | null, next: { gameId?: string | null }): 'battle' | 'escaped' | 'settled' {
  if (next.gameId && next.gameId !== prev?.gameId) return 'battle';
  if (prev?.gameId && !next.gameId) return 'escaped';
  return 'settled';
}

/** How much longer a battle's "!" (shown since `spottedAt`; null: none shown) stays up before its game opens: none if the request took longer. */
export function spottedWait(spottedAt: number | null, now: number): number {
  return spottedAt === null ? 0 : Math.max(0, SPOTTED_MS - (now - spottedAt));
}
