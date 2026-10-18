// The account's items: what each one is and does, where it can be equipped, and the limits on using them.
// Equipment works while it's equipped (read live, so a change applies from the next encounter); a consumable
// works for a number of battles once used; a misc item does its one thing when used (see USE_ITEM in run.ts).
import type { BattleRule, EnergyType, PlayerId } from '@poke-tcg/game-engine';

export type ItemCategory = 'consumable' | 'misc' | 'key' | 'equipment';

/** Where a piece of equipment goes. Accessories fit either accessory slot. */
export type EquipType = 'head' | 'chest' | 'legs' | 'pokeball' | 'accessory';
export const EQUIP_SLOTS = ['head', 'chest', 'legs', 'pokeball', 'accessory1', 'accessory2'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const SLOT_LABELS: Record<EquipSlot, string> = {
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  pokeball: 'Poké Ball',
  accessory1: 'Accessory',
  accessory2: 'Accessory',
};

type Condition = 'asleep' | 'confused' | 'paralyzed' | 'poisoned' | 'burned';

/**
 * What equipment and consumables do. The first five work in battles (as the player's battle rules, see
 * BattleRule); the rest in the run. Effects of the same kind add up.
 */
export type ItemEffect =
  /** The player's attacks (by Pokémon of `type`, if given) do `amount` more damage. */
  | { kind: 'damage'; amount: number; type?: EnergyType }
  /** Attacks do `amount` less damage to the player's Pokémon (of `type`, if given). */
  | { kind: 'guard'; amount: number; type?: EnergyType }
  /** The opponent's attacks can't give the player's Pokémon these conditions. */
  | { kind: 'conditions'; conditions: Condition[] }
  /** More cards in the opening hand. */
  | { kind: 'openingHand'; cards: number }
  /** The player's first `flips` coin flips in a battle are heads. */
  | { kind: 'luckyFlips'; flips: number }
  /** ₱ for each battle won, on top of the prize. */
  | { kind: 'winPokedollars'; amount: number }
  /** More ₱ and EXP from battles won, in percent. */
  | { kind: 'pokedollarBonus'; percent: number }
  | { kind: 'expBonus'; percent: number }
  /** Lower prices, in percent. */
  | { kind: 'centerDiscount'; percent: number }
  | { kind: 'shopDiscount'; percent: number }
  /** More cards to pick from (gifts, battle rewards) or for sale (shops). */
  | { kind: 'moreOffers'; encounter: 'gift' | 'reward' | 'shop'; count: number };

/** What a misc item does when it's used. */
export type ItemUse =
  /** Leave the battle under way (or about to start) without losing HP. A boss or Gym Trainer stays to be fought again. */
  | { kind: 'escape' }
  /** Show what this step's Mystery encounters are. */
  | { kind: 'reveal' }
  /** Re-roll this step's encounters (not a gym's or a boss's). */
  | { kind: 'reroll' }
  | { kind: 'heal'; hp: number }
  | { kind: 'pokedollars'; amount: number };

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  /** Flavour, or for misc and key items what they are. */
  description: string;
  /** Price in the post-run shop, in EXP. Missing = not sold there. */
  price?: number;
  /** Consumables: how many battles the effects last. */
  battles?: number;
  /** Misc items: what using it does. */
  use?: ItemUse;
  /** Misc items: used up when used. */
  consumedOnUse?: boolean;
  /** Misc items: how many times it can be used in one run. Missing = no limit. */
  perRun?: number;
  /** Equipment: the slot it goes in. */
  equip?: EquipType;
  /** Equipment and consumables: what they do. */
  effects?: ItemEffect[];
}

/** Consumables used per run, at most. */
export const MAX_CONSUMABLES_PER_RUN = 3;

const ALL_CONDITIONS: Condition[] = ['asleep', 'confused', 'paralyzed', 'poisoned', 'burned'];

/** A type's "+10 damage" accessory. */
const typeBooster = (id: string, name: string, type: EnergyType, description: string): ItemDef => ({
  id,
  name,
  category: 'equipment',
  equip: 'accessory',
  price: 160,
  effects: [{ kind: 'damage', amount: 10, type }],
  description,
});

