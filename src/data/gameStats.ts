import type { UpgradeModifierKey } from './gameClasses'
import {
  GAME_CLASSES,
  GAME_CLASSES_BY_ID,
  BASE_GAME_STATS,
  getClassLevel,
  isClassBonusActive,
} from './gameClasses'
import { getItemDefinition, type ItemModifiers } from './equipment'
import {
  abilityManaCostAtLevel,
  abilityMatchesWeapon,
  attackDamageMultiplierAtAbilityLevel,
  EOC_ABILITY_BY_ID,
  extraStrikesFromAbilityLines,
  inflictAilmentBonusesFromAbilityLines,
  interpolateAttunementModifier,
  physicalElementConversionFromAbilityLines,
  scaledSpellHitForAbility,
  weaponAbilityTagFromItemId,
  type EocAbilityType,
} from './eocAbilities'
import {
  applyElementalToChaosConversionProv,
  applyGainPhysicalAsExtraLightningProv,
  applyGearPhysicalConversionProv,
  applyIncreasedToProvHitRows,
  applyLightningToColdConversionProv,
  applyPhysicalToRandomElementsProv,
  buildHitDamageByType,
  buildProvHitDamageByType,
  collapseProvRowsToHitDamage,
  increasedPctForProvHitRow,
  scaleHitDamageByType,
  localFlatDamageDisplayRange,
  mergePerInstanceBeforeIncreasedRows,
  normalizePhysicalConversionPcts,
  roundDamageNearest,
  scaleProvHitDamageRows,
  spellElementToHitDamageType,
  sumHitDamageRange,
  type HitDamageScaling,
  type HitDamageTypeRow,
} from './damageTypes'
import { EOC_UNIQUE_BY_ID, isUniqueItemId, resolveUniqueMods } from './eocUniques'
import { FORMULA_CONSTANTS } from './formulaConstants'
import {
  equipmentModifiersFromUniqueTexts,
  type UniqueGearStatPatch,
} from './uniqueGearMods'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Selected EOC ability for planner / combat preview (persisted with build). */
export interface AbilitySelectionState {
  abilityId: string | null
  abilityLevel: number
  attunementPct: number
}

export function normalizeAbilitySelection(raw: unknown): AbilitySelectionState {
  if (!raw || typeof raw !== 'object') {
    return { abilityId: null, abilityLevel: 0, attunementPct: 0 }
  }
  const o = raw as Record<string, unknown>
  const idRaw = o.abilityId
  // Only normalize shape/types here; existence is validated at point-of-use
  // (abilityForStats in BuildPlanner) so data can load asynchronously without
  // wiping a saved ability that isn't in the lookup yet.
  const abilityId = typeof idRaw === 'string' && idRaw.length > 0 ? idRaw : null
  const abilityLevel = Math.min(20, Math.max(0, Math.floor(Number(o.abilityLevel) || 0)))
  const attunementPct = Math.min(100, Math.max(0, Math.floor(Number(o.attunementPct) || 0)))
  return { abilityId, abilityLevel, attunementPct }
}

export interface BuildConfig {
  upgradeLevels: Record<string, number> // "classId/upgradeId" -> 0..5
  equipmentModifiers: EquipmentModifiers
  /** Optional weapon id for ability weapon-tag checks (e.g. equipped Weapon slot). */
  equippedWeaponItemId?: string | null
  ability?: AbilitySelectionState | null
}

/** Snapshot of how the selected ability changed offensive stats (for UI). */
export interface AbilityContributionSummary {
  id: string
  name: string
  type: EocAbilityType
  abilityLevel: number
  attunementPct: number
  scaledDamageMultiplierPct: number | null
  attackSpeedMultiplierPct: number | null
  addedDamageMultiplierPct: number | null
  spellDamageMin: number | null
  spellDamageMax: number | null
  spellElement: string | null
  effectiveCastTimeSeconds: number | null
  manaCost: number | null
  baselineHitMin: number
  baselineHitMax: number
  baselineAps: number
  baselineCritChance: number
}

/** One additive line contributing to an “increased” pool (upgrade / gear / class / level). */
export interface StatContributionLine {
  label: string
  value: number
}

/** Full attack hit pipeline: bases, conversion, per-instance scaling, crit, APS, DPS (planner). */
export interface HitDamageComputationBreakdown {
  baseWeaponDamage: {
    /** True when unarmed: physical includes character base hit damage + gear flat. False when a weapon is equipped (weapon replaces unarmed min/max). */
    includesCharacterBasePhysical: boolean
    /** Raw weapon / unarmed bases before melee-ranged ability damage multiplier (same inputs as initial hit rows). */
    beforeAbilityDamageMult: {
      physicalMin: number
      physicalMax: number
      elemental: Array<{ type: HitDamageTypeRow['type']; min: number; max: number }>
    }
    /** After ability mult (scaledPct/100), same as post-`scaleProvHitDamageRows` bases; rounded per component. Before conversion. */
    afterAbilityDamageMult: {
      physicalMin: number
      physicalMax: number
      elemental: Array<{ type: HitDamageTypeRow['type']; min: number; max: number }>
    }
  }
  abilityDamageMultiplier: null | {
    abilityId: string
    abilityName: string
    level: number
    basePct: number
    scaledPct: number
    /** Multiplier applied to all hit rows (scaledPct / 100). */
    factor: number
  }
  physicalConversion: {
    gearPct: { fire: number; cold: number; lightning: number }
    abilityPct: { fire: number; cold: number; lightning: number }
    combinedRawPct: { fire: number; cold: number; lightning: number }
    rawTotalPercent: number
    cappedAt100Percent: boolean
    normalizationFactor: number
    effectivePercent: { fire: number; cold: number; lightning: number }
  }
  laterConversions: Array<{ name: string; percent?: number }>
  increased: {
    attackIncSum: { total: number; lines: StatContributionLine[] }
    /** Global + attack + melee stack + phys attunement (not elemental Σ); same sum as `physStyleIncTotal` in prov ctx. */
    physStyleIncTotal: { total: number; lines: StatContributionLine[] }
    elemental: { total: number; lines: StatContributionLine[] }
    typeSpecificGear: { fire: number; cold: number; lightning: number; chaos: number }
    attunementFire: number
  }
  /**
   * After conversion, before “increased” modifiers; multiplier is 1 + increased%/100.
   * Rows with the same type and same increased multiplier are summed; min/max rounded again for display (see `mergePerInstanceBeforeIncreasedRows`).
   */
  perInstanceBeforeIncreased: Array<{
    type: HitDamageTypeRow['type']
    scaling: HitDamageScaling
    min: number
    max: number
    increasedDamagePercent: number
    damageMultiplier: number
    mergedFrom: number
    mergedScalings: HitDamageScaling[]
  }>
  collapsedAfterIncreased: HitDamageTypeRow[]
  avgHit: number
  critical: {
    critChance: number
    critMultiplier: number
    /** Expected damage vs non-crit: 1 + (critChance/100)×(critMultiplier−1). */
    effectiveDamageMultiplier: number
  }
  dps: {
    avgEffectiveDamage: number
    value: number
    attacksPerSecond: number
    apsContributions: StatContributionLine[]
    apsMoreMultipliers: Array<{ label: string; factor: number }>
    strikesPerAttack: number
    strikesContributions: StatContributionLine[]
    /** Short notes on how APS / DPS relate to weapon base and what is excluded. */
    notes: string[]
  }
  /** Gear + class (Trickster bonus) “enemies take increased damage” — multiplied onto hit after increased-damage mods. */
  enemiesTakeIncreasedDamage: {
    gearPercent: number
    tricksterPercent: number
    totalPercent: number
    multiplier: number
  }
  /** Not multiplied into planner hit / DPS (applied in combat only). */
  combatOnlyNotInPlannerHitOrDps: {
    damageDealtLessMult: number
  }
}

export interface EquipmentModifiers {
  flatLife: number
  flatMana: number
  flatArmour: number
  flatEvasion: number
  /** Physical hit contribution (base + local physical adds + generic item damage). */
  flatDamageMin: number
  flatDamageMax: number
  flatFireMin: number
  flatFireMax: number
  flatColdMin: number
  flatColdMax: number
  flatLightningMin: number
  flatLightningMax: number
  flatChaosMin: number
  flatChaosMax: number
  critChanceBonus: number // percentage points
  strBonus: number
  dexBonus: number
  intBonus: number
  /** Flat accuracy from gear (before % increased accuracy). */
  flatAccuracy: number
  pctIncreasedLifeFromGear: number
  pctIncreasedManaFromGear: number
  pctIncreasedArmourFromGear: number
  pctIncreasedEvasionFromGear: number
  pctIncreasedEnergyShieldFromGear: number
  increasedMeleeDamageFromGear: number
  increasedAttackDamageFromGear: number
  increasedDamageFromGear: number
  increasedSpellDamageFromGear: number
  pctIncreasedAccuracyFromGear: number
  pctIncreasedAttackSpeedFromGear: number
  doubleDamageChanceFromGear: number
  armourIgnoreFromGear: number
  pctToAllElementalResFromGear: number
  pctChaosResFromGear: number
  manaCostReductionFromGear: number
  /** Multiplies final ES (1 = no change). Each “% less energy shield” stacks multiplicatively. */
  energyShieldLessMultFromGear: number
  flatEnergyShieldFromGear: number
  /** Weapon base APS after local attack-speed mods. Null when no weapon (falls back to BASE_GAME_STATS.baseAps). */
  weaponEffectiveAps: number | null
  /** Weapon base critical hit chance %. Null when no weapon (falls back to BASE_GAME_STATS.baseCritChance). */
  weaponBaseCritChance: number | null
  /** Total block chance contribution from equipped gear (base shield block + local block mods + flat block bonuses). */
  blockChanceFromGear: number
  /** +N strikes per attack from weapon unique mods. */
  flatStrikesPerAttack: number
  /** % increased strikes per attack (gear). */
  increasedStrikesPerAttackFromGear: number
  /** Sum of “X% increased strikes … per 10 dexterity” style mods (X values summed). */
  strikesIncPctPer10DexFromGear: number

  pctIncreasedCriticalHitChanceFromGear: number
  increasedElementalDamageFromGear: number

  bleedInflictChanceFromGear: number
  poisonInflictChanceFromGear: number
  elementalAilmentInflictChanceFromGear: number
  chillInflictChanceFromGear: number
  shockInflictChanceFromGear: number
  igniteInflictChanceFromGear: number

  dotDamageMoreMultFromGear: number
  strikesMoreMultFromGear: number
  attackSpeedLessMultFromGear: number
  accuracyLessMultFromGear: number

  lifeOnHitFromGear: number
  lifeLeechFromHitDamagePercentFromGear: number
  lifeLeechFromPhysicalHitPercentFromGear: number

  physicalConvertedToFirePctFromGear: number
  physicalConvertedToColdPctFromGear: number
  physicalConvertedToLightningPctFromGear: number

  lightningPenetrationFromGear: number

  hitsCannotBeEvadedFromGear: boolean
  cannotDealCriticalStrikesFromGear: boolean

  pctFireResFromGear: number
  pctColdResFromGear: number
  pctLightningResFromGear: number
  /** +X% to all resistances (fire, cold, lightning, chaos). */
  pctToAllResistancesFromGear: number

  dodgeChanceFromGear: number
  dodgeChancePer10DexFromGear: number
  maxDodgeChanceBonusFromGear: number

  pctIncreasedCastSpeedFromGear: number
  castSpeedLessMultFromGear: number
  castSpeedIncPctPer10DexFromGear: number

  /** Sum of “+N% to critical damage multiplier” (increased-style). */
  increasedCriticalDamageMultiplierFromGear: number
  /** Flat bonus to crit multiplier (e.g. +90 → +0.9 on mult). */
  flatCriticalDamageMultiplierBonusFromGear: number

  attackBaseCritChanceBonusFromGear: number
  spellBaseCritChanceBonusFromGear: number

  tripleDamageChanceFromGear: number

  /** +N% to block power (stronger blocks — lower damage taken when blocked). */
  blockPowerPctFromGear: number

  /** Additive to armour effectiveness vs chaos (fraction of hit). */
  armourEffectivenessVsChaosFromGear: number

  increasedLightningDamageFromGear: number
  increasedChaosDamageFromGear: number

  pctIncreasedDamageOverTimeFromGear: number
  pctIncreasedBleedDamageFromGear: number
  ailmentDurationBonusFromGear: number

  pctIncreasedAllAttributesFromGear: number
  pctIncreasedStrengthFromGear: number
  pctIncreasedDexterityFromGear: number
  pctIncreasedIntelligenceFromGear: number

  damageTakenLessMultFromGear: number
  damageTakenMoreMultFromGear: number

  lifeRegenPercentOfMaxLifePerSecondFromGear: number
  manaRegenPercentOfMaxManaPerSecondFromGear: number
  esRegenPercentOfMaxPerSecondFromGear: number

  lifeAsExtraEsPercentFromGear: number
  manaAsExtraEsPercentFromGear: number

  enemyDamageTakenIncreasedFromGear: number

  firePenetrationFromGear: number
  coldPenetrationFromGear: number
  chaosPenetrationFromGear: number
  elementalPenetrationFromGear: number

  elementalToChaosConversionPctFromGear: number
  physicalToRandomElementPctFromGear: number
  lightningToColdConversionPctFromGear: number
  gainPhysicalAsExtraLightningPctFromGear: number

  evasionMoreMultFromGear: number

  cannotInflictElementalAilmentsFromGear: boolean
  hitsTakenCannotBeCriticalFromGear: boolean

  /** Multiplicative on hit damage dealt (standalone “% less damage” on gear). */
  damageDealtLessMultFromGear: number
  lifeMoreMultFromGear: number
  /** Product of “X% more maximum mana” lines (1 = none). */
  manaMoreMultFromGear: number
  defencesLessMultFromGear: number
  manaCostIncreasePercentFromGear: number
  pctIncreasedManaRegenFromGear: number
  pctIncreasedLifeRecoveryFromGear: number
  doubleDamageChanceFromSpellsFromGear: number
  maxBlockChanceBonusFromGear: number

  physicalTakenAsChaosPercentFromGear: number
  elementalTakenAsChaosPercentFromGear: number
  physicalTakenAsFirePercentFromGear: number
  physicalTakenAsColdPercentFromGear: number
  physicalTakenAsLightningPercentFromGear: number
  /** Flat reduced physical damage taken from gear (added on top of armour reduction). */
  reducedPhysicalDamageTakenFromGear: number

  nonDamagingAilmentEffectIncreasedFromGear: number
  chillInflictEffectMultFromGear: number

  abilitiesNoCostFromGear: boolean
  dealNoDamageExceptCritFromGear: boolean

  increasedFireDamageFromGear: number
  increasedColdDamageFromGear: number

