/**
 * Nexus Tier Enemy Scaling — derived from `formulas.csv` (nexus scaling per tier).
 *
 * Per tier (from previous tier):
 * - Life × nexusLifeMult (1.27479)
 * - Regeneration (when modeled off scaled life, e.g. mods) follows the same life scaling in practice.
 * - Hit damage (min/max per type) × (nexusDamageMult / (1 + nexusSpeedPerTierPct/100)) so that
 *   combined with +5% APS per tier, DPS grows by nexusDamageMult (1.2589) per tier.
 * - APS × (1 + nexusSpeedPerTierPct/100) each tier.
 * - physDps / eleDps / chaosDps (reference DPS) × nexusDamageMult per tier.
 *
 * Accuracy, evasion, armour, and resistances do **not** scale with Nexus tier (tier 0 values are reused).
 */

import { FORMULA_CONSTANTS } from "./formulaConstants";

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

/** Tier 0 baseline (Nexus 0). Only life, damage, APS, and DPS columns scale per tier; other fields stay fixed. */
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

/**
 * Build tiers 0…MAX_NEXUS_TIER from tier 0 and formulas.csv multipliers.
 * Uses iterative rounding (same as a hand-maintained table).
 */
export function buildNexusTierRows(): NexusTierRow[] {
  const C = FORMULA_CONSTANTS;
  const lifeMult = C.nexusLifeMult;
  const dpsMultPerTier = C.nexusDamageMult;
  const speedMultPerTier = 1 + C.nexusSpeedPerTierPct / 100;
  const hitMultPerTier = C.nexusDamageMult / speedMultPerTier;

  const rows: NexusTierRow[] = [NEXUS_TIER_0_SEED];
  for (let t = 1; t <= MAX_NEXUS_TIER; t++) {
    const prev = rows[t - 1]!;
    const seed = NEXUS_TIER_0_SEED;
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
        seed.accuracy,
        seed.evasion,
        seed.armour,
        seed.elementalResPercent,
        seed.chaosResPercent,
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
  const hitMult = C.nexusDamageMult / (1 + C.nexusSpeedPerTierPct / 100);
  const hitMultPow = Math.pow(hitMult, steps);

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
