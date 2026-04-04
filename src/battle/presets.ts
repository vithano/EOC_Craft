import { emptyEquipmentModifiers, type BuildConfig } from '../data/gameStats'
import { GAME_CLASSES_BY_ID } from '../data/gameClasses'

/** Spread `totalPoints` across a class's upgrades in round-robin, capping each at 5. */
function distributeToClass(classId: string, totalPoints: number): Record<string, number> {
  const cls = GAME_CLASSES_BY_ID[classId]
  if (!cls || totalPoints <= 0) return {}
  const keys = cls.upgrades.map(u => `${classId}/${u.id}`)
  const out: Record<string, number> = {}
  let left = Math.min(totalPoints, keys.length * 5)
  let i = 0
  while (left > 0) {
    const k = keys[i % keys.length]
    if ((out[k] ?? 0) < 5) {
      out[k] = (out[k] ?? 0) + 1
      left--
    }
    i++
    if (i > keys.length * 25) break
  }
  return out
}

function mergeLevels(...parts: Record<string, number>[]): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) {
      acc[k] = (acc[k] ?? 0) + v
    }
  }
  return acc
}

const emptyEq = emptyEquipmentModifiers()

export const DEMO_BUILD_PRESETS: { id: string; label: string; config: BuildConfig }[] = [
  {
    id: 'starter',
    label: 'Starter (no class points)',
    config: { upgradeLevels: {}, equipmentModifiers: emptyEq },
  },
  {
    id: 'warrior_10',
    label: 'Warrior bonus (10 pts)',
    config: {
      upgradeLevels: distributeToClass('warrior', 10),
      equipmentModifiers: emptyEq,
    },
  },
  {
    id: 'rogue_12',
    label: 'Rogue + Hunter (combat speed)',
    config: {
      upgradeLevels: mergeLevels(distributeToClass('rogue', 10), distributeToClass('hunter', 5)),
      equipmentModifiers: emptyEq,
    },
  },
  {
    id: 'sorc_arcanist',
    label: 'Sorcerer 15 → Arcanist 15',
    config: {
      upgradeLevels: mergeLevels(distributeToClass('sorcerer', 15), distributeToClass('arcanist', 15)),
      equipmentModifiers: emptyEq,
    },
  },
]