/** Every item there is. Prices are first guesses, to balance later. */
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  (
    [
      // Consumables
      { id: 'x-attack', name: 'X Attack', category: 'consumable', price: 40, battles: 1, effects: [{ kind: 'damage', amount: 10 }], description: 'Sharpens your attacks.' },
      { id: 'dire-hit', name: 'Dire Hit', category: 'consumable', price: 80, battles: 1, effects: [{ kind: 'damage', amount: 20 }], description: 'Hits where it hurts.' },
      { id: 'x-defend', name: 'X Defend', category: 'consumable', price: 40, battles: 1, effects: [{ kind: 'guard', amount: 10 }], description: 'Toughens your Pokémon up.' },
      { id: 'x-accuracy', name: 'X Accuracy', category: 'consumable', price: 60, battles: 1, effects: [{ kind: 'luckyFlips', flips: 2 }], description: 'Luck is on your side.' },
      { id: 'guard-spec', name: 'Guard Spec.', category: 'consumable', price: 60, battles: 2, effects: [{ kind: 'conditions', conditions: ['confused'] }], description: 'Keeps a clear head.' },
      { id: 'antidote', name: 'Antidote', category: 'consumable', price: 40, battles: 3, effects: [{ kind: 'conditions', conditions: ['poisoned'] }], description: 'A spray against poison.' },
      { id: 'awakening', name: 'Awakening', category: 'consumable', price: 40, battles: 3, effects: [{ kind: 'conditions', conditions: ['asleep'] }], description: 'A spray against sleep.' },
      { id: 'paralyze-heal', name: 'Paralyze Heal', category: 'consumable', price: 40, battles: 3, effects: [{ kind: 'conditions', conditions: ['paralyzed'] }], description: 'A spray against paralysis.' },
      { id: 'burn-heal', name: 'Burn Heal', category: 'consumable', price: 30, battles: 3, effects: [{ kind: 'conditions', conditions: ['burned'] }], description: 'A spray against burns.' },
      { id: 'full-heal', name: 'Full Heal', category: 'consumable', price: 90, battles: 1, effects: [{ kind: 'conditions', conditions: ALL_CONDITIONS }], description: 'A spray against everything.' },
      { id: 'lemonade', name: 'Lemonade', category: 'consumable', price: 50, battles: 2, effects: [{ kind: 'openingHand', cards: 1 }], description: 'A fizzy pick-me-up for a quick start.' },
      { id: 'lucky-egg', name: 'Lucky Egg', category: 'consumable', price: 80, battles: 3, effects: [{ kind: 'expBonus', percent: 100 }], description: 'An egg full of happiness.' },
      { id: 'big-pearl', name: 'Big Pearl', category: 'consumable', price: 50, battles: 3, effects: [{ kind: 'pokedollarBonus', percent: 50 }], description: 'Shows off how well you are doing.' },
      // Misc items
      { id: 'escape-rope', name: 'Escape Rope', category: 'misc', price: 50, use: { kind: 'escape' }, consumedOnUse: true, perRun: 1, description: "Leave a battle without losing HP (a gym's or a boss's stays to be fought again). Used up, and once per run." },
      { id: 'itemfinder', name: 'Itemfinder', category: 'misc', price: 120, use: { kind: 'reveal' }, perRun: 2, description: 'Reveal what the Mystery encounters on offer are before you choose. Twice per run.' },
      { id: 'repel', name: 'Repel', category: 'misc', price: 40, use: { kind: 'reroll' }, consumedOnUse: true, perRun: 2, description: "Re-roll the encounters on offer (not at a gym or a boss). Used up, and twice per run." },
      { id: 'potion', name: 'Potion', category: 'misc', price: 100, use: { kind: 'heal', hp: 1 }, consumedOnUse: true, perRun: 1, description: 'Heal 1 HP. Used up, and once per run.' },
      { id: 'nugget', name: 'Nugget', category: 'misc', price: 60, use: { kind: 'pokedollars', amount: 300 }, consumedOnUse: true, description: 'Sell it for ₱300 to spend in the run. Used up.' },
      // Key items (records; not sold, can't be removed)
      { id: 'boulder-badge', name: 'Boulder Badge', category: 'key', description: 'Proof of beating Pewter Gym Leader Brock.' },
      { id: 'cascade-badge', name: 'Cascade Badge', category: 'key', description: 'Proof of beating Cerulean Gym Leader Misty.' },
      { id: 'thunder-badge', name: 'Thunder Badge', category: 'key', description: 'Proof of beating Vermilion Gym Leader Lt. Surge.' },
      { id: 'rainbow-badge', name: 'Rainbow Badge', category: 'key', description: 'Proof of beating Celadon Gym Leader Erika.' },
      { id: 'soul-badge', name: 'Soul Badge', category: 'key', description: 'Proof of beating Fuchsia Gym Leader Koga.' },
      { id: 'marsh-badge', name: 'Marsh Badge', category: 'key', description: 'Proof of beating Saffron Gym Leader Sabrina.' },
      { id: 'volcano-badge', name: 'Volcano Badge', category: 'key', description: 'Proof of beating Cinnabar Gym Leader Blaine.' },
      { id: 'earth-badge', name: 'Earth Badge', category: 'key', description: 'Proof of beating Viridian Gym Leader Giovanni.' },
      { id: 'champion-ribbon', name: 'Champion Ribbon', category: 'key', description: 'Proof of beating the Elite Four and Champion Blue.' },
      { id: 'town-map', name: 'Town Map', category: 'key', description: 'Shows where your runs have taken you.' },
      // Equipment: head
      { id: 'trainer-cap', name: "Trainer's Cap", category: 'equipment', equip: 'head', price: 100, effects: [{ kind: 'winPokedollars', amount: 20 }], description: 'A well-worn cap.' },
      { id: 'ace-visor', name: 'Ace Visor', category: 'equipment', equip: 'head', price: 180, effects: [{ kind: 'expBonus', percent: 25 }], description: 'Worn by Ace Trainers who study every battle.' },
      { id: 'safari-hat', name: 'Safari Hat', category: 'equipment', equip: 'head', price: 200, effects: [{ kind: 'moreOffers', encounter: 'reward', count: 1 }], description: 'For finding rare things.' },
      // Chest
      { id: 'leaf-jacket', name: 'Leaf Jacket', category: 'equipment', equip: 'chest', price: 150, effects: [{ kind: 'guard', amount: 10, type: 'grass' }], description: 'Woven from Celadon flowers.' },
      { id: 'wetsuit', name: 'Wetsuit', category: 'equipment', equip: 'chest', price: 150, effects: [{ kind: 'guard', amount: 10, type: 'water' }], description: 'Borrowed from a Cerulean swimmer.' },
      { id: 'flame-vest', name: 'Flame Vest', category: 'equipment', equip: 'chest', price: 150, effects: [{ kind: 'guard', amount: 10, type: 'fire' }], description: 'Made for the Cinnabar volcano.' },
      { id: 'rubber-coat', name: 'Rubber Coat', category: 'equipment', equip: 'chest', price: 150, effects: [{ kind: 'guard', amount: 10, type: 'lightning' }], description: 'Standard issue at the Power Plant.' },
      { id: 'padded-vest', name: 'Padded Vest', category: 'equipment', equip: 'chest', price: 300, effects: [{ kind: 'guard', amount: 10 }], description: 'Heavy, but it takes a hit.' },
      // Legs
      { id: 'hiking-pants', name: 'Hiking Pants', category: 'equipment', equip: 'legs', price: 120, effects: [{ kind: 'centerDiscount', percent: 25 }], description: 'Sturdy pants for long routes.' },
      { id: 'running-shoes', name: 'Running Shoes', category: 'equipment', equip: 'legs', price: 150, effects: [{ kind: 'shopDiscount', percent: 20 }], description: 'First to the shop for the sales.' },
      { id: 'cycling-shorts', name: 'Cycling Shorts', category: 'equipment', equip: 'legs', price: 140, effects: [{ kind: 'moreOffers', encounter: 'gift', count: 1 }], description: 'Cover more ground on Cycling Road.' },
      // Poké Balls
      { id: 'poke-ball', name: 'Poké Ball', category: 'equipment', equip: 'pokeball', price: 120, effects: [{ kind: 'openingHand', cards: 1 }], description: 'A good start.' },
      { id: 'great-ball', name: 'Great Ball', category: 'equipment', equip: 'pokeball', price: 200, effects: [{ kind: 'openingHand', cards: 1 }, { kind: 'moreOffers', encounter: 'gift', count: 1 }], description: 'A better ball for a better start.' },
      { id: 'ultra-ball', name: 'Ultra Ball', category: 'equipment', equip: 'pokeball', price: 300, effects: [{ kind: 'openingHand', cards: 1 }, { kind: 'moreOffers', encounter: 'gift', count: 1 }, { kind: 'moreOffers', encounter: 'reward', count: 1 }], description: 'A high-performance ball.' },
      { id: 'master-ball', name: 'Master Ball', category: 'equipment', equip: 'pokeball', price: 500, effects: [{ kind: 'openingHand', cards: 2 }, { kind: 'moreOffers', encounter: 'gift', count: 1 }, { kind: 'moreOffers', encounter: 'reward', count: 1 }], description: 'The best ball there is.' },
      // Accessories
      { id: 'amulet-coin', name: 'Amulet Coin', category: 'equipment', equip: 'accessory', price: 180, effects: [{ kind: 'pokedollarBonus', percent: 25 }], description: 'A charm for prize money.' },
      { id: 'exp-share', name: 'Exp. Share', category: 'equipment', equip: 'accessory', price: 180, effects: [{ kind: 'expBonus', percent: 25 }], description: 'Learn from every battle.' },
      { id: 'coin-case', name: 'Coin Case', category: 'equipment', equip: 'accessory', price: 150, effects: [{ kind: 'luckyFlips', flips: 1 }], description: 'Holds a lucky coin.' },
      typeBooster('silk-scarf', 'Silk Scarf', 'colorless', 'A smooth scarf.'),
      typeBooster('charcoal', 'Charcoal', 'fire', 'Still warm.'),
      typeBooster('mystic-water', 'Mystic Water', 'water', 'A teardrop-shaped gem.'),
      typeBooster('miracle-seed', 'Miracle Seed', 'grass', 'A seed full of life.'),
      typeBooster('magnet', 'Magnet', 'lightning', 'It crackles.'),
      typeBooster('twisted-spoon', 'Twisted Spoon', 'psychic', 'Bent by the power of the mind.'),
      typeBooster('black-belt', 'Black Belt', 'fighting', 'Tied tight for a fight.'),
    ] satisfies ItemDef[]
  ).map((item) => [item.id, item]),
);

