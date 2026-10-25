// Pokémon Powers: legality, the questions a power asks, and the context power effects run with.
// Card-specific behaviour lives in effects/ (POWERS), next to the attack effects.
import type { AttackContext } from './attacks.js';
import { hasType, holonEnergy, isBasicEnergy, lookupCard, namesMatch, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { powerEffect, trainerEffect } from './effects/index.js';
import { counts, energyPool, type CardInstance, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from './engine.js';
import { addLog, clearSpecialConditions, effectId, evolvedFromName, flipCoin, hasSpecialCondition, isDelta, lakeTrio, pokemonName, inPlayDef, sameCards, specialConditionLabel } from './status.js';
import { evolvesFromEevee, isPokemonSP, trainersLocked, type PendingChoice, type PendingChoiceInput } from './trainers.js';

/** Answers to a power's questions. Each question names the field it fills. */
export interface PowerChoices {
  /** One of your Pokémon to take something from (Damage Swap, Energy Trans). */
  from?: Target;
  /** One of your Pokémon to give something to. */
  to?: Target;
  /** A card in your hand (Rain Dance). */
  cardUid?: string;
  /** One of the opponent's Pokémon to take something from (Curse). */
  oppFrom?: Target;
  /** One of the opponent's Pokémon to give something to. */
  oppTo?: Target;
  /** What to look at (Peek). */
  peek?: PeekTarget;
  /** Which Prize card, counting from the first (Peek). */
  prize?: number;
  /** An Energy card attached to `from` (Energy Trans). */
  energyUid?: string;
  /** A type (Buzzap). */
  type?: EnergyType;
  /** How many damage counters to move at once (Damage Swap; 1 when it isn't asked). */
  counters?: number;
  /** Whose Pokémon to take something from (Chaos Move: yours or your opponent's); then which, in `from` or `oppFrom`. */
  fromSide?: 'own' | 'opp';
  /** Whose Pokémon to give something to (Chaos Move); then which, in `to` or `oppTo`. */
  toSide?: 'own' | 'opp';
  /** A second Energy card, attached to `oppTo` (Magnetic Flow). */
  energyUid2?: string;
}

/** A question a power asks before it's used. */
export type PowerChoiceSpec = { prompt: string } & (
  | { kind: 'ownPokemon'; field: 'from' | 'to'; options: Target[] }
  | { kind: 'handCard'; field: 'cardUid'; options: CardInstance[] }
  | { kind: 'attachedEnergy'; field: 'energyUid' | 'energyUid2'; options: CardInstance[] }
  /** A card in a discard pile (Strange Tentacles: the opponent's; Miracle Shift: the player's). */
  | { kind: 'discardCard'; field: 'cardUid'; options: CardInstance[] }
  | { kind: 'type'; field: 'type'; options: EnergyType[] }
  | { kind: 'oppPokemon'; field: 'oppFrom' | 'oppTo'; options: Target[] }
  | { kind: 'peek'; field: 'peek'; options: PeekTarget[] }
  | { kind: 'prize'; field: 'prize'; options: number[] }
  /** How many damage counters to move: the most that can go (`all`: every one there is), or 1. */
  | { kind: 'counters'; field: 'counters'; options: number[]; all: boolean }
  /** Whose Pokémon (Chaos Move): the player's own or the opponent's. */
  | { kind: 'side'; field: 'fromSide' | 'toSide'; options: ('own' | 'opp')[] }
);

/** Peek: the top card of your deck or the opponent's, a random card from their hand, or a Prize card of either player. */
export type PeekTarget = 'deck' | 'oppDeck' | 'oppHand' | 'prize' | 'oppPrize';

/** What a power can see before it's used. View-safe: the UI builds it from a PlayerView. */
export interface PowerSituation {
  me: Pick<PlayerState, 'active' | 'bench' | 'hand' | 'discard' | 'powersOffUntil' | 'quickenTurn' | 'activeEnergyTurn' | 'goodNeighborTurn' | 'healDanceTurn' | 'weatherTurn' | 'quickSearchTurn' | 'formChangeTurn' | 'happyDanceTurn' | 'powerTurns' | 'supporterTurn' | 'supporterUid' | 'knockedOutTurn'>;
  opp: Pick<PlayerState, 'active' | 'bench' | 'powersOffUntil' | 'discard'>;
  /** Sizes of the hidden piles (Peek). */
  counts: { deck: number; prizes: number; oppDeck: number; oppHand: number; oppPrizes: number; /** Of `prizes`, how many are face up (Prize Shift). */ faceUpPrizes?: number };
  /** The Pokémon whose power it is. */
  source: Target;
  cards: CardLibrary;
  turn: number;
  /** The Stadium card in play (Mt. Moon). Missing = none. */
  stadium?: CardInstance | null;
}

/** Card-specific power behaviour. */
export interface PowerEffect {
  /** Printed text, where TCGdex's differs from the card (Downpour). */
  text?: string;
  /** Printed name, where TCGdex has none or leaves out the brackets (Unown [M]'s [Metal]). */
  name?: string;
  /** Why the power can't be used now (beyond Special Conditions). */
  blocked?: (s: PowerSituation) => string | null;
  choices?: (s: PowerSituation, c: PowerChoices) => PowerChoiceSpec[];
  /** Using the power. Missing for powers that only react to something (Strikes Back). */
  use?: (ctx: PowerContext) => void;
  /** Called when an opponent's attack damages this Pokémon (Strikes Back). */
  onAttackDamage?: (ctx: AttackContext, damaged: InPlayPokemon) => void;
  /** Usable once during each of its owner's turns (Step In, Curse). */
  oncePerTurn?: boolean;
  /** Stops working only while Asleep, not with any other Special Condition (Fossil's Transparency). */
  stopsOnlyWhileAsleep?: boolean;
  /** Toxic Gas: every other power is ignored. */
  toxicGas?: boolean;
  /** Prehistoric Power: no Evolution cards can be played. */
  blocksEvolution?: boolean;
  /** Transform: as the active, Ditto is a copy of the Defending Pokémon (refreshTransforms). */
  transform?: boolean;
  /** Transparency: a flip whenever an attack does anything to it; heads prevents all of it. */
  transparency?: boolean;
  /** Kabuto Armor: attack damage to it is halved, rounded down to the nearest 10. */
  halvesDamage?: boolean;
  /** Clairvoyance: the opponent plays with their hand face up. */
  revealsHand?: boolean;
  /** Invisible Wall: attack damage of 30 or more to it (after everything else) is prevented. */
  invisibleWall?: boolean;
  /** Thick Skinned: it can't become Asleep, Confused, Paralyzed or Poisoned. */
  noConditions?: boolean;
  /** Retreat Aid: while it's on the Bench, the Active Pokémon's retreat cost is 1 less. */
  retreatAid?: boolean;
  /** Neutral Shield: attacks by Evolved Pokémon don't affect it. */
  neutralShield?: boolean;
  /** Aurora Veil: while it's the Active Pokémon, attacks don't affect its owner's Benched Pokémon. */
  auroraVeil?: boolean;
  /** Guard: while it's the Active Pokémon, the opponent's Active Pokémon can't retreat. */
  guard?: boolean;
  /** Chain Reaction: after any Pokémon evolves, it may evolve from the deck (offerChainReaction). */
  chainReaction?: boolean;
  /** It works whatever Special Condition the Pokémon has (Frenzy, which works while it's Confused). */
  ignoresConditions?: boolean;
  /**
   * When its card is played from the hand onto a Pokémon (evolving it, or by Pokémon Breeder): Summon Minions,
   * Sneak Attack, Reel In; or, for a Basic Pokémon, onto the Bench (Engage). May ask the player to choose something
   * (`state.pendingChoice`).
   */
  onPlayFromHand?: (state: GameState, owner: PlayerState, pokemon: InPlayPokemon) => void;
  /** Hay Fever: no Trainer cards can be played, by either player. */
  noTrainers?: boolean;
  /** Sticky Goo: while it's the Active Pokémon, the opponent's Active Pokémon costs this much more to retreat. */
  stickyGoo?: number;
  /** Sinkhole: when the opponent's Active Pokémon retreats, they flip; tails does 20 damage to it. */
  sinkhole?: boolean;
  /** Frenzy: any damage it does while Confused (to itself too) is 30 more, before Weakness and Resistance. */
  frenzy?: boolean;
  /**
   * Called after a card from its owner's hand is attached to it as Energy (Pure Body). May ask the player to
   * choose something (`state.pendingChoice`).
   */
  onEnergyFromHand?: (state: GameState, owner: PlayerState, pokemon: InPlayPokemon, target: Target, energy: CardInstance) => void;
  /** Rebirth: when it's Knocked Out, its card goes back to the hand after it's discarded (engine.ts, resolveKnockouts). */
  rebirth?: boolean;
  /** Photosynthesis: all Energy attached to it provides Grass Energy (energyPool). */
  photosynthesis?: boolean;
  /** Shell Armor: attack damage to it is 10 less, after Weakness and Resistance. */
  shellArmor?: boolean;
  /** Strange Barrier: an attack by a Basic Pokémon that does 20 or more damage to it does 10 instead. */
  strangeBarrier?: boolean;
  /** Bench Guard: while it's benched, its owner may move 10 of the damage an attack does to another benched Pokémon to it. */
  benchGuard?: boolean;
  /** Flee: before the opponent attacks, its owner may say it switches out if the attack damages it as the Active Pokémon. */
  flee?: boolean;
  /** Psylink: it can use the attacks of its owner's other Psychic Pokémon in play (usableAttacks). */
  psylink?: boolean;
  /** Rebellion: whenever it attacks, 2 tails and the attack does nothing; it's shuffled into its owner's deck. */
  rebellion?: boolean;
  /** Fortitude: an opponent's attack that would Knock it Out leaves it with 10 HP on heads. */
  fortitude?: boolean;
  /** Relaxing Scent: while it's an Active Pokémon, attack damage to any Pokémon is halved, rounded up to the nearest 10. */
  relaxingScent?: boolean;
  /** Scram: with exactly 10 HP left, it's shuffled into its owner's deck with every card attached (resolveKnockouts). */
  scram?: boolean;
  /** Mind Games: whenever the opponent plays a Trainer card, its owner may flip; heads, the card does nothing and goes on top of their deck (playTrainer). */
  mindGames?: boolean;
  /** Wild Growth: each Grass Energy card attached to its owner's Grass Pokémon provides 2 Grass Energy (refreshWildGrowth; it doesn't stack). */
  wildGrowth?: boolean;
  /** Spikes: during the opponent's turn, 10 damage to each of their benched Pokémon that becomes their Active Pokémon (engine.ts, newActives). */
  spikes?: boolean;
  /** Frog Song: its attacks that damage the Defending Pokémon do 40 more while more than 3 Poliwag line Pokémon are in play. */
  frogSong?: boolean;
  /** Unown D, M and N: attack damage to its owner's Pokémon by a Pokémon of this type is 30 less, while it's the only one of its name they have in play. */
  unownGuard?: EnergyType;
  /** Anger: its owner's Pokémon with Unown in their names do 10 more with Hidden Power for each damage counter on it (one Anger per attack). */
  anger?: boolean;
  /** Energy Evolution: whenever its owner attaches an Energy card to it, a flip; heads evolves it from the deck into the Energy's type (engine.ts). */
  energyEvolution?: boolean;
  /** Time Travel: if an opponent's attack would Knock it Out, a flip; heads shuffles it and its cards into its owner's deck instead (attacks.ts, resolveKnockouts). */
  timeTravel?: boolean | 'bottom';
  /** Hard Shell: attack damage of 40 or less to it (after Weakness and Resistance) is 10 instead. */
  hardShell?: boolean;
  /** Crystal Body: the opponent's attacks do nothing to it but damage. */
  crystalBody?: boolean;
  /** Slow Start: it can't attack until the opponent has 3 or fewer Prize cards left (attackError). */
  slowStart?: boolean;
  /** Rivalry: 50 more while the opponent has a Pokémon LV.X in play (attacks.ts). */
  rivalry?: boolean;
  /** Revenge Fang: 40 more while its player has fewer Benched Pokémon than the opponent (attacks.ts). */
  revengeFang?: boolean;
  /** Enthusiasm: Poliwag, Poliwhirl and Poliwrath do 60 more while its player has all three in play (attacks.ts). */
  enthusiasm?: boolean;
  /** Steel Coating: 10 less damage for each Metal Energy attached, 20 at most (attacks.ts). */
  steelCoating?: boolean;
  /** Fossil Armor: no attack damage of 60 or less (attacks.ts). */
  fossilArmor?: boolean;
  /** WALL, Snow Veil: as its player's Active Pokémon, this much less damage to each of their Pokémon from the opponent's attacks (attacks.ts). */
  wall?: number;
  /** Sunny Day: its player's Grass and Fire Pokémon's attacks do 10 more to the Defending Pokémon (attacks.ts). */
  sunnyDay?: boolean;
  /** Green Dignity: while its player has more Prize cards left, its attacks do 10 more for each Grass Pokémon on their Bench (attacks.ts). */
  greenDignity?: boolean;
  /** No Guard: as its player's Active Pokémon, 60 more damage both to and from it (attacks.ts). */
  noGuard?: boolean;
  /** Honeycomb Defender: with 6 or more damage counters, 40 less attack damage (attacks.ts). */
  honeycomb?: boolean;
  /** Protect Wing: as its player's Active Pokémon, 20 less damage to their Pokémon from the opponent's Stage 2 Pokémon (attacks.ts). */
  protectWing?: boolean;
  /** Poison Enzyme: nothing from the opponent's Poisoned Pokémon (attacks.ts). */
  poisonEnzyme?: boolean;
  /** Battle Rush: no Colorless Energy in its attacks' costs while the opponent has a Pokémon of 120 HP or more in play (attackError). */
  battleRush?: boolean;
  /** Regi Form: its attacks cost 1 Colorless less with Regirock, Regice and Registeel in play (attackError). */
  regiForm?: boolean;
  /** Heat Metal: the opponent's Burned Pokémon stay Burned (engine.ts). */
  heatMetal?: boolean;
  /** Ectoplasm: Knocked Out as the Active Pokémon by the opponent's attack, it goes into play as a Stadium card (resolveKnockouts). */
  ectoplasm?: boolean;
  /** Fainting Spell: Knocked Out by the opponent's attack, heads Knocks Out the Defending Pokémon (resolveKnockouts). */
  faintingSpell?: boolean;
  /** Darkness Drive: after the opponent uses a Poké-Power, a basic Darkness Energy card from the discard pile attached to it (usePower). */
  darknessDrive?: boolean;
  /** Multitype: a Pokémon LV.X of its previous level's type (inPlayDef). */
  multitype?: boolean;
  /** Bind Eye: as its player's Active Pokémon, the opponent's Pokémon keep their Special Conditions when they evolve (EVOLVE). */
  bindEye?: boolean;
  /** Invisible Tentacles: the opponent's Pokémon attack only by discarding a card from the hand (attackError, attackAction). */
  invisibleTentacles?: boolean;
  /** Revenge Seed: 60 more after one of its player's Grass Pokémon was Knocked Out by the opponent's attack last turn (attacks.ts). */
  revengeSeed?: boolean;
  /** Link Lightning: Voltage Shoot the turn Raichu LV.X levelled up lets it use another attack (attackAction). */
  linkLightning?: boolean;
  /** Overeager: the player whose Active Pokémon it is at the start goes first (START_BATTLE). */
  overeager?: boolean;
  /** Psychic Aura: its player's Psychic Pokémon have no Weakness (attacks.ts). */
  psychicAura?: boolean;
  /** Psybarrier: nothing from the opponent's Pokémon that aren't Evolved Pokémon (attacks.ts). */
  psybarrier?: boolean;
  /** UNSEEN: on the Bench, the opponent's attacks do nothing to its player's Benched Unown (attacks.ts). */
  unseen?: boolean;
  /** Ditto DNA: as its player's Active Pokémon, the opponent's Active Pokémon's HP (refreshHideout) and attacks (as Mimic). */
  dittoDna?: boolean;
  /** Resent: Knocked Out by the opponent's attack, 4 damage counters on the Attacking Pokémon and each of theirs with its name (resolveKnockouts). */
  resent?: boolean;
  /** Primal Shell: as its player's Active Pokémon, the opponent can't play Trainer (Item) cards (trainerError). */
  primalShell?: boolean;
  /** Sunlight Veil: 20 more HP for its player's Pokémon that evolve from Eevee, however many (refreshHideout). */
  sunlightVeil?: boolean;
  /** Moonlight Veil: its player's Pokémon that evolve from Eevee have no Weakness and retreat for free (attacks.ts, retreatBodies). */
  moonlightVeil?: boolean;
  /** Disturbance Scales: its player's attacks ignore Resistance (attacks.ts). */
  disturbanceScales?: boolean;
  /** Toxic Virus: every Poisoned Pokémon, both players', takes 1 more damage counter between turns (betweenTurns). */
  toxicVirus?: boolean;
  /** Anger Point: with damage counters on it, its attacks do 40 more to the Active Pokémon (attacks.ts). */
  angerPoint?: boolean;
  /** Marvel Scale: nothing from the opponent's Pokémon LV.X's attacks (attacks.ts). */
  marvelScale?: boolean;
  /** Sunlight: with Lunatone in play, its player's Psychic and Fighting Pokémon ignore Resistance (attacks.ts). */
  sunlight?: boolean;
  /** Dark Shadow: basic Darkness Energy cards on its player's Darkness Pokémon do 10 more, as the Special card (attacks.ts). */
  darkShadow?: boolean;
  /** LINK: it can use every attack of every other Unown in play, either player's (usableAttacks). */
  link?: boolean;
  /** Cotton Spore: on its owner's heads, no damage from the opponent's attack (attacks.ts). */
  cottonSpore?: boolean;
  /** Pot Shell: nothing at all from an attacker with a Special Energy card attached (attacks.ts). */
  potShell?: boolean;
  /** Trash Cloak: with a Pokémon Tool attached, 20 less damage from the opponent's attacks, after Weakness and Resistance. */
  trashCloak?: boolean;
  /** Camouflage: with a basic Energy card of the attacker's type attached, 40 less damage from it, after Weakness and Resistance. */
  camouflage?: boolean;
  /** Cotton Balloon: with Grass Energy attached, 20 less damage from the opponent's Evolved Pokémon, after Weakness and Resistance. */
  cottonBalloon?: boolean;
  /** Fury Blaze: its attacks do 50 more to the Active Pokémon while the opponent has 3 or fewer Prize cards left. */
  furyBlaze?: boolean;
  /** Plant Cloak: 40 more HP with 2 or more Grass Energy attached (refreshHideout). */
  plantCloak?: boolean;
  /** Phoenix Turn: Knocked Out by the opponent's attack, heads keeps it in play, cleared (resolveKnockouts). */
  phoenixTurn?: boolean;
  /** Energy Shift: Knocked Out by the opponent's attack, its card is attached to another of its player's Pokémon as Energy (resolveKnockouts). */
  energyShift?: boolean;
  /** Burning Coat: a Pokémon its attack's damage Knocks Out costs its owner the top 3 cards of their deck (resolveKnockouts). */
  burningCoat?: boolean;
  /** Jamming: a damage counter on each of the opponent's Pokémon after they play a Supporter card from the hand (playTrainer). */
  jamming?: boolean;
  /** Downer Material: with its player's Uxie and Mesprit in play, the opponent's Basic Pokémon's attacks cost 1 Colorless more (only 1). */
  downerMaterial?: boolean;
  /** Upper Material: with its player's Uxie and Azelf in play, every Uxie, Mesprit and Azelf (both players') has no Retreat Cost. */
  upperMaterial?: boolean;
  /** Mother Pheromone: its player's Nidoran ♀, Nidorina, Nidoran ♂, Nidorino and Nidoking's attacks cost 1 Colorless less. */
  motherPheromone?: boolean;
  /** Rainbow Scale: 40 more to an Active Pokémon weak to a type of Energy attached to it (none with a Special Energy card attached). */
  rainbowScale?: boolean;
  /** Dark Genes: its player's Murkrow can use its attacks without their Energy, while it has the Energy for them (usableAttacks). */
  darkGenes?: boolean;
  /** Sticky: every other Pokémon (but those with its name), both players', retreats for 1 more. */
  sticky?: boolean;
  /** Jumbo Fin: with Mantyke under it, its player's Water Pokémon retreat for 2 less. */
  jumboFin?: boolean;
  /** Airy Wall: no damage from an attacker with 2 or fewer Energy cards attached; with Mime Jr. under it, none of that attack's effects either. */
  airyWall?: boolean;
  /** Craggy Face: as its player's Active Pokémon, the opponent's Stage 2 Evolved Pokémon's attacks do this much less, before Weakness and Resistance. */
  stage2Less?: number;
  /** Cold Fat: while it's Asleep, attack damage to it is 40 less, after Weakness and Resistance. */
  coldFat?: boolean;
  /** Shocking Tail: as its player's Active Pokémon, 2 damage counters on any Pokémon the opponent attaches an Energy card to from their hand. */
  shockingTail?: boolean;
  /** Dragon DNA: it can use the attacks of its Basic Pokémon, 30 more to the Active Pokémon (usableAttacks, attacks.ts). */
  dragonDna?: boolean;
  /** Poison Sacs: the opponent's Pokémon stay Poisoned when they evolve. */
  poisonSacs?: boolean;
  /** Power Cancel: once during the opponent's turn, their Poké-Power can be stopped with 2 cards from its owner's hand (usePower). */
  powerCancel?: boolean;
  /** Magnetize: its player's Active Pokémon with any Metal Energy attached has no Retreat Cost (retreatBodies). */
  magnetize?: boolean;
  /** Lazy: while it's its player's Active Pokémon, the opponent's Pokémon can't use Poké-Powers (or older Pokémon Powers). */
  lazy?: boolean;
  /** Withering Dust: while it's in play, no Resistance for any Active Pokémon. */
  witheringDust?: boolean;
  /** Intimidating Fang: while it's its player's Active Pokémon, the opponent's attacks do this much less to their Pokémon, before Weakness and Resistance. */
  intimidatingFang?: number;
  /** Hard Cocoon: the opponent's attack's damage to it, after Weakness and Resistance, is this much less on its owner's heads. */
  hardCocoon?: number;
  /** Prehistoric Memory: every Evolved Pokémon in play can use the attacks of the cards it evolved from (prehistoricMemory). */
  prehistoricMemory?: boolean;
  /** Mimic: as the Active Pokémon, it can use the Defending Pokémon's attacks too (usableAttacks). */
  mimic?: boolean;
  /** Magma Pool: when it moves from the Active spot to the Bench, a Fire Energy card goes from it to the new Active Pokémon (engine.ts, newActives). */
  magmaPool?: boolean;
  /** Allergic Pollen: attacks and Pokémon Powers can't do anything with the cards in either discard pile (discardsLocked). */
  allergicPollen?: boolean;
  /** Unown K's Keep: the opponent's attacks, Pokémon Powers and Trainer cards can't discard Energy cards from its owner's Pokémon with Unown in their names (energyKept). */
  keep?: boolean;
  /** Legendary Body: as the Active Pokémon, no Trainer card but a Stadium affects it or its Energy, and Trainer cards attached to it are discarded (trainerProof). */
  legendaryBody?: boolean;
  /** Conductivity: 10 damage to each Pokémon the opponent attaches an Energy card to from their hand, while its owner has only 1 of it in play (conductivity). */
  conductivity?: boolean;
  /** Scare: as the Active Pokémon, the opponent's Baby Pokémon's powers stop working and they can't attack (scaredBy). */
  scare?: boolean;
  /** Deep Sleep: an Asleep Pokémon wakes up between turns only on 2 heads (deepSleep). */
  deepSleep?: boolean;
  /** Miraculous Wind: as the Active Pokémon, every Special Energy card provides Colorless Energy only and its other effects stop (refreshWind). */
  miraculousWind?: boolean;
  /** [Chase]: as the Active Pokémon, a heads puts a damage counter (with Weakness and Resistance) on the opponent's Active Pokémon that tries to retreat (RETREAT). */
  chase?: boolean;
  /** [Zoom]: on the Bench, its owner's Pokémon with Unown in their names retreat for free (zoomed). */
  zoom?: boolean;
  /** [XXXXX]: its owner's Hidden Power attacks flip until tails, 10 more for each heads (one per attack). */
  xxxxx?: boolean;
  /** [Perform]: its Hidden Power does as much more damage as an attack did to it as the Active Pokémon on the opponent's last turn. */
  perform?: boolean;
  /** Hot Plate: as the Active Pokémon, 10 damage to each Baby or Basic Pokémon either player puts onto their Bench from their hand (hotPlate). */
  hotPlate?: boolean;
  /**
   * Psymimic: instead of its own attacks, it can use any attack of the opponent's Pokémon in play, paying that attack's
   * cost, while it works (usableAttacks).
   */
  psymimic?: boolean;
  /** Rock Body, Exoskeleton (Poké-Bodies): attack damage to it is this much less, after Weakness and Resistance (attacks.ts). */
  damageReduction?: number;
  /** Dark Aura (a Poké-Body): every Energy attached to it provides this type instead of its own (energyPool). */
  energyAs?: EnergyType;
  /** A Poké-Body (always on; Dark Impact doesn't stop it). Poké-Powers and the older Pokémon Powers don't have it. */
  body?: boolean;
  /**
   * Extreme Speed, Heavyweight, Lightweight, Conductive Body, Psychoflow, Slippery Skin: how much its own retreat cost
   * changes (retreatCost). `opp`: the other player's Pokémon in play, when known.
   */
  retreatChange?: (pokemon: InPlayPokemon, cards: CardLibrary, owner: Pick<PlayerState, 'active' | 'bench'>, opp?: Pick<PlayerState, 'active' | 'bench'>) => number;
  /** Gluey Slime: each player's Active Pokémon costs 1 more to retreat (only 1, however many are in play). */
  glueySlime?: boolean;
  /** Poison Resistance: it can't be Poisoned. */
  noPoison?: boolean;
  /** Dense Body: attack damage to it from Basic Pokémon (not Baby Pokémon) is this much less. */
  basicGuard?: number;
  /** Suction Cups: as its owner's Active Pokémon, the opponent's Active Pokémon that retreats has all its Energy cards discarded (RETREAT). */
  suctionCups?: boolean;
  /** Fluff: during the opponent's turn, with a damage counter on it, a flip whenever an attack does anything to it; heads prevents all of it. */
  fluff?: boolean;
  /** Enervating Pollen: Resistance on each Active Pokémon takes off at most 10 (attacks.ts). */
  enervatingPollen?: boolean;
  /** Anti-Lightning: basic Energy cards of this type can't be attached to it from the hand (attachBlocked). */
  antiAttach?: EnergyType;
  /** Dark Gaze: as its owner's Active Pokémon, Benched Pokémon (both players') can't use Poké-Powers (powerError). */
  darkGaze?: boolean;
  /** Mirror Coat: when the opponent's attack Poisons or Burns it, their Active Pokémon becomes affected the same way (attacks.ts). */
  mirrorCoat?: boolean;
  /** Synchronicity: any Technical Machine can be attached to it, whatever Pokémon the Machine is for. */
  synchronicity?: boolean;
  /** Rare Metal, Prismatic Body: each basic Energy card attached provides this instead ('any': every type, 1 at a time) (energyPool). */
  basicEnergyAs?: EnergyType | 'any';
  /** Thick Shell: attack damage to it from Evolved Pokémon is this much less, after Weakness and Resistance. */
  evolvedGuard?: number;
  /** Primal Aura: as its owner's Active Pokémon, neither player can play Evolution cards from the hand onto Benched Pokémon (primalBlock). */
  primalAura?: boolean;
  /** Primal Stare: as its owner's Active Pokémon, the opponent can't play Evolution cards from the hand onto their Active Pokémon (primalBlock). */
  primalStare?: boolean;
  /** Safeguard ('ex'), Wonder Guard ('evolvedOrEx'): attacks by the opponent's Pokémon-ex (and Evolved Pokémon) don't affect it (attacks.ts). */
  guardFrom?: 'ex' | 'evolvedOrEx' | 'dark';
  /** Submerge: while it's on the Bench, the opponent's attacks do no damage to it (attacks.ts). */
  benchImmune?: boolean;
  /** Energy Guard: with a basic Energy card attached, the opponent's attack damage to it is this much less, after Weakness and Resistance. */
  energyGuard?: number;
  /** Glowing Screen: while its owner has `partner` in play, attack damage to it from Pokémon of `types` is `amount` less (at most that, however many partners). */
  partnerGuard?: { partner: string; types: EnergyType[]; amount: number };
  /** Power Pinchers: while it's its player's Active Pokémon, their attacks do this much more to the Defending Pokémon, before Weakness and Resistance. */
  powerPinchers?: number;
  /** Primal Veil: while it's its player's Active Pokémon, neither player can play Supporter cards (supportersVeiled). */
  primalVeil?: boolean;
  /** Primal Lock: while it's in play, the opponent can't play Pokémon Tools and theirs are discarded (primalLocked, dropLockedTools). */
  primalLock?: boolean;
  /** Power Saver: it can't attack while 3 or fewer Pokémon in play (both players') have this in their names (attackError). */
  powerSaver?: string;
  /** Mark of Antiquity: as its player's Active Pokémon, the Pokémon with these names (either player's) can't attack (attackError). */
  markOfAntiquity?: string[];
  /** Primal Pull: as its player's Active Pokémon, each player's Evolved Pokémon pay 1 more Colorless Energy for their attacks (attackError). */
  primalPull?: boolean;
  /** Block Dust: as its player's Active Pokémon, the opponent can't play Trainer cards but Supporters (trainersDusted). */
  blockDust?: boolean;
  /** Ice Wall: attack damage to it from the opponent's Pokémon with a Special Energy card attached is this much less (attacks.ts). */
  specialGuard?: number;
  /** Shell Retreat, Core Guard: with Energy attached (any, or of `energy`), attack damage to it is `amount` less (`anyAttack`: its own player's attacks too). */
  coreGuard?: { amount: number; energy?: EnergyType; anyAttack?: boolean };
  /** Fast Feet: it can retreat while Asleep or Paralyzed (retreatError). */
  fastFeet?: boolean;
  /** Power Diffusion: as its player's Active Pokémon, attacks (either player's) do no damage to their Benched Pokémon (attacks.ts). */
  powerDiffusion?: boolean;
  /** Overzealous: while the opponent has a Pokémon-ex in play, its attacks do this much more to the Defending Pokémon (attacks.ts). */
  overzealous?: number;
  /** Energy Grounding: when the opponent's attack Knocks Out another of its player's Pokémon, a basic Energy card from it may go to this one (attacks.ts). */
  energyGrounding?: boolean;
  /** Rain Dish: this much damage off it between turns, wherever it is (betweenTurns). */
  rainDish?: number;
  /** Conductivity (Ampharos ex): a damage counter on each Pokémon the opponent attaches an Energy card to from their hand; only 1, however many (conductivityEx). */
  conductivityEx?: boolean;
  /**
   * Between turns, after the checkup's Special Conditions (Sooth Dust, Acid Sampler, Eerie Aura, Sand Damage…): called for
   * each Pokémon in play with it working. `done`: names of the bodies already used between these turns ("you can't use more
   * than 1 Sand Damage"), by `owner.id` + name.
   */
  checkup?: (state: GameState, owner: PlayerState, pokemon: InPlayPokemon, opp: PlayerState, done: Set<string>) => void;
  /** Fiery Aura: as its player's Active Pokémon, Burned Pokémon (both players') take 40 between turns instead of 20 (betweenTurns). */
  fieryAura?: boolean;
  /** Power Gene: its player's attacks by Pokémon with these names do `amount` more to the Defending Pokémon, for each one in play (attacks.ts). */
  powerGene?: { names: string[]; amount: number };
  /** Family Bonds: while it's in play, its player's Pokémon with these names retreat for free (retreatBodies). */
  familyBonds?: string[];
  /** Spiral: as its player's Active Pokémon, the opponent's Confused Active Pokémon can't retreat (retreatError). */
  spiral?: boolean;
  /** Retreat Aid (EX FireRed & LeafGreen): on the Bench, its player's Active Pokémon (not a Pokémon-ex or Baby Pokémon) retreats for this much less; they add up. */
  retreatAidCost?: number;
  /** Magic Odds, Magic Evens: an attack's damage to it of an odd (or even) number of tens, 10 to 180, after everything else, is prevented (attacks.ts). */
  magicNumbers?: 'odd' | 'even';
  /** Energy Protection: attack damage to it is 10 less for each Energy card attached, at most `max` (attacks.ts). */
  energyProtection?: { max: number; type?: EnergyType; oppOnly?: boolean };
  /** Powder Protection: attack damage to it from Pokémon with an owner in their names is this much less (attacks.ts). */
  ownerGuard?: number;
  /** Dragon Veil: while it's in play, its player's Active Pokémon has no Weakness (attacks.ts). */
  dragonVeil?: boolean;
  /** Dark Condition: with Energy of this type attached, it has no Weakness (attacks.ts). */
  noWeaknessWith?: EnergyType;
  /** Darkness Veil: with Energy of this type attached, the opponent's attacks do nothing to it but damage (attacks.ts). */
  crystalBodyWith?: EnergyType;
  /** Dragon Aura: while this holds (basic Fire and Lightning Energy cards attached), the opponent's attacks do nothing to it but damage. */
  crystalBodyWhen?: (pokemon: InPlayPokemon, cards: CardLibrary) => boolean;
  /** Dark and Clear: with Energy of this type attached, it can't be affected by Special Conditions (conditionFree). */
  noConditionsWith?: EnergyType;
  /** Insomnia: it can't be Asleep. */
  noSleep?: boolean;
  /** Darkest Impulse: whenever the opponent evolves a Pokémon from their hand, 2 damage counters on it (one Darkest Impulse, however many). */
  darkestImpulse?: boolean;
  /** Dual Armor: with Energy of `energy` attached, it's these types (refreshHideout). */
  dualArmor?: { energy: EnergyType; types: EnergyType[] };
  /** Dark Healer: with Energy of this type attached, its Rain Dish works. */
  rainDishWith?: EnergyType;
  /** Hard Protection: no damage to it from its own player's attacks, its own recoil and Confusion included (agreed). */
  hardProtection?: boolean;
  /** Lazy Aura: as its player's Active Pokémon, the opponent's Pokémon-ex do this much less to any of their Pokémon, before Weakness and Resistance (agreed: the Bench too). */
  exAura?: number;
  /** Rai-shield: attack damage to it from the opponent's Pokémon-ex is this much less, after Weakness and Resistance. */
  exReduction?: number;
  /** Mist: attack damage to it from Stage 2 Pokémon (either player's) is this much less, after Weakness and Resistance. */
  stage2Guard?: number;
  /** Self-control, Carefree, Magma Armor: it can't have these Special Conditions. */
  immuneTo?: ('asleep' | 'confused' | 'paralyzed')[];
  /** Green Essence: while it's in play, its player's Active Pokémon with Energy of this type attached can't have Special Conditions (refreshHideout). */
  greenEssence?: EnergyType;
  /** Feebas's Submerge: on the Bench, no damage from any attack, its own player's too. */
  benchImmuneAll?: boolean;
  /** Dragon Lift: while it's in play, its player's Pokémon (not Pokémon-ex or Baby Pokémon) retreat for free. */
  freeRetreatAll?: boolean;
  /** Sunbeam: while it's in play, its player's Pokémon with this name have this much HP (refreshHideout). */
  hpOf?: { name: string; hp: number };
  /** Hunch, Blaze: with this much HP left or less, its attacks do `more` more to the Defending Pokémon, before Weakness and Resistance. */
  lowHpBoost?: { hpLeft: number; more: number };
  /** Tropical Motion: as its player's Active Pokémon, the opponent's Pokémon have no Resistance. */
  tropicalMotion?: boolean;
  /** Vigorous Aura: as either player's Active Pokémon, each Active Pokémon's attacks do this much more to the Active Pokémon, before Weakness and Resistance. */
  vigorousAura?: number;
  /** Commanding Aura: as its player's Active Pokémon, the opponent can't play Stadium cards (trainerError). */
  commandingAura?: boolean;
  /** Cursed Glare: as its player's Active Pokémon, the opponent can't attach Special Energy (but Darkness and Metal) from the hand to their Active Pokémon. */
  cursedGlare?: boolean;
  /** Wise Aura: as its player's Active Pokémon, no Pokémon but Pokémon-ex can use Poké-Powers (both players'). */
  wiseAura?: boolean;
  /** Mystic Scale: while it's in play, no Technical Machines can be played, and those in play are discarded. */
  mysticScale?: boolean;
  /** Dark Hole: on the Bench, Darkness Weakness doesn't apply to its player's Pokémon. */
  darkHole?: boolean;
  /** Empty Shell: Knocked Out, the opponent takes no Prize cards for it. */
  noPrizes?: boolean;
  /** Fast Protection: attacks by the opponent's Basic Pokémon don't affect it. */
  basicProof?: boolean;
  /** Stages of Evolution: it works only while its Pokémon is an Evolved Pokémon (powerActive). */
  evolvedOnly?: boolean;
  /** Stages of Evolution (Hitmonchan): its Pokémon has this much more HP (refreshHideout). */
  hpPlus?: number;
  /** Stages of Evolution (Hitmonlee): its attacks do this much more to the opponent's Pokémon, before Weakness and Resistance. */
  attackMore?: number;
  /** Stages of Evolution (Jynx): it has no Weakness. */
  noWeakness?: boolean;
  /** Thick Fat: attack damage to it from Pokémon of these types is `amount` less, after Weakness and Resistance. */
  typeGuard?: { types: EnergyType[]; amount: number };
  /** Intimidating Ring: as its player's Active Pokémon, the opponent's Basic Pokémon can't attack or use Poké-Powers. */
  intimidatingRing?: boolean;
  /** Overpowering Fang: as its player's Active Pokémon, no Pokémon but Pokémon-ex (both players') can use Poké-Powers or Poké-Bodies. */
  overpoweringFang?: boolean;
  /** Lonesome: while its player has fewer Pokémon in play than the opponent, the opponent can't play Trainer cards but Supporters. */
  lonesome?: boolean;
  /** Shining Horn: while it's its player's only Pokémon in play, the opponent's Basic Pokémon can't attack. */
  shiningHorn?: boolean;
  /** Beacon Protection, Extra Protection: `guardFrom` works only while its player has this Pokémon in play. */
  guardPartner?: string;
  /** Reversal Aura: while its player has more Prize cards left, 20 more to the Active Pokémon and 20 less from the Active Pokémon. */
  reversalAura?: number;
  /** Delta Moon: when the opponent attaches a Special Energy card from their hand, a damage counter on that Pokémon (one, however many). */
  deltaMoon?: boolean;
  /** Binding Aura: the opponent can't evolve an Asleep Pokémon or attach Energy cards to one from their hand. */
  bindingAura?: boolean;
  /** Spiral Swirl: as its player's Active Pokémon, Knocked Out by the opponent's attack's damage, the attacker is now Confused. */
  spiralSwirl?: boolean;
  /** Golden Wing: Knocked Out by the opponent's attack's damage, its owner may move up to 2 of its Energy cards to their other Pokémon. */
  goldenWing?: boolean;
  /**
   * A card with a Poké-Body and a Poké-Power (Igglybuff, Snorlax δ): the effect is the body's (`body`), and `use` is the
   * Poké-Power's, which stops as Poké-Powers do (powerError). `powerName`: the Poké-Power's printed name.
   */
  usePoke?: boolean;
  powerName?: string;
  /** Metal Gravity: the opponent's Active Pokémon that retreats with 40 HP or more left gets 3 damage counters (RETREAT; only one). */
  metalGravity?: boolean;
  /** Sand Veil: the opponent's attacks do no damage to its player's Benched Pokémon (attacks.ts). */
  sandVeil?: boolean;
  /** Delta Protection: attack damage to it from the opponent's δ Pokémon is this much less, after Weakness and Resistance. */
  deltaGuard?: number;
  /** Hard Rock: with 1 Energy or less on it, attack damage to its player's Groudon ex is 20 less, after Weakness and Resistance (only one). */
  hardRock?: boolean;
  /** Battle Aura (its player's δ Pokémon), Extra Feather (their Stage 2 Pokémon-ex): 10 more to the Defending Pokémon, each one adding up. */
  allyMore?: 'delta' | 'stage2ex';
  /** Extra Smoke: attack damage to its player's Stage 2 Pokémon-ex is 10 less, before Weakness and Resistance, each one adding up. */
  extraSmoke?: boolean;
  /** Solid Shell (Cloyster δ): attacks by the opponent's Pokémon do nothing to its player's Benched δ Pokémon. */
  deltaBenchShield?: boolean;
  /** Armor: with 5 or more cards in the opponent's hand, attack damage to it is 30 less, after Weakness and Resistance. */
  handArmor?: boolean;
  /** Fluffy Fur: damaged by the opponent's attack as its player's Active Pokémon, the attacker is now Asleep. */
  fluffyFur?: boolean;
  /** Intimidating Armor: as its player's Active Pokémon, the opponent's Basic Pokémon can't attack or use Poké-Powers or Poké-Bodies. */
  intimidatingArmor?: boolean;
  /** Synergy Effect: what it does while the Stadium named is in play (Sableye: no damage from Pokémon-ex; Glalie: 30 less). */
  synergy?: { stadium: string; exProof?: boolean; less?: number };
  /** Hover Lift, Jynx δ's Stages of Evolution: its player's Pokémon with these names (or of these types) retreat for 1 less, each one adding up (retreatBodies). */
  retreatLessFor?: { names?: string[]; types?: EnergyType[] };
  /** Extra Wing: its player's Stage 2 Pokémon-ex retreat for free (retreatBodies). */
  extraWing?: boolean;
  /** Flotation: with 1 Energy or less attached to it, its player's Kyogre ex retreat for free (retreatBodies). */
  flotation?: boolean;
  /** Extra Liquid: while it's in play, Pokémon-ex (either player's) can't use Poké-Powers, and their attacks cost 1 Colorless more (only 1, however many). */
  extraLiquid?: boolean;
  /** Dark Eyes: after the opponent's Pokémon uses a Poké-Power, 2 damage counters on it (usePower). */
  darkEyes?: boolean;
  /** Chlorophyll: on its player's Grass Pokémon, each card providing only Colorless Energy provides Grass instead (refreshHideout, energyPool). */
  chlorophyll?: boolean;
  /** Holon Veil: every Pokémon card of its player's (in play, deck, hand, discard pile) has δ on it (refreshHideout, isDelta). */
  holonVeil?: boolean;
  /** Psychic Protector: before the opponent's attack its player may choose up to 4 hand cards, discarded for 10 less damage each if it's damaged (attacks.ts). */
  psychicProtector?: boolean;
  /** Reactive Recharge: Knocked Out by the opponent's attack's damage, its owner may move its React Energy cards to their other Pokémon. */
  reactiveRecharge?: boolean;
  /** Shadow Curse: Knocked Out by the opponent's attack's damage, its owner may put 3 damage counters on one of the opponent's Pokémon. */
  shadowCurse?: boolean;
  /** Stench: as its player's Active Pokémon, no Pokémon (either player's) can use Poké-Powers (auraStops). */
  stench?: boolean;
  /** Rear Sensor: while it's in play, each player's Active Basic Pokémon (not Pokémon-ex) can't use Poké-Powers (auraStops). */
  rearSensor?: boolean;
  /** Sol Shade, Luna Shade: while its player has `partner` in play, each player's Pokémon of `type` (not Pokémon-ex) can't use Poké-Powers. */
  shade?: { partner: string; type: EnergyType };
  /** Dual Aura: while its player has this Pokémon (or its -ex) in play, each player's Evolved Pokémon (not Pokémon-ex) can't use Poké-Bodies. */
  dualAura?: string;
  /** Delta Reserve: with a Holon Energy card attached to it, each player's Pokémon without δ can't use Poké-Powers. */
  deltaReserve?: boolean;
  /** Reactive Lift: with a React Energy card attached to it, its player's Water Pokémon (not Pokémon-ex) retreat for free (retreatBodies). */
  reactiveLift?: boolean;
  /** Wobbuffet's Stages of Evolution: while it's in play, the opponent's Active Pokémon costs this much more to retreat (they add up). */
  retreatTax?: number;
  /** Paranoid (while Confused), Ancient Fang (with a partner in play): its attacks do `more` more to the Defending Pokémon, before Weakness and Resistance. */
  defendingMore?: { more: number; when: (pokemon: InPlayPokemon, owner: Pick<PlayerState, 'active' | 'bench'>, cards: CardLibrary) => boolean };
  /** Ancient Shell: while its player has one of these in play, attack damage to it is `amount` less, after Weakness and Resistance. */
  partnerShell?: { names: string[]; amount: number };
  /** Reactive Protection: attack damage to it from the opponent's Pokémon is 10 less for each React Energy card attached, after Weakness and Resistance. */
  reactiveProtection?: boolean;
  /** Ancient Protection: its player's Pokémon with these names have no Weakness. */
  ancientProtection?: string[];
  /** Ancient Tentacles: its player's Pokémon with these names' attack damage isn't affected by Resistance. */
  ancientTentacles?: string[];
  /** Reactive Shield: with a React Energy card attached to it, attacks by the opponent's Pokémon-ex don't affect its player's Tentacruel. */
  reactiveShield?: boolean;
  /** Hydro Barrier: with a Holon Energy card attached to it, its player's Water Pokémon have no Weakness. */
  hydroBarrier?: boolean;
  /** Delta Reactor: while a Stadium with Holon in its name is in play, its player's δ Pokémon do 10 more to the Defending Pokémon (they add up). */
  deltaReactor?: boolean;
  /** Deadlock: as its player's Active Pokémon, the opponent's Pokémon with this name can't attack (attackError). */
  deadlock?: string;
  /** Pattern Distraction: as its player's Active Pokémon, the opponent's Basic Pokémon that attacks flips; tails, the attack does nothing (attacks.ts). */
  patternDistraction?: boolean;
  /** Dual Armor (React Energy): with a card of this name attached, it's these types (refreshHideout). */
  dualArmorNamed?: { name: string; types: EnergyType[] };
  /** Reactive Colors: with a card of this name attached, it's every one of these types (refreshHideout). */
  colorsNamed?: { name: string; types: EnergyType[] };
  /** Reactive Booster: each React Energy card on its player's Pokémon with these names provides 2 Energy of every type (refreshHideout, energyPool). */
  reactiveBooster?: string[];
  /** Fellowship: it can use the attacks of its player's other Pokémon with these names in play (usableAttacks). */
  fellowship?: string[];
  /** Versatile: it can use the attacks of every Pokémon in play, either player's (usableAttacks). */
  versatile?: boolean;
  /** Delta Block: while a Stadium with Holon in its name is in play, the opponent can't play Stadium cards (trainerError). */
  deltaBlock?: boolean;
  /** Damage Bind: Pokémon with damage counters on them, both players', can't use Poké-Powers (auraStops). */
  damageBind?: boolean;
  /** Time Crystal: no Pokémon but Pokémon SP, both players', can use Poké-Bodies (auraStops). */
  timeCrystal?: boolean;
  /** Time Aura: as the Active Pokémon, the opponent can't evolve their Active Pokémon from the hand (evolveError). */
  timeAura?: boolean;
  /** Electric Barrier: no attack damage to its player's Benched Pokémon but Manectric (attacks.ts). */
  electricBarrier?: boolean;
  /** Iron Skull: its attacks' damage is changed by nothing on the Defending Pokémon but Weakness (pl1.ts). */
  ironSkull?: boolean;
  /** Lazy Paunch: it can't attack if it attacked during its player's last turn (attackError). */
  lazyPaunch?: boolean;
  /** Sinkhole (Platinum's): the opponent's Pokémon that retreats gets 2 damage counters (RETREAT). */
  sinkholeCounters?: boolean;
  /** Camouflage Pattern: nothing from an attacker with 2 or more Special Conditions (attacks.ts). */
  camouflagePattern?: boolean;
  /** Cold Feet: with a Special Condition, its attacks need no Energy (attackError). */
  coldFeet?: boolean;
  /** Armor Stone: coins until tails, 10 less damage from the opponent's attack for each heads (attacks.ts). */
  armorStone?: boolean;
  /** Thankfulness: its player's Grass Pokémon but Shaymin get 40 more HP, one however many (refreshHideout). */
  thankfulness?: boolean;
  /** Rainbow Float: its player's Pokémon of a type of a basic Energy card on it retreat for free (retreatBodies). */
  rainbowFloat?: boolean;
  /** Boundary Aura: every Weakness, both players', is ×2 (attacks.ts). */
  boundaryAura?: boolean;
  /** Unlucky Wind: as the Active Pokémon, the opponent's coins during their turn are tails (refreshHideout, flipCoin). */
  unluckyWind?: boolean;
  /** Sticky Hold: switched or retreated to the Bench, its Energy cards may move to the new Active Pokémon (stickyHold). */
  stickyHold?: boolean;
  /** Territoriality: its player's Active Pokémon damaged by the opponent's attack, 2 damage counters on the attacker (attacks.ts). */
  territoriality?: boolean;
  /** Sand Armor: with Energy of the type attached, attack damage to it is this much less (attacks.ts). */
  damageReductionWith?: { amount: number; type: EnergyType };
  /** Energy Refresh: as the Active Pokémon, an Energy card attached from the hand takes 2 damage counters off its Pokémon (energyFromHand). */
  energyRefresh?: boolean;
  /** Colorful Body: it's every type (refreshHideout). */
  colorfulBody?: boolean;
  /** Bad Sleeping Habits: while it's Asleep, the opponent's Active Pokémon can't retreat (guardedBy). */
  badSleep?: boolean;
  /** Overgrow: with 60 HP or less left, its attacks do 30 more to the Defending Pokémon (attacks.ts). */
  overgrow?: boolean;
  /** Camouflage Gas: Knocked Out while Confused, no Prize card for the opponent. */
  camouflageGas?: boolean;
  /** Water Rescue: its player's Water Pokémon (not Floatzel GL) Knocked Out by the opponent's attack may go back into the hand (resolveKnockouts). */
  waterRescue?: boolean;
  /** Frost Wind: as the Active Pokémon, 10 less attack damage to its player's Pokémon (attacks.ts). */
  frostWind?: boolean;
  /** Pump Up: 40 more HP while the opponent has 3 or fewer Prize cards left (refreshHideout). */
  pumpUp?: boolean;
  /** Gravitation: every Pokémon in play has 20 less HP, 20 however many (refreshHideout). */
  gravitation?: boolean;
  /** Root Protector: attack damage to it from the opponent's Pokémon that aren't Evolved Pokémon is this much less (attacks.ts). */
  unevolvedGuard?: number;
  /** Green Aroma: its player's Grass Pokémon have no Special Conditions and can't get any (greenAroma). */
  greenAroma?: boolean;
  /** Compound Eyes: its attacks do 30 more to the opponent's Active Pokémon with a Poké-Body (attacks.ts). */
  compoundEyes?: boolean;
  /** Erasing Sound: its player's Pokémon have no Weakness (attacks.ts). */
  erasingSound?: boolean;
  /** Marvel Eyes: with Solrock in play, nothing from the opponent's Pokémon LV.X to its player's Lunatone and Solrock (attacks.ts). */
  marvelEyes?: boolean;
  /** Focus Wall: Knocked Out by an attack doing 70 or more, it's left with 10 HP instead (attacks.ts). */
  focusWall?: boolean;
  /** Marvel Shell: nothing from the opponent's Pokémon that have a Poké-Power or Poké-Body (attacks.ts). */
  marvelShell?: boolean;
  /** Burning Spirit: attack damage to a Burned Pokémon is 40 more, 40 however many (attacks.ts). */
  burningSpirit?: boolean;
  /** Aqua Mirage: with no cards in its player's hand, no damage to it from the opponent's attacks (attacks.ts). */
  aquaMirage?: boolean;
  /** Fire Formation: its attacks do 10 more to the Defending Pokémon for each Fire Pokémon on its player's Bench (attacks.ts). */
  fireFormation?: boolean;
  /** Competitiveness: with no Supporter played this turn, its attacks do 30 more (attacks.ts). */
  competitiveness?: boolean;
  /** Cloudy Sky: 10 less attack damage to its player's Grass and Fire Pokémon (attacks.ts). */
  cloudySky?: boolean;
  /** Wild Guard: nothing from the opponent's Pokémon SP (attacks.ts). */
  wildGuard?: boolean;
  /** Keystone Seal: as the Active Pokémon, no player can play Trainer cards (trainersBlocked). */
  keystoneSeal?: boolean;
  /** Cloak Evolution: it can evolve the turn it's played (evolveError). */
  cloakEvolution?: boolean;
  /** Star Barrier: with any Energy attached, no Weakness (attacks.ts). */
  starBarrier?: boolean;
  /** Sweet Sleeping Face: while it's Asleep, no damage from attacks (attacks.ts). */
  sleepingFace?: boolean;
  /** Green Shield: its player's Grass Pokémon have no Weakness (attacks.ts). */
  greenShield?: boolean;
}

/** Wise Aura, Overpowering Fang and Intimidating Ring: an Active Pokémon's aura stopping `pokemon`'s power, or null. */
export function auraStops(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): string | null {
  const body = !!pokemonPower(pokemon)?.body;
  const d = inPlayDef(cards, pokemon);
  const owner = sides.find((s) => s.active === pokemon || s.bench.includes(pokemon));
  // Whether the aura reaches this Pokémon is checked before whether the aura works, so two auras never wait on each other.
  for (const side of sides) {
    const has = (name: string) => [side.active, ...side.bench].some((p) => !!p && namesMatch(inPlayDef(cards, p).name, name));
    for (const a of [side.active, ...side.bench]) {
      if (!a || a === pokemon) continue;
      const effect = pokemonPower(a);
      if (!effect) continue;
      const active = side.active === a;
      const reaches =
        (active && !!effect.overpoweringFang && !d.ex) ||
        (active && !!effect.wiseAura && !d.ex && !body) ||
        (active && !!effect.intimidatingRing && side !== owner && !body && d.stage === 'basic') ||
        (active && !!effect.stench && !body) ||
        (active && !!effect.intimidatingArmor && side !== owner && d.stage === 'basic') ||
        (!!effect.rearSensor && owner?.active === pokemon && !body && d.stage === 'basic' && !d.ex) ||
        (!!effect.shade && !body && !d.ex && hasType(d, effect.shade.type) && has(effect.shade.partner)) ||
        (!!effect.dualAura && body && !d.ex && pokemon.evolvedFrom.length > 0 && (has(effect.dualAura) || has(`${effect.dualAura} ex`))) ||
        (!!effect.extraLiquid && !body && !!d.ex) ||
        (!!effect.deltaReserve && !body && !isDelta(cards, pokemon) && a.energy.some((e) => !e.provides && !e.windless && lookupCard(cards, e.defId).name.startsWith('Holon Energy'))) ||
        (!!effect.damageBind && !body && pokemon.damage > 0) ||
        (!!effect.timeCrystal && body && !isPokemonSP(d.name));
      if (reaches && powerActive(a, cards, sides)) return powerOf(a, cards)!.name;
    }
  }
  return null;
}

/**
 * Whether a working power keeps `pokemon` from Special Conditions: Thick Skin (always), or Dark and Clear (with its Energy
 * attached). `effect`: its power, when working.
 */
export const conditionFree = (pokemon: InPlayPokemon, cards: CardLibrary, effect: PowerEffect | undefined) =>
  holonWith(pokemon, cards, 'GL', 'grass') ||
  !!pokemon.greenEssence || !!effect?.noConditions || (!!effect?.noConditionsWith && energyPool(pokemon, cards).some((e) => counts(e, effect.noConditionsWith!)));

/**
 * Holon Energy FF, GL, WP: `pokemon` (not a Pokémon-ex) has that Holon Energy card attached (its effect working) and a basic
 * Energy card of `type` too.
 */
export const holonWith = (pokemon: InPlayPokemon, cards: CardLibrary, holon: 'FF' | 'GL' | 'WP', type: EnergyType) =>
  !inPlayDef(cards, pokemon).ex &&
  pokemon.energy.some((e) => !e.provides && !e.windless && lookupCard(cards, e.defId).name === `Holon Energy ${holon}`) &&
  pokemon.energy.some((e) => {
    const d = lookupCard(cards, e.defId);
    return !e.provides && d.kind === 'energy' && d.basic !== false && !d.anyType && d.energyType === type;
  });

/** The Pokémon has a React Energy card attached (its effect not stopped by Miraculous Wind). */
export const hasReact = (pokemon: InPlayPokemon, cards: CardLibrary) => reactCount(pokemon, cards) > 0;
export const reactCount = (pokemon: InPlayPokemon, cards: CardLibrary) => pokemon.energy.filter((e) => !e.provides && !e.windless && lookupCard(cards, e.defId).name === 'React Energy').length;

/** Binding Aura: the opponent (`sides[1]`) has a Hypno with it working. */
export const bindingAura = (sides: Sides, cards: CardLibrary) =>
  !!sides[1] && [sides[1].active, ...sides[1].bench].some((p) => !!p && !!pokemonPower(p)?.bindingAura && powerActive(p, cards, sides));

/** Insomnia, Self-control, Carefree, Magma Armor: a working power keeps this one Special Condition off the Pokémon. */
export const conditionBarred = (effect: PowerEffect | undefined, affliction: string, pokemon?: InPlayPokemon) =>
  (affliction === 'asleep' && !!effect?.noSleep) || !!effect?.immuneTo?.includes(affliction as 'asleep' | 'confused' | 'paralyzed') || (!!pokemon?.sidneyGuard && affliction !== 'poisoned' && affliction !== 'burned' && affliction !== 'toxic');

export interface PowerContext {
  state: GameState;
  me: PlayerState;
  opp: PlayerState;
  source: InPlayPokemon;
  sourceTarget: Target;
  choices: PowerChoices;
  log: (text: string) => void;
  /** Flips a coin for the power (logged). True = heads. */
  flip: () => boolean;
  /** Asks the player to finish a choice (see PendingChoice). */
  pend: (choice: PendingChoiceInput) => void;
}

/** The player's Pokémon at a target, or null. */
export const pokemonAt = (me: Pick<PlayerState, 'active' | 'bench'>, target: Target): InPlayPokemon | null =>
  (target === 'active' ? me.active : me.bench[target]) ?? null;

/** Targets of the player's Pokémon in play, active first. */
export const ownTargets = (me: Pick<PlayerState, 'active' | 'bench'>): Target[] => [
  ...(me.active ? (['active'] as Target[]) : []),
  ...me.bench.flatMap((p, i) => (p ? [i] : [])),
];

/**
 * A Pokémon LV.X's power and its previous level's, as one (it can use both): a Poké-Body and a usable Poké-Power are as a card
 * printed with both (`usePoke`: the usable one stops as Poké-Powers do); two Poké-Bodies work together, a hook both have
 * calling each. With two usable powers only the LV.X's own is usable (no Gen 4 card yet needs both).
 */
function mergePowers(own: PowerEffect | undefined, previous: PowerEffect | undefined): PowerEffect | undefined {
  if (!own || !previous) return own ?? previous;
  if (own.use && previous.use) return own;
  const usable = own.use ? own : previous.use ? previous : null;
  if (usable) {
    const body = usable === own ? previous : own;
    const { use, blocked, choices, oncePerTurn } = usable;
    return { ...body, use, blocked, choices, oncePerTurn, usePoke: true };
  }
  const both: PowerEffect = { ...previous, ...own };
  for (const key of Object.keys(own) as (keyof PowerEffect)[]) {
    const a = own[key];
    const b = previous[key];
    if (typeof a === 'function' && typeof b === 'function') {
      (both as Record<string, unknown>)[key] = (...args: unknown[]) => (a as (...x: unknown[]) => unknown)(...args) ?? (b as (...x: unknown[]) => unknown)(...args);
    }
  }
  return both;
}

const mergedPowers = new Map<string, PowerEffect | undefined>();

/**
 * The power effect of a Pokémon in play (a Transformed Ditto's copy's): for a Pokémon LV.X, its own and its previous level's
 * together (mergePowers; `levelUpFrom`, still the card under it).
 */
export function pokemonPower(pokemon: InPlayPokemon): PowerEffect | undefined {
  const id = effectId(pokemon);
  const previous = !pokemon.transformed && pokemon.levelUpFrom && pokemon.evolvedFrom.at(-1)?.defId === pokemon.levelUpFrom ? pokemon.levelUpFrom : null;
  if (!previous) return powerEffect(id);
  const key = `${id}+${previous}`;
  if (!mergedPowers.has(key)) mergedPowers.set(key, mergePowers(powerEffect(id), powerEffect(previous)));
  return mergedPowers.get(key);
}

/** The power printed on a Pokémon in play (or copied by Ditto), if any. */
export function powerOf(pokemon: InPlayPokemon, cards: CardLibrary) {
  return inPlayDef(cards, pokemon).power ?? null;
}

export type Sides = Pick<PlayerState, 'active' | 'bench' | 'powersOffUntil' | 'bodiesOffTurn'>[];

/** Goop Gas Attack: no Pokémon Powers work (it's set on both players). */
const goopGas = (sides: Sides) => sides.some((s) => s.powersOffUntil !== undefined);
const allInPlay = (sides: Sides) => sides.flatMap((s) => [s.active, ...s.bench]).filter((p): p is InPlayPokemon => !!p);

/**
 * A Muk's Toxic Gas is working, so every other power is ignored. Copies don't count: Toxic Gas stops Ditto's Transform. Muk
 * ex's is a Poké-Body: it works only as its owner's Active Pokémon, whatever its Special Conditions, unless Ancient Wind
 * turns Poké-Bodies off.
 */
export const toxicGas = (sides: Sides) =>
  allInPlay(sides).some((p) => {
    const effect = powerEffect(p.card.defId);
    if (!effect?.toxicGas) return false;
    if (effect.body) return sides.some((s) => s.active === p) && !sides.some((s) => s.bodiesOffTurn !== undefined);
    return !hasSpecialCondition(p);
  });

/**
 * Whether the Pokémon's power is working: it has one, has no Special Condition (Poisoned and Burned included; only
 * Asleep, for Fossil's Transparency), and Toxic Gas isn't ignoring it.
 */
export function powerActive(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): boolean {
  if (!inPlayDef(cards, pokemon).power) return false;
  // Stare: switched off until it expires between turns (betweenTurns removes it). Goop Gas Attack: all of them.
  if (pokemon.powerOffUntil !== undefined || goopGas(sides)) return false;
  const effect = pokemonPower(pokemon);
  if (!effect?.ignoresConditions && (effect?.stopsOnlyWhileAsleep ? pokemon.condition === 'asleep' : hasSpecialCondition(pokemon))) return false;
  // Ferment Poison: no Poké-Bodies while it stays Poisoned.
  if (effect?.body && pokemon.effects?.fermentPoison && pokemon.poison) return false;
  // Dark Impact: its Poké-Powers (and Pokémon Powers) don't work; Poké-Bodies do. Lazy: none of its player's do.
  if (pokemon.effects?.noPokePowers !== undefined && !effect?.body) return false;
  if (lazied(pokemon, cards, sides) || auraStops(pokemon, cards, sides)) return false;
  // Stages of Evolution: only while it's an Evolved Pokémon.
  if (effect?.evolvedOnly && !pokemon.evolvedFrom.length) return false;
  // Space Center (Poké-Bodies) and Battle Frontier (both) switch off the powers of the Pokémon they name (refreshHideout).
  if (pokemon.stadiumMuted === 'all' || (pokemon.stadiumMuted === 'bodies' && effect?.body) || (pokemon.stadiumMuted === 'powers' && !effect?.body)) return false;
  // Imprison: a Pokémon with an Imprison marker can't use Poké-Powers or Poké-Bodies. Seal Off: for a turn.
  if (pokemon.imprisoned || pokemon.effects?.sealed !== undefined) return false;
  // Ancient Wind: every Poké-Body is ignored until the end of the turn.
  if (effect?.body && sides.some((s) => s.bodiesOffTurn !== undefined)) return false;
  // Scare: a Baby Pokémon's power doesn't work while the opponent's Active Dark Feraligatr's Scare does.
  if (inPlayDef(cards, pokemon).baby) {
    const owner = sides.find((s) => s.active === pokemon || s.bench.includes(pokemon));
    if (owner && scaredBy(owner, sides, cards)) return false;
  }
  return !!effect?.toxicGas || !toxicGas(sides);
}

/** Scare: the name of the power stopping `side`'s Baby Pokémon (an opponent's Active Pokémon with it working), or null. */
export function scaredBy(side: Pick<PlayerState, 'active' | 'bench'>, sides: Sides, cards: CardLibrary): string | null {
  for (const other of sides) {
    const p = other !== side ? other.active : null;
    if (p && pokemonPower(p)?.scare && powerActive(p, cards, sides)) return powerOf(p, cards)!.name;
  }
  return null;
}

/** Miraculous Wind is working: a Light Dragonite with it as the Active Pokémon. */
export const miraculousWind = (sides: Sides, cards: CardLibrary) =>
  sides.some((s) => !!s.active && !!pokemonPower(s.active)?.miraculousWind && powerActive(s.active, cards, sides));

/** Deep Sleep is working: a Dark Gengar with it, anywhere in play, or a Relicanth with it (a Poké-Body) as its player's Active Pokémon. */
export const deepSleep = (sides: Sides, cards: CardLibrary) =>
  allInPlay(sides).some((p) => {
    const effect = pokemonPower(p);
    return !!effect?.deepSleep && (!effect.body || sides.some((s) => s.active === p)) && powerActive(p, cards, sides);
  });

/** Block Dust: why `player` can't play this Trainer card (not a Supporter) now, or null. `sides`: both players'. */
export function trainersDusted(player: Sides[number], sides: Sides, cards: CardLibrary): string | null {
  const opponent = sides.find((s) => s !== player);
  const p = opponent?.active;
  return p && pokemonPower(p)?.blockDust && powerActive(p, cards, sides) ? `${powerOf(p, cards)!.name}: you can't play Trainer cards but Supporters` : null;
}

/** [Zoom]: `pokemon`, `sides[0]`'s Active Pokémon with Unown in its name, retreats for free while a benched Unown Z works. */
export function zoomed(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): boolean {
  const [owner] = sides;
  if (!owner || owner.active !== pokemon || !inPlayDef(cards, pokemon).name.includes('Unown')) return false;
  return owner.bench.some((p) => p && pokemonPower(p)?.zoom && powerActive(p, cards, sides));
}

/** Hot Plate: 10 damage (no Weakness or Resistance) to `pokemon`, just put onto `player`'s Bench from the hand, from each working Active Dark Magcargo. */
export function hotPlate(state: GameState, pokemon: InPlayPokemon, player: PlayerId) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const side of sides) {
    const p = side.active;
    if (!p || !pokemonPower(p)?.hotPlate || !powerActive(p, state.cards, sides)) continue;
    pokemon.damage += 10;
    addLog(state, `Hot Plate did 10 damage to ${inPlayDef(state.cards, pokemon).name}.`, player);
  }
}

