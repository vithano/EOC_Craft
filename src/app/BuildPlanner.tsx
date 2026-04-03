"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import BuildSummary from "../components/BuildSummary";
import EocClassesPanel from "../components/EocClassesPanel";
import EocStatsPanel from "../components/EocStatsPanel";
import EquipmentPanel from "../components/EquipmentPanel";
import FormulaViewer from "../components/FormulaViewer";
import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS } from "../data/equipment";
import type { ItemModifiers } from "../data/equipment";
import { aggregateItemModifiers, computeBuildStats } from "../data/gameStats";
import { loadStoredPlanner, saveStoredPlanner } from "../lib/eocBuildStorage";
import { NEXUS_TIER_ROWS } from "../data/nexusEnemyScaling";

function itemModifiersFromEquipped(equipped: Record<string, string>) {
  const equippedItems = EQUIPMENT_SLOTS.map((slot) => {
    const itemId = equipped[slot] ?? "none";
    const items = EQUIPMENT_ITEMS[slot] ?? [];
    return items.find((i) => i.id === itemId) ?? { modifiers: {} as ItemModifiers };
  });
  return aggregateItemModifiers(equippedItems);
}

export default function BuildPlanner() {
  const [upgradeLevels, setUpgradeLevels] = useState<Record<string, number>>({});
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  const [incomingDamage, setIncomingDamage] = useState(100);
  const [nexusTier, setNexusTier] = useState(0);

  useEffect(() => {
    const saved = loadStoredPlanner();
    if (saved) {
      setUpgradeLevels(saved.upgradeLevels);
      if (saved.equipped) setEquipped(saved.equipped);
    }
    setHydrated(true);
  }, []);

  const equipmentModifiers = useMemo(() => itemModifiersFromEquipped(equipped), [equipped]);

  const buildConfig = useMemo(
    () => ({ upgradeLevels, equipmentModifiers }),
    [upgradeLevels, equipmentModifiers]
  );

  const stats = useMemo(() => computeBuildStats(buildConfig), [buildConfig]);

  useEffect(() => {
    if (!hydrated) return;
    saveStoredPlanner({ ...buildConfig, equipped });
  }, [buildConfig, equipped, hydrated]);

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
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
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
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-4 min-w-0">
            <EquipmentPanel equipped={equipped} onEquip={(slot, id) => setEquipped((p) => ({ ...p, [slot]: id }))} />
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <EocStatsPanel stats={stats} incomingDamage={incomingDamage} nexusTier={nexusTier} />
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <BuildSummary
              equipped={equipped}
              upgradeTotalPoints={upgradeTotalPoints}
              classesWithPoints={classesWithPoints}
              stats={stats}
            />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <FormulaViewer />
        </div>
      </main>
    </div>
  );
}
