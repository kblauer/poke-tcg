import { isBasicPokemon, lookupCard } from './cards.js';
import { applyAction, evolveError, type GameAction, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from './engine.js';

/**
 * Placeholder opponent with almost no strategy. Besides the moves the rules force (choose an
 * active, promote after a knockout), on its turn it benches every Basic it can, evolves whatever
 * it can, attaches an energy to a Pokémon of the same type, and then ends its turn. It never
 * attacks or retreats. Returns null when the CPU has nothing to do.
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
      return state.pendingPromotion === cpuId ? { type: 'PROMOTE', slot: cpu.bench.findIndex((p) => p !== null) } : null;
    case 'playing':
      return state.currentPlayer === cpuId ? (turnAction(state, cpu) ?? { type: 'END_TURN' }) : null;
    case 'finished':
      return null;
  }
}

/** The next simple move on the CPU's turn, or null when there's nothing left to do. */
function turnAction(state: GameState, cpu: PlayerState): GameAction | null {
  const def = (defId: string) => lookupCard(state.cards, defId);

  // Bench every Basic in hand while there's room.
  const emptySlot = cpu.bench.findIndex((p) => p === null);
  const basic = cpu.hand.find((c) => isBasicPokemon(def(c.defId)));
  if (emptySlot >= 0 && basic) return { type: 'PLAY_BENCH', cardUid: basic.uid, slot: emptySlot };

  const inPlay: [Target, InPlayPokemon][] = [
    ...(cpu.active ? [['active', cpu.active] as [Target, InPlayPokemon]] : []),
    ...cpu.bench.flatMap((p, i) => (p ? [[i, p] as [Target, InPlayPokemon]] : [])),
  ];

  // Evolve anything that can evolve.
  for (const card of cpu.hand) {
    const evolution = def(card.defId);
    if (evolution.kind !== 'pokemon' || evolution.stage === 'basic') continue;
    const target = inPlay.find(([, p]) => evolveError(evolution, p, state.cards, state.turn) === null);
    if (target) return { type: 'EVOLVE', cardUid: card.uid, target: target[0] };
  }

  // Attach an energy to a Pokémon of the same type, active first.
  if (!state.energyAttachedThisTurn) {
    for (const card of cpu.hand) {
      const energy = def(card.defId);
      if (energy.kind !== 'energy') continue;
      const target = inPlay.find(([, p]) => {
        const pokemon = def(p.card.defId);
        return pokemon.kind === 'pokemon' && pokemon.type === energy.energyType;
      });
      if (target) return { type: 'ATTACH_ENERGY', cardUid: card.uid, target: target[0] };
    }
  }

  return null;
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
