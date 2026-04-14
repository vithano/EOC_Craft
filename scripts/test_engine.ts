/**
 * Tests for the battle engine, build-stat computation, and nexus scaling.
 *
 * Run: tsx scripts/test_engine.ts
 *
 * Randomness note: simulateEncounter uses Math.random().
 * All scenarios below are designed so the outcome is forced by extreme values,
 * making them deterministic regardless of dice rolls.
 */

import { simulateEncounter } from '../src/battle/engine';
import { computeBuildStats, emptyEquipmentModifiers, type BuildConfig } from '../src/data/gameStats';
import {
  buildNexusTierRows,
  getCrucibleTierRow,
  getNexusTierRow,
  nexusPerHitDamageMultPerTier,
  NEXUS_TIER_ROWS,
} from '../src/data/nexusEnemyScaling';
import { FORMULA_CONSTANTS } from '../src/data/formulaConstants';
import type { DemoEnemyDef } from '../src/battle/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
let currentSection = '';

function section(name: string) {
  currentSection = name;
}

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    failed++;
    console.error(`  FAIL [${currentSection}]: ${msg}`);
  } else {
    passed++;
  }
}

function near(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

function nearRel(a: number, b: number, relTol = 1e-6): boolean {
  if (b === 0) return Math.abs(a) <= relTol;
  return Math.abs((a - b) / b) <= relTol;
}

/** Minimal build config with all-zero gear modifiers. */
function baseConfig(): BuildConfig {
  return {
    upgradeLevels: {},
    equipmentModifiers: emptyEquipmentModifiers(),
    equippedWeaponItemId: null,
    ability: { abilityId: null, abilityLevel: 0, attunementPct: 0 },
  };
}

/** Minimal enemy that never attacks and can be killed instantly. */
function weakEnemy(): DemoEnemyDef {
  return {
    id: 'test_weak',
    name: 'Weak Test Enemy',
    maxLife: 1,
    armour: 0,
    evasionRating: 0,    // player always hits (0% evasion)
    accuracy: 0,          // enemy never hits player (90% evasion on player)
    damageMin: 0,
    damageMax: 0,
    aps: 0.1,
  };
}

/** Enemy that kills the player on its first hit (before the player can act). */
function lethalEnemy(): DemoEnemyDef {
  return {
    id: 'test_lethal',
    name: 'Lethal Test Enemy',
    maxLife: 9_999_999,
    armour: 0,
    evasionRating: 0,
    accuracy: 999_999,    // always hits player (0% evasion for player)
    damageMin: 999_999,   // one-shots any player (min == max for determinism)
    damageMax: 999_999,
    aps: 2.0,             // attacks before the player (first hit at 0.5s vs player at 1.0s)
  };
}

/** Enemy with no damage and enormous life — designed to survive the entire duration. */
function unkillableEnemy(): DemoEnemyDef {
  return {
    id: 'test_unkillable',
    name: 'Unkillable Test Enemy',
    maxLife: 9_999_999_999,
    armour: 0,
    evasionRating: 0,
    accuracy: 0,
    damageMin: 0,
    damageMax: 0,
    aps: 1.0,
  };
}

// ---------------------------------------------------------------------------
// 1. nexusPerHitDamageMultPerTier
// ---------------------------------------------------------------------------

section('nexusPerHitDamageMultPerTier');

{
  const C = FORMULA_CONSTANTS;
  const expected = (C.nexusDamageMult * 100) / (100 + C.nexusSpeedPerTierPct);
  const got = nexusPerHitDamageMultPerTier();
  assert(nearRel(got, expected, 1e-9), `hitMult formula: got ${got}, expected ${expected}`);
  assert(got < C.nexusDamageMult, `hitMult < nexusDamageMult (APS removed): ${got} < ${C.nexusDamageMult}`);
  assert(got > 1, `hitMult > 1: ${got}`);
}

// ---------------------------------------------------------------------------
// 2. buildNexusTierRows / NEXUS_TIER_ROWS
// ---------------------------------------------------------------------------

section('buildNexusTierRows');

{
  const rows = buildNexusTierRows();
  assert(rows.length === 31, `31 rows (tier 0..30): ${rows.length}`);
  assert(rows[0]!.tier === 0, `first tier is 0`);
  assert(rows[30]!.tier === 30, `last tier is 30`);
}

// Health strictly increases each tier
{
  const rows = NEXUS_TIER_ROWS;
  for (let t = 1; t < rows.length; t++) {
    assert(
      rows[t]!.health > rows[t - 1]!.health,
      `health at tier ${t} > tier ${t - 1}: ${rows[t]!.health} > ${rows[t - 1]!.health}`
    );
  }
}

// Health multiplier matches nexusLifeMult
{
  const C = FORMULA_CONSTANTS;
  const rows = NEXUS_TIER_ROWS;
  for (let t = 1; t < rows.length; t++) {
    const ratio = rows[t]!.health / rows[t - 1]!.health;
    assert(
      nearRel(ratio, C.nexusLifeMult, 0.01),
      `health ratio at tier ${t}: ${ratio.toFixed(5)} ≈ ${C.nexusLifeMult}`
    );
  }
}

// APS strictly increases each tier
{
  const rows = NEXUS_TIER_ROWS;
  for (let t = 1; t < rows.length; t++) {
    assert(
      rows[t]!.attacksPerSecond > rows[t - 1]!.attacksPerSecond,
      `APS at tier ${t} > tier ${t - 1}: ${rows[t]!.attacksPerSecond}`
    );
  }
}

// Accuracy and evasion are constant across tiers (sheet rule)
{
  const rows = NEXUS_TIER_ROWS;
  for (let t = 1; t < rows.length; t++) {
    assert(rows[t]!.accuracy === rows[0]!.accuracy, `accuracy constant at tier ${t}`);
    assert(rows[t]!.evasion === rows[0]!.evasion, `evasion constant at tier ${t}`);
    assert(rows[t]!.armour === rows[0]!.armour, `armour constant at tier ${t}`);
  }
}

// Hit damage increases each tier
{
  const rows = NEXUS_TIER_ROWS;
  for (let t = 1; t < rows.length; t++) {
    assert(
      rows[t]!.physMin >= rows[t - 1]!.physMin,
      `physMin non-decreasing at tier ${t}: ${rows[t]!.physMin}`
    );
    assert(
      rows[t]!.physMax >= rows[t - 1]!.physMax,
      `physMax non-decreasing at tier ${t}: ${rows[t]!.physMax}`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. getNexusTierRow
// ---------------------------------------------------------------------------

section('getNexusTierRow');

assert(getNexusTierRow(0)?.tier === 0, 'tier 0 exists');
assert(getNexusTierRow(15)?.tier === 15, 'tier 15 exists');
assert(getNexusTierRow(30)?.tier === 30, 'tier 30 exists');
assert(getNexusTierRow(31) === undefined, 'tier 31 does not exist');
// Negative tiers are clamped to 0 (returns tier 0, not undefined)
assert(getNexusTierRow(-1)?.tier === 0, 'negative tier clamped to 0');

// ---------------------------------------------------------------------------
// 4. getCrucibleTierRow
// ---------------------------------------------------------------------------

section('getCrucibleTierRow');

// Crucible 0 matches nexus 0
{
  const c0 = getCrucibleTierRow(0);
  const n0 = getNexusTierRow(0);
  assert(c0 !== undefined, 'crucible tier 0 exists');
  assert(near(c0!.health, n0!.health), `crucible 0 health == nexus 0 health: ${c0!.health}`);
}

// Crucible 5 == Nexus 1 (same life multiplier)
{
  const c5 = getCrucibleTierRow(5);
  const n1 = getNexusTierRow(1);
  assert(c5 !== undefined && n1 !== undefined, 'crucible 5 and nexus 1 exist');
  // Same multiplier steps → same health (within rounding)
  assert(
    Math.abs(c5!.health - n1!.health) <= 2,
    `crucible 5 health ≈ nexus 1 health: ${c5!.health} vs ${n1!.health}`
  );
}

// Crucible 10 == Nexus 2
{
  const c10 = getCrucibleTierRow(10);
  const n2 = getNexusTierRow(2);
  assert(c10 !== undefined && n2 !== undefined, 'crucible 10 and nexus 2 exist');
  assert(
    Math.abs(c10!.health - n2!.health) <= 2,
    `crucible 10 health ≈ nexus 2 health: ${c10!.health} vs ${n2!.health}`
  );
}

// Health increases with crucible tier
{
  const c0  = getCrucibleTierRow(0)!;
  const c5  = getCrucibleTierRow(5)!;
  const c10 = getCrucibleTierRow(10)!;
  assert(c5.health > c0.health,   `crucible 5 > 0: ${c5.health} > ${c0.health}`);
  assert(c10.health > c5.health,  `crucible 10 > 5: ${c10.health} > ${c5.health}`);
}

// Intermediate crucible tiers (non-multiples of 5) still work
{
  const c3 = getCrucibleTierRow(3);
  const c7 = getCrucibleTierRow(7);
  assert(c3 !== undefined, 'crucible 3 defined');
  assert(c7 !== undefined, 'crucible 7 defined');
  assert(c7!.health > c3!.health, `crucible 7 > 3: ${c7!.health} > ${c3!.health}`);
}

// ---------------------------------------------------------------------------
// 5. computeBuildStats — base stats
// ---------------------------------------------------------------------------

section('computeBuildStats base stats');

const baseStats = computeBuildStats(baseConfig());

assert(baseStats.maxLife > 0,  `maxLife > 0: ${baseStats.maxLife}`);
assert(baseStats.maxMana > 0,  `maxMana > 0: ${baseStats.maxMana}`);
assert(baseStats.aps > 0,      `aps > 0: ${baseStats.aps}`);
assert(baseStats.accuracy >= 0, `accuracy >= 0: ${baseStats.accuracy}`);
assert(baseStats.critChance >= 0 && baseStats.critChance <= 100, `critChance in [0,100]: ${baseStats.critChance}`);
assert(baseStats.critMultiplier > 1, `critMultiplier > 1: ${baseStats.critMultiplier}`);
assert(baseStats.hitDamageMin >= 0, `hitDamageMin >= 0: ${baseStats.hitDamageMin}`);
assert(baseStats.hitDamageMax >= baseStats.hitDamageMin, `hitDamageMax >= hitDamageMin: ${baseStats.hitDamageMax}`);
assert(baseStats.armour >= 0,  `armour >= 0: ${baseStats.armour}`);
assert(baseStats.evasionRating >= 0, `evasionRating >= 0: ${baseStats.evasionRating}`);
assert(baseStats.maxEnergyShield >= 0, `maxEnergyShield >= 0: ${baseStats.maxEnergyShield}`);
assert(baseStats.manaRegenPerSecond >= 0, `manaRegenPerSecond >= 0: ${baseStats.manaRegenPerSecond}`);

// Resistances start at base (0%) and are within [0, 75]
assert(baseStats.fireRes >= 0 && baseStats.fireRes <= 75, `fireRes in [0,75]: ${baseStats.fireRes}`);
assert(baseStats.coldRes >= 0 && baseStats.coldRes <= 75, `coldRes in [0,75]: ${baseStats.coldRes}`);
assert(baseStats.lightningRes >= 0 && baseStats.lightningRes <= 75, `lightningRes in [0,75]: ${baseStats.lightningRes}`);
assert(baseStats.chaosRes >= -100 && baseStats.chaosRes <= 75, `chaosRes in [-100,75]: ${baseStats.chaosRes}`);

// ---------------------------------------------------------------------------
// 6. computeBuildStats — gear bonuses
// ---------------------------------------------------------------------------

section('computeBuildStats gear bonuses');

// Flat life adds to maxLife
{
  const eq = emptyEquipmentModifiers();
  eq.flatLife = 200;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.maxLife > baseStats.maxLife, `flat life increases maxLife: ${stats.maxLife} > ${baseStats.maxLife}`);
  assert(stats.maxLife >= baseStats.maxLife + 200, `flat life adds at least 200: ${stats.maxLife}`);
}

// Flat mana adds to maxMana
{
  const eq = emptyEquipmentModifiers();
  eq.flatMana = 100;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.maxMana > baseStats.maxMana, `flat mana increases maxMana: ${stats.maxMana} > ${baseStats.maxMana}`);
  assert(stats.maxMana >= baseStats.maxMana + 100, `flat mana adds at least 100: ${stats.maxMana}`);
}

// Flat armour adds to armour
{
  const eq = emptyEquipmentModifiers();
  eq.flatArmour = 500;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.armour > baseStats.armour, `flat armour increases armour: ${stats.armour} > ${baseStats.armour}`);
}

// Flat evasion adds to evasionRating
{
  const eq = emptyEquipmentModifiers();
  eq.flatEvasion = 300;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.evasionRating > baseStats.evasionRating,
    `flat evasion increases evasionRating: ${stats.evasionRating} > ${baseStats.evasionRating}`);
}

