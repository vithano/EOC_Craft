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
  type EnemyDebuffEvent,
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
  poisons: { expiresAt: number; dps: number }[]
  igniteUntil: number
  shock: NonDotAilmentInstance | null
  chill: NonDotAilmentInstance | null
}

function applyDamageToEnemyPools(
  enemyState: { life: number; energyShield: number },
  amount: number
): number {
  if (amount <= 0) return 0
  let remaining = amount
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

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100
}

function discardBelow001(n: number): number {
  return n < 0.01 ? 0 : n
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
  extraFireFlat = 0
): number {
  const armourIgnoredFrac = stats.armourIgnorePercent / 100
  const baseArmour = enemy.armour
  const elePen = stats.elementalPenetrationPercent ?? 0
  const zone = Math.max(1, Math.floor(enemy.zone ?? 1))
  const zoneEleResBonus = Math.min(15, Math.max(0, (zone - 1) * 3))

  // Split raw hit into per-type amounts using current fractions
  const a = avgHitByDamageType(stats)
  const total = Math.max(1, a.total)
  const hitTotal = raw + extraFireFlat
  const physAmt  = raw * (a.physical  / total)
  const fireAmt  = raw * (a.fire      / total) + extraFireFlat
  const coldAmt  = raw * (a.cold      / total)
  const lightAmt = raw * (a.lightning / total)
  const chaosAmt = raw * (a.chaos     / total)

  // Apply armour DR per type using the full multi-type formula (ARMOUR_RESISTANCE splits armour)
  function afterArmour(amt: number, type: Parameters<typeof computeArmourDR>[3]): number {
    if (amt <= 0) return 0
    const dr = computeArmourDR(baseArmour, amt, hitTotal, type, armourIgnoredFrac)
    return amt * (1 - dr)
  }

  let physOut  = afterArmour(physAmt,  'physical')
  let fireOut  = afterArmour(fireAmt,  'fire')
  let coldOut  = afterArmour(coldAmt,  'cold')
  let lightOut = afterArmour(lightAmt, 'lightning')
  let chaosOut = afterArmour(chaosAmt, 'chaos')

  // Apply resistances (optionally mirrored to player resists)
  const enemyFire = stats.enemyResistancesEqualToYours ? stats.fireRes : (enemy.fireResistancePercent ?? 0) + zoneEleResBonus
  const enemyCold = stats.enemyResistancesEqualToYours ? stats.coldRes : (enemy.coldResistancePercent ?? 0) + zoneEleResBonus
  const enemyLight = stats.enemyResistancesEqualToYours ? stats.lightningRes : (enemy.lightningResistancePercent ?? 0) + zoneEleResBonus
  const enemyChaos = stats.enemyResistancesEqualToYours ? stats.chaosRes : (enemy.chaosResistancePercent ?? 0)

  const fr = Math.max(0, enemyFire - (stats.firePenetrationPercent ?? 0) - elePen)
  const cr = Math.max(0, enemyCold - (stats.coldPenetrationPercent ?? 0) - elePen)
  const lr = Math.max(0, enemyLight - (stats.lightningPenetrationPercent ?? 0) - elePen)
  const chr = Math.max(0, enemyChaos - (stats.chaosPenetrationPercent ?? 0))

  if (fr  > 0) fireOut  *= 1 - fr  / 100
  if (cr  > 0) coldOut  *= 1 - cr  / 100
  if (lr  > 0) lightOut *= 1 - lr  / 100
  if (chr > 0) chaosOut *= 1 - chr / 100

  // Chieftain: enemies take 40% increased elemental damage.
  if (stats.classBonusesActive.includes('chieftain')) {
    fireOut *= 1.4
    coldOut *= 1.4
    lightOut *= 1.4
  }

  return physOut + fireOut + coldOut + lightOut + chaosOut
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

function resolvePlayerAttack(
  enemy: DemoEnemyDef,
  enemyLife: number,
  stats: ComputedBuildStats,
  attackOpts?: {
    targetTakesIncreasedDamagePct: number
    extraTargetTakesIncreasedDamagePct?: number
    moreDamageMult?: number
    /** Added to the first strike only (e.g. Siegebreaker counter fire). */
    extraFlatFireDamage?: number
  }
): { damage: number; damageForAilments: number; outcome: PlayerHitOutcome; anyCrit: boolean; anyDouble: boolean; anyTriple: boolean; anyQuad: boolean } {
  const evadePct = stats.hitsCannotBeEvaded
    ? 0
    : computeEvasionChancePercent(stats.accuracy, enemy.evasionRating, 0)
  const miss = Math.random() * 100 < evadePct
  if (miss) return { damage: 0, damageForAilments: 0, outcome: 'miss', anyCrit: false, anyDouble: false, anyTriple: false, anyQuad: false }

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

  for (let s = 0; s < strikes; s++) {
    const blocked = blk > 0 && Math.random() * 100 < blk
    if (blocked) blockedStrikes++

    let base = rollDamage(stats.hitDamageMin, stats.hitDamageMax, zealot)
    let extraFire = s === 0 ? Math.max(0, attackOpts?.extraFlatFireDamage ?? 0) : 0
    if (blocked) {
      base *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
      extraFire *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
    }

    let isCrit = false
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
          base *= 3
          extraFire *= 3
          anyTriple = true
        } else if (Math.random() * 100 < stats.doubleDamageChance) {
          base *= 2
          extraFire *= 2
          anyDouble = true
        }
      } else if (tChance > 0 && Math.random() * 100 < tChance) {
        base *= 3
        extraFire *= 3
        anyTriple = true
      } else if (Math.random() * 100 < stats.doubleDamageChance) {
        // Damage proc chaining: if we "would deal double", allow upgrade to triple
        const up = stats.doubleDamageUpgradesToTripleChance ?? 0
        if (up > 0 && Math.random() * 100 < up) {
          base *= 3
          extraFire *= 3
          anyTriple = true
        } else {
          base *= 2
          extraFire *= 2
          anyDouble = true
        }
      }
      // Damage proc chaining: if we "would deal triple", allow upgrade to quadruple
      if (anyTriple) {
        const up4 = stats.tripleDamageUpgradesToQuadrupleChance ?? 0
        if (up4 > 0 && Math.random() * 100 < up4) {
          base *= 4 / 3
          extraFire *= 4 / 3
          anyQuad = true
        }
      }

      if (stats.dealNoDamageExceptCrit && !isCrit) {
        base = 0
        extraFire = 0
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

    total += mitigatedPlayerHitVsArmour(enemy, stats, base, extraFire)
  }

  const outcome: PlayerHitOutcome =
    blockedStrikes === strikes && strikes > 0 ? 'enemy_blocked' : 'hit'
  const fx = stats.abilityLineEffects
  const dealNoDamage = (fx?.dealNoDamage ?? false)
  const ailmentsFull = (fx?.inflictAilmentsAsThoughFullHitDamage ?? false)
  return {
    damage: dealNoDamage ? 0 : total,
    damageForAilments: (dealNoDamage && ailmentsFull) ? total : (dealNoDamage ? 0 : total),
    outcome,
    anyCrit,
    anyDouble,
    anyTriple,
    anyQuad,
  }
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
    const dps = ((mitigatedDamage * poisonInherentMult) / BASE_POISON_SEC) * dotMult
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
      const effectPct = discardBelow001(roundTo2(effectPctRaw))
      const shockCap = (stats.ignoreMaxShockEffect ?? false) ? Number.POSITIVE_INFINITY : (stats.maxShockEffect ?? 50)
      const shockIncMult = 1 + (stats.increasedShockEffect ?? 0) / 100
      const computedShock = Math.max(5, effectPct * 1.15 * ndMult * shockIncMult)
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
      const effectPct = discardBelow001(roundTo2(effectPctRaw))
      if (stats.enemiesUnaffectedByChill) {
        // modeled: some uniques make enemies immune to chill
        tryLogAilment(`Ailment — Chill prevented (enemy unaffected by chill)`)
        return
      }
      const chillCap = stats.maxChillEffect ?? 30
      const chillPct = Math.min(chillCap, Math.max(5, effectPct * 0.85 * ndMult * chillOutMult))
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
  evaded: boolean
  dodged: boolean
  blocked: boolean
  critical: boolean
  /** Damage removed by block mitigation on this hit (pre-block hit damage minus post-block, before armour). */
  preventedByBlock: number
  /** Total prevented damage vs the player (includes block + armour + resist + other mitigation after this point). */
  preventedTotal: number
} {
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

  const physRoll = physMin + Math.random() * Math.max(0, physMax - physMin)
  const eleRoll = eleMin + Math.random() * Math.max(0, eleMax - eleMin)
  const chaosRoll = chaosMin + Math.random() * Math.max(0, chaosMax - chaosMin)
  const rollTotal = Math.max(1e-9, physRoll + eleRoll + chaosRoll)
  const physAmt = afterPath * (physRoll / rollTotal)
  const eleAmt = afterPath * (eleRoll / rollTotal)
  const chaosAmt = afterPath * (chaosRoll / rollTotal)

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
  let fire = afterArmourEle / 3
  let cold = afterArmourEle / 3
  let light = afterArmourEle / 3
  let chaos = afterArmourChaos

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
  const enemyLifeRegenPerSecond = (deltas.lifeRegenRaw !== 0)
    ? (deltas.lifeRegenRaw * enemy.maxLife) / refLife
    : 0
  const enemyEsRegenPerSecond = (deltas.esRegenRaw !== 0)
    ? (deltas.esRegenRaw * enemy.maxLife) / refLife
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
  }
  let enemyLife = enemyState.life
  const startLosePct = Math.min(100, Math.max(0, stats.enemyLoseMaxLifeAtStartPercent ?? 0))
  if (startLosePct > 0) {
    enemyState.life = Math.max(0, enemyState.life - enemy.maxLife * (startLosePct / 100))
    enemyLife = enemyState.life
  }
  let t = 0
  let nextPlayer = 0
  const apsEnemy = Math.max(0.05, enemy.aps * enemyApsMultiplier(stats))
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
    poisons: [],
    igniteUntil: 0,
    shock: null,
    chill: null,
  }

  // Reaper: permanently inflict 20% chill on yourself.
  if (stats.classBonusesActive.includes('reaper')) {
    playerAilments.chill = { magnitudePct: 20, expiresAt: 1e9 }
  }

  const log: BattleLogEntry[] = [{ t: 0, kind: 'phase', message: `Encounter: ${enemy.name}` }]

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

    // Enemy regen from mods (scaled off life per formulas.csv note).
    if (enemyLifeRegenPerSecond > 0 && enemyState.life > 0 && enemyState.life < enemy.maxLife - 1e-9) {
      enemyState.life = Math.min(enemy.maxLife, enemyState.life + enemyLifeRegenPerSecond * dt)
      enemyLife = enemyState.life
    }
    if (
      enemyEsRegenPerSecond > 0 &&
      (enemy.maxEnergyShield ?? 0) > 0 &&
      enemyState.energyShield > 0 &&
      enemyState.energyShield < (enemy.maxEnergyShield ?? 0) - 1e-9
    ) {
      enemyState.energyShield = Math.min(
        enemy.maxEnergyShield ?? 0,
        enemyState.energyShield + enemyEsRegenPerSecond * dt
      )
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
          player.life = Math.min(runtimeMaxLife, player.life + runtimeMaxLife * (pctPerSec / 100) * dt * rec)
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
          applyDamageToEnemyPools(enemyState, totalStored)
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
            applyDamageToEnemyPools(enemyState, burst)
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
      applyDamageToEnemyPools(enemyState, tick)
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
      t - lastDebuffPulseT + 1e-9 >= DOT_LOG_INTERVAL &&
      log.length < maxLogNormal
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
        const fx = stats.abilityLineEffects
        const poisonStacks = ailmentState.dots.filter((d) => d.kind === 'poison' && d.expiresAt > t).length
        const chillPctNow = activeChillPct(ailmentState, t)
        const extraInc =
          (fx?.enemiesTakeIncreasedDamagePerPoisonPercent ?? 0) * poisonStacks
          + (fx?.enemiesTakeIncreasedDamagePerChillEffectPercent ?? 0) * chillPctNow
        const shadowMore = (!firstPlayerActionThisEncounter.used && stats.classBonusesActive.includes('shadow')) ? 1.5 : 1
        if (shadowMore !== 1) firstPlayerActionThisEncounter.used = true
        const { damage, damageForAilments, outcome, anyCrit, anyDouble, anyTriple, anyQuad } = resolvePlayerAttack(enemy, enemyLife, stats, {
          targetTakesIncreasedDamagePct: shockNow,
          extraTargetTakesIncreasedDamagePct: extraInc,
          moreDamageMult: shadowMore,
        })
        applyDamageToEnemyPools(enemyState, damage)
        enemyLife = enemyState.life
        if (enemyLifeBeforeHit > 0 && enemyLife <= 0) applyOnKillRecovery(player, stats, runtimeMaxLife)
        if (damage > 0 || damageForAilments > 0) {
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
          tryLog({ t, kind: 'player_attack', message: msg, damage })
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
              enemyState.life = 0
              enemyState.energyShield = 0
              enemyLife = 0
            }
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
        const ctr = resolvePlayerAttack(enemy, enemyLife, stats, {
          targetTakesIncreasedDamagePct: shockNow,
          extraTargetTakesIncreasedDamagePct: extraInc,
          extraFlatFireDamage: extraFire,
        })
        applyDamageToEnemyPools(enemyState, ctr.damage)
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
          tryLog({ t, kind: 'player_attack', message: msg, damage: ctr.damage })
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
      player.mana = Math.min(stats.maxMana, player.mana + toMana)
      if (toEs > 0) {
        player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + toEs)
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
        player.life = Math.min(
          runtimeMaxLife,
          player.life + runtimeMaxLife * (lifeRegenPct / 100) * dt * rec
        )
      }
    }
    // Ascendant: 50% of life regeneration per second also applies to your energy shield.
    if (stats.classBonusesActive.includes('ascendant') && stats.maxEnergyShield > 0) {
      const rec = stats.lifeRecoveryRateMult ?? 1
      const toEs = runtimeMaxLife * ((baseLifeRegenPct + ignitedBonus + ascendantLifeRegenPct) / 100) * dt * rec * 0.5
      if (toEs > 0) {
        player.energyShield = Math.min(stats.maxEnergyShield, player.energyShield + toEs)
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
      if (tick > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — Poison on you: ${tick.toFixed(1)} (${(poisonSelfDps * (1 - poisonTakenLess / 100)).toFixed(1)} DPS)`, damage: tick })
      }
    }

    // Flat self damage over time from gear
    const loseLife = stats.loseLifePerSecond ?? 0
    if (loseLife > 0) {
      player.life = Math.max(0, player.life - loseLife * dt)
      if (loseLife * dt > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — You lose ${loseLife.toFixed(0)} life/s`, damage: loseLife * dt })
      }
    }
    const chaosDps = stats.takeChaosDamagePerSecond ?? 0
    if (chaosDps > 0) {
      // Simplified: treat as direct life loss (ignores ES / chaos bypass rules)
      player.life = Math.max(0, player.life - chaosDps * dt)
      if (chaosDps * dt > 0.01) {
        tryLog({ t, kind: 'dot_tick', message: `DoT — You take ${chaosDps.toFixed(0)} chaos damage/s`, damage: chaosDps * dt })
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
      {
        tryLog({ t, kind: 'phase', message: `Death prevented — max life halved to ${runtimeMaxLife.toFixed(0)} and life restored` })
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
    enemyAilmentSummary,
    logTruncated,
  }
}
