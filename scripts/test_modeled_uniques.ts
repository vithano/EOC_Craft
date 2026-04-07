import { computeBuildStats, emptyEquipmentModifiers, type BuildConfig } from "../src/data/gameStats";
import { equipmentModifiersFromUniqueTexts } from "../src/data/uniqueGearMods";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function buildWithEqMods(eqMods: ReturnType<typeof emptyEquipmentModifiers>): BuildConfig {
  return {
    upgradeLevels: {},
    equipmentModifiers: eqMods,
    equippedWeaponItemId: null,
    ability: { abilityId: null, abilityLevel: 0, attunementPct: 0 },
  };
}

function main() {
  // Battery Crown: mana costs paid with energy shield
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["Mana cost of abilities is paid with energy shield instead"],
      { isWeapon: false }
    );
    assert(Boolean(patch.manaCostPaidWithEnergyShieldFromGear), `Expected manaCostPaidWithEnergyShieldFromGear true`);
    const eq = emptyEquipmentModifiers();
    eq.manaCostPaidWithEnergyShieldFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(Boolean(stats.manaCostPaidWithEnergyShield), `Expected stats.manaCostPaidWithEnergyShield true`);
  }

  // Voidheart: you have no mana
  {
    const patch = equipmentModifiersFromUniqueTexts(["You have no mana"], { isWeapon: false });
    assert(Boolean(patch.noManaFromGear), `Expected noManaFromGear true`);
    const eq = emptyEquipmentModifiers();
    eq.noManaFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.maxMana === 0, `Expected maxMana=0, got ${stats.maxMana}`);
    assert(stats.manaRegenPerSecond === 0, `Expected manaRegenPerSecond=0, got ${stats.manaRegenPerSecond}`);
    assert(Boolean(stats.noMana), `Expected stats.noMana true`);
  }

  // Font of Aegis: X% of mana regen applies to ES instead
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["50% of mana regeneration per second applies to your energy shield instead"],
      { isWeapon: false }
    );
    assert(
      patch.manaRegenToEnergyShieldPercentFromGear === 50,
      `Expected parsed manaRegenToES=50, got ${patch.manaRegenToEnergyShieldPercentFromGear}`
    );
    const eq = emptyEquipmentModifiers();
    eq.manaRegenToEnergyShieldPercentFromGear = 50;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(
      stats.manaRegenAppliesToEnergyShieldPercent === 50,
      `Expected stats.manaRegenAppliesToEnergyShieldPercent=50, got ${stats.manaRegenAppliesToEnergyShieldPercent}`
    );
  }

  // The Parallax: sacrifice current mana per second
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["sacrifice 25% of your current mana per second"],
      { isWeapon: false }
    );
    assert(
      patch.sacrificeCurrentManaPercentPerSecondFromGear === 25,
      `Expected parsed mana sacrifice=25, got ${patch.sacrificeCurrentManaPercentPerSecondFromGear}`
    );
    const eq = emptyEquipmentModifiers();
    eq.sacrificeCurrentManaPercentPerSecondFromGear = 25;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(
      stats.sacrificeCurrentManaPercentPerSecond === 25,
      `Expected stats.sacrificeCurrentManaPercentPerSecond=25, got ${stats.sacrificeCurrentManaPercentPerSecond}`
    );
  }

  // Adaptive Mail / Crimson Visage: conditional life-based flags
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "Cannot evade while you are above 50% of maximum life",
        "Cannot recover life while above 50% of maximum life",
        "Your armour has no effect while you are below 50% of maximum life",
      ],
      { isWeapon: false }
    );
    assert(Boolean(patch.cannotEvadeWhileAboveHalfLifeFromGear), "Expected cannotEvadeWhileAboveHalfLifeFromGear true");
    assert(Boolean(patch.cannotRecoverLifeWhileAboveHalfLifeFromGear), "Expected cannotRecoverLifeWhileAboveHalfLifeFromGear true");
    assert(Boolean(patch.armourHasNoEffectWhileBelowHalfLifeFromGear), "Expected armourHasNoEffectWhileBelowHalfLifeFromGear true");
    const eq = emptyEquipmentModifiers();
    eq.cannotEvadeWhileAboveHalfLifeFromGear = true;
    eq.cannotRecoverLifeWhileAboveHalfLifeFromGear = true;
    eq.armourHasNoEffectWhileBelowHalfLifeFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(Boolean(stats.cannotEvadeWhileAboveHalfLife), "Expected stats.cannotEvadeWhileAboveHalfLife true");
    assert(Boolean(stats.cannotRecoverLifeWhileAboveHalfLife), "Expected stats.cannotRecoverLifeWhileAboveHalfLife true");
    assert(Boolean(stats.armourHasNoEffectWhileBelowHalfLife), "Expected stats.armourHasNoEffectWhileBelowHalfLife true");
  }

  // Broken Legacy: fixed crit chance = 50%
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["Your critical hit chance is 50%"],
      { isWeapon: false }
    );
    assert(patch.fixedCritChancePercentFromGear === 50, `Expected parsed fixedCrit=50, got ${patch.fixedCritChancePercentFromGear}`);
    const eq = emptyEquipmentModifiers();
    eq.fixedCritChancePercentFromGear = patch.fixedCritChancePercentFromGear ?? 0;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(Math.abs(stats.critChance - 50) < 1e-6, `Expected fixed critChance=50, got ${stats.critChance}`);
  }

  // Heart of the Protector: block doubled
  {
    const patch = equipmentModifiersFromUniqueTexts(["Your chance to block is doubled"], { isWeapon: false });
    assert(patch.blockChanceMultiplierFromGear === 2, `Expected block mult=2, got ${patch.blockChanceMultiplierFromGear}`);
  }

  // Mirror of Deceit: block halved
  {
    const patch = equipmentModifiersFromUniqueTexts(["Your chance to block is halved"], { isWeapon: false });
    assert(patch.blockChanceMultiplierFromGear === 0.5, `Expected block mult=0.5, got ${patch.blockChanceMultiplierFromGear}`);
  }

  // Phantomstep: cannot evade -> evasion rating forced to 0
  {
    const patch = equipmentModifiersFromUniqueTexts(["You cannot evade"], { isWeapon: false });
    assert(Boolean(patch.cannotEvadeFromGear), `Expected cannotEvadeFromGear true`);
    const eq = emptyEquipmentModifiers();
    eq.cannotEvadeFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.evasionRating === 0, `Expected evasionRating=0, got ${stats.evasionRating}`);
  }

  // Crown of Scorn: cannot evade or dodge -> evasion=0 and dodge=0
  {
    const patch = equipmentModifiersFromUniqueTexts(["You cannot evade or dodge"], { isWeapon: false });
    assert(Boolean(patch.cannotEvadeFromGear) && Boolean(patch.cannotDodgeFromGear), `Expected cannotEvade+cannotDodge true`);
    const eq = emptyEquipmentModifiers();
    eq.cannotEvadeFromGear = true;
    eq.cannotDodgeFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.evasionRating === 0, `Expected evasionRating=0, got ${stats.evasionRating}`);
    assert(stats.dodgeChance === 0, `Expected dodgeChance=0, got ${stats.dodgeChance}`);
  }

  // eslint-disable-next-line no-console
  console.log("Modeled uniques tests: OK");
}

main();

