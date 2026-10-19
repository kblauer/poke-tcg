// The gym-leader CPU's rules (gym-leader.ts), one block per step, with Base Set cards so the real effects apply.
import { describe, expect, it } from 'vitest';
import { duel, give, id, pokemon } from '../effects/test-kit.js';
import { runCpu, type GameAction, type GameState, type Target } from '../index.js';

/** The CPU ('ash') on its turn with `active` against the player's ('misty') `defender`, with an empty hand. */
function cpuTurn(active: string, defender: string, opts: Parameters<typeof duel>[2] = {}): GameState {
  const s = duel(active, defender, opts);
  s.players.ash!.hand = [];
  return s;
}
const moves = (s: GameState) => runCpu(s, 'ash').actions;
const types = (s: GameState) => moves(s).map((a) => a.type);
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
const bench = (s: GameState, slot: number, name: string, energy: string[] = []) => (ash(s).bench[slot] = pokemon(name, energy));
const played = (actions: GameAction[], uid: string) => actions.find((a) => a.type === 'PLAY_TRAINER' && a.cardUid === uid) as Extract<GameAction, { type: 'PLAY_TRAINER' }> | undefined;

describe('CPU: attacking', () => {
  it('uses the cheapest attack that Knocks Out', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire', 'fire'] });
    misty(s).active!.damage = 30;
    expect(moves(s)).toEqual([{ type: 'ATTACK', attackIndex: 0, choices: {} }]);
  });

  it("doesn't discard Energy for an attack unless it Knocks Out", () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire', 'fire'] });
    expect(moves(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 0 }]);
    misty(s).active!.damage = 10;
    expect(moves(s)).toMatchObject([{ type: 'ATTACK', attackIndex: 1 }]);
  });

  it('ends its turn when it has no attack it can use', () => {
    expect(types(cpuTurn('bulbasaur', 'squirtle'))).toEqual(['END_TURN']);
  });

  it('promotes the benched Pokémon that attacks best', () => {
    const s = cpuTurn('charmander', 'squirtle');
    bench(s, 0, 'bulbasaur');
    bench(s, 1, 'charmander', ['fire']);
    Object.assign(s, { phase: 'promote', pendingPromotion: 'ash' });
    ash(s).active = null;
    expect(moves(s)).toEqual([{ type: 'PROMOTE', slot: 1 }]);
  });
});

describe('CPU: Energy', () => {
  it('attaches to the Active Pokémon when it makes an attack usable', () => {
    const s = cpuTurn('charmander', 'squirtle');
    bench(s, 0, 'charmeleon');
    const [fire] = give(s, 'ash', 'fire');
    expect(moves(s)[0]).toEqual({ type: 'ATTACH_ENERGY', cardUid: fire, target: 'active' });
  });

  it('otherwise attaches to the benched Pokémon closest to attacking', () => {
    const s = cpuTurn('onix', 'squirtle', { energy: ['fighting', 'fighting'] });
    bench(s, 0, 'charmeleon');
    bench(s, 1, 'squirtle');
    const [water] = give(s, 'ash', 'water');
    expect(moves(s)[0]).toEqual({ type: 'ATTACH_ENERGY', cardUid: water, target: 1 });
  });

  it('puts Double Colorless Energy only where two colorless symbols are open', () => {
    const s = cpuTurn('onix', 'squirtle', { energy: ['fighting', 'fighting'] });
    bench(s, 0, 'charmander');
    bench(s, 1, 'charmeleon');
    const [dce] = give(s, 'ash', 'dce');
    expect(moves(s)[0]).toEqual({ type: 'ATTACH_ENERGY', cardUid: dce, target: 1 });
  });

  it("doesn't attach Energy no attack can use", () => {
    const s = cpuTurn('bulbasaur', 'squirtle');
    give(s, 'ash', 'fire');
    expect(types(s)).toEqual(['END_TURN']);
  });

  it('moves Grass Energy to the active with Energy Trans so it can attack', () => {
    const s = cpuTurn('bulbasaur', 'squirtle');
    bench(s, 0, 'venusaur', ['grass', 'grass']);
    expect(moves(s)).toMatchObject([
      { type: 'USE_POWER', source: 0, choices: { from: 0, to: 'active' } },
      { type: 'USE_POWER', source: 0, choices: { from: 0, to: 'active' } },
      { type: 'ATTACK', attackIndex: 0 },
    ]);
  });

  it('attaches Water Energy with Rain Dance where it helps, keeping the normal attachment', () => {
    const s = cpuTurn('squirtle', 'charmander');
    bench(s, 0, 'blastoise');
    bench(s, 1, 'charmeleon');
    give(s, 'ash', 'water', 'water', 'fire');
    expect(types(s)).toEqual(['USE_POWER', 'USE_POWER', 'ATTACH_ENERGY', 'ATTACK']);
    expect(ash(runCpu(s, 'ash').state).hand).toEqual([]);
  });

  it('uses Energy Burn when it makes a better attack usable', () => {
    const s = cpuTurn('charizard', 'squirtle', { energy: ['water', 'water', 'water', 'water'] });
    expect(moves(s)).toMatchObject([{ type: 'USE_POWER', source: 'active' }, { type: 'ATTACK', attackIndex: 0 }]);
  });
});