/**
 * Conductivity: after `target` got an Energy card from its player's hand, 10 damage to it (no Weakness or Resistance) from
 * `owner`'s Dark Ampharos, while it's their only one in play and its power works.
 */
export function conductivity(state: GameState, owner: PlayerState, sides: Sides, target: InPlayPokemon) {
  const ampharos = allInPlay([owner]).filter((p) => pokemonPower(p)?.conductivity);
  const dark = allInPlay([owner]).filter((p) => inPlayDef(state.cards, p).name === 'Dark Ampharos');
  if (ampharos.length !== 1 || dark.length > 1 || !powerActive(ampharos[0]!, state.cards, sides)) return;
  target.damage += 10;
  addLog(state, `Conductivity did 10 damage to ${inPlayDef(state.cards, target).name}.`, owner.id);
}

/**
 * Conductivity (Ampharos ex): after `target` got an Energy card from its player's hand, a damage counter on it while `owner`
 * (that player's opponent) has a working Ampharos ex in play; only 1, however many they have.
 */
export function conductivityEx(state: GameState, owner: PlayerState, sides: Sides, target: InPlayPokemon) {
  const ampharos = allInPlay([owner]).find((p) => pokemonPower(p)?.conductivityEx && powerActive(p, state.cards, sides));
  if (!ampharos) return;
  target.damage += 10;
  addLog(state, `Conductivity put a damage counter on ${inPlayDef(state.cards, target).name}.`, owner.id);
}

