/**
 * All formula constants used in damage, evasion, ailment, and enemy calculations.
 * Default values match formulas/variables.csv (which feeds the "Formulas" Google Sheets tab).
 * Game designers can override any value live from the sheet without a redeploy.
 */

export interface FormulaConstants {
  // ---- Armour DR ----
  /** Main scaling constant (K in: FINAL_ARMOUR / (K*(dmg/(dmg+dmgRef)) + FINAL_ARMOUR)). Default 10000. */
  armourDrScaling: number;
  /** Damage reference in the dmg/(dmg+K) fraction. Default 500. */
  armourDrDamageRef: number;
  /** Hard cap on damage reduction from armour (fraction, e.g. 0.9 = 90%). Default 0.9. */
  armourDrCap: number;

  // ---- Armour effectiveness per damage type ----
  armourVsPhysical:  number; // 1.0
  armourVsFire:      number; // 0.5
  armourVsCold:      number; // 0.5
  armourVsLightning: number; // 0.5
  armourVsChaos:     number; // 0.25

  // ---- Evasion / accuracy ----
  /** Accuracy coefficient K in: evasion = 1 - ACC*K/(ACC+EVA*divisor). Default 1.35. */
  evasionAccCoeff:  number;
  /** Evasion divisor. Default 0.1. */
  evasionDivisor:   number;
  /** Hard cap on evasion chance (fraction). Default 0.9. */
  evasionCap:       number;

  // ---- Resistances ----
  /** Base cap for elemental resistances (%). Default 75. */
  elementalResCap: number;
  /** Base cap for chaos resistance (%). Default 75. */
  chaosResCap:     number;
  /** Absolute max resistance even with +max res gear (%). Default 90. */
  resistanceHardCap: number;
  /** Enemy elemental resistance gained per zone above zone 1 (%). Default 3. */
  enemyEleResPerZone: number;
  /** Maximum enemy elemental resistance from zone scaling (%). Default 15. */
  enemyEleResMax: number;

  // ---- Ailments (non-damaging) ----
  /** Pool divisor: ailment = sqrt(dmg / ((life+es)*K)). Default 5. */
  ailmentPoolDivisor:   number;
  /** Extra effect multiplier for shock (player-sourced = 1.0; enemy-sourced = 0.7). Default 1.0. */
  shockExtraEffectMult: number;
  /** Special multiplier for chill vs shock. Default 0.7. */
  chillSpecialMult:     number;
  /** Base shock/chill duration (seconds) before increased duration. Default 1.8. */
  ailmentBaseDurationSec: number;

  // ---- Ailments (damaging) ----
  /** Bleed inherent multiplier (applied to pre-mitigation physical). Default 0.3. */
  bleedInherentMult:  number;
  /** Ignite inherent multiplier (applied to pre-mitigation fire). Default 0.45. */
  igniteInherentMult: number;
  /** Poison inherent multiplier (applied to pre-mitigation chaos or physical). Default 0.15. */
  poisonInherentMult: number;

  // ---- Enemy base stats ----
  enemyBaseLife:            number; // 40
  enemyBaseArmour:          number; // 1
  enemyBaseEvasion:         number; // 50
  enemyBaseSpeed:           number; // 0.95
  enemyBaseAccuracy:        number; // 12
  enemyBaseCritChance:      number; // 5 (%)
  enemyBaseCritMultiplier:  number; // 1.5
  enemyBaseDamageMin:       number; // 5
  enemyBaseDamageMax:       number; // 7
  enemyBaseEleDamageMult:   number; // 2.0 (at level 100)
  enemyBaseChaosDamageMult: number; // 1.33 (at level 100)
  enemyShockChillEffect:    number; // 1.0

  // ---- Enemy per-level scaling: stat = prev * (1 + A * B^(level-2)) ----
  enemyLifeScaleA:     number; enemyLifeScaleB:     number;
  enemyDamageScaleA:   number; enemyDamageScaleB:   number;
  enemyAccuracyScaleA: number; enemyAccuracyScaleB: number;
  enemyEvasionScaleA:  number; enemyEvasionScaleB:  number;
  enemyArmourScaleA:   number; enemyArmourScaleB:   number;

