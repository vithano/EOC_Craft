export type UniqueModPiece = string | { type: "range"; min: number; max: number };

export interface EocUniqueDefinition {
  id: string;
  name: string;
  slot: string;
  itemType: string;
  reqLevel: number;
  reqStr: number | null;
  reqDex: number | null;
  reqInt: number | null;
  enhancementBonus: string;
  enhancementBonusPerLevel: number;
  maxEnhancement: number;
  twoHanded: boolean;
  rollLabels: string[];
  innate: UniqueModPiece[];
  lines: UniqueModPiece[][];
  /** Base physical damage range before local modifiers (weapons only). */
  baseDamageMin: number | null;
  baseDamageMax: number | null;
  /** Base critical hit chance in percent (e.g. 9 for 9%). */
  baseCritChance: number | null;
  /** Base attacks per second. */
  baseAttackSpeed: number | null;
  /** Base armour value (armour pieces only). */
  baseArmour: number | null;
  /** Base evasion rating (armour/evasion pieces only). */
  baseEvasion: number | null;
  /** Base energy shield (ES pieces only). */
  baseEnergyShield: number | null;
  /** Base block chance in percent (shields only). */
  baseBlockChance: number | null;
}

export let EOC_UNIQUE_DEFINITIONS: EocUniqueDefinition[] = [];

export let EOC_UNIQUE_BY_ID: Record<string, EocUniqueDefinition> = Object.fromEntries(
  EOC_UNIQUE_DEFINITIONS.map((u) => [u.id, u])
);

/** Called by GameDataProvider after fetching the Uniques sheet tab. */
export function updateUniqueDefinitions(defs: EocUniqueDefinition[]): void {
  EOC_UNIQUE_DEFINITIONS = defs;
  EOC_UNIQUE_BY_ID = Object.fromEntries(defs.map((u) => [u.id, u]));
}

export function isUniqueItemId(itemId: string): boolean {
  return itemId.startsWith("unique_");
}

export function maxEnhancementForUnique(def: EocUniqueDefinition): number {
  const m = def.maxEnhancement;
  // Keep this bounded to avoid UI/pathological values, but allow items like "The Gilden Apex" (tier 40).
  return typeof m === "number" && m >= 0 ? Math.min(99, Math.floor(m)) : 10;
}

export function countUniqueRollSlots(def: EocUniqueDefinition): number {
  let n = 0;
  const walk = (pieces: UniqueModPiece[]) => {
    for (const p of pieces) {
      if (typeof p !== "string" && p.type === "range") n++;
    }
  };
  walk(def.innate);
  for (const ln of def.lines) walk(ln);
  return n;
}

/** Min/max for each rolled range, in order (innate first, then lines). */
export function rollBoundsForUnique(def: EocUniqueDefinition): { min: number; max: number }[] {
  const out: { min: number; max: number }[] = [];
  const walk = (pieces: UniqueModPiece[]) => {
    for (const p of pieces) {
      if (typeof p !== "string" && p.type === "range") out.push({ min: p.min, max: p.max });
    }
  };
  walk(def.innate);
  for (const ln of def.lines) walk(ln);
  return out;
}

export function rollLabelForIndex(def: EocUniqueDefinition, index: number): string {
  const labels = def.rollLabels;
  if (labels && labels[index]) return labels[index];
  return `Value ${index + 1}`;
}

function clampRoll(v: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, v));
}

function formatRollValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const t = Math.round(v * 100) / 100;
  return String(t);
}

function resolvePieces(
  pieces: UniqueModPiece[],
  rolls: number[],
  rollIndex: { i: number },
  opts?: { scaleRollsBy?: number }
): string {
  let out = "";
  const mult = opts?.scaleRollsBy ?? 1;
  for (const p of pieces) {
    if (typeof p === "string") {
      out += p;
      continue;
    }
    const idx = rollIndex.i++;
    const raw = rolls[idx];
    let chosen =
      raw !== undefined && !Number.isNaN(raw)
        ? clampRoll(raw, p.min, p.max)
        : clampRoll((p.min + p.max) / 2, p.min, p.max);
    if (mult !== 1) chosen = Math.floor(chosen * mult);
    out += formatRollValue(chosen);
  }
  return out;
}

