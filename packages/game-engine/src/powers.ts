// Pokémon Powers: legality, the questions a power asks, and the context power effects run with.
// Card-specific behaviour lives in effects/ (POWERS), next to the attack effects.
import type { AttackContext } from './attacks.js';
import { lookupCard, type CardLibrary, type EnergyType, type PokemonCardDef } from './cards.js';
import { powerEffect } from './effects/index.js';
import { conditionLabel, type CardInstance, type GameState, type InPlayPokemon, type PlayerId, type PlayerState, type Target } from './engine.js';
import { addLog, effectId, flipCoin, inPlayDef } from './status.js';
import { evolvesFromEevee, type PendingChoice, type PendingChoiceInput } from './trainers.js';

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
}

/** A question a power asks before it's used. */
export type PowerChoiceSpec = { prompt: string } & (
  | { kind: 'ownPokemon'; field: 'from' | 'to'; options: Target[] }
  | { kind: 'handCard'; field: 'cardUid'; options: CardInstance[] }
  | { kind: 'attachedEnergy'; field: 'energyUid'; options: CardInstance[] }
  | { kind: 'type'; field: 'type'; options: EnergyType[] }
  | { kind: 'oppPokemon'; field: 'oppFrom' | 'oppTo'; options: Target[] }
  | { kind: 'peek'; field: 'peek'; options: PeekTarget[] }
  | { kind: 'prize'; field: 'prize'; options: number[] }
  /** How many damage counters to move: the most that can go (`all`: every one there is), or 1. */
  | { kind: 'counters'; field: 'counters'; options: number[]; all: boolean }
);

/** Peek: the top card of your deck or the opponent's, a random card from their hand, or a Prize card of either player. */
export type PeekTarget = 'deck' | 'oppDeck' | 'oppHand' | 'prize' | 'oppPrize';

/** What a power can see before it's used. View-safe: the UI builds it from a PlayerView. */
export interface PowerSituation {
  me: Pick<PlayerState, 'active' | 'bench' | 'hand' | 'discard' | 'powersOffUntil' | 'quickenTurn'>;
  opp: Pick<PlayerState, 'active' | 'bench' | 'powersOffUntil'>;
  /** Sizes of the hidden piles (Peek). */
  counts: { deck: number; prizes: number; oppDeck: number; oppHand: number; oppPrizes: number };
  /** The Pokémon whose power it is. */
  source: Target;
  cards: CardLibrary;
  turn: number;
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
  /** Stops working only while Asleep, not Confused or Paralyzed (Transparency). */
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
  /** Stops working while it has any Special Condition, Poisoned and Burned included (Aurora Veil, Guard). */
  stopsOnAnyCondition?: boolean;
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
  timeTravel?: boolean;
  /** Hard Shell: attack damage of 40 or less to it (after Weakness and Resistance) is 10 instead. */
  hardShell?: boolean;
  /** Crystal Body: the opponent's attacks do nothing to it but damage. */
  crystalBody?: boolean;
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
}

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

/** The power printed on a Pokémon in play (or copied by Ditto), if any. */
export function powerOf(pokemon: InPlayPokemon, cards: CardLibrary) {
  return inPlayDef(cards, pokemon).power ?? null;
}

type Sides = Pick<PlayerState, 'active' | 'bench' | 'powersOffUntil'>[];

/** Goop Gas Attack: no Pokémon Powers work (it's set on both players). */
const goopGas = (sides: Sides) => sides.some((s) => s.powersOffUntil !== undefined);
const allInPlay = (sides: Sides) => sides.flatMap((s) => [s.active, ...s.bench]).filter((p): p is InPlayPokemon => !!p);

/** A Muk's Toxic Gas is working, so every other power is ignored. Copies don't count: Toxic Gas stops Ditto's Transform. */
export const toxicGas = (sides: Sides) => allInPlay(sides).some((p) => powerEffect(p.card.defId)?.toxicGas && !p.condition);

/**
 * Whether the Pokémon's power is working: it has one, isn't Asleep, Confused or Paralyzed (only
 * Asleep, for Transparency), and Toxic Gas isn't ignoring it.
 */
