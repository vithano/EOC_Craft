/**
 * Tests for damage-type conversion functions (damageTypes.ts)
 * and enemy modifier application (enemyModifiers.ts).
 *
 * Run: tsx scripts/test_damage_types_and_mods.ts
 */

import {
  roundDamageNearest,
  normalizePhysicalConversionPcts,
  applyGearPhysicalConversion,
  applyElementalToChaosConversion,
  applyLightningToColdConversion,
  applyPhysicalToRandomElements,
  applyGainPhysicalAsExtraLightning,
  buildHitDamageByType,
  collapseProvRowsToHitDamage,
  localFlatDamageDisplayRange,
  increasedPctForProvHitRow,
  applyIncreasedToProvHitRows,
  type HitDamageTypeRow,
  type ProvHitDamageRow,
  type ProvHitIncreasedContext,
} from '../src/data/damageTypes';
import {
  normalizeEnemyModsWithTiers,
  computeEnemyModifierBaseDeltas,
  applyEnemyModifierDeltasToScaledEnemy,
  applyEnemyModifiersWithTiersToScaledEnemy,
  applyEnemyModifierBaseRatiosToScaledEnemy,
  enemyModifierLabel,
  enemyModifierDescription,
  enemyModifierRefLifeForRegen,
  enemyModifierRatioBasesAtLevel,
  MAX_ENEMY_MODIFIERS,
} from '../src/data/enemyModifiers';
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

/** Sum of min across all rows. */
const sumMin = (rows: HitDamageTypeRow[]) => rows.reduce((s, r) => s + r.min, 0);
/** Sum of max across all rows. */
const sumMax = (rows: HitDamageTypeRow[]) => rows.reduce((s, r) => s + r.max, 0);
/** Find a row by type. */
const byType = (rows: HitDamageTypeRow[], t: HitDamageTypeRow['type']) =>
  rows.find((r) => r.type === t);

/** Minimal base enemy using CSV defaults as reference bases (no modifierRatioBases). */
function baseEnemy(): DemoEnemyDef {
  return {
    id: 'test',
    name: 'Test Enemy',
    maxLife: 1000,
    armour: 100,
    evasionRating: 200,
    accuracy: 300,
    damageMin: 50,
    damageMax: 100,
    aps: 1.0,
  };
}

// ---------------------------------------------------------------------------
// 1. roundDamageNearest
// ---------------------------------------------------------------------------

section('roundDamageNearest');

assert(roundDamageNearest(3.5) === 4, 'rounds 3.5 → 4');
assert(roundDamageNearest(3.4) === 3, 'rounds 3.4 → 3');
assert(roundDamageNearest(0) === 0,   'rounds 0 → 0');
assert(roundDamageNearest(-0.6) === -1, 'rounds -0.6 → -1');
assert(roundDamageNearest(100) === 100, 'integer unchanged');
assert(roundDamageNearest(Infinity) === Infinity, 'Infinity preserved');
assert(roundDamageNearest(-Infinity) === -Infinity, '-Infinity preserved');
assert(isNaN(roundDamageNearest(NaN)), 'NaN preserved');

// ---------------------------------------------------------------------------
// 2. normalizePhysicalConversionPcts
// ---------------------------------------------------------------------------

section('normalizePhysicalConversionPcts');

// All zeros → passthrough
{
  const r = normalizePhysicalConversionPcts(0, 0, 0);
  assert(r.rawTotal === 0, `rawTotal 0: ${r.rawTotal}`);
  assert(r.normalizationFactor === 1, `factor 1 when no conversions: ${r.normalizationFactor}`);
  assert(r.toFire === 0 && r.toCold === 0 && r.toLightning === 0, 'all outputs zero');
}

// Within 100% → no normalization
{
  const r = normalizePhysicalConversionPcts(30, 40, 20);
  assert(r.rawTotal === 90, `rawTotal 90: ${r.rawTotal}`);
  assert(r.normalizationFactor === 1, `factor 1 (total <= 100): ${r.normalizationFactor}`);
  assert(near(r.toFire, 30) && near(r.toCold, 40) && near(r.toLightning, 20), 'values unchanged');
}

// Exactly 100% → no normalization
{
  const r = normalizePhysicalConversionPcts(33, 33, 34);
  assert(r.rawTotal === 100, `rawTotal 100: ${r.rawTotal}`);
  assert(r.normalizationFactor === 1, `factor 1 at exactly 100: ${r.normalizationFactor}`);
}

// Over 100% → scale down
{
  const r = normalizePhysicalConversionPcts(60, 60, 60);
  assert(r.rawTotal === 180, `rawTotal 180: ${r.rawTotal}`);
  assert(nearRel(r.normalizationFactor, 100 / 180, 1e-9), `factor 100/180: ${r.normalizationFactor}`);
  // Each should be 60 * (100/180) = 33.33...%
  assert(nearRel(r.toFire, 60 * 100 / 180, 1e-9), `fire scaled: ${r.toFire}`);
  // Sum of normalized should equal 100
  assert(nearRel(r.toFire + r.toCold + r.toLightning, 100, 1e-9), 'sum is 100 when over');
}

// Negative inputs are treated as zero
{
  const r = normalizePhysicalConversionPcts(-10, 50, 0);
  assert(r.toFire === 0, `negative fire treated as 0: ${r.toFire}`);
  assert(near(r.toCold, 50), `cold unaffected: ${r.toCold}`);
}

// ---------------------------------------------------------------------------
// 3. localFlatDamageDisplayRange
// ---------------------------------------------------------------------------

section('localFlatDamageDisplayRange');

