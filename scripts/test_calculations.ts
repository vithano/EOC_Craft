/**
 * Comprehensive calculation tests for EOC formulas, ability scaling, and enemy stats.
 *
 * Run: tsx scripts/test_calculations.ts
 */

import {
  computeArmourDR,
  computeArmourDRSingleType,
  armourEffectivenessForType,
  computeEvasionChancePercent,
  computeHitChancePercent,
  computeNonDamagingAilmentEffectPercent,
  computeNonDamagingAilmentEffectFromValidPercentOfLifeEs,
} from '../src/data/eocFormulas';
import { FORMULA_CONSTANTS, scaleEnemyStatToLevel, enemyStatsAtLevel } from '../src/data/formulaConstants';
import {
  attackDamageMultiplierAtAbilityLevel,
  spellBaseDamageAtAbilityLevel,
  abilityManaCostAtLevel,
  abilityManaCostAtLevelTrueRaw,
  physicalElementConversionFromAbilityLines,
} from '../src/data/eocAbilities';

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

// ---------------------------------------------------------------------------
// 1. armourEffectivenessForType
// ---------------------------------------------------------------------------

section('armourEffectivenessForType');

assert(armourEffectivenessForType('physical')  === 1.0,  'physical effectiveness is 1.0');
assert(armourEffectivenessForType('fire')      === 0.5,  'fire effectiveness is 0.5');
assert(armourEffectivenessForType('cold')      === 0.5,  'cold effectiveness is 0.5');
assert(armourEffectivenessForType('lightning') === 0.5,  'lightning effectiveness is 0.5');
assert(armourEffectivenessForType('chaos')     === 0.25, 'chaos effectiveness is 0.25');

// ---------------------------------------------------------------------------
// 2. computeArmourDR — basic behaviour
// ---------------------------------------------------------------------------

section('computeArmourDR basic');

// Zero armour → 0 DR (no additionalDR)
assert(computeArmourDR(0, 100, 100, 'physical') === 0, 'zero armour → 0 DR');

// Very high armour capped at 90 %
{
  const dr = computeArmourDR(1_000_000, 100, 100, 'physical');
  assert(near(dr, FORMULA_CONSTANTS.armourDrCap), `high armour capped at ${FORMULA_CONSTANTS.armourDrCap}: got ${dr}`);
}

// DR is non-negative for any input
assert(computeArmourDR(0, 0, 0, 'physical') >= 0, 'DR >= 0 when armour=0, dmg=0');

// Physical single-type: exact formula check
// armour=1000, dmg=100, physical, no ignore, no additionalDR
// FINAL_ARMOUR = 1000 * 1 * 1 = 1000
// scaling = 10000 * 100/600 = 1666.6̄
// DR = 1000 / (1666.6̄ + 1000) = 1000/2666.6̄ = 0.375
{
  const dr = computeArmourDR(1000, 100, 100, 'physical');
  assert(nearRel(dr, 0.375, 1e-9), `physical DR formula: expected 0.375, got ${dr}`);
}

// ---------------------------------------------------------------------------
// 3. computeArmourDR — damage type effectiveness
// ---------------------------------------------------------------------------

section('computeArmourDR elemental effectiveness');

