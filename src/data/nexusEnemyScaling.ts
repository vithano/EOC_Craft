/**
 * Nexus tier enemy scaling — matches sheet rules (see `formulas.csv` / `FORMULA_CONSTANTS`).
 *
 * Per tier vs previous tier:
 * - **Life** × `nexusLifeMult` (1.27479).
 * - **Regeneration** × 1.27479 as well: in the demo, regen is `raw × scaledMaxLife / refLife` (ref = modifier
 *   ratio anchor, level 100 for Nexus), so when
 *   max life steps by 1.27479 each tier, life (and ES) regen per second steps by the same factor.
 * - **Damage (sheet):** previous tier × `nexusDamageMult` (1.2589) — that is the **DPS** target per tier.
 *   **Note:** each tier also grants **5% increased APS** (`nexusSpeedPerTierPct`). That 5% is **removed from
 *   the per-hit damage multiplier** (hits × `nexusDamageMult / (1 + 5/100)`), so `hit × APS` still grows by
 *   1.2589 per tier instead of 1.2589×1.05.
 * - **APS** × `(1 + nexusSpeedPerTierPct/100)` each tier.
 * - Reference columns **physDps / eleDps / chaosDps** × `nexusDamageMult` per tier (sanity check vs hit×APS).
 *
 * **Tier 0** is anchored to **enemy level 100** (`enemyStatsAtLevel(100)`) for life, armour, evasion, accuracy,
 * APS, and physical hit bands; elemental/chaos hits use the same multiplier vs the template row so split ratios
 * match the sheet. Higher tiers stack Nexus multipliers on top of that baseline.
 *
 * **Accuracy, evasion, armour,** and **base resistances** in the tier template do not increase with Nexus tier.
 * **Barrier** ES uses `modES × refLife / enemyBaseLife × rarityLifeMult` (ref = level-100 life), so it tracks the
 * level-100 life curve and rarity, not Nexus tier life.
 *
 * **ES regeneration** from mods still uses the same `× scaledMaxLife / refLife` model as life regen, so
 * it steps with nexus life when Replenishing is present.
 */

import { enemyStatsAtLevel, FORMULA_CONSTANTS } from "./formulaConstants";

/** Enemy level used as the baseline for Nexus / Crucible tier 0 (before per-tier Nexus multipliers). */
export const NEXUS_ENEMY_LEVEL_ANCHOR = 100;

/**
 * Per Nexus tier, enemy **hit** min/max (phys / ele / chaos bands) multiply by this vs the previous tier.
 * `nexusDamageMult` in the sheet is the **DPS** step; APS also gains `nexusSpeedPerTierPct` increased each tier.
 * That extra attack speed is **removed from per-hit scaling** here (`× 100/(100+speed%)` of the headline mult,
 * i.e. `nexusDamageMult ÷ (1 + speed%/100)`), so per-tier `hit mult × APS mult = nexusDamageMult`.
 */
export function nexusPerHitDamageMultPerTier(): number {
  const C = FORMULA_CONSTANTS;
  return (C.nexusDamageMult * 100) / (100 + C.nexusSpeedPerTierPct);
}

export interface NexusTierRow {
  tier: number;
  physMin: number;
  physMax: number;
  elementalMin: number;
  elementalMax: number;
  chaosMin: number;
  chaosMax: number;
  health: number;
  attacksPerSecond: number;
  accuracy: number;
  evasion: number;
  armour: number;
  elementalResPercent: number;
  chaosResPercent: number;
  physDps: number;
  eleDps: number;
  chaosDps: number;
}

function n(
  tier: number,
  physMin: number,
  physMax: number,
  eleMin: number,
  eleMax: number,
  chaosMin: number,
  chaosMax: number,
  health: number,
  aps: number,
  acc: number,
  eva: number,
  arm: number,
  eleRes: number,
  chaosRes: number,
  physDps: number,
  eleDps: number,
  chaosDps: number
): NexusTierRow {
  return {
    tier,
    physMin,
    physMax,
    elementalMin: eleMin,
    elementalMax: eleMax,
    chaosMin,
    chaosMax,
    health,
    attacksPerSecond: aps,
    accuracy: acc,
    evasion: eva,
    armour: arm,
    elementalResPercent: eleRes,
    chaosResPercent: chaosRes,
    physDps,
    eleDps,
    chaosDps,
  };
}

/**
 * Template row (relative shape). Tier 0 in `buildNexusTierRows` is derived from this plus `enemyStatsAtLevel(100)`.
 */
const NEXUS_TIER_0_SEED = n(
  0,
  286,
  400,
  572,
  800,
  380,
  532,
  30003,
  0.95,
  327,
  4402,
  2763,
  15,
  0,
  326,
  652,
  433
);

const MAX_NEXUS_TIER = 30;