/** Primal Veil: the power stopping Supporter cards (either Active Pokémon's, working), or null. */
export function supportersVeiled(sides: Sides, cards: CardLibrary): string | null {
  const p = sides.map((s) => s.active).find((a) => a && pokemonPower(a)?.primalVeil && powerActive(a, cards, sides));
  return p ? `${powerOf(p, cards)!.name}: no Supporter cards can be played` : null;
}

/** Primal Lock: `player`'s opponent has a working one in play, so `player` can't play Pokémon Tools (and theirs are discarded). `sides`: both players'. */
export function primalLocked(player: Sides[number], sides: Sides, cards: CardLibrary): boolean {
  const opponent = sides.find((s) => s !== player);
  return !!opponent && allInPlay([opponent]).some((p) => pokemonPower(p)?.primalLock && powerActive(p, cards, sides));
}

/** Why no Trainer cards can be played (Hay Fever, by either player), or null. */
export function trainersBlocked(sides: Sides, cards: CardLibrary): string | null {
  const p = allInPlay(sides).find((q) => (pokemonPower(q)?.noTrainers || (pokemonPower(q)?.keystoneSeal && sides.some((s) => s.active === q))) && powerActive(q, cards, sides));
  return p ? `${powerOf(p, cards)!.name}: no Trainer cards can be played` : null;
}

