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
  DEFAULT_BLOCK_DAMAGE_TAKEN_MULT,
  type BattleContext,
  type BattleLogEntry,
  type BattleParticipantState,
  type DemoEnemyDef,
  type EncounterResult,
  type EnemyDebuffEvent,
} from './types'

type DotKind = 'bleed' | 'poison' | 'ignite'

interface DotInstance {
  kind: DotKind
  dps: number
  expiresAt: number
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
  poisons: { expiresAt: number; dps: number }[]
  igniteUntil: number
  shock: NonDotAilmentInstance | null
  chill: NonDotAilmentInstance | null
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


function mitigatedPlayerHitVsArmour(enemy: DemoEnemyDef, stats: ComputedBuildStats, raw: number): number {
  const armourIgnoredFrac = stats.armourIgnorePercent / 100
  const baseArmour = enemy.armour
  const elePen = stats.elementalPenetrationPercent ?? 0

  // Split raw hit into per-type amounts using current fractions
  const a = avgHitByDamageType(stats)
  const total = Math.max(1, a.total)
  const physAmt  = raw * (a.physical  / total)
  const fireAmt  = raw * (a.fire      / total)
  const coldAmt  = raw * (a.cold      / total)
  const lightAmt = raw * (a.lightning / total)
  const chaosAmt = raw * (a.chaos     / total)

  // Apply armour DR per type using the full multi-type formula (ARMOUR_RESISTANCE splits armour)
  function afterArmour(amt: number, type: Parameters<typeof computeArmourDR>[3]): number {
    if (amt <= 0) return 0
    const dr = computeArmourDR(baseArmour, amt, raw, type, armourIgnoredFrac)
    return amt * (1 - dr)
  }

  let physOut  = afterArmour(physAmt,  'physical')
  let fireOut  = afterArmour(fireAmt,  'fire')
  let coldOut  = afterArmour(coldAmt,  'cold')
  let lightOut = afterArmour(lightAmt, 'lightning')
  let chaosOut = afterArmour(chaosAmt, 'chaos')

  // Apply resistances (optionally mirrored to player resists)
  const enemyFire = stats.enemyResistancesEqualToYours ? stats.fireRes : (enemy.fireResistancePercent ?? 0)
  const enemyCold = stats.enemyResistancesEqualToYours ? stats.coldRes : (enemy.coldResistancePercent ?? 0)
  const enemyLight = stats.enemyResistancesEqualToYours ? stats.lightningRes : (enemy.lightningResistancePercent ?? 0)
  const enemyChaos = stats.enemyResistancesEqualToYours ? stats.chaosRes : (enemy.chaosResistancePercent ?? 0)

  const fr = Math.max(0, enemyFire - (stats.firePenetrationPercent ?? 0) - elePen)
  const cr = Math.max(0, enemyCold - (stats.coldPenetrationPercent ?? 0) - elePen)
  const lr = Math.max(0, enemyLight - (stats.lightningPenetrationPercent ?? 0) - elePen)
  const chr = Math.max(0, enemyChaos - (stats.chaosPenetrationPercent ?? 0))

  if (fr  > 0) fireOut  *= 1 - fr  / 100
  if (cr  > 0) coldOut  *= 1 - cr  / 100
  if (lr  > 0) lightOut *= 1 - lr  / 100
  if (chr > 0) chaosOut *= 1 - chr / 100

  return physOut + fireOut + coldOut + lightOut + chaosOut
}

function enemyApsMultiplier(stats: ComputedBuildStats): number {
  let m = 1
  if (stats.classBonusesActive.includes('windrunner')) m *= 1 - 0.1
  if (stats.classBonusesActive.includes('trickster')) m *= 1 - 0.05
  if ((stats.enemiesMoreSpeedMultiplier ?? 1) !== 1) m *= stats.enemiesMoreSpeedMultiplier ?? 1
  return m
}

function enemyDamageTakenMultiplier(stats: ComputedBuildStats, enemyLifeFrac: number): number {
  let m = 1
  if (stats.classBonusesActive.includes('windrunner')) m *= 1 + 0.15
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

function resolvePlayerAttack(
  enemy: DemoEnemyDef,
  enemyLife: number,
  stats: ComputedBuildStats,
  attackOpts?: { targetTakesIncreasedDamagePct: number }
): { damage: number; outcome: PlayerHitOutcome; anyCrit: boolean; anyDouble: boolean; anyTriple: boolean } {
  const evadePct = stats.hitsCannotBeEvaded
    ? 0
    : computeEvasionChancePercent(stats.accuracy, enemy.evasionRating, 0)
  const miss = Math.random() * 100 < evadePct
  if (miss) return { damage: 0, outcome: 'miss', anyCrit: false, anyDouble: false, anyTriple: false }

  const blk = enemy.blockChance ?? 0
  const zealot = stats.classBonusesActive.includes('zealot')
  const strikes = Math.max(1, stats.strikesPerAttack ?? 1)
  let total = 0
  let blockedStrikes = 0
  let anyCrit = false
  let anyDouble = false
  let anyTriple = false

  for (let s = 0; s < strikes; s++) {
    const blocked = blk > 0 && Math.random() * 100 < blk
    if (blocked) blockedStrikes++

    let base = rollDamage(stats.hitDamageMin, stats.hitDamageMax, zealot)
    if (blocked) base *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT

    let isCrit = false
    if (!blocked) {
      if (Math.random() * 100 < stats.critChance) {
        base *= stats.critMultiplier
        isCrit = true
      }
      if (isCrit) anyCrit = true

      const tChance = stats.tripleDamageChance ?? 0
      if (stats.classBonusesActive.includes('destroyer')) {
        const tripleChance = stats.doubleDamageChance / 2
        if (Math.random() * 100 < tripleChance) {
          base *= 3
          anyTriple = true
        } else if (Math.random() * 100 < stats.doubleDamageChance) {
          base *= 2
          anyDouble = true
        }
      } else if (tChance > 0 && Math.random() * 100 < tChance) {
        base *= 3
        anyTriple = true
      } else if (Math.random() * 100 < stats.doubleDamageChance) {
        // Damage proc chaining: if we "would deal double", allow upgrade to triple
        const up = stats.doubleDamageUpgradesToTripleChance ?? 0
        if (up > 0 && Math.random() * 100 < up) {
          base *= 3
          anyTriple = true
        } else {
          base *= 2
          anyDouble = true
        }
      }
      // Damage proc chaining: if we "would deal triple", allow upgrade to quadruple
      if (anyTriple) {
        const up4 = stats.tripleDamageUpgradesToQuadrupleChance ?? 0
        if (up4 > 0 && Math.random() * 100 < up4) {
          base *= 4 / 3
        }
      }

      if (stats.dealNoDamageExceptCrit && !isCrit) base = 0
    }

    base *= stats.damageDealtLessMult ?? 1
    const frac = enemyLife / Math.max(1, enemy.maxLife)
    base *= enemyDamageTakenMultiplier(stats, frac)
    const shockPct = attackOpts?.targetTakesIncreasedDamagePct ?? 0
    if (shockPct > 0) base *= 1 + shockPct / 100

    total += mitigatedPlayerHitVsArmour(enemy, stats, base)
  }

  const outcome: PlayerHitOutcome =
    blockedStrikes === strikes && strikes > 0 ? 'enemy_blocked' : 'hit'
  return { damage: total, outcome, anyCrit, anyDouble, anyTriple }
}

const BASE_BLEED_SEC = 5
const BASE_POISON_SEC = 4
const BASE_IGNITE_SEC = 4
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
  maxLog: number,
  debuffEvents: EnemyDebuffEvent[]
): void {
  if (mitigatedDamage <= 0) return

  const { bleedInherentMult, igniteInherentMult, poisonInherentMult } = FORMULA_CONSTANTS
  const durMult = stats.ailmentDurationMultiplier
  const dotMult =
    (1 + stats.damageOverTimeMultiplier / 100) * (stats.dotDamageMoreMultiplier ?? 1)
  const portions = damagePortionsFromHit(stats, mitigatedDamage)

  const tryLogAilment = (msg: string) => {
    if (log.length < maxLog) log.push({ t, kind: 'ailment', message: msg })
  }

  if (portions.physical > 0.01 && Math.random() * 100 < stats.bleedChance) {
    const dps = ((portions.physical * bleedInherentMult) / BASE_BLEED_SEC) * dotMult
    state.dots.push({
      kind: 'bleed',
      dps,
      expiresAt: t + BASE_BLEED_SEC * durMult,
    })
    tryLogAilment(`Ailment — Bleed (DoT): ~${dps.toFixed(1)} DPS for ${(BASE_BLEED_SEC * durMult).toFixed(1)}s`)
  }

  const poisonChance = (stats.critsAlwaysInflictPoison && hitWasCritical) ? 100 : stats.poisonChance
  if (Math.random() * 100 < poisonChance) {
    const dps = ((mitigatedDamage * poisonInherentMult) / BASE_POISON_SEC) * dotMult
    state.dots.push({
      kind: 'poison',
      dps,
      expiresAt: t + BASE_POISON_SEC * durMult,
    })
    tryLogAilment(`Ailment — Poison (DoT): ~${dps.toFixed(1)} DPS for ${(BASE_POISON_SEC * durMult).toFixed(1)}s`)
    if (stats.poisonYouInflictReflectedToYou ?? false) {
      const avoid = Math.min(100, Math.max(0, stats.avoidAilmentsChance ?? 0))
      if (Math.random() * 100 >= avoid) {
        playerAilments.poisons.push({ expiresAt: t + BASE_POISON_SEC * durMult, dps })
        tryLogAilment(`Ailment — Poison reflected to you (${(BASE_POISON_SEC * durMult).toFixed(1)}s)`)
      } else {
        tryLogAilment(`Ailment — Poison reflected to you (avoided)`)
      }
    }
  }

  const gen = (stats.critsAlwaysInflictElementalAilments && hitWasCritical) ? 100 : stats.elementalAilmentChance
  const noEle = stats.cannotInflictElementalAilments
  const ndMult = 1 + (stats.nonDamagingAilmentEffectIncreasedPercent ?? 0) / 100
  const chillOutMult = stats.chillInflictEffectMult ?? 1

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
      state.dots.push({
        kind: 'ignite',
        dps,
        expiresAt: t + BASE_IGNITE_SEC * ignDur * Math.max(0.05, randIgn),
      })
      tryLogAilment(
        `Ailment — Ignite (DoT): ~${dps.toFixed(1)} fire DPS for ${(BASE_IGNITE_SEC * ignDur * Math.max(0.05, randIgn)).toFixed(1)}s`
      )
      if (stats.elementalAilmentsYouInflictReflectedToYou ?? false) {
        const avoidAll = Math.min(100, Math.max(0, stats.avoidAilmentsChance ?? 0))
        const avoidEle = Math.min(100, Math.max(0, stats.avoidElementalAilmentsChance ?? 0))
        const avoid = Math.min(100, avoidAll + avoidEle)
        if (Math.random() * 100 >= avoid) {
          playerAilments.igniteUntil = Math.max(playerAilments.igniteUntil, t + BASE_IGNITE_SEC * ignDur)
          tryLogAilment(`Ailment — Ignite reflected to you (${(BASE_IGNITE_SEC * ignDur).toFixed(1)}s)`)
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
      const effectPct = computeNonDamagingAilmentEffectPercent(portions.lightning, enemyMaxLife, 0)
      const shockCap = (stats.ignoreMaxShockEffect ?? false) ? Number.POSITIVE_INFINITY : (stats.maxShockEffect ?? 50)
      const shockIncMult = 1 + (stats.increasedShockEffect ?? 0) / 100
      const computedShock = Math.max(5, effectPct * 1.15 * ndMult * shockIncMult)
      const shockFixed = stats.fixedShockEffectPercent ?? 0
      const shock = shockFixed > 0 ? shockFixed : Math.min(shockCap, computedShock)
      const dur = getBaseShockChillDurationSec() * durMult * (stats.shockDurationMultiplier ?? 1)
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
      const effectPct = computeNonDamagingAilmentEffectPercent(chillDamageForEffect, enemyMaxLife, 0)
      if (stats.enemiesUnaffectedByChill) {
        // modeled: some uniques make enemies immune to chill
        tryLogAilment(`Ailment — Chill prevented (enemy unaffected by chill)`)
        return
      }
      const chillCap = stats.maxChillEffect ?? 30
      const chillPct = Math.min(chillCap, Math.max(5, effectPct * 0.85 * ndMult * chillOutMult))
      const dur = getBaseShockChillDurationSec() * durMult
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
): { damageToDisplay: number; fullBeforeArmour: number; mitigatedByArmour: number; evaded: boolean; dodged: boolean; blocked: boolean } {
  const acc = enemy.accuracy
  let eva = stats.evasionRating
  const flat = flatEvasionFromClassBonuses(stats)
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
      evaded: true,
      dodged: false,
      blocked: false,
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
      evaded: false,
      dodged: true,
      blocked: false,
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
  if (canCrit && critC > 0 && Math.random() * 100 < critC) {
    raw *= critM
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
        evaded: false,
        dodged: true,
        blocked: false,
      }
    }
  }
  if (blocked) {
    const preventAllChance = stats.blockPreventsAllDamageChance ?? 0
    if (preventAllChance > 0 && Math.random() * 100 < preventAllChance) {
      afterPath = 0
    } else {
      afterPath *= stats.blockDamageTakenMult ?? DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
    }
  }

  // Demo enemy uses physical hits only → full armour effectiveness (armourVsPhysical = 1.0).
  let armour = stats.armour
  if (stats.armourNoEffectVsPhysical ?? false) armour = 0
  if (
    (stats.armourHasNoEffectWhileBelowHalfLife ?? false) &&
    playerState.life < maxLife * 0.5
  ) {
    armour = 0
  }
  const red = computeArmourDRSingleType(armour, afterPath, 'physical')
  const afterArmour = afterPath * (1 - red)
  const afterConversion = mitigatedPhysicalDamageAfterConversion(stats, afterArmour)

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

  applyBlockRecovery(playerState, stats, blocked, maxLife)

  if (dealt > 0 && (stats.energyShieldOnHit ?? 0) > 0 && stats.maxEnergyShield > 0) {
    playerState.energyShield = Math.min(
      stats.maxEnergyShield,
      playerState.energyShield + (stats.energyShieldOnHit ?? 0)
    )
  }

  return {
    damageToDisplay: dealt,
    fullBeforeArmour: raw,
    mitigatedByArmour: prevented,
    evaded: false,
    dodged: false,
    blocked,
  }
}

export function simulateEncounter(ctx: BattleContext): EncounterResult {
  const { stats, enemy, options = {} } = ctx
  const maxDuration = options.maxDurationSeconds ?? 120
  const dt = options.dt ?? 0.05
  const maxLog = options.maxLogEntries ?? 80

  let runtimeMaxLife = stats.maxLife
  let deathPreventUsed = false
  const player: BattleParticipantState = {
    life: runtimeMaxLife,
    energyShield: stats.maxEnergyShield,
    mana: stats.maxMana,
  }

  let enemyLife = enemy.maxLife
  const startLosePct = Math.min(100, Math.max(0, stats.enemyLoseMaxLifeAtStartPercent ?? 0))
  if (startLosePct > 0) {
    enemyLife = Math.max(0, enemyLife - enemy.maxLife * (startLosePct / 100))
  }
  let t = 0
  let nextPlayer = 0
  let nextEnemy = 0
  const apsEnemy = enemy.aps * enemyApsMultiplier(stats)
  const firstHitFlag = { used: false }

  const ailmentState: EnemyAilmentRuntime = {
    dots: [],
    shocks: [],
    chills: [],
  }

  const playerAilments: PlayerAilmentRuntime = {
    poisons: [],
    igniteUntil: 0,
    shock: null,
    chill: null,
  }

  const log: BattleLogEntry[] = [
    { t: 0, kind: 'phase', message: `Encounter: ${enemy.name}` },
  ]

  let hitsPlayer = 0
  let hitsEnemy = 0
  let totalDotDamage = 0
  let lastDotLogT = -DOT_LOG_INTERVAL
  let lastDebuffPulseT = -DOT_LOG_INTERVAL
  let dotLogAcc = { bleed: 0, poison: 0, ignite: 0 }
  const enemyDebuffEvents: EnemyDebuffEvent[] = []
  let nextPeriodicShockT = 0
  let nextPeriodicLifeRegenT = 0
  let periodicLifeRegenActiveUntil = 0
  // Action bar: 0..1.0; when it reaches 1 you can act.
  // Demo model: bar fills at (player attack rate) per second, so time-to-act matches APS,
  // but uniques can set/fill the bar directly.
  let actionBar = Math.min(1, Math.max(0, (stats.actionBarSetToPercentAtStart ?? 0) / 100))

  while (t < maxDuration) {
    if (player.life <= 0) break
    if (enemyLife <= 0) break

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
          player.life = Math.min(runtimeMaxLife, player.life + runtimeMaxLife * (pctPerSec / 100) * dt * rec)
        }
      }
    }

    ailmentState.dots = ailmentState.dots.filter((d) => d.expiresAt > t)
    ailmentState.shocks = ailmentState.shocks.filter((s) => s.expiresAt > t)
    ailmentState.chills = ailmentState.chills.filter((c) => c.expiresAt > t)

    playerAilments.poisons = playerAilments.poisons.filter((p) => p.expiresAt > t)
    if (playerAilments.igniteUntil <= t) playerAilments.igniteUntil = 0
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
      enemyLife -= tick
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
      if (t - lastDotLogT + 1e-9 >= DOT_LOG_INTERVAL && log.length < maxLog) {
        const parts: string[] = []
        if (dotLogAcc.bleed > 0) parts.push(`bleed ${dotLogAcc.bleed.toFixed(1)}`)
        if (dotLogAcc.poison > 0) parts.push(`poison ${dotLogAcc.poison.toFixed(1)}`)
        if (dotLogAcc.ignite > 0) parts.push(`ignite ${dotLogAcc.ignite.toFixed(1)}`)
        const sum = dotLogAcc.bleed + dotLogAcc.poison + dotLogAcc.ignite
        const ailSuf = formatActiveEnemyAilmentSuffix(ailmentState, t)
        if (ailSuf) lastDebuffPulseT = t
        log.push({
          t,
          kind: 'dot_tick',
          message: `DoT — ${sum.toFixed(1)} total (${parts.join(', ')}) · ${Math.max(0, enemyLife).toFixed(0)} enemy life left${ailSuf}`,
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
      t - lastDebuffPulseT + 1e-9 >= DOT_LOG_INTERVAL &&
      log.length < maxLog
    ) {
      const parts: string[] = []
      if (shockLive > 0) parts.push(`shocked +${shockLive.toFixed(0)}% damage taken`)
      if (chillM < 1 - 1e-6) parts.push(`chilled ${((1 - chillM) * 100).toFixed(0)}% action slow`)
      log.push({
        t,
        kind: 'ailment',
        message: `Ailment — active on enemy: ${parts.join(' · ')}`,
      })
      lastDebuffPulseT = t
    }

    const poisonCount = playerAilments.poisons.length
    const shockOnYou = playerAilments.shock?.magnitudePct ?? 0
    const chillOnYou = (stats.unaffectedByChill ?? false) ? 0 : (playerAilments.chill?.magnitudePct ?? 0)
    const chillSelfMult = Math.max(0.05, 1 - chillOnYou / 100)

    let speedMult = chillSelfMult
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
        const { damage, outcome, anyCrit } = resolvePlayerAttack(enemy, enemyLife, stats, {
          targetTakesIncreasedDamagePct: shockNow,
        })
        enemyLife -= damage
        if (enemyLifeBeforeHit > 0 && enemyLife <= 0) applyOnKillRecovery(player, stats, runtimeMaxLife)
        if (damage > 0) {
          hitsPlayer++
          const rec = stats.lifeRecoveryRateMult ?? 1
          const gainOnHit =
            (stats.lifeOnHit ?? 0)
            + (damage * ((stats.lifeLeechFromHitDamagePercent ?? 0) / 100)
              + damagePortionsFromHit(stats, damage).physical
                * ((stats.lifeLeechFromPhysicalHitPercent ?? 0) / 100)) * rec
          if (gainOnHit !== 0 && lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
            player.life = Math.min(
              runtimeMaxLife,
              Math.max(0, player.life + gainOnHit)
            )
          }
          const spellEsLeechPct = stats.spellHitDamageLeechedAsEnergyShieldPercent ?? 0
          if (spellEsLeechPct > 0 && stats.maxEnergyShield > 0) {
            // Demo simplification: apply spell hit leech to ES on any hit event (we don't simulate actual spell casts here).
            const gainEs = damage * (spellEsLeechPct / 100)
            if (gainEs > 0) {
              player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + gainEs)
            }
          }
        }
        if (log.length < maxLog) {
          const msg =
            outcome === 'miss'
              ? 'Your attack was evaded'
              : outcome === 'enemy_blocked' && damage > 0
                ? `Enemy blocked — you deal ${damage.toFixed(1)} (${Math.max(0, enemyLife).toFixed(0)} left)`
                : damage > 0
                  ? `You hit for ${damage.toFixed(1)} (${Math.max(0, enemyLife).toFixed(0)} enemy life left)`
                  : 'Glancing hit (no damage)'
          log.push({ t, kind: 'player_attack', message: msg, damage })
        }
        if (damage > 0) {
          const hitWasCritical = (stats.firstAttackAlwaysCrit ?? false) && !firstHitFlag.used ? true : anyCrit
          firstHitFlag.used = true
          applyPlayerAilmentsOnHit(
            stats,
            damage,
            enemy.maxLife,
            t,
            ailmentState,
            playerAilments,
            hitWasCritical,
            log,
            maxLog,
            enemyDebuffEvents
          )
          const extraOnCrit = stats.extraHitOnCritChance ?? 0
          if (hitWasCritical && extraOnCrit > 0 && Math.random() * 100 < extraOnCrit) {
            const r2 = resolvePlayerAttack(enemy, enemyLife, stats, { targetTakesIncreasedDamagePct: shockNow })
            enemyLife -= r2.damage
          }
          if (enemyLife > 0) {
            const fixedExec = stats.executeEnemiesBelowLifePercent ?? 0
            const chillExec = (stats.executeEnemiesBelowLifePercentEqualToChillEffect ?? false)
              ? activeChillPct(ailmentState, t)
              : 0
            const execPct = Math.max(fixedExec, chillExec)
            if (execPct > 0 && enemyLife <= enemy.maxLife * (execPct / 100)) {
              enemyLife = 0
            }
          }
        }
        // Action bar set after cast (demo: treat our attack as an action)
        const setAfter = stats.actionBarSetToPercentAfterCast ?? 0
        if (setAfter > 0) actionBar = Math.min(1, Math.max(0, setAfter / 100))
      } else if (log.length < maxLog) {
        log.push({
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
      const r = resolveEnemyAttack(enemy, stats, player, firstHitFlag, runtimeMaxLife)
      if (r.blocked) {
        const fill = stats.actionBarFilledByPercentOnBlock ?? 0
        if (fill > 0) actionBar = Math.min(1, actionBar + fill / 100)
      }
      if (!r.evaded && !r.dodged && r.damageToDisplay > 0) hitsEnemy++
      if (log.length < maxLog) {
        if (r.evaded) log.push({ t, kind: 'enemy_attack', message: `${enemy.name} attack evaded` })
        else if (r.dodged) log.push({ t, kind: 'enemy_attack', message: `${enemy.name} attack dodged` })
        else if (r.damageToDisplay > 0) {
          log.push({
            t,
            kind: 'enemy_attack',
            message: `${enemy.name} hits for ${r.damageToDisplay.toFixed(1)}${r.blocked ? ' (blocked)' : ''}`,
            damage: r.damageToDisplay,
          })
        }
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
      player.mana = Math.min(stats.maxMana, player.mana + toMana)
      if (toEs > 0) {
        player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + toEs)
      }
    }
    const ignited = playerAilments.igniteUntil > t
    const baseLifeRegenPct = stats.lifeRegenPercentOfMaxPerSecond ?? 0
    const ignitedBonus = ignited ? (stats.lifeRegenPercentOfMaxPerSecondWhileIgnited ?? 0) : 0
    const lifeRegenPct = baseLifeRegenPct + ignitedBonus
    if (lifeRegenPct > 0 && player.life > 0) {
      const rec = stats.lifeRecoveryRateMult ?? 1
      if (lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
        player.life = Math.min(
          runtimeMaxLife,
          player.life + runtimeMaxLife * (lifeRegenPct / 100) * dt * rec
        )
      }
    }
    const flatLifeRegen = stats.flatLifeRegenPerSecond ?? 0
    if (flatLifeRegen > 0 && player.life > 0 && lifeRecoveryAllowed(player, stats, runtimeMaxLife)) {
      const rec = stats.lifeRecoveryRateMult ?? 1
      player.life = Math.min(runtimeMaxLife, player.life + flatLifeRegen * dt * rec)
    }

    // Poison damage on player (currently only sourced from reflected poison in this demo model)
    const poisonTakenLess = Math.min(100, Math.max(0, stats.poisonDamageTakenLessPercent ?? 0))
    let poisonSelfDps = 0
    for (const p of playerAilments.poisons) poisonSelfDps += p.dps
    if (poisonSelfDps > 0) {
      const tick = poisonSelfDps * dt * (1 - poisonTakenLess / 100)
      player.life = Math.max(0, player.life - tick)
      if (log.length < maxLog && tick > 0.01) {
        log.push({ t, kind: 'dot_tick', message: `DoT — Poison on you: ${tick.toFixed(1)} (${(poisonSelfDps * (1 - poisonTakenLess / 100)).toFixed(1)} DPS)`, damage: tick })
      }
    }

    // Flat self damage over time from gear
    const loseLife = stats.loseLifePerSecond ?? 0
    if (loseLife > 0) {
      player.life = Math.max(0, player.life - loseLife * dt)
      if (log.length < maxLog && loseLife * dt > 0.01) {
        log.push({ t, kind: 'dot_tick', message: `DoT — You lose ${loseLife.toFixed(0)} life/s`, damage: loseLife * dt })
      }
    }
    const chaosDps = stats.takeChaosDamagePerSecond ?? 0
    if (chaosDps > 0) {
      // Simplified: treat as direct life loss (ignores ES / chaos bypass rules)
      player.life = Math.max(0, player.life - chaosDps * dt)
      if (log.length < maxLog && chaosDps * dt > 0.01) {
        log.push({ t, kind: 'dot_tick', message: `DoT — You take ${chaosDps.toFixed(0)} chaos damage/s`, damage: chaosDps * dt })
      }
    }
    const chaosDpsAfterPrevent = deathPreventUsed ? (stats.takeChaosDamagePerSecondIfDeathPrevented ?? 0) : 0
    if (chaosDpsAfterPrevent > 0) {
      player.life = Math.max(0, player.life - chaosDpsAfterPrevent * dt)
    }

    if (player.life <= 0 && (stats.preventDeathOncePerStage ?? false) && !deathPreventUsed) {
      deathPreventUsed = true
      runtimeMaxLife = Math.max(1, runtimeMaxLife * 0.5)
      player.life = runtimeMaxLife
      if (log.length < maxLog) {
        log.push({ t, kind: 'phase', message: `Death prevented — max life halved to ${runtimeMaxLife.toFixed(0)} and life restored` })
      }
    }
    const esRegenPct = stats.esRegenPercentOfMaxPerSecond ?? 0
    if (esRegenPct > 0 && stats.maxEnergyShield > 0) {
      player.energyShield = Math.min(
        stats.maxEnergyShield,
        player.energyShield + stats.maxEnergyShield * (esRegenPct / 100) * dt * recAll
      )
    }

    // Conditional mana sacrifice (current mana per second)
    const manaSacPct = stats.sacrificeCurrentManaPercentPerSecond ?? 0
    if (manaSacPct > 0 && player.mana > 0 && !(stats.noMana ?? false)) {
      player.mana = Math.max(0, player.mana * (1 - (manaSacPct / 100) * dt))
    }
    t += dt
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
    log,
    hitsLandedPlayer: hitsPlayer,
    hitsLandedEnemy: hitsEnemy,
    totalDotDamageToEnemy: totalDotDamage,
    enemyDebuffEvents,
  }
}
