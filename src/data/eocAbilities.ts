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

export let EOC_ABILITY_DEFINITIONS: EocAbilityDefinition[] = [];

export let EOC_ABILITY_BY_ID: Record<string, EocAbilityDefinition> = Object.fromEntries(
  EOC_ABILITY_DEFINITIONS.map((a) => [a.id, a])
);

export let EOC_ABILITIES_BY_TYPE: Record<EocAbilityType, EocAbilityDefinition[]> = {
  Melee: EOC_ABILITY_DEFINITIONS.filter((a) => a.type === "Melee"),
  Ranged: EOC_ABILITY_DEFINITIONS.filter((a) => a.type === "Ranged"),
  Spells: EOC_ABILITY_DEFINITIONS.filter((a) => a.type === "Spells"),
};

/** Called by GameDataProvider after fetching the Abilities sheet tab. */
export function updateAbilityDefinitions(defs: EocAbilityDefinition[]): void {
  EOC_ABILITY_DEFINITIONS = defs;
  EOC_ABILITY_BY_ID = Object.fromEntries(defs.map((a) => [a.id, a]));
  EOC_ABILITIES_BY_TYPE = {
    Melee: defs.filter((a) => a.type === "Melee"),
    Ranged: defs.filter((a) => a.type === "Ranged"),
    Spells: defs.filter((a) => a.type === "Spells"),
  };
}

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
 * Sheet footer (1.3.2): attacks — each level step `A_next = A_prev + B × 0.05` where
 * `B` is the damage multiplier at ability level 0. CSV lists the multiplier at
 * {@link EocAbilityDefinition.startingAbilityLevel}, not at level 0, so we recover
 * `B0 = multAtStart / (1 + 0.05 × start)` then `mult(L) = B0 × (1 + 0.05 × L)`.
 */
export function attackDamageMultiplierAtAbilityLevel(
  multiplierPctAtStartingLevel: number,
  startingAbilityLevel: number,
  abilityLevel: number
): number {
  const S = Math.max(0, Math.floor(startingAbilityLevel));
  const L = Math.max(0, Math.floor(abilityLevel));
  const b0 = multiplierPctAtStartingLevel / (1 + 0.05 * S);
  return b0 * (1 + 0.05 * L);
}

/**
 * Sheet footer: spells — each level multiplies previous base damage by
 * `1 + 0.44 × 0.935^(B - 1)` where B is the new ability level (1-indexed step).
 * CSV spell hit values are at {@link EocAbilityDefinition.startingAbilityLevel}; only
 * levels above that apply scaling.
 */
export function spellBaseDamageAtAbilityLevel(
  baseMin: number,
  baseMax: number,
  abilityLevel: number,
  startingAbilityLevel = 0
): { min: number; max: number } {
  let min = baseMin;
  let max = baseMax;
  const L = Math.max(0, Math.floor(abilityLevel));
  const S = Math.max(0, Math.floor(startingAbilityLevel));
  for (let B = S + 1; B <= L; B++) {
    const factor = 1 + 0.44 * 0.935 ** (B - 1);
    min *= factor;
    max *= factor;
  }
  return { min, max };
}

/**
 * Mana cost at a given ability level. For skills with a starting level &gt; 0, the sheet
 * adds 5 mana per level above that starting level (matches Bladesurge 42 @ 12 → 67 @ 17).
 * Tier-0 starter skills use the listed mana at all levels until we have sheet data.
 */
export function abilityManaCostAtLevel(
  baseMana: number,
  startingAbilityLevel: number,
  abilityLevel: number
): number {
  const L = Math.max(0, Math.floor(abilityLevel));
  const S = Math.max(0, Math.floor(startingAbilityLevel));
  if (S <= 0) return Math.max(0, baseMana);
  return Math.max(0, Math.round(baseMana + 5 * Math.max(0, L - S)));
}

/** Physical → elemental conversion % from ability line text (e.g. Bladesurge, Consecration). */
export function physicalElementConversionFromAbilityLines(lines: string[]): {
  toFire: number;
  toCold: number;
  toLightning: number;
} {
  const out = { toFire: 0, toCold: 0, toLightning: 0 };
  for (const raw of lines) {
    const l = raw.toLowerCase().trim();
    const m = l.match(
      /(?:convert|covert)\s+(\d+(?:\.\d+)?)\s*%\s+of\s+your\s+physical\s+damage\s+to\s+(fire|cold|lightning)(?:\s+damage)?\b/i
    );
    if (!m) continue;
    const pct = Number(m[1]);
    if (!Number.isFinite(pct)) continue;
    const ele = m[2]!.toLowerCase();
    if (ele === "fire") out.toFire += pct;
    else if (ele === "cold") out.toCold += pct;
    else if (ele === "lightning") out.toLightning += pct;
  }
  return out;
}

