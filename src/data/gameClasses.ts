export type UpgradeModifierKey =
  | 'increasedLife' | 'increasedEnergyShield' | 'increasedSpellDamage'
  | 'increasedAttackDamage' | 'increasedMeleeDamage' | 'increasedDamage'
  | 'increasedElementalDamage' | 'increasedElementalDamageWithAttacks'
  | 'increasedCriticalHitChance' | 'increasedAttackCriticalHitChance'
  | 'increasedSpellCriticalHitChance' | 'increasedArmor'
  | 'increasedArmorAndEvasionRating' | 'increasedArmorAndEnergyShield'
  | 'increasedEvasionRating' | 'increasedEvasionRatingAndEnergyShield'
  | 'increasedMana' | 'increasedManaRegeneration'
  | 'increasedAllElementalResistances' | 'increasedChaosResistance'
  | 'increasedChanceToBlock' | 'increasedChanceToDodge'
  | 'increasedAttackSpeed' | 'increasedAttackSpeedAndCastSpeed'
  | 'increasedMeleeAttackSpeed' | 'increasedCastSpeed'
  | 'increasedAccuracyRating' | 'increasedStrength' | 'increasedDexterity'
  | 'increasedIntelligence' | 'increasedChanceToInflictBleedingWithAttacks'
  | 'increasedChanceToInflictPoisonWithAttacks'
  | 'increasedChanceToInflictElementalAilments' | 'increasedAilmentDuration'
  | 'increasedEffectOfNonDamagingAilments' | 'increasedDamageOverTimeMultiplier'
  | 'increasedLifeRecovery' | 'gainLifeOnKill' | 'gainManaOnKill'
  | 'gainEnergyShieldOnKill' | 'gainEnergyShieldOnHit';

export interface UpgradeDef {
  id: UpgradeModifierKey;
  label: string;
  valuePerPoint: number;
  isFlat: boolean;
  maxPoints: 5;
}

export interface ClassPerLevel {
  str?: number;
  dex?: number;
  int?: number;
}

export type ClassTier = 'base' | 'intermediate' | 'major';

export type ClassRequirement =
  | { type: 'none' }
  | { type: 'or'; classIds: string[] }
  | { type: 'and'; classIds: string[] };

export interface ClassDef {
  id: string;
  name: string;
  tier: ClassTier;
  maxLevel: number;
  classBonusRequiredPoints: number;
  perLevel: ClassPerLevel;
  classBonusDescription: string;
  upgrades: UpgradeDef[];
  requirement: ClassRequirement;
}

function upg(id: UpgradeModifierKey, label: string, valuePerPoint: number, isFlat = false): UpgradeDef {
  return { id, label, valuePerPoint, isFlat, maxPoints: 5 };
}

// ---------------------------------------------------------------------------
// Base classes
// ---------------------------------------------------------------------------

const sorcerer: ClassDef = {
  id: 'sorcerer',
  name: 'Sorcerer',
  tier: 'base',
  maxLevel: 15,
  classBonusRequiredPoints: 10,
  perLevel: { int: 2 },
  classBonusDescription: 'Gain 10% of mana as extra base energy shield, 10% reduced mana cost of abilities',
  upgrades: [
    upg('increasedLife', 'Increased Life', 4),
    upg('increasedEnergyShield', 'Increased Energy Shield', 6),
    upg('increasedSpellDamage', 'Increased Spell Damage', 4),
  ],
  requirement: { type: 'none' },
};

const rogue: ClassDef = {
  id: 'rogue',
  name: 'Rogue',
  tier: 'base',
  maxLevel: 15,
  classBonusRequiredPoints: 10,
  perLevel: { dex: 1, int: 1 },
  classBonusDescription: '+150 to accuracy rating, 10% more attack speed and cast speed',
  upgrades: [
    upg('increasedLife', 'Increased Life', 4),
    upg('increasedEvasionRatingAndEnergyShield', 'Increased Evasion Rating and Energy Shield', 6),
    upg('increasedDamage', 'Increased Damage', 4),
  ],
  requirement: { type: 'none' },
};

