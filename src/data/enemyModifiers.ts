/**
 * Enemy modifier list from `formulas.csv` (enemy mods) — values from {@link FORMULA_CONSTANTS}.
 * Each enemy can have up to three modifiers; they stack additively where noted in the sheet.
 *
 * Flat mods (Vital, Plated, …) are “+Δ to base before scaling” (formulas.csv). For enemies whose stats are
 * already scaled, we multiply by `(ref + ΣΔ) / ref`. **`DemoEnemyDef.modifierRatioBases`** should match the
 * scaling anchor (e.g. `enemyStatsAtLevel(100)` for Nexus/Crucible, or the selected level for level mode);
 * when omitted, CSV bases (40 life, 1 armour, …) are used.
 */

import type { DemoEnemyDef } from "../battle/types";
import { NEXUS_ENEMY_LEVEL_ANCHOR, type NexusTierRow } from "./nexusEnemyScaling";
import { enemyStatsAtLevel, FORMULA_CONSTANTS } from "./formulaConstants";

export const MAX_ENEMY_MODIFIERS = 3;

/** Ratio denominators for flat mods at a given enemy level (Nexus uses `NEXUS_ENEMY_LEVEL_ANCHOR`, currently 100). */
export function enemyModifierRatioBasesAtLevel(level: number): NonNullable<DemoEnemyDef["modifierRatioBases"]> {
  const s = enemyStatsAtLevel(level);
  return {
    life: s.life,
    armour: s.armour,
    evasion: s.evasion,
    accuracy: s.accuracy,
    speed: s.speed,
  };
}

/** Life denominator for regen/leech scaling (`raw × maxLife / ref`). */
export function enemyModifierRefLifeForRegen(enemy: DemoEnemyDef): number {
  const l = enemy.modifierRatioBases?.life;
  return l != null && l > 0 ? l : FORMULA_CONSTANTS.enemyBaseLife;
}

function modifierRatioRefs(enemy: DemoEnemyDef) {
  const k = FORMULA_CONSTANTS;
  const r = enemy.modifierRatioBases;
  if (r) {
    return {
      life: Math.max(1, r.life),
      armour: Math.max(1, r.armour),
      evasion: Math.max(1, r.evasion),
      accuracy: Math.max(1, r.accuracy),
      speed: Math.max(0.05, r.speed),
    };
  }
  return {
    life: Math.max(1, k.enemyBaseLife),
    armour: Math.max(1, k.enemyBaseArmour),
    evasion: Math.max(1, k.enemyBaseEvasion),
    accuracy: Math.max(1, k.enemyBaseAccuracy),
    speed: Math.max(0.05, k.enemyBaseSpeed),
  };
}

export type EnemyModifierId =
  | "vital"
  | "plated"
  | "elusive"
  | "barrier"
  | "hallowed"
  | "warded"
  | "regenerating"
  | "replenishing"
  | "powerful"
  | "swift"
  | "deadeye"
  | "assassin"
  | "sundering"
  | "defender"
  | "phasing"
  | "vampiric"
  | "soul_eater"
  | "rending"
  | "electrifying"
  | "freezing"
  | "burning"
  | "toxic"
  | "fragile"
  | "slow"
  | "weak";

export const ENEMY_MODIFIER_ORDER: readonly EnemyModifierId[] = [
  "vital",
  "plated",
  "elusive",
  "barrier",
  "hallowed",
  "warded",
  "regenerating",
  "replenishing",
  "powerful",
  "swift",
  "deadeye",
  "assassin",
  "sundering",
  "defender",
  "phasing",
  "vampiric",
  "soul_eater",
  "rending",
  "electrifying",
  "freezing",
  "burning",
  "toxic",
  "fragile",
  "slow",
  "weak",
];

const C = () => FORMULA_CONSTANTS;

export function enemyModifierLabel(id: EnemyModifierId): string {
  switch (id) {
    case "vital":
      return "Vital";
    case "plated":
      return "Plated";
    case "elusive":
      return "Elusive";
    case "barrier":
      return "Barrier";
    case "hallowed":
      return "Hallowed";
    case "warded":
      return "Warded";
    case "regenerating":
      return "Regenerating";
    case "replenishing":
      return "Replenishing";
    case "powerful":
      return "Powerful";
    case "swift":
      return "Swift";
    case "deadeye":
      return "Deadeye";
    case "assassin":
      return "Assassin";
    case "sundering":
      return "Sundering";
    case "defender":
      return "Defender";
    case "phasing":
      return "Phasing";
    case "vampiric":
      return "Vampiric";
    case "soul_eater":
      return "Soul Eater";
    case "rending":
      return "Rending";
    case "electrifying":
      return "Electrifying";
    case "freezing":
      return "Freezing";
    case "burning":
      return "Burning";
    case "toxic":
      return "Toxic";
    case "fragile":
      return "Fragile";
    case "slow":
      return "Slow";
    case "weak":
      return "Weak";
    default:
      return id;
  }
}

