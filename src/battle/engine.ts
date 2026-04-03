import { computeEvasionChancePercent } from '../data/eocFormulas'
import { computeDamageReductionPercentFromArmour } from '../data/formulas'
import type { ComputedBuildStats } from '../data/gameStats'
import {
  DEFAULT_BLOCK_DAMAGE_TAKEN_MULT,
  type BattleContext,
  type BattleLogEntry,
  type BattleParticipantState,
  type DemoEnemyDef,
  type EncounterResult,
} from './types'

function rollDamage(min: number, max: number, rollTwiceHigh: boolean): number {
  const span = Math.max(0, max - min)
  let v = min + Math.random() * span
  if (rollTwiceHigh) {
    const v2 = min + Math.random() * span
    v = Math.max(v, v2)
  }
  return v
}

function mitigatedPlayerHitVsArmor(enemy: DemoEnemyDef, stats: ComputedBuildStats, raw: number): number {
  const effArmor = enemy.armor * (1 - stats.armorIgnorePercent / 100)
  const red = computeDamageReductionPercentFromArmour(effArmor, raw, 0, 90)
  return raw * (1 - red / 100)
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
  stats: ComputedBuildStats
): { damage: number; outcome: PlayerHitOutcome } {
  const miss =
    Math.random() * 100
    < computeEvasionChancePercent(stats.accuracy, enemy.evasionRating, 0)
  if (miss) return { damage: 0, outcome: 'miss' }

  const blk = enemy.blockChance ?? 0
  const zealot = stats.classBonusesActive.includes('zealot')

  if (blk > 0 && Math.random() * 100 < blk) {
    let base = rollDamage(stats.hitDamageMin, stats.hitDamageMax, zealot)
    base *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
    const frac = enemyLife / Math.max(1, enemy.maxLife)
    base *= enemyDamageTakenMultiplier(stats, frac)
    return { damage: mitigatedPlayerHitVsArmor(enemy, stats, base), outcome: 'enemy_blocked' }
  }

  let base = rollDamage(stats.hitDamageMin, stats.hitDamageMax, zealot)
  if (Math.random() * 100 < stats.critChance) {
    base *= stats.critMultiplier
  }

  if (stats.classBonusesActive.includes('destroyer')) {
    const tripleChance = stats.doubleDamageChance / 2
    if (Math.random() * 100 < tripleChance) base *= 3
    else if (Math.random() * 100 < stats.doubleDamageChance) base *= 2
  } else if (Math.random() * 100 < stats.doubleDamageChance) {
    base *= 2
  }

  base *= 1 + outgoingPlayerIncreasedDamageFrac(stats)
  const frac = enemyLife / Math.max(1, enemy.maxLife)
  base *= enemyDamageTakenMultiplier(stats, frac)

  return { damage: mitigatedPlayerHitVsArmor(enemy, stats, base), outcome: 'hit' }
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
  if (critC > 0 && Math.random() * 100 < critC) {
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

  const blocked = stats.blockChance > 0 && Math.random() * 100 < stats.blockChance
  if (blocked) {
    afterPath *= DEFAULT_BLOCK_DAMAGE_TAKEN_MULT
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

  const log: BattleLogEntry[] = [
    { t: 0, kind: 'phase', message: `Encounter: ${enemy.name}` },
  ]

  let hitsPlayer = 0
  let hitsEnemy = 0

  while (t < maxDuration) {
    if (player.life <= 0) break
    if (enemyLife <= 0) break

    const pAps = playerApsWithBerserker(stats, player.life)

    if (t + 1e-9 >= nextPlayer) {
      if (player.mana >= stats.manaCostPerAttack) {
        player.mana -= stats.manaCostPerAttack
        const { damage, outcome } = resolvePlayerAttack(enemy, enemyLife, stats)
        enemyLife -= damage
        if (damage > 0) hitsPlayer++
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
      } else if (log.length < maxLog) {
        log.push({ t, kind: 'player_attack', message: 'Out of mana — attack skipped' })
      }
      nextPlayer = t + 1 / Math.max(0.2, pAps)
    }

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
      nextEnemy = t + 1 / Math.max(0.15, apsEnemy)
    }

    player.mana = Math.min(stats.maxMana, player.mana + stats.manaRegenPerSecond * dt)
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
  }
}
