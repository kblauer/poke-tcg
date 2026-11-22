// Safari Draft (issue #239, section 6.3): the encounters. 5 extra steps between the battles, each either the step's
// opponents and one encounter (a battle picked there is an extra one: it pays and can cost HP, but isn't one of the 15)
// or two encounters and no battle. The kinds: an upgrade to one of the player's cards, a card gift, a Trainer card gift,
// a special shop, and a legendary's board (fought for the legendary). draft.ts opens and resolves them; this file holds
// what doesn't need a run's state.
//
// The user's (2026-11-18, the issue's "Not specified yet"):
//   - the steps' shape (above), half of them with a battle;
//   - the kinds by ENCOUNTER_WEIGHTS (upgrade 3, card gift 3, special shop 2, Trainer gift 2, legendary 1), the legendary
//     at most once a run and from battle 6 (LEGENDARY_FROM);
//   - a gift is a pick of 3: a card gift's of the shop's tiers, one a partner of a card held (as the shop favours them),
//     a Trainer gift's of the Trainer cards;
//   - an upgrade is a pick of 2, each a stat boost, a keyword or Rare Candy, Rare Candy only while a held Pokémon can
//     evolve;
//   - Trainer cards come only from encounters, never the shop after a battle: from Trainer gifts and the special shop,
//     which sells 5 cards a tier above the shop's and 2 Trainer cards at ₱100 (SPECIAL_SHOP), selling as usual.
//
// Mine, placeholders to check with the user: the 5 steps come after 5 different battles of the 1st to the 14th (so never
// two in a row), each with a battle half the time; a step's two encounters are different kinds; Protein +20 attack, HP Up
// +40 HP (UPGRADES); a keyword is one of UPGRADE_KEYWORDS the Pokémon hasn't, of the generations in play, while it has fewer than 2 (MAX_KEYWORDS: the user's, 2026-11-22, 3 keywords are for a select few cards); an upgrade's Pokémon is
// picked by how many battles it has been held (as the shop's favour); a legendary's board is the legendary and 5 of its
// type at the hard tier, paying nothing but the legendary, of tier 3 or more (LEGENDARY_MIN_TIER); after an
// encounter the shop stays as it was (a new one only after a battle); an encounter, once chosen, can't be swapped for
// another (LEAVE takes nothing).
import { chance, pick, sample, weighted, type Rng } from '@poke-tcg/campaign';
import { BOARD_SIZE } from './battle.js';
import type { TrainerName } from './effects.js';
import { DIFFICULTY_TIER, MEDIUM_TIERS, arrange, mainType, rollBoard, type Opponent } from './opponents.js';
import type { Ability, Unit } from './units.js';

export type EncounterKind = 'upgrade' | 'cardGift' | 'trainerGift' | 'specialShop' | 'legendary';

export const ENCOUNTER_WEIGHTS: [EncounterKind, number][] = [['upgrade', 3], ['cardGift', 3], ['specialShop', 2], ['trainerGift', 2], ['legendary', 1]];
/** How many encounter steps a run has, after which battles (the battles fought) they can come, and how often one has a battle. */
export const ENCOUNTER_STEPS = 5;
export const ENCOUNTER_AFTER = { from: 1, to: 14 };
export const STEP_BATTLE_CHANCE = 0.5;
/** The legendary's board comes from the 6th battle (5 fought), once a run. */
export const LEGENDARY_FROM = 5;
/** The legendaries offered: units of this tier or more. */
export const LEGENDARY_MIN_TIER = 3;
/** A gift's choices, an upgrade's. */
export const GIFT_CHOICES = 3;
export const UPGRADE_CHOICES = 2;
/** The stat upgrades (mine, placeholders). */
export const UPGRADES = {
  protein: { name: 'Protein', attack: 20, hp: 0 },
  hpUp: { name: 'HP Up', attack: 0, hp: 40 },
} as const;
/** The keywords an upgrade can give (mine: ones that work on any Pokémon, wherever it stands), and how many a Pokémon can have. */
export const UPGRADE_KEYWORDS: Ability[] = [
  { k: 'Taunt' }, { k: 'Shield' }, { k: 'Armor', n: 10 }, { k: 'Thorns', n: 10 }, { k: 'Regen', n: 10 }, { k: 'Sturdy' }, { k: 'Quick' }, { k: 'Flying' },
  { k: 'Splash', n: 10 }, { k: 'Finisher', n: 20 }, { k: 'Rally', n: 10 }, { k: 'Paralyze' }, { k: 'Confuse' }, { k: 'Burn' },
];
/** An upgrade never makes a third keyword (the user's, 2026-11-22: 3 on a card is for a select few). */
export const MAX_KEYWORDS = 2;
/** The special shop: cards a tier above the shop's, Trainer cards and their price (the user's, 2026-11-18). */
export const SPECIAL_SHOP = { cards: 5, trainers: 2, trainerPrice: 100 };

