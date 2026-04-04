import {
  computeEvasionChancePercent,
  computeNonDamagingAilmentEffectPercent,
} from '../data/eocFormulas'
import { computeDamageReductionPercentFromArmour } from '../data/formulas'
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

interface EnemyAilmentRuntime {
  dots: DotInstance[]
  /** Current % increased damage the enemy takes from shock (0–50 capped). */
  shockMorePct: number
  shockUntil: number
  /** Action speed multiplier on enemy (1 = normal, 0.85 = 15% chill). */
  chillActionMult: number
  chillUntil: number
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

function fireDamageFraction(stats: ComputedBuildStats): number {
  const a = avgHitByDamageType(stats)
  if (a.total <= 0) return 0
  return a.fire / a.total
}

function coldDamageFraction(stats: ComputedBuildStats): number {
  const a = avgHitByDamageType(stats)
  if (a.total <= 0) return 0
  return a.cold / a.total
}

function lightningDamageFraction(stats: ComputedBuildStats): number {
  const a = avgHitByDamageType(stats)
  if (a.total <= 0) return 0
  return a.lightning / a.total
}

function chaosDamageFraction(stats: ComputedBuildStats): number {
  const a = avgHitByDamageType(stats)
  if (a.total <= 0) return 0
  return a.chaos / a.total
}

function mitigatedPlayerHitVsArmor(enemy: DemoEnemyDef, stats: ComputedBuildStats, raw: number): number {
  const effArmor = enemy.armor * (1 - stats.armorIgnorePercent / 100)
  const red = computeDamageReductionPercentFromArmour(effArmor, raw, 0, 90)
  let out = raw * (1 - red / 100)
  const elePen = stats.elementalPenetrationPercent ?? 0
  const fr = enemy.fireResistancePercent ?? 0
  if (fr > 0) {
    const eff = Math.max(0, fr - (stats.firePenetrationPercent ?? 0) - elePen)
    const f = fireDamageFraction(stats)
    if (f > 0 && eff > 0) out *= 1 - f * (eff / 100)
  }
  const cr = enemy.coldResistancePercent ?? 0
  if (cr > 0) {
    const eff = Math.max(0, cr - (stats.coldPenetrationPercent ?? 0) - elePen)
    const f = coldDamageFraction(stats)
    if (f > 0 && eff > 0) out *= 1 - f * (eff / 100)
  }
  const lrBase = enemy.lightningResistancePercent ?? 0
  if (lrBase > 0) {
    const effRes = Math.max(
      0,
      lrBase - (stats.lightningPenetrationPercent ?? 0) - elePen
    )
    const lf = lightningDamageFraction(stats)
    if (lf > 0 && effRes > 0) out *= 1 - lf * (effRes / 100)
  }
  const chr = enemy.chaosResistancePercent ?? 0
  if (chr > 0) {
    const eff = Math.max(0, chr - (stats.chaosPenetrationPercent ?? 0))
    const cf = chaosDamageFraction(stats)
    if (cf > 0 && eff > 0) out *= 1 - cf * (eff / 100)
  }
  return out
}

function enemyApsMultiplier(stats: ComputedBuildStats): number {
  let m = 1
  if (stats.classBonusesActive.includes('windrunner')) m *= 1 - 0.1
  if (stats.classBonusesActive.includes('trickster')) m *= 1 - 0.05
  return m
}

function enemyDamageTakenMultiplier(stats: ComputedBuildStats, enemyLifeFrac: number): number {
  let m = 1
  if (stats.classBonusesActive.includes('windrunner')) m *= 1 + 0.15
  if (stats.classBonusesActive.includes('trickster')) m *= 1 + 0.1
  if (stats.classBonusesActive.includes('dragoon')) {
    const missing = 1 - enemyLifeFrac
    m *= 1 + missing
  }
  const inc = stats.enemiesTakeIncreasedDamagePercent ?? 0
  if (inc !== 0) m *= 1 + inc / 100
  return m
}

function flatEvasionFromClassBonuses(stats: ComputedBuildStats): number {
  return stats.classBonusesActive.includes('mirage') ? 5 : 0
}

function outgoingPlayerIncreasedDamageFrac(stats: ComputedBuildStats): number {
  return (
    stats.increasedAttackDamage
    + stats.increasedMeleeDamage
    + stats.increasedDamage
  ) / 100
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

function applyDamageToPools(
  state: BattleParticipantState,
  rawAfterArmour: number,
  stats: ComputedBuildStats,
  maxMana: number
): number {
  let dmg = Math.max(0, rawAfterArmour)

  if (stats.manaShieldActive && state.mana > maxMana * 0.5) {
    const portion = dmg * 0.25
    const fromMana = Math.min(portion, Math.max(0, state.mana))
    state.mana -= fromMana
    dmg -= fromMana
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
): { damage: number; outcome: PlayerHitOutcome } {
  const evadePct = stats.hitsCannotBeEvaded
    ? 0
    : computeEvasionChancePercent(stats.accuracy, enemy.evasionRating, 0)
  const miss = Math.random() * 100 < evadePct
  if (miss) return { damage: 0, outcome: 'miss' }

  const blk = enemy.blockChance ?? 0
  const zealot = stats.classBonusesActive.includes('zealot')
  const strikes = Math.max(1, stats.strikesPerAttack ?? 1)
  let total = 0
  let blockedStrikes = 0

  for (let s = 0; s < strikes; s++) {
    const blocked = blk > 0 && Math.random() * 100 < blk
    if (blocked) blockedStrikes++

    let base = rollDamage(stats.hitDamageMin, stats.hitDamageMax, zealot)
    if (blocked) base *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT

    if (!blocked) {
      if (Math.random() * 100 < stats.critChance) {
        base *= stats.critMultiplier
      }

      const tChance = stats.tripleDamageChance ?? 0
      if (stats.classBonusesActive.includes('destroyer')) {
        const tripleChance = stats.doubleDamageChance / 2
        if (Math.random() * 100 < tripleChance) base *= 3
        else if (Math.random() * 100 < stats.doubleDamageChance) base *= 2
      } else if (tChance > 0 && Math.random() * 100 < tChance) {
        base *= 3
      } else if (Math.random() * 100 < stats.doubleDamageChance) {
        base *= 2
      }
    }

    base *= 1 + outgoingPlayerIncreasedDamageFrac(stats)
    const frac = enemyLife / Math.max(1, enemy.maxLife)
    base *= enemyDamageTakenMultiplier(stats, frac)
    const shockPct = attackOpts?.targetTakesIncreasedDamagePct ?? 0
    if (shockPct > 0) base *= 1 + shockPct / 100

    total += mitigatedPlayerHitVsArmor(enemy, stats, base)
  }

  const outcome: PlayerHitOutcome =
    blockedStrikes === strikes && strikes > 0 ? 'enemy_blocked' : 'hit'
  return { damage: total, outcome }
}

const BASE_BLEED_SEC = 5
const BASE_POISON_SEC = 4
const BASE_IGNITE_SEC = 4
const BASE_SHOCK_CHILL_SEC = 4
const DOT_LOG_INTERVAL = 0.45

function refreshDebuffExpiry(state: EnemyAilmentRuntime, t: number): void {
  if (state.shockUntil > 0 && t >= state.shockUntil) {
    state.shockMorePct = 0
    state.shockUntil = 0
  }
  if (state.chillUntil > 0 && t >= state.chillUntil) {
    state.chillActionMult = 1
    state.chillUntil = 0
  }
}

function activeShockPct(state: EnemyAilmentRuntime, t: number): number {
  return t < state.shockUntil ? state.shockMorePct : 0
}

function activeChillMult(state: EnemyAilmentRuntime, t: number): number {
  return t < state.chillUntil ? state.chillActionMult : 1
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
  log: BattleLogEntry[],
  maxLog: number,
  debuffEvents: EnemyDebuffEvent[]
): void {
  if (mitigatedDamage <= 0) return

  const durMult = 1 + stats.ailmentDurationBonus / 100
  const dotMult =
    (1 + stats.damageOverTimeMultiplier / 100) * (stats.dotDamageMoreMultiplier ?? 1)
  const portions = damagePortionsFromHit(stats, mitigatedDamage)

  const tryLogAilment = (msg: string) => {
    if (log.length < maxLog) log.push({ t, kind: 'ailment', message: msg })
  }

  if (portions.physical > 0.01 && Math.random() * 100 < stats.bleedChance) {
    const dps = ((portions.physical * 0.55) / BASE_BLEED_SEC) * dotMult
    state.dots.push({
      kind: 'bleed',
      dps,
      expiresAt: t + BASE_BLEED_SEC * durMult,
    })
    tryLogAilment(`Ailment — Bleed (DoT): ~${dps.toFixed(1)} DPS for ${(BASE_BLEED_SEC * durMult).toFixed(1)}s`)
  }

  if (Math.random() * 100 < stats.poisonChance) {
    const dps = ((mitigatedDamage * 0.45) / BASE_POISON_SEC) * dotMult
    state.dots.push({
      kind: 'poison',
      dps,
      expiresAt: t + BASE_POISON_SEC * durMult,
    })
    tryLogAilment(`Ailment — Poison (DoT): ~${dps.toFixed(1)} DPS for ${(BASE_POISON_SEC * durMult).toFixed(1)}s`)
  }

  const gen = stats.elementalAilmentChance
  const noEle = stats.cannotInflictElementalAilments

  if (!noEle && portions.fire > 0.01) {
    const pIgn = Math.min(100, gen + stats.igniteInflictChanceBonus)
    if (Math.random() * 100 < pIgn) {
      const dps = ((portions.fire * 0.5) / BASE_IGNITE_SEC) * dotMult
      state.dots.push({
        kind: 'ignite',
        dps,
        expiresAt: t + BASE_IGNITE_SEC * durMult,
      })
      tryLogAilment(
        `Ailment — Ignite (DoT): ~${dps.toFixed(1)} fire DPS for ${(BASE_IGNITE_SEC * durMult).toFixed(1)}s`
      )
    }
  }

  if (!noEle && portions.lightning > 0.01) {
    const pShock = Math.min(100, gen + stats.shockInflictChanceBonus)
    if (Math.random() * 100 < pShock) {
      const effectPct = computeNonDamagingAilmentEffectPercent(portions.lightning, enemyMaxLife, 0)
      const shock = Math.min(50, Math.max(5, effectPct * 1.15))
      const dur = BASE_SHOCK_CHILL_SEC * durMult
      state.shockMorePct = Math.max(state.shockMorePct, shock)
      state.shockUntil = Math.max(state.shockUntil, t + dur)
      debuffEvents.push({ t, kind: 'shock', magnitudePct: shock, durationSec: dur })
      tryLogAilment(
        `Ailment — Shock: enemy takes +${shock.toFixed(0)}% damage from your hits (${dur.toFixed(1)}s)`
      )
    }
  }

  if (!noEle && portions.cold > 0.01) {
    const pChill = Math.min(100, gen + stats.chillInflictChanceBonus)
    if (Math.random() * 100 < pChill) {
      const effectPct = computeNonDamagingAilmentEffectPercent(portions.cold, enemyMaxLife, 0)
      const chillPct = Math.min(30, Math.max(5, effectPct * 0.85))
      const dur = BASE_SHOCK_CHILL_SEC * durMult
      const mult = 1 - chillPct / 100
      state.chillActionMult =
        state.chillUntil > t ? Math.min(state.chillActionMult, mult) : mult
      state.chillUntil = Math.max(state.chillUntil, t + dur)
      debuffEvents.push({ t, kind: 'chill', magnitudePct: chillPct, durationSec: dur })
      tryLogAilment(
        `Ailment — Chill: enemy action speed −${chillPct.toFixed(0)}% (${dur.toFixed(1)}s)`
      )
    }
  }
}

function resolveEnemyAttack(
  enemy: DemoEnemyDef,
  stats: ComputedBuildStats,
  playerState: BattleParticipantState,
  firstHitThisEncounter: { used: boolean }
): { damageToDisplay: number; fullBeforeArmour: number; mitigatedByArmor: number; evaded: boolean; dodged: boolean; blocked: boolean } {
  const acc = enemy.accuracy
  const eva = stats.evasionRating
  const flat = flatEvasionFromClassBonuses(stats)

  if (Math.random() * 100 < computeEvasionChancePercent(acc, eva, flat)) {
    return {
      damageToDisplay: 0,
      fullBeforeArmour: 0,
      mitigatedByArmor: 0,
      evaded: true,
      dodged: false,
      blocked: false,
    }
  }

  if (Math.random() * 100 < stats.dodgeChance) {
    return {
      damageToDisplay: 0,
      fullBeforeArmour: 0,
      mitigatedByArmor: 0,
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

  const blocked = stats.blockChance > 0 && Math.random() * 100 < stats.blockChance
  if (blocked) {
    afterPath *= stats.blockDamageTakenMult ?? DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
  }

  // Demo enemy uses physical hits only → full armor effectiveness (not elemental multiplier).
  const red = computeDamageReductionPercentFromArmour(stats.armor, afterPath, 0, 90)
  const afterArmour = afterPath * (1 - red / 100)

  const prevented = Math.max(0, afterPath - afterArmour)
  if (blocked && stats.classBonusesActive.includes('templar')) {
    playerState.energyShield += stats.armor * 0.02
    if (playerState.energyShield > stats.maxEnergyShield) {
      playerState.energyShield = stats.maxEnergyShield
    }
  }
  if (stats.classBonusesActive.includes('juggernaut') && prevented > 0) {
    playerState.life += prevented * 0.04
    if (playerState.life > stats.maxLife) playerState.life = stats.maxLife
  }

  const dealt = applyDamageToPools(playerState, afterArmour, stats, stats.maxMana)

  return {
    damageToDisplay: dealt,
    fullBeforeArmour: raw,
    mitigatedByArmor: prevented,
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

  const player: BattleParticipantState = {
    life: stats.maxLife,
    energyShield: stats.maxEnergyShield,
    mana: stats.maxMana,
  }

  let enemyLife = enemy.maxLife
  let t = 0
  let nextPlayer = 0
  let nextEnemy = 0
  const apsEnemy = enemy.aps * enemyApsMultiplier(stats)
  const firstHitFlag = { used: false }

  const ailmentState: EnemyAilmentRuntime = {
    dots: [],
    shockMorePct: 0,
    shockUntil: 0,
    chillActionMult: 1,
    chillUntil: 0,
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

  while (t < maxDuration) {
    if (player.life <= 0) break
    if (enemyLife <= 0) break

    refreshDebuffExpiry(ailmentState, t)

    ailmentState.dots = ailmentState.dots.filter((d) => d.expiresAt > t)
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
      enemyLife -= tick
      totalDotDamage += tick
      dotLogAcc.bleed += dotDpsBleed * dt
      dotLogAcc.poison += dotDpsPoison * dt
      dotLogAcc.ignite += dotDpsIgnite * dt
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

    const pAps = playerApsWithBerserker(stats, player.life)

    if (t + 1e-9 >= nextPlayer) {
      if (player.mana >= stats.manaCostPerAttack) {
        player.mana -= stats.manaCostPerAttack
        const shockNow = activeShockPct(ailmentState, t)
        const { damage, outcome } = resolvePlayerAttack(enemy, enemyLife, stats, {
          targetTakesIncreasedDamagePct: shockNow,
        })
        enemyLife -= damage
        if (damage > 0) {
          hitsPlayer++
          const gainOnHit =
            (stats.lifeOnHit ?? 0)
            + damage * ((stats.lifeLeechFromHitDamagePercent ?? 0) / 100)
            + damagePortionsFromHit(stats, damage).physical
              * ((stats.lifeLeechFromPhysicalHitPercent ?? 0) / 100)
          if (gainOnHit !== 0) {
            player.life = Math.min(
              stats.maxLife,
              Math.max(0, player.life + gainOnHit)
            )
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
          applyPlayerAilmentsOnHit(
            stats,
            damage,
            enemy.maxLife,
            t,
            ailmentState,
            log,
            maxLog,
            enemyDebuffEvents
          )
        }
      } else if (log.length < maxLog) {
        log.push({ t, kind: 'player_attack', message: 'Out of mana — attack skipped' })
      }
      nextPlayer = t + 1 / Math.max(0.2, pAps)
    }

    const chillMult = activeChillMult(ailmentState, t)
    if (t + 1e-9 >= nextEnemy) {
      const r = resolveEnemyAttack(enemy, stats, player, firstHitFlag)
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

    player.mana = Math.min(stats.maxMana, player.mana + stats.manaRegenPerSecond * dt)
    const lifeRegenPct = stats.lifeRegenPercentOfMaxPerSecond ?? 0
    if (lifeRegenPct > 0 && player.life > 0) {
      player.life = Math.min(
        stats.maxLife,
        player.life + stats.maxLife * (lifeRegenPct / 100) * dt
      )
    }
    const esRegenPct = stats.esRegenPercentOfMaxPerSecond ?? 0
    if (esRegenPct > 0 && stats.maxEnergyShield > 0) {
      player.energyShield = Math.min(
        stats.maxEnergyShield,
        player.energyShield + stats.maxEnergyShield * (esRegenPct / 100) * dt
      )
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