const hunter: ClassDef = {
  id: 'hunter',
  name: 'Hunter',
  tier: 'base',
  maxLevel: 15,
  classBonusRequiredPoints: 10,
  perLevel: { dex: 2 },
  classBonusDescription: '100% increased post-encounter life recovery',
  upgrades: [
    upg('increasedLife', 'Increased Life', 4),
    upg('increasedEvasionRating', 'Increased Evasion Rating', 6),
    upg('increasedAttackDamage', 'Increased Attack Damage', 4),
  ],
  requirement: { type: 'none' },
};

const fighter: ClassDef = {
  id: 'fighter',
  name: 'Fighter',
  tier: 'base',
  maxLevel: 15,
  classBonusRequiredPoints: 10,
  perLevel: { str: 1, dex: 1 },
  classBonusDescription: '+15% to all resistances, 5% increased experience gain',
  upgrades: [
    upg('increasedLife', 'Increased Life', 4),
    upg('increasedArmorAndEvasionRating', 'Increased Armor and Evasion Rating', 6),
    upg('increasedAttackDamage', 'Increased Attack Damage', 4),
  ],
  requirement: { type: 'none' },
};

const warrior: ClassDef = {
  id: 'warrior',
  name: 'Warrior',
  tier: 'base',
  maxLevel: 15,
  classBonusRequiredPoints: 10,
  perLevel: { str: 2 },
  classBonusDescription: '+100 to maximum life, 15% increased strength',
  upgrades: [
    upg('increasedLife', 'Increased Life', 4),
    upg('increasedArmor', 'Increased Armor', 6),
    upg('increasedMeleeDamage', 'Increased Melee Damage', 4),
  ],
  requirement: { type: 'none' },
};

const acolyte: ClassDef = {
  id: 'acolyte',
  name: 'Acolyte',
  tier: 'base',
  maxLevel: 15,
  classBonusRequiredPoints: 10,
  perLevel: { str: 1, int: 1 },
  classBonusDescription: '25% increased recovery from all sources',
  upgrades: [
    upg('increasedLife', 'Increased Life', 4),
    upg('increasedArmorAndEnergyShield', 'Increased Armor and Energy Shield', 6),
    upg('increasedDamage', 'Increased Damage', 4),
  ],
  requirement: { type: 'none' },
};

// ---------------------------------------------------------------------------
// Intermediate classes
// ---------------------------------------------------------------------------

const arcanist: ClassDef = {
  id: 'arcanist',
  name: 'Arcanist',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { int: 3, dex: 1 },
  classBonusDescription: 'Chaos damage does not bypass your energy shield, 50% increased post-encounter energy shield recovery, take 15% reduced physical damage while you have energy shield',
  upgrades: [
    upg('increasedEnergyShield', 'Increased Energy Shield', 9),
    upg('increasedSpellDamage', 'Increased Spell Damage', 6),
    upg('increasedSpellCriticalHitChance', 'Increased Spell Critical Hit Chance', 12),
    upg('increasedAllElementalResistances', 'Increased All Elemental Resistances', 3),
    upg('increasedManaRegeneration', 'Increased Mana Regeneration', 15),
  ],
  requirement: { type: 'or', classIds: ['sorcerer', 'trickster', 'druid'] },
};

const druid: ClassDef = {
  id: 'druid',
  name: 'Druid',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 1, int: 3 },
  classBonusDescription: 'While above 50% of maximum mana 25% of damage taken is applied to your mana first, regenerate 2% of maximum mana per second',
  upgrades: [
    upg('increasedLife', 'Increased Life', 6),
    upg('increasedEnergyShield', 'Increased Energy Shield', 9),
    upg('increasedSpellDamage', 'Increased Spell Damage', 6),
    upg('increasedMana', 'Increased Mana', 6),
    upg('increasedChanceToInflictElementalAilments', 'Increased Chance to Inflict Elemental Ailments', 10),
  ],
  requirement: { type: 'or', classIds: ['sorcerer', 'guardian', 'arcanist'] },
};