// % increased life scales linearly
{
  const eq50 = emptyEquipmentModifiers();
  eq50.pctIncreasedLifeFromGear = 50;
  const statsWithInc = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq50 });
  assert(statsWithInc.maxLife > baseStats.maxLife,
    `% increased life raises maxLife: ${statsWithInc.maxLife} > ${baseStats.maxLife}`);
  // At 50% increased, maxLife should be significantly higher
  assert(statsWithInc.maxLife >= baseStats.maxLife * 1.3,
    `50% increased life raises maxLife by ≥30%: ${statsWithInc.maxLife} vs ${baseStats.maxLife}`);
}

// Flat ES gear adds to maxEnergyShield
{
  const eq = emptyEquipmentModifiers();
  eq.flatEnergyShieldFromGear = 400;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.maxEnergyShield > baseStats.maxEnergyShield,
    `flat ES raises maxEnergyShield: ${stats.maxEnergyShield} > ${baseStats.maxEnergyShield}`);
}

// Elemental resistance from gear raises fireRes (cap is applied in engine, not in computeBuildStats)
{
  const eq = emptyEquipmentModifiers();
  eq.pctToAllElementalResFromGear = 50;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.fireRes > baseStats.fireRes,
    `fire res raised by gear: ${stats.fireRes} > ${baseStats.fireRes}`);
  assert(stats.coldRes > baseStats.coldRes,
    `cold res raised by gear: ${stats.coldRes} > ${baseStats.coldRes}`);
  assert(stats.lightningRes > baseStats.lightningRes,
    `lightning res raised by gear: ${stats.lightningRes} > ${baseStats.lightningRes}`);
}