/** How much more the Active Pokémon of `sides[0]` costs to retreat: the opponent's Active Pokémon's Sticky Goo. */
export function stickyGoo(sides: Sides, cards: CardLibrary): number {
  const opposing = sides[1]?.active;
  return opposing && powerActive(opposing, cards, sides) ? (pokemonPower(opposing)?.stickyGoo ?? 0) : 0;
}

/**
 * After the card on top of `owner`'s Pokémon was played from their hand (evolving it, by Pokémon Breeder, or a Basic
 * onto the Bench): its power reacts if it has one that does and Toxic Gas isn't ignoring it (Summon Minions, Engage).
 */
export function playedFromHand(state: GameState, owner: PlayerState, pokemon: InPlayPokemon) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  const effect = pokemonPower(pokemon);
  // Dark Gaze: a Benched Pokémon's Poké-Power doesn't work as it's played either.
  if (effect?.onPlayFromHand && powerActive(pokemon, state.cards, sides) && !darkGazed(pokemon, state.cards, sides)) {
    addLog(state, `${powerOf(pokemon, state.cards)!.name}!`, owner.id);
    effect.onPlayFromHand(state, owner, pokemon);
  }
}

/** The power keeping the Active Pokémon of `sides[0]` from retreating (the opponent's Guard), or null. `sides`: owner first. */
export function guardedBy(sides: Sides, cards: CardLibrary): string | null {
  const opposing = sides[1]?.active;
  return opposing && (pokemonPower(opposing)?.guard || (pokemonPower(opposing)?.badSleep && opposing.condition === 'asleep')) && powerActive(opposing, cards, sides) ? powerOf(opposing, cards)!.name : null;
}