// Fire: effectiveness = 0.5 → DR should be exactly half what physical gives
// (for the same armour + damage, single type)
{
  const drPhys = computeArmourDR(1000, 100, 100, 'physical');
  const drFire = computeArmourDR(1000, 100, 100, 'fire');
  const drCold = computeArmourDR(1000, 100, 100, 'cold');
  const drLight = computeArmourDR(1000, 100, 100, 'lightning');
  const drChaos = computeArmourDR(1000, 100, 100, 'chaos');

  // Effectiveness 0.5 → FINAL_ARMOUR halved → DR < physical
  assert(drFire < drPhys,  `fire DR < physical DR`);
  assert(drCold < drPhys,  `cold DR < physical DR`);
  assert(drLight < drPhys, `lightning DR < physical DR`);
  assert(drChaos < drFire, `chaos DR < fire DR (lower effectiveness)`);

  // fire / cold / lightning all have same effectiveness
  assert(near(drFire, drCold),  `fire DR === cold DR`);
  assert(near(drFire, drLight), `fire DR === lightning DR`);

  // Numerical check for fire: FINAL_ARMOUR = 1000 * 0.5 = 500
  // scaling = 10000 * 100/600 = 1666.6̄
  // DR = 500 / (1666.6̄ + 500) = 500 / 2166.6̄ = 0.23077...
  assert(nearRel(drFire, 500 / (10000 * 100 / 600 + 500), 1e-9), `fire DR exact formula check`);

  // Chaos: FINAL_ARMOUR = 1000 * 0.25 = 250
  // DR = 250 / (1666.6̄ + 250) = 250 / 1916.6̄ = 0.13043...
  assert(nearRel(drChaos, 250 / (10000 * 100 / 600 + 250), 1e-9), `chaos DR exact formula check`);
}

// ---------------------------------------------------------------------------
// 4. computeArmourDR — multi-type split
// ---------------------------------------------------------------------------

section('computeArmourDR multi-type split');

// When a hit is split across two types, DR per-type is reduced vs single-type
// (armourResistance > 0 when dmgThisType < dmgTotalAllTypes)
{
  const single = computeArmourDR(2000, 100, 100, 'physical');
  const split  = computeArmourDR(2000, 100, 200, 'physical'); // 50% of total is physical
  assert(split < single, `split-type DR (${split}) < single-type DR (${single})`);
}

// When all damage is a single type, split and single wrappers agree
{
  const a = computeArmourDR(500, 80, 80, 'physical');
  const b = computeArmourDRSingleType(500, 80, 'physical');
  assert(near(a, b), `computeArmourDR === computeArmourDRSingleType for single type`);
}

// Armour resistance at 50/50 split: effective DR should be ~half of single-type
{
  const single = computeArmourDRSingleType(2000, 100, 'physical');
  const split  = computeArmourDR(2000, 100, 200, 'physical');
  // armourResistance = 1 - 100/200 = 0.5 → FINAL_ARMOUR halved → DR < single
  assert(split < single, 'half-split DR is less than single-type DR');
}

// ---------------------------------------------------------------------------
// 5. computeArmourDR — armour ignore and additionalDR
// ---------------------------------------------------------------------------

section('computeArmourDR armour ignore / additionalDR');

// Full ignore (fraction = 1) → FINAL_ARMOUR = 0 → only additionalDR
{
  const dr = computeArmourDR(1000, 100, 100, 'physical', 1, 0);
  assert(near(dr, 0), `full armour ignore → 0 DR`);
}

// Half ignore reduces DR
{
  const drFull  = computeArmourDRSingleType(1000, 100, 'physical', 0);
  const drHalf  = computeArmourDRSingleType(1000, 100, 'physical', 0.5);
  assert(drHalf < drFull, `50% ignore reduces DR`);
  // FINAL_ARMOUR halved → same as 500 armour, no ignore
  const drHalf500 = computeArmourDRSingleType(500, 100, 'physical', 0);
  assert(near(drHalf, drHalf500), `50% ignore ≡ halved armour`);
}

// additionalDR stacks additively
{
  const base  = computeArmourDRSingleType(1000, 100, 'physical', 0, 0);
  const bonus = computeArmourDRSingleType(1000, 100, 'physical', 0, 0.1);
  assert(nearRel(bonus, Math.min(base + 0.1, FORMULA_CONSTANTS.armourDrCap), 1e-9),
    `additionalDR 0.1 stacks additively (capped at ${FORMULA_CONSTANTS.armourDrCap})`);
}

// additionalDR alone (no armour) still capped
{
  const dr = computeArmourDR(0, 100, 100, 'physical', 0, 2);
  assert(near(dr, FORMULA_CONSTANTS.armourDrCap), `additionalDR overload still capped at ${FORMULA_CONSTANTS.armourDrCap}`);
}

