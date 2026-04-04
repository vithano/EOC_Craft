"use client";

import { useCallback, useMemo, useState } from "react";
import type { ComputedBuildStats } from "../data/gameStats";
import type { EquippedEntry, EquipmentFilter, InventoryStack, Rarity } from "../data/equipment";
import {
  EQUIPMENT_SLOTS,
  getEquippedEntry,
  getItemDefinition,
  INVENTORY_MAX_SLOTS,
  slotCategory,
} from "../data/equipment";
import {
  EOC_UNIQUE_DEFINITIONS,
  EOC_UNIQUE_BY_ID,
  defaultRollsForUnique,
  isUniqueItemId,
  maxEnhancementForUnique,
  resolveUniqueMods,
  rollBoundsForUnique,
  rollLabelForIndex,
  type EocUniqueDefinition,
  type UniqueModPiece,
} from "../data/eocUniques";
import {
  buildHitDamageByType,
  HIT_DAMAGE_TYPE_COLOR_CLASS,
  HIT_DAMAGE_TYPE_LABEL,
  localFlatDamageDisplayRange,
  type HitDamageTypeRow,
} from "../data/damageTypes";
import { equipmentModifiersFromUniqueTexts } from "../data/uniqueGearMods";
import EocStatsPanel from "./EocStatsPanel";
import { EmptySlotIcon, EquippedItemIcon, FilterIcon, plannerSlotToGlyphKey } from "./equipmentIcons";

const rarityTone: Record<Rarity, string> = {
  common: "text-[#a8a29e]",
  uncommon: "text-[#6ee7b7]",
  rare: "text-[#7dd3fc]",
  epic: "text-[#d8b4fe]",
  unique: "text-[#d4af37]",
};

const panelFrame =
  "rounded-sm border border-[#8b7355]/90 bg-[#1a1612] shadow-[inset_0_1px_0_rgba(255,200,120,0.08)]";

const brassBtn =
  "rounded-sm border border-[#8b7355] bg-gradient-to-b from-[#4a3d2e] to-[#2e261c] text-[#e8dcc8] text-xs font-semibold tracking-wide uppercase px-3 py-2 shadow-[inset_0_1px_0_rgba(255,220,180,0.15)] hover:from-[#554838] hover:to-[#3a3024] active:translate-y-px transition-colors";

const slotBox =
  "relative flex aspect-square w-11 sm:w-12 items-center justify-center rounded-sm border border-[#5c4d3d] bg-[#0d0a08]/90 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]";

const filterBtnOn = "border-[#c9a227] bg-[#3d3428] text-[#f5e6c8]";
const filterBtnOff = "border-[#4a3f32] bg-[#1c1814] text-[#8a7d6b] hover:border-[#6b5c4a]";

interface EquipmentPanelProps {
  equipped: Record<string, EquippedEntry>;
  inventory: InventoryStack[];
  onEquipStack: (stackId: string, overrides?: { rolls?: number[]; enhancement?: number }) => void;
  onUpdateInventoryStack: (stackId: string, rolls: number[], enhancement: number) => void;
  onUpdateEquippedSlot: (slot: string, rolls: number[], enhancement: number) => void;
  onUnequipSlot: (slot: string) => void;
  onExtractStack: (stackId: string) => void;
  onExtractAll: () => void;
  onAddUniqueToBag: (slot: string, itemId: string, rolls: number[], enhancement: number) => void;
  stats: ComputedBuildStats;
  incomingDamage: number;
  nexusTier: number;
}

type Detail =
  | { kind: "equipped"; slot: string; entry: EquippedEntry }
  | { kind: "inventory"; stack: InventoryStack }
  | null;

function clampRollAtDef(def: EocUniqueDefinition | undefined, index: number, v: number): number {
  if (!def) return v;
  const b = rollBoundsForUnique(def)[index];
  if (!b) return v;
  const lo = Math.min(b.min, b.max);
  const hi = Math.max(b.min, b.max);
  return Math.min(hi, Math.max(lo, v));
}

function parseRollTextsToValues(def: EocUniqueDefinition, texts: string[]): number[] {
  const bounds = rollBoundsForUnique(def);
  return bounds.map((b, i) => {
    const lo = Math.min(b.min, b.max);
    const hi = Math.max(b.min, b.max);
    const fallback = (lo + hi) / 2;
    const t = (texts[i] ?? "").trim();
    const parsed = t === "" || t === "-" || t === "." || t === "-." ? NaN : Number(t);
    const v = Number.isFinite(parsed) ? parsed : fallback;
    return clampRollAtDef(def, i, v);
  });
}

