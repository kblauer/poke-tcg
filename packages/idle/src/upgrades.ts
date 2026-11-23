// The Idle Adventure's upgrade tree (issue #270, the user's, 2026-11-23): upgrades bought with the mode's own currency,
// the account's, for every run in every region. Tier 1 of each can be bought at any time; each tier unlocks the next.
// The currency is paid when a run ends (by how far it got) and a little for each species the account catches for the
// first time. Every number here (the currency's name, its payouts, the prices, the upgrades' strengths) is a
// placeholder for a balance pass: change them in UPGRADE_TUNING only.
//
// What each does (the rules read them through the helpers below; the run holds the account's tiers, IdleState.upgrades,
// set by the server on every load):
// - EXP Share → EXP All: on top of the party's half share (battle.ts's gainExp), the 2nd party Pokémon gets 75%, then all.
// - Starter slots: a new run starts with 2, then 3, Pokémon (createIdleRun takes that many choices).
// - Running Shoes → Bike: walking steps 1.1×, then 1.25× as fast (battles and towns keep their pace), the Bike ridden.
// - Itemfinder → Pickup: after a won battle, a chance of an item from the region's mart stock, cheaper ones likelier.
// - Premier Ball → Shiny Charm: the Premier Ball in every Mart (1×, always catches a shiny); shinies 3× as likely.
// - Randomized starters (the tree's first, the user's, 2026-11-23): the three starters offered at a run's start are three
//   at random from the account's starters (the screen's: the API checks any pick against the list as before).
// - Mart discount, Lucky Egg (more EXP), Amulet Coin (more prize money from a trainer's first win), Send some to Mom (a
//   share of a run's ending cash added to the next run's starting money, however it ended).

/** An upgrade's id: its line of tiers. */
export type UpgradeId = 'randomStarters' | 'expShare' | 'starters' | 'shoes' | 'itemfinder' | 'premier' | 'discount' | 'luckyEgg' | 'amuletCoin' | 'mom';

/** The account's upgrades: how many tiers of each are bought (none missing). */
export type IdleUpgrades = Partial<Record<UpgradeId, number>>;

/** Every placeholder number (the user's: one table for the balance pass). */
export const UPGRADE_TUNING = {
  /** The currency's name. */
  currency: 'Poké Miles',
  /** Paid when a run ends: for each badge, for beating the Champion, and for each area of the region reached. */
  perBadge: 10,
  champion: 50,
  perArea: 1,
  /** Paid for each species the account catches for the first time. */
  firstCatch: 5,
  /** Each tier's price, by upgrade. */
  prices: {
    randomStarters: [0],
    expShare: [100, 400],
    starters: [150, 600],
    shoes: [100, 400],
    itemfinder: [100, 400],
    premier: [150, 800],
    discount: [100, 300, 900],
    luckyEgg: [100, 300, 900],
    amuletCoin: [100, 300, 900],
    mom: [100, 300, 900],
  } satisfies Record<UpgradeId, number[]>,
  /** A party Pokémon that didn't fight's share of the EXP with EXP Share (the 2nd in the party) and EXP All (all). */
  expShare: 0.75,
  /** Walking speed with Running Shoes, then the Bike. */
  walkSpeed: [1.1, 1.25],
  /** The chance of an item after a won battle with Itemfinder, then Pickup. */
  findChance: [0.05, 0.15],
  /** How much likelier a shiny is with the Shiny Charm. */
  shinyCharm: 3,
  discount: [0.1, 0.25, 0.5],
  luckyEgg: [0.1, 0.15, 0.2],
  amuletCoin: [0.1, 0.15, 0.2],
  mom: [0.1, 0.15, 0.2],
};