// Ignore fraction clamped to [0,1] — passing 5 is treated as 1
{
  const drIgnoreOver = computeArmourDR(1000, 100, 100, 'physical', 5, 0);
  const drIgnoreFull = computeArmourDR(1000, 100, 100, 'physical', 1, 0);
  assert(near(drIgnoreOver, drIgnoreFull), `ignore > 1 clamped to 1`);
}

// ---------------------------------------------------------------------------
// 6. computeEvasionChancePercent
// ---------------------------------------------------------------------------

section('computeEvasionChancePercent');

// Reference values from formulas.csv (acc=327, eva=4402)
{
  const C = FORMULA_CONSTANTS;
  const acc = 327, eva = 4402;
  const raw = 1 - (acc * C.evasionAccCoeff) / (acc + eva * C.evasionDivisor);
  const expected = Math.round(Math.min(C.evasionCap, Math.max(0, raw)) * 10000) / 100;
  const got = computeEvasionChancePercent(acc, eva, 0);
  assert(near(got, expected), `evasion reference: got ${got}, expected ${expected}`);
}

// Zero accuracy → nearly 90% evasion (max cap)
{
  const ev = computeEvasionChancePercent(0, 5000, 0);
  assert(near(ev, FORMULA_CONSTANTS.evasionCap * 100),
    `zero accuracy → evasion cap ${FORMULA_CONSTANTS.evasionCap * 100}, got ${ev}`);
}

// Zero evasion → near 0% (attacker always hits)
{
  const ev = computeEvasionChancePercent(500, 0, 0);
  assert(ev >= 0 && ev < 5, `zero evasion gives low evasion chance: ${ev}`);
}

// Capped at 90 even with flat evasion bonus
{
  const ev = computeEvasionChancePercent(1, 100000, 50);
  assert(near(ev, 90), `evasion hard-capped at 90: ${ev}`);
}

// Flat evasion bonus is additive on the clamped output
{
  const withoutFlat = computeEvasionChancePercent(400, 2000, 0);
  const withFlat    = computeEvasionChancePercent(400, 2000, 5);
  const diff = withFlat - withoutFlat;
  // Difference should be 5 unless both are capped
  if (withoutFlat + 5 <= 90) {
    assert(nearRel(diff, 5, 1e-9), `flat evasion +5 gives +5 percent: diff=${diff}`);
  } else {
    assert(near(withFlat, 90), `flat evasion capped at 90 when near cap: ${withFlat}`);
  }
}

// Rounded to 2 decimal places
{
  const ev = computeEvasionChancePercent(327, 4402, 0);
  assert(Math.round(ev * 100) / 100 === ev, `evasion is rounded to 2 decimals: ${ev}`);
}

// ---------------------------------------------------------------------------
// 7. computeHitChancePercent
// ---------------------------------------------------------------------------

section('computeHitChancePercent');

// Hit + evasion = 100
{
  const acc = 400, eva = 3000;
  const evasion = computeEvasionChancePercent(acc, eva, 0);
  const hit     = computeHitChancePercent(acc, eva, 0);
  assert(near(evasion + hit, 100), `hit + evasion = 100: ${hit} + ${evasion}`);
}

// Zero evasion → ~100% hit chance
{
  const hit = computeHitChancePercent(500, 0, 0);
  assert(hit > 95, `zero evasion gives high hit chance: ${hit}`);
}

// ---------------------------------------------------------------------------
// 8. computeNonDamagingAilmentEffectPercent
// ---------------------------------------------------------------------------

section('computeNonDamagingAilmentEffectPercent');

// Zero pool → 0
assert(computeNonDamagingAilmentEffectPercent(100, 0, 0) === 0, 'zero pool → 0 ailment');

// Zero damage → 0
assert(computeNonDamagingAilmentEffectPercent(0, 1000, 0) === 0, 'zero damage → 0 ailment');

// Negative damage → 0
assert(computeNonDamagingAilmentEffectPercent(-50, 1000, 0) === 0, 'negative damage → 0 ailment');