/** A working power of this kind on any Pokémon in play, either player's. */
const anyWorking = (sides: Sides, cards: CardLibrary, has: (effect: PowerEffect) => boolean | undefined) =>
  allInPlay(sides).some((p) => {
    const effect = pokemonPower(p);
    return !!effect && !!has(effect) && powerActive(p, cards, sides);
  });

/** Prehistoric Memory is working: every Evolved Pokémon can use the attacks of the cards it evolved from (as with Recall). */
export const prehistoricMemory = (sides: Sides, cards: CardLibrary) => anyWorking(sides, cards, (e) => e.prehistoricMemory);

/** Allergic Pollen is working: attacks and Pokémon Powers can't do anything with cards in discard piles. */
export const discardsLocked = (sides: Sides, cards: CardLibrary) => anyWorking(sides, cards, (e) => e.allergicPollen);

/**
 * Unown K's Keep: `owner`'s Pokémon with Unown in its name, while one of their Unown K works, can't have Energy cards
 * discarded by the opponent's attacks, Pokémon Powers or Trainer cards. `sides`: both players'.
 */
export const energyKept = (owner: Pick<PlayerState, 'active' | 'bench' | 'powersOffUntil'>, sides: Sides, cards: CardLibrary, pokemon: InPlayPokemon) =>
  inPlayDef(cards, pokemon).name.includes('Unown') && allInPlay([owner]).some((p) => pokemonPower(p)?.keep && powerActive(p, cards, sides));

