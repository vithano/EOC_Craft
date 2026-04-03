import type { UpgradeModifierKey } from './gameClasses'
import {
  GAME_CLASSES,
  GAME_CLASSES_BY_ID,
  BASE_GAME_STATS,
  getClassLevel,
  isClassBonusActive,
} from './gameClasses'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BuildConfig {
  upgradeLevels: Record<string, number> // "classId/upgradeId" -> 0..5
  equipmentModifiers: EquipmentModifiers
}

export interface EquipmentModifiers {
  flatLife: number
  flatMana: number
  flatArmor: number
  flatEvasion: number
  flatDamageMin: number
  flatDamageMax: number
  critChanceBonus: number // percentage points
  strBonus: number
  dexBonus: number
  intBonus: number
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
  armor: number
  evasionRating: number
  blockChance: number  // 0-75 (or 0-100 for Dragoon)
  dodgeChance: number  // 0-75

  // Resistances (capped at maxResistance)
  fireRes: number
  coldRes: number
  lightningRes: number
  chaosRes: number
  maxFireRes: number // usually 75, +5 for Chieftain

  // Offense
  hitDamageMin: number
  hitDamageMax: number
  aps: number
  manaCostPerAttack: number
  accuracy: number
  critChance: number    // percentage
  critMultiplier: number // 2.0 = 200%
  avgHit: number
  avgEffectiveDamage: number
  dps: number

  // Recovery
  manaRegenPerSecond: number
  lifeRecoveryPct: number
  esRecoveryPct: number

  // Ailment bonuses (base chances from upgrades)
  bleedChance: number
  poisonChance: number
  elementalAilmentChance: number
  ailmentDurationBonus: number // % increased duration

  // Damage modifiers (passed to battle engine)
  increasedMeleeDamage: number
  increasedAttackDamage: number
  increasedSpellDamage: number
  increasedElementalDamage: number
  increasedDamage: number
  damageOverTimeMultiplier: number

  // Combat modifier flags (for battle engine)
  doubleDamageChance: number
  armorIgnorePercent: number          // % of enemy armor ignored
  manaShieldActive: boolean           // Druid: 25% of damage taken to mana above 50%
  chaosNotBypassES: boolean           // Arcanist bonus
  armorVsElementalMultiplier: number  // 0.5 base; 1.0 with Juggernaut
  armorVsChaosMultiplier: number      // 0.25 base; modified by Juggernaut/Templar/Chieftain

  // Which class bonuses are active (for battle engine use)
  classBonusesActive: string[]

  // Classes with >0 points (for display)
  classLevelsActive: Record<string, number>
}

// ---------------------------------------------------------------------------
// Equipment aggregation helper
// ---------------------------------------------------------------------------

