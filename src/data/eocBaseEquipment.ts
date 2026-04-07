/** Base (non-unique) equipment definitions parsed from the Equipment sheet tab. */

export interface EocBaseEquipmentDefinition {
  id: string;        // e.g. "equip_mace"
  name: string;      // e.g. "Mace"
  slot: string;      // mapped game slot: "Weapon", "Chest", "Helmet", "Gloves", "Boots", "Off-hand", "Amulet", "Ring", "Belt"
  itemType: string;  // e.g. "Mace" (the CSV Item Type column)
  innate: string;    // innate stat text (e.g. "16% increased Melee Physical Damage")
  enhancementBonusPerLevel: number;
  twoHanded: boolean;
  reqLevel: number;
  reqStr: number | null;
  reqDex: number | null;
  reqInt: number | null;
  /** Base physical damage range (weapons only). */
  baseDamageMin: number | null;
  baseDamageMax: number | null;
  /** Base critical hit chance in percent. */
  baseCritChance: number | null;
  /** Base attacks per second. */
  baseAttackSpeed: number | null;
  /** Base armour value. */
  baseArmour: number | null;
  /** Base evasion rating. */
  baseEvasion: number | null;
  /** Base energy shield. */
  baseEnergyShield: number | null;
  /** Base block chance in percent (shields only). */
  baseBlockChance: number | null;
}

export let EOC_BASE_EQUIPMENT: EocBaseEquipmentDefinition[] = [];
export let EOC_BASE_EQUIPMENT_BY_ID: Record<string, EocBaseEquipmentDefinition> = {};

export function updateBaseEquipmentDefinitions(defs: EocBaseEquipmentDefinition[]): void {
  EOC_BASE_EQUIPMENT = defs;
  EOC_BASE_EQUIPMENT_BY_ID = Object.fromEntries(defs.map((d) => [d.id, d]));
}

/** Returns true when itemId refers to a crafted base-equipment item (as opposed to a unique or none). */
export function isCraftedEquipItemId(itemId: string): boolean {
  return itemId.startsWith('equip_');
}

/** Group base equipment by slot for the crafting UI. */
export function getBaseEquipmentForSlot(slot: string): EocBaseEquipmentDefinition[] {
  const lookupSlot = slot === 'Ring 1' || slot === 'Ring 2' ? 'Ring' : slot;
  return EOC_BASE_EQUIPMENT.filter((d) => d.slot === lookupSlot);
}