// Storage convention: min stored as min*0.5, max stored as max
{
  const r = localFlatDamageDisplayRange(5, 10);
  assert(r.min === 10, `min = stored*2 = 10: ${r.min}`);
  assert(r.max === 10, `max = stored = 10: ${r.max}`);
}

{
  const r = localFlatDamageDisplayRange(0, 0);
  assert(r.min === 0 && r.max === 0, 'zero stored → zero display');
}

// Rounding applied
{
  const r = localFlatDamageDisplayRange(5.5, 11.4);
  assert(r.min === 11, `min = round(5.5*2) = round(11) = 11: ${r.min}`);
  assert(r.max === 11, `max = round(11.4) = 11: ${r.max}`);
}

// ---------------------------------------------------------------------------
// 4. buildHitDamageByType
// ---------------------------------------------------------------------------

section('buildHitDamageByType');

// Non-zero rows are kept; zeros removed
{
  const rows: HitDamageTypeRow[] = [
    { type: 'physical', min: 10, max: 20 },
    { type: 'fire', min: 0, max: 0 },
    { type: 'cold', min: 5, max: 10 },
  ];
  const out = buildHitDamageByType(rows);
  assert(out.some((r) => r.type === 'physical'), 'physical kept');
  assert(!out.some((r) => r.type === 'fire'), 'zero-fire removed');
  assert(out.some((r) => r.type === 'cold'), 'cold kept');
}

// Physical zero-row preserved when explicitly in input and no other physical
{
  const rows: HitDamageTypeRow[] = [
    { type: 'physical', min: 0, max: 0 },
    { type: 'fire', min: 5, max: 10 },
  ];
  const out = buildHitDamageByType(rows);
  assert(out.some((r) => r.type === 'physical' && r.min === 0 && r.max === 0),
    'physical zero-row preserved when originally present');
}

// Values are rounded
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 10.7, max: 20.3 }];
  const out = buildHitDamageByType(rows);
  assert(out[0]!.min === 11, `min rounded: ${out[0]!.min}`);
  assert(out[0]!.max === 20, `max rounded: ${out[0]!.max}`);
}

// ---------------------------------------------------------------------------
// 5. applyGearPhysicalConversion
// ---------------------------------------------------------------------------

section('applyGearPhysicalConversion');

// 0% conversion → rows unchanged
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGearPhysicalConversion(rows, 0, 0, 0);
  assert(out.length === rows.length, 'no change for 0%');
  assert(byType(out, 'physical')?.min === 100, 'physical min unchanged');
}

// No physical row → no change
{
  const rows: HitDamageTypeRow[] = [{ type: 'fire', min: 50, max: 100 }];
  const out = applyGearPhysicalConversion(rows, 100, 0, 0);
  assert(out.length === rows.length && byType(out, 'physical') === undefined,
    'no physical → no conversion');
}

// 100% to fire: all physical becomes fire, physical row removed
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGearPhysicalConversion(rows, 100, 0, 0);
  const p = byType(out, 'physical');
  const f = byType(out, 'fire');
  assert((!p || (p.min === 0 && p.max === 0)), `physical zeroed: min=${p?.min}, max=${p?.max}`);
  assert(f !== undefined && f.min === 100 && f.max === 200,
    `fire gets full physical: min=${f?.min}, max=${f?.max}`);
  // Total damage conserved
  assert(sumMin(out) === 100, `sumMin conserved: ${sumMin(out)}`);
  assert(sumMax(out) === 200, `sumMax conserved: ${sumMax(out)}`);
}

// 50% to fire: half physical becomes fire
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGearPhysicalConversion(rows, 50, 0, 0);
  const p = byType(out, 'physical');
  const f = byType(out, 'fire');
  assert(p !== undefined && p.min === 50 && p.max === 100,
    `physical halved: min=${p?.min}, max=${p?.max}`);
  assert(f !== undefined && f.min === 50 && f.max === 100,
    `fire gets half: min=${f?.min}, max=${f?.max}`);
  assert(sumMin(out) === 100 && sumMax(out) === 200, 'total conserved after 50% split');
}

// 50% to fire + 50% to cold (100% total) → physical zeroed
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGearPhysicalConversion(rows, 50, 50, 0);
  const p = byType(out, 'physical');
  assert(!p || (p.min === 0 && p.max === 0), 'physical zeroed at 100% total conversion');
  assert(sumMin(out) === 100 && sumMax(out) === 200, 'total conserved');
}

// Over 100% normalizes: 80% fire + 80% cold → 50% each (normalized to 100%)
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGearPhysicalConversion(rows, 80, 80, 0);
  const p = byType(out, 'physical');
  assert(!p || (p.min === 0 && p.max === 0), 'physical zeroed when normalized to 100%');
  assert(sumMin(out) === 100 && sumMax(out) === 200, 'total conserved after normalization');
}

// Existing elemental rows are augmented
{
  const rows: HitDamageTypeRow[] = [
    { type: 'physical', min: 100, max: 200 },
    { type: 'fire', min: 20, max: 40 },
  ];
  const out = applyGearPhysicalConversion(rows, 50, 0, 0);
  const f = byType(out, 'fire');
  assert(f !== undefined && f.min === 70 && f.max === 140,
    `fire augmented: min=${f?.min} (20+50), max=${f?.max} (40+100)`);
}

// ---------------------------------------------------------------------------
// 6. applyElementalToChaosConversion
// ---------------------------------------------------------------------------

section('applyElementalToChaosConversion');

