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
  const stepFactor = (B: number) => 1 + 0.44 * 0.935 ** (B - 1)
  if (L >= S) {
    // Scale up from the CSV base-at-starting-level.
    for (let B = S + 1; B <= L; B++) {
      const factor = stepFactor(B)
      min *= factor;
      max *= factor;
    }
  } else {
    // If the user selects a level below the CSV starting level, scale down by reversing the same steps.
    for (let B = S; B > L; B--) {
      const factor = stepFactor(B)
      if (factor !== 0) {
        min /= factor
        max /= factor
      }
    }
  }
  return { min, max };
}

/**
 * Mana cost at a given ability level.
 *
 * Sheet formula (per level step):
 * `COST_next = COST_prev × (1 + 0.3 × 0.92^(ABILITY_LEVEL - 1))`
 *
 * CSV `manaCost` is treated as the cost at {@link EocAbilityDefinition.startingAbilityLevel}.
 */
export function abilityManaCostAtLevel(
  baseMana: number,
  startingAbilityLevel: number,
  abilityLevel: number,
  kind: "attacks" | "spells" = "attacks",
  hiddenOffset = 0.5
): number {
  return Math.max(
    0,
    Math.floor(abilityManaCostAtLevelTrueRaw(baseMana, startingAbilityLevel, abilityLevel, kind, hiddenOffset))
  );
}

/**
 * Raw (unfloored) mana cost at a given ability level, including the hidden in-game offset.
 *
 * This matches the stepwise multiplicative rule:
 * `COST_next = COST_prev × (1 + 0.3 × 0.92^(ABILITY_LEVEL - 1))`
 *
 * The game displays whole-number mana costs by flooring the internal (hidden-offset) value.
 */
export function abilityManaCostAtLevelTrueRaw(
  baseMana: number,
  startingAbilityLevel: number,
  abilityLevel: number,
  kind: "attacks" | "spells" = "attacks",
  hiddenOffset = 0.5
): number {
  void kind; // kept for backwards-compat call sites; mana scaling is shared across ability types.
  const base = Math.max(0, baseMana);
  const L = Math.max(0, Math.floor(abilityLevel));
  const S = Math.max(0, Math.floor(startingAbilityLevel));

  // Clamp offset just in case.
  const offset = Math.max(0, Math.min(hiddenOffset, 0.999999));

  // Per user-provided formula, levels at or below the CSV “starting level” display as floor(baseMana).
  if (L <= S) return Math.floor(base);

  // Start from estimated hidden value, not the displayed floored value.
  let trueMana = base + offset;
  for (let level = S + 1; level <= L; level++) {
    trueMana *= 1 + 0.3 * Math.pow(0.92, level - 1);
  }
  return trueMana;
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
  Magestaff: "magestaff",
  Battlestaff: "battlestaff",
};

