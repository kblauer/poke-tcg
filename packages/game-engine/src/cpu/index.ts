// CPU opponents: one file per difficulty, with what they share in shared.ts.
import type { GameAction, GameState, PlayerId } from '../engine.js';
import { gymLeaderCpu } from './gym-leader.js';
import { passiveCpu } from './passive.js';
import { trainerCpu } from './trainer.js';
import { tryAction } from './shared.js';

export { gymLeaderCpu, passiveCpu, trainerCpu };
export { TRAINER_CPU_ENERGY, TRAINER_CPU_PLAYS, TRAINER_CPU_RULES } from './trainer.js';
export type { DamageRange } from './shared.js';

/** A CPU's move in this state, or null when it has nothing to do (it isn't its move). */
export type CpuDecide = (state: GameState, cpuId: PlayerId) => GameAction | null;

/** How hard the CPU plays, easiest first. */
export const CPU_DIFFICULTIES = ['passive', 'trainer', 'gymLeader'] as const;
export type CpuDifficulty = (typeof CPU_DIFFICULTIES)[number];
/** For games without one (GameState.cpuDifficulty). */
export const DEFAULT_CPU_DIFFICULTY: CpuDifficulty = 'gymLeader';
export const CPU_DIFFICULTY_LABELS: Record<CpuDifficulty, string> = { passive: 'Passive', trainer: 'Trainer', gymLeader: 'Gym leader' };

const CPUS: Record<CpuDifficulty, CpuDecide> = { passive: passiveCpu, trainer: trainerCpu, gymLeader: gymLeaderCpu };

/** The CPU that plays at this difficulty. */
export const cpuFor = (difficulty: CpuDifficulty = DEFAULT_CPU_DIFFICULTY): CpuDecide => CPUS[difficulty];

/**
 * Applies CPU actions until it's no longer the CPU's move, playing at the game's difficulty unless
 * `decide` is given. `states` has the state after each action, for replaying them one by one.
 */
export function runCpu(
  state: GameState,
  cpuId: PlayerId,
  decide: CpuDecide = cpuFor(state.cpuDifficulty),
): { state: GameState; actions: GameAction[]; states: GameState[] } {
  const actions: GameAction[] = [];
  const states: GameState[] = [];
  for (let action = decide(state, cpuId); action; action = decide(state, cpuId)) {
    const next = tryAction(state, cpuId, action);
    if (!next) throw new Error(`CPU made an illegal move (${action.type})`);
    state = next;
    actions.push(action);
    states.push(state);
    // Every move uses something up (a card, the attachment, the retreat), so this only trips on a bug.
    if (actions.length > 200) throw new Error('CPU is stuck in a loop');
  }
  return { state, actions, states };
}