// 0% → unchanged
{
  const rows: HitDamageTypeRow[] = [
    { type: 'fire', min: 100, max: 200 },
    { type: 'cold', min: 50, max: 100 },
  ];
  const out = applyElementalToChaosConversion(rows, 0);
  assert(out.length === rows.length && !byType(out, 'chaos'), '0% produces no chaos');
}

// 100% → all elemental → chaos
{
  const rows: HitDamageTypeRow[] = [{ type: 'fire', min: 100, max: 200 }];
  const out = applyElementalToChaosConversion(rows, 100);
  const f = byType(out, 'fire');
  const c = byType(out, 'chaos');
  assert(!f || (f.min === 0 && f.max === 0), `fire zeroed at 100%: min=${f?.min}`);
  assert(c !== undefined && c.min === 100 && c.max === 200,
    `chaos gets all fire: min=${c?.min}, max=${c?.max}`);
}

// 50% fire → chaos
{
  const rows: HitDamageTypeRow[] = [{ type: 'fire', min: 100, max: 200 }];
  const out = applyElementalToChaosConversion(rows, 50);
  const f = byType(out, 'fire');
  const c = byType(out, 'chaos');
  assert(f !== undefined && f.min === 50 && f.max === 100,
    `fire halved: ${f?.min}, ${f?.max}`);
  assert(c !== undefined && c.min === 50 && c.max === 100,
    `chaos gets half fire: ${c?.min}, ${c?.max}`);
  assert(sumMin(out) === 100 && sumMax(out) === 200, 'total conserved');
}

// Multiple elemental types converted together
{
  const rows: HitDamageTypeRow[] = [
    { type: 'fire', min: 100, max: 100 },
    { type: 'cold', min: 100, max: 100 },
    { type: 'lightning', min: 100, max: 100 },
  ];
  const out = applyElementalToChaosConversion(rows, 100);
  const c = byType(out, 'chaos');
  // All three types contribute to chaos
  assert(c !== undefined && c.min === 300 && c.max === 300,
    `all three elemental types → chaos: min=${c?.min}, max=${c?.max}`);
}

// Physical untouched
{
  const rows: HitDamageTypeRow[] = [
    { type: 'physical', min: 80, max: 160 },
    { type: 'fire', min: 20, max: 40 },
  ];
  const out = applyElementalToChaosConversion(rows, 100);
  const p = byType(out, 'physical');
  assert(p?.min === 80 && p?.max === 160, 'physical untouched by elemental→chaos');
}

// ---------------------------------------------------------------------------
// 7. applyLightningToColdConversion
// ---------------------------------------------------------------------------

section('applyLightningToColdConversion');

// 0% → unchanged
{
  const rows: HitDamageTypeRow[] = [{ type: 'lightning', min: 100, max: 200 }];
  const out = applyLightningToColdConversion(rows, 0);
  assert(byType(out, 'lightning')?.min === 100, '0% lightning unchanged');
  assert(!byType(out, 'cold'), '0% no cold added');
}

// No lightning row → unchanged
{
  const rows: HitDamageTypeRow[] = [{ type: 'fire', min: 50, max: 100 }];
  const out = applyLightningToColdConversion(rows, 50);
  assert(out.length === rows.length, 'no lightning → no change');
}

// 100% → all lightning becomes cold
{
  const rows: HitDamageTypeRow[] = [{ type: 'lightning', min: 100, max: 200 }];
  const out = applyLightningToColdConversion(rows, 100);
  const L = byType(out, 'lightning');
  const cold = byType(out, 'cold');
  assert(!L || (L.min === 0 && L.max === 0), `lightning zeroed at 100%: ${L?.min}`);
  assert(cold?.min === 100 && cold?.max === 200,
    `cold gets all lightning: ${cold?.min}, ${cold?.max}`);
}

// 50%: total conserved
{
  const rows: HitDamageTypeRow[] = [{ type: 'lightning', min: 100, max: 200 }];
  const out = applyLightningToColdConversion(rows, 50);
  assert(sumMin(out) === 100 && sumMax(out) === 200, 'total conserved at 50%');
}

// Existing cold augmented
{
  const rows: HitDamageTypeRow[] = [
    { type: 'cold', min: 30, max: 60 },
    { type: 'lightning', min: 100, max: 200 },
  ];
  const out = applyLightningToColdConversion(rows, 50);
  const cold = byType(out, 'cold');
  assert(cold?.min === 80 && cold?.max === 160,
    `cold augmented: min=${cold?.min} (30+50), max=${cold?.max} (60+100)`);
}

// ---------------------------------------------------------------------------
// 8. applyPhysicalToRandomElements
// ---------------------------------------------------------------------------

section('applyPhysicalToRandomElements');

// 0% → no change
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 90, max: 180 }];
  const out = applyPhysicalToRandomElements(rows, 0);
  assert(byType(out, 'physical')?.min === 90, '0% physical unchanged');
}

// 99% split equally among fire/cold/lightning (33% each)
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 300 }];
  const out = applyPhysicalToRandomElements(rows, 99);
  // Total should be conserved
  assert(sumMin(out) === 100 && sumMax(out) === 300, '99% total conserved');
  // Fire, cold, lightning should each be roughly 33
  const f = byType(out, 'fire');
  const c = byType(out, 'cold');
  const l = byType(out, 'lightning');
  assert(f !== undefined && c !== undefined && l !== undefined, 'fire/cold/lightning all created');
  // Each gets ~33% of the converted portion (99% of physical)
  // Within 1 of exact thirds (rounding)
  const totalEle = (f?.min ?? 0) + (c?.min ?? 0) + (l?.min ?? 0);
  assert(totalEle >= 32 && totalEle <= 100, `elemental min sum in range: ${totalEle}`);
}