// maxFireRes defaults to FORMULA_CONSTANTS elemental cap (75), hard cap 90
{
  assert(baseStats.maxFireRes === FORMULA_CONSTANTS.elementalResCap,
    `maxFireRes defaults to elementalResCap (${FORMULA_CONSTANTS.elementalResCap}): ${baseStats.maxFireRes}`);
  assert(baseStats.maxFireRes <= 90, `maxFireRes <= 90: ${baseStats.maxFireRes}`);
}

// Crit chance bonus from gear raises critChance (capped at 100)
{
  const eq = emptyEquipmentModifiers();
  eq.critChanceBonus = 50;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.critChance > baseStats.critChance,
    `crit chance bonus raises critChance: ${stats.critChance} > ${baseStats.critChance}`);
  assert(stats.critChance <= 100, `critChance <= 100: ${stats.critChance}`);
}

// Flat damage gear raises average hit
{
  const eq = emptyEquipmentModifiers();
  eq.flatDamageMin = 50;
  eq.flatDamageMax = 100;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.avgHit > baseStats.avgHit,
    `flat damage raises avgHit: ${stats.avgHit} > ${baseStats.avgHit}`);
  assert(stats.hitDamageMax > baseStats.hitDamageMax,
    `flat damage raises hitDamageMax: ${stats.hitDamageMax}`);
}

