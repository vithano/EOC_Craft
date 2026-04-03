"use client";

import { useCallback, useMemo, useState } from "react";
import type { ComputedBuildStats } from "../data/gameStats";
import type { EquipmentFilter, InventoryStack, Rarity } from "../data/equipment";
import { getItemDefinition, INVENTORY_MAX_SLOTS, slotCategory } from "../data/equipment";
import EocStatsPanel from "./EocStatsPanel";

const rarityTone: Record<Rarity, string> = {
  common: "text-[#a8a29e]",
  uncommon: "text-[#6ee7b7]",
  rare: "text-[#7dd3fc]",
  epic: "text-[#d8b4fe]",
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
  equipped: Record<string, string>;
  inventory: InventoryStack[];
  onEquipStack: (stackId: string) => void;
  onUnequipSlot: (slot: string) => void;
  onExtractStack: (stackId: string) => void;
  onExtractAll: () => void;
  stats: ComputedBuildStats;
  incomingDamage: number;
  nexusTier: number;
}

type Detail =
  | { kind: "equipped"; slot: string; itemId: string }
  | { kind: "inventory"; stack: InventoryStack }
  | null;

function SlotGlyph({ type }: { type: string }) {
  const common = "h-6 w-6 opacity-[0.22] text-[#c4b5a0]";
  switch (type) {
    case "helmet":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3C8 3 5 6 5 10v3h2v-2c0-2.2 1.8-4 4-4s4 1.8 4 4v2h2v-3c0-4-3-7-7-7zm-5 13v2c0 1.7 1.3 3 3 3h8c1.7 0 3-1.3 3-3v-2H7z" />
        </svg>
      );
    case "chest":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 4h8l2 4v6H6V8l2-4zm-2 12h12v4H6v-4z" />
        </svg>
      );
    case "gloves":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M7 10c0-1.1.9-2 2-2h1v8H8c-1.1 0-2-.9-2-2v-4zm5-2h2c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2h-2V8zm-5 9h8v3H7v-3z" />
        </svg>
      );
    case "boots":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 18h8v2H8v-2zm-1-8l1 8H6l-2-6 3-2zm9 0l3 2-2 6h-2l1-8z" />
        </svg>
      );
    case "legs":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M9 4h6v4H9V4zm-2 6h10v10H7V10zm2 2v6h6v-6H9z" />
        </svg>
      );
    case "amulet":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 4l2 3h3l-2 3 2 3h-3l-2 3-2-3H7l2-3-2-3h3l2-3zm0 9a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      );
    case "ring":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 6a6 6 0 100 12 6 6 0 000-12zm0 2a4 4 0 110 8 4 4 0 010-8z" />
        </svg>
      );
    case "weapon":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M4 20l12-12 2 2L6 22H4v-2zm13-13l3-3 2 2-3 3-2-2z" />
        </svg>
      );
    case "shield":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2l8 3v7c0 5-3.5 9-8 10-4.5-1-8-5-8-10V5l8-3zm0 2.2L6 6.3V12c0 4 2.5 7 6 8 3.5-1 6-4 6-8V6.3L12 4.2z" />
        </svg>
      );
    default:
      return null;
  }
}