// Physical gets the un-converted remainder
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 300 }];
  const out = applyPhysicalToRandomElements(rows, 60);
  const p = byType(out, 'physical');
  assert(p !== undefined && p.min <= 100 && p.max <= 300,
    'physical remainder ≤ original');
  assert(p.min >= 0, 'physical min non-negative');
}

// ---------------------------------------------------------------------------
// 9. applyGainPhysicalAsExtraLightning
// ---------------------------------------------------------------------------

section('applyGainPhysicalAsExtraLightning');

// 0% → no change
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGainPhysicalAsExtraLightning(rows, 0);
  assert(!byType(out, 'lightning'), '0% → no lightning added');
  assert(byType(out, 'physical')?.min === 100, 'physical unchanged');
}

// No physical → no change
{
  const rows: HitDamageTypeRow[] = [{ type: 'fire', min: 50, max: 100 }];
  const out = applyGainPhysicalAsExtraLightning(rows, 100);
  assert(!byType(out, 'lightning'), 'no physical → no lightning gain');
}

// 100%: physical kept, lightning added equal to physical
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGainPhysicalAsExtraLightning(rows, 100);
  const p = byType(out, 'physical');
  const l = byType(out, 'lightning');
  assert(p?.min === 100 && p?.max === 200, 'physical unchanged (non-converting)');
  assert(l?.min === 100 && l?.max === 200, 'lightning equals physical');
  // Total is doubled (non-converting)
  assert(sumMin(out) === 200 && sumMax(out) === 400, 'total doubled at 100%');
}

// 50%: lightning = 50% of physical
{
  const rows: HitDamageTypeRow[] = [{ type: 'physical', min: 100, max: 200 }];
  const out = applyGainPhysicalAsExtraLightning(rows, 50);
  const l = byType(out, 'lightning');
  assert(l?.min === 50 && l?.max === 100, `50% gain: lightning ${l?.min}/${l?.max}`);
}

// Existing lightning augmented (not overwritten)
{
  const rows: HitDamageTypeRow[] = [
    { type: 'physical', min: 100, max: 200 },
    { type: 'lightning', min: 20, max: 40 },
  ];
  const out = applyGainPhysicalAsExtraLightning(rows, 50);
  const l = byType(out, 'lightning');
  assert(l?.min === 70 && l?.max === 140, `lightning augmented: ${l?.min}/${l?.max}`);
}

// ---------------------------------------------------------------------------
// 10. collapseProvRowsToHitDamage
// ---------------------------------------------------------------------------

section('collapseProvRowsToHitDamage');

// Multiple rows of same type summed
{
  const rows: ProvHitDamageRow[] = [
    { type: 'fire', min: 30, max: 60, scaling: 'native_elemental' },
    { type: 'fire', min: 20, max: 40, scaling: 'physical_and_elemental' },
    { type: 'cold', min: 10, max: 20, scaling: 'native_elemental' },
  ];
  const out = collapseProvRowsToHitDamage(rows);
  const f = out.find((r) => r.type === 'fire');
  const c = out.find((r) => r.type === 'cold');
  assert(f?.min === 50 && f?.max === 100, `fire summed: min=${f?.min}, max=${f?.max}`);
  assert(c?.min === 10 && c?.max === 20, `cold preserved: min=${c?.min}`);
}

// Output order: physical, fire, cold, lightning, chaos
{
  const rows: ProvHitDamageRow[] = [
    { type: 'chaos', min: 5, max: 10, scaling: 'chaos_style' },
    { type: 'fire', min: 10, max: 20, scaling: 'native_elemental' },
    { type: 'physical', min: 20, max: 40, scaling: 'physical_style' },
  ];
  const out = collapseProvRowsToHitDamage(rows);
  const types = out.map((r) => r.type);
  assert(types.indexOf('physical') < types.indexOf('fire'), 'physical before fire');
  assert(types.indexOf('fire') < types.indexOf('chaos'), 'fire before chaos');
}

// Zero rows excluded
{
  const rows: ProvHitDamageRow[] = [
    { type: 'fire', min: 0, max: 0, scaling: 'native_elemental' },
    { type: 'cold', min: 5, max: 10, scaling: 'native_elemental' },
  ];
  const out = collapseProvRowsToHitDamage(rows);
  assert(!out.some((r) => r.type === 'fire'), 'zero-fire excluded');
  assert(out.some((r) => r.type === 'cold'), 'cold included');
}

// Physical zero-row preserved when originally present
{
  const rows: ProvHitDamageRow[] = [
    { type: 'physical', min: 0, max: 0, scaling: 'physical_style' },
    { type: 'fire', min: 10, max: 20, scaling: 'native_elemental' },
  ];
  const out = collapseProvRowsToHitDamage(rows);
  const p = out.find((r) => r.type === 'physical');
  assert(p !== undefined && p.min === 0, 'physical zero-row preserved');
}

// Values rounded to nearest integer
{
  const rows: ProvHitDamageRow[] = [
    { type: 'fire', min: 10.7, max: 20.3, scaling: 'native_elemental' },
  ];
  const out = collapseProvRowsToHitDamage(rows);
  const f = out.find((r) => r.type === 'fire');
  assert(f?.min === 11 && f?.max === 20, `rounded: min=${f?.min}, max=${f?.max}`);
}

// ---------------------------------------------------------------------------
// 11. increasedPctForProvHitRow
// ---------------------------------------------------------------------------

section('increasedPctForProvHitRow');

const ctx: ProvHitIncreasedContext = {
  physStyleIncTotal: 50,
  attackIncSum: 20,
  incEle: 15,
  attIncFire: 10,
  gearFire: 8,
  gearCold: 6,
  gearLightning: 4,
  chaosGear: 25,
};