/** An upgrade's tiers: their names and what each does, in order. */
export interface Upgrade {
  id: UpgradeId;
  tiers: { name: string; text: string }[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const T = UPGRADE_TUNING;

/** The tree, in the screen's order. */
export const UPGRADES: readonly Upgrade[] = [
  { id: 'randomStarters', tiers: [{ name: 'Randomized starters', text: 'The three starters offered at the start of a run are three at random from the Pokémon you can start with.' }] },
  {
    id: 'expShare',
    tiers: [
      { name: 'EXP Share', text: `The 2nd Pokémon in the party gets ${pct(T.expShare)} of the EXP when it didn't fight (the rest of the party half).` },
      { name: 'EXP All', text: `Every party Pokémon that didn't fight gets ${pct(T.expShare)} of the EXP.` },
    ],
  },
  {
    id: 'starters',
    tiers: [
      { name: 'Starter slots: 2', text: 'A new run starts with 2 Pokémon.' },
      { name: 'Starter slots: 3', text: 'A new run starts with 3 Pokémon.' },
    ],
  },
  {
    id: 'shoes',
    tiers: [
      { name: 'Running Shoes', text: `Walks ${pct(T.walkSpeed[0]! - 1)} faster.` },
      { name: 'Bike', text: `Walks ${pct(T.walkSpeed[1]! - 1)} faster.` },
    ],
  },
  {
    id: 'itemfinder',
    tiers: [
      { name: 'Itemfinder', text: `After a won battle, a ${pct(T.findChance[0]!)} chance of finding an item the region's marts sell, cheaper ones likelier.` },
      { name: 'Pickup', text: `After a won battle, a ${pct(T.findChance[1]!)} chance of finding an item.` },
    ],
  },
  {
    id: 'premier',
    tiers: [
      { name: 'Premier Ball', text: 'Every Poké Mart sells Premier Balls: a Poké Ball that always catches a shiny Pokémon.' },
      { name: 'Shiny Charm', text: `Shiny Pokémon are ${T.shinyCharm} times as likely.` },
    ],
  },
  { id: 'discount', tiers: T.discount.map((d, i) => ({ name: `Mart discount ${i + 1}`, text: `${pct(d)} off everything in a Poké Mart.` })) },
  { id: 'luckyEgg', tiers: T.luckyEgg.map((d, i) => ({ name: `Lucky Egg ${i + 1}`, text: `${pct(d)} more EXP.` })) },
  { id: 'amuletCoin', tiers: T.amuletCoin.map((d, i) => ({ name: `Amulet Coin ${i + 1}`, text: `${pct(d)} more prize money from a trainer's first win.` })) },
  { id: 'mom', tiers: T.mom.map((d, i) => ({ name: `Send some to Mom ${i + 1}`, text: `${pct(d)} of a run's money when it ends goes to the next run's starting money.` })) },
];

/** An upgrade by id. */
export const upgradeOf = (id: UpgradeId) => UPGRADES.find((u) => u.id === id)!;

/** How many tiers of an upgrade the account has (0 to its tiers). */
export const tierOf = (upgrades: IdleUpgrades | undefined, id: UpgradeId) => Math.max(0, Math.min(Math.floor(upgrades?.[id] ?? 0), upgradeOf(id).tiers.length));

/** Every upgrade's id, in the tree's order. */
export const UPGRADE_IDS: readonly UpgradeId[] = UPGRADES.map((u) => u.id);

/**
 * The upgrades in effect (the user's, 2026-11-23: a bought tier can be switched off, and on again for free): each one's
 * tiers bought, but no more than the level the player switched it to (IdleSettings.upgradeLevels; none set, all of them).
 */
export function activeUpgrades(owned: IdleUpgrades | undefined, levels: IdleUpgrades | undefined): IdleUpgrades {
  const out: IdleUpgrades = {};
  for (const id of UPGRADE_IDS) {
    const tier = Math.min(tierOf(owned, id), levels?.[id] === undefined ? Infinity : tierOf(levels, id));
    if (tier > 0) out[id] = tier;
  }
  return out;
}

/** The level a bought tier's click switches an upgrade to (tier `i`, from 0): on, it and the tiers after it off; off, on up to it. */
export const toggledLevel = (active: IdleUpgrades | undefined, id: UpgradeId, i: number) => (tierOf(active, id) > i ? i : i + 1);

/** The next tier's price, or null when every tier is bought. */
export const nextPrice = (upgrades: IdleUpgrades | undefined, id: UpgradeId): number | null => UPGRADE_TUNING.prices[id][tierOf(upgrades, id)] ?? null;

/** Buying an upgrade's next tier with `balance`: the upgrades after it and its price, or why it can't be bought. */
export function buyUpgrade(upgrades: IdleUpgrades, id: UpgradeId, balance: number): { upgrades: IdleUpgrades; price: number } | { error: string } {
  const price = nextPrice(upgrades, id);
  if (price === null) return { error: 'Every tier is bought' };
  if (balance < price) return { error: `Not enough ${UPGRADE_TUNING.currency}` };
  return { upgrades: { ...upgrades, [id]: tierOf(upgrades, id) + 1 }, price };
}

/** The share of the EXP a party Pokémon that didn't fight gets, by its place in the party (0 the lead): half, or EXP Share's. */
export function restShare(upgrades: IdleUpgrades | undefined, index: number): number {
  const tier = tierOf(upgrades, 'expShare');
  return tier >= 2 || (tier === 1 && index === 1) ? UPGRADE_TUNING.expShare : 0.5;
}

/** Whether the starters offered at a run's start are random ones (Randomized starters). */
export const randomStarters = (upgrades: IdleUpgrades | undefined) => tierOf(upgrades, 'randomStarters') >= 1;

/** `count` of the starters at random (all of them when there are no more), in a random order. */
export function sampleStarters(options: readonly number[], count = 3, random: () => number = Math.random): number[] {
  const pool = [...options];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

/** How many Pokémon a new run starts with. */
export const starterSlots = (upgrades: IdleUpgrades | undefined) => 1 + tierOf(upgrades, 'starters');

/** How fast the run walks (1, or the shoes' or Bike's). */
export const walkSpeed = (upgrades: IdleUpgrades | undefined) => [1, ...UPGRADE_TUNING.walkSpeed][tierOf(upgrades, 'shoes')]!;

/** The chance of finding an item after a won battle (0 without Itemfinder). */
export const findChance = (upgrades: IdleUpgrades | undefined) => [0, ...UPGRADE_TUNING.findChance][tierOf(upgrades, 'itemfinder')]!;

/** Whether every Mart sells the Premier Ball. */
export const premierBalls = (upgrades: IdleUpgrades | undefined) => tierOf(upgrades, 'premier') >= 1;

/** How much likelier a shiny is (the Shiny Charm's, else 1). */
export const shinyFactor = (upgrades: IdleUpgrades | undefined) => (tierOf(upgrades, 'premier') >= 2 ? UPGRADE_TUNING.shinyCharm : 1);

/** A Mart price after the discount (rounded up, at least 1). */
export const discounted = (upgrades: IdleUpgrades | undefined, price: number) => Math.max(1, Math.ceil(price * (1 - ([0, ...UPGRADE_TUNING.discount][tierOf(upgrades, 'discount')] ?? 0))));

/** The Lucky Egg's EXP bonus (0.1 for 10% more). */
export const expBonus = (upgrades: IdleUpgrades | undefined) => [0, ...UPGRADE_TUNING.luckyEgg][tierOf(upgrades, 'luckyEgg')]!;

/** A trainer's first-win prize with the Amulet Coin (rounded down). */
export const amuletPrize = (upgrades: IdleUpgrades | undefined, prize: number) => Math.floor(prize * (1 + [0, ...UPGRADE_TUNING.amuletCoin][tierOf(upgrades, 'amuletCoin')]!));

/** The money Mom keeps for the next run from a run's ending money. */
export const momShare = (upgrades: IdleUpgrades | undefined, money: number) => Math.floor(Math.max(0, money) * [0, ...UPGRADE_TUNING.mom][tierOf(upgrades, 'mom')]!);

/** The currency a run earns when it ends: by its badges, the Champion beaten, and the areas of its region reached. */
export const runEndMiles = (run: { badges: readonly string[]; reached: number; won: boolean }) => run.badges.length * UPGRADE_TUNING.perBadge + (run.won ? UPGRADE_TUNING.champion : 0) + Math.max(0, run.reached) * UPGRADE_TUNING.perArea;
