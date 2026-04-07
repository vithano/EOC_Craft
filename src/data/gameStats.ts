import type { UpgradeModifierKey } from './gameClasses'
import {
  GAME_CLASSES,
  GAME_CLASSES_BY_ID,
  BASE_GAME_STATS,
  getClassLevel,
  isClassBonusActive,
} from './gameClasses'
import {
  EQUIPMENT_SLOTS,
  getItemDefinition,
  type EquippedEntry,
  type ItemModifiers,
} from './equipment'
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
  attributeThresholdConditionalPatchFromTexts,
  applyExtraCraftedModPatterns,
  equipmentModifiersFromUniqueTexts,
  type UniqueGearStatPatch,
} from './uniqueGearMods'
import { EOC_BASE_EQUIPMENT_BY_ID, isCraftedEquipItemId } from './eocBaseEquipment'
import { appliedModifiersToStatTexts } from './eocModifiers'

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
  /**
   * Equipment snapshot (same shape as planner `equipped`). When set, attribute-threshold unique mods
   * (e.g. Titansblood belt) are applied after Str/Dex/Int are computed.
   */
  equipped?: Record<string, EquippedEntry>
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

/** Source lines for a single planner stat (shown in expandable breakdown UI). */
export interface StatBreakdownBlock {
  /** Optional one-line summary of how the final value is obtained. */
  formula?: string
  lines: StatContributionLine[]
}

/**
 * Per-stat contribution lines for the planner stats panel — mirrors {@link ComputedBuildStats} fields
 * (except composite / large objects which get a short formula instead).
 */
