import type { ItemModifiers } from './equipment';

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  modifiers: ItemModifiers;
}

export const UPGRADES: Record<string, Upgrade[]> = {
  warrior: [
    { id: 'berserker_rage', name: 'Berserker Rage', description: '+15% damage when below 30% HP', modifiers: { damage: 8 } },
    { id: 'iron_skin', name: 'Iron Skin', description: 'Passively increases armor by 20', modifiers: { armor: 20 } },
    { id: 'battle_cry', name: 'Battle Cry', description: 'Increases strength by 10 during combat', modifiers: { strength: 10 } },
    { id: 'shield_mastery', name: 'Shield Mastery', description: 'Off-hand armor bonus doubled', modifiers: { armor: 15 } },
    { id: 'war_veteran', name: 'War Veteran', description: 'Increases vitality and health pool', modifiers: { vitality: 8, health: 50 } },
  ],
  mage: [
    { id: 'arcane_mastery', name: 'Arcane Mastery', description: '+20% spell damage from intelligence', modifiers: { damage: 10 } },
    { id: 'mana_conduit', name: 'Mana Conduit', description: 'Increases max mana by 80', modifiers: { mana: 80 } },
    { id: 'spell_echo', name: 'Spell Echo', description: '10% chance to cast spells twice', modifiers: { critChance: 5 } },
    { id: 'arcane_shield', name: 'Arcane Shield', description: 'Converts 10 intelligence to armor', modifiers: { armor: 12 } },
    { id: 'mana_surge', name: 'Mana Surge', description: 'Increases damage based on mana pool', modifiers: { damage: 8, intelligence: 6 } },
  ],
  rogue: [
    { id: 'shadowstep', name: 'Shadowstep', description: 'Greatly increases evasion chance', modifiers: { evasion: 20 } },
    { id: 'poison_blade', name: 'Poison Blade', description: 'Adds poison damage over time', modifiers: { damage: 12 } },
    { id: 'critical_eye', name: 'Critical Eye', description: 'Increases critical hit chance by 8%', modifiers: { critChance: 8 } },
    { id: 'acrobatics', name: 'Acrobatics', description: 'Agility also increases evasion by 50%', modifiers: { agility: 8, evasion: 10 } },
    { id: 'shadow_cloak', name: 'Shadow Cloak', description: 'Start fights with 2s invisibility', modifiers: { evasion: 15 } },
  ],
  paladin: [
    { id: 'divine_shield', name: 'Divine Shield', description: 'Temporary invulnerability once per fight', modifiers: { armor: 20 } },
    { id: 'holy_light', name: 'Holy Light', description: 'Healing spells are 30% more effective', modifiers: { vitality: 10 } },
    { id: 'consecration', name: 'Consecration', description: 'Deals holy damage to surrounding enemies', modifiers: { damage: 10 } },
    { id: 'aura_of_protection', name: 'Aura of Protection', description: 'Reduces incoming damage by 10%', modifiers: { armor: 18 } },
    { id: 'righteous_fury', name: 'Righteous Fury', description: 'Damage increases with each consecutive hit', modifiers: { damage: 14, strength: 4 } },
  ],
  ranger: [
    { id: 'eagle_eye', name: 'Eagle Eye', description: 'Increases range and accuracy significantly', modifiers: { damage: 10 } },
    { id: 'hunters_mark', name: "Hunter's Mark", description: 'Marked targets take 20% more damage', modifiers: { damage: 12 } },
    { id: 'rapid_shot', name: 'Rapid Shot', description: 'Increases attack speed', modifiers: { dexterity: 8 } },
    { id: 'camouflage', name: 'Camouflage', description: 'Evasion increased in outdoor environments', modifiers: { evasion: 15 } },
    { id: 'multishot', name: 'Multishot', description: 'Chance to hit multiple targets', modifiers: { critChance: 6, damage: 8 } },
  ],
};
