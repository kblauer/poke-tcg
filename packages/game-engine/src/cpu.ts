import { isBasicPokemon, lookupCard } from './cards.js';
import { applyAction, type GameAction, type GameState, type PlayerId } from './engine.js';

/**
 * Placeholder opponent with no strategy: it only makes the moves the rules force
 * (choose an active, promote after a knockout) and otherwise ends its turn.
 * Returns null when the CPU has nothing to do.
 */
export function dummyCpuAction(state: GameState, cpuId: PlayerId): GameAction | null {
  const cpu = state.players[cpuId];
  if (!cpu) throw new Error(`Unknown CPU player ${cpuId}`);

  switch (state.phase) {
    case 'setup': {
      if (cpu.active) return null;
      const basic = cpu.hand.find((c) => isBasicPokemon(lookupCard(state.cards, c.defId)));
      if (!basic) throw new Error('CPU has no Basic Pokémon to start with');
      return { type: 'SET_ACTIVE', cardUid: basic.uid };
    }
    case 'promote':
      return state.pendingPromotion === cpuId ? { type: 'PROMOTE', benchIndex: 0 } : null;
    case 'playing':
      return state.currentPlayer === cpuId ? { type: 'END_TURN' } : null;
    case 'finished':
      return null;
  }
}

/** Applies CPU actions until it's no longer the CPU's move. */
export function runCpu(
  state: GameState,
  cpuId: PlayerId,
  decide: (state: GameState, cpuId: PlayerId) => GameAction | null = dummyCpuAction,
): { state: GameState; actions: GameAction[] } {
  const actions: GameAction[] = [];
  for (let action = decide(state, cpuId); action; action = decide(state, cpuId)) {
    const result = applyAction(state, cpuId, action);
    if (!result.ok) throw new Error(`CPU made an illegal move (${action.type}): ${result.error}`);
    state = result.state;
    actions.push(action);
  }
  return { state, actions };
}
