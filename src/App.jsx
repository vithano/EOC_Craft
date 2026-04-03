import { useState, useMemo } from 'react';
import './App.css';
import ClassSelector from './components/ClassSelector';
import EquipmentPanel from './components/EquipmentPanel';
import StatsPanel from './components/StatsPanel';
import UpgradesPanel from './components/UpgradesPanel';
import BuildSummary from './components/BuildSummary';
import FormulaViewer from './components/FormulaViewer';
import { CLASSES } from './data/classes';
import { EQUIPMENT_SLOTS, EQUIPMENT_ITEMS } from './data/equipment';
import { UPGRADES } from './data/upgrades';
import { computeStats } from './data/formulas';

function aggregateModifiers(items) {
  const result = {};
  for (const item of items) {
    for (const [key, val] of Object.entries(item.modifiers || {})) {
      result[key] = (result[key] || 0) + val;
    }
  }
  return result;
}

export default function App() {
  const [selectedClass, setSelectedClass] = useState('warrior');
  const [equipped, setEquipped] = useState({});
  const [activeUpgrades, setActiveUpgrades] = useState([]);

  const handleSelectClass = (classId) => {
    setSelectedClass(classId);
    setActiveUpgrades([]);
  };

  const handleEquip = (slot, itemId) => {
    setEquipped((prev) => ({ ...prev, [slot]: itemId }));
  };

  const handleToggleUpgrade = (upgradeId) => {
    setActiveUpgrades((prev) =>
      prev.includes(upgradeId) ? prev.filter((id) => id !== upgradeId) : [...prev, upgradeId]
    );
  };

  const stats = useMemo(() => {
    const cls = CLASSES.find((c) => c.id === selectedClass);
    const classBaseStats = cls?.baseStats || {};

    const equippedItems = EQUIPMENT_SLOTS.map((slot) => {
      const itemId = equipped[slot] || 'none';
      const items = EQUIPMENT_ITEMS[slot] || [];
      return items.find((i) => i.id === itemId) || { modifiers: {} };
    });
    const equipModifiers = aggregateModifiers(equippedItems);

    const classUpgrades = UPGRADES[selectedClass] || [];
    const activeUpgradeItems = classUpgrades.filter((u) => activeUpgrades.includes(u.id));
    const upgradeModifiers = aggregateModifiers(activeUpgradeItems);

    return computeStats(selectedClass, equipModifiers, upgradeModifiers, classBaseStats);
  }, [selectedClass, equipped, activeUpgrades]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>EOC Craft ⚙️</h1>
          <p className="subtitle">Theorycrafting Build Planner — Equipment • Classes • Upgrades • Formulas</p>
        </div>
      </header>
      <div className="app-grid">
        <div className="col-left">
          <ClassSelector selectedClass={selectedClass} onSelectClass={handleSelectClass} />
          <UpgradesPanel
            selectedClass={selectedClass}
            activeUpgrades={activeUpgrades}
            onToggleUpgrade={handleToggleUpgrade}
          />
        </div>
        <div className="col-center">
          <EquipmentPanel equipped={equipped} onEquip={handleEquip} />
          <StatsPanel stats={stats} />
        </div>
        <div className="col-right">
          <BuildSummary
            selectedClass={selectedClass}
            equipped={equipped}
            activeUpgrades={activeUpgrades}
            stats={stats}
          />
        </div>
        <div className="col-full">
          <FormulaViewer />
        </div>
      </div>
    </div>
  );
}
