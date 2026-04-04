"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BuildSummary from "../components/BuildSummary";
import EocClassesPanel from "../components/EocClassesPanel";
import EocStatsPanel from "../components/EocStatsPanel";
import EquipmentPanel from "../components/EquipmentPanel";
import FormulaViewer from "../components/FormulaViewer";
import {
  DEFAULT_INVENTORY,
  EQUIPMENT_SLOTS,
  INVENTORY_MAX_SLOTS,
  getEquippedEntry,
  normalizeEquippedEntry,
  weaponUsesBothHands,
  type EquippedEntry,
  type InventoryStack,
} from "../data/equipment";
import { aggregateEquippedToEquipmentModifiers, computeBuildStats } from "../data/gameStats";
import { loadStoredPlanner, saveStoredPlanner } from "../lib/eocBuildStorage";
import { NEXUS_TIER_ROWS } from "../data/nexusEnemyScaling";

function equipmentModifiersFromEquippedMap(equipped: Record<string, EquippedEntry>) {
  return aggregateEquippedToEquipmentModifiers(EQUIPMENT_SLOTS, (slot) => getEquippedEntry(equipped, slot));
}

function stackIdentityKey(rolls: number[] | undefined, enhancement?: number): string {
  return JSON.stringify({ rolls: rolls ?? [], en: enhancement ?? 0 });
}

