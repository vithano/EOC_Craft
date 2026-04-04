export interface BaseStats {
  strength: number;
  agility: number;
  intelligence: number;
  vitality: number;
  dexterity: number;
}

export interface CharacterClass {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseStats: BaseStats;
}

export const CLASSES: CharacterClass[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    icon: '⚔️',
    description: 'A mighty melee combatant with high strength and endurance.',
    baseStats: { strength: 20, agility: 10, intelligence: 5, vitality: 18, dexterity: 10 },
  },
  {
    id: 'mage',
    name: 'Mage',
    icon: '🔮',
    description: 'A powerful spellcaster wielding elemental forces.',
    baseStats: { strength: 5, agility: 8, intelligence: 25, vitality: 8, dexterity: 10 },
  },
  {
    id: 'rogue',
    name: 'Rogue',
    icon: '🗡️',
    description: 'A swift assassin relying on speed and cunning.',
    baseStats: { strength: 12, agility: 22, intelligence: 10, vitality: 10, dexterity: 20 },
  },
  {
    id: 'paladin',
    name: 'Paladin',
    icon: '🛡️',
    description: 'A holy warrior combining divine magic with heavy armour.',
    baseStats: { strength: 18, agility: 8, intelligence: 14, vitality: 20, dexterity: 8 },
  },
  {
    id: 'ranger',
    name: 'Ranger',
    icon: '🏹',
    description: 'A skilled archer and tracker at home in the wilds.',
    baseStats: { strength: 10, agility: 20, intelligence: 12, vitality: 12, dexterity: 22 },
  },
];