// Discard below 0.01 — need pool large enough so sqrt(dmg/(pool*5))*100 rounds to 0.00
// dmg=1, life=100_000_000 → sqrt(2e-9)*100 ≈ 0.00447 → rounds to 0.00 → discarded
{
  const eff = computeNonDamagingAilmentEffectPercent(1, 100_000_000, 0);
  assert(eff === 0, `tiny ailment discarded (<0.01): ${eff}`);
}

// Exact formula check: dmg=100, life=1000, es=0, all mults=1
// base = sqrt(100 / (1000 * 5)) * 100 = sqrt(0.02) * 100 ≈ 14.1421...
// rounded to 2 = 14.14
{
  const eff = computeNonDamagingAilmentEffectPercent(100, 1000, 0);
  const expected = Math.round(Math.sqrt(100 / (1000 * 5)) * 100 * 100) / 100;
  assert(near(eff, expected), `ailment formula: expected ${expected}, got ${eff}`);
}

// Energy shield adds to pool
{
  const withoutES = computeNonDamagingAilmentEffectPercent(500, 1000, 0);
  const withES    = computeNonDamagingAilmentEffectPercent(500, 1000, 500);
  assert(withES < withoutES, `more ES → larger pool → lower ailment effect`);
}

// ailmentMultiplier scales linearly
{
  const eff1 = computeNonDamagingAilmentEffectPercent(200, 1000, 0, 1);
  const eff2 = computeNonDamagingAilmentEffectPercent(200, 1000, 0, 2);
  assert(nearRel(eff2, eff1 * 2, 0.01), `ailmentMult 2x doubles effect: ${eff2} vs ${eff1 * 2}`);
}

// extraEffectMultiplier = 1.4 (enemy-sourced shock)
{
  const eff1 = computeNonDamagingAilmentEffectPercent(200, 1000, 0, 1, 1);
  const eff14 = computeNonDamagingAilmentEffectPercent(200, 1000, 0, 1, 1.4);
  assert(eff14 > eff1, `extraEffectMult 1.4 increases effect`);
}

// specialChillMultiplier = 0.7 reduces effect
{
  const eff1   = computeNonDamagingAilmentEffectPercent(200, 1000, 0, 1, 1, 1);
  const eff07  = computeNonDamagingAilmentEffectPercent(200, 1000, 0, 1, 1, 0.7);
  assert(eff07 < eff1, `chill special mult 0.7 reduces effect`);
}

// Rounded to 2 decimal places (when non-zero)
{
  const eff = computeNonDamagingAilmentEffectPercent(250, 800, 0);
  if (eff > 0) {
    assert(Math.round(eff * 100) / 100 === eff, `ailment result rounded to 2 decimals: ${eff}`);
  }
}

// ---------------------------------------------------------------------------
// 9. computeNonDamagingAilmentEffectFromValidPercentOfLifeEs
// ---------------------------------------------------------------------------

section('computeNonDamagingAilmentEffectFromValidPercentOfLifeEs');

// 100% of life+es hit → base = sqrt(1/5) * 100 ≈ 44.72...
{
  const C = FORMULA_CONSTANTS;
  const eff = computeNonDamagingAilmentEffectFromValidPercentOfLifeEs(100, 1, 1, 1);
  const expected = Math.sqrt(1 / C.ailmentPoolDivisor) * 100;
  assert(nearRel(eff, expected, 1e-9), `100% of pool: got ${eff}, expected ${expected}`);
}

// Monotonically increasing with damage %
{
  const eff10 = computeNonDamagingAilmentEffectFromValidPercentOfLifeEs(10, 1, 1, 1);
  const eff50 = computeNonDamagingAilmentEffectFromValidPercentOfLifeEs(50, 1, 1, 1);
  assert(eff50 > eff10, `50% hit > 10% hit: ${eff50} vs ${eff10}`);
}

// ---------------------------------------------------------------------------
// 10. attackDamageMultiplierAtAbilityLevel
// ---------------------------------------------------------------------------

section('attackDamageMultiplierAtAbilityLevel');