describe('CPU: Trainers', () => {
  it('plays Bill first', () => {
    const s = cpuTurn('charmander', 'squirtle');
    const [bill] = give(s, 'ash', 'bill');
    expect(moves(s)[0]).toEqual({ type: 'PLAY_TRAINER', cardUid: bill });
  });

  it('plays Professor Oak only when its hand is nearly spent', () => {
    const s = cpuTurn('charmander', 'squirtle');
    ash(s).deck.push(...Array.from({ length: 10 }, (_, i) => ({ uid: `extra-${i}`, defId: id('water') })));
    const [oak] = give(s, 'ash', 'professoroak', 'lass', 'lass', 'lass');
    expect(played(moves(s), oak!)).toBeUndefined();
    ash(s).hand.splice(1, 1);
    expect(played(moves(s), oak!)).toBeDefined();
  });

  it('fetches the next stage of its active with Computer Search, discarding cards it has no use for', () => {
    const s = cpuTurn('charmander', 'squirtle');
    ash(s).deck.push({ uid: 'deck-charmeleon', defId: id('charmeleon') });
    const [search, lass1, lass2] = give(s, 'ash', 'computersearch', 'lass', 'lass');
    const actions = moves(s);
    expect(actions.slice(0, 3)).toEqual([
      { type: 'PLAY_TRAINER', cardUid: search, choices: { handUids: [lass2, lass1] } },
      { type: 'RESOLVE_CHOICE', cardUid: 'deck-charmeleon' },
      { type: 'EVOLVE', cardUid: 'deck-charmeleon', target: 'active' },
    ]);
  });

  it("doesn't play Computer Search when nothing it wants could be in the deck", () => {
    const s = cpuTurn('charmander', 'squirtle');
    // With a Pokémon on the Bench it doesn't need a Basic either.
    bench(s, 0, 'squirtle');
    const [search] = give(s, 'ash', 'computersearch', 'lass', 'lass');
    expect(played(moves(s), search!)).toBeUndefined();
  });

  it('trades a Pokémon it can’t use with Pokémon Trader', () => {
    const s = cpuTurn('charmander', 'squirtle');
    ash(s).deck.push({ uid: 'deck-charmeleon', defId: id('charmeleon') });
    const [trader, electrode] = give(s, 'ash', 'pokemontrader', 'electrode');
    expect(moves(s).slice(0, 2)).toEqual([
      { type: 'PLAY_TRAINER', cardUid: trader, choices: { handUids: [electrode] } },
      { type: 'RESOLVE_CHOICE', cardUid: 'deck-charmeleon' },
    ]);
  });

  it('evolves straight to Stage 2 with Pokémon Breeder', () => {
    const s = cpuTurn('charmander', 'squirtle');
    const [breeder, charizard] = give(s, 'ash', 'pokemonbreeder', 'charizard');
    expect(moves(s)[0]).toEqual({ type: 'PLAY_TRAINER', cardUid: breeder, choices: { handUids: [charizard], target: 'active' } });
  });

  it('benches a Clefairy Doll only when its Bench is empty', () => {
    const s = cpuTurn('charmander', 'squirtle');
    const [doll] = give(s, 'ash', 'doll');
    expect(moves(s)[0]).toEqual({ type: 'PLAY_BENCH', cardUid: doll, slot: 0 });
    bench(s, 0, 'charmander');
    expect(moves(s).some((a) => a.type === 'PLAY_BENCH')).toBe(false);
  });

  it('heals the active with Potion at 20 damage or more', () => {
    const s = cpuTurn('charmander', 'squirtle');
    const [potion] = give(s, 'ash', 'potion');
    ash(s).active!.damage = 10;
    expect(played(moves(s), potion!)).toBeUndefined();
    ash(s).active!.damage = 20;
    expect(played(moves(s), potion!)).toEqual({ type: 'PLAY_TRAINER', cardUid: potion, choices: { target: 'active' } });
  });

  it('uses Super Potion on the active only if it can still use its best attack', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire', 'fire'] });
    const [superPotion] = give(s, 'ash', 'superpotion');
    ash(s).active!.damage = 40;
    expect(played(moves(s), superPotion!)).toBeUndefined();
    ash(s).active!.energy.push(pokemon('charmander', ['fire']).energy[0]!);
    expect(played(moves(s), superPotion!)).toMatchObject({ choices: { target: 'active' } });
  });

  it('plays Full Heal on a Special Condition', () => {
    const s = cpuTurn('charmander', 'squirtle');
    ash(s).active!.condition = 'asleep';
    const [fullHeal] = give(s, 'ash', 'fullheal');
    expect(moves(s)[0]).toEqual({ type: 'PLAY_TRAINER', cardUid: fullHeal });
  });

  it("removes Energy from the player's active", () => {
    const s = cpuTurn('charmander', 'squirtle', { defenderEnergy: ['water'] });
    const [removal] = give(s, 'ash', 'energyremoval');
    expect(moves(s)[0]).toEqual({ type: 'PLAY_TRAINER', cardUid: removal, choices: { oppTarget: 'active', oppEnergyUids: [misty(s).active!.energy[0]!.uid] } });
  });

  it('uses Gust of Wind to bring up a benched Pokémon it can Knock Out', () => {
    const s = cpuTurn('charmander', 'onix', { energy: ['fire'], oppBench: ['bulbasaur'] });
    misty(s).bench[0]!.damage = 30;
    const [gust] = give(s, 'ash', 'gustofwind');
    expect(moves(s)).toEqual([
      { type: 'PLAY_TRAINER', cardUid: gust, choices: { oppTarget: 0 } },
      { type: 'ATTACK', attackIndex: 0, choices: {} },
    ]);
  });

  it('plays PlusPower when +10 makes a Knock Out', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire'] });
    misty(s).active!.damage = 20;
    const [plusPower] = give(s, 'ash', 'pluspower');
    expect(types(s)).toEqual(['PLAY_TRAINER', 'ATTACK']);
    misty(s).active!.damage = 0;
    expect(played(moves(s), plusPower!)).toBeUndefined();
  });

  it('attaches Defender when it stops a Knock Out next turn', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire'], defenderEnergy: ['water'] });
    ash(s).active!.damage = 30;
    const [defender] = give(s, 'ash', 'defender');
    expect(played(moves(s), defender!)).toEqual({ type: 'PLAY_TRAINER', cardUid: defender, choices: { target: 'active' } });
  });
});

