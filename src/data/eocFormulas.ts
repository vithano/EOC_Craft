/**
 * Echoes of Creation formulas — coefficients come from FORMULA_CONSTANTS so
 * game designers can tune them live via the "Formulas" Google Sheets tab.
 */

import { FORMULA_CONSTANTS } from './formulaConstants';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// ---------------------------------------------------------------------------
// Scaling reference values (level-100 defaults, overridable from sheet)
// ---------------------------------------------------------------------------

export function getLevel100PlayerAccuracy(): number { return FORMULA_CONSTANTS.level100PlayerAccuracy; }
export function getLevel100EnemyAccuracy():  number { return FORMULA_CONSTANTS.level100EnemyAccuracy; }
export function getLevel100EnemyEvasion():   number { return FORMULA_CONSTANTS.level100EnemyEvasion; }

// Keep named exports for backwards-compat with existing imports
export const LEVEL_100_PLAYER_ACCURACY = 317;
export const LEVEL_100_ENEMY_ACCURACY  = 327;
export const LEVEL_100_ENEMY_EVASION   = 4402;

// ---------------------------------------------------------------------------
// Ailment duration
// ---------------------------------------------------------------------------

/**
 * Base duration (seconds) for shock and chill before increased ailment duration.
 * Read live from FORMULA_CONSTANTS so the sheet can adjust it.
 */
export function getBaseShockChillDurationSec(): number {
  return FORMULA_CONSTANTS.ailmentBaseDurationSec;
}
/** @deprecated Use getBaseShockChillDurationSec() — kept for existing call-sites. */
export const BASE_SHOCK_CHILL_DURATION_SEC = 1.8;

// ---------------------------------------------------------------------------
// Evasion / accuracy  (Evasion_Accuracy.csv)
// ---------------------------------------------------------------------------

/**
 * evasion_chance = clamp(0..cap, (1 − ACC×K / (ACC + EVA×divisor)) + flat_final)
 */
export function computeEvasionChancePercent(
  attackerAccuracy: number,
  defenderEvasion: number,
  flatFinalEvasionChancePercent = 0
): number {
  const { evasionAccCoeff, evasionDivisor, evasionCap } = FORMULA_CONSTANTS;
  const acc = Math.max(0, attackerAccuracy);
  const eva = Math.max(0, defenderEvasion);
  const denom = acc + eva * evasionDivisor;
  if (denom <= 0) return clamp(flatFinalEvasionChancePercent, 0, evasionCap);
  const raw = 1 - (acc * evasionAccCoeff) / denom;
  return clamp(raw * 100 + flatFinalEvasionChancePercent, 0, evasionCap);
}

export function computeHitChancePercent(
  attackerAccuracy: number,
  defenderEvasion: number,
  flatFinalEvasionChancePercent = 0
): number {
  return 100 - computeEvasionChancePercent(attackerAccuracy, defenderEvasion, flatFinalEvasionChancePercent);
}

// ---------------------------------------------------------------------------
// Non-damaging ailment effect  (Non-Damaging Ailment Effect.csv)
// ---------------------------------------------------------------------------

/**
 * ailment = sqrt(dmg / ((life + es) × divisor)) × ailmentMult × extraMult × chillMult
 */
export function computeNonDamagingAilmentEffectPercent(
  damageValidPostMitigation: number,
  lifeDefender: number,
  energyShieldDefender: number,
  ailmentMultiplier = 1,
  extraEffectMultiplier: 1 | 1.4 = 1,
  specialChillMultiplier: 1 | 0.7 = 1
): number {
  const { ailmentPoolDivisor } = FORMULA_CONSTANTS;
  const pool = Math.max(0, lifeDefender) + Math.max(0, energyShieldDefender);
  if (pool <= 0 || damageValidPostMitigation <= 0) return 0;
  const base = Math.sqrt(damageValidPostMitigation / (pool * ailmentPoolDivisor));
  return base * ailmentMultiplier * extraEffectMultiplier * specialChillMultiplier * 100;
}

/** Same formula expressed with damage already as a fraction of (life+ES). */
export function computeNonDamagingAilmentEffectFromValidPercentOfLifeEs(
  validDamageAsPercentOfLifeAndEs: number,
  ailmentMultiplier = 1,
  extraEffectMultiplier: 1 | 1.4 = 1,
  specialChillMultiplier: 1 | 0.7 = 1
): number {
  const { ailmentPoolDivisor } = FORMULA_CONSTANTS;
  const p = Math.max(0, validDamageAsPercentOfLifeAndEs) / 100;
  const base = Math.sqrt(p / ailmentPoolDivisor);
  return base * ailmentMultiplier * extraEffectMultiplier * specialChillMultiplier * 100;
}
