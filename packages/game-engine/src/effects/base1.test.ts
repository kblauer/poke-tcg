import { describe, expect, it } from 'vitest';
import type { CardLibrary, EnergyType, PokemonCardDef } from '../cards.js';
import { applyAction, createGame, type AttackChoices, type GameAction, type GameState, type InPlayPokemon } from '../index.js';
import { nextRandom } from '../rng.js';

// Base Set cards (the fields the engine uses), keyed by their real ids so the effects apply.
const mon = (
  id: string,
  name: string,
  type: EnergyType,
  hp: number,
  attacks: [string, EnergyType[], number][],
  extra: Partial<PokemonCardDef> = {},
): PokemonCardDef => ({
  id,
  kind: 'pokemon',
  name,
  imageUrl: null,
  type,
  hp,
  stage: 'basic',
  evolvesFrom: null,
  attacks: attacks.map(([n, cost, damage]) => ({ name: n, cost, damage, text: null })),
  retreatCost: 1,
  ...extra,
});
const F: EnergyType = 'fire', W: EnergyType = 'water', C: EnergyType = 'colorless', P: EnergyType = 'psychic', L: EnergyType = 'lightning', G: EnergyType = 'grass';

const BY_NAME: CardLibrary = {
  charmander: mon('base1-46', 'Charmander', F, 50, [['Scratch', [C], 10], ['Ember', [F, C], 30]], { weakness: { type: W, multiplier: 2 } }),
  charizard: mon('base1-4', 'Charizard', F, 120, [['Fire Spin', [F, F, F, F], 100]], { weakness: { type: W, multiplier: 2 } }),
  squirtle: mon('base1-63', 'Squirtle', W, 40, [['Bubble', [W], 10], ['Withdraw', [W, C], 0]], { weakness: { type: L, multiplier: 2 } }),
  clefairy: mon('base1-5', 'Clefairy', C, 40, [['Sing', [C], 0], ['Metronome', [C, C, C], 0]]),
  gastly: mon('base1-50', 'Gastly', P, 30, [['Sleeping Gas', [P], 0], ['Destiny Bond', [P, C], 0]]),
  pidgeotto: mon('base1-22', 'Pidgeotto', C, 60, [['Whirlwind', [C, C], 20], ['Mirror Move', [C, C, C], 0]], { weakness: { type: L, multiplier: 2 } }),
  ninetales: mon('base1-12', 'Ninetales', F, 80, [['Lure', [C, C], 0], ['Fire Blast', [F, F, F, F], 80]]),
  magnemite: mon('base1-53', 'Magnemite', L, 40, [['Thunder Wave', [L], 10], ['Selfdestruct', [L, C], 40]]),
  haunter: mon('base1-29', 'Haunter', P, 50, [['Hypnosis', [P], 0], ['Dream Eater', [P, P], 50]]),
  raticate: mon('base1-40', 'Raticate', C, 60, [['Bite', [C], 20], ['Super Fang', [C, C, C], 0]]),
  poliwrath: mon('base1-13', 'Poliwrath', W, 90, [['Water Gun', [W, W, C], 30], ['Whirlpool', [W, W, C, C], 40]]),
  farfetchd: mon('base1-27', "Farfetch'd", C, 50, [['Leek Slap', [C], 30]]),
  onix: mon('base1-56', 'Onix', 'fighting', 90, [['Rock Throw', ['fighting'], 10], ['Harden', ['fighting', 'fighting'], 0]]),
  nidoking: mon('base1-11', 'Nidoking', G, 90, [['Thrash', [G, C, C], 30], ['Toxic', [G, G, G], 20]]),
  bulbasaur: mon('base1-44', 'Bulbasaur', G, 40, [['Leech Seed', [G, G], 20]], { weakness: { type: F, multiplier: 2 } }),
  fire: { id: 'fire', kind: 'energy', name: 'Fire Energy', imageUrl: null, energyType: 'fire' },
  water: { id: 'water', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: 'water' },
  psychic: { id: 'psychic', kind: 'energy', name: 'Psychic Energy', imageUrl: null, energyType: 'psychic' },
  lightning: { id: 'lightning', kind: 'energy', name: 'Lightning Energy', imageUrl: null, energyType: 'lightning' },
  fighting: { id: 'fighting', kind: 'energy', name: 'Fighting Energy', imageUrl: null, energyType: 'fighting' },
  grass: { id: 'grass', kind: 'energy', name: 'Grass Energy', imageUrl: null, energyType: 'grass' },
};

