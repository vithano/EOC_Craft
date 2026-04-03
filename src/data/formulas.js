/**
 * FORMULA DEFINITIONS
 * These are placeholder formulas. In the future, these can be replaced with
 * custom formula functions plugged in by the user.
 *
 * Each formula receives the full computed stats object and returns a numeric value.
 */

export const FORMULA_DESCRIPTIONS = {
  health: 'baseHealth + (vitality * 10) + equipmentHealth',
  mana: 'baseMana + (intelligence * 8) + equipmentMana',
  damage:
    'baseDamage + equipmentDamage + (strength * 2) + (intelligence * 1.5) + (agility * 0.5) + critBonus',
  armor: 'equipmentArmor + (vitality * 1.5) + upgradeArmor',
  evasion: 'equipmentEvasion + (agility * 1.2) + (dexterity * 0.8) + upgradeEvasion',
  critChance: 'baseCritChance + equipmentCritChance + upgradeCritChance',
  effectiveDamage: 'damage * (1 + critChance / 100 * critMultiplier)',
  damageReduction: '1 - (1 / (1 + armor / 100))',
};

export const CLASS_BASE = {
  warrior: { baseHealth: 200, baseMana: 60, baseDamage: 20, baseCritChance: 3, critMultiplier: 1.8 },
  mage: { baseHealth: 100, baseMana: 180, baseDamage: 10, baseCritChance: 5, critMultiplier: 2.0 },
  rogue: { baseHealth: 140, baseMana: 80, baseDamage: 16, baseCritChance: 8, critMultiplier: 2.2 },
  paladin: { baseHealth: 180, baseMana: 120, baseDamage: 16, baseCritChance: 3, critMultiplier: 1.7 },
  ranger: { baseHealth: 150, baseMana: 100, baseDamage: 14, baseCritChance: 6, critMultiplier: 2.0 },
};

/**
 * Compute all derived stats from class, equipment modifiers, and upgrades.
 * @param {string} classId
 * @param {Object} equipModifiers - aggregated modifiers from all equipped items
 * @param {Object} upgradeModifiers - aggregated modifiers from active upgrades
 * @param {Object} classBaseStats - { strength, agility, intelligence, vitality, dexterity }
 * @returns {Object} computed stats
 */
export function computeStats(classId, equipModifiers, upgradeModifiers, classBaseStats) {
  const base = CLASS_BASE[classId] || CLASS_BASE.warrior;
  const em = equipModifiers;
  const um = upgradeModifiers;
  const cs = classBaseStats;

  const strength = (cs.strength || 0) + (em.strength || 0) + (um.strength || 0);
  const agility = (cs.agility || 0) + (em.agility || 0) + (um.agility || 0);
  const intelligence = (cs.intelligence || 0) + (em.intelligence || 0) + (um.intelligence || 0);
  const vitality = (cs.vitality || 0) + (em.vitality || 0) + (um.vitality || 0);
  const dexterity = (cs.dexterity || 0) + (em.dexterity || 0) + (um.dexterity || 0);

  // PLACEHOLDER FORMULA: health = baseHealth + vitality*10 + equipHealth
  const health = base.baseHealth + vitality * 10 + (em.health || 0) + (um.health || 0);

  // PLACEHOLDER FORMULA: mana = baseMana + intelligence*8 + equipMana
  const mana = base.baseMana + intelligence * 8 + (em.mana || 0) + (um.mana || 0);

  // PLACEHOLDER FORMULA: damage = baseDamage + equipDamage + str*2 + int*1.5 + agi*0.5
  const damage =
    base.baseDamage +
    (em.damage || 0) +
    (um.damage || 0) +
    strength * 2 +
    intelligence * 1.5 +
    agility * 0.5;

  // PLACEHOLDER FORMULA: armor = equipArmor + vitality*1.5 + upgradeArmor
  const armor = (em.armor || 0) + vitality * 1.5 + (um.armor || 0);

  // PLACEHOLDER FORMULA: evasion = equipEvasion + agility*1.2 + dexterity*0.8 + upgradeEvasion
  const evasion =
    (em.evasion || 0) + agility * 1.2 + dexterity * 0.8 + (um.evasion || 0);

  // PLACEHOLDER FORMULA: critChance = baseCrit + equipCrit + upgradeCrit
  const critChance =
    base.baseCritChance + (em.critChance || 0) + (um.critChance || 0);

  // PLACEHOLDER FORMULA: effectiveDamage = damage * (1 + critChance/100 * critMultiplier)
  const effectiveDamage = damage * (1 + (critChance / 100) * base.critMultiplier);

  // PLACEHOLDER FORMULA: damageReduction% = 1 - 1/(1 + armor/100)
  const damageReduction = (1 - 1 / (1 + armor / 100)) * 100;

  return {
    strength: Math.round(strength),
    agility: Math.round(agility),
    intelligence: Math.round(intelligence),
    vitality: Math.round(vitality),
    dexterity: Math.round(dexterity),
    health: Math.round(health),
    mana: Math.round(mana),
    damage: Math.round(damage),
    armor: Math.round(armor),
    evasion: Math.round(evasion * 10) / 10,
    critChance: Math.round(critChance * 10) / 10,
    effectiveDamage: Math.round(effectiveDamage * 10) / 10,
    damageReduction: Math.round(damageReduction * 10) / 10,
  };
}
