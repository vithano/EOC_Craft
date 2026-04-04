/** Damage categories used for hit breakdown display (weapon local + spell). */
export type HitDamageType = "physical" | "fire" | "cold" | "lightning" | "chaos";

export interface HitDamageTypeRow {
  type: HitDamageType;
  min: number;
  max: number;
}

export const HIT_DAMAGE_TYPE_LABEL: Record<HitDamageType, string> = {
  physical: "Physical",
  fire: "Fire",
  cold: "Cold",
  lightning: "Lightning",
  chaos: "Chaos",
};

/** Tailwind text-* classes for planner stats. */
export const HIT_DAMAGE_TYPE_COLOR_CLASS: Record<HitDamageType, string> = {
  physical: "text-stone-300",
  fire: "text-red-400",
  cold: "text-sky-300",
  lightning: "text-yellow-300",
  chaos: "text-fuchsia-400",
};

/**
 * Local "Adds A to B" mods store min as A×0.5 in aggregation; recover display low roll with ×2.
 * Physical uses the same storage in `flatDamageMin` / elemental `flat*Min` fields.
 */
export function localFlatDamageDisplayRange(flatMinStored: number, flatMaxStored: number): {
  min: number;
  max: number;
} {
  return {
    min: Math.round(flatMinStored * 2),
    max: Math.round(flatMaxStored),
  };
}

export function buildHitDamageByType(rows: HitDamageTypeRow[]): HitDamageTypeRow[] {
  return rows.filter((r) => r.max > 0 || r.min > 0);
}

export function sumHitDamageRange(parts: HitDamageTypeRow[]): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const p of parts) {
    min += p.min;
    max += p.max;
  }
  return { min, max };
}

export function scaleHitDamageByType(
  parts: HitDamageTypeRow[],
  damageMultiplierFactor: number
): HitDamageTypeRow[] {
  if (damageMultiplierFactor === 1) return parts.map((p) => ({ ...p }));
  return parts.map((p) => ({
    ...p,
    min: Math.round(p.min * damageMultiplierFactor),
    max: Math.round(p.max * damageMultiplierFactor),
  }));
}

/** Map spell CSV / ability `element` string to a hit row type. */
export function spellElementToHitDamageType(element: string): HitDamageType {
  const e = element.trim().toLowerCase();
  if (e === "fire") return "fire";
  if (e === "cold") return "cold";
  if (e === "lightning" || e === "lighting") return "lightning";
  if (e === "chaos") return "chaos";
  return "physical";
}
