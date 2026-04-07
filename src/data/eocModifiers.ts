/**
 * Equipment modifier definitions parsed from the EquipmentModifiers sheet tab.
 * Each modifier is a prefix or suffix that can be applied to base equipment.
 * Up to 2 prefixes and 2 suffixes can be applied to a single item.
 */

/** A single rolled range like (2 to 51). */
export interface ModRange {
  min: number;
  max: number;
}

/**
 * The value spec for a modifier on a specific item type.
 * Single-value mods (e.g. "+X to Mana") have only range1.
 * Two-value mods (e.g. "Adds X to Y Physical Damage") have range1 and range2.
 */
export interface ModifierValueSpec {
  range1: ModRange;
  range2?: ModRange;
}

export interface EocModifierDefinition {
  id: string;           // e.g. "prefix_added_local_physical_damage"
  type: 'prefix' | 'suffix';
  parentName: string;   // e.g. "Added Local Physical Damage"
  name: string;         // display name, e.g. "Added Local Physical Damage"
  /** Map from CSV item type name → value spec. Only item types where this modifier applies are present. */
  itemTypeValues: Record<string, ModifierValueSpec>;
}

/** An applied modifier on a crafted item (stored in InventoryStack / EquippedEntry). */
export interface AppliedModifier {
  modifierId: string;
  roll1: number;    // rolled value for range1
  roll2?: number;   // rolled value for range2 (two-value mods only)
}

// ---------------------------------------------------------------------------
// Data stores (populated by GameDataProvider)
// ---------------------------------------------------------------------------

export let EOC_MODIFIERS: EocModifierDefinition[] = [];
export let EOC_MODIFIERS_BY_ID: Record<string, EocModifierDefinition> = {};
export let EOC_PREFIXES: EocModifierDefinition[] = [];
export let EOC_SUFFIXES: EocModifierDefinition[] = [];

export function updateModifierDefinitions(defs: EocModifierDefinition[]): void {
  EOC_MODIFIERS = defs;
  EOC_MODIFIERS_BY_ID = Object.fromEntries(defs.map((d) => [d.id, d]));
  EOC_PREFIXES = defs.filter((d) => d.type === 'prefix');
  EOC_SUFFIXES = defs.filter((d) => d.type === 'suffix');
}

/** Returns all prefix or suffix modifiers available for a given item type. */
export function getModifiersForItemType(
  itemType: string,
  modType: 'prefix' | 'suffix'
): EocModifierDefinition[] {
  const list = modType === 'prefix' ? EOC_PREFIXES : EOC_SUFFIXES;
  return list.filter((m) => m.itemTypeValues[itemType] != null);
}

/** Returns default (midpoint) roll values for a modifier on a given item type. */
export function defaultRollsForModifier(
  mod: EocModifierDefinition,
  itemType: string
): { roll1: number; roll2?: number } {
  const spec = mod.itemTypeValues[itemType];
  if (!spec) return { roll1: 0 };
  const mid = (r: ModRange) => Math.round((r.min + r.max) / 2);
  return { roll1: mid(spec.range1), roll2: spec.range2 ? mid(spec.range2) : undefined };
}

// ---------------------------------------------------------------------------
// Text formatting — produces text compatible with equipmentModifiersFromUniqueTexts
// ---------------------------------------------------------------------------

/**
 * Maps modifier name → a function that formats the rolled value(s) into stat-parseable text.
 * Returns null for modifiers whose effects aren't captured by the stat system.
 */
