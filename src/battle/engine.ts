import {
  computeArmourDR,
  computeArmourDRSingleType,
  computeEvasionChancePercent,
  computeNonDamagingAilmentEffectPercent,
  getBaseShockChillDurationSec,
} from '../data/eocFormulas'
import { FORMULA_CONSTANTS } from '../data/formulaConstants'
import type { ComputedBuildStats } from '../data/gameStats'
import {
  applyEnemyModifiersWithTiersToScaledEnemy,
  enemyModifierRefLifeForRegen,
  type EnemyModifierId,
} from '../data/enemyModifiers'
import {
  DEFAULT_BLOCK_DAMAGE_TAKEN_MULT,
  type BattleContext,
  type BattleLogEntry,
  type BattleParticipantState,
  type DemoEnemyDef,
  type EncounterResult,
  type EncounterTimelinePoint,
  type EnemyDebuffEvent,
  type PlayerAilmentSummary,
} from './types'

type DotKind = 'bleed' | 'poison' | 'ignite'

interface DotInstance {
  kind: DotKind
  dps: number
  expiresAt: number
  /** For “ignite does not deal damage over its duration” style effects. */
  burstDamageOnExpire?: number
  /** If true, expiring this ignite also removes and bursts all ignites. */
  burstClearsAllIgnites?: boolean
}

interface NonDotAilmentInstance {
  magnitudePct: number
  expiresAt: number
}

interface EnemyAilmentRuntime {
  dots: DotInstance[]
  /** Stacking shock instances; total capped at 50% increased damage taken. */
  shocks: NonDotAilmentInstance[]
  /** Stacking chill instances; total chill% capped at 30. */
  chills: NonDotAilmentInstance[]
}

interface PlayerAilmentRuntime {
  bleeds: { expiresAt: number; dps: number }[]
  poisons: { expiresAt: number; dps: number }[]
  ignites: { expiresAt: number; dps: number }[]
  igniteUntil: number
  shock: NonDotAilmentInstance | null
  chill: NonDotAilmentInstance | null
}

interface HitDamageByType {
  physical: number
  fire: number
  cold: number
  lightning: number
  chaos: number
}

function applyDamageToEnemyPools(
  enemyState: { life: number; energyShield: number; mana?: number },
  amount: number,
  enemy?: DemoEnemyDef
): number {
  if (amount <= 0) return 0
  let remaining = amount
  if (enemy) {
    const maxMana = Math.max(0, enemy.maxMana ?? 0)
    let mana = Math.max(0, enemyState.mana ?? 0)
    const manaFirstPct = Math.min(100, Math.max(0, enemy.damageTakenToManaFirstPercent ?? 0))
    if (manaFirstPct > 0 && mana > 0 && remaining > 0) {
      const wantMana = remaining * (manaFirstPct / 100)
      const fromMana = Math.min(wantMana, mana)
      mana -= fromMana
      remaining -= fromMana
    }
    if ((enemy.manaShieldActive ?? false) && maxMana > 0 && mana > maxMana * 0.5 && remaining > 0) {
      const portion = remaining * 0.25
      const fromMana = Math.min(portion, mana)
      mana -= fromMana
      remaining -= fromMana
    }
    enemyState.mana = mana
  }
  if (enemyState.energyShield > 0) {
    const takenEs = Math.min(enemyState.energyShield, remaining)
    enemyState.energyShield -= takenEs
    remaining -= takenEs
  }
  if (remaining > 0) {
    const takenLife = Math.min(enemyState.life, remaining)
    enemyState.life -= takenLife
    remaining -= takenLife
  }
  return amount - remaining
}

function avgHitByDamageType(stats: ComputedBuildStats): {
  physical: number
  fire: number
  cold: number
  lightning: number
  chaos: number
  total: number
} {
  let physical = 0
  let fire = 0
  let cold = 0
  let lightning = 0
  let chaos = 0
  for (const r of stats.hitDamageByType) {
    const m = (r.min + r.max) / 2
    if (r.type === 'physical') physical = m
    else if (r.type === 'fire') fire = m
    else if (r.type === 'cold') cold = m
    else if (r.type === 'lightning') lightning = m
    else if (r.type === 'chaos') chaos = m
  }
  const total = physical + fire + cold + lightning + chaos
  return { physical, fire, cold, lightning, chaos, total }
}

/** Split mitigated hit damage by sheet damage-type averages (for ailment base damage). */
function damagePortionsFromHit(
  stats: ComputedBuildStats,
  mitigatedHitDamage: number
): { physical: number; fire: number; cold: number; lightning: number; chaos: number } {
  const a = avgHitByDamageType(stats)
  if (a.total <= 0) {
    return {
      physical: mitigatedHitDamage,
      fire: 0,
      cold: 0,
      lightning: 0,
      chaos: 0,
    }
  }
  const f = mitigatedHitDamage / a.total
  return {
    physical: a.physical * f,
    fire: a.fire * f,
    cold: a.cold * f,
    lightning: a.lightning * f,
    chaos: a.chaos * f,
  }
}

function rollDamage(min: number, max: number, rollTwiceHigh: boolean): number {
  const span = Math.max(0, max - min)
  let v = min + Math.random() * span
  if (rollTwiceHigh) {
    const v2 = min + Math.random() * span
    v = Math.max(v, v2)
  }
  return v
}


function mitigatedPlayerHitVsArmour(
  enemy: DemoEnemyDef,
  stats: ComputedBuildStats,
  raw: number,
  /** Extra flat fire before armour/resists (e.g. Siegebreaker counter), included in armour hit total. */
  extraFireFlat = 0,
  /** Optional per-type multipliers applied before armour/resists (e.g. stateful "more" by type). */
  preMitigationTypeMult?: Partial<{ physical: number; fire: number; cold: number; lightning: number; chaos: number }>
): { total: number; details: any } {
  const armourIgnoredFrac = stats.armourIgnorePercent / 100
  const baseArmour = enemy.armour
  const elePen = stats.elementalPenetrationPercent ?? 0
  const zone = Math.max(1, Math.floor(enemy.zone ?? 1))
  const C = FORMULA_CONSTANTS
  const zoneEleResBonus = Math.min(C.enemyEleResMax, Math.max(0, (zone - 1) * C.enemyEleResPerZone))

  // Split raw hit into per-type amounts using current fractions
  const a = avgHitByDamageType(stats)
  const total = Math.max(1, a.total)
  const physMult = preMitigationTypeMult?.physical ?? 1
  const fireMult = preMitigationTypeMult?.fire ?? 1
  const coldMult = preMitigationTypeMult?.cold ?? 1
  const lightMult = preMitigationTypeMult?.lightning ?? 1
  const chaosMult = preMitigationTypeMult?.chaos ?? 1
  const physAmt  = raw * (a.physical  / total) * physMult
  const fireAmt  = raw * (a.fire      / total) * fireMult + extraFireFlat
  const coldAmt  = raw * (a.cold      / total) * coldMult
  const lightAmt = raw * (a.lightning / total) * lightMult
  const chaosAmt = raw * (a.chaos     / total) * chaosMult
  const hitTotal = physAmt + fireAmt + coldAmt + lightAmt + chaosAmt

  // Apply armour DR per type using the full multi-type formula (ARMOUR_RESISTANCE splits armour)
  function afterArmour(amt: number, type: Parameters<typeof computeArmourDR>[3]): { after: number; dr: number } {
    if (amt <= 0) return { after: 0, dr: 0 }
    const dr = computeArmourDR(baseArmour, amt, hitTotal, type, armourIgnoredFrac)
    return { after: amt * (1 - dr), dr }
  }

  const physArm  = afterArmour(physAmt,  'physical')
  const fireArm  = afterArmour(fireAmt,  'fire')
  const coldArm  = afterArmour(coldAmt,  'cold')
  const lightArm = afterArmour(lightAmt, 'lightning')
  const chaosArm = afterArmour(chaosAmt, 'chaos')

  let physOut  = physArm.after
  let fireOut  = fireArm.after
  let coldOut  = coldArm.after
  let lightOut = lightArm.after
  let chaosOut = chaosArm.after

  // Apply resistances (optionally mirrored to player resists)
  const enemyFire = stats.enemyResistancesEqualToYours ? stats.fireRes : (enemy.fireResistancePercent ?? 0) + zoneEleResBonus
  const enemyCold = stats.enemyResistancesEqualToYours ? stats.coldRes : (enemy.coldResistancePercent ?? 0) + zoneEleResBonus
  const enemyLight = stats.enemyResistancesEqualToYours ? stats.lightningRes : (enemy.lightningResistancePercent ?? 0) + zoneEleResBonus
  const enemyChaos = stats.enemyResistancesEqualToYours ? stats.chaosRes : (enemy.chaosResistancePercent ?? 0)

  // Enemy resistances can go below 0 (taking more damage), but are capped at -90%..+90%.
  const capRes = (r: number) => Math.max(-90, Math.min(90, r))
  const fr = capRes(enemyFire - (stats.firePenetrationPercent ?? 0) - elePen)
  const cr = capRes(enemyCold - (stats.coldPenetrationPercent ?? 0) - elePen)
  const lr = capRes(enemyLight - (stats.lightningPenetrationPercent ?? 0) - elePen)
  const chr = capRes(enemyChaos - (stats.chaosPenetrationPercent ?? 0))

  fireOut  *= 1 - fr  / 100
  coldOut  *= 1 - cr  / 100
  lightOut *= 1 - lr  / 100
  chaosOut *= 1 - chr / 100

  // Chieftain: enemies take 40% increased elemental damage.
  if (stats.classBonusesActive.includes('chieftain')) {
    fireOut *= 1.4
    coldOut *= 1.4
    lightOut *= 1.4
  }

  const totalOut = physOut + fireOut + coldOut + lightOut + chaosOut
  return {
    total: totalOut,
    details: {
      kind: 'player_hit_mitigation',
      inputs: {
        raw,
        extraFireFlat,
        enemyArmour: baseArmour,
        armourIgnoredFrac,
        zone,
        zoneEleResBonus,
        penetration: {
          elementalPen: elePen,
          firePen: stats.firePenetrationPercent ?? 0,
          coldPen: stats.coldPenetrationPercent ?? 0,
          lightningPen: stats.lightningPenetrationPercent ?? 0,
          chaosPen: stats.chaosPenetrationPercent ?? 0,
        },
      },
      split: {
        fractions: { ...a },
        hitTotal,
        rawByType: { physical: physAmt, fire: fireAmt, cold: coldAmt, lightning: lightAmt, chaos: chaosAmt },
      },
      armourDR: {
        physical: physArm.dr,
        fire: fireArm.dr,
        cold: coldArm.dr,
        lightning: lightArm.dr,
        chaos: chaosArm.dr,
      },
      afterArmour: {
        physical: physArm.after,
        fire: fireArm.after,
        cold: coldArm.after,
        lightning: lightArm.after,
        chaos: chaosArm.after,
      },
      resist: {
        enemyBase: { fire: enemyFire, cold: enemyCold, lightning: enemyLight, chaos: enemyChaos },
        afterPenCapped: { fire: fr, cold: cr, lightning: lr, chaos: chr },
      },
      afterRes: { physical: physOut, fire: fireOut, cold: coldOut, lightning: lightOut, chaos: chaosOut },
      total: totalOut,
    },
  }
}

function enemyApsMultiplier(stats: ComputedBuildStats): number {
  let m = 1
  if (stats.classBonusesActive.includes('trickster')) m *= 1 - 0.05
  if ((stats.enemiesMoreSpeedMultiplier ?? 1) !== 1) m *= stats.enemiesMoreSpeedMultiplier ?? 1
  return m
}

function enemyDamageTakenMultiplier(stats: ComputedBuildStats, enemyLifeFrac: number): number {
  let m = 1
  // Trickster (+10%) and gear “enemies take increased damage” are baked into hitDamageMin/Max in computeBuildStats.
  if (stats.classBonusesActive.includes('dragoon')) {
    const missing = 1 - enemyLifeFrac
    m *= 1 + missing
  }
  return m
}

function flatEvasionFromClassBonuses(stats: ComputedBuildStats): number {
  return stats.classBonusesActive.includes('mirage') ? 5 : 0
}

function playerApsWithBerserker(stats: ComputedBuildStats, life: number): number {
  const base = stats.aps
  if (!stats.classBonusesActive.includes('berserker')) return base
  const missing = Math.max(0, 1 - life / Math.max(1, stats.maxLife))
  return base * (1 + missing)
}

function championDamageReductionFrac(stats: ComputedBuildStats, life: number): number {
  if (!stats.classBonusesActive.includes('champion')) return 0
  const missingPct = (1 - life / Math.max(1, stats.maxLife)) * 100
  return Math.floor(missingPct / 4) * 0.01
}

/** Demo: split physical hit after armour into elemental/chaos portions using player resists. */
function mitigatedPhysicalDamageAfterConversion(
  stats: ComputedBuildStats,
  afterArmourPhysical: number
): number {
  let d = Math.max(0, afterArmourPhysical)
  if (d <= 0) return 0

  let pChaos = Math.min(100, stats.physicalDamageTakenAsChaosPercent ?? 0)
  let pFire = Math.min(100, stats.physicalDamageTakenAsFirePercent ?? 0)
  let pCold = Math.min(100, stats.physicalDamageTakenAsColdPercent ?? 0)
  let pLight = Math.min(100, stats.physicalDamageTakenAsLightningPercent ?? 0)
  const sum = pChaos + pFire + pCold + pLight
  const scale = sum > 100 && sum > 0 ? 100 / sum : 1
  pChaos *= scale
  pFire *= scale
  pCold *= scale
  pLight *= scale

  const c = d * (pChaos / 100)
  const f = d * (pFire / 100)
  const co = d * (pCold / 100)
  const l = d * (pLight / 100)
  const physRem = Math.max(0, d - c - f - co - l)

  const resCap = (r: number,max:number) => Math.max(-0.9, Math.min(0.9, Math.min(r / 100, max / 100)))
  const chaosMitigated = c * (1 - resCap(stats.chaosRes, stats.maxChaosRes))
  const fireMitigated = f * (1 - resCap(stats.fireRes, stats.maxFireRes))
  const coldMitigated = co * (1 - resCap(stats.coldRes, stats.maxColdRes))
  const lightMitigated = l * (1 - resCap(stats.lightningRes, stats.maxLightningRes))
  return physRem + chaosMitigated + fireMitigated + coldMitigated + lightMitigated
}

function lifeRecoveryAllowed(player: BattleParticipantState, stats: ComputedBuildStats, maxLife: number): boolean {
  if (!(stats.cannotRecoverLifeWhileAboveHalfLife ?? false)) return true
  return player.life <= maxLife * 0.5
}

