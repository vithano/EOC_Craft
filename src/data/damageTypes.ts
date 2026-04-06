/** Damage categories used for hit breakdown display (weapon local + spell). */
export type HitDamageType = "physical" | "fire" | "cold" | "lightning" | "chaos";

export interface HitDamageTypeRow {
  type: HitDamageType;
  min: number;
  max: number;
}

/** Nearest integer (standard `Math.round`). Used throughout the hit pipeline at each step. */
export function roundDamageNearest(x: number): number {
  if (!Number.isFinite(x)) return x;
  return Math.round(x);
}

/**
 * Partition `orig` into integer buckets with given non-negative weights (normalized internally).
 * Starts from `Math.round` of each exact quota, then fixes the sum to `orig` by distributing
 * surplus or deficit using largest-remainder tie-breaks.
 */
function splitIntByProportionsN(orig: number, weights: number[]): number[] {
  const wSum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (wSum <= 0) return weights.map(() => 0);
  if (orig <= 0) return weights.map(() => 0);
  const exact = weights.map((wi) => (orig * Math.max(0, wi)) / wSum);
  const rounded = exact.map((x) => Math.round(x));
  let sumR = rounded.reduce((a, b) => a + b, 0);
  let diff = orig - sumR;
  const out = [...rounded];
  if (diff === 0) return out;

  const n = exact.length;
  if (diff > 0) {
    const fracs = exact.map((x, i) => ({ i, f: x - Math.floor(x) }));
    fracs.sort((a, b) => b.f - a.f || b.i - a.i);
    for (let k = 0; k < diff; k++) {
      out[fracs[k % n]!.i]++;
    }
  } else {
    let need = -diff;
    const order = exact
      .map((x, i) => ({ i, over: out[i]! - x }))
      .sort((a, b) => b.over - a.over || a.i - b.i);
    while (need > 0) {
      let progressed = false;
      for (const { i } of order) {
        if (need <= 0) break;
        if (out[i]! > 0) {
          out[i]!--;
          need--;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
  }
  return out;
}

/**
 * Sum hit fragments that share the same damage type and the same increased-damage multiplier,
 * then snap float noise and round min/max. Used for the “per fragment (before → after increased)” table:
 * base ranges are integer-rounded before the × column (increased mult) is applied in the real pipeline.
 */
export function mergePerInstanceBeforeIncreasedRows<
  T extends {
    type: HitDamageType;
    scaling: HitDamageScaling;
    min: number;
    max: number;
    increasedDamagePercent: number;
    damageMultiplier: number;
  },
>(
  rows: T[]
): Array<
  T & {
    mergedFrom: number;
    mergedScalings: HitDamageScaling[];
  }
> {
  const key = (r: T) => `${r.type}\0${r.damageMultiplier.toFixed(6)}`;
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const g = groups.get(k) ?? [];
    g.push(row);
    groups.set(k, g);
  }
  const order: HitDamageType[] = ["physical", "fire", "cold", "lightning", "chaos"];
  const out: Array<T & { mergedFrom: number; mergedScalings: HitDamageScaling[] }> = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    let sumMin = 0;
    let sumMax = 0;
    for (const r of group) {
      sumMin += r.min;
      sumMax += r.max;
    }
    const mergedScalings = [...new Set(group.map((r) => r.scaling))];
    out.push({
      ...first,
      min: roundDamageNearest(sumMin),
      max: roundDamageNearest(sumMax),
      mergedFrom: group.length,
      mergedScalings,
    });
  }
  out.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return out;
}

/**
 * How global “increased damage” buckets apply to a hit fragment (conversion lineage).
 * - physical_style: remaining physical — phys-style pool (global + attack + melee stack + phys attunement; not elemental Σ).
 * - native_elemental: weapon flat fire / cold / lightning — global + attack stack + Σ elemental + type-specific (+ fire attunement on fire).
 * - physical_and_elemental: from physical conversion (or extra lightning from phys): phys-style + elemental + type-specific.
 * - chaos_style: attack increased + chaos-specific (no generic elemental increased).
 */
export type HitDamageScaling =
  | "physical_style"
  | "native_elemental"
  | "physical_and_elemental"
  | "chaos_style";

export interface ProvHitDamageRow {
  type: HitDamageType;
  min: number;
  max: number;
  scaling: HitDamageScaling;
}

export function buildProvHitDamageByType(rows: ProvHitDamageRow[]): ProvHitDamageRow[] {
  const filtered = rows.filter((r) => r.max > 0 || r.min > 0);
  const physZero = rows.find((r) => r.type === "physical" && r.min === 0 && r.max === 0);
  if (physZero && !filtered.some((r) => r.type === "physical")) {
    return [physZero, ...filtered];
  }
  return filtered;
}

/** Merge provenance rows for UI / stored hit breakdown (same type summed). */
export function collapseProvRowsToHitDamage(rows: ProvHitDamageRow[]): HitDamageTypeRow[] {
  const order: HitDamageType[] = ["physical", "fire", "cold", "lightning", "chaos"];
  const physicalRowExisted = rows.some((r) => r.type === "physical");
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
    if (t === "physical" && physicalRowExisted) {
      const v = map.get("physical");
      if (v && (v.min > 0 || v.max > 0)) {
        out.push({
          type: "physical",
          min: roundDamageNearest(v.min),
          max: roundDamageNearest(v.max),
        });
      } else {
        out.push({
          type: "physical",
          min: roundDamageNearest(v?.min ?? 0),
          max: roundDamageNearest(v?.max ?? 0),
        });
      }
      continue;
    }
    const v = map.get(t);
    if (v && (v.min > 0 || v.max > 0)) {
      out.push({
        type: t,
        min: roundDamageNearest(v.min),
        max: roundDamageNearest(v.max),
      });
    }
  }
  return out;
}

