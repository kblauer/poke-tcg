// Shared setup for effect tests: Base Set, Jungle and Fossil card fixtures and a ready-to-play duel. Not exported from the package.
import type { CardLibrary, EnergyType, PokemonCardDef } from '../cards.js';
import { applyAction, createGame, type AttackChoices, type GameAction, type GameState, type InPlayPokemon } from '../index.js';
import { nextRandom } from '../rng.js';
import { pendingChoiceView, resolveTrainerChoices, trainerSituation, type TrainerChoices } from '../trainers.js';

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
  charmander: mon('base1-46', 'Charmander', F, 50, [['Scratch', [C], 10], ['Ember', [F, C], 30]], { weakness: { type: W, multiplier: 2 }, length: `2' 0"` }),
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
  machoke: mon('base1-34', 'Machoke', FI, 80, [['Karate Chop', [FI, FI, C], 50], ['Submission', [FI, FI, C, C], 60]], { stage: 'stage1', evolvesFrom: 'Machop' }),
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
  unownO: mon('neo2-69', 'Unown [O]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Observe]', text: '' } }),
  unownI: mon('neo2-68', 'Unown [I]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Increase]', text: '' } }),
  unownN: mon('neo2-50', 'Unown [N]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Normal]', text: '' } }),
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
  // Gym Heroes
  blainesMoltres: mon('gym1-1', "Blaine's Moltres", F, 90, [['Phoenix Flame', [F, F, F, F, F], 90]]),
  erikasClefable: mon('gym1-3', "Erika's Clefable", C, 70, [['Fairy Power', [C], 0], ['Moon Impact', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: "Erika's Clefairy" }),
  erikasDragonair: mon('gym1-4', "Erika's Dragonair", C, 80, [['Blizzard', [C, C, C], 30], ['Take Away', [C, C, C, C], 0]], { stage: 'stage1' }),
  erikasVileplume: mon('gym1-5', "Erika's Vileplume", G, 80, [['Mega Drain', [G, G, G], 30]], { stage: 'stage2', power: { name: 'Pollen Defense', text: '' } }),
  surgesElectabuzz: mon('gym1-6', "Lt. Surge's Electabuzz", L, 70, [['Charge', [L], 0], ['Discharge', [L], 30]]),
  surgesMagneton: mon('gym1-8', "Lt. Surge's Magneton", L, 70, [['Mega Shock', [L, L, L, C], 50]], { stage: 'stage1', power: { name: 'Energy Charge', text: '' } }),
  rocketsMoltres: mon('gym1-12', "Rocket's Moltres", F, 60, [['Fire Wall', [F, F, F], 40]], { power: { name: 'Rebirth', text: '' } }),
  rocketsScyther: mon('gym1-13', "Rocket's Scyther", G, 60, [['Shadow Images', [G], 0], ['Blinding Scythe', [G, C, C], 40]]),
  sabrinasGengar: mon('gym1-14', "Sabrina's Gengar", P, 80, [['Pain Amplifier', [P], 0], ['Call of the Night', [P, P, P], 40]], { stage: 'stage2' }),
  brockOnixR: mon('gym1-21', "Brock's Onix", FI, 70, [['Bind', [FI, FI], 20], ['Tunneling', [FI, FI, FI], 20]]),
  brocksRhyhorn: mon('gym1-22', "Brock's Rhyhorn", FI, 60, [['Horn Toss', [C, C], 20], ['Take Down', [FI, FI, C], 40]]),
  brocksRhydon: mon('gym1-2', "Brock's Rhydon", FI, 80, [['Lariat', [FI, FI, C, C], 70]], { stage: 'stage1', evolvesFrom: "Brock's Rhyhorn", power: { name: 'Bench Guard', text: '' } }),
  victreebelG: mon('gym1-26', "Erika's Victreebel", G, 80, [['Razor Leaf', [G, G, G], 50]], { stage: 'stage2', power: { name: 'Fragrance Trap', text: '' } }),
  mistysCloyster: mon('gym1-29', "Misty's Cloyster", W, 70, [['Triple Cannon', [W, W, C], 20]], { stage: 'stage1', power: { name: 'Shell Armor', text: '' } }),
  mistysTentacool: mon('gym1-32', "Misty's Tentacool", W, 40, [['Mysterious Light', [C], 0], ['Jellyfish Pod', [W, C], 0]]),
  mistysTentacruel: mon('gym1-10', "Misty's Tentacruel", W, 70, [['Jellyfish Poison', [W, W, C, C], 0]], { stage: 'stage1', evolvesFrom: "Misty's Tentacool", power: { name: 'Flee', text: '' } }),
  rocketsHitmonchan: mon('gym1-11', "Rocket's Hitmonchan", FI, 60, [['Crosscounter', [FI], 0], ['Magnum Punch', [FI, FI, C], 50]]),
  rocketsSnorlax: mon('gym1-33', "Rocket's Snorlax", C, 90, [['Collapse', [C, C, C], 20]], { power: { name: 'Restless Sleep', text: '' } }),
  blainesMagmar: mon('gym1-37', "Blaine's Magmar", F, 60, [['Firebreathing', [F], 10], ['Lava Burst', [F, F, F], 0]]),
  erikasDratini: mon('gym1-42', "Erika's Dratini", C, 40, [['Tail Strike', [C, C], 10]], { power: { name: 'Strange Barrier', text: '' } }),
  erikasGloom: mon('gym1-45', "Erika's Gloom", G, 60, [['Healing Pollen', [G], 0], ['Magic Pollen', [G, G, G], 0]], { stage: 'stage1' }),
  erikasOddish: mon('gym1-47', "Erika's Oddish", G, 40, [['Poisonpowder', [G, G], 0]], { power: { name: 'Photosynthesis', text: '' } }),
  mistysTentacoolC: mon('gym1-57', "Misty's Tentacool", W, 50, [['Crystal Beam', [W, C], 20]]),
  blainesVulpix: mon('gym1-65', "Blaine's Vulpix", F, 40, [['Tail Fan', [F, C, C], 20]], { power: { name: 'Natural Healing', text: '' } }),
  brocksGeodude: mon('gym1-66', "Brock's Geodude", FI, 40, [['Call for Friend', [FI], 0], ['Hook Shot', [FI, C], 20]]),
  surgesSpearow: mon('gym1-52', "Lt. Surge's Spearow", C, 30, [['Drill Peck', [C], 20]], { resistance: { type: FI, amount: 30 } }),
  surgesRattata: mon('gym1-82', "Lt. Surge's Rattata", C, 40, [['Focus Energy', [C], 0], ['Gnaw', [C, C], 20]]),
  mistysStaryu: mon('gym1-90', "Misty's Staryu", W, 50, [['Swift', [W, C], 20]]),
  sabrinasDrowzee: mon('gym1-92', "Sabrina's Drowzee", P, 50, [['Suggestion', [P], 0], ['Headbutt', [C, C], 20]]),
  sabrinasMrMime: mon('gym1-94', "Sabrina's Mr. Mime", P, 50, [['Sleight of Hand', [C], 0], ['Slap', [P, C], 20]]),
  brockG: { id: 'gym1-98', kind: 'trainer', name: 'Brock', imageUrl: null, text: '' },
  erikaG: { id: 'gym1-100', kind: 'trainer', name: 'Erika', imageUrl: null, text: '' },
  ltSurge: { id: 'gym1-101', kind: 'trainer', name: 'Lt. Surge', imageUrl: null, text: '' },
  mistyG: { id: 'gym1-102', kind: 'trainer', name: 'Misty', imageUrl: null, text: '' },
  noRemovalGym: { id: 'gym1-103', kind: 'trainer', name: 'No Removal Gym', imageUrl: null, text: '' },
  trainingGym: { id: 'gym1-104', kind: 'trainer', name: "The Rocket's Training Gym", imageUrl: null, text: '' },
  ceruleanGym: { id: 'gym1-108', kind: 'trainer', name: 'Cerulean City Gym', imageUrl: null, text: '' },
  erikasMaids: { id: 'gym1-109', kind: 'trainer', name: "Erika's Maids", imageUrl: null, text: '' },
  erikasPerfume: { id: 'gym1-110', kind: 'trainer', name: "Erika's Perfume", imageUrl: null, text: '' },
  surgesTreaty: { id: 'gym1-112', kind: 'trainer', name: "Lt. Surge's Treaty", imageUrl: null, text: '' },
  minion: { id: 'gym1-113', kind: 'trainer', name: 'Minion of Team Rocket', imageUrl: null, text: '' },
  mistysWrath: { id: 'gym1-114', kind: 'trainer', name: "Misty's Wrath", imageUrl: null, text: '' },
  pewterGym: { id: 'gym1-115', kind: 'trainer', name: 'Pewter City Gym', imageUrl: null, text: '' },
  secretMission: { id: 'gym1-118', kind: 'trainer', name: 'Secret Mission', imageUrl: null, text: '' },
  ticklingMachine: { id: 'gym1-119', kind: 'trainer', name: 'Tickling Machine', imageUrl: null, text: '' },
  energyFlow: { id: 'gym1-122', kind: 'trainer', name: 'Energy Flow', imageUrl: null, text: '' },
  trashExchange: { id: 'gym1-126', kind: 'trainer', name: 'Trash Exchange', imageUrl: null, text: '' },
  blainesQuiz: { id: 'gym1-97', kind: 'trainer', name: "Blaine's Quiz #1", imageUrl: null, text: '' },
  charity: { id: 'gym1-99', kind: 'trainer', name: 'Charity', imageUrl: null, text: '' },
  celadonGym: { id: 'gym1-107', kind: 'trainer', name: 'Celadon City Gym', imageUrl: null, text: '' },
  recall: { id: 'gym1-116', kind: 'trainer', name: 'Recall', imageUrl: null, text: '' },
  sabrinasESP: { id: 'gym1-117', kind: 'trainer', name: "Sabrina's ESP", imageUrl: null, text: '' },
  vermilionGym: { id: 'gym1-120', kind: 'trainer', name: 'Vermilion City Gym', imageUrl: null, text: '' },
  narrowGym: { id: 'gym1-124', kind: 'trainer', name: 'Narrow Gym', imageUrl: null, text: '' },
  // Gym Challenge
  blainesCharizard: mon('gym2-2', "Blaine's Charizard", F, 100, [['Roaring Flames', [F], 20], ['Flame Jet', [F, F], 0]], { stage: 'stage2' }),
  brocksNinetales: mon('gym2-3', "Brock's Ninetales", F, 70, [["Will-o'-the-wisp", [F, F], 30]], { stage: 'stage1', power: { name: 'Shapeshift', text: '' } }),
  giovannisMachamp: mon('gym2-6', "Giovanni's Machamp", FI, 100, [['Hurricane Punch', [FI, FI, FI, C], 30]], { stage: 'stage2', power: { name: 'Fortitude', text: '' } }),
  kogasBeedrill: mon('gym2-9', "Koga's Beedrill", G, 80, [['Nerve Poison', [G, G], 20], ['Hyper Needle', [C, C, C], 70]], { stage: 'stage2' }),
  kogasDitto: mon('gym2-10', "Koga's Ditto", C, 40, [['Giant Growth', [C], 0], ['Pound', [C], 10]]),
  mistysGyarados: mon('gym2-13', "Misty's Gyarados", W, 100, [['Tidal Wave', [W, W, W, W], 70]], { stage: 'stage1', power: { name: 'Rebellion', text: '' } }),
  sabrinasAlakazam: mon('gym2-16', "Sabrina's Alakazam", P, 80, [['Mega Burn', [P, C, C, C], 60]], { stage: 'stage2', power: { name: 'Psylink', text: '' } }),
  brocksDugtrio: mon('gym2-22', "Brock's Dugtrio", FI, 60, [['Lie Low', [FI], 0], ['Earthdrill', [FI, FI, C], 60]], { stage: 'stage1' }),
  kogasMuk: mon('gym2-26', "Koga's Muk", G, 80, [['Sludge Whirlpool', [G, G, C], 40]], { stage: 'stage1', power: { name: 'Energy Drain', text: '' } }),
  brocksPrimeape: mon('gym2-35', "Brock's Primeape", FI, 70, [['Mega Thrash', [FI, FI, FI], 60]], { stage: 'stage1', power: { name: 'Scram', text: '' } }),
  erikasClefairyC: mon('gym2-40', "Erika's Clefairy", C, 50, [['Lunar Power', [C], 0], ['Moon Kick', [C, C], 20]]),
  erikasIvysaur: mon('gym2-41', "Erika's Ivysaur", G, 60, [['Double Razor Leaf', [G, G, G], 40]], { stage: 'stage1', power: { name: 'Relaxing Scent', text: '' } }),
  giovannisMachop: mon('gym2-72', "Giovanni's Machop", FI, 50, [['Chop', [C], 10]]),
  giovannisMachoke: mon('gym2-42', "Giovanni's Machoke", FI, 80, [['Risky Attack', [FI], 60]], { stage: 'stage1', evolvesFrom: "Giovanni's Machop" }),
  surgesElectrode: mon('gym2-52', "Lt. Surge's Electrode", L, 70, [['Power Ball', [L, L, C], 30]], { stage: 'stage1', power: { name: 'Shock Blast', text: '' } }),
  mistysGolduck: mon('gym2-12', "Misty's Golduck", W, 70, [['Electro Beam', [W, C], 40], ['Super Removal', [P, C], 0]], { stage: 'stage1' }),
  kogasZubat: mon('gym2-83', "Koga's Zubat", G, 40, [['Group Attack', [G, C], 10]]),
  kogasKoffing: mon('gym2-79', "Koga's Koffing", G, 40, [['Smelly Gas', [G], 10]]),
  blainesGrowlithe: mon('gym2-62', "Blaine's Growlithe", F, 60, [['Stoke', [F], 0], ['Body Slam', [F, C, C], 20]], { weakness: { type: W, multiplier: 2 } }),
  sabrinasGastly: mon('gym2-97', "Sabrina's Gastly", P, 40, [['Suffocating Gas', [P, P], 30]], { power: { name: 'Gaseous Form', text: '' } }),
  sabrinasAbra: mon('gym2-93', "Sabrina's Abra", P, 40, [['Pound', [C], 10], ['Synchronize', [P, C], 40]]),
  blaine: { id: 'gym2-17', kind: 'trainer', name: "Blaine", imageUrl: null, text: '' },
  giovanni: { id: 'gym2-18', kind: 'trainer', name: "Giovanni", imageUrl: null, text: '' },
  koga: { id: 'gym2-19', kind: 'trainer', name: "Koga", imageUrl: null, text: '' },
  sabrina: { id: 'gym2-20', kind: 'trainer', name: "Sabrina", imageUrl: null, text: '' },
  brocksProtection: { id: 'gym2-101', kind: 'trainer', name: "Brock's Protection", imageUrl: null, text: '' },
  chaosGym: { id: 'gym2-102', kind: 'trainer', name: "Chaos Gym", imageUrl: null, text: '' },
  secretPlan: { id: 'gym2-107', kind: 'trainer', name: "Lt. Surge's Secret Plan", imageUrl: null, text: '' },
  mistysWish: { id: 'gym2-108', kind: 'trainer', name: "Misty's Wish", imageUrl: null, text: '' },
  resistanceGym: { id: 'gym2-109', kind: 'trainer', name: "Resistance Gym", imageUrl: null, text: '' },
  blainesQuiz2: { id: 'gym2-111', kind: 'trainer', name: "Blaine's Quiz #2", imageUrl: null, text: '' },
  blainesQuiz3: { id: 'gym2-112', kind: 'trainer', name: "Blaine's Quiz #3", imageUrl: null, text: '' },
  cinnabarGym: { id: 'gym2-113', kind: 'trainer', name: "Cinnabar City Gym", imageUrl: null, text: '' },
  fuchsiaGym: { id: 'gym2-114', kind: 'trainer', name: "Fuchsia City Gym", imageUrl: null, text: '' },
  ninjaTrick: { id: 'gym2-115', kind: 'trainer', name: "Koga's Ninja Trick", imageUrl: null, text: '' },
  masterBall: { id: 'gym2-116', kind: 'trainer', name: "Master Ball", imageUrl: null, text: '' },
  minefieldGym: { id: 'gym2-119', kind: 'trainer', name: "Rocket's Minefield Gym", imageUrl: null, text: '' },
  psychicControl: { id: 'gym2-121', kind: 'trainer', name: "Sabrina's Psychic Control", imageUrl: null, text: '' },
  saffronGym: { id: 'gym2-122', kind: 'trainer', name: "Saffron City Gym", imageUrl: null, text: '' },
  viridianGym: { id: 'gym2-123', kind: 'trainer', name: "Viridian City Gym", imageUrl: null, text: '' },
  transparentWalls: { id: 'gym2-125', kind: 'trainer', name: "Transparent Walls", imageUrl: null, text: '' },
  warpPoint: { id: 'gym2-126', kind: 'trainer', name: "Warp Point", imageUrl: null, text: '' },
  // Neo Genesis
  bellossom: mon('neo1-3', 'Bellossom', G, 70, [['Sweet Nectar', [G], 0], ['Flower Dance', [G, G, C], 30]], { stage: 'stage2', evolvesFrom: 'Gloom' }),
  feraligatrRiptide: mon('neo1-5', 'Feraligatr', W, 120, [['Riptide', [W, W, W], 10]], { stage: 'stage2', evolvesFrom: 'Croconaw', power: { name: 'Downpour', text: '' } }),
  feraligatrBerserk: mon('neo1-4', 'Feraligatr', W, 100, [['Chomp', [W, W, W, W], 50]], { stage: 'stage2', evolvesFrom: 'Croconaw', power: { name: 'Berserk', text: '' } }),
  heracross: mon('neo1-6', 'Heracross', G, 60, [['Megahorn', [G, G, G], 60]], { power: { name: 'Final Blow', text: '' } }),
  meganiumHerbal: mon('neo1-10', 'Meganium', G, 100, [['Body Slam', [G, G, C, C], 40]], { stage: 'stage2', evolvesFrom: 'Bayleef', power: { name: 'Herbal Scent', text: '' } }),
  meganiumWild: mon('neo1-11', 'Meganium', G, 100, [['Soothing Scent', [G, G, G, G], 40]], { stage: 'stage2', evolvesFrom: 'Bayleef', power: { name: 'Wild Growth', text: '' } }),
  slowking: mon('neo1-14', 'Slowking', P, 80, [['Mind Blast', [P, P, P], 20]], { stage: 'stage1', evolvesFrom: 'Slowpoke', power: { name: 'Mind Games', text: '' } }),
  typhlosionRecharge: mon('neo1-17', 'Typhlosion', F, 100, [['Flame Burst', [F, F, F, F], 60]], { stage: 'stage2', evolvesFrom: 'Quilava', power: { name: 'Fire Recharge', text: '' } }),
  typhlosionBoost: mon('neo1-18', 'Typhlosion', F, 100, [['Flame Wheel', [F, F, F, F], 80]], { stage: 'stage2', evolvesFrom: 'Quilava', power: { name: 'Fire Boost', text: '' } }),
  elekid: mon('neo1-22', 'Elekid', L, 30, [], { baby: true, power: { name: 'Playful Punch', text: '' } }),
  lanturn: mon('neo1-38', 'Lanturn', L, 70, [['Floodlight', [L, L], 20]], { stage: 'stage1', evolvesFrom: 'Chinchou', power: { name: 'Hydroelectric Power', text: '' } }),
  noctowl: mon('neo1-42', 'Noctowl', C, 60, [['Wing Attack', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Hoothoot', power: { name: 'Glaring Gaze', text: '' } }),
  lugia: mon('neo1-9', 'Lugia', C, 90, [['Elemental Blast', [F, W, L], 90]]),
  pichuNeo: mon('neo1-12', 'Pichu', L, 30, [['Zzzap', [C], 0]], { baby: true }),
  togetic: mon('neo1-16', 'Togetic', C, 60, [['Super Metronome', [C], 0], ['Fly', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Togepi' }),
  magby: mon('neo1-23', 'Magby', F, 30, [['Sputter', [C], 10]], { baby: true }),
  murkrow: mon('neo1-24', 'Murkrow', 'darkness', 50, [['Mean Look', ['darkness'], 0], ['Feint Attack', ['darkness', C], 0]]),
  aipom: mon('neo1-26', 'Aipom', C, 40, [['Pilfer', [C], 0], ['Tail Rap', [C], 10]]),
  ariados: mon('neo1-27', 'Ariados', G, 60, [['Spider Web', [G], 0], ['Poison Bite', [G, G, G], 20]], { stage: 'stage1', evolvesFrom: 'Spinarak' }),
  bayleef: mon('neo1-28', 'Bayleef', G, 70, [['Poisonpowder', [G, C], 20], ['Pollen Shield', [G, G, C], 30]], { stage: 'stage1', evolvesFrom: 'Chikorita' }),
  clefairyNeo: mon('neo1-30', 'Clefairy', C, 50, [['Doubleslap', [C, C], 10], ['Squaredance', [C, C, C], 0]]),
  croconaw: mon('neo1-31', 'Croconaw', W, 70, [['Screech', [C], 0], ['Jaw Clamp', [W, W, C], 30]], { stage: 'stage1', evolvesFrom: 'Totodile' }),
  flaaffy: mon('neo1-34', 'Flaaffy', L, 60, [['Discharge', [L], 30], ['Electric Current', [L, L], 20]], { stage: 'stage1', evolvesFrom: 'Mareep' }),
  ledian: mon('neo1-39', 'Ledian', G, 60, [['Baton Pass', [G, G], 30]], { stage: 'stage1', evolvesFrom: 'Ledyba' }),
  phanpy: mon('neo1-43', 'Phanpy', FI, 40, [['Tackle', [C], 10], ['Endure', [FI], 0]]),
  piloswine: mon('neo1-44', 'Piloswine', W, 80, [['Freeze', [W, W], 10], ['Blizzard', [W, W, W], 30]], { stage: 'stage1', evolvesFrom: 'Swinub' }),
  quilava: mon('neo1-47', 'Quilava', F, 70, [['Smokescreen', [F, F], 20], ['Char', [F, F, F], 30]], { stage: 'stage1', evolvesFrom: 'Cyndaquil' }),
  sunkern: mon('neo1-78', 'Sunkern', G, 40, [['Growth', [G], 0], ['Mega Drain', [G, G, G], 30]]),
  horseaNeo: mon('neo1-62', 'Horsea', W, 50, [['Fin Slap', [W, W], 20]]),
  mareep: mon('neo1-65', 'Mareep', L, 40, [['Static Electricity', [L], 0], ['Thundershock', [L, L], 20]]),
  onixNeo: mon('neo1-69', 'Onix', FI, 60, [['Screech', [C], 0], ['Rage', [FI, FI], 10]]),
  // Neo Discovery (Colorless costs where the printed Darkness or Metal would need special Energy)
  houndourFire: mon('neo2-5', 'Houndour', F, 50, [['Smog', [F], 10], ['Collect Fire', [F, F], 20]]),
  magnemiteNeo: mon('neo2-7', 'Magnemite', 'metal', 40, [['Lock-on', [C], 0], ['Electric Bolt', [C, C], 50]]),
  scizor: mon('neo2-10', 'Scizor', 'metal', 80, [['False Swipe', [C], 0], ['Double Claw', [C, C, C], 20]], { stage: 'stage1', evolvesFrom: 'Scyther' }),
  smeargleNeo: mon('neo2-11', 'Smeargle', C, 50, [['Sketch', [C, C], 0]]),
  tyranitar: mon('neo2-12', 'Tyranitar', 'darkness', 100, [['Slam', [C, C, C], 30], ['Trample', [C, C, C, C], 50]], { stage: 'stage2', evolvesFrom: 'Pupitar' }),
  umbreonFeint: mon('neo2-13', 'Umbreon', 'darkness', 80, [['Bite', [C, C], 20], ['Feint Attack', [C, C, C], 0]], { stage: 'stage1', evolvesFrom: 'Eevee' }),
  wobbuffet: mon('neo2-16', 'Wobbuffet', P, 90, [['Counter', [P], 0]]),
  yanma: mon('neo2-17', 'Yanma', G, 60, [['Shockwave', [G], 0], ['Swift', [G, G, G], 30]]),
  beedrillNeo: mon('neo2-18', 'Beedrill', G, 80, [['Triple Poison', [G], 10], ['Pin Missile', [G, G, C], 20]], { stage: 'stage2', evolvesFrom: 'Kakuna' }),
  butterfreeNeo: mon('neo2-19', 'Butterfree', G, 80, [['Magic Dust', [G, C], 20], ['Hyper Reverse', [G, G, C], 0]], { stage: 'stage2', evolvesFrom: 'Metapod' }),
  umbreonPursuit: mon('neo2-32', 'Umbreon', 'darkness', 70, [['Quick Attack', [C, C], 10], ['Pursuit', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Eevee' }),
  houndourDark: mon('neo2-39', 'Houndour', 'darkness', 40, [['Bite', [C], 10], ['Plunder', [C, C], 20]]),
  kakuna: mon('neo2-41', 'Kakuna', G, 70, [['Secrete Poison', [G, G], 0]], { stage: 'stage1', evolvesFrom: 'Weedle' }),
  metapod: mon('neo2-42', 'Metapod', G, 70, [['Harden', [C, C], 0], ['Hatch', [G, G], 0]], { stage: 'stage1', evolvesFrom: 'Caterpie' }),
  poliwhirl: mon('neo2-44', 'Poliwhirl', W, 70, [['Belly Drum', [C], 0], ['Water Gun', [W, W, C], 30]], { stage: 'stage1', evolvesFrom: 'Poliwag' }),
  pupitar: mon('neo2-45', 'Pupitar', FI, 70, [['Skull Bash', [C, C], 20], ['Dust Devil', [FI, FI], 0]], { stage: 'stage1', evolvesFrom: 'Larvitar' }),
  scytherNeo: mon('neo2-46', 'Scyther', G, 60, [['Fury Cutter', [G, G], 10]]),
  xatuNeo: mon('neo2-52', 'Xatu', P, 70, [['Energy Cycle', [P], 10], ['Super Psy', [P, P, C], 50]], { stage: 'stage1', evolvesFrom: 'Natu' }),
  pineco: mon('neo2-61', 'Pineco', G, 40, [['Burst', [G], 40]]),
  sentret: mon('neo2-63', 'Sentret', C, 50, [['Scout', [C], 0], ['Tackle', [C, C], 20]]),
  wooper: mon('neo2-71', 'Wooper', W, 50, [['Slime', [W], 0], ['Tail Slap', [C, C], 20]]),
  forretress: mon('neo2-2', 'Forretress', 'metal', 80, [['Rapid Spin', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Pineco', power: { name: 'Spikes', text: '' } }),
  politoed: mon('neo2-8', 'Politoed', W, 100, [['Doubleslap', [C, C], 40]], { stage: 'stage2', evolvesFrom: 'Poliwhirl', power: { name: 'Frog Song', text: '' } }),
  poliwagNeo: mon('neo2-62', 'Poliwag', W, 40, [['Rollout', [C], 10], ['Hypnosis', [W], 0]]),
  unownA: mon('neo2-14', 'Unown [A]', P, 40, [['Hidden Power', [P], 10]], { power: { name: 'Anger', text: '' } }),
  unownD: mon('neo2-47', 'Unown [D]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Darkness]', text: '' } }),
  unownF: mon('neo2-48', 'Unown [F]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Find]', text: '' } }),
  unownU: mon('neo2-51', 'Unown [U]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Undo]', text: '' } }),
  unownE: mon('neo2-67', 'Unown [E]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Engage]', text: '' } }),
  eeveeNeo: mon('neo2-38', 'Eevee', C, 50, [['Smash Kick', [C], 10]], { power: { name: 'Energy Evolution', text: '' } }),
  espeonNeo: mon('neo2-20', 'Espeon', P, 70, [['Quick Attack', [C, C], 10], ['Psybeam', [P, P, C], 30]], { stage: 'stage1', evolvesFrom: 'Eevee' }),
  igglybuff: mon('neo2-40', 'Igglybuff', C, 30, [], { baby: true, power: { name: 'Gaze', text: '' } }),
  kabutoNeo: mon('neo2-56', 'Kabuto', W, 50, [['Work Together', [FI, C], 10]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil', power: { name: 'Revive Friends', text: '' } }),
  fossilEgg: { id: 'neo2-72', kind: 'trainer', name: 'Fossil Egg', imageUrl: null, text: '' },
  hyperDevolutionSpray: { id: 'neo2-73', kind: 'trainer', name: 'Hyper Devolution Spray', imageUrl: null, text: '' },
  ruinWall: { id: 'neo2-74', kind: 'trainer', name: 'Ruin Wall', imageUrl: null, text: '' },
  energyArk: { id: 'neo2-75', kind: 'trainer', name: 'Energy Ark', imageUrl: null, text: '' },
  omanyteNeo: mon('neo2-60', 'Omanyte', FI, 50, [['Bind', [W], 10]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil', power: { name: 'Fossil', text: '' } }),
  hoppip: mon('neo2-55', 'Hoppip', G, 40, [['Rolling Tackle', [G], 20]]),
  chansey: mon('base1-3', 'Chansey', C, 120, [['Scrunch', [C, C], 0], ['Double-edge', [C, C, C, C], 80]]),
  // Southern Islands
  mewSI: mon('si1-1', 'Mew', P, 30, [['Rainbow Wave', [P], 0]]),
  ivysaurSI: mon('si1-5', 'Ivysaur', G, 60, [['Strange Scent', [G], 0], ['Razor Leaf', [G, G], 30]], { stage: 'stage1', evolvesFrom: 'Bulbasaur' }),
  marillSI: mon('si1-11', 'Marill', W, 40, [['Squirt', [W], 0], ['Rolling Tackle', [C, C], 20]]),
  tentacruelSI: mon('si1-10', 'Tentacruel', W, 60, [['Tentacle Grip', [W], 0], ['Poison Sting', [W, W], 20]], { stage: 'stage1', evolvesFrom: 'Tentacool' }),
  laprasSI: mon('si1-12', 'Lapras', W, 70, [['Gentle Song', [C], 0], ['Ice Beam', [W, W], 20]]),
  lickitungSI: mon('si1-16', 'Lickitung', C, 70, [['Lick Wounds', [C], 0], ['Tongue Stretch', [C, C], 0]]),
  vileplumeSI: mon('si1-17', 'Vileplume', G, 70, [['Paradise Pollen', [G], 0], ['Horrid Pollen', [G, G, C], 30]], { stage: 'stage2', evolvesFrom: 'Gloom' }),
  primeapeSI: mon('si1-18', 'Primeape', FI, 60, [['Low Kick', [FI], 20], ['Rampage', [FI, FI], 20]], { stage: 'stage1', evolvesFrom: 'Mankey' }),
  // Neo Revelation (Colorless costs where the printed Darkness or Metal would need special Energy)
  ampharos: mon('neo3-1', 'Ampharos', L, 90, [['Attract Current', [L], 20], ['Gigavolt', [L, L, L, C], 40]], { stage: 'stage2', evolvesFrom: 'Flaaffy' }),
  blissey: mon('neo3-2', 'Blissey', C, 120, [['Body Slam', [C, C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Chansey', power: { name: 'Softboiled', text: '' } }),
  celebiTime: mon('neo3-3', 'Celebi', P, 50, [['Psychic Damage', [P], 0]], { power: { name: 'Time Travel', text: '' } }),
  crobat: mon('neo3-4', 'Crobat', G, 90, [['Triggered Poison', [G], 20], ['Cross Attack', [G, G, C], 20]], { stage: 'stage2', evolvesFrom: 'Golbat' }),
  delibird: mon('neo3-5', 'Delibird', C, 60, [['Present', [C, C], 0]]),
  enteiHowl: mon('neo3-6', 'Entei', F, 80, [['Searing Flames', [F, F, F], 60]], { power: { name: 'Howl', text: '' } }),
  houndoomNeo3: mon('neo3-8', 'Houndoom', 'darkness', 70, [['Dark Flame', [F], 20], ['Black Fang', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Houndour' }),
  jumpluff: mon('neo3-9', 'Jumpluff', G, 70, [['Evolutionary Spore', [G], 0], ['Solarbeam', [G], 30]], { stage: 'stage2', evolvesFrom: 'Skiploom' }),
  magnetonNeo3: mon('neo3-10', 'Magneton', 'metal', 80, [['Plasma', [L, L, C], 30]], { stage: 'stage1', evolvesFrom: 'Magnemite', power: { name: 'Electromagnetic Power', text: '' } }),
  misdreavusNeo3: mon('neo3-11', 'Misdreavus', P, 50, [['Night Eyes', [P], 0], ['Perish Song', [P, P, P], 0]]),
  porygon2: mon('neo3-12', 'Porygon2', C, 70, [['Delta Beam', [C, C, C], 20]], { stage: 'stage1', evolvesFrom: 'Porygon', power: { name: 'Energy Converter', text: '' } }),
  raikouBurst: mon('neo3-13', 'Raikou', L, 80, [['Lightning Tackle', [L, L, L], 50]], { power: { name: 'Lightning Burst', text: '' } }),
  suicuneCrystal: mon('neo3-14', 'Suicune', W, 70, [['Aurora Wave', [W, W, W], 30]], { power: { name: 'Crystal Body', text: '' } }),
  aerodactylNeo3: mon('neo3-15', 'Aerodactyl', FI, 60, [['Fly', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Mysterious Fossil', power: { name: 'Prehistoric Memory', text: '' } }),
  celebiLeaf: mon('neo3-16', 'Celebi', G, 50, [['Psychic Leaf', [G, G], 10]]),
  enteiFlame: mon('neo3-17', 'Entei', F, 60, [['Mega Flame', [F, F, F], 50]], { power: { name: 'Legendary Body', text: '' } }),
  hoohRainbow: mon('neo3-18', 'Ho-oh', C, 90, [['Rainbow Burn', [C, C, C, C], 30]]),
  kingdra: mon('neo3-19', 'Kingdra', W, 90, [['Genetic Memory', [C], 0], ['Twister', [W, W, C, C], 50]], { stage: 'stage2', evolvesFrom: 'Seadra' }),
  lugiaNeo3: mon('neo3-20', 'Lugia', P, 90, [['Aerowing', [C, C, C, C], 40]]),
  raichuNeo3: mon('neo3-21', 'Raichu', L, 80, [['Thundershock', [L, C], 20], ['Lightning Strike', [L, L, L], 40]], { stage: 'stage1', evolvesFrom: 'Pikachu' }),
  sneasel: mon('neo3-24', 'Sneasel', 'darkness', 60, [['Swipe', [C], 0], ['Quick Attack', [C, C], 10]]),
  starmieNeo3: mon('neo3-25', 'Starmie', P, 70, [['Confuse Ray', [W], 10], ['Core Stream', [P, P, C], 0]], { stage: 'stage1', evolvesFrom: 'Staryu' }),
  sudowoodo: mon('neo3-26', 'Sudowoodo', FI, 60, [['Slam', [C, C], 20]], { power: { name: 'Mimic', text: '' } }),
  lanturnNeo3: mon('neo3-32', 'Lanturn', L, 80, [['Blinding Light', [L, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Chinchou', power: { name: 'Submerge', text: '' } }),
  magcargo: mon('neo3-33', 'Magcargo', F, 80, [['Lava Flow', [F, F, F], 40]], { stage: 'stage1', evolvesFrom: 'Slugma', power: { name: 'Magma Pool', text: '' } }),
  parasect: mon('neo3-35', 'Parasect', G, 60, [['Sleep Pinchers', [G, G], 30]], { stage: 'stage1', evolvesFrom: 'Paras', power: { name: 'Allergic Pollen', text: '' } }),
  piloswineNeo3: mon('neo3-36', 'Piloswine', FI, 90, [['Nap', [C, C], 0], ['High-Speed Charge', [FI, FI, C, C], 80]], { stage: 'stage1', evolvesFrom: 'Swinub' }),
  stantler: mon('neo3-38', 'Stantler', C, 60, [['Terrorize', [C], 0], ['Overhead Toss', [C, C, C], 30]]),
  unownB: mon('neo3-39', 'Unown [B]', P, 50, [['Hidden Power', [P], 10]], { power: { name: '[Bear]', text: '' } }),
  unownY: mon('neo3-40', 'Unown [Y]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Yield]', text: '' } }),
  aipomNeo3: mon('neo3-41', 'Aipom', C, 40, [['Grab', [C], 0], ['Tail Punch', [C, C], 20]]),
  chinchou: mon('neo3-42', 'Chinchou', L, 50, [['Positive Ion', [L], 10], ['Negative Ion', [W], 10]]),
  farfetchdNeo3: mon('neo3-43', "Farfetch'd", C, 50, [['Gust', [C], 10], ['Leek Jab', [C, C, C], 40]]),
  murkrowNeo3: mon('neo3-46', 'Murkrow', 'darkness', 40, [['Call for Family', [C], 0], ['Flock Attack', [C, C], 10]]),
  shuckle: mon('neo3-51', 'Shuckle', FI, 40, [['Toxic Saliva', [G, G], 0]], { power: { name: 'Hard Shell', text: '' } }),
  skiploom: mon('neo3-52', 'Skiploom', G, 60, [['Hop', [C], 20]], { stage: 'stage1', evolvesFrom: 'Hoppip' }),
  smoochum: mon('neo3-54', 'Smoochum', P, 30, [['Psykiss', [C], 0]], { baby: true, retreatCost: 0 }),
  unownK: mon('neo3-58', 'Unown [K]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Keep]', text: '' } }),
  shiningGyarados: mon('neo3-65', 'Shining Gyarados', W, 100, [['Outrage', [W, FI, FI], 30], ['Devastate', [W, W, F, F], 50]]),
  shiningMagikarp: mon('neo3-66', 'Shining Magikarp', W, 30, [['Gold Scale', [W], 0], ['Dragon Bond', [P], 0]]),
  // Neo Destiny (Colorless costs where the printed Darkness or Metal would need special Energy)
  darkAmpharos: mon('neo4-1', 'Dark Ampharos', L, 70, [['Shock Bolt', [L, C, C], 50]], { stage: 'stage2', evolvesFrom: 'Dark Flaaffy', power: { name: 'Conductivity', text: '' } }),
  darkCrobat: mon('neo4-2', 'Dark Crobat', G, 70, [['Dark Drain', [G, G], 0]], { stage: 'stage2', evolvesFrom: 'Dark Golbat', power: { name: 'Surprise Bite', text: '' }, retreatCost: 0 }),
  darkDonphan: mon('neo4-3', 'Dark Donphan', FI, 60, [['Tusk Toss', [FI, FI], 0], ['Giant Tusk', [FI, FI, C], 50]], { stage: 'stage1', evolvesFrom: 'Phanpy' }),
  darkFeraligatr: mon('neo4-5', 'Dark Feraligatr', W, 80, [['Crushing Blow', [W, W, W], 50]], { stage: 'stage2', evolvesFrom: 'Dark Croconaw', power: { name: 'Scare', text: '' } }),
  darkGengar: mon('neo4-6', 'Dark Gengar', P, 70, [['Pull In', [P, P, P], 30]], { stage: 'stage2', evolvesFrom: 'Dark Haunter', power: { name: 'Deep Sleep', text: '' } }),
  darkHoundoom: mon('neo4-7', 'Dark Houndoom', F, 60, [['Eerie Howl', [C], 0], ['Dark Fire', [F, C], 30]], { stage: 'stage1', evolvesFrom: 'Houndour' }),
  darkPorygon2: mon('neo4-8', 'Dark Porygon2', C, 60, [['Curve Attack', [C, C, C], 20]], { stage: 'stage1', evolvesFrom: 'Porygon', power: { name: 'Spatial Distortion', text: '' } }),
  darkTyphlosion: mon('neo4-10', 'Dark Typhlosion', F, 80, [['Claw Swipe', [C], 20], ['Rushing Flames', [F], 40]], { stage: 'stage2', evolvesFrom: 'Dark Quilava' }),
  darkTyranitar: mon('neo4-11', 'Dark Tyranitar', FI, 90, [['Mountain Smasher', [FI], 20], ['Fling Away', [FI, FI, FI, C], 50]], { stage: 'stage2', evolvesFrom: 'Dark Pupitar' }),
  lightArcanine: mon('neo4-12', 'Light Arcanine', F, 100, [['Gentle Flames', [F, F, C], 50]], { stage: 'stage1', evolvesFrom: 'Growlithe', power: { name: 'Drive Off', text: '' } }),
  lightAzumarill: mon('neo4-13', 'Light Azumarill', W, 80, [['Bubble', [W], 10], ['Bubble Jump', [W, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Marill' }),
  lightDragonite: mon('neo4-14', 'Light Dragonite', C, 100, [['Light Wave', [C, C, C], 40]], { stage: 'stage2', evolvesFrom: 'Light Dragonair', power: { name: 'Miraculous Wind', text: '' } }),
  lightTogetic: mon('neo4-15', 'Light Togetic', C, 60, [['Sweet Kiss', [C, C], 30]], { stage: 'stage1', evolvesFrom: 'Togepi', power: { name: 'Gift', text: '' } }),
  miracleEnergy: { id: 'neo4-16', kind: 'energy', name: 'Miracle Energy', imageUrl: null, energyType: 'colorless', anyType: true, amount: 2, basic: false },
  darkAriados: mon('neo4-17', 'Dark Ariados', G, 60, [['Entangle', [G], 0], ['Poison Bind', [G, G, G], 30]], { stage: 'stage1', evolvesFrom: 'Spinarak' }),
  darkMagcargo: mon('neo4-18', 'Dark Magcargo', F, 60, [['Ball of Flame', [F, F], 20]], { stage: 'stage1', evolvesFrom: 'Slugma', power: { name: 'Hot Plate', text: '' } }),
  darkOmastar: mon('neo4-19', 'Dark Omastar', W, 70, [['Prehistoric Water', [W], 0], ['Dark Tentacle', [W, C], 30]], { stage: 'stage2', evolvesFrom: 'Dark Omanyte' }),
  darkSlowking: mon('neo4-20', 'Dark Slowking', P, 60, [['Mind Shock', [P, P], 30]], { stage: 'stage1', evolvesFrom: 'Slowpoke', power: { name: 'Cunning', text: '' } }),
  darkUrsaring: mon('neo4-21', 'Dark Ursaring', C, 60, [['Provoke', [C], 0], ['Battle Frenzy', [C, C], 0]], { stage: 'stage1', evolvesFrom: 'Teddiursa' }),
  lightLedian: mon('neo4-24', 'Light Ledian', G, 70, [['Flash Touch', [G], 0], ['Comet Punch', [G, C, C], 20]], { stage: 'stage1', evolvesFrom: 'Ledyba', retreatCost: 0 }),
  lightMachamp: mon('neo4-25', 'Light Machamp', FI, 100, [['Beatdown', [FI, FI, FI], 50]], { stage: 'stage2', evolvesFrom: 'Light Machoke', power: { name: 'Tag Team', text: '' } }),
  lightMachoke: mon('neo4-49', 'Light Machoke', FI, 80, [['Return Home', [FI], 0], ['Gentle Kick', [FI, FI], 40]], { stage: 'stage1', evolvesFrom: 'Machop' }),
  lightPiloswine: mon('neo4-26', 'Light Piloswine', W, 90, [['Knock Over', [C, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Swinub', power: { name: 'Fluffy Wool', text: '' } }),
  unownG: mon('neo4-27', 'Unown [G]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Give]', text: '' } }),
  unownH: mon('neo4-28', 'Unown [H]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Help]', text: '' } }),
  unownX: mon('neo4-30', 'Unown [X]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[XXXXX]', text: '' } }),
  darkCroconaw: mon('neo4-32', 'Dark Croconaw', W, 60, [['Clamping Jaw', [W, W], 20]], { stage: 'stage1', evolvesFrom: 'Totodile' }),
  darkFlaaffy: mon('neo4-34', 'Dark Flaaffy', L, 60, [['High Voltage', [L], 10], ['Stun Wave', [L, C], 30]], { stage: 'stage1', evolvesFrom: 'Mareep' }),
  darkForretress: mon('neo4-35', 'Dark Forretress', G, 60, [['Armor Up', [C], 0], ['Explosion', [G, G], 60]], { stage: 'stage1', evolvesFrom: 'Pineco' }),
  darkHaunter: mon('neo4-36', 'Dark Haunter', P, 50, [['Call Back', [P], 0], ['Surround', [P, P], 20]], { stage: 'stage1', evolvesFrom: 'Gastly', retreatCost: 0 }),
  darkPupitar: mon('neo4-38', 'Dark Pupitar', FI, 60, [['Rock Tackle', [FI, FI], 40], ['Explosive Evolution', [C, C, C], 0]], { stage: 'stage1', evolvesFrom: 'Larvitar' }),
  darkQuilava: mon('neo4-39', 'Dark Quilava', F, 60, [['Incinerate', [F], 0], ['Rushing Magma', [F, F], 20]], { stage: 'stage1', evolvesFrom: 'Cyndaquil' }),
  darkWigglytuff: mon('neo4-40', 'Dark Wigglytuff', C, 60, [['Dark Song', [C, C], 0], ['Slap Awake', [C, C, C], 20]], { stage: 'stage1', evolvesFrom: 'Jigglypuff' }),
  lightDewgong: mon('neo4-45', 'Light Dewgong', W, 80, [['Freezing Breath', [W, W], 10], ['Ice Pillar', [W, W, W], 40]], { stage: 'stage1', evolvesFrom: 'Seel' }),
  lightFlareon: mon('neo4-46', 'Light Flareon', F, 80, [['Warm Up', [F], 0], ['Burning Flame', [F, F, C], 30]], { stage: 'stage1', evolvesFrom: 'Eevee' }),
  lightGolduck: mon('neo4-47', 'Light Golduck', W, 80, [['Flipper Stroke', [W], 0], ['Core Blast', [P, C, C], 30]], { stage: 'stage1', evolvesFrom: 'Psyduck' }),
  lightJolteon: mon('neo4-48', 'Light Jolteon', L, 70, [['Pulse Guard', [L], 0], ['Thunder Needle', [L, L, C], 20]], { stage: 'stage1', evolvesFrom: 'Eevee', retreatCost: 0 }),
  lightSlowbro: mon('neo4-51', 'Light Slowbro', P, 80, [['Fish Out', [P], 0], ['Slash About', [W, C], 20]], { stage: 'stage1', evolvesFrom: 'Slowpoke' }),
  lightWigglytuff: mon('neo4-54', 'Light Wigglytuff', C, 80, [['Evolution Song', [C], 0], ['Body Slam', [C, C, C], 20]], { stage: 'stage1', evolvesFrom: 'Jigglypuff' }),
  togepiNeo4: mon('neo4-56', 'Togepi', C, 40, [['Charm', [C], 0], ['Spike Ball Tackle', [C, C], 20]]),
  unownC: mon('neo4-57', 'Unown [C]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Chase]', text: '' } }),
  unownP: mon('neo4-58', 'Unown [P]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Perform]', text: '' } }),
  unownQ: mon('neo4-59', 'Unown [Q]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Quicken]', text: '' } }),
  unownZ: mon('neo4-60', 'Unown [Z]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Zoom]', text: '' } }),
  darkOctillery: mon('neo4-62', 'Dark Octillery', W, 60, [['Ink Blast', [W], 20], ['Tentacle Wrap', [W, C], 20]], { stage: 'stage1', evolvesFrom: 'Remoraid' }),
  hitmonchanNeo4: mon('neo4-69', 'Hitmonchan', FI, 60, [['Dodge', [FI], 0], ['Supersonic Jab', [FI, FI, FI], 40]]),
  lightSunflora: mon('neo4-72', 'Light Sunflora', G, 80, [['Reflected Sunlight', [C, C], 0], ['Solarbeam', [G, G, G], 40]], { stage: 'stage1', evolvesFrom: 'Sunkern' }),
  mantine: mon('neo4-74', 'Mantine', W, 60, [['Giant Wave', [W, W], 40]]),
  unownL: mon('neo4-86', 'Unown [L]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Laugh]', text: '' } }),
  unownS: mon('neo4-87', 'Unown [S]', P, 40, [['Hidden Power', [P, C], 20]], { power: { name: '[Search]', text: '' } }),
  unownT: mon('neo4-88', 'Unown [T]', P, 40, [['Hidden Power', [P, C], 20]], { power: { name: '[Tell]', text: '' } }),
  unownV: mon('neo4-89', 'Unown [V]', P, 40, [['Hidden Power', [P], 10]], { power: { name: '[Vanish]', text: '' } }),
  shiningCharizard: mon('neo4-107', 'Shining Charizard', F, 100, [['White-Hot Flame', [F, F, F, L, L], 100]], { retreatCost: 3 }),
  shiningMewtwo: mon('neo4-109', 'Shining Mewtwo', P, 70, [['Reflect Shield', [P, L], 0], ['Psyburst', [P, P, F], 40]]),
  shiningSteelix: mon('neo4-112', 'Shining Steelix', 'metal', 90, [['Crushing Earth', [C, C, FI, FI], 80]]),
  shiningTyranitar: mon('neo4-113', 'Shining Tyranitar', 'darkness', 80, [['Mountain Crush', [C, FI, FI], 30], ['Destructive Fire', [C, F, F, F], 50]]),
  brokenGroundGym: { id: 'neo4-92', kind: 'trainer', name: 'Broken Ground Gym', imageUrl: null, text: '' },
  expAll: { id: 'neo4-93', kind: 'trainer', name: 'EXP.ALL', imageUrl: null, text: '' },
  invention: { id: 'neo4-94', kind: 'trainer', name: "Impostor Professor Oak's Invention", imageUrl: null, text: '' },
  radioTower: { id: 'neo4-95', kind: 'trainer', name: 'Radio Tower', imageUrl: null, text: '' },
  thoughtWave: { id: 'neo4-96', kind: 'trainer', name: 'Thought Wave Machine', imageUrl: null, text: '' },
  counterClaws: { id: 'neo4-97', kind: 'trainer', name: 'Counterattack Claws', imageUrl: null, text: '' },
  energyAmplifier: { id: 'neo4-98', kind: 'trainer', name: 'Energy Amplifier', imageUrl: null, text: '' },
  energyStadium: { id: 'neo4-99', kind: 'trainer', name: 'Energy Stadium', imageUrl: null, text: '' },
  magnifier: { id: 'neo4-101', kind: 'trainer', name: 'Magnifier', imageUrl: null, text: '' },
  personalityTest: { id: 'neo4-102', kind: 'trainer', name: 'Pokémon Personality Test', imageUrl: null, text: '' },
  evilDeeds: { id: 'neo4-103', kind: 'trainer', name: "Team Rocket's Evil Deeds", imageUrl: null, text: '' },
  healPowder: { id: 'neo4-104', kind: 'trainer', name: 'Heal Powder', imageUrl: null, text: '' },
  mailFromBill: { id: 'neo4-105', kind: 'trainer', name: 'Mail from Bill', imageUrl: null, text: '' },
  balloonBerry: { id: 'neo3-60', kind: 'trainer', name: 'Balloon Berry', imageUrl: null, text: '' },
  healingField: { id: 'neo3-61', kind: 'trainer', name: 'Healing Field', imageUrl: null, text: '' },
  breederFields: { id: 'neo3-62', kind: 'trainer', name: 'Pokémon Breeder Fields', imageUrl: null, text: '' },
  rocketsHideout: { id: 'neo3-63', kind: 'trainer', name: "Rocket's Hideout", imageUrl: null, text: '' },
  oldRod: { id: 'neo3-64', kind: 'trainer', name: 'Old Rod', imageUrl: null, text: '' },
  darkness: { id: 'neo1-104', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness', basic: false },
  metal: { id: 'neo1-19', kind: 'energy', name: 'Metal Energy', imageUrl: null, energyType: 'metal', basic: false },
  recycleEnergy: { id: 'neo1-105', kind: 'energy', name: 'Recycle Energy', imageUrl: null, energyType: 'colorless', basic: false },
  arcadeGame: { id: 'neo1-83', kind: 'trainer', name: "Arcade Game", imageUrl: null, text: '' },
  ecogym: { id: 'neo1-84', kind: 'trainer', name: "Ecogym", imageUrl: null, text: '' },
  energyCharge: { id: 'neo1-85', kind: 'trainer', name: "Energy Charge", imageUrl: null, text: '' },
  focusBand: { id: 'neo1-86', kind: 'trainer', name: "Focus Band", imageUrl: null, text: '' },
  mary: { id: 'neo1-87', kind: 'trainer', name: "Mary", imageUrl: null, text: '' },
  pokeGear: { id: 'neo1-88', kind: 'trainer', name: "PokéGear", imageUrl: null, text: '' },
  timeCapsule: { id: 'neo1-90', kind: 'trainer', name: "Time Capsule", imageUrl: null, text: '' },
  billsTeleporter: { id: 'neo1-91', kind: 'trainer', name: "Bill's Teleporter", imageUrl: null, text: '' },
  cardFlipGame: { id: 'neo1-92', kind: 'trainer', name: "Card-Flip Game", imageUrl: null, text: '' },
  goldBerry: { id: 'neo1-93', kind: 'trainer', name: "Gold Berry", imageUrl: null, text: '' },
  miracleBerry: { id: 'neo1-94', kind: 'trainer', name: "Miracle Berry", imageUrl: null, text: '' },
  newPokedex: { id: 'neo1-95', kind: 'trainer', name: "New Pokédex", imageUrl: null, text: '' },
  professorElm: { id: 'neo1-96', kind: 'trainer', name: "Professor Elm", imageUrl: null, text: '' },
  sproutTower: { id: 'neo1-97', kind: 'trainer', name: "Sprout Tower", imageUrl: null, text: '' },
  superScoopUp: { id: 'neo1-98', kind: 'trainer', name: "Super Scoop Up", imageUrl: null, text: '' },
  berry: { id: 'neo1-99', kind: 'trainer', name: "Berry", imageUrl: null, text: '' },
  doubleGust: { id: 'neo1-100', kind: 'trainer', name: "Double Gust", imageUrl: null, text: '' },
  mooMooMilk: { id: 'neo1-101', kind: 'trainer', name: "Moo-Moo Milk", imageUrl: null, text: '' },
  pokemonMarch: { id: 'neo1-102', kind: 'trainer', name: "Pokémon March", imageUrl: null, text: '' },
  superRod: { id: 'neo1-103', kind: 'trainer', name: "Super Rod", imageUrl: null, text: '' },
  fire: { id: 'fire', kind: 'energy', name: 'Fire Energy', imageUrl: null, energyType: 'fire' },
  water: { id: 'water', kind: 'energy', name: 'Water Energy', imageUrl: null, energyType: 'water' },
  psychic: { id: 'psychic', kind: 'energy', name: 'Psychic Energy', imageUrl: null, energyType: 'psychic' },
  lightning: { id: 'lightning', kind: 'energy', name: 'Lightning Energy', imageUrl: null, energyType: 'lightning' },
  fighting: { id: 'fighting', kind: 'energy', name: 'Fighting Energy', imageUrl: null, energyType: 'fighting' },
  grass: { id: 'grass', kind: 'energy', name: 'Grass Energy', imageUrl: null, energyType: 'grass' },
  dce: { id: 'base1-96', kind: 'energy', name: 'Double Colorless Energy', imageUrl: null, energyType: 'colorless', amount: 2, basic: false },
  // The Black & White series' shared rules (bw-shared.test.ts): a Pokémon-EX, a Restored Pokémon and its Fossil, Dragons.
  mewtwoEX: mon('bw4-54', 'Mewtwo-EX', P, 170, [['X Ball', [C, C], 20]], { pokemonEX: true, weakness: { type: P, multiplier: 2 } }),
  archen: mon('bw3-66', 'Archen', FI, 70, [['Rock Smash', [C, C], 20]], { restored: true }),
  archenPlasma: mon('bw10-53', 'Archen', FI, 70, [['Rock Smash', [C, C], 20]], { restored: true }),
  plumeFossil: { id: 'bw3-93', kind: 'trainer', name: 'Plume Fossil', imageUrl: null, text: '' },
  axew: mon('bw6-87', 'Axew', 'dragon', 60, [['Scratch', [C], 10], ['Dragon Rage', [C, C], 40]], { weakness: { type: 'dragon', multiplier: 2 } }),
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

/**
 * Every way to answer the pending choice, as RESOLVE_CHOICE actions: each option (the first few, when there are many)
 * and nothing, where the question allows it, or only nothing when there's nothing to click.
 */
export function choiceAnswers(state: GameState): GameAction[] {
  const view = pendingChoiceView(state, state.pendingChoice!);
  const answer = (fields: Omit<Extract<GameAction, { type: 'RESOLVE_CHOICE' }>, 'type'> = {}): GameAction => ({ type: 'RESOLVE_CHOICE', ...fields });
  switch (view.kind) {
    case 'pickFromDeck':
    case 'pickFromDiscard':
    case 'pickFromHand':
    case 'pickAttached':
    case 'oppHand':
      return [...view.options.slice(0, 3).map((c) => answer({ cardUid: c.uid })), answer()];
    case 'ownPokemon':
    case 'oppPokemon':
      return [...view.options.slice(0, 3).map((t) => answer({ target: t })), answer()];
    case 'arrangeTop':
      return [answer({ order: view.cards.map((c) => c.uid) }), answer({ order: [...view.cards].reverse().map((c) => c.uid) })];
    case 'challenge':
      return [answer({ count: 1 }), answer({ count: 0 })];
    case 'drawCount':
      return [answer({ count: view.max }), answer({ count: 0 })];
    case 'options':
      return view.labels.map((_, i) => answer({ count: i }));
  }
}

/**
 * A choice always terminates: follows every legal answer to the pending choice (choiceAnswers), then from each question
 * that leads to the last answer accepted (nothing, where it's allowed: a search for "any number" ends when the player
 * stops), whoever they're for, and throws if a path is still asking after `steps` answers, or if no answer at all is
 * accepted (the hangs fixed in #101: a held Active Pokémon's switchIn, Peal of Thunder). Returns the states reached with
 * no choice left.
 */
export function settles(state: GameState, steps = 12): GameState[] {
  const start = state.pendingChoice;
  if (!start) throw new Error('Nothing is being asked');
  const done: GameState[] = [];
  const follow = (s: GameState, depth: number) => {
    const pending = s.pendingChoice;
    if (!pending) return void done.push(s);
    if (depth >= steps) throw new Error(`${start.source}: still asking (${pending.source}: ${pending.kind}) after ${steps} answers`);
    const accepted = choiceAnswers(s).map((a) => applyAction(s, pending.player, a)).filter((r) => r.ok);
    if (!accepted.length) throw new Error(`${pending.source} (${pending.kind}): no answer is accepted`);
    for (const r of accepted.slice(depth ? -1 : 0)) if (r.ok) follow(r.state, depth + 1);
  };
  follow(state, 0);
  return done;
}

/** Plays a Trainer card with the first answer to each of its questions (the most cards where it asks for some). Throws if it can't be played. */
export function playAuto(state: GameState, player: string, cardUid: string): GameState {
  const me = state.players[player]!;
  const opp = state.players[state.playerOrder.find((p) => p !== player)!]!;
  const card = me.hand.find((c) => c.uid === cardUid);
  if (!card) throw new Error(`${cardUid} isn't in ${player}'s hand`);
  const situation = trainerSituation(state, me, opp, card);
  let choices: TrainerChoices = {};
  for (let guard = 0; guard < 10; guard++) {
    const result = resolveTrainerChoices(situation, choices);
    if ('choices' in result) return act(state, player, { type: 'PLAY_TRAINER', cardUid, choices: result.choices });
    if (!result.need) throw new Error(result.error);
    const spec = result.need;
    const value = spec.kind === 'cards' ? spec.options.slice(0, Math.min(spec.max, spec.options.length)).map((c) => c.uid) : spec.options[0];
    choices = { ...choices, [spec.field]: value } as TrainerChoices;
  }
  throw new Error(`${card.defId}: its questions never end`);
}