describe('CPU: retreating', () => {
  it('retreats an active that can’t attack soon for a benched Pokémon that can attack now', () => {
    const s = cpuTurn('venusaur', 'squirtle', { energy: ['fire'] });
    bench(s, 0, 'bulbasaur');
    bench(s, 1, 'charmander', ['fire']);
    const [first] = moves(s);
    expect(first).toEqual({ type: 'RETREAT', slot: 1, energyUids: [ash(s).active!.energy[0]!.uid] });
  });

  it('prefers Switch to paying the Retreat Cost', () => {
    const s = cpuTurn('venusaur', 'squirtle', { energy: ['fire'] });
    bench(s, 1, 'charmander', ['fire']);
    const [sw] = give(s, 'ash', 'switch');
    expect(moves(s)[0]).toEqual({ type: 'PLAY_TRAINER', cardUid: sw, choices: { target: 1 as Target } });
  });

  it('brings in a Pokémon that survives when the active would be Knocked Out', () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire'], defenderEnergy: ['water'] });
    ash(s).active!.damage = 30;
    bench(s, 0, 'onix', ['fighting']);
    expect(moves(s)[0]).toMatchObject({ type: 'RETREAT', slot: 0 });
  });

  it("doesn't retreat while it can Knock Out the attacker first", () => {
    const s = cpuTurn('charmander', 'squirtle', { energy: ['fire'], defenderEnergy: ['water'] });
    ash(s).active!.damage = 30;
    misty(s).active!.damage = 30;
    bench(s, 0, 'onix', ['fighting']);
    expect(types(s)).toEqual(['ATTACK']);
  });
});

