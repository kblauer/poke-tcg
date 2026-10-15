import type { GameAction, InPlayPokemon, PlayerView, Target } from '@poke-tcg/game-engine';

/** A place a card can be played to: the active spot or one of the bench slots. */
export type SlotId = 'active' | `bench-${number}`;

export const benchSlotId = (slot: number): SlotId => `bench-${slot}`;
export const toTarget = (slot: SlotId): Target => (slot === 'active' ? 'active' : Number(slot.slice('bench-'.length)));

/** The player's Pokémon in a slot, or null if it's empty. */
export function pokemonAt(self: PlayerView['self'], slot: SlotId): InPlayPokemon | null {
  const target = toTarget(slot);
  return (target === 'active' ? self.active : self.bench[target]) ?? null;
}

export const emptyBenchSlots = (self: PlayerView['self']): SlotId[] => self.bench.flatMap((p, i) => (p ? [] : [benchSlotId(i)]));

export const occupiedSlots = (self: PlayerView['self']): SlotId[] => [
  ...(self.active ? (['active'] as const) : []),
  ...self.bench.flatMap((p, i) => (p ? [benchSlotId(i)] : [])),
];

/** Slot the in-flight action is about, so only that slot shows a loading state. */
export function pendingSlot(action: GameAction | null): SlotId | null {
  switch (action?.type) {
    case 'SET_ACTIVE':
      return 'active';
    case 'PLAY_BENCH':
      return benchSlotId(action.slot);
    case 'ATTACH_ENERGY':
    case 'EVOLVE':
      return action.target === 'active' ? 'active' : benchSlotId(action.target);
    case 'PROMOTE':
    case 'RETREAT':
      return benchSlotId(action.slot);
    case 'USE_POWER': {
      // The Pokémon receiving something (Rain Dance, Damage Swap…), else the one using the power.
      const target = action.choices?.to ?? action.source;
      return target === 'active' ? 'active' : benchSlotId(target);
    }
    default:
      return null;
  }
}
