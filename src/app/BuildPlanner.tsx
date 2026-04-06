"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AbilitiesPanel from "../components/AbilitiesPanel";
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
  migrateEquippedFromSave,
  weaponUsesBothHands,
  type EquippedEntry,
  type InventoryStack,
} from "../data/equipment";
import {
  aggregateEquippedToEquipmentModifiers,
  computeBuildStats,
  normalizeAbilitySelection,
  type AbilitySelectionState,
} from "../data/gameStats";
import { abilityMatchesWeapon, EOC_ABILITY_BY_ID, weaponAbilityTagFromItemId } from "../data/eocAbilities";
import {
  parseStoredPlannerJson,
  createEmptyBuild,
  loadBuildsState,
  saveBuildsState,
  type StoredBuild,
  type StoredPlannerPayload,
} from "../lib/eocBuildStorage";
import { NEXUS_TIER_ROWS } from "../data/nexusEnemyScaling";
import { useGameData } from "../contexts/GameDataContext";

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

export default function BuildPlanner() {
  const { loading: dataLoading, error: dataError, lastUpdated: sheetVersion } = useGameData();

  // --- Per-build state ---
  const [upgradeLevels, setUpgradeLevels] = useState<Record<string, number>>({});
  const [equipped, setEquipped] = useState<Record<string, EquippedEntry>>({});
  const [inventory, setInventory] = useState<InventoryStack[]>([]);
  const [ability, setAbility] = useState<AbilitySelectionState>({
    abilityId: null,
    abilityLevel: 0,
    attunementPct: 0,
  });

  // --- Multi-build state ---
  const [builds, setBuilds] = useState<StoredBuild[]>([]);
  const [activeBuildId, setActiveBuildId] = useState<string>("");
  const [editingBuildId, setEditingBuildId] = useState<string | null>(null);
  const [editingBuildName, setEditingBuildName] = useState("");

  const [hydrated, setHydrated] = useState(false);

  // Refs so effects can read current values without stale closures
  const equipStateRef = useRef({ equipped, inventory });
  const buildsRef = useRef<StoredBuild[]>([]);
  const activeBuildIdRef = useRef<string>("");

  useLayoutEffect(() => {
    equipStateRef.current = { equipped, inventory };
  }, [equipped, inventory]);
  useLayoutEffect(() => {
    buildsRef.current = builds;
  }, [builds]);
  useLayoutEffect(() => {
    activeBuildIdRef.current = activeBuildId;
  }, [activeBuildId]);

  const [incomingDamage, setIncomingDamage] = useState(100);
  const [nexusTier, setNexusTier] = useState(0);
  const [buildJsonImport, setBuildJsonImport] = useState("");
  const [buildJsonImportError, setBuildJsonImportError] = useState<string | null>(null);

  // Hydrate from multi-build storage (migrates old single-build saves automatically)
  useEffect(() => {
    queueMicrotask(() => {
      const state = loadBuildsState();
      setBuilds(state.builds);
      setActiveBuildId(state.activeBuildId);

      const active = state.builds.find((b) => b.id === state.activeBuildId);
      const saved = active?.payload ?? null;
      if (saved) {
        setUpgradeLevels(saved.upgradeLevels ?? {});
        if (saved.equipped) setEquipped(migrateEquippedFromSave(saved.equipped));
        if (Object.prototype.hasOwnProperty.call(saved, "inventory")) {
          setInventory(saved.inventory ?? []);
        } else {
          setInventory(DEFAULT_INVENTORY.map((s) => ({ ...s })));
        }
        if (saved.ability) setAbility(normalizeAbilitySelection(saved.ability));
      } else {
        setInventory(DEFAULT_INVENTORY.map((s) => ({ ...s })));
      }
      setHydrated(true);
    });
  }, []);

  const equipmentModifiers = useMemo(() => equipmentModifiersFromEquippedMap(equipped), [equipped, sheetVersion]);

  const weaponItemId = getEquippedEntry(equipped, "Weapon").itemId;

  /** Drop ability id when it does not match the current weapon; keep level / attunement. */
  const abilityForStats = useMemo((): AbilitySelectionState => {
    const tag = weaponAbilityTagFromItemId(weaponItemId);
    if (!ability.abilityId) return ability;
    const d = EOC_ABILITY_BY_ID[ability.abilityId];
    if (!d || !abilityMatchesWeapon(d, tag)) return { ...ability, abilityId: null };
    return ability;
  }, [weaponItemId, ability, sheetVersion]);

  const buildConfig = useMemo(
    () => ({
      upgradeLevels,
      equipmentModifiers,
      equippedWeaponItemId: weaponItemId,
      ability: abilityForStats,
      equipped,
    }),
    [upgradeLevels, equipmentModifiers, weaponItemId, abilityForStats, equipped]
  );

  const stats = useMemo(() => computeBuildStats(buildConfig), [buildConfig]);

  // Persist current build state without depending on builds/activeBuildId (uses refs to avoid loop)
  useEffect(() => {
    if (!hydrated) return;
    const payload: StoredPlannerPayload = { upgradeLevels, equipmentModifiers, ability, equipped, inventory };
    const currentBuilds = buildsRef.current;
    const currentId = activeBuildIdRef.current;
    if (!currentId || currentBuilds.length === 0) return;
    const updatedBuilds = currentBuilds.map((b) =>
      b.id === currentId ? { ...b, payload, updatedAt: Date.now() } : b
    );
    saveBuildsState({ builds: updatedBuilds, activeBuildId: currentId });
  }, [upgradeLevels, equipmentModifiers, ability, equipped, inventory, hydrated]);

  // --- Build management helpers ---

  const loadBuildPayload = useCallback((p: StoredPlannerPayload) => {
    setUpgradeLevels(p.upgradeLevels ?? {});
    setEquipped(p.equipped ? migrateEquippedFromSave(p.equipped) : {});
    if (Object.prototype.hasOwnProperty.call(p, "inventory")) {
      setInventory(p.inventory ?? []);
    } else {
      setInventory(DEFAULT_INVENTORY.map((s) => ({ ...s })));
    }
    setAbility(normalizeAbilitySelection(p.ability));
  }, []);

  const captureCurrentPayload = useCallback((): StoredPlannerPayload => ({
    upgradeLevels,
    equipmentModifiers,
    ability,
    equipped,
    inventory,
  }), [upgradeLevels, equipmentModifiers, ability, equipped, inventory]);

  const switchBuild = useCallback((id: string) => {
    if (id === activeBuildId) return;
    const updated = builds.map((b) =>
      b.id === activeBuildId ? { ...b, payload: captureCurrentPayload(), updatedAt: Date.now() } : b
    );
    const target = updated.find((b) => b.id === id);
    if (!target) return;
    setBuilds(updated);
    setActiveBuildId(id);
    loadBuildPayload(target.payload);
  }, [activeBuildId, builds, captureCurrentPayload, loadBuildPayload]);

  const createBuild = useCallback(() => {
    const name = `Build ${builds.length + 1}`;
    const newBuild = createEmptyBuild(name);
    setBuilds((prev) => [
      ...prev.map((b) =>
        b.id === activeBuildId ? { ...b, payload: captureCurrentPayload(), updatedAt: Date.now() } : b
      ),
      newBuild,
    ]);
    setActiveBuildId(newBuild.id);
    setUpgradeLevels({});
    setEquipped({});
    setInventory(DEFAULT_INVENTORY.map((s) => ({ ...s })));
    setAbility({ abilityId: null, abilityLevel: 0, attunementPct: 0 });
  }, [builds.length, activeBuildId, captureCurrentPayload]);

  const deleteBuild = useCallback((id: string) => {
    if (builds.length <= 1) return;
    const target = builds.find((b) => b.id === id);
    if (!window.confirm(`Delete "${target?.name ?? "this build"}"?`)) return;
    const remaining = builds.filter((b) => b.id !== id);
    if (id === activeBuildId) {
      const idx = builds.findIndex((b) => b.id === id);
      const next = remaining[Math.max(0, idx - 1)];
      setActiveBuildId(next.id);
      loadBuildPayload(next.payload);
    }
    setBuilds(remaining);
  }, [builds, activeBuildId, loadBuildPayload]);

  const commitRename = useCallback(() => {
    if (!editingBuildId) return;
    const trimmed = editingBuildName.trim();
    if (trimmed) setBuilds((prev) => prev.map((b) => b.id === editingBuildId ? { ...b, name: trimmed } : b));
    setEditingBuildId(null);
  }, [editingBuildId, editingBuildName]);

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

  const applyBuildJsonImport = useCallback(() => {
    setBuildJsonImportError(null);
    const trimmed = buildJsonImport.trim();
    if (!trimmed) {
      setBuildJsonImportError("Paste a JSON string first.");
      return;
    }
    const saved = parseStoredPlannerJson(trimmed);
    if (!saved) {
      setBuildJsonImportError("Could not parse JSON (invalid syntax or not an object).");
      return;
    }
    setUpgradeLevels(saved.upgradeLevels ?? {});
    setEquipped(migrateEquippedFromSave(saved.equipped));
    if (Object.prototype.hasOwnProperty.call(saved, "inventory")) {
      setInventory(saved.inventory ?? []);
    } else {
      setInventory(DEFAULT_INVENTORY.map((s) => ({ ...s })));
    }
    if (saved.ability) {
      setAbility(normalizeAbilitySelection(saved.ability));
    } else {
      setAbility({ abilityId: null, abilityLevel: 0, attunementPct: 0 });
    }
    setBuildJsonImport("");
  }, [buildJsonImport]);

  const copyBuildJsonToClipboard = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    const payload = {
      upgradeLevels,
      equipmentModifiers,
      ability,
      equipped,
      inventory,
    };
    void navigator.clipboard.writeText(JSON.stringify(payload));
  }, [upgradeLevels, equipmentModifiers, ability, equipped, inventory]);

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-[#07060c] text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <div className="font-cinzel text-amber-200/60 text-xs uppercase tracking-widest mb-1">Loading...</div>
          {dataError && <div className="text-red-400 text-xs mt-1">{dataError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07060c] text-zinc-100">
      <header id="planner-top" className="border-b border-amber-900/30 bg-[#0c0a12]/95 backdrop-blur sticky top-0 z-10 shadow-[0_2px_20px_rgba(0,0,0,0.7)]">
        <div className="max-w-7xl mx-auto px-3 py-2 sm:px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-cinzel text-amber-200 text-sm sm:text-base font-bold tracking-widest uppercase shrink-0">
              EOC Craft
            </h1>
            <span className="text-amber-900/60 hidden sm:block text-xs">⬥</span>
            <span className="hidden sm:block text-zinc-600 text-[11px] tracking-wide truncate">Echoes of Creation</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link href="/battle" className="text-[11px] text-amber-600/80 hover:text-amber-400 uppercase tracking-wider font-medium">
              Demo →
            </Link>
            <details className="text-xs border border-amber-900/30 rounded bg-[#12101a]/95 min-w-[min(100%,240px)]">
              <summary className="cursor-pointer select-none px-2.5 py-1.5 text-zinc-500 hover:text-zinc-300 list-inside text-[11px] tracking-wide">
                Import / Export Build
              </summary>
              <div className="px-2.5 pb-2.5 pt-1 border-t border-amber-900/30 space-y-1.5">
                <p className="text-[10px] text-zinc-600">
                  Paste a saved build JSON to restore, or copy current build to clipboard.
                </p>
                {hydrated ? (
                  <>
                    <textarea
                      className="w-full min-h-[88px] rounded-md border border-zinc-700 bg-zinc-950 text-zinc-200 text-[11px] font-mono p-1.5 resize-y sm:text-xs"
                      placeholder='{"upgradeLevels":{…},"equipmentModifiers":{…},…}'
                      value={buildJsonImport}
                      onChange={(e) => {
                        setBuildJsonImport(e.target.value);
                        setBuildJsonImportError(null);
                      }}
                      spellCheck={false}
                    />
                    {buildJsonImportError ? (
                      <p className="text-xs text-red-400" role="alert">
                        {buildJsonImportError}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5"
                        onClick={applyBuildJsonImport}
                      >
                        Apply import
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-600 hover:bg-zinc-800 text-zinc-200 text-xs font-medium px-3 py-1.5"
                        onClick={copyBuildJsonToClipboard}
                      >
                        Copy current to clipboard
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2" aria-busy="true" aria-label="Loading import controls">
                    <div className="w-full min-h-[88px] rounded-md border border-zinc-700 bg-zinc-900/50 animate-pulse" />
                    <div className="flex flex-wrap gap-2">
                      <div className="h-7 w-24 rounded-md bg-zinc-800 animate-pulse" />
                      <div className="h-7 w-40 rounded-md bg-zinc-800 animate-pulse" />
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="py-2 sm:py-3">
        {/* Build tabs */}
        {hydrated && (
          <div className="max-w-7xl mx-auto px-3 sm:px-4 mb-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {builds.map((b) => (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => switchBuild(b.id)}
                  onKeyDown={(e) => e.key === "Enter" && switchBuild(b.id)}
                  className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] flex-shrink-0 cursor-pointer select-none transition-colors ${
                    b.id === activeBuildId
                      ? "bg-amber-950/40 border-amber-700/50 text-amber-200 shadow-[0_0_10px_rgba(180,90,20,0.15)]"
                      : "bg-[#0f0d16] border-amber-900/20 text-zinc-500 hover:text-zinc-300 hover:border-amber-900/40"
                  }`}
                >
                  {editingBuildId === b.id ? (
                    <input
                      autoFocus
                      value={editingBuildName}
                      onChange={(e) => setEditingBuildName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditingBuildId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-transparent outline-none text-amber-200 w-24 min-w-0 font-cinzel font-bold"
                    />
                  ) : (
                    <span
                      className="font-cinzel font-bold tracking-wider"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (b.id === activeBuildId) {
                          setEditingBuildId(b.id);
                          setEditingBuildName(b.name);
                        }
                      }}
                    >
                      {b.name}
                    </span>
                  )}
                  {builds.length > 1 && editingBuildId !== b.id && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteBuild(b.id); }}
                      className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-zinc-500 hover:text-red-400 transition-opacity text-sm leading-none"
                      aria-label={`Delete ${b.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={createBuild}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded border border-dashed border-amber-900/30 text-zinc-600 hover:text-amber-400/80 hover:border-amber-800/50 text-[11px] transition-colors"
              >
                <span className="text-base leading-none">+</span>
                <span className="hidden sm:inline font-cinzel tracking-wider uppercase text-[10px]">New</span>
              </button>
            </div>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 mb-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <div className="bg-[#0f0d16] border border-amber-900/25 rounded-lg p-2.5 sm:p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="font-cinzel text-amber-200/80 text-[10px] uppercase tracking-widest font-bold">Incoming Hit Damage</div>
              <div className="text-amber-100 font-mono text-xs tabular-nums font-bold">{incomingDamage}</div>
            </div>
            <input
              className="w-full accent-blue-500"
              type="range"
              min={1}
              max={5000}
              step={1}
              value={incomingDamage}
              onChange={(e) => setIncomingDamage(Number(e.target.value))}
            />
            <div className="mt-0.5 flex justify-between text-[10px] text-zinc-700">
              <span>1</span>
              <span className="text-zinc-600 text-[9px]">Armour DR & ailment preview uses your pools</span>
              <span>5000</span>
            </div>
          </div>
          <div className="bg-[#0f0d16] border border-amber-900/25 rounded-lg p-2.5 sm:p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="font-cinzel text-amber-200/80 text-[10px] uppercase tracking-widest font-bold">Nexus Tier</div>
              <div className="text-amber-100 font-mono text-xs tabular-nums font-bold">{nexusTier}</div>
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
            <div className="mt-1 text-[10px] text-zinc-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {(() => {
                const row = NEXUS_TIER_ROWS[nexusTier];
                if (!row) return null;
                const avgPhys = Math.round((row.physMin + row.physMax) / 2);
                return (
                  <>
                    <span>Phys {row.physMin}–{row.physMax} · avg {avgPhys}</span>
                    <span>HP {row.health.toLocaleString("en-US")} · acc {row.accuracy} / eva {row.evasion}</span>
                    <button
                      type="button"
                      className="text-amber-500/80 hover:text-amber-400 underline underline-offset-2"
                      onClick={() => setIncomingDamage(avgPhys)}
                    >
                      Set to tier avg phys ({avgPhys})
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="w-full min-w-0 mb-2.5 px-3 sm:px-4 max-w-7xl mx-auto">
          {hydrated ? (
            <EocClassesPanel upgradeLevels={upgradeLevels} onChangeUpgradeLevels={setUpgradeLevels} />
          ) : (
            <div
              className="rounded-2xl border border-amber-950/80 bg-[#141019] h-[min(300px,46vh)] animate-pulse"
              aria-busy="true"
              aria-label="Loading class planner"
            />
          )}
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex flex-col gap-2.5">
          <div className="min-w-0 w-full">
            <AbilitiesPanel weaponItemId={weaponItemId} ability={abilityForStats} onChangeAbility={setAbility} />
          </div>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
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
        <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-2.5 pb-4">
          <FormulaViewer />
        </div>
      </main>
    </div>
  );
}
