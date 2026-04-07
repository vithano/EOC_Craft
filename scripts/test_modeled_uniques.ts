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