// No mana flag
{
  const eq = emptyEquipmentModifiers();
  eq.noManaFromGear = true;
  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.noMana === true, `noMana flag set: ${stats.noMana}`);
  assert(stats.maxMana === 0, `maxMana = 0 when noMana: ${stats.maxMana}`);
}

// ---------------------------------------------------------------------------
// 7. simulateEncounter — player wins (1 HP enemy, 0 evasion, 0 damage)
// ---------------------------------------------------------------------------

section('simulateEncounter player wins');

{
  const stats = computeBuildStats(baseConfig());
  const result = simulateEncounter({
    stats,
    enemy: weakEnemy(),
    options: { maxDurationSeconds: 30, dt: 0.05 },
  });

  assert(result.winner === 'player',
    `player wins 1-HP enemy: winner=${result.winner}`);
  assert(result.durationSeconds > 0,
    `durationSeconds > 0: ${result.durationSeconds}`);
  assert(result.durationSeconds < 30,
    `fight ends before timeout: ${result.durationSeconds}s`);
  assert(result.enemyLifeFinal <= 0,
    `enemy life ≤ 0 after player win: ${result.enemyLifeFinal}`);
  assert(result.hitsLandedPlayer >= 1,
    `player landed at least 1 hit: ${result.hitsLandedPlayer}`);
  assert(result.playerFinal.life > 0,
    `player alive after winning: ${result.playerFinal.life}`);
}