function addOrMergeStack(
  inv: InventoryStack[],
  slot: string,
  itemId: string,
  qty: number,
  rolls?: number[],
  enhancement?: number
): InventoryStack[] {
  const en = enhancement !== undefined && enhancement > 0 ? enhancement : undefined;
  const merge = inv.find(
    (s) =>
      s.slot === slot &&
      s.itemId === itemId &&
      stackIdentityKey(s.rolls, s.enhancement) === stackIdentityKey(rolls, en)
  );
  if (merge) {
    return inv.map((s) => (s.id === merge.id ? { ...s, qty: s.qty + qty } : s));
  }
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `st-${crypto.randomUUID()}`
      : `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: InventoryStack = { id, slot, itemId, qty };
  if (rolls?.length) row.rolls = rolls;
  if (en !== undefined) row.enhancement = en;
  return [...inv, row];
}

function migrateEquippedFromSave(raw: unknown): Record<string, EquippedEntry> {
  const out: Record<string, EquippedEntry> = {};
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const slot of EQUIPMENT_SLOTS) {
      out[slot] = normalizeEquippedEntry(o[slot]);
    }
    return out;
  }
  for (const slot of EQUIPMENT_SLOTS) {
    out[slot] = { itemId: "none" };
  }
  return out;
}

export default function BuildPlanner() {
  const [upgradeLevels, setUpgradeLevels] = useState<Record<string, number>>({});
  const [equipped, setEquipped] = useState<Record<string, EquippedEntry>>({});
  const [inventory, setInventory] = useState<InventoryStack[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const equipStateRef = useRef({ equipped, inventory });
  useLayoutEffect(() => {
    equipStateRef.current = { equipped, inventory };
  }, [equipped, inventory]);
  const [incomingDamage, setIncomingDamage] = useState(100);
  const [nexusTier, setNexusTier] = useState(0);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = loadStoredPlanner();
      if (saved) {
        setUpgradeLevels(saved.upgradeLevels);
        if (saved.equipped) setEquipped(migrateEquippedFromSave(saved.equipped));
        if (Object.prototype.hasOwnProperty.call(saved, "inventory")) {
          setInventory(saved.inventory ?? []);
        } else {
          setInventory(DEFAULT_INVENTORY.map((s) => ({ ...s })));
        }
      } else {
        setInventory(DEFAULT_INVENTORY.map((s) => ({ ...s })));
      }
      setHydrated(true);
    });
  }, []);

  const equipmentModifiers = useMemo(() => equipmentModifiersFromEquippedMap(equipped), [equipped]);

  const buildConfig = useMemo(
    () => ({ upgradeLevels, equipmentModifiers }),
    [upgradeLevels, equipmentModifiers]
  );

  const stats = useMemo(() => computeBuildStats(buildConfig), [buildConfig]);

  useEffect(() => {
    if (!hydrated) return;
    saveStoredPlanner({ ...buildConfig, equipped, inventory });
  }, [buildConfig, equipped, inventory, hydrated]);

  const updateInventoryStack = useCallback((stackId: string, rolls: number[], enhancement: number) => {
    setInventory((inv) =>
      inv.map((s) => {
        if (s.id !== stackId) return s;
        return {
          ...s,
          rolls: rolls.length ? rolls : undefined,
          enhancement: enhancement > 0 ? enhancement : undefined,
        };
      })
    );
  }, []);

  const updateEquippedSlot = useCallback((slot: string, rolls: number[], enhancement: number) => {
    setEquipped((e) => {
      const cur = getEquippedEntry(e, slot);
      if (cur.itemId === "none") return e;
      return {
        ...e,
        [slot]: {
          itemId: cur.itemId,
          rolls: rolls.length ? rolls : undefined,
          enhancement: enhancement > 0 ? enhancement : undefined,
        },
      };
    });
  }, []);

  const equipFromStack = useCallback(
    (stackId: string, overrides?: { rolls?: number[]; enhancement?: number }) => {
    const { equipped: e, inventory: inv } = equipStateRef.current;
    const stack = inv.find((s) => s.id === stackId);
    if (!stack || stack.qty < 1) return;
    const { slot, itemId } = stack;
    const rolls =
      overrides?.rolls !== undefined
        ? overrides.rolls.length
          ? overrides.rolls
          : undefined
        : stack.rolls;
    const enhancement =
      overrides?.enhancement !== undefined
        ? overrides.enhancement > 0
          ? overrides.enhancement
          : undefined
        : stack.enhancement !== undefined && stack.enhancement > 0
          ? stack.enhancement
          : undefined;
    const prev = getEquippedEntry(e, slot);
    let nextInv = inv
      .map((s) => (s.id === stackId ? { ...s, qty: s.qty - 1 } : s))
      .filter((s) => s.qty > 0);
    if (prev.itemId !== "none") {
      nextInv = addOrMergeStack(nextInv, slot, prev.itemId, 1, prev.rolls, prev.enhancement);
    }

    let nextEquipped: Record<string, EquippedEntry> = {
      ...e,
      [slot]: { itemId, rolls, enhancement },
    };

    if (slot === "Weapon" && weaponUsesBothHands(itemId)) {
      const off = getEquippedEntry(e, "Off-hand");
      if (off.itemId !== "none") {
        nextInv = addOrMergeStack(nextInv, "Off-hand", off.itemId, 1, off.rolls, off.enhancement);
      }
      nextEquipped = { ...nextEquipped, "Off-hand": { itemId: "none" } };
    }

    if (slot === "Off-hand") {
      const w = getEquippedEntry(e, "Weapon");
      if (w.itemId !== "none" && weaponUsesBothHands(w.itemId)) {
        nextInv = addOrMergeStack(nextInv, "Weapon", w.itemId, 1, w.rolls, w.enhancement);
        nextEquipped = { ...nextEquipped, Weapon: { itemId: "none" } };
      }
    }

    setEquipped(nextEquipped);
    setInventory(nextInv);
  },
  []
);

  const unequipSlot = useCallback((slot: string) => {
    const { equipped: e, inventory: inv } = equipStateRef.current;
    const cur = getEquippedEntry(e, slot);
    if (cur.itemId === "none") return;
    setEquipped({ ...e, [slot]: { itemId: "none" } });
    setInventory(addOrMergeStack(inv, slot, cur.itemId, 1, cur.rolls, cur.enhancement));
  }, []);

  const addUniqueToBag = useCallback(
    (slot: string, itemId: string, rolls: number[], enhancement: number) => {
      setInventory((inv) => {
        if (inv.length >= INVENTORY_MAX_SLOTS) return inv;
        return addOrMergeStack(
          inv,
          slot,
          itemId,
          1,
          rolls.length ? rolls : undefined,
          enhancement > 0 ? enhancement : undefined
        );
      });
    },
    []
  );

  const extractStack = useCallback((stackId: string) => {
    setInventory((inv) => inv.filter((s) => s.id !== stackId));
  }, []);

  const extractAll = useCallback(() => {
    if (typeof window !== "undefined" && !window.confirm("Remove every item from your bag?")) return;
    setInventory([]);
  }, []);

  const upgradeTotalPoints = useMemo(
    () => Object.values(upgradeLevels).reduce((a, b) => a + b, 0),
    [upgradeLevels]
  );
  const classesWithPoints = useMemo(() => {
    const ids = new Set<string>();
    for (const k of Object.keys(upgradeLevels)) {
      const [classId] = k.split("/");
      if (classId) ids.add(classId);
    }
    return ids.size;
  }, [upgradeLevels]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header id="planner-top" className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">EOC Craft ⚙️</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              Echoes of Creation — class trees from <code className="text-zinc-400">gameClasses.ts</code>, stats from{" "}
              <code className="text-zinc-400">computeBuildStats</code>
            </p>
          </div>
          <Link href="/battle" className="text-sm text-blue-400 hover:text-blue-300 shrink-0">
            Demo encounter →
          </Link>
        </div>
      </header>
      <main className="py-6">
        <div className="max-w-7xl mx-auto px-4 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-zinc-100 font-semibold text-sm uppercase tracking-wider">Incoming hit damage</div>
                <div className="text-zinc-500 text-xs mt-1">
                  Armour DR and non-damaging ailment preview use your EOC armour and life + ES pools.
                </div>
              </div>
              <div className="text-zinc-100 font-mono text-sm">{incomingDamage}</div>
            </div>
            <input
              className="mt-3 w-full accent-blue-500"
              type="range"
              min={1}
              max={5000}
              step={1}
              value={incomingDamage}
              onChange={(e) => setIncomingDamage(Number(e.target.value))}
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-600">
              <span>1</span>
              <span>5000</span>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div>
                <div className="text-zinc-100 font-semibold text-sm uppercase tracking-wider">Nexus tier (enemy ref.)</div>
                <div className="text-zinc-500 text-xs mt-1">
                  Hit chance / your evade vs table accuracy & evasion.
                </div>
              </div>
              <div className="text-zinc-100 font-mono text-sm">{nexusTier}</div>
            </div>
            <input
              className="w-full accent-amber-500"
              type="range"
              min={0}
              max={30}
              step={1}
              value={nexusTier}
              onChange={(e) => setNexusTier(Number(e.target.value))}
            />
            <div className="mt-2 text-xs text-zinc-500 space-y-0.5">
              {(() => {
                const row = NEXUS_TIER_ROWS[nexusTier];
                if (!row) return null;
                const avgPhys = Math.round((row.physMin + row.physMax) / 2);
                return (
                  <>
                    <div>
                      Phys hit {row.physMin}–{row.physMax} · avg {avgPhys}
                    </div>
                    <div>Enemy HP {row.health.toLocaleString()} · acc {row.accuracy} / eva {row.evasion}</div>
                    <button
                      type="button"
                      className="mt-2 text-amber-400/90 hover:text-amber-300 text-xs underline underline-offset-2"
                      onClick={() => setIncomingDamage(avgPhys)}
                    >
                      Set incoming damage to tier avg phys ({avgPhys})
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="w-full min-w-0 mb-4 px-2 sm:px-4 md:px-6 lg:px-10 xl:px-14">
          {hydrated ? (
            <EocClassesPanel upgradeLevels={upgradeLevels} onChangeUpgradeLevels={setUpgradeLevels} />
          ) : (
            <div
              className="rounded-xl border border-amber-950/80 bg-[#141019] h-[min(520px,70vh)] animate-pulse"
              aria-busy="true"
              aria-label="Loading class planner"
            />
          )}
        </div>
        <div className="max-w-7xl mx-auto px-4 flex flex-col gap-4">
          <div className="min-w-0 w-full">
            <EquipmentPanel
              equipped={equipped}
              inventory={inventory}
              onEquipStack={equipFromStack}
              onUpdateInventoryStack={updateInventoryStack}
              onUpdateEquippedSlot={updateEquippedSlot}
              onUnequipSlot={unequipSlot}
              onExtractStack={extractStack}
              onExtractAll={extractAll}
              onAddUniqueToBag={addUniqueToBag}
              stats={stats}
              incomingDamage={incomingDamage}
              nexusTier={nexusTier}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="min-w-0 lg:col-span-2">
              <EocStatsPanel stats={stats} incomingDamage={incomingDamage} nexusTier={nexusTier} />
            </div>
            <div className="min-w-0">
              <BuildSummary
                equipped={equipped}
                upgradeTotalPoints={upgradeTotalPoints}
                classesWithPoints={classesWithPoints}
                stats={stats}
              />
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <FormulaViewer />
        </div>
      </main>
    </div>
  );
}
