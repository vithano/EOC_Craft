import { EQUIPMENT_SLOTS, type EquippedEntry } from "../data/equipment";
import { GAME_CLASSES } from "../data/gameClasses";
import { EOC_ABILITY_DEFINITIONS } from "../data/eocAbilities";
import { EOC_BASE_EQUIPMENT, EOC_BASE_EQUIPMENT_BY_ID, isCraftedEquipItemId } from "../data/eocBaseEquipment";
import { EOC_UNIQUE_DEFINITIONS } from "../data/eocUniques";
import { EOC_MODIFIERS_BY_ID } from "../data/eocModifiers";
import type { StoredPlannerPayload } from "./eocBuildStorage";

type UpgradeLevels = Record<string, number>;

type AppliedModifierWireTuple = [string, number, number?];
type AppliedModifierWireObject = { modifierId: string; roll1: number; roll2?: number };
type AppliedModifierIdList = string[];

// ---------------------------------------------------------------------------
// Ultra-compact v3 binary share format (no backwards-compat required)
// ---------------------------------------------------------------------------

export type ShareV3Parsed = {
  version: 3;
  ability: { is32: boolean; value: number };
  equipped: Array<{
    item: { is32: boolean; value: number };
    craftedPrefixMods: Array<{ is32: boolean; value: number }>;
    craftedSuffixMods: Array<{ is32: boolean; value: number }>;
  }>;
  upgrades: Array<{ key: { is32: boolean; value: number }; points: number }>;
};

export type ShareV3Resolved = {
  upgradeLevels: Record<string, number>;
  equipped: Record<
    string,
    { itemId: string; craftedPrefixes?: AppliedModifierWireObject[]; craftedSuffixes?: AppliedModifierWireObject[] }
  >;
  abilityId: string | null;
};

const SHARE_V3_VERSION = 3;

export async function encodeShareV3(input: {
  upgradeLevels: Record<string, number>;
  equipped: Record<string, EquippedEntry>;
  abilityId: string | null;
}): Promise<string> {
  const ids: string[] = [];
  if (input.abilityId) ids.push(`ability:${input.abilityId}`);

  for (const slot of EQUIPMENT_SLOTS) {
    const entry = input.equipped?.[slot];
    const itemId = entry?.itemId ?? "none";
    if (itemId !== "none") ids.push(`item:${itemId}`);
    for (const m of entry?.craftedPrefixes ?? []) ids.push(`mod:${m.modifierId}`);
    for (const m of entry?.craftedSuffixes ?? []) ids.push(`mod:${m.modifierId}`);
  }
  for (const [k, v] of Object.entries(input.upgradeLevels ?? {})) {
    const points = Math.max(0, Math.floor(Number(v)));
    if (!points) continue;
    ids.push(`upg:${k}`);
  }

  const tokenPlan = chooseTokenWidths(ids);

  const out: number[] = [];
  out.push(SHARE_V3_VERSION);

  // Ability
  out.push(...encodeTokenValue(input.abilityId ? `ability:${input.abilityId}` : null, tokenPlan));

  // Equipped: always include crafted counts; non-crafted uses 0
  for (const slot of EQUIPMENT_SLOTS) {
    const entry = input.equipped?.[slot];
    const itemId = entry?.itemId ?? "none";
    out.push(...encodeTokenValue(itemId !== "none" ? `item:${itemId}` : null, tokenPlan));

    const cp = (entry?.craftedPrefixes ?? []).map((m) => m.modifierId).filter(Boolean);
    const cs = (entry?.craftedSuffixes ?? []).map((m) => m.modifierId).filter(Boolean);

    out.push(Math.min(255, cp.length));
    for (let i = 0; i < Math.min(255, cp.length); i++) out.push(...encodeTokenValue(`mod:${cp[i]}`, tokenPlan));

    out.push(Math.min(255, cs.length));
    for (let i = 0; i < Math.min(255, cs.length); i++) out.push(...encodeTokenValue(`mod:${cs[i]}`, tokenPlan));
  }

  // Upgrades
  const upgrades: Array<{ key: string; points: number }> = [];
  for (const [k, v] of Object.entries(input.upgradeLevels ?? {})) {
    const points = Math.max(0, Math.floor(Number(v)));
    if (!points) continue;
    upgrades.push({ key: k, points: Math.min(255, points) });
  }
  out.push(...encodeVarint(upgrades.length));
  for (const u of upgrades) {
    out.push(...encodeTokenValue(`upg:${u.key}`, tokenPlan));
    out.push(u.points & 0xff);
  }

  if (process.env.NODE_ENV !== "production") {
    assertNoPlannedCollisions(ids, tokenPlan);
  }

  return base64UrlFromBytes(new Uint8Array(out));
}