// physical_style → only physStyleIncTotal
{
  const row: ProvHitDamageRow = { type: 'physical', min: 10, max: 20, scaling: 'physical_style' };
  const pct = increasedPctForProvHitRow(row, ctx);
  assert(pct === 50, `physical_style: ${pct}`);
}

// native_elemental fire → attackIncSum + incEle + gearFire + attIncFire
{
  const row: ProvHitDamageRow = { type: 'fire', min: 10, max: 20, scaling: 'native_elemental' };
  const expected = 20 + 15 + 8 + 10; // 53
  const pct = increasedPctForProvHitRow(row, ctx);
  assert(pct === expected, `native_elemental fire: ${pct} === ${expected}`);
}

// native_elemental cold → attackIncSum + incEle + gearCold (no attIncFire)
{
  const row: ProvHitDamageRow = { type: 'cold', min: 10, max: 20, scaling: 'native_elemental' };
  const expected = 20 + 15 + 6; // 41
  const pct = increasedPctForProvHitRow(row, ctx);
  assert(pct === expected, `native_elemental cold: ${pct} === ${expected}`);
}

// native_elemental lightning → attackIncSum + incEle + gearLightning
{
  const row: ProvHitDamageRow = { type: 'lightning', min: 10, max: 20, scaling: 'native_elemental' };
  const expected = 20 + 15 + 4; // 39
  const pct = increasedPctForProvHitRow(row, ctx);
  assert(pct === expected, `native_elemental lightning: ${pct} === ${expected}`);
}

// physical_and_elemental fire → physStyleIncTotal + incEle + gearFire + attIncFire
{
  const row: ProvHitDamageRow = { type: 'fire', min: 10, max: 20, scaling: 'physical_and_elemental' };
  const expected = 50 + 15 + 8 + 10; // 83
  const pct = increasedPctForProvHitRow(row, ctx);
  assert(pct === expected, `physical_and_elemental fire: ${pct} === ${expected}`);
}

// chaos_style → attackIncSum + chaosGear
{
  const row: ProvHitDamageRow = { type: 'chaos', min: 10, max: 20, scaling: 'chaos_style' };
  const expected = 20 + 25; // 45
  const pct = increasedPctForProvHitRow(row, ctx);
  assert(pct === expected, `chaos_style: ${pct} === ${expected}`);
}

// ---------------------------------------------------------------------------
// 12. applyIncreasedToProvHitRows
// ---------------------------------------------------------------------------

section('applyIncreasedToProvHitRows');

// 0% increased → no change
{
  const rows: ProvHitDamageRow[] = [
    { type: 'physical', min: 10, max: 20, scaling: 'physical_style' },
  ];
  const zeroCtx: ProvHitIncreasedContext = {
    physStyleIncTotal: 0,
    attackIncSum: 0,
    incEle: 0,
    attIncFire: 0,
    gearFire: 0,
    gearCold: 0,
    gearLightning: 0,
    chaosGear: 0,
  };
  const out = applyIncreasedToProvHitRows(rows, zeroCtx);
  assert(out[0]!.min === 10 && out[0]!.max === 20, '0% increased → no change');
}

// 100% increased → doubles min/max (for integer inputs)
{
  const rows: ProvHitDamageRow[] = [
    { type: 'physical', min: 10, max: 20, scaling: 'physical_style' },
  ];
  const hundredCtx: ProvHitIncreasedContext = {
    physStyleIncTotal: 100,
    attackIncSum: 0,
    incEle: 0,
    attIncFire: 0,
    gearFire: 0,
    gearCold: 0,
    gearLightning: 0,
    chaosGear: 0,
  };
  const out = applyIncreasedToProvHitRows(rows, hundredCtx);
  assert(out[0]!.min === 20 && out[0]!.max === 40, `100% doubles values: ${out[0]!.min}/${out[0]!.max}`);
}

// Different scaling types get different increases
{
  const rows: ProvHitDamageRow[] = [
    { type: 'physical', min: 100, max: 100, scaling: 'physical_style' },
    { type: 'fire', min: 100, max: 100, scaling: 'native_elemental' },
  ];
  const mixedCtx: ProvHitIncreasedContext = {
    physStyleIncTotal: 50,
    attackIncSum: 20,
    incEle: 10,
    attIncFire: 0,
    gearFire: 0,
    gearCold: 0,
    gearLightning: 0,
    chaosGear: 0,
  };
  const out = applyIncreasedToProvHitRows(rows, mixedCtx);
  const physRow = out.find((r) => r.type === 'physical');
  const fireRow = out.find((r) => r.type === 'fire');
  // physical: 100 * 1.5 = 150
  assert(physRow?.min === 150, `physical 50% increase: ${physRow?.min}`);
  // fire: 100 * (1 + 0.3) = 130
  assert(fireRow?.min === 130, `fire 30% increase: ${fireRow?.min}`);
}

// ---------------------------------------------------------------------------
// 13. normalizeEnemyModsWithTiers
// ---------------------------------------------------------------------------

section('normalizeEnemyModsWithTiers');

// Single mod kept as-is
{
  const out = normalizeEnemyModsWithTiers([{ id: 'vital', tier: 1 }]);
  assert(out.length === 1 && out[0]!.id === 'vital' && out[0]!.tier === 1,
    `single mod preserved: ${out[0]?.id} t${out[0]?.tier}`);
}