  // ---- Enemy rarity multipliers ----
  eliteLifeMult:   number; // 1.8
  eliteDamageMult: number; // 1.4
  eliteRegenMult:  number; // 1.4
  bossLifeMult:    number; // 2.6
  bossDamageMult:  number; // 1.8
  bossRegenMult:   number; // 1.8

  // ---- Nexus/Crucible tier scaling (see nexusEnemyScaling.ts) ----
  /** Life & life-linked regen: × per tier vs previous. */
  nexusLifeMult:          number; // 1.27479
  /**
   * Sheet: damage (previous tier) × this value (1.2589) = **DPS** step per tier. Enemies also gain
   * `nexusSpeedPerTierPct` increased APS each tier; **per-hit** min/max use `nexusPerHitDamageMultPerTier`
   * in `nexusEnemyScaling.ts` (`nexusDamageMult × 100/(100+speed%)`) so the speed tier is removed from hit
   * damage and DPS stays × `nexusDamageMult`, not ×1.2589×1.05.
   */
  nexusDamageMult:        number; // 1.2589
  /** % increased enemy APS per tier; “removed” from hit-damage mult vs headline 1.2589 so DPS matches sheet. */
  nexusSpeedPerTierPct:   number; // 5

  // ---- Enemy mod values ----
  modVitalLife:           number;  // 20
  modPlatedArmour:        number;  // 1
  modElusiveEvasion:      number;  // 30
  modBarrierEs:           number;  // 20
  modHallowedChaosRes:    number;  // 25
  modWardedEleRes:        number;  // 20
  modRegeneratingLifeRegen: number; // 2
  modReplenishingEsRegen: number;  // 2
  modPowerfulDamageMult:  number;  // 1.5
  modSwiftSpeed:          number;  // 0.5
  modDeadeyeAccuracy:     number;  // 15
  modAssassinCritChance:  number;  // 70 (%)
  modSunderingArmourIgnore: number; // 25 (%)
  modSunderingPen:        number;  // 20 (%)
  modDefenderBlock:       number;  // 50 (%)
  modPhasingDodge:        number;  // 25 (%)
  modVampiricLifeLeech:   number;  // 160 (%)
  modSoulEaterEsLeech:    number;  // 160 (%)
  modFragileLife:         number;  // -14
  modSlowSpeed:           number;  // -0.33
  modWeakDamageMult:      number;  // 0.66
}

