export interface ClassBonusEffects {
  // Meta: debugging guardrail
  __unknownClauses?: string[]

  // Global sheet-style effects
  manaAsExtraBaseEsPercent?: number
  reducedManaCostPercent?: number
  flatAccuracy?: number
  moreAttackSpeedMult?: number
  moreCastSpeedMult?: number
  increasedPostEncounterLifeRecoveryPercent?: number
  allResistancesPercent?: number
  increasedExperienceGainPercent?: number

  flatMaxLife?: number
  increasedStrengthPercent?: number
  increasedRecoveryFromAllSourcesPercent?: number

  chaosDamageDoesNotBypassEnergyShield?: boolean
  increasedPostEncounterEnergyShieldRecoveryPercent?: number
  reducedPhysicalDamageTakenWhileYouHaveEnergyShieldPercent?: number

  damageTakenToManaFirstWhileAboveHalfManaPercent?: number
  manaRegenPercentOfMaxPerSecond?: number

  flatAllAttributes?: number
  doubledInherentBonusesFromAttributes?: boolean

  // Combat / simulation hooks
  zealotRollHigherOnHit?: boolean
  zealotRollLowerOnTakenHit?: boolean

  armourEffectivenessAgainstElementalBonus?: number
  armourEffectivenessAgainstChaosBonus?: number
  lifeRecoveredOnHitPercentOfPreventedDamage?: number

  doubleDamageChanceWithAttacks?: number
  armourIgnorePercent?: number

  reducedDamageTakenPerMissingLifePer4Percent?: boolean
  deathPreventionOncePerStage?: boolean

  flatStrAndDexPerMercenaryLevel?: number
  increasedAttackSpeedPercentPer10MinStrDex?: boolean

  startEncounterShockPercent?: number
  startEncounterChillPercent?: number

  evasionEffectivenessAgainstSpellsBonus?: number
  lessDamageTakenFirstTimeHitThisEncounterPercent?: number

  baseCritChanceBonusPercent?: number
  enemiesHaveLessEvasionAgainstCritPercent?: number

  enemiesTakeIncreasedDamagePercent?: number
  enemiesHaveLessSpeedPercent?: number
  enemiesDealLessDamagePercent?: number

  plusAllAbilitiesLevels?: number
  increasedAttunementEffectPercent?: number

  nonChaosDamageTakenBypassesEnergyShieldPercent?: number
  lifeRegenAppliesToEnergyShieldPercent?: number
  lifeRegenPercentOfMaxPerSecond?: number

  armourEffectivenessAgainstChaosBonus2?: number
  esRecoveredOnBlockPercentOfArmour?: number

  physicalDamageTakenAsFirePercent?: number
  maxFireResBonus?: number
  enemiesTakeIncreasedElementalDamagePercent?: number

  doubleDamageChanceWithAttacksBonus?: number
  tripleDamageChancePer2Double?: boolean

  lifeLeechPercentOfHitDamage?: number
  increasedDamageTakenPercent?: number
  moreMeleeAttackSpeedPerMissingLifePercent?: boolean

  maxBlockChanceBonus?: number
  enemiesTakeIncreasedDamagePerMissingCombinedLifeEsPercent?: boolean

  stageAttackCritChancePerNonCritHitPercent?: number
  stageAttackCritChancePerNonCritHitMaxPercent?: number
  stageMoreAttackSpeedPerCritHitPercent?: number
  stageMoreAttackSpeedPerCritHitMaxPercent?: number

  finalChanceToEvadeBonusPercent?: number
  lifeRecoveredOnEvadePercentOfEvasionRating?: number

  firstActionMoreDamagePercent?: number
  actionBarFilledOnEvadeOrDodgePercent?: number

  selfChillPercent?: number
  reverseChillEffectOnYou?: boolean
  reflectChillEffectsToEnemiesAtStart?: boolean

  maximumLifeIs1?: boolean
  moreEnergyShieldMult?: number
  increasedDamagePer100MaxEnergyShieldPercent?: number
}

export function emptyClassBonusEffects(): ClassBonusEffects {
  return {}
}