/**
 * Legendary Body (agreed: every Trainer card, either player's, but Stadiums): `side`'s Active Pokémon with it working (or
 * `pokemon`, if it's that Active Pokémon) and its Energy aren't affected by Trainer cards. The power's name, or null.
 */
export function trainerProof(side: Pick<PlayerState, 'active'>, sides: Sides, cards: CardLibrary, pokemon?: InPlayPokemon | null): string | null {
  const p = pokemon === undefined ? side.active : pokemon;
  if (!p || side.active !== p) return null;
  return pokemonPower(p)?.legendaryBody && powerActive(p, cards, sides) ? `${powerOf(p, cards)!.name}: ${inPlayDef(cards, p).name} isn't affected by Trainer cards` : null;
}

/**
 * Why `energy` from `owner`'s hand can't be attached to their Pokémon `pokemon` (Anti-Lightning: a basic Energy card of its
 * type), or null. `sides`: both players'.
 */
export function attachBlocked(cards: CardLibrary, sides: Sides, pokemon: InPlayPokemon, energy: CardInstance): string | null {
  const effect = pokemonPower(pokemon);
  const d = lookupCard(cards, energy.defId);
  // Cursed Glare: the opponent's Active Cacturne ex keeps Special Energy (but Darkness and Metal) off its owner's Active Pokémon.
  const owner = sides.find((s) => s.active === pokemon);
  const glare = owner && sides.find((s) => s !== owner && s.active && pokemonPower(s.active)?.cursedGlare && powerActive(s.active, cards, sides));
  if (glare && ((d.kind === 'energy' && d.basic === false) || !!holonEnergy(d)) && !['Darkness Energy', 'Metal Energy'].includes(d.name)) return `Cursed Glare: Special Energy cards can't be attached to your Active Pokémon`;
  // Binding Aura (the other player's Hypno): nothing from the hand onto an Asleep Pokémon.
  const holder = sides.find((s) => s.active === pokemon || s.bench.includes(pokemon));
  if (pokemon.condition === 'asleep' && holder && bindingAura([holder, ...sides.filter((s) => s !== holder)], cards)) return "Binding Aura: Energy cards can't be attached to an Asleep Pokémon from your hand";
  if (!effect?.antiAttach || !powerActive(pokemon, cards, sides) || d.kind !== 'energy' || d.basic === false || d.energyType !== effect.antiAttach) return null;
  return `${inPlayDef(cards, pokemon).power!.name}: ${d.name} cards can't be attached to ${inPlayDef(cards, pokemon).name} from your hand`;
}

/**
 * How much the Poké-Bodies in play change what `pokemon` (`sides[0]`'s Active Pokémon) pays to retreat: its own
 * (Extreme Speed, Heavyweight, Lightweight, Conductive Body) and Gluey Slime anywhere in play (1 more, however many).
 */