/** Library keyed by card id (effects are looked up by it); tests refer to cards by short names. */
const CARDS: CardLibrary = Object.fromEntries(Object.values(BY_NAME).map((d) => [d.id, d]));
const id = (name: string) => BY_NAME[name]!.id;

let uid = 0;
const pokemon = (name: string, energy: string[] = []): InPlayPokemon => ({
  card: { uid: `${name}-${uid++}`, defId: id(name) },
  evolvedFrom: [],
  damage: 0,
  energy: energy.map((e) => ({ uid: `${e}-${uid++}`, defId: e })),
  playedTurn: 0,
});

/** Ash's `attacker` (with `energy`) against Misty's `defender`, on Ash's turn 3. */
function duel(
  attacker: string,
  defender: string,
  opts: { energy?: string[]; defenderEnergy?: string[]; bench?: string[]; oppBench?: string[] } = {},
): GameState {
  const deck = Array<string>(20).fill(id('charmander'));
  const s = structuredClone(createGame({ id: 'ash', deck }, { id: 'misty', deck }, 1, CARDS));
  s.cards = CARDS;
  const ash = s.players.ash!;
  const misty = s.players.misty!;
  ash.active = pokemon(attacker, opts.energy);
  misty.active = pokemon(defender, opts.defenderEnergy);
  (opts.bench ?? []).forEach((id, i) => (ash.bench[i] = pokemon(id)));
  (opts.oppBench ?? []).forEach((id, i) => (misty.bench[i] = pokemon(id)));
  return Object.assign(s, { phase: 'playing', turn: 3, currentPlayer: 'ash' });
}

/** Sets the RNG so the next coin flips come up as given (true = heads). */
function flips(state: GameState, ...results: boolean[]): GameState {
  for (let seed = 0; seed < 1_000_000; seed++) {
    let s = seed;
    const ok = results.every((heads) => {
      const [r, next] = nextRandom(s);
      s = next;
      return r < 0.5 === heads;
    });
    if (ok) return { ...state, rngState: seed };
  }
  throw new Error('No seed found');
}

function act(state: GameState, player: string, action: GameAction): GameState {
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}
const attack = (state: GameState, attackIndex: number, choices?: AttackChoices, player = 'ash') =>
  act(state, player, { type: 'ATTACK', attackIndex, choices });
const tryAttack = (state: GameState, attackIndex: number, choices?: AttackChoices, player = 'ash') =>
  applyAction(state, player, { type: 'ATTACK', attackIndex, choices });
const endTurn = (state: GameState, player: string) => act(state, player, { type: 'END_TURN' });

