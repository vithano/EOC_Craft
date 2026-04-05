/**
 * Formula constants for damage calculation — sourced from the "Formulas" Google Sheets tab.
 * Default values match formulas/damage_formulas.csv and the existing hard-coded logic.
 *
 * All values are mutable via updateFormulaConstants() which is called by GameDataProvider
 * after the sheet fetch, giving game designers live control over these numbers.
 */

export interface FormulaConstants {
  // ---- Armour damage reduction ----
  /** Armour DR formula constant C1 (damage reference & denominator base). Default 500. */
  armourDrC1: number;
  /** Armour DR formula scaling multiplier C2. Default 18. */
  armourDrC2: number;
  /** Hard cap on armour damage reduction (%). Default 90. */
  armourDrCap: number;

  // ---- Armour effectiveness per damage type ----
  /** Multiplier applied to armour rating when defending vs physical. Default 1.0. */
  armourVsPhysical: number;
  /** Multiplier applied to armour rating when defending vs elemental. Default 0.5. */
  armourVsElemental: number;
  /** Multiplier applied to armour rating when defending vs chaos. Default 0.25. */
  armourVsChaos: number;

  // ---- Evasion / accuracy ----
  /** Accuracy coefficient in evasion formula (K in: 1 − ACC×K / (ACC + EVA×divisor)). Default 1.35. */
  evasionAccCoeff: number;
  /** Evasion divisor in evasion formula. Default 0.1. */
  evasionDivisor: number;
  /** Hard cap on evasion chance (%). Default 90. */
  evasionCap: number;

  // ---- Resistances ----
  /** Base cap for elemental resistances (fire/cold/lightning) (%). Default 75. */
  elementalResCap: number;
  /** Base cap for chaos resistance (%). Default 75. */
  chaosResCap: number;

  // ---- Ailments ----
  /** Divisor on the life+ES pool in the ailment effect formula. Default 5. */
  ailmentPoolDivisor: number;
  /** Extra effect multiplier for shock. Default 1.4. */
  shockExtraEffectMult: number;
  /** Special reduction multiplier for chill. Default 0.7. */
  chillSpecialMult: number;
  /** Base shock/chill duration in seconds before increased duration modifiers. Default 1.8. */
  ailmentBaseDurationSec: number;

  // ---- Scaling reference values ----
  /** Reference player accuracy at level 100 (used in default evasion previews). Default 317. */
  level100PlayerAccuracy: number;
  /** Reference enemy accuracy at level 100 (used in default hit-chance preview). Default 327. */
  level100EnemyAccuracy: number;
  /** Reference enemy evasion at level 100 (used in default hit-chance preview). Default 4402. */
  level100EnemyEvasion: number;
}

export let FORMULA_CONSTANTS: FormulaConstants = {
  armourDrC1: 500,
  armourDrC2: 18,
  armourDrCap: 90,

  armourVsPhysical: 1.0,
  armourVsElemental: 0.5,
  armourVsChaos: 0.25,

  evasionAccCoeff: 1.35,
  evasionDivisor: 0.1,
  evasionCap: 90,

  elementalResCap: 75,
  chaosResCap: 75,

  ailmentPoolDivisor: 5,
  shockExtraEffectMult: 1.4,
  chillSpecialMult: 0.7,
  ailmentBaseDurationSec: 1.8,

  level100PlayerAccuracy: 317,
  level100EnemyAccuracy: 327,
  level100EnemyEvasion: 4402,
};

/** Called by GameDataProvider after fetching the Formulas sheet tab. */
export function updateFormulaConstants(patch: Partial<FormulaConstants>): void {
  FORMULA_CONSTANTS = { ...FORMULA_CONSTANTS, ...patch };
}
