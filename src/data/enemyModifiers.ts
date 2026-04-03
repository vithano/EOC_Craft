/**
 * Enemy Modifiers — from `formulas/Echoes of Creation 1.1.1.4 v1 Public - Enemy Modifiers.csv`
 * Descriptive list (no numeric formulas in sheet).
 */

export interface EnemyModifierEntry {
  name: string;
  description?: string;
}

export const ENEMY_MODIFIERS: readonly EnemyModifierEntry[] = [
  { name: 'Assassin' },
  { name: 'Barrier' },
  { name: 'Burning' },
  { name: 'Defender' },
  { name: 'Electrifying' },
  { name: 'Elusive' },
  { name: 'Freezing' },
  { name: 'Hallowed' },
  { name: 'Plated' },
  { name: 'Powerful' },
  { name: 'Regenerating', description: 'Regenerates 2% of max life per second' },
  { name: 'Rending', description: 'Inflicts ?? bleed' },
  { name: 'Replenishing', description: 'Regenerates 2% of max ES per second' },
  { name: 'Soul Eater' },
  { name: 'Sundering' },
  { name: 'Swift' },
  { name: 'Toxic' },
  { name: 'Vampiric' },
  { name: 'Vital' },
  { name: 'Warded' },
];
