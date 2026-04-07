import { computeBuildStats, emptyEquipmentModifiers, type BuildConfig } from "../src/data/gameStats";
import { equipmentModifiersFromUniqueTexts } from "../src/data/uniqueGearMods";
import { simulateEncounter } from "../src/battle/engine";

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

