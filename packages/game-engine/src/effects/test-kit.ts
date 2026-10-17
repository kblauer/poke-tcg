// Shared setup for effect tests: Base Set and Fossil card fixtures and a ready-to-play duel. Not exported from the package.
import type { CardLibrary, EnergyType, PokemonCardDef } from '../cards.js';
import { applyAction, createGame, type AttackChoices, type GameAction, type GameState, type InPlayPokemon } from '../index.js';
import { nextRandom } from '../rng.js';

// Base Set cards (the fields the engine uses), keyed by their real ids so the effects apply.
/** Base Set Trainer card numbers and names (keyed in BY_NAME by lowercase letters only, e.g. 'pokemonbreeder'). */
const TRAINERS: [number, string][] = [
  [71, 'Computer Search'], [72, 'Devolution Spray'], [73, 'Impostor Professor Oak'], [74, 'Item Finder'], [75, 'Lass'],
  [76, 'Pokemon Breeder'], [77, 'Pokemon Trader'], [78, 'Scoop Up'], [79, 'Super Energy Removal'], [80, 'Defender'],
  [81, 'Energy Retrieval'], [82, 'Full Heal'], [83, 'Maintenance'], [84, 'PlusPower'], [85, 'Pokemon Center'],
  [86, 'Pokemon Flute'], [87, 'Pokedex'], [88, 'Professor Oak'], [89, 'Revive'], [90, 'Super Potion'], [91, 'Bill'],
  [92, 'Energy Removal'], [93, 'Gust of Wind'], [94, 'Potion'], [95, 'Switch'],
];