export function retreatBodies(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): number {
  const [owner] = sides;
  if (!owner) return 0;
  const own = powerActive(pokemon, cards, sides) ? (pokemonPower(pokemon)?.retreatChange?.(pokemon, cards, owner, sides[1]) ?? 0) : 0;
  // Family Bonds: free for the Pokémon it names while its owner has it working in play.
  const name = inPlayDef(cards, pokemon).name;
  const bonded = [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.familyBonds?.some((n) => namesMatch(name, n)) && powerActive(p, cards, sides));
  // Dragon Lift: free for every Pokémon of its player's (not Pokémon-ex or Baby Pokémon).
  const d = inPlayDef(cards, pokemon);
  const lifted = !d.ex && !d.baby && [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.freeRetreatAll && powerActive(p, cards, sides));
  // Extra Wing: free for its player's Stage 2 Pokémon-ex. Flotation: free for its player's Kyogre ex while the one with it has 1 Energy or less.
  const winged = !!d.ex && d.stage === 'stage2' && [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.extraWing && powerActive(p, cards, sides));
  const floated = d.name === 'Kyogre ex' && [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.flotation && energyPool(p, cards).length <= 1 && powerActive(p, cards, sides));
  if (winged || floated) return -99;
  // Hover Lift, Jynx δ's Stages of Evolution: 1 less for each of its player's working ones naming this Pokémon or one of its types.
  const less = [owner.active, ...owner.bench].reduce((n, p) => {
    const lift = p && pokemonPower(p)?.retreatLessFor;
    const fits = lift && ((lift.names ?? []).some((name) => namesMatch(d.name, name)) || (lift.types ?? []).some((t) => hasType(d, t)));
    return n + (fits && powerActive(p!, cards, sides) ? 1 : 0);
  }, 0);
  // Reactive Lift: free for its player's Water Pokémon (not Pokémon-ex) while the Wailord has a React Energy card attached.
  const reactive = !d.ex && hasType(d, 'water') && [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.reactiveLift && hasReact(p, cards) && powerActive(p, cards, sides));
  // Upper Material: free for every Uxie, Mesprit and Azelf, both players', while either player's working Mesprit has their Uxie and Azelf in play.
  const lake = ['Uxie', 'Mesprit', 'Azelf'].some((n) => namesMatch(d.name, n)) && sides.some((side) => !!side && [side.active, ...side.bench].some((p) => !!p && !!pokemonPower(p)?.upperMaterial && powerActive(p, cards, sides)) && lakeTrio(cards, side, ['Uxie', 'Azelf']));
  if (lake) return -99;
  // Magnetize: free for its player's Active Pokémon with any Metal Energy attached.
  const magnetized = owner.active === pokemon && energyPool(pokemon, cards).some((e) => counts(e, 'metal')) && [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.magnetize && powerActive(p, cards, sides));
  // Moonlight Veil: free for its player's Pokémon that evolve from Eevee.
  const moonlit = [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.moonlightVeil && powerActive(p, cards, sides)) && evolvedFromName(cards, pokemon, 'Eevee');
  // Rainbow Float: free for its player's Pokémon of a type of a basic Energy card on a working Flygon.
  const floating = [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.rainbowFloat && powerActive(p, cards, sides) && p.energy.some((e) => !e.provides && isBasicEnergy(lookupCard(cards, e.defId)) && hasType(d, (lookupCard(cards, e.defId) as { energyType: EnergyType }).energyType)));
  if (bonded || lifted || reactive || magnetized || moonlit || floating) return -99;
  // Unown Q's QUICK: attached as a Pokémon Tool, 1 less.
  const quick = (pokemon.attached ?? []).some((a) => a.equip && lookupCard(cards, a.card.defId).name === 'Unown Q') ? 1 : 0;
  // Sticky: 1 more for each working Ariados in play, either player's, for any Pokémon but one with its name.
  const sticky = sides.reduce((n, side) => n + (side ? [side.active, ...side.bench].filter((p) => !!p && !!pokemonPower(p)?.sticky && !namesMatch(d.name, inPlayDef(cards, p).name) && powerActive(p, cards, sides)).length : 0), 0);
  // Jumbo Fin: 2 less for its player's Water Pokémon while a working Mantine has Mantyke under it.
  const jumbo = hasType(d, 'water') && [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.jumboFin && powerActive(p, cards, sides) && evolvedFromName(cards, p, 'Mantyke')) ? 2 : 0;
  // Wobbuffet's Stages of Evolution: each of the opponent's makes their Active Pokémon cost 1 more.
  const opponent = sides[1];
  const tax = owner.active === pokemon && opponent ? [opponent.active, ...opponent.bench].reduce((n, p) => n + (p && powerActive(p, cards, sides) ? (pokemonPower(p)?.retreatTax ?? 0) : 0), 0) : 0;
  return own + tax - less - quick + sticky - jumbo + (owner.active === pokemon && anyWorking(sides, cards, (e) => e.glueySlime) ? 1 : 0);
}

/** A basic Energy card of a type (Darkness Drive). */
const isBasicEnergyCard = (cards: CardLibrary, c: CardInstance, type: EnergyType) => {
  const d = lookupCard(cards, c.defId);
  return d.kind === 'energy' && d.basic !== false && d.energyType === type;
};

/** Spiral: the opponent's Active Pokémon (`sides[1]`'s) keeps `sides[0]`'s Confused Active Pokémon from retreating; its name, or null. */
export function spiraledBy(sides: Sides, cards: CardLibrary): string | null {
  const [owner, opponent] = sides;
  const opposing = opponent?.active;
  if (owner?.active?.condition !== 'confused' || !opposing || !pokemonPower(opposing)?.spiral || !powerActive(opposing, cards, sides)) return null;
  return powerOf(opposing, cards)!.name;
}

/** Enervating Pollen is working: a Pokémon with it anywhere in play. */
export const enervatingPollen = (sides: Sides, cards: CardLibrary) => anyWorking(sides, cards, (e) => e.enervatingPollen);

/**
 * Why no Evolution card can be played from the hand onto `target` (`sides[0]`'s Pokémon), or null: Primal Aura (an Active
 * Pokémon's, either player's: not onto a Benched Pokémon) and Primal Stare (the opponent's Active Pokémon's: not onto the
 * Active Pokémon).
 */
/** Time Aura: the opponent's Active Dialga with it working keeps `target`, `sides[0]`'s Active Pokémon, from evolving from the hand. */
export function timeAura(target: InPlayPokemon, sides: Sides, cards: CardLibrary): string | null {
  const [owner, ...others] = sides;
  if (!owner || owner.active !== target) return null;
  return others.some((s) => !!s.active && !!pokemonPower(s.active)?.timeAura && powerActive(s.active, cards, sides)) ? "Time Aura: you can't evolve your Active Pokémon from your hand" : null;
}

export function primalBlock(target: InPlayPokemon, sides: Sides, cards: CardLibrary): string | null {
  const [owner, ...others] = sides;
  if (!owner) return null;
  const working = (p: InPlayPokemon | null, key: 'primalAura' | 'primalStare') => !!p && !!pokemonPower(p)?.[key] && powerActive(p, cards, sides);
  if (owner.active !== target && sides.some((s) => working(s.active, 'primalAura'))) return "Primal Aura: Evolution cards can't be played onto Benched Pokémon";
  if (owner.active === target && others.some((s) => working(s.active, 'primalStare'))) return "Primal Stare: Evolution cards can't be played onto your Active Pokémon";
  return null;
}

/**
 * Lazy is stopping `pokemon`'s Poké-Power (or older Pokémon Power, agreed): the opponent's Active Pokémon has a working
 * Lazy. Poké-Bodies aren't stopped, so a Lazy is never asked about itself.
 */
export function lazied(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): boolean {
  if (pokemonPower(pokemon)?.body) return false;
  const opponent = sides.find((s) => s.active !== pokemon && !s.bench.includes(pokemon));
  return !!opponent?.active && !!pokemonPower(opponent.active)?.lazy && powerActive(opponent.active, cards, sides);
}

/** Dark Gaze is stopping the Benched Pokémon `pokemon`'s Poké-Powers: a working Dark Gaze on either Active Pokémon. */
export function darkGazed(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): boolean {
  if (sides.some((s) => s.active === pokemon) || pokemonPower(pokemon)?.body) return false;
  return sides.some((s) => !!s.active && !!pokemonPower(s.active)?.darkGaze && powerActive(s.active, cards, sides));
}

/** Why no Evolution cards can be played (Prehistoric Power), or null. */
export function evolutionBlocked(sides: Sides, cards: CardLibrary): string | null {
  const blocker = allInPlay(sides).find((p) => pokemonPower(p)?.blocksEvolution && powerActive(p, cards, sides));
  return blocker ? `${powerOf(blocker, cards)!.name}: no Evolution cards can be played` : null;
}

/** How much less the Active Pokémon's retreat costs: 1 per working Retreat Aid on its owner's Bench (`sides`: owner first). */
export function retreatAid(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): number {
  const [owner] = sides;
  if (!owner || owner.active !== pokemon) return 0;
  const old = owner.bench.filter((p) => p && pokemonPower(p)?.retreatAid && powerActive(p, cards, sides)).length;
  // EX FireRed & LeafGreen's Retreat Aid: 2 less each (agreed: they add up), not for a Pokémon-ex or Baby Pokémon.
  const d = inPlayDef(cards, pokemon);
  const more = d.ex || d.baby ? 0 : owner.bench.reduce((n, p) => n + (p && powerActive(p, cards, sides) ? (pokemonPower(p)?.retreatAidCost ?? 0) : 0), 0);
  return old + more;
}

/** Whether a working power of `viewer`'s Pokémon shows them the opponent's hand (Clairvoyance). */
export const seesOpponentHand = (viewer: Pick<PlayerState, 'active' | 'bench'>, sides: Sides, cards: CardLibrary) =>
  allInPlay([viewer]).some((p) => pokemonPower(p)?.revealsHand && powerActive(p, cards, sides));

/**
 * Ditto's Transform: an active Ditto with no Special Condition (Poisoned and Burned included), with no Toxic Gas,
 * is a copy of the Defending Pokémon (not of a Trainer played as a Pokémon, or another Ditto).
 * Run after every change to the board, so `transformed` is always current.
 */
export function refreshTransforms(state: GameState) {
  const [a, b] = state.playerOrder.map((id) => state.players[id]!) as [PlayerState, PlayerState];
  const gas = toxicGas([a, b]);
  for (const [player, opponent] of [[a, b], [b, a]] as const) {
    for (const p of player.bench) if (p) delete p.transformed;
    const ditto = player.active;
    if (!ditto) continue;
    const defender = opponent.active;
    const copy = defender && lookupCard(state.cards, defender.card.defId);
    const works = powerEffect(ditto.card.defId)?.transform && !hasSpecialCondition(ditto) && !gas;
    if (works && copy?.kind === 'pokemon' && !copy.trainerText && !powerEffect(copy.id)?.transform) ditto.transformed = copy.id;
    else delete ditto.transformed;
  }
}

/** After `energy` from `owner`'s hand is attached to their Pokémon at `target`: its power reacts, if it works (Pure Body). */
export function energyFromHand(state: GameState, owner: PlayerState, target: Target, energy: CardInstance) {
  const pokemon = pokemonAt(owner, target);
  const sides = state.playerOrder.map((id) => state.players[id]!);
  if (pokemon && powerActive(pokemon, state.cards, sides)) pokemonPower(pokemon)?.onEnergyFromHand?.(state, owner, pokemon, target, energy);
  // Energy Refresh: its player's working Active Leafeon takes 2 damage counters off the Pokémon the Energy card went to.
  if (pokemon?.damage && owner.active && pokemonPower(owner.active)?.energyRefresh && powerActive(owner.active, state.cards, sides)) {
    const healed = Math.min(20, pokemon.damage);
    pokemon.damage -= healed;
    addLog(state, `Energy Refresh removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(state, pokemon)}.`, owner.id);
  }
  // Pokémon Park: the first time each turn a player attaches an Energy card from the hand to a Benched Pokémon, 1 damage counter off it.
  if (pokemon && target !== 'active' && state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === 'Pokémon Park' && owner.parkTurn !== state.turn) {
    owner.parkTurn = state.turn;
    if (pokemon.damage >= 10) {
      pokemon.damage -= 10;
      addLog(state, `Pokémon Park removed a damage counter from ${inPlayDef(state.cards, pokemon).name}.`, owner.id);
    }
  }
  // Island Cave: an Energy card attached from the hand to a Water, Fighting or Metal Pokémon removes its Special Conditions.
  const stadium = state.stadium && lookupCard(state.cards, state.stadium.card.defId).name;
  const caved = pokemon && ['water', 'fighting', 'metal'].some((t) => hasType(inPlayDef(state.cards, pokemon), t as EnergyType));
  if (pokemon && stadium === 'Island Cave' && caved && hasSpecialCondition(pokemon)) {
    clearSpecialConditions(pokemon);
    addLog(state, `Island Cave: ${inPlayDef(state.cards, pokemon).name} is no longer affected by Special Conditions.`, owner.id);
  }
  // Conductivity: 10 damage to it, from the opponent's working Dark Ampharos.
  if (pokemon) conductivity(state, sides.find((s) => s !== owner)!, sides, pokemon);
  if (pokemon) conductivityEx(state, sides.find((s) => s !== owner)!, sides, pokemon);
}

/**
 * Chain Reaction, after a Pokémon evolves: asks the owner of the first Eevee in `queue` that can use it
 * (working power, an Eevee evolution in their deck, allowed to evolve now) whether to; the rest wait in
 * the choice. With no `queue`, every such Eevee in play is asked, the current player's first.
 */
export function offerChainReaction(state: GameState, queue?: { player: PlayerId; uid: string }[], afterAttack?: boolean) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  if (!queue) {
    const order = [state.currentPlayer, ...state.playerOrder.filter((id) => id !== state.currentPlayer)];
    queue = order.flatMap((player) => allInPlay([state.players[player]!]).filter((p) => pokemonPower(p)?.chainReaction).map((p) => ({ player, uid: p.card.uid })));
  }
  for (const [i, { player, uid }] of queue.entries()) {
    const owner = state.players[player]!;
    const target = ownTargets(owner).find((t) => pokemonAt(owner, t)!.card.uid === uid);
    const eevee = target === undefined ? null : pokemonAt(owner, target)!;
    if (!eevee || !pokemonPower(eevee)?.chainReaction || !powerActive(eevee, state.cards, sides)) continue;
    // It counts as evolving Eevee, so the usual rules apply: not on the first turns, not the turn Eevee was played.
    if (state.turn <= 2 || eevee.playedTurn === state.turn || evolutionBlocked(sides, state.cards)) continue;
    if (!owner.deck.some((c) => evolvesFromEevee(state.cards, c))) continue;
    // `afterAttack`: the evolution was an attack's (Rapid Evolution), so the turn ends once every Eevee has answered.
    state.pendingChoice = { player, source: powerOf(eevee, state.cards)!.name, kind: 'chainReaction', target: target!, next: queue.slice(i + 1), ...(afterAttack && { afterAttack }) };
    return;
  }
}