function applyOnKillRecovery(player: BattleParticipantState, stats: ComputedBuildStats, maxLife: number): void {
  const rec = stats.lifeRecoveryRateMult ?? 1
  if (lifeRecoveryAllowed(player, stats, maxLife)) {
    const pct = stats.lifeRecoveredOnKillPercent ?? 0
    if (pct > 0) {
      player.life = Math.min(
        maxLife,
        player.life + maxLife * (pct / 100) * rec
      )
    }
    const flatLife = stats.flatLifeOnKill ?? 0
    if (flatLife > 0) {
      player.life = Math.min(maxLife, player.life + flatLife * rec)
    }
  }
  const flatMana = stats.flatManaOnKill ?? 0
  if (flatMana > 0) {
    player.mana = Math.min(stats.maxMana, player.mana + flatMana)
  }
  const manaPct = stats.manaRecoveredOnKillPercent ?? 0
  if (manaPct > 0 && stats.maxMana > 0) {
    player.mana = Math.min(stats.maxMana, player.mana + stats.maxMana * (manaPct / 100))
  }
}

function applyBlockRecovery(
  player: BattleParticipantState,
  stats: ComputedBuildStats,
  blocked: boolean,
  maxLife: number
): void {
  if (!blocked) return
  const rec = stats.lifeRecoveryRateMult ?? 1
  if (lifeRecoveryAllowed(player, stats, maxLife)) {
    const lp = stats.lifeRecoveredOnBlockPercent ?? 0
    if (lp > 0) {
      player.life = Math.min(
        maxLife,
        player.life + maxLife * (lp / 100) * rec
      )
    }
    const flatL = stats.flatLifeOnBlock ?? 0
    if (flatL > 0) {
      player.life = Math.min(maxLife, player.life + flatL * rec)
    }
  }
  const mp = stats.manaRecoveredOnBlockPercent ?? 0
  if (mp > 0) {
    player.mana = Math.min(stats.maxMana, player.mana + stats.maxMana * (mp / 100))
  }
  const flatM = stats.flatManaOnBlock ?? 0
  if (flatM > 0) {
    player.mana = Math.min(stats.maxMana, player.mana + flatM)
  }
  const ep = stats.esRecoveredOnBlockPercent ?? 0
  if (ep > 0 && stats.maxEnergyShield > 0) {
    player.energyShield = Math.min(
      stats.maxEnergyShield,
      player.energyShield + stats.maxEnergyShield * (ep / 100)
    )
  }
  const flatE = stats.flatEsOnBlock ?? 0
  if (flatE > 0 && stats.maxEnergyShield > 0) {
    player.energyShield = Math.min(
      stats.maxEnergyShield,
      player.energyShield + flatE
    )
  }
}

function applyDamageToPools(
  state: BattleParticipantState,
  rawAfterArmour: number,
  stats: ComputedBuildStats,
  maxMana: number
): number {
  let dmg = Math.max(0, rawAfterArmour)

  const manaFirstPct = Math.min(100, Math.max(0, stats.damageTakenToManaFirstPercent ?? 0))
  if (manaFirstPct > 0 && state.mana > 0 && dmg > 0) {
    const wantMana = dmg * (manaFirstPct / 100)
    const fromMana = Math.min(wantMana, state.mana)
    state.mana -= fromMana
    dmg -= fromMana
  }

  if (stats.manaShieldActive && state.mana > maxMana * 0.5) {
    const portion = dmg * 0.25
    const fromMana = Math.min(portion, Math.max(0, state.mana))
    state.mana -= fromMana
    dmg -= fromMana
  }

  // Ascendant: 50% of non-chaos damage bypasses energy shield.
  // Demo model: apply the bypass fraction to all incoming damage (enemy hits are mostly non-chaos).
  if (stats.classBonusesActive.includes('ascendant') && dmg > 0) {
    const bypass = dmg * 0.5
    state.life -= bypass
    dmg -= bypass
  }

  if ((stats.energyShieldCannotBeReducedBelowMaximum ?? false) && stats.maxEnergyShield > 0) {
    // Simplified model: incoming damage cannot lower ES at all, so ES stays full and damage is prevented.
    return 0
  }

  if (stats.maxEnergyShield > 0 && state.energyShield > 0) {
    const toEs = Math.min(dmg, state.energyShield)
    state.energyShield -= toEs
    dmg -= toEs
  }

  state.life -= dmg
  return dmg
}

type PlayerHitOutcome = 'miss' | 'enemy_blocked' | 'hit'

function statefulMoreDamageMultByTypeFromPlayerPools(
  stats: ComputedBuildStats,
  player: BattleParticipantState
): { fire: number; chaos: number } {
  const fx = stats.abilityLineEffects
  if (!fx) return { fire: 1, chaos: 1 }

  let fire = 1
  let chaos = 1

  // Deal 1% more chaos damage per 1% missing combined life and energy shield (Dark Pact).
  // Planner baseline assumes full pools => missing% = 0 => baseline multiplier = 1.
  if ((fx.darkPactMoreChaosDamagePerMissingCombinedPct ?? 0) > 0) {
    const maxCombined = Math.max(0, (stats.maxLife ?? 0) + (stats.maxEnergyShield ?? 0))
    const curCombined = Math.max(0, (player.life ?? 0) + (player.energyShield ?? 0))
    const missingPct = maxCombined > 0 ? ((maxCombined - curCombined) / maxCombined) * 100 : 0
    chaos *= 1 + (missingPct * (fx.darkPactMoreChaosDamagePerMissingCombinedPct / 100))
  }

  // Deal 1% more fire damage per 40 combined current life and energy shield (Blazing Radiance).
  // Planner baseline assumes full pools at cast start, so we apply a ratio (now / baseline) to avoid double-counting.
  if ((fx.blazingRadianceMoreFireDamagePer40CombinedCurrentPct ?? 0) > 0) {
    const pct = fx.blazingRadianceMoreFireDamagePer40CombinedCurrentPct
    const combinedNow = Math.max(0, (player.life ?? 0) + (player.energyShield ?? 0))
    const combinedStart = Math.max(0, (stats.maxLife ?? 0) + (stats.maxEnergyShield ?? 0))
    const multNow = 1 + (combinedNow / 40) * (pct / 100)
    const multStart = 1 + (combinedStart / 40) * (pct / 100)
    fire *= multStart > 0 ? (multNow / multStart) : 1
  }

  return { fire: Math.max(0.01, fire), chaos: Math.max(0.01, chaos) }
}

function resolvePlayerAttack(
  enemy: DemoEnemyDef,
  enemyLife: number,
  stats: ComputedBuildStats,
  playerState: BattleParticipantState,
  attackOpts?: {
    targetTakesIncreasedDamagePct: number
    extraTargetTakesIncreasedDamagePct?: number
    moreDamageMult?: number
    /** Added to the first strike only (e.g. Siegebreaker counter fire). */
    extraFlatFireDamage?: number
  }
): {
  damage: number
  damageForAilments: number
  outcome: PlayerHitOutcome
  anyCrit: boolean
  anyDouble: boolean
  anyTriple: boolean
  anyQuad: boolean
  blockedPreventedTotal: number
} {
  const isSpellAttack = stats.abilityContribution?.type === 'Spells'
  const enemyEvaForHitCheck = isSpellAttack ? enemy.evasionRating / 2 : enemy.evasionRating
  const evadePct = stats.hitsCannotBeEvaded
    ? 0
    // Evasion is half as effective vs spells (enemy evasion treated as halved).
    : computeEvasionChancePercent(stats.accuracy, enemyEvaForHitCheck, 0)
  const miss = Math.random() * 100 < evadePct
  if (miss) {
    return {
      damage: 0,
      damageForAilments: 0,
      outcome: 'miss',
      anyCrit: false,
      anyDouble: false,
      anyTriple: false,
      anyQuad: false,
      blockedPreventedTotal: 0,
    }
  }

  const blk = enemy.blockChance ?? 0
  const zealot = stats.classBonusesActive.includes('zealot')
  const strikes =
    stats.abilityContribution?.type === 'Spells'
      ? Math.max(1, Math.round((stats.spellDamageComputationBreakdown as any)?.dps?.strikesPerCast ?? 1))
      : Math.max(1, stats.strikesPerAttack ?? 1)
  let total = 0
  let blockedStrikes = 0
  let anyCrit = false
  let anyDouble = false
  let anyTriple = false
  let anyQuad = false
  let blockedPreventedTotal = 0
  const strikeDetails: any[] = []

  for (let s = 0; s < strikes; s++) {
    const blocked = blk > 0 && Math.random() * 100 < blk
    if (blocked) blockedStrikes++

    let base = rollDamage(stats.hitDamageMin, stats.hitDamageMax, zealot)
    let extraFire = s === 0 ? Math.max(0, attackOpts?.extraFlatFireDamage ?? 0) : 0
    // Stateful "more" multipliers that depend on current in-combat pools.
    // IMPORTANT: apply per-type (not to the whole hit), and avoid double-counting multipliers already baked into
    // planner hit ranges. These are applied inside mitigation splitting.
    const statefulMoreByType = statefulMoreDamageMultByTypeFromPlayerPools(stats, playerState)
    if (blocked) {
      base *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
      extraFire *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
    }

    let isCrit = false
    let procMult = 1
    if (!blocked) {
      if (Math.random() * 100 < stats.critChance) {
        base *= stats.critMultiplier
        extraFire *= stats.critMultiplier
        isCrit = true
      }
      if (isCrit) anyCrit = true

      const tChance = stats.tripleDamageChance ?? 0
      if (stats.classBonusesActive.includes('destroyer')) {
        const tripleChance = stats.doubleDamageChance / 2
        if (Math.random() * 100 < tripleChance) {
          procMult = 3
          anyTriple = true
        } else if (Math.random() * 100 < stats.doubleDamageChance) {
          procMult = 2
          anyDouble = true
        }
      } else if (tChance > 0 && Math.random() * 100 < tChance) {
        procMult = 3
        anyTriple = true
      } else if (Math.random() * 100 < stats.doubleDamageChance) {
        // Damage proc chaining: if we "would deal double", allow upgrade to triple
        const up = stats.doubleDamageUpgradesToTripleChance ?? 0
        if (up > 0 && Math.random() * 100 < up) {
          procMult = 3
          anyTriple = true
        } else {
          procMult = 2
          anyDouble = true
        }
      }
      // Damage proc chaining: if we "would deal triple", allow upgrade to quadruple
      if (procMult === 3) {
        const up4 = stats.tripleDamageUpgradesToQuadrupleChance ?? 0
        if (up4 > 0 && Math.random() * 100 < up4) {
          procMult = 4
          anyQuad = true
        }
      }

      if (stats.dealNoDamageExceptCrit && !isCrit) {
        base = 0
        extraFire = 0
        procMult = 1
      }
    }

    base *= stats.damageDealtLessMult ?? 1
    extraFire *= stats.damageDealtLessMult ?? 1
    const frac = enemyLife / Math.max(1, enemy.maxLife)
    const takenMult = enemyDamageTakenMultiplier(stats, frac)
    base *= takenMult
    extraFire *= takenMult
    const shockPct = attackOpts?.targetTakesIncreasedDamagePct ?? 0
    if (shockPct > 0) {
      base *= 1 + shockPct / 100
      extraFire *= 1 + shockPct / 100
    }
    const extraInc = attackOpts?.extraTargetTakesIncreasedDamagePct ?? 0
    if (extraInc > 0) {
      base *= 1 + extraInc / 100
      extraFire *= 1 + extraInc / 100
    }
    const more = attackOpts?.moreDamageMult ?? 1
    if (more !== 1) {
      base *= more
      extraFire *= more
    }

    const mit = mitigatedPlayerHitVsArmour(enemy, stats, base, extraFire, {
      fire: statefulMoreByType.fire,
      chaos: statefulMoreByType.chaos,
    })
    const mitigatedBeforeProc = mit.total
    if (blocked) {
      const unblockedMit = mitigatedPlayerHitVsArmour(
        enemy,
        stats,
        base / DEFAULT_BLOCK_DAMAGE_TAKEN_MULT,
        extraFire / DEFAULT_BLOCK_DAMAGE_TAKEN_MULT,
        {
          fire: statefulMoreByType.fire,
          chaos: statefulMoreByType.chaos,
        }
      )
      blockedPreventedTotal += Math.max(0, unblockedMit.total - mitigatedBeforeProc)
    }
    const mitigatedAfterProc = mitigatedBeforeProc * procMult
    total += mitigatedAfterProc
    strikeDetails.push({
      strikeIndex: s,
      preMitigation: {
        base,
        extraFire,
      },
      proc: {
        mult: procMult,
        kind: procMult === 4 ? 'quad' : procMult === 3 ? 'triple' : procMult === 2 ? 'double' : 'none',
      },
      mitigation: mit.details,
      totals: {
        mitigatedBeforeProc,
        mitigatedAfterProc,
      },
    })
  }

  const outcome: PlayerHitOutcome =
    blockedStrikes === strikes && strikes > 0 ? 'enemy_blocked' : 'hit'
  const fx2 = stats.abilityLineEffects
  const dealNoDamage = (fx2?.dealNoDamage ?? false)
  const ailmentsFull = (fx2?.inflictAilmentsAsThoughFullHitDamage ?? false)
  return {
    damage: dealNoDamage ? 0 : total,
    damageForAilments: (dealNoDamage && ailmentsFull) ? total : (dealNoDamage ? 0 : total),
    outcome,
    anyCrit,
    anyDouble,
    anyTriple,
    anyQuad,
    blockedPreventedTotal,
    // @ts-expect-error – extra field for UI drilldown (kept out of public type)
    strikeDetails,
  }
}

// formulas.csv damaging ailments:
// - Bleed: 2s duration, DPS = 30% of physical hit damage
// - Poison: 3s duration, DPS = 15% of combined physical+chaos hit damage (poison damage type = chaos)
// - Ignite: 2s duration, DPS = 45% of fire hit damage
const BASE_BLEED_SEC = 2
const BASE_POISON_SEC = 3
const BASE_IGNITE_SEC = 2
const DOT_LOG_INTERVAL = 0.45

function activeShockPct(state: EnemyAilmentRuntime, t: number): number {
  const total = state.shocks.reduce((sum, s) => s.expiresAt > t ? sum + s.magnitudePct : sum, 0)
  return Math.min(50, total)
}

function activeChillMult(state: EnemyAilmentRuntime, t: number): number {
  const totalPct = state.chills.reduce((sum, c) => c.expiresAt > t ? sum + c.magnitudePct : sum, 0)
  return 1 - Math.min(30, totalPct) / 100
}