export function powerActive(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): boolean {
  if (!inPlayDef(cards, pokemon).power) return false;
  // Stare: switched off until it expires between turns (betweenTurns removes it). Goop Gas Attack: all of them.
  if (pokemon.powerOffUntil !== undefined || goopGas(sides)) return false;
  const effect = powerEffect(effectId(pokemon));
  if (!effect?.ignoresConditions && (effect?.stopsOnlyWhileAsleep ? pokemon.condition === 'asleep' : pokemon.condition)) return false;
  if (effect?.stopsOnAnyCondition && (pokemon.poison || pokemon.burned)) return false;
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
    if (p && powerEffect(effectId(p))?.scare && powerActive(p, cards, sides)) return powerOf(p, cards)!.name;
  }
  return null;
}

/** Miraculous Wind is working: a Light Dragonite with it as the Active Pokémon. */
export const miraculousWind = (sides: Sides, cards: CardLibrary) =>
  sides.some((s) => !!s.active && !!powerEffect(effectId(s.active))?.miraculousWind && powerActive(s.active, cards, sides));

/** Deep Sleep is working: a Dark Gengar with it, anywhere in play. */
export const deepSleep = (sides: Sides, cards: CardLibrary) => anyWorking(sides, cards, (e) => e.deepSleep);

/** [Zoom]: `pokemon`, `sides[0]`'s Active Pokémon with Unown in its name, retreats for free while a benched Unown Z works. */
export function zoomed(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): boolean {
  const [owner] = sides;
  if (!owner || owner.active !== pokemon || !inPlayDef(cards, pokemon).name.includes('Unown')) return false;
  return owner.bench.some((p) => p && powerEffect(effectId(p))?.zoom && powerActive(p, cards, sides));
}

/** Hot Plate: 10 damage (no Weakness or Resistance) to `pokemon`, just put onto `player`'s Bench from the hand, from each working Active Dark Magcargo. */
export function hotPlate(state: GameState, pokemon: InPlayPokemon, player: PlayerId) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  for (const side of sides) {
    const p = side.active;
    if (!p || !powerEffect(effectId(p))?.hotPlate || !powerActive(p, state.cards, sides)) continue;
    pokemon.damage += 10;
    addLog(state, `Hot Plate did 10 damage to ${inPlayDef(state.cards, pokemon).name}.`, player);
  }
}

/**
 * Conductivity: after `target` got an Energy card from its player's hand, 10 damage to it (no Weakness or Resistance) from
 * `owner`'s Dark Ampharos, while it's their only one in play and its power works.
 */
export function conductivity(state: GameState, owner: PlayerState, sides: Sides, target: InPlayPokemon) {
  const ampharos = allInPlay([owner]).filter((p) => powerEffect(effectId(p))?.conductivity);
  const dark = allInPlay([owner]).filter((p) => inPlayDef(state.cards, p).name === 'Dark Ampharos');
  if (ampharos.length !== 1 || dark.length > 1 || !powerActive(ampharos[0]!, state.cards, sides)) return;
  target.damage += 10;
  addLog(state, `Conductivity did 10 damage to ${inPlayDef(state.cards, target).name}.`, owner.id);
}

/** Why no Trainer cards can be played (Hay Fever, by either player), or null. */
export function trainersBlocked(sides: Sides, cards: CardLibrary): string | null {
  const p = allInPlay(sides).find((q) => powerEffect(effectId(q))?.noTrainers && powerActive(q, cards, sides));
  return p ? `${powerOf(p, cards)!.name}: no Trainer cards can be played` : null;
}

/** How much more the Active Pokémon of `sides[0]` costs to retreat: the opponent's Active Pokémon's Sticky Goo. */
export function stickyGoo(sides: Sides, cards: CardLibrary): number {
  const opposing = sides[1]?.active;
  return opposing && powerActive(opposing, cards, sides) ? (powerEffect(effectId(opposing))?.stickyGoo ?? 0) : 0;
}

/**
 * After the card on top of `owner`'s Pokémon was played from their hand (evolving it, by Pokémon Breeder, or a Basic
 * onto the Bench): its power reacts if it has one that does and Toxic Gas isn't ignoring it (Summon Minions, Engage).
 */