/**
 * Dev-only sanity check.
 *
 * Ensures the v3 encoder's per-build collision handling is working by
 * round-tripping a tiny synthetic payload and verifying it decodes.
 */
export async function __dev_shareV3SelfTest(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return true;
  const sample = await encodeShareV3({
    upgradeLevels: { "sorcerer/increasedLife": 5 },
    equipped: { Weapon: { itemId: "unique_the_gilden_apex" } } as unknown as Record<string, EquippedEntry>,
    abilityId: null,
  });
  const parsed = decodeShareV3(sample);
  return parsed != null && parsed.version === 3;
}

export function decodeShareV3(buildParam: string): ShareV3Parsed | null {
  if (!buildParam || typeof buildParam !== "string") return null;
  let bytes: Uint8Array;
  try {
    bytes = bytesFromBase64Url(buildParam);
  } catch {
    return null;
  }
  if (bytes.length < 2) return null;
  let i = 0;
  const version = bytes[i++];
  if (version !== SHARE_V3_VERSION) return null;

  const ability = decodeToken(bytes, i);
  if (!ability) return null;
  i = ability.nextIndex;

  const equipped: ShareV3Parsed["equipped"] = [];
  for (let s = 0; s < EQUIPMENT_SLOTS.length; s++) {
    const item = decodeToken(bytes, i);
    if (!item) return null;
    i = item.nextIndex;

    if (i >= bytes.length) return null;
    const pCount = bytes[i++]!;
    const craftedPrefixMods: Array<{ is32: boolean; value: number }> = [];
    for (let p = 0; p < pCount; p++) {
      const t = decodeToken(bytes, i);
      if (!t) return null;
      i = t.nextIndex;
      craftedPrefixMods.push({ is32: t.is32, value: t.value });
    }

    if (i >= bytes.length) return null;
    const sCount = bytes[i++]!;
    const craftedSuffixMods: Array<{ is32: boolean; value: number }> = [];
    for (let q = 0; q < sCount; q++) {
      const t = decodeToken(bytes, i);
      if (!t) return null;
      i = t.nextIndex;
      craftedSuffixMods.push({ is32: t.is32, value: t.value });
    }

    equipped.push({
      item: { is32: item.is32, value: item.value },
      craftedPrefixMods,
      craftedSuffixMods,
    });
  }

  const countRes = decodeVarint(bytes, i);
  if (!countRes) return null;
  i = countRes.nextIndex;
  const upgrades: ShareV3Parsed["upgrades"] = [];
  for (let n = 0; n < countRes.value; n++) {
    const key = decodeToken(bytes, i);
    if (!key) return null;
    i = key.nextIndex;
    if (i >= bytes.length) return null;
    const points = bytes[i++]!;
    upgrades.push({ key: { is32: key.is32, value: key.value }, points });
  }

  return { version: 3, ability: { is32: ability.is32, value: ability.value }, equipped, upgrades };
}