const MOD_TEXT_FORMATTER: Record<string, (v1: number, v2?: number) => string | null> = {
  // Weapon local physical damage (handled in weapon-local branch)
  'Added Local Physical Damage':      (v1, v2) => `Adds ${v1} to ${v2 ?? v1} local physical damage`,
  'Added Local Lightning Damage':     (v1, v2) => `Adds ${v1} to ${v2 ?? v1} local lightning damage`,
  'Added Local Cold Damage':          (v1, v2) => `Adds ${v1} to ${v2 ?? v1} local cold damage`,
  'Added Local Fire Damage':          (v1, v2) => `Adds ${v1} to ${v2 ?? v1} local fire damage`,
  // Spell added damage (Wand/Magestaff are weapons, so treated as local)
  'Added Lightning Damage To Spells': (v1, v2) => `Adds ${v1} to ${v2 ?? v1} local lightning damage`,
  'Added Cold Damage To Spells':      (v1, v2) => `Adds ${v1} to ${v2 ?? v1} local cold damage`,
  'Added Fire Damage To Spells':      (v1, v2) => `Adds ${v1} to ${v2 ?? v1} local fire damage`,
  // % increased local physical damage (weapon-local)
  'Increased Local Physical Damage':  (v1) => `${v1}% increased local physical damage`,
  // Flat resources
  'Mana':                             (v1) => `+${v1} to maximum mana`,
  'Life':                             (v1) => `+${v1} to maximum life`,
  'Energy Shield':                    (v1) => `+${v1} to energy shield`,
  'Evasion Rating':                   (v1) => `+${v1} to evasion rating`,
  'Armour':                           (v1) => `+${v1} to armour`,
  // % increased damage types
  'Increased Physical Damage':        (v1) => `${v1}% increased physical damage`,
  'Increased Lightning Damage':       (v1) => `${v1}% increased lightning damage`,
  'Increased Cold Damage':            (v1) => `${v1}% increased cold damage`,
  'Increased Fire Damage':            (v1) => `${v1}% increased fire damage`,
  'Increased Chaos Damage':           (v1) => `${v1}% increased chaos damage`,
  'Increased Elemental Damage':       (v1) => `${v1}% increased elemental damage`,
  // Resources % increased
  'Increased Life':                   (v1) => `${v1}% increased life`,
  'Increased Defenses':               (v1) => `${v1}% increased defences`,
  'Increased Local Defenses':         (v1) => `${v1}% increased local defences`,
  'Increased Local Block Chance':     (v1) => `${v1}% increased local block chance`,
  // Attributes
  'Intelligence':                     (v1) => `+${v1} to intelligence`,
  'Dexterity':                        (v1) => `+${v1} to dexterity`,
  'Strength':                         (v1) => `+${v1} to strength`,
  'To All Attributes':                (v1) => `+${v1} to all attributes`,
  // Leech / on-kill / on-hit
  'Physical Attack Life Leech':       (v1) => `leech ${v1}% of physical hit damage from attacks as life`,
  'Life Gain On Kill':                (v1) => `gain ${v1} life on kill`,
  'Mana Gain On Kill':                (v1) => `gain ${v1} mana on kill`,
  'Life Gain On Hit':                 (v1) => `gain ${v1} life on hit`,
  // Attack modifiers
  'Increased Local Attack Speed':     (v1) => `${v1}% increased local attack speed`,
  'Increased Attack Speed':           (v1) => `${v1}% increased attack speed`,
  'Accuracy Rating':                  (v1) => `+${v1} to accuracy rating`,
  'Increased Accuracy Rating':        (v1) => `${v1}% increased accuracy rating`,
  'Local Base Critical Hit Chance':   (v1) => `${v1}% local base critical hit chance`,
  'Base Critical Hit Chance':         (v1) => `+${v1}% to attack base critical hit chance`,
  'Critical Damage Multiplier':       (v1) => `+${v1}% to critical damage multiplier`,
  'Increased Critical Hit Chance':    (v1) => `${v1}% increased critical hit chance`,
  'Attack Double Damage Chance':      (v1) => `${v1}% chance to deal double damage with attacks`,
  'Elemental Resistance Penetration': (v1) => `hits penetrate ${v1}% of enemy elemental resistances`,
  // Spell modifiers
  'Increased Cast Speed':             (v1) => `${v1}% increased cast speed`,
  'Increased Spell Critical Hit Chance': (v1) => `${v1}% increased spell critical hit chance`,
  // Mana regen / cost
  'Increased Mana Regeneration':      (v1) => `${v1}% increased mana regeneration`,
  'Reduced Mana Cost Of Abilities':   (v1) => `${v1}% reduced mana cost of abilities`,
  // Resistances
  'Fire Resistance':                  (v1) => `+${v1}% to fire resistance`,
  'Cold Resistance':                  (v1) => `+${v1}% to cold resistance`,
  'Lightning Resistance':             (v1) => `+${v1}% to lightning resistance`,
  'Chaos Resistance':                 (v1) => `+${v1}% to chaos resistance`,
  'All Elemental Resistances':        (v1) => `${v1}% to all elemental resistances`,
  'Maximum Fire Resistance':          (v1) => `+${v1}% to maximum fire resistance`,
  'Maximum Cold Resistance':          (v1) => `+${v1}% to maximum cold resistance`,
  'Maximum Lightning Resistance':     (v1) => `+${v1}% to maximum lightning resistance`,
  'Maximum Chaos Resistance':         (v1) => `+${v1}% to maximum chaos resistance`,
  'Maximum Elemental Resistances':    (v1) => `+${v1}% to all maximum elemental resistances`,
  // Life regen / ES regen
  'Regenerate Life Per Second':       (v1) => `regenerate ${v1} life per second`,  // display only (flat not % based)
  'Regenerate Energy Shield Percent Per Second': (v1) => `regenerate ${v1}% of energy shield per second`,
  // Block / dodge
  'Block Chance':                     (v1) => `+${v1}% to block`,
  'Dodge Chance':                     (v1) => `+${v1}% chance to dodge`,
  'Recover Life On Block':            (v1) => `recover ${v1}% of life on block`,
  'Recover Mana On Block':            (v1) => `recover ${v1}% of mana on block`,
  'Recover Energy Shield On Block':   (v1) => `recover ${v1}% of energy shield on block`,
  // Ailments
  'Increased Ailment Duration':       (v1) => `${v1}% increased ailment duration`,
  'Increased Effect Of Non-Damaging Ailments': (v1) => `${v1}% increased effect of non-damaging ailments`,
  'Chance To Inflict Bleeding With Attacks':   (v1) => `+${v1}% chance to inflict bleeding with attacks`,
  'Chance To Inflict Poison With Attacks':     (v1) => `+${v1}% chance to inflict poison with attacks`,
  'Chance To Inflict Elemental Ailments':      (v1) => `+${v1}% chance to inflict elemental ailments`,
  // Display-only (no stat mapping in uniqueGearMods)
  'Physical Attack Mana Leech':       (v1) => `${v1}% of physical attack damage leeched as mana`,
  'Mana Gain On Hit':                 (v1) => `+${v1} mana gained on hit`,
  'Damage Over Time Multiplier':      (v1) => `${v1}% damage over time multiplier`,
  'Reduced Attribute Requirement':    (v1) => `${v1}% reduced attribute requirements`,
  'Increased Experience Gain':        (v1) => `${v1}% increased experience gain`,
  'Increased Arcana Gain From Enemies': (v1) => `${v1}% increased arcana gain from enemies`,
  'Increased Item Quantity':          (v1) => `${v1}% increased item quantity`,
  'Increased Item Rarity':            (v1) => `${v1}% increased item rarity`,
  'Chance To Avoid Ailments':         (v1) => `${v1}% chance to avoid ailments`,
  'Additional Level To Physical Abilities': (v1) => `+${v1} to level of physical abilities`,
  'Additional Level To Fire Abilities':     (v1) => `+${v1} to level of fire abilities`,
  'Additional Level To Cold Abilities':     (v1) => `+${v1} to level of cold abilities`,
  'Additional Level To Lightning Abilities': (v1) => `+${v1} to level of lightning abilities`,
  'Additional Level To Chaos Abilities':    (v1) => `+${v1} to level of chaos abilities`,
  'Additional Level To All Abilities':      (v1) => `+${v1} to level of all abilities`,
};