function nexusTier0AtLevel100(template: NexusTierRow): NexusTierRow {
  const L = enemyStatsAtLevel(NEXUS_ENEMY_LEVEL_ANCHOR);
  const hitSpan = template.physMin + template.physMax;
  const kHit = hitSpan > 0 ? (L.damageMin + L.damageMax) / hitSpan : 1;
  return n(
    0,
    Math.round(template.physMin * kHit),
    Math.round(template.physMax * kHit),
    Math.round(template.elementalMin * kHit),
    Math.round(template.elementalMax * kHit),
    Math.round(template.chaosMin * kHit),
    Math.round(template.chaosMax * kHit),
    Math.max(1, Math.round(L.life)),
    Math.max(0.05, Number(L.speed.toFixed(3))),
    Math.round(L.accuracy),
    Math.round(L.evasion),
    Math.round(L.armour),
    template.elementalResPercent,
    template.chaosResPercent,
    Math.round(template.physDps * kHit),
    Math.round(template.eleDps * kHit),
    Math.round(template.chaosDps * kHit)
  );
}

/**
 * Build tiers 0…MAX_NEXUS_TIER from tier 0 and formulas.csv multipliers.
 * Tier 0 is anchored to {@link enemyStatsAtLevel} at {@link NEXUS_ENEMY_LEVEL_ANCHOR}.
 */
export function buildNexusTierRows(): NexusTierRow[] {
  const C = FORMULA_CONSTANTS;
  const lifeMult = C.nexusLifeMult;
  const dpsMultPerTier = C.nexusDamageMult;
  const speedMultPerTier = 1 + C.nexusSpeedPerTierPct / 100;
  const hitMultPerTier = nexusPerHitDamageMultPerTier();

  const tier0 = nexusTier0AtLevel100(NEXUS_TIER_0_SEED);
  const rows: NexusTierRow[] = [tier0];
  for (let t = 1; t <= MAX_NEXUS_TIER; t++) {
    const prev = rows[t - 1]!;
    rows.push(
      n(
        t,
        Math.round(prev.physMin * hitMultPerTier),
        Math.round(prev.physMax * hitMultPerTier),
        Math.round(prev.elementalMin * hitMultPerTier),
        Math.round(prev.elementalMax * hitMultPerTier),
        Math.round(prev.chaosMin * hitMultPerTier),
        Math.round(prev.chaosMax * hitMultPerTier),
        Math.round(prev.health * lifeMult),
        Number((prev.attacksPerSecond * speedMultPerTier).toFixed(3)),
        tier0.accuracy,
        tier0.evasion,
        tier0.armour,
        tier0.elementalResPercent,
        tier0.chaosResPercent,
        Math.round(prev.physDps * dpsMultPerTier),
        Math.round(prev.eleDps * dpsMultPerTier),
        Math.round(prev.chaosDps * dpsMultPerTier)
      )
    );
  }
  return rows;
}

/** Tiers 0–30 derived from formulas.csv (see module doc). */
export let NEXUS_TIER_ROWS: readonly NexusTierRow[] = buildNexusTierRows();

/** Recompute rows after live formula constant patches (e.g. from the Formulas sheet). */
export function rebuildNexusTierRowsFromConstants(): void {
  NEXUS_TIER_ROWS = buildNexusTierRows();
}

/** Called if you load a full Nexus table from CSV instead of generated rows. */
export function updateNexusTierRows(rows: NexusTierRow[]): void {
  NEXUS_TIER_ROWS = rows;
}

export function getNexusTierRow(tier: number): NexusTierRow | undefined {
  const t = Math.max(0, Math.floor(tier));
  return NEXUS_TIER_ROWS.find((r) => r.tier === t);
}

/**
 * Crucible scaling per formulas.csv: "nexus scaling divided into five steps".
 * Crucible 5 == Nexus 1, Crucible 10 == Nexus 2, etc.
 *
 * Hit damage uses per-tier hit mult^steps; APS uses speed mult^steps; life uses life mult^steps;
 * reference DPS uses nexusDamageMult^steps (hit × APS growth = nexusDamageMult per full nexus tier).
 */
export function getCrucibleTierRow(crucibleTier: number): NexusTierRow | undefined {
  const t0 = getNexusTierRow(0);
  if (!t0) return undefined;
  const ct = Math.max(0, Math.floor(crucibleTier));
  const steps = ct / 5;
  const C = FORMULA_CONSTANTS;
  const lifeMult = Math.pow(C.nexusLifeMult, steps);
  const dpsMult = Math.pow(C.nexusDamageMult, steps);
  const speedMult = Math.pow(1 + C.nexusSpeedPerTierPct / 100, steps);
  const hitMultPow = Math.pow(nexusPerHitDamageMultPerTier(), steps);

  return {
    tier: ct,
    physMin: Math.round(t0.physMin * hitMultPow),
    physMax: Math.round(t0.physMax * hitMultPow),
    elementalMin: Math.round(t0.elementalMin * hitMultPow),
    elementalMax: Math.round(t0.elementalMax * hitMultPow),
    chaosMin: Math.round(t0.chaosMin * hitMultPow),
    chaosMax: Math.round(t0.chaosMax * hitMultPow),
    health: Math.round(t0.health * lifeMult),
    attacksPerSecond: Number((t0.attacksPerSecond * speedMult).toFixed(3)),
    accuracy: t0.accuracy,
    evasion: t0.evasion,
    armour: t0.armour,
    elementalResPercent: t0.elementalResPercent,
    chaosResPercent: t0.chaosResPercent,
    physDps: Math.round(t0.physDps * dpsMult),
    eleDps: Math.round(t0.eleDps * dpsMult),
    chaosDps: Math.round(t0.chaosDps * dpsMult),
  };
}
