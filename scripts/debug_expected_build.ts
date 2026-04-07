import { computeBuildStats, emptyEquipmentModifiers, type BuildConfig } from "../src/data/gameStats";
import { updateAbilityDefinitions } from "../src/data/eocAbilities";
import { updateUniqueDefinitions } from "../src/data/eocUniques";
import { updateBaseEquipmentDefinitions } from "../src/data/eocBaseEquipment";
import { updateModifierDefinitions } from "../src/data/eocModifiers";
import { parseEquipmentCSV, parseEquipmentModifiersCSV } from "../src/lib/parseSheetData";
import abilitiesJson from "../src/data/eocAbilities.generated.json";
import uniquesJson from "../src/data/eocUniques.generated.json";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

updateAbilityDefinitions(abilitiesJson as any);
updateUniqueDefinitions(uniquesJson as any);

// Load crafted base equipment + modifier defs from the CSV sources-of-truth.
const root = join(__dirname, "..");
updateBaseEquipmentDefinitions(parseEquipmentCSV(readFileSync(join(root, "equipment(1.3.2).csv"), "utf-8")));
updateModifierDefinitions(
  parseEquipmentModifiersCSV(readFileSync(join(root, "equipment_modifiers(1.3.2).csv"), "utf-8"))
);

const config: BuildConfig = {
  upgradeLevels: {
    "sorcerer/increasedEnergyShield": 5,
    "sorcerer/increasedSpellDamage": 5,
    "arcanist/increasedEnergyShield": 5,
    "arcanist/increasedSpellCriticalHitChance": 5,
    "arcanist/increasedManaRegeneration": 5,
    "druid/increasedChanceToInflictElementalAilments": 5,
    "druid/increasedMana": 5,
    "druid/increasedEnergyShield": 5,
    "archmage/increasedEnergyShield": 5,
    "archmage/increasedSpellDamage": 5,
    "archmage/increasedCastSpeed": 5,
    "archmage/increasedIntelligence": 5,
    "archmage/increasedMana": 5,
    "guardian/increasedArmourAndEnergyShield": 5,
    "guardian/increasedMana": 5,
    "guardian/increasedChaosResistance": 5,
    "zealot/increasedArmourAndEnergyShield": 5,
    "trickster/increasedEvasionRatingAndEnergyShield": 5,
    "trickster/increasedAttackSpeedAndCastSpeed": 5,
    "trickster/increasedChanceToDodge": 5,
  },
  // `computeBuildStats` ignores this when `equipped` is set (gear is re-derived from items).
  equipmentModifiers: emptyEquipmentModifiers(),
  ability: { abilityId: "ability_blazing_radiance", abilityLevel: 20, attunementPct: 100 },
  equipped: {
    Helmet: { itemId: "unique_the_gilden_apex", rolls: [20, 6, 10], enhancement: 40 },
    Chest: { itemId: "unique_mind_bulwark", rolls: [20, 19, 48], enhancement: 10 },
    Belt: { itemId: "unique_circling_thoughts", rolls: [20, 58], enhancement: 9 },
    Gloves: {
      itemId: "equip_gloves",
      enhancement: 10,
      craftedPrefixes: [
        { modifierId: "prefix_additional_level_to_all_abilities", roll1: 2 },
        { modifierId: "prefix_increased_arcana_gain_from_enemies", roll1: 40 },
      ],
      craftedSuffixes: [
        { modifierId: "suffix_intelligence", roll1: 55 },
        { modifierId: "suffix_increased_cast_speed", roll1: 24 },
      ],
    },
    Boots: { itemId: "unique_the_parallax", rolls: [185, 12], enhancement: 10 },
    Weapon: {
      itemId: "equip_sceptre",
      enhancement: 10,
      craftedPrefixes: [
        { modifierId: "prefix_added_cold_damage_to_spells", roll1: 134, roll2: 257 },
        { modifierId: "prefix_increased_fire_damage", roll1: 95 },
      ],
      craftedSuffixes: [
        { modifierId: "suffix_increased_cast_speed", roll1: 50 },
        { modifierId: "suffix_elemental_resistance_penetration", roll1: 20 },
      ],
    },
    "Off-hand": { itemId: "unique_remnant_of_the_ages", rolls: [67, 29, 44, 17], enhancement: 7 },
    "Ring 1": {
      itemId: "equip_amethyst_ring",
      enhancement: 9,
      craftedPrefixes: [
        { modifierId: "prefix_mana", roll1: 119 },
        { modifierId: "prefix_increased_item_rarity", roll1: 35 },
      ],
      craftedSuffixes: [
        { modifierId: "suffix_intelligence", roll1: 49 },
        { modifierId: "suffix_increased_mana_regeneration", roll1: 75 },
      ],
    },
    "Ring 2": {
      itemId: "equip_amethyst_ring",
      enhancement: 3,
      craftedPrefixes: [
        { modifierId: "prefix_mana", roll1: 86 },
        { modifierId: "prefix_evasion_rating", roll1: 215 },
      ],
      craftedSuffixes: [
        { modifierId: "suffix_all_elemental_resistances", roll1: 19 },
        { modifierId: "suffix_increased_mana_regeneration", roll1: 36 },
      ],
    },
    Amulet: { itemId: "unique_soulstone_talisman", rolls: [34, 49, 19, 3], enhancement: 10 },
  },
};

