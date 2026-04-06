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

/**
 * Parse the same JSON shape written to `localStorage` under {@link EOC_BUILD_STORAGE_KEY}.
 * Use for import-from-string; invalid JSON or non-object root returns null.
 */
export function parseStoredPlannerJson(raw: string): StoredPlannerPayload | null {
  try {
    const data = JSON.parse(raw) as unknown;
    return normalizePlannerPayload(data);
  } catch {
    return null;
  }
}

function normalizePlannerPayload(data: unknown): StoredPlannerPayload | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Partial<StoredPlannerPayload>;
  const equippedRaw =
    d.equipped && typeof d.equipped === "object" ? d.equipped : undefined;
  const equipped = equippedRaw
    ? normalizeEquippedMap(equippedRaw as Record<string, unknown>)
    : undefined;
  const hasInventoryKey = Object.prototype.hasOwnProperty.call(d, "inventory");
  const inventory = hasInventoryKey ? normalizeInventory(d.inventory) : undefined;
  const abilityRaw =
    d.ability ?? (d as { abilitySelection?: unknown }).abilitySelection ?? undefined;
  const ability = normalizeAbilitySelection(abilityRaw);
  const hasAbility =
    ability.abilityId !== null || ability.abilityLevel > 0 || ability.attunementPct > 0;
  return {
    upgradeLevels:
      d.upgradeLevels && typeof d.upgradeLevels === "object" ? d.upgradeLevels : {},
    equipmentModifiers: normalizeEquipment(d.equipmentModifiers),
    ...(equipped ? { equipped } : {}),
    ...(inventory !== undefined ? { inventory } : {}),
    ...(hasAbility ? { ability } : {}),
  };
}

export function loadStoredPlanner(): StoredPlannerPayload | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(EOC_BUILD_STORAGE_KEY);
  if (!raw) return null;
  return parseStoredPlannerJson(raw);
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

// ---------------------------------------------------------------------------
// Multi-build support
// ---------------------------------------------------------------------------

export const EOC_BUILDS_STORAGE_KEY = "eocCraftBuilds";

export type StoredBuild = {
  id: string;
  name: string;
  updatedAt: number;
  payload: StoredPlannerPayload;
};

export type StoredBuildsState = {
  builds: StoredBuild[];
  activeBuildId: string;
};