export let FORMULA_CONSTANTS: FormulaConstants = {
  armourDrScaling:    10000,
  armourDrDamageRef:  500,
  armourDrCap:        0.9,

  armourVsPhysical:   1.0,
  armourVsFire:       0.5,
  armourVsCold:       0.5,
  armourVsLightning:  0.5,
  armourVsChaos:      0.25,

  evasionAccCoeff:    1.35,
  evasionDivisor:     0.1,
  evasionCap:         0.9,

  elementalResCap:    75,
  chaosResCap:        75,
  resistanceHardCap:  90,
  enemyEleResPerZone: 3,
  enemyEleResMax:     15,

  ailmentPoolDivisor:     5,
  shockExtraEffectMult:   1.0,
  chillSpecialMult:       0.7,
  ailmentBaseDurationSec: 1.8,

  bleedInherentMult:  0.3,
  igniteInherentMult: 0.45,
  poisonInherentMult: 0.15,

  enemyBaseLife:            40,
  enemyBaseArmour:          1,
  enemyBaseEvasion:         50,
  enemyBaseSpeed:           0.95,
  enemyBaseAccuracy:        12,
  enemyBaseCritChance:      5,
  enemyBaseCritMultiplier:  1.5,
  enemyBaseDamageMin:       5,
  enemyBaseDamageMax:       7,
  enemyBaseEleDamageMult:   2.0,
  enemyBaseChaosDamageMult: 1.33,
  enemyShockChillEffect:    1.0,

  enemyLifeScaleA:     0.108,    enemyLifeScaleB:     0.990201,
  enemyDamageScaleA:   0.089,    enemyDamageScaleB:   0.98217,
  enemyAccuracyScaleA: 0.062,    enemyAccuracyScaleB: 0.9863,
  enemyEvasionScaleA:  0.103,    enemyEvasionScaleB:  0.981,
  enemyArmourScaleA:   0.17,     enemyArmourScaleB:   0.9835,

  eliteLifeMult:   1.8,
  eliteDamageMult: 1.4,
  eliteRegenMult:  1.4,
  bossLifeMult:    2.6,
  bossDamageMult:  1.8,
  bossRegenMult:   1.8,

  nexusLifeMult:        1.27479,
  nexusDamageMult:      1.2589,
  nexusSpeedPerTierPct: 5,

  modVitalLife:             20,
  modPlatedArmour:          1,
  modElusiveEvasion:        30,
  modBarrierEs:             20,
  modHallowedChaosRes:      25,
  modWardedEleRes:          20,
  modRegeneratingLifeRegen: 2,
  modReplenishingEsRegen:   2,
  modPowerfulDamageMult:    1.5,
  modSwiftSpeed:            0.5,
  modDeadeyeAccuracy:       15,
  modAssassinCritChance:    70,
  modSunderingArmourIgnore: 25,
  modSunderingPen:          20,
  modDefenderBlock:         50,
  modPhasingDodge:          25,
  modVampiricLifeLeech:     160,
  modSoulEaterEsLeech:      160,
  modFragileLife:           -14,
  modSlowSpeed:             -0.33,
  modWeakDamageMult:        0.66,
};

/** Called by GameDataProvider after fetching the Formulas sheet tab. */
export function updateFormulaConstants(patch: Partial<FormulaConstants>): void {
  FORMULA_CONSTANTS = { ...FORMULA_CONSTANTS, ...patch };
}

// ---------------------------------------------------------------------------
// Helpers used by the battle engine and build planner
// ---------------------------------------------------------------------------

/**
 * Scale an enemy stat from level 1 to the given level using the per-level formula:
 *   stat_at_level = stat_base * Π_{l=2}^{level} (1 + A * B^(l-2))
 */
export function scaleEnemyStatToLevel(
  base: number,
  level: number,
  scaleA: number,
  scaleB: number
): number {
  if (level <= 1) return base;
  let v = base;
  for (let l = 2; l <= level; l++) {
    v *= 1 + scaleA * Math.pow(scaleB, l - 2);
  }
  return v;
}

/** Returns enemy base stats scaled to the given level. */
export function enemyStatsAtLevel(level: number): {
  life: number; armour: number; evasion: number; speed: number;
  accuracy: number; damageMin: number; damageMax: number;
} {
  const C = FORMULA_CONSTANTS;
  return {
    life:      scaleEnemyStatToLevel(C.enemyBaseLife,      level, C.enemyLifeScaleA,     C.enemyLifeScaleB),
    armour:    scaleEnemyStatToLevel(C.enemyBaseArmour,    level, C.enemyArmourScaleA,   C.enemyArmourScaleB),
    evasion:   scaleEnemyStatToLevel(C.enemyBaseEvasion,   level, C.enemyEvasionScaleA,  C.enemyEvasionScaleB),
    // APS is not scaled by enemy level (sheet: life/damage/accuracy/evasion/armour curves only).
    // Nexus / Crucible tiers apply +5% APS per tier with damage adjusted so DPS matches (see nexusEnemyScaling).
    speed:     C.enemyBaseSpeed,
    accuracy:  scaleEnemyStatToLevel(C.enemyBaseAccuracy,  level, C.enemyAccuracyScaleA, C.enemyAccuracyScaleB),
    damageMin: scaleEnemyStatToLevel(C.enemyBaseDamageMin, level, C.enemyDamageScaleA,   C.enemyDamageScaleB),
    damageMax: scaleEnemyStatToLevel(C.enemyBaseDamageMax, level, C.enemyDamageScaleA,   C.enemyDamageScaleB),
  };
}