export function explicitEffectPctPerEnhancementTier(def: EocUniqueDefinition): number {
  // e.g. "10% increased effect of other explicit modifiers on this item per enhancement tier"
  const text = def.lines
    .flatMap((ln) => ln)
    .filter((p): p is string => typeof p === "string")
    .join(" ");
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*%\s*increased effect of other explicit modifiers on this item per enhancement tier/i
  );
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Each enhancement level adds `perLevel` (from Enhancement Bonus column) to the first % value in the innate line.
 */
export function applyEnhancementToResolvedInnate(
  resolvedInnate: string,
  perLevel: number,
  enhancementLevel: number
): string {
  if (enhancementLevel <= 0 || perLevel === 0 || !resolvedInnate.trim()) return resolvedInnate;
  const delta = enhancementLevel * perLevel;

  function applyDelta(text: string, idx: number, rawMatch: string, numStr: string, suffix: string): string {
    const base = parseFloat(numStr);
    if (Number.isNaN(base)) return text;
    const nv = base + delta;
    const formatted =
      Number.isInteger(nv) || Math.abs(nv - Math.round(nv)) < 1e-6
        ? String(Math.round(nv))
        : String(Math.round(nv * 100) / 100);
    return text.slice(0, idx) + formatted + suffix + text.slice(idx + rawMatch.length);
  }

  // First priority: find a number immediately followed by % (e.g. "30%")
  const rePct = /(\d+(?:\.\d+)?)(\s*%)/;
  const mPct = resolvedInnate.match(rePct);
  if (mPct && mPct.index !== undefined) {
    return applyDelta(resolvedInnate, mPct.index, mPct[0], mPct[1], mPct[2]);
  }

  // Fallback: find the first standalone number (flat stats like "+40 to maximum life")
  const reNum = /(\d+(?:\.\d+)?)/;
  const mNum = resolvedInnate.match(reNum);
  if (mNum && mNum.index !== undefined) {
    return applyDelta(resolvedInnate, mNum.index, mNum[0], mNum[1], "");
  }

  return resolvedInnate;
}

export function defaultRollsForUnique(def: EocUniqueDefinition): number[] {
  const n = countUniqueRollSlots(def);
  const out: number[] = [];
  const collect = (pieces: UniqueModPiece[]) => {
    for (const p of pieces) {
      if (typeof p !== "string" && p.type === "range") {
        out.push(Math.round((p.min + p.max) / 2));
      }
    }
  };
  collect(def.innate);
  for (const ln of def.lines) collect(ln);
  while (out.length < n) out.push(0);
  return out.slice(0, n);
}

export function resolveUniqueMods(
  def: EocUniqueDefinition,
  rolls?: number[] | null,
  enhancementLevel = 0
): {
  innateText: string;
  lineTexts: string[];
  enhancementBonus: string;
  enhancementLevel: number;
} {
  const r = rolls?.length ? [...rolls] : defaultRollsForUnique(def);
  const idx = { i: 0 };
  const en = Math.max(0, Math.min(maxEnhancementForUnique(def), Math.floor(enhancementLevel)));

  // Some uniques (e.g. The Gilden Apex) scale their explicit modifiers per enhancement tier.
  const explicitPctPerTier = explicitEffectPctPerEnhancementTier(def);
  const explicitMult = explicitPctPerTier !== 0 ? 1 + (en * explicitPctPerTier) / 100 : 1;

  let innateText = resolvePieces(def.innate, r, idx);
  const lineTexts = def.lines.map((ln) => {
    const asText = ln
      .filter((p): p is string => typeof p === "string")
      .join("")
      .toLowerCase();
    const isEnhInfo =
      asText.includes("enhancement tier") ||
      asText.includes("increased effect of other explicit modifiers on this item per enhancement tier");
    return resolvePieces(ln, r, idx, isEnhInfo ? undefined : { scaleRollsBy: explicitMult });
  });
  innateText = applyEnhancementToResolvedInnate(
    innateText,
    def.enhancementBonusPerLevel ?? 0,
    en
  );
  return {
    innateText,
    lineTexts,
    enhancementBonus: def.enhancementBonus,
    enhancementLevel: en,
  };
}
