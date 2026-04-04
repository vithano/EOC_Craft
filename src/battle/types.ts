import type { ComputedBuildStats } from '../data/gameStats'

/** Default fraction of blocked hit damage that still gets through (glossary: 50% block power). */
export const DEFAULT_BLOCK_DAMAGE_TAKEN_MULT = 0.5

export interface DemoEnemyDef {
  id: string
  name: string
  maxLife: number
  armor: number
  evasionRating: number
  accuracy: number
  damageMin: number
  damageMax: number
  aps: number
  /** 0–100; default enemy has no block */
  blockChance?: number
  dodgeChance?: number
  critChance?: number
  critMultiplier?: number
  /** 0–100; optional — lightning portion of player hits is reduced by this minus player penetration. */
  lightningResistancePercent?: number
}

export interface BattleParticipantState {
  life: number
  energyShield: number
  mana: number
}

export interface BattleLogEntry {
  t: number
  kind: 'player_attack' | 'enemy_attack' | 'phase' | 'ailment' | 'dot_tick'
  message: string
  damage?: number
}

/** Shock/chill ailments applied to the enemy in the demo sim (for UI summary). */
export interface EnemyDebuffEvent {
  t: number
  kind: 'shock' | 'chill'
  /** Shock: % increased damage taken from your hits. Chill: % reduced enemy action speed. */
  magnitudePct: number
  durationSec: number
}

export interface EncounterResult {
  winner: 'player' | 'enemy' | 'timeout'
  durationSeconds: number
  playerFinal: BattleParticipantState
  enemyLifeFinal: number
  log: BattleLogEntry[]
  hitsLandedPlayer: number
  hitsLandedEnemy: number
  /** Total enemy life removed by damaging ailments (bleed, poison, ignite) over the fight. */
  totalDotDamageToEnemy?: number
  /** Shock/chill applications (for UI summary). */
  enemyDebuffEvents?: EnemyDebuffEvent[]
}

export interface EncounterOptions {
  /** Cap simulation length (seconds). */
  maxDurationSeconds?: number
  /** Physics step (seconds); smaller = more accurate attack timing. */
  dt?: number
  /** Log at most N combat lines (plus start/end). */
  maxLogEntries?: number
}

export interface BattleContext {
  stats: ComputedBuildStats
  enemy: DemoEnemyDef
  options?: EncounterOptions
}
