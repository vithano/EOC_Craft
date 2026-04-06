import { EOC_UNIQUE_BY_ID, EOC_UNIQUE_DEFINITIONS, isUniqueItemId } from './eocUniques';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'unique';

export interface ItemModifiers {
  armour?: number;
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

export const EQUIPMENT_SLOTS: string[] = [
  'Helmet',
  'Chest',
  'Belt',
  'Gloves',
  'Boots',
  'Weapon',
  'Off-hand',
  'Ring 1',
  'Ring 2',
  'Amulet',
];

// ---------------------------------------------------------------------------
// Dynamic equipment items (static uniques + fetched non-unique items)
// ---------------------------------------------------------------------------

function uniqueItemsForSlot(slot: string): EquipmentItem[] {
  const uniSlot = slot === 'Ring 1' || slot === 'Ring 2' ? 'Ring' : slot;
  return EOC_UNIQUE_DEFINITIONS.filter((u) => u.slot === uniSlot).map((u) => ({
    id: u.id,
    name: u.name,
    rarity: 'unique' as const,
    modifiers: {},
  }));
}

/** Lazy-built cache; cleared whenever uniques are updated. */
let _equipmentItemsCache: Record<string, EquipmentItem[]> | null = null;

function getEquipmentItemsMap(): Record<string, EquipmentItem[]> {
  if (_equipmentItemsCache) return _equipmentItemsCache;
  const map: Record<string, EquipmentItem[]> = {};
  for (const slot of EQUIPMENT_SLOTS) {
    map[slot] = [
      { id: 'none', name: '-- None --', modifiers: {} },
      ...uniqueItemsForSlot(slot),
    ];
  }
  _equipmentItemsCache = map;
  return map;
}

/** Called by GameDataProvider after uniques are updated (cache must be rebuilt). */
export function invalidateEquipmentItemsCache(): void {
  _equipmentItemsCache = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** True for two-handed base weapons or unique weapons flagged in data. */
export function weaponUsesBothHands(itemId: string): boolean {
  if (!itemId || itemId === 'none') return false;
  if (isUniqueItemId(itemId)) return EOC_UNIQUE_BY_ID[itemId]?.twoHanded ?? false;
  const row = getEquipmentItemsMap().Weapon?.find((i) => i.id === itemId);
  return row?.twoHanded ?? false;
}

export function getItemDefinition(slot: string, itemId: string): EquipmentItem | undefined {
  return getEquipmentItemsMap()[slot]?.find((i) => i.id === itemId);
}

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

/** Restore full equipped map from localStorage (missing slots → none). */
export function migrateEquippedFromSave(raw: unknown): Record<string, EquippedEntry> {
  const out: Record<string, EquippedEntry> = {};
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const slot of EQUIPMENT_SLOTS) {
      out[slot] = normalizeEquippedEntry(o[slot]);
    }
    return out;
  }
  for (const slot of EQUIPMENT_SLOTS) {
    out[slot] = { itemId: 'none' };
  }
  return out;
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

export const DEFAULT_INVENTORY: InventoryStack[] = [];

export type EquipmentFilter = 'all' | 'weapons' | 'armor' | 'accessories';

export function slotCategory(slot: string): 'weapons' | 'armor' | 'accessories' {
  if (slot === 'Weapon' || slot === 'Off-hand') return 'weapons';
  if (slot === 'Ring 1' || slot === 'Ring 2' || slot === 'Amulet') return 'accessories';
  return 'armor';
}