const guardian: ClassDef = {
  id: 'guardian',
  name: 'Guardian',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 2, int: 2 },
  classBonusDescription: '+30 to all attributes, the inherent bonuses gained from attributes are doubled',
  upgrades: [
    upg('increasedLife', 'Increased Life', 4),
    upg('increasedArmorAndEnergyShield', 'Increased Armor and Energy Shield', 9),
    upg('increasedMana', 'Increased Mana', 6),
    upg('increasedChanceToBlock', 'Increased Chance to Block', 3),
    upg('increasedChaosResistance', 'Increased Chaos Resistance', 6),
  ],
  requirement: { type: 'or', classIds: ['acolyte', 'zealot', 'druid'] },
};

const zealot: ClassDef = {
  id: 'zealot',
  name: 'Zealot',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 2, int: 2 },
  classBonusDescription: 'When you hit an enemy your base damage is rolled twice and the higher result is used, when you are hit by an enemy their base damage is rolled twice and the lower result is used',
  upgrades: [
    upg('increasedLife', 'Increased Life', 6),
    upg('increasedArmorAndEnergyShield', 'Increased Armor and Energy Shield', 9),
    upg('increasedElementalDamage', 'Increased Elemental Damage', 6),
    upg('increasedCriticalHitChance', 'Increased Critical Hit Chance', 12),
    upg('increasedChanceToInflictElementalAilments', 'Increased Chance to Inflict Elemental Ailments', 10),
  ],
  requirement: { type: 'or', classIds: ['guardian', 'acolyte', 'juggernaut'] },
};

const juggernaut: ClassDef = {
  id: 'juggernaut',
  name: 'Juggernaut',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 3, int: 1 },
  classBonusDescription: '+50% to armor effectiveness against elemental damage, +25% to armor effectiveness against chaos damage, when hit recover life equal to 4% of prevented damage',
  upgrades: [
    upg('increasedLife', 'Increased Life', 6),
    upg('increasedArmor', 'Increased Armor', 9),
    upg('increasedMeleeDamage', 'Increased Melee Damage', 6),
    upg('increasedAllElementalResistances', 'Increased All Elemental Resistances', 3),
    upg('increasedLifeRecovery', 'Increased Life Recovery', 4),
  ],
  requirement: { type: 'or', classIds: ['zealot', 'warrior', 'barbarian'] },
};

const barbarian: ClassDef = {
  id: 'barbarian',
  name: 'Barbarian',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 3, dex: 1 },
  classBonusDescription: '+10% chance to deal double damage with attacks, hits ignore 50% of enemy armor',
  upgrades: [
    upg('increasedLife', 'Increased Life', 6),
    upg('increasedMeleeDamage', 'Increased Melee Damage', 6),
    upg('increasedAttackSpeed', 'Increased Attack Speed', 4),
    upg('increasedAccuracyRating', 'Increased Accuracy Rating', 9),
    upg('gainLifeOnKill', 'Gain Life on Kill', 45, true),
  ],
  requirement: { type: 'or', classIds: ['juggernaut', 'warrior', 'champion'] },
};

const champion: ClassDef = {
  id: 'champion',
  name: 'Champion',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 2, dex: 2 },
  classBonusDescription: 'Take 1% reduced damage per 4% missing life, once per stage if you would die your life is set to 1 instead',
  upgrades: [
    upg('increasedLife', 'Increased Life', 6),
    upg('increasedArmorAndEvasionRating', 'Increased Armor and Evasion Rating', 9),
    upg('increasedAttackSpeed', 'Increased Attack Speed', 4),
    upg('increasedChanceToInflictBleedingWithAttacks', 'Increased Chance to Inflict Bleeding with Attacks', 10),
    upg('increasedChanceToBlock', 'Increased Chance to Block', 3),
  ],
  requirement: { type: 'or', classIds: ['barbarian', 'fighter', 'mercenary'] },
};

