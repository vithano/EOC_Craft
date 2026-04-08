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