describe('CPU: Damage Swap', () => {
  it('moves damage off an active that would be Knocked Out', () => {
    const s = cpuTurn('alakazam', 'squirtle', { defenderEnergy: ['water'] });
    ash(s).active!.damage = 70;
    bench(s, 0, 'onix');
    const actions = moves(s);
    expect(actions[0]).toEqual({ type: 'USE_POWER', source: 'active', choices: { from: 'active', to: 0 } });
    expect(actions.filter((a) => a.type === 'USE_POWER')).toHaveLength(1);
  });
});

describe('CPU: Gym Heroes and Gym Challenge Trainers', () => {
  /** The CPU's hand is these cards, and its deck big enough to draw from. */
  const hand = (s: GameState, ...names: string[]) => {
    ash(s).deck = Array.from({ length: 15 }, (_, i) => ({ uid: `deck-${i}`, defId: id('charmander') }));
    return give(s, 'ash', ...names);
  };

  it('plays Erika with a small hand', () => {
    const s = cpuTurn('charmander', 'onix');
    const [erika] = hand(s, 'erikaG');
    expect(played(moves(s), erika!)).toBeDefined();
  });

  it('plays Brock once 2 of its Pokémon are damaged', () => {
    const s = cpuTurn('charmander', 'onix');
    bench(s, 0, 'squirtle');
    ash(s).active!.damage = 10;
    ash(s).bench[0]!.damage = 10;
    const [brock] = hand(s, 'brockG');
    expect(played(moves(s), brock!)).toBeDefined();
  });

  it("plays Blaine and attaches 2 Fire Energy cards to a Pokémon with Blaine in its name that needs them", () => {
    const s = cpuTurn('blainesGrowlithe', 'onix');
    const [blaine] = hand(s, 'blaine', 'fire', 'fire');
    const actions = moves(s);
    expect(played(actions, blaine!)).toBeDefined();
    expect(actions.filter((a) => a.type === 'ATTACH_ENERGY' && a.target === 'active')).toHaveLength(2);
  });

  it("plays Misty when its 20 more damage Knocks Out, discarding cards it can't use", () => {
    const s = cpuTurn('mistysTentacoolC', 'squirtle', { energy: ['water', 'water'] });
    const [misty] = hand(s, 'mistyG', 'charizard', 'charizard');
    expect(played(moves(s), misty!)).toBeDefined();
  });

  it('plays Koga before attacking with a Pokémon with Koga in its name', () => {
    const s = cpuTurn('kogasKoffing', 'onix', { energy: ['grass'] });
    const [koga] = hand(s, 'koga');
    const actions = moves(s);
    expect([played(actions, koga!) !== undefined, actions.at(-1)!.type]).toEqual([true, 'ATTACK']);
  });

  it('plays Giovanni so a Pokémon with Giovanni in its name can evolve the turn it was played', () => {
    const s = cpuTurn('charmander', 'onix');
    bench(s, 0, 'giovannisMachop');
    ash(s).bench[0]!.playedTurn = 3;
    const [giovanni, machoke] = hand(s, 'giovanni', 'giovannisMachoke');
    const actions = moves(s);
    expect(played(actions, giovanni!)).toBeDefined();
    expect(actions).toContainEqual({ type: 'EVOLVE', cardUid: machoke, target: 0 });
  });

  it("plays a Stadium for its owner's Pokémon when it has more of them in play", () => {
    const s = cpuTurn('brocksRhyhorn', 'onix');
    bench(s, 0, 'brocksGeodude');
    const [pewter] = hand(s, 'pewterGym');
    expect(played(moves(s), pewter!)).toBeDefined();
  });

  it("plays Tickling Machine only when it has no attack that does damage", () => {
    const stuck = cpuTurn('charmander', 'onix');
    const [machine] = hand(stuck, 'ticklingMachine');
    expect(played(moves(stuck), machine!)).toBeDefined();
    const ready = cpuTurn('charmander', 'onix', { energy: ['fire'] });
    const [other] = hand(ready, 'ticklingMachine');
    expect(played(moves(ready), other!)).toBeUndefined();
  });
});
