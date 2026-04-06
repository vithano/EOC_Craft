/** Damage categories used for hit breakdown display (weapon local + spell). */
export type HitDamageType = "physical" | "fire" | "cold" | "lightning" | "chaos";

export interface HitDamageTypeRow {
  type: HitDamageType;
  min: number;
  max: number;
}

/**
 * How global “increased damage” buckets apply to a hit fragment (conversion lineage).
 * - physical_style: physical-style increased only (no generic elemental); weapon flat lightning uses this.
 * - physical_and_elemental: physical-style + elemental increased; phys→element and cold from that lightning.
 * - elemental_style_only: elemental increased only; cold from lightning that was physical_style (e.g. native weapon lightning → cold).
 * - chaos_style: attack increased + chaos-specific (no elemental increased).
 */
export type HitDamageScaling =
  | "physical_style"
  | "physical_and_elemental"
  | "elemental_style_only"
  | "chaos_style";

export interface ProvHitDamageRow {
  type: HitDamageType;
  min: number;
  max: number;
  scaling: HitDamageScaling;
}

export function buildProvHitDamageByType(rows: ProvHitDamageRow[]): ProvHitDamageRow[] {
  return rows.filter((r) => r.max > 0 || r.min > 0);
}

/** Merge provenance rows for UI / stored hit breakdown (same type summed). */
export function collapseProvRowsToHitDamage(rows: ProvHitDamageRow[]): HitDamageTypeRow[] {
  const order: HitDamageType[] = ["physical", "fire", "cold", "lightning", "chaos"];
  const map = new Map<HitDamageType, { min: number; max: number }>();
  for (const r of rows) {
    if (r.max <= 0 && r.min <= 0) continue;
    const cur = map.get(r.type) ?? { min: 0, max: 0 };
    cur.min += r.min;
    cur.max += r.max;
    map.set(r.type, cur);
  }
  const out: HitDamageTypeRow[] = [];
  for (const t of order) {
    const v = map.get(t);
    if (v && (v.min > 0 || v.max > 0)) out.push({ type: t, min: v.min, max: v.max });
  }
  return out;
}

export interface ProvHitIncreasedContext {
  physIncTotal: number;
  attackIncSum: number;
  incEle: number;
  attIncFire: number;
  gearFire: number;
  gearCold: number;
  gearLightning: number;
  chaosGear: number;
}

export function increasedPctForProvHitRow(row: ProvHitDamageRow, ctx: ProvHitIncreasedContext): number {
  const typeGear =
    row.type === "fire"
      ? ctx.gearFire
      : row.type === "cold"
        ? ctx.gearCold
        : row.type === "lightning"
          ? ctx.gearLightning
          : 0;
  switch (row.scaling) {
    case "physical_style":
      if (row.type === "physical") return ctx.physIncTotal;
      return ctx.physIncTotal + typeGear;
    case "physical_and_elemental":
      return ctx.physIncTotal + ctx.incEle + typeGear + (row.type === "fire" ? ctx.attIncFire : 0);
    case "elemental_style_only":
      return ctx.incEle + typeGear + (row.type === "fire" ? ctx.attIncFire : 0);
    case "chaos_style":
      return ctx.attackIncSum + ctx.chaosGear;
    default: {
      const _x: never = row.scaling;
      return _x;
    }
  }
}