const mercenary: ClassDef = {
  id: 'mercenary',
  name: 'Mercenary',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 2, dex: 2 },
  classBonusDescription: '+5 to strength and dexterity per class level, 1% increased attack speed per 10 strength or dexterity whichever is lower',
  upgrades: [
    upg('increasedLife', 'Increased Life', 6),
    upg('increasedArmorAndEvasionRating', 'Increased Armor and Evasion Rating', 9),
    upg('increasedAttackDamage', 'Increased Attack Damage', 6),
    upg('increasedAllElementalResistances', 'Increased All Elemental Resistances', 3),
    upg('increasedAccuracyRating', 'Increased Accuracy Rating', 9),
  ],
  requirement: { type: 'or', classIds: ['champion', 'fighter', 'windrunner'] },
};

const windrunner: ClassDef = {
  id: 'windrunner',
  name: 'Windrunner',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 1, dex: 3 },
  classBonusDescription: 'Permanently inflict 15% shock and 10% chill on enemies at the beginning of an encounter',
  upgrades: [
    upg('increasedEvasionRating', 'Increased Evasion Rating', 9),
    upg('increasedAttackSpeed', 'Increased Attack Speed', 4),
    upg('increasedAttackCriticalHitChance', 'Increased Attack Critical Hit Chance', 12),
    upg('increasedChanceToInflictElementalAilments', 'Increased Chance to Inflict Elemental Ailments', 10),
    upg('gainManaOnKill', 'Gain Mana on Kill', 45, true),
  ],
  requirement: { type: 'or', classIds: ['pathfinder', 'hunter', 'mercenary'] },
};

const pathfinder: ClassDef = {
  id: 'pathfinder',
  name: 'Pathfinder',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { int: 1, dex: 3 },
  classBonusDescription: '+50% to evasion effectiveness against hits from spells, take 20% less damage the first time you are hit during an encounter',
  upgrades: [
    upg('increasedEvasionRating', 'Increased Evasion Rating', 9),
    upg('increasedAttackDamage', 'Increased Attack Damage', 6),
    upg('increasedChanceToInflictBleedingWithAttacks', 'Increased Chance to Inflict Bleeding with Attacks', 10),
    upg('increasedAccuracyRating', 'Increased Accuracy Rating', 9),
    upg('increasedAllElementalResistances', 'Increased All Elemental Resistances', 3),
  ],
  requirement: { type: 'or', classIds: ['windrunner', 'hunter', 'assassin'] },
};

const assassin: ClassDef = {
  id: 'assassin',
  name: 'Assassin',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { int: 2, dex: 2 },
  classBonusDescription: '+8% to base critical hit chance, enemies have 25% less evasion rating against critical hits',
  upgrades: [
    upg('increasedLife', 'Increased Life', 6),
    upg('increasedEvasionRatingAndEnergyShield', 'Increased Evasion Rating and Energy Shield', 9),
    upg('increasedCriticalHitChance', 'Increased Critical Hit Chance', 12),
    upg('increasedChanceToInflictPoisonWithAttacks', 'Increased Chance to Inflict Poison with Attacks', 10),
    upg('gainLifeOnKill', 'Gain Life on Kill', 45, true),
  ],
  requirement: { type: 'or', classIds: ['trickster', 'rogue', 'pathfinder'] },
};