/** Scaled spell hit for a full ability definition, or null if not a spell with parsed hit. */
export function scaledSpellHitForAbility(
  def: EocAbilityDefinition,
  abilityLevel: number
): { min: number; max: number; element: string } | null {
  const h = def.spellHit;
  if (!h) return null;
  const { min, max } = spellBaseDamageAtAbilityLevel(
    h.min,
    h.max,
    abilityLevel,
    def.startingAbilityLevel ?? 0
  );
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

/** Parsed attunement line → stable key + numeric magnitude (for pairing 0% vs 100% rows). */
export interface ParsedAttunementLine {
  key: string
  value: number
}

/**
 * Parse a single attunement description into a normalized key and its % value.
 * `attunement0` / `attunement100` must yield the same `key` to interpolate.
 */
export function parseAttunementLine(raw: string): ParsedAttunementLine | null {
  const t = raw.trim()
  if (!t) return null

  const pen = t.match(
    /^hits\s+penetrate\s+(\d+(?:\.\d+)?)\s*%\s+of\s+enemy\s+elemental\s+resistances\.?$/i
  )
  if (pen) return { key: 'hits penetrate % of enemy elemental resistances', value: Number(pen[1]) }

  const exec = t.match(
    /^enemies\s+left\s+below\s+(\d+(?:\.\d+)?)\s*%\s+of\s+maximum\s+life\s+with\s+hits\s+are\s+executed\.?$/i
  )
  if (exec) return { key: 'execute below % max life', value: Number(exec[1]) }

  const m = t.match(/^([+-]?\d+(?:\.\d+)?)\s*%\s*(.+)$/i)
  if (!m) return null
  const suffix = m[2].trim().replace(/\s+/g, ' ').toLowerCase().replace(/\.$/, '')
  return { key: suffix, value: Number(m[1]) }
}

/**
 * Linear attunement between `attunement0` (t=0) and `attunement100` (t=1).
 * Empty `attunement100` is treated as identical to `attunement0` (no scaling range).
 * `effectivenessMult`: Archmage uses 2 (100% increased effect of attunement modifiers).
 */
export function interpolateAttunementModifier(
  def: EocAbilityDefinition,
  attunementPct: number,
  effectivenessMult: number
): { key: string; value: number } | null {
  const p0 = parseAttunementLine(def.attunement0)
  const raw100 = def.attunement100.trim() ? def.attunement100 : def.attunement0
  const p1 = parseAttunementLine(raw100)
  if (!p0 || !p1 || p0.key !== p1.key) return null
  const t = Math.min(1, Math.max(0, attunementPct / 100))
  const v = p0.value + (p1.value - p0.value) * t * effectivenessMult
  return { key: p0.key, value: v }
}

/** Sums "+N% chance to inflict …" lines from ability CSV text (demo combat / sheet). */
export interface InflictAilmentLineBonus {
  bleedChance: number
  poisonChance: number
  elementalAilmentChance: number
  shockChance: number
  chillChance: number
  igniteChance: number
}

export function inflictAilmentBonusesFromAbilityLines(lines: string[]): InflictAilmentLineBonus {
  const out: InflictAilmentLineBonus = {
    bleedChance: 0,
    poisonChance: 0,
    elementalAilmentChance: 0,
    shockChance: 0,
    chillChance: 0,
    igniteChance: 0,
  }
  for (const raw of lines) {
    const l = raw.toLowerCase().trim()
    const mBleed = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+bleeding/)
    if (mBleed) {
      out.bleedChance += Number(mBleed[1])
      continue
    }
    const mPoison = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+poison/)
    if (mPoison) {
      out.poisonChance += Number(mPoison[1])
      continue
    }
    const mEle = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+elemental\s+ailments?/)
    if (mEle) {
      out.elementalAilmentChance += Number(mEle[1])
      continue
    }
    const mShock = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+shock/)
    if (mShock) {
      out.shockChance += Number(mShock[1])
      continue
    }
    const mChill = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+chill/)
    if (mChill) {
      out.chillChance += Number(mChill[1])
      continue
    }
    const mIgnite = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+ignite/)
    if (mIgnite) {
      out.igniteChance += Number(mIgnite[1])
      continue
    }
  }
  return out
}

/** Extra strikes beyond the default first strike (attack abilities only). */
export function extraStrikesFromAbilityLines(lines: string[]): number {
  let add = 0;
  for (const raw of lines) {
    const l = raw.toLowerCase();
    const m1 = l.match(/\+(\d+)\s+strikes\s+per\s+attack/);
    if (m1) {
      add += Number(m1[1]);
      continue;
    }
    const m2 = l.match(/perform\s+\+(\d+)\s+strike/);
    if (m2) {
      add += Number(m2[1]);
      continue;
    }
    const m3 = l.match(/\+(\d+)\s+strike\s+per\s+attack/);
    if (m3) {
      add += Number(m3[1]);
      continue;
    }
  }
  return add;
}

export function attunementLabel(def: EocAbilityDefinition, attunementPct: number): string {
  const t = Math.min(100, Math.max(0, attunementPct));
  const mod = interpolateAttunementModifier(def, t, 1);
  if (mod && def.attunement0.trim()) {
    const p0 = parseAttunementLine(def.attunement0);
    if (p0) {
      const sign = /^\+/.test(def.attunement0.trim()) && mod.value >= 0 ? "+" : "";
      const rounded = Number.isInteger(mod.value) ? String(mod.value) : mod.value.toFixed(1);
      if (p0.key === "hits penetrate % of enemy elemental resistances") {
        return `hits penetrate ${rounded}% of enemy elemental resistances`;
      }
      if (p0.key === "execute below % max life") {
        return `enemies left below ${rounded}% of maximum life with hits are executed`;
      }
      return `${sign}${rounded}% ${p0.key}`;
    }
  }
  if (t <= 0) return def.attunement0 || "";
  if (t >= 100) return def.attunement100 || def.attunement0 || "";
  return `${def.attunement0} → ${def.attunement100} (${Math.round(t)}%)`;
}