// Duplicate id: first wins
{
  const out = normalizeEnemyModsWithTiers([
    { id: 'vital', tier: 1 },
    { id: 'vital', tier: 2 },
  ]);
  assert(out.length === 1, `duplicate deduped: length=${out.length}`);
  assert(out[0]!.tier === 1, `first tier wins: ${out[0]!.tier}`);
}

// Capped at MAX_ENEMY_MODIFIERS (3)
{
  const mods = ['vital', 'plated', 'elusive', 'barrier'] as const;
  const out = normalizeEnemyModsWithTiers(mods.map((id) => ({ id, tier: 1 as const })));
  assert(out.length === MAX_ENEMY_MODIFIERS,
    `capped at ${MAX_ENEMY_MODIFIERS}: got ${out.length}`);
}

// Tier defaults to 1 when omitted
{
  const out = normalizeEnemyModsWithTiers([{ id: 'swift' }]);
  assert(out[0]!.tier === 1, `default tier = 1: ${out[0]!.tier}`);
}

// Tier 2 and 3 preserved; out-of-range tier defaulted to 1
{
  const out = normalizeEnemyModsWithTiers([
    { id: 'vital', tier: 2 },
    { id: 'plated', tier: 3 },
    { id: 'elusive' },  // no tier → 1
  ]);
  assert(out[0]!.tier === 2, `tier 2 preserved: ${out[0]!.tier}`);
  assert(out[1]!.tier === 3, `tier 3 preserved: ${out[1]!.tier}`);
  assert(out[2]!.tier === 1, `missing tier → 1: ${out[2]!.tier}`);
}

// Empty array → empty output
{
  const out = normalizeEnemyModsWithTiers([]);
  assert(out.length === 0, 'empty mods → empty output');
}

// ---------------------------------------------------------------------------
// 14. computeEnemyModifierBaseDeltas
// ---------------------------------------------------------------------------

section('computeEnemyModifierBaseDeltas');

const C = FORMULA_CONSTANTS;

// No mods → all zeros / defaults
{
  const d = computeEnemyModifierBaseDeltas([]);
  assert(d.life === 0 && d.armour === 0 && d.evasion === 0, 'no mods → zero life/armour/evasion');
  assert(d.damageMult === 1, `no mods → damageMult=1: ${d.damageMult}`);
  assert(d.block === 0 && d.dodge === 0, 'no mods → zero block/dodge');
}

// vital tier 1 → life += modVitalLife
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'vital', tier: 1 }]);
  assert(d.life === C.modVitalLife, `vital t1 life: ${d.life} === ${C.modVitalLife}`);
}

// vital tier 2 → life += modVitalLife * 2
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'vital', tier: 2 }]);
  assert(d.life === C.modVitalLife * 2, `vital t2 life: ${d.life} === ${C.modVitalLife * 2}`);
}

// fragile tier 1 → life += modFragileLife (negative)
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'fragile', tier: 1 }]);
  assert(d.life === C.modFragileLife, `fragile t1 life: ${d.life}`);
  assert(d.life < 0, `fragile reduces life: ${d.life}`);
}

// plated tier 1 → armour += modPlatedArmour
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'plated', tier: 1 }]);
  assert(d.armour === C.modPlatedArmour, `plated t1 armour: ${d.armour}`);
}

// elusive tier 1 → evasion += modElusiveEvasion
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'elusive', tier: 1 }]);
  assert(d.evasion === C.modElusiveEvasion, `elusive t1 evasion: ${d.evasion}`);
}

// powerful tier 1 → damageMult *= modPowerfulDamageMult^1 = 1.5
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'powerful', tier: 1 }]);
  assert(nearRel(d.damageMult, C.modPowerfulDamageMult, 1e-9),
    `powerful t1 damageMult: ${d.damageMult}`);
}

// powerful tier 2 → damageMult *= 1.5^2 = 2.25
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'powerful', tier: 2 }]);
  assert(nearRel(d.damageMult, Math.pow(C.modPowerfulDamageMult, 2), 1e-9),
    `powerful t2 damageMult: ${d.damageMult}`);
}

// weak tier 1 → damageMult *= modWeakDamageMult (< 1)
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'weak', tier: 1 }]);
  assert(d.damageMult < 1, `weak reduces damageMult: ${d.damageMult}`);
  assert(nearRel(d.damageMult, C.modWeakDamageMult, 1e-9),
    `weak t1 damageMult: ${d.damageMult}`);
}

// powerful + weak stack multiplicatively
{
  const d = computeEnemyModifierBaseDeltas([
    { id: 'powerful', tier: 1 },
    { id: 'weak', tier: 1 },
  ]);
  assert(nearRel(d.damageMult, C.modPowerfulDamageMult * C.modWeakDamageMult, 1e-9),
    `powerful × weak stacks mult: ${d.damageMult}`);
}

// defender: block uses max (not additive)
{
  const d1 = computeEnemyModifierBaseDeltas([{ id: 'defender', tier: 1 }]);
  const d2 = computeEnemyModifierBaseDeltas([{ id: 'defender', tier: 2 }]);
  assert(d1.block === C.modDefenderBlock * 1, `defender t1 block: ${d1.block}`);
  assert(d2.block === C.modDefenderBlock * 2, `defender t2 block: ${d2.block}`);
}

// swift → speed increased
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'swift', tier: 1 }]);
  assert(d.speed === C.modSwiftSpeed, `swift t1 speed: ${d.speed}`);
}

// slow → speed reduced
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'slow', tier: 1 }]);
  assert(d.speed === C.modSlowSpeed, `slow t1 speed (negative): ${d.speed}`);
  assert(d.speed < 0, 'slow reduces speed');
}