// At the starting level, mult equals the CSV value
// b0 = multAtStart / (1 + 0.05 * S), mult(S) = b0 * (1 + 0.05 * S) = multAtStart
{
  const mult = attackDamageMultiplierAtAbilityLevel(200, 10, 10);
  assert(near(mult, 200), `at starting level, mult == multAtStart: ${mult}`);
}

// Each level above starting increases by 5% relative to b0
{
  const S = 5, M = 150;
  const b0 = M / (1 + 0.05 * S);
  const multL6 = attackDamageMultiplierAtAbilityLevel(M, S, S + 1);
  assert(nearRel(multL6, b0 * (1 + 0.05 * (S + 1)), 1e-9), `level S+1 mult: ${multL6}`);
}

// Higher level → higher multiplier
{
  const m10 = attackDamageMultiplierAtAbilityLevel(200, 5, 10);
  const m20 = attackDamageMultiplierAtAbilityLevel(200, 5, 20);
  assert(m20 > m10, `higher level → higher multiplier: ${m20} > ${m10}`);
}

// Level 0: b0 = multAtStart / (1 + 0), mult(0) = b0
{
  const multL0 = attackDamageMultiplierAtAbilityLevel(120, 0, 0);
  assert(near(multL0, 120), `level 0 starting: ${multL0}`);
}

// Fractional / negative levels are floored to 0
{
  const multNeg = attackDamageMultiplierAtAbilityLevel(120, 0, -3);
  const mult0   = attackDamageMultiplierAtAbilityLevel(120, 0, 0);
  assert(near(multNeg, mult0), `negative level clamped to 0: ${multNeg}`);
}

// ---------------------------------------------------------------------------
// 11. spellBaseDamageAtAbilityLevel
// ---------------------------------------------------------------------------

section('spellBaseDamageAtAbilityLevel');

// Same level → no scaling
{
  const { min, max } = spellBaseDamageAtAbilityLevel(50, 80, 5, 5);
  assert(near(min, 50) && near(max, 80), `same level → no scale: min=${min}, max=${max}`);
}

// Level S+1: factor = 1 + 0.44 * 0.935^0 = 1.44
{
  const { min, max } = spellBaseDamageAtAbilityLevel(100, 150, 1, 0);
  const factor = 1 + 0.44 * 0.935 ** 0;
  assert(nearRel(min, 100 * factor, 1e-9), `level 1 min: ${min} vs ${100 * factor}`);
  assert(nearRel(max, 150 * factor, 1e-9), `level 1 max: ${max} vs ${150 * factor}`);
}

// Higher level → larger values
{
  const base = spellBaseDamageAtAbilityLevel(100, 100, 5, 5);
  const higher = spellBaseDamageAtAbilityLevel(100, 100, 15, 5);
  assert(higher.min > base.min, `higher level → larger min: ${higher.min} > ${base.min}`);
  assert(higher.max > base.max, `higher level → larger max: ${higher.max} > ${base.max}`);
}

// Scale-down below starting level (reverse)
{
  const base = spellBaseDamageAtAbilityLevel(100, 150, 5, 5);
  const down = spellBaseDamageAtAbilityLevel(100, 150, 3, 5);
  assert(down.min < base.min, `below starting level → lower min: ${down.min} < ${base.min}`);
}

// Scaling maintains min/max ratio
{
  const { min, max } = spellBaseDamageAtAbilityLevel(60, 90, 10, 0);
  const origRatio = 90 / 60;
  const scaledRatio = max / min;
  assert(nearRel(scaledRatio, origRatio, 1e-9), `min/max ratio preserved: ${scaledRatio} vs ${origRatio}`);
}

// ---------------------------------------------------------------------------
// 12. abilityManaCostAtLevel
// ---------------------------------------------------------------------------

section('abilityManaCostAtLevel');

// At or below starting level → floor(base)
{
  const cost = abilityManaCostAtLevel(10, 3, 3);
  assert(cost === 10, `at starting level → floor(base): ${cost}`);
}

{
  const cost = abilityManaCostAtLevel(10, 3, 1);
  assert(cost === 10, `below starting level → floor(base): ${cost}`);
}

