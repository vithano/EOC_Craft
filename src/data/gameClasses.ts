export type UpgradeModifierKey =
  | 'increasedLife' | 'increasedEnergyShield' | 'increasedSpellDamage'
  | 'increasedAttackDamage' | 'increasedMeleeDamage' | 'increasedDamage'
  | 'increasedElementalDamage' | 'increasedElementalDamageWithAttacks'
  | 'increasedCriticalHitChance' | 'increasedAttackCriticalHitChance'
  | 'increasedSpellCriticalHitChance' | 'increasedArmour'
  | 'increasedArmourAndEvasionRating' | 'increasedArmourAndEnergyShield'
  | 'increasedEvasionRating' | 'increasedEvasionRatingAndEnergyShield'
  | 'increasedMana' | 'increasedManaRegeneration'
  | 'increasedAllElementalResistances' | 'increasedChaosResistance'
  | 'increasedChanceToBlock' | 'increasedChanceToDodge'
  | 'increasedAttackSpeed' | 'increasedAttackSpeedAndCastSpeed'
  | 'increasedMeleeAttackSpeed' | 'increasedCastSpeed'
  | 'increasedAccuracyRating' | 'increasedStrength' | 'increasedDexterity'
  | 'increasedIntelligence' | 'increasedChanceToInflictBleedingWithAttacks'
  | 'increasedChanceToInflictPoisonWithAttacks'
  | 'increasedChanceToInflictElementalAilments' | 'increasedAilmentDuration'
  | 'increasedEffectOfNonDamagingAilments' | 'increasedDamageOverTimeMultiplier'
  | 'increasedLifeRecovery' | 'gainLifeOnKill' | 'gainManaOnKill'
  | 'gainEnergyShieldOnKill' | 'gainEnergyShieldOnHit';

export interface UpgradeDef {
  id: UpgradeModifierKey;
  label: string;
  valuePerPoint: number;
  isFlat: boolean;
  maxPoints: 5;
}

export interface ClassPerLevel {
  str?: number;
  dex?: number;
  int?: number;
}

export type ClassTier = 'base' | 'intermediate' | 'major';

export type ClassRequirement =
  | { type: 'none' }
  | { type: 'or'; classIds: string[] }
  | { type: 'and'; classIds: string[] };

export interface ClassDef {
  id: string;
  name: string;
  tier: ClassTier;
  maxLevel: number;
  classBonusRequiredPoints: number;
  perLevel: ClassPerLevel;
  classBonusDescription: string;
  upgrades: UpgradeDef[];
  requirement: ClassRequirement;
}

/** Max total passive ranks across all classes in the planner (shown as character level). */
export const MAX_PLANNER_LEVEL = 100;

import generated from './gameClasses.generated.json'

type GeneratedClassRow = {
  id: string
  name: string
  tier: ClassTier
  maxLevel: number
  classBonusRequiredPoints: number
  perLevel: { str: number; dex: number; int: number }
  requirement: { type: 'none' | 'or' | 'and'; classIds: string[] }
  classBonusText: string
  upgrades: { id: UpgradeModifierKey; label: string; valuePerPoint: number; isFlat: boolean; maxPoints: number }[]
}

function normalizePerLevel(p: { str: number; dex: number; int: number }): ClassPerLevel {
  const out: ClassPerLevel = {}
  if (p.str) out.str = p.str
  if (p.dex) out.dex = p.dex
  if (p.int) out.int = p.int
  return out
}

function buildClassesFromGenerated(rows: GeneratedClassRow[]): ClassDef[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    tier: c.tier,
    maxLevel: c.maxLevel,
    classBonusRequiredPoints: c.classBonusRequiredPoints,
    perLevel: normalizePerLevel(c.perLevel),
    classBonusDescription: c.classBonusText,
    upgrades: (c.upgrades ?? []).map((u) => ({
      id: u.id,
      label: u.label,
      valuePerPoint: u.valuePerPoint,
      isFlat: u.isFlat,
      maxPoints: 5,
    })),
    requirement:
      c.requirement?.type === 'or'
        ? { type: 'or', classIds: c.requirement.classIds }
        : c.requirement?.type === 'and'
          ? { type: 'and', classIds: c.requirement.classIds }
          : { type: 'none' },
  }))
}

export let GAME_CLASSES: readonly ClassDef[] =
  buildClassesFromGenerated(generated as unknown as GeneratedClassRow[])

export let GAME_CLASSES_BY_ID: Readonly<Record<string, ClassDef>> =
  Object.fromEntries(GAME_CLASSES.map(c => [c.id, c]))

export function updateGameClassDefinitions(next: ClassDef[]): void {
  if (!Array.isArray(next) || next.length === 0) return
  GAME_CLASSES = next
  GAME_CLASSES_BY_ID = Object.fromEntries(GAME_CLASSES.map(c => [c.id, c]))
}

