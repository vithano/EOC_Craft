import { EOC_UNIQUE_BY_ID, EOC_UNIQUE_DEFINITIONS, isUniqueItemId } from './eocUniques';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'unique';

function uniqueItemsForGameSlot(gameSlot: string): EquipmentItem[] {
  return EOC_UNIQUE_DEFINITIONS.filter((u) => u.slot === gameSlot).map((u) => ({
    id: u.id,
    name: u.name,
    rarity: 'unique',
    modifiers: {},
  }));
}

const RING_UNIQUES = uniqueItemsForGameSlot('Ring');

export interface ItemModifiers {
  armor?: number;
  damage?: number;
  strength?: number;
  agility?: number;
  intelligence?: number;
  vitality?: number;
  dexterity?: number;
  evasion?: number;
  critChance?: number;
  mana?: number;
  health?: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  rarity?: Rarity;
  modifiers: ItemModifiers;
  /** Weapon occupies both hands (blocks off-hand). */
  twoHanded?: boolean;
}

/** True for two-handed base weapons or unique weapons flagged in data. */
export function weaponUsesBothHands(itemId: string): boolean {
  if (!itemId || itemId === 'none') return false;
  if (isUniqueItemId(itemId)) return EOC_UNIQUE_BY_ID[itemId]?.twoHanded ?? false;
  const row = EQUIPMENT_ITEMS.Weapon?.find((i) => i.id === itemId);
  return row?.twoHanded ?? false;
}

export const EQUIPMENT_SLOTS: string[] = [
  'Helmet',
  'Chest',
  'Belt',
  'Gloves',
  'Boots',
  'Legs',
  'Weapon',
  'Off-hand',
  'Ring 1',
  'Ring 2',
  'Amulet',
];

/** Worn item: base id or unique id; rolls apply to uniques with variable modifiers. */
export interface EquippedEntry {
  itemId: string;
  rolls?: number[];
  /** Unique enhancement +1…+max (each level adds Enhancement Bonus % to first % in innate). */
  enhancement?: number;
}

function clampEnhancement(n: unknown): number | undefined {
  const v = Math.floor(Number(n));
  if (Number.isNaN(v) || v < 0) return undefined;
  return Math.min(20, v);
}

export function normalizeEquippedEntry(raw: unknown): EquippedEntry {
  if (raw == null) return { itemId: 'none' };
  if (typeof raw === 'string') return { itemId: raw };
  if (typeof raw === 'object' && raw !== null && 'itemId' in raw) {
    const o = raw as { itemId: unknown; rolls?: unknown; enhancement?: unknown };
    const itemId = typeof o.itemId === 'string' ? o.itemId : 'none';
    let rolls: number[] | undefined;
    if (Array.isArray(o.rolls) && o.rolls.length > 0) {
      rolls = o.rolls.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    }
    const enhancement = clampEnhancement(o.enhancement);
    return {
      itemId,
      rolls: rolls?.length ? rolls : undefined,
      enhancement: enhancement !== undefined && enhancement > 0 ? enhancement : undefined,
    };
  }
  return { itemId: 'none' };
}

export function sameEquippedEntry(a: EquippedEntry, b: EquippedEntry): boolean {
  if (a.itemId !== b.itemId) return false;
  if (JSON.stringify(a.rolls ?? []) !== JSON.stringify(b.rolls ?? [])) return false;
  return (a.enhancement ?? 0) === (b.enhancement ?? 0);
}

export function getEquippedEntry(
  equipped: Record<string, unknown>,
  slot: string
): EquippedEntry {
  return normalizeEquippedEntry(equipped[slot]);
}

/** One stack in the bag; `slot` is the equipment slot this piece equips into. */
export interface InventoryStack {
  id: string;
  slot: string;
  itemId: string;
  qty: number;
  /** Rolled values for unique item numeric ranges, in order. */
  rolls?: number[];
  enhancement?: number;
}

export const INVENTORY_MAX_SLOTS = 100;

export const DEFAULT_INVENTORY: InventoryStack[] = [
  { id: 'inv-longbow', slot: 'Weapon', itemId: 'longbow', qty: 1 },
  { id: 'inv-staff', slot: 'Weapon', itemId: 'staff_of_flames', qty: 1 },
];

export type EquipmentFilter = 'all' | 'weapons' | 'armor' | 'accessories';