  maxFireResBonusFromGear: number
  maxColdResBonusFromGear: number
  maxLightningResBonusFromGear: number
  maxAllElementalResBonusFromGear: number
  maxChaosResBonusFromGear: number

  damageTakenToManaFirstPercentFromGear: number

  lifeRecoveredOnKillPercentFromGear: number
  flatLifeOnKillFromGear: number
  manaOnKillFlatFromGear: number

  lifeRecoveredOnBlockPercentFromGear: number
  flatLifeOnBlockFromGear: number
  manaRecoveredOnBlockPercentFromGear: number
  esRecoveredOnBlockPercentFromGear: number
  flatManaOnBlockFromGear: number
  flatEsOnBlockFromGear: number

  energyShieldOnHitFromGear: number
  rangedDamageIncPctPer10StrFromGear: number
  /** Sum of X in “X% increased damage per 10 combined strength, dexterity, and intelligence”. */
  damageIncPctPer10CombinedAttrsFromGear: number
  manaCostPaidWithLifeFromGear: boolean
}

export interface ComputedBuildStats {
  // Attributes
  str: number
  dex: number
  int: number

  // Core pools
  maxLife: number
  maxMana: number
  maxEnergyShield: number

  // Defenses
  armour: number
  evasionRating: number
  blockChance: number  // 0-75 (or 0-100 for Dragoon)
  dodgeChance: number  // 0-75

  // Resistances (capped at maxResistance)
  fireRes: number
  coldRes: number
  lightningRes: number
  chaosRes: number
  maxFireRes: number
  maxColdRes: number
  maxLightningRes: number
  maxChaosRes: number

  // Offense
  hitDamageMin: number
  hitDamageMax: number
  /** Per-damage-type weapon / spell hit range (colored in UI when multiple types). */
  hitDamageByType: HitDamageTypeRow[]
  aps: number
  manaCostPerAttack: number
  accuracy: number
  critChance: number    // percentage
  critMultiplier: number // 2.0 = 200%
  avgHit: number
  avgEffectiveDamage: number
  dps: number
  /** Player attack actions roll this many strike damages (demo combat); 1 for spell casts. */
  strikesPerAttack: number

  // Recovery
  manaRegenPerSecond: number
  lifeRecoveryPct: number
  esRecoveryPct: number

  // Ailment bonuses (base chances from upgrades + active ability lines)
  bleedChance: number
  poisonChance: number
  elementalAilmentChance: number
  ailmentDurationBonus: number // % increased duration
  /** Added to ignite roll when fire damage is present (ability lines, e.g. +100% ignite). */
  igniteInflictChanceBonus: number
  /** Added to shock roll when lightning damage is present (e.g. Bladesurge +50% shock). */
  shockInflictChanceBonus: number
  /** Added to chill roll when cold damage is present. */
  chillInflictChanceBonus: number

  // Damage modifiers (passed to battle engine)
  increasedMeleeDamage: number
  increasedAttackDamage: number
  increasedSpellDamage: number
  increasedElementalDamage: number
  increasedDamage: number
  damageOverTimeMultiplier: number

  // Combat modifier flags (for battle engine)
  doubleDamageChance: number
  armourIgnorePercent: number          // % of enemy armour ignored
  /** Multiplicative with (1 + damageOverTimeMultiplier/100) for damaging ailments in demo combat. */
  dotDamageMoreMultiplier: number
  /** % of enemy lightning resistance ignored (lightning portion of hit only, when enemy has res). */
  lightningPenetrationPercent: number
  lifeOnHit: number
  lifeLeechFromHitDamagePercent: number
  lifeLeechFromPhysicalHitPercent: number
  hitsCannotBeEvaded: boolean
  tripleDamageChance: number
  /** Effective fraction of enemy hit damage taken when a block succeeds (after block power). */
  blockDamageTakenMult: number
  /** % of max life regenerated per second (demo combat). */
  lifeRegenPercentOfMaxPerSecond: number
  /** % of max energy shield regenerated per second (demo combat). */
  esRegenPercentOfMaxPerSecond: number
  /** Σ increased damage enemies take from your hits: gear mods + Trickster class bonus (10%) when active; baked into planner hit/DPS. */
  enemiesTakeIncreasedDamagePercent: number
  /** Multiplier on damage taken from enemy hits (less/more from gear). */
  damageTakenMultiplierFromGear: number
  firePenetrationPercent: number
  coldPenetrationPercent: number
  chaosPenetrationPercent: number
  elementalPenetrationPercent: number
  cannotInflictElementalAilments: boolean
  hitsTakenCannotBeCritical: boolean
  /** Multiplier on damage you deal (gear “% less damage”). */
  damageDealtLessMult: number
  /** Scales in-combat life regen % and life leech from hits. */
  lifeRecoveryRateMult: number
  /** Portions of enemy physical hit converted before ES/life (0–100 each, summed then clamped). */
  physicalDamageTakenAsChaosPercent: number
  physicalDamageTakenAsFirePercent: number
  physicalDamageTakenAsColdPercent: number
  physicalDamageTakenAsLightningPercent: number
  elementalDamageTakenAsChaosPercent: number
  /** Flat reduced physical damage taken (from gear + Arcanist bonus). */
  reducedPhysicalDamageTaken: number
  /** % increased shock/chill effect you inflict (demo). */
  nonDamagingAilmentEffectIncreasedPercent: number
  chillInflictEffectMult: number
  /** Non-crit attacks deal no damage. */
  dealNoDamageExceptCrit: boolean

  damageTakenToManaFirstPercent: number
  lifeRecoveredOnKillPercent: number
  flatLifeOnKill: number
  flatManaOnKill: number
  lifeRecoveredOnBlockPercent: number
  flatLifeOnBlock: number
  manaRecoveredOnBlockPercent: number
  esRecoveredOnBlockPercent: number
  flatManaOnBlock: number
  flatEsOnBlock: number
  energyShieldOnHit: number
  manaCostPaidWithLife: boolean

  manaShieldActive: boolean           // Druid: 25% of damage taken to mana above 50%
  chaosNotBypassES: boolean           // Arcanist bonus
  armourVsElementalMultiplier: number  // 0.5 base; 1.0 with Juggernaut
  armourVsChaosMultiplier: number      // 0.25 base; modified by Juggernaut/Templar/Chieftain

  // Which class bonuses are active (for battle engine use)
  classBonusesActive: string[]

  // Classes with >0 points (for display)
  classLevelsActive: Record<string, number>

  /** Non-null when a valid ability is applied to hit damage / APS / DPS / mana cost. */
  abilityContribution: AbilityContributionSummary | null
  /** Attack hit math (null when a spell replaces hit damage). */
  hitDamageComputationBreakdown: HitDamageComputationBreakdown | null
}

// ---------------------------------------------------------------------------
// Equipment aggregation helper
// ---------------------------------------------------------------------------

export function emptyEquipmentModifiers(): EquipmentModifiers {
  return {
    flatLife: 0,
    flatMana: 0,
    flatArmour: 0,
    flatEvasion: 0,
    flatDamageMin: 0,
    flatDamageMax: 0,
    flatFireMin: 0,
    flatFireMax: 0,
    flatColdMin: 0,
    flatColdMax: 0,
    flatLightningMin: 0,
    flatLightningMax: 0,
    flatChaosMin: 0,
    flatChaosMax: 0,
    critChanceBonus: 0,
    strBonus: 0,
    dexBonus: 0,
    intBonus: 0,
    flatAccuracy: 0,
    pctIncreasedLifeFromGear: 0,
    pctIncreasedManaFromGear: 0,
    pctIncreasedArmourFromGear: 0,
    pctIncreasedEvasionFromGear: 0,
    pctIncreasedEnergyShieldFromGear: 0,
    increasedMeleeDamageFromGear: 0,
    increasedAttackDamageFromGear: 0,
    increasedDamageFromGear: 0,
    increasedSpellDamageFromGear: 0,
    pctIncreasedAccuracyFromGear: 0,
    pctIncreasedAttackSpeedFromGear: 0,
    doubleDamageChanceFromGear: 0,
    armourIgnoreFromGear: 0,
    pctToAllElementalResFromGear: 0,
    pctChaosResFromGear: 0,
    manaCostReductionFromGear: 0,
    energyShieldLessMultFromGear: 1,
    flatEnergyShieldFromGear: 0,
    weaponEffectiveAps: null,
    weaponBaseCritChance: null,
    blockChanceFromGear: 0,
    flatStrikesPerAttack: 0,
    increasedStrikesPerAttackFromGear: 0,
    strikesIncPctPer10DexFromGear: 0,

    pctIncreasedCriticalHitChanceFromGear: 0,
    increasedElementalDamageFromGear: 0,

    bleedInflictChanceFromGear: 0,
    poisonInflictChanceFromGear: 0,
    elementalAilmentInflictChanceFromGear: 0,
    chillInflictChanceFromGear: 0,
    shockInflictChanceFromGear: 0,
    igniteInflictChanceFromGear: 0,

    dotDamageMoreMultFromGear: 1,
    strikesMoreMultFromGear: 1,
    attackSpeedLessMultFromGear: 1,
    accuracyLessMultFromGear: 1,

    lifeOnHitFromGear: 0,
    lifeLeechFromHitDamagePercentFromGear: 0,
    lifeLeechFromPhysicalHitPercentFromGear: 0,

    physicalConvertedToFirePctFromGear: 0,
    physicalConvertedToColdPctFromGear: 0,
    physicalConvertedToLightningPctFromGear: 0,

    lightningPenetrationFromGear: 0,

    hitsCannotBeEvadedFromGear: false,
    cannotDealCriticalStrikesFromGear: false,

    pctFireResFromGear: 0,
    pctColdResFromGear: 0,
    pctLightningResFromGear: 0,
    pctToAllResistancesFromGear: 0,

    dodgeChanceFromGear: 0,
    dodgeChancePer10DexFromGear: 0,
    maxDodgeChanceBonusFromGear: 0,

    pctIncreasedCastSpeedFromGear: 0,
    castSpeedLessMultFromGear: 1,
    castSpeedIncPctPer10DexFromGear: 0,

    increasedCriticalDamageMultiplierFromGear: 0,
    flatCriticalDamageMultiplierBonusFromGear: 0,

    attackBaseCritChanceBonusFromGear: 0,
    spellBaseCritChanceBonusFromGear: 0,

    tripleDamageChanceFromGear: 0,

    blockPowerPctFromGear: 0,

    armourEffectivenessVsChaosFromGear: 0,

    increasedLightningDamageFromGear: 0,
    increasedChaosDamageFromGear: 0,

    pctIncreasedDamageOverTimeFromGear: 0,
    pctIncreasedBleedDamageFromGear: 0,
    ailmentDurationBonusFromGear: 0,

    pctIncreasedAllAttributesFromGear: 0,
    pctIncreasedStrengthFromGear: 0,
    pctIncreasedDexterityFromGear: 0,
    pctIncreasedIntelligenceFromGear: 0,

    damageTakenLessMultFromGear: 1,
    damageTakenMoreMultFromGear: 1,

    lifeRegenPercentOfMaxLifePerSecondFromGear: 0,
    manaRegenPercentOfMaxManaPerSecondFromGear: 0,
    esRegenPercentOfMaxPerSecondFromGear: 0,

    lifeAsExtraEsPercentFromGear: 0,
    manaAsExtraEsPercentFromGear: 0,

    enemyDamageTakenIncreasedFromGear: 0,

    firePenetrationFromGear: 0,
    coldPenetrationFromGear: 0,
    chaosPenetrationFromGear: 0,
    elementalPenetrationFromGear: 0,

    elementalToChaosConversionPctFromGear: 0,
    physicalToRandomElementPctFromGear: 0,
    lightningToColdConversionPctFromGear: 0,
    gainPhysicalAsExtraLightningPctFromGear: 0,

    evasionMoreMultFromGear: 1,

    cannotInflictElementalAilmentsFromGear: false,
    hitsTakenCannotBeCriticalFromGear: false,

    damageDealtLessMultFromGear: 1,
    lifeMoreMultFromGear: 1,
    manaMoreMultFromGear: 1,
    defencesLessMultFromGear: 1,
    manaCostIncreasePercentFromGear: 0,
    pctIncreasedManaRegenFromGear: 0,
    pctIncreasedLifeRecoveryFromGear: 0,
    doubleDamageChanceFromSpellsFromGear: 0,
    maxBlockChanceBonusFromGear: 0,

    physicalTakenAsChaosPercentFromGear: 0,
    elementalTakenAsChaosPercentFromGear: 0,
    physicalTakenAsFirePercentFromGear: 0,
    physicalTakenAsColdPercentFromGear: 0,
    physicalTakenAsLightningPercentFromGear: 0,
    reducedPhysicalDamageTakenFromGear: 0,

    nonDamagingAilmentEffectIncreasedFromGear: 0,
    chillInflictEffectMultFromGear: 1,

    abilitiesNoCostFromGear: false,
    dealNoDamageExceptCritFromGear: false,

    increasedFireDamageFromGear: 0,
    increasedColdDamageFromGear: 0,

    maxFireResBonusFromGear: 0,
    maxColdResBonusFromGear: 0,
    maxLightningResBonusFromGear: 0,
    maxAllElementalResBonusFromGear: 0,
    maxChaosResBonusFromGear: 0,

    damageTakenToManaFirstPercentFromGear: 0,

    lifeRecoveredOnKillPercentFromGear: 0,
    flatLifeOnKillFromGear: 0,
    manaOnKillFlatFromGear: 0,

    lifeRecoveredOnBlockPercentFromGear: 0,
    flatLifeOnBlockFromGear: 0,
    manaRecoveredOnBlockPercentFromGear: 0,
    esRecoveredOnBlockPercentFromGear: 0,
    flatManaOnBlockFromGear: 0,
    flatEsOnBlockFromGear: 0,

    energyShieldOnHitFromGear: 0,
    rangedDamageIncPctPer10StrFromGear: 0,
    damageIncPctPer10CombinedAttrsFromGear: 0,
    manaCostPaidWithLifeFromGear: false,
  }
}

function addItemModifiersToEquipment(eq: EquipmentModifiers, m: ItemModifiers) {
  eq.flatLife += m.health ?? 0
  eq.flatMana += m.mana ?? 0
  eq.flatArmour += m.armour ?? 0
  eq.flatEvasion += m.evasion ?? 0
  eq.flatDamageMin += (m.damage ?? 0) * 0.5
  eq.flatDamageMax += m.damage ?? 0
  eq.critChanceBonus += m.critChance ?? 0
  eq.strBonus += m.strength ?? 0
  eq.dexBonus += (m.dexterity ?? 0) + (m.agility ?? 0)
  eq.intBonus += m.intelligence ?? 0
  eq.flatLife += (m.vitality ?? 0) * 5
}

