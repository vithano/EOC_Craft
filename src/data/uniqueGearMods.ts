/** Numeric stats extracted from unique mod text (merged into EquipmentModifiers). */
export interface UniqueGearStatPatch {
  flatLife?: number;
  flatMana?: number;
  flatArmour?: number;
  flatEvasion?: number;
  flatDamageMin?: number;
  flatDamageMax?: number;
  flatFireMin?: number;
  flatFireMax?: number;
  flatColdMin?: number;
  flatColdMax?: number;
  flatLightningMin?: number;
  flatLightningMax?: number;
  flatChaosMin?: number;
  flatChaosMax?: number;

  /** Flat damage that applies to spell hits only (does NOT affect weapon/attack hit base). */
  flatSpellDamageMin?: number;
  flatSpellDamageMax?: number;
  flatSpellFireMin?: number;
  flatSpellFireMax?: number;
  flatSpellColdMin?: number;
  flatSpellColdMax?: number;
  flatSpellLightningMin?: number;
  flatSpellLightningMax?: number;
  flatSpellChaosMin?: number;
  flatSpellChaosMax?: number;
  /** +N strikes per attack from unique lines. */
  flatStrikesPerAttack?: number;
  /** % increased strikes per attack (global, non-dex-scaled). */
  increasedStrikesPerAttack?: number;
  /** e.g. Galesong: 4% increased strikes per attack with strike abilities per 10 dexterity → 4 here. */
  strikesIncPctPer10Dex?: number;
  critChanceBonus?: number;
  strBonus?: number;
  dexBonus?: number;
  intBonus?: number;
  flatAccuracy?: number;
  pctIncreasedLifeFromGear?: number;
  pctIncreasedManaFromGear?: number;
  pctIncreasedArmourFromGear?: number;
  pctIncreasedEvasionFromGear?: number;
  pctIncreasedEnergyShieldFromGear?: number;
  increasedMeleeDamageFromGear?: number;
  increasedAttackDamageFromGear?: number;
  increasedDamageFromGear?: number;
  increasedSpellDamageFromGear?: number;
  pctIncreasedAccuracyFromGear?: number;
  /** Global (non-local) attack speed increases from gear. */
  pctIncreasedAttackSpeedFromGear?: number;
  doubleDamageChanceFromGear?: number;
  armourIgnoreFromGear?: number;
  pctToAllElementalResFromGear?: number;
  pctChaosResFromGear?: number;
  manaCostReductionFromGear?: number;
  energyShieldLessMultFromGear?: number;
  flatEnergyShieldFromGear?: number;
  /** "X% increased local physical damage" — applies to weapon base damage only. */
  localIncreasedPhysDamagePct?: number;
  /** "X% increased/reduced local attack speed" — applies to weapon base APS only. */
  localIncreasedApsPct?: number;
  /** "X% increased local defences" — applies to armour/shield base defenses only. */
  localIncreasedDefencesPct?: number;
  /** "X% increased local block chance" — multiplies the shield's base block. */
  localIncreasedBlockPct?: number;
  /** "+X% chance to block" — flat block bonus (any item). */
  flatBlockChanceFromGear?: number;

  /** % increased critical hit chance (global). */
  pctIncreasedCriticalHitChanceFromGear?: number;
  /** % increased elemental damage (attacks + spells that deal elemental). */
  increasedElementalDamageFromGear?: number;

  bleedInflictChanceFromGear?: number;
  poisonInflictChanceFromGear?: number;
  elementalAilmentInflictChanceFromGear?: number;
  chillInflictChanceFromGear?: number;
  shockInflictChanceFromGear?: number;
  igniteInflictChanceFromGear?: number;

  /** Multiplicative DoT “more” from gear (product of 1 + pct/100 per line). */
  dotDamageMoreMultFromGear?: number;
  /** Multiplicative strikes “more” (e.g. 100% more hits → ×2). */
  strikesMoreMultFromGear?: number;
  /** Multiplicative attack speed after “increased” (each “% less attack speed” multiplies). */
  attackSpeedLessMultFromGear?: number;
  /** Multiplicative accuracy (each “% less accuracy rating” multiplies). */
  accuracyLessMultFromGear?: number;

  lifeOnHitFromGear?: number;
  /** Leech as % of attack hit damage (all types). */
  lifeLeechFromHitDamagePercentFromGear?: number;
  /** Leech as % of physical portion of attack damage. */
  lifeLeechFromPhysicalHitPercentFromGear?: number;

  physicalConvertedToFirePctFromGear?: number;
  physicalConvertedToColdPctFromGear?: number;
  physicalConvertedToLightningPctFromGear?: number;

  /** Ignores up to this % of enemy lightning resistance (demo combat when enemy has lightning res). */
  lightningPenetrationFromGear?: number;

  hitsCannotBeEvadedFromGear?: boolean;
  cannotDealCriticalStrikesFromGear?: boolean;

  pctFireResFromGear?: number;
  pctColdResFromGear?: number;
  pctLightningResFromGear?: number;
  pctToAllResistancesFromGear?: number;

  dodgeChanceFromGear?: number;
  dodgeChancePer10DexFromGear?: number;
  maxDodgeChanceBonusFromGear?: number;

  pctIncreasedCastSpeedFromGear?: number;
  castSpeedLessMultFromGear?: number;
  castSpeedIncPctPer10DexFromGear?: number;

  increasedCriticalDamageMultiplierFromGear?: number;
  flatCriticalDamageMultiplierBonusFromGear?: number;

  attackBaseCritChanceBonusFromGear?: number;
  spellBaseCritChanceBonusFromGear?: number;

  tripleDamageChanceFromGear?: number;

  blockPowerPctFromGear?: number;

  armourEffectivenessVsChaosFromGear?: number;

  increasedLightningDamageFromGear?: number;
  increasedChaosDamageFromGear?: number;

  pctIncreasedDamageOverTimeFromGear?: number;
  pctIncreasedBleedDamageFromGear?: number;
  ailmentDurationBonusFromGear?: number;
  /** Product of (1 − p/100) per “% less … duration” line (ailment/bleed/poison/chill/shock). */
  ailmentDurationLessMultFromGear?: number;
  /** Product of (1 − p/100) per “% less ignite duration” (applied after global ailment mult for ignite). */
  igniteDurationLessMultFromGear?: number;

  pctIncreasedAllAttributesFromGear?: number;
  pctIncreasedStrengthFromGear?: number;
  pctIncreasedDexterityFromGear?: number;
  pctIncreasedIntelligenceFromGear?: number;

  damageTakenLessMultFromGear?: number;
  damageTakenMoreMultFromGear?: number;

  lifeRegenPercentOfMaxLifePerSecondFromGear?: number;
  manaRegenPercentOfMaxManaPerSecondFromGear?: number;
  esRegenPercentOfMaxPerSecondFromGear?: number;

  lifeAsExtraEsPercentFromGear?: number;
  manaAsExtraEsPercentFromGear?: number;

  enemyDamageTakenIncreasedFromGear?: number;

  firePenetrationFromGear?: number;
  coldPenetrationFromGear?: number;
  chaosPenetrationFromGear?: number;
  elementalPenetrationFromGear?: number;

  elementalToChaosConversionPctFromGear?: number;
  physicalToRandomElementPctFromGear?: number;
  lightningToColdConversionPctFromGear?: number;
  gainPhysicalAsExtraLightningPctFromGear?: number;

  evasionMoreMultFromGear?: number;

  cannotInflictElementalAilmentsFromGear?: boolean;
  hitsTakenCannotBeCriticalFromGear?: boolean;