// Returns integer (floor applied)
{
  const cost = abilityManaCostAtLevel(15, 1, 5);
  assert(Number.isInteger(cost), `mana cost is integer: ${cost}`);
}

// Cost increases with level
{
  const costL1 = abilityManaCostAtLevel(10, 0, 0);
  const costL5 = abilityManaCostAtLevel(10, 0, 5);
  const costL10 = abilityManaCostAtLevel(10, 0, 10);
  assert(costL5 > costL1,  `level 5 cost > level 0 cost: ${costL5} > ${costL1}`);
  assert(costL10 > costL5, `level 10 cost > level 5 cost: ${costL10} > ${costL5}`);
}

// Cost is non-negative
{
  const cost = abilityManaCostAtLevel(0, 0, 10);
  assert(cost >= 0, `mana cost >= 0 for zero base: ${cost}`);
}

// ---------------------------------------------------------------------------
// 13. abilityManaCostAtLevelTrueRaw
// ---------------------------------------------------------------------------

section('abilityManaCostAtLevelTrueRaw');

// At starting level → floor(base) (no growth)
{
  const raw = abilityManaCostAtLevelTrueRaw(10, 2, 2);
  assert(near(raw, 10), `raw at starting level = floor(base): ${raw}`);
}

// One level above starting: trueMana = (base + 0.5) * (1 + 0.3 * 0.92^S)
{
  const base = 10, S = 1;
  const expected = (base + 0.5) * (1 + 0.3 * Math.pow(0.92, S));
  const raw = abilityManaCostAtLevelTrueRaw(base, S, S + 1);
  assert(nearRel(raw, expected, 1e-9), `one level above: ${raw} vs ${expected}`);
}

// Raw >= floored output
{
  const base = 20, S = 2, L = 8;
  const raw     = abilityManaCostAtLevelTrueRaw(base, S, L);
  const floored = abilityManaCostAtLevel(base, S, L);
  assert(raw >= floored, `raw >= floored: ${raw} >= ${floored}`);
  assert(raw - floored < 1, `raw - floored < 1: ${raw} - ${floored}`);
}

// ---------------------------------------------------------------------------
// 14. physicalElementConversionFromAbilityLines
// ---------------------------------------------------------------------------

section('physicalElementConversionFromAbilityLines');

// No lines → all zero
{
  const result = physicalElementConversionFromAbilityLines([]);
  assert(result.toFire === 0 && result.toCold === 0 && result.toLightning === 0, 'empty lines → all zero');
}

// Parse fire conversion
{
  const result = physicalElementConversionFromAbilityLines([
    'Convert 30% of your physical damage to fire damage',
  ]);
  assert(result.toFire === 30, `fire conversion 30%: ${result.toFire}`);
  assert(result.toCold === 0,      `cold unaffected: ${result.toCold}`);
  assert(result.toLightning === 0, `lightning unaffected: ${result.toLightning}`);
}

// Parse cold conversion
{
  const result = physicalElementConversionFromAbilityLines([
    'Convert 25% of your physical damage to cold',
  ]);
  assert(result.toCold === 25, `cold conversion 25%: ${result.toCold}`);
}

// Parse lightning conversion
{
  const result = physicalElementConversionFromAbilityLines([
    'Convert 40% of your physical damage to lightning damage',
  ]);
  assert(result.toLightning === 40, `lightning conversion 40%: ${result.toLightning}`);
}

// Multiple lines accumulate
{
  const result = physicalElementConversionFromAbilityLines([
    'Convert 20% of your physical damage to fire',
    'Convert 15% of your physical damage to cold',
  ]);
  assert(result.toFire === 20,     `fire 20%: ${result.toFire}`);
  assert(result.toCold === 15,     `cold 15%: ${result.toCold}`);
  assert(result.toLightning === 0, `lightning 0%: ${result.toLightning}`);
}

// Case insensitive
{
  const result = physicalElementConversionFromAbilityLines([
    'CONVERT 10% OF YOUR PHYSICAL DAMAGE TO FIRE DAMAGE',
  ]);
  assert(result.toFire === 10, `case insensitive fire: ${result.toFire}`);
}