const trickster: ClassDef = {
  id: 'trickster',
  name: 'Trickster',
  tier: 'intermediate',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { dex: 2, int: 2 },
  classBonusDescription: 'Enemies take 10% increased damage, enemies have 5% less speed, enemies deal 5% less damage',
  upgrades: [
    upg('increasedEvasionRatingAndEnergyShield', 'Increased Evasion Rating and Energy Shield', 9),
    upg('increasedAttackSpeedAndCastSpeed', 'Increased Attack Speed and Cast Speed', 4),
    upg('increasedChanceToDodge', 'Increased Chance to Dodge', 2),
    upg('gainEnergyShieldOnKill', 'Gain Energy Shield on Kill', 45, true),
    upg('increasedAilmentDuration', 'Increased Ailment Duration', 8),
  ],
  requirement: { type: 'or', classIds: ['arcanist', 'rogue', 'assassin'] },
};

// ---------------------------------------------------------------------------
// Major classes
// ---------------------------------------------------------------------------

const archmage: ClassDef = {
  id: 'archmage',
  name: 'Archmage',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { int: 4 },
  classBonusDescription: '+2 to the level of all abilities, 100% increased effect of attunement modifiers from abilities',
  upgrades: [
    upg('increasedEnergyShield', 'Increased Energy Shield', 12),
    upg('increasedSpellDamage', 'Increased Spell Damage', 8),
    upg('increasedCastSpeed', 'Increased Cast Speed', 6),
    upg('increasedIntelligence', 'Increased Intelligence', 6),
    upg('increasedMana', 'Increased Mana', 8),
  ],
  requirement: { type: 'and', classIds: ['arcanist', 'druid'] },
};

const ascendant: ClassDef = {
  id: 'ascendant',
  name: 'Ascendant',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 1, int: 3 },
  classBonusDescription: '50% of non-chaos damage taken bypasses your energy shield, 50% of life regeneration per second also applies to your energy shield, regenerate 5% of life per second',
  upgrades: [
    upg('increasedLife', 'Increased Life', 8),
    upg('increasedEnergyShield', 'Increased Energy Shield', 12),
    upg('increasedElementalDamage', 'Increased Elemental Damage', 8),
    upg('increasedMana', 'Increased Mana', 8),
    upg('increasedEffectOfNonDamagingAilments', 'Increased Effect of Non-Damaging Ailments', 12),
  ],
  requirement: { type: 'and', classIds: ['guardian', 'druid'] },
};

const templar: ClassDef = {
  id: 'templar',
  name: 'Templar',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 2, int: 2 },
  classBonusDescription: '+50% to armor effectiveness against chaos damage, recover energy shield equal to 2% of armor when you block',
  upgrades: [
    upg('increasedArmorAndEnergyShield', 'Increased Armor and Energy Shield', 12),
    upg('increasedElementalDamage', 'Increased Elemental Damage', 8),
    upg('increasedCriticalHitChance', 'Increased Critical Hit Chance', 16),
    upg('increasedMana', 'Increased Mana', 8),
    upg('increasedChanceToBlock', 'Increased Chance to Block', 4),
  ],
  requirement: { type: 'and', classIds: ['guardian', 'zealot'] },
};

const chieftain: ClassDef = {
  id: 'chieftain',
  name: 'Chieftain',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 3, int: 1 },
  classBonusDescription: 'Take 25% of physical damage as fire damage, +5% to maximum fire resistance, enemies take 40% increased elemental damage',
  upgrades: [
    upg('increasedLife', 'Increased Life', 8),
    upg('increasedArmorAndEnergyShield', 'Increased Armor and Energy Shield', 12),
    upg('increasedElementalDamageWithAttacks', 'Increased Elemental Damage with Attacks', 8),
    upg('increasedAllElementalResistances', 'Increased All Elemental Resistances', 4),
    upg('increasedAilmentDuration', 'Increased Ailment Duration', 12),
  ],
  requirement: { type: 'and', classIds: ['juggernaut', 'zealot'] },
};