describe('Base Set attacks', () => {
  describe('energy discards', () => {
    it('Ember discards a Fire Energy without asking when they are all the same', () => {
      const s = attack(duel('charmander', 'squirtle', { energy: ['fire', 'fire'] }), 1);
      expect(s.players.ash!.active!.energy.map((e) => e.defId)).toEqual(['fire']);
      expect(s.players.ash!.discard.map((e) => e.defId)).toEqual(['fire']);
      expect(s.players.misty!.active!.damage).toBe(30);
    });

    it('Fire Spin asks which 2 Energy to discard when they differ', () => {
      const s = duel('charizard', 'squirtle', { energy: ['fire', 'fire', 'fire', 'fire', 'water'] });
      expect(tryAttack(s, 0)).toEqual({ ok: false, error: 'Choose 2 Energy to discard' });
      const water = s.players.ash!.active!.energy[4]!.uid;
      const fire = s.players.ash!.active!.energy[0]!.uid;
      const after = attack(s, 0, { energyUids: [water, fire] });
      expect(after.players.ash!.discard.map((e) => e.defId).sort()).toEqual(['fire', 'water']);
    });
  });

  describe('special conditions', () => {
    it("Paralysis stops attacking and retreating, and wears off after its owner's next turn", () => {
      let s = attack(flips(duel('squirtle', 'charmander', { energy: ['water'], oppBench: ['charmander'] }), true), 0);
      const misty = () => s.players.misty!;
      expect(misty().active!.condition).toBe('paralyzed');
      s = structuredClone(s);
      misty().active!.energy.push({ uid: 'e', defId: 'fire' });
      expect(tryAttack(s, 0, undefined, 'misty')).toEqual({ ok: false, error: 'Charmander is Paralyzed and can\'t attack' });
      expect(applyAction(s, 'misty', { type: 'RETREAT', slot: 0, energyUids: ['e'] }).ok).toBe(false);
      s = endTurn(s, 'misty');
      expect(misty().active!.condition).toBeNull();
    });

    it('Sleep: the Pokémon wakes on heads between turns', () => {
      let s = attack(flips(duel('clefairy', 'squirtle', { energy: ['fire'] }), true, false), 0);
      // Checkup after Ash's turn: tails, still asleep.
      expect(s.players.misty!.active!.condition).toBe('asleep');
      s = flips(s, true); // Checkup after Misty's turn: heads.
      s = endTurn(s, 'misty');
      expect(s.players.misty!.active!.condition).toBeNull();
    });

    it('Poison does 10 damage after every turn; Toxic 20', () => {
      let s = attack(duel('nidoking', 'charmander', { energy: ['grass', 'grass', 'grass'] }), 1);
      // 20 from the attack + 20 Toxic at the end of the turn.
      expect(s.players.misty!.active!.damage).toBe(40);
      expect(s.players.misty!.active!.poison).toBe(20);
      s = endTurn(s, 'misty');
      expect(s.players.misty!.active).toBeNull();
    });

    it('Confusion: tails means 20 damage to itself and no attack', () => {
      const s = duel('charmander', 'squirtle', { energy: ['fire'] });
      s.players.ash!.active!.condition = 'confused';
      const after = attack(flips(s, false), 0);
      expect(after.players.ash!.active!.damage).toBe(20);
      expect(after.players.misty!.active!.damage).toBe(0);
      expect(after.currentPlayer).toBe('misty');
    });

    it('Confusion: retreating needs heads, and the energy is discarded either way', () => {
      const s = duel('charmander', 'squirtle', { energy: ['fire'], bench: ['charmander'] });
      s.players.ash!.active!.condition = 'confused';
      const energy = s.players.ash!.active!.energy[0]!.uid;
      const failed = act(flips(s, false), 'ash', { type: 'RETREAT', slot: 0, energyUids: [energy] });
      expect(failed.players.ash!.active!.card.uid).toBe(s.players.ash!.active!.card.uid);
      expect(failed.players.ash!.discard).toHaveLength(1);
      expect(failed.retreatedThisTurn).toBe(true);
      const worked = act(flips(s, true), 'ash', { type: 'RETREAT', slot: 0, energyUids: [energy] });
      expect(worked.players.ash!.bench[0]!.condition).toBeNull();
    });
  });

  it('Pokémon Checkup handles Poison, then Sleep, then Paralysis, across both actives', () => {
    let s = duel('charmander', 'squirtle');
    const ash = s.players.ash!.active!;
    const misty = s.players.misty!.active!;
    Object.assign(ash, { poison: 10, condition: 'paralyzed', paralyzedTurn: 2 });
    Object.assign(misty, { poison: 10, condition: 'asleep' });
    s = endTurn(flips(s, true), 'ash');
    const checkup = s.log!.map((l) => l.text);
    expect(checkup).toEqual([
      'Charmander takes 10 Poison damage.',
      'Squirtle takes 10 Poison damage.',
      'Squirtle is Asleep: heads.',
      'Squirtle woke up.',
      'Charmander is no longer Paralyzed.',
    ]);
  });

  it('Poison KOs between turns and the owner promotes', () => {
    const s = duel('charmander', 'bulbasaur', { energy: ['fire'], oppBench: ['squirtle'] });
    s.players.misty!.active!.damage = 30;
    s.players.misty!.active!.poison = 10;
    const after = endTurn(s, 'ash');
    expect(after.players.misty!.active).toBeNull();
    expect(after.phase).toBe('promote');
    expect(after.pendingPromotion).toBe('misty');
    expect(after.players.ash!.hand.length).toBe(s.players.ash!.hand.length + 1); // prize
  });

  it('Weakness doubles Ember against a Grass Pokémon', () => {
    const s = attack(duel('charmander', 'bulbasaur', { energy: ['fire', 'fire'], oppBench: ['squirtle'] }), 1);
    expect(s.players.misty!.active).toBeNull(); // 60 damage KOs Bulbasaur (40 HP)
  });

  it('Withdraw prevents damage during the opponent\'s next turn only', () => {
    let s = attack(flips(duel('squirtle', 'charmander', { energy: ['water', 'water'], defenderEnergy: ['fire'] }), true), 1);
    s = attack(s, 0, undefined, 'misty');
    expect(s.players.ash!.active!.damage).toBe(0);
    s = endTurn(s, 'ash');
    s = attack(s, 0, undefined, 'misty');
    expect(s.players.ash!.active!.damage).toBe(10);
  });

  it('Harden prevents attacks of 30 damage or less', () => {
    let s = attack(duel('onix', 'charmander', { energy: ['fighting', 'fighting'], defenderEnergy: ['fire', 'fire'] }), 1);
    s = attack(s, 1, undefined, 'misty'); // Ember: 30
    expect(s.players.ash!.active!.damage).toBe(0);
  });

  it('Selfdestruct damages both benches and itself; the attacker wins a simultaneous win', () => {
    const s = duel('magnemite', 'squirtle', { energy: ['lightning', 'lightning'], bench: ['charmander'], oppBench: ['squirtle'] });
    s.players.ash!.prizes = s.players.ash!.prizes.slice(0, 1);
    s.players.misty!.prizes = s.players.misty!.prizes.slice(0, 1);
    const after = attack(s, 1);
    expect(after.players.ash!.bench[0]!.damage).toBe(10);
    expect(after.players.misty!.bench[0]!.damage).toBe(10);
    // Both actives are Knocked Out and both players take their last prize.
    expect(after.phase).toBe('finished');
    expect(after.winner).toBe('ash');
  });

  it('Selfdestruct knocking out both actives asks both players to promote, the next player last', () => {
    const s = duel('magnemite', 'squirtle', { energy: ['lightning', 'lightning'], bench: ['charmander'], oppBench: ['squirtle'] });
    let after = attack(s, 1);
    expect(after.pendingPromotion).toBe('ash');
    after = act(after, 'ash', { type: 'PROMOTE', slot: 0 });
    expect(after.pendingPromotion).toBe('misty');
    after = act(after, 'misty', { type: 'PROMOTE', slot: 0 });
    expect(after.phase).toBe('playing');
    expect(after.currentPlayer).toBe('misty');
  });

  it('Lure asks which benched Pokémon to switch in', () => {
    const s = duel('ninetales', 'squirtle', { energy: ['fire', 'fire'], oppBench: ['charmander', 'bulbasaur'] });
    expect(tryAttack(s, 0)).toMatchObject({ ok: false });
    const after = attack(s, 0, { benchSlot: 1 });
    expect(after.players.misty!.active!.card.defId).toBe(id('bulbasaur'));
    expect(after.players.misty!.bench[1]!.card.defId).toBe(id('squirtle'));
  });

  it('Whirlwind damages, then switches in the first benched Pokémon', () => {
    const after = attack(duel('pidgeotto', 'squirtle', { energy: ['fire', 'fire'], oppBench: ['charmander'] }), 0);
    expect(after.players.misty!.bench[0]!.damage).toBe(20);
    expect(after.players.misty!.active!.card.defId).toBe(id('charmander'));
  });

  it('Whirlpool discards the chosen Energy from the defender', () => {
    const s = duel('poliwrath', 'nidoking', { energy: ['water', 'water', 'water', 'water'], defenderEnergy: ['fire', 'water'] });
    const water = s.players.misty!.active!.energy[1]!.uid;
    const after = attack(s, 1, { defenderEnergyUid: water });
    expect(after.players.misty!.active!.energy.map((e) => e.defId)).toEqual(['fire']);
  });

  it('Water Gun counts up to 2 extra Water Energy', () => {
    const after = attack(duel('poliwrath', 'nidoking', { energy: ['water', 'water', 'water', 'water', 'water', 'fire'] }), 0);
    // Cost W W C is paid with W W + Fire, leaving 3 Water: capped at +20.
    expect(after.players.misty!.active!.damage).toBe(50);
  });

  it('Metronome copies an attack without its discard, as Colorless', () => {
    const s = duel('clefairy', 'charmander', { energy: ['water', 'water', 'water'], defenderEnergy: ['fire', 'fire'] });
    const after = attack(s, 1, { copyIndex: 1 }); // Ember
    expect(after.players.misty!.active!.damage).toBe(30);
    expect(after.players.ash!.active!.energy).toHaveLength(3);
  });

  it('Mirror Move reflects the damage taken last turn, without weakness', () => {
    let s = duel('pidgeotto', 'charmander', { energy: ['fire', 'fire', 'fire'], defenderEnergy: ['fire', 'fire'] });
    s = endTurn(s, 'ash');
    s = attack(s, 1, undefined, 'misty'); // Ember: 30 to Pidgeotto
    s = attack(s, 1);
    expect(s.players.misty!.active!.damage).toBe(30);
  });

  it('Destiny Bond knocks out the Pokémon that knocks out Gastly', () => {
    let s = duel('gastly', 'charmander', { energy: ['psychic', 'psychic'], defenderEnergy: ['fire', 'fire'], bench: ['gastly'], oppBench: ['charmander'] });
    s = attack(s, 1);
    expect(s.players.ash!.active!.energy).toHaveLength(1);
    s = attack(s, 1, undefined, 'misty');
    expect(s.players.ash!.active).toBeNull();
    expect(s.players.misty!.active).toBeNull();
  });

  it('Super Fang does half the remaining HP, rounded up to 10, ignoring weakness', () => {
    const s = duel('raticate', 'charmander', { energy: ['fire', 'fire', 'fire'] });
    s.players.misty!.active!.damage = 20; // 30 HP left
    expect(attack(s, 1).players.misty!.active!.damage).toBe(40);
  });

  it('Leek Slap can only be used once while Farfetch\'d stays in play', () => {
    let s = attack(flips(duel('farfetchd', 'nidoking', { energy: ['fire'] }), true), 0);
    s = endTurn(s, 'misty');
    expect(tryAttack(s, 0)).toEqual({ ok: false, error: "Farfetch'd has already used Leek Slap" });
  });

  it('Dream Eater needs the defender to be Asleep', () => {
    const s = duel('haunter', 'charmander', { energy: ['psychic', 'psychic'] });
    expect(tryAttack(s, 1)).toEqual({ ok: false, error: 'The Defending Pokémon must be Asleep' });
    s.players.misty!.active!.condition = 'asleep';
    expect(attack(s, 1).players.misty!.active).toBeNull();
  });

  it('Leech Seed heals 10 when it does damage', () => {
    const s = duel('bulbasaur', 'squirtle', { energy: ['grass', 'grass'] });
    s.players.ash!.active!.damage = 20;
    expect(attack(s, 0).players.ash!.active!.damage).toBe(10);
  });

  it('logs attacks, coin flips and their results', () => {
    const s = attack(flips(duel('squirtle', 'charmander', { energy: ['water'] }), true), 0);
    expect(s.log!.map((l) => l.text)).toEqual(
      expect.arrayContaining(['Squirtle used Bubble.', 'Charmander took 20 damage.', 'Coin flip: heads.', 'Charmander is now Paralyzed.']),
    );
  });
});