/** Short tooltip aligned with formulas.csv wording. */
export function enemyModifierDescription(id: EnemyModifierId): string {
  const k = C();
  switch (id) {
    case "vital":
      return `+${k.modVitalLife} life (additive to base before scaling)`;
    case "plated":
      return `+${k.modPlatedArmour} armour`;
    case "elusive":
      return `+${k.modElusiveEvasion} evasion`;
    case "barrier":
      return `+${k.modBarrierEs} energy shield`;
    case "hallowed":
      return `+${k.modHallowedChaosRes}% chaos resistance`;
    case "warded":
      return `+${k.modWardedEleRes}% elemental resistance (fire / cold / lightning only)`;
    case "regenerating":
      return `Regenerates ${k.modRegeneratingLifeRegen} life/s`;
    case "replenishing":
      return `Regenerates ${k.modReplenishingEsRegen} ES/s`;
    case "powerful":
      return `×${k.modPowerfulDamageMult} damage`;
    case "swift":
      return `+${k.modSwiftSpeed} speed`;
    case "deadeye":
      return `+${k.modDeadeyeAccuracy} accuracy`;
    case "assassin":
      return `${k.modAssassinCritChance}% crit chance`;
    case "sundering":
      return `${k.modSunderingArmourIgnore}% armour ignore, ${k.modSunderingPen}% elemental/chaos pen`;
    case "defender":
      return `${k.modDefenderBlock}% block`;
    case "phasing":
      return `${k.modPhasingDodge}% dodge`;
    case "vampiric":
      return `${k.modVampiricLifeLeech}% life leech`;
    case "soul_eater":
      return `${k.modSoulEaterEsLeech}% ES leech`;
    case "rending":
      return "Bleed-themed (see sheet)";
    case "electrifying":
      return "Shock-themed (see sheet)";
    case "freezing":
      return "Chill-themed (see sheet)";
    case "burning":
      return "Ignite-themed (see sheet)";
    case "toxic":
      return "Poison-themed (see sheet)";
    case "fragile":
      return `${k.modFragileLife} life`;
    case "slow":
      return `${k.modSlowSpeed} speed`;
    case "weak":
      return `×${k.modWeakDamageMult} damage`;
    default:
      return "";
  }
}

/** For UI lists (e.g. FormulaViewer): label + tooltip from formulas.csv. */
export const ENEMY_MODIFIERS: readonly { name: string; description: string }[] = ENEMY_MODIFIER_ORDER.map(
  (id) => ({
    name: enemyModifierLabel(id),
    description: enemyModifierDescription(id),
  })
);

export interface NexusTierRowWithModifiers extends NexusTierRow {
  /** Extra ES from Barrier mod (not in base nexus CSV columns). */
  energyShieldFromMods: number;
  /** Sundering: % of your armour ignored when this enemy hits you (for reference). */
  sunderingArmourIgnorePercent: number;
  /** Sundering: % pen vs your fire/cold/lightning/chaos res (reference). */
  sunderingResistancePenPercent: number;
  /** Defender / Phasing / Assassin — for display; not all map into NexusTierRow. */
  blockChancePercent: number;
  dodgeChancePercent: number;
  critChancePercent: number;
  lifeRegenPerSecond: number;
  esRegenPerSecond: number;
}

/** Raw additive contributions to formula enemy bases + multiplicative damage + direct % effects. */
export interface EnemyModifierBaseDeltas {
  life: number;
  armour: number;
  evasion: number;
  accuracy: number;
  speed: number;
  es: number;
  lifeRegenRaw: number;
  esRegenRaw: number;
  eleRes: number;
  chaosRes: number;
  damageMult: number;
  block: number;
  dodge: number;
  crit: number;
  sunderArmourIgnore: number;
  sunderPen: number;
  lifeLeechPct: number;
  esLeechPct: number;
}