const destroyer: ClassDef = {
  id: 'destroyer',
  name: 'Destroyer',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 4 },
  classBonusDescription: '+25% chance to deal double damage with attacks, +1% chance to deal triple damage with attacks per 2% chance to deal double damage with attacks',
  upgrades: [
    upg('increasedLife', 'Increased Life', 8),
    upg('increasedArmor', 'Increased Armor', 12),
    upg('increasedMeleeDamage', 'Increased Melee Damage', 8),
    upg('increasedStrength', 'Increased Strength', 6),
    upg('gainLifeOnKill', 'Gain Life on Kill', 60, true),
  ],
  requirement: { type: 'and', classIds: ['juggernaut', 'barbarian'] },
};

const berserker: ClassDef = {
  id: 'berserker',
  name: 'Berserker',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 3, dex: 1 },
  classBonusDescription: 'Leech 10% of hit damage as life, take 25% increased damage, 1% more melee attack speed per 1% missing life',
  upgrades: [
    upg('increasedLife', 'Increased Life', 8),
    upg('increasedMeleeDamage', 'Increased Melee Damage', 8),
    upg('increasedMeleeAttackSpeed', 'Increased Melee Attack Speed', 6),
    upg('increasedAttackCriticalHitChance', 'Increased Attack Critical Hit Chance', 16),
    upg('gainManaOnKill', 'Gain Mana on Kill', 60, true),
  ],
  requirement: { type: 'and', classIds: ['champion', 'barbarian'] },
};

const dragoon: ClassDef = {
  id: 'dragoon',
  name: 'Dragoon',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 2, dex: 2 },
  classBonusDescription: '+25% to maximum chance to block, enemies take 1% increased damage per 1% missing combined life and energy shield',
  upgrades: [
    upg('increasedLife', 'Increased Life', 8),
    upg('increasedArmorAndEvasionRating', 'Increased Armor and Evasion Rating', 12),
    upg('increasedMeleeDamage', 'Increased Melee Damage', 8),
    upg('increasedDamageOverTimeMultiplier', 'Increased Damage Over Time Multiplier', 8),
    upg('increasedChanceToBlock', 'Increased Chance to Block', 4),
  ],
  requirement: { type: 'and', classIds: ['champion', 'mercenary'] },
};

const dervish: ClassDef = {
  id: 'dervish',
  name: 'Dervish',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { str: 1, dex: 3 },
  classBonusDescription: 'During a stage gain 5% increased attack critical hit chance per non-critical hit dealt up to 100% and 2% more attack speed per critical hit dealt up to 30%',
  upgrades: [
    upg('increasedLife', 'Increased Life', 8),
    upg('increasedEvasionRating', 'Increased Evasion Rating', 12),
    upg('increasedAttackSpeed', 'Increased Attack Speed', 6),
    upg('increasedAttackCriticalHitChance', 'Increased Attack Critical Hit Chance', 16),
    upg('increasedEffectOfNonDamagingAilments', 'Increased Effect of Non-Damaging Ailments', 12),
  ],
  requirement: { type: 'and', classIds: ['windrunner', 'mercenary'] },
};

const mirage: ClassDef = {
  id: 'mirage',
  name: 'Mirage',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { dex: 4 },
  classBonusDescription: '+5% to final chance to evade, recover life equal to 2% of evasion rating when you evade',
  upgrades: [
    upg('increasedEvasionRating', 'Increased Evasion Rating', 12),
    upg('increasedAttackDamage', 'Increased Attack Damage', 8),
    upg('increasedAttackSpeed', 'Increased Attack Speed', 6),
    upg('increasedDexterity', 'Increased Dexterity', 6),
    upg('increasedAllElementalResistances', 'Increased All Elemental Resistances', 4),
  ],
  requirement: { type: 'and', classIds: ['windrunner', 'pathfinder'] },
};