/** Why the Pokémon's power can't be used now, or null if it can (given the right choices). View-safe. */
export function powerError(s: PowerSituation): string | null {
  const source = pokemonAt(s.me, s.source);
  if (!source) return 'No Pokémon there';
  const def = inPlayDef(s.cards, source);
  const effect = pokemonPower(source);
  if (!def.power || !effect?.use) return `${def.name} has no power to use`;
  // Powers that are used all stop working while their Pokémon has a Special Condition (Poisoned and Burned too, agreed),
  // unless they say otherwise (Unown B and Y).
  if (hasSpecialCondition(source) && (!effect.ignoresConditions || effect.usePoke)) return `${def.name} is ${specialConditionLabel(source)} and can't use ${def.power.name}`;
  if (goopGas([s.me, s.opp])) return `Goop Gas Attack: Pokémon Powers don't work until the end of the turn after it was played`;
  if (toxicGas([s.me, s.opp])) return `Toxic Gas: ${def.power.name} can't be used`;
  if (source.powerOffUntil !== undefined) return `${def.power.name} doesn't work until the end of your turn (Stare)`;
  if (source.effects?.noPokePowers !== undefined && (!effect.body || effect.usePoke)) return `Dark Impact: ${def.name} can't use Poké-Powers this turn`;
  if (darkGazed(source, s.cards, [s.me, s.opp])) return "Dark Gaze: Benched Pokémon can't use Poké-Powers";
  if (lazied(source, s.cards, [s.me, s.opp])) return "Lazy: your Pokémon can't use Poké-Powers";
  const aura = auraStops(source, s.cards, [s.me, s.opp]);
  if (aura) return `${aura}: ${def.name} can't use Poké-Powers`;
  // Space Center, Battle Frontier.
  if (source.stadiumMuted === 'all' || (source.stadiumMuted === 'powers' && (!effect.body || effect.usePoke))) return `${def.name} can't use Poké-Powers now`;
  if (source.imprisoned) return `Imprison: ${def.name} can't use Poké-Powers`;
  if (source.effects?.sealed !== undefined) return `Seal Off: ${def.name} can't use Poké-Powers this turn`;
  // Shield Beam: none of the player's Pokémon can use Poké-Powers during their turn after it.
  if ((s.me.powerTurns?.['Shield Beam'] ?? -1) >= s.turn && (!effect.body || effect.usePoke)) return "Shield Beam: you can't use Poké-Powers this turn";
  if ((s.me.powerTurns?.['Psychic Lock'] ?? -1) >= s.turn && (!effect.body || effect.usePoke)) return "Psychic Lock: you can't use Poké-Powers this turn";
  // Mt. Moon: no Poké-Powers (or older Pokémon Powers) for a Pokémon with less than 70 HP.
  if (s.stadium && lookupCard(s.cards, s.stadium.defId).name === 'Mt. Moon' && !effect.body && def.hp < 70) return `Mt. Moon: ${def.name} can't use Poké-Powers`;
  const blocked = effect.blocked?.(s);
  if (blocked) return blocked;
  return effect.oncePerTurn && source.powerUsedTurn === s.turn ? `${def.name} has already used ${def.power.name} this turn` : null;
}

function choiceSpecs(s: PowerSituation, c: PowerChoices): PowerChoiceSpec[] {
  const source = pokemonAt(s.me, s.source)!;
  return pokemonPower(source)?.choices?.(s, c) ?? [];
}

/** The answer when there's nothing to decide; undefined if the player must choose. */
function autoAnswer(spec: PowerChoiceSpec, cards: CardLibrary): PowerChoices[keyof PowerChoices] | undefined {
  switch (spec.kind) {
    case 'handCard':
    case 'attachedEnergy':
    case 'discardCard':
      // The same-card rule: identical cards (e.g. two Water Energy) make no difference.
      return sameCards(cards, spec.options) ? spec.options[0]!.uid : undefined;
    case 'type':
      return undefined;
    default:
      return spec.options.length === 1 ? spec.options[0] : undefined;
  }
}

function validAnswer(spec: PowerChoiceSpec, value: unknown): boolean {
  if (spec.kind === 'handCard' || spec.kind === 'attachedEnergy' || spec.kind === 'discardCard') return spec.options.some((e) => e.uid === value);
  return (spec.options as unknown[]).includes(value);
}

/** Fills in answers that need no decision and checks the given ones (see resolveChoices for attacks). */
export function resolvePowerChoices(
  s: PowerSituation,
  given: PowerChoices,
): { choices: PowerChoices } | { error: string; need?: PowerChoiceSpec } {
  const c: PowerChoices = { ...given };
  for (let guard = 0; guard < 10; guard++) {
    const specs = choiceSpecs(s, c);
    for (const spec of specs) {
      const value = c[spec.field];
      if (value !== undefined && !validAnswer(spec, value)) return { error: `Invalid choice: ${spec.prompt.toLowerCase()}` };
    }
    const open = specs.find((spec) => c[spec.field] === undefined);
    if (!open) return { choices: c };
    if (open.options.length === 0) return { error: `${open.prompt}: nothing to choose` };
    const auto = autoAnswer(open, s.cards);
    if (auto === undefined) return { error: open.prompt, need: open };
    (c as Record<string, unknown>)[open.field] = auto;
  }
  return { error: 'Too many choices' };
}

/**
 * Whether the power puts this card from the hand into play (Rain Dance). The UI uses it to play a
 * dropped hand card through a power; powers that don't take a hand card (Energy Burn), or don't put it onto
 * a Pokémon (Matter Exchange), never match.
 */
export function powerTakesHandCard(s: PowerSituation, cardUid: string): boolean {
  if (!choiceSpecs(s, {}).some((spec) => spec.kind === 'handCard' && spec.options.some((c) => c.uid === cardUid))) return false;
  return choiceSpecs(s, { cardUid }).some((spec) => spec.field === 'to');
}

/** The next question the player has to answer for this power, or null when it's ready to use. */
export function nextPowerChoice(s: PowerSituation, given: PowerChoices): PowerChoiceSpec | null {
  const result = resolvePowerChoices(s, given);
  return 'need' in result ? (result.need ?? null) : null;
}

/** PowerSituation.counts from the players' state. */
export const situationCounts = (me: Pick<PlayerState, 'deck' | 'prizes' | 'faceUpPrizes'>, opp: Pick<PlayerState, 'deck' | 'hand' | 'prizes'>): PowerSituation['counts'] => ({
  deck: me.deck.length,
  prizes: me.prizes.length,
  faceUpPrizes: me.prizes.filter((c) => me.faceUpPrizes?.includes(c.uid)).length,
  oppDeck: opp.deck.length,
  oppHand: opp.hand.length,
  oppPrizes: opp.prizes.length,
});

/** Uses the power of the Pokémon at `source`. Mutates `state`; returns an error instead if not allowed. */
/** The player's working Pokémon with Power Cancel not yet used this turn (Alakazam), if any. */
export const powerCanceller = (state: GameState, player: PlayerState, other: PlayerState) =>
  [player.active, ...player.bench].find((p) => !!p && !!pokemonPower(p)?.powerCancel && p.powerUsedTurn !== state.turn && powerActive(p, state.cards, [player, other])) ?? null;

/** Green Aroma: `owner`'s working Venusaur keeps their Grass Pokémon `pokemon` free of Special Conditions. */
export const greenAroma = (owner: Pick<PlayerState, 'active' | 'bench'>, pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides) =>
  hasType(inPlayDef(cards, pokemon), 'grass') && [owner.active, ...owner.bench].some((p) => !!p && !!pokemonPower(p)?.greenAroma && powerActive(p, cards, sides));

/**
 * Sticky Hold: `side`'s Pokémon now on the Bench in `slot`, switched or retreated there, may move its Energy cards to the new
 * Active Pokémon, asked once whatever is under way is done.
 */
export function stickyHold(state: GameState, side: PlayerState, slot: number) {
  const p = side.bench[slot];
  const sides = state.playerOrder.map((id) => state.players[id]!);
  if (!p || !side.active || !p.energy.some((e) => !e.provides) || !pokemonPower(p)?.stickyHold || !powerActive(p, state.cards, sides)) return;
  const choice: PendingChoice = { player: side.id, source: 'Sticky Hold', kind: 'shiftEnergy', from: slot, to: 'active', any: true };
  if (state.pendingChoice) (state.queuedChoices ??= []).push(choice);
  else state.pendingChoice = choice;
}

/** The player holds Power Spray and has 3 or more Pokémon SP in play, so may play it during the opponent's turn. */
const powerSprayer = (state: GameState, player: PlayerState) =>
  !trainersLocked(player, state.turn) && player.hand.some((c) => trainerEffect(c.defId)?.powerSpray) && [player.active, ...player.bench].filter((p) => p && isPokemonSP(inPlayDef(state.cards, p).name)).length >= 3;

export function usePower(state: GameState, me: PlayerState, opp: PlayerState, sourceTarget: Target, given: PowerChoices): string | null {
  const situation: PowerSituation = { me, opp, counts: situationCounts(me, opp), source: sourceTarget, cards: state.cards, turn: state.turn, stadium: state.stadium?.card ?? null };
  const error = powerError(situation);
  if (error) return error;
  const resolved = resolvePowerChoices(situation, given);
  if ('error' in resolved) return resolved.error;
  const source = pokemonAt(me, sourceTarget)!;
  const def = inPlayDef(state.cards, source);
  const effect = pokemonPower(source)!;
  // Power Cancel: the opponent may stop a Poké-Power (not a Poké-Body) with 2 cards from their hand, before it does anything.
  if ((!effect.body || effect.usePoke) && !state.powerCancelPassed && opp.hand.length >= 2 && powerCanceller(state, opp, me)) {
    state.pendingChoice = { player: opp.id, source: 'Power Cancel', kind: 'powerCancel', target: sourceTarget, choices: resolved.choices, picked: [] };
    return null;
  }
  // Power Spray: the opponent, with 3 or more Pokémon SP in play, may play it from their hand to stop a Poké-Power.
  if ((!effect.body || effect.usePoke) && !state.powerCancelPassed && powerSprayer(state, opp)) {
    state.pendingChoice = { player: opp.id, source: 'Power Spray', kind: 'powerCancel', target: sourceTarget, choices: resolved.choices, picked: [], spray: true };
    return null;
  }
  const powerName = effect.powerName ?? def.power!.name;
  addLog(state, `${def.name} used ${powerName}.`, me.id);
  if (effect.oncePerTurn) source.powerUsedTurn = state.turn;
  // Dark Eyes (the opponent's Shiftry ex): after a Poké-Power is used, 2 damage counters on the Pokémon that used it.
  const darkEyes = (!effect.body || effect.usePoke) && [opp.active, ...opp.bench].some((p) => p && pokemonPower(p)?.darkEyes && powerActive(p, state.cards, [opp, me]));
  const uid = source.card.uid;
  effect.use!({
    state,
    me,
    opp,
    source,
    sourceTarget,
    choices: resolved.choices,
    log: (text) => addLog(state, text, me.id),
    flip: () => flipCoin(state, def.power!.name, me.id),
    pend: (choice) => {
      state.pendingChoice = { ...choice, player: me.id } as PendingChoice;
    },
  });
  // Darkness Drive: the opponent's working Tyranitar takes a basic Darkness Energy card from their discard pile.
  if (!effect.body || effect.usePoke) {
    for (const p of [opp.active, ...opp.bench]) {
      const card = p && pokemonPower(p)?.darknessDrive && powerActive(p, state.cards, [opp, me]) && !discardsLocked([me, opp], state.cards) ? opp.discard.find((c) => isBasicEnergyCard(state.cards, c, 'darkness')) : undefined;
      if (!p || !card) continue;
      opp.discard = opp.discard.filter((c) => c !== card);
      p.energy.push(card);
      addLog(state, `Darkness Drive: attached a Darkness Energy card to ${pokemonName(state, p)}.`, opp.id);
    }
  }
  // Dark Eyes: once the power has done its part (the Pokémon may have moved, or left play).
  if (darkEyes) {
    const used = [me.active, ...me.bench].find((p) => p?.card.uid === uid);
    if (used) {
      used.damage += 20;
      addLog(state, `Dark Eyes put 2 damage counters on ${pokemonName(state, used)}.`, opp.id);
    }
  }
  return null;
}
