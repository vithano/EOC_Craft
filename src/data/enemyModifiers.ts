/**
 * Enemy modifier list from `formulas.csv` (enemy mods) — values from {@link FORMULA_CONSTANTS}.
 * Each enemy can have up to three modifiers; they stack additively where noted in the sheet.
 */

import type { NexusTierRow } from "./nexusEnemyScaling";
import { FORMULA_CONSTANTS } from "./formulaConstants";

export const MAX_ENEMY_MODIFIERS = 3;

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

/**
 * Apply up to {@link MAX_ENEMY_MODIFIERS} modifiers on top of a nexus tier row.
 * Warded increases **elemental** resistance only (fire/cold/lightning); Hallowed increases **chaos** res only.
 */
export function applyEnemyModifiersToNexusRow(
  row: NexusTierRow,
  mods: readonly EnemyModifierId[]
): NexusTierRowWithModifiers {
  const unique = [...new Set(mods)].slice(0, MAX_ENEMY_MODIFIERS);
  let health = row.health;
  let armour = row.armour;
  let evasion = row.evasion;
  let accuracy = row.accuracy;
  let attacksPerSecond = row.attacksPerSecond;
  let physMin = row.physMin;
  let physMax = row.physMax;
  let elementalMin = row.elementalMin;
  let elementalMax = row.elementalMax;
  let chaosMin = row.chaosMin;
  let chaosMax = row.chaosMax;
  let elementalResPercent = row.elementalResPercent;
  let chaosResPercent = row.chaosResPercent;
  let energyShieldFromMods = 0;
  let sunderingArmourIgnorePercent = 0;
  let sunderingResistancePenPercent = 0;
  let blockChancePercent = 0;
  let dodgeChancePercent = 0;
  let critChancePercent = 0;
  let lifeRegenPerSecond = 0;
  let esRegenPerSecond = 0;

  const k = C();
  let damageMult = 1;

  for (const id of unique) {
    switch (id) {
      case "vital":
        health += k.modVitalLife;
        break;
      case "fragile":
        health += k.modFragileLife;
        break;
      case "plated":
        armour += k.modPlatedArmour;
        break;
      case "elusive":
        evasion += k.modElusiveEvasion;
        break;
      case "barrier":
        energyShieldFromMods += k.modBarrierEs;
        break;
      case "hallowed":
        chaosResPercent += k.modHallowedChaosRes;
        break;
      case "warded":
        elementalResPercent += k.modWardedEleRes;
        break;
      case "regenerating":
        lifeRegenPerSecond += k.modRegeneratingLifeRegen;
        break;
      case "replenishing":
        esRegenPerSecond += k.modReplenishingEsRegen;
        break;
      case "powerful":
        damageMult *= k.modPowerfulDamageMult;
        break;
      case "weak":
        damageMult *= k.modWeakDamageMult;
        break;
      case "swift":
        attacksPerSecond += k.modSwiftSpeed;
        break;
      case "slow":
        attacksPerSecond += k.modSlowSpeed;
        break;
      case "deadeye":
        accuracy += k.modDeadeyeAccuracy;
        break;
      case "assassin":
        critChancePercent = Math.max(critChancePercent, k.modAssassinCritChance);
        break;
      case "sundering":
        sunderingArmourIgnorePercent = Math.max(sunderingArmourIgnorePercent, k.modSunderingArmourIgnore);
        sunderingResistancePenPercent = Math.max(sunderingResistancePenPercent, k.modSunderingPen);
        break;
      case "defender":
        blockChancePercent = Math.max(blockChancePercent, k.modDefenderBlock);
        break;
      case "phasing":
        dodgeChancePercent = Math.max(dodgeChancePercent, k.modPhasingDodge);
        break;
      case "vampiric":
      case "soul_eater":
      case "rending":
      case "electrifying":
      case "freezing":
      case "burning":
      case "toxic":
        // Tier row preview does not model ailment-tier II branches; keep for list completeness.
        break;
      default:
        break;
    }
  }

  physMin = Math.round(physMin * damageMult);
  physMax = Math.round(physMax * damageMult);
  elementalMin = Math.round(elementalMin * damageMult);
  elementalMax = Math.round(elementalMax * damageMult);
  chaosMin = Math.round(chaosMin * damageMult);
  chaosMax = Math.round(chaosMax * damageMult);

  return {
    ...row,
    health,
    armour,
    evasion,
    accuracy,
    attacksPerSecond: Math.max(0.05, attacksPerSecond),
    physMin,
    physMax,
    elementalMin,
    elementalMax,
    chaosMin,
    chaosMax,
    elementalResPercent,
    chaosResPercent,
    energyShieldFromMods,
    sunderingArmourIgnorePercent,
    sunderingResistancePenPercent,
    blockChancePercent,
    dodgeChancePercent,
    critChancePercent,
    lifeRegenPerSecond,
    esRegenPerSecond,
  };
}