const shadow: ClassDef = {
  id: 'shadow',
  name: 'Shadow',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { dex: 3, int: 1 },
  classBonusDescription: 'The first attack or spell cast during an encounter deals 50% more damage, your action bar is filled by 35% when you evade or dodge',
  upgrades: [
    upg('increasedEvasionRating', 'Increased Evasion Rating', 12),
    upg('increasedCriticalHitChance', 'Increased Critical Hit Chance', 16),
    upg('increasedDamageOverTimeMultiplier', 'Increased Damage Over Time Multiplier', 8),
    upg('increasedChanceToDodge', 'Increased Chance to Dodge', 3),
    upg('increasedAccuracyRating', 'Increased Accuracy Rating', 12),
  ],
  requirement: { type: 'and', classIds: ['assassin', 'pathfinder'] },
};

const reaper: ClassDef = {
  id: 'reaper',
  name: 'Reaper',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { dex: 2, int: 2 },
  classBonusDescription: 'Permanently inflict 20% chill on yourself, the effect of chill on you is reversed, at the beginning of an encounter chill effects on you are reflected to enemies',
  upgrades: [
    upg('increasedEvasionRatingAndEnergyShield', 'Increased Evasion Rating and Energy Shield', 12),
    upg('increasedAttackSpeedAndCastSpeed', 'Increased Attack Speed and Cast Speed', 6),
    upg('increasedCriticalHitChance', 'Increased Critical Hit Chance', 16),
    upg('increasedChanceToDodge', 'Increased Chance to Dodge', 3),
    upg('gainEnergyShieldOnHit', 'Gain Energy Shield on Hit', 4, true),
  ],
  requirement: { type: 'and', classIds: ['assassin', 'trickster'] },
};

