import {
  emptyEquipmentModifiers,
  normalizeAbilitySelection,
  type AbilitySelectionState,
  type BuildConfig,
} from "../data/gameStats";
import {
  EQUIPMENT_SLOTS,
  normalizeEquippedEntry,
  type EquippedEntry,
  type InventoryStack,
} from "../data/equipment";

export const EOC_BUILD_STORAGE_KEY = "eocCraftBuild";

/** Persisted payload: build math + equipment slot ids for the planner UI. */
export type StoredPlannerPayload = BuildConfig & {
  /** Legacy string values are normalized on load. */
  equipped?: Record<string, string | EquippedEntry>;
  inventory?: InventoryStack[];
  /** @deprecated use `ability` on BuildConfig — kept for older saves */
  abilitySelection?: AbilitySelectionState;
};

export function loadStoredPlanner(): StoredPlannerPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(EOC_BUILD_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<StoredPlannerPayload>;
    if (!data || typeof data !== "object") return null;
    const equippedRaw =
      data.equipped && typeof data.equipped === "object"
        ? data.equipped
        : undefined;
    const equipped = equippedRaw
      ? normalizeEquippedMap(equippedRaw as Record<string, unknown>)
      : undefined;
    const hasInventoryKey = Object.prototype.hasOwnProperty.call(data, "inventory");
    const inventory = hasInventoryKey ? normalizeInventory(data.inventory) : undefined;
    const abilityRaw =
      data.ability ??
      (data as { abilitySelection?: unknown }).abilitySelection ??
      undefined;
    const ability = normalizeAbilitySelection(abilityRaw);
    const hasAbility =
      ability.abilityId !== null || ability.abilityLevel > 0 || ability.attunementPct > 0;
    return {
      upgradeLevels:
        data.upgradeLevels && typeof data.upgradeLevels === "object"
          ? data.upgradeLevels
          : {},
      equipmentModifiers: normalizeEquipment(data.equipmentModifiers),
      ...(equipped ? { equipped } : {}),
      ...(inventory !== undefined ? { inventory } : {}),
      ...(hasAbility ? { ability } : {}),
    };
  } catch {
    return null;
  }
}

/** @deprecated use loadStoredPlanner */
export function loadStoredBuild(): BuildConfig | null {
  const p = loadStoredPlanner();
  return p ? { upgradeLevels: p.upgradeLevels, equipmentModifiers: p.equipmentModifiers } : null;
}