/**
 * Returns the display text for a modifier at its rolled values.
 * Falls back to "<Name>: <v1>" if no formatter is found.
 */
export function formatModifierText(
  mod: EocModifierDefinition,
  roll1: number,
  roll2?: number
): string {
  const fn = MOD_TEXT_FORMATTER[mod.name];
  if (fn) {
    const result = fn(roll1, roll2);
    if (result) return result;
  }
  return roll2 != null
    ? `${mod.name}: ${roll1} to ${roll2}`
    : `${mod.name}: ${roll1}`;
}

/**
 * Returns the stat-parseable text for a modifier at its rolled values.
 * Returns null for modifiers that have no stat mapping (display-only).
 */
export function modifierToStatText(
  mod: EocModifierDefinition,
  roll1: number,
  roll2?: number
): string | null {
  const fn = MOD_TEXT_FORMATTER[mod.name];
  if (!fn) return null;
  return fn(roll1, roll2);
}

/**
 * Converts a list of applied modifiers (prefixes + suffixes) into texts
 * suitable for passing to equipmentModifiersFromUniqueTexts.
 */
export function appliedModifiersToStatTexts(
  prefixes: AppliedModifier[],
  suffixes: AppliedModifier[]
): string[] {
  const texts: string[] = [];
  for (const am of [...prefixes, ...suffixes]) {
    const mod = EOC_MODIFIERS_BY_ID[am.modifierId];
    if (!mod) continue;
    const t = modifierToStatText(mod, am.roll1, am.roll2);
    if (t) texts.push(t);
  }
  return texts;
}
