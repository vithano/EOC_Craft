import { computeBuildStats, emptyEquipmentModifiers, type BuildConfig } from "../src/data/gameStats";
import { equipmentModifiersFromUniqueTexts } from "../src/data/uniqueGearMods";
import { simulateEncounter } from "../src/battle/engine";
import { parseAbilityLineEffects, updateAbilityDefinitions } from "../src/data/eocAbilities";
import { computeArmourDR, computeNonDamagingAilmentEffectPercent } from "../src/data/eocFormulas";
import { getCrucibleTierRow } from "../src/data/nexusEnemyScaling";
import { GAME_CLASSES } from "../src/data/gameClasses";
import { parseClassBonusEffects } from "../src/data/classBonusEffects";
import abilitiesJson from "../src/data/eocAbilities.generated.json";
import { aggregateEquippedToEquipmentModifiers } from "../src/data/gameStats";
import { updateUniqueDefinitions } from "../src/data/eocUniques";
import uniquesJson from "../src/data/eocUniques.generated.json";

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
  // Tests rely on ability lookups; populate from generated snapshot.
  updateAbilityDefinitions(abilitiesJson as any);
  updateUniqueDefinitions(uniquesJson as any);

  // Abilities(1.3.2).csv: every ability line should be recognized by the parser.
  {
    for (const def of abilitiesJson as any[]) {
      const fx = parseAbilityLineEffects(def as any);
      const unknown = (fx as any).__unknownLines as string[] | undefined;
      assert(!unknown || unknown.length === 0, `Unrecognized ability lines for ${def.id} (${def.name}): ${unknown?.join(" | ")}`);
    }
  }

  // Classes: every class bonus clause should be recognized by the parser.
  {
    for (const cls of GAME_CLASSES as any[]) {
      const fx = parseClassBonusEffects(String(cls.classBonusDescription ?? ""));
      const unknown = (fx as any).__unknownClauses as string[] | undefined;
      assert(!unknown || unknown.length === 0, `Unrecognized class bonus clauses for ${cls.id} (${cls.name}): ${unknown?.join(" | ")}`);
    }
  }

  // formulas.csv: armour DR is split by damage types (computeArmourDR total-hit split).
  {
    const armour = 1000;
    const phys = 200;
    const fire = 200;
    const total = phys + fire;
    const drPhysSplit = computeArmourDR(armour, phys, total, "physical", 0);
    const drPhysSingle = computeArmourDR(armour, phys, phys, "physical", 0);
    assert(drPhysSplit < drPhysSingle, `Expected split DR < single-type DR (phys). Got split=${drPhysSplit}, single=${drPhysSingle}`);
  }

  // formulas.csv: non-damaging ailments are rounded to 2 decimals and discarded < 0.01.
  {
    const dmg = 0.000001;
    const eff = computeNonDamagingAilmentEffectPercent(dmg, 1000, 0, 1, 1, 1);
    assert(eff < 0.01, `Expected tiny ailment effect <0.01, got ${eff}`);
  }

  // formulas.csv: crucible scaling is nexus scaling split into 5 steps.
  {
    const c5 = getCrucibleTierRow(5);
    const c10 = getCrucibleTierRow(10);
    assert(Boolean(c5 && c10), "Expected crucible rows");
    assert((c10!.health ?? 0) > (c5!.health ?? 0), "Expected crucible tier 10 > tier 5 health");
  }

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

  // The Melding / Venofrenzy / Wintermarch: self-ailment state mechanics
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "Poison you inflict is reflected to you",
        "Elemental Ailments you inflict are reflected to you",
        "1% more speed per poison on you",
        "1% more speed per 1% effect of shock applied to you",
        "Regenerate 5% of maximum life per second while you are ignited",
        "You are unaffected by chill",
      ],
      { isWeapon: false }
    );
    assert(Boolean(patch.poisonYouInflictReflectedToYouFromGear), "Expected poison reflect flag");
    assert(Boolean(patch.elementalAilmentsYouInflictReflectedToYouFromGear), "Expected elemental reflect flag");
    assert(patch.moreSpeedPerPoisonOnYouPercentFromGear === 1, `Expected moreSpeedPerPoison=1, got ${patch.moreSpeedPerPoisonOnYouPercentFromGear}`);
    assert(
      Math.abs((patch.moreSpeedPerShockEffectOnYouPerPctFromGear ?? 0) - 1) < 1e-9,
      `Expected moreSpeedPerShockEffectOnYouPerPct=1, got ${patch.moreSpeedPerShockEffectOnYouPerPctFromGear}`
    );
    assert(
      patch.lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear === 5,
      `Expected ignited regen=5, got ${patch.lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear}`
    );
    assert(Boolean(patch.unaffectedByChillFromGear), "Expected unaffectedByChillFromGear true");

    const eq = emptyEquipmentModifiers();
    eq.poisonYouInflictReflectedToYouFromGear = true;
    eq.elementalAilmentsYouInflictReflectedToYouFromGear = true;
    eq.moreSpeedPerPoisonOnYouPercentFromGear = 1;
    eq.moreSpeedPerShockEffectOnYouPerPctFromGear = 1;
    eq.lifeRegenPercentOfMaxPerSecondWhileIgnitedFromGear = 5;
    eq.unaffectedByChillFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(Boolean(stats.poisonYouInflictReflectedToYou), "Expected stats poisonYouInflictReflectedToYou true");
    assert(Boolean(stats.elementalAilmentsYouInflictReflectedToYou), "Expected stats elementalAilmentsYouInflictReflectedToYou true");
    assert(stats.moreSpeedPerPoisonOnYouPercent === 1, `Expected stats.moreSpeedPerPoisonOnYouPercent=1, got ${stats.moreSpeedPerPoisonOnYouPercent}`);
    assert(Math.abs(stats.moreSpeedPerShockEffectOnYouPerPct - 1) < 1e-9, `Expected stats.moreSpeedPerShockEffectOnYouPerPct=1, got ${stats.moreSpeedPerShockEffectOnYouPerPct}`);
    assert(stats.lifeRegenPercentOfMaxPerSecondWhileIgnited === 5, `Expected stats.lifeRegenWhileIgnited=5, got ${stats.lifeRegenPercentOfMaxPerSecondWhileIgnited}`);
    assert(Boolean(stats.unaffectedByChill), "Expected stats.unaffectedByChill true");
  }

  // Prowlsight / The Parallax: attack-time accuracy + current-mana speed scaling + mana on kill %
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "10% more accuracy rating per 0.1 seconds of attack time",
        "1% more attack and cast speed per 50 current mana",
        "Recover 7% of mana on kill",
      ],
      { isWeapon: false }
    );
    assert(
      Math.abs((patch.moreAccuracyRatingPer0_1sAttackTimePctFromGear ?? 0) - 10) < 1e-9,
      `Expected moreAccPer0.1s=10, got ${patch.moreAccuracyRatingPer0_1sAttackTimePctFromGear}`
    );
    assert(
      Math.abs((patch.moreAttackAndCastSpeedPer50CurrentManaPctFromGear ?? 0) - 1) < 1e-9,
      `Expected moreAtkCastPer50Mana=1, got ${patch.moreAttackAndCastSpeedPer50CurrentManaPctFromGear}`
    );
    assert(
      patch.manaRecoveredOnKillPercentFromGear === 7,
      `Expected manaRecoveredOnKillPercentFromGear=7, got ${patch.manaRecoveredOnKillPercentFromGear}`
    );

    const eq = emptyEquipmentModifiers();
    eq.moreAccuracyRatingPer0_1sAttackTimePctFromGear = 10;
    eq.moreAttackAndCastSpeedPer50CurrentManaPctFromGear = 1;
    eq.manaRecoveredOnKillPercentFromGear = 7;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(
      Math.abs(stats.moreAccuracyRatingPer0_1sAttackTimePct - 10) < 1e-9,
      `Expected stats.moreAccuracyRatingPer0_1sAttackTimePct=10, got ${stats.moreAccuracyRatingPer0_1sAttackTimePct}`
    );
    assert(
      Math.abs(stats.moreAttackAndCastSpeedPer50CurrentManaPct - 1) < 1e-9,
      `Expected stats.moreAttackAndCastSpeedPer50CurrentManaPct=1, got ${stats.moreAttackAndCastSpeedPer50CurrentManaPct}`
    );
    assert(
      stats.manaRecoveredOnKillPercent === 7,
      `Expected stats.manaRecoveredOnKillPercent=7, got ${stats.manaRecoveredOnKillPercent}`
    );
  }

  // Venofrenzy / Aspirant's Will: poison taken less + level-scaled flat regen
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "Take 90% less poison damage",
        "regenerate 1 life per second per character level",
      ],
      { isWeapon: false }
    );
    assert(
      patch.poisonDamageTakenLessPercentFromGear === 90,
      `Expected poisonDamageTakenLess=90, got ${patch.poisonDamageTakenLessPercentFromGear}`
    );
    assert(
      patch.flatLifeRegenPerSecondPerCharacterLevelFromGear === 1,
      `Expected flatLifeRegenPerLevel=1, got ${patch.flatLifeRegenPerSecondPerCharacterLevelFromGear}`
    );

    const eq = emptyEquipmentModifiers();
    eq.poisonDamageTakenLessPercentFromGear = 90;
    eq.flatLifeRegenPerSecondPerCharacterLevelFromGear = 1;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(
      stats.poisonDamageTakenLessPercent === 90,
      `Expected stats.poisonDamageTakenLessPercent=90, got ${stats.poisonDamageTakenLessPercent}`
    );
    assert(
      stats.flatLifeRegenPerSecond > 0,
      `Expected stats.flatLifeRegenPerSecond > 0, got ${stats.flatLifeRegenPerSecond}`
    );
  }

  // Carnage Pact / Hollow Revenant: flat self-DoT lines
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "lose 200 life per second",
        "take 1.000 chaos damage per second",
      ],
      { isWeapon: false }
    );
    assert(patch.loseLifePerSecondFromGear === 200, `Expected loseLifePerSecond=200, got ${patch.loseLifePerSecondFromGear}`);
    assert(patch.takeChaosDamagePerSecondFromGear === 1, `Expected takeChaosDamagePerSecond=1, got ${patch.takeChaosDamagePerSecondFromGear}`);

    const eq = emptyEquipmentModifiers();
    eq.loseLifePerSecondFromGear = 200;
    eq.takeChaosDamagePerSecondFromGear = 1;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.loseLifePerSecond === 200, `Expected stats.loseLifePerSecond=200, got ${stats.loseLifePerSecond}`);
    assert(stats.takeChaosDamagePerSecond === 1, `Expected stats.takeChaosDamagePerSecond=1, got ${stats.takeChaosDamagePerSecond}`);
  }

  // Hemophage / Ironstance / Lightshroud / Dusk and Dawn: conversions and hard overrides
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "50% of your dexterity and intelligence is converted to strength",
        "Your total evasion rating is converted into armour",
        "Your energy shield cannot be reduced below its maximum by damage taken",
        "counts as dual-wielding",
      ],
      { isWeapon: false }
    );
    assert(patch.pctDexIntConvertedToStrFromGear === 50, `Expected pctDexIntConvertedToStr=50, got ${patch.pctDexIntConvertedToStrFromGear}`);
    assert(Boolean(patch.convertEvasionToArmourFromGear), "Expected convertEvasionToArmourFromGear true");
    assert(Boolean(patch.energyShieldCannotBeReducedBelowMaximumFromGear), "Expected energyShieldCannotBeReducedBelowMaximumFromGear true");
    assert(Boolean(patch.countsAsDualWieldingFromGear), "Expected countsAsDualWieldingFromGear true");

    const eq = emptyEquipmentModifiers();
    eq.pctDexIntConvertedToStrFromGear = 50;
    eq.convertEvasionToArmourFromGear = true;
    eq.energyShieldCannotBeReducedBelowMaximumFromGear = true;
    eq.countsAsDualWieldingFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.pctDexIntConvertedToStr === 50, `Expected stats.pctDexIntConvertedToStr=50, got ${stats.pctDexIntConvertedToStr}`);
    assert(Boolean(stats.convertEvasionToArmour), "Expected stats.convertEvasionToArmour true");
    assert(Boolean(stats.energyShieldCannotBeReducedBelowMaximum), "Expected stats.energyShieldCannotBeReducedBelowMaximum true");
    assert(Boolean(stats.countsAsDualWielding), "Expected stats.countsAsDualWielding true");
  }

  // Ironstance: evasion→armour conversion should occur before armour multipliers
  {
    const mk = (p: Partial<ReturnType<typeof emptyEquipmentModifiers>>) => {
      const eq = emptyEquipmentModifiers();
      Object.assign(eq, p);
      return computeBuildStats(buildWithEqMods(eq));
    };

    // Keep other factors stable; add a clear armour "increased" signal.
    const incArmour = 100;
    const flatStep = 1000;

    // Avoid coupling this test to global defences multipliers.
    const base = mk({ pctIncreasedArmourFromGear: incArmour, defencesLessMultFromGear: 1 });

    // Evasion baseline (no conversion): measure the "total evasion rating" that should convert.
    const evNoConv = mk({ pctIncreasedArmourFromGear: incArmour, defencesLessMultFromGear: 1, flatEvasion: flatStep });
    assert(evNoConv.evasionRating > 0, `Expected evasionRating > 0 without conversion; got ${evNoConv.evasionRating}`);

    // With conversion, evasion should be 0 and armour should increase by the converted total evasion rating.
    const evConv = mk({
      pctIncreasedArmourFromGear: incArmour,
      defencesLessMultFromGear: 1,
      flatEvasion: flatStep,
      convertEvasionToArmourFromGear: true,
    });
    assert(evConv.evasionRating === 0, `Expected evasionRating=0 with conversion; got ${evConv.evasionRating}`);

    const expectedDelta = evNoConv.evasionRating;
    const actualDelta = evConv.armour - base.armour;
    assert(
      Math.abs(actualDelta - expectedDelta) <= 2,
      `Expected conversion delta≈${expectedDelta.toFixed(2)} (total evasion), got ${actualDelta}`
    );

    // Global defences "less" should NOT be applied twice to the converted value.
    const defLess = 0.5;
    const base2 = mk({ defencesLessMultFromGear: defLess });
    const evNoConv2 = mk({ defencesLessMultFromGear: defLess, flatEvasion: flatStep });
    const evConv2 = mk({ defencesLessMultFromGear: defLess, flatEvasion: flatStep, convertEvasionToArmourFromGear: true });
    assert(evConv2.evasionRating === 0, `Expected evasionRating=0 with conversion under defencesLess; got ${evConv2.evasionRating}`);
    // Since both evasion and armour are reduced by defLess once, conversion should contribute ~evNoConv2.evasionRating (not half again).
    const actualDelta2 = evConv2.armour - base2.armour;
    assert(
      Math.abs(actualDelta2 - evNoConv2.evasionRating) <= 25,
      `Expected conversion delta≈${evNoConv2.evasionRating} under defencesLess, got ${actualDelta2}`
    );
  }

  // Mind Bulwark / Tide of Corruption / Soulthirst: mana→armour and leech-to-ES flags
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "Gain armour equal to 40% of maximum mana",
        "Leech 6% of hit damage from spells as energy shield",
        "Life leech effects apply to your energy shield instead",
        "Excess recovery from life leech is applied to your energy shield instead",
      ],
      { isWeapon: false }
    );
    assert(patch.armourEqualToPercentOfMaxManaFromGear === 40, `Expected armourEqualToPercentOfMaxMana=40, got ${patch.armourEqualToPercentOfMaxManaFromGear}`);
    assert(patch.spellHitDamageLeechedAsEnergyShieldPercentFromGear === 6, `Expected spellESLeech=6, got ${patch.spellHitDamageLeechedAsEnergyShieldPercentFromGear}`);
    assert(Boolean(patch.lifeLeechAppliesToEnergyShieldFromGear), "Expected lifeLeechAppliesToEnergyShieldFromGear true");
    assert(Boolean(patch.excessLifeLeechRecoveryToEnergyShieldFromGear), "Expected excessLifeLeechRecoveryToEnergyShieldFromGear true");

    const eq = emptyEquipmentModifiers();
    eq.armourEqualToPercentOfMaxManaFromGear = 40;
    eq.spellHitDamageLeechedAsEnergyShieldPercentFromGear = 6;
    eq.lifeLeechAppliesToEnergyShieldFromGear = true;
    eq.excessLifeLeechRecoveryToEnergyShieldFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.armourEqualToPercentOfMaxMana === 40, `Expected stats.armourEqualToPercentOfMaxMana=40, got ${stats.armourEqualToPercentOfMaxMana}`);
    assert(stats.spellHitDamageLeechedAsEnergyShieldPercent === 6, `Expected stats.spellHitDamageLeechedAsEnergyShieldPercent=6, got ${stats.spellHitDamageLeechedAsEnergyShieldPercent}`);
    assert(Boolean(stats.lifeLeechAppliesToEnergyShield), "Expected stats.lifeLeechAppliesToEnergyShield true");
    assert(Boolean(stats.excessLifeLeechRecoveryToEnergyShield), "Expected stats.excessLifeLeechRecoveryToEnergyShield true");
  }

  // Siegebreaker: dual-wield stacks counter-attack conversion (50% + 50% = 100%)
  {
    const eq = aggregateEquippedToEquipmentModifiers(
      ["Weapon", "Off-hand"],
      (slot) => {
        if (slot === "Weapon") return { itemId: "unique_siegebreaker", rolls: [10, 10], enhancement: 0 };
        if (slot === "Off-hand") return { itemId: "unique_siegebreaker", rolls: [10, 10], enhancement: 0 };
        return { itemId: "none" };
      }
    );
    assert(Boolean(eq.counterAttackOnBlockFromGear), "Expected counterAttackOnBlockFromGear true from Siegebreaker");
    assert(
      eq.counterAttackFirePctOfPreventedFromGear === 100,
      `Expected stacked counterAttackFirePctOfPreventedFromGear=100, got ${eq.counterAttackFirePctOfPreventedFromGear}`
    );
  }

  // Armour effectiveness vs chaos damage is NOT chaos resistance
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["+50% to armour effectiveness against chaos damage"],
      { isWeapon: false }
    );
    assert(
      patch.armourEffectivenessVsChaosFromGear === 0.5,
      `Expected armourEffectivenessVsChaosFromGear=0.5, got ${patch.armourEffectivenessVsChaosFromGear}`
    );
    assert(
      patch.pctChaosResFromGear === undefined,
      `Expected armour effectiveness line to NOT set pctChaosResFromGear, got ${patch.pctChaosResFromGear}`
    );

    const base = computeBuildStats(buildWithEqMods(emptyEquipmentModifiers()));
    const eq = emptyEquipmentModifiers();
    eq.armourEffectivenessVsChaosFromGear = 0.5;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.chaosRes === base.chaosRes, `Expected chaosRes unchanged, got ${stats.chaosRes} vs ${base.chaosRes}`);
    assert(stats.armourVsChaosMultiplier > base.armourVsChaosMultiplier, "Expected armourVsChaosMultiplier increased");
  }

  // Resistances: "to all elemental resistances" does NOT affect chaos resistance
  {
    const base = computeBuildStats(buildWithEqMods(emptyEquipmentModifiers()));
    const eq = emptyEquipmentModifiers();
    eq.pctToAllElementalResFromGear = 12;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.fireRes === base.fireRes + 12, `Expected +12 fireRes, got ${stats.fireRes} vs ${base.fireRes}`);
    assert(stats.coldRes === base.coldRes + 12, `Expected +12 coldRes, got ${stats.coldRes} vs ${base.coldRes}`);
    assert(
      stats.lightningRes === base.lightningRes + 12,
      `Expected +12 lightningRes, got ${stats.lightningRes} vs ${base.lightningRes}`
    );
    assert(stats.chaosRes === base.chaosRes, `Expected chaosRes unchanged, got ${stats.chaosRes} vs ${base.chaosRes}`);
  }

  // Resistances: "to all resistances" DOES affect chaos resistance
  {
    const base = computeBuildStats(buildWithEqMods(emptyEquipmentModifiers()));
    const eq = emptyEquipmentModifiers();
    eq.pctToAllResistancesFromGear = 7;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.fireRes === base.fireRes + 7, `Expected +7 fireRes, got ${stats.fireRes} vs ${base.fireRes}`);
    assert(stats.coldRes === base.coldRes + 7, `Expected +7 coldRes, got ${stats.coldRes} vs ${base.coldRes}`);
    assert(
      stats.lightningRes === base.lightningRes + 7,
      `Expected +7 lightningRes, got ${stats.lightningRes} vs ${base.lightningRes}`
    );
    assert(stats.chaosRes === base.chaosRes + 7, `Expected +7 chaosRes, got ${stats.chaosRes} vs ${base.chaosRes}`);
  }

  // Gilden Apex-style chaos res line should not double-apply (was matching twice)
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["+(30)% to chaos resistance", "+30% to all elemental resistances"],
      { isWeapon: false }
    );
    assert(patch.pctChaosResFromGear === 30, `Expected pctChaosResFromGear=30, got ${patch.pctChaosResFromGear}`);
    assert(
      patch.pctToAllElementalResFromGear === 30,
      `Expected pctToAllElementalResFromGear=30, got ${patch.pctToAllElementalResFromGear}`
    );
  }

  // Divinarius: increased recovery from all sources
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["40% increased recovery from all sources"],
      { isWeapon: false }
    );
    assert(
      patch.pctIncreasedRecoveryFromAllSourcesFromGear === 40,
      `Expected pctIncreasedRecoveryFromAllSources=40, got ${patch.pctIncreasedRecoveryFromAllSourcesFromGear}`
    );
    const eq = emptyEquipmentModifiers();
    eq.pctIncreasedRecoveryFromAllSourcesFromGear = 40;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(
      Math.abs(stats.recoveryRateMult - 1.4) < 1e-9,
      `Expected stats.recoveryRateMult=1.4, got ${stats.recoveryRateMult}`
    );
  }

  // Woe Touch / Flashfire: less ailment duration + less ignite duration
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["40% less ailment duration", "75% less ignite duration"],
      { isWeapon: false }
    );
    assert(
      Math.abs((patch.ailmentDurationLessMultFromGear ?? 1) - 0.6) < 1e-9,
      `Expected ailmentDurationLessMultFromGear=0.6, got ${patch.ailmentDurationLessMultFromGear}`
    );
    assert(
      Math.abs((patch.igniteDurationLessMultFromGear ?? 1) - 0.25) < 1e-9,
      `Expected igniteDurationLessMultFromGear=0.25, got ${patch.igniteDurationLessMultFromGear}`
    );
  }

  // Leyweve / Solemn Oath: crit multi per accuracy + armour per intelligence
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["+1% to critical damage multiplier per 20 accuracy rating", "+16 armour per 10 intelligence"],
      { isWeapon: false }
    );
    assert(
      patch.critMultiPctPer20AccuracyFromGear === 1,
      `Expected critMultiPctPer20AccuracyFromGear=1, got ${patch.critMultiPctPer20AccuracyFromGear}`
    );
    assert(
      patch.armourPer10IntFromGear === 16,
      `Expected armourPer10IntFromGear=16, got ${patch.armourPer10IntFromGear}`
    );

    const baseEq = emptyEquipmentModifiers();
    baseEq.flatAccuracy = 2000;
    baseEq.intBonus = 100; // 100 Int → (100/10)*16 = 160 flat armour
    const baseStats = computeBuildStats(buildWithEqMods(baseEq));

    const eq = emptyEquipmentModifiers();
    eq.flatAccuracy = 2000;
    eq.intBonus = 100;
    eq.critMultiPctPer20AccuracyFromGear = 1;
    eq.armourPer10IntFromGear = 16;
    const stats = computeBuildStats(buildWithEqMods(eq));

    const armourBreak = (stats as any).statBreakdowns?.armour;
    const armourLine = armourBreak?.lines?.find?.((l: any) => l?.label === 'Gear: armour per 10 Int (flat)');
    const expectedArmourFromInt = Math.round((stats.int / 10) * 16);
    assert(
      armourLine?.value === expectedArmourFromInt,
      `Expected armour breakdown line value=${expectedArmourFromInt}, got ${armourLine?.value}`
    );
    // +1% per 20 accuracy, with ~ (base + 2000) accuracy. Use a delta assertion vs baseline to avoid base constant coupling.
    assert(stats.critMultiplier > baseStats.critMultiplier, `Expected critMultiplier increased, got ${stats.critMultiplier} vs ${baseStats.critMultiplier}`);
  }

  // Adorned Lineage: "X increased defences" (implicit % sign)
  {
    const patch = equipmentModifiersFromUniqueTexts(["40 increased defences"], { isWeapon: false });
    assert(patch.pctIncreasedArmourFromGear === 40, `Expected pctIncreasedArmourFromGear=40, got ${patch.pctIncreasedArmourFromGear}`);
    assert(patch.pctIncreasedEvasionFromGear === 40, `Expected pctIncreasedEvasionFromGear=40, got ${patch.pctIncreasedEvasionFromGear}`);
    assert(
      patch.pctIncreasedEnergyShieldFromGear === 40,
      `Expected pctIncreasedEnergyShieldFromGear=40, got ${patch.pctIncreasedEnergyShieldFromGear}`
    );
  }

  // Mother's Embrace / Primordial Aegis: chance to avoid ailments (affects reflected self-ailments in sim)
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["+50% chance to avoid ailments", "+100% chance to avoid elemental ailments"],
      { isWeapon: false }
    );
    assert(patch.avoidAilmentsChanceFromGear === 50, `Expected avoidAilmentsChanceFromGear=50, got ${patch.avoidAilmentsChanceFromGear}`);
    assert(
      patch.avoidElementalAilmentsChanceFromGear === 100,
      `Expected avoidElementalAilmentsChanceFromGear=100, got ${patch.avoidElementalAilmentsChanceFromGear}`
    );

    const eq = emptyEquipmentModifiers();
    eq.poisonInflictChanceFromGear = 100;
    eq.poisonYouInflictReflectedToYouFromGear = true;
    eq.avoidAilmentsChanceFromGear = 100;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.avoidAilmentsChance === 100, `Expected stats.avoidAilmentsChance=100, got ${stats.avoidAilmentsChance}`);

    const enemy = {
      id: "dummy",
      name: "Dummy",
      maxLife: 1_000_000,
      armour: 0,
      evasionRating: 0,
      accuracy: 0,
      damageMin: 0,
      damageMax: 0,
      aps: 0.01,
    };
    const res = simulateEncounter({ stats, enemy, options: { maxDurationSeconds: 1.0, dt: 0.02, maxLogEntries: 0 } });
    assert(res.playerFinal.life === stats.maxLife, `Expected no self-poison damage taken, got life=${res.playerFinal.life}/${stats.maxLife}`);
  }

  // Action bar: start-at, set-to-after-cast, fill-on-block
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "After you cast a spell, your action bar is set to 50%",
        "Your action bar is filled by 40% when you block",
        "While your off-hand is empty, your action bar is set to 100% at the begninning of an encounter",
      ],
      { isWeapon: false }
    );
    assert(
      patch.actionBarSetToPercentAfterCastFromGear === 50,
      `Expected actionBarSetToPercentAfterCastFromGear=50, got ${patch.actionBarSetToPercentAfterCastFromGear}`
    );
    assert(
      patch.actionBarFilledByPercentOnBlockFromGear === 40,
      `Expected actionBarFilledByPercentOnBlockFromGear=40, got ${patch.actionBarFilledByPercentOnBlockFromGear}`
    );
    assert(
      patch.actionBarSetToPercentAtStartFromGear === 100,
      `Expected actionBarSetToPercentAtStartFromGear=100, got ${patch.actionBarSetToPercentAtStartFromGear}`
    );

    const eq = emptyEquipmentModifiers();
    eq.actionBarSetToPercentAtStartFromGear = 100;
    eq.actionBarSetToPercentAfterCastFromGear = 50;
    const stats = computeBuildStats(buildWithEqMods(eq));
    const enemy = {
      id: "dummy",
      name: "Dummy",
      maxLife: 1_000_000,
      armour: 0,
      evasionRating: 0,
      accuracy: 0,
      damageMin: 0,
      damageMax: 0,
      aps: 0.01,
    };
    const res = simulateEncounter({ stats, enemy, options: { maxDurationSeconds: 0.2, dt: 0.02, maxLogEntries: 0 } });
    assert(res.hitsLandedPlayer >= 1, `Expected at least 1 player hit with full action bar start, got ${res.hitsLandedPlayer}`);
  }

  // Skysplitter: additional base mana cost = 4% max energy (modeled as max energy shield)
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["Abilities gain additional base mana cost equal to 4% of maximum energy"],
      { isWeapon: false }
    );
    assert(
      patch.additionalBaseManaCostPctOfMaxEnergyShieldFromGear === 4,
      `Expected additionalBaseManaCostPctOfMaxEnergyShieldFromGear=4, got ${patch.additionalBaseManaCostPctOfMaxEnergyShieldFromGear}`
    );
    const baseEq = emptyEquipmentModifiers();
    baseEq.flatEnergyShieldFromGear = 1000;
    const baseStats = computeBuildStats(buildWithEqMods(baseEq));

    const eq = emptyEquipmentModifiers();
    eq.flatEnergyShieldFromGear = 1000;
    eq.additionalBaseManaCostPctOfMaxEnergyShieldFromGear = 4;
    const stats = computeBuildStats(buildWithEqMods(eq));
    // Whole-number mana costs: delta matches round(ES × pct), not the float product (see gameStats mana cost section).
    const expectedDelta = Math.round(stats.maxEnergyShield * 0.04);
    assert(
      stats.manaCostPerAttack - baseStats.manaCostPerAttack === expectedDelta,
      `Expected manaCostPerAttack delta=${expectedDelta}, got ${stats.manaCostPerAttack - baseStats.manaCostPerAttack}`
    );
  }

  // Arcanima: weapon local damage applies to spells
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["The local damage of your weapons applies to spells as well"],
      { isWeapon: false }
    );
    assert(Boolean(patch.weaponLocalDamageAppliesToSpellsFromGear), `Expected weaponLocalDamageAppliesToSpellsFromGear true`);

    const baseEq = emptyEquipmentModifiers();
    // Add some weapon-local-like ranges (stored min×0.5 convention)
    baseEq.flatDamageMin = 10;
    baseEq.flatDamageMax = 20;
    const baseStats = computeBuildStats({
      ...buildWithEqMods(baseEq),
      ability: { abilityId: "ability_mana_bolt", abilityLevel: 1, attunementPct: 0 },
    });
    assert(Boolean(baseStats.spellDamageComputationBreakdown), "Expected spellDamageComputationBreakdown (baseline)");
    const baseSpellMin = (baseStats.spellDamageComputationBreakdown as any).afterIncreasedByType
      .reduce((s: number, r: any) => s + (r?.min ?? 0), 0);

    const eq = emptyEquipmentModifiers();
    eq.flatDamageMin = 10;
    eq.flatDamageMax = 20;
    eq.weaponLocalDamageAppliesToSpellsFromGear = true;
    const stats = computeBuildStats({
      ...buildWithEqMods(eq),
      ability: { abilityId: "ability_mana_bolt", abilityLevel: 1, attunementPct: 0 },
    });
    assert(Boolean(stats.spellDamageComputationBreakdown), "Expected spellDamageComputationBreakdown");
    const spellMin = (stats.spellDamageComputationBreakdown as any).afterIncreasedByType
      .reduce((s: number, r: any) => s + (r?.min ?? 0), 0);
    assert(spellMin > baseSpellMin, `Expected spell damage increased by weapon local damage, got ${spellMin} vs ${baseSpellMin}`);
  }

  // Titansbane: increased range attack damage per 10 strength
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["2% increased range attack damage per 10 strength"],
      { isWeapon: true }
    );
    assert(
      patch.rangedDamageIncPctPer10StrFromGear === 2,
      `Expected rangedDamageIncPctPer10StrFromGear=2, got ${patch.rangedDamageIncPctPer10StrFromGear}`
    );
  }

  // Apotheosis: increased melee critical hit chance per 10 intelligence
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["12% increased melee critical hit chance per 10 intelligence"],
      { isWeapon: false }
    );
    assert(
      patch.meleeCritChanceIncPctPer10IntFromGear === 12,
      `Expected meleeCritChanceIncPctPer10IntFromGear=12, got ${patch.meleeCritChanceIncPctPer10IntFromGear}`
    );
    const baseEq = emptyEquipmentModifiers();
    baseEq.intBonus = 100;
    const baseStats = computeBuildStats(buildWithEqMods(baseEq));
    const eq = emptyEquipmentModifiers();
    eq.intBonus = 100;
    eq.meleeCritChanceIncPctPer10IntFromGear = 12;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.critChance > baseStats.critChance, `Expected critChance increased, got ${stats.critChance} vs ${baseStats.critChance}`);
  }

  // Fundamentality: +150 life per magic item equipped (modeled via aggregation; crafted equip_* counts as magic)
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["+150 life per magic item equipped"],
      { isWeapon: false },
      {
        onLine: (line, matched) => {
          if (!matched) throw new Error(`Fundamentality line did not match any parser rule: "${line}"`)
        },
      }
    );
    // Debug: ensure parser actually emits the field.
    // throw new Error(`DEBUG Fundamentality patch=${JSON.stringify(patch)}`)
    assert(
      patch.flatLifePerMagicItemEquippedFromGear === 150,
      `Expected parsed flatLifePerMagicItemEquippedFromGear=150, got ${patch.flatLifePerMagicItemEquippedFromGear}`
    );

    const baseEq = aggregateEquippedToEquipmentModifiers(
      ["Belt", "Gloves", "Boots"],
      (slot) => {
        if (slot === "Belt") return { itemId: "unique_fundamentality", rolls: [], enhancement: 0 };
        return { itemId: "none" };
      }
    );
    const eq = aggregateEquippedToEquipmentModifiers(
      ["Belt", "Gloves", "Boots"],
      (slot) => {
        if (slot === "Belt") return { itemId: "unique_fundamentality", rolls: [], enhancement: 0 };
        if (slot === "Gloves") return { itemId: "equip_test_gloves" };
        if (slot === "Boots") return { itemId: "equip_test_boots" };
        return { itemId: "none" };
      }
    );
    assert(eq.flatLifePerMagicItemEquippedFromGear === 150, `Expected parsed flatLifePerMagicItemEquippedFromGear=150, got ${eq.flatLifePerMagicItemEquippedFromGear}`);
    const deltaLife = eq.flatLife - baseEq.flatLife;
    assert(Math.abs(deltaLife - 300) < 1e-9, `Expected +300 flatLife from 2 magic items, got ${deltaLife}`);
  }

  // Frostbound: hits inflict chill as though dealing 100% more damage
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["Your hits inflict chill as though dealing 100% more damage"],
      { isWeapon: false }
    );
    assert(
      patch.hitsInflictChillAsThoughDealingMoreDamagePctFromGear === 100,
      `Expected hitsInflictChillAsThoughDealingMoreDamagePctFromGear=100, got ${patch.hitsInflictChillAsThoughDealingMoreDamagePctFromGear}`
    );
    const enemy = {
      id: "dummy",
      name: "Dummy",
      maxLife: 1_000_000,
      armour: 0,
      evasionRating: 0,
      accuracy: 0,
      damageMin: 0,
      damageMax: 0,
      aps: 0.01,
    };
    const baseEq = emptyEquipmentModifiers();
    baseEq.chillInflictChanceFromGear = 100;
    const baseStats = computeBuildStats({
      ...buildWithEqMods(baseEq),
      ability: { abilityId: "ability_ice_spear", abilityLevel: 1, attunementPct: 0 },
    });
    const baseRes = simulateEncounter({ stats: baseStats, enemy, options: { maxDurationSeconds: 1.0, dt: 0.02, maxLogEntries: 0 } });
    const baseChill = baseRes.enemyDebuffEvents?.find((e: any) => e.kind === "chill")?.magnitudePct ?? 0;

    const eq2 = emptyEquipmentModifiers();
    eq2.chillInflictChanceFromGear = 100;
    eq2.hitsInflictChillAsThoughDealingMoreDamagePctFromGear = 100;
    const stats2 = computeBuildStats({
      ...buildWithEqMods(eq2),
      ability: { abilityId: "ability_ice_spear", abilityLevel: 1, attunementPct: 0 },
    });
    const res2 = simulateEncounter({ stats: stats2, enemy, options: { maxDurationSeconds: 1.0, dt: 0.02, maxLogEntries: 0 } });
    const chill2 = res2.enemyDebuffEvents?.find((e: any) => e.kind === "chill")?.magnitudePct ?? 0;
    assert(chill2 >= baseChill, `Expected chill magnitude not lower with "as though more", got ${chill2} vs ${baseChill}`);
  }

  // Sanguine Eye: leech applies to bleed DoT
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["Your leech effects also apply to damage over time inflicted through bleeding"],
      { isWeapon: false }
    );
    assert(Boolean(patch.leechAppliesToBleedDotFromGear), `Expected leechAppliesToBleedDotFromGear true`);
    const enemy = {
      id: "dummy",
      name: "Dummy",
      maxLife: 1_000_000,
      armour: 0,
      evasionRating: 0,
      accuracy: 0,
      damageMin: 0,
      damageMax: 0,
      aps: 0.01,
    };
    const mkStats = (dotLeech: boolean) => {
      const eq = emptyEquipmentModifiers();
      eq.bleedInflictChanceFromGear = 100;
      eq.lifeLeechFromPhysicalHitPercentFromGear = 100; // amplify so signal dominates RNG
      eq.takePhysicalDamagePercentOfMaxLifeWhenYouAttackFromGear = 10;
      eq.leechAppliesToBleedDotFromGear = dotLeech;
      return computeBuildStats({
        ...buildWithEqMods(eq),
        ability: { abilityId: "ability_mana_bolt", abilityLevel: 1, attunementPct: 0 },
      });
    };
    const baseStats = mkStats(false);
    const stats2 = mkStats(true);
    const runAvgLife = (stats: any, n: number) => {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const res = simulateEncounter({ stats, enemy, options: { maxDurationSeconds: 1.5, dt: 0.02, maxLogEntries: 0 } });
        sum += res.playerFinal.life;
      }
      return sum / n;
    };
    const n = 40;
    const avgBase = runAvgLife(baseStats, n);
    const avgLeech = runAvgLife(stats2, n);
    assert(avgLeech > avgBase + 0.05, `Expected higher avg life with bleed DoT leech, got ${avgLeech} vs ${avgBase}`);
  }

  // The Ascetic: increased effect of modifiers gained from class passives while not wearing helmet/gloves/boots
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["100% increased effect of modifiers gained from class passives while you are not wearing a helmet gloves and boots"],
      { isWeapon: false }
    );
    assert(
      patch.classPassivesEffectIncreasedPercentFromGear === 100,
      `Expected classPassivesEffectIncreasedPercentFromGear=100, got ${patch.classPassivesEffectIncreasedPercentFromGear}`
    );
    // Condition should be detected only when those slots are empty.
    const eq = aggregateEquippedToEquipmentModifiers(
      ["Chest", "Helmet", "Gloves", "Boots"],
      (slot) => {
        if (slot === "Chest") return { itemId: "unique_the_ascetic", rolls: [0, 0], enhancement: 0 };
        return { itemId: "none" };
      }
    );
    assert(Boolean(eq.classPassivesEffectConditionMetFromGear), "Expected Ascetic condition met with empty slots");

    const base = computeBuildStats({ ...buildWithEqMods(emptyEquipmentModifiers()), upgradeLevels: { "warrior/flatLife": 1 } as any });
    const withAscetic = computeBuildStats({ ...buildWithEqMods(eq), upgradeLevels: { "warrior/flatLife": 1 } as any });
    assert(withAscetic.maxLife > base.maxLife, `Expected class passive effect scaling increased maxLife, got ${withAscetic.maxLife} vs ${base.maxLife}`);
  }

  // The Hollow Revenant: death prevention once per stage + conditional more speed + conditional chaos DoT
  {
    const patch = equipmentModifiersFromUniqueTexts(
      [
        "Once per stage, if you would die, your maximum life is halved, then recover all life",
        "If your death was prevented during the current stage, gain 40% more speed and take 1.000 chaos damage per second",
      ],
      { isWeapon: false }
    );
    assert(Boolean(patch.preventDeathOncePerStageFromGear), "Expected preventDeathOncePerStageFromGear true");
    assert(
      patch.moreSpeedIfDeathPreventedThisStagePercentFromGear === 40,
      `Expected moreSpeedIfDeathPreventedThisStagePercentFromGear=40, got ${patch.moreSpeedIfDeathPreventedThisStagePercentFromGear}`
    );
    assert(
      patch.takeChaosDamagePerSecondIfDeathPreventedFromGear === 1,
      `Expected takeChaosDamagePerSecondIfDeathPreventedFromGear=1, got ${patch.takeChaosDamagePerSecondIfDeathPreventedFromGear}`
    );

    const eq = emptyEquipmentModifiers();
    eq.preventDeathOncePerStageFromGear = true;
    eq.moreSpeedIfDeathPreventedThisStagePercentFromGear = 40;
    eq.takeChaosDamagePerSecondIfDeathPreventedFromGear = 10_000; // make it obvious after prevent
    const stats = computeBuildStats(buildWithEqMods(eq));
    const enemy = {
      id: "killer",
      name: "Killer",
      maxLife: 1_000_000,
      armour: 0,
      evasionRating: 0,
      accuracy: 10_000,
      damageMin: stats.maxLife * 2,
      damageMax: stats.maxLife * 2,
      aps: 5.0,
    };
    const res = simulateEncounter({ stats, enemy, options: { maxDurationSeconds: 1.0, dt: 0.02, maxLogEntries: 200 } });
    assert(res.log.some((e) => (e as any).message?.includes?.("Death prevented")), "Expected death prevented log entry");
  }

  // Annihilation: take chaos damage equal to 400% of ability cost when casting a spell
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["Take chaos damage equal to 400% of ability cost when you cast a spell"],
      { isWeapon: false }
    );
    assert(
      patch.takeChaosDamageEqualToPctOfAbilityCostOnSpellCastFromGear === 400,
      `Expected takeChaosDamageEqualToPctOfAbilityCostOnSpellCastFromGear=400, got ${patch.takeChaosDamageEqualToPctOfAbilityCostOnSpellCastFromGear}`
    );

    const eq = emptyEquipmentModifiers();
    eq.takeChaosDamageEqualToPctOfAbilityCostOnSpellCastFromGear = 400;
    eq.actionBarSetToPercentAtStartFromGear = 100; // ensure an immediate action occurs
    const stats = computeBuildStats({
      ...buildWithEqMods(eq),
      ability: { abilityId: "ability_mana_bolt", abilityLevel: 1, attunementPct: 0 }, // spell selection enables the on-cast hook
    });
    const enemy = {
      id: "dummy",
      name: "Dummy",
      maxLife: 1_000_000,
      armour: 0,
      evasionRating: 0,
      accuracy: 0,
      damageMin: 0,
      damageMax: 0,
      aps: 0.01,
    };
    const res = simulateEncounter({ stats, enemy, options: { maxDurationSeconds: 0.3, dt: 0.02, maxLogEntries: 0 } });
    assert(res.playerFinal.life < stats.maxLife, `Expected self chaos damage on cast to lower life, got ${res.playerFinal.life}/${stats.maxLife}`);
  }

  // Woe Touch: ailments on crit gain duration per crit multiplier (parse + planner + battle model uses ×critMultiplier on crit)
  {
    const patch = equipmentModifiersFromUniqueTexts(
      ["Ailments  inflicted with critical hits gain 1% more duration per 1% critical damage multiplier"],
      { isWeapon: false }
    );
    assert(
      Boolean(patch.ailmentsOnCritGainDurationPerCritMultiFromGear),
      "Expected ailmentsOnCritGainDurationPerCritMultiFromGear from Woe Touch line"
    );
    const eq = emptyEquipmentModifiers();
    eq.ailmentsOnCritGainDurationPerCritMultiFromGear = true;
    const stats = computeBuildStats(buildWithEqMods(eq));
    assert(stats.ailmentsOnCritGainDurationPerCritMulti === true, "Expected computed ailments-on-crit flag");
    assert(
      stats.statBreakdowns.ailmentsOnCritGainDurationPerCritMulti.lines.length >= 1,
      "Expected ailments-on-crit breakdown"
    );
  }

  // Block: generic % chance to reduce no damage on block (not only 50%)
  {
    const patch = equipmentModifiersFromUniqueTexts(["25% chance to reduce no damage on block"], { isWeapon: false });
    assert(
      patch.blockPreventsAllDamageChanceFromGear === 25,
      `Expected blockPreventsAllDamageChanceFromGear=25, got ${patch.blockPreventsAllDamageChanceFromGear}`
    );
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