export interface ProvHitIncreasedContext {
  /**
   * “Physical-style” pool for remaining physical hits: `attackIncSum` + ability attunement
   * “increased physical damage” only. `attackIncSum` already includes global increased damage,
   * increased attack damage, melee stack when applicable, etc. — not physical-damage-type-only.
   */
  physStyleIncTotal: number;
  /** Global + attack + conditional melee: increased damage, attack damage, attunement “increased damage”, … */
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
      return ctx.physStyleIncTotal;
    case "native_elemental":
      return ctx.attackIncSum + ctx.incEle + typeGear + (row.type === "fire" ? ctx.attIncFire : 0);
    case "physical_and_elemental":
      return ctx.physStyleIncTotal + ctx.incEle + typeGear + (row.type === "fire" ? ctx.attIncFire : 0);
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
      min: roundDamageNearest(r.min * m),
      max: roundDamageNearest(r.max * m),
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
    min: roundDamageNearest(flatMinStored * 2),
    max: roundDamageNearest(flatMaxStored),
  };
}

export function buildHitDamageByType(rows: HitDamageTypeRow[]): HitDamageTypeRow[] {
  const filtered = rows.filter((r) => r.max > 0 || r.min > 0);
  const physZero = rows.find((r) => r.type === "physical" && r.min === 0 && r.max === 0);
  let out: HitDamageTypeRow[];
  if (physZero && !filtered.some((r) => r.type === "physical")) {
    out = [physZero, ...filtered];
  } else {
    out = filtered;
  }
  const rounded = out.map((r) => ({
    ...r,
    min: roundDamageNearest(r.min),
    max: roundDamageNearest(r.max),
  }));
  const keepPhysicalZero =
    physZero &&
    rounded.some((r) => r.type === "physical" && r.min === 0 && r.max === 0);
  return rounded.filter(
    (r) =>
      r.max > 0 ||
      r.min > 0 ||
      (r.type === "physical" && r.min === 0 && r.max === 0 && keepPhysicalZero)
  );
}

/** Phys→fire/cold/lightning cannot exceed 100% of the same roll; scale all sources down proportionally. */
export function normalizePhysicalConversionPcts(
  pctToFire: number,
  pctToCold: number,
  pctToLightning: number
): {
  rawTotal: number;
  normalizationFactor: number;
  toFire: number;
  toCold: number;
  toLightning: number;
} {
  const rawTotal = Math.max(0, pctToFire) + Math.max(0, pctToCold) + Math.max(0, pctToLightning);
  const normalizationFactor = rawTotal > 100 ? 100 / rawTotal : 1;
  return {
    rawTotal,
    normalizationFactor,
    toFire: Math.max(0, pctToFire) * normalizationFactor,
    toCold: Math.max(0, pctToCold) * normalizationFactor,
    toLightning: Math.max(0, pctToLightning) * normalizationFactor,
  };
}

