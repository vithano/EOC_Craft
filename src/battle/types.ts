import type { ComputedBuildStats } from '../data/gameStats'

/** Default fraction of blocked hit damage that still gets through (glossary: 50% block power). */
export const DEFAULT_BLOCK_DAMAGE_TAKEN_MULT = 0.5

/**
 * Denominators for flat enemy mods (Vital, Plated, …): scaled stat × `(ref + ΣΔ) / ref`.
 * When omitted, formula CSV enemy bases (40 life, 1 armour, …) are used.
 */
export interface EnemyModifierRatioBases {
  life: number
  armour: number
  evasion: number
  accuracy: number
  speed: number
}

export interface DemoEnemyDef {
  id: string
  name: string
  maxLife: number
  /** Optional mana pool (used for build-vs-build symmetry). */
  maxMana?: number
  /** Optional per-action mana cost for enemy attacks/casts. */
  manaCostPerAttack?: number
  /** Optional mana regeneration per second for the enemy. */
  manaRegenPerSecond?: number
  /** Optional: % of incoming damage taken from mana before ES/life. */
  damageTakenToManaFirstPercent?: number
  /** Optional: if active, 25% of incoming damage is taken from mana while above 50% mana. */
  manaShieldActive?: boolean
  /** If true, enemy ignores mana costs and keeps mana at 0. */
  noMana?: boolean
  manaCostPaidWithLife?: boolean
  manaCostPaidWithEnergyShield?: boolean
  /** Mirror player stat: take chaos damage equal to % of ability cost when casting spells. */
  takeChaosDamageEqualToPctOfAbilityCostOnSpellCast?: number
  /** Mirror player stat: lose % of max life when taking an attack action. */
  takePhysicalDamagePercentOfMaxLifeWhenYouAttack?: number
  /** Optional extra pool (e.g. Barrier enemy mod). Damage is applied to ES before life. */
  maxEnergyShield?: number
  /**
   * When true, Barrier adds literal mod ES. Otherwise Barrier ES is
   * `modES × refLife / enemyBaseLife × rarityLifeMult` (refLife = `modifierRatioBases.life` or CSV 40).
   * That follows the enemy life level curve without using tier-scaled max life (no Nexus-tier ES creep).
   */
  barrierEsFlat?: boolean
  /** Elite/boss life multiplier only (1 = normal). Used for Barrier ES; omit → 1. */
  rarityLifeMult?: number
  /**
   * Elite/boss regeneration multiplier only (1 = normal).
   * Sheet: elite = 1.4, boss = 1.8 for life & ES regeneration.
   */
  rarityRegenMult?: number
  /** Anchors for flat mod ratios (e.g. level-100 stats for Nexus); omit → CSV bases. */
  modifierRatioBases?: EnemyModifierRatioBases
  armour: number
  evasionRating: number
  accuracy: number
  /** Default physical hit range when per-type ranges are not provided. */
  damageMin: number
  damageMax: number
  /** Optional per-type hit ranges (for multi-type armour splitting). */
  physicalDamageMin?: number
  physicalDamageMax?: number
  elementalDamageMin?: number
  elementalDamageMax?: number
  /** Optional per-element hit ranges (if provided, overrides equal elemental split). */
  fireDamageMin?: number
  fireDamageMax?: number
  coldDamageMin?: number
  coldDamageMax?: number
  lightningDamageMin?: number
  lightningDamageMax?: number
  chaosDamageMin?: number
  chaosDamageMax?: number
  aps: number
  /** When true, simulator uses `aps` as-is (skip player-side enemy speed modifiers). */
  useOwnApsOnly?: boolean
  /** 0–100; default enemy has no block */
  blockChance?: number
  dodgeChance?: number
  critChance?: number
  critMultiplier?: number
  /** 0–100; attacker armour ignore (e.g. Sundering mod). */
  armourIgnorePercent?: number
  /** 0–100; attacker elemental/chaos resistance penetration (e.g. Sundering mod). */
  resistancePenetrationPercent?: number
  /** If true, this enemy can counter-attack when it blocks, using `counterAttackFirePctOfPrevented`. */
  counterAttackOnBlock?: boolean
  /** Counter-attack bonus: % of prevented damage added as flat fire to the counter hit. */
  counterAttackFirePctOfPrevented?: number
  /** 0–100; optional — lightning portion of player hits is reduced by this minus player penetration. */
  lightningResistancePercent?: number
  fireResistancePercent?: number
  coldResistancePercent?: number
  chaosResistancePercent?: number
  /** Optional zone for formulas.csv elemental resistance scaling. */
  zone?: number