function generateBuildId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? `build-${crypto.randomUUID().slice(0, 8)}`
    : `build-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyBuild(name: string): StoredBuild {
  return {
    id: generateBuildId(),
    name,
    updatedAt: Date.now(),
    payload: {
      upgradeLevels: {},
      equipmentModifiers: emptyEquipmentModifiers(),
    },
  };
}

export function loadBuildsState(): StoredBuildsState {
  if (typeof window === "undefined") {
    const b = createEmptyBuild("Build 1");
    return { builds: [b], activeBuildId: b.id };
  }

  const raw = localStorage.getItem(EOC_BUILDS_STORAGE_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw) as unknown;
      if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        if (Array.isArray(d.builds) && d.builds.length > 0 && typeof d.activeBuildId === "string") {
          const builds: StoredBuild[] = [];
          for (const entry of d.builds as unknown[]) {
            if (!entry || typeof entry !== "object") continue;
            const r = entry as Record<string, unknown>;
            const id = typeof r.id === "string" ? r.id : generateBuildId();
            const name = typeof r.name === "string" ? r.name : "Build";
            const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : Date.now();
            const payload = normalizePlannerPayload(r.payload) ?? {
              upgradeLevels: {},
              equipmentModifiers: emptyEquipmentModifiers(),
            };
            builds.push({ id, name, updatedAt, payload });
          }
          if (builds.length > 0) {
            const activeBuildId = builds.some((b) => b.id === d.activeBuildId)
              ? (d.activeBuildId as string)
              : builds[0].id;
            return { builds, activeBuildId };
          }
        }
      }
    } catch {
      /* ignore malformed JSON */
    }
  }

  // Migrate from old single-build format
  const oldPayload = loadStoredPlanner();
  const first = createEmptyBuild("Build 1");
  if (oldPayload) first.payload = oldPayload;
  return { builds: [first], activeBuildId: first.id };
}

export function saveBuildsState(state: StoredBuildsState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EOC_BUILDS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
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

/** Read numeric field, falling back to pre–British-spelling keys in old saves / exports. */
function pickEquipNum(
  z: Record<string, unknown>,
  key: string,
  legacyKey?: string
): number {
  const a = z[key];
  if (a != null && a !== "" && Number.isFinite(Number(a))) return Number(a);
  if (legacyKey) {
    const b = z[legacyKey];
    if (b != null && b !== "" && Number.isFinite(Number(b))) return Number(b);
  }
  return 0;
}

function normalizeEquipment(
  m: Partial<BuildConfig["equipmentModifiers"]> | undefined
): BuildConfig["equipmentModifiers"] {
  const d = emptyEquipmentModifiers();
  const z = (m ?? {}) as Record<string, unknown>;
  return {
    ...d,
    flatLife: Number(z.flatLife) || 0,
    flatMana: Number(z.flatMana) || 0,
    flatArmour: pickEquipNum(z, "flatArmour", "flatArmor"),
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
    pctIncreasedArmourFromGear: pickEquipNum(z, "pctIncreasedArmourFromGear", "pctIncreasedArmorFromGear"),
    pctIncreasedEvasionFromGear: Number(z.pctIncreasedEvasionFromGear) || 0,
    pctIncreasedEnergyShieldFromGear: Number(z.pctIncreasedEnergyShieldFromGear) || 0,
    increasedMeleeDamageFromGear: Number(z.increasedMeleeDamageFromGear) || 0,
    increasedAttackDamageFromGear: Number(z.increasedAttackDamageFromGear) || 0,
    increasedDamageFromGear: Number(z.increasedDamageFromGear) || 0,
    increasedSpellDamageFromGear: Number(z.increasedSpellDamageFromGear) || 0,
    pctIncreasedAccuracyFromGear: Number(z.pctIncreasedAccuracyFromGear) || 0,
    pctIncreasedAttackSpeedFromGear: Number(z.pctIncreasedAttackSpeedFromGear) || 0,
    doubleDamageChanceFromGear: Number(z.doubleDamageChanceFromGear) || 0,
    armourIgnoreFromGear: pickEquipNum(z, "armourIgnoreFromGear", "armorIgnoreFromGear"),
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
    armourEffectivenessVsChaosFromGear: pickEquipNum(
      z,
      "armourEffectivenessVsChaosFromGear",
      "armorEffectivenessVsChaosFromGear"
    ),
    increasedLightningDamageFromGear: Number(z.increasedLightningDamageFromGear) || 0,
    increasedChaosDamageFromGear: Number(z.increasedChaosDamageFromGear) || 0,
    pctIncreasedDamageOverTimeFromGear: Number(z.pctIncreasedDamageOverTimeFromGear) || 0,
    pctIncreasedBleedDamageFromGear: Number(z.pctIncreasedBleedDamageFromGear) || 0,
    ailmentDurationBonusFromGear: Number(z.ailmentDurationBonusFromGear) || 0,
    ailmentDurationLessMultFromGear:
      Number(z.ailmentDurationLessMultFromGear) > 0
        ? Number(z.ailmentDurationLessMultFromGear)
        : d.ailmentDurationLessMultFromGear,
    igniteDurationLessMultFromGear:
      Number(z.igniteDurationLessMultFromGear) > 0
        ? Number(z.igniteDurationLessMultFromGear)
        : d.igniteDurationLessMultFromGear,
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
    manaMoreMultFromGear:
      Number(z.manaMoreMultFromGear) > 0 ? Number(z.manaMoreMultFromGear) : d.manaMoreMultFromGear,
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
    reducedPhysicalDamageTakenFromGear: Number(z.reducedPhysicalDamageTakenFromGear) || 0,
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
    damageIncPctPer10CombinedAttrsFromGear:
      Number(z.damageIncPctPer10CombinedAttrsFromGear) || 0,
    manaCostPaidWithLifeFromGear: Boolean(z.manaCostPaidWithLifeFromGear),
  };
}
