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
}

export interface BattleParticipantState {
  life: number
  energyShield: number
  mana: number
}

export interface BattleLogEntry {
  t: number
  kind: 'player_attack' | 'enemy_attack' | 'phase'
  message: string
  damage?: number
}

export interface EncounterResult {
  winner: 'player' | 'enemy' | 'timeout'
  durationSeconds: number
  playerFinal: BattleParticipantState
  enemyLifeFinal: number
  log: BattleLogEntry[]
  hitsLandedPlayer: number
  hitsLandedEnemy: number
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
