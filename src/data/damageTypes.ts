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

/**
 * Moves a percentage of the physical row into fire/cold/lightning (each % of original physical).
 * Multiple uniques stack additive percentages (e.g. three 33% lines ≈ 99% converted total).
 */
export function applyGearPhysicalConversion(
  rows: HitDamageTypeRow[],
  pctToFire: number,
  pctToCold: number,
  pctToLightning: number
): HitDamageTypeRow[] {
  if (pctToFire <= 0 && pctToCold <= 0 && pctToLightning <= 0) return rows;
  const out = rows.map((r) => ({ ...r }));
  const pi = out.findIndex((r) => r.type === "physical");
  if (pi < 0) return rows;
  const p = out[pi]!;
  const origMin = p.min;
  const origMax = p.max;
  if (origMin <= 0 && origMax <= 0) return rows;

  const take = (pct: number, lo: number, hi: number) => ({
    min: lo * (pct / 100),
    max: hi * (pct / 100),
  });
  const f = take(pctToFire, origMin, origMax);
  const c = take(pctToCold, origMin, origMax);
  const l = take(pctToLightning, origMin, origMax);

  out[pi] = {
    ...p,
    min: Math.round(origMin - f.min - c.min - l.min),
    max: Math.round(origMax - f.max - c.max - l.max),
  };

  const bump = (type: HitDamageType, dm: number, dM: number) => {
    const i = out.findIndex((r) => r.type === type);
    if (i >= 0) {
      const cur = out[i]!;
      out[i] = {
        ...cur,
        min: cur.min + Math.round(dm),
        max: cur.max + Math.round(dM),
      };
    } else {
      out.push({ type, min: Math.round(dm), max: Math.round(dM) });
    }
  };
  bump("fire", f.min, f.max);
  bump("cold", c.min, c.max);
  bump("lightning", l.min, l.max);

  return buildHitDamageByType(out);
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