export const item = (id: string): ItemDef => {
  const def = ITEMS[id];
  if (!def) throw new Error(`Unknown item: ${id}`);
  return def;
};

/** Items the post-run shop sells, cheapest first. */
export const SHOP_ITEMS = Object.values(ITEMS)
  .filter((i) => i.price !== undefined)
  .sort((a, b) => a.price! - b.price!);

/** Whether the account may have only one (equipment and misc items): the shop won't sell another while it has one. */
export const onlyOne = (def: ItemDef) => def.category === 'equipment' || def.category === 'misc';

/** Whether a piece of equipment can go in the slot. */
export const fitsSlot = (def: ItemDef, slot: EquipSlot) => def.category === 'equipment' && (def.equip === 'accessory' ? slot.startsWith('accessory') : def.equip === slot);

const typeName = (t: string) => t[0]!.toUpperCase() + t.slice(1);
const CONDITION_NAMES: Record<Condition, string> = { asleep: 'Asleep', confused: 'Confused', paralyzed: 'Paralyzed', poisoned: 'Poisoned', burned: 'Burned' };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const orList = (words: string[]) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words.at(-1)}` : words[0]!);

/** What an effect does, for the screen. */
export function effectText(effect: ItemEffect): string {
  switch (effect.kind) {
    case 'damage':
      return `${effect.type ? `Your ${typeName(effect.type)} Pokémon's attacks` : 'Your attacks'} do ${effect.amount} more damage`;
    case 'guard':
      return `Your ${effect.type ? `${typeName(effect.type)} ` : ''}Pokémon take ${effect.amount} less damage from attacks`;
    case 'conditions':
      return effect.conditions.length === ALL_CONDITIONS.length
        ? "Your Pokémon can't get Special Conditions from attacks"
        : `Your Pokémon can't be ${orList(effect.conditions.map((c) => CONDITION_NAMES[c]))} by attacks`;
    case 'openingHand':
      return `Draw ${effect.cards} more card${effect.cards === 1 ? '' : 's'} in your opening hand`;
    case 'luckyFlips':
      return effect.flips === 1 ? 'Your first coin flip in a battle is heads' : `Your first ${effect.flips} coin flips in a battle are heads`;
    case 'winPokedollars':
      return `+₱${effect.amount} for each battle won`;
    case 'pokedollarBonus':
      return `+${effect.percent}% ₱ from battles won`;
    case 'expBonus':
      return effect.percent === 100 ? 'Double EXP from battles won' : `+${effect.percent}% EXP from battles won`;
    case 'centerDiscount':
      return `Pokémon Centers cost ${effect.percent}% less`;
    case 'shopDiscount':
      return `Card Shop prices are ${effect.percent}% lower`;
    case 'moreOffers':
      return effect.encounter === 'shop' ? `Card Shops stock ${plural(effect.count, 'more card')}` : `${effect.encounter === 'gift' ? 'Free Cards offer' : 'Battle rewards offer'} ${plural(effect.count, 'more card')} to pick from`;
  }
}