export function aggregateItemModifiers(
  equippedItems: { modifiers: import('./equipment').ItemModifiers }[]
): EquipmentModifiers {
  let flatLife = 0, flatMana = 0, flatArmor = 0, flatEvasion = 0
  let flatDamageMin = 0, flatDamageMax = 0, critChanceBonus = 0
  let strBonus = 0, dexBonus = 0, intBonus = 0

  for (const item of equippedItems) {
    const m = item.modifiers
    flatLife       += (m.health       ?? 0)
    flatMana       += (m.mana         ?? 0)
    flatArmor      += (m.armor        ?? 0)
    flatEvasion    += (m.evasion      ?? 0)
    // damage modifier: split into min (50%) and max (100%)
    flatDamageMin  += (m.damage       ?? 0) * 0.5
    flatDamageMax  += (m.damage       ?? 0)
    critChanceBonus+= (m.critChance   ?? 0)
    strBonus       += (m.strength     ?? 0)
    dexBonus       += (m.dexterity    ?? 0) + (m.agility ?? 0) // agility maps to dex
    intBonus       += (m.intelligence ?? 0)
    flatLife       += (m.vitality     ?? 0) * 5 // vitality -> flat life
  }

  return {
    flatLife, flatMana, flatArmor, flatEvasion,
    flatDamageMin, flatDamageMax, critChanceBonus,
    strBonus, dexBonus, intBonus,
  }
}

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export function computeBuildStats(config: BuildConfig): ComputedBuildStats {
  const { equipmentModifiers: eq } = config

  // -------------------------------------------------------------------------
  // 1. Determine active class bonuses
  // -------------------------------------------------------------------------
  const classBonusesActive: string[] = GAME_CLASSES
    .filter(cls => isClassBonusActive(cls.id, config.upgradeLevels))
    .map(cls => cls.id)

  const bonus = (id: string) => classBonusesActive.includes(id)

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
  const strMult  = 1 + u('increasedStrength')     / 100 + (bonus('warrior') ? 0.15 : 0)
  const dexMult  = 1 + u('increasedDexterity')    / 100
  const intMult  = 1 + u('increasedIntelligence') / 100

  str  = Math.round(str  * strMult)
  dex  = Math.round(dex  * dexMult)
  int_ = Math.round(int_ * intMult)

  // -------------------------------------------------------------------------
  // 6. Guardian "doubled inherent attribute bonuses" multipliers
  //    Affects: life per str, mana per int, defenses per dex, crit per dex
  // -------------------------------------------------------------------------
  const guardianDoubled = bonus('guardian')
  const attrLifeMult = guardianDoubled ? 2 : 1  // +1 life per str → +2
  const attrManaMult = guardianDoubled ? 2 : 1  // +1 mana per int → +2
  const attrDefMult  = guardianDoubled ? 2 : 1  // 2% defenses per 10 dex → 4%
  const attrCritMult = guardianDoubled ? 2 : 1  // 2% crit per 10 dex → 4%

  // -------------------------------------------------------------------------
  // 7. Maximum life
  // -------------------------------------------------------------------------
  const lifeFromStr      = str * attrLifeMult            // +1 life per str (doubled for guardian)
  const baseLife         = BASE_GAME_STATS.baseLife + lifeFromStr
  // Warrior class bonus: +100 flat life added before % multiplier
  const lifeBeforeMultiplier = baseLife + (bonus('warrior') ? 100 : 0) + eq.flatLife
  const totalIncreasedLife   = u('increasedLife')
  let maxLife = Math.round(lifeBeforeMultiplier * (1 + totalIncreasedLife / 100))

  // Occultist class bonus: maximum life = 1
  if (bonus('occultist')) maxLife = 1

  // -------------------------------------------------------------------------
  // 8. Maximum mana
  // -------------------------------------------------------------------------
  const manaFromInt = int_ * attrManaMult  // +1 mana per int (doubled for guardian)
  const baseMana    = BASE_GAME_STATS.baseMana + manaFromInt + eq.flatMana
  const maxMana     = Math.round(baseMana * (1 + u('increasedMana') / 100))

  // -------------------------------------------------------------------------
  // 9. Energy shield
  // -------------------------------------------------------------------------
  // Sorcerer class bonus: 10% of max mana as extra base ES
  const esBase            = bonus('sorcerer') ? maxMana * 0.10 : 0
  const esIncreasedPct    = u('increasedEnergyShield')
  // Occultist class bonus: 40% MORE energy shield (multiplicative)
  const occultistMoreES   = bonus('occultist') ? 1.40 : 1.0
  const maxEnergyShield   = Math.round(esBase * (1 + esIncreasedPct / 100) * occultistMoreES)

  // -------------------------------------------------------------------------
  // 10. Armor
  // -------------------------------------------------------------------------
  // "2% increased defenses per 10 dex" treated as a fraction of dex
  const defFromDex = (dex * attrDefMult * 2) / 100  // multiplier increment (e.g. 0.06 for 30 dex)

  const totalIncreasedArmor =
    u('increasedArmor') +
    u('increasedArmorAndEvasionRating') +
    u('increasedArmorAndEnergyShield')

  const armor = Math.round(
    eq.flatArmor
    * (1 + totalIncreasedArmor / 100)
    * (1 + defFromDex)
  )

  // -------------------------------------------------------------------------
  // 11. Evasion rating
  // -------------------------------------------------------------------------
  const totalIncreasedEvasion =
    u('increasedEvasionRating') +
    u('increasedArmorAndEvasionRating') +
    u('increasedEvasionRatingAndEnergyShield')

  const evasionRating = Math.round(
    (BASE_GAME_STATS.baseEvasion + eq.flatEvasion)
    * (1 + totalIncreasedEvasion / 100)
    * (1 + defFromDex)
  )

  // -------------------------------------------------------------------------
  // 12. Block and dodge
  // -------------------------------------------------------------------------
  // Dragoon class bonus: +25% to maximum block chance (75 → 100)
  const maxBlockChance = bonus('dragoon') ? 100 : 75
  const blockChance = Math.min(maxBlockChance, u('increasedChanceToBlock'))
  const dodgeChance = Math.min(75, u('increasedChanceToDodge'))

  // -------------------------------------------------------------------------
  // 13. Resistances
  // -------------------------------------------------------------------------
  // Fighter class bonus: +15% to all resistances
  const allEleBonus = u('increasedAllElementalResistances') + (bonus('fighter') ? 15 : 0)

  // Chieftain class bonus: +5% to maximum fire resistance
  const maxFireRes    = bonus('chieftain') ? 80 : 75
  const fireRes       = Math.min(maxFireRes, allEleBonus)
  const coldRes       = Math.min(75, allEleBonus)
  const lightningRes  = Math.min(75, allEleBonus)
  const chaosRes      = Math.min(75, u('increasedChaosResistance') + allEleBonus)

  // -------------------------------------------------------------------------
  // 14. Offense — accuracy
  // -------------------------------------------------------------------------
  // Rogue class bonus: +150 to accuracy rating
  const accuracy = Math.round(
    (BASE_GAME_STATS.baseAccuracy + (bonus('rogue') ? 150 : 0))
    * (1 + u('increasedAccuracyRating') / 100)
  )

  // -------------------------------------------------------------------------
  // 15. Offense — hit damage
  // -------------------------------------------------------------------------
  const hitDamageMin = Math.round(BASE_GAME_STATS.baseHitDamageMin + eq.flatDamageMin)
  const hitDamageMax = Math.round(BASE_GAME_STATS.baseHitDamageMax + eq.flatDamageMax)

  // -------------------------------------------------------------------------
  // 16. Critical hit chance
  // -------------------------------------------------------------------------
  // Base 5.1% + 2% per 10 DEX (doubled for guardian) + Assassin +8% + upgrades
  const critFromDex      = (dex * attrCritMult * 2) / 100  // percentage points
  const critFromAssassin = bonus('assassin') ? 8 : 0
  const critFromUpgrades = u('increasedCriticalHitChance') + u('increasedAttackCriticalHitChance')
  // Upgrades are "increased" — multiply the base; additive flat bonuses applied separately
  const critChance = Math.min(
    95,
    BASE_GAME_STATS.baseCritChance * (1 + critFromUpgrades / 100)
    + critFromDex
    + critFromAssassin
    + eq.critChanceBonus
  )

  const critMultiplier = BASE_GAME_STATS.critMultiplier

  // -------------------------------------------------------------------------
  // 17. Attacks per second
  // -------------------------------------------------------------------------
  const totalIncreasedAtk = u('increasedAttackSpeed') + u('increasedAttackSpeedAndCastSpeed')
  // Rogue class bonus: 10% more APS (multiplicative)
  const rogueMult = bonus('rogue') ? 1.10 : 1.0
  const aps = BASE_GAME_STATS.baseAps * (1 + totalIncreasedAtk / 100) * rogueMult

  // -------------------------------------------------------------------------
  // 18. Mana cost per attack
  // -------------------------------------------------------------------------
  // Sorcerer class bonus: 10% reduced mana cost of abilities
  const manaCostPerAttack = BASE_GAME_STATS.baseManaPerAttack * (bonus('sorcerer') ? 0.90 : 1.0)

  // -------------------------------------------------------------------------
  // 19. Mana regeneration
  // -------------------------------------------------------------------------
  // Base: 2.5% of max mana per second
  const baseManaRegen  = maxMana * (BASE_GAME_STATS.baseManaRegenPercent / 100)
  // Druid class bonus: regenerate an additional 2% of max mana per second
  const druidRegenBonus = bonus('druid') ? maxMana * 0.02 : 0
  const manaRegenPerSecond = (baseManaRegen + druidRegenBonus) * (1 + u('increasedManaRegeneration') / 100)

  // -------------------------------------------------------------------------
  // 20. Damage modifiers
  // -------------------------------------------------------------------------
  const meleeDmgFromStr    = str / 10                        // 1% increased melee damage per 10 str
  const spellDmgFromInt    = int_ / 10                       // 1% increased spell damage per 10 int

  const increasedMeleeDamage    = u('increasedMeleeDamage')    + meleeDmgFromStr
  const increasedAttackDamage   = u('increasedAttackDamage')
  const increasedSpellDamage    = u('increasedSpellDamage')    + spellDmgFromInt
  const increasedElementalDamage= u('increasedElementalDamage') + u('increasedElementalDamageWithAttacks')
  const increasedDamage         = u('increasedDamage')
  const damageOverTimeMultiplier= u('increasedDamageOverTimeMultiplier')

  // -------------------------------------------------------------------------
  // 21. Average hit and DPS
  // -------------------------------------------------------------------------
  const avgHit               = (hitDamageMin + hitDamageMax) / 2
  const avgEffectiveDamage   = avgHit * (1 + (critChance / 100) * (critMultiplier - 1))
  const dps                  = avgEffectiveDamage * aps

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

  // Arcanist class bonus: 50% increased post-encounter ES recovery
  const esRecoveryPct = BASE_GAME_STATS.baseEsRecoveryAfterEncounterPct
    * (bonus('arcanist') ? 1.50 : 1.0)

  // -------------------------------------------------------------------------
  // 23. Ailment bonuses
  // -------------------------------------------------------------------------
  const bleedChance              = u('increasedChanceToInflictBleedingWithAttacks')
  const poisonChance             = u('increasedChanceToInflictPoisonWithAttacks')
  const elementalAilmentChance   = u('increasedChanceToInflictElementalAilments')
  const ailmentDurationBonus     = u('increasedAilmentDuration')

  // -------------------------------------------------------------------------
  // 24. Combat modifier flags
  // -------------------------------------------------------------------------
  // Barbarian class bonus: +10% chance to deal double damage with attacks
  // Destroyer class bonus: +25% chance to deal double damage with attacks
  const doubleDamageChance = (bonus('barbarian') ? 10 : 0) + (bonus('destroyer') ? 25 : 0)

  // Barbarian class bonus: hits ignore 50% of enemy armor
  const armorIgnorePercent = bonus('barbarian') ? 50 : 0

  // Druid class bonus: 25% of damage taken applied to mana first (while above 50% mana)
  const manaShieldActive = bonus('druid')

  // Arcanist class bonus: chaos damage does not bypass energy shield
  const chaosNotBypassES = bonus('arcanist')

  // Armor effectiveness vs elemental damage:
  //   Default: 50% effective → multiplier 0.5
  //   Juggernaut: +50% → multiplier 1.0 (full effectiveness)
  const armorVsElementalMultiplier = 0.5 + (bonus('juggernaut') ? 0.5 : 0)

  // Armor effectiveness vs chaos damage:
  //   Default: 25% effective → multiplier 0.25
  //   Juggernaut: +25% → 0.50
  //   Templar:    +50% → 0.75 (stacks with juggernaut → 1.00)
  //   Chieftain:  +50% → can combine with others (capped logic left to battle engine)
  const armorVsChaosMultiplier =
    0.25
    + (bonus('juggernaut') ? 0.25 : 0)
    + (bonus('templar')    ? 0.50 : 0)
    + (bonus('chieftain')  ? 0.50 : 0)

  // -------------------------------------------------------------------------
  // 25. Class levels active (for display)
  // -------------------------------------------------------------------------
  const classLevelsActive: Record<string, number> = {}
  for (const cls of GAME_CLASSES) {
    const lvl = getClassLevel(cls.id, config.upgradeLevels)
    if (lvl > 0) classLevelsActive[cls.id] = lvl
  }

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
    armor,
    evasionRating,
    blockChance,
    dodgeChance,

    // Resistances
    fireRes,
    coldRes,
    lightningRes,
    chaosRes,
    maxFireRes,

    // Offense
    hitDamageMin,
    hitDamageMax,
    aps,
    manaCostPerAttack,
    accuracy,
    critChance,
    critMultiplier,
    avgHit,
    avgEffectiveDamage,
    dps,

    // Recovery
    manaRegenPerSecond,
    lifeRecoveryPct,
    esRecoveryPct,

    // Ailments
    bleedChance,
    poisonChance,
    elementalAilmentChance,
    ailmentDurationBonus,

    // Damage modifiers
    increasedMeleeDamage,
    increasedAttackDamage,
    increasedSpellDamage,
    increasedElementalDamage,
    increasedDamage,
    damageOverTimeMultiplier,

    // Combat modifier flags
    doubleDamageChance,
    armorIgnorePercent,
    manaShieldActive,
    chaosNotBypassES,
    armorVsElementalMultiplier,
    armorVsChaosMultiplier,

    // Meta
    classBonusesActive,
    classLevelsActive,
  }
}
