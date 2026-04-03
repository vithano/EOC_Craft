"use client";

import { UPGRADES } from '../data/upgrades';

interface UpgradesPanelProps {
  selectedClass: string;
  activeUpgrades: string[];
  onToggleUpgrade: (id: string) => void;
}

export default function UpgradesPanel({ selectedClass, activeUpgrades, onToggleUpgrade }: UpgradesPanelProps) {
  const upgrades = UPGRADES[selectedClass] ?? [];

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-zinc-100 font-semibold text-sm uppercase tracking-wider mb-4">
        <span>⬆️</span> Upgrades &amp; Skills
      </div>
      {upgrades.length === 0 ? (
        <p className="text-zinc-600 text-sm">Select a class to see upgrades.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {upgrades.map((upg) => {
            const isActive = activeUpgrades.includes(upg.id);
            return (
              <button
                key={upg.id}
                onClick={() => onToggleUpgrade(upg.id)}
                className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors cursor-pointer
                  ${isActive
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-zinc-800 hover:border-zinc-600'}`}
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold
                  ${isActive ? 'border-purple-500 bg-purple-500 text-white' : 'border-zinc-600 text-transparent'}`}>
                  ✓
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${isActive ? 'text-purple-300' : 'text-zinc-200'}`}>
                    {upg.name}
                  </div>
                  <div className="text-zinc-500 text-xs mt-0.5">{upg.description}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {Object.entries(upg.modifiers).map(([k, v]) => (
                      <span key={k} className="text-xs bg-zinc-800 text-emerald-400 px-1.5 py-0.5 rounded">
                        +{v} {k}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