/** What an item does, in a sentence or two. */
export function itemText(def: ItemDef): string {
  const effects = (def.effects ?? []).map(effectText);
  if (def.category === 'consumable') return `${effects.join('; ')} for ${def.battles === 1 ? 'a battle' : `${def.battles} battles`}.`;
  if (def.category === 'equipment') return `${effects.join('. ')}.`;
  return def.description;
}

/** An effect in force in a run, and the item it's from. */
export interface ActiveEffect {
  effect: ItemEffect;
  source: string;
}

/** The effects of equipped items (`gear`, item ids) and of the consumables in effect. */
export function activeEffects(gear: readonly string[], consumables: readonly { itemId: string }[]): ActiveEffect[] {
  return [...gear.filter((id) => ITEMS[id]?.category === 'equipment'), ...consumables.map((c) => c.itemId)].flatMap((id) =>
    (ITEMS[id]?.effects ?? []).map((effect) => ({ effect, source: ITEMS[id]!.name })),
  );
}

/** Adds up `value` over the effects in force (it gives 0 for the ones it doesn't count). */
export const effectTotal = (effects: readonly ActiveEffect[], value: (effect: ItemEffect) => number) => effects.reduce((n, { effect }) => n + value(effect), 0);

/** The battle effects as `player`'s battle rules, each named for its item. */
export function battleRules(effects: readonly ActiveEffect[], player: PlayerId): BattleRule[] {
  return effects.flatMap(({ effect, source }): BattleRule[] => {
    const label = source;
    switch (effect.kind) {
      case 'damage':
        return [{ kind: 'damageBonus', player, amount: effect.amount, ...(effect.type && { type: effect.type }), label }];
      case 'guard':
        return [{ kind: 'damageGuard', player, amount: effect.amount, ...(effect.type && { type: effect.type }), label }];
      case 'conditions':
        return [{ kind: 'conditionGuard', player, conditions: effect.conditions, label }];
      case 'openingHand':
        return [{ kind: 'openingHand', player, cards: effect.cards, label }];
      case 'luckyFlips':
        return [{ kind: 'luckyFlips', player, flips: effect.flips, label }];
      default:
        return [];
    }
  });
}