  /** If true, enemy attacks are treated as spells for evasion rules (evasion is half as effective vs spells). */
  attackIsSpell?: boolean
  /** Opponent speed multiplier this enemy applies (e.g. "enemies have less attack/cast speed"). */
  enemiesMoreSpeedMultiplier?: number
}

export interface BattleParticipantState {
  life: number
  energyShield: number
  mana: number
}

export interface EncounterTimelinePoint {
  t: number
  player: BattleParticipantState & { actionBar: number }
  enemy: { life: number; energyShield: number; mana: number; actionBar: number }
}

export interface BattleLogEntry {
  t: number
  kind: 'player_attack' | 'enemy_attack' | 'phase' | 'ailment' | 'dot_tick'
  message: string
  damage?: number
  /** Optional structured breakdown for UI drill-down. */
  details?: unknown
}

/** Shock/chill ailments applied to the enemy in the demo sim (for UI summary). */
export interface EnemyDebuffEvent {
  t: number
  kind: 'shock' | 'chill'
  /** Shock: % increased damage taken from your hits. Chill: % reduced enemy action speed. */
  magnitudePct: number
  durationSec: number
}

export interface EnemyAilmentSummary {
  /** Maximum concurrent stacks observed during the encounter. */
  maxStacks: { bleed: number; poison: number; ignite: number; shock: number; chill: number }
  /** Maximum total DoT DPS observed (sum of all active stacks of that kind). */
  maxDotDps: { bleed: number; poison: number; ignite: number; total: number }
  /** Maximum combined magnitudes observed (sum of active stacks, after caps). */
  maxNonDotMagnitudePct: { shock: number; chill: number }
}

export interface PlayerAilmentSummary {
  /** Maximum concurrent stacks observed on the player during the encounter. */
  maxStacks: { bleed: number; poison: number; ignite: number }
  /** Maximum total DoT DPS observed on the player. */
  maxDotDps: { bleed: number; poison: number; ignite: number; total: number }
  /** Maximum non-damaging ailment magnitudes observed on the player. */
  maxNonDotMagnitudePct: { shock: number; chill: number }
}

export interface EncounterResult {
  winner: 'player' | 'enemy' | 'timeout'
  durationSeconds: number
  playerFinal: BattleParticipantState
  enemyLifeFinal: number
  /** Optional final enemy ES for UI (enemy pools can include Barrier ES). */
  enemyEnergyShieldFinal?: number
  log: BattleLogEntry[]
  hitsLandedPlayer: number
  hitsLandedEnemy: number
  /** Total enemy life removed by damaging ailments (bleed, poison, ignite) over the fight. */
  totalDotDamageToEnemy?: number
  /** Shock/chill applications (for UI summary). */
  enemyDebuffEvents?: EnemyDebuffEvent[]
  /** Aggregated ailment stats for UI display (includes damaging + non-damaging). */
  enemyAilmentSummary?: EnemyAilmentSummary
  /** Aggregated ailment stats applied to the player during the encounter. */
  playerAilmentSummary?: PlayerAilmentSummary
  /** True if combat log was truncated to fit UI limit. */
  logTruncated?: boolean

  /** Optional per-step playback timeline (when `options.recordTimeline` is enabled). */
  timeline?: EncounterTimelinePoint[]

  /** Aggregated totals for the encounter (for UI summary). */
  totals?: {
    damageToEnemy: number
    damageToEnemyFromHits: number
    damageToEnemyFromDots: number

    damageToPlayer: number
    damageToPlayerFromEnemyHits: number
    damageToPlayerFromDots: number
    damageToPlayerFromSelf: number

    regenToPlayerLife: number
    regenToPlayerMana: number
    regenToPlayerEnergyShield: number

    regenToEnemyLife: number
    regenToEnemyEnergyShield: number
  }
}

export interface EncounterOptions {
  /** Cap simulation length (seconds). */
  maxDurationSeconds?: number
  /** Physics step (seconds); smaller = more accurate attack timing. */
  dt?: number
  /** Log at most N combat lines (plus start/end). */
  maxLogEntries?: number
  /** Record a per-step timeline suitable for real-time playback UI. */
  recordTimeline?: boolean
}

export interface BattleContext {
  stats: ComputedBuildStats
  enemy: DemoEnemyDef
  /** Optional formulas.csv enemy mods applied in combat (up to 3). */
  enemyMods?: readonly import('../data/enemyModifiers').EnemyModifierId[]
  /**
   * Optional enemy mods with tiers (1–3). If provided, takes precedence over `enemyMods`.
   * Tier scaling is a demo convenience for quickly exploring harder variants.
   */
  enemyModsWithTiers?: readonly { id: import('../data/enemyModifiers').EnemyModifierId; tier: 1 | 2 | 3 }[]
  options?: EncounterOptions
}