function ItemGlyph({ slot, itemId }: { slot: string; itemId: string }) {
  if (itemId === "none") return null;
  const hue =
    slot === "Weapon"
      ? "text-[#c0c0d8]"
      : slot === "Off-hand"
        ? "text-[#a89070]"
        : slot.includes("Ring") || slot === "Amulet"
          ? "text-[#9cf]"
          : "text-[#6b8f71]";
  if (slot === "Weapon" || slot === "Off-hand") {
    return slot === "Off-hand" ? (
      <svg className={`h-8 w-8 ${hue}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 3c2 0 4 1.5 4 4v9H8V7c0-2.5 2-4 4-4zm-4 15h8v2c0 1-1 2-2 2h-4c-1 0-2-1-2-2v-2z" />
      </svg>
    ) : (
      <svg className={`h-8 w-8 ${hue}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M5 19l10-10 2 2L7 21H5v-2zm11-11l3-3 1.5 1.5-3 3L16 8z" />
      </svg>
    );
  }
  return (
    <svg className={`h-7 w-7 ${hue}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 4h12v8l-3 8H9l-3-8V4zm2 2v5.5l2.5 7h5L16 11.5V6H8z" />
    </svg>
  );
}

export default function EquipmentPanel({
  equipped,
  inventory,
  onEquipStack,
  onUnequipSlot,
  onExtractStack,
  onExtractAll,
  stats,
  incomingDamage,
  nexusTier,
}: EquipmentPanelProps) {
  const [filter, setFilter] = useState<EquipmentFilter>("all");
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [detail, setDetail] = useState<Detail>(null);

  const filteredInventory = useMemo(() => {
    if (filter === "all") return inventory;
    return inventory.filter((s) => slotCategory(s.slot) === filter);
  }, [inventory, filter]);

  const invStacks = inventory.length;

  const leftSlots: { slot: string; glyph: string }[] = [
    { slot: "Helmet", glyph: "helmet" },
    { slot: "Chest", glyph: "chest" },
    { slot: "Gloves", glyph: "gloves" },
    { slot: "Boots", glyph: "boots" },
  ];
  const rightSlots: { slot: string; glyph: string }[] = [
    { slot: "Amulet", glyph: "amulet" },
    { slot: "Ring 1", glyph: "ring" },
    { slot: "Ring 2", glyph: "ring" },
    { slot: "Legs", glyph: "legs" },
  ];

  const openEquippedDetail = useCallback((slot: string) => {
    const itemId = equipped[slot] ?? "none";
    setDetail(itemId === "none" ? null : { kind: "equipped", slot, itemId });
  }, [equipped]);

  const effectiveDetail = useMemo((): Detail => {
    if (!detail) return null;
    if (detail.kind === "equipped") {
      const cur = equipped[detail.slot] ?? "none";
      if (cur === "none" || cur !== detail.itemId) return null;
      return detail;
    }
    const stack = inventory.find((s) => s.id === detail.stack.id);
    if (!stack) return null;
    return { kind: "inventory", stack };
  }, [detail, equipped, inventory]);

  const renderDetail = () => {
    if (!effectiveDetail) {
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <div
            className="h-16 w-16 shrink-0 rounded-sm border border-[#5c4d3d]/80 bg-[#0d0a08]"
            aria-hidden
          />
          <p className="max-w-[14rem] font-serif text-sm leading-snug text-[#9a8b78]">
            Select gear to inspect
          </p>
        </div>
      );
    }
    const slot = effectiveDetail.kind === "equipped" ? effectiveDetail.slot : effectiveDetail.stack.slot;
    const itemId = effectiveDetail.kind === "equipped" ? effectiveDetail.itemId : effectiveDetail.stack.itemId;
    const item = getItemDefinition(slot, itemId);
    if (!item) {
      return (
        <p className="p-6 text-center font-serif text-sm text-[#8a7d6b]">Unknown item</p>
      );
    }
    const mods = item.modifiers ?? {};
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-6 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-sm border border-[#5c4d3d] bg-[#0d0a08]">
          <ItemGlyph slot={slot} itemId={itemId} />
        </div>
        <div>
          <h3 className={`font-serif text-lg tracking-wide ${item.rarity ? rarityTone[item.rarity] : "text-[#e8dcc8]"}`}>
            {item.name}
          </h3>
          <p className="mt-1 text-xs uppercase tracking-widest text-[#7a6b5a]">{slot}</p>
        </div>
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
        {effectiveDetail.kind === "equipped" && (
          <button
            type="button"
            className={`${brassBtn} mt-2`}
            onClick={() => onUnequipSlot(effectiveDetail.slot)}
          >
            Unequip
          </button>
        )}
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
                  const id = equipped[slot] ?? "none";
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`${slotBox} cursor-pointer outline-none ring-[#c9a227] focus-visible:ring-2`}
                      title={slot}
                      onClick={() => openEquippedDetail(slot)}
                    >
                      {id === "none" ? <SlotGlyph type={glyph} /> : <ItemGlyph slot={slot} itemId={id} />}
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
                  const id = equipped[slot] ?? "none";
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`${slotBox} cursor-pointer outline-none ring-[#c9a227] focus-visible:ring-2`}
                      title={slot}
                      onClick={() => openEquippedDetail(slot)}
                    >
                      {id === "none" ? <SlotGlyph type={glyph} /> : <ItemGlyph slot={slot} itemId={id} />}
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
                const id = equipped[slot] ?? "none";
                const glyph = slot === "Weapon" ? "weapon" : "shield";
                return (
                  <button
                    key={slot}
                    type="button"
                    className={`${slotBox} !aspect-[4/3] w-[4.5rem] sm:w-[5rem] cursor-pointer outline-none ring-[#c9a227] focus-visible:ring-2`}
                    title={slot}
                    onClick={() => openEquippedDetail(slot)}
                  >
                    {id === "none" ? <SlotGlyph type={glyph} /> : <ItemGlyph slot={slot} itemId={id} />}
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
              <button
                type="button"
                title="Crafting (coming soon)"
                className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm border border-[#5c4d3d] bg-[#1c1814] text-[#a89070] hover:border-[#8b7355]"
                aria-label="Crafting"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M4 19h16v2H4v-2zm2-4h12l2 4H4l2-4zm2-8h8l2 4H6l2-4zm4-5l2 2h6v2H8V2l4 2z" />
                </svg>
              </button>
            </div>
            <div className="grid max-h-[min(40vh,220px)] grid-cols-5 gap-1.5 overflow-y-auto overscroll-contain sm:gap-2">
              {filteredInventory.map((stack) => {
                const item = getItemDefinition(stack.slot, stack.itemId);
                const sel = selectedInvId === stack.id;
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
                      onEquipStack(stack.id);
                    }}
                  >
                    <ItemGlyph slot={stack.slot} itemId={stack.itemId} />
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
                    { id: "all" as const, icon: "chest", label: "All" },
                    { id: "weapons" as const, icon: "sword", label: "Weapons" },
                    { id: "armor" as const, icon: "helm", label: "Armor" },
                    { id: "accessories" as const, icon: "neck", label: "Accessories" },
                  ] as const
                ).map(({ id, icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={filter === id}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border text-[#a89070] ${filter === id ? filterBtnOn : filterBtnOff}`}
                    onClick={() => setFilter(id)}
                  >
                    {icon === "chest" && (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M4 6h16v12H4V6zm2 2v8h12V8H6z" />
                      </svg>
                    )}
                    {icon === "sword" && (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M3 21l12-12 2 2L5 23H3v-2zm13-13l3-3 2 2-3 3-2-2z" />
                      </svg>
                    )}
                    {icon === "helm" && (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 4C8 4 5 7 5 11v2h2v-2c0-2 1.5-3.5 3.5-3.5S14 9 14 11v2h2v-2c0-4-3-7-7-7zm-4 15h8v1c0 1-.5 2-1.5 2h-5c-1 0-1.5-1-1.5-2v-1z" />
                      </svg>
                    )}
                    {icon === "neck" && (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 3l2 2h3l-1.5 2.5L18 12h-3l-1 2h-4l-1-2H6l2.5-4.5L7 5h3l2-2zm0 11a2 2 0 100 4 2 2 0 000-4z" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${brassBtn} disabled:opacity-40`}
                    disabled={!selectedInvId}
                    onClick={() => selectedInvId && onExtractStack(selectedInvId)}
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
                Click a bag item to equip. Click worn gear to inspect, then Unequip.
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
              <li>Click an inventory item to equip it to its slot (swaps with what you had worn).</li>
              <li>Click a worn piece to inspect it, then use Unequip to return it to your bag.</li>
              <li>Use filters to narrow the grid. Extract removes the selected stack; Extract all clears the bag.</li>
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