export function saveStoredPlanner(payload: StoredPlannerPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EOC_BUILD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function saveStoredBuild(config: BuildConfig): void {
  saveStoredPlanner(config);
}

function normalizeInventory(raw: unknown): InventoryStack[] {
  if (!Array.isArray(raw)) return [];
  const out: InventoryStack[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const slot = typeof o.slot === "string" ? o.slot : "";
    const itemId = typeof o.itemId === "string" ? o.itemId : "";
    const qty = Math.max(0, Math.floor(Number(o.qty)));
    if (!id || !slot || !itemId || qty < 1) continue;
    let rolls: number[] | undefined;
    if (Array.isArray(o.rolls) && o.rolls.length > 0) {
      rolls = o.rolls.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
    }
    const enhRaw = Math.floor(Number(o.enhancement));
    const enhancement =
      !Number.isNaN(enhRaw) && enhRaw > 0 ? Math.min(20, enhRaw) : undefined;
    out.push({
      id,
      slot,
      itemId,
      qty,
      rolls: rolls?.length ? rolls : undefined,
      enhancement,
    });
  }
  return out;
}

function normalizeEquippedMap(raw: Record<string, unknown>): Record<string, EquippedEntry> {
  const out: Record<string, EquippedEntry> = {};
  for (const slot of EQUIPMENT_SLOTS) {
    out[slot] = normalizeEquippedEntry(raw[slot]);
  }
  return out;
}

function normalizeEquipment(
  m: Partial<BuildConfig["equipmentModifiers"]> | undefined
): BuildConfig["equipmentModifiers"] {
  const d = emptyEquipmentModifiers();
  const z = m ?? {};
  return {
    ...d,
    flatLife: Number(z.flatLife) || 0,
    flatMana: Number(z.flatMana) || 0,
    flatArmor: Number(z.flatArmor) || 0,
    flatEvasion: Number(z.flatEvasion) || 0,
    flatDamageMin: Number(z.flatDamageMin) || 0,
    flatDamageMax: Number(z.flatDamageMax) || 0,
    flatFireMin: Number(z.flatFireMin) || 0,
    flatFireMax: Number(z.flatFireMax) || 0,
    flatColdMin: Number(z.flatColdMin) || 0,
    flatColdMax: Number(z.flatColdMax) || 0,
    flatLightningMin: Number(z.flatLightningMin) || 0,
    flatLightningMax: Number(z.flatLightningMax) || 0,
    flatChaosMin: Number(z.flatChaosMin) || 0,
    flatChaosMax: Number(z.flatChaosMax) || 0,
    flatStrikesPerAttack: Number(z.flatStrikesPerAttack) || 0,
    increasedStrikesPerAttackFromGear: Number(z.increasedStrikesPerAttackFromGear) || 0,
    strikesIncPctPer10DexFromGear: Number(z.strikesIncPctPer10DexFromGear) || 0,
    critChanceBonus: Number(z.critChanceBonus) || 0,
    strBonus: Number(z.strBonus) || 0,
    dexBonus: Number(z.dexBonus) || 0,
    intBonus: Number(z.intBonus) || 0,
    flatAccuracy: Number(z.flatAccuracy) || 0,
    pctIncreasedLifeFromGear: Number(z.pctIncreasedLifeFromGear) || 0,
    pctIncreasedManaFromGear: Number(z.pctIncreasedManaFromGear) || 0,
    pctIncreasedArmorFromGear: Number(z.pctIncreasedArmorFromGear) || 0,
    pctIncreasedEvasionFromGear: Number(z.pctIncreasedEvasionFromGear) || 0,
    pctIncreasedEnergyShieldFromGear: Number(z.pctIncreasedEnergyShieldFromGear) || 0,
    increasedMeleeDamageFromGear: Number(z.increasedMeleeDamageFromGear) || 0,
    increasedAttackDamageFromGear: Number(z.increasedAttackDamageFromGear) || 0,
    increasedDamageFromGear: Number(z.increasedDamageFromGear) || 0,
    increasedSpellDamageFromGear: Number(z.increasedSpellDamageFromGear) || 0,
    pctIncreasedAccuracyFromGear: Number(z.pctIncreasedAccuracyFromGear) || 0,
    pctIncreasedAttackSpeedFromGear: Number(z.pctIncreasedAttackSpeedFromGear) || 0,
    doubleDamageChanceFromGear: Number(z.doubleDamageChanceFromGear) || 0,
    armorIgnoreFromGear: Number(z.armorIgnoreFromGear) || 0,
    pctToAllElementalResFromGear: Number(z.pctToAllElementalResFromGear) || 0,
    pctChaosResFromGear: Number(z.pctChaosResFromGear) || 0,
    manaCostReductionFromGear: Number(z.manaCostReductionFromGear) || 0,
    energyShieldLessMultFromGear:
      Number(z.energyShieldLessMultFromGear) > 0 ? Number(z.energyShieldLessMultFromGear) : d.energyShieldLessMultFromGear,
    flatEnergyShieldFromGear: Number(z.flatEnergyShieldFromGear) || 0,
    weaponEffectiveAps:
      z.weaponEffectiveAps != null && !Number.isNaN(Number(z.weaponEffectiveAps))
        ? Number(z.weaponEffectiveAps)
        : d.weaponEffectiveAps,
    weaponBaseCritChance:
      z.weaponBaseCritChance != null && !Number.isNaN(Number(z.weaponBaseCritChance))
        ? Number(z.weaponBaseCritChance)
        : d.weaponBaseCritChance,
    blockChanceFromGear: Number(z.blockChanceFromGear) || 0,
    pctIncreasedCriticalHitChanceFromGear:
      Number(z.pctIncreasedCriticalHitChanceFromGear) || 0,
    increasedElementalDamageFromGear: Number(z.increasedElementalDamageFromGear) || 0,
    bleedInflictChanceFromGear: Number(z.bleedInflictChanceFromGear) || 0,
    poisonInflictChanceFromGear: Number(z.poisonInflictChanceFromGear) || 0,
    elementalAilmentInflictChanceFromGear:
      Number(z.elementalAilmentInflictChanceFromGear) || 0,
    chillInflictChanceFromGear: Number(z.chillInflictChanceFromGear) || 0,
    shockInflictChanceFromGear: Number(z.shockInflictChanceFromGear) || 0,
    igniteInflictChanceFromGear: Number(z.igniteInflictChanceFromGear) || 0,
    dotDamageMoreMultFromGear:
      Number(z.dotDamageMoreMultFromGear) > 0 ? Number(z.dotDamageMoreMultFromGear) : d.dotDamageMoreMultFromGear,
    strikesMoreMultFromGear:
      Number(z.strikesMoreMultFromGear) > 0 ? Number(z.strikesMoreMultFromGear) : d.strikesMoreMultFromGear,
    attackSpeedLessMultFromGear:
      Number(z.attackSpeedLessMultFromGear) > 0 ? Number(z.attackSpeedLessMultFromGear) : d.attackSpeedLessMultFromGear,
    accuracyLessMultFromGear:
      Number(z.accuracyLessMultFromGear) > 0 ? Number(z.accuracyLessMultFromGear) : d.accuracyLessMultFromGear,
    lifeOnHitFromGear: Number(z.lifeOnHitFromGear) || 0,
    lifeLeechFromHitDamagePercentFromGear:
      Number(z.lifeLeechFromHitDamagePercentFromGear) || 0,
    lifeLeechFromPhysicalHitPercentFromGear:
      Number(z.lifeLeechFromPhysicalHitPercentFromGear) || 0,
    physicalConvertedToFirePctFromGear: Number(z.physicalConvertedToFirePctFromGear) || 0,
    physicalConvertedToColdPctFromGear: Number(z.physicalConvertedToColdPctFromGear) || 0,
    physicalConvertedToLightningPctFromGear: Number(z.physicalConvertedToLightningPctFromGear) || 0,
    lightningPenetrationFromGear: Number(z.lightningPenetrationFromGear) || 0,
    hitsCannotBeEvadedFromGear: Boolean(z.hitsCannotBeEvadedFromGear),
    cannotDealCriticalStrikesFromGear: Boolean(z.cannotDealCriticalStrikesFromGear),
    pctFireResFromGear: Number(z.pctFireResFromGear) || 0,
    pctColdResFromGear: Number(z.pctColdResFromGear) || 0,
    pctLightningResFromGear: Number(z.pctLightningResFromGear) || 0,
    pctToAllResistancesFromGear: Number(z.pctToAllResistancesFromGear) || 0,
    dodgeChanceFromGear: Number(z.dodgeChanceFromGear) || 0,
    dodgeChancePer10DexFromGear: Number(z.dodgeChancePer10DexFromGear) || 0,
    maxDodgeChanceBonusFromGear: Number(z.maxDodgeChanceBonusFromGear) || 0,
    pctIncreasedCastSpeedFromGear: Number(z.pctIncreasedCastSpeedFromGear) || 0,
    castSpeedLessMultFromGear:
      Number(z.castSpeedLessMultFromGear) > 0 ? Number(z.castSpeedLessMultFromGear) : d.castSpeedLessMultFromGear,
    castSpeedIncPctPer10DexFromGear: Number(z.castSpeedIncPctPer10DexFromGear) || 0,
    increasedCriticalDamageMultiplierFromGear:
      Number(z.increasedCriticalDamageMultiplierFromGear) || 0,
    flatCriticalDamageMultiplierBonusFromGear:
      Number(z.flatCriticalDamageMultiplierBonusFromGear) || 0,
    attackBaseCritChanceBonusFromGear: Number(z.attackBaseCritChanceBonusFromGear) || 0,
    spellBaseCritChanceBonusFromGear: Number(z.spellBaseCritChanceBonusFromGear) || 0,
    tripleDamageChanceFromGear: Number(z.tripleDamageChanceFromGear) || 0,
    blockPowerPctFromGear: Number(z.blockPowerPctFromGear) || 0,
    armorEffectivenessVsChaosFromGear: Number(z.armorEffectivenessVsChaosFromGear) || 0,
    increasedLightningDamageFromGear: Number(z.increasedLightningDamageFromGear) || 0,
    increasedChaosDamageFromGear: Number(z.increasedChaosDamageFromGear) || 0,
    pctIncreasedDamageOverTimeFromGear: Number(z.pctIncreasedDamageOverTimeFromGear) || 0,
    pctIncreasedBleedDamageFromGear: Number(z.pctIncreasedBleedDamageFromGear) || 0,
    ailmentDurationBonusFromGear: Number(z.ailmentDurationBonusFromGear) || 0,
    pctIncreasedAllAttributesFromGear: Number(z.pctIncreasedAllAttributesFromGear) || 0,
    pctIncreasedStrengthFromGear: Number(z.pctIncreasedStrengthFromGear) || 0,
    pctIncreasedDexterityFromGear: Number(z.pctIncreasedDexterityFromGear) || 0,
    pctIncreasedIntelligenceFromGear: Number(z.pctIncreasedIntelligenceFromGear) || 0,
    damageTakenLessMultFromGear:
      Number(z.damageTakenLessMultFromGear) > 0 ? Number(z.damageTakenLessMultFromGear) : d.damageTakenLessMultFromGear,
    damageTakenMoreMultFromGear:
      Number(z.damageTakenMoreMultFromGear) > 0 ? Number(z.damageTakenMoreMultFromGear) : d.damageTakenMoreMultFromGear,
    lifeRegenPercentOfMaxLifePerSecondFromGear:
      Number(z.lifeRegenPercentOfMaxLifePerSecondFromGear) || 0,
    manaRegenPercentOfMaxManaPerSecondFromGear:
      Number(z.manaRegenPercentOfMaxManaPerSecondFromGear) || 0,
    esRegenPercentOfMaxPerSecondFromGear: Number(z.esRegenPercentOfMaxPerSecondFromGear) || 0,
    lifeAsExtraEsPercentFromGear: Number(z.lifeAsExtraEsPercentFromGear) || 0,
    manaAsExtraEsPercentFromGear: Number(z.manaAsExtraEsPercentFromGear) || 0,
    enemyDamageTakenIncreasedFromGear: Number(z.enemyDamageTakenIncreasedFromGear) || 0,
    firePenetrationFromGear: Number(z.firePenetrationFromGear) || 0,
    coldPenetrationFromGear: Number(z.coldPenetrationFromGear) || 0,
    chaosPenetrationFromGear: Number(z.chaosPenetrationFromGear) || 0,
    elementalPenetrationFromGear: Number(z.elementalPenetrationFromGear) || 0,
    elementalToChaosConversionPctFromGear: Number(z.elementalToChaosConversionPctFromGear) || 0,
    physicalToRandomElementPctFromGear: Number(z.physicalToRandomElementPctFromGear) || 0,
    lightningToColdConversionPctFromGear: Number(z.lightningToColdConversionPctFromGear) || 0,
    gainPhysicalAsExtraLightningPctFromGear: Number(z.gainPhysicalAsExtraLightningPctFromGear) || 0,
    evasionMoreMultFromGear:
      Number(z.evasionMoreMultFromGear) > 0 ? Number(z.evasionMoreMultFromGear) : d.evasionMoreMultFromGear,
    cannotInflictElementalAilmentsFromGear: Boolean(z.cannotInflictElementalAilmentsFromGear),
    hitsTakenCannotBeCriticalFromGear: Boolean(z.hitsTakenCannotBeCriticalFromGear),

    damageDealtLessMultFromGear:
      Number(z.damageDealtLessMultFromGear) > 0
        ? Number(z.damageDealtLessMultFromGear)
        : d.damageDealtLessMultFromGear,
    lifeMoreMultFromGear:
      Number(z.lifeMoreMultFromGear) > 0 ? Number(z.lifeMoreMultFromGear) : d.lifeMoreMultFromGear,
    defencesLessMultFromGear:
      Number(z.defencesLessMultFromGear) > 0
        ? Number(z.defencesLessMultFromGear)
        : d.defencesLessMultFromGear,
    manaCostIncreasePercentFromGear: Number(z.manaCostIncreasePercentFromGear) || 0,
    pctIncreasedManaRegenFromGear: Number(z.pctIncreasedManaRegenFromGear) || 0,
    pctIncreasedLifeRecoveryFromGear: Number(z.pctIncreasedLifeRecoveryFromGear) || 0,
    doubleDamageChanceFromSpellsFromGear: Number(z.doubleDamageChanceFromSpellsFromGear) || 0,
    maxBlockChanceBonusFromGear: Number(z.maxBlockChanceBonusFromGear) || 0,
    physicalTakenAsChaosPercentFromGear: Number(z.physicalTakenAsChaosPercentFromGear) || 0,
    elementalTakenAsChaosPercentFromGear: Number(z.elementalTakenAsChaosPercentFromGear) || 0,
    physicalTakenAsFirePercentFromGear: Number(z.physicalTakenAsFirePercentFromGear) || 0,
    physicalTakenAsColdPercentFromGear: Number(z.physicalTakenAsColdPercentFromGear) || 0,
    physicalTakenAsLightningPercentFromGear: Number(z.physicalTakenAsLightningPercentFromGear) || 0,
    nonDamagingAilmentEffectIncreasedFromGear:
      Number(z.nonDamagingAilmentEffectIncreasedFromGear) || 0,
    chillInflictEffectMultFromGear:
      Number(z.chillInflictEffectMultFromGear) > 0
        ? Number(z.chillInflictEffectMultFromGear)
        : d.chillInflictEffectMultFromGear,
    abilitiesNoCostFromGear: Boolean(z.abilitiesNoCostFromGear),
    dealNoDamageExceptCritFromGear: Boolean(z.dealNoDamageExceptCritFromGear),

    increasedFireDamageFromGear: Number(z.increasedFireDamageFromGear) || 0,
    increasedColdDamageFromGear: Number(z.increasedColdDamageFromGear) || 0,

    maxFireResBonusFromGear: Number(z.maxFireResBonusFromGear) || 0,
    maxColdResBonusFromGear: Number(z.maxColdResBonusFromGear) || 0,
    maxLightningResBonusFromGear: Number(z.maxLightningResBonusFromGear) || 0,
    maxAllElementalResBonusFromGear: Number(z.maxAllElementalResBonusFromGear) || 0,
    maxChaosResBonusFromGear: Number(z.maxChaosResBonusFromGear) || 0,

    damageTakenToManaFirstPercentFromGear: Number(z.damageTakenToManaFirstPercentFromGear) || 0,

    lifeRecoveredOnKillPercentFromGear: Number(z.lifeRecoveredOnKillPercentFromGear) || 0,
    flatLifeOnKillFromGear: Number(z.flatLifeOnKillFromGear) || 0,
    manaOnKillFlatFromGear: Number(z.manaOnKillFlatFromGear) || 0,

    lifeRecoveredOnBlockPercentFromGear: Number(z.lifeRecoveredOnBlockPercentFromGear) || 0,
    flatLifeOnBlockFromGear: Number(z.flatLifeOnBlockFromGear) || 0,
    manaRecoveredOnBlockPercentFromGear: Number(z.manaRecoveredOnBlockPercentFromGear) || 0,
    esRecoveredOnBlockPercentFromGear: Number(z.esRecoveredOnBlockPercentFromGear) || 0,
    flatManaOnBlockFromGear: Number(z.flatManaOnBlockFromGear) || 0,
    flatEsOnBlockFromGear: Number(z.flatEsOnBlockFromGear) || 0,

    energyShieldOnHitFromGear: Number(z.energyShieldOnHitFromGear) || 0,
    rangedDamageIncPctPer10StrFromGear: Number(z.rangedDamageIncPctPer10StrFromGear) || 0,
    manaCostPaidWithLifeFromGear: Boolean(z.manaCostPaidWithLifeFromGear),
  };
}
