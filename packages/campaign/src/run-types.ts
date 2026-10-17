// The kinds of run a player can pick. Each ends with a gym leader.
import { FLOWER_POWER_DECK, type DeckList } from './decks.js';

export interface RunType {
  id: string;
  name: string;
  description: string;
  /** Encounters before the gym leader. */
  steps: number;
  leader: {
    name: string;
    title: string;
    deck: DeckList;
    /** Key item for beating them. */
    badge: string;
  };
}

export const RUN_TYPES = {
  celadon: {
    id: 'celadon',
    name: 'Celadon City',
    description: 'The first run: trainers and encounters around Celadon City, ending with Gym Leader Erika and her Flower Power deck.',
    steps: 25,
    leader: { name: 'Erika', title: 'Celadon Gym Leader', deck: FLOWER_POWER_DECK, badge: 'rainbow-badge' },
  },
} satisfies Record<string, RunType>;

export type RunTypeId = keyof typeof RUN_TYPES;
export const RUN_TYPE_IDS = Object.keys(RUN_TYPES) as RunTypeId[];

/** The run a new account starts in. */
export const FIRST_RUN: RunTypeId = 'celadon';

export const runType = (id: string): RunType => {
  const type = (RUN_TYPES as Record<string, RunType>)[id];
  if (!type) throw new Error(`Unknown run type: ${id}`);
  return type;
};