/** An encounter step: after how many battles fought it comes, and whether its choices hold the battle step's opponents. */
export interface EncounterStep {
  after: number;
  battle: boolean;
}

/** An encounter offered: its kind, and the legendary's unit id for a legendary's board. */
export interface EncounterOffer {
  kind: EncounterKind;
  legendary?: string;
}

/** An upgrade offered: to the card `key` (whose unit is `unit`, for the screen). */
export type Upgrade = { kind: 'protein' | 'hpUp' | 'rareCandy'; key: number; unit: string } | { kind: 'keyword'; key: number; unit: string; ability: Ability };

/** An encounter under way. A special shop's bought cards are null. */
export type OpenEncounter =
  | { kind: 'upgrade'; upgrades: Upgrade[] }
  | { kind: 'cardGift'; cards: string[] }
  | { kind: 'trainerGift'; trainers: TrainerName[] }
  | { kind: 'specialShop'; cards: (string | null)[]; trainers: (TrainerName | null)[] };

/** A run's encounter steps, in order. */
export function rollEncounterSteps(rng: Rng): EncounterStep[] {
  const afters = Array.from({ length: ENCOUNTER_AFTER.to - ENCOUNTER_AFTER.from + 1 }, (_, i) => ENCOUNTER_AFTER.from + i);
  return sample(rng, afters, ENCOUNTER_STEPS)
    .sort((a, b) => a - b)
    .map((after) => ({ after, battle: chance(rng, STEP_BATTLE_CHANCE) }));
}

/** The legendaries a legendary's board can bring. */
export const legendaryUnits = (units: readonly Unit[], isLegendary: (u: Unit) => boolean) => units.filter((u) => isLegendary(u) && u.tier >= LEGENDARY_MIN_TIER);

/** A step's `count` encounters, of different kinds; a legendary's board only when `legendaries` has some. */
export function rollEncounterOffers(rng: Rng, count: number, legendaries: readonly Unit[]): EncounterOffer[] {
  const out: EncounterOffer[] = [];
  while (out.length < count) {
    const kinds = ENCOUNTER_WEIGHTS.filter(([kind]) => !out.some((o) => o.kind === kind) && (kind !== 'legendary' || legendaries.length));
    const kind = weighted(rng, kinds);
    out.push(kind === 'legendary' ? { kind, legendary: pick(rng, legendaries).id } : { kind });
  }
  return out;
}

/** A legendary's board: the legendary and 5 of its type at the hard tier for the battle, placed (opponents.ts's arrange), paying nothing but the legendary. */
export function legendaryOpponent(rng: Rng, units: readonly Unit[], legendary: Unit, battles: number): Opponent {
  const target = MEDIUM_TIERS[Math.min(battles, MEDIUM_TIERS.length - 1)]! + DIFFICULTY_TIER.hard;
  const rest = rollBoard(rng, units, target, (u) => u.type === legendary.type && u.id !== legendary.id, () => false).slice(0, BOARD_SIZE - 1);
  const board = arrange(rng, [legendary, ...rest]);
  return { name: legendary.name, difficulty: 'legendary', type: mainType(board), pay: 0, board: board.map((u) => u.id) };
}
