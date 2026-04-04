import type { DemoEnemyDef } from './types'

/** Demo opponents tuned for ~level-appropriate base player (300 life, ~4–5 dps). */
export const DEMO_ENEMIES: readonly DemoEnemyDef[] = [
  {
    id: 'training_dummy',
    name: 'Training Dummy',
    maxLife: 400,
    armour: 40,
    evasionRating: 15,
    accuracy: 25,
    damageMin: 2,
    damageMax: 5,
    aps: 0.65,
    critChance: 0,
    critMultiplier: 2,
  },
  {
    id: 'bandit',
    name: 'Ridge Bandit',
    maxLife: 520,
    armour: 70,
    evasionRating: 45,
    accuracy: 85,
    damageMin: 4,
    damageMax: 9,
    aps: 0.85,
    critChance: 5,
    critMultiplier: 2,
  },
  {
    id: 'highway_thug',
    name: 'Highway Thug',
    maxLife: 700,
    armour: 120,
    evasionRating: 30,
    accuracy: 110,
    damageMin: 6,
    damageMax: 14,
    aps: 0.9,
    blockChance: 8,
    critChance: 6,
    critMultiplier: 2.1,
  },
]

export const DEMO_ENEMIES_BY_ID: Readonly<Record<string, DemoEnemyDef>> =
  Object.fromEntries(DEMO_ENEMIES.map(e => [e.id, e]))
