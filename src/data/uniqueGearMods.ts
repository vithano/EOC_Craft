/** Numeric stats extracted from unique mod text (merged into EquipmentModifiers). */
export interface UniqueGearStatPatch {
  flatLife?: number;
  flatMana?: number;
  flatArmor?: number;
  flatEvasion?: number;
  flatDamageMin?: number;
  flatDamageMax?: number;
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
  pctIncreasedAttackSpeedFromGear?: number;
  doubleDamageChanceFromGear?: number;
  armorIgnoreFromGear?: number;
  pctToAllElementalResFromGear?: number;
  pctChaosResFromGear?: number;
  manaCostReductionFromGear?: number;
  energyShieldLessMultFromGear?: number;
  flatEnergyShieldFromGear?: number;
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

    m = l.match(/([\d.]+)%\s+increased\s+defences\b/i);
    if (m) add({ pctIncreasedArmorFromGear: num(m)!, pctIncreasedEvasionFromGear: num(m)! });

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
      m = l.match(/([\d.-]+)%\s+increased\s+local\s+attack\s+speed\b/i);
      if (m) add({ pctIncreasedAttackSpeedFromGear: num(m)! });

      m = l.match(/([\d.-]+)%\s+reduced\s+local\s+attack\s+speed\b/i);
      if (m) add({ pctIncreasedAttackSpeedFromGear: -Math.abs(num(m)!) });
    }

    m = l.match(/([\d.]+)%\s+increased\s+attack\s+speed\b/i);
    if (m && !/local/i.test(l)) add({ pctIncreasedAttackSpeedFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increased\s+attack\s+and\s+cast\s+speed\b/i);
    if (m) add({ pctIncreasedAttackSpeedFromGear: num(m)! });

    m = l.match(/([\d.]+)%\s+increase\s+attack\s+and\s+cast\s+speed\b/i);
    if (m) add({ pctIncreasedAttackSpeedFromGear: num(m)! });

    if (ctx.isWeapon) {
      m = l.match(/adds\s+([\d.]+)\s+to\s+([\d.]+)\s+local\s+/i);
      if (m) {
        const a = num(m, 1)!;
        const b = num(m, 2)!;
        add({ flatDamageMin: a * 0.5, flatDamageMax: b });
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
  }

  if (esLessMult !== 1) {
    acc.energyShieldLessMultFromGear = esLessMult;
  }

  return acc;
}