function activeChillPct(state: EnemyAilmentRuntime, t: number): number {
  const totalPct = state.chills.reduce((sum, c) => c.expiresAt > t ? sum + c.magnitudePct : sum, 0)
  return Math.min(30, totalPct)
}

function formatActiveEnemyAilmentSuffix(state: EnemyAilmentRuntime, t: number): string {
  const shockLive = activeShockPct(state, t)
  const chillM = activeChillMult(state, t)
  const parts: string[] = []
  if (shockLive > 0) parts.push(`shock ailment +${shockLive.toFixed(0)}% dmg taken`)
  if (chillM < 1 - 1e-6) parts.push(`chill ailment ${((1 - chillM) * 100).toFixed(0)}% slow`)
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}

function enemyModTier(rawMods: ReadonlyArray<{ id: EnemyModifierId; tier: 1 | 2 | 3 }>, id: EnemyModifierId): 0 | 1 | 2 | 3 {
  const hit = rawMods.find((m) => m.id === id)
  return hit?.tier ?? 0
}

function enemyModTierAmp(tier: 0 | 1 | 2 | 3): number {
  // formulas.csv only defines I/II behavior. For III in this demo, continue linearly (x3 / +200% effect).
  return tier <= 1 ? 1 : tier
}

function applyEnemyModifierAilmentsOnHit(
  rawMods: ReadonlyArray<{ id: EnemyModifierId; tier: 1 | 2 | 3 }>,
  damageByType: HitDamageByType,
  playerMaxLife: number,
  t: number,
  playerAilments: PlayerAilmentRuntime,
  stats: ComputedBuildStats,
  tryLog: (entry: BattleLogEntry) => void
): void {
  const C = FORMULA_CONSTANTS
  const avoidAll = Math.min(100, Math.max(0, stats.avoidAilmentsChance ?? 0))
  const avoidEle = Math.min(100, Math.max(0, avoidAll + (stats.avoidElementalAilmentsChance ?? 0)))
  const bleedTier = enemyModTier(rawMods, 'rending')
  const burnTier = enemyModTier(rawMods, 'burning')
  const toxicTier = enemyModTier(rawMods, 'toxic')
  const shockTier = enemyModTier(rawMods, 'electrifying')
  const chillTier = enemyModTier(rawMods, 'freezing')

  const tryInflict = (chance: number, avoidChance: number): boolean =>
    chance > 0 && Math.random() * 100 < chance && Math.random() * 100 >= avoidChance

  if (
    bleedTier > 0
    && damageByType.physical > 0.01
    && tryInflict(100, avoidAll)
  ) {
    const dps =
      ((damageByType.physical * C.bleedInherentMult) / BASE_BLEED_SEC) * enemyModTierAmp(bleedTier)
    playerAilments.bleeds.push({ dps, expiresAt: t + BASE_BLEED_SEC })
    tryLog({
      t,
      kind: 'ailment',
      message: `Enemy mod — Rending bleed on you: ~${dps.toFixed(1)} DPS for ${BASE_BLEED_SEC.toFixed(1)}s`,
    })
  }

  if (
    toxicTier > 0
    && (damageByType.physical + damageByType.chaos) > 0.01
    && tryInflict(100, avoidAll)
  ) {
    const dps =
      (((damageByType.physical + damageByType.chaos) * C.poisonInherentMult) / BASE_POISON_SEC)
      * enemyModTierAmp(toxicTier)
    playerAilments.poisons.push({ dps, expiresAt: t + BASE_POISON_SEC })
    tryLog({
      t,
      kind: 'ailment',
      message: `Enemy mod — Toxic poison on you: ~${dps.toFixed(1)} DPS for ${BASE_POISON_SEC.toFixed(1)}s`,
    })
  }

  if (
    burnTier > 0
    && damageByType.fire > 0.01
    && tryInflict(100, avoidEle)
  ) {
    const dps =
      ((damageByType.fire * C.igniteInherentMult) / BASE_IGNITE_SEC) * enemyModTierAmp(burnTier)
    const expiresAt = t + BASE_IGNITE_SEC
    playerAilments.ignites.push({ dps, expiresAt })
    playerAilments.igniteUntil = Math.max(playerAilments.igniteUntil, expiresAt)
    tryLog({
      t,
      kind: 'ailment',
      message: `Enemy mod — Burning ignite on you: ~${dps.toFixed(1)} DPS for ${BASE_IGNITE_SEC.toFixed(1)}s`,
    })
  }

  if (
    shockTier > 0
    && damageByType.lightning > 0.01
    && tryInflict(100, avoidEle)
  ) {
    const raw = computeNonDamagingAilmentEffectPercent(
      damageByType.lightning,
      Math.max(1, playerMaxLife),
      0,
      C.enemyShockChillEffect,
      1,
      1
    )
    const magnitudePct = Math.min(50, Math.max(5, raw * 1.15 * enemyModTierAmp(shockTier)))
    const expiresAt = t + getBaseShockChillDurationSec()
    if (!playerAilments.shock || playerAilments.shock.expiresAt <= t) {
      playerAilments.shock = { magnitudePct, expiresAt }
    } else {
      playerAilments.shock.magnitudePct = Math.max(playerAilments.shock.magnitudePct, magnitudePct)
      playerAilments.shock.expiresAt = Math.max(playerAilments.shock.expiresAt, expiresAt)
    }
    tryLog({
      t,
      kind: 'ailment',
      message: `Enemy mod — Electrifying shock on you: +${magnitudePct.toFixed(0)}% for ${(expiresAt - t).toFixed(1)}s`,
    })
  }

  if (
    chillTier > 0
    && damageByType.cold > 0.01
    && tryInflict(100, avoidEle)
    && !(stats.unaffectedByChill ?? false)
  ) {
    const raw = computeNonDamagingAilmentEffectPercent(
      damageByType.cold,
      Math.max(1, playerMaxLife),
      0,
      C.enemyShockChillEffect,
      1,
      C.chillSpecialMult as 0.7
    )
    const magnitudePct = Math.min(30, Math.max(5, raw * 0.85 * enemyModTierAmp(chillTier)))
    const expiresAt = t + getBaseShockChillDurationSec()
    if (!playerAilments.chill || playerAilments.chill.expiresAt <= t) {
      playerAilments.chill = { magnitudePct, expiresAt }
    } else {
      playerAilments.chill.magnitudePct = Math.max(playerAilments.chill.magnitudePct, magnitudePct)
      playerAilments.chill.expiresAt = Math.max(playerAilments.chill.expiresAt, expiresAt)
    }
    tryLog({
      t,
      kind: 'ailment',
      message: `Enemy mod — Freezing chill on you: -${magnitudePct.toFixed(0)}% speed for ${(expiresAt - t).toFixed(1)}s`,
    })
  }
}

/**
 * Demo ailment model: on hit, roll bleed / poison / elemental ailments from sheet stats.
 * Damaging ailments add timed DoT instances; shock/chill use Non-Damaging Ailment Effect-style scaling.
 */
function applyPlayerAilmentsOnHit(
  stats: ComputedBuildStats,
  mitigatedDamage: number,
  enemyMaxLife: number,
  t: number,
  state: EnemyAilmentRuntime,
  playerAilments: PlayerAilmentRuntime,
  hitWasCritical: boolean,
  log: BattleLogEntry[],
  tryLog: (entry: BattleLogEntry) => void,
  debuffEvents: EnemyDebuffEvent[]
): void {
  if (mitigatedDamage <= 0) return

  const { bleedInherentMult, igniteInherentMult, poisonInherentMult } = FORMULA_CONSTANTS
  const durMult = stats.ailmentDurationMultiplier
  /** Woe Touch: "1% more duration per 1% critical damage multiplier" → demo: ×critMultiplier on crit. */
  const critAilmentDurMult =
    hitWasCritical && (stats.ailmentsOnCritGainDurationPerCritMulti ?? false)
      ? Math.max(1, stats.critMultiplier)
      : 1
  const dotMult =
    (1 + stats.damageOverTimeMultiplier / 100) * (stats.dotDamageMoreMultiplier ?? 1)
  const portions = damagePortionsFromHit(stats, mitigatedDamage)

  const tryLogAilment = (msg: string) => {
    tryLog({ t, kind: 'ailment', message: msg })
  }

  // Damaging ailments: formulas.csv uses TOTAL_APPLICABLE_DAMAGE before damage reduction.
  // This demo engine uses mitigated hit portions as the best available proxy in combat logs.
  if (portions.physical > 0.01 && Math.random() * 100 < stats.bleedChance) {
    const dps = ((portions.physical * bleedInherentMult) / BASE_BLEED_SEC) * dotMult
    state.dots.push({
      kind: 'bleed',
      dps,
      expiresAt: t + BASE_BLEED_SEC * durMult * critAilmentDurMult,
    })
    tryLogAilment(
      `Ailment — Bleed (DoT): ~${dps.toFixed(1)} DPS for ${(BASE_BLEED_SEC * durMult * critAilmentDurMult).toFixed(1)}s`
    )
  }

  const poisonChance = (stats.critsAlwaysInflictPoison && hitWasCritical) ? 100 : stats.poisonChance
  if (Math.random() * 100 < poisonChance) {
    const applicable = Math.max(0, portions.physical + portions.chaos)
    const dps = ((applicable * poisonInherentMult) / BASE_POISON_SEC) * dotMult
    state.dots.push({
      kind: 'poison',
      dps,
      expiresAt: t + BASE_POISON_SEC * durMult * critAilmentDurMult,
    })
    tryLogAilment(
      `Ailment — Poison (DoT): ~${dps.toFixed(1)} DPS for ${(BASE_POISON_SEC * durMult * critAilmentDurMult).toFixed(1)}s`
    )
    if (stats.poisonYouInflictReflectedToYou ?? false) {
      const avoid = Math.min(100, Math.max(0, stats.avoidAilmentsChance ?? 0))
      if (Math.random() * 100 >= avoid) {
        playerAilments.poisons.push({ expiresAt: t + BASE_POISON_SEC * durMult * critAilmentDurMult, dps })
        tryLogAilment(
          `Ailment — Poison reflected to you (${(BASE_POISON_SEC * durMult * critAilmentDurMult).toFixed(1)}s)`
        )
      } else {
        tryLogAilment(`Ailment — Poison reflected to you (avoided)`)
      }
    }
  }

  const gen = (stats.critsAlwaysInflictElementalAilments && hitWasCritical) ? 100 : stats.elementalAilmentChance
  const noEle = stats.cannotInflictElementalAilments
  const ndMult = 1 + (stats.nonDamagingAilmentEffectIncreasedPercent ?? 0) / 100
  const chillOutMult = stats.chillInflictEffectMult ?? 1
  const fx = stats.abilityLineEffects
  const C = FORMULA_CONSTANTS

  const canIgniteFromElement = portions.fire > 0.01
    || (stats.allElementalDamageTypesCanIgnite && (portions.cold + portions.lightning) > 0.01)
    || (stats.chaosDamageCanInflictAllElementalAilments && portions.chaos > 0.01)
    || (stats.chaosDamageCanIgnite && portions.chaos > 0.01)
  if (!noEle && canIgniteFromElement) {
    const pIgn = Math.min(100, gen + stats.igniteInflictChanceBonus)
    if (Math.random() * 100 < pIgn) {
      const dps = ((portions.fire * igniteInherentMult) / BASE_IGNITE_SEC) * dotMult
      const ignDur = stats.igniteAilmentDurationMultiplier
      const randIgn =
        (stats.randomIgniteDurationLessPercent > 0 || stats.randomIgniteDurationMorePercent > 0)
          ? 1
            + ((Math.random()
              * (stats.randomIgniteDurationMorePercent + stats.randomIgniteDurationLessPercent)
              - stats.randomIgniteDurationLessPercent) / 100)
          : 1
      const igniteDurationSec = BASE_IGNITE_SEC * ignDur * Math.max(0.05, randIgn) * critAilmentDurMult
      const igniteBurst = fx?.igniteDealsNoDamageOverDuration ?? false
      state.dots.push({
        kind: 'ignite',
        dps: igniteBurst ? 0 : dps,
        expiresAt: t + igniteDurationSec,
        burstDamageOnExpire: igniteBurst ? dps * igniteDurationSec : undefined,
        burstClearsAllIgnites: fx?.igniteBurstsAtEndAndClearsAll ?? false,
      })
      tryLogAilment(
        igniteBurst
          ? `Ailment — Ignite stored: ~${(dps * igniteDurationSec).toFixed(1)} fire damage at end (${igniteDurationSec.toFixed(1)}s)`
          : `Ailment — Ignite (DoT): ~${dps.toFixed(1)} fire DPS for ${igniteDurationSec.toFixed(1)}s`
      )
      if (stats.elementalAilmentsYouInflictReflectedToYou ?? false) {
        const avoidAll = Math.min(100, Math.max(0, stats.avoidAilmentsChance ?? 0))
        const avoidEle = Math.min(100, Math.max(0, stats.avoidElementalAilmentsChance ?? 0))
        const avoid = Math.min(100, avoidAll + avoidEle)
        if (Math.random() * 100 >= avoid) {
          playerAilments.igniteUntil = Math.max(
            playerAilments.igniteUntil,
            t + BASE_IGNITE_SEC * ignDur * critAilmentDurMult
          )
          tryLogAilment(
            `Ailment — Ignite reflected to you (${(BASE_IGNITE_SEC * ignDur * critAilmentDurMult).toFixed(1)}s)`
          )
        } else {
          tryLogAilment(`Ailment — Ignite reflected to you (avoided)`)
        }
      }
    }
  }

  const canShockFromElement = portions.lightning > 0.01
    || (stats.allElementalDamageTypesCanShock && (portions.fire + portions.cold) > 0.01)
    || (stats.chaosDamageCanInflictAllElementalAilments && portions.chaos > 0.01)
  if (!noEle && canShockFromElement) {
    const pShock = Math.min(100, gen + stats.shockInflictChanceBonus)
    if (Math.random() * 100 < pShock) {
      const asThoughMore = Math.max(0, stats.hitsInflictShockAsThoughDealingMoreDamagePct ?? 0)
      const shockDamageForEffect = portions.lightning * (1 + asThoughMore / 100)
      const effectPctRaw = computeNonDamagingAilmentEffectPercent(
        shockDamageForEffect,
        enemyMaxLife,
        0,
        C.enemyShockChillEffect,
        1,
        1
      )
      const shockCap = (stats.ignoreMaxShockEffect ?? false) ? Number.POSITIVE_INFINITY : (stats.maxShockEffect ?? 50)
      const shockIncMult = 1 + (stats.increasedShockEffect ?? 0) / 100
      const computedShock = Math.max(5, effectPctRaw * 1.15 * ndMult * shockIncMult)
      const shockFixed = stats.fixedShockEffectPercent ?? 0
      const shock = shockFixed > 0 ? shockFixed : Math.min(shockCap, computedShock)
      const dur =
        getBaseShockChillDurationSec() * durMult * (stats.shockDurationMultiplier ?? 1) * critAilmentDurMult
      state.shocks.push({ magnitudePct: shock, expiresAt: t + dur })
      debuffEvents.push({ t, kind: 'shock', magnitudePct: shock, durationSec: dur })
      tryLogAilment(
        `Ailment — Shock: enemy takes +${shock.toFixed(0)}% damage from your hits (${dur.toFixed(1)}s)`
      )
      if (stats.elementalAilmentsYouInflictReflectedToYou ?? false) {
        const avoidAll = Math.min(100, Math.max(0, stats.avoidAilmentsChance ?? 0))
        const avoidEle = Math.min(100, Math.max(0, stats.avoidElementalAilmentsChance ?? 0))
        const avoid = Math.min(100, avoidAll + avoidEle)
        if (Math.random() * 100 >= avoid) {
          if (!playerAilments.shock || playerAilments.shock.expiresAt <= t) {
            playerAilments.shock = { magnitudePct: shock, expiresAt: t + dur }
          } else {
            playerAilments.shock.magnitudePct = Math.max(playerAilments.shock.magnitudePct, shock)
            playerAilments.shock.expiresAt = Math.max(playerAilments.shock.expiresAt, t + dur)
          }
          tryLogAilment(`Ailment — Shock reflected to you (+${shock.toFixed(0)}%, ${dur.toFixed(1)}s)`)
        } else {
          tryLogAilment(`Ailment — Shock reflected to you (avoided)`)
        }
      }
    }
  }

  const canChillFromElement = portions.cold > 0.01
    || (stats.allElementalDamageTypesCanChill && (portions.fire + portions.lightning) > 0.01)
    || (stats.chaosDamageCanInflictAllElementalAilments && portions.chaos > 0.01)
  if (!noEle && canChillFromElement) {
    const pChill = Math.min(100, gen + stats.chillInflictChanceBonus)
    if (Math.random() * 100 < pChill) {
      const asThoughMore = Math.max(0, stats.hitsInflictChillAsThoughDealingMoreDamagePct ?? 0)
      const chillDamageForEffect = portions.cold * (1 + asThoughMore / 100)
      const effectPctRaw = computeNonDamagingAilmentEffectPercent(
        chillDamageForEffect,
        enemyMaxLife,
        0,
        C.enemyShockChillEffect,
        1,
        C.chillSpecialMult as 0.7
      )
      if (stats.enemiesUnaffectedByChill) {
        // modeled: some uniques make enemies immune to chill
        tryLogAilment(`Ailment — Chill prevented (enemy unaffected by chill)`)
        return
      }
      const chillCap = stats.maxChillEffect ?? 30
      const chillPct = Math.min(chillCap, Math.max(5, effectPctRaw * 0.85 * ndMult * chillOutMult))
      const dur = getBaseShockChillDurationSec() * durMult * critAilmentDurMult
      const chillExpiresAt =
        (stats.chillYouInflictInfiniteDuration ?? false) ? Number.POSITIVE_INFINITY : (t + dur)
      state.chills.push({ magnitudePct: chillPct, expiresAt: chillExpiresAt })
      debuffEvents.push({
        t,
        kind: 'chill',
        magnitudePct: chillPct,
        durationSec: (stats.chillYouInflictInfiniteDuration ?? false) ? Number.POSITIVE_INFINITY : dur,
      })
      tryLogAilment(
        `Ailment — Chill: enemy action speed −${chillPct.toFixed(0)}% (${dur.toFixed(1)}s)`
      )
      if (fx?.inflictShockEqualToChill ?? false) {
        const shockCap = (stats.ignoreMaxShockEffect ?? false) ? Number.POSITIVE_INFINITY : (stats.maxShockEffect ?? 50)
        const shock = Math.min(shockCap, chillPct)
        state.shocks.push({ magnitudePct: shock, expiresAt: t + dur })
        debuffEvents.push({ t, kind: 'shock', magnitudePct: shock, durationSec: dur })
      }
      if ((stats.elementalAilmentsYouInflictReflectedToYou ?? false) && !(stats.unaffectedByChill ?? false)) {
        const avoidAll = Math.min(100, Math.max(0, stats.avoidAilmentsChance ?? 0))
        const avoidEle = Math.min(100, Math.max(0, stats.avoidElementalAilmentsChance ?? 0))
        const avoid = Math.min(100, avoidAll + avoidEle)
        if (Math.random() * 100 >= avoid) {
          if (!playerAilments.chill || playerAilments.chill.expiresAt <= t) {
            playerAilments.chill = { magnitudePct: chillPct, expiresAt: t + dur }
          } else {
            playerAilments.chill.magnitudePct = Math.max(playerAilments.chill.magnitudePct, chillPct)
            playerAilments.chill.expiresAt = Math.max(playerAilments.chill.expiresAt, t + dur)
          }
          tryLogAilment(`Ailment — Chill reflected to you (−${chillPct.toFixed(0)}%, ${dur.toFixed(1)}s)`)
        } else {
          tryLogAilment(`Ailment — Chill reflected to you (avoided)`)
        }
      }
    }
  }
}