function uniquesForPlannerSlot(plannerSlot: string) {
  if (plannerSlot === "Ring 1" || plannerSlot === "Ring 2") {
    return EOC_UNIQUE_DEFINITIONS.filter((u) => u.slot === "Ring");
  }
  return EOC_UNIQUE_DEFINITIONS.filter((u) => u.slot === plannerSlot);
}

export default function EquipmentPanel({
  equipped,
  inventory,
  onEquipStack,
  onUpdateInventoryStack,
  onUpdateEquippedSlot,
  onUnequipSlot,
  onExtractStack,
  onExtractAll,
  onAddUniqueToBag,
  stats,
  incomingDamage,
  nexusTier,
}: EquipmentPanelProps) {
  const [filter, setFilter] = useState<EquipmentFilter>("all");
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [detail, setDetail] = useState<Detail>(null);
  const [craftSlot, setCraftSlot] = useState<string>(EQUIPMENT_SLOTS[0] ?? "Helmet");
  const [craftSearch, setCraftSearch] = useState("");
  const [craftUniqueId, setCraftUniqueId] = useState<string>("");
  /** Raw text per roll so “-” / partial decimals are editable before blur. */
  const [craftRollTexts, setCraftRollTexts] = useState<string[]>([]);
  const [craftEnhancement, setCraftEnhancement] = useState(0);
  /** Draft rolls / enhancement in the center detail panel for the selected bag or worn unique. */
  const [detailRollTexts, setDetailRollTexts] = useState<string[]>([]);
  const [detailEnhancement, setDetailEnhancement] = useState(0);

  const filteredInventory = useMemo(() => {
    if (filter === "all") return inventory;
    return inventory.filter((s) => slotCategory(s.slot) === filter);
  }, [inventory, filter]);

  const invStacks = inventory.length;

  const leftSlots: { slot: string; glyph: string }[] = ["Helmet", "Chest", "Gloves", "Boots"].map((slot) => ({
    slot,
    glyph: plannerSlotToGlyphKey(slot),
  }));

  const craftableUniques = useMemo(() => {
    const q = craftSearch.trim().toLowerCase();
    const list = uniquesForPlannerSlot(craftSlot);
    if (!q) return list;
    return list.filter((u) => u.name.toLowerCase().includes(q));
  }, [craftSlot, craftSearch]);

  const craftDef = craftUniqueId ? EOC_UNIQUE_BY_ID[craftUniqueId] : undefined;

  const clampRollAt = useCallback((index: number, v: number) => {
    if (!craftDef) return v;
    const b = rollBoundsForUnique(craftDef)[index];
    if (!b) return v;
    const lo = Math.min(b.min, b.max);
    const hi = Math.max(b.min, b.max);
    return Math.min(hi, Math.max(lo, v));
  }, [craftDef]);
  const rightSlots: { slot: string; glyph: string }[] = ["Amulet", "Ring 1", "Ring 2", "Belt"].map((slot) => ({
    slot,
    glyph: plannerSlotToGlyphKey(slot),
  }));

  const syncDetailDraftFromEntry = useCallback((entry: EquippedEntry) => {
    const udef = isUniqueItemId(entry.itemId) ? EOC_UNIQUE_BY_ID[entry.itemId] : undefined;
    if (!udef) {
      setDetailRollTexts([]);
      setDetailEnhancement(0);
      return;
    }
    const bounds = rollBoundsForUnique(udef);
    const defaults = defaultRollsForUnique(udef);
    setDetailRollTexts(
      bounds.map((b, i) =>
        String(entry.rolls?.[i] ?? defaults[i] ?? (Math.min(b.min, b.max) + Math.max(b.min, b.max)) / 2)
      )
    );
    setDetailEnhancement(entry.enhancement ?? 0);
  }, []);

  const openEquippedDetail = useCallback(
    (slot: string) => {
      const entry = getEquippedEntry(equipped, slot);
      if (entry.itemId === "none") {
        setDetail(null);
        setDetailRollTexts([]);
        setDetailEnhancement(0);
        return;
      }
      setDetail({ kind: "equipped", slot, entry });
      syncDetailDraftFromEntry(entry);
    },
    [equipped, syncDetailDraftFromEntry]
  );

  const effectiveDetail = useMemo((): Detail => {
    if (!detail) return null;
    if (detail.kind === "equipped") {
      const cur = getEquippedEntry(equipped, detail.slot);
      if (cur.itemId === "none") return null;
      if (cur.itemId !== detail.entry.itemId) return null;
      return { kind: "equipped", slot: detail.slot, entry: cur };
    }
    const stack = inventory.find((s) => s.id === detail.stack.id);
    if (!stack) return null;
    return { kind: "inventory", stack };
  }, [detail, equipped, inventory]);

  const validSelectedInvId = useMemo(() => {
    if (!selectedInvId) return null;
    return inventory.some((s) => s.id === selectedInvId) ? selectedInvId : null;
  }, [selectedInvId, inventory]);

  const renderDetail = () => {
    if (!effectiveDetail) {
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <div className="h-16 w-16 shrink-0 rounded-sm border border-[#5c4d3d]/80 bg-[#0d0a08]" aria-hidden />
          <p className="max-w-[14rem] font-serif text-sm leading-snug text-[#9a8b78]">Select gear to inspect</p>
        </div>
      );
    }

    const slot = effectiveDetail.kind === "equipped" ? effectiveDetail.slot : effectiveDetail.stack.slot;
    const entry: EquippedEntry =
      effectiveDetail.kind === "equipped"
        ? effectiveDetail.entry
        : { itemId: effectiveDetail.stack.itemId, rolls: effectiveDetail.stack.rolls, enhancement: effectiveDetail.stack.enhancement };
    const itemId = entry.itemId;
    const item = getItemDefinition(slot, itemId);
    if (!item) return <p className="p-6 text-center font-serif text-sm text-[#8a7d6b]">Unknown item</p>;

    const mods = item.modifiers ?? {};
    const udef = isUniqueItemId(itemId) ? EOC_UNIQUE_BY_ID[itemId] : undefined;

    const mutedBtn = "rounded-sm border border-[#5c4d3d] bg-[#1c1814] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#c9baa8] hover:border-[#8b7355] hover:text-[#e8dcc8]";

    // ── Non-unique fallback ───────────────────────────────────────────────────
    if (!udef) {
      return (
        <div className="flex h-full max-h-[min(70vh,520px)] flex-col items-center gap-3 overflow-y-auto px-4 py-5 text-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-sm border border-[#5c4d3d] bg-[#0d0a08]">
            <EquippedItemIcon slot={slot} itemId={itemId} />
          </div>
          <h3 className={`font-serif text-lg tracking-wide ${item.rarity ? rarityTone[item.rarity] : "text-[#e8dcc8]"}`}>
            {item.name}
          </h3>
          <p className="text-xs uppercase tracking-widest text-[#7a6b5a]">{slot}</p>
          {Object.keys(mods).length > 0 && (
            <ul className="w-full max-w-xs space-y-1 text-left text-sm text-[#c4b5a0]">
              {Object.entries(mods).map(([k, v]) => (
                <li key={k} className="flex justify-between border-b border-[#2a2318] py-1">
                  <span className="capitalize text-[#8a7d6b]">{k}</span>
                  <span className="text-[#9fd4a8]">+{v}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
            {effectiveDetail.kind === "inventory" && (
              <button type="button" className={brassBtn} onClick={() => onEquipStack(effectiveDetail.stack.id)}>Equip</button>
            )}
            {effectiveDetail.kind === "equipped" && (
              <button type="button" className={brassBtn} onClick={() => onUnequipSlot(effectiveDetail.slot)}>Unequip</button>
            )}
          </div>
        </div>
      );
    }

    // ── Unique item: game-style tooltip ───────────────────────────────────────
    const parsedRolls = parseRollTextsToValues(udef, detailRollTexts);
    const resolved = resolveUniqueMods(udef, parsedRolls, detailEnhancement);
    const isWeapon = slot === "Weapon";
    const mx = maxEnhancementForUnique(udef);

    // Compute effective base stats from current rolls
    const resolvedTexts = [resolved.innateText, ...resolved.lineTexts].filter((t) => t.trim());
    const patch = equipmentModifiersFromUniqueTexts(resolvedTexts, { isWeapon });
    const baseStatRows: { label: string; value: string }[] = [];
    let weaponDamageByType: HitDamageTypeRow[] = [];
    if (isWeapon) {
      if (udef.baseDamageMin != null && udef.baseDamageMax != null) {
        const localPct = patch.localIncreasedPhysDamagePct ?? 0;
        const flatMin = (patch.flatDamageMin ?? 0) * 2;
        const flatMax = patch.flatDamageMax ?? 0;
        const effMin = Math.round(udef.baseDamageMin * (1 + localPct / 100) + flatMin);
        const effMax = Math.round(udef.baseDamageMax * (1 + localPct / 100) + flatMax);
        const fireR = localFlatDamageDisplayRange(patch.flatFireMin ?? 0, patch.flatFireMax ?? 0);
        const coldR = localFlatDamageDisplayRange(patch.flatColdMin ?? 0, patch.flatColdMax ?? 0);
        const lightningR = localFlatDamageDisplayRange(
          patch.flatLightningMin ?? 0,
          patch.flatLightningMax ?? 0
        );
        const chaosR = localFlatDamageDisplayRange(patch.flatChaosMin ?? 0, patch.flatChaosMax ?? 0);
        weaponDamageByType = buildHitDamageByType([
          { type: "physical", min: effMin, max: effMax },
          { type: "fire", min: fireR.min, max: fireR.max },
          { type: "cold", min: coldR.min, max: coldR.max },
          { type: "lightning", min: lightningR.min, max: lightningR.max },
          { type: "chaos", min: chaosR.min, max: chaosR.max },
        ]);
      }
      if (udef.baseCritChance != null) {
        const localCrit = patch.critChanceBonus ?? 0;
        baseStatRows.push({ label: "Base Critical Hit Chance", value: `${(udef.baseCritChance + localCrit).toFixed(0)}%` });
      }
      if (udef.baseAttackSpeed != null) {
        const localApsPct = patch.localIncreasedApsPct ?? 0;
        baseStatRows.push({ label: "Attack Speed", value: (udef.baseAttackSpeed * (1 + localApsPct / 100)).toFixed(2) });
      }
    } else {
      const localDefPct = patch.localIncreasedDefencesPct ?? 0;
      if (udef.baseArmour != null)
        baseStatRows.push({ label: "Armour", value: String(Math.round(udef.baseArmour * (1 + localDefPct / 100))) });
      if (udef.baseEvasion != null)
        baseStatRows.push({ label: "Evasion Rating", value: String(Math.round(udef.baseEvasion * (1 + localDefPct / 100))) });
      if (udef.baseEnergyShield != null)
        baseStatRows.push({ label: "Energy Shield", value: String(Math.round(udef.baseEnergyShield * (1 + localDefPct / 100))) });
      if (udef.baseBlockChance != null) {
        const block = udef.baseBlockChance * (1 + (patch.localIncreasedBlockPct ?? 0) / 100) + (patch.flatBlockChanceFromGear ?? 0);
        baseStatRows.push({ label: "Chance to Block", value: `${block.toFixed(0)}%` });
      }
    }

    // Inline piece renderer — ranges become editable inputs, rollIdx shared across all sections
    const rollIdx = { i: 0 };
    const renderPieces = (pieces: UniqueModPiece[]) =>
      pieces.map((p, pi) => {
        if (typeof p === "string") return <span key={pi}>{p}</span>;
        const ri = rollIdx.i++;
        const lo = Math.min(p.min, p.max);
        const hi = Math.max(p.min, p.max);
        const cur = detailRollTexts[ri] ?? String(Math.round((lo + hi) / 2));
        return (
          <input
            key={pi}
            type="text"
            inputMode="decimal"
            value={cur}
            style={{ width: `${Math.max(2, cur.replace("-", "").length + (cur.startsWith("-") ? 1.5 : 0.5))}ch` }}
            className="inline-block bg-transparent text-center text-[#c9a227] underline decoration-dotted outline-none focus:decoration-solid"
            onChange={(e) => {
              const val = e.target.value;
              setDetailRollTexts((prev) => { const n = [...prev]; while (n.length <= ri) n.push(""); n[ri] = val; return n; });
            }}
            onBlur={(e) => {
              const t = e.target.value.trim();
              const parsed = ["", "-", ".", "-."].includes(t) ? NaN : Number(t);
              const v = Number.isFinite(parsed) ? parsed : (lo + hi) / 2;
              const c = String(Math.min(hi, Math.max(lo, v)));
              setDetailRollTexts((prev) => { const n = [...prev]; while (n.length <= ri) n.push(""); n[ri] = c; return n; });
            }}
          />
        );
      });

    // Sub-label for each mod line
    const lineSubLabel = (pieces: UniqueModPiece[]) => {
      const local = pieces.some((p) => typeof p === "string" && /\blocal\b/i.test(p));
      const ranges = pieces.filter((p): p is { type: "range"; min: number; max: number } => typeof p !== "string");
      const locality = local ? "LOCAL" : "GLOBAL";
      if (ranges.length === 0) return `UNIQUE · ${locality}`;
      const rangeStr = ranges.map((r) => `${Math.min(r.min, r.max)}-${Math.max(r.min, r.max)}`).join(", ");
      return `UNIQUE · ${locality} · (${rangeStr})`;
    };

    const reqParts: string[] = [`Level ${udef.reqLevel}`];
    if (udef.reqStr != null) reqParts.push(`${udef.reqStr} Str`);
    if (udef.reqDex != null) reqParts.push(`${udef.reqDex} Dex`);
    if (udef.reqInt != null) reqParts.push(`${udef.reqInt} Int`);

    const typeLabel = `${udef.twoHanded ? "Two-Handed " : ""}${udef.itemType}`;

    const Divider = () => (
      <div className="relative my-1 flex items-center px-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#6b4e1a] to-[#6b4e1a]" />
        <div className="mx-1.5 h-1.5 w-1.5 rotate-45 bg-[#c9a227]/70" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-[#6b4e1a] to-[#6b4e1a]" />
      </div>
    );

    return (
      <div className="flex h-full max-h-[min(80vh,640px)] flex-col overflow-y-auto bg-[#0a0805] text-center">
        {/* ── Header ── */}
        <div className="px-4 pb-3 pt-4">
          <div className="relative mb-1 flex items-start justify-between">
            {/* Level badge */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#7a5c20] bg-[#1a1008] text-sm font-bold text-[#c9a870]">
              {udef.reqLevel}
            </div>
            {/* Name */}
            <h3 className="flex-1 px-2 font-serif text-xl font-bold uppercase tracking-widest text-[#d4af37]">
              {udef.name}
            </h3>
            {/* Icon */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <EquippedItemIcon slot={slot} itemId={itemId} />
            </div>
          </div>

          {/* Type */}
          <p className="text-[11px] uppercase tracking-widest text-[#7a6b5a]">
            Unique {typeLabel}
          </p>

          {/* Base stats */}
          {weaponDamageByType.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {weaponDamageByType.map((row) => (
                <p key={row.type} className="text-sm">
                  <span className="text-[#9a8b78]">{HIT_DAMAGE_TYPE_LABEL[row.type]}: </span>
                  <span className={`font-bold ${HIT_DAMAGE_TYPE_COLOR_CLASS[row.type]}`}>
                    {row.min}–{row.max}
                  </span>
                </p>
              ))}
            </div>
          )}
          {baseStatRows.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {baseStatRows.map(({ label, value }) => (
                <p key={label} className="text-sm">
                  <span className="text-[#9a8b78]">{label}: </span>
                  <span className="font-bold text-[#d4af37]">{value}</span>
                </p>
              ))}
            </div>
          )}

          {/* Requirements */}
          <p className="mt-2 text-[11px] text-[#5c5040]">Requires {reqParts.join(", ")}</p>

          {/* Enhancement slider */}
          {mx > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-[#6b5f50]">
                Enhancement +{udef.enhancementBonusPerLevel}%/lvl
              </span>
              <input
                type="range" min={0} max={mx} value={detailEnhancement}
                className="h-1 w-28 cursor-pointer accent-[#c9a227]"
                onChange={(e) => { const n = parseInt(e.target.value, 10); setDetailEnhancement(isNaN(n) ? 0 : Math.min(mx, Math.max(0, n))); }}
              />
              <span className="w-6 text-xs font-bold text-[#c9a870]">+{detailEnhancement}</span>
            </div>
          )}
        </div>

        <Divider />

        {/* ── Innate ── (resolved text has enhancement applied) */}
        {resolved.innateText.trim() && (
          <div className="px-6 py-2 text-sm font-semibold uppercase tracking-wide text-[#c9a227]">
            {resolved.innateText}
          </div>
        )}

        {/* ── Mod lines ── */}
        {udef.lines.map((line, i) => (
          <div key={i}>
            <Divider />
            <div className="px-4 py-1.5">
              <p className="mb-0.5 text-[9px] uppercase tracking-widest text-[#5c5040]">
                {lineSubLabel(line)}
              </p>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#e8dcc8]">
                {renderPieces(line)}
              </p>
            </div>
          </div>
        ))}

        {/* ── Action buttons ── */}
        <div className="mt-3 flex flex-col gap-2 px-4 pb-5">
          {effectiveDetail.kind === "inventory" && (
            <button type="button" className={brassBtn} onClick={() => {
              const rolls = parseRollTextsToValues(udef, detailRollTexts);
              onEquipStack(effectiveDetail.stack.id, { rolls, enhancement: detailEnhancement });
            }}>Equip</button>
          )}
          {effectiveDetail.kind === "inventory" && (
            <button type="button" className={mutedBtn} onClick={() => {
              const rolls = parseRollTextsToValues(udef, detailRollTexts);
              onUpdateInventoryStack(effectiveDetail.stack.id, rolls, detailEnhancement);
            }}>Update bag</button>
          )}
          {effectiveDetail.kind === "equipped" && (
            <button type="button" className={mutedBtn} onClick={() => {
              const rolls = parseRollTextsToValues(udef, detailRollTexts);
              onUpdateEquippedSlot(effectiveDetail.slot, rolls, detailEnhancement);
            }}>Apply worn</button>
          )}
          {effectiveDetail.kind === "equipped" && (
            <button type="button" className={brassBtn} onClick={() => onUnequipSlot(effectiveDetail.slot)}>Unequip</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`relative isolate z-0 min-w-0 overflow-x-auto ${panelFrame} p-3 sm:p-4`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* Left: paper doll */}
        <div className="flex w-full shrink-0 flex-col lg:w-[min(100%,280px)] lg:max-w-[280px]">
          <div className={`${panelFrame} overflow-hidden p-3`}>
            <div className="relative mx-auto flex max-w-[220px] justify-center gap-2 overflow-hidden">
              <div className="flex flex-col gap-2 pt-1">
                {leftSlots.map(({ slot, glyph }) => {
                  const id = getEquippedEntry(equipped, slot).itemId;
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`${slotBox} cursor-pointer outline-none ring-[#c9a227] focus-visible:ring-2`}
                      title={slot}
                      onClick={() => openEquippedDetail(slot)}
                    >
                      {id === "none" ? <EmptySlotIcon type={glyph} /> : <EquippedItemIcon slot={slot} itemId={id} />}
                      {id !== "none" && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[10px] text-[#e8dcc8]">
                          1
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex w-[72px] shrink-0 flex-col items-center justify-center overflow-hidden sm:w-[88px]">
                <div
                  className="h-44 w-full max-w-[72px] rounded-[40%] bg-gradient-to-b from-[#14110e] to-[#0a0806] shadow-[inset_0_0_20px_rgba(0,0,0,0.75)]"
                  style={{
                    clipPath: "ellipse(40% 46% at 50% 48%)",
                  }}
                  aria-hidden
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                {rightSlots.map(({ slot, glyph }) => {
                  const id = getEquippedEntry(equipped, slot).itemId;
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`${slotBox} cursor-pointer outline-none ring-[#c9a227] focus-visible:ring-2`}
                      title={slot}
                      onClick={() => openEquippedDetail(slot)}
                    >
                      {id === "none" ? <EmptySlotIcon type={glyph} /> : <EquippedItemIcon slot={slot} itemId={id} />}
                      {id !== "none" && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[10px] text-[#e8dcc8]">
                          1
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mx-auto mt-3 flex max-w-[200px] justify-center gap-3">
              {(["Weapon", "Off-hand"] as const).map((slot) => {
                const id = getEquippedEntry(equipped, slot).itemId;
                const glyph = plannerSlotToGlyphKey(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`${slotBox} !aspect-[4/3] w-[4.5rem] sm:w-[5rem] cursor-pointer outline-none ring-[#c9a227] focus-visible:ring-2`}
                    title={slot}
                    onClick={() => openEquippedDetail(slot)}
                  >
                    {id === "none" ? <EmptySlotIcon type={glyph} /> : <EquippedItemIcon slot={slot} itemId={id} />}
                    {id !== "none" && (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[10px] text-[#e8dcc8]">
                        1
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" className={`${brassBtn} mt-3 w-full py-3 text-sm`} onClick={() => setShowStats(true)}>
            Stats
          </button>
        </div>

        {/* Center: detail */}
        <div
          className={`min-h-[220px] min-w-0 flex-1 overflow-hidden ${panelFrame} font-serif`}
        >
          {renderDetail()}
        </div>

        {/* Right: inventory */}
        <div className="flex min-w-0 w-full flex-col lg:w-[min(100%,300px)] lg:max-w-[300px] lg:shrink-0">
          <div className={`${panelFrame} flex min-h-0 flex-1 flex-col overflow-hidden p-3`}>
            <div className="relative mb-3 flex min-h-[2.25rem] items-center justify-center border-b border-[#3d3428] pb-2">
              <button
                type="button"
                className="absolute left-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm border border-[#5c4d3d] bg-[#1c1814] text-sm text-[#c9a227] hover:border-[#8b7355]"
                aria-label="Help"
                onClick={() => setShowHelp(true)}
              >
                ?
              </button>
              <h2 className="pointer-events-none px-10 text-center font-serif text-base tracking-[0.15em] text-[#e8dcc8]">
                Inventory
              </h2>
            </div>
            <div className="grid max-h-[min(40vh,220px)] grid-cols-5 gap-1.5 overflow-y-auto overscroll-contain sm:gap-2">
              {filteredInventory.map((stack) => {
                const item = getItemDefinition(stack.slot, stack.itemId);
                const sel = validSelectedInvId === stack.id;
                return (
                  <button
                    key={stack.id}
                    type="button"
                    className={`${slotBox} !aspect-square w-full cursor-pointer outline-none ${
                      sel ? "ring-2 ring-[#c9a227]" : "focus-visible:ring-2 focus-visible:ring-[#c9a227]"
                    }`}
                    title={item?.name ?? stack.itemId}
                    onClick={() => {
                      setSelectedInvId(stack.id);
                      setDetail({ kind: "inventory", stack });
                      syncDetailDraftFromEntry({
                        itemId: stack.itemId,
                        rolls: stack.rolls,
                        enhancement: stack.enhancement,
                      });
                    }}
                  >
                    <EquippedItemIcon slot={stack.slot} itemId={stack.itemId} />
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[10px] text-[#e8dcc8]">
                      {stack.qty}
                    </span>
                  </button>
                );
              })}
              {filteredInventory.length === 0 && (
                <div className="col-span-5 py-8 text-center font-serif text-sm text-[#9a8b78]">No items</div>
              )}
            </div>
            <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-[#3d3428] pt-3">
              <div className="flex flex-wrap justify-center gap-1.5">
                {(
                  [
                    { id: "all" as const, label: "All" },
                    { id: "weapons" as const, label: "Weapons" },
                    { id: "armor" as const, label: "Armor" },
                    { id: "accessories" as const, label: "Accessories" },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={filter === id}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border text-[#a89070] ${filter === id ? filterBtnOn : filterBtnOff}`}
                    onClick={() => setFilter(id)}
                  >
                    <FilterIcon kind={id} />
                  </button>
                ))}
              </div>
              <div className="rounded-sm border border-[#4a3f32] bg-[#14100c] p-2 text-left">
                <div className="mb-2 font-serif text-[11px] uppercase tracking-wider text-[#c9a227]">
                  Add unique (1.1.0 list)
                </div>
                <label className="mb-0.5 block text-[10px] text-[#8a7d6b]">Slot</label>
                <select
                  className="mb-2 w-full rounded-sm border border-[#5c4d3d] bg-[#0d0a08] px-2 py-1.5 font-serif text-[11px] text-[#e8dcc8]"
                  value={craftSlot}
                  onChange={(e) => {
                    setCraftSlot(e.target.value);
                    setCraftUniqueId("");
                    setCraftRollTexts([]);
                    setCraftEnhancement(0);
                  }}
                >
                  {EQUIPMENT_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <label className="mb-0.5 block text-[10px] text-[#8a7d6b]">Search</label>
                <input
                  className="mb-2 w-full rounded-sm border border-[#5c4d3d] bg-[#0d0a08] px-2 py-1.5 font-serif text-[11px] text-[#e8dcc8] placeholder:text-[#5c5348]"
                  placeholder="Filter by name…"
                  value={craftSearch}
                  onChange={(e) => setCraftSearch(e.target.value)}
                />
                <label className="mb-0.5 block text-[10px] text-[#8a7d6b]">Unique</label>
                <select
                  className="mb-2 w-full rounded-sm border border-[#5c4d3d] bg-[#0d0a08] px-2 py-1.5 font-serif text-[11px] text-[#e8dcc8]"
                  value={craftUniqueId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCraftUniqueId(id);
                    const def = id ? EOC_UNIQUE_BY_ID[id] : undefined;
                    setCraftRollTexts(def ? defaultRollsForUnique(def).map(String) : []);
                    setCraftEnhancement(0);
                  }}
                >
                  <option value="">— Choose —</option>
                  {craftableUniques.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {craftDef && rollBoundsForUnique(craftDef).length > 0 && (
                  <div className="mb-2 max-h-48 space-y-2 overflow-y-auto pr-0.5">
                    {rollBoundsForUnique(craftDef).map((b, i) => {
                      const lo = Math.min(b.min, b.max);
                      const hi = Math.max(b.min, b.max);
                      const fallback = (lo + hi) / 2;
                      const label = rollLabelForIndex(craftDef, i);
                      const ph = `${lo} – ${hi}`;
                      const commitRollText = (raw: string) => {
                        const t = raw.trim();
                        const parsed = t === "" || t === "-" || t === "." || t === "-." ? NaN : Number(t);
                        const v = Number.isFinite(parsed) ? parsed : fallback;
                        const c = clampRollAt(i, v);
                        setCraftRollTexts((prev) => {
                          const next = [...prev];
                          while (next.length <= i) next.push(String(fallback));
                          next[i] = String(c);
                          return next;
                        });
                      };
                      return (
                        <div key={i}>
                          <label className="mb-0.5 block text-[10px] leading-snug text-[#a89070]">
                            {label}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className="w-full rounded-sm border border-[#5c4d3d] bg-[#0d0a08] px-2 py-1.5 font-mono text-[11px] text-[#e8dcc8] placeholder:text-[#5c5348]"
                            placeholder={ph}
                            value={craftRollTexts[i] ?? ""}
                            onChange={(e) => {
                              const t = e.target.value;
                              setCraftRollTexts((prev) => {
                                const next = [...prev];
                                while (next.length <= i) next.push(String(fallback));
                                next[i] = t;
                                return next;
                              });
                            }}
                            onBlur={(e) => {
                              commitRollText(e.target.value);
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {craftDef && (
                  <div className="mb-2">
                    <label className="mb-0.5 block text-[10px] text-[#8a7d6b]">
                      Enhancement (0–{maxEnhancementForUnique(craftDef)} · +{craftDef.enhancementBonusPerLevel}%
                      /lvl to first % in innate)
                    </label>
                    <input
                      type="number"
                      className="w-full rounded-sm border border-[#5c4d3d] bg-[#0d0a08] px-2 py-1.5 font-mono text-[11px] text-[#e8dcc8] placeholder:text-[#5c5348]"
                      placeholder={`0 – ${maxEnhancementForUnique(craftDef)}`}
                      min={0}
                      max={maxEnhancementForUnique(craftDef)}
                      step={1}
                      value={craftEnhancement}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        const mx = maxEnhancementForUnique(craftDef);
                        if (Number.isNaN(n)) {
                          setCraftEnhancement(0);
                          return;
                        }
                        setCraftEnhancement(Math.min(mx, Math.max(0, n)));
                      }}
                    />
                  </div>
                )}
                <button
                  type="button"
                  className={`${brassBtn} w-full py-2 text-[11px]`}
                  disabled={!craftUniqueId || invStacks >= INVENTORY_MAX_SLOTS}
                  onClick={() => {
                    if (!craftUniqueId) return;
                    const def = EOC_UNIQUE_BY_ID[craftUniqueId];
                    if (!def) return;
                    const bounds = rollBoundsForUnique(def);
                    const rolls = bounds.map((b, i) => {
                      const lo = Math.min(b.min, b.max);
                      const hi = Math.max(b.min, b.max);
                      const fallback = (lo + hi) / 2;
                      const t = (craftRollTexts[i] ?? "").trim();
                      const parsed =
                        t === "" || t === "-" || t === "." || t === "-." ? NaN : Number(t);
                      const v = Number.isFinite(parsed) ? parsed : fallback;
                      return clampRollAt(i, v);
                    });
                    onAddUniqueToBag(craftSlot, craftUniqueId, rolls, craftEnhancement);
                  }}
                >
                  {invStacks >= INVENTORY_MAX_SLOTS ? "Bag full" : "Add to bag"}
                </button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${brassBtn} disabled:opacity-40`}
                    disabled={!validSelectedInvId}
                    onClick={() => validSelectedInvId && onExtractStack(validSelectedInvId)}
                  >
                    Extract
                  </button>
                  <button type="button" className={brassBtn} onClick={onExtractAll}>
                    Extract all
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <div className="rounded-sm border border-[#5c4d3d] bg-[#0d0a08] px-2 py-1.5 font-mono text-[11px] tabular-nums text-[#d4c4a8]">
                    {invStacks}/{INVENTORY_MAX_SLOTS}
                  </div>
                </div>
              </div>
              <p className="text-center text-[10px] leading-relaxed text-[#7a6b5a]">
                Click a bag item to preview it in the center panel, adjust rolls or enhancement, then Equip or Update
                bag. Two-handed weapons clear off-hand when equipped.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showStats && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="equip-stats-title"
        >
          <div className={`max-h-[90vh] w-full max-w-4xl overflow-y-auto ${panelFrame} p-4`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="equip-stats-title" className="font-serif text-lg tracking-wide text-[#e8dcc8]">
                Character stats
              </h2>
              <button type="button" className={brassBtn} onClick={() => setShowStats(false)}>
                Close
              </button>
            </div>
            <div className="rounded-sm border border-[#3d3428] bg-[#0d0a08]/50 p-2">
              <EocStatsPanel stats={stats} incomingDamage={incomingDamage} nexusTier={nexusTier} />
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className={`w-full max-w-md ${panelFrame} p-5 font-serif text-[#c4b5a0]`}>
            <h2 className="mb-3 text-lg text-[#e8dcc8]">Equipment</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>
                Click a bag item to open it in the center panel; use Equip to wear it (swaps with that slot). Use
                Update bag to save roll or enhancement edits without equipping.
              </li>
              <li>
                Click worn gear to inspect or edit uniques (Apply worn), then Unequip to return it to your bag.
              </li>
              <li>Use filters to narrow the grid. Extract removes the selected stack; Extract all clears the bag.</li>
              <li>
                Two-handed weapons cannot share a row with off-hand; equipping one sends the other piece back to
                your bag.
              </li>
              <li>
                Unique enhancement (+10 max unless data says otherwise) adds the item&apos;s Enhancement Bonus
                to the first percentage in its innate line each level.
              </li>
            </ul>
            <button type="button" className={`${brassBtn} mt-4 w-full`} onClick={() => setShowHelp(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