/**
 * Split one physical roll into fire / cold / lightning / remaining physical.
 * Each elemental line is % of original physical (caller passes normalized percents, tf+tc+tl ≤ 100).
 * Fire / cold / lightning are rounded independently; remainder stays on physical; if elementals round high,
 * trim from the buckets that overshot the most (vs exact share) until the sum matches `orig`.
 */
function allocatePhysicalConversionSplit(
  orig: number,
  toFirePct: number,
  toColdPct: number,
  toLightningPct: number
): { fire: number; cold: number; lightning: number; physRem: number } {
  const tf = Math.max(0, toFirePct);
  const tc = Math.max(0, toColdPct);
  const tl = Math.max(0, toLightningPct);
  const w = tf + tc + tl;
  if (w <= 0 || orig <= 0) {
    return { fire: 0, cold: 0, lightning: 0, physRem: orig };
  }
  const exactF = (orig * tf) / 100;
  const exactC = (orig * tc) / 100;
  const exactL = (orig * tl) / 100;
  let fire = roundDamageNearest(exactF);
  let cold = roundDamageNearest(exactC);
  let lightning = roundDamageNearest(exactL);
  let physRem = orig - fire - cold - lightning;
  if (physRem < 0) {
    let need = -physRem;
    const vals = [fire, cold, lightning];
    const exacts = [exactF, exactC, exactL];
    const order = [0, 1, 2]
      .map((i) => ({ i, over: vals[i]! - exacts[i]! }))
      .sort((a, b) => b.over - a.over || a.i - b.i);
    while (need > 0) {
      let progressed = false;
      for (const { i } of order) {
        if (need <= 0) break;
        if (vals[i]! > 0) {
          vals[i]!--;
          need--;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    fire = vals[0]!;
    cold = vals[1]!;
    lightning = vals[2]!;
    physRem = orig - fire - cold - lightning;
  }
  return { fire, cold, lightning, physRem };
}

/** If min-roll physical > max-roll physical, move damage from physical into elementals on the min roll. */
function clampPhysicalConversionMinMax(
  minA: { fire: number; cold: number; lightning: number; physRem: number },
  maxA: { fire: number; cold: number; lightning: number; physRem: number },
  toFire: number,
  toCold: number,
  toLightning: number
): void {
  if (minA.physRem <= maxA.physRem) return;
  const d = minA.physRem - maxA.physRem;
  minA.physRem -= d;
  const ew = toFire + toCold + toLightning;
  if (ew <= 0) return;
  if (toFire === toCold && toCold === toLightning && toFire > 0) {
    const addParts = splitIntByProportionsN(d, [1, 1, 1]);
    minA.fire += addParts[0]!;
    minA.cold += addParts[1]!;
    minA.lightning += addParts[2]!;
    return;
  }
  const addF = roundDamageNearest((d * toFire) / ew);
  const addC = roundDamageNearest((d * toCold) / ew);
  const addL = d - addF - addC;
  minA.fire += addF;
  minA.cold += addC;
  minA.lightning += addL;
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
  const { toFire, toCold, toLightning } = normalizePhysicalConversionPcts(pctToFire, pctToCold, pctToLightning);
  const out = rows.map((r) => ({ ...r }));
  const pi = out.findIndex((r) => r.type === "physical");
  if (pi < 0) return rows;
  const p = out[pi]!;
  const origMin = p.min;
  const origMax = p.max;
  if (origMin <= 0 && origMax <= 0) return rows;

  const minAlloc = allocatePhysicalConversionSplit(origMin, toFire, toCold, toLightning);
  const maxAlloc = allocatePhysicalConversionSplit(origMax, toFire, toCold, toLightning);
  clampPhysicalConversionMinMax(minAlloc, maxAlloc, toFire, toCold, toLightning);
  out[pi] = {
    ...p,
    min: minAlloc.physRem,
    max: maxAlloc.physRem,
  };

  const bump = (type: HitDamageType, dm: number, dM: number) => {
    const i = out.findIndex((r) => r.type === type);
    if (i >= 0) {
      const cur = out[i]!;
      out[i] = {
        ...cur,
        min: cur.min + dm,
        max: cur.max + dM,
      };
    } else {
      out.push({ type, min: dm, max: dM });
    }
  };
  bump("fire", minAlloc.fire, maxAlloc.fire);
  bump("cold", minAlloc.cold, maxAlloc.cold);
  bump("lightning", minAlloc.lightning, maxAlloc.lightning);

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
      min: roundDamageNearest(row.min - takeMin),
      max: roundDamageNearest(row.max - takeMax),
    };
    chaosAddMin += takeMin;
    chaosAddMax += takeMax;
  }
  const ci = out.findIndex((r) => r.type === "chaos");
  if (ci >= 0) {
    const c = out[ci]!;
    out[ci] = {
      ...c,
      min: c.min + roundDamageNearest(chaosAddMin),
      max: c.max + roundDamageNearest(chaosAddMax),
    };
  } else if (chaosAddMax > 0) {
    out.push({
      type: "chaos",
      min: roundDamageNearest(chaosAddMin),
      max: roundDamageNearest(chaosAddMax),
    });
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
    min: roundDamageNearest(L.min - takeMin),
    max: roundDamageNearest(L.max - takeMax),
  };
  const ci = out.findIndex((r) => r.type === "cold");
  if (ci >= 0) {
    const c = out[ci]!;
    out[ci] = {
      ...c,
      min: c.min + roundDamageNearest(takeMin),
      max: c.max + roundDamageNearest(takeMax),
    };
  } else {
    out.push({ type: "cold", min: roundDamageNearest(takeMin), max: roundDamageNearest(takeMax) });
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
      min: L.min + roundDamageNearest(addMin),
      max: L.max + roundDamageNearest(addMax),
    };
  } else {
    out.push({ type: "lightning", min: roundDamageNearest(addMin), max: roundDamageNearest(addMax) });
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
  const { toFire, toCold, toLightning } = normalizePhysicalConversionPcts(pctToFire, pctToCold, pctToLightning);
  const out = rows.map((r) => ({ ...r }));
  const pi = out.findIndex((r) => r.type === "physical");
  if (pi < 0) return rows;
  const p = out[pi]!;
  const origMin = p.min;
  const origMax = p.max;
  if (origMin <= 0 && origMax <= 0) return rows;
  const minAlloc = allocatePhysicalConversionSplit(origMin, toFire, toCold, toLightning);
  const maxAlloc = allocatePhysicalConversionSplit(origMax, toFire, toCold, toLightning);
  clampPhysicalConversionMinMax(minAlloc, maxAlloc, toFire, toCold, toLightning);

  out[pi] = {
    ...p,
    min: minAlloc.physRem,
    max: maxAlloc.physRem,
  };

  const pushEle = (type: HitDamageType, dm: number, dM: number) => {
    if (dm <= 0 && dM <= 0) return;
    out.push({
      type,
      min: dm,
      max: dM,
      scaling: "physical_and_elemental",
    });
  };
  pushEle("fire", minAlloc.fire, maxAlloc.fire);
  pushEle("cold", minAlloc.cold, maxAlloc.cold);
  pushEle("lightning", minAlloc.lightning, maxAlloc.lightning);

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
      r.scaling === "physical_and_elemental" ? "physical_and_elemental" : "native_elemental";
    out.push({
      ...r,
      min: roundDamageNearest(r.min - takeMin),
      max: roundDamageNearest(r.max - takeMax),
    });
    if (takeMin > 0 || takeMax > 0) {
      newCold.push({
        type: "cold",
        min: roundDamageNearest(takeMin),
        max: roundDamageNearest(takeMax),
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
    min: roundDamageNearest(addMin),
    max: roundDamageNearest(addMax),
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
      out.push({ ...r, min: roundDamageNearest(remMin), max: roundDamageNearest(remMax) });
    }
  }
  if (chaosMax > 0) {
    out.push({
      type: "chaos",
      min: roundDamageNearest(chaosMin),
      max: roundDamageNearest(chaosMax),
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
    min: roundDamageNearest(p.min * damageMultiplierFactor),
    max: roundDamageNearest(p.max * damageMultiplierFactor),
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
    min: roundDamageNearest(p.min * damageMultiplierFactor),
    max: roundDamageNearest(p.max * damageMultiplierFactor),
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
