import { isBasicPokemon, lookupCard } from '../cards.js';
import { openBenchSlot } from '../status.js';
import { evolveError, type GameAction, type GameState, type PlayerId, type PlayerState } from '../engine.js';
import { pendingChoiceView } from '../trainers.js';
import { acceptsChallenge, chooseActive, inPlay } from './shared.js';

/**
 * The 'passive' CPU, with almost no strategy. Besides the moves the rules force (choose an active,
 * promote after a knockout), on its turn it benches every Basic it can, evolves whatever it can,
 * attaches an energy to a Pokémon of the same type, and then ends its turn. It never attacks,
 * retreats or plays Trainers. Returns null when the CPU has nothing to do.
 */
export function passiveCpu(state: GameState, cpuId: PlayerId): GameAction | null {
  const cpu = state.players[cpuId];
  if (!cpu) throw new Error(`Unknown CPU player ${cpuId}`);

  switch (state.phase) {
    case 'setup':
      return chooseActive(state, cpu);
    case 'promote':
      return state.pendingPromotion === cpuId ? { type: 'PROMOTE', slot: cpu.bench.findIndex((p) => p !== null) } : null;
    case 'playing':
      // Choices from its own Pokémon (Pure Body) or the other player's cards (Computer Error, Chain Reaction, Whirlwind: its first benched Pokémon comes in).
      if (state.pendingChoice) return state.pendingChoice.player === cpuId ? finishSearch(state) : null;
      if (state.currentPlayer !== cpuId) return null;
      return turnAction(state, cpu) ?? { type: 'END_TURN' };
    case 'finished':
      return null;
  }
}

function finishSearch(state: GameState): GameAction {
  const view = pendingChoiceView(state, state.pendingChoice!);
  if (view.kind === 'arrangeTop') return { type: 'RESOLVE_CHOICE', order: view.cards.map((c) => c.uid) };
  if (view.kind === 'challenge') return { type: 'RESOLVE_CHOICE', count: acceptsChallenge(state, state.players[state.pendingChoice!.player]!) ? 1 : 0 };
  // Fairy Power ("any number"): it keeps its Pokémon in play.
  if (view.kind === 'ownPokemon' && view.optional) return { type: 'RESOLVE_CHOICE' };
  if (view.kind === 'ownPokemon' || view.kind === 'oppPokemon') return { type: 'RESOLVE_CHOICE', target: view.options[0] };
  // Computer Error: always the most cards (agreed).
  if (view.kind === 'drawCount') return { type: 'RESOLVE_CHOICE', count: view.max };
  // Lt. Surge's Treaty: the first answer.
  // The first option: Mind Games, Herbal Scent and Fire Boost flip (agreed for Mind Games).
  if (view.kind === 'options') return { type: 'RESOLVE_CHOICE', count: 0 };
  const [pick] = view.options;
  return { type: 'RESOLVE_CHOICE', ...(pick && { cardUid: pick.uid }) };
}

/** The next simple move on the CPU's turn, or null when there's nothing left to do. */
function turnAction(state: GameState, cpu: PlayerState): GameAction | null {
  const def = (defId: string) => lookupCard(state.cards, defId);

  // Bench every Basic in hand while there's room.
  const emptySlot = openBenchSlot(cpu.bench, state.cards, state.stadium?.card);
  const basic = cpu.hand.find((c) => isBasicPokemon(def(c.defId)));
  if (emptySlot >= 0 && basic) return { type: 'PLAY_BENCH', cardUid: basic.uid, slot: emptySlot };

  // Evolve anything that can evolve.
  for (const card of cpu.hand) {
    const evolution = def(card.defId);
    if (evolution.kind !== 'pokemon' || evolution.stage === 'basic') continue;
    const sides = state.playerOrder.map((id) => state.players[id]!);
    const target = inPlay(cpu).find(([, p]) => evolveError(evolution, p, state.cards, state.turn, sides) === null);
    if (target) return { type: 'EVOLVE', cardUid: card.uid, target: target[0] };
  }

  // Attach an energy to a Pokémon of the same type, active first.
  if (!state.energyAttachedThisTurn) {
    for (const card of cpu.hand) {
      const energy = def(card.defId);
      if (energy.kind !== 'energy') continue;
      const target = inPlay(cpu).find(([, p]) => {
        const pokemon = def(p.card.defId);
        return pokemon.kind === 'pokemon' && pokemon.type === energy.energyType;
      });
      if (target) return { type: 'ATTACH_ENERGY', cardUid: card.uid, target: target[0] };
    }
  }

  return null;
}
