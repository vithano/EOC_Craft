import {
  emptyEquipmentModifiers,
  normalizeAbilitySelection,
  type AbilitySelectionState,
  type BuildConfig,
} from "../data/gameStats";
import {
  EQUIPMENT_SLOTS,
  normalizeEquippedEntry,
  type EquippedEntry,
  type InventoryStack,
} from "../data/equipment";

export const EOC_BUILD_STORAGE_KEY = "eocCraftBuild";

/** Persisted payload: build math + equipment slot ids for the planner UI. */
export type StoredPlannerPayload = BuildConfig & {
  /** Legacy string values are normalized on load. */
  equipped?: Record<string, string | EquippedEntry>;
  inventory?: InventoryStack[];
  /** @deprecated use `ability` on BuildConfig — kept for older saves */
  abilitySelection?: AbilitySelectionState;
};

export function loadStoredPlanner(): StoredPlannerPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(EOC_BUILD_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredPlannerPayload>;
    if (!data || typeof data !== "object") return null;
    const equippedRaw =
      data.equipped && typeof data.equipped === "object"
        ? data.equipped
        : undefined;
    const equipped = equippedRaw
      ? normalizeEquippedMap(equippedRaw as Record<string, unknown>)
      : undefined;
    const hasInventoryKey = Object.prototype.hasOwnProperty.call(data, "inventory");
    const inventory = hasInventoryKey ? normalizeInventory(data.inventory) : undefined;
    const abilityRaw =
      data.ability ??
      (data as { abilitySelection?: unknown }).abilitySelection ??
      undefined;
    const ability = normalizeAbilitySelection(abilityRaw);
    const hasAbility =
      ability.abilityId !== null || ability.abilityLevel > 0 || ability.attunementPct > 0;
    return {
      upgradeLevels:
        data.upgradeLevels && typeof data.upgradeLevels === "object"
          ? data.upgradeLevels
          : {},
      equipmentModifiers: normalizeEquipment(data.equipmentModifiers),
      ...(equipped ? { equipped } : {}),
      ...(inventory !== undefined ? { inventory } : {}),
      ...(hasAbility ? { ability } : {}),
    };
  } catch {
    return null;
  }
}

/** @deprecated use loadStoredPlanner */
export function loadStoredBuild(): BuildConfig | null {
  const p = loadStoredPlanner();
  return p ? { upgradeLevels: p.upgradeLevels, equipmentModifiers: p.equipmentModifiers } : null;
}

export function saveStoredPlanner(payload: StoredPlannerPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EOC_BUILD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function saveStoredBuild(config: BuildConfig): void {
  saveStoredPlanner(config);
}

function normalizeInventory(raw: unknown): InventoryStack[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryStack[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const slot = typeof o.slot === "string" ? o.slot : "";
    const itemId = typeof o.itemId === "string" ? o.itemId : "";
    const qty = Math.max(0, Math.floor(Number(o.qty)));
    if (!id || !slot || !itemId || qty < 1) continue;
    let rolls: number[] | undefined;
    if (Array.isArray(o.rolls) && o.rolls.length > 0) {
      rolls = o.rolls.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    }
    const enhRaw = Math.floor(Number(o.enhancement));
    const enhancement =
      !Number.isNaN(enhRaw) && enhRaw > 0 ? Math.min(20, enhRaw) : undefined;
    out.push({
      id,
      slot,
      itemId,
      qty,
      rolls: rolls?.length ? rolls : undefined,
      enhancement,
    });
  }
  return out;
}

function normalizeEquippedMap(raw: Record<string, unknown>): Record<string, EquippedEntry> {
  const out: Record<string, EquippedEntry> = {};
  for (const slot of EQUIPMENT_SLOTS) {
    out[slot] = normalizeEquippedEntry(raw[slot]);
  }
  return out;
}

function normalizeEquipment(
  m: Partial<BuildConfig["equipmentModifiers"]> | undefined
): BuildConfig["equipmentModifiers"] {
  const d = emptyEquipmentModifiers();
  const z = m ?? {};
  return {
    ...d,
    flatLife: Number(z.flatLife) || 0,
    flatMana: Number(z.flatMana) || 0,
    flatArmor: Number(z.flatArmor) || 0,
    flatEvasion: Number(z.flatEvasion) || 0,
    flatDamageMin: Number(z.flatDamageMin) || 0,
    flatDamageMax: Number(z.flatDamageMax) || 0,
    flatFireMin: Number(z.flatFireMin) || 0,
    flatFireMax: Number(z.flatFireMax) || 0,
    flatColdMin: Number(z.flatColdMin) || 0,
    flatColdMax: Number(z.flatColdMax) || 0,
    flatLightningMin: Number(z.flatLightningMin) || 0,
    flatLightningMax: Number(z.flatLightningMax) || 0,
    flatChaosMin: Number(z.flatChaosMin) || 0,
    flatChaosMax: Number(z.flatChaosMax) || 0,
    flatStrikesPerAttack: Number(z.flatStrikesPerAttack) || 0,
    increasedStrikesPerAttackFromGear: Number(z.increasedStrikesPerAttackFromGear) || 0,
    strikesIncPctPer10DexFromGear: Number(z.strikesIncPctPer10DexFromGear) || 0,
    critChanceBonus: Number(z.critChanceBonus) || 0,
    strBonus: Number(z.strBonus) || 0,
    dexBonus: Number(z.dexBonus) || 0,
    intBonus: Number(z.intBonus) || 0,
    flatAccuracy: Number(z.flatAccuracy) || 0,
    pctIncreasedLifeFromGear: Number(z.pctIncreasedLifeFromGear) || 0,
    pctIncreasedManaFromGear: Number(z.pctIncreasedManaFromGear) || 0,
    pctIncreasedArmorFromGear: Number(z.pctIncreasedArmorFromGear) || 0,
    pctIncreasedEvasionFromGear: Number(z.pctIncreasedEvasionFromGear) || 0,
    pctIncreasedEnergyShieldFromGear: Number(z.pctIncreasedEnergyShieldFromGear) || 0,
    increasedMeleeDamageFromGear: Number(z.increasedMeleeDamageFromGear) || 0,
    increasedAttackDamageFromGear: Number(z.increasedAttackDamageFromGear) || 0,
    increasedDamageFromGear: Number(z.increasedDamageFromGear) || 0,
    increasedSpellDamageFromGear: Number(z.increasedSpellDamageFromGear) || 0,
    pctIncreasedAccuracyFromGear: Number(z.pctIncreasedAccuracyFromGear) || 0,
    pctIncreasedAttackSpeedFromGear: Number(z.pctIncreasedAttackSpeedFromGear) || 0,
    doubleDamageChanceFromGear: Number(z.doubleDamageChanceFromGear) || 0,
    armorIgnoreFromGear: Number(z.armorIgnoreFromGear) || 0,
    pctToAllElementalResFromGear: Number(z.pctToAllElementalResFromGear) || 0,
    pctChaosResFromGear: Number(z.pctChaosResFromGear) || 0,
    manaCostReductionFromGear: Number(z.manaCostReductionFromGear) || 0,
    energyShieldLessMultFromGear:
      Number(z.energyShieldLessMultFromGear) > 0 ? Number(z.energyShieldLessMultFromGear) : d.energyShieldLessMultFromGear,
    flatEnergyShieldFromGear: Number(z.flatEnergyShieldFromGear) || 0,
  };
}