  /** Standalone “X% less damage” — reduces damage you deal (not damage taken). */
  damageDealtLessMultFromGear?: number;
  /** Multiplicative “X% more life” on maximum life. */
  lifeMoreMultFromGear?: number;
  /** Multiplicative “X% more maximum mana” (product with other more-mana lines). */
  manaMoreMultFromGear?: number;
  /** Multiplicative on final armour + evasion (e.g. 50% less defences). */
  defencesLessMultFromGear?: number;
  /** Added: mana cost × (1 + sum/100) after reduction. */
  manaCostIncreasePercentFromGear?: number;
  /** Multiplies base mana regen (with upgrade %). */
  pctIncreasedManaRegenFromGear?: number;
  /** Applies to in-combat life regen % and life leech from hits (demo). */
  pctIncreasedLifeRecoveryFromGear?: number;
  /** Double damage chance when the selected ability is a spell. */
  doubleDamageChanceFromSpellsFromGear?: number;
  /** Added to max block chance cap (75 or 100 with Dragoon). */
  maxBlockChanceBonusFromGear?: number;

  physicalTakenAsChaosPercentFromGear?: number;
  elementalTakenAsChaosPercentFromGear?: number;
  physicalTakenAsFirePercentFromGear?: number;
  physicalTakenAsColdPercentFromGear?: number;
  physicalTakenAsLightningPercentFromGear?: number;
  /** Flat reduced physical damage taken (additive, e.g. The Parallax "take 8 reduced physical damage"). */
  reducedPhysicalDamageTakenFromGear?: number;

  /** % increased effect of shock/chill you inflict (demo ailments). */
  nonDamagingAilmentEffectIncreasedFromGear?: number;
  /** Multiplier on chill magnitude you inflict (1 = normal; 0.5 = 50% less effect). */
  chillInflictEffectMultFromGear?: number;

  abilitiesNoCostFromGear?: boolean;
  /** Non-crit hits deal no damage (Broken Legacy-style). */
  dealNoDamageExceptCritFromGear?: boolean;

  increasedFireDamageFromGear?: number;
  increasedColdDamageFromGear?: number;

  /** Added to maximum fire / cold / lightning resist cap (before hard cap). */
  maxFireResBonusFromGear?: number;
  maxColdResBonusFromGear?: number;
  maxLightningResBonusFromGear?: number;
  /** Adds to fire, cold, and lightning caps (e.g. all maximum elemental resistances). */
  maxAllElementalResBonusFromGear?: number;
  maxChaosResBonusFromGear?: number;

  /** % of enemy hit damage removed from mana before ES/life (Flow Tether-style). */
  damageTakenToManaFirstPercentFromGear?: number;

  lifeRecoveredOnKillPercentFromGear?: number;
  flatLifeOnKillFromGear?: number;
  manaOnKillFlatFromGear?: number;

  lifeRecoveredOnBlockPercentFromGear?: number;
  flatLifeOnBlockFromGear?: number;
  manaRecoveredOnBlockPercentFromGear?: number;
  esRecoveredOnBlockPercentFromGear?: number;
  flatManaOnBlockFromGear?: number;
  flatEsOnBlockFromGear?: number;

  energyShieldOnHitFromGear?: number;

  /** X in “X% increased ranged attack damage per 10 strength” (weapon must be bow/crossbow). */
  rangedDamageIncPctPer10StrFromGear?: number;
  /** X in “X% increased damage per 10 combined strength, dexterity, and intelligence”. */
  damageIncPctPer10CombinedAttrsFromGear?: number;

  manaCostPaidWithLifeFromGear?: boolean;

  /** % increased item rarity (meta stat; may be referenced by other unique lines). */
  increasedItemRarityFromGear?: number;
  /** % increased item quantity (meta stat; may be referenced by other unique lines). */
  increasedItemQuantityFromGear?: number;
  /** X in “X% increased critical hit chance per 1% increased item rarity”. */
  critIncPctPerItemRarityPctFromGear?: number;
  /** X in “+X% to critical damage multiplier per 1% increased item quantity”. */
  critMultiPctPerItemQuantityPctFromGear?: number;

  /** +N to the level of all abilities. */
  additionalAbilityLevelsAllFromGear?: number;
  /** +N to the level of cold abilities. */
  additionalAbilityLevelsColdFromGear?: number;
}

