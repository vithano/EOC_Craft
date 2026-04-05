/**
 * Parsers for Google Sheets CSV tabs: Uniques, Abilities, Formulas.
 * Uniques parser is a TypeScript port of scripts/generate_eoc_uniques.py.
 * Abilities parser is a TypeScript port of scripts/generate_eoc_abilities.py.
 * Formulas parser reads Key/Value rows into FormulaConstants.
 */

import type { EocUniqueDefinition, UniqueModPiece } from '../data/eocUniques';
import type { EocAbilityDefinition, EocAbilityType, EocSpellHit } from '../data/eocAbilities';
import type { FormulaConstants } from '../data/formulaConstants';

// ---------------------------------------------------------------------------
// Generic CSV parser (RFC 4180)
// ---------------------------------------------------------------------------

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r') {
        // skip CR in CRLF
      } else if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  // last row (no trailing newline)
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((c) => c !== '')) rows.push(row);
  }

  return rows;
}

/** Build a header→index map from the first row. */
function headerMap(rows: string[][]): Map<string, number> {
  const map = new Map<string, number>();
  if (rows.length === 0) return map;
  rows[0].forEach((h, i) => map.set(h.trim(), i));
  return map;
}

function col(row: string[], map: Map<string, number>, key: string): string {
  const i = map.get(key);
  return i !== undefined ? (row[i] ?? '').trim() : '';
}

// ---------------------------------------------------------------------------
// Uniques parser (port of generate_eoc_uniques.py)
// ---------------------------------------------------------------------------

const RANGE_RE = /\(\s*(-?\d+(?:\.\d+)?)\s*%?\s+to\s+(-?\d+(?:\.\d+)?)\s*%?\s*\)/gi;
const DASH_RANGE_RE = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/;