export function resolveShareV3(parsed: ShareV3Parsed): ShareV3Resolved {
  const abilityTokMap = buildTokenToIdMap((EOC_ABILITY_DEFINITIONS ?? []).map((a) => `ability:${a.id}`));
  const itemTokMap = buildTokenToIdMap([
    ...(EOC_UNIQUE_DEFINITIONS ?? []).map((u) => `item:${u.id}`),
    ...(EOC_BASE_EQUIPMENT ?? []).map((b) => `item:${b.id}`),
  ]);
  const modTokMap = buildTokenToIdMap(Object.keys(EOC_MODIFIERS_BY_ID ?? {}).map((id) => `mod:${id}`));
  const upgTokMap = buildTokenToIdMap(allUpgradeKeys().map((k) => `upg:${k}`));

  const abilityId = (() => {
    if (parsed.ability.value === 0) return null;
    const tagged = abilityTokMap.get(tokenKey(parsed.ability));
    return tagged ? tagged.slice("ability:".length) : null;
  })();

  const equipped: ShareV3Resolved["equipped"] = {};
  for (let s = 0; s < EQUIPMENT_SLOTS.length; s++) {
    const slot = EQUIPMENT_SLOTS[s]!;
    const row = parsed.equipped[s]!;
    const itemId = (() => {
      if (row.item.value === 0) return "none";
      const tagged = itemTokMap.get(tokenKey(row.item));
      return tagged ? tagged.slice("item:".length) : "none";
    })();

    const cpIds = row.craftedPrefixMods
      .map((t) => modTokMap.get(tokenKey(t)))
      .filter((x): x is string => !!x)
      .map((x) => x.slice("mod:".length));
    const csIds = row.craftedSuffixMods
      .map((t) => modTokMap.get(tokenKey(t)))
      .filter((x): x is string => !!x)
      .map((x) => x.slice("mod:".length));

    equipped[slot] = {
      itemId,
      craftedPrefixes: buildMaxRolledCraftedMods(itemId, cpIds),
      craftedSuffixes: buildMaxRolledCraftedMods(itemId, csIds),
    };
  }

  const upgradeLevels: Record<string, number> = {};
  for (const u of parsed.upgrades) {
    const tagged = upgTokMap.get(tokenKey(u.key));
    if (!tagged) continue;
    const key = tagged.slice("upg:".length);
    const points = Math.max(0, Math.floor(u.points));
    if (!points) continue;
    upgradeLevels[key] = Math.min(999, (upgradeLevels[key] ?? 0) + points);
  }

  return { upgradeLevels, equipped, abilityId };
}

function allUpgradeKeys(): string[] {
  const out: string[] = [];
  for (const cls of GAME_CLASSES ?? []) {
    const classId = cls.id;
    for (const upg of cls.upgrades ?? []) out.push(`${classId}/${upg.id}`);
  }
  return out;
}

function buildTokenToIdMap(taggedIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const tid of taggedIds) {
    if (!tid) continue;
    map.set(tokenKey({ is32: false, value: fnv1a24(tid) }), tid);
    map.set(tokenKey({ is32: true, value: fnv1a32(tid) }), tid);
  }
  return map;
}

function tokenKey(t: { is32: boolean; value: number }): string {
  return `${t.is32 ? "32" : "24"}:${t.value >>> 0}`;
}

function chooseTokenWidths(taggedIds: string[]): Map<string, "24" | "32"> {
  const plan = new Map<string, "24" | "32">();
  const by24 = new Map<number, string[]>();
  for (const id of taggedIds) {
    const h = fnv1a24(id);
    const arr = by24.get(h) ?? [];
    arr.push(id);
    by24.set(h, arr);
  }
  const need32 = new Set<string>();
  for (const [, ids] of by24) {
    const uniq = Array.from(new Set(ids));
    if (uniq.length > 1) for (const id of uniq) need32.add(id);
  }
  for (const id of taggedIds) plan.set(id, need32.has(id) ? "32" : "24");
  return plan;
}

function assertNoPlannedCollisions(taggedIds: string[], plan: Map<string, "24" | "32">): void {
  const seen = new Map<number, string>();
  for (const id of taggedIds) {
    if (plan.get(id) !== "24") continue;
    const h = fnv1a24(id);
    const prev = seen.get(h);
    if (prev && prev !== id) throw new Error(`Share v3 collision (24-bit) between ${prev} and ${id}`);
    seen.set(h, id);
  }
}

function encodeTokenValue(taggedIdOrNull: string | null, plan: Map<string, "24" | "32">): number[] {
  if (!taggedIdOrNull) return [0, 0, 0, 0];
  const width = plan.get(taggedIdOrNull) ?? "24";
  const is32 = width === "32";
  const v = is32 ? fnv1a32(taggedIdOrNull) : fnv1a24(taggedIdOrNull);
  return encodeTokenRaw({ is32, value: v });
}