/** Non-unique weapon ids → ability weapon tag (best-effort for planner bases). */
const BASE_WEAPON_ITEM_TO_TAG: Record<string, string> = {
  iron_sword: "sword",
  steel_axe: "warhammer",
  shadow_dagger: "dagger",
  staff_of_flames: "magestaff",
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

export interface AbilityLineEffects {
  doubleDamageChanceAdd: number
  increasedDefencesPercent: number
  armourIgnorePercent: number
  hitsCannotBeEvaded: boolean
  dealNoDamage: boolean
  inflictAilmentsAsThoughFullHitDamage: boolean

  executeEnemiesBelowLifePercent: number
  executeBelowLifeIncPer20CritMultiPercent: number

  enemiesTakeIncreasedDamagePerPoisonPercent: number
  enemiesTakeIncreasedDamagePerChillEffectPercent: number
  enemiesLessSpeedPerPoisonPercent: number
  maxChillEffectBonus: number
  maxChillEqualsMaxShock: boolean
  inflictShockEqualToChill: boolean
  shockAsThoughMoreDamagePercent: number
  chillAsThoughMoreDamagePercent: number
  bleedDurationMoreMult: number
  poisonDurationMoreMult: number
  chillDurationMoreMult: number
  physicalToRandomElementPct: number

  morePoisonDamageMult: number
  moreBleedDamageMult: number
  moreIgniteDamageMult: number
  igniteDealsNoDamageOverDuration: boolean
  igniteBurstsAtEndAndClearsAll: boolean

  baseCritChanceBonus: number
  baseCritChanceBonusPer5ChillEffect: number
  critMultiplierBonusPctPer1ChillEffect: number
  critMultiplierBonusPctPer1CritChanceAbove100: number
  critChanceMorePerHitThisStageMaxPct: number
  critMultiplierBonusAtMaxStageHits: number
  criticalHitsDoNotDealExtraDamage: boolean
  extraHitsOnCritPer25CritMulti: boolean
  extraHitsOnCritDealLessMult: number
  extraHitsOnCritCannotCrit: boolean

  moreAttackSpeedPerHitThisStagePct: number
  moreAttackSpeedPerHitThisStageMaxPct: number
  additionalArmourIgnoreAtMaxStageHits: number

  moreMaximumAttackDamageMult: number
  lessMinimumAttackDamageMult: number

  additionalStrikesPerAttackFlat: number
  extraStrikeChancePerStrikePercent: number

  hitsPerAttackRange: { min: number; max: number } | null
  hitsPerAttackIsAdditional: boolean
  hitsPerCastRange: { min: number; max: number } | null
  hitsPerCastIsAdditional: boolean
  castSpeedAppliesToHitsPerCast: boolean
  additionalProjectilesPerAttackRange: { min: number; max: number } | null

  smiteAdditionalBaseManaCostPctOfCurrentMana: number
  smiteAddsLightningPerManaCost: { min: number; max: number } | null
  arcaneExplosionSacrificeCurrentManaPercent: number
  arcaneExplosionMoreDamagePer50ManaSacrificedPct: number
  arcaneExplosionCannotBeEvadedIfManaSacrificedAtLeast: number
  flameBlastMoreDamagePer0_1sCastTimePct: number
  darkPactMoreChaosDamagePerMissingCombinedPct: number
  darkPactLifeLeechPercent: number
  soulDrainEsLeechPercent: number
  blazingRadianceTakeFireDpsPctOfCombinedCurrent: number
  blazingRadianceMoreFireDamagePer40CombinedCurrentPct: number
  staticLanceShockAsThoughMoreDamagePercent: number
  staticLanceNextHitMoreDamagePerShockEffectPct: number
  staticLanceConsumeShockOnEmpoweredHit: boolean
  hailOfArrows: boolean
  hailArrowVolleyEverySec: number
  hailArrowVolleyAtLoadedArrows: number
  vengeantThornsTriggerAttackOnHit: boolean
  vengeantThornsWeaponBaseNotApplied: boolean
  vengeantThornsAddedBasePhysicalPctOfArmour: number
  cyclone: boolean
  spectralRazor: boolean
  noxiousStrikePoisonExecuteIfRemainingDotDamageMoreThanLifeFactor: number

  __unknownLines?: string[]
}

export function emptyAbilityLineEffects(): AbilityLineEffects {
  return {
    doubleDamageChanceAdd: 0,
    increasedDefencesPercent: 0,
    armourIgnorePercent: 0,
    hitsCannotBeEvaded: false,
    dealNoDamage: false,
    inflictAilmentsAsThoughFullHitDamage: false,

    executeEnemiesBelowLifePercent: 0,
    executeBelowLifeIncPer20CritMultiPercent: 0,

    enemiesTakeIncreasedDamagePerPoisonPercent: 0,
    enemiesTakeIncreasedDamagePerChillEffectPercent: 0,
    enemiesLessSpeedPerPoisonPercent: 0,
    maxChillEffectBonus: 0,
    maxChillEqualsMaxShock: false,
    inflictShockEqualToChill: false,
    shockAsThoughMoreDamagePercent: 0,
    chillAsThoughMoreDamagePercent: 0,
    bleedDurationMoreMult: 1,
    poisonDurationMoreMult: 1,
    chillDurationMoreMult: 1,
    physicalToRandomElementPct: 0,

    morePoisonDamageMult: 1,
    moreBleedDamageMult: 1,
    moreIgniteDamageMult: 1,
    igniteDealsNoDamageOverDuration: false,
    igniteBurstsAtEndAndClearsAll: false,

    baseCritChanceBonus: 0,
    baseCritChanceBonusPer5ChillEffect: 0,
    critMultiplierBonusPctPer1ChillEffect: 0,
    critMultiplierBonusPctPer1CritChanceAbove100: 0,
    critChanceMorePerHitThisStageMaxPct: 0,
    critMultiplierBonusAtMaxStageHits: 0,
    criticalHitsDoNotDealExtraDamage: false,
    extraHitsOnCritPer25CritMulti: false,
    extraHitsOnCritDealLessMult: 1,
    extraHitsOnCritCannotCrit: false,

    moreAttackSpeedPerHitThisStagePct: 0,
    moreAttackSpeedPerHitThisStageMaxPct: 0,
    additionalArmourIgnoreAtMaxStageHits: 0,
    moreMaximumAttackDamageMult: 1,
    lessMinimumAttackDamageMult: 1,

    additionalStrikesPerAttackFlat: 0,
    extraStrikeChancePerStrikePercent: 0,

    hitsPerAttackRange: null,
    hitsPerAttackIsAdditional: false,
    hitsPerCastRange: null,
    hitsPerCastIsAdditional: false,
    castSpeedAppliesToHitsPerCast: false,
    additionalProjectilesPerAttackRange: null,

    smiteAdditionalBaseManaCostPctOfCurrentMana: 0,
    smiteAddsLightningPerManaCost: null,
    arcaneExplosionSacrificeCurrentManaPercent: 0,
    arcaneExplosionMoreDamagePer50ManaSacrificedPct: 0,
    arcaneExplosionCannotBeEvadedIfManaSacrificedAtLeast: 0,
    flameBlastMoreDamagePer0_1sCastTimePct: 0,
    darkPactMoreChaosDamagePerMissingCombinedPct: 0,
    darkPactLifeLeechPercent: 0,
    soulDrainEsLeechPercent: 0,
    blazingRadianceTakeFireDpsPctOfCombinedCurrent: 0,
    blazingRadianceMoreFireDamagePer40CombinedCurrentPct: 0,
    staticLanceShockAsThoughMoreDamagePercent: 0,
    staticLanceNextHitMoreDamagePerShockEffectPct: 0,
    staticLanceConsumeShockOnEmpoweredHit: false,
    hailOfArrows: false,
    hailArrowVolleyEverySec: 0,
    hailArrowVolleyAtLoadedArrows: 0,
    vengeantThornsTriggerAttackOnHit: false,
    vengeantThornsWeaponBaseNotApplied: false,
    vengeantThornsAddedBasePhysicalPctOfArmour: 0,
    cyclone: false,
    spectralRazor: false,
    noxiousStrikePoisonExecuteIfRemainingDotDamageMoreThanLifeFactor: 0,
  }
}

export function parseAbilityLineEffects(def: EocAbilityDefinition): AbilityLineEffects {
  const out = emptyAbilityLineEffects()
  for (const raw of def.lines ?? []) {
    const l = raw.trim()
    const low = l.toLowerCase()

    const pct1 = (re: RegExp) => {
      const m = low.match(re)
      if (!m) return null
      const v = Number(m[1])
      return Number.isFinite(v) ? v : null
    }
    const range2 = (re: RegExp) => {
      const m = low.match(re)
      if (!m) return null
      const a = Number(m[1])
      const b = Number(m[2])
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null
      return { min: Math.min(a, b), max: Math.max(a, b) }
    }

    if (/^deals\s+\d+\s*-\s*\d+\s+(physical|fire|cold|lightning|chaos)\s+damage\b/i.test(low)) continue

    // Lines handled elsewhere (so they should not appear as “unknown” here).
    if (
      /(?:^|\b)(?:convert|covert)\s+\d+(?:\.\d+)?\s*%\s+of\s+your\s+physical\s+damage\s+to\s+(fire|cold|lightning)\s+damage\b/i.test(low)
    ) {
      continue
    }
    if (
      /^\+\d+%\s+chance\s+to\s+inflict\s+(?:bleeding|poison|shock|chill|ignite|elemental\s+ailments?)\b/i.test(low)
    ) {
      continue
    }
    if (low === 'convert 100% of your physical damage to a random elemental damage type on hit') {
      out.physicalToRandomElementPct = Math.max(out.physicalToRandomElementPct, 100)
      continue
    }

    // Double damage
    {
      const m = low.match(/^\+(\d+)%\s+to\s+(?:deal\s+)?double\s+damage\b/i)
      if (m) { out.doubleDamageChanceAdd += Number(m[1]); continue }
      const m2 = low.match(/^\+(\d+)%\s+chance\s+to\s+deal\s+double\s+damage\b/i)
      if (m2) { out.doubleDamageChanceAdd += Number(m2[1]); continue }
    }

    // Base crit chance
    {
      const v = pct1(/^\+(\d+)%\s+to\s+base\s+critical\s+hit\s+chance\b/i)
      if (v != null) { out.baseCritChanceBonus += v; continue }
      const per5 = pct1(/^\+(\d+)%\s+to\s+base\s+critical\s+hit\s+chance\s+per\s+5%\s+effect\s+of\s+chill/i)
      if (per5 != null) { out.baseCritChanceBonusPer5ChillEffect = per5; continue }
      const m = low.match(/^gain\s+(\d+)%\s+more\s+critical\s+hit\s+chance\s+per\s+hit\s+dealt\s+during\s+a\s+stage,\s+up\s+to\s+(\d+)%$/i)
      if (m) {
        out.critChanceMorePerHitThisStageMaxPct = Number(m[2])
        out.spectralRazor = true
        continue
      }
    }

    // Crit multiplier interactions
    {
      const m = low.match(/^\+(\d+)%\s+to\s+critical\s+damage\s+multiplier\s+per\s+1%\s+effect\s+of\s+chill/i)
      if (m) { out.critMultiplierBonusPctPer1ChillEffect = Number(m[1]); continue }
      const m2 = low.match(/^\+(\d+)%\s+to\s+critical\s+damage\s+multiplier\s+per\s+1%\s+critical\s+hit\s+chance\s+above\s+100%/i)
      if (m2) { out.critMultiplierBonusPctPer1CritChanceAbove100 = Number(m2[1]); continue }
      if (low === 'at maximum effect, additionally gain +50% to critical damage multiplier') {
        out.critMultiplierBonusAtMaxStageHits = 50
        out.spectralRazor = true
        continue
      }
      if (low === 'critical hits do not deal extra damage') { out.criticalHitsDoNotDealExtraDamage = true; continue }
      if (low === 'when you deal a critical hit, hit one additional time per 25% critical damage multiplier') {
        out.extraHitsOnCritPer25CritMulti = true
        out.extraHitsOnCritDealLessMult = 0.5
        out.extraHitsOnCritCannotCrit = true
        continue
      }
      if (low === 'additional hits deal 50% less damage and cannot be critical') {
        out.extraHitsOnCritDealLessMult = 0.5
        out.extraHitsOnCritCannotCrit = true
        continue
      }
    }

    // Armour ignore / evasion
    {
      const v = pct1(/^hits\s+ignore\s+(\d+)%\s+of\s+enemy\s+armour\b/i)
      if (v != null) { out.armourIgnorePercent = Math.max(out.armourIgnorePercent, v); continue }
      if (low === 'your hits cannot be evaded') { out.hitsCannotBeEvaded = true; continue }
    }

    // Defences
    {
      const v = pct1(/^(\d+)%\s+increased\s+defences\b/i)
      if (v != null) { out.increasedDefencesPercent += v; continue }
    }

    // Execution
    {
      const v = pct1(/^enemies\s+left\s+below\s+(\d+)%\s+of\s+maximum\s+life\s+with\s+hits\s+are\s+executed\b/i)
      if (v != null) { out.executeEnemiesBelowLifePercent = Math.max(out.executeEnemiesBelowLifePercent, v); continue }
      if (low === 'enemies left below 25% of maximum life with hits are executed, increased by 1% per 20% critical damage multiplier') {
        out.executeEnemiesBelowLifePercent = Math.max(out.executeEnemiesBelowLifePercent, 25)
        out.executeBelowLifeIncPer20CritMultiPercent = 1
        continue
      }
    }

    // More/less duration or damage
    {
      const vBleedDur = pct1(/^(\d+)%\s+more\s+bleed\s+duration\b/i)
      if (vBleedDur != null) { out.bleedDurationMoreMult *= 1 + vBleedDur / 100; continue }
      const vChillDur = pct1(/^(\d+)%\s+more\s+chill\s+duration\b/i)
      if (vChillDur != null) { out.chillDurationMoreMult *= 1 + vChillDur / 100; continue }
      const vPoisonDur = pct1(/^(\d+)%\s+more\s+poison\s+duration\b/i)
      if (vPoisonDur != null) { out.poisonDurationMoreMult *= 1 + vPoisonDur / 100; continue }

      const vMorePoison = pct1(/^(\d+)%\s+more\s+poison\s+damage\b/i)
      if (vMorePoison != null) { out.morePoisonDamageMult *= 1 + vMorePoison / 100; continue }
      const vMoreBleed = pct1(/^(\d+)%\s+more\s+bleed\s+damage\b/i)
      if (vMoreBleed != null) { out.moreBleedDamageMult *= 1 + vMoreBleed / 100; continue }
      const vMoreIgnite = pct1(/^(\d+)%\s+more\s+ignite\s+damage\b/i)
      if (vMoreIgnite != null) { out.moreIgniteDamageMult *= 1 + vMoreIgnite / 100; continue }

      const vMoreMax = pct1(/^(\d+)%\s+more\s+maximum\s+attack\s+damage\b/i)
      if (vMoreMax != null) { out.moreMaximumAttackDamageMult *= 1 + vMoreMax / 100; continue }
      const vLessMin = pct1(/^(\d+)%\s+less\s+minimum\s+attack\s+damage\b/i)
      if (vLessMin != null) { out.lessMinimumAttackDamageMult *= Math.max(0, 1 - vLessMin / 100); continue }
    }

    if (low === 'hits deal no damage') { out.dealNoDamage = true; continue }
    if (low === 'hits inflict ailments as though dealing full hit damage') { out.inflictAilmentsAsThoughFullHitDamage = true; continue }

    // Enemy scaling by ailments
    {
      const v = pct1(/^enemies\s+take\s+(\d+)%\s+increased\s+damage\s+per\s+applied\s+poison\b/i)
      if (v != null) { out.enemiesTakeIncreasedDamagePerPoisonPercent = v; continue }
      const v2 = pct1(/^enemies\s+take\s+(\d+)%\s+increased\s+damage\s+per\s+1%\s+effect\s+of\s+applied\s+chill\b/i)
      if (v2 != null) { out.enemiesTakeIncreasedDamagePerChillEffectPercent = v2; continue }
      const v3 = pct1(/^enemies\s+have\s+(\d+)%\s+less\s+speed\s+per\s+applied\s+poison\b/i)
      if (v3 != null) { out.enemiesLessSpeedPerPoisonPercent = v3; continue }
    }

    // Chill/shock rules
    if (low === 'whenever you inflict chill, also inflict an equal shock') { out.inflictShockEqualToChill = true; continue }
    if (low === 'your maximum effect of chill is equal to the maximum effect of shock') { out.maxChillEqualsMaxShock = true; continue }
    {
      const v = pct1(/^\+(\d+)%\s+to\s+maximum\s+chill\s+effect\b/i)
      if (v != null) { out.maxChillEffectBonus += v; continue }
      const shMore = pct1(/^hits\s+inflict\s+shock\s+as\s+though\s+dealing\s+(\d+)%\s+more\s+damage\b/i)
      if (shMore != null) { out.shockAsThoughMoreDamagePercent = shMore; continue }
      const chillMore = pct1(/^hits\s+inflict\s+chill\s+as\s+though\s+dealing\s+(\d+)%\s+more\s+damage\b/i)
      if (chillMore != null) { out.chillAsThoughMoreDamagePercent = chillMore; continue }
    }

    // Cyclone stage mechanics
    {
      const m = low.match(/^(\d+)%\s+more\s+attack\s+speed\s+per\s+hit\s+dealt\s+during\s+a\s+stage,\s+up\s+to\s+(\d+)%$/i)
      if (m) {
        out.moreAttackSpeedPerHitThisStagePct = Number(m[1])
        out.moreAttackSpeedPerHitThisStageMaxPct = Number(m[2])
        out.cyclone = true
        continue
      }
      if (low === 'at maximum effect, your hits additionally ignore 50% of enemy armour') {
        out.additionalArmourIgnoreAtMaxStageHits = 50
        out.cyclone = true
        continue
      }
    }

    // Extra strikes / proc strikes
    {
      const m = low.match(/^\+(\d+)\s+strikes\s+per\s+attack\b/i)
      if (m) { out.additionalStrikesPerAttackFlat += Number(m[1]); continue }
      if (low === 'perform +1 strike per attack') { out.additionalStrikesPerAttackFlat += 1; continue }
      if (low === 'when you strike an enemy, strike an additional time with 25% chance') {
        out.extraStrikeChancePerStrikePercent = Math.max(out.extraStrikeChancePerStrikePercent, 25)
        continue
      }
    }

    // Hit counts / projectiles
    {
      const r = range2(/^\+(\d+)\s*-\s*(\d+)\s+hits\s+per\s+attack\b/i)
      if (r) { out.hitsPerAttackRange = r; out.hitsPerAttackIsAdditional = true; continue }
      const r2 = range2(/^\+?(\d+)\s*-\s*(\d+)\s+hits\s+per\s+cast\b/i)
      if (r2) { out.hitsPerCastRange = r2; out.hitsPerCastIsAdditional = l.startsWith('+'); continue }
      if (low === '0-2 hits per cast') { out.hitsPerCastRange = { min: 0, max: 2 }; out.hitsPerCastIsAdditional = false; continue }
      const r3 = range2(/^fires\s+(\d+)\s*-\s*(\d+)\s+additional\s+arrows\s+per\s+attack\b/i)
      if (r3) { out.additionalProjectilesPerAttackRange = r3; continue }
      const r4 = range2(/^\+(\d+)\s*-\s*(\d+)\s+projectiles\s+fired\s+per\s+attack\b/i)
      if (r4) { out.additionalProjectilesPerAttackRange = r4; continue }
      if (low === 'modifiers to cast speed apply to the amount of hits per cast instead') {
        out.castSpeedAppliesToHitsPerCast = true
        continue
      }
    }

    // Smite
    {
      const v = pct1(/^gains\s+additional\s+base\s+mana\s+cost\s+equal\s+to\s+(\d+)%\s+of\s+your\s+current\s+mana\b/i)
      if (v != null) { out.smiteAdditionalBaseManaCostPctOfCurrentMana = v; continue }
      const m = low.match(/^adds\s+(\d+)\s*-\s*(\d+)\s+lightning\s+damage\s+to\s+attacks\s+per\s+1\s+mana\s+cost\b/i)
      if (m) { out.smiteAddsLightningPerManaCost = { min: Number(m[1]), max: Number(m[2]) }; continue }
    }

    // Arcane Explosion
    if (low === 'when arcane explosion is cast, sacrifice 20% of your current mana to deal 10% more damage per 50 mana sacrificed') {
      out.arcaneExplosionSacrificeCurrentManaPercent = 20
      out.arcaneExplosionMoreDamagePer50ManaSacrificedPct = 10
      continue
    }
    if (low === 'arcane explosion cannot be evaded if at least 500 mana was sacrificed this way') {
      out.arcaneExplosionCannotBeEvadedIfManaSacrificedAtLeast = 500
      continue
    }

    // Flame Blast
    {
      const v = pct1(/^deal\s+(\d+)%\s+more\s+damage\s+per\s+0\.1\s+seconds\s+of\s+cast\s+time\b/i)
      if (v != null) { out.flameBlastMoreDamagePer0_1sCastTimePct = v; continue }
    }

    // Dark Pact
    if (low === 'deal 1% more chaos damage per 1% missing combined life and energy shield') {
      out.darkPactMoreChaosDamagePerMissingCombinedPct = 1
      continue
    }
    {
      const v = pct1(/^leech\s+(\d+)%\s+of\s+chaos\s+hit\s+damage\s+as\s+life\b/i)
      if (v != null) { out.darkPactLifeLeechPercent = v; continue }
    }

    // Soul Drain
    {
      const v = pct1(/^leech\s+(\d+)%\s+of\s+chaos\s+hit\s+damage\s+as\s+energy\s+shield\b/i)
      if (v != null) { out.soulDrainEsLeechPercent = v; continue }
    }

    // Blazing Radiance
    if (low === 'take fire damage per second equal to 4% of your combined current life and energy shield') {
      out.blazingRadianceTakeFireDpsPctOfCombinedCurrent = 4
      continue
    }
    if (low === 'deal 1% more fire damage per 40 combined current life and energy shield') {
      out.blazingRadianceMoreFireDamagePer40CombinedCurrentPct = 1
      continue
    }

    // Static Lance
    if (low === 'hits inflict shock as though dealing 100% more damage') {
      out.staticLanceShockAsThoughMoreDamagePercent = 100
      continue
    }
    if (low === 'when the effect of shock on an enemy reaches its maximum, your next hit deals 4% more damage per 1% effect of applied shock and removes all shock afterwards') {
      out.staticLanceNextHitMoreDamagePerShockEffectPct = 4
      out.staticLanceConsumeShockOnEmpoweredHit = true
      continue
    }

    // Explosive Shot ignite behavior
    if (low === 'ignite does not deal damage over its duration') { out.igniteDealsNoDamageOverDuration = true; continue }
    if (low === 'at the end of an ignite effect, all ignite effects are removed and their total stored damage is dealt simultaneously') {
      out.igniteBurstsAtEndAndClearsAll = true
      continue
    }

    // Hail of Arrows
    if (low === 'when your action bar reaches 100%, load an arrow instead of attacking') {
      out.hailOfArrows = true
      continue
    }
    if (low === 'every 1 second, or once 10 arrows are loaded, perform an attack that fires all loaded arrows') {
      out.hailOfArrows = true
      out.hailArrowVolleyEverySec = 1
      out.hailArrowVolleyAtLoadedArrows = 10
      continue
    }

    // Vengeant Thorns
    if (low === 'perform an attack when you are hit') { out.vengeantThornsTriggerAttackOnHit = true; continue }
    if (low === 'base damage and base critical hit chance of your weapons are not applied') { out.vengeantThornsWeaponBaseNotApplied = true; continue }
    {
      const m = low.match(/^gain\s+added\s+base\s+physical\s+damage\s+equal\s+to\s+(\d+)%\s+of\s+your\s+armour\b/i)
      if (m) { out.vengeantThornsAddedBasePhysicalPctOfArmour = Number(m[1]); continue }
    }

    // Stored poison execution (Noxious Strike)
    if (low === 'enemies are killed when the amount of stored poison damage exceeds twice their current life') {
      out.noxiousStrikePoisonExecuteIfRemainingDotDamageMoreThanLifeFactor = 2
      continue
    }

    // Ignore lines not modeled explicitly (yet) but should not fail parsing.
    if (low === 'all bleed effects applied to enemies deal their full damage') continue
    if (low === 'bleeding enemies have 50% less recovery from all sources') continue
    if (low === 'excess recovery from life leech is applied to your energy shield instead') continue
    if (low === 'enemies left below 0% of maximum life with hits are executed') continue

    // Anything else is unknown and should be surfaced by tests.
    out.__unknownLines = (out.__unknownLines ?? []).concat([l])
  }
  return out
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
  const attPct = Math.min(100, Math.max(0, Math.floor(attunementPct)))
  const t = Math.min(1, Math.max(0, attPct / 100))
  const v = p0.value + (p1.value - p0.value) * t * effectivenessMult
  return { key: p0.key, value: Math.round(v) }
}

export function attunementNumericEffects(
  def: EocAbilityDefinition,
  attunementPct: number,
  effectivenessMult: number
): { elementalPenetrationPercent: number; executeBelowLifePercent: number } {
  const mod = interpolateAttunementModifier(def, attunementPct, effectivenessMult)
  if (!mod) return { elementalPenetrationPercent: 0, executeBelowLifePercent: 0 }
  if (mod.key === 'hits penetrate % of enemy elemental resistances') {
    return { elementalPenetrationPercent: mod.value, executeBelowLifePercent: 0 }
  }
  if (mod.key === 'execute below % max life') {
    return { elementalPenetrationPercent: 0, executeBelowLifePercent: mod.value }
  }
  return { elementalPenetrationPercent: 0, executeBelowLifePercent: 0 }
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
