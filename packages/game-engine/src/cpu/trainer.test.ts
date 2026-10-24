// The trainer CPU (trainer.ts): what it does, and what it leaves to the gym leader. Base Set cards, so the real effects apply.
import { describe, expect, it } from 'vitest';
import { duel, give, pokemon } from '../effects/test-kit.js';
import { runCpu, type GameAction, type GameState } from '../index.js';

/** The trainer CPU ('ash') on its turn with `active` against the player's ('misty') `defender`, with an empty hand. */
function cpuTurn(active: string, defender: string, opts: Parameters<typeof duel>[2] = {}): GameState {
  const s = duel(active, defender, opts);
  s.players.ash!.hand = [];
  s.cpuDifficulty = 'trainer';
  return s;
}
const moves = (s: GameState) => runCpu(s, 'ash').actions;
const types = (s: GameState) => moves(s).map((a) => a.type);
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const bench = (s: GameState, slot: number, name: string, energy: string[] = []) => (ash(s).bench[slot] = pokemon(name, energy));
const played = (actions: GameAction[], uid: string) => actions.find((a) => a.type === 'PLAY_TRAINER' && a.cardUid === uid);

describe('trainer CPU', () => {
  it('attacks for the most damage, even when that discards Energy', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire', 'fire'] });
    expect(moves(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 1 }]);
    // The gym leader keeps its Energy here.
    expect(runCpu({ ...s, cpuDifficulty: 'gymLeader' }, 'ash').actions).toMatchObject([{ type: 'ATTACK', attackIndex: 0 }]);
  });

  it('benches, evolves and attaches Energy where it makes an attack usable', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire', 'fire'] });
    const [, , fire] = give(s, 'ash', 'bulbasaur', 'charmeleon', 'fire');
    const actions = moves(s);
    expect(actions.map((a) => a.type)).toEqual(['PLAY_BENCH', 'EVOLVE', 'ATTACH_ENERGY', 'ATTACK']);
    expect(actions[2]).toEqual({ type: 'ATTACH_ENERGY', cardUid: fire, target: 'active' });
  });

  it('plays Bill, and Professor Oak once its hand is nearly spent', () => {
    const s = cpuTurn('charmander', 'squirtle');
    ash(s).deck.push(...Array.from({ length: 10 }, (_, i) => ({ uid: `extra-${i}`, defId: 'water' })));
    const [bill, oak] = give(s, 'ash', 'bill', 'professoroak');
    const actions = moves(s);
    expect(actions[0]).toEqual({ type: 'PLAY_TRAINER', cardUid: bill });
    expect(played(actions, oak!)).toBeDefined();
  });

  it("doesn't play PlusPower, Gust of Wind, Energy Removal or Defender", () => {
    const s = cpuTurn('charmander', 'onix', { energy: ['fire'], defenderEnergy: ['fighting'], oppBench: ['bulbasaur'] });
    misty(s).bench[0]!.damage = 30;
    misty(s).active!.damage = 80;
    ash(s).active!.damage = 40;
    give(s, 'ash', 'pluspower', 'gustofwind', 'energyremoval', 'defender');
    expect(types(s)).toEqual(['ATTACK']);
  });

  it('never uses Pokémon Powers', () => {
    const s = cpuTurn('bulbasaur', 'squirtle');
    bench(s, 0, 'venusaur', ['grass', 'grass']);
    expect(types(s)).toEqual(['END_TURN']);
  });

  it('heals only its active: Potion at 20 damage, Super Potion at 40 if it can still attack', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire', 'fire', 'fire'] });
    bench(s, 0, 'squirtle').damage = 30;
    const [potion, superPotion] = give(s, 'ash', 'potion', 'superpotion');
    expect(types(s)).toEqual(['ATTACK']);
    ash(s).active!.damage = 40;
    expect(moves(s)[0]).toMatchObject({ type: 'PLAY_TRAINER', cardUid: superPotion, choices: { target: 'active' } });
    ash(s).hand = ash(s).hand.filter((c) => c.uid !== superPotion);
    expect(moves(s)[0]).toEqual({ type: 'PLAY_TRAINER', cardUid: potion, choices: { target: 'active' } });
  });

  it('retreats an active that can’t attack soon for one that can, but not to dodge a Knock Out', () => {
    const stuck = cpuTurn('venusaur', 'squirtle', { energy: ['fire'] });
    bench(stuck, 0, 'charmander', ['fire']);
    expect(moves(stuck)[0]).toMatchObject({ type: 'RETREAT', slot: 0 });

    const threatened = cpuTurn('charmander', 'squirtle', { energy: ['fire'], defenderEnergy: ['water'] });
    ash(threatened).active!.damage = 30;
    bench(threatened, 0, 'onix', ['fighting']);
    expect(types(threatened)).toEqual(['ATTACK']);
  });

  it('promotes the benched Pokémon with the most HP left', () => {
    const s = cpuTurn('charmander', 'squirtle');
    bench(s, 0, 'charmander', ['fire']);
    bench(s, 1, 'onix');
    Object.assign(s, { phase: 'promote', pendingPromotion: 'ash' });
    ash(s).active = null;
    expect(moves(s)).toEqual([{ type: 'PROMOTE', slot: 1 }]);
  });
});

describe('CPU attacks that would lose the game', () => {
  // Magnemite: Thunder Wave (10) or Selfdestruct (40, and 40 to itself: its whole HP).
  const magnemite = (opts: Parameters<typeof duel>[2] = {}) => cpuTurn('magnemite', 'onix', { energy: ['lightning', 'lightning'], ...opts });
  const gymLeader = (s: GameState) => runCpu({ ...s, cpuDifficulty: 'gymLeader' }, 'ash').actions.filter((a) => a.type === 'ATTACK');

  it('never Selfdestructs with no Bench left, whichever the difficulty', () => {
    const s = magnemite();
    expect(moves(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 0 }]);
    expect(gymLeader(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 0 }]);
  });

  it("never Selfdestructs when its Knock Out gives the player their last Prize card", () => {
    const s = magnemite({ bench: ['charmander'] });
    misty(s).prizes = misty(s).prizes.slice(0, 1);
    expect(moves(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 0 }]);
    expect(gymLeader(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 0 }]);
  });

  it('still Selfdestructs when the game goes on (the trainer CPU, for the most damage)', () => {
    // Then it promotes its benched Pokémon.
    expect(moves(magnemite({ bench: ['charmander'] }))[0]).toMatchObject({ type: 'ATTACK', attackIndex: 1 });
  });

  it('Selfdestructs when it wins the game too (the attacker wins a win for both)', () => {
    const s = cpuTurn('magnemite', 'squirtle', { energy: ['lightning', 'lightning'] });
    expect(moves(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 1 }]);
  });
});