export const mon = (
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
export const F: EnergyType = 'fire', W: EnergyType = 'water', C: EnergyType = 'colorless', P: EnergyType = 'psychic', L: EnergyType = 'lightning', G: EnergyType = 'grass', FI: EnergyType = 'fighting';

const BY_NAME: CardLibrary = {
  charmander: mon('base1-46', 'Charmander', F, 50, [['Scratch', [C], 10], ['Ember', [F, C], 30]], { weakness: { type: W, multiplier: 2 } }),
  charmeleon: mon('base1-24', 'Charmeleon', F, 80, [['Slash', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Charmander', weakness: { type: W, multiplier: 2 } }),
  charizard: mon('base1-4', 'Charizard', F, 120, [['Fire Spin', [F, F, F, F], 100]], {
    stage: 'stage2',
    evolvesFrom: 'Charmeleon',
    evolvesFromBasic: 'Charmander',
    weakness: { type: W, multiplier: 2 },
    power: { name: 'Energy Burn', text: '' },
  }),
  doll: mon('base1-70', 'Clefairy Doll', C, 10, [], { retreatCost: 0, trainerText: 'Play Clefairy Doll as if it were a Basic Pokémon.' }),
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
  alakazam: mon('base1-1', 'Alakazam', P, 80, [['Confuse Ray', [P, P, P], 30]], { stage: 'stage2', power: { name: 'Damage Swap', text: '' } }),
  blastoise: mon('base1-2', 'Blastoise', W, 100, [['Hydro Pump', [W, W, W], 40]], { stage: 'stage2', power: { name: 'Rain Dance', text: '' } }),
  machamp: mon('base1-8', 'Machamp', 'fighting', 100, [['Seismic Toss', ['fighting', 'fighting', 'fighting', C], 60]], { stage: 'stage2', power: { name: 'Strikes Back', text: '' } }),
  venusaur: mon('base1-15', 'Venusaur', G, 100, [['Solarbeam', [G, G, G, G], 60]], { stage: 'stage2', power: { name: 'Energy Trans', text: '' } }),
  electrode: mon('base1-21', 'Electrode', L, 80, [['Electric Shock', [L, L, L], 50]], { stage: 'stage1', power: { name: 'Buzzap', text: '' } }),
  bulbasaur: mon('base1-44', 'Bulbasaur', G, 40, [['Leech Seed', [G, G], 20]], { weakness: { type: F, multiplier: 2 } }),
  // Fossil
  articuno: mon('base3-2', 'Articuno', W, 70, [['Freeze Dry', [W, W, W], 30], ['Blizzard', [W, W, W, W], 50]]),
  gengar: mon('base3-5', 'Gengar', P, 80, [['Dark Mind', [P, P, P], 30]], { stage: 'stage2', power: { name: 'Curse', text: '' } }),
  aerodactyl: mon('base3-1', 'Aerodactyl', FI, 60, [['Wing Attack', [C, C, C], 30]], { stage: 'stage1', power: { name: 'Prehistoric Power', text: '' } }),
  ditto: mon('base3-3', 'Ditto', C, 50, [], { power: { name: 'Transform', text: '' } }),
  dragonite: mon('base3-4', 'Dragonite', C, 100, [['Slam', [C, C, C, C], 40]], { stage: 'stage2', power: { name: 'Step In', text: '' } }),
  haunterF: mon('base3-6', 'Haunter', P, 50, [['Nightmare', [P, C], 10]], { stage: 'stage1', power: { name: 'Transparency', text: '' } }),
  muk: mon('base3-13', 'Muk', G, 70, [['Sludge', [G, G, G], 30]], { stage: 'stage1', power: { name: 'Toxic Gas', text: '' } }),
  slowbro: mon('base3-43', 'Slowbro', P, 60, [['Psyshock', [P, P], 20]], { stage: 'stage1', power: { name: 'Strange Behavior', text: '' } }),
  kabuto: mon('base3-50', 'Kabuto', FI, 30, [['Scratch', [C], 10]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil', power: { name: 'Kabuto Armor', text: '' } }),
  omanyte: mon('base3-52', 'Omanyte', W, 40, [['Water Gun', [W], 10]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil', power: { name: 'Clairvoyance', text: '' } }),
  omastar: mon('base3-40', 'Omastar', W, 70, [['Water Gun', [W, C], 20]], { stage: 'stage2', evolvesFrom: 'Omanyte', evolvesFromBasic: 'Mysterious Fossil' }),
  fossil: mon('base3-62', 'Mysterious Fossil', C, 10, [], { retreatCost: 0, trainerText: 'Play Mysterious Fossil as if it were a Basic Pokémon.' }),
  mrfuji: { id: 'base3-58', kind: 'trainer', name: 'Mr. Fuji', imageUrl: null, text: '' },
  energysearch: { id: 'base3-59', kind: 'trainer', name: 'Energy Search', imageUrl: null, text: '' },
  gambler: { id: 'base3-60', kind: 'trainer', name: 'Gambler', imageUrl: null, text: '' },
  recycle: { id: 'base3-61', kind: 'trainer', name: 'Recycle', imageUrl: null, text: '' },
  tentacool: mon('base3-56', 'Tentacool', W, 30, [['Acid', [W], 10]], { power: { name: 'Cowardice', text: '' } }),
  hitmonlee: mon('base3-7', 'Hitmonlee', FI, 60, [['Stretch Kick', [FI, FI], 0], ['High Jump Kick', [FI, FI, FI], 50]]),
  hypno: mon('base3-8', 'Hypno', P, 90, [['Prophecy', [P], 0], ['Dark Mind', [P, P, P], 30]], { stage: 'stage1' }),
  kabutops: mon('base3-9', 'Kabutops', FI, 60, [['Sharp Sickle', [FI, FI], 30], ['Absorb', [FI, FI, FI, FI], 40]], { stage: 'stage2' }),
  lapras: mon('base3-10', 'Lapras', W, 80, [['Water Gun', [W], 10], ['Confuse Ray', [W, W], 10]]),
  magnetonF: mon('base3-11', 'Magneton', L, 70, [['Sonicboom', [L, C], 20], ['Selfdestruct', [L, L, L, L], 100]], { stage: 'stage1' }),
  moltres: mon('base3-12', 'Moltres', F, 70, [['Wildfire', [F], 0], ['Dive Bomb', [F, F, F, F], 80]]),
  raichuF: mon('base3-14', 'Raichu', L, 90, [['Gigashock', [L, L, L, L], 30]], { stage: 'stage1' }),
  zapdosF: mon('base3-15', 'Zapdos', L, 80, [['Thunderstorm', [L, L, L, L], 40]]),
  arbok: mon('base3-31', 'Arbok', G, 60, [['Terror Strike', [G], 10], ['Poison Fang', [G, G, C], 20]], { stage: 'stage1' }),
  cloyster: mon('base3-32', 'Cloyster', W, 50, [['Clamp', [W, W], 30], ['Spike Cannon', [W, W], 30]], { stage: 'stage1' }),
  gastlyF: mon('base3-33', 'Gastly', P, 50, [['Lick', [P], 10], ['Energy Conversion', [P, P], 0]]),
  seadra: mon('base3-42', 'Seadra', W, 60, [['Water Gun', [W, C], 20], ['Agility', [W, C, C], 20]], { stage: 'stage1' }),
  geodude: mon('base3-47', 'Geodude', FI, 50, [['Stone Barrage', [FI, C], 10]]),
  grimer: mon('base3-48', 'Grimer', G, 50, [['Nasty Goo', [C], 10], ['Minimize', [G], 0]]),
  horsea: mon('base3-49', 'Horsea', W, 40, [['Smokescreen', [W], 10]]),
  krabby: mon('base3-51', 'Krabby', W, 50, [['Call for Family', [W], 0], ['Irongrip', [W, C], 20]]),
  psyduck: mon('base3-53', 'Psyduck', W, 50, [['Headache', [P], 0], ['Fury Swipes', [W], 10]]),
  slowpoke: mon('base3-55', 'Slowpoke', P, 50, [['Spacing Out', [C], 0], ['Scavenge', [P, P], 0]]),
  zubat: mon('base3-57', 'Zubat', G, 40, [['Supersonic', [C, C], 0], ['Leech Life', [G, C], 10]]),
  fire: { id: 'fire', kind: 'energy', name: 'Fire Energy', imageUrl: null, energyType: 'fire' },
  water: { id: 'water', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: 'water' },
  psychic: { id: 'psychic', kind: 'energy', name: 'Psychic Energy', imageUrl: null, energyType: 'psychic' },
  lightning: { id: 'lightning', kind: 'energy', name: 'Lightning Energy', imageUrl: null, energyType: 'lightning' },
  fighting: { id: 'fighting', kind: 'energy', name: 'Fighting Energy', imageUrl: null, energyType: 'fighting' },
  grass: { id: 'grass', kind: 'energy', name: 'Grass Energy', imageUrl: null, energyType: 'grass' },
  dce: { id: 'base1-96', kind: 'energy', name: 'Double Colorless Energy', imageUrl: null, energyType: 'colorless', amount: 2, basic: false },
  ...Object.fromEntries(
    TRAINERS.map(([n, name]) => [name.toLowerCase().replace(/[^a-z]/g, ''), { id: `base1-${n}`, kind: 'trainer' as const, name, imageUrl: null, text: '' }]),
  ),
};

/** Library keyed by card id (effects are looked up by it); tests refer to cards by short names. */
export const CARDS: CardLibrary = Object.fromEntries(Object.values(BY_NAME).map((d) => [d.id, d]));
export const id = (name: string) => BY_NAME[name]!.id;

let uid = 0;
export const pokemon = (name: string, energy: string[] = []): InPlayPokemon => ({
  card: { uid: `${name}-${uid++}`, defId: id(name) },
  evolvedFrom: [],
  damage: 0,
  energy: energy.map((e) => ({ uid: `${e}-${uid++}`, defId: BY_NAME[e]?.id ?? e })),
  playedTurn: 0,
});

/** Ash's `attacker` (with `energy`) against Misty's `defender`, on Ash's turn 3. */
export function duel(
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
export function flips(state: GameState, ...results: boolean[]): GameState {
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

export function act(state: GameState, player: string, action: GameAction): GameState {
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}
export const attack = (state: GameState, attackIndex: number, choices?: AttackChoices, player = 'ash') =>
  act(state, player, { type: 'ATTACK', attackIndex, choices });
export const tryAttack = (state: GameState, attackIndex: number, choices?: AttackChoices, player = 'ash') =>
  applyAction(state, player, { type: 'ATTACK', attackIndex, choices });
export const endTurn = (state: GameState, player: string) => act(state, player, { type: 'END_TURN' });

/** Puts cards (by short name) into a player's hand and returns their uids. */
export function give(state: GameState, player: string, ...names: string[]): string[] {
  return names.map((name) => {
    const card = { uid: `${name}-${uid++}`, defId: id(name) };
    state.players[player]!.hand.push(card);
    return card.uid;
  });
}
