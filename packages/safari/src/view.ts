// Safari Draft (issue #239, section 9): what the browser gets of a run. The server keeps the rest: the RNG state (so the
// shop's next rolls and the battles' coins can't be foreseen), the step's opponents' boards and Trainers (the choice
// shows only the trainer, type, difficulty and pay: opponentChoice), Blue's board until he's chosen, the encounter steps
// still to come, and the gifts waiting behind a pick. The last battle is sent with its event log, played again from its
// seed (simulateBattle is a pure function of the boards and the seed), for the screen to play back.
import { simulateBattle, type BattleEvent } from './battle.js';
import type { SafariBattle, SafariState } from './draft.js';
import { opponentChoice } from './opponents.js';

export type SafariView = Omit<SafariState, 'rngState' | 'opponents' | 'champion' | 'encounterSteps' | 'gifts' | 'last'> & {
  opponents: ReturnType<typeof opponentChoice>[];
  /** The last battle, with its events (the screen plays them back). */
  last: (SafariBattle & { events: BattleEvent[] }) | null;
};

export function safariView(state: SafariState): SafariView {
  const { rngState: _rng, opponents, champion: _champion, encounterSteps: _steps, gifts: _gifts, last, ...shown } = state;
  return {
    ...shown,
    opponents: opponents.map(opponentChoice),
    last: last && { ...last, events: simulateBattle(last.mine, last.opponent, last.seed).events },
  };
}