function num(m: RegExpMatchArray | null, g = 1): number | null {
  if (!m) return null;
  const v = Number(m[g]?.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

/** `(10 to 30)` → midpoint; `10` → 10. Groups: [1]=lo, [2]=hi, [3]=single. */
function pctFromParenOrSingle(m: RegExpMatchArray): number {
  const lo = m[1];
  const hi = m[2];
  const single = m[3];
  if (lo != null && lo !== "" && hi != null && hi !== "") {
    const a = Number(String(lo).replace(/,/g, ""));
    const b = Number(String(hi).replace(/,/g, ""));
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  }
  if (single != null && single !== "") {
    const v = Number(String(single).replace(/,/g, ""));
    if (Number.isFinite(v)) return v;
  }
  return 0;
}

function normalizeUniqueRollText(raw: string): string {
  return raw
    .trim()
    .replace(/\(([\d.,-]+)\s*-\s*([\d.,-]+)\)/g, "($1 to $2)")
    .replace(/\badds\s*\(/gi, "adds (")
    .replace(/\badds(\d)/gi, "adds $1");
}

/**
 * Mods like Titansblood: "While you have at least N strength/dexterity/intelligence, gain …".
 * Applied in {@link computeBuildStats} after final attributes are known (not during static gear aggregation).
 */
export function attributeThresholdConditionalPatchFromTexts(
  texts: string[],
  str: number,
  dex: number,
  int_: number
): UniqueGearStatPatch {
  const patch: UniqueGearStatPatch = {}
  const add = (p: UniqueGearStatPatch) => {
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue
      const key = k as keyof UniqueGearStatPatch
      const cur = patch[key]
      if (typeof v === "number" && typeof cur === "number") {
        ;(patch as Record<string, number>)[key as string] = cur + v
      } else if (typeof v === "number") {
        ;(patch as Record<string, number>)[key as string] = v
      }
    }
  }

  for (const raw of texts) {
    const l = normalizeUniqueRollText(raw)
    if (!l) continue
    let m = l.match(
      /while you have at least (\d+) strength,?\s+gain\s+\+?(\d+)%\s+chance\s+to\s+deal\s+double\s+damage/i
    )
    if (m) {
      const threshold = Number(m[1])
      const val = Number(m[2])
      if (str >= threshold) add({ doubleDamageChanceFromGear: val })
      continue
    }
    m = l.match(/while you have at least (\d+) dexterity,?\s+gain\s+(\d+)%\s+increased\s+speed/i)
    if (m) {
      const threshold = Number(m[1])
      const val = Number(m[2])
      if (dex >= threshold) {
        add({ pctIncreasedAttackSpeedFromGear: val, pctIncreasedCastSpeedFromGear: val })
      }
      continue
    }
    m = l.match(
      /while you have at least (\d+) intelligence\s+gain\s+\+?(\d+)%\s+to\s+critical\s+damage\s+multiplier/i
    )
    if (m) {
      const threshold = Number(m[1])
      const val = Number(m[2])
      if (int_ >= threshold) add({ increasedCriticalDamageMultiplierFromGear: val })
      continue
    }
  }
  return patch
}

/**
 * Best-effort mapping of resolved unique mod text (innate + rolled lines) into planner stats.
 * Many conditional or build-specific mods are intentionally ignored.
 */
export function equipmentModifiersFromUniqueTexts(
  texts: string[],
  ctx: { isWeapon: boolean },
  opts?: {
    /** Called once per input line with whether at least one rule matched it. */
    onLine?: (line: string, matched: boolean) => void
  }
): UniqueGearStatPatch {
  const acc: UniqueGearStatPatch = {};
  let esLessMult = 1;
  let dotMoreMult = 1;
  let strikesMoreMult = 1;
  let atkSpdLessMult = 1;
  let accLessMult = 1;
  let castSpdLessMult = 1;
  let dmgTakenLessMult = 1;
  let dmgTakenMoreMult = 1;
  let evaMoreMult = 1;
  let dmgDealtLessMult = 1;
  let lifeMoreMult = 1;
  let defencesLessMult = 1;
  let chillInflictEffectMult = 1;
  let ailmentDurLessMult = 1;
  let igniteDurLessMult = 1;

  let matchedThisLine = false
  const mark = () => { matchedThisLine = true }

  const add = (patch: UniqueGearStatPatch) => {
    mark()
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const key = k as keyof UniqueGearStatPatch;
      const cur = acc[key];
      if (typeof v === "number" && typeof cur === "number") {
        (acc as Record<string, number>)[key as string] = cur + v;
      } else if (typeof v === "number") {
        (acc as Record<string, number>)[key as string] = v;
      }
    }
  };

  for (const raw of texts) {
    const l = normalizeUniqueRollText(raw);
    if (!l) continue;
    matchedThisLine = false

    let m: RegExpMatchArray | null;

    const low = l.toLowerCase();
    if (/\byour\s+hits\s+cannot\s+be\s+evaded\b/i.test(l)) { acc.hitsCannotBeEvadedFromGear = true; mark() }
    if (/\byou\s+cannot\s+deal\s+critical\s+hits\b/i.test(low)) { acc.cannotDealCriticalStrikesFromGear = true; mark() }
    if (/\babilities\s+have\s+no\s+cost\b/i.test(low)) { acc.abilitiesNoCostFromGear = true; mark() }
    if (/\bdeal\s+no\s+damage\s+with\s+non[- ]?critical\s+hits\b/i.test(low)) {
      acc.dealNoDamageExceptCritFromGear = true;
      mark()
    }

    m = l.match(/^([\d.]+)%\s+less\s+damage\s*$/i);
    if (m) { dmgDealtLessMult *= Math.max(0.05, 1 - num(m)! / 100); mark() }

    m = l.match(/gain\s+(\d+)\s+life\s+on\s+hit\b/i);
    if (m) add({ lifeOnHitFromGear: num(m)! });

    m = l.match(/lose\s+(\d+)\s+life\s+on\s+hit\b/i);
    if (m) add({ lifeOnHitFromGear: -num(m)! });

    m = l.match(
      /leech\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+hit\s+damage\s+from\s+attacks\s+as\s+life\b/i
    );
    if (m) add({ lifeLeechFromHitDamagePercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /leech\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+physical\s+hit\s+damage\s+from\s+attacks\s+as\s+life\b/i
    );
    if (m) add({ lifeLeechFromPhysicalHitPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /convert\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+your\s+physical\s+damage\s+(?:to|into)\s+fire\s+damage\b/i
    );
    if (m) add({ physicalConvertedToFirePctFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /convert\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+your\s+physical\s+damage\s+(?:to|into)\s+cold\s+damage\b/i
    );
    if (m) add({ physicalConvertedToColdPctFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /convert\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+your\s+physical\s+damage\s+(?:to|into)\s+(lightning|lighting)\s+damage\b/i
    );
    if (m) add({ physicalConvertedToLightningPctFromGear: pctFromParenOrSingle(m) });

    m = l.match(/your\s+chance\s+to\s+inflict\s+elemental\s+ailments\s+is\s+(\d+)%/i);
    if (m) add({ elementalAilmentInflictChanceFromGear: num(m)! });

    m = l.match(/attacks\s+have\s+a\s+(\d+)%\s+chance\s+to\s+inflict\s+ailments\b/i);
    if (m) add({ elementalAilmentInflictChanceFromGear: num(m)! });

    m = l.match(/\+?(\d+)%\s+chance\s+to\s+inflict\s+bleeding\s+with\s+attacks\b/i);
    if (m) add({ bleedInflictChanceFromGear: num(m)! });

    m = l.match(/\+?(\d+)%\s+chance\s+to\s+inflict\s+poison\s+with\s+attacks\b/i);
    if (m) add({ poisonInflictChanceFromGear: num(m)! });

    m = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+elemental\s+ailments?\b/i);
    if (m) add({ elementalAilmentInflictChanceFromGear: num(m)! });

    m = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+chill\b/i);
    if (m) add({ chillInflictChanceFromGear: num(m)! });

    m = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+shock\b/i);
    if (m) add({ shockInflictChanceFromGear: num(m)! });

    m = l.match(/\+(\d+)%\s+chance\s+to\s+inflict\s+ignite\b/i);
    if (m) add({ igniteInflictChanceFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+more\s+bleed(?:ing)?\s+damage\b/i);
    if (m) { dotMoreMult *= 1 + num(m)! / 100; mark() }

    m = l.match(/([\d.]+)%\s+more\s+ignite\s+damage\b/i);
    if (m) { dotMoreMult *= 1 + num(m)! / 100; mark() }

    m = l.match(/([\d.]+)%\s+more\s+poison\s+damage\b/i);
    if (m) { dotMoreMult *= 1 + num(m)! / 100; mark() }

    m = l.match(/([\d.]+)%\s+more\s+damage\s+over\s+time\b/i);
    if (m) { dotMoreMult *= 1 + num(m)! / 100; mark() }

    m = l.match(/([\d.]+)%\s+more\s+hits?\s+per\s+attack\b/i);
    if (m) { strikesMoreMult *= 1 + num(m)! / 100; mark() }

    m = l.match(/([\d.]+)%\s+less\s+attack\s+and\s+cast\s+speed\b/i);
    if (m) { atkSpdLessMult *= Math.max(0.05, 1 - num(m)! / 100); mark() }

    m = l.match(/([\d.]+)%\s+less\s+attack\s+speed\b/i);
    if (m) { atkSpdLessMult *= Math.max(0.05, 1 - num(m)! / 100); mark() }

    m = l.match(/([\d.]+)%\s+less\s+accuracy\s+rating\b/i);
    if (m) { accLessMult *= Math.max(0.05, 1 - num(m)! / 100); mark() }

    m = l.match(
      /(?:\(([\d.-]+)\s+to\s+([\d.-]+)\)|([\d.-]+))%\s+less\s+cast\s+speed\b/i
    );
    if (m) {
      const p = Math.abs(pctFromParenOrSingle(m));
      castSpdLessMult *= Math.max(0.05, 1 - p / 100);
      mark()
    }

    m = l.match(/([\d.]+)%\s+more\s+evasion\s+rating\b/i);
    if (m) { evaMoreMult *= 1 + num(m)! / 100; mark() }

    m = l.match(
      /take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+damage(?!\s+while)\b/i
    );
    if (m) { dmgTakenMoreMult *= 1 + pctFromParenOrSingle(m) / 100; mark() }

    m = l.match(/take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+reduced\s+damage\b/i);
    if (m) { dmgTakenMoreMult *= Math.max(0.05, 1 - pctFromParenOrSingle(m) / 100); mark() }

    m = l.match(
      /enemies\s+take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+damage\b/i
    );
    if (m) add({ enemyDamageTakenIncreasedFromGear: pctFromParenOrSingle(m) });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+to\s+fire\s+resistance\b/i);
    if (m) add({ pctFireResFromGear: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+fire\s+resistance\b/i);
    if (m) add({ pctFireResFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+to\s+cold\s+resistance\b/i);
    if (m) add({ pctColdResFromGear: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+cold\s+resistance\b/i);
    if (m) add({ pctColdResFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+to\s+lightning\s+resistance\b/i);
    if (m) add({ pctLightningResFromGear: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+lightning\s+resistance\b/i);
    if (m) add({ pctLightningResFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+to\s+all\s+resistances\b/i);
    if (m) add({ pctToAllResistancesFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+chance\s+to\s+dodge\s+per\s+10\s+dexterity\b/i);
    if (m) add({ dodgeChancePer10DexFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+chance\s+to\s+dodge\b/i);
    if (m) add({ dodgeChanceFromGear: num(m)! });

    m = l.match(/^(\d+(?:\.\d+)?)%\s+chance\s+to\s+dodge\b/i);
    if (m) add({ dodgeChanceFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+to\s+maximum\s+chance\s+to\s+dodge\b/i);
    if (m) add({ maxDodgeChanceBonusFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+cast\s+speed\s+per\s+10\s+dexterity\b/i);
    if (m) add({ castSpeedIncPctPer10DexFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+cast\s+speed\b/i);
    if (m) add({ pctIncreasedCastSpeedFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increase\s+cast\s+speed\b/i);
    if (m) add({ pctIncreasedCastSpeedFromGear: num(m)! });

    // Whole-line only: avoid matching trailing clauses ("While … gain +60% to critical …")
    // or scaling lines ("+1% to critical … per 20 accuracy").
    m = l.match(/^\s*your\s+critical\s+damage\s+multiplier\s+is\s+\+?(\d+)%\s*$/i);
    if (m) add({ increasedCriticalDamageMultiplierFromGear: num(m)! });

    m = l.match(/^\s*\+?(\d+(?:\.\d+)?)%\s+to\s+critical\s+damage\s+multiplier\s*$/i);
    if (m) add({ increasedCriticalDamageMultiplierFromGear: num(m)! });

    m = l.match(/^\s*\+(\d+)\s+to\s+critical\s+damage\s+multiplier\s*$/i);
    if (m) add({ flatCriticalDamageMultiplierBonusFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+to\s+attack\s+base\s+critical\s+hit\s+chance\b/i);
    if (m) add({ attackBaseCritChanceBonusFromGear: num(m)! });

    m = l.match(/\+?(\d+(?:\.\d+)?)%\s+to\s+spell\s+base\s+critical\s+hit\s+chance\b/i);
    if (m) add({ spellBaseCritChanceBonusFromGear: num(m)! });

    m = l.match(/\+?(\d+)%\s+chance\s+to\s+deal\s+triple\s+damage\s+with\s+attacks\b/i);
    if (m) add({ tripleDamageChanceFromGear: num(m)! });

    m = l.match(/\+?([\d.-]+)%\s+to\s+block\s+power\b/i);
    if (m) add({ blockPowerPctFromGear: num(m)! });

    m = l.match(/\+?(\d+)%\s+to\s+armou?r\s+effectiveness\s+against\s+chaos\s+damage\b/i);
    if (m) add({ armourEffectivenessVsChaosFromGear: num(m)! / 100 });

    m = l.match(/([\d.]+)%\s+increased\s+lightning\s+damage\b/i);
    if (m) add({ increasedLightningDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+chaos\s+damage\b/i);
    if (m) add({ increasedChaosDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+damage\s+over\s+time\b/i);
    if (m) add({ pctIncreasedDamageOverTimeFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+bleed(?:ing)?\s+damage\b/i);
    if (m) add({ pctIncreasedBleedDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+poison\s+duration\b/i);
    if (m) add({ ailmentDurationBonusFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+ailment\s+duration\b/i);
    if (m) add({ ailmentDurationBonusFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increase\s+ailment\s+duration\b/i);
    if (m) add({ ailmentDurationBonusFromGear: num(m)! });

    m = l.match(/^(\d+)\s+increased\s+ailment\s+duration\b/i);
    if (m) add({ ailmentDurationBonusFromGear: num(m)! });

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+less\s+ailment\s+duration\b/i
    );
    if (m) {
      const p = Math.abs(pctFromParenOrSingle(m));
      ailmentDurLessMult *= Math.max(0.05, 1 - p / 100);
    }

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+less\s+(?:bleed|poison|chill|shock)\s+duration\b/i
    );
    if (m) {
      const p = Math.abs(pctFromParenOrSingle(m));
      ailmentDurLessMult *= Math.max(0.05, 1 - p / 100);
    }

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+less\s+ignite\s+duration\b/i
    );
    if (m) {
      const p = Math.abs(pctFromParenOrSingle(m));
      igniteDurLessMult *= Math.max(0.05, 1 - p / 100);
    }

    m = l.match(/([\d.]+)%\s+reduced\s+ailment\s+duration\b/i);
    if (m) add({ ailmentDurationBonusFromGear: -num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+attributes\b/i);
    if (m) add({ pctIncreasedAllAttributesFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+item\s+rarity\b/i);
    if (m) add({ increasedItemRarityFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+item\s+quantity\b/i);
    if (m) add({ increasedItemQuantityFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+critical\s+hit\s+chance\s+per\s+1%\s+increased\s+item\s+rarity\b/i);
    if (m) add({ critIncPctPerItemRarityPctFromGear: num(m)! });

    m = l.match(/\+([\d.]+)%\s+to\s+critical\s+damage\s+multiplier\s+per\s+1%\s+increased\s+item\s+quantity\b/i);
    if (m) add({ critMultiPctPerItemQuantityPctFromGear: num(m)! });

    m = l.match(/\+\(?([\d.-]+)\)?\s+to\s+the\s+level\s+of\s+all\s+abilities\b/i);
    if (m) add({ additionalAbilityLevelsAllFromGear: num(m)! });

    m = l.match(/\+\(?([\d.-]+)\)?\s+to\s+the\s+level\s+of\s+cold\s+abilities\b/i);
    if (m) add({ additionalAbilityLevelsColdFromGear: num(m)! });
    m = l.match(/\+\(([\d.]+)\s+to\s+([\d.]+)\)\s+to\s+the\s+level\s+of\s+cold\s+abilities\b/i);
    if (m) add({ additionalAbilityLevelsColdFromGear: pctFromParenOrSingle(m) });

    m = l.match(/([\d.]+)%\s+increased\s+strength\b/i);
    if (m) add({ pctIncreasedStrengthFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+dexterity\b/i);
    if (m) add({ pctIncreasedDexterityFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+intelligence\b/i);
    if (m) add({ pctIncreasedIntelligenceFromGear: num(m)! });

    // Some data lines omit the word "increased" (e.g. "15% to intelligence")
    m = l.match(/^\+?([\d.]+)%\s+to\s+strength\b/i);
    if (m) add({ pctIncreasedStrengthFromGear: num(m)! });
    m = l.match(/^\+?([\d.]+)%\s+to\s+dexterity\b/i);
    if (m) add({ pctIncreasedDexterityFromGear: num(m)! });
    m = l.match(/^\+?([\d.]+)%\s+to\s+intelligence\b/i);
    if (m) add({ pctIncreasedIntelligenceFromGear: num(m)! });
    m = l.match(/^\+?([\d.]+)%\s+to\s+all\s+attributes\b/i);
    if (m) add({ pctIncreasedAllAttributesFromGear: num(m)! });

    m = l.match(/take\s+no\s+extra\s+damage\s+from\s+critical\s+hits\b/i);
    if (m) {
      acc.hitsTakenCannotBeCriticalFromGear = true;
      mark();
    }

    m = l.match(
      /regenerate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+life\s+per\s+second\b/i
    );
    if (m) add({ lifeRegenPercentOfMaxLifePerSecondFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /regenerate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+mana\s+per\s+second\b/i
    );
    if (m) add({ manaRegenPercentOfMaxManaPerSecondFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /regenerate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+energy\s+shield\s+per\s+second\b/i
    );
    if (m) add({ esRegenPercentOfMaxPerSecondFromGear: pctFromParenOrSingle(m) });

    m = l.match(/gain\s+([\d.]+)%\s+of\s+life\s+as\s+extra\s+base\s+energy\s+shield\b/i);
    if (m) add({ lifeAsExtraEsPercentFromGear: num(m)! });

    m = l.match(/gain\s+([\d.]+)%\s+of\s+mana\s+as\s+extra\s+base\s+energy\s+shield\b/i);
    if (m) add({ manaAsExtraEsPercentFromGear: num(m)! });

    m = l.match(
      /hits\s+penetrate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+enemy\s+fire\s+resistance\b/i
    );
    if (m) add({ firePenetrationFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /hits\s+penetrate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+enemy\s+cold\s+resistance\b/i
    );
    if (m) add({ coldPenetrationFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /hits\s+penetrate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+(?:enemy\s+)?(lightning|lighting)\s+resistance\b/i
    );
    if (m) add({ lightningPenetrationFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /hits\s+penetrate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+enemy\s+chaos\s+resistance\b/i
    );
    if (m) add({ chaosPenetrationFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /hits\s+penetrate\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+enemy\s+elemental\s+resistances?\b/i
    );
    if (m) add({ elementalPenetrationFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /convert\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+your\s+elemental\s+damage\s+to\s+chaos\s+damage\b/i
    );
    if (m) add({ elementalToChaosConversionPctFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /convert\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+your\s+physical\s+damage\s+to\s+a\s+random\s+damage\s+type\s+on\s+hit\b/i
    );
    if (m) add({ physicalToRandomElementPctFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /convert\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+your\s+lightning\s+damage\s+(?:into|to)\s+cold\s+damage\b/i
    );
    if (m) add({ lightningToColdConversionPctFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /gain\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+physical\s+damage\s+as\s+extra\s+lightning\s+damage\b/i
    );
    if (m) add({ gainPhysicalAsExtraLightningPctFromGear: pctFromParenOrSingle(m) });

    if (/\byour\s+hits\s+cannot\s+inflict\s+elemental\s+ailments\b/i.test(low)) {
      acc.cannotInflictElementalAilmentsFromGear = true;
      mark()
    }
    if (/\bhits\s+you\s+take\s+cannot\s+be\s+critical\b/i.test(low)) {
      acc.hitsTakenCannotBeCriticalFromGear = true;
      mark()
    }

    m = l.match(/([\d.]+)%\s+increased\s+attack\s+rating\b/i);
    if (m) add({ pctIncreasedAccuracyFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+amou?r\b/i);
    if (m) add({ pctIncreasedArmourFromGear: num(m)! });
    
    m = l.match(/([\d.]+)%\s+increase(?:d)?\s+energy\s+shield\b/i);
    if (m) add({ pctIncreasedEnergyShieldFromGear: num(m)! });

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+local\s+defences?\b/i
    );
    if (m) add({ localIncreasedDefencesPct: pctFromParenOrSingle(m) });
    else {
      m = l.match(/([\d.]+)%\s+increased\s+local\s+defenses?\b/i);
      if (m) add({ localIncreasedDefencesPct: num(m)! });
      else {
        m = l.match(/([\d.]+)\s+increased\s+local\s+defences?\b/i);
        if (m) add({ localIncreasedDefencesPct: num(m)! });
      }
    }

    m = l.match(/\+(\d+(?:\.\d+)?)\s+local\s+base\s+critical\s+hit\s+chance\b/i);
    if (m) add({ critChanceBonus: num(m)! });

    const pushPhysToAttacks = (lo: number, hi: number) => {
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      add({ flatDamageMin: a * 0.5, flatDamageMax: b });
    };
    m = l.match(/adds\s+([\d.]+)\s+to\s+([\d.]+)\s+physical\s+damage\s+to\s+attacks\b/i);
    if (m) pushPhysToAttacks(num(m, 1)!, num(m, 2)!);
    else {
      m = l.match(/adds\s+([\d.]+)\s*-\s*([\d.]+)\s+physical\s+damage\s+to\s+attacks\b/i);
      if (m) pushPhysToAttacks(num(m, 1)!, num(m, 2)!);
    }

    m = l.match(/([\d.]+)%\s+increased\s+critical\s+hit\s+chance\b/i);
    if (m) add({ pctIncreasedCriticalHitChanceFromGear: num(m)! });

    // Flat added damage to spells (spell-only, NOT weapon local). Stored using the same min×0.5 convention.
    const pushFlatToSpells = (element: string, lo: number, hi: number) => {
      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);
      const minF = a * 0.5;
      const maxF = b;
      const el = element.toLowerCase();
      if (el === "fire") add({ flatSpellFireMin: minF, flatSpellFireMax: maxF });
      else if (el === "cold") add({ flatSpellColdMin: minF, flatSpellColdMax: maxF });
      else if (el === "lightning" || el === "lighting") add({ flatSpellLightningMin: minF, flatSpellLightningMax: maxF });
      else if (el === "chaos") add({ flatSpellChaosMin: minF, flatSpellChaosMax: maxF });
      else if (el === "physical") add({ flatSpellDamageMin: minF, flatSpellDamageMax: maxF });
      else add({ flatSpellDamageMin: minF, flatSpellDamageMax: maxF });
    };
    m = l.match(
      /adds\s+([\d.]+)\s+to\s+([\d.]+)\s+(fire|cold|lightning|lighting|chaos|physical)\s+damage\s+to\s+spells\b/i
    );
    if (m) {
      pushFlatToSpells(m[3]!, num(m, 1)!, num(m, 2)!);
    } else {
      m = l.match(
        /adds\s+([\d.]+)\s*-\s*([\d.]+)\s+(fire|cold|lightning|lighting|chaos|physical)\s+damage\s+to\s+spells\b/i
      );
      if (m) pushFlatToSpells(m[3]!, num(m, 1)!, num(m, 2)!);
    }

    m = l.match(/([\d.]+)%\s+increased\s+elemental\s+damage\b/i);
    if (m) add({ increasedElementalDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)\s+increased\s+elemental\s+damage\b/i);
    if (m && !/%/.test(l)) add({ increasedElementalDamageFromGear: num(m)! });
    m = l.match(/\+(\d+)\s+to\s+maximum\s+life\b/i);
    if (m) add({ flatLife: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+maximum\s+mana\b/i);
    if (m) add({ flatMana: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+armour\b/i);
    if (m) add({ flatArmour: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+evasion\s+rating\b/i);
    if (m) add({ flatEvasion: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+all\s+attributes\b/i);
    if (m) {
      const v = num(m)!;
      add({ strBonus: v, dexBonus: v, intBonus: v });
    }

    m = l.match(/\+(\d+)\s+to\s+strength\b/i);
    if (m) add({ strBonus: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+dexterity\b/i);
    if (m) add({ dexBonus: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+intelligence\b/i);
    if (m) add({ intBonus: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+accuracy\s+rating\b/i);
    if (m) add({ flatAccuracy: num(m)! });

    m = l.match(/^([\d.,]+)\s+to\s+accuracy\s+rating\b/i);
    if (m) add({ flatAccuracy: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+life\b/i);
    if (m) add({ pctIncreasedLifeFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+mana\b/i);
    if (m) add({ pctIncreasedManaFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+armour\b/i);
    if (m) add({ pctIncreasedArmourFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+evasion\s+rating\b/i);
    if (m) add({ pctIncreasedEvasionFromGear: num(m)! });

    // "increased defences" (global, no "local") — applies % globally to all armour/evasion
    m = l.match(/([\d.]+)%\s+increased\s+defences\b/i);
    if (m && !/local/i.test(l)) add({ pctIncreasedArmourFromGear: num(m)!, pctIncreasedEvasionFromGear: num(m)!, pctIncreasedEnergyShieldFromGear: num(m)! });


    m = l.match(/([\d.]+)%\s+increased\s+melee\s+physical\s+damage\b/i);
    if (m) add({ increasedMeleeDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+attack\s+damage\b/i);
    if (m) add({ increasedAttackDamageFromGear: num(m)! });

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+damage\s+per\s+10\s+combined\s+strength,\s+dexterity,\s+and\s+intelligence\b/i
    );
    if (m) add({ damageIncPctPer10CombinedAttrsFromGear: pctFromParenOrSingle(m) });

    m = l.match(/([\d.]+)%\s+increased\s+damage\b/i);
    if (m && !/elemental/i.test(l) && !/\bper\s+10\b/i.test(l)) {
      add({ increasedDamageFromGear: num(m)! });
    }

    m = l.match(/([\d.]+)%\s+increased\s+spell\s+damage\b/i);
    if (m) add({ increasedSpellDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+accuracy\s+rating\b/i);
    if (m) add({ pctIncreasedAccuracyFromGear: num(m)! });

    if (ctx.isWeapon) {
      // Local attack speed — stored separately; applied to weapon base APS in aggregation
      m = l.match(/([\d.-]+)%\s+increased\s+local\s+attack\s+speed\b/i);
      if (m) add({ localIncreasedApsPct: num(m)! });

      m = l.match(/(?:\(([\d.-]+)\s+to\s+([\d.-]+)\)|([\d.-]+))%\s+increased\s+local\s+attack\s+speed\b/i);
      if (m) add({ localIncreasedApsPct: pctFromParenOrSingle(m) });

      m = l.match(/([\d.-]+)%\s+reduced\s+local\s+attack\s+speed\b/i);
      if (m) add({ localIncreasedApsPct: -Math.abs(num(m)!) });

      // "increased local physical damage" — stored separately; applied to weapon base in aggregation
      m = l.match(/([\d.]+)%?\s+increased\s+local\s+physical\s+damage\b/i);
      if (m) add({ localIncreasedPhysDamagePct: num(m)! });
    }

    // Global (non-local) attack speed
    m = l.match(/([\d.]+)%\s+increased\s+attack\s+speed\b/i);
    if (m && !/local/i.test(l)) add({ pctIncreasedAttackSpeedFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+attack\s+and\s+cast\s+speed\b/i);
    if (m) add({ pctIncreasedAttackSpeedFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increase\s+attack\s+and\s+cast\s+speed\b/i);
    if (m) add({ pctIncreasedAttackSpeedFromGear: num(m)! });

    if (ctx.isWeapon) {
      const pushLocalFlat = (element: string, lo: number, hi: number) => {
        const a = Math.min(lo, hi);
        const b = Math.max(lo, hi);
        const minF = a * 0.5;
        const maxF = b;
        const el = element.toLowerCase();
        if (el === "fire") add({ flatFireMin: minF, flatFireMax: maxF });
        else if (el === "cold") add({ flatColdMin: minF, flatColdMax: maxF });
        else if (el === "lightning" || el === "lighting")
          add({ flatLightningMin: minF, flatLightningMax: maxF });
        else if (el === "chaos") add({ flatChaosMin: minF, flatChaosMax: maxF });
        else if (el === "physical") add({ flatDamageMin: minF, flatDamageMax: maxF });
        else add({ flatDamageMin: minF, flatDamageMax: maxF });
      };

      // "Adds X to Y local {element} damage"
      m = l.match(
        /adds\s+([\d.]+)\s+to\s+([\d.]+)\s+local\s+(fire|cold|lightning|lighting|chaos|physical)\s+damage\b/i
      );
      if (m) pushLocalFlat(m[3]!, num(m, 1)!, num(m, 2)!);
      else {
        m = l.match(
          /adds\s+([\d.]+)\s*-\s*([\d.]+)\s+local\s+(fire|cold|lightning|lighting|chaos|physical)\s+damage\b/i
        );
        if (m) pushLocalFlat(m[3]!, num(m, 1)!, num(m, 2)!);
        else {
          m = l.match(/adds\s+([\d.]+)\s+to\s+([\d.]+)\s+local\s+damage\b/i);
          if (m) pushLocalFlat("physical", num(m, 1)!, num(m, 2)!);
        }
      }
    }

    if (ctx.isWeapon) {
      m = l.match(/([\d.]+)%\s+local\s+base\s+critical\s+hit\s+chance\b/i);
      if (m) add({ critChanceBonus: num(m)! });

      if(!m){
        m = l.match(/\+\s*([\d.]+)%\s+local\s+base\s+critical\s+hit\s+chance\b/i);
        if (m) add({ critChanceBonus: num(m)! });
      }

      m = l.match(/\+\(([\d.]+)\s+to\s+([\d.]+)\)%\s+local\s+base\s+critical\s+hit\s+chance\b/i);
      if (m) add({ critChanceBonus: pctFromParenOrSingle(m) });
    }

    m = l.match(/\+(\d+)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+attacks\b/i);
    if (m) add({ doubleDamageChanceFromGear: num(m)! });

    m = l.match(/(\d+)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+attacks\b/i);
    if (m) add({ doubleDamageChanceFromGear: num(m)! });

    m = l.match(/\+?(\d+)%\s+chance\s+to\s+deal\s+double\s+damage\b/i);
    if (m) add({ doubleDamageChanceFromGear: num(m)! });

    m = l.match(
      /(?:hits\s+)?ignore\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+enemy\s+armou?r\b/i
    );
    if (m) add({ armourIgnoreFromGear: pctFromParenOrSingle(m) });

    m = l.match(/([\d.]+)%\s+to\s+all\s+elemental\s+resistances\b/i);
    if (m) add({ pctToAllElementalResFromGear: num(m)! });

    m = l.match(/\+\s*\(?([\d.-]+)\)?%?\s+to\s+chaos\s+resistance\b/i);
    if (m) add({ pctChaosResFromGear: num(m)! });

    m = l.match(/\(?([\d.-]+)\)?%?\s+to\s+chaos\s+resistance\b/i);
    if (m && !l.toLowerCase().includes("per")) add({ pctChaosResFromGear: num(m)! });

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+reduced\s+mana\s+cost\s+of\s+abilities\b/i
    );
    if (m) add({ manaCostReductionFromGear: Math.abs(pctFromParenOrSingle(m)) });

    m = l.match(/-\s*([\d.]+)\s+reduced\s+mana\s+cost\s+of\s+abilities\b/i);
    if (m) add({ manaCostReductionFromGear: Math.abs(num(m)!) });

    m = l.match(
      /([\d.]+)%\s+increased\s+strikes\s+per\s+attack\s+with\s+strike\s+abilities\s+per\s+10\s+dexterity\b/i
    );
    if (m) add({ strikesIncPctPer10Dex: num(m)! });

    if (ctx.isWeapon) {
      m = l.match(/\+(\d+)\s+strikes\s+per\s+attack\b/i);
      if (m) add({ flatStrikesPerAttack: num(m)! });
      if(!m){
        m = l.match(/\+(\d+)\s+strike\s+per\s+attack\b/i);
        if (m) add({ flatStrikesPerAttack: num(m)! });
      }
    }

    m = l.match(/([\d.]+)%\s+increased\s+strikes\s+per\s+attack\b/i);
    if (m && !/per\s+10\s+dexterity/i.test(l)) add({ increasedStrikesPerAttack: num(m)! });

    m = l.match(/\(?([\d.-]+)\)?%?\s+less\s+energy\s+shield\b/i);
    if (m) {
      const v = Math.abs(num(m)!);
      if (v > 0) { esLessMult *= 1 - v / 100; mark() }
    }

    m = l.match(/\+(\d+)\s+to\s+energy\s+shield\b/i);
    if (m) add({ flatEnergyShieldFromGear: num(m)! });

    // Block chance — flat bonus from any item slot
    m = l.match(/\+\s*([\d.]+)%\s+(?:chance\s+to\s+block|to\s+block)\b/i);
    if (m) add({ flatBlockChanceFromGear: num(m)! });

    m = l.match(/^\s*([\d.]+)%\s+(?:chance\s+to\s+block|to\s+block)\b/i);
    if (m) add({ flatBlockChanceFromGear: num(m)! });

    m = l.match(/\+([\d.]+)%\s+to\s+block\b/i);
    if (m) add({ flatBlockChanceFromGear: num(m)! });

    // "X% increased local block chance" — stored separately; multiplied against shield base in aggregation
    m = l.match(/([\d.]+)%\s+increased\s+local\s+block\s+chance\b/i);
    if (m) add({ localIncreasedBlockPct: num(m)! });

    m = l.match(
      /take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+less\s+damage\b/i
    );
    if (m && !/poison/i.test(low)) {
      dmgTakenLessMult *= Math.max(0.05, 1 - pctFromParenOrSingle(m) / 100);
      mark()
    }

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+mana\s+cost\s+of\s+abilities\b/i
    );
    if (m) add({ manaCostIncreasePercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(/([\d.]+)%\s+increased\s+mana\s+regeneration\b/i);
    if (m) add({ pctIncreasedManaRegenFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+mana\s+regen\b/i);
    if (m) add({ pctIncreasedManaRegenFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+life\s+recovery\b/i);
    if (m) add({ pctIncreasedLifeRecoveryFromGear: num(m)! });

    m = l.match(
      /\+\(([\d.]+)\s+to\s+([\d.]+)\)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+spells\b/i
    );
    if (m) add({ doubleDamageChanceFromSpellsFromGear: pctFromParenOrSingle(m) });

    m = l.match(/\+?([\d.]+)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+spells\b/i);
    if (m) add({ doubleDamageChanceFromSpellsFromGear: num(m)! });

    m = l.match(/(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+more\s+life\b/i);
    if (m) { lifeMoreMult *= 1 + pctFromParenOrSingle(m) / 100; mark() }

    m = l.match(/(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+less\s+defences\b/i);
    if (m) { defencesLessMult *= Math.max(0.05, 1 - pctFromParenOrSingle(m) / 100); mark() }

    m = l.match(/\+\s*(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+to\s+maximum\s+chance\s+to\s+block\b/i);
    if (m) add({ maxBlockChanceBonusFromGear: pctFromParenOrSingle(m) });

    m = l.match(/-\s*(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+to\s+maximum\s+chance\s+to\s+block\b/i);
    if (m) add({ maxBlockChanceBonusFromGear: -Math.abs(pctFromParenOrSingle(m)) });

    // Single-value max resistances
    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+fire\s+resistance\b/i);
    if (m) add({ maxFireResBonusFromGear: num(m)! });
    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+cold\s+resistance\b/i);
    if (m) add({ maxColdResBonusFromGear: num(m)! });
    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+lightning\s+resistance\b/i);
    if (m) add({ maxLightningResBonusFromGear: num(m)! });
    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+chaos\s+resistance\b/i);
    if (m) add({ maxChaosResBonusFromGear: num(m)! });
    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+all\s+maximum\s+elemental\s+resistances\b/i);
    if (m) add({ maxAllElementalResBonusFromGear: num(m)! });

    m = l.match(/take\s+(?:\(([\d.]+)\s+-\s+([\d.]+)\)|([\d.]+))%\s+reduced\s+physical\s+damage\b/i);
    if (m) add({ reducedPhysicalDamageTakenFromGear: pctFromParenOrSingle(m) });
    m = l.match(/take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+reduced\s+physical\s+damage\b/i);
    if (m) add({ reducedPhysicalDamageTakenFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+physical\s+damage\s+as\s+chaos\s+damage\b/i
    );
    if (m) add({ physicalTakenAsChaosPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+elemental\s+damage\s+as\s+chaos\s+damage\b/i
    );
    if (m) add({ elementalTakenAsChaosPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+physical\s+damage\s+as\s+fire\s+damage\b/i
    );
    if (m) add({ physicalTakenAsFirePercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+physical\s+damage\s+as\s+cold\s+damage\b/i
    );
    if (m) add({ physicalTakenAsColdPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /take\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+physical\s+damage\s+as\s+lightning\s+damage\b/i
    );
    if (m) add({ physicalTakenAsLightningPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(/([\d.]+)%\s+increased\s+effect\s+of\s+non[- ]?damaging\s+ailments?\b/i);
    if (m) add({ nonDamagingAilmentEffectIncreasedFromGear: num(m)! });

    m = l.match(
      /(?:\(([\d.-]+)\s+to\s+([\d.-]+)\)|([\d.-]+))%\s+less\s+chill\s+effect\b/i
    );
    if (m) {
      const p = Math.abs(pctFromParenOrSingle(m));
      chillInflictEffectMult *= Math.max(0.05, 1 - p / 100);
      mark()
    }

    m = l.match(/\+\s*\(([\d.-]+)\s+to\s+([\d.-]+)\)%\s+to\s+all\s+elemental\s+resistances\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ pctToAllElementalResFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)%\s+to\s+all\s+resistances\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ pctToAllResistancesFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)\s+to\s+maximum\s+life\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ flatLife: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)\s+to\s+maximum\s+mana\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ flatMana: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)\s+to\s+(strength|dexterity|intelligence)\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) {
        const which = m[3]!.toLowerCase();
        if (which === "strength") add({ strBonus: mid });
        else if (which === "dexterity") add({ dexBonus: mid });
        else add({ intBonus: mid });
      }
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)\s+increased\s+ailment\s+duration\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ ailmentDurationBonusFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)\s+increased\s+defences\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ pctIncreasedArmourFromGear: mid, pctIncreasedEvasionFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)\s+increased\s+dexterity\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ pctIncreasedDexterityFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)\s+to\s+chaos\s+resistance\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ pctChaosResFromGear: mid });
    }

    m = l.match(/(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+ignite\s+duration\b/i);
    if (m) add({ ailmentDurationBonusFromGear: pctFromParenOrSingle(m) });

    m = l.match(/(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+chill\s+duration\b/i);
    if (m) add({ ailmentDurationBonusFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+attack\s+critical\s+hit\s+chance\b/i
    );
    if (m) add({ pctIncreasedCriticalHitChanceFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+increased\s+spell\s+critical\s+hit\s+chance\b/i
    );
    if (m) add({ pctIncreasedCriticalHitChanceFromGear: pctFromParenOrSingle(m) });

    m = l.match(/([\d.]+)%\s+increased\s+cric?ital\s+hit\s+chance\b/i);
    if (m) add({ pctIncreasedCriticalHitChanceFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increase\s+attack\s+and\s+cast\s+speed\b/i);
    if (m) add({ pctIncreasedAttackSpeedFromGear: num(m)!, pctIncreasedCastSpeedFromGear: num(m)! });

    m = l.match(
      /\+(\d+(?:\.\d+)?)%\s+to\s+base\s+critcal\s+hit\s+chance\b/i
    );
    if (m) add({ attackBaseCritChanceBonusFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+fire\s+damage\b/i);
    if (m) add({ increasedFireDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+cold\s+damage\b/i);
    if (m) add({ increasedColdDamageFromGear: num(m)! });

    m = l.match(
      /\+\(([\d.-]+)\s+to\s+([\d.-]+)\)%\s+to\s+all\s+maximum\s+elemental\s+resistances\b/i
    );
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ maxAllElementalResBonusFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)%\s+to\s+maximum\s+chaos\s+resistance\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ maxChaosResBonusFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)%\s+to\s+maximum\s+fire\s+resistance\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ maxFireResBonusFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)%\s+to\s+maximum\s+cold\s+resistance\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ maxColdResBonusFromGear: mid });
    }

    m = l.match(/\+\(([\d.-]+)\s+to\s+([\d.-]+)\)%\s+to\s+maximum\s+lightning\s+resistance\b/i);
    if (m) {
      const mid = (Number(m[1]) + Number(m[2])) / 2;
      if (Number.isFinite(mid)) add({ maxLightningResBonusFromGear: mid });
    }

    m = l.match(
      /(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+damage\s+taken\s+is\s+applied\s+to\s+your\s+mana\s+first\b/i
    );
    if (m) add({ damageTakenToManaFirstPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /recover\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+(?:of\s+)?life\s+on\s+kill\b/i
    );
    if (m) add({ lifeRecoveredOnKillPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(/gain\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))\s+life\s+on\s+kill\b/i);
    if (m) add({ flatLifeOnKillFromGear: pctFromParenOrSingle(m) });

    m = l.match(/gain\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))\s+mana\s+on\s+kill\b/i);
    if (m) add({ manaOnKillFlatFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /recover\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+life\s+on\s+block\b/i
    );
    if (m) add({ lifeRecoveredOnBlockPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /recover\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+mana\s+on\s+block\b/i
    );
    if (m) add({ manaRecoveredOnBlockPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /recover\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))%\s+of\s+energy\s+shield\s+on\s+block\b/i
    );
    if (m) add({ esRecoveredOnBlockPercentFromGear: pctFromParenOrSingle(m) });

    m = l.match(/gain\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))\s+mana\s+on\s+block\b/i);
    if (m) add({ flatManaOnBlockFromGear: pctFromParenOrSingle(m) });

    m = l.match(/gain\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))\s+energy\s+shield\s+on\s+block\b/i);
    if (m) add({ flatEsOnBlockFromGear: pctFromParenOrSingle(m) });

    m = l.match(/gain\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))\s+energy\s+shield\s+on\s+hit\b/i);
    if (m) add({ energyShieldOnHitFromGear: pctFromParenOrSingle(m) });

    m = l.match(
      /([\d.]+)%\s+increased\s+ranged\s+attack\s+damage\s+per\s+10\s+strength\b/i
    );
    if (m) add({ rangedDamageIncPctPer10StrFromGear: num(m)! });

    if (/\bmana\s+cost\s+of\s+abilities\s+is\s+paid\s+with\s+life\s+instead\b/i.test(low)) {
      acc.manaCostPaidWithLifeFromGear = true;
      mark()
    }

    m = l.match(/gain\s+(?:\(([\d.]+)\s+to\s+([\d.]+)\)|([\d.]+))\s+life\s+on\s+block\b/i);
    if (m) add({ flatLifeOnBlockFromGear: pctFromParenOrSingle(m) });

    opts?.onLine?.(l, matchedThisLine)
  }

  if (esLessMult !== 1) {
    acc.energyShieldLessMultFromGear = esLessMult;
  }
  if (dotMoreMult !== 1) acc.dotDamageMoreMultFromGear = dotMoreMult;
  if (strikesMoreMult !== 1) acc.strikesMoreMultFromGear = strikesMoreMult;
  if (atkSpdLessMult !== 1) acc.attackSpeedLessMultFromGear = atkSpdLessMult;
  if (accLessMult !== 1) acc.accuracyLessMultFromGear = accLessMult;
  if (castSpdLessMult !== 1) acc.castSpeedLessMultFromGear = castSpdLessMult;
  if (dmgTakenLessMult !== 1) acc.damageTakenLessMultFromGear = dmgTakenLessMult;
  if (dmgTakenMoreMult !== 1) acc.damageTakenMoreMultFromGear = dmgTakenMoreMult;
  if (evaMoreMult !== 1) acc.evasionMoreMultFromGear = evaMoreMult;
  if (dmgDealtLessMult !== 1) acc.damageDealtLessMultFromGear = dmgDealtLessMult;
  if (lifeMoreMult !== 1) acc.lifeMoreMultFromGear = lifeMoreMult;
  if (defencesLessMult !== 1) acc.defencesLessMultFromGear = defencesLessMult;
  if (chillInflictEffectMult !== 1) acc.chillInflictEffectMultFromGear = chillInflictEffectMult;
  if (ailmentDurLessMult !== 1) acc.ailmentDurationLessMultFromGear = ailmentDurLessMult;
  if (igniteDurLessMult !== 1) acc.igniteDurationLessMultFromGear = igniteDurLessMult;

  return acc;
}

// ---------------------------------------------------------------------------
// Additional single-value patterns used by crafted modifier text output
// (called immediately after the main loop to extend the same accumulator)
// ---------------------------------------------------------------------------

/** Extend an existing patch with patterns that crafted modifier text produces. */
export function applyExtraCraftedModPatterns(
  acc: UniqueGearStatPatch,
  texts: string[]
): void {
  const addNum = (key: keyof UniqueGearStatPatch, v: number) => {
    const cur = acc[key];
    (acc as Record<string, number>)[key as string] =
      typeof cur === 'number' ? cur + v : v;
  };

  for (const raw of texts) {
    const l = raw.trim();
    if (!l) continue;
    let m: RegExpMatchArray | null;

    // % increased physical damage → global increased damage
    m = l.match(/^([\d.]+)%\s+increased\s+physical\s+damage\b/i);
    if (m) { addNum('increasedDamageFromGear', Number(m[1])); continue; }

    // Single-value max resistance patterns
    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+fire\s+resistance\b/i);
    if (m) { addNum('maxFireResBonusFromGear', Number(m[1])); continue; }

    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+cold\s+resistance\b/i);
    if (m) { addNum('maxColdResBonusFromGear', Number(m[1])); continue; }

    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+lightning\s+resistance\b/i);
    if (m) { addNum('maxLightningResBonusFromGear', Number(m[1])); continue; }

    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+maximum\s+chaos\s+resistance\b/i);
    if (m) { addNum('maxChaosResBonusFromGear', Number(m[1])); continue; }

    m = l.match(/^\+(\d+(?:\.\d+)?)%\s+to\s+all\s+maximum\s+elemental\s+resistances\b/i);
    if (m) { addNum('maxAllElementalResBonusFromGear', Number(m[1])); continue; }
  }
}
