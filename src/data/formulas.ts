/**
 * Sheet-aligned helpers (armour DR, shared with battle + Eoc stats panel) and legacy
 * class-stub {@link computeStats}. **Build planner numbers** come from
 * {@link computeBuildStats} in `gameStats.ts`, not from `computeStats`.
 */
import type { ItemModifiers } from './equipment';
import type { BaseStats } from './classes';
import {
  computeEvasionChancePercent,
  computeHitChancePercent,
  computeNonDamagingAilmentEffectPercent,
  LEVEL_100_ENEMY_ACCURACY,
  LEVEL_100_ENEMY_EVASION,
  LEVEL_100_PLAYER_ACCURACY,
} from './eocFormulas';
import { getCrucibleTierRow, getNexusTierRow } from './nexusEnemyScaling';
import { FORMULA_CONSTANTS } from './formulaConstants';

export interface ComputedStats {
  strength: number;
  agility: number;
  intelligence: number;
  vitality: number;
  dexterity: number;
  health: number;
  mana: number;
  damage: number;
  armour: number;
  evasion: number;
  critChance: number;
  effectiveDamage: number;
  damageReduction: number;
  /** Evasion_Accuracy.csv: chance to evade when attacked (default enemy acc 327). */
  evasionChanceVsEnemy: number;
  /** Chance your hit lands vs enemy evasion (default you 317 acc vs enemy 4402 eva). */
  hitChanceVsEnemy: number;
  /** Non-Damaging Ailment Effect.csv — shock preview (post-mit damage vs your life+ES). */
  ailmentShockEffectPct: number;
  /** Same formula with specialChillMultiplier 0.7. */
  ailmentChillEffectPct: number;
}

export const FORMULA_DESCRIPTIONS: Record<string, string> = {
  statStacking:
    'computeBuildStats: all “increased” that apply to the same outcome are summed (Σ), then ×(1+Σ/100); “more”/“less” multiply separately (product of factors).',
  plannerMaxLife:
    'computeBuildStats: lifeFlat × (1 + Σ increased max life /100) × Π more max life (gear); occultist → 1',
  plannerMaxMana:
    'computeBuildStats: manaFlat × (1 + Σ increased max mana /100) × Π more max mana (gear)',
  plannerManaRegen:
    'computeBuildStats: (base regen + druid + %max mana flat from gear) × (1 + Σ increased mana regen /100)',
  health: 'baseHealth + (vitality * 10) + equipmentHealth',
  mana: 'baseMana + (intelligence * 8) + equipmentMana',
  damage: 'baseDamage + equipmentDamage + (strength * 2) + (intelligence * 1.5) + (agility * 0.5) + critBonus',
  armour:
    'computeBuildStats: (baseArmour + flatArmour) * (1 + (armourFromUpgrades + defFromDex)/100) * defencesLessMult; defFromDex = floor(dex/10)*attrDefMult*2 (2% inc. defences per 10 DEX)',
  evasion:
    'computeBuildStats: (baseEvasion + flatEvasion) * (1 + (evasionFromUpgrades + defFromDex)/100) * evasionMoreMult * defencesLessMult; same defFromDex as armour',
  energyShield:
    'computeBuildStats: esBase × (1 + Σ increased ES /100) × occultistMore × esLessMult; Σ = esFromUpgrades + defFromDex (same additive increased-defence treatment as armour)',
  critChance:
    'computeBuildStats: min(100, flat * (1 + inc%/100)); flat = weaponOrGameBase + assassin + attackCritGear + critChanceBonus (spells: spellBase + assassin + critBonus + spellCritGear); inc = increased crit upgrades + gear inc% + 2%/10 DEX (× attr mult)',
  critMultiplier:
    'computeBuildStats: (baseCritMult + flatCritMultBonus) * (1 + (increasedCritMultFromGear + attunement) / 100) — same flat×(1+inc%) shape as crit chance; recomputeCritMultiplier() then refresh avgEffectiveDamage and DPS',
  effectiveDamage:
    'computeBuildStats: avgHit * (1 + (critChance/100) * (critMultiplier - 1)) — only the portion above a non-crit uses (M-1), not M',
  damageReduction:
    'min(90, (armour / (500 * (incomingDamage / (incomingDamage + 500)) * 18 + armour)) * 100 + physicalDamageReduction)',
  evasionChanceVsEnemy:
    'clamp(0..90, (1 - ((enemyAccuracy * 1.35) / (enemyAccuracy + (evasion * 0.1)))) * 100 + flatFinalEvasionChance)',
  hitChanceVsEnemy: '100 - evasionChanceVsEnemy(same inputs)',
  ailmentShockEffectPct:
    'sqrt(damage_valid / ((life + es) * 5)) * ailmentMult * extraEffectMult * 1.0 (Non-Damaging Ailment Effect.csv)',
  ailmentChillEffectPct: 'same as shock with specialChillMultiplier 0.7',
  nexusTierScaling: 'table: formulas/Nexus Tier Enemy Scaling.csv (tiers 0–30)',
  chartsTab: 'Charts.csv — lookup grids; evasion matches Evasion formula; armour cells use Armour formula',
  crucibleTierScaling: 'Crucible CSV placeholder — interpolate from Nexus table per sheet note',
  enemyModifiers:
    'formulas.csv enemy mods (up to 3): vital, plated, elusive, barrier, hallowed (+chaos res), warded (+elemental res only), … — stacked on nexus tier preview',
};

