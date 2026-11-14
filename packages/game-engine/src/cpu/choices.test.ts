// Every CPU difficulty answers a question with nothing to click with nothing, and the engine takes it (the guards #102
// added to resolveSearch and finishSearch), so a game never hangs on a CPU's choice; with options, each picks one.
import { describe, expect, it } from 'vitest';
import { duel, give } from '../effects/test-kit.js';
import { gymLeaderCpu, passiveCpu, runCpu, trainerCpu, type GameState, type PendingChoice } from '../index.js';

const CPUS = { passive: passiveCpu, trainer: trainerCpu, gymLeader: gymLeaderCpu } as const;

/** A choice without who it's for and what asked it (Omit over each member of the union, not the union as a whole). */
type Asked = PendingChoice extends infer C ? (C extends PendingChoice ? Omit<C, 'player' | 'source'> : never) : never;

/** Ash's turn, asked `choice`. */
const asked = (choice: Asked, opts: Parameters<typeof duel>[2] = {}): GameState => {
  const s = duel('charmander', 'squirtle', opts);
  s.players.ash!.hand = [];
  s.pendingChoice = { player: 'ash', source: 'Test', ...choice } as PendingChoice;
  return s;
};

describe.each(Object.entries(CPUS))('%s CPU', (_, cpu) => {
  describe('a question with nothing to click is answered with nothing, and the game goes on', () => {
    it('a heal (removeDamage) with no damaged Pokémon', () => {
      const { actions, state } = runCpu(asked({ kind: 'removeDamage' }), 'ash', cpu);
      expect(actions[0]).toEqual({ type: 'RESOLVE_CHOICE' });
      expect(state.pendingChoice).toBeUndefined();
    });

    it("an Energy removal (pickAttached) with no Energy on the opponent's Pokémon", () => {
      const { actions, state } = runCpu(asked({ kind: 'removeEach', targets: ['active'] }), 'ash', cpu);
      expect(actions[0]).toEqual({ type: 'RESOLVE_CHOICE' });
      expect(state.pendingChoice).toBeUndefined();
    });

    it("Rocket's Sneak Attack (oppHand) when the opponent has no Trainer cards", () => {
      const s = asked({ kind: 'oppHandTrainer' });
      s.players.misty!.hand = [];
      give(s, 'misty', 'water', 'charmander');
      const { actions, state } = runCpu(s, 'ash', cpu);
      expect(actions[0]).toEqual({ type: 'RESOLVE_CHOICE' });
      expect(state.pendingChoice).toBeUndefined();
    });

    it('a switch it may make (switchIn, optional: Strike and Run) with no Benched Pokémon', () => {
      const { actions, state } = runCpu(asked({ kind: 'switchIn', optional: true }), 'ash', cpu);
      expect(actions[0]).toEqual({ type: 'RESOLVE_CHOICE' });
      expect(state.pendingChoice).toBeUndefined();
    });

    it('a search onto the Bench (pickFromDeck, toBench: Playground) with no room on it', () => {
      const s = asked({ kind: 'pickFromDeck', filter: 'basic', toBench: true }, { bench: ['bulbasaur', 'onix', 'charmander', 'squirtle', 'bulbasaur'] });
      const { actions, state } = runCpu(s, 'ash', cpu);
      expect(actions[0]).toEqual({ type: 'RESOLVE_CHOICE' });
      expect(state.pendingChoice).toBeUndefined();
      expect(state.players.ash!.bench.filter(Boolean)).toHaveLength(5);
    });
  });

  describe('with something to click, it picks one', () => {
    it('switchIn: a benched Pokémon', () => {
      const { actions } = runCpu(asked({ kind: 'switchIn' }, { bench: ['bulbasaur', 'onix'] }), 'ash', cpu);
      expect(actions[0]).toMatchObject({ type: 'RESOLVE_CHOICE', target: expect.any(Number) });
    });

    it('benchDamage: a benched Pokémon is chosen to take the damage', () => {
      const { actions, state } = runCpu(asked({ kind: 'benchDamage', amount: 20 }, { bench: ['bulbasaur', 'onix'] }), 'ash', cpu);
      expect(actions[0]).toMatchObject({ type: 'RESOLVE_CHOICE', target: expect.any(Number) });
      expect(state.pendingChoice).toBeUndefined();
    });

    it("Double Gust: one of the opponent's benched Pokémon comes in", () => {
      const { actions, state } = runCpu(asked({ kind: 'doubleGust' }, { oppBench: ['charmander', 'onix'] }), 'ash', cpu);
      expect(actions[0]).toMatchObject({ type: 'RESOLVE_CHOICE', target: expect.any(Number) });
      expect(state.players.misty!.active!.card.defId).not.toBe(state.cards[Object.keys(state.cards).find((k) => state.cards[k]!.name === 'Squirtle')!]!.id);
    });

    it("Rocket's Sneak Attack: a Trainer card of the opponent's", () => {
      const s = asked({ kind: 'oppHandTrainer' });
      s.players.misty!.hand = [];
      const [potion] = give(s, 'misty', 'potion', 'water');
      const { actions } = runCpu(s, 'ash', cpu);
      expect(actions[0]).toEqual({ type: 'RESOLVE_CHOICE', cardUid: potion });
    });
  });
});

describe.each(Object.entries(CPUS))("%s CPU: Moon's Invite (as many damage counters as it likes)", (_, cpu) => {
  it("stops moving the opponent's damage counters, and never moves one back", () => {
    const s = asked({ kind: 'moveCounters', fromSide: 'opp' }, { oppBench: ['charmander', 'onix'] });
    s.players.misty!.active!.damage = 20;
    s.players.misty!.bench[0]!.damage = 30;
    s.players.misty!.bench[1]!.damage = 10;
    // (It used to move one counter back and forth until runCpu threw "stuck in a loop".)
    const { actions, state } = runCpu(s, 'ash', cpu);
    expect(state.pendingChoice).toBeUndefined();
    // At most a click for the Pokémon and one for where to, per counter: 6 counters.
    expect(actions.filter((a) => a.type === 'RESOLVE_CHOICE').length).toBeLessThanOrEqual(13);
  });

  it('with one Pokémon to move them among, it moves none', () => {
    const s = asked({ kind: 'moveCounters', fromSide: 'opp' });
    s.players.misty!.active!.damage = 20;
    const { actions, state } = runCpu(s, 'ash', cpu);
    expect(actions[0]).toEqual({ type: 'RESOLVE_CHOICE' });
    expect(state.pendingChoice).toBeUndefined();
  });
});
