// The Mauville Game Corner (the Extras page), as Pokémon Emerald has it (the pret/pokeemerald decompilation's
// data/maps/MauvilleCity_GameCorner/scripts.inc, data/scripts/roulette.inc and src/field_specials.c): the account's coins
// (its Coin Case, at most MAX_COINS), bought at the counter with banked ₱ at the game's prices, and played at the 2
// roulette tables (roulette.ts) and the 12 slot machines (slot-machine.ts). The games are played in the browser; the API
// settles each round (its bet and payout, checked by `coinRoundError`).

/** The Coin Case holds at most 9999 coins (constants/coins.h). */
export const MAX_COINS = 9999;

/** The counter's two offers (COINS_PRICE_50, COINS_PRICE_500): coins for ₱. */
export const COIN_OFFERS = [
  { coins: 50, price: 1000 },
  { coins: 500, price: 10000 },
] as const;

/** Why coins can't be bought (the clerk's answers), or null: the Coin Case would overflow, or the bank is short. */
export function buyCoinsError(coins: number, bank: number, offer: (typeof COIN_OFFERS)[number]): string | null {
  if (coins > MAX_COINS - offer.coins) return 'Your Coin Case is full!';
  if (bank < offer.price) return "You don't have enough money.";
  return null;
}

export type GameCornerGame = 'roulette' | 'slots';

/** The roulette tables: the left one's bet is 1 coin, the right one's 3 (sTableMinBets; 1 and 6 on a service day). */
export const ROULETTE_TABLES = 2;
export const ROULETTE_MIN_BETS = [1, 3, 1, 6] as const;
/** The most a bet can be multiplied by: a single square (a Pokémon of a colour) pays 12 times. */
export const ROULETTE_MAX_MULTIPLIER = 12;

/** The slot machines (SLOT_MACHINE_COUNT): up to 3 coins a spin (MAX_BET), each coin another line to match on. */
export const SLOT_MACHINES = 12;
export const SLOT_MAX_BET = 3;
/** The most a spin can pay: every one of the 3-coin bet's 5 lines a 7 (300 each). */
export const SLOT_MAX_PAYOUT = 5 * 300;

/** A slot machine's luck (SLOT_MACHINE_UNLUCKIEST 0 … SLOT_MACHINE_LUCKIEST 5): the machine id slot_machine.c plays with. */
export type SlotMachineId = 0 | 1 | 2 | 3 | 4 | 5;
export const SLOT_MACHINE_LUCK = ['Unluckiest', 'Unluckier', 'Unlucky', 'Lucky', 'Luckier', 'Luckiest'] as const;
const SLOT_MACHINE_RANDOM_SEEDS = [12, 2, 4, 5, 1, 8, 7, 11, 3, 10, 9, 6];
const SLOT_MACHINE_IDS: SlotMachineId[] = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 5];

/**
 * Which luck the Game Corner's machine `machine` (0-11) has on `day` (GetSlotMachineId). The game adds the machine's seed
 * to Dewford's current trend's numbers, which change now and then; here the day's number stands in for them, so each
 * machine's luck changes daily, and every account's machines are the same on the same day. (The PokéNews service day,
 * when every machine is at least Lucky, isn't there.)
 */
export function slotMachineId(machine: number, day: number): SlotMachineId {
  return SLOT_MACHINE_IDS[(day + SLOT_MACHINE_RANDOM_SEEDS[machine]!) % SLOT_MACHINES]!;
}

/** The day's number for `slotMachineId`: days since 1970 in UTC. */
export const gameCornerDay = (now: number) => Math.floor(now / 86_400_000);

/**
 * Why a round's bet and payout can't be right, or null: the roulette's bet is a table's (the whole bet lost, or paid 2,
 * 3, 4, 6 or 12 times); a spin's is 1-3 coins, or none for a free one (Reel Time's), paying at most SLOT_MAX_PAYOUT.
 */
export function coinRoundError(game: GameCornerGame, bet: number, payout: number): string | null {
  if (game === 'roulette') {
    if (!(ROULETTE_MIN_BETS as readonly number[]).includes(bet)) return 'No table takes that bet';
    if (payout && ![2, 3, 4, 6, ROULETTE_MAX_MULTIPLIER].some((m) => payout === bet * m)) return "The roulette doesn't pay that";
    return null;
  }
  if (bet < 0 || bet > SLOT_MAX_BET) return 'A slot machine takes 1 to 3 coins';
  if (payout > SLOT_MAX_PAYOUT) return "A slot machine doesn't pay that much";
  return null;
}

/** The coins after a round: its bet taken, its payout added, the Coin Case's limit kept (AddCoins stops at MAX_COINS). */
export const afterRound = (coins: number, bet: number, payout: number) => Math.min(MAX_COINS, coins - bet + payout);