function encodeTokenRaw(t: { is32: boolean; value: number }): number[] {
  const v = t.value >>> 0;
  if (!t.is32) return [0, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  return [1, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function decodeToken(bytes: Uint8Array, start: number): { is32: boolean; value: number; nextIndex: number } | null {
  if (start >= bytes.length) return null;
  const marker = bytes[start]!;
  if (marker === 0) {
    if (start + 3 >= bytes.length) return null;
    const v = ((bytes[start + 1]! << 16) | (bytes[start + 2]! << 8) | bytes[start + 3]!) >>> 0;
    return { is32: false, value: v, nextIndex: start + 4 };
  }
  if (marker === 1) {
    if (start + 4 >= bytes.length) return null;
    const v =
      ((bytes[start + 1]! << 24) | (bytes[start + 2]! << 16) | (bytes[start + 3]! << 8) | bytes[start + 4]!) >>> 0;
    return { is32: true, value: v, nextIndex: start + 5 };
  }
  return null;
}

function encodeVarint(n: number): number[] {
  let x = Math.max(0, Math.floor(n));
  const out: number[] = [];
  while (x >= 0x80) {
    out.push((x & 0x7f) | 0x80);
    x = Math.floor(x / 128);
  }
  out.push(x & 0x7f);
  return out;
}

function decodeVarint(bytes: Uint8Array, start: number): { value: number; nextIndex: number } | null {
  let x = 0;
  let shift = 0;
  let i = start;
  while (i < bytes.length && shift <= 28) {
    const b = bytes[i++]!;
    x |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: x >>> 0, nextIndex: i };
    shift += 7;
  }
  return null;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromBase64Url(base64url: string): Uint8Array {
  const standard = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(standard);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fnv1a24(str: string): number {
  return fnv1a32(str) & 0xffffff;
}

export type ShareV2Data = {
  upgradeLevels: UpgradeLevels;
  /**
   * Minimal equipped map (itemId only).
   * If game data has not loaded yet, this may decode as all 'none' — use `resolveShareV2`
   * with the raw aliases to resolve later.
   */
  equipped: Record<string, { itemId: string; craftedPrefixes?: unknown; craftedSuffixes?: unknown }>;
  /**
   * Ability id or null. (Level/attunement are intentionally not encoded.)
   * If game data has not loaded yet, this may decode as null — use `resolveShareV2`.
   */
  abilityId: string | null;
  /** Raw v2 equipped aliases by slot order (for deferred resolution). */
  equippedAliases: string[];
  /** Raw v2 ability alias (for deferred resolution). */
  abilityAlias: string | null;
  /** Crafted modifier IDs per slot (for deferred resolution). */
  craftedBySlot: Array<{ cp?: AppliedModifierIdList; cs?: AppliedModifierIdList } | null>;
};

type ShareV2Wire = {
  v: 2;
  /** upgrades: [classAlias, upgradeAlias, points] */
  u: [string, string, number][];
  /**
   * equipped slot order: `EQUIPMENT_SLOTS`
   * - string: just item alias
   * - object: item alias + crafted modifiers
   */
  e: Array<
    | string
    | {
        i: string;
        cp?: AppliedModifierIdList | Array<[string, number, number?]>;
        cs?: AppliedModifierIdList | Array<[string, number, number?]>;
      }
  >;
  /** ability alias (or empty) */
  a?: string;
};

const V2_PREFIX = "v2.";

export async function encodeShareV2(input: {
  upgradeLevels: UpgradeLevels;
  equipped: Record<string, EquippedEntry>;
  abilityId: string | null;
}): Promise<string> {
  const { upgradeLevels, equipped, abilityId } = input;
  const { classIdToAlias, upgradeKeyToAlias } = buildUpgradeAliasMaps();

  const u: [string, string, number][] = [];
  for (const [k, rawV] of Object.entries(upgradeLevels ?? {})) {
    const points = Math.max(0, Math.floor(Number(rawV)));
    if (!points) continue;
    const [classId, upgradeKey] = splitUpgradeLevelKey(k);
    if (!classId || !upgradeKey) continue;
    const ca = classIdToAlias.get(classId);
    const ua = upgradeKeyToAlias.get(upgradeKey);
    if (!ca || !ua) continue;
    u.push([ca, ua, points]);
  }

  const e: ShareV2Wire["e"] = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const entry = equipped?.[slot];
    const itemId = entry?.itemId ?? "none";
    const itemAlias = itemId === "none" ? "" : aliasForId(itemId);
    if (!itemAlias) {
      e.push("");
      continue;
    }
    // For crafted items, we only persist modifier IDs; rolls are assumed max on load.
    const cp = (entry?.craftedPrefixes ?? []).map((m) => m.modifierId).filter(Boolean);
    const cs = (entry?.craftedSuffixes ?? []).map((m) => m.modifierId).filter(Boolean);
    if (cp.length || cs.length) {
      e.push({ i: itemAlias, ...(cp.length ? { cp } : {}), ...(cs.length ? { cs } : {}) });
    } else {
      e.push(itemAlias);
    }
  }

  const wire: ShareV2Wire = {
    v: 2,
    u,
    e,
    ...(abilityId ? { a: aliasForId(abilityId) } : {}),
  };

  const json = JSON.stringify(wire);
  const encoded = await deflateRawToBase64Url(json);
  return `${V2_PREFIX}${encoded}`;
}

export async function decodeShare(buildParam: string): Promise<
  | { kind: "v2"; data: ShareV2Data }
  | { kind: "legacy"; legacyParamJson: string }
  | { kind: "invalid" }
> {
  if (!buildParam || typeof buildParam !== "string") return { kind: "invalid" };

  if (buildParam.startsWith(V2_PREFIX)) {
    try {
      const raw = buildParam.slice(V2_PREFIX.length);
      const json = await inflateRawFromBase64Url(raw);
      const data = parseShareV2Json(json);
      return data ? { kind: "v2", data } : { kind: "invalid" };
    } catch {
      return { kind: "invalid" };
    }
  }

  // Legacy: base64url(deflate-raw(JSON))
  try {
    const json = await inflateRawFromBase64Url(buildParam);
    return { kind: "legacy", legacyParamJson: json };
  } catch {
    return { kind: "invalid" };
  }
}

function parseShareV2Json(rawJson: string): ShareV2Data | null {
  let obj: unknown;
  try {
    obj = JSON.parse(rawJson) as unknown;
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Partial<ShareV2Wire> & Record<string, unknown>;
  if (o.v !== 2) return null;
  if (!Array.isArray(o.u) || !Array.isArray(o.e)) return null;

  const { aliasToClassId, aliasToUpgradeKey } = buildUpgradeAliasMaps();

  const upgradeLevels: UpgradeLevels = {};
  for (const row of o.u) {
    if (!Array.isArray(row) || row.length !== 3) continue;
    const [ca, ua, pv] = row as [unknown, unknown, unknown];
    if (typeof ca !== "string" || typeof ua !== "string") continue;
    const points = Math.max(0, Math.floor(Number(pv)));
    if (!points) continue;
    const classId = aliasToClassId.get(ca);
    const upgradeKey = aliasToUpgradeKey.get(ua);
    if (!classId || !upgradeKey) continue;
    const key = `${classId}/${upgradeKey}`;
    upgradeLevels[key] = Math.min(999, (upgradeLevels[key] ?? 0) + points);
  }

  const equippedAliases: string[] = [];
  const craftedBySlot: Array<{ cp?: AppliedModifierIdList; cs?: AppliedModifierIdList } | null> = [];
  const equipped: Record<string, { itemId: string; craftedPrefixes?: unknown; craftedSuffixes?: unknown }> = {};
  const aliasToItemId = buildItemAliasToIdMap(); // may be empty pre-game-data
  for (let i = 0; i < EQUIPMENT_SLOTS.length; i++) {
    const slot = EQUIPMENT_SLOTS[i]!;
    const raw = o.e[i] as unknown;
    const alias =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && "i" in (raw as Record<string, unknown>) && typeof (raw as Record<string, unknown>).i === "string"
          ? ((raw as Record<string, unknown>).i as string)
          : "";
    equippedAliases.push(alias);
    const itemId = alias ? aliasToItemId.get(alias) ?? "none" : "none";
    const entry: { itemId: string; craftedPrefixes?: unknown; craftedSuffixes?: unknown } = { itemId };
    let crafted: { cp?: AppliedModifierIdList; cs?: AppliedModifierIdList } | null = null;
    if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      if (Array.isArray(r.cp)) {
        const ids = wireModsToModifierIdList(r.cp);
        entry.craftedPrefixes = itemId !== "none" ? buildMaxRolledCraftedMods(itemId, ids) : undefined;
        crafted = crafted ?? {};
        if (ids?.length) crafted.cp = ids;
      }
      if (Array.isArray(r.cs)) {
        const ids = wireModsToModifierIdList(r.cs);
        entry.craftedSuffixes = itemId !== "none" ? buildMaxRolledCraftedMods(itemId, ids) : undefined;
        crafted = crafted ?? {};
        if (ids?.length) crafted.cs = ids;
      }
    }
    craftedBySlot.push(crafted);
    equipped[slot] = entry;
  }

  const aliasToAbilityId = buildAbilityAliasToIdMap(); // may be empty pre-game-data
  const abilityAlias = typeof o.a === "string" ? o.a : "";
  const abilityId = abilityAlias ? aliasToAbilityId.get(abilityAlias) ?? null : null;

  return {
    upgradeLevels,
    equipped,
    abilityId,
    equippedAliases,
    abilityAlias: abilityAlias || null,
    craftedBySlot,
  };
}

/**
 * Resolve v2 equipment/ability aliases to ids using *current* loaded game data.
 * Call this after `GameDataProvider` has finished loading.
 */
export function resolveShareV2(aliases: {
  equippedAliases: string[];
  abilityAlias: string | null;
  craftedBySlot?: Array<{ cp?: AppliedModifierIdList; cs?: AppliedModifierIdList } | null>;
}): { equipped: Record<string, { itemId: string; craftedPrefixes?: unknown; craftedSuffixes?: unknown }>; abilityId: string | null } {
  const equipped: Record<string, { itemId: string; craftedPrefixes?: unknown; craftedSuffixes?: unknown }> = {};
  const aliasToItemId = buildItemAliasToIdMap();
  for (let i = 0; i < EQUIPMENT_SLOTS.length; i++) {
    const slot = EQUIPMENT_SLOTS[i]!;
    const a = aliases.equippedAliases?.[i] ?? "";
    const itemId = a ? aliasToItemId.get(a) ?? "none" : "none";
    const extra = aliases.craftedBySlot?.[i] ?? null;
    const entry: { itemId: string; craftedPrefixes?: unknown; craftedSuffixes?: unknown } = { itemId };
    if (extra?.cp?.length) entry.craftedPrefixes = buildMaxRolledCraftedMods(itemId, extra.cp);
    if (extra?.cs?.length) entry.craftedSuffixes = buildMaxRolledCraftedMods(itemId, extra.cs);
    equipped[slot] = entry;
  }
  const aliasToAbilityId = buildAbilityAliasToIdMap();
  const abilityId = aliases.abilityAlias ? aliasToAbilityId.get(aliases.abilityAlias) ?? null : null;
  return { equipped, abilityId };
}

function wireModsToModifierIdList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: string[] = [];
  for (const row of raw) {
    // New format: ["modifierId", ...]
    if (typeof row === "string") {
      if (row) out.push(row);
      continue;
    }
    // Backward-compat: tuple format [modifierId, roll1, roll2?]
    if (Array.isArray(row) && row.length >= 1) {
      const id = typeof row[0] === "string" ? row[0] : "";
      if (id) out.push(id);
    }
  }
  return out.length ? out : undefined;
}

function buildMaxRolledCraftedMods(itemId: string, modifierIds: string[] | undefined): AppliedModifierWireObject[] | undefined {
  if (!modifierIds?.length) return undefined;
  if (!itemId || itemId === "none") return undefined;
  if (!isCraftedEquipItemId(itemId)) return undefined;
  const base = EOC_BASE_EQUIPMENT_BY_ID[itemId];
  const itemType = base?.itemType;
  if (!itemType) return undefined;

  const out: AppliedModifierWireObject[] = [];
  for (const modifierId of modifierIds) {
    const mod = EOC_MODIFIERS_BY_ID[modifierId];
    if (!mod) continue;
    const spec = mod.itemTypeValues?.[itemType];
    if (!spec) continue;
    out.push({
      modifierId,
      roll1: spec.range1.max,
      roll2: spec.range2 ? spec.range2.max : undefined,
    });
  }
  return out.length ? out : undefined;
}

function splitUpgradeLevelKey(key: string): [string, string] {
  const idx = key.indexOf("/");
  if (idx <= 0) return ["", ""];
  const classId = key.slice(0, idx);
  const upgradeKey = key.slice(idx + 1);
  return [classId, upgradeKey];
}

function buildUpgradeAliasMaps(): {
  classIdToAlias: Map<string, string>;
  aliasToClassId: Map<string, string>;
  upgradeKeyToAlias: Map<string, string>;
  aliasToUpgradeKey: Map<string, string>;
} {
  const classIds = (GAME_CLASSES ?? []).map((c) => c.id).filter(Boolean);
  const classIdToAlias = new Map<string, string>();
  const aliasToClassId = new Map<string, string>();
  for (const id of classIds) {
    const alias = aliasForId(`cls:${id}`);
    classIdToAlias.set(id, alias);
    if (!aliasToClassId.has(alias)) aliasToClassId.set(alias, id);
  }

  const upgradeKeys = new Set<string>();
  for (const cls of GAME_CLASSES ?? []) {
    for (const u of cls.upgrades ?? []) upgradeKeys.add(u.id);
  }
  const upgradeKeyToAlias = new Map<string, string>();
  const aliasToUpgradeKey = new Map<string, string>();
  for (const key of Array.from(upgradeKeys)) {
    const alias = aliasForId(`upg:${key}`);
    upgradeKeyToAlias.set(key, alias);
    if (!aliasToUpgradeKey.has(alias)) aliasToUpgradeKey.set(alias, key);
  }

  return { classIdToAlias, aliasToClassId, upgradeKeyToAlias, aliasToUpgradeKey };
}

function buildItemAliasToIdMap(): Map<string, string> {
  const map = new Map<string, string>();
  const add = (id: string) => {
    if (!id || id === "none") return;
    const alias = aliasForId(id);
    if (!map.has(alias)) map.set(alias, id);
  };

  for (const u of EOC_UNIQUE_DEFINITIONS ?? []) add(u.id);
  for (const b of EOC_BASE_EQUIPMENT ?? []) add(b.id);

  return map;
}

function buildAbilityAliasToIdMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of EOC_ABILITY_DEFINITIONS ?? []) {
    const id = a.id;
    if (!id) continue;
    const alias = aliasForId(id);
    if (!map.has(alias)) map.set(alias, id);
  }
  return map;
}

async function deflateRawToBase64Url(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  const bytes2 = new Uint8Array(compressed);
  let binary = "";
  for (let i = 0; i < bytes2.length; i++) binary += String.fromCharCode(bytes2[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function inflateRawFromBase64Url(base64url: string): Promise<string> {
  const standard = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const compressed = Uint8Array.from(atob(standard), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  void writer.write(compressed);
  void writer.close();
  return new Response(ds.readable).text();
}

function aliasForId(id: string): string {
  const h = fnv1a32(id);
  return toBase62(h).padStart(6, "0");
}

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash >>> 0;
}

const BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function toBase62(n: number): string {
  let x = n >>> 0;
  if (x === 0) return "0";
  let out = "";
  while (x > 0) {
    const r = x % 62;
    out = BASE62_ALPHABET[r]! + out;
    x = Math.floor(x / 62);
  }
  return out;
}

// Kept for potential future use: callers sometimes want to type-narrow to the planner payload.
export type { StoredPlannerPayload };

