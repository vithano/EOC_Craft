import rawAbilities from "./eocAbilities.generated.json";
import { EOC_UNIQUE_BY_ID, isUniqueItemId } from "./eocUniques";

export type EocAbilityType = "Melee" | "Ranged" | "Spells";

export interface EocSpellHit {
  min: number;
  max: number;
  element: string;
}

export interface EocAbilityDefinition {
  id: string;
  type: EocAbilityType;
  name: string;
  startingAbilityLevel: number;
  weaponTypesRaw: string;
  /** Normalized tags (e.g. `hand_crossbow`); empty for spells. */
  weaponTags: string[];
  damageMultiplierPct: number | null;
  attackSpeedMultiplierPct: number | null;
  addedDamageMultiplierPct: number | null;
  castTimeSeconds: number | null;
  baseCritChancePct: number | null;
  manaCost: number | null;
  lines: string[];
  attunement0: string;
  attunement100: string;
  spellHit: EocSpellHit | null;
}

export const EOC_ABILITY_DEFINITIONS: EocAbilityDefinition[] =
  rawAbilities as EocAbilityDefinition[];

export const EOC_ABILITY_BY_ID: Record<string, EocAbilityDefinition> = Object.fromEntries(
  EOC_ABILITY_DEFINITIONS.map((a) => [a.id, a])
);

export const EOC_ABILITIES_BY_TYPE: Record<EocAbilityType, EocAbilityDefinition[]> = {
  Melee: EOC_ABILITY_DEFINITIONS.filter((a) => a.type === "Melee"),
  Ranged: EOC_ABILITY_DEFINITIONS.filter((a) => a.type === "Ranged"),
  Spells: EOC_ABILITY_DEFINITIONS.filter((a) => a.type === "Spells"),
};

/** Melee weapon tags used when CSV lists `melee weapon` (must match generator). */
export const EOC_MELEE_WEAPON_TAGS = [
  "mace",
  "warhammer",
  "battlestaff",
  "sword",
  "greatsword",
  "dagger",
] as const;

/**
 * Sheet footer (1.3.2): attacks — `A + (B × 0.05)` per level step, with A = multiplier at previous level
 * and B = multiplier at ability level 0. Equivalent closed form: `B × (1 + 0.05 × L)`.
 */
export function attackDamageMultiplierAtAbilityLevel(
  baseMultiplierPct: number,
  abilityLevel: number
): number {
  const B = baseMultiplierPct;
  const L = Math.max(0, Math.floor(abilityLevel));
  return B * (1 + 0.05 * L);
}

/**
 * Sheet footer: spells — each level multiplies previous base damage by
 * `1 + 0.44 × 0.935^(B - 1)` where B is the new ability level (1-indexed step).
 */
export function spellBaseDamageAtAbilityLevel(
  baseMin: number,
  baseMax: number,
  abilityLevel: number
): { min: number; max: number } {
  let min = baseMin;
  let max = baseMax;
  const L = Math.max(0, Math.floor(abilityLevel));
  for (let B = 1; B <= L; B++) {
    const factor = 1 + 0.44 * 0.935 ** (B - 1);
    min *= factor;
    max *= factor;
  }
  return { min, max };
}

/** Scaled spell hit for a full ability definition, or null if not a spell with parsed hit. */
export function scaledSpellHitForAbility(
  def: EocAbilityDefinition,
  abilityLevel: number
): { min: number; max: number; element: string } | null {
  const h = def.spellHit;
  if (!h) return null;
  const { min, max } = spellBaseDamageAtAbilityLevel(h.min, h.max, abilityLevel);
  return { min, max, element: h.element };
}

const UNIQUE_ITEM_TYPE_TO_TAG: Record<string, string> = {
  Mace: "mace",
  Warhammer: "warhammer",
  Sword: "sword",
  Greatsword: "greatsword",
  "Hand Crossbow": "hand_crossbow",
  Bow: "bow",
  Dagger: "dagger",
  Wand: "wand",
  Magestave: "magestave",
  Battlestave: "battlestaff",
};

/** Non-unique weapon ids → ability weapon tag (best-effort for planner bases). */
const BASE_WEAPON_ITEM_TO_TAG: Record<string, string> = {
  iron_sword: "sword",
  steel_axe: "warhammer",
  shadow_dagger: "dagger",
  staff_of_flames: "magestave",
  longbow: "bow",
  sword_of_light: "sword",
};

/**
 * Single tag describing the equipped weapon for ability gating, or null if unknown / not a weapon.
 */
export function weaponAbilityTagFromItemId(itemId: string): string | null {
  if (!itemId || itemId === "none") return null;
  if (isUniqueItemId(itemId)) {
    const u = EOC_UNIQUE_BY_ID[itemId];
    if (!u || u.slot !== "Weapon") return null;
    return UNIQUE_ITEM_TYPE_TO_TAG[u.itemType] ?? u.itemType.toLowerCase().replace(/\s+/g, "_");
  }
  return BASE_WEAPON_ITEM_TO_TAG[itemId] ?? null;
}

export function abilityMatchesWeapon(def: EocAbilityDefinition, weaponTag: string | null): boolean {
  if (def.type === "Spells") return true;
  if (!weaponTag) return false;
  return def.weaponTags.includes(weaponTag);
}

export function abilitiesUsableWithWeapon(weaponTag: string | null): EocAbilityDefinition[] {
  return EOC_ABILITY_DEFINITIONS.filter((a) => abilityMatchesWeapon(a, weaponTag));
}

/** Interpolate attunement description: 0 → attunement0, 100 → attunement100, linear in between (display helper). */
export function attunementLabel(def: EocAbilityDefinition, attunementPct: number): string {
  const t = Math.min(100, Math.max(0, attunementPct));
  if (t <= 0) return def.attunement0 || "";
  if (t >= 100) return def.attunement100 || def.attunement0 || "";
  return `${def.attunement0} → ${def.attunement100} (${Math.round(t)}%)`;
}
