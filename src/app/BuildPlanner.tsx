"use client";

import { useState, useMemo } from 'react';
import ClassSelector from '../components/ClassSelector';
import EquipmentPanel from '../components/EquipmentPanel';
import StatsPanel from '../components/StatsPanel';
import UpgradesPanel from '../components/UpgradesPanel';
import BuildSummary from '../components/BuildSummary';
import FormulaViewer from '../components/FormulaViewer';
import { CLASSES } from '../data/classes';
import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS } from '../data/equipment';
import type { ItemModifiers } from '../data/equipment';
import { UPGRADES } from '../data/upgrades';
import { computeStats } from '../data/formulas';
import { NEXUS_TIER_ROWS } from '../data/nexusEnemyScaling';

function aggregateModifiers(items: Array<{ modifiers: ItemModifiers }>): ItemModifiers {
  const result: ItemModifiers = {};
  for (const item of items) {
    for (const [key, val] of Object.entries(item.modifiers) as [keyof ItemModifiers, number][]) {
      result[key] = (result[key] ?? 0) + val;
    }
  }
  return result;
}

export default function BuildPlanner() {
  const [selectedClass, setSelectedClass] = useState('warrior');
  const [equipped, setEquipped] = useState<Record<string, string>>({});
  const [activeUpgrades, setActiveUpgrades] = useState<string[]>([]);
  const [incomingDamage, setIncomingDamage] = useState(100);
  const [nexusTier, setNexusTier] = useState(0);

  const handleSelectClass = (classId: string) => {
    setSelectedClass(classId);
    setActiveUpgrades([]);
  };

  const handleEquip = (slot: string, itemId: string) => {
    setEquipped((prev) => ({ ...prev, [slot]: itemId }));
  };

  const handleToggleUpgrade = (upgradeId: string) => {
    setActiveUpgrades((prev) =>
      prev.includes(upgradeId) ? prev.filter((id) => id !== upgradeId) : [...prev, upgradeId]
    );
  };

  const stats = useMemo(() => {
    const cls = CLASSES.find((c) => c.id === selectedClass);
    const classBaseStats = cls?.baseStats ?? {};

    const equippedItems = EQUIPMENT_SLOTS.map((slot) => {
      const itemId = equipped[slot] ?? 'none';
      const items = EQUIPMENT_ITEMS[slot] ?? [];
      return items.find((i) => i.id === itemId) ?? { modifiers: {} };
    });
    const equipModifiers = aggregateModifiers(equippedItems);

    const classUpgrades = UPGRADES[selectedClass] ?? [];
    const activeUpgradeItems = classUpgrades.filter((u) => activeUpgrades.includes(u.id));
    const upgradeModifiers = aggregateModifiers(activeUpgradeItems);

    return computeStats(selectedClass, equipModifiers, upgradeModifiers, classBaseStats, {
      incomingDamage,
      nexusTier,
    });
  }, [selectedClass, equipped, activeUpgrades, incomingDamage, nexusTier]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-zinc-100">EOC Craft ⚙️</h1>
          <p className="text-zinc-500 text-xs mt-0.5">
            Theorycrafting Build Planner — Equipment • Classes • Upgrades • Formulas
          </p>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-zinc-100 font-semibold text-sm uppercase tracking-wider">Incoming hit damage</div>
                <div className="text-zinc-500 text-xs mt-1">
                  Armour DR, ailment preview (post-mit vs your life). Source: formulas/Armour.csv, Non-Damaging Ailment
                  Effect.csv.
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
                  Table from formulas/Nexus Tier Enemy Scaling.csv. Accuracy and evasion match sheet; use tier avg phys
                  as incoming damage if you like.
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column */}
          <div className="flex flex-col gap-4">
            <ClassSelector selectedClass={selectedClass} onSelectClass={handleSelectClass} />
            <UpgradesPanel
              selectedClass={selectedClass}
              activeUpgrades={activeUpgrades}
              onToggleUpgrade={handleToggleUpgrade}
            />
          </div>
          {/* Center column */}
          <div className="flex flex-col gap-4">
            <EquipmentPanel equipped={equipped} onEquip={handleEquip} />
            <StatsPanel stats={stats} />
          </div>
          {/* Right column */}
          <div className="flex flex-col gap-4">
            <BuildSummary
              selectedClass={selectedClass}
              equipped={equipped}
              activeUpgrades={activeUpgrades}
              stats={stats}
            />
          </div>
        </div>
        {/* Full-width formula viewer */}
        <div className="mt-4">
          <FormulaViewer />
        </div>
      </main>
    </div>
  );
}