function mergeUniqueGearPatch(eq: EquipmentModifiers, p: UniqueGearStatPatch) {
  const addNum = (k: keyof EquipmentModifiers, v: number) => {
    const cur = (eq as unknown as Record<string, unknown>)[k as string]
    if (typeof cur === 'number') {
      ;(eq as unknown as Record<string, number>)[k as string] = cur + v
    }
  }
  if (p.flatLife !== undefined) addNum('flatLife', p.flatLife)
  if (p.flatMana !== undefined) addNum('flatMana', p.flatMana)
  if (p.flatArmour !== undefined) addNum('flatArmour', p.flatArmour)
  if (p.flatEvasion !== undefined) addNum('flatEvasion', p.flatEvasion)
  if (p.flatDamageMin !== undefined) addNum('flatDamageMin', p.flatDamageMin)
  if (p.flatDamageMax !== undefined) addNum('flatDamageMax', p.flatDamageMax)
  if (p.flatFireMin !== undefined) addNum('flatFireMin', p.flatFireMin)
  if (p.flatFireMax !== undefined) addNum('flatFireMax', p.flatFireMax)
  if (p.flatColdMin !== undefined) addNum('flatColdMin', p.flatColdMin)
  if (p.flatColdMax !== undefined) addNum('flatColdMax', p.flatColdMax)
  if (p.flatLightningMin !== undefined) addNum('flatLightningMin', p.flatLightningMin)
  if (p.flatLightningMax !== undefined) addNum('flatLightningMax', p.flatLightningMax)
  if (p.flatChaosMin !== undefined) addNum('flatChaosMin', p.flatChaosMin)
  if (p.flatChaosMax !== undefined) addNum('flatChaosMax', p.flatChaosMax)
  if (p.flatStrikesPerAttack !== undefined) addNum('flatStrikesPerAttack', p.flatStrikesPerAttack)
  if (p.increasedStrikesPerAttack !== undefined) {
    addNum('increasedStrikesPerAttackFromGear', p.increasedStrikesPerAttack)
  }
  if (p.strikesIncPctPer10Dex !== undefined) {
    addNum('strikesIncPctPer10DexFromGear', p.strikesIncPctPer10Dex)
  }
  if (p.critChanceBonus !== undefined) addNum('critChanceBonus', p.critChanceBonus)
  if (p.strBonus !== undefined) addNum('strBonus', p.strBonus)
  if (p.dexBonus !== undefined) addNum('dexBonus', p.dexBonus)
  if (p.intBonus !== undefined) addNum('intBonus', p.intBonus)
  if (p.flatAccuracy !== undefined) addNum('flatAccuracy', p.flatAccuracy)
  if (p.pctIncreasedLifeFromGear !== undefined) addNum('pctIncreasedLifeFromGear', p.pctIncreasedLifeFromGear)
  if (p.pctIncreasedManaFromGear !== undefined) addNum('pctIncreasedManaFromGear', p.pctIncreasedManaFromGear)
  if (p.pctIncreasedArmourFromGear !== undefined) addNum('pctIncreasedArmourFromGear', p.pctIncreasedArmourFromGear)
  if (p.pctIncreasedEvasionFromGear !== undefined) addNum('pctIncreasedEvasionFromGear', p.pctIncreasedEvasionFromGear)
  if (p.pctIncreasedEnergyShieldFromGear !== undefined) {
    addNum('pctIncreasedEnergyShieldFromGear', p.pctIncreasedEnergyShieldFromGear)
  }
  if (p.increasedMeleeDamageFromGear !== undefined) {
    addNum('increasedMeleeDamageFromGear', p.increasedMeleeDamageFromGear)
  }
  if (p.increasedAttackDamageFromGear !== undefined) {
    addNum('increasedAttackDamageFromGear', p.increasedAttackDamageFromGear)
  }
  if (p.increasedDamageFromGear !== undefined) addNum('increasedDamageFromGear', p.increasedDamageFromGear)
  if (p.increasedSpellDamageFromGear !== undefined) {
    addNum('increasedSpellDamageFromGear', p.increasedSpellDamageFromGear)
  }
  if (p.pctIncreasedAccuracyFromGear !== undefined) {
    addNum('pctIncreasedAccuracyFromGear', p.pctIncreasedAccuracyFromGear)
  }
  if (p.pctIncreasedAttackSpeedFromGear !== undefined) {
    addNum('pctIncreasedAttackSpeedFromGear', p.pctIncreasedAttackSpeedFromGear)
  }
  if (p.doubleDamageChanceFromGear !== undefined) {
    addNum('doubleDamageChanceFromGear', p.doubleDamageChanceFromGear)
  }
  if (p.armourIgnoreFromGear !== undefined) addNum('armourIgnoreFromGear', p.armourIgnoreFromGear)
  if (p.pctToAllElementalResFromGear !== undefined) {
    addNum('pctToAllElementalResFromGear', p.pctToAllElementalResFromGear)
  }
  if (p.pctChaosResFromGear !== undefined) addNum('pctChaosResFromGear', p.pctChaosResFromGear)
  if (p.manaCostReductionFromGear !== undefined) {
    addNum('manaCostReductionFromGear', p.manaCostReductionFromGear)
  }
  if (p.flatEnergyShieldFromGear !== undefined) {
    addNum('flatEnergyShieldFromGear', p.flatEnergyShieldFromGear)
  }
  if (p.energyShieldLessMultFromGear !== undefined) {
    eq.energyShieldLessMultFromGear *= p.energyShieldLessMultFromGear
  }
  if (p.flatBlockChanceFromGear !== undefined) {
    addNum('blockChanceFromGear', p.flatBlockChanceFromGear)
  }
  if (p.pctIncreasedCriticalHitChanceFromGear !== undefined) {
    addNum('pctIncreasedCriticalHitChanceFromGear', p.pctIncreasedCriticalHitChanceFromGear)
  }
  if (p.increasedElementalDamageFromGear !== undefined) {
    addNum('increasedElementalDamageFromGear', p.increasedElementalDamageFromGear)
  }
  if (p.bleedInflictChanceFromGear !== undefined) {
    addNum('bleedInflictChanceFromGear', p.bleedInflictChanceFromGear)
  }
  if (p.poisonInflictChanceFromGear !== undefined) {
    addNum('poisonInflictChanceFromGear', p.poisonInflictChanceFromGear)
  }
  if (p.elementalAilmentInflictChanceFromGear !== undefined) {
    addNum('elementalAilmentInflictChanceFromGear', p.elementalAilmentInflictChanceFromGear)
  }
  if (p.chillInflictChanceFromGear !== undefined) {
    addNum('chillInflictChanceFromGear', p.chillInflictChanceFromGear)
  }
  if (p.shockInflictChanceFromGear !== undefined) {
    addNum('shockInflictChanceFromGear', p.shockInflictChanceFromGear)
  }
  if (p.igniteInflictChanceFromGear !== undefined) {
    addNum('igniteInflictChanceFromGear', p.igniteInflictChanceFromGear)
  }
  if (p.dotDamageMoreMultFromGear !== undefined) {
    eq.dotDamageMoreMultFromGear *= p.dotDamageMoreMultFromGear
  }
  if (p.strikesMoreMultFromGear !== undefined) {
    eq.strikesMoreMultFromGear *= p.strikesMoreMultFromGear
  }
  if (p.attackSpeedLessMultFromGear !== undefined) {
    eq.attackSpeedLessMultFromGear *= p.attackSpeedLessMultFromGear
  }
  if (p.accuracyLessMultFromGear !== undefined) {
    eq.accuracyLessMultFromGear *= p.accuracyLessMultFromGear
  }
  if (p.lifeOnHitFromGear !== undefined) addNum('lifeOnHitFromGear', p.lifeOnHitFromGear)
  if (p.lifeLeechFromHitDamagePercentFromGear !== undefined) {
    addNum('lifeLeechFromHitDamagePercentFromGear', p.lifeLeechFromHitDamagePercentFromGear)
  }
  if (p.lifeLeechFromPhysicalHitPercentFromGear !== undefined) {
    addNum('lifeLeechFromPhysicalHitPercentFromGear', p.lifeLeechFromPhysicalHitPercentFromGear)
  }
  if (p.physicalConvertedToFirePctFromGear !== undefined) {
    addNum('physicalConvertedToFirePctFromGear', p.physicalConvertedToFirePctFromGear)
  }
  if (p.physicalConvertedToColdPctFromGear !== undefined) {
    addNum('physicalConvertedToColdPctFromGear', p.physicalConvertedToColdPctFromGear)
  }
  if (p.physicalConvertedToLightningPctFromGear !== undefined) {
    addNum('physicalConvertedToLightningPctFromGear', p.physicalConvertedToLightningPctFromGear)
  }
  if (p.lightningPenetrationFromGear !== undefined) {
    addNum('lightningPenetrationFromGear', p.lightningPenetrationFromGear)
  }
  if (p.pctFireResFromGear !== undefined) addNum('pctFireResFromGear', p.pctFireResFromGear)
  if (p.pctColdResFromGear !== undefined) addNum('pctColdResFromGear', p.pctColdResFromGear)
  if (p.pctLightningResFromGear !== undefined) {
    addNum('pctLightningResFromGear', p.pctLightningResFromGear)
  }
  if (p.pctToAllResistancesFromGear !== undefined) {
    addNum('pctToAllResistancesFromGear', p.pctToAllResistancesFromGear)
  }
  if (p.dodgeChanceFromGear !== undefined) addNum('dodgeChanceFromGear', p.dodgeChanceFromGear)
  if (p.dodgeChancePer10DexFromGear !== undefined) {
    addNum('dodgeChancePer10DexFromGear', p.dodgeChancePer10DexFromGear)
  }
  if (p.maxDodgeChanceBonusFromGear !== undefined) {
    addNum('maxDodgeChanceBonusFromGear', p.maxDodgeChanceBonusFromGear)
  }
  if (p.pctIncreasedCastSpeedFromGear !== undefined) {
    addNum('pctIncreasedCastSpeedFromGear', p.pctIncreasedCastSpeedFromGear)
  }
  if (p.castSpeedLessMultFromGear !== undefined) {
    eq.castSpeedLessMultFromGear *= p.castSpeedLessMultFromGear
  }
  if (p.castSpeedIncPctPer10DexFromGear !== undefined) {
    addNum('castSpeedIncPctPer10DexFromGear', p.castSpeedIncPctPer10DexFromGear)
  }
  if (p.increasedCriticalDamageMultiplierFromGear !== undefined) {
    addNum('increasedCriticalDamageMultiplierFromGear', p.increasedCriticalDamageMultiplierFromGear)
  }
  if (p.flatCriticalDamageMultiplierBonusFromGear !== undefined) {
    addNum('flatCriticalDamageMultiplierBonusFromGear', p.flatCriticalDamageMultiplierBonusFromGear)
  }
  if (p.attackBaseCritChanceBonusFromGear !== undefined) {
    addNum('attackBaseCritChanceBonusFromGear', p.attackBaseCritChanceBonusFromGear)
  }
  if (p.spellBaseCritChanceBonusFromGear !== undefined) {
    addNum('spellBaseCritChanceBonusFromGear', p.spellBaseCritChanceBonusFromGear)
  }
  if (p.tripleDamageChanceFromGear !== undefined) {
    addNum('tripleDamageChanceFromGear', p.tripleDamageChanceFromGear)
  }
  if (p.blockPowerPctFromGear !== undefined) addNum('blockPowerPctFromGear', p.blockPowerPctFromGear)
  if (p.armourEffectivenessVsChaosFromGear !== undefined) {
    addNum('armourEffectivenessVsChaosFromGear', p.armourEffectivenessVsChaosFromGear)
  }
  if (p.increasedLightningDamageFromGear !== undefined) {
    addNum('increasedLightningDamageFromGear', p.increasedLightningDamageFromGear)
  }
  if (p.increasedChaosDamageFromGear !== undefined) {
    addNum('increasedChaosDamageFromGear', p.increasedChaosDamageFromGear)
  }
  if (p.pctIncreasedDamageOverTimeFromGear !== undefined) {
    addNum('pctIncreasedDamageOverTimeFromGear', p.pctIncreasedDamageOverTimeFromGear)
  }
  if (p.pctIncreasedBleedDamageFromGear !== undefined) {
    addNum('pctIncreasedBleedDamageFromGear', p.pctIncreasedBleedDamageFromGear)
  }
  if (p.ailmentDurationBonusFromGear !== undefined) {
    addNum('ailmentDurationBonusFromGear', p.ailmentDurationBonusFromGear)
  }
  if (p.pctIncreasedAllAttributesFromGear !== undefined) {
    addNum('pctIncreasedAllAttributesFromGear', p.pctIncreasedAllAttributesFromGear)
  }
  if (p.pctIncreasedStrengthFromGear !== undefined) {
    addNum('pctIncreasedStrengthFromGear', p.pctIncreasedStrengthFromGear)
  }
  if (p.pctIncreasedDexterityFromGear !== undefined) {
    addNum('pctIncreasedDexterityFromGear', p.pctIncreasedDexterityFromGear)
  }
  if (p.pctIncreasedIntelligenceFromGear !== undefined) {
    addNum('pctIncreasedIntelligenceFromGear', p.pctIncreasedIntelligenceFromGear)
  }
  if (p.damageTakenLessMultFromGear !== undefined) {
    eq.damageTakenLessMultFromGear *= p.damageTakenLessMultFromGear
  }
  if (p.damageTakenMoreMultFromGear !== undefined) {
    eq.damageTakenMoreMultFromGear *= p.damageTakenMoreMultFromGear
  }
  if (p.lifeRegenPercentOfMaxLifePerSecondFromGear !== undefined) {
    addNum('lifeRegenPercentOfMaxLifePerSecondFromGear', p.lifeRegenPercentOfMaxLifePerSecondFromGear)
  }
  if (p.manaRegenPercentOfMaxManaPerSecondFromGear !== undefined) {
    addNum('manaRegenPercentOfMaxManaPerSecondFromGear', p.manaRegenPercentOfMaxManaPerSecondFromGear)
  }
  if (p.esRegenPercentOfMaxPerSecondFromGear !== undefined) {
    addNum('esRegenPercentOfMaxPerSecondFromGear', p.esRegenPercentOfMaxPerSecondFromGear)
  }
  if (p.lifeAsExtraEsPercentFromGear !== undefined) {
    addNum('lifeAsExtraEsPercentFromGear', p.lifeAsExtraEsPercentFromGear)
  }
  if (p.manaAsExtraEsPercentFromGear !== undefined) {
    addNum('manaAsExtraEsPercentFromGear', p.manaAsExtraEsPercentFromGear)
  }
  if (p.enemyDamageTakenIncreasedFromGear !== undefined) {
    addNum('enemyDamageTakenIncreasedFromGear', p.enemyDamageTakenIncreasedFromGear)
  }
  if (p.firePenetrationFromGear !== undefined) addNum('firePenetrationFromGear', p.firePenetrationFromGear)
  if (p.coldPenetrationFromGear !== undefined) addNum('coldPenetrationFromGear', p.coldPenetrationFromGear)
  if (p.chaosPenetrationFromGear !== undefined) {
    addNum('chaosPenetrationFromGear', p.chaosPenetrationFromGear)
  }
  if (p.elementalPenetrationFromGear !== undefined) {
    addNum('elementalPenetrationFromGear', p.elementalPenetrationFromGear)
  }
  if (p.elementalToChaosConversionPctFromGear !== undefined) {
    addNum('elementalToChaosConversionPctFromGear', p.elementalToChaosConversionPctFromGear)
  }
  if (p.physicalToRandomElementPctFromGear !== undefined) {
    addNum('physicalToRandomElementPctFromGear', p.physicalToRandomElementPctFromGear)
  }
  if (p.lightningToColdConversionPctFromGear !== undefined) {
    addNum('lightningToColdConversionPctFromGear', p.lightningToColdConversionPctFromGear)
  }
  if (p.gainPhysicalAsExtraLightningPctFromGear !== undefined) {
    addNum('gainPhysicalAsExtraLightningPctFromGear', p.gainPhysicalAsExtraLightningPctFromGear)
  }
  if (p.evasionMoreMultFromGear !== undefined) {
    eq.evasionMoreMultFromGear *= p.evasionMoreMultFromGear
  }
  if (p.damageDealtLessMultFromGear !== undefined) {
    eq.damageDealtLessMultFromGear *= p.damageDealtLessMultFromGear
  }
  if (p.lifeMoreMultFromGear !== undefined) {
    eq.lifeMoreMultFromGear *= p.lifeMoreMultFromGear
  }
  if (p.manaMoreMultFromGear !== undefined) {
    eq.manaMoreMultFromGear *= p.manaMoreMultFromGear
  }
  if (p.defencesLessMultFromGear !== undefined) {
    eq.defencesLessMultFromGear *= p.defencesLessMultFromGear
  }
  if (p.manaCostIncreasePercentFromGear !== undefined) {
    addNum('manaCostIncreasePercentFromGear', p.manaCostIncreasePercentFromGear)
  }
  if (p.pctIncreasedManaRegenFromGear !== undefined) {
    addNum('pctIncreasedManaRegenFromGear', p.pctIncreasedManaRegenFromGear)
  }
  if (p.pctIncreasedLifeRecoveryFromGear !== undefined) {
    addNum('pctIncreasedLifeRecoveryFromGear', p.pctIncreasedLifeRecoveryFromGear)
  }
  if (p.doubleDamageChanceFromSpellsFromGear !== undefined) {
    addNum('doubleDamageChanceFromSpellsFromGear', p.doubleDamageChanceFromSpellsFromGear)
  }
  if (p.maxBlockChanceBonusFromGear !== undefined) {
    addNum('maxBlockChanceBonusFromGear', p.maxBlockChanceBonusFromGear)
  }
  if (p.physicalTakenAsChaosPercentFromGear !== undefined) {
    addNum('physicalTakenAsChaosPercentFromGear', p.physicalTakenAsChaosPercentFromGear)
  }
  if (p.elementalTakenAsChaosPercentFromGear !== undefined) {
    addNum('elementalTakenAsChaosPercentFromGear', p.elementalTakenAsChaosPercentFromGear)
  }
  if (p.physicalTakenAsFirePercentFromGear !== undefined) {
    addNum('physicalTakenAsFirePercentFromGear', p.physicalTakenAsFirePercentFromGear)
  }
  if (p.physicalTakenAsColdPercentFromGear !== undefined) {
    addNum('physicalTakenAsColdPercentFromGear', p.physicalTakenAsColdPercentFromGear)
  }
  if (p.physicalTakenAsLightningPercentFromGear !== undefined) {
    addNum('physicalTakenAsLightningPercentFromGear', p.physicalTakenAsLightningPercentFromGear)
  }
  if (p.reducedPhysicalDamageTakenFromGear !== undefined) {
    addNum('reducedPhysicalDamageTakenFromGear', p.reducedPhysicalDamageTakenFromGear)
  }
  if (p.nonDamagingAilmentEffectIncreasedFromGear !== undefined) {
    addNum('nonDamagingAilmentEffectIncreasedFromGear', p.nonDamagingAilmentEffectIncreasedFromGear)
  }
  if (p.chillInflictEffectMultFromGear !== undefined) {
    eq.chillInflictEffectMultFromGear *= p.chillInflictEffectMultFromGear
  }
  if (p.cannotInflictElementalAilmentsFromGear) eq.cannotInflictElementalAilmentsFromGear = true
  if (p.hitsTakenCannotBeCriticalFromGear) eq.hitsTakenCannotBeCriticalFromGear = true
  if (p.hitsCannotBeEvadedFromGear) eq.hitsCannotBeEvadedFromGear = true
  if (p.cannotDealCriticalStrikesFromGear) eq.cannotDealCriticalStrikesFromGear = true
  if (p.abilitiesNoCostFromGear) eq.abilitiesNoCostFromGear = true
  if (p.dealNoDamageExceptCritFromGear) eq.dealNoDamageExceptCritFromGear = true
  if (p.increasedFireDamageFromGear !== undefined) {
    addNum('increasedFireDamageFromGear', p.increasedFireDamageFromGear)
  }
  if (p.increasedColdDamageFromGear !== undefined) {
    addNum('increasedColdDamageFromGear', p.increasedColdDamageFromGear)
  }
  if (p.maxFireResBonusFromGear !== undefined) addNum('maxFireResBonusFromGear', p.maxFireResBonusFromGear)
  if (p.maxColdResBonusFromGear !== undefined) {
    addNum('maxColdResBonusFromGear', p.maxColdResBonusFromGear)
  }
  if (p.maxLightningResBonusFromGear !== undefined) {
    addNum('maxLightningResBonusFromGear', p.maxLightningResBonusFromGear)
  }
  if (p.maxAllElementalResBonusFromGear !== undefined) {
    addNum('maxAllElementalResBonusFromGear', p.maxAllElementalResBonusFromGear)
  }
  if (p.maxChaosResBonusFromGear !== undefined) {
    addNum('maxChaosResBonusFromGear', p.maxChaosResBonusFromGear)
  }
  if (p.damageTakenToManaFirstPercentFromGear !== undefined) {
    addNum('damageTakenToManaFirstPercentFromGear', p.damageTakenToManaFirstPercentFromGear)
  }
  if (p.lifeRecoveredOnKillPercentFromGear !== undefined) {
    addNum('lifeRecoveredOnKillPercentFromGear', p.lifeRecoveredOnKillPercentFromGear)
  }
  if (p.flatLifeOnKillFromGear !== undefined) addNum('flatLifeOnKillFromGear', p.flatLifeOnKillFromGear)
  if (p.manaOnKillFlatFromGear !== undefined) addNum('manaOnKillFlatFromGear', p.manaOnKillFlatFromGear)
  if (p.lifeRecoveredOnBlockPercentFromGear !== undefined) {
    addNum('lifeRecoveredOnBlockPercentFromGear', p.lifeRecoveredOnBlockPercentFromGear)
  }
  if (p.flatLifeOnBlockFromGear !== undefined) addNum('flatLifeOnBlockFromGear', p.flatLifeOnBlockFromGear)
  if (p.manaRecoveredOnBlockPercentFromGear !== undefined) {
    addNum('manaRecoveredOnBlockPercentFromGear', p.manaRecoveredOnBlockPercentFromGear)
  }
  if (p.esRecoveredOnBlockPercentFromGear !== undefined) {
    addNum('esRecoveredOnBlockPercentFromGear', p.esRecoveredOnBlockPercentFromGear)
  }
  if (p.flatManaOnBlockFromGear !== undefined) addNum('flatManaOnBlockFromGear', p.flatManaOnBlockFromGear)
  if (p.flatEsOnBlockFromGear !== undefined) addNum('flatEsOnBlockFromGear', p.flatEsOnBlockFromGear)
  if (p.energyShieldOnHitFromGear !== undefined) {
    addNum('energyShieldOnHitFromGear', p.energyShieldOnHitFromGear)
  }
  if (p.rangedDamageIncPctPer10StrFromGear !== undefined) {
    addNum('rangedDamageIncPctPer10StrFromGear', p.rangedDamageIncPctPer10StrFromGear)
  }
  if (p.damageIncPctPer10CombinedAttrsFromGear !== undefined) {
    addNum('damageIncPctPer10CombinedAttrsFromGear', p.damageIncPctPer10CombinedAttrsFromGear)
  }
  if (p.manaCostPaidWithLifeFromGear) eq.manaCostPaidWithLifeFromGear = true
}

