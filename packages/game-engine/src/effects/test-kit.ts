// Shared setup for effect tests: Base Set, Jungle and Fossil card fixtures and a ready-to-play duel. Not exported from the package.
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
  nidoranM: mon('base1-55', 'Nidoran♂', G, 40, [['Horn Hazard', [G], 30]]),
  // Jungle
  electrodeJ: mon('base2-2', 'Electrode', L, 90, [['Tackle', [C, C], 20], ['Chain Lightning', [L, L, L], 20]], { stage: 'stage1' }),
  flareon: mon('base2-3', 'Flareon', F, 70, [['Quick Attack', [C, C], 10], ['Flamethrower', [F, F, C, C], 60]], { stage: 'stage1' }),
  kangaskhan: mon('base2-5', 'Kangaskhan', C, 90, [['Fetch', [C], 0], ['Comet Punch', [C, C, C, C], 20]]),
  nidoqueen: mon('base2-7', 'Nidoqueen', G, 90, [['Boyfriends', [G, C], 20], ['Mega Punch', [G, G, C, C], 50]], { stage: 'stage2' }),
  pidgeot: mon('base2-8', 'Pidgeot', C, 80, [['Wing Attack', [C, C], 20], ['Hurricane', [C, C, C], 30]], { stage: 'stage2' }),
  scyther: mon('base2-10', 'Scyther', G, 70, [['Swords Dance', [G], 0], ['Slash', [C, C, C], 30]]),
  vaporeon: mon('base2-12', 'Vaporeon', W, 80, [['Quick Attack', [C, C], 10], ['Water Gun', [W, W, C], 30]], { stage: 'stage1' }),
  victreebel: mon('base2-14', 'Victreebel', G, 80, [['Lure', [G], 0], ['Acid', [G, G], 20]], { stage: 'stage2' }),
  vileplume: mon('base2-15', 'Vileplume', G, 80, [['Petal Dance', [G, G, G], 40]], { stage: 'stage2', power: { name: 'Heal', text: '' } }),
  mrMime: mon('base2-6', 'Mr. Mime', P, 40, [['Meditate', [P, C], 10]], { power: { name: 'Invisible Wall', text: '' } }),
  snorlax: mon('base2-11', 'Snorlax', C, 90, [['Body Slam', [C, C, C, C], 30]], { power: { name: 'Thick Skinned', text: '' } }),
  venomoth: mon('base2-13', 'Venomoth', G, 70, [['Venom Powder', [G, G], 10]], { stage: 'stage1', power: { name: 'Shift', text: '' } }),
  dodrio: mon('base2-34', 'Dodrio', C, 70, [['Rage', [C, C, C], 10]], { stage: 'stage1', power: { name: 'Retreat Aid', text: '' } }),
  mankey: mon('base2-55', 'Mankey', FI, 30, [['Scratch', [C], 10]], { power: { name: 'Peek', text: '' } }),
  wigglytuff: mon('base2-16', 'Wigglytuff', C, 80, [['Lullaby', [C], 0], ['Do the Wave', [C, C, C], 10]], { stage: 'stage1' }),
  exeggutor: mon('base2-35', 'Exeggutor', G, 80, [['Teleport', [P], 0], ['Big Eggsplosion', [C], 20]], { stage: 'stage1' }),
  gloom: mon('base2-37', 'Gloom', G, 60, [['Poisonpowder', [G], 0], ['Foul Odor', [G, G], 20]], { stage: 'stage1' }),
  marowak: mon('base2-39', 'Marowak', FI, 60, [['Bonemerang', [FI, FI], 30], ['Call for Friend', [FI, FI, C], 0]], { stage: 'stage1' }),
  persian: mon('base2-42', 'Persian', C, 70, [['Scratch', [C, C], 20], ['Pounce', [C, C, C], 30]], { stage: 'stage1' }),
  rhydon: mon('base2-45', 'Rhydon', FI, 100, [['Horn Attack', [FI, C, C], 30], ['Ram', [FI, FI, FI, FI], 50]], { stage: 'stage1' }),
  cubone: mon('base2-50', 'Cubone', FI, 40, [['Snivel', [C], 0], ['Rage', [FI, FI], 10]]),
  eevee: mon('base2-51', 'Eevee', C, 50, [['Tail Wag', [C], 0], ['Quick Attack', [C, C], 10]]),
  nidoranF: mon('base2-57', 'Nidoran♀', G, 60, [['Fury Swipes', [G], 10], ['Call for Family', [G, G], 0]]),
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
  mewtwoP: mon('basep-3', 'Mewtwo', P, 70, [['Energy Absorption', [P], 0], ['Psyburn', [P, P, C], 40]]),
  jigglypuffP: mon('basep-7', 'Jigglypuff', C, 70, [['First Aid', [C], 0], ['Double-Edge', [C, C, C], 40]]),
  electrodeW: mon('pkweb-26', 'Electrode', L, 70, [['Sonicboom', [L, L], 30], ['Energy Spike', [L, L, L], 0]], { stage: 'stage1' }),
  // Team Rocket
  darkAlakazam: mon('base5-1', 'Dark Alakazam', P, 60, [['Teleport Blast', [P, P, C], 30], ['Mind Shock', [P, P, P], 40]], { stage: 'stage2', evolvesFrom: 'Dark Kadabra' }),
  darkArbok: mon('base5-2', 'Dark Arbok', G, 60, [['Stare', [G, G], 0], ['Poison Vapor', [G, G, G], 10]], { stage: 'stage1', evolvesFrom: 'Ekans' }),
  darkCharizard: mon('base5-4', 'Dark Charizard', F, 80, [['Nail Flick', [C], 10], ['Continuous Fireball', [F, F], 50]], { stage: 'stage2', evolvesFrom: 'Dark Charmeleon' }),
  darkDugtrio: mon('base5-6', 'Dark Dugtrio', FI, 50, [['Knock Down', [FI, FI], 20]], { stage: 'stage1', evolvesFrom: 'Diglett', power: { name: 'Sinkhole', text: '' } }),
  darkHypno: mon('base5-9', 'Dark Hypno', P, 60, [['Psypunch', [P], 20], ['Bench Manipulation', [P, P, C], 20]], { stage: 'stage1', evolvesFrom: 'Drowzee' }),
  darkMachamp: mon('base5-10', 'Dark Machamp', FI, 70, [['Mega Punch', [FI, FI], 30], ['Fling', [FI, FI, FI, C], 0]], { stage: 'stage2', evolvesFrom: 'Dark Machoke' }),
  darkMagneton: mon('base5-28', 'Dark Magneton', L, 60, [['Sonicboom', [C, C], 20], ['Magnetic Lines', [L, L], 30]], { stage: 'stage1', evolvesFrom: 'Magnemite' }),
  darkWeezing: mon('base5-14', 'Dark Weezing', G, 60, [['Mass Explosion', [G, C], 20], ['Stun Gas', [G, G, G], 20]], { stage: 'stage1', evolvesFrom: 'Koffing' }),
  koffingR: mon('base5-58', 'Koffing', G, 40, [['Tackle', [C], 10], ['Poison Gas', [G, C], 20]]),
  darkCharmeleon: mon('base5-32', 'Dark Charmeleon', F, 50, [['Tail Slap', [C, C], 20], ['Fireball', [F, F, F], 70]], { stage: 'stage1', evolvesFrom: 'Charmander' }),
  darkElectrode: mon('base5-34', 'Dark Electrode', L, 60, [['Rolling Tackle', [C], 10], ['Energy Bomb', [L, L], 30]], { stage: 'stage1', evolvesFrom: 'Voltorb' }),
  darkGolduck: mon('base5-37', 'Dark Golduck', P, 60, [['Third Eye', [P], 0], ['Super Psy', [P, P, C], 50]], { stage: 'stage1', evolvesFrom: 'Psyduck' }),
  darkMachoke: mon('base5-40', 'Dark Machoke', FI, 60, [['Drag Off', [FI, FI, C], 20], ['Knock Back', [FI, FI, C], 30]], { stage: 'stage1', evolvesFrom: 'Machop' }),
  darkRapidash: mon('base5-44', 'Dark Rapidash', F, 60, [['Rear Kick', [C, C], 20], ['Flame Pillar', [F, F], 30]], { stage: 'stage1', evolvesFrom: 'Ponyta' }),
  darkWartortle: mon('base5-46', 'Dark Wartortle', W, 60, [['Doubleslap', [W], 10], ['Mirror Shell', [W, C], 0]], { stage: 'stage1', evolvesFrom: 'Squirtle' }),
  magikarpR: mon('base5-47', 'Magikarp', W, 30, [['Flop', [C], 10], ['Rapid Evolution', [W, W, W], 0]]),
  gyarados: mon('base1-6', 'Gyarados', W, 100, [['Dragon Rage', [W, W, W], 50]], { stage: 'stage1', evolvesFrom: 'Magikarp' }),
  abraR: mon('base5-49', 'Abra', P, 40, [['Vanish', [P], 0], ['Psyshock', [P], 10]]),
  magnemiteR: mon('base5-60', 'Magnemite', L, 40, [['Tackle', [C, C], 20], ['Magnetism', [L, C], 10]]),
  meowthR: mon('base5-62', 'Meowth', C, 40, [['Coin Hurl', [C, C], 0]]),
  slowpokeR: mon('base5-67', 'Slowpoke', P, 50, [['Afternoon Nap', [C], 0], ['Headbutt', [P], 10]]),
  darkDragonite: mon('base5-5', 'Dark Dragonite', C, 70, [['Giant Tail', [C, C, C, C], 60]], { stage: 'stage2', evolvesFrom: 'Dark Dragonair', power: { name: 'Summon Minions', text: '' } }),
  darkGolbat: mon('base5-7', 'Dark Golbat', G, 50, [['Flitter', [G, G], 0]], { stage: 'stage1', evolvesFrom: 'Zubat', power: { name: 'Sneak Attack', text: '' } }),
  darkGyarados: mon('base5-8', 'Dark Gyarados', W, 70, [['Ice Beam', [W, W, W], 30]], { stage: 'stage1', evolvesFrom: 'Magikarp', power: { name: 'Final Beam', text: '' } }),
  darkSlowbro: mon('base5-12', 'Dark Slowbro', P, 60, [['Fickle Attack', [P, P], 40]], { stage: 'stage1', evolvesFrom: 'Slowpoke', power: { name: 'Reel In', text: '' } }),
  darkVileplume: mon('base5-13', 'Dark Vileplume', G, 60, [['Petal Whirlwind', [G, G, G], 30]], { stage: 'stage2', evolvesFrom: 'Dark Gloom', power: { name: 'Hay Fever', text: '' } }),
  darkDragonair: mon('base5-33', 'Dark Dragonair', C, 60, [['Tail Strike', [C, C, C], 20]], { stage: 'stage1', evolvesFrom: 'Dratini', power: { name: 'Evolutionary Light', text: '' } }),
  darkGloom: mon('base5-36', 'Dark Gloom', G, 50, [['Poisonpowder', [G, G, G], 10]], { stage: 'stage1', evolvesFrom: 'Oddish', power: { name: 'Pollen Stench', text: '' } }),
  darkKadabra: mon('base5-39', 'Dark Kadabra', P, 50, [['Mind Shock', [P, P, C], 30]], { stage: 'stage1', evolvesFrom: 'Abra', power: { name: 'Matter Exchange', text: '' } }),
  darkMuk: mon('base5-41', 'Dark Muk', G, 60, [['Sludge Punch', [G, G], 20]], { stage: 'stage1', evolvesFrom: 'Grimer', power: { name: 'Sticky Goo', text: '' } }),
  darkPrimeape: mon('base5-43', 'Dark Primeape', FI, 60, [['Frenzied Attack', [FI, FI], 40]], { stage: 'stage1', evolvesFrom: 'Mankey', power: { name: 'Frenzy', text: '' } }),
  charmanderR: mon('base5-50', 'Charmander', F, 50, [['Fire Tail', [F, F], 20]], { power: { name: 'Gather Fire', text: '' } }),
  drowzeeR: mon('base5-54', 'Drowzee', P, 50, [['Nightmare', [P, C], 10]], { power: { name: 'Long Distance Hypnosis', text: '' } }),
  rattataR: mon('base5-66', 'Rattata', C, 40, [['Bite', [C], 10]], { power: { name: 'Trickery', text: '' } }),
  // Wizards Black Star Promos
  pikachuP1: mon('basep-1', 'Pikachu', L, 60, [['Growl', [C], 0], ['Thundershock', [L, L], 20]], { weakness: { type: FI, multiplier: 2 } }),
  electabuzzP: mon('basep-2', 'Electabuzz', L, 60, [['Light Screen', [L], 0], ['Quick Attack', [C, C], 10]]),
  pikachuP4: mon('basep-4', 'Pikachu', L, 50, [['Recharge', [L], 0], ['Thunderbolt', [L, L, L], 50]]),
  dragoniteP: mon('basep-5', 'Dragonite', C, 90, [['Supersonic Flight', [C, C, C], 60]], { stage: 'stage2', power: { name: 'Special Delivery', text: '' } }),
  arcanineP: mon('basep-6', 'Arcanine', F, 70, [['Quick Attack', [C, C], 10], ['Flames of Rage', [F, F], 40]], { stage: 'stage1' }),
  mewP: mon('basep-8', 'Mew', P, 50, [['Psywave', [P], 10], ['Devolution Beam', [P, P], 0]]),
  meowthP: mon('basep-10', 'Meowth', C, 50, [['Cat Punch', [C, C], 20]]),
  eeveeP: mon('basep-11', 'Eevee', C, 30, [['Bite', [C], 20]], { power: { name: 'Chain Reaction', text: '' } }),
  jolteon: mon('base2-4', 'Jolteon', L, 70, [['Quick Attack', [C, C], 10]], { stage: 'stage1', evolvesFrom: 'Eevee' }),
  mewtwoP12: mon('basep-12', 'Mewtwo', P, 60, [['Energy Control', [P], 0], ['Telekinesis', [P, P, P], 30]]),
  venusaurP: mon('basep-13', 'Venusaur', G, 100, [['Mega Drain', [G, G, G, G], 40]], { stage: 'stage2', power: { name: 'Solar Power', text: '' } }),
  porygonP: mon('basep-15', 'Cool Porygon', C, 50, [['Texture Magic', [C, C, C], 0], ['3-D Attack', [C, C, C], 20]], { resistance: { type: P, amount: 30 } }),
  computererror: { id: 'basep-16', kind: 'trainer', name: 'Computer Error', imageUrl: null, text: '' },
  darkPersian: mon('basep-17', 'Dark Persian', C, 60, [['Tempt', [C], 0], ['Poison Claws', [C, C], 10]], { stage: 'stage1' }),
  rocketMeowth: mon('basep-18', "Team Rocket's Meowth", C, 40, [['Miraculous Comeback', [C], 10]]),
  sabrinaAbra: mon('basep-19', "Sabrina's Abra", P, 40, [['Pound', [C], 10], ['Synchronize', [P, C], 40]]),
  moltresP: mon('basep-21', 'Moltres', F, 70, [['Hyper Flame', [F, F, F], 60]]),
  zapdosP: mon('basep-23', 'Zapdos', L, 70, [['Lightning Burn', [L, L, L], 30]]),
  birthdayPikachu: mon('basep-24', "___________'s Pikachu", L, 50, [['Birthday Surprise', [L, L], 30]]),
  marill: mon('basep-29', 'Marill', W, 50, [['Water Gun', [W, W], 20]]),
  togepi: mon('basep-30', 'Togepi', C, 30, [['Snivel', [C], 0], ['Mini-Metronome', [C, C], 0]]),
  cleffa: mon('basep-31', 'Cleffa', C, 30, [['Eek', [C], 0]], { baby: true, retreatCost: 0 }),
  smeargle: mon('basep-32', 'Smeargle', C, 40, [['Paint', [C], 0]]),
  entei: mon('basep-34', 'Entei', F, 80, [['Protective Flame', [F, F, F], 50]], { power: { name: 'Bolt', text: '' } }),
  pichu: mon('basep-35', 'Pichu', L, 30, [["Let's Play!", [C], 0]], { baby: true, retreatCost: 0 }),
  hitmontop: mon('basep-37', 'Hitmontop', FI, 60, [['Repeating Kick', [FI, FI], 20], ['Rapid Spin', [FI, FI, C], 30]]),
  unownJ: mon('basep-38', 'Unown [J]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Join]', text: '' } }),
  unownO: mon('neo2-69', 'Unown [O]', P, 40, []),
  unownI: mon('neo2-68', 'Unown [I]', P, 40, []),
  unownN: mon('neo2-50', 'Unown [N]', P, 40, []),
  misdreavus: mon('basep-39', 'Misdreavus', P, 50, [['Pain Split', [P], 0], ['Confuse Ray', [P, P], 10]]),
  pokemoncenterP: { id: 'basep-40', kind: 'trainer', name: 'Pokémon Center', imageUrl: null, text: '' },
  luckystadium: { id: 'basep-41', kind: 'trainer', name: 'Lucky Stadium', imageUrl: null, text: '' },
  pokemontower: { id: 'basep-42', kind: 'trainer', name: 'Pokémon Tower', imageUrl: null, text: '' },
  magmarP: mon('basep-44', 'Magmar', F, 60, [['Burning Fire', [F], 10], ['Magma Punch', [F, F, C], 40]]),
  scytherP: mon('basep-45', 'Scyther', G, 60, [['Slashing Strike', [G, G], 40]]),
  electabuzzL: mon('basep-46', 'Electabuzz', L, 60, [['Lightning Rod', [L], 0], ['Lightning Bolt', [L, L], 10]]),
  mewN: mon('basep-47', 'Mew', P, 40, [['Psyshock', [P], 10]], { power: { name: 'Neutral Shield', text: '' } }),
  articunoA: mon('basep-48', 'Articuno', W, 80, [['Ice Beam', [W, W, C, C], 30]], { power: { name: 'Aurora Veil', text: '' } }),
  snorlaxG: mon('basep-49', 'Snorlax', C, 90, [['Roll Over', [C, C, C, C], 30]], { power: { name: 'Guard', text: '' } }),
  suicune: mon('basep-53', 'Suicune', W, 70, [['Hypno Wave', [W, C, C], 30]], { power: { name: 'Pure Body', text: '' } }),
  superer: { id: 'neo1-89', kind: 'trainer', name: 'Super Energy Retrieval', imageUrl: null, text: '' },
  pokeball: { id: 'base2-64', kind: 'trainer', name: 'Poké Ball', imageUrl: null, text: '' },
  mrfuji: { id: 'base3-58', kind: 'trainer', name: 'Mr. Fuji', imageUrl: null, text: '' },
  energysearch: { id: 'base3-59', kind: 'trainer', name: 'Energy Search', imageUrl: null, text: '' },
  gambler: { id: 'base3-60', kind: 'trainer', name: 'Gambler', imageUrl: null, text: '' },
  recycle: { id: 'base3-61', kind: 'trainer', name: 'Recycle', imageUrl: null, text: '' },
  teamRocket: { id: 'base5-15', kind: 'trainer', name: 'Here Comes Team Rocket!', imageUrl: null, text: '' },
  rocketSneakAttack: { id: 'base5-16', kind: 'trainer', name: "Rocket's Sneak Attack", imageUrl: null, text: '' },
  bossWay: { id: 'base5-73', kind: 'trainer', name: "The Boss's Way", imageUrl: null, text: '' },
  challenge: { id: 'base5-74', kind: 'trainer', name: 'Challenge!', imageUrl: null, text: '' },
  digger: { id: 'base5-75', kind: 'trainer', name: 'Digger', imageUrl: null, text: '' },
  imposterOak: { id: 'base5-76', kind: 'trainer', name: "Imposter Oak's Revenge", imageUrl: null, text: '' },
  garbageRun: { id: 'base5-77', kind: 'trainer', name: 'Nightly Garbage Run', imageUrl: null, text: '' },
  goopGas: { id: 'base5-78', kind: 'trainer', name: 'Goop Gas Attack', imageUrl: null, text: '' },
  sleep: { id: 'base5-79', kind: 'trainer', name: 'Sleep!', imageUrl: null, text: '' },
  rainbow: { id: 'base5-17', kind: 'energy', name: 'Rainbow Energy', imageUrl: null, energyType: 'colorless', anyType: true, basic: false },
  fullHeal: { id: 'base5-81', kind: 'energy', name: 'Full Heal Energy', imageUrl: null, energyType: 'colorless', basic: false },
  potionEnergy: { id: 'base5-82', kind: 'energy', name: 'Potion Energy', imageUrl: null, energyType: 'colorless', basic: false },
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
  // Ash's turn, with nothing in the log yet (not even the turn-order flip).
  return Object.assign(s, { phase: 'playing', turn: 3, currentPlayer: 'ash', log: [] });
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
