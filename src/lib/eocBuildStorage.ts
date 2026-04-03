import type { BuildConfig } from "../data/gameStats";
import type { InventoryStack } from "../data/equipment";

export const EOC_BUILD_STORAGE_KEY = "eocCraftBuild";

/** Persisted payload: build math + equipment slot ids for the planner UI. */
export type StoredPlannerPayload = BuildConfig & {
  equipped?: Record<string, string>;
  inventory?: InventoryStack[];
};

export function loadStoredPlanner(): StoredPlannerPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(EOC_BUILD_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredPlannerPayload>;
    if (!data || typeof data !== "object") return null;
    const equipped =
      data.equipped && typeof data.equipped === "object"
        ? data.equipped
        : undefined;
    const hasInventoryKey = Object.prototype.hasOwnProperty.call(data, "inventory");
    const inventory = hasInventoryKey ? normalizeInventory(data.inventory) : undefined;
    return {
      upgradeLevels:
        data.upgradeLevels && typeof data.upgradeLevels === "object"
          ? data.upgradeLevels
          : {},
      equipmentModifiers: normalizeEquipment(data.equipmentModifiers),
      ...(equipped ? { equipped } : {}),
      ...(inventory !== undefined ? { inventory } : {}),
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
    out.push({ id, slot, itemId, qty });
  }
  return out;
}

function normalizeEquipment(
  m: Partial<BuildConfig["equipmentModifiers"]> | undefined
): BuildConfig["equipmentModifiers"] {
  const z = m ?? {};
  return {
    flatLife: Number(z.flatLife) || 0,
    flatMana: Number(z.flatMana) || 0,
    flatArmor: Number(z.flatArmor) || 0,
    flatEvasion: Number(z.flatEvasion) || 0,
    flatDamageMin: Number(z.flatDamageMin) || 0,
    flatDamageMax: Number(z.flatDamageMax) || 0,
    critChanceBonus: Number(z.critChanceBonus) || 0,
    strBonus: Number(z.strBonus) || 0,
    dexBonus: Number(z.dexBonus) || 0,
    intBonus: Number(z.intBonus) || 0,
  };
}