const occultist: ClassDef = {
  id: 'occultist',
  name: 'Occultist',
  tier: 'major',
  maxLevel: 25,
  classBonusRequiredPoints: 15,
  perLevel: { dex: 1, int: 3 },
  classBonusDescription: 'Your maximum life is 1, 40% more energy shield, deal 1% increased damage per 100 maximum energy shield',
  upgrades: [
    upg('increasedEnergyShield', 'Increased Energy Shield', 12),
    upg('increasedCastSpeed', 'Increased Cast Speed', 6),
    upg('increasedSpellCriticalHitChance', 'Increased Spell Critical Hit Chance', 16),
    upg('increasedDamageOverTimeMultiplier', 'Increased Damage Over Time Multiplier', 8),
    upg('increasedChaosResistance', 'Increased Chaos Resistance', 8),
  ],
  requirement: { type: 'and', classIds: ['arcanist', 'trickster'] },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const GAME_CLASSES: readonly ClassDef[] = [
  // Base
  sorcerer,
  rogue,
  hunter,
  fighter,
  warrior,
  acolyte,
  // Intermediate
  arcanist,
  druid,
  guardian,
  zealot,
  juggernaut,
  barbarian,
  champion,
  mercenary,
  windrunner,
  pathfinder,
  assassin,
  trickster,
  // Major
  archmage,
  ascendant,
  templar,
  chieftain,
  destroyer,
  berserker,
  dragoon,
  dervish,
  mirage,
  shadow,
  reaper,
  occultist,
];

export const GAME_CLASSES_BY_ID: Readonly<Record<string, ClassDef>> =
  Object.fromEntries(GAME_CLASSES.map(c => [c.id, c]));

/**
 * Clockwise from the top on the radial web. Inner = base tier; mid = intermediate; outer = major.
 * Each major sits between the two intermediates in its AND requirement (consecutive in the mid ring, including wrap).
 */
export const CLASS_WEB_ORDER: Readonly<Record<ClassTier, readonly string[]>> = {
  base: ['sorcerer', 'rogue', 'hunter', 'fighter', 'warrior', 'acolyte'],
  intermediate: [
    'druid',
    'arcanist',
    'trickster',
    'assassin',
    'pathfinder',
    'windrunner',
    'mercenary',
    'champion',
    'barbarian',
    'juggernaut',
    'zealot',
    'guardian',
  ],
  major: [
    'archmage',
    'occultist',
    'reaper',
    'shadow',
    'mirage',
    'dervish',
    'dragoon',
    'berserker',
    'destroyer',
    'chieftain',
    'templar',
    'ascendant',
  ],
};

export function getClassesInWebOrder(tier: ClassTier): ClassDef[] {
  const ids = CLASS_WEB_ORDER[tier];
  return ids
    .map(id => GAME_CLASSES_BY_ID[id])
    .filter((c): c is ClassDef => c != null && c.tier === tier);
}

/** Emoji per class for comb / modals. */
export const CLASS_ICONS: Readonly<Record<string, string>> = {
  sorcerer: '🔮',
  rogue: '🗡️',
  hunter: '🏹',
  fighter: '⚔️',
  warrior: '🛡️',
  acolyte: '📿',
  arcanist: '✨',
  druid: '🌿',
  guardian: '🏛️',
  zealot: '⚡',
  juggernaut: '🪨',
  barbarian: '🪓',
  champion: '👑',
  mercenary: '🎖️',
  windrunner: '💨',
  pathfinder: '🧭',
  assassin: '🥷',
  trickster: '🎭',
  archmage: '📚',
  ascendant: '🌟',
  templar: '⛪',
  chieftain: '🔥',
  destroyer: '💀',
  berserker: '😤',
  dragoon: '🐉',
  dervish: '🌀',
  mirage: '🌫️',
  shadow: '🌑',
  reaper: '⚰️',
  occultist: '🔯',
};

export function getClassIcon(classId: string): string {
  return CLASS_ICONS[classId] ?? '◆';
}

export function getClassLevel(
  classId: string,
  upgradeLevels: Record<string, number>
): number {
  return Object.entries(upgradeLevels)
    .filter(([key]) => key.startsWith(classId + '/'))
    .reduce((sum, [, v]) => sum + v, 0);
}

export function isClassBonusActive(
  classId: string,
  upgradeLevels: Record<string, number>
): boolean {
  const cls = GAME_CLASSES_BY_ID[classId];
  if (!cls) return false;
  return getClassLevel(classId, upgradeLevels) >= cls.classBonusRequiredPoints;
}

/** Points needed in a prerequisite before it counts for unlocking classes that list it (base 10, intermediate/major 15). */
export function getPrerequisiteActivationPoints(prereqClassId: string): number {
  const p = GAME_CLASSES_BY_ID[prereqClassId];
  return p?.classBonusRequiredPoints ?? 999;
}

export function isClassUnlocked(
  classId: string,
  upgradeLevels: Record<string, number>
): boolean {
  const cls = GAME_CLASSES_BY_ID[classId];
  if (!cls) return false;
  if (cls.requirement.type === 'none') return true;
  if (cls.requirement.type === 'or') {
    return cls.requirement.classIds.some(
      id => getClassLevel(id, upgradeLevels) >= getPrerequisiteActivationPoints(id)
    );
  }
  // 'and'
  return cls.requirement.classIds.every(
    id => getClassLevel(id, upgradeLevels) >= getPrerequisiteActivationPoints(id)
  );
}

export const BASE_GAME_STATS = {
  baseLife: 300,
  baseMana: 150,
  baseStr: 15,
  baseDex: 15,
  baseInt: 15,
  baseHitDamageMin: 3,
  baseHitDamageMax: 6,
  baseAps: 1.0,
  baseManaPerAttack: 3,
  baseAccuracy: 20,
  baseCritChance: 5.1,
  critMultiplier: 2.0,
  baseEvasion: 20,
  baseResistances: 0,
  maxResistance: 75,
  baseManaRegenPerSecond: 4,
  baseManaRegenPercent: 2.5,
  baseLifeRecoveryAfterEncounterPct: 10,
  baseEsRecoveryAfterEncounterPct: 25,
} as const;
