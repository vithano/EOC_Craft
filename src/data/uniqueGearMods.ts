/** Numeric stats extracted from unique mod text (merged into EquipmentModifiers). */
export interface UniqueGearStatPatch {
  flatLife?: number;
  flatMana?: number;
  flatArmor?: number;
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
  pctIncreasedArmorFromGear?: number;
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
  armorIgnoreFromGear?: number;
  pctToAllElementalResFromGear?: number;
  pctChaosResFromGear?: number;
  manaCostReductionFromGear?: number;
  energyShieldLessMultFromGear?: number;
  flatEnergyShieldFromGear?: number;
  /** "X% increased local physical damage" — applies to weapon base damage only. */
  localIncreasedPhysDamagePct?: number;
  /** "X% increased/reduced local attack speed" — applies to weapon base APS only. */
  localIncreasedApsPct?: number;
  /** "X% increased local defences" — applies to armor/shield base defenses only. */
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
}

function num(m: RegExpMatchArray | null, g = 1): number | null {
  if (!m) return null;
  const v = Number(m[g]?.replace(/,/g, ""));
  return Number.isFinite(v) ? v : null;
}

/**
 * Best-effort mapping of resolved unique mod text (innate + rolled lines) into planner stats.
 * Many conditional or build-specific mods are intentionally ignored.
 */