export function slotCategory(slot: string): 'weapons' | 'armor' | 'accessories' {
  if (slot === 'Weapon' || slot === 'Off-hand') return 'weapons';
  if (slot === 'Ring 1' || slot === 'Ring 2' || slot === 'Amulet') return 'accessories';
  if (slot === 'Belt') return 'armor';
  return 'armor';
}

export function getItemDefinition(slot: string, itemId: string): EquipmentItem | undefined {
  const list = EQUIPMENT_ITEMS[slot];
  return list?.find((i) => i.id === itemId);
}

export const EQUIPMENT_ITEMS: Record<string, EquipmentItem[]> = {
  Helmet: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'iron_helm', name: 'Iron Helm', rarity: 'common', modifiers: { armor: 15, vitality: 2 } },
    { id: 'steel_helm', name: 'Steel Helm', rarity: 'uncommon', modifiers: { armor: 28, vitality: 4, strength: 2 } },
    { id: 'shadow_cowl', name: 'Shadow Cowl', rarity: 'rare', modifiers: { armor: 10, evasion: 12, agility: 6 } },
    { id: 'arcane_hood', name: 'Arcane Hood', rarity: 'rare', modifiers: { armor: 8, intelligence: 10, mana: 40 } },
    { id: 'crown_of_might', name: 'Crown of Might', rarity: 'epic', modifiers: { armor: 35, strength: 12, vitality: 8 } },
    ...uniqueItemsForGameSlot('Helmet'),
  ],
  Chest: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'leather_vest', name: 'Leather Vest', rarity: 'common', modifiers: { armor: 20, agility: 2 } },
    { id: 'chainmail', name: 'Chainmail', rarity: 'uncommon', modifiers: { armor: 42, vitality: 5 } },
    { id: 'plate_armor', name: 'Plate Armor', rarity: 'rare', modifiers: { armor: 65, strength: 5, vitality: 8 } },
    { id: 'robes_of_arcana', name: 'Robes of Arcana', rarity: 'rare', modifiers: { armor: 15, intelligence: 14, mana: 60 } },
    { id: 'shadowweave_garb', name: 'Shadowweave Garb', rarity: 'epic', modifiers: { armor: 30, agility: 10, evasion: 18 } },
    ...uniqueItemsForGameSlot('Chest'),
  ],
  Belt: [
    { id: 'none', name: '-- None --', modifiers: {} },
    ...uniqueItemsForGameSlot('Belt'),
  ],
  Gloves: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'leather_gloves', name: 'Leather Gloves', rarity: 'common', modifiers: { armor: 8, dexterity: 2 } },
    { id: 'gauntlets', name: 'Iron Gauntlets', rarity: 'uncommon', modifiers: { armor: 18, strength: 3 } },
    { id: 'swift_wraps', name: 'Swift Wraps', rarity: 'rare', modifiers: { armor: 10, agility: 8, dexterity: 5 } },
    { id: 'spellweave_gloves', name: 'Spellweave Gloves', rarity: 'rare', modifiers: { armor: 6, intelligence: 8, mana: 20 } },
    ...uniqueItemsForGameSlot('Gloves'),
  ],
  Boots: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'leather_boots', name: 'Leather Boots', rarity: 'common', modifiers: { armor: 8, agility: 3 } },
    { id: 'iron_boots', name: 'Iron Boots', rarity: 'uncommon', modifiers: { armor: 16, vitality: 2 } },
    { id: 'windsprint_boots', name: 'Windsprint Boots', rarity: 'rare', modifiers: { armor: 10, agility: 10, evasion: 8 } },
    { id: 'arcane_treads', name: 'Arcane Treads', rarity: 'rare', modifiers: { armor: 8, intelligence: 5, mana: 15 } },
    ...uniqueItemsForGameSlot('Boots'),
  ],
  Legs: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'cloth_leggings', name: 'Cloth Leggings', rarity: 'common', modifiers: { armor: 12, agility: 2 } },
    { id: 'leather_chaps', name: 'Leather Chaps', rarity: 'uncommon', modifiers: { armor: 22, dexterity: 3 } },
    { id: 'chain_leggings', name: 'Chain Leggings', rarity: 'uncommon', modifiers: { armor: 32, vitality: 3 } },
    { id: 'plate_greaves', name: 'Plate Greaves', rarity: 'rare', modifiers: { armor: 48, strength: 4, vitality: 5 } },
    { id: 'shadow_legwraps', name: 'Shadow Legwraps', rarity: 'rare', modifiers: { armor: 20, evasion: 12, agility: 6 } },
    ...uniqueItemsForGameSlot('Legs'),
  ],
  Weapon: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'iron_sword', name: 'Iron Sword', rarity: 'common', modifiers: { damage: 18, strength: 2 } },
    { id: 'steel_axe', name: 'Steel Axe', rarity: 'uncommon', modifiers: { damage: 30, strength: 5 } },
    { id: 'shadow_dagger', name: 'Shadow Dagger', rarity: 'rare', modifiers: { damage: 24, agility: 8, critChance: 5 } },
    {
      id: 'staff_of_flames',
      name: 'Staff of Flames',
      rarity: 'rare',
      twoHanded: true,
      modifiers: { damage: 22, intelligence: 12, mana: 30 },
    },
    {
      id: 'longbow',
      name: 'Elven Longbow',
      rarity: 'rare',
      twoHanded: true,
      modifiers: { damage: 28, dexterity: 8, critChance: 4 },
    },
    { id: 'sword_of_light', name: 'Sword of Light', rarity: 'epic', modifiers: { damage: 40, strength: 10, intelligence: 6 } },
    ...uniqueItemsForGameSlot('Weapon'),
  ],
  'Off-hand': [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'wooden_shield', name: 'Wooden Shield', rarity: 'common', modifiers: { armor: 12, vitality: 2 } },
    { id: 'iron_shield', name: 'Iron Shield', rarity: 'uncommon', modifiers: { armor: 25, vitality: 4 } },
    { id: 'arcane_orb', name: 'Arcane Orb', rarity: 'rare', modifiers: { damage: 10, intelligence: 10, mana: 25 } },
    { id: 'quiver', name: 'Magic Quiver', rarity: 'uncommon', modifiers: { damage: 8, dexterity: 5 } },
    ...uniqueItemsForGameSlot('Off-hand'),
  ],
  'Ring 1': [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'ring_str', name: 'Ring of Strength', rarity: 'uncommon', modifiers: { strength: 5 } },
    { id: 'ring_agi', name: 'Ring of Agility', rarity: 'uncommon', modifiers: { agility: 5 } },
    { id: 'ring_int', name: 'Ring of Intellect', rarity: 'uncommon', modifiers: { intelligence: 5 } },
    { id: 'ring_vitality', name: 'Ring of Vitality', rarity: 'uncommon', modifiers: { vitality: 6 } },
    { id: 'ring_power', name: 'Ring of Power', rarity: 'epic', modifiers: { damage: 12, strength: 6, critChance: 3 } },
    ...RING_UNIQUES,
  ],
  'Ring 2': [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'ring_str', name: 'Ring of Strength', rarity: 'uncommon', modifiers: { strength: 5 } },
    { id: 'ring_agi', name: 'Ring of Agility', rarity: 'uncommon', modifiers: { agility: 5 } },
    { id: 'ring_int', name: 'Ring of Intellect', rarity: 'uncommon', modifiers: { intelligence: 5 } },
    { id: 'ring_evasion', name: 'Ring of Evasion', rarity: 'rare', modifiers: { evasion: 10, agility: 4 } },
    { id: 'ring_arcane', name: 'Ring of Arcane', rarity: 'epic', modifiers: { damage: 10, intelligence: 8, mana: 30 } },
    ...RING_UNIQUES,
  ],
  Amulet: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'amulet_guardian', name: "Guardian's Amulet", rarity: 'uncommon', modifiers: { armor: 10, vitality: 5 } },
    { id: 'amulet_shadow', name: "Shadow's Embrace", rarity: 'rare', modifiers: { damage: 8, evasion: 10, agility: 6 } },
    { id: 'amulet_arcane', name: 'Arcane Pendant', rarity: 'rare', modifiers: { intelligence: 12, mana: 50, damage: 6 } },
    { id: 'amulet_champion', name: "Champion's Medallion", rarity: 'epic', modifiers: { damage: 15, armor: 15, vitality: 10 } },
    ...uniqueItemsForGameSlot('Amulet'),
  ],
};
