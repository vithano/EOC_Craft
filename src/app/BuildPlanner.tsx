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

    return computeStats(selectedClass, equipModifiers, upgradeModifiers, classBaseStats);
  }, [selectedClass, equipped, activeUpgrades]);

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