// vital + plated stacks additively for different stats
{
  const d = computeEnemyModifierBaseDeltas([
    { id: 'vital', tier: 1 },
    { id: 'plated', tier: 1 },
  ]);
  assert(d.life === C.modVitalLife, `vital contribution: ${d.life}`);
  assert(d.armour === C.modPlatedArmour, `plated contribution: ${d.armour}`);
}

// warded → elemental resistance bonus
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'warded', tier: 1 }]);
  assert(d.eleRes === C.modWardedEleRes, `warded t1 eleRes: ${d.eleRes}`);
}

// hallowed → chaos resistance
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'hallowed', tier: 1 }]);
  assert(d.chaosRes === C.modHallowedChaosRes, `hallowed t1 chaosRes: ${d.chaosRes}`);
}

// ---------------------------------------------------------------------------
// 15. applyEnemyModifierDeltasToScaledEnemy
// ---------------------------------------------------------------------------

section('applyEnemyModifierDeltasToScaledEnemy');

// vital: maxLife increased proportionally using CSV base (40)
// lifeMult = (40 + modVitalLife*1) / 40 = (40+20)/40 = 1.5
// newMaxLife = round(1000 * 1.5) = 1500
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'vital', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  const expectedMult = (C.enemyBaseLife + C.modVitalLife) / C.enemyBaseLife;
  const expected = Math.round(1000 * expectedMult);
  assert(out.maxLife === expected, `vital t1 maxLife: ${out.maxLife} === ${expected}`);
}

// fragile: maxLife reduced
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'fragile', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert(out.maxLife < 1000, `fragile reduces maxLife: ${out.maxLife}`);
  assert(out.maxLife >= 1, `maxLife clamped to min 1: ${out.maxLife}`);
}

// plated: armour increased
// armourMult = (1 + 1) / 1 = 2, newArmour = round(100 * 2) = 200
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'plated', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  const expectedMult = (C.enemyBaseArmour + C.modPlatedArmour) / C.enemyBaseArmour;
  const expected = Math.round(100 * expectedMult);
  assert(out.armour === expected, `plated t1 armour: ${out.armour} === ${expected}`);
}

// elusive: evasion increased
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'elusive', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  const expectedMult = (C.enemyBaseEvasion + C.modElusiveEvasion) / C.enemyBaseEvasion;
  const expected = Math.round(200 * expectedMult);
  assert(out.evasionRating === expected, `elusive t1 evasion: ${out.evasionRating} === ${expected}`);
}

// powerful: damageMin and damageMax scaled by damageMult
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'powerful', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert(out.damageMin === Math.round(50 * C.modPowerfulDamageMult),
    `powerful damageMin: ${out.damageMin}`);
  assert(out.damageMax === Math.round(100 * C.modPowerfulDamageMult),
    `powerful damageMax: ${out.damageMax}`);
}

// weak: damage reduced
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'weak', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert(out.damageMin < 50, `weak reduces damageMin: ${out.damageMin}`);
  assert(out.damageMax < 100, `weak reduces damageMax: ${out.damageMax}`);
}

// swift: aps increased
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'swift', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert(out.aps > 1.0, `swift increases aps: ${out.aps}`);
}

// slow: aps reduced
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'slow', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert(out.aps < 1.0, `slow reduces aps: ${out.aps}`);
  assert(out.aps >= 0.05, `aps clamped to min 0.05: ${out.aps}`);
}

// defender: blockChance set
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'defender', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert(out.blockChance === C.modDefenderBlock, `defender block: ${out.blockChance}`);
}

// warded: elemental resistances added
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'warded', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert((out.fireResistancePercent ?? 0) === C.modWardedEleRes,
    `warded fire res: ${out.fireResistancePercent}`);
  assert((out.coldResistancePercent ?? 0) === C.modWardedEleRes,
    `warded cold res: ${out.coldResistancePercent}`);
  assert((out.lightningResistancePercent ?? 0) === C.modWardedEleRes,
    `warded lightning res: ${out.lightningResistancePercent}`);
  assert((out.chaosResistancePercent ?? 0) === 0, 'warded does not affect chaos res');
}

// hallowed: only chaos resistance
{
  const d = computeEnemyModifierBaseDeltas([{ id: 'hallowed', tier: 1 }]);
  const out = applyEnemyModifierDeltasToScaledEnemy(baseEnemy(), d);
  assert((out.chaosResistancePercent ?? 0) === C.modHallowedChaosRes,
    `hallowed chaos res: ${out.chaosResistancePercent}`);
  assert((out.fireResistancePercent ?? 0) === 0, 'hallowed does not affect fire res');
}

// ---------------------------------------------------------------------------
// 16. applyEnemyModifiersWithTiersToScaledEnemy
// ---------------------------------------------------------------------------

section('applyEnemyModifiersWithTiersToScaledEnemy');

// Returns both enemy and deltas
{
  const { enemy: out, deltas } = applyEnemyModifiersWithTiersToScaledEnemy(
    baseEnemy(),
    [{ id: 'vital', tier: 1 }]
  );
  assert(out.maxLife > 1000, `enemy maxLife increased: ${out.maxLife}`);
  assert(deltas.life === C.modVitalLife, `deltas.life = modVitalLife: ${deltas.life}`);
}

// No mods → enemy unchanged, deltas all default
{
  const { enemy: out, deltas } = applyEnemyModifiersWithTiersToScaledEnemy(baseEnemy(), []);
  assert(out.maxLife === 1000, `no mods → maxLife unchanged: ${out.maxLife}`);
  assert(deltas.life === 0, `no mods → deltas.life = 0: ${deltas.life}`);
  assert(deltas.damageMult === 1, `no mods → damageMult = 1: ${deltas.damageMult}`);
}