const TWO_HANDED_TYPES = new Set([
  'Warhammer', 'Greatsword', 'Bow', 'Magestave', 'Battlestave',
]);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/,/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parsePieces(text: string): UniqueModPiece[] {
  const s = text.trim();
  if (!s) return [];
  const parts: UniqueModPiece[] = [];
  let last = 0;
  // reset lastIndex so the global regex works correctly
  RANGE_RE.lastIndex = 0;
  for (const m of s.matchAll(RANGE_RE)) {
    if (m.index! > last) parts.push(s.slice(last, m.index));
    parts.push({ type: 'range', min: parseFloat(m[1]), max: parseFloat(m[2]) });
    last = m.index! + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

function toIntMaybe(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

function toFloatMaybe(v: string): number | null {
  const t = v.trim().replace('%', '');
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function parsePhysDamage(s: string): [number | null, number | null] {
  const t = s.trim();
  if (!t) return [null, null];
  const m = t.match(DASH_RANGE_RE);
  if (m) return [parseFloat(m[1]), parseFloat(m[2])];
  const v = parseFloat(t);
  return isNaN(v) ? [null, null] : [v, v];
}

function parseEnhancementPercent(s: string): number {
  const t = s.trim().replace('%', '');
  if (!t) return 0;
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

function collectRollLabels(innate: UniqueModPiece[], lines: UniqueModPiece[][]): string[] {
  const labels: string[] = [];

  function walk(pieces: UniqueModPiece[]) {
    pieces.forEach((p, i) => {
      if (typeof p === 'string' || p.type !== 'range') return;
      let left = '';
      let j = i - 1;
      while (j >= 0 && typeof pieces[j] === 'string') {
        left = (pieces[j] as string) + left;
        j--;
      }
      let right = '';
      j = i + 1;
      while (j < pieces.length && typeof pieces[j] === 'string') {
        right += pieces[j] as string;
        j++;
      }
      const L = left.trim();
      const R = right.trim();
      let core = (L + (L && R ? ' ' : '') + R).trim();
      if (core.startsWith('%')) core = 'Value' + core;
      labels.push(core || `Value ${labels.length + 1}`);
    });
  }

  walk(innate);
  lines.forEach(walk);
  return labels;
}

function gameSlot(itemSlot: string, itemType: string): string {
  if (itemSlot === 'Weapon') return 'Weapon';
  if (itemSlot === 'Armor') {
    const m: Record<string, string> = {
      Body: 'Chest', Helmet: 'Helmet', Gloves: 'Gloves',
      Boots: 'Boots', Shield: 'Off-hand',
    };
    return m[itemType] ?? itemType;
  }
  if (itemSlot === 'Accessory') {
    const m: Record<string, string> = { Amulet: 'Amulet', Ring: 'Ring', Belt: 'Belt' };
    return m[itemType] ?? itemType;
  }
  return itemType;
}

export function parseUniquesCSV(csv: string): EocUniqueDefinition[] {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  const hdr = headerMap(rows);

  const uniques: EocUniqueDefinition[] = [];
  for (const row of rows.slice(1)) {
    const name = col(row, hdr, 'Name');
    if (!name) continue;

    const itemSlot = col(row, hdr, 'Item Slot');
    const itemType = col(row, hdr, 'Item Type');
    let slot: string;
    try {
      slot = gameSlot(itemSlot, itemType);
    } catch {
      continue; // skip unknown slots
    }

    const innate = parsePieces(col(row, hdr, 'Innate Stat'));
    const lines: UniqueModPiece[][] = [];
    for (let i = 1; i <= 6; i++) {
      const lc = col(row, hdr, `Line ${i}`);
      if (lc) lines.push(parsePieces(lc));
    }

    const [dmgMin, dmgMax] = parsePhysDamage(col(row, hdr, 'physical damage'));
    const enhBonus = col(row, hdr, 'Enhancement Bonus');

    uniques.push({
      id: `unique_${slugify(name)}`,
      name,
      slot,
      itemType,
      reqLevel: toIntMaybe(col(row, hdr, 'Required Level')) ?? 1,
      reqStr: toIntMaybe(col(row, hdr, 'Required Strength')),
      reqDex: toIntMaybe(col(row, hdr, 'Required Dexerity')),
      reqInt: toIntMaybe(col(row, hdr, 'Required Intelligence')),
      enhancementBonus: enhBonus,
      enhancementBonusPerLevel: parseEnhancementPercent(enhBonus),
      maxEnhancement: 10,
      twoHanded: TWO_HANDED_TYPES.has(itemType),
      rollLabels: collectRollLabels(innate, lines),
      innate,
      lines,
      baseDamageMin: dmgMin,
      baseDamageMax: dmgMax,
      baseCritChance: toFloatMaybe(col(row, hdr, 'base critical hit chance')),
      baseAttackSpeed: toFloatMaybe(col(row, hdr, 'attack speed')),
      baseArmour: toIntMaybe(col(row, hdr, 'armour')),
      baseEvasion: toIntMaybe(col(row, hdr, 'evasion')),
      baseEnergyShield: toIntMaybe(col(row, hdr, 'energy shield')),
      baseBlockChance: toFloatMaybe(col(row, hdr, 'chance to block')),
    });
  }
  return uniques;
}

// ---------------------------------------------------------------------------
// Formula constants parser (Formulas tab)
// Expected columns: Key, Value, Category, Description, Expression
// Matches formulas/damage_formulas.csv
// ---------------------------------------------------------------------------

function parseNum(s: string): number {
  const t = s.trim().replace(/,/g, '').replace(/%$/, '');
  const n = parseFloat(t);
  return isNaN(n) ? NaN : n;
}

/** Maps CSV Key strings to FormulaConstants property names. */
const KEY_MAP: Record<string, keyof FormulaConstants> = {
  armour_dr_c1:              'armourDrC1',
  armour_dr_c2:              'armourDrC2',
  armour_dr_cap:             'armourDrCap',
  armour_vs_physical:        'armourVsPhysical',
  armour_vs_elemental:       'armourVsElemental',
  armour_vs_chaos:           'armourVsChaos',
  evasion_acc_coeff:         'evasionAccCoeff',
  evasion_divisor:           'evasionDivisor',
  evasion_cap:               'evasionCap',
  elemental_res_cap:         'elementalResCap',
  chaos_res_cap:             'chaosResCap',
  ailment_pool_divisor:      'ailmentPoolDivisor',
  shock_extra_effect_mult:   'shockExtraEffectMult',
  chill_special_mult:        'chillSpecialMult',
  ailment_base_duration_sec: 'ailmentBaseDurationSec',
  level100_player_accuracy:  'level100PlayerAccuracy',
  level100_enemy_accuracy:   'level100EnemyAccuracy',
  level100_enemy_evasion:    'level100EnemyEvasion',
};

export function parseFormulaConstantsCSV(csv: string): Partial<FormulaConstants> {
  const rows = parseCSV(csv);
  if (rows.length < 2) return {};
  const hdr = headerMap(rows);
  const out: Partial<FormulaConstants> = {};

  for (const row of rows.slice(1)) {
    const key = col(row, hdr, 'Key').trim();
    const rawVal = col(row, hdr, 'Value');
    if (!key || !rawVal) continue;

    const prop = KEY_MAP[key];
    if (!prop) continue;

    const val = parseNum(rawVal);
    if (!isNaN(val)) (out as Record<string, number>)[prop] = val;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Abilities parser (Abilities tab — port of scripts/generate_eoc_abilities.py)
// Expected columns match abilities(1.3.2).csv:
//   Type, Name, starting ability level, weapon types, Damage multiplier,
//   Attack speed multiplier, Added damage multiplier, Cast time(seconds),
//   Base critical hit chance, Mana cost, line 1–5, attunement 0%, attunement 100%
// ---------------------------------------------------------------------------

const VALID_ABILITY_TYPES = new Set<string>(['Melee', 'Ranged', 'Spells']);

const MELEE_WEAPON_TAGS = [
  'mace', 'warhammer', 'battlestaff', 'sword', 'greatsword', 'dagger',
];

const DEALS_RE = /deals\s+(\d+)\s*-\s*(\d+)\s+(\w+)\s+damage/i;

function normalizeWeaponTags(raw: string): string[] {
  const s = raw.trim().toLowerCase();
  if (!s) return [];
  if (s === 'melee weapon') return [...MELEE_WEAPON_TAGS];
  return s.split(',').map((p) => p.trim()).filter(Boolean).map((p) =>
    p === 'hand crossbow' ? 'hand_crossbow' : p.replace(/\s+/g, '_')
  );
}

function parseSpellHit(line1: string): EocSpellHit | null {
  const m = line1.match(DEALS_RE);
  if (!m) return null;
  return { min: parseInt(m[1], 10), max: parseInt(m[2], 10), element: m[3].toLowerCase() };
}

function pctMaybe(s: string): number | null {
  const t = s.trim().replace('%', '');
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function floatMaybe(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function intMaybe(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

export function parseAbilitiesCSV(csv: string): EocAbilityDefinition[] {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  const hdr = headerMap(rows);

  const abilities: EocAbilityDefinition[] = [];

  for (const row of rows.slice(1)) {
    const type = col(row, hdr, 'Type');
    const name = col(row, hdr, 'Name');
    if (!type || !name || !VALID_ABILITY_TYPES.has(type)) continue;

    const lines: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const v = col(row, hdr, `line ${i}`);
      if (v) lines.push(v);
    }

    const line1 = col(row, hdr, 'line 1');
    const spellHit = type === 'Spells' ? parseSpellHit(line1) : null;
    const weaponTypesRaw = col(row, hdr, 'weapon types');

    abilities.push({
      id: `ability_${slugify(name)}`,
      type: type as EocAbilityType,
      name,
      startingAbilityLevel: intMaybe(col(row, hdr, 'starting ability level')) ?? 0,
      weaponTypesRaw,
      weaponTags: normalizeWeaponTags(weaponTypesRaw),
      damageMultiplierPct: pctMaybe(col(row, hdr, 'Damage multiplier')),
      attackSpeedMultiplierPct: pctMaybe(col(row, hdr, 'Attack speed multiplier')),
      addedDamageMultiplierPct: pctMaybe(col(row, hdr, 'Added damage multiplier')),
      castTimeSeconds: floatMaybe(col(row, hdr, 'Cast time(seconds)')),
      baseCritChancePct: pctMaybe(col(row, hdr, 'Base critical hit chance')),
      manaCost: intMaybe(col(row, hdr, 'Mana cost')),
      lines,
      attunement0: col(row, hdr, 'attunement 0%'),
      attunement100: col(row, hdr, 'attunement 100%'),
      spellHit,
    });
  }

  return abilities;
}