// Unrelated lines are ignored
{
  const result = physicalElementConversionFromAbilityLines([
    'Deal 50% more damage',
    '+20% increased attack speed',
  ]);
  assert(result.toFire === 0 && result.toCold === 0 && result.toLightning === 0,
    'unrelated lines ignored');
}

// ---------------------------------------------------------------------------
// 15. scaleEnemyStatToLevel
// ---------------------------------------------------------------------------

section('scaleEnemyStatToLevel');

// Level 1 → base
{
  const v = scaleEnemyStatToLevel(40, 1, 0.108, 0.990201);
  assert(near(v, 40), `level 1 = base: ${v}`);
}

// Level 2 → base * (1 + A * B^0) = base * (1 + A)
{
  const A = 0.108, B = 0.990201;
  const expected = 40 * (1 + A);
  const got = scaleEnemyStatToLevel(40, 2, A, B);
  assert(nearRel(got, expected, 1e-9), `level 2 scaling: ${got} vs ${expected}`);
}

// Level 3 → base * (1+A) * (1 + A*B)
{
  const A = 0.108, B = 0.990201;
  const expected = 40 * (1 + A) * (1 + A * B);
  const got = scaleEnemyStatToLevel(40, 3, A, B);
  assert(nearRel(got, expected, 1e-9), `level 3 scaling: ${got} vs ${expected}`);
}

// Monotonically increasing with level
{
  const A = 0.108, B = 0.990201;
  for (let l = 2; l <= 20; l++) {
    const prev = scaleEnemyStatToLevel(40, l - 1, A, B);
    const curr = scaleEnemyStatToLevel(40, l, A, B);
    assert(curr > prev, `level ${l} > level ${l - 1}: ${curr} > ${prev}`);
  }
}

// ---------------------------------------------------------------------------
// 16. enemyStatsAtLevel
// ---------------------------------------------------------------------------

section('enemyStatsAtLevel');

// Level 1 → base constants
{
  const stats = enemyStatsAtLevel(1);
  assert(near(stats.life, FORMULA_CONSTANTS.enemyBaseLife),
    `level 1 life = base: ${stats.life}`);
  assert(near(stats.speed, FORMULA_CONSTANTS.enemyBaseSpeed),
    `speed is fixed (no level scaling): ${stats.speed}`);
}

// Level 10 → life > level 1 life
{
  const stats1  = enemyStatsAtLevel(1);
  const stats10 = enemyStatsAtLevel(10);
  assert(stats10.life > stats1.life,   `level 10 life > level 1: ${stats10.life}`);
  assert(stats10.armour > stats1.armour, `level 10 armour > level 1: ${stats10.armour}`);
  assert(stats10.accuracy > stats1.accuracy, `level 10 accuracy > level 1: ${stats10.accuracy}`);
  assert(stats10.damageMin > stats1.damageMin, `level 10 dmgMin > level 1: ${stats10.damageMin}`);
  assert(stats10.damageMax > stats1.damageMax, `level 10 dmgMax > level 1: ${stats10.damageMax}`);
}

// Speed is level-independent
{
  const stats1   = enemyStatsAtLevel(1);
  const stats50  = enemyStatsAtLevel(50);
  const stats100 = enemyStatsAtLevel(100);
  assert(near(stats1.speed, stats50.speed) && near(stats50.speed, stats100.speed),
    `speed constant across levels: ${stats1.speed} ${stats50.speed} ${stats100.speed}`);
}

// damageMin <= damageMax at any level
{
  for (const lvl of [1, 10, 50, 100]) {
    const s = enemyStatsAtLevel(lvl);
    assert(s.damageMin <= s.damageMax, `level ${lvl}: dmgMin <= dmgMax: ${s.damageMin} <= ${s.damageMax}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed;
const status = failed === 0 ? 'OK' : 'FAILED';
console.log(`\nCalculation tests: ${status} — ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`);
if (failed > 0) process.exit(1);