export function applyIncreasedToProvHitRows(
  rows: ProvHitDamageRow[],
  ctx: ProvHitIncreasedContext
): ProvHitDamageRow[] {
  return rows.map((r) => {
    const pct = increasedPctForProvHitRow(r, ctx);
    const m = 1 + pct / 100;
    return {
      ...r,
      min: Math.round(r.min * m),
      max: Math.round(r.max * m),
    };
  });
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

/** Move pct of fire+cold+lightning (each of original ele) into chaos. */
export function applyElementalToChaosConversion(rows: HitDamageTypeRow[], pct: number): HitDamageTypeRow[] {
  if (pct <= 0) return rows;
  const f = pct / 100;
  const out = rows.map((r) => ({ ...r }));
  const eleTypes: HitDamageType[] = ["fire", "cold", "lightning"];
  let chaosAddMin = 0;
  let chaosAddMax = 0;
  for (const t of eleTypes) {
    const i = out.findIndex((r) => r.type === t);
    if (i < 0) continue;
    const row = out[i]!;
    const takeMin = row.min * f;
    const takeMax = row.max * f;
    out[i] = {
      ...row,
      min: Math.round(row.min - takeMin),
      max: Math.round(row.max - takeMax),
    };
    chaosAddMin += takeMin;
    chaosAddMax += takeMax;
  }
  const ci = out.findIndex((r) => r.type === "chaos");
  if (ci >= 0) {
    const c = out[ci]!;
    out[ci] = {
      ...c,
      min: c.min + Math.round(chaosAddMin),
      max: c.max + Math.round(chaosAddMax),
    };
  } else if (chaosAddMax > 0) {
    out.push({ type: "chaos", min: Math.round(chaosAddMin), max: Math.round(chaosAddMax) });
  }
  return buildHitDamageByType(out);
}

/** Move pct of lightning into cold (of original lightning). */
export function applyLightningToColdConversion(rows: HitDamageTypeRow[], pct: number): HitDamageTypeRow[] {
  if (pct <= 0) return rows;
  const f = pct / 100;
  const out = rows.map((r) => ({ ...r }));
  const li = out.findIndex((r) => r.type === "lightning");
  if (li < 0) return rows;
  const L = out[li]!;
  const takeMin = L.min * f;
  const takeMax = L.max * f;
  out[li] = {
    ...L,
    min: Math.round(L.min - takeMin),
    max: Math.round(L.max - takeMax),
  };
  const ci = out.findIndex((r) => r.type === "cold");
  if (ci >= 0) {
    const c = out[ci]!;
    out[ci] = {
      ...c,
      min: c.min + Math.round(takeMin),
      max: c.max + Math.round(takeMax),
    };
  } else {
    out.push({ type: "cold", min: Math.round(takeMin), max: Math.round(takeMax) });
  }
  return buildHitDamageByType(out);
}

/** Split pct of physical into fire / cold / lightning equally (random-type style). */
export function applyPhysicalToRandomElements(rows: HitDamageTypeRow[], pct: number): HitDamageTypeRow[] {
  if (pct <= 0) return rows;
  const third = pct / 300;
  return applyGearPhysicalConversion(rows, third * 100, third * 100, third * 100);
}

/** Non-converting "gain % of physical as extra lightning" — keeps physical, adds to lightning. */
export function applyGainPhysicalAsExtraLightning(rows: HitDamageTypeRow[], pct: number): HitDamageTypeRow[] {
  if (pct <= 0) return rows;
  const f = pct / 100;
  const out = rows.map((r) => ({ ...r }));
  const pi = out.findIndex((r) => r.type === "physical");
  if (pi < 0) return rows;
  const p = out[pi]!;
  const addMin = p.min * f;
  const addMax = p.max * f;
  const li = out.findIndex((r) => r.type === "lightning");
  if (li >= 0) {
    const L = out[li]!;
    out[li] = {
      ...L,
      min: L.min + Math.round(addMin),
      max: L.max + Math.round(addMax),
    };
  } else {
    out.push({ type: "lightning", min: Math.round(addMin), max: Math.round(addMax) });
  }
  return buildHitDamageByType(out);
}

// ---------------------------------------------------------------------------
// Provenance-aware conversions (separate hit instances; see applyIncreasedToProvHitRows)
// ---------------------------------------------------------------------------

/** Same as applyGearPhysicalConversion but adds new elemental rows (no merge) with physical_and_elemental lineage. */
export function applyGearPhysicalConversionProv(
  rows: ProvHitDamageRow[],
  pctToFire: number,
  pctToCold: number,
  pctToLightning: number
): ProvHitDamageRow[] {
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

  const pushEle = (type: HitDamageType, dm: number, dM: number) => {
    if (dm <= 0 && dM <= 0) return;
    out.push({
      type,
      min: Math.round(dm),
      max: Math.round(dM),
      scaling: "physical_and_elemental",
    });
  };
  pushEle("fire", f.min, f.max);
  pushEle("cold", c.min, c.max);
  pushEle("lightning", l.min, l.max);

  return buildProvHitDamageByType(out);
}

/** Lightning → cold applied per lightning row; cold lineage follows source lightning scaling. */
export function applyLightningToColdConversionProv(rows: ProvHitDamageRow[], pct: number): ProvHitDamageRow[] {
  if (pct <= 0) return rows;
  const f = pct / 100;
  const out: ProvHitDamageRow[] = [];
  const newCold: ProvHitDamageRow[] = [];
  for (const r of rows) {
    if (r.type !== "lightning") {
      out.push({ ...r });
      continue;
    }
    const takeMin = r.min * f;
    const takeMax = r.max * f;
    const coldScaling: HitDamageScaling =
      r.scaling === "physical_style" || r.scaling === "elemental_style_only"
        ? "elemental_style_only"
        : "physical_and_elemental";
    out.push({
      ...r,
      min: Math.round(r.min - takeMin),
      max: Math.round(r.max - takeMax),
    });
    if (takeMin > 0 || takeMax > 0) {
      newCold.push({
        type: "cold",
        min: Math.round(takeMin),
        max: Math.round(takeMax),
        scaling: coldScaling,
      });
    }
  }
  return buildProvHitDamageByType([...out, ...newCold]);
}

export function applyGainPhysicalAsExtraLightningProv(rows: ProvHitDamageRow[], pct: number): ProvHitDamageRow[] {
  if (pct <= 0) return rows;
  const f = pct / 100;
  const out = rows.map((r) => ({ ...r }));
  const pi = out.findIndex((r) => r.type === "physical");
  if (pi < 0) return rows;
  const p = out[pi]!;
  const addMin = p.min * f;
  const addMax = p.max * f;
  if (addMin <= 0 && addMax <= 0) return buildProvHitDamageByType(out);
  out.push({
    type: "lightning",
    min: Math.round(addMin),
    max: Math.round(addMax),
    scaling: "physical_and_elemental",
  });
  return buildProvHitDamageByType(out);
}

export function applyPhysicalToRandomElementsProv(rows: ProvHitDamageRow[], pct: number): ProvHitDamageRow[] {
  if (pct <= 0) return rows;
  const third = pct / 300;
  return applyGearPhysicalConversionProv(rows, third * 100, third * 100, third * 100);
}

/** Elemental → chaos: strip each elemental row; added chaos uses chaos_style (attack + chaos inc). */
export function applyElementalToChaosConversionProv(rows: ProvHitDamageRow[], pct: number): ProvHitDamageRow[] {
  if (pct <= 0) return rows;
  const f = pct / 100;
  const out: ProvHitDamageRow[] = [];
  let chaosMin = 0;
  let chaosMax = 0;
  const eleTypes = new Set<HitDamageType>(["fire", "cold", "lightning"]);
  for (const r of rows) {
    if (!eleTypes.has(r.type)) {
      out.push({ ...r });
      continue;
    }
    const takeMin = r.min * f;
    const takeMax = r.max * f;
    chaosMin += takeMin;
    chaosMax += takeMax;
    const remMin = r.min - takeMin;
    const remMax = r.max - takeMax;
    if (remMin > 0 || remMax > 0) {
      out.push({ ...r, min: Math.round(remMin), max: Math.round(remMax) });
    }
  }
  if (chaosMax > 0) {
    out.push({
      type: "chaos",
      min: Math.round(chaosMin),
      max: Math.round(chaosMax),
      scaling: "chaos_style",
    });
  }
  return buildProvHitDamageByType(out);
}

export function scaleProvHitDamageRows(
  parts: ProvHitDamageRow[],
  damageMultiplierFactor: number
): ProvHitDamageRow[] {
  if (damageMultiplierFactor === 1) return parts.map((p) => ({ ...p }));
  return parts.map((p) => ({
    ...p,
    min: Math.round(p.min * damageMultiplierFactor),
    max: Math.round(p.max * damageMultiplierFactor),
  }));
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