export function playedFromHand(state: GameState, owner: PlayerState, pokemon: InPlayPokemon) {
  const sides = state.playerOrder.map((id) => state.players[id]!);
  const effect = powerEffect(effectId(pokemon));
  if (effect?.onPlayFromHand && powerActive(pokemon, state.cards, sides)) {
    addLog(state, `${powerOf(pokemon, state.cards)!.name}!`, owner.id);
    effect.onPlayFromHand(state, owner, pokemon);
  }
}

/** The power keeping the Active Pokémon of `sides[0]` from retreating (the opponent's Guard), or null. `sides`: owner first. */
export function guardedBy(sides: Sides, cards: CardLibrary): string | null {
  const opposing = sides[1]?.active;
  return opposing && powerEffect(effectId(opposing))?.guard && powerActive(opposing, cards, sides) ? powerOf(opposing, cards)!.name : null;
}

/** A working power of this kind on any Pokémon in play, either player's. */
const anyWorking = (sides: Sides, cards: CardLibrary, has: (effect: PowerEffect) => boolean | undefined) =>
  allInPlay(sides).some((p) => {
    const effect = powerEffect(effectId(p));
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
  inPlayDef(cards, pokemon).name.includes('Unown') && allInPlay([owner]).some((p) => powerEffect(effectId(p))?.keep && powerActive(p, cards, sides));

/**
 * Legendary Body (agreed: every Trainer card, either player's, but Stadiums): `side`'s Active Pokémon with it working (or
 * `pokemon`, if it's that Active Pokémon) and its Energy aren't affected by Trainer cards. The power's name, or null.
 */
export function trainerProof(side: Pick<PlayerState, 'active'>, sides: Sides, cards: CardLibrary, pokemon?: InPlayPokemon | null): string | null {
  const p = pokemon === undefined ? side.active : pokemon;
  if (!p || side.active !== p) return null;
  return powerEffect(effectId(p))?.legendaryBody && powerActive(p, cards, sides) ? `${powerOf(p, cards)!.name}: ${inPlayDef(cards, p).name} isn't affected by Trainer cards` : null;
}

/** Why no Evolution cards can be played (Prehistoric Power), or null. */
export function evolutionBlocked(sides: Sides, cards: CardLibrary): string | null {
  const blocker = allInPlay(sides).find((p) => powerEffect(effectId(p))?.blocksEvolution && powerActive(p, cards, sides));
  return blocker ? `${powerOf(blocker, cards)!.name}: no Evolution cards can be played` : null;
}

/** How much less the Active Pokémon's retreat costs: 1 per working Retreat Aid on its owner's Bench (`sides`: owner first). */
export function retreatAid(pokemon: InPlayPokemon, cards: CardLibrary, sides: Sides): number {
  const [owner] = sides;
  if (!owner || owner.active !== pokemon) return 0;
  return owner.bench.filter((p) => p && powerEffect(effectId(p))?.retreatAid && powerActive(p, cards, sides)).length;
}

/** Whether a working power of `viewer`'s Pokémon shows them the opponent's hand (Clairvoyance). */
export const seesOpponentHand = (viewer: Pick<PlayerState, 'active' | 'bench'>, sides: Sides, cards: CardLibrary) =>
  allInPlay([viewer]).some((p) => powerEffect(effectId(p))?.revealsHand && powerActive(p, cards, sides));

/**
 * Ditto's Transform: an active Ditto that isn't Asleep, Confused or Paralyzed, with no Toxic Gas,
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
    const works = powerEffect(ditto.card.defId)?.transform && !ditto.condition && !gas;
    if (works && copy?.kind === 'pokemon' && !copy.trainerText && !powerEffect(copy.id)?.transform) ditto.transformed = copy.id;
    else delete ditto.transformed;
  }
}

/** After `energy` from `owner`'s hand is attached to their Pokémon at `target`: its power reacts, if it works (Pure Body). */
export function energyFromHand(state: GameState, owner: PlayerState, target: Target, energy: CardInstance) {
  const pokemon = pokemonAt(owner, target);
  const sides = state.playerOrder.map((id) => state.players[id]!);
  if (pokemon && powerActive(pokemon, state.cards, sides)) powerEffect(effectId(pokemon))?.onEnergyFromHand?.(state, owner, pokemon, target, energy);
  // Conductivity: 10 damage to it, from the opponent's working Dark Ampharos.
  if (pokemon) conductivity(state, sides.find((s) => s !== owner)!, sides, pokemon);
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
    queue = order.flatMap((player) => allInPlay([state.players[player]!]).filter((p) => powerEffect(effectId(p))?.chainReaction).map((p) => ({ player, uid: p.card.uid })));
  }
  for (const [i, { player, uid }] of queue.entries()) {
    const owner = state.players[player]!;
    const target = ownTargets(owner).find((t) => pokemonAt(owner, t)!.card.uid === uid);
    const eevee = target === undefined ? null : pokemonAt(owner, target)!;
    if (!eevee || !powerEffect(effectId(eevee))?.chainReaction || !powerActive(eevee, state.cards, sides)) continue;
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
  const effect = powerEffect(effectId(source));
  if (!def.power || !effect?.use) return `${def.name} has no power to use`;
  // Powers that are used all stop working while their Pokémon is Asleep, Confused or Paralyzed, unless they say otherwise (Unown B and Y).
  if (source.condition && !effect.ignoresConditions) return `${def.name} is ${conditionLabel(source.condition)} and can't use ${def.power.name}`;
  if (goopGas([s.me, s.opp])) return `Goop Gas Attack: Pokémon Powers don't work until the end of the turn after it was played`;
  if (toxicGas([s.me, s.opp])) return `Toxic Gas: ${def.power.name} can't be used`;
  if (source.powerOffUntil !== undefined) return `${def.power.name} doesn't work until the end of your turn (Stare)`;
  const blocked = effect.blocked?.(s);
  if (blocked) return blocked;
  return effect.oncePerTurn && source.powerUsedTurn === s.turn ? `${def.name} has already used ${def.power.name} this turn` : null;
}

function choiceSpecs(s: PowerSituation, c: PowerChoices): PowerChoiceSpec[] {
  const source = pokemonAt(s.me, s.source)!;
  return powerEffect(effectId(source))?.choices?.(s, c) ?? [];
}

/** The answer when there's nothing to decide; undefined if the player must choose. */
function autoAnswer(spec: PowerChoiceSpec): PowerChoices[keyof PowerChoices] | undefined {
  switch (spec.kind) {
    case 'handCard':
    case 'attachedEnergy':
      // Identical cards (e.g. two Water Energy) make no difference.
      return new Set(spec.options.map((e) => e.defId)).size === 1 && !spec.options.some((e) => e.provides) ? spec.options[0]!.uid : undefined;
    case 'type':
      return undefined;
    default:
      return spec.options.length === 1 ? spec.options[0] : undefined;
  }
}

function validAnswer(spec: PowerChoiceSpec, value: unknown): boolean {
  if (spec.kind === 'handCard' || spec.kind === 'attachedEnergy') return spec.options.some((e) => e.uid === value);
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
    const auto = autoAnswer(open);
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
export const situationCounts = (me: Pick<PlayerState, 'deck' | 'prizes'>, opp: Pick<PlayerState, 'deck' | 'hand' | 'prizes'>): PowerSituation['counts'] => ({
  deck: me.deck.length,
  prizes: me.prizes.length,
  oppDeck: opp.deck.length,
  oppHand: opp.hand.length,
  oppPrizes: opp.prizes.length,
});

/** Uses the power of the Pokémon at `source`. Mutates `state`; returns an error instead if not allowed. */
export function usePower(state: GameState, me: PlayerState, opp: PlayerState, sourceTarget: Target, given: PowerChoices): string | null {
  const situation: PowerSituation = { me, opp, counts: situationCounts(me, opp), source: sourceTarget, cards: state.cards, turn: state.turn };
  const error = powerError(situation);
  if (error) return error;
  const resolved = resolvePowerChoices(situation, given);
  if ('error' in resolved) return resolved.error;
  const source = pokemonAt(me, sourceTarget)!;
  const def = inPlayDef(state.cards, source);
  const effect = powerEffect(effectId(source))!;
  addLog(state, `${def.name} used ${def.power!.name}.`, me.id);
  if (effect.oncePerTurn) source.powerUsedTurn = state.turn;
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
  return null;
}
