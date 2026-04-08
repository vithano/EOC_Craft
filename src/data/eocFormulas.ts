/**
 * Echoes of Creation formulas — all coefficients read from FORMULA_CONSTANTS
 * so game designers can tune them live via the "Formulas" Google Sheets tab.
 *
 * Sources: formulas.csv (armour, evasion, ailments), variables.csv (constants).
 */

import { FORMULA_CONSTANTS } from './formulaConstants';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

function discardBelow001(n: number): number {
  return n < 0.01 ? 0 : n;
}

// ---------------------------------------------------------------------------
// Backward-compat constant exports (callers can migrate to FORMULA_CONSTANTS)
// ---------------------------------------------------------------------------
export const BASE_SHOCK_CHILL_DURATION_SEC = 3;
export const LEVEL_100_PLAYER_ACCURACY = 317;
export const LEVEL_100_ENEMY_ACCURACY  = 327;
export const LEVEL_100_ENEMY_EVASION   = 4402;

export function getBaseShockChillDurationSec(): number {
  return FORMULA_CONSTANTS.ailmentBaseDurationSec;
}

// ---------------------------------------------------------------------------
// Armour damage reduction (formulas.csv)
//
// ARMOUR_RESISTANCE   = 1 - (dmg_this_type / dmg_total_all_types)
// FINAL_ARMOUR        = armour * (1 - armourIgnoredFrac) * effectiveness * (1 - ARMOUR_RESISTANCE)
// DR_FROM_ARMOUR      = FINAL_ARMOUR / (scaling*(dmg/(dmg+dmgRef)) + FINAL_ARMOUR) + additionalDR
// capped at armourDrCap
//
// When the hit is a single damage type, dmgTotal = dmgThisType → ARMOUR_RESISTANCE = 0
// (full armour applies, no splitting needed).
// ---------------------------------------------------------------------------

export type ArmourDamageType = 'physical' | 'fire' | 'cold' | 'lightning' | 'chaos';

export function armourEffectivenessForType(type: ArmourDamageType): number {
  const C = FORMULA_CONSTANTS;
  switch (type) {
    case 'physical':  return C.armourVsPhysical;
    case 'fire':      return C.armourVsFire;
    case 'cold':      return C.armourVsCold;
    case 'lightning': return C.armourVsLightning;
    case 'chaos':     return C.armourVsChaos;
  }
}

/**
 * Full multi-type armour DR formula from formulas.csv.
 *
 * @param armour            Defender raw armour rating (before effectiveness & ignore)
 * @param damageThisType    Final damage of this specific type
 * @param damageTotalAllTypes Final damage of ALL types combined (same hit)
 * @param type              Damage type (determines armour effectiveness)
 * @param armourIgnoredFrac Fraction of armour ignored by attacker (0–1)
 * @param additionalDR      Flat additional DR added after armour formula (fraction)
 */
export function computeArmourDR(
  armour: number,
  damageThisType: number,
  damageTotalAllTypes: number,
  type: ArmourDamageType = 'physical',
  armourIgnoredFrac = 0,
  additionalDR = 0
): number {
  const { armourDrScaling, armourDrDamageRef, armourDrCap } = FORMULA_CONSTANTS;
  const dmg = Math.max(0, damageThisType);
  const total = Math.max(dmg, damageTotalAllTypes);

  const armourResistance = total > 0 ? 1 - dmg / total : 0;
  const effectiveness = armourEffectivenessForType(type);
  const finalArmour = Math.max(0, armour) * (1 - clamp(armourIgnoredFrac, 0, 1)) * effectiveness * (1 - armourResistance);

  if (finalArmour <= 0) return clamp(additionalDR, 0, armourDrCap);
  const scaling = armourDrScaling * (dmg / (dmg + armourDrDamageRef));
  const dr = finalArmour / (scaling + finalArmour) + additionalDR;
  return clamp(dr, 0, armourDrCap);
}

/**
 * Simplified single-type wrapper (backwards-compat with existing call-sites).
 * Returns DR as a fraction (0–0.9).
 */
export function computeArmourDRSingleType(
  armour: number,
  incomingDamage: number,
  type: ArmourDamageType = 'physical',
  armourIgnoredFrac = 0,
  additionalDR = 0
): number {
  return computeArmourDR(armour, incomingDamage, incomingDamage, type, armourIgnoredFrac, additionalDR);
}

// ---------------------------------------------------------------------------
// Evasion / accuracy (formulas.csv)
// EVASION_CHANCE = clamp(0..cap, (1 - ACC*K / (ACC + EVA*divisor)) + flat)
// ---------------------------------------------------------------------------

export function computeEvasionChancePercent(
  attackerAccuracy: number,
  defenderEvasion: number,
  flatFinalEvasionChancePercent = 0
): number {
  const { evasionAccCoeff, evasionDivisor, evasionCap } = FORMULA_CONSTANTS;
  const acc  = Math.max(0, attackerAccuracy);
  const eva  = Math.max(0, defenderEvasion);
  const denom = acc + eva * evasionDivisor;
  // Sheet note: evasion chance is rounded to two decimal places.
  if (denom <= 0) return roundTo2(clamp(flatFinalEvasionChancePercent, 0, evasionCap * 100));
  const raw = 1 - (acc * evasionAccCoeff) / denom;
  return roundTo2(clamp(raw * 100 + flatFinalEvasionChancePercent, 0, evasionCap * 100));
}

export function computeHitChancePercent(
  attackerAccuracy: number,
  defenderEvasion: number,
  flatFinalEvasionChancePercent = 0
): number {
  return 100 - computeEvasionChancePercent(attackerAccuracy, defenderEvasion, flatFinalEvasionChancePercent);
}

// ---------------------------------------------------------------------------
// Non-damaging ailments (formulas.csv)
// AILMENT_EFFECT = sqrt(dmg / ((life+es)*divisor)) * ailmentMult * extraMult * chillMult
// ---------------------------------------------------------------------------

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
  // Sheet notes:
  // - effect is rounded to two decimals
  // - if effect < 0.01, discard
  return discardBelow001(roundTo2(base * ailmentMultiplier * extraEffectMultiplier * specialChillMultiplier * 100));
}

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