const stats = computeBuildStats(config);

// ---------------------------------------------------------------------------
// Regression assertions for this payload (high-signal invariants)
// ---------------------------------------------------------------------------
const castTime = stats.aps > 0 ? 1 / stats.aps : 0;
assert.equal(stats.manaCostPerAttack, 14, "mana cost per cast should be 14");
assert.ok(Math.abs(castTime - 0.07) < 0.01, `cast time should be ~0.07s (got ${castTime})`);
assert.equal(stats.elementalPenetrationPercent, 60, "elemental penetration should be 60%");
assert.equal(stats.damageTakenToManaFirstPercent, 25, "damage taken to mana first should be 25%");
assert.ok(Number.isFinite(stats.esRegenPerSecond), "es regen per second should be a finite number");

// Headline stats for this fixture (includes crafted weapon innate + prefixes/suffixes via `craftedEquipStatParseTexts`).
assert.equal(stats.maxMana, 10774, "max mana");
assert.equal(stats.armour, 12846, "armour");
assert.equal(stats.maxEnergyShield, 26382, "energy shield");
assert.equal(stats.hitDamageMin, 10192, "hit damage min");
assert.equal(stats.hitDamageMax, 15401, "hit damage max");
assert.ok(Math.abs(stats.manaRegenPerSecond - 3138.4662) < 0.05, `mana regen / s (got ${stats.manaRegenPerSecond})`);
assert.ok(Math.abs(stats.esRegenPerSecond - 1846.74) < 0.1, `es regen / s (got ${stats.esRegenPerSecond})`);

// High-signal outputs for debugging mismatches.
console.log(
  JSON.stringify(
    {
      classBonusesActive: stats.classBonusesActive,
      hitDamage: { min: stats.hitDamageMin, max: stats.hitDamageMax, byType: stats.hitDamageByType },
      cast: { aps: stats.aps, castTime: stats.aps > 0 ? 1 / stats.aps : null },
      manaCostPerCast: stats.manaCostPerAttack,
      shock: {
        elementalAilmentChance: stats.elementalAilmentChance,
        shockBonus: stats.shockInflictChanceBonus,
        nonDamagingAilmentEffectInc: stats.nonDamagingAilmentEffectIncreasedPercent,
        ailmentDurationMult: stats.ailmentDurationMultiplier,
      },
      pen: stats.elementalPenetrationPercent,
      def: {
        armour: stats.armour,
        evasionRating: stats.evasionRating,
        energyShield: stats.maxEnergyShield,
        block: stats.blockChance,
        dodge: stats.dodgeChance,
        manaBeforeLife: stats.damageTakenToManaFirstPercent,
        res: {
          fire: stats.fireRes,
          cold: stats.coldRes,
          lightning: stats.lightningRes,
          chaos: stats.chaosRes,
          maxChaos: stats.maxChaosRes,
        },
        reducedPhysTaken: stats.reducedPhysicalDamageTaken,
      },
      rec: {
        manaRegen: stats.manaRegenPerSecond,
        esRegen: stats.esRegenPerSecond,
      },
      attrs: { life: stats.maxLife, mana: stats.maxMana, str: stats.str, dex: stats.dex, int: stats.int },
      rarity: { itemRarity: stats.increasedItemRarityFromGear, arcana: stats.increasedArcanaGainFromEnemies },
      spellBreakdown: stats.spellDamageComputationBreakdown ?? null,
    },
    null,
    2
  )
);