/**
 * Clockwise from the top on the radial web. Inner = base tier; mid = intermediate; outer = major.
 * Each major sits between the two intermediates in its AND requirement (consecutive in the mid ring, including wrap).
 */
export const CLASS_WEB_ORDER: Readonly<Record<ClassTier, readonly string[]>> = {
  base: ['sorcerer', 'rogue', 'hunter', 'fighter', 'warrior', 'acolyte'],
  intermediate: [
    'arcanist',
    'trickster',
    'assassin',
    'pathfinder',
    'windrunner',
    'mercenary',
    'champion',
    'barbarian',
    'juggernaut',
    'zealot',
    'guardian',
    'druid',
  ],
  major: [
    'occultist',
    'reaper',
    'shadow',
    'mirage',
    'dervish',
    'dragoon',
    'berserker',
    'destroyer',
    'chieftain',
    'templar',
    'ascendant',
    'archmage',
  ],
};

export function getClassesInWebOrder(tier: ClassTier): ClassDef[] {
  const ids = CLASS_WEB_ORDER[tier];
  return ids
    .map(id => GAME_CLASSES_BY_ID[id])
    .filter((c): c is ClassDef => c != null && c.tier === tier);
}

/** Emoji per class for comb / modals. */
export const CLASS_ICONS: Readonly<Record<string, string>> = {
  sorcerer: '🔮',
  rogue: '🗡️',
  hunter: '🏹',
  fighter: '⚔️',
  warrior: '🛡️',
  acolyte: '📿',
  arcanist: '✨',
  druid: '🌿',
  guardian: '🏛️',
  zealot: '⚡',
  juggernaut: '🪨',
  barbarian: '🪓',
  champion: '👑',
  mercenary: '🎖️',
  windrunner: '💨',
  pathfinder: '🧭',
  assassin: '🥷',
  trickster: '🎭',
  archmage: '📚',
  ascendant: '🌟',
  templar: '⛪',
  chieftain: '🔥',
  destroyer: '💀',
  berserker: '😤',
  dragoon: '🐉',
  dervish: '🌀',
  mirage: '🌫️',
  shadow: '🌑',
  reaper: '⚰️',
  occultist: '🔯',
};

export function getClassIcon(classId: string): string {
  return CLASS_ICONS[classId] ?? '◆';
}

export function getClassLevel(
  classId: string,
  upgradeLevels: Record<string, number>
): number {
  return Object.entries(upgradeLevels)
    .filter(([key]) => key.startsWith(classId + '/'))
    .reduce((sum, [, v]) => sum + v, 0);
}

export function isClassBonusActive(
  classId: string,
  upgradeLevels: Record<string, number>
): boolean {
  const cls = GAME_CLASSES_BY_ID[classId];
  if (!cls) return false;
  return getClassLevel(classId, upgradeLevels) >= cls.classBonusRequiredPoints;
}

/** Points needed in a prerequisite before it counts for unlocking classes that list it (base 10, intermediate/major 15). */
export function getPrerequisiteActivationPoints(prereqClassId: string): number {
  const p = GAME_CLASSES_BY_ID[prereqClassId];
  return p?.classBonusRequiredPoints ?? 999;
}

export function isClassUnlocked(
  classId: string,
  upgradeLevels: Record<string, number>
): boolean {
  const cls = GAME_CLASSES_BY_ID[classId];
  if (!cls) return false;
  if (cls.requirement.type === 'none') return true;
  if (cls.requirement.type === 'or') {
    return cls.requirement.classIds.some(
      id => getClassLevel(id, upgradeLevels) >= getPrerequisiteActivationPoints(id)
    );
  }
  // 'and'
  return cls.requirement.classIds.every(
    id => getClassLevel(id, upgradeLevels) >= getPrerequisiteActivationPoints(id)
  );
}

export const BASE_GAME_STATS = {
  baseLife: 290,
  baseMana: 140,
  baseStr: 15,
  baseDex: 15,
  baseInt: 15,
  baseHitDamageMin: 3,
  baseHitDamageMax: 6,
  baseAps: 1.0,
  baseManaPerAttack: 3,
  baseAccuracy: 20,
  baseCritChance: 5,
  critMultiplier: 2.0,
  /** Naked character armour before gear flat (evasion has baseEvasion; both follow flat × (1 + inc%) in gameStats). */
  baseArmour: 0,
  baseEvasion: 20,
  baseResistances: 0,
  maxResistance: 75,
  baseManaRegenPerSecond: 4,
  baseManaRegenPercent: 2.5,
  baseLifeRecoveryAfterEncounterPct: 10,
  baseEsRecoveryAfterEncounterPct: 25,
} as const;