export interface StatBreakdowns {
  str: StatBreakdownBlock
  dex: StatBreakdownBlock
  int: StatBreakdownBlock
  maxLife: StatBreakdownBlock
  maxMana: StatBreakdownBlock
  maxEnergyShield: StatBreakdownBlock
  armour: StatBreakdownBlock
  evasionRating: StatBreakdownBlock
  blockChance: StatBreakdownBlock
  dodgeChance: StatBreakdownBlock
  fireRes: StatBreakdownBlock
  coldRes: StatBreakdownBlock
  lightningRes: StatBreakdownBlock
  chaosRes: StatBreakdownBlock
  maxFireRes: StatBreakdownBlock
  maxColdRes: StatBreakdownBlock
  maxLightningRes: StatBreakdownBlock
  maxChaosRes: StatBreakdownBlock
  hitDamageMin: StatBreakdownBlock
  hitDamageMax: StatBreakdownBlock
  hitDamageByType: StatBreakdownBlock
  aps: StatBreakdownBlock
  manaCostPerAttack: StatBreakdownBlock
  accuracy: StatBreakdownBlock
  critChance: StatBreakdownBlock
  critMultiplier: StatBreakdownBlock
  avgHit: StatBreakdownBlock
  avgEffectiveDamage: StatBreakdownBlock
  dps: StatBreakdownBlock
  strikesPerAttack: StatBreakdownBlock
  manaRegenPerSecond: StatBreakdownBlock
  lifeRecoveryPct: StatBreakdownBlock
  esRecoveryPct: StatBreakdownBlock
  bleedChance: StatBreakdownBlock
  poisonChance: StatBreakdownBlock
  elementalAilmentChance: StatBreakdownBlock
  ailmentDurationBonus: StatBreakdownBlock
  ailmentDurationMultiplier: StatBreakdownBlock
  igniteAilmentDurationMultiplier: StatBreakdownBlock
  igniteInflictChanceBonus: StatBreakdownBlock
  shockInflictChanceBonus: StatBreakdownBlock
  chillInflictChanceBonus: StatBreakdownBlock
  increasedMeleeDamage: StatBreakdownBlock
  increasedAttackDamage: StatBreakdownBlock
  increasedSpellDamage: StatBreakdownBlock
  increasedElementalDamage: StatBreakdownBlock
  increasedDamage: StatBreakdownBlock
  damageOverTimeMultiplier: StatBreakdownBlock
  doubleDamageChance: StatBreakdownBlock
  tripleDamageChance: StatBreakdownBlock
  armourIgnorePercent: StatBreakdownBlock
  dotDamageMoreMultiplier: StatBreakdownBlock
  lightningPenetrationPercent: StatBreakdownBlock
  firePenetrationPercent: StatBreakdownBlock
  coldPenetrationPercent: StatBreakdownBlock
  chaosPenetrationPercent: StatBreakdownBlock
  elementalPenetrationPercent: StatBreakdownBlock
  lifeOnHit: StatBreakdownBlock
  lifeLeechFromHitDamagePercent: StatBreakdownBlock
  lifeLeechFromPhysicalHitPercent: StatBreakdownBlock
  hitsCannotBeEvaded: StatBreakdownBlock
  blockDamageTakenMult: StatBreakdownBlock
  lifeRegenPercentOfMaxPerSecond: StatBreakdownBlock
  esRegenPercentOfMaxPerSecond: StatBreakdownBlock
  enemiesTakeIncreasedDamagePercent: StatBreakdownBlock
  damageTakenMultiplierFromGear: StatBreakdownBlock
  cannotInflictElementalAilments: StatBreakdownBlock
  hitsTakenCannotBeCritical: StatBreakdownBlock
  damageDealtLessMult: StatBreakdownBlock
  lifeRecoveryRateMult: StatBreakdownBlock
  physicalDamageTakenAsChaosPercent: StatBreakdownBlock
  physicalDamageTakenAsFirePercent: StatBreakdownBlock
  physicalDamageTakenAsColdPercent: StatBreakdownBlock
  physicalDamageTakenAsLightningPercent: StatBreakdownBlock
  elementalDamageTakenAsChaosPercent: StatBreakdownBlock
  reducedPhysicalDamageTaken: StatBreakdownBlock
  nonDamagingAilmentEffectIncreasedPercent: StatBreakdownBlock
  chillInflictEffectMult: StatBreakdownBlock
  dealNoDamageExceptCrit: StatBreakdownBlock
  damageTakenToManaFirstPercent: StatBreakdownBlock
  lifeRecoveredOnKillPercent: StatBreakdownBlock
  flatLifeOnKill: StatBreakdownBlock
  flatManaOnKill: StatBreakdownBlock
  lifeRecoveredOnBlockPercent: StatBreakdownBlock
  flatLifeOnBlock: StatBreakdownBlock
  manaRecoveredOnBlockPercent: StatBreakdownBlock
  esRecoveredOnBlockPercent: StatBreakdownBlock
  flatManaOnBlock: StatBreakdownBlock
  flatEsOnBlock: StatBreakdownBlock
  energyShieldOnHit: StatBreakdownBlock
  manaCostPaidWithLife: StatBreakdownBlock
  avoidAilmentsChance: StatBreakdownBlock
  avoidElementalAilmentsChance: StatBreakdownBlock
  manaShieldActive: StatBreakdownBlock
  chaosNotBypassES: StatBreakdownBlock
  armourVsElementalMultiplier: StatBreakdownBlock
  armourVsChaosMultiplier: StatBreakdownBlock
  classBonusesActive: StatBreakdownBlock
  classLevelsActive: StatBreakdownBlock
  abilityContribution: StatBreakdownBlock
  hitDamageComputationBreakdown: StatBreakdownBlock
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

/** Spell hit pipeline: base, gear added-to-spells, crit, cast time, DPS (planner). */
export interface SpellDamageComputationBreakdown {
  abilityId: string
  abilityName: string
  level: number
  element: string
  /** Raw spell hit range from the ability scaling, before gear added-to-spells and before increased. */
  baseHit: { min: number; max: number }
  /** Flat added-to-spells contributions by type (already in display-space low/high). */
  addedFromGearByType: Array<{ type: HitDamageTypeRow['type']; min: number; max: number }>
  /** Added-damage multiplier on the ability (addedDamageMultiplierPct/100). */
  addedDamageMultiplier: number
  /** Total increased% used for spell hit (spell+global+ability+elemental). */
  increasedDamagePercent: number
  enemiesTakeIncreasedDamage: {
    gearPercent: number
    tricksterPercent: number
    totalPercent: number
    multiplier: number
  }
  afterIncreasedByType: HitDamageTypeRow[]
  avgHit: number
  critical: {
    critChance: number
    critMultiplier: number
    effectiveDamageMultiplier: number
  }
  cast: {
    baseCastTimeSeconds: number
    increasedCastSpeedPercent: StatContributionLine[]
    castSpeedLessMultipliers: Array<{ label: string; factor: number }>
    effectiveCastTimeSeconds: number
    castsPerSecond: number
  }
  dps: {
    avgEffectiveDamage: number
    value: number
    strikesPerCast: number
    notes: string[]
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
  /** Spell-only flat added hit damage (does not affect attack base). Stored with local min×0.5 convention. */
  flatSpellDamageMin: number
  flatSpellDamageMax: number
  flatSpellFireMin: number
  flatSpellFireMax: number
  flatSpellColdMin: number
  flatSpellColdMax: number
  flatSpellLightningMin: number
  flatSpellLightningMax: number
  flatSpellChaosMin: number
  flatSpellChaosMax: number
  critChanceBonus: number // percentage points
  strBonus: number
  dexBonus: number
  intBonus: number
  /** Flat accuracy from gear (before % increased accuracy). */
  flatAccuracy: number
  /** Flat armour gained per 10 intelligence (e.g. "+16 armour per 10 intelligence" → 16). */
  armourPer10IntFromGear: number
  /** +X% chance to avoid ailments. */
  avoidAilmentsChanceFromGear: number
  /** +X% chance to avoid elemental ailments. */
  avoidElementalAilmentsChanceFromGear: number
  enemyLoseMaxLifeAtStartPercentFromGear: number
  executeEnemiesBelowLifePercentFromGear: number
  executeEnemiesBelowLifePercentEqualToChillEffectFromGear: boolean
  periodicShockPctFromGear: number
  periodicShockEverySecFromGear: number
  periodicLifeRegenPctFromGear: number
  periodicLifeRegenEverySecFromGear: number
  periodicLifeRegenDurationSecFromGear: number
  armourNoEffectVsPhysicalFromGear: boolean
  chaosDamageCanIgniteFromGear: boolean
  lightningDamageCanPoisonFromGear: boolean
  chaosDamageCanInflictAllElementalAilmentsFromGear: boolean
  allElementalDamageTypesCanChillFromGear: boolean
  allElementalDamageTypesCanIgniteFromGear: boolean
  allElementalDamageTypesCanShockFromGear: boolean
  critsAlwaysInflictPoisonFromGear: boolean
  critsAlwaysInflictElementalAilmentsFromGear: boolean
  ignoreMaxShockEffectFromGear: boolean
  fixedShockEffectPercentFromGear: number
  randomIgniteDurationLessPercentFromGear: number
  randomIgniteDurationMorePercentFromGear: number
  chillYouInflictInfiniteDurationFromGear: boolean
  takePhysicalDamagePercentOfMaxLifeWhenYouAttackFromGear: number
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
  /** Product of (1 − p/100) per “% less … duration” (ailment/bleed/poison/chill/shock). */
  ailmentDurationLessMultFromGear: number
  /** Product of (1 − p/100) per “% less ignite duration” (ignite DoT only, after global ailment mult). */
  igniteDurationLessMultFromGear: number

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

  increasedItemRarityFromGear: number
  increasedItemQuantityFromGear: number
  critIncPctPerItemRarityPctFromGear: number
  critMultiPctPerItemQuantityPctFromGear: number
  critMultiPctPer20AccuracyFromGear: number
  additionalAbilityLevelsAllFromGear: number
  additionalAbilityLevelsColdFromGear: number

  maxShockEffectBonusFromGear: number
  maxChillEffectBonusFromGear: number
  increasedShockEffectFromGear: number
  shockDurationMoreMultFromGear: number
  enemiesDealLessDamageFromGear: number
  enemiesHaveMoreSpeedFromGear: number
  enemyResistancesEqualToYoursFromGear: boolean
  enemiesUnaffectedByChillFromGear: boolean

  fixedCritChancePercentFromGear: number
  blockChanceMultiplierFromGear: number
  cannotEvadeFromGear: boolean
  cannotDodgeFromGear: boolean

  manaCostPaidWithEnergyShieldFromGear: boolean
  noManaFromGear: boolean
  manaRegenToEnergyShieldPercentFromGear: number

  cannotEvadeWhileAboveHalfLifeFromGear: boolean
  cannotRecoverLifeWhileAboveHalfLifeFromGear: boolean
  armourHasNoEffectWhileBelowHalfLifeFromGear: boolean
  sacrificeCurrentManaPercentPerSecondFromGear: number

  poisonYouInflictReflectedToYouFromGear: boolean
  elementalAilmentsYouInflictReflectedToYouFromGear: boolean
  moreSpeedPerPoisonOnYouPercentFromGear: number
  moreSpeedPerShockEffectOnYouPerPctFromGear: number
  lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear: number
  unaffectedByChillFromGear: boolean

  manaRecoveredOnKillPercentFromGear: number
  moreAttackAndCastSpeedPer50CurrentManaPctFromGear: number
  moreAccuracyRatingPer0_1sAttackTimePctFromGear: number

  poisonDamageTakenLessPercentFromGear: number
  flatLifeRegenPerSecondPerCharacterLevelFromGear: number

  loseLifePerSecondFromGear: number
  takeChaosDamagePerSecondFromGear: number

  pctDexIntConvertedToStrFromGear: number
  convertEvasionToArmourFromGear: boolean
  energyShieldCannotBeReducedBelowMaximumFromGear: boolean
  countsAsDualWieldingFromGear: boolean

  armourEqualToPercentOfMaxManaFromGear: number
  lifeLeechAppliesToEnergyShieldFromGear: boolean
  spellHitDamageLeechedAsEnergyShieldPercentFromGear: number
  excessLifeLeechRecoveryToEnergyShieldFromGear: boolean
  pctIncreasedRecoveryFromAllSourcesFromGear: number
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
  itemRarityPercent: number
  itemQuantityPercent: number
  avgHit: number
  avgEffectiveDamage: number
  dps: number
  /** Player attack actions roll this many strike damages (demo combat); 1 for spell casts. */
  strikesPerAttack: number

  // Recovery
  manaRegenPerSecond: number
  manaRegenAppliesToEnergyShieldPercent: number
  manaCostPaidWithEnergyShield: boolean
  noMana: boolean
  cannotEvadeWhileAboveHalfLife: boolean
  cannotRecoverLifeWhileAboveHalfLife: boolean
  armourHasNoEffectWhileBelowHalfLife: boolean
  sacrificeCurrentManaPercentPerSecond: number
  poisonYouInflictReflectedToYou: boolean
  elementalAilmentsYouInflictReflectedToYou: boolean
  moreSpeedPerPoisonOnYouPercent: number
  moreSpeedPerShockEffectOnYouPerPct: number
  lifeRegenPercentOfMaxPerSecondWhileIgnited: number
  unaffectedByChill: boolean
  manaRecoveredOnKillPercent: number
  moreAttackAndCastSpeedPer50CurrentManaPct: number
  moreAccuracyRatingPer0_1sAttackTimePct: number
  poisonDamageTakenLessPercent: number
  flatLifeRegenPerSecond: number
  loseLifePerSecond: number
  takeChaosDamagePerSecond: number
  avoidAilmentsChance: number
  avoidElementalAilmentsChance: number
  enemyLoseMaxLifeAtStartPercent: number
  executeEnemiesBelowLifePercent: number
  executeEnemiesBelowLifePercentEqualToChillEffect: boolean
  periodicShockPct: number
  periodicShockEverySec: number
  periodicLifeRegenPct: number
  periodicLifeRegenEverySec: number
  periodicLifeRegenDurationSec: number
  armourNoEffectVsPhysical: boolean
  chaosDamageCanIgnite: boolean
  lightningDamageCanPoison: boolean
  chaosDamageCanInflictAllElementalAilments: boolean
  allElementalDamageTypesCanChill: boolean
  allElementalDamageTypesCanIgnite: boolean
  allElementalDamageTypesCanShock: boolean
  critsAlwaysInflictPoison: boolean
  critsAlwaysInflictElementalAilments: boolean
  ignoreMaxShockEffect: boolean
  fixedShockEffectPercent: number
  randomIgniteDurationLessPercent: number
  randomIgniteDurationMorePercent: number
  chillYouInflictInfiniteDuration: boolean
  takePhysicalDamagePercentOfMaxLifeWhenYouAttack: number
  pctDexIntConvertedToStr: number
  convertEvasionToArmour: boolean
  energyShieldCannotBeReducedBelowMaximum: boolean
  countsAsDualWielding: boolean
  armourEqualToPercentOfMaxMana: number
  lifeLeechAppliesToEnergyShield: boolean
  spellHitDamageLeechedAsEnergyShieldPercent: number
  excessLifeLeechRecoveryToEnergyShield: boolean
  recoveryRateMult: number
  lifeRecoveryPct: number
  esRecoveryPct: number

  // Ailment bonuses (base chances from upgrades + active ability lines)
  bleedChance: number
  poisonChance: number
  elementalAilmentChance: number
  ailmentDurationBonus: number // % increased duration (additive with upgrades; “reduced duration” is negative here)
  /**
   * Duration multiplier for bleed, poison, shock, chill (and the base factor for ignite before ignite-only less).
   * (1 + ailmentDurationBonus/100) × ailmentDurationLessMultFromGear.
   */
  ailmentDurationMultiplier: number
  /** Ignite DoT duration: {@link ailmentDurationMultiplier} × igniteDurationLessMultFromGear. */
  igniteAilmentDurationMultiplier: number
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
  /** % reduced physical damage taken (from gear + Arcanist bonus). */
  reducedPhysicalDamageTaken: number
  /** % increased shock/chill effect you inflict (demo). */
  nonDamagingAilmentEffectIncreasedPercent: number
  maxShockEffect: number
  maxChillEffect: number
  increasedShockEffect: number
  shockDurationMultiplier: number
  enemiesDealLessDamagePercent: number
  enemiesMoreSpeedMultiplier: number
  enemyResistancesEqualToYours: boolean
  enemiesUnaffectedByChill: boolean
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
  /** Spell hit math (non-null when a spell ability is selected). */
  spellDamageComputationBreakdown: SpellDamageComputationBreakdown | null

  /** Source lines for every computed stat (planner UI breakdown). */
  statBreakdowns: StatBreakdowns
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
    flatSpellDamageMin: 0,
    flatSpellDamageMax: 0,
    flatSpellFireMin: 0,
    flatSpellFireMax: 0,
    flatSpellColdMin: 0,
    flatSpellColdMax: 0,
    flatSpellLightningMin: 0,
    flatSpellLightningMax: 0,
    flatSpellChaosMin: 0,
    flatSpellChaosMax: 0,
    critChanceBonus: 0,
    strBonus: 0,
    dexBonus: 0,
    intBonus: 0,
    flatAccuracy: 0,
    armourPer10IntFromGear: 0,
    avoidAilmentsChanceFromGear: 0,
    avoidElementalAilmentsChanceFromGear: 0,
    enemyLoseMaxLifeAtStartPercentFromGear: 0,
    executeEnemiesBelowLifePercentFromGear: 0,
    executeEnemiesBelowLifePercentEqualToChillEffectFromGear: false,
    periodicShockPctFromGear: 0,
    periodicShockEverySecFromGear: 0,
    periodicLifeRegenPctFromGear: 0,
    periodicLifeRegenEverySecFromGear: 0,
    periodicLifeRegenDurationSecFromGear: 0,
    armourNoEffectVsPhysicalFromGear: false,
    chaosDamageCanIgniteFromGear: false,
    lightningDamageCanPoisonFromGear: false,
    chaosDamageCanInflictAllElementalAilmentsFromGear: false,
    allElementalDamageTypesCanChillFromGear: false,
    allElementalDamageTypesCanIgniteFromGear: false,
    allElementalDamageTypesCanShockFromGear: false,
    critsAlwaysInflictPoisonFromGear: false,
    critsAlwaysInflictElementalAilmentsFromGear: false,
    ignoreMaxShockEffectFromGear: false,
    fixedShockEffectPercentFromGear: 0,
    randomIgniteDurationLessPercentFromGear: 0,
    randomIgniteDurationMorePercentFromGear: 0,
    chillYouInflictInfiniteDurationFromGear: false,
    takePhysicalDamagePercentOfMaxLifeWhenYouAttackFromGear: 0,
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
    ailmentDurationLessMultFromGear: 1,
    igniteDurationLessMultFromGear: 1,

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
    increasedItemRarityFromGear: 0,
    increasedItemQuantityFromGear: 0,
    critIncPctPerItemRarityPctFromGear: 0,
    critMultiPctPerItemQuantityPctFromGear: 0,
    critMultiPctPer20AccuracyFromGear: 0,
    additionalAbilityLevelsAllFromGear: 0,
    additionalAbilityLevelsColdFromGear: 0,
    maxShockEffectBonusFromGear: 0,
    maxChillEffectBonusFromGear: 0,
    increasedShockEffectFromGear: 0,
    shockDurationMoreMultFromGear: 1,
    enemiesDealLessDamageFromGear: 0,
    enemiesHaveMoreSpeedFromGear: 0,
    enemyResistancesEqualToYoursFromGear: false,
    enemiesUnaffectedByChillFromGear: false,
    fixedCritChancePercentFromGear: 0,
    blockChanceMultiplierFromGear: 1,
    cannotEvadeFromGear: false,
    cannotDodgeFromGear: false,
    manaCostPaidWithEnergyShieldFromGear: false,
    noManaFromGear: false,
    manaRegenToEnergyShieldPercentFromGear: 0,
    cannotEvadeWhileAboveHalfLifeFromGear: false,
    cannotRecoverLifeWhileAboveHalfLifeFromGear: false,
    armourHasNoEffectWhileBelowHalfLifeFromGear: false,
    sacrificeCurrentManaPercentPerSecondFromGear: 0,
    poisonYouInflictReflectedToYouFromGear: false,
    elementalAilmentsYouInflictReflectedToYouFromGear: false,
    moreSpeedPerPoisonOnYouPercentFromGear: 0,
    moreSpeedPerShockEffectOnYouPerPctFromGear: 0,
    lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear: 0,
    unaffectedByChillFromGear: false,
    manaRecoveredOnKillPercentFromGear: 0,
    moreAttackAndCastSpeedPer50CurrentManaPctFromGear: 0,
    moreAccuracyRatingPer0_1sAttackTimePctFromGear: 0,
    poisonDamageTakenLessPercentFromGear: 0,
    flatLifeRegenPerSecondPerCharacterLevelFromGear: 0,
    loseLifePerSecondFromGear: 0,
    takeChaosDamagePerSecondFromGear: 0,
    pctDexIntConvertedToStrFromGear: 0,
    convertEvasionToArmourFromGear: false,
    energyShieldCannotBeReducedBelowMaximumFromGear: false,
    countsAsDualWieldingFromGear: false,
    armourEqualToPercentOfMaxManaFromGear: 0,
    lifeLeechAppliesToEnergyShieldFromGear: false,
    spellHitDamageLeechedAsEnergyShieldPercentFromGear: 0,
    excessLifeLeechRecoveryToEnergyShieldFromGear: false,
    pctIncreasedRecoveryFromAllSourcesFromGear: 0,
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
  if (p.flatSpellDamageMin !== undefined) addNum('flatSpellDamageMin', p.flatSpellDamageMin)
  if (p.flatSpellDamageMax !== undefined) addNum('flatSpellDamageMax', p.flatSpellDamageMax)
  if (p.flatSpellFireMin !== undefined) addNum('flatSpellFireMin', p.flatSpellFireMin)
  if (p.flatSpellFireMax !== undefined) addNum('flatSpellFireMax', p.flatSpellFireMax)
  if (p.flatSpellColdMin !== undefined) addNum('flatSpellColdMin', p.flatSpellColdMin)
  if (p.flatSpellColdMax !== undefined) addNum('flatSpellColdMax', p.flatSpellColdMax)
  if (p.flatSpellLightningMin !== undefined) addNum('flatSpellLightningMin', p.flatSpellLightningMin)
  if (p.flatSpellLightningMax !== undefined) addNum('flatSpellLightningMax', p.flatSpellLightningMax)
  if (p.flatSpellChaosMin !== undefined) addNum('flatSpellChaosMin', p.flatSpellChaosMin)
  if (p.flatSpellChaosMax !== undefined) addNum('flatSpellChaosMax', p.flatSpellChaosMax)
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
  if (p.armourPer10IntFromGear !== undefined) addNum('armourPer10IntFromGear', p.armourPer10IntFromGear)
  if (p.avoidAilmentsChanceFromGear !== undefined) addNum('avoidAilmentsChanceFromGear', p.avoidAilmentsChanceFromGear)
  if (p.avoidElementalAilmentsChanceFromGear !== undefined) {
    addNum('avoidElementalAilmentsChanceFromGear', p.avoidElementalAilmentsChanceFromGear)
  }
  if (p.enemyLoseMaxLifeAtStartPercentFromGear !== undefined) {
    addNum('enemyLoseMaxLifeAtStartPercentFromGear', p.enemyLoseMaxLifeAtStartPercentFromGear)
  }
  if (p.executeEnemiesBelowLifePercentFromGear !== undefined) {
    addNum('executeEnemiesBelowLifePercentFromGear', p.executeEnemiesBelowLifePercentFromGear)
  }
  if (p.executeEnemiesBelowLifePercentEqualToChillEffectFromGear) {
    eq.executeEnemiesBelowLifePercentEqualToChillEffectFromGear = true
  }
  if (p.periodicShockPctFromGear !== undefined) addNum('periodicShockPctFromGear', p.periodicShockPctFromGear)
  if (p.periodicShockEverySecFromGear !== undefined) addNum('periodicShockEverySecFromGear', p.periodicShockEverySecFromGear)
  if (p.periodicLifeRegenPctFromGear !== undefined) addNum('periodicLifeRegenPctFromGear', p.periodicLifeRegenPctFromGear)
  if (p.periodicLifeRegenEverySecFromGear !== undefined) addNum('periodicLifeRegenEverySecFromGear', p.periodicLifeRegenEverySecFromGear)
  if (p.periodicLifeRegenDurationSecFromGear !== undefined) {
    addNum('periodicLifeRegenDurationSecFromGear', p.periodicLifeRegenDurationSecFromGear)
  }
  if (p.armourNoEffectVsPhysicalFromGear) eq.armourNoEffectVsPhysicalFromGear = true
  if (p.chaosDamageCanIgniteFromGear) eq.chaosDamageCanIgniteFromGear = true
  if (p.lightningDamageCanPoisonFromGear) eq.lightningDamageCanPoisonFromGear = true
  if (p.chaosDamageCanInflictAllElementalAilmentsFromGear) eq.chaosDamageCanInflictAllElementalAilmentsFromGear = true
  if (p.allElementalDamageTypesCanChillFromGear) eq.allElementalDamageTypesCanChillFromGear = true
  if (p.allElementalDamageTypesCanIgniteFromGear) eq.allElementalDamageTypesCanIgniteFromGear = true
  if (p.allElementalDamageTypesCanShockFromGear) eq.allElementalDamageTypesCanShockFromGear = true
  if (p.critsAlwaysInflictPoisonFromGear) eq.critsAlwaysInflictPoisonFromGear = true
  if (p.critsAlwaysInflictElementalAilmentsFromGear) eq.critsAlwaysInflictElementalAilmentsFromGear = true
  if (p.ignoreMaxShockEffectFromGear) eq.ignoreMaxShockEffectFromGear = true
  if (p.fixedShockEffectPercentFromGear !== undefined) addNum('fixedShockEffectPercentFromGear', p.fixedShockEffectPercentFromGear)
  if (p.randomIgniteDurationLessPercentFromGear !== undefined) {
    addNum('randomIgniteDurationLessPercentFromGear', p.randomIgniteDurationLessPercentFromGear)
  }
  if (p.randomIgniteDurationMorePercentFromGear !== undefined) {
    addNum('randomIgniteDurationMorePercentFromGear', p.randomIgniteDurationMorePercentFromGear)
  }
  if (p.chillYouInflictInfiniteDurationFromGear) eq.chillYouInflictInfiniteDurationFromGear = true
  if (p.takePhysicalDamagePercentOfMaxLifeWhenYouAttackFromGear !== undefined) {
    addNum('takePhysicalDamagePercentOfMaxLifeWhenYouAttackFromGear', p.takePhysicalDamagePercentOfMaxLifeWhenYouAttackFromGear)
  }
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
  if (p.ailmentDurationLessMultFromGear !== undefined) {
    eq.ailmentDurationLessMultFromGear *= p.ailmentDurationLessMultFromGear
  }
  if (p.igniteDurationLessMultFromGear !== undefined) {
    eq.igniteDurationLessMultFromGear *= p.igniteDurationLessMultFromGear
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
  if (p.increasedItemRarityFromGear !== undefined) addNum('increasedItemRarityFromGear', p.increasedItemRarityFromGear)
  if (p.increasedItemQuantityFromGear !== undefined) addNum('increasedItemQuantityFromGear', p.increasedItemQuantityFromGear)
  if (p.critIncPctPerItemRarityPctFromGear !== undefined) {
    addNum('critIncPctPerItemRarityPctFromGear', p.critIncPctPerItemRarityPctFromGear)
  }
  if (p.critMultiPctPerItemQuantityPctFromGear !== undefined) {
    addNum('critMultiPctPerItemQuantityPctFromGear', p.critMultiPctPerItemQuantityPctFromGear)
  }
  if (p.critMultiPctPer20AccuracyFromGear !== undefined) {
    addNum('critMultiPctPer20AccuracyFromGear', p.critMultiPctPer20AccuracyFromGear)
  }
  if (p.additionalAbilityLevelsAllFromGear !== undefined) {
    addNum('additionalAbilityLevelsAllFromGear', p.additionalAbilityLevelsAllFromGear)
  }
  if (p.additionalAbilityLevelsColdFromGear !== undefined) {
    addNum('additionalAbilityLevelsColdFromGear', p.additionalAbilityLevelsColdFromGear)
  }
  if (p.maxShockEffectBonusFromGear !== undefined) addNum('maxShockEffectBonusFromGear', p.maxShockEffectBonusFromGear)
  if (p.maxChillEffectBonusFromGear !== undefined) addNum('maxChillEffectBonusFromGear', p.maxChillEffectBonusFromGear)
  if (p.increasedShockEffectFromGear !== undefined) addNum('increasedShockEffectFromGear', p.increasedShockEffectFromGear)
  if (p.shockDurationMoreMultFromGear !== undefined) addNum('shockDurationMoreMultFromGear', p.shockDurationMoreMultFromGear)
  if (p.enemiesDealLessDamageFromGear !== undefined) addNum('enemiesDealLessDamageFromGear', p.enemiesDealLessDamageFromGear)
  if (p.enemiesHaveMoreSpeedFromGear !== undefined) addNum('enemiesHaveMoreSpeedFromGear', p.enemiesHaveMoreSpeedFromGear)
  if (p.enemyResistancesEqualToYoursFromGear) eq.enemyResistancesEqualToYoursFromGear = true
  if (p.enemiesUnaffectedByChillFromGear) eq.enemiesUnaffectedByChillFromGear = true
  if (p.fixedCritChancePercentFromGear !== undefined) addNum('fixedCritChancePercentFromGear', p.fixedCritChancePercentFromGear)
  if (p.blockChanceMultiplierFromGear !== undefined) addNum('blockChanceMultiplierFromGear', p.blockChanceMultiplierFromGear)
  if (p.cannotEvadeFromGear) eq.cannotEvadeFromGear = true
  if (p.cannotDodgeFromGear) eq.cannotDodgeFromGear = true
  if (p.manaCostPaidWithEnergyShieldFromGear) eq.manaCostPaidWithEnergyShieldFromGear = true
  if (p.noManaFromGear) eq.noManaFromGear = true
  if (p.manaRegenToEnergyShieldPercentFromGear !== undefined) {
    addNum('manaRegenToEnergyShieldPercentFromGear', p.manaRegenToEnergyShieldPercentFromGear)
  }
  if (p.cannotEvadeWhileAboveHalfLifeFromGear) eq.cannotEvadeWhileAboveHalfLifeFromGear = true
  if (p.cannotRecoverLifeWhileAboveHalfLifeFromGear) eq.cannotRecoverLifeWhileAboveHalfLifeFromGear = true
  if (p.armourHasNoEffectWhileBelowHalfLifeFromGear) eq.armourHasNoEffectWhileBelowHalfLifeFromGear = true
  if (p.sacrificeCurrentManaPercentPerSecondFromGear !== undefined) {
    addNum('sacrificeCurrentManaPercentPerSecondFromGear', p.sacrificeCurrentManaPercentPerSecondFromGear)
  }
  if (p.poisonYouInflictReflectedToYouFromGear) eq.poisonYouInflictReflectedToYouFromGear = true
  if (p.elementalAilmentsYouInflictReflectedToYouFromGear) eq.elementalAilmentsYouInflictReflectedToYouFromGear = true
  if (p.moreSpeedPerPoisonOnYouPercentFromGear !== undefined) addNum('moreSpeedPerPoisonOnYouPercentFromGear', p.moreSpeedPerPoisonOnYouPercentFromGear)
  if (p.moreSpeedPerShockEffectOnYouPerPctFromGear !== undefined) addNum('moreSpeedPerShockEffectOnYouPerPctFromGear', p.moreSpeedPerShockEffectOnYouPerPctFromGear)
  if (p.lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear !== undefined) {
    addNum('lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear', p.lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear)
  }
  if (p.unaffectedByChillFromGear) eq.unaffectedByChillFromGear = true
  if (p.manaRecoveredOnKillPercentFromGear !== undefined) addNum('manaRecoveredOnKillPercentFromGear', p.manaRecoveredOnKillPercentFromGear)
  if (p.moreAttackAndCastSpeedPer50CurrentManaPctFromGear !== undefined) {
    addNum('moreAttackAndCastSpeedPer50CurrentManaPctFromGear', p.moreAttackAndCastSpeedPer50CurrentManaPctFromGear)
  }
  if (p.moreAccuracyRatingPer0_1sAttackTimePctFromGear !== undefined) {
    addNum('moreAccuracyRatingPer0_1sAttackTimePctFromGear', p.moreAccuracyRatingPer0_1sAttackTimePctFromGear)
  }
  if (p.poisonDamageTakenLessPercentFromGear !== undefined) {
    addNum('poisonDamageTakenLessPercentFromGear', p.poisonDamageTakenLessPercentFromGear)
  }
  if (p.flatLifeRegenPerSecondPerCharacterLevelFromGear !== undefined) {
    addNum('flatLifeRegenPerSecondPerCharacterLevelFromGear', p.flatLifeRegenPerSecondPerCharacterLevelFromGear)
  }
  if (p.loseLifePerSecondFromGear !== undefined) addNum('loseLifePerSecondFromGear', p.loseLifePerSecondFromGear)
  if (p.takeChaosDamagePerSecondFromGear !== undefined) addNum('takeChaosDamagePerSecondFromGear', p.takeChaosDamagePerSecondFromGear)
  if (p.pctDexIntConvertedToStrFromGear !== undefined) addNum('pctDexIntConvertedToStrFromGear', p.pctDexIntConvertedToStrFromGear)
  if (p.convertEvasionToArmourFromGear) eq.convertEvasionToArmourFromGear = true
  if (p.energyShieldCannotBeReducedBelowMaximumFromGear) eq.energyShieldCannotBeReducedBelowMaximumFromGear = true
  if (p.countsAsDualWieldingFromGear) eq.countsAsDualWieldingFromGear = true
  if (p.armourEqualToPercentOfMaxManaFromGear !== undefined) addNum('armourEqualToPercentOfMaxManaFromGear', p.armourEqualToPercentOfMaxManaFromGear)
  if (p.lifeLeechAppliesToEnergyShieldFromGear) eq.lifeLeechAppliesToEnergyShieldFromGear = true
  if (p.spellHitDamageLeechedAsEnergyShieldPercentFromGear !== undefined) {
    addNum('spellHitDamageLeechedAsEnergyShieldPercentFromGear', p.spellHitDamageLeechedAsEnergyShieldPercentFromGear)
  }
  if (p.excessLifeLeechRecoveryToEnergyShieldFromGear) eq.excessLifeLeechRecoveryToEnergyShieldFromGear = true
  if (p.pctIncreasedRecoveryFromAllSourcesFromGear !== undefined) {
    addNum('pctIncreasedRecoveryFromAllSourcesFromGear', p.pctIncreasedRecoveryFromAllSourcesFromGear)
  }
}

/**
 * Uniques with "While you have at least N strength/dexterity/intelligence …" need final attributes;
 * merge their bonuses into `eq` after Str/Dex/Int are rounded.
 */
function mergeAttributeThresholdConditionalUniques(
  eq: EquipmentModifiers,
  equipped: Record<string, EquippedEntry> | undefined,
  str: number,
  dex: number,
  int_: number
): void {
  if (!equipped) return
  for (const slot of EQUIPMENT_SLOTS) {
    const ent = equipped[slot]
    if (!ent || ent.itemId === 'none' || !isUniqueItemId(ent.itemId)) continue
    const def = EOC_UNIQUE_BY_ID[ent.itemId]
    if (!def) continue
    const { innateText, lineTexts } = resolveUniqueMods(def, ent.rolls, ent.enhancement ?? 0)
    const texts = [innateText, ...lineTexts].filter((t) => t.length > 0)
    const patch = attributeThresholdConditionalPatchFromTexts(texts, str, dex, int_)
    mergeUniqueGearPatch(eq, patch)
  }
}

/** Sum static items and rolled uniques for all worn slots. */
export function aggregateEquippedToEquipmentModifiers(
  slots: string[],
  getEquipped: (slot: string) => { itemId: string; rolls?: number[]; enhancement?: number; craftedPrefixes?: import('./eocModifiers').AppliedModifier[]; craftedSuffixes?: import('./eocModifiers').AppliedModifier[] } | null | undefined
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

    if (isCraftedEquipItemId(itemId)) {
      const def = EOC_BASE_EQUIPMENT_BY_ID[itemId]
      if (!def) continue
      const prefixes = entry?.craftedPrefixes ?? []
      const suffixes = entry?.craftedSuffixes ?? []
      const texts = appliedModifiersToStatTexts(prefixes, suffixes)
      const isWeapon = slot === 'Weapon'
      const patch = equipmentModifiersFromUniqueTexts(texts, { isWeapon })
      applyExtraCraftedModPatterns(patch, texts)

      if (isWeapon) {
        const baseDmgMin = def.baseDamageMin ?? 0
        const baseDmgMax = def.baseDamageMax ?? 0
        if (baseDmgMin > 0 || baseDmgMax > 0) {
          const localPhysPct = patch.localIncreasedPhysDamagePct ?? 0
          eq.flatDamageMin += baseDmgMin * (1 + localPhysPct / 100)
          eq.flatDamageMax += baseDmgMax * (1 + localPhysPct / 100)
        }
        if (def.baseAttackSpeed != null) {
          const localApsPct = patch.localIncreasedApsPct ?? 0
          eq.weaponEffectiveAps = def.baseAttackSpeed * (1 + localApsPct / 100)
        }
        if (def.baseCritChance != null) {
          eq.weaponBaseCritChance = def.baseCritChance
        }
      } else {
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
  const eq: EquipmentModifiers = { ...config.equipmentModifiers }
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
  // 5b. Attribute conversion from gear
  // -------------------------------------------------------------------------
  const pctDexIntConvertedToStr = Math.max(0, Math.min(100, eq.pctDexIntConvertedToStrFromGear))
  if (pctDexIntConvertedToStr > 0) {
    const takeDex = Math.round(dex * (pctDexIntConvertedToStr / 100))
    const takeInt = Math.round(int_ * (pctDexIntConvertedToStr / 100))
    dex = Math.max(0, dex - takeDex)
    int_ = Math.max(0, int_ - takeInt)
    str += takeDex + takeInt
  }

  mergeAttributeThresholdConditionalUniques(eq, config.equipped, str, dex, int_)

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
  const maxMana = eq.noManaFromGear
    ? 0
    : Math.round(manaFlat * (1 + totalIncreasedMana / 100) * eq.manaMoreMultFromGear)

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
  const armourFromMaxMana = Math.round(maxMana * (eq.armourEqualToPercentOfMaxManaFromGear / 100))
  const armourFromInt = Math.round((int_ / 10) * eq.armourPer10IntFromGear)
  const armourFlatBase = BASE_GAME_STATS.baseArmour + eq.flatArmour + armourFromMaxMana + armourFromInt
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
  if (eq.cannotEvadeFromGear) evasionRating = 0
  if (eq.convertEvasionToArmourFromGear && evasionRating > 0) {
    armour += evasionRating
    evasionRating = 0
  }

  // -------------------------------------------------------------------------
  // 12. Block and dodge
  // -------------------------------------------------------------------------
  // Dragoon class bonus: +25% to maximum block chance (75 → 100)
  const maxBlockChance = (bonus('dragoon') ? 100 : 75) + eq.maxBlockChanceBonusFromGear
  let blockChance = Math.min(maxBlockChance, u('increasedChanceToBlock') + eq.blockChanceFromGear)
  if (eq.blockChanceMultiplierFromGear !== 1) {
    blockChance = Math.min(maxBlockChance, blockChance * eq.blockChanceMultiplierFromGear)
  }
  const maxDodgeCap = 75 + eq.maxDodgeChanceBonusFromGear
  let dodgeChance = Math.min(
    maxDodgeCap,
    u('increasedChanceToDodge')
      + eq.dodgeChanceFromGear
      + eq.dodgeChancePer10DexFromGear * (dex / 10)
  )
  if (eq.cannotDodgeFromGear) dodgeChance = 0

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
  let accuracy = Math.round(
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
    + eq.critIncPctPerItemRarityPctFromGear * eq.increasedItemRarityFromGear
  const attackCritFlatBase =
    baseCritChance + critFromAssassin + eq.attackBaseCritChanceBonusFromGear + eq.critChanceBonus
  let critChance = Math.min(100, attackCritFlatBase * (1 + critFromUpgrades / 100))
  if (eq.fixedCritChancePercentFromGear > 0) {
    critChance = Math.max(0, Math.min(100, eq.fixedCritChancePercentFromGear))
  }

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
    eq.increasedCriticalDamageMultiplierFromGear
    + attunementIncreasedCritMultiplierPct
    + eq.critMultiPctPerItemQuantityPctFromGear * eq.increasedItemQuantityFromGear
    + eq.critMultiPctPer20AccuracyFromGear * (accuracy / 20)
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
  const manaRegenPerSecondRaw =
    manaRegenFlatPerSecond * (1 + totalIncreasedManaRegen / 100)

  const manaRegenAppliesToEnergyShieldPercent = Math.max(
    0,
    Math.min(100, eq.manaRegenToEnergyShieldPercentFromGear)
  )

  const manaRegenPerSecond =
    eq.noManaFromGear ? 0 : manaRegenPerSecondRaw

  // -------------------------------------------------------------------------
  // 19b. Attack-time scaled accuracy (depends on final APS)
  // -------------------------------------------------------------------------
  const moreAccPer01s = eq.moreAccuracyRatingPer0_1sAttackTimePctFromGear
  if (moreAccPer01s > 0 && aps > 0) {
    const attackTimeSec = 1 / aps
    const accMoreMult = 1 + (moreAccPer01s / 100) * (attackTimeSec / 0.1)
    accuracy = Math.round(accuracy * Math.max(0.05, accMoreMult))
  }

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
  let spellDamageComputationBreakdown: SpellDamageComputationBreakdown | null = null
  let spellBaseCastTimeSeconds: number | null = null
  let spellAttunementCastSpeedIncPct: number | null = null
  let spellBaseCritChancePct: number | null = null
  let spellCritFlatBasePct: number | null = null
  let spellCritIncreasedTotalPct: number | null = null

  const sel = config.ability

  let attunementStrikesIncPct = 0
  let attunementFlatDoubleChance = 0
  let attunementDefencesPct = 0

  if (sel?.abilityId) {
    const def = EOC_ABILITY_BY_ID[sel.abilityId]
    const baseLevel = Math.min(20, Math.max(0, Math.floor(sel.abilityLevel)))
    const isColdAbility = def?.spellHit?.element?.toLowerCase?.() === 'cold'
    const level =
      baseLevel
      + eq.additionalAbilityLevelsAllFromGear
      + (isColdAbility ? eq.additionalAbilityLevelsColdFromGear : 0)
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
          const spellCritIncreased =
            u('increasedCriticalHitChance')
            + u('increasedSpellCriticalHitChance')
            + eq.pctIncreasedCriticalHitChanceFromGear
            + critFromDex
            + spellAttCritInc
          critChance = Math.min(100, spellCritFlatBase * (1 + spellCritIncreased / 100))
          spellBaseCritChancePct = spellBaseCrit
          spellCritFlatBasePct = spellCritFlatBase
          spellCritIncreasedTotalPct = spellCritIncreased
          const spellRows: HitDamageTypeRow[] = [];
          const baseType = spellElementToHitDamageType(scaledHit.element);

          const spellFlatRanges = {
            physical: localFlatDamageDisplayRange(eq.flatSpellDamageMin, eq.flatSpellDamageMax),
            fire: localFlatDamageDisplayRange(eq.flatSpellFireMin, eq.flatSpellFireMax),
            cold: localFlatDamageDisplayRange(eq.flatSpellColdMin, eq.flatSpellColdMax),
            lightning: localFlatDamageDisplayRange(eq.flatSpellLightningMin, eq.flatSpellLightningMax),
            chaos: localFlatDamageDisplayRange(eq.flatSpellChaosMin, eq.flatSpellChaosMax),
          };

          // Base spell hit
          const baseAdded =
            baseType === "physical" ? spellFlatRanges.physical
              : baseType === "fire" ? spellFlatRanges.fire
              : baseType === "cold" ? spellFlatRanges.cold
              : baseType === "lightning" ? spellFlatRanges.lightning
              : /* chaos */ spellFlatRanges.chaos;
          const baseMin = scaledHit.min + baseAdded.min;
          const baseMax = scaledHit.max + baseAdded.max;
          spellRows.push({
            type: baseType,
            min: roundDamageNearest(baseMin * added * (1 + incFrac) * enemyDamageTakenIncreasedMult),
            max: roundDamageNearest(baseMax * added * (1 + incFrac) * enemyDamageTakenIncreasedMult),
          });

          // Additional spell-only flat types (non-base elements)
          for (const t of ["physical", "fire", "cold", "lightning", "chaos"] as const) {
            if (t === baseType) continue;
            const r = spellFlatRanges[t];
            if (!r || (r.min === 0 && r.max === 0)) continue;
            spellRows.push({
              type: t,
              min: roundDamageNearest(r.min * added * (1 + incFrac) * enemyDamageTakenIncreasedMult),
              max: roundDamageNearest(r.max * added * (1 + incFrac) * enemyDamageTakenIncreasedMult),
            });
          }

          hitDamageByType = buildHitDamageByType(spellRows);
          hitSum = sumHitDamageRange(hitDamageByType)
          hitDamageMin = hitSum.min
          hitDamageMax = hitSum.max
          aps = castsPerSec
          manaCostPerAttack = abilityManaCostAtLevel(baseAbilityMana, startLvl, level)
          avgHit = (hitDamageMin + hitDamageMax) / 2
          avgEffectiveDamage = avgHit * (1 + (critChance / 100) * (critMultiplier - 1))
          dps = avgEffectiveDamage * aps
          // Spell breakdown (planner)
          const addedFromGearByType = [
            { type: 'physical' as const, ...localFlatDamageDisplayRange(eq.flatSpellDamageMin, eq.flatSpellDamageMax) },
            { type: 'fire' as const, ...localFlatDamageDisplayRange(eq.flatSpellFireMin, eq.flatSpellFireMax) },
            { type: 'cold' as const, ...localFlatDamageDisplayRange(eq.flatSpellColdMin, eq.flatSpellColdMax) },
            { type: 'lightning' as const, ...localFlatDamageDisplayRange(eq.flatSpellLightningMin, eq.flatSpellLightningMax) },
            { type: 'chaos' as const, ...localFlatDamageDisplayRange(eq.flatSpellChaosMin, eq.flatSpellChaosMax) },
          ].filter((r) => r.min !== 0 || r.max !== 0)

          const castIncLines: StatContributionLine[] = []
          // These mirror the same terms used in castSpeedInc.
          if (u('increasedCastSpeed') !== 0) castIncLines.push({ label: 'Upgrades: increased cast speed', value: u('increasedCastSpeed') })
          if (u('increasedAttackSpeedAndCastSpeed') !== 0) castIncLines.push({ label: 'Upgrades: increased attack & cast speed', value: u('increasedAttackSpeedAndCastSpeed') })
          if (spellAttCast !== 0) castIncLines.push({ label: 'Ability attunement: increased cast speed', value: spellAttCast })
          if (eq.pctIncreasedCastSpeedFromGear !== 0) castIncLines.push({ label: 'Gear: increased cast speed', value: eq.pctIncreasedCastSpeedFromGear })
          if (eq.castSpeedIncPctPer10DexFromGear !== 0) castIncLines.push({ label: 'Gear: increased cast speed per 10 dexterity', value: eq.castSpeedIncPctPer10DexFromGear * (dex / 10) })

          const baseCast = def.castTimeSeconds != null && def.castTimeSeconds > 0 ? def.castTimeSeconds : 0.5
          spellBaseCastTimeSeconds = baseCast
          spellAttunementCastSpeedIncPct = spellAttCast
          spellDamageComputationBreakdown = {
            abilityId: def.id,
            abilityName: def.name,
            level,
            element: scaledHit.element,
            baseHit: { min: scaledHit.min, max: scaledHit.max },
            addedFromGearByType,
            addedDamageMultiplier: added,
            increasedDamagePercent: incFrac * 100,
            enemiesTakeIncreasedDamage: {
              gearPercent: eq.enemyDamageTakenIncreasedFromGear,
              tricksterPercent: enemyDamageTakenIncreasedFromTricksterPct,
              totalPercent: enemyDamageTakenIncreasedTotalPct,
              multiplier: enemyDamageTakenIncreasedMult,
            },
            afterIncreasedByType: hitDamageByType,
            avgHit,
            critical: {
              critChance,
              critMultiplier,
              effectiveDamageMultiplier: 1 + (critChance / 100) * (critMultiplier - 1),
            },
            cast: {
              baseCastTimeSeconds: baseCast,
              increasedCastSpeedPercent: castIncLines,
              castSpeedLessMultipliers: [
                { label: 'Gear: cast speed less / more multiplier', factor: eq.castSpeedLessMultFromGear },
              ],
              effectiveCastTimeSeconds: effectiveCastTime,
              castsPerSecond: castsPerSec,
            },
            dps: {
              avgEffectiveDamage,
              value: dps,
              strikesPerCast: 1,
              notes: [
                enemyDamageTakenIncreasedTotalPct !== 0
                  ? `Enemies take +${enemyDamageTakenIncreasedTotalPct.toFixed(1)}% increased damage (gear + Trickster): ×${enemyDamageTakenIncreasedMult.toFixed(4)} on spell hit (included).`
                  : 'No “enemies take increased damage” from gear or Trickster.',
              ],
            },
          }
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
  const ailmentDurationMultiplier =
    Math.max(0.05, 1 + ailmentDurationBonus / 100) * eq.ailmentDurationLessMultFromGear
  const igniteAilmentDurationMultiplier =
    ailmentDurationMultiplier * eq.igniteDurationLessMultFromGear
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
  const lifeLeechFromHitDamagePercent =
    eq.lifeLeechAppliesToEnergyShieldFromGear ? 0 : eq.lifeLeechFromHitDamagePercentFromGear
  const lifeLeechFromPhysicalHitPercent = eq.lifeLeechFromPhysicalHitPercentFromGear
  const hitsCannotBeEvaded = eq.hitsCannotBeEvadedFromGear
  const blockDamageTakenMult = Math.min(
    0.95,
    Math.max(0.05, 0.5 * (100 / (100 + eq.blockPowerPctFromGear)))
  )
  const lifeRegenPercentOfMaxPerSecond = eq.lifeRegenPercentOfMaxLifePerSecondFromGear
  const flatLifeRegenPerSecond =
    eq.flatLifeRegenPerSecondPerCharacterLevelFromGear * characterLevel
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
  const recoveryRateMult = 1 + (eq.pctIncreasedLifeRecoveryFromGear + eq.pctIncreasedRecoveryFromAllSourcesFromGear) / 100
  const lifeRecoveryRateMult = recoveryRateMult
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

  const maxShockEffect = 50 + eq.maxShockEffectBonusFromGear
  const maxChillEffect = 30 + eq.maxChillEffectBonusFromGear
  const increasedShockEffect = eq.increasedShockEffectFromGear
  const shockDurationMultiplier = eq.shockDurationMoreMultFromGear
  const enemiesDealLessDamagePercent = eq.enemiesDealLessDamageFromGear
  const enemiesMoreSpeedMultiplier = 1 + eq.enemiesHaveMoreSpeedFromGear / 100
  const enemyResistancesEqualToYours = eq.enemyResistancesEqualToYoursFromGear
  const enemiesUnaffectedByChill = eq.enemiesUnaffectedByChillFromGear

  const damageTakenToManaFirstPercent = eq.damageTakenToManaFirstPercentFromGear
  const lifeRecoveredOnKillPercent = eq.lifeRecoveredOnKillPercentFromGear
  const flatLifeOnKill = eq.flatLifeOnKillFromGear
  const flatManaOnKill = eq.manaOnKillFlatFromGear
  const manaRecoveredOnKillPercent = eq.manaRecoveredOnKillPercentFromGear
  const lifeRecoveredOnBlockPercent = eq.lifeRecoveredOnBlockPercentFromGear
  const flatLifeOnBlock = eq.flatLifeOnBlockFromGear
  const manaRecoveredOnBlockPercent = eq.manaRecoveredOnBlockPercentFromGear
  const esRecoveredOnBlockPercent = eq.esRecoveredOnBlockPercentFromGear
  const flatManaOnBlock = eq.flatManaOnBlockFromGear
  const flatEsOnBlock = eq.flatEsOnBlockFromGear
  const energyShieldOnHit = eq.energyShieldOnHitFromGear
  const manaCostPaidWithLife = eq.manaCostPaidWithLifeFromGear
  const manaCostPaidWithEnergyShield = eq.manaCostPaidWithEnergyShieldFromGear
  const noMana = eq.noManaFromGear
  const cannotEvadeWhileAboveHalfLife = eq.cannotEvadeWhileAboveHalfLifeFromGear
  const cannotRecoverLifeWhileAboveHalfLife = eq.cannotRecoverLifeWhileAboveHalfLifeFromGear
  const armourHasNoEffectWhileBelowHalfLife = eq.armourHasNoEffectWhileBelowHalfLifeFromGear
  const sacrificeCurrentManaPercentPerSecond = eq.sacrificeCurrentManaPercentPerSecondFromGear
  const poisonYouInflictReflectedToYou = eq.poisonYouInflictReflectedToYouFromGear
  const elementalAilmentsYouInflictReflectedToYou = eq.elementalAilmentsYouInflictReflectedToYouFromGear
  const moreSpeedPerPoisonOnYouPercent = eq.moreSpeedPerPoisonOnYouPercentFromGear
  const moreSpeedPerShockEffectOnYouPerPct = eq.moreSpeedPerShockEffectOnYouPerPctFromGear
  const lifeRegenPercentOfMaxPerSecondWhileIgnited = eq.lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear
  const unaffectedByChill = eq.unaffectedByChillFromGear
  const moreAttackAndCastSpeedPer50CurrentManaPct = eq.moreAttackAndCastSpeedPer50CurrentManaPctFromGear
  const moreAccuracyRatingPer0_1sAttackTimePct = eq.moreAccuracyRatingPer0_1sAttackTimePctFromGear
  const poisonDamageTakenLessPercent = eq.poisonDamageTakenLessPercentFromGear
  const loseLifePerSecond = eq.loseLifePerSecondFromGear
  const takeChaosDamagePerSecond = eq.takeChaosDamagePerSecondFromGear
  const avoidAilmentsChance = Math.min(100, Math.max(0, eq.avoidAilmentsChanceFromGear))
  const avoidElementalAilmentsChance = Math.min(100, Math.max(0, eq.avoidElementalAilmentsChanceFromGear))
  const enemyLoseMaxLifeAtStartPercent = Math.min(100, Math.max(0, eq.enemyLoseMaxLifeAtStartPercentFromGear))
  const executeEnemiesBelowLifePercent = Math.min(100, Math.max(0, eq.executeEnemiesBelowLifePercentFromGear))
  const executeEnemiesBelowLifePercentEqualToChillEffect = eq.executeEnemiesBelowLifePercentEqualToChillEffectFromGear
  const periodicShockPct = Math.min(100, Math.max(0, eq.periodicShockPctFromGear))
  const periodicShockEverySec = Math.max(0, eq.periodicShockEverySecFromGear)
  const periodicLifeRegenPct = Math.min(100, Math.max(0, eq.periodicLifeRegenPctFromGear))
  const periodicLifeRegenEverySec = Math.max(0, eq.periodicLifeRegenEverySecFromGear)
  const periodicLifeRegenDurationSec = Math.max(0, eq.periodicLifeRegenDurationSecFromGear)
  const armourNoEffectVsPhysical = eq.armourNoEffectVsPhysicalFromGear
  const chaosDamageCanIgnite = eq.chaosDamageCanIgniteFromGear
  const lightningDamageCanPoison = eq.lightningDamageCanPoisonFromGear
  const chaosDamageCanInflictAllElementalAilments = eq.chaosDamageCanInflictAllElementalAilmentsFromGear
  const allElementalDamageTypesCanChill = eq.allElementalDamageTypesCanChillFromGear
  const allElementalDamageTypesCanIgnite = eq.allElementalDamageTypesCanIgniteFromGear
  const allElementalDamageTypesCanShock = eq.allElementalDamageTypesCanShockFromGear
  const critsAlwaysInflictPoison = eq.critsAlwaysInflictPoisonFromGear
  const critsAlwaysInflictElementalAilments = eq.critsAlwaysInflictElementalAilmentsFromGear
  const ignoreMaxShockEffect = eq.ignoreMaxShockEffectFromGear
  const fixedShockEffectPercent = Math.min(100, Math.max(0, eq.fixedShockEffectPercentFromGear))
  const randomIgniteDurationLessPercent = Math.max(0, eq.randomIgniteDurationLessPercentFromGear)
  const randomIgniteDurationMorePercent = Math.max(0, eq.randomIgniteDurationMorePercentFromGear)
  const chillYouInflictInfiniteDuration = eq.chillYouInflictInfiniteDurationFromGear
  const takePhysicalDamagePercentOfMaxLifeWhenYouAttack = Math.min(
    100,
    Math.max(0, eq.takePhysicalDamagePercentOfMaxLifeWhenYouAttackFromGear)
  )
  const convertEvasionToArmour = eq.convertEvasionToArmourFromGear
  const energyShieldCannotBeReducedBelowMaximum = eq.energyShieldCannotBeReducedBelowMaximumFromGear
  const countsAsDualWielding = eq.countsAsDualWieldingFromGear
  const armourEqualToPercentOfMaxMana = eq.armourEqualToPercentOfMaxManaFromGear
  const lifeLeechAppliesToEnergyShield = eq.lifeLeechAppliesToEnergyShieldFromGear
  const spellHitDamageLeechedAsEnergyShieldPercent = eq.spellHitDamageLeechedAsEnergyShieldPercentFromGear
  const excessLifeLeechRecoveryToEnergyShield = eq.excessLifeLeechRecoveryToEnergyShieldFromGear

  // -------------------------------------------------------------------------
  // Planner stat breakdowns (every ComputedBuildStats field)
  // -------------------------------------------------------------------------
  const blk = (lines: StatContributionLine[], formula?: string): StatBreakdownBlock => ({ lines, formula })

  const pushClassAttr = (attr: 'str' | 'dex' | 'int'): StatContributionLine[] => {
    const out: StatContributionLine[] = []
    for (const cls of GAME_CLASSES) {
      const level = getClassLevel(cls.id, config.upgradeLevels)
      if (level <= 0) continue
      const per = cls.perLevel[attr] ?? 0
      if (per !== 0) {
        out.push({ label: `${cls.name}: ${per} ${attr}/rank × ${level}`, value: per * level })
      }
    }
    if ((attr === 'str' || attr === 'dex') && bonus('mercenary')) {
      const ml = getClassLevel('mercenary', config.upgradeLevels)
      if (ml > 0) {
        out.push({
          label: 'Mercenary bonus: +5 Str and +5 Dex per Mercenary level',
          value: 5 * ml,
        })
      }
    }
    return out
  }

  const strPreGuardian = BASE_GAME_STATS.baseStr + totalStrFromClasses + eq.strBonus
  const dexPreGuardian = BASE_GAME_STATS.baseDex + totalDexFromClasses + eq.dexBonus
  const intPreGuardian = BASE_GAME_STATS.baseInt + totalIntFromClasses + eq.intBonus

  const strLines2: StatContributionLine[] = [{ label: 'Base strength', value: BASE_GAME_STATS.baseStr }]
  strLines2.push(...pushClassAttr('str'))
  dmgPushIf(strLines2, 'Gear: strength', eq.strBonus)
  if (bonus('guardian')) strLines2.push({ label: 'Guardian: +30 strength', value: 30 })
  const strIncLines: StatContributionLine[] = []
  dmgPushIf(strIncLines, 'Upgrades: increased strength', u('increasedStrength'))
  if (bonus('warrior')) strIncLines.push({ label: 'Warrior: 15% increased strength (multiplier)', value: 15 })
  dmgPushIf(strIncLines, 'Gear: increased strength', eq.pctIncreasedStrengthFromGear)
  if (eq.pctIncreasedAllAttributesFromGear !== 0) {
    strIncLines.push({
      label: 'Gear: increased all attributes (applies to Str)',
      value: eq.pctIncreasedAllAttributesFromGear,
    })
  }

  const dexLines2: StatContributionLine[] = [{ label: 'Base dexterity', value: BASE_GAME_STATS.baseDex }]
  dexLines2.push(...pushClassAttr('dex'))
  dmgPushIf(dexLines2, 'Gear: dexterity', eq.dexBonus)
  if (bonus('guardian')) dexLines2.push({ label: 'Guardian: +30 dexterity', value: 30 })
  const dexIncLines: StatContributionLine[] = []
  dmgPushIf(dexIncLines, 'Upgrades: increased dexterity', u('increasedDexterity'))
  dmgPushIf(dexIncLines, 'Gear: increased dexterity', eq.pctIncreasedDexterityFromGear)
  if (eq.pctIncreasedAllAttributesFromGear !== 0) {
    dexIncLines.push({
      label: 'Gear: increased all attributes (applies to Dex)',
      value: eq.pctIncreasedAllAttributesFromGear,
    })
  }

  const intLines2: StatContributionLine[] = [{ label: 'Base intelligence', value: BASE_GAME_STATS.baseInt }]
  intLines2.push(...pushClassAttr('int'))
  dmgPushIf(intLines2, 'Gear: intelligence', eq.intBonus)
  if (bonus('guardian')) intLines2.push({ label: 'Guardian: +30 intelligence', value: 30 })
  const intIncLines: StatContributionLine[] = []
  dmgPushIf(intIncLines, 'Upgrades: increased intelligence', u('increasedIntelligence'))
  dmgPushIf(intIncLines, 'Gear: increased intelligence', eq.pctIncreasedIntelligenceFromGear)
  if (eq.pctIncreasedAllAttributesFromGear !== 0) {
    intIncLines.push({
      label: 'Gear: increased all attributes (applies to Int)',
      value: eq.pctIncreasedAllAttributesFromGear,
    })
  }

  const strBeforeMult = strPreGuardian + (bonus('guardian') ? 30 : 0)

  const strBreak: StatBreakdownBlock = blk(
    [
      ...strLines2,
      { label: 'Subtotal before % increased (includes Guardian +30 if active)', value: strBeforeMult },
      { label: 'Final strength (rounded)', value: str },
      ...strIncLines.map((l) => ({ ...l, label: `${l.label} (in Σ for mult)` })),
    ],
    `round((base + classes + flat gear + Guardian) × (1 + Σ increased%/100)) = ${str}`
  )

  const dexBeforeMult = dexPreGuardian + (bonus('guardian') ? 30 : 0)
  const intBeforeMult = intPreGuardian + (bonus('guardian') ? 30 : 0)

  const dexBreak: StatBreakdownBlock = blk(
    [
      ...dexLines2,
      { label: 'Subtotal before % increased (includes Guardian +30 if active)', value: dexBeforeMult },
      { label: 'Final dexterity (rounded)', value: dex },
      ...dexIncLines.map((l) => ({ ...l, label: `${l.label} (in Σ for mult)` })),
    ],
    `round((base + classes + flat gear + Guardian) × (1 + Σ increased%/100)) = ${dex}`
  )

  const intBreak: StatBreakdownBlock = blk(
    [
      ...intLines2,
      { label: 'Subtotal before % increased (includes Guardian +30 if active)', value: intBeforeMult },
      { label: 'Final intelligence (rounded)', value: int_ },
      ...intIncLines.map((l) => ({ ...l, label: `${l.label} (in Σ for mult)` })),
    ],
    `round((base + classes + flat gear + Guardian) × (1 + Σ increased%/100)) = ${int_}`
  )

  const lifeLines: StatContributionLine[] = [
    { label: 'Base life', value: BASE_GAME_STATS.baseLife },
    { label: 'Life from strength (10 per 10 Str × guardian life mult)', value: lifeFromStr },
    { label: 'Life from character level (10 per level above 1)', value: levelFlatLife },
  ]
  dmgPushIf(lifeLines, 'Warrior bonus: +100 life', bonus('warrior') ? 100 : 0)
  dmgPushIf(lifeLines, 'Gear: flat life', eq.flatLife)
  dmgPushIf(lifeLines, 'Upgrades: increased life', u('increasedLife'))
  dmgPushIf(lifeLines, 'Gear: increased life', eq.pctIncreasedLifeFromGear)
  if (eq.lifeMoreMultFromGear !== 1) {
    lifeLines.push({ label: 'Gear: more maximum life (mult)', value: (eq.lifeMoreMultFromGear - 1) * 100 })
  }
  const maxLifeBreak: StatBreakdownBlock = blk(
    lifeLines,
    bonus('occultist')
      ? 'Occultist: maximum life fixed at 1'
      : `round((flat subtotal) × (1 + increased%/100) × more life mult) = ${maxLife}`
  )

  const manaLines: StatContributionLine[] = [
    { label: 'Base mana', value: BASE_GAME_STATS.baseMana },
    { label: 'Mana from intelligence (10 per 10 Int × guardian mana mult)', value: manaFromInt },
    { label: 'Mana from character level', value: levelFlatMana },
  ]
  dmgPushIf(manaLines, 'Gear: flat mana', eq.flatMana)
  dmgPushIf(manaLines, 'Upgrades: increased mana', u('increasedMana'))
  dmgPushIf(manaLines, 'Gear: increased mana', eq.pctIncreasedManaFromGear)
  if (eq.manaMoreMultFromGear !== 1) {
    manaLines.push({ label: 'Gear: more maximum mana (mult)', value: (eq.manaMoreMultFromGear - 1) * 100 })
  }
  const maxManaBreak: StatBreakdownBlock = blk(
    manaLines,
    `round(flat × (1 + Σ increased%/100) × more mana) = ${maxMana}`
  )

  const esLines: StatContributionLine[] = []
  if (bonus('sorcerer')) esLines.push({ label: 'Sorcerer: 10% of max mana as base ES', value: maxMana * 0.1 })
  dmgPushIf(esLines, 'Gear: flat energy shield', eq.flatEnergyShieldFromGear)
  if (eq.lifeAsExtraEsPercentFromGear !== 0) {
    esLines.push({
      label: 'Gear: life as extra ES',
      value: maxLife * (eq.lifeAsExtraEsPercentFromGear / 100),
    })
  }
  if (eq.manaAsExtraEsPercentFromGear !== 0) {
    esLines.push({
      label: 'Gear: mana as extra ES',
      value: maxMana * (eq.manaAsExtraEsPercentFromGear / 100),
    })
  }
  dmgPushIf(esLines, 'Upgrades: increased energy shield', u('increasedEnergyShield'))
  dmgPushIf(esLines, 'Upgrades: increased armour and energy shield', u('increasedArmourAndEnergyShield'))
  dmgPushIf(esLines, 'Upgrades: increased evasion and energy shield', u('increasedEvasionRatingAndEnergyShield'))
  dmgPushIf(esLines, 'Gear: increased energy shield', eq.pctIncreasedEnergyShieldFromGear)
  esLines.push({
    label: 'Defences from dexterity: +2% ES per 10 Dex (× guardian)',
    value: defFromDex,
  })
  if (bonus('occultist')) esLines.push({ label: 'Occultist: 40% more energy shield', value: 40 })
  if (eq.energyShieldLessMultFromGear !== 1) {
    esLines.push({
      label: 'Gear: less energy shield (mult)',
      value: (eq.energyShieldLessMultFromGear - 1) * 100,
    })
  }
  if (attunementDefencesPct !== 0) {
    esLines.push({ label: 'Ability attunement: increased defences (applied to ES)', value: attunementDefencesPct })
  }
  const maxEsBreak: StatBreakdownBlock = blk(
    esLines,
    `round(base × (1 + Σ increased%/100) × occultist × less ES) = ${maxEnergyShield}`
  )

  const armourLines: StatContributionLine[] = [
    { label: 'Base armour', value: BASE_GAME_STATS.baseArmour },
  ]
  dmgPushIf(armourLines, 'Gear: flat armour', eq.flatArmour)
  if (armourFromMaxMana !== 0) {
    armourLines.push({ label: 'Gear: armour from max mana (flat)', value: armourFromMaxMana })
  }
  if (armourFromInt !== 0) {
    armourLines.push({ label: 'Gear: armour per 10 Int (flat)', value: armourFromInt })
  }
  dmgPushIf(armourLines, 'Upgrades: increased armour', u('increasedArmour'))
  dmgPushIf(armourLines, 'Upgrades: increased armour and evasion', u('increasedArmourAndEvasionRating'))
  dmgPushIf(armourLines, 'Upgrades: increased armour and energy shield', u('increasedArmourAndEnergyShield'))
  dmgPushIf(armourLines, 'Gear: increased armour', eq.pctIncreasedArmourFromGear)
  armourLines.push({
    label: 'Defences from dexterity: +2% armour per 10 Dex (× guardian)',
    value: defFromDex,
  })
  if (eq.defencesLessMultFromGear !== 1) {
    armourLines.push({
      label: 'Gear: less defences (mult on armour)',
      value: (eq.defencesLessMultFromGear - 1) * 100,
    })
  }
  if (attunementDefencesPct !== 0) {
    armourLines.push({ label: 'Ability attunement: increased defences', value: attunementDefencesPct })
  }
  const armourBreak: StatBreakdownBlock = blk(
    armourLines,
    `round(flat × (1 + Σ increased%/100) × less defences) = ${armour}`
  )

  const evasionLines: StatContributionLine[] = [{ label: 'Base evasion', value: BASE_GAME_STATS.baseEvasion }]
  dmgPushIf(evasionLines, 'Gear: flat evasion', eq.flatEvasion)
  dmgPushIf(evasionLines, 'Upgrades: increased evasion', u('increasedEvasionRating'))
  dmgPushIf(evasionLines, 'Upgrades: increased armour and evasion', u('increasedArmourAndEvasionRating'))
  dmgPushIf(evasionLines, 'Upgrades: increased evasion and energy shield', u('increasedEvasionRatingAndEnergyShield'))
  dmgPushIf(evasionLines, 'Gear: increased evasion', eq.pctIncreasedEvasionFromGear)
  evasionLines.push({
    label: 'Defences from dexterity: +2% evasion per 10 Dex (× guardian)',
    value: defFromDex,
  })
  if (eq.evasionMoreMultFromGear !== 1) {
    evasionLines.push({
      label: 'Gear: more evasion (mult)',
      value: (eq.evasionMoreMultFromGear - 1) * 100,
    })
  }
  if (eq.defencesLessMultFromGear !== 1) {
    evasionLines.push({
      label: 'Gear: less defences (mult on evasion)',
      value: (eq.defencesLessMultFromGear - 1) * 100,
    })
  }
  if (attunementDefencesPct !== 0) {
    evasionLines.push({ label: 'Ability attunement: increased defences', value: attunementDefencesPct })
  }
  const evasionBreak: StatBreakdownBlock = blk(
    evasionLines,
    `round(flat × (1 + Σ increased%/100) × more evasion × less defences) = ${evasionRating}`
  )

  const blockLines: StatContributionLine[] = []
  dmgPushIf(blockLines, 'Upgrades: increased chance to block', u('increasedChanceToBlock'))
  dmgPushIf(blockLines, 'Gear: block chance', eq.blockChanceFromGear)
  const blockBreak: StatBreakdownBlock = blk(
    blockLines,
    `min(max block ${maxBlockChance}%, upgrades + gear) = ${blockChance}`
  )

  const dodgeLines: StatContributionLine[] = []
  dmgPushIf(dodgeLines, 'Upgrades: increased chance to dodge', u('increasedChanceToDodge'))
  dmgPushIf(dodgeLines, 'Gear: dodge chance', eq.dodgeChanceFromGear)
  if (eq.dodgeChancePer10DexFromGear !== 0) {
    dodgeLines.push({
      label: 'Gear: dodge per 10 dexterity',
      value: eq.dodgeChancePer10DexFromGear * (dex / 10),
    })
  }
  const dodgeBreak: StatBreakdownBlock = blk(
    dodgeLines,
    `min(max dodge ${maxDodgeCap}%, Σ sources) = ${dodgeChance}`
  )

  const fireResLines: StatContributionLine[] = []
  dmgPushIf(fireResLines, 'Upgrades: all elemental resistances', u('increasedAllElementalResistances'))
  if (fighterBonus !== 0) fireResLines.push({ label: 'Fighter: +15% to all elemental resistances', value: fighterBonus })
  dmgPushIf(fireResLines, 'Gear: all elemental resistances', eq.pctToAllElementalResFromGear)
  dmgPushIf(fireResLines, 'Gear: to all resistances', eq.pctToAllResistancesFromGear)
  dmgPushIf(fireResLines, 'Gear: fire resistance', eq.pctFireResFromGear)
  const fireResBreak: StatBreakdownBlock = blk(fireResLines, `fire res total (before cap) = ${fireRes}`)

  const coldResLines: StatContributionLine[] = []
  dmgPushIf(coldResLines, 'Upgrades: all elemental resistances', u('increasedAllElementalResistances'))
  if (fighterBonus !== 0) coldResLines.push({ label: 'Fighter: +15% to all elemental resistances', value: fighterBonus })
  dmgPushIf(coldResLines, 'Gear: all elemental resistances', eq.pctToAllElementalResFromGear)
  dmgPushIf(coldResLines, 'Gear: to all resistances', eq.pctToAllResistancesFromGear)
  dmgPushIf(coldResLines, 'Gear: cold resistance', eq.pctColdResFromGear)
  const coldResBreak: StatBreakdownBlock = blk(coldResLines, `cold res total = ${coldRes}`)

  const lightningResLines: StatContributionLine[] = []
  dmgPushIf(lightningResLines, 'Upgrades: all elemental resistances', u('increasedAllElementalResistances'))
  if (fighterBonus !== 0) lightningResLines.push({ label: 'Fighter: +15% to all elemental resistances', value: fighterBonus })
  dmgPushIf(lightningResLines, 'Gear: all elemental resistances', eq.pctToAllElementalResFromGear)
  dmgPushIf(lightningResLines, 'Gear: to all resistances', eq.pctToAllResistancesFromGear)
  dmgPushIf(lightningResLines, 'Gear: lightning resistance', eq.pctLightningResFromGear)
  const lightningResBreak: StatBreakdownBlock = blk(lightningResLines, `lightning res total = ${lightningRes}`)

  const chaosResLines: StatContributionLine[] = []
  dmgPushIf(chaosResLines, 'Upgrades: increased chaos resistance', u('increasedChaosResistance'))
  dmgPushIf(chaosResLines, 'Gear: chaos resistance', eq.pctChaosResFromGear)
  dmgPushIf(chaosResLines, 'Gear: to all resistances', eq.pctToAllResistancesFromGear)
  if (fighterBonus !== 0) chaosResLines.push({ label: 'Fighter: +15% to chaos (same bonus as elemental)', value: fighterBonus })
  const chaosResBreak: StatBreakdownBlock = blk(chaosResLines, `chaos res total = ${chaosRes}`)

  const maxFireResLines: StatContributionLine[] = [
    { label: 'Base elemental resistance cap', value: eleBase },
  ]
  if (bonus('chieftain')) maxFireResLines.push({ label: 'Chieftain: +5% max fire resistance', value: 5 })
  dmgPushIf(maxFireResLines, 'Gear: max fire resistance', eq.maxFireResBonusFromGear)
  dmgPushIf(maxFireResLines, 'Gear: max all elemental resistances', eq.maxAllElementalResBonusFromGear)
  const maxFireResBreak: StatBreakdownBlock = blk(
    maxFireResLines,
    `min(hard cap ${hardCap}%, Σ) = ${maxFireRes}`
  )

  const maxColdResLines: StatContributionLine[] = [{ label: 'Base elemental resistance cap', value: eleBase }]
  dmgPushIf(maxColdResLines, 'Gear: max cold resistance', eq.maxColdResBonusFromGear)
  dmgPushIf(maxColdResLines, 'Gear: max all elemental resistances', eq.maxAllElementalResBonusFromGear)
  const maxColdResBreak: StatBreakdownBlock = blk(
    maxColdResLines,
    `min(hard cap ${hardCap}%, Σ) = ${maxColdRes}`
  )

  const maxLightningResLines: StatContributionLine[] = [{ label: 'Base elemental resistance cap', value: eleBase }]
  dmgPushIf(maxLightningResLines, 'Gear: max lightning resistance', eq.maxLightningResBonusFromGear)
  dmgPushIf(maxLightningResLines, 'Gear: max all elemental resistances', eq.maxAllElementalResBonusFromGear)
  const maxLightningResBreak: StatBreakdownBlock = blk(
    maxLightningResLines,
    `min(hard cap ${hardCap}%, Σ) = ${maxLightningRes}`
  )

  const maxChaosResLines: StatContributionLine[] = [{ label: 'Base chaos resistance cap', value: chaosBase }]
  dmgPushIf(maxChaosResLines, 'Gear: max chaos resistance', eq.maxChaosResBonusFromGear)
  const maxChaosResBreak: StatBreakdownBlock = blk(
    maxChaosResLines,
    `min(hard cap ${hardCap}%, Σ) = ${maxChaosRes}`
  )

  const hitByTypeLines: StatContributionLine[] = hitDamageByType.map((r) => ({
    label: `${r.type} (avg of min–max)`,
    value: (r.min + r.max) / 2,
  }))
  const hitDamageByTypeBreak: StatBreakdownBlock = blk(
    hitByTypeLines,
    hitDamageByType.length > 0 ? 'Per-type hit ranges after conversion and increased mods' : 'No per-type rows'
  )

  const critFlatLines: StatContributionLine[] = [
    { label: spellCombat ? 'Base crit chance % (spell or game)' : 'Base crit chance % (weapon or game)', value: spellCombat ? (spellBaseCritChancePct ?? BASE_GAME_STATS.baseCritChance) : baseCritChance },
  ]
  if (critFromAssassin !== 0) critFlatLines.push({ label: 'Assassin: +8% crit chance', value: critFromAssassin })
  if (!spellCombat) {
    dmgPushIf(critFlatLines, 'Gear: attack base crit chance', eq.attackBaseCritChanceBonusFromGear)
  } else {
    dmgPushIf(critFlatLines, 'Gear: spell base crit chance', eq.spellBaseCritChanceBonusFromGear)
  }
  dmgPushIf(critFlatLines, 'Gear: global crit chance bonus', eq.critChanceBonus)
  if (critFromDex !== 0) {
    critFlatLines.push({
      label: 'Dexterity: +2% increased crit chance per 10 Dex (× guardian)',
      value: critFromDex,
    })
  }

  const critChanceIncLines: StatContributionLine[] = []
  dmgPushIf(critChanceIncLines, 'Upgrades: increased critical hit chance', u('increasedCriticalHitChance'))
  if (!spellCombat) {
    dmgPushIf(critChanceIncLines, 'Upgrades: increased attack critical hit chance', u('increasedAttackCriticalHitChance'))
  } else {
    dmgPushIf(critChanceIncLines, 'Upgrades: increased spell critical hit chance', u('increasedSpellCriticalHitChance'))
  }
  dmgPushIf(critChanceIncLines, 'Gear: increased critical hit chance', eq.pctIncreasedCriticalHitChanceFromGear)

  const apsLines: StatContributionLine[] = []
  if (!spellCombat) {
    apsLines.push({ label: 'Weapon base APS (or unarmed base)', value: apsFlatBase })
    dmgPushIf(apsLines, 'Upgrades: increased attack speed', u('increasedAttackSpeed'))
    dmgPushIf(apsLines, 'Upgrades: increased attack speed and cast speed', u('increasedAttackSpeedAndCastSpeed'))
    if (mercenaryAspIncPct !== 0) {
      apsLines.push({
        label: 'Mercenary: 1% increased attack speed per 10 Str or Dex (lower)',
        value: mercenaryAspIncPct,
      })
    }
    dmgPushIf(apsLines, 'Gear: increased attack speed', eq.pctIncreasedAttackSpeedFromGear)
    if (rogueMult !== 1) apsLines.push({ label: 'Rogue: 10% more attack speed (mult)', value: 10 })
    if (eq.attackSpeedLessMultFromGear !== 1) {
      apsLines.push({
        label: 'Gear: attack speed less/more (mult)',
        value: (eq.attackSpeedLessMultFromGear - 1) * 100,
      })
    }
  } else {
    apsLines.push({ label: 'Base cast time (s)', value: spellBaseCastTimeSeconds ?? 0 })
    apsLines.push({ label: 'Effective cast time (s)', value: abilityContribution?.effectiveCastTimeSeconds ?? 0 })
    apsLines.push({ label: 'Casts per second', value: aps })
    dmgPushIf(apsLines, 'Upgrades: increased cast speed', u('increasedCastSpeed'))
    dmgPushIf(apsLines, 'Upgrades: increased attack speed and cast speed', u('increasedAttackSpeedAndCastSpeed'))
    if ((spellAttunementCastSpeedIncPct ?? 0) !== 0) {
      apsLines.push({ label: 'Ability attunement: increased cast speed', value: spellAttunementCastSpeedIncPct ?? 0 })
    }
    dmgPushIf(apsLines, 'Gear: increased cast speed', eq.pctIncreasedCastSpeedFromGear)
    if (eq.castSpeedIncPctPer10DexFromGear !== 0) {
      apsLines.push({
        label: 'Gear: increased cast speed per 10 dexterity',
        value: eq.castSpeedIncPctPer10DexFromGear * (dex / 10),
      })
    }
    if (eq.castSpeedLessMultFromGear !== 1) {
      apsLines.push({
        label: 'Gear: cast speed less/more (mult)',
        value: (eq.castSpeedLessMultFromGear - 1) * 100,
      })
    }
  }

  const accuracyLines: StatContributionLine[] = [
    { label: 'Base accuracy', value: BASE_GAME_STATS.baseAccuracy },
  ]
  if (bonus('rogue')) accuracyLines.push({ label: 'Rogue: +150 accuracy', value: 150 })
  if (levelFlatAccuracy !== 0) {
    accuracyLines.push({ label: 'Character level: +3 accuracy per level above 1', value: levelFlatAccuracy })
  }
  dmgPushIf(accuracyLines, 'Gear: flat accuracy', eq.flatAccuracy)
  dmgPushIf(accuracyLines, 'Upgrades: increased accuracy', u('increasedAccuracyRating'))
  dmgPushIf(accuracyLines, 'Gear: increased accuracy', eq.pctIncreasedAccuracyFromGear)
  if (eq.accuracyLessMultFromGear !== 1) {
    accuracyLines.push({
      label: 'Gear: accuracy less (mult)',
      value: (eq.accuracyLessMultFromGear - 1) * 100,
    })
  }

  const critMultLines: StatContributionLine[] = [
    { label: 'Base crit damage multiplier', value: baseCritMultiplier },
  ]
  dmgPushIf(critMultLines, 'Gear: flat crit multiplier bonus (added before increased)', eq.flatCriticalDamageMultiplierBonusFromGear / 100)
  dmgPushIf(critMultLines, 'Gear: increased crit damage multiplier (÷100 added to mult)', eq.increasedCriticalDamageMultiplierFromGear / 100)
  if (eq.critMultiPctPer20AccuracyFromGear !== 0) {
    const pct = eq.critMultiPctPer20AccuracyFromGear * (accuracy / 20)
    if (pct !== 0) {
      critMultLines.push({
        label: `Gear: +${eq.critMultiPctPer20AccuracyFromGear}% crit damage multiplier per 20 accuracy (÷100)`,
        value: pct / 100,
      })
    }
  }
  if (attunementIncreasedCritMultiplierPct !== 0) {
    critMultLines.push({
      label: 'Ability attunement: to critical damage multiplier (÷100)',
      value: attunementIncreasedCritMultiplierPct / 100,
    })
  }
  critMultLines.push({ label: 'Final crit multiplier (after all)', value: critMultiplier })

  const manaCostLines: StatContributionLine[] = [
    { label: 'Base mana per attack', value: BASE_GAME_STATS.baseManaPerAttack },
  ]
  if (bonus('sorcerer')) manaCostLines.push({ label: 'Sorcerer: 10% reduced mana cost', value: -10 })
  dmgPushIf(manaCostLines, 'Gear: mana cost reduction', -eq.manaCostReductionFromGear)
  if (eq.manaCostIncreasePercentFromGear !== 0) {
    manaCostLines.push({ label: 'Gear: increased mana cost', value: eq.manaCostIncreasePercentFromGear })
  }
  if (eq.abilitiesNoCostFromGear) manaCostLines.push({ label: 'Gear: abilities cost no mana', value: 1 })

  const manaRegenLines: StatContributionLine[] = [
    { label: `Base: ${BASE_GAME_STATS.baseManaRegenPercent}% of max mana / s (flat regen)`, value: baseManaRegen },
  ]
  if (bonus('druid')) manaRegenLines.push({ label: 'Druid: +2% of max mana / s', value: druidRegenBonus })
  dmgPushIf(manaRegenLines, 'Gear: % of max mana regen / s', maxMana * (eq.manaRegenPercentOfMaxManaPerSecondFromGear / 100))
  dmgPushIf(manaRegenLines, 'Upgrades: increased mana regeneration', u('increasedManaRegeneration'))
  dmgPushIf(manaRegenLines, 'Gear: increased mana regeneration', eq.pctIncreasedManaRegenFromGear)

  const lifeRecLines: StatContributionLine[] = [
    { label: 'Base post-encounter life recovery %', value: BASE_GAME_STATS.baseLifeRecoveryAfterEncounterPct },
  ]
  if (bonus('hunter')) lifeRecLines.push({ label: 'Hunter: 100% increased recovery (×2 on base)', value: 100 })
  if (bonus('acolyte')) lifeRecLines.push({ label: 'Acolyte: 25% increased recovery', value: 25 })
  dmgPushIf(lifeRecLines, 'Upgrades: increased life recovery', u('increasedLifeRecovery'))
  dmgPushIf(lifeRecLines, 'Gear: increased life recovery', eq.pctIncreasedLifeRecoveryFromGear)

  const esRecLines: StatContributionLine[] = [
    { label: 'Base post-encounter ES recovery %', value: BASE_GAME_STATS.baseEsRecoveryAfterEncounterPct },
  ]
  if (bonus('arcanist')) esRecLines.push({ label: 'Arcanist: 50% increased ES recovery', value: 50 })

  const classBonusLines: StatContributionLine[] = classBonusesActive.map((id) => {
    const c = GAME_CLASSES_BY_ID[id]
    return { label: `Active class bonus: ${c?.name ?? id}`, value: 1 }
  })
  const classLevelsLines: StatContributionLine[] = Object.entries(classLevelsActive).map(([id, lv]) => {
    const c = GAME_CLASSES_BY_ID[id]
    return { label: `${c?.name ?? id}: passive ranks`, value: lv }
  })

  const abilityLines: StatContributionLine[] = abilityContribution
    ? [
        { label: 'Ability selected', value: 1 },
        { label: 'Scaled damage mult % (attacks)', value: abilityContribution.scaledDamageMultiplierPct ?? 0 },
        { label: 'Attack speed mult % (attacks)', value: abilityContribution.attackSpeedMultiplierPct ?? 0 },
      ]
    : [{ label: 'No ability selected', value: 0 }]

  const strikesBreakLines: StatContributionLine[] = []
  if (!spellCombat) {
    strikesBreakLines.push({ label: 'Base strikes per attack', value: 1 })
    const aid = config.ability?.abilityId
    const ab = aid ? EOC_ABILITY_BY_ID[aid] : undefined
    const abStrikes =
      ab && (ab.type === 'Melee' || ab.type === 'Ranged') ? extraStrikesFromAbilityLines(ab.lines) : 0
    dmgPushIf(strikesBreakLines, 'Gear: additional strikes per attack', eq.flatStrikesPerAttack)
    if (abStrikes !== 0) strikesBreakLines.push({ label: 'Ability lines: extra strikes per attack', value: abStrikes })
    dmgPushIf(strikesBreakLines, 'Gear: increased strikes per attack', eq.increasedStrikesPerAttackFromGear)
    if (eq.strikesIncPctPer10DexFromGear !== 0) {
      strikesBreakLines.push({
        label: 'Gear: increased strikes per attack per 10 dexterity',
        value: eq.strikesIncPctPer10DexFromGear * (dex / 10),
      })
    }
    if (attunementStrikesIncPct !== 0) {
      strikesBreakLines.push({
        label: 'Ability attunement: increased strikes per attack',
        value: attunementStrikesIncPct,
      })
    }
    if (eq.strikesMoreMultFromGear !== 1) {
      strikesBreakLines.push({
        label: 'Gear: more strikes (mult)',
        value: (eq.strikesMoreMultFromGear - 1) * 100,
      })
    }
  }

  const hitBreakMeta: StatBreakdownBlock = blk(
    [{ label: 'Full hit pipeline available', value: hitDamageComputationBreakdown ? 1 : 0 }],
    hitDamageComputationBreakdown
      ? 'Expand “Damage multipliers (sources)” under hit damage for conversion, increased pools, crit, APS, DPS.'
      : 'Spell hit or no attack breakdown.'
  )

  const boolLine = (label: string, on: boolean): StatContributionLine => ({
    label,
    value: on ? 1 : 0,
  })

  const statBreakdowns: StatBreakdowns = {
    str: strBreak,
    dex: dexBreak,
    int: intBreak,
    maxLife: maxLifeBreak,
    maxMana: maxManaBreak,
    maxEnergyShield: maxEsBreak,
    armour: armourBreak,
    evasionRating: evasionBreak,
    blockChance: blockBreak,
    dodgeChance: dodgeBreak,
    fireRes: fireResBreak,
    coldRes: coldResBreak,
    lightningRes: lightningResBreak,
    chaosRes: chaosResBreak,
    maxFireRes: maxFireResBreak,
    maxColdRes: maxColdResBreak,
    maxLightningRes: maxLightningResBreak,
    maxChaosRes: maxChaosResBreak,
    hitDamageMin: blk([{ label: 'Minimum hit (planner)', value: hitDamageMin }]),
    hitDamageMax: blk([{ label: 'Maximum hit (planner)', value: hitDamageMax }]),
    hitDamageByType: hitDamageByTypeBreak,
    aps: blk(apsLines, `base × (1 + Σ inc%/100) × more = ${aps.toFixed(2)}`),
    manaCostPerAttack: blk(manaCostLines, `final = ${manaCostPerAttack.toFixed(1)}`),
    accuracy: blk(accuracyLines, `round(flat × (1 + inc%) × less) = ${accuracy}`),
    critChance: blk(
      [...critFlatLines, ...critChanceIncLines],
      spellCombat
        ? `min(100, Σ spell flat × (1 + Σ inc%/100)) = ${critChance.toFixed(1)}%`
        : `min(100, Σ attack flat × (1 + Σ inc%/100)) = ${critChance.toFixed(1)}%`
    ),
    critMultiplier: blk(critMultLines, `final multiplier = ${critMultiplier.toFixed(2)}`),
    avgHit: blk([{ label: '(hit min + hit max) / 2', value: avgHit }]),
    avgEffectiveDamage: blk(
      [{ label: 'Avg hit × crit expectation', value: avgEffectiveDamage }],
      `(avg hit) × (1 + p×(M−1)) = ${avgEffectiveDamage.toFixed(1)}`
    ),
    dps: blk(
      [
        { label: 'Avg effective damage', value: avgEffectiveDamage },
        { label: 'APS', value: aps },
        { label: 'Strikes per attack', value: strikesPerAttack },
      ],
      `avg × APS × strikes = ${dps.toFixed(1)}`
    ),
    strikesPerAttack: blk(
      strikesBreakLines.length > 0 ? strikesBreakLines : [{ label: 'Spells / default', value: strikesPerAttack }],
      `final strikes per attack = ${strikesPerAttack}`
    ),
    manaRegenPerSecond: blk(
      manaRegenLines,
      `flat regen × (1 + Σ inc%/100) = ${manaRegenPerSecond.toFixed(2)}/s`
    ),
    lifeRecoveryPct: blk(lifeRecLines, `product of hunter/acolyte/upgrades/gear = ${lifeRecoveryPct.toFixed(2)}%`),
    esRecoveryPct: blk(esRecLines, `base × arcanist = ${esRecoveryPct.toFixed(2)}%`),
    bleedChance: blk([{ label: 'Σ upgrades + gear + ability lines', value: bleedChance }]),
    poisonChance: blk([{ label: 'Σ upgrades + gear + ability lines', value: poisonChance }]),
    elementalAilmentChance: blk([{ label: 'Σ upgrades + gear + ability lines', value: elementalAilmentChance }]),
    ailmentDurationBonus: blk([{ label: 'Σ upgrades + gear (increased / reduced)', value: ailmentDurationBonus }]),
    ailmentDurationMultiplier: blk(
      [
        { label: 'From increased/reduced % (1 + Σ/100)', value: 1 + ailmentDurationBonus / 100 },
        {
          label: 'Gear: product of (1 − less%/100) for less ailment/bleed/poison/chill/shock duration',
          value: eq.ailmentDurationLessMultFromGear,
        },
      ],
      `(1 + Σ%/100) × less mult = ${ailmentDurationMultiplier.toFixed(4)}`
    ),
    igniteAilmentDurationMultiplier: blk(
      [
        { label: 'Global ailment duration mult', value: ailmentDurationMultiplier },
        { label: 'Gear: less ignite duration mult', value: eq.igniteDurationLessMultFromGear },
      ],
      `ignite × less ignite = ${igniteAilmentDurationMultiplier.toFixed(4)}`
    ),
    igniteInflictChanceBonus: blk([{ label: 'Gear + ability lines', value: igniteInflictChanceBonus }]),
    shockInflictChanceBonus: blk([{ label: 'Gear + ability lines', value: shockInflictChanceBonus }]),
    chillInflictChanceBonus: blk([{ label: 'Gear + ability lines', value: chillInflictChanceBonus }]),
    increasedMeleeDamage: blk([
      { label: 'Upgrades', value: u('increasedMeleeDamage') },
      { label: 'Strength: +1% per 10 Str', value: meleeDmgFromStr },
      { label: 'Gear', value: eq.increasedMeleeDamageFromGear },
    ]),
    increasedAttackDamage: blk([
      { label: 'Upgrades', value: u('increasedAttackDamage') },
      { label: 'Gear', value: eq.increasedAttackDamageFromGear },
      { label: 'Ranged per-10-str (if bow/xbow)', value: rangedAttackDmgFromGear },
    ]),
    increasedSpellDamage: blk([
      { label: 'Upgrades', value: u('increasedSpellDamage') },
      { label: 'Intelligence: +1% per 10 Int', value: spellDmgFromInt },
      { label: 'Gear', value: eq.increasedSpellDamageFromGear },
    ]),
    increasedElementalDamage: blk([
      { label: 'Upgrades (elemental)', value: u('increasedElementalDamage') },
      { label: 'Upgrades (elemental with attacks)', value: u('increasedElementalDamageWithAttacks') },
      { label: 'Gear', value: eq.increasedElementalDamageFromGear },
    ]),
    increasedDamage: blk([
      { label: 'Upgrades', value: u('increasedDamage') },
      { label: 'Occultist (per 100 ES)', value: bonus('occultist') ? maxEnergyShield / 100 : 0 },
      { label: 'Gear', value: eq.increasedDamageFromGear },
      { label: 'Per level above 1', value: levelPctIncreasedDamage },
      { label: 'Gear: per 10 combined attributes', value: damageIncFromCombinedAttrsGear },
    ]),
    damageOverTimeMultiplier: blk(
      [
        { label: 'Upgrades: increased DoT multiplier', value: u('increasedDamageOverTimeMultiplier') },
        { label: 'Gear: increased DoT', value: eq.pctIncreasedDamageOverTimeFromGear },
        { label: 'Gear: increased bleed', value: eq.pctIncreasedBleedDamageFromGear },
      ],
      `Final Σ% (ability attunement added in-computation) = ${damageOverTimeMultiplier}`
    ),
    doubleDamageChance: blk([
      { label: 'Barbarian', value: bonus('barbarian') ? 10 : 0 },
      { label: 'Destroyer', value: bonus('destroyer') ? 25 : 0 },
      { label: 'Gear (attacks)', value: eq.doubleDamageChanceFromGear },
      { label: 'Attunement', value: attunementFlatDoubleChance },
      { label: 'Gear (spells, if spell)', value: spellCombat ? eq.doubleDamageChanceFromSpellsFromGear : 0 },
    ], `min(100, Σ) = ${doubleDamageChance}`),
    tripleDamageChance: blk([{ label: 'Gear', value: tripleDamageChance }]),
    armourIgnorePercent: blk([
      { label: 'Barbarian', value: bonus('barbarian') ? 50 : 0 },
      { label: 'Gear', value: eq.armourIgnoreFromGear },
    ], `min(100, Σ) = ${armourIgnorePercent}`),
    dotDamageMoreMultiplier: blk([{ label: 'Gear more mult', value: dotDamageMoreMultiplier }]),
    lightningPenetrationPercent: blk([{ label: 'Gear', value: lightningPenetrationPercent }]),
    firePenetrationPercent: blk([{ label: 'Gear', value: firePenetrationPercent }]),
    coldPenetrationPercent: blk([{ label: 'Gear', value: coldPenetrationPercent }]),
    chaosPenetrationPercent: blk([{ label: 'Gear', value: chaosPenetrationPercent }]),
    elementalPenetrationPercent: blk([{ label: 'Gear', value: elementalPenetrationPercent }]),
    lifeOnHit: blk([{ label: 'Gear', value: lifeOnHit }]),
    lifeLeechFromHitDamagePercent: blk([{ label: 'Gear', value: lifeLeechFromHitDamagePercent }]),
    lifeLeechFromPhysicalHitPercent: blk([{ label: 'Gear', value: lifeLeechFromPhysicalHitPercent }]),
    hitsCannotBeEvaded: blk([boolLine('Gear: hits cannot be evaded', hitsCannotBeEvaded)]),
    blockDamageTakenMult: blk([
      { label: 'From block power % (gear)', value: blockDamageTakenMult },
    ]),
    lifeRegenPercentOfMaxPerSecond: blk([{ label: 'Gear', value: lifeRegenPercentOfMaxPerSecond }]),
    esRegenPercentOfMaxPerSecond: blk([{ label: 'Gear', value: esRegenPercentOfMaxPerSecond }]),
    enemiesTakeIncreasedDamagePercent: blk([
      { label: 'Gear', value: eq.enemyDamageTakenIncreasedFromGear },
      { label: 'Trickster', value: enemyDamageTakenIncreasedFromTricksterPct },
    ], `Σ = ${enemiesTakeIncreasedDamagePercent}%`),
    damageTakenMultiplierFromGear: blk([
      { label: 'Less damage taken (mult)', value: eq.damageTakenLessMultFromGear },
      { label: 'More damage taken (mult)', value: eq.damageTakenMoreMultFromGear },
    ], `product = ${damageTakenMultiplierFromGear.toFixed(4)}`),
    cannotInflictElementalAilments: blk([boolLine('Gear', cannotInflictElementalAilments)]),
    hitsTakenCannotBeCritical: blk([boolLine('Gear', hitsTakenCannotBeCritical)]),
    damageDealtLessMult: blk([{ label: 'Gear: less damage dealt', value: damageDealtLessMult }]),
    lifeRecoveryRateMult: blk([{ label: 'From gear increased life recovery', value: lifeRecoveryRateMult }]),
    physicalDamageTakenAsChaosPercent: blk([{ label: 'Gear', value: physicalDamageTakenAsChaosPercent }]),
    physicalDamageTakenAsFirePercent: blk([{ label: 'Gear', value: physicalDamageTakenAsFirePercent }]),
    physicalDamageTakenAsColdPercent: blk([{ label: 'Gear', value: physicalDamageTakenAsColdPercent }]),
    physicalDamageTakenAsLightningPercent: blk([{ label: 'Gear', value: physicalDamageTakenAsLightningPercent }]),
    elementalDamageTakenAsChaosPercent: blk([{ label: 'Gear', value: elementalDamageTakenAsChaosPercent }]),
    reducedPhysicalDamageTaken: blk([
      { label: 'Gear', value: eq.reducedPhysicalDamageTakenFromGear },
      { label: 'Arcanist (with ES)', value: bonus('arcanist') ? 15 : 0 },
    ], `Σ = ${reducedPhysicalDamageTaken}`),
    nonDamagingAilmentEffectIncreasedPercent: blk([{ label: 'Gear', value: nonDamagingAilmentEffectIncreasedPercent }]),
    chillInflictEffectMult: blk([{ label: 'Gear', value: chillInflictEffectMult }]),
    dealNoDamageExceptCrit: blk([boolLine('Gear', dealNoDamageExceptCrit)]),
    damageTakenToManaFirstPercent: blk([{ label: 'Gear', value: damageTakenToManaFirstPercent }]),
    lifeRecoveredOnKillPercent: blk([{ label: 'Gear', value: lifeRecoveredOnKillPercent }]),
    flatLifeOnKill: blk([{ label: 'Gear', value: flatLifeOnKill }]),
    flatManaOnKill: blk([{ label: 'Gear', value: flatManaOnKill }]),
    lifeRecoveredOnBlockPercent: blk([{ label: 'Gear', value: lifeRecoveredOnBlockPercent }]),
    flatLifeOnBlock: blk([{ label: 'Gear', value: flatLifeOnBlock }]),
    manaRecoveredOnBlockPercent: blk([{ label: 'Gear', value: manaRecoveredOnBlockPercent }]),
    esRecoveredOnBlockPercent: blk([{ label: 'Gear', value: esRecoveredOnBlockPercent }]),
    flatManaOnBlock: blk([{ label: 'Gear', value: flatManaOnBlock }]),
    flatEsOnBlock: blk([{ label: 'Gear', value: flatEsOnBlock }]),
    energyShieldOnHit: blk([{ label: 'Gear', value: energyShieldOnHit }]),
    manaCostPaidWithLife: blk([boolLine('Gear: mana cost paid with life', manaCostPaidWithLife)]),
    avoidAilmentsChance: blk([{ label: 'Gear', value: avoidAilmentsChance }]),
    avoidElementalAilmentsChance: blk([{ label: 'Gear', value: avoidElementalAilmentsChance }]),
    manaShieldActive: blk([boolLine('Druid class bonus', manaShieldActive)]),
    chaosNotBypassES: blk([boolLine('Arcanist class bonus', chaosNotBypassES)]),
    armourVsElementalMultiplier: blk([
      { label: 'Base + Juggernaut elemental effectiveness', value: armourVsElementalMultiplier },
    ]),
    armourVsChaosMultiplier: blk([
      { label: 'Base + Juggernaut/Templar/Chieftain + gear', value: armourVsChaosMultiplier },
    ]),
    classBonusesActive: blk(classBonusLines, classBonusesActive.join(', ') || 'none'),
    classLevelsActive: blk(classLevelsLines, 'passive ranks per class'),
    abilityContribution: blk(abilityLines, abilityContribution ? abilityContribution.name : '—'),
    hitDamageComputationBreakdown: hitBreakMeta,
  }

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
    itemRarityPercent: eq.increasedItemRarityFromGear,
    itemQuantityPercent: eq.increasedItemQuantityFromGear,
    avgHit,
    avgEffectiveDamage,
    dps,
    strikesPerAttack,

    // Recovery
    manaRegenPerSecond,
    manaRegenAppliesToEnergyShieldPercent,
    lifeRecoveryPct,
    esRecoveryPct,
    cannotEvadeWhileAboveHalfLife,
    cannotRecoverLifeWhileAboveHalfLife,
    armourHasNoEffectWhileBelowHalfLife,
    sacrificeCurrentManaPercentPerSecond,
    poisonYouInflictReflectedToYou,
    elementalAilmentsYouInflictReflectedToYou,
    moreSpeedPerPoisonOnYouPercent,
    moreSpeedPerShockEffectOnYouPerPct,
    lifeRegenPercentOfMaxPerSecondWhileIgnited,
    unaffectedByChill,
    manaRecoveredOnKillPercent,
    moreAttackAndCastSpeedPer50CurrentManaPct,
    moreAccuracyRatingPer0_1sAttackTimePct,
    flatLifeRegenPerSecond,
    poisonDamageTakenLessPercent,
    loseLifePerSecond,
    takeChaosDamagePerSecond,
    avoidAilmentsChance,
    avoidElementalAilmentsChance,
    enemyLoseMaxLifeAtStartPercent,
    executeEnemiesBelowLifePercent,
    executeEnemiesBelowLifePercentEqualToChillEffect,
    periodicShockPct,
    periodicShockEverySec,
    periodicLifeRegenPct,
    periodicLifeRegenEverySec,
    periodicLifeRegenDurationSec,
    armourNoEffectVsPhysical,
    chaosDamageCanIgnite,
    lightningDamageCanPoison,
    chaosDamageCanInflictAllElementalAilments,
    allElementalDamageTypesCanChill,
    allElementalDamageTypesCanIgnite,
    allElementalDamageTypesCanShock,
    critsAlwaysInflictPoison,
    critsAlwaysInflictElementalAilments,
    ignoreMaxShockEffect,
    fixedShockEffectPercent,
    randomIgniteDurationLessPercent,
    randomIgniteDurationMorePercent,
    chillYouInflictInfiniteDuration,
    takePhysicalDamagePercentOfMaxLifeWhenYouAttack,
    pctDexIntConvertedToStr,
    convertEvasionToArmour,
    energyShieldCannotBeReducedBelowMaximum,
    countsAsDualWielding,
    armourEqualToPercentOfMaxMana,
    lifeLeechAppliesToEnergyShield,
    spellHitDamageLeechedAsEnergyShieldPercent,
    excessLifeLeechRecoveryToEnergyShield,

    // Ailments
    bleedChance,
    poisonChance,
    elementalAilmentChance,
    ailmentDurationBonus,
    ailmentDurationMultiplier,
    igniteAilmentDurationMultiplier,
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
    recoveryRateMult,
    physicalDamageTakenAsChaosPercent,
    physicalDamageTakenAsFirePercent,
    physicalDamageTakenAsColdPercent,
    physicalDamageTakenAsLightningPercent,
    elementalDamageTakenAsChaosPercent,
    reducedPhysicalDamageTaken,
    nonDamagingAilmentEffectIncreasedPercent,
    maxShockEffect,
    maxChillEffect,
    increasedShockEffect,
    shockDurationMultiplier,
    enemiesDealLessDamagePercent,
    enemiesMoreSpeedMultiplier,
    enemyResistancesEqualToYours,
    enemiesUnaffectedByChill,
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
    manaCostPaidWithEnergyShield,
    noMana,
    manaShieldActive,
    chaosNotBypassES,
    armourVsElementalMultiplier,
    armourVsChaosMultiplier,

    // Meta
    classBonusesActive,
    classLevelsActive,

    abilityContribution,
    hitDamageComputationBreakdown,
    spellDamageComputationBreakdown,

    statBreakdowns,
  }
}