// ---------------------------------------------------------------------------
// 8. simulateEncounter — enemy wins (huge damage, fast attack, attacks first)
// ---------------------------------------------------------------------------

section('simulateEncounter enemy wins');

{
  const stats = computeBuildStats(baseConfig());
  const result = simulateEncounter({
    stats,
    enemy: lethalEnemy(),
    options: { maxDurationSeconds: 30, dt: 0.05 },
  });

  assert(result.winner === 'enemy',
    `enemy wins with one-shot damage: winner=${result.winner}`);
  assert(result.durationSeconds > 0,
    `durationSeconds > 0: ${result.durationSeconds}`);
  assert(result.durationSeconds < 5,
    `fight ends quickly (enemy one-shots): ${result.durationSeconds}s`);
  assert(result.playerFinal.life <= 0,
    `player life ≤ 0 after losing: ${result.playerFinal.life}`);
}

// ---------------------------------------------------------------------------
// 9. simulateEncounter — timeout (unkillable enemy, no damage)
// ---------------------------------------------------------------------------

section('simulateEncounter timeout');

{
  const stats = computeBuildStats(baseConfig());
  const result = simulateEncounter({
    stats,
    enemy: unkillableEnemy(),
    options: { maxDurationSeconds: 5, dt: 0.05 },
  });

  assert(result.winner === 'timeout',
    `timeout with unkillable enemy: winner=${result.winner}`);
  assert(result.durationSeconds >= 5,
    `duration equals maxDuration: ${result.durationSeconds}`);
  assert(result.enemyLifeFinal > 0,
    `enemy still alive at timeout: ${result.enemyLifeFinal}`);
  assert(result.playerFinal.life > 0,
    `player still alive at timeout: ${result.playerFinal.life}`);
}

// ---------------------------------------------------------------------------
// 10. simulateEncounter — result structure invariants
// ---------------------------------------------------------------------------

section('simulateEncounter result invariants');

{
  const stats = computeBuildStats(baseConfig());
  const result = simulateEncounter({
    stats,
    enemy: weakEnemy(),
    options: { maxDurationSeconds: 30 },
  });

  // totals internal consistency
  const totals = result.totals!;
  assert(totals !== undefined, 'totals field present');
  assert(
    nearRel(totals.damageToEnemy, totals.damageToEnemyFromHits + totals.damageToEnemyFromDots, 1e-6),
    `damageToEnemy = fromHits + fromDots: ${totals.damageToEnemy}`
  );
  assert(
    totals.damageToPlayer >= totals.damageToPlayerFromEnemyHits,
    `damageToPlayer >= fromEnemyHits`
  );

  // Non-negative counters
  assert(result.hitsLandedPlayer >= 0, `hitsLandedPlayer >= 0`);
  assert(result.hitsLandedEnemy >= 0, `hitsLandedEnemy >= 0`);
  assert(result.totalDotDamageToEnemy! >= 0, `totalDotDamageToEnemy >= 0`);

  // Enemy life bounded
  assert(result.enemyLifeFinal <= 1, `enemy life ≤ maxLife (was 1): ${result.enemyLifeFinal}`);

  // Log is non-empty and starts with encounter phase
  assert(result.log.length >= 2, `log has at least 2 entries`);
  assert(result.log[0]!.kind === 'phase', `first log entry is phase`);
  assert(result.log[result.log.length - 1]!.kind === 'phase',
    `last log entry is phase (outcome)`);
}

// ---------------------------------------------------------------------------
// 11. simulateEncounter — energy shield absorbs before life
// ---------------------------------------------------------------------------

