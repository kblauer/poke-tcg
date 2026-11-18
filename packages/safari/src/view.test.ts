import { describe, expect, it } from 'vitest';
import { int, rngFrom } from '@poke-tcg/campaign';
import { applySafariAction, createSafari, type SafariAction, type SafariState } from './draft.js';
import { gen1Units } from './gen1.js';
import { simulateBattle } from './battle.js';
import { safariView } from './view.js';

const units = gen1Units();

/** A run played some way by random actions, its states along the way. */
function played(seed: number, steps: number): SafariState[] {
  const rng = rngFrom(seed);
  let s = createSafari(seed, units);
  const states = [s];
  for (let i = 0; i < steps && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    const actions: SafariAction[] = [
      { type: 'PICK_STARTER', unit: s.starters[0]! },
      { type: 'BUY', index: int(rng, 5) },
      { type: 'PICK', unit: s.pick?.options[0] ?? '' },
      { type: 'CHOOSE', index: 0 },
      { type: 'BATTLE' },
      { type: 'ENCOUNTER', index: 0 },
      { type: 'TAKE', index: 0 },
      { type: 'LEAVE' },
    ];
    const result = applySafariAction(s, actions[int(rng, actions.length)]!, units);
    if (result.ok) states.push((s = result.state));
  }
  return states;
}

describe('what the browser gets of a run', () => {
  it('never holds the RNG state, an offered opponent\'s board, Blue\'s board, the steps to come or the gifts waiting', () => {
    for (let seed = 0; seed < 6; seed++) {
      for (const state of played(seed, 200)) {
        const view = safariView(state) as unknown as Record<string, unknown>;
        for (const key of ['rngState', 'champion', 'encounterSteps', 'gifts']) expect(view, key).not.toHaveProperty(key);
        for (const o of view.opponents as Record<string, unknown>[]) {
          expect(o).not.toHaveProperty('board');
          expect(o).not.toHaveProperty('trainer');
        }
        // Blue's board shows only once he's chosen.
        const blue = JSON.stringify(state.champion.board);
        if (state.opponent?.difficulty !== 'champion' && state.last?.against.difficulty !== 'champion') expect(JSON.stringify(view).includes(blue)).toBe(false);
      }
    }
  });

  it('shows the chosen opponent\'s board, and the last battle with its events to play back', () => {
    const states = played(3, 300);
    const ready = states.find((s) => s.phase === 'ready')!;
    expect(safariView(ready).opponent!.board).toEqual(ready.opponent!.board);
    const fought = states.find((s) => s.last)!;
    const view = safariView(fought);
    expect(view.last!.events).toEqual(simulateBattle(fought.last!.mine, fought.last!.opponent, fought.last!.seed).events);
    expect(view.last!.events.at(-1)).toEqual({ e: 'end', winner: fought.last!.winner });
  });
});