interface ClassBaseValues {
  baseHealth: number;
  baseMana: number;
  baseDamage: number;
  baseCritChance: number;
  critMultiplier: number;
}

export const CLASS_BASE: Record<string, ClassBaseValues> = {
  warrior: { baseHealth: 200, baseMana: 60, baseDamage: 20, baseCritChance: 3, critMultiplier: 1.8 },
  mage: { baseHealth: 100, baseMana: 180, baseDamage: 10, baseCritChance: 5, critMultiplier: 2.0 },
  rogue: { baseHealth: 140, baseMana: 80, baseDamage: 16, baseCritChance: 8, critMultiplier: 2.2 },
  paladin: { baseHealth: 180, baseMana: 120, baseDamage: 16, baseCritChance: 3, critMultiplier: 1.7 },
  ranger: { baseHealth: 150, baseMana: 100, baseDamage: 14, baseCritChance: 6, critMultiplier: 2.0 },
};

export interface FormulaContext {
  incomingDamage?: number;
  physicalDamageReduction?: number; // flat percentage points, added after armour reduction
  maxDamageReduction?: number; // percentage points
  /** Attacker accuracy when you are defending (default level-100 enemy 327). Overridden by Nexus tier if set. */
  enemyAccuracy?: number;
  /** Your accuracy when enemy defends (default level-100 player 327). */
  playerAccuracy?: number;
  /** Defender evasion when you attack (default level-100 enemy 4402). Overridden by Nexus tier if set. */
  enemyEvasion?: number;
  flatFinalEvasionChance?: number;
  /** Energy shield for ailment formula (life + ES pool). */
  energyShield?: number;
  ailmentMultiplier?: number;
  ailmentExtraEffectMultiplier?: 1 | 1.4;
  /** If set, Nexus tier overrides enemy accuracy / evasion from table for evasion + hit chance. */
  nexusTier?: number | null;
  crucibleTier?: number | null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * From the referenced spreadsheet:
 * armourReduction = Armour / ((500 * (Damage / (Damage + 500)) * 18) + Armour)
 *
 * Notes:
 * - Physical Damage Reduction is added flat on top of the resulting armour reduction
 * - Total (armour + physical) reduction is capped at 90%
 */
export function computeDamageReductionPercentFromArmour(
  armour: number,
  incomingDamage: number,
  physicalDamageReduction = 0,
  maxDamageReduction = FORMULA_CONSTANTS.armourDrCap * 100
) {
  const { armourDrScaling, armourDrDamageRef } = FORMULA_CONSTANTS;
  const a = Math.max(0, armour);
  const d = Math.max(0, incomingDamage);
  const scaling = armourDrScaling * (d / (d + armourDrDamageRef));
  const armourReductionPct = a <= 0 ? 0 : (a / (scaling + a)) * 100;
  return clamp(armourReductionPct + physicalDamageReduction, 0, maxDamageReduction);
}

export function computeStats(
  classId: string,
  equipModifiers: ItemModifiers,
  upgradeModifiers: ItemModifiers,
  classBaseStats: Partial<BaseStats>,
  ctx: FormulaContext = {}
): ComputedStats {
  const base = CLASS_BASE[classId] ?? CLASS_BASE.warrior;
  const em = equipModifiers;
  const um = upgradeModifiers;
  const cs = classBaseStats;

  const strength = (cs.strength ?? 0) + (em.strength ?? 0) + (um.strength ?? 0);
  const agility = (cs.agility ?? 0) + (em.agility ?? 0) + (um.agility ?? 0);
  const intelligence = (cs.intelligence ?? 0) + (em.intelligence ?? 0) + (um.intelligence ?? 0);
  const vitality = (cs.vitality ?? 0) + (em.vitality ?? 0) + (um.vitality ?? 0);
  const dexterity = (cs.dexterity ?? 0) + (em.dexterity ?? 0) + (um.dexterity ?? 0);

  // PLACEHOLDER FORMULA: health = baseHealth + vitality*10 + equipHealth
  const health = base.baseHealth + vitality * 10 + (em.health ?? 0) + (um.health ?? 0);

  // PLACEHOLDER FORMULA: mana = baseMana + intelligence*8 + equipMana
  const mana = base.baseMana + intelligence * 8 + (em.mana ?? 0) + (um.mana ?? 0);

  // PLACEHOLDER FORMULA: damage = baseDamage + equipDamage + str*2 + int*1.5 + agi*0.5
  const damage =
    base.baseDamage +
    (em.damage ?? 0) +
    (um.damage ?? 0) +
    strength * 2 +
    intelligence * 1.5 +
    agility * 0.5;

  // PLACEHOLDER FORMULA: armour = equipArmour + vitality*1.5 + upgradeArmour
  const armour = (em.armour ?? 0) + vitality * 1.5 + (um.armour ?? 0);

  // PLACEHOLDER FORMULA: evasion = equipEvasion + agility*1.2 + dexterity*0.8 + upgradeEvasion
  const evasion = (em.evasion ?? 0) + agility * 1.2 + dexterity * 0.8 + (um.evasion ?? 0);

  // Legacy placeholder (not EOC computeBuildStats): additive crit — see gameStats crit section for real formula
  const critChance = base.baseCritChance + (em.critChance ?? 0) + (um.critChance ?? 0);

  // Expected damage per hit (same structure as computeBuildStats avgEffectiveDamage)
  const effectiveDamage =
    damage * (1 + (critChance / 100) * (base.critMultiplier - 1));

  const incomingDamage = ctx.incomingDamage ?? 100;
  const physicalDamageReduction = ctx.physicalDamageReduction ?? 0;
  const maxDamageReduction = ctx.maxDamageReduction ?? 90;

  const damageReduction = computeDamageReductionPercentFromArmour(
    armour,
    incomingDamage,
    physicalDamageReduction,
    maxDamageReduction
  );

  const nexus =
    ctx.crucibleTier != null ? getCrucibleTierRow(ctx.crucibleTier)
      : ctx.nexusTier != null ? getNexusTierRow(ctx.nexusTier)
        : undefined;
  const enemyAccuracy = nexus?.accuracy ?? ctx.enemyAccuracy ?? LEVEL_100_ENEMY_ACCURACY;
  const enemyEvasion = nexus?.evasion ?? ctx.enemyEvasion ?? LEVEL_100_ENEMY_EVASION;
  const playerAccuracy = ctx.playerAccuracy ?? LEVEL_100_PLAYER_ACCURACY;
  const flatEv = ctx.flatFinalEvasionChance ?? 0;

  const evasionChanceVsEnemy = computeEvasionChancePercent(enemyAccuracy, evasion, flatEv);
  const hitChanceVsEnemy = computeHitChancePercent(playerAccuracy, enemyEvasion, flatEv);

  const es = ctx.energyShield ?? 0;
  const postMitHit =
    incomingDamage * Math.max(0, 1 - damageReduction / 100);
  const ailMult = ctx.ailmentMultiplier ?? 1;
  const extraAil = ctx.ailmentExtraEffectMultiplier ?? 1;
  const ailmentShockEffectPct = computeNonDamagingAilmentEffectPercent(
    postMitHit,
    health,
    es,
    ailMult,
    extraAil,
    1
  );
  const ailmentChillEffectPct = computeNonDamagingAilmentEffectPercent(
    postMitHit,
    health,
    es,
    ailMult,
    extraAil,
    0.7
  );

  return {
    strength: Math.round(strength),
    agility: Math.round(agility),
    intelligence: Math.round(intelligence),
    vitality: Math.round(vitality),
    dexterity: Math.round(dexterity),
    health: Math.round(health),
    mana: Math.round(mana),
    damage: Math.round(damage),
    armour: Math.round(armour),
    evasion: Math.round(evasion * 10) / 10,
    critChance: Math.round(critChance * 10) / 10,
    effectiveDamage: Math.round(effectiveDamage * 10) / 10,
    damageReduction: Math.round(damageReduction * 10) / 10,
    evasionChanceVsEnemy: Math.round(evasionChanceVsEnemy * 100) / 100,
    hitChanceVsEnemy: Math.round(hitChanceVsEnemy * 100) / 100,
    ailmentShockEffectPct: Math.round(ailmentShockEffectPct * 100) / 100,
    ailmentChillEffectPct: Math.round(ailmentChillEffectPct * 100) / 100,
  };
}