/** Sum static items and rolled uniques for all worn slots. */
export function aggregateEquippedToEquipmentModifiers(
  slots: string[],
  getEquipped: (slot: string) => { itemId: string; rolls?: number[]; enhancement?: number } | null | undefined
): EquipmentModifiers {
  const eq = emptyEquipmentModifiers()
  for (const slot of slots) {
    const entry = getEquipped(slot)
    const itemId = entry?.itemId ?? 'none'
    if (itemId === 'none') continue

    if (isUniqueItemId(itemId)) {
      const def = EOC_UNIQUE_BY_ID[itemId]
      if (!def) continue
      const { innateText, lineTexts } = resolveUniqueMods(
        def,
        entry?.rolls,
        entry?.enhancement ?? 0
      )
      const texts = [innateText, ...lineTexts].filter((t) => t.length > 0)
      const isWeapon = slot === 'Weapon'
      const patch = equipmentModifiersFromUniqueTexts(texts, { isWeapon })

      if (isWeapon) {
        // Apply weapon base physical damage scaled by local physical damage %
        const baseDmgMin = def.baseDamageMin ?? 0
        const baseDmgMax = def.baseDamageMax ?? 0
        if (baseDmgMin > 0 || baseDmgMax > 0) {
          const localPhysPct = patch.localIncreasedPhysDamagePct ?? 0
          eq.flatDamageMin += baseDmgMin * (1 + localPhysPct / 100)
          eq.flatDamageMax += baseDmgMax * (1 + localPhysPct / 100)
        }
        // Weapon base APS with local attack speed applied
        if (def.baseAttackSpeed != null) {
          const localApsPct = patch.localIncreasedApsPct ?? 0
          eq.weaponEffectiveAps = def.baseAttackSpeed * (1 + localApsPct / 100)
        }
        // Weapon base critical hit chance
        if (def.baseCritChance != null) {
          eq.weaponBaseCritChance = def.baseCritChance
        }
      } else {
        // Apply armour/shield base defenses scaled by local defences %
        const localDefPct = patch.localIncreasedDefencesPct ?? 0
        if (def.baseArmour != null) {
          eq.flatArmour += Math.round(def.baseArmour * (1 + localDefPct / 100))
        }
        if (def.baseEvasion != null) {
          eq.flatEvasion += Math.round(def.baseEvasion * (1 + localDefPct / 100))
        }
        if (def.baseEnergyShield != null) {
          eq.flatEnergyShieldFromGear += Math.round(def.baseEnergyShield * (1 + localDefPct / 100))
        }
        // Shield block chance: base * (1 + local block %) + flat block bonuses
        if (slot === 'Off-hand' && def.baseBlockChance != null) {
          const localBlockPct = patch.localIncreasedBlockPct ?? 0
          eq.blockChanceFromGear += def.baseBlockChance * (1 + localBlockPct / 100)
        }
      }

      mergeUniqueGearPatch(eq, patch)
      continue
    }

    const item = getItemDefinition(slot, itemId)
    if (!item) continue
    addItemModifiersToEquipment(eq, item.modifiers)
  }
  return eq
}