/** Dedupe by modifier id (first wins), cap count, normalize tier. */
export function normalizeEnemyModsWithTiers(
  raw: ReadonlyArray<{ id: EnemyModifierId; tier?: 1 | 2 | 3 }>
): Array<{ id: EnemyModifierId; tier: 1 | 2 | 3 }> {
  const seen = new Set<EnemyModifierId>();
  const out: Array<{ id: EnemyModifierId; tier: 1 | 2 | 3 }> = [];
  for (const m of raw) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const tier = (m.tier ?? 1) as 1 | 2 | 3;
    out.push({ id: m.id, tier: tier === 2 || tier === 3 ? tier : 1 });
    if (out.length >= MAX_ENEMY_MODIFIERS) break;
  }
  return out;
}

export function computeEnemyModifierBaseDeltas(
  mods: ReadonlyArray<{ id: EnemyModifierId; tier: 1 | 2 | 3 }>
): EnemyModifierBaseDeltas {
  const k = C();
  const out: EnemyModifierBaseDeltas = {
    life: 0,
    armour: 0,
    evasion: 0,
    accuracy: 0,
    speed: 0,
    es: 0,
    lifeRegenRaw: 0,
    esRegenRaw: 0,
    eleRes: 0,
    chaosRes: 0,
    damageMult: 1,
    block: 0,
    dodge: 0,
    crit: 0,
    sunderArmourIgnore: 0,
    sunderPen: 0,
    lifeLeechPct: 0,
    esLeechPct: 0,
  };
  for (const m of mods) {
    const t = m.tier;
    switch (m.id) {
      case "vital":
        out.life += k.modVitalLife * t;
        break;
      case "fragile":
        out.life += k.modFragileLife * t;
        break;
      case "plated":
        out.armour += k.modPlatedArmour * t;
        break;
      case "elusive":
        out.evasion += k.modElusiveEvasion * t;
        break;
      case "deadeye":
        out.accuracy += k.modDeadeyeAccuracy * t;
        break;
      case "swift":
        out.speed += k.modSwiftSpeed * t;
        break;
      case "slow":
        out.speed += k.modSlowSpeed * t;
        break;
      case "powerful":
        out.damageMult *= Math.pow(k.modPowerfulDamageMult, t);
        break;
      case "weak":
        out.damageMult *= Math.pow(k.modWeakDamageMult, t);
        break;
      case "warded":
        out.eleRes += k.modWardedEleRes * t;
        break;
      case "hallowed":
        out.chaosRes += k.modHallowedChaosRes * t;
        break;
      case "barrier":
        out.es += k.modBarrierEs * t;
        break;
      case "defender":
        out.block = Math.max(out.block, k.modDefenderBlock * t);
        break;
      case "phasing":
        out.dodge = Math.max(out.dodge, k.modPhasingDodge * t);
        break;
      case "assassin":
        out.crit = Math.max(out.crit, k.modAssassinCritChance * t);
        break;
      case "regenerating":
        out.lifeRegenRaw += k.modRegeneratingLifeRegen * t;
        break;
      case "replenishing":
        out.esRegenRaw += k.modReplenishingEsRegen * t;
        break;
      case "vampiric":
        out.lifeLeechPct = Math.max(out.lifeLeechPct, k.modVampiricLifeLeech * t);
        break;
      case "soul_eater":
        out.esLeechPct = Math.max(out.esLeechPct, k.modSoulEaterEsLeech * t);
        break;
      case "sundering":
        out.sunderArmourIgnore = Math.max(out.sunderArmourIgnore, k.modSunderingArmourIgnore * t);
        out.sunderPen = Math.max(out.sunderPen, k.modSunderingPen * t);
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Apply modifier base deltas to an enemy whose numeric stats are already fully scaled
 * (level / nexus / crucible). Flat bases use ratios `(enemyBase + Δ) / enemyBase` from formulas.csv.
 */
export function applyEnemyModifierDeltasToScaledEnemy(
  enemy: DemoEnemyDef,
  deltas: EnemyModifierBaseDeltas
): DemoEnemyDef {
  const rb = modifierRatioRefs(enemy);
  const lifeBase = Math.max(1, rb.life + deltas.life);
  const lifeMult = lifeBase / rb.life;
  const armourMult = (rb.armour + deltas.armour) / rb.armour;
  const evasionMult = (rb.evasion + deltas.evasion) / rb.evasion;
  const accuracyMult = (rb.accuracy + deltas.accuracy) / rb.accuracy;
  const speedBase = Math.max(0.05, rb.speed + deltas.speed);
  const speedMult = speedBase / rb.speed;
  const dmgMult = deltas.damageMult;

  const next: DemoEnemyDef = {
    ...enemy,
    maxLife: Math.max(1, Math.round(enemy.maxLife * lifeMult)),
    armour: Math.max(0, Math.round(enemy.armour * armourMult)),
    evasionRating: Math.max(0, Math.round(enemy.evasionRating * evasionMult)),
    accuracy: Math.max(0, Math.round(enemy.accuracy * accuracyMult)),
    aps: Math.max(0.05, Number((enemy.aps * speedMult).toFixed(3))),
    damageMin: Math.max(0, Math.round(enemy.damageMin * dmgMult)),
    damageMax: Math.max(0, Math.round(enemy.damageMax * dmgMult)),
  };
  if (enemy.physicalDamageMin != null) {
    next.physicalDamageMin = Math.max(0, Math.round(enemy.physicalDamageMin * dmgMult));
    next.physicalDamageMax = Math.max(0, Math.round((enemy.physicalDamageMax ?? 0) * dmgMult));
  }
  if (enemy.elementalDamageMin != null) {
    next.elementalDamageMin = Math.max(0, Math.round(enemy.elementalDamageMin * dmgMult));
    next.elementalDamageMax = Math.max(0, Math.round((enemy.elementalDamageMax ?? 0) * dmgMult));
  }
  if (enemy.chaosDamageMin != null) {
    next.chaosDamageMin = Math.max(0, Math.round(enemy.chaosDamageMin * dmgMult));
    next.chaosDamageMax = Math.max(0, Math.round((enemy.chaosDamageMax ?? 0) * dmgMult));
  }

  // ES: Vital-style life ratio still scales any pre-existing ES pool (`* lifeMult`).
  // Barrier: scale mod ES along the life curve at refLife (`× refLife / enemyBaseLife`), not × tier-scaled max life.
  // Elite/boss: multiply by `rarityLifeMult` (same as life row); omit → 1.
  {
    const k = FORMULA_CONSTANTS;
    const scaledExistingEs = Math.round((enemy.maxEnergyShield ?? 0) * lifeMult);
    const rarity = enemy.rarityLifeMult ?? 1;
    const scaledBarrierEsAdd =
      deltas.es !== 0
        ? enemy.barrierEsFlat === true
          ? Math.round(deltas.es)
          : Math.round((deltas.es * rb.life * rarity) / k.enemyBaseLife)
        : 0;
    const totalEs = scaledExistingEs + scaledBarrierEsAdd;
    if (totalEs > 0 || (enemy.maxEnergyShield ?? 0) > 0 || deltas.es !== 0) {
      next.maxEnergyShield = Math.max(0, totalEs);
    }
  }

  next.fireResistancePercent = (enemy.fireResistancePercent ?? 0) + deltas.eleRes;
  next.coldResistancePercent = (enemy.coldResistancePercent ?? 0) + deltas.eleRes;
  next.lightningResistancePercent = (enemy.lightningResistancePercent ?? 0) + deltas.eleRes;
  next.chaosResistancePercent = (enemy.chaosResistancePercent ?? 0) + deltas.chaosRes;

  next.blockChance = Math.min(100, (enemy.blockChance ?? 0) + deltas.block);
  next.dodgeChance = Math.min(100, (enemy.dodgeChance ?? 0) + deltas.dodge);
  next.critChance = Math.max(enemy.critChance ?? 0, deltas.crit);

  next.armourIgnorePercent = Math.max(enemy.armourIgnorePercent ?? 0, deltas.sunderArmourIgnore);
  next.resistancePenetrationPercent = Math.max(enemy.resistancePenetrationPercent ?? 0, deltas.sunderPen);

  return next;
}

export function applyEnemyModifierBaseRatiosToScaledEnemy(
  enemy: DemoEnemyDef,
  mods: ReadonlyArray<{ id: EnemyModifierId; tier: 1 | 2 | 3 }>
): DemoEnemyDef {
  const normalized = normalizeEnemyModsWithTiers(mods);
  return applyEnemyModifierDeltasToScaledEnemy(enemy, computeEnemyModifierBaseDeltas(normalized));
}

export function applyEnemyModifiersWithTiersToScaledEnemy(
  rawEnemy: DemoEnemyDef,
  mods: ReadonlyArray<{ id: EnemyModifierId; tier: 1 | 2 | 3 }>
): { enemy: DemoEnemyDef; deltas: EnemyModifierBaseDeltas } {
  const normalized = normalizeEnemyModsWithTiers(mods);
  const deltas = computeEnemyModifierBaseDeltas(normalized);
  return { enemy: applyEnemyModifierDeltasToScaledEnemy(rawEnemy, deltas), deltas };
}

function nexusTierRowToDemoEnemy(row: NexusTierRow): DemoEnemyDef {
  return {
    id: "nexus-row",
    name: `Nexus ${row.tier}`,
    maxLife: row.health,
    maxEnergyShield: 0,
    rarityLifeMult: 1,
    // Nexus tier rows are already "scaled from CSV bases" (life 40, armour 1, …).
    // Flat mods (Vital/Plated/…) should therefore use those CSV denominators, not a level anchor.
    armour: row.armour,
    evasionRating: row.evasion,
    accuracy: row.accuracy,
    damageMin: row.physMin,
    damageMax: row.physMax,
    physicalDamageMin: row.physMin,
    physicalDamageMax: row.physMax,
    elementalDamageMin: row.elementalMin,
    elementalDamageMax: row.elementalMax,
    chaosDamageMin: row.chaosMin,
    chaosDamageMax: row.chaosMax,
    aps: row.attacksPerSecond,
    fireResistancePercent: row.elementalResPercent,
    coldResistancePercent: row.elementalResPercent,
    lightningResistancePercent: row.elementalResPercent,
    chaosResistancePercent: row.chaosResPercent,
  };
}

/**
 * Apply up to {@link MAX_ENEMY_MODIFIERS} modifiers on top of a nexus tier row.
 * Warded increases **elemental** resistance only (fire/cold/lightning); Hallowed increases **chaos** res only.
 */
export function applyEnemyModifiersToNexusRow(
  row: NexusTierRow,
  mods: readonly EnemyModifierId[]
): NexusTierRowWithModifiers {
  const withTiers = normalizeEnemyModsWithTiers(mods.map((id) => ({ id, tier: 1 as const })));
  const deltas = computeEnemyModifierBaseDeltas(withTiers);
  const demo = nexusTierRowToDemoEnemy(row);
  const out = applyEnemyModifierDeltasToScaledEnemy(demo, deltas);
  const refLife = enemyModifierRefLifeForRegen(out);
  // Regen: raw per second × scaled max life / ref life (ref matches modifier ratio anchor).
  const lifeRegenPerSecond =
    deltas.lifeRegenRaw !== 0 ? (deltas.lifeRegenRaw * out.maxLife) / refLife : 0;
  const esRegenPerSecond =
    deltas.esRegenRaw !== 0 ? (deltas.esRegenRaw * out.maxLife) / refLife : 0;

  return {
    ...row,
    health: out.maxLife,
    armour: out.armour,
    evasion: out.evasionRating,
    accuracy: out.accuracy,
    attacksPerSecond: out.aps,
    physMin: out.physicalDamageMin ?? out.damageMin,
    physMax: out.physicalDamageMax ?? out.damageMax,
    elementalMin: out.elementalDamageMin ?? row.elementalMin,
    elementalMax: out.elementalDamageMax ?? row.elementalMax,
    chaosMin: out.chaosDamageMin ?? row.chaosMin,
    chaosMax: out.chaosDamageMax ?? row.chaosMax,
    elementalResPercent: out.fireResistancePercent ?? row.elementalResPercent,
    chaosResPercent: out.chaosResistancePercent ?? row.chaosResPercent,
    physDps: Math.round(row.physDps * deltas.damageMult),
    eleDps: Math.round(row.eleDps * deltas.damageMult),
    chaosDps: Math.round(row.chaosDps * deltas.damageMult),
    energyShieldFromMods: Math.max(0, out.maxEnergyShield ?? 0),
    sunderingArmourIgnorePercent: out.armourIgnorePercent ?? 0,
    sunderingResistancePenPercent: out.resistancePenetrationPercent ?? 0,
    blockChancePercent: out.blockChance ?? 0,
    dodgeChancePercent: out.dodgeChance ?? 0,
    critChancePercent: out.critChance ?? 0,
    lifeRegenPerSecond,
    esRegenPerSecond,
  };
}