function resolveEnemyAttack(
  enemy: DemoEnemyDef,
  stats: ComputedBuildStats,
  playerState: BattleParticipantState,
  firstHitThisEncounter: { used: boolean },
  maxLife: number
): {
  damageToDisplay: number
  fullBeforeArmour: number
  mitigatedByArmour: number
  damageByType: HitDamageByType
  evaded: boolean
  dodged: boolean
  blocked: boolean
  critical: boolean
  /** Damage removed by block mitigation on this hit (pre-block hit damage minus post-block, before armour). */
  preventedByBlock: number
  /** Total prevented damage vs the player (includes block + armour + resist + other mitigation after this point). */
  preventedTotal: number
} {
  const enemyAttackIsSpell = enemy.attackIsSpell ?? false
  const acc = enemy.accuracy
  let eva = stats.evasionRating
  const flat = flatEvasionFromClassBonuses(stats)
  // Evasion is half as effective vs spells (apply when the enemy attack is a spell).
  if (enemyAttackIsSpell) eva = eva / 2
  if ((stats.cannotEvadeWhileYouHaveEnergyShield ?? false) && playerState.energyShield > 0) {
    eva = 0
  }
  if (
    (stats.cannotEvadeWhileAboveHalfLife ?? false) &&
    playerState.life > maxLife * 0.5
  ) {
    eva = 0
  }

  if (Math.random() * 100 < computeEvasionChancePercent(acc, eva, flat)) {
    return {
      damageToDisplay: 0,
      fullBeforeArmour: 0,
      mitigatedByArmour: 0,
      damageByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
      evaded: true,
      dodged: false,
      blocked: false,
      critical: false,
      preventedByBlock: 0,
      preventedTotal: 0,
    }
  }

  const dodgeBase = stats.dodgeChance
  const atMax = playerState.life >= maxLife - 1e-9
  const belowMax = playerState.life < maxLife - 1e-9
  const betterTwice = (stats.dodgeRolledTwiceAtMaxLifeBetter ?? false) && atMax
  const worseTwice = (stats.dodgeRolledTwiceBelowMaxLifeWorse ?? false) && belowMax
  const dodgePass = () => Math.random() * 100 < dodgeBase
  const dodged = betterTwice ? (dodgePass() || dodgePass()) : worseTwice ? (dodgePass() && dodgePass()) : dodgePass()
  if (dodged) {
    return {
      damageToDisplay: 0,
      fullBeforeArmour: 0,
      mitigatedByArmour: 0,
      damageByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
      evaded: false,
      dodged: true,
      blocked: false,
      critical: false,
      preventedByBlock: 0,
      preventedTotal: 0,
    }
  }

  const zealotLower = stats.classBonusesActive.includes('zealot')
  let raw = zealotLower
    ? Math.min(
        enemy.damageMin + Math.random() * (enemy.damageMax - enemy.damageMin),
        enemy.damageMin + Math.random() * (enemy.damageMax - enemy.damageMin)
      )
    : enemy.damageMin + Math.random() * (enemy.damageMax - enemy.damageMin)

  const critC = enemy.critChance ?? 0
  const critM = enemy.critMultiplier ?? 2
  const canCrit = !stats.hitsTakenCannotBeCritical
  let critical = false
  if (canCrit && critC > 0 && Math.random() * 100 < critC) {
    raw *= critM
    critical = true
  }

  if (stats.classBonusesActive.includes('trickster')) {
    raw *= 1 - 0.05
  }

  if ((stats.enemiesDealLessDamagePercent ?? 0) !== 0) {
    raw *= Math.max(0.05, 1 - (stats.enemiesDealLessDamagePercent ?? 0) / 100)
  }

  if (stats.classBonusesActive.includes('berserker')) {
    raw *= 1.25
  }

  let afterPath = raw
  if (stats.classBonusesActive.includes('pathfinder') && !firstHitThisEncounter.used) {
    afterPath *= 1 - 0.2
    firstHitThisEncounter.used = true
  }

  afterPath *= 1 - championDamageReductionFrac(stats, playerState.life)

  const dmgTakenGear = stats.damageTakenMultiplierFromGear ?? 1
  if (dmgTakenGear !== 1) afterPath *= dmgTakenGear

  let blocked = stats.blockChance > 0 && Math.random() * 100 < stats.blockChance
  if (blocked && (stats.blockReplacedByDodge ?? false)) {
    blocked = false
    if (dodgePass()) {
      return {
        damageToDisplay: 0,
        fullBeforeArmour: 0,
        mitigatedByArmour: 0,
        damageByType: { physical: 0, fire: 0, cold: 0, lightning: 0, chaos: 0 },
        evaded: false,
        dodged: true,
        blocked: false,
        critical,
        preventedByBlock: 0,
        preventedTotal: 0,
      }
    }
  }
  let preventedByBlock = 0
  const preBlockDamage = afterPath
  if (blocked) {
    const preventAllChance = stats.blockPreventsAllDamageChance ?? 0
    if (preventAllChance > 0 && Math.random() * 100 < preventAllChance) {
      afterPath = 0
    } else {
      afterPath *= stats.blockDamageTakenMult ?? DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
    }
    preventedByBlock = Math.max(0, preBlockDamage - afterPath)
  }

  // Enemy hit: allow multi-type armour split per formulas.csv.
  let armour = stats.armour
  if (stats.armourNoEffectVsPhysical ?? false) armour = 0
  if (
    (stats.armourHasNoEffectWhileBelowHalfLife ?? false) &&
    playerState.life < maxLife * 0.5
  ) {
    armour = 0
  }
  const physMin = enemy.physicalDamageMin ?? enemy.damageMin
  const physMax = enemy.physicalDamageMax ?? enemy.damageMax
  const eleMin = enemy.elementalDamageMin ?? 0
  const eleMax = enemy.elementalDamageMax ?? 0
  const chaosMin = enemy.chaosDamageMin ?? 0
  const chaosMax = enemy.chaosDamageMax ?? 0
  const fireMin = enemy.fireDamageMin ?? 0
  const fireMax = enemy.fireDamageMax ?? 0
  const coldMin = enemy.coldDamageMin ?? 0
  const coldMax = enemy.coldDamageMax ?? 0
  const lightMin = enemy.lightningDamageMin ?? 0
  const lightMax = enemy.lightningDamageMax ?? 0

  const physRoll = physMin + Math.random() * Math.max(0, physMax - physMin)
  const chaosRoll = chaosMin + Math.random() * Math.max(0, chaosMax - chaosMin)

  // Elemental: if per-element ranges are provided, roll those directly; otherwise roll the aggregated elemental bucket.
  const hasElementRolls = (fireMin + fireMax + coldMin + coldMax + lightMin + lightMax) > 0
  const fireRoll = hasElementRolls ? (fireMin + Math.random() * Math.max(0, fireMax - fireMin)) : 0
  const coldRoll = hasElementRolls ? (coldMin + Math.random() * Math.max(0, coldMax - coldMin)) : 0
  const lightRoll = hasElementRolls ? (lightMin + Math.random() * Math.max(0, lightMax - lightMin)) : 0
  const eleRoll = hasElementRolls ? (fireRoll + coldRoll + lightRoll) : (eleMin + Math.random() * Math.max(0, eleMax - eleMin))

  const rollTotal = Math.max(1e-9, physRoll + eleRoll + chaosRoll)
  const physAmt = afterPath * (physRoll / rollTotal)
  const chaosAmt = afterPath * (chaosRoll / rollTotal)
  const eleAmt = afterPath * (eleRoll / rollTotal)

  const totalAllTypes = physAmt + eleAmt + chaosAmt
  const armourIgnoredFrac = Math.min(1, Math.max(0, (enemy.armourIgnorePercent ?? 0) / 100))
  const afterArmourPhys = physAmt * (1 - computeArmourDR(armour, physAmt, totalAllTypes, 'physical', armourIgnoredFrac))
  const afterArmourEle = eleAmt * (1 - computeArmourDR(armour, eleAmt, totalAllTypes, 'fire', armourIgnoredFrac))
  const afterArmourChaos = chaosAmt * (1 - computeArmourDR(armour, chaosAmt, totalAllTypes, 'chaos', armourIgnoredFrac))

  // --- Damage taken conversions + increased taken (by type) -----------------
  const resCap = (r: number, max: number) => Math.max(-0.9, Math.min(0.9, Math.min(r / 100, max / 100)))
  const pen = Math.max(0, (enemy.resistancePenetrationPercent ?? 0) / 100)

  // Split elemental into per-element buckets.
  let phys = afterArmourPhys
  let fire = 0
  let cold = 0
  let light = 0
  let chaos = afterArmourChaos
  if (hasElementRolls) {
    const eTot = Math.max(1e-9, fireRoll + coldRoll + lightRoll)
    fire = afterArmourEle * (fireRoll / eTot)
    cold = afterArmourEle * (coldRoll / eTot)
    light = afterArmourEle * (lightRoll / eTot)
  } else {
    fire = afterArmourEle / 3
    cold = afterArmourEle / 3
    light = afterArmourEle / 3
  }

  // 1) Physical taken-as-X conversions (0–100 each, clamped by normalize rule).
  {
    let pChaos = Math.min(100, stats.physicalDamageTakenAsChaosPercent ?? 0)
    let pFire = Math.min(100, stats.physicalDamageTakenAsFirePercent ?? 0)
    let pCold = Math.min(100, stats.physicalDamageTakenAsColdPercent ?? 0)
    let pLight = Math.min(100, stats.physicalDamageTakenAsLightningPercent ?? 0)
    const sum = pChaos + pFire + pCold + pLight
    const scale = sum > 100 && sum > 0 ? 100 / sum : 1
    pChaos *= scale
    pFire *= scale
    pCold *= scale
    pLight *= scale

    const toChaos = phys * (pChaos / 100)
    const toFire = phys * (pFire / 100)
    const toCold = phys * (pCold / 100)
    const toLight = phys * (pLight / 100)
    phys = Math.max(0, phys - toChaos - toFire - toCold - toLight)
    chaos += toChaos
    fire += toFire
    cold += toCold
    light += toLight
  }

  // 2) Elemental taken as chaos.
  // Existing stat: elementalDamageTakenAsChaosPercent (applies to all elements).
  // New stats: fire/cold/lightning taken as chaos (stack additively with the elemental-wide value).
  {
    const elemToChaos = Math.max(0, stats.elementalDamageTakenAsChaosPercent ?? 0)
    const fireToChaos = Math.min(100, Math.max(0, (stats.fireDamageTakenAsChaosPercent ?? 0) + elemToChaos))
    const coldToChaos = Math.min(100, Math.max(0, (stats.coldDamageTakenAsChaosPercent ?? 0) + elemToChaos))
    const lightToChaos = Math.min(100, Math.max(0, (stats.lightningDamageTakenAsChaosPercent ?? 0) + elemToChaos))

    const f = fire * (fireToChaos / 100)
    const c = cold * (coldToChaos / 100)
    const l = light * (lightToChaos / 100)
    fire -= f; cold -= c; light -= l
    chaos += f + c + l
  }

  // 3) Apply resistances to each bucket.
  const physAfterRes = phys
  const fireAfterRes = fire * (1 - resCap(stats.fireRes * (1 - pen), stats.maxFireRes))
  const coldAfterRes = cold * (1 - resCap(stats.coldRes * (1 - pen), stats.maxColdRes))
  const lightAfterRes = light * (1 - resCap(stats.lightningRes * (1 - pen), stats.maxLightningRes))
  const chaosAfterRes = chaos * (1 - resCap(stats.chaosRes * (1 - pen), stats.maxChaosRes))

  // 4) Apply "increased damage taken" by type (post-mitigation, pre-pools).
  const incMult = (pct: number | undefined) => 1 + Math.max(0, pct ?? 0) / 100
  const afterConversion =
    physAfterRes * incMult(stats.increasedPhysicalDamageTakenPercent)
    + fireAfterRes * incMult(stats.increasedFireDamageTakenPercent)
    + coldAfterRes * incMult(stats.increasedColdDamageTakenPercent)
    + lightAfterRes * incMult(stats.increasedLightningDamageTakenPercent)
    + chaosAfterRes * incMult(stats.increasedChaosDamageTakenPercent)

  const afterArmour = afterArmourPhys + afterArmourEle + afterArmourChaos

  const prevented = Math.max(0, afterPath - afterArmour)
  if (blocked && stats.classBonusesActive.includes('templar')) {
    playerState.energyShield += stats.armour * 0.02
    if (playerState.energyShield > stats.maxEnergyShield) {
      playerState.energyShield = stats.maxEnergyShield
    }
  }
  if (stats.classBonusesActive.includes('juggernaut') && prevented > 0) {
    if (lifeRecoveryAllowed(playerState, stats, maxLife)) {
      playerState.life += prevented * 0.04
      if (playerState.life > maxLife) playerState.life = maxLife
    }
  }

  const dealt = applyDamageToPools(playerState, afterConversion, stats, stats.maxMana)
  const damageByType: HitDamageByType = {
    // Keep pre-pool amounts for ailment logic; mitigation/pathing is already applied above.
    physical: physAfterRes * incMult(stats.increasedPhysicalDamageTakenPercent),
    fire: fireAfterRes * incMult(stats.increasedFireDamageTakenPercent),
    cold: coldAfterRes * incMult(stats.increasedColdDamageTakenPercent),
    lightning: lightAfterRes * incMult(stats.increasedLightningDamageTakenPercent),
    chaos: chaosAfterRes * incMult(stats.increasedChaosDamageTakenPercent),
  }

  applyBlockRecovery(playerState, stats, blocked, maxLife)

  if (dealt > 0 && (stats.energyShieldOnHit ?? 0) > 0 && stats.maxEnergyShield > 0) {
    playerState.energyShield = Math.min(
      stats.maxEnergyShield,
      playerState.energyShield + (stats.energyShieldOnHit ?? 0)
    )
  }

  const preventedTotal = Math.max(0, preBlockDamage - dealt)
  return {
    damageToDisplay: dealt,
    fullBeforeArmour: raw,
    mitigatedByArmour: prevented,
    damageByType,
    evaded: false,
    dodged: false,
    blocked,
    critical,
    preventedByBlock,
    preventedTotal,
  }
}