export function aggregateItemModifiers(
  equippedItems: { modifiers: ItemModifiers }[]
): EquipmentModifiers {
  const eq = emptyEquipmentModifiers()
  for (const item of equippedItems) {
    addItemModifiersToEquipment(eq, item.modifiers)
  }
  return eq
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computeBuildStats(config: BuildConfig): ComputedBuildStats {
  const { equipmentModifiers: eq } = config
  const weaponItemId = config.equippedWeaponItemId ?? 'none'
  const weaponTag = weaponAbilityTagFromItemId(weaponItemId)

  // Stat stacking (sheet-style):
  // - All “increased X” that apply to the same outcome are summed, then applied once as (1 + Σ/100).
  // - “More” / “less” (and similar multiplicative modifiers) multiply separately; multiple “more” lines
  //   are a product of (1 + p/100) each.

  // -------------------------------------------------------------------------
  // 1. Determine active class bonuses
  // -------------------------------------------------------------------------
  const classBonusesActive: string[] = GAME_CLASSES
    .filter(cls => isClassBonusActive(cls.id, config.upgradeLevels))
    .map(cls => cls.id)

  const bonus = (id: string) => classBonusesActive.includes(id)

  /** Trickster class bonus: enemies take 10% increased damage (see gameClasses trickster). Baked into hit/DPS like gear. */
  const TRICKSTER_ENEMIES_TAKE_INCREASED_DAMAGE_PCT = 10
  const enemyDamageTakenIncreasedFromTricksterPct = bonus('trickster') ? TRICKSTER_ENEMIES_TAKE_INCREASED_DAMAGE_PCT : 0
  const enemyDamageTakenIncreasedTotalPct =
    eq.enemyDamageTakenIncreasedFromGear + enemyDamageTakenIncreasedFromTricksterPct
  /** Baked into hit min/max and DPS; battle engine does not apply gear/trickster again (Windrunner / Dragoon still in combat). */
  const enemyDamageTakenIncreasedMult = 1 + enemyDamageTakenIncreasedTotalPct / 100

  // -------------------------------------------------------------------------
  // 2. Aggregate upgrade modifier totals
  // -------------------------------------------------------------------------
  const upgAcc: Partial<Record<UpgradeModifierKey, number>> = {}

  for (const [key, points] of Object.entries(config.upgradeLevels)) {
    const [classId, upgradeId] = key.split('/')
    const cls = GAME_CLASSES_BY_ID[classId]
    const upg = cls?.upgrades.find(u => u.id === upgradeId)
    if (!upg || points <= 0) continue
    const total = upg.valuePerPoint * points
    upgAcc[upg.id as UpgradeModifierKey] = (upgAcc[upg.id as UpgradeModifierKey] ?? 0) + total
  }

  // Convenient accessor with fallback to 0
  const u = (key: UpgradeModifierKey): number => upgAcc[key] ?? 0

  // Character level: 1 = BASE_GAME stats only for these bonuses. Each passive rank spent is one level-up
  // (planner shows ranks 0…MAX; 0 ranks ⇒ level 1; 1 rank ⇒ level 2 ⇒ first +3 acc / +10 life / +10 mana / +1% dmg).
  const passiveRanksSpent = Object.values(config.upgradeLevels).reduce((sum, v) => sum + Math.max(0, v), 0)
  const characterLevel = passiveRanksSpent + 1
  const levelsGainedFromBase = characterLevel - 2
  const levelFlatAccuracy = 3 * levelsGainedFromBase
  const levelFlatLife = 10 * levelsGainedFromBase
  const levelFlatMana = 10 * levelsGainedFromBase
  const levelPctIncreasedDamage = levelsGainedFromBase

  // -------------------------------------------------------------------------
  // 3. Per-level attribute gains from each class
  // -------------------------------------------------------------------------
  let totalStrFromClasses = 0
  let totalDexFromClasses = 0
  let totalIntFromClasses = 0

  for (const cls of GAME_CLASSES) {
    const level = getClassLevel(cls.id, config.upgradeLevels)
    if (level > 0) {
      totalStrFromClasses += (cls.perLevel.str ?? 0) * level
      totalDexFromClasses += (cls.perLevel.dex ?? 0) * level
      totalIntFromClasses += (cls.perLevel.int ?? 0) * level
    }
  }

  // Mercenary class bonus: +5 str AND +5 dex per class level
  const mercenaryLevel = getClassLevel('mercenary', config.upgradeLevels)
  if (bonus('mercenary')) {
    totalStrFromClasses += 5 * mercenaryLevel
    totalDexFromClasses += 5 * mercenaryLevel
  }

  // -------------------------------------------------------------------------
  // 4. Base attributes (pre-Guardian bonus)
  // -------------------------------------------------------------------------
  let str  = BASE_GAME_STATS.baseStr  + totalStrFromClasses + eq.strBonus
  let dex  = BASE_GAME_STATS.baseDex  + totalDexFromClasses + eq.dexBonus
  let int_ = BASE_GAME_STATS.baseInt  + totalIntFromClasses + eq.intBonus

  // Guardian class bonus: +30 to all attributes
  if (bonus('guardian')) { str += 30; dex += 30; int_ += 30 }

  // -------------------------------------------------------------------------
  // 5. Apply % increased attribute bonuses
  // -------------------------------------------------------------------------
  const incAllAttr = eq.pctIncreasedAllAttributesFromGear / 100
  const strMult =
    1
    + u('increasedStrength') / 100
    + (bonus('warrior') ? 0.15 : 0)
    + eq.pctIncreasedStrengthFromGear / 100
    + incAllAttr
  const dexMult =
    1 + u('increasedDexterity') / 100 + eq.pctIncreasedDexterityFromGear / 100 + incAllAttr
  const intMult =
    1 + u('increasedIntelligence') / 100 + eq.pctIncreasedIntelligenceFromGear / 100 + incAllAttr
  str  = Math.round(str  * strMult)
  dex  = Math.round(dex  * dexMult)
  int_ = Math.round(int_ * intMult)

  // -------------------------------------------------------------------------
  // 6. Guardian "doubled inherent attribute bonuses" multipliers
  //    Affects: 10 life per 10 str, 10 mana per 10 int, defenses per dex, crit per dex
  // -------------------------------------------------------------------------
  const guardianDoubled = bonus('guardian')
  const attrLifeMult = guardianDoubled ? 2 : 1  // 10 life per 10 str → 20 life per 10 str
  const attrManaMult = guardianDoubled ? 2 : 1  // 10 mana per 10 int → 20 mana per 10 int
  const attrDefMult  = guardianDoubled ? 2 : 1  // 2% defenses per 10 dex → 4%
  const attrCritMult = guardianDoubled ? 2 : 1  // 2% crit per 10 dex → 4%
  // Shared by ES, armour, evasion: 2% increased defences per full 10 DEX (× guardian on attrDefMult).
  const defFromDex = Math.floor(dex / 10) * attrDefMult * 2

  // -------------------------------------------------------------------------
  // 7. Maximum life — flat × (1 + Σ increased%) × Π more multipliers
  // -------------------------------------------------------------------------
  const lifeFromStr = Math.floor(str / 10) * 10 * attrLifeMult
  const lifeFlat =
    BASE_GAME_STATS.baseLife
    + lifeFromStr
    + levelFlatLife
    + (bonus('warrior') ? 100 : 0)
    + eq.flatLife
  const totalIncreasedLife = u('increasedLife') + eq.pctIncreasedLifeFromGear
  // Occultist class bonus: maximum life = 1 (ignores life formula)
  let maxLife = bonus('occultist')
    ? 1
    : Math.round(lifeFlat * (1 + totalIncreasedLife / 100) * eq.lifeMoreMultFromGear)

  // -------------------------------------------------------------------------
  // 8. Maximum mana — flat × (1 + Σ increased%) × Π more multipliers
  // -------------------------------------------------------------------------
  const manaFromInt = Math.floor(int_ / 10) * 10 * attrManaMult
  const manaFlat =
    BASE_GAME_STATS.baseMana + manaFromInt + levelFlatMana + eq.flatMana
  const totalIncreasedMana = u('increasedMana') + eq.pctIncreasedManaFromGear
  const maxMana = Math.round(
    manaFlat * (1 + totalIncreasedMana / 100) * eq.manaMoreMultFromGear
  )

  // -------------------------------------------------------------------------
  // 9. Energy shield
  // -------------------------------------------------------------------------
  // Sorcerer class bonus: 10% of max mana as extra base ES
  const esBase =
    (bonus('sorcerer') ? maxMana * 0.10 : 0)
    + eq.flatEnergyShieldFromGear
    + maxLife * (eq.lifeAsExtraEsPercentFromGear / 100)
    + maxMana * (eq.manaAsExtraEsPercentFromGear / 100)
  const esFromUpgrades =
    u('increasedEnergyShield')
    + u('increasedArmourAndEnergyShield')
    + u('increasedEvasionRatingAndEnergyShield')
    + eq.pctIncreasedEnergyShieldFromGear
  // Increased ES (incl. defFromDex) additive in one (1+Σ/100); occultist “more” and ES “less” multiply after.
  const occultistMoreES = bonus('occultist') ? 1.40 : 1.0
  let maxEnergyShield = Math.round(
    esBase * (1 + (esFromUpgrades + defFromDex) / 100) * occultistMoreES * eq.energyShieldLessMultFromGear
  )

  // -------------------------------------------------------------------------
  // 10–11. Armour & evasion rating (defFromDex: §6)
  // -------------------------------------------------------------------------
  const armourFromUpgrades =
    u('increasedArmour') +
    u('increasedArmourAndEvasionRating') +
    u('increasedArmourAndEnergyShield') +
    eq.pctIncreasedArmourFromGear
  const armourFlatBase = BASE_GAME_STATS.baseArmour + eq.flatArmour
  let armour = Math.round(
    armourFlatBase
    * (1 + (armourFromUpgrades + defFromDex) / 100)
    * eq.defencesLessMultFromGear
  )

  const evasionFromUpgrades =
    u('increasedEvasionRating') +
    u('increasedArmourAndEvasionRating') +
    u('increasedEvasionRatingAndEnergyShield') +
    eq.pctIncreasedEvasionFromGear
  const evasionFlatBase = BASE_GAME_STATS.baseEvasion + eq.flatEvasion
  let evasionRating = Math.round(
    evasionFlatBase
    * (1 + (evasionFromUpgrades + defFromDex) / 100)
    * eq.evasionMoreMultFromGear
    * eq.defencesLessMultFromGear
  )

  // -------------------------------------------------------------------------
  // 12. Block and dodge
  // -------------------------------------------------------------------------
  // Dragoon class bonus: +25% to maximum block chance (75 → 100)
  const maxBlockChance = (bonus('dragoon') ? 100 : 75) + eq.maxBlockChanceBonusFromGear
  const blockChance = Math.min(maxBlockChance, u('increasedChanceToBlock') + eq.blockChanceFromGear)
  const maxDodgeCap = 75 + eq.maxDodgeChanceBonusFromGear
  const dodgeChance = Math.min(
    maxDodgeCap,
    u('increasedChanceToDodge')
      + eq.dodgeChanceFromGear
      + eq.dodgeChancePer10DexFromGear * (dex / 10)
  )

  // -------------------------------------------------------------------------
  // 13. Resistances
  // -------------------------------------------------------------------------
  // Fighter class bonus: +15% to all resistances
  const fighterBonus = (bonus('fighter') ? 15 : 0);
  const allEleBonus =
    u('increasedAllElementalResistances') +
    fighterBonus +
    eq.pctToAllElementalResFromGear
  const resistAllFlat = allEleBonus + eq.pctToAllResistancesFromGear

  // Chieftain class bonus: +5% to maximum fire resistance; gear can raise elemental/chaos caps.
  const eleBase        = FORMULA_CONSTANTS.elementalResCap
  const chaosBase      = FORMULA_CONSTANTS.chaosResCap
  const hardCap        = FORMULA_CONSTANTS.resistanceHardCap
  const allEleCap      = eq.maxAllElementalResBonusFromGear
  const maxFireRes      = Math.min(hardCap, (bonus('chieftain') ? eleBase + 5 : eleBase) + eq.maxFireResBonusFromGear + allEleCap)
  const maxColdRes      = Math.min(hardCap, eleBase  + eq.maxColdResBonusFromGear + allEleCap)
  const maxLightningRes = Math.min(hardCap, eleBase  + eq.maxLightningResBonusFromGear + allEleCap)
  const maxChaosRes     = Math.min(hardCap, chaosBase + eq.maxChaosResBonusFromGear)
  const fireRes =  resistAllFlat + eq.pctFireResFromGear;
  const coldRes = resistAllFlat + eq.pctColdResFromGear;
  const lightningRes = resistAllFlat + eq.pctLightningResFromGear;
  const chaosRes = u('increasedChaosResistance') + eq.pctChaosResFromGear + fighterBonus;

  // -------------------------------------------------------------------------
  // 14. Offense — accuracy
  // -------------------------------------------------------------------------
  // Flat: base + Rogue + gear flat. Increased: tree + gear % — same pattern as crit chance §16.
  const accuracyFlatBase =
    BASE_GAME_STATS.baseAccuracy + (bonus('rogue') ? 150 : 0) + levelFlatAccuracy + eq.flatAccuracy
  const accuracyFromUpgrades =
    u('increasedAccuracyRating') + eq.pctIncreasedAccuracyFromGear
  const accuracy = Math.round(
    accuracyFlatBase * (1 + accuracyFromUpgrades / 100) * eq.accuracyLessMultFromGear
  )

  // -------------------------------------------------------------------------
  // 15. Offense — hit damage (split by type for display; totals match sum of parts)
  // -------------------------------------------------------------------------
  const dmgPushIf = (arr: StatContributionLine[], label: string, v: number) => {
    if (v !== 0) arr.push({ label, value: v })
  }

  let abilityHitDmBreak: HitDamageComputationBreakdown['abilityDamageMultiplier'] = null
  let hitDamageBreakdownPartial: Omit<
    HitDamageComputationBreakdown,
    'avgHit' | 'critical' | 'dps' | 'combatOnlyNotInPlannerHitOrDps' | 'enemiesTakeIncreasedDamage'
  > | null = null

  const fireR = localFlatDamageDisplayRange(eq.flatFireMin, eq.flatFireMax)
  const coldR = localFlatDamageDisplayRange(eq.flatColdMin, eq.flatColdMax)
  const lightningR = localFlatDamageDisplayRange(eq.flatLightningMin, eq.flatLightningMax)
  const chaosR = localFlatDamageDisplayRange(eq.flatChaosMin, eq.flatChaosMax)
  // Physical min/max: with a weapon equipped, aggregated `eq.flatDamage*` is the weapon (replaces unarmed base).
  // Unarmed: character base hit damage + any flat physical from gear.
  const hasEquippedWeapon = weaponItemId !== 'none'
  const basePhysMin = roundDamageNearest(
    hasEquippedWeapon ? eq.flatDamageMin : BASE_GAME_STATS.baseHitDamageMin + eq.flatDamageMin
  )
  const basePhysMax = roundDamageNearest(
    hasEquippedWeapon ? eq.flatDamageMax : BASE_GAME_STATS.baseHitDamageMax + eq.flatDamageMax
  )

  let hitProvRows = buildProvHitDamageByType([
    {
      type: 'physical',
      min: basePhysMin,
      max: basePhysMax,
      scaling: 'physical_style',
    },
    { type: 'fire', min: fireR.min, max: fireR.max, scaling: 'native_elemental' },
    { type: 'cold', min: coldR.min, max: coldR.max, scaling: 'native_elemental' },
    { type: 'lightning', min: lightningR.min, max: lightningR.max, scaling: 'native_elemental' },
    { type: 'chaos', min: chaosR.min, max: chaosR.max, scaling: 'chaos_style' },
  ])

  // Melee/Ranged ability damage multiplier, then phys→element conversion: gear % + ability % summed
  // in one pass (each % is of the same physical roll — see applyGearPhysicalConversionProv).
  const selForHit = config.ability
  if (selForHit?.abilityId) {
    const abDef = EOC_ABILITY_BY_ID[selForHit.abilityId]
    const abLevel = Math.min(20, Math.max(0, Math.floor(selForHit.abilityLevel ?? 0)))
    if (
      abDef
      && abilityMatchesWeapon(abDef, weaponTag)
      && (abDef.type === 'Melee' || abDef.type === 'Ranged')
    ) {
      const startLvl = abDef.startingAbilityLevel ?? 0
      const scaledDm = attackDamageMultiplierAtAbilityLevel(
        abDef.damageMultiplierPct ?? 100,
        startLvl,
        abLevel
      )
      abilityHitDmBreak = {
        abilityId: abDef.id,
        abilityName: abDef.name,
        level: abLevel,
        basePct: abDef.damageMultiplierPct ?? 100,
        scaledPct: scaledDm,
        factor: scaledDm / 100,
      }
      hitProvRows = scaleProvHitDamageRows(hitProvRows, scaledDm / 100)
    }
  }

  /** Same factor applied to hit rows as `scaleProvHitDamageRows` (before conversion / increased). */
  const abilityBaseDamageFactor = abilityHitDmBreak?.factor ?? 1
  const elementalBaseRows = (
    [
      { type: 'fire' as const, min: fireR.min, max: fireR.max },
      { type: 'cold' as const, min: coldR.min, max: coldR.max },
      { type: 'lightning' as const, min: lightningR.min, max: lightningR.max },
      { type: 'chaos' as const, min: chaosR.min, max: chaosR.max },
    ] satisfies Array<{ type: HitDamageTypeRow['type']; min: number; max: number }>
  ).filter((x) => x.min > 0 || x.max > 0)
  const baseWeaponDamageForBreakdown: HitDamageComputationBreakdown['baseWeaponDamage'] = {
    includesCharacterBasePhysical: !hasEquippedWeapon,
    beforeAbilityDamageMult: {
      physicalMin: basePhysMin,
      physicalMax: basePhysMax,
      elemental: elementalBaseRows.map((x) => ({ ...x })),
    },
    afterAbilityDamageMult: {
      physicalMin: roundDamageNearest(basePhysMin * abilityBaseDamageFactor),
      physicalMax: roundDamageNearest(basePhysMax * abilityBaseDamageFactor),
      elemental: elementalBaseRows.map((x) => ({
        ...x,
        min: roundDamageNearest(x.min * abilityBaseDamageFactor),
        max: roundDamageNearest(x.max * abilityBaseDamageFactor),
      })),
    },
  }

  const convFromAbilityLines =
    selForHit?.abilityId
      ? (() => {
          const abDef = EOC_ABILITY_BY_ID[selForHit.abilityId]
          if (
            !abDef
            || !abilityMatchesWeapon(abDef, weaponTag)
            || (abDef.type !== 'Melee' && abDef.type !== 'Ranged')
          ) {
            return { toFire: 0, toCold: 0, toLightning: 0 }
          }
          return physicalElementConversionFromAbilityLines(abDef.lines)
        })()
      : { toFire: 0, toCold: 0, toLightning: 0 }

  const gearPctFire = eq.physicalConvertedToFirePctFromGear
  const gearPctCold = eq.physicalConvertedToColdPctFromGear
  const gearPctLightning = eq.physicalConvertedToLightningPctFromGear
  const combPctFire = gearPctFire + convFromAbilityLines.toFire
  const combPctCold = gearPctCold + convFromAbilityLines.toCold
  const combPctLightning = gearPctLightning + convFromAbilityLines.toLightning
  const convNorm = normalizePhysicalConversionPcts(combPctFire, combPctCold, combPctLightning)
  const physicalConversionForBreakdown: HitDamageComputationBreakdown['physicalConversion'] = {
    gearPct: { fire: gearPctFire, cold: gearPctCold, lightning: gearPctLightning },
    abilityPct: {
      fire: convFromAbilityLines.toFire,
      cold: convFromAbilityLines.toCold,
      lightning: convFromAbilityLines.toLightning,
    },
    combinedRawPct: { fire: combPctFire, cold: combPctCold, lightning: combPctLightning },
    rawTotalPercent: convNorm.rawTotal,
    cappedAt100Percent: convNorm.rawTotal > 100,
    normalizationFactor: convNorm.normalizationFactor,
    effectivePercent: {
      fire: convNorm.toFire,
      cold: convNorm.toCold,
      lightning: convNorm.toLightning,
    },
  }

  const laterConversions: HitDamageComputationBreakdown['laterConversions'] = []

  hitProvRows = applyGearPhysicalConversionProv(
    hitProvRows,
    combPctFire,
    combPctCold,
    combPctLightning
  )
  if (eq.physicalToRandomElementPctFromGear > 0) {
    laterConversions.push({
      name: 'Physical to random element (split to fire / cold / lightning)',
      percent: eq.physicalToRandomElementPctFromGear,
    })
    hitProvRows = applyPhysicalToRandomElementsProv(
      hitProvRows,
      eq.physicalToRandomElementPctFromGear
    )
  }
  if (eq.gainPhysicalAsExtraLightningPctFromGear > 0) {
    laterConversions.push({
      name: 'Gain physical damage as extra lightning',
      percent: eq.gainPhysicalAsExtraLightningPctFromGear,
    })
    hitProvRows = applyGainPhysicalAsExtraLightningProv(
      hitProvRows,
      eq.gainPhysicalAsExtraLightningPctFromGear
    )
  }

  if (eq.lightningToColdConversionPctFromGear > 0) {
    laterConversions.push({
      name: 'Lightning damage converted to cold (per lightning instance)',
      percent: eq.lightningToColdConversionPctFromGear,
    })
    hitProvRows = applyLightningToColdConversionProv(
      hitProvRows,
      eq.lightningToColdConversionPctFromGear
    )
  }
  if (eq.elementalToChaosConversionPctFromGear > 0) {
    laterConversions.push({
      name: 'Elemental damage converted to chaos',
      percent: eq.elementalToChaosConversionPctFromGear,
    })
    hitProvRows = applyElementalToChaosConversionProv(
      hitProvRows,
      eq.elementalToChaosConversionPctFromGear
    )
  }
  let hitDamageByType: HitDamageTypeRow[]
  let hitSum: { min: number; max: number }
  let hitDamageMin: number
  let hitDamageMax: number

  // -------------------------------------------------------------------------
  // 16. Critical hit chance
  // -------------------------------------------------------------------------
  // Flat: weapon (or game) base + Assassin + gear attack crit + global critChanceBonus.
  // Increased: crit upgrades + gear % + 2% per 10 DEX (× attr mult, e.g. guardian) — multiplies the flat sum.
  const baseCritChance   = eq.weaponBaseCritChance ?? BASE_GAME_STATS.baseCritChance
  const critFromDex      = (Math.floor(dex / 10) * attrCritMult * 2)
  const critFromAssassin = bonus('assassin') ? 8 : 0
  const critFromUpgrades =
    u('increasedCriticalHitChance')
    + u('increasedAttackCriticalHitChance')
    + eq.pctIncreasedCriticalHitChanceFromGear
    + critFromDex
  const attackCritFlatBase =
    baseCritChance + critFromAssassin + eq.attackBaseCritChanceBonusFromGear + eq.critChanceBonus
  let critChance = Math.min(100, attackCritFlatBase * (1 + critFromUpgrades / 100))

  // -------------------------------------------------------------------------
  // 16b. Critical damage multiplier (same shape: flat base × (1 + increased%/100))
  // -------------------------------------------------------------------------
  // Flat: game base + flat bonus to multiplier (parallel to attackCritFlatBase + critChanceBonus).
  // Increased: gear + ability attunement — one combined % bucket, like critFromUpgrades.
  const baseCritMultiplier = BASE_GAME_STATS.critMultiplier
  const critMultFlatBonus = eq.flatCriticalDamageMultiplierBonusFromGear / 100
  const attackCritMultFlatBase = baseCritMultiplier + critMultFlatBonus
  let attunementIncreasedCritMultiplierPct = 0
  const critMultFromUpgrades = () =>
    eq.increasedCriticalDamageMultiplierFromGear + attunementIncreasedCritMultiplierPct
  const recomputeCritMultiplier = () => {
    critMultiplier = attackCritMultFlatBase + (critMultFromUpgrades() / 100)
  }
  let critMultiplier = attackCritMultFlatBase + (critMultFromUpgrades() / 100)
  // -------------------------------------------------------------------------
  // 17. Attacks per second
  // -------------------------------------------------------------------------
  // Mercenary class bonus: 1% increased attack speed per 10 strength or dexterity (whichever is lower)
  const mercenaryAspIncPct = bonus('mercenary') ? Math.min(str, dex) / 10 : 0
  const totalIncreasedAtk =
    u('increasedAttackSpeed')
    + u('increasedAttackSpeedAndCastSpeed')
    + mercenaryAspIncPct
    + eq.pctIncreasedAttackSpeedFromGear
  // Rogue class bonus: 10% more APS (multiplicative)
  // Flat weapon APS × (1 + increased attack speed %) × more / less (same pattern as §16).
  const rogueMult = bonus('rogue') ? 1.10 : 1.0
  const apsFlatBase = eq.weaponEffectiveAps ?? BASE_GAME_STATS.baseAps
  let aps =
    apsFlatBase * (1 + totalIncreasedAtk / 100) * rogueMult * eq.attackSpeedLessMultFromGear

  // -------------------------------------------------------------------------
  // 18. Mana cost per attack
  // -------------------------------------------------------------------------
  // Sorcerer class bonus: 10% reduced mana cost of abilities
  let manaCostPerAttack =
    BASE_GAME_STATS.baseManaPerAttack *
    (bonus('sorcerer') ? 0.90 : 1.0) *
    Math.max(0.2, 1 - eq.manaCostReductionFromGear / 100) *
    (1 + eq.manaCostIncreasePercentFromGear / 100)

  // -------------------------------------------------------------------------
  // 19. Mana regeneration
  // -------------------------------------------------------------------------
  // Base: 2.5% of max mana per second
  const baseManaRegen  = maxMana * (BASE_GAME_STATS.baseManaRegenPercent / 100)
  // Druid class bonus: regenerate an additional 2% of max mana per second
  const druidRegenBonus = bonus('druid') ? maxMana * 0.02 : 0
  const manaRegenFlatPerSecond =
    baseManaRegen
    + druidRegenBonus
    + maxMana * (eq.manaRegenPercentOfMaxManaPerSecondFromGear / 100)
  const totalIncreasedManaRegen =
    u('increasedManaRegeneration') + eq.pctIncreasedManaRegenFromGear
  const manaRegenPerSecond =
    manaRegenFlatPerSecond * (1 + totalIncreasedManaRegen / 100)

  // -------------------------------------------------------------------------
  // 20. Damage modifiers — per hit instance (after §15 conversion lineage):
  // - physical_style: remaining physical — phys-style pool (global + attack + melee + phys attunement; not elemental Σ).
  // - native_elemental: weapon flat fire/cold/lightning — global + attack + Σ elemental + type-specific (+ fire attune).
  // - physical_and_elemental: was physical — phys-style + elemental + type-specific (same for fire/cold/lightning).
  // - chaos_style: attack + chaos-specific (no generic elemental increased).
  // -------------------------------------------------------------------------
  const meleeDmgFromStr    = Math.floor(str / 10)                        // 1% increased melee damage per 10 str
  const spellDmgFromInt    = Math.floor(int_ / 10)                       // 1% increased spell damage per 10 int

  const rangedAttackDmgFromGear =
    weaponTag === 'bow' || weaponTag === 'hand_crossbow'
      ? (str / 10) * eq.rangedDamageIncPctPer10StrFromGear
      : 0
  const increasedMeleeDamage    = u('increasedMeleeDamage')    + meleeDmgFromStr + eq.increasedMeleeDamageFromGear
  const increasedAttackDamage   =
    u('increasedAttackDamage') + eq.increasedAttackDamageFromGear + rangedAttackDmgFromGear
  const increasedSpellDamage    = u('increasedSpellDamage')    + spellDmgFromInt + eq.increasedSpellDamageFromGear
  const increasedElementalDamage =
    u('increasedElementalDamage')
    + u('increasedElementalDamageWithAttacks')
    + eq.increasedElementalDamageFromGear
  // Occultist class bonus: 1% increased damage per 100 maximum energy shield
  const occultistDmgFromEsPct   = bonus('occultist') ? maxEnergyShield / 100 : 0
  const damageIncFromCombinedAttrsGear =
    Math.floor((str + dex + int_) / 10) * eq.damageIncPctPer10CombinedAttrsFromGear
  const increasedDamage         =
    u('increasedDamage')
    + occultistDmgFromEsPct
    + eq.increasedDamageFromGear
    + levelPctIncreasedDamage
    + damageIncFromCombinedAttrsGear

  let damageOverTimeMultiplier =
    u('increasedDamageOverTimeMultiplier')
    + eq.pctIncreasedDamageOverTimeFromGear
    + eq.pctIncreasedBleedDamageFromGear
  let attIncDamage = 0
  let attIncPhysical = 0
  let attIncFire = 0
  if (config.ability?.abilityId) {
    const ad = EOC_ABILITY_BY_ID[config.ability.abilityId]
    if (ad && abilityMatchesWeapon(ad, weaponTag) && (ad.type === 'Melee' || ad.type === 'Ranged')) {
      const attPctRaw = Math.min(100, Math.max(0, Number(config.ability.attunementPct) || 0))
      const am = interpolateAttunementModifier(ad, attPctRaw, bonus('archmage') ? 2 : 1)
      if (am) {
        if (am.key === 'increased damage') attIncDamage = am.value
        else if (am.key === 'increased physical damage') attIncPhysical = am.value
        else if (am.key === 'increased fire damage') attIncFire = am.value
      }
    }
  }

  let meleePortionForHit = 0
  if (config.ability?.abilityId) {
    const dSel = EOC_ABILITY_BY_ID[config.ability.abilityId]
    if (dSel && abilityMatchesWeapon(dSel, weaponTag) && dSel.type === 'Melee') {
      meleePortionForHit = increasedMeleeDamage
    }
  } else if (weaponTag && weaponTag !== 'bow' && weaponTag !== 'hand_crossbow') {
    meleePortionForHit = increasedMeleeDamage
  }

  const attackIncSum = increasedDamage + increasedAttackDamage + attIncDamage + meleePortionForHit
  const incEle = increasedElementalDamage
  /** Same as `physStyleIncTotal` in ProvHitIncreasedContext — not physical-type-only; includes global + attack. */
  const physStyleIncTotal = attackIncSum + attIncPhysical

  const attackIncLines: StatContributionLine[] = []
  dmgPushIf(attackIncLines, 'Upgrades: increased damage', u('increasedDamage'))
  if (occultistDmgFromEsPct !== 0) {
    attackIncLines.push({
      label: 'Occultist: increased damage per 100 maximum energy shield',
      value: occultistDmgFromEsPct,
    })
  }
  dmgPushIf(attackIncLines, 'Gear: increased damage', eq.increasedDamageFromGear)
  if (levelPctIncreasedDamage !== 0) {
    attackIncLines.push({
      label: 'Character level: +1% increased damage per level above 1',
      value: levelPctIncreasedDamage,
    })
  }
  if (damageIncFromCombinedAttrsGear !== 0) {
    attackIncLines.push({
      label: 'Gear: increased damage per 10 combined Str, Dex, and Int',
      value: damageIncFromCombinedAttrsGear,
    })
  }
  dmgPushIf(attackIncLines, 'Upgrades: increased attack damage', u('increasedAttackDamage'))
  dmgPushIf(attackIncLines, 'Gear: increased attack damage', eq.increasedAttackDamageFromGear)
  if (rangedAttackDmgFromGear !== 0) {
    attackIncLines.push({
      label: 'Gear: increased attack damage per 10 strength (ranged)',
      value: rangedAttackDmgFromGear,
    })
  }
  if (attIncDamage !== 0) {
    attackIncLines.push({ label: 'Ability attunement: increased damage', value: attIncDamage })
  }
  if (meleePortionForHit > 0) {
    dmgPushIf(attackIncLines, 'Upgrades: increased melee damage', u('increasedMeleeDamage'))
    if (meleeDmgFromStr !== 0) {
      attackIncLines.push({
        label: 'Strength: +1% increased melee damage per 10 Str (floored)',
        value: meleeDmgFromStr,
      })
    }
    dmgPushIf(attackIncLines, 'Gear: increased melee damage', eq.increasedMeleeDamageFromGear)
  }

  const physStyleIncLines: StatContributionLine[] = [...attackIncLines]
  if (attIncPhysical !== 0) {
    physStyleIncLines.push({ label: 'Ability attunement: increased physical damage', value: attIncPhysical })
  }

  const elementalLines: StatContributionLine[] = []
  dmgPushIf(elementalLines, 'Upgrades: increased elemental damage', u('increasedElementalDamage'))
  dmgPushIf(
    elementalLines,
    'Upgrades: increased elemental damage with attacks',
    u('increasedElementalDamageWithAttacks')
  )
  dmgPushIf(elementalLines, 'Gear: increased elemental damage', eq.increasedElementalDamageFromGear)

  const provIncCtx = {
    physStyleIncTotal,
    attackIncSum,
    incEle,
    attIncFire,
    gearFire: eq.increasedFireDamageFromGear,
    gearCold: eq.increasedColdDamageFromGear,
    gearLightning: eq.increasedLightningDamageFromGear,
    chaosGear: eq.increasedChaosDamageFromGear,
  }
  const hitProvRowsBeforeInc = hitProvRows.map((r) => ({ ...r }))
  const perInstanceBeforeIncreased = mergePerInstanceBeforeIncreasedRows(
    hitProvRowsBeforeInc.map((row) => {
      const increasedDamagePercent = increasedPctForProvHitRow(row, provIncCtx)
      return {
        type: row.type,
        scaling: row.scaling,
        min: row.min,
        max: row.max,
        increasedDamagePercent,
        damageMultiplier: 1 + increasedDamagePercent / 100,
      }
    })
  )
  hitProvRows = applyIncreasedToProvHitRows(hitProvRows, provIncCtx)
  // Sum by damage type first, then apply "enemies take increased damage" once per type. Per-fragment
  // rounding of that multiplier shifts totals (e.g. two lightning lines vs one combined line).
  hitDamageByType = collapseProvRowsToHitDamage(hitProvRows)
  if (enemyDamageTakenIncreasedMult !== 1) {
    hitDamageByType = scaleHitDamageByType(hitDamageByType, enemyDamageTakenIncreasedMult)
  }
  hitSum = sumHitDamageRange(hitDamageByType)
  hitDamageMin = hitSum.min
  hitDamageMax = hitSum.max

  hitDamageBreakdownPartial = {
    baseWeaponDamage: baseWeaponDamageForBreakdown,
    abilityDamageMultiplier: abilityHitDmBreak,
    physicalConversion: physicalConversionForBreakdown,
    laterConversions,
    increased: {
      attackIncSum: { total: attackIncSum, lines: attackIncLines },
      physStyleIncTotal: { total: physStyleIncTotal, lines: physStyleIncLines },
      elemental: { total: incEle, lines: elementalLines },
      typeSpecificGear: {
        fire: eq.increasedFireDamageFromGear,
        cold: eq.increasedColdDamageFromGear,
        lightning: eq.increasedLightningDamageFromGear,
        chaos: eq.increasedChaosDamageFromGear,
      },
      attunementFire: attIncFire,
    },
    perInstanceBeforeIncreased,
    collapsedAfterIncreased: hitDamageByType,
  }

  // -------------------------------------------------------------------------
  // 21. Average hit and DPS
  // -------------------------------------------------------------------------
  let avgHit               = (hitDamageMin + hitDamageMax) / 2
  let avgEffectiveDamage   = avgHit * (1 + (critChance / 100) * (critMultiplier - 1))
  let dps                  = avgEffectiveDamage * aps

  // -------------------------------------------------------------------------
  // 21b. Selected ability (EOC 1.3.2 sheet): scales attack multipliers or spell base damage
  // -------------------------------------------------------------------------
  const baselineHitMin = hitDamageMin
  const baselineHitMax = hitDamageMax
  const baselineAps = aps
  const baselineCritChance = critChance
  let abilityContribution: AbilityContributionSummary | null = null

  const sel = config.ability

  let attunementStrikesIncPct = 0
  let attunementFlatDoubleChance = 0
  let attunementDefencesPct = 0

  if (sel?.abilityId) {
    const def = EOC_ABILITY_BY_ID[sel.abilityId]
    const level = Math.min(20, Math.max(0, Math.floor(sel.abilityLevel)))
    if (def && abilityMatchesWeapon(def, weaponTag)) {
      const attPctRaw = Math.min(100, Math.max(0, Number(sel.attunementPct) || 0))
      const attPct = Math.round(attPctRaw)
      const attMult = bonus('archmage') ? 2 : 1
      const attMod = interpolateAttunementModifier(def, attPctRaw, attMult)
      const baseAbilityMana = def.manaCost != null ? def.manaCost : manaCostPerAttack
      const startLvl = def.startingAbilityLevel ?? 0

      if (def.type === 'Melee' || def.type === 'Ranged') {
        const baseDm = def.damageMultiplierPct ?? 100
        const scaledDm = attackDamageMultiplierAtAbilityLevel(baseDm, startLvl, level)
        const aspFactor = (def.attackSpeedMultiplierPct ?? 100) / 100
        aps = aps * aspFactor
        manaCostPerAttack = abilityManaCostAtLevel(baseAbilityMana, startLvl, level)
        avgHit = (hitDamageMin + hitDamageMax) / 2
        avgEffectiveDamage = avgHit * (1 + (critChance / 100) * (critMultiplier - 1))
        dps = avgEffectiveDamage * aps

        if (attMod) {
          const v = attMod.value
          const k = attMod.key
          if (k === 'increased attack speed') {
            aps *= 1 + v / 100
          } else if (k === 'increased critical hit chance') {
            critChance = Math.min(
              100,
              attackCritFlatBase * (1 + (critFromUpgrades + v) / 100)
            )
          } else if (k === 'increased strikes per attack') {
            attunementStrikesIncPct += v
          } else if (k === 'chance to deal double damage') {
            attunementFlatDoubleChance += v
          } else if (k === 'to critical damage multiplier') {
            attunementIncreasedCritMultiplierPct += v
            recomputeCritMultiplier()
          } else if (k === 'to damage over time multiplier') {
            damageOverTimeMultiplier += v
          } else if (k === 'increased defences') {
            attunementDefencesPct += v
          }
          avgHit = (hitDamageMin + hitDamageMax) / 2
          avgEffectiveDamage = avgHit * (1 + (critChance / 100) * (critMultiplier - 1))
          dps = avgEffectiveDamage * aps
        }

        abilityContribution = {
          id: def.id,
          name: def.name,
          type: def.type,
          abilityLevel: level,
          attunementPct: attPct,
          scaledDamageMultiplierPct: scaledDm,
          attackSpeedMultiplierPct: def.attackSpeedMultiplierPct,
          addedDamageMultiplierPct: null,
          spellDamageMin: null,
          spellDamageMax: null,
          spellElement: null,
          effectiveCastTimeSeconds: null,
          manaCost: manaCostPerAttack,
          baselineHitMin,
          baselineHitMax,
          baselineAps,
          baselineCritChance,
        }
      } else if (def.type === 'Spells') {
        const scaledHit = scaledSpellHitForAbility(def, level)
        if (scaledHit) {
          let spellAttIncDmg = 0
          let spellAttCast = 0
          let spellAttCritInc = 0
          if (attMod) {
            const v = attMod.value
            const k = attMod.key
            if (k === 'increased damage') spellAttIncDmg = v
            else if (k === 'increased cast speed') spellAttCast = v
            else if (k === 'increased critical hit chance') spellAttCritInc = v
            else if (k === 'to critical damage multiplier') {
              attunementIncreasedCritMultiplierPct += v
              recomputeCritMultiplier()
            } else if (k === 'to damage over time multiplier') damageOverTimeMultiplier += v
            else if (k === 'chance to deal double damage') attunementFlatDoubleChance += v
            else if (k === 'increased defences') attunementDefencesPct += v
          }
          const added = (def.addedDamageMultiplierPct ?? 100) / 100
          const isEle = ['fire', 'cold', 'lightning'].includes(scaledHit.element)
          const incFrac =
            (increasedSpellDamage + increasedDamage + spellAttIncDmg + (isEle ? increasedElementalDamage : 0)) / 100
          const castBase = def.castTimeSeconds != null && def.castTimeSeconds > 0 ? def.castTimeSeconds : 0.5
          const castSpeedInc =
            u('increasedCastSpeed')
            + u('increasedAttackSpeedAndCastSpeed')
            + spellAttCast
            + eq.pctIncreasedCastSpeedFromGear
            + eq.castSpeedIncPctPer10DexFromGear * (dex / 10)
          const effectiveCastTime =
            castBase / ((1 + castSpeedInc / 100) * eq.castSpeedLessMultFromGear)
          const castsPerSec = 1 / effectiveCastTime
          const spellBaseCrit = def.baseCritChancePct ?? BASE_GAME_STATS.baseCritChance
          const spellCritFlatBase =
            spellBaseCrit + critFromAssassin + eq.critChanceBonus + eq.spellBaseCritChanceBonusFromGear
          critChance = Math.min(
            100,
            spellCritFlatBase * (1 + (critFromUpgrades + spellAttCritInc) / 100)
          )
          hitDamageByType = buildHitDamageByType([
            {
              type: spellElementToHitDamageType(scaledHit.element),
              min: roundDamageNearest(
                scaledHit.min * added * (1 + incFrac) * enemyDamageTakenIncreasedMult
              ),
              max: roundDamageNearest(
                scaledHit.max * added * (1 + incFrac) * enemyDamageTakenIncreasedMult
              ),
            },
          ])
          hitSum = sumHitDamageRange(hitDamageByType)
          hitDamageMin = hitSum.min
          hitDamageMax = hitSum.max
          aps = castsPerSec
          manaCostPerAttack = abilityManaCostAtLevel(baseAbilityMana, startLvl, level)
          avgHit = (hitDamageMin + hitDamageMax) / 2
          avgEffectiveDamage = avgHit * (1 + (critChance / 100) * (critMultiplier - 1))
          dps = avgEffectiveDamage * aps
          abilityContribution = {
            id: def.id,
            name: def.name,
            type: def.type,
            abilityLevel: level,
            attunementPct: attPct,
            scaledDamageMultiplierPct: null,
            attackSpeedMultiplierPct: null,
            addedDamageMultiplierPct: def.addedDamageMultiplierPct,
            spellDamageMin: hitDamageMin,
            spellDamageMax: hitDamageMax,
            spellElement: scaledHit.element,
            effectiveCastTimeSeconds: effectiveCastTime,
            manaCost: manaCostPerAttack,
            baselineHitMin,
            baselineHitMax,
            baselineAps,
            baselineCritChance,
          }
        }
      }
    }
  }

  if (attunementDefencesPct !== 0) {
    const df = 1 + attunementDefencesPct / 100
    armour = Math.round(armour * df)
    evasionRating = Math.round(evasionRating * df)
    maxEnergyShield = Math.round(maxEnergyShield * df)
  }

  // -------------------------------------------------------------------------
  // 22. Post-encounter recovery
  // -------------------------------------------------------------------------
  // Hunter class bonus: 100% increased recovery (doubles the base)
  const lifeRecoveryFromHunter  = bonus('hunter')  ? 2.0  : 1.0
  // Acolyte class bonus: 25% increased recovery from all sources
  const lifeRecoveryFromAcolyte = bonus('acolyte') ? 1.25 : 1.0
  const lifeRecoveryPct = BASE_GAME_STATS.baseLifeRecoveryAfterEncounterPct
    * lifeRecoveryFromHunter
    * lifeRecoveryFromAcolyte
    * (1 + u('increasedLifeRecovery') / 100)
    * (1 + eq.pctIncreasedLifeRecoveryFromGear / 100)

  // Arcanist class bonus: 50% increased post-encounter ES recovery
  const esRecoveryPct = BASE_GAME_STATS.baseEsRecoveryAfterEncounterPct
    * (bonus('arcanist') ? 1.50 : 1.0)

  // -------------------------------------------------------------------------
  // 23. Ailment bonuses
  // -------------------------------------------------------------------------
  let bleedChance              = u('increasedChanceToInflictBleedingWithAttacks') + eq.bleedInflictChanceFromGear
  let poisonChance             = u('increasedChanceToInflictPoisonWithAttacks') + eq.poisonInflictChanceFromGear
  let elementalAilmentChance   =
    u('increasedChanceToInflictElementalAilments') + eq.elementalAilmentInflictChanceFromGear
  const ailmentDurationBonus =
    u('increasedAilmentDuration') + eq.ailmentDurationBonusFromGear
  let igniteInflictChanceBonus = eq.igniteInflictChanceFromGear
  let shockInflictChanceBonus = eq.shockInflictChanceFromGear
  let chillInflictChanceBonus = eq.chillInflictChanceFromGear

  const abForAilments = sel?.abilityId ? EOC_ABILITY_BY_ID[sel.abilityId] : undefined
  if (abForAilments && abilityMatchesWeapon(abForAilments, weaponTag)) {
    const ib = inflictAilmentBonusesFromAbilityLines(abForAilments.lines)
    bleedChance += ib.bleedChance
    poisonChance += ib.poisonChance
    elementalAilmentChance += ib.elementalAilmentChance
    igniteInflictChanceBonus += ib.igniteChance
    shockInflictChanceBonus += ib.shockChance
    chillInflictChanceBonus += ib.chillChance
  }

  if (eq.cannotInflictElementalAilmentsFromGear) {
    elementalAilmentChance = 0
    igniteInflictChanceBonus = 0
    shockInflictChanceBonus = 0
    chillInflictChanceBonus = 0
  }

  // -------------------------------------------------------------------------
  // 24. Combat modifier flags
  // -------------------------------------------------------------------------
  const tripleDamageChance = Math.min(100, eq.tripleDamageChanceFromGear)

  // Barbarian class bonus: hits ignore 50% of enemy armour
  const armourIgnorePercent = Math.min(
    100,
    (bonus('barbarian') ? 50 : 0) + eq.armourIgnoreFromGear
  )

  // Druid class bonus: 25% of damage taken applied to mana first (while above 50% mana)
  const manaShieldActive = bonus('druid')

  // Arcanist class bonus: chaos damage does not bypass energy shield
  const chaosNotBypassES = bonus('arcanist')

  // Armour effectiveness per damage type — base from FORMULA_CONSTANTS, boosted by class bonuses.
  // Juggernaut: +0.5 to all elemental, +0.25 to chaos
  const eleEffectivenessBonus = bonus('juggernaut') ? 0.5 : 0
  const armourVsElementalMultiplier =  // kept as single value for the return struct
    FORMULA_CONSTANTS.armourVsFire + eleEffectivenessBonus

  // Armour effectiveness vs chaos damage:
  const armourVsChaosMultiplier =
    FORMULA_CONSTANTS.armourVsChaos
    + (bonus('juggernaut') ? 0.25 : 0)
    + (bonus('templar')    ? 0.50 : 0)
    + (bonus('chieftain')  ? 0.50 : 0)
    + eq.armourEffectivenessVsChaosFromGear

  // -------------------------------------------------------------------------
  // 25. Class levels active (for display)
  // -------------------------------------------------------------------------
  const classLevelsActive: Record<string, number> = {}
  for (const cls of GAME_CLASSES) {
    const lvl = getClassLevel(cls.id, config.upgradeLevels)
    if (lvl > 0) classLevelsActive[cls.id] = lvl
  }

  // -------------------------------------------------------------------------
  // 26. Strikes per attack (gear + melee/ranged abilities; spells use 1 in demo combat)
  // -------------------------------------------------------------------------
  const spellCombat = abilityContribution?.type === 'Spells'
  // Barbarian / Destroyer / gear double damage; spell-only double when a spell is selected.
  const doubleDamageChance = Math.min(
    100,
    (bonus('barbarian') ? 10 : 0) +
      (bonus('destroyer') ? 25 : 0) +
      eq.doubleDamageChanceFromGear +
      attunementFlatDoubleChance +
      (spellCombat ? eq.doubleDamageChanceFromSpellsFromGear : 0)
  )
  let strikesPerAttack = 1
  if (!spellCombat) {
    const aid = config.ability?.abilityId
    const ab = aid ? EOC_ABILITY_BY_ID[aid] : undefined
    const abStrikes =
      ab && (ab.type === 'Melee' || ab.type === 'Ranged') ? extraStrikesFromAbilityLines(ab.lines) : 0
    const baseStrikes = 1 + eq.flatStrikesPerAttack + abStrikes
    const incStrikes =
      eq.increasedStrikesPerAttackFromGear +
      eq.strikesIncPctPer10DexFromGear * (dex / 10) +
      attunementStrikesIncPct
    strikesPerAttack = Math.max(
      1,
      Math.round(baseStrikes * (1 + incStrikes / 100) * eq.strikesMoreMultFromGear)
    )
  }

  if (!spellCombat) {
    dps = avgEffectiveDamage * aps * strikesPerAttack
  }

  recomputeCritMultiplier()

  if (eq.cannotDealCriticalStrikesFromGear) critChance = 0
  // Final crit multiplier can change from attunement; refresh expectation damage and DPS for attacks.
  if (!spellCombat) {
    avgEffectiveDamage = avgHit * (1 + (critChance / 100) * (critMultiplier - 1))
    dps = avgEffectiveDamage * aps * strikesPerAttack
  }

  const mercenaryAspIncPctBr = bonus('mercenary') ? Math.min(str, dex) / 10 : 0
  const totalIncreasedAtkBr =
    u('increasedAttackSpeed')
    + u('increasedAttackSpeedAndCastSpeed')
    + mercenaryAspIncPctBr
    + eq.pctIncreasedAttackSpeedFromGear
  const apsFlatBaseBr = eq.weaponEffectiveAps ?? BASE_GAME_STATS.baseAps
  const rogueMultBr = bonus('rogue') ? 1.10 : 1.0

  let hitDamageComputationBreakdown: HitDamageComputationBreakdown | null = null
  if (hitDamageBreakdownPartial && abilityContribution?.type !== 'Spells') {
    const strikesLines: StatContributionLine[] = []
    if (!spellCombat) {
      const aid = config.ability?.abilityId
      const ab = aid ? EOC_ABILITY_BY_ID[aid] : undefined
      const abStrikes =
        ab && (ab.type === 'Melee' || ab.type === 'Ranged') ? extraStrikesFromAbilityLines(ab.lines) : 0
      strikesLines.push({ label: 'Base strikes per attack', value: 1 })
      dmgPushIf(strikesLines, 'Gear: additional strikes per attack', eq.flatStrikesPerAttack)
      if (abStrikes !== 0) {
        strikesLines.push({ label: 'Ability lines: extra strikes per attack', value: abStrikes })
      }
      dmgPushIf(strikesLines, 'Gear: increased strikes per attack', eq.increasedStrikesPerAttackFromGear)
      if (eq.strikesIncPctPer10DexFromGear !== 0) {
        strikesLines.push({
          label: 'Gear: increased strikes per attack per 10 dexterity',
          value: eq.strikesIncPctPer10DexFromGear * (dex / 10),
        })
      }
      if (attunementStrikesIncPct !== 0) {
        strikesLines.push({
          label: 'Ability attunement: increased strikes per attack',
          value: attunementStrikesIncPct,
        })
      }
    }

    const apsIncLines: StatContributionLine[] = []
    dmgPushIf(apsIncLines, 'Upgrades: increased attack speed', u('increasedAttackSpeed'))
    dmgPushIf(apsIncLines, 'Upgrades: increased attack speed and cast speed', u('increasedAttackSpeedAndCastSpeed'))
    if (mercenaryAspIncPctBr !== 0) {
      apsIncLines.push({
        label: 'Mercenary: 1% increased attack speed per 10 Str or Dex (lower)',
        value: mercenaryAspIncPctBr,
      })
    }
    dmgPushIf(apsIncLines, 'Gear: increased attack speed', eq.pctIncreasedAttackSpeedFromGear)

    const apsMore: Array<{ label: string; factor: number }> = []
    if (bonus('rogue')) apsMore.push({ label: 'Rogue: 10% more attack speed', factor: 1.1 })
    apsMore.push({ label: 'Gear: attack speed less / more multiplier', factor: eq.attackSpeedLessMultFromGear })
    if (abilityContribution?.attackSpeedMultiplierPct != null && abilityContribution.attackSpeedMultiplierPct !== 100) {
      apsMore.push({
        label: `Ability (${abilityContribution.name}): attack speed multiplier`,
        factor: (abilityContribution.attackSpeedMultiplierPct ?? 100) / 100,
      })
    }

    hitDamageComputationBreakdown = {
      ...hitDamageBreakdownPartial,
      avgHit,
      critical: {
        critChance,
        critMultiplier,
        effectiveDamageMultiplier: 1 + (critChance / 100) * (critMultiplier - 1),
      },
      dps: {
        avgEffectiveDamage,
        value: dps,
        attacksPerSecond: aps,
        apsContributions: apsIncLines,
        apsMoreMultipliers: apsMore,
        strikesPerAttack,
        strikesContributions: strikesLines,
        notes: [
          `Weapon base APS: ${apsFlatBaseBr.toFixed(2)} (before increased attack speed; total increased ${totalIncreasedAtkBr.toFixed(1)}%)`,
          `Multiplicative APS: ×${rogueMultBr.toFixed(2)} Rogue (if inactive ×1), ×${eq.attackSpeedLessMultFromGear.toFixed(3)} gear, ability speed mult if any`,
          enemyDamageTakenIncreasedTotalPct !== 0
            ? `Enemies take +${enemyDamageTakenIncreasedTotalPct.toFixed(1)}% increased damage (gear + Trickster): ×${enemyDamageTakenIncreasedMult.toFixed(4)} on hit (included in range and DPS).`
            : 'No “enemies take increased damage” from gear or Trickster.',
          'Planner hit range and DPS omit gear “% less damage dealt” (see combat-only below).',
        ],
      },
      enemiesTakeIncreasedDamage: {
        gearPercent: eq.enemyDamageTakenIncreasedFromGear,
        tricksterPercent: enemyDamageTakenIncreasedFromTricksterPct,
        totalPercent: enemyDamageTakenIncreasedTotalPct,
        multiplier: enemyDamageTakenIncreasedMult,
      },
      combatOnlyNotInPlannerHitOrDps: {
        damageDealtLessMult: eq.damageDealtLessMultFromGear,
      },
    }
  }

  const dotDamageMoreMultiplier = eq.dotDamageMoreMultFromGear
  const lightningPenetrationPercent = eq.lightningPenetrationFromGear
  const lifeOnHit = eq.lifeOnHitFromGear
  const lifeLeechFromHitDamagePercent = eq.lifeLeechFromHitDamagePercentFromGear
  const lifeLeechFromPhysicalHitPercent = eq.lifeLeechFromPhysicalHitPercentFromGear
  const hitsCannotBeEvaded = eq.hitsCannotBeEvadedFromGear
  const blockDamageTakenMult = Math.min(
    0.95,
    Math.max(0.05, 0.5 * (100 / (100 + eq.blockPowerPctFromGear)))
  )
  const lifeRegenPercentOfMaxPerSecond = eq.lifeRegenPercentOfMaxLifePerSecondFromGear
  const esRegenPercentOfMaxPerSecond = eq.esRegenPercentOfMaxPerSecondFromGear
  const enemiesTakeIncreasedDamagePercent = enemyDamageTakenIncreasedTotalPct
  const damageTakenMultiplierFromGear =
    eq.damageTakenLessMultFromGear * eq.damageTakenMoreMultFromGear
  const firePenetrationPercent = eq.firePenetrationFromGear
  const coldPenetrationPercent = eq.coldPenetrationFromGear
  const chaosPenetrationPercent = eq.chaosPenetrationFromGear
  const elementalPenetrationPercent = eq.elementalPenetrationFromGear
  const cannotInflictElementalAilments = eq.cannotInflictElementalAilmentsFromGear
  const hitsTakenCannotBeCritical = eq.hitsTakenCannotBeCriticalFromGear

  if (eq.abilitiesNoCostFromGear) manaCostPerAttack = 0

  const damageDealtLessMult = eq.damageDealtLessMultFromGear
  const lifeRecoveryRateMult = 1 + eq.pctIncreasedLifeRecoveryFromGear / 100
  const physicalDamageTakenAsChaosPercent = eq.physicalTakenAsChaosPercentFromGear
  const physicalDamageTakenAsFirePercent = eq.physicalTakenAsFirePercentFromGear
  const physicalDamageTakenAsColdPercent = eq.physicalTakenAsColdPercentFromGear
  const physicalDamageTakenAsLightningPercent = eq.physicalTakenAsLightningPercentFromGear
  const elementalDamageTakenAsChaosPercent = eq.elementalTakenAsChaosPercentFromGear
  // Arcanist class bonus: take 15% reduced physical damage while you have energy shield
  const reducedPhysicalDamageTaken =
    eq.reducedPhysicalDamageTakenFromGear + (bonus('arcanist') ? 15 : 0)
  const nonDamagingAilmentEffectIncreasedPercent = eq.nonDamagingAilmentEffectIncreasedFromGear
  const chillInflictEffectMult = eq.chillInflictEffectMultFromGear
  const dealNoDamageExceptCrit = eq.dealNoDamageExceptCritFromGear

  const damageTakenToManaFirstPercent = eq.damageTakenToManaFirstPercentFromGear
  const lifeRecoveredOnKillPercent = eq.lifeRecoveredOnKillPercentFromGear
  const flatLifeOnKill = eq.flatLifeOnKillFromGear
  const flatManaOnKill = eq.manaOnKillFlatFromGear
  const lifeRecoveredOnBlockPercent = eq.lifeRecoveredOnBlockPercentFromGear
  const flatLifeOnBlock = eq.flatLifeOnBlockFromGear
  const manaRecoveredOnBlockPercent = eq.manaRecoveredOnBlockPercentFromGear
  const esRecoveredOnBlockPercent = eq.esRecoveredOnBlockPercentFromGear
  const flatManaOnBlock = eq.flatManaOnBlockFromGear
  const flatEsOnBlock = eq.flatEsOnBlockFromGear
  const energyShieldOnHit = eq.energyShieldOnHitFromGear
  const manaCostPaidWithLife = eq.manaCostPaidWithLifeFromGear

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------
  return {
    // Attributes
    str,
    dex,
    int: int_,

    // Core pools
    maxLife,
    maxMana,
    maxEnergyShield,

    // Defenses
    armour,
    evasionRating,
    blockChance,
    dodgeChance,

    // Resistances
    fireRes,
    coldRes,
    lightningRes,
    chaosRes,
    maxFireRes,
    maxColdRes,
    maxLightningRes,
    maxChaosRes,

    // Offense
    hitDamageMin,
    hitDamageMax,
    hitDamageByType,
    aps,
    manaCostPerAttack,
    accuracy,
    critChance,
    critMultiplier,
    avgHit,
    avgEffectiveDamage,
    dps,
    strikesPerAttack,

    // Recovery
    manaRegenPerSecond,
    lifeRecoveryPct,
    esRecoveryPct,

    // Ailments
    bleedChance,
    poisonChance,
    elementalAilmentChance,
    ailmentDurationBonus,
    igniteInflictChanceBonus,
    shockInflictChanceBonus,
    chillInflictChanceBonus,

    // Damage modifiers
    increasedMeleeDamage,
    increasedAttackDamage,
    increasedSpellDamage,
    increasedElementalDamage,
    increasedDamage,
    damageOverTimeMultiplier,

    // Combat modifier flags
    doubleDamageChance,
    tripleDamageChance,
    armourIgnorePercent,
    dotDamageMoreMultiplier,
    lightningPenetrationPercent,
    firePenetrationPercent,
    coldPenetrationPercent,
    chaosPenetrationPercent,
    elementalPenetrationPercent,
    lifeOnHit,
    lifeLeechFromHitDamagePercent,
    lifeLeechFromPhysicalHitPercent,
    hitsCannotBeEvaded,
    blockDamageTakenMult,
    lifeRegenPercentOfMaxPerSecond,
    esRegenPercentOfMaxPerSecond,
    enemiesTakeIncreasedDamagePercent,
    damageTakenMultiplierFromGear,
    cannotInflictElementalAilments,
    hitsTakenCannotBeCritical,
    damageDealtLessMult,
    lifeRecoveryRateMult,
    physicalDamageTakenAsChaosPercent,
    physicalDamageTakenAsFirePercent,
    physicalDamageTakenAsColdPercent,
    physicalDamageTakenAsLightningPercent,
    elementalDamageTakenAsChaosPercent,
    reducedPhysicalDamageTaken,
    nonDamagingAilmentEffectIncreasedPercent,
    chillInflictEffectMult,
    dealNoDamageExceptCrit,
    damageTakenToManaFirstPercent,
    lifeRecoveredOnKillPercent,
    flatLifeOnKill,
    flatManaOnKill,
    lifeRecoveredOnBlockPercent,
    flatLifeOnBlock,
    manaRecoveredOnBlockPercent,
    esRecoveredOnBlockPercent,
    flatManaOnBlock,
    flatEsOnBlock,
    energyShieldOnHit,
    manaCostPaidWithLife,
    manaShieldActive,
    chaosNotBypassES,
    armourVsElementalMultiplier,
    armourVsChaosMultiplier,

    // Meta
    classBonusesActive,
    classLevelsActive,

    abilityContribution,
    hitDamageComputationBreakdown,
  }
}