function norm(s: string): string {
  return (s || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normLower(s: string): string {
  return norm(s).toLowerCase()
}

function splitClauses(text: string): string[] {
  const t = norm(text)
  if (!t) return []
  return t
    .split(',')
    .map((c) => norm(c))
    .filter(Boolean)
}

export function parseClassBonusEffects(text: string): ClassBonusEffects {
  const fx: ClassBonusEffects = {}
  const unknown: string[] = []

  for (const rawClause of splitClauses(text)) {
    const c = normLower(rawClause)

    let m: RegExpMatchArray | null

    // "Gain 10% of mana as extra base energy shield"
    m = c.match(/^gain\s+(\d+(?:\.\d+)?)%\s+of\s+mana\s+as\s+extra\s+base\s+energy\s+shield$/i)
    if (m) { fx.manaAsExtraBaseEsPercent = Number(m[1]); continue }

    // "10% reduced mana cost of abilities"
    m = c.match(/^(\d+(?:\.\d+)?)%\s+reduced\s+mana\s+cost\s+of\s+abilities$/i)
    if (m) { fx.reducedManaCostPercent = Number(m[1]); continue }

    // "+150 to accuracy rating"
    m = c.match(/^\+(\d+(?:\.\d+)?)\s+to\s+accuracy\s+rating$/i)
    if (m) { fx.flatAccuracy = (fx.flatAccuracy ?? 0) + Number(m[1]); continue }

    // "10% more attack speed and cast speed"
    m = c.match(/^(\d+(?:\.\d+)?)%\s+more\s+attack\s+speed\s+and\s+cast\s+speed$/i)
    if (m) {
      const mult = 1 + Number(m[1]) / 100
      fx.moreAttackSpeedMult = (fx.moreAttackSpeedMult ?? 1) * mult
      fx.moreCastSpeedMult = (fx.moreCastSpeedMult ?? 1) * mult
      continue
    }

    // "100% increased post-encounter life recovery"
    m = c.match(/^(\d+(?:\.\d+)?)%\s+increased\s+post-encounter\s+life\s+recovery$/i)
    if (m) { fx.increasedPostEncounterLifeRecoveryPercent = Number(m[1]); continue }

    // "+15% to all resistances"
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+all\s+resistances$/i)
    if (m) { fx.allResistancesPercent = (fx.allResistancesPercent ?? 0) + Number(m[1]); continue }

    // "5% increased experience gain"
    m = c.match(/^(\d+(?:\.\d+)?)%\s+increased\s+experience\s+gain$/i)
    if (m) { fx.increasedExperienceGainPercent = Number(m[1]); continue }

    // "+100 to maximum life"
    m = c.match(/^\+(\d+(?:\.\d+)?)\s+to\s+maximum\s+life$/i)
    if (m) { fx.flatMaxLife = (fx.flatMaxLife ?? 0) + Number(m[1]); continue }

    // "15% increased strength"
    m = c.match(/^(\d+(?:\.\d+)?)%\s+increased\s+strength$/i)
    if (m) { fx.increasedStrengthPercent = (fx.increasedStrengthPercent ?? 0) + Number(m[1]); continue }

    // "25% increased recovery from all sources"
    m = c.match(/^(\d+(?:\.\d+)?)%\s+increased\s+recovery\s+from\s+all\s+sources$/i)
    if (m) { fx.increasedRecoveryFromAllSourcesPercent = (fx.increasedRecoveryFromAllSourcesPercent ?? 0) + Number(m[1]); continue }

    // "Chaos damage does not bypass your energy shield"
    if (c === 'chaos damage does not bypass your energy shield') {
      fx.chaosDamageDoesNotBypassEnergyShield = true
      continue
    }

    // "50% increased post-encounter energy shield recovery"
    m = c.match(/^(\d+(?:\.\d+)?)%\s+increased\s+post-encounter\s+energy\s+shield\s+recovery$/i)
    if (m) { fx.increasedPostEncounterEnergyShieldRecoveryPercent = Number(m[1]); continue }

    // "Take 15% reduced physical damage while you have energy shield"
    m = c.match(/^take\s+(\d+(?:\.\d+)?)%\s+reduced\s+physical\s+damage\s+while\s+you\s+have\s+energy\s+shield$/i)
    if (m) { fx.reducedPhysicalDamageTakenWhileYouHaveEnergyShieldPercent = Number(m[1]); continue }

    // "While above 50% of maximum mana 25% of damage taken is applied to your mana first"
    m = c.match(/^while\s+above\s+50%\s+of\s+maximum\s+mana\s+(\d+(?:\.\d+)?)%\s+of\s+damage\s+taken\s+is\s+applied\s+to\s+your\s+mana\s+first$/i)
    if (m) { fx.damageTakenToManaFirstWhileAboveHalfManaPercent = Number(m[1]); continue }

    // "Regenerate 2% of maximum mana per second"
    m = c.match(/^regenerate\s+(\d+(?:\.\d+)?)%\s+of\s+maximum\s+mana\s+per\s+second$/i)
    if (m) { fx.manaRegenPercentOfMaxPerSecond = Number(m[1]); continue }

    // "+30 to all attributes"
    m = c.match(/^\+(\d+(?:\.\d+)?)\s+to\s+all\s+attributes$/i)
    if (m) { fx.flatAllAttributes = (fx.flatAllAttributes ?? 0) + Number(m[1]); continue }

    // "The inherent bonuses gained from attributes are doubled"
    if (c === 'the inherent bonuses gained from attributes are doubled') {
      fx.doubledInherentBonusesFromAttributes = true
      continue
    }

    // Zealot roll-twice effects
    if (c === 'when you hit an enemy your base damage is rolled twice and the higher result is used') {
      fx.zealotRollHigherOnHit = true
      continue
    }
    if (c === 'when you are hit by an enemy their base damage is rolled twice and the lower result is used') {
      fx.zealotRollLowerOnTakenHit = true
      continue
    }

    // Juggernaut
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+armou?r\s+effectiveness\s+against\s+elemental\s+damage$/i)
    if (m) { fx.armourEffectivenessAgainstElementalBonus = Number(m[1]) / 100; continue }
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+armou?r\s+effectiveness\s+against\s+chaos\s+damage$/i)
    if (m) { fx.armourEffectivenessAgainstChaosBonus = Number(m[1]) / 100; continue }
    m = c.match(/^when\s+hit\s+recover\s+life\s+equal\s+to\s+(\d+(?:\.\d+)?)%\s+of\s+prevented\s+damage$/i)
    if (m) { fx.lifeRecoveredOnHitPercentOfPreventedDamage = Number(m[1]); continue }

    // Barbarian
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+attacks$/i)
    if (m) { fx.doubleDamageChanceWithAttacks = (fx.doubleDamageChanceWithAttacks ?? 0) + Number(m[1]); continue }
    m = c.match(/^hits\s+ignore\s+(\d+(?:\.\d+)?)%\s+of\s+enemy\s+armou?r$/i)
    if (m) { fx.armourIgnorePercent = (fx.armourIgnorePercent ?? 0) + Number(m[1]); continue }

    // Champion
    if (c === 'take 1% reduced damage per 4% missing life') {
      fx.reducedDamageTakenPerMissingLifePer4Percent = true
      continue
    }
    if (c === 'once per stage if you would die your life is set to 1 instead') {
      fx.deathPreventionOncePerStage = true
      continue
    }

    // Mercenary
    m = c.match(/^\+(\d+(?:\.\d+)?)\s+to\s+strength\s+and\s+dexterity\s+per\s+class\s+level$/i)
    if (m) { fx.flatStrAndDexPerMercenaryLevel = Number(m[1]); continue }
    if (c === '1% increased attack speed per 10 strength or dexterity whichever is lower') {
      fx.increasedAttackSpeedPercentPer10MinStrDex = true
      continue
    }

    // Windrunner
    m = c.match(/^permanently\s+inflict\s+(\d+(?:\.\d+)?)%\s+shock\s+and\s+(\d+(?:\.\d+)?)%\s+chill\s+on\s+enemies\s+at\s+the\s+beginning\s+of\s+an\s+encounter$/i)
    if (m) { fx.startEncounterShockPercent = Number(m[1]); fx.startEncounterChillPercent = Number(m[2]); continue }

    // Pathfinder
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+evasion\s+effectiveness\s+against\s+hits\s+from\s+spells$/i)
    if (m) { fx.evasionEffectivenessAgainstSpellsBonus = Number(m[1]) / 100; continue }
    m = c.match(/^take\s+(\d+(?:\.\d+)?)%\s+less\s+damage\s+the\s+first\s+time\s+you\s+are\s+hit\s+during\s+an\s+encounter$/i)
    if (m) { fx.lessDamageTakenFirstTimeHitThisEncounterPercent = Number(m[1]); continue }

    // Assassin
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+base\s+critical\s+hit\s+chance$/i)
    if (m) { fx.baseCritChanceBonusPercent = Number(m[1]); continue }
    m = c.match(/^enemies\s+have\s+(\d+(?:\.\d+)?)%\s+less\s+evasion\s+rating\s+against\s+critical\s+hits$/i)
    if (m) { fx.enemiesHaveLessEvasionAgainstCritPercent = Number(m[1]); continue }

    // Trickster
    m = c.match(/^enemies\s+take\s+(\d+(?:\.\d+)?)%\s+increased\s+damage$/i)
    if (m) { fx.enemiesTakeIncreasedDamagePercent = Number(m[1]); continue }
    m = c.match(/^enemies\s+have\s+(\d+(?:\.\d+)?)%\s+less\s+speed$/i)
    if (m) { fx.enemiesHaveLessSpeedPercent = Number(m[1]); continue }
    m = c.match(/^enemies\s+deal\s+(\d+(?:\.\d+)?)%\s+less\s+damage$/i)
    if (m) { fx.enemiesDealLessDamagePercent = Number(m[1]); continue }

    // Archmage
    m = c.match(/^\+(\d+(?:\.\d+)?)\s+to\s+the\s+level\s+of\s+all\s+abilities$/i)
    if (m) { fx.plusAllAbilitiesLevels = Number(m[1]); continue }
    m = c.match(/^(\d+(?:\.\d+)?)%\s+increased\s+effect\s+of\s+attunement\s+modifiers\s+from\s+abilities$/i)
    if (m) { fx.increasedAttunementEffectPercent = Number(m[1]); continue }

    // Ascendant
    m = c.match(/^(\d+(?:\.\d+)?)%\s+of\s+non-chaos\s+damage\s+taken\s+bypasses\s+your\s+energy\s+shield$/i)
    if (m) { fx.nonChaosDamageTakenBypassesEnergyShieldPercent = Number(m[1]); continue }
    m = c.match(/^(\d+(?:\.\d+)?)%\s+of\s+life\s+regeneration\s+per\s+second\s+also\s+applies\s+to\s+your\s+energy\s+shield$/i)
    if (m) { fx.lifeRegenAppliesToEnergyShieldPercent = Number(m[1]); continue }
    m = c.match(/^regenerate\s+(\d+(?:\.\d+)?)%\s+of\s+life\s+per\s+second$/i)
    if (m) { fx.lifeRegenPercentOfMaxPerSecond = Number(m[1]); continue }

    // Templar
    m = c.match(/^recover\s+energy\s+shield\s+equal\s+to\s+(\d+(?:\.\d+)?)%\s+of\s+armou?r\s+when\s+you\s+block$/i)
    if (m) { fx.esRecoveredOnBlockPercentOfArmour = Number(m[1]); continue }

    // Chieftain
    m = c.match(/^take\s+(\d+(?:\.\d+)?)%\s+of\s+physical\s+damage\s+as\s+fire\s+damage$/i)
    if (m) { fx.physicalDamageTakenAsFirePercent = Number(m[1]); continue }
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+fire\s+resistance$/i)
    if (m) { fx.maxFireResBonus = Number(m[1]); continue }
    m = c.match(/^enemies\s+take\s+(\d+(?:\.\d+)?)%\s+increased\s+elemental\s+damage$/i)
    if (m) { fx.enemiesTakeIncreasedElementalDamagePercent = Number(m[1]); continue }

    // Destroyer
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+attacks$/i)
    if (m) { fx.doubleDamageChanceWithAttacksBonus = Number(m[1]); continue }
    if (c === '+1% chance to deal triple damage with attacks per 2% chance to deal double damage with attacks') {
      fx.tripleDamageChancePer2Double = true
      continue
    }

    // Berserker
    m = c.match(/^leech\s+(\d+(?:\.\d+)?)%\s+of\s+hit\s+damage\s+as\s+life$/i)
    if (m) { fx.lifeLeechPercentOfHitDamage = Number(m[1]); continue }
    m = c.match(/^take\s+(\d+(?:\.\d+)?)%\s+increased\s+damage$/i)
    if (m) { fx.increasedDamageTakenPercent = Number(m[1]); continue }
    if (c === '1% more melee attack speed per 1% missing life') {
      fx.moreMeleeAttackSpeedPerMissingLifePercent = true
      continue
    }

    // Dragoon
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+chance\s+to\s+block$/i)
    if (m) { fx.maxBlockChanceBonus = Number(m[1]); continue }
    if (c === 'enemies take 1% increased damage per 1% missing combined life and energy shield') {
      fx.enemiesTakeIncreasedDamagePerMissingCombinedLifeEsPercent = true
      continue
    }

    // Dervish
    m = c.match(
      /^during\s+a\s+stage\s+gain\s+(\d+(?:\.\d+)?)%\s+increased\s+attack\s+critical\s+hit\s+chance\s+per\s+non-critical\s+hit\s+dealt\s+up\s+to\s+(\d+(?:\.\d+)?)%\s+and\s+(\d+(?:\.\d+)?)%\s+more\s+attack\s+speed\s+per\s+critical\s+hit\s+dealt\s+up\s+to\s+(\d+(?:\.\d+)?)%$/i
    )
    if (m) {
      fx.stageAttackCritChancePerNonCritHitPercent = Number(m[1])
      fx.stageAttackCritChancePerNonCritHitMaxPercent = Number(m[2])
      fx.stageMoreAttackSpeedPerCritHitPercent = Number(m[3])
      fx.stageMoreAttackSpeedPerCritHitMaxPercent = Number(m[4])
      continue
    }

    // Mirage
    m = c.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+final\s+chance\s+to\s+evade$/i)
    if (m) { fx.finalChanceToEvadeBonusPercent = Number(m[1]); continue }
    m = c.match(/^recover\s+life\s+equal\s+to\s+(\d+(?:\.\d+)?)%\s+of\s+evasion\s+rating\s+when\s+you\s+evade$/i)
    if (m) { fx.lifeRecoveredOnEvadePercentOfEvasionRating = Number(m[1]); continue }

    // Shadow
    m = c.match(/^the\s+first\s+attack\s+or\s+spell\s+cast\s+during\s+an\s+encounter\s+deals\s+(\d+(?:\.\d+)?)%\s+more\s+damage$/i)
    if (m) { fx.firstActionMoreDamagePercent = Number(m[1]); continue }
    m = c.match(/^your\s+action\s+bar\s+is\s+filled\s+by\s+(\d+(?:\.\d+)?)%\s+when\s+you\s+evade\s+or\s+dodge$/i)
    if (m) { fx.actionBarFilledOnEvadeOrDodgePercent = Number(m[1]); continue }

    // Reaper
    m = c.match(/^permanently\s+inflict\s+(\d+(?:\.\d+)?)%\s+chill\s+on\s+yourself$/i)
    if (m) { fx.selfChillPercent = Number(m[1]); continue }
    if (c === 'the effect of chill on you is reversed') {
      fx.reverseChillEffectOnYou = true
      continue
    }
    if (c === 'at the beginning of an encounter chill effects on you are reflected to enemies') {
      fx.reflectChillEffectsToEnemiesAtStart = true
      continue
    }

    // Occultist
    if (c === 'your maximum life is 1') { fx.maximumLifeIs1 = true; continue }
    m = c.match(/^(\d+(?:\.\d+)?)%\s+more\s+energy\s+shield$/i)
    if (m) { fx.moreEnergyShieldMult = 1 + Number(m[1]) / 100; continue }
    m = c.match(/^deal\s+(\d+(?:\.\d+)?)%\s+increased\s+damage\s+per\s+(\d+(?:\.\d+)?)\s+maximum\s+energy\s+shield$/i)
    if (m && Number(m[2]) !== 0) {
      // Store as "per 100" style since UI already uses that idiom.
      fx.increasedDamagePer100MaxEnergyShieldPercent = Number(m[1]) * (100 / Number(m[2]))
      continue
    }

    unknown.push(rawClause)
  }

  if (unknown.length) fx.__unknownClauses = unknown
  return fx
}

