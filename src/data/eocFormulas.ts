/**
 * Echoes of Creation formulas sourced from `formulas/*.csv` (spreadsheet exports).
 */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Level 100 reference values (Evasion_Accuracy.csv notes). */
export const LEVEL_100_PLAYER_ACCURACY = 317;
export const LEVEL_100_ENEMY_ACCURACY = 327;
export const LEVEL_100_ENEMY_EVASION = 4402;

/**
 * Evasion_Accuracy.csv:
 * (1 - ((ACC * 1.35) / (ACC + (EVA * 0.1)))) + Flat Final Evasion Chance
 * Evasion chance is clamped to [0%, 90%].
 */
export function computeEvasionChancePercent(
  attackerAccuracy: number,
  defenderEvasion: number,
  flatFinalEvasionChancePercent = 0
): number {
  const acc = Math.max(0, attackerAccuracy);
  const eva = Math.max(0, defenderEvasion);
  const denom = acc + eva * 0.1;
  if (denom <= 0) {
    return clamp(flatFinalEvasionChancePercent, 0, 90);
  }
  const raw = 1 - (acc * 1.35) / denom;
  return clamp(raw * 100 + flatFinalEvasionChancePercent, 0, 90);
}

export function computeHitChancePercent(
  attackerAccuracy: number,
  defenderEvasion: number,
  flatFinalEvasionChancePercent = 0
): number {
  return 100 - computeEvasionChancePercent(attackerAccuracy, defenderEvasion, flatFinalEvasionChancePercent);
}

/**
 * Non-Damaging Ailment Effect.csv:
 * ((damage_valid_attacker / ((life_defender + energyshield_defender) * 5)) ^ 0.5)
 *   * ailmentMultiplier * extraEffectMultiplier * specialChillMultiplier
 *
 * damage_valid_attacker: post-mitigation valid hit damage (sum of relevant types).
 */
export function computeNonDamagingAilmentEffectPercent(
  damageValidPostMitigation: number,
  lifeDefender: number,
  energyShieldDefender: number,
  ailmentMultiplier = 1,
  extraEffectMultiplier: 1 | 1.4 = 1,
  specialChillMultiplier: 1 | 0.7 = 1
): number {
  const pool = Math.max(0, lifeDefender) + Math.max(0, energyShieldDefender);
  if (pool <= 0 || damageValidPostMitigation <= 0) return 0;
  const base = Math.sqrt(damageValidPostMitigation / (pool * 5));
  return base * ailmentMultiplier * extraEffectMultiplier * specialChillMultiplier * 100;
}

/** Same formula expressed with damage already as a fraction of (life+ES). */
export function computeNonDamagingAilmentEffectFromValidPercentOfLifeEs(
  validDamageAsPercentOfLifeAndEs: number,
  ailmentMultiplier = 1,
  extraEffectMultiplier: 1 | 1.4 = 1,
  specialChillMultiplier: 1 | 0.7 = 1
): number {
  const p = Math.max(0, validDamageAsPercentOfLifeAndEs) / 100;
  const base = Math.sqrt(p / 5);
  return base * ailmentMultiplier * extraEffectMultiplier * specialChillMultiplier * 100;
}