export function simulateEncounter(ctx: BattleContext): EncounterResult {
  const { stats, options = {} } = ctx
  const maxDuration = options.maxDurationSeconds ?? 120
  const dt = options.dt ?? 0.05
  const maxLog = options.maxLogEntries ?? 80
  const recordTimeline = options.recordTimeline ?? false
  const maxLogNormal = Math.max(0, maxLog - 2) // reserve: truncation marker + final outcome line
  let logTruncated = false

  const rawMods: Array<{ id: EnemyModifierId; tier: 1 | 2 | 3 }> = (
    ctx.enemyModsWithTiers?.length
      ? ctx.enemyModsWithTiers
      : (ctx.enemyMods ?? []).map((id) => ({ id, tier: 1 as const }))
  ).slice(0, 3) as Array<{ id: EnemyModifierId; tier: 1 | 2 | 3 }>
  const { enemy, deltas } = applyEnemyModifiersWithTiersToScaledEnemy(ctx.enemy, rawMods)
  const enemyLifeLeechPct = Math.min(100, deltas.lifeLeechPct)
  const enemyEsLeechPct = Math.min(100, deltas.esLeechPct)
  const refLife = enemyModifierRefLifeForRegen(enemy)
  const rarityLifeMult = enemy.rarityLifeMult ?? 1
  const rarityRegenMult = enemy.rarityRegenMult ?? 1
  // Sheet: rarity regen multiplier is separate from rarity life multiplier. Our raw regen model uses
  // `raw × maxLife / ref`, so we remove the life rarity scaling and apply the regen rarity scaling.
  const regenLifeForScaling = rarityLifeMult !== 0 ? enemy.maxLife / rarityLifeMult : enemy.maxLife
  const enemyLifeRegenPerSecond = (deltas.lifeRegenRaw !== 0)
    ? (deltas.lifeRegenRaw * regenLifeForScaling * rarityRegenMult) / refLife
    : 0
  const enemyEsRegenPerSecond = (deltas.esRegenRaw !== 0)
    ? (deltas.esRegenRaw * regenLifeForScaling * rarityRegenMult) / refLife
    : 0

  let runtimeMaxLife = stats.maxLife
  let deathPreventUsed = false
  const player: BattleParticipantState = {
    life: runtimeMaxLife,
    energyShield: stats.maxEnergyShield,
    mana: stats.maxMana,
  }

  const enemyState = {
    life: Math.max(1, enemy.maxLife),
    energyShield: Math.max(0, enemy.maxEnergyShield ?? 0),
    mana: Math.max(0, enemy.maxMana ?? 0),
  }
  let enemyLife = enemyState.life
  const startLosePct = Math.min(100, Math.max(0, stats.enemyLoseMaxLifeAtStartPercent ?? 0))
  if (startLosePct > 0) {
    enemyState.life = Math.max(0, enemyState.life - enemy.maxLife * (startLosePct / 100))
    enemyLife = enemyState.life
  }
  let t = 0
  // Match enemy timing model: first action after one full base interval.
  // (Action bar can still be modified by uniques after encounter starts.)
  let nextPlayer = 1 / Math.max(0.05, stats.aps)
  const apsEnemy = enemy.useOwnApsOnly
    ? Math.max(0.05, enemy.aps)
    : Math.max(0.05, enemy.aps * enemyApsMultiplier(stats))
  // First enemy swing occurs after one full attack interval.
  let nextEnemy = 1 / Math.max(0.15, apsEnemy)
  const firstHitFlag = { used: false }
  const firstPlayerActionThisEncounter = { used: false }

  const ailmentState: EnemyAilmentRuntime = {
    dots: [],
    shocks: [],
    chills: [],
  }

  // Windrunner: permanently inflict 15% shock and 10% chill at encounter start.
  if (stats.classBonusesActive.includes('windrunner')) {
    const dur = 1e9
    ailmentState.shocks.push({ magnitudePct: 15, expiresAt: t + dur })
    ailmentState.chills.push({ magnitudePct: 10, expiresAt: t + dur })
  }

  const playerAilments: PlayerAilmentRuntime = {
    bleeds: [],
    poisons: [],
    ignites: [],
    igniteUntil: 0,
    shock: null,
    chill: null,
  }

  // Reaper: permanently inflict 20% chill on yourself.
  if (stats.classBonusesActive.includes('reaper')) {
    playerAilments.chill = { magnitudePct: 20, expiresAt: 1e9 }
  }

  // Action bar: 0..1.0; when it reaches 1 you can act.
  // Demo model: bar fills at (player attack rate) per second, so time-to-act matches APS,
  // but uniques can set/fill the bar directly.
  let actionBar = Math.min(1, Math.max(0, (stats.actionBarSetToPercentAtStart ?? 0) / 100))

  const log: BattleLogEntry[] = [{ t: 0, kind: 'phase', message: `Encounter: ${enemy.name}` }]

  const timeline: EncounterTimelinePoint[] | undefined = recordTimeline ? [] : undefined
  const pushTimeline = () => {
    if (!timeline) return
    const enemyChillMultNow = activeChillMult(ailmentState, t)
    const enemyInterval = 1 / Math.max(0.15, apsEnemy * enemyChillMultNow)
    const enemyActionBar = Math.max(
      0,
      Math.min(1, 1 - Math.max(0, nextEnemy - t) / Math.max(1e-6, enemyInterval))
    )
    timeline.push({
      t,
      player: {
        life: player.life,
        energyShield: player.energyShield,
        mana: player.mana,
        actionBar: Math.max(0, Math.min(1, actionBar)),
      },
      enemy: {
        life: enemyState.life,
        energyShield: enemyState.energyShield,
        mana: enemyState.mana,
        actionBar: enemyActionBar,
      },
    })
  }
  pushTimeline()

  const enemyPoolsText = () => {
    const es = Math.max(0, enemyState.energyShield)
    const life = Math.max(0, enemyState.life)
    return es > 0 ? `${es.toFixed(0)} ES · ${life.toFixed(0)} life` : `${life.toFixed(0)} life`
  }

  const tryLog = (entry: BattleLogEntry) => {
    if (log.length < maxLogNormal) {
      log.push(entry)
      return
    }
    if (!logTruncated && log.length < maxLog - 1) {
      logTruncated = true
      log.push({
        t: entry.t,
        kind: 'phase',
        message: `Log truncated (showing first ${maxLogNormal} events).`,
      })
    }
  }

  let hitsPlayer = 0
  let hitsEnemy = 0
  let totalDotDamage = 0
  let totalHitDamageToEnemy = 0
  let totalDamageToPlayerFromEnemyHits = 0
  let totalDamageToPlayerFromDots = 0
  let totalDamageToPlayerFromSelf = 0
  let totalRegenToPlayerLife = 0
  let totalRegenToPlayerMana = 0
  let totalRegenToPlayerEs = 0
  let totalRegenToEnemyLife = 0
  let totalRegenToEnemyEs = 0
  let lastDotLogT = -DOT_LOG_INTERVAL
  let lastDebuffPulseT = -DOT_LOG_INTERVAL
  let dotLogAcc = { bleed: 0, poison: 0, ignite: 0 }
  const enemyDebuffEvents: EnemyDebuffEvent[] = []

  // Aggregated ailment summary (max concurrent stacks / magnitudes).
  const enemyAilmentSummary = {
    maxStacks: { bleed: 0, poison: 0, ignite: 0, shock: 0, chill: 0 },
    maxDotDps: { bleed: 0, poison: 0, ignite: 0, total: 0 },
    maxNonDotMagnitudePct: { shock: 0, chill: 0 },
  }
  const playerAilmentSummary: PlayerAilmentSummary = {
    maxStacks: { bleed: 0, poison: 0, ignite: 0 },
    maxDotDps: { bleed: 0, poison: 0, ignite: 0, total: 0 },
    maxNonDotMagnitudePct: { shock: 0, chill: 0 },
  }
  let nextPeriodicShockT = 0
  let nextPeriodicLifeRegenT = 0
  let periodicLifeRegenActiveUntil = 0
  while (t < maxDuration) {
    if (player.life <= 0) break
    if (enemyLife <= 0) break

    // Enemy regen from mods (scaled off life per formulas.csv note).
    if (enemyLifeRegenPerSecond > 0 && enemyState.life > 0 && enemyState.life < enemy.maxLife - 1e-9) {
      const before = enemyState.life
      enemyState.life = Math.min(enemy.maxLife, enemyState.life + enemyLifeRegenPerSecond * dt)
      totalRegenToEnemyLife += Math.max(0, enemyState.life - before)
      enemyLife = enemyState.life
    }
    if (
      enemyEsRegenPerSecond > 0 &&
      (enemy.maxEnergyShield ?? 0) > 0 &&
      enemyState.energyShield > 0 &&
      enemyState.energyShield < (enemy.maxEnergyShield ?? 0) - 1e-9
    ) {
      const before = enemyState.energyShield
      enemyState.energyShield = Math.min(
        enemy.maxEnergyShield ?? 0,
        enemyState.energyShield + enemyEsRegenPerSecond * dt
      )
      totalRegenToEnemyEs += Math.max(0, enemyState.energyShield - before)
    }
    if (!(enemy.noMana ?? false) && (enemy.maxMana ?? 0) > 0 && (enemy.manaRegenPerSecond ?? 0) > 0) {
      enemyState.mana = Math.min(
        enemy.maxMana ?? 0,
        enemyState.mana + (enemy.manaRegenPerSecond ?? 0) * dt * (stats.recoveryRateMult ?? 1)
      )
    } else if (enemy.noMana ?? false) {
      enemyState.mana = 0
    }

    // Timed gear triggers
    if ((stats.periodicShockEverySec ?? 0) > 0 && (stats.periodicShockPct ?? 0) > 0) {
      if (t + 1e-9 >= nextPeriodicShockT) {
        const shockPct = stats.periodicShockPct
        const dur = getBaseShockChillDurationSec() * (stats.ailmentDurationMultiplier ?? 1)
        ailmentState.shocks.push({ magnitudePct: shockPct, expiresAt: t + dur })
        enemyDebuffEvents.push({ t, kind: 'shock', magnitudePct: shockPct, durationSec: dur })
        playerAilments.shock = { magnitudePct: shockPct, expiresAt: t + dur }
        nextPeriodicShockT = t + stats.periodicShockEverySec
      }
    }
    if (
      (stats.periodicLifeRegenEverySec ?? 0) > 0
      && (stats.periodicLifeRegenPct ?? 0) > 0
      && (stats.periodicLifeRegenDurationSec ?? 0) > 0
    ) {
      if (t + 1e-9 >= nextPeriodicLifeRegenT) {
        periodicLifeRegenActiveUntil = Math.max(
          periodicLifeRegenActiveUntil,
          t + stats.periodicLifeRegenDurationSec
        )
        nextPeriodicLifeRegenT = t + stats.periodicLifeRegenEverySec
      }
      if (t < periodicLifeRegenActiveUntil && player.life > 0) {
        const rec = stats.lifeRecoveryRateMult ?? 1
        if (lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
          const d = stats.periodicLifeRegenDurationSec
          const pctPerSec = stats.periodicLifeRegenPct / d
          const before = player.life
          player.life = Math.min(runtimeMaxLife, player.life + runtimeMaxLife * (pctPerSec / 100) * dt * rec)
          totalRegenToPlayerLife += Math.max(0, player.life - before)
        }
      }
    }

    // Handle stored/burst ignite expirations (Explosive Shot).
    const expiredDots = ailmentState.dots.filter((d) => d.expiresAt <= t)
    if (expiredDots.length) {
      const anyBurstClear = expiredDots.some((d) => d.kind === 'ignite' && d.burstClearsAllIgnites)
      if (anyBurstClear) {
        // Deal total stored ignite damage from all active ignites at once, then clear.
        const totalStored = ailmentState.dots
          .filter((d) => d.kind === 'ignite')
          .reduce((sum, d) => sum + (d.burstDamageOnExpire ?? 0), 0)
        if (totalStored > 0) {
          const enemyLifeBefore = enemyLife
          applyDamageToEnemyPools(enemyState, totalStored, enemy)
          enemyLife = enemyState.life
          totalDotDamage += totalStored
          if (enemyLifeBefore > 0 && enemyLife <= 0) applyOnKillRecovery(player, stats, runtimeMaxLife)
        }
        ailmentState.dots = ailmentState.dots.filter((d) => d.kind !== 'ignite')
      } else {
        for (const d of expiredDots) {
          const burst = d.burstDamageOnExpire ?? 0
          if (burst > 0) {
            const enemyLifeBefore = enemyLife
            applyDamageToEnemyPools(enemyState, burst, enemy)
            enemyLife = enemyState.life
            totalDotDamage += burst
            if (enemyLifeBefore > 0 && enemyLife <= 0) applyOnKillRecovery(player, stats, runtimeMaxLife)
          }
        }
      }
    }
    ailmentState.dots = ailmentState.dots.filter((d) => d.expiresAt > t)
    ailmentState.shocks = ailmentState.shocks.filter((s) => s.expiresAt > t)
    ailmentState.chills = ailmentState.chills.filter((c) => c.expiresAt > t)

    playerAilments.bleeds = playerAilments.bleeds.filter((b) => b.expiresAt > t)
    playerAilments.poisons = playerAilments.poisons.filter((p) => p.expiresAt > t)
    playerAilments.ignites = playerAilments.ignites.filter((i) => i.expiresAt > t)
    playerAilments.igniteUntil = playerAilments.ignites.reduce(
      (mx, i) => Math.max(mx, i.expiresAt),
      playerAilments.igniteUntil > t ? playerAilments.igniteUntil : 0
    )
    if (playerAilments.shock && playerAilments.shock.expiresAt <= t) playerAilments.shock = null
    if (playerAilments.chill && playerAilments.chill.expiresAt <= t) playerAilments.chill = null
    let dotDpsBleed = 0
    let dotDpsPoison = 0
    let dotDpsIgnite = 0
    for (const d of ailmentState.dots) {
      if (d.kind === 'bleed') dotDpsBleed += d.dps
      else if (d.kind === 'poison') dotDpsPoison += d.dps
      else dotDpsIgnite += d.dps
    }
    const dotDpsTotal = dotDpsBleed + dotDpsPoison + dotDpsIgnite
    if (dotDpsTotal > 0) {
      const tick = dotDpsTotal * dt
      const enemyLifeBeforeDot = enemyLife
      applyDamageToEnemyPools(enemyState, tick, enemy)
      enemyLife = enemyState.life
      if (enemyLifeBeforeDot > 0 && enemyLife <= 0) applyOnKillRecovery(player, stats, runtimeMaxLife)
      totalDotDamage += tick
      dotLogAcc.bleed += dotDpsBleed * dt
      dotLogAcc.poison += dotDpsPoison * dt
      dotLogAcc.ignite += dotDpsIgnite * dt

      // "Your leech effects also apply to damage over time inflicted through bleeding"
      if ((stats.leechAppliesToBleedDot ?? false) && dotDpsBleed > 0) {
        const leechPct = stats.lifeLeechFromPhysicalHitPercent ?? 0
        if (leechPct > 0 && lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
          const rec = stats.lifeRecoveryRateMult ?? 1
          const gain = dotDpsBleed * dt * (leechPct / 100) * rec
          if (gain > 0) player.life = Math.min(runtimeMaxLife, player.life + gain)
        }
      }
      if (t - lastDotLogT + 1e-9 >= DOT_LOG_INTERVAL) {
        const parts: string[] = []
        if (dotLogAcc.bleed > 0) parts.push(`bleed ${dotLogAcc.bleed.toFixed(1)}`)
        if (dotLogAcc.poison > 0) parts.push(`poison ${dotLogAcc.poison.toFixed(1)}`)
        if (dotLogAcc.ignite > 0) parts.push(`ignite ${dotLogAcc.ignite.toFixed(1)}`)
        const sum = dotLogAcc.bleed + dotLogAcc.poison + dotLogAcc.ignite
        const ailSuf = formatActiveEnemyAilmentSuffix(ailmentState, t)
        if (ailSuf) lastDebuffPulseT = t
        tryLog({
          t,
          kind: 'dot_tick',
          message: `DoT — ${sum.toFixed(1)} total (${parts.join(', ')}) · ${enemyPoolsText()} left${ailSuf}`,
          damage: sum,
        })
        dotLogAcc = { bleed: 0, poison: 0, ignite: 0 }
        lastDotLogT = t
      }
    }

    const shockLive = activeShockPct(ailmentState, t)
    const chillM = activeChillMult(ailmentState, t)
    const enemyDebuffActive = shockLive > 0 || chillM < 1 - 1e-6
    if (
      enemyDebuffActive &&
      dotDpsTotal <= 0 &&
      t - lastDebuffPulseT + 1e-9 >= DOT_LOG_INTERVAL
    ) {
      const parts: string[] = []
      if (shockLive > 0) parts.push(`shocked +${shockLive.toFixed(0)}% damage taken`)
      if (chillM < 1 - 1e-6) parts.push(`chilled ${((1 - chillM) * 100).toFixed(0)}% action slow`)
      tryLog({
        t,
        kind: 'ailment',
        message: `Ailment — active on enemy: ${parts.join(' · ')}`,
      })
      lastDebuffPulseT = t
    }

    // Track ailment maxima each step (for UI summary).
    {
      const bleedStacks = ailmentState.dots.filter((d) => d.kind === 'bleed' && d.expiresAt > t).length
      const poisonStacks = ailmentState.dots.filter((d) => d.kind === 'poison' && d.expiresAt > t).length
      const igniteStacks = ailmentState.dots.filter((d) => d.kind === 'ignite' && d.expiresAt > t).length
      enemyAilmentSummary.maxStacks.bleed = Math.max(enemyAilmentSummary.maxStacks.bleed, bleedStacks)
      enemyAilmentSummary.maxStacks.poison = Math.max(enemyAilmentSummary.maxStacks.poison, poisonStacks)
      enemyAilmentSummary.maxStacks.ignite = Math.max(enemyAilmentSummary.maxStacks.ignite, igniteStacks)
      enemyAilmentSummary.maxStacks.shock = Math.max(enemyAilmentSummary.maxStacks.shock, ailmentState.shocks.length)
      enemyAilmentSummary.maxStacks.chill = Math.max(enemyAilmentSummary.maxStacks.chill, ailmentState.chills.length)

      enemyAilmentSummary.maxDotDps.bleed = Math.max(enemyAilmentSummary.maxDotDps.bleed, dotDpsBleed)
      enemyAilmentSummary.maxDotDps.poison = Math.max(enemyAilmentSummary.maxDotDps.poison, dotDpsPoison)
      enemyAilmentSummary.maxDotDps.ignite = Math.max(enemyAilmentSummary.maxDotDps.ignite, dotDpsIgnite)
      enemyAilmentSummary.maxDotDps.total = Math.max(enemyAilmentSummary.maxDotDps.total, dotDpsTotal)

      const shockLive = activeShockPct(ailmentState, t)
      const chillPctLive = activeChillPct(ailmentState, t)
      enemyAilmentSummary.maxNonDotMagnitudePct.shock = Math.max(enemyAilmentSummary.maxNonDotMagnitudePct.shock, shockLive)
      enemyAilmentSummary.maxNonDotMagnitudePct.chill = Math.max(enemyAilmentSummary.maxNonDotMagnitudePct.chill, chillPctLive)
    }

    const poisonCount = playerAilments.poisons.length
    const shockOnYou = playerAilments.shock?.magnitudePct ?? 0
    const chillOnYou = (stats.unaffectedByChill ?? false) ? 0 : (playerAilments.chill?.magnitudePct ?? 0)
    const bleedOnYouDps = playerAilments.bleeds.reduce((sum, b) => sum + b.dps, 0)
    const poisonOnYouDps = playerAilments.poisons.reduce((sum, p) => sum + p.dps, 0)
    const igniteOnYouDps = playerAilments.ignites.reduce((sum, i) => sum + i.dps, 0)
    const totalOnYouDps = bleedOnYouDps + poisonOnYouDps + igniteOnYouDps
    playerAilmentSummary.maxStacks.bleed = Math.max(playerAilmentSummary.maxStacks.bleed, playerAilments.bleeds.length)
    playerAilmentSummary.maxStacks.poison = Math.max(playerAilmentSummary.maxStacks.poison, playerAilments.poisons.length)
    playerAilmentSummary.maxStacks.ignite = Math.max(playerAilmentSummary.maxStacks.ignite, playerAilments.ignites.length)
    playerAilmentSummary.maxDotDps.bleed = Math.max(playerAilmentSummary.maxDotDps.bleed, bleedOnYouDps)
    playerAilmentSummary.maxDotDps.poison = Math.max(playerAilmentSummary.maxDotDps.poison, poisonOnYouDps)
    playerAilmentSummary.maxDotDps.ignite = Math.max(playerAilmentSummary.maxDotDps.ignite, igniteOnYouDps)
    playerAilmentSummary.maxDotDps.total = Math.max(playerAilmentSummary.maxDotDps.total, totalOnYouDps)
    playerAilmentSummary.maxNonDotMagnitudePct.shock = Math.max(playerAilmentSummary.maxNonDotMagnitudePct.shock, shockOnYou)
    playerAilmentSummary.maxNonDotMagnitudePct.chill = Math.max(playerAilmentSummary.maxNonDotMagnitudePct.chill, chillOnYou)
    const chillSelfMult = Math.max(0.05, 1 - chillOnYou / 100)

    let speedMult = chillSelfMult
    if ((enemy.enemiesMoreSpeedMultiplier ?? 1) !== 1) {
      speedMult *= Math.max(0.05, enemy.enemiesMoreSpeedMultiplier ?? 1)
    }
    if (deathPreventUsed && (stats.moreSpeedIfDeathPreventedThisStagePercent ?? 0) > 0) {
      speedMult *= 1 + (stats.moreSpeedIfDeathPreventedThisStagePercent / 100)
    }
    const morePerPoison = stats.moreSpeedPerPoisonOnYouPercent ?? 0
    if (morePerPoison > 0 && poisonCount > 0) speedMult *= 1 + (morePerPoison * poisonCount) / 100
    const morePerShockPct = stats.moreSpeedPerShockEffectOnYouPerPct ?? 0
    if (morePerShockPct > 0 && shockOnYou > 0) speedMult *= 1 + (morePerShockPct * shockOnYou) / 100
    const moreAtkCastPer50Mana = stats.moreAttackAndCastSpeedPer50CurrentManaPct ?? 0
    if (moreAtkCastPer50Mana > 0 && player.mana > 0) {
      speedMult *= 1 + (moreAtkCastPer50Mana / 100) * (player.mana / 50)
    }

    const pAps = playerApsWithBerserker(stats, player.life) * speedMult
    actionBar = Math.min(1, actionBar + pAps * dt)

    if (t + 1e-9 >= nextPlayer && actionBar >= 1 - 1e-9) {
      const cost = stats.manaCostPerAttack
      const payLife = stats.manaCostPaidWithLife ?? false
      const payEs = stats.manaCostPaidWithEnergyShield ?? false
      const canPay = payLife
        ? player.life > cost
        : payEs
          ? player.energyShield >= cost
          : player.mana >= cost
      if (canPay) {
        actionBar = Math.max(0, actionBar - 1)
        if (payLife) player.life -= cost
        else if (payEs) player.energyShield -= cost
        else player.mana -= cost
        // "Take chaos damage equal to X% of ability cost when you cast a spell"
        // Demo model: treat a spell selection as a "cast" event, using the actual cost paid this action.
        const chaosPct = stats.takeChaosDamageEqualToPctOfAbilityCostOnSpellCast ?? 0
        if (chaosPct > 0 && stats.spellDamageComputationBreakdown) {
          player.life = Math.max(0, player.life - cost * (chaosPct / 100))
        }
        const selfPhysPct = stats.takePhysicalDamagePercentOfMaxLifeWhenYouAttack ?? 0
        if (selfPhysPct > 0) {
          player.life = Math.max(0, player.life - runtimeMaxLife * (selfPhysPct / 100))
        }
        const shockNow = activeShockPct(ailmentState, t)
        const enemyLifeBeforeHit = enemyLife
        const fx = stats.abilityLineEffects
        const poisonStacks = ailmentState.dots.filter((d) => d.kind === 'poison' && d.expiresAt > t).length
        const chillPctNow = activeChillPct(ailmentState, t)
        const extraInc =
          (fx?.enemiesTakeIncreasedDamagePerPoisonPercent ?? 0) * poisonStacks
          + (fx?.enemiesTakeIncreasedDamagePerChillEffectPercent ?? 0) * chillPctNow
        const shadowMore = (!firstPlayerActionThisEncounter.used && stats.classBonusesActive.includes('shadow')) ? 1.5 : 1
        if (shadowMore !== 1) firstPlayerActionThisEncounter.used = true
        const atk = resolvePlayerAttack(enemy, enemyLife, stats, player, {
          targetTakesIncreasedDamagePct: shockNow,
          extraTargetTakesIncreasedDamagePct: extraInc,
          moreDamageMult: shadowMore,
        })
        const { damage, damageForAilments, outcome, anyCrit, anyDouble, anyTriple, anyQuad } = atk
        const strikeDetails = (atk as any).strikeDetails as any[] | undefined
        applyDamageToEnemyPools(enemyState, damage, enemy)
        enemyLife = enemyState.life
        totalHitDamageToEnemy += Math.max(0, damage)
        if (enemyLifeBeforeHit > 0 && enemyLife <= 0) applyOnKillRecovery(player, stats, runtimeMaxLife)
        if (damage > 0 || damageForAilments > 0) {
          hitsPlayer++
          const rec = stats.lifeRecoveryRateMult ?? 1
          const portions = damagePortionsFromHit(stats, damage)
          const lifeLeechGain =
            (damage * ((stats.lifeLeechFromHitDamagePercent ?? 0) / 100)
              + portions.physical * ((stats.lifeLeechFromPhysicalHitPercent ?? 0) / 100)) * rec

          // Life-on-hit is not "leech" and should not be scaled by life recovery rate.
          const flatLifeOnHit = (stats.lifeOnHit ?? 0)

          // Life leech routing to ES (if enabled).
          if ((stats.lifeLeechAppliesToEnergyShield ?? false) && stats.maxEnergyShield > 0) {
            const esBefore = player.energyShield
            player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + lifeLeechGain)
            totalRegenToPlayerEs += Math.max(0, player.energyShield - esBefore)
          } else if ((flatLifeOnHit !== 0 || lifeLeechGain !== 0) && lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
            const before = player.life
            player.life = Math.min(runtimeMaxLife, Math.max(0, player.life + flatLifeOnHit + lifeLeechGain))
            totalRegenToPlayerLife += Math.max(0, player.life - before)

            // Excess life recovery from leech to ES (if enabled).
            if ((stats.excessLifeLeechRecoveryToEnergyShield ?? false) && stats.maxEnergyShield > 0) {
              const overflow = Math.max(0, before + flatLifeOnHit + lifeLeechGain - runtimeMaxLife)
              if (overflow > 0) {
                const esBefore = player.energyShield
                player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + overflow)
                totalRegenToPlayerEs += Math.max(0, player.energyShield - esBefore)
              }
            }
          }

          // Mana leech (physical-only, attacks) — recovered as mana.
          const manaLeechPct = stats.manaLeechFromPhysicalHitPercent ?? 0
          if (!(stats.noMana ?? false) && stats.maxMana > 0 && manaLeechPct > 0) {
            const manaBefore = player.mana
            player.mana = Math.min(stats.maxMana, player.mana + portions.physical * (manaLeechPct / 100))
            totalRegenToPlayerMana += Math.max(0, player.mana - manaBefore)
          }
          const spellEsLeechPct = stats.spellHitDamageLeechedAsEnergyShieldPercent ?? 0
          if (spellEsLeechPct > 0 && stats.maxEnergyShield > 0) {
            // Demo simplification: apply spell hit leech to ES on any hit event (we don't simulate actual spell casts here).
            const gainEs = damage * (spellEsLeechPct / 100)
            if (gainEs > 0) {
              const esBefore = player.energyShield
              player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + gainEs)
              totalRegenToPlayerEs += Math.max(0, player.energyShield - esBefore)
            }
          }
        }
        {
          const hitWasCritical =
            (stats.firstAttackAlwaysCrit ?? false) && !firstHitFlag.used
              ? true
              : anyCrit
          const tags = [
            hitWasCritical ? 'CRIT' : null,
            anyQuad ? 'QUAD' : null,
            (!anyQuad && anyTriple) ? 'TRIPLE' : null,
            (!anyQuad && !anyTriple && anyDouble) ? 'DOUBLE' : null,
          ].filter(Boolean) as string[]
          const tagStr = tags.length ? ` (${tags.join(', ')})` : ''
          const msg =
            outcome === 'miss'
              ? 'Your attack was evaded'
              : outcome === 'enemy_blocked' && damage > 0
                ? `Enemy blocked — you deal ${damage.toFixed(1)} (${enemyPoolsText()} left)`
                : damage > 0
                  ? `You hit for ${damage.toFixed(1)}${tagStr} (${enemyPoolsText()} left)`
                  : 'Glancing hit (no damage)'
          tryLog({
            t,
            kind: 'player_attack',
            message: msg,
            damage,
            details: {
              kind: 'player_attack',
              outcome,
              tags,
              strikes: (strikeDetails as any[]) ?? [],
              multipliers: {
                damageDealtLessMult: stats.damageDealtLessMult ?? 1,
                shockPct: shockNow,
                extraIncPct: extraInc,
                moreDamageMult: shadowMore,
              },
            },
          })
        }
        if (damageForAilments > 0) {
          const hitWasCritical = (stats.firstAttackAlwaysCrit ?? false) && !firstHitFlag.used ? true : anyCrit
          firstHitFlag.used = true
          applyPlayerAilmentsOnHit(
            stats,
            damageForAilments,
            enemy.maxLife,
            t,
            ailmentState,
            playerAilments,
            hitWasCritical,
            log,
            tryLog,
            enemyDebuffEvents
          )
          const extraOnCrit = stats.extraHitOnCritChance ?? 0
          if (hitWasCritical && extraOnCrit > 0 && Math.random() * 100 < extraOnCrit) {
            const r2 = resolvePlayerAttack(enemy, enemyLife, stats, player, { targetTakesIncreasedDamagePct: shockNow })
            enemyLife -= r2.damage
          }
          if (enemyLife > 0) {
            const fixedExec = stats.executeEnemiesBelowLifePercent ?? 0
            const chillExec = (stats.executeEnemiesBelowLifePercentEqualToChillEffect ?? false)
              ? activeChillPct(ailmentState, t)
              : 0
            const execPct = Math.max(fixedExec, chillExec)
            if (execPct > 0 && enemyLife <= enemy.maxLife * (execPct / 100)) {
              enemyState.life = 0
              enemyState.energyShield = 0
              enemyLife = 0
            }
          }
        }
        if (
          outcome === 'enemy_blocked'
          && (enemy.counterAttackOnBlock ?? false)
          && (enemy.counterAttackFirePctOfPrevented ?? 0) > 0
          && atk.blockedPreventedTotal > 0
          && player.life > 0
        ) {
          const extraFire = atk.blockedPreventedTotal * ((enemy.counterAttackFirePctOfPrevented ?? 0) / 100)
          const counterEnemy: DemoEnemyDef = {
            ...enemy,
            damageMin: extraFire,
            damageMax: extraFire,
            physicalDamageMin: 0,
            physicalDamageMax: 0,
            elementalDamageMin: 0,
            elementalDamageMax: 0,
            fireDamageMin: extraFire,
            fireDamageMax: extraFire,
            coldDamageMin: 0,
            coldDamageMax: 0,
            lightningDamageMin: 0,
            lightningDamageMax: 0,
            chaosDamageMin: 0,
            chaosDamageMax: 0,
          }
          const rCtr = resolveEnemyAttack(counterEnemy, stats, player, firstHitFlag, runtimeMaxLife)
          if (rCtr.damageToDisplay > 0 || rCtr.blocked) {
            const dmgCtr = rCtr.damageToDisplay ?? 0
            tryLog({
              t,
              kind: 'enemy_attack',
              message:
                rCtr.damageToDisplay > 0
                  ? `Enemy counter attack — ${dmgCtr.toFixed(1)}${rCtr.critical ? ' (CRIT)' : ''}${rCtr.blocked ? ' (blocked)' : ''}`
                  : 'Enemy counter attack blocked',
              damage: dmgCtr,
            })
          } else if (rCtr.evaded || rCtr.dodged) {
            tryLog({ t, kind: 'enemy_attack', message: `Enemy counter attack ${rCtr.evaded ? 'evaded' : 'dodged'}` })
          }
          if (!rCtr.evaded && !rCtr.dodged && rCtr.damageToDisplay > 0) hitsEnemy++
          totalDamageToPlayerFromEnemyHits += Math.max(0, rCtr.damageToDisplay ?? 0)
          if (rCtr.damageToDisplay > 0 && (enemyLifeLeechPct > 0 || enemyEsLeechPct > 0)) {
            const leeched = rCtr.damageToDisplay
            if (enemyLifeLeechPct > 0) {
              enemyState.life = Math.min(enemy.maxLife, enemyState.life + leeched * (enemyLifeLeechPct / 100))
            }
            if (enemyEsLeechPct > 0) {
              const maxEs = Math.max(enemyState.energyShield, enemy.maxEnergyShield ?? 0)
              enemyState.energyShield = Math.min(maxEs, enemyState.energyShield + leeched * (enemyEsLeechPct / 100))
            }
            enemyLife = enemyState.life
          }
        }
        // Action bar set after cast (demo: treat our attack as an action)
        const setAfter = stats.actionBarSetToPercentAfterCast ?? 0
        if (setAfter > 0) actionBar = Math.min(1, Math.max(0, setAfter / 100))
      } else {
        tryLog({
          t,
          kind: 'player_attack',
          message: payLife
            ? 'Not enough life — attack skipped'
            : payEs
              ? 'Not enough energy shield — attack skipped'
              : 'Out of mana — attack skipped',
        })
      }
      // Next possible time we re-check. Action bar may allow earlier if filled by uniques.
      nextPlayer = t + dt
    }

    const chillMult = activeChillMult(ailmentState, t)
    if (t + 1e-9 >= nextEnemy) {
      const enemyCost = Math.max(0, enemy.manaCostPerAttack ?? 0)
      const payLife = enemy.manaCostPaidWithLife ?? false
      const payEs = enemy.manaCostPaidWithEnergyShield ?? false
      const enemyCanPay =
        (enemy.noMana ?? false)
          ? true
          : payLife
            ? enemyState.life > enemyCost
            : payEs
              ? enemyState.energyShield >= enemyCost
              : enemyState.mana >= enemyCost
      if (!enemyCanPay) {
        tryLog({
          t,
          kind: 'enemy_attack',
          message: payLife
            ? `${enemy.name} lacks life for action cost`
            : payEs
              ? `${enemy.name} lacks ES for action cost`
              : `${enemy.name} lacks mana for action cost`,
        })
        nextEnemy = t + 1 / Math.max(0.15, apsEnemy * chillMult)
        t += dt
        pushTimeline()
        continue
      }
      if (!(enemy.noMana ?? false) && enemyCost > 0) {
        if (payLife) enemyState.life = Math.max(0, enemyState.life - enemyCost)
        else if (payEs) enemyState.energyShield = Math.max(0, enemyState.energyShield - enemyCost)
        else enemyState.mana = Math.max(0, enemyState.mana - enemyCost)
      }
      const enemyChaosPct = enemy.takeChaosDamageEqualToPctOfAbilityCostOnSpellCast ?? 0
      if ((enemy.attackIsSpell ?? false) && enemyChaosPct > 0 && enemyCost > 0) {
        enemyState.life = Math.max(0, enemyState.life - enemyCost * (enemyChaosPct / 100))
      }
      const enemySelfPhysPct = enemy.takePhysicalDamagePercentOfMaxLifeWhenYouAttack ?? 0
      if (enemySelfPhysPct > 0) {
        enemyState.life = Math.max(0, enemyState.life - enemy.maxLife * (enemySelfPhysPct / 100))
      }
      enemyLife = enemyState.life
      if (enemyLife <= 0) {
        tryLog({ t, kind: 'phase', message: `${enemy.name} died from self-costs` })
        nextEnemy = t + 1 / Math.max(0.15, apsEnemy * chillMult)
        t += dt
        pushTimeline()
        continue
      }
      const r = resolveEnemyAttack(enemy, stats, player, firstHitFlag, runtimeMaxLife)
      if (r.blocked) {
        const fill = stats.actionBarFilledByPercentOnBlock ?? 0
        if (fill > 0) actionBar = Math.min(1, actionBar + fill / 100)
      }

      // Log the enemy attack first (so counters appear after the hit at the same timestamp).
      if (r.evaded) tryLog({ t, kind: 'enemy_attack', message: `${enemy.name} attack evaded` })
      else if (r.dodged) tryLog({ t, kind: 'enemy_attack', message: `${enemy.name} attack dodged` })
      else if (r.damageToDisplay > 0 || r.blocked) {
        const dmg = r.damageToDisplay ?? 0
        tryLog({
          t,
          kind: 'enemy_attack',
          message: `${enemy.name} hits for ${dmg.toFixed(1)}${r.critical ? ' (CRIT)' : ''}${r.blocked ? ' (blocked)' : ''}`,
          damage: dmg,
          details: {
            kind: 'enemy_attack',
            enemy: enemy.name,
            flags: {
              enemyAttackIsSpell: (enemy as any).attackIsSpell ?? false,
              critical: r.critical,
              blocked: r.blocked,
            },
            roll: {
              baseRange: [enemy.damageMin, enemy.damageMax],
              rawBeforeMitigation: r.fullBeforeArmour,
            },
            mitigation: {
              damageTakenMultiplierFromGear: stats.damageTakenMultiplierFromGear ?? 1,
              championDamageReductionFrac: championDamageReductionFrac(stats, player.life),
              blockedDamagePreventedBeforeArmour: r.preventedByBlock,
              mitigatedByArmour: r.mitigatedByArmour,
              preventedTotal: r.preventedTotal,
            },
            final: {
              damageAppliedToPools: dmg,
              playerPoolsAfter: { ...player },
            },
          },
        })
      } else {
        tryLog({
          t,
          kind: 'enemy_attack',
          message: `${enemy.name} hits for 0.0 (fully mitigated)`,
          damage: 0,
          details: {
            kind: 'enemy_attack',
            enemy: enemy.name,
            flags: {
              enemyAttackIsSpell: (enemy as any).attackIsSpell ?? false,
              critical: r.critical,
              blocked: r.blocked,
            },
            roll: {
              baseRange: [enemy.damageMin, enemy.damageMax],
              rawBeforeMitigation: r.fullBeforeArmour,
            },
            mitigation: {
              damageTakenMultiplierFromGear: stats.damageTakenMultiplierFromGear ?? 1,
              championDamageReductionFrac: championDamageReductionFrac(stats, player.life),
              blockedDamagePreventedBeforeArmour: r.preventedByBlock,
              mitigatedByArmour: r.mitigatedByArmour,
              preventedTotal: r.preventedTotal,
            },
            final: {
              damageAppliedToPools: 0,
              playerPoolsAfter: { ...player },
            },
          },
        })
      }

      // Siegebreaker-style: blocked hit → counter attack with added fire from prevented damage.
      if (
        r.blocked
        && stats.counterAttackOnBlock
        && stats.counterAttackFirePctOfPrevented > 0
        && r.preventedByBlock > 0
        && enemyLife > 0
      ) {
        // Siegebreaker text: "…50% of total prevented damage…"
        // Use total prevented damage vs the player (post-mitigation vs pools),
        // not only the portion prevented by the block multiplier.
        const extraFire = (r.preventedTotal * stats.counterAttackFirePctOfPrevented) / 100
        const shockNow = activeShockPct(ailmentState, t)
        const fx = stats.abilityLineEffects
        const poisonStacks = ailmentState.dots.filter((d) => d.kind === 'poison' && d.expiresAt > t).length
        const chillPctNow = activeChillPct(ailmentState, t)
        const extraInc =
          (fx?.enemiesTakeIncreasedDamagePerPoisonPercent ?? 0) * poisonStacks
          + (fx?.enemiesTakeIncreasedDamagePerChillEffectPercent ?? 0) * chillPctNow
        const enemyLifeBeforeCounter = enemyLife
        const ctr = resolvePlayerAttack(enemy, enemyLife, stats, player, {
          targetTakesIncreasedDamagePct: shockNow,
          extraTargetTakesIncreasedDamagePct: extraInc,
          extraFlatFireDamage: extraFire,
        })
        applyDamageToEnemyPools(enemyState, ctr.damage, enemy)
        enemyLife = enemyState.life
        if (enemyLifeBeforeCounter > 0 && enemyLife <= 0) applyOnKillRecovery(player, stats, runtimeMaxLife)
        if (ctr.damage > 0 || ctr.damageForAilments > 0) hitsPlayer++
        {
          const tags = [
            ctr.anyCrit ? 'CRIT' : null,
            ctr.anyQuad ? 'QUAD' : null,
            (!ctr.anyQuad && ctr.anyTriple) ? 'TRIPLE' : null,
            (!ctr.anyQuad && !ctr.anyTriple && ctr.anyDouble) ? 'DOUBLE' : null,
          ].filter(Boolean) as string[]
          const tagStr = tags.length ? ` (${tags.join(', ')})` : ''
          const msg =
            ctr.outcome === 'miss'
              ? 'Counter attack evaded'
              : ctr.outcome === 'enemy_blocked' && ctr.damage > 0
                ? `Counter attack — enemy blocked, ${ctr.damage.toFixed(1)} (${enemyPoolsText()} left)`
                : ctr.damage > 0
                  ? `Counter attack — ${ctr.damage.toFixed(1)}${tagStr} (${enemyPoolsText()} left)`
                  : 'Counter attack (no damage)'
          tryLog({
            t,
            kind: 'player_attack',
            message: msg,
            damage: ctr.damage,
            details: {
              kind: 'counter_attack',
              preventedTotal: r.preventedTotal,
              counterPct: stats.counterAttackFirePctOfPrevented,
              extraFlatFireDamage: extraFire,
              strikes: (ctr as any).strikeDetails ?? [],
            },
          })
        }
        if (ctr.damageForAilments > 0) {
          applyPlayerAilmentsOnHit(
            stats,
            ctr.damageForAilments,
            enemy.maxLife,
            t,
            ailmentState,
            playerAilments,
            ctr.anyCrit,
            log,
            tryLog,
            enemyDebuffEvents
          )
          if (enemyLife > 0) {
            const fixedExec = stats.executeEnemiesBelowLifePercent ?? 0
            const chillExec = (stats.executeEnemiesBelowLifePercentEqualToChillEffect ?? false)
              ? activeChillPct(ailmentState, t)
              : 0
            const execPct = Math.max(fixedExec, chillExec)
            if (execPct > 0 && enemyLife <= enemy.maxLife * (execPct / 100)) {
              enemyState.life = 0
              enemyState.energyShield = 0
              enemyLife = 0
            }
          }
        }
      }

      if ((r.evaded || r.dodged) && stats.classBonusesActive.includes('shadow')) {
        actionBar = Math.min(1, actionBar + 0.35)
      }
      if (!r.evaded && !r.dodged && r.damageToDisplay > 0) hitsEnemy++
      totalDamageToPlayerFromEnemyHits += Math.max(0, r.damageToDisplay ?? 0)

      const typedHitTotal =
        r.damageByType.physical
        + r.damageByType.fire
        + r.damageByType.cold
        + r.damageByType.lightning
        + r.damageByType.chaos
      if (!r.evaded && !r.dodged && typedHitTotal > 0.01) {
        applyEnemyModifierAilmentsOnHit(
          rawMods,
          r.damageByType,
          runtimeMaxLife,
          t,
          playerAilments,
          stats,
          tryLog
        )
      }

      // Enemy leech from damage dealt (post-mitigation value).
      if (r.damageToDisplay > 0 && (enemyLifeLeechPct > 0 || enemyEsLeechPct > 0)) {
        const leeched = r.damageToDisplay
        if (enemyLifeLeechPct > 0) {
          enemyState.life = Math.min(enemy.maxLife, enemyState.life + leeched * (enemyLifeLeechPct / 100))
        }
        if (enemyEsLeechPct > 0) {
          const maxEs = Math.max(enemyState.energyShield, enemy.maxEnergyShield ?? 0)
          enemyState.energyShield = Math.min(maxEs, enemyState.energyShield + leeched * (enemyEsLeechPct / 100))
        }
        enemyLife = enemyState.life
      }

      nextEnemy = t + 1 / Math.max(0.15, apsEnemy * chillMult)
    }

    // Mana regeneration (optionally diverted to ES, and disabled if no-mana)
    const regenToEs = stats.manaRegenAppliesToEnergyShieldPercent ?? 0
    const recAll = stats.recoveryRateMult ?? 1
    const manaRegen = stats.manaRegenPerSecond * dt * recAll
    if ((stats.noMana ?? false) || stats.maxMana <= 0) {
      player.mana = 0
    } else {
      const toEs = stats.maxEnergyShield > 0 ? manaRegen * (regenToEs / 100) : 0
      const toMana = manaRegen - toEs
      const manaBefore = player.mana
      player.mana = Math.min(stats.maxMana, player.mana + toMana)
      totalRegenToPlayerMana += Math.max(0, player.mana - manaBefore)
      if (toEs > 0) {
        const esBefore = player.energyShield
        player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + toEs)
        totalRegenToPlayerEs += Math.max(0, player.energyShield - esBefore)
      }
    }
    const ignited = playerAilments.igniteUntil > t
    const baseLifeRegenPct = stats.lifeRegenPercentOfMaxPerSecond ?? 0
    const ignitedBonus = ignited ? (stats.lifeRegenPercentOfMaxPerSecondWhileIgnited ?? 0) : 0
    const ascendantLifeRegenPct = stats.classBonusesActive.includes('ascendant') ? 5 : 0
    const lifeRegenPct = baseLifeRegenPct + ignitedBonus + ascendantLifeRegenPct
    if (lifeRegenPct > 0 && player.life > 0) {
      const rec = stats.lifeRecoveryRateMult ?? 1
      if (lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
        const before = player.life
        player.life = Math.min(
          runtimeMaxLife,
          player.life + runtimeMaxLife * (lifeRegenPct / 100) * dt * rec
        )
        totalRegenToPlayerLife += Math.max(0, player.life - before)
      }
    }
    // Ascendant: 50% of life regeneration per second also applies to your energy shield.
    if (stats.classBonusesActive.includes('ascendant') && stats.maxEnergyShield > 0) {
      const rec = stats.lifeRecoveryRateMult ?? 1
      const toEs = runtimeMaxLife * ((baseLifeRegenPct + ignitedBonus + ascendantLifeRegenPct) / 100) * dt * rec * 0.5
      if (toEs > 0) {
        const before = player.energyShield
        player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + toEs)
        totalRegenToPlayerEs += Math.max(0, player.energyShield - before)
      }
    }
    const flatLifeRegen = stats.flatLifeRegenPerSecond ?? 0
    if (flatLifeRegen > 0 && player.life > 0 && lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
      const rec = stats.lifeRecoveryRateMult ?? 1
      const before = player.life
      player.life = Math.min(runtimeMaxLife, player.life + flatLifeRegen * dt * rec)
      totalRegenToPlayerLife += Math.max(0, player.life - before)
    }

    // Damaging ailments on player (from reflections and enemy damaging modifiers).
    let bleedSelfDps = 0
    for (const b of playerAilments.bleeds) bleedSelfDps += b.dps
    if (bleedSelfDps > 0) {
      const tick = bleedSelfDps * dt
      player.life = Math.max(0, player.life - tick)
      totalDamageToPlayerFromDots += Math.max(0, tick)
      if (tick > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — Bleed on you: ${tick.toFixed(1)} (${bleedSelfDps.toFixed(1)} DPS)`, damage: tick })
      }
    }

    let igniteSelfDps = 0
    for (const i of playerAilments.ignites) igniteSelfDps += i.dps
    if (igniteSelfDps > 0) {
      const tick = igniteSelfDps * dt
      player.life = Math.max(0, player.life - tick)
      totalDamageToPlayerFromDots += Math.max(0, tick)
      if (tick > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — Ignite on you: ${tick.toFixed(1)} (${igniteSelfDps.toFixed(1)} DPS)`, damage: tick })
      }
    }

    const poisonTakenLess = Math.min(100, Math.max(0, stats.poisonDamageTakenLessPercent ?? 0))
    let poisonSelfDps = 0
    for (const p of playerAilments.poisons) poisonSelfDps += p.dps
    if (poisonSelfDps > 0) {
      const tick = poisonSelfDps * dt * (1 - poisonTakenLess / 100)
      player.life = Math.max(0, player.life - tick)
      totalDamageToPlayerFromDots += Math.max(0, tick)
      if (tick > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — Poison on you: ${tick.toFixed(1)} (${(poisonSelfDps * (1 - poisonTakenLess / 100)).toFixed(1)} DPS)`, damage: tick })
      }
    }

    // Flat self damage over time from gear
    const loseLife = stats.loseLifePerSecond ?? 0
    if (loseLife > 0) {
      const tick = loseLife * dt
      player.life = Math.max(0, player.life - tick)
      totalDamageToPlayerFromSelf += Math.max(0, tick)
      if (loseLife * dt > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — You lose ${loseLife.toFixed(0)} life/s`, damage: loseLife * dt })
      }
    }
    const chaosDps = stats.takeChaosDamagePerSecond ?? 0
    if (chaosDps > 0) {
      // Simplified: treat as direct life loss (ignores ES / chaos bypass rules)
      const tick = chaosDps * dt
      player.life = Math.max(0, player.life - tick)
      totalDamageToPlayerFromSelf += Math.max(0, tick)
      if (chaosDps * dt > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — You take ${chaosDps.toFixed(0)} chaos damage/s`, damage: chaosDps * dt })
      }
    }
    const chaosDpsAfterPrevent = deathPreventUsed ? (stats.takeChaosDamagePerSecondIfDeathPrevented ?? 0) : 0
    if (chaosDpsAfterPrevent > 0) {
      const tick = chaosDpsAfterPrevent * dt
      player.life = Math.max(0, player.life - tick)
      totalDamageToPlayerFromSelf += Math.max(0, tick)
    }

    if (player.life <= 0 && (stats.preventDeathOncePerStage ?? false) && !deathPreventUsed) {
      deathPreventUsed = true
      runtimeMaxLife = Math.max(1, runtimeMaxLife * 0.5)
      player.life = runtimeMaxLife
      {
        tryLog({ t, kind: 'phase', message: `Death prevented — max life halved to ${runtimeMaxLife.toFixed(0)} and life restored` })
      }
    }
    const esRegenPct = stats.esRegenPercentOfMaxPerSecond ?? 0
    if (esRegenPct > 0 && stats.maxEnergyShield > 0) {
      const before = player.energyShield
      player.energyShield = Math.min(
        stats.maxEnergyShield,
        player.energyShield + stats.maxEnergyShield * (esRegenPct / 100) * dt * recAll
      )
      totalRegenToPlayerEs += Math.max(0, player.energyShield - before)
    }

    // Conditional mana sacrifice (current mana per second)
    const manaSacPct = stats.sacrificeCurrentManaPercentPerSecond ?? 0
    if (manaSacPct > 0 && player.mana > 0 && !(stats.noMana ?? false)) {
      player.mana = Math.max(0, player.mana * (1 - (manaSacPct / 100) * dt))
    }
    t += dt
    pushTimeline()
  }

  let winner: EncounterResult['winner'] = 'timeout'
  if (enemyLife <= 0) winner = 'player'
  else if (player.life <= 0) winner = 'enemy'

  log.push({
    t,
    kind: 'phase',
    message:
      winner === 'player'
        ? 'Victory'
        : winner === 'enemy'
          ? 'Defeat'
          : `Timed out at ${maxDuration}s`,
  })

  return {
    winner,
    durationSeconds: t,
    playerFinal: player,
    enemyLifeFinal: enemyLife,
    enemyEnergyShieldFinal: enemyState.energyShield,
    log,
    hitsLandedPlayer: hitsPlayer,
    hitsLandedEnemy: hitsEnemy,
    totalDotDamageToEnemy: totalDotDamage,
    enemyDebuffEvents,
    enemyAilmentSummary,
    playerAilmentSummary,
    logTruncated,
    timeline,
    totals: {
      damageToEnemy: totalHitDamageToEnemy + totalDotDamage,
      damageToEnemyFromHits: totalHitDamageToEnemy,
      damageToEnemyFromDots: totalDotDamage,

      damageToPlayer:
        totalDamageToPlayerFromEnemyHits + totalDamageToPlayerFromDots + totalDamageToPlayerFromSelf,
      damageToPlayerFromEnemyHits: totalDamageToPlayerFromEnemyHits,
      damageToPlayerFromDots: totalDamageToPlayerFromDots,
      damageToPlayerFromSelf: totalDamageToPlayerFromSelf,

      regenToPlayerLife: totalRegenToPlayerLife,
      regenToPlayerMana: totalRegenToPlayerMana,
      regenToPlayerEnergyShield: totalRegenToPlayerEs,

      regenToEnemyLife: totalRegenToEnemyLife,
      regenToEnemyEnergyShield: totalRegenToEnemyEs,
    },
  }
}