export function equipmentModifiersFromUniqueTexts(
  texts: string[],
  ctx: { isWeapon: boolean }
): UniqueGearStatPatch {
  const acc: UniqueGearStatPatch = {};
  let esLessMult = 1;
  let dotMoreMult = 1;
  let strikesMoreMult = 1;
  let atkSpdLessMult = 1;
  let accLessMult = 1;

  const add = (patch: UniqueGearStatPatch) => {
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
    const l = raw.trim();
    if (!l) continue;

    let m: RegExpMatchArray | null;

    const low = l.toLowerCase();
    if (/\byour\s+hits\s+cannot\s+be\s+evaded\b/i.test(l)) acc.hitsCannotBeEvadedFromGear = true;
    if (/\byou\s+cannot\s+deal\s+critical\s+hits\b/i.test(low)) acc.cannotDealCriticalStrikesFromGear = true;

    m = l.match(/gain\s+(\d+)\s+life\s+on\s+hit\b/i);
    if (m) add({ lifeOnHitFromGear: num(m)! });

    m = l.match(/lose\s+(\d+)\s+life\s+on\s+hit\b/i);
    if (m) add({ lifeOnHitFromGear: -num(m)! });

    m = l.match(
      /leech\s+([\d.]+)%\s+of\s+physical\s+hit\s+damage\s+from\s+attacks\s+as\s+life\b/i
    );
    if (m) add({ lifeLeechFromPhysicalHitPercentFromGear: num(m)! });

    m = l.match(/leech\s+([\d.]+)%\s+of\s+hit\s+damage\s+from\s+attacks\s+as\s+life\b/i);
    if (m) add({ lifeLeechFromHitDamagePercentFromGear: num(m)! });

    m = l.match(/convert\s+([\d.]+)%\s+of\s+your\s+physical\s+damage\s+to\s+fire\s+damage\b/i);
    if (m) add({ physicalConvertedToFirePctFromGear: num(m)! });

    m = l.match(/convert\s+([\d.]+)%\s+of\s+your\s+physical\s+damage\s+to\s+cold\s+damage\b/i);
    if (m) add({ physicalConvertedToColdPctFromGear: num(m)! });

    m = l.match(
      /convert\s+([\d.]+)%\s+of\s+your\s+physical\s+damage\s+to\s+(lightning|lighting)\s+damage\b/i
    );
    if (m) add({ physicalConvertedToLightningPctFromGear: num(m)! });

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
    if (m) dotMoreMult *= 1 + num(m)! / 100;

    m = l.match(/([\d.]+)%\s+more\s+ignite\s+damage\b/i);
    if (m) dotMoreMult *= 1 + num(m)! / 100;

    m = l.match(/([\d.]+)%\s+more\s+hits?\s+per\s+attack\b/i);
    if (m) strikesMoreMult *= 1 + num(m)! / 100;

    m = l.match(/([\d.]+)%\s+less\s+attack\s+and\s+cast\s+speed\b/i);
    if (m) atkSpdLessMult *= Math.max(0.05, 1 - num(m)! / 100);

    m = l.match(/([\d.]+)%\s+less\s+attack\s+speed\b/i);
    if (m) atkSpdLessMult *= Math.max(0.05, 1 - num(m)! / 100);

    m = l.match(/([\d.]+)%\s+less\s+accuracy\s+rating\b/i);
    if (m) accLessMult *= Math.max(0.05, 1 - num(m)! / 100);

    m = l.match(/([\d.]+)%\s+increased\s+critical\s+hit\s+chance\b/i);
    if (m) add({ pctIncreasedCriticalHitChanceFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+elemental\s+damage\b/i);
    if (m) add({ increasedElementalDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)\s+increased\s+elemental\s+damage\b/i);
    if (m && !/%/.test(l)) add({ increasedElementalDamageFromGear: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+maximum\s+life\b/i);
    if (m) add({ flatLife: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+maximum\s+mana\b/i);
    if (m) add({ flatMana: num(m)! });

    m = l.match(/\+(\d+)\s+to\s+armor\b/i);
    if (m) add({ flatArmor: num(m)! });

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

    m = l.match(/([\d.]+)%\s+increased\s+armor\b/i);
    if (m) add({ pctIncreasedArmorFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+evasion\s+rating\b/i);
    if (m) add({ pctIncreasedEvasionFromGear: num(m)! });

    // "increased defences" (global, no "local") — applies % globally to all armor/evasion
    m = l.match(/([\d.]+)%\s+increased\s+defences\b/i);
    if (m && !/local/i.test(l)) add({ pctIncreasedArmorFromGear: num(m)!, pctIncreasedEvasionFromGear: num(m)! });

    // "increased local defences" — stored separately; applied to the item's own base in aggregation
    m = l.match(/([\d.]+)%\s+increased\s+local\s+defences?\b/i);
    if (m) add({ localIncreasedDefencesPct: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+energy\s+shield\b/i);
    if (m) add({ pctIncreasedEnergyShieldFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+melee\s+physical\s+damage\b/i);
    if (m) add({ increasedMeleeDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+attack\s+damage\b/i);
    if (m) add({ increasedAttackDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+damage\b/i);
    if (m && !/elemental/i.test(l)) add({ increasedDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+spell\s+damage\b/i);
    if (m) add({ increasedSpellDamageFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+accuracy\s+rating\b/i);
    if (m) add({ pctIncreasedAccuracyFromGear: num(m)! });

    if (ctx.isWeapon) {
      // Local attack speed — stored separately; applied to weapon base APS in aggregation
      m = l.match(/([\d.-]+)%\s+increased\s+local\s+attack\s+speed\b/i);
      if (m) add({ localIncreasedApsPct: num(m)! });

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

      m = l.match(/\+\s*([\d.]+)%\s+local\s+base\s+critical\s+hit\s+chance\b/i);
      if (m) add({ critChanceBonus: num(m)! });
    }

    m = l.match(/\+(\d+)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+attacks\b/i);
    if (m) add({ doubleDamageChanceFromGear: num(m)! });

    m = l.match(/(\d+)%\s+chance\s+to\s+deal\s+double\s+damage\s+with\s+attacks\b/i);
    if (m) add({ doubleDamageChanceFromGear: num(m)! });

    m = l.match(/ignore\s+(\d+)%\s+of\s+enemy\s+armor\b/i);
    if (m) add({ armorIgnoreFromGear: num(m)! });

    m = l.match(/hits\s+penetrate\s+(\d+)%\s+of\s+(lightning|lighting)\s+resistance/i);
    if (m) add({ lightningPenetrationFromGear: num(m)! });

    m = l.match(/hits\s+ignore\s+(\d+)%\s+of\s+enemy\s+armor\b/i);
    if (m) add({ armorIgnoreFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+to\s+all\s+elemental\s+resistances\b/i);
    if (m) add({ pctToAllElementalResFromGear: num(m)! });

    m = l.match(/\+\s*\(?([\d.-]+)\)?%?\s+to\s+chaos\s+resistance\b/i);
    if (m) add({ pctChaosResFromGear: num(m)! });

    m = l.match(/\(?([\d.-]+)\)?%?\s+to\s+chaos\s+resistance\b/i);
    if (m && !l.toLowerCase().includes("per")) add({ pctChaosResFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+reduced\s+mana\s+cost\s+of\s+abilities\b/i);
    if (m) add({ manaCostReductionFromGear: Math.abs(num(m)!) });

    m = l.match(
      /([\d.]+)%\s+increased\s+strikes\s+per\s+attack\s+with\s+strike\s+abilities\s+per\s+10\s+dexterity\b/i
    );
    if (m) add({ strikesIncPctPer10Dex: num(m)! });

    if (ctx.isWeapon) {
      m = l.match(/\+(\d+)\s+strikes\s+per\s+attack\b/i);
      if (m) add({ flatStrikesPerAttack: num(m)! });
      m = l.match(/\+(\d+)\s+strike\s+per\s+attack\b/i);
      if (m) add({ flatStrikesPerAttack: num(m)! });
    }

    m = l.match(/([\d.]+)%\s+increased\s+strikes\s+per\s+attack\b/i);
    if (m && !/per\s+10\s+dexterity/i.test(l)) add({ increasedStrikesPerAttack: num(m)! });

    m = l.match(/\(?([\d.-]+)\)?%?\s+less\s+energy\s+shield\b/i);
    if (m) {
      const v = Math.abs(num(m)!);
      if (v > 0) esLessMult *= 1 - v / 100;
    }

    m = l.match(/\+(\d+)\s+to\s+energy\s+shield\b/i);
    if (m) add({ flatEnergyShieldFromGear: num(m)! });

    // Block chance — flat bonus from any item slot
    m = l.match(/\+\s*([\d.]+)%\s+(?:chance\s+to\s+block|to\s+block)\b/i);
    if (m) add({ flatBlockChanceFromGear: num(m)! });

    m = l.match(/\+([\d.]+)%\s+to\s+block\b/i);
    if (m) add({ flatBlockChanceFromGear: num(m)! });

    // "X% increased local block chance" — stored separately; multiplied against shield base in aggregation
    m = l.match(/([\d.]+)%\s+increased\s+local\s+block\s+chance\b/i);
    if (m) add({ localIncreasedBlockPct: num(m)! });
  }

  if (esLessMult !== 1) {
    acc.energyShieldLessMultFromGear = esLessMult;
  }
  if (dotMoreMult !== 1) acc.dotDamageMoreMultFromGear = dotMoreMult;
  if (strikesMoreMult !== 1) acc.strikesMoreMultFromGear = strikesMoreMult;
  if (atkSpdLessMult !== 1) acc.attackSpeedLessMultFromGear = atkSpdLessMult;
  if (accLessMult !== 1) acc.accuracyLessMultFromGear = accLessMult;

  return acc;
}
