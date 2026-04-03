export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export interface ItemModifiers {
  armor?: number;
  damage?: number;
  strength?: number;
  agility?: number;
  intelligence?: number;
  vitality?: number;
  dexterity?: number;
  evasion?: number;
  critChance?: number;
  mana?: number;
  health?: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  rarity?: Rarity;
  modifiers: ItemModifiers;
}

export const EQUIPMENT_SLOTS: string[] = [
  'Helmet', 'Chest', 'Gloves', 'Boots', 'Weapon', 'Off-hand', 'Ring 1', 'Ring 2', 'Amulet',
];

export const EQUIPMENT_ITEMS: Record<string, EquipmentItem[]> = {
  Helmet: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'iron_helm', name: 'Iron Helm', rarity: 'common', modifiers: { armor: 15, vitality: 2 } },
    { id: 'steel_helm', name: 'Steel Helm', rarity: 'uncommon', modifiers: { armor: 28, vitality: 4, strength: 2 } },
    { id: 'shadow_cowl', name: 'Shadow Cowl', rarity: 'rare', modifiers: { armor: 10, evasion: 12, agility: 6 } },
    { id: 'arcane_hood', name: 'Arcane Hood', rarity: 'rare', modifiers: { armor: 8, intelligence: 10, mana: 40 } },
    { id: 'crown_of_might', name: 'Crown of Might', rarity: 'epic', modifiers: { armor: 35, strength: 12, vitality: 8 } },
  ],
  Chest: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'leather_vest', name: 'Leather Vest', rarity: 'common', modifiers: { armor: 20, agility: 2 } },
    { id: 'chainmail', name: 'Chainmail', rarity: 'uncommon', modifiers: { armor: 42, vitality: 5 } },
    { id: 'plate_armor', name: 'Plate Armor', rarity: 'rare', modifiers: { armor: 65, strength: 5, vitality: 8 } },
    { id: 'robes_of_arcana', name: 'Robes of Arcana', rarity: 'rare', modifiers: { armor: 15, intelligence: 14, mana: 60 } },
    { id: 'shadowweave_garb', name: 'Shadowweave Garb', rarity: 'epic', modifiers: { armor: 30, agility: 10, evasion: 18 } },
  ],
  Gloves: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'leather_gloves', name: 'Leather Gloves', rarity: 'common', modifiers: { armor: 8, dexterity: 2 } },
    { id: 'gauntlets', name: 'Iron Gauntlets', rarity: 'uncommon', modifiers: { armor: 18, strength: 3 } },
    { id: 'swift_wraps', name: 'Swift Wraps', rarity: 'rare', modifiers: { armor: 10, agility: 8, dexterity: 5 } },
    { id: 'spellweave_gloves', name: 'Spellweave Gloves', rarity: 'rare', modifiers: { armor: 6, intelligence: 8, mana: 20 } },
  ],
  Boots: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'leather_boots', name: 'Leather Boots', rarity: 'common', modifiers: { armor: 8, agility: 3 } },
    { id: 'iron_boots', name: 'Iron Boots', rarity: 'uncommon', modifiers: { armor: 16, vitality: 2 } },
    { id: 'windsprint_boots', name: 'Windsprint Boots', rarity: 'rare', modifiers: { armor: 10, agility: 10, evasion: 8 } },
    { id: 'arcane_treads', name: 'Arcane Treads', rarity: 'rare', modifiers: { armor: 8, intelligence: 5, mana: 15 } },
  ],
  Weapon: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'iron_sword', name: 'Iron Sword', rarity: 'common', modifiers: { damage: 18, strength: 2 } },
    { id: 'steel_axe', name: 'Steel Axe', rarity: 'uncommon', modifiers: { damage: 30, strength: 5 } },
    { id: 'shadow_dagger', name: 'Shadow Dagger', rarity: 'rare', modifiers: { damage: 24, agility: 8, critChance: 5 } },
    { id: 'staff_of_flames', name: 'Staff of Flames', rarity: 'rare', modifiers: { damage: 22, intelligence: 12, mana: 30 } },
    { id: 'longbow', name: 'Elven Longbow', rarity: 'rare', modifiers: { damage: 28, dexterity: 8, critChance: 4 } },
    { id: 'sword_of_light', name: 'Sword of Light', rarity: 'epic', modifiers: { damage: 40, strength: 10, intelligence: 6 } },
  ],
  'Off-hand': [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'wooden_shield', name: 'Wooden Shield', rarity: 'common', modifiers: { armor: 12, vitality: 2 } },
    { id: 'iron_shield', name: 'Iron Shield', rarity: 'uncommon', modifiers: { armor: 25, vitality: 4 } },
    { id: 'arcane_orb', name: 'Arcane Orb', rarity: 'rare', modifiers: { damage: 10, intelligence: 10, mana: 25 } },
    { id: 'quiver', name: 'Magic Quiver', rarity: 'uncommon', modifiers: { damage: 8, dexterity: 5 } },
  ],
  'Ring 1': [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'ring_str', name: 'Ring of Strength', rarity: 'uncommon', modifiers: { strength: 5 } },
    { id: 'ring_agi', name: 'Ring of Agility', rarity: 'uncommon', modifiers: { agility: 5 } },
    { id: 'ring_int', name: 'Ring of Intellect', rarity: 'uncommon', modifiers: { intelligence: 5 } },
    { id: 'ring_vitality', name: 'Ring of Vitality', rarity: 'uncommon', modifiers: { vitality: 6 } },
    { id: 'ring_power', name: 'Ring of Power', rarity: 'epic', modifiers: { damage: 12, strength: 6, critChance: 3 } },
  ],
  'Ring 2': [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'ring_str', name: 'Ring of Strength', rarity: 'uncommon', modifiers: { strength: 5 } },
    { id: 'ring_agi', name: 'Ring of Agility', rarity: 'uncommon', modifiers: { agility: 5 } },
    { id: 'ring_int', name: 'Ring of Intellect', rarity: 'uncommon', modifiers: { intelligence: 5 } },
    { id: 'ring_evasion', name: 'Ring of Evasion', rarity: 'rare', modifiers: { evasion: 10, agility: 4 } },
    { id: 'ring_arcane', name: 'Ring of Arcane', rarity: 'epic', modifiers: { damage: 10, intelligence: 8, mana: 30 } },
  ],
  Amulet: [
    { id: 'none', name: '-- None --', modifiers: {} },
    { id: 'amulet_guardian', name: "Guardian's Amulet", rarity: 'uncommon', modifiers: { armor: 10, vitality: 5 } },
    { id: 'amulet_shadow', name: "Shadow's Embrace", rarity: 'rare', modifiers: { damage: 8, evasion: 10, agility: 6 } },
    { id: 'amulet_arcane', name: 'Arcane Pendant', rarity: 'rare', modifiers: { intelligence: 12, mana: 50, damage: 6 } },
    { id: 'amulet_champion', name: "Champion's Medallion", rarity: 'epic', modifiers: { damage: 15, armor: 15, vitality: 10 } },
  ],
};