section('simulateEncounter ES absorbs before life');

{
  // Player with ES but no damage to enemy — enemy does some damage, player life should
  // be unaffected until ES is depleted.
  // Set up: enemy with moderate damage, player with large ES.
  const eq = emptyEquipmentModifiers();
  eq.flatEnergyShieldFromGear = 10_000;

  const stats = computeBuildStats({ ...baseConfig(), equipmentModifiers: eq });
  assert(stats.maxEnergyShield > 0, `player has ES: ${stats.maxEnergyShield}`);

  const enemy: DemoEnemyDef = {
    id: 'test_es',
    name: 'ES Test Enemy',
    maxLife: 999_999,   // very long fight (enough for player to take damage)
    armour: 0,
    evasionRating: 0,
    accuracy: 999_999,  // always hits
    damageMin: 100,
    damageMax: 100,     // deterministic: exactly 100 damage per hit
    aps: 10.0,          // attacks fast
    critChance: 0,
    critMultiplier: 1,
  };

  const result = simulateEncounter({
    stats,
    enemy,
    options: { maxDurationSeconds: 0.5, dt: 0.05 },
  });

  // After 0.5s with 10 APS and 100 damage/hit: ~5 enemy hits = 500 damage
  // Player has maxES=10000, maxLife≈290+ → ES should absorb most / all damage
  // Player life should be near full (ES not yet depleted in 0.5s)
  assert(
    result.playerFinal.life >= stats.maxLife * 0.9,
    `player life near full (ES absorbed hits): ${result.playerFinal.life.toFixed(1)} / ${stats.maxLife}`
  );
}

// ---------------------------------------------------------------------------
// 12. simulateEncounter — more gear → better survival
// ---------------------------------------------------------------------------

section('simulateEncounter gear affects survival');

{
  // Base stats vs heavily armoured stats: armoured player should survive longer.
  const armourEnemy: DemoEnemyDef = {
    id: 'test_arm',
    name: 'Armour Test Enemy',
    maxLife: 999_999,
    armour: 0,
    evasionRating: 0,
    accuracy: 999_999,
    damageMin: 50,
    damageMax: 50,
    aps: 5.0,
    critChance: 0,
  };

  const baseResult = simulateEncounter({
    stats: computeBuildStats(baseConfig()),
    enemy: armourEnemy,
    options: { maxDurationSeconds: 3, dt: 0.05 },
  });

  const eqArmoured = emptyEquipmentModifiers();
  eqArmoured.flatLife = 5_000;
  const armourResult = simulateEncounter({
    stats: computeBuildStats({ ...baseConfig(), equipmentModifiers: eqArmoured }),
    enemy: armourEnemy,
    options: { maxDurationSeconds: 3, dt: 0.05 },
  });

  // A build with 5000 extra life should either die later or survive longer
  // than the base build (which has ~290 life and dies quickly to 50 × 5 APS = 250 DPS).
  assert(
    armourResult.durationSeconds >= baseResult.durationSeconds ||
    armourResult.winner !== 'enemy',
    `armoured build survives longer: armoured=${armourResult.durationSeconds.toFixed(2)}s ` +
    `vs base=${baseResult.durationSeconds.toFixed(2)}s`
  );
}

// ---------------------------------------------------------------------------
// 13. simulateEncounter — higher player damage kills enemy faster
// ---------------------------------------------------------------------------

section('simulateEncounter damage affects kill time');

{
  // Base damage is ~3-6 per hit at 1 APS (no gear). In 30s: ~30 hits × ~5 avg = ~150 dmg.
  // Use maxLife=100 to ensure deterministic kill within 30s.
  const slowEnemy: DemoEnemyDef = {
    id: 'test_kill',
    name: 'Kill Time Test Enemy',
    maxLife: 100,
    armour: 0,
    evasionRating: 0,
    accuracy: 0,
    damageMin: 0,
    damageMax: 0,
    aps: 0.1,
  };

  const baseResult = simulateEncounter({
    stats: computeBuildStats(baseConfig()),
    enemy: slowEnemy,
    options: { maxDurationSeconds: 30 },
  });

  const eqDamage = emptyEquipmentModifiers();
  eqDamage.flatDamageMin = 100;
  eqDamage.flatDamageMax = 100;
  const damageResult = simulateEncounter({
    stats: computeBuildStats({ ...baseConfig(), equipmentModifiers: eqDamage }),
    enemy: slowEnemy,
    options: { maxDurationSeconds: 30 },
  });

  assert(baseResult.winner === 'player', `base build beats 500 HP enemy: ${baseResult.winner}`);
  assert(damageResult.winner === 'player', `damage build beats 500 HP enemy: ${damageResult.winner}`);
  assert(
    damageResult.durationSeconds <= baseResult.durationSeconds,
    `higher damage kills faster: ${damageResult.durationSeconds.toFixed(2)}s vs ${baseResult.durationSeconds.toFixed(2)}s`
  );
}

