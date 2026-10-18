// The account's items: what each one is, where it can be equipped, and the limits on using them.
// Effects aren't implemented yet: `effects` and `description` say what they will do.

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

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  /** Price in the post-run shop, in EXP. Missing = not sold there. */
  price?: number;
  /** Consumables: how many battles the effect lasts. */
  battles?: number;
  /** Misc items: used up when used. */
  consumedOnUse?: boolean;
  /** Misc items: how many times it can be used in one run. Missing = no limit. */
  perRun?: number;
  /** Equipment: the slot it goes in, and its effects (one or more). */
  equip?: EquipType;
  effects?: string[];
}

/** Consumables used per run, at most. */
export const MAX_CONSUMABLES_PER_RUN = 3;

/** Every item there is. Placeholders for now: none of them does anything yet. */
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  (
    [
      // Consumables
      { id: 'x-attack', name: 'X Attack', category: 'consumable', price: 40, battles: 1, description: 'Your attacks do 10 more damage for 1 battle.' },
      { id: 'x-defend', name: 'X Defend', category: 'consumable', price: 40, battles: 1, description: 'Attacks do 10 less damage to your Pokémon for 1 battle.' },
      { id: 'guard-spec', name: 'Guard Spec.', category: 'consumable', price: 60, battles: 2, description: "Your Active Pokémon can't be Confused for 2 battles." },
      { id: 'lucky-egg', name: 'Lucky Egg', category: 'consumable', price: 80, battles: 3, description: 'Win double EXP from your next 3 battles.' },
      // Misc items
      { id: 'escape-rope', name: 'Escape Rope', category: 'misc', price: 50, consumedOnUse: true, perRun: 1, description: 'Leave a battle without losing HP. Used up, and once per run.' },
      { id: 'itemfinder', name: 'Itemfinder', category: 'misc', price: 120, perRun: 2, description: 'Reveal what a Mystery encounter is before you choose it. Twice per run.' },
      { id: 'coin-case', name: 'Coin Case', category: 'misc', price: 150, description: 'Re-flip one coin per battle. Never used up.' },
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
      // Equipment
      { id: 'trainer-cap', name: "Trainer's Cap", category: 'equipment', equip: 'head', price: 100, effects: ['+20 ₱ after each battle won'], description: 'A well-worn cap.' },
      { id: 'leaf-jacket', name: 'Leaf Jacket', category: 'equipment', equip: 'chest', price: 150, effects: ['Grass Pokémon get +10 HP'], description: 'Woven from Celadon flowers.' },
      { id: 'hiking-pants', name: 'Hiking Pants', category: 'equipment', equip: 'legs', price: 120, effects: ['Pokémon Centers cost 25% less'], description: 'Sturdy pants for long routes.' },
      { id: 'great-ball', name: 'Great Ball', category: 'equipment', equip: 'pokeball', price: 200, effects: ['Draw 1 extra card in your opening hand', 'Gift encounters offer 4 cards'], description: 'A better ball for a better start.' },
      { id: 'amulet-coin', name: 'Amulet Coin', category: 'equipment', equip: 'accessory', price: 180, effects: ['+25% ₱ from battles'], description: 'A charm for prize money.' },
      { id: 'silk-scarf', name: 'Silk Scarf', category: 'equipment', equip: 'accessory', price: 160, effects: ['Colorless attacks do 10 more damage'], description: 'A smooth scarf.' },
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