// Multiple mods applied together
{
  const { enemy: out } = applyEnemyModifiersWithTiersToScaledEnemy(baseEnemy(), [
    { id: 'vital', tier: 1 },
    { id: 'powerful', tier: 1 },
  ]);
  assert(out.maxLife > 1000, 'vital increases life');
  assert(out.damageMin > 50, 'powerful increases damage');
}

// Duplicates deduped (vital appears twice → applied only once)
{
  const { enemy: once } = applyEnemyModifiersWithTiersToScaledEnemy(baseEnemy(), [
    { id: 'vital', tier: 1 },
  ]);
  const { enemy: twice } = applyEnemyModifiersWithTiersToScaledEnemy(baseEnemy(), [
    { id: 'vital', tier: 1 },
    { id: 'vital', tier: 1 },
  ]);
  assert(once.maxLife === twice.maxLife,
    `duplicate vital deduped: ${once.maxLife} === ${twice.maxLife}`);
}

// ---------------------------------------------------------------------------
// 17. applyEnemyModifierBaseRatiosToScaledEnemy
// ---------------------------------------------------------------------------

section('applyEnemyModifierBaseRatiosToScaledEnemy');

// Same as applyEnemyModifiersWithTiersToScaledEnemy without deltas
{
  const withTiers = applyEnemyModifiersWithTiersToScaledEnemy(
    baseEnemy(), [{ id: 'plated', tier: 1 }]
  ).enemy;
  const base = applyEnemyModifierBaseRatiosToScaledEnemy(
    baseEnemy(), [{ id: 'plated', tier: 1 }]
  );
  assert(withTiers.armour === base.armour,
    `results match: ${withTiers.armour} === ${base.armour}`);
}

// ---------------------------------------------------------------------------
// 18. enemyModifierLabel / enemyModifierDescription
// ---------------------------------------------------------------------------

section('enemyModifierLabel');

assert(enemyModifierLabel('vital') === 'Vital', 'vital label');
assert(enemyModifierLabel('plated') === 'Plated', 'plated label');
assert(enemyModifierLabel('powerful') === 'Powerful', 'powerful label');
assert(enemyModifierLabel('weak') === 'Weak', 'weak label');
assert(enemyModifierLabel('soul_eater') === 'Soul Eater', 'soul_eater label');
assert(enemyModifierLabel('defender') === 'Defender', 'defender label');
assert(enemyModifierLabel('fragile') === 'Fragile', 'fragile label');

section('enemyModifierDescription');

// Descriptions mention the formula constant values
assert(enemyModifierDescription('vital').includes(String(C.modVitalLife)),
  `vital description includes modVitalLife (${C.modVitalLife})`);
assert(enemyModifierDescription('powerful').includes(String(C.modPowerfulDamageMult)),
  `powerful description includes modPowerfulDamageMult (${C.modPowerfulDamageMult})`);
assert(enemyModifierDescription('defender').includes(String(C.modDefenderBlock)),
  `defender description includes modDefenderBlock (${C.modDefenderBlock})`);
assert(enemyModifierDescription('slow').length > 0, 'slow has description');

// ---------------------------------------------------------------------------
// 19. enemyModifierRefLifeForRegen
// ---------------------------------------------------------------------------

section('enemyModifierRefLifeForRegen');

// No modifierRatioBases → returns enemyBaseLife (40)
{
  const ref = enemyModifierRefLifeForRegen(baseEnemy());
  assert(ref === C.enemyBaseLife,
    `no modifierRatioBases → enemyBaseLife (${C.enemyBaseLife}): ${ref}`);
}

// With modifierRatioBases.life → returns that value
{
  const enemy: DemoEnemyDef = {
    ...baseEnemy(),
    modifierRatioBases: { life: 5000, armour: 100, evasion: 200, accuracy: 300, speed: 1.0 },
  };
  const ref = enemyModifierRefLifeForRegen(enemy);
  assert(ref === 5000, `with modifierRatioBases.life=5000: ${ref}`);
}

// modifierRatioBases.life = 0 → falls back to enemyBaseLife
{
  const enemy: DemoEnemyDef = {
    ...baseEnemy(),
    modifierRatioBases: { life: 0, armour: 1, evasion: 50, accuracy: 12, speed: 0.95 },
  };
  const ref = enemyModifierRefLifeForRegen(enemy);
  assert(ref === C.enemyBaseLife,
    `zero life → falls back to enemyBaseLife: ${ref}`);
}

// ---------------------------------------------------------------------------
// 20. enemyModifierRatioBasesAtLevel
// ---------------------------------------------------------------------------

section('enemyModifierRatioBasesAtLevel');

{
  const bases1 = enemyModifierRatioBasesAtLevel(1);
  assert(nearRel(bases1.life, C.enemyBaseLife, 1e-9), `level 1 life = base: ${bases1.life}`);
  assert(bases1.speed === C.enemyBaseSpeed, `level 1 speed = base: ${bases1.speed}`);
}

{
  const bases1 = enemyModifierRatioBasesAtLevel(1);
  const bases50 = enemyModifierRatioBasesAtLevel(50);
  assert(bases50.life > bases1.life, `level 50 life > level 1: ${bases50.life}`);
  assert(bases50.accuracy > bases1.accuracy, `level 50 accuracy > level 1: ${bases50.accuracy}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const total = passed + failed;
const status = failed === 0 ? 'OK' : 'FAILED';
console.log(`\nDamage types & mods tests: ${status} — ${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`);
if (failed > 0) process.exit(1);