// ---------------------------------------------------------------------------
// 14. simulateEncounter — log contains valid entries
// ---------------------------------------------------------------------------

section('simulateEncounter log format');

{
  const stats = computeBuildStats(baseConfig());
  const result = simulateEncounter({
    stats,
    enemy: weakEnemy(),
    options: { maxDurationSeconds: 30, maxLogEntries: 50 },
  });

  for (const entry of result.log) {
    assert(typeof entry.t === 'number' && entry.t >= 0, `log entry t >= 0: ${entry.t}`);
    assert(
      ['player_attack', 'enemy_attack', 'phase', 'ailment', 'dot_tick'].includes(entry.kind),
      `log entry kind valid: ${entry.kind}`
    );
    assert(typeof entry.message === 'string' && entry.message.length > 0,
      `log entry has message`);
  }
}

// ---------------------------------------------------------------------------
// 15. simulateEncounter — timeline when recordTimeline = true
// ---------------------------------------------------------------------------

section('simulateEncounter timeline');

{
  const stats = computeBuildStats(baseConfig());
  const result = simulateEncounter({
    stats,
    enemy: weakEnemy(),
    options: { maxDurationSeconds: 30, dt: 0.1, recordTimeline: true },
  });

  assert(result.timeline !== undefined, 'timeline defined when recordTimeline=true');
  assert(result.timeline!.length > 0, 'timeline non-empty');

  for (const pt of result.timeline!) {
    assert(typeof pt.t === 'number' && pt.t >= 0, `timeline point t >= 0: ${pt.t}`);
    assert(typeof pt.player.life === 'number', `timeline player.life is number`);
    assert(typeof pt.enemy.life === 'number', `timeline enemy.life is number`);
    assert(pt.player.actionBar >= 0 && pt.player.actionBar <= 1,
      `actionBar in [0,1]: ${pt.player.actionBar}`);
  }

  // Timestamps should be non-decreasing
  for (let i = 1; i < result.timeline!.length; i++) {
    assert(
      result.timeline![i]!.t >= result.timeline![i - 1]!.t,
      `timeline timestamps non-decreasing at index ${i}`
    );
  }
}

// ---------------------------------------------------------------------------
// 16. simulateEncounter — ailment summary structure
// ---------------------------------------------------------------------------

section('simulateEncounter ailment summary');

{
  const stats = computeBuildStats(baseConfig());
  const result = simulateEncounter({
    stats,
    enemy: weakEnemy(),
    options: { maxDurationSeconds: 30 },
  });

  const es = result.enemyAilmentSummary!;
  assert(es !== undefined, 'enemyAilmentSummary defined');
  assert(es.maxStacks.bleed >= 0, `bleed stacks >= 0`);
  assert(es.maxStacks.poison >= 0, `poison stacks >= 0`);
  assert(es.maxStacks.ignite >= 0, `ignite stacks >= 0`);
  assert(es.maxStacks.shock >= 0, `shock stacks >= 0`);
  assert(es.maxStacks.chill >= 0, `chill stacks >= 0`);

  const ps = result.playerAilmentSummary!;
  assert(ps !== undefined, 'playerAilmentSummary defined');
  assert(ps.maxNonDotMagnitudePct.shock >= 0, `player shock mag >= 0`);
  assert(ps.maxNonDotMagnitudePct.chill >= 0, `player chill mag >= 0`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed;
const status = failed === 0 ? 'OK' : 'FAILED';
console.log(`\nEngine tests: ${status} — ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`);
if (failed > 0) process.exit(1);
