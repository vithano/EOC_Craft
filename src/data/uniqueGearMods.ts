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
    if (m) add({ increasedDamageFromGear: num(m)! });

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

  return acc;
}
